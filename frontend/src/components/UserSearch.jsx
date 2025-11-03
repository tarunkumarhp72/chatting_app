import React, { useState, useEffect, useRef } from 'react';
import { userAPI, friendAPI } from '../services/api';
import { useAppContext } from '../contexts/AppContext';
import './UserSearch.css';

const UserSearch = ({ onClose, onUserSelect }) => {
    const { friendRequests: contextFriendRequests, setFriendRequests, user: currentUser } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [localFriendRequests, setLocalFriendRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [acceptedContacts, setAcceptedContacts] = useState([]);
    const searchTimeoutRef = useRef(null);

    useEffect(() => {
        loadPendingRequests();
        loadSentRequests();
        loadBlockedUsers();
        loadAcceptedContacts();
    }, []);

    useEffect(() => {
        if (contextFriendRequests.length > 0) {
            loadPendingRequests();
        }
    }, [contextFriendRequests]);

    const loadPendingRequests = async () => {
        try {
            const response = await friendAPI.getPendingRequests();
            setLocalFriendRequests(response.data);
        } catch (err) {
            console.error('Error loading pending requests:', err);
        }
    };

    const loadSentRequests = async () => {
        try {
            const response = await friendAPI.getFriendRequests();
            const sent = response.data.filter(req => req.status === 'pending' && req.sender_id !== req.receiver_id);
            setSentRequests(sent);
        } catch (err) {
            console.error('Error loading sent requests:', err);
        }
    };

    const loadBlockedUsers = async () => {
        try {
            const response = await userAPI.getBlockedUsers();
            setBlockedUsers(response.data || []);
        } catch (err) {
            console.error('Error loading blocked users:', err);
        }
    };

    const loadAcceptedContacts = async () => {
        try {
            const response = await friendAPI.getAcceptedContacts();
            setAcceptedContacts(response.data || []);
        } catch (err) {
            console.error('Error loading accepted contacts:', err);
        }
    };

    const searchUsers = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await userAPI.searchUsers(query);
            setSearchResults(response.data);
        } catch (err) {
            console.error('Search error:', err);
            setError('Failed to search users');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);

        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            searchUsers(query);
        }, 300);
    };

    const handleSendFriendRequest = async (userId) => {
        try {
            await friendAPI.sendFriendRequest(userId);
            setError('');
            // Update sent requests and contacts
            await loadSentRequests();
            await loadAcceptedContacts();
            // Refresh search results
            if (searchQuery.trim()) {
                searchUsers(searchQuery);
            }
        } catch (err) {
            console.error('Error sending friend request:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Failed to send friend request');
            }
        }
    };

    const handleCancelRequest = async (requestId) => {
        try {
            await friendAPI.cancelFriendRequest(requestId);
            await loadSentRequests();
            await loadAcceptedContacts();
            // Refresh search results
            if (searchQuery.trim()) {
                searchUsers(searchQuery);
            }
        } catch (err) {
            console.error('Error cancelling request:', err);
            setError('Failed to cancel request');
        }
    };

    const handleUnblockUser = async (userId) => {
        try {
            await userAPI.unblockUser(currentUser.id, userId);
            // Remove from blocked users list
            setBlockedUsers(prev => prev.filter(user => user.id !== userId));
            // Refresh all data
            await loadSentRequests();
            await loadAcceptedContacts();
            // Refresh search results
            if (searchQuery.trim()) {
                searchUsers(searchQuery);
            }
        } catch (err) {
            console.error('Error unblocking user:', err);
            setError('Failed to unblock user');
        }
    };

    const handleAcceptRequest = async (requestId) => {
        try {
            await friendAPI.updateFriendRequest(requestId, 'accepted');
            setError('');
            loadPendingRequests();
            if (onUserSelect) {
                onUserSelect();
            }
        } catch (err) {
            console.error('Error accepting request:', err);
            setError('Failed to accept friend request');
        }
    };

    const handleRejectRequest = async (requestId) => {
        try {
            await friendAPI.updateFriendRequest(requestId, 'rejected');
            setError('');
            loadPendingRequests();
        } catch (err) {
            console.error('Error rejecting request:', err);
            setError('Failed to reject friend request');
        }
    };

    const isRequestSent = (userId) => {
        return sentRequests.some(req => req.receiver_id === userId);
    };

    const isRequestReceived = (userId) => {
        return localFriendRequests.some(req => req.sender_id === userId);
    };

    const getRequestStatus = (userId, user) => {
        if (user.requestSent) return 'sent';
        
        // Check if already accepted (friends)
        const isAccepted = acceptedContacts.some(contact => contact.peer_id === userId);
        if (isAccepted) return 'accepted';
        
        // Check if blocked
        const isBlocked = blockedUsers.some(u => u.id === userId);
        if (isBlocked) return 'blocked';
        
        // Check if request sent (pending)
        const sentRequest = sentRequests.find(req => req.receiver_id === userId);
        if (sentRequest) return 'sent';
        
        // Check if request received
        const receivedRequest = localFriendRequests.find(req => req.sender_id === userId);
        if (receivedRequest) return 'received';
        
        return 'none';
    };

    const getSentRequestId = (userId) => {
        const sentRequest = sentRequests.find(req => req.receiver_id === userId);
        return sentRequest ? sentRequest.id : null;
    };

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="user-search-overlay">
            <div className="user-search-modal">
                <div className="user-search-header">
                    <h2>Add Friends</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="user-search-content">
                    <div className="search-input-container">
                        <input
                            type="text"
                            placeholder="Search by username or name..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="search-input"
                        />
                        {loading && <div className="loading-spinner">⟳</div>}
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    {/* Pending Friend Requests */}
                    {localFriendRequests.length > 0 && (
                        <div className="pending-requests-section">
                            <h3>Friend Requests</h3>
                            {localFriendRequests.map(request => (
                                <div key={request.id} className="friend-request-item">
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            {request.sender?.display_name?.charAt(0) || '?'}
                                        </div>
                                        <div className="user-details">
                                            <div className="user-name">
                                                {request.sender?.display_name || 'Unknown User'}
                                            </div>
                                            <div className="user-username">
                                                @{request.sender?.username || 'unknown'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="request-actions">
                                        <button 
                                            className="accept-btn"
                                            onClick={() => handleAcceptRequest(request.id)}
                                        >
                                            Accept
                                        </button>
                                        <button 
                                            className="reject-btn"
                                            onClick={() => handleRejectRequest(request.id)}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                        <div className="search-results-section">
                            <h3>Search Results</h3>
                            {searchResults.map(user => {
                                const requestStatus = getRequestStatus(user.id, user);
                                return (
                                    <div key={user.id} className="search-result-item">
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                {user.display_name?.charAt(0) || '?'}
                                            </div>
                                            <div className="user-details">
                                                <div className="user-name">{user.display_name}</div>
                                                <div className="user-username">@{user.username}</div>
                                            </div>
                                        </div>
                                        <div className="user-actions">
                                            {requestStatus === 'accepted' && (
                                                <span className="already-friend">Already Friend</span>
                                            )}
                                            {requestStatus === 'sent' && (
                                                <button 
                                                    className="revert-btn"
                                                    onClick={() => handleCancelRequest(getSentRequestId(user.id))}
                                                >
                                                    Revert
                                                </button>
                                            )}
                                            {requestStatus === 'received' && (
                                                <span className="request-received">Request Received</span>
                                            )}
                                            {requestStatus === 'blocked' && (
                                                <button 
                                                    className="unblock-btn"
                                                    onClick={() => handleUnblockUser(user.id)}
                                                >
                                                    Unblock
                                                </button>
                                            )}
                                            {requestStatus === 'none' && (
                                                <button 
                                                    className="add-friend-btn"
                                                    onClick={() => handleSendFriendRequest(user.id)}
                                                >
                                                    Send Request
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {searchQuery && !loading && searchResults.length === 0 && (
                        <div className="no-results">
                            <p>No users found matching "{searchQuery}"</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserSearch;
