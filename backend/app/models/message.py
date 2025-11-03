from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Float
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy import Text
from app.db.session import Base
from datetime import datetime
import uuid
from enum import Enum


class MessageType(str, Enum):
    text = 'text'
    image = 'image'
    emoji = 'emoji'
    system = 'system'
    call = 'call'
    location = 'location'
    document = 'document'
    sticker = 'sticker'
    video = 'video'

class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    # Map Python attribute 'type' to DB enum column 'message_type'
    message_type = Column('message_type', SAEnum(MessageType, name='message_type', native_enum=True), nullable=False)
    text = Column(Text, nullable=True)  # Changed to Text to support Unicode/emoji better
    emojis = Column(Text, nullable=True)  # Store extracted emojis (multiple emojis as string)
    media_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    delivered_to = Column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    read_by = Column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    deleted_for = Column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    deleted_for_everyone = Column(String, nullable=True, default=None)  # Changed from Boolean to String to match DB (character varying)
    file_size = Column(Integer, nullable=True)
    latitude = Column(Float, nullable=True)  # Location latitude
    longitude = Column(Float, nullable=True)  # Location longitude
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
