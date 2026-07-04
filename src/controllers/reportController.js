import pkg from '@prisma/client';
import logger from '../config/logger.js';
import fs from 'fs/promises';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { buildReportStandards } from '../services/calibrationReportService.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const findChromeExecutable = async () => {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser path.
    }
  }
  return null;
};

const getChromeExecutable = async () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  if (process.platform === 'win32') {
    return findChromeExecutable();
  }

  try {
    const bundledChromePath = await chromium.executablePath();
    if (bundledChromePath) return bundledChromePath;
  } catch (error) {
    logger.warn('Bundled Chromium executable unavailable:', error);
  }

  return findChromeExecutable();
};

const renderHtmlToPdf = async (html) => {
  const executablePath = await getChromeExecutable();

  if (!executablePath) {
    throw new Error('Chrome or Chromium was not found on the server.');
  }

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 30000 });
    await page.emulateMediaType('print');

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
};

const safePdfFilename = (value) =>
  String(value || 'certificate.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\.pdf$/i, '')
    .replace(/^-+|-+$/g, '') || 'certificate';

const validateJsonField = (data, fieldName, expectedRoot) => {
  if (data[fieldName] === undefined || data[fieldName] === null || data[fieldName] === '') return null;

  try {
    const parsed = typeof data[fieldName] === 'string' ? JSON.parse(data[fieldName]) : data[fieldName];

    if (expectedRoot === 'readings') {
      const rows = Array.isArray(parsed) ? parsed : parsed.rows;
      const sections = parsed.sections;

      if (!Array.isArray(rows) && !Array.isArray(sections)) {
        return `${fieldName} must contain rows or sections`;
      }
    }

    if (expectedRoot === 'items' && !Array.isArray(parsed)) {
      return `${fieldName} must be an array`;
    }
  } catch {
    return `${fieldName} must be valid JSON`;
  }

  return null;
};

const parseJsonList = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const hasUsableStandard = (standard) => {
  if (!standard || typeof standard !== 'object') return Boolean(standard);

  return [
    standard.name,
    standard.instrument,
    standard.serial,
    standard.serialNo,
    standard.id,
    standard.cert,
    standard.certificateNo,
    standard.reportNo,
    standard.valid,
    standard.certExpiry,
    standard.validUpto,
  ].some((value) => value !== undefined && value !== null && !Array.isArray(value) && String(value).trim() !== '');
};

const instrumentFromReport = (report) =>
  report.instrument || {
    name: report.instrumentName,
    model: report.instrumentModel,
    serial: report.instrumentSerial,
    instrumentId: report.instrumentTag,
    category: report.instrumentName,
    standards: [],
  };

const withResolvedStandards = (report) => {
  if (!report || report.type !== 'calibration') return report;

  const storedStandards = parseJsonList(report.refStandards);
  const refStandards = storedStandards.some(hasUsableStandard)
    ? storedStandards
    : buildReportStandards(instrumentFromReport(report));

  return {
    ...report,
    refStandards: JSON.stringify(refStandards),
  };
};

const reportInclude = {
  customer: true,
  instrument: {
    include: {
      standards: true,
    },
  },
  invoice: true,
};

const sanitizeReportData = (data) => {
  const next = { ...data };
  const errors = [
    validateJsonField(next, 'readings', 'readings'),
    validateJsonField(next, 'items', 'items'),
    validateJsonField(next, 'refStandards', 'items'),
  ].filter(Boolean);

  return { data: next, errors };
};

export const renderReportPdf = async (req, res) => {
  try {
    const { html, filename } = req.body || {};

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Printable HTML is required' });
    }

    const pdf = await renderHtmlToPdf(html);
    const cleanFilename = `${safePdfFilename(filename)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    res.send(pdf);
  } catch (error) {
    logger.error('Render report PDF error:', error);
    res.status(500).json({ error: error.message || 'Failed to render PDF' });
  }
};

export const getAllReports = async (req, res) => {
  try {
    const { type, search } = req.query;
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const where = {};

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { certificateNo: { contains: search, mode: 'insensitive' } },
        { tcNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { instrumentName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const reports = await prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: { issueDate: 'desc' },
      take: limit,
    });

    res.json(reports.map(withResolvedStandards));
  } catch (error) {
    logger.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await prisma.report.findUnique({
      where: { id: parseInt(id) },
      include: reportInclude,
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(withResolvedStandards(report));
  } catch (error) {
    logger.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

export const createReport = async (req, res) => {
  try {
    const { data, errors } = sanitizeReportData(req.validated ?? req.body);
    if (errors.length) return res.status(400).json({ errors });

    const report = await prisma.report.create({
      data,
      include: reportInclude,
    });

    logger.info(`Report created: ${report.id}`);
    res.status(201).json(withResolvedStandards(report));
  } catch (error) {
    logger.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
};

export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, errors } = sanitizeReportData(req.validated ?? req.body);
    if (errors.length) return res.status(400).json({ errors });

    const report = await prisma.report.update({
      where: { id: parseInt(id) },
      data,
      include: reportInclude,
    });

    logger.info(`Report updated: ${id}`);
    res.json(withResolvedStandards(report));
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Report not found' });
    }
    logger.error('Update report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
};

export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.report.delete({
      where: { id: parseInt(id) },
    });

    logger.info(`Report deleted: ${id}`);
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Report not found' });
    }
    logger.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
};
