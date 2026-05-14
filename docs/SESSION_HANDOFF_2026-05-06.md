# Vendor Cost Portal — Session Handoff
**Date:** May 6, 2026
**From:** Claude conversation in personal account, Days 1-4 of Phase 2 work
**To:** Claude in enterprise account (or any future Claude on this project)
**Purpose:** Complete project context to continue work without losing momentum

---

## How to use this document

Read this entire document before responding to any user request. Do not skip sections. The "Working Patterns & Meta Context" section in particular contains hard-won lessons about how to work effectively with Daniel on this project — internalize it.

If something is unclear after reading, ask Daniel rather than guessing. He prefers clarification over confident wrong answers.

---

## 1. Project Overview

**Name:** Vendor Cost Portal (VCP) — internal name "Cost Portal", "Vendor FOB Management" subtitle.

**Purpose:** Fashion FOB (Free On Board) costing tool for managing the lifecycle of style cost negotiation between Design, Sales/Planning, Production Coordinator (PC), Vendors (Trading Companies), and Customers.

**Domain context:** Manufacturing/wholesale fashion. A "program" is a season's worth of styles for a brand+gender+tier (e.g., "Q4 2026 Champion Womens Mid Tier"). Styles flow from Design → batched handoffs → Sales projects qty/sell → PC assigns to Trading Companies (TCs) → vendors quote FOBs → PC places styles with chosen vendor → customers buy.

**Owner:** Daniel (danielevy18@gmail.com / GitHub: danielmlevy1)

**Project path:** `/Users/daniell/Desktop/Projects/Github/vendor-cost-portal/`

**Server:** Port 3002. `npm start` from project root.

---

## 2. Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3) at `data/portal.db`
- **Frontend:** Vanilla JavaScript SPA (NO React/framework). HTML + CSS + JS.
- **Auth:** JWT-based, with optional Microsoft Entra (Azure AD) SSO disabled by default
- **Cron:** Daily email digest at 10am Asia/Hong_Kong (SMTP not currently configured)
- **No build step** for client code — files served directly. Cache busting via `?v=NNN` query param on script tags in `index.html`.

---

## 3. File Layout

```
/vendor-cost-portal/
├── server.js              # Express server entry
├── routes.js              # Main API routes (~57KB)
├── routes-supporting.js   # Additional routes including SR + handoff endpoints (~138KB)
├── auth.js                # JWT + role gating
├── database.js            # SQLite setup + migrations (~33KB) — migrations are idempotent
├── schema.sql             # Schema definition (~33KB)
├── api.js                 # Client-side API wrapper (~64KB)
├── app.js                 # Client app shell + main logic (~473KB) — large
├── views-admin.js         # Admin/PC views including Cost Summary (~422KB) — heavy
├── views-vendor.js        # Vendor portal views (~51KB)
├── styles.css             # All styling (~88KB)
├── index.html             # SPA shell with cache buster
├── package.json           # Dependencies
├── data/
│   ├── portal.db          # SQLite database
│   ├── portal.db.backup-* # Backup files (manual)
│   └── fabric-requests.json
├── docs/                  # Documentation
├── CLAUDE.md              # Project guidance for Claude
├── SESSION_HANDOFF.md     # (this document, when saved)
└── PreCostingTemplate.xltm # Excel template for handoff uploads
```

**Critical files for Phase 2 work:**
- `routes.js:936-940` — `allowedFields` for sales/planning role (where 2b.1 unlocked qty/sell writes)
- `views-admin.js:1367-1505` — `renderCostSummary` function
- `views-admin.js:1509-2188` — `buildCostMatrix` function (~680 lines, role parameter NOT yet threaded — Phase 2b.2 work)
- `views-admin.js:1585-1613` — Repeat style history detection logic
- `app.js:2034-2050` — `fmtBlurQty` and `fmtBlurCurrency` field handlers (admin popup lives here)

(Line numbers may drift as code changes. Use these as starting points, not absolutes.)

---

## 4. Roles & Field Ownership (LOCKED — DO NOT REVISIT WITHOUT EXPLICIT DISCUSSION)

### Roles
- **Admin** — superuser, can edit anything (with confirmation popup for non-owned fields)
- **PC (Production Coordinator)** — owns TC assignments, COO selection, FOB-related decisions, placements
- **Sales** — owns projected quantities and sell prices, notes
- **Sales Mgmt** — `role === 'planning' && departmentId === 'dept-sales-price'` — full view but READ-ONLY on all editors
- **Planning** — same field ownership as Sales (qty/sell/notes)
- **Design** — owns Style#, Style Name, Fabrication, Batch label
- **Tech Design** — read-only for most things
- **Vendor (Trading Company contacts)** — separate workflow, FOB quotes, customer buys

### Field ownership matrix (LOCKED for v1)
| Field | Owned By | Editable By |
|---|---|---|
| Style # | Design | Design (+ Admin w/popup) |
| Style Name | Design | Design (+ Admin w/popup) |
| Fabrication | Design | Design (+ Admin w/popup) |
| Batch label | Design | Design (+ Admin w/popup) |
| Proj Qty | Sales/Planning | Sales/Planning + Admin w/popup. **PC LOCKED in v1.** |
| Proj Sell | Sales/Planning | Sales/Planning + Admin w/popup. **PC LOCKED in v1.** |
| Notes (`sell_status_note`) | Sales/Planning | Sales/Planning + Admin |
| TC Assignments | PC | PC + Admin |
| COO selection | PC | PC + Admin |
| FOB | Vendor | Vendor (per assigned style) |
| Placement | PC | PC + Admin |

---

## 5. Phase Progress

### Shipped + Tagged
- **Phase A** — Programs Awaiting Vendor panel — VERIFIED
- **Role-leak fix** — verified UI + server gating
- **Phase 1** (v194) — Pre-Costing Pipeline list — TAGGED `phase-1-complete`
- **Phase 1.5** (v195) — Pipeline section grouping
- **Phase 2a** (v197) — Pipeline routing + interstitial + batch-review save bug Option A fix — TAGGED `phase-2a-complete`
- **Phase 2b.1** (v198) — Server unlock + bidirectional sync + X1 auto-advance + uniqueness constraint + admin popup — TAGGED `phase-2b-1-complete`

### In Active Test (Day 4 afternoon, ongoing as of May 6)
- Seeded 9 realistic test files (5 brands across multiple seasons + 2 sales-initiated SRs)
- Walking programs through full lifecycle to test Phase 2b.1 + repeat styles + sales-initiated path
- **Real bugs surfacing** — see Section 9

### Pending Build
- **Phase 2b.2** — Filtered Cost Summary + routing change (~115 LOC)
- **Phase 2b.3** — Edit gating + Notes column (~70 LOC)
- **Phase 3** — Vendor Change Log (v1.0 GATE, ~150 LOC)

---

## 6. Locked Architectural Decisions

### Phase 2b core architecture
**Pattern B Bidirectional Sync** (already shipped in 2b.1):
- `sales_requests.styles[]` JSON ↔ `styles` table for projQty, projSellPrice, notes
- Edit on SR modal → writes JSON + mirrors to styles table
- Edit on Cost Summary → writes styles table + mirrors to JSON
- Wrapped in `db.transaction()` for atomicity
- **Critical name mapping:** SR JSON uses `notes` (lowercase). Styles table uses `sell_status_note`. The mirror code MUST explicitly map between them in BOTH directions.
- **Phase 2b.2 micro-task:** Add defensive comment block at the mirror function in `routes.js` and `routes-supporting.js` reinforcing this name mapping. Without the comment, future Claude sessions risk reintroducing the same bug.

**X1 auto-advance** (shipped in 2b.1):
- When Sales fills last empty qty/sell in a `batch-review` SR, status auto-flips to `submitted`
- Per-SR independent — Batch 1's SR can advance while Batch 2's is still incomplete
- Reads from STYLES TABLE values (authoritative post-sync), not JSON

**X2 (explicit "Confirm Batch Review" button) — REJECTED.** Friction without value.

**Uniqueness constraint** (shipped in 2b.1):
- `UNIQUE INDEX idx_styles_prog_sn ON styles(program_id, style_number) WHERE style_number IS NOT NULL`
- Migration v21 in `database.js`
- Same constraint in `schema.sql` for fresh installs
- Catches silent data corruption from duplicate styles in same program at ingestion time

**Admin overwrite popup** (shipped in 2b.1):
- Triggers ONLY on overwrite of NON-ZERO existing value (not on filling empty fields)
- Reads `el.dataset.raw` BEFORE mutation (still holds previous saved value)
- `confirm('This field is owned by Sales. Edit anyway?')`
- Cancel reverts display, OK saves
- Clearing non-zero to 0 also triggers popup (still an overwrite)

### Phase 2b.2 routing change (LOCKED)
- Sales/Planning click row in Pipeline → Cost Summary (filtered) like Admin/PC
- Batch-review SRs ALSO route to Cost Summary (this REVERTS Phase 2a Option A which routed to modal)
- **EXPANDED SCOPE (after May 6 testing):** Also fix Open Programs view — clicks on SR-stage rows currently misroute to modal/nothing, should route to Cost Summary

### Phase 3 Vendor Change Log (LOCKED scope)
**Trigger:** Existing Style Change modal already has "Request re-cost" checkbox. Approval flow: Design/Admin logs change → Sales approves → Production releases → vendors notified.

**What gets shared with vendors:**
- Cost-impacting changes (fabrication, quantity, trims, color, status changes)
- Spec-relevant changes (style name, batch label) — Daniel decided these matter to vendors too
- NOT shared: internal notes, cosmetic edits, backend metadata

**Vendor experience:**
- Two surfaces: standalone "My Re-cost Requests" page + per-program panel
- Filtered to vendor's assigned styles only
- Click change → navigates to program/style view (NO inline FOB entry)
- Status field: "Recost" or similar
- When vendor submits new FOB → status flips to complete
- History "ticker" pattern (matches existing styles UI)
- Append-only changelog (acknowledgment state is v1.1 polish)

**Open questions for Phase 3 build:**
- Quantity change threshold — always notify, or only if >X% change?
- Email notification or in-app only?
- Stale state escalation — what if vendor never re-costs?
- "Confirm" button on existing History row in modal — what does it do today? Audit before building.

### Vendor Buy Summary view (NEW, May 6)
**Approach:** Clone existing Buy Summary page UI, filter to vendor's assigned styles, hide all sell-price fields. Show only quantities. Reuses existing UI/UX.

---

## 7. Database Schema Essentials

### Reference data (preserved through clears)
- `users` — login accounts, includes role + department_id
- `departments` — including special `dept-sales-price` for Sales Mgmt
- `internal_programs` — brand reference (currently: And1, Champion, Gaiam, Head, Reebok + others)
- `brand_tier_margins` — pricing margin rules
- `customers` — wholesale customer accounts
- `trading_companies` — vendor companies
- `tc_coos` — TC×Country of Origin lookup
- `coo_rates` — duty/freight rates per COO
- `factories` — manufacturing facilities
- `fabric_library` — reusable fabric standards
- `pending_changes` — approval queue for ref-data edits

### Transactional data (cleared in fresh starts)
- `programs` — main program records
- `styles` — individual style rows (children of programs)
- `assignments` + `assignment_coos` — TC↔program assignments
- `submissions` — FOB quotes from vendors
- `revisions` — append-only FOB change log
- `cell_flags` — per-cell flag annotations
- `placements` — final TC selections per style
- `customer_assignments` + `customer_buys` — customer demand allocation
- `style_links` — anchor/guest fabric grouping within program
- `tech_pack_history` — tech pack status changes
- `design_changes` — style edits post-handoff (Phase 3 reads from this)
- `recost_requests` — re-quote requests
- `cost_history` — historical cost snapshots
- `capacity_plans` + `capacity_plan_lines` — capacity scheduling
- `delivery_plans` + `delivery_plan_lines` — delivery scheduling
- `design_handoffs` — Design → Production handoff records
- `staged_batches` — batches awaiting PC approval
- `sales_requests` — Sales costing requests (the SR table — has `styles` JSON column for batch-review path)
- `fabric_requests` + `fabric_packages` — vendor fabric swatch workflow

### Critical schema notes
- **Foreign keys are OFF** in current SQLite config (`PRAGMA foreign_keys = OFF`). No cascading deletes fire. Delete order is cosmetic, but maintained for forward-compatibility. **Whether this is intentional long-term or tech debt is undecided** — see Section 14 open questions.
- **No triggers** anywhere in the schema.
- Migrations table is `schema_migrations`. Migration v21 (UNIQUE INDEX) was the most recent.

---

## 8. Current Data State (as of May 6, 2026 afternoon)

**Database:** `data/portal.db`
**Backup:** `data/portal.db.backup-2026-05-06`

**Reference data preserved:**
- 6 users (Admin, PC, Sales, Sales Mgmt, Design, Vendor — see test creds below)
- 27 trading companies
- 1 factory (more may have been added since)
- 6 brands in internal_programs

**Transactional data:**
- Cleared earlier on May 6
- Reseeded with 9 test files (see seed file inventory)
- Daniel walked some programs through partial lifecycle for testing
- Repeat history feature has placement data but isn't displaying — open bug

### Test login credentials
- Admin: `admin@company.com` / `admin123`
- PC: `pc@company.com` / `pc123`
- Sales: `sales@company.com` / `sales123`
- Design: `design@company.com` / `design123`
- (Other accounts likely exist for Planning, Sales Mgmt, etc. — query users table to confirm)

### Seed files (9 files)
| # | File | Brand | Year/Season | Tier | Gender | Notes |
|---|---|---|---|---|---|---|
| 01 | AND1_Q3-2026_Mens_Mass | And1 | Q3 2026 | Mass | Mens | 6 styles, 2 batches |
| 02 | CHAMPION_Q4-2026_Womens_Mid | Champion | Q4 2026 | Mid | Womens | 6 styles, BASE for repeats |
| 03 | GAIAM_Q1-2027_Womens_Premium | Gaiam | Q1 2027 | Premium | Womens | 5 styles |
| 04 | HEAD_Q2-2027_Mens_Mid | Head | Q2 2027 | Mid | Mens | 5 styles |
| 05 | REEBOK_Q3-2027_Mens_Mid | Reebok | Q3 2027 | Mid | Mens | 5 styles, 2 batches |
| 06 | CHAMPION_Q1-2027_Womens_Mid_REPEATS | Champion | Q1 2027 | Mid | Womens | 5 styles incl. 2 repeats from #02 |
| 07 | CHAMPION_Q3-2027_Mens_Mid_MULTIBATCH | Champion | Q3 2027 | Mid | Mens | 7 styles, 2 batches, 1 cross-gender repeat |
| 08 | AND1_Q4-2027_Mens_Mid_SR | And1 | Q4 2027 | Mid | Mens | Sales-initiated, 4 styles |
| 09 | HEAD_Q4-2027_Womens_Premium_SR | Head | Q4 2027 | Premium | Womens | Sales-initiated, 3 styles |

**Repeat style numbers in seed data:**
- CHM-Q4-LE-01 (Compression Legging) — in #02 and #06
- CHM-Q4-SB-02 (Sports Bra High Support) — in #02 and #06
- CHM-Q4-CR-01 (Crew Sweatshirt) — in #02 and #07 (cross-gender)

---

## 9. Active Bugs (as of May 6 afternoon testing)

**Found during seeded testing — not yet logged in any code:**

### B1 — Open Programs SR-row click does nothing
**Severity:** Will be fixed by Phase 2b.2 (expanded scope)
**Repro:** On Open Programs page, click a row with stage = SALES REQUEST. Nothing happens.
**Expected:** Should navigate to Cost Summary.

### B2 — Open Programs SR "Open" button opens modal
**Severity:** Will be fixed by Phase 2b.2 (expanded scope)
**Repro:** On Open Programs page, click "Open" button on SALES REQUEST row.
**Expected:** Should open Cost Summary, not modal.

### B3 — Repeat style history not showing despite placements existing
**Severity:** Open investigation — may block Phase 2b.2
**Repro:** Place styles in #02 (Champion Q4 2026 Womens Mid). Open Cost Summary on #06 (Champion Q1 2027 Womens Mid). CHM-Q4-LE-01 and CHM-Q4-SB-02 should show repeat history. They don't.
**Diagnosis pending:** Check if "🔁 Repeat Style" column is enabled in Columns selector. Check console for errors. Hard refresh browser. May need to investigate `_allPlacements` and `_allStylesGlobal` state.

### B4 — Sortable columns missing from Open Programs
**Severity:** MED — UX issue
**Expected:** Click column headers to sort.

### B5 — SR# column hidden until status = Costing
**Severity:** MED
**Expected:** SR# should be visible on Open Programs whenever an SR exists, regardless of program status.

### B6 — Target LDP filling inconsistently
**Severity:** Investigation needed
**Repro:** On Open Programs view, Target LDP shows up for some programs but not others. No clear pattern observed yet.

### B7 — Window shrinks / content disappears
**Severity:** Investigation needed — uncharacterized
**Repro:** Sometimes window content shrinks and becomes invisible. Trigger unknown. May be CSS/viewport issue.

### B8 — Filter state persists across pages
**Severity:** LOW — needs visible "filters active" indicator
**Behavior:** Filters applied on one view persist when navigating to another and back. May be intentional UX, but needs visibility so users aren't confused.

**Pre-existing bugs (carried forward):**

### Bug-tcs-preselected
**Severity:** HIGH (pre-existing)
**Repro:** `openAssignTCs` modal pre-selects ALL TCs for unassigned programs. PC could accidentally save and assign program to every TC.

### Bug-tier-dropdown
**Severity:** MED
**Should be:** Retailer / Tier checkboxes converted to dropdown.

### Bug-export-notes
**Severity:** LOW
**Repro:** Tracker "Export Status + Notes" button doesn't work. Clipboard permission issue.

### Bug-program-column
**Severity:** MED
**Should be:** All Open Programs "Program" column should display Brand · Year · Season · Tier · Gender. Same view also needs Proj Qty, Actual Qty, Wtd Avg Sell columns added.

---

## 10. Active To-Do List (priority order)

1. **Investigate B3 (repeat history)** — try hard refresh, check column visibility, check console
2. **Continue testing seeded data** — verify Phase 2b.1 sync against realistic data
3. **Test sales-initiated path** with #08, #09 — verify SR creation without prior handoff
4. **Characterize B7 (window shrinks)** — find reproducer
5. **Send Phase 2b.2 build prompt** to Claude — only after data testing clean

**v1.0 SHIP BLOCKERS** (gates release):
- Phase 2b.2 ✗
- Phase 2b.3 ✗
- Phase 3 (Vendor Change Log) ✗

Estimated path: 2b.2 (~3-5 days) → 2b.3 (~2-3 days) → Phase 3 (~3-5 days) = 8-13 days focused work.

---

## 11. Working Patterns & Meta Context (READ THIS CAREFULLY)

These are not optional. They are how Daniel and I work effectively together. Internalize them.

### 11.1 Verification protocol — ALWAYS

**Pattern observed:** Claude self-reports complete → user verifies → bug found.

This has happened multiple times. Self-reports from Claude (mine and Daniel's prior Claude conversations) have been wrong:
- "Phase 2a tests passed" → Tests 3+4 needed reinterpretation
- "All changes applied correctly" → Required smoke testing to confirm
- "Save bug fixed" → Silent data discard found

**Rule:** "Code applied" is NOT "verified working." Always insist on smoke tests after Claude claims a build is done. Use database queries to verify state, not visual UI inspection alone.

### 11.2 Push back over confirm-bias — explicitly requested

Daniel explicitly asked for pushback when his thinking is incomplete or wrong. He values:
- Honest "no" over polite "yes"
- "Stop and verify" over "looks good, ship it"
- Identifying when scope creep is happening
- Calling out when fatigue is affecting decisions

**Don't:** Reflexively agree. Don't soften feedback to be polite. Don't sandbag risks.
**Do:** State concerns directly. Push back on rushed decisions. Say "stop here for tonight" when warranted.

### 11.3 Fatigue management — REAL signals matter

Multiple fatigue-related mistakes have happened:
- Typed `[PID]` literally as a command (was supposed to be a placeholder)
- Closed server terminal accidentally (twice)
- Pasted into wrong window
- Ran commands from wrong directory (multiple times)
- Created empty `clear.sql` file (forgot to save)

**These aren't isolated mistakes. They're signals.**

When you notice the pattern accumulating in a session:
1. Acknowledge it
2. Suggest stopping
3. Don't push through to ship destructive operations (database changes, tag pushes, etc.) when fatigue signals are clear
4. The work will still be there tomorrow

### 11.4 Sub-phase ships small

Phase 2b is broken into 2b.1, 2b.2, 2b.3 — each ships independently. Don't try to ship all of Phase 2b at once.

Pattern:
1. Research (Claude analyzes scope, returns LOC + risks)
2. User reviews, locks decisions
3. Build prompt sent (specific scope, decisions explicitly stated)
4. Claude builds, reports
5. User verifies (smoke tests)
6. Tag if clean
7. Use in real workflow for hours/days
8. Then plan next sub-phase

**Don't approve next sub-phase prompt until current one is verified + tagged + used.**

### 11.5 Cache buster pattern

`index.html` has `?v=NNN` query params on script tags. EVERY client-side change MUST bump the version number. Without bump, browsers serve cached old code and "fixes" appear to not work.

### 11.6 Database safety rules

- **ALWAYS backup before destructive operations** (`cp data/portal.db data/portal.db.backup-DATE`)
- **Stop the server** before running raw SQL scripts (server holds DB locks)
- **Wrap multi-statement SQL in BEGIN TRANSACTION / COMMIT** for atomicity
- **Don't trust `cat > file << EOF` heredocs** — Daniel pasted shell wrapper into the SQL file once. Use VS Code for SQL editing instead.
- **Verify after running** — row counts before/after, spot-check via SELECT

### 11.7 Tag workflow

Tags ONLY after verification:
```
git status
git add .
git commit -m "Phase X.Y — description (vNNN)"
git push origin main
git tag phase-X-Y-complete
git push origin phase-X-Y-complete
```

Verify with `git tag` to confirm.

Existing tags: `phase-1-complete`, `pre-merger`, `phase-2a-complete`, `phase-2b-1-complete`.

### 11.8 Communication style

- Daniel uses minimal punctuation, sometimes typos (he types fast). Don't assume typos are intentional choices.
- He prefers numbered lists for action items, plain prose for analysis.
- He gets pushed-around easily by overly polite Claudes — be direct, be honest, be a peer.
- He uses "i think" and "maybe" when he's actively thinking out loud. Read the difference between thinking-out-loud and locked-decision.
- When he asks a question, answer the question directly first, then add context. Don't bury the answer.

### 11.9 Honest moments

Periodically Daniel benefits from a "real moment" check:
- "Honest read on where we are right now"
- "What's the right next move vs what we're doing"
- "Are you actually ready to ship this or are you just tired"

Don't be afraid to interrupt the flow with these. They've prevented multiple bad decisions.

### 11.10 The "all 7 questions" trap

When asking clarifying questions, Daniel will sometimes give partial answers. Don't grill him for all 7 if only 3 are blocking. Get what you need to make progress, defer the rest.

---

## 12. Build Prompt Patterns

When sending build prompts to Claude, the structure that works:

```
**Phase X.Y build — [scope summary]**

[2-3 sentence context of what's already shipped and what's next]

**LOCKED DECISIONS — implement exactly as specified:**

1. [Decision] — [location/file]
   [details]
   
2. [Decision] — [location/file]
   [details]

[Continue for all decisions]

**WHAT NOT TO BUILD (deferred):**
- [Item] — [which future phase]
- [Item] — [which future phase]

**SMOKE TEST SCOPE for X.Y (verify after build):**

1. [Test 1]
2. [Test 2]
[etc]

**RESEARCH FIRST, THEN APPLY:**

Before writing code:
1. [Confirmation requirement]
2. [Confirmation requirement]
[etc]

Apply only after answering those points clearly.

After applying:
1. [What to verify]
2. [What to report]

**LOC budget:** ~XXX lines. If your changes exceed YYY, stop and report.
```

This prompt structure has worked well. Don't reinvent it.

---

## 13. Bug Triage Conventions

When new bugs surface:
1. Capture in tracker
2. Assign severity (CRITICAL / HIGH / MED / LOW)
3. Decide: blocks current phase? blocks v1.0? polish?
4. Don't fix bugs out of order — finish current phase first
5. Pre-existing bugs (from before today) don't block today's work unless they're CRITICAL

---

## 14. Open Questions (NOT YET DECIDED)

### Infrastructure & quality
- **DECIDE: FK enforcement direction.** SQLite currently runs with `PRAGMA foreign_keys = OFF`. Whether to turn FKs on for v1.0 or v1.1 is undecided. Risks of flipping ON without auditing all delete paths: existing code that relies on orphan-friendly behavior could break. Risks of leaving OFF: silent data corruption from bad delete order in future scripts.
- **DECIDE: Automated test harness.** No Jest/Mocha or other framework currently. All testing is manual UI clicks + SQL verification queries. Options: (a) accept for v1.0, add as v1.1 work; (b) add minimal harness now (~1 day) to cover the bidirectional sync, migrations, X1 auto-advance, then expand later.

### For Phase 3 build (when reached)
- Quantity change notification threshold (always / >X% / only after FOB)
- Email vs in-app notifications
- Stale state escalation when vendor doesn't re-cost
- Audit existing "Confirm" button on Style Change History row

### For Phase 2b.3 build (when reached)
- Read-only field treatment Option B vs D
  - B: Read-only fields look identical to editable, click does nothing
  - D: Subtle background tint differentiates "your fields" from "others'"

### For post-2b release
- SR view enrichment — does Sales need richer info on SR view, or is filtered Cost Summary sufficient?

---

## 15. The Tracker

A self-contained HTML tracker lives at `/mnt/user-data/outputs/vcp-tracker.html` (or wherever Daniel saved it locally).

It uses localStorage key `vcp-tracker-state-v3` and persists in browser. It has:
- Today's wins
- v1.0 ship blockers
- Phase 3 (Vendor Change Log) full scope
- Active bug list
- Feature backlog
- Recently shipped
- Active to-do list

**Important:** When updating the tracker, regenerate the entire HTML file. Don't try to incrementally edit. Hard-refresh in browser to see updates.

---

## 16. Session Continuation Checklist

When picking this up in a new conversation:

1. **Read this entire document.** Don't skim.
2. **Confirm understanding** — say something like: "I've read the handoff. Quick sanity check on a few items before we continue:" and ask 2-3 clarifying questions about anything genuinely ambiguous. Don't make Daniel re-explain the basics.
3. **Verify state matches handoff:** Ask Daniel to confirm:
   - "Is the server running on localhost:3002?"
   - "Did anything change in the project since this handoff was written?"
   - "Where are you in the to-do list?"
4. **Pick up from where the to-do list says.** Don't restart things that were in progress.
5. **Maintain the working patterns** — push back, verify, sub-phase ship, etc.

---

## 17. What I (the previous Claude) want the next Claude to know

Daniel is sharp, technical, and shipping a real internal product. He's been working long days. He's earned the right to be impatient sometimes, but he also reflects well when something is going off the rails.

He values:
- Real progress over performative progress
- Honest assessments over pleasing answers
- Working code over comprehensive plans
- Being told the truth about scope creep, fatigue, or risk

If you find yourself agreeing with everything he says, you're probably failing him. The job is to be a thinking partner, not a yes-machine.

Don't be afraid to say:
- "I don't actually know — let me search/check"
- "That's not what we decided yesterday — see Section X"
- "Stop. I need to push back on this before we proceed."
- "You're tired. The work will still be here tomorrow."

Do the work well. Help him ship something he's proud of.

---

**End of handoff document.**

*Last updated: May 6, 2026 by Claude Sonnet (personal account). For continuation, save this file in `/docs/SESSION_HANDOFF_2026-05-06.md` in the project repo and paste contents into the first message of a new Claude conversation.*
