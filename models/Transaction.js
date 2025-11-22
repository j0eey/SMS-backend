import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    method: {
      type: String,
      enum: ["whishmoney", "binance", "usdt", "wallet", "admin"],
      required: true,
    },

    // ✅ FIXED: added "adjustment" to enum
    type: {
      type: String,
      enum: ["deposit", "order", "adjustment"],
      required: true,
    },

    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },

    reference: { type: String }, // e.g. "order:12345" or "manual-order:6789"
    currency: { type: String, enum: ["USD", "LBP", null], default: null }, // only for whishmoney
    proof: { type: String }, // deposit proof file path
    rejectReason: { type: String },

    /**
     * orderNumber = for deposits -> auto-increment deposit label
     * orderNumber = for orders   -> match the Order.orderNumber
     */
    orderNumber: { type: Number, sparse: true },
  },
  { timestamps: true }
);

/**
 * 🔑 Pre-save hook:
 * - Auto-increment orderNumber for deposits only.
 * - For "order" type, orderNumber will be set manually from Order.orderNumber in routes/orders.js.
 */
transactionSchema.pre("save", async function (next) {
  if (this.isNew && this.type === "deposit" && !this.orderNumber) {
    const last = await this.constructor
      .findOne({ type: "deposit" })
      .sort({ orderNumber: -1 })
      .select("orderNumber");

    this.orderNumber = last ? last.orderNumber + 1 : 1;
  }
  next();
});

/**
 * 🔑 Pre-insertMany hook:
 * Ensures bulk deposit inserts still get incremental numbers.
 */
transactionSchema.pre("insertMany", async function (next, docs) {
  for (let doc of docs) {
    if (doc.type === "deposit" && !doc.orderNumber) {
      const last = await mongoose
        .model("Transaction")
        .findOne({ type: "deposit" })
        .sort({ orderNumber: -1 })
        .select("orderNumber");
      doc.orderNumber = last ? last.orderNumber + 1 : 1;
    }
  }
  next();
});

export default mongoose.model("Transaction", transactionSchema);