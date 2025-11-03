import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import TopHeader from './TopHeader';
import './SettingsPage.css';

const SettingsPage = () => {
    const { user, logout } = useAppContext();
    const toast = useToast();
    const navigate = useNavigate();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
        toast.success('Logged out successfully');
    };

    const handleNotificationToggle = () => {
        setNotificationsEnabled(!notificationsEnabled);
        toast.info(notificationsEnabled ? 'Notifications disabled' : 'Notifications enabled');
    };

    const handleSoundToggle = () => {
        setSoundEnabled(!soundEnabled);
        toast.info(soundEnabled ? 'Sound disabled' : 'Sound enabled');
    };

    const handleDarkModeToggle = () => {
        setDarkMode(!darkMode);
        toast.info(darkMode ? 'Dark mode disabled' : 'Dark mode enabled');
    };

    const handleClearCache = () => {
        // Clear localStorage except auth tokens
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        localStorage.clear();
        if (token) localStorage.setItem('token', token);
        if (userData) localStorage.setItem('user', userData);
        toast.success('Cache cleared successfully');
    };

    const handleDeleteAccount = () => {
        if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            toast.error('Account deletion not implemented yet');
            // TODO: Implement account deletion
        }
    };

    if (!user) {
        return <div className="loading">Loading...</div>;
    }

    return (
        <div className="settings-page">
            <TopHeader />
            <div className="settings-container">
                <div className="settings-header">
                    <button className="back-button" onClick={() => navigate('/chats')}>
                        ←
                    </button>
                    <h1>Settings</h1>
                </div>

                <div className="settings-content">
                    {/* Profile Section */}
                    <div className="settings-section">
                        <h2>Profile</h2>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Display Name</div>
                                <div className="settings-value">{user.display_name || 'Not set'}</div>
                            </div>
                            <button 
                                className="settings-action" 
                                onClick={() => navigate('/profile')}
                            >
                                Edit
                            </button>
                        </div>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Username</div>
                                <div className="settings-value">@{user.username}</div>
                            </div>
                        </div>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Email</div>
                                <div className="settings-value">{user.email}</div>
                            </div>
                        </div>
                    </div>

                    {/* Notifications Section */}
                    <div className="settings-section">
                        <h2>Notifications</h2>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Notifications</div>
                                <div className="settings-description">Receive notifications for new messages</div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={notificationsEnabled}
                                    onChange={handleNotificationToggle}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Sound</div>
                                <div className="settings-description">Play sound for new messages</div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={soundEnabled}
                                    onChange={handleSoundToggle}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    {/* Appearance Section */}
                    <div className="settings-section">
                        <h2>Appearance</h2>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Dark Mode</div>
                                <div className="settings-description">Switch to dark theme</div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={darkMode}
                                    onChange={handleDarkModeToggle}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    {/* Privacy & Security Section */}
                    <div className="settings-section">
                        <h2>Privacy & Security</h2>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Blocked Users</div>
                                <div className="settings-description">Manage blocked users</div>
                            </div>
                            <button 
                                className="settings-action" 
                                onClick={() => navigate('/blocked-users')}
                            >
                                Manage
                            </button>
                        </div>
                    </div>

                    {/* Data & Storage Section */}
                    <div className="settings-section">
                        <h2>Data & Storage</h2>
                        <div className="settings-item">
                            <div className="settings-item-info">
                                <div className="settings-label">Clear Cache</div>
                                <div className="settings-description">Clear cached data (keeps your login session)</div>
                            </div>
                            <button 
                                className="settings-action" 
                                onClick={handleClearCache}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="settings-section">
                        <h2>Account</h2>
                        <div className="settings-item danger">
                            <div className="settings-item-info">
                                <div className="settings-label">Logout</div>
                                <div className="settings-description">Sign out of your account</div>
                            </div>
                            <button 
                                className="settings-action logout" 
                                onClick={handleLogout}
                            >
                                Logout
                            </button>
                        </div>
                        <div className="settings-item danger">
                            <div className="settings-item-info">
                                <div className="settings-label">Delete Account</div>
                                <div className="settings-description">Permanently delete your account and all data</div>
                            </div>
                            <button 
                                className="settings-action danger" 
                                onClick={handleDeleteAccount}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;

