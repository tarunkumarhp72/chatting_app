import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { authAPI } from '../services/api';
import './ProfilePage.css';

const ProfilePage = () => {
    const { user, login } = useAppContext();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const canvasRef = useRef(null);

    // Helper function to get full image URL
    const getImageUrl = (url) => {
        if (!url) return '';
        // If it's already a full URL or base64, return as is
        if (url.startsWith('http') || url.startsWith('data:image')) {
            return url;
        }
        // Otherwise, construct full URL from API
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        // URLs from backend are like /uploads/profile_images/file.jpg
        // Mounted at /uploads so access directly or via /api/uploads/file
        return `${apiUrl}${url.startsWith('/') ? url : '/' + url}`;
    };

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

    const handleBackToChats = () => {
        navigate('/chats');
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (!displayName.trim()) {
                setError('Display name is required');
                return;
            }

            const response = await authAPI.setupProfile(displayName.trim(), avatarUrl);
            
            login(response.data);
            setSuccess('Profile updated successfully!');
            
            setTimeout(() => {
                navigate('/chats');
            }, 1500);
        } catch (err) {
            console.error('Profile update error:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Failed to update profile. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-page">
            <canvas ref={canvasRef} className="background-canvas"></canvas>
            
            <div className="profile-container">
                <div className="profile-header">
                    <button className="back-button" onClick={handleBackToChats}>
                        ←
                    </button>
                    <h1>Profile</h1>
                </div>

                <form onSubmit={handleSave} className="profile-form">
                    <div className="avatar-section">
                        <div className="avatar-preview">
                            {avatarUrl ? (
                                <img 
                                    src={getImageUrl(avatarUrl)} 
                                    alt="Avatar"
                                    onError={(e) => {
                                        console.error('Image load error:', avatarUrl);
                                        e.target.style.display = 'none';
                                        // Show placeholder if image fails to load
                                        const placeholder = e.target.nextElementSibling;
                                        if (placeholder) placeholder.style.display = 'flex';
                                    }}
                                />
                            ) : null}
                            <div className="avatar-placeholder" style={{ display: avatarUrl ? 'none' : 'flex' }}>
                                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                                </svg>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="avatar-upload-btn"
                        >
                            Change Photo
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="displayName">Display Name</label>
                        <input
                            id="displayName"
                            type="text"
                            placeholder="Enter your display name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            required
                            className="form-input"
                            maxLength={50}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="form-input"
                            disabled
                        />
                        <p className="hint">Email cannot be changed</p>
                    </div>

                    <button type="submit" disabled={loading} className="save-btn">
                        {loading ? 'Saving...' : 'SAVE CHANGES'}
                    </button>

                    {error && <div className="error-message">{error}</div>}
                    {success && <div className="success-message">{success}</div>}
                </form>
            </div>
        </div>
    );
};

export default ProfilePage;
