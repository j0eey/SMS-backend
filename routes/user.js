import express from "express";
import { authMiddleware } from "../utils/authMiddleware.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const router = express.Router();

/**
 * @desc Get user profile (from JWT token)
 * GET /api/user/profile
 */
router.get("/profile", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email balance role banned createdAt"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      balance: user.balance || 0,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get latest user notifications (default limit 10)
 * GET /api/user/notifications
 */
router.get("/notifications", authMiddleware, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 10;

    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formatted = notifications.map((n) => ({
      id: n._id,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt,
    }));

    res.json(formatted);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get account activity info (for security section)
 * GET /api/user/security
 */
router.get("/security", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("banned createdAt updatedAt");

    res.json({
      banned: user.banned,
      createdAt: user.createdAt,
      lastUpdated: user.updatedAt,
      message: user.banned
        ? "Your account is currently restricted."
        : "Your account is active and secure.",
    });
  } catch (e) {
    next(e);
  }
});

export default router;