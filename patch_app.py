f = '/Users/daniell/.gemini/antigravity/scratch/vendor-cost-portal/app.js'
with open(f, 'r') as fh:
    c = fh.read()

# --- Insert flag/history functions before the closing return {} ---
FLAG_FUNCTIONS = '''
  // ── Cell Flag Menu (right-click context menu) ───────────────
  function openFlagMenu(event, subId, field) {
    event.preventDefault();
    event.stopPropagation();
    if (!subId) return; // no submission yet — nothing to flag
    const user = state.user;
    if (!user || (user.role !== 'admin' && user.role !== 'pc')) return;

    // Remove any existing menu
    const old = document.getElementById('flag-context-menu');
    if (old) old.remove();

    const existing = DB.CellFlags.get(subId, field);
    const label = field === 'fob' ? 'FOB' : 'Factory Cost';

    const menu = document.createElement('div');
    menu.id = 'flag-context-menu';
    menu.className = 'flag-context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top  = event.pageY + 'px';
    menu.innerHTML = `
      <div class="flag-menu-title">Flag ${label}</div>
      <button class="flag-menu-item" onclick="App.openFlagNoteModal('${subId}','${field}','red')"><span class="flag-swatch flag-red"></span>Red</button>
      <button class="flag-menu-item" onclick="App.openFlagNoteModal('${subId}','${field}','orange')"><span class="flag-swatch flag-orange"></span>Orange</button>
      <button class="flag-menu-item" onclick="App.openFlagNoteModal('${subId}','${field}','purple')"><span class="flag-swatch flag-purple"></span>Purple</button>
      ${existing ? '<hr class="flag-menu-sep"><button class="flag-menu-item flag-menu-clear" onclick="App.clearCellFlag(\''+subId+'\',\''+field+'\')">✕ Clear Flag</button>' : ''}
      <hr class="flag-menu-sep">
      <button class="flag-menu-item" onclick="App.openRevisionHistory('${subId}','${field}')">🕐 View History</button>
    `;
    document.body.appendChild(menu);

    // Dismiss on next click
    const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  }

  function openFlagNoteModal(subId, field, color) {
    const existing = DB.CellFlags.get(subId, field);
    const label = field === 'fob' ? 'FOB' : 'Factory Cost';
    const colorLabel = color.charAt(0).toUpperCase() + color.slice(1);
    showModal(`
      <div class="modal-header">
        <h2><span class="flag-swatch-inline flag-${color}"></span>${colorLabel} Flag — ${label}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <p class="text-muted text-sm">This note will be visible to the Trading Company on their quote form.</p>
        <textarea id="flag-note" class="input" rows="4" placeholder="Add a note for the TC (optional)...">${existing?.note || ''}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveCellFlag('${subId}','${field}','${color}')">Save Flag</button>
      </div>`);
  }

  function saveCellFlag(subId, field, color) {
    const note = (document.getElementById('flag-note')?.value || '').trim();
    const user = state.user;
    DB.CellFlags.set(subId, field, color, note, user.id, user.name || user.email);
    closeModal();
    renderRoute(); // re-render to show new dot
  }

  function clearCellFlag(subId, field) {
    const old = document.getElementById('flag-context-menu');
    if (old) old.remove();
    DB.CellFlags.clear(subId, field);
    renderRoute();
  }

  // ── Revision History Modal ─────────────────────────────────
  function openRevisionHistory(subId, field) {
    if (!subId) return;
    const label = field === 'fob' ? 'FOB Cost' : 'Factory Cost';
    const sub = DB.Submissions.get(subId);
    const revs = DB.Revisions.byField(subId, field);

    const rows = revs.length
      ? revs.map((r, i) => {
          const isLatest = i === revs.length - 1;
          const verLabel = i === 0 ? 'Initial' : 'Rev ' + i;
          const dt = new Date(r.submittedAt);
          const dateStr = dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                        + ' ' + dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
          return `<tr class="${isLatest ? 'revision-latest' : ''}">
            <td class="text-sm text-muted">${verLabel}${isLatest ? ' <span class="tag tag-success" style="font-size:0.65rem;padding:1px 5px">current</span>' : ''}</td>
            <td class="font-bold text-success">$${parseFloat(r.newValue).toFixed(2)}</td>
            <td class="text-sm text-muted">${r.oldValue != null ? '$' + parseFloat(r.oldValue).toFixed(2) : '—'}</td>
            <td class="text-sm">${r.submittedByName || r.submittedBy}</td>
            <td class="text-sm text-muted">${dateStr}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="5" class="text-muted text-center" style="padding:20px">No history yet.</td></tr>';

    const tcName = DB.TradingCompanies.get(sub?.tcId)?.name || sub?.tcId || '?';
    showModal(`
      <div class="modal-header">
        <h2>🕐 Quote History — ${label}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p class="text-muted text-sm mb-2">${tcName} · ${sub?.coo || ''}</p>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Version</th><th>New Value</th><th>Previous</th><th>Submitted By</th><th>Date</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>`);
  }

'''

INSERT_BEFORE = '''    openVendorBulkUpload, handleVendorDrop, handleVendorFileUpload, downloadVendorTemplate, confirmVendorUpload,'''

if INSERT_BEFORE not in c:
    print("ERROR: return block marker not found"); exit(1)

# Find position of return { line
ret_idx = c.index(INSERT_BEFORE)
# Go back to find the start of 'return {' block
# We want to insert right before this line but after the previous function ends
insert_at = ret_idx  # insert flag functions right before the return block
c = c[:insert_at] + FLAG_FUNCTIONS + c[insert_at:]
print("Inserted flag functions OK")

# Now update the return exports to include the new functions
OLD_EXPORTS = '    toggleTCCols: (colKey, programId) => AdminViews.toggleTCCols(colKey, programId),'
NEW_EXPORTS = '''    openFlagMenu, openFlagNoteModal, saveCellFlag, clearCellFlag,
    openRevisionHistory,
    toggleTCCols: (colKey, programId) => AdminViews.toggleTCCols(colKey, programId),'''

if OLD_EXPORTS not in c:
    print("ERROR: OLD_EXPORTS not found"); exit(1)
c = c.replace(OLD_EXPORTS, NEW_EXPORTS, 1)
print("Exports updated OK")

with open(f, 'w') as fh:
    fh.write(c)
print('Done')
