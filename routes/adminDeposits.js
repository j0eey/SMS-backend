import express from 'express';
import { authMiddleware, requireAdmin } from '../utils/authMiddleware.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendMail } from '../utils/mailer.js';
import dotenv from "dotenv";
dotenv.config();
const BACKEND_URL = process.env.BACKEND_URL || "";

const router = express.Router();  

/**
 * @desc List all deposits (with pagination + optional status filter)
 * GET /api/admin/deposits?status=pending&page=1&pageSize=20
 */
router.get("/", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    const filter = { type: "deposit" };
    if (status) filter.status = status;

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .populate("userId", "email name balance")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const normalized = items.map((d) => ({
      ...d,
      proof: d.proof ? `${BACKEND_URL}${d.proof}` : null,
      depositLabel: d.orderNumber ? `Deposit #${d.orderNumber}` : "Pending Assignment",
    }));

    res.json({ page: Number(page), pageSize: Number(pageSize), total, items: normalized });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search deposits by reference, depositNumber, or user (email/name)
 * GET /api/admin/deposits/search?query=xxx&page=1&pageSize=20
 */
router.get("/search", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { query, page = 1, pageSize = 20 } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const regex = new RegExp(query, "i");
    const maybeNumber = !isNaN(query) ? Number(query) : null;

    const skip = (page - 1) * pageSize;

    // Step 1: find matching users
    const matchedUsers = await User.find({
      $or: [{ email: regex }, { name: regex }],
    }).select("_id");

    const userIds = matchedUsers.map((u) => u._id);

    // Step 2: build filter
    const filter = {
      type: "deposit",
      $or: [
        { reference: regex },
        ...(maybeNumber !== null ? [{ orderNumber: maybeNumber }] : []),
        ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
      ],
    };

    // Step 3: query
    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .populate("userId", "email name balance")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const normalized = items.map((d) => ({
      ...d,
      proof: d.proof ? `${BACKEND_URL}${d.proof}` : null,
      depositLabel: d.orderNumber ? `Deposit #${d.orderNumber}` : "Pending Assignment",
    }));

    res.json({ page: Number(page), pageSize: Number(pageSize), total, items: normalized });
  } catch (e) {
    next(e);
  }
});


/**
 * @desc Confirm deposit (approve + add balance)
 * POST /api/admin/deposits/:id/confirm
 */
router.post('/:id/confirm', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id).populate('userId');
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.type !== 'deposit') return res.status(400).json({ error: 'Not a deposit transaction' });
    if (tx.status === 'completed') return res.status(400).json({ error: 'Already confirmed' });
    if (tx.status === 'failed') return res.status(400).json({ error: 'Already rejected' });

    // Update transaction + user balance
    tx.status = 'completed';
    await tx.save();

    const user = tx.userId;
    user.balance += tx.amount;
    await user.save();

    // Notify user
    await Notification.create({
      userId: user._id,
      title: 'Deposit Confirmed',
      message: `Your deposit of $${tx.amount} has been confirmed. New balance: $${user.balance}.`
    });

    try {
      await sendMail(
        user.email,
        'Deposit Confirmed',
        `Your deposit of $${tx.amount} has been confirmed.`,
        `<p>Your deposit of <b>$${tx.amount}</b> has been confirmed.<br/>New Balance: <b>$${user.balance}</b></p>`
      );
    } catch (mailErr) {
      console.error(`⚠️ Failed to send confirmation email: ${mailErr.message}`);
    }

    res.json({
      message: 'Deposit confirmed',
      depositNumber: tx.orderNumber,
      user: { id: user.id, email: user.email, balance: user.balance }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Reject deposit (mark as failed, no balance change)
 * POST /api/admin/deposits/:id/reject
 */
router.post('/:id/reject', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const tx = await Transaction.findById(req.params.id).populate('userId', 'email name balance');
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.type !== 'deposit') return res.status(400).json({ error: 'Not a deposit transaction' });
    if (tx.status === 'completed') return res.status(400).json({ error: 'Already confirmed' });
    if (tx.status === 'failed') return res.status(400).json({ error: 'Already rejected' });

    // Update transaction with rejection
    tx.status = 'failed';
    tx.rejectReason = reason || 'No reason provided';
    await tx.save();

    // Notify user
    await Notification.create({
      userId: tx.userId._id,
      title: 'Deposit Rejected',
      message: `Your deposit of $${tx.amount} was rejected. Reason: ${tx.rejectReason}`
    });

    try {
      await sendMail(
        tx.userId.email,
        'Deposit Rejected',
        `Your deposit of $${tx.amount} was rejected. Reason: ${tx.rejectReason}`,
        `<p>Your deposit of <b>$${tx.amount}</b> was rejected.<br/>Reason: <b>${tx.rejectReason}</b></p>`
      );
    } catch (mailErr) {
      console.error(`⚠️ Failed to send rejection email: ${mailErr.message}`);
    }

    res.json({
      message: 'Deposit rejected',
      depositNumber: tx.orderNumber,
      reason: tx.rejectReason,
      user: tx.userId
    });
  } catch (e) {
    next(e);
  }
});

export default router;
