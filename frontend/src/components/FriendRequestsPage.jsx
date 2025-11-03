import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { friendAPI, userAPI } from '../services/api';
import './FriendRequestsPage.css';

const FriendRequestsPage = () => {
    const { user, friendRequests: contextFriendRequests, setFriendRequests } = useAppContext();
    const [pendingRequests, setPendingRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('received');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const navigate = useNavigate();
    const searchTimeoutRef = useRef(null);

    useEffect(() => {
        loadRequests();
    }, []);

    useEffect(() => {
        if (contextFriendRequests.length > 0) {
            loadRequests();
        }
    }, [contextFriendRequests]);

    const loadRequests = async () => {
        setLoading(true);
        setError('');
        try {
            const [pendingRes, allRequestsRes] = await Promise.all([
                friendAPI.getPendingRequests(),
                friendAPI.getFriendRequests()
            ]);

            const requestsWithUsers = await Promise.all(
                pendingRes.data.map(async (request) => {
                    try {
                        const userRes = await userAPI.getProfile(request.sender_id);
                        return { ...request, sender: userRes.data };
                    } catch (err) {
                        console.error('Error fetching user profile:', err);
                        return { ...request, sender: null };
                    }
                })
            );

            setPendingRequests(requestsWithUsers);

            const sent = allRequestsRes.data.filter(
                req => req.sender_id === user.id && req.status === 'pending'
            );

            const sentWithUsers = await Promise.all(
                sent.map(async (request) => {
                    try {
                        const userRes = await userAPI.getProfile(request.receiver_id);
                        return { ...request, receiver: userRes.data };
                    } catch (err) {
                        console.error('Error fetching user profile:', err);
                        return { ...request, receiver: null };
                    }
                })
            );

            setSentRequests(sentWithUsers);
        } catch (err) {
            console.error('Error loading requests:', err);
            setError('Failed to load friend requests');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptRequest = async (requestId) => {
        try {
            await friendAPI.updateFriendRequest(requestId, 'accepted');
            setError('');
            await loadRequests();
        } catch (err) {
            console.error('Error accepting request:', err);
            setError('Failed to accept friend request');
        }
    };

    const handleRejectRequest = async (requestId) => {
        try {
            await friendAPI.updateFriendRequest(requestId, 'rejected');
            setError('');
            loadRequests();
        } catch (err) {
            console.error('Error rejecting request:', err);
            setError('Failed to reject friend request');
        }
    };

    const handleCancelRequest = async (requestId) => {
        try {
            await friendAPI.updateFriendRequest(requestId, 'rejected');
            setError('');
            loadRequests();
        } catch (err) {
            console.error('Error canceling request:', err);
            setError('Failed to cancel friend request');
        }
    };

    const searchUsers = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setSearchLoading(true);
        setError('');

        try {
            const response = await userAPI.searchUsers(query);
            const filteredResults = response.data.filter(userItem => userItem.id !== user.id);
            setSearchResults(filteredResults);
        } catch (err) {
            console.error('Search error:', err);
            setError('Failed to search users');
        } finally {
            setSearchLoading(false);
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
            await loadRequests();
            setSearchResults(prev => prev.map(user => 
                user.id === userId ? { ...user, requestSent: true } : user
            ));
        } catch (err) {
            console.error('Error sending friend request:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Failed to send friend request');
            }
        }
    };

    const isRequestSent = (userId) => {
        return sentRequests.some(req => req.receiver_id === userId);
    };

    const isRequestReceived = (userId) => {
        return pendingRequests.some(req => req.sender_id === userId);
    };

    const getRequestStatus = (userId) => {
        if (isRequestSent(userId)) return 'sent';
        if (isRequestReceived(userId)) return 'received';
        return 'none';
    };

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="friend-requests-page">
            <div className="page-header">
                <button className="back-btn" onClick={() => navigate('/chats')}>
                    ← Back
                </button>
                <h1>Friend Requests</h1>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'received' ? 'active' : ''}`}
                    onClick={() => setActiveTab('received')}
                >
                    Received ({pendingRequests.length})
                </button>
                <button
                    className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sent')}
                >
                    Sent ({sentRequests.length})
                </button>
                <button
                    className={`tab ${activeTab === 'send' ? 'active' : ''}`}
                    onClick={() => setActiveTab('send')}
                >
                    Send Request
                </button>
            </div>

            <div className="requests-content">
                {loading ? (
                    <div className="loading">Loading...</div>
                ) : (
                    <>
                        {activeTab === 'received' && (
                            <div className="requests-list">
                                {pendingRequests.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No pending friend requests</p>
                                    </div>
                                ) : (
                                    pendingRequests.map(request => (
                                        <div key={request.id} className="request-card">
                                            <div className="request-user-info">
                                                <div className="user-avatar">
                                                    {request.sender?.avatar_url ? (
                                                        <img src={request.sender.avatar_url} alt={request.sender.display_name} />
                                                    ) : (
                                                        <span>{request.sender?.display_name?.charAt(0) || '?'}</span>
                                                    )}
                                                </div>
                                                <div className="user-details-inline">
                                                    <h3>{request.sender?.display_name || 'Unknown User'}</h3>
                                                    <p className="username">@{request.sender?.username || 'unknown'}</p>
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
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'sent' && (
                            <div className="requests-list">
                                {sentRequests.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No sent friend requests</p>
                                    </div>
                                ) : (
                                    sentRequests.map(request => (
                                        <div key={request.id} className="request-card">
                                            <div className="request-user-info">
                                                <div className="user-avatar">
                                                    {request.receiver?.avatar_url ? (
                                                        <img src={request.receiver.avatar_url} alt={request.receiver.display_name} />
                                                    ) : (
                                                        <span>{request.receiver?.display_name?.charAt(0) || '?'}</span>
                                                    )}
                                                </div>
                                                <div className="user-details-inline">
                                                    <h3>{request.receiver?.display_name || 'Unknown User'}</h3>
                                                    <p className="username">@{request.receiver?.username || 'unknown'}</p>
                                                </div>
                                            </div>
                                            <div className="request-actions">
                                                <button
                                                    className="cancel-btn"
                                                    onClick={() => handleCancelRequest(request.id)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'send' && (
                            <div className="send-request-section">
                                <div className="search-container-inline">
                                    <div className="search-input-wrapper">
                                        <input
                                            type="text"
                                            placeholder="Search by username or name..."
                                            value={searchQuery}
                                            onChange={handleSearchChange}
                                            className="search-input-inline"
                                        />
                                        {searchLoading && <div className="loading-spinner-inline">⟳</div>}
                                    </div>
                                </div>

                                {searchResults.length > 0 && (
                                    <div className="requests-list">
                                        {searchResults.map(user => {
                                            const requestStatus = getRequestStatus(user.id);
                                            return (
                                                <div key={user.id} className="request-card">
                                                    <div className="request-user-info">
                                                        <div className="user-avatar">
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.display_name} />
                                                            ) : (
                                                                <span>{user.display_name?.charAt(0) || '?'}</span>
                                                            )}
                                                        </div>
                                                        <div className="user-details-inline">
                                                            <h3>{user.display_name || 'Unknown User'}</h3>
                                                            <p className="username">@{user.username || 'unknown'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="request-actions">
                                                        {requestStatus === 'sent' && (
                                                            <span className="request-status-sent">Request Sent</span>
                                                        )}
                                                        {requestStatus === 'received' && (
                                                            <span className="request-status-received">Request Received</span>
                                                        )}
                                                        {requestStatus === 'none' && (
                                                            <button
                                                                className="send-request-btn"
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

                                {searchQuery && !searchLoading && searchResults.length === 0 && (
                                    <div className="empty-state">
                                        <p>No users found matching "{searchQuery}"</p>
                                    </div>
                                )}

                                {!searchQuery && (
                                    <div className="empty-state">
                                        <p>Search for users to send friend requests</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default FriendRequestsPage;

