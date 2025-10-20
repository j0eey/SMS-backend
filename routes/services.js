import express from "express";
import Service from "../models/Service.js";
import Platform from "../models/Platform.js";
import Category from "../models/Category.js";

const router = express.Router();

// Get services with category & platform
router.get("/", async (req, res, next) => {
  try {
    const { category, platform } = req.query;
    let filter = { status: "active" };

    if (platform) {
      const plat = await Platform.findOne({ name: new RegExp(platform, "i") });
      if (plat) filter.platformId = plat._id;
    } else if (category) {
      const cat = await Category.findOne({ name: new RegExp(category, "i") });
      if (cat) {
        const platforms = await Platform.find({ categoryId: cat._id });
        filter.platformId = { $in: platforms.map((p) => p._id) };
      }
    }

    const services = await Service.find(filter)
      .populate({
        path: "platformId",
        select: "name categoryId",
        populate: { path: "categoryId", select: "name" }
      })
      .lean();

    res.json(services);
  } catch (e) { next(e); }
});

export default router;
