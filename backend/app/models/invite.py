from sqlalchemy import Column, String, DateTime, UUID, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class Invite(Base):
    __tablename__ = "invites"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    code = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)