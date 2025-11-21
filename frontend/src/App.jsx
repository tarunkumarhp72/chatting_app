import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { ToastProvider } from './contexts/ToastContext';
import AuthPage from './components/AuthPage';
import ProfileSetup from './components/ProfileSetup';
import ChatPage from './components/ChatPage';
// import ContactsPage from './components/ContactsPage';
// import CallsPage from './components/CallsPage';
import SettingsPage from './components/SettingsPage';
import ProfilePage from './components/ProfilePage';
import BlockedUsersPage from './components/BlockedUsersPage';
import FriendRequestsPage from './components/FriendRequestsPage';
import NotFoundPage from './components/NotFoundPage';
import './App.css';

const ProtectedRoute = ({ children }) => {
    const { user, loading, isProfileComplete } = useAppContext();
    const location = window.location;

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" />;
    }

    if (!isProfileComplete(user)) {
        return (
            <Navigate to="/profile-setup" state={{ message: "Finish your profile setup to start using the app." }} />
        );
    }

    return children;
};

function App() {
    return (
        <AppProvider>
            <ToastProvider>
                <Router>
                    <div className="app">
                        <Routes>
                            <Route
                                path="/"
                                element={<Navigate to="/login" />}
                            />
                            <Route
                                path="/login"
                                element={<AuthPage />}
                            />
                            <Route
                                path="/profile-setup"
                                element={<ProfileSetup />}
                            />
                            <Route
                                path="/chats"
                                element={
                                    <ProtectedRoute>
                                        <ChatPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/contacts"
                                element={
                                    <ProtectedRoute>
                                        {/* <ContactsPage /> */}
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/calls"
                                element={
                                    <ProtectedRoute>
                                        {/* <CallsPage /> */}
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/settings"
                                element={
                                    <ProtectedRoute>
                                        <SettingsPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/profile"
                                element={
                                    <ProtectedRoute>
                                        <ProfilePage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/blocked-users"
                                element={
                                    <ProtectedRoute>
                                        <BlockedUsersPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/friend-requests"
                                element={
                                    <ProtectedRoute>
                                        <FriendRequestsPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                    </div>
                </Router>
            </ToastProvider>
        </AppProvider>
    );
}

export default App;