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
    return res.status(401).json({ error: 'Invalid or missing authentication token' });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await prisma.tokenBlacklist.findUnique({
      where: { token }
    });
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Session has been invalidated. Please log in again.' });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked' });
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or missing authentication token' });
  }
}
