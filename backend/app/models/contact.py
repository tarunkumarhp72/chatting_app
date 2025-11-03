from sqlalchemy import Column, String, DateTime, UUID, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class Contact(Base):
    __tablename__ = "contacts"
    
    owner_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    peer_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    status = Column(Enum("requested", "accepted", "blocked", name="contact_status"), default="requested")
    created_at = Column(DateTime, default=datetime.utcnow)