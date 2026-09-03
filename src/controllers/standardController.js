import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const parseDateValue = (value) => {
  if (value instanceof Date) return new Date(value);

  const raw = String(value || '').trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toUtcDateOnly = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const isFutureDate = (date) => toUtcDateOnly(date) > toUtcDateOnly(new Date());

const calculateDueDate = (date) => {
  const dueDate = new Date(date);
  dueDate.setUTCFullYear(dueDate.getUTCFullYear() + 1);
  dueDate.setUTCDate(dueDate.getUTCDate() - 1);
  return dueDate;
};

const normalizeStandardData = (validated, { requireCalibrationDate = false } = {}) => {
  const data = { ...validated };
  const errors = [];

  const normalizeDate = (field, { clearBlank = false, required = false, noFuture = false } = {}) => {
    if (data[field] === undefined) {
      if (required) errors.push(`${field} is required`);
      return;
    }

    if (data[field] === '' || data[field] === null) {
      if (required) {
        errors.push(`${field} is required`);
      } else {
        data[field] = clearBlank ? null : undefined;
      }
      return;
    }

    const date = parseDateValue(data[field]);
    if (!date) {
      errors.push(`${field} must be a valid date`);
      return;
    }

    if (noFuture && isFutureDate(date)) {
      errors.push(`${field} cannot be in the future`);
      return;
    }

    data[field] = date;
  };

  normalizeDate('calibrationDate', { required: requireCalibrationDate, noFuture: true });
  normalizeDate('certExpiry', { clearBlank: true });

  if (data.calibrationDate instanceof Date && !data.certExpiry) {
    data.certExpiry = calculateDueDate(data.calibrationDate);
  }

  if (data.instrumentId === '' || data.instrumentId === null) data.instrumentId = null;
  if (data.reportNo === '' || data.reportNo === null) data.reportNo = '';
  if (data.make === '') data.make = null;
  if (data.serial === '') data.serial = null;
  if (data.range === '') data.range = null;
  if (data.accuracy === '') data.accuracy = null;

  return { data, errors };
};

export const getAllStandards = async (req, res) => {
  try {
    const { search } = req.query;

    const where = search ? {
      OR: [
        { instrument: { contains: search, mode: 'insensitive' } },
        { certificateNo: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const standards = await prisma.standard.findMany({
      where,
      include: { instrumentRef: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(standards);
  } catch (error) {
    logger.error('Get standards error:', error);
    res.status(500).json({ error: 'Failed to fetch standards' });
  }
};

export const createStandard = async (req, res) => {
  try {
    const { data, errors } = normalizeStandardData(req.validated, { requireCalibrationDate: true });
    if (errors.length) return res.status(400).json({ errors });

    const standard = await prisma.standard.create({
      data,
      include: { instrumentRef: true }
    });

    logger.info(`Standard created: ${standard.id}`);
    res.status(201).json(standard);
  } catch (error) {
    logger.error('Create standard error:', error);
    res.status(500).json({ error: 'Failed to create standard' });
  }
};

export const updateStandard = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, errors } = normalizeStandardData(req.validated);
    if (errors.length) return res.status(400).json({ errors });

    const standard = await prisma.standard.update({
      where: { id: parseInt(id) },
      data,
      include: { instrumentRef: true }
    });

    logger.info(`Standard updated: ${id}`);
    res.json(standard);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Standard not found' });
    }
    logger.error('Update standard error:', error);
    res.status(500).json({ error: 'Failed to update standard' });
  }
};

export const deleteStandard = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.standard.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Standard deleted: ${id}`);
    res.json({ message: 'Standard deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Standard not found' });
    }
    logger.error('Delete standard error:', error);
    res.status(500).json({ error: 'Failed to delete standard' });
  }
};
