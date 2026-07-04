import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { createStandardSchema, updateStandardSchema } from '../schemas/standardSchema.js';
import { getAllStandards, createStandard, updateStandard, deleteStandard } from '../controllers/standardController.js';

const router = express.Router();

/**
 * @swagger
 * /standards:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get all standards
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of standards
 */
router.get('/', authenticate, getAllStandards);

/**
 * @swagger
 * /standards:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new standard
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instrumentId:
 *                 type: integer
 *               instrument:
 *                 type: string
 *               calibrationDate:
 *                 type: string
 *                 format: date
 *               reportNo:
 *                 type: string
 *               certificateNo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Standard created
 */
router.post('/', authenticate, validateRequest(createStandardSchema), createStandard);

/**
 * @swagger
 * /standards/{id}:
 *   put:
 *     security:
 *       - bearerAuth: []
 *     summary: Update a standard
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
 *         description: Standard updated
 */
router.put('/:id', authenticate, validateRequest(updateStandardSchema), updateStandard);

/**
 * @swagger
 * /standards/{id}:
 *   delete:
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a standard
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Standard deleted
 */
router.delete('/:id', authenticate, deleteStandard);

export default router;
