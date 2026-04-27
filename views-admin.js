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
    const ipScoped    = (userIpId && !isAdminOrPC)
      ? allPrograms.filter(p => p.internalProgramId === userIpId)
      : userIpId
        ? allPrograms.filter(p => p.internalProgramId === userIpId)
        : allPrograms;

    // ── Dashboard filters: Season / Year / Brand / Tier ───────
    // Persist in localStorage so the user's view sticks across
    // navigations. Each filter intersects: a program must match
    // every active filter to count.
    const fSeason = localStorage.getItem('vcp_dash_f_season') || '';
    const fYear   = localStorage.getItem('vcp_dash_f_year')   || '';
    const fBrand  = localStorage.getItem('vcp_dash_f_brand')  || '';
    const fTier   = localStorage.getItem('vcp_dash_f_tier')   || '';
    const programs = ipScoped.filter(p =>
      (!fSeason || p.season === fSeason) &&
      (!fYear   || String(p.year) === fYear) &&
      (!fBrand  || p.brand === fBrand) &&
      (!fTier   || p.retailer === fTier)        // schema: retailer holds the tier
    );

    // Distinct values for the dropdowns, drawn from the IP-scoped pool
    // (so the filter list never offers a value that won't match anything).
    const distinct = (key) => [...new Set(ipScoped.map(p => p[key]).filter(Boolean))].sort();
    const seasonOpts = distinct('season');
    const yearOpts   = [...new Set(ipScoped.map(p => p.year).filter(Boolean))].map(String).sort();
    const brandOpts  = distinct('brand');
    const tierOpts   = distinct('retailer');
    const filterCount = [fSeason, fYear, fBrand, fTier].filter(Boolean).length;

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

    // ── Quote coverage by TC (across active programs) ──────────
    // For each TC assigned to any active program, compute what % of
    // their assigned (program, style) pairs they've quoted at least
    // once. Surfaces silent vendors before the matrix view does.
    // Also collects cycle-time samples: days from program createdAt
    // (proxy for assignment time) to that TC's first submission on
    // the program — a vendor responsiveness signal.
    const tcCoverage = {};   // tcId -> { tc, assigned, quoted, programIds, cycleSamples }
    for (const prog of programs) {
      if (prog.status !== 'Costing') continue;
      const progStyles = allStylesDB.filter(s => s.programId === prog.id && s.status !== 'cancelled');
      const asgns = API.Assignments.byProgram(prog.id);
      for (const a of asgns) {
        if (!a.tcId) continue;
        tcCoverage[a.tcId] ||= { tc: a.tc || API.TradingCompanies.get(a.tcId), assigned: 0, quoted: 0, programIds: new Set(), cycleSamples: [] };
        const slot = tcCoverage[a.tcId];
        slot.programIds.add(prog.id);
        for (const s of progStyles) {
          slot.assigned += 1;
          const hasQuote = allSubs.some(sub => sub.styleId === s.id && sub.tcId === a.tcId && sub.fob != null);
          if (hasQuote) slot.quoted += 1;
        }
        // Cycle-time sample for this (program, TC): earliest submission
        // with FOB, measured from the program's createdAt.
        if (prog.createdAt) {
          const subsOnProg = allSubs.filter(sub => sub.tcId === a.tcId && sub.fob != null && progStyles.some(s => s.id === sub.styleId));
          if (subsOnProg.length) {
            const earliest = subsOnProg.reduce((min, s) => {
              const t = new Date(s.createdAt || s.updatedAt || 0).getTime();
              return t && t < min ? t : min;
            }, Infinity);
            if (earliest !== Infinity) {
              const days = Math.max(0, Math.round((earliest - new Date(prog.createdAt).getTime()) / 86400000));
              slot.cycleSamples.push(days);
            }
          }
        }
      }
    }
    const tcCoverageRows = Object.values(tcCoverage)
      .map(x => ({
        ...x,
        pct: x.assigned > 0 ? Math.round((x.quoted / x.assigned) * 100) : 0,
        avgCycle: x.cycleSamples.length
          ? Math.round(x.cycleSamples.reduce((a, b) => a + b, 0) / x.cycleSamples.length)
          : null,
      }))
      .sort((a, b) => a.pct - b.pct);  // worst first — that's what needs attention

    // ── At-risk programs: CRD ≤ 14 days AND <100% costed ──────
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
    const atRiskProgs = programs.filter(p => {
      if (p.status !== 'Costing' || !p.crdDate) return false;
      const d = new Date(p.crdDate + 'T00:00:00');
      if (d < today || d > in14) return false;
      const ps = allStylesDB.filter(s => s.programId === p.id && s.status !== 'cancelled');
      if (!ps.length) return false;
      const quoted = ps.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
      return quoted < ps.length;  // not fully costed
    });

    // ── Stalled programs: assigned to TCs but ZERO submissions ─
    // Flags programs where vendors are silent — different from "low
    // coverage" because it means no activity has started at all.
    const stalledProgs = programs.filter(p => {
      if (p.status !== 'Costing') return false;
      if ((p.tcCount || 0) === 0) return false;       // need at least one TC assigned
      const progSubs = allSubs.filter(sub => {
        const s = allStylesDB.find(x => x.id === sub.styleId);
        return s && s.programId === p.id && sub.fob != null;
      });
      return progSubs.length === 0;
    }).map(p => {
      // Days since the first TC was assigned, as a proxy for "how long silent".
      // We don't have an assigned-at field on the program, so use program.createdAt.
      const days = p.createdAt ? Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000) : null;
      return { p, days };
    });

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

    // Same shape as alertKpi but the tile expands inline to show
    // panelHtml when clicked (native <details>, no JS state).
    const expandKpi = (icon, label, value, color, panelHtml) => `
      <details class="kpi-alert-expand ${value > 0 ? 'kpi-alert-active' : ''}" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 14px">
          <span class="kpi-alert-icon" style="color:${color}">${icon}</span>
          <span class="kpi-alert-value" style="color:${value > 0 ? color : '#64748b'}">${value}</span>
          <span class="kpi-alert-label" style="flex:1">${label}</span>
          ${value > 0 ? '<span class="text-muted text-sm">click to expand ▾</span>' : '<span class="text-muted text-sm">—</span>'}
        </summary>
        <div style="padding:0 14px 14px">
          ${panelHtml || '<div class="text-muted text-sm" style="padding:8px 0">Nothing to show.</div>'}
        </div>
      </details>`;

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
        ${alertKpi('📌', 'Design Changes — Pending Confirmation', API.DesignChanges.pendingAll().length, '#f59e0b', 'design-changes')}
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

      ${(() => {
        // Build the drill-down panels once so they can be embedded
        // inside their alert tiles (and not re-rendered as a separate
        // section below).

        const atRiskPanel = atRiskProgs.length ? `
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Program</th><th>CRD</th><th>Days left</th><th>Coverage</th>
            </tr></thead>
            <tbody>
              ${atRiskProgs.sort((a,b) => (a.crdDate||'').localeCompare(b.crdDate||'')).map(p => {
                const d = new Date(p.crdDate + 'T00:00:00');
                const daysLeft = Math.ceil((d - today) / 86400000);
                const ps = allStylesDB.filter(s => s.programId === p.id && s.status !== 'cancelled');
                const quoted = ps.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
                const pct = ps.length ? Math.round((quoted / ps.length) * 100) : 0;
                const urgent = daysLeft <= 7;
                return `<tr style="cursor:pointer" onclick="App.navigate('cost-summary','${p.id}')">
                  <td class="font-bold">${p.name}</td>
                  <td class="text-sm">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                  <td><span class="tag" style="background:${urgent?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)'};color:${urgent?'#ef4444':'#f59e0b'}">${daysLeft}d</span></td>
                  <td><span class="badge ${pct >= 80 ? 'badge-costing' : 'badge-pending'}">${quoted}/${ps.length} (${pct}%)</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>` : '';

        const stalledPanel = stalledProgs.length ? `
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Program</th><th>TCs assigned</th><th>Days since created</th><th></th>
            </tr></thead>
            <tbody>
              ${stalledProgs.sort((a,b) => (b.days||0) - (a.days||0)).map(({ p, days }) => `<tr style="cursor:pointer" onclick="App.navigate('cost-summary','${p.id}')">
                <td class="font-bold">${p.name}</td>
                <td><span class="tag">${p.tcCount}</span></td>
                <td>${days != null ? `<span class="tag" style="background:${days>14?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)'};color:${days>14?'#ef4444':'#f59e0b'}">${days}d</span>` : '—'}</td>
                <td class="text-sm text-muted">No quotes received yet</td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : '';

        // Re-cost panels: link directly to the queue with row-click
        // so the user can act after expanding.
        const recostList = (filterFn) => {
          const list = allRecosts.filter(filterFn).slice(0, 20);
          if (!list.length) return '';
          return `<div class="table-wrap"><table>
            <thead><tr><th>Style</th><th>Program</th><th>Category</th><th>Requested</th></tr></thead>
            <tbody>
              ${list.map(r => {
                const prog  = allPrograms.find(p => p.id === r.programId);
                const style = API.Styles.get(r.styleId);
                const dt = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
                return `<tr style="cursor:pointer" onclick="App.navigate('recost-queue')">
                  <td class="font-bold">${style?.styleNumber || '—'}</td>
                  <td class="text-sm">${prog?.name || '—'}</td>
                  <td class="text-sm">${r.category || '—'}</td>
                  <td class="text-sm text-muted">${dt}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`;
        };
        const recostProdPanel  = recostList(r => r.status === 'pending_production');
        const recostSalesPanel = recostList(r => r.status === 'pending_sales' || r.status === 'pending');

        const upcomingPanel = upcomingProgs => upcomingProgs.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Program</th><th>CRD</th><th>Days left</th></tr></thead>
            <tbody>
              ${upcomingProgs.map(p => {
                const d = new Date(p.crdDate + 'T00:00:00');
                const daysLeft = Math.ceil((d - today) / 86400000);
                return `<tr style="cursor:pointer" onclick="App.navigate('cost-summary','${p.id}')">
                  <td class="font-bold">${p.name}</td>
                  <td class="text-sm">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                  <td><span class="tag" style="background:${daysLeft<=7?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)'};color:${daysLeft<=7?'#ef4444':'#f59e0b'}">${daysLeft}d</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>` : '';
        const upcomingProgsList = programs
          .filter(p => p.crdDate && (() => { const d = new Date(p.crdDate + 'T00:00:00'); return d >= today && d <= in30; })())
          .sort((a, b) => a.crdDate.localeCompare(b.crdDate));

        return `
        ${sec('⚡ Action Items')}
        <div class="kpi-alerts" style="display:flex;flex-direction:column;gap:8px">
          ${expandKpi('🔥', 'At-risk programs (CRD ≤ 14d, not fully costed)', atRiskProgs.length,  '#ef4444', atRiskPanel)}
          ${expandKpi('🤐', 'Stalled programs (TCs assigned, zero quotes)',   stalledProgs.length, '#a855f7', stalledPanel)}
          ${expandKpi('↩',  'Re-costs Ready to Release to TC',                recostForProd,       '#f59e0b', recostProdPanel)}
          ${expandKpi('↩',  'Re-costs Awaiting Sales (visibility)',           recostForSales,      '#3b82f6', recostSalesPanel)}
          ${alertKpi('🚩', 'Flagged Prices', flagCount, '#ef4444', '')}
          ${expandKpi('📅', 'CRDs Within 30 Days',                            upcomingCRDs,        '#6366f1', upcomingPanel(upcomingProgsList))}
          ${isAdmin ? alertKpi('⏳', 'Pending Approvals', pendingCount, '#a855f7', 'pending-changes') : ''}
        </div>`;
      })()}

      ${tcCoverageRows.length ? `
      ${sec('🏭 Quote coverage by TC (active programs)')}
      <div class="card" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr>
            <th>TC</th><th>Programs</th><th>Quoted / Assigned</th><th>Coverage</th><th title="Average days from program creation to first quote">Avg cycle</th>
          </tr></thead>
          <tbody>
            ${tcCoverageRows.map(x => {
              const code = x.tc?.code || x.tc?.id || '—';
              const name = x.tc?.name || '';
              const color = x.pct >= 80 ? '#22c55e' : x.pct >= 50 ? '#f59e0b' : '#ef4444';
              const cycleColor = x.avgCycle == null ? '#94a3b8'
                : x.avgCycle <= 5 ? '#22c55e'
                : x.avgCycle <= 10 ? '#f59e0b'
                : '#ef4444';
              return `<tr>
                <td>
                  <div class="font-bold">${code}</div>
                  <div class="text-sm text-muted">${name}</div>
                </td>
                <td><span class="tag">${x.programIds.size}</span></td>
                <td class="text-sm">${x.quoted} / ${x.assigned}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;min-width:140px">
                    <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08)">
                      <div style="height:6px;border-radius:3px;background:${color};width:${x.pct}%"></div>
                    </div>
                    <span style="font-weight:600;color:${color};white-space:nowrap">${x.pct}%</span>
                  </div>
                </td>
                <td><span class="tag" style="color:${cycleColor};font-weight:600">${x.avgCycle == null ? '—' : x.avgCycle + 'd'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>` : ''}

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
      <select class="form-select" onchange="App.filterDashboardByIP(this.value)" style="width:160px"
        title="Filter by team">
        <option value="">All Teams</option>
        ${API.cache.internalPrograms.map(p =>
          `<option value="${p.id}" ${userIpId === p.id ? 'selected' : ''}>${p.name}</option>`
        ).join('')}
      </select>` : '';

    const optsToHtml = (opts, current) =>
      `<option value="">All</option>` + opts.map(o => `<option value="${o}" ${current === o ? 'selected' : ''}>${o}</option>`).join('');
    const filterSelect = (key, current, opts, placeholder) => `
      <select class="form-select" onchange="App._dashFilterSet('${key}', this.value)" style="width:130px" title="Filter by ${placeholder}">
        <option value="">${placeholder}: All</option>
        ${opts.map(o => `<option value="${o}" ${String(current) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;

    const filterBar = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${teamFilter}
        ${filterSelect('season', fSeason, seasonOpts, 'Season')}
        ${filterSelect('year',   fYear,   yearOpts,   'Year')}
        ${filterSelect('brand',  fBrand,  brandOpts,  'Brand')}
        ${filterSelect('tier',   fTier,   tierOpts,   'Tier')}
        ${filterCount > 0 ? `<button class="btn btn-ghost btn-sm" onclick="App._dashFilterClear()" title="Clear all filters">✕ Clear (${filterCount})</button>` : ''}
      </div>`;

    const filterSummary = filterCount > 0 ? `
      <div class="card mb-3" style="padding:8px 12px;display:flex;align-items:center;gap:8px;background:rgba(99,102,241,0.06);border-left:3px solid var(--accent)">
        <span class="text-sm">📍 Showing <strong>${programs.length}</strong> of ${ipScoped.length} programs</span>
        ${[
          fSeason ? `<span class="tag" style="font-size:0.72rem">${fSeason}</span>` : '',
          fYear   ? `<span class="tag" style="font-size:0.72rem">${fYear}</span>` : '',
          fBrand  ? `<span class="tag" style="font-size:0.72rem">${fBrand}</span>` : '',
          fTier   ? `<span class="tag" style="font-size:0.72rem">${fTier}</span>` : '',
        ].filter(Boolean).join('')}
      </div>` : '';

    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard ${teamLabel}</h1>
        <p class="page-subtitle">${today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
      </div>
      ${filterBar}
    </div>
    ${filterSummary}
    ${mainSection}`;
  }

  // ── Programs ───────────────────────────────────────────────
  function renderPrograms(statusFilter) {
    // statusFilter: null | 'open' | 'placed' | 'cancelled'
    //   null / 'open' → Draft + Costing (+ handoffs + sales requests)
    //   'placed'      → Placed programs only (no handoffs/requests)
    //   'cancelled'   → Cancelled programs only
    const bucket = statusFilter || 'open';
    const allHandoffs = API.DesignHandoffs.all();
    const allRequests = API.SalesRequests.all();
    const allPrograms = API.cache.programs;

    // Apply bucket filter to programs + decide whether to include
    // pre-program stages (handoffs + SRs only in Open bucket).
    let shownPrograms, shownHandoffs, shownRequests;
    if (bucket === 'placed') {
      shownPrograms = allPrograms.filter(p => p.status === 'Placed');
      shownHandoffs = [];
      shownRequests = [];
    } else if (bucket === 'cancelled') {
      shownPrograms = allPrograms.filter(p => p.status === 'cancelled');
      shownHandoffs = [];
      shownRequests = [];
    } else {
      shownPrograms = allPrograms.filter(p => p.status === 'Draft' || p.status === 'Costing');
      shownHandoffs = allHandoffs.filter(h => !allRequests.find(r => r.sourceHandoffId === h.id));
      shownRequests = allRequests.filter(r => !r.linkedProgramId);
    }

    const openHandoffs = shownHandoffs;
    const openRequests = shownRequests;
    const draftPrograms = bucket === 'open' ? shownPrograms.filter(p => p.status === 'Draft') : [];

    const totalEntries = openHandoffs.length + openRequests.length + shownPrograms.length;

    const bucketMeta = {
      open:      { title: '📂 Open Programs',      subtitle: `${totalEntries} entries — draft / costing / pre-costing` },
      placed:    { title: '✅ Placed Programs',    subtitle: `${shownPrograms.length} placed` },
      cancelled: { title: '🗑 Cancelled Programs', subtitle: `${shownPrograms.length} cancelled` },
    }[bucket];

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
          const hasHandoff = !!p.sourceHandoffId;
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
            <div style="display:flex;gap:16px;align-items:center">
              <div>
                <div class="font-bold">${p.name}</div>
                <div class="text-sm text-muted">${p.season||'—'} ${p.year||''} · ${p.gender ? p.gender + ' · ' : ''}${p.retailer||'No retailer'}</div>
              </div>
              <span class="tag">${p.styleCount || 0} styles</span>
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
      <div><h1 class="page-title">${bucketMeta.title}</h1><p class="page-subtitle">${bucketMeta.subtitle}</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="App.openProgramModal()">＋ New Program</button>
      </div>
    </div>
    <div class="filter-bar mb-3">
      <div class="search-input-wrap"><span class="search-icon">🔍</span><input class="form-input" id="prog-search" placeholder="Search programs…" oninput="App.filterPrograms()"></div>
    </div>
    ${pendingBanner}
    <div id="programs-grid">
      ${programsTable(openHandoffs, openRequests, shownPrograms)}
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
      'cancelled':        ['badge-cancelled',  '✕'],
      'Batch Review':     ['badge-amber',      '📦'],
      'In Progress':      ['badge-costing',    '▶'],
      'Batching':         ['badge-costing',    '📦'],
      'Released':         ['badge-placed',     '↗'],
      'Complete':         ['badge-placed',     '🏁'],
    };
    const [cls, icon] = map[stage] || ['badge-pending', ''];
    return `<span class="badge ${cls}">${icon} ${stage}</span>`;
  }

  function programsTable(openHandoffs, openRequests, allPrograms) {
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const dash = `<span class="text-muted">—</span>`;
    // Role check — used to show/hide admin buttons in program rows
    const _role = (typeof App !== 'undefined' && App._getState && App._getState()?.user?.role) || null;
    const isAdminOrPC = _role === 'admin' || _role === 'pc';

    const thead = `<thead><tr>
      <th data-filter-col="season">Season</th>
      <th data-filter-col="year">Year</th>
      <th data-filter-col="gender">Gender</th>
      <th data-filter-col="brand">Brand</th>
      <th data-filter-col="tier">Tier</th>
      <th data-filter-col="stage">Stage</th>
      <th>SR #</th><th>Ver.</th>
      <th style="text-align:center">Styles</th>
      <th style="text-align:center">Costed</th>
      <th>Costs Due Date</th>
      <th style="text-align:center">Placed</th>
      <th style="text-align:center">TTL Proj Qty</th>
      <th style="text-align:center">TTL Actual Qty</th>
      <th style="text-align:center">TCs</th>
      <th>Start Date</th><th>End Date</th>
      <th>Actions</th>
    </tr></thead>`;

    // ── Design Handoff rows (not yet in a request) ────────────
    // Column order: Season(1) Year(2) Gender(3) Brand(4) Tier(5) Stage(6) SR#(7) Ver(8)
    //   Styles(9) Costed(10) CostsDueDate(11) Placed(12) ProjQty(13) ActlQty(14)
    //   TCs(15) StartDate(16) EndDate(17) Actions(18) = 18 cells.
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
      return `<tr style="background:rgba(124,58,237,0.03)"
        data-flt-season="${h.season || ''}"
        data-flt-year="${h.year || ''}"
        data-flt-gender=""
        data-flt-brand="${(h.retailer || h.brand || '').replace(/"/g, '&quot;')}"
        data-flt-tier="${(h.tier || '').replace(/"/g, '&quot;')}"
        data-flt-stage="Design Submitted">
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
        <td class="text-sm">${fmtDate(h.firstCRD)}</td>
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
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)"
              onclick="App.openAssignVendorsToHandoff('${h.id}')">🏭 Vendors</button>
            <button class="btn btn-primary btn-sm" onclick="App.openBuildRequestFromHandoff('${h.id}')">📝 Build Request</button>
            <button class="btn btn-secondary btn-sm" onclick="App.viewHandoff('${h.id}')">👁 Open</button>
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
      return `<tr style="background:rgba(245,158,11,0.03)"
        data-flt-season="${r.season || ''}"
        data-flt-year="${r.year || ''}"
        data-flt-gender="${(r.gender || '').replace(/"/g, '&quot;')}"
        data-flt-brand="${(r.brand || '').replace(/"/g, '&quot;')}"
        data-flt-tier="${(r.retailer || '').replace(/"/g, '&quot;')}"
        data-flt-stage="Sales Request">
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
        <td class="text-sm">${fmtDate(r.costDueDate || r.firstCRD)}</td>
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
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)"
              onclick="App.openAssignVendorsToRequest('${r.id}')">🏭 Vendors</button>
            <button class="btn btn-secondary btn-sm" onclick="App.viewSalesRequest('${r.id}')">👁 Open</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // ── Program rows (all statuses) ───────────────────────────
    const programRows = allPrograms.map(p => {
      const styleCount   = p.styleCount   || 0;
      const tcCount      = p.tcCount      || 0;
      const placedCount  = p.placedCount  || 0;
      const costedCount  = p.costedCount  || 0;
      const projQtyTotal = p.projQtyTotal || 0;
      const actlQtyTotal = p.actlQtyTotal || 0;
      const isDraft  = p.status === 'Draft';
      const handoff  = API.DesignHandoffs.all().find(h => h.linkedProgramId === p.id);
      const srNum    = handoff?.supplierRequestNumber || '';
      return `<tr style="cursor:${isDraft ? 'default' : 'pointer'}" onclick="${isDraft ? '' : `App.openProgram('${p.id}')`}"
        data-flt-season="${(p.season || '').replace(/"/g, '&quot;')}"
        data-flt-year="${p.year || ''}"
        data-flt-gender="${(p.gender || '').replace(/"/g, '&quot;')}"
        data-flt-brand="${(p.brand || '').replace(/"/g, '&quot;')}"
        data-flt-tier="${(p.retailer || '').replace(/"/g, '&quot;')}"
        data-flt-stage="${(p.status || '').replace(/"/g, '&quot;')}">
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
        <td class="text-sm">${fmtDate(p.crdDate)}</td>
        <td style="text-align:center"><span class="tag ${placedCount > 0 ? 'tag-success' : ''}">${placedCount}</span></td>
        <td style="text-align:center"><span class="tag">${projQtyTotal > 0 ? projQtyTotal.toLocaleString() : '—'}</span></td>
        <td style="text-align:center"><span class="tag">${actlQtyTotal > 0 ? actlQtyTotal.toLocaleString() : '—'}</span></td>
        <td style="text-align:center"><span class="tag">${tcCount}</span></td>
        <td class="text-sm">${fmtDate(p.startDate)}</td>
        <td class="text-sm">${fmtDate(p.endDate)}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <div style="display:flex;gap:6px">
            ${isDraft
              ? (isAdminOrPC
                  ? `<button class="btn btn-secondary btn-sm" onclick="App.openProgram('${p.id}')">👁 Preview</button>
                     <button class="btn btn-primary btn-sm" onclick="App.acknowledgeProgram('${p.id}')">✅ Release</button>`
                  : `<button class="btn btn-secondary btn-sm" onclick="App.openProgram('${p.id}')">👁 Preview</button>`)
              : (isAdminOrPC
                  ? `<button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">📋 Open</button>
                     <button class="btn btn-secondary btn-sm" onclick="App.navigate('styles','${p.id}')">Styles</button>
                     <button class="btn btn-secondary btn-sm" onclick="App.openProgramModal('${p.id}')">Edit</button>
                     <button class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="App.cancelProgram('${p.id}')">🚫 Cancel</button>`
                  : `<button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">👁 Open</button>`)
            }
          </div>
        </td>
      </tr>`;
    }).join('');

    const allRows = handoffRows + requestRows + programRows;
    if (!allRows.trim()) return `<div class="empty-state"><div class="icon">📋</div><h3>No programs yet</h3></div>`;

    return `<div class="card" style="padding:0"><div class="table-wrap"><table id="programs-tbl" data-column-filter>${thead}<tbody>${allRows}</tbody></table></div></div>`;
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
        <button class="btn btn-primary btn-sm" onclick="App.openProgram('${p.id}')">📋 Open</button>
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('styles','${p.id}')">Styles</button>
        <button class="btn btn-secondary btn-sm" onclick="App.openProgramModal('${p.id}')">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="App.openAssignTCs('${p.id}')">🏭 Assign</button>
        <select class="form-select" style="padding:5px 10px;font-size:0.78rem;flex:1" onchange="App.updateProgramStatus('${p.id}',this.value)">
          <option ${p.status === 'Costing' ? 'selected' : ''}>Costing</option>
          <option ${p.status === 'Placed' ? 'selected' : ''}>Placed</option>
        </select>
        <button class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="App.cancelProgram('${p.id}')">🚫 Cancel</button>
      </div>
    </div>`;
  }

  function renderStyleManager(programId) {
    const prog   = API.Programs.get(programId);
    const styles = API.Styles.byProgram(programId);
    const tcs    = API.Assignments.byProgram(programId);
    const links  = API.StyleLinks.byProgram(programId);
    const linkedIds = new Set(links.flatMap(l => l.styleIds || []));

    const smLinkedHandoff  = (API.DesignHandoffs?.all?.() || []).find(h => h.linkedProgramId === programId);
    const smBatchReleases  = smLinkedHandoff?.batchReleases || [];
    const smBatchColors    = ['#6366f1','#22c55e','#f59e0b','#ef4444','#0ea5e9','#a855f7'];
    const smAllBatchLabels = [...new Set([
      ...styles.map(s => s.releasedBatch).filter(Boolean),
      ...(smLinkedHandoff?.stylesList || []).map(s => s.batchLabel).filter(Boolean),
    ])];
    const smHasManyBatches = smAllBatchLabels.length >= 2;
    const smBatchTileRow = smHasManyBatches ? (() => {
      const tiles = smAllBatchLabels.map((label, i) => {
        const rel      = smBatchReleases.find(r => r.batchLabel === label);
        const color    = smBatchColors[i % smBatchColors.length];
        const count    = styles.filter(s => s.releasedBatch === label).length;
        const dateStr  = rel ? new Date(rel.releasedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Pending';
        const isPending = !rel;
        const safeLabel = label.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return `<div class="kpi-card-wide" data-batch-tile="${safeLabel}"
          onclick="App._toggleBatchFilter('style-table',this.dataset.batchTile,this)"
          style="cursor:pointer;border-top:3px solid ${isPending?'#94a3b8':color};min-width:120px;user-select:none">
          <div class="kpi-value" style="font-size:1.1rem;color:${isPending?'#94a3b8':color}">${label}</div>
          <div class="kpi-label">${count} style${count!==1?'s':''} · ${dateStr}</div>
        </div>`;
      }).join('');
      return `<div class="kpi-grid" style="margin-bottom:16px">${tiles}</div>`;
    })() : '';

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
        <h1 class="page-title">${[prog.season, prog.year, prog.name].filter(Boolean).join(' · ')} — Styles</h1>
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
    ${smBatchTileRow}
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
            ${styles.length ? styles.map(s => styleRow(s, prog, linkedIds, smHasManyBatches)).join('') : `<tr><td colspan="12" class="text-center text-muted" style="padding:40px">No styles yet.</td></tr>`}
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

  function styleRow(s, prog, linkedIds, showBatchBadge) {
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
    return `<tr data-style-id="${s.id}" data-batch-label="${(s.releasedBatch||'').replace(/"/g,'&quot;')}">
      <td class="sel-col">
        <input type="checkbox" class="style-sel-chk" data-sid="${s.id}"
          onchange="App.onStyleSelect('${s.id}',this.checked,'${s.programId}')">
      </td>
      <td id="link-chk-cell-${s.id}" style="display:none;width:32px;text-align:center">
        <input type="checkbox" class="style-link-chk" data-sid="${s.id}"
          ${linkedIds.has(s.id) ? 'disabled title="Already in a group"' : ''}
          onchange="App.onStyleLinkCheck('${s.programId}')">
      </td>
      <td data-col="styleNum" class="primary">${s.styleNumber}${linkBadge}${prog && ['Costing','Placed'].includes(prog.status) ? ' <span title=\'Style Locked — re-cost required for changes\' style=\'font-size:0.75rem;opacity:0.6\'>🔒</span>' : ''}${showBatchBadge && s.releasedBatch ? `<span class="tag" style="font-size:0.6rem;margin-left:4px;background:rgba(99,102,241,0.12);color:#6366f1;vertical-align:middle">${s.releasedBatch}</span>` : ''}</td>
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

    // ── Header KPI tiles ────────────────────────────────────────
    // Aggregate the data the matrix shows so users see context
    // before scrolling. costed = at least one quote with FOB; placed
    // = a placement row exists; spend = sum of placed (FOB × projQty).
    const allSubs = API.Submissions.all();
    const liveStyles = styles.filter(s => s.status !== 'cancelled');
    const totalStyles  = liveStyles.length;
    const costedCount  = liveStyles.filter(s => allSubs.some(sub => sub.styleId === s.id && sub.fob != null)).length;
    const placedCount  = liveStyles.filter(s => API.Placements.get(s.id) != null).length;
    const placedDetail = liveStyles.map(s => {
      const pl = API.Placements.get(s.id);
      if (!pl) return null;
      const sub = allSubs.find(x => x.styleId === s.id && x.tcId === pl.tcId && x.coo === pl.coo);
      const fob = parseFloat(sub?.fob || pl.confirmedFob || 0);
      const qty = parseFloat(s.projQty || 0);
      return fob > 0 ? { fob, qty } : null;
    }).filter(Boolean);
    const avgPlacedFob = placedDetail.length ? (placedDetail.reduce((s,x) => s + x.fob, 0) / placedDetail.length) : 0;
    const totalSpend   = placedDetail.reduce((s,x) => s + x.fob * x.qty, 0);
    const costedPct    = totalStyles ? Math.round((costedCount / totalStyles) * 100) : 0;
    const placedPct    = totalStyles ? Math.round((placedCount / totalStyles) * 100) : 0;
    const tile = (label, value, sub, color) => `
      <div class="kpi-card-wide" style="border-left:3px solid ${color}">
        <div class="kpi-wide-title">${label}</div>
        <div class="kpi-wide-big">${value}</div>
        ${sub ? `<div class="text-sm text-muted" style="margin-top:4px">${sub}</div>` : ''}
      </div>`;
    const headerTiles = totalStyles > 0 ? `
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:16px">
        ${tile('Costed',  `${costedCount} <span class="kpi-wide-of">/ ${totalStyles}</span>`, `${costedPct}% with at least one quote`, '#6366f1')}
        ${tile('Placed',  `${placedCount} <span class="kpi-wide-of">/ ${totalStyles}</span>`, `${placedPct}% awarded to a vendor`, '#22c55e')}
        ${tile('Avg FOB (placed)', avgPlacedFob > 0 ? `$${avgPlacedFob.toFixed(2)}` : '—', placedDetail.length ? `Across ${placedDetail.length} placement${placedDetail.length!==1?'s':''}` : 'No placements yet', '#f59e0b')}
        ${tile('Est. spend', totalSpend > 0 ? `$${totalSpend.toLocaleString(undefined,{maximumFractionDigits:0})}` : '—', 'FOB × projected qty', '#a855f7')}
      </div>` : '';

    const _csLinkedHandoff  = (API.DesignHandoffs?.all?.() || []).find(h => h.linkedProgramId === programId);
    const _csBatchReleases  = _csLinkedHandoff?.batchReleases || [];
    const _csBatchColors    = ['#6366f1','#22c55e','#f59e0b','#ef4444','#0ea5e9','#a855f7'];
    const _csBatchLabels    = [...new Set([
      ...styles.map(s => s.releasedBatch).filter(Boolean),
      ...(_csLinkedHandoff?.stylesList || []).map(s => s.batchLabel).filter(Boolean),
    ])];
    const _csHasManyBatches = _csBatchLabels.length >= 2;
    const batchTileRow = _csHasManyBatches ? (() => {
      const tiles = _csBatchLabels.map((label, i) => {
        const rel      = _csBatchReleases.find(r => r.batchLabel === label);
        const color    = _csBatchColors[i % _csBatchColors.length];
        const count    = styles.filter(s => s.releasedBatch === label).length;
        const dateStr  = rel ? new Date(rel.releasedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Pending';
        const isPending = !rel;
        const safeLabel = label.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return `<div class="kpi-card-wide" data-batch-tile="${safeLabel}"
          onclick="App._toggleBatchFilter('cost-summary-table',this.dataset.batchTile,this)"
          style="cursor:pointer;border-top:3px solid ${isPending?'#94a3b8':color};min-width:120px;user-select:none">
          <div class="kpi-value" style="font-size:1.1rem;color:${isPending?'#94a3b8':color}">${label}</div>
          <div class="kpi-label">${count} style${count!==1?'s':''} · ${dateStr}</div>
        </div>`;
      }).join('');
      return `<div class="kpi-grid" style="margin-bottom:16px">${tiles}</div>`;
    })() : '';

    return `
    ${programTabBar(programId, 'cost', prog)}
    <div class="page-header" style="margin-top:12px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('programs')">← Programs</button>
          <span class="text-muted">/</span>
          <span class="text-secondary text-sm">${prog.name}</span>
        </div>
        <h1 class="page-title">${[prog.season, prog.year, prog.name].filter(Boolean).join(' · ')} — Cost Summary</h1>
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
    ${headerTiles}
    ${batchTileRow}
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
      <th rowspan="2" class="sticky-col mat-hdr" style="width:28px;min-width:28px;padding:0;text-align:center" title="Design change history"></th>
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

    // Batch context — computed early so buildRows/buildGhostRows closures can use it
    const linkedHandoff = (API.DesignHandoffs?.all?.() || []).find(h => h.linkedProgramId === programId);
    const hasManyBatches = new Set([
      ...styles.map(s => s.releasedBatch).filter(Boolean),
      ...(linkedHandoff?.stylesList || []).map(s => s.batchLabel).filter(Boolean),
    ]).size >= 2;

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

        const dcChanges = API.DesignChanges.byStyle(s.id);
        const dcPending = dcChanges.filter(c => c.status === 'pending').length;
        const dcTotal   = dcChanges.length;
        const dcBadge   = dcTotal > 0
          ? `<span class="revision-badge" style="cursor:pointer;font-size:0.68rem;white-space:nowrap" title="${dcPending > 0 ? dcPending + ' pending' : ''} ${dcTotal} change${dcTotal !== 1 ? 's' : ''}" onclick="App.openStyleTimeline('${s.id}')">🕒 ${dcTotal}${dcPending > 0 ? `<span style='color:#f59e0b;font-weight:700'> ·${dcPending}p</span>` : ''}</span>`
          : '';

        let rowHtml = `
          <td class="sticky-col mat-cell-white" style="width:28px;min-width:28px;padding:2px 4px;text-align:center">${dcBadge}</td>
          <td data-col="styleNum" class="sticky-col mat-cell-white">${s.styleNumber}${s._linkAnchorBadge||''}${hasManyBatches && s.releasedBatch ? `<span class="tag" style="font-size:0.6rem;margin-left:4px;background:rgba(99,102,241,0.12);color:#6366f1;vertical-align:middle">${s.releasedBatch}</span>` : ''}</td>
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
            // Hover-reveal flag opener (⚐) — shown only on cells that
            // have a submission and no existing flag. Right-click
            // anywhere in the cell still works as a power-user shortcut.
            const addBtn = (subId && !flag)
              ? `<span class="flag-add-btn" title="Flag this cell (or right-click)" onclick="App.openFlagMenu(event,'${subId}','${field}')">⚐</span>`
              : '';
            return `<div class="flaggable-cell${flag?' has-flag':''}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;">${inputHtml}${dot}${hist}${addBtn}</div>`;
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
          rowHtml += `<td data-col="actions" style="white-space:nowrap"><button class="btn-cancel-style" onclick="App.cancelStyle('${s.id}','${pid}')">🚫</button><button class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:2px 5px;margin-left:2px" title="Log design change" onclick="App.openDesignChangeModal('${s.id}')">📌</button></td>`;
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
        return `<tr class="${rowClass}" data-style-id="${s.id}" data-batch-label="${(s.releasedBatch||'').replace(/"/g,'&quot;')}"><td class="sel-col sticky-col mat-cell-white" style="width:36px;min-width:36px"><input type="checkbox" class="style-sel-chk" data-sid="${s.id}" onchange="App.onStyleSelect('${s.id}',this.checked,'${programId}')"></td>${rowHtml}</tr>`;
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
          <span style="color:${color};font-size:0.85em;margin-right:4px">↳</span>${s.styleNumber}${badge}${hasManyBatches && s.releasedBatch ? `<span class="tag" style="font-size:0.6rem;margin-left:4px;background:rgba(99,102,241,0.12);color:#6366f1;vertical-align:middle">${s.releasedBatch}</span>` : ''}
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
          const addBtn = (subId && !flag)
            ? `<span class="flag-add-btn" title="Flag this cell (or right-click)" onclick="App.openFlagMenu(event,'${subId}','${field}')">⚐</span>`
            : '';
          return `<div class="flaggable-cell${flag?' has-flag':''}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;">${inputHtml}${dot}${hist}${addBtn}</div>`;
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
      rowHtml += `<td data-col="actions" style="white-space:nowrap"><button class="btn-cancel-style" onclick="App.cancelStyle('${s.id}','${programId}')">🚫</button><button class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:2px 5px;margin-left:2px" title="Log design change" onclick="App.openDesignChangeModal('${s.id}')">📌</button></td>`;
      const sn2 = (s.styleNumber||'').trim();
      const hist2 = sn2 ? (repeatHistory[sn2]||[]) : [];
      if (!hist2.length) {
        rowHtml += `<td data-col="repeat" class="text-muted text-sm" style="text-align:center">—</td>`;
      } else {
        const last = hist2[0];
        rowHtml += `<td data-col="repeat" style="font-size:0.78rem;white-space:nowrap;padding:6px 10px"><div style="font-weight:600;color:var(--accent)">${last.tcCode} · ${last.coo}</div><div style="color:var(--text-secondary)">${last.season}&nbsp; FOB $${last.fob.toFixed(2)}</div></td>`;
      }
      const rowClass2 = bestLDP !== null && targetLDP ? (bestLDP <= targetLDP ? 'row-on-target' : 'row-over-target') : '';
      // Two leading empty cells to match anchor row structure:
      // col 1 = bulk-select (36px), col 2 = design-change badge (28px).
      return `<tr class="style-link-guest-row ${rowClass2}" data-style-id="${s.id}" data-batch-label="${(s.releasedBatch||'').replace(/"/g,'&quot;')}" style="background:${colorAlpha}"><td class="sel-col sticky-col mat-cell-white" style="width:36px;min-width:36px"></td><td class="sticky-col mat-cell-white" style="width:28px;min-width:28px;padding:0"></td>${rowHtml}</tr>`;
    }

    // Build active rows — optionally grouped
    let activeRows = '';
    const totalFixedCols = 12 + colGroups.length * 6 + 2; // +2 actual/wtd, +2 actions+repeat

    // Unreleased handoff styles — ghost rows so production sees upcoming styles
    const unreleasedByFab = {};
    if (linkedHandoff) {
      const releasedIds = new Set((linkedHandoff.batchReleases || []).flatMap(b => b.styleIds || []));
      (linkedHandoff.stylesList || []).forEach(hs => {
        if (!releasedIds.has(hs.id)) {
          const fab = (hs.fabrication || hs.fabric || '—').trim() || '—';
          if (!unreleasedByFab[fab]) unreleasedByFab[fab] = [];
          unreleasedByFab[fab].push(hs);
        }
      });
    }
    const ghostColspan = totalFixedCols - 3;
    function buildGhostRows(handoffStyles) {
      return handoffStyles.map(hs => `<tr style="opacity:0.35;pointer-events:none" data-batch-label="${(hs.batchLabel||'').replace(/"/g,'&quot;')}">
        <td class="sel-col sticky-col mat-cell-white" style="width:36px;min-width:36px"></td>
        <td class="sticky-col mat-cell-white" style="width:28px;min-width:28px;padding:0"></td>
        <td data-col="styleNum" class="sticky-col mat-cell-white" style="color:#94a3b8;font-style:italic">${hs.styleNumber || '—'}</td>
        <td colspan="${ghostColspan}" style="color:#94a3b8;font-size:0.8rem;padding:6px 8px">
          <span style="font-style:italic">${hs.styleName || ''}</span>
          ${hasManyBatches ? `<span class="tag" style="font-size:0.62rem;margin-left:6px;background:rgba(148,163,184,0.12);color:#94a3b8">⏳ ${hs.batchLabel || 'Batch 1'}</span>` : ''}
          <span style="font-size:0.7rem;opacity:0.7;margin-left:6px">Unreleased</span>
        </td>
      </tr>`).join('');
    }
    const consumedFabs = new Set();

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
        // Render ghost rows for unreleased handoff styles in this fabric group
        if (unreleasedByFab[fab]?.length) {
          activeRows += buildGhostRows(unreleasedByFab[fab]);
          consumedFabs.add(fab);
        }
      });
      // Fabric groups that exist only in the handoff (no released styles yet)
      Object.entries(unreleasedByFab).forEach(([fab, ghosts]) => {
        if (consumedFabs.has(fab)) return;
        activeRows += `<tr class="cs-group-row">
          <td colspan="${totalFixedCols}">
            <span style="font-weight:600">📁 ${fab}</span>
            <span class="cs-group-count">${ghosts.length} style${ghosts.length !== 1 ? 's' : ''} — unreleased</span>
          </td>
        </tr>`;
        activeRows += buildGhostRows(ghosts);
      });
    } else {
      activeRows = buildRows(activeStyles, false);
      // Append unreleased ghost rows at the end
      const allGhosts = Object.values(unreleasedByFab).flat();
      if (allGhosts.length) activeRows += buildGhostRows(allGhosts);
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
        <h1 class="page-title">${[prog.season, prog.year, prog.name, style.styleNumber].filter(Boolean).join(' · ')} — ${style.styleName}</h1>
        <p class="page-subtitle">${style.category || ''} · ${(style.fabrication || '').substring(0, 50)} · Sell: ${fmt(style.projSellPrice)} · Qty: ${fmtN(style.projQty)}</p>
      </div>
      ${targetLDP ? `<div class="card card-sm" style="text-align:center;min-width:130px"><div class="text-sm text-muted">Target LDP</div><div class="font-bold text-accent" style="font-size:1.3rem">${fmt(targetLDP)}</div></div>` : ''}
    </div>
    ${placement ? (() => {
      const tcCode = API.TradingCompanies.get(placement.tcId)?.code || '';
      const vendorFactories = (API.Factories?.byTc(placement.tcId) || []).filter(f => f.status === 'active');
      const assignedF = placement.factoryId ? vendorFactories.find(f => f.id === placement.factoryId) : null;
      return `<div class="alert alert-success mb-3" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>🏆 Placed with <strong>${tcCode} (${placement.coo})</strong> at ${fmt(placement.confirmedFob)} FOB${assignedF ? ` · at <strong>${assignedF.factoryName}</strong>${assignedF.factoryCountry ? ` · ${assignedF.factoryCountry}` : ''}` : ''}</div>
        ${vendorFactories.length ? `
          <select class="form-select" style="max-width:260px" onchange="App.setPlacementFactory('${styleId}', this.value)" title="Assign factory">
            <option value="">— No factory assigned —</option>
            ${vendorFactories.map(f => `<option value="${f.id}" ${placement.factoryId === f.id ? 'selected' : ''}>🏭 ${f.factoryName}${f.factoryCountry ? ' · ' + f.factoryCountry : ''}</option>`).join('')}
          </select>` : '<span class="text-sm text-muted">(no active factories on this TC yet)</span>'}
      </div>`;
    })() : ''}
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


    let html = `<table id="cp-table" data-column-filter><thead><tr>
      <th data-col="prog" data-filter-col="program">Program</th>
      <th data-col="sn">Style #</th>
      <th data-col="name">Style Name</th>
      <th data-col="fab" data-filter-col="fabrication">Fabrication</th>
      <th data-col="cat" data-filter-col="category">Category</th>
      <th data-col="sell">Proj Sell</th><th data-col="ldp">Target LDP</th>
      <th data-col="q">Quotes</th><th data-col="best">Best LDP</th>
      <th data-col="bestV" data-filter-col="besttc">Best TC</th>
      <th data-col="status" data-filter-col="status">Status</th>
      <th data-col="actions"></th>
    </tr></thead><tbody>`;
    Object.entries(grouped).forEach(([group, items]) => {
      if (groupBy) html += `<tr class="group-row"><td colspan="12">📁 ${group} (${items.length})</td></tr>`;
      items.forEach(r => {
        const onTarget = r.bestLDP && r.targetLDP && r.bestLDP <= r.targetLDP;
        html += `<tr
          data-flt-program="${(r.prog?.name || '').replace(/"/g, '&quot;')}"
          data-flt-fabrication="${(r.fabrication || '').replace(/"/g, '&quot;')}"
          data-flt-category="${(r.category || '').replace(/"/g, '&quot;')}"
          data-flt-besttc="${(r.bestTC?.code || '').replace(/"/g, '&quot;')}"
          data-flt-status="${(r.status || 'open').replace(/"/g, '&quot;')}">
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
      <button class="program-tab ${activeTab === 'overview' ? 'active' : ''}" onclick="App.navigate('overview','${programId}')">📈 Overview</button>
      <button class="program-tab ${activeTab === 'cost' ? 'active' : ''}" onclick="App.navigate('cost-summary','${programId}')">📊 Cost Summary</button>
      <button class="program-tab ${activeTab === 'buys' ? 'active' : ''}" onclick="App.navigate('buy-summary','${programId}')">🛒 Buy Summary</button>
      <button class="program-tab ${activeTab === 'capacity' ? 'active' : ''}" onclick="App.navigate('capacity-plan','${programId}')">🏭 Capacity Plan</button>
      <button class="program-tab ${activeTab === 'delivery' ? 'active' : ''}" onclick="App.navigate('delivery-plan','${programId}')">🚢 Delivery Plan</button>
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

    // ── Rollup tiles + customer concentration ─────────────────
    // Rollups at the top so planners don't have to eye-ball the matrix.
    let totalQtyAll = 0, totalRevenueAll = 0;
    const qtyByCust = {};
    custs.forEach(c => { qtyByCust[c.id] = 0; });
    for (const b of allBuys) {
      const q = parseFloat(b.qty) || 0;
      const sell = parseFloat(b.sellPrice) || 0;
      totalQtyAll += q;
      totalRevenueAll += q * sell;
      if (qtyByCust[b.customerId] !== undefined) qtyByCust[b.customerId] += q;
    }
    const blendedSell = totalQtyAll > 0 ? totalRevenueAll / totalQtyAll : 0;
    const concentrationRows = custs
      .map(c => ({ code: c.code, name: c.name, qty: qtyByCust[c.id] || 0 }))
      .filter(x => x.qty > 0)
      .sort((a, b) => b.qty - a.qty);
    const topShare = concentrationRows[0] && totalQtyAll > 0
      ? Math.round((concentrationRows[0].qty / totalQtyAll) * 100)
      : 0;
    const tile = (label, value, sub, color) => `
      <div class="kpi-card-wide" style="border-left:3px solid ${color}">
        <div class="kpi-wide-title">${label}</div>
        <div class="kpi-wide-big">${value}</div>
        ${sub ? `<div class="text-sm text-muted" style="margin-top:4px">${sub}</div>` : ''}
      </div>`;
    const headerTiles = custs.length > 0 ? `
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:16px">
        ${tile('Total actual QTY', totalQtyAll > 0 ? totalQtyAll.toLocaleString() : '—', `${concentrationRows.length} customer${concentrationRows.length !== 1 ? 's' : ''} buying`, '#6366f1')}
        ${tile('Blended avg sell', blendedSell > 0 ? `$${blendedSell.toFixed(2)}` : '—', 'Weighted across all customers', '#22c55e')}
        ${tile('Est. revenue', totalRevenueAll > 0 ? `$${totalRevenueAll.toLocaleString(undefined,{maximumFractionDigits:0})}` : '—', 'QTY × sell price', '#f59e0b')}
        ${tile('Top customer share', concentrationRows[0] ? `${topShare}%` : '—', concentrationRows[0] ? `${concentrationRows[0].code} · ${concentrationRows[0].qty.toLocaleString()} units` : 'No buys yet', topShare >= 70 ? '#ef4444' : topShare >= 50 ? '#f59e0b' : '#a855f7')}
      </div>` : '';

    // Concentration mini-bar — visual breakdown of who's buying.
    const concentrationBar = concentrationRows.length > 1 ? `
      <div class="card mb-3" style="padding:12px 16px">
        <div class="text-sm text-muted mb-2">Customer concentration</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${concentrationRows.map(c => {
            const pct = Math.round((c.qty / totalQtyAll) * 100);
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="min-width:120px;font-size:0.85rem"><strong>${c.code}</strong> <span class="text-muted">${c.name}</span></div>
              <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.06)">
                <div style="height:8px;border-radius:4px;background:#6366f1;width:${pct}%"></div>
              </div>
              <div class="text-sm" style="min-width:120px;text-align:right;color:#94a3b8">${c.qty.toLocaleString()} (${pct}%)</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    return `
    ${programTabBar(programId, 'buys', prog)}
    <div class="page-header" style="margin-top:12px">
      <div><h1 class="page-title">${[prog.season, prog.year, prog.name].filter(Boolean).join(' · ')} — Buy Summary</h1>
        <p class="page-subtitle">${[prog.gender, prog.retailer].filter(Boolean).join(' · ')}</p></div>
      <div style="display:flex;gap:8px">${assignBtn}${dlBtn}${upBtn}</div>
    </div>
    ${headerTiles}
    ${concentrationBar}
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
      <thead><tr><th>Code</th><th>Country</th><th>Addl Duty %</th><th>USA NY</th><th>USA LA</th><th>CA Toronto</th><th>CA Vancouver</th><th title="Sea transit days used by Delivery Plan to project in-whse from Production Cargo Ready (Sales)">Sea Lead (days)</th><th>Actions</th></tr></thead>
      <tbody>${rates.map(r => `<tr>
        <td class="primary font-bold">${r.code}</td><td>${r.country}</td>
        <td>${(r.addlDuty * 100).toFixed(1)}%</td>
        <td>$${Number(r.usaNY).toLocaleString()}</td><td>$${Number(r.usaLA).toLocaleString()}</td>
        <td>$${Number(r.caToronto).toLocaleString()}</td><td>$${Number(r.caVancouver).toLocaleString()}</td>
        <td class="text-center">${r.seaLeadDays != null ? r.seaLeadDays + 'd' : '—'}</td>
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

    // Handoffs that have a matching unlinked Sales Request (by season+year+brand) — ready to reconcile
    const norm = s => (s || '').trim().toLowerCase();
    const reconcilePairs = handoffs
      .filter(h => h.status !== 'cancelled' && !h.linkedProgramId && (h.stylesList||[]).length > 0)
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

    // Split handoffs into workflow buckets.
    // Helper: how many of a handoff's styles have been released across all batches
    const releasedStyleIds = h => new Set((h.batchReleases || []).flatMap(b => b.styleIds || []));
    const allStylesReleased = h => {
      const total = (h.stylesList || []).length;
      if (!total) return false;
      return releasedStyleIds(h).size >= total;
    };
    const activeHandoffs = handoffs.filter(h => h.status !== 'cancelled');
    const handoffBuckets = {
      inProgress: activeHandoffs.filter(h => !h.linkedProgramId && !h.submittedForCosting && !(h.batchReleases || []).length),
      batching:   activeHandoffs.filter(h => (h.batchReleases || []).length > 0 && !allStylesReleased(h)),
      released:   activeHandoffs.filter(h => allStylesReleased(h) && !h.submittedForCosting),
      complete:   activeHandoffs.filter(h => h.submittedForCosting || (h.linkedProgramId && allStylesReleased(h))),
      cancelled:  handoffs.filter(h => h.status === 'cancelled'),
    };

    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const dash = `<span class="text-muted">—</span>`;

    const buildRow = h => {
      const created = new Date(h.createdAt);
      const d = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      // Aging badge — only for handoffs not yet linked to a program
      // (linked ones are "done", aging doesn't matter).
      const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
      const hasBatches  = (h.batchReleases || []).length > 0;
      const totalStyles = (h.stylesList || []).length;
      const releasedCount = releasedStyleIds(h).size;
      const stillOpen = !h.linkedProgramId && !h.submittedForCosting && !hasBatches;
      const ageColor = ageDays <= 7 ? '#22c55e' : ageDays <= 14 ? '#f59e0b' : '#ef4444';
      const ageBg    = ageDays <= 7 ? 'rgba(34,197,94,0.12)' : ageDays <= 14 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
      const ageBadge = stillOpen
        ? `<span class="tag" style="font-size:0.68rem;background:${ageBg};color:${ageColor};font-weight:600;margin-left:6px" title="Days since handoff was created">⏱ ${ageDays}d</span>`
        : '';
      const cancelledDate = h.cancelledAt ? new Date(h.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
      const linkedBadge = h.status === 'cancelled'
        ? `<span class="badge badge-cancelled" style="background:rgba(100,116,139,0.2);color:#94a3b8">🚫 Cancelled${cancelledDate ? ' · ' + cancelledDate : ''}${h.previousProgramName ? '<br><span style="font-size:0.68rem;font-weight:400">Was: ' + h.previousProgramName + '</span>' : ''}</span>`
        : h.linkedProgramId
          ? `<span class="badge badge-placed" style="cursor:pointer" onclick="App.navigate('cost-summary','${h.linkedProgramId}')">→ Program</span>`
          : h.submittedForCosting
            ? `<span class="badge badge-costing">⏳ Submitted to Sales</span>`
            : hasBatches
              ? `<span class="badge badge-costing" style="cursor:pointer" onclick="App.navigate('handoff-detail','${h.id}')" title="${releasedCount}/${totalStyles} styles released">↗ ${releasedCount}/${totalStyles} released</span>`
              : `<button class="btn btn-secondary btn-sm" onclick="App.openConvertHandoffModal('${h.id}')">Convert →</button>`;
      const styleCount  = (h.stylesList||[]).length;
      const fabricCount = (h.fabricsList||[]).length;
      const batchPill   = hasBatches
        ? `<span class="tag" style="font-size:0.68rem;background:rgba(99,102,241,0.12);color:#6366f1;font-weight:600;margin-left:4px">${releasedCount}/${styleCount} released</span>`
        : '';
      const stylesBadge  = styleCount
        ? `<span class="status-dot dot-green"></span><span class="tag">${styleCount} styles</span>${batchPill}`
        : `<span class="status-dot dot-amber"></span><span class="tag tag-warn">No styles</span>`;
      const fabricsBadge = h.fabricsUploaded
        ? `<span class="status-dot dot-green"></span><span class="tag">${fabricCount} fabrics</span>`
        : `<span class="status-dot dot-amber"></span><button class="btn btn-ghost btn-xs" onclick="App.openAddFabricListModal('${h.id}')">+ Add Fabric List</button>`;

      // Stage derived from handoff workflow state
      const hStage = h.status === 'cancelled' ? 'cancelled'
        : h.linkedProgramId ? 'Complete'
        : h.submittedForCosting ? 'Complete'
        : hasBatches && allStylesReleased(h) ? 'Released'
        : hasBatches ? 'Batching'
        : 'In Progress';

      // Costs Due Date: from linked program's CRD if available
      const linkedProg  = h.linkedProgramId ? API.Programs.get(h.linkedProgramId) : null;
      const costsDueVal = linkedProg?.crdDate ? fmtDate(linkedProg.crdDate) : `<span class="text-muted">—</span>`;

      // Costed: show X/Y from linked program if available
      const costedVal = linkedProg
        ? `<span class="tag" style="font-size:0.75rem">${linkedProg.costedCount||0}/${linkedProg.styleCount||0}</span>`
        : dash;

      return `<tr
        data-flt-season="${(h.season || '').replace(/"/g, '&quot;')}"
        data-flt-year="${h.year || ''}"
        data-flt-brand="${(h.brand || '').replace(/"/g, '&quot;')}"
        data-flt-gender="${(h.gender || '').replace(/"/g, '&quot;')}"
        data-flt-tier="${(h.tier || '').replace(/"/g, '&quot;')}">
        <td>${h.season || dash}</td>
        <td class="text-sm">${h.year || dash}</td>
        <td class="text-sm">${h.gender || dash}</td>
        <td class="text-sm font-bold">${h.brand || dash}</td>
        <td class="text-sm">${h.tier || dash}</td>
        <td>${stageBadge(hStage)}</td>
        <td class="text-sm">${h.supplierRequestNumber ? `<span class="tag" style="font-family:monospace;font-size:0.78rem">${h.supplierRequestNumber}</span>` : dash}</td>
        <td>${dash}</td>
        <td><div style="display:flex;align-items:center;gap:6px">${stylesBadge}</div></td>
        <td style="text-align:center">${costedVal}</td>
        <td class="text-sm">${costsDueVal}</td>
        <td class="text-sm text-muted">${d}${ageBadge}</td>
        <td class="text-sm">${h.submittedByName || '—'}</td>
        <td><div style="display:flex;align-items:center;gap:6px">${fabricsBadge}</div></td>
        <td>${linkedBadge}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${h.status === 'cancelled'
              ? `<button class="btn btn-secondary btn-sm" onclick="App.reactivateHandoff('${h.id}')">↩ Reactivate</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="App.openEditHandoffModal('${h.id}')">✏ Edit</button>
                 <button class="btn btn-secondary btn-sm" onclick="App.openHandoffDetail('${h.id}')">👁 Open</button>
                 ${!h.linkedProgramId ? `<button class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="App.cancelHandoff('${h.id}')">🚫 Cancel</button>` : ''}`
            }
          </div>
        </td>
      </tr>`;
    };  // end buildRow

    const handoffThead = `<thead><tr>
      <th data-filter-col="season">Season</th>
      <th data-filter-col="year">Year</th>
      <th data-filter-col="gender">Gender</th>
      <th data-filter-col="brand">Brand</th>
      <th data-filter-col="tier">Tier</th>
      <th>Stage</th>
      <th>SR #</th><th>Ver.</th>
      <th>Styles</th>
      <th style="text-align:center">Costed</th>
      <th>Costs Due Date</th>
      <th>Date</th><th>Submitted By</th>
      <th>Fabrics</th><th>Program</th><th>Actions</th>
    </tr></thead>`;

    const bucketSection = (label, list, key, { open = true, accent = 'var(--accent)' } = {}) => {
      if (!list.length) return '';
      const body = `
        <div class="card" style="padding:0;margin-top:8px"><div class="table-wrap"><table id="handoffs-${key}-tbl" data-column-filter>
          ${handoffThead}
          <tbody>${list.map(buildRow).join('')}</tbody>
        </table></div></div>`;
      // <details> is native collapsible — no JS state to manage.
      return `
        <details ${open ? 'open' : ''} style="margin-top:16px">
          <summary style="cursor:pointer;padding:8px 0;font-weight:700;font-size:0.95rem;list-style:none;display:flex;align-items:center;gap:8px">
            <span style="color:${accent}">▸</span>
            <span>${label}</span>
            <span class="tag" style="font-size:0.72rem">${list.length}</span>
          </summary>
          ${body}
        </details>`;
    };

    const handoffSections = handoffs.length
      ? [
          bucketSection('🟢 In Progress',      handoffBuckets.inProgress, 'inProgress', { open: true,  accent: '#22c55e' }),
          bucketSection('📦 Batching',          handoffBuckets.batching,   'batching',   { open: true,  accent: '#6366f1' }),
          bucketSection('✅ All Styles Released', handoffBuckets.released,  'released',   { open: true,  accent: '#f59e0b' }),
          bucketSection('🏁 Complete',          handoffBuckets.complete,   'complete',   { open: false, accent: '#94a3b8' }),
          bucketSection('✕ Cancelled',          handoffBuckets.cancelled,  'cancelled',  { open: false, accent: '#94a3b8' }),
        ].join('')
      : `<div class="card text-center text-muted" style="padding:40px">No design handoffs yet. Click "+ New Handoff" to upload a style list from Design.</div>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">Design Handoffs</h1>
        <p class="page-subtitle">Design Handoff files submitted by Design — one Excel with Styles, Fabrics &amp; Trims tabs.</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="App.downloadHandoffTemplate()">⬇ Template</button>
        <button class="btn btn-primary" onclick="App.openNewHandoffModal()">＋ New Handoff</button>
      </div>
    </div>
    ${reconcilePanel}
    ${handoffSections}`;
  }

  // ── Sales Request ──────────────────────────────────────────
  function renderSalesRequests() {
    const _srUser    = typeof App !== 'undefined' && App._getState ? App._getState()?.user || {} : {};
    const _isPlanning = _srUser.role === 'planning' || _srUser.role === 'sales';
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

    // Batch-review SRs get their own prominent panel
    const batchReviewRequests = requests.filter(r => r.status === 'batch-review');

    // Bucket the requests for grouped display. Complete = linked to a
    // program OR status='converted'. Cancelled = explicit status flag.
    // batch-review handled separately above.
    const srBuckets = {
      inProgress: requests.filter(r => r.status !== 'cancelled' && r.status !== 'converted' && r.status !== 'batch-review' && !r.linkedProgramId),
      complete:   requests.filter(r => (r.linkedProgramId || r.status === 'converted') && r.status !== 'batch-review'),
      cancelled:  requests.filter(r => r.status === 'cancelled'),
    };

    const srFmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const srDash = `<span class="text-muted">—</span>`;
    const statusMap = { submitted: 'badge-costing', converted: 'badge-placed', draft: 'badge-pending', 'batch-review': 'badge-amber' };
    const buildRow = r => {
      const d = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const hasQtyPrice = (r.styles||[]).some(s => (s.projQty > 0) && (s.projSell > 0));
      const srCancelledDate = r.cancelledAt ? new Date(r.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
      const linkedBadge = r.status === 'cancelled'
        ? `<span class="badge badge-cancelled" style="background:rgba(100,116,139,0.2);color:#94a3b8">🚫 Cancelled${srCancelledDate ? ' · ' + srCancelledDate : ''}${r.previousProgramName ? '<br><span style="font-size:0.68rem;font-weight:400">Was: ' + r.previousProgramName + '</span>' : ''}</span>`
        : r.linkedProgramId
          ? `<span class="badge badge-placed" style="cursor:pointer" onclick="App.navigate('cost-summary','${r.linkedProgramId}')">→ Program</span>`
          : hasQtyPrice
            ? `<button class="btn btn-primary btn-sm" onclick="App.proposeProgramFromRequest('${r.id}')">🚀 Propose Program</button>`
            : `<span class="badge badge-pending" title="Add Proj Qty and Sell Price to all styles first">Needs Qty/Price</span>`;
      // Check if there's a matching unlinked handoff for reconciliation
      const matchingHandoff = !r.sourceHandoffId ? allHandoffs.find(h => h.season === r.season && h.year === r.year && !h.linkedProgramId) : null;
      const reconcileBadge = matchingHandoff
        ? `<button class="btn btn-ghost btn-xs ml-1" title="Reconcile with Design handoff" onclick="App.openReconcileModal('${r.id}','${matchingHandoff.id}')">⚡ Reconcile</button>`
        : '';

      // Stage: derive from SR status + linked program
      const srLinkedProg = r.linkedProgramId ? API.Programs.get(r.linkedProgramId) : null;
      const srStage = r.status === 'cancelled' ? 'cancelled'
        : srLinkedProg ? srLinkedProg.status
        : r.status === 'batch-review' ? 'Batch Review'
        : r.status === 'converted' ? 'Costing'
        : r.status === 'submitted' ? 'Sales Request'
        : 'Draft';

      // Costed: from linked program if available
      const srCosted = srLinkedProg
        ? `<span class="tag" style="font-size:0.75rem">${srLinkedProg.costedCount||0}/${srLinkedProg.styleCount||0}</span>`
        : srDash;

      return `<tr
        data-flt-season="${(r.season || '').replace(/"/g, '&quot;')}"
        data-flt-year="${r.year || ''}"
        data-flt-brand="${(r.brand || '').replace(/"/g, '&quot;')}"
        data-flt-tier="${(r.retailer || '').replace(/"/g, '&quot;')}"
        data-flt-gender="${(r.gender || '').replace(/"/g, '&quot;')}"
        data-flt-source="${r.sourceHandoffId ? 'Handoff' : 'Fresh'}"
        data-flt-status="${(r.status || 'submitted').replace(/"/g, '&quot;')}">
        <td>${r.season || srDash}</td>
        <td class="text-sm">${r.year || srDash}</td>
        <td class="text-sm">${r.gender || srDash}</td>
        <td><span class="badge">${r.brand || '—'}</span></td>
        <td class="text-sm">${r.retailer || srDash}</td>
        <td>${stageBadge(srStage)}</td>
        <td class="text-sm">${r.number ? `<span class="tag" style="font-family:monospace;font-size:0.78rem">${r.number}</span>` : srDash}</td>
        <td>${srDash}</td>
        <td><span class="tag">${(r.styles || []).length}</span></td>
        <td style="text-align:center">${srCosted}</td>
        <td style="text-align:center">${srLinkedProg ? `<span class="tag ${(srLinkedProg.placedCount||0)>0?'tag-success':''}">${srLinkedProg.placedCount||0}</span>` : srDash}</td>
        <td style="text-align:center">${srLinkedProg ? `<span class="tag">${(srLinkedProg.projQtyTotal||0)>0?(srLinkedProg.projQtyTotal).toLocaleString():'—'}</span>` : srDash}</td>
        <td style="text-align:center">${srLinkedProg ? `<span class="tag">${(srLinkedProg.actlQtyTotal||0)>0?(srLinkedProg.actlQtyTotal).toLocaleString():'—'}</span>` : srDash}</td>
        <td style="text-align:center">${srLinkedProg ? `<span class="tag">${srLinkedProg.tcCount||0}</span>` : srDash}</td>
        <td class="text-sm">${srFmtDate(r.costDueDate)}</td>
        <td class="text-sm">${srFmtDate(r.inWhseDate)}</td>
        <td class="text-sm text-muted">${d}</td>
        <td class="text-sm">${r.submittedByName || '—'}</td>
        <td>${r.sourceHandoffId ? '<span class="badge badge-costing" title="Built from Design Handoff">🎨 Handoff</span>' : `<span class="badge badge-pending">Fresh</span>${reconcileBadge}`}</td>
        <td><span class="badge ${statusMap[r.status] || 'badge-pending'}">${r.status || 'submitted'}</span></td>
        <td>${linkedBadge}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${r.status === 'cancelled'
              ? `<button class="btn btn-secondary btn-sm" onclick="App.reactivateSR('${r.id}')">↩ Reactivate</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="App.openSalesRequestDetail('${r.id}')">👁 Open</button>
                 <button class="btn btn-ghost btn-sm" onclick="App.downloadSalesRequest('${r.id}')" title="Download as Excel">⬇</button>
                 ${!r.linkedProgramId ? `<button class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="App.cancelSR('${r.id}')">🚫 Cancel</button>` : ''}`
            }
          </div>
        </td>
      </tr>`;
    };  // end buildRow

    const srThead = `<thead><tr>
      <th data-filter-col="season">Season</th>
      <th data-filter-col="year">Year</th>
      <th data-filter-col="gender">Gender</th>
      <th data-filter-col="brand">Brand</th>
      <th data-filter-col="tier">Tier / Retailer</th>
      <th>Stage</th>
      <th>SR #</th><th>Ver.</th>
      <th>Styles</th>
      <th style="text-align:center">Costed</th>
      <th style="text-align:center">Placed</th>
      <th style="text-align:center">TTL Proj Qty</th>
      <th style="text-align:center">TTL Actual Qty</th>
      <th style="text-align:center">TCs</th>
      <th>Costs Due Date</th>
      <th>In-Whse</th><th>Date</th><th>Submitted By</th>
      <th data-filter-col="source">Source</th>
      <th data-filter-col="status">Status</th>
      <th>Program</th><th>Actions</th>
    </tr></thead>`;

    const bucketSection = (label, list, key, { open = true, accent = 'var(--accent)' } = {}) => {
      if (!list.length) return '';
      const body = `
        <div class="card" style="padding:0;margin-top:8px"><div class="table-wrap"><table id="sr-${key}-tbl" data-column-filter>
          ${srThead}
          <tbody>${list.map(buildRow).join('')}</tbody>
        </table></div></div>`;
      return `
        <details ${open ? 'open' : ''} style="margin-top:16px">
          <summary style="cursor:pointer;padding:8px 0;font-weight:700;font-size:0.95rem;list-style:none;display:flex;align-items:center;gap:8px">
            <span style="color:${accent}">▸</span>
            <span>${label}</span>
            <span class="tag" style="font-size:0.72rem">${list.length}</span>
          </summary>
          ${body}
        </details>`;
    };

    // Consolidate batch-review SRs by linkedProgramId so Sales sees one row per program
    const _brGroups = {};   // programId → [sr, ...]
    const _brOrphan = [];   // SRs without a linkedProgramId (legacy fallback)
    batchReviewRequests.forEach(r => {
      if (r.linkedProgramId) {
        if (!_brGroups[r.linkedProgramId]) _brGroups[r.linkedProgramId] = [];
        _brGroups[r.linkedProgramId].push(r);
      } else {
        _brOrphan.push(r);
      }
    });
    const _brEntries = [
      ...Object.entries(_brGroups).map(([pid, srs]) => ({ pid, srs })),
      ..._brOrphan.map(r => ({ pid: null, srs: [r] })),
    ];

    const batchReviewPanel = _brEntries.length ? `
      <div class="card mb-4" style="border-color:#f59e0b;border-left:3px solid #f59e0b">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div class="font-bold" style="color:#f59e0b">📦 New Batch Releases — Confirm Quantities</div>
            <div class="text-sm text-muted mt-1">Design released new styles in batches. Review each batch and add Proj Qty &amp; Sell Price, then convert to add them to the program.</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${_brEntries.map(({ pid, srs }) => {
            const prog       = pid ? API.Programs.get(pid) : null;
            const latest     = srs.reduce((a, r) => new Date(r.createdAt) > new Date(a.createdAt) ? r : a, srs[0]);
            const d          = new Date(latest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const dateHint   = srs.length > 1 ? `${d} (${srs.length} batches)` : d;
            const title      = prog?.name || [latest.season, latest.year, latest.brand, latest.retailer].filter(Boolean).join(' · ');
            const totalStyles = srs.reduce((n, r) => n + (r.styles||[]).length, 0);
            const batchBadges = srs.map(r => {
              const lbl = (r.styles||[])[0]?.batchLabel || 'Batch';
              return `<span class="tag" style="background:rgba(245,158,11,0.12);color:#f59e0b">📦 ${lbl} · ${(r.styles||[]).length} styles</span>`;
            }).join('');
            const reviewBtn = (srs.length > 1 && pid)
              ? `<button class="btn btn-secondary btn-sm" onclick="App.openConsolidatedBatchReview('${pid}')">Review Quantities</button>`
              : `<button class="btn btn-secondary btn-sm" onclick="App.openSalesRequestDetail('${srs[0].id}')">Review Quantities</button>`;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div>
                <div class="font-bold">${title}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${batchBadges}</div>
                <div class="text-sm text-muted" style="margin-top:4px">${totalStyles} new styles · Released ${dateHint}</div>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0;margin-left:16px">
                ${reviewBtn}
                ${pid ? `<span class="badge badge-placed" style="cursor:pointer" onclick="App.navigate('cost-summary','${pid}')">→ Program</span>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const nonBatchRequests = requests.filter(r => r.status !== 'batch-review');
    const srSections = nonBatchRequests.length
      ? [
          bucketSection('🟢 In Progress', srBuckets.inProgress, 'inProgress', { open: true,  accent: '#22c55e' }),
          bucketSection('✅ Complete',    srBuckets.complete,   'complete',   { open: false, accent: '#6366f1' }),
          bucketSection('✕ Cancelled',    srBuckets.cancelled,  'cancelled',  { open: false, accent: '#94a3b8' }),
        ].join('')
      : (!batchReviewRequests.length ? `<div class="card text-center text-muted" style="padding:40px">No sales requests yet. Build one from a Design Handoff above${_isPlanning ? '.' : ', or click "+ New Request" to create manually.'}</div>` : '');

    return `
    <div class="page-header">
      <div><h1 class="page-title">Sales Costing Requests</h1>
        <p class="page-subtitle">Costing requests from Planning &amp; Sales — convert to a Program when ready</p></div>
      ${_isPlanning ? '' : `<button class="btn btn-primary" onclick="App.openNewSalesRequestModal()">＋ New Request</button>`}
    </div>
    ${batchReviewPanel}
    ${availablePanel}
    ${srSections}`;
  }

  // ── Handoff Detail — full-page batch release view ────────────────────────────
  function renderHandoffDetail(handoffId) {
    const h = API.DesignHandoffs.get(handoffId);
    if (!h) return `<div class="empty-state"><div class="icon">❌</div><h3>Handoff not found</h3><p><button class="btn btn-secondary" onclick="App.navigate('design-handoff')">← Back</button></p></div>`;

    const styles         = h.stylesList || [];
    const releases       = h.batchReleases || [];
    const releasedSet    = new Set(releases.flatMap(b => b.styleIds || []));
    const unreleasedStyles = styles.filter(s => !releasedSet.has(s.id));
    const releasedStyles   = styles.filter(s =>  releasedSet.has(s.id));
    const releasedCount  = releasedSet.size;
    const totalCount     = styles.length;
    const hasPending     = unreleasedStyles.length > 0;
    const hasReleased    = releasedStyles.length > 0;

    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    // Color palette indexed by batch label
    const batchColors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#0ea5e9','#a855f7'];
    const batchColorMap = {};
    releases.forEach((b, i) => { batchColorMap[b.batchLabel] = batchColors[i % batchColors.length]; });

    // Progress bar
    const pct = totalCount ? Math.round((releasedCount / totalCount) * 100) : 0;
    const progressBar = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <div style="flex:1;background:var(--border);border-radius:99px;height:8px;overflow:hidden">
          <div style="width:${pct}%;background:#6366f1;height:100%;border-radius:99px;transition:width 0.3s"></div>
        </div>
        <span class="text-sm font-bold" style="color:#6366f1;white-space:nowrap">${releasedCount} / ${totalCount} styles released</span>
      </div>`;

    // Batch history chips
    const historyChips = releases.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        ${releases.map((b, i) => {
          const c = batchColors[i % batchColors.length];
          return `<span class="tag" style="background:${c}20;color:${c};font-weight:600;border:1px solid ${c}40">
            ${b.batchLabel} <span class="text-muted" style="font-weight:400">· ${(b.styleIds||[]).length} styles · ${fmtDate(b.releasedAt)}</span>
          </span>`;
        }).join('')}
      </div>` : '';

    // ── PENDING BATCHES SECTION ────────────────────────────────
    let pendingSection = '';
    if (hasPending) {
      const suggestedLabel = `Batch ${releases.length + 1}`;
      const pendingRows = unreleasedStyles.map(s => `
        <tr class="hd-row-unreleased" data-style-id="${s.id}">
          <td style="width:32px;text-align:center;padding:8px"><span style="color:#94a3b8;font-size:1rem">○</span></td>
          <td class="primary font-bold" style="padding:8px 12px">${s.styleNumber || '—'}</td>
          <td style="padding:8px 12px">${s.styleName || '—'}</td>
          <td class="text-sm text-muted" style="padding:8px 12px">${s.fabrication || s.fabric || '—'}</td>
          <td style="padding:8px 12px">
            <input class="form-input hd-label-input" type="text"
              data-style-id="${s.id}"
              value="${(s.batchLabel || suggestedLabel).replace(/"/g,'&quot;')}"
              placeholder="${suggestedLabel}"
              style="width:110px;padding:4px 8px;font-size:0.82rem"
              oninput="App._hdUpdateReleaseCount('${h.id}')"
              onblur="App._hdSaveBatchLabel('${h.id}',this.dataset.styleId,this.value.trim()||'${suggestedLabel}')"
              onkeydown="if(event.key==='Enter')this.blur()">
          </td>
          <td class="text-sm text-muted" style="padding:8px 12px">
            <span class="tag" style="color:#f59e0b">Pending</span>
          </td>
        </tr>`).join('');

      pendingSection = `
      ${hasReleased ? `<div class="font-bold" style="font-size:0.95rem;margin:20px 0 10px">⏳ Pending Batches <span class="tag" style="margin-left:6px">${unreleasedStyles.length}</span></div>` : ''}
      <div style="margin-bottom:12px">
        <p class="text-sm text-muted" style="margin:0 0 8px">
          ① Assign batch labels to styles in the table below &nbsp;·&nbsp;
          ② Enter that label here to release matching styles
        </p>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label class="text-sm font-bold" for="hd-batch-label" style="white-space:nowrap">Release batch:</label>
          <input id="hd-batch-label" class="form-input" type="text" value="${suggestedLabel}"
            placeholder="e.g. Batch 2" style="width:140px;padding:6px 10px"
            oninput="App._hdUpdateReleaseCount('${h.id}')">
          <button class="btn btn-primary" id="hd-release-btn" onclick="App.releaseBatch('${h.id}')" disabled>
            Release Batch
          </button>
          <span id="hd-selected-count" class="text-sm text-muted"></span>
          <div style="flex:1"></div>
          <button class="btn btn-secondary btn-sm" onclick="App.downloadHandoffStylesSheet('${h.id}')" title="Download 3-tab handoff (Styles, Fabrics, Trims)">⬇ Download Handoff</button>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0" title="Upload updated handoff file — smart merge with existing data">
            ⬆ Update Handoff
            <input type="file" accept=".xlsx,.xls,.csv" style="display:none"
              onchange="App.importHandoffStyles('${h.id}', event)">
          </label>
        </div>
        <div id="hd-import-preview" style="margin-top:10px"></div>
      </div>
      <div class="card" style="padding:0;margin-bottom:16px">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:32px"></th>
              <th>Style #</th><th>Style Name</th><th>Fabrication</th>
              <th>Batch <span class="text-muted" style="font-weight:400;font-size:0.75rem">(assign label per style)</span></th>
              <th>Status</th>
            </tr></thead>
            <tbody id="hd-style-tbody">${pendingRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    // ── RELEASED STYLES SECTION ────────────────────────────────
    let releasedSection = '';
    if (hasReleased) {
      // Look up program styles for cancelled badge + 📌 button IDs
      const progStyles = h.linkedProgramId ? (API.Styles.byProgram(h.linkedProgramId) || []) : [];
      const progStyleByNum = {};
      progStyles.forEach(ps => { progStyleByNum[ps.styleNumber] = ps; });

      // Group released styles by fabric
      const fabGroups = {};
      const fabOrder  = [];
      releasedStyles.forEach(s => {
        const fab = (s.fabrication || s.fabric || '—').trim() || '—';
        if (!fabGroups[fab]) { fabGroups[fab] = []; fabOrder.push(fab); }
        fabGroups[fab].push(s);
      });
      const colCount = h.linkedProgramId ? 5 : 4;

      const releasedTableRows = fabOrder.map(fab => {
        const fabStyles = fabGroups[fab];
        const groupHdr = `<tr class="cs-group-row"><td colspan="${colCount}"><span style="font-weight:600">📁 ${fab}</span><span class="cs-group-count">${fabStyles.length} style${fabStyles.length !== 1 ? 's' : ''}</span></td></tr>`;
        const rows = fabStyles.map(s => {
          const batch = releases.find(b => (b.styleIds || []).includes(s.id));
          const batchColor = batch ? (batchColorMap[batch.batchLabel] || '#6366f1') : '#6366f1';
          const batchBadge = batch
            ? `<span class="tag" style="background:${batchColor}20;color:${batchColor};font-weight:700;font-size:0.7rem">${batch.batchLabel}</span>`
            : '—';
          const progStyle = progStyleByNum[s.styleNumber];
          const isCancelled = progStyle?.status === 'cancelled';
          const statusBadge = isCancelled
            ? `<span class="tag" style="background:rgba(239,68,68,0.12);color:#ef4444;margin-left:6px">Cancelled</span>`
            : `<span class="tag" style="color:#22c55e;margin-left:6px">Released</span>`;
          const logBtn = (h.linkedProgramId && progStyle?.id)
            ? `<button class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:2px 5px" title="Log design change" onclick="App.openDesignChangeModal('${progStyle.id}')">📌</button>`
            : '';
          return `<tr style="${isCancelled ? 'opacity:0.5' : ''}">
            <td class="primary font-bold" style="padding:8px 12px">${s.styleNumber || '—'}</td>
            <td style="padding:8px 12px">${s.styleName || '—'}</td>
            <td class="text-sm text-muted" style="padding:8px 12px">${s.fabrication || s.fabric || '—'}</td>
            <td style="padding:8px 12px">${batchBadge}${statusBadge}</td>
            ${h.linkedProgramId ? `<td style="padding:4px 8px">${logBtn}</td>` : ''}
          </tr>`;
        }).join('');
        return groupHdr + rows;
      }).join('');

      const progLink = h.linkedProgramId
        ? `<button class="btn btn-secondary btn-sm" onclick="App.navigate('cost-summary','${h.linkedProgramId}')">→ Open Program</button>`
        : `<span class="text-sm text-muted" style="font-style:italic">No linked program</span>`;

      releasedSection = `
      <div class="font-bold" style="font-size:0.95rem;margin:${hasPending ? '0' : '20px'} 0 10px">✅ Released Styles <span class="tag" style="margin-left:6px">${releasedStyles.length}</span></div>
      <div class="card" style="padding:0;margin-bottom:16px">
        <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
          <span class="text-sm text-muted">Grouped by fabrication · ${h.linkedProgramId ? 'Click 📌 to log a design change' : 'Legacy handoff — no program linked'}</span>
          ${progLink}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Style #</th><th>Style Name</th><th>Fabrication</th>
              <th>Batch · Status</th>
              ${h.linkedProgramId ? '<th></th>' : ''}
            </tr></thead>
            <tbody>${releasedTableRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    // Fabrics collapsible
    const fabricRows = (h.fabricsList || []).map(f =>
      `<tr><td class="font-bold" style="padding:8px 12px">${f.fabricCode||'—'}</td><td style="padding:8px 12px">${f.fabricName||'—'}</td><td class="text-sm" style="padding:8px 12px">${f.content||'—'}</td><td class="text-sm text-muted" style="padding:8px 12px">${f.supplier||'—'}</td></tr>`
    ).join('');

    return `
    <div id="hd-page">
      <!-- PAGE HEADER -->
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:14px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('design-handoff')">← Back</button>
          <div>
            <h1 class="page-title" style="margin:0">🎨 ${[h.season,h.year,h.brand,h.tier,h.gender].filter(Boolean).join(' · ')}</h1>
            <p class="page-subtitle" style="margin:4px 0 0">Design Handoff${h.supplierRequestNumber ? ` · SR# ${h.supplierRequestNumber}` : ''}</p>
          </div>
        </div>
        ${h.linkedProgramId
          ? `<button class="btn btn-secondary btn-sm" onclick="App.navigate('cost-summary','${h.linkedProgramId}')">→ View Program</button>`
          : ''}
      </div>

      <!-- PROGRESS + HISTORY -->
      ${totalCount > 0 ? `<div class="card mb-4">${progressBar}${historyChips}</div>` : ''}

      <!-- PENDING BATCHES (only when unreleased styles exist) -->
      ${pendingSection}

      <!-- RELEASED STYLES (only when released styles exist) -->
      ${releasedSection}

      <!-- FABRICS (collapsible) -->
      ${(h.fabricsList||[]).length ? `
      <details style="margin-top:8px">
        <summary style="cursor:pointer;padding:8px 0;font-weight:700;font-size:0.9rem;list-style:none;display:flex;align-items:center;gap:8px">
          <span style="color:var(--accent)">▸</span> Fabrics (${(h.fabricsList||[]).length})
        </summary>
        <div class="card" style="padding:0;margin-top:8px">
          <div class="table-wrap"><table>
            <thead><tr><th>Code</th><th>Name</th><th>Content</th><th>Supplier</th></tr></thead>
            <tbody>${fabricRows}</tbody>
          </table></div>
        </div>
      </details>` : ''}
    </div>

`;
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
    const isSales = role === 'planning' || role === 'sales';
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
      const created = new Date(r.createdAt);
      const dt   = created.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const programLabel = [prog?.season, prog?.year, prog?.brand].filter(Boolean).join(' · ') || r.programId;
      // Aging: only meaningful while still actionable (not released / rejected / dismissed).
      const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
      const stillOpen = ['pending', 'pending_sales', 'pending_production'].includes(r.status);
      const ageColor = ageDays <= 2 ? '#22c55e' : ageDays <= 5 ? '#f59e0b' : '#ef4444';
      const ageBg    = ageDays <= 2 ? 'rgba(34,197,94,0.12)' : ageDays <= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
      const ageChip  = stillOpen
        ? `<span class="tag" title="Days in current queue" style="font-size:0.7rem;background:${ageBg};color:${ageColor};font-weight:600">⏱ ${ageDays}d</span>`
        : '';

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
              ${ageChip}
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

    // ── Reason breakdown (why are TCs being asked to re-quote?) ──
    // Helps PC see whether change requests cluster on a few categories
    // (e.g. fabric changes, qty changes) that point at upstream data
    // quality issues. Counts every non-dismissed request.
    const reasonCounts = {};
    for (const r of all.filter(x => x.status !== 'dismissed')) {
      const cat = (r.category || 'Other').trim() || 'Other';
      reasonCounts[cat] = (reasonCounts[cat] || 0) + 1;
    }
    const reasonRows = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    const reasonTotal = reasonRows.reduce((s, [, v]) => s + v, 0);
    const reasonBreakdown = reasonRows.length ? `
      <div class="card mb-4" style="padding:14px 16px">
        <div class="font-bold mb-2">📊 Reason breakdown <span class="text-muted text-sm" style="font-weight:400">(${reasonTotal} request${reasonTotal !== 1 ? 's' : ''})</span></div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${reasonRows.map(([cat, n]) => {
            const pct = Math.round((n / reasonTotal) * 100);
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="min-width:140px;font-size:0.85rem">${cat}</div>
              <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.06)">
                <div style="height:8px;border-radius:4px;background:#6366f1;width:${pct}%"></div>
              </div>
              <div class="text-sm" style="min-width:80px;text-align:right;color:#94a3b8">${n} (${pct}%)</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">↩ Re-cost Queue</h1>
          <p class="page-subtitle">Track change requests through Sales approval → Production release → TC re-quoting</p>
        </div>
      </div>
      ${statsBar}
      ${reasonBreakdown}
      ${queueSection}
      ${allSection}`;
  }

  // Kept async for call-site compatibility; reads from API cache populated
  // by preload.fabricStandards().
  async function renderFabricStandards(role, tcId) {
    const isVendor = role === 'vendor';
    const isPD     = role === 'prod_dev';
    const isAdmin  = role === 'admin' || role === 'pc';
    const canAction = isPD || isAdmin;

    const allRequests = API.FabricRequests.all();
    const allPackages = API.FabricPackages.all();
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    const statusBadge = s => ({
      outstanding: '<span class="badge badge-pending">⏳ Requested</span>',
      packaged:    '<span class="badge badge-costing">📦 With Production</span>',
      draft:       '<span class="badge badge-pending">📝 Awaiting production</span>',
      sent:        '<span class="badge badge-costing">✈ Sent</span>',
      received:    '<span class="badge badge-placed">✅ Received</span>',
      cancelled:   '<span class="badge" style="background:rgba(100,116,139,0.2);color:#94a3b8">✕ Cancelled</span>',
    }[s] || `<span class="badge">${s}</span>`);

    if (isVendor) return renderVendorFabricStandards({ tcId, allRequests, allPackages, fmtDate, esc, statusBadge });
    return renderPDFabricStandards({ allRequests, allPackages, canAction, fmtDate, esc, statusBadge });
  }

  // ── Vendor side ────────────────────────────────────────────────
  // Catalog of fabrics pulled from design handoffs for every program
  // this vendor is assigned to. Check rows → enter qty inline → click
  // Request Selected. Below the catalog, a history table shows the
  // vendor's existing requests with tracking status.
  function renderVendorFabricStandards({ tcId, allRequests, allPackages, fmtDate, esc, statusBadge }) {
    const myReqs = allRequests.filter(r => r.tcId === tcId);
    const groups = API.AvailableFabrics.all();

    // KPIs
    const outstanding = myReqs.filter(r => r.status === 'outstanding').length;
    const packaged    = myReqs.filter(r => r.status === 'packaged').length;
    const sent        = myReqs.filter(r => r.status === 'sent').length;
    const received    = myReqs.filter(r => r.status === 'received').length;
    // Fulfillment rate = received / non-cancelled. Tells the vendor (and
    // PD via the same view) what % of the vendor's asks have actually
    // landed, separate from "in flight".
    const fulfillable = outstanding + packaged + sent + received;
    const fulfillPct  = fulfillable > 0 ? Math.round((received / fulfillable) * 100) : 0;

    const catalogHtml = !groups.length
      ? `<div class="empty-state" style="padding:40px"><div class="icon">🧵</div><h3>No fabrics available yet</h3><p class="text-muted">Fabrics appear here once Design submits a handoff linked to a program you're assigned to.</p></div>`
      : groups.map(g => {
          const rows = g.fabrics.map(f => {
            const already = f.existing;  // { id, status, requestedAt } or null
            const disabled = !!already && already.status !== 'cancelled';
            const badge = already ? ` ${statusBadge(already.status)}` : '';
            const stylesChip = (f.styleNumbers || []).length
              ? `<span class="tag" style="font-size:0.7rem;margin-left:6px" title="Styles using this fabric">${f.styleNumbers.length} style${f.styleNumbers.length!==1?'s':''}</span>`
              : '';
            return `<tr data-prog="${esc(g.programId)}" data-code="${esc(f.fabricCode)}" class="fabric-avail-row ${disabled ? 'fabric-avail-row-disabled' : ''}">
              <td style="text-align:center;padding:8px 12px">
                <input type="checkbox" class="fabric-pick"
                  data-prog="${esc(g.programId)}"
                  data-handoff="${esc(g.handoffId)}"
                  data-code="${esc(f.fabricCode)}"
                  data-name="${esc(f.fabricName)}"
                  data-content="${esc(f.content)}"
                  data-styles="${esc(JSON.stringify(f.styleNumbers || []))}"
                  onchange="App._fabricUpdateSelectedCount()"
                  ${disabled ? 'disabled' : ''}>
              </td>
              <td class="font-bold primary">${esc(f.fabricCode || '—')}${badge}</td>
              <td>${esc(f.fabricName || '—')}${stylesChip}</td>
              <td class="text-sm text-muted">${esc(f.content || '—')}</td>
              <td class="text-sm text-muted" style="white-space:nowrap">${esc(f.weight || '—')}</td>
              <td style="text-align:center">
                <input type="text" inputmode="numeric" class="form-input fabric-qty-input"
                  placeholder="Qty"
                  data-prog="${esc(g.programId)}" data-code="${esc(f.fabricCode)}"
                  style="width:70px;padding:4px 8px;font-size:0.85rem;text-align:center"
                  ${disabled ? 'disabled' : ''}>
              </td>
            </tr>`;
          }).join('');

          const meta = [g.season, g.year, g.retailer].filter(Boolean).join(' · ');
          return `
          <div class="card" style="padding:0;margin-bottom:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border)">
              <div>
                <div class="font-bold">${esc(g.programName)}</div>
                <div class="text-sm text-muted">${esc(meta || '—')} · ${g.fabrics.length} fabric${g.fabrics.length!==1?'s':''}</div>
              </div>
              <div>
                <button class="btn btn-ghost btn-sm" onclick="App._fabricToggleGroup('${esc(g.programId)}', true)">Select all</button>
                <button class="btn btn-ghost btn-sm" onclick="App._fabricToggleGroup('${esc(g.programId)}', false)">Clear</button>
              </div>
            </div>
            <div class="table-wrap"><table>
              <thead><tr>
                <th style="width:40px"></th>
                <th>Code</th><th>Name</th><th>Content</th><th>Weight</th><th style="text-align:center">Qty</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>`;
        }).join('');

    const historyRows = myReqs.length ? myReqs.slice().sort((a,b) => {
      const o = { outstanding:0, packaged:1, sent:2, received:3, cancelled:4 };
      return (o[a.status]??9) - (o[b.status]??9);
    }).map(r => {
      const pkg = r.packageId ? allPackages.find(p => p.id === r.packageId) : null;
      return `<tr>
        <td class="font-bold primary">${esc(r.fabricCode || '—')}</td>
        <td>${esc(r.fabricName || '—')}</td>
        <td class="text-center">${r.swatchQty ?? '—'}</td>
        <td class="text-sm text-muted">${fmtDate(r.requestedAt)}</td>
        <td>${pkg?.awbNumber ? `<span class="tag" style="font-family:monospace;font-size:0.75rem">${esc(pkg.awbNumber)}</span>` : '—'}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.status === 'outstanding' ? `<button class="btn btn-danger btn-sm" onclick="App.cancelFabricRequest('${r.id}')">Cancel</button>` : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="text-center text-muted" style="padding:24px">No requests yet.</td></tr>`;

    return `
    <div class="page-header">
      <div><h1 class="page-title">🧵 Fabric Standards</h1>
        <p class="page-subtitle">Pick the fabrics you'd like Product Development to send you a swatch of, then click Request Selected.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="text-sm text-muted" id="fabric-selected-count">0 selected</span>
        <button class="btn btn-primary" id="fabric-submit-btn" disabled onclick="App.submitFabricRequests('${tcId}')">📬 Request Selected</button>
      </div>
    </div>
    <div class="fabric-kpi-row">
      <div class="fabric-kpi fabric-kpi-pending"><span class="fabric-kpi-num">${outstanding}</span><span class="fabric-kpi-label">Requested</span></div>
      <div class="fabric-kpi fabric-kpi-sent"><span class="fabric-kpi-num">${packaged + sent}</span><span class="fabric-kpi-label">Packaged / Sent</span></div>
      <div class="fabric-kpi fabric-kpi-received"><span class="fabric-kpi-num">${received}</span><span class="fabric-kpi-label">Received</span></div>
      <div class="fabric-kpi fabric-kpi-received"><span class="fabric-kpi-num">${fulfillPct}%</span><span class="fabric-kpi-label">Fulfilled (${received}/${fulfillable})</span></div>
    </div>

    <h3 style="margin:20px 0 10px">Available fabrics</h3>
    ${catalogHtml}

    <h3 style="margin:24px 0 10px">Your requests</h3>
    <div class="card" style="padding:0">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Code</th><th>Name</th><th style="text-align:center">Qty</th>
          <th>Requested</th><th>Tracking</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${historyRows}</tbody>
      </table></div>
    </div>`;
  }

  // ── PD / Admin side ────────────────────────────────────────────
  // Three lanes: Outstanding (not yet in a package) → In Package (draft
  // packages still being built) → Sent/Received.
  function renderPDFabricStandards({ allRequests, allPackages, canAction, fmtDate, esc, statusBadge }) {
    const tcMap = {};
    (API.cache.tradingCompanies || []).forEach(t => { tcMap[t.id] = t; });
    const tcLabel = id => tcMap[id]?.code || id;

    // PD's per-fabric marking when handing off to Production.
    const pdStatusBadge = s => ({
      complete:     '<span class="badge badge-placed">✓ Complete</span>',
      none_on_hand: '<span class="badge badge-pending">○ None on hand</span>',
      incomplete:   '<span class="badge badge-flagged">! Incomplete</span>',
    }[s] || '<span class="text-muted text-sm">—</span>');

    const outstanding = allRequests.filter(r => r.status === 'outstanding');
    const packageRequests = id => allRequests.filter(r => r.packageId === id);
    const draftPkgs    = allPackages.filter(p => p.status === 'draft');
    const shippedPkgs  = allPackages.filter(p => p.status === 'sent' || p.status === 'received');

    // Group outstanding requests by TC
    const outstandingByTc = {};
    outstanding.forEach(r => { (outstandingByTc[r.tcId] ||= []).push(r); });

    const outstandingHtml = !Object.keys(outstandingByTc).length
      ? `<div class="empty-state" style="padding:24px"><div class="icon">📭</div><h3>No outstanding requests</h3></div>`
      : Object.entries(outstandingByTc).map(([tcId, reqs]) => `
        <div class="card" style="padding:0;margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-elevated);border-bottom:1px solid var(--border)">
            <div class="font-bold">🏭 ${esc(tcLabel(tcId))} <span class="text-muted text-sm">· ${reqs.length} request${reqs.length!==1?'s':''}</span></div>
            ${canAction ? `
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="App._fabricPdSelectTc('${esc(tcId)}', true)">Select all</button>
                <button class="btn btn-ghost btn-sm" onclick="App._fabricPdSelectTc('${esc(tcId)}', false)">Clear</button>
                <button class="btn btn-primary btn-sm" onclick="App.openCreateFabricPackage('${esc(tcId)}')">📦 Pass to Production</button>
              </div>` : ''}
          </div>
          <div class="table-wrap"><table id="fabric-outstanding-${esc(tcId)}-tbl" data-column-filter>
            <thead><tr>
              ${canAction ? '<th style="width:36px"></th>' : ''}
              <th data-filter-col="code">Code</th>
              <th data-filter-col="name">Name</th>
              <th data-filter-col="content">Content</th>
              <th style="text-align:center">Qty</th>
              <th data-filter-col="program">Program</th>
              <th>Requested</th><th></th>
            </tr></thead>
            <tbody>
              ${reqs.map(r => {
                const progName = (API.Programs.get(r.programId)?.name) || '';
                return `<tr
                  data-flt-code="${esc(r.fabricCode || '')}"
                  data-flt-name="${esc(r.fabricName || '')}"
                  data-flt-content="${esc(r.content || '')}"
                  data-flt-program="${esc(progName)}">
                  ${canAction ? `<td style="text-align:center"><input type="checkbox" class="fab-pd-chk" data-tc="${esc(tcId)}" value="${esc(r.id)}"></td>` : ''}
                  <td class="font-bold primary">${esc(r.fabricCode)}</td>
                  <td>${esc(r.fabricName || '—')}</td>
                  <td class="text-sm text-muted">${esc(r.content || '—')}</td>
                  <td class="text-center">${r.swatchQty ?? '—'}</td>
                  <td class="text-sm">${esc(progName || '—')}</td>
                  <td class="text-sm text-muted">${fmtDate(r.requestedAt)}</td>
                  <td>${canAction ? `<button class="btn btn-danger btn-sm" onclick="App.deleteFabricRequest('${esc(r.id)}')" title="Remove">🗑</button>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        </div>`).join('');

    const pkgCard = (pkg, shipped) => {
      const reqs = packageRequests(pkg.id);
      return `<div class="card" style="padding:0;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-elevated);border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
          <div>
            <div class="font-bold">📦 ${esc(tcLabel(pkg.tcId))} ${statusBadge(pkg.status)}</div>
            <div class="text-sm text-muted">${reqs.length} fabric${reqs.length!==1?'s':''} · ${pkg.awbNumber ? `AWB <span class="tag" style="font-family:monospace;font-size:0.72rem">${esc(pkg.awbNumber)}</span>` : 'no tracking yet'} · created ${fmtDate(pkg.createdAt)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${!shipped && canAction ? `
              <button class="btn btn-primary btn-sm" onclick="App.openShipFabricPackage('${esc(pkg.id)}')">✈ Mark sent</button>
              <button class="btn btn-danger btn-sm" onclick="App.deleteFabricPackage('${esc(pkg.id)}')" title="Delete package and return requests to outstanding">🗑 Delete</button>
            ` : ''}
            ${shipped && pkg.status === 'sent' && canAction ? `
              <button class="btn btn-success btn-sm" onclick="App.markFabricPackageReceived('${esc(pkg.id)}')">✅ Mark received</button>
            ` : ''}
          </div>
        </div>
        ${pkg.notes ? `<div class="text-sm text-muted" style="padding:8px 14px;border-bottom:1px solid var(--border)">📝 ${esc(pkg.notes)}</div>` : ''}
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Code</th><th>Name</th><th>Content</th>
            <th style="text-align:center" title="Vendor's original ask">Vendor asked</th>
            <th style="text-align:center" title="Qty PD is sending">Sending</th>
            <th>Program</th>
            <th>PD Status</th><th>PD Notes</th>
          </tr></thead>
          <tbody>
            ${reqs.length ? reqs.map(r => {
              const sendQty = r.pdQty != null ? r.pdQty : (r.swatchQty != null ? r.swatchQty : '—');
              const mismatch = r.pdQty != null && r.swatchQty != null && r.pdQty !== r.swatchQty;
              return `<tr>
                <td class="font-bold primary">${esc(r.fabricCode)}</td>
                <td>${esc(r.fabricName || '—')}</td>
                <td class="text-sm text-muted">${esc(r.content || '—')}</td>
                <td class="text-center text-sm text-muted">${r.swatchQty ?? '—'}</td>
                <td class="text-center font-bold ${mismatch ? 'text-warning' : ''}" title="${mismatch ? 'Differs from vendor request' : ''}">${sendQty}</td>
                <td class="text-sm">${esc((API.Programs.get(r.programId)?.name) || '—')}</td>
                <td>${pdStatusBadge(r.pdStatus)}</td>
                <td class="text-sm text-muted">${esc(r.pdNotes || '—')}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="8" class="text-center text-muted" style="padding:16px">No requests in this package.</td></tr>`}
          </tbody>
        </table></div>
      </div>`;
    };

    const draftHtml = draftPkgs.length
      ? draftPkgs.map(p => pkgCard(p, false)).join('')
      : `<div class="empty-state" style="padding:20px"><div class="text-muted">No draft packages.</div></div>`;
    const shippedHtml = shippedPkgs.length
      ? shippedPkgs.map(p => pkgCard(p, true)).join('')
      : `<div class="empty-state" style="padding:20px"><div class="text-muted">No packages sent yet.</div></div>`;

    // View toggle: queue (3-lane workflow) vs matrix (fabric × vendor pivot).
    const viewMode = localStorage.getItem('vcp_fabric_view') || 'queue';
    const tabBtn = (key, label) => `
      <button class="btn ${viewMode === key ? 'btn-primary' : 'btn-secondary'} btn-sm"
        onclick="App._fabricSetView('${key}')">${label}</button>`;
    const toolbar = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${tabBtn('queue', 'Queue')}
        ${tabBtn('matrix', 'Matrix')}
        ${canAction ? `<button class="btn btn-ghost btn-sm" onclick="App.sendFabricDigestNow()">📧 Send digest</button>` : ''}
      </div>`;

    const header = `
      <div class="page-header">
        <div><h1 class="page-title">🧵 Fabric Standards${viewMode === 'matrix' ? ' — Matrix' : ' — Queue'}</h1>
          <p class="page-subtitle">${viewMode === 'matrix'
            ? 'Cross-tab of fabrics and vendors so you can see totals at a glance.'
            : 'Review vendor requests, group them into shipment packages, and track delivery.'}</p>
        </div>
        ${toolbar}
      </div>
      <div class="fabric-kpi-row">
        <div class="fabric-kpi fabric-kpi-pending"><span class="fabric-kpi-num">${outstanding.length}</span><span class="fabric-kpi-label">Outstanding</span></div>
        <div class="fabric-kpi fabric-kpi-sent"><span class="fabric-kpi-num">${draftPkgs.length}</span><span class="fabric-kpi-label">Awaiting production</span></div>
        <div class="fabric-kpi fabric-kpi-received"><span class="fabric-kpi-num">${shippedPkgs.length}</span><span class="fabric-kpi-label">Sent / Received</span></div>
      </div>`;

    if (viewMode === 'matrix') {
      return header + renderFabricMatrix({ allRequests, esc, tcLabel, pdStatusBadge });
    }

    return `
    ${header}
    <h3 style="margin:20px 0 10px">1. Outstanding requests</h3>
    ${outstandingHtml}

    <h3 style="margin:20px 0 10px">2. Awaiting production (passed to production, not shipped yet)</h3>
    ${draftHtml}

    <h3 style="margin:20px 0 10px">3. Sent / received</h3>
    ${shippedHtml}`;
  }

  // ── Fabric × Vendor matrix view ─────────────────────────────────
  // Pivot of in-flight fabric standard requests so PD can see, per
  // fabric, how many swatches each vendor needs and the totals.
  function renderFabricMatrix({ allRequests, esc, tcLabel, pdStatusBadge }) {
    // Filters (status scope + qty source) persisted in localStorage.
    const scope    = localStorage.getItem('vcp_fabric_matrix_scope')  || 'open';   // open | outstanding | all
    const qtySource = localStorage.getItem('vcp_fabric_matrix_qty')   || 'send';    // ask (vendor's request) | send (PD's qty, falls back to ask)

    const inScope = r => {
      if (scope === 'outstanding') return r.status === 'outstanding';
      if (scope === 'all')         return r.status !== 'cancelled';
      return r.status !== 'received' && r.status !== 'cancelled'; // 'open' = active pipeline
    };
    const reqs = allRequests.filter(inScope);

    if (!reqs.length) {
      return `
        <div style="display:flex;gap:8px;margin:16px 0">${matrixToolbar(scope, qtySource)}</div>
        <div class="empty-state" style="padding:40px"><div class="icon">📭</div><h3>Nothing to show</h3>
          <p class="text-muted">No requests match the current filter.</p></div>`;
    }

    // Pick the qty source for a given request.
    const pickQty = r => {
      const ask  = r.swatchQty != null ? Number(r.swatchQty) : null;
      const send = r.pdQty     != null ? Number(r.pdQty)     : null;
      if (qtySource === 'ask')  return ask  != null ? ask  : 0;
      // 'send' falls back to ask when PD hasn't set pdQty
      return send != null ? send : (ask != null ? ask : 0);
    };

    // Build a key for each unique fabric. Code first (preserves SKU
    // identity), else content (Designed-by-composition fallback).
    const fabricKey  = r => (r.fabricCode || r.content || '—').trim();
    const fabricRow  = {};   // key -> { code, name, content, byTc: {tcId: qty}, total, statuses: Set }
    const tcSet      = new Set();
    for (const r of reqs) {
      const k = fabricKey(r);
      const row = fabricRow[k] ||= {
        code:     r.fabricCode || '—',
        name:     r.fabricName || '—',
        content:  r.content    || '—',
        byTc:     {},
        total:    0,
        statuses: new Set(),
      };
      const q = pickQty(r);
      row.byTc[r.tcId] = (row.byTc[r.tcId] || 0) + q;
      row.total += q;
      row.statuses.add(r.status);
      tcSet.add(r.tcId);
    }

    // Sort TCs alphabetically by code, fabrics by code.
    const tcIds = [...tcSet].sort((a, b) => tcLabel(a).localeCompare(tcLabel(b)));
    const fabricKeys = Object.keys(fabricRow).sort((a, b) => fabricRow[a].code.localeCompare(fabricRow[b].code));

    const tcTotals = {};
    let grandTotal = 0;
    for (const k of fabricKeys) {
      const row = fabricRow[k];
      for (const tcId of tcIds) {
        const v = row.byTc[tcId] || 0;
        tcTotals[tcId] = (tcTotals[tcId] || 0) + v;
        grandTotal += v;
      }
    }

    // Status colour for the total cell — outstanding shown warm, fully shipped cool.
    const rowStatusBadge = statuses => {
      if (statuses.has('outstanding')) return '<span class="badge badge-pending" style="font-size:0.65rem">open</span>';
      if (statuses.has('packaged'))    return '<span class="badge badge-costing" style="font-size:0.65rem">w/ Prod</span>';
      if (statuses.has('sent'))        return '<span class="badge badge-costing" style="font-size:0.65rem">sent</span>';
      return '';
    };

    const scopeLabel = { outstanding: 'Outstanding only', open: 'All open', all: 'All (incl. received)' }[scope] || scope;
    const qtyLabel   = { send: "PD's send qty", ask: "Vendor's request" }[qtySource] || qtySource;
    const printedAt  = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

    return `
      <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap;align-items:center">
        ${matrixToolbar(scope, qtySource)}
        <div style="margin-left:auto">
          <button class="btn btn-secondary btn-sm" onclick="App.printFabricMatrix()" title="Open the print dialog — choose 'Save as PDF' there">🖨 Print / Save as PDF</button>
        </div>
      </div>
      <div id="fabric-matrix-print-area" class="card" style="padding:0;overflow:hidden">
        <div class="print-only" style="display:none;padding:14px 16px;border-bottom:1px solid #ccc">
          <div style="font-size:1.1rem;font-weight:700">Fabric Standards Matrix</div>
          <div style="font-size:0.8rem;color:#555">${esc(scopeLabel)} · ${esc(qtyLabel)} · printed ${esc(printedAt)}</div>
        </div>
        <div class="table-wrap">
          <table style="min-width:100%">
            <thead>
              <tr>
                <th style="position:sticky;left:0;background:var(--bg-elevated);z-index:1">Fabric</th>
                <th class="text-sm text-muted" style="position:sticky;left:0;background:var(--bg-elevated);z-index:1"></th>
                ${tcIds.map(t => `<th class="text-center" style="white-space:nowrap">${esc(tcLabel(t))}</th>`).join('')}
                <th class="text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              ${fabricKeys.map(k => {
                const row = fabricRow[k];
                return `<tr>
                  <td class="font-bold primary" style="position:sticky;left:0;background:var(--bg-surface);white-space:nowrap">
                    ${esc(row.code)} ${rowStatusBadge(row.statuses)}
                  </td>
                  <td class="text-sm text-muted" style="max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(row.content)}">${esc(row.content)}</td>
                  ${tcIds.map(tcId => {
                    const v = row.byTc[tcId] || 0;
                    return `<td class="text-center ${v ? 'font-bold' : 'text-muted'}">${v || '—'}</td>`;
                  }).join('')}
                  <td class="text-center font-bold" style="background:rgba(99,102,241,0.05)">${row.total}</td>
                </tr>`;
              }).join('')}
              <tr style="background:var(--bg-elevated)">
                <td class="font-bold" style="position:sticky;left:0;background:var(--bg-elevated)">Total</td>
                <td style="position:sticky;left:0;background:var(--bg-elevated)"></td>
                ${tcIds.map(tcId => `<td class="text-center font-bold">${tcTotals[tcId] || 0}</td>`).join('')}
                <td class="text-center font-bold" style="background:rgba(99,102,241,0.1)">${grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="text-sm text-muted" style="margin-top:8px">
        ${fabricKeys.length} fabric${fabricKeys.length!==1?'s':''} · ${tcIds.length} vendor${tcIds.length!==1?'s':''} · grand total <strong>${grandTotal}</strong> swatches
      </div>`;
  }

  function matrixToolbar(scope, qtySource) {
    const scopeOpt = (val, label) => `<option value="${val}" ${scope === val ? 'selected' : ''}>${label}</option>`;
    const qtyOpt   = (val, label) => `<option value="${val}" ${qtySource === val ? 'selected' : ''}>${label}</option>`;
    return `
      <label class="cs-filter-label">Show</label>
      <select class="form-select cs-select" onchange="App._fabricMatrixSet('scope', this.value)">
        ${scopeOpt('outstanding', 'Outstanding only')}
        ${scopeOpt('open',        'All open (default)')}
        ${scopeOpt('all',         'All (incl. received)')}
      </select>
      <label class="cs-filter-label" style="margin-left:8px">Qty</label>
      <select class="form-select cs-select" onchange="App._fabricMatrixSet('qty', this.value)">
        ${qtyOpt('send', "PD's send qty")}
        ${qtyOpt('ask',  "Vendor's request")}
      </select>`;
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
    return `<div class="design-change-timeline">${changes.map(c => {
      const isPending = c.status === 'pending';
      return `
      <div class="dc-entry${isPending ? ' dc-entry-pending' : ''}">
        <div class="dc-dot${isPending ? ' dc-dot-pending' : ''}"></div>
        <div class="dc-body">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="dc-desc">${c.description || '—'}</span>
            ${isPending
              ? `<span class="badge badge-pending" style="font-size:0.65rem">Pending</span>
                 <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:0.72rem" onclick="App.confirmDesignChange('${c.id}','${styleId}')">✓ Confirm</button>`
              : `<span class="badge badge-placed" style="font-size:0.65rem">Confirmed</span>`}
          </div>
          ${c.field ? `<div class="dc-field text-sm text-muted">${c.field}${c.previousValue ? ': <span style="text-decoration:line-through;color:#ef4444">' + c.previousValue + '</span>' : ''} ${c.newValue ? '→ <strong>' + c.newValue + '</strong>' : ''}</div>` : ''}
          <div class="dc-meta text-sm text-muted">${fmtDate(c.changedAt)} · ${c.changedByName || c.changedBy || '—'}${!isPending && c.confirmedByName ? ` · ✓ ${c.confirmedByName}` : ''}</div>
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }

  function renderStyleTimeline(styleId) {
    const changes = API.DesignChanges.byStyle(styleId).slice().reverse();
    if (!changes.length) return `<div class="text-muted text-sm" style="padding:16px 0">No changes logged for this style yet.</div>`;
    const userRole  = (typeof App !== 'undefined' && App._getState) ? App._getState()?.user?.role : '';
    const isAdmin   = userRole === 'admin';
    const isPC      = userRole === 'pc';
    const isPlanning = userRole === 'planning' || userRole === 'sales';
    const fmtDate   = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `<div class="design-change-timeline">${changes.map(c => {
      const isPending = c.status === 'pending';
      const rcr = API.RecostRequests.getByDesignChange(c.id);
      const isFieldUpdate = !!c.field && !isPending; // auto-logged confirmed field update

      const rcrBadge = (() => {
        if (!rcr) return '';
        const map = {
          pending_sales:      `<span style="padding:1px 7px;border-radius:8px;font-size:0.65rem;font-weight:600;background:#f59e0b22;color:#d97706;border:1px solid #f59e0b55">Recost: Pending Sales</span>`,
          pending:            `<span style="padding:1px 7px;border-radius:8px;font-size:0.65rem;font-weight:600;background:#f59e0b22;color:#d97706;border:1px solid #f59e0b55">Recost: Pending Sales</span>`,
          pending_production: `<span style="padding:1px 7px;border-radius:8px;font-size:0.65rem;font-weight:600;background:#6366f122;color:#818cf8;border:1px solid #6366f155">Recost: Pending Production</span>`,
          released:           `<span style="padding:1px 7px;border-radius:8px;font-size:0.65rem;font-weight:600;background:#22c55e22;color:#16a34a;border:1px solid #22c55e55">Recost: Released ✓</span>`,
          rejected:           `<span style="padding:1px 7px;border-radius:8px;font-size:0.65rem;font-weight:600;background:#ef444422;color:#dc2626;border:1px solid #ef444455">Recost: Rejected</span>`,
        };
        return map[rcr.status] || '';
      })();

      const rcrActions = (() => {
        if (!rcr) return '';
        if ((rcr.status === 'pending_sales' || rcr.status === 'pending') && (isAdmin || isPC || isPlanning)) {
          return `<div style="display:flex;gap:4px;margin-top:6px">` +
            `<button class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:2px 10px" onclick="App.salesApproveRecost('${rcr.id}','${rcr.programId}')">✅ Approve</button>` +
            `<button class="btn btn-danger btn-sm" style="font-size:0.72rem;padding:2px 10px" onclick="App.rejectRecostRequest('${rcr.id}','${rcr.programId}','sales')">✕ Reject</button></div>`;
        }
        if (rcr.status === 'pending_production' && (isAdmin || isPC)) {
          return `<div style="display:flex;gap:4px;margin-top:6px">` +
            `<button class="btn btn-warning btn-sm" style="font-size:0.72rem;padding:2px 10px" onclick="App.releaseRecosting('${rcr.id}','${rcr.programId}')">🔄 Release to TC</button>` +
            `<button class="btn btn-danger btn-sm" style="font-size:0.72rem;padding:2px 10px" onclick="App.rejectRecostRequest('${rcr.id}','${rcr.programId}','production')">✕ Reject</button></div>`;
        }
        return '';
      })();

      return `
      <div class="dc-entry${isPending ? ' dc-entry-pending' : ''}">
        <div class="dc-dot${isPending ? ' dc-dot-pending' : isFieldUpdate ? '' : ''}"></div>
        <div class="dc-body">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${isFieldUpdate
              ? `<span class="dc-desc" style="color:var(--text-secondary)">Field updated</span>`
              : `<span class="dc-desc">${c.description || '—'}</span>`}
            ${isPending
              ? `<span class="badge badge-pending" style="font-size:0.65rem">Pending</span>
                 <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:0.72rem" onclick="App.confirmDesignChange('${c.id}','${styleId}')">✓ Confirm</button>`
              : (rcr ? '' : `<span class="badge badge-placed" style="font-size:0.65rem">Confirmed</span>`)}
            ${rcrBadge}
          </div>
          ${c.field ? `<div class="dc-field text-sm text-muted">${c.field}${c.previousValue ? ': <span style="text-decoration:line-through;color:#ef4444">' + c.previousValue + '</span>' : ''} ${c.newValue ? '→ <strong>' + c.newValue + '</strong>' : ''}</div>` : ''}
          ${!isFieldUpdate && c.description && c.field ? `<div class="dc-field text-sm text-muted" style="font-style:italic">${c.description}</div>` : ''}
          <div class="dc-meta text-sm text-muted">${fmtDate(c.changedAt)} · ${c.changedByName || c.changedBy || '—'}${!isPending && c.confirmedByName ? ` · ✓ ${c.confirmedByName}` : ''}</div>
          ${rcrActions}
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }

  function renderAllDesignChanges(filter) {
    const perms  = (typeof App !== 'undefined' && App.getPerms) ? App.getPerms() : {};
    const userRole = (typeof App !== 'undefined' && App._getState) ? App._getState()?.user?.role : '';
    const isAdmin = userRole === 'admin';
    const isPC    = userRole === 'pc';
    const isPlanning = userRole === 'planning' || userRole === 'sales';

    const all = API.DesignChanges.all().slice().reverse();
    const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    // Classify each change by recost status for tab counts
    const classify = c => {
      const rcr = API.RecostRequests.getByDesignChange(c.id);
      if (!rcr) return 'log-only';
      if (rcr.status === 'released') return 'recost-released';
      if (rcr.status === 'rejected') return 'recost-released'; // show in released tab (terminal)
      return 'recost-pending'; // pending_sales or pending_production
    };

    const pendingDCCount   = all.filter(c => c.status === 'pending').length;
    const recostPendCount  = all.filter(c => classify(c) === 'recost-pending').length;
    const recostRelCount   = all.filter(c => classify(c) === 'recost-released').length;
    const logOnlyCount     = all.filter(c => classify(c) === 'log-only').length;
    const activeFilter     = filter || 'all';

    // 30-day window for KPI tiles
    const now30 = Date.now(), ms30 = 30 * 24 * 60 * 60 * 1000;
    const inLast30 = c => (now30 - new Date(c.changedAt).getTime()) < ms30;
    const totalRecent    = all.filter(inLast30).length;
    const relRecent      = all.filter(c => classify(c) === 'recost-released' && inLast30(c)).length;
    const logOnlyRecent  = all.filter(c => classify(c) === 'log-only' && inLast30(c)).length;

    // Role-scoped pending count for KPI tile (matches sidebar badge logic)
    const pendingTileCount = (isAdmin || isPC)
      ? (API.RecostRequests?.pendingProduction?.() || []).length
      : isPlanning
      ? (API.RecostRequests?.pendingSales?.() || []).length
      : recostPendCount;

    const filtered = (() => {
      if (activeFilter === 'recost-pending')  return all.filter(c => classify(c) === 'recost-pending');
      if (activeFilter === 'recost-released') return all.filter(c => classify(c) === 'recost-released');
      if (activeFilter === 'log-only')        return all.filter(c => classify(c) === 'log-only');
      return all;
    })();

    const rcrStatusBadge = rcr => {
      if (!rcr) return `<span class="badge" style="background:#334155;color:#94a3b8;font-size:0.7rem">Log only</span>`;
      const map = {
        pending_sales:      { label: 'Recost: Pending Sales',      bg: '#f59e0b22', color: '#d97706', border: '#f59e0b55' },
        pending:            { label: 'Recost: Pending Sales',      bg: '#f59e0b22', color: '#d97706', border: '#f59e0b55' },
        pending_production: { label: 'Recost: Pending Production', bg: '#6366f122', color: '#818cf8', border: '#6366f155' },
        released:           { label: 'Recost: Released',           bg: '#22c55e22', color: '#16a34a', border: '#22c55e55' },
        rejected:           { label: 'Recost: Rejected',           bg: '#ef444422', color: '#dc2626', border: '#ef444455' },
      };
      const cfg = map[rcr.status] || { label: rcr.status, bg: '#33415522', color: '#94a3b8', border: '#33415555' };
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border}">${cfg.label}</span>`;
    };

    const rcrActions = (rcr, c) => {
      if (!rcr) return '';
      if (rcr.status === 'pending_sales' || rcr.status === 'pending') {
        if (isAdmin || isPC || isPlanning) {
          return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">` +
            `<button class="btn btn-primary btn-sm" onclick="App.salesApproveRecost('${rcr.id}','${rcr.programId}')">✅ Approve</button>` +
            `<button class="btn btn-danger btn-sm" onclick="App.rejectRecostRequest('${rcr.id}','${rcr.programId}','sales')">✕ Reject</button></div>`;
        }
      }
      if (rcr.status === 'pending_production') {
        if (isAdmin || isPC) {
          return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">` +
            `<button class="btn btn-warning btn-sm" onclick="App.releaseRecosting('${rcr.id}','${rcr.programId}')">🔄 Release to TC</button>` +
            `<button class="btn btn-danger btn-sm" onclick="App.rejectRecostRequest('${rcr.id}','${rcr.programId}','production')">✕ Reject</button></div>`;
        }
      }
      return '';
    };

    const rows = filtered.length ? filtered.map(c => {
      const style = API.Styles.get(c.styleId);
      const prog  = style ? API.Programs.get(style.programId) : null;
      const isPending = c.status === 'pending';
      const rcr   = API.RecostRequests.getByDesignChange(c.id);
      return `<tr
        data-flt-style="${esc(c.styleNumber || c.styleId || '')}"
        data-flt-program="${esc(prog?.name || '')}"
        data-flt-field="${esc(c.field || '')}"
        data-flt-by="${esc(c.changedByName || c.changedBy || '')}">
        <td class="text-sm text-muted">${fmtDate(c.changedAt)}</td>
        <td class="primary font-bold" style="cursor:pointer" onclick="App.navigate('styles','${style?.programId}')">${c.styleNumber || c.styleId}</td>
        <td class="text-sm">${prog?.name || '—'}</td>
        <td>${c.field ? `<span class="badge badge-costing">${c.field}</span>` : '—'}</td>
        <td>${c.description || '—'}</td>
        <td class="text-sm">${c.previousValue ? `<span style="color:#ef4444">${c.previousValue}</span>` : '—'}</td>
        <td class="text-sm">${c.newValue ? `<strong>${c.newValue}</strong>` : '—'}</td>
        <td class="text-sm text-muted">${c.changedByName || c.changedBy || '—'}</td>
        <td>${isPending
          ? `<button class="btn btn-secondary btn-sm" onclick="App.confirmDesignChange('${c.id}','${c.styleId}',true)">✓ Confirm</button>`
          : `<span class="text-muted text-sm">${c.confirmedByName || '—'}</span>`}
        </td>
        <td style="min-width:170px">${rcrStatusBadge(rcr)}${rcrActions(rcr, c)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" class="text-center text-muted" style="padding:40px">No entries for this filter.</td></tr>`;

    const kpiTile = (bucket, icon, label, count, color, sub) => {
      const isActive = activeFilter === bucket;
      const muted = count === 0;
      return `<div class="kpi-card" style="cursor:pointer${isActive ? `;border-color:${color};box-shadow:0 0 0 2px ${color}22` : ''}"
        onclick="App.renderDesignChangesTab('${bucket}')">
        <div class="kpi-icon" style="background:${color}22;color:${muted ? '#64748b' : color}">${icon}</div>
        <div class="kpi-body">
          <div class="kpi-value" style="${muted ? 'color:var(--text-muted)' : ''}">${count}</div>
          <div class="kpi-label">${label}</div>
          ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
        </div>
      </div>`;
    };

    const pendingColor = pendingTileCount > 0 ? '#ef4444' : '#64748b';
    const pendingSub   = (isAdmin || isPC) ? 'Awaiting your release' : isPlanning ? 'Awaiting your approval' : 'In progress';

    return `
    <div class="page-header">
      <div><h1 class="page-title">Design Changes</h1>
        <p class="page-subtitle">Design change log and re-cost requests across all programs</p></div>
    </div>
    <div class="kpi-grid" style="margin-bottom:20px">
      ${kpiTile('all',              '📌', 'Total Changes',     totalRecent,       '#6366f1', `${all.length} all-time · last 30 days shown`)}
      ${kpiTile('recost-pending',   '🔄', 'Pending Recosts',   pendingTileCount,  pendingColor, pendingSub)}
      ${kpiTile('recost-released',  '✅', 'Released Recosts',  relRecent,         '#22c55e', `${recostRelCount} all-time · last 30 days shown`)}
      ${kpiTile('log-only',         '📝', 'Log-Only Entries',  logOnlyRecent,     '#64748b', `${logOnlyCount} all-time · last 30 days shown`)}
    </div>
    <div class="card" style="padding:0"><div class="table-wrap"><table id="design-changes-tbl" data-column-filter>
      <thead><tr>
        <th>Date</th>
        <th data-filter-col="style">Style #</th>
        <th data-filter-col="program">Program</th>
        <th data-filter-col="field">Field</th>
        <th>Description</th><th>Previous</th><th>New Value</th>
        <th data-filter-col="by">Logged By</th>
        <th>DC Status</th>
        <th>Recost Status</th>
      </tr></thead>
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

    // Unreleased handoff styles — ghost rows for pipeline visibility (matches buildCostMatrix logic)
    const dcvLinkedHandoff = (API.DesignHandoffs?.all?.() || []).find(h => h.linkedProgramId === programId);
    const dcvUnreleasedByFab = {};
    if (dcvLinkedHandoff) {
      const releasedIds = new Set((dcvLinkedHandoff.batchReleases || []).flatMap(b => b.styleIds || []));
      (dcvLinkedHandoff.stylesList || []).forEach(hs => {
        if (!releasedIds.has(hs.id)) {
          const fab = (hs.fabrication || hs.fabric || '—').trim() || '—';
          if (!dcvUnreleasedByFab[fab]) dcvUnreleasedByFab[fab] = [];
          dcvUnreleasedByFab[fab].push(hs);
        }
      });
    }
    const dcvBatchReleases  = dcvLinkedHandoff?.batchReleases || [];
    const dcvBatchColors    = ['#6366f1','#22c55e','#f59e0b','#ef4444','#0ea5e9','#a855f7'];
    const dcvAllBatchLabels = [...new Set([
      ...styles.map(s => s.releasedBatch).filter(Boolean),
      ...(dcvLinkedHandoff?.stylesList || []).map(s => s.batchLabel).filter(Boolean),
    ])];
    const dcvHasManyBatches = dcvAllBatchLabels.length >= 2;
    const dcvBatchTileRow = dcvHasManyBatches ? (() => {
      const tiles = dcvAllBatchLabels.map((label, i) => {
        const rel      = dcvBatchReleases.find(r => r.batchLabel === label);
        const color    = dcvBatchColors[i % dcvBatchColors.length];
        const count    = styles.filter(s => s.releasedBatch === label).length;
        const dateStr  = rel ? new Date(rel.releasedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Pending';
        const isPending = !rel;
        const safeLabel = label.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return `<div class="kpi-card-wide" data-batch-tile="${safeLabel}"
          onclick="App._toggleBatchFilter('dcv-table',this.dataset.batchTile,this)"
          style="cursor:pointer;border-top:3px solid ${isPending?'#94a3b8':color};min-width:120px;user-select:none">
          <div class="kpi-value" style="font-size:1.1rem;color:${isPending?'#94a3b8':color}">${label}</div>
          <div class="kpi-label">${count} style${count!==1?'s':''} · ${dateStr}</div>
        </div>`;
      }).join('');
      return `<div class="kpi-grid" style="margin-bottom:16px">${tiles}</div>`;
    })() : '';

    function buildDcvGhostRows(handoffStyles) {
      return handoffStyles.map(hs => `<tr style="opacity:0.35;pointer-events:none" data-batch-label="${(hs.batchLabel||'').replace(/"/g,'&quot;')}">
        <td style="display:none"></td>
        <td data-col="styleNum" style="color:#94a3b8;font-style:italic">${hs.styleNumber || '—'}</td>
        <td colspan="12" style="color:#94a3b8;font-size:0.8rem;padding:6px 8px">
          <span style="font-style:italic">${hs.styleName || ''}</span>
          ${dcvHasManyBatches ? `<span class="tag" style="font-size:0.62rem;margin-left:6px;background:rgba(148,163,184,0.12);color:#94a3b8">⏳ ${hs.batchLabel || 'Batch 1'}</span>` : ''}
          <span style="font-size:0.7rem;opacity:0.7;margin-left:6px">Unreleased</span>
        </td>
      </tr>`).join('');
    }
    const dcvConsumedFabs = new Set();

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
        bodyRows += `<tr style="${rowBg}" data-batch-label="${(s.releasedBatch||'').replace(/"/g,'&quot;')}">
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

      // Ghost rows for unreleased handoff styles in this fabric group
      if (dcvUnreleasedByFab[fab]?.length) {
        bodyRows += buildDcvGhostRows(dcvUnreleasedByFab[fab]);
        dcvConsumedFabs.add(fab);
      }
    });

    // Fabric groups that exist only in the handoff (no released styles yet)
    Object.entries(dcvUnreleasedByFab).forEach(([fab, ghosts]) => {
      if (dcvConsumedFabs.has(fab)) return;
      bodyRows += `<tr class="cs-group-row"><td colspan="14">
        <span style="font-weight:600">📁 ${fab}</span>
        <span class="cs-group-count">${ghosts.length} style${ghosts.length !== 1 ? 's' : ''} — unreleased</span>
      </td></tr>`;
      bodyRows += buildDcvGhostRows(ghosts);
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
    ${dcvBatchTileRow}
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

  // ── Delivery Plan page ──────────────────────────────────────────
  // Per-program shared negotiation surface. Reads role-masked payload
  // from cache.deliveryPlans[programId]. Roles:
  //   admin/pc    → can edit every field
  //   planning    → edits Sales-version fields (in-whse, sales CRD,
  //                 sales waves, sales comments)
  //   vendor      → edits TC-version fields (factory CRD, vendor
  //                 waves, vendor comments) and only sees their
  //                 own TC's lines
  function renderDeliveryPlan(programId, role, user) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const prog = API.Programs.get(programId);
    if (!prog) return `<div class="empty-state"><div class="icon">⚠</div><h3>Program not found</h3></div>`;

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const fmtISO  = d => d ? String(d).slice(0, 10) : '';
    const addDays = (iso, n) => {
      if (!iso) return null;
      const d = new Date(iso + 'T00:00:00');
      d.setDate(d.getDate() + Number(n || 0));
      return d.toISOString().slice(0, 10);
    };

    const roleLabel = r => ({ admin:'Production', pc:'Production', planning:'Sales', sales:'Sales', vendor:'TC', design:'Design', tech_design:'Tech Design', prod_dev:'PD' }[r] || r);
    const isProd   = role === 'admin' || role === 'pc';
    const isSales  = role === 'planning' || role === 'sales';
    const isVendor = role === 'vendor';

    const payload = API.DeliveryPlans.get(programId);

    // Admin/Sales see the standard program tab bar. Vendors don't
    // have access to Cost Summary / Buy Summary pages, so they get a
    // simple "Back to my program" link instead.
    const tabBar = isVendor
      ? `<div style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" onclick="App.navigateVendorProgram('${esc(user?.tcId || '')}','${esc(programId)}')">← Back to ${esc(prog.name)}</button></div>`
      : programTabBar(programId, 'delivery', prog);

    // No plan yet — show initialize button (Production only) or an
    // empty-state message for other roles.
    if (!payload || !payload.plan) {
      const placements = API.Placements.byProgram ? (API.Placements.byProgram(programId) || []) : [];
      const placedCount = placements.length;
      return `
      ${tabBar}
      <div class="page-header" style="margin-top:12px">
        <div><h1 class="page-title">🚢 Delivery Plan — ${[prog.season, prog.year, prog.name].filter(Boolean).map(v => esc(String(v))).join(' · ')}</h1>
          <p class="page-subtitle">No plan yet. ${isProd
            ? `Initialize to pre-fill lines from the ${placedCount} placed ${placedCount === 1 ? 'style' : 'styles'} and customer buys.`
            : 'Production will initialize the plan once the program is confirmed.'}</p></div>
        ${isProd ? `<button class="btn btn-primary" onclick="App.initDeliveryPlan('${esc(programId)}')">＋ Initialize Delivery Plan</button>` : ''}
      </div>
      <div class="card" style="padding:40px;text-align:center">
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>${isProd && placedCount === 0 ? 'No styles placed yet' : 'Waiting for Production'}</h3>
          <p class="text-muted">${isProd && placedCount === 0 ? 'Place at least one style on the Cost Summary tab before initializing.' : ''}</p>
        </div>
      </div>`;
    }

    const { plan, lines } = payload;
    const styleMap = API.Styles?.byProgram ? Object.fromEntries(API.Styles.byProgram(programId).map(s => [s.id, s])) : {};
    const custMap  = Object.fromEntries((API.cache.customers || []).map(c => [c.id, c]));
    const tcMap    = Object.fromEntries((API.cache.tradingCompanies || []).map(t => [t.id, t]));
    const facMap   = Object.fromEntries((API.Factories?.all() || []).map(f => [f.id, f]));
    const cooMap   = Object.fromEntries((API.cache.cooRates || []).map(c => [c.code, c]));

    // Column visibility per role — server already masked the values,
    // but we hide entire columns for clarity too.
    const showSales  = isProd || isSales;
    const showTc     = isProd || isVendor;
    const showProdV  = isProd;            // Production's internal buffer

    // Editable? Role-based — mirrors server allow-lists.
    const canEditSales = isProd || isSales;
    const canEditTc    = isProd || isVendor;
    const canEditProd  = isProd;

    const dateInput = (lineId, field, value, editable) => editable
      ? `<input type="date" class="form-input" style="font-size:0.85rem;padding:4px 6px;width:135px" value="${esc(fmtISO(value))}" onchange="App.updateDeliveryLine('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${value ? fmtDate(value) : '<span class="text-muted">—</span>'}</span>`;

    const textInput = (lineId, field, value, editable) => editable
      ? `<input type="text" class="form-input" style="font-size:0.82rem;padding:4px 6px;width:100%" value="${esc(value || '')}" onblur="App.updateDeliveryLine('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${esc(value || '—')}</span>`;

    // Compact wave editor: comma-separated "YYYY-MM-DD:qty" pairs.
    // Keeps parity with the Brand Delivery Recap's 3-column weekly
    // split without locking to fixed buckets.
    const waveToStr = w => (w || []).map(x => `${(x.date || '').slice(0,10)}:${x.qty ?? ''}`).filter(Boolean).join(', ');
    const waveInput = (lineId, field, value, editable) => editable
      ? `<input type="text" class="form-input" style="font-size:0.78rem;padding:4px 6px;min-width:200px" placeholder="2026-05-01:200, 2026-05-15:300" value="${esc(waveToStr(value))}" onblur="App.updateDeliveryWaves('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${esc(waveToStr(value)) || '<span class="text-muted">—</span>'}</span>`;

    // Production Cargo Ready (Sales) + sea lead → projected in-whse.
    const computedInWhse = (line) => {
      if (!line.productionCargoReadySales) return null;
      const days = cooMap[line.coo]?.seaLeadDays;
      if (!days) return null;
      return addDays(fmtISO(line.productionCargoReadySales), days);
    };

    const rows = lines.map(line => {
      const style = styleMap[line.styleId];
      const cust  = line.customerId ? custMap[line.customerId] : null;
      const tc    = tcMap[line.tcId];
      const fac   = line.factoryId ? facMap[line.factoryId] : null;
      const proj  = computedInWhse(line);
      return `<tr>
        <td><span class="primary font-bold">${esc(style?.styleNumber || '—')}</span><div class="text-sm text-muted">${esc(style?.styleName || '')}</div></td>
        <td class="text-sm">${esc(cust?.code || cust?.name || '—')}</td>
        <td class="text-sm">${esc(tc?.code || '—')}</td>
        <td class="text-sm">${esc(fac?.factoryName || '—')}${line.coo ? ` <span class="tag" style="font-size:0.7rem">${esc(line.coo)}</span>` : ''}</td>
        <td class="text-center">${line.qty != null ? Number(line.qty).toLocaleString() : '—'}</td>
        ${showSales ? `<td>${dateInput(line.id, 'salesInWhseDate', line.salesInWhseDate, canEditSales)}</td>` : ''}
        ${showTc    ? `<td>${dateInput(line.id, 'factoryCargoReadyDate', line.factoryCargoReadyDate, canEditTc)}</td>` : ''}
        ${showProdV ? `<td>${dateInput(line.id, 'productionCargoReadyVendor', line.productionCargoReadyVendor, canEditProd)}</td>` : ''}
        ${showSales ? `<td>${dateInput(line.id, 'productionCargoReadySales', line.productionCargoReadySales, isProd)}</td>` : ''}
        ${showSales ? `<td class="text-sm text-accent">${proj ? fmtDate(proj) : '<span class="text-muted">—</span>'}${proj ? `<div class="text-sm text-muted" style="font-size:0.7rem">+${cooMap[line.coo]?.seaLeadDays}d</div>` : ''}</td>` : ''}
        ${showTc    ? `<td>${waveInput(line.id, 'vendorWaves', line.vendorWaves, canEditTc)}</td>` : ''}
        ${showSales ? `<td>${waveInput(line.id, 'salesWaves',  line.salesWaves,  canEditSales)}</td>` : ''}
        ${showTc    ? `<td style="min-width:150px">${textInput(line.id, 'vendorComments',     line.vendorComments,     canEditTc)}</td>` : ''}
        ${showProdV ? `<td style="min-width:150px">${textInput(line.id, 'productionComments', line.productionComments, canEditProd)}</td>` : ''}
        ${showSales ? `<td style="min-width:150px">${textInput(line.id, 'salesComments',      line.salesComments,      canEditSales)}</td>` : ''}
      </tr>`;
    }).join('');

    const headCells = [
      `<th>Style</th>`,
      `<th>Customer</th>`,
      `<th>TC</th>`,
      `<th>Factory / COO</th>`,
      `<th class="text-center">Qty</th>`,
      showSales  ? `<th>Sales In-Whse</th>`                          : '',
      showTc     ? `<th>Factory CRD</th>`                            : '',
      showProdV  ? `<th title="Production's internal buffer">Prod CRD (Vendor)</th>` : '',
      showSales  ? `<th>Prod CRD (Sales)</th>`                       : '',
      showSales  ? `<th title="Auto-computed from Prod CRD (Sales) + COO sea lead">Proj In-Whse</th>` : '',
      showTc     ? `<th title="Comma-separated YYYY-MM-DD:qty">Vendor waves</th>` : '',
      showSales  ? `<th>Sales waves</th>`                            : '',
      showTc     ? `<th>Vendor comments</th>`                        : '',
      showProdV  ? `<th>Prod comments</th>`                          : '',
      showSales  ? `<th>Sales comments</th>`                         : '',
    ].filter(Boolean).join('');

    // Shared discussion log (all roles can see + append).
    const history = plan.history || [];
    const historyHtml = history.length
      ? history.slice().reverse().map(h => `
          <div style="padding:8px 10px;border-left:3px solid ${h.role==='vendor'?'#f59e0b':h.role==='planning'?'#6366f1':'#22c55e'};margin-bottom:6px;background:var(--bg-elevated);border-radius:4px">
            <div class="text-sm" style="color:#94a3b8">
              <strong>${esc(h.authorName || '—')}</strong>
              <span class="tag" style="font-size:0.7rem;margin-left:4px">${esc(roleLabel(h.role))}</span>
              · ${new Date(h.at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
            </div>
            <div style="margin-top:2px;white-space:pre-wrap">${esc(h.text)}</div>
          </div>`).join('')
      : `<div class="text-sm text-muted" style="padding:10px">No comments yet. Add one below.</div>`;

    return `
    ${tabBar}
    <div class="page-header" style="margin-top:12px">
      <div>
        <h1 class="page-title">🚢 Delivery Plan — ${[prog.season, prog.year, prog.name].filter(Boolean).map(v => esc(String(v))).join(' · ')}</h1>
        <p class="page-subtitle">${lines.length} line${lines.length !== 1 ? 's' : ''} · role: ${esc(roleLabel(role))}${plan.updatedAt ? ` · updated ${fmtDate(plan.updatedAt)}` : ''}</p>
      </div>
      <div style="display:flex;gap:8px">
        ${role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="App.resetDeliveryPlan('${esc(programId)}')" title="Delete plan and lines">🗑 Reset</button>` : ''}
      </div>
    </div>

    ${lines.length === 0 ? `
      <div class="card" style="padding:24px;text-align:center">
        <div class="text-muted">No lines on this plan. ${isProd ? 'Place more styles on Cost Summary, then reset + re-initialize to refresh.' : ''}</div>
      </div>` : `
      <div class="card" style="padding:0;margin-bottom:16px">
        <div class="table-wrap">
          <table style="font-size:0.85rem">
            <thead><tr>${headCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`}

    <div class="card" style="padding:14px 16px">
      <div class="font-bold mb-2">💬 Discussion</div>
      <div style="max-height:320px;overflow-y:auto;margin-bottom:12px">
        ${historyHtml}
      </div>
      <div style="display:flex;gap:8px">
        <textarea id="dp-comment-${esc(plan.id)}" class="form-input" rows="2" placeholder="Add a comment visible to Production, Sales, and TC…" style="flex:1"></textarea>
        <button class="btn btn-primary" onclick="App.postDeliveryComment('${esc(programId)}','${esc(plan.id)}')">Post</button>
      </div>
    </div>`;
  }

  // ── Program Overview page ───────────────────────────────────────
  // Margin recap for placed styles, KPI roll-ups, vendor + factory
  // mix. Each program ships to exactly one market (USA or Canada),
  // so LDP is always computed against program.market — no toggle.
  function renderOverview(programId, role) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const prog = API.Programs.get(programId);
    if (!prog) return `<div class="empty-state"><div class="icon">⚠</div><h3>Program not found</h3></div>`;

    const market = prog.market || 'USA';
    const fmt$   = v => v == null || isNaN(v) ? '—' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmt$0  = v => v == null || isNaN(v) ? '—' : '$' + Math.round(Number(v)).toLocaleString();
    const fmtPct = v => v == null || isNaN(v) ? '—' : (Number(v) * 100).toFixed(1) + '%';
    const fmtQty = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString();

    const styles   = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const allSubs  = API.Submissions.all();
    const allBuys  = API.CustomerBuys.byProgram(programId);
    const tcMap    = Object.fromEntries((API.cache.tradingCompanies || []).map(t => [t.id, t]));
    const facMap   = Object.fromEntries((API.Factories?.all() || []).map(f => [f.id, f]));
    const custMap  = Object.fromEntries((API.cache.customers || []).map(c => [c.id, c]));

    // Per-style rollup: weighted sell from buys, LDP from winning FOB
    // + COO rate + market, and projected margin. Only considers placed
    // styles — the whole point of Overview is margin on actual awards.
    const rows = styles.map(s => {
      const pl = API.Placements.get(s.id);
      if (!pl) return null;
      const winSub = allSubs.find(x => x.styleId === s.id && x.tcId === pl.tcId && x.coo === pl.coo);
      const fob = parseFloat(pl.confirmedFob ?? winSub?.fob ?? 0) || 0;
      if (!fob) return null;

      // Weighted sell from Buy Summary (qty-weighted).
      const buys = allBuys.filter(b => b.styleId === s.id);
      const units = buys.reduce((a, b) => a + (parseFloat(b.qty) || 0), 0);
      const revenue = buys.reduce((a, b) => a + ((parseFloat(b.qty) || 0) * (parseFloat(b.sellPrice) || 0)), 0);
      const wtdSell = units > 0 ? revenue / units : null;

      // LDP against the selected market (not the program's market if user toggled).
      const ldpCalc = API.calcLDP(fob, s, pl.coo, market, null, winSub?.paymentTerms || 'FOB', winSub?.factoryCost);
      const ldp = ldpCalc ? ldpCalc.ldp : null;
      const cost = (ldp != null && units > 0) ? ldp * units : null;
      const marginPerUnit = (wtdSell != null && ldp != null) ? (wtdSell - ldp) : null;
      const marginPct     = (wtdSell != null && ldp != null && wtdSell > 0) ? (wtdSell - ldp) / wtdSell : null;
      const targetPct = prog.targetMargin || null;
      const hitTarget = (marginPct != null && targetPct != null) ? marginPct >= targetPct : null;

      return {
        style: s, placement: pl, tc: tcMap[pl.tcId], factory: pl.factoryId ? facMap[pl.factoryId] : null,
        coo: pl.coo, fob, units, revenue, wtdSell, ldp, cost,
        marginPerUnit, marginPct, targetPct, hitTarget,
      };
    }).filter(Boolean);

    // Program rollups — weighted by units (revenue) so a single huge
    // order can't swing with its own small styles.
    const totalUnits    = rows.reduce((a, r) => a + (r.units || 0), 0);
    const totalRevenue  = rows.reduce((a, r) => a + (r.revenue || 0), 0);
    const totalCost     = rows.reduce((a, r) => a + (r.cost || 0), 0);
    const grossProfit   = totalRevenue - totalCost;
    const wtdAvgMargin  = totalRevenue > 0 ? grossProfit / totalRevenue : null;
    const wtdAvgSell    = totalUnits > 0 ? totalRevenue / totalUnits : null;
    const wtdAvgLdp     = totalUnits > 0 ? totalCost / totalUnits : null;
    const wtdAvgFob     = totalUnits > 0
      ? rows.reduce((a, r) => a + (r.fob * r.units), 0) / totalUnits
      : null;
    const styleCount    = rows.length;
    const hitCount      = rows.filter(r => r.hitTarget === true).length;
    const missCount     = rows.filter(r => r.hitTarget === false).length;

    // Vendor & factory mix tables.
    const groupBy = (key) => {
      const map = {};
      rows.forEach(r => {
        const k = typeof key === 'function' ? key(r) : r[key];
        if (!k) return;
        if (!map[k]) map[k] = { key: k, label: k, styles: 0, units: 0, revenue: 0, cost: 0, fobSum: 0, fobUnits: 0 };
        const g = map[k];
        g.styles += 1;
        g.units += r.units || 0;
        g.revenue += r.revenue || 0;
        g.cost += r.cost || 0;
        g.fobSum += (r.fob * r.units);
        g.fobUnits += r.units || 0;
      });
      return Object.values(map).map(g => ({
        ...g,
        wtdFob:    g.fobUnits > 0 ? g.fobSum / g.fobUnits : null,
        wtdMargin: g.revenue > 0 ? (g.revenue - g.cost) / g.revenue : null,
      })).sort((a, b) => b.revenue - a.revenue);
    };
    const vendorMix  = groupBy(r => r.tc?.code || '—');
    const factoryMix = groupBy(r => r.factory?.factoryName || '—');

    const kpiTile = (label, value, sub, color) => `
      <div class="kpi-card-wide" style="border-left:3px solid ${color}">
        <div class="kpi-wide-title">${label}</div>
        <div class="kpi-wide-big">${value}</div>
        ${sub ? `<div class="text-sm text-muted" style="margin-top:4px">${sub}</div>` : ''}
      </div>`;

    const marketBadge = market === 'Canada'
      ? '<span class="tag" style="background:rgba(239,68,68,0.15);color:#ef4444">🇨🇦 Canada</span>'
      : '<span class="tag" style="background:rgba(59,130,246,0.15);color:#3b82f6">🇺🇸 USA</span>';

    // Empty state — program isn't placed yet.
    if (rows.length === 0) {
      return `
      ${programTabBar(programId, 'overview', prog)}
      <div class="page-header" style="margin-top:12px">
        <div>
          <h1 class="page-title">📈 Overview — ${[prog.season, prog.year, prog.name].filter(Boolean).map(v => esc(String(v))).join(' · ')}</h1>
          <p class="page-subtitle">${marketBadge} · Target margin ${prog.targetMargin ? fmtPct(prog.targetMargin) : '—'}</p>
        </div>
      </div>
      <div class="card" style="padding:40px;text-align:center">
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>No placed styles yet</h3>
          <p class="text-muted">Place styles with FOB prices on the Cost Summary tab. Overview shows margins once there's something to recap.</p>
          <button class="btn btn-primary" style="margin-top:12px" onclick="App.navigate('cost-summary','${esc(programId)}')">📊 Go to Cost Summary</button>
        </div>
      </div>`;
    }

    const rowTr = rows.map(r => {
      const targetCell = r.targetPct != null
        ? (r.hitTarget ? '<span class="tag" style="background:rgba(34,197,94,0.15);color:#22c55e">✓</span>'
                       : '<span class="tag" style="background:rgba(239,68,68,0.15);color:#ef4444">✕</span>')
        : '<span class="text-muted">—</span>';
      return `<tr>
        <td><span class="primary font-bold">${esc(r.style.styleNumber || '—')}</span><div class="text-sm text-muted">${esc(r.style.styleName || '')}</div></td>
        <td class="text-sm">${esc(r.tc?.code || '—')}</td>
        <td class="text-sm">${esc(r.factory?.factoryName || '—')}</td>
        <td class="text-sm">${esc(r.coo || '—')}</td>
        <td class="text-right">${fmtQty(r.units)}</td>
        <td class="text-right">${fmt$(r.fob)}</td>
        <td class="text-right">${fmt$(r.ldp)}</td>
        <td class="text-right">${fmt$(r.wtdSell)}</td>
        <td class="text-right">${fmt$(r.marginPerUnit)}</td>
        <td class="text-right font-bold" style="color:${r.marginPct == null ? 'inherit' : r.hitTarget ? '#22c55e' : r.marginPct < 0 ? '#ef4444' : '#f59e0b'}">${fmtPct(r.marginPct)}</td>
        <td class="text-center">${targetCell}</td>
        <td class="text-right">${fmt$0(r.revenue)}</td>
      </tr>`;
    }).join('');

    const mixTable = (title, data) => `
      <div class="card" style="padding:14px 16px">
        <div class="font-bold mb-2">${title}</div>
        <table style="width:100%;font-size:0.85rem">
          <thead><tr>
            <th style="text-align:left">Name</th>
            <th style="text-align:right">Styles</th>
            <th style="text-align:right">Units</th>
            <th style="text-align:right">Wtd FOB</th>
            <th style="text-align:right">Revenue</th>
            <th style="text-align:right">Wtd Margin</th>
          </tr></thead>
          <tbody>${data.map(g => `<tr>
            <td>${esc(g.label)}</td>
            <td class="text-right">${g.styles}</td>
            <td class="text-right">${fmtQty(g.units)}</td>
            <td class="text-right">${fmt$(g.wtdFob)}</td>
            <td class="text-right">${fmt$0(g.revenue)}</td>
            <td class="text-right font-bold">${fmtPct(g.wtdMargin)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;

    return `
    ${programTabBar(programId, 'overview', prog)}
    <div class="page-header" style="margin-top:12px">
      <div>
        <h1 class="page-title">📈 Overview — ${esc(prog.name)}</h1>
        <p class="page-subtitle">${marketBadge} · ${styleCount} placed ${styleCount === 1 ? 'style' : 'styles'} · Target margin ${prog.targetMargin ? fmtPct(prog.targetMargin) : '—'}</p>
      </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-bottom:16px">
      ${kpiTile('Placed styles',  `${styleCount}`, `${hitCount} hit target · ${missCount} miss`, '#22c55e')}
      ${kpiTile('Units sold',     fmtQty(totalUnits), `from Buy Summary`, '#6366f1')}
      ${kpiTile('Revenue',        fmt$0(totalRevenue), `sell × qty`, '#a855f7')}
      ${kpiTile('Cost (LDP)',     fmt$0(totalCost), `LDP × qty`, '#f97316')}
      ${kpiTile('Gross profit',   fmt$0(grossProfit), `revenue − cost`, '#0ea5e9')}
      ${kpiTile('Wtd avg margin', fmtPct(wtdAvgMargin), prog.targetMargin ? `vs ${fmtPct(prog.targetMargin)} target` : '', wtdAvgMargin != null && prog.targetMargin != null && wtdAvgMargin >= prog.targetMargin ? '#22c55e' : '#ef4444')}
      ${kpiTile('Wtd avg sell',   fmt$(wtdAvgSell),  `weighted by qty`, '#8b5cf6')}
      ${kpiTile('Wtd avg FOB',    fmt$(wtdAvgFob),   `winning vendor`, '#f59e0b')}
    </div>

    <div class="card" style="padding:0;margin-bottom:16px">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div class="font-bold">Margin recap — placed styles only</div>
        <div class="text-sm text-muted">Sell is qty-weighted from Buy Summary · LDP uses ${esc(market)} duty & freight</div>
      </div>
      <div class="table-wrap">
        <table style="font-size:0.85rem">
          <thead><tr>
            <th>Style</th>
            <th>TC</th>
            <th>Factory</th>
            <th>COO</th>
            <th class="text-right">Qty</th>
            <th class="text-right">FOB</th>
            <th class="text-right">LDP</th>
            <th class="text-right">Wtd Sell</th>
            <th class="text-right">$ / unit</th>
            <th class="text-right">Margin %</th>
            <th class="text-center">Target</th>
            <th class="text-right">Revenue</th>
          </tr></thead>
          <tbody>${rowTr}</tbody>
        </table>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px">
      ${mixTable('🏣 Vendor mix',  vendorMix)}
      ${mixTable('🏭 Factory mix', factoryMix)}
    </div>
    `;
  }

  // ── Capacity Plan page ──────────────────────────────────────────
  // TC fills production math per style×factory line; submits to
  // Production (admin/PC) for review. Admin/PC approve or reject.
  // Roles:
  //   admin/pc  → full edit + approve/reject/reset
  //   vendor    → edit own lines only; submit for review
  function renderCapacityPlan(programId, role, user) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const prog = API.Programs.get(programId);
    if (!prog) return `<div class="empty-state"><div class="icon">⚠</div><h3>Program not found</h3></div>`;

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const fmtISO  = d => d ? String(d).slice(0, 10) : '';
    const isProd   = role === 'admin' || role === 'pc';
    const isVendor = role === 'vendor';

    const payload = API.CapacityPlans.get(programId);

    const tabBar = isVendor
      ? `<div style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" onclick="App.navigateVendorProgram('${esc(user?.tcId || '')}','${esc(programId)}')">← Back to ${esc(prog.name)}</button></div>`
      : programTabBar(programId, 'capacity', prog);

    // No plan yet — Production can initialize.
    if (!payload || !payload.plan) {
      const placements = API.Placements.byProgram ? (API.Placements.byProgram(programId) || []) : [];
      const placedCount = placements.length;
      return `
      ${tabBar}
      <div class="page-header" style="margin-top:12px">
        <div><h1 class="page-title">🏭 Capacity Plan — ${[prog.season, prog.year, prog.name].filter(Boolean).map(v => esc(String(v))).join(' · ')}</h1>
          <p class="page-subtitle">No plan yet. ${isProd
            ? `Initialize to pre-fill lines from the ${placedCount} placed ${placedCount === 1 ? 'style' : 'styles'} (one line per style × factory).`
            : 'Production will initialize the plan once styles are placed.'}</p></div>
        ${isProd ? `<button class="btn btn-primary" onclick="App.initCapacityPlan('${esc(programId)}')">＋ Initialize Capacity Plan</button>` : ''}
      </div>
      <div class="card" style="padding:40px;text-align:center">
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>${isProd && placedCount === 0 ? 'No styles placed yet' : 'Waiting for Production'}</h3>
          <p class="text-muted">${isProd && placedCount === 0 ? 'Place at least one style on the Cost Summary tab before initializing.' : ''}</p>
        </div>
      </div>`;
    }

    const { plan, lines } = payload;
    const styleMap = API.Styles?.byProgram ? Object.fromEntries(API.Styles.byProgram(programId).map(s => [s.id, s])) : {};
    const tcMap    = Object.fromEntries((API.cache.tradingCompanies || []).map(t => [t.id, t]));
    const facMap   = Object.fromEntries((API.Factories?.all() || []).map(f => [f.id, f]));

    // Edit permission per line:
    //   admin/pc  → always
    //   vendor    → only their own TC's lines (server also enforces)
    const canEditLine = (line) => isProd || (isVendor && line.tcId === user?.tcId);

    const statusInfo = ({
      draft:     { label: '📝 Draft',      color: '#94a3b8', desc: 'Not yet submitted for review.' },
      submitted: { label: '📤 Submitted',  color: '#f59e0b', desc: 'Awaiting Production review.' },
      approved:  { label: '✓ Approved',    color: '#22c55e', desc: 'Approved by Production.' },
      rejected:  { label: '✕ Rejected',    color: '#ef4444', desc: 'Production rejected — see reason.' },
    }[plan.status] || { label: plan.status, color: '#94a3b8', desc: '' });

    const numInput = (lineId, field, value, editable, width = 70) => editable
      ? `<input type="number" class="form-input" style="font-size:0.82rem;padding:4px 6px;width:${width}px;text-align:right" value="${value == null ? '' : esc(String(value))}" onblur="App.updateCapacityLine('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${value == null ? '—' : Number(value).toLocaleString()}</span>`;

    const dateInput = (lineId, field, value, editable) => editable
      ? `<input type="date" class="form-input" style="font-size:0.82rem;padding:4px 6px;width:135px" value="${esc(fmtISO(value))}" onchange="App.updateCapacityLine('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${value ? fmtDate(value) : '<span class="text-muted">—</span>'}</span>`;

    const textInput = (lineId, field, value, editable) => editable
      ? `<input type="text" class="form-input" style="font-size:0.82rem;padding:4px 6px;width:100%" value="${esc(value || '')}" onblur="App.updateCapacityLine('${esc(programId)}','${esc(lineId)}','${field}', this.value)">`
      : `<span class="text-sm">${esc(value || '—')}</span>`;

    // Factory picker for vendors — only their own active factories.
    const factoryPicker = (line, editable) => {
      if (!editable) {
        const f = line.factoryId ? facMap[line.factoryId] : null;
        return `<span class="text-sm">${esc(f?.factoryName || '—')}</span>`;
      }
      const opts = (API.Factories?.all() || [])
        .filter(f => f.tcId === line.tcId && f.status === 'active')
        .map(f => `<option value="${esc(f.id)}" ${line.factoryId === f.id ? 'selected' : ''}>${esc(f.factoryName)}</option>`)
        .join('');
      return `<select class="form-select" style="font-size:0.82rem;padding:4px 6px;min-width:140px"
          onchange="App.updateCapacityLine('${esc(programId)}','${esc(line.id)}','factoryId', this.value)">
        <option value="">— select —</option>
        ${opts}
      </select>`;
    };

    const rows = lines.map(line => {
      const style = styleMap[line.styleId];
      const tc    = tcMap[line.tcId];
      const editable = canEditLine(line);
      return `<tr>
        <td><span class="primary font-bold">${esc(style?.styleNumber || '—')}</span><div class="text-sm text-muted">${esc(style?.styleName || '')}</div></td>
        <td class="text-sm">${esc(tc?.code || '—')}</td>
        <td>${factoryPicker(line, editable)}</td>
        <td class="text-right">${numInput(line.id, 'totalQty', line.totalQty, editable, 80)}</td>
        <td>${dateInput(line.id, 'deliveryVslEtd', line.deliveryVslEtd, editable)}</td>
        <td class="text-right">${numInput(line.id, 'factoryTotalLines', line.factoryTotalLines, editable, 60)}</td>
        <td class="text-right">${numInput(line.id, 'allocatedLines', line.allocatedLines, editable, 60)}</td>
        <td class="text-right">${numInput(line.id, 'operatorsPerLine', line.operatorsPerLine, editable, 60)}</td>
        <td class="text-right">${numInput(line.id, 'garmentsPerOperatorDaily', line.garmentsPerOperatorDaily, editable, 70)}</td>
        <td class="text-right">${numInput(line.id, 'plannedDailyOutputPerLine', line.plannedDailyOutputPerLine, editable, 70)}</td>
        <td class="text-right">${numInput(line.id, 'plannedTotalDailyOutput', line.plannedTotalDailyOutput, editable, 80)}</td>
        <td>${dateInput(line.id, 'plannedCuttingDate', line.plannedCuttingDate, editable)}</td>
        <td>${dateInput(line.id, 'plannedSewingDate', line.plannedSewingDate, editable)}</td>
        <td>${dateInput(line.id, 'plannedPackingDate', line.plannedPackingDate, editable)}</td>
        <td>${dateInput(line.id, 'plannedExFactoryDate', line.plannedExFactoryDate, editable)}</td>
        <td class="text-right">${numInput(line.id, 'sewingAvailableDays', line.sewingAvailableDays, editable, 60)}</td>
        <td class="text-right">${numInput(line.id, 'totalOutputSewing', line.totalOutputSewing, editable, 80)}</td>
        <td style="min-width:160px">${textInput(line.id, 'notes', line.notes, editable)}</td>
      </tr>`;
    }).join('');

    const headCells = `
      <th>Style</th>
      <th>TC</th>
      <th>Factory</th>
      <th class="text-right">Total Qty</th>
      <th>VSL ETD</th>
      <th class="text-right" title="Total production lines at factory">Lines Total</th>
      <th class="text-right" title="Lines allocated to this style">Lines Alloc</th>
      <th class="text-right">Ops/Line</th>
      <th class="text-right" title="Garments per operator per day">Gmts/Op/Day</th>
      <th class="text-right" title="Planned daily output per line">Daily/Line</th>
      <th class="text-right" title="Planned total daily output">Daily Total</th>
      <th>Cutting</th>
      <th>Sewing Start</th>
      <th>Packing</th>
      <th>Ex-Factory</th>
      <th class="text-right" title="Available sewing days">Sew Days</th>
      <th class="text-right" title="Total output from sewing">Out Sewing</th>
      <th>Notes</th>
    `;

    const hasVendorLines = isVendor && lines.some(l => l.tcId === user?.tcId);
    const vendorCanSubmit = isVendor && hasVendorLines && (plan.status === 'draft' || plan.status === 'rejected');

    // Action bar — role-specific
    let actions = '';
    if (isProd) {
      if (plan.status === 'submitted') {
        actions += `<button class="btn btn-success" onclick="App.approveCapacityPlan('${esc(programId)}','${esc(plan.id)}')">✓ Approve</button>`;
        actions += `<button class="btn btn-danger" onclick="App.rejectCapacityPlan('${esc(programId)}','${esc(plan.id)}')">✕ Reject</button>`;
      }
      if (role === 'admin') {
        actions += `<button class="btn btn-ghost btn-sm" onclick="App.resetCapacityPlan('${esc(programId)}')" title="Delete plan and lines">🗑 Reset</button>`;
      }
    } else if (vendorCanSubmit) {
      actions += `<button class="btn btn-primary" onclick="App.submitCapacityPlan('${esc(programId)}','${esc(plan.id)}')">📤 Submit for Review</button>`;
    }

    const subInfo = plan.submittedAt
      ? `<span class="text-sm text-muted">Submitted ${fmtDate(plan.submittedAt)} by ${esc(plan.submittedBy || '—')}</span>`
      : '';
    const revInfo = plan.reviewedAt
      ? `<span class="text-sm text-muted">Reviewed ${fmtDate(plan.reviewedAt)} by ${esc(plan.reviewedBy || '—')}</span>`
      : '';

    const rejectionBanner = plan.status === 'rejected' && plan.rejectionReason
      ? `<div class="alert alert-danger" style="margin-bottom:12px">✕ <strong>Rejected:</strong> ${esc(plan.rejectionReason)}</div>`
      : '';

    return `
    ${tabBar}
    <div class="page-header" style="margin-top:12px">
      <div>
        <h1 class="page-title">🏭 Capacity Plan — ${[prog.season, prog.year, prog.name].filter(Boolean).map(v => esc(String(v))).join(' · ')}</h1>
        <p class="page-subtitle">
          <span class="badge" style="background:${statusInfo.color}22;color:${statusInfo.color};font-weight:600">${statusInfo.label}</span>
          · ${lines.length} line${lines.length !== 1 ? 's' : ''}
          ${subInfo ? ` · ${subInfo}` : ''}
          ${revInfo ? ` · ${revInfo}` : ''}
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>
    </div>

    ${rejectionBanner}

    ${lines.length === 0 ? `
      <div class="card" style="padding:24px;text-align:center">
        <div class="text-muted">No lines on this plan. ${isProd ? 'Place more styles on Cost Summary, then reset + re-initialize to refresh.' : ''}</div>
      </div>` : `
      <div class="card" style="padding:0">
        <div class="table-wrap" style="overflow-x:auto">
          <table style="font-size:0.82rem;min-width:2000px">
            <thead><tr>${headCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`}
    `;
  }

  // ── Performance page (cross-program rollups) ───────────────────
  // Admin/PC only. Two tabs: Vendors vs Factories. Season multi-
  // select filter sticky in localStorage. Drill-down: click a row
  // to expand per-program breakdown in an overlay card.
  function renderPerformance(tab) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const activeTab = (tab === 'factories') ? 'factories' : 'vendors';
    const rows = API.Performance.rows || [];
    const seasons = API.Performance.seasons || [];
    const tcMap  = Object.fromEntries((API.cache.tradingCompanies || []).map(t => [t.id, t]));
    const facMap = Object.fromEntries((API.Factories?.all() || []).map(f => [f.id, f]));
    const cooMap = Object.fromEntries((API.cache.cooRates || []).map(c => [c.code, c]));

    const fmt$   = v => v == null || isNaN(v) ? '—' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmt$0  = v => v == null || isNaN(v) ? '—' : '$' + Math.round(Number(v)).toLocaleString();
    const fmtPct = v => v == null || isNaN(v) ? '—' : (Number(v) * 100).toFixed(1) + '%';
    const fmtQty = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString();
    const dayDiff = (a, b) => {
      if (!a || !b) return null;
      const da = new Date(String(a).slice(0, 10) + 'T00:00:00');
      const db = new Date(String(b).slice(0, 10) + 'T00:00:00');
      return Math.round((da - db) / 86400000);
    };
    const addDays = (iso, n) => {
      if (!iso) return null;
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      d.setDate(d.getDate() + Number(n || 0));
      return d.toISOString().slice(0, 10);
    };

    // ── Season filter (multi-select checkboxes) ─────────────────
    // Default to the newest season/year if nothing has been checked.
    const savedRaw = localStorage.getItem('vcp_perf_seasons') || '';
    const defaultKey = seasons.length
      ? `${seasons[0].season}|${seasons[0].year}`
      : '';
    const selected = savedRaw
      ? new Set(savedRaw.split(',').filter(Boolean))
      : new Set(defaultKey ? [defaultKey] : []);

    const filterRows = rows.filter(r => {
      if (!selected.size) return true;
      return selected.has(`${r.season}|${r.year}`);
    });

    // ── Per-row derived metrics ─────────────────────────────────
    // For each placed style: compute LDP + margin + two delivery
    // lateness measures. fob/paymentTerms/factoryCost come from the
    // winning submission; duty/freight meta come from the style.
    const derive = (r) => {
      const fob = Number(r.fob) || 0;
      const styleLike = {
        dutyRate:         r.dutyRate,
        estFreight:       r.estFreight,
        specialPackaging: r.specialPackaging,
      };
      const ldpCalc = fob > 0 ? API.calcLDP(fob, styleLike, r.coo, r.market || 'USA', null, r.paymentTerms || 'FOB', r.factoryCost) : null;
      const ldp   = ldpCalc ? ldpCalc.ldp : null;
      const units = Number(r.units) || 0;
      const revenue = Number(r.revenue) || 0;
      const wtdSell = units > 0 ? revenue / units : null;
      const cost    = (ldp != null && units > 0) ? ldp * units : null;
      const marginPct = (wtdSell != null && ldp != null && wtdSell > 0) ? (wtdSell - ldp) / wtdSell : null;
      const target    = r.targetMargin || null;
      const hitTarget = (marginPct != null && target != null) ? marginPct >= target : null;

      // Delivery: TC's factory CRD + sea lead → projected in-whse.
      // Late vs Sales In-Whse: projected > sales_in_whse.
      // Late vs Prod CRD (Sales): vendor CRD > sales CRD.
      const seaDays = cooMap[r.coo]?.seaLeadDays ?? null;
      const projInWhse = (r.factoryCargoReadyDate && seaDays != null)
        ? addDays(r.factoryCargoReadyDate, seaDays) : null;
      const daysLateInWhse = dayDiff(projInWhse, r.salesInWhseDate);
      const lateInWhse = (daysLateInWhse != null) ? daysLateInWhse > 0 : null;
      const daysLateProdCrd = dayDiff(r.productionCargoReadyVendor, r.productionCargoReadySales);
      const lateProdCrd = (daysLateProdCrd != null) ? daysLateProdCrd > 0 : null;

      return {
        ...r, units, revenue, fob, ldp, wtdSell, cost, marginPct, hitTarget,
        daysLateInWhse, lateInWhse, daysLateProdCrd, lateProdCrd,
      };
    };
    const derived = filterRows.map(derive);

    // ── Aggregation by TC or Factory ────────────────────────────
    const groupKey = activeTab === 'factories' ? (r => r.factoryId) : (r => r.tcId);
    const groupLabel = activeTab === 'factories'
      ? (r => facMap[r.factoryId]?.factoryName || (r.factoryId ? '(unknown factory)' : '(no factory)'))
      : (r => tcMap[r.tcId]?.code || '(unknown)');
    const groupName = activeTab === 'factories'
      ? (r => facMap[r.factoryId]?.factoryName || '')
      : (r => tcMap[r.tcId]?.name || '');

    const groups = {};
    for (const r of derived) {
      const k = groupKey(r) || '__none__';
      if (!groups[k]) groups[k] = {
        id: k, label: groupLabel(r), name: groupName(r),
        programs: new Set(),
        placedCount: 0, units: 0, revenue: 0, cost: 0, fobUnits: 0,
        hitCount: 0, missCount: 0,
        lateInWhseCount: 0, daysLateInWhseSum: 0, inWhseSamples: 0,
        lateProdCrdCount: 0, daysLateProdCrdSum: 0, prodCrdSamples: 0,
        capacitySubmitted: 0, capacityApproved: 0, capacityRejected: 0,
        capacityPrograms: new Set(),
        rows: [],
      };
      const g = groups[k];
      g.programs.add(r.programId);
      g.placedCount += 1;
      g.units += r.units || 0;
      g.revenue += r.revenue || 0;
      if (r.cost != null) g.cost += r.cost;
      g.fobUnits += r.fob * (r.units || 0);
      if (r.hitTarget === true) g.hitCount += 1;
      if (r.hitTarget === false) g.missCount += 1;
      if (r.daysLateInWhse != null) { g.inWhseSamples += 1; g.daysLateInWhseSum += r.daysLateInWhse; if (r.lateInWhse) g.lateInWhseCount += 1; }
      if (r.daysLateProdCrd != null) { g.prodCrdSamples += 1; g.daysLateProdCrdSum += r.daysLateProdCrd; if (r.lateProdCrd) g.lateProdCrdCount += 1; }
      // Capacity: count once per program per group (not once per style)
      if (r.capacityStatus && !g.capacityPrograms.has(r.programId)) {
        g.capacityPrograms.add(r.programId);
        if (r.capacityStatus === 'submitted') g.capacitySubmitted += 1;
        if (r.capacityStatus === 'approved')  g.capacityApproved  += 1;
        if (r.capacityStatus === 'rejected')  g.capacityRejected  += 1;
      }
      g.rows.push(r);
    }

    const groupList = Object.values(groups).map(g => ({
      ...g,
      programsCount: g.programs.size,
      wtdFob:        g.units > 0 ? g.fobUnits / g.units : null,
      wtdMargin:     g.revenue > 0 ? (g.revenue - g.cost) / g.revenue : null,
      avgDaysLateInWhse: g.inWhseSamples > 0 ? g.daysLateInWhseSum / g.inWhseSamples : null,
      avgDaysLateProdCrd: g.prodCrdSamples > 0 ? g.daysLateProdCrdSum / g.prodCrdSamples : null,
    })).sort((a, b) => b.revenue - a.revenue);

    // ── Season filter HTML ──────────────────────────────────────
    const seasonFilterHtml = seasons.length
      ? seasons.map(s => {
          const key = `${s.season}|${s.year}`;
          const checked = selected.has(key) ? 'checked' : '';
          return `<label class="col-toggle-item" style="display:inline-flex;gap:6px;margin:0 10px 6px 0;white-space:nowrap">
            <input type="checkbox" value="${esc(key)}" ${checked} onchange="App.togglePerfSeason(this)">
            <span>${esc(s.season)} ${esc(s.year)}</span>
          </label>`;
        }).join('')
      : '<span class="text-muted text-sm">No seasons yet</span>';

    // ── Tab header ──────────────────────────────────────────────
    const tabBtn = (key, label, icon) => `
      <button class="btn ${activeTab === key ? 'btn-primary' : 'btn-secondary'} btn-sm"
        onclick="App.navigate('performance','${key}')">${icon} ${label}</button>`;

    // ── Main row rendering ──────────────────────────────────────
    const tableHtml = groupList.length ? `
      <div class="card" style="padding:0;margin-bottom:16px">
        <div class="table-wrap">
          <table style="font-size:0.82rem" data-column-filter="1">
            <thead><tr>
              <th>${activeTab === 'factories' ? 'Factory' : 'Vendor'}</th>
              <th class="text-right">Programs</th>
              <th class="text-right">Placed</th>
              <th class="text-right">Units</th>
              <th class="text-right">Wtd FOB</th>
              <th class="text-right">Revenue</th>
              <th class="text-right">Wtd Margin</th>
              <th class="text-center" title="Programs where wtd margin ≥ target">Hit / Miss</th>
              <th class="text-center" title="Lines where projected in-whse (Factory CRD + sea lead) > Sales In-Whse date">Late vs Sales In-Whse</th>
              <th class="text-center" title="Lines where vendor Prod CRD > sales Prod CRD">Late vs Prod CRD</th>
              <th class="text-center" title="Capacity plans: submitted / approved / rejected">Capacity</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${groupList.map(g => `
                <tr style="cursor:pointer" onclick="App.openPerformanceDrill('${esc(activeTab)}','${esc(g.id)}')">
                  <td>
                    <div class="font-bold">${esc(g.label)}</div>
                    ${g.name && g.name !== g.label ? `<div class="text-sm text-muted">${esc(g.name)}</div>` : ''}
                  </td>
                  <td class="text-right">${g.programsCount}</td>
                  <td class="text-right">${g.placedCount}</td>
                  <td class="text-right">${fmtQty(g.units)}</td>
                  <td class="text-right">${fmt$(g.wtdFob)}</td>
                  <td class="text-right">${fmt$0(g.revenue)}</td>
                  <td class="text-right font-bold" style="color:${g.wtdMargin == null ? 'inherit' : g.wtdMargin < 0 ? '#ef4444' : g.wtdMargin < 0.2 ? '#f59e0b' : '#22c55e'}">${fmtPct(g.wtdMargin)}</td>
                  <td class="text-center">
                    <span style="color:#22c55e">${g.hitCount}</span> / <span style="color:#ef4444">${g.missCount}</span>
                  </td>
                  <td class="text-center">
                    ${g.inWhseSamples === 0
                      ? '<span class="text-muted">—</span>'
                      : `<div><strong style="color:${g.lateInWhseCount > 0 ? '#ef4444' : '#22c55e'}">${g.lateInWhseCount}</strong> / ${g.inWhseSamples}</div>
                         <div class="text-sm text-muted">${g.avgDaysLateInWhse != null ? (g.avgDaysLateInWhse >= 0 ? '+' : '') + g.avgDaysLateInWhse.toFixed(1) + 'd avg' : ''}</div>`}
                  </td>
                  <td class="text-center">
                    ${g.prodCrdSamples === 0
                      ? '<span class="text-muted">—</span>'
                      : `<div><strong style="color:${g.lateProdCrdCount > 0 ? '#ef4444' : '#22c55e'}">${g.lateProdCrdCount}</strong> / ${g.prodCrdSamples}</div>
                         <div class="text-sm text-muted">${g.avgDaysLateProdCrd != null ? (g.avgDaysLateProdCrd >= 0 ? '+' : '') + g.avgDaysLateProdCrd.toFixed(1) + 'd avg' : ''}</div>`}
                  </td>
                  <td class="text-center text-sm">
                    ${g.capacityApproved}/${g.capacitySubmitted + g.capacityApproved}/${g.capacityRejected}
                  </td>
                  <td class="text-right text-sm text-muted">▸</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
      : `<div class="empty-state" style="padding:40px">
          <div class="icon">📊</div>
          <h3>No data matches the current filter</h3>
          <p class="text-muted">Try checking more seasons above, or place styles on a program first.</p>
        </div>`;

    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">📊 Performance</h1>
        <p class="page-subtitle">Cross-program rollup · ${activeTab === 'factories' ? 'grouped by factory' : 'grouped by vendor'} · ${filterRows.length} placed ${filterRows.length === 1 ? 'style' : 'styles'}</p>
      </div>
      <div style="display:flex;gap:6px">
        ${tabBtn('vendors',   'Vendors',   '🏣')}
        ${tabBtn('factories', 'Factories', '🏭')}
      </div>
    </div>

    <div class="card" style="padding:12px 16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="font-bold text-sm">Seasons:</span>
        ${seasonFilterHtml}
        <button class="btn btn-ghost btn-sm" onclick="App.clearPerfSeasons()" title="Show all seasons">Clear</button>
      </div>
    </div>

    ${tableHtml}
    `;
  }

  // ── Factories page ───────────────────────────────────────────────
  // One render, driven by the caller's role. Admin/PC get the full
  // tabbed queue with review actions. Other internal roles see a
  // read-only directory of active factories.
  function renderFactories(role) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const canReview = role === 'admin' || role === 'pc';

    const all = API.Factories.all();
    const tcMap = {};
    (API.cache.tradingCompanies || []).forEach(t => { tcMap[t.id] = t; });
    const tcLabel = id => {
      const t = tcMap[id];
      return t ? `${t.code} — ${t.name}` : id;
    };

    const statusBadge = s => ({
      pending:  '<span class="badge badge-pending">⏳ Pending</span>',
      active:   '<span class="badge badge-placed">✓ Active</span>',
      inactive: '<span class="badge" style="background:rgba(148,163,184,0.2);color:#94a3b8">⦸ Inactive</span>',
      rejected: '<span class="badge badge-flagged">✕ Rejected</span>',
    }[s] || `<span class="badge">${s}</span>`);

    const yesNo = b => b
      ? '<span class="tag" style="background:rgba(34,197,94,0.12);color:#22c55e">Related</span>'
      : '<span class="tag" style="background:rgba(148,163,184,0.1);color:#94a3b8">Unrelated</span>';

    const shipLabel = {
      tc: 'Trading Company', factory: 'Factory', exporter: 'Export Company', payto: 'Pay-to Company',
    };

    // Compose a multi-line address from the 5 parts. Falls back to a
    // single muted em-dash if every part is empty.
    const fmtAddress = (street, city, state, country, zip) => {
      const lines = [];
      if (street) lines.push(esc(street));
      const cityLine = [city, state, zip].filter(Boolean).join(', ');
      if (cityLine) lines.push(esc(cityLine));
      if (country) lines.push(esc(country));
      return lines.length
        ? lines.join('<br>')
        : '<span class="text-muted">—</span>';
    };

    const profileCard = (f) => `
      <div class="card" style="padding:14px 16px;margin-bottom:12px;border-left:3px solid ${
        f.status === 'active' ? '#22c55e'
        : f.status === 'pending' ? '#f59e0b'
        : f.status === 'rejected' ? '#ef4444' : '#94a3b8'}">

        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span class="font-bold" style="font-size:1.05rem">${esc(f.factoryName)}</span>
              ${f.firstSaleApproved ? '<span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;font-weight:600">🌟 First Sale</span>' : ''}
            </div>
            <div class="text-sm text-muted">${esc(tcLabel(f.tcId))} · submitted ${fmtDate(f.submittedAt)} by ${esc(f.submittedBy || '—')}</div>
            <div style="margin-top:8px">${statusBadge(f.status)}</div>
            ${f.rejectionReason ? `<div class="text-sm" style="color:#ef4444;margin-top:6px">✕ ${esc(f.rejectionReason)}</div>` : ''}
          </div>
          ${canReview ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
            ${f.status === 'pending' ? `
              <button class="btn btn-success btn-sm" onclick="App.approveFactory('${esc(f.id)}')">✓ Approve</button>
              <button class="btn btn-danger btn-sm"  onclick="App.rejectFactory('${esc(f.id)}')">✕ Reject</button>
            ` : ''}
            ${f.status === 'active' ? `
              <button class="btn btn-secondary btn-sm" onclick="App.openFactoryTermsModal('${esc(f.id)}')" title="Set HighLife terms">📝 HL Terms</button>
              <button class="btn btn-secondary btn-sm" onclick="App.toggleFactoryFirstSale('${esc(f.id)}', ${!f.firstSaleApproved})" title="${f.firstSaleApproved ? 'Revoke First Sale approval' : 'Approve for First Sale transactions'}">${f.firstSaleApproved ? '🌟 Revoke First Sale' : '🌟 Approve First Sale'}</button>
              <button class="btn btn-warning btn-sm"   onclick="App.deactivateFactory('${esc(f.id)}')">⦸ Deactivate</button>
            ` : ''}
            ${f.status === 'inactive' ? `
              <button class="btn btn-success btn-sm" onclick="App.reactivateFactory('${esc(f.id)}')">✓ Reactivate</button>
            ` : ''}
            ${f.status === 'rejected' ? `
              <button class="btn btn-secondary btn-sm" onclick="App.reviewFactoryAgain('${esc(f.id)}')">Re-open</button>
            ` : ''}
            <button class="btn btn-danger btn-sm" onclick="App.deleteFactory('${esc(f.id)}')" title="Delete">🗑</button>
          </div>` : ''}
        </div>

        <!-- Logistics strip -->
        <div style="display:flex;gap:16px;margin-top:12px;padding:8px 12px;background:var(--bg-elevated);border-radius:var(--radius-sm);flex-wrap:wrap">
          <div class="text-sm"><span class="text-muted">🚢 Shipping by:</span> <strong>${shipLabel[f.shippingResponsible] || '—'}</strong></div>
          <div class="text-sm"><span class="text-muted">🛳 Port:</span> <strong>${esc(f.portOfShipping || '—')}</strong></div>
          ${f.firstSaleApproved ? `<div class="text-sm" style="color:#818cf8"><span class="text-muted">🌟 First Sale:</span> <strong>${esc(f.firstSaleApprovedBy || 'approved')} · ${fmtDate(f.firstSaleApprovedAt)}</strong></div>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px">
          ${entityBlock('🏭 Factory', f.factoryName, f.factorySapName,
            fmtAddress(f.factoryAddress, f.factoryCity, f.factoryState, f.factoryCountry, f.factoryZip),
            false,
            [
              ['TC SAP name',  esc(f.tcSapName || '—')],
              ['Related to TC', yesNo(f.factoryRelatedToTc)],
              ['TC terms', esc(f.factoryTerms || '—')],
              ['HighLife terms', esc(f.factoryTermsHl || '—')],
            ])}
          ${entityBlock('📦 Export Company', f.exporterName, f.exporterSapName,
            fmtAddress(f.exporterAddress, f.exporterCity, f.exporterState, f.exporterCountry, f.exporterZip),
            !f.hasExporter,
            [
              ['Related to TC',      yesNo(f.exporterRelatedToTc)],
              ['Related to Factory', yesNo(f.exporterRelatedToFactory)],
              ['TC terms',           esc(f.exporterTerms || '—')],
              ['HighLife terms',     esc(f.exporterTermsHl || '—')],
            ])}
          ${entityBlock('💰 Pay-to Company', f.paytoName, f.paytoSapName,
            fmtAddress(f.paytoAddress, f.paytoCity, f.paytoState, f.paytoCountry, f.paytoZip),
            !f.hasPayto,
            [
              ['Related to TC',       yesNo(f.paytoRelatedToTc)],
              ['Related to Exporter', yesNo(f.paytoRelatedToExporter)],
              ['Related to Factory',  yesNo(f.paytoRelatedToFactory)],
              ['TC terms',            esc(f.paytoTerms || '—')],
              ['HighLife terms',      esc(f.paytoTermsHl || '—')],
            ])}
        </div>
        ${f.notes ? `<div class="text-sm text-muted" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">📝 ${esc(f.notes)}</div>` : ''}
      </div>`;

    function entityBlock(title, name, sapName, addressHtml, greyedOut, rows) {
      const dim = greyedOut ? 'opacity:0.45;filter:grayscale(0.4)' : '';
      const sapLine = sapName
        ? `<div class="text-sm" style="color:#818cf8;margin-bottom:4px">SAP: ${esc(sapName)}</div>`
        : '';
      const placeholder = greyedOut
        ? '<div class="font-bold">Not applicable</div><div class="text-sm text-muted">This profile has no separate entity for this role.</div>'
        : `<div class="font-bold">${esc(name || '—')}</div>${sapLine}<div class="text-sm text-muted" style="margin-bottom:8px;line-height:1.35">${addressHtml}</div>`;
      return `
        <div style="padding:10px 12px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border);${dim}">
          <div class="text-sm font-bold" style="color:var(--accent);margin-bottom:6px">${title}</div>
          ${placeholder}
          ${greyedOut ? '' : `<div style="display:flex;flex-direction:column;gap:4px">
            ${rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.8rem">
              <span class="text-muted">${k}</span><span>${v}</span>
            </div>`).join('')}
          </div>`}
        </div>`;
    }

    // Country + TC filters (both admin + read-only views use them).
    const fCountry = localStorage.getItem('vcp_factory_f_country') || '';
    const fTc      = localStorage.getItem('vcp_factory_f_tc')      || '';
    const countryOpts = [...new Set(all.map(f => f.factoryCountry).filter(Boolean))].sort();
    const tcOpts      = [...new Set(all.map(f => f.tcId))]
      .map(id => ({ id, label: tcLabel(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const filterBar = (includeTc) => `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <select class="form-select" style="width:170px" onchange="App._factoryFilterSet('country', this.value)" title="Filter by factory country">
          <option value="">Country: All</option>
          ${countryOpts.map(c => `<option value="${esc(c)}" ${fCountry === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        ${includeTc ? `<select class="form-select" style="width:220px" onchange="App._factoryFilterSet('tc', this.value)" title="Filter by trading company">
          <option value="">Trading Company: All</option>
          ${tcOpts.map(o => `<option value="${esc(o.id)}" ${fTc === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>` : ''}
        ${(fCountry || fTc) ? `<button class="btn btn-ghost btn-sm" onclick="App._factoryFilterClear()">✕ Clear filters</button>` : ''}
      </div>`;

    const applyFilters = list => list.filter(f =>
      (!fCountry || f.factoryCountry === fCountry) &&
      (!fTc      || f.tcId === fTc)
    );

    if (!canReview) {
      // Read-only directory — active factories only.
      const list = applyFilters(all.filter(f => f.status === 'active'));
      return `
      <div class="page-header">
        <div><h1 class="page-title">🏭 Factories</h1>
          <p class="page-subtitle">Directory of approved trading-company factories</p></div>
      </div>
      ${filterBar(true)}
      ${list.length ? list.map(profileCard).join('') : `<div class="empty-state" style="padding:40px"><div class="icon">🏭</div><h3>No factories match the current filter</h3></div>`}`;
    }

    // Admin/PC — tabbed queue.
    const tabCounts = {
      pending:  all.filter(f => f.status === 'pending').length,
      active:   all.filter(f => f.status === 'active').length,
      inactive: all.filter(f => f.status === 'inactive').length,
      rejected: all.filter(f => f.status === 'rejected').length,
    };
    const activeTab = localStorage.getItem('vcp_factory_tab') || (tabCounts.pending ? 'pending' : 'active');
    const tabBtn = (key, label, count, color) => `
      <button class="btn ${activeTab === key ? 'btn-primary' : 'btn-secondary'} btn-sm"
        onclick="App._factoryTab('${key}')">
        ${label}${count > 0 ? ` <span class="pending-badge" style="background:${color};margin-left:4px">${count}</span>` : ''}
      </button>`;

    const shownList = applyFilters(all.filter(f => f.status === activeTab));

    return `
    <div class="page-header">
      <div><h1 class="page-title">🏭 Factories</h1>
        <p class="page-subtitle">Review TC factory submissions, set HighLife terms of business, and manage active/inactive status.</p>
      </div>
    </div>
    ${filterBar(true)}
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${tabBtn('pending',  '⏳ Pending',  tabCounts.pending,  '#f59e0b')}
      ${tabBtn('active',   '✓ Active',   tabCounts.active,   '#22c55e')}
      ${tabBtn('inactive', '⦸ Inactive', tabCounts.inactive, '#94a3b8')}
      ${tabBtn('rejected', '✕ Rejected', tabCounts.rejected, '#ef4444')}
    </div>
    ${shownList.length
      ? shownList.map(profileCard).join('')
      : `<div class="empty-state" style="padding:40px"><div class="icon">🏭</div><h3>Nothing in this bucket</h3></div>`}`;
  }

  const api = {
    renderDashboard,
    renderBuySummary, renderCustomers,
    renderPrograms, renderStyleManager, renderCostSummary, buildCostMatrix,
    renderCostComparison, renderCrossProgram,
    renderTradingCompanies, renderInternalPrograms, renderCOO,
    renderPendingChanges, renderStaff, renderDepartments,
    renderTradingCompaniesPC, renderInternalProgramsPC, renderCOOPC,
    crossProgramTable, statusBadge, toggleTCCols, expandAllTCs, collapseAllTCs,
    // Pre-costing workflow (v11 + v12 batch release)
    renderDesignHandoff, renderHandoffDetail, renderSalesRequests, renderBuildFromHandoff, renderFabricStandards, renderRecostQueue,
    renderBottleneckTracker, designChangeHistoryPanel, renderAllDesignChanges, renderStyleTimeline,
    // Design/Sales costing view (v13)
    renderDesignCostingView, renderCostHistoryTimeline,
    // Factory matrix
    renderFactories,
    // Delivery Plan
    renderDeliveryPlan,
    // Capacity Plan
    renderCapacityPlan,
    // Program Overview (margin recap)
    renderOverview,
    // Cross-program performance (admin/PC)
    renderPerformance,
  };

  Object.defineProperty(api, '_programsView', {
    get: () => _programsView,
    set: (v) => { _programsView = v; },
  });
  return api;

})();
