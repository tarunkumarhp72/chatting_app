import React, { useState, useEffect } from 'react';
import './CallsPage.css';

const CallsPage = ({ user }) => {
    const [calls, setCalls] = useState([]);
    const [activeCall, setActiveCall] = useState(null);

    // Mock data for demonstration
    useEffect(() => {
        // Simulate fetching call history
        const mockCalls = [
            { id: '1', contactName: 'John Doe', contactPhone: '+1234567890', type: 'incoming', status: 'ended', timestamp: '2 hours ago', duration: '5:30' },
            { id: '2', contactName: 'Jane Smith', contactPhone: '+1987654321', type: 'outgoing', status: 'ended', timestamp: 'Yesterday', duration: '12:15' },
            { id: '3', contactName: 'Bob Johnson', contactPhone: '+1555666777', type: 'missed', status: 'missed', timestamp: '2 days ago', duration: '0:00' },
            { id: '4', contactName: 'Alice Brown', contactPhone: '+1444555666', type: 'outgoing', status: 'ended', timestamp: '3 days ago', duration: '3:45' },
        ];
        setCalls(mockCalls);
    }, []);

    const handleCall = (contact) => {
        // TODO: Implement call functionality
        console.log('Calling:', contact);
        setActiveCall(contact);
    };

    const handleEndCall = () => {
        // TODO: Implement end call functionality
        console.log('Ending call');
        setActiveCall(null);
    };

    return (
        <div className="calls-page">
            <div className="calls-header">
                <h2>Calls</h2>
                <button className="new-call-btn">+</button>
            </div>

            <div className="calls-list">
                {calls.map(call => (
                    <div key={call.id} className="call-item">
                        <div className="call-avatar">
                            {call.contactName.charAt(0)}
                        </div>
                        <div className="call-info">
                            <h3>{call.contactName}</h3>
                            <div className="call-details">
                                <span className={`call-type ${call.type}`}>
                                    {call.type === 'incoming' && '↓'}
                                    {call.type === 'outgoing' && '↑'}
                                    {call.type === 'missed' && '↓'}
                                </span>
                                <span className="call-timestamp">{call.timestamp}</span>
                                <span className="call-duration">{call.duration}</span>
                            </div>
                        </div>
                        <div className="call-actions">
                            <button className="call-back-btn">
                                {call.type === 'missed' ? 'Call back' : 'Call'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {activeCall && (
                <div className="call-overlay">
                    <div className="call-screen">
                        <div className="call-header">
                            <h2>Calling {activeCall.contactName}</h2>
                        </div>
                        <div className="call-content">
                            <div className="caller-avatar">
                                {activeCall.contactName.charAt(0)}
                            </div>
                            <div className="call-status">Connecting...</div>
                        </div>
                        <div className="call-controls">
                            <button className="end-call-btn" onClick={handleEndCall}>
                                End Call
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CallsPage;