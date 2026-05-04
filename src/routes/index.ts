import { Router } from 'express';
import mongoose from 'mongoose';
import userRouter from './user.routes';
import clientRouter from './client.routes';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 db:
 *                   type: string
 *                   example: connected
 *                 uptime:
 *                   type: number
 *                   example: 42.5
 *                 timestamp:
 *                   type: string
 *                   example: "2025-01-01T00:00:00.000Z"
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.use('/api/user', userRouter);
router.use('/api/client', clientRouter);

// Stub mounts — will be wired up in subsequent phases
// router.use('/api/project', projectRouter);
// router.use('/api/deliverynote', deliveryNoteRouter);

export default router;
