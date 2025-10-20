import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // ex: "Social Media Services"
    description: { type: String },
    imageUrl: { type: String },
    slug: { type: String, unique: true }, // URL-friendly name
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

// Generate unique slug
categorySchema.pre("save", async function (next) {
  if (!this.isModified("name")) return next();

  const baseSlug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let slug = baseSlug;
  let i = 1;

  while (await this.constructor.findOne({ slug })) {
    slug = `${baseSlug}-${i++}`;
  }

  this.slug = slug;
  next();
});

export default mongoose.model("Category", categorySchema);
