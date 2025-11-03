import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    async (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        // Log API responses for debugging
        if (response.config.url?.includes('/messages/')) {
            console.log('API Response Interceptor - Messages:', {
                url: response.config.url,
                status: response.status,
                dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
                dataType: Array.isArray(response.data) ? 'array' : typeof response.data
            });
        }
        return response;
    },
    (error) => {
        // Log API errors for debugging
        if (error.config?.url?.includes('/messages/')) {
            console.error('API Error Interceptor - Messages:', {
                url: error.config?.url,
                status: error.response?.status,
                message: error.message,
                data: error.response?.data
            });
        }
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// AUTH API
export const authAPI = {
    /**
     * Logs in user. RETURNS ONLY ACCESS TOKEN - Use getMe() to fetch user data after login
     */
    login: (email, password) =>
        api.post('/auth/login', { email, password }),

    /**
     * Registers user. RETURNS ONLY ACCESS TOKEN - Use getMe() to fetch user data after register
     */
    register: (email, username, password) =>
        api.post('/auth/register', { email, username, password }),

    checkUsername: (username) =>
        api.get('/auth/check-username', { params: { username } }),

    getMe: () =>
        api.get('/auth/me'),

    setupProfile: (displayName, avatarUrl) => {
        const formData = new FormData();
        formData.append('display_name', displayName);
        if (avatarUrl) {
            formData.append('avatar_url', avatarUrl);
        }
        return api.post('/auth/setup-profile', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    /**
     * Refreshes the access token using a valid refresh token. 
     * Returns new access/refresh tokens and their expiries.
     */
    refresh: (refreshToken) =>
        api.post('/auth/refresh', { refresh_token: refreshToken }),
};

// User API
export const userAPI = {
    getProfile: (userId) => api.get(`/users/profile/${userId}`),

    updateProfile: (userId, data) =>
        api.put(`/users/profile?user_id=${userId}`, data),

    searchUsers: (query) => api.get(`/users/search?query=${encodeURIComponent(query)}`),

    searchUsersByPhone: (phone) => api.get(`/users/search/phone?phone=${phone}`),

    blockUser: (userId, blockedUserId) =>
        api.post(`/users/block/${blockedUserId}?user_id=${userId}`),

    unblockUser: (userId, unblockedUserId) =>
        api.post(`/users/unblock/${unblockedUserId}?user_id=${userId}`),
    
    getBlockedUsers: () =>
        api.get('/users/blocked'),
};

// Friend API
export const friendAPI = {
    sendFriendRequest: (receiverId) =>
        api.post(`/friends/request/${receiverId}`),

    updateFriendRequest: (requestId, status) => 
        api.put(`/friends/request/${requestId}`, { status }),
    
    cancelFriendRequest: (requestId) =>
        api.delete(`/friends/request/${requestId}`),

    getFriendRequests: () =>
        api.get('/friends/requests'),

    getPendingRequests: () =>
        api.get('/friends/requests/pending'),

    getContacts: () =>
        api.get('/friends/contacts'),
    
    getAcceptedContacts: () =>
        api.get('/friends/contacts/accepted'),

    getFriends: () =>
        api.get('/friends/contacts'),

    getAcceptedFriends: () =>
        api.get('/friends/friends'),
};

// Message API
export const messageAPI = {
    sendMessage: (data) => api.post('/messages/', data),

    getMessages: (conversationId, skip = 0, limit = 10) =>
        api.get(`/messages/${conversationId}?skip=${skip}&limit=${limit}`),

    markDelivered: (messageId, userId) =>
        api.put(`/messages/${messageId}/deliver?user_id=${userId}`),

    markRead: (messageId, userId) =>
        api.put(`/messages/${messageId}/read?user_id=${userId}`),

    deleteMessage: (messageId, userId, deleteForEveryone = false) =>
        api.delete(`/messages/${messageId}?user_id=${userId}&delete_for_everyone=${deleteForEveryone}`),
};

// Conversation API
export const conversationAPI = {
    muteConversation: (conversationId, userId) =>
        api.post(`/conversations/${conversationId}/mute?user_id=${userId}`),
    
    unmuteConversation: (conversationId, userId) =>
        api.post(`/conversations/${conversationId}/unmute?user_id=${userId}`),
    getConversations: () =>
        api.get('/conversations/'),
    
    getOrCreateConversation: (userId) =>
        api.get(`/conversations/with/${userId}`),
};

// Upload API
export const uploadAPI = {
    uploadFile: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/uploads/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    },

    getFile: (filename) =>
        api.get(`/uploads/file/${filename}`, { responseType: 'blob' }),
};

// Group API
export const groupAPI = {
    createGroup: (creatorId, data) =>
        api.post(`/groups/?creator_id=${creatorId}`, data),

    updateGroup: (groupId, userId, data) =>
        api.put(`/groups/${groupId}?user_id=${userId}`, data),

    addMembers: (groupId, userId, memberIds) =>
        api.post(`/groups/${groupId}/members?user_id=${userId}`, memberIds),

    removeMember: (groupId, userId, memberId) =>
        api.delete(`/groups/${groupId}/members?user_id=${userId}&member_id=${memberId}`),

    promoteAdmin: (groupId, userId, memberId) =>
        api.post(`/groups/${groupId}/admins?user_id=${userId}&member_id=${memberId}`),

    demoteAdmin: (groupId, userId, memberId) =>
        api.delete(`/groups/${groupId}/admins?user_id=${userId}&member_id=${memberId}`),
};

// Call API
export const callAPI = {
    initiateCall: (data) => api.post('/calls/', data),

    updateCall: (callId, userId, data) =>
        api.put(`/calls/${callId}?user_id=${userId}`, data),

    getCall: (callId) => api.get(`/calls/${callId}`),

    getCallHistory: (userId, skip = 0, limit = 50) =>
        api.get(`/calls/history?user_id=${userId}&skip=${skip}&limit=${limit}`),
};

// Invite API
export const inviteAPI = {
    createInvite: (ownerId) => api.post(`/invites/?owner_id=${ownerId}`),

    getInvite: (code) => api.get(`/invites/${code}`),

    deleteInvite: (code, userId) => api.delete(`/invites/${code}?user_id=${userId}`),
};

export default api;