import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getAllInvoices, exportToCSV } from '../controllers/invoiceController.js';

const router = express.Router();

/**
 * @swagger
 * /invoices:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get all invoices
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of invoices
 */
router.get('/', authenticate, getAllInvoices);

/**
 * @swagger
 * /invoices/export-csv:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Export invoices to CSV
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: CSV file
 */
router.get('/export-csv', authenticate, exportToCSV);

export default router;
