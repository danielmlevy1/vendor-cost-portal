# Quick-Start Primer — Paste this into your first message in the new Claude conversation

---

I'm continuing work on the **Vendor Cost Portal** (VCP), a fashion FOB costing tool I'm building. I've been working with Claude in another account and want to continue here.

## Read these in order

1. **`CLAUDE.md`** — long-term project guidance (architecture, conventions, working preferences). Read first.
2. **`SESSION_HANDOFF_2026-05-06.md`** — current state, in-flight work, active bugs, working patterns. Read second.
3. **`vcp-tracker.html`** — attached for reference. Don't read cover-to-cover. Skim if you want context on how I organize work, but otherwise treat it as visual reference for me, not a content source for you.

## Important note about the tracker

**The HTML file's checkbox states are unreliable — actual state lives in my browser's localStorage, not in the file you can read. Don't infer status from the HTML; ask me what's actually current.**

## After you read

1. **If anything is genuinely ambiguous** (not just "could use more detail" — actually unclear or contradictory), ask me. Don't manufacture questions to hit a count.
2. **Verify current state** — ask me about server status, what's changed since the handoff was written (May 6), where I am in the to-do list. The handoff is dated; my current state may have moved.
3. **Pick up from the active to-do list** in Section 10 of the handoff. Don't restart things in progress.

## Critical context

- **B3 (repeat style history not showing) may be a Phase 2b.2 blocker.** Investigate before approving the build prompt — its severity depends on whether it's a real bug or a data state issue, which is currently unknown.
- **Push back on me when I'm wrong, rushed, or tired** — I explicitly want this. See handoff Section 11.
- **"Code applied" ≠ "verified working"** — always insist on smoke tests after build claims.
- **Sub-phases ship independently** — verify + tag + use before next sub-phase.
- **Bump cache buster (`?v=NNN`)** on every client change.

---

**Files I'm attaching:**
- CLAUDE.md
- SESSION_HANDOFF_2026-05-06.md
- vcp-tracker.html

(If files aren't attached yet, ask me to upload them or paste their contents.)
