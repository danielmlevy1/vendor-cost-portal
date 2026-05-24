# Status Taxonomy Audit — Decisions Locked

**Date:** May 21, 2026
**Status:** Decisions locked. Implementation deferred to scoped refactor commit (post-launch likely).
**Source recon:** Claude Code audit (read-only) — see EOD tracker for full recon output.

---

## Universal principle

> **"Complete" = nothing left for anyone to do.**
> Not "this department's portion is done." Universal definition.

If a stage's "Complete" means "this department finished their part" but other departments still have work, that label is **wrong**. Needs a different name reflecting per-stage reality without overloading the universal word.

---

## Final locked taxonomy

Location-led naming model. Each stage says **where the work currently lives**.

| # | Label | DB / code state | What it means |
|---|---|---|---|
| 1 | 🎨 **With Design** | `staged_batches` not yet created, or handoff just uploaded | Design uploaded handoff, preparing/staging batches |
| 2 | 🏭 **With Production** | `staged_batches.status='staged'` | Design released staged batch; Production (PC) must approve |
| 3 | 💼 **With Sales** | `design_handoffs.submitted_for_costing=1` OR `sales_requests.status='submitted'` (no linked_program) | Production approved release; Sales must create SR with qty/sell |
| 4 | 🧮 **In Costing** | `sales_requests.status='converted'`/`batch-review` OR `programs.status='Costing'` | TC assigned, vendors quoting, Production reviewing |
| 5 | ✓ **Placed** | `programs.status='Placed'` | Order placed with TC. Nothing left to do for anyone. (= "Complete") |
| — | ✕ **Cancelled** | various tables, `status='cancelled'` | Terminal state |

**Key insight:** "Placed" carries the universal-Complete semantic. The word "Complete" disappears from the taxonomy entirely (avoids duplication / ambiguity).

---

## Decisions made (with reasoning)

### Q1 — "PC" vs "Sales" stage split

**Decision:** Keep them as separate stages, rename "PC" → "Production".

**Reasoning:** Recon confirmed `staged_batches.status='staged'` is genuinely a different actor-state from `submitted_for_costing=1`:
- Staged batches need PC approval (POST /staged-batches/:id/approve, admin/pc only)
- Submitted-for-costing needs Sales to create an SR

Merging these into a single "With Sales" label would conflate two different queues with different owners and different backend code paths. The location-led model preserves both stages.

"Production" instead of "PC" because it's unambiguous to users without internal jargon knowledge.

### Q2 — Fresh SRs (no handoff origin)

**Decision:** Accept that fresh SRs start at "With Sales", skipping "With Design" and "With Production" stages.

**Reasoning:** The taxonomy describes **where work currently lives**, not where it came from. Fresh-SR programs start at "With Sales" because that's accurate to their current state.

Captured as documented behavior, not a bug.

### Q3 — "Complete" word handling

**Decision:** Use "Placed" everywhere. Drop "Complete" from the taxonomy.

**Reasoning:** By Daniel's universal-Complete principle, `programs.status='Placed'` already means "nothing left to do" (VCP is a costing tool, not a production tracker — once placed with the TC, VCP's job is done). Keeping both "Placed" and "Complete" as labels would duplicate semantic.

Sub-options considered:
- (a1) Use "Placed" everywhere, drop "Complete" ← **CHOSEN**
- (a2) Use "Complete" everywhere, drop "Placed"
- (a3) Keep both with one canonical

Chose a1 because "Placed" is the existing DB enum value and current code references it heavily. Cheapest path, lowest risk.

### Q4 — Vestigial `programs.status='Draft'`

**Decision:** Defer investigation to refactor-time.

**Reasoning:** 7+ code references reference 'Draft', zero rows in DB. Either dormant feature or load-bearing for creation flow. Worth investigating before any refactor touches those code paths, but not blocking today.

### Q5 — Case normalization

**Decision:** Yes — normalize all status values to lowercase as part of the eventual refactor commit.

**Reasoning:** Current mixed-case state is inconsistent and surface-leaks programmer intent:
- `'Draft'/'Costing'/'Placed'/'cancelled'` for programs (mixed)
- `'submitted'/'converted'` for SRs (lowercase)
- `'active'/'cancelled'` for handoffs (lowercase)

Lowercase normalization is the right call. But it touches 17+ string-comparison sites and requires a DB migration — bumps the refactor from "very low risk" to "low-medium risk."

---

## Refactor scope (when ready to ship)

### Conservative path (label-only)

- Update bucket labels in `renderDesignHandoff` (views-admin.js:3194-3201, 3338-3340)
- Update bucket labels in `renderPreCostingPipeline` (views-admin.js:3763, 3811-3816)
- Optionally update KPI subtext (views-admin.js:5230, 5298)
- Cache buster bump

**LOC:** ~10-15
**Files:** views-admin.js + index.html
**Risk:** Very low. Bucket-classifier logic unchanged.
**Backend:** None.

### Full path (label + case normalization)

Everything above, plus:
- Rename bucket keys in JS objects (`draft` → `withDesign`, `staged` → `withProduction`, etc.)
- Normalize `programs.status` casing in DB + all 17+ string-comparison sites in code
- Migration script: `UPDATE programs SET status = LOWER(status)` + schema comment update
- Update `App.openProgram` and dispatcher comparisons (`status === 'Placed'` → `status === 'placed'`)

**LOC:** ~50-80
**Files:** views-admin.js + app.js + routes.js + routes-supporting.js + database.js + DB migration
**Risk:** Low-medium. String-literal comparison sites are easy to miss and break silently.
**Backend:** Yes — DB migration + endpoint changes.

### Recommended approach

**Ship as a post-launch refactor commit, not pre-launch.**

Stage A is 8 days out (May 29). Label normalization is polish, not feature. Risk of regression during refactor + value of consistency are both real, but the timing is wrong for pre-launch. Better to:

1. Capture decisions now (this document)
2. Ship Stage A with current labels
3. After May 29 launch, do conservative path first (low-risk label-only)
4. After conservative ships clean, do case normalization as separate scoped commit

---

## Implementation notes for future refactor

- The "Complete" group in `renderDesignHandoff` (currently shows handoffs with `linkedProgramId && allStylesReleased`) maps to **In Costing** in the new taxonomy (those handoffs have moved past Sales into PC's costing flow). Not "Placed" yet.

- The "Complete" group in `renderPreCostingPipeline` (currently `linkedProgramId || status='converted'`) similarly maps to **In Costing**.

- The list-view "Placed" sidebar item for programs already exists and is correctly named — no change.

- Vendor groups (Stage B+) need their own status semantics: when does vendor work move from "With Vendor (quoting)" back to "With Production (reviewing)"? Defer to Stage B planning.

---

## Open audit items (future work)

- `audit-vestigial-programs-status-draft-investigation` — investigate 7+ code references with zero DB rows
- `feature-program-status-post-placed-lifecycle` — if VCP ever needs to track post-Placed (Shipped, Closed, Reconciled), define those states
- `audit-vendor-stage-naming-stage-b` — define vendor-side stage labels before Stage B (~June 26)
