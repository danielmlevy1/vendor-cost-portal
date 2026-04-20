// =============================================================
// VENDOR COST PORTAL — Supporting API routes
// Mounted at /api in server.js (alongside routes.js).
//
// Resources:
//   Fabric Library
//   Design Handoffs
//   Sales Requests (+ convert-to-program)
//   Design Changes
//   Recost Requests (+ state transitions)
//   Pending Changes (+ approve/reject with side-effects)
//   Style Links
//   Cell Flags
//   Revisions
//   Cost History
// =============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('./database');
const { requireAuth, requireRole } = require('./auth');

// ── Helpers ────────────────────────────────────────────────────

const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now  = () => new Date().toISOString();
const json = v => (typeof v === 'string' ? v : JSON.stringify(v ?? []));
const SALT = 10;

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

// =============================================================
// FABRIC LIBRARY
// =============================================================

function fabricFromRow(r) {
  return {
    id: r.id, fabricCode: r.fabric_code, fabricName: r.fabric_name,
    content: r.content, weight: r.weight, supplier: r.supplier,
    source: r.source, handoffId: r.handoff_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const FABRIC_FIELDS = {
  fabricCode: 'fabric_code', fabricName: 'fabric_name',
  content: 'content', weight: 'weight', supplier: 'supplier',
  source: 'source', handoffId: 'handoff_id',
};

router.get('/fabric-library', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM fabric_library ORDER BY fabric_code').all().map(fabricFromRow));
});

router.get('/fabric-library/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(fabricFromRow(row));
});

router.post('/fabric-library', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const b = req.body;
  if (!b.fabricCode) return res.status(400).json({ error: 'fabricCode required' });
  // Upsert by fabricCode (dedup)
  const existing = db.prepare('SELECT * FROM fabric_library WHERE fabric_code = ?').get(b.fabricCode);
  if (existing) {
    applyPatch('fabric_library', existing.id, b, FABRIC_FIELDS);
    db.prepare('UPDATE fabric_library SET updated_at = ? WHERE id = ?').run(now(), existing.id);
    return res.json(fabricFromRow(db.prepare('SELECT * FROM fabric_library WHERE id = ?').get(existing.id)));
  }
  const id = uid();
  db.prepare(`
    INSERT INTO fabric_library (id, fabric_code, fabric_name, content, weight, supplier, source, handoff_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, b.fabricCode, b.fabricName || null, b.content || null, b.weight || null,
         b.supplier || null, b.source || 'manual', b.handoffId || null, now());
  res.status(201).json(fabricFromRow(db.prepare('SELECT * FROM fabric_library WHERE id = ?').get(id)));
});

router.patch('/fabric-library/:id', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  applyPatch('fabric_library', req.params.id, req.body, FABRIC_FIELDS);
  db.prepare('UPDATE fabric_library SET updated_at = ? WHERE id = ?').run(now(), req.params.id);
  res.json(fabricFromRow(db.prepare('SELECT * FROM fabric_library WHERE id = ?').get(req.params.id)));
});

router.delete('/fabric-library/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  db.prepare('DELETE FROM fabric_library WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// =============================================================
// FABRIC STANDARDS REQUESTS + PACKAGES
// =============================================================

function fabricReqFromRow(r) {
  return {
    id:           r.id,
    tcId:         r.tc_id,
    programId:    r.program_id,
    handoffId:    r.handoff_id,
    fabricCode:   r.fabric_code,
    fabricName:   r.fabric_name,
    content:      r.content,
    swatchQty:    r.swatch_qty,
    styleIds:     JSON.parse(r.style_ids || '[]'),
    styleNumbers: JSON.parse(r.style_numbers || '[]'),
    status:       r.status,
    packageId:    r.package_id,
    requestedBy:  r.requested_by,
    requestedAt:  r.requested_at,
    sentAt:       r.sent_at,
    receivedAt:   r.received_at,
    cancelReason: r.cancel_reason,
    notes:        r.notes,
    pdStatus:     r.pd_status,
    pdNotes:      r.pd_notes,
    pdQty:        r.pd_qty,
  };
}

function fabricPkgFromRow(r) {
  return {
    id:         r.id,
    tcId:       r.tc_id,
    awbNumber:  r.awb_number,
    carrier:    r.carrier,
    notes:      r.notes,
    createdBy:  r.created_by,
    createdAt:  r.created_at,
    shippedAt:  r.shipped_at,
    receivedAt: r.received_at,
    status:     r.status,
  };
}

// GET /api/fabric-requests
// Vendors see their own requests. PD/admin/pc see everything.
router.get('/fabric-requests', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'vendor') {
    rows = db.prepare('SELECT * FROM fabric_requests WHERE tc_id = ? ORDER BY requested_at DESC').all(req.user.tcId);
  } else if (['admin', 'pc', 'prod_dev'].includes(req.user.role)) {
    rows = db.prepare('SELECT * FROM fabric_requests ORDER BY requested_at DESC').all();
  } else {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(rows.map(fabricReqFromRow));
});

// POST /api/fabric-requests
// Vendors submit one at a time OR in bulk ({ requests: [...] }).
// PD/admin can also create on behalf of a vendor (tcId in body).
router.post('/fabric-requests', requireAuth, (req, res) => {
  const inputs = Array.isArray(req.body.requests) ? req.body.requests : [req.body];
  const isVendor = req.user.role === 'vendor';
  if (!isVendor && !['admin', 'pc', 'prod_dev'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const insert = db.prepare(`
    INSERT INTO fabric_requests
      (id, tc_id, program_id, handoff_id, fabric_code, fabric_name, content,
       swatch_qty, style_ids, style_numbers, status, requested_by, requested_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const created = [];
  const tx = db.transaction(() => {
    for (const b of inputs) {
      if (!b || !b.fabricCode) throw new Error('fabricCode required');
      const tcId = isVendor ? req.user.tcId : (b.tcId || null);
      if (!tcId) throw new Error('tcId required');
      const id = uid();
      insert.run(
        id, tcId,
        b.programId || null,
        b.handoffId || null,
        b.fabricCode,
        b.fabricName || null,
        b.content || null,
        b.swatchQty != null ? Number(b.swatchQty) : null,
        JSON.stringify(Array.isArray(b.styleIds) ? b.styleIds : []),
        JSON.stringify(Array.isArray(b.styleNumbers) ? b.styleNumbers : []),
        'outstanding',
        b.requestedBy || req.user.name || req.user.email || null,
        now(),
        b.notes || null
      );
      created.push(id);
    }
  });
  try { tx(); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  const rows = db.prepare(
    `SELECT * FROM fabric_requests WHERE id IN (${created.map(() => '?').join(',')})`
  ).all(...created);
  res.status(201).json(rows.map(fabricReqFromRow));
});

// PATCH /api/fabric-requests/:id — status or notes updates
// Vendors can only cancel/uncancel their own outstanding requests.
router.patch('/fabric-requests/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const isVendor = req.user.role === 'vendor';
  if (isVendor && row.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Forbidden' });
  if (!isVendor && !['admin', 'pc', 'prod_dev'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const b = req.body;
  const sets = [];
  const vals = [];
  const accept = (cond, col, val) => { if (cond) { sets.push(`${col} = ?`); vals.push(val); } };

  if (isVendor) {
    // Vendor can only cancel their own still-outstanding request
    if (b.status === 'cancelled' && row.status === 'outstanding') {
      accept(true, 'status', 'cancelled');
      accept(true, 'cancel_reason', b.cancelReason || null);
    } else {
      return res.status(403).json({ error: 'Vendors can only cancel outstanding requests' });
    }
  } else {
    accept(b.status         !== undefined, 'status',        b.status);
    accept(b.notes          !== undefined, 'notes',         b.notes);
    accept(b.swatchQty      !== undefined, 'swatch_qty',    b.swatchQty != null ? Number(b.swatchQty) : null);
    accept(b.sentAt         !== undefined, 'sent_at',       b.sentAt);
    accept(b.receivedAt     !== undefined, 'received_at',   b.receivedAt);
    accept(b.cancelReason   !== undefined, 'cancel_reason', b.cancelReason);
    accept(b.pdStatus       !== undefined, 'pd_status',     b.pdStatus);
    accept(b.pdNotes        !== undefined, 'pd_notes',      b.pdNotes);
    accept(b.pdQty          !== undefined, 'pd_qty',        b.pdQty != null ? Number(b.pdQty) : null);
    if (b.status === 'sent'     && row.sent_at     == null) accept(true, 'sent_at',     now());
    if (b.status === 'received' && row.received_at == null) accept(true, 'received_at', now());
  }

  if (!sets.length) return res.json(fabricReqFromRow(row));
  vals.push(req.params.id);
  db.prepare(`UPDATE fabric_requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(fabricReqFromRow(db.prepare('SELECT * FROM fabric_requests WHERE id = ?').get(req.params.id)));
});

// DELETE /api/fabric-requests/:id
router.delete('/fabric-requests/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const isVendor = req.user.role === 'vendor';
  if (isVendor && (row.tc_id !== req.user.tcId || row.status !== 'outstanding')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!isVendor && !['admin', 'pc', 'prod_dev'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  db.prepare('DELETE FROM fabric_requests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/fabric-packages
router.get('/fabric-packages', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'vendor') {
    rows = db.prepare('SELECT * FROM fabric_packages WHERE tc_id = ? ORDER BY created_at DESC').all(req.user.tcId);
  } else if (['admin', 'pc', 'prod_dev'].includes(req.user.role)) {
    rows = db.prepare('SELECT * FROM fabric_packages ORDER BY created_at DESC').all();
  } else {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(rows.map(fabricPkgFromRow));
});

// POST /api/fabric-packages — PD creates a package and (optionally)
// attaches outstanding requests to it. Body shape:
//   {
//     tcId, awbNumber?, carrier?, notes?, markSent?,
//     // Either pass plain ids:
//     requestIds: [id, ...],
//     // OR pass per-request markings (preferred — captures PD's status/notes):
//     requests:   [{ id, pdStatus?, pdNotes? }, ...]
//   }
router.post('/fabric-packages', requireAuth, requireRole('admin', 'pc', 'prod_dev'), (req, res) => {
  const b = req.body;
  if (!b.tcId) return res.status(400).json({ error: 'tcId required' });

  // Normalize: prefer detailed `requests`, fall back to bare `requestIds`.
  const items = Array.isArray(b.requests) && b.requests.length
    ? b.requests
        .filter(x => x && typeof x.id === 'string')
        .map(x => ({
          id:       x.id,
          pdStatus: x.pdStatus || null,
          pdNotes:  x.pdNotes  || null,
          pdQty:    x.pdQty != null && x.pdQty !== '' ? Number(x.pdQty) : null,
        }))
    : (Array.isArray(b.requestIds) ? b.requestIds.map(id => ({ id, pdStatus: null, pdNotes: null, pdQty: null })) : []);

  const id = uid();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO fabric_packages (id, tc_id, awb_number, carrier, notes, created_by, created_at, status)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, b.tcId, b.awbNumber || null, b.carrier || null, b.notes || null,
           req.user.name || req.user.email || req.user.id, now(),
           b.markSent ? 'sent' : 'draft');

    if (items.length) {
      const attach = db.prepare(`
        UPDATE fabric_requests
        SET package_id = ?, status = ?, sent_at = COALESCE(sent_at, ?),
            pd_status = COALESCE(?, pd_status),
            pd_notes  = COALESCE(?, pd_notes),
            pd_qty    = COALESCE(?, pd_qty)
        WHERE id = ? AND tc_id = ?
      `);
      const sentAt = b.markSent ? now() : null;
      const newStatus = b.markSent ? 'sent' : 'packaged';
      for (const it of items) {
        attach.run(id, newStatus, sentAt, it.pdStatus, it.pdNotes, it.pdQty, it.id, b.tcId);
      }
    }
    if (b.markSent) {
      db.prepare('UPDATE fabric_packages SET shipped_at = ? WHERE id = ?').run(now(), id);
    }
  });
  tx();

  res.status(201).json(fabricPkgFromRow(db.prepare('SELECT * FROM fabric_packages WHERE id = ?').get(id)));
});

// PATCH /api/fabric-packages/:id — update status, tracking, etc.
// Transitions cascade to the requests attached to the package.
router.patch('/fabric-packages/:id', requireAuth, requireRole('admin', 'pc', 'prod_dev'), (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_packages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;

  const sets = [];
  const vals = [];
  const accept = (cond, col, val) => { if (cond) { sets.push(`${col} = ?`); vals.push(val); } };

  accept(b.awbNumber !== undefined, 'awb_number', b.awbNumber);
  accept(b.carrier   !== undefined, 'carrier',    b.carrier);
  accept(b.notes     !== undefined, 'notes',      b.notes);

  let cascadeStatus = null, cascadeTimestampCol = null;
  if (b.status === 'sent' && row.status !== 'sent') {
    accept(true, 'status', 'sent'); accept(true, 'shipped_at', now());
    cascadeStatus = 'sent'; cascadeTimestampCol = 'sent_at';
  } else if (b.status === 'received' && row.status !== 'received') {
    accept(true, 'status', 'received'); accept(true, 'received_at', now());
    cascadeStatus = 'received'; cascadeTimestampCol = 'received_at';
  } else if (b.status === 'cancelled' && row.status !== 'cancelled') {
    accept(true, 'status', 'cancelled');
    cascadeStatus = 'outstanding'; // detach-like behavior: requests flip back to outstanding
  } else if (b.status !== undefined) {
    accept(true, 'status', b.status);
  }

  const tx = db.transaction(() => {
    if (sets.length) {
      vals.push(req.params.id);
      db.prepare(`UPDATE fabric_packages SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    if (cascadeStatus === 'outstanding') {
      db.prepare(`UPDATE fabric_requests SET package_id = NULL, status = 'outstanding' WHERE package_id = ?`)
        .run(req.params.id);
    } else if (cascadeStatus) {
      if (cascadeTimestampCol) {
        db.prepare(`UPDATE fabric_requests SET status = ?, ${cascadeTimestampCol} = COALESCE(${cascadeTimestampCol}, ?) WHERE package_id = ?`)
          .run(cascadeStatus, now(), req.params.id);
      } else {
        db.prepare(`UPDATE fabric_requests SET status = ? WHERE package_id = ?`)
          .run(cascadeStatus, req.params.id);
      }
    }
  });
  tx();

  res.json(fabricPkgFromRow(db.prepare('SELECT * FROM fabric_packages WHERE id = ?').get(req.params.id)));
});

// DELETE /api/fabric-packages/:id — detaches all its requests back to outstanding
router.delete('/fabric-packages/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM fabric_packages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.transaction(() => {
    db.prepare(`UPDATE fabric_requests SET package_id = NULL, status = 'outstanding' WHERE package_id = ?`)
      .run(req.params.id);
    db.prepare('DELETE FROM fabric_packages WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

// GET /api/vendor/available-fabrics
// Returns the fabric catalog the calling vendor can request standards for:
// every fabric in design handoffs whose linked program they are assigned
// to. Each entry is annotated with already-requested status so the UI
// can disable rows that are already outstanding/packaged/sent/received.
router.get('/vendor/available-fabrics', requireAuth, (req, res) => {
  if (req.user.role !== 'vendor') {
    return res.status(403).json({ error: 'Vendors only' });
  }
  const tcId = req.user.tcId;

  // Programs the vendor is assigned to (live programs only — skip draft/cancelled)
  const programs = db.prepare(`
    SELECT p.*
    FROM programs p
    JOIN assignments a ON a.program_id = p.id
    WHERE a.tc_id = ? AND p.status NOT IN ('Draft', 'Cancelled')
    ORDER BY p.created_at DESC
  `).all(tcId);

  // Index existing requests by (program, fabric_code) so the UI can
  // tell the vendor which fabrics they've already requested.
  const existing = db.prepare(`
    SELECT id, program_id, fabric_code, status, requested_at, package_id, sent_at, received_at
    FROM fabric_requests
    WHERE tc_id = ? AND status != 'cancelled'
  `).all(tcId);
  const existingMap = new Map();
  for (const r of existing) {
    existingMap.set(`${r.program_id || ''}::${r.fabric_code}`, r);
  }

  const result = [];
  for (const p of programs) {
    // Source of fabrics for a program: a design handoff explicitly linked
    // to it. If the program was created without going through the handoff
    // workflow (so linked_program_id was never set), fall back to a
    // metadata match on season/year/brand/tier — that's good enough to
    // surface the right catalog without forcing a manual link step.
    let handoff = db.prepare(
      `SELECT id, fabrics_list, styles_list FROM design_handoffs WHERE linked_program_id = ?`
    ).get(p.id);
    if (!handoff) {
      handoff = db.prepare(`
        SELECT id, fabrics_list, styles_list FROM design_handoffs
        WHERE (linked_program_id IS NULL OR linked_program_id = '')
          AND COALESCE(season,'') = COALESCE(?, '')
          AND COALESCE(year,'')   = COALESCE(?, '')
          AND COALESCE(brand,'')  = COALESCE(?, '')
          AND COALESCE(tier,'')   = COALESCE(?, '')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(p.season, p.year, p.brand, p.retailer);
    }
    if (!handoff) continue;
    const fabricsList = JSON.parse(handoff.fabrics_list || '[]');
    if (!fabricsList.length) continue;

    const stylesList = JSON.parse(handoff.styles_list || '[]');

    // Build content→code and content→[styleNumbers] maps from the styles
    // list. Many handoffs put the actual fabric SKU only on the styles
    // (e.g. style.fabric = "HLK0001 80/20 POLY SPAN 180 GSM"), where the
    // first whitespace-delimited token is the code and the remainder is
    // the composition. We use this to enrich fabric records that arrive
    // with only `content` populated.
    const contentToCode   = {};
    const contentToStyles = {};
    const codeToStyles    = {};
    for (const s of stylesList) {
      const styleNum = s.styleNumber || s.style_number || s.styleNum || '';
      // 1. Explicit fabricCode field on style (rare in current data)
      const explicitCode = s.fabricCode || s.fabric_code || '';
      if (explicitCode) {
        (codeToStyles[explicitCode] ||= []).push(styleNum);
      }
      // 2. Embedded "CODE CONTENT" in style.fabric / style.fabrication
      const fabricStr = s.fabric || s.fabrication || '';
      if (!fabricStr) continue;
      const m = fabricStr.match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      const code = m[1].trim();
      const content = m[2].trim();
      const cKey = content.toLowerCase();
      contentToCode[cKey] = contentToCode[cKey] || code;
      (contentToStyles[cKey] ||= []).push(styleNum);
      (codeToStyles[code]    ||= []).push(styleNum);
    }

    // Some uploads only populate `content` (Design recorded fabrics by
    // composition, not by SKU). For each fabric record:
    //   - prefer explicit code on the record
    //   - else look up the code from the styles-list lookup table built above
    //   - else fall back to the content / name / 'unspecified'
    // Records that resolve to the same identity are deduped.
    const dedup = new Map();
    for (const f of fabricsList) {
      const rawCode = f.code || f.fabricCode || f.fabricRef || f.ref || '';
      const rawName = f.name || f.fabricName || f.description || '';
      const content = f.content || f.composition || '';
      const weight  = f.weight || f.gsm || f.weightGsm || f.weight_gsm || '';
      // Lookup code from the styles list when the fabric record itself
      // doesn't carry one. Match by composition (case-insensitive).
      const lookedUpCode = rawCode || contentToCode[content.toLowerCase()] || '';
      const fabricCode = lookedUpCode || rawName || content || 'unspecified';
      const fabricName = rawName || content || lookedUpCode || '—';
      const dedupKey = lookedUpCode
        ? `code::${lookedUpCode.trim().toLowerCase()}`
        : `cw::${content.trim().toLowerCase()}|${String(weight).trim().toLowerCase()}`;
      const styleNums = (codeToStyles[lookedUpCode] || contentToStyles[content.toLowerCase()] || []);

      if (!dedup.has(dedupKey)) {
        dedup.set(dedupKey, {
          fabricCode, fabricName, content, weight,
          styleNumbers: new Set(styleNums),
        });
      } else {
        const acc = dedup.get(dedupKey);
        if (!acc.fabricCode || acc.fabricCode === 'unspecified') acc.fabricCode = fabricCode;
        if (!acc.fabricName || acc.fabricName === '—')           acc.fabricName = fabricName;
        if (!acc.content)                                         acc.content    = content;
        if (!acc.weight)                                          acc.weight     = weight;
        styleNums.forEach(s => acc.styleNumbers.add(s));
      }
    }

    const fabrics = [...dedup.values()].map(d => {
      const key = `${p.id}::${d.fabricCode}`;
      const already = existingMap.get(key);
      return {
        fabricCode:   d.fabricCode,
        fabricName:   d.fabricName,
        content:      d.content,
        weight:       d.weight,
        styleNumbers: [...d.styleNumbers],
        existing:     already ? {
          id:     already.id,
          status: already.status,
          requestedAt: already.requested_at,
        } : null,
      };
    });

    result.push({
      programId:   p.id,
      programName: p.name,
      season:      p.season,
      year:        p.year,
      retailer:    p.retailer,
      handoffId:   handoff.id,
      fabrics,
    });
  }

  res.json(result);
});

// =============================================================
// DESIGN HANDOFFS
// =============================================================

function handoffFromRow(r) {
  return {
    id: r.id, season: r.season, year: r.year, brand: r.brand, tier: r.tier, gender: r.gender,
    stylesList:           JSON.parse(r.styles_list   || '[]'),
    fabricsList:          JSON.parse(r.fabrics_list  || '[]'),
    trimsList:            JSON.parse(r.trims_list    || '[]'),
    stylesUploaded:       !!r.styles_uploaded,
    fabricsUploaded:      !!r.fabrics_uploaded,
    fabricsUploadedAt:    r.fabrics_uploaded_at,
    trimsUploaded:        !!r.trims_uploaded,
    trimsUploadedAt:      r.trims_uploaded_at,
    linkedProgramId:      r.linked_program_id,
    linkedRequestId:      r.linked_request_id,
    supplierRequestNumber:r.supplier_request_number,
    assignedTCIds:        JSON.parse(r.assigned_tc_ids || '[]'),
    firstCRD:             r.first_crd,
    startDate:            r.start_date,
    endDate:              r.end_date,
    vendorsAssignedAt:    r.vendors_assigned_at,
    submitted:            !!r.submitted,
    submittedAt:          r.submitted_at,
    submittedForCosting:  !!r.submitted_for_costing,
    createdAt:            r.created_at,
  };
}

const HANDOFF_FIELDS = {
  season: 'season', year: 'year', brand: 'brand', tier: 'tier', gender: 'gender',
  supplierRequestNumber: 'supplier_request_number',
  linkedProgramId:    'linked_program_id',
  linkedRequestId:    'linked_request_id',
  firstCRD:           'first_crd',
  startDate:          'start_date',
  endDate:            'end_date',
  vendorsAssignedAt:  'vendors_assigned_at',
  submitted:          'submitted',
  submittedAt:        'submitted_at',
  submittedForCosting:'submitted_for_costing',
  fabricsUploadedAt:  'fabrics_uploaded_at',
  trimsUploadedAt:    'trims_uploaded_at',
  stylesUploaded:     'styles_uploaded',
  fabricsUploaded:    'fabrics_uploaded',
  trimsUploaded:      'trims_uploaded',
};

router.get('/design-handoffs', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM design_handoffs ORDER BY created_at DESC').all().map(handoffFromRow));
});

router.get('/design-handoffs/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(handoffFromRow(row));
});

router.post('/design-handoffs', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const b = req.body;
  const id = uid();
  const stylesList  = b.stylesList  || [];
  const fabricsList = b.fabricsList || [];
  const trimsList   = b.trimsList   || [];

  db.prepare(`
    INSERT INTO design_handoffs
      (id, season, year, brand, tier, gender,
       styles_list, fabrics_list, trims_list,
       styles_uploaded, fabrics_uploaded, trims_uploaded,
       supplier_request_number, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.season || null, b.year || null, b.brand || null, b.tier || null, b.gender || null,
         json(stylesList), json(fabricsList), json(trimsList),
         stylesList.length  > 0 ? 1 : 0,
         fabricsList.length > 0 ? 1 : 0,
         trimsList.length   > 0 ? 1 : 0,
         b.supplierRequestNumber || null, now());

  // Upsert any fabrics into the fabric library
  if (fabricsList.length) {
    _upsertFabricLibrary(fabricsList, id);
  }

  res.status(201).json(handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(id)));
});

router.patch('/design-handoffs/:id', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;

  // JSON array fields handled separately
  const jsonFields = { stylesList: 'styles_list', fabricsList: 'fabrics_list', trimsList: 'trims_list', assignedTCIds: 'assigned_tc_ids' };
  for (const [camel, col] of Object.entries(jsonFields)) {
    if (b[camel] !== undefined) {
      db.prepare(`UPDATE design_handoffs SET ${col} = ? WHERE id = ?`).run(json(b[camel]), req.params.id);
    }
  }

  applyPatch('design_handoffs', req.params.id, b, HANDOFF_FIELDS);

  // Upsert new fabrics into library
  if (Array.isArray(b.fabricsList) && b.fabricsList.length) {
    _upsertFabricLibrary(b.fabricsList, req.params.id);
  }

  res.json(handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id)));
});

router.delete('/design-handoffs/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  db.prepare('DELETE FROM design_handoffs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function _upsertFabricLibrary(fabricsList, handoffId) {
  const upsert = db.prepare(`
    INSERT INTO fabric_library (id, fabric_code, fabric_name, content, weight, supplier, source, handoff_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(fabric_code) DO UPDATE SET
      fabric_name = excluded.fabric_name,
      content     = excluded.content,
      weight      = excluded.weight,
      supplier    = excluded.supplier,
      source      = excluded.source,
      handoff_id  = excluded.handoff_id,
      updated_at  = excluded.updated_at
  `);
  const ts = now();
  db.transaction(() => {
    for (const f of fabricsList) {
      if (!f.fabricCode) continue;
      upsert.run(uid(), f.fabricCode, f.fabricName || null, f.content || null,
                 f.weight || null, f.supplier || null, 'design-handoff', handoffId, ts, ts);
    }
  })();
}

// =============================================================
// SALES REQUESTS
// =============================================================

function srFromRow(r) {
  return {
    id: r.id, status: r.status,
    season: r.season, year: r.year, brand: r.brand, gender: r.gender, retailer: r.retailer,
    inWhseDate:         r.in_warehouse_date,
    costDueDate:        r.cost_request_due_date,
    styles:             JSON.parse(r.styles           || '[]'),
    cancelledStyles:    JSON.parse(r.cancelled_styles || '[]'),
    sourceHandoffId:    r.source_handoff_id,
    handoffId:          r.handoff_id,
    linkedProgramId:    r.linked_program_id,
    requestedBy:        r.requested_by,
    requestedByName:    r.requested_by_name,
    salesSubmittedAt:   r.sales_submitted_at,
    assignedTCIds:      JSON.parse(r.assigned_tc_ids || '[]'),
    firstCRD:           r.first_crd,
    startDate:          r.start_date,
    endDate:            r.end_date,
    vendorsAssignedAt:  r.vendors_assigned_at,
    createdAt:          r.created_at,
  };
}

const SR_FIELDS = {
  status:             'status',
  season:             'season',
  year:               'year',
  brand:              'brand',
  gender:             'gender',
  retailer:           'retailer',
  inWhseDate:         'in_warehouse_date',
  costDueDate:        'cost_request_due_date',
  sourceHandoffId:    'source_handoff_id',
  handoffId:          'handoff_id',
  linkedProgramId:    'linked_program_id',
  requestedBy:        'requested_by',
  requestedByName:    'requested_by_name',
  salesSubmittedAt:   'sales_submitted_at',
  firstCRD:           'first_crd',
  startDate:          'start_date',
  endDate:            'end_date',
  vendorsAssignedAt:  'vendors_assigned_at',
};

router.get('/sales-requests', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sales_requests ORDER BY created_at DESC').all();
  res.json(rows.map(srFromRow));
});

router.get('/sales-requests/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(srFromRow(row));
});

router.post('/sales-requests', requireAuth, (req, res) => {
  const b = req.body;
  const id = uid();
  db.prepare(`
    INSERT INTO sales_requests
      (id, status, season, year, brand, gender, retailer,
       in_warehouse_date, cost_request_due_date,
       styles, cancelled_styles, source_handoff_id,
       requested_by, requested_by_name, sales_submitted_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.status || 'submitted',
         b.season || null, b.year || null, b.brand || null, b.gender || null, b.retailer || null,
         b.inWhseDate || b.inWarehouseDate || null,
         b.costDueDate || b.costRequestDueDate || null,
         json(b.styles || []),
         json(b.cancelledStyles || []),
         b.sourceHandoffId || null,
         b.requestedBy || b.submittedById || null,
         b.requestedByName || b.submittedByName || null,
         b.salesSubmittedAt || null,
         now());
  res.status(201).json(srFromRow(db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(id)));
});

router.patch('/sales-requests/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;

  if (b.styles          !== undefined) db.prepare('UPDATE sales_requests SET styles = ? WHERE id = ?').run(json(b.styles), req.params.id);
  if (b.cancelledStyles !== undefined) db.prepare('UPDATE sales_requests SET cancelled_styles = ? WHERE id = ?').run(json(b.cancelledStyles), req.params.id);
  if (b.assignedTCIds   !== undefined) db.prepare('UPDATE sales_requests SET assigned_tc_ids = ? WHERE id = ?').run(json(b.assignedTCIds), req.params.id);

  applyPatch('sales_requests', req.params.id, b, SR_FIELDS);
  res.json(srFromRow(db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id)));
});

router.delete('/sales-requests/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  db.prepare('DELETE FROM sales_requests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/sales-requests/:id/convert  — creates Program + bulk styles, marks SR converted
// Body: { internalProgramId, name, targetMargin, season, year, retailer, brand, gender, market, status, sourceHandoffId }
router.post('/sales-requests/:id/convert', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const sr = db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id);
  if (!sr) return res.status(404).json({ error: 'Sales request not found' });

  const b = req.body;
  const progId = uid();
  const styles = JSON.parse(sr.styles || '[]');

  db.transaction(() => {
    // Create program
    db.prepare(`
      INSERT INTO programs (id, name, brand, retailer, gender, season, year, status, market,
                            target_margin, internal_program_id, version, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
    `).run(progId,
           b.name || null, b.brand || sr.brand || null,
           b.retailer || sr.retailer || null,
           b.gender || sr.gender || null,
           b.season || sr.season || null,
           b.year   || sr.year   || null,
           b.status || 'Costing',
           b.market || 'USA',
           b.targetMargin ?? null,
           b.internalProgramId || null,
           now());

    // Bulk-create styles from the SR's styles array
    const insertStyle = db.prepare(`
      INSERT INTO styles (id, program_id, style_number, style_name, category, fabrication,
                          status, proj_qty, proj_sell_price, duty_rate, est_freight, created_at)
      VALUES (?,?,?,?,?,?,'open',?,?,?,?,?)
    `);
    for (const s of styles) {
      insertStyle.run(uid(), progId,
        s.styleNumber || null, s.styleName || null,
        s.category || null, s.fabrication || null,
        s.projQty ?? null, s.projSellPrice ?? null,
        s.dutyRate ?? null, s.estFreight ?? null,
        now());
    }

    // Mark SR as converted
    db.prepare('UPDATE sales_requests SET status = ?, linked_program_id = ? WHERE id = ?')
      .run('converted', progId, req.params.id);
  })();

  const updatedSR = srFromRow(db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id));
  const prog = db.prepare('SELECT * FROM programs WHERE id = ?').get(progId);
  res.json({ salesRequest: updatedSR, program: prog });
});

// =============================================================
// DESIGN CHANGES
// =============================================================

function dcFromRow(r) {
  return {
    id: r.id, styleId: r.style_id, programId: r.program_id,
    styleNumber: r.style_number, description: r.description,
    field: r.field, previousValue: r.previous_value, newValue: r.new_value,
    changedBy: r.changed_by, changedByName: r.changed_by_name, changedAt: r.changed_at,
  };
}

// GET /api/styles/:id/design-changes
router.get('/styles/:id/design-changes', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM design_changes WHERE style_id = ? ORDER BY changed_at DESC').all(req.params.id).map(dcFromRow));
});

// GET /api/programs/:id/design-changes
router.get('/programs/:id/design-changes', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM design_changes WHERE program_id = ? ORDER BY changed_at DESC').all(req.params.id).map(dcFromRow));
});

// POST /api/design-changes  — append-only log
router.post('/design-changes', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.styleId) return res.status(400).json({ error: 'styleId required' });
  const id = uid();
  db.prepare(`
    INSERT INTO design_changes
      (id, style_id, program_id, style_number, description, field,
       previous_value, new_value, changed_by, changed_by_name, changed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.styleId, b.programId || null, b.styleNumber || null,
         b.description || null, b.field || null,
         b.previousValue ?? null, b.newValue ?? null,
         b.changedBy || null, b.changedByName || null,
         b.changedAt || now());
  res.status(201).json(dcFromRow(db.prepare('SELECT * FROM design_changes WHERE id = ?').get(id)));
});

// =============================================================
// RECOST REQUESTS
// =============================================================

function rcrFromRow(r) {
  return {
    id: r.id, programId: r.program_id, styleId: r.style_id,
    styleIds:           JSON.parse(r.style_ids || '[]'),
    status:             r.status,
    category:           r.category,
    note:               r.note,
    previousValue:      r.previous_value,
    newValue:           r.new_value,
    requestedBy:        r.requested_by,
    requestedByName:    r.requested_by_name,
    designChangeId:     r.design_change_id,
    salesApprovedBy:    r.sales_approved_by,
    salesApprovedByName:r.sales_approved_by_name,
    salesApprovedAt:    r.sales_approved_at,
    releasedBy:         r.released_by,
    releasedByName:     r.released_by_name,
    releasedAt:         r.released_at,
    rejectionNote:      r.rejection_note,
    rejectedStage:      r.rejected_stage,
    rejectedAt:         r.rejected_at,
    createdAt:          r.created_at,
  };
}

// GET /api/programs/:id/recost-requests
router.get('/programs/:id/recost-requests', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM recost_requests WHERE program_id = ? ORDER BY created_at DESC').all(req.params.id).map(rcrFromRow));
});

// GET /api/recost-requests?status=pending_sales|pending_production|all
router.get('/recost-requests', requireAuth, (req, res) => {
  const status = req.query.status;
  const TERMINAL = ['dismissed', 'rejected', 'released'];
  let rows;
  if (status === 'pending_sales') {
    rows = db.prepare(`SELECT * FROM recost_requests WHERE status IN ('pending_sales','pending') ORDER BY created_at`).all();
  } else if (status === 'pending_production') {
    rows = db.prepare(`SELECT * FROM recost_requests WHERE status = 'pending_production' ORDER BY created_at`).all();
  } else if (status === 'active') {
    rows = db.prepare(`SELECT * FROM recost_requests WHERE status NOT IN ('dismissed','rejected','released') ORDER BY created_at`).all();
  } else {
    rows = db.prepare('SELECT * FROM recost_requests ORDER BY created_at DESC').all();
  }
  res.json(rows.map(rcrFromRow));
});

// POST /api/recost-requests  — create
router.post('/recost-requests', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.programId) return res.status(400).json({ error: 'programId required' });
  const id = 'rcr_' + uid();
  db.prepare(`
    INSERT INTO recost_requests
      (id, program_id, style_id, style_ids, status, category, note,
       previous_value, new_value, requested_by, requested_by_name, design_change_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.programId, b.styleId || null,
         json(b.styleIds || (b.styleId ? [b.styleId] : [])),
         b.status || 'pending_sales',
         b.category || 'Other', b.note || null,
         b.previousValue ?? null, b.newValue ?? null,
         b.requestedBy || null, b.requestedByName || null,
         b.designChangeId || null, now());
  res.status(201).json(rcrFromRow(db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(id)));
});

// POST /api/recost-requests/:id/sales-approve
router.post('/recost-requests/:id/sales-approve', requireAuth, requireRole('admin', 'pc', 'planning'), (req, res) => {
  const row = db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const ts = now();
  db.prepare(`
    UPDATE recost_requests SET status='pending_production',
      sales_approved_by=?, sales_approved_by_name=?, sales_approved_at=?
    WHERE id=?
  `).run(req.user.id, req.user.name || req.user.email, ts, req.params.id);
  res.json(rcrFromRow(db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id)));
});

// POST /api/recost-requests/:id/reject
// Body: { note?, stage? }  stage defaults to 'production'
router.post('/recost-requests/:id/reject', requireAuth, requireRole('admin', 'pc', 'planning'), (req, res) => {
  const row = db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const stage = req.body.stage || 'production';
  db.prepare(`
    UPDATE recost_requests SET status='rejected', rejection_note=?, rejected_stage=?, rejected_at=?
    WHERE id=?
  `).run(req.body.note || null, stage, now(), req.params.id);
  res.json(rcrFromRow(db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id)));
});

// POST /api/recost-requests/:id/release
// Marks submissions outdated, bumps program version, writes cost history entry.
router.post('/recost-requests/:id/release', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const ts = now();
  const releasedBy     = req.user.id;
  const releasedByName = req.user.name || req.user.email;

  db.transaction(() => {
    // Mark released
    db.prepare(`
      UPDATE recost_requests SET status='released', released_by=?, released_by_name=?, released_at=?
      WHERE id=?
    `).run(releasedBy, releasedByName, ts, req.params.id);

    // Mark all submissions for this style as outdated
    if (row.style_id) {
      db.prepare('UPDATE submissions SET is_outdated=1 WHERE style_id=?').run(row.style_id);
    }

    // Bump program version
    db.prepare('UPDATE programs SET version = version + 1 WHERE id = ?').run(row.program_id);

    // Write cost history
    db.prepare(`
      INSERT INTO cost_history
        (id, style_id, program_id, type, category, note,
         requested_by, requested_by_name, released_by, released_by_name, timestamp)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(uid(), row.style_id, row.program_id, 'recosted',
           row.category, row.note,
           row.requested_by, row.requested_by_name,
           releasedBy, releasedByName, ts);
  })();

  res.json(rcrFromRow(db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id)));
});

// POST /api/recost-requests/:id/dismiss
router.post('/recost-requests/:id/dismiss', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE recost_requests SET status='dismissed' WHERE id=?`).run(req.params.id);
  res.json(rcrFromRow(db.prepare('SELECT * FROM recost_requests WHERE id = ?').get(req.params.id)));
});

// =============================================================
// PENDING CHANGES  (admin approval queue for settings changes)
// =============================================================

function pcFromRow(r) {
  return {
    id: r.id, type: r.type, action: r.action,
    data:        JSON.parse(r.data        || '{}'),
    currentData: JSON.parse(r.current_data || 'null'),
    status:      r.status,
    proposedAt:      r.proposed_at,
    proposedBy:      r.proposed_by,
    proposedByName:  r.proposed_by_name,
    reviewedBy:      r.reviewed_by,
    reviewedAt:      r.reviewed_at,
  };
}

// GET /api/pending-changes
router.get('/pending-changes', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const status = req.query.status;
  const rows = status
    ? db.prepare('SELECT * FROM pending_changes WHERE status = ? ORDER BY proposed_at DESC').all(status)
    : db.prepare('SELECT * FROM pending_changes ORDER BY proposed_at DESC').all();
  res.json(rows.map(pcFromRow));
});

// POST /api/pending-changes  — propose
router.post('/pending-changes', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.type || !b.action) return res.status(400).json({ error: 'type and action required' });
  const id = uid();
  db.prepare(`
    INSERT INTO pending_changes (id, type, action, data, current_data, proposed_by, proposed_by_name, proposed_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, b.type, b.action,
         json(b.data || {}), json(b.currentData ?? null),
         b.proposedBy || req.user.id,
         b.proposedByName || req.user.name,
         now());
  res.status(201).json(pcFromRow(db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(id)));
});

// POST /api/pending-changes/:id/approve
router.post('/pending-changes/:id/approve', requireAuth, requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

  const d  = JSON.parse(row.data || '{}');
  const ts = now();

  db.transaction(() => {
    _applyPendingChange(row.type, row.action, d);
    db.prepare('UPDATE pending_changes SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?')
      .run('approved', req.user.id, ts, req.params.id);
  })();

  res.json(pcFromRow(db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(req.params.id)));
});

// POST /api/pending-changes/:id/reject
router.post('/pending-changes/:id/reject', requireAuth, requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });
  db.prepare('UPDATE pending_changes SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?')
    .run('rejected', req.user.id, now(), req.params.id);
  res.json(pcFromRow(db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(req.params.id)));
});

function _applyPendingChange(type, action, d) {
  if (type === 'tc') {
    if (action === 'create') {
      const id = d.id || uid();
      const hash = bcrypt.hashSync(d.password || 'vendor123', SALT);
      db.prepare('INSERT OR IGNORE INTO trading_companies (id,code,name,email,password_hash,payment_terms) VALUES (?,?,?,?,?,?)')
        .run(id, d.code, d.name, d.email, hash, d.paymentTerms || 'FOB');
      if (Array.isArray(d.coos)) {
        for (const coo of d.coos) db.prepare('INSERT OR IGNORE INTO tc_coos (tc_id,coo) VALUES (?,?)').run(id, coo);
      }
    } else if (action === 'update') {
      const setClauses = ['name=?', 'code=?', 'email=?', 'payment_terms=?'];
      const vals = [d.name, d.code, d.email, d.paymentTerms || 'FOB'];
      if (d.password) { setClauses.push('password_hash=?'); vals.push(bcrypt.hashSync(d.password, SALT)); }
      vals.push(d.id);
      db.prepare(`UPDATE trading_companies SET ${setClauses.join(',')} WHERE id=?`).run(...vals);
      if (Array.isArray(d.coos)) {
        db.prepare('DELETE FROM tc_coos WHERE tc_id=?').run(d.id);
        for (const coo of d.coos) db.prepare('INSERT OR IGNORE INTO tc_coos (tc_id,coo) VALUES (?,?)').run(d.id, coo);
      }
    } else if (action === 'delete') {
      db.prepare('DELETE FROM trading_companies WHERE id=?').run(d.id);
      db.prepare('DELETE FROM tc_coos WHERE tc_id=?').run(d.id);
    }

  } else if (type === 'coo') {
    if (action === 'create' || action === 'update') {
      db.prepare(`
        INSERT INTO coo_rates (id,code,country,addl_duty,usa_mult,canada_mult)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(code) DO UPDATE SET
          country=excluded.country, addl_duty=excluded.addl_duty,
          usa_mult=excluded.usa_mult, canada_mult=excluded.canada_mult
      `).run(d.id || d.code, d.code, d.country, d.addlDuty ?? 0, d.usaMult ?? 0, d.canadaMult ?? 0);
    } else if (action === 'delete') {
      db.prepare('DELETE FROM coo_rates WHERE code=? OR id=?').run(d.code, d.code);
    }

  } else if (type === 'internal-program') {
    if (action === 'create' || action === 'update') {
      const id = d.id || uid();
      db.prepare(`
        INSERT INTO internal_programs (id,name,brand,tier,gender,target_margin)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, brand=excluded.brand, tier=excluded.tier,
          gender=excluded.gender, target_margin=excluded.target_margin
      `).run(id, d.name, d.brand || null, d.tier || null, d.gender || null, d.targetMargin ?? null);
    } else if (action === 'delete') {
      db.prepare('DELETE FROM internal_programs WHERE id=?').run(d.id);
    }

  } else if (type === 'pc-user') {
    if (action === 'create') {
      const id = d.id || uid();
      const hash = bcrypt.hashSync(d.password || 'changeme', SALT);
      db.prepare('INSERT OR IGNORE INTO users (id,name,email,password_hash,role,department_id) VALUES (?,?,?,?,?,?)')
        .run(id, d.name, d.email, hash, d.role || 'pc', d.departmentId || null);
    } else if (action === 'update') {
      const setClauses = ['name=?', 'email=?', 'role=?', 'department_id=?'];
      const vals = [d.name, d.email, d.role || 'pc', d.departmentId || null];
      if (d.password) { setClauses.push('password_hash=?'); vals.push(bcrypt.hashSync(d.password, SALT)); }
      vals.push(d.id);
      db.prepare(`UPDATE users SET ${setClauses.join(',')} WHERE id=?`).run(...vals);
    } else if (action === 'delete') {
      db.prepare('DELETE FROM users WHERE id=?').run(d.id);
    }
  }
}

// =============================================================
// STYLE LINKS  (placement preference groups)
// =============================================================

const LINK_COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444',
  '#a855f7','#3b82f6','#ec4899','#14b8a6',
];

function linkFromRow(r) {
  return {
    id: r.id, programId: r.program_id,
    styleIds:  JSON.parse(r.style_ids || '[]'),
    color:     r.color,
    preferredTcId: r.preferred_tc_id,
    createdAt: r.created_at,
  };
}

// GET /api/programs/:id/style-links
router.get('/programs/:id/style-links', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM style_links WHERE program_id = ? ORDER BY created_at').all(req.params.id).map(linkFromRow));
});

// POST /api/style-links
router.post('/style-links', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.programId) return res.status(400).json({ error: 'programId required' });
  // Auto-assign color based on how many groups this program already has
  const existingCount = db.prepare('SELECT COUNT(*) AS n FROM style_links WHERE program_id = ?').get(b.programId).n;
  const color = b.color || LINK_COLORS[existingCount % LINK_COLORS.length];
  const id = 'sl_' + uid();
  db.prepare(`
    INSERT INTO style_links (id, program_id, style_ids, color, created_at)
    VALUES (?,?,?,?,?)
  `).run(id, b.programId, json(b.styleIds || []), color, now());
  res.status(201).json(linkFromRow(db.prepare('SELECT * FROM style_links WHERE id = ?').get(id)));
});

// PATCH /api/style-links/:id
router.patch('/style-links/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM style_links WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  if (b.styleIds !== undefined) db.prepare('UPDATE style_links SET style_ids = ? WHERE id = ?').run(json(b.styleIds), req.params.id);
  if (b.color    !== undefined) db.prepare('UPDATE style_links SET color = ? WHERE id = ?').run(b.color, req.params.id);
  res.json(linkFromRow(db.prepare('SELECT * FROM style_links WHERE id = ?').get(req.params.id)));
});

// DELETE /api/style-links/:id
router.delete('/style-links/:id', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  db.prepare('DELETE FROM style_links WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// =============================================================
// CELL FLAGS
// =============================================================

function flagFromRow(r) {
  return {
    id: r.id, subId: r.sub_id, field: r.field, color: r.color, note: r.note,
    flaggedBy: r.flagged_by, flaggedByName: r.flagged_by_name, flaggedAt: r.flagged_at,
  };
}

// GET /api/submissions/:id/flags
router.get('/submissions/:id/flags', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cell_flags WHERE sub_id = ?').all(req.params.id).map(flagFromRow));
});

// PUT /api/cell-flags  — set or update
// Body: { subId, field, color, note }
router.put('/cell-flags', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.subId || !b.field) return res.status(400).json({ error: 'subId and field required' });

  db.prepare(`
    INSERT INTO cell_flags (id, sub_id, field, color, note, flagged_by, flagged_by_name, flagged_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(sub_id, field) DO UPDATE SET
      color=excluded.color, note=excluded.note,
      flagged_by=excluded.flagged_by, flagged_by_name=excluded.flagged_by_name,
      flagged_at=excluded.flagged_at
  `).run(uid(), b.subId, b.field, b.color || null, b.note || null,
         req.user.id, req.user.name || req.user.email, now());

  const row = db.prepare('SELECT * FROM cell_flags WHERE sub_id = ? AND field = ?').get(b.subId, b.field);
  res.json(flagFromRow(row));
});

// DELETE /api/cell-flags/:subId/:field  — clear a flag
router.delete('/cell-flags/:subId/:field', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  db.prepare('DELETE FROM cell_flags WHERE sub_id = ? AND field = ?').run(req.params.subId, req.params.field);
  res.json({ ok: true });
});

// =============================================================
// REVISIONS  (append-only price + flag event log)
// =============================================================

function revFromRow(r) {
  return {
    id: r.id, subId: r.sub_id, field: r.field,
    oldValue: r.old_value, newValue: r.new_value,
    submittedBy: r.submitted_by, submittedByName: r.submitted_by_name,
    submittedAt: r.submitted_at,
    type: r.type, flagColor: r.flag_color, flagNote: r.flag_note,
  };
}

// GET /api/submissions/:id/revisions?field=fob  (optional field filter)
router.get('/submissions/:id/revisions', requireAuth, (req, res) => {
  const field = req.query.field;
  const rows = field
    ? db.prepare('SELECT * FROM revisions WHERE sub_id = ? AND field = ? ORDER BY submitted_at').all(req.params.id, field)
    : db.prepare('SELECT * FROM revisions WHERE sub_id = ? ORDER BY submitted_at').all(req.params.id);
  res.json(rows.map(revFromRow));
});

// POST /api/revisions  — log a flag event (flag / flag-clear)
// Price revisions are written automatically in the submissions upsert route.
router.post('/revisions', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.subId || !b.field) return res.status(400).json({ error: 'subId and field required' });
  const id = uid();
  db.prepare(`
    INSERT INTO revisions (id, sub_id, field, old_value, new_value, submitted_by, submitted_by_name, submitted_at, type, flag_color, flag_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.subId, b.field,
         b.oldValue ?? null, b.newValue ?? null,
         b.submittedBy || req.user.id,
         b.submittedByName || req.user.name,
         b.submittedAt || now(),
         b.type || null, b.flagColor || null, b.flagNote || null);
  res.status(201).json(revFromRow(db.prepare('SELECT * FROM revisions WHERE id = ?').get(id)));
});

// =============================================================
// COST HISTORY
// =============================================================

function chFromRow(r) {
  return {
    id: r.id, styleId: r.style_id, programId: r.program_id,
    type: r.type, category: r.category, note: r.note,
    requestedBy: r.requested_by, requestedByName: r.requested_by_name,
    releasedBy: r.released_by, releasedByName: r.released_by_name,
    timestamp: r.timestamp,
  };
}

// GET /api/programs/:id/cost-history
router.get('/programs/:id/cost-history', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cost_history WHERE program_id = ? ORDER BY timestamp DESC').all(req.params.id).map(chFromRow));
});

// GET /api/styles/:id/cost-history
router.get('/styles/:id/cost-history', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cost_history WHERE style_id = ? ORDER BY timestamp DESC').all(req.params.id).map(chFromRow));
});

// POST /api/cost-history
router.post('/cost-history', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const b = req.body;
  if (!b.styleId) return res.status(400).json({ error: 'styleId required' });
  const id = uid();
  db.prepare(`
    INSERT INTO cost_history (id, style_id, program_id, type, category, note,
                              requested_by, requested_by_name, released_by, released_by_name, timestamp)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.styleId, b.programId || null,
         b.type || 'note', b.category || null, b.note || null,
         b.requestedBy || null, b.requestedByName || null,
         b.releasedBy  || null, b.releasedByName  || null,
         b.timestamp   || now());
  res.status(201).json(chFromRow(db.prepare('SELECT * FROM cost_history WHERE id = ?').get(id)));
});

// =============================================================
// TECH PACK HISTORY
// =============================================================

function tphFromRow(r) {
  return {
    id:               r.id,
    styleId:          r.style_id,
    status:           r.status,
    previousStatus:   r.previous_status,
    changedBy:        r.changed_by,
    changedAt:        r.changed_at,
    note:             r.note,
    recostRequestId:  r.recost_request_id,
  };
}

// GET /api/styles/:id/tech-pack-history
router.get('/styles/:id/tech-pack-history', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM tech_pack_history WHERE style_id = ? ORDER BY changed_at')
      .all(req.params.id).map(tphFromRow)
  );
});

// POST /api/styles/:id/tech-pack-history
router.post('/styles/:id/tech-pack-history', requireAuth, (req, res) => {
  const b  = req.body;
  const id = uid();
  db.prepare(`
    INSERT INTO tech_pack_history
      (id, style_id, status, previous_status, changed_by, changed_at, note, recost_request_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, req.params.id,
         b.status         || null,
         b.previousStatus || null,
         b.changedBy      || req.user.id,
         b.changedAt      || now(),
         b.note           || null,
         b.recostRequestId || null);
  res.status(201).json(tphFromRow(db.prepare('SELECT * FROM tech_pack_history WHERE id = ?').get(id)));
});

module.exports = router;
