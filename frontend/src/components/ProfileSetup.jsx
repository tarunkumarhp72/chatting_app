import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { authAPI, uploadAPI } from '../services/api';
import './ProfileSetup.css';

const ProfileSetup = () => {
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAppContext();
    const fileInputRef = useRef(null);
    const isProcessingRef = useRef(false);
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
                    opacity: 0.3
                });
                const plane = new THREE.Mesh(geometry, material);
                scene.add(plane);

                let time = 0;
                const animate = () => {
                    requestAnimationFrame(animate);
                    time += 0.005;
                    
                    const positions = plane.geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) {
                        const x = positions.getX(i);
                        const y = positions.getY(i);
                        const z = noise3D(x * 0.5, y * 0.5, time) * 0.5;
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

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Revoke old preview URL if present
        if (avatarUrl && avatarUrl.startsWith('blob:')) {
            URL.revokeObjectURL(avatarUrl);
        }

        setSelectedFile(file);
        const previewUrl = URL.createObjectURL(file);
        setAvatarUrl(previewUrl);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (isProcessingRef.current) {
            return;
        }
        
        isProcessingRef.current = true;
        setLoading(true);
        setError('');

        try {
            if (!displayName.trim()) {
                setError('Please enter your name');
                return;
            }

            let avatarPath = undefined;
            if (selectedFile) {
                const { data } = await uploadAPI.uploadFile(selectedFile);
                avatarPath = data?.url; // server returns path like "/api/uploads/file/{filename}"
            }

            const response = await authAPI.setupProfile(displayName.trim(), avatarPath);
            
            login(response.data);
            navigate('/chats');
        } catch (err) {
            console.error('Profile setup error:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Failed to setup profile. Please try again.');
            }
        } finally {
            setLoading(false);
            isProcessingRef.current = false;
        }
    };

    return (
        <div className="profile-setup-page">
            <canvas ref={canvasRef} className="background-canvas"></canvas>
            
            <div className="profile-setup-container">
                <div className="profile-setup-header">
                    <h1>Profile Information</h1>
                    <p>Provide your name to get started</p>
                </div>

                <form onSubmit={handleSubmit} className="profile-setup-form">
                    <div className="avatar-section">
                        <div className="avatar-preview">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" />
                            ) : (
                                <div className="avatar-placeholder">
                                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                                    </svg>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="avatar-upload-btn"
                        >
                            Add Photo
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
                        <label htmlFor="displayName">Your Name</label>
                        <input
                            id="displayName"
                            type="text"
                            placeholder="Enter your name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            required
                            className="form-input"
                            maxLength={50}
                        />
                        <p className="hint">This name will be visible to your contacts</p>
                    </div>

                    <button type="submit" disabled={loading} className="submit-btn">
                        {loading ? 'Setting up...' : 'CONTINUE'}
                    </button>

                    {error && <div className="error-message">{error}</div>}
                </form>
            </div>
        </div>
    );
};

export default ProfileSetup;

