import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const getAllInvoices = async (req, res) => {
  try {
    const { search, from, to } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(from);
      if (to) where.issueDate.lte = new Date(to);
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        reports: {
          include: {
            customer: true,
            instrument: true,
          },
        },
      },
      orderBy: { issueDate: 'desc' }
    });

    res.json(invoices);
  } catch (error) {
    logger.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

export const exportToCSV = async (req, res) => {
  try {
    const { from, to, search } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(from);
      if (to) where.issueDate.lte = new Date(to);
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: true },
      orderBy: { issueDate: 'desc' }
    });

    const csv = convertToCSV(invoices);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    res.send(csv);

    logger.info('Invoices exported to CSV');
  } catch (error) {
    logger.error('Export CSV error:', error);
    res.status(500).json({ error: 'Failed to export invoices' });
  }
};

const convertToCSV = (invoices) => {
  const headers = ['Invoice Number', 'Customer', 'Calibration Date', 'Issue Date', 'Amount', 'Status'];
  const rows = invoices.map(inv => [
    inv.invoiceNumber,
    inv.customer.name,
    inv.calibrationDate,
    inv.issueDate,
    inv.amount || '',
    inv.status
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
};
