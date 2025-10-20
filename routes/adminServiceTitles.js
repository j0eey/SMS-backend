import dotenv from "dotenv";
dotenv.config();

import express from "express";
import ServiceTitle from "../models/ServiceTitle.js";
import Service from "../models/Service.js";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

function prependUrlToImage(imageUrl, req) {
  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  return baseUrl + imageUrl;
}

function transformServiceTitleImages(item, req) {
  if (!item) return item;

  if (item.imageUrl) {
    item.imageUrl = prependUrlToImage(item.imageUrl, req);
  }

  if (item.platformId) {
    if (typeof item.platformId === "object" && item.platformId !== null) {
      if (item.platformId.imageUrl) {
        item.platformId.imageUrl = prependUrlToImage(item.platformId.imageUrl, req);
      }
    }
  }

  return item;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/serviceTitles";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/**
 * @desc Get all service titles (with pagination, optional filter by platformId)
 * GET /api/admin/service-titles?platformId=xxx&page=1&pageSize=20
 */
router.get("/", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { platformId, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (platformId) filter.platformId = platformId;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [items, total] = await Promise.all([
      ServiceTitle.find(filter)
        .populate("platformId", "name imageUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      ServiceTitle.countDocuments(filter),
    ]);

    const transformedItems = items.map((item) => transformServiceTitleImages(item, req));

    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      items: transformedItems,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search service titles by name/description/platform
 * GET /api/admin/service-titles/search?query=xxx
 */
router.get("/search", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i");

    // Match service titles by name/description
    const titles = await ServiceTitle.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .populate("platformId", "name imageUrl")
      .lean();

    // Also match by platform name
    const filtered = titles.filter((t) =>
      t.platformId?.name?.toLowerCase().includes(query.toLowerCase())
    );

    // Merge results without duplicates
    const results = [...titles, ...filtered].filter(
      (v, i, arr) => arr.findIndex((x) => String(x._id) === String(v._id)) === i
    );

    const transformedResults = results.map((item) => transformServiceTitleImages(item, req));

    res.json(transformedResults);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create service title
 * POST /api/admin/service-titles
 */
router.post("/", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const { platformId, name, description, status } = req.body;
    if (!platformId || !name) {
      return res.status(400).json({ error: "platformId and name required" });
    }

    let imageUrl = "";
    if (req.file) {
      imageUrl = `/uploads/serviceTitles/${req.file.filename}`;
    }

    const title = await ServiceTitle.create({
      platformId,
      name,
      description,
      imageUrl,
      status: status === "inactive" ? "inactive" : "active",
    });

    const populatedTitle = await ServiceTitle.findById(title._id).populate("platformId", "name imageUrl").lean();

    const transformedTitle = transformServiceTitleImages(populatedTitle, req);

    res.json(transformedTitle);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Update service title
 * PUT /api/admin/service-titles/:id
 */
router.put("/:id", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.imageUrl = `/uploads/serviceTitles/${req.file.filename}`;
    }

    if (updateData.status && !["active", "inactive"].includes(updateData.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const title = await ServiceTitle.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).populate("platformId", "name imageUrl").lean();

    if (!title) return res.status(404).json({ error: "Service title not found" });

    const transformedTitle = transformServiceTitleImages(title, req);

    res.json(transformedTitle);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Delete service title + cascade delete services under it
 * DELETE /api/admin/service-titles/:id
 */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const titleId = req.params.id;

    // Delete all services under this title
    await Service.deleteMany({ serviceTitleId: titleId });

    // Delete the service title itself
    await ServiceTitle.deleteOne({ _id: titleId });

    res.json({ message: "Service title and related services deleted successfully" });
  } catch (e) {
    next(e);
  }
});

export default router;
