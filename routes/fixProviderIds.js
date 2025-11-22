import express from "express";
import Service from "../models/Service.js";

const router = express.Router();

/**
 * FAST version — bulk update
 * POST /api/admin/fix-provider-ids
 */
router.post("/", async (req, res) => {
  try {
    // Get ONLY API services that contain (ID: xxxx)
    const services = await Service.find({
      serviceType: "api",
      description: { $regex: /ID:\s*\d+/i }
    });

    if (services.length === 0) {
      return res.json({ ok: true, updatedCount: 0 });
    }

    // Prepare bulk operations
    const bulkOps = services.map((s) => {
      const match = s.description.match(/ID:\s*(\d+)/i);
      if (!match) return null;

      const id = match[1];

      return {
        updateOne: {
          filter: { _id: s._id },
          update: {
            $set: {
              provider: "secsers",
              providerServiceId: id
            }
          }
        }
      };
    }).filter(Boolean); // remove nulls

    // Execute bulk update
    const result = await Service.bulkWrite(bulkOps);

    return res.json({
      ok: true,
      updatedCount: result.modifiedCount
    });

  } catch (err) {
    console.error("fixProviderIds ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;