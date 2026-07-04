import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getKPIs, getQuickTasks, getRecentActivities } from '../controllers/dashboardController.js';

const router = express.Router();

/**
 * @swagger
 * /dashboard/kpis:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get dashboard KPIs
 *     responses:
 *       200:
 *         description: KPI metrics
 */
router.get('/kpis', authenticate, getKPIs);

/**
 * @swagger
 * /dashboard/quick-tasks:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get quick tasks
 *     responses:
 *       200:
 *         description: List of pending tasks
 */
router.get('/quick-tasks', authenticate, getQuickTasks);

/**
 * @swagger
 * /dashboard/recent-activities:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get recent activities
 *     responses:
 *       200:
 *         description: Recent activities feed
 */
router.get('/recent-activities', authenticate, getRecentActivities);

export default router;
