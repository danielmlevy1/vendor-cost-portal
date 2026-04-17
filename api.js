// =============================================================
// VENDOR COST PORTAL — API Layer (api.js)
// Async fetch() wrapper around the SQLite REST API.
//
// Mirrors the DB.* namespace structure so app.js can be migrated
// namespace-by-namespace:
//   DB.Programs.all()   -> await API.Programs.all()        (fetches)
//   DB.Programs.get(id) -> API.Programs.get(id)            (cache read)
//
// Pattern:
//   1. navigate() calls API.preload.X() to warm the cache.
//   2. Render functions read from API.cache.* synchronously.
//   3. Event handlers call await API.X.mutate() then re-render.
// =============================================================

const API = (() => {
  'use strict';

  // ── Token management ──────────────────────────────────────────
  // If we just came back from a Microsoft OIDC redirect, the token
  // arrives in the URL fragment (#auth=...). Pick it up, store it,
  // and strip it from the URL before the app reads the route.
  (function pickupFragmentToken() {
    const m = (window.location.hash || '').match(/[#&]auth=([^&]+)/);
    if (!m) return;
    try {
      const token = decodeURIComponent(m[1]);
      localStorage.setItem('vcp_token', token);
      // Remove the fragment without triggering a reload
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_) { /* ignore */ }
  })();

  let _token = localStorage.getItem('vcp_token') || null;

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (_token) h['Authorization'] = `Bearer ${_token}`;
    return h;
  }

  async function req(method, path, body) {
    const opts = { method, headers: authHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    // 401 = token expired / invalid — clear and force re-login
    if (res.status === 401 && _token) {
      _token = null;
      localStorage.removeItem('vcp_token');
      window.location.reload();
      throw new Error('Session expired');
    }
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
  }

  const GET  = path         => req('GET',    path);
  const POST = (path, body) => req('POST',   path, body);
  const PATCH= (path, body) => req('PATCH',  path, body);
  const PUT  = (path, body) => req('PUT',    path, body);
  const DEL  = path         => req('DELETE', path);

  // ── Cache ─────────────────────────────────────────────────────
  // Populated before rendering via preload.* helpers.
  // Render functions read these synchronously.
  const cache = {
    programs:            [],
    programMap:          {},
    styles:              {},   // programId -> [styles]
    styleMap:            {},   // id -> style
    tradingCompanies:    [],
    tcMap:               {},
    internalPrograms:    [],
    ipMap:               {},
    brandTierMargins:    [],
    cooRates:            [],
    cooRateMap:          {},   // code -> cooRate
    customers:           [],
    customerMap:         {},
    departments:         [],
    deptMap:             {},
    users:               [],
    assignments:         {},   // programId -> [assignments]
    submissions:         {},   // styleId -> [submissions]
    placements:          {},   // programId -> [placements]
    customerAssignments: {},   // programId -> [customerIds]
    customerBuys:        {},   // programId -> [buys]
    designHandoffs:      [],
    handoffMap:          {},
    salesRequests:       [],
    srMap:               {},
    fabricLibrary:       [],
    recostByProgram:     {},   // programId -> [rcrs]
    recostPendingSales:      [],
    recostPendingProduction: [],
    pendingChanges:      [],
    styleLinks:          {},   // programId -> [links]
    costHistory:         {},   // styleId -> [events]
    designChanges:       {},   // styleId -> [changes]
    cellFlags:           {},   // subId -> [flags]
    revisionsBySubmission: {},  // subId -> [revisions]
  };

  // ── Auth ──────────────────────────────────────────────────────
  const Auth = {
    async login(email, password) {
      const { token, user } = await POST('/api/auth/login', { email, password });
      _token = token;
      localStorage.setItem('vcp_token', token);
      return user;
    },
    async logout() {
      try { await POST('/api/auth/logout'); } catch (_) { /* ignore */ }
      _token = null;
      localStorage.removeItem('vcp_token');
    },
    async current() {
      if (!_token) return null;
      try {
        const r = await GET('/api/auth/me');
        // /me returns { user }; unwrap for callers that expect the payload
        return r && r.user ? r.user : r;
      }
      catch (_) { _token = null; localStorage.removeItem('vcp_token'); return null; }
    },
    async config() {
      try { return await GET('/api/auth/config'); }
      catch (_) { return { microsoftEnabled: false }; }
    },
    microsoftLoginUrl() { return '/api/auth/microsoft/login'; },
  };

  // DB.Session.current() was an alias — use state.user instead
  const Session = {
    current() { return null; },
  };

  // ── Pure utility functions (moved from DB) ────────────────────

  function calcLDP(fob, styleData, cooCode, market, port, paymentTerms, factoryCost) {
    if (!fob || isNaN(fob)) return null;
    const rate = cache.cooRateMap[cooCode];
    if (!rate) return null;

    const baseDutyRate = styleData?.dutyRate || 0;
    const addlDuty     = rate.addlDuty || 0;
    const terms        = (paymentTerms || 'FOB').toUpperCase().trim();

    let duty = 0, effectiveDutyRate = 0, noFreight = false;

    if (terms === 'FCA') {
      duty = 0; effectiveDutyRate = 0; noFreight = true;
    } else if (terms === 'CIF') {
      effectiveDutyRate = addlDuty; duty = fob * addlDuty; noFreight = true;
    } else if (terms === 'DUTY FREE' || terms === 'CPTPP') {
      effectiveDutyRate = addlDuty; duty = fob * addlDuty;
    } else if (terms === 'FIRST SALE') {
      effectiveDutyRate = addlDuty + baseDutyRate;
      const base = (factoryCost != null && !isNaN(factoryCost)) ? parseFloat(factoryCost) : fob;
      duty = base * effectiveDutyRate;
    } else {
      effectiveDutyRate = addlDuty + baseDutyRate;
      duty = fob * effectiveDutyRate;
    }

    const estFr  = (styleData?.estFreight != null && !isNaN(styleData.estFreight)) ? parseFloat(styleData.estFreight) : null;
    const cooMult = market === 'USA' ? (rate.usaMult || 0) : (rate.canadaMult || 0);
    let freightPerUnit;
    if (noFreight) freightPerUnit = 0;
    else if (estFr != null) freightPerUnit = Math.round(estFr * (1 + cooMult) * 100) / 100;
    else freightPerUnit = null;

    const specialPkg = styleData?.specialPackaging || 0;
    const ldp = fob + duty + (freightPerUnit || 0) + specialPkg;
    return {
      ldp:      Math.round(ldp * 100) / 100,
      duty:     Math.round(duty * 100) / 100,
      dutyRate: effectiveDutyRate,
      freight:  freightPerUnit,
      noQty:    false,
      noFreight,
      terms,
    };
  }

  function computeTargetLDP(style, program) {
    if (program?.targetMargin && style?.projSellPrice) {
      return Math.round(style.projSellPrice * program.targetMargin * 100) / 100;
    }
    return null;
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  }

  function csvRowToStyle(row) {
    const n = k => { const x = parseFloat(row[k]); return isNaN(x) ? null : x; };
    return {
      styleNumber:      row['Style #']?.trim() || row['Style Number']?.trim() || '',
      styleName:        row['Style Name']?.trim() || '',
      category:         row['Category']?.trim() || '',
      fabrication:      row['Main Fabrication']?.trim() || row['Fabrication']?.trim() || '',
      projQty:          n('Proj Qty'),
      projSellPrice:    n('Proj Sell Price'),
      dutyRate:         n('Duty Rate'),
      estFreight:       n('Est Base Freight'),
      specialPackaging: n('Special Packaging'),
    };
  }

  // ── Reference Data ────────────────────────────────────────────

  const CooRates = {
    async all() {
      cache.cooRates = await GET('/api/coo-rates');
      cache.cooRateMap = {};
      cache.cooRates.forEach(r => { cache.cooRateMap[r.code] = r; cache.cooRateMap[r.id] = r; });
      return cache.cooRates;
    },
    get(codeOrId) { return cache.cooRateMap[codeOrId] || null; },
    async upsert(data) {
      const r = await POST('/api/coo-rates', data);
      const idx = cache.cooRates.findIndex(x => x.id === r.id);
      if (idx >= 0) cache.cooRates[idx] = r; else cache.cooRates.push(r);
      cache.cooRateMap[r.code] = r; cache.cooRateMap[r.id] = r;
      return r;
    },
    async delete(id) {
      const old = cache.cooRates.find(r => r.id === id);
      await DEL(`/api/coo-rates/${id}`);
      cache.cooRates = cache.cooRates.filter(r => r.id !== id);
      if (old) { delete cache.cooRateMap[old.code]; delete cache.cooRateMap[old.id]; }
    },
  };

  const BrandTierMargins = {
    async all() {
      cache.brandTierMargins = await GET('/api/brand-tier-margins');
      return cache.brandTierMargins;
    },
    get(id)  { return cache.brandTierMargins.find(m => m.id === id) || null; },
    lookup(brand, tier) {
      const m = cache.brandTierMargins.find(m => m.brand === brand && m.tier === tier);
      return m ? m.targetMargin : null;
    },
    async upsert(data) {
      const m = await POST('/api/brand-tier-margins', data);
      const idx = cache.brandTierMargins.findIndex(x => x.id === m.id);
      if (idx >= 0) cache.brandTierMargins[idx] = m; else cache.brandTierMargins.push(m);
      return m;
    },
    async delete(id) {
      await DEL(`/api/brand-tier-margins/${id}`);
      cache.brandTierMargins = cache.brandTierMargins.filter(m => m.id !== id);
    },
  };

  const InternalPrograms = {
    async all() {
      cache.internalPrograms = await GET('/api/internal-programs');
      cache.ipMap = {};
      cache.internalPrograms.forEach(p => { cache.ipMap[p.id] = p; });
      return cache.internalPrograms;
    },
    get(id) { return cache.ipMap[id] || null; },
    async upsert(data) {
      let ip;
      if (data.id && cache.ipMap[data.id]) {
        ip = await PATCH(`/api/internal-programs/${data.id}`, data);
      } else {
        ip = await POST('/api/internal-programs', data);
      }
      cache.ipMap[ip.id] = ip;
      const idx = cache.internalPrograms.findIndex(x => x.id === ip.id);
      if (idx >= 0) cache.internalPrograms[idx] = ip; else cache.internalPrograms.push(ip);
      return ip;
    },
    async delete(id) {
      await DEL(`/api/internal-programs/${id}`);
      cache.internalPrograms = cache.internalPrograms.filter(p => p.id !== id);
      delete cache.ipMap[id];
    },
  };

  const Customers = {
    async all() {
      cache.customers = await GET('/api/customers');
      cache.customerMap = {};
      cache.customers.forEach(c => { cache.customerMap[c.id] = c; });
      return cache.customers;
    },
    get(id) { return cache.customerMap[id] || null; },
    async create(data) {
      const c = await POST('/api/customers', data);
      cache.customers.push(c); cache.customerMap[c.id] = c;
      return c;
    },
    async update(id, data) {
      const c = await PATCH(`/api/customers/${id}`, data);
      cache.customerMap[id] = c;
      const idx = cache.customers.findIndex(x => x.id === id);
      if (idx >= 0) cache.customers[idx] = c;
      return c;
    },
    async delete(id) {
      await DEL(`/api/customers/${id}`);
      cache.customers = cache.customers.filter(c => c.id !== id);
      delete cache.customerMap[id];
    },
  };

  const Departments = {
    async all() {
      cache.departments = await GET('/api/departments');
      cache.deptMap = {};
      cache.departments.forEach(d => { cache.deptMap[d.id] = d; });
      return cache.departments;
    },
    get(id) { return cache.deptMap[id] || null; },
    async create(data) {
      const d = await POST('/api/departments', data);
      cache.departments.push(d); cache.deptMap[d.id] = d;
      return d;
    },
    async update(id, data) {
      const d = await PATCH(`/api/departments/${id}`, data);
      cache.deptMap[id] = d;
      const idx = cache.departments.findIndex(x => x.id === id);
      if (idx >= 0) cache.departments[idx] = d;
      return d;
    },
    async delete(id) {
      await DEL(`/api/departments/${id}`);
      cache.departments = cache.departments.filter(d => d.id !== id);
      delete cache.deptMap[id];
    },
    memberCount(id) { return cache.users.filter(u => u.departmentId === id).length; },
  };

  const Users = {
    async all() {
      cache.users = await GET('/api/users');
      return cache.users;
    },
  };

  // PCUsers — maps to /api/users endpoints, filtered by role
  const PCUsers = {
    allStaff()    { return cache.users.filter(u => u.role === 'admin' || u.role === 'pc'); },
    allInternal() { return cache.users.filter(u => ['admin','pc','planning','design','tech_design','prod_dev'].includes(u.role)); },
    async create(data) {
      const u = await POST('/api/users', data);
      cache.users.push(u);
      return u;
    },
    async update(id, data) {
      const u = await PATCH(`/api/users/${id}`, data);
      const idx = cache.users.findIndex(x => x.id === id);
      if (idx >= 0) cache.users[idx] = u;
      return u;
    },
    async delete(id) {
      await DEL(`/api/users/${id}`);
      cache.users = cache.users.filter(u => u.id !== id);
    },
  };

  // ── Programs ──────────────────────────────────────────────────

  const Programs = {
    async all() {
      cache.programs = await GET('/api/programs');
      cache.programMap = {};
      cache.programs.forEach(p => { cache.programMap[p.id] = p; });
      return cache.programs;
    },
    get(id) { return cache.programMap[id] || null; },
    async fetch(id) {
      const p = await GET(`/api/programs/${id}`);
      cache.programMap[id] = p;
      const idx = cache.programs.findIndex(x => x.id === id);
      if (idx >= 0) cache.programs[idx] = p; else cache.programs.push(p);
      return p;
    },
    async create(data) {
      const p = await POST('/api/programs', data);
      cache.programs.unshift(p); cache.programMap[p.id] = p;
      return p;
    },
    async update(id, data) {
      const p = await PATCH(`/api/programs/${id}`, data);
      cache.programMap[id] = p;
      const idx = cache.programs.findIndex(x => x.id === id);
      if (idx >= 0) cache.programs[idx] = p;
      return p;
    },
    async delete(id) {
      await DEL(`/api/programs/${id}`);
      cache.programs = cache.programs.filter(p => p.id !== id);
      delete cache.programMap[id];
    },
    async placeAll(id) {
      await POST(`/api/programs/${id}/place-all`);
    },
  };

  // ── Styles ────────────────────────────────────────────────────

  const Styles = {
    all()           { return Object.values(cache.styleMap); },
    byProgram(pid)  { return cache.styles[pid] || []; },
    get(id)         { return cache.styleMap[id] || null; },
    async fetchByProgram(pid) {
      const styles = await GET(`/api/programs/${pid}/styles`);
      cache.styles[pid] = styles;
      styles.forEach(s => { cache.styleMap[s.id] = s; });
      return styles;
    },
    async fetch(id) {
      const s = await GET(`/api/styles/${id}`);
      cache.styleMap[id] = s;
      return s;
    },
    async create(data) {
      const s = await POST('/api/styles', data);
      cache.styleMap[s.id] = s;
      if (!cache.styles[s.programId]) cache.styles[s.programId] = [];
      cache.styles[s.programId].push(s);
      return s;
    },
    async update(id, data) {
      const s = await PATCH(`/api/styles/${id}`, data);
      cache.styleMap[id] = s;
      if (cache.styles[s.programId]) {
        const idx = cache.styles[s.programId].findIndex(x => x.id === id);
        if (idx >= 0) cache.styles[s.programId][idx] = s;
      }
      return s;
    },
    async delete(id) {
      const s = cache.styleMap[id];
      await DEL(`/api/styles/${id}`);
      if (s?.programId && cache.styles[s.programId]) {
        cache.styles[s.programId] = cache.styles[s.programId].filter(x => x.id !== id);
      }
      delete cache.styleMap[id];
    },
    async bulkCreate(pid, rows) {
      const styles = await POST(`/api/programs/${pid}/styles/bulk`, { styles: rows });
      if (!cache.styles[pid]) cache.styles[pid] = [];
      styles.forEach(s => { cache.styles[pid].push(s); cache.styleMap[s.id] = s; });
      return styles;
    },
  };

  // ── Trading Companies ─────────────────────────────────────────

  const TradingCompanies = {
    async all() {
      cache.tradingCompanies = await GET('/api/trading-companies');
      cache.tcMap = {};
      cache.tradingCompanies.forEach(t => { cache.tcMap[t.id] = t; });
      return cache.tradingCompanies;
    },
    get(id) { return cache.tcMap[id] || null; },
    async create(data) {
      const t = await POST('/api/trading-companies', data);
      cache.tradingCompanies.push(t); cache.tcMap[t.id] = t;
      return t;
    },
    async update(id, data) {
      const t = await PATCH(`/api/trading-companies/${id}`, data);
      cache.tcMap[id] = t;
      const idx = cache.tradingCompanies.findIndex(x => x.id === id);
      if (idx >= 0) cache.tradingCompanies[idx] = t;
      return t;
    },
    async delete(id) {
      await DEL(`/api/trading-companies/${id}`);
      cache.tradingCompanies = cache.tradingCompanies.filter(t => t.id !== id);
      delete cache.tcMap[id];
    },
  };

  // ── Assignments ───────────────────────────────────────────────

  function syncTcCount(programId, count) {
    const p = cache.programMap[programId];
    if (p) p.tcCount = count;
    const idx = cache.programs.findIndex(x => x.id === programId);
    if (idx >= 0) cache.programs[idx].tcCount = count;
  }

  // Defensive: ensure every assignment has the expected coos arrays, in
  // case an older server is still running.
  function normalizeAssignments(asgns) {
    for (const a of asgns) {
      if (!Array.isArray(a.coos)) a.coos = [];
      if (a.tc && !Array.isArray(a.tc.coos)) {
        const full = cache.tcMap[a.tcId];
        a.tc.coos = (full && full.coos) || a.coos.slice();
      }
    }
    return asgns;
  }

  const Assignments = {
    all()           { return Object.values(cache.assignments).flat(); },
    byProgram(pid)  { return cache.assignments[pid] || []; },
    async fetchByProgram(pid) {
      const asgns = normalizeAssignments(await GET(`/api/programs/${pid}/assignments`));
      cache.assignments[pid] = asgns;
      syncTcCount(pid, asgns.length);
      return asgns;
    },
    // selections: either
    //   array of tcIds                                  (each TC gets all its COOs)
    //   array of { tcId, coos: [...] }                  (caller picks COOs)
    async assign(programId, selections) {
      const body = Array.isArray(selections) && selections.length && typeof selections[0] === 'object'
        ? { assignments: selections }
        : { tcIds: selections };
      const asgns = normalizeAssignments(await PUT(`/api/programs/${programId}/assignments`, body));
      cache.assignments[programId] = asgns;
      syncTcCount(programId, asgns.length);
      return asgns;
    },
    stylesByTc(tcId) {
      // Styles across all programs where this TC is assigned
      return Object.values(cache.styleMap).filter(s =>
        (cache.assignments[s.programId] || []).some(a => a.tcId === tcId)
      );
    },
  };

  // ── Submissions ───────────────────────────────────────────────

  function _updateSubInCache(sub) {
    if (!cache.submissions[sub.styleId]) cache.submissions[sub.styleId] = [];
    const arr = cache.submissions[sub.styleId];
    const idx = arr.findIndex(s => s.id === sub.id);
    if (idx >= 0) arr[idx] = sub; else arr.push(sub);
  }

  function _patchSubById(id, patch) {
    for (const list of Object.values(cache.submissions)) {
      const idx = list.findIndex(s => s.id === id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...patch }; return; }
    }
  }

  const Submissions = {
    all()             { return Object.values(cache.submissions).flat(); },
    byStyle(styleId)  { return cache.submissions[styleId] || []; },
    byTcAndStyle(tcId, styleId) { return (cache.submissions[styleId] || []).filter(s => s.tcId === tcId); },
    get(id) {
      for (const list of Object.values(cache.submissions)) {
        const s = list.find(x => x.id === id);
        if (s) return s;
      }
      return null;
    },
    async fetchByProgram(pid) {
      const subs = await GET(`/api/programs/${pid}/submissions`);
      const grouped = {};
      subs.forEach(s => { if (!grouped[s.styleId]) grouped[s.styleId] = []; grouped[s.styleId].push(s); });
      Object.assign(cache.submissions, grouped);
      return subs;
    },
    async upsert(data, _submitterName) {
      // _submitterName ignored — server derives from JWT
      const sub = await POST('/api/submissions', data);
      _updateSubInCache(sub);
      return sub;
    },
    async flag(id, reason) {
      await PATCH(`/api/submissions/${id}/flag`, { flagReason: reason });
      _patchSubById(id, { status: 'flagged', flagReason: reason });
    },
    async unflag(id) {
      await PATCH(`/api/submissions/${id}/unflag`);
      _patchSubById(id, { status: 'submitted', flagReason: null });
    },
    async accept(id) {
      await PATCH(`/api/submissions/${id}/accept`);
      _patchSubById(id, { status: 'accepted' });
    },
  };

  // ── Placements ────────────────────────────────────────────────

  const Placements = {
    get(styleId) {
      for (const list of Object.values(cache.placements)) {
        const p = list.find(x => x.styleId === styleId);
        if (p) return p;
      }
      return null;
    },
    async fetchByProgram(pid) {
      cache.placements[pid] = await GET(`/api/programs/${pid}/placements`);
      return cache.placements[pid];
    },
    async place(data) {
      const p = await POST('/api/placements', data);
      const pid = cache.styleMap[data.styleId]?.programId;
      if (pid) {
        if (!cache.placements[pid]) cache.placements[pid] = [];
        const idx = cache.placements[pid].findIndex(x => x.styleId === data.styleId);
        if (idx >= 0) cache.placements[pid][idx] = p; else cache.placements[pid].push(p);
      }
      return p;
    },
    async unplace(styleId) {
      await DEL(`/api/placements/${styleId}`);
      for (const list of Object.values(cache.placements)) {
        const idx = list.findIndex(x => x.styleId === styleId);
        if (idx >= 0) { list.splice(idx, 1); return; }
      }
    },
  };

  // ── Customer Assignments ──────────────────────────────────────

  const CustomerAssignments = {
    byProgram(pid) { return cache.customerAssignments[pid] || []; },
    async fetchByProgram(pid) {
      cache.customerAssignments[pid] = await GET(`/api/programs/${pid}/customer-assignments`);
      return cache.customerAssignments[pid];
    },
    async assign(programId, customerIds) {
      cache.customerAssignments[programId] = await PUT(`/api/programs/${programId}/customer-assignments`, { customerIds });
      return cache.customerAssignments[programId];
    },
  };

  // ── Customer Buys ─────────────────────────────────────────────

  const CustomerBuys = {
    byProgram(pid)              { return cache.customerBuys[pid] || []; },
    byStyle(styleId)            { return Object.values(cache.customerBuys).flat().filter(b => b.styleId === styleId); },
    get(pid, styleId, custId)   { return (cache.customerBuys[pid] || []).find(b => b.styleId === styleId && b.customerId === custId) || null; },
    async fetchByProgram(pid) {
      cache.customerBuys[pid] = await GET(`/api/programs/${pid}/customer-buys`);
      return cache.customerBuys[pid];
    },
    async upsert(data) {
      const { programId, styleId, customerId, ...rest } = data;
      const buys = await PUT(`/api/programs/${programId}/customer-buys/${styleId}`, {
        buys: [{ customerId, ...rest }],
      });
      // Refresh style's buys in cache
      if (cache.customerBuys[programId]) {
        cache.customerBuys[programId] = cache.customerBuys[programId].filter(b => !(b.styleId === styleId && b.customerId === customerId));
        buys.forEach(b => cache.customerBuys[programId].push(b));
      }
      return buys.find(b => b.customerId === customerId);
    },
    async delete(programId, styleId, customerId) {
      // Passing null qty+sellPrice triggers server-side delete
      await PUT(`/api/programs/${programId}/customer-buys/${styleId}`, {
        buys: [{ customerId, qty: null, sellPrice: null }],
      });
      if (cache.customerBuys[programId]) {
        cache.customerBuys[programId] = cache.customerBuys[programId].filter(b => !(b.styleId === styleId && b.customerId === customerId));
      }
    },
  };

  // ── Style Links ───────────────────────────────────────────────

  const StyleLinks = {
    byProgram(pid) { return cache.styleLinks[pid] || []; },
    get(id) {
      for (const list of Object.values(cache.styleLinks)) {
        const l = list.find(x => x.id === id); if (l) return l;
      }
      return null;
    },
    byStyle(styleId) {
      for (const list of Object.values(cache.styleLinks)) {
        const l = list.find(x => Array.isArray(x.styleIds) && x.styleIds.includes(styleId));
        if (l) return l;
      }
      return null;
    },
    linkedStyleIds(programId) {
      return (cache.styleLinks[programId] || []).flatMap(l => l.styleIds || []);
    },
    async fetchByProgram(pid) {
      cache.styleLinks[pid] = await GET(`/api/programs/${pid}/style-links`);
      return cache.styleLinks[pid];
    },
    async create(data) {
      const l = await POST('/api/style-links', data);
      if (!cache.styleLinks[data.programId]) cache.styleLinks[data.programId] = [];
      cache.styleLinks[data.programId].push(l);
      return l;
    },
    async update(id, data) {
      const l = await PATCH(`/api/style-links/${id}`, data);
      for (const list of Object.values(cache.styleLinks)) {
        const idx = list.findIndex(x => x.id === id);
        if (idx >= 0) { list[idx] = l; return l; }
      }
      return l;
    },
    async delete(id) {
      await DEL(`/api/style-links/${id}`);
      for (const list of Object.values(cache.styleLinks)) {
        const idx = list.findIndex(x => x.id === id);
        if (idx >= 0) { list.splice(idx, 1); return; }
      }
    },
  };

  // ── Design Changes ────────────────────────────────────────────

  const DesignChanges = {
    all() { return Object.values(cache.designChanges).flat(); },
    byStyle(styleId) { return cache.designChanges[styleId] || []; },
    async fetchByStyle(styleId) {
      cache.designChanges[styleId] = await GET(`/api/styles/${styleId}/design-changes`);
      return cache.designChanges[styleId];
    },
    async log(data) {
      const entry = await POST('/api/design-changes', data);
      if (!cache.designChanges[data.styleId]) cache.designChanges[data.styleId] = [];
      cache.designChanges[data.styleId].unshift(entry);
      return entry;
    },
  };

  // ── Recost Requests ───────────────────────────────────────────

  function _updateRcrInCache(updated) {
    for (const list of Object.values(cache.recostByProgram)) {
      const idx = list.findIndex(r => r.id === updated.id);
      if (idx >= 0) { list[idx] = updated; return; }
    }
  }

  const RecostRequests = {
    all()               { return Object.values(cache.recostByProgram).flat(); },
    byProgram(pid)      { return cache.recostByProgram[pid] || []; },
    pendingSales()      { return cache.recostPendingSales; },
    pendingProduction() { return cache.recostPendingProduction; },
    get(id) {
      for (const list of Object.values(cache.recostByProgram)) {
        const r = list.find(x => x.id === id); if (r) return r;
      }
      return null;
    },
    async fetchByProgram(pid) {
      cache.recostByProgram[pid] = await GET(`/api/programs/${pid}/recost-requests`);
      return cache.recostByProgram[pid];
    },
    async fetchQueues() {
      const [ps, pp] = await Promise.all([
        GET('/api/recost-requests?status=pending_sales'),
        GET('/api/recost-requests?status=pending_production'),
      ]);
      cache.recostPendingSales      = ps;
      cache.recostPendingProduction = pp;
    },
    async create(data) {
      const r = await POST('/api/recost-requests', data);
      if (!cache.recostByProgram[data.programId]) cache.recostByProgram[data.programId] = [];
      cache.recostByProgram[data.programId].push(r);
      return r;
    },
    async salesApprove(id, approvedBy, approvedByName) {
      const r = await POST(`/api/recost-requests/${id}/sales-approve`, { approvedBy, approvedByName });
      _updateRcrInCache(r);
      return r;
    },
    async reject(id, note, stage) {
      const r = await POST(`/api/recost-requests/${id}/reject`, { rejectionNote: note, rejectedStage: stage || 'production' });
      _updateRcrInCache(r);
      return r;
    },
    async release(id, releasedBy, releasedByName) {
      const r = await POST(`/api/recost-requests/${id}/release`, { releasedBy, releasedByName });
      _updateRcrInCache(r);
      return r;
    },
    async dismiss(id) {
      const r = await POST(`/api/recost-requests/${id}/dismiss`);
      _updateRcrInCache(r);
      return r;
    },
  };

  // ── Cell Flags ────────────────────────────────────────────────

  const CellFlags = {
    get(subId, field) {
      return (cache.cellFlags[subId] || []).find(f => f.field === field) || null;
    },
    bySubmission(subId) { return cache.cellFlags[subId] || []; },
    async fetchBySubmission(subId) {
      cache.cellFlags[subId] = await GET(`/api/submissions/${subId}/flags`);
      return cache.cellFlags[subId];
    },
    async set(subId, field, color, note, flaggedBy, flaggedByName) {
      const f = await PUT('/api/cell-flags', { subId, field, color, note, flaggedBy, flaggedByName });
      if (!cache.cellFlags[subId]) cache.cellFlags[subId] = [];
      const idx = cache.cellFlags[subId].findIndex(x => x.field === field);
      if (idx >= 0) cache.cellFlags[subId][idx] = f; else cache.cellFlags[subId].push(f);
      return f;
    },
    async clear(subId, field) {
      await DEL(`/api/cell-flags/${subId}/${field}`);
      if (cache.cellFlags[subId]) {
        cache.cellFlags[subId] = cache.cellFlags[subId].filter(f => f.field !== field);
      }
    },
  };

  // ── Revisions ─────────────────────────────────────────────────

  const Revisions = {
    // Sync cache read: price revisions only (excludes flag events), sorted by time
    byField(subId, field) {
      return (cache.revisionsBySubmission[subId] || [])
        .filter(r => r.field === field && !r.type)
        .sort((a, b) => (a.submittedAt || '').localeCompare(b.submittedAt || ''));
    },
    async byFieldAll(subId, field) { return GET(`/api/submissions/${subId}/revisions${field ? '?field=' + field : ''}`); },
    async fetchBySubmission(subId) {
      const revs = await GET(`/api/submissions/${subId}/revisions`);
      cache.revisionsBySubmission[subId] = revs;
      return revs;
    },
    async log(entry) { return POST('/api/revisions', entry); },
  };

  // ── Pending Changes ───────────────────────────────────────────

  const PendingChanges = {
    all()     { return cache.pendingChanges; },
    pending() { return cache.pendingChanges.filter(c => c.status === 'pending'); },
    async fetch() {
      cache.pendingChanges = await GET('/api/pending-changes');
      return cache.pendingChanges;
    },
    async propose(data) {
      const pc = await POST('/api/pending-changes', data);
      cache.pendingChanges.push(pc);
      return pc;
    },
    async approve(id) {
      const pc = await POST(`/api/pending-changes/${id}/approve`);
      const idx = cache.pendingChanges.findIndex(c => c.id === id);
      if (idx >= 0) cache.pendingChanges[idx] = pc;
      return pc;
    },
    async reject(id) {
      const pc = await POST(`/api/pending-changes/${id}/reject`);
      const idx = cache.pendingChanges.findIndex(c => c.id === id);
      if (idx >= 0) cache.pendingChanges[idx] = pc;
      return pc;
    },
  };

  // ── Design Handoffs ───────────────────────────────────────────

  const DesignHandoffs = {
    all() { return cache.designHandoffs; },
    get(id) { return cache.handoffMap[id] || null; },
    async fetchAll() {
      cache.designHandoffs = await GET('/api/design-handoffs');
      cache.handoffMap = {};
      cache.designHandoffs.forEach(h => { cache.handoffMap[h.id] = h; });
      return cache.designHandoffs;
    },
    async fetch(id) {
      const h = await GET(`/api/design-handoffs/${id}`);
      cache.handoffMap[id] = h;
      const idx = cache.designHandoffs.findIndex(x => x.id === id);
      if (idx >= 0) cache.designHandoffs[idx] = h; else cache.designHandoffs.push(h);
      return h;
    },
    async create(data) {
      const h = await POST('/api/design-handoffs', data);
      cache.designHandoffs.unshift(h); cache.handoffMap[h.id] = h;
      return h;
    },
    async update(id, data) {
      const h = await PATCH(`/api/design-handoffs/${id}`, data);
      cache.handoffMap[id] = h;
      const idx = cache.designHandoffs.findIndex(x => x.id === id);
      if (idx >= 0) cache.designHandoffs[idx] = h;
      return h;
    },
    async delete(id) {
      await DEL(`/api/design-handoffs/${id}`);
      cache.designHandoffs = cache.designHandoffs.filter(h => h.id !== id);
      delete cache.handoffMap[id];
    },
  };

  // ── Fabric Library ────────────────────────────────────────────

  const FabricLibrary = {
    all() { return cache.fabricLibrary; },
    async fetchAll() {
      cache.fabricLibrary = await GET('/api/fabric-library');
      return cache.fabricLibrary;
    },
  };

  // ── Sales Requests ────────────────────────────────────────────

  const SalesRequests = {
    all() { return cache.salesRequests; },
    get(id) { return cache.srMap[id] || null; },
    async fetchAll() {
      cache.salesRequests = await GET('/api/sales-requests');
      cache.srMap = {};
      cache.salesRequests.forEach(r => { cache.srMap[r.id] = r; });
      return cache.salesRequests;
    },
    async fetch(id) {
      const r = await GET(`/api/sales-requests/${id}`);
      cache.srMap[id] = r;
      const idx = cache.salesRequests.findIndex(x => x.id === id);
      if (idx >= 0) cache.salesRequests[idx] = r; else cache.salesRequests.push(r);
      return r;
    },
    async create(data) {
      const r = await POST('/api/sales-requests', data);
      cache.salesRequests.unshift(r); cache.srMap[r.id] = r;
      return r;
    },
    async update(id, data) {
      const r = await PATCH(`/api/sales-requests/${id}`, data);
      cache.srMap[id] = r;
      const idx = cache.salesRequests.findIndex(x => x.id === id);
      if (idx >= 0) cache.salesRequests[idx] = r;
      return r;
    },
    async delete(id) {
      await DEL(`/api/sales-requests/${id}`);
      cache.salesRequests = cache.salesRequests.filter(r => r.id !== id);
      delete cache.srMap[id];
    },
    async convertToProgram(requestId, programData) {
      const result = await POST(`/api/sales-requests/${requestId}/convert`, programData);
      // result contains the new program; refresh cache
      if (result.id) {
        cache.programs.unshift(result); cache.programMap[result.id] = result;
      }
      // Re-fetch the SR to get updated status
      await SalesRequests.fetch(requestId);
      return result;
    },
  };

  // ── Cost History ──────────────────────────────────────────────

  const CostHistory = {
    byStyle(styleId) { return cache.costHistory[styleId] || []; },
    async fetchByStyle(styleId) {
      cache.costHistory[styleId] = await GET(`/api/styles/${styleId}/cost-history`);
      return cache.costHistory[styleId];
    },
    async fetchByProgram(pid) {
      const events = await GET(`/api/programs/${pid}/cost-history`);
      // Group by styleId
      events.forEach(e => {
        if (!cache.costHistory[e.styleId]) cache.costHistory[e.styleId] = [];
        const idx = cache.costHistory[e.styleId].findIndex(x => x.id === e.id);
        if (idx < 0) cache.costHistory[e.styleId].push(e);
      });
      return events;
    },
  };

  // ── Preloaders ────────────────────────────────────────────────
  // Called by navigate() before rendering.
  // Each loads all data needed for the given route.

  let _globalLoaded = false;

  const preload = {
    async global() {
      if (_globalLoaded) return;
      await Promise.all([
        CooRates.all(),
        BrandTierMargins.all(),
        InternalPrograms.all(),
        Customers.all(),
        Departments.all(),
        TradingCompanies.all(),
      ]);
      _globalLoaded = true;
    },
    // Force-refresh global data (after mutations to reference tables)
    async refreshGlobal() {
      _globalLoaded = false;
      await preload.global();
    },
    async nav() {
      // Lightweight preload for sidebar badges
      await Promise.all([
        preload.global(),
        RecostRequests.fetchQueues().catch(() => {}),
        PendingChanges.fetch().catch(() => {}),
      ]);
    },
    async programs() {
      await Promise.all([Programs.all(), preload.nav()]);
    },
    async program(id) {
      await Promise.all([
        Programs.fetch(id),
        Styles.fetchByProgram(id),
        Assignments.fetchByProgram(id),
        Placements.fetchByProgram(id),
        CustomerAssignments.fetchByProgram(id),
        CustomerBuys.fetchByProgram(id),
        Submissions.fetchByProgram(id),
        StyleLinks.fetchByProgram(id),
        RecostRequests.fetchByProgram(id),
        preload.nav(),
      ]);
      // Post-load: cell flags, revisions, cost history (parallel)
      const subs = Object.values(cache.submissions).flat();
      await Promise.all([
        ...subs.map(s => Promise.all([
          CellFlags.fetchBySubmission(s.id).catch(() => {}),
          Revisions.fetchBySubmission(s.id).catch(() => {}),
        ])),
        CostHistory.fetchByProgram(id).catch(() => {}),
      ]);
    },
    async staff() {
      await Promise.all([Users.all(), Departments.all(), PendingChanges.fetch()]);
    },
    async tradingCompanies() {
      await Promise.all([TradingCompanies.all(), CooRates.all(), PendingChanges.fetch()]);
    },
    async designHandoff() {
      await Promise.all([DesignHandoffs.fetchAll(), BrandTierMargins.all(), TradingCompanies.all(), SalesRequests.fetchAll(), FabricLibrary.fetchAll(), preload.nav()]);
    },
    async salesRequest() {
      await Promise.all([SalesRequests.fetchAll(), DesignHandoffs.fetchAll(), InternalPrograms.all(), BrandTierMargins.all(), TradingCompanies.all(), preload.nav()]);
    },
    async fabricStandards() {
      await Promise.all([FabricLibrary.fetchAll(), preload.nav()]);
    },
    async recostQueue() {
      await Promise.all([RecostRequests.fetchQueues(), Programs.all(), preload.global()]);
    },
    async pendingChanges() {
      await Promise.all([PendingChanges.fetch(), preload.global()]);
    },
    async crossProgram() {
      await Promise.all([Programs.all(), preload.global()]);
      // Load styles for all costing programs
      const costingProgs = cache.programs.filter(p => p.status === 'Costing');
      await Promise.all(costingProgs.map(p => Styles.fetchByProgram(p.id)));
    },
    // Pull everything a vendor needs to render their dashboard and all
    // their styles across programs: assignments (filtered to self by the
    // server), styles, submissions, cell flags. One call per program but
    // fanned out in parallel.
    async vendorWorkspace() {
      await Promise.all([Programs.all(), preload.global()]);
      await Promise.all(cache.programs.map(async p => {
        try {
          await Promise.all([
            Assignments.fetchByProgram(p.id),
            Styles.fetchByProgram(p.id),
            Submissions.fetchByProgram(p.id),
          ]);
        } catch (_) { /* program the vendor isn't on will 403 — ignore */ }
      }));
      // Flags live on submissions — load after submissions are cached.
      const subs = Object.values(cache.submissions).flat();
      await Promise.all(subs.map(s => CellFlags.fetchBySubmission(s.id).catch(() => {})));
    },
  };

  // ── Public API ────────────────────────────────────────────────

  return {
    Auth, Session,
    CooRates, BrandTierMargins, InternalPrograms, Customers, Departments, Users, PCUsers,
    Programs, Styles, TradingCompanies, Assignments,
    Submissions, Placements, CustomerAssignments, CustomerBuys,
    StyleLinks, DesignChanges, RecostRequests, CellFlags, Revisions,
    PendingChanges, DesignHandoffs, FabricLibrary, SalesRequests, CostHistory,
    calcLDP, computeTargetLDP, parseCSV, csvRowToStyle,
    cache, preload,
  };
})();
