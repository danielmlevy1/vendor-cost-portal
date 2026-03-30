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

  // ── Dashboard ──────────────────────────────────────────────
  function renderDashboard(role) {
    const isAdmin   = role === 'admin';
    const isFinance = role === 'admin';

    const programs  = DB.Programs.all();
    const allStyles = DB.Styles.all();
    const allSubs   = DB.Submissions.all();
    const allRevs   = JSON.parse(localStorage.getItem('vcp_revisions') || '[]');
    const allFlags  = JSON.parse(localStorage.getItem('vcp_cell_flags') || '[]');
    const allPlacements = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const today     = new Date(); today.setHours(0,0,0,0);
    const in30      = new Date(today); in30.setDate(in30.getDate() + 30);

    // Program Health
    const progActive    = programs.filter(p => p.status === 'Costing').length;
    const progPlaced    = programs.filter(p => p.status === 'Placed').length;
    const progPastEnd   = programs.filter(p => p.endDate && new Date(p.endDate + 'T00:00:00') < today && p.status === 'Costing').length;

    // Style Progress (active programs only)
    const activeProgIds = new Set(programs.filter(p => p.status === 'Costing').map(p => p.id));
    const activeStyles  = allStyles.filter(s => activeProgIds.has(s.programId) && s.status !== 'cancelled');
    const totalStyles   = activeStyles.length;
    const costedStyles  = activeStyles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
    const placedStyles  = activeStyles.filter(s => allPlacements.some(pl => pl.styleId === s.id)).length;
    const projQtyTotal  = activeStyles.reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);
    const placedQtyTotal = activeStyles.filter(s => allPlacements.some(pl => pl.styleId === s.id))
                             .reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);

    // Action Items
    const flagCount     = allFlags.length;
    const pendingCount  = isAdmin ? DB.PendingChanges.pending().length : 0;
    const unreviewedCount = (() => {
      const seen = {};
      let count = 0;
      allRevs.forEach(r => {
        const k = `${r.subId}_${r.field}`;
        if (!seen[k]) { seen[k] = { ts: r.submittedAt || 0 }; }
        else if ((r.submittedAt || 0) > seen[k].ts) seen[k].ts = r.submittedAt || 0;
      });
      Object.entries(seen).forEach(([k, v]) => {
        const seenTs = parseInt(localStorage.getItem(`vcp_rev_seen_${k.replace('_', '_')}`) || '0');
        if (v.ts > seenTs) count++;
      });
      return count;
    })();
    const upcomingCRDs  = programs.filter(p => p.crdDate && (() => { const d = new Date(p.crdDate + 'T00:00:00'); return d >= today && d <= in30; })()).length;

    // Financials (admin/PC only)
    const placedSubs = allPlacements.map(pl => {
      const style = allStyles.find(s => s.id === pl.styleId);
      const sub = allSubs.find(s => s.styleId === pl.styleId && s.tcId === pl.tcId && s.coo === pl.coo);
      return { fob: parseFloat(sub?.fob || pl.confirmedFob || 0), qty: parseFloat(style?.projQty || 0) };
    }).filter(x => x.fob > 0);
    const avgFOB     = placedSubs.length ? placedSubs.reduce((s, x) => s + x.fob, 0) / placedSubs.length : 0;
    const totalSpend = placedSubs.reduce((s, x) => s + x.fob * x.qty, 0);

    const bar = (val, total, color = '#6366f1') => {
      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
      return `<div style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#94a3b8;margin-bottom:4px">
          <span>${val} / ${total}</span><span>${pct}%</span>
        </div>
        <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08)">
          <div style="height:6px;border-radius:3px;background:${color};width:${pct}%;transition:width .4s"></div>
        </div>
      </div>`;
    };

    const kpi = (icon, label, value, sub = '', color = '#6366f1', clickRoute = '') => `
      <div class="kpi-card" ${clickRoute ? `style="cursor:pointer" onclick="App.navigate('${clickRoute}')"` : ''}>
        <div class="kpi-icon" style="background:${color}22;color:${color}">${icon}</div>
        <div class="kpi-body">
          <div class="kpi-value">${value}</div>
          <div class="kpi-label">${label}</div>
          ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
        </div>
      </div>`;

    const alert = (icon, label, value, color, route) => `
      <div class="kpi-alert ${value > 0 ? 'kpi-alert-active' : ''}" ${route ? `style="cursor:pointer" onclick="App.navigate('${route}')"` : ''}>
        <span class="kpi-alert-icon" style="color:${color}">${icon}</span>
        <span class="kpi-alert-value" style="color:${value > 0 ? color : '#64748b'}">${value}</span>
        <span class="kpi-alert-label">${label}</span>
        ${route && value > 0 ? '<span class="kpi-alert-arrow">→</span>' : ''}
      </div>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">${today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
      </div>
    </div>

    <div class="kpi-section-label">Program Health</div>
    <div class="kpi-grid">
      ${kpi('🟢','Active Programs', progActive, 'Currently in costing', '#22c55e', 'programs')}
      ${kpi('📦','Programs Placed', progPlaced, 'Fully placed', '#6366f1', 'programs')}
      ${kpi('⚠️','Past End Date', progPastEnd, 'Still in costing', '#ef4444', 'programs')}
    </div>

    <div class="kpi-section-label" style="margin-top:28px">Style Progress — Active Programs</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      <div class="kpi-card-wide">
        <div class="kpi-wide-title">Styles Quoted</div>
        <div class="kpi-wide-big">${costedStyles} <span class="kpi-wide-of">/ ${totalStyles}</span></div>
        ${bar(costedStyles, totalStyles, '#6366f1')}
      </div>
      <div class="kpi-card-wide">
        <div class="kpi-wide-title">Styles Placed</div>
        <div class="kpi-wide-big">${placedStyles} <span class="kpi-wide-of">/ ${totalStyles}</span></div>
        ${bar(placedStyles, totalStyles, '#22c55e')}
      </div>
      <div class="kpi-card-wide">
        <div class="kpi-wide-title">Projected QTY Placed</div>
        <div class="kpi-wide-big">${placedQtyTotal.toLocaleString()} <span class="kpi-wide-of">/ ${projQtyTotal.toLocaleString()}</span></div>
        ${bar(placedQtyTotal, projQtyTotal, '#f59e0b')}
      </div>
    </div>

    <div class="kpi-section-label" style="margin-top:28px">Action Items</div>
    <div class="kpi-alerts">
      ${alert('🚩', 'Flagged Prices', flagCount, '#ef4444', '')}
      ${alert('🔔', 'Unreviewed Price Changes', unreviewedCount, '#f59e0b', '')}
      ${alert('📅', 'CRDs Within 30 Days', upcomingCRDs, '#6366f1', 'programs')}
      ${isAdmin ? alert('⏳', 'Pending Approvals', pendingCount, '#a855f7', 'pending-changes') : ''}
    </div>

    ${isFinance ? `
    <div class="kpi-section-label" style="margin-top:28px">Financials — Placed Styles Only</div>
    <div class="kpi-grid">
      ${kpi('💵','Avg FOB (Placed)', avgFOB > 0 ? '$' + avgFOB.toFixed(2) : '—', `${placedSubs.length} style${placedSubs.length !== 1 ? 's' : ''} placed`, '#22c55e')}
      ${kpi('💰','Est. Total Placed Spend', totalSpend > 0 ? '$' + totalSpend.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}) : '—', 'FOB × Proj QTY', '#6366f1')}
    </div>` : ''}`;
  }

  // ── Programs ───────────────────────────────────────────────
  function renderPrograms() {
    const programs = DB.Programs.all();
    return `
    <div class="page-header">
      <div><h1 class="page-title">Programs</h1><p class="page-subtitle">All costing programs</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="App.openProgramModal()">＋ New Program</button>
      </div>
    </div>
    <div class="filter-bar mb-3">
      <div class="search-input-wrap"><span class="search-icon">🔍</span><input class="form-input" id="prog-search" placeholder="Search programs…" oninput="App.filterPrograms()"></div>
      <select class="form-select" id="prog-status-filter" onchange="App.filterPrograms()" style="max-width:160px">
        <option value="">All Statuses</option><option>Costing</option><option>Placed</option><option>Cancelled</option>
      </select>
    </div>
    <div id="programs-grid">
      ${programsTable(programs, '', '')}
    </div>`;
  }

  function programsTable(programs, search, statusFilter) {
    let rows = programs;
    if (search) rows = rows.filter(p => `${p.name} ${p.season || ''} ${p.year || ''}`.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter) rows = rows.filter(p => p.status === statusFilter);
    if (!rows.length) return `<div class="empty-state"><div class="icon">📋</div><h3>No programs match</h3></div>`;
    const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const thead = `<thead><tr>
      <th>Season</th><th>Year</th><th>Program</th><th>Status</th>
      <th style="text-align:center">Styles</th>
      <th style="text-align:center">Costed</th>
      <th style="text-align:center">Placed</th>
      <th style="text-align:center">TTL Proj Qty</th>
      <th style="text-align:center">TTL Actual Qty</th>
      <th style="text-align:center">TCs</th>
      <th>Start Date</th><th>End Date</th><th>1st CRD</th>
      <th>Actions</th>
    </tr></thead>`;
    const tbody = rows.map(p => {
      const styles       = DB.Styles.byProgram(p.id);
      const styleCount   = styles.length;
      const tcCount      = DB.Programs.tcCount(p.id);
      const placements   = DB.Placements;
      const placedCount  = styles.filter(s => placements.get(s.id) != null).length;
      // Costed = styles that have at least one FOB submission
      const allSubs      = DB.Submissions.all();
      const costedCount  = styles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
      const projQtyTotal = styles.reduce((sum, s) => sum + (parseFloat(s.projQty)    || 0), 0);
      const actlQtyTotal = styles.reduce((sum, s) => sum + (parseFloat(s.actualQty)  || 0), 0);
      return `<tr style="cursor:pointer" onclick="App.openProgram('${p.id}')">
        <td>${p.season || '—'}</td>
        <td>${p.year || '—'}</td>
        <td class="primary font-bold">${p.name}</td>
        <td>${statusBadge(p.status)}</td>
        <td style="text-align:center"><span class="tag">${styleCount}</span></td>
        <td style="text-align:center"><span class="tag">${costedCount}</span></td>
        <td style="text-align:center"><span class="tag ${placedCount > 0 ? 'tag-success' : ''}">${placedCount}</span></td>
        <td style="text-align:center"><span class="tag">${projQtyTotal > 0 ? projQtyTotal.toLocaleString() : '—'}</span></td>
        <td style="text-align:center"><span class="tag">${actlQtyTotal > 0 ? actlQtyTotal.toLocaleString() : '—'}</span></td>
        <td style="text-align:center"><span class="tag">${tcCount}</span></td>
        <td class="text-sm">${fmtDate(p.startDate)}</td>
        <td class="text-sm">${fmtDate(p.endDate)}</td>
        <td class="text-sm">${fmtDate(p.crdDate)}</td>
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
    ${programTabBar(programId, 'cost', prog)}
    <div class="page-header" style="margin-top:12px">
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
          <option value="fabrication" selected>Fabrication</option>
        </select>
      </div>
      <div class="table-controls" id="summary-table-controls"></div>
      <div class="matrix-scroll-wrap" id="summary-table-wrap">
        ${buildCostMatrix(styles, colGroups, prog, programId, '', 'fabrication')}
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
      <th rowspan="2" data-col="actualQty" class="mat-hdr" style="width:72px;min-width:60px;border-left:2px solid var(--accent)" title="Sum of all customer buy QTYs from Buy Summary">Actual QTY</th>
      <th rowspan="2" data-col="wtdSell" class="mat-hdr" style="width:76px;min-width:60px" title="Revenue-weighted average sell price from Buy Summary">Wtd Avg Sell</th>
      <th rowspan="2" data-col="tldp" class="col-target mat-hdr" style="width:64px;min-width:60px">Target LDP</th>
      <th rowspan="2" data-col="dutyRate" class="col-duty-rate mat-hdr" style="width:60px;min-width:60px">Duty Rate</th>
      <th rowspan="2" data-col="estFreight" class="col-est-freight mat-hdr" style="width:64px;min-width:60px">Est Freight</th>
      <th rowspan="2" data-col="best" class="mat-hdr col-best" style="width:110px;min-width:100px;white-space:nowrap">Best TC</th>`;
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
    hdr1 += `<th rowspan="2" data-col="repeat" class="mat-hdr" style="min-width:160px;white-space:nowrap" title="Prior costing history for this style number">🔁 Repeat Style</th>`;

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

    // ── Precompute repeat-style lookup ─────────────────────────
    const _allStylesGlobal   = DB.Styles.all();
    const _allSubsGlobal     = DB.Submissions.all();
    const _allPlacements     = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const _allPrograms       = DB.Programs.all();
    // repeatHistory[styleNumber] = sorted array of {prog, tc, coo, fob, ldp}
    const repeatHistory = {};
    _allPlacements.forEach(pl => {
      const pastStyle = _allStylesGlobal.find(s => s.id === pl.styleId);
      if (!pastStyle || pastStyle.programId === programId) return; // skip current program
      const sn = (pastStyle.styleNumber || '').trim();
      if (!sn) return;
      const prog = _allPrograms.find(p => p.id === pastStyle.programId);
      const tc   = DB.TradingCompanies.get(pl.tcId);
      const sub  = _allSubsGlobal.find(s => s.styleId === pl.styleId && s.tcId === pl.tcId && s.coo === pl.coo);
      const fob  = parseFloat(pl.confirmedFob || sub?.fob || 0);
      const r    = fob > 0 ? DB.calcLDP(fob, pastStyle, pl.coo, pastStyle.market || 'USA', 'NY',
                    tc?.paymentTerms || sub?.paymentTerms || 'FOB', sub?.factoryCost) : null;
      const entry = {
        season: prog ? `${prog.season || ''} ${prog.year || ''}`.trim() : '?',
        tcCode: tc?.code || pl.tcId, tcName: tc?.name || '',
        coo: pl.coo, fob, ldp: r?.ldp || null,
        progCreatedAt: prog?.createdAt || 0
      };
      if (!repeatHistory[sn]) repeatHistory[sn] = [];
      repeatHistory[sn].push(entry);
    });
    // sort each list by most recent program first
    Object.values(repeatHistory).forEach(arr => arr.sort((a, b) => b.progCreatedAt - a.progCreatedAt));

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
        const placement = DB.Placements.get(s.id); // needed for green highlight in TC cells

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

        // Actual QTY + Wtd Avg Sell from Buy Summary
        const styleBuys   = DB.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
        const actualQty   = styleBuys.reduce((sum, b) => sum + (parseFloat(b.qty) || 0), 0);
        const buyRevenue  = styleBuys.reduce((sum, b) => sum + ((parseFloat(b.qty) || 0) * (parseFloat(b.sellPrice) || 0)), 0);
        const wtdSell     = actualQty > 0 ? buyRevenue / actualQty : null;
        const actualQtyStr = actualQty > 0 ? actualQty.toLocaleString() : '<span class="text-muted">—</span>';
        const wtdSellStr   = wtdSell   ? '$' + wtdSell.toFixed(2)      : '<span class="text-muted">—</span>';

        const bestGroup = colGroups.find(g => `${g.tc.id}_${g.coo}` === bestKey);
        let rowHtml = `
          <td data-col="styleNum" class="sticky-col mat-cell-white">${s.styleNumber}</td>
          <td data-col="styleName" class="mat-cell-white mat-cell-normal">${styleNameInput}</td>
          <td data-col="cat" class="mat-cell-white mat-cell-normal">${catInput}</td>
          <td data-col="fab" class="mat-cell-white mat-cell-normal">${fabInput}</td>
          <td data-col="qty" class="mat-cell-white">${qtyInput}</td>
          <td data-col="sell" class="mat-cell-white">${sellInput}</td>
          <td data-col="actualQty" class="text-center font-bold" style="border-left:2px solid var(--accent);color:var(--accent);font-size:0.82rem">${actualQtyStr}</td>
          <td data-col="wtdSell" class="text-center text-sm" style="color:var(--text-secondary)">${wtdSellStr}</td>
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

          const fobVal = sub?.fob ? '$' + parseFloat(sub.fob).toFixed(2) : '';
          const fobInput = `<input class="cell-input" type="text" inputmode="decimal"
            data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="fob"
            value="${fobVal}"
            placeholder="FOB"
            onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
            onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this);if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);"
            onkeydown="if(event.key==='Enter')this.blur()">${flagIcon}`;

          const fcVal = sub?.factoryCost ? '$' + parseFloat(sub.factoryCost).toFixed(2) : '';
          const fcInput = `<input class="cell-input" type="text" inputmode="decimal"
            data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="factoryCost"
            value="${fcVal}"
            placeholder="Cost"
            onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
            onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this);if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);"
            onkeydown="if(event.key==='Enter')this.blur()">`;

          // Per-cell flags and revision history
          const fobFlag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
          const fcFlag  = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
          const fobRevs = sub ? DB.Revisions.byField(sub.id, 'fob').length : 0;
          const fcRevs  = sub ? DB.Revisions.byField(sub.id, 'factoryCost').length : 0;
          const cellWrap = (inputHtml, flag, revCount, subId, field) => {
            const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||flag.color).replace(/"/g,'&quot;')} (right-click to edit)" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;"></span>` : '';
            const lastSeen = subId ? parseInt(localStorage.getItem(`vcp_rev_seen_${subId}_${field}`) || '0') : 0;
            const allRevs = subId ? JSON.parse(localStorage.getItem('vcp_revisions') || localStorage.getItem('vcp_revisions_') || '[]').filter(r => r.subId === subId && r.field === field) : [];
            const latestRevTs = allRevs.length ? Math.max(...allRevs.map(r => r.submittedAt || 0)) : 0;
            const isReviewed = latestRevTs > 0 && lastSeen >= latestRevTs;
            const hist = revCount > 0
              ? `<span class="revision-badge${isReviewed ? ' revision-badge-seen' : ' revision-badge-new'}" title="Quote history (${revCount})${isReviewed ? ' — reviewed' : ' — NEW'}" onclick="App.openRevisionHistory('${subId}','${field}')">&#128338;${revCount > 1 ? ' '+revCount : ''}</span>`
              : '';
            return `<div class="flaggable-cell${flag?' has-flag':''}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;">${inputHtml}${dot}${hist}</div>`;
          };

          const dutyPct = r ? pct(r.dutyRate) : '—';
          const dutyAmt = r ? fmt(r.duty) : '—';
          const freightCell = r
            ? (r.freight != null ? fmt(r.freight) : `<span class="text-muted text-sm" title="Set Proj Qty to calc">N/A</span>`)
            : '—';
          const ldpCell = r
            ? `<span>${fmt(r.ldp)}</span>${r.noQty ? '<span class="text-muted text-sm" title="LDP excl. freight">*</span>' : ''}`
            : '<span class="text-muted">—</span>';

          // Considering state (stored in localStorage per sub+style) 
          const consideringKey = 'vcp_considering';
          const consideringList = JSON.parse(localStorage.getItem(consideringKey) || '[]');
          const isConsidering = sub?.id ? consideringList.includes(`${s.id}:${sub.id}`) : false;
          const isPlacedTC = placement?.styleId === s.id && placement?.tcId === tc.id && placement?.coo === coo;
          const fobCellClass = isPlacedTC ? ' cell-placed-fob' : isConsidering ? ' cell-considering-fob' : '';
          const ldpCellClass = isPlacedTC ? ' cell-placed-ldp' : '';
          const fobMinWidth = (fobFlag || fobRevs > 0) ? ' style="min-width:110px"' : '';

          const collapsed = _collapsedTCs.has(k);
          const hideStyle = collapsed ? ' style="display:none"' : '';
          rowHtml += `
          <td data-col="${k}_fob" class="col-vendor-sub ${tcColorClass} cell-flaggable${fobCellClass}"${fobMinWidth} title="Right-click to flag">${cellWrap(fobInput, fobFlag, fobRevs, sub?.id||"", "fob")}</td>
          <td data-col="${k}_fc"       class="col-vendor-sub tc-detail-col ${tcColorClass} cell-flaggable" data-tckey="${k}"${hideStyle}>${cellWrap(fcInput, fcFlag, fcRevs, sub?.id||"", "factoryCost")}</td>
          <td data-col="${k}_duty_pct"  class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyPct}</td>
          <td data-col="${k}_duty_amt"  class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyAmt}</td>
          <td data-col="${k}_freight"   class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${freightCell}</td>
          <td data-col="${k}_ldp"       class="col-vendor-sub col-ldp ${tcColorClass}${ldpCellClass}"
              oncontextmenu="App.openCellHighlightMenu(event,'${s.id}','${tc.id}','${coo}','${sub?.id||''}',${sub?.fob||0});return false;"
              title="Right-click to mark as Considering or Placed">` + ldpCell + `</td>`;
        });

        // Actions column
        if (isCancelled) {
          rowHtml += `<td data-col="actions"><button class="btn-restore-style" onclick="App.uncancelStyle('${s.id}','${pid}')">↩ Restore</button></td>`;
        } else {
          rowHtml += `<td data-col="actions"><button class="btn-cancel-style" onclick="App.cancelStyle('${s.id}','${pid}')">🚫 Cancel</button></td>`;
        }

        // Repeat Style column
        const sn = (s.styleNumber || '').trim();
        const history = sn ? (repeatHistory[sn] || []) : [];
        if (history.length === 0) {
          rowHtml += `<td data-col="repeat" class="text-muted text-sm" style="text-align:center">—</td>`;
        } else {
          const last = history[0]; // most recent
          const fobStr = last.fob > 0 ? '$' + last.fob.toFixed(2) : '—';
          const ldpStr = last.ldp > 0 ? '$' + last.ldp.toFixed(2) : '—';
          const histBtn = history.length > 1
            ? ` <span class="revision-badge revision-badge-new" title="${history.length} past runs — click for full history"
                  style="cursor:pointer" onclick="App.openRepeatStyleHistory('${sn.replace(/'/g,'\\!')}')">🕐 ${history.length}</span>` : '';
          rowHtml += `<td data-col="repeat" style="font-size:0.78rem;white-space:nowrap;padding:6px 10px">
            <div style="font-weight:600;color:var(--accent)">${last.tcCode} · ${last.coo}</div>
            <div style="color:var(--text-secondary)">${last.season} &nbsp; FOB ${fobStr} &nbsp; LDP ${ldpStr}</div>
            ${histBtn}
          </td>`;
        }

        const rowClass = isCancelled ? 'row-cancelled' : (
          bestLDP !== null && targetLDP ? (
            bestLDP <= targetLDP ? 'row-on-target' : 'row-over-target'
          ) : ''
        );
        return `<tr class="${rowClass}">${rowHtml}</tr>`;
      }).join('');
    }

    // ── Aggregation helpers ───────────────────────────────────
    const styleActualQty = s => {
      const buys = DB.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
      return buys.reduce((sum, b) => sum + (parseFloat(b.qty) || 0), 0);
    };

    // Build active rows — optionally grouped
    let activeRows = '';
    const totalFixedCols = 12 + colGroups.length * 6 + 2; // +2 actual/wtd, +2 actions+repeat
    if (groupBy === 'fabrication') {
      const groups = {};
      const groupOrder = [];
      activeStyles.forEach(s => {
        const key = (s.fabrication || '—').trim() || '—';
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(s);
      });
      groupOrder.forEach(fab => {
        const grpStyles   = groups[fab];
        const grpProjQty  = grpStyles.reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);
        const grpActualQty = grpStyles.reduce((sum, s) => sum + styleActualQty(s), 0);
        activeRows += `<tr class="cs-group-row">
          <td colspan="${totalFixedCols}">
            <span style="font-weight:600">📁 ${fab}</span>
            <span class="cs-group-count">${grpStyles.length} style${grpStyles.length !== 1 ? 's' : ''}</span>
            <span class="cs-subtotal">Proj QTY: <strong>${grpProjQty > 0 ? grpProjQty.toLocaleString() : '—'}</strong></span>
            <span class="cs-subtotal">Actual QTY: <strong style="color:var(--accent)">${grpActualQty > 0 ? grpActualQty.toLocaleString() : '—'}</strong></span>
          </td>
        </tr>`;
        activeRows += buildRows(groups[fab], false);
      });
    } else {
      activeRows = buildRows(activeStyles, false);
    }

    // ── Grand Totals ──────────────────────────────────────────
    const totalStyles    = activeStyles.length;
    const totalFabrics   = new Set(activeStyles.map(s => (s.fabrication || '').trim()).filter(Boolean)).size;
    const totalProjQty   = activeStyles.reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);
    const totalActualQty = activeStyles.reduce((sum, s) => sum + styleActualQty(s), 0);

    const grandTotalRow = `
    <tfoot>
      <tr class="cs-grand-total-row">
        <td data-col="styleNum" class="sticky-col" colspan="4">
          <span style="font-weight:700;letter-spacing:0.02em">PROGRAM TOTALS</span>
        </td>
        <td data-col="qty" class="text-center font-bold" title="Total Projected QTY">
          ${totalProjQty > 0 ? totalProjQty.toLocaleString() : '—'}
        </td>
        <td data-col="sell"></td>
        <td data-col="actualQty" class="text-center font-bold" style="color:var(--accent)" title="Total Actual QTY">
          ${totalActualQty > 0 ? totalActualQty.toLocaleString() : '—'}
        </td>
        <td data-col="wtdSell"></td>
        <td data-col="tldp"></td>
        <td data-col="dutyRate"></td>
        <td data-col="estFreight"></td>
        <td data-col="best" class="text-sm" style="white-space:nowrap;color:var(--text-secondary)">
          ${totalStyles} style${totalStyles !== 1 ? 's' : ''} · ${totalFabrics} fabric${totalFabrics !== 1 ? 's' : ''}
        </td>
        ${colGroups.map(() => `<td></td><td></td><td></td><td></td><td></td><td></td>`).join('')}
        <td></td><td></td>
      </tr>
    </tfoot>`;

    // Build cancelled section (collapsed by default)
    let cancelledSection = '';
    if (cancelledStyles.length > 0) {
      const cancelledRows = buildRows(cancelledStyles, true);
      const totalCols = 12 + colGroups.length * 6 + 2; // fixed + TC cols + actions + repeat
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
      ${grandTotalRow}
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

    const styleNote = localStorage.getItem(`vcp_note_${styleId}`) || '';
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
        : `<div class="grid-auto">${tcCooBlocks.map(b => tcBlock(b.tc, b.coo, b.sub, style, bestLDP < Infinity ? bestLDP : null, placement, targetLDP)).join('')}</div>`}
    <div class="card mt-4" style="padding:20px">
      <div class="text-sm font-bold mb-2" style="color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em">📝 Style Notes</div>
      <textarea id="style-note-${styleId}" class="form-input" rows="4" style="width:100%;resize:vertical;font-size:0.9rem" placeholder="Add internal notes for this style…" onblur="App.saveStyleNote('${styleId}',this.value)" onkeydown="if(event.ctrlKey&&event.key==='Enter')this.blur()">${styleNote}</textarea>
      <div class="text-sm text-muted mt-1">Ctrl+Enter or click away to save</div>
    </div>`;
  }

  function tcBlock(tc, coo, sub, style, bestLDP, placement, targetLDP) {
    const isPlaced = placement?.tcId === tc.id && placement?.coo === coo;
    const consideringKey = 'vcp_considering';
    const consideringList = JSON.parse(localStorage.getItem(consideringKey) || '[]');
    const consideringTag = sub?.id ? `${style.id}:${sub.id}` : null;
    const isConsidering = consideringTag ? consideringList.includes(consideringTag) : false;

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
    const fobBg = isPlaced ? 'background:rgba(34,197,94,0.18);' : isConsidering ? 'background:rgba(234,179,8,0.18);' : '';
    const ldpBg = isPlaced ? 'background:rgba(34,197,94,0.18);' : '';

    return `
    <div class="vendor-block ${isBest ? 'best-price' : ''} ${sub.status === 'flagged' ? 'flagged-block' : ''} ${isPlaced ? 'placed-block' : ''} ${isConsidering ? 'considering-block' : ''}">
      ${isBest ? '<div class="best-price-banner">★ Best Price</div>' : ''}
      <div class="vendor-block-header">
        <div><div class="vendor-block-name">${tc.code} — ${coo}</div><div class="vendor-block-coo">${tc.name} · <span class="badge badge-costing" style="font-size:0.7rem">${effectiveTerms}</span></div></div>
        ${statusBadge(isPlaced ? 'Placed' : sub.status)}
      </div>
      <div class="cost-grid">
        <div class="cost-item" style="${fobBg}"><div class="cost-item-label">FOB</div><div class="cost-item-value">${fmt(sub.fob)}</div></div>
        <div class="cost-item"><div class="cost-item-label">Factory Cost</div><div class="cost-item-value">${fmt(sub.factoryCost) || '—'}</div></div>
        <div class="cost-item"><div class="cost-item-label">TC Markup</div><div class="cost-item-value">${sub.tcMarkup ? (parseFloat(sub.tcMarkup) * 100).toFixed(1) + '%' : '—'}</div></div>
        <div class="cost-item"><div class="cost-item-label">MOQ</div><div class="cost-item-value">${fmtN(sub.moq) || '—'}</div></div>
        ${r ? `<div class="cost-item"><div class="cost-item-label">Duty %</div><div class="cost-item-value">${pct(r.dutyRate)}</div></div>` : ''}
        ${r ? `<div class="cost-item"><div class="cost-item-label">Duty/unit</div><div class="cost-item-value">${fmt(r.duty)}</div></div>` : ''}
        ${r ? `<div class="cost-item"><div class="cost-item-label">Freight/unit</div><div class="cost-item-value">${r.freight != null ? fmt(r.freight) : 'Set Proj Qty'}</div></div>` : ''}
      </div>
      <div style="padding:10px 0;border-top:1px solid var(--border);margin-bottom:14px;${ldpBg}">
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
        ${consideringTag ? `<button class="btn btn-sm ${isConsidering ? 'btn-warning' : 'btn-ghost'}" onclick="App.toggleConsidering('${consideringTag}','${style.id}')"
          title="Mark as style under consideration for placement">${isConsidering ? '⭐ Considering' : '☆ Consider'}</button>` : ''}
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

  // ── Program Tab Bar ────────────────────────────────────────
  function programTabBar(programId, activeTab, prog) {
    return `<div class="program-tabs">
      <button class="program-tab ${activeTab === 'cost' ? 'active' : ''}" onclick="App.navigate('cost-summary','${programId}')">📊 Cost Summary</button>
      <button class="program-tab ${activeTab === 'buys' ? 'active' : ''}" onclick="App.navigate('buy-summary','${programId}')">🛒 Buy Summary</button>
    </div>`;
  }

  // ── Buy Summary ────────────────────────────────────────────
  function renderBuySummary(programId, role) {
    const prog     = DB.Programs.get(programId);
    const styles   = DB.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const custIds  = DB.CustomerAssignments.byProgram(programId);
    const allCusts = DB.Customers.all();
    const custs    = custIds.map(id => allCusts.find(c => c.id === id)).filter(Boolean);
    const allBuys  = DB.CustomerBuys.byProgram(programId);
    const canEdit  = role === 'admin' || role === 'pc' || role === 'planning';

    if (!prog) return `<div class="empty-state"><div class="icon">⚠️</div><h3>Program not found</h3></div>`;

    // Header
    let hdr = `<th class="sticky-col mat-hdr" style="min-width:70px">Style #</th>
      <th class="mat-hdr" style="min-width:110px">Style Name</th>
      <th class="mat-hdr">Category</th>
      <th class="mat-hdr">Fabrication</th>`;
    custs.forEach((c, i) => {
      const cls = i % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
      hdr += `<th colspan="2" class="vendor-group-hdr mat-hdr ${cls}">${c.code} — ${c.name}</th>`;
    });
    hdr += `<th class="mat-hdr col-target" style="min-width:90px">Total Actual QTY</th>
            <th class="mat-hdr" style="min-width:100px">Wtd Avg Sell</th>`;

    let hdr2 = `<th class="sticky-col mat-hdr"></th><th class="mat-hdr"></th><th class="mat-hdr"></th><th class="mat-hdr"></th>`;
    custs.forEach((_, i) => {
      const cls = i % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
      hdr2 += `<th class="mat-hdr ${cls}" style="min-width:80px">QTY</th><th class="mat-hdr ${cls}" style="min-width:90px">Sell Price</th>`;
    });
    hdr2 += `<th class="col-target mat-hdr"></th><th class="mat-hdr"></th>`;

    const rows = styles.map(s => {
      const buys = custs.map(c => allBuys.find(b => b.styleId === s.id && b.customerId === c.id));
      const totalQty = buys.reduce((sum, b) => sum + (parseFloat(b?.qty) || 0), 0);
      const revenue  = buys.reduce((sum, b) => sum + ((parseFloat(b?.qty) || 0) * (parseFloat(b?.sellPrice) || 0)), 0);
      const wtdSell  = totalQty > 0 ? revenue / totalQty : null;

      let cells = `<td class="sticky-col mat-cell-white primary">${s.styleNumber}</td>
        <td class="mat-cell-white">${s.styleName || '—'}</td>
        <td class="mat-cell-white text-sm">${s.category || '—'}</td>
        <td class="mat-cell-white text-sm">${(s.fabrication || '—').substring(0, 30)}</td>`;

      custs.forEach((c, i) => {
        const b = buys[i];
        const cls = i % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
        const qtyVal   = b?.qty   ? Number(b.qty).toLocaleString() : '';
        const sellVal  = b?.sellPrice ? '$' + parseFloat(b.sellPrice).toFixed(2) : '';
        if (canEdit) {
          cells += `<td class="${cls}" style="padding:4px 6px">
            <input class="cell-input cell-input-sm" type="text" inputmode="numeric"
              placeholder="Qty" value="${b?.qty || ''}"
              onblur="App.saveBuyInline('${s.id}','${c.id}','${programId}','qty',this)"
              onkeydown="App.buyMoveDown(event,this)">
          </td>
          <td class="${cls}" style="padding:4px 6px">
            <input class="cell-input cell-input-sm" type="text" inputmode="decimal"
              placeholder="$0.00" value="${sellVal}"
              onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
              onblur="App.saveBuyInline('${s.id}','${c.id}','${programId}','sellPrice',this);if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);"
              onkeydown="App.buyMoveDown(event,this)">
          </td>`;
        } else {
          cells += `<td class="${cls} text-sm text-center">${qtyVal || '—'}</td>
                    <td class="${cls} text-sm text-center">${sellVal || '—'}</td>`;
        }
      });

      cells += `<td class="col-target font-bold text-accent text-center">${totalQty > 0 ? totalQty.toLocaleString() : '—'}</td>
                <td class="text-sm text-center">${wtdSell ? '$' + wtdSell.toFixed(2) : '—'}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');

    const noCusts = custs.length === 0 ? `<div class="empty-state" style="margin:24px 0"><div class="icon">👥</div><h3>No customers assigned</h3>
      <p class="text-muted">Assign customers to this program to start tracking buys.</p>
      ${canEdit ? `<button class="btn btn-primary" onclick="App.openAssignCustomers('${programId}')">＋ Assign Customers</button>` : ''}</div>` : '';

    const assignBtn = canEdit ? `<button class="btn btn-secondary btn-sm" onclick="App.openAssignCustomers('${programId}')">👥 Assign Customers</button>` : '';
    const dlBtn     = custs.length > 0 && canEdit ? `<button class="btn btn-secondary btn-sm" onclick="App.downloadBuyTemplate('${programId}')">⬇ Template</button>` : '';
    const upBtn     = custs.length > 0 && canEdit ? `<button class="btn btn-primary btn-sm" onclick="App.openBuyUploadModal('${programId}')">📤 Upload</button>` : '';

    return `
    ${programTabBar(programId, 'buys', prog)}
    <div class="page-header" style="margin-top:12px">
      <div><h1 class="page-title">${prog.name} — Buy Summary</h1>
        <p class="page-subtitle">${prog.season || ''} ${prog.year || ''}</p></div>
      <div style="display:flex;gap:8px">${assignBtn}${dlBtn}${upBtn}</div>
    </div>
    ${noCusts}
    ${custs.length > 0 ? `<div class="card" style="padding:0"><div class="table-wrap">
      <table id="buy-summary-table">
        <thead>
          <tr class="hdr-row1">${hdr}</tr>
          <tr class="hdr-row2">${hdr2}</tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="20" class="text-muted text-center" style="padding:40px">No styles in this program.</td></tr>'}</tbody>
      </table>
    </div></div>` : ''}`;
  }

  // ── Customer Manager (Admin Settings) ─────────────────────
  function renderCustomers() {
    const custs = DB.Customers.all();
    return `
    <div class="page-header">
      <div><h1 class="page-title">Customers</h1><p class="page-subtitle">Global customer list</p></div>
      <button class="btn btn-primary" onclick="App.openCustomerModal()">＋ Add Customer</button>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>Actions</th></tr></thead>
      <tbody>${custs.length ? custs.map(c => `<tr>
        <td class="font-bold">${c.code}</td>
        <td>${c.name}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openCustomerModal('${c.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteCustomer('${c.id}')">🗑</button>
        </div></td>
      </tr>`).join('') : `<tr><td colspan="3" class="text-muted text-center" style="padding:40px">No customers yet.</td></tr>`}
      </tbody>
    </table></div></div>`;
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
    renderDashboard,
    renderBuySummary, renderCustomers,
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
