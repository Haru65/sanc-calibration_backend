import logger from '../config/logger.js';
import {
  checkErpNextHealth,
  getPendingInvoices,
  getRecentSubmittedInvoices,
  markInvoiceIntegrated,
} from '../services/erpnextService.js';
import {
  buildCalibrationReportFromErpItem,
  buildCalibrationReportsFromErpItem,
  getCalibrationSourceReports,
} from '../services/calibrationReportService.js';
import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const parseDate = (value, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const cleanInvoiceNumber = (value) => String(value || '').trim();

const compactSpecs = (specs) => specs.filter((spec) => String(spec.value ?? '').trim());

const normalizeDeviceName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const erpItemName = (item = {}) =>
  item.itemName || item.name || item.description || item.itemCode || '';

const buildReportItems = (items = []) =>
  items.map((item, index) => ({
    sr: index + 1,
    name: item.itemName || item.description || item.itemCode || 'Instrument',
    qty: item.quantity || 1,
    specs: compactSpecs([
      { key: 'ITEM CODE', value: item.itemCode },
      { key: 'MAKE', value: item.make },
      { key: 'MODEL', value: item.model },
      { key: 'RANGE', value: item.range },
      { key: 'ACCURACY', value: item.accuracy },
      { key: 'SERIAL NO', value: item.serialNumber },
    ]),
  }));

const findOrCreateCustomer = async (db, invoice) => {
  const name = invoice.customerName || invoice.customer || 'ERPNext Customer';
  const existing = await db.customer.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  const data = {
    name,
    email: invoice.customerEmail || null,
    phone: invoice.customerPhone || '',
    address: invoice.customerAddress || null,
    gstin: invoice.gstin || null,
  };

  if (existing) {
    return db.customer.update({
      where: { id: existing.id },
      data: {
        email: existing.email || data.email,
        phone: existing.phone || data.phone,
        address: existing.address || data.address,
        gstin: existing.gstin || data.gstin,
      },
    });
  }

  return db.customer.create({ data });
};

const findInstrumentByItemName = async (item) => {
  const itemName = normalizeDeviceName(erpItemName(item));
  if (!itemName) return null;

  const instruments = await prisma.instrument.findMany({
    where: { ignored: false },
    select: {
      id: true,
      name: true,
    },
  });

  const candidates = instruments
    .map((instrument) => ({
      ...instrument,
      normalizedName: normalizeDeviceName(instrument.name),
    }))
    .filter((instrument) => instrument.normalizedName);

  return (
    candidates.find((instrument) => instrument.normalizedName === itemName) ||
    candidates.find((instrument) =>
      itemName.length >= 3 &&
      instrument.normalizedName.length >= 3 &&
      (itemName.includes(instrument.normalizedName) || instrument.normalizedName.includes(itemName))
    ) ||
    null
  );
};

const resolveInvoiceInstruments = async (items = []) => {
  if (!items.length) {
    return {
      matched: [],
      missing: ['No ERPNext invoice items found'],
    };
  }

  const matched = [];
  const missing = [];

  for (const [index, item] of items.entries()) {
    const instrument = await findInstrumentByItemName(item);

    if (instrument) {
      matched.push({ itemIndex: index, instrument });
    } else {
      missing.push(erpItemName(item) || `Line ${index + 1}`);
    }
  }

  return { matched, missing };
};

const pendingInstrumentReason = (missing = []) =>
  `Pending: ERPNext item name not found in local instruments. Missing item${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`;

const upsertErpInvoice = async (invoice) => {
  const invoiceNumber = cleanInvoiceNumber(invoice.invoiceNumber || invoice.id);
  if (!invoiceNumber) return { skipped: true, reason: 'Missing invoice number' };
  const items = invoice.items || [];
  const { matched, missing } = await resolveInvoiceInstruments(items);

  const result = await prisma.$transaction(async (tx) => {
    const customer = await findOrCreateCustomer(tx, invoice);
    const issueDate = parseDate(invoice.invoiceDate || invoice.poDate);
    const pendingReason = missing.length ? pendingInstrumentReason(missing) : '';
    const invoiceRecord = await tx.invoice.upsert({
      where: { invoiceNumber },
      update: {
        customerId: customer.id,
        issueDate,
        calibrationDate: parseDate(invoice.poDate || invoice.invoiceDate, issueDate),
        amount: invoice.amount,
        status: pendingReason ? 'pending' : invoice.status || 'Submitted',
      },
      create: {
        invoiceNumber,
        customerId: customer.id,
        issueDate,
        calibrationDate: parseDate(invoice.poDate || invoice.invoiceDate, issueDate),
        amount: invoice.amount,
        status: pendingReason ? 'pending' : invoice.status || 'Submitted',
      },
    });

    const reportItems = buildReportItems(invoice.items || []);
    const reportData = {
      type: 'test',
      certificateNo: invoiceNumber,
      tcNumber: invoiceNumber,
      customerId: customer.id,
      invoiceId: invoiceRecord.id,
      issueDate,
      status: pendingReason ? 'pending' : 'issued',
      poNumber: invoice.poNumber || '',
      tcDate: issueDate,
      items: JSON.stringify(reportItems),
      notes: pendingReason ||
        'This is to certify that the material has been checked for Visual, Dimensional and Performance tests and found within accuracy.',
      customRemark: pendingReason,
      legalDisclaimer:
        'We confirm the specifications and performance for a period of 12 months from the date of commissioning or 18 months from the date of dispatch, whichever is earlier, for manufacturing defects only. We reserve the right of repair or to replace the defective material in parts or in full depending upon the nature of the defect & observation. Furthermore, all warranties cease to apply if the instruction manual is not followed.',
    };

    const report = await tx.report.upsert({
      where: { certificateNo: invoiceNumber },
      update: reportData,
      create: reportData,
      include: {
        customer: true,
        invoice: true,
        instrument: true,
      },
    });

    return {
      skipped: false,
      pending: Boolean(pendingReason),
      reason: pendingReason,
      missingItems: missing,
      invoice: invoiceRecord,
      report,
    };
  });

  if (result.pending) {
    return {
      ...result,
      calibrationReports: [],
    };
  }

  const calibrationReports = [];

  for (const match of matched) {
    const reports = await buildCalibrationReportsFromErpItem({
      sourceReportId: result.report.id,
      itemIndex: match.itemIndex,
      instrumentId: match.instrument.id,
    });
    calibrationReports.push(...reports);
  }

  return {
    ...result,
    calibrationReports,
  };
};

export const getErpNextPurchaseOrders = async (req, res) => {
  try {
    const started = Date.now();
    const limit = req.query.limit || 50;
    const data = await getRecentSubmittedInvoices({ limit });

    res.json({
      ...data,
      source: 'ERPNext',
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    logger.error('ERPNext purchase order fetch error:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to fetch ERPNext PO/invoice data',
      detail: error.message,
    });
  }
};

export const getErpNextHealth = async (req, res) => {
  try {
    const health = await checkErpNextHealth();
    res.json(health);
  } catch (error) {
    logger.error('ERPNext health check error:', error);
    res.status(error.statusCode || 500).json({
      status: 'error',
      error: error.message,
    });
  }
};

export const runErpNextInvoiceSync = async ({ limit = 50, includeIntegrated = false } = {}) => {
  const data = includeIntegrated
    ? await getRecentSubmittedInvoices({ limit })
    : await getPendingInvoices({ limit });
  const results = [];

  for (const invoice of data.purchaseOrders) {
    const result = await upsertErpInvoice(invoice);

    if (!result.skipped && !result.pending) {
      try {
        await markInvoiceIntegrated(invoice.invoiceNumber || invoice.id);
        result.acknowledged = true;
      } catch (error) {
        result.acknowledged = false;
        result.acknowledgmentError = error.message;
        logger.error(`ERPNext acknowledgment failed for ${invoice.invoiceNumber || invoice.id}:`, error);
      }
    } else if (result.pending) {
      result.acknowledged = false;
      result.acknowledgmentError = result.reason;
    }

    results.push(result);
  }

  const saved = results.filter((result) => !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  const acknowledged = saved.filter((result) => result.acknowledged);
  const acknowledgmentFailed = saved.filter((result) => !result.acknowledged);

  return {
    fetched: data.count,
    saved: saved.length,
    pending: saved.filter((result) => result.pending).length,
    calibrationReports: saved.reduce((sum, result) => sum + (result.calibrationReports?.length || 0), 0),
    acknowledged: acknowledged.length,
    acknowledgmentFailed: acknowledgmentFailed.length,
    skipped: skipped.length,
    reports: saved.map((result) => result.report),
    acknowledgmentErrors: acknowledgmentFailed.map((result) => ({
      invoiceNumber: result.invoice?.invoiceNumber,
      error: result.acknowledgmentError,
    })),
    skippedItems: skipped,
  };
};

export const syncErpNextInvoices = async (req, res) => {
  try {
    const limit = req.query.limit || req.body?.limit || 50;
    const includeIntegratedValue = req.query.includeIntegrated ?? req.body?.includeIntegrated;
    const includeIntegrated = ['1', 'true'].includes(String(includeIntegratedValue).toLowerCase());
    const result = await runErpNextInvoiceSync({ limit, includeIntegrated });
    res.json(result);
  } catch (error) {
    logger.error('ERPNext invoice sync error:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to sync ERPNext invoices',
      detail: error.message,
    });
  }
};

export const getErpNextCalibrationSources = async (_req, res) => {
  try {
    const sources = await getCalibrationSourceReports();
    res.json(sources);
  } catch (error) {
    logger.error('ERPNext calibration source fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch ERPNext calibration sources',
      detail: error.message,
    });
  }
};

export const createErpNextCalibrationReport = async (req, res) => {
  try {
    const hasUnitIndex = Object.prototype.hasOwnProperty.call(req.body || {}, 'unitIndex');
    const payload = {
      sourceReportId: req.body?.sourceReportId,
      itemIndex: req.body?.itemIndex || 0,
      instrumentId: req.body?.instrumentId,
    };
    const report = hasUnitIndex
      ? await buildCalibrationReportFromErpItem({
          ...payload,
          unitIndex: req.body?.unitIndex || 0,
        })
      : await buildCalibrationReportsFromErpItem(payload);

    res.status(201).json(report);
  } catch (error) {
    logger.error('ERPNext calibration report generation error:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to generate calibration report from ERPNext data',
      detail: error.message,
    });
  }
};
