import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { authAPI } from '../services/api';
import './AuthPage.css';

const AuthPage = () => {
    const [authMode, setAuthMode] = useState('login');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [usernameStatus, setUsernameStatus] = useState('');
    const [usernameChecking, setUsernameChecking] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, isProfileComplete } = useAppContext();
    const isProcessingRef = useRef(false);
    const canvasRef = useRef(null);
    const checkUsernameTimeoutRef = useRef(null);

    useEffect(() => {
        if (user && location.pathname === '/login') {
            if (!isProfileComplete(user)) {
                navigate('/profile-setup');
            } else {
                navigate('/chats');
            }
        }
    }, [user, navigate, location, isProfileComplete]);

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

    const handleLogin = async (e) => {
        e.preventDefault();
        
        if (isProcessingRef.current) return;
        
        isProcessingRef.current = true;
        setLoading(true);
        setError('');

        try {
            if (!email || !password) {
                setError('Please enter both email and password');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setError('Please enter a valid email address');
                return;
            }

            const response = await authAPI.login(email, password);
            localStorage.setItem('token', response.data.access_token);

            // Fetch the current user profile after login
            const meResponse = await authAPI.getMe();
            localStorage.setItem('user', JSON.stringify(meResponse.data));
            login(meResponse.data);

            if (!isProfileComplete(meResponse.data)) {
                navigate('/profile-setup');
            } else {
                navigate('/chats');
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Login failed. Please try again.');
            }
        } finally {
            setLoading(false);
            isProcessingRef.current = false;
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        
        if (isProcessingRef.current) return;
        
        isProcessingRef.current = true;
        setLoading(true);
        setError('');

        try {
            if (!email || !username || !password) {
                setError('Please fill in all fields');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setError('Please enter a valid email address');
                return;
            }

            const usernameValidation = validateUsername(username);
            if (usernameValidation) {
                setError(usernameValidation);
                return;
            }

            if (password.length < 8) {
                setError('Password must be at least 8 characters long');
                return;
            }

            if (!/[A-Za-z]/.test(password)) {
                setError('Password must contain at least one letter');
                return;
            }

            if (!/\d/.test(password)) {
                setError('Password must contain at least one number');
                return;
            }

            if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
            }

            if (usernameStatus && !usernameStatus.includes('available')) {
                setError('Please choose an available username');
                return;
            }

            const response = await authAPI.register(email, username, password);
            localStorage.setItem('token', response.data.access_token);

            // Fetch the current user profile after registration
            const meResponse = await authAPI.getMe();
            localStorage.setItem('user', JSON.stringify(meResponse.data));
            login(meResponse.data);

            if (!isProfileComplete(meResponse.data)) {
                navigate('/profile-setup');
            } else {
                navigate('/chats');
            }
        } catch (err) {
            console.error('Register error:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else {
                setError('Registration failed. Please try again.');
            }
        } finally {
            setLoading(false);
            isProcessingRef.current = false;
        }
    };

    const validateUsername = (username) => {
        if (username.length < 3) {
            return 'Username must be at least 3 characters long';
        }
        if (username.length > 30) {
            return 'Username must be less than 30 characters';
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return 'Username can only contain letters, numbers, and underscores';
        }
        if (username.startsWith('_') || username.endsWith('_')) {
            return 'Username cannot start or end with underscore';
        }
        return '';
    };

    const checkUsernameAvailability = async (username) => {
        const validationError = validateUsername(username);
        if (validationError) {
            setUsernameStatus(validationError);
            return false;
        }

        clearTimeout(checkUsernameTimeoutRef.current);
        
        checkUsernameTimeoutRef.current = setTimeout(async () => {
            try {
                setUsernameChecking(true);
                const response = await authAPI.checkUsername(username);
                if (response.data.available) {
                    setUsernameStatus('✅ Username available');
                } else {
                    setUsernameStatus('❌ Username already taken');
                }
            } catch (err) {
                console.error('Username check error:', err);
                setUsernameStatus('');
            } finally {
                setUsernameChecking(false);
            }
        }, 500);
    };

    useEffect(() => {
        return () => {
            if (checkUsernameTimeoutRef.current) {
                clearTimeout(checkUsernameTimeoutRef.current);
            }
        };
    }, []);

    const toggleAuthMode = () => {
        setAuthMode(authMode === 'login' ? 'register' : 'login');
        setError('');
        setUsernameStatus('');
        setEmail('');
        setUsername('');
        setPassword('');
        setConfirmPassword('');
    };

    return (
        <div className="auth-page">
            <canvas ref={canvasRef} className="background-canvas"></canvas>
            
            <div className="auth-container">
                <div className={`auth-card ${authMode === 'login' ? 'login-active' : 'register-active'}`}>
                    <div className="auth-panel login-panel">
                        <div className="panel-content">
                            {authMode === 'login' ? (
                                <>
                                    <h1>Welcome Back!</h1>
                                    <p>Enter your credentials to access your account</p>
                                    <button 
                                        type="button" 
                                        onClick={toggleAuthMode}
                                        className="toggle-btn"
                                    >
                                        SIGN UP
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h1>New Here?</h1>
                                    <p>Create an account and start chatting with friends</p>
                                    <button 
                                        type="button" 
                                        onClick={toggleAuthMode}
                                        className="toggle-btn"
                                    >
                                        SIGN IN
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="auth-panel form-panel">
                        <div className="form-content">
                            {authMode === 'login' ? (
                                <>
                                    <h2>Sign In</h2>
                                    <form onSubmit={handleLogin} className="auth-form">
                                        <div className="form-group">
                                            <input
                                                type="email"
                                                placeholder="Email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                className="form-input"
                                            />
                                        </div>
                                        
                                        <div className="form-group">
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                className="form-input"
                                            />
                                        </div>
                                        
                                        <button type="submit" disabled={loading} className="auth-btn">
                                            {loading ? 'Signing In...' : 'SIGN IN'}
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <>
                                    <h2>Create Account</h2>
                                    <form onSubmit={handleRegister} className="auth-form">
                                        <div className="form-group">
                                            <input
                                                type="email"
                                                placeholder="Email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                className="form-input"
                                            />
                                        </div>
                                        
                                        <div className="form-group">
                                            <input
                                                type="text"
                                                placeholder="Username"
                                                value={username}
                                                onChange={(e) => {
                                                    setUsername(e.target.value);
                                                    checkUsernameAvailability(e.target.value);
                                                }}
                                                required
                                                className="form-input"
                                            />
                                            {usernameStatus && (
                                                <div className={`username-status ${usernameStatus.includes('available') ? 'success' : 'error'}`}>
                                                    {usernameChecking ? 'Checking...' : usernameStatus}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="form-group">
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                className="form-input"
                                            />
                                        </div>
                                        
                                        <div className="form-group">
                                            <input
                                                type="password"
                                                placeholder="Confirm Password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                                className="form-input"
                                            />
                                        </div>
                                        
                                        <button type="submit" disabled={loading} className="auth-btn">
                                            {loading ? 'Creating...' : 'SIGN UP'}
                                        </button>
                                    </form>
                                </>
                            )}

                            {error && <div className="error-message">{error}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
