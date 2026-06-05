import { Router } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../db/connection.js';
import { config } from '../config.js';
import { authGuard } from '../middleware/authGuard.js';
import { adminGuard } from '../middleware/adminGuard.js';

const router = Router();

router.post('/create-user', authGuard, adminGuard, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const validRoles = ['ADMIN', 'USER'];
    const assignedRole = validRoles.includes(role) ? role : 'USER';

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { username, password: hash, role: assignedRole },
    });

    return res.status(201).json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', authGuard, adminGuard, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        select: { id: true, username: true, role: true, is_blocked: true, created_at: true },
        orderBy: { created_at: 'desc' }
      }),
      prisma.user.count()
    ]);

    res.json({ data: users, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/block', authGuard, adminGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_blocked } = req.body;
    
    if (typeof is_blocked !== 'boolean') {
      return res.status(400).json({ error: 'is_blocked must be a boolean' });
    }

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { is_blocked },
      select: { id: true, username: true, is_blocked: true }
    });

    res.json(updatedUser);
  } catch (err) {
    console.error('Block user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:id', authGuard, adminGuard, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await prisma.user.delete({
      where: { id }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
