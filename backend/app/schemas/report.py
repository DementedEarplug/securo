import uuid
from datetime import date

from pydantic import BaseModel


class ReportBreakdown(BaseModel):
    key: str
    label: str
    value: float
    color: str


class ReportSummary(BaseModel):
    primary_value: float
    change_amount: float
    change_percent: float | None
    breakdowns: list[ReportBreakdown]


class ReportCompositionItem(BaseModel):
    key: str
    label: str
    value: float
    color: str
    group: str


class ReportDataPoint(BaseModel):
    date: str
    value: float
    breakdowns: dict[str, float]
    change: float | None = None
    composition: list[ReportCompositionItem] = []


class ReportMeta(BaseModel):
    type: str
    series_keys: list[str]
    currency: str
    interval: str
    forecast_start_date: str | None = None
    baseline_active: bool = False
    baseline_lookback_days: int | None = None


class CategoryTrendItem(BaseModel):
    key: str
    label: str
    color: str
    total: float
    group: str
    series: list[ReportDataPoint]


class ReportResponse(BaseModel):
    summary: ReportSummary
    trend: list[ReportDataPoint]
    meta: ReportMeta
    composition: list[ReportCompositionItem] = []
    category_trend: list[CategoryTrendItem] = []


class PayeeReportItem(BaseModel):
    payee_id: uuid.UUID
    name: str
    total: float
    count: int
    # Same-length window immediately before the requested one, so a client
    # can show whether spending with this payee is going up or down.
    previous_total: float


class PayeeReportBucket(BaseModel):
    total: float
    count: int
    previous_total: float


class PayeeReportMeta(BaseModel):
    currency: str
    type: str
    start_date: date
    end_date: date
    previous_start_date: date
    previous_end_date: date


class PayeeReportResponse(BaseModel):
    items: list[PayeeReportItem]
    # Transactions with no payee are kept out of the ranking (they are not a
    # merchant) and reported here, so totals still reconcile with the
    # income/expenses report for the same window.
    unassigned: PayeeReportBucket
    meta: PayeeReportMeta
