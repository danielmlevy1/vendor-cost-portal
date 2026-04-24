# Vendor Cost Portal — CLAUDE.md

## What We're Building

A **FOB vendor costing, comparison, and program placement portal** for a garment sourcing company (HighLife LLC). Buyers create costing programs, assign trading companies (TCs) to quote styles by COO, compare quotes, and place styles. Design feeds in through handoffs (Excel uploads); sales requests convert to programs; factories are tracked through capacity and delivery plans.

Target deployment: **Azure App Service** (Linux, Node 20, SQLite on persistent volume). Currently in dev/QA.

---

## Tech Stack

- **Backend:** Node.js 20+, Express 4, `better-sqlite3` (synchronous SQLite — no async DB calls), JWT auth, bcrypt, nodemailer, node-cron
- **Frontend:** Vanilla JS — no framework. Three large IIFE modules: `app.js`, `views-admin.js`, `views-vendor.js`. `api.js` is the client cache layer.
- **Auth:** Password-based (bcrypt) + optional Microsoft Entra ID (OIDC). JWT (8h). Two user classes: internal staff (table: `users`) and trading companies (table: `trading_companies`).
- **DB:** Single SQLite file at `data/portal.db`. Schema applied via `schema.sql` on startup. No ORM.

---

## Dev Setup

```sh
PORT=3002 node server.js          # dev convention (avoid conflict with other local apps)
node server.js                    # defaults to port 3000
```

Default seed credentials (all in `database.js`):

| Role | Email | Password |
|------|-------|----------|
| admin | admin@company.com | admin123 |
| pc | pc@company.com | pc123 |
| planning | planning@company.com | plan123 |
| planning (sales) | sales@company.com | sales123 |
| design | design@company.com | design123 |
| tech_design | techdesign@company.com | tech123 |
| vendor (TC) | `<code>@vendor.com` | vendor123 |

TC emails follow `<code>@vendor.com` pattern (e.g. `shk@vendor.com`, `az@vendor.com`). Full list in `database.js`.

---

## Architecture

### SPA Routing

`app.js` owns routing entirely. No URL hash or `history.pushState` — routes live only in memory:

```js
const state = { route: 'programs', routeParam: null, user: null, tcColOrder: {} };
```

`navigate(route, param)` → warms cache via `API.preload.X()` → calls `renderApp()` → `renderSidebar()` → `renderRoute()`.

**Route handler structure in `renderRoute()`** (the big if/else chain, ~line 366):
```
if (isAdmin || isPC)    → admin/PC routes
else if (isDesign)      → design routes
else if (isTechDesign)  → tech_design routes
else if (isProdDev)     → prod_dev routes
else if (isPlanning)    → planning/sales routes
else                    → vendor/TC routes
```
Each branch has explicit `if (route === 'X')` cases. Unrecognized routes fall to `renderDashboard`. **When adding a new route, add it to every applicable role branch.**

### Preload-Then-Render Pattern

All API data is cached in `API.cache.*` before rendering. Calls are synchronous reads from cache; fetches are async. `navigate()` always calls the right `API.preload.X()` before painting.

```js
else if (route === 'design-handoff' || route === 'handoff-detail')
  await API.preload.designHandoff();
```

### Cache-Busting

All four script/CSS tags in `index.html` share a single version string (`?v=125` currently). **Bump this number whenever any JS or CSS file changes** to avoid stale-browser-cache bugs.

### IIFE Modules

All three frontend files export a single namespace via IIFE:
```js
const AdminViews = (() => { /* ... */ return { renderDashboard, renderPrograms, ... }; })();
const VendorViews = (() => { /* ... */ return { renderPrograms, renderMyStyles, ... }; })();
var App = (() => { /* ... */ return { navigate, releaseBatch, ... }; })();
```
`App` is `var` (not `const`) to avoid TDZ ReferenceError if the IIFE throws.

---

## Role System

| Role | `isX` flag | What they see |
|------|-----------|---------------|
| `admin` | `isAdmin` | Everything — programs, cost, staff, pending changes, settings |
| `pc` | `isPC` | Same as admin minus staff management and pending-changes approval |
| `planning` | `isPlanning` | Programs, cost summaries, design handoffs, sales requests, recost queue, factories |
| `planning` + `departmentId='dept-sales-price'` | `isSalesMgmt` | Same as planning but gets full `cost-summary` view instead of `design-costing` |
| `design` | `isDesign` | Design handoffs, design changes, programs (costing view), factories |
| `tech_design` | `isTechDesign` | Design handoffs, design changes, programs (costing view), recost queue |
| `prod_dev` | `isProdDev` | Fabric standards, factories |
| `vendor` (TC login) | else branch | My Programs, All Styles, My Company, My Factories, Capacity Plans, Delivery Plans |

TC users: JWT payload has `role: 'vendor'`, `tcId: 'tc_xxx'`, `code: 'SHK'`. Internal users: no `tcId`.

---

## Key Files

| File | Size | Purpose |
|------|------|---------|
| `server.js` | ~5KB | Express app, static serving, SMTP digest cron |
| `auth.js` | ~9KB | Login routes, JWT, Microsoft Entra ID OIDC flow |
| `database.js` | ~15KB | SQLite init, schema apply, seed data, idempotent `addColumn()` migrations |
| `schema.sql` | ~31KB | Full schema (30+ tables, all IF NOT EXISTS) |
| `routes.js` | ~50KB | Core REST: programs, styles, submissions, placements, customer buys, assignments |
| `routes-supporting.js` | ~109KB | Supporting REST: TCs, fabric library, design handoffs, sales requests, recost, design changes, pending changes, factories, delivery/capacity plans, performance |
| `api.js` | ~58KB | Client API layer — 33 namespaces, preload helpers, `calcLDP()`, `parseCSV()` |
| `app.js` | ~391KB | SPA controller — state, navigate(), renderApp(), renderSidebar(), renderRoute(), 150+ App methods |
| `views-admin.js` | ~340KB | All internal/admin screens — renderDashboard, renderPrograms, renderCostSummary, renderDesignHandoff, renderHandoffDetail, renderSalesRequests, renderPerformance, renderCapacityPlan, etc. |
| `views-vendor.js` | ~41KB | TC screens — renderPrograms, renderProgramStyles, renderMyStyles, renderMyCompany, renderMyFactories |
| `styles.css` | ~86KB | Full design system — light mode default, Inter font, Pantone 295C navy `#002855` primary, coral `#e04e39` accent |
| `index.html` | Shell | SPA shell — 4 script tags, login form, modal overlay, sidebar toggle |

---

## Database

- **Engine:** SQLite via `better-sqlite3` (synchronous — no Promises in DB layer)
- **WAL mode** enabled; foreign keys OFF (enforced at API layer)
- **IDs:** `Date.now().toString(36) + Math.random().toString(36).slice(2,7)` — sortable base36 strings
- **Timestamps:** ISO-8601 strings (`new Date().toISOString()`)
- **JSON fields:** Complex arrays/objects stored as JSON strings (e.g. `styles_list`, `batch_releases`, `assigned_tc_ids`)
- **Migrations:** Idempotent `addColumn(table, column, def)` helper in `database.js` — safe to re-run. Add new columns in versioned migration blocks (currently v12)

### Key Tables

| Table | Description |
|-------|-------------|
| `programs` | Costing programs (Draft → Costing → Placed/Cancelled) |
| `styles` | Styles within a program. `released_batch`, `source_handoff_id` link to design handoffs |
| `submissions` | TC cost quotes (FOB, factory cost, COO, status: submitted/flagged/accepted/skipped) |
| `placements` | Final TC assignment per style after acceptance |
| `assignments` | Program ↔ TC linkage (with per-assignment COO list) |
| `design_handoffs` | Design team batch uploads. `styles_list` (JSON), `batch_releases` (JSON), `assigned_tc_ids` (JSON) |
| `sales_requests` | Sales team requests; convert to programs via `/convert` endpoint |
| `recost_requests` | Style re-costing requests (pending_sales → pending_production → released/rejected) |
| `design_changes` | Design revision history (per-style, status: pending/confirmed) |
| `factories` | Factory profiles (factory/exporter/pay-to entities, FOB/LDP terms, first-sale flag) |
| `capacity_plans` | Per-program vendor production plans (draft/submitted/approved/rejected) |
| `delivery_plans` | Per-program delivery windows and shipment lines |

---

## Current State (as of 2026-04-24)

### Working / Shipped
- Full costing workflow: program → styles → assign TCs → vendor quotes → compare → place
- Cost Summary with LDP calculation, margin recap, recost requests
- Design Handoff system: Excel upload → batch release to programs → TC grey-out preview
- Sales Requests: create → assign vendors → convert to program → batch-review flow
- Design Changes: tracked per style, pending/confirmed status in Cost Summary
- Revision history: append-only FOB/FC change log per submission
- Performance dashboard: cross-program vendor & factory analytics
- Capacity Plans: TC submits production capacity; admin approves/rejects
- Delivery Plans: post-placement shipment scheduling
- Fabric Standards: library, requests, packages, vendor preview
- Factories: full CRUD with pending-changes approval workflow
- Microsoft Entra ID (Azure SSO) — wired, gated by env vars
- Daily SMTP digest (node-cron, 10am HKT)

### Uncommitted Work (545 lines changed, 10 files)
The batch release feature + several QA fixes are built but **not yet committed**:
- **Batch Release:** Design handoffs now have per-style `batchLabel` fields; `POST /api/design-handoffs/:id/release-batch` creates styles in the linked program and a `batch-review` Sales Request; `renderHandoffDetail` shows per-style label inputs + toolbar filter; TC views show unreleased styles greyed out
- **Sales nav fix:** `isPlanning` route handler now handles `''`, `'vendor-home'`, `'my-styles'` (maps to `renderPrograms`) instead of falling through to dashboard
- **Batch release UX:** Toolbar renamed "Release batch:"; 2-step instruction added; per-style label inputs now fire `_hdUpdateReleaseCount` live on `oninput`
- **Cache-buster at v=125**

### Known Open Items / Deferred
1. **Consolidate Design Changes + Recost Queue** into one page (was interrupted)
2. **History ticker on styles** — investigate which styles are missing change history wiring
3. **FOB history ticker** — extend to log style-level field updates (name, fabric, qty, sell price, duty, freight)

---

## Important Patterns & Conventions

### Adding a New Route
1. Add preload in `navigate()`'s preload block (api.js)
2. Add case in every applicable role branch of `renderRoute()` (app.js ~line 366)
3. Add nav item to applicable sidebar branches in `renderApp()` (app.js ~line 286)
4. Add render function in `views-admin.js` or `views-vendor.js`
5. Export from the views namespace
6. Bump cache-buster in `index.html`

### Adding a DB Column
Use `addColumn()` in a new versioned block in `database.js`:
```js
// v13
addColumn('table_name', 'new_column', 'TEXT');
```
Also add to `schema.sql` so fresh installs pick it up.

### JSON Fields on Handoffs
`handoffFromRow()` in `routes-supporting.js` lazy-stamps `id` and `batchLabel` on each style in `styles_list` on first read, writes back immediately. This ensures stable style IDs for `batch_releases` references.

### API Cache Updates
After any mutation, update both `cache.handoffMap[id]` and `cache.designHandoffs[idx]` (or the equivalent array + map for other resources). See `DesignHandoffs.update()` in `api.js` as a reference pattern.

### `isSalesMgmt`
```js
const isSalesMgmt = u.role === 'planning' && u.departmentId === 'dept-sales-price';
```
Sales Management users get `cost-summary` view (not `design-costing`) when opening programs. Computed locally — not a separate role in the DB.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port (use 3002 in dev) |
| `DB_PATH` | `data/portal.db` | SQLite file path |
| `JWT_SECRET` | `dev-secret-change-in-prod` | **Change before deploy** |
| `JWT_EXPIRY` | `8h` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hash cost |
| `AZURE_CLIENT_ID` | — | Enables Microsoft sign-in |
| `AZURE_CLIENT_SECRET` | — | Microsoft sign-in secret |
| `AZURE_AUTHORITY` | `https://login.microsoftonline.com/organizations` | Entra tenant |
| `OAUTH_REDIRECT_URI` | — | Microsoft callback URL |
| `SMTP_HOST/PORT/USER/PASS` | — | Email digest config |
| `FROM_EMAIL` | `SMTP_USER` | Digest sender address |
| `PD_EMAIL` | — | Product development reply-to |
| `EMAIL_TIMEZONE` | `Asia/Hong_Kong` | Digest send timezone |
| `CRON_TIME` | `0 10 * * *` | Digest schedule (cron syntax) |

See `.env.example` for a template.

---

## Deployment Target

Azure App Service (Linux, Node 20 LTS). Guide at `docs/DEPLOY.md`. Key points:
- `PORT=8080` on Azure
- `DB_PATH=/home/data/portal.db` (persistent volume)
- Set `JWT_SECRET` to a strong random string
- Backup SQLite to Azure Blob Storage on a schedule
- Free App Service Managed Certificate for HTTPS
