// ============================================================
// VENDOR VIEWS — TC login: My Styles, Quote Form, Bulk Upload
// Duty, freight, and LDP are intentionally hidden from TCs.
// ============================================================

const VendorViews = (() => {

  function badge(s) {
    const map = { submitted: 'submitted', flagged: 'flagged', accepted: 'accepted', pending: 'pending' };
    return `<span class="badge badge-${map[s] || 'pending'}">${{ submitted: 'Submitted', flagged: 'Flagged', accepted: 'Accepted', pending: 'Not Quoted' }[s] || s}</span>`;
  }

  // ── My Styles ─────────────────────────────────────────────
  function renderMyStyles(tcId) {
    const tc = DB.TradingCompanies.get(tcId);
    const styles = DB.Assignments.stylesByTc(tcId);
    const subs = DB.Submissions.all().filter(s => s.tcId === tcId);

    const flagged = subs.filter(s => s.status === 'flagged');
    return `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Styles — ${tc?.code}</h1>
        <p class="page-subtitle">${styles.length} styles to quote${flagged.length ? ` · <span class="text-warning">${flagged.length} flagged for review</span>` : ''}</p>
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
      // Show one row per COO the TC has already quoted, plus a row for each unquoted COO
      const quotedCoos = styleSubs.map(sub => sub.coo);
      const allCoos = tc?.coos || [];
      return allCoos.map(coo => {
        const sub = styleSubs.find(sub => sub.coo === coo) || null;
        return `<tr class="${sub?.status === 'flagged' ? 'flagged-row' : ''}">
                  <td class="text-sm">${prog?.name || '—'}</td>
                  <td class="primary font-bold">${s.styleNumber}</td>
                  <td>${s.styleName}</td>
                  <td class="text-sm">${(s.fabrication || '').substring(0, 30)}${(s.fabrication || '').length > 30 ? '…' : ''}</td>
                  <td><span class="badge badge-pending">${coo}</span></td>
                  <td class="font-bold">${sub?.fob ? '$' + parseFloat(sub.fob).toFixed(2) : '—'}</td>
                  <td class="text-sm">${sub?.factoryCost ? '$' + parseFloat(sub.factoryCost).toFixed(2) : '—'}</td>
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
  // coo param: pre-selects which COO this quote is for
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
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">FOB Cost (USD) *</label><input class="form-input" id="q-fob" type="number" step="0.01" value="${v.fob || ''}" required placeholder="e.g. 5.50"></div>
        <div class="form-group"><label class="form-label">Factory Cost</label><input class="form-input" id="q-factory" type="number" step="0.01" value="${v.factoryCost || ''}" placeholder="e.g. 4.80"></div>
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

  return { renderMyStyles, quoteForm, bulkUploadForm };

})();
