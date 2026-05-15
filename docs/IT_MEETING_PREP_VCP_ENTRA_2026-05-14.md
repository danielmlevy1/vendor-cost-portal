# VCP × Entra Integration — IT Conversation Prep

**Date:** May 14, 2026
**Last updated:** May 14, 2026 (decisions locked + group list added)
**Purpose:** Information needed from IT before we can complete A3 (roles/permissions) and build A6 (Entra SSO) for the Vendor Cost Portal.
**Status:** Decisions locked — pending IT action on group setup + department normalization

---

## What VCP is — Context to brief IT

The **Vendor Cost Portal (VCP)** is an internal fashion FOB (free-on-board) costing tool used by Production Coordination, Planning, Sales, Design, and Tech Design teams to collect vendor quotes, compare costs across trading companies and countries of origin, and make placement decisions.

**Current state (May 14):**
- Built on Node.js / SQLite / vanilla JavaScript SPA
- Internal hosting (not yet production)
- Authentication today is JWT-based with bcrypt passwords stored in SQLite (a temporary setup — will be replaced by Entra SSO)
- 6 internal demo users seeded for development
- 27 vendor (trading company) demo accounts for development

**Where we're heading:**
- **Stage A go-live: May 29, 2026** (~2 weeks). Internal soft launch — Production Coordination, Sales, Design, Planning teams using VCP for live FOB collection. **Internal users only.**
- **Stage B: ~June 26.** Vendor pilot — selected trading companies log in directly to submit quotes.
- **Stage C: ~August 7.** Full vendor rollout.

**Architecture decision:** Role assignment driven by **Entra security groups**. IT manages group membership in Entra natively; VCP reads the `groups` claim from the SSO token at login.

---

## DECISIONS LOCKED

The following are now agreed and locked. IT can proceed on these without further discussion.

### Naming convention

All VCP-related Entra groups use the format:

**`VCP-<Company>-<Role>`**

Where:
- `VCP` — application namespace prefix
- `<Company>` — short company identifier (`Highlife` for this instance)
- `<Role>` — VCP role name in title case with hyphens between words (e.g., `PC`, `Sales-Mgmt`, `Tech-Design`)

**Rationale:**
- `VCP-` prefix scopes the namespace and sorts cleanly in admin tools
- Company prefix supports the multi-tenancy approach below
- Hyphen-separated title case is readable in tokens and admin UIs

### Multi-tenancy approach — separate instances per company

If VCP rolls out to other companies in the corporate family, each will get a **separate VCP deployment** (own database, own URL, own Entra groups). No shared-database multi-tenancy.

**Rationale:** companies don't share data (no shared vendors, no cross-company reporting). Separate instances give strongest possible data isolation (physical separation) with zero engineering investment in multi-tenancy code. Each company gets `VCP-<TheirCompany>-*` groups pointing to their own instance.

**For now, only `VCP-Highlife-*` groups exist.** The other-company question is informational, not blocking.

### Groups to create

**Dynamic groups (6) — auto-membership based on `user.department`:**

| Group | Type |
|---|---|
| `VCP-Highlife-PC` | Dynamic |
| `VCP-Highlife-PC-ReadOnly` | Dynamic (new — read-only access) |
| `VCP-Highlife-Sales` | Dynamic |
| `VCP-Highlife-Planning` | Dynamic |
| `VCP-Highlife-Design` | Dynamic |
| `VCP-Highlife-Tech-Design` | Dynamic |

**Static groups (2) — manual assignment:**

| Group | Notes |
|---|---|
| `VCP-Highlife-Admin` | ~5 users, manually assigned |
| `VCP-Highlife-Sales-Mgmt` | ~3-5 senior sales people, manually assigned |

**A user can be in BOTH a dynamic and static group** (e.g., Production dept → auto-added to `VCP-Highlife-PC`, manually added to `VCP-Highlife-Admin`). VCP code handles precedence — higher-privilege role wins.

### Department → group mapping

| Group | Departments |
|---|---|
| `VCP-Highlife-PC` | Production, Production and Sourcing, Production (Overseas), Production & Sourcing |
| `VCP-Highlife-PC-ReadOnly` | Compliance and QA, Finance, Sales Operations, Operations, QA & Compliance, Executive, Compliance & QA |
| `VCP-Highlife-Sales` | Sales |
| `VCP-Highlife-Planning` | Planning, Planning and Replenishment, Planning & Replenishment, Planning and eCommerce, Planning (Replen) |
| `VCP-Highlife-Design` | Design, Merchandising, Women's Design, Design and Merchandising, Graphics & Packaging, Design (Mens), Merchandising & Design |
| `VCP-Highlife-Tech-Design` | Technical Design |

### Departments NOT mapped to any VCP group (15)

Confirm intentional — these employees will not have access to VCP:

- Strategy
- Distribution
- Packaging & Creative Corporate Services
- Warehousing & Distribution
- Human Resources
- Global Sourcing
- Creative Marketing
- Information Technology
- International Transportation and Trade
- Testing
- Office Management
- Digital Product Creation
- Military Sales Team
- Shore Magic
- International Transportation & Trade

**Worth a quick sanity check on:** Information Technology (may need read-only for support), Strategy, Executive-adjacent departments not already covered. If any should have access, let me know.

### Roles in VCP code (for reference)

These are the internal VCP role identifiers each Entra group maps to:

| Entra Group | VCP Role |
|---|---|
| `VCP-Highlife-Admin` | `admin` |
| `VCP-Highlife-Sales-Mgmt` | `sales_mgmt` |
| `VCP-Highlife-Sales` | `sales` |
| `VCP-Highlife-PC` | `pc` |
| `VCP-Highlife-PC-ReadOnly` | `pc_readonly` |
| `VCP-Highlife-Planning` | `planning` |
| `VCP-Highlife-Design` | `design` |
| `VCP-Highlife-Tech-Design` | `tech_design` |
| (Stage B placeholder) | `vendor` |

---

## REMAINING IT ASKS — P0 (BLOCKING)

These need to be addressed before VCP can complete A3 (role resolution) and A6 (Entra SSO).

### 1. Department-name normalization

Our directory has duplicate-spelling departments — same logical department, different strings:

- `Compliance and QA` AND `Compliance & QA`
- `Planning and Replenishment` AND `Planning & Replenishment`
- `Production and Sourcing` AND `Production & Sourcing`
- `International Transportation and Trade` AND `International Transportation & Trade`

**Ask IT:** Normalize directory data — pick one spelling per logical department and update Entra records to match. If not possible, confirm — we can write the dynamic rules to cover both spellings, but the data hygiene is preferred.

### 2. Complete department list

**Ask IT:** Send back a flat list of every distinct value currently in the `department` attribute across the directory. This lets us:
- Spot any departments we missed in the mapping above
- Confirm no surprises before dynamic group rules are written

### 3. Multi-company scoping attribute

If users from other companies in the corporate group exist in the Entra tenant, the dynamic rules need to filter by company. Example rule:

```
(user.companyName -eq "Highlife LLC") -and (user.department -eq "Sales")
```

**Ask IT:** Confirm which attribute identifies Highlife employees (`companyName`, `extensionAttribute1`, `dirSyncEnabled`, etc.). Without this filter, employees from other companies with a department of "Sales" (if any) would accidentally get VCP access via the dynamic rule.

### 4. Token claim format

The access/ID token issued at sign-in needs to include a `groups` claim listing the user's VCP-* group memberships.

**Ask IT:**
- Enable the `groups` claim in the VCP app registration's token configuration
- Confirm whether the claim contains group **ObjectIDs (GUIDs)** or **display names** — VCP can work with either, but we need to know which

### 5. App registration

**Ask IT:** Create the VCP app registration in Entra and provide:
- Tenant ID
- Client ID
- Client Secret (delivered securely — not in email/chat)
- Authority URL (typically `https://login.microsoftonline.com/{tenant-id}`)
- Configured redirect URI (development: `http://localhost:3002/auth/callback`; production TBD)

### 6. Microsoft Graph API access — VCP's call

**Ask IT:** Can VCP have an app registration with permission to query Microsoft Graph for user/group info? (e.g., `User.Read.All`, `GroupMember.Read.All`). This would enable the admin UI to show "who has admin role" without VCP maintaining its own user list.

If Graph access is restricted, VCP can rely purely on the token's `groups` claim — simpler but limits some admin UI capabilities.

### 7. Timeline

**Ask IT to confirm:**
- Department list + normalization decisions: within 5 days
- Entra groups created + dynamic rules in place: within 7 days
- App registration + test tenant ready: within 10 days

Stage A target is **May 29, 2026.** Let IT know if any of this is unrealistic.

---

## P1 — Important questions (need before Stage A ships)

### Onboarding & offboarding process

- [ ] **When a new employee joins, what's the process for getting them VCP access?**
  - Does IT add them to the appropriate Entra group as part of standard onboarding?
  - Is there a request form / ticket process for VCP-Admin or VCP-Sales-Mgmt?
- [ ] **When an employee leaves, what's the offboarding signal?**
  - Disabled in Entra → token validation fails → user can't log in. Good.
  - Removed from VCP group but account still active → user can still authenticate but no VCP role assigned. What's the UX? (Probably: "You don't have access to this application — contact IT.")

### MFA / Conditional Access

- [ ] **What Conditional Access policies apply to VCP login?**
  E.g., MFA required, device compliance required, specific network IP ranges only.
- [ ] **Are there policies that would interfere with B2B vendor logins later (Stage B)?**
  Some Conditional Access policies block guest accounts by default.

### Token lifetime / session policies

- [ ] **What's the access token lifetime?**
  Affects how often users need to re-authenticate during a working session.
- [ ] **Is there a refresh token mechanism we should use?**

### Approved-apps registration

- [ ] **Does VCP need to be added to any internal "approved applications" list before it goes live?**
- [ ] **Is there a security review process we need to schedule?**

---

## P2 — Operational questions (need before Stage B / vendor rollout)

### B2B guest accounts (vendors)

- [ ] **What's the process for inviting a vendor as a B2B guest?**
- [ ] **Will vendors use their existing Microsoft accounts (if they have them) or get external identities?**
- [ ] **Are there per-guest licensing costs we should budget for?**
- [ ] **Vendor group structure** — defer until Stage B planning. Two options:
  - Option A: One group per TC (`VCP-Highlife-Vendor-SHK`, `VCP-Highlife-Vendor-AZ`, etc.)
  - Option B: Shared `VCP-Highlife-Vendor` group + custom attribute (`extensionAttribute1`) containing the TC code
  - To be decided closer to Stage B kickoff.

### Audit logging

- [ ] **What audit logs does Entra provide for VCP activity?** Sign-ins, failed sign-ins, group membership changes.
- [ ] **Can VCP query / export these logs, or are they admin-console-only?**

### Compliance / data residency

- [ ] **Any compliance requirements VCP needs to meet?** Data residency rules, encryption-at-rest, retention policies.

---

## What we'll deliver TO IT

- [ ] **Redirect URI(s):** Development: `http://localhost:3002/auth/callback`; Production: TBD based on hosting decision
- [ ] **Required scopes / permissions:** At minimum `openid`, `profile`, `email`, `User.Read`. Plus `groups` claim configuration.
- [ ] **Application name and description** for app registration
- [ ] **Logo / icon** for the consent screen (optional, IT preference)
- [ ] **Approximate user count:** ~25-30 internal at launch (Highlife employees), scaling to ~40 + ~30 vendor accounts over Stage B/C

---

## What we still need to decide internally (not for IT)

These are VCP-side decisions that depend on IT's answers above:

- [ ] **Token validation library:** `passport-azure-ad` vs. `@azure/msal-node` vs. a hand-rolled JWT verifier
- [ ] **Session management:** server-side sessions vs. Entra refresh tokens
- [ ] **Login UI:** custom login page that redirects to Entra, vs. Entra-hosted login with redirect back
- [ ] **Fallback for JWT-based vendor demo accounts** during the A→B transition

---

## After IT delivers

Once we have the **P0** answers + app registration + test groups in place:

1. **Update A3 design doc to v2** — reflect Entra-groups model (replaces deprecated v1)
2. **Implement Phase A3.1 (v2)** — `group_role_map` table + resolver function + seed data
3. **Implement Phase A3.2** — dual-source mode (Entra + JWT fallback during transition)
4. **Implement Phase A3.3 + A6** — Entra-canonical, JWT removed for internal users
5. **Code A12** — `pc_readonly` role with UI gating to hide edit/delete/+New buttons from read-only users
6. **Schedule a follow-up with IT** to walk through the proposed integration approach before code is finalized

---

## Notes from the IT conversation

*(Fill in answers here as you have the meeting / receive responses.)*

| Question # | Answer | Date |
|---|---|---|
| | | |
