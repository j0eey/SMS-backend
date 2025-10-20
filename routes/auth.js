import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordReset from '../models/PasswordReset.js';
import Notification from '../models/Notification.js';
import { sendMail } from '../utils/mailer.js';
import { signAccessToken, signRefreshToken } from '../utils/authMiddleware.js';

// ✅ Joi validation
import { signupSchema, loginSchema } from '../validators/authValidator.js';
import { validate } from '../utils/validate.js';

const router = express.Router();

// Helper: save refresh token in DB
async function saveRefreshToken(userId, token) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
  await RefreshToken.create({ userId, token, expiresAt });
}

// Helper: filter safe user object
function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    balance: user.balance,
    banned: user.banned
  };
}

// Signup
router.post('/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Prevent duplicate accounts
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash: hashed, name, role: 'user' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await saveRefreshToken(user.id, refreshToken);

    res.json({ accessToken, refreshToken, user: safeUser(user) });
  } catch (e) { next(e); }
});

// Login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Block banned users
    if (user.banned) return res.status(403).json({ error: 'Account is banned' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await saveRefreshToken(user.id, refreshToken);

    res.json({ accessToken, refreshToken, user: safeUser(user) });
  } catch (e) { next(e); }
});

// Refresh access token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored) return res.status(403).json({ error: 'Invalid refresh token' });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newAccessToken = signAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (e) { next(e); }
});

// Request password reset
router.post('/request-reset', async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: 'If account exists, reset link sent' });
    }

    // Invalidate old tokens
    await PasswordReset.deleteMany({ userId: user._id });

    // Create reset token (15 min expiry)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await PasswordReset.create({ userId: user.id, token, expiresAt });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    // Email notification
    await sendMail(
      user.email,
      'Password Reset Request',
      `A password reset was requested. If this was you, use the link: ${resetLink}`,
      `<p>A password reset was requested for your account.</p>
       <p>If this was you, click below (valid for 15 minutes):</p>
       <p><a href="${resetLink}">Reset Password</a></p>
       <p>If this wasn’t you, you can ignore this email.</p>`
    );

    // In-app notification
    await Notification.create({
      userId: user._id,
      title: 'Password Reset Requested',
      message: 'A password reset request was made for your account.'
    });

    res.json({ message: 'Password reset link generated', resetLink });
  } catch (e) { next(e); }
});

// Reset password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const resetRecord = await PasswordReset.findOne({ token });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await User.findById(resetRecord.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Hash new password & save
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();

    // Invalidate token
    await PasswordReset.deleteOne({ _id: resetRecord.id });

    // Email confirmation
    await sendMail(
      user.email,
      'Password Reset Successful',
      'Your password was successfully reset. If this wasn’t you, contact support immediately.',
      `<p>Your password was successfully reset.</p>
       <p>If this wasn’t you, <b>contact support immediately</b>.</p>`
    );

    // In-app notification
    await Notification.create({
      userId: user._id,
      title: 'Password Reset Successful',
      message: 'Your password has been reset.'
    });

    res.json({ message: 'Password reset successful' });
  } catch (e) { next(e); }
});

// Logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }
    res.json({ message: 'Logged out' });
  } catch (e) { next(e); }
});

export default router;
