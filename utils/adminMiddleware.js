import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ✅ Verify admin token & role
export const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return res.status(401).json({ error: "Invalid token" });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Admin auth error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
