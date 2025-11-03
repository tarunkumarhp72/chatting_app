from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, UUID as PGUUID
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from sqlalchemy.orm import relationship
from app.db.session import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String, unique=True, nullable=True)
    email = Column(String, unique=True, nullable=True)
    username = Column(String, unique=True, nullable=True)
    password_hash = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    last_seen = Column(DateTime, default=datetime.utcnow)
    discoverable = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)