import React, { useState, useEffect } from 'react';
import './MessageContextMenu.css';

const MessageContextMenu = ({ message, position, onClose, onDelete, isSentByMe }) => {
    const [menuStyle, setMenuStyle] = useState({ top: position.y });

    useEffect(() => {
        const isMobile = window.innerWidth <= 768;
        
        if (isSentByMe) {
            // For sent messages, position from right
            setMenuStyle({
                top: position.y,
                right: isMobile ? '2.5rem' : `${window.innerWidth - position.x}px`,
                left: 'auto'
            });
        } else {
            // For received messages, position from left
            // On mobile, ensure it doesn't go outside viewport
            if (isMobile) {
                setMenuStyle({
                    top: position.y,
                    left: '6.5rem',
                    right: 'auto',
                    maxWidth: 'calc(100vw - 1rem)' // Ensure it doesn't overflow
                });
            } else {
                setMenuStyle({
                    top: position.y,
                    left: `${position.x}px`,
                    right: 'auto'
                });
            }
        }
    }, [position, isSentByMe]);

    const handleDeleteForMe = () => {
        onDelete(message.id, false);
        onClose();
    };

    const handleDeleteForEveryone = () => {
        onDelete(message.id, true);
        onClose();
    };

    return (
        <>
            <div className="context-menu-overlay" onClick={onClose} />
            <div 
                className="message-context-menu" 
                style={menuStyle}
            >
                <div className="context-menu-item" onClick={handleDeleteForMe}>
                    <span className="context-menu-icon">🗑️</span>
                    <span>Delete for me</span>
                </div>
                
                {isSentByMe && (
                    <div className="context-menu-item" onClick={handleDeleteForEveryone}>
                        <span className="context-menu-icon">❌</span>
                        <span>Delete for everyone</span>
                    </div>
                )}
                
                <div className="context-menu-divider" />
                
                <div className="context-menu-item cancel" onClick={onClose}>
                    <span>Cancel</span>
                </div>
            </div>
        </>
    );
};

export default MessageContextMenu;

