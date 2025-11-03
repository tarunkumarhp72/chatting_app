from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserUpdate, UserProfileResponse, UserResponse, UserSearchResponse
from app.models.friend_request import FriendRequest
from app.models.contact import Contact
from app.models.blocked_user import BlockedUser
from app.core.auth import get_current_user
from sqlalchemy import or_
import uuid

router = APIRouter()
security = HTTPBearer()

@router.get("/profile/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(user_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get user profile by ID
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/profile", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update user profile
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if user_update.display_name is not None:
        user.display_name = user_update.display_name
    
    if user_update.avatar_url is not None:
        # If avatar_url is base64 data, save it as a file
        if user_update.avatar_url.startswith('data:image'):
            from app.utils.file_upload import save_base64_image, delete_file
            
            # Delete old avatar if exists
            if user.avatar_url and user.avatar_url.startswith('/uploads'):
                delete_file(user.avatar_url)
            
            # Save new base64 image as file
            _, relative_url = save_base64_image(user_update.avatar_url, category='profile')
            user.avatar_url = relative_url
        else:
            user.avatar_url = user_update.avatar_url
    
    if user_update.discoverable is not None:
        user.discoverable = user_update.discoverable
    
    db.commit()
    db.refresh(user)
    return user

@router.get("/search", response_model=List[UserSearchResponse])
async def search_users(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search users by username or display name
    """
    # Search by username or display name, exclude current user and non-discoverable users
    # Include blocked users so they can be unblocked
    users = db.query(User).filter(
        User.id != current_user.id,
        User.discoverable == True,
        (User.username.ilike(f"%{query}%")) | (User.display_name.ilike(f"%{query}%"))
    ).limit(20).all()
    
    return users

@router.get("/search/phone", response_model=List[UserSearchResponse])
async def search_users_by_phone(
    phone: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search users by phone number
    """
    users = db.query(User).filter(
        User.id != current_user.id,
        User.discoverable == True,
        User.phone == phone
    ).all()
    return users

@router.post("/block/{blocked_user_id}", response_model=dict)
async def block_user(
    blocked_user_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Block a user - Creates an entry in blocked_users table
    """
    # Verify blocked user exists
    blocked_user = db.query(User).filter(User.id == blocked_user_id).first()
    if not blocked_user:
        raise HTTPException(status_code=404, detail="User to block not found")
    
    # Check if trying to block self
    if blocked_user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    
    # Check if already blocked
    existing_block = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == user_id,
        BlockedUser.blocked_user_id == blocked_user_id
    ).first()
    
    if existing_block:
        raise HTTPException(status_code=400, detail="User already blocked")
    
    # Create block entry
    block_entry = BlockedUser(
        id=uuid.uuid4(),
        blocker_id=user_id,
        blocked_user_id=blocked_user_id
    )
    db.add(block_entry)
    
    # Cancel any pending friend requests between these users
    pending_requests = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == blocked_user_id),
            (FriendRequest.sender_id == blocked_user_id) & (FriendRequest.receiver_id == user_id)
        ),
        FriendRequest.status == "pending"
    ).all()
    
    for req in pending_requests:
        req.status = "blocked"
    
    db.commit()
    
    return {"message": "User blocked successfully"}

@router.post("/unblock/{unblocked_user_id}", response_model=dict)
async def unblock_user(
    unblocked_user_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Unblock a user - Removes entry from blocked_users table
    """
    # Find the block entry
    block_entry = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == user_id,
        BlockedUser.blocked_user_id == unblocked_user_id
    ).first()
    
    if not block_entry:
        raise HTTPException(status_code=404, detail="User not found in blocked list")
    
    # Delete the block entry
    db.delete(block_entry)
    db.commit()
    
    return {"message": "User unblocked successfully"}

@router.get("/blocked", response_model=List[UserSearchResponse])
async def get_blocked_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all blocked users for current user from blocked_users table
    """
    block_entries = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id
    ).all()
    
    if not block_entries:
        return []
    
    blocked_user_ids = [entry.blocked_user_id for entry in block_entries]
    blocked_users = db.query(User).filter(User.id.in_(blocked_user_ids)).all()
    return blocked_users