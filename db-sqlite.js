// =============================================================
// VENDOR COST PORTAL — SQLite database initializer
// Uses better-sqlite3 (synchronous API, no async needed)
// =============================================================

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ── Config ────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'portal.db');
const SCHEMA  = path.join(__dirname, 'schema.sql');

// ── Helpers ───────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();

// Temporary password hasher — swapped for bcrypt once bcrypt is installed
// Returns a deterministic placeholder so seeds work without bcrypt yet.
function hashPassword(plaintext) {
  try {
    return require('bcrypt').hashSync(plaintext, 10);
  } catch {
    // bcrypt not yet installed — store a clearly-marked stub
    return 'UNHASHED:' + plaintext;
  }
}

// ── Open / create database ────────────────────────────────────
function openDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);

  // Apply the schema (CREATE TABLE IF NOT EXISTS — idempotent)
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  db.exec(schema);

  return db;
}

// ── Seed data ─────────────────────────────────────────────────
// Mirrors SEED_* constants in db.js exactly.
// Uses INSERT OR IGNORE so re-running is safe.

function seedDatabase(db) {
  const alreadySeeded = db.prepare('SELECT COUNT(*) as c FROM users').get().c > 0;
  if (alreadySeeded) return; // Don't re-seed an existing database

  console.log('[db-sqlite] Seeding initial data...');

  // ── COO Rates ────────────────────────────────────────────────
  const insertCoo = db.prepare(`
    INSERT OR IGNORE INTO coo_rates (id, code, country, addl_duty, usa_mult, canada_mult)
    VALUES (@id, @code, @country, @addlDuty, @usaMult, @canadaMult)
  `);
  const COO_RATES = [
    { id:'BD', code:'BD', country:'Bangladesh', addlDuty:0.100, usaMult:1.5000, canadaMult:1.5714 },
    { id:'KH', code:'KH', country:'Cambodia',   addlDuty:0.190, usaMult:1.5000, canadaMult:1.5714 },
    { id:'CN', code:'CN', country:'China',       addlDuty:0.275, usaMult:-0.5556,canadaMult:1.5714 },
    { id:'EG', code:'EG', country:'Egypt',       addlDuty:0.100, usaMult:1.5000, canadaMult:0 },
    { id:'ET', code:'ET', country:'Ethiopia',    addlDuty:0.100, usaMult:2.1667, canadaMult:0 },
    { id:'ID', code:'ID', country:'Indonesia',   addlDuty:0.190, usaMult:1.5000, canadaMult:1.4286 },
    { id:'HT', code:'HT', country:'Haiti',       addlDuty:0.100, usaMult:1.5000, canadaMult:1.4286 },
    { id:'JD', code:'JD', country:'Jordan',      addlDuty:0.150, usaMult:2.0000, canadaMult:1.2857 },
    { id:'KY', code:'KY', country:'Kenya',       addlDuty:0.100, usaMult:2.0000, canadaMult:2.0000 },
    { id:'LS', code:'LS', country:'Lesotho',     addlDuty:0.150, usaMult:2.0000, canadaMult:2.2857 },
    { id:'PK', code:'PK', country:'Pakistan',    addlDuty:0.190, usaMult:1.1667, canadaMult:1.1429 },
    { id:'TH', code:'TH', country:'Thailand',    addlDuty:0.190, usaMult:1.3333, canadaMult:2.0000 },
    { id:'TK', code:'TK', country:'Turkey',      addlDuty:0.200, usaMult:1.1667, canadaMult:0 },
    { id:'VN', code:'VN', country:'Vietnam',     addlDuty:0.200, usaMult:1.5000, canadaMult:1.5714 },
    { id:'ES', code:'ES', country:'Eswatini',    addlDuty:0.100, usaMult:2.0000, canadaMult:2.0000 },
  ];
  const seedCoos = db.transaction(() => COO_RATES.forEach(r => insertCoo.run(r)));
  seedCoos();

  // ── Customers ─────────────────────────────────────────────────
  const insertCustomer = db.prepare(`INSERT OR IGNORE INTO customers (id, code, name) VALUES (?, ?, ?)`);
  db.transaction(() => {
    insertCustomer.run('cust1', 'WMT',  'Walmart');
    insertCustomer.run('cust2', 'TGT',  'Target');
    insertCustomer.run('cust3', 'COST', 'Costco');
  })();

  // ── Departments ───────────────────────────────────────────────
  const insertDept = db.prepare(`
    INSERT OR IGNORE INTO departments
      (id, name, description, can_view_fob, can_view_sell_price, can_edit,
       can_edit_tech_pack, can_edit_sell_status, brand_filter, tier_filter)
    VALUES (@id, @name, @description, @canViewFOB, @canViewSellPrice, @canEdit,
            @canEditTechPack, @canEditSellStatus, '[]', '[]')
  `);
  db.transaction(() => {
    insertDept.run({ id:'dept-management',  name:'Management',       description:'Full view of everything in the system',                           canViewFOB:1, canViewSellPrice:1, canEdit:0, canEditTechPack:1, canEditSellStatus:1 });
    insertDept.run({ id:'dept-production',  name:'Production',       description:'Full view and edit access with optional brand/tier filter',       canViewFOB:1, canViewSellPrice:1, canEdit:1, canEditTechPack:1, canEditSellStatus:1 });
    insertDept.run({ id:'dept-sales-price', name:'Sales Management', description:'Full pricing visibility (FOB/LDP) + Sell Status edit access',    canViewFOB:1, canViewSellPrice:1, canEdit:0, canEditTechPack:0, canEditSellStatus:1 });
    insertDept.run({ id:'dept-sales-noprc', name:'Sales',            description:'Can see sell-in pricing but NOT vendor FOB/LDP',                  canViewFOB:0, canViewSellPrice:1, canEdit:0, canEditTechPack:0, canEditSellStatus:1 });
    insertDept.run({ id:'dept-design',      name:'Design / Tech Design', description:'No pricing visibility of any kind',                           canViewFOB:0, canViewSellPrice:0, canEdit:0, canEditTechPack:1, canEditSellStatus:0 });
  })();

  // ── Internal Programs ─────────────────────────────────────────
  const insertIP = db.prepare(`
    INSERT OR IGNORE INTO internal_programs (id, name, brand, tier, gender, target_margin)
    VALUES (@id, @name, @brand, @tier, @gender, @targetMargin)
  `);
  db.transaction(() => {
    insertIP.run({ id:'ip1', name:'Reebok WM',      brand:'Reebok',   tier:'Mass',     gender:'Mens',   targetMargin:0.55 });
    insertIP.run({ id:'ip2', name:'Reebok Canada',  brand:'Reebok',   tier:'Mass',     gender:'Ladies', targetMargin:0.55 });
    insertIP.run({ id:'ip3', name:'Champion WM',    brand:'Champion', tier:'Mass',     gender:'Mens',   targetMargin:0.45 });
    insertIP.run({ id:'ip4', name:'And1 WM',        brand:'And1',     tier:'Mass',     gender:'Mens',   targetMargin:0.48 });
    insertIP.run({ id:'ip5', name:'Gaiam WM',       brand:'Gaiam',    tier:'Mass',     gender:'Ladies', targetMargin:0.50 });
    insertIP.run({ id:'ip6', name:'Head Specialty', brand:'Head',     tier:'Specialty',gender:'Mens',   targetMargin:0.52 });
  })();

  // ── Brand-Tier Margins ────────────────────────────────────────
  const insertBTM = db.prepare(`
    INSERT OR IGNORE INTO brand_tier_margins (id, brand, tier, target_margin)
    VALUES (@id, @brand, @tier, @targetMargin)
  `);
  const BTM_ROWS = [
    { id:'btm_rb_ms', brand:'Reebok',   tier:'Mass',      targetMargin:0.55 },
    { id:'btm_rb_mt', brand:'Reebok',   tier:'Mid Tier',  targetMargin:0.52 },
    { id:'btm_rb_op', brand:'Reebok',   tier:'Off Price', targetMargin:0.48 },
    { id:'btm_rb_cl', brand:'Reebok',   tier:'Clubs',     targetMargin:0.50 },
    { id:'btm_rb_sp', brand:'Reebok',   tier:'Specialty', targetMargin:0.53 },
    { id:'btm_ch_ms', brand:'Champion', tier:'Mass',      targetMargin:0.45 },
    { id:'btm_ch_mt', brand:'Champion', tier:'Mid Tier',  targetMargin:0.43 },
    { id:'btm_ch_op', brand:'Champion', tier:'Off Price', targetMargin:0.40 },
    { id:'btm_ch_cl', brand:'Champion', tier:'Clubs',     targetMargin:0.42 },
    { id:'btm_ch_sp', brand:'Champion', tier:'Specialty', targetMargin:0.45 },
    { id:'btm_a1_ms', brand:'And1',     tier:'Mass',      targetMargin:0.48 },
    { id:'btm_a1_mt', brand:'And1',     tier:'Mid Tier',  targetMargin:0.46 },
    { id:'btm_a1_op', brand:'And1',     tier:'Off Price', targetMargin:0.42 },
    { id:'btm_a1_cl', brand:'And1',     tier:'Clubs',     targetMargin:0.44 },
    { id:'btm_a1_sp', brand:'And1',     tier:'Specialty', targetMargin:0.48 },
    { id:'btm_ga_ms', brand:'Gaiam',    tier:'Mass',      targetMargin:0.50 },
    { id:'btm_ga_mt', brand:'Gaiam',    tier:'Mid Tier',  targetMargin:0.48 },
    { id:'btm_ga_op', brand:'Gaiam',    tier:'Off Price', targetMargin:0.44 },
    { id:'btm_ga_cl', brand:'Gaiam',    tier:'Clubs',     targetMargin:0.46 },
    { id:'btm_ga_sp', brand:'Gaiam',    tier:'Specialty', targetMargin:0.50 },
    { id:'btm_hd_ms', brand:'Head',     tier:'Mass',      targetMargin:0.48 },
    { id:'btm_hd_mt', brand:'Head',     tier:'Mid Tier',  targetMargin:0.50 },
    { id:'btm_hd_op', brand:'Head',     tier:'Off Price', targetMargin:0.44 },
    { id:'btm_hd_cl', brand:'Head',     tier:'Clubs',     targetMargin:0.46 },
    { id:'btm_hd_sp', brand:'Head',     tier:'Specialty', targetMargin:0.52 },
  ];
  db.transaction(() => BTM_ROWS.forEach(r => insertBTM.run(r)))();

  // ── Internal Users ────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, role, department_id, internal_program_id)
    VALUES (@id, @name, @email, @passwordHash, @role, @departmentId, @internalProgramId)
  `);
  db.transaction(() => {
    insertUser.run({ id:'admin',    name:'Admin Team',       email:'admin@company.com',    passwordHash:hashPassword('admin123'),  role:'admin',    departmentId:'dept-production',  internalProgramId:null });
    insertUser.run({ id:'pc1',      name:'Production Team',  email:'pc@company.com',        passwordHash:hashPassword('pc123'),     role:'pc',       departmentId:'dept-production',  internalProgramId:null });
    insertUser.run({ id:'planning1',name:'Planning & Sales', email:'planning@company.com',  passwordHash:hashPassword('plan123'),   role:'planning', departmentId:'dept-sales-price', internalProgramId:'ip1' });
    insertUser.run({ id:'sales1',   name:'Sales',            email:'sales@company.com',     passwordHash:hashPassword('sales123'),  role:'planning', departmentId:'dept-sales-noprc', internalProgramId:'ip1' });
    insertUser.run({ id:'design1',  name:'Design Team',      email:'design@company.com',    passwordHash:hashPassword('design123'), role:'design',   departmentId:'dept-design',      internalProgramId:'ip1' });
    insertUser.run({ id:'techdes1', name:'Tech Design',      email:'techdesign@company.com',passwordHash:hashPassword('tech123'),   role:'design',   departmentId:'dept-design',      internalProgramId:'ip1' });
  })();

  // ── Trading Companies ─────────────────────────────────────────
  const insertTC   = db.prepare(`
    INSERT OR IGNORE INTO trading_companies (id, code, name, email, password_hash, payment_terms)
    VALUES (@id, @code, @name, @email, @passwordHash, @paymentTerms)
  `);
  const insertTCCoo = db.prepare(`INSERT OR IGNORE INTO tc_coos (tc_id, coo) VALUES (?, ?)`);

  const TCS = [
    { id:'tc_az',  code:'AZ',   name:'Amazing Space',     email:'az@vendor.com',   password:'vendor123', coos:['CN','KH'] },
    { id:'tc_cs',  code:'CS',   name:'Consummate',         email:'cs@vendor.com',   password:'vendor123', coos:[] },
    { id:'tc_eg',  code:'EG',   name:'Eastern Garment',    email:'eg@vendor.com',   password:'vendor123', coos:['PK'] },
    { id:'tc_fhd', code:'FHD',  name:'Federal Home Depot', email:'fhd@vendor.com',  password:'vendor123', coos:['KH'] },
    { id:'tc_gm',  code:'GM',   name:'Guomao',             email:'gm@vendor.com',   password:'vendor123', coos:['ID','KH','VN'] },
    { id:'tc_gu',  code:'GU',   name:'Great Union',        email:'gu@vendor.com',   password:'vendor123', coos:['KH','KY'] },
    { id:'tc_hnm', code:'HNM',  name:'HNM',                email:'hnm@vendor.com',  password:'vendor123', coos:['PK'] },
    { id:'tc_hr',  code:'HR',   name:'Hongren',            email:'hr@vendor.com',   password:'vendor123', coos:['CN','KH'] },
    { id:'tc_hs',  code:'HS',   name:'Hansae',             email:'hs@vendor.com',   password:'vendor123', coos:['ID','KH','VN'] },
    { id:'tc_kt',  code:'KT',   name:'KT Group',           email:'kt@vendor.com',   password:'vendor123', coos:[] },
    { id:'tc_ly',  code:'LY',   name:'Liyang',             email:'ly@vendor.com',   password:'vendor123', coos:['KH'] },
    { id:'tc_mk',  code:'MK',   name:'Makalot',            email:'mk@vendor.com',   password:'vendor123', coos:['ID','KH','VN'] },
    { id:'tc_ml',  code:'ML',   name:'Morelands',          email:'ml@vendor.com',   password:'vendor123', coos:['JD','KH'] },
    { id:'tc_rl',  code:'RL',   name:'Reliance',           email:'rl@vendor.com',   password:'vendor123', coos:['KH'] },
    { id:'tc_semi',code:'SEMI', name:'Semisphere',         email:'semi@vendor.com', password:'vendor123', coos:[] },
    { id:'tc_shk', code:'SHK',  name:'SHK',                email:'shk@vendor.com',  password:'vendor123', coos:['ID','KH','VN'] },
    { id:'tc_sw',  code:'SW',   name:'Shinwon',            email:'sw@vendor.com',   password:'vendor123', coos:['ID','KH','VN'] },
    { id:'tc_tb',  code:'TB',   name:'Twobees',            email:'tb@vendor.com',   password:'vendor123', coos:['ID','KH'] },
    { id:'tc_tf',  code:'TF',   name:'TopForm',            email:'tf@vendor.com',   password:'vendor123', coos:['TH'] },
    { id:'tc_tl',  code:'TL',   name:'Talent',             email:'tl@vendor.com',   password:'vendor123', coos:['CN','KH'] },
    { id:'tc_tx',  code:'TX',   name:'Texray',             email:'tx@vendor.com',   password:'vendor123', coos:['ES'] },
    { id:'tc_ty',  code:'TY',   name:'Taieasy',            email:'ty@vendor.com',   password:'vendor123', coos:['KH'] },
    { id:'tc_uni', code:'UNI',  name:'Universal',          email:'uni@vendor.com',  password:'vendor123', coos:['TH'] },
    { id:'tc_wb',  code:'WB',   name:'Willbes',            email:'wb@vendor.com',   password:'vendor123', coos:['HT','ID'] },
    { id:'tc_wbg', code:'WBG',  name:'WorldBest',          email:'wbg@vendor.com',  password:'vendor123', coos:[] },
    { id:'tc_wd',  code:'WD',   name:'Windeson',           email:'wd@vendor.com',   password:'vendor123', coos:['CN','KH','LS'] },
    { id:'tc_yt',  code:'YT',   name:'Yuenthai',           email:'yt@vendor.com',   password:'vendor123', coos:['KH','TH'] },
  ];
  db.transaction(() => {
    for (const tc of TCS) {
      insertTC.run({
        id: tc.id, code: tc.code, name: tc.name,
        email: tc.email, passwordHash: hashPassword(tc.password),
        paymentTerms: 'FOB',
      });
      for (const coo of tc.coos) {
        insertTCCoo.run(tc.id, coo);
      }
    }
  })();

  // ── Schema version ────────────────────────────────────────────
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)').run();

  console.log('[db-sqlite] Seed complete.');
}

// ── Initialize and export ─────────────────────────────────────
const db = openDatabase();
seedDatabase(db);

module.exports = db;
