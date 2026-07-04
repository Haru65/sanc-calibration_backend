import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllReports,
  getReportById,
  renderReportPdf,
  createReport,
  updateReport,
  deleteReport
} from '../controllers/reportController.js';

const router = express.Router();

/**
 * @swagger
 * /reports:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get all reports
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [calibration, test]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of reports
 */
router.get('/', authenticate, getAllReports);

router.post('/render-pdf', authenticate, renderReportPdf);

/**
 * @swagger
 * /reports/{id}:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get a report by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report details
 */
router.get('/:id', authenticate, getReportById);

/**
 * @swagger
 * /reports:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new report
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               certificateNo:
 *                 type: string
 *               customerId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Report created
 */
router.post('/', authenticate, createReport);

/**
 * @swagger
 * /reports/{id}:
 *   put:
 *     security:
 *       - bearerAuth: []
 *     summary: Update a report
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Report updated
 */
router.put('/:id', authenticate, updateReport);

/**
 * @swagger
 * /reports/{id}:
 *   delete:
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a report
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report deleted
 */
router.delete('/:id', authenticate, deleteReport);

export default router;
