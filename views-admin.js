// ============================================================
// ADMIN VIEWS — programs, styles, trading companies, COO, comparison
// "Vendor" is replaced by "Trading Company" (TC) throughout.
// ============================================================

const AdminViews = (() => {

  let _programsView = 'cards'; // 'cards' | 'table'
  const _collapsedTCs = new Set(); // colKeys of collapsed TC groups
  let _collapsedTCsInitialized = false; // flag so we only auto-collapse on first load

  const fmt = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
  const fmtN = v => (v != null && !isNaN(v)) ? Number(v).toLocaleString() : '—';
  const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';

  function statusBadge(s) {
    const cls = { Costing: 'costing', Placed: 'placed', Cancelled: 'cancelled', open: 'pending', placed: 'placed', flagged: 'flagged', accepted: 'accepted', submitted: 'submitted', pending: 'pending' };
    return `<span class="badge badge-${cls[s] || 'pending'}">${s}</span>`;
  }

  // ── Programs ───────────────────────────────────────────────
  function renderPrograms() {
    const programs = DB.Programs.all();
    const isTable = _programsView === 'table';
    return `
    <div class="page-header">
      <div><h1 class="page-title">Programs</h1><p class="page-subtitle">All costing programs</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="view-toggle" style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <button id="prog-view-cards" class="btn btn-sm${isTable ? ' btn-ghost' : ' btn-primary'}" style="border-radius:0;border:none" onclick="App.setProgramsView('cards')">⊞ Cards</button>
          <button id="prog-view-table" class="btn btn-sm${isTable ? ' btn-primary' : ' btn-ghost'}" style="border-radius:0;border:none;border-left:1px solid var(--border)" onclick="App.setProgramsView('table')">≡ Table</button>
        </div>
        <button class="btn btn-primary" onclick="App.openProgramModal()">＋ New Program</button>
      </div>
    </div>
    <div class="filter-bar mb-3">
      <div class="search-input-wrap"><span class="search-icon">🔍</span><input class="form-input" id="prog-search" placeholder="Search programs…" oninput="App.filterPrograms()"></div>
      <select class="form-select" id="prog-status-filter" onchange="App.filterPrograms()" style="max-width:160px">
        <option value="">All Statuses</option><option>Costing</option><option>Placed</option><option>Cancelled</option>
      </select>
    </div>
    <div id="programs-grid" class="${isTable ? '' : 'grid-auto'}">
      ${isTable
        ? programsTable(programs, '', '')
        : (programs.length ? programs.map(p => programCard(p)).join('') : `<div class="empty-state"><div class="icon">📋</div><h3>No programs yet</h3><p>Create your first costing program.</p></div>`)}
    </div>`;
  }

  function programsTable(programs, search, statusFilter) {
    let rows = programs;
    if (search) rows = rows.filter(p => `${p.name} ${p.season || ''} ${p.year || ''}`.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter) rows = rows.filter(p => p.status === statusFilter);
    if (!rows.length) return `<div class="empty-state"><div class="icon">📋</div><h3>No programs match</h3></div>`;
    const thead = `<thead><tr>
      <th>Season</th><th>Year</th><th>Program</th><th>Status</th>
      <th style="text-align:center">Total # Styles</th>
      <th style="text-align:center">Total # Trade Cos.</th>
      <th style="text-align:center">Total Quoted</th>
      <th>Actions</th>
    </tr></thead>`;
    const tbody = rows.map(p => {
      const styleCount  = DB.Programs.styleCount(p.id);
      const tcCount     = DB.Programs.tcCount(p.id);
      const quotedCount = DB.Programs.quotedCount(p.id);
      return `<tr style="cursor:pointer" onclick="App.openProgram('${p.id}')">
        <td>${p.season || '—'}</td>
        <td>${p.year || '—'}</td>
        <td class="primary font-bold">${p.name}</td>
        <td>${statusBadge(p.status)}</td>
        <td style="text-align:center"><span class="tag">${styleCount}</span></td>
        <td style="text-align:center"><span class="tag">${tcCount}</span></td>
        <td style="text-align:center"><span class="tag">${quotedCount}</span></td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">📋 Costs</button>
            <button class="btn btn-secondary btn-sm" onclick="App.navigate('styles','${p.id}')">Styles</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openProgramModal('${p.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteProgram('${p.id}')">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    return `<div class="card" style="padding:0"><div class="table-wrap"><table id="programs-tbl">${thead}<tbody>${tbody}</tbody></table></div></div>`;
  }

  function programCard(p) {
    const styleCount = DB.Programs.styleCount(p.id);
    const tcCount = DB.Programs.tcCount(p.id);
    const quotedCount = DB.Programs.quotedCount(p.id);
    return `
    <div class="program-card status-${p.status.toLowerCase()}" onclick="App.openProgram('${p.id}')" data-name="${p.name.toLowerCase()}" data-status="${p.status}">
      <div class="program-card-header">
        <div><div class="program-name">${p.name}</div><div class="program-meta">${[p.season, p.year, p.retailer, p.market].filter(Boolean).join(' · ')}</div></div>
        ${statusBadge(p.status)}
      </div>
      <div class="program-stats">
        <div class="stat-item"><div class="stat-label">Styles</div><div class="stat-value">${styleCount}</div></div>
        <div class="stat-item"><div class="stat-label">Trade Cos.</div><div class="stat-value">${tcCount}</div></div>
        <div class="stat-item"><div class="stat-label">Quoted</div><div class="stat-value">${quotedCount}</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px" onclick="event.stopPropagation()">
        <button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">📋 Costs</button>
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('styles','${p.id}')">Styles</button>
        <button class="btn btn-secondary btn-sm" onclick="App.openProgramModal('${p.id}')">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="App.openAssignTCs('${p.id}')">🏭 Assign</button>
        <select class="form-select" style="padding:5px 10px;font-size:0.78rem;flex:1" onchange="App.updateProgramStatus('${p.id}',this.value)">
          <option ${p.status === 'Costing' ? 'selected' : ''}>Costing</option>
          <option ${p.status === 'Placed' ? 'selected' : ''}>Placed</option>
          <option ${p.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
        <button class="btn btn-danger btn-sm" onclick="App.deleteProgram('${p.id}')">🗑</button>
      </div>
    </div>`;
  }

  // ── Style Manager ──────────────────────────────────────────
  function renderStyleManager(programId) {
    const prog = DB.Programs.get(programId);
    const styles = DB.Styles.byProgram(programId);
    const tcs = DB.Assignments.byProgram(programId);
    return `
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('programs')">← Programs</button>
          <span class="text-muted">/</span>
          <button class="btn btn-ghost btn-sm" onclick="App.openProgram('${programId}')">${prog.name}</button>
          <span class="text-muted">/</span>
          <span class="text-secondary text-sm">Styles</span>
        </div>
        <h1 class="page-title">Styles</h1>
        <p class="page-subtitle">${statusBadge(prog.status)} ${styles.length} styles · ${tcs.length} trading companies</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="App.openProgram('${programId}')">📋 Cost Summary</button>
        <button class="btn btn-secondary" onclick="App.openAssignTCs('${programId}')">🏭 Assign Trading Cos.</button>
        <button class="btn btn-secondary" onclick="App.downloadTemplate()">⬇ Template</button>
        <button class="btn btn-secondary" onclick="App.openUploadModal('${programId}')">📤 Bulk Upload</button>
        <button class="btn btn-primary" onclick="App.openStyleModal('${programId}')">＋ Add Style</button>
      </div>
    </div>
    ${tcs.length === 0 ? `<div class="alert alert-warning mb-3">⚠ No trading companies assigned. <button class="btn btn-warning btn-sm" onclick="App.openAssignTCs('${programId}')">Assign Now</button></div>` : ''}
    <div class="card">
      <div class="table-controls" id="style-table-controls"></div>
      <div class="table-wrap" id="style-table-wrap">
        <table id="style-table">
          <thead><tr>
            <th data-col="styleNum">Style #</th><th data-col="styleName">Style Name</th>
            <th data-col="cat">Category</th><th data-col="fab">Fabrication</th>
            <th data-col="qty">Proj Qty</th><th data-col="sell">Proj Sell</th>
            <th data-col="ldp">Target LDP</th><th data-col="duty">Duty Rate</th>
            <th data-col="quotes">Quotes</th><th data-col="status">Status</th><th data-col="actions">Actions</th>
          </tr></thead>
          <tbody>
            ${styles.length ? styles.map(s => styleRow(s, prog)).join('') : `<tr><td colspan="11" class="text-center text-muted" style="padding:40px">No styles yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function styleRow(s, prog) {
    const subs = DB.Submissions.byStyle(s.id);
    const targetLDP = DB.computeTargetLDP(s, prog);
    const flagged = subs.filter(x => x.status === 'flagged').length;
    const bestLDP = subs.reduce((best, sub) => {
      if (!sub.fob) return best;
      const r = DB.calcLDP(parseFloat(sub.fob), s, sub.coo, s.market || 'USA', 'NY', sub.paymentTerms, sub.factoryCost);
      return (r && (best === null || r.ldp < best)) ? r.ldp : best;
    }, null);
    const cooRate = DB.CooRates.get(s.defaultCoo || 'KH');
    const totalDuty = ((s.dutyRate || 0) + (cooRate?.addlDuty || 0)) * 100;
    return `<tr>
      <td data-col="styleNum" class="primary">${s.styleNumber}</td>
      <td data-col="styleName">${s.styleName}</td>
      <td data-col="cat">${s.category || '—'}</td>
      <td data-col="fab" class="text-sm">${(s.fabrication || '').substring(0, 35)}${(s.fabrication || '').length > 35 ? '…' : ''}</td>
      <td data-col="qty">${fmtN(s.projQty)}</td>
      <td data-col="sell">${fmt(s.projSellPrice)}</td>
      <td data-col="ldp"><span class="text-accent font-bold">${targetLDP ? fmt(targetLDP) : '—'}</span>
        ${bestLDP ? `<div class="text-sm mt-1 ${targetLDP && bestLDP <= targetLDP ? 'text-success' : 'text-warning'}">Best: ${fmt(bestLDP)}</div>` : ''}
      </td>
      <td data-col="duty">${s.dutyRate ? (s.dutyRate * 100).toFixed(1) + '%' : '—'}</td>
      <td data-col="quotes"><span class="tag">${subs.length}</span>${flagged ? ` <span class="badge badge-flagged">${flagged}🚩</span>` : ''}</td>
      <td data-col="status">${statusBadge(s.status || 'open')}</td>
      <td data-col="actions">
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openCostComparison('${s.id}')">📊</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openStyleModal('${s.programId}','${s.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteStyle('${s.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }

  // ── Cost Summary Matrix ────────────────────────────────────
  function renderCostSummary(programId) {
    const prog = DB.Programs.get(programId);
    const styles = DB.Styles.byProgram(programId);
    const asgns = DB.Assignments.byProgram(programId);
    const tcs = asgns.map(a => a.tc).filter(Boolean);
    // Build (TC, COO) column list: one column group per TC×COO combination
    const colGroups = tcs.flatMap(tc => tc.coos.map(coo => ({ tc, coo })));

    return `
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('programs')">← Programs</button>
          <span class="text-muted">/</span>
          <span class="text-secondary text-sm">${prog.name}</span>
        </div>
        <h1 class="page-title">${prog.name} — Cost Summary</h1>
        <p class="page-subtitle">${statusBadge(prog.status)} ${styles.length} styles · ${tcs.length} trading companies · <em>Click any editable cell to type directly</em></p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-secondary" onclick="App.navigate('styles','${programId}')">📝 Styles</button>
        <button class="btn btn-secondary" onclick="App.openAssignTCs('${programId}')">🏭 Trading Cos.</button>
        <button class="btn btn-ghost btn-sm" onclick="App.expandAllTCs('${programId}')" title="Expand all vendor columns">⊞ Expand All</button>
        <button class="btn btn-ghost btn-sm" onclick="App.collapseAllTCs('${programId}')" title="Collapse all vendor columns">⊟ Collapse All</button>
        <button class="btn btn-primary" onclick="App.openStyleModal('${programId}')">＋ Add Style</button>
        <button class="btn btn-success" onclick="App.placeAllStyles('${programId}')" title="Place all styles and mark program as Placed">🏆 Mark as Placed</button>
      </div>
    </div>
    ${tcs.length === 0 ? `<div class="alert alert-warning">No trading companies assigned. <button class="btn btn-warning btn-sm" onclick="App.openAssignTCs('${programId}')">Assign</button></div>` : ''}
    <div class="card" style="padding:0;overflow:hidden">
      <div class="cs-filter-bar" id="cs-filter-bar">
        <label class="cs-filter-label">Sort</label>
        <select id="cs-sort-by" class="form-select cs-select" onchange="App.refreshCostSummary('${programId}')">
          <option value="">Default</option>
          <option value="styleNum">Style #</option>
          <option value="fabrication">Fabrication</option>
        </select>
        <label class="cs-filter-label" style="margin-left:12px">Group by</label>
        <select id="cs-group-by" class="form-select cs-select" onchange="App.refreshCostSummary('${programId}')">
          <option value="">None</option>
          <option value="fabrication">Fabrication</option>
        </select>
      </div>
      <div class="table-controls" id="summary-table-controls"></div>
      <div class="matrix-scroll-wrap" id="summary-table-wrap">
        ${buildCostMatrix(styles, colGroups, prog, programId, '', '')}
      </div>
    </div>`;
  }

  // colGroups = [{tc, coo}] — one column group per TC×COO
  function buildCostMatrix(styles, colGroups, prog, programId, sortBy, groupBy) {
    if (!styles.length) return `<div class="empty-state" style="padding:40px"><div class="icon">📋</div><h3>No styles yet</h3></div>`;
    // Auto-collapse all TC columns on first load
    if (!_collapsedTCsInitialized) {
      colGroups.forEach(({ tc, coo }) => _collapsedTCs.add(`${tc.id}_${coo}`));
      _collapsedTCsInitialized = true;
    }
    if (!colGroups.length) return `<div class="empty-state" style="padding:40px"><div class="icon">🏭</div><h3>No trading companies assigned</h3><button class="btn btn-primary mt-3" onclick="App.openAssignTCs('${programId}')">Assign Trading Companies</button></div>`;

    // Header row 1: fixed cols + vendor group spans (draggable)
    let hdr1 = `
      <th rowspan="2" data-col="styleNum" class="sticky-col mat-hdr" style="width:60px;min-width:60px">Style #</th>
      <th rowspan="2" data-col="styleName" class="mat-hdr" style="width:72px;min-width:60px">Style Name</th>
      <th rowspan="2" data-col="cat" class="mat-hdr" style="width:68px;min-width:60px">Category</th>
      <th rowspan="2" data-col="fab" class="mat-hdr" style="width:72px;min-width:60px">Fabrication</th>
      <th rowspan="2" data-col="qty" class="mat-hdr" style="width:60px;min-width:60px">Proj Qty</th>
      <th rowspan="2" data-col="sell" class="mat-hdr" style="width:64px;min-width:60px">Proj Sell</th>
      <th rowspan="2" data-col="tldp" class="col-target mat-hdr" style="width:64px;min-width:60px">Target LDP</th>
      <th rowspan="2" data-col="dutyRate" class="col-duty-rate mat-hdr" style="width:60px;min-width:60px">Duty Rate</th>
      <th rowspan="2" data-col="estFreight" class="col-est-freight mat-hdr" style="width:64px;min-width:60px">Est Freight</th>
      <th rowspan="2" data-col="best" class="mat-hdr col-best" style="width:68px;min-width:60px">Best TC</th>`;
    const TERMS_LIST = ['FOB', 'CIF', 'First Sale', 'FCA', 'Duty Free', 'CPTPP'];
    colGroups.forEach(({ tc, coo }, tcIdx) => {
      const colKey = `${tc.id}_${coo}`;
      const collapsed = _collapsedTCs.has(colKey);
      const colspan = collapsed ? 2 : 6;
      const tcTerms = tc.paymentTerms || 'FOB';
      const termsSelect = `<select class="cell-select" style="margin-top:4px;font-size:0.7rem" onchange="App.saveTCTermsInline('${tc.id}','${programId}',this)">${TERMS_LIST.map(t => `<option${tcTerms === t ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
      const chevron = collapsed ? '▶' : '▼';
      const tcColorClass = tcIdx % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
      hdr1 += `<th colspan="${colspan}" class="vendor-group-hdr mat-hdr ${tcColorClass}" draggable="true" data-colkey="${colKey}">
        <span class="drag-grip">⠿</span> ${tc.code} — ${coo}
        <button class="tc-collapse-btn" title="${collapsed ? 'Expand' : 'Collapse'} detail columns" onclick="event.stopPropagation();App.toggleTCCols('${colKey}','${programId}')">${chevron}</button>
        <button class="tc-remove-btn" title="Remove ${tc.code} from this program" onclick="event.stopPropagation();App.removeTCFromProgram('${tc.id}','${programId}')">✕</button>
        <div class="text-muted" style="font-size:0.65rem;font-weight:400">${tc.name}</div>
        ${collapsed ? '' : termsSelect}
      </th>`;
    });
    hdr1 += `<th rowspan="2" data-col="actions" class="mat-hdr"></th>`;

    // Header row 2: sub-column labels
    let hdr2 = '';
    colGroups.forEach(({ tc, coo }, tcIdx) => {
      const k = `${tc.id}_${coo}`;
      const collapsed = _collapsedTCs.has(k);
      const hide = collapsed ? ' style="display:none"' : '';
      const tcColorClass = tcIdx % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
      hdr2 += `
        <th data-col="${k}_fob"      class="col-vendor-sub ${tcColorClass}" style="width:60px;min-width:60px">FOB</th>
        <th data-col="${k}_fc"       class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hide} style="width:60px;min-width:60px">Factory</th>
        <th data-col="${k}_duty_pct" class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hide} style="width:60px;min-width:60px">Duty %</th>
        <th data-col="${k}_duty_amt" class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hide} style="width:60px;min-width:60px">Duty Amt</th>
        <th data-col="${k}_freight"  class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hide} style="width:60px;min-width:60px">Freight/ unit</th>
        <th data-col="${k}_ldp"      class="col-vendor-sub col-ldp ${tcColorClass}" style="width:60px;min-width:60px">LDP/ unit</th>`;
    });



    // Separate active and cancelled styles
    let activeStyles = styles.filter(s => s.status !== 'cancelled');
    const cancelledStyles = styles.filter(s => s.status === 'cancelled');

    // Apply sort
    if (sortBy === 'styleNum') {
      activeStyles = [...activeStyles].sort((a, b) => (a.styleNumber || '').localeCompare(b.styleNumber || '', undefined, { numeric: true }));
    } else if (sortBy === 'fabrication') {
      activeStyles = [...activeStyles].sort((a, b) => (a.fabrication || '').localeCompare(b.fabrication || ''));
    }

    // Build data rows
    function buildRows(styleList, isCancelled) {
      return styleList.map(s => {
        const allSubs = DB.Submissions.byStyle(s.id);
        const targetLDP = DB.computeTargetLDP(s, prog);
        let bestLDP = null, bestKey = null;
        colGroups.forEach(({ tc, coo }) => {
          const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
          if (sub?.fob) {
            const r = DB.calcLDP(parseFloat(sub.fob), s, coo, s.market || 'USA', 'NY', tc.paymentTerms || sub?.paymentTerms || 'FOB', sub?.factoryCost);
            if (r && (bestLDP === null || r.ldp < bestLDP)) { bestLDP = r.ldp; bestKey = `${tc.id}_${coo}`; }
          }
        });

        const pid = programId;

        // Fixed style-level inline fields
        const styleNameInput = `<input class="cell-input cell-input-wide" data-sid="${s.id}" data-field="styleName" value="${(s.styleName || '').replace(/"/g, '&quot;')}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
        const catInput = `<input class="cell-input" data-sid="${s.id}" data-field="category"    value="${(s.category || '').replace(/"/g, '&quot;')}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
        const fabInput = `<input class="cell-input cell-input-wide" data-sid="${s.id}" data-field="fabrication"  value="${(s.fabrication || '').replace(/"/g, '&quot;').substring(0, 40)}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
        const qtyFmt    = s.projQty      ? Number(s.projQty).toLocaleString()                                  : '';
        const sellFmt   = s.projSellPrice ? '$' + parseFloat(s.projSellPrice).toFixed(2)                        : '';
        const dutyFmt   = s.dutyRate      ? (parseFloat(s.dutyRate) * 100).toFixed(1) + '%'                     : '';
        const frtFmt    = s.estFreight     ? '$' + parseFloat(s.estFreight).toFixed(2)                          : '';
        const qtyInput = `<input class="cell-input cell-input-sm fmt-qty" data-sid="${s.id}" data-field="projQty" data-raw="${s.projQty || ''}" value="${qtyFmt}" placeholder="Qty" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurQty(this,'${s.id}')" onkeydown="if(event.key==='Enter')this.blur()">`;
        const sellInput = `<input class="cell-input cell-input-sm fmt-sell" data-sid="${s.id}" data-field="projSellPrice" data-raw="${s.projSellPrice || ''}" value="${sellFmt}" placeholder="Sell" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurCurrency(this,'${s.id}','projSellPrice')" onkeydown="if(event.key==='Enter')this.blur()">`;
        const dutyInput = `<input class="cell-input cell-input-sm fmt-duty" data-sid="${s.id}" data-field="dutyRate" data-raw="${s.dutyRate || ''}" value="${dutyFmt}" placeholder="e.g. 28.2%" onfocus="App.fmtFocusDuty(this)" onblur="App.fmtBlurDuty(this,'${s.id}')" onkeydown="if(event.key==='Enter')this.blur()" title="Enter duty rate as % (e.g. 28.2) or decimal (e.g. 0.282)">`;
        const freightInput = `<input class="cell-input cell-input-sm fmt-freight" data-sid="${s.id}" data-field="estFreight" data-raw="${s.estFreight || ''}" value="${frtFmt}" placeholder="$0.00" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurCurrency(this,'${s.id}','estFreight')" onkeydown="if(event.key==='Enter')this.blur()" title="Est base freight per unit">`;

        const bestGroup = colGroups.find(g => `${g.tc.id}_${g.coo}` === bestKey);
        let rowHtml = `
          <td data-col="styleNum" class="sticky-col mat-cell-white">${s.styleNumber}</td>
          <td data-col="styleName" class="mat-cell-white mat-cell-normal">${styleNameInput}</td>
          <td data-col="cat" class="mat-cell-white mat-cell-normal">${catInput}</td>
          <td data-col="fab" class="mat-cell-white mat-cell-normal">${fabInput}</td>
          <td data-col="qty" class="mat-cell-white">${qtyInput}</td>
          <td data-col="sell" class="mat-cell-white">${sellInput}</td>
          <td data-col="tldp" class="col-target font-bold text-accent">${fmt(targetLDP)}</td>
          <td data-col="dutyRate" class="col-duty-rate mat-cell-white">${dutyInput}</td>
          <td data-col="estFreight" class="col-est-freight mat-cell-white">${freightInput}</td>
          <td data-col="best" class="text-sm col-best">${bestGroup ? `<span class="tag ${targetLDP ? (bestLDP <= targetLDP ? 'tag-success' : 'tag-danger') : ''}">${bestGroup.tc.code} - ${bestGroup.coo}</span>` : '—'}
          </td>`;

        colGroups.forEach(({ tc, coo }, tcIdx) => {
          const k = `${tc.id}_${coo}`;
          const tcColorClass = tcIdx % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
          const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
          // Use TC-level payment terms (falls back to submission terms for backward compat, then 'FOB')
          const effectiveTerms = tc.paymentTerms || sub?.paymentTerms || 'FOB';
          const r = sub?.fob ? DB.calcLDP(parseFloat(sub.fob), s, coo, s.market || 'USA', 'NY', effectiveTerms, sub?.factoryCost) : null;
          const isBest = r && k === bestKey;
          const over = r && targetLDP && r.ldp > targetLDP;
          const flagIcon = sub?.status === 'flagged' ? ' 🚩' : sub?.status === 'accepted' ? ' ✅' : '';

          const fobInput = `<input class="cell-input" type="number" step="0.01"
            data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="fob"
            value="${sub?.fob || ''}"
            placeholder="FOB"
            onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this)"
            onkeydown="if(event.key==='Enter')this.blur()">${flagIcon}`;

          const fcInput = `<input class="cell-input" type="number" step="0.01"
            data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="factoryCost"
            value="${sub?.factoryCost || ''}"
            placeholder="Cost"
            onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this)"
            onkeydown="if(event.key==='Enter')this.blur()">`;

          const dutyPct = r ? pct(r.dutyRate) : '—';
          const dutyAmt = r ? fmt(r.duty) : '—';
          const freightCell = r
            ? (r.freight != null ? fmt(r.freight) : `<span class="text-muted text-sm" title="Set Proj Qty to calc">N/A</span>`)
            : '—';
          const ldpCell = r
            ? `<span class="${isBest ? 'text-success font-bold' : ''}${over ? ' text-danger' : ''}">${fmt(r.ldp)}${isBest ? ' ★' : ''}</span>${r.noQty ? '<span class="text-muted text-sm" title="LDP excl. freight">*</span>' : ''}`
            : '<span class="text-muted">—</span>';

          const collapsed = _collapsedTCs.has(k);
          const hideStyle = collapsed ? ' style="display:none"' : '';
          rowHtml += `
          <td data-col="${k}_fob"      class="col-vendor-sub ${tcColorClass}">${fobInput}</td>
          <td data-col="${k}_fc"       class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${fcInput}</td>
          <td data-col="${k}_duty_pct"  class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyPct}</td>
          <td data-col="${k}_duty_amt"  class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyAmt}</td>
          <td data-col="${k}_freight"   class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${freightCell}</td>
          <td data-col="${k}_ldp"       class="col-vendor-sub col-ldp ${tcColorClass} ${isBest ? 'cell-best' : ''} ${over ? 'cell-over' : ''}">` + ldpCell + `</td>`;
        });

        // Actions column
        if (isCancelled) {
          rowHtml += `<td data-col="actions"><button class="btn-restore-style" onclick="App.uncancelStyle('${s.id}','${pid}')">↩ Restore</button></td>`;
        } else {
          rowHtml += `<td data-col="actions"><button class="btn-cancel-style" onclick="App.cancelStyle('${s.id}','${pid}')">🚫 Cancel</button></td>`;
        }

        const rowClass = isCancelled ? 'row-cancelled' : '';
        return `<tr class="${rowClass}">${rowHtml}</tr>`;
      }).join('');
    }

    // Build active rows — optionally grouped
    let activeRows = '';
    const totalFixedCols = 10 + colGroups.length * 6 + 1;
    if (groupBy === 'fabrication') {
      const groups = {};
      const groupOrder = [];
      activeStyles.forEach(s => {
        const key = (s.fabrication || '—').trim() || '—';
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(s);
      });
      groupOrder.forEach(fab => {
        activeRows += `<tr class="cs-group-row"><td colspan="${totalFixedCols}">📁 ${fab} <span class="cs-group-count">(${groups[fab].length})</span></td></tr>`;
        activeRows += buildRows(groups[fab], false);
      });
    } else {
      activeRows = buildRows(activeStyles, false);
    }

    // Build cancelled section (collapsed by default)
    let cancelledSection = '';
    if (cancelledStyles.length > 0) {
      const cancelledRows = buildRows(cancelledStyles, true);
      const totalCols = 10 + colGroups.length * 6 + 1; // fixed (9) + best (1) + vendor sub-cols (6 each) + actions (1)
      cancelledSection = `
      <tr class="cancelled-toggle-row" id="cancelled-toggle" onclick="App.toggleCancelledRows()">
        <td colspan="${totalCols}">
          <span class="toggle-chevron">▶</span>
          🚫 Cancelled Styles (${cancelledStyles.length})
        </td>
      </tr>
      <tbody id="cancelled-rows" style="display:none">
        ${cancelledRows}
      </tbody>`;
    }

    return `<table id="cost-summary-table">
      <thead>
        <tr class="hdr-row1">${hdr1}</tr>
        <tr class="hdr-row2">${hdr2}</tr>
      </thead>
      <tbody>${activeRows}</tbody>
      ${cancelledSection}
    </table>`;
  }

  // ── Cost Comparison (per style detail) ─────────────────────
  function renderCostComparison(styleId) {
    const style = DB.Styles.get(styleId);
    const prog = DB.Programs.get(style.programId);
    const asgns = DB.Assignments.byProgram(style.programId);
    const subs = DB.Submissions.byStyle(styleId);
    const placement = DB.Placements.get(styleId);
    const targetLDP = DB.computeTargetLDP(style, prog);

    let bestLDP = Infinity;
    subs.forEach(s => {
      if (s.fob) {
        const subTc = DB.TradingCompanies.get(s.tcId);
        const terms = subTc?.paymentTerms || s.paymentTerms || 'FOB';
        const r = DB.calcLDP(parseFloat(s.fob), style, s.coo, style.market || 'USA', 'NY', terms, s.factoryCost);
        if (r && r.ldp < bestLDP) bestLDP = r.ldp;
      }
    });

    const tcCooBlocks = asgns.flatMap(a => {
      if (!a.tc) return [];
      return a.tc.coos.map(coo => ({ tc: a.tc, coo, sub: subs.find(s => s.tcId === a.tc.id && s.coo === coo) || null }));
    });

    return `
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('cost-summary','${style.programId}')">← ${prog.name}</button>
        </div>
        <h1 class="page-title">${style.styleNumber} — ${style.styleName}</h1>
        <p class="page-subtitle">${style.category || ''} · ${(style.fabrication || '').substring(0, 50)} · Sell: ${fmt(style.projSellPrice)} · Qty: ${fmtN(style.projQty)}</p>
      </div>
      ${targetLDP ? `<div class="card card-sm" style="text-align:center;min-width:130px"><div class="text-sm text-muted">Target LDP</div><div class="font-bold text-accent" style="font-size:1.3rem">${fmt(targetLDP)}</div></div>` : ''}
    </div>
    ${placement ? `<div class="alert alert-success mb-3">🏆 Placed with <strong>${DB.TradingCompanies.get(placement.tcId)?.code || ''} (${placement.coo})</strong> at ${fmt(placement.confirmedFob)} FOB</div>` : ''}
    ${tcCooBlocks.length === 0
        ? `<div class="empty-state"><div class="icon">🏭</div><h3>No trading companies assigned</h3><button class="btn btn-primary mt-3" onclick="App.openAssignTCs('${style.programId}')">Assign Trading Companies</button></div>`
        : `<div class="grid-auto">${tcCooBlocks.map(b => tcBlock(b.tc, b.coo, b.sub, style, bestLDP < Infinity ? bestLDP : null, placement, targetLDP)).join('')}</div>`}`;
  }

  function tcBlock(tc, coo, sub, style, bestLDP, placement, targetLDP) {
    const isPlaced = placement?.tcId === tc.id && placement?.coo === coo;
    if (!sub) return `
    <div class="vendor-block">
      <div class="vendor-block-header">
        <div><div class="vendor-block-name">${tc.code} — ${coo}</div><div class="vendor-block-coo">${tc.name}</div></div>
        <span class="badge badge-pending">Not Quoted</span>
      </div>
      <div class="no-quote-placeholder"><div class="icon">⏳</div><p>No quote yet for this COO</p>
        <button class="btn btn-secondary btn-sm mt-3" onclick="App.openAdminCostEntry('${style.id}','${tc.id}','${coo}')">✏ Enter Cost</button>
      </div>
    </div>`;

    const effectiveTerms = tc.paymentTerms || sub.paymentTerms || 'FOB';
    const r = sub.fob ? DB.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', effectiveTerms, sub.factoryCost) : null;
    const isBest = r && bestLDP !== null && Math.abs(r.ldp - bestLDP) < 0.001;
    const withinTarget = r && targetLDP && r.ldp <= targetLDP;

    return `
    <div class="vendor-block ${isBest ? 'best-price' : ''} ${sub.status === 'flagged' ? 'flagged-block' : ''}">
      ${isBest ? '<div class="best-price-banner">★ Best Price</div>' : ''}
      <div class="vendor-block-header">
        <div><div class="vendor-block-name">${tc.code} — ${coo}</div><div class="vendor-block-coo">${tc.name} · <span class="badge badge-costing" style="font-size:0.7rem">${effectiveTerms}</span></div></div>
        ${statusBadge(isPlaced ? 'Placed' : sub.status)}
      </div>
      <div class="cost-grid">
        <div class="cost-item"><div class="cost-item-label">FOB</div><div class="cost-item-value">${fmt(sub.fob)}</div></div>
        <div class="cost-item"><div class="cost-item-label">Factory Cost</div><div class="cost-item-value">${fmt(sub.factoryCost) || '—'}</div></div>
        <div class="cost-item"><div class="cost-item-label">TC Markup</div><div class="cost-item-value">${sub.tcMarkup ? (parseFloat(sub.tcMarkup) * 100).toFixed(1) + '%' : '—'}</div></div>
        <div class="cost-item"><div class="cost-item-label">MOQ</div><div class="cost-item-value">${fmtN(sub.moq) || '—'}</div></div>
        ${r ? `<div class="cost-item"><div class="cost-item-label">Duty %</div><div class="cost-item-value">${pct(r.dutyRate)}</div></div>` : ''}
        ${r ? `<div class="cost-item"><div class="cost-item-label">Duty/unit</div><div class="cost-item-value">${fmt(r.duty)}</div></div>` : ''}
        ${r ? `<div class="cost-item"><div class="cost-item-label">Freight/unit</div><div class="cost-item-value">${r.freight != null ? fmt(r.freight) : 'Set Proj Qty'}</div></div>` : ''}
      </div>
      <div style="padding:10px 0;border-top:1px solid var(--border);margin-bottom:14px">
        <div class="cost-item-label">LDP/unit</div>
        <div class="cost-item-value ldp ${isBest ? 'best' : ''}">${r ? fmt(r.ldp) : '—'}${r?.noQty ? '<span class="text-muted text-sm"> *excl freight</span>' : ''}</div>
        ${targetLDP && r ? `<div class="text-sm mt-1 ${withinTarget ? 'text-success' : 'text-danger'}">${withinTarget ? '✓ Within target' : '▲ ' + fmt(r.ldp - targetLDP) + ' over target'}</div>` : ''}
      </div>
      ${sub.vendorComments ? `<div class="flag-comment" style="background:rgba(148,163,184,0.08);color:var(--text-secondary);border-color:var(--border)">💬 ${sub.vendorComments}</div>` : ''}
      ${sub.status === 'flagged' && sub.flagReason ? `<div class="flag-comment">🚩 ${sub.flagReason}</div>` : ''}
      <div class="vendor-block-actions mt-3">
        ${isPlaced
        ? `<button class="btn btn-danger btn-sm" onclick="App.unplaceStyle('${style.id}')">Unplace</button>`
        : `<button class="btn btn-success btn-sm" onclick="App.placeStyle('${style.id}','${tc.id}','${coo}',${sub.fob})">🏆 Place</button>
             <button class="btn btn-secondary btn-sm" onclick="App.openAdminCostEntry('${style.id}','${tc.id}','${coo}')">✏ Edit</button>
             ${sub.status === 'flagged' ? `<button class="btn btn-secondary btn-sm" onclick="App.unflagSub('${sub.id}')">Clear Flag</button>` : `<button class="btn btn-warning btn-sm" onclick="App.openFlagModal('${sub.id}')">🚩 Flag</button>`}
             ${sub.status !== 'accepted' ? `<button class="btn btn-secondary btn-sm" onclick="App.acceptSub('${sub.id}')">✅ Accept</button>` : ''}`}
      </div>
    </div>`;
  }

  // ── Cross-Program ──────────────────────────────────────────
  function renderCrossProgram() {
    const programs = DB.Programs.all().filter(p => p.status === 'Costing');
    const allStyles = DB.Styles.all().filter(s => programs.some(p => p.id === s.programId));
    return `
    <div class="page-header">
      <div><h1 class="page-title">All Open Programs</h1><p class="page-subtitle">${allStyles.length} styles across ${programs.length} active programs</p></div>
    </div>
    <div class="filter-bar">
      <div class="search-input-wrap"><span class="search-icon">🔍</span><input class="form-input" id="cp-search" placeholder="Search style, fabric…" oninput="App.filterCrossProgram()"></div>
      <select class="form-select" id="cp-program" onchange="App.filterCrossProgram()" style="max-width:200px">
        <option value="">All Programs</option>${programs.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
      <select class="form-select" id="cp-groupby" onchange="App.filterCrossProgram()" style="max-width:160px">
        <option value="">No Grouping</option>
        <option value="program">Group by Program</option>
        <option value="fabric">Group by Fabrication</option>
        <option value="category">Group by Category</option>
      </select>
      <select class="form-select" id="cp-sort" onchange="App.filterCrossProgram()" style="max-width:160px">
        <option value="">Default</option>
        <option value="style">Sort: Style #</option>
        <option value="fabric">Sort: Fabrication</option>
        <option value="ldp">Sort: Best LDP</option>
        <option value="program">Sort: Program</option>
      </select>
    </div>
    <div class="card">
      <div class="table-controls" id="cp-table-controls"></div>
      <div class="table-wrap" id="cross-program-table">${crossProgramTable(allStyles, programs, '', '', '', '', '')}</div>
    </div>`;
  }

  function crossProgramTable(styles, programs, search, programFilter, vendorFilter, groupBy, sortBy) {
    let rows = styles.map(s => {
      const prog = programs.find(p => p.id === s.programId);
      const subs = DB.Submissions.byStyle(s.id);
      const targetLDP = DB.computeTargetLDP(s, prog);
      let bestLDP = null, bestTC = null;
      subs.forEach(sub => {
        if (sub.fob) { const r = DB.calcLDP(parseFloat(sub.fob), s, sub.coo, s.market || 'USA', 'NY', sub.paymentTerms, sub.factoryCost); if (r && (bestLDP === null || r.ldp < bestLDP)) { bestLDP = r.ldp; bestTC = sub.tcId; } }
      });
      const bestTCObj = DB.TradingCompanies.get(bestTC);
      return { ...s, prog, subs, bestLDP, bestTC: bestTCObj, targetLDP };
    });

    if (search) rows = rows.filter(r => `${r.styleNumber} ${r.styleName} ${r.fabrication} ${r.category}`.toLowerCase().includes(search.toLowerCase()));
    if (programFilter) rows = rows.filter(r => r.programId === programFilter);
    if (sortBy === 'style') rows.sort((a, b) => (a.styleNumber || '').localeCompare(b.styleNumber || ''));
    else if (sortBy === 'fabric') rows.sort((a, b) => (a.fabrication || '').localeCompare(b.fabrication || ''));
    else if (sortBy === 'ldp') rows.sort((a, b) => (a.bestLDP || 999) - (b.bestLDP || 999));
    else if (sortBy === 'program') rows.sort((a, b) => (a.prog?.name || '').localeCompare(b.prog?.name || ''));

    const grouped = {};
    rows.forEach(r => {
      const key = groupBy === 'program' ? r.prog?.name || '?' : groupBy === 'fabric' ? r.fabrication || '?' : groupBy === 'category' ? r.category || '?' : 'All';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    if (!rows.length) return `<div class="empty-state"><div class="icon">🔎</div><h3>No results</h3></div>`;

    let html = `<table id="cp-table"><thead><tr>
      <th data-col="prog">Program</th><th data-col="sn">Style #</th><th data-col="name">Style Name</th>
      <th data-col="fab">Fabrication</th><th data-col="cat">Category</th>
      <th data-col="sell">Proj Sell</th><th data-col="ldp">Target LDP</th>
      <th data-col="q">Quotes</th><th data-col="best">Best LDP</th>
      <th data-col="bestV">Best TC</th><th data-col="status">Status</th><th data-col="actions"></th>
    </tr></thead><tbody>`;
    Object.entries(grouped).forEach(([group, items]) => {
      if (groupBy) html += `<tr class="group-row"><td colspan="12">📁 ${group} (${items.length})</td></tr>`;
      items.forEach(r => {
        const onTarget = r.bestLDP && r.targetLDP && r.bestLDP <= r.targetLDP;
        html += `<tr>
          <td data-col="prog" class="text-sm">${r.prog?.name || '—'}</td>
          <td data-col="sn" class="primary">${r.styleNumber}</td>
          <td data-col="name">${r.styleName}</td>
          <td data-col="fab" class="text-sm">${(r.fabrication || '').substring(0, 28)}…</td>
          <td data-col="cat">${r.category || '—'}</td>
          <td data-col="sell">${fmt(r.projSellPrice)}</td>
          <td data-col="ldp" class="text-accent font-bold">${fmt(r.targetLDP)}</td>
          <td data-col="q"><span class="tag">${r.subs.length}</span></td>
          <td data-col="best" class="${onTarget ? 'text-success' : r.bestLDP ? 'text-danger' : ''} font-bold">${r.bestLDP ? fmt(r.bestLDP) : '—'}</td>
          <td data-col="bestV" class="font-bold ${r.bestTC && r.targetLDP ? (r.bestLDP <= r.targetLDP ? 'text-success' : 'text-danger') : 'text-sm'}">${r.bestTC ? r.bestTC.code : '—'}</td>
          <td data-col="status">${statusBadge(r.status || 'open')}</td>
          <td data-col="actions"><button class="btn btn-secondary btn-sm" onclick="App.openCostComparison('${r.id}')">Compare</button></td>
        </tr>`;
      });
    });
    return html + '</tbody></table>';
  }

  // ── Trading Company Manager ────────────────────────────────
  function renderTradingCompanies() {
    const tcs = DB.TradingCompanies.all();
    return `
    <div class="page-header">
      <div><h1 class="page-title">Trading Companies</h1><p class="page-subtitle">${tcs.length} trading companies · One login per company, multiple COOs</p></div>
      <button class="btn btn-primary" onclick="App.openTCModal()">＋ Add Trading Company</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>COOs</th><th>Terms</th><th>Login Email</th><th>Actions</th></tr></thead>
      <tbody>${tcs.length ? tcs.map(tc => `<tr>
        <td class="primary font-bold">${tc.code}</td>
        <td>${tc.name}</td>
        <td>${(tc.coos || []).map(c => `<span class="badge badge-pending" style="margin:2px">${c}</span>`).join('')}</td>
        <td><span class="badge badge-costing">${tc.paymentTerms || 'FOB'}</span></td>
        <td class="text-sm text-muted">${tc.email}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openTCModal('${tc.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteTC('${tc.id}')">🗑</button>
        </div></td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-center text-muted" style="padding:40px">No trading companies yet.</td></tr>`}
      </tbody>
    </table></div></div>`;
  }

  // ── Internal Programs ──────────────────────────────────────
  function renderInternalPrograms() {
    const items = DB.InternalPrograms.all();
    return `
    <div class="page-header">
      <div><h1 class="page-title">Internal Program Table</h1>
      <p class="page-subtitle">Program name templates with target margin — used for Target LDP calculations</p></div>
      <button class="btn btn-primary" onclick="App.openInternalProgramModal()">＋ Add</button>
    </div>
    <div class="alert alert-info mb-3">Target LDP = Proj Sell Price × Target Margin % — margin is not visible to trading companies</div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Program Name</th><th>Actions</th></tr></thead>
      <tbody>${items.map(ip => `<tr>
        <td class="primary font-bold">${ip.name}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openInternalProgramModal('${ip.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteInternalProgram('${ip.id}')">🗑</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  // ── COO Rate Table ─────────────────────────────────────────
  function renderCOO() {
    const rates = DB.CooRates.all();
    return `
    <div class="page-header">
      <div><h1 class="page-title">COO Rate Table</h1><p class="page-subtitle">Total container freight & duty by country of origin</p></div>
      <button class="btn btn-primary" onclick="App.openCooModal()">＋ Add COO</button>
    </div>
    <div class="alert alert-info mb-3">Freight values = total container cost (÷ Proj Qty to get per-unit freight in LDP)</div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Country</th><th>Addl Duty %</th><th>USA NY</th><th>USA LA</th><th>CA Toronto</th><th>CA Vancouver</th><th>Actions</th></tr></thead>
      <tbody>${rates.map(r => `<tr>
        <td class="primary font-bold">${r.code}</td><td>${r.country}</td>
        <td>${(r.addlDuty * 100).toFixed(1)}%</td>
        <td>$${Number(r.usaNY).toLocaleString()}</td><td>$${Number(r.usaLA).toLocaleString()}</td>
        <td>$${Number(r.caToronto).toLocaleString()}</td><td>$${Number(r.caVancouver).toLocaleString()}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openCooModal('${r.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteCoo('${r.id}')">🗑</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  // ── Pending Changes Approval Queue (Admin only) ──────────────
  function renderPendingChanges() {
    const all = DB.PendingChanges.all().slice().reverse(); // newest first
    const typeLabel = { tc: 'Trading Company', coo: 'COO Rate', 'internal-program': 'Internal Program', 'pc-user': 'PC User' };
    const actionLabel = { create: '＋ Create', update: '✏ Edit', delete: '🗑 Delete' };
    function summaryOf(c) {
      const d = c.data || {};
      if (c.type === 'tc')               return d.code ? `${d.code} — ${d.name || ''}` : JSON.stringify(d).slice(0, 60);
      if (c.type === 'coo')              return d.code ? `${d.code} — ${d.country || ''}` : JSON.stringify(d).slice(0, 60);
      if (c.type === 'internal-program') return d.name || JSON.stringify(d).slice(0, 60);
      if (c.type === 'pc-user')          return d.name ? `${d.name} (${d.email || ''})` : JSON.stringify(d).slice(0, 60);
      return JSON.stringify(d).slice(0, 60);
    }
    const rows = all.length ? all.map(c => {
      const isPending = c.status === 'pending';
      const statusBadgeHtml = c.status === 'pending'
        ? '<span class="badge badge-pending">Pending</span>'
        : c.status === 'approved'
          ? '<span class="badge badge-placed">Approved</span>'
          : '<span class="badge badge-cancelled">Rejected</span>';
      return `<tr class="${!isPending ? 'pc-reviewed-row' : ''}">
        <td>${statusBadgeHtml}</td>
        <td>${typeLabel[c.type] || c.type}</td>
        <td><span class="badge badge-costing">${actionLabel[c.action] || c.action}</span></td>
        <td class="text-sm">${summaryOf(c)}</td>
        <td class="text-sm text-muted">${c.proposedByName || '—'}</td>
        <td class="text-sm text-muted">${c.proposedAt ? new Date(c.proposedAt).toLocaleDateString() : '—'}</td>
        <td>
          ${isPending ? `
            <div style="display:flex;gap:6px">
              <button class="btn btn-success btn-sm" onclick="App.approvePendingChange('${c.id}')">✓ Approve</button>
              <button class="btn btn-danger btn-sm"  onclick="App.rejectPendingChange('${c.id}')">✗ Reject</button>
            </div>` : `<span class="text-muted text-sm">Reviewed</span>`}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="text-center text-muted" style="padding:40px">No proposals yet</td></tr>`;
    return `
    <div class="page-header">
      <div><h1 class="page-title">Pending Changes</h1>
        <p class="page-subtitle">Proposed setting changes from Production Coordinators awaiting your approval</p>
      </div>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Status</th><th>Type</th><th>Action</th><th>Summary</th>
            <th>Proposed By</th><th>Date</th><th>Review</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Staff Management (Admin only) ────────────────────────────
  function renderStaff() {
    const staff = DB.PCUsers.allStaff();
    return `
    <div class="page-header">
      <div><h1 class="page-title">Staff</h1><p class="page-subtitle">Admin and Production Coordinator accounts</p></div>
      <button class="btn btn-primary" onclick="App.openStaffModal()">＋ Add Production Coordinator</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>${staff.map(u => `<tr>
        <td class="font-bold">${u.name}</td>
        <td class="text-sm text-muted">${u.email}</td>
        <td>${u.role === 'admin' ? '<span class="badge badge-placed">Admin</span>' : '<span class="badge badge-costing">Production Coordinator</span>'}</td>
        <td><div style="display:flex;gap:6px">
          ${u.role !== 'admin' ? `
            <button class="btn btn-secondary btn-sm" onclick="App.openStaffModal('${u.id}')">✏</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteStaff('${u.id}')">🗑</button>` : '<span class="text-muted text-sm">Protected</span>'}
        </div></td>
      </tr>`).join('')}
      </tbody>
    </table></div></div>`;
  }

  // ── PC Propose-mode Settings Views ──────────────────────────
  function renderTradingCompaniesPC() {
    const tcs = DB.TradingCompanies.all();
    const pending = DB.PendingChanges.pending().filter(c => c.type === 'tc');
    return `
    <div class="page-header">
      <div><h1 class="page-title">Trading Companies</h1><p class="page-subtitle">Read-only — propose changes for Admin approval</p></div>
      <button class="btn btn-primary" onclick="App.openProposeTCModal()">＋ Propose New TC</button>
    </div>
    ${pending.length ? `<div class="alert alert-info mb-3">⏳ You have ${pending.filter(c=>c.action!=='delete').length} pending proposal(s) awaiting admin approval.</div>` : ''}
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>COOs</th><th>Terms</th><th>Email</th><th>Propose Edit</th></tr></thead>
      <tbody>${tcs.map(tc => {
        const hasPending = pending.some(c => c.data?.id === tc.id);
        return `<tr class="${hasPending ? 'proposal-row' : ''}">
          <td class="primary font-bold">${tc.code}${hasPending ? ' <span class="pending-inline-badge">⏳</span>' : ''}</td>
          <td>${tc.name}</td>
          <td>${(tc.coos||[]).map(c=>`<span class="badge badge-pending" style="margin:2px">${c}</span>`).join('')}</td>
          <td><span class="badge badge-costing">${tc.paymentTerms||'FOB'}</span></td>
          <td class="text-sm text-muted">${tc.email}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="App.openProposeTCModal('${tc.id}')">✏ Propose Edit</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div></div>`;
  }

  function renderInternalProgramsPC() {
    const ips = DB.InternalPrograms.all();
    const pending = DB.PendingChanges.pending().filter(c => c.type === 'internal-program');
    return `
    <div class="page-header">
      <div><h1 class="page-title">Internal Programs</h1><p class="page-subtitle">Read-only — propose changes for Admin approval</p></div>
      <button class="btn btn-primary" onclick="App.openProposeIPModal()">＋ Propose New Internal Program</button>
    </div>
    ${pending.length ? `<div class="alert alert-info mb-3">⏳ ${pending.length} pending proposal(s) awaiting admin approval.</div>` : ''}
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Program Name</th><th>Target Margin</th><th>Propose Edit</th></tr></thead>
      <tbody>${ips.map(ip => {
        const hasPending = pending.some(c => c.data?.id === ip.id);
        return `<tr class="${hasPending ? 'proposal-row' : ''}">
          <td class="primary font-bold">${ip.name}${hasPending ? ' <span class="pending-inline-badge">⏳</span>' : ''}</td>
          <td>${ip.targetMargin ? (ip.targetMargin*100).toFixed(1)+'%' : '—'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="App.openProposeIPModal('${ip.id}')">✏ Propose Edit</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div></div>`;
  }

  function renderCOOPC() {
    const rates = DB.CooRates.all();
    const pending = DB.PendingChanges.pending().filter(c => c.type === 'coo');
    return `
    <div class="page-header">
      <div><h1 class="page-title">COO Rate Table</h1><p class="page-subtitle">Read-only — propose changes for Admin approval</p></div>
      <button class="btn btn-primary" onclick="App.openProposeCOOModal()">＋ Propose New COO</button>
    </div>
    ${pending.length ? `<div class="alert alert-info mb-3">⏳ ${pending.length} pending proposal(s) awaiting admin approval.</div>` : ''}
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Country</th><th>Addl Duty %</th><th>USA Freight ×</th><th>CA Freight ×</th><th>Propose Edit</th></tr></thead>
      <tbody>${rates.map(r => {
        const hasPending = pending.some(c => c.data?.code === r.code);
        return `<tr class="${hasPending ? 'proposal-row' : ''}">
          <td class="primary font-bold">${r.code}${hasPending ? ' <span class="pending-inline-badge">⏳</span>' : ''}</td>
          <td>${r.country}</td>
          <td>${(r.addlDuty*100).toFixed(1)}%</td>
          <td>${r.usaMult ?? '—'}&times;</td>
          <td>${r.canadaMult ?? '—'}&times;</td>
          <td><button class="btn btn-secondary btn-sm" onclick="App.openProposeCOOModal('${r.id}')">✏ Propose Edit</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div></div>`;
  }

  function toggleTCCols(colKey, programId) {
    if (_collapsedTCs.has(colKey)) {
      _collapsedTCs.delete(colKey);
    } else {
      _collapsedTCs.add(colKey);
    }
    App.openProgram(programId);
  }

  function expandAllTCs(programId) {
    _collapsedTCs.clear();
    App.openProgram(programId);
  }

  function collapseAllTCs(programId) {
    const prog = DB.Programs.get(programId);
    const asgns = DB.Assignments.byProgram(programId);
    const tcs = asgns.map(a => a.tc).filter(Boolean);
    tcs.forEach(tc => tc.coos.forEach(coo => _collapsedTCs.add(`${tc.id}_${coo}`)));
    App.openProgram(programId);
  }

  const api = {
    renderPrograms, renderStyleManager, renderCostSummary, buildCostMatrix,
    renderCostComparison, renderCrossProgram,
    renderTradingCompanies, renderInternalPrograms, renderCOO,
    renderPendingChanges, renderStaff,
    renderTradingCompaniesPC, renderInternalProgramsPC, renderCOOPC,
    crossProgramTable, statusBadge, toggleTCCols, expandAllTCs, collapseAllTCs
  };
  Object.defineProperty(api, '_programsView', {
    get: () => _programsView,
    set: (v) => { _programsView = v; },
  });
  return api;

})();
