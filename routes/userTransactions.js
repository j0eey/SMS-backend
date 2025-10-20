import dotenv from "dotenv";
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "";

import express from "express";
import Transaction from "../models/Transaction.js";
import { authMiddleware } from "../utils/authMiddleware.js";

const router = express.Router();

/**
 * @desc Get logged-in user's payment history (deposits & balance actions)
 * @route GET /api/user/transactions
 * @access Private
 */
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id; // comes from access token

    const transactions = await Transaction.find({ userId, type: "deposit" })
      .sort({ createdAt: -1 }) // Newest first
      .select("-__v") // remove unnecessary fields
      .lean();

    res.json(
      transactions.map(t => ({
        ...t,
        proof: t.proof ? `${BACKEND_URL}${t.proof}` : null
      }))
    );
  } catch (error) {
    console.error("Error fetching user transactions:", error);
    next(error);
  }
});

/**
 * @desc Get a single transaction by ID (only if it belongs to logged-in user)
 * @route GET /api/user/transactions/:id
 * @access Private
 */
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const transaction = await Transaction.findOne({ _id: req.params.id, userId }).select("-__v");
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    res.json({
      ...transaction.toObject(),
      proof: transaction.proof ? `${BACKEND_URL}${transaction.proof}` : null
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    next(error);
  }
});

export default router;