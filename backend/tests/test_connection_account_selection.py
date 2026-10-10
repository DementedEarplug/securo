"""Choosing which of a connection's accounts are imported.

One SimpleFIN login usually covers a whole household. Account selection lets
each workspace link it and keep only its own accounts.
"""
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.asset import Asset
from app.models.bank_connection import BankConnection
from app.models.payee import Payee
from app.models.transaction import Transaction
from app.providers.base import AccountData, ConnectionData, HoldingData, TransactionData
from app.services.connection_service import (
    get_connection_accounts,
    handle_oauth_callback,
    sync_connection,
    update_connection_accounts,
)

MINE = AccountData(
    external_id="acc-mine", name="My Checking", type="checking",
    balance=Decimal("100"), currency="USD", institution_name="First Bank",
)
HERS = AccountData(
    external_id="acc-hers", name="Her Checking", type="checking",
    balance=Decimal("200"), currency="USD", institution_name="First Bank",
)


def _provider(accounts: list[AccountData]) -> AsyncMock:
    provider = AsyncMock()
    provider.action_required_warnings = []
    provider.handle_oauth_callback = AsyncMock(return_value=ConnectionData(
        external_id="sfin-1", institution_name="SimpleFIN",
        credentials={"token": "x"}, accounts=accounts,
    ))
    provider.refresh_credentials = AsyncMock(return_value={"token": "x"})
    provider.get_accounts = AsyncMock(return_value=accounts)
    provider.get_bills = AsyncMock(return_value=[])
    provider.get_holdings = AsyncMock(return_value=[])

    async def transactions(credentials, account_id, since, **kwargs):
        return [
            TransactionData(
                external_id=f"{account_id}-tx", description=f"COFFEE {account_id}",
                amount=Decimal("5"), date=date.today(), type="debit", currency="USD",
            )
        ]

    provider.get_transactions = AsyncMock(side_effect=transactions)
    return provider


@contextmanager
def _using(provider: AsyncMock):
    with patch("app.services.connection_service.get_provider", return_value=provider), \
         patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock), \
         patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock), \
         patch("app.services.connection_service.apply_rules_to_transaction", new_callable=AsyncMock):
        yield


async def _accounts(session: AsyncSession, connection_id: uuid.UUID) -> dict[str, Account]:
    rows = await session.execute(select(Account).where(Account.connection_id == connection_id))
    return {account.external_id: account for account in rows.scalars()}


async def _link(session, test_user, test_workspace, provider, *, select_accounts=True) -> BankConnection:
    with _using(provider):
        return await handle_oauth_callback(
            session, test_workspace.id, test_user.id, "token", "simplefin",
            select_accounts=select_accounts,
        )


async def _sync(session, connection, test_user, test_workspace):
    return await sync_connection(session, connection.id, test_workspace.id, test_user.id)


@pytest.mark.asyncio
async def test_linking_with_selection_imports_nothing_and_lists_the_accounts(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider)

    provider.get_transactions.assert_not_awaited()
    assert await _accounts(session, connection.id) == {}
    listing = await get_connection_accounts(session, connection.id, test_workspace.id)
    assert listing["awaiting_selection"] is True
    assert [(a["external_id"], a["included"], a["institution_name"]) for a in listing["accounts"]] == [
        ("acc-mine", True, "First Bank"),
        ("acc-hers", True, "First Bank"),
    ]


@pytest.mark.asyncio
async def test_linking_without_selection_still_imports_everything(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider, select_accounts=False)

    assert set(await _accounts(session, connection.id)) == {"acc-mine", "acc-hers"}
    listing = await get_connection_accounts(session, connection.id, test_workspace.id)
    assert listing["awaiting_selection"] is False


@pytest.mark.asyncio
async def test_scheduled_sync_waits_for_the_selection(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider)

    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    provider.get_accounts.assert_not_awaited()
    assert await _accounts(session, connection.id) == {}


@pytest.mark.asyncio
async def test_first_selection_imports_only_the_chosen_accounts_with_full_history(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider)

    connection, needs_import = await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=["acc-hers"], import_new_accounts=True, remove_history=[],
    )
    assert needs_import is True
    with _using(provider):
        connection, _ = await _sync(session, connection, test_user, test_workspace)

    imported = await _accounts(session, connection.id)
    assert set(imported) == {"acc-mine"}
    fetched = [call.args[1:3] for call in provider.get_transactions.await_args_list]
    assert fetched == [("acc-mine", None)]
    assert connection.settings["excluded_accounts"] == ["acc-hers"]
    assert "awaiting_account_selection" not in connection.settings
    assert "backfill_accounts" not in connection.settings


@pytest.mark.asyncio
async def test_excluded_account_holdings_are_skipped(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    provider.get_holdings = AsyncMock(return_value=[
        HoldingData(external_id="h-mine", name="My Fund", currency="USD",
                    current_value=Decimal("10"), account_external_id="acc-mine"),
        HoldingData(external_id="h-hers", name="Her Fund", currency="USD",
                    current_value=Decimal("20"), account_external_id="acc-hers"),
    ])
    connection = await _link(session, test_user, test_workspace, provider)
    await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=["acc-hers"], import_new_accounts=True, remove_history=[],
    )

    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    synced = (await session.execute(select(Asset.external_id))).scalars().all()
    assert synced == ["h-mine"]


@pytest.mark.asyncio
async def test_new_accounts_can_wait_for_opt_in(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE])
    connection = await _link(session, test_user, test_workspace, provider)
    await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=[], import_new_accounts=False, remove_history=[],
    )
    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    # The bank now also returns an account the user has not seen.
    provider.get_accounts = AsyncMock(return_value=[MINE, HERS])
    with _using(provider):
        connection, _ = await _sync(session, connection, test_user, test_workspace)

    assert set(await _accounts(session, connection.id)) == {"acc-mine"}
    assert connection.settings["excluded_accounts"] == ["acc-hers"]
    listing = await get_connection_accounts(session, connection.id, test_workspace.id)
    assert {a["external_id"]: a["included"] for a in listing["accounts"]} == {
        "acc-mine": True, "acc-hers": False,
    }


@pytest.mark.asyncio
async def test_new_accounts_are_imported_by_default(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE])
    connection = await _link(session, test_user, test_workspace, provider, select_accounts=False)

    provider.get_accounts = AsyncMock(return_value=[MINE, HERS])
    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    assert set(await _accounts(session, connection.id)) == {"acc-mine", "acc-hers"}


@pytest.mark.asyncio
async def test_excluding_an_imported_account_can_keep_its_history(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider, select_accounts=False)

    connection, needs_import = await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=["acc-hers"], import_new_accounts=True, remove_history=[],
    )
    assert needs_import is False

    provider.get_accounts = AsyncMock(return_value=[
        MINE, AccountData(**{**HERS.__dict__, "balance": Decimal("999")}),
    ])
    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    hers = (await _accounts(session, connection.id))["acc-hers"]
    assert hers.balance == Decimal("200")
    listing = await get_connection_accounts(session, connection.id, test_workspace.id)
    kept = next(a for a in listing["accounts"] if a["external_id"] == "acc-hers")
    assert kept["included"] is False
    assert kept["account_id"] == hers.id
    assert kept["transaction_count"] >= 1


@pytest.mark.asyncio
async def test_excluding_an_imported_account_can_remove_its_history(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider, select_accounts=False)
    accounts = await _accounts(session, connection.id)
    hers, mine = accounts["acc-hers"], accounts["acc-mine"]
    hers_id, mine_id = hers.id, mine.id

    payee = Payee(id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id, name="Her Gym")
    session.add(payee)
    pair_id = uuid.uuid4()
    for account, payee_id in ((hers, payee.id), (mine, None)):
        session.add(Transaction(
            id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
            account_id=account.id, description="Transfer", amount=Decimal("50"),
            date=date.today(), type="debit" if account is hers else "credit",
            source="sync", payee_id=payee_id, transfer_pair_id=pair_id,
            created_at=datetime.now(timezone.utc),
        ))
    await session.commit()

    await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=["acc-hers"], import_new_accounts=True, remove_history=["acc-hers"],
    )

    assert set(await _accounts(session, connection.id)) == {"acc-mine"}
    left = (await session.execute(
        select(Transaction).where(Transaction.account_id == hers_id)
    )).scalars().all()
    assert left == []
    assert await session.get(Payee, payee.id) is None
    my_leg = (await session.execute(
        select(Transaction).where(Transaction.account_id == mine_id, Transaction.description == "Transfer")
    )).scalar_one()
    assert my_leg.transfer_pair_id is None
    listing = await get_connection_accounts(session, connection.id, test_workspace.id)
    assert {a["external_id"]: a["account_id"] is None for a in listing["accounts"]} == {
        "acc-mine": False, "acc-hers": True,
    }


@pytest.mark.asyncio
async def test_opting_an_account_back_in_fetches_its_full_history(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider)
    await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=["acc-hers"], import_new_accounts=True, remove_history=[],
    )
    with _using(provider):
        await _sync(session, connection, test_user, test_workspace)

    connection, needs_import = await update_connection_accounts(
        session, connection.id, test_workspace.id,
        excluded=[], import_new_accounts=True, remove_history=[],
    )
    assert needs_import is True
    assert connection.settings["backfill_accounts"] == ["acc-hers"]
    provider.get_transactions.reset_mock()
    with _using(provider):
        connection, _ = await _sync(session, connection, test_user, test_workspace)

    since = {call.args[1]: call.args[2] for call in provider.get_transactions.await_args_list}
    assert since["acc-hers"] is None
    assert since["acc-mine"] is not None
    assert set(await _accounts(session, connection.id)) == {"acc-mine", "acc-hers"}
    assert "backfill_accounts" not in connection.settings


@pytest.mark.asyncio
async def test_selection_rejects_unknown_accounts_and_removing_included_ones(
    session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider, select_accounts=False)

    with pytest.raises(ValueError, match="Unknown accounts"):
        await update_connection_accounts(
            session, connection.id, test_workspace.id,
            excluded=["nope"], import_new_accounts=True, remove_history=[],
        )
    with pytest.raises(ValueError, match="Only excluded"):
        await update_connection_accounts(
            session, connection.id, test_workspace.id,
            excluded=[], import_new_accounts=True, remove_history=["acc-hers"],
        )


@pytest.mark.asyncio
async def test_connections_linked_before_snapshots_list_their_imported_accounts(
    session: AsyncSession, test_user, test_workspace, test_connection: BankConnection, test_account: Account
):
    listing = await get_connection_accounts(session, test_connection.id, test_workspace.id)

    assert [(a["external_id"], a["included"], a["account_id"]) for a in listing["accounts"]] == [
        (test_account.external_id, True, test_account.id),
    ]
    assert listing["import_new_accounts"] is True


@pytest.mark.asyncio
async def test_accounts_api_lists_and_saves_a_selection(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user, test_workspace
):
    provider = _provider([MINE, HERS])
    connection = await _link(session, test_user, test_workspace, provider)

    listed = await client.get(f"/api/connections/{connection.id}/accounts", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["awaiting_selection"] is True
    assert [a["name"] for a in listed.json()["accounts"]] == ["My Checking", "Her Checking"]

    with _using(provider):
        saved = await client.put(
            f"/api/connections/{connection.id}/accounts",
            headers=auth_headers,
            json={"excluded": ["acc-hers"], "import_new_accounts": False},
        )
    assert saved.status_code == 200
    assert saved.json()["settings"]["excluded_accounts"] == ["acc-hers"]
    assert saved.json()["settings"]["import_new_accounts"] is False
    assert saved.json()["last_sync_at"] is not None

    bad = await client.put(
        f"/api/connections/{connection.id}/accounts",
        headers=auth_headers,
        json={"excluded": ["nope"]},
    )
    assert bad.status_code == 400
    missing = await client.get(f"/api/connections/{uuid.uuid4()}/accounts", headers=auth_headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_callback_api_accepts_select_accounts(
    client: AsyncClient, auth_headers, test_workspace
):
    provider = _provider([MINE, HERS])
    with _using(provider):
        resp = await client.post(
            "/api/connections/oauth/callback",
            headers=auth_headers,
            json={"code": "token", "provider": "simplefin", "select_accounts": True},
        )
    assert resp.status_code == 200
    assert resp.json()["settings"]["awaiting_account_selection"] is True
    provider.get_transactions.assert_not_awaited()
