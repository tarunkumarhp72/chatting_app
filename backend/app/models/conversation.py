from sqlalchemy import Column, String, DateTime, ARRAY, UUID, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(Enum("direct", "group", name="conversation_type"))
    members = Column(ARRAY(PGUUID(as_uuid=True)), nullable=False)
    admins = Column(ARRAY(PGUUID(as_uuid=True)), default=[])
    title = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    last_message = Column(Text, nullable=True)
    last_message_at = Column(DateTime, nullable=True)
    muted_by = Column(ARRAY(PGUUID(as_uuid=True)), default=[])
    created_at = Column(DateTime, default=datetime.utcnow)