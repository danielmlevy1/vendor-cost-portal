// =============================================================
// VENDOR COST PORTAL — Auth routes + middleware
//
// Routes (mounted at /api/auth in server.js):
//   POST   /login    → { token, user }
//   GET    /me       → { user }          (requires valid JWT)
//   POST   /logout   → { ok: true }      (client-side only)
//
// Exported middleware:
//   requireAuth          — 401 if no valid Bearer token
//   requireRole(...roles) — 403 if user's role isn't in the list
// =============================================================

'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('./database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

// ── POST /api/auth/login ───────────────────────────────────────
// Body: { email, password }
// Returns: { token, user: { id, name, email, role, tcId? } }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // 1. Check internal users
  const internalUser = db
    .prepare('SELECT id, name, email, role, password_hash, department_id FROM users WHERE email = ?')
    .get(email);

  if (internalUser) {
    const valid = await bcrypt.compare(password, internalUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id:           internalUser.id,
      name:         internalUser.name,
      email:        internalUser.email,
      role:         internalUser.role,
      departmentId: internalUser.department_id || null,
      type:         'user',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    return res.json({ token, user: payload });
  }

  // 2. Check trading companies
  const tc = db
    .prepare('SELECT id, code, name, email, password_hash FROM trading_companies WHERE email = ?')
    .get(email);

  if (tc) {
    const valid = await bcrypt.compare(password, tc.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id:    tc.id,
      name:  tc.name,
      email: tc.email,
      role:  'vendor',
      tcId:  tc.id,
      code:  tc.code,
      type:  'tc',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    return res.json({ token, user: payload });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// ── GET /api/auth/me ───────────────────────────────────────────
// Returns the decoded token payload.
// Front-end can call this on startup to rehydrate session.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── POST /api/auth/logout ──────────────────────────────────────
// JWTs are stateless — just tell the client to discard the token.
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ── Middleware: requireAuth ────────────────────────────────────
// Reads "Authorization: Bearer <token>", verifies JWT, attaches
// decoded payload to req.user. Sends 401 on failure.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Middleware factory: requireRole ───────────────────────────
// Usage: requireRole('admin', 'pc')
// Must be composed after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { router, requireAuth, requireRole };
