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
  // Lazily stamp each style with a stable id and default batchLabel so
  // batchReleases.styleIds[] can reference them precisely.  If any styles
  // were missing ids we persist the updated list immediately (one write per
  // GET at most, then it's a no-op forever).
  let stylesList = JSON.parse(r.styles_list || '[]');
  let needsWrite = false;
  stylesList = stylesList.map(s => {
    if (!s.id || !s.batchLabel) {
      needsWrite = true;
      return { id: s.id || uid(), batchLabel: s.batchLabel || 'Batch 1', ...s };
    }
    return s;
  });
  if (needsWrite) {
    db.prepare('UPDATE design_handoffs SET styles_list = ? WHERE id = ?')
      .run(JSON.stringify(stylesList), r.id);
  }

  return {
    id: r.id, season: r.season, year: r.year, brand: r.brand, tier: r.tier, gender: r.gender,
    stylesList,
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
    batchReleases:        JSON.parse(r.batch_releases || '[]'),
    status:               r.status || 'active',
    cancelledAt:          r.cancelled_at,
    cancelledBy:          r.cancelled_by,
    cancelledByName:      r.cancelled_by_name,
    previousProgramId:    r.previous_program_id,
    previousProgramName:  r.previous_program_name,
    createdAt:            r.created_at,
  };
}

const HANDOFF_FIELDS = {
  season: 'season', year: 'year', brand: 'brand', tier: 'tier', gender: 'gender',
  supplierRequestNumber: 'supplier_request_number',
  linkedProgramId:      'linked_program_id',
  linkedRequestId:      'linked_request_id',
  firstCRD:             'first_crd',
  startDate:            'start_date',
  endDate:              'end_date',
  vendorsAssignedAt:    'vendors_assigned_at',
  submitted:            'submitted',
  submittedAt:          'submitted_at',
  submittedForCosting:  'submitted_for_costing',
  fabricsUploadedAt:    'fabrics_uploaded_at',
  trimsUploadedAt:      'trims_uploaded_at',
  stylesUploaded:       'styles_uploaded',
  fabricsUploaded:      'fabrics_uploaded',
  trimsUploaded:        'trims_uploaded',
  status:               'status',
  cancelledAt:          'cancelled_at',
  previousProgramId:    'previous_program_id',
  previousProgramName:  'previous_program_name',
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
  const jsonFields = { stylesList: 'styles_list', fabricsList: 'fabrics_list', trimsList: 'trims_list', assignedTCIds: 'assigned_tc_ids', batchReleases: 'batch_releases' };
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

// POST /api/design-handoffs/:id/cancel  — direct cancel (only for handoffs with no linked program)
router.post('/design-handoffs/:id/cancel', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.linked_program_id) return res.status(400).json({ error: 'Cancel the program instead — handoff is linked to a program' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE design_handoffs SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ? WHERE id = ?`)
    .run(now, req.user?.id || null, req.user?.name || null, req.params.id);
  res.json(handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id)));
});

// POST /api/design-handoffs/:id/reactivate  — restores to active, clears batch releases + program link
router.post('/design-handoffs/:id/reactivate', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const prevProgramId   = row.linked_program_id   || row.previous_program_id;
  const prevProgramName = row.previous_program_name || null;
  db.prepare(`
    UPDATE design_handoffs
    SET status = 'active', cancelled_at = NULL, linked_program_id = NULL,
        submitted_for_costing = 0, batch_releases = '[]',
        previous_program_id = ?, previous_program_name = ?
    WHERE id = ?
  `).run(prevProgramId || null, prevProgramName || null, req.params.id);
  res.json(handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id)));
});

// POST /api/design-handoffs/:id/merge-upload
// Smart merge: ADD new items, UPDATE existing unreleased, KEEP missing, BLOCK released.
// Body: { styles: [...], fabrics: [...], trims: [...], replaceAll: bool }
// Returns: { handoff: {...}, diff: { styles, fabrics, trims } }
router.post('/design-handoffs/:id/merge-upload', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Handoff not found' });

  const { styles: uploadStyles = [], fabrics: uploadFabrics = [], trims: uploadTrims = [], replaceAll = false } = req.body;

  const h          = handoffFromRow(row);
  const releasedSet = new Set((h.batchReleases || []).flatMap(b => b.styleIds || []));

  const diff = {
    styles:  { added: 0, updated: 0, kept: 0, blocked: 0 },
    fabrics: { added: 0, updated: 0, kept: 0, conflicts: [] },
    trims:   { added: 0, updated: 0, kept: 0 },
  };

  // ── Merge styles ──────────────────────────────────────────────
  // Dedup upload rows by (styleId → styleNumber), take last occurrence.
  const uploadById  = {};
  const uploadByNum = {};
  for (const r of uploadStyles) {
    const id  = (r.styleId   || '').trim();
    const num = (r.styleNumber || '').trim().toUpperCase();
    if (id)  uploadById[id]   = r;
    if (num) uploadByNum[num] = r;
  }

  let newStylesList;
  if (replaceAll) {
    // Keep released styles as-is; replace all unreleased with upload.
    const releasedStyles = h.stylesList.filter(s => releasedSet.has(s.id));
    const uploadNums  = new Set(Object.keys(uploadByNum));
    const uploadIds   = new Set(Object.keys(uploadById));
    // Block any upload row that matches a released style
    const blockedNums = new Set();
    releasedStyles.forEach(s => {
      if (uploadIds.has(s.id) || uploadNums.has((s.styleNumber || '').toUpperCase())) {
        blockedNums.add((s.styleNumber || '').toUpperCase());
        diff.styles.blocked++;
      } else {
        diff.styles.kept++;
      }
    });
    const newFromUpload = uploadStyles
      .filter(r => !blockedNums.has((r.styleNumber || '').toUpperCase()))
      .map(r => ({
        id:          uid(),
        styleNumber: r.styleNumber || '',
        styleName:   r.styleName   || '',
        fabric:      r.fabric      || '',
        fabrication: r.fabric      || '',
        notes:       r.notes       || '',
        batchLabel:  r.batchLabel  || 'Batch 1',
      }));
    diff.styles.added = newFromUpload.length;
    newStylesList = [...releasedStyles, ...newFromUpload];
  } else {
    // Smart merge
    const existingById  = {};
    const existingByNum = {};
    h.stylesList.forEach(s => {
      existingById[s.id] = s;
      existingByNum[(s.styleNumber || '').toUpperCase()] = s;
    });

    const seenExistingIds = new Set();
    newStylesList = [...h.stylesList]; // start with existing; we'll mutate in-place by index

    for (const r of uploadStyles) {
      const id  = (r.styleId   || '').trim();
      const num = (r.styleNumber || '').trim().toUpperCase();
      const existing = existingById[id] || existingByNum[num];

      if (!existing) {
        // ADD new style
        diff.styles.added++;
        newStylesList.push({
          id:          uid(),
          styleNumber: r.styleNumber || '',
          styleName:   r.styleName   || '',
          fabric:      r.fabric      || '',
          fabrication: r.fabric      || '',
          notes:       r.notes       || '',
          batchLabel:  r.batchLabel  || 'Batch 1',
        });
      } else if (releasedSet.has(existing.id)) {
        // BLOCK — can't modify released styles
        diff.styles.blocked++;
        seenExistingIds.add(existing.id);
      } else {
        // UPDATE unreleased
        diff.styles.updated++;
        seenExistingIds.add(existing.id);
        const idx = newStylesList.findIndex(s => s.id === existing.id);
        if (idx >= 0) {
          newStylesList[idx] = Object.assign({}, existing, {
            styleName:   r.styleName  || existing.styleName,
            fabric:      r.fabric     || existing.fabric,
            fabrication: r.fabric     || existing.fabrication,
            notes:       r.notes !== undefined ? r.notes : existing.notes,
            batchLabel:  r.batchLabel || existing.batchLabel,
          });
        }
      }
    }

    // KEEP existing styles not touched by upload
    h.stylesList.forEach(s => {
      if (!seenExistingIds.has(s.id)) {
        const inUpload = uploadById[s.id] || uploadByNum[(s.styleNumber || '').toUpperCase()];
        if (!inUpload) diff.styles.kept++;
      }
    });
  }

  // ── Merge fabrics ─────────────────────────────────────────────
  let newFabricsList;
  if (!uploadFabrics.length) {
    newFabricsList = h.fabricsList; // nothing uploaded — preserve existing
  } else if (replaceAll) {
    newFabricsList = uploadFabrics.map(f => ({
      fabricCode: f.fabricCode || '', fabricName: f.fabricName || '',
      supplier: f.supplier || '', color: f.color || '',
      content: f.content || '', weight: f.weight || '', notes: f.notes || '',
    }));
    diff.fabrics.added = newFabricsList.length;
  } else {
    const existingByCode = {};
    h.fabricsList.forEach(f => { if (f.fabricCode) existingByCode[f.fabricCode.toUpperCase()] = f; });
    const uploadCodes = new Set(uploadFabrics.map(f => (f.fabricCode || '').toUpperCase()));
    newFabricsList = [...h.fabricsList];

    uploadFabrics.forEach(f => {
      const code = (f.fabricCode || '').toUpperCase();
      const existing = existingByCode[code];
      const normalized = {
        fabricCode: f.fabricCode || '', fabricName: f.fabricName || '',
        supplier: f.supplier || '', color: f.color || '',
        content: f.content || '', weight: f.weight || '', notes: f.notes || '',
      };
      if (!existing) {
        diff.fabrics.added++;
        newFabricsList.push(normalized);
      } else {
        if (existing.fabricName && f.fabricName && existing.fabricName.toLowerCase() !== f.fabricName.toLowerCase()) {
          diff.fabrics.conflicts.push({ code: f.fabricCode, from: existing.fabricName, to: f.fabricName });
        }
        diff.fabrics.updated++;
        const idx = newFabricsList.findIndex(x => (x.fabricCode || '').toUpperCase() === code);
        if (idx >= 0) newFabricsList[idx] = normalized;
      }
    });
    h.fabricsList.forEach(f => { if (!uploadCodes.has((f.fabricCode || '').toUpperCase())) diff.fabrics.kept++; });
  }

  // ── Merge trims (same pattern) ────────────────────────────────
  let newTrimsList;
  if (!uploadTrims.length) {
    newTrimsList = h.trimsList;
  } else if (replaceAll) {
    newTrimsList = uploadTrims.map(t => ({
      refNumber: t.refNumber || '', supplier: t.supplier || '', description: t.description || '',
      color: t.color || '', unit: t.unit || '', notes: t.notes || '',
    }));
    diff.trims.added = newTrimsList.length;
  } else {
    const existingByRef = {};
    h.trimsList.forEach(t => { if (t.refNumber) existingByRef[t.refNumber.toUpperCase()] = t; });
    const uploadRefs = new Set(uploadTrims.map(t => (t.refNumber || '').toUpperCase()));
    newTrimsList = [...h.trimsList];

    uploadTrims.forEach(t => {
      const ref = (t.refNumber || '').toUpperCase();
      const existing = existingByRef[ref];
      const normalized = {
        refNumber: t.refNumber || '', supplier: t.supplier || '', description: t.description || '',
        color: t.color || '', unit: t.unit || '', notes: t.notes || '',
      };
      if (!existing) {
        diff.trims.added++;
        newTrimsList.push(normalized);
      } else {
        diff.trims.updated++;
        const idx = newTrimsList.findIndex(x => (x.refNumber || '').toUpperCase() === ref);
        if (idx >= 0) newTrimsList[idx] = normalized;
      }
    });
    h.trimsList.forEach(t => { if (!uploadRefs.has((t.refNumber || '').toUpperCase())) diff.trims.kept++; });
  }

  // ── Persist ───────────────────────────────────────────────────
  db.prepare(`
    UPDATE design_handoffs
    SET styles_list    = ?,
        fabrics_list   = ?,
        trims_list     = ?,
        styles_uploaded  = 1,
        fabrics_uploaded = ?,
        trims_uploaded   = ?
    WHERE id = ?
  `).run(
    JSON.stringify(newStylesList),
    JSON.stringify(newFabricsList),
    JSON.stringify(newTrimsList),
    newFabricsList.length > 0 ? 1 : 0,
    newTrimsList.length   > 0 ? 1 : 0,
    req.params.id
  );

  // Upsert updated fabrics into the fabric library
  if (newFabricsList.length) _upsertFabricLibrary(newFabricsList, req.params.id);

  const updated = handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id));
  res.json({ handoff: updated, diff });
});

// POST /api/design-handoffs/:id/release-batch
// Body: { styleIds: string[], batchLabel: string }
//
// Releases the selected styles from the handoff to the linked program,
// creating the program first if none exists.  Also creates a batch-review
// Sales Request so Sales can confirm quantities for the new styles.
router.post('/design-handoffs/:id/release-batch', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const row = db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Handoff not found' });

  const { styleIds, batchLabel } = req.body;
  if (!Array.isArray(styleIds) || !styleIds.length)
    return res.status(400).json({ error: 'styleIds must be a non-empty array' });
  if (!batchLabel || !batchLabel.toString().trim())
    return res.status(400).json({ error: 'batchLabel is required' });

  const label = batchLabel.toString().trim();
  const stylesList   = JSON.parse(row.styles_list   || '[]');
  const batchReleases = JSON.parse(row.batch_releases || '[]');

  // Guard: batch label must not already be released
  if (batchReleases.find(b => b.batchLabel === label))
    return res.status(400).json({ error: `Batch "${label}" has already been released` });

  // Resolve the requested style objects
  const styleMap = {};
  for (const s of stylesList) styleMap[s.id] = s;
  const toRelease = styleIds.map(sid => styleMap[sid]).filter(Boolean);
  if (toRelease.length !== styleIds.length)
    return res.status(400).json({ error: 'One or more styleIds not found in this handoff' });

  db.transaction(() => {
    // 1. Create the program if not yet linked
    let progId = row.linked_program_id;
    if (!progId) {
      progId = uid();
      db.prepare(`
        INSERT INTO programs (id, name, brand, retailer, gender, season, year, status, market, version, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?)
      `).run(
        progId,
        [row.season, row.year, row.brand].filter(Boolean).join(' '),
        row.brand   || null,
        row.tier    || null,
        row.gender  || null,
        row.season  || null,
        row.year    || null,
        'Costing',
        'USA',
        now()
      );
      db.prepare('UPDATE design_handoffs SET linked_program_id = ? WHERE id = ?').run(progId, row.id);
    }

    // 2. Insert style rows into the program
    const insertStyle = db.prepare(`
      INSERT INTO styles
        (id, program_id, style_number, style_name, fabrication,
         status, proj_qty, released_batch, source_handoff_id, created_at)
      VALUES (?,?,?,?,?,'open',0,?,?,?)
    `);
    for (const s of toRelease) {
      insertStyle.run(
        uid(), progId,
        s.styleNumber || null,
        s.styleName   || null,
        s.fabrication || s.fabric || null,
        label,
        row.id,
        now()
      );
    }

    // 3. Append to batch_releases on the handoff
    batchReleases.push({ batchLabel: label, releasedAt: now(), styleIds });
    db.prepare('UPDATE design_handoffs SET batch_releases = ? WHERE id = ?')
      .run(JSON.stringify(batchReleases), row.id);

    // 4. Create a batch-review Sales Request so Sales can confirm quantities
    const srId = uid();
    const srStyles = toRelease.map(s => ({
      styleNumber:  s.styleNumber  || '',
      styleName:    s.styleName    || '',
      fabrication:  s.fabrication  || s.fabric || '',
      projQty:      0,
      projSell:     0,
      batchLabel:   label,
    }));
    db.prepare(`
      INSERT INTO sales_requests
        (id, status, season, year, brand, gender, retailer,
         styles, cancelled_styles, source_handoff_id, linked_program_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      srId, 'batch-review',
      row.season  || null,
      row.year    || null,
      row.brand   || null,
      row.gender  || null,
      row.tier    || null,
      JSON.stringify(srStyles),
      '[]',
      row.id,
      progId,
      now()
    );
  })();

  res.json(handoffFromRow(db.prepare('SELECT * FROM design_handoffs WHERE id = ?').get(req.params.id)));
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
    vendorsAssignedAt:    r.vendors_assigned_at,
    cancelledAt:          r.cancelled_at,
    cancelledBy:          r.cancelled_by,
    cancelledByName:      r.cancelled_by_name,
    previousProgramId:    r.previous_program_id,
    previousProgramName:  r.previous_program_name,
    createdAt:            r.created_at,
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
  firstCRD:             'first_crd',
  startDate:            'start_date',
  endDate:              'end_date',
  vendorsAssignedAt:    'vendors_assigned_at',
  cancelledAt:          'cancelled_at',
  previousProgramId:    'previous_program_id',
  previousProgramName:  'previous_program_name',
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

// POST /api/sales-requests/:id/cancel  — direct cancel (only for SRs with no linked program)
router.post('/sales-requests/:id/cancel', requireAuth, requireRole('admin', 'pc', 'planning', 'sales'), (req, res) => {
  const row = db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.linked_program_id) return res.status(400).json({ error: 'Cancel the program instead — SR is linked to a program' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE sales_requests SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ? WHERE id = ?`)
    .run(now, req.user?.id || null, req.user?.name || null, req.params.id);
  res.json(srFromRow(db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id)));
});

// POST /api/sales-requests/:id/reactivate  — restores to submitted, clears cancellation state
router.post('/sales-requests/:id/reactivate', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const row = db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const prevProgramId   = row.linked_program_id   || row.previous_program_id;
  const prevProgramName = row.previous_program_name || null;
  db.prepare(`
    UPDATE sales_requests
    SET status = 'submitted', cancelled_at = NULL, linked_program_id = NULL,
        previous_program_id = ?, previous_program_name = ?
    WHERE id = ?
  `).run(prevProgramId || null, prevProgramName || null, row.id);
  res.json(srFromRow(db.prepare('SELECT * FROM sales_requests WHERE id = ?').get(row.id)));
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
    status: r.status || 'confirmed',
    confirmedAt: r.confirmed_at || null,
    confirmedBy: r.confirmed_by || null,
    confirmedByName: r.confirmed_by_name || null,
  };
}

// GET /api/design-changes  — all, optionally filtered by ?status=pending|confirmed
router.get('/design-changes', requireAuth, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM design_changes WHERE status = ? ORDER BY changed_at DESC').all(status)
    : db.prepare('SELECT * FROM design_changes ORDER BY changed_at DESC').all();
  res.json(rows.map(dcFromRow));
});

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
  const status = b.status || 'pending';
  db.prepare(`
    INSERT INTO design_changes
      (id, style_id, program_id, style_number, description, field,
       previous_value, new_value, changed_by, changed_by_name, changed_at, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, b.styleId, b.programId || null, b.styleNumber || null,
         b.description || null, b.field || null,
         b.previousValue ?? null, b.newValue ?? null,
         b.changedBy || null, b.changedByName || null,
         b.changedAt || now(), status);
  res.status(201).json(dcFromRow(db.prepare('SELECT * FROM design_changes WHERE id = ?').get(id)));
});

// PATCH /api/design-changes/:id/confirm
router.patch('/design-changes/:id/confirm', requireAuth, requireRole('admin', 'pc', 'design'), (req, res) => {
  const user = req.user;
  db.prepare(`
    UPDATE design_changes
    SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, confirmed_by_name = ?
    WHERE id = ?
  `).run(now(), user.id, user.name || user.email, req.params.id);
  const row = db.prepare('SELECT * FROM design_changes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(dcFromRow(row));
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

// =============================================================
// FACTORIES (TC ↔ Factory ↔ Exporter ↔ Pay-to)
// =============================================================
// Roles:
//   vendor            — see/edit/submit their own; can resubmit a
//                       rejected row; editing an active row flips
//                       it back to 'pending'.
//   admin, pc         — full review (approve/reject, activate/
//                       deactivate), set HighLife terms.
//   planning/design/
//   tech_design/
//   prod_dev          — read-only directory of active factories.

function factoryFromRow(r) {
  const b = v => v === 1 || v === '1' || v === true;
  return {
    id:                        r.id,
    tcId:                      r.tc_id,
    // Factory
    factoryName:               r.factory_name,
    factorySapName:            r.factory_sap_name,
    tcSapName:                 r.tc_sap_name,
    factoryAddress:            r.factory_address,   // street
    factoryCity:               r.factory_city,
    factoryState:              r.factory_state,
    factoryCountry:            r.factory_country,
    factoryZip:                r.factory_zip,
    factoryRelatedToTc:        b(r.factory_related_to_tc),
    factoryTerms:              r.factory_terms,
    factoryTermsHl:            r.factory_terms_hl,
    // Exporter
    hasExporter:               b(r.has_exporter),
    exporterName:              r.exporter_name,
    exporterSapName:           r.exporter_sap_name,
    exporterAddress:           r.exporter_address,
    exporterCity:              r.exporter_city,
    exporterState:             r.exporter_state,
    exporterCountry:           r.exporter_country,
    exporterZip:               r.exporter_zip,
    exporterRelatedToTc:       b(r.exporter_related_to_tc),
    exporterRelatedToFactory:  b(r.exporter_related_to_factory),
    exporterTerms:             r.exporter_terms,
    exporterTermsHl:           r.exporter_terms_hl,
    // Pay-to
    hasPayto:                  b(r.has_payto),
    paytoName:                 r.payto_name,
    paytoSapName:              r.payto_sap_name,
    paytoAddress:              r.payto_address,
    paytoCity:                 r.payto_city,
    paytoState:                r.payto_state,
    paytoCountry:              r.payto_country,
    paytoZip:                  r.payto_zip,
    paytoRelatedToTc:          b(r.payto_related_to_tc),
    paytoRelatedToExporter:    b(r.payto_related_to_exporter),
    paytoRelatedToFactory:     b(r.payto_related_to_factory),
    paytoTerms:                r.payto_terms,
    paytoTermsHl:              r.payto_terms_hl,
    // Logistics
    shippingResponsible:       r.shipping_responsible,
    portOfShipping:            r.port_of_shipping,
    // First-Sale
    firstSaleApproved:         b(r.first_sale_approved),
    firstSaleApprovedBy:       r.first_sale_approved_by,
    firstSaleApprovedAt:       r.first_sale_approved_at,
    // Lifecycle
    status:                    r.status,
    submittedBy:               r.submitted_by,
    submittedAt:               r.submitted_at,
    reviewedBy:                r.reviewed_by,
    reviewedAt:                r.reviewed_at,
    rejectionReason:           r.rejection_reason,
    deactivatedBy:             r.deactivated_by,
    deactivatedAt:             r.deactivated_at,
    notes:                     r.notes,
    createdAt:                 r.created_at,
    updatedAt:                 r.updated_at,
  };
}

// Fields that a vendor is allowed to submit/edit.
const FACTORY_VENDOR_FIELDS = {
  factoryName:                'factory_name',
  factorySapName:             'factory_sap_name',
  tcSapName:                  'tc_sap_name',
  factoryAddress:             'factory_address',
  factoryCity:                'factory_city',
  factoryState:               'factory_state',
  factoryCountry:             'factory_country',
  factoryZip:                 'factory_zip',
  factoryRelatedToTc:         'factory_related_to_tc',
  factoryTerms:               'factory_terms',
  hasExporter:                'has_exporter',
  exporterName:               'exporter_name',
  exporterSapName:            'exporter_sap_name',
  exporterAddress:            'exporter_address',
  exporterCity:               'exporter_city',
  exporterState:              'exporter_state',
  exporterCountry:            'exporter_country',
  exporterZip:                'exporter_zip',
  exporterRelatedToTc:        'exporter_related_to_tc',
  exporterRelatedToFactory:   'exporter_related_to_factory',
  exporterTerms:              'exporter_terms',
  hasPayto:                   'has_payto',
  paytoName:                  'payto_name',
  paytoSapName:               'payto_sap_name',
  paytoAddress:               'payto_address',
  paytoCity:                  'payto_city',
  paytoState:                 'payto_state',
  paytoCountry:               'payto_country',
  paytoZip:                   'payto_zip',
  paytoRelatedToTc:           'payto_related_to_tc',
  paytoRelatedToExporter:     'payto_related_to_exporter',
  paytoRelatedToFactory:      'payto_related_to_factory',
  paytoTerms:                 'payto_terms',
  shippingResponsible:        'shipping_responsible',
  portOfShipping:             'port_of_shipping',
  notes:                      'notes',
};

// Admin/PC also set HighLife terms + first-sale approval.
const FACTORY_ADMIN_FIELDS = {
  ...FACTORY_VENDOR_FIELDS,
  factoryTermsHl:     'factory_terms_hl',
  exporterTermsHl:    'exporter_terms_hl',
  paytoTermsHl:       'payto_terms_hl',
  firstSaleApproved:  'first_sale_approved',
};

// Required fields when the exporter / pay-to section is enabled.
const EXPORTER_REQUIRED = ['exporterName', 'exporterAddress', 'exporterCity', 'exporterCountry'];
const PAYTO_REQUIRED    = ['paytoName',    'paytoAddress',    'paytoCity',    'paytoCountry'];

function validateSections(body) {
  if (body.hasExporter) {
    for (const k of EXPORTER_REQUIRED) {
      if (!body[k] || !String(body[k]).trim()) return `${k} is required when Export Company is included`;
    }
  }
  if (body.hasPayto) {
    for (const k of PAYTO_REQUIRED) {
      if (!body[k] || !String(body[k]).trim()) return `${k} is required when Pay-to Company is included`;
    }
  }
  return null;
}

const FACTORY_INTERNAL_ROLES_READ = ['admin', 'pc', 'planning', 'design', 'tech_design', 'prod_dev'];
const FACTORY_ADMIN_ROLES         = ['admin', 'pc'];

// GET /api/factories
//   Vendor: their own (all statuses).
//   admin/pc: everything.
//   Other internal roles: active only (read-only directory).
router.get('/factories', requireAuth, (req, res) => {
  const role = req.user.role;
  let rows;
  if (role === 'vendor') {
    rows = db.prepare('SELECT * FROM factories WHERE tc_id = ? ORDER BY created_at DESC').all(req.user.tcId);
  } else if (FACTORY_ADMIN_ROLES.includes(role)) {
    rows = db.prepare('SELECT * FROM factories ORDER BY created_at DESC').all();
  } else if (FACTORY_INTERNAL_ROLES_READ.includes(role)) {
    rows = db.prepare(`SELECT * FROM factories WHERE status = 'active' ORDER BY created_at DESC`).all();
  } else {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(rows.map(factoryFromRow));
});

// GET /api/factories/:id
router.get('/factories/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM factories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const role = req.user.role;
  if (role === 'vendor' && row.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Forbidden' });
  if (!FACTORY_INTERNAL_ROLES_READ.includes(role) && role !== 'vendor') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  if (role !== 'vendor' && !FACTORY_ADMIN_ROLES.includes(role) && row.status !== 'active') {
    return res.status(403).json({ error: 'Not visible in directory' });
  }
  res.json(factoryFromRow(row));
});

// Columns on `factories` that should always be stored as 0/1 integers.
const FACTORY_BOOL_COLS = new Set([
  'factory_related_to_tc',
  'exporter_related_to_tc', 'exporter_related_to_factory',
  'payto_related_to_tc',    'payto_related_to_exporter', 'payto_related_to_factory',
  'has_exporter', 'has_payto', 'first_sale_approved',
]);

// POST /api/factories
// Vendor submits a new factory profile (status = pending).
// Admin/PC can also create on behalf of a TC.
router.post('/factories', requireAuth, (req, res) => {
  const role = req.user.role;
  const isVendor = role === 'vendor';
  if (!isVendor && !FACTORY_ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const b = req.body || {};
  if (!b.factoryName || !b.factoryName.trim()) return res.status(400).json({ error: 'factoryName required' });

  const tcId = isVendor ? req.user.tcId : (b.tcId || null);
  if (!tcId) return res.status(400).json({ error: 'tcId required' });

  // If Exporter or Pay-to section is included, its required fields must be filled.
  const vErr = validateSections(b);
  if (vErr) return res.status(400).json({ error: vErr });

  const id = uid();
  const nowIso = now();
  const fields = {};
  const FIELDS = isVendor ? FACTORY_VENDOR_FIELDS : FACTORY_ADMIN_FIELDS;
  for (const [camel, col] of Object.entries(FIELDS)) {
    const v = b[camel];
    if (v === undefined) continue;
    if (FACTORY_BOOL_COLS.has(col)) {
      fields[col] = v ? 1 : 0;
    } else {
      fields[col] = v === '' ? null : v;
    }
  }

  const cols = ['id','tc_id','status','submitted_by','submitted_at','created_at', ...Object.keys(fields)];
  const vals = [id, tcId, 'pending', req.user.name || req.user.email || req.user.id, nowIso, nowIso, ...Object.values(fields)];
  const sql = `INSERT INTO factories (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  db.prepare(sql).run(...vals);

  res.status(201).json(factoryFromRow(db.prepare('SELECT * FROM factories WHERE id = ?').get(id)));
});

// PATCH /api/factories/:id
// Role-specific behavior:
//   vendor: edit fields on their own row. If the row is 'rejected'
//           or 'active' (edit flips back to 'pending') or already
//           'pending' (just an edit), status is re-set to 'pending'
//           and reviewer metadata is cleared.
//   admin/pc: edit any field; may set status (active/inactive/
//             rejected) which stamps reviewed_* / deactivated_*
//             metadata. Can also set HighLife term fields.
router.patch('/factories/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM factories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const role = req.user.role;
  const isVendor = role === 'vendor';
  if (isVendor && row.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Forbidden' });
  if (!isVendor && !FACTORY_ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const b = req.body || {};
  const FIELDS = isVendor ? FACTORY_VENDOR_FIELDS : FACTORY_ADMIN_FIELDS;

  // If the caller is touching the has_exporter / has_payto flags (or
  // is a vendor, whose patch behaves like a full resubmit), re-check
  // that the required fields for enabled sections are present.
  // Merge incoming body with the stored row so a vendor editing only
  // the factory section still passes validation if the existing row
  // has has_exporter already set.
  const merged = { ...factoryFromRow(row), ...b };
  const vErr = validateSections(merged);
  if (vErr) return res.status(400).json({ error: vErr });

  const sets = [];
  const vals = [];
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (b[camel] === undefined) continue;
    const v = b[camel];
    if (FACTORY_BOOL_COLS.has(col)) {
      sets.push(`${col} = ?`); vals.push(v ? 1 : 0);
    } else {
      sets.push(`${col} = ?`); vals.push(v === '' ? null : v);
    }
  }

  const nowIso = now();
  const userLabel = req.user.name || req.user.email || req.user.id;

  // First-sale stamping: if admin/PC flips first_sale_approved, record
  // who/when (or clear on revoke).
  if (!isVendor && b.firstSaleApproved !== undefined) {
    const wasOn  = row.first_sale_approved === 1 || row.first_sale_approved === '1';
    const nowOn  = !!b.firstSaleApproved;
    if (wasOn !== nowOn) {
      if (nowOn) {
        sets.push('first_sale_approved_by = ?'); vals.push(userLabel);
        sets.push('first_sale_approved_at = ?'); vals.push(nowIso);
      } else {
        sets.push('first_sale_approved_by = ?'); vals.push(null);
        sets.push('first_sale_approved_at = ?'); vals.push(null);
      }
    }
  }

  if (isVendor) {
    // Any vendor edit pushes the row back to pending for re-review.
    sets.push('status = ?');           vals.push('pending');
    sets.push('submitted_by = ?');     vals.push(userLabel);
    sets.push('submitted_at = ?');     vals.push(nowIso);
    sets.push('reviewed_by = ?');      vals.push(null);
    sets.push('reviewed_at = ?');      vals.push(null);
    sets.push('rejection_reason = ?'); vals.push(null);
  } else if (b.status !== undefined) {
    const valid = ['pending', 'active', 'inactive', 'rejected'];
    if (!valid.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
    sets.push('status = ?'); vals.push(b.status);
    if (b.status === 'active' || b.status === 'rejected') {
      sets.push('reviewed_by = ?'); vals.push(userLabel);
      sets.push('reviewed_at = ?'); vals.push(nowIso);
      if (b.status === 'rejected' && b.rejectionReason !== undefined) {
        sets.push('rejection_reason = ?'); vals.push(b.rejectionReason || null);
      } else if (b.status === 'active') {
        sets.push('rejection_reason = ?'); vals.push(null);
      }
    } else if (b.status === 'inactive') {
      sets.push('deactivated_by = ?'); vals.push(userLabel);
      sets.push('deactivated_at = ?'); vals.push(nowIso);
    } else if (b.status === 'active' && row.status === 'inactive') {
      // Reactivation clears deactivation metadata.
      sets.push('deactivated_by = ?'); vals.push(null);
      sets.push('deactivated_at = ?'); vals.push(null);
    }
  }

  sets.push('updated_at = ?'); vals.push(nowIso);

  vals.push(req.params.id);
  db.prepare(`UPDATE factories SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  res.json(factoryFromRow(db.prepare('SELECT * FROM factories WHERE id = ?').get(req.params.id)));
});

// DELETE /api/factories/:id — admin only
router.delete('/factories/:id', requireAuth, requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM factories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM factories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// =============================================================
// DELIVERY PLANS
// =============================================================
// Per-program negotiation surface: Production ↔ Sales ↔ TC.
// Server masks date fields based on the caller's role so each
// party only sees what they should:
//
//   Field                             Sales  Prod  TC
//   --------------------------------- -----  ----  ---
//   sales_in_whse_date                 ✓      ✓    —
//   factory_cargo_ready_date           —      ✓    ✓
//   production_cargo_ready_vendor      —      ✓    —   (Prod internal buffer)
//   production_cargo_ready_sales       ✓      ✓    —
//
// (admin sees everything; design/tech_design/prod_dev are denied.)
// Waves and per-role comment fields follow the same role slice.

const DP_ROLES_ADMIN = ['admin', 'pc'];
const DP_ROLES_SALES = ['planning'];
const DP_ROLES_ALL   = ['admin', 'pc', 'planning', 'vendor'];

function dpLineFromRow(r) {
  return {
    id:                          r.id,
    planId:                      r.plan_id,
    styleId:                     r.style_id,
    customerId:                  r.customer_id,
    tcId:                        r.tc_id,
    factoryId:                   r.factory_id,
    coo:                         r.coo,
    shippingDestination:         r.shipping_destination,
    qty:                         r.qty,
    salesInWhseDate:             r.sales_in_whse_date,
    factoryCargoReadyDate:       r.factory_cargo_ready_date,
    productionCargoReadyVendor:  r.production_cargo_ready_vendor,
    productionCargoReadySales:   r.production_cargo_ready_sales,
    vendorWaves:                 JSON.parse(r.vendor_waves || '[]'),
    salesWaves:                  JSON.parse(r.sales_waves  || '[]'),
    vendorComments:              r.vendor_comments,
    productionComments:          r.production_comments,
    salesComments:               r.sales_comments,
    status:                      r.status,
    createdAt:                   r.created_at,
    updatedAt:                   r.updated_at,
  };
}

function dpPlanFromRow(r) {
  return {
    id:         r.id,
    programId:  r.program_id,
    createdBy:  r.created_by,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
    history:    JSON.parse(r.history || '[]'),
    notes:      r.notes,
  };
}

// Role-aware mask: return a COPY of a line with fields the caller
// can't see blanked out. Keep null (not undefined) so the UI can
// detect and render a placeholder.
function maskLineForRole(line, role) {
  const l = { ...line };
  const canSeeSales  = DP_ROLES_ADMIN.includes(role) || DP_ROLES_SALES.includes(role);
  const canSeeTc     = DP_ROLES_ADMIN.includes(role) || role === 'vendor';
  const canSeeProd   = DP_ROLES_ADMIN.includes(role);   // internal buffer, Prod only
  if (!canSeeSales) {
    l.salesInWhseDate            = null;
    l.productionCargoReadySales  = null;
    l.salesWaves                 = [];
    l.salesComments              = null;
  }
  if (!canSeeTc) {
    l.factoryCargoReadyDate      = null;
    l.vendorWaves                = [];
    l.vendorComments             = null;
  }
  if (!canSeeProd) {
    l.productionCargoReadyVendor = null;
    l.productionComments         = null;
  }
  return l;
}

// Role gate: which fields can this role edit on an existing line?
function allowedDpLineFields(role) {
  if (DP_ROLES_ADMIN.includes(role)) return {
    // Admin/PC can touch everything.
    qty:'qty', shippingDestination:'shipping_destination', factoryId:'factory_id',
    salesInWhseDate:'sales_in_whse_date',
    factoryCargoReadyDate:'factory_cargo_ready_date',
    productionCargoReadyVendor:'production_cargo_ready_vendor',
    productionCargoReadySales:'production_cargo_ready_sales',
    vendorWaves:'vendor_waves', salesWaves:'sales_waves',
    vendorComments:'vendor_comments', productionComments:'production_comments', salesComments:'sales_comments',
    status:'status',
  };
  if (role === 'planning') return {
    salesInWhseDate:'sales_in_whse_date',
    productionCargoReadySales:'production_cargo_ready_sales',     // Sales can edit their own view of it
    salesWaves:'sales_waves', salesComments:'sales_comments',
  };
  if (role === 'vendor') return {
    factoryCargoReadyDate:'factory_cargo_ready_date',
    vendorWaves:'vendor_waves', vendorComments:'vendor_comments',
  };
  return {};
}

function dpProgramOrThrow(res, programId, role, tcId) {
  const prog = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
  if (!prog) { res.status(404).json({ error: 'Program not found' }); return null; }
  if (role === 'vendor') {
    // Vendor only sees delivery plan for programs they're assigned to.
    const asg = db.prepare('SELECT 1 FROM assignments WHERE program_id = ? AND tc_id = ?').get(programId, tcId);
    if (!asg) { res.status(403).json({ error: 'Not assigned to this program' }); return null; }
  }
  return prog;
}

// GET /api/programs/:id/delivery-plan
// Returns { plan, lines } with role-masked fields. Vendor only sees
// lines where tc_id matches their own TC. Returns 404 if no plan.
router.get('/programs/:id/delivery-plan', requireAuth, (req, res) => {
  const role = req.user.role;
  if (!DP_ROLES_ALL.includes(role)) return res.status(403).json({ error: 'Insufficient permissions' });
  if (!dpProgramOrThrow(res, req.params.id, role, req.user.tcId)) return;

  const plan = db.prepare('SELECT * FROM delivery_plans WHERE program_id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'No delivery plan yet' });

  let lineRows = db.prepare('SELECT * FROM delivery_plan_lines WHERE plan_id = ? ORDER BY created_at').all(plan.id);
  if (role === 'vendor') lineRows = lineRows.filter(r => r.tc_id === req.user.tcId);

  res.json({
    plan: dpPlanFromRow(plan),
    lines: lineRows.map(r => maskLineForRole(dpLineFromRow(r), role)),
  });
});

// POST /api/programs/:id/delivery-plan
// Initialize the plan for a program. Admin/PC only. Auto-prefills one
// line per (placed style × customer-buy), inheriting tc_id / factory_id
// / coo from the placement. If the style has no customer buys, a single
// line covers the whole qty.
router.post('/programs/:id/delivery-plan', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const prog = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });

  const existing = db.prepare('SELECT id FROM delivery_plans WHERE program_id = ?').get(req.params.id);
  if (existing) return res.status(409).json({ error: 'Delivery plan already exists' });

  const planId = uid();
  const userLabel = req.user.name || req.user.email || req.user.id;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO delivery_plans (id, program_id, created_by, created_at, history)
      VALUES (?,?,?,?,?)
    `).run(planId, req.params.id, userLabel, now(), JSON.stringify([
      { at: now(), authorId: req.user.id, authorName: userLabel, role: req.user.role, text: 'Delivery plan created.' },
    ]));

    // Pull placements for this program (we only care about placed styles).
    const placedStyles = db.prepare(`
      SELECT p.style_id, p.tc_id, p.factory_id, p.coo, s.proj_qty
      FROM placements p
      JOIN styles s ON s.id = p.style_id
      WHERE s.program_id = ? AND s.status != 'cancelled'
    `).all(req.params.id);

    const insertLine = db.prepare(`
      INSERT INTO delivery_plan_lines
        (id, plan_id, style_id, customer_id, tc_id, factory_id, coo, qty, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);

    for (const ps of placedStyles) {
      // Customer buys for this style (one row per customer with qty > 0).
      const buys = db.prepare(
        `SELECT customer_id, qty FROM customer_buys WHERE program_id = ? AND style_id = ? AND qty IS NOT NULL AND qty > 0`
      ).all(req.params.id, ps.style_id);

      if (buys.length) {
        for (const b of buys) {
          insertLine.run(uid(), planId, ps.style_id, b.customer_id, ps.tc_id, ps.factory_id, ps.coo, b.qty, now());
        }
      } else {
        // No customer split — one line for the full projected qty.
        insertLine.run(uid(), planId, ps.style_id, null, ps.tc_id, ps.factory_id, ps.coo,
          ps.proj_qty != null ? Math.round(ps.proj_qty) : null, now());
      }
    }
  });
  tx();

  const plan  = db.prepare('SELECT * FROM delivery_plans WHERE id = ?').get(planId);
  const lines = db.prepare('SELECT * FROM delivery_plan_lines WHERE plan_id = ? ORDER BY created_at').all(planId);
  res.status(201).json({
    plan:  dpPlanFromRow(plan),
    lines: lines.map(r => maskLineForRole(dpLineFromRow(r), req.user.role)),
  });
});

// PATCH /api/delivery-plan-lines/:id
// Per-role field allow-list enforced server-side.
router.patch('/delivery-plan-lines/:id', requireAuth, (req, res) => {
  const role = req.user.role;
  const row = db.prepare('SELECT * FROM delivery_plan_lines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (role === 'vendor') {
    if (row.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Forbidden' });
  } else if (!DP_ROLES_ALL.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const FIELDS = allowedDpLineFields(role);
  const sets = [];
  const vals = [];
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (req.body[camel] === undefined) continue;
    let v = req.body[camel];
    if (col.endsWith('_waves')) v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (v === '') v = null;
    sets.push(`${col} = ?`); vals.push(v);
  }
  if (!sets.length) return res.json(maskLineForRole(dpLineFromRow(row), role));

  sets.push('updated_at = ?'); vals.push(now());
  vals.push(req.params.id);
  db.prepare(`UPDATE delivery_plan_lines SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const fresh = db.prepare('SELECT * FROM delivery_plan_lines WHERE id = ?').get(req.params.id);

  // Also bump plan.updated_at for activity tracking.
  db.prepare('UPDATE delivery_plans SET updated_at = ? WHERE id = ?').run(now(), fresh.plan_id);

  res.json(maskLineForRole(dpLineFromRow(fresh), role));
});

// POST /api/delivery-plans/:id/comments
// Append a comment to the shared history. Available to all three
// role families (admin/pc, planning, vendor) — that's the whole
// point of the shared log.
router.post('/delivery-plans/:id/comments', requireAuth, (req, res) => {
  const role = req.user.role;
  if (!DP_ROLES_ALL.includes(role)) return res.status(403).json({ error: 'Insufficient permissions' });
  const plan = db.prepare('SELECT * FROM delivery_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Not found' });

  // Vendor can only comment if they have any line on this plan.
  if (role === 'vendor') {
    const has = db.prepare(
      'SELECT 1 FROM delivery_plan_lines WHERE plan_id = ? AND tc_id = ? LIMIT 1'
    ).get(req.params.id, req.user.tcId);
    if (!has) return res.status(403).json({ error: 'Not assigned to this plan' });
  }

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  const history = JSON.parse(plan.history || '[]');
  history.push({
    at:         now(),
    authorId:   req.user.id,
    authorName: req.user.name || req.user.email,
    role,
    text,
  });
  db.prepare('UPDATE delivery_plans SET history = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(history), now(), req.params.id);
  res.status(201).json({ history });
});

// DELETE /api/programs/:id/delivery-plan — admin only, for resets.
router.delete('/programs/:id/delivery-plan', requireAuth, requireRole('admin'), (req, res) => {
  const plan = db.prepare('SELECT id FROM delivery_plans WHERE program_id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'No plan' });
  db.transaction(() => {
    db.prepare('DELETE FROM delivery_plan_lines WHERE plan_id = ?').run(plan.id);
    db.prepare('DELETE FROM delivery_plans WHERE id = ?').run(plan.id);
  })();
  res.json({ ok: true });
});

// =============================================================
// CAPACITY PLANS
// =============================================================
// TC submits one plan per program describing which factory runs
// which style, at what daily-output cadence, with target cut /
// sew / pack / ex-factory dates. Admin + PC review and approve.
//
// Roles:
//   vendor      — read/edit only lines tied to their TC; submit
//                 the plan for Production review.
//   admin, pc   — read everything + approve / reject / reset.
//
// Other roles denied to keep the surface small (can be added later
// if Sales needs read access).

const CP_ROLES_ADMIN = ['admin', 'pc'];

function cpPlanFromRow(r) {
  return {
    id:               r.id,
    programId:        r.program_id,
    status:           r.status,
    createdBy:        r.created_by,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
    submittedBy:      r.submitted_by,
    submittedAt:      r.submitted_at,
    reviewedBy:       r.reviewed_by,
    reviewedAt:       r.reviewed_at,
    rejectionReason:  r.rejection_reason,
    notes:            r.notes,
  };
}

function cpLineFromRow(r) {
  return {
    id:                         r.id,
    planId:                     r.plan_id,
    styleId:                    r.style_id,
    tcId:                       r.tc_id,
    factoryId:                  r.factory_id,
    totalQty:                   r.total_qty,
    deliveryVslEtd:             r.delivery_vsl_etd,
    factoryTotalLines:          r.factory_total_lines,
    allocatedLines:             r.allocated_lines,
    operatorsPerLine:           r.operators_per_line,
    garmentsPerOperatorDaily:   r.garments_per_operator_daily,
    plannedDailyOutputPerLine:  r.planned_daily_output_per_line,
    plannedTotalDailyOutput:    r.planned_total_daily_output,
    plannedCuttingDate:         r.planned_cutting_date,
    plannedSewingDate:          r.planned_sewing_date,
    plannedPackingDate:         r.planned_packing_date,
    plannedExFactoryDate:       r.planned_ex_factory_date,
    sewingAvailableDays:        r.sewing_available_days,
    totalOutputSewing:          r.total_output_sewing,
    notes:                      r.notes,
    createdAt:                  r.created_at,
    updatedAt:                  r.updated_at,
  };
}

// Fields the TC (or admin) can edit on a capacity line. Dates are
// plain YYYY-MM-DD strings; numbers are integers.
const CP_LINE_FIELDS = {
  totalQty:                  'total_qty',
  deliveryVslEtd:            'delivery_vsl_etd',
  factoryTotalLines:         'factory_total_lines',
  allocatedLines:            'allocated_lines',
  operatorsPerLine:          'operators_per_line',
  garmentsPerOperatorDaily:  'garments_per_operator_daily',
  plannedDailyOutputPerLine: 'planned_daily_output_per_line',
  plannedTotalDailyOutput:   'planned_total_daily_output',
  plannedCuttingDate:        'planned_cutting_date',
  plannedSewingDate:         'planned_sewing_date',
  plannedPackingDate:        'planned_packing_date',
  plannedExFactoryDate:      'planned_ex_factory_date',
  sewingAvailableDays:       'sewing_available_days',
  totalOutputSewing:         'total_output_sewing',
  notes:                     'notes',
  factoryId:                 'factory_id',
};

// GET /api/programs/:id/capacity-plan
router.get('/programs/:id/capacity-plan', requireAuth, (req, res) => {
  const role = req.user.role;
  const prog = db.prepare('SELECT id FROM programs WHERE id = ?').get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });

  if (role === 'vendor') {
    const asg = db.prepare('SELECT 1 FROM assignments WHERE program_id = ? AND tc_id = ?').get(req.params.id, req.user.tcId);
    if (!asg) return res.status(403).json({ error: 'Not assigned to this program' });
  } else if (!CP_ROLES_ADMIN.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const plan = db.prepare('SELECT * FROM capacity_plans WHERE program_id = ?').get(req.params.id);
  if (!plan) return res.status(200).json({ plan: null, lines: [] });

  let lineRows = db.prepare('SELECT * FROM capacity_plan_lines WHERE plan_id = ? ORDER BY created_at').all(plan.id);
  if (role === 'vendor') lineRows = lineRows.filter(r => r.tc_id === req.user.tcId);

  res.json({ plan: cpPlanFromRow(plan), lines: lineRows.map(cpLineFromRow) });
});

// POST /api/programs/:id/capacity-plan
// TC (vendor) initializes — pre-fills lines from placements so each
// placed style appears with its TC + factory. TC fills in the
// production math, submits, Production approves.
router.post('/programs/:id/capacity-plan', requireAuth, requireRole('admin', 'pc', 'vendor'), (req, res) => {
  const prog = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!prog) return res.status(404).json({ error: 'Program not found' });

  if (req.user.role === 'vendor') {
    const asg = db.prepare('SELECT 1 FROM assignments WHERE program_id = ? AND tc_id = ?').get(req.params.id, req.user.tcId);
    if (!asg) return res.status(403).json({ error: 'Not assigned to this program' });
  }

  const existing = db.prepare('SELECT id FROM capacity_plans WHERE program_id = ?').get(req.params.id);
  if (existing) return res.status(409).json({ error: 'Capacity plan already exists' });

  const planId = uid();
  const userLabel = req.user.name || req.user.email || req.user.id;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO capacity_plans (id, program_id, created_by, created_at, status)
      VALUES (?,?,?,?,?)
    `).run(planId, req.params.id, userLabel, now(), 'draft');

    const placed = db.prepare(`
      SELECT p.style_id, p.tc_id, p.factory_id, s.proj_qty
      FROM placements p
      JOIN styles s ON s.id = p.style_id
      WHERE s.program_id = ? AND s.status != 'cancelled'
    `).all(req.params.id);

    const insertLine = db.prepare(`
      INSERT INTO capacity_plan_lines
        (id, plan_id, style_id, tc_id, factory_id, total_qty, created_at)
      VALUES (?,?,?,?,?,?,?)
    `);

    for (const ps of placed) {
      insertLine.run(uid(), planId, ps.style_id, ps.tc_id, ps.factory_id,
        ps.proj_qty != null ? Math.round(ps.proj_qty) : null, now());
    }
  });
  tx();

  const plan  = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
  const lines = db.prepare('SELECT * FROM capacity_plan_lines WHERE plan_id = ? ORDER BY created_at').all(planId);
  res.status(201).json({ plan: cpPlanFromRow(plan), lines: lines.map(cpLineFromRow) });
});

// PATCH /api/capacity-plan-lines/:id
router.patch('/capacity-plan-lines/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM capacity_plan_lines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const role = req.user.role;
  const isVendor = role === 'vendor';
  if (isVendor && row.tc_id !== req.user.tcId) return res.status(403).json({ error: 'Forbidden' });
  if (!isVendor && !CP_ROLES_ADMIN.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  // Vendor extra guard: if they change factory_id, it must be one
  // of their active factories.
  if (req.body.factoryId !== undefined && req.body.factoryId) {
    const f = db.prepare('SELECT id, tc_id, status FROM factories WHERE id = ?').get(req.body.factoryId);
    if (!f) return res.status(400).json({ error: 'factoryId not found' });
    if (isVendor && (f.tc_id !== req.user.tcId || f.status !== 'active')) {
      return res.status(400).json({ error: 'factoryId must be one of your active factories' });
    }
  }

  const sets = [];
  const vals = [];
  for (const [camel, col] of Object.entries(CP_LINE_FIELDS)) {
    if (req.body[camel] === undefined) continue;
    let v = req.body[camel];
    // Blank string → null. Number-ish strings become numbers where appropriate.
    if (v === '') v = null;
    sets.push(`${col} = ?`); vals.push(v);
  }
  if (!sets.length) return res.json(cpLineFromRow(row));

  sets.push('updated_at = ?'); vals.push(now());
  vals.push(req.params.id);
  db.prepare(`UPDATE capacity_plan_lines SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  // Bump plan.updated_at; if it was approved, bumping back to 'submitted'
  // signals Production should re-review.
  const fresh = db.prepare('SELECT * FROM capacity_plan_lines WHERE id = ?').get(req.params.id);
  const pl = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(fresh.plan_id);
  if (pl && pl.status === 'approved' && isVendor) {
    db.prepare('UPDATE capacity_plans SET status = ?, updated_at = ? WHERE id = ?')
      .run('submitted', now(), pl.id);
  } else {
    db.prepare('UPDATE capacity_plans SET updated_at = ? WHERE id = ?').run(now(), fresh.plan_id);
  }

  res.json(cpLineFromRow(fresh));
});

// POST /api/capacity-plans/:id/submit — vendor submits for review
router.post('/capacity-plans/:id/submit', requireAuth, (req, res) => {
  const role = req.user.role;
  const pl = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  if (role !== 'vendor' && !CP_ROLES_ADMIN.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  if (role === 'vendor') {
    const has = db.prepare('SELECT 1 FROM capacity_plan_lines WHERE plan_id = ? AND tc_id = ? LIMIT 1').get(req.params.id, req.user.tcId);
    if (!has) return res.status(403).json({ error: 'Not your plan' });
  }

  db.prepare('UPDATE capacity_plans SET status = ?, submitted_by = ?, submitted_at = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?')
    .run('submitted', req.user.name || req.user.email || req.user.id, now(), now(), req.params.id);

  res.json(cpPlanFromRow(db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id)));
});

// POST /api/capacity-plans/:id/approve — admin/PC only
router.post('/capacity-plans/:id/approve', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const pl = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE capacity_plans SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?')
    .run('approved', req.user.name || req.user.email || req.user.id, now(), now(), req.params.id);

  res.json(cpPlanFromRow(db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id)));
});

// POST /api/capacity-plans/:id/reject — admin/PC only, reason in body
router.post('/capacity-plans/:id/reject', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const pl = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  const reason = (req.body.rejectionReason || '').trim() || null;
  db.prepare('UPDATE capacity_plans SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?')
    .run('rejected', req.user.name || req.user.email || req.user.id, now(), reason, now(), req.params.id);

  res.json(cpPlanFromRow(db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(req.params.id)));
});

// DELETE /api/programs/:id/capacity-plan — admin only
router.delete('/programs/:id/capacity-plan', requireAuth, requireRole('admin'), (req, res) => {
  const pl = db.prepare('SELECT id FROM capacity_plans WHERE program_id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'No plan' });
  db.transaction(() => {
    db.prepare('DELETE FROM capacity_plan_lines WHERE plan_id = ?').run(pl.id);
    db.prepare('DELETE FROM capacity_plans WHERE id = ?').run(pl.id);
  })();
  res.json({ ok: true });
});

// =============================================================
// PERFORMANCE (cross-program rollups)
// =============================================================
// Admin/PC only. Returns a flat list of "performance rows" — one
// per placed style — with the raw data needed to aggregate by TC
// or factory client-side (FOB, buys roll-up, delivery-late flags,
// capacity plan status). Client does the aggregation in JS so we
// can iterate on columns without round-trips.

// GET /api/performance/seasons — distinct (season, year) tuples on
// placed-style programs, sorted newest first.
router.get('/performance/seasons', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT p.season, p.year
    FROM programs p
    WHERE p.season IS NOT NULL AND p.year IS NOT NULL
    ORDER BY p.year DESC,
      CASE LOWER(p.season)
        WHEN 'holiday' THEN 4
        WHEN 'fall'    THEN 3
        WHEN 'summer'  THEN 2
        WHEN 'spring'  THEN 1
        ELSE 0
      END DESC
  `).all();
  res.json(rows);
});

// GET /api/performance/rows?seasons=SS25,FW24&years=2025,2024
// Returns one row per placed style.
router.get('/performance/rows', requireAuth, requireRole('admin', 'pc'), (req, res) => {
  const seasonList = (req.query.seasons || '').split(',').map(s => s.trim()).filter(Boolean);
  const yearList   = (req.query.years   || '').split(',').map(s => s.trim()).filter(Boolean);

  // Build WHERE clause. Empty filter = all programs.
  let where = `p.status != 'Cancelled'`;
  const params = [];
  if (seasonList.length) {
    where += ` AND p.season IN (${seasonList.map(() => '?').join(',')})`;
    params.push(...seasonList);
  }
  if (yearList.length) {
    where += ` AND p.year IN (${yearList.map(() => '?').join(',')})`;
    params.push(...yearList);
  }

  // Core placed-style data + buys rollup + delivery comparison
  // columns + capacity plan status.
  const sql = `
    SELECT
      p.id                 AS program_id,
      p.name               AS program_name,
      p.season, p.year,
      p.market,
      p.target_margin,
      p.status             AS program_status,
      pl.style_id,
      s.style_number, s.style_name,
      s.duty_rate, s.est_freight, s.special_packaging,
      pl.tc_id, pl.factory_id, pl.coo, pl.confirmed_fob,
      sub.fob              AS sub_fob,
      sub.payment_terms    AS sub_payment_terms,
      sub.factory_cost     AS sub_factory_cost,
      bu.total_qty         AS units,
      bu.revenue           AS revenue,
      dpl.factory_cargo_ready_date,
      dpl.production_cargo_ready_vendor,
      dpl.production_cargo_ready_sales,
      dpl.sales_in_whse_date,
      cp.status            AS capacity_status
    FROM placements pl
      INNER JOIN styles   s ON s.id = pl.style_id
      INNER JOIN programs p ON p.id = s.program_id
      LEFT  JOIN submissions sub ON sub.style_id = pl.style_id AND sub.tc_id = pl.tc_id AND sub.coo = pl.coo
      LEFT  JOIN (
        SELECT style_id,
               SUM(COALESCE(qty,0)) AS total_qty,
               SUM(COALESCE(qty,0) * COALESCE(sell_price,0)) AS revenue
        FROM customer_buys
        GROUP BY style_id
      ) bu ON bu.style_id = pl.style_id
      LEFT  JOIN delivery_plans   dp  ON dp.program_id  = p.id
      LEFT  JOIN delivery_plan_lines dpl ON dpl.plan_id = dp.id AND dpl.style_id = pl.style_id
      LEFT  JOIN capacity_plans   cp  ON cp.program_id  = p.id
    WHERE ${where}
    ORDER BY p.year DESC, p.season DESC, p.name
  `;

  const rows = db.prepare(sql).all(...params).map(r => ({
    programId:                 r.program_id,
    programName:               r.program_name,
    season:                    r.season,
    year:                      r.year,
    market:                    r.market,
    targetMargin:              r.target_margin,
    programStatus:             r.program_status,
    styleId:                   r.style_id,
    styleNumber:               r.style_number,
    styleName:                 r.style_name,
    dutyRate:                  r.duty_rate,
    estFreight:                r.est_freight,
    specialPackaging:          r.special_packaging,
    tcId:                      r.tc_id,
    factoryId:                 r.factory_id,
    coo:                       r.coo,
    fob:                       r.confirmed_fob ?? r.sub_fob,
    paymentTerms:              r.sub_payment_terms,
    factoryCost:               r.sub_factory_cost,
    units:                     r.units,
    revenue:                   r.revenue,
    factoryCargoReadyDate:     r.factory_cargo_ready_date,
    productionCargoReadyVendor: r.production_cargo_ready_vendor,
    productionCargoReadySales: r.production_cargo_ready_sales,
    salesInWhseDate:           r.sales_in_whse_date,
    capacityStatus:            r.capacity_status,
  }));

  res.json(rows);
});

module.exports = router;
