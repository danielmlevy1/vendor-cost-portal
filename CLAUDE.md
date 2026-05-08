# CLAUDE.md — Vendor Cost Portal Project Guidance

This file orients Claude (any version, any account) to this project. It's the long-term companion to the session handoff doc (`SESSION_HANDOFF_*.md` files in `/docs/`). Read this first, then the latest session handoff for current state.

This file is intentionally evergreen — covers project bones, not in-flight work. If sub-phase progress or current bugs are what you need, read the latest session handoff.

---

## Project at a glance

**Vendor Cost Portal (VCP)** — internal fashion FOB costing tool. **First app in a service-oriented platform** (Finance and Operations apps coming next).

Workflow: Design hands off styles → Sales/Planning project quantities + sell prices → Production Coordinator (PC) assigns to Trading Companies (TCs) → Vendors quote FOBs → PC places styles → Customers buy.

**Owner:** Daniel
**Path:** `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/`
**Server (dev):** `npm start`, port 3002
**Database (dev):** SQLite at `data/portal.db`
**Production target:** Azure App Service (or similar) + Azure SQL — see "Deployment & security posture" below

---

## Tech stack

**Current (dev):**
- Node.js + Express + better-sqlite3 (SQLite)
- Vanilla JS SPA (NO React/framework)
- JWT auth + Microsoft Entra scaffolding (currently disabled by default)
- No client build step; cache busting via `?v=NNN` on script tags in `index.html`

**Production target:**
- Node.js + Express + `mssql` driver (Azure SQL)
- Same vanilla JS SPA
- Microsoft Entra SSO (internal users) + Entra B2B guest accounts (vendors)
- Hosted on Azure (specific service TBD at migration time)

The migration from SQLite/JWT-only to Azure SQL/Entra is a v1.0 ship blocker scheduled BEFORE Phase 3. See "Deployment & security posture" for full detail.

---

## Core architecture

### Roles
Admin, PC, Sales, Sales Mgmt (planning + dept-sales-price), Planning, Design, Tech Design, Vendor

### Field ownership (LOCKED for v1)
- **Design** owns: Style#, Style Name, Fabrication, Batch label
- **Sales/Planning** own: Proj Qty, Proj Sell, Notes
- **PC** owns: TC assignments, COO, FOB-related, Placements
- **Admin** can edit anything (with confirmation popup for non-owned fields)
- **Sales Mgmt** sees full view but is read-only on all editors
- **PC LOCKED from editing qty/sell in v1**

### Key data model
- `programs` → `styles` (1:many)
- `programs` ↔ `assignments` ↔ `trading_companies` (TC assignments)
- `styles` → `submissions` (FOB quotes from each assigned TC)
- `styles` → `placements` (final TC selection)
- `sales_requests` ← parallel SR records, with `styles[]` JSON column for batch-review path
- `design_changes` — captures style edits post-handoff (Phase 3 reads this)
- `user_permissions` (NEW, to be implemented) — see "Authorization" below

### Bidirectional sync (Pattern B) — Phase 2b.1
- `sales_requests.styles[]` JSON ↔ `styles` table for projQty, projSellPrice, notes
- Wrapped in db.transaction() — atomic
- **Critical:** SR JSON uses `notes` (lowercase). Styles table uses `sell_status_note`. Mirror code MUST explicitly map between them.
  - There should be a defensive comment block at the mirror function locations in `routes.js` and `routes-supporting.js` reinforcing this. If absent, add it.
- **Security note:** Both writes (SR-side and styles-side) must INDEPENDENTLY re-validate role permissions. Don't trust that "got to this endpoint" implies "can write the mirror."

---

## Deployment & security posture

VCP is the first of several internal apps that will form a service-oriented platform (Finance and Operations apps next). This shapes architecture decisions throughout. Read this section before suggesting any change to data access, auth, or hosting.

### Architecture
- VCP owns its own database. **No other app reads VCP's database directly.**
- Cross-app data access is via VCP's HTTP API only. Other apps call versioned endpoints (`/api/v1/...`); they never SELECT from VCP tables.
- Schema is internal; the API is the public contract.
- When designing new endpoints, separate "VCP-internal" routes from "external-facing" routes meant for cross-app consumers. External-facing routes are a contract — breaking changes are expensive.

### Hosting
- **Target:** Azure (specific service TBD at migration time — App Service most likely; Container Apps and VM also possibilities)
- **Current dev:** localhost, port 3002, SQLite
- **Production stack:** Node.js + Azure SQL on Azure App Service (or chosen alternative)

### Database trajectory
- **SQLite for dev (today). Azure SQL for production.**
- Migration scheduled **BEFORE Phase 3**, NOT at v1.0 cutover. Last-minute migration is high-risk (schema translation surfaces bugs, sync→async refactor across all DB calls, no time to find issues). Deliberate migration is bounded, recoverable work.
- **Dev environment migrates with prod** — no dev/prod database engine drift. Either run Azure SQL in dev too, or use local SQL Server in Docker.
- **Migration scope:**
  - Translate `schema.sql` to T-SQL (explicit types, NVARCHAR lengths, date handling)
  - Swap `better-sqlite3` for `mssql` driver — this is a SYNC → ASYNC refactor across every DB call site, not a search-and-replace
  - Re-validate idempotent migrations against Azure SQL syntax (PRAGMAs gone, ALTER patterns differ)
  - Port test data
  - Smoke test the full app
  - Update connection management (connection pooling now matters)
- **Estimate:** 3-5 days focused work. Don't combine with feature work.

### Authentication
- **Internal users:** Microsoft Entra SSO via the corporate tenant
- **External vendors:** Entra B2B guest accounts. Vendors must have a Microsoft account (or create one specifically for VCP access).
- **No local credentials in v1.0.** Email-OTP fallback via Entra External Identities is available if a critical vendor blocks on B2B; documented but not enabled by default.
- Existing JWT scaffolding integrates with Entra rather than being replaced. Treat the Entra integration work as augmenting, not rewriting.

### Authorization
**Authentication ≠ authorization.** SSO confirms identity. Code enforces permissions. Every mutation and scoped-read endpoint must check both. SSO alone does not stop a Sales user from PATCHing a PC field via curl.

**Permission model:** DB table maps user → role → scope. Suggested shape:

| Field | Purpose |
|---|---|
| `user_email` | Joined to Entra identity from JWT claims |
| `role` | admin / pc / sales / sales_mgmt / planning / design / tech_design / vendor |
| `trading_company_id` | Required for vendor role; nullable otherwise |
| `department_id` | Existing field — handles Sales Mgmt distinction |
| `active` | Boolean for offboarding without deleting |
| `created_at`, `created_by`, `updated_at` | Audit trail |

**Enforcement rules:**
- Every mutation endpoint validates the role's `allowedFields` server-side (existing pattern at `routes.js:936-940` is the model — extend to all mutation endpoints).
- Every read endpoint that returns vendor-scoped data filters by `trading_company_id` SERVER-SIDE in the WHERE clause. **Never filter client-side for security purposes.** A vendor with curl bypasses any client-side filter trivially.
- The bidirectional sync (Pattern B) writes to two places — both writes must independently re-validate role permissions, not trust the entry point.

### Threat model
- **Primary threat:** authenticated insider with the wrong role (curious Sales person, vendor probing other vendors' data, ex-employee with stale access). This is the threat the role+scope model exists to stop.
- **Not the primary threat:** anonymous internet attacker (mitigated by SSO requirement).
- **Compromised account:** mitigated by MFA via Entra Conditional Access. Must be enforced before production cutover.
- **Insider with malicious intent:** mitigated by audit logging (NOT YET IMPLEMENTED — see open questions).

### Cross-app authentication
When other platform apps (Finance, Operations) call VCP's API, they authenticate via Entra service principals or managed identities. Not shared secrets. Not API keys checked into config. Not embedded credentials.

### Security gates before production cutover
None of these can be skipped. Each is a v1.0 ship blocker:

1. **Authorization audit pass** — every endpoint verified for server-side role + scope enforcement (curl-based test, not just UI test)
2. **Roles/permissions table** implemented and integrated with all endpoints
3. **Entra SSO + B2B integration** replacing/augmenting current JWT auth
4. **Vendor data isolation verified end-to-end** with multi-vendor test accounts
5. **SQL injection audit** — confirm all queries are parameterized; no string-concatenated SQL anywhere in `routes.js` / `routes-supporting.js`
6. **Secrets management** — JWT secret and any other secrets moved to Azure Key Vault, not `.env` or hardcoded fallbacks
7. **MFA enforcement** via Entra Conditional Access policy
8. **Audit logging** implemented for all mutations (see open question)

### Open questions in this domain
- **Audit logging design:** what events to log, retention policy, where stored (separate audit DB? Azure Log Analytics?). Not yet decided. v1.0 vs v1.1 also undecided.
- **Specific Azure service:** App Service vs Container Apps vs VM. Decide at migration time based on scaling and config needs.
- **Entra B2B licensing:** verify pricing model with whoever owns Azure billing before vendor onboarding at scale. Surprises here are bad.
- **FK enforcement** (see "Known infrastructure gaps" below) — flipping ON during the Azure SQL migration is a natural moment to make that decision.

---

## Critical conventions

### Cache busting
EVERY client-side change requires bumping `?v=NNN` in `index.html`. Without bump, browsers serve stale code. Current value lives in the latest session handoff (it ages within hours).

### Database safety
- ALWAYS backup before destructive operations
- Stop server before raw SQL scripts
- Wrap multi-statement SQL in BEGIN TRANSACTION / COMMIT
- Verify with row counts before/after
- See "Known infrastructure gaps" below for FK constraint state
- After Azure SQL migration: backup discipline shifts to Azure SQL automated backups + point-in-time restore. Update this section then.

### Sub-phase shipping
Big phases (e.g., Phase 2b) split into 2b.1, 2b.2, 2b.3. Each ships independently. Verify + tag + use in real workflow before approving next sub-phase.

### Tag workflow
```
git status
git add .
git commit -m "Phase X.Y — description (vNNN)"
git push origin main
git tag phase-X-Y-complete
git push origin phase-X-Y-complete
```

For latest tag list and phase-by-phase status, see latest session handoff.

---

## Known infrastructure gaps (read before suggesting changes that depend on them)

### Foreign key enforcement is OFF
Current SQLite config uses `PRAGMA foreign_keys = OFF`. Cascading deletes do not fire. Delete order in scripts is maintained for forward-compatibility only.

**Status:** Will be revisited during Azure SQL migration — that's the natural moment to enable referential integrity. Until then:
- Don't write code that assumes cascading deletes will fire
- Don't write code that assumes FK violations will be caught at insert
- Use the existing uniqueness constraint pattern (UNIQUE INDEX) instead of FK-based constraints when needing data integrity

### No automated test harness
There is no Jest, Mocha, or other test framework configured. All testing is manual:
- UI smoke tests (click through workflows)
- SQL queries to verify database state
- Curl-based tests for security/authorization verification (especially vendor data isolation)

When asked to "add tests" or "verify with tests," confirm with Daniel whether to:
- Add a minimal harness (decision pending — but recommended before authorization audit pass, since auth tests are exactly what regress silently)
- Continue with manual smoke tests
- Document the manual smoke test as a checklist instead

### Phase status tracking
This file does NOT track which phases are complete — that goes stale fast. See latest session handoff for current shipped/in-flight/pending status. Multiple phases have shipped (Phase 1 through Phase 2b.1) at the time this file was last refreshed.

---

## File map (key files only)

| File | Purpose |
|---|---|
| `routes.js` | Main API routes |
| `routes-supporting.js` | SR + handoff endpoints |
| `database.js` | SQLite + migrations (idempotent) |
| `schema.sql` | Schema definition |
| `app.js` | Client app shell |
| `views-admin.js` | Admin/PC/Cost Summary views (heavy) |
| `views-vendor.js` | Vendor portal |
| `index.html` | SPA shell + cache buster |
| `data/portal.db` | The database (dev only — production will be Azure SQL) |

**Heavy functions to know:**
- `routes.js:936-940` — `allowedFields` per role for PATCH /api/styles/:id (this pattern needs to extend to ALL mutation endpoints — see Authorization)
- `views-admin.js:1367-1505` — `renderCostSummary`
- `views-admin.js:1509-2188` — `buildCostMatrix` (~680 lines)
- `views-admin.js:1585-1613` — Repeat style detection logic
- `app.js:2034-2050` — `fmtBlurQty` and `fmtBlurCurrency`

(Line numbers may drift as code changes. Use these as starting points, not absolutes.)

---

## Working with Daniel

He values:
- Honest assessments over pleasing answers
- Push-back over confirm-bias
- Real progress over performative progress
- Fatigue management — long days are real, mistakes accumulate, sometimes the right answer is "stop"

When he's wrong or rushed, say so. When he's tired, suggest stopping. When the work would still be there tomorrow, don't push through.

**Pattern:** "Code applied" ≠ "verified working." Self-reports from Claude have been wrong before. Always insist on smoke tests after a build, including database queries to confirm state. For security-related changes, smoke tests must include curl-based verification — UI tests don't catch authorization bypasses.

---

## Current state pointer

For current state, in-flight work, active bugs, and active to-do list, read the latest `SESSION_HANDOFF_YYYY-MM-DD.md` in `/docs/`.

This CLAUDE.md is intentionally stable — it covers project bones. The session handoff covers what's happening right now.

---

*If the project state has materially changed (architecture changes, new domain concepts, new roles, schema overhauls, hosting/auth/security posture), refresh this file. If only sub-phase work has happened, update the session handoff instead.*
