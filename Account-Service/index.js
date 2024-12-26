

// account-service/src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const Queue = require('bull');

const prisma = new PrismaClient();
const redis = new Redis();

// Create Bull queue for account operations
const accountQueue = new Queue('account-operations', {
    redis
});

const app = express();
app.use(express.json());

// Create account
app.post('/create', async (req, res) => {
    try {
        const { type } = req.body;
        const id = req.headers['x-user-id'];

        if (!id || !type) {
            return res.status(400).json({
                message: "Invalid fields"
            })
        }
        const account = await prisma.account.create({
            data: {
                userId: id,
                type,
                balance: 0,
                status: 'ACTIVE'
            }
        });

        // Cache account details
        await redis.setex(`account:${account.id}`, 3600, JSON.stringify(account));

        res.status(201).json(account);
    } catch (error) {
        res.status(400).json({ error: 'Account creation failed' });
    }
});

// Get account balance
app.get('/:id/balance', async (req, res) => {
    try {
        const { id } = req.params;

        // Try to get from cache first
        const cachedAccount = await redis.get(`account:${id}`);

        if (cachedAccount) {
            return res.json(JSON.parse(cachedAccount));
        }

        const account = await prisma.account.findUnique({
            where: { id }
        });

        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Cache the result
        await redis.setex(`account:${id}`, 3600, JSON.stringify(account));

        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

app.get('/:accountId', async (req, res) => {
    try {
        const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }
        res.json(account);
    } catch (error) {
        console.error('Error fetching account:', error);
        res.status(500).json({ message: 'Failed to fetch account' });
    }
});

app.post('/:accountId/deposit', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { amount } = req.body;

        const updatedAccount = await prisma.account.update({
            where: { id: accountId },
            data: { balance: { increment: amount } }
        });
        await redis.del(`account:${accountId}`);

        res.status(200).json({ message: 'Deposit successful', account: updatedAccount });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ message: 'Deposit failed' });
    }
});
app.post('/:accountId/withdraw', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const account = await prisma.account.findUnique({ where: { id: accountId } });

        if (!account || account.balance < amount) {
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        const updatedAccount = await prisma.account.update({
            where: { id: accountId },
            data: { balance: { decrement: amount } }
        });
        await redis.del(`account:${accountId}`);
        res.status(200).json({ message: 'Withdrawal successful', account: updatedAccount });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ message: 'Withdrawal failed' });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Account service running on port ${PORT}`);
});