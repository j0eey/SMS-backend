import express from "express";
import Service from "../models/Service.js";
import ServiceTitle from "../models/ServiceTitle.js";

const router = express.Router();

// Helper to build full image URLs
function getFullUrl(req, path) {
  const baseUrl =
    process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${baseUrl}${path}`;
}

// Format service object with guaranteed userPrice
function formatService(req, s) {
  const multiplier = Number(process.env.PRICE_MULTIPLIER || 1.3);
  const calculatedUserPrice =
    s.serviceType === "api"
      ? Number((s.price * multiplier).toFixed(2))
      : Number(s.price.toFixed(2));

  return {
    _id: s._id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    price: s.price,
    userPrice: calculatedUserPrice,
    stock: s.stock,
    min: s.min,
    max: s.max,
    status: s.status,
    serviceType: s.serviceType,
    provider: s.provider,
    providerServiceId: s.providerServiceId,
    imageUrl: getFullUrl(req, s.imageUrl),
    serviceTitle: s.serviceTitleId
      ? { _id: s.serviceTitleId._id, name: s.serviceTitleId.name }
      : null,
  };
}

/**
 * @route  GET /api/user/services/search
 * @desc   Search services by name or description
 * @query  ?query=xxx
 */
router.get("/search", async (req, res, next) => {
  try {
    const q = req.query.query || req.query.q || "";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || "16", 10));

    if (!q.trim()) {
      return res.json({ page, pageSize, total: 0, totalPages: 1, items: [] });
    }

    const regex = new RegExp(q, "i");

    const filter = {
      status: "active",
      $or: [{ name: regex }, { description: regex }],
    };
    // Filter inside specific serviceTitle if provided
    if (req.query.serviceTitleSlug) {
      const st = await ServiceTitle.findOne({ slug: req.query.serviceTitleSlug }).select("_id");
      if (st) filter.serviceTitleId = st._id;
    } else if (req.query.serviceTitleId) {
      const stid = req.query.serviceTitleId;
      if (/^[0-9a-fA-F]{24}$/.test(stid)) {
        filter.serviceTitleId = stid;
      } else {
        const st = await ServiceTitle.findOne({ slug: stid }).select("_id");
        if (st) filter.serviceTitleId = st._id;
      }
    }

    const total = await Service.countDocuments(filter);
    const services = await Service.find(filter)
      .populate("serviceTitleId", "name slug")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean({ virtuals: true });

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: services.map((s) => formatService(req, s)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route  GET /api/user/services
 * @desc   Get paginated services (optional filter by serviceTitleId)
 * @query  ?serviceTitleId=xxx&page=1&pageSize=16
 */
router.get("/", async (req, res, next) => {
  try {
    const { serviceTitleId, page = 1, pageSize = 16 } = req.query;
    const filter = { status: "active" };

    if (req.query.serviceTitleSlug) {
      const st = await ServiceTitle.findOne({ slug: req.query.serviceTitleSlug }).select("_id");
      if (st) filter.serviceTitleId = st._id;
    } else if (serviceTitleId) {
      if (/^[0-9a-fA-F]{24}$/.test(serviceTitleId)) {
        filter.serviceTitleId = serviceTitleId;
      } else {
        const st = await ServiceTitle.findOne({ slug: serviceTitleId }).select("_id");
        if (st) filter.serviceTitleId = st._id;
      }
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [services, total] = await Promise.all([
      Service.find(filter)
        .populate("serviceTitleId", "name slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean({ virtuals: true }),
      Service.countDocuments(filter),
    ]);

    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      items: services.map((s) => formatService(req, s)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route  GET /api/user/services/:idOrSlug
 * @desc   Get single service by ID or slug
 */
router.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;

    // Find by ID or slug (safe handling)
    let service;
    if (/^[0-9a-fA-F]{24}$/.test(idOrSlug)) {
      service = await Service.findOne({ _id: idOrSlug })
        .populate({
          path: "serviceTitleId",
          select: "name slug platformId",
          populate: {
            path: "platformId",
            select: "name slug categoryId",
            populate: { path: "categoryId", select: "name slug" },
          },
        })
        .lean({ virtuals: true });
    } else {
      service = await Service.findOne({ slug: idOrSlug })
        .populate({
          path: "serviceTitleId",
          select: "name slug platformId",
          populate: {
            path: "platformId",
            select: "name slug categoryId",
            populate: { path: "categoryId", select: "name slug" },
          },
        })
        .lean({ virtuals: true });
    }

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const multiplier = Number(process.env.PRICE_MULTIPLIER || 1.3);

    res.json({
      _id: service._id,
      slug: service.slug,
      name: service.name,
      description: service.description,
      imageUrl: getFullUrl(req, service.imageUrl),
      price: service.price,
      userPrice:
        service.serviceType === "api"
          ? Number((service.price * multiplier).toFixed(2))
          : Number(service.price.toFixed(2)),
      min: service.min,
      max: service.max,
      stock: service.stock ?? "Unlimited",
      status: service.status,
      serviceType: service.serviceType,
      provider: service.provider,
      providerServiceId: service.providerServiceId,
      serviceTitle: service.serviceTitleId
        ? {
            _id: service.serviceTitleId._id,
            slug: service.serviceTitleId.slug,
            name: service.serviceTitleId.name,
          }
        : null,
      platform: service.serviceTitleId?.platformId
        ? {
            _id: service.serviceTitleId.platformId._id,
            slug: service.serviceTitleId.platformId.slug,
            name: service.serviceTitleId.platformId.name,
          }
        : null,
      category: service.serviceTitleId?.platformId?.categoryId
        ? {
            _id: service.serviceTitleId.platformId.categoryId._id,
            slug: service.serviceTitleId.platformId.categoryId.slug,
            name: service.serviceTitleId.platformId.categoryId.name,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});


export default router;