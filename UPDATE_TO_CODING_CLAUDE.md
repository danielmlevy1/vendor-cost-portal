# Update for the Coding Claude — Account Switch + New Architectural Decisions

Paste this as a message to the coding Claude agent. Attach the updated `CLAUDE.md` alongside it.

---

Quick administrative + substantive update for you.

**1. Account switch.** I moved this project from my personal Claude account to my corporate Claude account. You're now talking to me through the corporate account. Nothing about the codebase or the working relationship changes — same project, same patterns, same person — but the conversation history from the personal account doesn't carry over here. If you reference a past discussion and I don't recognize it, that's why; ask me to refresh, don't assume I remember.

**2. Architectural decisions made outside your context.** While setting up the new account, I had a strategic conversation about deployment, security, and platform direction. Several decisions came out of it that change v1.0 scope materially. **Read the updated `CLAUDE.md` (attached) before your next response.** Specifically read the new "Deployment & security posture" section — it didn't exist before.

**Headline decisions:**

- **VCP is the first of multiple platform apps** (Finance, Operations next). Architecture shifts from "an app" to "one of several services." VCP owns its data; cross-app reads via API only; no shared databases.
- **Production target: Azure + Azure SQL.** SQLite stays for dev. Migration is scheduled BEFORE Phase 3, not at v1.0 cutover.
- **Auth: Entra SSO for internal users, Entra B2B for vendors.** No local credentials in v1.0.
- **Authorization model: DB-table-based** (`user_email → role → trading_company_id`). Server-side enforcement on every endpoint. Never client-side filtering for security purposes.
- **Threat model: authenticated insider with wrong role** is the primary threat — not anonymous attackers. SSO handles authentication only; your code handles authorization.

**3. v1.0 ship blockers list grew.** Previously: Phase 2b.2, 2b.3, Phase 3. Added:

4. SQLite → Azure SQL migration (before Phase 3)
5. Authorization audit pass (every endpoint, server-side role + scope verification)
6. Roles/permissions table design + implementation
7. Entra SSO + B2B integration (replacing/augmenting current JWT auth)
8. Vendor data isolation verified end-to-end (curl-based tests, not UI)
9. SQL injection audit (parameterization confirmed across `routes.js` + `routes-supporting.js`)
10. Secrets to Azure Key Vault
11. MFA via Entra Conditional Access
12. Audit logging (scope: TBD)

Realistic v1.0 timeline updated from ~2 weeks to ~4-6 weeks. I've accepted that tradeoff deliberately.

**4. What I want you to do, in order:**

1. **Read the updated `CLAUDE.md` end-to-end.** Don't skim. The "Deployment & security posture" section is new and substantial; the other sections have small updates throughout (tech stack, data model, conventions, gaps).
2. **Compare against your current understanding.** Tell me where the new file conflicts with assumptions you were operating on. I'd rather surface conflicts now than discover them in code.
3. **Confirm your read on three specific things:**
   - Pattern B sync now requires independent role re-validation on BOTH writes (SR-side AND styles-side). Was this already in place, or is it new work?
   - The `allowedFields` pattern at `routes.js:936-940` needs to extend to **every** mutation endpoint, not just styles PATCH. Do you have a sense of how many endpoints currently lack it?
   - Read endpoints returning vendor-scoped data — is filtering currently server-side (WHERE clause) or client-side (JS array filter)? If you don't know, say so; we'll find out together via the audit pass.
4. **Do NOT start the Phase 2b.2 build prompt yet.** B3 (repeat style history) is still being investigated, B6 (Target LDP inconsistency) hasn't been characterized, and the security audit pass is now sequenced before further phase work. Confirm you're parking 2b.2 build until I explicitly approve.
5. **Surface anything in the existing code that contradicts the new posture.** Honest read, not soft answers. If `routes-supporting.js` has client-side filtering for vendor data, I want to know now — that's a v1.0 blocker I didn't know about.

**5. Working patterns unchanged.** Push back when I'm wrong or rushed. "Code applied" ≠ "verified working." Smoke tests after every claim of done. Sub-phases ship independently. Everything in the working-with-Daniel section of `CLAUDE.md` still applies.

**6. One thing I want to flag explicitly.** This update changes scope significantly. You may have been operating on assumptions that the new posture invalidates (e.g., "we'll harden later," "client-side filtering is fine for now," "JWT is the auth path"). If any of your in-flight work assumes the old posture, stop and tell me. We adjust before you continue, not after.

Once you've read the new `CLAUDE.md` and answered the three confirm-your-read questions, we'll re-plan sequencing. Probably: finish triage of B3/B6/B7 → security audit pass → 2b.2 → 2b.3 → Azure SQL migration → Phase 3. But that's a draft, not locked.

---

**Files attached for this update:**
- `CLAUDE.md` (updated — replaces the version in your project knowledge)

Re-upload `CLAUDE.md` to project knowledge in your environment so it's the version every future session sees.
