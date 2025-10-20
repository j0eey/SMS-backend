import dotenv from "dotenv";
dotenv.config();

import express from "express";
import Platform from "../models/Platform.js";
import Category from "../models/Category.js";
import Service from "../models/Service.js";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

function getFullUrl(req, path) {
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${baseUrl}${path}`;
}

function prependImageUrl(req, platform) {
  if (platform.imageUrl) {
    return { ...platform, imageUrl: getFullUrl(req, platform.imageUrl) };
  }
  return platform;
}

function prependImageUrlArray(req, platforms) {
  return platforms.map((p) => prependImageUrl(req, p));
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/platforms";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/**
 * @desc Get all platforms (with pagination, optional filter by categoryId)
 * GET /api/admin/platforms?categoryId=xxx&page=1&pageSize=20
 */
router.get("/", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { categoryId, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (categoryId) filter.categoryId = categoryId;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [items, total] = await Promise.all([
      Platform.find(filter)
        .populate("categoryId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      Platform.countDocuments(filter),
    ]);

    const itemsWithFullUrl = prependImageUrlArray(req, items);

    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      items: itemsWithFullUrl,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search platforms by name/description/category
 * GET /api/admin/platforms/search?query=netflix
 */
router.get("/search", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i");

    const platforms = await Platform.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .populate("categoryId", "name")
      .lean();

    // If user searches category name, filter results manually
    const filtered = platforms.filter((p) =>
      p.categoryId?.name?.toLowerCase().includes(query.toLowerCase())
    );

    // Merge results (avoid duplicates)
    const results = [...platforms, ...filtered].filter(
      (v, i, arr) => arr.findIndex((x) => String(x._id) === String(v._id)) === i
    );

    const resultsWithFullUrl = prependImageUrlArray(req, results);

    res.json(resultsWithFullUrl);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create platform
 * POST /api/admin/platforms
 */
router.post("/", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const { categoryId, name, description } = req.body;
    if (!categoryId || !name)
      return res.status(400).json({ error: "CategoryId and name required" });

    const category = await Category.findById(categoryId);
    if (!category) return res.status(404).json({ error: "Category not found" });

    let imageUrl = "";
    if (req.file) {
      imageUrl = `/uploads/platforms/${req.file.filename}`;
    }
    const platform = await Platform.create({ categoryId, name, description, imageUrl });
    const platformObj = platform.toObject();
    const platformWithFullUrl = prependImageUrl(req, platformObj);
    res.json(platformWithFullUrl);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Update platform
 * PUT /api/admin/platforms/:id
 */
router.put("/:id", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    if (req.file) {
      req.body.imageUrl = `/uploads/platforms/${req.file.filename}`;
    }
    const platform = await Platform.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!platform) return res.status(404).json({ error: "Platform not found" });
    const platformObj = platform.toObject();
    const platformWithFullUrl = prependImageUrl(req, platformObj);
    res.json(platformWithFullUrl);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Delete platform (cascade delete services)
 * DELETE /api/admin/platforms/:id
 */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const platformId = req.params.id;

    // Delete all services under this platform
    await Service.deleteMany({ platformId });

    // Delete the platform itself
    await Platform.deleteOne({ _id: platformId });

    res.json({ message: "Platform and related services deleted successfully" });
  } catch (e) {
    next(e);
  }
});

export default router;
