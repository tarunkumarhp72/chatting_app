from pydantic import BaseModel, field_serializer, field_validator, Field
try:
    # Pydantic v2
    from pydantic import AliasChoices
except Exception:  # pragma: no cover - fallback if environment differs
    AliasChoices = None
from typing import Optional, List, Union
from datetime import datetime
from uuid import UUID
from app.models.message import MessageType

class MessageBase(BaseModel):
    conversation_id: UUID
    # Accept both 'type' and legacy 'message_type' from clients
    type: MessageType = Field(default=MessageType.text, validation_alias=AliasChoices('type', 'message_type') if AliasChoices else 'type')
    text: Optional[str] = None
    emojis: Optional[str] = None  # Extracted emojis (can contain multiple)
    media_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[str] = None
    latitude: Optional[float] = None  # Location latitude
    longitude: Optional[float] = None  # Location longitude

    @property
    def message_type(self) -> MessageType:
        return self.type


class MessageCreate(MessageBase):
    sender_id: Optional[UUID] = None  # Optional - backend uses current_user.id for security

class MessageUpdate(BaseModel):
    pass

class MessageInDB(MessageBase):
    id: UUID
    sender_id: UUID
    delivered_to: List[UUID] = []
    read_by: List[UUID] = []
    deleted_for: List[UUID] = []
    deleted_for_everyone: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None  # Optional for backward compatibility with old records
    # Override file_size from Base to handle Integer from DB
    file_size: Optional[int] = None

    @field_validator('type', mode='before')
    @classmethod
    def set_default_message_type(cls, v):
        if v is None:
            return MessageType.text
        return v
    
    @field_validator('delivered_to', 'read_by', 'deleted_for', mode='before')
    @classmethod
    def validate_array_fields(cls, value):
        """Ensure array fields are always lists, not None or empty strings"""
        if value is None:
            return []
        if isinstance(value, str):
            # Handle empty PostgreSQL array representation "{}"
            if value == "{}" or value == "":
                return []
            # Try to parse if it's a string representation
            try:
                import ast
                return ast.literal_eval(value)
            except:
                return []
        if isinstance(value, list):
            return value
        return []
    
    @field_validator('file_size', mode='before')
    @classmethod
    def validate_file_size(cls, value: Union[int, str, None]) -> Optional[int]:
        """Validate and convert file_size to integer"""
        if value is None:
            return None
        
        # If it's already an integer, return as is
        if isinstance(value, int):
            return value
        
        # If it's a string (legacy data or formatted), try to parse it
        if isinstance(value, str):
            # If it's already a formatted string like "36.2 KB", we need to extract the number
            # But for now, if we get a string, it means old data format - return None
            # Or we could try to parse it, but for safety, return None
            import re
            match = re.search(r'([\d.]+)', value)
            if match:
                # Try to convert back to bytes estimate (not perfect, but better than failing)
                num = float(match.group(1))
                if 'MB' in value.upper():
                    return int(num * 1024 * 1024)
                elif 'KB' in value.upper():
                    return int(num * 1024)
                elif 'GB' in value.upper():
                    return int(num * 1024 * 1024 * 1024)
                else:
                    return int(num)
            return None
        
        # Try to convert to int
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
    
    @field_serializer('file_size')
    def serialize_file_size(self, value: Optional[int]) -> Optional[str]:
        """Convert file_size from integer (bytes) to formatted string"""
        if value is None:
            return None
        
        # Convert bytes to human-readable format
        if value < 1024:
            return f"{value} B"
        elif value < 1024 * 1024:
            return f"{value / 1024:.1f} KB"
        elif value < 1024 * 1024 * 1024:
            return f"{value / (1024 * 1024):.1f} MB"
        else:
            return f"{value / (1024 * 1024 * 1024):.1f} GB"
    
    @field_validator('updated_at', mode='before')
    @classmethod
    def validate_updated_at(cls, value: Union[datetime, None, str]) -> Optional[datetime]:
        """Validate updated_at, handling None values for old records"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                return None
        return None

    @field_validator('text', mode='before')
    @classmethod
    def validate_text(cls, value: Union[str, None]) -> Optional[str]:
        """Ensure text is properly handled as Unicode string"""
        if value is None:
            return None
        # If it's already a string, return as-is (Python 3 strings are Unicode)
        if isinstance(value, str):
            return value
        # If bytes, decode as UTF-8
        if isinstance(value, bytes):
            return value.decode('utf-8', errors='replace')
        # Convert to string
        return str(value)

    class Config:
        from_attributes = True

class MessageResponse(MessageInDB):
    pass
