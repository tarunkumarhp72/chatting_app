from sqlalchemy import Column, DateTime, UUID, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class BlockedUser(Base):
    __tablename__ = "blocked_users"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    blocked_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint('blocker_id', 'blocked_user_id', name='unique_blocker_blocked'),
    )
    
    def __repr__(self):
        return f"<BlockedUser blocker_id={self.blocker_id} blocked_user_id={self.blocked_user_id}>"

