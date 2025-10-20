import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true }, // reference to Service model
  link: { type: String }, // optional now, validator handles if required
  quantity: { type: Number },
  runs: { type: Number },
  interval: { type: Number },
  providerOrder: { type: Number }, // Secsers order id
  status: { type: String, default: 'Pending' },
  charge: { type: String },
  currency: { type: String, default: 'USD' },
  start_count: { type: Number },
  remains: { type: Number },
  provider: { type: String, enum: ['secsers', 'manual'], default: 'secsers' },
  adminNotes: { type: String },
  orderNumber: { type: Number, unique: true },
}, { timestamps: true });

// 🔑 Custom validation logic
orderSchema.pre('validate', function (next) {
  if (this.provider === 'secsers' && !this.link) {
    return next(new Error('Link is required for secsers orders'));
  }
  next();
});

export default mongoose.model('Order', orderSchema);
