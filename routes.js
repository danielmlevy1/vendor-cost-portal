// =============================================================
// VENDOR COST PORTAL — Core REST API routes
// Mounted at /api in server.js.
//
// Resources covered:
//   Reference: coo-rates, trading-companies, internal-programs,
//              brand-tier-margins, customers, departments
//   Programs, Styles, Assignments
//   Submissions (with revision tracking)
//   Placements
//   Customer assignments & buys
// =============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('./database');
const { requireAuth, requireRole } = require('./auth');

const SALT = 10;

// ── Helpers ────────────────────────────────────────────────────

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();

// Build a partial UPDATE statement from a body object + field whitelist.
// fieldMap: { camelKey: 'snake_column' }
// Returns the run() result or null if no recognised fields were sent.
function applyPatch(table, id, body, fieldMap) {
  const setClauses = [];
  const vals = [];
  for (const [camel, col] of Object.entries(fieldMap)) {
    if (body[camel] !== undefined) {
      setClauses.push(`${col} = ?`);
      vals.push(body[camel] === '' ? null : body[camel]);
    }
  }
  if (!setClauses.length) return null;
  vals.push(id);
  return db.prepare(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ?`).run(...vals);
}

// ── Row → API object mappers ───────────────────────────────────

function programFromRow(r) {
  return {
    id:                   r.id,
    name:                 r.name,
    brand:                r.brand,
    retailer:             r.retailer,
    gender:               r.gender,
    season:               r.season,
    year:                 r.year,
    status:               r.status,
    market:               r.market,
    targetMargin:         r.target_margin,
    internalProgramId:    r.internal_program_id,
    pendingDesignHandoff: !!r.pending_design_handoff,
    startDate:            r.start_date,
    endDate:              r.end_date,
    crdDate:              r.crd_date,
    version:              r.version,
    cancelledAt:          r.cancelled_at,
    cancelledBy:          r.cancelled_by,
    cancelledByName:      r.cancelled_by_name,
    updatedAt:            r.updated_at,
    createdAt:            r.created_at,
  };
}

function styleFromRow(r) {
  return {
    id:                r.id,
    programId:         r.program_id,
    styleNumber:       r.style_number,
    styleName:         r.style_name,
    category:          r.category,
    fabrication:       r.fabrication,
    status:            r.status,
    projQty:           r.proj_qty,
    actualQty:         r.actual_qty,
    projSellPrice:     r.proj_sell_price,
    dutyRate:          r.duty_rate,
    estFreight:        r.est_freight,
    specialPackaging:  r.special_packaging,
    techPackStatus:    r.tech_pack_status,
    sellStatus:        r.sell_status,
    sellStatusNote:    r.sell_status_note,
    techDesignNotes:   r.tech_design_notes,
    internalProgramId: r.internal_program_id,
    recostRequestId:   r.recost_request_id,
    releasedBatch:     r.released_batch    || null,
    sourceHandoffId:   r.source_handoff_id || null,
    createdAt:         r.created_at,
  };
}

function submissionFromRow(r) {
  return {
    id:              r.id,
    tcId:            r.tc_id,
    styleId:         r.style_id,
    coo:             r.coo,
    fob:             r.fob,
    factoryCost:     r.factory_cost,
    tcMarkup:        r.tc_markup,
    paymentTerms:    r.payment_terms,
    moq:             r.moq,
    leadTime:        r.lead_time,
    vendorComments:  r.vendor_comments,
    status:          r.status,
    flagReason:      r.flag_reason,
    skipReason:      r.skip_reason,
    isOutdated:      !!r.is_outdated,
    enteredByAdmin:  !!r.entered_by_admin,
    recostRequestId: r.recost_request_id,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  };
}

function placementFromRow(r) {
  return {
    id:           r.id,
    styleId:      r.style_id,
    tcId:         r.tc_id,
    coo:          r.coo,
    factoryId:    r.factory_id,
    confirmedFob: r.confirmed_fob,
    placedAt:     r.placed_at,
    placedBy:     r.placed_by,
    placedByName: r.placed_by_name,
    notes:        r.notes,
  };
}

function tcFromRow(r, coos = []) {
  return {
    id:           r.id,
    code:         r.code,
    name:         r.name,
    email:        r.email,
    paymentTerms: r.payment_terms,
    createdAt:    r.created_at,
    coos,
  };
}

function cooRateFromRow(r) {
  return {
    id:           r.id,
    code:         r.code,
    country:      r.country,
    addlDuty:     r.addl_duty,
    usaMult:      r.usa_mult,
    canadaMult:   r.canada_mult,
    seaLeadDays:  r.sea_lead_days,
  };
}

function internalProgramFromRow(r) {
  return {
    id: r.id, name: r.name, brand: r.brand, tier: r.tier,
    gender: r.gender, targetMargin: r.target_margin,
  };
}

function deptFromRow(r) {
  return {
    id:                 r.id,
    name:               r.name,
    description:        r.description,
    canViewFOB:         !!r.can_view_fob,
    canViewSellPrice:   !!r.can_view_sell_price,
    canEdit:            !!r.can_edit,
    canEditTechPack:    !!r.can_edit_tech_pack,
    canEditSellStatus:  !!r.can_edit_sell_status,
    brandFilter:        JSON.parse(r.brand_filter || '[]'),
    tierFilter:         JSON.parse(r.tier_filter  || '[]'),
  };
}

// ── Pre-compiled statements ────────────────────────────────────

const stmt = {
  // Programs
  allPrograms:         db.prepare('SELECT * FROM programs ORDER BY created_at DESC'),
  programsByTc:        db.prepare(`
    SELECT p.* FROM programs p
    JOIN assignments a ON a.program_id = p.id
    WHERE a.tc_id = ?
    ORDER BY p.created_at DESC
  `),
  programById:         db.prepare('SELECT * FROM programs WHERE id = ?'),
  countStyles:         db.prepare('SELECT COUNT(*) AS n FROM styles WHERE program_id = ?'),
  countTCs:            db.prepare('SELECT COUNT(*) AS n FROM assignments WHERE program_id = ?'),
  countQuoted:         db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS n
    FROM styles s
    WHERE s.program_id = ?
      AND EXISTS (SELECT 1 FROM submissions sub WHERE sub.style_id = s.id)
  `),
  countCosted:         db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS n
    FROM styles s
    WHERE s.program_id = ?
      AND EXISTS (SELECT 1 FROM submissions sub WHERE sub.style_id = s.id AND sub.fob IS NOT NULL)
  `),
  countPlaced:         db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS n
    FROM styles s
    WHERE s.program_id = ?
      AND EXISTS (SELECT 1 FROM placements pl WHERE pl.style_id = s.id)
  `),
  sumProjQty:          db.prepare('SELECT COALESCE(SUM(proj_qty), 0) AS n FROM styles WHERE program_id = ?'),
  sumActlQty:          db.prepare('SELECT COALESCE(SUM(actual_qty), 0) AS n FROM styles WHERE program_id = ?'),
  insertProgram:       db.prepare(`
    INSERT INTO programs
      (id, name, brand, retailer, gender, season, year, status, market,
       target_margin, internal_program_id, version, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
  `),
  deleteProgram:       db.prepare('DELETE FROM programs WHERE id = ?'),
  placeAllStyles:      db.prepare(`UPDATE styles SET status = 'placed' WHERE program_id = ? AND status != 'cancelled'`),
  setProgStatus:       db.prepare('UPDATE programs SET status = ? WHERE id = ?'),

  // Styles
  stylesByProgram:     db.prepare('SELECT * FROM styles WHERE program_id = ? ORDER BY created_at'),
  stylesByTc:          db.prepare(`
    SELECT s.* FROM styles s
    JOIN assignments a ON a.program_id = s.program_id
    WHERE a.tc_id = ?
    ORDER BY s.program_id, s.created_at
  `),
  styleById:           db.prepare('SELECT * FROM styles WHERE id = ?'),
  insertStyle:         db.prepare(`
    INSERT INTO styles
      (id, program_id, style_number, style_name, category, fabrication, status,
       proj_qty, proj_sell_price, duty_rate, est_freight, special_packaging, created_at)
    VALUES (?,?,?,?,?,?,'open',?,?,?,?,?,?)
  `),
  deleteStyle:         db.prepare('DELETE FROM styles WHERE id = ?'),
  deleteSubsByStyle:   db.prepare('DELETE FROM submissions WHERE style_id = ?'),
  deletePlacementByStyle: db.prepare('DELETE FROM placements WHERE style_id = ?'),

  // Assignments
  assignmentsByProgram:db.prepare(`
    SELECT a.id, a.program_id, a.tc_id,
           t.code, t.name, t.email, t.payment_terms
    FROM assignments a
    JOIN trading_companies t ON t.id = a.tc_id
    WHERE a.program_id = ?
    ORDER BY t.code
  `),
  coosByAssignment:    db.prepare('SELECT coo FROM assignment_coos WHERE assignment_id = ? ORDER BY coo'),
  coosByTc:            db.prepare('SELECT coo FROM tc_coos WHERE tc_id = ? ORDER BY coo'),
  deleteAssignmentsByProgram: db.prepare('DELETE FROM assignments WHERE program_id = ?'),
  deleteAssignmentCoosByProgram: db.prepare(`
    DELETE FROM assignment_coos
    WHERE assignment_id IN (SELECT id FROM assignments WHERE program_id = ?)
  `),
  insertAssignment:    db.prepare('INSERT OR IGNORE INTO assignments (id, program_id, tc_id) VALUES (?,?,?)'),
  insertAssignmentCoo: db.prepare('INSERT OR IGNORE INTO assignment_coos (assignment_id, coo) VALUES (?,?)'),
  tcIdsByProgram:      db.prepare('SELECT tc_id FROM assignments WHERE program_id = ?'),

  // Submissions
  submissionById:      db.prepare('SELECT * FROM submissions WHERE id = ?'),
  submissionsByStyle:  db.prepare('SELECT * FROM submissions WHERE style_id = ? ORDER BY created_at'),
  submissionsByStyleAndTc: db.prepare('SELECT * FROM submissions WHERE style_id = ? AND tc_id = ? ORDER BY created_at'),
  submissionsByProgram:db.prepare(`
    SELECT sub.* FROM submissions sub
    JOIN styles s ON s.id = sub.style_id
    WHERE s.program_id = ?
    ORDER BY sub.created_at
  `),
  submissionsByProgramAndTc: db.prepare(`
    SELECT sub.* FROM submissions sub
    JOIN styles s ON s.id = sub.style_id
    WHERE s.program_id = ? AND sub.tc_id = ?
    ORDER BY sub.created_at
  `),
  submissionByKey:     db.prepare('SELECT * FROM submissions WHERE tc_id = ? AND style_id = ? AND coo = ?'),
  insertSubmission:    db.prepare(`
    INSERT INTO submissions
      (id, tc_id, style_id, coo, fob, factory_cost, tc_markup, payment_terms,
       moq, lead_time, vendor_comments, status, skip_reason, entered_by_admin, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?)
  `),
  updateSubmissionCore:db.prepare(`
    UPDATE submissions
    SET fob=?, factory_cost=?, tc_markup=?, payment_terms=?,
        moq=?, lead_time=?, vendor_comments=?,
        skip_reason=?, status=?, updated_at=?
    WHERE id=?
  `),
  markSubmissionOutdated: db.prepare(`UPDATE submissions SET is_outdated = 1 WHERE style_id = ?`),
  insertRevision:      db.prepare(`
    INSERT INTO revisions (id, sub_id, field, old_value, new_value, submitted_by, submitted_by_name, submitted_at)
    VALUES (?,?,?,?,?,?,?,?)
  `),

  // Placements
  placementByStyle:    db.prepare('SELECT * FROM placements WHERE style_id = ?'),
  placementsByProgram: db.prepare(`
    SELECT pl.* FROM placements pl
    JOIN styles s ON s.id = pl.style_id
    WHERE s.program_id = ?
  `),
  upsertPlacement:     db.prepare(`
    INSERT INTO placements (id, style_id, tc_id, coo, factory_id, confirmed_fob, placed_at, placed_by, placed_by_name, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(style_id) DO UPDATE SET
      tc_id         = excluded.tc_id,
      coo           = excluded.coo,
      factory_id    = COALESCE(excluded.factory_id, placements.factory_id),
      confirmed_fob = excluded.confirmed_fob,
      placed_at     = excluded.placed_at,
      placed_by     = excluded.placed_by,
      placed_by_name= excluded.placed_by_name,
      notes         = excluded.notes
  `),
  deletePlacement:     db.prepare('DELETE FROM placements WHERE style_id = ?'),

  // Reference / lookups
  allCooRates:         db.prepare('SELECT * FROM coo_rates ORDER BY code'),
  allTCs:              db.prepare('SELECT * FROM trading_companies ORDER BY code'),
  tcById:              db.prepare('SELECT * FROM trading_companies WHERE id = ?'),
  coosByTc:            db.prepare('SELECT coo FROM tc_coos WHERE tc_id = ?'),
  allCoosForTCs:       db.prepare('SELECT tc_id, coo FROM tc_coos ORDER BY tc_id'),
  allInternalPrograms: db.prepare('SELECT * FROM internal_programs ORDER BY name'),
  allBrandTierMargins: db.prepare('SELECT * FROM brand_tier_margins ORDER BY brand, tier'),
  allCustomers:        db.prepare('SELECT * FROM customers ORDER BY name'),
  allDepartments:      db.prepare('SELECT * FROM departments ORDER BY name'),
  allUsers:            db.prepare('SELECT id, name, email, role, department_id, created_at FROM users ORDER BY name'),
  userById:            db.prepare('SELECT id, name, email, role, department_id, created_at FROM users WHERE id = ?'),

  // Customer assignments
  custAssignsByProgram:db.prepare('SELECT customer_id FROM customer_assignments WHERE program_id = ?'),
  deleteCustAssigns:   db.prepare('DELETE FROM customer_assignments WHERE program_id = ?'),
  insertCustAssign:    db.prepare('INSERT OR IGNORE INTO customer_assignments (id, program_id, customer_id) VALUES (?,?,?)'),

  // Customer buys
  custBuysByProgram:   db.prepare('SELECT * FROM customer_buys WHERE program_id = ? ORDER BY style_id'),
  custBuysByStyle:     db.prepare('SELECT * FROM customer_buys WHERE program_id = ? AND style_id = ?'),
  upsertCustBuy:       db.prepare(`
    INSERT INTO customer_buys (id, program_id, style_id, customer_id, qty, sell_price, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(program_id, style_id, customer_id) DO UPDATE SET
      qty        = excluded.qty,
      sell_price = excluded.sell_price,
      notes      = excluded.notes,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `),
  deleteCustBuy:       db.prepare('DELETE FROM customer_buys WHERE program_id = ? AND style_id = ? AND customer_id = ?'),
};

// ── Helper: build program with computed counts ─────────────────

function programWithCounts(row) {
  return {
    ...programFromRow(row),
    styleCount:   stmt.countStyles.get(row.id).n,
    tcCount:      stmt.countTCs.get(row.id).n,
    quotedCount:  stmt.countQuoted.get(row.id).n,
    costedCount:  stmt.countCosted.get(row.id).n,
    placedCount:  stmt.countPlaced.get(row.id).n,
    projQtyTotal: stmt.sumProjQty.get(row.id).n || 0,
    actlQtyTotal: stmt.sumActlQty.get(row.id).n || 0,
  };
}

// ── Helper: check vendor is assigned to a program ──────────────

function vendorAssignedTo(programId, tcId) {
  return db.prepare('SELECT 1 FROM assignments WHERE program_id = ? AND tc_id = ?').get(programId, tcId);
}

// =============================================================
// REFERENCE LOOKUPS
// =============================================================

// GET /api/coo-rates
router.get('/coo-rates', requireAuth, (req, res) => {
  res.json(stmt.allCooRates.all().map(cooRateFromRow));
});

// GET /api/trading-companies
router.get('/trading-companies', requireAuth, (req, res) => {
  const tcs   = stmt.allTCs.all();
  const allCoos = stmt.allCoosForTCs.all();
  const cooMap  = {};
  for (const { tc_id, coo } of allCoos) {
    if (!cooMap[tc_id]) cooMap[tc_id] = [];
    cooMap[tc_id].push(coo);
  }
  res.json(tcs.map(r => tcFromRow(r, cooMap[r.id] || [])));
});

// GET /api/trading-companies/:id
router.get('/trading-companies/:id', requireAuth, (req, res) => {
  const row = stmt.tcById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const coos = stmt.coosByTc.all(row.id).map(r => r.coo);
  res.json(tcFromRow(row, coos));
});

// POST /api/trading-companies  (admin — direct creation, bypasses pending-changes)
router.post('/trading-companies', requireAuth, requireRole('admin'), async (req, res) => {
  const b = req.body;
  if (!b.code || !b.name || !b.email || !b.password) {
    return res.status(400).json({ error: 'code, name, email, and password required' });
  }
  if (db.prepare('SELECT id FROM trading_companies WHERE code=?').get(b.code)) {
    return res.status(409).json({ error: 'TC code already exists' });
  }
  const hash = await bcrypt.hash(b.password, SALT);
  const id = uid();
  db.prepare('INSERT INTO trading_companies (id,code,name,email,password_hash,payment_terms,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, b.code, b.name, b.email, hash, b.paymentTerms || 'FOB', now());
  // Insert COOs
  if (Array.isArray(b.coos)) {
    const ins = db.prepare('INSERT OR IGNORE INTO tc_coos (tc_id, coo) VALUES (?,?)');
    b.coos.forEach(coo => ins.run(id, coo));
  }
  const row = stmt.tcById.get(id);
  const coos = stmt.coosByTc.all(id).map(r => r.coo);
  res.status(201).json(tcFromRow(row, coos));
});

// PATCH /api/trading-companies/:id
router.patch('/trading-companies/:id', requireAuth, requireRole('admin', 'pc'), async (req, res) => {
  const row = stmt.tcById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  applyPatch('trading_companies', req.params.id, b, {
    code: 'code', name: 'name', email: 'email', paymentTerms: 'payment_terms',
  });
  if (b.password) {
    const hash = await bcrypt.hash(b.password, SALT);
    db.prepare('UPDATE trading_companies SET password_hash=? WHERE id=?').run(hash, req.params.id);
  }
  if (Array.isArray(b.coos)) {
    db.prepare('DELETE FROM tc_coos WHERE tc_id=?').run(req.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO tc_coos (tc_id, coo) VALUES (?,?)');
    b.coos.forEach(coo => ins.run(req.params.id, coo));
  }
  const updated = stmt.tcById.get(req.params.id);
  const coos = stmt.coosByTc.all(req.params.id).map(r => r.coo);
  res.json(tcFromRow(updated, coos));
});

// DELETE /api/trading-companies/:id
router.delete('/trading-companies/:id', requireAuth, requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM trading_companies WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tc_coos WHERE tc_id=?').run(req.params.id);
  db.prepare('DELETE FROM assignments WHERE tc_id=?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/internal-programs
router.get('/internal-programs', requireAuth, (req, res) => {
  res.json(stmt.allInternalPrograms.all().map(internalProgramFromRow));
});

// GET /api/brand-tier-margins
router.get('/brand-tier-margins', requireAuth, (req, res) => {
  res.json(stmt.allBrandTierMargins.all().map(r => ({
    id: r.id, brand: r.brand, tier: r.tier, targetMargin: r.target_margin,
  })));
});

// GET /api/customers
router.get('/customers', requireAuth, (req, res) => {
  res.json(stmt.allCustomers.all());
});

// GET /api/departments
router.get('/departments', requireAuth, (req, res) => {
  res.json(stmt.allDepartments.all().map(deptFromRow));
});

// GET /api/users  (admin/pc only — staff management)
router.get('/users', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  res.json(stmt.allUsers.all().map(r => ({
    id: r.id, name: r.name, email: r.email, role: r.role,
    departmentId: r.department_id, createdAt: r.created_at,
  })));
});

// =============================================================
// REFERENCE DATA — WRITE ROUTES
// =============================================================

// POST /api/coo-rates  (upsert by code)
router.post('/coo-rates', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body;
  if (!b.code || !b.country) return res.status(400).json({ error: 'code and country required' });
  const lead = (b.seaLeadDays == null || b.seaLeadDays === '') ? 30 : Number(b.seaLeadDays);
  const existing = db.prepare('SELECT id FROM coo_rates WHERE code = ?').get(b.code);
  if (existing) {
    db.prepare('UPDATE coo_rates SET country=?, addl_duty=?, usa_mult=?, canada_mult=?, sea_lead_days=? WHERE id=?')
      .run(b.country, b.addlDuty ?? 0, b.usaMult ?? 0, b.canadaMult ?? 0, lead, existing.id);
    res.json(cooRateFromRow(db.prepare('SELECT * FROM coo_rates WHERE id=?').get(existing.id)));
  } else {
    const id = uid();
    db.prepare('INSERT INTO coo_rates (id,code,country,addl_duty,usa_mult,canada_mult,sea_lead_days) VALUES (?,?,?,?,?,?,?)')
      .run(id, b.code, b.country, b.addlDuty ?? 0, b.usaMult ?? 0, b.canadaMult ?? 0, lead);
    res.status(201).json(cooRateFromRow(db.prepare('SELECT * FROM coo_rates WHERE id=?').get(id)));
  }
});

// DELETE /api/coo-rates/:id
router.delete('/coo-rates/:id', requireAuth, requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM coo_rates WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/customers
router.post('/customers', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name required' });
  const id = uid();
  db.prepare('INSERT INTO customers (id,code,name) VALUES (?,?,?)').run(id, b.code, b.name);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id=?').get(id));
});

// PATCH /api/customers/:id
router.patch('/customers/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  applyPatch('customers', req.params.id, req.body, { code: 'code', name: 'name' });
  res.json(db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id));
});

// DELETE /api/customers/:id
router.delete('/customers/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/internal-programs
router.post('/internal-programs', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const id = uid();
  db.prepare('INSERT INTO internal_programs (id,name,brand,tier,gender,target_margin) VALUES (?,?,?,?,?,?)')
    .run(id, b.name, b.brand || null, b.tier || null, b.gender || null, b.targetMargin ?? null);
  res.status(201).json(internalProgramFromRow(db.prepare('SELECT * FROM internal_programs WHERE id=?').get(id)));
});

// PATCH /api/internal-programs/:id
router.patch('/internal-programs/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM internal_programs WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  applyPatch('internal_programs', req.params.id, req.body, {
    name: 'name', brand: 'brand', tier: 'tier', gender: 'gender', targetMargin: 'target_margin',
  });
  res.json(internalProgramFromRow(db.prepare('SELECT * FROM internal_programs WHERE id=?').get(req.params.id)));
});

// DELETE /api/internal-programs/:id
router.delete('/internal-programs/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const info = db.prepare('DELETE FROM internal_programs WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/brand-tier-margins  (upsert by brand+tier)
router.post('/brand-tier-margins', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body;
  if (!b.brand || !b.tier || b.targetMargin == null) {
    return res.status(400).json({ error: 'brand, tier, and targetMargin required' });
  }
  const existing = db.prepare('SELECT id FROM brand_tier_margins WHERE brand=? AND tier=?').get(b.brand, b.tier);
  if (existing) {
    db.prepare('UPDATE brand_tier_margins SET target_margin=? WHERE id=?').run(b.targetMargin, existing.id);
    const updated = db.prepare('SELECT * FROM brand_tier_margins WHERE id=?').get(existing.id);
    res.json({ id: updated.id, brand: updated.brand, tier: updated.tier, targetMargin: updated.target_margin });
  } else {
    const id = uid();
    db.prepare('INSERT INTO brand_tier_margins (id,brand,tier,target_margin) VALUES (?,?,?,?)').run(id, b.brand, b.tier, b.targetMargin);
    const created = db.prepare('SELECT * FROM brand_tier_margins WHERE id=?').get(id);
    res.status(201).json({ id: created.id, brand: created.brand, tier: created.tier, targetMargin: created.target_margin });
  }
});

// DELETE /api/brand-tier-margins/:id
router.delete('/brand-tier-margins/:id', requireAuth, requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM brand_tier_margins WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/departments
router.post('/departments', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const id = uid();
  db.prepare(`
    INSERT INTO departments
      (id,name,description,can_view_fob,can_view_sell_price,can_edit,
       can_edit_tech_pack,can_edit_sell_status,brand_filter,tier_filter)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.name, b.description || null,
         b.canViewFOB ? 1 : 0, b.canViewSellPrice ? 1 : 0,
         b.canEdit ? 1 : 0, b.canEditTechPack ? 1 : 0, b.canEditSellStatus ? 1 : 0,
         JSON.stringify(b.brandFilter || []), JSON.stringify(b.tierFilter || []));
  res.status(201).json(deptFromRow(db.prepare('SELECT * FROM departments WHERE id=?').get(id)));
});

// PATCH /api/departments/:id
router.patch('/departments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  applyPatch('departments', req.params.id, b, { name: 'name', description: 'description' });
  const boolMap = {
    canViewFOB: 'can_view_fob', canViewSellPrice: 'can_view_sell_price',
    canEdit: 'can_edit', canEditTechPack: 'can_edit_tech_pack', canEditSellStatus: 'can_edit_sell_status',
  };
  for (const [k, col] of Object.entries(boolMap)) {
    if (b[k] !== undefined) db.prepare(`UPDATE departments SET ${col}=? WHERE id=?`).run(b[k] ? 1 : 0, req.params.id);
  }
  if (b.brandFilter !== undefined) db.prepare('UPDATE departments SET brand_filter=? WHERE id=?').run(JSON.stringify(b.brandFilter), req.params.id);
  if (b.tierFilter  !== undefined) db.prepare('UPDATE departments SET tier_filter=? WHERE id=?').run(JSON.stringify(b.tierFilter),  req.params.id);
  res.json(deptFromRow(db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id)));
});

// DELETE /api/departments/:id
router.delete('/departments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/users  (admin creates a staff account)
router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const b = req.body;
  if (!b.name || !b.email || !b.password || !b.role) {
    return res.status(400).json({ error: 'name, email, password, and role required' });
  }
  if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email)) {
    return res.status(409).json({ error: 'Email already in use' });
  }
  const hash = await bcrypt.hash(b.password, SALT);
  const id = uid();
  const ts = now();
  db.prepare('INSERT INTO users (id,name,email,password_hash,role,department_id,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, b.name, b.email, hash, b.role, b.departmentId || null, ts);
  res.status(201).json({ id, name: b.name, email: b.email, role: b.role, departmentId: b.departmentId || null, createdAt: ts });
});

// PATCH /api/users/:id
router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const row = stmt.userById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  applyPatch('users', req.params.id, b, {
    name: 'name', email: 'email', role: 'role', departmentId: 'department_id',
  });
  if (b.password) {
    const hash = await bcrypt.hash(b.password, SALT);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  }
  const u = stmt.userById.get(req.params.id);
  res.json({ id: u.id, name: u.name, email: u.email, role: u.role, departmentId: u.department_id, createdAt: u.created_at });
});

// DELETE /api/users/:id
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// =============================================================
// PROGRAMS
// =============================================================

const PROGRAM_FIELDS = {
  name:                 'name',
  brand:                'brand',
  retailer:             'retailer',
  gender:               'gender',
  season:               'season',
  year:                 'year',
  status:               'status',
  market:               'market',
  targetMargin:         'target_margin',
  internalProgramId:    'internal_program_id',
  pendingDesignHandoff: 'pending_design_handoff',
  startDate:            'start_date',
  endDate:              'end_date',
  crdDate:              'crd_date',
  version:              'version',
};

// GET /api/programs
router.get('/programs', requireAuth, (req, res) => {
  const rows = req.user.role === 'vendor'
    ? stmt.programsByTc.all(req.user.tcId)
    : stmt.allPrograms.all();
  res.json(rows.map(programWithCounts));
});

// GET /api/programs/:id
router.get('/programs/:id', requireAuth, (req, res) => {
  const row = stmt.programById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'vendor' && !vendorAssignedTo(req.params.id, req.user.tcId)) {
    return res.status(403).json({ error: 'Not assigned to this program' });
  }
  res.json(programWithCounts(row));
});

// POST /api/programs
router.post('/programs', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  const id = uid();
  stmt.insertProgram.run(
    id, b.name || null, b.brand || null, b.retailer || null,
    b.gender || null, b.season || null, b.year || null,
    b.status || 'Draft', b.market || 'USA',
    b.targetMargin ?? null, b.internalProgramId || null, now()
  );
  res.status(201).json(programWithCounts(stmt.programById.get(id)));
});

// PATCH /api/programs/:id
router.patch('/programs/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.programById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  applyPatch('programs', req.params.id, req.body, PROGRAM_FIELDS);
  db.prepare("UPDATE programs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(req.params.id);
  res.json(programWithCounts(stmt.programById.get(req.params.id)));
});

// POST /api/programs/:id/cancel  — moves to cancelled, cascades to linked handoff + SR
router.post('/programs/:id/cancel', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.programById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const progName = row.name;
  const cancellerId   = req.user?.id   || null;
  const cancellerName = req.user?.name || null;

  db.transaction(() => {
    db.prepare(`UPDATE programs SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ? WHERE id = ?`)
      .run(now, cancellerId, cancellerName, req.params.id);

    // Cascade to the linked design handoff (if any)
    const handoff = db.prepare('SELECT * FROM design_handoffs WHERE linked_program_id = ?')
      .get(req.params.id);
    if (handoff) {
      db.prepare(`UPDATE design_handoffs SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ?, previous_program_id = ?, previous_program_name = ? WHERE id = ?`)
        .run(now, cancellerId, cancellerName, req.params.id, progName, handoff.id);
      // Cascade to SR linked via the handoff or directly to the program
      const sr = db.prepare('SELECT * FROM sales_requests WHERE (source_handoff_id = ? OR linked_program_id = ?) AND status != ?')
        .get(handoff.id, req.params.id, 'cancelled');
      if (sr) {
        db.prepare(`UPDATE sales_requests SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ?, previous_program_id = ?, previous_program_name = ? WHERE id = ?`)
          .run(now, cancellerId, cancellerName, req.params.id, progName, sr.id);
      }
    } else {
      // No handoff directly linked — cancel any SR linked directly to the program
      const sr = db.prepare('SELECT * FROM sales_requests WHERE linked_program_id = ? AND status != ?')
        .get(req.params.id, 'cancelled');
      if (sr) {
        db.prepare(`UPDATE sales_requests SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ?, previous_program_id = ?, previous_program_name = ? WHERE id = ?`)
          .run(now, cancellerId, cancellerName, req.params.id, progName, sr.id);
        // Also cascade to the source handoff if it has no other active program owner
        if (sr.source_handoff_id) {
          const orphanHandoff = db.prepare(
            `SELECT * FROM design_handoffs WHERE id = ? AND (linked_program_id IS NULL OR linked_program_id = '')`
          ).get(sr.source_handoff_id);
          if (orphanHandoff) {
            db.prepare(`UPDATE design_handoffs SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ?, previous_program_id = ?, previous_program_name = ? WHERE id = ?`)
              .run(now, cancellerId, cancellerName, req.params.id, progName, orphanHandoff.id);
          }
        }
      }
    }
  })();

  res.json(programWithCounts(stmt.programById.get(req.params.id)));
});

// DELETE /api/programs/:id  (admin only — destructive cascade, not exposed in UI)
router.delete('/programs/:id', requireAuth, requireRole('admin'), (req, res) => {
  const row = stmt.programById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.transaction(() => {
    // Get all style IDs in this program before deleting
    const styleIds = db.prepare('SELECT id FROM styles WHERE program_id = ?').all(req.params.id).map(s => s.id);
    for (const sid of styleIds) {
      stmt.deleteSubsByStyle.run(sid);
      stmt.deletePlacementByStyle.run(sid);
    }
    db.prepare('DELETE FROM assignments WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM style_links WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM recost_requests WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM cost_history WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM customer_assignments WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM customer_buys WHERE program_id = ?').run(req.params.id);
    db.prepare('DELETE FROM styles WHERE program_id = ?').run(req.params.id);
    stmt.deleteProgram.run(req.params.id);
  })();

  res.json({ ok: true });
});

// POST /api/programs/:id/place-all
router.post('/programs/:id/place-all', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.programById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.transaction(() => {
    stmt.placeAllStyles.run(req.params.id);
    stmt.setProgStatus.run('Placed', req.params.id);
  })();

  res.json(programWithCounts(stmt.programById.get(req.params.id)));
});

// =============================================================
// STYLES
// =============================================================

const STYLE_FIELDS = {
  styleNumber:       'style_number',
  styleName:         'style_name',
  category:          'category',
  fabrication:       'fabrication',
  status:            'status',
  projQty:           'proj_qty',
  actualQty:         'actual_qty',
  projSellPrice:     'proj_sell_price',
  dutyRate:          'duty_rate',
  estFreight:        'est_freight',
  specialPackaging:  'special_packaging',
  techPackStatus:    'tech_pack_status',
  sellStatus:        'sell_status',
  sellStatusNote:    'sell_status_note',
  techDesignNotes:   'tech_design_notes',
  internalProgramId: 'internal_program_id',
  recostRequestId:   'recost_request_id',
};

// GET /api/programs/:id/styles
router.get('/programs/:id/styles', requireAuth, (req, res) => {
  const prog = stmt.programById.get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'vendor' && !vendorAssignedTo(req.params.id, req.user.tcId)) {
    return res.status(403).json({ error: 'Not assigned to this program' });
  }
  res.json(stmt.stylesByProgram.all(req.params.id).map(styleFromRow));
});

// GET /api/styles/:id
router.get('/styles/:id', requireAuth, (req, res) => {
  const row = stmt.styleById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'vendor' && !vendorAssignedTo(row.program_id, req.user.tcId)) {
    return res.status(403).json({ error: 'Not assigned to this program' });
  }
  res.json(styleFromRow(row));
});

// POST /api/styles  — single style create
router.post('/styles', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.programId) return res.status(400).json({ error: 'programId required' });
  const id = uid();
  stmt.insertStyle.run(
    id, b.programId,
    b.styleNumber || null, b.styleName || null,
    b.category || null, b.fabrication || null,
    b.projQty ?? null, b.projSellPrice ?? null,
    b.dutyRate ?? null, b.estFreight ?? null, b.specialPackaging ?? null,
    now()
  );
  res.status(201).json(styleFromRow(stmt.styleById.get(id)));
});

// POST /api/programs/:id/styles/bulk
router.post('/programs/:id/styles/bulk', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const prog = stmt.programById.get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });
  const rows = req.body.styles;
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'styles array required' });
  }

  const created = db.transaction(() => {
    return rows.map(b => {
      const id = uid();
      stmt.insertStyle.run(
        id, req.params.id,
        b.styleNumber || null, b.styleName || null,
        b.category || null, b.fabrication || null,
        b.projQty ?? null, b.projSellPrice ?? null,
        b.dutyRate ?? null, b.estFreight ?? null, b.specialPackaging ?? null,
        now()
      );
      return styleFromRow(stmt.styleById.get(id));
    });
  })();

  res.status(201).json(created);
});

// PATCH /api/styles/:id
router.patch('/styles/:id', requireAuth, (req, res) => {
  const row = stmt.styleById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // Vendors can't edit styles; design can edit tech fields; admin/pc can edit anything
  const role = req.user.role;
  if (role === 'vendor') return res.status(403).json({ error: 'Vendors cannot edit styles' });

  // Design role: only tech_pack_status and tech_design_notes
  let allowedFields = STYLE_FIELDS;
  if (role === 'design') {
    allowedFields = {
      techPackStatus:  'tech_pack_status',
      techDesignNotes: 'tech_design_notes',
    };
  } else if (role === 'planning' || role === 'sales') {
    allowedFields = {
      sellStatus:    'sell_status',
      sellStatusNote:'sell_status_note',
    };
  }

  applyPatch('styles', req.params.id, req.body, allowedFields);
  res.json(styleFromRow(stmt.styleById.get(req.params.id)));
});

// DELETE /api/styles/:id
router.delete('/styles/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.styleById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.transaction(() => {
    stmt.deleteSubsByStyle.run(req.params.id);
    stmt.deletePlacementByStyle.run(req.params.id);
    stmt.deleteStyle.run(req.params.id);
  })();

  res.json({ ok: true });
});

// =============================================================
// ASSIGNMENTS (program ↔ trading company)
// =============================================================

function assignmentToDto(r) {
  const coos       = stmt.coosByAssignment.all(r.id).map(x => x.coo);
  const tcCoos     = stmt.coosByTc.all(r.tc_id).map(x => x.coo);
  return {
    id:        r.id,
    programId: r.program_id,
    tcId:      r.tc_id,
    coos,                         // COOs selected for this (program, TC)
    tc: {
      id:           r.tc_id,
      code:         r.code,
      name:         r.name,
      email:        r.email,
      paymentTerms: r.payment_terms,
      coos:         tcCoos,       // TC's full master list — UI needs it to render the chip options
    },
  };
}

// GET /api/programs/:id/assignments
// Admin/PC sees every TC assigned; a vendor sees only their own row.
router.get('/programs/:id/assignments', requireAuth, (req, res) => {
  let rows = stmt.assignmentsByProgram.all(req.params.id);
  if (req.user.role === 'vendor') {
    rows = rows.filter(r => r.tc_id === req.user.tcId);
    if (!rows.length) return res.status(403).json({ error: 'Not assigned to this program' });
  }
  // All authenticated internal users (admin, pc, planning, design, tech_design, prod_dev) can read.
  res.json(rows.map(assignmentToDto));
});

// PUT /api/programs/:id/assignments  — replace the full TC list
// Accepts either:
//   { tcIds: [...] }                              (legacy; each TC gets all its COOs)
//   { assignments: [{ tcId, coos: [...] }, ...] } (new; caller picks the COOs)
router.put('/programs/:id/assignments', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const prog = stmt.programById.get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });

  // Normalize input into [{ tcId, coos|null }]
  let desired;
  if (Array.isArray(req.body.assignments)) {
    desired = req.body.assignments
      .filter(a => a && typeof a.tcId === 'string')
      .map(a => ({ tcId: a.tcId, coos: Array.isArray(a.coos) ? a.coos : null }));
  } else if (Array.isArray(req.body.tcIds)) {
    desired = req.body.tcIds.map(tcId => ({ tcId, coos: null }));
  } else {
    return res.status(400).json({ error: 'assignments[] or tcIds[] required' });
  }

  db.transaction(() => {
    // Order matters — delete child rows first since FKs aren't enforced.
    stmt.deleteAssignmentCoosByProgram.run(req.params.id);
    stmt.deleteAssignmentsByProgram.run(req.params.id);
    for (const { tcId, coos } of desired) {
      const assignmentId = uid();
      stmt.insertAssignment.run(assignmentId, req.params.id, tcId);
      const finalCoos = coos !== null
        ? coos
        : stmt.coosByTc.all(tcId).map(x => x.coo);  // no selection → all of TC's COOs
      for (const coo of finalCoos) {
        stmt.insertAssignmentCoo.run(assignmentId, coo);
      }
    }
  })();

  res.json(stmt.assignmentsByProgram.all(req.params.id).map(assignmentToDto));
});

// =============================================================
// SUBMISSIONS
// =============================================================

// GET /api/programs/:id/submissions
router.get('/programs/:id/submissions', requireAuth, (req, res) => {
  const rows = req.user.role === 'vendor'
    ? stmt.submissionsByProgramAndTc.all(req.params.id, req.user.tcId)
    : stmt.submissionsByProgram.all(req.params.id);
  res.json(rows.map(submissionFromRow));
});

// GET /api/styles/:id/submissions
router.get('/styles/:id/submissions', requireAuth, (req, res) => {
  // Vendors only see their own
  const rows = req.user.role === 'vendor'
    ? stmt.submissionsByStyleAndTc.all(req.params.id, req.user.tcId)
    : stmt.submissionsByStyle.all(req.params.id);
  res.json(rows.map(submissionFromRow));
});

// POST /api/submissions  — upsert with revision tracking
// Vendors: tcId forced to own; admin/pc: can specify any tcId
router.post('/submissions', requireAuth, (req, res) => {
  const role = req.user.role;
  if (!['admin', 'pc', 'vendor'].includes(role)) {
    return res.status(403).json({ error: 'Not allowed to submit quotes' });
  }

  const b = req.body;
  const tcId    = role === 'vendor' ? req.user.tcId : (b.tcId || req.user.tcId);
  const styleId = b.styleId;
  const coo     = b.coo;

  if (!styleId || !coo) return res.status(400).json({ error: 'styleId and coo required' });
  if (!tcId)            return res.status(400).json({ error: 'tcId required' });

  const timestamp    = now();
  const submitterName = req.user.name || req.user.email;

  const result = db.transaction(() => {
    const existing = stmt.submissionByKey.get(tcId, styleId, coo);

    if (existing) {
      // Track revisions for fob and factoryCost
      if (b.fob !== undefined && String(b.fob) !== String(existing.fob)) {
        stmt.insertRevision.run(uid(), existing.id, 'fob',
          String(existing.fob ?? ''), String(b.fob ?? ''),
          tcId, submitterName, timestamp);
      }
      if (b.factoryCost !== undefined && String(b.factoryCost) !== String(existing.factory_cost)) {
        stmt.insertRevision.run(uid(), existing.id, 'factoryCost',
          String(existing.factory_cost ?? ''), String(b.factoryCost ?? ''),
          tcId, submitterName, timestamp);
      }

      stmt.updateSubmissionCore.run(
        b.fob         ?? existing.fob,
        b.factoryCost ?? existing.factory_cost,
        b.tcMarkup    ?? existing.tc_markup,
        b.paymentTerms ?? existing.payment_terms,
        b.moq         ?? existing.moq,
        b.leadTime    ?? existing.lead_time,
        b.vendorComments ?? existing.vendor_comments,
        b.skipReason  ?? existing.skip_reason,
        b.status      ?? existing.status,
        timestamp,
        existing.id
      );
      return stmt.submissionByKey.get(tcId, styleId, coo);
    } else {
      const id = uid();
      stmt.insertSubmission.run(
        id, tcId, styleId, coo,
        b.fob ?? null, b.factoryCost ?? null, b.tcMarkup ?? null,
        b.paymentTerms || 'FOB',
        b.moq ?? null, b.leadTime ?? null, b.vendorComments ?? null,
        b.skipReason ?? null,
        role !== 'vendor' ? 1 : 0,
        timestamp
      );
      // Record initial revisions
      if (b.fob != null) {
        stmt.insertRevision.run(uid(), id, 'fob', null, String(b.fob), tcId, submitterName, timestamp);
      }
      if (b.factoryCost != null) {
        stmt.insertRevision.run(uid(), id, 'factoryCost', null, String(b.factoryCost), tcId, submitterName, timestamp);
      }
      return stmt.submissionByKey.get(tcId, styleId, coo);
    }
  })();

  res.status(200).json(submissionFromRow(result));
});

// PATCH /api/submissions/:id/flag
router.patch('/submissions/:id/flag', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.submissionById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const reason = req.body.reason || '';
  db.prepare(`UPDATE submissions SET status = 'flagged', flag_reason = ? WHERE id = ?`).run(reason, req.params.id);
  res.json(submissionFromRow(stmt.submissionById.get(req.params.id)));
});

// PATCH /api/submissions/:id/unflag
router.patch('/submissions/:id/unflag', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.submissionById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE submissions SET status = 'submitted', flag_reason = NULL WHERE id = ?`).run(req.params.id);
  res.json(submissionFromRow(stmt.submissionById.get(req.params.id)));
});

// PATCH /api/submissions/:id/accept
router.patch('/submissions/:id/accept', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = stmt.submissionById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE submissions SET status = 'accepted' WHERE id = ?`).run(req.params.id);
  res.json(submissionFromRow(stmt.submissionById.get(req.params.id)));
});

// =============================================================
// PLACEMENTS
// =============================================================

// GET /api/programs/:id/placements
router.get('/programs/:id/placements', requireAuth, (req, res) => {
  if (req.user.role === 'vendor' && !vendorAssignedTo(req.params.id, req.user.tcId)) {
    return res.status(403).json({ error: 'Not assigned to this program' });
  }
  res.json(stmt.placementsByProgram.all(req.params.id).map(placementFromRow));
});

// POST /api/placements  — upsert (place or update a style's placement)
router.post('/placements', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.styleId) return res.status(400).json({ error: 'styleId required' });

  // Find existing to preserve id
  const existing = stmt.placementByStyle.get(b.styleId);
  const placementId = existing?.id || uid();

  stmt.upsertPlacement.run(
    placementId, b.styleId, b.tcId || null, b.coo || null,
    b.factoryId === undefined ? null : (b.factoryId || null),
    b.confirmedFob ?? null,
    b.placedAt  || now(),
    b.placedBy  || req.user.id,
    b.placedByName || req.user.name,
    b.notes || null
  );

  // Also mark the style as placed
  if (stmt.styleById.get(b.styleId)) {
    db.prepare(`UPDATE styles SET status = 'placed' WHERE id = ?`).run(b.styleId);
  }

  res.json(placementFromRow(stmt.placementByStyle.get(b.styleId)));
});

// PATCH /api/placements/:styleId/factory
// Admin/PC can always set. Vendor can only set on their own
// placement and only to one of their active factories.
router.patch('/placements/:styleId/factory', requireAuth, (req, res) => {
  const pl = stmt.placementByStyle.get(req.params.styleId);
  if (!pl) return res.status(404).json({ error: 'Placement not found' });

  const role = req.user.role;
  const factoryId = req.body.factoryId || null;

  if (role === 'vendor') {
    if (pl.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Not your placement' });
    if (factoryId) {
      const f = db.prepare('SELECT id, tc_id, status FROM factories WHERE id = ?').get(factoryId);
      if (!f || f.tc_id !== req.user.tcId || f.status !== 'active') {
        return res.status(400).json({ error: 'factoryId must be one of your active factories' });
      }
    }
  } else if (!['admin', 'pc'].includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  db.prepare('UPDATE placements SET factory_id = ? WHERE style_id = ?').run(factoryId, req.params.styleId);
  res.json(placementFromRow(stmt.placementByStyle.get(req.params.styleId)));
});

// DELETE /api/placements/:styleId
router.delete('/placements/:styleId', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  stmt.deletePlacement.run(req.params.styleId);
  // Revert style to 'open' if it's currently placed
  const s = stmt.styleById.get(req.params.styleId);
  if (s && s.status === 'placed') {
    db.prepare(`UPDATE styles SET status = 'open' WHERE id = ?`).run(req.params.styleId);
  }
  res.json({ ok: true });
});

// =============================================================
// CUSTOMER ASSIGNMENTS
// =============================================================

// GET /api/programs/:id/customer-assignments
router.get('/programs/:id/customer-assignments', requireAuth, (req, res) => {
  const customerIds = stmt.custAssignsByProgram.all(req.params.id).map(r => r.customer_id);
  res.json(customerIds);
});

// PUT /api/programs/:id/customer-assignments  — replace list
router.put('/programs/:id/customer-assignments', requireAuth, requireRole('admin', 'pc', 'planning', 'sales'), (req, res) => {
  const customerIds = req.body.customerIds;
  if (!Array.isArray(customerIds)) return res.status(400).json({ error: 'customerIds array required' });

  db.transaction(() => {
    stmt.deleteCustAssigns.run(req.params.id);
    for (const cid of customerIds) {
      stmt.insertCustAssign.run(uid(), req.params.id, cid);
    }
  })();

  res.json(stmt.custAssignsByProgram.all(req.params.id).map(r => r.customer_id));
});

// =============================================================
// CUSTOMER BUYS
// =============================================================

// GET /api/programs/:id/customer-buys
router.get('/programs/:id/customer-buys', requireAuth, (req, res) => {
  res.json(stmt.custBuysByProgram.all(req.params.id).map(r => ({
    id: r.id, programId: r.program_id, styleId: r.style_id,
    customerId: r.customer_id, qty: r.qty, sellPrice: r.sell_price,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  })));
});

// PUT /api/programs/:id/customer-buys/:styleId  — upsert all buys for one style
router.put('/programs/:id/customer-buys/:styleId', requireAuth, requireRole('admin', 'pc', 'planning', 'sales'), (req, res) => {
  const buys = req.body.buys;
  if (!Array.isArray(buys)) return res.status(400).json({ error: 'buys array required' });

  db.transaction(() => {
    for (const b of buys) {
      if (!b.customerId) continue;
      if (b.qty == null && b.sellPrice == null) {
        // Delete if both are cleared
        stmt.deleteCustBuy.run(req.params.id, req.params.styleId, b.customerId);
      } else {
        stmt.upsertCustBuy.run(
          uid(), req.params.id, req.params.styleId, b.customerId,
          b.qty ?? null, b.sellPrice ?? null, b.notes ?? null, now()
        );
      }
    }
  })();

  res.json(stmt.custBuysByStyle.all(req.params.id, req.params.styleId).map(r => ({
    id: r.id, programId: r.program_id, styleId: r.style_id,
    customerId: r.customer_id, qty: r.qty, sellPrice: r.sell_price,
    notes: r.notes,
  })));
});

module.exports = router;
