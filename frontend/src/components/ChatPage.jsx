import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import websocketService from '../services/websocket';
import { friendAPI, messageAPI, conversationAPI, userAPI } from '../services/api';
import UserSearch from './UserSearch';
import SkeletonLoader, { SkeletonConversation, SkeletonMessage } from './SkeletonLoader';
import MessageContextMenu from './MessageContextMenu';
import TopHeader from './TopHeader';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import './ChatPage.css';

const ChatPage = () => {
    const { user, activeConversation, setActiveConversation, logout, friendRequests } = useAppContext();
    const toast = useToast();
    const [conversations, setConversations] = useState([]);
    const [filteredConversations, setFilteredConversations] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [conversationFilter, setConversationFilter] = useState('all'); // all | unread | groups
    const [messages, setMessages] = useState([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [reduceMotion, setReduceMotion] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [showUserSearch, setShowUserSearch] = useState(false);
    const [friends, setFriends] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [chatHeaderMenu, setChatHeaderMenu] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [filteredMessages, setFilteredMessages] = useState([]);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const conversationsListRef = useRef(null);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [messagesOffset, setMessagesOffset] = useState(0);
    const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
    const isLoadingMoreRef = useRef(false);
    const scrollThrottleRef = useRef(null);
    const isLoadingOlderMessagesRef = useRef(false); // Track when loading older messages to prevent auto-scroll
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);
    const audioInputRef = useRef(null);
    const markedAsReadRef = useRef(new Set());
    const readReceiptTimeoutRef = useRef(null);
    const chatMenuRef = useRef(null);
    const chatMenuButtonRef = useRef(null);
    const messageSearchInputRef = useRef(null);
    const messageSearchRef = useRef(null);
    const attachmentMenuRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const navigate = useNavigate();

    // Helper function to truncate messages - defined early so it's available everywhere
    const truncateMessage = (text, maxLength = 15) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    // Helper function to get full media/file URL (works for images, documents, music, etc.)
    const getMediaUrl = (url, messageType = null) => {
        if (!url) return '';
        // If it's already a full URL or base64, return as is
        if (url.startsWith('http') || url.startsWith('data:')) {
            return url;
        }
        // Otherwise, construct full URL from API
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        // Ensure URL starts with / if it doesn't already
        let cleanUrl = url.startsWith('/') ? url : `/${url}`;
        
        // Remove duplicate /uploads if present (some URLs might have it twice)
        cleanUrl = cleanUrl.replace(/^\/uploads\/uploads\//, '/uploads/');
        
        // Fix legacy URLs with wrong folder names (old code used singular, new uses plural)
        // /uploads/attachments/image/ -> /uploads/attachments/images/
        cleanUrl = cleanUrl.replace(/\/attachments\/image\//, '/attachments/images/');
        cleanUrl = cleanUrl.replace(/\/attachments\/file\//, '/attachments/files/');
        // Note: 'music' is already correct (same singular/plural)
        
        // Ensure the URL follows the dynamic path structure:
        // - /uploads/attachments/images/ for images
        // - /uploads/attachments/music/ for audio files
        // - /uploads/attachments/files/ for documents and other files
        // - /uploads/profile_images/ for profile images
        
        return `${apiUrl}${cleanUrl}`;
    };
    
    // Alias for backward compatibility (images, avatars, etc.)
    const getImageUrl = (url) => getMediaUrl(url, 'image');

    useEffect(() => {
        const handleOpenUserSearch = () => {
            setShowUserSearch(true);
        };
        window.addEventListener('openUserSearch', handleOpenUserSearch);
        return () => window.removeEventListener('openUserSearch', handleOpenUserSearch);
    }, []);

    useEffect(() => {
        const handleFilter = (e) => {
            const key = e?.detail?.filter || 'all';
            setConversationFilter(key);
        };
        window.addEventListener('setConversationFilter', handleFilter);
        return () => window.removeEventListener('setConversationFilter', handleFilter);
    }, []);

    const loadFriends = useCallback(async () => {
        setLoadingConversations(true);
        try {
            const response = await friendAPI.getAcceptedFriends();
            const friendsList = response.data;
            setFriends(friendsList);
            
            // Get or create conversations for each friend
            const friendConversations = await Promise.all(
                friendsList.map(async (friend) => {
                    try {
                        const convResponse = await conversationAPI.getOrCreateConversation(friend.id);
                        const conversation = convResponse.data;
                        
                        return {
                            id: conversation.id,
                            userId: friend.id,
                            name: friend.display_name,
                            username: friend.username,
                            avatar_url: friend.avatar_url,
                            lastMessage: truncateMessage(conversation.last_message || 'Start a conversation...', 15),
                            timestamp: conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
                            unread: 0,
                            isFriend: true,
                            isGroup: false,
                            isMuted: conversation.muted_by ? conversation.muted_by.includes(user.id) : false
                        };
                    } catch (error) {
                        console.error(`Error getting conversation for friend ${friend.id}:`, error);
                        return null;
                    }
                })
            );
            
            const filtered = friendConversations.filter(conv => conv !== null);
            setConversations(filtered);
            setFilteredConversations(filtered);
        } catch (err) {
            console.error('Error loading friends:', err);
            setConversations([]);
            setFilteredConversations([]);
        } finally {
            setLoadingConversations(false);
        }
    }, []);

    // Apply search + filter together
    useEffect(() => {
        const applyFilters = () => {
            let list = [...conversations];
            if (conversationFilter === 'unread') {
                list = list.filter(c => (c.unread || 0) > 0);
            } else if (conversationFilter === 'groups') {
                list = list.filter(c => c.isGroup);
            }
            if (searchQuery.trim() !== '') {
                const q = searchQuery.toLowerCase();
                list = list.filter(conv =>
                    conv.name?.toLowerCase().includes(q) ||
                    conv.lastMessage?.toLowerCase().includes(q)
                );
            }
            setFilteredConversations(list);
        };
        applyFilters();
    }, [searchQuery, conversations, conversationFilter]);

    const loadMessages = useCallback(async (conversationId, preserveExisting = false, skip = 0, loadOlder = false) => {
        if (!conversationId) {
            console.error('loadMessages called with no conversationId');
            return;
        }
        
        // Prevent multiple simultaneous loads
        if (isLoadingMoreRef.current && loadOlder) {
            return;
        }
        
        console.log(`Starting to load messages for conversation: ${conversationId}, skip: ${skip}, loadOlder: ${loadOlder}`);
        
        if (loadOlder) {
            isLoadingMoreRef.current = true;
            setIsLoadingMoreMessages(true);
            isLoadingOlderMessagesRef.current = true; // Mark that we're loading older messages
        } else {
            setLoadingMessages(true);
            isLoadingOlderMessagesRef.current = false; // Not loading older messages
        }
        
        try {
            console.log(`Calling API: messageAPI.getMessages(${conversationId}, skip=${skip}, limit=20)`);
            const response = await messageAPI.getMessages(conversationId, skip, 20);
            console.log(`API returned ${response.data?.length || 0} messages with skip=${skip}`);
            console.log('API Response received:', {
                status: response.status,
                hasData: !!response.data,
                dataType: Array.isArray(response.data) ? 'array' : typeof response.data,
                dataLength: Array.isArray(response.data) ? response.data.length : 'N/A'
            });
            
            const msgs = response.data || [];
            
            console.log(`Loaded ${msgs.length} messages from API for conversation ${conversationId}`);
            
            // Check if there are more messages to load
            if (msgs.length < 20) {
                setHasMoreMessages(false);
            } else {
                setHasMoreMessages(true);
            }
            
            if (msgs.length > 0) {
                console.log('Sample message:', {
                    id: msgs[0].id,
                    type: msgs[0].type,
                    text: msgs[0].text,
                    media_url: msgs[0].media_url,
                    created_at: msgs[0].created_at,
                    sender_id: msgs[0].sender_id
                });
            } else {
                console.warn(`No messages returned from API for conversation ${conversationId}`);
                if (loadOlder) {
                    setHasMoreMessages(false);
                }
            }
            
            // Backend returns messages in DESC order (newest first)
            // For initial load (skip=0): Reverse to show oldest first
            // For loading older messages (skip>0): These are older, so reverse them too to maintain oldest-first order
            const reversedMsgs = [...msgs].reverse(); // Use spread to avoid mutating original array
            
            // Backend already filters deleted messages, but do additional safety check
            const filteredMessages = reversedMsgs.filter(msg => {
                // Check if message is deleted for current user (handle both string and UUID formats)
                const userIdStr = String(user.id);
                // Handle empty arrays - could be [] or null or undefined
                const deletedFor = msg.deleted_for || [];
                const deletedForArray = Array.isArray(deletedFor) ? deletedFor : [];
                const isDeletedForMe = deletedForArray.some(deletedId => String(deletedId) === userIdStr);
                
                // deleted_for_everyone is a string in DB, so check if it's truthy (not null, not empty, not "false")
                const isDeletedForEveryone = msg.deleted_for_everyone && 
                    String(msg.deleted_for_everyone).trim() !== "" && 
                    String(msg.deleted_for_everyone).toLowerCase() !== "false";
                const isDeleted = isDeletedForMe || isDeletedForEveryone;
                if (isDeleted) {
                    console.log('Filtering out deleted message:', msg.id);
                }
                return !isDeleted;
            });
            
            console.log(`After frontend filtering: ${filteredMessages.length} messages`);
            console.log('Final messages to display:', filteredMessages.map(m => ({ id: m.id, type: m.type, text: m.text, media_url: m.media_url })));
            
            // Store scroll position before adding messages (only for loading older messages)
            const messagesContainer = messagesContainerRef.current || document.querySelector('.messages-container');
            let previousScrollHeight = 0;
            let previousScrollTop = 0;
            
            if (loadOlder && messagesContainer) {
                previousScrollHeight = messagesContainer.scrollHeight;
                previousScrollTop = messagesContainer.scrollTop;
            }
            
            // If preserveExisting is true or loading older messages, merge with existing messages
            if (preserveExisting || loadOlder) {
                // Use a more efficient batch update to prevent multiple re-renders
                setMessages(prev => {
                    if (loadOlder) {
                        // When loading older messages, prepend them at the beginning
                        // Create a map to avoid duplicates
                        const existingMap = new Map();
                        prev.forEach(msg => {
                            existingMap.set(String(msg.id), msg);
                        });
                        
                        // Add new older messages (they should be older than existing ones)
                        filteredMessages.forEach(msg => {
                            if (!existingMap.has(String(msg.id))) {
                                existingMap.set(String(msg.id), msg);
                            }
                        });
                        
                        // Convert to array and sort by created_at (oldest first)
                        const merged = Array.from(existingMap.values());
                        merged.sort((a, b) => {
                            const dateA = new Date(a.created_at || 0);
                            const dateB = new Date(b.created_at || 0);
                            return dateA - dateB;
                        });
                        
                        console.log(`Merged messages: ${merged.length} total (added ${filteredMessages.length} older messages)`);
                        return merged;
                    } else {
                        // For other cases, merge normally
                        const existingMap = new Map();
                        prev.forEach(msg => {
                            existingMap.set(String(msg.id), msg);
                        });
                        
                        filteredMessages.forEach(msg => {
                            existingMap.set(String(msg.id), msg);
                        });
                        
                        const merged = Array.from(existingMap.values());
                        merged.sort((a, b) => {
                            const dateA = new Date(a.created_at || 0);
                            const dateB = new Date(b.created_at || 0);
                            return dateA - dateB;
                        });
                        
                        return merged;
                    }
                });
                
                // Restore scroll position after loading older messages (to prevent jumping)
                if (loadOlder && messagesContainer && previousScrollHeight > 0) {
                    // Immediately prevent scroll during DOM update
                    messagesContainer.style.overflowY = 'hidden';
                    
                    // Use requestAnimationFrame for smoother updates
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            // Double RAF ensures DOM is fully updated
                            const newScrollHeight = messagesContainer.scrollHeight;
                            const scrollDifference = newScrollHeight - previousScrollHeight;
                            
                            if (scrollDifference > 0) {
                                // Maintain scroll position by adjusting for new content height
                                // Add exact pixel value to prevent any flicker
                                messagesContainer.scrollTop = previousScrollTop + scrollDifference;
                                console.log(`Scroll restored: old=${previousScrollTop.toFixed(0)}, new=${messagesContainer.scrollTop.toFixed(0)}, diff=${scrollDifference.toFixed(0)}`);
                            }
                            
                            // Re-enable scrolling after position is set
                            messagesContainer.style.overflowY = 'auto';
                            
                            // Small delay to ensure scroll position is stable
                            setTimeout(() => {
                                isLoadingMoreRef.current = false;
                                setIsLoadingMoreMessages(false);
                                
                                // Clear the flag after DOM is fully settled
                                setTimeout(() => {
                                    isLoadingOlderMessagesRef.current = false;
                                }, 200);
                            }, 50);
                        });
                    });
                } else {
                    isLoadingMoreRef.current = false;
                    setIsLoadingMoreMessages(false);
                    isLoadingOlderMessagesRef.current = false;
                }
            } else {
                console.log(`Setting ${filteredMessages.length} messages to state`);
                setMessages(filteredMessages);
                setMessagesOffset(filteredMessages.length);
                
                // Scroll to bottom only on initial load (not when loading older messages)
                setTimeout(() => {
                    scrollToBottom();
                }, 100);
            }
            
            // Log final state
            if (filteredMessages.length === 0 && !loadOlder) {
                console.warn(`⚠️ No messages to display for conversation ${conversationId}. Check backend logs for details.`);
            }
        } catch (err) {
            console.error('Error loading messages:', err);
            console.error('Error details:', {
                message: err.message,
                response: err.response?.data,
                status: err.response?.status,
                statusText: err.response?.statusText,
                conversationId: conversationId
            });
            
            // Check if it's an authorization error
            if (err.response?.status === 403) {
                console.error('403 Forbidden: User may not be a member of this conversation');
                toast.error('You are not authorized to view messages in this conversation');
            } else if (err.response?.status === 404) {
                console.error('404 Not Found: Conversation does not exist');
                toast.error('Conversation not found');
            } else {
                if (!loadOlder) {
                    toast.error('Failed to load messages');
                }
            }
            
            if (!preserveExisting && !loadOlder) {
                setMessages([]);
            }
            isLoadingMoreRef.current = false;
            setIsLoadingMoreMessages(false);
            isLoadingOlderMessagesRef.current = false;
        } finally {
            if (!loadOlder) {
                setLoadingMessages(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]); // Only depend on user.id, not the entire user object or toast

    useEffect(() => {
        if (user) {
            loadFriends();
            
            // Request notification permission
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        console.log('Notification permission granted');
                    }
                });
            }
        }
    }, [user, loadFriends]);

    // Respect user's reduced motion preference; also provides quick toggle point if needed
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = () => setReduceMotion(media.matches);
        handler();
        media.addEventListener?.('change', handler);
        return () => media.removeEventListener?.('change', handler);
    }, []);

    // Removed duplicate search filter - handled in the applyFilters effect above

    useEffect(() => {
        if (!user?.id) return;
        
        const handleMessage = (data) => {
            // Debug logging for received messages
            console.log('WebSocket message received:', {
                id: data.id,
                conversation_id: data.conversation_id,
                active_conversation_id: activeConversation?.id,
                type: data.message_type,
                has_media: !!data.media_url,
                media_url: data.media_url
            });
            
            // Normalize IDs to strings for comparison (handles UUID vs string mismatch)
            const receivedConvId = String(data.conversation_id || '');
            const activeConvId = String(activeConversation?.id || '');
            
            // Process message if it's for the active conversation
            const isForActiveConversation = receivedConvId === activeConvId;
            
            if (isForActiveConversation) {
                // Don't add if message already exists (avoid duplicates)
                setMessages(prev => {
                    const exists = prev.some(msg => String(msg.id) === String(data.id));
                    if (exists) {
                        console.log('Message already exists, updating instead of skipping:', data.id);
                        // Update existing message instead of skipping (in case data changed)
                        return prev.map(msg => {
                            if (String(msg.id) === String(data.id)) {
                                return {
                                    ...msg,
                                    text: data.text,
                                    emojis: data.emojis !== undefined ? data.emojis : msg.emojis, // Update emojis if provided
                                    type: data.message_type || msg.type,
                                    media_url: data.media_url || msg.media_url,
                                    file_name: data.file_name || msg.file_name,
                                    file_size: data.file_size || msg.file_size,
                                    latitude: data.latitude !== undefined ? data.latitude : msg.latitude, // Update latitude for location messages
                                    longitude: data.longitude !== undefined ? data.longitude : msg.longitude, // Update longitude for location messages
                                    delivered_to: data.delivered_to || msg.delivered_to || [],
                                    read_by: data.read_by || msg.read_by || []
                                };
                            }
                            return msg;
                        });
                    }
                    
                    // Add new message to the end
                    console.log('Adding message to active conversation:', data.id);
                    const newMessage = {
                        id: data.id || Date.now(),
                        sender_id: data.sender_id,
                        text: data.text,
                        emojis: data.emojis || null, // Include emojis field from WebSocket
                        type: data.message_type || 'text',
                        media_url: data.media_url,
                        file_name: data.file_name,
                        file_size: data.file_size,
                        latitude: data.latitude || null, // Include latitude for location messages
                        longitude: data.longitude || null, // Include longitude for location messages
                        created_at: data.created_at || new Date().toISOString(),
                        delivered_to: data.delivered_to || [],
                        read_by: data.read_by || []
                    };
                    
                    // Insert in correct chronological order
                    const sorted = [...prev, newMessage].sort((a, b) => {
                        const dateA = new Date(a.created_at || 0);
                        const dateB = new Date(b.created_at || 0);
                        return dateA - dateB;
                    });
                    
                    return sorted;
                });
                
                // Only scroll to bottom if not loading older messages (new incoming messages)
                if (!isLoadingOlderMessagesRef.current) {
                    setTimeout(() => {
                        if (!isLoadingOlderMessagesRef.current) {
                            scrollToBottom();
                        }
                    }, 100);
                }
            } else {
                console.log('Message not for active conversation. Received:', receivedConvId, 'Active:', activeConvId);
            }
            
            // Mark sender as online when receiving a message
            if (data.sender_id && String(data.sender_id) !== String(user.id)) {
                setOnlineUsers(prev => new Set([...prev, String(data.sender_id)]));
            }
            
            // Update conversation list but DON'T increment unread here
            // Unread will be incremented by notification handler when chat is not open
            // This prevents double incrementing (notification + message both incrementing)
            // Only update last message if it's from other user, not from sender
            const isFromOtherUser = String(data.sender_id) !== String(user.id);
            
            if (isFromOtherUser) {
                // Only update last message if message is from other user
                setConversations(prevConvs => prevConvs.map(conv => {
                    // Normalize IDs to strings for comparison
                    const convId = String(conv.id || '');
                    const dataConvId = String(data.conversation_id || '');
                    
                    if (convId === dataConvId) {
                        const isActiveConversation = String(activeConversation?.id || '') === dataConvId;
                        
                        // Determine last message text based on message type
                        let lastMessageText = data.text;
                        if (!lastMessageText) {
                            if (data.message_type === 'image') {
                                lastMessageText = '📷 Image';
                            } else if (data.message_type === 'audio' || data.message_type === 'music') {
                                lastMessageText = '🎵 Audio';
                            } else if (data.message_type === 'document' || data.message_type === 'file') {
                                lastMessageText = data.file_name || '📄 File';
                            } else if (data.message_type === 'location') {
                                lastMessageText = '📍 Location';
                            } else {
                                lastMessageText = 'File';
                            }
                        }
                        
                        // IMPORTANT: For non-active conversations, don't update here
                        // Notification handler will handle the update with unread increment
                        // This prevents double updates (handleMessage + handleNotification both updating)
                        if (isActiveConversation) {
                            // Only update for active conversation to show latest message/timestamp
                            const truncatedMessage = truncateMessage(lastMessageText, 15);
                            const updated = {
                                ...conv,
                                lastMessage: truncatedMessage,
                                timestamp: 'Just now',
                                unread: 0 // Active conversation always has 0 unread
                            };
                            if (searchQuery.trim() === '' || 
                                updated.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                updated.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())) {
                                setFilteredConversations(prev => {
                                    const existing = prev.find(c => c.id === updated.id);
                                    if (existing) {
                                        return prev.map(c => c.id === updated.id ? updated : c);
                                    }
                                    return [...prev, updated];
                                });
                            }
                            return updated;
                        } else {
                            // For non-active conversations, don't update here
                            // Let notification handler update with proper unread increment
                            return conv;
                        }
                    }
                    return conv;
                }));
            }
            
            // Send delivery receipt automatically when receiving a message via WebSocket only
            if (String(data.sender_id) !== String(user.id) && data.id) {
                // Mark as delivered via WebSocket (backend handles DB update)
                setTimeout(() => {
                    websocketService.send({
                        type: 'delivery_receipt',
                        message_id: data.id
                    });
                }, 100);
            }
        };

        const handleMessageDeleted = (data) => {
            console.log('Message deleted event received:', data);
            const deletedMessageId = String(data.message_id || data.messageId);
            const deletedConvId = String(data.conversation_id || '');
            const activeConvId = String(activeConversation?.id || '');
            
            // Only update if it's for the active conversation
            if (deletedConvId === activeConvId) {
                setMessages(prev => prev.filter(msg => String(msg.id) !== deletedMessageId));
                
                // Update conversation list - remove message preview if it was the last message
                setConversations(prevConvs => prevConvs.map(conv => {
                    if (String(conv.id) === deletedConvId) {
                        // If this conversation's last message was deleted, update it
                        // The backend should update last_message, but we can handle it here too
                        return conv;
                    }
                    return conv;
                }));
            }
            
            // Show toast only if message was in active conversation
            if (deletedConvId === activeConvId) {
                toast.info(data.deleted_for_everyone ? 'Message deleted for everyone' : 'A message was deleted');
            }
        };

        const handleTyping = (data) => {
            console.log('User is typing:', data);
        };

        const handleReadReceipt = (data) => {
            // Only update if this receipt is for a message in the active conversation
            // This prevents unnecessary refreshes when other users read messages in other chats
            const receiptConvId = String(data.conversation_id || '');
            const activeConvId = String(activeConversation?.id || '');
            
            // Only update messages if this receipt is for the active conversation
            if (receiptConvId === activeConvId) {
                setMessages(prev => prev.map(msg => {
                    if (String(msg.id) === String(data.message_id)) {
                        const updatedReadBy = [...(msg.read_by || [])];
                        const userId = data.user_id;
                        if (!updatedReadBy.some(id => String(id) === String(userId))) {
                            updatedReadBy.push(userId);
                        }
                        return { ...msg, read_by: updatedReadBy };
                    }
                    return msg;
                }));
            }
            
            // Mark user as online when they read a message (doesn't need to cause re-render)
            if (data.user_id && String(data.user_id) !== String(user.id)) {
                setOnlineUsers(prev => new Set([...prev, String(data.user_id)]));
            }
        };

        const handleDeliveryReceipt = (data) => {
            // Only update if this receipt is for a message in the active conversation
            const receiptConvId = String(data.conversation_id || '');
            const activeConvId = String(activeConversation?.id || '');
            
            // Only update messages if this receipt is for the active conversation
            if (receiptConvId === activeConvId) {
                setMessages(prev => prev.map(msg => {
                    if (String(msg.id) === String(data.message_id)) {
                        const updatedDelivered = [...(msg.delivered_to || [])];
                        const userId = data.user_id;
                        if (!updatedDelivered.some(id => String(id) === String(userId))) {
                            updatedDelivered.push(userId);
                        }
                        return { ...msg, delivered_to: updatedDelivered };
                    }
                    return msg;
                }));
            }
            
            // Mark user as online when they acknowledge delivery
            if (data.user_id && String(data.user_id) !== String(user.id)) {
                setOnlineUsers(prev => new Set([...prev, String(data.user_id)]));
            }
        };

        const handleFriendRequestAccepted = (data) => {
            console.log('Friend request accepted:', data);
            loadFriends();
            
            const accepterName = data.accepter_display_name || data.accepter_username;
            toast.success(`${accepterName} accepted your friend request! 🎉`);
        };

        const handleUserStatus = (data) => {
            if (data.type === 'user_status') {
                const userId = String(data.user_id);
                const status = data.status;
                
                if (status === 'online') {
                    setOnlineUsers(prev => new Set([...prev, userId]));
                } else if (status === 'offline') {
                    setOnlineUsers(prev => {
                        const updated = new Set(prev);
                        updated.delete(userId);
                        return updated;
                    });
                }
            }
        };

        const handleNotification = (data) => {
            console.log('Notification received:', data);
            // Check if this is a notification event (type can be in data.type or directly as notification)
            if (data.type === 'notification') {
                const conversationId = data.conversation_id;
                const senderId = data.sender_id;
                
                // IMPORTANT: Don't process notification if message is from current user (sender shouldn't get notification)
                if (senderId && String(senderId) === String(user.id)) {
                    console.log('Ignoring notification for own message');
                    return;
                }
                
                // IMPORTANT: Check if conversation is muted or currently active
                const notificationConversation = conversations.find(conv => String(conv.id) === String(conversationId));
                const isMutedConv = notificationConversation?.isMuted || false;
                const isActiveConv = String(activeConversation?.id) === String(conversationId);
                
                // Don't show notification if conversation is muted or active
                if (isMutedConv || isActiveConv) {
                    console.log('Ignoring notification - conversation muted or active:', { isMuted: isMutedConv, isActive: isActiveConv });
                    // Still update the conversation list (unread count) but don't show browser notification
                } else {
                    // Show browser notification only if not muted and not active
                    if ('Notification' in window && Notification.permission === 'granted') {
                        try {
                            new Notification(data.title || 'New Message', {
                                body: data.body || 'You have a new message',
                                icon: '/vite.svg',
                                badge: '/vite.svg'
                            });
                        } catch (error) {
                            console.error('Error showing notification:', error);
                        }
                    }
                }
                
                // Update conversation list with latest message and unread count
                // ONLY if this conversation is NOT currently active AND NOT muted
                console.log('Notification for conversation:', conversationId, 'Active conversation:', activeConversation?.id);
                
                if (conversationId && String(activeConversation?.id) !== String(conversationId) && !isMutedConv) {
                    // Use functional update to prevent race conditions
                    setConversations(prevConvs => prevConvs.map(conv => {
                        if (String(conv.id) === String(conversationId)) {
                            // Check if we already processed this notification (prevent double increment)
                            // Use a simple check: if lastMessage is already updated, don't increment again
                            const lastMessageText = data.body || 'New message';
                            const truncatedMessage = truncateMessage(lastMessageText, 15);
                            
                            // Only increment if lastMessage is different (new notification)
                            // OR if unread is 0 (to handle first message)
                            const shouldIncrement = conv.lastMessage !== truncatedMessage || (conv.unread || 0) === 0;
                            
                            console.log('Updating conversation preview and unread count for:', conv.id, 'Should increment:', shouldIncrement);
                            
                            return {
                                ...conv,
                                lastMessage: truncatedMessage,
                                timestamp: 'Just now',
                                unread: shouldIncrement ? (conv.unread || 0) + 1 : (conv.unread || 0)
                            };
                        }
                        return conv;
                    }));
                    
                    // Also update filtered conversations with same logic
                    setFilteredConversations(prev => prev.map(conv => {
                        if (String(conv.id) === String(conversationId)) {
                            const lastMessageText = data.body || 'New message';
                            const truncatedMessage = truncateMessage(lastMessageText, 15);
                            
                            // Same check to prevent double increment
                            const shouldIncrement = conv.lastMessage !== truncatedMessage || (conv.unread || 0) === 0;
                            
                            return {
                                ...conv,
                                lastMessage: truncatedMessage,
                                timestamp: 'Just now',
                                unread: shouldIncrement ? (conv.unread || 0) + 1 : (conv.unread || 0)
                            };
                        }
                        return conv;
                    }));
                }
            }
        };

        websocketService.on('message', handleMessage);
        websocketService.on('message_deleted', handleMessageDeleted);
        websocketService.on('typing', handleTyping);
        websocketService.on('read_receipt', handleReadReceipt);
        websocketService.on('delivery_receipt', handleDeliveryReceipt);
        websocketService.on('friend_request_accepted', handleFriendRequestAccepted);
        websocketService.on('user_status', handleUserStatus);
        websocketService.on('notification', handleNotification);

        return () => {
            websocketService.off('message', handleMessage);
            websocketService.off('message_deleted', handleMessageDeleted);
            websocketService.off('typing', handleTyping);
            websocketService.off('read_receipt', handleReadReceipt);
            websocketService.off('delivery_receipt', handleDeliveryReceipt);
            websocketService.off('friend_request_accepted', handleFriendRequestAccepted);
            websocketService.off('user_status', handleUserStatus);
            websocketService.off('notification', handleNotification);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConversation?.id, user?.id, searchQuery]); // Use stable dependencies, remove toast and loadFriends

    useEffect(() => {
        // Only scroll to bottom if:
        // 1. There are messages
        // 2. We're NOT loading older messages (to preserve scroll position when scrolling up)
        if (messages.length > 0 && !isLoadingOlderMessagesRef.current) {
            // Use setTimeout to ensure DOM is updated before scrolling
            setTimeout(() => {
                // Double-check flag before scrolling (in case it was cleared)
                if (!isLoadingOlderMessagesRef.current) {
                    scrollToBottom();
                }
            }, 100);
        }
    }, [messages.length]); // Only trigger on message count change, not array reference

    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutsideEmoji = (event) => {
            if (showEmojiPicker) {
                // Check if click is outside both the picker and the button
                const isClickOnPicker = emojiPickerRef.current && emojiPickerRef.current.contains(event.target);
                const isClickOnButton = emojiButtonRef.current && emojiButtonRef.current.contains(event.target);
                const isClickOnBackdrop = event.target.classList.contains('emoji-picker-backdrop');
                
                if (!isClickOnPicker && !isClickOnButton && !isClickOnBackdrop) {
                    setShowEmojiPicker(false);
                }
            }
        };

        if (showEmojiPicker) {
            // Use a slight delay to allow button click to toggle first
            document.addEventListener('mousedown', handleClickOutsideEmoji);
            document.addEventListener('touchstart', handleClickOutsideEmoji);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutsideEmoji);
            document.removeEventListener('touchstart', handleClickOutsideEmoji);
        };
    }, [showEmojiPicker]);

    // Close chat header menu when clicking outside
    useEffect(() => {
        const handleClickOutsideMenu = (event) => {
            if (chatHeaderMenu) {
                // Check if click is outside both the menu and the button
                const isClickOnMenu = chatMenuRef.current && chatMenuRef.current.contains(event.target);
                const isClickOnButton = chatMenuButtonRef.current && chatMenuButtonRef.current.contains(event.target);
                const isClickOnOverlay = event.target.classList.contains('context-menu-overlay');
                
                if (!isClickOnMenu && !isClickOnButton && !isClickOnOverlay) {
                    setChatHeaderMenu(false);
                }
            }
        };

        if (chatHeaderMenu) {
            // Use a slight delay to allow button click to toggle first
            document.addEventListener('mousedown', handleClickOutsideMenu);
            document.addEventListener('touchstart', handleClickOutsideMenu);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutsideMenu);
            document.removeEventListener('touchstart', handleClickOutsideMenu);
        };
    }, [chatHeaderMenu]);


    useEffect(() => {
        if (messageSearchQuery.trim() === '') {
            setFilteredMessages([]);
        } else {
            const filtered = messages.filter(msg =>
                msg.text?.toLowerCase().includes(messageSearchQuery.toLowerCase()) ||
                msg.file_name?.toLowerCase().includes(messageSearchQuery.toLowerCase())
            );
            setFilteredMessages(filtered);
        }
    }, [messageSearchQuery, messages]);

    useEffect(() => {
        if (showMessageSearch && messageSearchInputRef.current) {
            messageSearchInputRef.current.focus();
        }
    }, [showMessageSearch]);

    // Handle click outside to close search on mobile
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showMessageSearch && messageSearchRef.current && !messageSearchRef.current.contains(event.target)) {
                setShowMessageSearch(false);
                setMessageSearchQuery('');
                setFilteredMessages([]);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showMessageSearch]);

    useEffect(() => {
        if (activeConversation?.id) {
            const conversationId = String(activeConversation.id);
            console.log(`Active conversation changed. ID: ${conversationId}, Object:`, activeConversation);
            websocketService.joinRoom(conversationId);
            // Tell backend which conversation user is viewing
            websocketService.send({
                type: 'set_active_conversation',
                conversation_id: conversationId
            });
            // Load messages fresh when conversation changes
            console.log(`Calling loadMessages with conversation ID: ${activeConversation.id}`);
            setHasMoreMessages(true);
            setMessagesOffset(0);
            loadMessages(activeConversation.id, false, 0, false);
            setShowMessageSearch(false);
            setMessageSearchQuery('');
            setFilteredMessages([]);
            
            // Reset unread count for this conversation
            setConversations(prevConvs => prevConvs.map(conv =>
                conv.id === activeConversation.id
                    ? { ...conv, unread: 0 }
                    : conv
            ));
            
            // Mark conversation user as online when opening conversation
            if (activeConversation.userId) {
                setOnlineUsers(prev => new Set([...prev, String(activeConversation.userId)]));
            }

            return () => {
                // Clear active conversation when leaving
                websocketService.send({
                    type: 'leave_room',
                    room_id: conversationId
                });
                websocketService.leaveRoom(conversationId);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConversation?.id]); // Only depend on conversation ID, not the entire object or loadMessages

    // Mark messages as read when conversation is active and visible
    useEffect(() => {
        if (!activeConversation?.id || !messages.length || !user?.id) return;

        // Clear any existing timeout
        if (readReceiptTimeoutRef.current) {
            clearTimeout(readReceiptTimeoutRef.current);
        }

        // Debounce read receipt marking with longer delay
        readReceiptTimeoutRef.current = setTimeout(() => {
            // Get unread messages from other participant
            const otherParticipantId = activeConversation.userId;
            const userIdStr = String(user.id);
            const unreadMessages = messages.filter(
                msg => {
                    const msgId = String(msg.id);
                    const alreadyMarked = markedAsReadRef.current.has(msgId);
                    const isRead = msg.read_by && msg.read_by.some(id => String(id) === userIdStr);
                    return String(msg.sender_id) !== userIdStr && 
                           otherParticipantId &&
                           !alreadyMarked &&
                           !isRead;
                }
            );

            // Batch mark messages as read
            if (unreadMessages.length > 0) {
                // Mark each unread message as read via WebSocket only (no REST API spam)
                unreadMessages.forEach(msg => {
                    const msgId = String(msg.id);
                    markedAsReadRef.current.add(msgId);
                    websocketService.send({
                        type: 'read_receipt',
                        message_id: msg.id
                    });
                });
            }
        }, 2000); // Increased debounce to 2 seconds

        return () => {
            if (readReceiptTimeoutRef.current) {
                clearTimeout(readReceiptTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConversation?.id, messages.length, user?.id]); // Use stable dependencies

    // Reset marked messages when conversation changes
    useEffect(() => {
        markedAsReadRef.current.clear();
    }, [activeConversation?.id]);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
            // Fallback: scroll the messages container to bottom
            const messagesContainer = document.querySelector('.messages-container');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    };

    const handleSelectConversation = (conversation) => {
        setActiveConversation(conversation);
        setConversations(prevConvs => prevConvs.map(conv =>
            conv.id === conversation.id
                ? { ...conv, unread: 0 }
                : conv
        ));
        if (window.innerWidth <= 768) {
            document.querySelector('.chat-sidebar')?.classList.add('hide-mobile');
        }
    };

    const handleBackToChats = () => {
        setActiveConversation(null);
        if (window.innerWidth <= 768) {
            document.querySelector('.chat-sidebar')?.classList.remove('hide-mobile');
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setShowAttachmentMenu(false);
        }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check if it's an image
            if (file.type.startsWith('image/')) {
                setSelectedFile(file);
                setShowAttachmentMenu(false);
            } else {
                toast.error('Please select an image file');
            }
        }
    };

    const handleAudioSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check if it's an audio file
            if (file.type.startsWith('audio/')) {
                setSelectedFile(file);
                setShowAttachmentMenu(false);
            } else {
                toast.error('Please select an audio file');
            }
        }
    };

    const handleCameraClick = () => {
        // For mobile, trigger camera
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment'; // Use back camera
        input.onchange = handleImageSelect;
        input.click();
        setShowAttachmentMenu(false);
    };

    const handleGalleryClick = () => {
        imageInputRef.current?.click();
    };

    const handleDocumentClick = () => {
        fileInputRef.current?.click();
    };

    const handleAudioClick = () => {
        audioInputRef.current?.click();
    };

    const handleLocationClick = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    // Send location message directly
                    if (!activeConversation) {
                        toast.error('No active conversation');
                        setShowAttachmentMenu(false);
                        return;
                    }

                    try {
                        const messageData = {
                            conversation_id: activeConversation.id,
                            sender_id: user.id,
                            type: 'location',
                            text: null,
                            latitude: latitude,
                            longitude: longitude
                        };

                        const response = await messageAPI.sendMessage(messageData);
                        const savedMessage = response.data;
                        
                        // Add message optimistically
                        setMessages(prev => {
                            const exists = prev.some(msg => String(msg.id) === String(savedMessage.id));
                            if (exists) {
                                return prev.map(msg => 
                                    String(msg.id) === String(savedMessage.id) ? savedMessage : msg
                                );
                            }
                            const sorted = [...prev, savedMessage].sort((a, b) => {
                                const dateA = new Date(a.created_at || 0);
                                const dateB = new Date(b.created_at || 0);
                                return dateA - dateB;
                            });
                            return sorted;
                        });

                        setShowAttachmentMenu(false);
                        toast.success('Location sent');
                        
                        // Don't update lastMessage when sender sends location - only show messages from others
                        // The conversation preview will only update when recipient replies
                    } catch (error) {
                        console.error('Error sending location:', error);
                        toast.error('Failed to send location');
                    }
                },
                (error) => {
                    toast.error('Failed to get location: ' + error.message);
                    setShowAttachmentMenu(false);
                }
            );
        } else {
            toast.error('Geolocation is not supported by your browser');
            setShowAttachmentMenu(false);
        }
    };

    const handleContactClick = () => {
        toast.info('Contact sharing feature coming soon');
        setShowAttachmentMenu(false);
    };

    // Close attachment menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
                // Check if click is not on the attachment button
                const attachmentButton = event.target.closest('.attachment-button');
                if (!attachmentButton) {
                    setShowAttachmentMenu(false);
                }
            }
        };

        if (showAttachmentMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('touchstart', handleClickOutside);
            };
        }
    }, [showAttachmentMenu]);

    const uploadFile = async () => {
        if (!selectedFile) return null;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/uploads/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error uploading file:', error);
            toast.error('Failed to upload file');
            return null;
        } finally {
            setUploading(false);
            setSelectedFile(null);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !activeConversation) return;

        let fileData = null;
        if (selectedFile) {
            fileData = await uploadFile();
            if (!fileData) return;
        }

        const messageData = {
            conversation_id: activeConversation.id,
            sender_id: user.id,
            type: fileData ? fileData.type : 'text',
            text: newMessage.trim() || null,
            media_url: fileData?.url || null,
            file_name: fileData?.filename || null,
            file_size: fileData?.size || null
        };

        try {
            const response = await messageAPI.sendMessage(messageData);
            const savedMessage = response.data;
            
                // Debug logging for media URLs
            if (savedMessage.media_url) {
                console.log('Message saved:', {
                    media_url: savedMessage.media_url,
                    full_url: getMediaUrl(savedMessage.media_url, savedMessage.type),
                    type: savedMessage.type,
                    file_name: savedMessage.file_name
                });
            }
            
            // Optimistically add message to UI immediately
            const newMsg = {
                id: savedMessage.id,
                sender_id: savedMessage.sender_id,
                text: savedMessage.text,
                type: savedMessage.type,
                media_url: savedMessage.media_url,
                file_name: savedMessage.file_name,
                file_size: savedMessage.file_size,
                latitude: savedMessage.latitude || null, // Include latitude for location messages
                longitude: savedMessage.longitude || null, // Include longitude for location messages
                created_at: savedMessage.created_at,
                delivered_to: savedMessage.delivered_to || [],
                read_by: savedMessage.read_by || []
            };
            
            // Add message optimistically - check for duplicates first
            setMessages(prev => {
                // Check if message already exists (shouldn't, but be safe)
                const exists = prev.some(msg => String(msg.id) === String(savedMessage.id));
                if (exists) {
                    console.log('Message already in list, updating:', savedMessage.id);
                    return prev.map(msg => 
                        String(msg.id) === String(savedMessage.id) ? newMsg : msg
                    );
                }
                
                // Add new message and sort chronologically
                const sorted = [...prev, newMsg].sort((a, b) => {
                    const dateA = new Date(a.created_at || 0);
                    const dateB = new Date(b.created_at || 0);
                    return dateA - dateB;
                });
                
                return sorted;
            });
            
            // Scroll to bottom after sending message (but only if not loading older messages)
            if (!isLoadingOlderMessagesRef.current) {
                setTimeout(() => {
                    if (!isLoadingOlderMessagesRef.current) {
                        scrollToBottom();
                    }
                }, 100);
            }
            
            setNewMessage('');
            setSelectedFile(null);
            setShowEmojiPicker(false);

            // Don't update lastMessage when sender sends message - sender's preview will only update when recipient replies
            // Recipient will get the message via WebSocket and their preview will update live
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Failed to send message');
        }
    };

    const handleDeleteMessage = async (messageId, deleteForEveryone) => {
        try {
            await messageAPI.deleteMessage(messageId, user.id, deleteForEveryone);
            
            // Update local state immediately
            if (deleteForEveryone) {
                // Backend will broadcast the delete event via WebSocket
                // Remove message from UI immediately for better UX
                setMessages(prev => prev.filter(msg => String(msg.id) !== String(messageId)));
            } else {
                // Delete for me only - just remove from local state
                setMessages(prev => prev.filter(msg => String(msg.id) !== String(messageId)));
            }
            
            toast.success(deleteForEveryone ? 'Message deleted for everyone' : 'Message deleted for you');
        } catch (error) {
            console.error('Error deleting message:', error);
            toast.error('Failed to delete message');
        }
    };

    const handleMessageContextMenu = (e, message, position) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Determine if message is sent by current user
        const isSentByMe = message.sender_id === user.id;
        
        setContextMenu({
            message,
            position: position || { x: e.clientX, y: e.clientY },
            isSentByMe: isSentByMe
        });
    };

    const handleClearChat = async () => {
        if (!activeConversation) return;
        
        try {
            setMessages([]);
            toast.success('Chat cleared');
            setChatHeaderMenu(false);
        } catch (error) {
            console.error('Error clearing chat:', error);
            toast.error('Failed to clear chat');
        }
    };

    const handleBlockUser = async () => {
        if (!activeConversation || !activeConversation.userId) return;
        
        try {
            await userAPI.blockUser(user.id, activeConversation.userId);
            toast.success('User blocked successfully');
            setActiveConversation(null);
            loadFriends();
            setChatHeaderMenu(false);
        } catch (error) {
            console.error('Error blocking user:', error);
            toast.error('Failed to block user');
        }
    };

    const handleGoToProfile = () => {
        if (!activeConversation || !activeConversation.userId) return;
        setShowProfileModal(true);
        setChatHeaderMenu(false);
    };

    const handleToggleMute = async () => {
        if (!activeConversation) return;
        
        try {
            const isMuted = activeConversation.isMuted || false;
            
            if (isMuted) {
                await conversationAPI.unmuteConversation(activeConversation.id, user.id);
                toast.success('Conversation unmuted');
            } else {
                await conversationAPI.muteConversation(activeConversation.id, user.id);
                toast.success('Conversation muted');
            }
            
            // Update conversation state
            setConversations(prevConvs => prevConvs.map(conv => 
                conv.id === activeConversation.id 
                    ? { ...conv, isMuted: !isMuted }
                    : conv
            ));
            
            setFilteredConversations(prev => prev.map(conv => 
                conv.id === activeConversation.id 
                    ? { ...conv, isMuted: !isMuted }
                    : conv
            ));
            
            setActiveConversation(prev => prev ? { ...prev, isMuted: !isMuted } : null);
            setChatHeaderMenu(false);
        } catch (error) {
            console.error('Error toggling mute:', error);
            toast.error('Failed to toggle mute');
        }
    };

    const getMessageStatus = (message) => {
        if (message.sender_id !== user.id) return null;

        // Get other participant in conversation
        const otherParticipantId = activeConversation?.userId;
        if (!otherParticipantId) {
            return <span className="message-status sent">✓</span>;
        }

        // Check if message was read by the recipient
        const isRead = message.read_by && message.read_by.some(
            (id) => String(id) === String(otherParticipantId)
        );
        
        // Check if message was delivered to the recipient
        const isDelivered = message.delivered_to && message.delivered_to.some(
            (id) => String(id) === String(otherParticipantId)
        );

        // Check if recipient is online (has app open)
        const isRecipientOnline = onlineUsers.has(String(otherParticipantId));

        // Status logic:
        // 1. Blue tick (✓✓): Message is read (seen)
        // 2. Double gray tick (✓✓): Message is delivered AND user has app open but hasn't seen the chat
        // 3. Single tick (✓): User hasn't opened the application (not delivered OR not online)
        if (isRead) {
            // Blue tick - message is read (seen)
            return <span className="message-status read">✓✓</span>;
        } else if (isDelivered && isRecipientOnline) {
            // Double gray tick - message is delivered, recipient has app open, but chat not opened/seen
            return <span className="message-status delivered">✓✓</span>;
        } else {
            // Single tick - recipient hasn't opened the application (not delivered or offline)
            return <span className="message-status sent">✓</span>;
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessage = (message) => {
        // Normalize IDs to strings for comparison (handles UUID vs string mismatch)
        const isSentByMe = String(message.sender_id) === String(user?.id);

        // Check if message is deleted for everyone (handles string type from DB)
        const isDeletedForEveryone = message.deleted_for_everyone && 
            String(message.deleted_for_everyone).trim() !== "" && 
            String(message.deleted_for_everyone).toLowerCase() !== "false";
        
        if (isDeletedForEveryone) {
            return (
                <div key={message.id} className={`message ${isSentByMe ? 'sent' : 'received'}`}>
                    <div className="message-content deleted">
                        <span className="deleted-text">🚫 This message was deleted</span>
                        <div className="message-info">
                            <span className="timestamp">{formatTime(message.created_at)}</span>
                        </div>
                    </div>
                </div>
            );
        }
        
        return (
            <div 
                key={message.id} 
                className={`message ${isSentByMe ? 'sent' : 'received'}`}
            >
                <div className="message-content">
                    <button
                        className="message-options-btn"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            // For sent messages (right side), position menu to the left of the button
                            // For received messages (left side), position menu to the right of the button
                            const xPosition = isSentByMe ? rect.left : rect.right;
                            handleMessageContextMenu(e, message, { x: xPosition, y: rect.bottom });
                        }}
                    >
                        ⋮
                    </button>
                    {message.type === 'document' && message.file_name && (
                        <div className="message-file">
                            <div className="file-icon">📄</div>
                            <div className="file-info">
                                <div className="file-name">{message.file_name}</div>
                                <div className="file-size">{message.file_size}</div>
                            </div>
                            <a 
                                href={getMediaUrl(message.media_url, message.type)}
                                download={message.file_name}
                                className="file-download"
                            >
                                ⬇
                            </a>
                        </div>
                    )}
                    {(message.type === 'audio' || message.type === 'music') && message.file_name && (
                        <div className="message-file">
                            <div className="file-icon">🎵</div>
                            <div className="file-info">
                                <div className="file-name">{message.file_name}</div>
                                <div className="file-size">{message.file_size}</div>
                            </div>
                            <audio 
                                controls 
                                src={getMediaUrl(message.media_url, message.type)}
                                className="message-audio-player"
                            >
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    )}
                    {message.type === 'image' && message.media_url && (
                        <div className="message-image">
                            <img 
                                src={getMediaUrl(message.media_url, message.type)}
                                alt="Shared image"
                                onLoad={() => {
                                    console.log('Image loaded successfully:', getMediaUrl(message.media_url, message.type));
                                }}
                                onError={(e) => {
                                    console.error('Image load error - Original media_url:', message.media_url);
                                    console.error('Image load error - Full URL:', getMediaUrl(message.media_url, message.type));
                                    console.error('Image load error - Message type:', message.type);
                                    const errorDiv = document.createElement('div');
                                    errorDiv.className = 'image-error';
                                    errorDiv.textContent = '⚠️ Failed to load image';
                                    e.target.parentElement.replaceChild(errorDiv, e.target);
                                }}
                                loading="lazy"
                                crossOrigin="anonymous"
                            />
                        </div>
                    )}
                    {message.type === 'location' && message.latitude && message.longitude && (
                        <div className="message-location">
                            <div className="location-header">
                                <span className="location-icon">📍</span>
                                <span className="location-label">Location</span>
                            </div>
                            <div className="location-map-container">
                                <iframe
                                    width="100%"
                                    height="200"
                                    frameBorder="0"
                                    style={{ border: 0, borderRadius: '8px' }}
                                    src={`https://www.google.com/maps?q=${message.latitude},${message.longitude}&output=embed`}
                                    allowFullScreen
                                    title="Location"
                                />
                            </div>
                            <a
                                href={`https://www.google.com/maps?q=${message.latitude},${message.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="location-link"
                            >
                                Open in Google Maps
                            </a>
                        </div>
                    )}
                    {message.text && (
                        <span className={
                            // Check if message contains only emojis (no regular text)
                            // First check if emojis field exists and matches text
                            // Otherwise, check if text contains only emoji characters
                            (() => {
                                const text = message.text.trim();
                                if (!text || text.length === 0) return '';
                                
                                // If emojis field exists and matches text, it's emoji-only
                                if (message.emojis && text === message.emojis.trim()) {
                                    // Double-check: no letters or numbers
                                    if (!text.match(/[a-zA-Z0-9]/)) {
                                        return 'emoji-only-message';
                                    }
                                }
                                
                                // Fallback: check if text contains only emoji characters
                                // Remove common punctuation and spaces, then check if only emojis remain
                                const cleanedText = text.replace(/[\s\.,!?;:'"()\-_=+\]\[]/g, '');
                                // Check if cleaned text contains only emoji Unicode ranges
                                const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{FE0F}]/gu;
                                const emojiMatches = cleanedText.match(emojiRegex);
                                // If all characters are emojis (or emoji-related characters like zero-width joiner)
                                if (emojiMatches && emojiMatches.join('').length === cleanedText.length && cleanedText.length > 0) {
                                    return 'emoji-only-message';
                                }
                                
                                return '';
                            })()
                        }>
                            {message.text}
                        </span>
                    )}
                    {message.emojis && message.emojis !== message.text && (
                        <span className="message-emojis">{message.emojis}</span>
                    )}
                    <div className="message-info">
                        <span className="timestamp">{formatTime(message.created_at)}</span>
                        {getMessageStatus(message)}
                    </div>
                </div>
            </div>
        );
    };

    if (!user) {
        return <div className="loading">Loading...</div>;
    }

    return (
        <div className="chat-page">
            <TopHeader />
            <div className="chat-sidebar">
                <div className="search-container">
                    <input 
                        type="text" 
                        placeholder="Search or start new chat" 
                        className="search-input compact"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Sidebar filters under search input */}
                <div className="sidebar-filters" role="tablist" aria-label="Conversation filters">
                    <button
                        type="button"
                        className={`filter-pill ${conversationFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setConversationFilter('all')}
                        aria-pressed={conversationFilter === 'all'}
                        title="All"
                    >
                        <span className="sidebar-filter-icon">💬</span>
                        All
                    </button>
                    <button
                        type="button"
                        className={`filter-pill ${conversationFilter === 'unread' ? 'active' : ''}`}
                        onClick={() => setConversationFilter('unread')}
                        aria-pressed={conversationFilter === 'unread'}
                        title="Unread"
                    >
                        <span className="sidebar-filter-icon">🧭</span>
                        Unread
                    </button>
                    <button
                        type="button"
                        className={`filter-pill ${conversationFilter === 'groups' ? 'active' : ''}`}
                        onClick={() => setConversationFilter('groups')}
                        aria-pressed={conversationFilter === 'groups'}
                        title="Groups"
                    >
                        <span className="sidebar-filter-icon">👥</span>
                        Groups
                    </button>
                </div>

                <div className="conversations-list" ref={conversationsListRef}>
                    {loadingConversations ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                            <SkeletonConversation key={idx} />
                        ))
                    ) : filteredConversations.length === 0 ? (
                        <div className="empty-conversations">
                            <p>{searchQuery ? 'No matches found' : 'No friends yet'}</p>
                            <p className="empty-hint">{searchQuery ? 'Try a different search' : 'Add friends to start chatting!'}</p>
                        </div>
                    ) : (
                        filteredConversations.map(conversation => (
                            <div
                                key={conversation.id}
                                className={`conversation-item ${activeConversation?.id === conversation.id ? 'active' : ''}`}
                                onClick={() => handleSelectConversation(conversation)}
                            >
                                <div className="conversation-avatar">
                                    {conversation.avatar_url ? (
                                        <img 
                                            src={getImageUrl(conversation.avatar_url)} 
                                            alt={conversation.name}
                                            onError={(e) => {
                                                console.error('Avatar load error:', conversation.avatar_url);
                                                e.target.style.display = 'none';
                                                // Show fallback text if image fails
                                                const fallback = e.target.nextElementSibling;
                                                if (fallback) fallback.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <span style={{ display: conversation.avatar_url ? 'none' : 'flex' }}>
                                        {conversation.name?.charAt(0) || '?'}
                                    </span>
                                </div>
                                <div className="conversation-details">
                                    <div className="conversation-header">
                                        <h3>{conversation.name}</h3>
                                        <span className="timestamp">{conversation.timestamp}</span>
                                    </div>
                                    <div className="conversation-preview">
                                        <span className="last-message">{conversation.lastMessage}</span>
                                        {conversation.unread > 0 && (
                                            <span className="unread-count">{conversation.unread > 99 ? '99+' : conversation.unread}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className={`chat-main ${activeConversation ? 'full-page' : ''} ${reduceMotion ? 'reduce-motion' : ''}`}>
                {activeConversation ? (
                    <>
                        <div className="chat-header">
                            <div className="chat-header-left">
                                {!showMessageSearch && (
                                    <>
                                        <button className="back-button mobile-back" onClick={handleBackToChats}>
                                            ←
                                        </button>
                                        <div className="chat-header-info">
                                            <div className="conversation-avatar">
                                                {activeConversation.avatar_url ? (
                                                    <img 
                                                        src={getImageUrl(activeConversation.avatar_url)} 
                                                        alt={activeConversation.name}
                                                        onError={(e) => {
                                                            console.error('Header avatar load error:', activeConversation.avatar_url);
                                                            e.target.style.display = 'none';
                                                            // Show fallback text if image fails
                                                            const fallback = e.target.nextElementSibling;
                                                            if (fallback) fallback.style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <span style={{ display: activeConversation.avatar_url ? 'none' : 'flex' }}>
                                                    {activeConversation.name.charAt(0)}
                                                </span>
                                            </div>
                                            <div>
                                                <h3>{activeConversation.name}</h3>
                                                <span className="online-status">
                                                    {onlineUsers.has(String(activeConversation.userId)) ? 'Online' : 'Offline'}
                                                    {activeConversation.unread > 0 && (
                                                        <span className="header-unread-badge">{activeConversation.unread}</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {showMessageSearch && (
                                    <div className="chat-message-search" ref={messageSearchRef}>
                                        <input
                                            ref={messageSearchInputRef}
                                            type="text"
                                            placeholder="Search messages..."
                                            value={messageSearchQuery}
                                            onChange={(e) => setMessageSearchQuery(e.target.value)}
                                            className="message-search-input"
                                        />
                                        <button
                                            className="icon-button chat-icon-btn"
                                            onClick={() => {
                                                setShowMessageSearch(false);
                                                setMessageSearchQuery('');
                                                setFilteredMessages([]);
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="chat-header-actions">
                                {!showMessageSearch && (
                                    <>
                                        <button className="icon-button chat-icon-btn">📞</button>
                                        <button className="icon-button chat-icon-btn">📹</button>
                                        <button
                                            className="icon-button chat-icon-btn"
                                            onClick={() => setShowMessageSearch(true)}
                                            title="Search messages"
                                        >
                                            🔍
                                        </button>
                                    </>
                                )}
                                {!showMessageSearch && (
                                    <div className="chat-header-menu">
                                        <button 
                                            ref={chatMenuButtonRef}
                                            className="icon-button chat-icon-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setChatHeaderMenu(!chatHeaderMenu);
                                            }}
                                        >
                                            ⋮
                                        </button>
                                        {chatHeaderMenu && (
                                            <>
                                                <div className="context-menu-overlay" onClick={() => setChatHeaderMenu(false)} />
                                                <div 
                                                    ref={chatMenuRef}
                                                    className="chat-dropdown-menu"
                                                >
                                                    <div className="dropdown-item" onClick={handleGoToProfile}>
                                                        <span className="dropdown-icon">👤</span>
                                                        <span>Go to Profile</span>
                                                    </div>
                                                    <div className="dropdown-item" onClick={handleToggleMute}>
                                                        <span className="dropdown-icon">
                                                            {activeConversation?.isMuted ? '🔊' : '🔇'}
                                                        </span>
                                                        <span>{activeConversation?.isMuted ? 'Unmute' : 'Mute'}</span>
                                                    </div>
                                                    <div className="dropdown-item" onClick={handleClearChat}>
                                                        <span className="dropdown-icon">🗑️</span>
                                                        <span>Clear Chat</span>
                                                    </div>
                                                    <div className="dropdown-divider" />
                                                    <div className="dropdown-item danger" onClick={handleBlockUser}>
                                                        <span className="dropdown-icon">🚫</span>
                                                        <span>Block User</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div 
                            className="messages-container"
                            ref={messagesContainerRef}
                            onScroll={(e) => {
                                const container = e.target;
                                const scrollTop = container.scrollTop;
                                
                                // Throttle scroll events to avoid too many calls
                                if (scrollThrottleRef.current) {
                                    clearTimeout(scrollThrottleRef.current);
                                }
                                
                                scrollThrottleRef.current = setTimeout(() => {
                                    // Load more messages when user scrolls near the top (within 200px from top)
                                    // Using a smaller threshold for more responsive loading
                                    if (scrollTop <= 200 && hasMoreMessages && !isLoadingMoreRef.current && !loadingMessages && !isLoadingMoreMessages && messages.length > 0 && activeConversation?.id) {
                                        // Calculate skip based on current message count
                                        const currentCount = messages.length;
                                        console.log('🔄 Scrolling near top - Loading older messages', {
                                            scrollTop: scrollTop.toFixed(0),
                                            currentCount,
                                            willSkip: currentCount,
                                            hasMoreMessages,
                                            conversationId: activeConversation.id,
                                            containerScrollHeight: container.scrollHeight,
                                            containerClientHeight: container.clientHeight
                                        });
                                        loadMessages(activeConversation.id, true, currentCount, true);
                                    }
                                }, 100); // Throttle to check every 100ms for better responsiveness
                            }}
                        >
                            {/* Show loading indicator at top when loading older messages - fixed position to prevent scroll flicker */}
                            {isLoadingMoreMessages && (
                                <div 
                                    className="loading-older-messages"
                                    style={{
                                        position: 'sticky',
                                        top: 0,
                                        textAlign: 'center',
                                        padding: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        fontSize: '0.875rem',
                                        backgroundColor: 'var(--bg-primary)',
                                        zIndex: 10,
                                        backdropFilter: 'blur(8px)',
                                        borderBottom: '1px solid var(--border-light)'
                                    }}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span className="loading-spinner" style={{
                                            display: 'inline-block',
                                            width: '14px',
                                            height: '14px',
                                            border: '2px solid var(--border-light)',
                                            borderTopColor: 'var(--primary)',
                                            borderRadius: '50%',
                                            animation: 'spin 0.8s linear infinite'
                                        }}></span>
                                        Loading older messages...
                                    </span>
                                </div>
                            )}
                            
                            {loadingMessages ? (
                                Array.from({ length: 8 }).map((_, idx) => (
                                    <SkeletonMessage key={idx} sent={idx % 2 === 0} />
                                ))
                            ) : showMessageSearch && messageSearchQuery.trim() !== '' && (
                                <div className="message-search-results">
                                    <div className="search-results-info">
                                        {filteredMessages.length > 0 ? (
                                            <span>Found {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}</span>
                                        ) : (
                                            <span>No messages found</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {!loadingMessages && (
                                <>
                                    {(showMessageSearch && messageSearchQuery.trim() !== '' ? filteredMessages : messages).length > 0 ? (
                                        (showMessageSearch && messageSearchQuery.trim() !== '' ? filteredMessages : messages).map(renderMessage)
                                    ) : (
                                        <div className="no-messages" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                            <p>No messages yet. Start a conversation!</p>
                                        </div>
                                    )}
                                </>
                            )}
                            {loadingMessages && (
                                <div className="loading-messages" style={{ padding: '2rem', textAlign: 'center' }}>
                                    Loading messages...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="message-input-container">
                            <form onSubmit={handleSendMessage} className="message-form">
                                {/* Hidden file inputs */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
                                    style={{ display: 'none' }}
                                />
                                <input
                                    type="file"
                                    ref={imageInputRef}
                                    onChange={handleImageSelect}
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                />
                                <input
                                    type="file"
                                    ref={audioInputRef}
                                    onChange={handleAudioSelect}
                                    accept="audio/*"
                                    style={{ display: 'none' }}
                                />

                                <div className="emoji-button-wrapper" ref={emojiButtonRef}>
                                    <button 
                                        type="button" 
                                        className="icon-button emoji-button"
                                        onClick={() => {
                                            setShowEmojiPicker(!showEmojiPicker);
                                            setShowAttachmentMenu(false); // Close attachment menu if open
                                        }}
                                        disabled={uploading}
                                        aria-label="Emoji"
                                    >
                                        😊
                                    </button>
                                    
                                    {/* Emoji Picker */}
                                    {showEmojiPicker && (
                                        <>
                                            <div 
                                                className="emoji-picker-backdrop"
                                                onClick={() => setShowEmojiPicker(false)}
                                                onTouchStart={() => setShowEmojiPicker(false)}
                                            />
                                            <div className="emoji-picker-container" ref={emojiPickerRef}>
                                                <Picker
                                                    data={data}
                                                    onEmojiSelect={(emoji) => {
                                                        setNewMessage(prev => prev + emoji.native);
                                                        setShowEmojiPicker(false);
                                                    }}
                                                    theme="light"
                                                    previewPosition="none"
                                                    skinTonePosition="none"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                                
                                {selectedFile && (
                                    <div className="selected-file">
                                        <span>{selectedFile.name}</span>
                                        <button type="button" onClick={() => setSelectedFile(null)}>✕</button>
                                    </div>
                                )}
                                
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Type a message"
                                    className="message-input"
                                    disabled={uploading}
                                />
                                
                                <div className="attachment-button-wrapper">
                                    <button 
                                        type="button" 
                                        className="icon-button attachment-button"
                                        onClick={() => {
                                            setShowAttachmentMenu(!showAttachmentMenu);
                                            setShowEmojiPicker(false); // Close emoji picker if open
                                        }}
                                        disabled={uploading}
                                        aria-label="Attachment"
                                    >
                                        📎
                                    </button>
                                    
                                    {/* Attachment Menu */}
                                    {showAttachmentMenu && (
                                        <>
                                            <div 
                                                className="attachment-menu-backdrop"
                                                onClick={() => setShowAttachmentMenu(false)}
                                                onTouchStart={() => setShowAttachmentMenu(false)}
                                            />
                                            <div className="attachment-menu" ref={attachmentMenuRef}>
                                                <div 
                                                    className="attachment-menu-content"
                                                    onClick={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDocumentClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon document-icon">
                                                📄
                                            </div>
                                            <span>Document</span>
                                        </button>
                                        
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCameraClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon camera-icon">
                                                📷
                                            </div>
                                            <span>Camera</span>
                                        </button>
                                        
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleGalleryClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon gallery-icon">
                                                🖼️
                                            </div>
                                            <span>Gallery</span>
                                        </button>
                                        
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAudioClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon audio-icon">
                                                🎵
                                            </div>
                                            <span>Audio</span>
                                        </button>
                                        
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLocationClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon location-icon">
                                                📍
                                            </div>
                                            <span>Location</span>
                                        </button>
                                        
                                        <button 
                                            className="attachment-option" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleContactClick();
                                            }}
                                            type="button"
                                        >
                                            <div className="attachment-icon contact-icon">
                                                👤
                                            </div>
                                            <span>Contact</span>
                                        </button>
                                            </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                
                                <button type="submit" className="send-button" disabled={uploading}>
                                    {uploading ? '⌛' : '➤'}
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="no-conversation-selected">
                        <h3>Select a chat to start messaging</h3>
                    </div>
                )}
            </div>
            
            {showUserSearch && (
                <UserSearch 
                    onClose={() => {
                        setShowUserSearch(false);
                        loadFriends();
                    }}
                    onUserSelect={() => {
                        setShowUserSearch(false);
                    }}
                />
            )}

            {contextMenu && (
                <MessageContextMenu
                    message={contextMenu.message}
                    position={contextMenu.position}
                    onClose={() => setContextMenu(null)}
                    onDelete={handleDeleteMessage}
                    isSentByMe={contextMenu.isSentByMe}
                />
            )}
            
            {/* Profile Modal */}
            {showProfileModal && activeConversation && (
                <>
                    <div 
                        className="profile-modal-overlay"
                        onClick={() => setShowProfileModal(false)}
                    />
                    <div className="profile-modal">
                        <div className="profile-modal-header">
                            <h2>Profile</h2>
                            <button 
                                className="profile-modal-close"
                                onClick={() => setShowProfileModal(false)}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="profile-modal-content">
                            <div className="profile-avatar-container">
                                {activeConversation.avatar_url ? (
                                    <img 
                                        src={getImageUrl(activeConversation.avatar_url)}
                                        alt={activeConversation.name || activeConversation.username}
                                        className="profile-modal-avatar"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            const fallback = e.target.nextElementSibling;
                                            if (fallback) fallback.style.display = 'flex';
                                        }}
                                    />
                                ) : null}
                                <div 
                                    className="profile-modal-avatar-fallback"
                                    style={{ display: activeConversation.avatar_url ? 'none' : 'flex' }}
                                >
                                    {(activeConversation.name || activeConversation.username || '?').charAt(0).toUpperCase()}
                                </div>
                            </div>
                            <div className="profile-info">
                                <div className="profile-info-item">
                                    <label>Name</label>
                                    <div className="profile-info-value">
                                        {activeConversation.name || 'Not set'}
                                    </div>
                                </div>
                                <div className="profile-info-item">
                                    <label>Username</label>
                                    <div className="profile-info-value">
                                        @{activeConversation.username || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ChatPage;

