// =============================================================
// VENDOR COST PORTAL — Auth routes + middleware
//
// Routes (mounted at /api/auth in server.js):
//   POST   /login                  → { token, user }       (password)
//   GET    /me                     → { user }              (requires JWT)
//   POST   /logout                 → { ok: true }          (client-side)
//   GET    /config                 → { microsoftEnabled }  (public)
//   GET    /microsoft/login        → 302 to Microsoft      (public)
//   GET    /microsoft/callback     → 302 back to app       (public)
//
// Microsoft auth is gated by the presence of AZURE_CLIENT_ID
// and AZURE_CLIENT_SECRET. When unset, /config reports disabled
// and the /microsoft/* routes return 503 — password login still
// works exactly as before.
//
// Access control for Microsoft logins: the authenticated email
// must match a row in the `users` table. No auto-provisioning.
//
// Exported middleware:
//   requireAuth           — 401 if no valid Bearer token
//   requireRole(...roles) — 403 if user's role isn't in the list
// =============================================================

'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const msal    = require('@azure/msal-node');
const db      = require('./database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

// ── Microsoft (Entra ID) config ────────────────────────────────
// Multi-tenant: authority defaults to /organizations (work/school
// accounts from any Entra tenant, no personal MS accounts).
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID     || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const AZURE_AUTHORITY     = process.env.AZURE_AUTHORITY     || 'https://login.microsoftonline.com/organizations';
const OAUTH_REDIRECT_URI  = process.env.OAUTH_REDIRECT_URI  || '';

const MICROSOFT_ENABLED = !!(AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && OAUTH_REDIRECT_URI);

let msalClient = null;
if (MICROSOFT_ENABLED) {
  msalClient = new msal.ConfidentialClientApplication({
    auth: {
      clientId:     AZURE_CLIENT_ID,
      clientSecret: AZURE_CLIENT_SECRET,
      authority:    AZURE_AUTHORITY,
      // Multi-tenant apps must opt-in to validating non-home-tenant issuers
      knownAuthorities: [],
    },
  });
  console.log(`[auth] Microsoft (Entra) auth enabled — authority: ${AZURE_AUTHORITY}`);
} else {
  console.log('[auth] Microsoft (Entra) auth disabled — set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, OAUTH_REDIRECT_URI to enable');
}

// Scopes for ID-token-only login (email + profile).
const OAUTH_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

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

    const token = issueToken(internalUserPayload(internalUser));
    return res.json({ token, user: jwt.decode(token) });
  }

  // 2. Check trading companies
  const tc = db
    .prepare('SELECT id, code, name, email, password_hash FROM trading_companies WHERE email = ?')
    .get(email);

  if (tc) {
    const valid = await bcrypt.compare(password, tc.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueToken(tcPayload(tc));
    return res.json({ token, user: jwt.decode(token) });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// ── GET /api/auth/me ───────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ── GET /api/auth/config ───────────────────────────────────────
// Public endpoint the login screen hits to decide whether to
// render the "Sign in with Microsoft" button.
router.get('/config', (req, res) => {
  res.json({ microsoftEnabled: MICROSOFT_ENABLED });
});

// ── GET /api/auth/microsoft/login ──────────────────────────────
// Kicks off the OIDC authorization-code flow. We sign a short-
// lived JWT to use as `state` (CSRF protection, stateless).
router.get('/microsoft/login', async (req, res) => {
  if (!MICROSOFT_ENABLED) return res.status(503).send('Microsoft auth is not configured');

  try {
    const state = jwt.sign({ n: cryptoRandom() }, JWT_SECRET, { expiresIn: '10m' });
    const url = await msalClient.getAuthCodeUrl({
      scopes:      OAUTH_SCOPES,
      redirectUri: OAUTH_REDIRECT_URI,
      state,
      prompt:      'select_account',
    });
    res.redirect(url);
  } catch (err) {
    console.error('[auth] microsoft/login error:', err);
    res.status(500).send('Failed to start Microsoft sign-in');
  }
});

// ── GET /api/auth/microsoft/callback ───────────────────────────
// Microsoft redirects here with ?code=...&state=...
// We exchange the code for an ID token, match the email against
// the `users` table, and redirect to /#auth=<jwt> so the frontend
// can pick up the token.
router.get('/microsoft/callback', async (req, res) => {
  if (!MICROSOFT_ENABLED) return res.status(503).send('Microsoft auth is not configured');

  const { code, state, error, error_description } = req.query;

  if (error) {
    return sendAuthError(res, `Microsoft returned an error: ${error_description || error}`);
  }
  if (!code || !state) {
    return sendAuthError(res, 'Missing code or state in callback');
  }

  // Verify state (CSRF / replay protection)
  try { jwt.verify(state, JWT_SECRET); }
  catch { return sendAuthError(res, 'Invalid or expired sign-in state — please try again'); }

  let claims;
  try {
    const result = await msalClient.acquireTokenByCode({
      code,
      scopes:      OAUTH_SCOPES,
      redirectUri: OAUTH_REDIRECT_URI,
    });
    claims = result.idTokenClaims || {};
  } catch (err) {
    console.error('[auth] microsoft token exchange failed:', err);
    return sendAuthError(res, 'Microsoft sign-in failed during token exchange');
  }

  // Extract email. In order of preference: `email` claim, `preferred_username`, `upn`.
  const email = (claims.email || claims.preferred_username || claims.upn || '').toLowerCase().trim();
  if (!email) return sendAuthError(res, 'Microsoft did not return an email address');

  // Gate access: email must exist in our `users` table (trading companies
  // are password-only — they don't have Microsoft accounts).
  const user = db
    .prepare('SELECT id, name, email, role, department_id FROM users WHERE lower(email) = ?')
    .get(email);

  if (!user) {
    return sendAuthError(res,
      `No account provisioned for ${email}. Contact an admin to be added to the portal.`);
  }

  const token = issueToken(internalUserPayload(user));
  // Fragment (#) keeps the token out of server access logs
  res.redirect(`/#auth=${encodeURIComponent(token)}`);
});

// ── Helpers ────────────────────────────────────────────────────
function internalUserPayload(u) {
  return {
    id:           u.id,
    name:         u.name,
    email:        u.email,
    role:         u.role,
    departmentId: u.department_id || null,
    type:         'user',
  };
}

function tcPayload(tc) {
  return {
    id:    tc.id,
    name:  tc.name,
    email: tc.email,
    role:  'vendor',
    tcId:  tc.id,
    code:  tc.code,
    type:  'tc',
  };
}

function issueToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function cryptoRandom() {
  return require('crypto').randomBytes(16).toString('hex');
}

function sendAuthError(res, message) {
  res.status(401).send(`<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:0 24px;color:#1e293b">
    <h2 style="color:#b91c1c">Sign-in failed</h2>
    <p>${escapeHtml(message)}</p>
    <p><a href="/">Back to login</a></p>
  </body></html>`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Middleware: requireAuth ────────────────────────────────────
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
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { router, requireAuth, requireRole };
