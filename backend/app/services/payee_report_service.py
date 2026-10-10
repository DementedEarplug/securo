"""Top payees: where the money goes (or comes from), ranked by payee.

Uses the same "what counts" rules as the income/expenses report so the two
agree for the same window: posted rows on open accounts, no opening balances,
transfers / ignored / settlement rows excluded (`counts_as_user_pnl`),
bucketed by the reporting date the accounting mode picks, amounts in the
primary currency. Like that report, the non-owner shares of the user's own
group splits are subtracted when no account filter is applied.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.payee import Payee
from app.models.transaction import Transaction
from app.schemas.report import (
    PayeeReportBucket,
    PayeeReportItem,
    PayeeReportMeta,
    PayeeReportResponse,
)
from app.services._query_filters import counts_as_user_pnl, reporting_date_col
from app.services.admin_service import get_credit_card_accounting_mode
from app.services.fx_rate_service import convert


def previous_window(start: date, end: date) -> tuple[date, date]:
    """The same number of days immediately before ``start``."""
    length = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return prev_end - timedelta(days=length - 1), prev_end


async def _totals_by_payee(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    tx_type: str,
    start: date,
    end: date,
    account_ids: Optional[list[uuid.UUID]],
    primary_currency: str,
) -> dict[Optional[uuid.UUID], tuple[float, int]]:
    """``{payee_id or None: (total, count)}`` for one window."""
    accounting_mode = await get_credit_card_accounting_mode(session)
    report_date = reporting_date_col(accounting_mode)
    amount_expr = func.coalesce(Transaction.amount_primary, Transaction.amount)
    common = [
        Transaction.workspace_id == workspace_id,
        Transaction.type == tx_type,
        report_date >= start,
        report_date <= end,
        Transaction.source != "opening_balance",
        Transaction.status == "posted",
        counts_as_user_pnl(),
    ]
    acct_filter = [Transaction.account_id.in_(account_ids)] if account_ids is not None else []

    result = await session.execute(
        select(Transaction.payee_id, func.sum(amount_expr), func.count(Transaction.id))
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.is_closed.is_(False), *common, *acct_filter)
        .group_by(Transaction.payee_id)
    )
    totals: dict[Optional[uuid.UUID], tuple[float, int]] = {
        payee_id: (abs(float(total or 0)), int(count or 0)) for payee_id, total, count in result.all()
    }

    if account_ids is not None:
        # Same as income/expenses: the split offset is only applied to the
        # unfiltered view.
        return totals

    from app.models.group import Group, GroupMember
    from app.models.transaction_split import TransactionSplit

    own_member_ids = (
        select(GroupMember.id)
        .outerjoin(Group, Group.id == GroupMember.group_id)
        .where(
            or_(
                GroupMember.linked_user_id == user_id,
                and_(GroupMember.is_self.is_(True), Group.user_id == user_id),
            )
        )
    )
    offsets = await session.execute(
        select(Transaction.payee_id, Transaction.currency, func.sum(TransactionSplit.share_amount))
        .select_from(TransactionSplit)
        .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Account.is_closed.is_(False),
            Transaction.user_id == user_id,
            TransactionSplit.group_member_id.notin_(own_member_ids),
            *common,
        )
        .group_by(Transaction.payee_id, Transaction.currency)
    )
    for payee_id, currency, raw in offsets.all():
        if not raw or payee_id not in totals:
            continue
        converted, _ = await convert(session, Decimal(str(raw)), currency, primary_currency)
        total, count = totals[payee_id]
        totals[payee_id] = (max(0.0, total - abs(float(converted))), count)
    return totals


async def get_payee_report(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    start: date,
    end: date,
    currency: str,
    tx_type: str = "debit",
    account_ids: Optional[list[uuid.UUID]] = None,
    limit: int = 10,
) -> PayeeReportResponse:
    prev_start, prev_end = previous_window(start, end)
    current = await _totals_by_payee(
        session, workspace_id, user_id, tx_type, start, end, account_ids, currency
    )
    previous = await _totals_by_payee(
        session, workspace_id, user_id, tx_type, prev_start, prev_end, account_ids, currency
    )

    ranked_ids = [pid for pid, (total, _) in current.items() if pid is not None and total > 0]
    names: dict[uuid.UUID, str] = {}
    if ranked_ids:
        rows = await session.execute(
            select(Payee.id, Payee.name).where(
                Payee.id.in_(ranked_ids), Payee.workspace_id == workspace_id
            )
        )
        names = {pid: name for pid, name in rows.all()}

    items = sorted(
        (
            PayeeReportItem(
                payee_id=pid,
                name=names[pid],
                total=round(current[pid][0], 2),
                count=current[pid][1],
                previous_total=round(previous.get(pid, (0.0, 0))[0], 2),
            )
            for pid in ranked_ids
            if pid in names
        ),
        key=lambda item: (-item.total, item.name.lower()),
    )[:limit]

    unassigned_total, unassigned_count = current.get(None, (0.0, 0))
    return PayeeReportResponse(
        items=items,
        unassigned=PayeeReportBucket(
            total=round(unassigned_total, 2),
            count=unassigned_count,
            previous_total=round(previous.get(None, (0.0, 0))[0], 2),
        ),
        meta=PayeeReportMeta(
            currency=currency,
            type=tx_type,
            start_date=start,
            end_date=end,
            previous_start_date=prev_start,
            previous_end_date=prev_end,
        ),
    )
