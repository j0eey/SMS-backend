import express from 'express';
import Notification from '../models/Notification.js';
import { authMiddleware } from '../utils/authMiddleware.js';

const router = express.Router();

/**
 * @desc Get my notifications
 * GET /api/notifications
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const notes = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(notes);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Mark notification as read
 * POST /api/notifications/:id/read
 */
router.post('/:id/read', authMiddleware, async (req, res, next) => {
  try {
    const note = await Notification.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) return res.status(404).json({ error: 'Notification not found' });

    note.read = true;
    await note.save();

    res.json({ message: 'Notification marked as read' });
  } catch (e) {
    next(e);
  }
});

export default router;
