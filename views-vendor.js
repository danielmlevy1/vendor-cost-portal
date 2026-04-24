// ============================================================
// VENDOR VIEWS — TC login: Programs Dashboard, My Styles, Quote Form
// Duty, freight, and LDP are intentionally hidden from TCs.
// ============================================================

const VendorViews = (() => {

  function badge(s) {
    const map = { submitted: 'submitted', flagged: 'flagged', accepted: 'accepted', pending: 'pending' };
    return `<span class="badge badge-${map[s] || 'pending'}">${{ submitted: 'Submitted', flagged: 'Flagged', accepted: 'Accepted', pending: 'Not Quoted' }[s] || s}</span>`;
  }

  // ── Programs Dashboard (TC home page) ──────────────────────
  function renderPrograms(tcId) {
    const tc = API.TradingCompanies.get(tcId);
    const assignments = API.Assignments.all().filter(a => a.tcId === tcId);
    const allStyles = API.Assignments.stylesByTc(tcId);
    const subs = API.Submissions.all().filter(s => s.tcId === tcId);
    const flaggedCount = subs.filter(s => s.status === 'flagged').length;
    const programs = assignments.map(a => API.Programs.get(a.programId)).filter(p => p && p.status !== 'Draft');

    const progStats = programs.map(prog => {
      const styles   = allStyles.filter(s => s.programId === prog.id);
      const progSubs = subs.filter(sub => styles.some(s => s.id === sub.styleId));
      // Quote rows per program = styles × COOs selected for THIS vendor on THIS program.
      const progAsgn = assignments.find(a => a.programId === prog.id);
      const progCoos = progAsgn?.coos?.length ? progAsgn.coos.length : (tc?.coos?.length || 1);
      const totalRows = styles.length * progCoos;
      const quoted   = progSubs.filter(s => s.fob || s.factoryCost).length;
      const flagged  = progSubs.filter(s => s.status === 'flagged').length;
      const skipped  = progSubs.filter(s => s.status === 'skipped').length;
      const pct      = totalRows > 0 ? Math.round((quoted / totalRows) * 100) : 0;
      // Days since this vendor last touched a submission on this program.
      // null means "never quoted" — surfaces silent programs.
      const lastTouch = progSubs.reduce((latest, s) => {
        const t = new Date(s.updatedAt || s.createdAt || 0).getTime();
        return t > latest ? t : latest;
      }, 0);
      const daysSinceQuote = lastTouch ? Math.floor((Date.now() - lastTouch) / 86400000) : null;
      return { prog, styles, totalRows, quoted, flagged, skipped, pct, daysSinceQuote };
    });

    const tableBody = progStats.length ? progStats.map(({ prog, styles, totalRows, quoted, flagged, skipped, pct, daysSinceQuote }) => {
      const badgeHtml = flagged > 0
        ? `<span class="badge badge-flagged">🚩 ${flagged} Flagged</span>`
        : pct === 100 ? `<span class="badge badge-submitted">✓ Complete</span>`
        : `<span class="badge badge-pending">Open</span>`;
      // "Last activity" cell: green ≤3d, amber 4–7d, red >7d, muted "never" if no quotes yet.
      let activityCell;
      if (pct === 100) {
        activityCell = '<span class="text-muted text-sm">—</span>';
      } else if (daysSinceQuote == null) {
        activityCell = '<span class="text-sm" style="color:#ef4444;font-weight:600" title="No quotes submitted yet">never</span>';
      } else {
        const c = daysSinceQuote <= 3 ? '#22c55e' : daysSinceQuote <= 7 ? '#f59e0b' : '#ef4444';
        const bg = daysSinceQuote <= 3 ? 'rgba(34,197,94,0.12)' : daysSinceQuote <= 7 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
        activityCell = `<span class="tag" title="Days since you last touched a quote on this program" style="background:${bg};color:${c};font-weight:600">⏱ ${daysSinceQuote}d</span>`;
      }
      return `<tr style="cursor:pointer" onclick="App.navigateVendorProgram('${tcId}','${prog.id}')">
        <td class="font-bold">${prog.name}</td>
        <td class="text-sm">${(prog.season && prog.season !== 'N/A') ? prog.season : '—'}</td>
        <td class="text-sm">${prog.year || '—'}</td>
        <td>${styles.length}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:99px;height:4px;min-width:60px">
              <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:99px"></div>
            </div>
            <span class="text-sm text-muted">${quoted}/${totalRows}</span>
          </div>
        </td>
        <td>${activityCell}</td>
        <td>${badgeHtml}${skipped > 0 ? ` <span class="text-muted text-sm">(${skipped} skipped)</span>` : ''}</td>
        <td><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();App.navigateVendorProgram('${tcId}','${prog.id}')">View →</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="text-center text-muted" style="padding:40px">No programs assigned yet.</td></tr>`;

    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Programs — ${tc?.code}</h1>
        <p class="page-subtitle">${programs.length} program${programs.length !== 1 ? 's' : ''} assigned · ${allStyles.length} total styles${flaggedCount ? ` · <span class="text-warning">⚠ ${flaggedCount} flagged</span>` : ''}</p>
        <div style="margin-top:6px"> ${(tc?.coos || []).map(c => `<span class="badge badge-pending" style="margin:2px">${c}</span>`).join('')} </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-secondary" onclick="App.navigateVendorAllStyles('${tcId}')">📋 All Styles</button>
        <button class="btn btn-secondary" onclick="App.openVendorBulkUpload('${tcId}')">📤 Upload Quotes</button>
        <button class="btn btn-secondary" onclick="App.downloadVendorTemplate('${tcId}')">⬇ Template</button>
      </div>
    </div>
    ${flaggedCount ? `<div class="alert alert-warning">🚩 You have ${flaggedCount} cost(s) flagged for review. Please open the relevant program and revise your submissions.</div>` : ''}
    ${programs.length === 0 ? `
      <div class="empty-state" style="padding:60px">
        <div class="icon">📦</div>
        <h3>No Programs Yet</h3>
        <p class="text-muted">You haven't been assigned to any programs. Check back soon.</p>
      </div>` : `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Program</th><th>Season</th><th>Year</th>
            <th>Styles</th><th>Quoted</th><th>Last activity</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
    </div>`}`;
  }



  // ── Per-Program Style List ─────────────────────────────────
  function renderProgramStyles(tcId, programId) {
    const tc = API.TradingCompanies.get(tcId);
    const prog = API.Programs.get(programId);
    const allStyles = API.Assignments.stylesByTc(tcId);
    const styles = allStyles.filter(s => s.programId === programId);
    const subs = API.Submissions.all().filter(s => s.tcId === tcId);
    const flaggedSubs = subs.filter(s => s.status === 'flagged' && styles.some(st => st.id === s.styleId));
    // COOs for this program come from the admin's assignment, not the TC's master list.
    const asgn = API.Assignments.byProgram(programId).find(a => a.tcId === tcId);
    const coos = (asgn?.coos?.length ? asgn.coos : (tc?.coos || []));

    // Factory Cost column is irrelevant under FOB — the quoted price is the full landed cost.
    const showFC = tc?.paymentTerms !== 'FOB';
    // Build colspan for thead: Style# + Name + Fab + (FOB [+ FC] + Action) per COO + Overall Status
    const cooColCount = coos.length * (showFC ? 3 : 2);
    const totalCols = 3 + cooColCount + 1;

    // Helper: inline editable FOB or FC cell
    function cooCell(sub, field, styleId, coo) {
      const flag = sub ? API.CellFlags.get(sub.id, field) : null;
      const revs = sub ? API.Revisions.byField(sub.id, field) : [];
      const rawVal = (sub && sub[field]) ? parseFloat(sub[field]).toFixed(2) : '';
      const isSkipped = sub?.status === 'skipped';
      const dot  = flag ? `<span class="flag-dot flag-${flag.color}" style="margin-left:4px" title="${(flag.note||flag.color).replace(/"/g,'&quot;')}"></span>` : '';
      const hist = revs.length > 1
        ? `<span class="revision-badge vendor-hist" style="margin-left:4px" title="View revision history" onclick="App.openRevisionHistory('${sub.id}','${field}')">🕒 ${revs.length}</span>`
        : '';
      if (isSkipped) {
        // Show greyed-out value for skipped rows
        return `<td class="text-muted tc-skipped-cell" style="text-align:center">—</td>`;
      }
      return `<td class="${flag ? 'cell-flagged-tc' : ''}" style="padding:4px 6px">
        <div style="display:flex;align-items:center;gap:4px">
          <input class="tc-inline-input" type="text" inputmode="decimal"
            placeholder="$0.00"
            value="${rawVal ? '$' + rawVal : ''}"
            onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
            onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);App.saveVendorCellInline('${styleId}','${tcId}','${coo}','${field}',this)"
            onkeydown="if(event.key==='Enter'){this.blur()}"
          >${dot}${hist}
        </div>
      </td>`;
    }


    // Unreleased batch styles from the linked handoff — visible to this TC but non-actionable
    const linkedHandoff = API.DesignHandoffs.all().find(h => h.linkedProgramId === programId);
    const unreleasedByFab = {};
    if (linkedHandoff && (linkedHandoff.assignedTCIds || []).includes(tcId)) {
      const releasedIds = new Set((linkedHandoff.batchReleases || []).flatMap(b => b.styleIds || []));
      (linkedHandoff.stylesList || []).forEach(s => {
        if (!releasedIds.has(s.id)) {
          const fab = (s.fabrication || s.fabric || 'Other').trim();
          if (!unreleasedByFab[fab]) unreleasedByFab[fab] = [];
          unreleasedByFab[fab].push(s);
        }
      });
    }

    // Group styles by fabrication
    const fabGroups = {};
    styles.forEach(s => {
      const fab = (s.fabrication || 'Other').trim();
      if (!fabGroups[fab]) fabGroups[fab] = [];
      fabGroups[fab].push(s);
    });
    // Ensure fabric groups that only have unreleased styles also appear
    Object.keys(unreleasedByFab).forEach(fab => { if (!fabGroups[fab]) fabGroups[fab] = []; });

    let bodyRows = '';
    if (styles.length === 0 && Object.keys(unreleasedByFab).length === 0) {
      bodyRows = `<tr><td colspan="${totalCols}" class="text-center text-muted" style="padding:40px">No styles in this program yet.</td></tr>`;
    } else {
      Object.entries(fabGroups).forEach(([fab, fabStyles]) => {
        // Fabric group header
        bodyRows += `<tr class="tc-fab-group-hdr"><td colspan="${totalCols}"><span class="fab-group-label">${fab}</span></td></tr>`;

        fabStyles.forEach(s => {
          const styleSubs = subs.filter(sub => sub.styleId === s.id);
          const isFullyQuoted = coos.length > 0 && coos.every(coo => styleSubs.some(sub => sub.coo === coo && sub.fob));
          const hasRevised    = coos.some(coo => { const sub = styleSubs.find(sub => sub.coo === coo); return sub?.status === 'flagged'; });
          const allSkipped    = coos.length > 0 && coos.every(coo => styleSubs.some(sub => sub.coo === coo && sub.status === 'skipped'));

          // Main style row — one row per style, one FOB+FC input per COO column
          const isOutdatedQuote = coos.some(coo => {
            const sub = styleSubs.find(s2 => s2.coo === coo);
            return sub?.isOutdated;
          });
          bodyRows += `<tr class="${hasRevised ? 'flagged-row' : allSkipped ? 'tc-skipped-row' : isOutdatedQuote ? 'outdated-quote-row' : ''}">
            <td class="primary font-bold" style="white-space:nowrap">${s.styleNumber}${isOutdatedQuote ? ' <span class="tag" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:0.65rem;vertical-align:middle">⚠ Re-cost</span>' : ''}${s.releasedBatch ? `<span class="tag" style="font-size:0.6rem;margin-left:4px;background:rgba(99,102,241,0.12);color:#6366f1;vertical-align:middle">${s.releasedBatch}</span>` : ''}</td>
            <td style="min-width:120px">${s.styleName}</td>
            <td class="text-sm text-muted" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(s.fabrication||'').replace(/"/g,'&quot;')}">${(s.fabrication||'').substring(0,25)}${(s.fabrication||'').length>25?'…':''}</td>
            ${coos.map(coo => {
              const sub = styleSubs.find(sub => sub.coo === coo) || null;
              const isSkipped = sub?.status === 'skipped';
              const fobCell = cooCell(sub, 'fob', s.id, coo);
              const fcCell  = showFC ? cooCell(sub, 'factoryCost', s.id, coo) : '';
              const skipBtn = isSkipped
                ? `<button class="btn btn-ghost btn-sm tc-skip-btn" title="Un-skip this COO" onclick="App.unskipVendorCoo('${s.id}','${tcId}','${coo}')">↩ Un-skip</button>`
                : `<button class="btn btn-ghost btn-sm tc-skip-btn" title="Skip this COO" onclick="App.openSkipVendorCoo('${s.id}','${tcId}','${coo}')">⊘ Skip</button>`;
              return `${fobCell}${fcCell}<td style="text-align:center">${skipBtn}</td>`;
            }).join('')}
            <td>${badge(allSkipped ? 'pending' : isFullyQuoted ? (hasRevised ? 'flagged' : 'submitted') : 'pending')}</td>
          </tr>`;

          // Flag note + skip reason pills below row
          const pills = [];
          coos.forEach(coo => {
            const sub = styleSubs.find(sub => sub.coo === coo);
            if (!sub) return;
            const fFlag = API.CellFlags.get(sub.id, 'fob');
            const cFlag = API.CellFlags.get(sub.id, 'factoryCost');
            if (fFlag?.note) pills.push(`<span class="flag-note-pill flag-pill-${fFlag.color}">🚩 ${coo} FOB: ${fFlag.note}</span>`);
            if (showFC && cFlag?.note) pills.push(`<span class="flag-note-pill flag-pill-${cFlag.color}">🚩 ${coo} Factory Cost: ${cFlag.note}</span>`);
            if (sub.status === 'skipped' && sub.skipReason) pills.push(`<span class="flag-note-pill flag-pill-skip">⊘ ${coo} Skipped: ${sub.skipReason}</span>`);
          });
          if (pills.length) {
            bodyRows += `<tr class="flag-note-row"><td colspan="${totalCols}"><div class="flag-notes-inline">${pills.join('')}</div></td></tr>`;
          }
        });

        // Unreleased batch styles for this fabric group — greyed out, non-actionable
        (unreleasedByFab[fab] || []).forEach(s => {
          const batchLabel = s.batchLabel || 'Batch 1';
          bodyRows += `<tr style="opacity:0.45;pointer-events:none">
            <td class="primary font-bold" style="white-space:nowrap">${s.styleNumber || '—'}</td>
            <td style="min-width:120px">${s.styleName || '—'}</td>
            <td class="text-sm text-muted">${(s.fabrication || s.fabric || '').substring(0,25)}</td>
            ${coos.map(() => `<td class="text-muted" style="text-align:center;padding:4px 6px" colspan="${showFC ? 3 : 2}">—</td>`).join('')}
            <td><span class="tag" style="font-size:0.68rem;background:rgba(148,163,184,0.15);color:#94a3b8">⏳ ${batchLabel}</span></td>
          </tr>`;
        });
      });
    }


    // Factory allocation section — shown when any of this vendor's
    // styles in this program are placed. TC picks which of their
    // active factories will produce each placed style.
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const placements = API.Placements ? styles.map(s => ({ style: s, pl: API.Placements.get(s.id) })).filter(x => x.pl && x.pl.tcId === tcId) : [];
    const myFactories = (API.Factories?.byTc(tcId) || []).filter(f => f.status === 'active');
    const unassigned  = placements.filter(x => !x.pl.factoryId).length;

    const factoryPanel = placements.length ? `
      <div class="card mb-3" style="padding:14px 16px;border-left:3px solid ${unassigned ? '#f59e0b' : '#22c55e'}">
        <div class="font-bold mb-2" style="display:flex;align-items:center;gap:8px">
          🏭 Factory allocation
          ${unassigned ? `<span class="badge badge-pending">${unassigned} need${unassigned !== 1 ? '' : 's'} assignment</span>` : `<span class="badge badge-placed">All assigned</span>`}
        </div>
        ${myFactories.length === 0 ? `
          <div class="text-sm text-warning">No active factories on your account yet. <a href="#" onclick="event.preventDefault();App.navigate('my-factories')">Add a factory →</a></div>
        ` : `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${placements.map(({ style, pl }) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
              <div style="min-width:180px">
                <span class="primary font-bold">${esc(style.styleNumber)}</span>
                <span class="text-sm text-muted"> · ${esc(style.styleName || '')}</span>
              </div>
              <select class="form-select" style="max-width:280px" onchange="App.setPlacementFactory('${esc(style.id)}', this.value)">
                <option value="">— Select factory —</option>
                ${myFactories.map(f => `<option value="${esc(f.id)}" ${pl.factoryId === f.id ? 'selected' : ''}>${esc(f.factoryName)}${f.factoryCountry ? ' · ' + esc(f.factoryCountry) : ''}</option>`).join('')}
              </select>
            </div>
          `).join('')}
        </div>`}
      </div>` : '';

    return `
    <div class="page-header">
      <div>
        <div style="margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigateVendorHome('${tcId}')" style="padding:4px 8px;font-size:0.8rem">← Back to Programs</button>
        </div>
        <h1 class="page-title">${prog?.name || 'Program'}</h1>
        <p class="page-subtitle">${styles.length} style${styles.length !== 1 ? 's' : ''} to quote${flaggedSubs.length ? ` · <span class="text-warning">🚩 ${flaggedSubs.length} flagged</span>` : ''}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="App.navigate('capacity-plan','${programId}')">🏭 Capacity Plan</button>
        <button class="btn btn-secondary" onclick="App.navigate('delivery-plan','${programId}')">🚢 Delivery Plan</button>
        <button class="btn btn-secondary" onclick="App.openVendorBulkUpload('${tcId}')">📤 Upload Quotes</button>
        <button class="btn btn-secondary" onclick="App.downloadVendorTemplate('${tcId}')">⬇ Template</button>
      </div>
    </div>
    ${factoryPanel}
    ${flaggedSubs.length ? `<div class="alert alert-warning">🚩 ${flaggedSubs.length} cost(s) flagged for review. See the 🚩 notes below each style for details.</div>` : ''}
    <div class="card">
      <div class="table-wrap">
        <table id="tc-costing-table" class="tc-style-table">
          <thead>
            <tr>
              <th rowspan="2">Style #</th>
              <th rowspan="2">Style Name</th>
              <th rowspan="2">Fabrication</th>
              ${coos.map(coo => `<th colspan="3" class="coo-group-hdr">${coo}</th>`).join('')}
              <th rowspan="2">Status</th>
            </tr>
            <tr>
              ${coos.map(() => `<th>FOB</th>${showFC ? '<th>Factory Cost</th>' : ''}<th>Action</th>`).join('')}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`;
  }


  // ── All Styles View ────────────────────────────────────────
  // Inline-editable across all assigned programs. Each row is one
  // (style × COO) combination and the admin's per-program COO selection
  // determines which COO rows show up.
  function renderMyStyles(tcId) {
    const tc = API.TradingCompanies.get(tcId);
    const styles = API.Assignments.stylesByTc(tcId);
    const subs = API.Submissions.all().filter(s => s.tcId === tcId);
    const flagged = subs.filter(s => s.status === 'flagged');

    // Per-program COO selection: admin-assigned COOs for THIS vendor on
    // each program, falling back to the TC master list if the
    // assignment didn't specify any (shouldn't happen after backfill).
    function coosFor(programId) {
      const asgn = API.Assignments.byProgram(programId).find(a => a.tcId === tcId);
      if (asgn?.coos?.length) return asgn.coos;
      return tc?.coos || [];
    }

    // Inline editable FOB / Factory Cost cell, mirroring the per-program
    // quote table so behavior is identical across views.
    function inlineMoneyCell(sub, field, styleId, coo) {
      const flag = sub ? API.CellFlags.get(sub.id, field) : null;
      const revs = sub ? API.Revisions.byField(sub.id, field) : [];
      const rawVal = (sub && sub[field] != null) ? parseFloat(sub[field]).toFixed(2) : '';
      const isSkipped = sub?.status === 'skipped';
      const dot  = flag ? `<span class="flag-dot flag-${flag.color}" style="margin-left:4px" title="${(flag.note||flag.color).replace(/"/g,'&quot;')}"></span>` : '';
      const hist = revs.length > 1
        ? `<span class="revision-badge vendor-hist" style="margin-left:4px" title="View revision history" onclick="App.openRevisionHistory('${sub.id}','${field}')">🕒 ${revs.length}</span>`
        : '';
      if (isSkipped) return `<td class="text-muted tc-skipped-cell" style="text-align:center">—</td>`;
      return `<td class="${flag ? 'cell-flagged-tc' : ''}" style="padding:4px 6px">
        <div style="display:flex;align-items:center;gap:4px">
          <input class="tc-inline-input" type="text" inputmode="decimal"
            placeholder="$0.00"
            value="${rawVal ? '$' + rawVal : ''}"
            onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
            onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2);App.saveVendorCellInline('${styleId}','${tcId}','${coo}','${field}',this)"
            onkeydown="if(event.key==='Enter'){this.blur()}"
          >${dot}${hist}
        </div>
      </td>`;
    }

    // Unreleased batch styles across all assigned handoffs — shown as a separate read-only panel
    const pendingBatchStyles = [];
    API.DesignHandoffs.all().forEach(h => {
      if (!(h.assignedTCIds || []).includes(tcId)) return;
      const releasedIds = new Set((h.batchReleases || []).flatMap(b => b.styleIds || []));
      (h.stylesList || []).forEach(s => {
        if (!releasedIds.has(s.id)) pendingBatchStyles.push({ s, h });
      });
    });

    // Flatten styles × their program's COOs into rows; skip any style
    // whose program has zero COOs assigned for this vendor.
    const rowCount = styles.reduce((n, s) => n + coosFor(s.programId).length, 0);

    const bodyRows = styles.flatMap(s => {
      const prog = API.Programs.get(s.programId);
      const styleSubs = subs.filter(sub => sub.styleId === s.id);
      const coos = coosFor(s.programId);
      return coos.map(coo => {
        const sub = styleSubs.find(x => x.coo === coo) || null;
        const isSkipped = sub?.status === 'skipped';
        const skipBtn = isSkipped
          ? `<button class="btn btn-ghost btn-sm tc-skip-btn" title="Un-skip this COO" onclick="App.unskipVendorCoo('${s.id}','${tcId}','${coo}')">↩ Un-skip</button>`
          : `<button class="btn btn-ghost btn-sm tc-skip-btn" title="Skip this COO" onclick="App.openSkipVendorCoo('${s.id}','${tcId}','${coo}')">⊘ Skip</button>`;
        return `<tr class="${sub?.status === 'flagged' ? 'flagged-row' : isSkipped ? 'tc-skipped-row' : ''}">
          <td class="text-sm">${prog?.name || '—'}</td>
          <td class="primary font-bold">${s.styleNumber}${s.releasedBatch ? `<span class="tag" style="font-size:0.6rem;margin-left:4px;background:rgba(99,102,241,0.12);color:#6366f1;vertical-align:middle">${s.releasedBatch}</span>` : ''}</td>
          <td>${s.styleName}</td>
          <td class="text-sm">${(s.fabrication || '').substring(0, 30)}${(s.fabrication || '').length > 30 ? '…' : ''}</td>
          <td><span class="badge badge-pending">${coo}</span></td>
          ${inlineMoneyCell(sub, 'fob', s.id, coo)}
          ${inlineMoneyCell(sub, 'factoryCost', s.id, coo)}
          <td>${badge(sub?.status || 'pending')}</td>
          <td style="white-space:nowrap">
            ${skipBtn}
            <button class="btn btn-secondary btn-sm" title="More options (payment terms, MOQ, lead time, comments)" onclick="App.openSubmitQuote('${s.id}','${tcId}','${coo}')">⋯</button>
          </td>
        </tr>
        ${sub?.status === 'flagged' && sub.flagReason ? `<tr><td colspan="9"><div class="flag-comment">🚩 Feedback: ${sub.flagReason}</div></td></tr>` : ''}`;
      });
    }).join('');

    return `
    <div class="page-header">
      <div>
        <div style="margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigateVendorHome('${tcId}')" style="padding:4px 8px;font-size:0.8rem">← Back to Programs</button>
        </div>
        <h1 class="page-title">All Styles — ${tc?.code}</h1>
        <p class="page-subtitle">${styles.length} styles · ${rowCount} quote row${rowCount !== 1 ? 's' : ''} across all programs${flagged.length ? ` · <span class="text-warning">${flagged.length} flagged for review</span>` : ''}</p>
        <div style="margin-top:6px"> ${(tc?.coos || []).map(c => `<span class="badge badge-pending" style="margin:2px">${c}</span>`).join('')} </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="App.openVendorBulkUpload('${tcId}')">📤 Upload Quotes</button>
        <button class="btn btn-secondary" onclick="App.downloadVendorTemplate('${tcId}')">⬇ Template</button>
      </div>
    </div>
    ${flagged.length ? `<div class="alert alert-warning">🚩 You have ${flagged.length} cost(s) flagged for review. Please revise your submissions.</div>` : ''}
    ${pendingBatchStyles.length ? `
    <div class="card mb-4" style="border-left:3px solid #94a3b8;opacity:0.75">
      <div class="font-bold text-sm text-muted mb-2">⏳ Pending Batches — Styles not yet released (${pendingBatchStyles.length})</div>
      <div class="text-sm text-muted mb-3">These styles are in your assigned handoffs but haven't been released by Design yet. They'll appear in the quote table once released.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Handoff</th><th>Style #</th><th>Style Name</th><th>Fabrication</th><th>Batch</th></tr></thead>
        <tbody>
          ${pendingBatchStyles.map(({ s, h }) => `<tr style="opacity:0.6">
            <td class="text-sm text-muted">${[h.season,h.year,h.brand].filter(Boolean).join(' ')}</td>
            <td class="primary font-bold">${s.styleNumber || '—'}</td>
            <td>${s.styleName || '—'}</td>
            <td class="text-sm text-muted">${(s.fabrication || s.fabric || '—').substring(0,30)}</td>
            <td><span class="tag" style="font-size:0.68rem;background:rgba(148,163,184,0.15);color:#94a3b8">${s.batchLabel || 'Batch 1'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}
    <div class="card">
      <div class="table-wrap">
        <table id="tc-all-styles-table" class="tc-style-table">
          <thead><tr>
            <th>Program</th><th>Style #</th><th>Style Name</th><th>Fabrication</th>
            <th>COO</th><th>My FOB</th><th>Factory Cost</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${bodyRows || `<tr><td colspan="9" class="text-center text-muted" style="padding:40px">No styles assigned to your company yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Quote Form ─────────────────────────────────────────────
  function quoteForm(styleId, tcId, coo) {
    const s = API.Styles.get(styleId);
    const tc = API.TradingCompanies.get(tcId);
    const existing = API.Submissions.byTcAndStyle(tcId, styleId).find(s => s.coo === coo) || {};
    const cooRates = API.cache.cooRates;
    // Prefer the COOs the admin picked for this specific (program, TC).
    // Fall back to the TC's master list if no assignment is known.
    const asgn      = s ? API.Assignments.byProgram(s.programId).find(a => a.tcId === tcId) : null;
    const availCoos = (asgn?.coos?.length ? asgn.coos
                      : (tc?.coos || []).length ? tc.coos
                      : cooRates.map(r => r.code));
    const v = existing;

    return `
    <div class="modal-header" style="display:block;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>Submit Quote — ${s?.styleNumber}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div class="text-sm text-muted mt-1">${s?.styleName} · ${s?.category || ''}</div>
    </div>
    <form id="quote-form">
      <div class="form-group">
        <label class="form-label">Country of Origin (COO) *</label>
        <select class="form-select" id="q-coo" required>
          ${cooRates.filter(r => availCoos.includes(r.code)).map(r => `<option value="${r.code}" ${(coo || v.coo) === r.code ? 'selected' : ''}>${r.code} — ${r.country}</option>`).join('')}
        </select>
      </div>
      ${(() => {
        const sub = API.Submissions.byTcAndStyle(tcId, styleId).find(s => s.coo === coo) || null;
        const fFlag = sub ? API.CellFlags.get(sub.id, 'fob') : null;
        const cFlag = sub ? API.CellFlags.get(sub.id, 'factoryCost') : null;
        const banner = (flag, label) => flag ? `<div class="flag-banner flag-banner-${flag.color}"><strong>&#128681; ${label} Flagged</strong>${flag.note ? ': ' + flag.note : ''}</div>` : '';
        const showFCForm = tc?.paymentTerms !== 'FOB';
        return banner(fFlag,'FOB') + (showFCForm ? banner(cFlag,'Factory Cost') : '');
      })()}
      <div class="form-row ${showFCForm ? 'form-row-2' : ''}">
        <div class="form-group"><label class="form-label">FOB Cost (USD) *</label><input class="form-input" id="q-fob" type="text" inputmode="decimal" value="${v.fob ? '$' + parseFloat(v.fob).toFixed(2) : ''}" required placeholder="e.g. $5.50"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2)"></div>
        ${showFCForm ? `<div class="form-group"><label class="form-label">Factory Cost</label><input class="form-input" id="q-factory" type="text" inputmode="decimal" value="${v.factoryCost ? '$' + parseFloat(v.factoryCost).toFixed(2) : ''}" placeholder="e.g. $4.80"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2)"></div>` : ''}
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">TC Markup %</label><input class="form-input" id="q-tcmu" type="number" step="0.01" value="${v.tcMarkup ? v.tcMarkup * 100 : ''}" placeholder="e.g. 15"></div>
        <div class="form-group"><label class="form-label">Payment Terms</label>
          <select class="form-select" id="q-terms">${['FOB', 'CIF', 'First Sale', 'FCA', 'Duty Free', 'CPTPP'].map(t => `<option ${(v.paymentTerms || tc?.paymentTerms) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">MOQ</label><input class="form-input" id="q-moq" type="number" value="${v.moq || ''}" placeholder="e.g. 1200"></div>
        <div class="form-group"><label class="form-label">Lead Time (days)</label><input class="form-input" id="q-lead" type="number" value="${v.leadTime || ''}" placeholder="e.g. 90"></div>
      </div>
      <div class="form-group"><label class="form-label">Comments</label>
        <textarea class="form-textarea" id="q-comments" placeholder="Notes, caveats, min. requirements…">${v.vendorComments || ''}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit Quote</button>
      </div>
    </form>`;
  }

  // ── Bulk Upload Form ───────────────────────────────────────
  function bulkUploadForm(tcId) {
    return `
    <div class="modal-header"><h2>📤 Upload Quotes</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <p class="mb-3 text-muted">Upload a CSV with your FOB prices. Download the template to get your style numbers pre-filled. Include the COO column for each row.</p>
    <div class="upload-zone" id="vendor-upload-zone"
      ondragover="event.preventDefault();this.classList.add('dragover')"
      ondragleave="this.classList.remove('dragover')"
      ondrop="App.handleVendorDrop(event,'${tcId}')">
      <input type="file" accept=".csv" onchange="App.handleVendorFileUpload(event,'${tcId}')">
      <div class="upload-icon">📄</div>
      <p class="font-bold" style="color:var(--text-primary)">Drop CSV here or click to browse</p>
    </div>
    <div id="vendor-upload-preview" class="mt-3"></div>`;
  }

  // ── My Company (TC read-only self-view) ──────────────────────
  function renderMyCompany(tcId) {
    const tc = API.TradingCompanies.get(tcId);
    if (!tc) return `<div class="empty-state"><h3>Company not found</h3></div>`;
    const cooRates = API.cache.cooRates;
    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Company</h1>
        <p class="page-subtitle">Your company details and assigned countries of origin</p>
      </div>
    </div>
    <div class="card" style="max-width:600px">
      <div style="display:grid;gap:20px">
        <div class="form-row form-row-2">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:4px">Company Code</div>
            <div class="font-bold" style="font-size:1.1rem">${tc.code}</div>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:4px">Company Name</div>
            <div class="font-bold" style="font-size:1.1rem">${tc.name}</div>
          </div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:8px">Contact Email</div>
          <div>${tc.email}</div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:8px">Default Payment Terms</div>
          <div><span class="badge badge-costing">${tc.paymentTerms || 'FOB'}</span></div>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:8px">Countries of Origin (COOs)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(tc.coos || []).map(code => {
              const r = cooRates.find(r => r.code === code);
              return `<span class="badge badge-pending" style="padding:6px 12px">${code}${r ? ` — ${r.country}` : ''}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── My Factories (vendor-submitted factory profiles) ──────────
  function renderMyFactories(tcId) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const mineAll = API.Factories.byTc(tcId);

    const fCountry = localStorage.getItem('vcp_my_factory_f_country') || '';
    const countryOpts = [...new Set(mineAll.map(f => f.factoryCountry).filter(Boolean))].sort();
    const mine = fCountry ? mineAll.filter(f => f.factoryCountry === fCountry) : mineAll;

    const statusBadge = s => ({
      pending:  '<span class="badge badge-pending">⏳ Pending review</span>',
      active:   '<span class="badge badge-placed">✓ Active</span>',
      inactive: '<span class="badge" style="background:rgba(148,163,184,0.2);color:#94a3b8">⦸ Inactive</span>',
      rejected: '<span class="badge badge-flagged">✕ Rejected</span>',
    }[s] || `<span class="badge">${s}</span>`);

    const shipLabel = {
      tc: 'TC', factory: 'Factory', exporter: 'Exporter', payto: 'Pay-to',
    };

    // One-line "City, Country" summary for the card header.
    const locSummary = f => [f.factoryCity, f.factoryCountry].filter(Boolean).join(', ') || 'No address';

    const rows = mine.length ? mine.map(f => `
      <div class="card" style="padding:14px 16px;margin-bottom:12px;border-left:3px solid ${
        f.status === 'active' ? '#22c55e' : f.status === 'rejected' ? '#ef4444' : '#f59e0b'}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span class="font-bold" style="font-size:1.05rem">${esc(f.factoryName)}</span>
              ${f.firstSaleApproved ? '<span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;font-weight:600">🌟 First Sale</span>' : ''}
            </div>
            <div class="text-sm text-muted">${esc(locSummary(f))} · submitted ${fmtDate(f.submittedAt)}</div>
            <div style="margin-top:8px">${statusBadge(f.status)}</div>
            ${f.rejectionReason ? `<div class="text-sm" style="color:#ef4444;margin-top:6px"><strong>Rejected:</strong> ${esc(f.rejectionReason)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="App.openFactoryFormVendor('${esc(f.id)}')">${f.status === 'rejected' ? 'Edit & resubmit' : 'Edit'}</button>
          </div>
        </div>
        <div class="text-sm text-muted" style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px">
          <div>🚢 Ship by <strong>${shipLabel[f.shippingResponsible] || '—'}</strong>${f.portOfShipping ? ` · ${esc(f.portOfShipping)}` : ''}</div>
          <div>📦 ${f.hasExporter ? `<strong>${esc(f.exporterName || 'Exporter')}</strong>` : 'No separate exporter'}</div>
          <div>💰 ${f.hasPayto ? `<strong>${esc(f.paytoName || 'Pay-to')}</strong>` : 'No separate pay-to'}</div>
        </div>
      </div>`).join('') : `<div class="empty-state" style="padding:40px"><div class="icon">🏭</div><h3>${fCountry ? `No factories in ${esc(fCountry)}` : 'No factories submitted yet'}</h3>${fCountry ? '' : '<p class="text-muted">Click "+ Submit new factory" to start.</p>'}</div>`;

    const kpis = {
      pending:  mineAll.filter(f => f.status === 'pending').length,
      active:   mineAll.filter(f => f.status === 'active').length,
      rejected: mineAll.filter(f => f.status === 'rejected').length,
    };

    return `
    <div class="page-header">
      <div><h1 class="page-title">🏭 My Factories</h1>
        <p class="page-subtitle">Submit new factory relationships for approval. Our team reviews each submission before it goes live.</p>
      </div>
      <button class="btn btn-primary" onclick="App.openFactoryFormVendor()">＋ Submit new factory</button>
    </div>

    <div class="fabric-kpi-row">
      <div class="fabric-kpi fabric-kpi-pending"><span class="fabric-kpi-num">${kpis.pending}</span><span class="fabric-kpi-label">Pending review</span></div>
      <div class="fabric-kpi fabric-kpi-received"><span class="fabric-kpi-num">${kpis.active}</span><span class="fabric-kpi-label">Active</span></div>
      <div class="fabric-kpi fabric-kpi-sent"><span class="fabric-kpi-num">${kpis.rejected}</span><span class="fabric-kpi-label">Rejected</span></div>
    </div>

    ${countryOpts.length > 1 ? `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <select class="form-select" style="width:180px" onchange="App._myFactoryFilterSet(this.value)" title="Filter by factory country">
        <option value="">Country: All</option>
        ${countryOpts.map(c => `<option value="${esc(c)}" ${fCountry === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      ${fCountry ? `<button class="btn btn-ghost btn-sm" onclick="App._myFactoryFilterSet('')">✕ Clear</button>` : ''}
    </div>` : ''}

    ${rows}`;
  }

  return { renderPrograms, renderProgramStyles, renderMyStyles, renderMyCompany, renderMyFactories, quoteForm, bulkUploadForm };

})();

