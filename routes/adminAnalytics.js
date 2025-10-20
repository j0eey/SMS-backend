import express from 'express';
import { authMiddleware, requireAdmin } from '../utils/authMiddleware.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';

const router = express.Router();

// Helper: parse timeframe from query
function buildDateFilter(from, to, range) {
  let start, end;

  if (range) {
    const now = new Date();
    switch (range) {
      case '7d':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        end = now;
        break;
      case '30d':
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        end = now;
        break;
      case 'this-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      default:
        break;
    }
  }

  if (from) start = new Date(from);
  if (to) end = new Date(to);

  if (!start && !end) return {};

  const filter = {};
  if (start) filter.$gte = start;
  if (end) filter.$lte = end;
  return { createdAt: filter };
}

/**
 * @desc General platform stats
 * GET /api/admin/analytics/overview?range=7d
 * or /api/admin/analytics/overview?from=2025-10-01&to=2025-10-31
 */
router.get('/overview', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { from, to, range } = req.query;
    const dateFilter = buildDateFilter(from, to, range);

    const [totalUsers, activeUsers, bannedUsers, deletedUsers, totalOrders, totalDeposits] = await Promise.all([
      User.countDocuments({ deleted: { $ne: true }, ...dateFilter }),
      User.countDocuments({ banned: false, deleted: { $ne: true }, ...dateFilter }),
      User.countDocuments({ banned: true, deleted: { $ne: true }, ...dateFilter }),
      User.countDocuments({ deleted: true, ...dateFilter }),
      Order.countDocuments({ ...dateFilter }),
      Transaction.countDocuments({ type: 'deposit', status: 'completed', ...dateFilter })
    ]);

    const totalBalanceAgg = await User.aggregate([
      { $match: { deleted: { $ne: true }, ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
      { $group: { _id: null, balance: { $sum: "$balance" } } }
    ]);

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        banned: bannedUsers,
        deleted: deletedUsers
      },
      orders: { total: totalOrders },
      deposits: { total: totalDeposits },
      wallets: { totalBalance: totalBalanceAgg[0]?.balance || 0 }
    });
  } catch (e) {
    next(e);
  }
});

// Revenue
router.get('/revenue', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { from, to, range } = req.query;
    const dateFilter = buildDateFilter(from, to, range);

    const deposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'completed', ...dateFilter } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]);

    const adjustments = await Transaction.aggregate([
      { $match: { type: 'adjustment', status: 'completed', ...dateFilter } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]);

    res.json({
      deposits: deposits[0] || { total: 0, count: 0 },
      adjustments: adjustments[0] || { total: 0, count: 0 }
    });
  } catch (e) {
    next(e);
  }
});

// Orders
router.get('/orders', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { from, to, range } = req.query;
    const dateFilter = buildDateFilter(from, to, range);

    const stats = await Order.aggregate([
      { $match: { ...dateFilter } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    res.json({ ordersByStatus: stats });
  } catch (e) {
    next(e);
  }
});

// Users Growth
router.get('/users-growth', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { from, to, range } = req.query;
    const dateFilter = buildDateFilter(from, to, range);

    const stats = await User.aggregate([
      { $match: { deleted: { $ne: true }, ...dateFilter } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.json({ monthlySignups: stats });
  } catch (e) {
    next(e);
  }
});

export default router;
