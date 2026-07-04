import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader?.split(' ')[1]
    
    if (!token) {
      logger.warn('No token provided in Authorization header')
      return res.status(401).json({ error: 'No token provided' })
    }

    const secret = process.env.JWT_SECRET || 'sanc-calibration-2026-dev-key-12345';
    const decoded = jwt.verify(token, secret)
    req.user = decoded
    next()
  } catch (error) {
    logger.error('Authentication failed:', error.message)
    res.status(401).json({ error: 'Invalid token' })
  }
}

export const generateToken = (userId, username) => {
  const secret = process.env.JWT_SECRET || 'sanc-calibration-2026-dev-key-12345';
  return jwt.sign(
    { userId, username },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};
