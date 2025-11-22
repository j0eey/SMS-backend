import express from "express";
import { authMiddleware } from "../utils/authMiddleware.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendMail } from "../utils/mailer.js";
import bcrypt from "bcryptjs";

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
      .sort({ createdAt: 1 })
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

/**
 * @desc Change password (authenticated user)
 * @route POST /api/user/change-password
 * @access Private
 */
router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Load user (schema uses `passwordHash`)
    // Also fetch `password` in case some legacy records used that key.
    const user = await User.findById(userId).select("email name passwordHash password");
    if (!user) return res.status(404).json({ error: "User not found." });

    const storedHash = user.passwordHash || user.password; // support both
    if (!storedHash) {
      return res.status(500).json({ error: "Password hash not found on user record." });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect current password." });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    // Optionally clean up any legacy `password` field:
    if (user.password) user.password = undefined;

    await user.save();

    // Fire-and-forget email (don’t fail request if email fails)
    try {
      await sendMail(
        user.email,
        "Your Password Was Changed",
        `Hi ${user.name || "there"}, your password has been successfully updated.`,
        `
          <p>Hi ${user.name || "there"},</p>
          <p>This is a confirmation that your password was successfully changed.</p>
          <p>If you didn't make this change, please reset your password immediately or contact support.</p>
          <br/>
          <p>Best regards,<br/>The SMSLB Team</p>
        `
      );
    } catch (mailErr) {
      console.error("⚠️ Failed to send password change email:", mailErr?.message || mailErr);
    }

    return res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("❌ [USER] Change password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


export default router;