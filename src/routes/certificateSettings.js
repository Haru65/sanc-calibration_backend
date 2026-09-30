import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { updateCertificateSettingsSchema } from '../schemas/certificateSettingsSchema.js';
import {
  getCertificateSettings,
  updateCertificateSettings,
} from '../controllers/certificateSettingsController.js';

const router = express.Router();

router.get('/', authenticate, getCertificateSettings);
router.put(
  '/',
  authenticate,
  requireSuperAdmin,
  validateRequest(updateCertificateSettingsSchema),
  updateCertificateSettings
);

export default router;
