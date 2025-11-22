import express from "express";
import Category from "../models/Category.js";

const router = express.Router();

/**
 * @desc Get all active categories for user side with pagination
 * GET /api/user/categories
 */
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || "16", 10));
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;

    const filter = { status: "active" };

    const total = await Category.countDocuments(filter);
    const categories = await Category.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("_id name slug description status imageUrl createdAt")
      .lean();

    const formatted = categories.map((cat) => ({
      ...cat,
      imageUrl: cat.imageUrl ? `${baseUrl}${cat.imageUrl}` : null,
    }));

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
 * @desc Search categories (public, paginated)
 * GET /api/user/categories/search?query=&page=&pageSize=
 */
router.get("/search", async (req, res, next) => {
  try {
    const q = req.query.query || req.query.q || "";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || "16", 10));
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;

    if (!q.trim()) {
      return res.json({ page, pageSize, total: 0, totalPages: 1, items: [] });
    }

    const regex = new RegExp(q, "i");
    const filter = {
      status: "active",
      $or: [{ name: regex }, { description: regex }],
    };

    const total = await Category.countDocuments(filter);
    const categories = await Category.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("_id name slug description status imageUrl createdAt")
      .lean();

    const formatted = categories.map((cat) => ({
      ...cat,
      imageUrl: cat.imageUrl ? `${baseUrl}${cat.imageUrl}` : null,
    }));

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
 * @desc Get single category by ID or slug
 * GET /api/user/categories/:idOrSlug
 */
router.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const baseUrl =
      process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;

    // Match by ID or slug
    const category = await Category.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
      status: "active",
    })
      .select("_id name description status imageUrl slug createdAt")
      .lean();

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    if (category.imageUrl) {
      category.imageUrl = `${baseUrl}${category.imageUrl}`;
    }

    res.json(category);
  } catch (error) {
    next(error);
  }
});

export default router;