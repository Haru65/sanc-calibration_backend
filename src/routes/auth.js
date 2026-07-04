import express from 'express';
import { validateRequest } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import { login, logout, validateSession, changePassword } from '../controllers/authController.js';
import { loginSchema, changePasswordSchema } from '../schemas/authSchema.js';

const router = express.Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', validateRequest(loginSchema), login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Logout user
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', authenticate, logout);

/**
 * @swagger
 * /auth/validate-session:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Validate current session
 *     responses:
 *       200:
 *         description: Session is valid
 */
router.get('/validate-session', authenticate, validateSession);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Change user password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post('/change-password', authenticate, validateRequest(changePasswordSchema), changePassword);

export default router;
