import dotenv from "dotenv";
dotenv.config();

import express from "express";
import Service from "../models/Service.js";
import ServiceTitle from "../models/ServiceTitle.js";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

function getBaseUrl(req) {
  return process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
}

function prependImageUrl(obj, baseUrl) {
  if (!obj || typeof obj !== "object") return;
  // Support both imageUrl (current) and image (legacy) keys
  if (obj.imageUrl && typeof obj.imageUrl === "string" && !obj.imageUrl.startsWith("http")) {
    obj.imageUrl = baseUrl + obj.imageUrl;
  }
  if (obj.image && typeof obj.image === "string" && !obj.image.startsWith("http")) {
    obj.image = baseUrl + obj.image;
  }
  // Recursively walk nested objects
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === "object") {
      prependImageUrl(obj[key], baseUrl);
    }
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/services";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/**
 * @desc Get services (with pagination, optional filter by serviceTitleId)
 * GET /api/admin/services?serviceTitleId=xxx&page=1&pageSize=20
 */
router.get("/", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { serviceTitleId, page = 1, pageSize = 20 } = req.query;

    const filter = {};
    if (serviceTitleId) filter.serviceTitleId = serviceTitleId;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [services, total] = await Promise.all([
      Service.find(filter)
        .populate({
          path: "serviceTitleId",
          select: "name description status platformId imageUrl",
          populate: {
            path: "platformId",
            select: "name categoryId imageUrl",
            populate: { path: "categoryId", select: "name imageUrl" },
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      Service.countDocuments(filter),
    ]);

    const multiplier = parseFloat(process.env.PRICE_MULTIPLIER || "1.3");
    const baseUrl = getBaseUrl(req);

    const normalized = services.map((s) => {
      if (s.serviceTitleId) {
        prependImageUrl(s.serviceTitleId, baseUrl);
      }
      const fullServiceImageUrl =
        s.imageUrl
          ? (s.imageUrl.startsWith("http") ? s.imageUrl : baseUrl + s.imageUrl)
          : undefined;
      return {
        _id: s._id,
        name: s.name,
        description: s.description,
        price: s.price,
        userPrice: s.serviceType === "api"
          ? Number((s.price * multiplier).toFixed(2))
          : Number(s.price),
        serviceType: s.serviceType,
        provider: s.provider,
        providerServiceId: s.providerServiceId,
        stock: s.stock,
        min: s.min,
        max: s.max,
        status: s.status,
        imageUrl: fullServiceImageUrl,
        serviceTitle: s.serviceTitleId
          ? {
              _id: s.serviceTitleId._id,
              name: s.serviceTitleId.name,
              description: s.serviceTitleId.description,
              status: s.serviceTitleId.status,
              imageUrl: s.serviceTitleId.imageUrl,
              platform: s.serviceTitleId.platformId
                ? {
                    _id: s.serviceTitleId.platformId._id,
                    name: s.serviceTitleId.platformId.name,
                    imageUrl: s.serviceTitleId.platformId.imageUrl,
                    category: s.serviceTitleId.platformId.categoryId
                      ? {
                          _id: s.serviceTitleId.platformId.categoryId._id,
                          name: s.serviceTitleId.platformId.categoryId.name,
                          imageUrl: s.serviceTitleId.platformId.categoryId.imageUrl,
                        }
                      : null,
                  }
                : null,
            }
          : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    // ✅ Always wrap in { items, total, page, pageSize }
    res.json({
      page: Number(page),
      pageSize: Number(pageSize),
      total,
      items: normalized,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Search services by name/description/serviceTitle/platform/category
 * GET /api/admin/services/search?query=xxx
 */
router.get("/search", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const regex = new RegExp(query, "i");

    const services = await Service.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .populate({
        path: "serviceTitleId",
        select: "name description status platformId imageUrl",
        populate: {
          path: "platformId",
          select: "name categoryId imageUrl",
          populate: { path: "categoryId", select: "name imageUrl" },
        },
      })
      .lean();

    const multiplier = parseFloat(process.env.PRICE_MULTIPLIER || "1.3");
    const baseUrl = getBaseUrl(req);

    // also check serviceTitle/platform/category matches
    const filtered = services.filter(
      (s) =>
        s.serviceTitleId?.name?.toLowerCase().includes(query.toLowerCase()) ||
        s.serviceTitleId?.platformId?.name
          ?.toLowerCase()
          .includes(query.toLowerCase()) ||
        s.serviceTitleId?.platformId?.categoryId?.name
          ?.toLowerCase()
          .includes(query.toLowerCase())
    );

    const results = [...services, ...filtered].filter(
      (v, i, arr) => arr.findIndex((x) => String(x._id) === String(v._id)) === i
    );

    const normalized = results.map((s) => {
      if (s.serviceTitleId) {
        prependImageUrl(s.serviceTitleId, baseUrl);
      }
      const fullServiceImageUrl =
        s.imageUrl
          ? (s.imageUrl.startsWith("http") ? s.imageUrl : baseUrl + s.imageUrl)
          : undefined;
      return {
        _id: s._id,
        name: s.name,
        description: s.description,
        price: s.price,
        userPrice: s.serviceType === "api"
          ? Number((s.price * multiplier).toFixed(2))
          : Number(s.price),
        serviceType: s.serviceType,
        provider: s.provider,
        providerServiceId: s.providerServiceId,
        stock: s.stock,
        min: s.min,
        max: s.max,
        status: s.status,
        imageUrl: fullServiceImageUrl,
        serviceTitle: s.serviceTitleId
          ? {
              _id: s.serviceTitleId._id,
              name: s.serviceTitleId.name,
              description: s.serviceTitleId.description,
              status: s.serviceTitleId.status,
              imageUrl: s.serviceTitleId.imageUrl,
              platform: s.serviceTitleId.platformId
                ? {
                    _id: s.serviceTitleId.platformId._id,
                    name: s.serviceTitleId.platformId.name,
                    imageUrl: s.serviceTitleId.platformId.imageUrl,
                    category: s.serviceTitleId.platformId.categoryId
                      ? {
                          _id: s.serviceTitleId.platformId.categoryId._id,
                          name: s.serviceTitleId.platformId.categoryId.name,
                          imageUrl: s.serviceTitleId.platformId.categoryId.imageUrl,
                        }
                      : null,
                  }
                : null,
            }
          : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    res.json(normalized);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Create service
 * POST /api/admin/services
 */
router.post("/", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const { serviceTitleId, name, description, price, stock, min, max, status, serviceType, provider, providerServiceId } = req.body;

    if (!serviceTitleId || !name || !price) {
      return res.status(400).json({ error: "serviceTitleId, name and price required" });
    }
    if (!serviceType) {
      return res.status(400).json({ error: "serviceType is required (api or local)" });
    }
    if (serviceType === "api" && !provider) {
      return res.status(400).json({ error: "provider is required for API services" });
    }
    if (serviceType === "api" && !providerServiceId) {
      return res.status(400).json({ error: "providerServiceId is required for API services" });
    }

    const serviceTitle = await ServiceTitle.findById(serviceTitleId);
    if (!serviceTitle) return res.status(404).json({ error: "Service title not found" });

    let imageUrl = "";
    if (req.file) {
      imageUrl = `/uploads/services/${req.file.filename}`;
    }

    const service = await Service.create({
      serviceTitleId,
      name,
      description,
      price,
      stock,
      min,
      max,
      imageUrl,
      status: status === "inactive" ? "inactive" : "active",
      serviceType,
      provider: serviceType === "api" ? provider : null,
      providerServiceId: serviceType === "api" ? providerServiceId : null,
    });

    const baseUrl = getBaseUrl(req);
    if (service.serviceTitleId) {
      // Note: service does not have populated serviceTitleId here, so no image prepending possible
      // If needed, can populate and prepend here, but not requested
    }

    const obj = service.toObject();
    prependImageUrl(obj, getBaseUrl(req));
    res.json(obj);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Update service
 * PUT /api/admin/services/:id
 */
router.put("/:id", authMiddleware, requireAdmin, upload.single("image"), async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    if (updateData.status && !["active", "inactive"].includes(updateData.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    if (updateData.serviceTitleId) {
      const serviceTitle = await ServiceTitle.findById(updateData.serviceTitleId);
      if (!serviceTitle) return res.status(404).json({ error: "Service title not found" });
    }

    if (req.file) {
      updateData.imageUrl = `/uploads/services/${req.file.filename}`;
    }

    const service = await Service.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate({
        path: "serviceTitleId",
        select: "name description status platformId imageUrl",
        populate: {
          path: "platformId",
          select: "name categoryId imageUrl",
          populate: { path: "categoryId", select: "name imageUrl" },
        },
      })
      .lean();
    if (!service) return res.status(404).json({ error: "Service not found" });

    const baseUrl = getBaseUrl(req);
    if (service.serviceTitleId) {
      prependImageUrl(service.serviceTitleId, baseUrl);
    }
    prependImageUrl(service, getBaseUrl(req));
    res.json(service);
  } catch (e) {
    next(e);
  }
});

/**
 * @desc Delete service
 * DELETE /api/admin/services/:id
 */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    await Service.deleteOne({ _id: req.params.id });
    res.json({ message: "Service deleted successfully" });
  } catch (e) {
    next(e);
  }
});


/**
 * @desc Bulk update all services’ images by platform
 * POST /api/admin/services/update-images-by-platform
 * form-data: { image: File, platformId: string }
 */
router.post(
  "/update-images-by-platform",
  authMiddleware,
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { platformId } = req.body;
      if (!platformId) {
        return res.status(400).json({ error: "platformId is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "image file is required" });
      }

      // ✅ Path of the uploaded image
      const imageUrl = `/uploads/services/${req.file.filename}`;

      // ✅ Find all service titles under this platform
      const serviceTitles = await ServiceTitle.find({ platformId }).select("_id");
      const serviceTitleIds = serviceTitles.map((t) => t._id);

      if (serviceTitleIds.length === 0) {
        return res.status(404).json({ error: "No service titles found for this platform" });
      }

      // ✅ Update all services that belong to those titles
      const result = await Service.updateMany(
        { serviceTitleId: { $in: serviceTitleIds } },
        { $set: { imageUrl } }
      );

      res.json({
        message: `✅ Updated ${result.modifiedCount} services successfully.`,
        imageUrl,
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;