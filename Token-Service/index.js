

// token-service/src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Redis = require('ioredis');

const app = express();
const prisma = new PrismaClient();
const redis = new Redis();




app.use(express.json());

// Helper function to hash tokens for storage
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper function to generate tokens
const generateToken = async (userId, type = 'ACCESS') => {
    // Different expiration times based on token type
    const expirations = {
        ACCESS: '1h',
        REFRESH: '7d'
    };

    const payload = {
        userId,
        type,
        iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: expirations[type]
    });

    // Calculate expiration date for database
    const expiresIn = type === 'ACCESS' ? 60 * 60 : 7 * 24 * 60 * 60; // seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Store token information
    await prisma.token.create({
        data: {
            userId,
            tokenHash: hashToken(token),
            type,
            expiresAt,
            isRevoked: false
        }
    });

    // Cache token in Redis for quick validation
    await redis.setex(
        `token:${hashToken(token)}`,
        expiresIn,
        JSON.stringify({ userId, type })
    );

    return { token, expiresAt };
};

// Create new access and refresh tokens
app.post('/tokens', async (req, res) => {
    try {
        const { userId } = req.body;

        // Generate both access and refresh tokens
        const [accessToken, refreshToken] = await Promise.all([
            generateToken(userId, 'ACCESS'),
            generateToken(userId, 'REFRESH')
        ]);

        res.json({
            accessToken: accessToken.token,
            refreshToken: refreshToken.token,
            expiresAt: accessToken.expiresAt
        });
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate tokens' });
    }
});

// Verify token validity
app.post('/verify', async (req, res) => {
    try {
        const { token } = req.body;
        console.log(token)

        const tokenHash = hashToken(token);

        // Check Redis cache first
        const cachedToken = await redis.get(`token:${tokenHash}`);
        if (cachedToken) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return res.json({ valid: true, decoded });
        }

        // If not in cache, check database
        const storedToken = await prisma.token.findFirst({
            where: {
                tokenHash,
                isRevoked: false,
                expiresAt: {
                    gt: new Date()
                }
            }
        });

        if (!storedToken) {
            return res.json({ valid: false, reason: 'Token not found or revoked' });
        }

        // Verify JWT signature and expiration
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Cache the result
        await redis.setex(
            `token:${tokenHash}`,
            Math.floor((storedToken.expiresAt - new Date()) / 1000),
            JSON.stringify({ userId: decoded.userId, type: decoded.type })
        );

        res.json({ valid: true, decoded });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            res.json({ valid: false, reason: 'Invalid token signature' });
        } else if (error instanceof jwt.TokenExpiredError) {
            res.json({ valid: false, reason: 'Token expired' });
        } else {
            console.error('Token verification error:', error);
            res.status(500).json({ error: 'Verification failed' });
        }
    }
});

// Refresh access token using refresh token
app.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        if (decoded.type !== 'REFRESH') {
            return res.status(400).json({ error: 'Invalid token type' });
        }

        // Generate new access token
        const newAccessToken = await generateToken(decoded.userId, 'ACCESS');

        res.json({
            accessToken: newAccessToken.token,
            expiresAt: newAccessToken.expiresAt
        });
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Refresh token expired' });
        } else {
            res.status(400).json({ error: 'Invalid refresh token' });
        }
    }
});

// Revoke token
app.post('/revoke', async (req, res) => {
    try {
        const { token } = req.body;
        const tokenHash = hashToken(token);

        // Remove from Redis cache
        await redis.del(`token:${tokenHash}`);

        // Mark as revoked in database
        await prisma.token.updateMany({
            where: { tokenHash },
            data: { isRevoked: true }
        });

        res.json({ message: 'Token revoked successfully' });
    } catch (error) {
        console.error('Token revocation error:', error);
        res.status(500).json({ error: 'Failed to revoke token' });
    }
});

// Cleanup expired tokens (should be run as a scheduled job)
app.post('/cleanup', async (req, res) => {
    try {
        const result = await prisma.token.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { isRevoked: true }
                ]
            }
        });

        res.json({
            message: 'Cleanup completed',
            removedTokens: result.count
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Cleanup failed' });
    }
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`Token service running on port ${PORT}`);
});