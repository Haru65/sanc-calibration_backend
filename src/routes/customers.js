import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { getAllCustomers, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customerController.js';
import { createCustomerSchema, updateCustomerSchema } from '../schemas/customerSchema.js';

const router = express.Router();

/**
 * @swagger
 * /customers:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get all customers
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of customers
 */
router.get('/', authenticate, getAllCustomers);

/**
 * @swagger
 * /customers:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               gstin:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created
 */
router.post('/', authenticate, validateRequest(createCustomerSchema), createCustomer);

/**
 * @swagger
 * /customers/{id}:
 *   put:
 *     security:
 *       - bearerAuth: []
 *     summary: Update a customer
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
 *         description: Customer updated
 */
router.put('/:id', authenticate, validateRequest(updateCustomerSchema), updateCustomer);

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Customer deleted
 */
router.delete('/:id', authenticate, deleteCustomer);

export default router;
