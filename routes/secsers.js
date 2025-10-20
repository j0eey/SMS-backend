import express from 'express';
import { authMiddleware } from '../utils/authMiddleware.js';
import { secsers } from '../utils/secsersApi.js';

const router = express.Router();

/**
 * @desc Get services with search + pagination
 * GET /secsers/services?query=xxx&page=1&pageSize=50
 */
router.get('/services', async (req, res, next) => {
  try {
    const { query = "", page = 1, pageSize = 50 } = req.query;

    // Fetch all services from external provider
    const allServices = await secsers.services();

    // ✅ Apply search (case-insensitive, by name or category)
    const filtered = query
      ? allServices.filter(
          (s) =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.category.toLowerCase().includes(query.toLowerCase())
        )
      : allServices;

    // ✅ Pagination
    const start = (Number(page) - 1) * Number(pageSize);
    const end = start + Number(pageSize);
    const items = filtered.slice(start, end);

    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total: filtered.length,
      items,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Place order
 */
router.post('/order', authMiddleware, async (req, res, next) => {
  try {
    const { providerServiceId, service, link, quantity, runs, interval } = req.body;

    // prefer providerServiceId if provided
    const serviceIdToUse = providerServiceId || service;
    if (!serviceIdToUse) {
      return res.status(400).json({ error: 'Missing providerServiceId or service ID' });
    }
    if (!link) {
      return res.status(400).json({ error: 'Link is required' });
    }

    const resp = await secsers.add({
      service: serviceIdToUse,
      link,
      quantity,
      runs,
      interval
    });

    if (resp?.error) {
      return res.status(400).json({ error: resp.error });
    }

    res.json(resp);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get single order status
 */
router.get('/order/:id', authMiddleware, async (req, res, next) => {
  try {
    res.json(await secsers.status(req.params.id));
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get many orders status
 */
router.get('/orders/status', authMiddleware, async (req, res, next) => {
  try {
    res.json(await secsers.statusMany(String(req.query.ids || '')));
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get account balance
 */
router.get('/balance', authMiddleware, async (_req, res, next) => {
  try {
    res.json(await secsers.balance());
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Request refill
 */
router.post('/order/:id/refill', authMiddleware, async (req, res, next) => {
  try {
    res.json(await secsers.refill(req.params.id));
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Get refill status
 */
router.get('/refill/:id', authMiddleware, async (req, res, next) => {
  try {
    res.json(await secsers.refillStatus(req.params.id));
  } catch (e) {
    next(e);
  }
});

export default router;