# Vendor Cost Portal — SQLite Migration Progress

## Where We Left Off
*(Updated 2026-04-24)*

- **Backend + frontend SQLite migration:** complete
- **Browser testing phase:** in progress
- **Batch release feature for design handoffs:** complete — includes TC grey-out when already released, duplicate label validation, and live label editing UX
- **Environment:** moved from local VS Code to GitHub Codespaces; server runs on port 3002
- **Sales routing bug:** My Programs and All Styles both land on the dashboard instead of their correct views — not yet fixed
- **Next up:**
  1. Fix Sales routing bug
  2. Consolidate Design Change Log + Recost Queue into a unified view
  3. Fix missing history ticker on style rows
  4. Extend FOB history ticker to log all style updates (not just FOB changes)

---


## Overview
Migration of the Vendor Cost Portal from a fully client-side, `localStorage`-backed
data layer (`db.js` / `DB.*` namespace) to a server-backed REST architecture
powered by SQLite + Express + JWT auth.

## What Was Built

### Backend
- **SQLite database** ([data/portal.db](../data/portal.db) at runtime) with full
  relational schema defined in [schema.sql](../schema.sql).
- **Server-side data layer** in [database.js](../database.js) — opens the DB,
  applies the schema, and seeds reference data (users, trading companies, COO
  rates, internal programs, brand-tier margins, etc.) on first run.
- **Authentication** in [auth.js](../auth.js):
  - `POST /api/auth/login` — bcrypt password check against `users` and
    `trading_companies` tables, issues a JWT (8h expiry by default).
  - `GET /api/auth/me` — rehydrates session from token.
  - `POST /api/auth/logout` — client-side token discard.
  - `requireAuth` / `requireRole(...)` middleware for protected routes.
- **REST API — ~98 endpoints** split across:
  - [routes.js](../routes.js) — core resources (programs, styles, submissions,
    placements, customer assignments, customer buys, design handoffs, sales
    requests, recost requests, design changes, etc.)
  - [routes-supporting.js](../routes-supporting.js) — supporting resources
    (trading companies, COO rates, customers, departments, users, internal
    programs, brand-tier margins, fabric library, style links, cost history,
    cell flags, submission revisions, pending changes).
  - [auth.js](../auth.js) — login / me / logout.

### Frontend
- **API layer** ([api.js](../api.js)) — `API.*` namespace mirroring the old
  `DB.*` shape so call sites could be migrated namespace-by-namespace.
  - JWT stored in `localStorage` under `vcp_token`; auto-cleared on 401.
  - Synchronous in-memory `cache` populated by `preload.*` helpers.
  - Async mutators (`upsert`, `delete`) keep cache consistent with server.
- **Full frontend migration complete** — every `DB.*` call site in
  [app.js](../app.js), [views-vendor.js](../views-vendor.js), and
  [views-admin.js](../views-admin.js) has been replaced with the API
  equivalent. Recent commits (Tier 3 → Tier 6) walked the migration through
  in layers; final commit (`8f74343`) confirms zero remaining `DB.*` calls.

## Current Status
**Browser testing phase.** The server runs, the schema applies cleanly, and
the frontend boots against the live API. Now exercising every screen
end-to-end in a real browser to surface any bugs introduced by the migration
(stale cache reads, missing preload calls, payload-shape mismatches between
the old `DB` API and the new REST API, auth/role gating, etc.).

## What's Next
1. **Fix any bugs surfaced during browser testing** — patch as found.
2. **Deploy to Azure App Service (Linux, Node 20).** The codebase is
   already wired for this — see [DEPLOY.md](DEPLOY.md):
   - Microsoft Entra ID sign-in is coded up as a feature flag — dormant
     locally (no env vars set), activates in Azure once
     `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `OAUTH_REDIRECT_URI`
     are set.
     - Multi-tenant (work/school accounts from any org).
     - Email must match a row in the `users` table — no auto-provisioning.
     - Trading companies stay on password auth forever.
   - SQLite persists on `/home/data/portal.db` (Azure's built-in
     persistent volume).
   - Pending: custom domain + managed TLS cert, daily DB backup job,
     rotating the seed credentials before go-live.
