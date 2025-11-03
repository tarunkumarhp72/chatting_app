from app.models.message import MessageType
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.websocket import manager
from app.models.user import User
from app.models.message import Message
from app.models.conversation import Conversation
from app.utils.emoji_extractor import get_emojis_string
import json
import uuid
from datetime import datetime

router = APIRouter()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    user_id: str, 
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time messaging"""
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        print(f"[DEBUG] WebSocket connect failed: User not found for user_id={user_id}")
        # await websocket.close(code=4001, reason="User not found")
        # return
    # Accept connection even when user not found (DEBUG ONLY!)
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle different message types
            message_type = message_data.get("type")
            
            if message_type == "join_room":
                # Join a conversation room
                room_id = message_data.get("room_id")
                if room_id:
                    await manager.join_room(user_id, str(room_id))
                    await websocket.send_text(json.dumps({
                        "type": "room_joined",
                        "room_id": str(room_id)
                    }))
            
            elif message_type == "set_active_conversation":
                # Track which conversation user is viewing
                conversation_id = message_data.get("conversation_id")
                if conversation_id:
                    manager.set_active_conversation(user_id, str(conversation_id))
                    await websocket.send_text(json.dumps({
                        "type": "active_conversation_set",
                        "conversation_id": str(conversation_id)
                    }))
            
            elif message_type == "leave_room":
                # Leave a conversation room
                room_id = message_data.get("room_id")
                if room_id:
                    await manager.leave_room(user_id, str(room_id))
                    # Clear active conversation when leaving room
                    manager.clear_active_conversation(user_id, str(room_id))
                    await websocket.send_text(json.dumps({
                        "type": "room_left",
                        "room_id": str(room_id)
                    }))
            
            elif message_type == "message":
                # Message already created via REST API, just acknowledge receipt
                # REST API handles broadcasting, so we don't create duplicates
                message_id = message_data.get("id") or message_data.get("message_id")
                if message_id:
                    await websocket.send_text(json.dumps({
                        "type": "message_sent",
                        "message_id": message_id,
                        "status": "sent"
                    }))
            
            elif message_type == "typing":
                # Handle typing indicator
                await handle_typing_indicator(user_id, message_data)
            
            elif message_type == "read_receipt":
                # Handle read receipt
                await handle_read_receipt(user_id, message_data, db)
            
            elif message_type == "delivery_receipt":
                # Handle delivery receipt
                await handle_delivery_receipt(user_id, message_data, db)
                
    except WebSocketDisconnect:
        # Check if user has no more connections before broadcasting offline
        was_last_connection = user_id in manager.active_connections and len(manager.active_connections.get(user_id, set())) == 1
        manager.disconnect(websocket, user_id)
        # Broadcast offline status if this was the last connection
        if was_last_connection:
            await manager.broadcast_user_status(user_id, "offline")
    except Exception as e:
        print(f"WebSocket error: {e}")
        # Check if user has no more connections before broadcasting offline
        was_last_connection = user_id in manager.active_connections and len(manager.active_connections.get(user_id, set())) == 1
        manager.disconnect(websocket, user_id)
        # Broadcast offline status if this was the last connection
        if was_last_connection:
            await manager.broadcast_user_status(user_id, "offline")

async def handle_new_message(websocket: WebSocket, user_id: str, message_data: dict, db: Session):
    """Handle new message creation and broadcasting"""
    try:
        # Extract message details
        conversation_id = message_data.get("conversation_id")
        message_text = message_data.get("text")
        # Accept both keys from client, default to 'text'
        raw_type = message_data.get("message_type") or message_data.get("message_type") or "text"
        try:
            message_type = MessageType(raw_type)
        except Exception:
            message_type = MessageType.text
        media_url = message_data.get("media_url")
        file_name = message_data.get("file_name")
        file_size = message_data.get("file_size")
        latitude = message_data.get("latitude")
        longitude = message_data.get("longitude")
        
        # Verify conversation exists and user is member
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Conversation not found"
            }))
            return
        
        if uuid.UUID(user_id) not in conversation.members:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Not authorized to send message to this conversation"
            }))
            return
        
        # Extract emojis from text if present
        emojis_content = None
        if message_text:
            emojis_content = get_emojis_string(message_text)
        
        # Create message in database
        message = Message(
            id=uuid.uuid4(),
            conversation_id=uuid.UUID(conversation_id),
            sender_id=uuid.UUID(user_id),
            type=message_type,
            text=message_text,
            emojis=emojis_content,
            media_url=media_url,
            file_name=file_name,
            file_size=file_size,
            latitude=float(latitude) if latitude is not None else None,
            longitude=float(longitude) if longitude is not None else None
        )
        
        db.add(message)
        db.commit()
        
        # Update conversation last message
        conversation.last_message = message_text if message_text else f"{message_type.value} message"
        conversation.last_message_at = message.created_at
        db.commit()
        
        # Prepare message for broadcasting
        message_response = {
            "type": "message",
            "id": str(message.id),
            "conversation_id": str(message.conversation_id),
            "sender_id": str(message.sender_id),
            "text": message.text,
            "emojis": message.emojis,  # Include extracted emojis
            "message_type": message.type.value,
            "media_url": message.media_url,
            "file_name": message.file_name,
            "file_size": message.file_size,
            "latitude": message.latitude,  # Include latitude for location messages
            "longitude": message.longitude,  # Include longitude for location messages
            "created_at": message.created_at.isoformat(),
            "delivered_to": [],
            "read_by": []
        }
        
        # Broadcast to all users in the conversation except sender
        # Use ensure_ascii=False to preserve emojis in JSON
        await manager.broadcast_to_room(
            json.dumps(message_response, ensure_ascii=False), 
            conversation_id, 
            exclude_user=user_id
        )
        
        # Send confirmation to sender
        message_response["status"] = "sent"
        await websocket.send_text(json.dumps(message_response, ensure_ascii=False))
        
    except Exception as e:
        print(f"Error handling new message: {e}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Failed to send message"
        }))

async def handle_typing_indicator(user_id: str, message_data: dict):
    """Handle typing indicator"""
    conversation_id = message_data.get("conversation_id")
    is_typing = message_data.get("is_typing", True)
    
    if conversation_id:
        # Broadcast typing indicator to room
        typing_message = {
            "type": "typing",
            "user_id": user_id,
            "conversation_id": conversation_id,
            "is_typing": is_typing
        }
        
        await manager.broadcast_to_room(
            json.dumps(typing_message), 
            conversation_id, 
            exclude_user=user_id
        )

async def handle_read_receipt(user_id: str, message_data: dict, db: Session):
    """Handle read receipt"""
    message_id = message_data.get("message_id")
    
    if message_id:
        # Update message read status in database
        message = db.query(Message).filter(Message.id == uuid.UUID(message_id)).first()
        if message and uuid.UUID(user_id) not in message.read_by:
            message.read_by.append(uuid.UUID(user_id))
            # updated_at will be automatically updated by SQLAlchemy onupdate hook
            db.commit()
            
            # Broadcast read receipt to sender (if they're online)
            receipt_message = {
                "type": "read_receipt",
                "message_id": str(message_id),
                "user_id": user_id,
                "conversation_id": str(message.conversation_id),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Send to message sender
            await manager.send_personal_message(
                json.dumps(receipt_message),
                str(message.sender_id)
            )

async def handle_delivery_receipt(user_id: str, message_data: dict, db: Session):
    """Handle delivery receipt"""
    message_id = message_data.get("message_id")
    
    if message_id:
        # Update message delivery status in database
        message = db.query(Message).filter(Message.id == uuid.UUID(message_id)).first()
        if message and uuid.UUID(user_id) not in message.delivered_to:
            message.delivered_to.append(uuid.UUID(user_id))
            # updated_at will be automatically updated by SQLAlchemy onupdate hook
            db.commit()
            
            # Broadcast delivery receipt to sender (if they're online)
            receipt_message = {
                "type": "delivery_receipt",
                "message_id": str(message_id),
                "user_id": user_id,
                "conversation_id": str(message.conversation_id),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Send to message sender
            await manager.send_personal_message(
                json.dumps(receipt_message),
                str(message.sender_id)
            )