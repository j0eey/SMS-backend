import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    serviceTitleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceTitle",
      required: true,
    },
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    stock: Number,
    min: Number,
    max: Number,
    imageUrl: String,
    slug: { type: String, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    serviceType: { type: String, enum: ["api", "local"], required: true },
    provider: { type: String, enum: ["secsers", null], default: null },
    providerServiceId: { type: String, default: null },
  },
  {
    timestamps: true,
    id: false, // remove virtual id
    versionKey: false, // remove __v
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual price for user
serviceSchema.virtual("userPrice").get(function () {
  const multiplier = Number(process.env.PRICE_MULTIPLIER || 1.3);
  if (this.serviceType === "api") {
    return Number((this.price * multiplier).toFixed(2));
  }
  // For local services, use price directly without multiplier
  return Number(this.price.toFixed(2));
});

// Generate unique slug based on name
serviceSchema.pre("save", async function (next) {
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

export default mongoose.model("Service", serviceSchema);