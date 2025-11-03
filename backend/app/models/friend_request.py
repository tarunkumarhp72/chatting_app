from sqlalchemy import Column, String, DateTime, UUID, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base   
from datetime import datetime
import uuid

class FriendRequest(Base):
    __tablename__ = "friend_requests"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    receiver_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(Enum("pending", "accepted", "rejected", "blocked", name="friend_request_status"), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)