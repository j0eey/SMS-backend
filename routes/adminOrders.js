import express from 'express';
import { authMiddleware, requireAdmin } from '../utils/authMiddleware.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendMail } from '../utils/mailer.js';
import { secsers } from '../utils/secsersApi.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

/**
 * @desc List all orders (filter by status, user, service, provider)
 * GET /api/admin/orders?status=In%20progress&userId=123&service=1&provider=manual
 */
router.get('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { status, userId, service, page = 1, provider, search } = req.query;
    const pageSize = 10;

    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (service) filter.service = service;
    if (provider) filter.provider = provider;

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      Order.find(filter)
        .populate({
          path: 'userId',
          model: 'User',               // make sure it knows which model
          select: 'email name balance'
        })
        .populate({
          path: 'service',
          model: 'Service',
          select: 'name serviceType price userPrice'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .exec(),
      Order.countDocuments(filter),
    ]);

    // Apply search after populate
    let filteredItems = items;
    if (search) {
      const s = String(search).toLowerCase();
      filteredItems = items.filter(item =>
        (item.orderNumber && String(item.orderNumber).includes(s)) ||
        (item.userId?.email && item.userId.email.toLowerCase().includes(s)) ||
        (item.userId?.name && item.userId.name.toLowerCase().includes(s)) ||
        (item.service?.name && item.service.name.toLowerCase().includes(s))
      );
    }

    const formattedItems = filteredItems.map(item => {
      if (item.charge) item.charge = Number(item.charge).toFixed(2);
      return item;
    });
    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total: total,
      totalPages: Math.ceil(total / pageSize),
      items: formattedItems
    });
  } catch (e) {
    console.error('❌ [ADMIN ORDERS] Error listing orders:', e.message);
    next(e);
  }
});

/**
 * @desc Refresh order status (Secsers only)
 * POST /api/admin/orders/:id/refresh
 */
router.post('/:id/refresh', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.provider !== 'secsers') {
      return res.status(400).json({ error: 'Only Secsers provider orders can be refreshed' });
    }

    if (!order.providerOrder) return res.status(400).json({ error: 'No provider order ID' });

    const st = await secsers.status(order.providerOrder);

    order.status = st?.status || order.status;
    if (st?.charge) order.charge = st.charge;
    if (st?.start_count) order.start_count = Number(st.start_count);
    if (st?.remains) order.remains = Number(st.remains);
    if (st?.currency) order.currency = st.currency;
    await order.save();

    res.json(order);
  } catch (e) {
    console.error('❌ [ADMIN ORDERS] Error refreshing order:', e.message);
    next(e);
  }
});

/**
 * @desc Confirm a manual order
 * POST /api/admin/orders/:id/confirm
 */
router.post('/:id/confirm', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'email name balance');

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.provider !== 'manual')
      return res.status(400).json({ error: 'Only manual orders can be confirmed' });
    if (order.status !== 'Pending Admin Approval')
      return res.status(400).json({ error: 'Order is not awaiting admin confirmation' });

    order.status = 'Completed';
    order.adminNotes = req.body.notes || 'Confirmed by admin';
    await order.save();

    // Deduct balance now and complete transaction
    const txn = await Transaction.findOne({ reference: `manual-order:${order._id}` });
    if (txn) {
      const user = await User.findById(order.userId._id);
      if (user && user.balance >= order.charge) {
        user.balance -= Number(order.charge || 0);
        await user.save();
      }
      txn.status = 'completed';
      await txn.save();
    }

    // Notify user
    await Notification.create({
      userId: order.userId._id,
      title: 'Order Confirmed',
      message: `Your manual order #${order.orderNumber} has been confirmed.`
    });

    try {
      await sendMail(
        order.userId.email,
        'Order Confirmed',
        `Your manual order #${order.orderNumber} has been confirmed.`,
        `<p>Your manual order <b>#${order.orderNumber}</b> has been confirmed.</p>`
      );
    } catch (mailErr) {
      console.error('⚠️ Failed to send confirmation email:', mailErr.message);
    }

    res.json({ message: 'Manual order confirmed', order });
  } catch (e) {
    console.error('❌ [ADMIN ORDERS] Error confirming order:', e.message);
    next(e);
  }
});

/**
 * @desc Reject a manual order (refund user balance)
 * POST /api/admin/orders/:id/reject
 */
router.post('/:id/reject', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'email name balance');

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.provider !== 'manual')
      return res.status(400).json({ error: 'Only manual orders can be rejected' });
    if (order.status !== 'Pending Admin Approval')
      return res.status(400).json({ error: 'Order is not awaiting admin confirmation' });

    // Mark transaction as failed
    await Transaction.findOneAndUpdate(
      { reference: `manual-order:${order._id}` },
      { status: 'failed' }
    );

    order.status = 'Rejected';
    order.adminNotes = req.body.reason || 'Rejected by admin';
    await order.save();

    // Notify user
    await Notification.create({
      userId: order.userId._id,
      title: 'Order Rejected',
      message: `Your manual order #${order.orderNumber} has been rejected. Reason: ${order.adminNotes}`
    });

    try {
      await sendMail(
        order.userId.email,
        'Order Rejected',
        `Your manual order #${order.orderNumber} was rejected. Reason: ${order.adminNotes}`,
        `<p>Your manual order <b>#${order.orderNumber}</b> was rejected.<br/>Reason: <b>${order.adminNotes}</b></p>`
      );
    } catch (mailErr) {
      console.error('⚠️ Failed to send rejection email:', mailErr.message);
    }

    res.json({ message: 'Manual order rejected and refunded', order });
  } catch (e) {
    console.error('❌ [ADMIN ORDERS] Error rejecting order:', e.message);
    next(e);
  }
});

export default router;