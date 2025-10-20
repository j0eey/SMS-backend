import express from "express";
import { authMiddleware } from "../utils/authMiddleware.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import { sendMail } from "../utils/mailer.js";
import { secsers } from "../utils/secsersApi.js";
import { createOrderSchema } from "../validators/orderValidator.js";
import { validate } from "../utils/validate.js";
import Counter from "../models/Counter.js";
import Service from "../models/Service.js";

const router = express.Router();

/**
 * @desc List my orders (paginated)
 * GET /api/orders
 */
router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = 10;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      Order.find({ userId: req.user.id })
        .populate("userId", "_id email name balance")
        .populate("service", "name serviceType userPrice price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      Order.countDocuments({ userId: req.user.id }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create order (LOCAL / MANUAL ONLY)
 * POST /api/orders
 */
router.post("/", authMiddleware, validate(createOrderSchema), async (req, res, next) => {
  try {
    const { service, quantity, runs, interval /* provider is validated to 'manual' */ } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Load the service from DB to get the authoritative price for user
    let svc;
    if (/^[0-9a-fA-F]{24}$/.test(service)) {
      svc = await Service.findById(service);
    } else {
      svc = await Service.findOne({ slug: service });
    }
    if (!svc) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    // Calculate total from DB price (userPrice) * quantity
    const qty = Number(quantity) || 1;
    const unitPrice = Number(svc.userPrice || svc.price || 0); // fallback if userPrice doesn't exist
    const totalCost = unitPrice * qty;

    // Generate next global order number
    const counter = await Counter.findOneAndUpdate(
      { name: "orders" },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );
    const nextOrderNumber = counter.value;

    // Create LOCAL order (no link; admin will handle manually)
    const local = await Order.create({
      userId: req.user.id,
      service: svc._id,
      quantity: qty,
      runs,
      interval,
      provider: "manual",
      charge: totalCost,
      currency: "USD",
      status: "Pending Admin Approval",
      orderNumber: nextOrderNumber,
    });

    // Record a pending transaction; balance NOT deducted yet
    await Transaction.create({
      userId: req.user.id,
      method: "wallet",
      type: "order",
      amount: totalCost,
      status: "pending",
      reference: `manual-order:${local.id}`,
      orderNumber: nextOrderNumber,
    });

    return res.json({
      message: "Manual order created. Waiting for admin approval.",
      id: local.id,
      orderNumber: local.orderNumber,
      cost: Number(totalCost).toFixed(2),
      status: local.status,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get single order by ID (user)
 * GET /api/orders/:id
 */
router.get("/:id", authMiddleware, async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id })
      .populate("service", "name serviceType userPrice price")
      .populate("userId", "_id email name balance");
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Refresh status for a local order (Secsers only)
 * GET /api/orders/:id/status
 */
router.get("/:id/status", authMiddleware, async (req, res, next) => {
  try {
    const local = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!local) return res.status(404).json({ error: "Order not found" });

    if (local.provider !== "secsers") {
      return res.status(400).json({ error: "Only secsers orders can be refreshed automatically" });
    }
    if (!local.providerOrder) return res.status(400).json({ error: "Order not placed yet" });

    const st = await secsers.status(local.providerOrder);
    const oldStatus = local.status;

    local.status = st?.status || local.status;
    if (st?.charge) local.charge = Number(st.charge);
    if (st?.start_count) local.start_count = Number(st.start_count);
    if (st?.remains) local.remains = Number(st.remains);
    if (st?.currency) local.currency = st.currency;
    await local.save();

    if (st?.status && st.status !== oldStatus) {
      const message = `Your order #${local.orderNumber} has changed from ${oldStatus} to ${local.status}.`;

      await Notification.create({
        userId: req.user.id,
        title: "Order Status Updated",
        message,
      });

      const user = await User.findById(req.user.id).select("email");
      if (user?.email) {
        await sendMail(user.email, "Order Status Updated", message, `<p>${message}</p>`);
      }
    }

    res.json(local);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Request refill (Secsers only)
 * POST /api/orders/:id/refill
 */
router.post("/:id/refill", authMiddleware, async (req, res, next) => {
  try {
    const local = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!local?.providerOrder) return res.status(404).json({ error: "Order not found" });

    const rf = await secsers.refill(local.providerOrder);
    res.json(rf);
  } catch (e) {
    next(e);
  }
});

export default router;
