from fastapi import APIRouter, HTTPException, Depends, status, Form, Query
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Optional
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserLogin, UsernameCheck
from app.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    get_current_user,
)
from app.core.config import settings
from datetime import datetime
import re
import uuid
from jose import JWTError, jwt
from fastapi import Request

router = APIRouter()

@router.post("/register", response_model=None)
async def register(credentials: UserCreate, db: Session = Depends(get_db)):
    """Register a new user and return access token."""
    # Check if email already exists
    existing_email = db.query(User).filter(User.email == credentials.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if username already exists
    existing_username = db.query(User).filter(User.username == credentials.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    hashed_password = get_password_hash(credentials.password)
    
    # Generate user ID from username (first 8 characters + random suffix)
    username_prefix = credentials.username[:8].upper()
    random_suffix = str(uuid.uuid4())[:8].upper()
    user_id = f"{username_prefix}_{random_suffix}"
    
    db_user = User(
        email=credentials.email,
        username=credentials.username,
        password_hash=hashed_password,
        discoverable=True
    )
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except Exception as e:
        print(f"Error creating user: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(db_user.id)}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(
        data={"sub": str(db_user.id)}, expires_delta=refresh_token_expires
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "access_token_expires": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expires": settings.REFRESH_TOKEN_EXPIRE_MINUTES
    }

@router.post("/login", response_model=None)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user and return access token."""
    user = authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}, expires_delta=refresh_token_expires
    )
    
    # Update last seen
    from sqlalchemy import update
    try:
        db.execute(update(User).where(User.id == user.id).values(last_seen=datetime.utcnow()))
        db.commit()
    except Exception as e:
        print(f"Error updating last_seen: {e}")
        db.rollback()
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "access_token_expires": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expires": settings.REFRESH_TOKEN_EXPIRE_MINUTES
    }

@router.post("/refresh")
async def refresh_token(request: Request):
    data = await request.json()
    refresh_token = data.get("refresh_token")
    from app.core.config import settings
    from app.core.auth import create_access_token, create_refresh_token
    from datetime import timedelta, datetime

    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token required")

    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        exp = payload.get("exp")
        if not user_id or not exp:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        if datetime.utcfromtimestamp(exp) < datetime.utcnow():
            raise HTTPException(status_code=401, detail="Expired refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)

    # Optionally, always rotate refresh token for max security:
    new_refresh_token = create_refresh_token({"sub": user_id}, expires_delta=refresh_token_expires)

    return {
        "access_token": create_access_token({"sub": user_id}, expires_delta=access_token_expires),
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "access_token_expires": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expires": settings.REFRESH_TOKEN_EXPIRE_MINUTES
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user

@router.get("/check-username", response_model=UsernameCheck)
async def check_username_availability(
    username: str = Query(..., min_length=3, max_length=30),
    db: Session = Depends(get_db)
):
    """Check if username is available."""
    # Validate username format
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain letters, numbers, and underscores"
        )
    
    if username.startswith('_') or username.endswith('_'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username cannot start or end with underscore"
        )
    
    username_lower = username.lower()
    
    # Check if username exists
    existing_user = db.query(User).filter(User.username == username_lower).first()
    
    return UsernameCheck(
        username=username_lower,
        available=existing_user is None
    )

@router.post("/setup-profile", response_model=UserResponse)
async def setup_profile(
    display_name: str = Form(...),
    avatar_url: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Setup user profile."""
    if not display_name or not display_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name is required"
        )
    
    # If avatar_url is provided and it's base64 data, save it as a file
    final_avatar_url = avatar_url
    if avatar_url and avatar_url.startswith('data:image'):
        from app.utils.file_upload import save_base64_image, delete_file
        
        # Delete old avatar if exists
        if current_user.avatar_url and current_user.avatar_url.startswith('/uploads'):
            delete_file(current_user.avatar_url)
        
        # Save new base64 image as file
        _, relative_url = save_base64_image(avatar_url, category='profile')
        final_avatar_url = relative_url
    
    from sqlalchemy import update
    db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(display_name=display_name.strip(), avatar_url=final_avatar_url)
    )
    db.commit()
    db.refresh(current_user)
    
    return current_user