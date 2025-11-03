import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        # Store active connections: {user_id: set of websockets}
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Store user rooms: {conversation_id: set of user_ids}
        self.rooms: Dict[str, Set[str]] = {}
        # Store active conversations: {user_id: conversation_id} - tracks which chat each user is viewing
        self.active_conversations: Dict[str, str] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        """Connect a user websocket"""
        await websocket.accept()
        
        # Add to active connections
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        
        # Broadcast online status
        await self.broadcast_user_status(user_id, "online")
        
        print(f"User {user_id} connected")
    
    def disconnect(self, websocket: WebSocket, user_id: str):
        """Disconnect a user websocket"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                # User is completely offline, remove active conversation
                self.active_conversations.pop(user_id, None)
        
        # Remove from all rooms
        rooms_to_leave = []
        for room_id, participants in self.rooms.items():
            if user_id in participants:
                participants.discard(user_id)
                if not participants:
                    rooms_to_leave.append(room_id)
        
        # Clean up empty rooms
        for room_id in rooms_to_leave:
            del self.rooms[room_id]
        
        print(f"User {user_id} disconnected")
    
    async def join_room(self, user_id: str, room_id: str):
        """Join a conversation room"""
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(user_id)
        print(f"User {user_id} joined room {room_id}")
    
    async def leave_room(self, user_id: str, room_id: str):
        """Leave a conversation room"""
        if room_id in self.rooms:
            self.rooms[room_id].discard(user_id)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        print(f"User {user_id} left room {room_id}")
    
    async def send_personal_message(self, message: str, user_id: str):
        """Send a message to a specific user"""
        if user_id in self.active_connections:
            # Send to all connections for this user
            disconnected = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(message)
                except WebSocketDisconnect:
                    disconnected.add(websocket)
            
            # Remove disconnected websockets
            if disconnected:
                self.active_connections[user_id] -= disconnected
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
    
    async def broadcast_to_room(self, message: str, room_id: str, exclude_user: Optional[str] = None):
        """Broadcast a message to all users in a room"""
        recipients_sent = []
        recipients_failed = []
        
        if room_id in self.rooms:
            # Get all users in the room
            recipients = self.rooms[room_id].copy()
            
            # Remove excluded user if specified
            if exclude_user:
                recipients.discard(exclude_user)
            
            print(f"Broadcasting to {len(recipients)} users in room {room_id}: {recipients}")
            
            # Send message to each user
            for user_id in recipients:
                try:
                    await self.send_personal_message(message, user_id)
                    recipients_sent.append(user_id)
                    print(f"Successfully sent message to user {user_id}")
                except Exception as e:
                    recipients_failed.append((user_id, str(e)))
                    print(f"Failed to send message to user {user_id}: {e}")
        else:
            print(f"Warning: Room {room_id} not found in active rooms. Active rooms: {list(self.rooms.keys())}")
        
        if recipients_failed:
            print(f"Failed to send to {len(recipients_failed)} users: {recipients_failed}")
        
        return {
            "sent": recipients_sent,
            "failed": recipients_failed
        }
    
    async def broadcast_to_users(self, message: str, user_ids: list):
        """Broadcast a message to specific users"""
        for user_id in user_ids:
            await self.send_personal_message(message, user_id)
    
    def set_active_conversation(self, user_id: str, conversation_id: str):
        """Track which conversation a user is currently viewing"""
        self.active_conversations[user_id] = conversation_id
        print(f"User {user_id} is viewing conversation {conversation_id}")
    
    def clear_active_conversation(self, user_id: str, conversation_id: str = None):
        """Clear active conversation for a user"""
        if conversation_id:
            # Only clear if it's the same conversation
            if self.active_conversations.get(user_id) == conversation_id:
                del self.active_conversations[user_id]
        else:
            # Clear any active conversation for this user
            self.active_conversations.pop(user_id, None)
    
    def is_conversation_active(self, user_id: str, conversation_id: str) -> bool:
        """Check if a user is currently viewing a specific conversation"""
        return self.active_conversations.get(user_id) == conversation_id
    
    async def broadcast_user_status(self, user_id: str, status: str):
        """Broadcast user online/offline status to all connected users"""
        status_message = json.dumps({
            "type": "user_status",
            "user_id": user_id,
            "status": status  # "online" or "offline"
        })
        
        # Broadcast to all connected users
        for connected_user_id in list(self.active_connections.keys()):
            if connected_user_id != user_id:  # Don't send to self
                try:
                    await self.send_personal_message(status_message, connected_user_id)
                except:
                    pass  # Ignore errors for disconnected users

# Global connection manager instance
manager = ConnectionManager()