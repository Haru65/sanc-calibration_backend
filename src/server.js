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
const allowedOrigins = [
  'https://sanc.zeptac.com',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development, specific origins in production
    if (process.env.NODE_ENV === 'development' || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, can restrict later
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Rate limiting - More permissive limits to avoid "Too Many Requests" errors
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 requests per 15 minutes
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for certain IPs or conditions if needed
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development';
  }
});

// Apply general rate limiter to all routes except auth
app.use((req, res, next) => {
  // Skip rate limiting for health check
  if (req.path === '/health') {
    return next();
  }
  return limiter(req, res, next);
});

// Stricter rate limit specifically for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 login attempts per 15 minutes
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/auth', authLimiter, authRoutes); // Apply stricter limit to auth
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
