import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import secsersRoutes from './routes/secsers.js';
import ordersRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import adminAuthRoutes from './routes/adminAuth.js';

import paymentsRoutes from './routes/payments.js';
import adminDepositsRoutes from './routes/adminDeposits.js';
import adminUsersRoutes from './routes/adminUsers.js';
import adminOrdersRoutes from './routes/adminOrders.js';
import notificationsRoutes from './routes/notifications.js';

import adminAnalyticsRoutes from './routes/adminAnalytics.js';
import analyticsRoutes from "./routes/analytics.js";
import adminCategoriesRoutes from "./routes/adminCategories.js";
import adminPlatformsRoutes from "./routes/adminPlatforms.js";  // ✅ NEW
import adminServiceTitlesRoutes from "./routes/adminServiceTitles.js";
import adminServicesRoutes from "./routes/adminServices.js";
import adminImportRoutes from "./routes/adminImport.js";


import userRoutes from "./routes/user.js";
import userCategoriesRoutes from "./routes/userCategories.js";
import userPlatformsRoutes from "./routes/userPlatforms.js";
import userServiceTitlesRoutes from "./routes/userServiceTitles.js";
import userServicesRoutes from "./routes/userServices.js";
import userTransactions from "./routes/userTransactions.js";
import userServices from "./routes/userServices.js";

// 🔄 Import jobs
import startOrderSync from './jobs/orderSync.js';

dotenv.config();

const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "http://192.168.10.225:5173"  // ✅ add your frontend IP here
];


app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(morgan('dev'));

// Basic rate limits
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120 });
const authLimiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use('/api', publicLimiter);
app.use('/api/auth', authLimiter);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/secsers', secsersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/notifications', notificationsRoutes);

// Public admin signup/login
app.use('/api/admin/auth', adminAuthRoutes);

// Protected admin-only endpoints
app.use('/api/admin', adminRoutes);

app.use('/api/payments', paymentsRoutes);
app.use('/api/admin/deposits', adminDepositsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/orders', adminOrdersRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use("/api/admin/analytics", analyticsRoutes);
app.use("/api/admin/categories", adminCategoriesRoutes);
app.use("/api/admin/platforms", adminPlatformsRoutes);   // ✅ NEW
app.use("/api/admin/service-titles", adminServiceTitlesRoutes);
app.use("/api/admin/services", adminServicesRoutes);
app.use("/api/admin", adminImportRoutes);


// User routes
app.use("/api/user", userRoutes);
app.use("/api/user/categories", userCategoriesRoutes);
app.use("/api/user/platforms", userPlatformsRoutes);
app.use("/api/user/service-titles", userServiceTitlesRoutes);
app.use("/api/user/services", userServicesRoutes);
app.use("/api/user/transactions", userTransactions);
app.use("/api/services", userServices);



// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err?.status || 400;
  res.status(status).json({ error: err?.message || 'Request failed' });
});

// DB connect & start
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;
const HOST = '0.0.0.0';

if (!MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}

mongoose.connect(MONGO_URI).then(() => {
  console.log('✅ MongoDB connected');
  app.listen(PORT, HOST, () => {
  console.log(`🚀 API listening on:`);
  console.log(`   ➜ Local:   http://localhost:${PORT}`);
  console.log(`   ➜ Network: http://${HOST}:${PORT}`);
  startOrderSync();
});
}).catch((e) => {
  console.error('❌ MongoDB connection error:', e.message);
  process.exit(1);
});
