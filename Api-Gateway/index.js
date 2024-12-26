// api-gateway/src/server.js
const express = require('express');
const proxy = require('express-http-proxy');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json());

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// In your API gateway's authentication middleware
const authenticateToken = async (req, res, next) => {
    // Skip authentication for public routes
    if (req.path.includes('/api/auth/login') || req.path.includes('/api/auth/register')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Verify token with token service
        const response = await fetch('http://localhost:3004/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (!result.valid) {
            return res.status(403).json({ error: result.reason });
        }

        req.user = result.decoded;
        req.headers['x-user-id'] = result.decoded.userId
        req.headers['x-auth'] = token
        next();
    } catch (err) {
        console.error('Token verification error:', err);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

app.use(authenticateToken)

// Service registry with localhost for development
const serviceRegistry = {
    auth: 'http://localhost:3001',
    accounts: 'http://localhost:3002',
    transactions: 'http://localhost:3003'
};

// Enhanced proxy middleware configuration
Object.entries(serviceRegistry).forEach(([service, url]) => {
    app.use(
        `/api/${service}`,
        proxy(url)
    );
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});