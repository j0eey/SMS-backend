import express from "express";
import Platform from "../models/Platform.js";
import Category from "../models/Category.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// ✅ Helper to build full image URL
function getFullUrl(req, imagePath) {
  const base = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `${base}${imagePath}`;
}

/**
 * @desc Fetch platforms for users (optional filter by category)
 * @route GET /api/user/platforms?categoryId=xxx
 */
router.get("/", async (req, res, next) => {
  try {
    const { categoryId } = req.query;
    const { categorySlug } = req.query;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || "16", 10));

    const filter = { status: "active" };
    if (categoryId) filter.categoryId = categoryId;
    if (categorySlug) {
      const cat = await Category.findOne({ slug: categorySlug }).select("_id");
      if (cat) filter.categoryId = cat._id;
    }

    const total = await Platform.countDocuments(filter);
    const platforms = await Platform.find(filter)
      .populate("categoryId", "name status slug")
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const items = platforms.map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      status: p.status,
      imageUrl: getFullUrl(req, p.imageUrl),
      category: p.categoryId
        ? { _id: p.categoryId._id, name: p.categoryId.name, slug: p.categoryId.slug }
        : null,
    }));

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @desc Search platforms (public, paginated)
 * @route GET /api/user/platforms/search?query=&page=&pageSize=
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
    // ✅ Filter by category if provided
    if (req.query.categoryId) {
      filter.categoryId = req.query.categoryId;
    }
    const { categorySlug } = req.query;
    if (categorySlug) {
      const cat = await Category.findOne({ slug: categorySlug }).select("_id");
      if (cat) filter.categoryId = cat._id;
    }

    const total = await Platform.countDocuments(filter);
    const platforms = await Platform.find(filter)
      .populate("categoryId", "name slug")
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const items = platforms.map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      status: p.status,
      imageUrl: getFullUrl(req, p.imageUrl),
      category: p.categoryId ? { _id: p.categoryId._id, name: p.categoryId.name, slug: p.categoryId.slug } : null,
    }));

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items,
    });
  } catch (err) {
    next(err);
  }
});


/**
 * @desc Get single platform by ID or slug
 * @route GET /api/user/platforms/:idOrSlug
 */
router.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const baseUrl =
      process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;

    // Match by Mongo ID or slug
    const platform = await Platform.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
      status: "active",
    })
      .populate("categoryId", "name slug")
      .lean();

    if (!platform) {
      return res.status(404).json({ error: "Platform not found" });
    }

    // Build full image URL
    if (platform.imageUrl) {
      platform.imageUrl = getFullUrl(req, platform.imageUrl);
    }

    res.json(platform);
  } catch (error) {
    next(error);
  }
});
export default router;