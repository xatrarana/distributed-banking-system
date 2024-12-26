

// auth-service/src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');

const prisma = new PrismaClient();
const redis = new Redis();

const app = express();
app.use(express.json());

// User registration
app.post('/register', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        console.log(req.body)
        if (!email || !password || !role) {
            return res.status(400).json({
                message: "email, password or role are required fields."
            })
        }

        console.log(email, password, role)
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log(hashedPassword, "hashed password")

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role
            }
        });

        res.status(201).json({ id: user.id, email: user.email });
    } catch (error) {
        res.status(400).json({ error: 'Registration failed' });
    }
});

app.post('/login', async (req, res) => {
    try {
        // Extract credentials from request body
        const { email, password } = req.body;

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                password: true,
                role: true,
                email: true,
                // Add any other fields you need, but exclude sensitive data
            }
        });

        // Verify user exists and password matches
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Request tokens from token service
        const tokenResponse = await fetch('http://localhost:3004/tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: user.id,
                // You can add additional claims if needed
                metadata: {
                    role: user.role,
                    email: user.email
                }
            })
        });

        if (!tokenResponse.ok) {
            throw new Error('Token service error');
        }

        // Get tokens from response
        const tokens = await tokenResponse.json();

        // Return user info and tokens
        res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            },
            auth: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        // Provide appropriate error messages based on error type
        if (error.message === 'Token service error') {
            return res.status(503).json({
                error: 'Authentication service temporarily unavailable'
            });
        }

        res.status(500).json({
            error: 'An error occurred during login'
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Auth service running on port ${PORT}`);
});