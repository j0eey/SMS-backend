// routes/adminImport.js
import express from "express";
import axios from "axios";
import Platform from "../models/Platform.js";
import ServiceTitle from "../models/ServiceTitle.js";
import Service from "../models/Service.js";
import Category from "../models/Category.js";
import { authMiddleware, requireAdmin } from "../utils/authMiddleware.js";

const router = express.Router();

// Hardcode the parent category for all imported services
const SOCIAL_MEDIA_CATEGORY = "Social Media Services";

router.post("/import-services", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    // 1. Fetch external services
    const { data } = await axios.get("http://localhost:5001/api/secsers/services"); // adjust URL if needed

    // 2. Ensure base category exists
    let category = await Category.findOne({ name: SOCIAL_MEDIA_CATEGORY });
    if (!category) {
      category = await Category.create({ name: SOCIAL_MEDIA_CATEGORY, status: "active" });
    }

    let importedCount = 0;

    for (const item of data) {
      // 3. Detect platform from service name
      let platformName = null;
      if (item.name.toLowerCase().includes("instagram")) platformName = "Instagram";
      if (item.name.toLowerCase().includes("tiktok")) platformName = "TikTok";
      if (item.name.toLowerCase().includes("youtube")) platformName = "YouTube";
      if (item.name.toLowerCase().includes("telegram")) platformName = "Telegram";
      if (item.name.toLowerCase().includes("spotify")) platformName = "Spotify";
      if (item.name.toLowerCase().includes("facebook")) platformName = "Facebook";
        if (item.name.toLowerCase().includes("twitter")) platformName = "Twitter";
        if (item.name.toLowerCase().includes("twitch")) platformName = "Twitch";
        if (item.name.toLowerCase().includes("linkedin")) platformName = "LinkedIn";
        if (item.name.toLowerCase().includes("likee")) platformName = "Likee";
        if (item.name.toLowerCase().includes("soundcloud")) platformName = "SoundCloud";
        

        
      if (!platformName) continue; // skip unknown

      // 4. Ensure platform exists
      let platform = await Platform.findOne({ name: platformName });
      if (!platform) {
        platform = await Platform.create({
          categoryId: category._id,
          name: platformName,
          description: `${platformName} platform`,
          status: "active",
        });
      }

      // 5. Ensure service title exists (use JSON category field)
      let serviceTitle = await ServiceTitle.findOne({ name: item.category, platformId: platform._id });
      if (!serviceTitle) {
        serviceTitle = await ServiceTitle.create({
          platformId: platform._id,
          name: item.category,
          status: "active",
        });
      }

      // 6. Ensure service exists (match by external ID + name)
      let service = await Service.findOne({ name: item.name, serviceTitleId: serviceTitle._id });
      if (!service) {
        await Service.create({
          serviceTitleId: serviceTitle._id,
          name: item.name,
          description: `Imported from provider (ID: ${item.service})`,
          price: parseFloat(item.rate),
          min: item.min,
          max: item.max,
          status: "active",
        });
        importedCount++;
      }
    }

    res.json({ message: `Imported ${importedCount} services successfully` });
  } catch (e) {
    next(e);
  }
});

export default router;
