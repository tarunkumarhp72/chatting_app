from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class ContactCreate(BaseModel):
    peer_id: UUID
    status: Optional[str] = "requested"

class ContactUpdate(BaseModel):
    status: str

class ContactResponse(BaseModel):
    owner_id: UUID
    peer_id: UUID
    status: str
    created_at: Optional[datetime] = None
