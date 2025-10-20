import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import { sendMail } from '../utils/mailer.js';
import { authMiddleware, requireAdmin } from '../utils/authMiddleware.js';

const router = express.Router();

/**
 * @desc List all users (with filters + pagination)
 * GET /api/admin/users
 */
router.get('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

    const filter = {};
    if (req.query.banned) filter.banned = req.query.banned === 'true';
    if (req.query.role) filter.role = req.query.role;
    if (req.query.minBalance || req.query.maxBalance) {
      filter.balance = {};
      if (req.query.minBalance) filter.balance.$gte = Number(req.query.minBalance);
      if (req.query.maxBalance) filter.balance.$lte = Number(req.query.maxBalance);
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select('email name role balance banned createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ page, pageSize, total, items });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create a new user or admin
 * POST /api/admin/users
 */
router.post('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or admin' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash: hashed,
      role,
      balance: 0,
      banned: false
    });

    // Send welcome email
    await sendMail(
      email,
      'Welcome to the platform',
      `Hello ${name}, your ${role} account has been created by the admin.`,
      `<p>Hello <b>${name}</b>,</p>
       <p>Your ${role} account has been created successfully by the administrator.</p>`
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search users by name or email
 * GET /api/admin/users/search?=term
 */
router.get('/search', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    // Express will parse /search?=joey into req.query[""]
    const raw = req.url.split('?=')[1]; 
    const q = raw?.trim();

    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Case-insensitive partial match
    const regex = new RegExp(q, "i");

    const users = await User.find({
      $or: [{ name: regex }, { email: regex }]
    })
      .select("email name role balance banned createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      total: users.length,
      items: users,
    });
  } catch (e) {
    next(e);
  }
});


/**
 * @desc Get details of a single user (profile + latest activity)
 * GET /api/admin/users/:id
 */
router.get('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('email name role balance banned createdAt updatedAt');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [transactions, orders, notifications] = await Promise.all([
      Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean()
    ]);

    res.json({ user, transactions, orders, notifications });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Adjust user balance (credit or debit manually)
 * POST /api/admin/users/:id/balance
 */
router.post('/:id/balance', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.balance += Number(amount);
    await user.save();

    await Transaction.create({
      userId: user._id,
      method: 'admin',
      type: 'adjustment',
      amount: Math.abs(amount),
      status: 'completed',
      reference: `admin-adjust:${reason || 'manual'}`
    });

    res.json({ message: 'Balance adjusted', newBalance: user.balance });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Ban or unban a user
 * POST /api/admin/users/:id/ban
 */
router.post('/:id/ban', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { banned } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.banned = !!banned;
    await user.save();

    const action = banned ? 'banned' : 'unbanned';
    const title = `Account ${action}`;
    const message = `Your account has been ${action} by the administrator.`;

    await Notification.create({ userId: user._id, title, message });
    await sendMail(user.email, `Account ${action}`, message, `<p>${message}</p>`);

    res.json({
      message: `User ${action}`,
      user: { id: user.id, email: user.email, banned: user.banned }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Permanently delete a user and their related data
 * DELETE /api/admin/users/:id
 */
router.delete('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete related documents
    await Promise.all([
      Transaction.deleteMany({ userId: user._id }),
      Order.deleteMany({ userId: user._id }),
      Notification.deleteMany({ userId: user._id }),
    ]);

    // Delete user itself
    await User.deleteOne({ _id: user._id });

    res.json({ message: 'User and related data permanently deleted' });
  } catch (e) {
    next(e);
  }
});

export default router;
