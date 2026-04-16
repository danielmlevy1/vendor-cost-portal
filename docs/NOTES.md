# Vendor Cost Portal — Developer Notes

## Running the Server
```sh
node server.js
```
- Listens on `PORT` (default `3000`) → http://localhost:3000
- Serves static frontend files from the project root and mounts the REST API
  under `/api`.
- Auto-creates [data/portal.db](../data/) on first run, applies
  [schema.sql](../schema.sql), and seeds reference data.
- Schedules a daily 10am email digest (Asia/Hong_Kong by default — see
  `EMAIL_TIMEZONE` env var). SMTP only fires if `SMTP_USER` / `SMTP_PASS`
  are set.

## Default Seed Credentials
Internal users (created on first run by [database.js](../database.js)):

| Role     | Email                       | Password    |
| -------- | --------------------------- | ----------- |
| admin    | admin@company.com           | admin123    |
| pc       | pc@company.com              | pc123       |
| planning | planning@company.com        | plan123     |
| planning | sales@company.com           | sales123    |
| design   | design@company.com          | design123   |
| design   | techdesign@company.com      | tech123     |

Trading companies (vendor logins) all share password **`vendor123`** —
emails follow the pattern `<code>@vendor.com` (e.g. `az@vendor.com`,
`hs@vendor.com`). Full list seeded in [database.js](../database.js).

> Change all of these before any non-local deployment.

## Key File Locations

### Backend
- [server.js](../server.js) — Express bootstrap, static serving, mounts auth +
  API routers, fabric-request endpoints, daily-digest cron + SMTP.
- [auth.js](../auth.js) — login/me/logout routes + `requireAuth` /
  `requireRole` middleware. JWT signed with `JWT_SECRET`.
- [database.js](../database.js) — SQLite connection, schema apply, seed data
  for users, trading companies, COO rates, internal programs, brand tiers, etc.
- [schema.sql](../schema.sql) — full relational schema (tables, indexes, FKs).
- [routes.js](../routes.js) — core REST endpoints (programs, styles,
  submissions, placements, customer buys, etc.).
- [routes-supporting.js](../routes-supporting.js) — supporting REST endpoints
  (TCs, COO rates, customers, users, fabric library, etc.).

### Frontend
- [index.html](../index.html) — single-page-app shell.
- [api.js](../api.js) — `API.*` client wrapping fetch + caching.
- [app.js](../app.js) — main app controller, state, navigation, shared views.
- [views-vendor.js](../views-vendor.js) — TC-side screens.
- [views-admin.js](../views-admin.js) — internal/admin-side screens.
- [styles.css](../styles.css) — all styles.

### Runtime data (gitignored)
- [data/portal.db](../data/) — SQLite database (created on first run).
- [data/fabric-requests.json](../data/) — legacy JSON store, still used by the
  `/api/fabric-requests` endpoints in [server.js](../server.js).

## How the API + Cache System Works

The frontend renders synchronously, but the data lives on the server. The
`API` layer in [api.js](../api.js) bridges this with a preload-then-render
pattern.

### 1. Preload (warms the cache)
Before navigating to a screen, the app calls `await API.preload.X()` for the
namespaces that screen needs. Each preload helper performs the necessary
`fetch()` calls and writes the results into `API.cache.*` (and lookup maps
like `programMap`, `tcMap`, etc.).

### 2. Render (reads cache synchronously)
View functions read from `API.cache.programs`, `API.cache.styleMap[id]`,
`API.cache.submissions[styleId]`, etc. — no awaits, no spinners mid-render.
The cache is structured to match how views consume it (lists + by-id maps
+ child collections keyed by parent ID).

### 3. Mutate (write through cache)
Event handlers call `await API.Programs.upsert(data)` (or `.delete(id)`,
etc.). These hit the server, then update both the list and the map in
`API.cache` so subsequent renders see the new state without an extra
preload round-trip.

### Auth / token handling
- JWT stored in `localStorage['vcp_token']`, attached as
  `Authorization: Bearer <token>` to every request.
- Any 401 response clears the token and reloads the page → login screen.
- Session rehydrate on page load: `API.Auth.current()` calls
  `GET /api/auth/me` to verify the token is still valid.

### Reference data note
COO rates, brand-tier margins, internal programs, departments, etc. are
loaded once at startup and rarely change — they sit in the cache for the
full session. Mutable resources (programs, styles, submissions, etc.) are
re-preloaded whenever the user navigates back to a screen that depends on
them.

## Environment Variables
| Var               | Default                  | Notes                              |
| ----------------- | ------------------------ | ---------------------------------- |
| `PORT`            | `3000`                   | HTTP port                          |
| `DB_PATH`         | `data/portal.db`         | SQLite file path                   |
| `JWT_SECRET`      | `dev-secret-change-in-prod` | **Set in prod**                 |
| `JWT_EXPIRY`      | `8h`                     | jsonwebtoken format                |
| `BCRYPT_ROUNDS`   | `10`                     | Cost factor for password hashing   |
| `SMTP_HOST`       | `smtp.gmail.com`         |                                    |
| `SMTP_PORT`       | `587`                    |                                    |
| `SMTP_USER`       | _(empty)_                | Required for digest email          |
| `SMTP_PASS`       | _(empty)_                | Required for digest email          |
| `FROM_EMAIL`      | `SMTP_USER`              | Digest sender                      |
| `PD_EMAIL`        | _(empty)_                | Reply-to on digest emails          |
| `COMPANY_NAME`    | `Costing Team`           | Used in digest subject/body        |
| `EMAIL_TIMEZONE`  | `Asia/Hong_Kong`         | Cron timezone for daily digest     |
| `CRON_TIME`       | `0 10 * * *`             | (Currently unused — scheduler computes UTC offset itself) |

> See [Notes-original.md](Notes-original.md) for the legacy root `Notes.md` file.
