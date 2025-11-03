import React from 'react';
import './SkeletonLoader.css';

export const SkeletonAvatar = ({ size = 50 }) => (
    <div 
        className="skeleton skeleton-avatar" 
        style={{ width: size, height: size }}
    />
);

export const SkeletonText = ({ width = '100%', height = 16 }) => (
    <div 
        className="skeleton skeleton-text" 
        style={{ width, height }}
    />
);

export const SkeletonButton = ({ width = 120, height = 40 }) => (
    <div 
        className="skeleton skeleton-button" 
        style={{ width, height }}
    />
);

export const SkeletonConversation = () => (
    <div className="skeleton-conversation">
        <SkeletonAvatar size={50} />
        <div className="skeleton-conversation-details">
            <SkeletonText width="60%" height={18} />
            <SkeletonText width="80%" height={14} />
        </div>
    </div>
);

export const SkeletonMessage = ({ sent = false }) => (
    <div className={`skeleton-message ${sent ? 'sent' : 'received'}`}>
        <div className="skeleton skeleton-message-bubble" />
    </div>
);

const SkeletonLoader = ({ type = 'text', ...props }) => {
    switch (type) {
        case 'avatar':
            return <SkeletonAvatar {...props} />;
        case 'text':
            return <SkeletonText {...props} />;
        case 'button':
            return <SkeletonButton {...props} />;
        case 'conversation':
            return <SkeletonConversation {...props} />;
        case 'message':
            return <SkeletonMessage {...props} />;
        default:
            return <SkeletonText {...props} />;
    }
};

export default SkeletonLoader;

