import jwt from 'jsonwebtoken';
import pkg from '@prisma/client';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const SESSION_COOKIE_NAME = 'sanc_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
  maxAge: SESSION_MAX_AGE_MS,
  path: '/',
});

const getCookie = (cookieHeader, name) => {
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) return null;

  const value = cookie.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const setSessionCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
};

export const clearSessionCookie = (res) => {
  const { maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
};

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    const cookieToken = getCookie(req.headers.cookie, SESSION_COOKIE_NAME)
    const token = cookieToken || bearerToken
    
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

export const requireRole = (...roles) => {
  const allowedRoles = new Set(roles.map((role) => String(role).trim().toLowerCase()));

  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user?.userId },
        select: { role: true },
      });

      const role = String(user?.role || '').trim().toLowerCase();
      if (!allowedRoles.has(role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
      }

      req.user.role = user.role;
      next();
    } catch (error) {
      logger.error('Role authorization failed:', error);
      res.status(500).json({ error: 'Failed to verify access permissions' });
    }
  };
};

export const requireAdmin = requireRole('admin', 'superadmin');
export const requireSuperAdmin = requireRole('superadmin');

export const generateToken = (userId, username, role) => {
  const secret = process.env.JWT_SECRET || 'sanc-calibration-2026-dev-key-12345';
  return jwt.sign(
    { userId, username, role },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};
