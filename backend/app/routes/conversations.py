from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.user import User
from app.models.contact import Contact
from app.models.blocked_user import BlockedUser
from app.schemas.conversation import ConversationResponse
from app.core.auth import get_current_user

router = APIRouter()

@router.get("/", response_model=List[ConversationResponse])
async def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all conversations for the current user, excluding conversations with blocked users
    """
    from app.utils.logger import safe_print
    safe_print("=" * 50)
    safe_print(f"GET /conversations/")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print("=" * 50)
    try:
        # Get all blocked user IDs (where current user is blocker or blocked)
        block_entries = db.query(BlockedUser).filter(
            (BlockedUser.blocker_id == current_user.id) | (BlockedUser.blocked_user_id == current_user.id)
        ).all()
        blocked_user_ids = {str(entry.blocker_id) for entry in block_entries} | {str(entry.blocked_user_id) for entry in block_entries}
        blocked_user_ids.discard(str(current_user.id))
        
        conversations = db.query(Conversation).filter(
            Conversation.members.contains([current_user.id])
        ).order_by(Conversation.last_message_at.desc().nullslast()).all()
        
        # Filter out conversations with blocked users
        filtered_conversations = []
        for conv in conversations:
            if conv.members is None:
                continue
                
            # Check if conversation has any blocked users
            has_blocked_user = False
            for member_id in conv.members:
                if str(member_id) in blocked_user_ids:
                    has_blocked_user = True
                    break
            if not has_blocked_user:
                filtered_conversations.append(conv)
        
        return filtered_conversations
    except Exception as e:
        import traceback
        print(f"Error in get_conversations: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/with/{user_id}")
async def get_or_create_conversation(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get or create a direct conversation with a specific user
    """
    from app.utils.logger import safe_print
    safe_print("=" * 50)
    safe_print(f"GET /conversations/with/{user_id}")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print(f"Target User ID: {user_id}")
    safe_print("=" * 50)
    try:
        # Check if user is blocked
        is_blocked = db.query(BlockedUser).filter(
            ((BlockedUser.blocker_id == current_user.id) & (BlockedUser.blocked_user_id == user_id)) |
            ((BlockedUser.blocker_id == user_id) & (BlockedUser.blocked_user_id == current_user.id))
        ).first()
        
        if is_blocked:
            raise HTTPException(status_code=403, detail="Cannot create conversation with a blocked user")
        
        # Check if users are friends
        contact = db.query(Contact).filter(
            Contact.owner_id == current_user.id,
            Contact.peer_id == user_id,
            Contact.status == "accepted"
        ).first()
        
        if not contact:
            raise HTTPException(status_code=403, detail="You must be friends with this user to start a conversation")
        
        # Find existing conversation - properly handle PostgreSQL ARRAY comparison
        conversations = db.query(Conversation).filter(
            Conversation.type == "direct"
        ).all()
        
        current_user_str = str(current_user.id)
        user_id_str = str(user_id)
        
        for conv in conversations:
            if conv.members is None:
                continue
            
            # Convert members to strings for comparison
            member_ids = [str(member) for member in conv.members] if conv.members else []
            
            # Check if both users are in members and conversation has exactly 2 members
            if (current_user_str in member_ids and 
                user_id_str in member_ids and 
                len(conv.members) == 2):
                return conv
        
        # Create new conversation
        conversation = Conversation(
            type="direct",
            members=[current_user.id, user_id]
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        
        return conversation
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error in get_or_create_conversation: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/{conversation_id}/mute")
async def mute_conversation(
    conversation_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mute a conversation for the current user
    """
    from app.utils.logger import safe_print
    safe_print("=" * 50)
    safe_print(f"POST /conversations/{conversation_id}/mute")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print("=" * 50)
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check if user is a member
        if conversation.members is None or current_user.id not in conversation.members:
            raise HTTPException(status_code=403, detail="Not a member of this conversation")
        
        # Add user to muted_by array if not already there
        muted_by = list(conversation.muted_by) if conversation.muted_by else []
        if current_user.id not in muted_by:
            muted_by.append(current_user.id)
            conversation.muted_by = muted_by
            db.commit()
            safe_print(f"Conversation {conversation_id} muted for user {current_user.id}")
        else:
            safe_print(f"Conversation {conversation_id} already muted for user {current_user.id}")
        
        return {"message": "Conversation muted", "muted": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        safe_print(f"Error muting conversation: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/{conversation_id}/unmute")
async def unmute_conversation(
    conversation_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Unmute a conversation for the current user
    """
    from app.utils.logger import safe_print
    safe_print("=" * 50)
    safe_print(f"POST /conversations/{conversation_id}/unmute")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print("=" * 50)
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check if user is a member
        if conversation.members is None or current_user.id not in conversation.members:
            raise HTTPException(status_code=403, detail="Not a member of this conversation")
        
        # Remove user from muted_by array
        muted_by = list(conversation.muted_by) if conversation.muted_by else []
        if current_user.id in muted_by:
            muted_by.remove(current_user.id)
            conversation.muted_by = muted_by if muted_by else []
            db.commit()
            safe_print(f"Conversation {conversation_id} unmuted for user {current_user.id}")
        else:
            safe_print(f"Conversation {conversation_id} was not muted for user {current_user.id}")
        
        return {"message": "Conversation unmuted", "muted": False}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        safe_print(f"Error unmuting conversation: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

