import express from "express";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";
import Transaction from "../models/Transaction.js";
import Order from "../models/Order.js";

const router = express.Router();

// Helper: parse range (7d, 30d, all)
function getDateRange(range) {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

/**
 * GET /api/admin/analytics/deposits?range=30d
 * Returns: [{ date, amount }]
 */
router.get("/deposits", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { range = "30d" } = req.query;
    const start = getDateRange(range);

    const match = { type: "deposit", status: "completed" };
    if (start) match.createdAt = { $gte: start };

    const result = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formatted = result.map((r) => ({ date: r._id, amount: r.amount }));
    res.json(formatted);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/analytics/orders?range=30d
 * Returns: [{ status, count }]
 */
router.get("/orders", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { range = "30d" } = req.query;
    const start = getDateRange(range);

    const match = {};
    if (start) match.createdAt = { $gte: start };

    const result = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const formatted = result.map((r) => ({ status: r._id, count: r.count }));
    res.json(formatted);
  } catch (e) {
    next(e);
  }
});

export default router;
