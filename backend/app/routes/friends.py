from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import uuid
import json
from app.db.session import get_db
from app.models.user import User
from app.models.friend_request import FriendRequest
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.schemas.friend import FriendRequestCreate, FriendRequestUpdate, FriendRequestResponse
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from app.schemas.user import UserSearchResponse
from app.core.auth import get_current_user
from app.core.websocket import manager

router = APIRouter()

@router.post("/request/{receiver_id}", response_model=FriendRequestResponse)
async def create_friend_request(
    receiver_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a friend request
    """
    # Check if receiver exists
    receiver = db.query(User).filter(User.id == receiver_id).first()
    
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if trying to add self
    if receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")
    
    # Check if request already exists
    existing_request = db.query(FriendRequest).filter(
        FriendRequest.sender_id == current_user.id,
        FriendRequest.receiver_id == receiver_id
    ).first()
    
    if existing_request:
        raise HTTPException(status_code=400, detail="Friend request already exists")
    
    # Check if already friends
    existing_contact = db.query(Contact).filter(
        Contact.owner_id == current_user.id,
        Contact.peer_id == receiver_id,
        Contact.status == "accepted"
    ).first()
    
    if existing_contact:
        raise HTTPException(status_code=400, detail="Already friends with this user")
    
    # Create friend request
    db_request = FriendRequest(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        status="pending"
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)
    
    # Create contact entries for both users (check if they don't exist)
    existing_sender_contact = db.query(Contact).filter(
        Contact.owner_id == current_user.id,
        Contact.peer_id == receiver_id
    ).first()
    
    existing_receiver_contact = db.query(Contact).filter(
        Contact.owner_id == receiver_id,
        Contact.peer_id == current_user.id
    ).first()
    
    if not existing_sender_contact:
        sender_contact = Contact(
            owner_id=current_user.id,
            peer_id=receiver_id,
            status="requested"
        )
        db.add(sender_contact)
    else:
        # Update existing contact to requested if it was blocked
        if existing_sender_contact.status == "blocked":
            existing_sender_contact.status = "requested"
    
    if not existing_receiver_contact:
        receiver_contact = Contact(
            owner_id=receiver_id,
            peer_id=current_user.id,
            status="requested"
        )
        db.add(receiver_contact)
    else:
        # Update existing contact to requested if it was blocked
        if existing_receiver_contact.status == "blocked":
            existing_receiver_contact.status = "requested"
    
    db.commit()
    
    # Send WebSocket notification to receiver (don't fail if WebSocket fails)
    try:
        await manager.send_personal_message(
            json.dumps({
                "type": "friend_request",
                "request_id": str(db_request.id),
                "sender_id": str(current_user.id),
                "sender_username": current_user.username,
                "sender_display_name": current_user.display_name,
                "sender_avatar_url": current_user.avatar_url,
                "status": "pending",
                "created_at": db_request.created_at.isoformat()
            }),
            str(receiver_id)
        )
    except Exception as e:
        print(f"Failed to send WebSocket notification: {e}")
    
    return {
        "id": db_request.id,
        "sender_id": db_request.sender_id,
        "receiver_id": db_request.receiver_id,
        "status": db_request.status,
        "created_at": db_request.created_at,
        "sender": {
            "id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url
        },
        "receiver": {
            "id": receiver.id,
            "email": receiver.email,
            "username": receiver.username,
            "display_name": receiver.display_name,
            "avatar_url": receiver.avatar_url
        }
    }

@router.put("/request/{request_id}", response_model=FriendRequestResponse)
async def update_friend_request(
    request_id: UUID,
    request_update: FriendRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update friend request status (accept/reject/block)
    """
    db_request = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    # Get sender and receiver details
    sender = db.query(User).filter(User.id == db_request.sender_id).first()
    receiver = db.query(User).filter(User.id == db_request.receiver_id).first()
    
    # Update request status
    db_request.status = request_update.status
    db.commit()
    db.refresh(db_request)
    
    # Update contact statuses
    if request_update.status == "accepted":
        # Update both contacts to accepted
        sender_contact = db.query(Contact).filter(
            Contact.owner_id == db_request.sender_id,
            Contact.peer_id == db_request.receiver_id
        ).first()
        
        receiver_contact = db.query(Contact).filter(
            Contact.owner_id == db_request.receiver_id,
            Contact.peer_id == db_request.sender_id
        ).first()
        
        if sender_contact:
            sender_contact.status = "accepted"
        else:
            # Create contact if it doesn't exist
            sender_contact = Contact(
                owner_id=db_request.sender_id,
                peer_id=db_request.receiver_id,
                status="accepted"
            )
            db.add(sender_contact)
            
        if receiver_contact:
            receiver_contact.status = "accepted"
        else:
            # Create contact if it doesn't exist
            receiver_contact = Contact(
                owner_id=db_request.receiver_id,
                peer_id=db_request.sender_id,
                status="accepted"
            )
            db.add(receiver_contact)
            
        # Create conversation if it doesn't exist
        # Find existing conversation between these two users
        conversations = db.query(Conversation).filter(
            Conversation.type == "direct"
        ).all()
        
        conversation = None
        for conv in conversations:
            if (db_request.sender_id in conv.members and 
                db_request.receiver_id in conv.members and 
                len(conv.members) == 2):
                conversation = conv
                break
        
        if not conversation:
            conversation = Conversation(
                type="direct",
                members=[db_request.sender_id, db_request.receiver_id]
            )
            db.add(conversation)
        
        db.commit()
        
        # Send notification to sender about acceptance
        try:
            await manager.send_personal_message(
                json.dumps({
                    "type": "friend_request_accepted",
                    "request_id": str(request_id),
                    "accepter_id": str(current_user.id),
                    "accepter_username": current_user.username,
                    "accepter_display_name": current_user.display_name,
                    "accepter_avatar_url": current_user.avatar_url
                }),
                str(db_request.sender_id)
            )
        except Exception as e:
            print(f"Failed to send WebSocket notification: {e}")
    
    elif request_update.status == "rejected":
        # Send notification to sender about rejection
        try:
            await manager.send_personal_message(
                json.dumps({
                    "type": "friend_request_rejected",
                    "request_id": str(request_id),
                    "rejecter_id": str(current_user.id)
                }),
                str(db_request.sender_id)
            )
        except Exception as e:
            print(f"Failed to send WebSocket notification: {e}")
    
    elif request_update.status == "blocked":
        # Update contacts to blocked
        sender_contact = db.query(Contact).filter(
            Contact.owner_id == db_request.sender_id,
            Contact.peer_id == db_request.receiver_id
        ).first()
        
        receiver_contact = db.query(Contact).filter(
            Contact.owner_id == db_request.receiver_id,
            Contact.peer_id == db_request.sender_id
        ).first()
        
        if sender_contact:
            sender_contact.status = "blocked"
        if receiver_contact:
            receiver_contact.status = "blocked"
        
        db.commit()
    
    return {
        "id": db_request.id,
        "sender_id": db_request.sender_id,
        "receiver_id": db_request.receiver_id,
        "status": db_request.status,
        "created_at": db_request.created_at,
        "sender": {
            "id": sender.id,
            "email": sender.email,
            "username": sender.username,
            "display_name": sender.display_name,
            "avatar_url": sender.avatar_url
        },
        "receiver": {
            "id": receiver.id,
            "email": receiver.email,
            "username": receiver.username,
            "display_name": receiver.display_name,
            "avatar_url": receiver.avatar_url
        }
    }

@router.get("/requests", response_model=List[FriendRequestResponse])
async def get_friend_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all friend requests for current user (sent and received)
    """
    requests = db.query(FriendRequest).filter(
        (FriendRequest.sender_id == current_user.id) | (FriendRequest.receiver_id == current_user.id)
    ).all()
    
    sender_ids = {req.sender_id for req in requests}
    receiver_ids = {req.receiver_id for req in requests}
    all_user_ids = sender_ids | receiver_ids
    
    users = {user.id: user for user in db.query(User).filter(User.id.in_(all_user_ids)).all()}
    
    result = []
    for req in requests:
        sender = users.get(req.sender_id)
        receiver = users.get(req.receiver_id)
        
        result.append({
            "id": req.id,
            "sender_id": req.sender_id,
            "receiver_id": req.receiver_id,
            "status": req.status,
            "created_at": req.created_at,
            "sender": {
                "id": sender.id,
                "email": sender.email,
                "username": sender.username,
                "display_name": sender.display_name,
                "avatar_url": sender.avatar_url
            },
            "receiver": {
                "id": receiver.id,
                "email": receiver.email,
                "username": receiver.username,
                "display_name": receiver.display_name,
                "avatar_url": receiver.avatar_url
            }
        })
    
    return result

@router.get("/requests/pending", response_model=List[FriendRequestResponse])
async def get_pending_friend_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get pending friend requests received by current user
    """
    requests = db.query(FriendRequest).filter(
        FriendRequest.receiver_id == current_user.id,
        FriendRequest.status == "pending"
    ).all()
    
    sender_ids = {req.sender_id for req in requests}
    receiver_ids = {req.receiver_id for req in requests}
    all_user_ids = sender_ids | receiver_ids
    
    users = {user.id: user for user in db.query(User).filter(User.id.in_(all_user_ids)).all()}
    
    result = []
    for req in requests:
        sender = users.get(req.sender_id)
        receiver = users.get(req.receiver_id)
        
        result.append({
            "id": req.id,
            "sender_id": req.sender_id,
            "receiver_id": req.receiver_id,
            "status": req.status,
            "created_at": req.created_at,
            "sender": {
                "id": sender.id,
                "email": sender.email,
                "username": sender.username,
                "display_name": sender.display_name,
                "avatar_url": sender.avatar_url
            },
            "receiver": {
                "id": receiver.id,
                "email": receiver.email,
                "username": receiver.username,
                "display_name": receiver.display_name,
                "avatar_url": receiver.avatar_url
            }
        })
    
    return result

@router.get("/contacts", response_model=List[ContactResponse])
async def get_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all contacts for current user
    """
    contacts = db.query(Contact).filter(Contact.owner_id == current_user.id).all()
    return contacts

@router.get("/contacts/accepted", response_model=List[ContactResponse])
async def get_accepted_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all accepted contacts (friends) for current user
    """
    contacts = db.query(Contact).filter(
        Contact.owner_id == current_user.id,
        Contact.status == "accepted"
    ).all()
    return contacts

@router.delete("/request/{request_id}", response_model=dict)
async def cancel_friend_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancel a sent friend request
    """
    db_request = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    # Check if current user is the sender
    if db_request.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only cancel your own friend requests")
    
    # Delete contacts if they exist (only if status is "requested")
    sender_contact = db.query(Contact).filter(
        Contact.owner_id == db_request.sender_id,
        Contact.peer_id == db_request.receiver_id,
        Contact.status == "requested"
    ).first()
    
    receiver_contact = db.query(Contact).filter(
        Contact.owner_id == db_request.receiver_id,
        Contact.peer_id == db_request.sender_id,
        Contact.status == "requested"
    ).first()
    
    if sender_contact:
        db.delete(sender_contact)
    if receiver_contact:
        db.delete(receiver_contact)
    
    # Delete the friend request
    db.delete(db_request)
    db.commit()
    
    return {"message": "Friend request cancelled successfully"}

@router.get("/friends", response_model=List[UserSearchResponse])
async def get_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all friends (accepted contacts) for current user
    """
    contacts = db.query(Contact).filter(
        Contact.owner_id == current_user.id,
        Contact.status == "accepted"
    ).all()
    
    friend_ids = [contact.peer_id for contact in contacts]
    friends = db.query(User).filter(User.id.in_(friend_ids)).all()
    
    return friends