# Session Handoff — Vendor Cost Portal

**Branch:** `main` · **Status:** clean, all pushed to `origin/main` · **Latest:** `584452d` · **Cache-buster:** `?v=119`

## What we're building
Node + Express + SQLite + vanilla-JS web app for FOB vendor costing, program placement, capacity + delivery planning, and cross-program performance analytics. The app is self-hosted in dev (port 3002, `PORT=3002 node server.js`); target deployment is Azure in ~2 weeks.

## What shipped this session

1. **Capacity Plan** (`7e040c8`) — per-program, per-style×factory production math. Admin/PC initializes from placements; TC fills in lines, ops, daily output, cut/sew/pack/ex-factory dates; submit → approve/reject. Route: `capacity-plan`.
2. **Login preload fix** (`6abddb3`) — `init()` and `login()` now route through `navigate()` so the landing Programs page isn't empty on first paint.
3. **Programs sidebar collapsible** + **Overview tab** (`e0cc1b6`) — replaced the single Programs nav button with a collapsible group: 📂 Open · ✅ Placed · 🗑 Cancelled (live counts, localStorage-sticky). Added 📈 Overview as tab 1 on every program — KPI tiles, margin recap, vendor/factory mix. Placed programs land on Overview by default.
4. **Overview USA/Canada toggle removed** (`31f6e95`) — each program ships to exactly one market (`prog.market`); toggle was misleading.
5. **Performance page** (`2caf065`) — new admin/PC sidebar item. Two tabs: Vendors · Factories. Aggregates placed-style data across programs (programs count, placed, units, wtd FOB, revenue, wtd margin, hit/miss target, two delivery-late measures, capacity plan status). Season multi-select filter, drill-down modal → jump to Overview. Server: `GET /api/performance/rows`, `GET /api/performance/seasons`.
6. **Light mode default + editorial polish** (`0f63bc8`) — flipped default theme to light to match parent brand (highlifellc.com). Flat cards, near-white bg, charcoal text, tight radii, uppercase small-caps table headers, underline-style tabs.
7. **Navy primary CTA + accent** (`e1f9eac`) — Pantone 295C `#002855` for primary buttons + `--accent` (sidebar active bar, focus rings).
8. **Coral accent** (`584452d`) — Pantone 7417C `#e04e39` on active program-tab underline + sidebar pending badges (intentionally narrow use).

## What's in progress
Nothing. Working tree clean. No uncommitted edits.

## Decisions made, not captured in code

- **Per-program market is exclusive.** Each program is USA *or* Canada (never both). All LDP/margin math uses `prog.market`. Cross-market comparison would be a separate feature.
- **Margin basis on Overview.** Actual weighted sell from Buy Summary (`qty × sell_price`) divided by units — *not* target margin, though target is shown alongside for ✓/✕.
- **Delivery lateness = two measures.** (1) Projected in-whse (Factory CRD + COO sea lead) vs Sales In-Whse Date. (2) Vendor Prod CRD vs Sales Prod CRD. No "actual" arrival tracking yet — these are commitment-vs-need.
- **Performance defaults to newest season/year**, user checks additional seasons. Sticky in `localStorage('vcp_perf_seasons')`.
- **Programs sidebar buckets map:** Open = `Draft` + `Costing`. Placed = `Placed`. Cancelled = `Cancelled` (labeled "Cancelled" not "Dropped" — matches data model).
- **Brand palette:** Navy `#002855` (primary CTAs, accent), Coral `#e04e39` (attention: active tab + pending counters), status badges stay green/amber/red for semantic meaning.
- **Capacity plan approval bumps back to submitted on vendor edit** — admin re-reviews automatically if the TC edits an approved plan.

## Open QA notes (low priority, not fixed)
A QA sweep was run — no P0 or P1 real bugs. Two P2 polish items worth noting:
- Placements pointing at a *deleted* factory render "—" but don't crash (admin-controlled data, unlikely).
- Vendor typing `/capacity-plan/:id` for a program they're not assigned to sees "No plan — Initialize" with a non-working button (silently 403s). Not reachable from the UI.

## Key files (for the next session)

- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/schema.sql` — canonical schema; `capacity_plans`, `capacity_plan_lines`, `delivery_plans`, `delivery_plan_lines`, `factories` are the newest tables.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/database.js` — migrations via `addColumn()` idempotent helper; applies `schema.sql` on startup.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/routes.js` — core REST (programs, styles, placements, submissions).
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/routes-supporting.js` — everything else (handoffs, sales requests, factories, delivery plans, capacity plans, **performance** at the bottom ~line 2300+).
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/api.js` — client API namespace (`API.Programs`, `API.CapacityPlans`, `API.DeliveryPlans`, `API.Performance`, etc.). Cache + preload patterns.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/app.js` — main controller (~7200 lines). Sidebar render, routing, `App.*` handlers. Programs-sidebar-collapsible block ~line 247.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/views-admin.js` — admin/PC/planning views. `renderOverview` ~line 4330, `renderCapacityPlan` ~line 4558, `renderDeliveryPlan` ~line 4113, `renderPerformance` ~line 4749, `programTabBar` ~line 2055.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/views-vendor.js` — vendor views.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/styles.css` — design system. Light-mode editorial-polish block starts ~line 264.
- `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/index.html` — shell. All script tags on `?v=119`.

## Suggested next step
Run the app end-to-end as a real user: Design Handoff → Sales Request → Program Draft → acknowledge → Costing → vendor quotes → Place → check Overview, Buy Summary, Capacity Plan, Delivery Plan, Performance. Bugs found during live use are the highest-value fixes before Azure deployment. If nothing breaks, the short list for next features is: actual delivery/arrival tracking (to make the "late" measures real instead of projected), and Azure hosting prep (documented in `/docs/DEPLOY.md`).

## Server runtime notes
- Dev server was running on `http://localhost:3002` (`PORT=3002 node server.js`) — may still be up as a backgrounded task. Check with `lsof -i:3002`.
- Default admin login: `admin@company.com` / `admin123`.
- Default vendor demo: `shk@vendor.com` / `vendor123`.
- Microsoft Entra auth is wired but disabled (env vars `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` + `OAUTH_REDIRECT_URI` enable it).
