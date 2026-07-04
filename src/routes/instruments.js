import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { getAllInstruments, createInstrument, updateInstrument, deleteInstrument } from '../controllers/instrumentController.js';
import { createInstrumentSchema, updateInstrumentSchema } from '../schemas/instrumentSchema.js';

const router = express.Router();

/**
 * @swagger
 * /instruments:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get all instruments
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: ignored
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of instruments
 */
router.get('/', authenticate, getAllInstruments);

/**
 * @swagger
 * /instruments:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new instrument
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               serial:
 *                 type: string
 *               make:
 *                 type: string
 *               model:
 *                 type: string
 *               category:
 *                 type: string
 *               customerId:
 *                 type: integer
 *               dueDate:
 *                 type: string
 *                 format: date
 *               ignored:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Instrument created
 */
router.post('/', authenticate, validateRequest(createInstrumentSchema), createInstrument);

/**
 * @swagger
 * /instruments/{id}:
 *   put:
 *     security:
 *       - bearerAuth: []
 *     summary: Update an instrument
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
 *         description: Instrument updated
 */
router.put('/:id', authenticate, validateRequest(updateInstrumentSchema), updateInstrument);

/**
 * @swagger
 * /instruments/{id}:
 *   delete:
 *     security:
 *       - bearerAuth: []
 *     summary: Delete an instrument
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Instrument deleted
 */
router.delete('/:id', authenticate, deleteInstrument);

export default router;
