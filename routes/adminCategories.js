import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import path from "path";
import Category from "../models/Category.js";
import Platform from "../models/Platform.js";
import Service from "../models/Service.js";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/categories/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/**
 * @desc List categories (with pagination only)
 * GET /api/admin/categories?page=1&pageSize=20
 */
router.get("/", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [items, total] = await Promise.all([
      Category.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      Category.countDocuments(),
    ]);

    const itemsWithFullUrl = items.map(item => {
      if (item.imageUrl) {
        return { ...item, imageUrl: process.env.BACKEND_URL + item.imageUrl };
      }
      return item;
    });

    // Include imageUrl in returned items (already included since it's in model)
    res.json({
      items: itemsWithFullUrl,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search categories (by name or description)
 * GET /api/admin/categories/search?query=xyz
 */
router.get("/search", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i");

    const results = await Category.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .sort({ createdAt: -1 })
      .limit(50) // ✅ keep search light
      .lean();

    const resultsWithFullUrl = results.map(item => {
      if (item.imageUrl) {
        return { ...item, imageUrl: process.env.BACKEND_URL + item.imageUrl };
      }
      return item;
    });

    res.json(resultsWithFullUrl);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create category
 * POST /api/admin/categories
 */
router.post("/", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });

    const exists = await Category.findOne({ name });
    if (exists) return res.status(400).json({ error: "Category already exists" });

    let imageUrl = "";
    if (req.file) {
      imageUrl = `/uploads/categories/${req.file.filename}`;
    }

    const category = await Category.create({ name, description, status, imageUrl });

    const categoryObj = category.toObject();
    if (categoryObj.imageUrl) {
      categoryObj.imageUrl = process.env.BACKEND_URL + categoryObj.imageUrl;
    }

    res.json(categoryObj);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Update category
 * PUT /api/admin/categories/:id
 */
router.put("/:id", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.imageUrl = `/uploads/categories/${req.file.filename}`;
    }

    const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!category) return res.status(404).json({ error: "Category not found" });

    const categoryObj = category.toObject();
    if (categoryObj.imageUrl) {
      categoryObj.imageUrl = process.env.BACKEND_URL + categoryObj.imageUrl;
    }

    res.json(categoryObj);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Delete category (cascade delete platforms and services)
 * DELETE /api/admin/categories/:id
 */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Find platforms under this category
    const platforms = await Platform.find({ categoryId });

    // For each platform, delete related services
    for (const platform of platforms) {
      await Service.deleteMany({ platformId: platform._id });
    }

    // Delete platforms
    await Platform.deleteMany({ categoryId });

    // Delete the category
    await Category.deleteOne({ _id: categoryId });

    res.json({ message: "Category and related platforms/services deleted successfully" });
  } catch (e) {
    next(e);
  }
});

export default router;
