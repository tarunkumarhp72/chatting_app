from sqlalchemy import Column, String, DateTime, UUID, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    from_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    type = Column(String, nullable=False)  # message, friend_request, etc.
    ref_id = Column(String, nullable=True) # e.g. message id, friend_request id
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    seen_at = Column(DateTime, nullable=True)