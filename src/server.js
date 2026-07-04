import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';
import logger from './config/logger.js';
import swaggerSpec from './config/swagger.js';
import { handleErrors } from './middleware/validation.js';
import { startErpNextAutoSync } from './services/erpnextScheduler.js';

import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import instrumentRoutes from './routes/instruments.js';
import standardRoutes from './routes/standards.js';
import invoiceRoutes from './routes/invoices.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import erpnextRoutes from './routes/erpnext.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for now
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/auth', authRoutes);
app.use('/customers', customerRoutes);
app.use('/instruments', instrumentRoutes);
app.use('/standards', standardRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/reports', reportRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/erpnext', erpnextRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use(handleErrors);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`API Docs available at http://localhost:${PORT}/api-docs`);
  startErpNextAutoSync();
});
