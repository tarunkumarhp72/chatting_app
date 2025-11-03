from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional, List, Union
from datetime import datetime
from uuid import UUID
import re

class UserBase(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    discoverable: bool = True

class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=8)
    
    @validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        if v.startswith('_') or v.endswith('_'):
            raise ValueError('Username cannot start or end with underscore')
        return v.lower()
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one number')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    discoverable: Optional[bool] = None

class UserInDB(UserBase):
    id: UUID
    blocked_users: List[UUID] = []
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserResponse(UserInDB):
    pass

class UserSearchResponse(BaseModel):
    id: UUID
    username: Optional[str] = None
    display_name: str
    avatar_url: Optional[str] = None
    discoverable: bool

    class Config:
        from_attributes = True

class UserProfileResponse(BaseModel):
    id: UUID
    phone: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    display_name: str
    avatar_url: Optional[str] = None
    last_seen: Optional[datetime] = None
    discoverable: bool

    class Config:
        from_attributes = True

class UsernameCheck(BaseModel):
    username: str
    available: bool

UserResponse.model_rebuild()