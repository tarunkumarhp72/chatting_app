from sqlalchemy import Column, String, DateTime, UUID, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from app.db.session import Base
from datetime import datetime
import uuid

class Call(Base):
    __tablename__ = "calls"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(PGUUID(as_uuid=True), ForeignKey("conversations.id"))
    caller_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    callee_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(Enum("incoming", "outgoing", "accepted", "rejected", "ended", name="call_status"), default="incoming")
    sdp_offer = Column(Text, nullable=True)
    sdp_answer = Column(Text, nullable=True)
    ice_candidates = Column(JSONB, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)