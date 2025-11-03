import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import NotificationPanel from './NotificationPanel';
import './TopHeader.css';

const TopHeader = () => {
    const { user, logout, friendRequests } = useAppContext();
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // Broadcast currently selected filter on mount and whenever it changes
        const evt = new CustomEvent('setConversationFilter', { detail: { filter: activeFilter } });
        window.dispatchEvent(evt);
    }, [activeFilter]);

    const handleFilterChange = (filterKey) => {
        setActiveFilter(filterKey);
    };

    return (
        <div className="top-header">
            <div className="top-header-left">
                <h1 className="project-name">Chats</h1>
                <div className="top-header-filters" role="tablist" aria-label="Conversation filters">
                    <button
                        type="button"
                        className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => handleFilterChange('all')}
                        aria-pressed={activeFilter === 'all'}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        className={`filter-pill ${activeFilter === 'unread' ? 'active' : ''}`}
                        onClick={() => handleFilterChange('unread')}
                        aria-pressed={activeFilter === 'unread'}
                    >
                        Unread
                    </button>
                    <button
                        type="button"
                        className={`filter-pill ${activeFilter === 'groups' ? 'active' : ''}`}
                        onClick={() => handleFilterChange('groups')}
                        aria-pressed={activeFilter === 'groups'}
                    >
                        Groups
                    </button>
                </div>
            </div>
            <div className="top-header-right">
                {user && (
                    <div 
                        className="top-header-profile-avatar"
                        onClick={() => navigate('/profile')}
                        title="Your Profile"
                    >
                        {user.avatar_url ? (
                            <img 
                                src={user.avatar_url.startsWith('http') 
                                    ? user.avatar_url 
                                    : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${user.avatar_url.startsWith('/') ? user.avatar_url : '/' + user.avatar_url}`}
                                alt={user.display_name || user.username}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextElementSibling.style.display = 'flex';
                                }}
                            />
                        ) : null}
                        <span style={{ display: user.avatar_url ? 'none' : 'flex' }}>
                            {user.display_name?.charAt(0) || user.username?.charAt(0) || '?'}
                        </span>
                    </div>
                )}
                <NotificationPanel />
                <button 
                    className="top-header-add-btn"
                    onClick={() => {
                        const userSearchEvent = new CustomEvent('openUserSearch');
                        window.dispatchEvent(userSearchEvent);
                    }}
                    title="Add Friend"
                >
                    +
                </button>
                <div className="top-header-dropdown" ref={dropdownRef}>
                    <button 
                        className="top-header-menu-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowDropdown(!showDropdown);
                        }}
                        type="button"
                    >
                        ⋮
                    </button>
                    {showDropdown && (
                        <div className="top-header-dropdown-menu">
                            <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate('/friend-requests'); }}>
                                <span className="dropdown-icon">📬</span>
                                <span>Friend Requests</span>
                                {friendRequests.length > 0 && (
                                    <span className="notification-badge-menu">{friendRequests.length}</span>
                                )}
                            </div>
                            <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate('/settings'); }}>
                                <span className="dropdown-icon">⚙️</span>
                                <span>Settings</span>
                            </div>
                            <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate('/profile'); }}>
                                <span className="dropdown-icon">👤</span>
                                <span>Profile</span>
                            </div>
                            <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate('/blocked-users'); }}>
                                <span className="dropdown-icon">🚫</span>
                                <span>Blocked Users</span>
                            </div>
                            <div className="dropdown-divider"></div>
                            <div className="dropdown-item logout" onClick={() => { logout(); navigate('/login'); }}>
                                <span className="dropdown-icon">🚪</span>
                                <span>Logout</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TopHeader;

