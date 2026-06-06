import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import prisma from '../db/connection.js';

export async function authGuard(req, res, next) {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    console.warn('authGuard: Request blocked. No token found in headers or query parameters.');
    return res.status(401).json({ error: 'Invalid or missing authentication token' });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await prisma.tokenBlacklist.findUnique({
      where: { token }
    });
    if (isBlacklisted) {
      console.warn('authGuard: Request blocked. Token is blacklisted.');
      return res.status(401).json({ error: 'Session has been invalidated. Please log in again.' });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      console.warn(`authGuard: Request blocked. User with ID ${decoded.id} not found in database.`);
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (user.is_blocked) {
      console.warn(`authGuard: Request blocked. User ${user.username} is blocked.`);
      return res.status(403).json({ error: 'Your account has been blocked' });
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    console.error('authGuard Exception during token validation:', err.message || err);
    return res.status(401).json({ error: 'Invalid or missing authentication token' });
  }
}
