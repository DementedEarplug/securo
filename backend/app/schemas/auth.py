import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    # Only set when the client asked for a long-lived session (`?remember=true`).
    refresh_token: Optional[str] = None
    refresh_token_expires_at: Optional[datetime] = None


class TwoFactorChallengeResponse(BaseModel):
    requires_2fa: Literal[True] = True
    temp_token: str
    available_methods: list[str]


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = Field(None, max_length=512)


class SessionRead(BaseModel):
    id: uuid.UUID
    device_name: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: datetime

    model_config = {"from_attributes": True}
