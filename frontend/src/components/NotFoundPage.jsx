import React from 'react';
import { Link } from 'react-router-dom';
import './NotFoundPage.css';

const NotFoundPage = () => {
    return (
        <div className="not-found-container">
            <div className="wave-bg"></div>
            <div className="content">
                <h1 className="error-code">404</h1>
                <p className="error-message">Don't worry - the stock market hasn't crashed!</p>
                <p className="error-subtext">It's just the page that's run into problems.</p>
                <Link to="/" className="home-button">Back to Home Page</Link>
            </div>
        </div>
    );
};

export default NotFoundPage;
