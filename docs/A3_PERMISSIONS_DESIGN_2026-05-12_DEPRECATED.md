---

# ⚠️ STATUS: SUPERSEDED — DEPRECATED

**Status changed:** May 14, 2026
**Reason:** Pivoted from CSV-upload directory model to **Entra security groups → VCP role** mapping after consultation with IT. Entra groups are now the source of truth for role assignment; VCP reads the `groups` claim from the SSO token at login.

**This document is retained as historical reference only.** The structural concepts (3-layer override → directory → mapping resolution, phased rollout) carry forward conceptually, but the implementation details — CSV upload flow, department-string mapping, separate `directory_users` table as source-of-truth — are no longer applicable.

**Next steps:**
1. Pending IT meeting — see `IT_MEETING_PREP_VCP_ENTRA_2026-05-14.md` in this folder for the question checklist
2. Once IT answers P0 questions, A3 design doc **v2** will be drafted reflecting the Entra-groups approach
3. A3 Phase A3.1 implementation will follow v2, not v1 (the v1 prototype implementation was discarded May 14 before commit)

**Do not implement against this document.** It describes a design path that is no longer being pursued.

---

# A3 — Permissions & Directory Design (v1 — superseded)

**Date:** May 12, 2026
**Stage A ship blocker #3:** Roles/permissions table — design + integrate
**Status:** ~~DESIGN — awaiting Daniel approval before implementation begins~~ → **SUPERSEDED** (see header)
**Author:** Daniel + web Claude

---

## Goal

Replace the current JWT-inline role with a directory-backed, override-aware permission resolution that:

1. Sources internal user identity from the company directory (CSV upload now, Microsoft Graph later)
2. Maps Department → VCP role automatically for ~99% of users
3. Allows manual `admin` and `sales_mgmt` overrides for the ~10% that aren't auto-mappable
4. Fails closed on unmapped departments (no silent defaults)
5. Supports manual maintenance for new hires / departures without requiring a full CSV re-upload
6. Survives the eventual Entra SSO integration without rework

**Scope note:** This is internal-user design only. Vendors continue using the existing JWT login flow for Stage A. When Stage B approaches, B2B guest auth will be added without changing the directory layer.

---

## Three Tables

### `directory_users` — the company directory

| Column | Type | Notes |
|---|---|---|
| `email` | TEXT PRIMARY KEY | Normalized lowercase on insert |
| `first_name` | TEXT NOT NULL | |
| `last_name` | TEXT NOT NULL | |
| `department` | TEXT NOT NULL | Exact string from directory; joins to `department_role_map.department` |
| `position` | TEXT | Informational; not used in role resolution v1 |
| `source` | TEXT NOT NULL | `'csv_upload'` or `'manual'` |
| `active` | BOOLEAN NOT NULL DEFAULT 1 | Soft-delete flag |
| `created_at` | TIMESTAMP NOT NULL | |
| `updated_at` | TIMESTAMP | |
| `last_synced_at` | TIMESTAMP | When last CSV upload touched this row; NULL if manual-only |

### `permission_overrides` — the curated 10%

| Column | Type | Notes |
|---|---|---|
| `email` | TEXT PRIMARY KEY | FK to `directory_users.email` |
| `role` | TEXT NOT NULL | One of: `admin`, `pc`, `sales`, `sales_mgmt`, `planning`, `design`, `tech_design` (vendor excluded — handled separately) |
| `reason` | TEXT NOT NULL | Required — forces documentation of *why* the override exists |
| `created_at` | TIMESTAMP NOT NULL | |
| `created_by` | TEXT NOT NULL | Email of the admin who added the override |
| `updated_at` | TIMESTAMP | |
| `updated_by` | TEXT | |

**Expected size:** ~10-15 rows total (5 admin + 3-5 sales_mgmt + small headroom for special cases).

### `department_role_map` — the mapping logic

| Column | Type | Notes |
|---|---|---|
| `department` | TEXT PRIMARY KEY | Exact string match from `directory_users.department` |
| `role` | TEXT NOT NULL | One of the seven internal roles |
| `created_at` | TIMESTAMP NOT NULL | |
| `updated_at` | TIMESTAMP | |
| `updated_by` | TEXT | |

**Why a table, not hardcoded:** Departments change (rename, split, merge). Admin should be able to add a mapping when a new department appears in the directory without a code change.

**Expected size:** ~10-20 rows, one per real department in the company.

---

## Login Resolution Logic

When a user authenticates and we need to determine their VCP role:

```
Input: user_email

Step 1: directory_users lookup
  - SELECT * FROM directory_users WHERE email = LOWER(user_email) AND active = 1
  - If no row: DENY ("User not found in directory or deactivated")
  - Else: continue with directory row

Step 2: permission_overrides lookup (highest priority)
  - SELECT role FROM permission_overrides WHERE email = LOWER(user_email)
  - If row exists: role = override.role → DONE
  - Else: continue

Step 3: department_role_map lookup
  - SELECT role FROM department_role_map WHERE department = directory.department
  - If row exists: role = mapping.role → DONE
  - Else: DENY ("Department '{dept}' has no role mapping. Contact admin.")
```

**Properties of this design:**
- **Override wins.** Always. Even if the department also maps. This is deliberate — overrides are the curated exception layer.
- **Unmapped department = denied access.** No silent fallback. New marketing department doesn't auto-get read-only Cost Summary access.
- **Inactive = denied access.** Step 1 already handles this; no separate "is active" check needed downstream.
- **Email comparison is case-insensitive everywhere.** `Daniel@Company.com` and `daniel@company.com` resolve to the same user.

---

## CSV Upload Flow

Admin-only UI in the settings area.

**Step 1 — Upload**
- Admin clicks "Upload Directory" button
- File picker accepts `.csv`
- Required columns: `email`, `first_name`, `last_name`, `department`, optional: `position`

**Step 2 — Parse + preview**
Server parses the CSV, normalizes emails to lowercase, and produces a preview:
- X new users will be added (in CSV, not in directory)
- Y existing users will be updated (in both; field values differ)
- Z users will be untouched (in both; identical)
- W users are in the directory but NOT in the CSV (the "missing" set)

For the missing set, the admin chooses:
- **Leave alone** (default — safe; manual additions persist)
- **Mark inactive** (use only when the CSV is authoritative)

**Step 3 — Validate**
Before commit, surface warnings:
- Departments in CSV that have no mapping in `department_role_map` → these users will be denied access until mapping is added
- Duplicate emails in CSV → reject upload, fix CSV
- Malformed emails → reject upload, fix CSV

Warnings are not blockers — admin can proceed with unmapped departments and add the mappings afterward.

**Step 4 — Apply**
Single transaction:
- INSERT rows for new emails (`source='csv_upload'`)
- UPDATE rows where fields changed (only if `source='csv_upload'`; never overwrite manual entries — see "merge protection" below)
- If admin chose "mark inactive": UPDATE missing rows SET active=0
- All rows touched: `last_synced_at = NOW()`

**Step 5 — Result**
Result page with counts and a link to "Needs Mapping" page if any unmapped departments were found.

### Merge protection

If a user was added manually via the UI (`source='manual'`), a subsequent CSV upload should **not silently overwrite their record** even if the email appears in the CSV. Two options:

- **Soft conflict:** Show the conflict in the preview ("Manual entry for jdoe@company.com differs from CSV — keep manual? overwrite with CSV? skip?")
- **Hard rule:** Manual entries are immutable from CSV; admin must explicitly delete and re-import

Recommended: **soft conflict.** Admin sees the diff and decides per row. Hard rules feel safer until you hit the first legitimate case where the manual entry needs updating.

---

## Manual Edit UI (Scope only — implementation later)

Four admin-only pages.

### 1. `Directory Users` page
- List view with filter (department, role-after-resolution, active state) and search (name, email)
- Add user form: email, first/last name, department, position. Marks `source='manual'`.
- Edit user (inline or modal): all fields editable
- Deactivate / re-activate button
- Show resolved role per user (computed via the 3-step logic) so admin can see what each user effectively gets

### 2. `Permission Overrides` page
- List view: email, role, reason, created_by, created_at
- Add override: dropdown of directory users → role picker → reason textbox
- Edit or remove an override

### 3. `Department Mappings` page
- List view: department, role, updated_at, updated_by
- Add mapping: department string → role picker
- Edit or remove a mapping

### 4. `Needs Mapping` page (alert surface)
- Shows users in the directory whose department has no mapping AND who have no override
- Each row has two actions: "Add mapping for {department}" or "Add override for {user}"

A small badge in the sidebar shows the count (e.g., "Needs Mapping (3)") when non-zero. Visible to admins only.

---

## Migration Plan — Phased Rollout

This is a sizable change. Land incrementally, not as one commit.

### Phase A3.1 — Tables + read-only resolver
- Create the three tables (idempotent migration in `database.js`)
- Build the resolution function (`resolveRole(email)`) but **don't wire it into login yet**
- Backfill seed data:
  - `directory_users`: admin@company.com + demo accounts + any internal test users
  - `permission_overrides`: admin@company.com → role=admin (so admin keeps working through the transition)
  - `department_role_map`: minimal seed using whatever departments the backfilled users have
- **No user-visible change.** Existing JWT login still authoritative.

### Phase A3.2 — Dual-source mode
- Login flow calls `resolveRole(email)` AND continues to read JWT `role`
- If both agree: log it, use that role
- If they disagree: log it loudly, **use the directory's resolved role** as the source of truth
- If `resolveRole` denies (user not in directory) but JWT has a role: log it, **deny the user** (fail closed)
- Run for several days. Watch the logs.

### Phase A3.3 — Directory canonical
- Remove the JWT `role` field from being authoritative
- JWT may still carry it for backward compat with any clients caching role-aware behavior, but server ignores it
- All `requireRole(...)` middleware reads from the request's resolved role (set by login middleware) which came from the directory

### Phase A3.4 — CSV upload UI
- Admin can upload the company directory CSV
- Merge logic per the upload flow above

### Phase A3.5 — Manual edit UI
- The four pages from the UI scope section

### Phase A3.6 — (Future, post-Stage A)
- Replace the password-based JWT login with Entra SSO
- Directory resolution layer is **unchanged** — only the upstream identity source changes
- This is what makes the design future-proof: SSO handles authentication, directory handles authorization, neither knows about the other

### Sequencing within Stage A
For Stage A ship-readiness, we need at minimum Phases A3.1 + A3.2 + A3.3 (resolution actually working and canonical). A3.4 and A3.5 can be added in any order; A3.5 may slip past Stage A and ship in A→B.

---

## Open Questions (Decisions needed before implementation)

These are things I don't know that you should decide. Reply yes/no/answer per item; we'll lock them.

**Q1. Email casing — confirm normalize-to-lowercase everywhere?** → Answered: **yes**

**Q2. Tech Design role — separate department or position-driven?** → Answered: **It's its own department**

**Q3. "Removed from CSV" default behavior — leave alone?** → Answered: **yes**

**Q4. Merge protection on `source='manual'` rows — soft conflict or hard immutable?** → Answered: **Soft conflict**

**Q5. Override role list — any role allowed, or restricted to admin/sales_mgmt?** → Answered: **yes (any role allowed)**

**Q6. Vendor handling in Stage A — confirm: not in directory, continue JWT?** → Answered: **Vendor needs to be part of Go Live** (Path 3 vendor approach adopted — CSV export/upload bridge during Stage A soft launch, full vendor auth in Stage B)

**Q7. Existing `users` table — does VCP already have one? What's the relationship?** → Answered via recon: **`users` table exists; chose Option (b) — migrate vendor logins into `users`, keep `trading_companies` as pure business entity**

**Q8. Audit log for overrides — append-only history table?** → Answered: **yes**

**Q9. Initial directory upload — when?** → Answered: **Daniel will request directory CSV from IT**

**Q10. Self-service request flow?** → Answered: **like the idea, request access flow for users in directory who aren't mapped is approved for v1**

---

## What Happened Next (post-design — added May 14)

This document was reviewed and approved. Phase A3.1 implementation began on May 14, 2026 and produced a working draft (three tables + seed data + resolveRole module + verification matrix all passing). The implementation was **reverted before commit** when consultation with IT revealed that role assignment should be driven by Entra security groups, not by a separate CSV-upload directory.

The pivot is captured in `IT_MEETING_PREP_VCP_ENTRA_2026-05-14.md`. A3 design v2 will be drafted once IT answers the P0 questions in that prep doc.

**Carry-forward from this design that remains valid in v2:**
- Three-layer resolution pattern (override → mapping → fail closed)
- Override-wins-over-default precedence
- Phased rollout approach (parallel-then-canonical)
- Vendor work deferred to Stage B with a CSV-export bridge for Stage A

**Discarded in v2:**
- CSV upload as the directory source
- `directory_users` as the source of truth (Entra is)
- `department_role_map` as the mapping (becomes `group_role_map`)
- Manual edit UI for adding/editing users (IT manages Entra membership instead)
- Routine reliance on `permission_overrides` (becomes exception-only)

---

## Appendix — File references for implementation (DEPRECATED)

~~When implementation starts, Claude Code will need:~~
~~- `database.js` — for the migration~~
~~- `schema.sql` — for the canonical schema~~
~~- `auth.js` — current login flow, where JWT is issued~~
~~- `routes.js` + `routes-supporting.js` — all the `requireRole(...)` middleware calls~~
~~- Wherever the demo accounts (`admin@company.com`, `shk@vendor.com`) are defined — likely in `auth.js` based on yesterday's investigation~~

These file references are still relevant for the v2 redesign but the specific changes will differ.
