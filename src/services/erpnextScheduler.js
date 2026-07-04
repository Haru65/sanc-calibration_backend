import logger from '../config/logger.js';
import { runErpNextInvoiceSync } from '../controllers/erpnextController.js';

let syncTimer = null;
let running = false;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isEnabled = () => String(process.env.ERPNEXT_AUTO_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';

const runScheduledSync = async (reason = 'scheduled') => {
  if (running) {
    logger.info(`ERPNext auto sync skipped (${reason}): previous sync still running`);
    return;
  }

  running = true;

  try {
    const limit = parsePositiveInt(process.env.ERPNEXT_AUTO_SYNC_LIMIT, 50);
    const result = await runErpNextInvoiceSync({ limit });
    logger.info(
      `ERPNext auto sync complete (${reason}): fetched=${result.fetched}, saved=${result.saved}, skipped=${result.skipped}`
    );
  } catch (error) {
    logger.error(`ERPNext auto sync failed (${reason}):`, error);
  } finally {
    running = false;
  }
};

export const startErpNextAutoSync = () => {
  if (!isEnabled()) {
    logger.info('ERPNext auto sync disabled by ERPNEXT_AUTO_SYNC_ENABLED=false');
    return;
  }

  if (syncTimer) return;

  const intervalMs = parsePositiveInt(process.env.ERPNEXT_AUTO_SYNC_INTERVAL_MS, 5 * 60 * 1000);
  const runOnStart = String(process.env.ERPNEXT_AUTO_SYNC_ON_START ?? 'true').toLowerCase() !== 'false';

  logger.info(`ERPNext auto sync enabled: interval=${intervalMs}ms`);
  syncTimer = setInterval(() => runScheduledSync('interval'), intervalMs);

  if (runOnStart) {
    setTimeout(() => runScheduledSync('startup'), 5000);
  }
};
