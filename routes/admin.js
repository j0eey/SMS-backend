import express from 'express';
import { authMiddleware, requireAdmin } from '../utils/authMiddleware.js';
import User from '../models/User.js';
import { secsers } from '../utils/secsersApi.js';

const router = express.Router();

// Apply auth + admin check for all routes here
router.use(authMiddleware, requireAdmin);

// 📌 Provider balance
router.get('/balance', async (_req, res, next) => {
  try {
    const balance = await secsers.balance();
    res.json(balance);
  } catch (e) {
    next(e);
  }
});

// 📌 Users list (basic pagination)
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments()
    ]);

    res.json({ page, pageSize, total, items });
  } catch (e) {
    next(e);
  }
});

export default router;
