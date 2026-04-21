-- =============================================================
-- VENDOR COST PORTAL — SQLite Schema
-- =============================================================
-- Conventions:
--   • All IDs are TEXT (base36 strings from the existing uid() helper)
--   • Timestamps are TEXT ISO-8601 (e.g. "2026-04-15T10:00:00.000Z")
--   • Booleans are INTEGER 0/1
--   • Money/rates are REAL
--   • Complex embedded arrays are TEXT stored as JSON
--   • No FK constraints enforced at DB level yet (added in API layer)
-- =============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;

-- ── Reference / lookup tables ─────────────────────────────────

CREATE TABLE IF NOT EXISTS coo_rates (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  country     TEXT NOT NULL,
  addl_duty   REAL NOT NULL DEFAULT 0,
  usa_mult    REAL NOT NULL DEFAULT 0,
  canada_mult REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id   TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- ── Users and auth ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  can_view_fob         INTEGER NOT NULL DEFAULT 0,
  can_view_sell_price  INTEGER NOT NULL DEFAULT 0,
  can_edit             INTEGER NOT NULL DEFAULT 0,
  can_edit_tech_pack   INTEGER NOT NULL DEFAULT 0,
  can_edit_sell_status INTEGER NOT NULL DEFAULT 0,
  brand_filter         TEXT NOT NULL DEFAULT '[]',  -- JSON array of brand strings
  tier_filter          TEXT NOT NULL DEFAULT '[]'   -- JSON array of tier strings
);

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,        -- bcrypt hash; never store plaintext
  role                TEXT NOT NULL,        -- admin | pc | planning | design | vendor
  department_id       TEXT,                 -- FK → departments.id
  internal_program_id TEXT,                 -- FK → internal_programs.id (legacy field)
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS trading_companies (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  payment_terms TEXT NOT NULL DEFAULT 'FOB',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Normalized COO list for each TC (replaces the coos[] array)
CREATE TABLE IF NOT EXISTS tc_coos (
  tc_id TEXT NOT NULL,
  coo   TEXT NOT NULL,
  PRIMARY KEY (tc_id, coo)
);

-- ── Internal programs and margin tables ──────────────────────

CREATE TABLE IF NOT EXISTS internal_programs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT,
  tier          TEXT,
  gender        TEXT,
  target_margin REAL
);

CREATE TABLE IF NOT EXISTS brand_tier_margins (
  id            TEXT PRIMARY KEY,
  brand         TEXT NOT NULL,
  tier          TEXT NOT NULL,
  target_margin REAL NOT NULL,
  UNIQUE (brand, tier)
);

-- ── Programs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programs (
  id                    TEXT PRIMARY KEY,
  name                  TEXT,
  brand                 TEXT,
  retailer              TEXT,
  gender                TEXT,
  season                TEXT,
  year                  TEXT,
  status                TEXT NOT NULL DEFAULT 'Draft',  -- Draft | Costing | Placed | Cancelled
  market                TEXT NOT NULL DEFAULT 'USA',
  target_margin         REAL,
  version               INTEGER NOT NULL DEFAULT 1,
  internal_program_id   TEXT,
  pending_design_handoff INTEGER NOT NULL DEFAULT 0,
  start_date            TEXT,
  end_date              TEXT,
  crd_date              TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);

-- ── Styles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS styles (
  id                 TEXT PRIMARY KEY,
  program_id         TEXT NOT NULL,
  style_number       TEXT,
  style_name         TEXT,
  category           TEXT,
  fabrication        TEXT,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | placed | cancelled
  proj_qty           REAL,
  actual_qty         REAL,
  proj_sell_price    REAL,
  duty_rate          REAL,
  est_freight        REAL,
  special_packaging  REAL,
  -- Dept-level status fields
  tech_pack_status   TEXT DEFAULT 'not_submitted',  -- not_submitted | submitted | changed
  sell_status        TEXT,
  sell_status_note   TEXT,
  -- Linking
  internal_program_id TEXT,
  -- Re-cost
  recost_request_id  TEXT,
  -- Design / tech notes
  tech_design_notes  TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_styles_program_id ON styles(program_id);

-- Tech Pack history: extracted from the embedded array on each style
-- (previously stored as styles.techPackHistory JSON)
CREATE TABLE IF NOT EXISTS tech_pack_history (
  id                TEXT PRIMARY KEY,
  style_id          TEXT NOT NULL,
  status            TEXT,
  previous_status   TEXT,
  changed_by        TEXT,
  changed_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  note              TEXT,
  recost_request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_tp_history_style_id ON tech_pack_history(style_id);

-- ── Assignments (program ↔ TC) ────────────────────────────────

CREATE TABLE IF NOT EXISTS assignments (
  id         TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  tc_id      TEXT NOT NULL,
  UNIQUE (program_id, tc_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_program_id ON assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tc_id      ON assignments(tc_id);

-- Which COOs are included for each (program, TC) assignment.
-- Absent row for an assignment = "all of the TC's COOs" (legacy rows are
-- backfilled at startup in database.js so this invariant always holds).
CREATE TABLE IF NOT EXISTS assignment_coos (
  assignment_id TEXT NOT NULL,
  coo           TEXT NOT NULL,
  PRIMARY KEY (assignment_id, coo)
);

CREATE INDEX IF NOT EXISTS idx_assignment_coos_assignment_id ON assignment_coos(assignment_id);

-- ── Submissions (TC cost quotes) ─────────────────────────────

CREATE TABLE IF NOT EXISTS submissions (
  id                TEXT PRIMARY KEY,
  tc_id             TEXT NOT NULL,
  style_id          TEXT NOT NULL,
  coo               TEXT NOT NULL,
  fob               REAL,
  factory_cost      REAL,
  tc_markup         REAL,
  payment_terms     TEXT DEFAULT 'FOB',
  moq               REAL,
  lead_time         REAL,
  vendor_comments   TEXT,
  status            TEXT NOT NULL DEFAULT 'submitted',  -- submitted | flagged | accepted | skipped
  flag_reason       TEXT,
  skip_reason       TEXT,
  is_outdated       INTEGER NOT NULL DEFAULT 0,
  entered_by_admin  INTEGER NOT NULL DEFAULT 0,
  recost_request_id TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT,
  UNIQUE (tc_id, style_id, coo)
);

CREATE INDEX IF NOT EXISTS idx_submissions_style_id ON submissions(style_id);
CREATE INDEX IF NOT EXISTS idx_submissions_tc_id    ON submissions(tc_id);

-- ── Revisions (append-only FOB/factoryCost change log) ───────

CREATE TABLE IF NOT EXISTS revisions (
  id                TEXT PRIMARY KEY,
  sub_id            TEXT NOT NULL,
  field             TEXT NOT NULL,  -- fob | factoryCost
  old_value         TEXT,
  new_value         TEXT,
  submitted_by      TEXT,
  submitted_by_name TEXT,
  submitted_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  type              TEXT,           -- flag | flag-clear | (null for price revisions)
  flag_color        TEXT,
  flag_note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisions_sub_id ON revisions(sub_id);

-- ── Placements ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placements (
  id             TEXT PRIMARY KEY,
  style_id       TEXT NOT NULL UNIQUE,
  tc_id          TEXT,
  coo            TEXT,
  confirmed_fob  REAL,
  placed_at      TEXT,
  placed_by      TEXT,
  placed_by_name TEXT,
  notes          TEXT
);

-- ── Cell Flags ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cell_flags (
  id               TEXT PRIMARY KEY,
  sub_id           TEXT NOT NULL,
  field            TEXT NOT NULL,
  color            TEXT,
  note             TEXT,
  flagged_by       TEXT,
  flagged_by_name  TEXT,
  flagged_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (sub_id, field)
);

-- ── Pending Changes (approval queue) ─────────────────────────

CREATE TABLE IF NOT EXISTS pending_changes (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,   -- tc | coo | internal-program | pc-user
  action           TEXT NOT NULL,   -- create | update | delete
  data             TEXT NOT NULL DEFAULT '{}',  -- JSON payload
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  proposed_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  proposed_by      TEXT,
  proposed_by_name TEXT,
  reviewed_by      TEXT,
  reviewed_at      TEXT
);

-- ── Customer program assignments ──────────────────────────────

CREATE TABLE IF NOT EXISTS customer_assignments (
  id          TEXT PRIMARY KEY,
  program_id  TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  UNIQUE (program_id, customer_id)
);

-- ── Customer buys ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_buys (
  id          TEXT PRIMARY KEY,
  program_id  TEXT NOT NULL,
  style_id    TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  qty         REAL,
  sell_price  REAL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT,
  UNIQUE (program_id, style_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_buys_program ON customer_buys(program_id);

-- ── Style Links (placement grouping) ─────────────────────────

CREATE TABLE IF NOT EXISTS style_links (
  id         TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  style_ids  TEXT NOT NULL DEFAULT '[]',  -- JSON array of style IDs
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_style_links_program ON style_links(program_id);

-- ── Design Handoffs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS design_handoffs (
  id                      TEXT PRIMARY KEY,
  season                  TEXT,
  year                    TEXT,
  brand                   TEXT,
  tier                    TEXT,
  gender                  TEXT,
  styles_list             TEXT NOT NULL DEFAULT '[]',   -- JSON array of style objects
  fabrics_list            TEXT NOT NULL DEFAULT '[]',   -- JSON array of fabric objects
  trims_list              TEXT NOT NULL DEFAULT '[]',   -- JSON array of trim objects
  styles_uploaded         INTEGER NOT NULL DEFAULT 0,
  fabrics_uploaded        INTEGER NOT NULL DEFAULT 0,
  fabrics_uploaded_at     TEXT,
  trims_uploaded          INTEGER NOT NULL DEFAULT 0,
  trims_uploaded_at       TEXT,
  linked_program_id       TEXT,
  linked_request_id       TEXT,
  supplier_request_number TEXT,
  assigned_tc_ids         TEXT NOT NULL DEFAULT '[]',
  first_crd               TEXT,
  start_date              TEXT,
  end_date                TEXT,
  vendors_assigned_at     TEXT,
  submitted               INTEGER NOT NULL DEFAULT 0,
  submitted_at            TEXT,
  submitted_for_costing   INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── Fabric Library ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fabric_library (
  id           TEXT PRIMARY KEY,
  fabric_code  TEXT NOT NULL UNIQUE,
  fabric_name  TEXT,
  content      TEXT,
  weight       TEXT,
  supplier     TEXT,
  source       TEXT DEFAULT 'manual',  -- manual | design-handoff
  handoff_id   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT
);

-- ── Fabric Standards Requests ────────────────────────────────
-- A request is: a vendor asking PD to supply a physical swatch of
-- a specific fabric tied to a costing program. PD groups outstanding
-- requests into a package (see fabric_packages), ships it, and marks
-- the package received.

CREATE TABLE IF NOT EXISTS fabric_requests (
  id                TEXT PRIMARY KEY,
  tc_id             TEXT NOT NULL,
  program_id        TEXT,                          -- program the request is tied to
  handoff_id        TEXT,                          -- source design handoff (fabric came from its fabrics_list)
  fabric_code       TEXT NOT NULL,
  fabric_name       TEXT,
  content           TEXT,
  swatch_qty        INTEGER,
  style_ids         TEXT,                          -- JSON array (styles using this fabric; for PD context)
  style_numbers     TEXT,                          -- JSON array (display copy — kept for email body)
  status            TEXT NOT NULL DEFAULT 'outstanding',
    -- outstanding | packaged | sent | received | cancelled
  package_id        TEXT,                          -- FK fabric_packages.id (nullable until grouped)
  requested_by      TEXT,                          -- vendor user name for audit
  requested_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at           TEXT,
  received_at       TEXT,
  cancel_reason     TEXT,
  notes             TEXT,
  pd_status         TEXT,                          -- PD's marking when passing to production:
                                                   --   'complete' | 'none_on_hand' | 'incomplete'
  pd_notes          TEXT,                          -- free-text PD note for Production
  pd_qty            INTEGER                        -- qty PD is actually sending (may differ
                                                   -- from the vendor's requested swatch_qty)
);

CREATE INDEX IF NOT EXISTS idx_fabric_requests_tc_id     ON fabric_requests(tc_id);
CREATE INDEX IF NOT EXISTS idx_fabric_requests_status    ON fabric_requests(status);
CREATE INDEX IF NOT EXISTS idx_fabric_requests_package   ON fabric_requests(package_id);

CREATE TABLE IF NOT EXISTS fabric_packages (
  id            TEXT PRIMARY KEY,
  tc_id         TEXT NOT NULL,                    -- one package ships to one TC
  awb_number    TEXT,                              -- tracking / AWB number
  carrier       TEXT,
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  shipped_at    TEXT,
  received_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'      -- draft | sent | received | cancelled
);

CREATE INDEX IF NOT EXISTS idx_fabric_packages_tc_id  ON fabric_packages(tc_id);
CREATE INDEX IF NOT EXISTS idx_fabric_packages_status ON fabric_packages(status);

-- ── Factories (TC ↔ Factory ↔ Exporter ↔ Pay-to profiles) ────
-- Each row is one factory "profile" submitted by a Trading Company.
-- Captures name/address for the factory itself, the export company,
-- and the pay-to company, plus the relationship flags between them
-- and the business terms. Two term fields per relationship: the
-- terms the TC does on, and the terms HighLife (our company) does
-- on — Production sets HighLife terms during approval.
--
-- Lifecycle: pending → active | rejected. Active can toggle with
-- inactive without re-review. Rejected rows can be edited by the
-- TC and resubmitted (→ pending again). TC editing an active row
-- flips it back to pending for re-review.

CREATE TABLE IF NOT EXISTS factories (
  id                          TEXT PRIMARY KEY,
  tc_id                       TEXT NOT NULL,

  -- Factory. `factory_address` holds the street / line 1; the other
  -- four (city/state/country/zip) are split out as of v7.
  factory_name                TEXT NOT NULL,
  factory_address             TEXT,
  factory_city                TEXT,
  factory_state               TEXT,
  factory_country             TEXT,
  factory_zip                 TEXT,
  factory_related_to_tc       INTEGER NOT NULL DEFAULT 0,
  factory_terms               TEXT,                 -- TC's terms with factory
  factory_terms_hl            TEXT,                 -- HighLife's terms with factory

  -- Export Company (optional — has_exporter=0 means "not applicable")
  has_exporter                INTEGER NOT NULL DEFAULT 0,
  exporter_name               TEXT,
  exporter_address            TEXT,
  exporter_city               TEXT,
  exporter_state              TEXT,
  exporter_country            TEXT,
  exporter_zip                TEXT,
  exporter_related_to_tc      INTEGER NOT NULL DEFAULT 0,
  exporter_related_to_factory INTEGER NOT NULL DEFAULT 0,
  exporter_terms              TEXT,
  exporter_terms_hl           TEXT,

  -- Pay-to Company (optional — has_payto=0 means "not applicable")
  has_payto                   INTEGER NOT NULL DEFAULT 0,
  payto_name                  TEXT,
  payto_address               TEXT,
  payto_city                  TEXT,
  payto_state                 TEXT,
  payto_country               TEXT,
  payto_zip                   TEXT,
  payto_related_to_tc         INTEGER NOT NULL DEFAULT 0,
  payto_related_to_exporter   INTEGER NOT NULL DEFAULT 0,
  payto_related_to_factory    INTEGER NOT NULL DEFAULT 0,
  payto_terms                 TEXT,
  payto_terms_hl              TEXT,

  -- Logistics
  shipping_responsible        TEXT,                 -- 'tc' | 'factory' | 'exporter' | 'payto'
  port_of_shipping            TEXT,

  -- First-Sale qualification (admin toggle)
  first_sale_approved         INTEGER NOT NULL DEFAULT 0,
  first_sale_approved_by      TEXT,
  first_sale_approved_at      TEXT,

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'pending',
    -- pending | active | inactive | rejected
  submitted_by                TEXT,
  submitted_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_by                 TEXT,
  reviewed_at                 TEXT,
  rejection_reason            TEXT,
  deactivated_by              TEXT,
  deactivated_at              TEXT,
  notes                       TEXT,

  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_factories_tc_id  ON factories(tc_id);
CREATE INDEX IF NOT EXISTS idx_factories_status ON factories(status);

-- ── Sales Requests ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_requests (
  id                    TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'submitted',  -- submitted | converted | cancelled
  season                TEXT,
  year                  TEXT,
  brand                 TEXT,
  gender                TEXT,
  retailer              TEXT,
  in_warehouse_date     TEXT,
  cost_request_due_date TEXT,
  styles                TEXT NOT NULL DEFAULT '[]',  -- JSON array of style objects
  cancelled_styles      TEXT NOT NULL DEFAULT '[]',
  source_handoff_id     TEXT,
  handoff_id            TEXT,
  linked_program_id     TEXT,
  requested_by          TEXT,
  requested_by_name     TEXT,
  sales_submitted_at    TEXT,
  assigned_tc_ids       TEXT NOT NULL DEFAULT '[]',
  first_crd             TEXT,
  start_date            TEXT,
  end_date              TEXT,
  vendors_assigned_at   TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── Design Changes ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS design_changes (
  id              TEXT PRIMARY KEY,
  style_id        TEXT NOT NULL,
  program_id      TEXT,
  style_number    TEXT,
  description     TEXT,
  field           TEXT,
  previous_value  TEXT,
  new_value       TEXT,
  changed_by      TEXT,
  changed_by_name TEXT,
  changed_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_design_changes_style ON design_changes(style_id);

-- ── Re-cost Requests ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recost_requests (
  id                   TEXT PRIMARY KEY,
  program_id           TEXT NOT NULL,
  style_id             TEXT,
  style_ids            TEXT NOT NULL DEFAULT '[]',  -- JSON array (multi-style requests)
  status               TEXT NOT NULL DEFAULT 'pending_sales',
    -- pending_sales | pending_production | released | rejected | dismissed
  category             TEXT,
  note                 TEXT,
  previous_value       TEXT,
  new_value            TEXT,
  requested_by         TEXT,
  requested_by_name    TEXT,
  design_change_id     TEXT,
  sales_approved_by    TEXT,
  sales_approved_by_name TEXT,
  sales_approved_at    TEXT,
  released_by          TEXT,
  released_by_name     TEXT,
  released_at          TEXT,
  rejection_note       TEXT,
  rejected_stage       TEXT,
  rejected_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_recost_program ON recost_requests(program_id);
CREATE INDEX IF NOT EXISTS idx_recost_style   ON recost_requests(style_id);
CREATE INDEX IF NOT EXISTS idx_recost_status  ON recost_requests(status);

-- ── Cost History ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_history (
  id                TEXT PRIMARY KEY,
  style_id          TEXT NOT NULL,
  program_id        TEXT,
  type              TEXT,      -- recosted | placed | note
  category          TEXT,
  note              TEXT,
  requested_by      TEXT,
  requested_by_name TEXT,
  released_by       TEXT,
  released_by_name  TEXT,
  timestamp         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_cost_history_style   ON cost_history(style_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_program ON cost_history(program_id);

-- ── Schema version tracker ────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── Additive migrations (safe to re-run; ALTER TABLE fails silently in db.js) ──
-- These ensure existing databases pick up new columns without a full recreate.
-- database.js wraps each in try/catch and ignores "duplicate column" errors.

-- v2: extended submission fields
-- ALTER TABLE submissions ADD COLUMN tc_markup        REAL;
-- ALTER TABLE submissions ADD COLUMN moq              REAL;
-- ALTER TABLE submissions ADD COLUMN lead_time        REAL;
-- ALTER TABLE submissions ADD COLUMN vendor_comments  TEXT;
-- ALTER TABLE submissions ADD COLUMN skip_reason      TEXT;
-- ALTER TABLE submissions ADD COLUMN entered_by_admin INTEGER NOT NULL DEFAULT 0;

-- v2: confirmed_fob on placements
-- ALTER TABLE placements ADD COLUMN confirmed_fob REAL;

-- v2: tech_design_notes on styles
-- ALTER TABLE styles ADD COLUMN tech_design_notes TEXT;
