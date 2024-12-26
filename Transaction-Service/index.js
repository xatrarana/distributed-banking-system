
// transaction-service/src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const Queue = require('bull');

const prisma = new PrismaClient();
const redis = new Redis();

// Create Bull queue for transaction processing
const transactionQueue = new Queue('transaction-processing', {
    redis
});

const app = express();
app.use(express.json());

// Process transfer
app.post('/transfer', async (req, res) => {
    try {
        const { fromAccountId, toAccountId, amount } = req.body;

        // Create transaction record
        const transaction = await prisma.transaction.create({
            data: {
                fromAccountId,
                toAccountId,
                amount,
                status: 'PENDING',
                type: 'TRANSFER'
            }
        });

        // Add to processing queue
        await transactionQueue.add('process-transfer', {
            transactionId: transaction.id,
            fromAccountId,
            toAccountId,
            amount
        });

        res.status(202).json({
            message: 'Transfer initiated',
            transactionId: transaction.id
        });
    } catch (error) {
        res.status(400).json({ error: 'Transfer failed' });
    }
});

const axios = require('axios');

app.post('/deposit', async (req, res) => {
    try {
        const { accountId, amount } = req.body;

        // Validate request parameters
        if (!accountId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request parameters' });
        }

        console.log(req.headers['x-auth'])

        // 1. Call Account Service to deposit
        const depositResponse = await axios.post(
            `http://localhost:3000/api/accounts/${accountId}/deposit`,
            { amount: amount },
            {
                headers: {
                    'Authorization': `Bearer ${req.headers['x-auth']}`
                }
            }

        );

        if (depositResponse.status !== 200) {
            return res.status(depositResponse.status).json({
                error: depositResponse.data.message || 'Deposit failed',
            });
        }

        // 2. Create transaction record
        const transaction = await prisma.transaction.create({
            data: {
                fromAccountId: accountId, // Assuming deposits don't have a 'from' account
                toAccountId: accountId,
                amount,
                status: 'SUCCESS',
                type: 'DEPOSIT',
            },
        });

        res.status(200).json({ message: 'Deposit successful', transaction });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: 'Deposit failed' });
    }
});

app.post('/withdraw', async (req, res) => {
    try {
        const { accountId, amount } = req.body;

        // Validate request parameters
        if (!accountId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request parameters' });
        }

        // 1. Call Account Service to withdraw
        const withdrawResponse = await axios.post(
            `http://localhost:3000/api/accounts/${accountId}/withdraw`,
            { amount: amount },
            {
                headers: {
                    'Authorization': `Bearer ${req.headers['x-auth']}`
                }
            }
        );

        if (withdrawResponse.status !== 200) {
            return res.status(withdrawResponse.status).json({
                error: withdrawResponse.data.message || 'Withdrawal failed',
            });
        }

        // 2. Create transaction record
        const transaction = await prisma.transaction.create({
            data: {
                fromAccountId: accountId,
                toAccountId: accountId, // Assuming withdrawals don't have a 'to' account
                amount,
                status: 'SUCCESS',
                type: 'WITHDRAWAL',
            },
        });

        res.status(200).json({ message: 'Withdrawal successful', transaction });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// Process queue jobs
transactionQueue.process('process-transfer', async (job) => {
    const { transactionId, fromAccountId, toAccountId, amount } = job.data;

    try {
        // Start transaction
        await prisma.$transaction(async (tx) => {
            // Update source account
            const sourceAccount = await tx.account.update({
                where: { id: fromAccountId },
                data: { balance: { decrement: amount } }
            });

            // Update destination account
            const destAccount = await tx.account.update({
                where: { id: toAccountId },
                data: { balance: { increment: amount } }
            });

            // Update transaction status
            await tx.transaction.update({
                where: { id: transactionId },
                data: { status: 'COMPLETED' }
            });

            // Invalidate cache for both accounts
            await redis.del(`account:${fromAccountId}`);
            await redis.del(`account:${toAccountId}`);
        });
    } catch (error) {
        // Mark transaction as failed
        await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: 'FAILED' }
        });
        throw error;
    }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Transaction service running on port ${PORT}`);
});