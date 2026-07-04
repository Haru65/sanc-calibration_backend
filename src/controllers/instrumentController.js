import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const getAllInstruments = async (req, res) => {
  try {
    const { search, ignored } = req.query;

    const where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { serial: { contains: search, mode: 'insensitive' } },
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { series: { contains: search, mode: 'insensitive' } },
        { instrumentId: { contains: search, mode: 'insensitive' } },
        { rangeStart: { contains: search, mode: 'insensitive' } },
        { rangeEnd: { contains: search, mode: 'insensitive' } },
        { rangeUnit: { contains: search, mode: 'insensitive' } },
        { accuracy: { contains: search, mode: 'insensitive' } },
        { accuracyType: { contains: search, mode: 'insensitive' } },
        { resolution: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
        { calibrationPoints: { contains: search, mode: 'insensitive' } },
        { readingAccuracy: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (ignored !== undefined) {
      where.ignored = ignored === 'true';
    }

    const instruments = await prisma.instrument.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(instruments);
  } catch (error) {
    logger.error('Get instruments error:', error);
    res.status(500).json({ error: 'Failed to fetch instruments' });
  }
};

export const createInstrument = async (req, res) => {
  try {
    // Convert empty strings to null for optional fields
    const data = { ...req.validated }
    if (data.dueDate === '' || data.dueDate === null) data.dueDate = undefined
    if (data.series === '') data.series = null
    if (data.rangeStart === '') data.rangeStart = null
    if (data.rangeEnd === '') data.rangeEnd = null
    if (data.rangeUnit === '') data.rangeUnit = null
    if (data.accuracy === '') data.accuracy = null
    if (data.accuracyType === '') data.accuracyType = null
    if (data.resolution === '') data.resolution = null
    if (data.type === '') data.type = null
    if (data.instrumentId === '') data.instrumentId = null
    if (data.calibrationPoints === '') data.calibrationPoints = null
    if (data.readingAccuracy === '') data.readingAccuracy = null
    if (data.description === '') data.description = null
    if (data.calibrationPeriod === '') data.calibrationPeriod = null

    const instrument = await prisma.instrument.create({
      data,
      include: { customer: true }
    });

    logger.info(`Instrument created: ${instrument.id}`);
    res.status(201).json(instrument);
  } catch (error) {
    logger.error('Create instrument error:', error);
    res.status(500).json({ error: 'Failed to create instrument' });
  }
};

export const updateInstrument = async (req, res) => {
  try {
    const { id } = req.params;

    // Convert empty strings to null for optional fields
    const data = { ...req.validated }
    if (data.dueDate === '' || data.dueDate === null) data.dueDate = undefined
    if (data.series === '') data.series = null
    if (data.rangeStart === '') data.rangeStart = null
    if (data.rangeEnd === '') data.rangeEnd = null
    if (data.rangeUnit === '') data.rangeUnit = null
    if (data.accuracy === '') data.accuracy = null
    if (data.accuracyType === '') data.accuracyType = null
    if (data.resolution === '') data.resolution = null
    if (data.type === '') data.type = null
    if (data.instrumentId === '') data.instrumentId = null
    if (data.calibrationPoints === '') data.calibrationPoints = null
    if (data.readingAccuracy === '') data.readingAccuracy = null
    if (data.description === '') data.description = null
    if (data.calibrationPeriod === '') data.calibrationPeriod = null

    const instrument = await prisma.instrument.update({
      where: { id: parseInt(id) },
      data,
      include: { customer: true }
    });

    logger.info(`Instrument updated: ${id}`);
    res.json(instrument);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Instrument not found' });
    }
    logger.error('Update instrument error:', error);
    res.status(500).json({ error: 'Failed to update instrument' });
  }
};

export const deleteInstrument = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.instrument.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Instrument deleted: ${id}`);
    res.json({ message: 'Instrument deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Instrument not found' });
    }
    logger.error('Delete instrument error:', error);
    res.status(500).json({ error: 'Failed to delete instrument' });
  }
};
