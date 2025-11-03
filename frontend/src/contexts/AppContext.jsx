import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import websocketService from '../services/websocket';
import { authAPI } from '../services/api';

const AppContext = createContext();

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    const setupWebSocketListeners = useCallback(() => {
        websocketService.on('connected', () => {
            console.log('WebSocket connected');
        });

        websocketService.on('disconnected', () => {
            console.log('WebSocket disconnected');
        });

        websocketService.on('message', (data) => {
            console.log('New message received:', data);
        });

        websocketService.on('typing', (data) => {
            console.log('Typing indicator:', data);
        });

        websocketService.on('read_receipt', (data) => {
            console.log('Read receipt:', data);
        });

        websocketService.on('delivery_receipt', (data) => {
            console.log('Delivery receipt:', data);
        });

        websocketService.on('friend_request', (data) => {
            console.log('New friend request received:', data);
            setFriendRequests(prev => [...prev, data]);
        });

        websocketService.on('friend_request_accepted', (data) => {
            console.log('Friend request accepted:', data);
            setFriendRequests(prev => prev.filter(req => req.request_id !== data.request_id));
        });

        websocketService.on('friend_request_rejected', (data) => {
            console.log('Friend request rejected:', data);
            setFriendRequests(prev => prev.filter(req => req.request_id !== data.request_id));
        });
    }, []);

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');
            
            if (token && storedUser) {
                try {
                    const userData = JSON.parse(storedUser);
                    setUser(userData);
                    websocketService.connect(userData.id);
                    setupWebSocketListeners();
                } catch (error) {
                    console.error('Error parsing stored user:', error);
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, [setupWebSocketListeners]);

    const isProfileComplete = (user) => {
        return user && user.display_name && user.display_name.trim() !== '';
    };

    const login = useCallback((userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        websocketService.connect(userData.id);
        setupWebSocketListeners();
    }, [setupWebSocketListeners]);

    const logout = useCallback(() => {
        setUser(null);
        setConversations([]);
        setActiveConversation(null);
        setContacts([]);
        setFriendRequests([]);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        websocketService.disconnect();
    }, []);

    const contextValue = useMemo(() => ({
        user,
        loading,
        conversations,
        setConversations,
        activeConversation,
        setActiveConversation,
        contacts,
        setContacts,
        friendRequests,
        setFriendRequests,
        onlineUsers,
        setOnlineUsers,
        login,
        logout,
        isProfileComplete
    }), [user, loading, conversations, activeConversation, contacts, friendRequests, onlineUsers, login, logout]);

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};
