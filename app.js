// =============================================================
// VENDOR COST PORTAL — App Controller (app.js)
// Trading Company (TC) model: one login per TC, multiple COOs.
// =============================================================

const App = (() => {
  const $ = id => document.getElementById(id);
  const v = id => ($(`${id}`)?.value || '').trim();
  const nv = id => { const raw = ($(id)?.value||'').replace(/^\$/,''); const x = parseFloat(raw); return isNaN(x) ? null : x; };

  // ── State ──────────────────────────────────────────────────
  const state = {
    route: 'programs', routeParam: null,
    user: null,
    tcColOrder: {},   // { [programId]: [colKey, ...] } for drag-reorder
  };

  // ── Init ───────────────────────────────────────────────────
  function init() {
    DB.init();
    const saved = DB.Auth.current();
    if (saved) { state.user = saved; renderApp(); }
    else renderLogin();
  }

  // ── Routing ────────────────────────────────────────────────
  function navigate(route, param) {
    state.route = route; state.routeParam = param || null;
    renderApp();
  }

  function openProgram(id) { navigate('cost-summary', id); }
  function openCostComparison(id) { navigate('compare', id); }

  // ── Render ─────────────────────────────────────────────────
  function renderLogin() {
    const ls = document.getElementById('login-screen');
    const ml = document.getElementById('main-layout');
    if (ls) ls.style.display = '';
    if (ml) ml.style.display = 'none';
    const form = document.getElementById('login-form');
    if (form) form.onsubmit = login;
    const err = document.getElementById('login-error');
    if (err) err.style.display = 'none';
  }

  function login(e) {
    e.preventDefault();
    const emailEl = document.getElementById('login-email');
    const pwdEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const email = (emailEl?.value || '').trim();
    const password = (pwdEl?.value || '').trim();
    console.log('[Login] Attempting:', email, '/ len:', password.length);
    const user = DB.Auth.login(email, password);
    console.log('[Login] Result:', user);
    if (!user) {
      if (errEl) { errEl.style.display = ''; errEl.textContent = 'Invalid email or password'; }
      console.warn('[Login] FAILED. Users in DB:', DB.Users ? DB.Users.all() : 'no Users API');
      return;
    }
    state.user = user; renderApp();
  }


  function logout() {
    DB.Auth.logout(); state.user = null;
    const ls = document.getElementById('login-screen');
    const ml = document.getElementById('main-layout');
    if (ls) ls.style.display = '';
    if (ml) ml.style.display = 'none';
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'none';
    const form = document.getElementById('login-form');
    if (form) { form.reset(); form.onsubmit = login; }
  }

  function renderApp() {
    if (!state.user) { logout(); return; }
    const ls = document.getElementById('login-screen');
    const ml = document.getElementById('main-layout');
    if (ls) ls.style.display = 'none';
    if (ml) ml.style.display = '';

    // ── Role switcher panel (inject once, update active user indicator) ──
    if (!document.getElementById('role-switcher')) {
      const allUsers = DB.PCUsers.allStaff();
      const allTCs   = DB.TradingCompanies.all();
      const accounts = [
        ...allUsers.map(u => ({ label: u.name, sub: u.role === 'admin' ? 'Admin' : 'Production', email: u.email, password: u.password })),
        ...allTCs.map(t  => ({ label: t.name,  sub: t.code + ' · Vendor', email: t.email, password: t.password })),
      ];
      const panel = document.createElement('div');
      panel.id = 'role-switcher';
      panel._accounts = accounts;
      panel.innerHTML = `
        <button id="rs-toggle-btn" onclick="App.toggleRoleSwitcher()" title="Switch user account">👤 Switch</button>
        <div id="rs-menu" style="display:none">
          <div class="rs-menu-title">Switch Account</div>
          ${accounts.map((a, i) => `
            <button class="rs-item" onclick="App.switchToUser(${i})">
              <span class="rs-label">${a.label}</span>
              <span class="rs-sub">${a.sub}</span>
            </button>`).join('')}
        </div>`;
      document.body.appendChild(panel);
    }
    // Highlight current user in switcher
    const panel = document.getElementById('role-switcher');
    if (panel?._accounts) {
      panel.querySelectorAll('.rs-item').forEach((btn, i) => {
        btn.classList.toggle('rs-active', panel._accounts[i]?.email === state.user.email);
      });
    }

    const isAdmin = state.user.role === 'admin';
    const isPC    = state.user.role === 'pc';

    const navEl      = document.getElementById('sidebar-nav');
    const userEl     = document.getElementById('sidebar-user');
    const isPlanning = state.user.role === 'planning';
    const pendingCount = isAdmin ? DB.PendingChanges.pending().length : 0;
    const badgeHtml  = pendingCount > 0 ? `<span class="pending-badge">${pendingCount}</span>` : '';

    if (navEl) navEl.innerHTML = `
      <div class="sidebar-section"><div class="sidebar-section-label">Navigation</div></div>
      <div style="padding:0 8px">
      ${(isAdmin || isPC) ? `
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'programs' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
        <button class="nav-item ${state.route === 'cross-program' ? 'active' : ''}" onclick="App.navigate('cross-program')"><span class="icon">🌐</span> All Open Programs</button>
        <div class="sidebar-section"><div class="sidebar-section-label">Settings</div></div>
        <button class="nav-item ${state.route === 'trading-companies' ? 'active' : ''}" onclick="App.navigate('trading-companies')"><span class="icon">🏣</span> Trading Companies</button>
        <button class="nav-item ${state.route === 'customers' ? 'active' : ''}" onclick="App.navigate('customers')"><span class="icon">👥</span> Customers</button>
        <button class="nav-item ${state.route === 'internal' ? 'active' : ''}" onclick="App.navigate('internal')"><span class="icon">📊</span> Internal Programs</button>
        <button class="nav-item ${state.route === 'coo' ? 'active' : ''}" onclick="App.navigate('coo')"><span class="icon">🌍</span> COO Rates</button>
        ${isAdmin ? `
          <button class="nav-item ${state.route === 'pending-changes' ? 'active' : ''}" onclick="App.navigate('pending-changes')">
            <span class="icon">🔔</span> Pending Changes ${badgeHtml}
          </button>
          <button class="nav-item ${state.route === 'staff' ? 'active' : ''}" onclick="App.navigate('staff')"><span class="icon">👤</span> Staff</button>
        ` : ''}
      ` : isPlanning ? `
        <button class="nav-item ${state.route === 'programs' || state.route === 'buy-summary' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
      ` : `
        <button class="nav-item ${
          state.route === '' || state.route === 'vendor-home' || state.route === 'vendor-program' ? 'active' : ''
        }" onclick="App.navigate('')"><span class="icon">🏠</span> My Programs</button>
        <button class="nav-item ${state.route === 'my-styles' ? 'active' : ''}" onclick="App.navigate('my-styles')"><span class="icon">📋</span> All Styles</button>
        <div class="sidebar-section"><div class="sidebar-section-label">Account</div></div>
        <button class="nav-item ${state.route === 'my-company' ? 'active' : ''}" onclick="App.navigate('my-company')"><span class="icon">🏣</span> My Company</button>
      `}
      </div>`;

    if (userEl) userEl.innerHTML = `
      <div class="user-info" onclick="App.logout()" title="Sign out">
        <div class="user-avatar">${state.user.name.charAt(0).toUpperCase()}</div>
        <div><div class="user-name">${state.user.name}</div><div class="user-role">${isAdmin ? 'Admin' : isPC ? 'Production Coordinator' : isPlanning ? 'Planning & Sales' : 'Trading Co.'}</div></div>
      </div>`;

    renderRoute();
  }

  function renderRoute() {
    const mc = document.getElementById('content'); if (!mc) return;
    const { route, routeParam, user } = state;
    const isAdmin    = user.role === 'admin';
    const isPC       = user.role === 'pc';
    const isPlanning = user.role === 'planning';
    if (isAdmin || isPC) {
      // Shared program & cost views — both roles
      if (route === 'dashboard')     mc.innerHTML = AdminViews.renderDashboard(user.role);
      else if (route === 'programs')      mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'styles')        mc.innerHTML = AdminViews.renderStyleManager(routeParam);
      else if (route === 'cost-summary')  mc.innerHTML = AdminViews.renderCostSummary(routeParam);
      else if (route === 'buy-summary')   mc.innerHTML = AdminViews.renderBuySummary(routeParam, user.role);
      else if (route === 'compare')       mc.innerHTML = AdminViews.renderCostComparison(routeParam);
      else if (route === 'cross-program') mc.innerHTML = AdminViews.renderCrossProgram();
      // Settings — Admin gets full CRUD; PC gets propose-mode
      else if (route === 'trading-companies') mc.innerHTML = isAdmin ? AdminViews.renderTradingCompanies() : AdminViews.renderTradingCompaniesPC();
      else if (route === 'customers')         mc.innerHTML = isAdmin ? AdminViews.renderCustomers() : mc.innerHTML;
      else if (route === 'internal')          mc.innerHTML = isAdmin ? AdminViews.renderInternalPrograms()  : AdminViews.renderInternalProgramsPC();
      else if (route === 'coo')               mc.innerHTML = isAdmin ? AdminViews.renderCOO()               : AdminViews.renderCOOPC();
      // Admin-only routes
      else if (route === 'pending-changes' && isAdmin) mc.innerHTML = AdminViews.renderPendingChanges();
      else if (route === 'staff'           && isAdmin) mc.innerHTML = AdminViews.renderStaff();
      else mc.innerHTML = AdminViews.renderDashboard(user.role);
    } else if (isPlanning) {
      // Planning/Sales — can view programs + buy summaries only
      if (route === 'programs')    mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'buy-summary') mc.innerHTML = AdminViews.renderBuySummary(routeParam, user.role);
      else mc.innerHTML = AdminViews.renderPrograms();
    } else {
      // TC / Vendor routes — guard against admin route access
      const tcForbidden = ['programs','styles','cost-summary','compare','cross-program',
        'trading-companies','internal','coo','pending-changes','staff','buy-summary','customers'];
      if (tcForbidden.includes(route)) { navigate(''); return; }

      if      (route === 'vendor-program')   mc.innerHTML = VendorViews.renderProgramStyles(user.tcId, routeParam);
      else if (route === 'my-styles')        mc.innerHTML = VendorViews.renderMyStyles(user.tcId);
      else if (route === 'my-company')       mc.innerHTML = VendorViews.renderMyCompany(user.tcId);
      else                                   mc.innerHTML = VendorViews.renderPrograms(user.tcId);
    }
    // Post-render setup
    setTimeout(() => {
      initResizableColumns(document.getElementById('style-table'));
      initResizableColumns(document.getElementById('cost-summary-table'));
      initResizableColumns(document.getElementById('cp-table'));
      setupColumnToggles('style-table-controls', 'style-table');
      setupColumnToggles('summary-table-controls', 'cost-summary-table');
      setupColumnToggles('cp-table-controls', 'cp-table');
      initVendorDragDrop(routeParam);
    }, 0);
  }

  // ── Column Resize ──────────────────────────────────────────
  function initResizableColumns(table) {
    if (!table || table.dataset.resizable) return;
    table.dataset.resizable = '1';
    table.querySelectorAll('thead th').forEach(th => {
      if (th.querySelector('.col-resizer')) return;
      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      th.appendChild(resizer);
      let startX, startW;
      resizer.addEventListener('mousedown', e => {
        e.stopPropagation();
        startX = e.clientX; startW = th.offsetWidth;
        const onMove = ev => { th.style.width = Math.max(60, startW + ev.clientX - startX) + 'px'; th.style.minWidth = th.style.width; };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  // ── Column Show/Hide ───────────────────────────────────────
  function setupColumnToggles(controlsId, tableId) {
    const controls = $(controlsId); const table = $(tableId);
    if (!controls || !table) return;
    const ths = [...table.querySelectorAll('thead th[data-col]')];
    if (!ths.length) return;
    const btn = document.createElement('button');
    btn.className = 'col-toggle-btn'; btn.textContent = '☰ Columns';
    const panel = document.createElement('div');
    panel.className = 'col-toggle-panel hidden';
    ths.forEach(th => {
      const col = th.dataset.col; const label = th.textContent.trim().split('\n')[0].trim();
      if (!label || !col) return;
      const item = document.createElement('label');
      item.className = 'col-toggle-item';
      item.innerHTML = `<input type="checkbox" checked> ${label}`;
      item.querySelector('input').onchange = function () {
        const show = this.checked;
        table.querySelectorAll(`th[data-col="${col}"], td[data-col="${col}"]`).forEach(cell => {
          cell.style.display = show ? '' : 'none';
        });
      };
      panel.appendChild(item);
    });
    btn.onclick = e => { e.stopPropagation(); panel.classList.toggle('hidden'); };
    document.addEventListener('click', () => panel.classList.add('hidden'), { once: false });
    controls.appendChild(btn); controls.appendChild(panel);
  }

  // ── Vendor Column Drag-to-Reorder ──────────────────────────
  function initVendorDragDrop(programId) {
    const table = $('cost-summary-table'); if (!table || !programId) return;
    let dragKey = null;
    table.querySelectorAll('.vendor-group-hdr[data-colkey]').forEach(th => {
      th.addEventListener('dragstart', e => { dragKey = th.dataset.colkey; th.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      th.addEventListener('dragend', () => { th.classList.remove('dragging'); dragKey = null; });
      th.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; th.classList.add('drag-over'); });
      th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
      th.addEventListener('drop', e => {
        e.preventDefault(); th.classList.remove('drag-over');
        if (!dragKey || dragKey === th.dataset.colkey) return;
        // Re-order colGroups and re-render
        const prog = DB.Programs.get(programId);
        const styles = DB.Styles.byProgram(programId);
        const asgns = DB.Assignments.byProgram(programId);
        const tcs = asgns.map(a => a.tc).filter(Boolean);
        let colGroups = tcs.flatMap(tc => tc.coos.map(coo => ({ tc, coo })));
        // Apply saved order if any
        const savedOrder = state.tcColOrder[programId];
        if (savedOrder) colGroups = savedOrder.map(k => colGroups.find(g => `${g.tc.id}_${g.coo}` === k)).filter(Boolean);
        const fromIdx = colGroups.findIndex(g => `${g.tc.id}_${g.coo}` === dragKey);
        const toIdx = colGroups.findIndex(g => `${g.tc.id}_${g.coo}` === th.dataset.colkey);
        if (fromIdx < 0 || toIdx < 0) return;
        colGroups.splice(toIdx, 0, colGroups.splice(fromIdx, 1)[0]);
        state.tcColOrder[programId] = colGroups.map(g => `${g.tc.id}_${g.coo}`);
        // Re-render only the table
        const sortBy  = document.getElementById('cs-sort-by')?.value  || '';
        const groupBy = document.getElementById('cs-group-by')?.value || '';
        const wrap = $('summary-table-wrap');
        if (wrap) wrap.innerHTML = AdminViews.buildCostMatrix(styles, colGroups, prog, programId, sortBy, groupBy);
        initResizableColumns($('cost-summary-table'));
        initVendorDragDrop(programId);
      });
    });
  }

  // ── Modals ─────────────────────────────────────────────────
  function showModal(html, cls = '') {
    $('modal-overlay').classList.remove('hidden');
    const box = $('modal-box');
    box.className = cls ? `modal ${cls}` : 'modal';
    box.innerHTML = html;
  }
  function closeModal() {
    $('modal-overlay').classList.add('hidden');
    const box = $('modal-box');
    box.className = 'modal hidden';
    box.innerHTML = '';
  }
  function closeModalOutside(e) {
    // Only close when clicking the backdrop, not the modal box itself
    if (e.target === $('modal-overlay')) closeModal();
  }

  // ── Programs ───────────────────────────────────────────────
  function openProgramModal(id) {
    const p = id ? DB.Programs.get(id) : null;
    const ips = DB.InternalPrograms.all();
    const seasons = ['N/A', 'Q1', 'Q2', 'Q3', 'Q4'];
    const years = ['2026', '2027', '2028', '2029', '2030'];
    showModal(`
    <div class="modal-header"><h2>${p ? 'Edit' : 'New'} Program</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveProgramModal(event,'${id || ''}')">
      <div class="form-group">
        <label class="form-label">Brand *</label>
        <select class="form-select" id="pm-ip" onchange="App.onInternalProgramChange()" required>
          <option value="">Select brand…</option>
          ${ips.map(ip => `<option value="${ip.id}" ${p?.internalProgramId === ip.id ? 'selected' : ''}>${ip.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Season</label>
          <select class="form-select" id="pm-season">
            ${seasons.map(s => `<option value="${s}" ${(p?.season || 'N/A') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Year</label>
          <select class="form-select" id="pm-year">
            ${years.map(y => `<option value="${y}" ${(p?.year || '2026') === y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Retailer</label><input class="form-input" id="pm-retailer" value="${p?.retailer || ''}"></div>
        <div class="form-group"><label class="form-label">Market</label>
          <select class="form-select" id="pm-market">
            ${['USA', 'Canada'].map(m => `<option ${(p?.market || 'USA') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="pm-status">
          ${['Costing', 'Placed', 'Cancelled'].map(s => `<option ${(p?.status || 'Costing') === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label class="form-label">Start Date</label>
          <div class="date-picker-wrap">
            <input class="form-input" type="date" id="pm-start-date" value="${p?.startDate || ''}" onclick="this.showPicker&&this.showPicker()">
            <button type="button" class="date-picker-icon" onclick="document.getElementById('pm-start-date').showPicker&&document.getElementById('pm-start-date').showPicker()" tabindex="-1">📅</button>
          </div></div>
        <div class="form-group"><label class="form-label">End Date *</label>
          <div class="date-picker-wrap">
            <input class="form-input" type="date" id="pm-end-date" value="${p?.endDate || ''}" required onclick="this.showPicker&&this.showPicker()">
            <button type="button" class="date-picker-icon" onclick="document.getElementById('pm-end-date').showPicker&&document.getElementById('pm-end-date').showPicker()" tabindex="-1">📅</button>
          </div></div>
        <div class="form-group"><label class="form-label">1st CRD Needed</label>
          <div class="date-picker-wrap">
            <input class="form-input" type="date" id="pm-crd" value="${p?.crdDate || ''}" onclick="this.showPicker&&this.showPicker()">
            <button type="button" class="date-picker-icon" onclick="document.getElementById('pm-crd').showPicker&&document.getElementById('pm-crd').showPicker()" tabindex="-1">📅</button>
          </div></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${p ? 'Save' : 'Create'}</button>
      </div>
    </form>`, 'modal-lg');
    if (p?.internalProgramId) onInternalProgramChange(p.internalProgramId);
  }

  function onInternalProgramChange(ipId) {
    const id = ipId || v('pm-ip'); if (!id) return;
  }

  function saveProgramModal(e, id) {
    e.preventDefault();
    const ipId = v('pm-ip');
    const ip = DB.InternalPrograms.get(ipId);
    const data = {
      internalProgramId: ipId,
      name: ip?.name || 'New Program',
      targetMargin: ip?.targetMargin || 0,
      season: v('pm-season'),
      year: v('pm-year'),
      retailer: v('pm-retailer'),
      market: v('pm-market'),
      status: v('pm-status'),
      startDate: v('pm-start-date') || null,
      endDate: v('pm-end-date') || null,
      crdDate: v('pm-crd') || null,
    };
    if (id) DB.Programs.update(id, data); else DB.Programs.create(data);
    closeModal(); navigate('programs');
  }

  function updateProgramStatus(id, status) { DB.Programs.update(id, { status }); navigate('programs'); }
  function deleteProgram(id) { if (confirm('Delete this program?')) { DB.Programs.delete(id); navigate('programs'); } }

  // ── Styles ─────────────────────────────────────────────────
  function openStyleModal(programId, styleId) {
    const s = styleId ? DB.Styles.get(styleId) : null;
    const prog = DB.Programs.get(programId);
    const cooRates = DB.CooRates.all();
    showModal(`
    <div class="modal-header"><h2>${s ? 'Edit' : 'Add'} Style</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveStyle(event,'${programId}','${styleId || ''}')">
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Style # *</label><input class="form-input" id="s-num" value="${s?.styleNumber || ''}" required></div>
        <div class="form-group"><label class="form-label">Style Name *</label><input class="form-input" id="s-name" value="${s?.styleName || ''}" required></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="s-cat" value="${s?.category || ''}"></div>
        <div class="form-group"><label class="form-label">Fabrication</label><input class="form-input" id="s-fab" value="${s?.fabrication || ''}"></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Proj Qty</label><input class="form-input" id="s-qty" type="number" value="${s?.projQty || ''}" oninput="App.previewTargetLDP()"></div>
        <div class="form-group"><label class="form-label">Proj Sell Price ($)</label><input class="form-input" id="s-sell" type="number" step="0.01" value="${s?.projSellPrice || ''}" oninput="App.previewTargetLDP()"></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Base Duty Rate (decimal)</label><input class="form-input" id="s-duty" type="number" step="0.001" value="${s?.dutyRate || ''}" placeholder="e.g. 0.282"></div>
        <div class="form-group"><label class="form-label">Special Pkg ($/unit)</label><input class="form-input" id="s-spkg" type="number" step="0.01" value="${s?.specialPackaging || ''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Market</label>
        <select class="form-select" id="s-market">${['USA', 'Canada'].map(m => `<option ${(s?.market || prog?.market || 'USA') === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
      <div id="s-ldp-preview" class="alert alert-info" style="display:none"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${s ? 'Save' : 'Add Style'}</button>
      </div>
    </form>`, 'modal-lg');
    previewTargetLDP();
  }

  function previewTargetLDP() {
    const sell = nv('s-sell'); const prog = DB.Programs.get(state.routeParam);
    const el = $('s-ldp-preview'); if (!el) return;
    if (sell && prog?.targetMargin) {
      const ldp = (sell * prog.targetMargin).toFixed(2);
      el.style.display = ''; el.textContent = `Target LDP: $${ldp}`;
    } else { el.style.display = 'none'; }
  }

  function saveStyle(e, programId, styleId) {
    e.preventDefault();
    const data = { programId, styleNumber: v('s-num'), styleName: v('s-name'), category: v('s-cat'), fabrication: v('s-fab'), projQty: nv('s-qty'), projSellPrice: nv('s-sell'), dutyRate: nv('s-duty'), specialPackaging: nv('s-spkg'), market: v('s-market') };
    if (styleId) DB.Styles.update(styleId, data); else DB.Styles.create(data);
    closeModal(); navigate(state.route, state.routeParam);
  }

  function deleteStyle(id) { if (confirm('Delete style?')) { DB.Styles.delete(id); navigate(state.route, state.routeParam); } }

  // ── Trading Company Assignment ─────────────────────────────
  function openAssignTCs(programId) {
    const tcs = DB.TradingCompanies.all();
    const assigned = DB.Assignments.byProgram(programId).map(a => a.tcId);
    showModal(`
    <div class="modal-header"><h2>🏭 Assign Trading Companies</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <p class="mb-3">Select which trading companies to share this program with. Each TC sees all their assigned styles and can quote from any of their COOs.</p>
    <div id="tc-chips" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
      ${tcs.map(tc => `
      <div data-tcid="${tc.id}" class="vendor-chip ${assigned.includes(tc.id) ? 'selected' : ''}"
           onclick="this.classList.toggle('selected')">
        <strong>${tc.code}</strong><br>
        <span class="text-muted text-sm">${tc.name}</span><br>
        <span class="text-muted" style="font-size:0.7rem">${(tc.coos || []).join(', ')}</span>
      </div>`).join('')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.saveAssignments('${programId}')">Save</button>
    </div>`);
  }

  function saveAssignments(programId) {
    const tcIds = [...document.querySelectorAll('#tc-chips div[data-tcid].selected')].map(el => el.dataset.tcid);
    DB.Assignments.assign(programId, tcIds);
    closeModal(); navigate(state.route, state.routeParam);
  }

  // ── Trading Company CRUD ────────────────────────────────────
  function openTCModal(id) {
    const tc = id ? DB.TradingCompanies.get(id) : null;
    const cooRates = DB.CooRates.all();
    const TERMS_LIST = ['FOB', 'CIF', 'First Sale', 'FCA', 'Duty Free', 'CPTPP'];
    showModal(`
    <div class="modal-header"><h2>${tc ? 'Edit' : 'Add'} Trading Company</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveTC(event,'${id || ''}')">
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Code *</label><input class="form-input" id="tc-code" value="${tc?.code || ''}" required placeholder="e.g. SHK"></div>
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="tc-name" value="${tc?.name || ''}" required placeholder="Full company name"></div>
      </div>
      <div class="form-group"><label class="form-label">COOs (select all that apply)</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="tc-coo-chips">
          ${cooRates.map(r => `<label style="display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.8rem">
            <input type="checkbox" value="${r.code}" ${(tc?.coos || []).includes(r.code) ? 'checked' : ''}> ${r.code} — ${r.country}
          </label>`).join('')}
        </div>
      </div>
      <div class="form-group"><label class="form-label">Default Payment Terms</label>
        <select class="form-select" id="tc-terms">${TERMS_LIST.map(t => `<option${(tc?.paymentTerms || 'FOB') === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <div class="text-sm text-muted mt-1">Applied to all styles for this trading company in the cost matrix</div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">Login Email *</label><input class="form-input" id="tc-email" type="email" value="${tc?.email || ''}" required></div>
        <div class="form-group"><label class="form-label">Password ${tc ? '' : '*'}</label><input class="form-input" id="tc-pwd" type="password" value="${tc?.password || ''}" ${tc ? '' : 'required'} placeholder="${tc ? 'Leave blank to keep current' : '••••••••'}"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${tc ? 'Save' : 'Add'}</button>
      </div>
    </form>`, 'modal-lg');
  }

  function saveTC(e, id) {
    e.preventDefault();
    const coos = [...document.querySelectorAll('#tc-coo-chips input:checked')].map(cb => cb.value);
    const data = { code: v('tc-code'), name: v('tc-name'), email: v('tc-email'), coos, paymentTerms: v('tc-terms') || 'FOB', ...(v('tc-pwd') ? { password: v('tc-pwd') } : {}) };
    if (id) DB.TradingCompanies.update(id, data); else DB.TradingCompanies.create(data);
    closeModal(); navigate('trading-companies');
  }

  function deleteTC(id) { if (confirm('Delete trading company?')) { DB.TradingCompanies.delete(id); navigate('trading-companies'); } }

  // ── Bulk Style Upload ──────────────────────────────────────
  function openUploadModal(programId) {
    showModal(`
    <div class="modal-header"><h2>📤 Upload Styles</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <div class="upload-zone" id="upload-zone" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="App.handleDrop(event,'${programId}')">
      <input type="file" accept=".csv" onchange="App.handleFileUpload(event,'${programId}')">
      <div class="upload-icon">📄</div>
      <p class="font-bold" style="color:var(--text-primary)">Drop CSV here or click to browse</p>
    </div>
    <div id="upload-preview" class="mt-3"></div>`, 'modal-lg');
  }

  function handleDrop(e, programId) {
    e.preventDefault(); $('upload-zone')?.classList.remove('dragover');
    const file = e.dataTransfer.files[0]; if (file) processUpload(file, programId);
  }
  function handleFileUpload(e, programId) { const file = e.target.files[0]; if (file) processUpload(file, programId); }

  let _pendingRows = null;
  function processUpload(file, programId) {
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = DB.parseCSV(ev.target.result).map(DB.csvRowToStyle).filter(r => r.styleNumber);
      _pendingRows = rows;
      const el = $('upload-preview'); if (!el) return;
      if (!rows.length) { el.innerHTML = '<div class="alert alert-danger">No valid rows found.</div>'; return; }
      el.innerHTML = `<div class="alert alert-info">✓ ${rows.length} styles found</div>
      <div class="table-wrap"><table><thead><tr><th>Style #</th><th>Style Name</th><th>Qty</th><th>Sell Price</th></tr></thead>
      <tbody>${rows.slice(0, 6).map(r => `<tr><td class="primary">${r.styleNumber}</td><td>${r.styleName}</td><td>${r.projQty || '—'}</td><td>${r.projSellPrice ? '$' + r.projSellPrice : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${rows.length > 6 ? `<p class="text-sm text-muted mt-1">…and ${rows.length - 6} more</p>` : ''}
      <div class="modal-footer"><button class="btn btn-primary" onclick="App.confirmUpload('${programId}')">Import ${rows.length} Styles</button></div>`;
    };
    reader.readAsText(file);
  }

  function confirmUpload(programId) {
    if (!_pendingRows?.length) return;
    DB.Styles.bulkCreate(programId, _pendingRows); _pendingRows = null;
    closeModal(); navigate('styles', programId);
  }

  function downloadTemplate() {
    const hdrs = 'Style #,Style Name,Category,Main Fabrication,Proj Qty,Proj Sell Price,Duty Rate,Est Base Freight,Special Packaging';
    const sample = 'HEW243TL01C,Running Short,Bottom,88% Poly 12% Spandex,12000,8.00,0.282,0.20,0.00';
    const blob = new Blob([hdrs + '\n' + sample], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'style_template.csv'; a.click();
  }

  // ── TC inline cell save (FOB / Factory Cost) ───────────────
  function saveVendorCellInline(styleId, tcId, coo, field, inputEl) {
    const raw = (inputEl.value || '').replace(/^\$/, '').trim();
    const value = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && isNaN(value)) return; // invalid — don't save

    const existing = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    const oldValue = existing?.[field] ?? null;
    const hasChanged = value !== null && String(value) !== String(oldValue);

    const doSave = (reason) => {
      const updateData = existing
        ? { ...existing, [field]: value }
        : { tcId, styleId, coo, [field]: value };
      if (value != null && updateData.status === 'skipped') delete updateData.status;
      const user = state.user;
      const sub = DB.Submissions.upsert(updateData, user?.name || user?.email);
      // Patch reason + submittedByName into the revision entry that upsert just wrote
      if (hasChanged && sub?.id && reason) {
        const revs = JSON.parse(localStorage.getItem('vcp_revisions') || '[]');
        // Find the most recent entry for this sub+field (the one just written)
        let lastIdx = -1;
        for (let i = revs.length - 1; i >= 0; i--) {
          if (revs[i].subId === sub.id && revs[i].field === field && !revs[i].type) { lastIdx = i; break; }
        }
        if (lastIdx >= 0) {
          revs[lastIdx].reason = reason;
          revs[lastIdx].submittedByName = user?.name || user?.email || revs[lastIdx].submittedByName;
          localStorage.setItem('vcp_revisions', JSON.stringify(revs));
        }
      }
      if (value != null) inputEl.value = '$' + value.toFixed(2);
    };

    if (hasChanged && oldValue !== null) {
      // Prompt for reason
      closeCellMenu();
      const menu = document.createElement('div');
      menu.id = 'cell-highlight-menu';
      menu.style.cssText = `position:fixed;z-index:9998;bottom:80px;right:24px;
        background:rgba(18,18,32,0.97);border:1px solid rgba(255,255,255,0.12);border-radius:10px;
        padding:14px;min-width:260px;box-shadow:0 8px 32px rgba(0,0,0,.55);backdrop-filter:blur(12px);font-family:var(--font);`;
      menu.innerHTML = `
        <div style="font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Reason for price change?</div>
        <input id="price-change-reason" class="form-input" style="width:100%;margin-bottom:8px" placeholder="e.g. Material cost update (optional)">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="cm-item" style="width:auto;padding:5px 12px" onclick="document.getElementById('cell-highlight-menu')?.remove();App._pendingSave()">Skip</button>
          <button class="cm-item" style="width:auto;padding:5px 12px;background:rgba(99,102,241,.2)" onclick="App._pendingSave(document.getElementById('price-change-reason')?.value)">Save</button>
        </div>`;
      document.body.appendChild(menu);
      App._pendingSave = (reason) => { closeCellMenu(); doSave(reason || ''); };
      setTimeout(() => document.getElementById('price-change-reason')?.focus(), 50);
    } else {
      doSave('');
    }
  }

  // ── TC Skip / Un-skip a COO ────────────────────────────────
  function openSkipVendorCoo(styleId, tcId, coo) {
    const existing = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    const currentReason = existing?.skipReason || '';
    showModal(`
      <div class="modal-header" style="display:block;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2>⊘ Skip ${coo} for this Style</h2>
          <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
        </div>
        <p class="text-sm text-muted mt-1">Skipping removes this COO from your quote. Please provide a reason so Production can review.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Reason for Skipping *</label>
        <textarea class="form-textarea" id="skip-reason-input" rows="3" placeholder="e.g. Cannot source this fabrication in ${coo}, MOQ too low at expected price…">${currentReason}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="App.confirmSkipVendorCoo('${styleId}','${tcId}','${coo}')">Confirm Skip</button>
      </div>`);
  }

  function confirmSkipVendorCoo(styleId, tcId, coo) {
    const reasonEl = document.getElementById('skip-reason-input');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) { reasonEl?.classList.add('input-error'); return; }
    const existing = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    DB.Submissions.upsert({ ...(existing || { tcId, styleId, coo }), status: 'skipped', skipReason: reason, fob: null, factoryCost: null });
    closeModal();
    navigate(state.route, state.routeParam);
  }

  function unskipVendorCoo(styleId, tcId, coo) {
    const existing = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    if (existing) DB.Submissions.upsert({ ...existing, status: 'pending', skipReason: null, fob: null, factoryCost: null });
    navigate(state.route, state.routeParam);
  }


  // ── Vendor (TC) Bulk Quote Upload ──────────────────────────
  // ── Vendor Navigation ─────────────────────────────────────
  function navigateVendorHome(tcId) { navigate('vendor-home'); }
  function navigateVendorProgram(tcId, programId) { navigate('vendor-program', programId); }
  function navigateVendorAllStyles(tcId) { navigate('my-styles'); }

  function openVendorBulkUpload(tcId) { showModal(VendorViews.bulkUploadForm(tcId), 'modal-lg'); }


  function handleVendorDrop(e, tcId) {
    e.preventDefault(); $('vendor-upload-zone')?.classList.remove('dragover');
    const file = e.dataTransfer.files[0]; if (file) processVendorUpload(file, tcId);
  }
  function handleVendorFileUpload(e, tcId) { const file = e.target.files[0]; if (file) processVendorUpload(file, tcId); }

  function downloadVendorTemplate(tcId) {
    const styles = DB.Assignments.stylesByTc(tcId);
    const tc = DB.TradingCompanies.get(tcId);
    const hdrs = 'Style #,Style Name,COO,FOB,Factory Cost,TC Markup %,Payment Terms,MOQ,Lead Time (days),Comments';
    const rows = styles.map(s => `${s.styleNumber},${s.styleName},${(tc?.coos || [])[0] || ''},,,,,,,`);
    const blob = new Blob([hdrs + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quote_template.csv'; a.click();
  }

  let _pendingVendorRows = null;
  function processVendorUpload(file, tcId) {
    const reader = new FileReader();
    reader.onload = ev => {
      const tc = DB.TradingCompanies.get(tcId);
      const styles = DB.Assignments.stylesByTc(tcId);
      const csvRows = DB.parseCSV(ev.target.result);
      const el = $('vendor-upload-preview'); if (!el) return;
      if (!csvRows.length) { el.innerHTML = '<div class="alert alert-danger">No rows found.</div>'; return; }
      const matched = [], unmatched = [];
      csvRows.forEach(row => {
        const styleNum = (row['Style #'] || row['Style Number'] || '').trim();
        const style = styles.find(s => s.styleNumber.trim().toLowerCase() === styleNum.toLowerCase());
        if (!style) { if (styleNum) unmatched.push(styleNum); return; }
        const n = k => { const x = parseFloat(row[k]); return isNaN(x) ? null : x; };
        const coo = (row['COO'] || '').trim() || (tc?.coos || [])[0] || '';
        matched.push({
          styleId: style.id, styleNumber: style.styleNumber, styleName: style.styleName,
          coo, fob: n('FOB'), factoryCost: n('Factory Cost'), tcMarkup: n('TC Markup %') != null ? n('TC Markup %') / 100 : null,
          paymentTerms: row['Payment Terms']?.trim() || '', moq: n('MOQ'), leadTime: n('Lead Time (days)'), vendorComments: row['Comments']?.trim() || ''
        });
      });
      _pendingVendorRows = matched;
      el.innerHTML = `
        ${matched.length ? `<div class="alert alert-info">✓ ${matched.length} matched</div>` : ''}
        ${unmatched.length ? `<div class="alert alert-warning">⚠ Not found: ${unmatched.slice(0, 4).join(', ')}</div>` : ''}
        ${matched.length ? `<div class="table-wrap"><table><thead><tr><th>Style #</th><th>Style Name</th><th>COO</th><th>FOB</th></tr></thead>
        <tbody>${matched.slice(0, 6).map(r => `<tr><td class="primary">${r.styleNumber}</td><td>${r.styleName}</td><td>${r.coo || '—'}</td><td class="font-bold">${r.fob != null ? '$' + r.fob.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div>
        ${matched.length > 6 ? `<p class="text-sm text-muted mt-1">and ${matched.length - 6} more</p>` : ''}
        <div class="modal-footer"><button class="btn btn-primary" onclick="App.confirmVendorUpload('${tcId}')">Submit ${matched.length} Quote(s)</button></div>` : ''}`;
    };
    reader.readAsText(file);
  }

  function confirmVendorUpload(tcId) {
    if (!_pendingVendorRows?.length) return;
    _pendingVendorRows.forEach(row => DB.Submissions.upsert({ tcId, styleId: row.styleId, coo: row.coo, fob: row.fob, factoryCost: row.factoryCost, tcMarkup: row.tcMarkup, paymentTerms: row.paymentTerms, moq: row.moq, leadTime: row.leadTime, vendorComments: row.vendorComments }));
    _pendingVendorRows = null; closeModal(); navigate('my-styles');
  }

  // ── Internal Programs ──────────────────────────────────────
  function openInternalProgramModal(id) {
    const ip = id ? DB.InternalPrograms.get(id) : null;
    showModal(`
    <div class="modal-header"><h2>${ip ? 'Edit' : 'Add'} Internal Program</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveInternalProgram(event,'${id || ''}')">
      <div class="form-group"><label class="form-label">Program Name *</label><input class="form-input" id="ip-name" value="${ip?.name || ''}" required></div>
      <div class="form-group"><label class="form-label">Target Margin % *</label><input class="form-input" id="ip-margin" type="number" step="0.1" min="0" max="100" value="${ip ? (ip.targetMargin * 100).toFixed(1) : ''}" required placeholder="e.g. 55 = 55%"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${ip ? 'Save' : 'Add'}</button>
      </div>
    </form>`);
  }

  function saveInternalProgram(e, id) {
    e.preventDefault();
    DB.InternalPrograms.upsert({ id: id || undefined, name: v('ip-name'), targetMargin: nv('ip-margin') / 100 });
    closeModal(); navigate('internal');
  }
  function deleteInternalProgram(id) { if (confirm('Delete?')) { DB.InternalPrograms.delete(id); navigate('internal'); } }

  // ── COO Rates ──────────────────────────────────────────────
  function openCooModal(id) {
    const r = id ? DB.CooRates.get(id) : null;
    showModal(`
    <div class="modal-header"><h2>${r ? 'Edit' : 'Add'} COO Rate</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveCoo(event,'${id || ''}')">
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">COO Code *</label><input class="form-input" id="cr-code" value="${r?.code || ''}" required ${r ? 'readonly' : ''}></div>
        <div class="form-group"><label class="form-label">Country *</label><input class="form-input" id="cr-country" value="${r?.country || ''}" required></div>
      </div>
      <div class="form-group"><label class="form-label">Additional Duty Rate (decimal)</label><input class="form-input" id="cr-duty" type="number" step="0.001" value="${r?.addlDuty || ''}" placeholder="e.g. 0.190 = 19%"></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">USA Freight Multiplier</label><input class="form-input" id="cr-usa-mult" type="number" step="0.0001" value="${r?.usaMult ?? ''}" placeholder="e.g. 1.5">
          <div class="text-sm text-muted mt-1">Freight/unit = Est Base × (1 + multiplier)</div></div>
        <div class="form-group"><label class="form-label">Canada Freight Multiplier</label><input class="form-input" id="cr-can-mult" type="number" step="0.0001" value="${r?.canadaMult ?? ''}" placeholder="e.g. 1.5714"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${r ? 'Save' : 'Add'}</button>
      </div>
    </form>`, 'modal-lg');
  }

  function saveCoo(e, id) {
    e.preventDefault();
    const usaMult  = parseFloat(document.getElementById('cr-usa-mult')?.value);
    const canMult  = parseFloat(document.getElementById('cr-can-mult')?.value);
    DB.CooRates.upsert({
      id: v('cr-code'), code: v('cr-code'), country: v('cr-country'),
      addlDuty: nv('cr-duty') || 0,
      usaMult:  isNaN(usaMult)  ? 0 : usaMult,
      canadaMult: isNaN(canMult) ? 0 : canMult,
    });
    closeModal(); navigate('coo');
  }

  // ── Buy Summary ─────────────────────────────────────────────
  function saveBuyInline(styleId, customerId, programId, field, el) {
    const raw = parseFloat(el.value.replace(/[^0-9.]/g, ''));
    const val = isNaN(raw) ? null : raw;
    if (val === null && !el.value.trim()) {
      DB.CustomerBuys.delete(programId, styleId, customerId);
    } else if (val !== null) {
      DB.CustomerBuys.upsert({ programId, styleId, customerId, [field]: val });
    }
    // refresh totals without full re-render
    const row = el.closest('tr');
    if (row) {
      const inputs = [...row.querySelectorAll('input')];
      const qtyInputs  = inputs.filter((_, i) => i % 2 === 0);
      const sellInputs = inputs.filter((_, i) => i % 2 === 1);
      let totalQty = 0, revenue = 0;
      qtyInputs.forEach((qi, i) => {
        const q = parseFloat(qi.value.replace(/[^0-9.]/g, '')) || 0;
        const s = parseFloat(sellInputs[i]?.value.replace(/[^0-9.]/g, '')) || 0;
        totalQty += q; revenue += q * s;
      });
      const totalTd = row.querySelector('td[data-col="total-qty"]');
      const avgTd   = row.querySelector('td[data-col="avg-sell"]');
      if (totalTd) totalTd.textContent = totalQty > 0 ? totalQty.toLocaleString() : '—';
      if (avgTd)   avgTd.textContent   = totalQty > 0 ? '$' + (revenue / totalQty).toFixed(2) : '—';
    }
  }

  // ── Customer CRUD ────────────────────────────────────────────
  function openCustomerModal(id) {
    const c = id ? DB.Customers.get(id) : null;
    showModal(`
      <div class="modal-header"><h2>${c ? 'Edit' : 'New'} Customer</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <form onsubmit="App.saveCustomer(event,'${id || ''}')">
        <div class="form-row form-row-2">
          <div class="form-group"><label class="form-label">Code *</label>
            <input class="form-input" id="cust-code" value="${c?.code || ''}" placeholder="e.g. WMT" required></div>
          <div class="form-group"><label class="form-label">Name *</label>
            <input class="form-input" id="cust-name" value="${c?.name || ''}" placeholder="e.g. Walmart" required></div>
        </div>
        <div class="modal-footer">
          ${id ? `<button type="button" class="btn btn-danger" onclick="App.deleteCustomer('${id}')">Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${c ? 'Save' : 'Create'}</button>
        </div>
      </form>`);
  }

  function saveCustomer(e, id) {
    e.preventDefault();
    const data = { code: v('cust-code').trim().toUpperCase(), name: v('cust-name').trim() };
    if (id) DB.Customers.update(id, data); else DB.Customers.create(data);
    closeModal(); navigate('customers');
  }

  function deleteCustomer(id) {
    if (confirm('Delete this customer?')) { DB.Customers.delete(id); closeModal(); navigate('customers'); }
  }

  // ── Assign Customers to Program ──────────────────────────────
  function openAssignCustomers(programId) {
    const all     = DB.Customers.all();
    const current = new Set(DB.CustomerAssignments.byProgram(programId));
    showModal(`
      <div class="modal-header"><h2>Assign Customers</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">
        <p class="text-muted text-sm mb-3">Select which customers are buying in this program.</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${all.map(c => `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px;border-radius:8px;background:var(--surface-2)">
            <input type="checkbox" id="cca-${c.id}" ${current.has(c.id) ? 'checked' : ''}>
            <span class="font-bold">${c.code}</span> — ${c.name}
          </label>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveCustomerAssignments('${programId}')">Save</button>
      </div>`);
  }

  function saveCustomerAssignments(programId) {
    const all = DB.Customers.all();
    const selected = all.filter(c => document.getElementById(`cca-${c.id}`)?.checked).map(c => c.id);
    DB.CustomerAssignments.assign(programId, selected);
    closeModal(); navigate('buy-summary', programId);
  }

  // ── Buy Template Download ─────────────────────────────────
  function downloadBuyTemplate(programId) {
    const prog    = DB.Programs.get(programId);
    const styles  = DB.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const custIds = DB.CustomerAssignments.byProgram(programId);
    const custs   = custIds.map(id => DB.Customers.get(id)).filter(Boolean);
    if (!custs.length) { alert('Assign customers to this program before downloading the template.'); return; }

    // Header row: fixed cols + per-customer pair
    const fixedHdrs = ['Style #', 'Style Name', 'Category', 'Fabrication'];
    const custHdrs  = custs.flatMap(c => [`${c.code} - Units`, `${c.code} - Sell Price`]);
    const header    = [...fixedHdrs, ...custHdrs].join(',');

    // Existing buy data to pre-fill
    const allBuys = DB.CustomerBuys.byProgram(programId);

    const rows = styles.map(s => {
      const fixed = [
        `"${(s.styleNumber || '').replace(/"/g, '""')}"`,
        `"${(s.styleName   || '').replace(/"/g, '""')}"`,
        `"${(s.category    || '').replace(/"/g, '""')}"`,
        `"${(s.fabrication || '').replace(/"/g, '""')}"`,
      ];
      const custCols = custs.flatMap(c => {
        const b = allBuys.find(b => b.styleId === s.id && b.customerId === c.id);
        return [b?.qty ?? '', b?.sellPrice ?? ''];
      });
      return [...fixed, ...custCols].join(',');
    });

    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `buy_template_${(prog?.name || 'program').replace(/\s+/g, '_')}.csv`;
    a.click();
  }

  // ── Buy Upload Modal ──────────────────────────────────────
  function openBuyUploadModal(programId) {
    showModal(`
    <div class="modal-header"><h2>📤 Upload Buy Summary</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <div class="upload-zone" id="buy-upload-zone"
      ondragover="event.preventDefault();this.classList.add('dragover')"
      ondragleave="this.classList.remove('dragover')"
      ondrop="App.handleBuyDrop(event,'${programId}')">
      <input type="file" accept=".csv" onchange="App.handleBuyFileUpload(event,'${programId}')">
      <div class="upload-icon">📄</div>
      <p class="font-bold" style="color:var(--text-primary)">Drop completed CSV here or click to browse</p>
      <p class="text-sm text-muted">Use the downloaded template — do not change column headers</p>
    </div>
    <div id="buy-upload-preview" class="mt-3"></div>`, 'modal-lg');
  }

  function handleBuyDrop(e, programId) {
    e.preventDefault(); document.getElementById('buy-upload-zone')?.classList.remove('dragover');
    const file = e.dataTransfer.files[0]; if (file) processBuyUpload(file, programId);
  }
  function handleBuyFileUpload(e, programId) { const file = e.target.files[0]; if (file) processBuyUpload(file, programId); }

  let _pendingBuyRows = null;
  function processBuyUpload(file, programId) {
    const custIds = DB.CustomerAssignments.byProgram(programId);
    const custs   = custIds.map(id => DB.Customers.get(id)).filter(Boolean);
    const styles  = DB.Styles.byProgram(programId);

    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.trim().split('\n');
      if (lines.length < 2) { document.getElementById('buy-upload-preview').innerHTML = '<div class="alert alert-danger">No data rows found.</div>'; return; }

      // Parse header to find customer columns
      const hdrs = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      // Build map: customer code → { unitsIdx, sellIdx }
      const custColMap = {};
      custs.forEach(c => {
        const unitsKey = `${c.code} - Units`;
        const sellKey  = `${c.code} - Sell Price`;
        const ui = hdrs.indexOf(unitsKey);
        const si = hdrs.indexOf(sellKey);
        if (ui >= 0 || si >= 0) custColMap[c.id] = { ui, si, code: c.code };
      });

      const rows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const styleNum = cols[0];
        const style = styles.find(s => (s.styleNumber || '').trim() === styleNum);
        if (!style) return null;
        const buys = Object.entries(custColMap).map(([custId, {ui, si, code}]) => ({
          customerId: custId, code,
          qty:       ui >= 0 && cols[ui] !== '' ? parseFloat(cols[ui]) : null,
          sellPrice: si >= 0 && cols[si] !== '' ? parseFloat(cols[si]) : null,
        })).filter(b => b.qty != null || b.sellPrice != null);
        return buys.length ? { style, buys } : null;
      }).filter(Boolean);

      _pendingBuyRows = { programId, rows };
      const el = document.getElementById('buy-upload-preview'); if (!el) return;
      if (!rows.length) { el.innerHTML = '<div class="alert alert-danger">No matching styles found. Check Style # column matches exactly.</div>'; return; }

      // Preview table
      const previewHtml = rows.slice(0, 6).map(r =>
        r.buys.map((b, i) => `<tr>
          ${i === 0 ? `<td rowspan="${r.buys.length}" class="primary font-bold">${r.style.styleNumber}</td>` : ''}
          <td class="text-sm">${b.code}</td>
          <td>${b.qty != null ? b.qty.toLocaleString() : '—'}</td>
          <td>${b.sellPrice != null ? '$' + b.sellPrice.toFixed(2) : '—'}</td>
        </tr>`).join('')
      ).join('');

      el.innerHTML = `<div class="alert alert-info">✓ ${rows.length} style${rows.length !== 1 ? 's' : ''} with buy data found</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Style #</th><th>Customer</th><th>Units</th><th>Sell Price</th></tr></thead>
        <tbody>${previewHtml}</tbody>
      </table></div>
      ${rows.length > 6 ? `<p class="text-sm text-muted mt-1">…and ${rows.length - 6} more styles</p>` : ''}
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="App.confirmBuyUpload()">Import ${rows.length} Style${rows.length !== 1 ? 's' : ''}</button>
      </div>`;
    };
    reader.readAsText(file);
  }

  function confirmBuyUpload() {
    if (!_pendingBuyRows) return;
    const { programId, rows } = _pendingBuyRows;
    rows.forEach(({ style, buys }) => {
      buys.forEach(b => {
        const existing = DB.CustomerBuys.get(programId, style.id, b.customerId) || {};
        DB.CustomerBuys.upsert({
          programId, styleId: style.id, customerId: b.customerId,
          qty:       b.qty       != null ? b.qty       : existing.qty,
          sellPrice: b.sellPrice != null ? b.sellPrice : existing.sellPrice,
        });
      });
    });
    _pendingBuyRows = null;
    closeModal(); navigate('buy-summary', programId);
  }

  function deleteCoo(id) { if (confirm('Delete COO rate?')) { DB.CooRates.delete(id); navigate('coo'); } }

  // ── Flagging ───────────────────────────────────────────────
  function openFlagModal(subId) {
    showModal(`
    <div class="modal-header"><h2>🚩 Flag for Review</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.confirmFlag(event,'${subId}')">
      <div class="form-group"><label class="form-label">Reason for flagging</label>
        <textarea class="form-textarea" id="flag-reason" placeholder="e.g. FOB too high, please review…" required></textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-warning">🚩 Flag</button>
      </div>
    </form>`);
  }
  function confirmFlag(e, subId) { e.preventDefault(); DB.Submissions.flag(subId, v('flag-reason')); closeModal(); renderRoute(); }
  function unflagSub(id) { DB.Submissions.unflag(id); renderRoute(); }
  function acceptSub(id) { DB.Submissions.accept(id); renderRoute(); }

  // ── Place/Unplace ──────────────────────────────────────────
  function placeStyle(styleId, tcId, coo, fob) {
    DB.Placements.place({ styleId, tcId, coo, confirmedFob: parseFloat(fob) });
    DB.Styles.update(styleId, { status: 'placed' });
    renderRoute();
  }
  function unplaceStyle(styleId) {
    DB.Placements.unplace(styleId);
    DB.Styles.update(styleId, { status: 'open' });
    renderRoute();
  }

  // ── Cancel / Restore Style ─────────────────────────────────
  function cancelStyle(styleId, programId) {
    DB.Styles.update(styleId, { status: 'cancelled' });
    navigate('cost-summary', programId);
  }

  function uncancelStyle(styleId, programId) {
    DB.Styles.update(styleId, { status: 'open' });
    navigate('cost-summary', programId);
  }

  // ── Remove TC from Cost Summary ────────────────────────────
  function removeTCFromProgram(tcId, programId) {
    if (!confirm('Remove this trading company from the program?')) return;
    const remaining = DB.Assignments.byProgram(programId)
      .map(a => a.tcId)
      .filter(id => id !== tcId);
    DB.Assignments.assign(programId, remaining);
    navigate('cost-summary', programId);
  }

  // ── Sidebar Toggle ─────────────────────────────────────────
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    const collapsed = sidebar.classList.toggle('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (btn) btn.textContent = collapsed ? '▶' : '◀';
  }

  function toggleCancelledRows() {
    const tbody = document.getElementById('cancelled-rows');
    const toggleRow = document.getElementById('cancelled-toggle');
    if (!tbody) return;
    const isHidden = tbody.style.display === 'none';
    tbody.style.display = isHidden ? '' : 'none';
    if (toggleRow) toggleRow.classList.toggle('open', isHidden);
  }

  // ── Inline Style Field Save (non-formula cells) ────────────
  function saveStyleInline(styleId, inputEl) {
    const field = inputEl.dataset.field;
    const raw = inputEl.value.trim();
    const numericFields = ['projQty', 'projSellPrice', 'dutyRate', 'estFreight', 'specialPackaging'];
    let value = numericFields.includes(field) ? (raw === '' ? null : parseFloat(raw)) : raw;
    if (numericFields.includes(field) && isNaN(value)) value = null;
    DB.Styles.update(styleId, { [field]: value });
    // Update the Target LDP cell in this row — find it by data-col
    const row = inputEl.closest('tr');
    if (!row) return;
    const prog = DB.Programs.get(state.routeParam);
    const style = DB.Styles.get(styleId);
    if (prog && style) {
      const targetLDP = DB.computeTargetLDP(style, prog);
      const tldpCell = row.querySelector('td[data-col="tldp"]');
      if (tldpCell) tldpCell.textContent = targetLDP ? '$' + parseFloat(targetLDP).toFixed(2) : '—';
    }

    // When dutyRate or projQty changes, recalculate all per-TC×COO cells in this row
    if (['dutyRate', 'projQty', 'specialPackaging'].includes(field) && style) {
      const fmt = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
      const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
      const allSubs = DB.Submissions.byStyle(styleId);
      // Find all duty_pct cells in this row to identify which TC×COO columns exist
      row.querySelectorAll('td[data-col$="_duty_pct"]').forEach(cell => {
        const colKey = cell.dataset.col.replace('_duty_pct', ''); // e.g. "tc1_KH"
        // Reconstruct tcId and coo from colKey (format: tcId_coo)
        // COO codes are 2 letters, find the last underscore-separated segment that matches a COO
        const lastUnderscore = colKey.lastIndexOf('_');
        if (lastUnderscore < 0) return;
        const tcId = colKey.substring(0, lastUnderscore);
        const coo  = colKey.substring(lastUnderscore + 1);
        const sub = allSubs.find(s => s.tcId === tcId && s.coo === coo);
        if (!sub || !sub.fob) return;
        const tcObj = DB.TradingCompanies.get(tcId);
        const effectiveTerms = tcObj?.paymentTerms || sub.paymentTerms || 'FOB';
        const r = DB.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', effectiveTerms, sub.factoryCost);
        if (!r) return;
        cell.textContent = pct(r.dutyRate);
        const dutyAmtCell  = row.querySelector(`td[data-col="${colKey}_duty_amt"]`);
        const freightCell  = row.querySelector(`td[data-col="${colKey}_freight"]`);
        const ldpCell      = row.querySelector(`td[data-col="${colKey}_ldp"]`);
        if (dutyAmtCell) dutyAmtCell.textContent = fmt(r.duty);
        if (freightCell) freightCell.textContent = r.freight != null ? fmt(r.freight) : 'N/A';
        if (ldpCell) ldpCell.innerHTML = `<span>${fmt(r.ldp)}</span>`;
      });
    }
  }

  // ── Inline Submission Save (FOB / Factory Cost) ────────────
  function saveSubmissionInline(styleId, tcId, coo, inputEl) {
    const field = inputEl.dataset.field;
    const raw = inputEl.value.trim().replace(/^\$/, ''); // strip currency prefix
    const value = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && isNaN(value)) return; // invalid — don't save

    // Upsert submission with the changed field
    const existing = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    const updateData = { tcId, styleId, coo, [field]: value };
    // Preserve other fields from existing submission
    if (existing) Object.assign(updateData, { ...existing, [field]: value });
    DB.Submissions.upsert(updateData);

    // Refresh calculated cells (Duty%, Duty/unit, Freight/unit, LDP/unit) in the same row
    const row = inputEl.closest('tr');
    if (!row) return;
    const style = DB.Styles.get(styleId);
    const prog = DB.Programs.get(state.routeParam);
    const sub = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    if (!sub || !sub.fob) return;
    // Use TC-level payment terms, not submission-level
    const tc = DB.TradingCompanies.get(tcId);
    const effectiveTerms = tc?.paymentTerms || sub.paymentTerms || 'FOB';
    const r = DB.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', effectiveTerms, sub.factoryCost);
    if (!r) return;

    const fmt = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
    const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const k = `${tcId}_${coo}`;

    const dutyPctCell = row.querySelector(`td[data-col="${k}_duty_pct"]`);
    const dutyAmtCell = row.querySelector(`td[data-col="${k}_duty_amt"]`);
    const freightCell = row.querySelector(`td[data-col="${k}_freight"]`);
    const ldpCell = row.querySelector(`td[data-col="${k}_ldp"]`);

    if (dutyPctCell) dutyPctCell.textContent = pct(r.dutyRate);
    if (dutyAmtCell) dutyAmtCell.textContent = fmt(r.duty);
    if (freightCell) freightCell.textContent = r.freight != null ? fmt(r.freight) : 'N/A';
    if (ldpCell) ldpCell.innerHTML = `<span>${fmt(r.ldp)}</span>`;

    // Also update Target LDP cell to reflect any qty change
    const tldpCell = row.querySelector('td[data-col="tldp"]');
    if (tldpCell && prog) {
      const targetLDP = DB.computeTargetLDP(style, prog);
      tldpCell.textContent = targetLDP ? fmt(targetLDP) : '—';
    }
  }

  // ── Inline TC Terms Change (from TC column header dropdown) ─
  function saveTCTermsInline(tcId, programId, selectEl) {
    const terms = selectEl.value;
    // Persist the TC-level payment terms
    DB.TradingCompanies.update(tcId, { paymentTerms: terms });
    const tc = DB.TradingCompanies.get(tcId);

    // Re-render all calculated cells for every COO this TC has in this table
    const fmt = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
    const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const table = document.getElementById('cost-summary-table');
    if (!table) return;

    (tc?.coos || []).forEach(coo => {
      const k = `${tcId}_${coo}`;
      // For each style row, find and refresh the derived cells in this TC×COO column
      table.querySelectorAll('tbody tr:not(.cancelled-toggle-row)').forEach(row => {
        // Find an FOB input in this column to get styleId
        const fobInput = row.querySelector(`input[data-tcid="${tcId}"][data-coo="${coo}"][data-field="fob"]`);
        if (!fobInput) return;
        const styleId = fobInput.dataset.sid;
        const style = DB.Styles.get(styleId);
        const sub = DB.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
        if (!sub || !sub.fob) return;
        const r = DB.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', terms, sub.factoryCost);
        if (!r) return;

        const dutyPctCell = row.querySelector(`td[data-col="${k}_duty_pct"]`);
        const dutyAmtCell = row.querySelector(`td[data-col="${k}_duty_amt"]`);
        const freightCell = row.querySelector(`td[data-col="${k}_freight"]`);
        const ldpCell     = row.querySelector(`td[data-col="${k}_ldp"]`);

        if (dutyPctCell) dutyPctCell.textContent = pct(r.dutyRate);
        if (dutyAmtCell) dutyAmtCell.textContent = fmt(r.duty);
        if (freightCell) freightCell.textContent = r.freight != null ? fmt(r.freight) : (r.noQty ? 'N/A' : '$0.00');
        if (ldpCell)     ldpCell.innerHTML = `<span>${fmt(r.ldp)}</span>`;
      });
    });
  }

  // ── Quote Entry ────────────────────────────────────────────
  // TC-side quote form
  function openSubmitQuote(styleId, tcId) {
    showModal(VendorViews.quoteForm(styleId, tcId), 'modal-lg');
    $('quote-form').onsubmit = e => {
      e.preventDefault();
      DB.Submissions.upsert({ styleId, tcId, coo: v('q-coo'), fob: nv('q-fob'), factoryCost: nv('q-factory'), tcMarkup: nv('q-tcmu') ? nv('q-tcmu') / 100 : null, paymentTerms: v('q-terms'), moq: nv('q-moq'), leadTime: nv('q-lead'), vendorComments: v('q-comments') });
      closeModal(); navigate('my-styles');
    };
  }

  // Admin enters cost on behalf of TC for a specific COO
  function openAdminCostEntry(styleId, tcId, coo) {
    const tc = DB.TradingCompanies.get(tcId);
    showModal(VendorViews.quoteForm(styleId, tcId, coo), 'modal-lg');
    const h = document.querySelector('.modal h2');
    if (h) h.innerHTML = `✏ Enter Cost — <span style="color:var(--accent)">${tc?.code} (${coo})</span>`;
    $('quote-form').onsubmit = e => {
      e.preventDefault();
      DB.Submissions.upsert({ styleId, tcId, coo, fob: nv('q-fob'), factoryCost: nv('q-factory'), tcMarkup: nv('q-tcmu') ? nv('q-tcmu') / 100 : null, paymentTerms: v('q-terms'), moq: nv('q-moq'), leadTime: nv('q-lead'), vendorComments: v('q-comments'), enteredByAdmin: true });
      closeModal(); navigate(state.route, state.routeParam);
    };
  }

  // ── Programs View Toggle ───────────────────────────────────
  function setProgramsView(view) {
    AdminViews._programsView = view;
    const mc = document.getElementById('content'); if (!mc) return;
    mc.innerHTML = AdminViews.renderPrograms();
    // Restore filter values if any were typed before toggling
  }

  // ── Filters ────────────────────────────────────────────────
  function filterPrograms() {
    const search = ($('prog-search')?.value || '').toLowerCase();
    const status = $('prog-status-filter')?.value || '';
    // Card view
    document.querySelectorAll('.program-card').forEach(card => {
      const nameMatch = card.dataset.name?.includes(search);
      const statusMatch = !status || card.dataset.status === status;
      card.style.display = (nameMatch && statusMatch) ? '' : 'none';
    });
    // Table view
    const tbl = $('programs-tbl');
    if (tbl) {
      tbl.querySelectorAll('tbody tr').forEach(row => {
        const text = row.textContent.toLowerCase();
        const statusCell = row.querySelector('td:nth-child(4)')?.textContent.trim() || '';
        const nameMatch = !search || text.includes(search);
        const statusMatch = !status || statusCell === status;
        row.style.display = (nameMatch && statusMatch) ? '' : 'none';
      });
    }
  }

  function filterCrossProgram() {
    const programs = DB.Programs.all().filter(p => p.status === 'Costing');
    const allStyles = DB.Styles.all().filter(s => programs.some(p => p.id === s.programId));
    const search = $('cp-search')?.value || '', programFilter = $('cp-program')?.value || '', groupBy = $('cp-groupby')?.value || '', sortBy = $('cp-sort')?.value || '';
    const el = $('cross-program-table');
    if (el) el.innerHTML = AdminViews.crossProgramTable(allStyles, programs, search, programFilter, '', groupBy, sortBy);
    setTimeout(() => { setupColumnToggles('cp-table-controls', 'cp-table'); initResizableColumns($('cp-table')); }, 0);
  }

  // ── Formatted Cell Input Helpers ───────────────────────────
  // Called onfocus: replace formatted display with raw numeric value
  function fmtFocusRaw(el) {
    const raw = el.dataset.raw || '';
    el.value = raw;
    el.type = 'number';
    el.select();
  }

  // Called onfocus for duty rate: show decimal (raw) for editing
  function fmtFocusDuty(el) {
    const raw = el.dataset.raw || '';
    el.value = raw;
    el.type = 'number';
    el.step = '0.001';
    el.select();
  }

  // Called onblur: save Qty, reformat with thousands separator
  function fmtBlurQty(el, styleId) {
    const raw = el.type === 'number' ? el.value.trim() : el.value.trim();
    el.type = 'text';
    const num = raw === '' ? null : parseFloat(raw);
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? Number(num).toLocaleString() : '';
    const fakeInput = { dataset: { field: 'projQty' }, value: raw, closest: el.closest.bind(el) };
    DB.Styles.update(styleId, { projQty: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Called onblur: save currency field (Sell, EstFreight), reformat as $0.00
  function fmtBlurCurrency(el, styleId, field) {
    const raw = el.value.replace(/[^0-9.]/g, '').trim();
    el.type = 'text';
    const num = raw === '' ? null : parseFloat(raw);
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? '$' + num.toFixed(2) : '';
    DB.Styles.update(styleId, { [field]: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Called onblur: save duty rate, reformat as XX.X%
  // Accepts both decimal (0.282) and percent (28.2) input
  function fmtBlurDuty(el, styleId) {
    const raw = el.value.replace(/[^0-9.]/g, '').trim();
    el.type = 'text';
    let num = raw === '' ? null : parseFloat(raw);
    // If user typed a value > 1.0 treat as percentage, convert to decimal
    if (num != null && num > 1.0) num = num / 100;
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? (num * 100).toFixed(1) + '%' : '';
    DB.Styles.update(styleId, { dutyRate: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Shared: refresh Target LDP and duty/freight/ldp cells after a style field changes
  function _refreshRowAfterStyleChange(styleId, row) {
    if (!row) return;
    const prog = DB.Programs.get(state.routeParam);
    const style = DB.Styles.get(styleId);
    if (!prog || !style) return;
    const targetLDP = DB.computeTargetLDP(style, prog);
    const tldpCell = row.querySelector('td[data-col="tldp"]');
    if (tldpCell) tldpCell.textContent = targetLDP ? '$' + parseFloat(targetLDP).toFixed(2) : '—';
    const fmtD = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
    const pctD = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const allSubs = DB.Submissions.byStyle(styleId);
    row.querySelectorAll('td[data-col$="_duty_pct"]').forEach(cell => {
      const colKey = cell.dataset.col.replace('_duty_pct', '');
      const lastUnderscore = colKey.lastIndexOf('_');
      if (lastUnderscore < 0) return;
      const tcId = colKey.substring(0, lastUnderscore);
      const coo  = colKey.substring(lastUnderscore + 1);
      const sub = allSubs.find(s => s.tcId === tcId && s.coo === coo);
      if (!sub || !sub.fob) return;
      const tcObj = DB.TradingCompanies.get(tcId);
      const effectiveTerms = tcObj?.paymentTerms || sub.paymentTerms || 'FOB';
      const r = DB.calcLDP(parseFloat(sub.fob), style, coo, style.market || 'USA', 'NY', effectiveTerms, sub.factoryCost);
      if (!r) return;
      cell.textContent = pctD(r.dutyRate);
      const dutyAmtCell = row.querySelector(`td[data-col="${colKey}_duty_amt"]`);
      const freightCell = row.querySelector(`td[data-col="${colKey}_freight"]`);
      const ldpCell     = row.querySelector(`td[data-col="${colKey}_ldp"]`);
      if (dutyAmtCell) dutyAmtCell.textContent = fmtD(r.duty);
      if (freightCell) freightCell.textContent = r.freight != null ? fmtD(r.freight) : 'N/A';
      if (ldpCell) ldpCell.innerHTML = `<span>${fmtD(r.ldp)}</span>`;
    });
  }

  // ── Cost Summary Sort / Group Refresh ─────────────────────
  function refreshCostSummary(programId) {
    const sortBy  = document.getElementById('cs-sort-by')?.value  || '';
    const groupBy = document.getElementById('cs-group-by')?.value || '';
    const prog   = DB.Programs.get(programId);
    const styles = DB.Styles.byProgram(programId);
    const asgns  = DB.Assignments.byProgram(programId);
    const tcs    = asgns.map(a => a.tc).filter(Boolean);
    // Apply saved TC column order
    let colGroups = tcs.flatMap(tc => tc.coos.map(coo => ({ tc, coo })));
    const savedOrder = state.tcColOrder ? state.tcColOrder[programId] : null;
    if (savedOrder) colGroups = savedOrder.map(k => colGroups.find(g => `${g.tc.id}_${g.coo}` === k)).filter(Boolean);
    const wrap = document.getElementById('summary-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = AdminViews.buildCostMatrix(styles, colGroups, prog, programId, sortBy, groupBy);
    initResizableColumns(document.getElementById('cost-summary-table'));
    initVendorDragDrop(programId);
  }

  // ── Place All Styles (Admin + PC) ─────────────────────────
  function placeAllStyles(programId) {
    if (!confirm('Mark ALL active styles as placed and set program status to Placed?')) return;
    DB.Programs.placeAll(programId);
    navigate('cost-summary', programId);
  }

  // ── Pending Changes (Admin approve/reject) ─────────────────
  function approvePendingChange(id) {
    DB.PendingChanges.approve(id, state.user.id);
    navigate('pending-changes');
  }

  function rejectPendingChange(id) {
    DB.PendingChanges.reject(id, state.user.id);
    navigate('pending-changes');
  }

  // ── Propose Setting (PC submits a proposal) ───────────────
  function proposeSetting(type, action, data, currentData) {
    DB.PendingChanges.propose({
      type, action, data, currentData: currentData || null,
      proposedBy: state.user.id,
      proposedByName: state.user.name,
    });
  }

  // ── Staff Modal (Admin: create/edit PC accounts) ──────────
  function openStaffModal(userId) {
    const u = userId ? DB.PCUsers.allStaff().find(s => s.id === userId) : null;
    showModal(`
      <div class="modal-header"><h2>${u ? 'Edit' : 'Add'} Production Coordinator</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <input id="staff-name"  class="input" placeholder="Full Name"   value="${u?.name  || ''}">
        <input id="staff-email" class="input" placeholder="Email"       value="${u?.email || ''}">
        <input id="staff-pwd"   class="input" type="password" placeholder="${u ? 'New password (leave blank to keep)' : 'Password'}">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveStaff('${userId || ''}')">Save</button>
      </div>`);
  }

  function saveStaff(userId) {
    const name  = (document.getElementById('staff-name')?.value  || '').trim();
    const email = (document.getElementById('staff-email')?.value || '').trim();
    const pwd   = (document.getElementById('staff-pwd')?.value   || '').trim();
    if (!name || !email) return alert('Name and email are required.');
    if (userId) {
      const upd = { name, email };
      if (pwd) upd.password = pwd;
      DB.PCUsers.update(userId, upd);
    } else {
      if (!pwd) return alert('Password is required for new accounts.');
      DB.PCUsers.create({ name, email, password: pwd });
    }
    closeModal();
    navigate('staff');
  }

  function deleteStaff(userId) {
    if (!confirm('Delete this staff account?')) return;
    DB.PCUsers.delete(userId);
    navigate('staff');
  }

  // ── Propose Modals (PC proposes TC / IP / COO changes) ───
  function openProposeTCModal(tcId) {
    const tc = tcId ? DB.TradingCompanies.get(tcId) : null;
    showModal(`
      <div class="modal-header"><h2>${tc ? 'Propose Edit: ' + tc.code : 'Propose New Trading Company'}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <input id="ptc-code"  class="input" placeholder="Code (e.g. ABC)"  value="${tc?.code  || ''}">
        <input id="ptc-name"  class="input" placeholder="Company Name"     value="${tc?.name  || ''}">
        <input id="ptc-email" class="input" placeholder="Login Email"       value="${tc?.email || ''}">
        <input id="ptc-coos"  class="input" placeholder="COOs (comma-separated: VN,KH)" value="${(tc?.coos||[]).join(', ')}">
        <p class="text-muted text-sm">Your proposal will be sent to Admin for approval.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitProposeTC('${tcId || ''}')">Submit Proposal</button>
      </div>`);
  }

  function submitProposeTC(tcId) {
    const code  = (document.getElementById('ptc-code')?.value  || '').trim().toUpperCase();
    const name  = (document.getElementById('ptc-name')?.value  || '').trim();
    const email = (document.getElementById('ptc-email')?.value || '').trim();
    const coos  = (document.getElementById('ptc-coos')?.value  || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    if (!code || !name) return alert('Code and name are required.');
    const data = tcId ? { id: tcId, code, name, email, coos } : { code, name, email, coos };
    proposeSetting('tc', tcId ? 'update' : 'create', data, tcId ? DB.TradingCompanies.get(tcId) : null);
    closeModal();
    alert('✅ Proposal submitted for Admin review.');
    navigate('trading-companies');
  }

  function openProposeIPModal(ipId) {
    const ip = ipId ? DB.InternalPrograms.get(ipId) : null;
    showModal(`
      <div class="modal-header"><h2>${ip ? 'Propose Edit: ' + ip.name : 'Propose New Internal Program'}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <input id="pip-name"   class="input" placeholder="Program Name"       value="${ip?.name || ''}">
        <input id="pip-margin" class="input" type="number" step="0.01" min="0" max="1" placeholder="Target Margin (0–1)" value="${ip?.targetMargin ?? ''}">
        <p class="text-muted text-sm">Your proposal will be sent to Admin for approval.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitProposeIP('${ipId || ''}')">Submit Proposal</button>
      </div>`);
  }

  function submitProposeIP(ipId) {
    const name   = (document.getElementById('pip-name')?.value   || '').trim();
    const margin = parseFloat(document.getElementById('pip-margin')?.value || '');
    if (!name) return alert('Program name is required.');
    const data = ipId ? { id: ipId, name, targetMargin: isNaN(margin) ? undefined : margin }
                      : { name, targetMargin: isNaN(margin) ? undefined : margin };
    proposeSetting('internal-program', ipId ? 'update' : 'create', data, ipId ? DB.InternalPrograms.get(ipId) : null);
    closeModal();
    alert('✅ Proposal submitted for Admin review.');
    navigate('internal');
  }

  function openProposeCOOModal(cooId) {
    const r = cooId ? DB.CooRates.get(cooId) : null;
    showModal(`
      <div class="modal-header"><h2>${r ? 'Propose Edit: ' + r.code : 'Propose New COO Rate'}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <input id="pcoo-code"     class="input" placeholder="Code (e.g. VN)"    value="${r?.code     || ''}">
        <input id="pcoo-country"  class="input" placeholder="Country Name"       value="${r?.country  || ''}">
        <input id="pcoo-duty"     class="input" type="number" step="0.001" placeholder="Addl Duty (e.g. 0.19)" value="${r?.addlDuty  ?? ''}">
        <input id="pcoo-usamult"  class="input" type="number" step="0.01"  placeholder="USA Freight ×"          value="${r?.usaMult   ?? ''}">
        <input id="pcoo-camult"   class="input" type="number" step="0.01"  placeholder="Canada Freight ×"        value="${r?.canadaMult ?? ''}">
        <p class="text-muted text-sm">Your proposal will be sent to Admin for approval.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitProposeCOO('${cooId || ''}')">Submit Proposal</button>
      </div>`);
  }

  function submitProposeCOO(cooId) {
    const code     = (document.getElementById('pcoo-code')?.value    || '').trim().toUpperCase();
    const country  = (document.getElementById('pcoo-country')?.value || '').trim();
    const addlDuty = parseFloat(document.getElementById('pcoo-duty')?.value    || '');
    const usaMult  = parseFloat(document.getElementById('pcoo-usamult')?.value || '');
    const canadaMult = parseFloat(document.getElementById('pcoo-camult')?.value || '');
    if (!code || !country) return alert('Code and country are required.');
    const data = { code, country, addlDuty, usaMult, canadaMult };
    if (cooId) data.id = cooId;
    proposeSetting('coo', cooId ? 'update' : 'create', data, cooId ? DB.CooRates.get(cooId) : null);
    closeModal();
    alert('✅ Proposal submitted for Admin review.');
    navigate('coo');
  }


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
      ${existing ? `<hr class="flag-menu-sep"><button class="flag-menu-item flag-menu-clear" onclick="App.clearCellFlag('${subId}','${field}')">✕ Clear Flag</button>` : ''}
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
    // Log flag event into revision timeline
    DB.Revisions.log({ subId, field, type: 'flag', flagColor: color, flagNote: note,
      submittedBy: user.id, submittedByName: user.name || user.email });
    closeModal();
    renderRoute();
  }

  function clearCellFlag(subId, field) {
    const old = document.getElementById('flag-context-menu');
    if (old) old.remove();
    const user = state.user;
    // Log flag-clear event
    DB.Revisions.log({ subId, field, type: 'flag-clear',
      submittedBy: user?.id, submittedByName: user?.name || user?.email });
    DB.CellFlags.clear(subId, field);
    renderRoute();
  }

  // ── Revision History Modal ─────────────────────────────────
  // ── Repeat Style History Modal ────────────────────────────
  function openRepeatStyleHistory(styleNum) {
    const allStyles  = DB.Styles.all();
    const allSubs    = DB.Submissions.all();
    const allPlacements = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const allPrograms   = DB.Programs.all();

    // Collect all past styles (any program) matching styleNum
    const pastStyles = allStyles.filter(s => (s.styleNumber || '').trim() === styleNum.trim());

    // Build run entries: one per program this style appeared in
    const runs = pastStyles.map(s => {
      const prog = allPrograms.find(p => p.id === s.programId);
      const pl   = allPlacements.find(p => p.styleId === s.id);
      const subs = allSubs.filter(sub => sub.styleId === s.id);
      const tc   = pl ? DB.TradingCompanies.get(pl.tcId) : null;
      const placedSub = pl ? subs.find(sub => sub.tcId === pl.tcId && sub.coo === pl.coo) : null;
      const fob  = parseFloat(pl?.confirmedFob || placedSub?.fob || 0);
      const r    = fob > 0 ? DB.calcLDP(fob, s, pl.coo, s.market || 'USA', 'NY',
                    tc?.paymentTerms || placedSub?.paymentTerms || 'FOB', placedSub?.factoryCost) : null;
      return {
        season: prog ? `${prog.season || ''} ${prog.year || ''}`.trim() : '?',
        program: prog?.name || '?',
        placed: !!pl,
        tcCode: tc?.code || '', tcName: tc?.name || '',
        coo: pl?.coo || '',
        fob, ldp: r?.ldp || null,
        quotedCount: subs.filter(sub => sub.fob != null).length,
        createdAt: prog?.createdAt || 0,
      };
    }).sort((a, b) => b.createdAt - a.createdAt);

    if (!runs.length) { showModal(`<div class="modal-header"><h2>🔁 No History Found</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div><div class="modal-body"><p class="text-muted">No prior costing runs for style <strong>${styleNum}</strong>.</p></div>`); return; }

    const rows = runs.map(run => {
      const placedBadge = run.placed
        ? `<span class="tag tag-success">Placed</span>`
        : `<span class="tag">Costed</span>`;
      const tcCell = run.placed ? `${run.tcCode} <span class="text-muted text-sm">(${run.coo})</span>` : `<span class="text-muted">—</span>`;
      return `<tr>
        <td class="font-bold">${run.season}</td>
        <td class="text-sm text-muted">${run.program}</td>
        <td>${placedBadge}</td>
        <td>${tcCell}</td>
        <td class="${run.fob > 0 ? 'font-bold' : 'text-muted'}">${run.fob > 0 ? '$' + run.fob.toFixed(2) : '—'}</td>
        <td class="${run.ldp > 0 ? 'text-success font-bold' : 'text-muted'}">${run.ldp > 0 ? '$' + run.ldp.toFixed(2) : '—'}</td>
        <td class="text-sm text-muted">${run.quotedCount} TC${run.quotedCount !== 1 ? 's' : ''}</td>
      </tr>`;
    }).join('');

    showModal(`
      <div class="modal-header">
        <h2>🔁 Repeat Style History — ${styleNum}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p class="text-muted text-sm mb-3">${runs.length} program run${runs.length !== 1 ? 's' : ''} found across all seasons</p>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Season</th><th>Program</th><th>Status</th><th>Placed TC</th><th>FOB</th><th>LDP</th><th>Quotes</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>`, 'modal-lg');
  }

  function openRevisionHistory(subId, field) {
    if (!subId) return;
    const label = field === 'fob' ? 'FOB Cost' : 'Factory Cost';
    const sub = DB.Submissions.get(subId);
    // Use byFieldAll — includes flag events alongside price revisions
    const entries = DB.Revisions.byFieldAll(subId, field);
    const flag = DB.CellFlags.get(subId, field);

    // Mark as reviewed: store timestamp of latest entry seen
    const latestTs = entries.length ? entries[entries.length - 1].submittedAt : 0;
    if (latestTs) localStorage.setItem(`vcp_rev_seen_${subId}_${field}`, latestTs);

    // Flag banner (current active flag)
    const flagColors = { red: '#ef4444', yellow: '#eab308', blue: '#3b82f6', green: '#22c55e', orange: '#f97316', purple: '#a855f7' };
    const flagBanner = flag ? `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;
        border-left:4px solid ${flagColors[flag.color] || '#94a3b8'};
        background:rgba(${flag.color==='red'?'239,68,68':flag.color==='yellow'?'234,179,8':flag.color==='green'?'34,197,94':flag.color==='orange'?'249,115,22':'99,102,241'},0.10);
        margin-bottom:16px;">
        <span style="font-size:1.1rem">🚩</span>
        <div>
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${flagColors[flag.color] || '#94a3b8'}">Active Flag — ${flag.color}</div>
          ${flag.note ? `<div style="margin-top:3px;font-size:0.875rem;color:var(--text-primary)">${flag.note}</div>` : ''}
        </div>
      </div>` : '';

    const vendorNote = (field === 'fob' && sub?.vendorComments) ? `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;
        background:rgba(148,163,184,0.08);border:1px solid var(--border);margin-bottom:16px;">
        <span>💬</span>
        <div>
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)">Vendor Note</div>
          <div style="margin-top:3px;font-size:0.875rem;color:var(--text-primary)">${sub.vendorComments}</div>
        </div>
      </div>` : '';

    // Build merged timeline
    const rows = entries.length
      ? entries.map((r, i) => {
          const dt = new Date(r.submittedAt);
          const dateStr = dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                        + ' ' + dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
          if (r.type === 'flag') {
            const fc = flagColors[r.flagColor] || '#94a3b8';
            return `<tr style="background:rgba(${r.flagColor==='red'?'239,68,68':r.flagColor==='yellow'?'234,179,8':r.flagColor==='orange'?'249,115,22':'99,102,241'},0.07)">
              <td colspan="2"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${fc};margin-right:6px"></span>
                <span style="font-size:0.8rem;font-weight:600;color:${fc}">${r.flagColor?.toUpperCase()} Flag set</span>
                ${r.flagNote ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">${r.flagNote}</div>` : ''}
              </td>
              <td colspan="3" class="text-sm text-muted" style="vertical-align:top">${r.submittedByName || r.submittedBy || ''}<br>${dateStr}</td>
            </tr>`;
          }
          if (r.type === 'flag-clear') {
            return `<tr>
              <td colspan="2" class="text-sm text-muted"><span style="margin-right:6px">✕</span>Flag cleared</td>
              <td colspan="3" class="text-sm text-muted">${r.submittedByName || ''}<br>${dateStr}</td>
            </tr>`;
          }
          // Price revision
          const priceRevs = entries.filter(e => !e.type);
          const priceIdx = priceRevs.indexOf(r);
          const isLatest = i === entries.length - 1 || (entries.slice(i+1).every(e => e.type));
          const verLabel = priceIdx === 0 ? 'Initial' : 'Rev ' + priceIdx;
          return `<tr class="${isLatest ? 'revision-latest' : ''}">
            <td class="text-sm text-muted">${verLabel}${isLatest ? ' <span class="tag tag-success" style="font-size:0.65rem;padding:1px 5px">current</span>' : ''}</td>
            <td class="font-bold text-success">$${parseFloat(r.newValue).toFixed(2)}</td>
            <td class="text-sm text-muted">${r.oldValue != null ? '$' + parseFloat(r.oldValue).toFixed(2) : '—'}</td>
            <td class="text-sm">${r.submittedByName || r.submittedBy || ''}</td>
            <td class="text-sm text-muted">${dateStr}${r.reason ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">📝 ${r.reason}</div>` : ''}</td>
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
        ${flagBanner}${vendorNote}
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Version</th><th>Value</th><th>Previous</th><th>By</th><th>Date / Notes</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>`);
  }

  function openCellHighlightMenu(e, styleId, tcId, coo, subId, fob) {
    e.preventDefault();
    closeCellMenu();
    const considerKey = 'vcp_considering';
    const tag = subId ? `${styleId}:${subId}` : null;
    const list = JSON.parse(localStorage.getItem(considerKey) || '[]');
    const isConsidering = tag ? list.includes(tag) : false;
    const placement = DB.Placements.get(styleId);
    const isPlaced = placement?.tcId === tcId && placement?.coo === coo;

    const menu = document.createElement('div');
    menu.id = 'cell-highlight-menu';
    menu.style.cssText = `position:fixed;z-index:9998;top:${e.clientY}px;left:${e.clientX}px;
      background:rgba(18,18,32,0.97);border:1px solid rgba(255,255,255,0.12);border-radius:10px;
      padding:6px;min-width:190px;box-shadow:0 8px 32px rgba(0,0,0,.55);backdrop-filter:blur(12px);
      font-family:var(--font);`;
    menu.innerHTML = `
      <div style="font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b;padding:5px 10px 3px">Highlight Cell</div>
      <button class="cm-item" onclick="App.setCellHighlight('considering','${styleId}','${tcId}','${coo}','${subId}',${fob})">
        <span style="color:#eab308">⬤</span> ${isConsidering ? '✓ ' : ''}Considering
      </button>
      <button class="cm-item" onclick="App.setCellHighlight('placed','${styleId}','${tcId}','${coo}','${subId}',${fob})">
        <span style="color:#22c55e">⬤</span> ${isPlaced ? '✓ ' : ''}Order Placed
      </button>
      <div style="border-top:1px solid rgba(255,255,255,0.07);margin:4px 0"></div>
      <button class="cm-item" onclick="App.setCellHighlight('clear','${styleId}','${tcId}','${coo}','${subId}',${fob})">
        <span style="color:#64748b">✕</span> Clear
      </button>`;
    document.body.appendChild(menu);
    // Close on outside click
    setTimeout(() => document.addEventListener('click', closeCellMenu, { once: true }), 0);
  }

  function closeCellMenu() {
    const m = document.getElementById('cell-highlight-menu');
    if (m) m.remove();
  }

  function setCellHighlight(action, styleId, tcId, coo, subId, fob) {
    closeCellMenu();
    const considerKey = 'vcp_considering';
    const tag = subId ? `${styleId}:${subId}` : null;

    if (action === 'considering') {
      if (!tag) return;
      let list = JSON.parse(localStorage.getItem(considerKey) || '[]');
      // Remove ALL previously considering tags for this style (mutually exclusive per style)
      list = list.filter(t => !t.startsWith(`${styleId}:`));
      list.push(tag);
      localStorage.setItem(considerKey, JSON.stringify(list));
    } else if (action === 'placed') {
      // Remove considering tag first
      if (tag) {
        const list = JSON.parse(localStorage.getItem(considerKey) || '[]');
        const idx = list.indexOf(tag);
        if (idx >= 0) { list.splice(idx, 1); localStorage.setItem(considerKey, JSON.stringify(list)); }
      }
      DB.Placements.place({ styleId, tcId, coo, confirmedFob: parseFloat(fob) || 0 });
    } else if (action === 'clear') {
      // Clear both
      if (tag) {
        const list = JSON.parse(localStorage.getItem(considerKey) || '[]');
        const idx = list.indexOf(tag);
        if (idx >= 0) { list.splice(idx, 1); localStorage.setItem(considerKey, JSON.stringify(list)); }
      }
      const existing = DB.Placements.get(styleId);
      if (existing?.tcId === tcId && existing?.coo === coo) DB.Placements.unplace(styleId);
    }
    const styles = DB.Styles.byProgram ? DB.Programs.all().flatMap(p => DB.Styles.byProgram(p.id)) : [];
    const styleObj = styles.find(s2 => s2.id === styleId);
    const prog = styleObj?.programId;
    if (prog) navigate('cost-summary', prog);
  }

  function toggleConsidering(tag, styleId) {

    const key = 'vcp_considering';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = list.indexOf(tag);
    if (idx >= 0) list.splice(idx, 1); else list.push(tag);
    localStorage.setItem(key, JSON.stringify(list));
    openCostComparison(styleId); // re-render to show updated highlight
  }

  function saveStyleNote(styleId, text) {
    localStorage.setItem(`vcp_note_${styleId}`, text);
  }

  function toggleRoleSwitcher() {
    const menu = document.getElementById('rs-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';

  }

  function switchToUser(idx) {
    const panel = document.getElementById('role-switcher');
    const accounts = panel?._accounts;
    if (!accounts || !accounts[idx]) return;
    const acct = accounts[idx];
    const user = DB.Auth.login(acct.email, acct.password);
    if (!user) return;
    toggleRoleSwitcher();
    state.user = user;
    state.route = '';
    state.routeParam = null;
    renderApp();
  }


  return {
    init, login, logout, navigate, openProgram, openCostComparison,
    openProgramModal, onInternalProgramChange, saveProgramModal, updateProgramStatus, deleteProgram,
    openStyleModal, previewTargetLDP, saveStyle, deleteStyle,
    openAssignTCs, saveAssignments,
    openAssignCustomers, saveCustomerAssignments,
    saveBuyInline,
    downloadBuyTemplate, openBuyUploadModal, handleBuyDrop, handleBuyFileUpload, confirmBuyUpload,
    openCustomerModal, saveCustomer, deleteCustomer,
    openUploadModal, handleFileUpload, handleDrop, confirmUpload, downloadTemplate,
    openFlagMenu, openFlagNoteModal, saveCellFlag, clearCellFlag,
    openRevisionHistory, openRepeatStyleHistory,
    toggleTCCols: (colKey, programId) => AdminViews.toggleTCCols(colKey, programId),
    expandAllTCs: (programId) => AdminViews.expandAllTCs(programId),
    collapseAllTCs: (programId) => AdminViews.collapseAllTCs(programId),
    removeTCFromProgram,
    toggleSidebar, toggleRoleSwitcher, switchToUser,
    saveSubmissionInline, saveStyleInline, refreshCostSummary,
    openSubmitQuote, openVendorBulkUpload, downloadVendorTemplate, handleVendorDrop, handleVendorFileUpload, confirmVendorUpload,
    navigateVendorHome, navigateVendorProgram, navigateVendorAllStyles,
    saveVendorCellInline, openSkipVendorCoo, confirmSkipVendorCoo, unskipVendorCoo,
    placeStyle, cancelStyle, uncancelStyle,
    filterCrossProgram, toggleCancelledRows,
    setProgramsView, filterPrograms,
    toggleConsidering, saveStyleNote,
    openCellHighlightMenu, setCellHighlight, closeCellMenu,
    // Settings modals (previously missing)
    openInternalProgramModal, saveInternalProgram, deleteInternalProgram,
    openTCModal, saveTC, deleteTC, saveCoo, deleteCoo, openCooModal,
    approvePendingChange, rejectPendingChange, proposeSetting,
    openStaffModal, saveStaff,
    // Formatting helpers used by inline inputs
    fmtFocusRaw, fmtFocusDuty, fmtBlurQty, fmtBlurCurrency, fmtBlurDuty,
    // unplaceStyle alias
    unplaceStyle: (styleId) => { DB.Placements.unplace(styleId); navigate(state.route, state.routeParam); },
    closeModal, closeModalOutside,
  };



})();

document.addEventListener('DOMContentLoaded', () => {
  try {
    App.init();
  } catch(err) {
    console.error('[App.init ERROR]', err);
    document.body.innerHTML = `<div style="padding:40px;font-family:monospace;color:red;background:#111;min-height:100vh">
      <h2>App failed to start</h2>
      <pre>${err.message}\n\n${err.stack}</pre>
    </div>`;
  }
});

