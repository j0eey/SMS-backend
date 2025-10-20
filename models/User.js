import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  name: { type: String },
  role: { type: String, enum: ['user','admin'], default: 'user' },
  balance: { type: Number, default: 0 },
  banned: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
