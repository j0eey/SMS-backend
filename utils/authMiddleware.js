import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Normalize user object
    req.user = {
      _id: decoded.id, // IMPORTANT FIX
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      banned: decoded.banned
    };

    if (decoded.banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

export function signAccessToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, banned: user.banned },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
}