import dotenv from "dotenv";
dotenv.config();

import express from "express";
import ServiceTitle from "../models/ServiceTitle.js";
import Platform from "../models/Platform.js";
import Category from "../models/Category.js";

const router = express.Router();

function getFullUrl(req, path) {
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${baseUrl}${path}`;
}

// GET /api/user/service-titles?platformId=xxx&page=1&pageSize=16
router.get("/", async (req, res, next) => {
  try {
    let { platformId, platformSlug } = req.query;
    const filter = { status: "active" };

    // Support slug or ObjectId
    if (platformSlug) {
      const plat = await Platform.findOne({ slug: platformSlug }).select("_id");
      if (plat) filter.platformId = plat._id;
    } else if (platformId) {
      // check if valid ObjectId
      if (/^[0-9a-fA-F]{24}$/.test(platformId)) {
        filter.platformId = platformId;
      } else {
        // treat as slug fallback
        const plat = await Platform.findOne({ slug: platformId }).select("_id");
        if (plat) filter.platformId = plat._id;
      }
    }

    const { page = 1, pageSize = 16 } = req.query;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [items, total] = await Promise.all([
      ServiceTitle.find(filter).select("_id name slug status platformId")
        .populate({
          path: "platformId",
          select: "name slug imageUrl"
        })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      ServiceTitle.countDocuments(filter),
    ]);

    // Prepend full image URL for platform image if needed
    const itemsWithImages = items.map((title) => {
      if (title.platformId?.imageUrl) {
        title.platformId.imageUrl = getFullUrl(req, title.platformId.imageUrl);
      }
      title.slug = title.slug;
      return title;
    });

    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      items: itemsWithImages,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search service titles (public, paginated)
 * @route GET /api/user/service-titles/search?query=&page=&pageSize=
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
      name: { $regex: regex }
    };
    if (req.query.platformSlug) {
      const plat = await Platform.findOne({ slug: req.query.platformSlug }).select("_id");
      if (plat) filter.platformId = plat._id;
    } else if (req.query.platformId) {
      const pid = req.query.platformId;
      if (/^[0-9a-fA-F]{24}$/.test(pid)) {
        filter.platformId = pid;
      } else {
        const plat = await Platform.findOne({ slug: pid }).select("_id");
        if (plat) filter.platformId = plat._id;
      }
    }

    const total = await ServiceTitle.countDocuments(filter);
    const items = await ServiceTitle.find(filter)
      .populate({ path: "platformId", select: "name imageUrl" })
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const formatted = items.map((title) => {
      if (title.platformId?.imageUrl) {
        title.platformId.imageUrl = getFullUrl(req, title.platformId.imageUrl);
      }
      title.slug = title.slug;
      return title;
    });

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: formatted,
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @desc Get single service title by ID or slug
 * @route GET /api/user/service-titles/:idOrSlug
 */
router.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const baseUrl =
      process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;

    // Find by ID or slug
    const serviceTitle = await ServiceTitle.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
      status: "active",
    })
      .populate({ path: "platformId", select: "name slug imageUrl" })
      .lean();

    if (!serviceTitle) {
      return res.status(404).json({ error: "Service title not found" });
    }

    // Add full image URL
    if (serviceTitle.platformId?.imageUrl) {
      serviceTitle.platformId.imageUrl = getFullUrl(
        req,
        serviceTitle.platformId.imageUrl
      );
    }

    res.json({
      _id: serviceTitle._id,
      name: serviceTitle.name,
      slug: serviceTitle.slug,
      platform: serviceTitle.platformId
        ? { _id: serviceTitle.platformId._id, name: serviceTitle.platformId.name, slug: serviceTitle.platformId.slug, imageUrl: serviceTitle.platformId.imageUrl }
        : null
    });
  } catch (error) {
    next(error);
  }
});
export default router;