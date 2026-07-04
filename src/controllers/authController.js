import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';
import { generateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const login = async (req, res) => {
  try {
    const { username, password } = req.validated;

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      logger.warn(`Login failed for user: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      logger.warn(`Invalid password for user: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.username);
    
    logger.info(`User logged in: ${username}`);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName
      },
      token,
      isAuthenticated: true
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const logout = (req, res) => {
  logger.info(`User logged out: ${req.user.username}`);
  res.json({ message: 'Logged out successfully' });
};

export const validateSession = (req, res) => {
  res.json({ isValid: true, user: req.user });
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.validated;
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    logger.info(`Password changed for user: ${user.username}`);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};
