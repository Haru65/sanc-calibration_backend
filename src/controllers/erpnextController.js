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

const itemQuantity = (item = {}) => {
  const numeric = Number(String(item.quantity ?? item.qty ?? 1).match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.floor(numeric)) : 1;
};

const splitErpItemName = (item = {}) => {
  const itemName = String(item.itemName || '').trim();
  if (!itemName.includes(',')) return [itemName].filter(Boolean);

  return itemName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const expandInvoiceDevices = (items = []) =>
  items.flatMap((item, sourceItemIndex) => {
    const splitNames = splitErpItemName(item);
    const deviceNames = splitNames.length ? splitNames : [erpItemName(item) || `Line ${sourceItemIndex + 1}`];
    const isSplitItem = deviceNames.length > 1;

    return deviceNames.map((deviceName, sourceDeviceIndex) => ({
      ...item,
      itemName: deviceName,
      name: deviceName,
      title: deviceName,
      quantity: isSplitItem ? 1 : item.quantity,
      splitFromItemName: isSplitItem,
      sourceItemIndex,
      sourceDeviceIndex,
      sourceItemName: item.itemName || '',
    }));
  });

const normalizedValues = (values = []) =>
  values
    .map((value) => normalizeDeviceName(value))
    .filter(Boolean);

const erpItemSearchValues = (item = {}) =>
  normalizedValues(
    item.splitFromItemName
      ? [
          item.itemName,
          item.name,
          item.title,
        ]
      : [
          item.itemCode,
          item.model,
          item.serialNumber,
          item.itemName,
          item.name,
          item.title,
          item.description,
          item.make,
        ]
  );

const erpItemSearchText = (item = {}) => erpItemSearchValues(item).join(' ');

const normalizedInstrument = (instrument) => ({
  ...instrument,
  normalizedName: normalizeDeviceName(instrument.name),
  normalizedModel: normalizeDeviceName(instrument.model),
  normalizedSerial: normalizeDeviceName(instrument.serial),
  normalizedInstrumentId: normalizeDeviceName(instrument.instrumentId),
  normalizedMake: normalizeDeviceName(instrument.make),
  normalizedCategory: normalizeDeviceName(instrument.category),
  normalizedDescription: normalizeDeviceName(instrument.description),
});

const includesSearchText = (searchText, value, minLength = 3) =>
  value && value.length >= minLength && searchText.includes(value);

const buildReportItems = (resolvedDevices = []) =>
  resolvedDevices.map((device, index) => ({
    sr: index + 1,
    name: device.itemName || device.description || device.itemCode || 'Instrument',
    qty: itemQuantity(device),
    matched: Boolean(device.instrument),
    missing: !device.instrument,
    instrumentId: device.instrument?.id || null,
    sourceItemIndex: device.sourceItemIndex,
    sourceDeviceIndex: device.sourceDeviceIndex,
    specs: compactSpecs([
      { key: 'ITEM CODE', value: device.itemCode },
      { key: 'MAKE', value: device.make },
      { key: 'MODEL', value: device.model },
      { key: 'RANGE', value: device.range },
      { key: 'ACCURACY', value: device.accuracy },
      { key: 'SERIAL NO', value: device.serialNumber },
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

const findInstrumentByErpItem = async (item) => {
  const itemValues = erpItemSearchValues(item);
  const itemText = itemValues.join(' ');
  const itemIdentifiers = normalizedValues(
    item.splitFromItemName
      ? [item.itemName, item.name, item.title]
      : [item.itemCode, item.model, item.serialNumber]
  );

  if (!itemText) return null;

  const instruments = await prisma.instrument.findMany({
    where: { ignored: false },
    select: {
      id: true,
      name: true,
      model: true,
      serial: true,
      instrumentId: true,
      make: true,
      category: true,
      description: true,
    },
  });

  const candidates = instruments
    .map(normalizedInstrument)
    .filter((instrument) =>
      instrument.normalizedName ||
      instrument.normalizedModel ||
      instrument.normalizedSerial ||
      instrument.normalizedInstrumentId
    );

  return (
    candidates.find((instrument) => itemIdentifiers.includes(instrument.normalizedModel)) ||
    candidates.find((instrument) => itemIdentifiers.includes(instrument.normalizedInstrumentId)) ||
    candidates.find((instrument) => itemIdentifiers.includes(instrument.normalizedSerial)) ||
    candidates.find((instrument) => itemValues.includes(instrument.normalizedName)) ||
    candidates.find((instrument) => includesSearchText(itemText, instrument.normalizedModel)) ||
    candidates.find((instrument) => includesSearchText(itemText, instrument.normalizedInstrumentId)) ||
    candidates.find((instrument) => includesSearchText(itemText, instrument.normalizedName)) ||
    candidates.find((instrument) =>
      includesSearchText(itemText, instrument.normalizedCategory) &&
      includesSearchText(itemText, instrument.normalizedMake)
    ) ||
    null
  );
};

const resolveInvoiceInstruments = async (items = []) => {
  const devices = expandInvoiceDevices(items);

  if (!devices.length) {
    return {
      matched: [],
      missing: [{ name: 'No ERPNext invoice items found', quantity: 1 }],
      devices: [],
      totalDevices: 0,
      matchedDevices: 0,
      missingDevices: 1,
    };
  }

  const matched = [];
  const missing = [];
  const resolvedDevices = [];

  for (const [index, device] of devices.entries()) {
    const instrument = await findInstrumentByErpItem(device);
    const resolvedDevice = { ...device, reportItemIndex: index, instrument };
    resolvedDevices.push(resolvedDevice);

    if (instrument) {
      matched.push({ itemIndex: index, instrument, item: resolvedDevice });
    } else {
      missing.push({
        name: erpItemName(device) || `Line ${index + 1}`,
        quantity: itemQuantity(device),
      });
    }
  }

  return {
    matched,
    missing,
    devices: resolvedDevices,
    totalDevices: resolvedDevices.reduce((sum, device) => sum + itemQuantity(device), 0),
    matchedDevices: matched.reduce((sum, match) => sum + itemQuantity(match.item), 0),
    missingDevices: missing.reduce((sum, item) => sum + item.quantity, 0),
  };
};

const pendingInstrumentReason = ({ matchedDevices = 0, totalDevices = 0, missing = [] } = {}) => {
  const names = missing.map((item) => item.name).join(', ');
  const missingDevices = missing.reduce((sum, item) => sum + item.quantity, 0);
  return `Pending: ${matchedDevices}/${totalDevices || matchedDevices + missingDevices} devices found. ${missingDevices} pending, can't find: ${names}`;
};

const upsertErpInvoice = async (invoice) => {
  const invoiceNumber = cleanInvoiceNumber(invoice.invoiceNumber || invoice.id);
  if (!invoiceNumber) return { skipped: true, reason: 'Missing invoice number' };
  const items = invoice.items || [];
  const resolved = await resolveInvoiceInstruments(items);
  const { matched, missing, devices, totalDevices, matchedDevices, missingDevices } = resolved;

  const result = await prisma.$transaction(async (tx) => {
    const customer = await findOrCreateCustomer(tx, invoice);
    const issueDate = parseDate(invoice.invoiceDate || invoice.poDate);
    const pendingReason = missing.length
      ? pendingInstrumentReason({ matchedDevices, totalDevices, missing })
      : '';
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

    const reportItems = buildReportItems(devices);
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
      missingItems: missing.map((item) => item.name),
      totalDevices,
      matchedDevices,
      missingDevices,
      invoice: invoiceRecord,
      report,
    };
  });

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

const acknowledgeProcessedInvoice = async (invoice, result) => {
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

  return result;
};

const summarizeSyncResults = (results, fetched) => {
  const saved = results.filter((result) => !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  const acknowledged = saved.filter((result) => result.acknowledged);
  const acknowledgmentFailed = saved.filter((result) => !result.acknowledged);

  return {
    fetched,
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
    results.push(await acknowledgeProcessedInvoice(invoice, result));
  }

  return summarizeSyncResults(results, data.count);
};

export const reprocessPendingErpNextInvoices = async ({ limit = 500, dryRun = false } = {}) => {
  const [pendingInvoices, pendingReports] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { equals: 'pending', mode: 'insensitive' } },
      select: { invoiceNumber: true },
    }),
    prisma.report.findMany({
      where: {
        type: 'test',
        OR: [
          { status: { equals: 'pending', mode: 'insensitive' } },
          { customRemark: { contains: 'Pending:', mode: 'insensitive' } },
          { notes: { contains: 'Pending:', mode: 'insensitive' } },
        ],
      },
      select: {
        certificateNo: true,
        tcNumber: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
  ]);

  const pendingNumbers = new Set([
    ...pendingInvoices.map((invoice) => invoice.invoiceNumber),
    ...pendingReports.flatMap((report) => [
      report.invoice?.invoiceNumber,
      report.tcNumber,
      report.certificateNo,
    ]),
  ].map(cleanInvoiceNumber).filter(Boolean));

  if (!pendingNumbers.size) {
    return {
      fetched: 0,
      matchedPending: 0,
      missingFromErpNext: [],
      ...summarizeSyncResults([], 0),
    };
  }

  const data = await getRecentSubmittedInvoices({ limit });
  const erpInvoicesByNumber = new Map(
    data.purchaseOrders
      .map((invoice) => [cleanInvoiceNumber(invoice.invoiceNumber || invoice.id), invoice])
      .filter(([invoiceNumber]) => invoiceNumber)
  );
  const matchedInvoices = [...pendingNumbers]
    .map((invoiceNumber) => erpInvoicesByNumber.get(invoiceNumber))
    .filter(Boolean);

  if (dryRun) {
    const checks = [];

    for (const invoice of matchedInvoices) {
      const { matched, missing, totalDevices, matchedDevices, missingDevices } =
        await resolveInvoiceInstruments(invoice.items || []);
      checks.push({
        invoiceNumber: cleanInvoiceNumber(invoice.invoiceNumber || invoice.id),
        matchedItems: matched.length,
        totalDevices,
        matchedDevices,
        missingDevices,
        missingItems: missing.map((item) => item.name),
        canRepair: missing.length === 0,
      });
    }

    return {
      fetched: data.count,
      matchedPending: matchedInvoices.length,
      missingFromErpNext: [...pendingNumbers].filter((invoiceNumber) => !erpInvoicesByNumber.has(invoiceNumber)),
      dryRun: true,
      checks,
      ...summarizeSyncResults([], data.count),
    };
  }

  const results = [];

  for (const invoice of matchedInvoices) {
    const result = await upsertErpInvoice(invoice);
    results.push(await acknowledgeProcessedInvoice(invoice, result));
  }

  return {
    matchedPending: matchedInvoices.length,
    missingFromErpNext: [...pendingNumbers].filter((invoiceNumber) => !erpInvoicesByNumber.has(invoiceNumber)),
    ...summarizeSyncResults(results, data.count),
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
