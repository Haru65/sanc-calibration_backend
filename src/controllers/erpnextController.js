import logger from '../config/logger.js';
import { checkErpNextHealth, getApprovedPendingInvoices } from '../services/erpnextService.js';
import {
  buildCalibrationReportFromErpItem,
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

const findOrCreateCustomer = async (invoice) => {
  const name = invoice.customerName || invoice.customer || 'ERPNext Customer';
  const existing = await prisma.customer.findFirst({
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
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        email: existing.email || data.email,
        phone: existing.phone || data.phone,
        address: existing.address || data.address,
        gstin: existing.gstin || data.gstin,
      },
    });
  }

  return prisma.customer.create({ data });
};

const upsertErpInvoice = async (invoice) => {
  const invoiceNumber = cleanInvoiceNumber(invoice.invoiceNumber || invoice.id);
  if (!invoiceNumber) return { skipped: true, reason: 'Missing invoice number' };

  const customer = await findOrCreateCustomer(invoice);
  const issueDate = parseDate(invoice.invoiceDate || invoice.poDate);
  const invoiceRecord = await prisma.invoice.upsert({
    where: { invoiceNumber },
    update: {
      customerId: customer.id,
      issueDate,
      calibrationDate: parseDate(invoice.poDate || invoice.invoiceDate, issueDate),
      amount: invoice.amount,
      status: invoice.status || 'Approved',
    },
    create: {
      invoiceNumber,
      customerId: customer.id,
      issueDate,
      calibrationDate: parseDate(invoice.poDate || invoice.invoiceDate, issueDate),
      amount: invoice.amount,
      status: invoice.status || 'Approved',
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
    status: 'issued',
    poNumber: invoice.poNumber || '',
    tcDate: issueDate,
    items: JSON.stringify(reportItems),
    notes:
      'This is to certify that the material has been checked for Visual, Dimensional and Performance tests and found within accuracy.',
    legalDisclaimer:
      'We confirm the specifications and performance for a period of 12 months from the date of commissioning or 18 months from the date of dispatch, whichever is earlier, for manufacturing defects only. We reserve the right of repair or to replace the defective material in parts or in full depending upon the nature of the defect & observation. Furthermore, all warranties cease to apply if the instruction manual is not followed.',
  };

  const report = await prisma.report.upsert({
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
    invoice: invoiceRecord,
    report,
  };
};

export const getErpNextPurchaseOrders = async (req, res) => {
  try {
    const started = Date.now();
    const limit = req.query.limit || 50;
    const data = await getApprovedPendingInvoices({ limit });

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

export const runErpNextInvoiceSync = async ({ limit = 50 } = {}) => {
  const data = await getApprovedPendingInvoices({ limit });
  const results = [];

  for (const invoice of data.purchaseOrders) {
    results.push(await upsertErpInvoice(invoice));
  }

  const saved = results.filter((result) => !result.skipped);
  const skipped = results.filter((result) => result.skipped);

  return {
    fetched: data.count,
    saved: saved.length,
    skipped: skipped.length,
    reports: saved.map((result) => result.report),
    skippedItems: skipped,
  };
};

export const syncErpNextInvoices = async (req, res) => {
  try {
    const limit = req.query.limit || req.body?.limit || 50;
    const result = await runErpNextInvoiceSync({ limit });
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
    const report = await buildCalibrationReportFromErpItem({
      sourceReportId: req.body?.sourceReportId,
      itemIndex: req.body?.itemIndex || 0,
      instrumentId: req.body?.instrumentId,
    });

    res.status(201).json(report);
  } catch (error) {
    logger.error('ERPNext calibration report generation error:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to generate calibration report from ERPNext data',
      detail: error.message,
    });
  }
};
