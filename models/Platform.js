import mongoose from "mongoose";

const platformSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    name: { type: String, required: true }, // ex: "Instagram", "TikTok", "Netflix"
    description: { type: String },
    imageUrl: { type: String },
    slug: { type: String, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);


platformSchema.pre("save", async function (next) {
  if (!this.isModified("name")) return next();

  const baseSlug = this.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slug = baseSlug;
  let counter = 1;

  while (await this.constructor.findOne({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  this.slug = slug;
  next();
});

export default mongoose.model("Platform", platformSchema);
