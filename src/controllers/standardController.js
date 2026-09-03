import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const normalizeStandardData = (validated, { requireCalibrationDate = false } = {}) => {
  const data = { ...validated };
  const errors = [];

  const normalizeDate = (field, { clearBlank = false, required = false } = {}) => {
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

    const date = data[field] instanceof Date ? data[field] : new Date(data[field]);
    if (Number.isNaN(date.getTime())) {
      errors.push(`${field} must be a valid date`);
      return;
    }

    data[field] = date;
  };

  normalizeDate('calibrationDate', { required: requireCalibrationDate });
  normalizeDate('certExpiry', { clearBlank: true });

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
