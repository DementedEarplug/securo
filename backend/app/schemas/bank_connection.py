import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class BankConnectionBase(BaseModel):
    provider: str
    institution_name: str


class ConnectionInstitutionRead(BaseModel):
    """One institution reached through a connection (issue #345). Distinct
    from InstitutionRead below, which is a provider's connectable-bank
    catalog entry, not a linked institution."""

    name: str
    logo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BankConnectionRead(BankConnectionBase):
    id: uuid.UUID
    user_id: uuid.UUID
    external_id: str
    display_name: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[dict] = None
    status: str
    last_sync_at: Optional[datetime] = None
    created_at: datetime
    # Institutions this link spans. Empty for providers that are one
    # institution per connection — institution_name above covers those.
    institutions: list[ConnectionInstitutionRead] = []

    model_config = ConfigDict(from_attributes=True)


class OAuthUrlRequest(BaseModel):
    provider: str = "pluggy"
    flow_params: Optional[dict] = None


class OAuthUrlResponse(BaseModel):
    url: str


class OAuthCallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None
    provider: Optional[str] = None
    sync_assets: Optional[bool] = None
    reconnect_connection_id: Optional[uuid.UUID] = None
    # Link without importing anything; the client then saves a selection
    # through PUT /connections/{id}/accounts, which runs the first import.
    select_accounts: bool = False


class ReauthUrlResponse(BaseModel):
    url: str


class InstitutionRead(BaseModel):
    name: str
    display_name: str
    country: str
    logo: Optional[str] = None
    bic: Optional[str] = None
    psu_types: list[str] = []
    max_consent_days: Optional[int] = None
    max_history_days: Optional[int] = None


class InstitutionListResponse(BaseModel):
    countries: list[str]
    institutions: list[InstitutionRead]


class ConnectTokenRequest(BaseModel):
    provider: str = "pluggy"


class ConnectTokenResponse(BaseModel):
    access_token: str


class ReconnectTokenResponse(BaseModel):
    access_token: str


class ConnectionSettingsUpdate(BaseModel):
    display_name: Optional[str] = None
    payee_source: Optional[Literal["auto", "merchant", "payment_data", "description", "none"]] = None
    import_pending: Optional[bool] = None
    sync_assets: Optional[bool] = None


class ConnectionAccountRead(BaseModel):
    """An account a connection can import, whether or not it is imported."""

    external_id: str
    name: str
    type: str
    currency: str
    balance: Optional[Decimal] = None
    masked_number: Optional[str] = None
    institution_name: Optional[str] = None
    included: bool
    # The imported account, if any. Set for an excluded account whose
    # history was kept.
    account_id: Optional[uuid.UUID] = None
    transaction_count: int = 0
    is_closed: bool = False


class ConnectionAccountsRead(BaseModel):
    accounts: list[ConnectionAccountRead]
    import_new_accounts: bool
    # Linked with select_accounts and nothing imported yet.
    awaiting_selection: bool


class ConnectionAccountsUpdate(BaseModel):
    # Provider external ids of the accounts to leave out.
    excluded: list[str] = Field(default_factory=list)
    import_new_accounts: bool = True
    # Excluded accounts whose imported account and transactions are deleted.
    # Others keep their history and simply stop syncing.
    remove_history: list[str] = Field(default_factory=list)
