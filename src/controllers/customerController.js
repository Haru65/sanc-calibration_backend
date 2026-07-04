import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const getAllCustomers = async (req, res) => {
  try {
    const { search, ignored, incomplete } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (ignored !== undefined) {
      where.ignored = ignored === 'true';
    }

    if (incomplete === 'true') {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { email: null },
            { email: '' },
            { phone: '' },
            { address: null },
            { address: '' }
          ]
        }
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    });

    res.json(customers);
  } catch (error) {
    logger.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const customer = await prisma.customer.create({
      data: req.validated
    });

    logger.info(`Customer created: ${customer.id}`);
    res.status(201).json(customer);
  } catch (error) {
    logger.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.update({
      where: { id: parseInt(id) },
      data: req.validated
    });

    logger.info(`Customer updated: ${id}`);
    res.json(customer);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    logger.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.customer.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Customer deleted: ${id}`);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    logger.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};
