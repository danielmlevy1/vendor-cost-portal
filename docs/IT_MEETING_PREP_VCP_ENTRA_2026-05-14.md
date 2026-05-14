# VCP × Entra Integration — IT Conversation Prep

**Date:** May 14, 2026
**Purpose:** Information needed from IT before we can redesign A3 (roles/permissions) and build A6 (Entra SSO) for the Vendor Cost Portal.
**Status:** Pending IT input

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

**Why we need IT:**
We were going to handle role assignment ourselves via a CSV upload of the company directory mapped to VCP roles. After consulting with IT, the cleaner architecture is **Entra security groups → VCP roles**, with IT managing group membership in Entra natively.

**Roles we need to map:**

| VCP Role | Approximate scope |
|---|---|
| admin | VCP owner / IT admin (~5 people) |
| sales_mgmt | Senior sales decision-makers (~3-5 people) |
| sales | Sales team |
| pc | Production Coordination |
| planning | Planning |
| design | Design team |
| tech_design | Tech Design specialists (may or may not be a distinct group today) |
| vendor | External trading companies (one identity per trading company at Stage B) |

---

## P0 — Critical questions (must answer before we redesign A3)

These block our next implementation step.

### 1. Group naming and structure

- [ ] **What naming convention does IT prefer for VCP groups?**
  Options: `VCP-Admin`, `VCP_Admin`, `vcp.admin`, `App-VCP-Admin`. We'll use whatever you standardize.
- [ ] **Will groups exist for all 7 internal roles, or do we consolidate any?**
  Specifically: is `Tech Design` its own group or folded into `Design`?
- [ ] **Will `sales_mgmt` be a distinct group from `sales`, or is it managed inside `sales` membership only?**

### 2. Token contents

- [ ] **What's in the `groups` claim of the access/ID token — group ObjectIDs (GUIDs) or display names?**
  - GUIDs are stable but cryptic in code (`f47ac10b-58cc-4372-a567-0e02b2c3d479` → `admin` role)
  - Display names are readable but break if IT renames a group later
  - This determines whether we map by ID (more robust) or by name (more readable)
- [ ] **What happens when a user belongs to more than ~200 groups?**
  Entra switches to a "claim overage" pattern requiring a Graph API call. Unlikely to hit for VCP-specific groups, but worth knowing.

### 3. Vendor group structure (Stage B planning)

- [ ] **Will each trading company (vendor) get its own Entra group, or do all vendors share one group with a different attribute identifying which TC they represent?**
  - Option A: One group per TC (`VCP-Vendor-SHK`, `VCP-Vendor-AZ`, etc. — 27+ groups today, growing as you onboard vendors)
  - Option B: Shared `VCP-Vendor` group + custom attribute (`extensionAttribute1` or similar) containing the TC code
  - Option C: Some other mechanism IT prefers
  - This decision shapes our entire vendor identity model.

### 4. Microsoft Graph API access

- [ ] **Can VCP have an app registration with permission to query Microsoft Graph?**
  Specifically: read user info, read group memberships. This is for the admin UI to show "who has admin role" without VCP maintaining its own user list.
- [ ] **If yes, what permissions are acceptable? `User.Read.All`, `GroupMember.Read.All`?**
- [ ] **Or do we trust the token's `groups` claim only and avoid Graph entirely?**
  This is simpler but means VCP can't show "all users in a role" — only "this currently-logged-in user's role."

### 5. Timeline

- [ ] **When can IT have a test tenant / app registration available for VCP development?**
  Ideal: within the next 5 days, since Stage A is May 29.
- [ ] **Who's our point person for the integration on the IT side?**
- [ ] **Will IT create the VCP groups, or are we expected to provide a list and IT creates them?**

---

## P1 — Important questions (need before Stage A ships)

### 6. Onboarding & offboarding process

- [ ] **When a new employee joins, what's the process for getting them VCP access?**
  - Does IT add them to the appropriate Entra group as part of standard onboarding?
  - Is there a request form / ticket process?
- [ ] **When an employee leaves, what's the offboarding signal?**
  - Disabled in Entra → token validation fails → user can't log in. Good.
  - Removed from VCP group but account still active → user can still authenticate but no VCP role assigned. What's the UX? (Probably: "You don't have access to this application — contact IT.")

### 7. MFA / Conditional Access

- [ ] **What Conditional Access policies apply to VCP login?**
  E.g., MFA required, device compliance required, specific network IP ranges only.
- [ ] **Are there policies that would interfere with B2B vendor logins later (Stage B)?**
  Some Conditional Access policies block guest accounts by default.

### 8. Token lifetime / session policies

- [ ] **What's the access token lifetime?**
  Affects how often users need to re-authenticate during a working session.
- [ ] **Is there a refresh token mechanism we should use?**
  Versus requiring full re-login periodically.

### 9. Approved-apps registration

- [ ] **Does VCP need to be added to any internal "approved applications" list before it goes live?**
- [ ] **Is there a security review process we need to schedule?**

---

## P2 — Operational questions (need before Stage B / vendor rollout)

### 10. B2B guest accounts (vendors)

- [ ] **What's the process for inviting a vendor as a B2B guest?**
- [ ] **Will vendors use their existing Microsoft accounts (if they have them) or get external identities?**
- [ ] **Are there per-guest licensing costs we should budget for?**

### 11. Audit logging

- [ ] **What audit logs does Entra provide for VCP activity?**
  Sign-ins, failed sign-ins, group membership changes.
- [ ] **Can VCP query / export these logs, or are they admin-console-only?**

### 12. Compliance / data residency

- [ ] **Any compliance requirements VCP needs to meet?**
  E.g., specific data residency rules, encryption-at-rest requirements, retention policies.

---

## What we'll deliver TO IT

Things VCP needs to provide so IT can configure their side:

- [ ] **Redirect URI(s):**
  Development: `http://localhost:3002/auth/callback`
  Production: TBD based on hosting decision
- [ ] **Required scopes / permissions:**
  At minimum: `openid`, `profile`, `email`, `User.Read`. Plus `groups` claim configuration.
- [ ] **Application name and description** for app registration
- [ ] **Logo / icon** for the consent screen (if IT wants one)
- [ ] **Approximate user count:** ~25 internal at launch, scaling to ~30-40 internal + ~30 vendor accounts over Stage B/C

---

## What IT needs to deliver TO us

Once decisions are made, we need:

- [ ] **Tenant ID** (GUID)
- [ ] **Client ID** for the VCP app registration
- [ ] **Client Secret** (delivered securely — not in email/chat)
- [ ] **Authority URL** (`https://login.microsoftonline.com/{tenant-id}` typically)
- [ ] **Configured redirect URIs**
- [ ] **Groups claim enabled in token** with the specific groups VCP needs
- [ ] **Test user accounts** in dev tenant, with assignments to representative groups
- [ ] **Sample token (decoded)** for one test user so we can confirm the `groups` claim format before writing code
- [ ] **List of VCP group ObjectIDs** (if we're mapping by ID rather than name)
- [ ] **Production tenant access** (or confirmation that dev and prod use the same tenant)

---

## What we still need to decide internally (not for IT)

These are VCP-side decisions that depend on IT's answers above:

- [ ] **Token validation library:** `passport-azure-ad` vs. `@azure/msal-node` vs. a hand-rolled JWT verifier
- [ ] **Session management:** server-side sessions vs. Entra refresh tokens
- [ ] **Login UI:** custom login page that redirects to Entra, vs. Entra-hosted login with redirect back
- [ ] **Fallback for JWT-based vendor demo accounts** during the A→B transition

---

## After the IT meeting

Once we have answers to the **P0** questions:

1. **Update the A3 design doc** (`/docs/A3_PERMISSIONS_DESIGN_2026-05-12.md`) → new v2 reflecting Entra-groups model
2. **Re-scope Phase A3.1** based on the new design
3. **Coordinate A3 and A6 implementation** as a single integrated workstream (no longer independent)
4. **Schedule a follow-up with IT** to walk through the proposed integration approach before code is written

---

## Notes from the IT conversation

*(Fill in answers here as you have the meeting.)*

| Question # | Answer | Date |
|---|---|---|
| | | |
