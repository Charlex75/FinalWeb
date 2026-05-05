import { Router } from 'express';
import mongoose from 'mongoose';
import userRouter from './user.routes';
import clientRouter from './client.routes';
import projectRouter from './project.routes';
import deliveryNoteRouter from './deliverynote.routes';
import { authenticate } from '../middleware/auth.middleware';
import { getDashboard } from '../controllers/dashboard.controller';

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
router.use('/api/project', projectRouter);
router.use('/api/deliverynote', deliveryNoteRouter);

/**
 * @openapi
 * /api/dashboard:
 *   get:
 *     summary: Company dashboard (aggregation pipeline)
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Aggregated stats for the authenticated user's company
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     clients:    { type: integer }
 *                     projects:   { type: integer }
 *                     notes:      { type: integer }
 *                     signedNotes:{ type: integer }
 *                 notesByMonth:     { type: array }
 *                 hoursByProject:   { type: array }
 *                 formatBreakdown:  { type: array }
 *                 materialsByClient:{ type: array }
 */
router.get('/api/dashboard', authenticate, getDashboard);

export default router;
