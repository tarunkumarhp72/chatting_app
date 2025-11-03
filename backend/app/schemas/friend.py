from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class FriendRequestCreate(BaseModel):
    receiver_id: UUID

class FriendRequestUpdate(BaseModel):
    status: str

class FriendRequestResponse(BaseModel):
    id: UUID
    sender_id: UUID
    receiver_id: UUID
    status: str
    created_at: Optional[datetime] = None
    sender: Optional[dict] = None
    receiver: Optional[dict] = None
