import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { userAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import './BlockedUsersPage.css';

const BlockedUsersPage = () => {
    const { user } = useAppContext();
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const toast = useToast();
    const canvasRef = useRef(null);

    useEffect(() => {
        import('three').then((THREE) => {
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
            
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            
            camera.position.z = 5;

            import('simplex-noise').then(({ createNoise3D }) => {
                const noise3D = createNoise3D();
                const geometry = new THREE.PlaneGeometry(15, 15, 128, 128);
                const material = new THREE.MeshBasicMaterial({ 
                    color: 0xFF6B01,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.2
                });
                const plane = new THREE.Mesh(geometry, material);
                scene.add(plane);

                let time = 0;
                const animate = () => {
                    requestAnimationFrame(animate);
                    time += 0.003;
                    
                    const positions = plane.geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) {
                        const x = positions.getX(i);
                        const y = positions.getY(i);
                        const z = noise3D(x * 0.3, y * 0.3, time) * 0.3;
                        positions.setZ(i, z);
                    }
                    positions.needsUpdate = true;
                    
                    renderer.render(scene, camera);
                };
                animate();

                const handleResize = () => {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                };
                window.addEventListener('resize', handleResize);

                return () => {
                    window.removeEventListener('resize', handleResize);
                    renderer.dispose();
                };
            });
        });
    }, []);

    useEffect(() => {
        const fetchBlockedUsers = async () => {
            if (!user?.id) {
                setLoading(false);
                return;
            }
            
            try {
                setLoading(true);
                const response = await userAPI.getBlockedUsers();
                setBlockedUsers(response.data || []);
            } catch (error) {
                console.error('Error fetching blocked users:', error);
                toast.error('Failed to load blocked users');
                setBlockedUsers([]);
            } finally {
                setLoading(false);
            }
        };
        
        fetchBlockedUsers();
    }, [user]);

    const handleBackToChats = () => {
        navigate('/chats');
    };

    const handleUnblockUser = async (userId) => {
        try {
            await userAPI.unblockUser(user.id, userId);
            setBlockedUsers(prev => prev.filter(user => user.id !== userId));
            toast.success('User unblocked successfully');
        } catch (error) {
            console.error('Error unblocking user:', error);
            toast.error('Failed to unblock user');
        }
    };

    return (
        <div className="blocked-users-page">
            <canvas ref={canvasRef} className="background-canvas"></canvas>
            
            <div className="blocked-users-container">
                <div className="blocked-users-header">
                    <button className="back-button" onClick={handleBackToChats}>
                        ←
                    </button>
                    <h1>Blocked Users</h1>
                </div>

                <div className="blocked-users-content">
                    {loading ? (
                        <div className="empty-state">
                            <div className="empty-icon">⏳</div>
                            <h3>Loading...</h3>
                        </div>
                    ) : blockedUsers.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">🚫</div>
                            <h3>No Blocked Users</h3>
                            <p>You haven't blocked any users yet.</p>
                        </div>
                    ) : (
                        <div className="blocked-users-list">
                            {blockedUsers.map(user => (
                                <div key={user.id} className="blocked-user-item">
                                    <div className="user-avatar">
                                        {user.display_name?.charAt(0) || user.username?.charAt(0) || '?'}
                                    </div>
                                    <div className="user-info">
                                        <h3>{user.display_name || user.username || 'Unknown User'}</h3>
                                        {user.username && <p>@{user.username}</p>}
                                    </div>
                                    <button 
                                        className="unblock-btn"
                                        onClick={() => handleUnblockUser(user.id)}
                                    >
                                        Unblock
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BlockedUsersPage;
