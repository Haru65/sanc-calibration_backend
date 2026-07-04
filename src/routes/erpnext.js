import express from 'express';
import {
  createErpNextCalibrationReport,
  getErpNextCalibrationSources,
  getErpNextHealth,
  getErpNextPurchaseOrders,
  syncErpNextInvoices,
} from '../controllers/erpnextController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/health', authenticate, getErpNextHealth);
router.get('/purchase-orders', authenticate, getErpNextPurchaseOrders);
router.post('/sync-invoices', authenticate, syncErpNextInvoices);
router.get('/calibration-sources', authenticate, getErpNextCalibrationSources);
router.post('/calibration-report', authenticate, createErpNextCalibrationReport);

export default router;
