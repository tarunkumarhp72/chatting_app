from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class ConversationResponse(BaseModel):
    id: UUID
    type: str
    members: List[UUID]
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    muted_by: Optional[List[UUID]] = None
