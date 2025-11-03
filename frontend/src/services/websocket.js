class WebSocketService {
    constructor() {
        this.socket = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    connect(userId) {
        if (!userId) {
            console.error('User ID is required to connect to WebSocket');
            return;
        }

        const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/ws'}/${userId}`;

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                this.emit('connected');
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.emit(data.type, data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.socket.onclose = () => {
                console.log('WebSocket disconnected');
                this.emit('disconnected');
                this.handleReconnect(userId);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.handleReconnect(userId);
        }
    }

    handleReconnect(userId) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect(userId);
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            this.emit('reconnect_failed');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.error('WebSocket is not connected');
        }
    }

    joinRoom(roomId) {
        this.send({
            type: 'join_room',
            room_id: roomId
        });
    }

    leaveRoom(roomId) {
        this.send({
            type: 'leave_room',
            room_id: roomId
        });
    }

    sendMessage(conversationId, text, messageType = 'text', mediaUrl = null) {
        this.send({
            type: 'message',
            conversation_id: conversationId,
            text: text,
            message_type: messageType,
            media_url: mediaUrl
        });
    }

    sendTyping(conversationId, isTyping = true) {
        this.send({
            type: 'typing',
            conversation_id: conversationId,
            is_typing: isTyping
        });
    }

    sendReadReceipt(messageId) {
        this.send({
            type: 'read_receipt',
            message_id: messageId
        });
    }

    sendDeliveryReceipt(messageId) {
        this.send({
            type: 'delivery_receipt',
            message_id: messageId
        });
    }

    // Event listener methods
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }
}

// Create a singleton instance
const websocketService = new WebSocketService();

export default websocketService;