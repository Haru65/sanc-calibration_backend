import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const getKPIs = async (req, res) => {
  try {
    const pendingInstruments = await prisma.instrument.count({
      where: { ignored: false, dueDate: { lte: new Date() } }
    });

    const standardsDue = await prisma.standard.count({
      where: { certExpiry: { lte: new Date() } }
    });

    const pendingCustomers = await prisma.customer.count({
      where: {
        ignored: false,
        OR: [
          { email: null },
          { email: '' },
          { phone: '' },
          { address: null },
          { address: '' }
        ]
      }
    });

    res.json({
      pending_instruments: pendingInstruments,
      standards_due: standardsDue,
      pending_customers: pendingCustomers
    });
  } catch (error) {
    logger.error('Get KPIs error:', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
};

export const getQuickTasks = async (req, res) => {
  try {
    const tasks = [];

    const pendingInstruments = await prisma.instrument.findMany({
      where: { ignored: false, dueDate: { lte: new Date() } },
      take: 5
    });

    tasks.push(...pendingInstruments.map(inst => ({
      id: `inst-${inst.id}`,
      title: `Calibrate ${inst.name}`,
      type: 'instrument',
      priority: 'high'
    })));

    const pendingReports = await prisma.report.findMany({
      where: { status: 'draft' },
      take: 5
    });

    tasks.push(...pendingReports.map(rep => ({
      id: `report-${rep.id}`,
      title: `Complete ${rep.certificateNo}`,
      type: 'report',
      priority: 'medium'
    })));

    res.json(tasks);
  } catch (error) {
    logger.error('Get quick tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

export const getRecentActivities = async (req, res) => {
  try {
    const activities = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json(activities);
  } catch (error) {
    logger.error('Get activities error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
};
