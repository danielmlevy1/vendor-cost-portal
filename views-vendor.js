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
    const tc = DB.TradingCompanies.get(tcId);
    const assignments = DB.Assignments.all().filter(a => a.tcId === tcId);
    const allStyles = DB.Assignments.stylesByTc(tcId);
    const subs = DB.Submissions.all().filter(s => s.tcId === tcId);
    const flaggedCount = subs.filter(s => s.status === 'flagged').length;
    const programs = assignments.map(a => DB.Programs.get(a.programId)).filter(Boolean);

    const progStats = programs.map(prog => {
      const styles   = allStyles.filter(s => s.programId === prog.id);
      const progSubs = subs.filter(sub => styles.some(s => s.id === sub.styleId));
      const totalRows = styles.reduce((acc) => acc + (tc?.coos?.length || 1), 0);
      const quoted   = progSubs.filter(s => s.fob || s.factoryCost).length;
      const flagged  = progSubs.filter(s => s.status === 'flagged').length;
      const skipped  = progSubs.filter(s => s.status === 'skipped').length;
      const pct      = totalRows > 0 ? Math.round((quoted / totalRows) * 100) : 0;
      return { prog, styles, totalRows, quoted, flagged, skipped, pct };
    });

    const tableBody = progStats.length ? progStats.map(({ prog, styles, totalRows, quoted, flagged, skipped, pct }) => {
      const badgeHtml = flagged > 0
        ? `<span class="badge badge-flagged">🚩 ${flagged} Flagged</span>`
        : pct === 100 ? `<span class="badge badge-submitted">✓ Complete</span>`
        : `<span class="badge badge-pending">Open</span>`;
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
        <td>${badgeHtml}${skipped > 0 ? ` <span class="text-muted text-sm">(${skipped} skipped)</span>` : ''}</td>
        <td><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();App.navigateVendorProgram('${tcId}','${prog.id}')">View →</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="text-center text-muted" style="padding:40px">No programs assigned yet.</td></tr>`;

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
            <th>Styles</th><th>Quoted</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
    </div>`}`;
  }



  // ── Per-Program Style List ─────────────────────────────────
  function renderProgramStyles(tcId, programId) {
    const tc = DB.TradingCompanies.get(tcId);
    const prog = DB.Programs.get(programId);
    const allStyles = DB.Assignments.stylesByTc(tcId);
    const styles = allStyles.filter(s => s.programId === programId);
    const subs = DB.Submissions.all().filter(s => s.tcId === tcId);
    const flaggedSubs = subs.filter(s => s.status === 'flagged' && styles.some(st => st.id === s.styleId));
    const coos = tc?.coos || [];

    // Build colspan for thead: Style# + Name + Fab + (FOB + FC + Action) per COO + Overall Status
    const cooColCount = coos.length * 3; // FOB, FC, Action per COO
    const totalCols = 3 + cooColCount + 1;

    // Helper: inline editable FOB or FC cell
    function cooCell(sub, field, styleId, coo) {
      const flag = sub ? DB.CellFlags.get(sub.id, field) : null;
      const revs = sub ? DB.Revisions.byField(sub.id, field) : [];
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


    // Group styles by fabrication
    const fabGroups = {};
    styles.forEach(s => {
      const fab = (s.fabrication || 'Other').trim();
      if (!fabGroups[fab]) fabGroups[fab] = [];
      fabGroups[fab].push(s);
    });

    let bodyRows = '';
    if (styles.length === 0) {
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
          bodyRows += `<tr class="${hasRevised ? 'flagged-row' : allSkipped ? 'tc-skipped-row' : ''}">
            <td class="primary font-bold" style="white-space:nowrap">${s.styleNumber}</td>
            <td style="min-width:120px">${s.styleName}</td>
            <td class="text-sm text-muted" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(s.fabrication||'').replace(/"/g,'&quot;')}">${(s.fabrication||'').substring(0,25)}${(s.fabrication||'').length>25?'…':''}</td>
            ${coos.map(coo => {
              const sub = styleSubs.find(sub => sub.coo === coo) || null;
              const isSkipped = sub?.status === 'skipped';
              const fobCell = cooCell(sub, 'fob', s.id, coo);
              const fcCell  = cooCell(sub, 'factoryCost', s.id, coo);
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
            const fFlag = DB.CellFlags.get(sub.id, 'fob');
            const cFlag = DB.CellFlags.get(sub.id, 'factoryCost');
            if (fFlag?.note) pills.push(`<span class="flag-note-pill flag-pill-${fFlag.color}">🚩 ${coo} FOB: ${fFlag.note}</span>`);
            if (cFlag?.note) pills.push(`<span class="flag-note-pill flag-pill-${cFlag.color}">🚩 ${coo} Factory Cost: ${cFlag.note}</span>`);
            if (sub.status === 'skipped' && sub.skipReason) pills.push(`<span class="flag-note-pill flag-pill-skip">⊘ ${coo} Skipped: ${sub.skipReason}</span>`);
          });
          if (pills.length) {
            bodyRows += `<tr class="flag-note-row"><td colspan="${totalCols}"><div class="flag-notes-inline">${pills.join('')}</div></td></tr>`;
          }
        });
      });
    }


    return `
    <div class="page-header">
      <div>
        <div style="margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigateVendorHome('${tcId}')" style="padding:4px 8px;font-size:0.8rem">← Back to Programs</button>
        </div>
        <h1 class="page-title">${prog?.name || 'Program'}</h1>
        <p class="page-subtitle">${styles.length} style${styles.length !== 1 ? 's' : ''} to quote${flaggedSubs.length ? ` · <span class="text-warning">🚩 ${flaggedSubs.length} flagged</span>` : ''}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="App.openVendorBulkUpload('${tcId}')">📤 Upload Quotes</button>
        <button class="btn btn-secondary" onclick="App.downloadVendorTemplate('${tcId}')">⬇ Template</button>
      </div>
    </div>
    ${flaggedSubs.length ? `<div class="alert alert-warning">🚩 ${flaggedSubs.length} cost(s) flagged for review. See the 🚩 notes below each style for details.</div>` : ''}
    <div class="card">
      <div class="table-wrap">
        <table class="tc-style-table">
          <thead>
            <tr>
              <th rowspan="2">Style #</th>
              <th rowspan="2">Style Name</th>
              <th rowspan="2">Fabrication</th>
              ${coos.map(coo => `<th colspan="3" class="coo-group-hdr">${coo}</th>`).join('')}
              <th rowspan="2">Status</th>
            </tr>
            <tr>
              ${coos.map(() => `<th>FOB</th><th>Factory Cost</th><th>Action</th>`).join('')}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`;
  }


  // ── All Styles View ────────────────────────────────────────
  function renderMyStyles(tcId) {
    const tc = DB.TradingCompanies.get(tcId);
    const styles = DB.Assignments.stylesByTc(tcId);
    const subs = DB.Submissions.all().filter(s => s.tcId === tcId);
    const flagged = subs.filter(s => s.status === 'flagged');

    return `
    <div class="page-header">
      <div>
        <div style="margin-bottom:4px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigateVendorHome('${tcId}')" style="padding:4px 8px;font-size:0.8rem">← Back to Programs</button>
        </div>
        <h1 class="page-title">All Styles — ${tc?.code}</h1>
        <p class="page-subtitle">${styles.length} styles across all programs${flagged.length ? ` · <span class="text-warning">${flagged.length} flagged for review</span>` : ''}</p>
        <div style="margin-top:6px"> ${(tc?.coos || []).map(c => `<span class="badge badge-pending" style="margin:2px">${c}</span>`).join('')} </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="App.openVendorBulkUpload('${tcId}')">📤 Upload Quotes</button>
        <button class="btn btn-secondary" onclick="App.downloadVendorTemplate('${tcId}')">⬇ Template</button>
      </div>
    </div>
    ${flagged.length ? `<div class="alert alert-warning">🚩 You have ${flagged.length} cost(s) flagged for review. Please revise your submissions.</div>` : ''}
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Program</th><th>Style #</th><th>Style Name</th><th>Fabrication</th>
            <th>COO</th><th>My FOB</th><th>Factory Cost</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            ${styles.length ? styles.flatMap(s => {
              const prog = DB.Programs.get(s.programId);
              const styleSubs = subs.filter(sub => sub.styleId === s.id);
              const allCoos = tc?.coos || [];
              return allCoos.map(coo => {
                const sub = styleSubs.find(sub => sub.coo === coo) || null;
                return `<tr class="${sub?.status === 'flagged' ? 'flagged-row' : ''}">
                  <td class="text-sm">${prog?.name || '—'}</td>
                  <td class="primary font-bold">${s.styleNumber}</td>
                  <td>${s.styleName}</td>
                  <td class="text-sm">${(s.fabrication || '').substring(0, 30)}${(s.fabrication || '').length > 30 ? '…' : ''}</td>
                  <td><span class="badge badge-pending">${coo}</span></td>
                  <td class="font-bold">${(() => {
                    const flag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
                    const revs = sub ? DB.Revisions.byField(sub.id, 'fob').length : 0;
                    const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||'').replace(/"/g,'&quot;') || flag.color}"></span>` : '';
                    const hist = revs > 1 ? `<span class="revision-badge vendor-hist" title="View history (${revs})" onclick="App.openRevisionHistory('${sub?.id}','fob')">&#128338; ${revs}</span>` : '';
                    return `${sub?.fob ? '$' + parseFloat(sub.fob).toFixed(2) : '—'}${dot}${hist}`;
                  })()}</td>
                  <td class="text-sm">${(() => {
                    const flag = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
                    const revs = sub ? DB.Revisions.byField(sub.id, 'factoryCost').length : 0;
                    const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||'').replace(/"/g,'&quot;') || flag.color}"></span>` : '';
                    const hist = revs > 1 ? `<span class="revision-badge vendor-hist" title="View history (${revs})" onclick="App.openRevisionHistory('${sub?.id}','factoryCost')">&#128338; ${revs}</span>` : '';
                    return `${sub?.factoryCost ? '$' + parseFloat(sub.factoryCost).toFixed(2) : '—'}${dot}${hist}`;
                  })()}</td>
                  <td>${badge(sub?.status || 'pending')}</td>
                  <td><button class="btn btn-primary btn-sm" onclick="App.openSubmitQuote('${s.id}','${tcId}','${coo}')">
                    ${sub ? (sub.status === 'flagged' ? '🚩 Revise' : '✏ Edit') : '＋ Quote'}</button></td>
                </tr>
                ${sub?.status === 'flagged' && sub.flagReason ? `<tr><td colspan="9"><div class="flag-comment">🚩 Feedback: ${sub.flagReason}</div></td></tr>` : ''}`;
              });
            }).join('') : `<tr><td colspan="9" class="text-center text-muted" style="padding:40px">No styles assigned to your company yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Quote Form ─────────────────────────────────────────────
  function quoteForm(styleId, tcId, coo) {
    const s = DB.Styles.get(styleId);
    const tc = DB.TradingCompanies.get(tcId);
    const existing = DB.Submissions.byTcAndStyle(tcId, styleId).find(s => s.coo === coo) || {};
    const cooRates = DB.CooRates.all();
    const availCoos = (tc?.coos || []).length ? tc.coos : cooRates.map(r => r.code);
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
        const sub = DB.Submissions.byTcAndStyle(tcId, styleId).find(s => s.coo === coo) || null;
        const fFlag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
        const cFlag = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
        const banner = (flag, label) => flag ? `<div class="flag-banner flag-banner-${flag.color}"><strong>&#128681; ${label} Flagged</strong>${flag.note ? ': ' + flag.note : ''}</div>` : '';
        return banner(fFlag,'FOB') + banner(cFlag,'Factory Cost');
      })()}
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">FOB Cost (USD) *</label><input class="form-input" id="q-fob" type="text" inputmode="decimal" value="${v.fob ? '$' + parseFloat(v.fob).toFixed(2) : ''}" required placeholder="e.g. $5.50"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2)"></div>
        <div class="form-group"><label class="form-label">Factory Cost</label><input class="form-input" id="q-factory" type="text" inputmode="decimal" value="${v.factoryCost ? '$' + parseFloat(v.factoryCost).toFixed(2) : ''}" placeholder="e.g. $4.80"
          onfocus="this.value=this.value.replace(/[^0-9.]/g,'')"
          onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value='$'+parseFloat(this.value).toFixed(2)"></div>
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
    const tc = DB.TradingCompanies.get(tcId);
    if (!tc) return `<div class="empty-state"><h3>Company not found</h3></div>`;
    const cooRates = DB.CooRates.all();
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

  return { renderPrograms, renderProgramStyles, renderMyStyles, renderMyCompany, quoteForm, bulkUploadForm };

})();

