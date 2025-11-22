import express from 'express';
import multer from 'multer';
import path from 'path';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authMiddleware } from '../utils/authMiddleware.js';
import { depositSchema } from '../validators/paymentValidator.js';
import { validate } from '../utils/validate.js';
import { sendTelegramAlert } from '../utils/telegramNotifier.js'; // ✅ NEW IMPORT

const router = express.Router();

// 📂 Configure multer for proof uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/proofs');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

/**
 * @desc User creates deposit request (with optional proof upload)
 * POST /api/payments/deposit
 */
router.post(
  '/deposit',
  authMiddleware,
  upload.single('proof'),
  validate(depositSchema),
  async (req, res, next) => {
    try {
      const { method, amount, reference, currency } = req.body;
      const proofPath = req.file ? `/uploads/proofs/${req.file.filename}` : null;

      // ✅ Find latest orderNumber for deposits
      const lastTx = await Transaction.findOne({ type: 'deposit' })
        .sort({ orderNumber: -1 })
        .select('orderNumber');

      const nextOrderNumber = lastTx?.orderNumber ? lastTx.orderNumber + 1 : 1;

      // ✅ Create transaction with orderNumber
      const tx = await Transaction.create({
        userId: req.user.id,
        method,
        type: 'deposit',
        amount: Number(amount),
        reference,
        currency: method === "whishmoney" ? currency : null,
        status: 'pending',
        proof: proofPath,
        orderNumber: nextOrderNumber
      });

      // ✅ Fetch user info for the alert
      const user = await User.findById(req.user.id).select('email name');

      // ✅ Send Telegram alert to admin
      await sendTelegramAlert(`
💰 *New Deposit Request*
👤 *User:* ${user?.name || "Unknown"}
📧 *Email:* ${user?.email || "N/A"}
💵 *Amount:* $${Number(amount).toFixed(2)}
🏦 *Method:* ${method}
📄 *Reference:* ${reference || "None"}
🕒 *Time:* ${new Date().toLocaleString()}
${proofPath ? `📎 *Proof:* ${process.env.BACKEND_URL || ""}${proofPath}` : ""}
      `);

      res.json({
        transactionId: tx.id,
        orderLabel: `Order #${tx.orderNumber}`,
        status: tx.status,
        amount: tx.amount,
        method: tx.method,
        reference: tx.reference,
        currency: tx.currency,
        proof: proofPath,
        createdAt: tx.createdAt,
        message:
          'Deposit request created. Please send the funds and wait for admin confirmation.'
      });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * @desc User views their balance + transactions
 * GET /api/payments/history
 */
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('balance');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const txs = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: 1 })
      .lean();

    // ✅ Normalize transactions with orderLabel
    const normalized = txs.map((t) => ({
      ...t,
      orderLabel: t.orderNumber ? `Order #${t.orderNumber}` : 'Pending Assignment'
    }));

    res.json({
      balance: user.balance,
      transactions: normalized
    });
  } catch (e) {
    next(e);
  }
});

export default router;