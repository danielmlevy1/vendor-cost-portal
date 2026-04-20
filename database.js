// =============================================================
// VENDOR COST PORTAL — Server-side SQLite data layer
// Opens (or creates) data/portal.db, applies schema.sql,
// and seeds all reference data on first run.
// =============================================================

'use strict';

const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const fs       = require('fs');
const path     = require('path');

const DB_PATH     = process.env.DB_PATH     || path.join(__dirname, 'data', 'portal.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// Apply schema — all statements are IF NOT EXISTS, safe to re-run
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// ── Seed helpers ───────────────────────────────────────────────

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

// ── Seed: Internal users ───────────────────────────────────────
function seedUsers() {
  if (count('users') > 0) return;

  const SEED = [
    { id: 'admin',     name: 'Admin Team',       email: 'admin@company.com',      password: 'admin123',  role: 'admin'    },
    { id: 'pc1',       name: 'Production Team',  email: 'pc@company.com',         password: 'pc123',     role: 'pc'       },
    { id: 'planning1', name: 'Planning & Sales', email: 'planning@company.com',   password: 'plan123',   role: 'planning' },
    { id: 'sales1',    name: 'Sales',            email: 'sales@company.com',      password: 'sales123',  role: 'planning' },
    { id: 'design1',   name: 'Design Team',      email: 'design@company.com',     password: 'design123', role: 'design'   },
    { id: 'techdes1',  name: 'Tech Design',      email: 'techdesign@company.com', password: 'tech123',   role: 'design'   },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  );

  for (const u of SEED) {
    insert.run(u.id, u.name, u.email, bcrypt.hashSync(u.password, SALT_ROUNDS), u.role);
  }
  console.log('[db] Seeded users');
}

// ── Seed: Trading companies ────────────────────────────────────
function seedTradingCompanies() {
  if (count('trading_companies') > 0) return;

  // All seed TCs share the same password — hash once
  const vendorHash = bcrypt.hashSync('vendor123', SALT_ROUNDS);

  const SEED_TCS = [
    { id: 'tc_az',   code: 'AZ',   name: 'Amazing Space',      email: 'az@vendor.com',   paymentTerms: 'FOB', coos: ['CN','KH'] },
    { id: 'tc_cs',   code: 'CS',   name: 'Consummate',          email: 'cs@vendor.com',   paymentTerms: 'FOB', coos: [] },
    { id: 'tc_eg',   code: 'EG',   name: 'Eastern Garment',     email: 'eg@vendor.com',   paymentTerms: 'FOB', coos: ['PK'] },
    { id: 'tc_fhd',  code: 'FHD',  name: 'Federal Home Depot',  email: 'fhd@vendor.com',  paymentTerms: 'FOB', coos: ['KH'] },
    { id: 'tc_gm',   code: 'GM',   name: 'Guomao',              email: 'gm@vendor.com',   paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
    { id: 'tc_gu',   code: 'GU',   name: 'Great Union',         email: 'gu@vendor.com',   paymentTerms: 'FOB', coos: ['KH','KY'] },
    { id: 'tc_hnm',  code: 'HNM',  name: 'HNM',                 email: 'hnm@vendor.com',  paymentTerms: 'FOB', coos: ['PK'] },
    { id: 'tc_hr',   code: 'HR',   name: 'Hongren',             email: 'hr@vendor.com',   paymentTerms: 'FOB', coos: ['CN','KH'] },
    { id: 'tc_hs',   code: 'HS',   name: 'Hansae',              email: 'hs@vendor.com',   paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
    { id: 'tc_kt',   code: 'KT',   name: 'KT Group',            email: 'kt@vendor.com',   paymentTerms: 'FOB', coos: [] },
    { id: 'tc_ly',   code: 'LY',   name: 'Liyang',              email: 'ly@vendor.com',   paymentTerms: 'FOB', coos: ['KH'] },
    { id: 'tc_mk',   code: 'MK',   name: 'Makalot',             email: 'mk@vendor.com',   paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
    { id: 'tc_ml',   code: 'ML',   name: 'Morelands',           email: 'ml@vendor.com',   paymentTerms: 'FOB', coos: ['JD','KH'] },
    { id: 'tc_rl',   code: 'RL',   name: 'Reliance',            email: 'rl@vendor.com',   paymentTerms: 'FOB', coos: ['KH'] },
    { id: 'tc_semi', code: 'SEMI', name: 'Semisphere',          email: 'semi@vendor.com', paymentTerms: 'FOB', coos: [] },
    { id: 'tc_shk',  code: 'SHK',  name: 'SHK',                 email: 'shk@vendor.com',  paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
    { id: 'tc_sw',   code: 'SW',   name: 'Shinwon',             email: 'sw@vendor.com',   paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
    { id: 'tc_tb',   code: 'TB',   name: 'Twobees',             email: 'tb@vendor.com',   paymentTerms: 'FOB', coos: ['ID','KH'] },
    { id: 'tc_tf',   code: 'TF',   name: 'TopForm',             email: 'tf@vendor.com',   paymentTerms: 'FOB', coos: ['TH'] },
    { id: 'tc_tl',   code: 'TL',   name: 'Talent',              email: 'tl@vendor.com',   paymentTerms: 'FOB', coos: ['CN','KH'] },
    { id: 'tc_tx',   code: 'TX',   name: 'Texray',              email: 'tx@vendor.com',   paymentTerms: 'FOB', coos: ['ES'] },
    { id: 'tc_ty',   code: 'TY',   name: 'Taieasy',             email: 'ty@vendor.com',   paymentTerms: 'FOB', coos: ['KH'] },
    { id: 'tc_uni',  code: 'UNI',  name: 'Universal',           email: 'uni@vendor.com',  paymentTerms: 'FOB', coos: ['TH'] },
    { id: 'tc_wb',   code: 'WB',   name: 'Willbes',             email: 'wb@vendor.com',   paymentTerms: 'FOB', coos: ['HT','ID'] },
    { id: 'tc_wbg',  code: 'WBG',  name: 'WorldBest',           email: 'wbg@vendor.com',  paymentTerms: 'FOB', coos: [] },
    { id: 'tc_wd',   code: 'WD',   name: 'Windeson',            email: 'wd@vendor.com',   paymentTerms: 'FOB', coos: ['CN','KH','LS'] },
    { id: 'tc_yt',   code: 'YT',   name: 'Yuenthai',            email: 'yt@vendor.com',   paymentTerms: 'FOB', coos: ['KH','TH'] },
  ];

  const insertTC  = db.prepare(
    'INSERT OR IGNORE INTO trading_companies (id, code, name, email, password_hash, payment_terms) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertCoo = db.prepare('INSERT OR IGNORE INTO tc_coos (tc_id, coo) VALUES (?, ?)');

  db.transaction(() => {
    for (const tc of SEED_TCS) {
      insertTC.run(tc.id, tc.code, tc.name, tc.email, vendorHash, tc.paymentTerms);
      for (const coo of tc.coos) insertCoo.run(tc.id, coo);
    }
  })();

  console.log('[db] Seeded trading companies');
}

// ── Seed: COO rates ────────────────────────────────────────────
function seedCooRates() {
  if (count('coo_rates') > 0) return;

  const SEED = [
    { id: 'BD', code: 'BD', country: 'Bangladesh', addl_duty: 0.100, usa_mult:  1.5000, canada_mult: 1.5714 },
    { id: 'KH', code: 'KH', country: 'Cambodia',   addl_duty: 0.190, usa_mult:  1.5000, canada_mult: 1.5714 },
    { id: 'CN', code: 'CN', country: 'China',       addl_duty: 0.275, usa_mult: -0.5556, canada_mult: 1.5714 },
    { id: 'EG', code: 'EG', country: 'Egypt',       addl_duty: 0.100, usa_mult:  1.5000, canada_mult: 0      },
    { id: 'ET', code: 'ET', country: 'Ethiopia',    addl_duty: 0.100, usa_mult:  2.1667, canada_mult: 0      },
    { id: 'ID', code: 'ID', country: 'Indonesia',   addl_duty: 0.190, usa_mult:  1.5000, canada_mult: 1.4286 },
    { id: 'HT', code: 'HT', country: 'Haiti',       addl_duty: 0.100, usa_mult:  1.5000, canada_mult: 1.4286 },
    { id: 'JD', code: 'JD', country: 'Jordan',      addl_duty: 0.150, usa_mult:  2.0000, canada_mult: 1.2857 },
    { id: 'KY', code: 'KY', country: 'Kenya',       addl_duty: 0.100, usa_mult:  2.0000, canada_mult: 2.0000 },
    { id: 'LS', code: 'LS', country: 'Lesotho',     addl_duty: 0.150, usa_mult:  2.0000, canada_mult: 2.2857 },
    { id: 'PK', code: 'PK', country: 'Pakistan',    addl_duty: 0.190, usa_mult:  1.1667, canada_mult: 1.1429 },
    { id: 'TH', code: 'TH', country: 'Thailand',    addl_duty: 0.190, usa_mult:  1.3333, canada_mult: 2.0000 },
    { id: 'TK', code: 'TK', country: 'Turkey',      addl_duty: 0.200, usa_mult:  1.1667, canada_mult: 0      },
    { id: 'VN', code: 'VN', country: 'Vietnam',     addl_duty: 0.200, usa_mult:  1.5000, canada_mult: 1.5714 },
    { id: 'ES', code: 'ES', country: 'Eswatini',    addl_duty: 0.100, usa_mult:  2.0000, canada_mult: 2.0000 },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO coo_rates (id, code, country, addl_duty, usa_mult, canada_mult) VALUES (?, ?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const r of SEED) insert.run(r.id, r.code, r.country, r.addl_duty, r.usa_mult, r.canada_mult);
  })();

  console.log('[db] Seeded COO rates');
}

// ── Seed: Customers ────────────────────────────────────────────
function seedCustomers() {
  if (count('customers') > 0) return;

  const SEED = [
    { id: 'cust1', code: 'WMT',  name: 'Walmart' },
    { id: 'cust2', code: 'TGT',  name: 'Target'  },
    { id: 'cust3', code: 'COST', name: 'Costco'  },
  ];

  const insert = db.prepare('INSERT OR IGNORE INTO customers (id, code, name) VALUES (?, ?, ?)');
  db.transaction(() => { for (const c of SEED) insert.run(c.id, c.code, c.name); })();
  console.log('[db] Seeded customers');
}

// ── Seed: Internal programs ────────────────────────────────────
function seedInternalPrograms() {
  if (count('internal_programs') > 0) return;

  const SEED = [
    { id: 'ip1', name: 'Reebok WM',      brand: 'Reebok',   tier: 'Mass',      gender: 'Mens',   target_margin: 0.55 },
    { id: 'ip2', name: 'Reebok Canada',  brand: 'Reebok',   tier: 'Mass',      gender: 'Ladies', target_margin: 0.55 },
    { id: 'ip3', name: 'Champion WM',    brand: 'Champion', tier: 'Mass',      gender: 'Mens',   target_margin: 0.45 },
    { id: 'ip4', name: 'And1 WM',        brand: 'And1',     tier: 'Mass',      gender: 'Mens',   target_margin: 0.48 },
    { id: 'ip5', name: 'Gaiam WM',       brand: 'Gaiam',    tier: 'Mass',      gender: 'Ladies', target_margin: 0.50 },
    { id: 'ip6', name: 'Head Specialty', brand: 'Head',     tier: 'Specialty', gender: 'Mens',   target_margin: 0.52 },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO internal_programs (id, name, brand, tier, gender, target_margin) VALUES (?, ?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const p of SEED) insert.run(p.id, p.name, p.brand, p.tier, p.gender, p.target_margin);
  })();
  console.log('[db] Seeded internal programs');
}

// ── Seed: Brand-tier margins ───────────────────────────────────
function seedBrandTierMargins() {
  if (count('brand_tier_margins') > 0) return;

  const SEED = [
    // Reebok
    { id: 'btm_rb_ms', brand: 'Reebok',   tier: 'Mass',      target_margin: 0.55 },
    { id: 'btm_rb_mt', brand: 'Reebok',   tier: 'Mid Tier',  target_margin: 0.52 },
    { id: 'btm_rb_op', brand: 'Reebok',   tier: 'Off Price', target_margin: 0.48 },
    { id: 'btm_rb_cl', brand: 'Reebok',   tier: 'Clubs',     target_margin: 0.50 },
    { id: 'btm_rb_sp', brand: 'Reebok',   tier: 'Specialty', target_margin: 0.53 },
    // Champion
    { id: 'btm_ch_ms', brand: 'Champion', tier: 'Mass',      target_margin: 0.45 },
    { id: 'btm_ch_mt', brand: 'Champion', tier: 'Mid Tier',  target_margin: 0.43 },
    { id: 'btm_ch_op', brand: 'Champion', tier: 'Off Price', target_margin: 0.40 },
    { id: 'btm_ch_cl', brand: 'Champion', tier: 'Clubs',     target_margin: 0.42 },
    { id: 'btm_ch_sp', brand: 'Champion', tier: 'Specialty', target_margin: 0.45 },
    // And1
    { id: 'btm_a1_ms', brand: 'And1',     tier: 'Mass',      target_margin: 0.48 },
    { id: 'btm_a1_mt', brand: 'And1',     tier: 'Mid Tier',  target_margin: 0.46 },
    { id: 'btm_a1_op', brand: 'And1',     tier: 'Off Price', target_margin: 0.42 },
    { id: 'btm_a1_cl', brand: 'And1',     tier: 'Clubs',     target_margin: 0.44 },
    { id: 'btm_a1_sp', brand: 'And1',     tier: 'Specialty', target_margin: 0.48 },
    // Gaiam
    { id: 'btm_ga_ms', brand: 'Gaiam',    tier: 'Mass',      target_margin: 0.50 },
    { id: 'btm_ga_mt', brand: 'Gaiam',    tier: 'Mid Tier',  target_margin: 0.48 },
    { id: 'btm_ga_op', brand: 'Gaiam',    tier: 'Off Price', target_margin: 0.44 },
    { id: 'btm_ga_cl', brand: 'Gaiam',    tier: 'Clubs',     target_margin: 0.46 },
    { id: 'btm_ga_sp', brand: 'Gaiam',    tier: 'Specialty', target_margin: 0.50 },
    // Head
    { id: 'btm_hd_ms', brand: 'Head',     tier: 'Mass',      target_margin: 0.48 },
    { id: 'btm_hd_mt', brand: 'Head',     tier: 'Mid Tier',  target_margin: 0.50 },
    { id: 'btm_hd_op', brand: 'Head',     tier: 'Off Price', target_margin: 0.44 },
    { id: 'btm_hd_cl', brand: 'Head',     tier: 'Clubs',     target_margin: 0.46 },
    { id: 'btm_hd_sp', brand: 'Head',     tier: 'Specialty', target_margin: 0.52 },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO brand_tier_margins (id, brand, tier, target_margin) VALUES (?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const m of SEED) insert.run(m.id, m.brand, m.tier, m.target_margin);
  })();
  console.log('[db] Seeded brand-tier margins');
}

// ── Seed: Departments ──────────────────────────────────────────
function seedDepartments() {
  if (count('departments') > 0) return;

  const SEED = [
    {
      id: 'dept-management',
      name: 'Management',
      description: 'Full view of everything in the system',
      can_view_fob: 1, can_view_sell_price: 1, can_edit: 0,
      can_edit_tech_pack: 1, can_edit_sell_status: 1,
      brand_filter: '[]', tier_filter: '[]',
    },
    {
      id: 'dept-production',
      name: 'Production',
      description: 'Full view and edit access with optional brand/tier filter',
      can_view_fob: 1, can_view_sell_price: 1, can_edit: 1,
      can_edit_tech_pack: 1, can_edit_sell_status: 1,
      brand_filter: '[]', tier_filter: '[]',
    },
    {
      id: 'dept-sales-price',
      name: 'Sales Management',
      description: 'Full pricing visibility (FOB/LDP) + Sell Status edit access',
      can_view_fob: 1, can_view_sell_price: 1, can_edit: 0,
      can_edit_tech_pack: 0, can_edit_sell_status: 1,
      brand_filter: '[]', tier_filter: '[]',
    },
    {
      id: 'dept-sales-noprc',
      name: 'Sales',
      description: 'Can see sell-in pricing but NOT vendor FOB/LDP',
      can_view_fob: 0, can_view_sell_price: 1, can_edit: 0,
      can_edit_tech_pack: 0, can_edit_sell_status: 1,
      brand_filter: '[]', tier_filter: '[]',
    },
    {
      id: 'dept-design',
      name: 'Design / Tech Design',
      description: 'No pricing visibility of any kind',
      can_view_fob: 0, can_view_sell_price: 0, can_edit: 0,
      can_edit_tech_pack: 1, can_edit_sell_status: 0,
      brand_filter: '[]', tier_filter: '[]',
    },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO departments
      (id, name, description, can_view_fob, can_view_sell_price, can_edit,
       can_edit_tech_pack, can_edit_sell_status, brand_filter, tier_filter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const d of SEED) {
      insert.run(
        d.id, d.name, d.description,
        d.can_view_fob, d.can_view_sell_price, d.can_edit,
        d.can_edit_tech_pack, d.can_edit_sell_status,
        d.brand_filter, d.tier_filter
      );
    }
  })();

  console.log('[db] Seeded departments');
}

// ── Additive migrations (for pre-existing databases) ──────────
// ALTER TABLE fails if the column already exists; we suppress that
// specific error so migrations are safe to re-run on any DB state.

function addColumn(table, column, definition) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

function runMigrations() {
  // v2: extended submission fields
  addColumn('submissions', 'tc_markup',        'REAL');
  addColumn('submissions', 'moq',              'REAL');
  addColumn('submissions', 'lead_time',        'REAL');
  addColumn('submissions', 'vendor_comments',  'TEXT');
  addColumn('submissions', 'skip_reason',      'TEXT');
  addColumn('submissions', 'entered_by_admin', 'INTEGER NOT NULL DEFAULT 0');
  // v2: confirmed_fob on placements
  addColumn('placements',  'confirmed_fob',    'REAL');
  // v2: tech_design_notes on styles
  addColumn('styles',      'tech_design_notes','TEXT');

  // v3: flag events in revisions
  addColumn('revisions', 'flag_color', 'TEXT');
  addColumn('revisions', 'flag_note',  'TEXT');

  // v3: design_handoffs extended fields
  addColumn('design_handoffs', 'tier',                  'TEXT');
  addColumn('design_handoffs', 'trims_list',            "TEXT NOT NULL DEFAULT '[]'");
  addColumn('design_handoffs', 'trims_uploaded',        'INTEGER NOT NULL DEFAULT 0');
  addColumn('design_handoffs', 'trims_uploaded_at',     'TEXT');
  addColumn('design_handoffs', 'linked_request_id',     'TEXT');
  addColumn('design_handoffs', 'assigned_tc_ids',       "TEXT NOT NULL DEFAULT '[]'");
  addColumn('design_handoffs', 'first_crd',             'TEXT');
  addColumn('design_handoffs', 'start_date',            'TEXT');
  addColumn('design_handoffs', 'end_date',              'TEXT');
  addColumn('design_handoffs', 'vendors_assigned_at',   'TEXT');
  addColumn('design_handoffs', 'submitted_for_costing', 'INTEGER NOT NULL DEFAULT 0');

  // v3: sales_requests extended fields
  addColumn('sales_requests', 'cancelled_styles',    "TEXT NOT NULL DEFAULT '[]'");
  addColumn('sales_requests', 'source_handoff_id',   'TEXT');
  addColumn('sales_requests', 'sales_submitted_at',  'TEXT');
  addColumn('sales_requests', 'assigned_tc_ids',     "TEXT NOT NULL DEFAULT '[]'");
  addColumn('sales_requests', 'first_crd',           'TEXT');
  addColumn('sales_requests', 'start_date',          'TEXT');
  addColumn('sales_requests', 'end_date',            'TEXT');
  addColumn('sales_requests', 'vendors_assigned_at', 'TEXT');

  // v3: style_links preferred_tc_id
  addColumn('style_links', 'preferred_tc_id', 'TEXT');

  // v3: pending_changes current_data (snapshot before the proposed change)
  addColumn('pending_changes', 'current_data', 'TEXT');

  // v4: assignment_coos — backfill legacy assignments with the TC's full
  // COO list so every assignment has explicit rows. Idempotent: only
  // touches assignments that have zero rows in assignment_coos.
  backfillAssignmentCoos();

  // v5: migrate legacy JSON-file fabric requests (data/fabric-requests.json)
  // into the new DB-backed fabric_requests table. One-shot; guarded by
  // "is table empty?" so reruns are no-ops. Leaves the file in place.
  importLegacyFabricRequests();

  // v6: PD's per-request marking when passing to production.
  addColumn('fabric_requests', 'pd_status', 'TEXT');
  addColumn('fabric_requests', 'pd_notes',  'TEXT');
  addColumn('fabric_requests', 'pd_qty',    'INTEGER');
}

function importLegacyFabricRequests() {
  if (count('fabric_requests') > 0) return;
  const file = path.join(__dirname, 'data', 'fabric-requests.json');
  if (!fs.existsSync(file)) return;
  let rows;
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { console.warn('[db] fabric-requests.json unreadable, skipping:', err.message); return; }
  if (!Array.isArray(rows) || !rows.length) return;

  const insert = db.prepare(`
    INSERT INTO fabric_requests
      (id, tc_id, program_id, handoff_id, fabric_code, fabric_name, content,
       swatch_qty, style_ids, style_numbers, status, package_id,
       requested_by, requested_at, sent_at, received_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    for (const r of rows) {
      insert.run(
        r.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
        r.tcId || '',
        r.programId || null,
        r.handoffId || null,
        r.fabricCode || '',
        r.fabricName || null,
        r.content || null,
        r.swatchQty != null ? Number(r.swatchQty) : null,
        JSON.stringify(Array.isArray(r.styleIds) ? r.styleIds : []),
        JSON.stringify(Array.isArray(r.styleNumbers) ? r.styleNumbers : []),
        r.status || 'outstanding',
        null,
        r.requestedBy || null,
        r.requestedAt || new Date().toISOString(),
        r.sentAt || null,
        r.receivedAt || null,
        r.notes || null
      );
    }
  });
  tx();
  console.log(`[db] Imported ${rows.length} legacy fabric requests from JSON`);
}

function backfillAssignmentCoos() {
  const rows = db.prepare(`
    SELECT a.id AS assignment_id, a.tc_id
    FROM assignments a
    WHERE NOT EXISTS (
      SELECT 1 FROM assignment_coos ac WHERE ac.assignment_id = a.id
    )
  `).all();
  if (!rows.length) return;

  const tcCoos = db.prepare('SELECT coo FROM tc_coos WHERE tc_id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO assignment_coos (assignment_id, coo) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const r of rows) {
      for (const { coo } of tcCoos.all(r.tc_id)) insert.run(r.assignment_id, coo);
    }
  });
  tx();
  console.log(`[db] Backfilled assignment_coos for ${rows.length} legacy assignments`);
}

// ── Run all seeders ────────────────────────────────────────────
runMigrations();
seedUsers();
seedTradingCompanies();
seedCooRates();
seedCustomers();
seedInternalPrograms();
seedBrandTierMargins();
seedDepartments();

module.exports = db;
