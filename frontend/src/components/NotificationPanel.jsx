import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import './NotificationPanel.css';

const NotificationPanel = () => {
    const { friendRequests, conversations } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const totalUnread = friendRequests.length + conversations.reduce((sum, conv) => sum + (conv.unread || 0), 0);
    const hasNotifications = totalUnread > 0;

    const handleNotificationClick = (type, data) => {
        setIsOpen(false);
        if (type === 'friend_request') {
            navigate('/friend-requests');
        } else if (type === 'message') {
            navigate('/chats');
        }
    };

    return (
        <div className="notification-panel" ref={panelRef}>
            <button 
                className={`notification-icon ${hasNotifications ? 'has-notifications' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                🔔
                {hasNotifications && (
                    <span className="notification-badge-icon">{totalUnread > 99 ? '99+' : totalUnread}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        {hasNotifications && (
                            <button 
                                className="mark-all-read"
                                onClick={() => setIsOpen(false)}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="notification-list">
                        {friendRequests.length > 0 && (
                            <div 
                                className="notification-item friend-request"
                                onClick={() => handleNotificationClick('friend_request')}
                            >
                                <div className="notification-icon-item">📬</div>
                                <div className="notification-content">
                                    <div className="notification-title">Friend Requests</div>
                                    <div className="notification-text">
                                        {friendRequests.length} new request{friendRequests.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <div className="notification-count">{friendRequests.length}</div>
                            </div>
                        )}
                        {conversations
                            .filter(conv => conv.unread > 0)
                            .slice(0, 5)
                            .map(conv => (
                                <div
                                    key={conv.id}
                                    className="notification-item message"
                                    onClick={() => handleNotificationClick('message', conv)}
                                >
                                    <div className="notification-icon-item">💬</div>
                                    <div className="notification-content">
                                        <div className="notification-title">{conv.name}</div>
                                        <div className="notification-text">{conv.lastMessage || 'New message'}</div>
                                    </div>
                                    <div className="notification-count">{conv.unread}</div>
                                </div>
                            ))}
                        {!hasNotifications && (
                            <div className="notification-empty">
                                <span>No new notifications</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationPanel;

