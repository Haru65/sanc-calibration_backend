import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const SETTINGS_ID = 1;
const DEFAULT_SETTINGS = {
  email: 'navreet@sanc.in',
  contactNumber: '+91 99673 28933',
  calibratedByName: 'Priyanshu Surti',
  calibratedBySignature: null,
  approvedByName: 'Nitesh Yadav',
  approvedBySignature: null,
};

const getOrCreateSettings = () =>
  prisma.certificateSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
  });

export const getCertificateSettings = async (req, res) => {
  try {
    res.json(await getOrCreateSettings());
  } catch (error) {
    logger.error('Get certificate settings error:', error);
    res.status(500).json({ error: 'Failed to fetch certificate settings' });
  }
};

export const updateCertificateSettings = async (req, res) => {
  try {
    const data = { ...req.validated };
    if (data.calibratedBySignature === '') data.calibratedBySignature = null;
    if (data.approvedBySignature === '') data.approvedBySignature = null;

    const settings = await prisma.certificateSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...data },
    });

    logger.info(`Certificate settings updated by user ${req.user?.userId || 'unknown'}`);
    res.json(settings);
  } catch (error) {
    logger.error('Update certificate settings error:', error);
    res.status(500).json({ error: 'Failed to update certificate settings' });
  }
};
