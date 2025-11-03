from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import uuid
import json
import sys
from app.db.session import get_db
from app.models.message import Message, MessageType
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.message import MessageCreate, MessageUpdate, MessageResponse
from app.core.auth import get_current_user
from app.core.websocket import manager
from app.utils.emoji_extractor import get_emojis_string, split_text_and_emojis
from app.utils.logger import safe_print, safe_repr

router = APIRouter()

@router.post("/", response_model=MessageResponse)
async def create_message(
    message: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new message
    """
    safe_print("=" * 50)
    safe_print(f"POST /messages/ - Create Message")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print(f"Conversation ID: {message.conversation_id}")
    safe_print(f"Message Type: {message.message_type}")
    safe_print(f"Text: {message.text[:100] if message.text else 'None'}...")
    safe_print(f"Media URL: {message.media_url}")
    safe_print("=" * 50)
    try:
        # Check if conversation exists
        conversation = db.query(Conversation).filter(Conversation.id == message.conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Use current_user.id instead of message.sender_id for security
        sender_id = current_user.id
        
        # Check if user is member of conversation (properly handle PostgreSQL ARRAY)
        if conversation.members is None:
            raise HTTPException(status_code=403, detail="Invalid conversation: no members")
        
        # Convert UUIDs to strings for comparison
        member_ids = [str(member) for member in conversation.members] if conversation.members else []
        if str(sender_id) not in member_ids:
            raise HTTPException(status_code=403, detail="User not authorized to send message to this conversation")
        
        # Convert file_size from string to integer if provided
        file_size_int = None
        if message.file_size:
            try:
                # If it's a string like "1.5 MB", extract just the number part
                if isinstance(message.file_size, str):
                    # Try to parse size string (e.g., "1.5 MB" -> extract number)
                    import re
                    size_match = re.search(r'([\d.]+)', message.file_size)
                    if size_match:
                        size_num = float(size_match.group(1))
                        # If ends with MB, convert to bytes (approximate)
                        if 'MB' in message.file_size.upper():
                            file_size_int = int(size_num * 1024 * 1024)
                        elif 'KB' in message.file_size.upper():
                            file_size_int = int(size_num * 1024)
                        elif 'GB' in message.file_size.upper():
                            file_size_int = int(size_num * 1024 * 1024 * 1024)
                        else:
                            file_size_int = int(size_num)
                elif isinstance(message.file_size, (int, float)):
                    file_size_int = int(message.file_size)
            except (ValueError, AttributeError):
                # If parsing fails, just set to None
                file_size_int = None
        
        # Handle text content - Python strings are already Unicode, so emojis work natively
        # Just ensure we have a string and not bytes
        text_content = None
        emojis_content = None
        if message.text:
            if isinstance(message.text, bytes):
                # If bytes are received, decode as UTF-8
                try:
                    text_content = message.text.decode('utf-8')
                except UnicodeDecodeError:
                    # Fallback: use errors='replace' to handle any problematic bytes
                    text_content = message.text.decode('utf-8', errors='replace')
            else:
                # Already a string (Python 3 strings are Unicode by default)
                # Just use it directly - SQLAlchemy will handle UTF-8 encoding to DB
                text_content = str(message.text)
            
            # Extract emojis from text
            # If emojis are explicitly provided, use them; otherwise extract from text
            if message.emojis:
                emojis_content = str(message.emojis)
            else:
                emojis_content = get_emojis_string(text_content)
        
        # Create message
        db_message = Message(
            id=uuid.uuid4(),
            conversation_id=message.conversation_id,
            sender_id=sender_id,
            message_type=message.message_type,
            text=text_content,
            emojis=emojis_content,
            media_url=message.media_url,
            file_name=message.file_name,
            file_size=file_size_int,
            latitude=message.latitude,
            longitude=message.longitude
        )
        
        db.add(db_message)
        db.commit()
        db.refresh(db_message)
        
        # Update conversation last message (use safe text without emojis for preview)
        if message.message_type == MessageType.location and message.latitude and message.longitude:
            conversation.last_message = "📍 Location"
        elif text_content:
            # Keep emojis in preview - they're properly supported now
            # Just truncate to 50 characters
            conversation.last_message = text_content[:50] if len(text_content) > 50 else text_content
        else:
            conversation.last_message = f"{message.message_type.value} message"
        conversation.last_message_at = db_message.created_at
        db.commit()
        
        # Broadcast message via WebSocket to all room participants
        # Format file_size for WebSocket (convert from bytes to string format)
        file_size_str = None
        if file_size_int:
            if file_size_int < 1024:
                file_size_str = f"{file_size_int} B"
            elif file_size_int < 1024 * 1024:
                file_size_str = f"{file_size_int / 1024:.1f} KB"
            elif file_size_int < 1024 * 1024 * 1024:
                file_size_str = f"{file_size_int / (1024 * 1024):.1f} MB"
            else:
                file_size_str = f"{file_size_int / (1024 * 1024 * 1024):.1f} GB"
        elif message.file_size:
            file_size_str = str(message.file_size)  # Use original if conversion failed
        
        message_response = {
            "type": "message",
            "id": str(db_message.id),
            "conversation_id": str(db_message.conversation_id),
            "sender_id": str(db_message.sender_id),
            "text": db_message.text,
            "emojis": db_message.emojis,  # Include extracted emojis
            "message_type": db_message.message_type.value,
            "media_url": db_message.media_url,
            "file_name": db_message.file_name,
            "file_size": file_size_str,
            "latitude": db_message.latitude,
            "longitude": db_message.longitude,
            "created_at": db_message.created_at.isoformat(),
            "delivered_to": [str(uid) for uid in db_message.delivered_to],
            "read_by": [str(uid) for uid in db_message.read_by]
        }
        
        # Broadcast to all users in the conversation except sender
        try:
            conversation_id_str = str(message.conversation_id)
            sender_id_str = str(sender_id)
            
            safe_print(f"Broadcasting message {db_message.id} to room {conversation_id_str}, excluding user {sender_id_str}")
            safe_print(f"Message details: type={db_message.message_type.value}, media_url={db_message.media_url}, file_name={db_message.file_name}")
            
            # Get all members except sender
            recipient_ids = [str(member_id) for member_id in conversation.members if str(member_id) != sender_id_str]
            
            # Check which recipients have this conversation open (active)
            recipients_with_chat_open = []
            recipients_without_chat_open = []
            
            for recipient_id in recipient_ids:
                if manager.is_conversation_active(recipient_id, conversation_id_str):
                    recipients_with_chat_open.append(recipient_id)
                else:
                    recipients_without_chat_open.append(recipient_id)
            
            safe_print(f"Recipients with chat open: {recipients_with_chat_open}")
            safe_print(f"Recipients without chat open: {recipients_without_chat_open}")
            
            # Broadcast message via WebSocket to all recipients
            # Use ensure_ascii=False to preserve emojis in JSON
            await manager.broadcast_to_room(
                json.dumps(message_response, ensure_ascii=False),
                conversation_id_str,
                exclude_user=sender_id_str
            )
            
            # Send push notifications only to users who don't have the chat open
            if recipients_without_chat_open:
                # TODO: Implement push notification sending here
                # For now, we'll use WebSocket notification
                # Get sender user details for notification
                sender_user = db.query(User).filter(User.id == sender_id).first()
                sender_name = sender_user.display_name or sender_user.username or "Someone"
                
                # Prepare notification message
                notification_text = text_content[:100] if text_content else "New message"
                if db_message.message_type == MessageType.image:
                    notification_text = "📷 Image"
                elif db_message.message_type in [MessageType.emoji]:
                    notification_text = "🎵 Audio"
                elif db_message.message_type in [MessageType.document]:
                    notification_text = f"📄 {db_message.file_name or 'File'}"
                elif db_message.message_type == MessageType.location:
                    notification_text = "📍 Location"
                
                # Filter out muted users before sending notifications
                muted_by = list(conversation.muted_by) if conversation.muted_by else []
                muted_by_str = [str(uid) for uid in muted_by]
                
                recipients_for_notification = [
                    rid for rid in recipients_without_chat_open 
                    if rid not in muted_by_str
                ]
                
                safe_print(f"Recipients for notification (excluding muted): {recipients_for_notification}")
                safe_print(f"Muted users: {muted_by_str}")
                
                # Send notification via WebSocket for users not viewing chat and not muted
                notification_message = json.dumps({
                    "type": "notification",
                    "title": sender_name,
                    "body": notification_text,
                    "conversation_id": conversation_id_str,
                    "message_id": str(db_message.id),
                    "sender_id": sender_id_str
                }, ensure_ascii=False)
                
                for recipient_id in recipients_for_notification:
                    try:
                        await manager.send_personal_message(notification_message, recipient_id)
                    except Exception as e:
                        safe_print(f"Failed to send notification to {recipient_id}: {e}")
            
            safe_print(f"Broadcast completed for message {db_message.id}")
        except Exception as broadcast_error:
            safe_print(f"Error broadcasting message: {broadcast_error}")
            import traceback
            try:
                traceback.print_exc()
            except UnicodeEncodeError:
                safe_print("Traceback contains Unicode characters - check logs")
            # Don't fail the request if broadcast fails, message is already saved
        
        return db_message
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        safe_print(f"Error in create_message: {str(e)}")
        # Use safe print for traceback (may contain Unicode in file paths)
        try:
            print(traceback.format_exc(), file=sys.stderr)
        except:
            safe_print("Traceback available in logs")
        # Safe error message to avoid Unicode encoding issues
        error_msg = str(e).encode('ascii', errors='replace').decode('ascii')
        raise HTTPException(status_code=500, detail=f"Internal server error: {error_msg}")

@router.get("/{conversation_id}", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: UUID,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get messages for a conversation
    """
    safe_print("=" * 50)
    safe_print(f"GET /messages/{conversation_id}")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print(f"Skip: {skip}, Limit: {limit}")
    safe_print("=" * 50)
    try:
        # Check if conversation exists
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check if user is a member of the conversation
        # Convert UUID to string for comparison, or use proper UUID comparison
        user_id = current_user.id
        if conversation.members is None:
            raise HTTPException(status_code=403, detail="Invalid conversation: no members")
        
        # Properly check membership by converting UUIDs to comparable format
        member_ids = [str(member) for member in conversation.members] if conversation.members else []
        if str(user_id) not in member_ids:
            raise HTTPException(status_code=403, detail="Not authorized to view messages in this conversation")
        
        # Get messages, filtering out those deleted for the current user
        # First, let's verify messages exist for this conversation
        total_count = db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).count()
        safe_print(f"Total messages in DB for conversation {conversation_id}: {total_count}")
        
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
        
        # Filter out messages deleted for current user (done in Python since PostgreSQL array filtering is complex)
        filtered_messages = []
        for msg in messages:
            # Check if message is deleted for current user
            deleted_for_user = False
            if msg.deleted_for:
                # Handle both list and empty array cases
                deleted_for_list = list(msg.deleted_for) if msg.deleted_for else []
                deleted_for_ids = [str(uid) for uid in deleted_for_list]
                if str(user_id) in deleted_for_ids:
                    deleted_for_user = True
            
            # Only include message if not deleted for user and not deleted for everyone
            # deleted_for_everyone is a string (character varying in DB), so check if it's truthy
            is_deleted_for_everyone = msg.deleted_for_everyone and str(msg.deleted_for_everyone).strip() != "" and str(msg.deleted_for_everyone).lower() != "false"
            if not deleted_for_user and not is_deleted_for_everyone:
                filtered_messages.append(msg)
        
        safe_print(f"=== GET MESSAGES DEBUG ===")
        safe_print(f"Conversation ID: {conversation_id}")
        safe_print(f"User ID: {user_id}")
        safe_print(f"Conversation members: {[str(m) for m in (conversation.members or [])]}")
        safe_print(f"User in members: {str(user_id) in member_ids}")
        safe_print(f"Total messages in DB: {len(messages)}")
        safe_print(f"Messages after filtering: {len(filtered_messages)}")
        if filtered_messages:
            safe_print(f"Sample message IDs: {[str(msg.id) for msg in filtered_messages[:3]]}")
            # Safe print to avoid emoji encoding errors on Windows
            sample_details = []
            for msg in filtered_messages[:2]:
                # Only include non-emoji parts in debug output
                sample_details.append({
                    'id': str(msg.id),
                    'message_type': msg.message_type,
                    'text_length': len(msg.text) if msg.text else 0,
                    'has_emojis': bool(msg.emojis),
                    'media_url': msg.media_url
                })
            safe_print(f"Sample message details: {sample_details}")
        else:
            safe_print(f"WARNING: No messages to return! Check if messages exist in DB for conversation {conversation_id}")
        safe_print(f"=========================")
        
        return filtered_messages
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        safe_print(f"Error in get_messages: {str(e)}")
        # Use safe print for traceback
        try:
            print(traceback.format_exc(), file=sys.stderr)
        except:
            safe_print("Traceback available in logs")
        # Safe error message to avoid Unicode encoding issues
        error_msg = str(e).encode('ascii', errors='replace').decode('ascii')
        raise HTTPException(status_code=500, detail=f"Internal server error: {error_msg}")

@router.put("/{message_id}/deliver", response_model=MessageResponse)
async def mark_message_delivered(
    message_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark message as delivered to a user
    """
    safe_print(f"PUT /messages/{message_id}/deliver - User: {current_user.id} ({current_user.username})")
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Add user to delivered_to list if not already there
    if user_id not in message.delivered_to:
        message.delivered_to.append(user_id)
        # updated_at will be automatically updated by SQLAlchemy onupdate hook
        db.commit()
        db.refresh(message)
    
    return message

@router.put("/{message_id}/read", response_model=MessageResponse)
async def mark_message_read(
    message_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark message as read by a user
    """
    safe_print(f"PUT /messages/{message_id}/read - User: {current_user.id} ({current_user.username})")
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Add user to read_by list if not already there
    if user_id not in message.read_by:
        message.read_by.append(user_id)
        # updated_at will be automatically updated by SQLAlchemy onupdate hook
        db.commit()
        db.refresh(message)
    
    return message

@router.delete("/{message_id}")
async def delete_message(
    message_id: UUID,
    delete_for_everyone: bool = Query(False),
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a message (for me or for everyone)
    """
    safe_print("=" * 50)
    safe_print(f"DELETE /messages/{message_id}")
    safe_print(f"User: {current_user.id} ({current_user.username})")
    safe_print(f"Delete for everyone: {delete_for_everyone}")
    safe_print("=" * 50)
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    conversation_id_str = str(message.conversation_id)
    
    if delete_for_everyone:
        # Only the sender can delete for everyone
        if message.sender_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this message for everyone")
        
        # Mark as deleted for everyone
        message.deleted_for_everyone = "This message was deleted"
        message.text = None
        message.media_url = None
        # updated_at will be automatically updated by SQLAlchemy onupdate hook
        db.commit()
        
        # Broadcast delete event to all users in the conversation via WebSocket
        try:
            delete_message = json.dumps({
                "type": "message_deleted",
                "message_id": str(message_id),
                "conversation_id": conversation_id_str,
                "deleted_for_everyone": True
            }, ensure_ascii=False)
            
            # Broadcast to all users in the conversation room
            await manager.broadcast_to_room(
                delete_message,
                conversation_id_str,
                exclude_user=None  # Include sender too, so they see it deleted
            )
            
            safe_print(f"Broadcasted delete event for message {message_id} to conversation {conversation_id_str}")
        except Exception as broadcast_error:
            safe_print(f"Error broadcasting delete event: {broadcast_error}")
            # Don't fail the request if broadcast fails
        
        return {"message": "Message deleted for everyone", "deleted": True}
    else:
        # Delete for specific user
        if user_id not in message.deleted_for:
            message.deleted_for.append(user_id)
        # updated_at will be automatically updated by SQLAlchemy onupdate hook
        db.commit()
        return {"message": "Message deleted for you", "deleted": True}