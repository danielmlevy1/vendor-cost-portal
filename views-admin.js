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
    const cls = {
      // Program statuses
      Draft:     'pending',
      Costing:   'costing',
      Placed:    'placed',
      Cancelled: 'cancelled',
      // Other statuses
      open: 'pending', placed: 'placed', flagged: 'flagged',
      accepted: 'accepted', submitted: 'submitted', pending: 'pending',
    };
    const icon = { Draft: '⏳', Costing: '📋', Placed: '✅', Cancelled: '✕' }[s] || '';
    return `<span class="badge badge-${cls[s] || 'pending'}">${icon ? icon + ' ' : ''}${s}</span>`;
  }

  // ── Dashboard ──────────────────────────────────────────────
  function renderDashboard(role, user) {
    const isAdmin    = role === 'admin';
    const isPC       = role === 'pc';
    const isPlanning = role === 'planning';
    const isDesign   = role === 'design';
    const isAdminOrPC = isAdmin || isPC;

    // ── IP-scoped filtering ──────────────────────────────────
    // Admin/PC can temporarily filter by team via the dropdown (_dashIpFilter).
    // Design/Planning see only their own internalProgramId.
    const userIpId   = user?._dashIpFilter || user?.internalProgramId || null;
    const allPrograms = API.cache.programs;
    const programs    = (userIpId && !isAdminOrPC)
      ? allPrograms.filter(p => p.internalProgramId === userIpId)
      : userIpId
        ? allPrograms.filter(p => p.internalProgramId === userIpId)
        : allPrograms;

    const ip = userIpId ? API.InternalPrograms.get(userIpId) : null;
    const allStylesDB   = API.Styles.all();
    const allSubs       = API.Submissions.all();
    const allFlags      = JSON.parse(localStorage.getItem('vcp_cell_flags') || '[]');
    const allPlacements = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const allRevs       = JSON.parse(localStorage.getItem('vcp_revisions') || '[]');
    const allHandoffs   = API.DesignHandoffs.all();
    const allSalesReqs  = API.SalesRequests.all();

    const today = new Date(); today.setHours(0,0,0,0);
    const in30  = new Date(today); in30.setDate(in30.getDate() + 30);

    // Program breakdowns (scoped)
    const progIds       = new Set(programs.map(p => p.id));
    const allStyles     = allStylesDB.filter(s => progIds.has(s.programId));
    const progDraft     = programs.filter(p => p.status === 'Draft').length;
    const progActive    = programs.filter(p => p.status === 'Costing').length;
    const progPlaced    = programs.filter(p => p.status === 'Placed').length;
    const progPastEnd   = programs.filter(p => p.endDate && new Date(p.endDate + 'T00:00:00') < today && p.status === 'Costing').length;
    const upcomingCRDs  = programs.filter(p => p.crdDate && (() => { const d = new Date(p.crdDate + 'T00:00:00'); return d >= today && d <= in30; })()).length;

    // Style progress (active programs scoped)
    const activeProgIds  = new Set(programs.filter(p => p.status === 'Costing').map(p => p.id));
    const activeStyles   = allStyles.filter(s => activeProgIds.has(s.programId) && s.status !== 'cancelled');
    const totalStyles    = activeStyles.length;
    const costedStyles   = activeStyles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
    const placedStyles   = activeStyles.filter(s => allPlacements.some(pl => pl.styleId === s.id)).length;
    const projQtyTotal   = activeStyles.reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);
    const placedQtyTotal = activeStyles.filter(s => allPlacements.some(pl => pl.styleId === s.id))
                             .reduce((sum, s) => sum + (parseFloat(s.projQty) || 0), 0);

    // Design handoff stats
    const openHandoffs   = allHandoffs.filter(h => !allSalesReqs.find(r => r.sourceHandoffId === h.id));
    const linkedHandoffs = allHandoffs.filter(h =>  allSalesReqs.find(r => r.sourceHandoffId === h.id));
    const openRequests   = allSalesReqs.filter(r => !r.linkedProgramId);
    const reqMissingData = allSalesReqs.filter(r => !r.linkedProgramId && (r.styles||[]).some(s => !s.projQty || !s.projSell));

    // Style conversion rate
    const handoffStyleCount = allHandoffs.reduce((sum, h) => sum + (h.stylesList||[]).length, 0);
    const salesStyleSet     = new Set(allSalesReqs.flatMap(r => (r.styles||[]).map(s => s.styleNumber)));
    const salesStyleCount   = salesStyleSet.size;
    const conversionRate    = handoffStyleCount > 0 ? Math.round((salesStyleCount / handoffStyleCount) * 100) : 0;

    // Action items
    const flagCount    = allFlags.length;
    const pendingCount = isAdmin ? API.PendingChanges.pending().length : 0;

    // Re-cost request counts (for alerts)
    const allRecosts        = API.RecostRequests.all();
    const recostForSales    = API.RecostRequests.pendingSales().length;
    const recostForProd     = API.RecostRequests.pendingProduction().length;
    const recostRejectedDesign = allRecosts.filter(r =>
      r.status === 'rejected' && r.rejectedStage === 'sales' &&
      ((user?.id && r.requestedBy === user.id) || (user?.name && r.requestedByName === user.name))
    ).length;

    // Financials
    const placedSubs = allPlacements.map(pl => {
      const style = allStyles.find(s => s.id === pl.styleId);
      const sub   = allSubs.find(s => s.styleId === pl.styleId && s.tcId === pl.tcId && s.coo === pl.coo);
      return { fob: parseFloat(sub?.fob || pl.confirmedFob || 0), qty: parseFloat(style?.projQty || 0) };
    }).filter(x => x.fob > 0);
    const avgFOB     = placedSubs.length ? placedSubs.reduce((s, x) => s + x.fob, 0) / placedSubs.length : 0;
    const totalSpend = placedSubs.reduce((s, x) => s + x.fob * x.qty, 0);

    // ── UI helpers ────────────────────────────────────────────
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

    const alertKpi = (icon, label, value, color, route) => `
      <div class="kpi-alert ${value > 0 ? 'kpi-alert-active' : ''}" ${route ? `style="cursor:pointer" onclick="App.navigate('${route}')"` : ''}>
        <span class="kpi-alert-icon" style="color:${color}">${icon}</span>
        <span class="kpi-alert-value" style="color:${value > 0 ? color : '#64748b'}">${value}</span>
        <span class="kpi-alert-label">${label}</span>
        ${route && value > 0 ? '<span class="kpi-alert-arrow">→</span>' : ''}
      </div>`;

    const sec = (label, mt = 28) => `<div class="kpi-section-label" style="margin-top:${mt}px">${label}</div>`;

    // ── Open handoff cards (for Sales) ────────────────────────
    const handoffCards = openHandoffs.slice(0, 4).map(h => {
      const d  = new Date(h.createdAt).toLocaleDateString('en-US', {month:'short', day:'numeric'});
      const sc = (h.stylesList||[]).length;
      const fabBadge = h.fabricsUploaded
        ? `<span class="badge badge-placed" style="font-size:0.7rem">🧵 Fabrics ✓</span>`
        : `<span class="badge badge-pending" style="font-size:0.7rem">⚠ No fabrics</span>`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div style="display:flex;gap:14px;align-items:center">
          <div>
            <div class="font-bold">${h.season||'—'} ${h.year||''}</div>
            <div class="text-sm text-muted">${h.submittedByName||'Design'} · ${d}</div>
          </div>
          <span class="tag">${sc} style${sc !== 1 ? 's' : ''}</span>
          ${fabBadge}
        </div>
        <button class="btn btn-primary btn-sm" onclick="App.openBuildRequestFromHandoff('${h.id}')">Build Request →</button>
      </div>`;
    }).join('');

    // ── TC quote progress table (for Production) ───────────────
    const activeProgs = programs.filter(p => p.status === 'Costing').slice(0, 6);
    const tcProgressRows = activeProgs.map(prog => {
      const progStyles  = allStylesDB.filter(s => s.programId === prog.id && s.status !== 'cancelled');
      const quotedCount = progStyles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
      const placedCount = progStyles.filter(s => API.Placements.get(s.id) != null).length;
      const total       = progStyles.length;
      const pct         = total > 0 ? Math.round((quotedCount / total) * 100) : 0;
      const placedPct   = total > 0 ? Math.round((placedCount / total) * 100) : 0;
      const crd         = prog.crdDate ? new Date(prog.crdDate + 'T00:00:00') : null;
      const isUrgent    = crd && crd >= today && crd <= in30;
      const isPast      = crd && crd < today;
      return `<tr style="cursor:pointer" onclick="App.navigate('cost-summary','${prog.id}')">
        <td><div class="font-bold">${prog.name}</div>
          <div class="text-sm text-muted" style="margin-top:2px">${[prog.season, prog.year, prog.gender, prog.brand].filter(Boolean).join(' · ')}</div>
        </td>
        <td>${ip ? '' : `<span class="tag" style="font-size:0.7rem">${(API.InternalPrograms.get(prog.internalProgramId)||{name:'—'}).name}</span>`}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;min-width:140px">
            <div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.08)">
              <div style="height:5px;border-radius:3px;background:${pct===100?'#6366f1':'#6366f1'};width:${pct}%"></div>
            </div>
            <span style="font-size:0.72rem;white-space:nowrap;color:#94a3b8">${quotedCount}/${total} costed</span>
          </div>
          ${placedCount > 0 ? `<div style="display:flex;align-items:center;gap:8px;min-width:140px;margin-top:4px">
            <div style="flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,0.06)">
              <div style="height:3px;border-radius:3px;background:#22c55e;width:${placedPct}%"></div>
            </div>
            <span style="font-size:0.7rem;white-space:nowrap;color:#22c55e">${placedCount}/${total} placed</span>
          </div>` : ''}
        </td>
        <td>${crd ? `<span style="color:${isPast?'#ef4444':isUrgent?'#f59e0b':'#94a3b8'};font-weight:${isUrgent||isPast?'600':'400'}">${crd.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>` : '—'}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
            <span class="badge ${pct===100?'badge-costing':pct>0?'badge-costing':'badge-pending'}" style="font-size:0.7rem">${pct}% costed</span>
            ${placedCount > 0 ? `<span class="badge ${placedPct===100?'badge-placed':'badge-pending'}" style="font-size:0.7rem">${placedPct}% placed</span>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    // ── Upcoming CRD list ─────────────────────────────────────
    const urgentProgs = programs
      .filter(p => p.crdDate && (() => { const d = new Date(p.crdDate + 'T00:00:00'); return d >= today && d <= in30; })())
      .sort((a, b) => a.crdDate.localeCompare(b.crdDate))
      .slice(0, 5);
    const crdRows = urgentProgs.map(p => {
      const d        = new Date(p.crdDate + 'T00:00:00');
      const daysLeft = Math.ceil((d - today) / 86400000);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span class="font-bold" style="cursor:pointer" onclick="App.navigate('cost-summary','${p.id}')">${p.name}</span>
        <span class="tag" style="background:${daysLeft<=7?'rgba(239,68,68,0.15)':'rgba(245,158,11,0.15)'};color:${daysLeft<=7?'#ef4444':'#f59e0b'}">${daysLeft}d left</span>
      </div>`;
    }).join('');

    // ════════════════════════════════════════════════════════
    //   ROLE-SPECIFIC SECTIONS
    // ════════════════════════════════════════════════════════

    // ── SALES / PLANNING ─────────────────────────────────────
    const salesSection = `
      ${sec('📥 Open Design Handoffs', 0)}
      ${openHandoffs.length > 0
        ? `<div class="card mb-4" style="display:flex;flex-direction:column;gap:8px;padding:16px">
            ${handoffCards}
            ${openHandoffs.length > 4 ? `<div class="text-sm text-muted text-center" style="cursor:pointer;padding:4px 0" onclick="App.navigate('design-handoff')">+ ${openHandoffs.length - 4} more handoffs →</div>` : ''}
           </div>`
        : `<div class="card mb-4 text-center text-muted" style="padding:24px">No open design handoffs — all caught up ✓</div>`
      }

      ${sec('📊 Program Status')}
      <div class="kpi-grid">
        ${kpi('⏳','Pending Proposals', progDraft, 'Awaiting PC release', '#f59e0b', 'programs')}
        ${kpi('🟢','In Costing', progActive, 'Active with vendors', '#22c55e', 'programs')}
        ${kpi('📦','Placed', progPlaced, 'Fully placed', '#6366f1', 'programs')}
      </div>

      ${sec('⚠️ Action Items')}
      <div class="kpi-alerts">
        ${alertKpi('↩', 'Re-cost Requests — Awaiting Your Approval', recostForSales, '#f59e0b', 'recost-queue')}
        ${alertKpi('📋', 'Open Requests (not yet proposed)', openRequests.length, '#6366f1', 'sales-requests')}
        ${alertKpi('❓', 'Requests missing Qty / Price', reqMissingData.length, '#a855f7', 'sales-requests')}
        ${alertKpi('📅', 'Programs with CRD ≤ 30 days', upcomingCRDs, '#ef4444', 'programs')}
      </div>

      ${sec('⚠️ Action Items')}
      <div class="kpi-alerts">
        ${alertKpi('↩', 'Your Re-cost Requests — Rejected (action needed)', recostRejectedDesign, '#ef4444', 'recost-queue')}
        ${alertKpi('📋', 'In-Progress Re-cost Requests', allRecosts.filter(r => !['dismissed','rejected','released'].includes(r.status) && ((user?.id && r.requestedBy === user.id) || (user?.name && r.requestedByName === user.name))).length, '#f59e0b', 'recost-queue')}
      </div>

      ${urgentProgs.length > 0 ? `${sec('📅 Upcoming CRDs')}<div class="card" style="padding:16px">${crdRows}</div>` : ''}`;

    // ── DESIGN ────────────────────────────────────────────────
    const designSection = `
      ${sec('📊 Style Conversion Rate', 0)}
      <div class="kpi-grid">
        ${kpi('📤','Styles Submitted', handoffStyleCount, `Across ${allHandoffs.length} handoff${allHandoffs.length!==1?'s':''}`, '#6366f1', 'design-handoff')}
        ${kpi('✅','Picked Up by Sales', salesStyleCount, 'Styles in costing requests', '#22c55e', 'design-handoff')}
        ${kpi('📈','Conversion Rate', `${conversionRate}%`, 'Handoff → Costing request', conversionRate >= 80 ? '#22c55e' : conversionRate >= 50 ? '#f59e0b' : '#ef4444')}
      </div>

      ${sec('🎨 My Handoffs')}
      <div class="kpi-grid">
        ${kpi('📬','Awaiting Sales Action', openHandoffs.length, 'Not yet built into a request', '#f59e0b', 'design-handoff')}
        ${kpi('🔗','Linked to Requests', linkedHandoffs.length, 'Picked up by Sales', '#22c55e', 'design-handoff')}
      </div>

      ${sec('📋 Program Status')}
      <div class="kpi-grid">
        ${kpi('⏳','Pending Proposals', progDraft, 'Awaiting PC release', '#f59e0b', 'programs')}
        ${kpi('🟢','In Costing', progActive, 'Active with vendors', '#22c55e', 'programs')}
        ${kpi('📦','Placed', progPlaced, 'Fully placed', '#6366f1', 'programs')}
      </div>

      ${urgentProgs.length > 0 ? `${sec('📅 Upcoming CRDs')}<div class="card" style="padding:16px">${crdRows}</div>` : ''}`;

    // ── PRODUCTION / ADMIN ────────────────────────────────────
    const productionSection = `
      ${sec('📥 Pre-Costing Pipeline', 0)}
      <div class="kpi-grid">
        ${kpi('🎨','Open Handoffs', openHandoffs.length, 'Awaiting sales request', '#6366f1', 'design-handoff')}
        ${kpi('📝','Open Sales Requests', openRequests.length, 'Not yet proposed', '#f59e0b', 'sales-requests')}
        ${kpi('⏳','Pending Proposals', progDraft, 'Awaiting PC acknowledge', '#a855f7', 'programs')}
        ${kpi('📈','Style Conversion', `${conversionRate}%`, `${salesStyleCount} of ${handoffStyleCount} styles`, conversionRate >= 80 ? '#22c55e' : '#f59e0b')}
      </div>

      ${sec('🏭 TC Costing Progress')}
      ${activeProgs.length > 0
        ? `<div class="card" style="padding:0"><div class="table-wrap"><table>
            <thead><tr>
              <th>Program</th>
              ${ip ? '' : '<th>Team</th>'}
              <th>Quote Progress</th>
              <th>CRD</th>
              <th>Status</th>
            </tr></thead>
            <tbody>${tcProgressRows}</tbody>
          </table></div></div>`
        : `<div class="card text-center text-muted" style="padding:24px">No active programs in costing.</div>`
      }

      ${sec('📊 Active Program Health')}
      <div class="kpi-grid">
        ${kpi('🟢','Active Programs', progActive, 'In costing', '#22c55e', 'programs')}
        ${kpi('📦','Programs Placed', progPlaced, 'Fully placed', '#6366f1', 'programs')}
        ${kpi('⚠️','Past End Date', progPastEnd, 'Still in costing', '#ef4444', 'programs')}
      </div>

      ${sec('📈 Style Progress — Active Programs')}
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

      ${sec('⚡ Action Items')}
      <div class="kpi-alerts">
        ${alertKpi('↩', 'Re-costs Ready to Release to TC', recostForProd, '#f59e0b', 'recost-queue')}
        ${alertKpi('↩', 'Re-costs Awaiting Sales (visibility)', recostForSales, '#3b82f6', 'recost-queue')}
        ${alertKpi('🚩', 'Flagged Prices', flagCount, '#ef4444', '')}
        ${alertKpi('📅', 'CRDs Within 30 Days', upcomingCRDs, '#6366f1', 'programs')}
        ${isAdmin ? alertKpi('⏳', 'Pending Approvals', pendingCount, '#a855f7', 'pending-changes') : ''}
      </div>

      ${urgentProgs.length > 0 ? `${sec('📅 Upcoming CRDs')}<div class="card" style="padding:16px">${crdRows}</div>` : ''}

      ${isAdminOrPC && avgFOB > 0 ? `
      ${sec('💰 Financials — Placed Styles Only')}
      <div class="kpi-grid">
        ${kpi('💵','Avg FOB (Placed)', '$' + avgFOB.toFixed(2), `${placedSubs.length} style${placedSubs.length !== 1 ? 's' : ''} placed`, '#22c55e')}
        ${kpi('💰','Est. Total Placed Spend', totalSpend > 0 ? '$' + totalSpend.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}) : '—', 'FOB × Proj QTY', '#6366f1')}
      </div>` : ''}`;

    // ── Assemble page ─────────────────────────────────────────
    const mainSection = isPlanning ? salesSection : isDesign ? designSection : productionSection;
    const teamLabel   = ip
      ? `<span class="badge badge-costing" style="font-size:0.8rem;padding:4px 10px;vertical-align:middle">${ip.name}</span>`
      : '';
    const teamFilter  = isAdminOrPC ? `
      <select class="form-select" onchange="App.filterDashboardByIP(this.value)" style="width:200px"
        title="Filter by team">
        <option value="">All Teams</option>
        ${API.cache.internalPrograms.map(p =>
          `<option value="${p.id}" ${userIpId === p.id ? 'selected' : ''}>${p.name}</option>`
        ).join('')}
      </select>` : '';

    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard ${teamLabel}</h1>
        <p class="page-subtitle">${today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
      </div>
      ${teamFilter ? `<div style="display:flex;gap:8px;align-items:center">${teamFilter}</div>` : ''}
    </div>
    ${mainSection}`;
  }

  // ── Programs ───────────────────────────────────────────────
  function renderPrograms() {
    const allHandoffs = API.DesignHandoffs.all();
    const allRequests = API.SalesRequests.all();
    const allPrograms = API.cache.programs;

    const openHandoffs = allHandoffs.filter(h => !allRequests.find(r => r.sourceHandoffId === h.id));
    const openRequests = allRequests.filter(r => !r.linkedProgramId);
    const draftPrograms = allPrograms.filter(p => p.status === 'Draft');

    const totalEntries = openHandoffs.length + openRequests.length + allPrograms.length;

    const pendingBanner = draftPrograms.length ? `
    <div class="card mb-4" style="border-left:3px solid var(--warning);border-color:var(--warning);background:rgba(245,158,11,0.05)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div class="font-bold" style="color:var(--warning)">⏳ ${draftPrograms.length} Pending Program Proposal${draftPrograms.length > 1 ? 's' : ''}</div>
          <div class="text-sm text-muted mt-1">Submitted by Design or Sales — review, assign TCs, then acknowledge to begin costing.</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${draftPrograms.map(p => {
          const styles = API.Styles.byProgram(p.id);
          const hasHandoff = !!p.sourceHandoffId;
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
            <div style="display:flex;gap:16px;align-items:center">
              <div>
                <div class="font-bold">${p.name}</div>
                <div class="text-sm text-muted">${p.season||'—'} ${p.year||''} · ${p.gender ? p.gender + ' · ' : ''}${p.retailer||'No retailer'}</div>
              </div>
              <span class="tag">${styles.length} styles</span>
              ${!hasHandoff ? '<span class="badge badge-pending" title="Sales proposed before Design uploaded handoff">⚠ Pending Design Handoff</span>' : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="App.openProgram('${p.id}')">👁 Preview</button>
              <button class="btn btn-primary btn-sm" onclick="App.acknowledgeProgram('${p.id}')">✅ Acknowledge &amp; Release</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

    return `
    <div class="page-header">
      <div><h1 class="page-title">Programs</h1><p class="page-subtitle">Full pipeline · ${totalEntries} entries across all stages</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="App.openProgramModal()">＋ New Program</button>
      </div>
    </div>
    <div class="filter-bar mb-3">
      <div class="search-input-wrap"><span class="search-icon">🔍</span><input class="form-input" id="prog-search" placeholder="Search programs…" oninput="App.filterPrograms()"></div>
      <select class="form-select" id="prog-status-filter" onchange="App.filterPrograms()" style="max-width:200px">
        <option value="">All Stages</option>
        <option>Design Submitted</option>
        <option>Sales Request</option>
        <option>Draft</option>
        <option>Costing</option>
        <option>Placed</option>
        <option>Cancelled</option>
      </select>
    </div>
    ${pendingBanner}
    <div id="programs-grid">
      ${programsTable(openHandoffs, openRequests, allPrograms)}
    </div>`;
  }

  // ── Shared stage badge (includes pre-program stages) ───────
  function stageBadge(stage) {
    const map = {
      'Design Submitted': ['badge-costing',   '🎨'],
      'Sales Request':    ['badge-pending',    '📝'],
      'Draft':            ['badge-pending',    '⏳'],
      'Costing':          ['badge-costing',    '📋'],
      'Placed':           ['badge-placed',     '✅'],
      'Cancelled':        ['badge-cancelled',  '✕'],
    };
    const [cls, icon] = map[stage] || ['badge-pending', ''];
    return `<span class="badge ${cls}">${icon} ${stage}</span>`;
  }

  function programsTable(openHandoffs, openRequests, allPrograms) {
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const dash = `<span class="text-muted">—</span>`;
    const allSubs = API.Submissions.all();
    // Role check — used to show/hide admin buttons in program rows
    const _role = (typeof App !== 'undefined' && App._getState && App._getState()?.user?.role) || null;
    const isAdminOrPC = _role === 'admin' || _role === 'pc';

    const thead = `<thead><tr>
      <th>Season</th><th>Year</th><th>Gender</th><th>Brand</th><th>Tier</th><th>Stage</th><th>SR #</th><th>Ver.</th>
      <th style="text-align:center">Styles</th>
      <th style="text-align:center">Costed</th>
      <th style="text-align:center">Placed</th>
      <th style="text-align:center">TTL Proj Qty</th>
      <th style="text-align:center">TTL Actual Qty</th>
      <th style="text-align:center">TCs</th>
      <th>Start Date</th><th>End Date</th><th>1st CRD</th>
      <th>Actions</th>
    </tr></thead>`;

    // ── Design Handoff rows (not yet in a request) ────────────
    // Column order must mirror the thead above (18 cells).
    const handoffRows = openHandoffs.map(h => {
      const sc = (h.stylesList || []).length;
      const fabBadge = !h.fabricsUploaded
        ? `<span class="badge badge-pending" style="font-size:0.68rem;margin-left:6px">No fabrics</span>` : '';
      const brandLabel = h.retailer || [h.season, h.year].filter(Boolean).join(' ') || 'Design Handoff';
      const assignedTCIds = h.assignedTCIds || [];
      const assignedTCs   = assignedTCIds.map(id => API.TradingCompanies.get(id)).filter(Boolean);
      const tcChips = assignedTCs.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${assignedTCs.map(tc =>
            `<span class="tag" style="font-size:0.7rem;padding:2px 6px">${tc.code}</span>`).join('')}</div>`
        : `<span class="text-muted" style="font-size:0.75rem">None assigned</span>`;
      return `<tr style="background:rgba(124,58,237,0.03)">
        <td>${h.season || dash}</td>
        <td>${h.year || dash}</td>
        <td>${dash}</td>
        <td class="font-bold">${brandLabel}${fabBadge}</td>
        <td>${dash}</td>
        <td>${stageBadge('Design Submitted')}</td>
        <td>${dash}</td>
        <td>${dash}</td>
        <td style="text-align:center">${sc ? `<span class="tag">${sc}</span>` : dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center;min-width:90px">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span class="tag">${assignedTCIds.length}</span>
            ${tcChips}
          </div>
        </td>
        <td class="text-sm">${fmtDate(h.startDate)}</td>
        <td class="text-sm">${fmtDate(h.endDate)}</td>
        <td class="text-sm">${fmtDate(h.firstCRD)}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)"
              onclick="App.openAssignVendorsToHandoff('${h.id}')">🏭 Vendors</button>
            <button class="btn btn-primary btn-sm" onclick="App.openBuildRequestFromHandoff('${h.id}')">📝 Build Request</button>
            <button class="btn btn-secondary btn-sm" onclick="App.viewHandoff('${h.id}')">👁 View</button>
          </div>
        </td>
      </tr>`;
    }).join('');


    // ── Sales Request rows (not yet a program) ────────────────
    // Column order must mirror the thead above (18 cells).
    const requestRows = openRequests.map(r => {
      const sc = (r.styles || []).length;
      const projQty = (r.styles || []).reduce((s, x) => s + (parseFloat(x.projQty) || 0), 0);
      const brandLabel = r.retailer || r.name || [r.season, r.year].filter(Boolean).join(' ') || 'Sales Request';
      const reqTCIds = r.assignedTCIds || [];
      const reqTCs   = reqTCIds.map(id => API.TradingCompanies.get(id)).filter(Boolean);
      const reqTCChips = reqTCs.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${reqTCs.map(tc =>
            `<span class="tag" style="font-size:0.7rem;padding:2px 6px">${tc.code}</span>`).join('')}</div>`
        : `<span class="text-muted" style="font-size:0.75rem">None assigned</span>`;
      return `<tr style="background:rgba(245,158,11,0.03)">
        <td>${r.season || dash}</td>
        <td>${r.year || dash}</td>
        <td>${dash}</td>
        <td class="font-bold">${brandLabel}</td>
        <td>${dash}</td>
        <td>${stageBadge('Sales Request')}</td>
        <td>${r.number ? `<span class="tag" style="font-family:monospace;font-size:0.78rem">${r.number}</span>` : dash}</td>
        <td>${dash}</td>
        <td style="text-align:center">${sc ? `<span class="tag">${sc}</span>` : dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center">${projQty > 0 ? `<span class="tag">${projQty.toLocaleString()}</span>` : dash}</td>
        <td style="text-align:center">${dash}</td>
        <td style="text-align:center;min-width:90px">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span class="tag">${reqTCIds.length}</span>
            ${reqTCChips}
          </div>
        </td>
        <td class="text-sm">${fmtDate(r.startDate)}</td>
        <td class="text-sm">${fmtDate(r.endDate)}</td>
        <td class="text-sm">${fmtDate(r.firstCRD)}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)"
              onclick="App.openAssignVendorsToRequest('${r.id}')">🏭 Vendors</button>
            <button class="btn btn-secondary btn-sm" onclick="App.viewSalesRequest('${r.id}')">👁 View</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // ── Program rows (all statuses) ───────────────────────────
    const programRows = allPrograms.map(p => {
      const styles       = API.Styles.byProgram(p.id);
      const styleCount   = styles.length;
      const tcCount      = p.tcCount || 0;
      const placedCount  = styles.filter(s => API.Placements.get(s.id) != null).length;
      const costedCount  = styles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
      const projQtyTotal = styles.reduce((sum, s) => sum + (parseFloat(s.projQty)   || 0), 0);
      const actlQtyTotal = styles.reduce((sum, s) => sum + (parseFloat(s.actualQty) || 0), 0);
      const isDraft  = p.status === 'Draft';
      const handoff  = API.DesignHandoffs.all().find(h => h.linkedProgramId === p.id);
      const srNum    = handoff?.supplierRequestNumber || '';
      return `<tr style="cursor:${isDraft ? 'default' : 'pointer'}" onclick="${isDraft ? '' : `App.openProgram('${p.id}')`}">
        <td onclick="App._inlineEdit(event,'${p.id}','season')" style="cursor:pointer;user-select:none" title="Click to edit season">${p.season || '<span class="text-muted">—</span>'}</td>
        <td onclick="App._inlineEdit(event,'${p.id}','year')" style="cursor:pointer;user-select:none" title="Click to edit year">${p.year || '<span class="text-muted">—</span>'}</td>
        <td onclick="App._inlineEdit(event,'${p.id}','gender')" style="cursor:pointer;user-select:none" title="Click to edit gender">${p.gender ? `<span class="tag">${p.gender}</span>` : '<span class="text-muted">—</span>'}</td>
        <td onclick="App._inlineEdit(event,'${p.id}','brand')" style="cursor:pointer;user-select:none" title="Click to edit brand">${p.brand || '<span class="text-muted">—</span>'}</td>
        <td onclick="App._inlineEdit(event,'${p.id}','retailer')" style="cursor:pointer;user-select:none" title="Click to edit tier">${p.retailer ? `<span class="tag" style="font-size:0.75rem">${p.retailer}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>${stageBadge(p.status)}</td>
        <td>${srNum ? `<span class="tag" style="font-family:monospace;font-size:0.78rem">${srNum}</span>` : '<span class="text-muted text-sm">—</span>'}</td>
        <td><span class="tag" style="font-size:0.75rem;background:rgba(99,102,241,0.12);color:#818cf8">v${p.version || 1}</span></td>
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
            ${isDraft
              ? (isAdminOrPC
                  ? `<button class="btn btn-secondary btn-sm" onclick="App.openProgram('${p.id}')">👁 Preview</button>
                     <button class="btn btn-primary btn-sm" onclick="App.acknowledgeProgram('${p.id}')">✅ Release</button>`
                  : `<button class="btn btn-secondary btn-sm" onclick="App.openProgram('${p.id}')">👁 Preview</button>`)
              : (isAdminOrPC
                  ? `<button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">📋 Costs</button>
                     <button class="btn btn-secondary btn-sm" onclick="App.navigate('styles','${p.id}')">Styles</button>
                     <button class="btn btn-secondary btn-sm" onclick="App.openProgramModal('${p.id}')">Edit</button>
                     <button class="btn btn-danger btn-sm" onclick="App.deleteProgram('${p.id}')">🗑</button>`
                  : `<button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">👁 View</button>`)
            }
          </div>
        </td>
      </tr>`;
    }).join('');

    const allRows = handoffRows + requestRows + programRows;
    if (!allRows.trim()) return `<div class="empty-state"><div class="icon">📋</div><h3>No programs yet</h3></div>`;

    return `<div class="card" style="padding:0"><div class="table-wrap"><table id="programs-tbl">${thead}<tbody>${allRows}</tbody></table></div></div>`;
  }

  function programCard(p) {
    const styleCount = p.styleCount || 0;
    const tcCount = p.tcCount || 0;
    const quotedCount = p.quotedCount || 0;
    return `
    <div class="program-card status-${p.status.toLowerCase()}" onclick="App.openProgram('${p.id}')" data-name="${p.name.toLowerCase()}" data-status="${p.status}">
      <div class="program-card-header">
        <div><div class="program-name">${p.name}</div><div class="program-meta">${[p.season, p.year, p.gender, p.retailer, p.market].filter(Boolean).join(' · ')}</div></div>
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

  function renderStyleManager(programId) {
    const prog   = API.Programs.get(programId);
    const styles = API.Styles.byProgram(programId);
    const tcs    = API.Assignments.byProgram(programId);
    const links  = API.StyleLinks.byProgram(programId);
    const linkedIds = new Set(links.flatMap(l => l.styleIds || []));

    // ── Link Groups summary panel ──────────────────────────────
    const linkGroupCards = links.map(lnk => {
      const members = (lnk.styleIds||[]).map(id => styles.find(s => s.id === id)).filter(Boolean);
      const prefTc  = lnk.preferredTcId ? API.TradingCompanies.get(lnk.preferredTcId) : null;
      return `<div class="style-link-group-card" style="border-left:4px solid ${lnk.color||'#6366f1'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
              ${members.map(s => `<span class="tag" style="background:${lnk.color||'#6366f1'}22;color:${lnk.color||'#6366f1'};border:1px solid ${lnk.color||'#6366f1'}44">${s.styleNumber}</span>`).join('')}
            </div>
            ${members.map(s => `<div class="text-sm text-muted" style="font-size:0.7rem">${s.styleNumber}: ${(s.fabrication||'').substring(0,40)||'No fabric'}</div>`).join('')}
            ${lnk.note ? `<div style="margin-top:5px;font-size:0.8rem;color:var(--text-secondary);font-style:italic">"${lnk.note}"</div>` : ''}
            ${prefTc ? `<div style="margin-top:4px"><span class="tag" style="font-size:0.7rem">Pref: ${prefTc.code}</span></div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm" onclick="App.editStyleLink('${lnk.id}','${programId}')">✏ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteStyleLink('${lnk.id}','${programId}')">🗑</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const linkGroupsPanel = links.length > 0 ? `
    <div class="card mb-3" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="font-bold" style="font-size:0.9rem">🔗 Linked Groups <span class="tag" style="font-size:0.75rem">${links.length}</span></div>
        <button class="btn btn-primary btn-sm" onclick="App.openStyleLinkModal('${programId}')">＋ New Group</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">${linkGroupCards}</div>
    </div>` : '';

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
        <button class="btn btn-secondary" id="link-mode-btn" onclick="App.toggleStyleLinkMode('${programId}')">🔗 Link Styles</button>
        <button class="btn btn-primary" onclick="App.openStyleModal('${programId}')">＋ Add Style</button>
      </div>
    </div>
    ${tcs.length === 0 ? `<div class="alert alert-warning mb-3">⚠ No trading companies assigned. <button class="btn btn-warning btn-sm" onclick="App.openAssignTCs('${programId}')">Assign Now</button></div>` : ''}
    ${linkGroupsPanel}
    <div class="card">
      <div class="table-controls" id="style-table-controls"></div>
      <div class="table-wrap" id="style-table-wrap">
        <table id="style-table">
          <thead><tr>
            <th class="sel-col"><input type="checkbox" id="sel-all-chk" title="Select all" onchange="App.selectAllStyles('${programId}',this.checked)"></th>
            <th id="link-chk-col" style="display:none;width:32px"></th>
            <th data-col="styleNum">Style #</th><th data-col="styleName">Style Name</th>
            <th data-col="cat">Category</th><th data-col="fab">Fabrication</th>
            <th data-col="qty">Proj Qty</th><th data-col="sell">Proj Sell</th>
            <th data-col="ldp">Target LDP</th><th data-col="duty">Duty Rate</th>
            <th data-col="quotes">Quotes</th><th data-col="status">Status</th><th data-col="tp" style="min-width:130px">Tech Pack</th><th data-col="actions">Actions</th>
          </tr></thead>
          <tbody>
            ${styles.length ? styles.map(s => styleRow(s, prog, linkedIds)).join('') : `<tr><td colspan="12" class="text-center text-muted" style="padding:40px">No styles yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <!-- Floating action bar for link mode -->
    <div id="link-fab" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:200;
      background:var(--bg-elevated);border:1px solid var(--border);border-radius:40px;
      padding:10px 22px;box-shadow:0 8px 32px rgba(0,0,0,0.35);display:none;align-items:center;gap:12px">
      <span id="link-fab-count" style="font-weight:700;color:var(--accent)">0 selected</span>
      <button class="btn btn-primary" id="link-fab-btn" onclick="App.openStyleLinkFromSelection('${programId}')">🔗 Link Selected →</button>
      <button class="btn btn-ghost btn-sm" onclick="App.cancelStyleLinkMode('${programId}')">✕ Cancel</button>
    </div>`;
  }

  function styleRow(s, prog, linkedIds) {
    linkedIds = linkedIds || new Set();
    const link = API.StyleLinks.byStyle(s.id);
    const isLinked = !!link;
    const linkBadge = isLinked
      ? `<span class="style-link-badge" style="background:${link.color||'#6366f1'}22;color:${link.color||'#6366f1'};border-color:${link.color||'#6366f1'}44" onclick="App.openStyleLinkDetail('${link.id}','${s.programId}')">🔗</span>`
      : '';
    const subs = API.Submissions.byStyle(s.id);
    const targetLDP = API.computeTargetLDP(s, prog);
    const flagged = subs.filter(x => x.status === 'flagged').length;
    const bestLDP = subs.reduce((best, sub) => {
      if (!sub.fob) return best;
      const r = API.calcLDP(parseFloat(sub.fob), s, sub.coo, s.market || 'USA', 'NY', sub.paymentTerms, sub.factoryCost);
      return (r && (best === null || r.ldp < best)) ? r.ldp : best;
    }, null);
    const cooRate = API.CooRates.get(s.defaultCoo || 'KH');
    const totalDuty = ((s.dutyRate || 0) + (cooRate?.addlDuty || 0)) * 100;
    return `<tr data-style-id="${s.id}">
      <td class="sel-col">
        <input type="checkbox" class="style-sel-chk" data-sid="${s.id}"
          onchange="App.onStyleSelect('${s.id}',this.checked,'${s.programId}')">
      </td>
      <td id="link-chk-cell-${s.id}" style="display:none;width:32px;text-align:center">
        <input type="checkbox" class="style-link-chk" data-sid="${s.id}"
          ${linkedIds.has(s.id) ? 'disabled title="Already in a group"' : ''}
          onchange="App.onStyleLinkCheck('${s.programId}')">
      </td>
      <td data-col="styleNum" class="primary">${s.styleNumber}${linkBadge}${prog && ['Costing','Placed'].includes(prog.status) ? ' <span title=\'Style Locked — re-cost required for changes\' style=\'font-size:0.75rem;opacity:0.6\'>🔒</span>' : ''}</td>
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
      <td data-col="tp" title="Tech Pack Status">
        <span class="tp-badge tp-${s.techPackStatus || 'not_submitted'}"
          onclick="App.openTechPackHistory('${s.id}')"
          style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;
                 padding:3px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;
                 border:1px solid currentColor;opacity:0.85;user-select:none">
          ${{not_submitted:'⬜ Not Submitted', submitted:'📦 Submitted', changed:'🔄 Changed'}[s.techPackStatus || 'not_submitted']}
        </span>
      </td>
      <td data-col="actions">
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openCostComparison('${s.id}')">📊</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openStyleModal('${s.programId}','${s.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteStyle('${s.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }



  // ── Program header editable strip ──────────────────────────────────────────
  function renderProgHeaderStrip(prog) {
    const chip = (field, label, value) => `<span class="prog-hdr-chip"
        onclick="event.stopPropagation();App._editProgHeader('${prog.id}','${field}',this)"
        title="Click to edit ${label}"
        style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
               background:var(--bg-elevated);border:1px solid var(--border);
               border-radius:20px;cursor:pointer;font-size:0.82rem;
               transition:border-color .15s,background .15s;user-select:none"
        onmouseover="this.style.borderColor='var(--accent)'"
        onmouseout="this.style.borderColor='var(--border)'">
      <span class="text-muted" style="font-size:0.72rem;white-space:nowrap">${label}</span>
      <span class="chip-val" style="font-weight:600;margin-left:2px">${value || '—'}</span>
      <span style="opacity:0.3;font-size:0.65rem;margin-left:2px">&#x270F;</span>
    </span>`;
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;margin-bottom:2px">
      <span class="prog-hdr-chip" style="opacity:0.8;cursor:default;pointer-events:none">
        <span class="prog-hdr-chip-label">Version</span>
        <span class="prog-hdr-chip-val" style="color:var(--accent)">v${prog.version || 1}</span>
      </span>
      ${chip('brand',    'Brand',    prog.brand)}
      ${chip('retailer', 'Retailer', prog.retailer)}
      ${chip('gender',   'Gender',   prog.gender)}
      ${chip('season',   'Season',   prog.season)}
      ${chip('year',     'Year',     prog.year)}
      ${chip('market',   'Market',   prog.market || 'USA')}
    </div>`;
  }

  // ── Cost Summary Matrix ────────────────────────────────────
  function renderCostSummary(programId) {
    const prog = API.Programs.get(programId);
    const styles = API.Styles.byProgram(programId);
    const asgns = API.Assignments.byProgram(programId);
    const tcs = asgns.map(a => a.tc).filter(Boolean);
    // Build (TC, COO) column list: one column group per TC×COO combination.
    // COOs come from the assignment (user-selected per program), not tc.coos.
    const colGroups = asgns.flatMap(a => (a.coos || []).map(coo => ({ tc: a.tc, coo })));

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
        <p class="page-subtitle">${statusBadge(prog.status)} ${styles.length} styles · ${tcs.length} trading companies</p>
        ${renderProgHeaderStrip(prog)}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-secondary" onclick="App.navigate('styles','${programId}')">📝 Styles</button>
        <button class="btn btn-secondary" onclick="App.openAssignTCs('${programId}')">🏭 Trading Cos.</button>
        <button class="btn btn-ghost btn-sm" onclick="App.expandAllTCs('${programId}')" title="Expand all vendor columns">⊞ Expand All</button>
        <button class="btn btn-ghost btn-sm" onclick="App.collapseAllTCs('${programId}')" title="Collapse all vendor columns">⊟ Collapse All</button>
        <button class="btn btn-primary" onclick="App.openStyleModal('${programId}')">＋ Add Style</button>
        <button class="btn btn-success" onclick="App.placeAllStyles('${programId}')" title="Place all styles and mark program as Placed">🏆 Mark as Placed</button>
        <button class="btn btn-ghost btn-sm" onclick="App.openMarginRecap('${programId}')" title="View margin breakdown by TC and customer" style="border:1px solid var(--border)">📊 Margin Recap</button>
      </div>
    </div>
    ${tcs.length === 0 ? `<div class="alert alert-warning">No trading companies assigned. <button class="btn btn-warning btn-sm" onclick="App.openAssignTCs('${programId}')">Assign</button></div>` : ''}
    <div id="recosting-banner">${typeof App !== 'undefined' && App._renderRecostBanner ? App._renderRecostBanner(programId) : ''}</div>
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
    </div>
    <!-- Multi-select floating action bar -->
    <div id="sel-fab" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:300;
      background:var(--bg-elevated);border:1px solid var(--border);border-radius:40px;
      padding:10px 20px;box-shadow:0 8px 32px rgba(0,0,0,0.4);align-items:center;gap:10px;flex-wrap:wrap">
      <span id="sel-fab-count" style="font-weight:700;color:var(--accent);white-space:nowrap">0 selected</span>
      <button id="sel-fab-link"   class="btn btn-secondary btn-sm" disabled onclick="App.bulkLinkStyles('${programId}')">🔗 Link</button>
      <button id="sel-fab-unlink" class="btn btn-secondary btn-sm" onclick="App.bulkUnlinkStyles()">🔗✕ Un-Link</button>
      <button class="btn btn-danger btn-sm" onclick="App.bulkCancelStyles()">✕ Cancel</button>
      <button class="btn btn-warning btn-sm" onclick="App.bulkRequestRecost('${programId}')">↩ Re-cost</button>
      <button class="btn btn-ghost btn-sm" onclick="App.clearStyleSelection()" style="border:1px solid var(--border)">✕ Clear</button>
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
      <th rowspan="2" class="sel-col sticky-col mat-hdr" style="width:36px;min-width:36px">
        <input type="checkbox" id="sel-all-chk" class="sel-col-chk" title="Select all" onchange="App.selectAllStyles('${programId}',this.checked)">
      </th>
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
    const _allStylesGlobal   = API.Styles.all();
    const _allSubsGlobal     = API.Submissions.all();
    const _allPlacements     = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const _allPrograms       = API.cache.programs;
    // repeatHistory[styleNumber] = sorted array of {prog, tc, coo, fob, ldp}
    const repeatHistory = {};
    _allPlacements.forEach(pl => {
      const pastStyle = _allStylesGlobal.find(s => s.id === pl.styleId);
      if (!pastStyle || pastStyle.programId === programId) return; // skip current program
      const sn = (pastStyle.styleNumber || '').trim();
      if (!sn) return;
      const prog = _allPrograms.find(p => p.id === pastStyle.programId);
      const tc   = API.TradingCompanies.get(pl.tcId);
      const sub  = _allSubsGlobal.find(s => s.styleId === pl.styleId && s.tcId === pl.tcId && s.coo === pl.coo);
      const fob  = parseFloat(pl.confirmedFob || sub?.fob || 0);
      const r    = fob > 0 ? API.calcLDP(fob, pastStyle, pl.coo, pastStyle.market || 'USA', 'NY',
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
        const allSubs = API.Submissions.byStyle(s.id);
        const targetLDP = API.computeTargetLDP(s, prog);
        let bestLDP = null, bestKey = null;
        colGroups.forEach(({ tc, coo }) => {
          const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
          if (sub?.fob) {
            const r = API.calcLDP(parseFloat(sub.fob), s, coo, s.market || 'USA', 'NY', tc.paymentTerms || sub?.paymentTerms || 'FOB', sub?.factoryCost);
            if (r && (bestLDP === null || r.ldp < bestLDP)) { bestLDP = r.ldp; bestKey = `${tc.id}_${coo}`; }
          }
        });

        const pid = programId;
        const placement = API.Placements.get(s.id); // needed for green highlight in TC cells

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
        const styleBuys   = API.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
        const actualQty   = styleBuys.reduce((sum, b) => sum + (parseFloat(b.qty) || 0), 0);
        const buyRevenue  = styleBuys.reduce((sum, b) => sum + ((parseFloat(b.qty) || 0) * (parseFloat(b.sellPrice) || 0)), 0);
        const wtdSell     = actualQty > 0 ? buyRevenue / actualQty : null;
        const actualQtyStr = actualQty > 0 ? actualQty.toLocaleString() : '<span class="text-muted">—</span>';
        const wtdSellStr   = wtdSell   ? '$' + wtdSell.toFixed(2)      : '<span class="text-muted">—</span>';

        const bestGroup = colGroups.find(g => `${g.tc.id}_${g.coo}` === bestKey);

        // ── Best TC: if placed, show placed vendor + optional cost-premium badge ──
        let bestTcHtml;
        if (placement) {
          const placedGroup = colGroups.find(g => g.tc.id === placement.tcId && g.coo === placement.coo);
          let placedLDP = null;
          if (placedGroup) {
            const placedSub = allSubs.find(x => x.tcId === placement.tcId && x.coo === placement.coo);
            if (placedSub?.fob) {
              const pr = API.calcLDP(parseFloat(placedSub.fob), s, placement.coo,
                s.market || 'USA', 'NY',
                placedGroup.tc.paymentTerms || placedSub?.paymentTerms || 'FOB',
                placedSub?.factoryCost);
              placedLDP = pr?.ldp ?? null;
            }
          }
          // Fall back to cheapest if placed TC isn't in current colGroups (was removed)
          const displayGroup = placedGroup || bestGroup;
          const displayLDP   = placedLDP ?? bestLDP;
          const onTarget     = displayLDP !== null && targetLDP && displayLDP <= targetLDP;
          const tagCls       = onTarget ? 'tag-success' : targetLDP ? 'tag-danger' : '';
          const tcLabel      = displayGroup ? `${displayGroup.tc.code} — ${displayGroup.coo}` : '—';
          // Show premium only when placed TC is genuinely more expensive
          const premium = (placedLDP !== null && bestLDP !== null && placedGroup && Math.abs(placedLDP - bestLDP) > 0.004)
            ? placedLDP - bestLDP : null;
          bestTcHtml =
            `<span class="tag ${tagCls}" style="margin-bottom:1px">${tcLabel}</span>` +
            `<span style="font-size:0.58rem;color:#94a3b8;display:block;margin-top:1px;letter-spacing:.02em">📦 Placed</span>` +
            (premium !== null && premium > 0
              ? `<span style="font-size:0.62rem;color:#f97316;font-weight:700;display:block">▲ +${fmt(premium)} vs cheapest</span>`
              : '');
        } else {
          // No placement — show lowest-LDP vendor (original behaviour)
          const onTarget = targetLDP && bestLDP !== null && bestLDP <= targetLDP;
          const tagCls   = onTarget ? 'tag-success' : targetLDP ? 'tag-danger' : '';
          bestTcHtml = bestGroup
            ? `<span class="tag ${tagCls}">${bestGroup.tc.code} — ${bestGroup.coo}</span>`
            : '—';
        }

        let rowHtml = `
          <td data-col="styleNum" class="sticky-col mat-cell-white">${s.styleNumber}${s._linkAnchorBadge||''}</td>
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
          <td data-col="best" class="text-sm col-best" style="line-height:1.35">${bestTcHtml}</td>`;

        colGroups.forEach(({ tc, coo }, tcIdx) => {
          const k = `${tc.id}_${coo}`;
          const tcColorClass = tcIdx % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
          const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
          // Use TC-level payment terms (falls back to submission terms for backward compat, then 'FOB')
          const effectiveTerms = tc.paymentTerms || sub?.paymentTerms || 'FOB';
          const r = sub?.fob ? API.calcLDP(parseFloat(sub.fob), s, coo, s.market || 'USA', 'NY', effectiveTerms, sub?.factoryCost) : null;
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
          const fobFlag = sub ? API.CellFlags.get(sub.id, 'fob') : null;
          const fcFlag  = sub ? API.CellFlags.get(sub.id, 'factoryCost') : null;
          const fobRevs = sub ? API.Revisions.byField(sub.id, 'fob').length : 0;
          const fcRevs  = sub ? API.Revisions.byField(sub.id, 'factoryCost').length : 0;
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
        return `<tr class="${rowClass}" data-style-id="${s.id}"><td class="sel-col sticky-col mat-cell-white" style="width:36px;min-width:36px"><input type="checkbox" class="style-sel-chk" data-sid="${s.id}" onchange="App.onStyleSelect('${s.id}',this.checked,'${programId}')"></td>${rowHtml}</tr>`;
      }).join('');
    }

    // ── Aggregation helpers ───────────────────────────────────
    const styleActualQty = s => {
      const buys = API.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
      return buys.reduce((sum, b) => sum + (parseFloat(b.qty) || 0), 0);
    };

    // ── Style Link anchor resolution ──────────────────────────
    // For each link group: anchor = style with highest projQty.
    // Guest styles (different fabric from anchor) will be rendered as
    // indented sub-rows under the anchor's fabric band.
    const progLinks     = API.StyleLinks.byProgram(programId);
    // Map: styleId → link group
    const styleToLink   = {};
    progLinks.forEach(lnk => (lnk.styleIds || []).forEach(sid => { styleToLink[sid] = lnk; }));
    // Map: styleId → anchor styleId for this link group
    const styleAnchorId = {};
    // Set of guest styleIds (appear under another fabric group, not their own)
    const guestStyleIds = new Set();
    progLinks.forEach(lnk => {
      const members = (lnk.styleIds || []).map(sid => activeStyles.find(s => s.id === sid)).filter(Boolean);
      if (members.length < 2) return;
      const anchor = members.reduce((best, s) => (parseFloat(s.projQty)||0) >= (parseFloat(best.projQty)||0) ? s : best, members[0]);
      members.forEach(s => {
        styleAnchorId[s.id] = anchor.id;
        if (s.id !== anchor.id && (s.fabrication||'').trim() !== (anchor.fabrication||'').trim()) {
          guestStyleIds.add(s.id);
        }
      });
    });

    // Helper to build a single guest sub-row (indented, tinted, with link badge)
    function buildGuestRow(s, lnk) {
      const anchorStyle = activeStyles.find(x => x.id === styleAnchorId[s.id]);
      const color      = lnk.color || '#6366f1';
      const colorAlpha = color + '18'; // ~9% opacity tint
      const badge      = `<span class="style-link-badge" style="background:${color}22;color:${color};border-color:${color}44"
        title="Linked group: ${(lnk.note||'').replace(/"/g,'&quot;')}" onclick="App.openStyleLinkDetail('${lnk.id}','${programId}')">🔗 w/ ${anchorStyle?.styleNumber||'?'}</span>`;
      // Render a full row but prefixed with ↳ indent styling
      const allSubs = API.Submissions.byStyle(s.id);
      const targetLDP = API.computeTargetLDP(s, prog);
      let bestLDP = null, bestKey = null;
      colGroups.forEach(({ tc, coo }) => {
        const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
        if (sub?.fob) {
          const r = API.calcLDP(parseFloat(sub.fob), s, coo, s.market || 'USA', 'NY', tc.paymentTerms || sub?.paymentTerms || 'FOB', sub?.factoryCost);
          if (r && (bestLDP === null || r.ldp < bestLDP)) { bestLDP = r.ldp; bestKey = `${tc.id}_${coo}`; }
        }
      });
      const placement  = API.Placements.get(s.id);
      const qtyFmt     = s.projQty ? Number(s.projQty).toLocaleString() : '';
      const sellFmt    = s.projSellPrice ? '$' + parseFloat(s.projSellPrice).toFixed(2) : '';
      const dutyFmt    = s.dutyRate ? (parseFloat(s.dutyRate) * 100).toFixed(1) + '%' : '';
      const frtFmt     = s.estFreight ? '$' + parseFloat(s.estFreight).toFixed(2) : '';
      const styleNameInput = `<input class="cell-input cell-input-wide" data-sid="${s.id}" data-field="styleName" value="${(s.styleName||'').replace(/"/g,'&quot;')}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
      const catInput   = `<input class="cell-input" data-sid="${s.id}" data-field="category" value="${(s.category||'').replace(/"/g,'&quot;')}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
      const fabInput   = `<input class="cell-input cell-input-wide" data-sid="${s.id}" data-field="fabrication" value="${(s.fabrication||'').replace(/"/g,'&quot;').substring(0,40)}" onblur="App.saveStyleInline('${s.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">`;
      const qtyInput   = `<input class="cell-input cell-input-sm fmt-qty" data-sid="${s.id}" data-field="projQty" data-raw="${s.projQty||''}" value="${qtyFmt}" placeholder="Qty" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurQty(this,'${s.id}')" onkeydown="if(event.key==='Enter')this.blur()">`;
      const sellInput  = `<input class="cell-input cell-input-sm fmt-sell" data-sid="${s.id}" data-field="projSellPrice" data-raw="${s.projSellPrice||''}" value="${sellFmt}" placeholder="Sell" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurCurrency(this,'${s.id}','projSellPrice')" onkeydown="if(event.key==='Enter')this.blur()">`;
      const dutyInput  = `<input class="cell-input cell-input-sm fmt-duty" data-sid="${s.id}" data-field="dutyRate" data-raw="${s.dutyRate||''}" value="${dutyFmt}" placeholder="e.g. 28.2%" onfocus="App.fmtFocusDuty(this)" onblur="App.fmtBlurDuty(this,'${s.id}')" onkeydown="if(event.key==='Enter')this.blur()">`;
      const freightInput = `<input class="cell-input cell-input-sm fmt-freight" data-sid="${s.id}" data-field="estFreight" data-raw="${s.estFreight||''}" value="${frtFmt}" placeholder="$0.00" onfocus="App.fmtFocusRaw(this)" onblur="App.fmtBlurCurrency(this,'${s.id}','estFreight')" onkeydown="if(event.key==='Enter')this.blur()">`;
      const styleBuys  = API.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
      const actualQty  = styleBuys.reduce((sum, b) => sum + (parseFloat(b.qty)||0), 0);
      const buyRevenue = styleBuys.reduce((sum, b) => sum + ((parseFloat(b.qty)||0)*(parseFloat(b.sellPrice)||0)), 0);
      const wtdSell    = actualQty > 0 ? buyRevenue / actualQty : null;
      const bestGroup  = colGroups.find(g => `${g.tc.id}_${g.coo}` === bestKey);
      const onTarget   = targetLDP && bestLDP !== null && bestLDP <= targetLDP;
      const tagCls     = onTarget ? 'tag-success' : targetLDP ? 'tag-danger' : '';
      const bestTcHtml = bestGroup ? `<span class="tag ${tagCls}">${bestGroup.tc.code} — ${bestGroup.coo}</span>` : '—';
      let rowHtml = `
        <td data-col="styleNum" class="sticky-col mat-cell-white" style="border-left:3px solid ${color};padding-left:18px">
          <span style="color:${color};font-size:0.85em;margin-right:4px">↳</span>${s.styleNumber}${badge}
        </td>
        <td data-col="styleName" class="mat-cell-white mat-cell-normal">${styleNameInput}</td>
        <td data-col="cat" class="mat-cell-white mat-cell-normal">${catInput}</td>
        <td data-col="fab" class="mat-cell-white mat-cell-normal">${fabInput}</td>
        <td data-col="qty" class="mat-cell-white">${qtyInput}</td>
        <td data-col="sell" class="mat-cell-white">${sellInput}</td>
        <td data-col="actualQty" class="text-center font-bold" style="border-left:2px solid var(--accent);color:var(--accent);font-size:0.82rem">${actualQty > 0 ? actualQty.toLocaleString() : '<span class="text-muted">—</span>'}</td>
        <td data-col="wtdSell" class="text-center text-sm" style="color:var(--text-secondary)">${wtdSell ? '$'+wtdSell.toFixed(2) : '<span class="text-muted">—</span>'}</td>
        <td data-col="tldp" class="col-target font-bold text-accent">${fmt(targetLDP)}</td>
        <td data-col="dutyRate" class="col-duty-rate mat-cell-white">${dutyInput}</td>
        <td data-col="estFreight" class="col-est-freight mat-cell-white">${freightInput}</td>
        <td data-col="best" class="text-sm col-best" style="line-height:1.35">${bestTcHtml}</td>`;
      colGroups.forEach(({ tc, coo }, tcIdx) => {
        const k = `${tc.id}_${coo}`;
        const tcColorClass = tcIdx % 2 === 0 ? 'tc-col-even' : 'tc-col-odd';
        const sub = allSubs.find(x => x.tcId === tc.id && x.coo === coo);
        const effectiveTerms = tc.paymentTerms || sub?.paymentTerms || 'FOB';
        const r = sub?.fob ? API.calcLDP(parseFloat(sub.fob), s, coo, s.market||'USA','NY',effectiveTerms,sub?.factoryCost) : null;
        const flagIcon = sub?.status === 'flagged' ? ' 🚩' : sub?.status === 'accepted' ? ' ✅' : '';
        const fobInput2 = `<input class="cell-input" type="text" inputmode="decimal"
          data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="fob"
          value="${sub?.fob ? '$'+parseFloat(sub.fob).toFixed(2) : ''}" placeholder="FOB"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this);if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);"
          onkeydown="if(event.key==='Enter')this.blur()">${flagIcon}`;
        const fcInput2 = `<input class="cell-input" type="text" inputmode="decimal"
          data-sid="${s.id}" data-tcid="${tc.id}" data-coo="${coo}" data-field="factoryCost"
          value="${sub?.factoryCost ? '$'+parseFloat(sub.factoryCost).toFixed(2) : ''}" placeholder="Cost"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="App.saveSubmissionInline('${s.id}','${tc.id}','${coo}',this);if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);"
          onkeydown="if(event.key==='Enter')this.blur()">`;
        const fobFlag= sub ? API.CellFlags.get(sub.id,'fob') : null;
        const fcFlag = sub ? API.CellFlags.get(sub.id,'factoryCost') : null;
        const fobRevs= sub ? API.Revisions.byField(sub.id,'fob').length : 0;
        const fcRevs = sub ? API.Revisions.byField(sub.id,'factoryCost').length : 0;
        const cw = (inputHtml, flag, revCount, subId, field) => {
          const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||flag.color).replace(/"/g,'&quot;')}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;"></span>` : '';
          const hist = revCount > 0 ? `<span class="revision-badge revision-badge-new" onclick="App.openRevisionHistory('${subId}','${field}')">&#128338;${revCount>1?' '+revCount:''}</span>` : '';
          return `<div class="flaggable-cell${flag?' has-flag':''}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;">${inputHtml}${dot}${hist}</div>`;
        };
        const dutyPct = r ? pct(r.dutyRate) : '—';
        const dutyAmt = r ? fmt(r.duty) : '—';
        const freightCell = r ? (r.freight!=null ? fmt(r.freight) : `<span class="text-muted text-sm">N/A</span>`) : '—';
        const ldpCell = r ? `<span>${fmt(r.ldp)}</span>` : '<span class="text-muted">—</span>';
        const collapsed = _collapsedTCs.has(k);
        const hideStyle = collapsed ? ' style="display:none"' : '';
        rowHtml += `
          <td data-col="${k}_fob" class="col-vendor-sub ${tcColorClass}">${cw(fobInput2,fobFlag,fobRevs,sub?.id||'','fob')}</td>
          <td data-col="${k}_fc" class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${cw(fcInput2,fcFlag,fcRevs,sub?.id||'','factoryCost')}</td>
          <td data-col="${k}_duty_pct" class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyPct}</td>
          <td data-col="${k}_duty_amt" class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${dutyAmt}</td>
          <td data-col="${k}_freight" class="col-vendor-sub tc-detail-col text-sm ${tcColorClass}" data-tckey="${k}"${hideStyle}>${freightCell}</td>
          <td data-col="${k}_ldp" class="col-vendor-sub col-ldp ${tcColorClass}">${ldpCell}</td>`;
      });
      rowHtml += `<td data-col="actions"><button class="btn-cancel-style" onclick="App.cancelStyle('${s.id}','${programId}')">🚫 Cancel</button></td>`;
      const sn2 = (s.styleNumber||'').trim();
      const hist2 = sn2 ? (repeatHistory[sn2]||[]) : [];
      if (!hist2.length) {
        rowHtml += `<td data-col="repeat" class="text-muted text-sm" style="text-align:center">—</td>`;
      } else {
        const last = hist2[0];
        rowHtml += `<td data-col="repeat" style="font-size:0.78rem;white-space:nowrap;padding:6px 10px"><div style="font-weight:600;color:var(--accent)">${last.tcCode} · ${last.coo}</div><div style="color:var(--text-secondary)">${last.season}&nbsp; FOB $${last.fob.toFixed(2)}</div></td>`;
      }
      const rowClass2 = bestLDP !== null && targetLDP ? (bestLDP <= targetLDP ? 'row-on-target' : 'row-over-target') : '';
      return `<tr class="style-link-guest-row ${rowClass2}" style="background:${colorAlpha}">${rowHtml}</tr>`;
    }

    // Build active rows — optionally grouped
    let activeRows = '';
    const totalFixedCols = 12 + colGroups.length * 6 + 2; // +2 actual/wtd, +2 actions+repeat
    if (groupBy === 'fabrication') {
      const groups = {};
      const groupOrder = [];
      activeStyles.forEach(s => {
        // Guest styles are rendered under the anchor's fabric band, not their own
        if (guestStyleIds.has(s.id)) return;
        const key = (s.fabrication || '—').trim() || '—';
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(s);
      });
      // For each anchor style, collect its guests
      const guestsByAnchorFab = {};
      guestStyleIds.forEach(gid => {
        const ancId = styleAnchorId[gid];
        const anchor = activeStyles.find(s => s.id === ancId);
        if (!anchor) return;
        const fab = (anchor.fabrication || '—').trim() || '—';
        if (!guestsByAnchorFab[fab]) guestsByAnchorFab[fab] = [];
        guestsByAnchorFab[fab].push(activeStyles.find(s => s.id === gid));
      });
      groupOrder.forEach(fab => {
        const grpStyles    = groups[fab];
        // Include guest qty in the group header totals (they visually belong here)
        const guests       = (guestsByAnchorFab[fab] || []).filter(Boolean);
        const allInBand    = [...grpStyles, ...guests];
        const grpProjQty   = allInBand.reduce((sum, s) => sum + (parseFloat(s.projQty)||0), 0);
        const grpActualQty = allInBand.reduce((sum, s) => sum + styleActualQty(s), 0);
        const guestNote    = guests.length ? ` <span style="font-size:0.72rem;color:#94a3b8;font-weight:400">(+${guests.length} linked)</span>` : '';
        activeRows += `<tr class="cs-group-row">
          <td colspan="${totalFixedCols}">
            <span style="font-weight:600">📁 ${fab}</span>${guestNote}
            <span class="cs-group-count">${allInBand.length} style${allInBand.length !== 1 ? 's' : ''}</span>
            <span class="cs-subtotal">Proj QTY: <strong>${grpProjQty > 0 ? grpProjQty.toLocaleString() : '—'}</strong></span>
            <span class="cs-subtotal">Actual QTY: <strong style="color:var(--accent)">${grpActualQty > 0 ? grpActualQty.toLocaleString() : '—'}</strong></span>
          </td>
        </tr>`;
        // Render native styles in this fabric band (with link badge on anchors)
        activeRows += buildRows(grpStyles.map(s => {
          // Inject link metadata so buildRows can show anchor badge
          return { ...s, _linkAnchorBadge: (() => {
            const lnk = styleToLink[s.id];
            if (!lnk) return '';
            const guests2 = (lnk.styleIds||[]).filter(id => id !== s.id && guestStyleIds.has(id));
            if (!guests2.length) return '';
            const color2 = lnk.color||'#6366f1';
            return `<span class="style-link-badge style-link-anchor" style="background:${color2}22;color:${color2};border-color:${color2}44"
              onclick="App.openStyleLinkDetail('${lnk.id}','${programId}')">🔗 ${guests2.length} linked</span>`;
          })() };
        }), false);
        // Render guest rows (indented sub-rows) after native rows
        guests.forEach(g => {
          const lnk = styleToLink[g.id];
          if (lnk) activeRows += buildGuestRow(g, lnk);
        });
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
    const style = API.Styles.get(styleId);
    const prog = API.Programs.get(style.programId);
    const asgns = API.Assignments.byProgram(style.programId);
    const subs = API.Submissions.byStyle(styleId);
    const placement = API.Placements.get(styleId);
    const targetLDP = API.computeTargetLDP(style, prog);

    let bestLDP = Infinity;
    subs.forEach(s => {
      if (s.fob) {
        const subTc = API.TradingCompanies.get(s.tcId);
        const terms = subTc?.paymentTerms || s.paymentTerms || 'FOB';
        const r = API.calcLDP(parseFloat(s.fob), style, s.coo, style.market || 'USA', 'NY', terms, s.factoryCost);
        if (r && r.ldp < bestLDP) bestLDP = r.ldp;
      }
    });

    const tcCooBlocks = asgns.flatMap(a => {
      if (!a.tc) return [];
      return (a.coos || []).map(coo => ({ tc: a.tc, coo, sub: subs.find(s => s.tcId === a.tc.id && s.coo === coo) || null }));
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
    ${placement ? `<div class="alert alert-success mb-3">🏆 Placed with <strong>${API.TradingCompanies.get(placement.tcId)?.code || ''} (${placement.coo})</strong> at ${fmt(placement.confirmedFob)} FOB</div>` : ''}
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
    const r = sub.fob ? API.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', effectiveTerms, sub.factoryCost) : null;
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
    const programs = API.cache.programs.filter(p => p.status === 'Costing' || p.status === 'Draft');
    const allStyles = API.Styles.all().filter(s => programs.some(p => p.id === s.programId));
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
      const subs = API.Submissions.byStyle(s.id);
      const targetLDP = API.computeTargetLDP(s, prog);
      let bestLDP = null, bestTC = null;
      subs.forEach(sub => {
        if (sub.fob) { const r = API.calcLDP(parseFloat(sub.fob), s, sub.coo, s.market || 'USA', 'NY', sub.paymentTerms, sub.factoryCost); if (r && (bestLDP === null || r.ldp < bestLDP)) { bestLDP = r.ldp; bestTC = sub.tcId; } }
      });
      const bestTCObj = API.TradingCompanies.get(bestTC);
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

    // If no style rows but programs exist, show each program as an empty placeholder
    if (!rows.length) {
      const emptyPrograms = programFilter
        ? programs.filter(p => p.id === programFilter)
        : programs;
      if (!emptyPrograms.length) return `<div class="empty-state"><div class="icon">🔎</div><h3>No results</h3></div>`;
      const emptyHtml = `<table id="cp-table"><thead><tr>
        <th>Program</th><th>Season</th><th>Year</th><th>Status</th><th>Styles</th><th></th>
      </tr></thead><tbody>` +
        emptyPrograms.map(p => `<tr>
          <td class="font-bold primary">${p.name}</td>
          <td>${p.season || '—'}</td>
          <td>${p.year || '—'}</td>
          <td>${statusBadge(p.status)}</td>
          <td><span class="text-muted text-sm">No styles yet</span></td>
          <td><button class="btn btn-primary btn-sm" onclick="App.navigate('styles','${p.id}')">＋ Add Styles</button></td>
        </tr>`).join('') +
      `</tbody></table>`;
      return emptyHtml;
    }


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
    const prog     = API.Programs.get(programId);
    const styles   = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const custIds  = API.CustomerAssignments.byProgram(programId);
    const allCusts = API.cache.customers;
    const custs    = custIds.map(id => allCusts.find(c => c.id === id)).filter(Boolean);
    const allBuys  = API.CustomerBuys.byProgram(programId);
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
        <p class="page-subtitle">${prog.season || ''} ${prog.year || ''}${prog.gender ? ' · ' + prog.gender : ''}${prog.retailer ? ' · ' + prog.retailer : ''}</p></div>
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
    const custs = API.cache.customers;
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
    const tcs = API.cache.tradingCompanies;
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
    const items   = API.cache.internalPrograms;
    const margins = API.cache.brandTierMargins;
    const BRANDS  = ['Reebok','Champion','And1','Gaiam','Head'];
    const TIERS   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
    const GENDERS = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];

    const ipRows = items.length ? items.map(ip => {
      const autoM = ip.brand && ip.tier ? API.BrandTierMargins.lookup(ip.brand, ip.tier) : null;
      const isAuto = autoM !== null && Math.abs((ip.targetMargin || 0) - autoM) < 0.0001;
      const marginCell = ip.targetMargin != null
        ? `${(ip.targetMargin * 100).toFixed(1)}% ${isAuto ? '<span class="badge badge-costing" style="font-size:0.65rem">auto</span>' : '<span class="badge badge-pending" style="font-size:0.65rem">override</span>'}`
        : '<span class="text-muted">—</span>';
      return `<tr>
        <td><span class="badge">${ip.brand || '—'}</span></td>
        <td class="text-sm">${ip.tier || '—'}</td>
        <td class="text-sm">${ip.gender || '—'}</td>
        <td class="font-bold">${marginCell}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openInternalProgramModal('${ip.id}')">✏</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteInternalProgram('${ip.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="text-center text-muted" style="padding:40px">No internal programs yet.</td></tr>`;

    // ── Brand-Tier Margins reference table ──
    const groupedByBrand = BRANDS.map(brand => {
      const tierCols = TIERS.map(tier => {
        const m = margins.find(x => x.brand === brand && x.tier === tier);
        return m
          ? `<td class="text-center font-bold">${(m.targetMargin*100).toFixed(1)}%
              <button class="btn btn-ghost" style="padding:0 4px;font-size:0.7rem" onclick="App.openBrandTierMarginModal('${m.id}')">✏</button></td>`
          : `<td class="text-center text-muted" style="cursor:pointer" onclick="App.openBrandTierMarginModal(null,'${brand}','${tier}')">＋ Add</td>`;
      }).join('');
      return `<tr><td class="font-bold"><span class="badge">${brand}</span></td>${tierCols}</tr>`;
    }).join('');

    return `
    <div class="page-header">
      <div><h1 class="page-title">Internal Program Table</h1>
      <p class="page-subtitle">Program name templates — Brand/Tier drives the margin, Gender is independent metadata</p></div>
      <button class="btn btn-primary" onclick="App.openInternalProgramModal()">＋ Add</button>
    </div>
    <div class="alert alert-info mb-3">Target LDP = Proj Sell Price × Target Margin % — margin is not visible to trading companies</div>
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr><th>Brand</th><th>Tier</th><th>Gender</th><th>Target Margin</th><th>Actions</th></tr></thead>
      <tbody>${ipRows}</tbody>
    </table></div></div>

    <div class="page-header" style="margin-top:32px">
      <div><h2 class="page-title" style="font-size:1.1rem">Brand-Tier Margin Reference</h2>
        <p class="page-subtitle">One margin per Brand + Tier combo — auto-fills when creating Internal Programs</p></div>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr>
        <th>Brand</th>
        ${TIERS.map(t => `<th class="text-center">${t}</th>`).join('')}
      </tr></thead>
      <tbody>${groupedByBrand}</tbody>
    </table></div></div>`;
  }

  // ── COO Rate Table ─────────────────────────────────────────
  function renderCOO() {
    const rates = API.cache.cooRates;
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
    const all = API.PendingChanges.all().slice().reverse(); // newest first
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
  function renderStaff(tab) {
    const showDepts = tab === 'departments';
    const staff  = API.PCUsers.allStaff();
    const depts  = API.cache.departments;
    const deptMap = Object.fromEntries(depts.map(d => [d.id, d]));

    // ── tab bar ────────────────────────────────────────────────
    const tabBar = `
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px">
        <button onclick="App.navigate('staff')"
          style="padding:10px 20px;font-size:0.88rem;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:${!showDepts ? '2px solid var(--accent);color:var(--accent);margin-bottom:-2px' : '2px solid transparent;color:#94a3b8'}">
          👤 Staff (${staff.length})
        </button>
        <button onclick="App.navigate('departments')"
          style="padding:10px 20px;font-size:0.88rem;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:${showDepts ? '2px solid var(--accent);color:var(--accent);margin-bottom:-2px' : '2px solid transparent;color:#94a3b8'}">
          🏢 Departments (${depts.length})
        </button>
      </div>`;

    // ── staff tab ──────────────────────────────────────────────
    const staffContent = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="App.openStaffModal()">＋ Add Staff Member</button>
      </div>
      <div class="card" style="padding:0"><div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Actions</th></tr></thead>
        <tbody>${staff.length ? staff.map(u => {
          const dept = u.departmentId ? deptMap[u.departmentId] : null;
          return `<tr>
            <td class="font-bold">${u.name}</td>
            <td class="text-sm text-muted">${u.email}</td>
            <td>${u.role === 'admin'
              ? '<span class="badge badge-placed">Admin</span>'
              : '<span class="badge badge-costing">Staff</span>'}</td>
            <td>${dept
              ? `<span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8">${dept.name}</span>`
              : '<span class="text-muted text-sm">—</span>'}</td>
            <td><div style="display:flex;gap:6px">
              ${u.role !== 'admin' ? `
                <button class="btn btn-secondary btn-sm" onclick="App.openStaffModal('${u.id}')">✏</button>
                <button class="btn btn-danger btn-sm" onclick="App.deleteStaff('${u.id}')">🗑</button>`
              : '<span class="text-muted text-sm">Protected</span>'}
            </div></td>
          </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px;color:#94a3b8">No staff yet.</td></tr>'}
        </tbody>
      </table></div></div>`;

    // ── departments tab ──────────────────────────────────────────
    const perm = (on, label) => on
      ? `<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:500">${label}</span>`
      : `<span style="background:rgba(239,68,68,0.10);color:#ef4444;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:500">No ${label}</span>`;

    const deptRows = depts.map(d => {
      const memberCount = staff.filter(u => u.departmentId === d.id).length;
      const brands = d.brandFilter?.length ? d.brandFilter.join(', ') : '<span class="text-muted">All</span>';
      const tiers  = d.tierFilter?.length  ? d.tierFilter.join(', ')  : '<span class="text-muted">All</span>';
      return `<tr>
        <td><div class="font-bold" style="font-size:0.9rem">${d.name}</div>
            ${d.description ? `<div class="text-sm text-muted">${d.description}</div>` : ''}</td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap">
          ${perm(d.canViewFOB,       'FOB/LDP')}
          ${perm(d.canViewSellPrice, 'Sell Price')}
          ${perm(d.canEdit,          'Edit')}
        </div></td>
        <td class="text-sm">${brands}</td>
        <td class="text-sm">${tiers}</td>
        <td><span class="tag" style="cursor:pointer" onclick="App.navigate('staff')" title="Switch to staff tab">${memberCount}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="App.openDepartmentModal('${d.id}')">✏ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteDepartment('${d.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('');

    const deptContent = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" onclick="App.openDepartmentModal()">＋ New Department</button>
      </div>
      <div class="card" style="padding:0;margin-bottom:16px"><div class="table-wrap"><table>
        <thead><tr>
          <th style="min-width:180px">Department</th>
          <th>Permissions</th>
          <th>Brand Filter</th>
          <th>Tier Filter</th>
          <th title="Members">👤</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${deptRows || '<tr><td colspan="6" style="text-align:center;padding:32px;color:#94a3b8">No departments yet.</td></tr>'}</tbody>
      </table></div></div>
      <div class="card" style="background:rgba(99,102,241,0.05);border-color:rgba(99,102,241,0.2)">
        <div class="font-bold" style="margin-bottom:8px;color:#818cf8">ℹ️ How Permissions Work</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:0.82rem;color:#94a3b8">
          <div><strong style="color:var(--text-primary)">FOB / LDP</strong> — See vendor cost prices in the cost matrix.</div>
          <div><strong style="color:var(--text-primary)">Sell Price</strong> — See projected sell / buyer prices.</div>
          <div><strong style="color:var(--text-primary)">Edit</strong> — Can create or modify records (vs. read-only).</div>
          <div><strong style="color:var(--text-primary)">Filters</strong> — Restrict which brands/tiers a user sees. Blank = all.</div>
        </div>
      </div>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">👥 People & Access</h1>
        <p class="page-subtitle">Manage staff accounts, departments, and their permissions</p></div>
    </div>
    ${tabBar}
    ${showDepts ? deptContent : staffContent}`;
  }

  // Keep renderDepartments as a convenience alias (it's in the export list)
  function renderDepartments() { return renderStaff('departments'); }

  // ── PC Propose-mode Settings Views ──────────────────────────
  function renderTradingCompaniesPC() {
    const tcs = API.cache.tradingCompanies;
    const pending = API.PendingChanges.pending().filter(c => c.type === 'tc');
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
    const ips = API.cache.internalPrograms;
    const pending = API.PendingChanges.pending().filter(c => c.type === 'internal-program');
    return `
    <div class="page-header">
      <div><h1 class="page-title">Internal Programs</h1><p class="page-subtitle">Read-only — propose changes for Admin approval</p></div>
      <button class="btn btn-primary" onclick="App.openProposeIPModal()">＋ Propose New Internal Program</button>
    </div>
    ${pending.length ? `<div class="alert alert-info mb-3">⏳ ${pending.length} pending proposal(s) awaiting admin approval.</div>` : ''}
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Brand</th><th>Tier</th><th>Gender</th><th>Target Margin</th><th>Propose Edit</th></tr></thead>
      <tbody>${ips.map(ip => {
        const hasPending = pending.some(c => c.data?.id === ip.id);
        return `<tr class="${hasPending ? 'proposal-row' : ''}">
          <td><span class="badge">${ip.brand || '—'}</span>${hasPending ? ' <span class="pending-inline-badge">⏳</span>' : ''}</td>
          <td class="text-sm">${ip.tier || '—'}</td>
          <td class="text-sm">${ip.gender || '—'}</td>
          <td>${ip.targetMargin ? (ip.targetMargin*100).toFixed(1)+'%' : '—'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="App.openProposeIPModal('${ip.id}')">✏ Propose Edit</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div></div>`;
  }

  function renderCOOPC() {
    const rates = API.cache.cooRates;
    const pending = API.PendingChanges.pending().filter(c => c.type === 'coo');
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
    const prog = API.Programs.get(programId);
    const asgns = API.Assignments.byProgram(programId);
    asgns.forEach(a => (a.coos || []).forEach(coo => _collapsedTCs.add(`${a.tcId}_${coo}`)));
    App.openProgram(programId);
  }

  // ── Design Handoff ─────────────────────────────────────────
  function renderDesignHandoff() {
    const handoffs  = API.DesignHandoffs.all().slice().reverse();
    const allSRs    = API.SalesRequests.all();

    // SalesRequests that have no design handoff linked to them yet, and aren't converted
    const awaitingHandoff = allSRs.filter(r =>
      !r.linkedProgramId &&
      !handoffs.find(h => h.sourceSalesRequestId === r.id)
    );

    const awaitingPanel = awaitingHandoff.length ? `
      <div class="card mb-4" style="border-color:#f59e0b;border-left:3px solid #f59e0b">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div class="font-bold" style="color:#f59e0b">📝 Costing Requests Ready for Design Handoff</div>
            <div class="text-sm text-muted mt-1">Sales created these requests — upload a Style &amp; Fabric list to respond with a handoff.</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${awaitingHandoff.map(r => {
            const d = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const labels = [r.brand, r.retailer, r.gender].filter(Boolean).join(' · ');
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div style="display:flex;gap:16px;align-items:center">
                <div>
                  <div class="font-bold">${r.season||'—'} ${r.year||''}${labels ? ' · ' + labels : ''}</div>
                  <div class="text-sm text-muted">From ${r.submittedByName||'—'} · ${d}</div>
                </div>
                <span class="tag">${(r.styles||[]).length} styles</span>
              </div>
              <button class="btn btn-primary btn-sm" onclick="App.openNewHandoffModal('${r.id}')">Start Handoff →</button>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Handoffs that have a matching unlinked Sales Request (by season+year+brand) — ready to reconcile
    const norm = s => (s || '').trim().toLowerCase();
    const reconcilePairs = handoffs
      .filter(h => !h.linkedProgramId && (h.stylesList||[]).length > 0)
      .map(h => {
        const matchSR = allSRs.find(r =>
          !r.linkedProgramId &&
          !r.sourceHandoffId &&           // not already reconciled
          r.id !== h.sourceSalesRequestId && // not the one that spawned this handoff
          norm(r.season) === norm(h.season) &&
          norm(r.year)   === norm(h.year)   &&
          norm(r.brand)  === norm(h.brand)
        );
        return matchSR ? { h, r: matchSR } : null;
      })
      .filter(Boolean);

    const reconcilePanel = reconcilePairs.length ? `
      <div class="card mb-4" style="border-color:#22c55e;border-left:3px solid #22c55e;background:rgba(34,197,94,0.03)">
        <div style="margin-bottom:12px">
          <div class="font-bold" style="color:#22c55e">⚡ Ready to Reconcile</div>
          <div class="text-sm text-muted mt-1">These Design Handoffs have a matching Sales Request — compare and merge style lists.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${reconcilePairs.map(({ h, r }) => {
            const dStyles = (h.stylesList||[]).length;
            const sStyles = (r.styles||[]).length;
            const labels  = [h.brand, h.retailer, h.gender].filter(Boolean).join(' · ');
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div style="display:flex;gap:16px;align-items:center">
                <div>
                  <div class="font-bold">${h.season||'—'} ${h.year||''}${labels ? ' · ' + labels : ''}</div>
                  <div class="text-sm text-muted">Design: ${dStyles} styles · Sales: ${sStyles} styles</div>
                </div>
                ${dStyles !== sStyles ? `<span class="badge badge-pending" style="font-size:0.72rem">${Math.abs(dStyles-sStyles)} difference${Math.abs(dStyles-sStyles)!==1?'s':''}</span>` : '<span class="badge badge-placed" style="font-size:0.72rem">Counts match</span>'}
              </div>
              <button class="btn btn-primary btn-sm" onclick="App.openReconcileModal('${r.id}','${h.id}')">⚡ Reconcile</button>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const rows = handoffs.length ? handoffs.map(h => {
      const d = new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const linkedBadge = h.linkedProgramId
        ? `<span class="badge badge-placed" style="cursor:pointer" onclick="App.navigate('cost-summary','${h.linkedProgramId}')">→ Program</span>`
        : `<button class="btn btn-secondary btn-sm" onclick="App.openConvertHandoffModal('${h.id}')">Convert →</button>`;
      const styleCount  = (h.stylesList||[]).length;
      const fabricCount = (h.fabricsList||[]).length;
      const stylesBadge  = styleCount
        ? `<span class="status-dot dot-green"></span><span class="tag">${styleCount} styles</span>`
        : `<span class="status-dot dot-amber"></span><span class="tag tag-warn">No styles</span>`;
      const fabricsBadge = h.fabricsUploaded
        ? `<span class="status-dot dot-green"></span><span class="tag">${fabricCount} fabrics</span>`
        : `<span class="status-dot dot-amber"></span><button class="btn btn-ghost btn-xs" onclick="App.openAddFabricListModal('${h.id}')">+ Add Fabric List</button>`;
      return `<tr>
        <td class="font-bold">${h.season || '—'} ${h.year || ''}</td>
        <td class="text-sm">${h.brand || '—'}</td>
        <td class="text-sm">${h.gender || '—'}</td>
        <td class="text-sm">${h.tier || '—'}</td>
        <td class="text-sm">${h.supplierRequestNumber ? `<span class="tag" style="font-family:monospace;font-size:0.78rem">${h.supplierRequestNumber}</span>` : '<span class="text-muted">—</span>'}</td>
        <td class="text-sm text-muted">${d}</td>
        <td class="text-sm">${h.submittedByName || '—'}</td>
        <td><div style="display:flex;align-items:center;gap:6px">${stylesBadge}</div></td>
        <td><div style="display:flex;align-items:center;gap:6px">${fabricsBadge}</div></td>
        <td>${linkedBadge}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="App.openEditHandoffModal('${h.id}')">✏ Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openHandoffDetail('${h.id}')">👁 View</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteHandoff('${h.id}')">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" class="text-center text-muted" style="padding:40px">No design handoffs yet. Click "+ New Handoff" to upload a style list from Design.</td></tr>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">Design Handoffs</h1>
        <p class="page-subtitle">Style &amp; Fabric lists submitted by Design. Each handoff needs both a Style List and a Fabric List.</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="App.downloadHandoffTemplate()">⬇ Template</button>
        <button class="btn btn-primary" onclick="App.openNewHandoffModal()">＋ New Handoff</button>
      </div>
    </div>
    ${reconcilePanel}
    ${awaitingPanel}
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr>
        <th>Season / Year</th><th>Brand</th><th>Gender</th><th>Tier</th><th>SR #</th><th>Date</th><th>Submitted By</th>
        <th>Styles</th><th>Fabrics</th><th>Program</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  // ── Sales Request ──────────────────────────────────────────
  function renderSalesRequests() {
    const requests = API.SalesRequests.all().slice().reverse();
    const allHandoffs = API.DesignHandoffs.all();
    // Handoffs not yet linked to a Sales Request — available for Sales to build from
    const availableHandoffs = allHandoffs.filter(h => !h.linkedProgramId && !requests.find(r => r.sourceHandoffId === h.id));

    // "Available Handoffs" panel
    const availablePanel = availableHandoffs.length ? `
      <div class="card mb-4" style="border-color:var(--accent);border-left:3px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div class="font-bold" style="color:var(--accent)">🎨 Design Handoffs Ready for Costing</div>
            <div class="text-sm text-muted mt-1">Select a handoff to build a Sales Request — choose the styles you want to cost and add your qty and sell price.</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${availableHandoffs.map(h => {
            const d = new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const styleCount = (h.stylesList||[]).length;
            const fabBadge = h.fabricsUploaded
              ? `<span class="badge badge-placed">🧵 Fabrics ✓</span>`
              : `<span class="badge badge-pending">⚠ No fabric list yet</span>`;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div style="display:flex;gap:16px;align-items:center">
                <div>
                  <div class="font-bold">${h.season||'—'} ${h.year||''}${h.brand ? ' · '+h.brand : ''}${h.tier ? ' · '+h.tier : ''}${h.gender ? ' · '+h.gender : ''}</div>
                  <div class="text-sm text-muted">Submitted by ${h.submittedByName||'—'} · ${d}</div>
                </div>
                <span class="tag">${styleCount} styles</span>
                ${fabBadge}
              </div>
              <button class="btn btn-primary btn-sm" onclick="App.openBuildRequestFromHandoff('${h.id}')">Build Request →</button>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const statusMap = { submitted: 'badge-costing', converted: 'badge-placed', draft: 'badge-pending' };
    const rows = requests.length ? requests.map(r => {
      const d = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const hasQtyPrice = (r.styles||[]).some(s => (s.projQty > 0) && (s.projSell > 0));
      const linkedBadge = r.linkedProgramId
        ? `<span class="badge badge-placed" style="cursor:pointer" onclick="App.navigate('cost-summary','${r.linkedProgramId}')">→ Program</span>`
        : hasQtyPrice
          ? `<button class="btn btn-primary btn-sm" onclick="App.proposeProgramFromRequest('${r.id}')">🚀 Propose Program</button>`
          : `<span class="badge badge-pending" title="Add Proj Qty and Sell Price to all styles first">Needs Qty/Price</span>`;
      // Check if there's a matching unlinked handoff for reconciliation
      const matchingHandoff = !r.sourceHandoffId ? allHandoffs.find(h => h.season === r.season && h.year === r.year && !h.linkedProgramId) : null;
      const reconcileBadge = matchingHandoff
        ? `<button class="btn btn-ghost btn-xs ml-1" title="Reconcile with Design handoff" onclick="App.openReconcileModal('${r.id}','${matchingHandoff.id}')">⚡ Reconcile</button>`
        : '';
      return `<tr>
        <td class="font-bold">${r.season || '—'} ${r.year || ''}</td>
        <td><span class="badge">${r.brand || '—'}</span></td>
        <td class="text-sm">${r.retailer || '—'}</td>
        <td class="text-sm">${r.gender || '—'}</td>
        <td class="text-sm">${r.inWhseDate ? new Date(r.inWhseDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '<span class="text-muted">—</span>'}</td>
        <td class="text-sm">${r.costDueDate ? new Date(r.costDueDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '<span class="text-muted">—</span>'}</td>
        <td class="text-sm text-muted">${d}</td>
        <td class="text-sm">${r.submittedByName || '—'}</td>
        <td><span class="tag">${(r.styles || []).length}</span></td>
        <td>${r.sourceHandoffId ? '<span class="badge badge-costing" title="Built from Design Handoff">🎨 Handoff</span>' : `<span class="badge badge-pending">Fresh</span>${reconcileBadge}`}</td>
        <td><span class="badge ${statusMap[r.status] || 'badge-pending'}">${r.status || 'submitted'}</span></td>
        <td>${linkedBadge}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="App.openSalesRequestDetail('${r.id}')">👁 View</button>
            <button class="btn btn-ghost btn-sm" onclick="App.downloadSalesRequest('${r.id}')" title="Download as Excel">⬇</button>
            ${!r.linkedProgramId ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSalesRequest('${r.id}')">🗑</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="11" class="text-center text-muted" style="padding:40px">No sales requests yet. Build one from a Design Handoff above, or click "+ New Request" to create manually.</td></tr>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">Sales Costing Requests</h1>
        <p class="page-subtitle">Costing requests from Planning &amp; Sales — convert to a Program when ready</p></div>
      <button class="btn btn-primary" onclick="App.openNewSalesRequestModal()">＋ New Request</button>
    </div>
    ${availablePanel}
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr>
        <th>Season / Year</th><th>Brand</th><th>Tier / Retailer</th><th>Gender</th><th>In-Whse</th><th>Cost Due</th><th>Date</th><th>Submitted By</th>
        <th>Styles</th><th>Source</th><th>Status</th><th>Program</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  // ── Build Request from Handoff — FULL PAGE SPREADSHEET ─────────────────────
  function renderBuildFromHandoff(handoffId) {
    const h = API.DesignHandoffs.get(handoffId);
    if (!h) return `<div class="empty-state"><div class="icon">❌</div><h3>Handoff not found</h3><p><button class="btn btn-secondary" onclick="App.navigate('sales-requests')">← Back</button></p></div>`;

    const styles = h.stylesList || [];
    const seasons = ['N/A','Q1','Q2','Q3','Q4'];
    const years   = ['2025','2026','2027','2028','2029','2030'];
    const retailers = ['Walmart','Target','Costco','TJX','Ross','Marshalls','Winners','BCF','Other'];
    const d = new Date(h.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

    const styleRows = styles.map((s, i) => `
      <tr id="brf-row-${i}" class="brf-style-row">
        <td style="width:42px;text-align:center;padding:8px">
          <input type="checkbox" class="brf-check" data-idx="${i}" id="brf-chk-${i}" checked
            onchange="App._brfToggleRow(${i})">
        </td>
        <td class="primary font-bold" style="padding:8px 12px">${s.styleNumber||'—'}</td>
        <td style="padding:8px 12px">${s.styleName||'—'}</td>
        <td class="text-sm text-muted" style="padding:8px 12px">${s.fabric||s.fabrication||'—'}</td>
        <td style="padding:4px 6px">
          <input class="form-input brf-qty" type="number" min="0" placeholder="Qty"
            id="brf-qty-${i}" data-row="${i}" data-col="0"
            style="width:100px;padding:5px 8px">
        </td>
        <td style="padding:4px 6px">
          <input class="form-input brf-sell" type="number" min="0" step="0.01" placeholder="$0.00"
            id="brf-sell-${i}" data-row="${i}" data-col="1"
            style="width:110px;padding:5px 8px">
        </td>
        <td style="padding:4px 6px">
          <input class="form-input brf-note" type="text" placeholder="Notes…"
            id="brf-note-${i}" data-row="${i}" data-col="2"
            style="width:180px;padding:5px 8px">
        </td>
        <td style="padding:4px 8px">
          <button type="button" class="btn btn-danger btn-xs" onclick="App._brfCancelStyle(${i})" title="Cancel this style">✕</button>
        </td>
      </tr>`).join('');

    return `
    <div id="brf-page" style="display:flex;flex-direction:column;height:100%;min-height:0">
      <!-- Hidden field so keyboard Ctrl+S can find the handoff ID -->
      <input type="hidden" id="brf-handoff-id" value="${h.id}">

      <!-- PAGE HEADER -->
      <div class="page-header" style="flex-shrink:0">
        <div style="display:flex;align-items:center;gap:14px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('sales-requests')">← Back</button>
          <div>
            <h1 class="page-title" style="margin:0">📋 Build Sales Request</h1>
            <p class="page-subtitle" style="margin:0">From Design Handoff · ${h.season||''} ${h.year||''} · ${d}</p>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="text-sm text-muted kbd-hint" style="font-size:0.72rem;opacity:0.6">Tab · ↑↓ · Enter to navigate &nbsp;|&nbsp; Ctrl+S to save</span>
          <button class="btn btn-primary" onclick="App.saveBuildRequestFromHandoff('${h.id}')">Save Request →</button>
        </div>
      </div>

      <!-- TOOLBAR -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;flex-shrink:0;border-bottom:1px solid var(--border);margin-bottom:0">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0;white-space:nowrap">Season</label>
            <select class="form-select" id="brf-season" style="width:90px">
              ${seasons.map(s => `<option${s===h.season?' selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0">Year</label>
            <select class="form-select" id="brf-year" style="width:90px">
              ${years.map(y => `<option${y===h.year?' selected':''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0">Retailer</label>
            <select class="form-select" id="brf-retailer" style="width:140px">
              <option value="">— Select —</option>
              ${retailers.map(r => `<option${r===h.tier?' selected':''||r===h.retailer?' selected':''}\`>\${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0;white-space:nowrap">1st In-Whse</label>
            <input class="form-input" type="date" id="brf-inwh-date" style="width:140px">
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0;white-space:nowrap">Cost Req. Due</label>
            <input class="form-input" type="date" id="brf-cost-due" style="width:140px">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="text-sm text-muted"><span id="brf-selected-count">${styles.length}</span> of ${styles.length} styles selected</span>
          <button type="button" class="btn btn-ghost btn-xs" onclick="App._brfSelectAll(true)">Select All</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="App._brfSelectAll(false)">Deselect All</button>
          <div style="width:1px;height:18px;background:var(--border);margin:0 4px"></div>
          <button type="button" class="btn btn-ghost btn-xs" onclick="App.downloadBuildSheet('${h.id}')" title="Download as Excel to fill offline">⬇ Download</button>
          <label class="btn btn-ghost btn-xs" style="cursor:pointer;margin:0" title="Upload filled Excel to auto-populate">
            ⬆ Import
            <input type="file" id="brf-import-file" accept=".xlsx,.xls,.csv" style="display:none"
              onchange="App.importBuildSheet(event)">
          </label>
        </div>
      </div>

      <!-- SPREADSHEET TABLE -->
      <div style="flex:1;overflow-y:auto;min-height:0">
        <table id="brf-spreadsheet" style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;z-index:10;background:var(--bg-card);box-shadow:0 1px 0 var(--border)">
            <tr>
              <th style="width:42px;padding:10px 8px;text-align:center"></th>
              <th style="padding:10px 12px;text-align:left">Style #</th>
              <th style="padding:10px 12px;text-align:left">Style Name</th>
              <th style="padding:10px 12px;text-align:left">Fabric</th>
              <th style="padding:10px 12px;min-width:110px">Proj Qty <span style="color:var(--danger);font-size:0.7rem">*</span></th>
              <th style="padding:10px 12px;min-width:120px">Proj Sell <span style="color:var(--danger);font-size:0.7rem">*</span></th>
              <th style="padding:10px 12px;min-width:190px">Notes</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>${styleRows}</tbody>
        </table>
      </div>

      <!-- FOOTER -->
      <div style="flex-shrink:0;border-top:1px solid var(--border);padding:12px 0;display:flex;justify-content:space-between;align-items:center">
        <p class="text-sm text-muted" style="margin:0"><span style="color:var(--danger)">*</span> At least one style must have Proj Qty and Sell Price to propose a costing program.</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="App.navigate('sales-requests')">Discard</button>
          <button class="btn btn-primary" onclick="App.saveBuildRequestFromHandoff('${h.id}')">Save Request →</button>
        </div>
      </div>
    </div>`;
  }

  // ── Re-cost Requests Queue ─────────────────────────────────────
  function renderRecostQueue() {
    const user    = typeof App !== 'undefined' && App._getState ? App._getState()?.user || {} : {};
    const role    = user.role || '';
    const dept    = (user.department || '').toLowerCase();
    const isSales = dept.includes('sales');
    const isPC    = role === 'admin' || role === 'pc';

    const all = API.RecostRequests.all().slice().reverse();
    const programs = API.cache.programs;
    const styles   = API.Styles.all();

    // Status display helper
    const stageInfo = {
      pending_sales:      { label: '⏳ Awaiting Sales',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
      pending:            { label: '⏳ Awaiting Sales',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
      pending_production: { label: '⚙ Awaiting Production',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
      released:           { label: '✅ Released to TC',       color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
      rejected:           { label: '✕ Rejected',             color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
      dismissed:          { label: '— Dismissed',            color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
    };

    // Filters
    const actionable = all.filter(r => !['dismissed','released'].includes(r.status));
    const myQueue    = isSales
      ? actionable.filter(r => r.status === 'pending_sales' || r.status === 'pending')
      : isPC
      ? actionable.filter(r => r.status === 'pending_production')
      : actionable;

    const pendingSalesCount = all.filter(r => r.status === 'pending_sales' || r.status === 'pending').length;
    const pendingProdCount  = all.filter(r => r.status === 'pending_production').length;

    const makeCard = (r, showActions) => {
      const prog = programs.find(p => p.id === r.programId);
      const s    = styles.find(x => x.id === r.styleId);
      const si   = stageInfo[r.status] || stageInfo.pending;
      const dt   = new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const programLabel = [prog?.season, prog?.year, prog?.brand].filter(Boolean).join(' · ') || r.programId;

      let actions = '';
      if (showActions) {
        const isSalesStage = r.status === 'pending_sales' || r.status === 'pending';
        const isProdStage  = r.status === 'pending_production';
        if (isSales && isSalesStage) {
          actions = `
            <button class="btn btn-primary btn-sm" onclick="App.salesApproveRecost('${r.id}','${r.programId}')">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="App.salesRejectRecost('${r.id}','${r.programId}')">✕ Reject</button>`;
        } else if (isPC && isProdStage) {
          actions = `
            <button class="btn btn-warning btn-sm" onclick="App.releaseRecosting('${r.id}','${r.programId}')">🔄 Release to TC</button>
            <button class="btn btn-danger btn-sm" onclick="App.rejectRecostRequest('${r.id}','${r.programId}','production')">✕ Reject</button>`;
        }
      }

      return `<div class="card mb-2" style="padding:14px 16px;border-left:3px solid ${si.color}">
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-weight:700">${s?.styleNumber || '—'}</span>
              <span class="text-muted text-sm">${s?.styleName || ''}</span>
              <span class="tag" style="font-size:0.7rem;background:${si.bg};color:${si.color}">${si.label}</span>
              <span class="tag" style="font-size:0.7rem">${r.category||'Change'}</span>
            </div>
            <div class="text-muted text-sm">
              <strong>${programLabel}</strong> · ${dt} · by ${r.requestedByName||'?'}
            </div>
            ${r.note ? `<div style="font-size:0.8rem;font-style:italic;margin-top:6px;color:var(--text-secondary)">"${r.note}"</div>` : ''}
            ${r.salesApprovedByName ? `<div style="font-size:0.72rem;color:#22c55e;margin-top:4px">✅ Sales approved by ${r.salesApprovedByName}</div>` : ''}
            ${r.rejectionNote ? `<div style="font-size:0.72rem;color:#ef4444;margin-top:4px">✕ Rejected: ${r.rejectionNote}</div>` : ''}
            ${r.releasedByName ? `<div style="font-size:0.72rem;color:#22c55e;margin-top:4px">🔄 Released by ${r.releasedByName}</div>` : ''}
          </div>
          ${actions ? `<div style="display:flex;gap:6px;flex-shrink:0">${actions}</div>` : ''}
        </div>
      </div>`;
    };

    // Split into My Queue + All
    const queueSection = myQueue.length ? `
      <div class="mb-4">
        <div class="font-bold mb-2" style="color:var(--accent)">
          ${isSales ? '👤 Awaiting Your Approval' : '⚙ Awaiting Your Release'} (${myQueue.length})
        </div>
        ${myQueue.map(r => makeCard(r, true)).join('')}
      </div>` : `
      <div class="card mb-4" style="padding:24px;text-align:center">
        <div style="font-size:2rem;margin-bottom:8px">✅</div>
        <div class="font-bold">Nothing in your queue</div>
        <div class="text-muted text-sm mt-1">
          ${isSales ? 'No re-cost requests need your approval right now.' : 'No re-cost requests are waiting for Production release.'}
        </div>
      </div>`;

    const allSection = all.length ? `
      <div>
        <div class="font-bold mb-2 text-muted">All Re-cost Requests (${all.length})</div>
        ${all.map(r => makeCard(r, false)).join('')}
      </div>` : '';

    const statsBar = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
        <div class="card" style="padding:14px 20px;display:flex;gap:12px;align-items:center">
          <span style="font-size:1.4rem">⏳</span>
          <div>
            <div style="font-size:1.4rem;font-weight:700;color:#f59e0b">${pendingSalesCount}</div>
            <div class="text-muted text-sm">Awaiting Sales</div>
          </div>
        </div>
        <div class="card" style="padding:14px 20px;display:flex;gap:12px;align-items:center">
          <span style="font-size:1.4rem">⚙</span>
          <div>
            <div style="font-size:1.4rem;font-weight:700;color:#3b82f6">${pendingProdCount}</div>
            <div class="text-muted text-sm">Awaiting Production</div>
          </div>
        </div>
        <div class="card" style="padding:14px 20px;display:flex;gap:12px;align-items:center">
          <span style="font-size:1.4rem">✅</span>
          <div>
            <div style="font-size:1.4rem;font-weight:700;color:#22c55e">${all.filter(r=>r.status==='released').length}</div>
            <div class="text-muted text-sm">Released to TC</div>
          </div>
        </div>
      </div>`;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">↩ Re-cost Queue</h1>
          <p class="page-subtitle">Track change requests through Sales approval → Production release → TC re-quoting</p>
        </div>
      </div>
      ${statsBar}
      ${queueSection}
      ${allSection}`;
  }

  async function renderFabricStandards(role, tcId) {
    let allRequests = [];
    try {
      const res = await fetch('/api/fabric-requests');
      allRequests = await res.json();
    } catch { allRequests = []; }

    const isVendor  = role === 'vendor';
    const isPD      = role === 'prod_dev';
    const isAdmin   = role === 'admin' || role === 'pc';
    const canAction = isPD || isAdmin;  // PD + Admin can mark sent/received

    const myReqs    = isVendor ? allRequests.filter(r => r.tcId === tcId) : allRequests;
    const pending   = myReqs.filter(r => r.status === 'pending');
    const sent      = myReqs.filter(r => r.status === 'sent');
    const received  = myReqs.filter(r => r.status === 'received');

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const statusChip = s => ({
      pending:  '<span class="badge badge-pending">🔴 Pending</span>',
      sent:     '<span class="badge badge-costing">🟡 Sent</span>',
      received: '<span class="badge badge-placed">✅ Received</span>',
    }[s] || '<span class="badge">—</span>');

    // Group by TC for internal view
    const byTC = {};
    myReqs.forEach(r => {
      const key = r.tcName || r.tcId || 'Unknown TC';
      if (!byTC[key]) byTC[key] = [];
      byTC[key].push(r);
    });

    const actionBtns = r => {
      if (isVendor) {
        return r.status === 'pending'  ? `<button class="btn btn-danger btn-sm" onclick="App.deleteFabricRequest('${r.id}')">Cancel</button>` :
               r.status === 'sent'    ? `<button class="btn btn-success btn-sm" onclick="App.markFabricReceived('${r.id}')">✅ Mark Received</button>` : '';
      }
      if (canAction) {
        return `<div style="display:flex;gap:6px;flex-wrap:wrap">
          ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="App.markFabricSent('${r.id}')">📤 Mark Sent</button>` : ''}
          ${r.status === 'sent'   ? `<button class="btn btn-success btn-sm" onclick="App.markFabricReceived('${r.id}')">✅ Received</button>` : ''}
          ${r.status !== 'received' ? `<button class="btn btn-danger btn-sm" onclick="App.deleteFabricRequest('${r.id}')">🗑</button>` : ''}
        </div>`;
      }
      return ''; // read-only for other roles
    };

    // Build rows (grouped by TC for internal, flat for vendor)
    let rows = '';
    if (isVendor) {
      rows = myReqs.length ? myReqs.slice().sort((a,b) => {
        const o = { pending:0, sent:1, received:2 };
        return (o[a.status]??3) - (o[b.status]??3);
      }).map(r => `<tr>
        <td class="font-bold primary">${r.fabricCode || r.trimCode || '—'}</td>
        <td>${r.fabricName || r.trimName || '—'}</td>
        <td class="text-sm text-muted">${r.content || r.description || '—'}</td>
        <td class="text-center font-bold">${r.quantityRequested || r.swatchQty || '—'}</td>
        <td class="text-sm text-muted">${fmtDate(r.requestedAt)}</td>
        <td>${r.awbNumber ? `<span class="tag" style="font-family:monospace;font-size:0.75rem">${r.awbNumber}</span>` : '—'}</td>
        <td>${statusChip(r.status)}</td>
        <td>${actionBtns(r)}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="text-center text-muted" style="padding:40px">No requests yet. Click "+ Request Standard" to submit one.</td></tr>`;
    } else {
      // Internal: group by TC
      Object.entries(byTC).forEach(([tcName, reqs]) => {
        reqs.sort((a,b) => { const o={pending:0,sent:1,received:2}; return (o[a.status]??3)-(o[b.status]??3); });
        rows += `<tr style="background:var(--bg-elevated)"><td colspan="10" style="padding:8px 14px;font-weight:700;font-size:0.82rem;color:var(--accent)">🏭 ${tcName} (${reqs.length})</td></tr>`;
        rows += reqs.map(r => `<tr>
          ${canAction ? `<td style="text-align:center;padding:8px"><input type="checkbox" class="fab-req-chk" value="${r.id}" style="width:14px;height:14px;accent-color:var(--accent)"></td>` : '<td></td>'}
          <td class="font-bold primary">${r.fabricCode || r.trimCode || '—'}</td>
          <td>${r.fabricName || r.trimName || '—'}</td>
          <td class="text-sm text-muted">${r.content || r.description || '—'}</td>
          <td class="text-center">${r.quantityRequested || r.swatchQty || '—'}</td>
          <td class="text-sm">${r.programName || '—'}</td>
          <td class="text-sm text-muted">${fmtDate(r.requestedAt)}</td>
          <td>${r.sentAt ? `<div class="text-sm">${fmtDate(r.sentAt)}</div>${r.awbNumber ? `<div style="font-family:monospace;font-size:0.72rem;color:#6366f1">${r.awbNumber}</div>` : ''}` : '—'}</td>
          <td>${statusChip(r.status)}</td>
          <td>${actionBtns(r)}</td>
        </tr>`).join('');
      });
      if (!myReqs.length) rows = `<tr><td colspan="10" class="text-center text-muted" style="padding:40px">No fabric/trim standard requests yet.</td></tr>`;
    }

    const colCount = isVendor ? 8 : 10;

    return `
    <div class="page-header">
      <div><h1 class="page-title">🧵 Standards Requests</h1>
        <p class="page-subtitle">${isVendor ? 'Request fabric or trim standards for your programs' : isPD ? 'Manage all fabric and trim standard requests' : 'Read-only view of standards requests'}</p>
      </div>
      <div style="display:flex;gap:8px">
        ${canAction ? `<button class="btn btn-warning" onclick="App.createShipmentPackage()" id="pkg-btn" style="display:none">📦 Create Shipment Package</button>` : ''}
        ${canAction && !isVendor ? `<button class="btn btn-ghost btn-sm" onclick="App.sendFabricDigestNow()">📧 Send Digest</button>` : ''}
        ${isVendor ? `<button class="btn btn-primary" onclick="App.openFabricRequestModal('${tcId}')">＋ Request Standard</button>` : ''}
      </div>
    </div>
    <div class="fabric-kpi-row">
      <div class="fabric-kpi fabric-kpi-pending"><span class="fabric-kpi-num">${pending.length}</span><span class="fabric-kpi-label">Pending</span></div>
      <div class="fabric-kpi fabric-kpi-sent"><span class="fabric-kpi-num">${sent.length}</span><span class="fabric-kpi-label">Sent</span></div>
      <div class="fabric-kpi fabric-kpi-received"><span class="fabric-kpi-num">${received.length}</span><span class="fabric-kpi-label">Received</span></div>
    </div>
    <div class="card" style="padding:0;margin-top:20px">
      <div class="cs-filter-bar" id="fabric-filter-bar">
        <label class="cs-filter-label">Filter</label>
        <select class="form-select cs-select" id="fabric-status-filter" onchange="App.filterFabricRequests()">
          <option value="">All Statuses</option>
          <option>pending</option><option>sent</option><option>received</option>
        </select>
        ${!isVendor ? `
        <label class="cs-filter-label" style="margin-left:12px">TC</label>
        <select class="form-select cs-select" id="fabric-tc-filter" onchange="App.filterFabricRequests()">
          <option value="">All TCs</option>
          ${[...new Set(allRequests.map(r => r.tcName || r.tcId).filter(Boolean))].map(n => `<option>${n}</option>`).join('')}
        </select>` : ''}
      </div>
      <div class="table-wrap" id="fabric-requests-table-wrap"><table id="fabric-requests-table">
        <thead><tr>
          ${!isVendor ? '<th style="width:40px"></th>' : ''}
          <th>Code</th><th>Name / Description</th><th>Content</th>
          <th style="text-align:center">Qty</th>
          ${!isVendor ? '<th>Program</th>' : ''}
          <th>Requested</th><th>Sent / AWB</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody id="fabric-requests-tbody">${rows}</tbody>
      </table></div>
    </div>
    <script>
    // Show/hide Package button when checkboxes are selected
    document.querySelectorAll('.fab-req-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const anyChecked = document.querySelectorAll('.fab-req-chk:checked').length > 0;
        const btn = document.getElementById('pkg-btn');
        if (btn) btn.style.display = anyChecked ? '' : 'none';
      });
    });
    </script>`;
  }



    function renderBottleneckTracker(allRequests) {
    const allStyles = API.Styles.all().filter(s => s.status !== 'cancelled');
    const allSubs   = API.Submissions.all();
    const allProgs  = API.cache.programs.filter(p => p.status === 'Costing');
    const activeIds = new Set(allProgs.map(p => p.id));
    const active    = allStyles.filter(s => activeIds.has(s.programId));

    let noRequest = [], notSent = [], sentNoQuote = [];
    active.forEach(s => {
      const hasFOB = allSubs.some(sub => sub.styleId === s.id && sub.fob != null);
      if (hasFOB) return;
      const reqs   = allRequests.filter(r => Array.isArray(r.styleIds) && r.styleIds.includes(s.id));
      const hasSent = reqs.some(r => r.status === 'sent' || r.status === 'received');
      const hasPending = reqs.some(r => r.status === 'pending');
      const prog = allProgs.find(p => p.id === s.programId);
      const entry = `<span class="bottleneck-style" onclick="App.navigate('styles','${s.programId}')" title="${prog?.name || ''}">${s.styleNumber}</span>`;
      if (!reqs.length) noRequest.push(entry);
      else if (!hasSent && hasPending) notSent.push(entry);
      else if (hasSent && !hasFOB) sentNoQuote.push(entry);
    });

    if (!noRequest.length && !notSent.length && !sentNoQuote.length) return '';
    const bucket = (icon, label, color, items) => items.length ? `
      <div class="bottleneck-bucket">
        <div class="bottleneck-label" style="color:${color}">${icon} ${label} <span class="tag" style="margin-left:6px">${items.length}</span></div>
        <div class="bottleneck-styles">${items.join('')}</div>
      </div>` : '';

    return `
    <div class="card mt-3" style="padding:18px 20px">
      <div class="text-sm font-bold" style="color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">⚠ What's Holding Up Quotes</div>
      ${bucket('🔴', 'No swatch requested', '#ef4444', noRequest)}
      ${bucket('🟡', 'Requested — not sent yet', '#f59e0b', notSent)}
      ${bucket('🔵', 'Standard sent — awaiting quote', '#6366f1', sentNoQuote)}
    </div>`;
  }

  // ── Design Change Log modal trigger & history panel ────────
  function designChangeHistoryPanel(styleId) {
    const changes = API.DesignChanges.byStyle(styleId);
    if (!changes.length) return `<div class="text-muted text-sm" style="padding:12px">No design changes logged for this style.</div>`;
    const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="design-change-timeline">${changes.map(c => `
      <div class="dc-entry">
        <div class="dc-dot"></div>
        <div class="dc-body">
          <div class="dc-desc">${c.description || '—'}</div>
          ${c.field ? `<div class="dc-field text-sm text-muted">${c.field}${c.previousValue ? ': <span style="text-decoration:line-through;color:#ef4444">' + c.previousValue + '</span>' : ''} ${c.newValue ? '→ <strong>' + c.newValue + '</strong>' : ''}</div>` : ''}
          <div class="dc-meta text-sm text-muted">${fmtDate(c.changedAt)} · ${c.changedByName || c.changedBy || '—'}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  function renderAllDesignChanges() {
    const changes = API.DesignChanges.all().slice().reverse();
    const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const rows = changes.length ? changes.map(c => {
      const style = API.Styles.get(c.styleId);
      const prog  = style ? API.Programs.get(style.programId) : null;
      return `<tr>
        <td class="text-sm text-muted">${fmtDate(c.changedAt)}</td>
        <td class="primary font-bold" style="cursor:pointer" onclick="App.navigate('styles','${style?.programId}')">${c.styleNumber || c.styleId}</td>
        <td class="text-sm">${prog?.name || '—'}</td>
        <td>${c.field ? `<span class="badge badge-costing">${c.field}</span>` : '—'}</td>
        <td>${c.description || '—'}</td>
        <td class="text-sm">${c.previousValue ? `<span style="color:#ef4444">${c.previousValue}</span>` : '—'}</td>
        <td class="text-sm">${c.newValue ? `<strong>${c.newValue}</strong>` : '—'}</td>
        <td class="text-sm text-muted">${c.changedByName || c.changedBy || '—'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="text-center text-muted" style="padding:40px">No design changes logged yet.</td></tr>`;
    return `
    <div class="page-header">
      <div><h1 class="page-title">Design Change Log</h1>
        <p class="page-subtitle">All logged design changes across programs, newest first</p></div>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Style #</th><th>Program</th><th>Field</th><th>Description</th><th>Previous</th><th>New Value</th><th>Logged By</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  // ====================================================================
  // DESIGN / SALES COSTING STATUS VIEW  (v13)
  // Pricing-free program view for Design, Tech Design, Planning roles.
  // Shows style-level costing status without FOB/LDP/Sell price data.
  // ====================================================================
  function renderDesignCostingView(programId, userRole) {
    const prog   = API.Programs.get(programId);
    if (!prog) return `<div class="empty-state"><h3>Program not found</h3></div>`;
    const styles = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');

    // Resolve write permissions from dept settings (falls back to role-based)
    const perms = (typeof App !== 'undefined' && App.getPerms) ? App.getPerms() : {};
    const canEditTechPack   = perms.canEditTechPack    !== false; // default true for admin/pc
    const canEditSellStatus = perms.canEditSellStatus  !== false;
    const canEditTechNotes  = perms.canEditTechNotes  === true;  // only tech_design
    const isTechDesignRole  = userRole === 'tech_design';
    const isDesignLike      = userRole === 'design' || userRole === 'tech_design' || userRole === 'planning';

    // Pull consideration data — count entries per style
    const consideringList = JSON.parse(localStorage.getItem('vcp_considering') || '[]');
    const consideringCountByStyle = {};
    consideringList.forEach(tag => {
      const sid = tag.split(':')[0];
      if (sid) consideringCountByStyle[sid] = (consideringCountByStyle[sid] || 0) + 1;
    });

    // Re-cost requests for this program
    const recostReqs     = API.RecostRequests.byProgram(programId);
    const pendingRecosts = recostReqs.filter(r => r.status === 'pending');
    const reqByStyle     = {};
    recostReqs.forEach(r => { if (!reqByStyle[r.styleId] || r.createdAt > reqByStyle[r.styleId].createdAt) reqByStyle[r.styleId] = r; });

    // Link groups
    const progLinks  = API.StyleLinks.byProgram(programId);
    const styleToLink = {};
    progLinks.forEach(lnk => (lnk.styleIds||[]).forEach(sid => { styleToLink[sid] = lnk; }));

    // Dept status label maps
    const tpLabels = { not_submitted: '⬜ Not Submitted', submitted: '📦 Submitted', changed: '🔄 Changed' };
    const siLabels = { customer_review: '👁 Customer Review', confirmed: '✅ Confirmed', dropped: '❌ Dropped' };

    function deptStatusSelect(styleId, field, current, labelsMap, defaultVal, editable) {
      const effective = current || defaultVal || '';
      if (!editable) {
        // Read-only: show a styled non-interactive badge
        const label = labelsMap[effective] || (effective ? effective : '—');
        return `<span class="dcv-status-readonly">${label}</span>`;
      }
      // Editable: full select + drag handle
      const leading = defaultVal ? [] : [['', '—']];
      const opts = [...leading, ...Object.entries(labelsMap)]
        .map(([v, l]) => `<option value="${v}" ${effective === v ? 'selected' : ''}>${l}</option>`);
      const sel = `<select class="cell-select dcv-status-select" style="font-size:0.72rem" data-style-id="${styleId}" data-field="${field}"
        onchange="App.saveStyleDeptStatus('${styleId}','${field}',this.value)">${opts.join('')}</select>`;
      return `<div class="dcv-fill-wrap">${sel}<div class="dcv-fill-handle" title="Drag down to copy" onmousedown="App.startDcvDrag(event,'${styleId}','${field}')">⣿</div></div>`;
    }

    // Build style rows grouped by fabrication
    const groups = {}; const groupOrder = [];
    styles.forEach(s => {
      const key = (s.fabrication || '—').trim() || '—';
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(s);
    });

    let bodyRows = '';
    groupOrder.forEach(fab => {
      const grpStyles = groups[fab];
      const grpQty    = grpStyles.reduce((sum, s) => sum + (parseFloat(s.projQty)||0), 0);
      bodyRows += `<tr class="cs-group-row"><td colspan="14">
        <span style="font-weight:600">📁 ${fab}</span>
        <span class="cs-group-count">${grpStyles.length} style${grpStyles.length!==1?'s':''}</span>
        <span class="cs-subtotal">Proj QTY: <strong>${grpQty > 0 ? grpQty.toLocaleString() : '—'}</strong></span>
      </td></tr>`;

      grpStyles.forEach(s => {
        const placement    = API.Placements.get(s.id);
        const considCount  = consideringCountByStyle[s.id] || 0;
        const isPlaced     = !!placement;
        const lnk          = styleToLink[s.id];
        const req          = reqByStyle[s.id];
        const buys         = API.CustomerBuys.byStyle(s.id).filter(b => b.programId === programId);
        const actualQty    = buys.reduce((sum, b) => sum + (parseFloat(b.qty)||0), 0);

        // Costing status
        let costingBadge;
        if (isPlaced) {
          const tc = API.TradingCompanies.get(placement.tcId);
          costingBadge = `<span class="dcv-placed-badge">✅ ${tc?.code||'TC'} — ${placement.coo||''}</span>`;
        } else if (considCount > 0) {
          costingBadge = `<span class="dcv-considering-badge">🔍 ${considCount} TC${considCount>1?'s':''} Considering</span>`;
        } else {
          costingBadge = `<span class="dcv-open-badge">📋 Getting Quotes</span>`;
        }

        // Link group badge
        const linkBadge = lnk
          ? `<span class="style-link-badge" style="background:${lnk.color||'#6366f1'}22;color:${lnk.color||'#6366f1'};border-color:${lnk.color||'#6366f1'}44;font-size:0.65rem">🔗</span>`
          : '';

        // Re-cost cell
        let recostCell = '';
        if (req && req.status !== 'dismissed') {
          const reqColors = { pending:'#f59e0b', released:'#6366f1', rejected:'#ef4444' };
          const reqLabels = {
          pending_sales:      '⏳ Awaiting Sales',
          pending:            '⏳ Awaiting Sales',
          pending_production: '⚙ Awaiting Production',
          released:           '✅ Released to TC',
          rejected:           '✕ Rejected',
        };
          const c = reqColors[req.status] || '#94a3b8';
          recostCell = `<div style="font-size:0.72rem;font-weight:600;color:${c}">${reqLabels[req.status]||req.status}</div>`;
          if (req.status === 'pending') {
            recostCell += `<div class="text-muted" style="font-size:0.68rem;margin-top:1px">${req.requestedByName||''}</div>`;
          }
        } else {
          recostCell = `<button class="btn btn-ghost btn-sm dcv-recosting-btn" onclick="App.openRecostRequestModal('${s.id}','${programId}')">↩ Request Re-cost</button>`;
        }

        // Cost history indicator
        const histEvents = API.CostHistory.byStyle(s.id);
        const histBtn = histEvents.length > 0
          ? `<button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.68rem;color:#f59e0b;margin-top:4px" onclick="App.showCostHistory('${s.id}','${(s.styleNumber||'').replace(/'/g,"\\'")} ${(s.styleName||'').replace(/'/g,"\\'")}')">📋 ${histEvents.length} event${histEvents.length>1?'s':''}</button>`
          : '';

        const rowBg = isPlaced ? 'background:rgba(34,197,94,0.04)' : '';
        bodyRows += `<tr style="${rowBg}">
          <td id="link-chk-cell-${s.id}" style="display:none;vertical-align:middle;text-align:center">
            <input type="checkbox" class="style-link-chk" data-sid="${s.id}"
              onchange="App.onStyleLinkCheck('${programId}',this)">
          </td>
          <td data-col="styleNum" class="primary font-bold">${s.styleNumber}${linkBadge}</td>
          <td data-col="styleName">${s.styleName||'—'}</td>
          <td data-col="cat" class="text-sm text-muted">${s.category||'—'}</td>
          <td data-col="fab" class="text-sm">${(s.fabrication||'').substring(0,35)}${(s.fabrication||'').length>35?'…':''}</td>
          <td data-col="qty" style="text-align:center">${s.projQty ? Number(s.projQty).toLocaleString() : '—'}</td>
          <td data-col="actualQty" style="text-align:center;color:var(--accent);font-weight:${actualQty>0?'700':'400'}">${actualQty>0 ? actualQty.toLocaleString() : '<span class="text-muted">—</span>'}</td>
          <td data-col="sell" class="text-sm">${s.projSellPrice ? '$'+parseFloat(s.projSellPrice).toFixed(2) : '—'}</td>
          <td data-col="costing">${costingBadge}</td>
          <td data-col="techPack">${deptStatusSelect(s.id,'techPackStatus',s.techPackStatus||'',tpLabels,null,canEditTechPack)}</td>
          <td data-col="sellIn">${deptStatusSelect(s.id,'sellInStatus',s.sellInStatus||'',siLabels,'customer_review',canEditSellStatus)}</td>
          <td data-col="placement" style="min-width:110px">
            ${isPlaced ? `<span class="dcv-placed-badge" style="font-size:0.72rem">✅ Placed</span>` :
              considCount > 0 ? `<span class="dcv-considering-badge" style="font-size:0.72rem">🔍 Considering</span>` :
              s.status === 'cancelled' ? `<span style="font-size:0.72rem;color:#ef4444">✕ Dropped</span>` :
              `<span class="text-muted" style="font-size:0.72rem">— Open</span>`}
          </td>
          <td data-col="techNotes" style="min-width:180px">
            ${canEditTechNotes
              ? `<textarea class="form-textarea" rows="2" style="width:100%;font-size:0.72rem;padding:4px 6px;resize:vertical;min-height:32px" placeholder="Tech Design notes…"
                   onblur="App.saveTechDesignNote('${s.id}',this.value)"
                   >${(s.techDesignNotes||'').replace(/</g,'&lt;')}</textarea>`
              : s.techDesignNotes ? `<span class="text-sm" style="font-style:italic;color:var(--text-secondary)">${s.techDesignNotes}</span>` : `<span class="text-muted text-sm">—</span>`
            }
          </td>
          <td data-col="recosting" style="min-width:140px">${recostCell}${histBtn}</td>
        </tr>`;
      });
    });

    if (!bodyRows) bodyRows = `<tr><td colspan="14" class="text-center text-muted" style="padding:40px">No styles yet.</td></tr>`;

    // Pending re-cost panel
    let recostPanel = '';
    if (pendingRecosts.length > 0) {
      const rCards = pendingRecosts.map(r => {
        const sv = styles.find(x => x.id === r.styleId);
        const dt = new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
        return `<div class="dcv-recosting-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <div style="font-weight:700;font-size:0.88rem">${sv?.styleNumber||r.styleId} <span class="text-muted" style="font-weight:400">${sv?.styleName||''}</span></div>
              <div class="text-muted" style="font-size:0.72rem;margin-top:2px">${r.category||''} · ${dt} · by ${r.requestedByName||'?'}</div>
              ${r.note ? `<div style="margin-top:5px;font-size:0.8rem;font-style:italic;color:var(--text-secondary)">"${r.note}"</div>` : ''}
            </div>
            <span class="tag" style="background:rgba(245,158,11,0.15);color:#f59e0b;border-color:rgba(245,158,11,0.3);flex-shrink:0">⚠ Pending</span>
          </div>
        </div>`;
      }).join('');
      recostPanel = `
      <div class="card mb-3" style="padding:16px;border-left:4px solid #f59e0b">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="font-bold" style="font-size:0.9rem">↩ Re-cost Requests <span class="tag" style="background:rgba(245,158,11,0.15);color:#f59e0b">${pendingRecosts.length}</span></div>
          <div class="text-muted text-sm">Awaiting Production review</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">${rCards}</div>
      </div>`;
    }

    const pageSub = [statusBadge(prog.status), `${styles.length} style${styles.length!==1?'s':''}`, prog.brand, [prog.season,prog.year].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    return `
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('programs')">← Programs</button>
          <span class="text-muted">/</span>
          <span class="text-secondary text-sm">${prog.name}</span>
        </div>
        <h1 class="page-title">${prog.name}</h1>
        <p class="page-subtitle">${pageSub}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="App.navigate('buy-summary','${programId}')">📊 Buy Summary</button>
        <button class="btn btn-secondary" id="link-mode-btn" onclick="App.toggleStyleLinkMode('${programId}')">🔗 Link Styles</button>
        <button class="btn btn-secondary" onclick="App.navigate('design-handoff')">✏ Design Handoff</button>
      </div>
    </div>
    ${recostPanel}
    <div class="card">
      <div class="table-wrap">
        <table id="dcv-table">
          <thead><tr>
            <th id="link-chk-col" style="display:none;width:32px"></th>
            <th data-col="styleNum" style="min-width:80px">Style #</th>
            <th data-col="styleName">Style Name</th>
            <th data-col="cat">Category</th>
            <th data-col="fab" style="min-width:120px">Fabrication</th>
            <th data-col="qty" style="text-align:center;min-width:70px">Proj Qty</th>
            <th data-col="actualQty" style="text-align:center;min-width:80px">Actual Qty</th>
            <th data-col="sell">Proj Sell</th>
            <th data-col="costing" style="min-width:150px">Costing Status</th>
            <th data-col="techPack" style="min-width:130px">Tech Pack</th>
            <th data-col="sellIn" style="min-width:130px">Sell Status</th>
            <th data-col="placement" style="min-width:110px">Status</th>
            <th data-col="techNotes" style="min-width:180px">Tech Design Notes</th>
            <th data-col="recosting" style="min-width:150px">Re-cost</th>
          </tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
    <!-- Floating action bar for link mode -->
    <div id="link-fab" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:200;
      background:var(--bg-elevated);border:1px solid var(--border);border-radius:40px;
      padding:10px 22px;box-shadow:0 8px 32px rgba(0,0,0,0.35);align-items:center;gap:12px">
      <span id="link-fab-count" style="font-weight:700;color:var(--accent)">0 selected</span>
      <button class="btn btn-primary" id="link-fab-btn" onclick="App.openStyleLinkFromSelection('${programId}')">🔗 Link Selected →</button>
      <button class="btn btn-ghost btn-sm" onclick="App.cancelStyleLinkMode('${programId}')">✕ Cancel</button>
    </div>`;
  }

  // ── Cost History Timeline ─────────────────────────────────────────────────
  // Renders a compact read-only timeline of re-cost events for a given style.
  // Used inline in the design costing view and style detail modals.
  function renderCostHistoryTimeline(styleId) {
    if (!API.CostHistory) return '';
    const events = API.CostHistory.byStyle(styleId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!events.length) return '';

    const typeConfig = {
      recosted:    { icon: '↩', color: '#f59e0b', label: 'Released for Re-costing' },
      placed:      { icon: '✅', color: '#22c55e', label: 'Placed'                  },
      considering: { icon: '🔍', color: '#6366f1', label: 'Considering'             },
      note:        { icon: '📝', color: '#94a3b8', label: 'Note'                    },
    };

    const items = events.map(ev => {
      const cfg = typeConfig[ev.type] || typeConfig.note;
      const dt  = new Date(ev.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <div class="cost-history-item">
          <div class="cost-history-icon" style="background:${cfg.color}22;color:${cfg.color}">${cfg.icon}</div>
          <div class="cost-history-body">
            <div class="cost-history-label">
              <span style="font-weight:600;color:${cfg.color}">${cfg.label}</span>
              ${ev.category ? `<span class="tag" style="font-size:0.65rem;margin-left:6px">${ev.category}</span>` : ''}
            </div>
            ${ev.note ? `<div class="cost-history-note">"${ev.note}"</div>` : ''}
            <div class="cost-history-meta">
              ${ev.requestedByName ? `Requested by <strong>${ev.requestedByName}</strong>` : ''}
              ${ev.requestedByName && ev.releasedByName ? ' · ' : ''}
              ${ev.releasedByName ? `Released by <strong>${ev.releasedByName}</strong>` : ''}
              <span class="cost-history-date">${dt}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    return `<div class="cost-history-timeline">${items}</div>`;
  }

  // Opens a modal showing cost history for a given style
  // Called from app.js: App.showCostHistory(styleId, styleName)

  const api = {
    renderDashboard,
    renderBuySummary, renderCustomers,
    renderPrograms, renderStyleManager, renderCostSummary, buildCostMatrix,
    renderCostComparison, renderCrossProgram,
    renderTradingCompanies, renderInternalPrograms, renderCOO,
    renderPendingChanges, renderStaff, renderDepartments,
    renderTradingCompaniesPC, renderInternalProgramsPC, renderCOOPC,
    crossProgramTable, statusBadge, toggleTCCols, expandAllTCs, collapseAllTCs,
    // Pre-costing workflow (v11)
    renderDesignHandoff, renderSalesRequests, renderBuildFromHandoff, renderFabricStandards, renderRecostQueue,
    renderBottleneckTracker, designChangeHistoryPanel, renderAllDesignChanges,
    // Design/Sales costing view (v13)
    renderDesignCostingView, renderCostHistoryTimeline,
  };

  Object.defineProperty(api, '_programsView', {
    get: () => _programsView,
    set: (v) => { _programsView = v; },
  });
  return api;

})();
