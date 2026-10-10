"""GET /api/reports/payees: payees ranked by total for a window."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.payee import Payee
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.payee_report_service import previous_window

TODAY = date.today()
# A 10-day window ending today, and the 10 days before it.
WINDOW = {"start_date": (TODAY - timedelta(days=9)).isoformat(), "end_date": TODAY.isoformat()}
IN_WINDOW = TODAY - timedelta(days=2)
IN_PREVIOUS = TODAY - timedelta(days=12)
BEFORE_PREVIOUS = TODAY - timedelta(days=25)


def _payee(user: User, workspace_id: uuid.UUID, name: str) -> Payee:
    return Payee(id=uuid.uuid4(), user_id=user.id, workspace_id=workspace_id, name=name)


def _tx(
    user: User,
    account: Account,
    amount: str,
    day: date,
    payee: Payee | None = None,
    tx_type: str = "debit",
    **extra,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        account_id=account.id,
        payee_id=payee.id if payee else None,
        description=payee.name if payee else "No payee",
        amount=Decimal(amount),
        date=day,
        type=tx_type,
        source="manual",
        created_at=datetime.now(timezone.utc),
        **extra,
    )


async def _get(client: AsyncClient, headers: dict, **params):
    resp = await client.get("/api/reports/payees", headers=headers, params={**WINDOW, **params})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_previous_window_is_the_same_length_right_before():
    assert previous_window(date(2026, 3, 1), date(2026, 3, 31)) == (date(2026, 1, 29), date(2026, 2, 28))
    assert previous_window(date(2026, 3, 5), date(2026, 3, 5)) == (date(2026, 3, 4), date(2026, 3, 4))


@pytest.mark.asyncio
async def test_ranks_payees_by_total_with_counts_and_previous_totals(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    cafe = _payee(test_user, test_workspace.id, "Cafe")
    grocer = _payee(test_user, test_workspace.id, "Grocer")
    session.add_all([cafe, grocer])
    await session.flush()
    session.add_all(
        [
            _tx(test_user, test_account, "5.00", IN_WINDOW, cafe),
            _tx(test_user, test_account, "7.00", IN_WINDOW, cafe),
            _tx(test_user, test_account, "80.00", IN_WINDOW, grocer),
            _tx(test_user, test_account, "60.00", IN_PREVIOUS, grocer),
            _tx(test_user, test_account, "999.00", BEFORE_PREVIOUS, grocer),
            _tx(test_user, test_account, "30.00", IN_WINDOW),
            _tx(test_user, test_account, "4.00", IN_PREVIOUS),
        ]
    )
    await session.commit()

    body = await _get(client, auth_headers)

    assert [(i["name"], i["total"], i["count"], i["previous_total"]) for i in body["items"]] == [
        ("Grocer", 80.0, 1, 60.0),
        ("Cafe", 12.0, 2, 0.0),
    ]
    assert body["unassigned"] == {"total": 30.0, "count": 1, "previous_total": 4.0}
    meta = body["meta"]
    assert meta["type"] == "debit"
    assert (meta["start_date"], meta["end_date"]) == (WINDOW["start_date"], WINDOW["end_date"])
    assert meta["previous_end_date"] == (TODAY - timedelta(days=10)).isoformat()
    assert meta["previous_start_date"] == (TODAY - timedelta(days=19)).isoformat()


@pytest.mark.asyncio
async def test_limit_keeps_the_biggest(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    payees = [_payee(test_user, test_workspace.id, f"P{i}") for i in range(4)]
    session.add_all(payees)
    await session.flush()
    session.add_all([_tx(test_user, test_account, f"{(i + 1) * 10}.00", IN_WINDOW, p) for i, p in enumerate(payees)])
    await session.commit()

    body = await _get(client, auth_headers, limit=2)

    assert [i["name"] for i in body["items"]] == ["P3", "P2"]


@pytest.mark.asyncio
async def test_income_is_reported_separately_from_spending(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    employer = _payee(test_user, test_workspace.id, "Employer")
    shop = _payee(test_user, test_workspace.id, "Shop")
    session.add_all([employer, shop])
    await session.flush()
    session.add_all(
        [
            _tx(test_user, test_account, "3000.00", IN_WINDOW, employer, tx_type="credit"),
            _tx(test_user, test_account, "20.00", IN_WINDOW, shop),
        ]
    )
    await session.commit()

    spending = await _get(client, auth_headers)
    income = await _get(client, auth_headers, type="credit")

    assert [i["name"] for i in spending["items"]] == ["Shop"]
    assert [(i["name"], i["total"]) for i in income["items"]] == [("Employer", 3000.0)]
    assert income["meta"]["type"] == "credit"


@pytest.mark.asyncio
async def test_transfers_ignored_pending_and_opening_balances_do_not_count(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    shop = _payee(test_user, test_workspace.id, "Shop")
    ignored_category = Category(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id, name="Ignored", is_ignored=True
    )
    transfer_category = Category(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id, name="Invest", treat_as_transfer=True
    )
    session.add_all([shop, ignored_category, transfer_category])
    await session.flush()
    session.add_all(
        [
            _tx(test_user, test_account, "10.00", IN_WINDOW, shop),
            _tx(test_user, test_account, "100.00", IN_WINDOW, shop, transfer_pair_id=uuid.uuid4()),
            _tx(test_user, test_account, "200.00", IN_WINDOW, shop, is_ignored=True),
            _tx(test_user, test_account, "300.00", IN_WINDOW, shop, category_id=ignored_category.id),
            _tx(test_user, test_account, "400.00", IN_WINDOW, shop, category_id=transfer_category.id),
            _tx(test_user, test_account, "500.00", IN_WINDOW, shop, status="pending"),
            _tx(test_user, test_account, "600.00", IN_WINDOW, shop, exclude_from_pnl=True),
        ]
    )
    session.add(
        Transaction(
            id=uuid.uuid4(), user_id=test_user.id, account_id=test_account.id, payee_id=shop.id,
            description="Opening", amount=Decimal("700.00"), date=IN_WINDOW, type="debit",
            source="opening_balance", created_at=datetime.now(timezone.utc),
        )
    )
    await session.commit()

    body = await _get(client, auth_headers)

    assert [(i["name"], i["total"], i["count"]) for i in body["items"]] == [("Shop", 10.0, 1)]


@pytest.mark.asyncio
async def test_account_filter_and_closed_accounts(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    card = Account(id=uuid.uuid4(), user_id=test_user.id, name="Card", type="credit_card", balance=Decimal("0"), currency="BRL")
    closed = Account(
        id=uuid.uuid4(), user_id=test_user.id, name="Old", type="checking", balance=Decimal("0"), currency="BRL", is_closed=True
    )
    shop = _payee(test_user, test_workspace.id, "Shop")
    session.add_all([card, closed, shop])
    await session.flush()
    session.add_all(
        [
            _tx(test_user, test_account, "10.00", IN_WINDOW, shop),
            _tx(test_user, card, "25.00", IN_WINDOW, shop),
            _tx(test_user, closed, "1000.00", IN_WINDOW, shop),
        ]
    )
    await session.commit()

    everything = await _get(client, auth_headers)
    card_only = await _get(client, auth_headers, account_ids=str(card.id))

    assert everything["items"][0]["total"] == 35.0
    assert card_only["items"][0]["total"] == 25.0


@pytest.mark.asyncio
async def test_other_workspaces_are_not_included(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    other = Workspace(
        id=uuid.uuid4(), name="Side", kind="business", created_by_user_id=test_user.id, default_currency="BRL", locale="pt-BR"
    )
    session.add(other)
    await session.flush()
    session.add(WorkspaceMember(id=uuid.uuid4(), workspace_id=other.id, user_id=test_user.id, role="owner"))
    other_account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=other.id, name="Biz", type="checking",
        balance=Decimal("0"), currency="BRL",
    )
    mine = _payee(test_user, test_workspace.id, "Mine")
    theirs = _payee(test_user, other.id, "Theirs")
    session.add_all([other_account, mine, theirs])
    await session.flush()
    session.add_all(
        [
            _tx(test_user, test_account, "10.00", IN_WINDOW, mine),
            _tx(test_user, other_account, "99.00", IN_WINDOW, theirs, workspace_id=other.id),
        ]
    )
    await session.commit()

    personal = await _get(client, auth_headers)
    business = await _get(client, {**auth_headers, "X-Workspace-Id": str(other.id)})

    assert [i["name"] for i in personal["items"]] == ["Mine"]
    assert [i["name"] for i in business["items"]] == ["Theirs"]


@pytest.mark.asyncio
async def test_window_validation(client: AsyncClient, auth_headers: dict):
    future = (TODAY + timedelta(days=1)).isoformat()
    only_start = await client.get("/api/reports/payees", headers=auth_headers, params={"start_date": WINDOW["start_date"]})
    in_future = await client.get(
        "/api/reports/payees", headers=auth_headers, params={"start_date": WINDOW["start_date"], "end_date": future}
    )
    bad_type = await client.get("/api/reports/payees", headers=auth_headers, params={**WINDOW, "type": "transfer"})
    too_many = await client.get("/api/reports/payees", headers=auth_headers, params={**WINDOW, "limit": 51})

    assert [r.status_code for r in (only_start, in_future, bad_type, too_many)] == [422, 422, 422, 422]


@pytest.mark.asyncio
async def test_preset_window_ends_today(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/reports/payees", headers=auth_headers, params={"days": 7})

    assert resp.status_code == 200
    meta = resp.json()["meta"]
    assert meta["end_date"] == TODAY.isoformat()
    assert meta["start_date"] == (TODAY - timedelta(days=6)).isoformat()


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient):
    resp = await client.get("/api/reports/payees", params=WINDOW)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_split_shares_owed_by_others_are_taken_off(
    client: AsyncClient, session: AsyncSession, auth_headers: dict, test_user: User, test_workspace: Workspace, test_account: Account
):
    from app.models.group import Group, GroupMember
    from app.models.transaction_split import TransactionSplit

    restaurant = _payee(test_user, test_workspace.id, "Restaurant")
    group = Group(id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id, name="Trip")
    session.add_all([restaurant, group])
    await session.flush()
    me = GroupMember(id=uuid.uuid4(), group_id=group.id, workspace_id=test_workspace.id, name="Me", is_self=True)
    friend = GroupMember(id=uuid.uuid4(), group_id=group.id, workspace_id=test_workspace.id, name="Friend")
    dinner = _tx(test_user, test_account, "100.00", IN_WINDOW, restaurant)
    session.add_all([me, friend, dinner])
    await session.flush()
    session.add_all(
        [
            TransactionSplit(
                id=uuid.uuid4(), transaction_id=dinner.id, workspace_id=test_workspace.id,
                group_member_id=me.id, share_amount=Decimal("60.00"),
            ),
            TransactionSplit(
                id=uuid.uuid4(), transaction_id=dinner.id, workspace_id=test_workspace.id,
                group_member_id=friend.id, share_amount=Decimal("40.00"),
            ),
        ]
    )
    await session.commit()

    unfiltered = await _get(client, auth_headers)
    filtered = await _get(client, auth_headers, account_ids=str(test_account.id))

    # Only the user's own share is their spending, as in income/expenses;
    # like that report, the account-filtered view shows the full amount.
    assert unfiltered["items"][0]["total"] == 60.0
    assert filtered["items"][0]["total"] == 100.0
