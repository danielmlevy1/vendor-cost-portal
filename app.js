// =============================================================
// VENDOR COST PORTAL — App Controller (app.js)
// Trading Company (TC) model: one login per TC, multiple COOs.
// =============================================================

var App; // var (not const) — prevents TDZ ReferenceError if the IIFE throws
try {
App = (() => {
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
  async function init() {
    try {
      const user = await API.Auth.current();
      if (user) {
        state.user = user;
        // Pre-load data needed by the sidebar (users list for role switcher, badges)
        await Promise.all([
          API.Users.all().catch(() => {}),
          API.TradingCompanies.all().catch(() => {}),
          API.preload.nav(),
        ]);
        renderApp();
      } else {
        renderLogin();
      }
    } catch (_) {
      renderLogin();
    }
  }

  // ── Routing ────────────────────────────────────────────────
  async function navigate(route, param) {
    state.route = route; state.routeParam = param || null;

    // Route-based preloading — warm the cache before rendering
    try {
      if (route === 'programs' || route === 'dashboard')
        await API.preload.programs();
      else if (route === 'cost-summary' || route === 'styles' || route === 'buy-summary' || route === 'compare' || route === 'design-costing')
        await API.preload.program(param);
      else if (route === 'cross-program')
        await API.preload.crossProgram();
      else if (route === 'trading-companies' || route === 'my-company')
        await API.preload.tradingCompanies();
      else if (route === 'customers' || route === 'internal' || route === 'coo')
        await API.preload.programs();
      else if (route === 'staff' || route === 'departments')
        await API.preload.staff();
      else if (route === 'design-handoff')
        await API.preload.designHandoff();
      else if (route === 'sales-request')
        await API.preload.salesRequest();
      else if (route === 'fabric-standards')
        await API.preload.fabricStandards();
      else if (route === 'recost-queue')
        await API.preload.recostQueue();
      else if (route === 'pending-changes')
        await API.preload.pendingChanges();
      else if (route === 'design-changes')
        await API.preload.programs();
      else if (route === '' || route === 'vendor-home' || route === 'vendor-program' || route === 'my-styles') {
        // Vendor routes
        await API.preload.programs();
        if (param) await API.preload.program(param);
      }
      else
        await API.preload.nav();
    } catch (err) {
      console.error('[navigate] preload error:', err);
    }

    renderApp();
  }

  function openProgram(id) {
    const u = state.user;
    // Sales Management (planning role + dept-sales-price) gets the full cost-summary view
    const isSalesMgmt = u.role === 'planning' && u.departmentId === 'dept-sales-price';
    if (!isSalesMgmt && (u.role === 'design' || u.role === 'planning')) navigate('design-costing', id);
    else navigate('cost-summary', id);
  }

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

  async function login(e) {
    e.preventDefault();
    const emailEl = document.getElementById('login-email');
    const pwdEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const email = (emailEl?.value || '').trim();
    const password = (pwdEl?.value || '').trim();
    try {
      const user = await API.Auth.login(email, password);
      state.user = user;
      // Pre-load sidebar data before first render
      await Promise.all([
        API.Users.all().catch(() => {}),
        API.TradingCompanies.all().catch(() => {}),
        API.preload.nav(),
      ]);
      renderApp();
    } catch (err) {
      if (errEl) { errEl.style.display = ''; errEl.textContent = err.message || 'Invalid email or password'; }
    }
  }


  async function logout() {
    await API.Auth.logout();
    state.user = null;
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
      // All internal staff users + Trading Companies (from cache, loaded at login)
      const internalUsers = API.cache.users;
      const allTCs        = API.cache.tradingCompanies;

      const roleLabelMap = { admin: 'Admin', pc: 'Production', planning: 'Planning & Sales', design: 'Design', tech_design: 'Tech Design', prod_dev: 'Product Development' };
      const roleOrder    = ['admin', 'pc', 'planning', 'design', 'tech_design', 'prod_dev'];

      // Group internal users by role for visual sections
      const grouped = roleOrder.map(role => ({
        role,
        label: roleLabelMap[role],
        users: internalUsers.filter(u => u.role === role),
      })).filter(g => g.users.length > 0);

      const accounts = [
        ...internalUsers.map(u => ({ label: u.name, sub: roleLabelMap[u.role] || u.role, email: u.email })),
        ...allTCs.map(t  => ({ label: t.name,  sub: t.code + ' · Vendor',                  email: t.email })),
      ];

      const panel = document.createElement('div');
      panel.id = 'role-switcher';
      panel._accounts = accounts;

      // Build grouped HTML
      const internalHtml = grouped.map(g => `
        <div class="rs-group-label">${g.label}</div>
        ${g.users.map((u, _) => {
          const idx = accounts.findIndex(a => a.email === u.email);
          return `<button class="rs-item" onclick="App.switchToUser(${idx})">
            <span class="rs-label">${u.name}</span>
            <span class="rs-sub">${u.email}</span>
          </button>`;
        }).join('')}
      `).join('');

      const tcHtml = allTCs.length ? `
        <div class="rs-group-label">Trading Companies</div>
        ${allTCs.map(t => {
          const idx = accounts.findIndex(a => a.email === t.email);
          return `<button class="rs-item" onclick="App.switchToUser(${idx})">
            <span class="rs-label">${t.name}</span>
            <span class="rs-sub">${t.code} · Vendor</span>
          </button>`;
        }).join('')}
      ` : '';

      panel.innerHTML = `
        <button id="rs-toggle-btn" onclick="App.toggleRoleSwitcher()" title="Switch user account">👤 Switch</button>
        <div id="rs-menu" style="display:none">
          <div class="rs-menu-title">Switch Account</div>
          <div class="rs-menu-scroll">
            ${internalHtml}
            ${tcHtml}
          </div>
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

    const isAdmin  = state.user.role === 'admin';
    const isPC     = state.user.role === 'pc';
    const isDesign     = state.user.role === 'design';
    const isTechDesign = state.user.role === 'tech_design';
    const isProdDev    = state.user.role === 'prod_dev';

    const navEl      = document.getElementById('sidebar-nav');
    const userEl     = document.getElementById('sidebar-user');
    const isPlanning = state.user.role === 'planning';
    const pendingCount = isAdmin ? API.PendingChanges.pending().length : 0;
    const badgeHtml  = pendingCount > 0 ? `<span class="pending-badge">${pendingCount}</span>` : '';

    if (navEl) navEl.innerHTML = `
      <div class="sidebar-section"><div class="sidebar-section-label">Navigation</div></div>
      <div style="padding:0 8px">
      ${(isAdmin || isPC) ? `
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'programs' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
        <button class="nav-item ${state.route === 'cross-program' ? 'active' : ''}" onclick="App.navigate('cross-program')"><span class="icon">🌐</span> All Open Programs</button>
        <div class="sidebar-section"><div class="sidebar-section-label">Pre-Costing</div></div>
        <button class="nav-item ${state.route === 'design-handoff' ? 'active' : ''}" onclick="App.navigate('design-handoff')"><span class="icon">🎨</span> Design Handoffs</button>
        <button class="nav-item ${state.route === 'sales-request' ? 'active' : ''}" onclick="App.navigate('sales-request')"><span class="icon">📝</span> Sales Requests</button>
        <button class="nav-item ${state.route === 'fabric-standards' ? 'active' : ''}" onclick="App.navigate('fabric-standards')"><span class="icon">🧵</span> Fabric Standards</button>
        <button class="nav-item ${state.route === 'design-changes' ? 'active' : ''}" onclick="App.navigate('design-changes')"><span class="icon">📌</span> Design Changes</button>
        ${(() => { const rc = API.RecostRequests.pendingProduction().length; return `<button class="nav-item ${state.route === 'recost-queue' ? 'active' : ''}" onclick="App.navigate('recost-queue')"><span class="icon">↩</span> Re-cost Queue${rc > 0 ? ` <span class="pending-badge">${rc}</span>` : ''}</button>`; })()}
        <div class="sidebar-section"><div class="sidebar-section-label">Settings</div></div>
        <button class="nav-item ${state.route === 'trading-companies' ? 'active' : ''}" onclick="App.navigate('trading-companies')"><span class="icon">🏣</span> Trading Companies</button>
        <button class="nav-item ${state.route === 'customers' ? 'active' : ''}" onclick="App.navigate('customers')"><span class="icon">👥</span> Customers</button>
        <button class="nav-item ${state.route === 'internal' ? 'active' : ''}" onclick="App.navigate('internal')"><span class="icon">📊</span> Internal Programs</button>
        <button class="nav-item ${state.route === 'coo' ? 'active' : ''}" onclick="App.navigate('coo')"><span class="icon">🌍</span> COO Rates</button>
        ${isAdmin ? `
          <button class="nav-item ${state.route === 'pending-changes' ? 'active' : ''}" onclick="App.navigate('pending-changes')">
            <span class="icon">🔔</span> Pending Changes ${badgeHtml}
          </button>
          <button class="nav-item ${state.route === 'staff' || state.route === 'departments' ? 'active' : ''}" onclick="App.navigate('staff')"><span class="icon">👥</span> People & Access</button>
        ` : ''}
      ` : isDesign ? `
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'programs' || state.route === 'design-costing' || state.route === 'buy-summary' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
        <button class="nav-item ${state.route === 'design-handoff' ? 'active' : ''}" onclick="App.navigate('design-handoff')"><span class="icon">🎨</span> Design Handoffs</button>
        <button class="nav-item ${state.route === 'design-changes' ? 'active' : ''}" onclick="App.navigate('design-changes')"><span class="icon">📌</span> Design Changes</button>
        <button class="nav-item ${state.route === 'recost-queue' ? 'active' : ''}" onclick="App.navigate('recost-queue')"><span class="icon">↩</span> Re-cost Queue</button>
      ` : isTechDesign ? `
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'programs' || state.route === 'design-costing' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
        <button class="nav-item ${state.route === 'design-handoff' ? 'active' : ''}" onclick="App.navigate('design-handoff')"><span class="icon">🎨</span> Design Handoffs</button>
        <button class="nav-item ${state.route === 'design-changes' ? 'active' : ''}" onclick="App.navigate('design-changes')"><span class="icon">📌</span> Design Changes</button>
        <button class="nav-item ${state.route === 'recost-queue' ? 'active' : ''}" onclick="App.navigate('recost-queue')"><span class="icon">↩</span> Re-cost Queue</button>
      \` : isProdDev ? \`
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'fabric-standards' ? 'active' : ''}" onclick="App.navigate('fabric-standards')"><span class="icon">🧵</span> Standards Requests</button>
      \` : isPlanning ? \`
        <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')"><span class="icon">🏡</span> Dashboard</button>
        <button class="nav-item ${state.route === 'programs' || state.route === 'design-costing' || state.route === 'buy-summary' ? 'active' : ''}" onclick="App.navigate('programs')"><span class="icon">📋</span> Programs</button>
        <button class="nav-item ${state.route === 'sales-request' ? 'active' : ''}" onclick="App.navigate('sales-request')"><span class="icon">📝</span> Sales Requests</button>
        <button class="nav-item ${state.route === 'design-handoff' ? 'active' : ''}" onclick="App.navigate('design-handoff')"><span class="icon">🎨</span> Design Handoffs</button>
        ${(() => { const rc = API.RecostRequests.pendingSales().length; return `<button class="nav-item ${state.route === 'recost-queue' ? 'active' : ''}" onclick="App.navigate('recost-queue')"><span class="icon">↩</span> Re-cost Queue${rc > 0 ? ` <span class="pending-badge">${rc}</span>` : ''}</button>`; })()}
      ` : `
        <button class="nav-item ${
          state.route === '' || state.route === 'vendor-home' || state.route === 'vendor-program' ? 'active' : ''
        }" onclick="App.navigate('')"><span class="icon">🏠</span> My Programs</button>
        <button class="nav-item ${state.route === 'my-styles' ? 'active' : ''}" onclick="App.navigate('my-styles')"><span class="icon">📋</span> All Styles</button>
        <button class="nav-item ${state.route === 'fabric-standards' ? 'active' : ''}" onclick="App.navigate('fabric-standards')"><span class="icon">🧵</span> Fabric Standards</button>
        <div class="sidebar-section"><div class="sidebar-section-label">Account</div></div>
        <button class="nav-item ${state.route === 'my-company' ? 'active' : ''}" onclick="App.navigate('my-company')"><span class="icon">🏣</span> My Company</button>
      `}
      <div style="padding:4px 8px 8px">
        <button class="nav-item theme-toggle-btn" id="theme-toggle-btn" onclick="App.toggleTheme()" title="Toggle light / dark mode">
          <span id="theme-icon">${localStorage.getItem('vcp_theme') === 'light' ? '☀️' : '🌙'}</span>
          <span id="theme-label">${localStorage.getItem('vcp_theme') === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
      </div>`;

    if (userEl) userEl.innerHTML = `
      <div class="user-info" onclick="App.logout()" title="Sign out">
        <div class="user-avatar">${state.user.name.charAt(0).toUpperCase()}</div>
        <div><div class="user-name">${state.user.name}</div><div class="user-role">${isAdmin ? 'Admin' : isPC ? 'Production Coordinator' : isPlanning ? 'Planning & Sales' : isDesign ? 'Design' : isTechDesign ? 'Tech Design' : isProdDev ? 'Product Development' : 'Trading Co.'}</div></div>
      </div>`;

    renderRoute();
  }


  function renderRoute() {
    const mc = document.getElementById('content'); if (!mc) return;
    const { route, routeParam, user } = state;
    const isAdmin    = user.role === 'admin';
    const isPC       = user.role === 'pc';
    const isPlanning   = user.role === 'planning';
    const isDesign     = user.role === 'design';
    const isTechDesign = user.role === 'tech_design';
    const isProdDev    = user.role === 'prod_dev';

    // ── Pre-costing shared routes (async) ──
    if (route === 'fabric-standards') {
      mc.innerHTML = '<div class="empty-state"><div class="icon">🧵</div><h3>Loading…</h3></div>';
      const isVendor = !isAdmin && !isPC && !isPlanning && !isDesign;
      AdminViews.renderFabricStandards(user.role, user.tcId).then(html => { mc.innerHTML = html; });
      return;
    }

    if (isAdmin || isPC) {
      // Shared program & cost views — both roles
      if (route === 'dashboard')     mc.innerHTML = AdminViews.renderDashboard(user.role, user);
      else if (route === 'programs')      mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'styles')        mc.innerHTML = AdminViews.renderStyleManager(routeParam);
      else if (route === 'cost-summary')  mc.innerHTML = AdminViews.renderCostSummary(routeParam);
      else if (route === 'buy-summary')   mc.innerHTML = AdminViews.renderBuySummary(routeParam, user.role);
      else if (route === 'compare')       mc.innerHTML = AdminViews.renderCostComparison(routeParam);
      else if (route === 'cross-program') mc.innerHTML = AdminViews.renderCrossProgram();
      // Pre-costing workflow routes
      else if (route === 'design-handoff')       mc.innerHTML = AdminViews.renderDesignHandoff();
      else if (route === 'sales-request' || route === 'sales-requests') mc.innerHTML = AdminViews.renderSalesRequests();
      else if (route === 'build-from-handoff')   { mc.innerHTML = AdminViews.renderBuildFromHandoff(routeParam); App._initBuildFromHandoffKbd(); }
      else if (route === 'design-changes')       mc.innerHTML = AdminViews.renderAllDesignChanges();
      else if (route === 'recost-queue')          mc.innerHTML = AdminViews.renderRecostQueue();
      // Settings — Admin gets full CRUD; PC gets propose-mode
      else if (route === 'trading-companies') mc.innerHTML = isAdmin ? AdminViews.renderTradingCompanies() : AdminViews.renderTradingCompaniesPC();
      else if (route === 'customers')         mc.innerHTML = isAdmin ? AdminViews.renderCustomers() : mc.innerHTML;
      else if (route === 'internal' && isAdmin)  mc.innerHTML = AdminViews.renderInternalPrograms();
      else if (route === 'coo')               mc.innerHTML = isAdmin ? AdminViews.renderCOO()               : AdminViews.renderCOOPC();
      // Admin-only routes
      else if (route === 'pending-changes' && isAdmin) mc.innerHTML = AdminViews.renderPendingChanges();
      else if (route === 'staff'           && isAdmin) mc.innerHTML = AdminViews.renderStaff('staff');
      else if (route === 'departments'     && isAdmin) mc.innerHTML = AdminViews.renderStaff('departments');
      else mc.innerHTML = AdminViews.renderDashboard(user.role, user);
    } else if (isDesign) {
      if (route === 'dashboard')           mc.innerHTML = AdminViews.renderDashboard(user.role, user);
      else if (route === 'design-handoff') mc.innerHTML = AdminViews.renderDesignHandoff();
      else if (route === 'design-changes') mc.innerHTML = AdminViews.renderAllDesignChanges();
      else if (route === 'recost-queue')   mc.innerHTML = AdminViews.renderRecostQueue();
      else if (route === 'programs')       mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'design-costing') mc.innerHTML = AdminViews.renderDesignCostingView(routeParam, user.role);
      else if (route === 'buy-summary')    mc.innerHTML = AdminViews.renderBuySummary(routeParam, user.role);
      else if (route === 'cost-summary')   mc.innerHTML = AdminViews.renderDesignCostingView(routeParam, user.role); // redirect to role view
      else mc.innerHTML = AdminViews.renderDashboard(user.role, user);
    } else if (isPlanning) {
      // Planning/Sales — programs, buy summaries, pre-costing
      if (route === 'dashboard')               mc.innerHTML = AdminViews.renderDashboard(user.role, user);
      else if (route === 'programs')           mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'design-costing')     mc.innerHTML = AdminViews.renderDesignCostingView(routeParam, user.role);
      else if (route === 'buy-summary')        mc.innerHTML = AdminViews.renderBuySummary(routeParam, user.role);
      else if (route === 'design-handoff')     mc.innerHTML = AdminViews.renderDesignHandoff();
      else if (route === 'sales-request' || route === 'sales-requests') mc.innerHTML = AdminViews.renderSalesRequests();
      else if (route === 'build-from-handoff') { mc.innerHTML = AdminViews.renderBuildFromHandoff(routeParam); App._initBuildFromHandoffKbd(); }
      else if (route === 'design-changes')     mc.innerHTML = AdminViews.renderAllDesignChanges();
      else if (route === 'recost-queue')        mc.innerHTML = AdminViews.renderRecostQueue();
      else mc.innerHTML = AdminViews.renderDashboard(user.role, user);
    } else if (isTechDesign) {
      if (route === 'dashboard')           mc.innerHTML = AdminViews.renderDashboard(user.role, user);
      else if (route === 'design-handoff') mc.innerHTML = AdminViews.renderDesignHandoff();
      else if (route === 'design-changes') mc.innerHTML = AdminViews.renderAllDesignChanges();
      else if (route === 'programs')       mc.innerHTML = AdminViews.renderPrograms();
      else if (route === 'design-costing') mc.innerHTML = AdminViews.renderDesignCostingView(routeParam, user.role);
      else if (route === 'cost-summary')   mc.innerHTML = AdminViews.renderDesignCostingView(routeParam, user.role);
      else if (route === 'recost-queue')   mc.innerHTML = AdminViews.renderRecostQueue();
      else mc.innerHTML = AdminViews.renderDashboard(user.role, user);
    } else if (isProdDev) {
      if (route === 'dashboard')           mc.innerHTML = AdminViews.renderDashboard(user.role, user);
      else if (route === 'fabric-standards') {
        mc.innerHTML = '<div class="empty-state"><div class="icon">🧵</div><h3>Loading…</h3></div>';
        AdminViews.renderFabricStandards(user.role, user.tcId).then(html => { mc.innerHTML = html; });
        return;
      }
      else mc.innerHTML = AdminViews.renderDashboard(user.role, user);
    } else {
      // TC / Vendor routes — guard against admin route access
      const tcForbidden = ['programs','styles','cost-summary','compare','cross-program',
        'trading-companies','internal','coo','pending-changes','staff','buy-summary','customers',
        'design-handoff','sales-request','design-changes'];
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
        const prog = API.Programs.get(programId);
        const styles = API.Styles.byProgram(programId);
        const asgns = API.Assignments.byProgram(programId);
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
    const p = id ? API.Programs.get(id) : null;
    const seasons = ['N/A', 'Q1', 'Q2', 'Q3', 'Q4'];
    const years = ['2026', '2027', '2028', '2029', '2030'];
    // Draw Brand options from distinct brands across InternalPrograms
    const brands  = (() => { const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort(); return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head']; })();
    const TIERS  = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
    const GENDERS = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
    showModal(`
    <div class="modal-header"><h2>${p ? 'Edit' : 'New'} Program</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveProgramModal(event,'${id || ''}')">
      
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Brand</label>
          <select class="form-select" id="pm-brand" onchange="App._autoFillProgName()">
            <option value="">— Select Brand —</option>
            ${brands.map(b => `<option${(p?.brand || '') === b ? ' selected' : ''}>${b}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Retailer / Tier</label>
          <select class="form-select" id="pm-retailer" onchange="App._autoFillProgName()">
            <option value="">— Select Retailer —</option>
            ${TIERS.map(t => `<option${(p?.retailer || '') === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
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
        <div class="form-group"><label class="form-label">Gender</label>
          <select class="form-select" id="pm-gender" onchange="App._autoFillProgName()">
            ${['', ...GENDERS].map(g => `<option value="${g}" ${(p?.gender || '') === g ? 'selected' : ''}>${g || '— Select —'}</option>`).join('')}
          </select>
        </div>
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
        <div class="form-group"><label class="form-label">End Date</label>
          <div class="date-picker-wrap">
            <input class="form-input" type="date" id="pm-end-date" value="${p?.endDate || ''}" onclick="this.showPicker&&this.showPicker()">
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
  }

  function onInternalProgramChange(ipId) {
    const id = ipId || v('pm-ip'); if (!id) return;
  }

  async function saveProgramModal(e, id) {
    e.preventDefault();
    const brand    = v('pm-brand');
    const retailer = v('pm-retailer');
    const gender   = v('pm-gender') || null;

    // Name: use the explicit field if user typed something, otherwise auto-generate
    const manualName = (document.getElementById('pm-name')?.value || '').trim();
    const autoName   = [brand, retailer, gender].filter(Boolean).join(' · ');
    const name       = manualName || autoName || 'Unnamed Program';

    // Look up target margin from BrandTierMargins (brand+tier combo)
    const targetMargin = DB.BrandTierMargins.lookup(brand, retailer) || 0;

    // Auto-resolve best matching InternalProgram (Brand+Retailer+Gender, then Brand+Retailer)
    const ips = DB.InternalPrograms.all();
    const matchedIp =
      ips.find(ip => ip.brand === brand && ip.tier === retailer && ip.gender === gender) ||
      ips.find(ip => ip.brand === brand && ip.tier === retailer) ||
      null;

    const data = {
      internalProgramId: matchedIp?.id || null,
      brand,
      name,
      targetMargin,
      season: v('pm-season'),
      year: v('pm-year'),
      retailer,
      gender,
      market: v('pm-market'),
      status: v('pm-status'),
      startDate: v('pm-start-date') || null,
      endDate: v('pm-end-date') || null,
      crdDate: v('pm-crd') || null,
    };
    if (id) await API.Programs.update(id, data); else await API.Programs.create(data);
    closeModal(); navigate('programs');
  }

  async function updateProgramStatus(id, status) { await API.Programs.update(id, { status }); navigate('programs'); }
  async function deleteProgram(id) { if (confirm('Delete this program?')) { await API.Programs.delete(id); navigate('programs'); } }

  // ── Styles ─────────────────────────────────────────────────
  function openStyleModal(programId, styleId) {
    const s = styleId ? API.Styles.get(styleId) : null;
    const prog = API.Programs.get(programId);
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
    const sell = nv('s-sell'); const prog = API.Programs.get(state.routeParam);
    const el = $('s-ldp-preview'); if (!el) return;
    if (sell && prog?.targetMargin) {
      const ldp = (sell * prog.targetMargin).toFixed(2);
      el.style.display = ''; el.textContent = `Target LDP: $${ldp}`;
    } else { el.style.display = 'none'; }
  }

  async function saveStyle(e, programId, styleId) {
    e.preventDefault();
    const data = { programId, styleNumber: v('s-num'), styleName: v('s-name'), category: v('s-cat'), fabrication: v('s-fab'), projQty: nv('s-qty'), projSellPrice: nv('s-sell'), dutyRate: nv('s-duty'), specialPackaging: nv('s-spkg'), market: v('s-market') };
    if (styleId) await API.Styles.update(styleId, data); else await API.Styles.create(data);
    closeModal(); navigate(state.route, state.routeParam);
  }

  async function deleteStyle(id) { if (confirm('Delete style?')) { await API.Styles.delete(id); navigate(state.route, state.routeParam); } }

  // ── Trading Company Assignment ─────────────────────────────
  function openAssignTCs(programId) {
    const tcs = API.cache.tradingCompanies;
    const assigned = API.Assignments.byProgram(programId).map(a => a.tcId);
    showModal(`
    <div class="modal-header"><h2>🏭 Assign Trading Companies</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <p class="mb-3">Select which trading companies to share this program with. Each TC can quote from any of their COOs.</p>
    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg-elevated)">
          <tr>
            <th style="width:40px;padding:10px 12px;text-align:center"><input type="checkbox" id="tc-check-all" onchange="document.querySelectorAll('.assign-tc-chk').forEach(c=>c.checked=this.checked)" title="Select all"></th>
            <th style="padding:10px 12px;text-align:left;font-size:0.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Code</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Name</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">COOs</th>
          </tr>
        </thead>
        <tbody>
          ${tcs.map((tc, i) => `
          <tr style="border-top:1px solid var(--border);cursor:pointer" onclick="this.querySelector('input').click()">
            <td style="padding:10px 12px;text-align:center" onclick="event.stopPropagation()">
              <input type="checkbox" class="assign-tc-chk" data-tcid="${tc.id}" value="${tc.id}" ${assigned.includes(tc.id) ? 'checked' : ''}>
            </td>
            <td style="padding:10px 12px;font-weight:600;font-size:0.88rem">${tc.code}</td>
            <td style="padding:10px 12px;font-size:0.88rem">${tc.name}</td>
            <td style="padding:10px 12px;font-size:0.8rem;color:#94a3b8">${(tc.coos||[]).join(', ')||'—'}</td>
          </tr>`).join('')}
          ${tcs.length === 0 ? `<tr><td colspan="4" style="padding:24px;text-align:center;color:#94a3b8">No trading companies configured yet.</td></tr>` : ''}
        </tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.saveAssignments('${programId}')">Save</button>
    </div>`);
  }

  async function saveAssignments(programId) {
    const tcIds = [...document.querySelectorAll('.assign-tc-chk:checked')].map(el => el.value);
    await API.Assignments.assign(programId, tcIds);
    closeModal(); navigate(state.route, state.routeParam);
  }

  // ── Trading Company CRUD ────────────────────────────────────
  function openTCModal(id) {
    const tc = id ? API.TradingCompanies.get(id) : null;
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

  async function saveTC(e, id) {
    e.preventDefault();
    const coos = [...document.querySelectorAll('#tc-coo-chips input:checked')].map(cb => cb.value);
    const data = { code: v('tc-code'), name: v('tc-name'), email: v('tc-email'), coos, paymentTerms: v('tc-terms') || 'FOB', ...(v('tc-pwd') ? { password: v('tc-pwd') } : {}) };
    if (id) await API.TradingCompanies.update(id, data); else await API.TradingCompanies.create(data);
    closeModal(); navigate('trading-companies');
  }

  async function deleteTC(id) { if (confirm('Delete trading company?')) { await API.TradingCompanies.delete(id); navigate('trading-companies'); } }

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

  async function confirmUpload(programId) {
    if (!_pendingRows?.length) return;
    await API.Styles.bulkCreate(programId, _pendingRows); _pendingRows = null;
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

    const existing = API.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    const oldValue = existing?.[field] ?? null;
    const hasChanged = value !== null && String(value) !== String(oldValue);

    const doSave = async (reason) => {
      const updateData = { tcId, styleId, coo, [field]: value };
      if (existing) Object.assign(updateData, existing, { [field]: value });
      if (value != null && updateData.status === 'skipped') delete updateData.status;
      await API.Submissions.upsert(updateData);
      // Server handles revision tracking automatically during upsert
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
    const existing = API.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
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

  async function confirmSkipVendorCoo(styleId, tcId, coo) {
    const reasonEl = document.getElementById('skip-reason-input');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) { reasonEl?.classList.add('input-error'); return; }
    await API.Submissions.upsert({ tcId, styleId, coo, status: 'skipped', skipReason: reason, fob: null, factoryCost: null });
    closeModal();
    navigate(state.route, state.routeParam);
  }

  async function unskipVendorCoo(styleId, tcId, coo) {
    await API.Submissions.upsert({ tcId, styleId, coo, status: 'submitted', skipReason: null, fob: null, factoryCost: null });
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
    const styles = API.Assignments.stylesByTc(tcId);
    const tc = API.TradingCompanies.get(tcId);
    const hdrs = 'Style #,Style Name,COO,FOB,Factory Cost,TC Markup %,Payment Terms,MOQ,Lead Time (days),Comments';
    const rows = styles.map(s => `${s.styleNumber},${s.styleName},${(tc?.coos || [])[0] || ''},,,,,,,`);
    const blob = new Blob([hdrs + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quote_template.csv'; a.click();
  }

  let _pendingVendorRows = null;
  function processVendorUpload(file, tcId) {
    const reader = new FileReader();
    reader.onload = ev => {
      const tc = API.TradingCompanies.get(tcId);
      const styles = API.Assignments.stylesByTc(tcId);
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

  async function confirmVendorUpload(tcId) {
    if (!_pendingVendorRows?.length) return;
    for (const row of _pendingVendorRows) {
      await API.Submissions.upsert({ tcId, styleId: row.styleId, coo: row.coo, fob: row.fob, factoryCost: row.factoryCost, tcMarkup: row.tcMarkup, paymentTerms: row.paymentTerms, moq: row.moq, leadTime: row.leadTime, vendorComments: row.vendorComments });
    }
    _pendingVendorRows = null; closeModal(); navigate('my-styles');
  }

  // ── Internal Programs ──────────────────────────────────────
  function openInternalProgramModal(id) {
    const ip = id ? DB.InternalPrograms.get(id) : null;
    const BRANDS  = ['Reebok','Champion','And1','Gaiam','Head'];
    const TIERS   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
    const GENDERS = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
    const selOpts = (arr, cur) => arr.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('');

    showModal(`
    <div class="modal-header"><h2>${ip ? 'Edit' : 'Add'} Internal Program</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
    <form onsubmit="App.saveInternalProgram(event,'${id || ''}')">
      <div class="form-row form-row-3">
        <div class="form-group">
          <label class="form-label">Brand *</label>
          <select class="form-select" id="ip-brand" onchange="App._ipAutoMargin()" required>
            <option value="">— Select —</option>
            ${selOpts(BRANDS, ip?.brand)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tier of Distribution *</label>
          <select class="form-select" id="ip-tier" onchange="App._ipAutoMargin()" required>
            <option value="">— Select —</option>
            ${selOpts(TIERS, ip?.tier)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Gender *</label>
          <select class="form-select" id="ip-gender" required>
            <option value="">— Select —</option>
            ${selOpts(GENDERS, ip?.gender)}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin %
          <span class="text-muted text-sm" style="font-weight:400"> — auto-filled from Brand+Tier; override if needed</span>
        </label>
        <input class="form-input" id="ip-margin" type="number" step="0.1" min="0" max="100"
          value="${ip ? (ip.targetMargin * 100).toFixed(1) : ''}" placeholder="e.g. 55 = 55%" required>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${ip ? 'Save' : 'Add'}</button>
      </div>
    </form>`);
  }

  function saveInternalProgram(e, id) {
    e.preventDefault();
    const brand  = document.getElementById('ip-brand')?.value  || '';
    const tier   = document.getElementById('ip-tier')?.value   || '';
    const gender = document.getElementById('ip-gender')?.value || '';
    DB.InternalPrograms.upsert({
      id: id || undefined,
      name: `${brand} · ${tier} · ${gender}`,
      brand, tier, gender,
      targetMargin: nv('ip-margin') / 100,
    });
    closeModal(); navigate('internal');
  }
  function deleteInternalProgram(id) { if (confirm('Delete?')) { DB.InternalPrograms.delete(id); navigate('internal'); } }

  // Auto-fill margin in Internal Program modal when Brand+Tier change
  function _ipAutoMargin() {
    const brand = document.getElementById('ip-brand')?.value || '';
    const tier  = document.getElementById('ip-tier')?.value  || '';
    if (!brand || !tier) return;
    const m = DB.BrandTierMargins.lookup(brand, tier);
    if (m != null) {
      const el = document.getElementById('ip-margin');
      if (el) el.value = (m * 100).toFixed(1);
    }
  }

  function _ipAutoMarginPropose() {
    const brand = document.getElementById('pip-brand')?.value || '';
    const tier  = document.getElementById('pip-tier')?.value  || '';
    if (!brand || !tier) return;
    const m = DB.BrandTierMargins.lookup(brand, tier);
    if (m != null) {
      const el = document.getElementById('pip-margin');
      if (el) el.value = (m * 100).toFixed(1);
    }
  }

  // ── Brand-Tier Margins CRUD ────────────────────────────────
  function openBrandTierMarginModal(id, preBrand, preTier) {
    const m = id ? DB.BrandTierMargins.get(id) : null;
    const BRANDS = ['Reebok','Champion','And1','Gaiam','Head'];
    const TIERS  = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
    const selOpts = (arr, cur) => arr.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('');
    const titleBrand = m?.brand || preBrand || '';
    const titleTier  = m?.tier  || preTier  || '';
    showModal(`
    <div class="modal-header">
      <div>
        <h2>${m ? 'Edit' : 'Set'} Brand-Tier Margin</h2>
        <p class="text-muted text-sm">${titleBrand}${titleBrand && titleTier ? ' · ' : ''}${titleTier}</p>
      </div>
      <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
    </div>
    <form onsubmit="App.saveBrandTierMargin(event,'${id || ''}')">
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">Brand *</label>
          <select class="form-select" id="btm-brand" required ${m ? 'disabled' : ''}>
            <option value="">— Select —</option>
            ${selOpts(BRANDS, m?.brand || preBrand)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tier *</label>
          <select class="form-select" id="btm-tier" required ${m ? 'disabled' : ''}>
            <option value="">— Select —</option>
            ${selOpts(TIERS, m?.tier || preTier)}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin % *</label>
        <input class="form-input" id="btm-margin" type="number" step="0.1" min="0" max="100"
          value="${m ? (m.targetMargin * 100).toFixed(1) : ''}" placeholder="e.g. 55 = 55%" required>
      </div>
      <div class="modal-footer">
        ${m ? `<button type="button" class="btn btn-danger" onclick="App.deleteBrandTierMargin('${m.id}')">Delete</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${m ? 'Save' : 'Set Margin'}</button>
      </div>
    </form>`);
  }

  function saveBrandTierMargin(e, id) {
    e.preventDefault();
    // When editing, brand/tier selects are disabled — read from existing record
    const existing = id ? DB.BrandTierMargins.get(id) : null;
    const brand  = existing?.brand || document.getElementById('btm-brand')?.value  || '';
    const tier   = existing?.tier  || document.getElementById('btm-tier')?.value   || '';
    const margin = parseFloat(document.getElementById('btm-margin')?.value || '');
    if (!brand || !tier) { alert('Brand and Tier are required.'); return; }
    if (isNaN(margin))   { alert('Target Margin is required.'); return; }
    DB.BrandTierMargins.upsert({ id: id || undefined, brand, tier, targetMargin: margin / 100 });
    closeModal();
    navigate('internal');
  }

  function deleteBrandTierMargin(id) {
    if (confirm('Remove this Brand-Tier margin setting?')) {
      DB.BrandTierMargins.delete(id);
      closeModal();
      navigate('internal');
    }
  }


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

  // ── Buy Summary keyboard navigation ─────────────────────────
  function buyMoveDown(e, inp) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    // Save current cell first
    inp.blur();

    // Find this input's column index within its row
    const td    = inp.closest('td');
    const tr    = td.closest('tr');
    const tbody = tr.closest('tbody');
    if (!tbody) return;

    const tdIdx  = Array.from(tr.cells).indexOf(td);
    const rows   = Array.from(tbody.rows);
    const rowIdx = rows.indexOf(tr);
    const dir    = (e.key === 'ArrowUp' || e.shiftKey) ? -1 : 1;
    const target = rows[rowIdx + dir];
    if (!target) return;

    const nextTd    = target.cells[tdIdx];
    const nextInput = nextTd?.querySelector('input');
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  }

  // ── Buy Summary ─────────────────────────────────────────────
  async function saveBuyInline(styleId, customerId, programId, field, el) {
    const raw = parseFloat(el.value.replace(/[^0-9.]/g, ''));
    const val = isNaN(raw) ? null : raw;
    if (val === null && !el.value.trim()) {
      await API.CustomerBuys.delete(programId, styleId, customerId);
    } else if (val !== null) {
      await API.CustomerBuys.upsert({ programId, styleId, customerId, [field]: val });
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
    const current = new Set(API.CustomerAssignments.byProgram(programId));
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

  async function saveCustomerAssignments(programId) {
    const all = API.cache.customers;
    const selected = all.filter(c => document.getElementById(`cca-${c.id}`)?.checked).map(c => c.id);
    await API.CustomerAssignments.assign(programId, selected);
    closeModal(); navigate('buy-summary', programId);
  }

  // ── Buy Template Download ─────────────────────────────────
  function downloadBuyTemplate(programId) {
    const prog    = API.Programs.get(programId);
    const styles  = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const custIds = API.CustomerAssignments.byProgram(programId);
    const custs   = custIds.map(id => DB.Customers.get(id)).filter(Boolean);
    if (!custs.length) { alert('Assign customers to this program before downloading the template.'); return; }

    // Header row: fixed cols + per-customer pair
    const fixedHdrs = ['Style #', 'Style Name', 'Category', 'Fabrication'];
    const custHdrs  = custs.flatMap(c => [`${c.code} - Units`, `${c.code} - Sell Price`]);
    const header    = [...fixedHdrs, ...custHdrs].join(',');

    // Existing buy data to pre-fill
    const allBuys = API.CustomerBuys.byProgram(programId);

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
    const custIds = API.CustomerAssignments.byProgram(programId);
    const custs   = custIds.map(id => DB.Customers.get(id)).filter(Boolean);
    const styles  = API.Styles.byProgram(programId);

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

  async function confirmBuyUpload() {
    if (!_pendingBuyRows) return;
    const { programId, rows } = _pendingBuyRows;
    for (const { style, buys } of rows) {
      for (const b of buys) {
        const existing = API.CustomerBuys.get(programId, style.id, b.customerId) || {};
        await API.CustomerBuys.upsert({
          programId, styleId: style.id, customerId: b.customerId,
          qty:       b.qty       != null ? b.qty       : existing.qty,
          sellPrice: b.sellPrice != null ? b.sellPrice : existing.sellPrice,
        });
      }
    }
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
  async function confirmFlag(e, subId) { e.preventDefault(); await API.Submissions.flag(subId, v('flag-reason')); closeModal(); renderRoute(); }
  async function unflagSub(id) { await API.Submissions.unflag(id); renderRoute(); }
  async function acceptSub(id) { await API.Submissions.accept(id); renderRoute(); }

  // ── Place/Unplace ──────────────────────────────────────────
  async function placeStyle(styleId, tcId, coo, fob) {
    await API.Placements.place({ styleId, tcId, coo, confirmedFob: parseFloat(fob) });
    await API.Styles.update(styleId, { status: 'placed' });
    renderRoute();
  }
  async function unplaceStyle(styleId) {
    await API.Placements.unplace(styleId);
    await API.Styles.update(styleId, { status: 'open' });
    renderRoute();
  }

  // ── Cancel / Restore Style ─────────────────────────────────
  async function cancelStyle(styleId, programId) {
    await API.Styles.update(styleId, { status: 'cancelled' });
    navigate('cost-summary', programId);
  }

  async function uncancelStyle(styleId, programId) {
    await API.Styles.update(styleId, { status: 'open' });
    navigate('cost-summary', programId);
  }

  // ── Remove TC from Cost Summary ────────────────────────────
  async function removeTCFromProgram(tcId, programId) {
    if (!confirm('Remove this trading company from the program?')) return;
    const remaining = API.Assignments.byProgram(programId)
      .map(a => a.tcId)
      .filter(id => id !== tcId);
    await API.Assignments.assign(programId, remaining);
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
  async function saveStyleInline(styleId, inputEl) {
    const field = inputEl.dataset.field;
    const raw = inputEl.value.trim();
    const numericFields = ['projQty', 'projSellPrice', 'dutyRate', 'estFreight', 'specialPackaging'];
    let value = numericFields.includes(field) ? (raw === '' ? null : parseFloat(raw)) : raw;
    if (numericFields.includes(field) && isNaN(value)) value = null;
    await API.Styles.update(styleId, { [field]: value });
    // Update the Target LDP cell in this row — find it by data-col
    const row = inputEl.closest('tr');
    if (!row) return;
    const prog = API.Programs.get(state.routeParam);
    const style = API.Styles.get(styleId);
    if (prog && style) {
      const targetLDP = DB.computeTargetLDP(style, prog);
      const tldpCell = row.querySelector('td[data-col="tldp"]');
      if (tldpCell) tldpCell.textContent = targetLDP ? '$' + parseFloat(targetLDP).toFixed(2) : '—';
    }

    // When dutyRate or projQty changes, recalculate all per-TC×COO cells in this row
    if (['dutyRate', 'projQty', 'specialPackaging'].includes(field) && style) {
      const fmt = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
      const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
      const allSubs = API.Submissions.byStyle(styleId);
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
        const tcObj = API.TradingCompanies.get(tcId);
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
  async function saveSubmissionInline(styleId, tcId, coo, inputEl) {
    const field = inputEl.dataset.field;
    const raw = inputEl.value.trim().replace(/^\$/, ''); // strip currency prefix
    const value = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && isNaN(value)) return; // invalid — don't save

    // Upsert submission with the changed field (server handles revision tracking)
    const updateData = { tcId, styleId, coo, [field]: value };
    await API.Submissions.upsert(updateData);

    // Refresh calculated cells (Duty%, Duty/unit, Freight/unit, LDP/unit) in the same row
    const row = inputEl.closest('tr');
    if (!row) return;
    const style = API.Styles.get(styleId);
    const prog = API.Programs.get(state.routeParam);
    const sub = API.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
    if (!sub || !sub.fob) return;
    // Use TC-level payment terms, not submission-level
    const tc = API.TradingCompanies.get(tcId);
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
  async function saveTCTermsInline(tcId, programId, selectEl) {
    const terms = selectEl.value;
    // Persist the TC-level payment terms
    await API.TradingCompanies.update(tcId, { paymentTerms: terms });
    const tc = API.TradingCompanies.get(tcId);

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
        const style = API.Styles.get(styleId);
        const sub = API.Submissions.all().find(s => s.tcId === tcId && s.styleId === styleId && s.coo === coo);
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
    $('quote-form').onsubmit = async e => {
      e.preventDefault();
      await API.Submissions.upsert({ styleId, tcId, coo: v('q-coo'), fob: nv('q-fob'), factoryCost: nv('q-factory'), tcMarkup: nv('q-tcmu') ? nv('q-tcmu') / 100 : null, paymentTerms: v('q-terms'), moq: nv('q-moq'), leadTime: nv('q-lead'), vendorComments: v('q-comments') });
      closeModal(); navigate('my-styles');
    };
  }

  // Admin enters cost on behalf of TC for a specific COO
  function openAdminCostEntry(styleId, tcId, coo) {
    const tc = API.TradingCompanies.get(tcId);
    showModal(VendorViews.quoteForm(styleId, tcId, coo), 'modal-lg');
    const h = document.querySelector('.modal h2');
    if (h) h.innerHTML = `✏ Enter Cost — <span style="color:var(--accent)">${tc?.code} (${coo})</span>`;
    $('quote-form').onsubmit = async e => {
      e.preventDefault();
      await API.Submissions.upsert({ styleId, tcId, coo, fob: nv('q-fob'), factoryCost: nv('q-factory'), tcMarkup: nv('q-tcmu') ? nv('q-tcmu') / 100 : null, paymentTerms: v('q-terms'), moq: nv('q-moq'), leadTime: nv('q-lead'), vendorComments: v('q-comments'), enteredByAdmin: true });
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
        const statusMatch = !status || statusCell.includes(status);
        row.style.display = (nameMatch && statusMatch) ? '' : 'none';
      });
    }
  }

  function filterCrossProgram() {
    const programs = API.cache.programs.filter(p => p.status === 'Costing');
    const allStyles = API.Styles.all().filter(s => programs.some(p => p.id === s.programId));
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
  async function fmtBlurQty(el, styleId) {
    const raw = el.type === 'number' ? el.value.trim() : el.value.trim();
    el.type = 'text';
    const num = raw === '' ? null : parseFloat(raw);
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? Number(num).toLocaleString() : '';
    await API.Styles.update(styleId, { projQty: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Called onblur: save currency field (Sell, EstFreight), reformat as $0.00
  async function fmtBlurCurrency(el, styleId, field) {
    const raw = el.value.replace(/[^0-9.]/g, '').trim();
    el.type = 'text';
    const num = raw === '' ? null : parseFloat(raw);
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? '$' + num.toFixed(2) : '';
    await API.Styles.update(styleId, { [field]: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Called onblur: save duty rate, reformat as XX.X%
  // Accepts both decimal (0.282) and percent (28.2) input
  async function fmtBlurDuty(el, styleId) {
    const raw = el.value.replace(/[^0-9.]/g, '').trim();
    el.type = 'text';
    let num = raw === '' ? null : parseFloat(raw);
    // If user typed a value > 1.0 treat as percentage, convert to decimal
    if (num != null && num > 1.0) num = num / 100;
    el.dataset.raw = num != null ? String(num) : '';
    el.value = num != null ? (num * 100).toFixed(1) + '%' : '';
    await API.Styles.update(styleId, { dutyRate: num });
    _refreshRowAfterStyleChange(styleId, el.closest('tr'));
  }

  // Shared: refresh Target LDP and duty/freight/ldp cells after a style field changes
  function _refreshRowAfterStyleChange(styleId, row) {
    if (!row) return;
    const prog = API.Programs.get(state.routeParam);
    const style = API.Styles.get(styleId);
    if (!prog || !style) return;
    const targetLDP = DB.computeTargetLDP(style, prog);
    const tldpCell = row.querySelector('td[data-col="tldp"]');
    if (tldpCell) tldpCell.textContent = targetLDP ? '$' + parseFloat(targetLDP).toFixed(2) : '—';
    const fmtD = v => (v != null && !isNaN(v)) ? '$' + parseFloat(v).toFixed(2) : '—';
    const pctD = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const allSubs = API.Submissions.byStyle(styleId);
    row.querySelectorAll('td[data-col$="_duty_pct"]').forEach(cell => {
      const colKey = cell.dataset.col.replace('_duty_pct', '');
      const lastUnderscore = colKey.lastIndexOf('_');
      if (lastUnderscore < 0) return;
      const tcId = colKey.substring(0, lastUnderscore);
      const coo  = colKey.substring(lastUnderscore + 1);
      const sub = allSubs.find(s => s.tcId === tcId && s.coo === coo);
      if (!sub || !sub.fob) return;
      const tcObj = API.TradingCompanies.get(tcId);
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
    const prog   = API.Programs.get(programId);
    const styles = API.Styles.byProgram(programId);
    const asgns  = API.Assignments.byProgram(programId);
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
  async function placeAllStyles(programId) {
    if (!confirm('Mark ALL active styles as placed and set program status to Placed?')) return;
    await API.Programs.placeAll(programId);
    App.openMarginRecap(programId, true); // true = show "just placed" banner
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
    const u    = userId ? DB.PCUsers.allStaff().find(s => s.id === userId) : null;
    const depts = DB.Departments.all();
    const deptOpts = depts.map(d => `<option value="${d.id}" ${u?.departmentId === d.id ? 'selected' : ''}>${d.name}</option>`).join('');
    showModal(`
      <div class="modal-header"><h2>${u ? 'Edit' : 'Add'} Staff Member</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <input id="staff-name"  class="input" placeholder="Full Name"   value="${u?.name  || ''}">
        <input id="staff-email" class="input" placeholder="Email"       value="${u?.email || ''}">
        <input id="staff-pwd"   class="input" type="password" placeholder="${u ? 'New password (leave blank to keep)' : 'Password'}">
        <div>
          <label class="form-label" style="margin-bottom:4px">Department</label>
          <select id="staff-dept" class="form-select">
            <option value="">— No Department —</option>
            ${deptOpts}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveStaff('${userId || ''}')">Save</button>
      </div>`);
  }

  function saveStaff(userId) {
    const name   = (document.getElementById('staff-name')?.value  || '').trim();
    const email  = (document.getElementById('staff-email')?.value || '').trim();
    const pwd    = (document.getElementById('staff-pwd')?.value   || '').trim();
    const deptId = (document.getElementById('staff-dept')?.value  || '') || null;
    if (!name || !email) return alert('Name and email are required.');
    if (userId) {
      const upd = { name, email, departmentId: deptId };
      if (pwd) upd.password = pwd;
      DB.PCUsers.update(userId, upd);
    } else {
      if (!pwd) return alert('Password is required for new accounts.');
      DB.PCUsers.create({ name, email, password: pwd, departmentId: deptId });
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
    const tc = tcId ? API.TradingCompanies.get(tcId) : null;
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
    proposeSetting('tc', tcId ? 'update' : 'create', data, tcId ? API.TradingCompanies.get(tcId) : null);
    closeModal();
    alert('✅ Proposal submitted for Admin review.');
    navigate('trading-companies');
  }

  function openProposeIPModal(ipId) {
    const ip = ipId ? DB.InternalPrograms.get(ipId) : null;
    const BRANDS  = ['Reebok','Champion','And1','Gaiam','Head'];
    const TIERS   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
    const GENDERS = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
    const selOpts = (arr, cur) => arr.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('');
    showModal(`
      <div class="modal-header"><h2>${ip ? `Propose Edit: ${[ip.brand,ip.tier,ip.gender].filter(Boolean).join(' · ')}` : 'Propose New Internal Program'}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Brand</label>
            <select id="pip-brand" class="form-select" onchange="App._ipAutoMarginPropose()">
              <option value="">— Select —</option>${selOpts(BRANDS, ip?.brand)}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Tier</label>
            <select id="pip-tier" class="form-select" onchange="App._ipAutoMarginPropose()">
              <option value="">— Select —</option>${selOpts(TIERS, ip?.tier)}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Gender</label>
            <select id="pip-gender" class="form-select">
              <option value="">— Select —</option>${selOpts(GENDERS, ip?.gender)}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Target Margin % (auto-fills from Brand+Tier)</label>
          <input id="pip-margin" class="input" type="number" step="0.1" min="0" max="100" placeholder="e.g. 55" value="${ip ? (ip.targetMargin*100).toFixed(1) : ''}">
        </div>
        <p class="text-muted text-sm">Your proposal will be sent to Admin for approval.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitProposeIP('${ipId || ''}')">Submit Proposal</button>
      </div>`);
  }

  function submitProposeIP(ipId) {
    const brand  = document.getElementById('pip-brand')?.value  || '';
    const tier   = document.getElementById('pip-tier')?.value   || '';
    const gender = document.getElementById('pip-gender')?.value || '';
    const name   = [brand, tier, gender].filter(Boolean).join(' · ');
    const marginRaw = parseFloat(document.getElementById('pip-margin')?.value || '');
    const targetMargin = isNaN(marginRaw) ? undefined : marginRaw / 100;
    if (!brand || !tier || !gender) return alert('Brand, Tier and Gender are required.');
    const data = ipId
      ? { id: ipId, name, brand, tier, gender, targetMargin }
      : { name, brand, tier, gender, targetMargin };
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
    // Use fixed positioning so menu appears at cursor regardless of scroll
    menu.style.left = Math.min(event.clientX, window.innerWidth - 200) + 'px';
    menu.style.top  = Math.min(event.clientY, window.innerHeight - 180) + 'px';
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
    const allStyles  = API.Styles.all();
    const allSubs    = API.Submissions.all();
    const allPlacements = JSON.parse(localStorage.getItem('vcp_placements') || '[]');
    const allPrograms   = API.cache.programs;

    // Collect all past styles (any program) matching styleNum
    const pastStyles = allStyles.filter(s => (s.styleNumber || '').trim() === styleNum.trim());

    // Build run entries: one per program this style appeared in
    const runs = pastStyles.map(s => {
      const prog = allPrograms.find(p => p.id === s.programId);
      const pl   = allPlacements.find(p => p.styleId === s.id);
      const subs = allSubs.filter(sub => sub.styleId === s.id);
      const tc   = pl ? API.TradingCompanies.get(pl.tcId) : null;
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
    const sub = API.Submissions.get(subId);
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

    const tcName = API.TradingCompanies.get(sub?.tcId)?.name || sub?.tcId || '?';
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
    const placement = API.Placements.get(styleId);
    const isPlaced = placement?.tcId === tcId && placement?.coo === coo;

    const isLight = document.body.dataset.theme === 'light';
    const menuBg      = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(18,18,32,0.97)';
    const menuBorder  = isLight ? 'rgba(15,23,42,0.12)'    : 'rgba(255,255,255,0.12)';
    const menuShadow  = isLight ? '0 8px 32px rgba(0,0,0,0.15)' : '0 8px 32px rgba(0,0,0,.55)';
    const dividerColor= isLight ? 'rgba(15,23,42,0.08)'    : 'rgba(255,255,255,0.07)';
    const labelColor  = isLight ? '#64748b' : '#64748b';

    const menu = document.createElement('div');
    menu.id = 'cell-highlight-menu';
    menu.style.cssText = `position:fixed;z-index:9998;top:${e.clientY}px;left:${e.clientX}px;
      background:${menuBg};border:1px solid ${menuBorder};border-radius:10px;
      padding:6px;min-width:190px;box-shadow:${menuShadow};backdrop-filter:blur(12px);
      font-family:var(--font);`;
    menu.innerHTML = `
      <div style="font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${labelColor};padding:5px 10px 3px">Highlight Cell</div>
      <button class="cm-item" onclick="App.setCellHighlight('considering','${styleId}','${tcId}','${coo}','${subId}',${fob})">
        <span style="color:#eab308">⬤</span> ${isConsidering ? '✓ ' : ''}Considering
      </button>
      <button class="cm-item" onclick="App.setCellHighlight('placed','${styleId}','${tcId}','${coo}','${subId}',${fob})">
        <span style="color:#22c55e">⬤</span> ${isPlaced ? '✓ ' : ''}Order Placed
      </button>
      <div style="border-top:1px solid ${dividerColor};margin:4px 0"></div>
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

  async function setCellHighlight(action, styleId, tcId, coo, subId, fob) {
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
      await API.Placements.place({ styleId, tcId, coo, confirmedFob: parseFloat(fob) || 0 });
    } else if (action === 'clear') {
      // Clear both
      if (tag) {
        const list = JSON.parse(localStorage.getItem(considerKey) || '[]');
        const idx = list.indexOf(tag);
        if (idx >= 0) { list.splice(idx, 1); localStorage.setItem(considerKey, JSON.stringify(list)); }
      }
      const existing = API.Placements.get(styleId);
      if (existing?.tcId === tcId && existing?.coo === coo) await API.Placements.unplace(styleId);
    }
    const styles = API.Styles.all();
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
    toggleRoleSwitcher();
    // Logout current user and pre-fill login form with selected account's email
    API.Auth.logout().then(() => {
      state.user = null;
      const ls = document.getElementById('login-screen');
      const ml = document.getElementById('main-layout');
      if (ls) ls.style.display = '';
      if (ml) ml.style.display = 'none';
      const emailEl = document.getElementById('login-email');
      const pwdEl   = document.getElementById('login-password');
      if (emailEl) emailEl.value = acct.email;
      if (pwdEl)   { pwdEl.value = ''; pwdEl.focus(); }
      const form = document.getElementById('login-form');
      if (form) form.onsubmit = login;
    });
  }


  // ==========================================================
  // STYLE LINKING
  // ==========================================================

  let _linkModeActive = false;

  function _buildStyleLinkModal(programId, linkId, preIds) {
    const prog    = API.Programs.get(programId);
    const styles  = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
    const lnk     = linkId ? DB.StyleLinks.get(linkId) : null;
    const linked  = new Set(DB.StyleLinks.linkedStyleIds(programId));
    // When editing, the group's own style IDs are not "taken" by another group
    if (lnk) (lnk.styleIds || []).forEach(id => linked.delete(id));
    const preChecked = new Set(preIds || (lnk ? lnk.styleIds : []));
    const tcs = API.Assignments.byProgram(programId).map(a => API.TradingCompanies.get(a.tcId)).filter(Boolean);

    const items = styles.map(s => {
      const isLinkedElsewhere = !preChecked.has(s.id) && linked.has(s.id);
      const chk = preChecked.has(s.id) ? 'checked' : '';
      const dis = isLinkedElsewhere ? 'disabled' : '';
      const cls = isLinkedElsewhere ? 'is-linked' : '';
      return `<label class="style-link-check-item ${cls}">
        <input type="checkbox" class="sl-modal-chk" data-sid="${s.id}" ${chk} ${dis} onchange="App._onSlModalChk()">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.83rem">${s.styleNumber} <span class="text-muted" style="font-weight:400">${s.styleName||''}</span></div>
          <div class="text-muted" style="font-size:0.72rem">${(s.fabrication||'').substring(0,50)||'—'} · ${s.projQty ? Number(s.projQty).toLocaleString() + ' units' : 'No qty'}</div>
        </div>
        ${isLinkedElsewhere ? '<span class="tag" style="font-size:0.68rem;flex-shrink:0">In group</span>' : ''}
      </label>`;
    }).join('');

    const tcOpts = `<option value="">No preference</option>` +
      tcs.map(tc => `<option value="${tc.id}" ${lnk?.preferredTcId === tc.id ? 'selected' : ''}>${tc.code} — ${tc.name}</option>`).join('');

    return `
      <div class="modal-header">
        <h2>${lnk ? '✏ Edit Link Group' : '🔗 New Placement Link Group'}</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">
        <div>
          <div class="form-label" style="margin-bottom:8px">Select Styles to Link <span class="text-muted" style="font-weight:400;font-size:0.78rem">(select 2 or more)</span></div>
          <div class="style-link-checklist">${items}</div>
        </div>
        <div id="sl-anchor-preview" class="style-link-anchor-preview" style="display:none"></div>
        <div class="form-group">
          <label class="form-label">Note</label>
          <textarea id="sl-note" class="form-input" rows="2" placeholder="e.g. Same factory — lining + shell. Hit minimums together.">${lnk?.note||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred Vendor <span class="text-muted" style="font-weight:400;font-size:0.78rem">(suggestion only, not enforced)</span></label>
          <select id="sl-tc" class="form-select">${tcOpts}</select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sl-save-btn" onclick="App.saveStyleLink('${programId}','${linkId||''}')">💾 Save Group</button>
      </div>`;
  }

  function openStyleLinkModal(programId, preIds) {
    showModal(_buildStyleLinkModal(programId, null, preIds || []), 'modal-lg');
    setTimeout(() => App._onSlModalChk(), 50);
  }

  function _onSlModalChk() {
    const checked = [...document.querySelectorAll('.sl-modal-chk:checked')].map(el => el.dataset.sid);
    const saveBtn = document.getElementById('sl-save-btn');
    if (saveBtn) saveBtn.disabled = checked.length < 2;
    // Anchor preview
    const preview = document.getElementById('sl-anchor-preview');
    if (!preview) return;
    if (checked.length < 2) { preview.style.display = 'none'; return; }
    // Find the style with max projQty among checked
    const styles = API.Styles.all();
    const members = checked.map(id => styles.find(s => s.id === id)).filter(Boolean);
    const anchor = members.reduce((best, s) => (parseFloat(s.projQty)||0) >= (parseFloat(best.projQty)||0) ? s : best, members[0]);
    const guests = members.filter(s => s.id !== anchor.id && (s.fabrication||'').trim() !== (anchor.fabrication||'').trim());
    if (!guests.length) { preview.style.display = 'none'; return; }
    preview.style.display = '';
    preview.innerHTML = `🔗 Anchor: <strong>${anchor.styleNumber}</strong> (${(anchor.fabrication||'—').substring(0,30)}, ${anchor.projQty ? Number(anchor.projQty).toLocaleString() : '?'} units)
      — ${guests.length} guest${guests.length>1?'s':''} will nest under its fabric group`;
  }

  function saveStyleLink(programId, linkId) {
    const checked = [...document.querySelectorAll('.sl-modal-chk:checked')].map(el => el.dataset.sid);
    if (checked.length < 2) { alert('Select at least 2 styles to link.'); return; }
    const note          = (document.getElementById('sl-note')?.value || '').trim();
    const preferredTcId = document.getElementById('sl-tc')?.value || null;
    const user          = state.user;
    const data = { programId, styleIds: checked, note, preferredTcId, createdBy: user?.id, createdByName: user?.name || user?.email };
    if (linkId) DB.StyleLinks.update(linkId, data);
    else        DB.StyleLinks.create(data);
    closeModal();
    navigate('styles', programId);
  }

  function editStyleLink(linkId, programId) {
    showModal(_buildStyleLinkModal(programId, linkId, null), 'modal-lg');
    setTimeout(() => App._onSlModalChk(), 50);
  }

  function deleteStyleLink(linkId, programId) {
    const lnk = DB.StyleLinks.get(linkId);
    if (!lnk) return;
    if (!confirm(`Remove this link group (${(lnk.styleIds||[]).length} styles)?`)) return;
    DB.StyleLinks.delete(linkId);
    navigate('styles', programId);
  }

  function openStyleLinkDetail(linkId, programId) {
    const lnk = DB.StyleLinks.get(linkId);
    if (!lnk) return;
    const styles = API.Styles.all();
    const members = (lnk.styleIds||[]).map(id => styles.find(s => s.id === id)).filter(Boolean);
    const prefTc  = lnk.preferredTcId ? API.TradingCompanies.get(lnk.preferredTcId) : null;
    const color   = lnk.color || '#6366f1';
    showModal(`
      <div class="modal-header">
        <h2 style="display:flex;align-items:center;gap:8px"><span style="color:${color}">🔗</span> Placement Link Group</h2>
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${members.map(s => `<span class="tag" style="background:${color}22;color:${color};border:1px solid ${color}44;font-size:0.8rem">${s.styleNumber}</span>`).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${members.map(s => `<div class="text-sm text-muted">${s.styleNumber}: ${(s.fabrication||'No fabric').substring(0,50)} · ${s.projQty ? Number(s.projQty).toLocaleString() + ' units' : '—'}</div>`).join('')}
        </div>
        ${lnk.note ? `<div style="padding:10px 14px;background:${color}11;border:1px solid ${color}33;border-radius:8px;font-size:0.85rem;font-style:italic">"${lnk.note}"</div>` : ''}
        ${prefTc ? `<div><span class="text-muted" style="font-size:0.78rem">Preferred vendor:</span> <span class="tag" style="margin-left:6px">${prefTc.code} — ${prefTc.name}</span></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.editStyleLink('${linkId}','${programId}');App.closeModal()">✏ Edit Group</button>
        <button class="btn btn-danger" onclick="App.deleteStyleLink('${linkId}','${programId}');App.closeModal()">🗑 Remove Group</button>
        <button class="btn btn-ghost" onclick="App.closeModal()">Close</button>
      </div>`);
  }

  // ── Link mode on Styles page ──
  function toggleStyleLinkMode(programId) {
    _linkModeActive = !_linkModeActive;
    const chkCol = document.getElementById('link-chk-col');
    if (chkCol) chkCol.style.display = _linkModeActive ? '' : 'none';
    document.querySelectorAll('[id^="link-chk-cell-"]').forEach(el => { el.style.display = _linkModeActive ? '' : 'none'; });
    document.querySelectorAll('.style-link-chk').forEach(el => { if (!el.disabled) el.checked = false; });
    const btn = document.getElementById('link-mode-btn');
    if (btn) {
      btn.textContent = _linkModeActive ? '✕ Cancel Linking' : '🔗 Link Styles';
      btn.className   = _linkModeActive ? 'btn btn-warning' : 'btn btn-secondary';
    }
    const fab = document.getElementById('link-fab');
    if (fab) fab.style.display = 'none';
    onStyleLinkCheck(programId);
  }

  function onStyleLinkCheck(programId) {
    const checked = [...document.querySelectorAll('.style-link-chk:checked')];
    const fab = document.getElementById('link-fab');
    const cnt = document.getElementById('link-fab-count');
    if (!fab) return;
    if (!_linkModeActive || checked.length < 2) {
      fab.style.display = 'none';
    } else {
      fab.style.display = 'flex';
      if (cnt) cnt.textContent = `${checked.length} style${checked.length > 1 ? 's' : ''} selected`;
    }
  }

  function openStyleLinkFromSelection(programId) {
    const ids = [...document.querySelectorAll('.style-link-chk:checked')].map(el => el.dataset.sid);
    if (ids.length < 2) { alert('Select at least 2 styles.'); return; }
    _linkModeActive = false;
    // Clean up link mode UI
    document.querySelectorAll('[id^="link-chk-cell-"]').forEach(el => el.style.display = 'none');
    const fab = document.getElementById('link-fab');
    if (fab) fab.style.display = 'none';
    openStyleLinkModal(programId, ids);
  }

  function cancelStyleLinkMode(programId) {
    _linkModeActive = true;
    toggleStyleLinkMode(programId);
  }

  return {
    init, login, logout, navigate, openProgram, openCostComparison,
    _login: login, // direct ref for inline onsubmit="App._login(event)" in HTML
    _autoFillProgName: function() {
      const nameEl = document.getElementById('pm-name');
      if (!nameEl || nameEl.dataset.manual) return; // don't overwrite if user typed manually
      const brand    = (document.getElementById('pm-brand')?.value    || '').trim();
      const retailer = (document.getElementById('pm-retailer')?.value || '').trim();
      const gender   = (document.getElementById('pm-gender')?.value   || '').trim();
      nameEl.value = [brand, retailer, gender].filter(Boolean).join(' · ');
    },
    openProgramModal, onInternalProgramChange, saveProgramModal, updateProgramStatus, deleteProgram,
    openStyleModal, previewTargetLDP, saveStyle, deleteStyle,
    openAssignTCs, saveAssignments,
    openAssignCustomers, saveCustomerAssignments,
    saveBuyInline, buyMoveDown,
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
    placeStyle, placeAllStyles, cancelStyle, uncancelStyle,
    filterCrossProgram, toggleCancelledRows,
    setProgramsView, filterPrograms,
    toggleConsidering, saveStyleNote,
    openCellHighlightMenu, setCellHighlight, closeCellMenu,
    // Settings modals (previously missing)
    openInternalProgramModal, saveInternalProgram, deleteInternalProgram,
    _ipAutoMargin, _ipAutoMarginPropose,
    openBrandTierMarginModal, saveBrandTierMargin, deleteBrandTierMargin,
    openTCModal, saveTC, deleteTC, saveCoo, deleteCoo, openCooModal,
    approvePendingChange, rejectPendingChange, proposeSetting,
    openStaffModal, saveStaff,
    // Formatting helpers used by inline inputs
    fmtFocusRaw, fmtFocusDuty, fmtBlurQty, fmtBlurCurrency, fmtBlurDuty,
    // unplaceStyle alias
    unplaceStyle: async (styleId) => { await API.Placements.unplace(styleId); navigate(state.route, state.routeParam); },
    closeModal, closeModalOutside,
    showModal,
    _stateRef: state,
    // Style linking
    openStyleLinkModal, saveStyleLink, editStyleLink, deleteStyleLink,
    openStyleLinkDetail, toggleStyleLinkMode, onStyleLinkCheck,
    openStyleLinkFromSelection, cancelStyleLinkMode,
    // Multi-select system — defined outside IIFE as App.xxx = function()
    // onStyleSelect, selectAllStyles, clearStyleSelection,
    // bulkLinkStyles, bulkUnlinkStyles, bulkCancelStyles, bulkRequestRecost,
    _onSlModalChk,
  };



})();

// =============================================================
// PERMISSIONS HELPER
// =============================================================

// Resolve the current user's effective permissions from their department.
// Returns a plain object — callers should NOT mutate it.
App.getPerms = function() {
  const user = App._stateRef?.user || null;
  const FULL = { canViewFOB: true, canViewSellPrice: true, canEdit: true, canEditTechPack: true, canEditSellStatus: true, isAdmin: false, brandFilter: [], tierFilter: [] };
  if (!user) return { ...FULL, canEdit: false };
  if (user.role === 'admin') return { ...FULL, isAdmin: true };
  if (user.role === 'vendor') return { canViewFOB: true, canViewSellPrice: false, canEdit: true, canEditTechPack: false, canEditSellStatus: false, isAdmin: false, brandFilter: [], tierFilter: [] };
  const dept = user.departmentId ? API.Departments.get(user.departmentId) : null;
  if (!dept) {
    // Legacy role-based fallback — Sales/Planning NEVER see FOB/LDP
    if (user.role === 'design')      return { canViewFOB: false, canViewSellPrice: false, canEdit: false, canEditTechPack: true,  canEditSellStatus: false, canEditTechNotes: false, isAdmin: false, brandFilter: [], tierFilter: [] };
  if (user.role === 'tech_design') return { canViewFOB: false, canViewSellPrice: false, canEdit: false, canEditTechPack: false, canEditSellStatus: false, canEditTechNotes: true,  isAdmin: false, brandFilter: [], tierFilter: [] };
  if (user.role === 'prod_dev')    return { canViewFOB: false, canViewSellPrice: false, canEdit: false, canEditTechPack: false, canEditSellStatus: false, canEditTechNotes: false, isAdmin: false, brandFilter: [], tierFilter: [] };
    if (user.role === 'planning') return { canViewFOB: false, canViewSellPrice: true,  canEdit: false, canEditTechPack: false, canEditSellStatus: true,  isAdmin: false, brandFilter: [], tierFilter: [] };
    return FULL;
  }
  // Design and regular Sales: FOB/LDP always hidden
  // Sales Management (dept-sales-price) gets FOB from their dept setting (true)
  const isSalesMgmt = user.role === 'planning' && user.departmentId === 'dept-sales-price';
  const forcedFOBOff = !isSalesMgmt && (user.role === 'planning' || user.role === 'design');
  return {
    canViewFOB:        forcedFOBOff ? false : !!dept.canViewFOB,
    canViewSellPrice:  user.role === 'design' ? false : !!dept.canViewSellPrice,
    canEdit:           !!dept.canEdit,
    canEditTechPack:   !!dept.canEditTechPack,
    canEditSellStatus: !!dept.canEditSellStatus,
    isAdmin:           false,
    brandFilter:       dept.brandFilter || [],
    tierFilter:        dept.tierFilter  || [],
  };
};

// Filter an array of programs/handoffs/SRs by the current user's brand+tier filter
App.filterByPerms = function(items) {
  const perms = App.getPerms();
  if (!perms.brandFilter.length && !perms.tierFilter.length) return items;
  return items.filter(p => {
    const brand = p.brand || p.brand || '';
    const tier  = p.retailer || p.tier || '';
    if (perms.brandFilter.length && !perms.brandFilter.includes(brand)) return false;
    if (perms.tierFilter.length  && !perms.tierFilter.includes(tier))   return false;
    return true;
  });
};

// =============================================================
// DEPARTMENT MANAGEMENT
// =============================================================

const TIERS_LIST  = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];

App.openDepartmentModal = function(deptId) {
  const d = deptId ? DB.Departments.get(deptId) : null;
  const allBrands = [...new Set(DB.BrandTierMargins.all().map(b => b.brand))].sort();
  const brandChecks = allBrands.map(b => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.82rem;white-space:nowrap">
      <input type="checkbox" class="dept-brand-chk" value="${b}" ${(d?.brandFilter||[]).includes(b) ? 'checked' : ''}> ${b}
    </label>`).join('');
  const tierChecks = TIERS_LIST.map(t => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.82rem;white-space:nowrap">
      <input type="checkbox" class="dept-tier-chk" value="${t}" ${(d?.tierFilter||[]).includes(t) ? 'checked' : ''}> ${t}
    </label>`).join('');

  App.showModal(`
    <div class="modal-header">
      <h2>${d ? 'Edit Department' : 'New Department'}</h2>
      <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;padding:4px 0">
      <div class="form-group">
        <label class="form-label">Department Name *</label>
        <input id="dept-name" class="form-input" value="${d?.name||''}" placeholder="e.g. Sales – West Region">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input id="dept-desc" class="form-input" value="${d?.description||''}" placeholder="Brief description of this department's role">
      </div>

      <div>
        <div class="form-label" style="margin-bottom:10px">Permissions</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="dept-fob"  ${d?.canViewFOB       !== false ? 'checked' : ''} style="width:16px;height:16px">
            <div><div style="font-size:0.88rem;font-weight:500">View Vendor Pricing (FOB / LDP)</div>
            <div style="font-size:0.76rem;color:#94a3b8">Can see trading company FOB costs in the cost matrix</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="dept-sell" ${d?.canViewSellPrice  !== false ? 'checked' : ''} style="width:16px;height:16px">
            <div><div style="font-size:0.88rem;font-weight:500">View Sales Pricing (Proj Sell)</div>
            <div style="font-size:0.76rem;color:#94a3b8">Can see projected sell prices and buyer pricing</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="dept-edit" ${d?.canEdit           !== false ? 'checked' : ''} style="width:16px;height:16px">
            <div><div style="font-size:0.88rem;font-weight:500">Edit Data</div>
            <div style="font-size:0.76rem;color:#94a3b8">Can create, modify, and delete records (vs. read-only)</div></div>
          </label>
        </div>
      </div>

      <div>
        <div class="form-label" style="margin-bottom:4px">Brand Filter <span style="font-size:0.76rem;color:#94a3b8;font-weight:400">(leave all unchecked to show all brands)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${brandChecks}</div>
      </div>

      <div>
        <div class="form-label" style="margin-bottom:4px">Tier Filter <span style="font-size:0.76rem;color:#94a3b8;font-weight:400">(leave all unchecked to show all tiers)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${tierChecks}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.saveDepartment('${deptId||''}')">Save Department</button>
    </div>
  `, 'modal-lg');
};

App.saveDepartment = function(deptId) {
  const name = (document.getElementById('dept-name')?.value || '').trim();
  if (!name) return alert('Department name is required.');
  const data = {
    name,
    description:     (document.getElementById('dept-desc')?.value || '').trim(),
    canViewFOB:      document.getElementById('dept-fob')?.checked  ?? true,
    canViewSellPrice:document.getElementById('dept-sell')?.checked ?? true,
    canEdit:         document.getElementById('dept-edit')?.checked ?? true,
    brandFilter: [...document.querySelectorAll('.dept-brand-chk:checked')].map(c => c.value),
    tierFilter:  [...document.querySelectorAll('.dept-tier-chk:checked')].map(c => c.value),
  };
  if (deptId) DB.Departments.update(deptId, data);
  else        DB.Departments.create(data);
  App.closeModal();
  App.navigate('departments');
};

App.deleteDepartment = function(deptId) {
  const d = DB.Departments.get(deptId);
  if (!d) return;
  const count = DB.Departments.memberCount(deptId);
  if (!confirm(`Delete "${d.name}"?${count ? ` ${count} user(s) will lose their department assignment.` : ''}`)) return;
  DB.Departments.delete(deptId);
  App.navigate('departments');
};

// =============================================================
// RE-COSTING REQUESTS  (v13)
// =============================================================

App.openRecostRequestModal = function(styleId, programId) {
  const s = API.Styles.all().find(x => x.id === styleId);
  if (!s) return;
  App.showModal(`
    <div class="modal-header">
      <h2>↩ Request Re-costing</h2>
      <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
    </div>
    <p class="text-muted text-sm mb-3">Flag <strong>${s.styleNumber}${s.styleName ? ' — ' + s.styleName : ''}</strong> for re-costing. Production will review and release to vendors.</p>
    <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
      <div class="form-group">
        <label class="form-label">Change Category</label>
        <select id="rcr-cat" class="form-select">
          <option value="Design Change">Design Change</option>
          <option value="Fabric Change">Fabric Change</option>
          <option value="Quantity Change">Quantity Change</option>
          <option value="Spec Change">Spec / Tech Change</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Note <span class="text-muted" style="font-weight:400;font-size:0.78rem">(what changed?)</span></label>
        <textarea id="rcr-note" class="form-input" rows="3" placeholder="e.g. Changing shell fabric to Tencel blend — need new FOB from all TCs"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="App.saveRecostRequest('${styleId}','${programId}')">⚠ Submit Request</button>
    </div>`);
};

App.saveRecostRequest = async function(styleId, programId) {
  const note     = (document.getElementById('rcr-note')?.value || '').trim();
  const category = document.getElementById('rcr-cat')?.value || 'Other';
  const user     = App._stateRef?.user || {};
  await API.RecostRequests.create({
    programId, styleId, note, category,
    requestedBy: user.id, requestedByName: user.name || user.email,
  });
  App.closeModal();
  App.navigate('design-costing', programId);
};

// Production: release a style for re-costing

// Sales: approve re-cost request → advances to Production
App.salesApproveRecost = async function(reqId, programId) {
  const req = API.RecostRequests.get(reqId);
  if (!req) return;
  if (!confirm('Approve this re-cost request? It will be forwarded to Production for release to TCs.')) return;
  const user = App._stateRef?.user || App._getState()?.user || {};
  await API.RecostRequests.salesApprove(reqId, user.id, user.name || user.email);
  App.navigate(App._stateRef?.route || 'cost-summary', programId || req.programId);
};

// Sales: reject re-cost request — returns to Design
App.salesRejectRecost = async function(reqId, programId) {
  const note = prompt('Reason for rejecting (returned to Design):') || '';
  if (note === null) return; // user cancelled prompt
  await API.RecostRequests.reject(reqId, note, 'sales');
  App.navigate(App._stateRef?.route || 'cost-summary', programId);
};

App.releaseRecosting = async function(reqId, programId) {
  const req = API.RecostRequests.get(reqId);
  if (!req) return;
  if (!['pending_production','pending'].includes(req.status)) {
    alert('This request must be approved by Sales before Production can release it.'); return;
  }
  if (!confirm('Release this re-cost request to Trading Companies? Existing quotes will be marked outdated.')) return;
  const user = App._stateRef?.user || {};
  await API.RecostRequests.release(reqId, user.id, user.name || user.email);
  // Server bumps program version automatically during release

  App.navigate(App._stateRef?.route || 'cost-summary', programId || req.programId);
};

// Production/Sales: reject a re-cost request
App.rejectRecostRequest = async function(reqId, programId, stage) {
  const note = prompt('Reason for rejecting (optional):') || '';
  if (note === null) return; // cancelled
  await API.RecostRequests.reject(reqId, note, stage || 'production');
  App.navigate(App._stateRef?.route || 'cost-summary', programId);
};

// Inline dept status save — no full re-render needed
// ══════════════════════════════════════════════════════════════════
// Multi-Select Style Action System
// Checkbox-driven selection across Cost Summary & Design Costing View.
// ══════════════════════════════════════════════════════════════════
App._sel = new Set();          // selected style IDs
App._selProgramId = null;

App.onStyleSelect = function(styleId, checked, programId) {
  App._selProgramId = programId;
  if (checked) App._sel.add(styleId);
  else         App._sel.delete(styleId);
  // Highlight the row
  const row = document.querySelector(`tr[data-style-id="${styleId}"]`);
  if (row) row.classList.toggle('style-row-selected', checked);
  App._updateSelFAB();
};

App.selectAllStyles = function(programId, checked) {
  App._selProgramId = programId;
  document.querySelectorAll('.style-sel-chk').forEach(chk => {
    if (chk.disabled) return;
    chk.checked = checked;
    const sid = chk.dataset.sid;
    if (sid) {
      if (checked) App._sel.add(sid);
      else         App._sel.delete(sid);
      const row = document.querySelector(`tr[data-style-id="${sid}"]`);
      if (row) row.classList.toggle('style-row-selected', checked);
    }
  });
  App._updateSelFAB();
};

App.clearStyleSelection = function() {
  App._sel.clear();
  document.querySelectorAll('.style-sel-chk').forEach(chk => { chk.checked = false; });
  document.querySelectorAll('tr.style-row-selected').forEach(r => r.classList.remove('style-row-selected'));
  const selAll = document.getElementById('sel-all-chk');
  if (selAll) selAll.checked = false;
  App._updateSelFAB();
};

App._updateSelFAB = function() {
  const fab = document.getElementById('sel-fab');
  if (!fab) return;
  const n = App._sel.size;
  if (n === 0) { fab.style.display = 'none'; return; }

  fab.style.display = 'flex';
  const countEl = document.getElementById('sel-fab-count');
  if (countEl) countEl.textContent = `${n} style${n > 1 ? 's' : ''} selected`;

  // Enable/disable context-sensitive buttons
  const linkBtn    = document.getElementById('sel-fab-link');
  const unlinkBtn  = document.getElementById('sel-fab-unlink');
  if (linkBtn)   linkBtn.disabled   = n < 2;
  if (unlinkBtn) unlinkBtn.disabled = n < 1;
};

// ── Bulk Actions ──────────────────────────────────────────────────

App.bulkLinkStyles = function(programId) {
  if (App._sel.size < 2) { alert('Select at least 2 styles to link.'); return; }
  App.openStyleLinkModal(programId, [...App._sel]);
  App.clearStyleSelection();
};

App.bulkUnlinkStyles = function() {
  if (!App._sel.size) return;
  const count = App._sel.size;
  if (!confirm(`Remove link groups from ${count} style${count > 1 ? 's' : ''}?`)) return;
  App._sel.forEach(styleId => {
    const lnk = DB.StyleLinks ? DB.StyleLinks.byStyle(styleId) : null;
    if (lnk) DB.StyleLinks.delete(lnk.id);
  });
  App.clearStyleSelection();
  App.navigate(App._stateRef?.route, App._selProgramId);
};

App.bulkCancelStyles = async function() {
  if (!App._sel.size) return;
  const count = App._sel.size;
  const pid   = App._selProgramId;
  if (!confirm(`Cancel ${count} style${count > 1 ? 's' : ''}? This cannot be undone easily.`)) return;
  for (const styleId of App._sel) await API.Styles.update(styleId, { status: 'cancelled' });
  App.clearStyleSelection();
  App.navigate(App._stateRef?.route, pid);
};

App.bulkRequestRecost = function(programId) {
  // Open a single shared re-cost modal for all selected styles
  const ids   = [...App._sel];
  const pid   = programId || App._selProgramId;
  const names = ids.map(id => {
    const s = API.Styles.all().find(x => x.id === id);
    return s ? `${s.styleNumber}${s.styleName ? ' — ' + s.styleName : ''}` : id;
  });
  App.showModal(`
    <div class="modal-header">
      <h2>↩ Bulk Re-cost Request</h2>
      <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
    </div>
    <p class="text-muted text-sm mb-3">Requesting re-costing for <strong>${ids.length} style${ids.length > 1 ? 's' : ''}</strong>:</p>
    <ul style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 16px 16px;padding:0">
      ${names.map(n => `<li>${n}</li>`).join('')}
    </ul>
    <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
      <div class="form-group">
        <label class="form-label">Change Category</label>
        <select id="rcr-cat" class="form-select">
          <option value="Design Change">Design Change</option>
          <option value="Fabric Change">Fabric Change</option>
          <option value="Quantity Change">Quantity Change</option>
          <option value="Spec Change">Spec / Tech Change</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Note <span class="text-muted" style="font-weight:400;font-size:0.78rem">(what changed?)</span></label>
        <textarea id="rcr-note" class="form-input" rows="3" placeholder="e.g. Changing shell fabric to Tencel blend…"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="App._saveBulkRecost('${pid}')">⚠ Submit for All</button>
    </div>`);
};

App._saveBulkRecost = async function(programId) {
  const note     = (document.getElementById('rcr-note')?.value || '').trim();
  const category = document.getElementById('rcr-cat')?.value || 'Other';
  const user     = App._stateRef?.user || {};
  for (const styleId of App._sel) {
    await API.RecostRequests.create({
      programId, styleId, note, category,
      requestedBy: user.id, requestedByName: user.name || user.email,
    });
  }
  App.closeModal();
  App.clearStyleSelection();
  App.navigate(App._stateRef?.route, programId);
};

App.saveStyleDeptStatus = async function(styleId, field, value, note, recostRequestId) {
  const prev = API.Styles.get(styleId)?.[field] || null;
  await API.Styles.update(styleId, { [field]: value || null });

  // Append to tech pack history via dedicated endpoint
  if (field === 'techPackStatus' && value !== prev) {
    const user = App._getState()?.user || {};
    try {
      await fetch(`/api/styles/${styleId}/tech-pack-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vcp_token')}` },
        body: JSON.stringify({
          status: value || null,
          previousStatus: prev,
          changedBy: user.name || user.email || 'Unknown',
          note: note || null,
          recostRequestId: recostRequestId || null,
        }),
      });
    } catch (_) { /* non-critical */ }
  }
};

// ── Drag-Fill for Sell Status cells ─────────────────────────────────────────
// Works like Excel fill handle: drag the ⣿ grip downward to copy the value
App._dcvDrag = null;

App.startDcvDrag = function(e, styleId, field) {
  e.preventDefault();
  e.stopPropagation();
  const sel = document.querySelector(`select[data-style-id="${styleId}"][data-field="${field}"]`);
  if (!sel) return;
  App._dcvDrag = { field, value: sel.value, startStyleId: styleId, highlighted: [] };
  document.addEventListener('mousemove', App._dcvDragMove);
  document.addEventListener('mouseup',   App._dcvDragEnd, { once: true });
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
};

App._dcvDragMove = function(e) {
  const drag = App._dcvDrag;
  if (!drag) return;

  const allSelects = [...document.querySelectorAll(`select[data-field="${drag.field}"]`)];
  const startEl    = allSelects.find(s => s.dataset.styleId === drag.startStyleId);
  const startIdx   = allSelects.indexOf(startEl);
  if (startIdx < 0) return;

  // Find which row the mouse is currently over
  let endIdx = startIdx;
  allSelects.forEach((sel, i) => {
    const row = sel.closest('tr');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) endIdx = i;
  });

  // Only drag downward (from start to end)
  const minIdx = Math.min(startIdx, endIdx);
  const maxIdx = Math.max(startIdx, endIdx);

  // Clear old highlights
  document.querySelectorAll('tr.dcv-drag-preview').forEach(r => r.classList.remove('dcv-drag-preview'));
  drag.highlighted = [];

  // Highlight cells in range (excluding the drag source row itself)
  for (let i = minIdx; i <= maxIdx; i++) {
    if (i === startIdx) continue;
    const row = allSelects[i]?.closest('tr');
    if (row && !row.classList.contains('cs-group-row')) {
      row.classList.add('dcv-drag-preview');
      drag.highlighted.push(allSelects[i].dataset.styleId);
    }
  }
};

App._dcvDragEnd = function() {
  document.removeEventListener('mousemove', App._dcvDragMove);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  const drag = App._dcvDrag;
  App._dcvDrag = null;
  if (!drag || !drag.highlighted.length) {
    document.querySelectorAll('tr.dcv-drag-preview').forEach(r => r.classList.remove('dcv-drag-preview'));
    return;
  }
  // Apply the value to all highlighted rows
  drag.highlighted.forEach(styleId => {
    const sel = document.querySelector(`select[data-style-id="${styleId}"][data-field="${drag.field}"]`);
    if (sel) {
      sel.value = drag.value;
      App.saveStyleDeptStatus(styleId, drag.field, drag.value);
    }
  });
  document.querySelectorAll('tr.dcv-drag-preview').forEach(r => r.classList.remove('dcv-drag-preview'));
};

// Show cost history modal for a style (accessible to all roles)
App.showCostHistory = function(styleId, styleName) {
  const timeline = AdminViews.renderCostHistoryTimeline(styleId);
  const content = timeline || `<p class="text-muted text-sm" style="text-align:center;padding:24px 0">No cost history events recorded yet.</p>`;
  App.openModal(`
    <div class="modal-header">
      <h3 style="font-size:1rem;font-weight:700;margin:0">📋 Cost History</h3>
      <div class="text-muted text-sm" style="margin-top:2px">${styleName || styleId}</div>
    </div>
    <div class="modal-body" style="padding:16px 20px 20px">
      ${content}
    </div>
    <div class="modal-footer" style="padding:12px 20px;border-top:1px solid var(--border)">
      <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
    </div>
  `);
};

// Cost Summary: renders pending re-cost banner — role-aware (Sales sees pending_sales, PC sees pending_production)
App._renderRecostBanner = function(programId) {
  if (!API.RecostRequests) return '';
  const user    = App._getState()?.user || App._stateRef?.user || {};
  const role    = user.role || '';
  const dept    = (user.department || '').toLowerCase();
  const isSales = dept.includes('sales');
  const isPC    = role === 'admin' || role === 'pc';

  const all     = API.RecostRequests.byProgram(programId);
  const forSales = all.filter(r => r.status === 'pending_sales' || r.status === 'pending');
  const forProd  = all.filter(r => r.status === 'pending_production');

  const toShow = isSales ? forSales : isPC ? [...forSales, ...forProd] : forSales;
  if (!toShow.length) return '';

  const allStyles = API.Styles.byProgram(programId);
  const stageLabel = r => ({
    pending_sales: '<span style="color:#f59e0b;font-weight:600">⏳ Awaiting Sales Approval</span>',
    pending:       '<span style="color:#f59e0b;font-weight:600">⏳ Awaiting Sales Approval</span>',
    pending_production: '<span style="color:#3b82f6;font-weight:600">⚙ Awaiting Production Release</span>',
  }[r.status] || '');

  const cards = toShow.map(r => {
    const s   = allStyles.find(x => x.id === r.styleId);
    const dt  = new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const isPendingSales = r.status === 'pending_sales' || r.status === 'pending';
    const isPendingProd  = r.status === 'pending_production';

    let actions = '';
    if (isSales && isPendingSales) {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="App.salesApproveRecost('${r.id}','${programId}')">✅ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="App.salesRejectRecost('${r.id}','${programId}')">✕ Reject</button>`;
    } else if (isPC && isPendingProd) {
      actions = `
        <button class="btn btn-warning btn-sm" onclick="App.releaseRecosting('${r.id}','${programId}')">🔄 Release to TC</button>
        <button class="btn btn-danger btn-sm" onclick="App.rejectRecostRequest('${r.id}','${programId}','production')">✕ Reject</button>`;
    } else if (isPC && isPendingSales) {
      actions = `<span class="text-muted text-sm" style="font-style:italic">Pending Sales</span>`;
    }

    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;
            background:var(--bg-elevated);border-radius:8px;border:1px solid rgba(245,158,11,0.25)">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700">${s?.styleNumber||r.styleId}</span>
          <span class="text-muted text-sm">${s?.styleName||''}</span>
          <span class="tag" style="font-size:0.7rem;background:rgba(245,158,11,0.12);color:#f59e0b">${r.category||'Change'}</span>
          ${stageLabel(r)}
        </div>
        <div class="text-muted" style="font-size:0.72rem;margin-top:3px">${dt} · requested by ${r.requestedByName||'?'}</div>
        ${r.note ? `<div style="font-size:0.8rem;font-style:italic;margin-top:4px;color:var(--text-secondary)">"${r.note}"</div>` : ''}
        ${r.salesApprovedByName ? `<div style="font-size:0.72rem;color:#22c55e;margin-top:3px">✅ Sales: ${r.salesApprovedByName}</div>` : ''}
      </div>
      ${actions ? `<div style="display:flex;gap:6px;flex-shrink:0;align-items:flex-start">${actions}</div>` : ''}
    </div>`;
  }).join('');

  const total = toShow.length;
  return `<div style="margin-bottom:16px;padding:14px 16px;border-left:4px solid #f59e0b;background:rgba(245,158,11,0.05);border-radius:0 8px 8px 0">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-weight:700;font-size:0.9rem">↩ Re-cost Requests</span>
      <span class="tag" style="background:rgba(245,158,11,0.18);color:#f59e0b">${total}</span>
      <a href="#" style="font-size:0.78rem;color:var(--accent);margin-left:auto" onclick="event.preventDefault();App.navigate('recost-queue')">View All →</a>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
  </div>`;
};

// =============================================================
// MARGIN RECAP MODAL

// =============================================================

// Internal state for slicer selections
App._recap = {
  programId: null,
  tcIds: new Set(),      // selected TCs (empty = all)
  custIds: new Set(),    // selected customers (empty = all)
  viewMode: 'tc',        // 'tc' | 'customer'
};

// ── Compute margin data for a program ─────────────────────────────────────────
App._computeRecap = function(programId) {
  const p      = API.Programs.get(programId);
  const styles = API.Styles.byProgram(programId).filter(s => s.status !== 'cancelled');
  const allTCs = API.Assignments.byProgram(programId).map(a => API.TradingCompanies.get(a.tcId)).filter(Boolean);
  const custIds= API.CustomerAssignments.byProgram(programId);
  const allCusts = custIds.map(id => DB.Customers.get(id)).filter(Boolean);

  // Build per-style data: resolve FOB + TC from Placement, then fall back to best submission
  const styleData = styles.map(s => {
    let fob = null, tcId = null, coo = '';
    const pl = API.Placements.get(s.id);
    if (pl) {
      fob  = parseFloat(pl.confirmedFob)  || null;
      tcId = pl.tcId;
      coo  = pl.coo || '';
    } else {
      const subs = API.Submissions.byStyle(s.id);
      if (subs.length) {
        const best = subs.find(sub => sub.status === 'accepted')
          || subs.reduce((a, b) => (parseFloat(a.fob)||9999) <= (parseFloat(b.fob)||9999) ? a : b);
        fob  = parseFloat(best.fob) || null;
        tcId = best.tcId;
        coo  = best.coo || '';
      }
    }
    const custBuys = API.CustomerBuys.byStyle(s.id);  // [{customerId, qty, sellPrice}]
    return {
      id: s.id, styleNumber: s.styleNumber, styleName: s.styleName,
      fabrication: s.fabrication || '',
      qty:       parseFloat(s.projQty)       || 0,
      sellPrice: parseFloat(s.projSellPrice) || 0,
      confirmedFob: fob, tcId, coo, custBuys,
    };
  });

  return { p, styleData, allTCs, allCusts };
};

// ── Aggregation helper ─────────────────────────────────────────────────────────
App._aggregateStyles = function(styleData, selectedTcIds, selectedCustIds) {
  const noTcFilter   = selectedTcIds.size  === 0;
  const noCustFilter = selectedCustIds.size === 0;
  const filtered = styleData.filter(s =>
    (noTcFilter   || selectedTcIds.has(s.tcId)) &&
    (noCustFilter || s.custBuys.length === 0 || s.custBuys.some(b => selectedCustIds.has(b.customerId)))
  );

  const total = filtered.reduce((acc, s) => {
    const customQty = (!noCustFilter && s.custBuys.length)
      ? s.custBuys.filter(b => selectedCustIds.has(b.customerId)).reduce((sum,b) => sum+(parseFloat(b.qty)||0), 0)
      : s.qty;
    const units   = customQty;
    const revenue = units * s.sellPrice;
    const fobCost = units * (s.confirmedFob || 0);
    return { styles: acc.styles + 1, units: acc.units + units,
             revenue: acc.revenue + revenue, fobCost: acc.fobCost + fobCost };
  }, { styles: 0, units: 0, revenue: 0, fobCost: 0 });

  // Group by TC
  const byTc = {};
  filtered.forEach(s => {
    const key  = s.tcId || '__unassigned__';
    if (!byTc[key]) byTc[key] = { tcId: s.tcId, count: 0, units: 0, revenue: 0, fobCost: 0 };
    const units   = s.qty;
    byTc[key].count++;
    byTc[key].units   += units;
    byTc[key].revenue += units * s.sellPrice;
    byTc[key].fobCost += units * (s.confirmedFob || 0);
  });

  // Group by Customer
  const byCust = {};
  filtered.forEach(s => {
    const buys = s.custBuys.length && !noCustFilter
      ? s.custBuys.filter(b => selectedCustIds.has(b.customerId))
      : s.custBuys.length
        ? s.custBuys
        : [{ customerId: '__program__', qty: s.qty, sellPrice: s.sellPrice }];
    buys.forEach(b => {
      const key = b.customerId;
      if (!byCust[key]) byCust[key] = { customerId: key, count: 0, units: 0, revenue: 0, fobCost: 0 };
      const u = parseFloat(b.qty) || s.qty;
      byCust[key].count++;
      byCust[key].units   += u;
      byCust[key].revenue += u * (parseFloat(b.sellPrice) || s.sellPrice);
      byCust[key].fobCost += u * (s.confirmedFob || 0);
    });
  });

  return { total, byTc, byCust };
};

// ── Rerender just the body of the recap modal ─────────────────────────────────
App._renderRecapBody = function() {
  const el = document.getElementById('recap-body');
  if (!el) return;
  const { programId, tcIds, custIds, viewMode } = App._recap;
  const { p, styleData, allTCs, allCusts } = App._computeRecap(programId);
  const { total, byTc, byCust } = App._aggregateStyles(styleData, tcIds, custIds);

  const pct   = v => (v * 100).toFixed(1) + '%';
  const cur   = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num   = v => v.toLocaleString('en-US');
  const margin = total.revenue > 0 ? (total.revenue - total.fobCost) / total.revenue : 0;
  const target = parseFloat(p?.targetMargin) || 0;
  const marginOk = margin >= target;
  const marginColor = marginOk ? '#22c55e' : margin >= target * 0.95 ? '#f59e0b' : '#ef4444';

  // Summary card
  const summaryCard = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px">
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px">
        <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Margin</div>
        <div style="font-size:1.8rem;font-weight:700;color:${marginColor};line-height:1">${pct(margin)}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">Target: ${target ? pct(target) : '—'}</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px">
        <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Units</div>
        <div style="font-size:1.5rem;font-weight:700;line-height:1">${num(total.units)}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">${total.styles} styles</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px">
        <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Revenue</div>
        <div style="font-size:1.5rem;font-weight:700;line-height:1">${cur(total.revenue)}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">Proj sell × units</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px">
        <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">FOB Cost</div>
        <div style="font-size:1.5rem;font-weight:700;line-height:1">${cur(total.fobCost)}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">Confirmed FOB</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px">
        <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Net</div>
        <div style="font-size:1.5rem;font-weight:700;line-height:1;color:${marginColor}">${cur(total.revenue - total.fobCost)}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">Revenue − FOB</div>
      </div>
    </div>`;

  // View toggle
  const viewToggle = `
    <div style="display:flex;gap:6px;margin-bottom:14px;align-items:center">
      <span style="font-size:0.8rem;color:#94a3b8;margin-right:4px">View by:</span>
      <button onclick="App._recapSetView('tc')" class="btn btn-sm ${viewMode==='tc'?'btn-primary':'btn-secondary'}" style="padding:4px 12px;font-size:0.8rem">Trading Company</button>
      <button onclick="App._recapSetView('customer')" class="btn btn-sm ${viewMode==='customer'?'btn-primary':'btn-secondary'}" style="padding:4px 12px;font-size:0.8rem">Customer</button>
    </div>`;

  // Breakdown table
  const colStyle = 'padding:10px 12px;text-align:right;font-size:0.83rem';
  const colStyleL = 'padding:10px 12px;text-align:left;font-size:0.83rem';
  const thStyle = 'padding:8px 12px;font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:500;text-align:right';
  const thStyleL = 'padding:8px 12px;font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:500;text-align:left';

  let tableRows = '';
  if (viewMode === 'tc') {
    Object.values(byTc).forEach(t => {
      const tc = allTCs.find(x => x.id === t.tcId);
      const name = tc ? tc.name : (t.tcId ? t.tcId : 'Unassigned');
      const m = t.revenue > 0 ? (t.revenue - t.fobCost) / t.revenue : 0;
      const mc = m >= target ? '#22c55e' : m >= target * 0.95 ? '#f59e0b' : '#ef4444';
      tableRows += `<tr style="border-top:1px solid var(--border)">
        <td style="${colStyleL}">${name}</td>
        <td style="${colStyle}">${t.count}</td>
        <td style="${colStyle}">${num(t.units)}</td>
        <td style="${colStyle}">${cur(t.revenue)}</td>
        <td style="${colStyle}">${cur(t.fobCost)}</td>
        <td style="${colStyle}">${cur(t.revenue - t.fobCost)}</td>
        <td style="${colStyle};color:${mc};font-weight:600">${pct(m)}</td>
      </tr>`;
    });
  } else {
    Object.values(byCust).forEach(c => {
      const cust = allCusts.find(x => x.id === c.customerId);
      const name = cust ? cust.name : (p?.retailer || 'Program Customer');
      const m = c.revenue > 0 ? (c.revenue - c.fobCost) / c.revenue : 0;
      const mc = m >= target ? '#22c55e' : m >= target * 0.95 ? '#f59e0b' : '#ef4444';
      tableRows += `<tr style="border-top:1px solid var(--border)">
        <td style="${colStyleL}">${name}</td>
        <td style="${colStyle}">${c.count}</td>
        <td style="${colStyle}">${num(c.units)}</td>
        <td style="${colStyle}">${cur(c.revenue)}</td>
        <td style="${colStyle}">${cur(c.fobCost)}</td>
        <td style="${colStyle}">${cur(c.revenue - c.fobCost)}</td>
        <td style="${colStyle};color:${mc};font-weight:600">${pct(m)}</td>
      </tr>`;
    });
    if (Object.keys(byCust).length === 0) {
      tableRows = `<tr><td colspan="7" style="padding:16px;text-align:center;color:#94a3b8;font-size:0.83rem">No customer assignments on this program. Use the Customers tab to assign.</td></tr>`;
    }
  }

  // Total row
  const totalM = total.revenue > 0 ? (total.revenue - total.fobCost) / total.revenue : 0;
  const totalMc = totalM >= target ? '#22c55e' : totalM >= target*0.95 ? '#f59e0b' : '#ef4444';
  const totalRow = `<tr style="border-top:2px solid var(--border);background:var(--bg-elevated);font-weight:600">
    <td style="${colStyleL}">Total</td>
    <td style="${colStyle}">${total.styles}</td>
    <td style="${colStyle}">${num(total.units)}</td>
    <td style="${colStyle}">${cur(total.revenue)}</td>
    <td style="${colStyle}">${cur(total.fobCost)}</td>
    <td style="${colStyle}">${cur(total.revenue - total.fobCost)}</td>
    <td style="${colStyle};color:${totalMc};font-weight:700">${pct(totalM)}</td>
  </tr>`;

  const table = `
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg-card)">
          <tr>
            <th style="${thStyleL}">${viewMode === 'tc' ? 'Trading Company' : 'Customer'}</th>
            <th style="${thStyle}">Styles</th>
            <th style="${thStyle}">Units</th>
            <th style="${thStyle}">Revenue</th>
            <th style="${thStyle}">FOB Cost</th>
            <th style="${thStyle}">Net</th>
            <th style="${thStyle}">Margin %</th>
          </tr>
        </thead>
        <tbody>${tableRows}${totalRow}</tbody>
      </table>
    </div>`;

  el.innerHTML = summaryCard + viewToggle + table;
};

// ── Toggle a slicer button ─────────────────────────────────────────────────────
App._recapToggle = function(type, id) {
  const key = type === 'tc' ? 'tcIds' : 'custIds';
  const set  = App._recap[key];
  if (id === '__ALL__') { set.clear(); }
  else { if (set.has(id)) set.delete(id); else set.add(id); }
  // Sync button active states
  document.querySelectorAll(`.recap-slicer-${type}`).forEach(btn => {
    const btnId = btn.dataset.id;
    const active = btnId === '__ALL__' ? set.size === 0 : set.has(btnId);
    btn.style.background = active ? 'var(--accent)' : 'var(--bg-elevated)';
    btn.style.color       = active ? '#fff'          : 'var(--text-primary)';
    btn.style.borderColor = active ? 'var(--accent)'  : 'var(--border)';
  });
  App._renderRecapBody();
};

App._recapSetView = function(mode) {
  App._recap.viewMode = mode;
  App._renderRecapBody();
};

// ── Main open function ─────────────────────────────────────────────────────────
App.openMarginRecap = function(programId, justPlaced) {
  const p = API.Programs.get(programId);
  if (!p) return;
  const { allTCs, allCusts } = App._computeRecap(programId);

  // Initialise state
  App._recap.programId = programId;
  App._recap.tcIds     = new Set();
  App._recap.custIds   = new Set();
  App._recap.viewMode  = 'tc';

  const meta = [p.brand, p.retailer, p.gender, [p.season, p.year].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const target = parseFloat(p?.targetMargin) || 0;

  // Build slicer buttons
  const slicerBtn = (type, id, label, active) => {
    const bg  = active ? 'var(--accent)'       : 'var(--bg-elevated)';
    const col = active ? '#fff'                : 'var(--text-primary)';
    const brd = active ? 'var(--accent)'       : 'var(--border)';
    return `<button class="recap-slicer-${type}" data-id="${id}" data-program="${programId}"
      onclick="App._recapToggle('${type}','${id}')"
      style="padding:5px 12px;border-radius:20px;border:1px solid ${brd};background:${bg};color:${col};font-size:0.78rem;cursor:pointer;transition:.15s">${label}</button>`;
  };

  const tcSlicers = `
    <div style="margin-bottom:16px">
      <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:500">Trading Companies</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${slicerBtn('tc','__ALL__','All TCs', true)}
        ${allTCs.map(tc => slicerBtn('tc', tc.id, tc.name, false)).join('')}
      </div>
    </div>`;

  const custSlicers = allCusts.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:0.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:500">Customers</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${slicerBtn('customer','__ALL__','All Customers', true)}
        ${allCusts.map(c => slicerBtn('customer', c.id, c.name, false)).join('')}
      </div>
    </div>` : '';

  const banner = justPlaced ? `
    <div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:1.2rem">🏆</span>
      <span style="font-size:0.85rem;font-weight:600;color:#22c55e">Program marked as Placed! Here is your margin recap.</span>
    </div>` : '';

  App.showModal(`
    <div class="modal-header" style="padding-bottom:6px">
      <div>
        <h2 style="margin:0;font-size:1.15rem">📊 Margin Recap</h2>
        <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px">${meta}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${justPlaced ? `<button class="btn btn-secondary btn-sm" onclick="App.closeModal();App.navigate('cost-summary','${programId}')">View Program</button>` : ''}
        <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
      </div>
    </div>
    <div style="padding:4px 0 16px">
      ${banner}
      ${tcSlicers}
      ${custSlicers}
      <div id="recap-body"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      ${justPlaced ? `<button class="btn btn-primary" onclick="App.closeModal();App.navigate('cost-summary','${programId}')">View Program →</button>` : ''}
    </div>
  `, 'modal-xl');

  // Render the reactive body immediately
  App._renderRecapBody();
};

// =============================================================
// THEME TOGGLE

// =============================================================
App.toggleTheme = function() {

  const current = document.body.getAttribute('data-theme') || 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('vcp_theme', next);
  // Update all toggle button instances in the sidebar
  document.querySelectorAll('#theme-icon').forEach(el  => { el.textContent = next === 'light' ? '☀️' : '🌙'; });
  document.querySelectorAll('#theme-label').forEach(el => { el.textContent = next === 'light' ? 'Light Mode' : 'Dark Mode'; });
};

// Apply saved theme immediately (before first render) to avoid flash
(function applyThemeOnLoad() {
  const saved = localStorage.getItem('vcp_theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
})();

// =============================================================
// PRE-COSTING WORKFLOW HANDLERS (v11)
// Outside the IIFE so they can be patched onto App after init.
// =============================================================

App._getState = () => App._stateRef;

App.deleteStaff = function(id) {
  if (confirm('Delete this staff account?')) { DB.PCUsers.delete(id); App.navigate('staff'); }
};

// Filter the admin/PC dashboard by a specific internal program team
App.filterDashboardByIP = function(ipId) {
  const state = App._getState();
  if (!state) return;
  // Store temp filter in sessionStorage (doesn't change user's internalProgramId permanently)
  if (ipId) sessionStorage.setItem('vcp_dash_ip_filter', ipId);
  else sessionStorage.removeItem('vcp_dash_ip_filter');
  // Re-render dashboard with temp-filtered user object
  const filteredUser = { ...state.user, _dashIpFilter: ipId || null };
  const mc = document.getElementById('content');
  if (mc) mc.innerHTML = AdminViews.renderDashboard(state.user.role, filteredUser);
};


// ─ Design Handoffs ──────────────────────────────────────────────
App.openNewHandoffModal = function(preSrId) {
  const seasons = ['N/A','Q1','Q2','Q3','Q4'];
  const years   = ['2026','2027','2028','2029','2030'];
  const genders = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
  const tiers   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
  const brands  = (() => { const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort(); return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head']; })();
  // Open costing requests that don't yet have a design handoff linked to them
  const allHandoffs = API.DesignHandoffs.all();
  const openSRs = API.SalesRequests.all().filter(r =>
    !r.linkedProgramId &&
    !allHandoffs.find(h => h.sourceSalesRequestId === r.id)
  );
  App.showModal(`
  <div class="modal-header"><h2>🎨 New Design Handoff</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
  <p class="text-muted mb-3">Upload the Style List and Fabric List from Design. Both are needed for a complete handoff, but you can add the Fabric List later.</p>
  <form onsubmit="App.saveNewHandoff(event)">
    ${openSRs.length ? `
    <div class="form-group" style="margin-bottom:14px;padding:12px 14px;background:rgba(245,158,11,0.07);border-radius:var(--radius-sm);border:1px solid rgba(245,158,11,0.25)">
      <label class="form-label" style="color:#f59e0b">📝 Seed from Costing Request <span class="text-muted" style="font-weight:400">(optional — pre-fills details below)</span></label>
      <select class="form-select" id="dh-sr-seed" onchange="App.seedHandoffFromSR()">
        <option value="">— Start fresh —</option>
        ${openSRs.map(r => {
          const label = [r.season, r.year, r.brand, r.retailer, r.gender].filter(Boolean).join(' · ');
          return `<option value="${r.id}" ${preSrId === r.id ? 'selected' : ''}>${label} — ${(r.styles||[]).length} styles</option>`;
        }).join('')}
      </select>
    </div>` : ''}
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Season</label>
        <select class="form-select" id="dh-season">${seasons.map(s => '<option>' + s + '</option>').join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Year</label>
        <select class="form-select" id="dh-year">${years.map(y => '<option>' + y + '</option>').join('')}</select>
      </div>
    </div>

    <div class="form-row form-row-3">
      <div class="form-group">
        <label class="form-label">Brand <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="dh-brand" required>
          <option value="">— Select —</option>
          ${brands.map(b => `<option>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Gender <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="dh-gender" required>
          <option value="">— Select —</option>
          ${genders.map(g => '<option>' + g + '</option>').join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tier of Distribution <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="dh-tier" required>
          <option value="">— Select —</option>
          ${tiers.map(t => '<option>' + t + '</option>').join('')}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Supplier Request # <span class="text-muted" style="font-weight:400;font-size:0.82rem">(required for Tech Pack release to suppliers)</span></label>
      <input class="form-input" id="dh-supplier-req" placeholder="e.g. SR-2026-014" autocomplete="off">
    </div>

    <div class="form-row form-row-2" style="gap:16px;align-items:start">
      <!-- Style List -->
      <div class="form-group" style="margin:0">
        <label class="form-label">📋 Style List <span style="color:var(--danger)">*</span></label>
        <div class="upload-zone upload-zone-sm" id="dh-upload-zone"
          ondragover="event.preventDefault();this.classList.add('dragover')"
          ondragleave="this.classList.remove('dragover')"
          ondrop="App.handleHandoffDrop(event)">
          <input type="file" id="dh-file-input" accept=".xlsx,.xls,.csv,.tsv,.txt" style="display:none" onchange="App.handleHandoffFile(event)">
          <div class="upload-icon" style="font-size:1.4rem;margin-bottom:6px">📄</div>
          <p class="text-sm font-bold" style="color:var(--text-primary)">Drop or <button type="button" class="btn btn-secondary btn-xs" onclick="document.getElementById('dh-file-input').click()">Browse</button></p>
          <p class="text-sm text-muted mt-1">Style #, Style Name, Fabric, Notes</p>
        </div>
        <div id="dh-preview" class="mt-2"></div>
      </div>

      <!-- Fabric List -->
      <div class="form-group" style="margin:0">
        <label class="form-label">🧵 Fabric List <span class="text-muted">(optional — can add later)</span></label>
        <div class="upload-zone upload-zone-sm" id="dh-fab-upload-zone"
          ondragover="event.preventDefault();this.classList.add('dragover')"
          ondragleave="this.classList.remove('dragover')"
          ondrop="App.handleHandoffFabricDrop(event)">
          <input type="file" id="dh-fab-file-input" accept=".xlsx,.xls,.csv,.tsv,.txt" style="display:none" onchange="App.handleHandoffFabricFile(event)">
          <div class="upload-icon" style="font-size:1.4rem;margin-bottom:6px">🧵</div>
          <p class="text-sm font-bold" style="color:var(--text-primary)">Drop or <button type="button" class="btn btn-secondary btn-xs" onclick="document.getElementById('dh-fab-file-input').click()">Browse</button></p>
          <p class="text-sm text-muted mt-1">Fabric Code, Fabric Name, Content</p>
        </div>
        <div id="dh-fab-preview" class="mt-2"></div>
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="App.downloadHandoffTemplate()">⬇ Style Template</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="App.downloadFabricListTemplate()">⬇ Fabric Template</button>
      <button type="submit" class="btn btn-primary" id="dh-submit-btn" disabled>Save Handoff</button>
    </div>
  </form>`, 'modal-lg');
  if (preSrId) setTimeout(() => App.seedHandoffFromSR(), 80);
};

App.seedHandoffFromSR = function() {
  const srId = document.getElementById('dh-sr-seed')?.value;
  if (!srId) return;
  const r = API.SalesRequests.get(srId);
  if (!r) return;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  setVal('dh-season', r.season);
  setVal('dh-year',   r.year);
  setVal('dh-brand',  r.brand);
  setVal('dh-tier',   r.retailer); // retailer on SalesRequest = tier of distribution
  setVal('dh-gender', r.gender);
};

// Shared CSV parser for handoff uploads
App._parseHandoffCSV = function(text) {
  // Detect delimiter: tab if tabs present, else comma
  const delim = text.indexOf('\t') !== -1 ? '\t' : ',';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  // Normalize headers — map to our 4 canonical fields
  const rawHeaders = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/[\s#*]+/g,'_'));
  const colIdx = {
    styleNumber: rawHeaders.findIndex(h => /style.?(num|#|no|number)/.test(h) || h === 'style_'),
    styleName:   rawHeaders.findIndex(h => /style.?name/.test(h)),
    fabric:      rawHeaders.findIndex(h => /fabric|fabrication/.test(h)),
    notes:       rawHeaders.findIndex(h => /note|comment|remark/.test(h)),
  };
  // Fallback to positional (col 0,1,2,3) if headers aren't recognized
  const pick = (row, key, pos) => {
    const i = colIdx[key] >= 0 ? colIdx[key] : pos;
    return (row[i] || '').trim();
  };
  return lines.slice(1).map(line => {
    // Respect quoted fields
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delim && !inQ) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    return {
      styleNumber: pick(cols, 'styleNumber', 0),
      styleName:   pick(cols, 'styleName',   1),
      fabric:      pick(cols, 'fabric',       2),
      notes:       pick(cols, 'notes',        3),
    };
  }).filter(r => r.styleNumber);
};

App._handoffParsedRows = null;

App.handleHandoffDrop = function(e) {
  e.preventDefault();
  document.getElementById('dh-upload-zone')?.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) App._processHandoffFile(file);
};

App.handleHandoffFile = function(e) {
  const file = e.target.files[0];
  if (file) App._processHandoffFile(file);
};

App._processHandoffFile = function(file) {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const zone = document.getElementById('dh-upload-zone');
  if (zone) {
    zone.style.borderColor = 'var(--accent)';
    zone.querySelector('.upload-icon').textContent = '⏳';
  }

  const finish = rows => {
    App._handoffParsedRows = rows;
    if (zone) {
      zone.style.borderColor = '';
      zone.querySelector('.upload-icon').textContent = rows.length ? '✅' : '❌';
    }
    const preview = document.getElementById('dh-preview');
    const btn     = document.getElementById('dh-submit-btn');
    if (!preview) return;
    if (!rows.length) {
      preview.innerHTML = '<div class="alert alert-danger">❌ No valid rows found. Expected headers: <strong>Style Number, Style Name, Fabric, Notes</strong>. Make sure the first row contains column headers.</div>';
      if (btn) btn.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;
    preview.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px">✓ ' + rows.length + ' styles loaded from <strong>' + file.name + '</strong></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Style Number</th><th>Style Name</th><th>Fabric</th><th>Notes</th></tr></thead><tbody>' +
      rows.slice(0, 10).map(r =>
        '<tr>' +
        '<td class="primary font-bold">' + (r.styleNumber||'—') + '</td>' +
        '<td>' + (r.styleName||'—') + '</td>' +
        '<td class="text-sm">' + (r.fabric||'—') + '</td>' +
        '<td class="text-sm text-muted">' + (r.notes||'—') + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table></div>' +
      (rows.length > 10 ? '<p class="text-sm text-muted mt-1">…and ' + (rows.length - 10) + ' more rows</p>' : '');
  };

  if (isExcel) {
    // ── Excel path via SheetJS ──────────────────────────────────
    if (typeof XLSX === 'undefined') {
      finish([]);
      const preview = document.getElementById('dh-preview');
      if (preview) preview.innerHTML = '<div class="alert alert-danger">SheetJS library not loaded. Please check your internet connection and reload the page.</div>';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb  = XLSX.read(ev.target.result, { type: 'array' });

        // Helper: parse a sheet into array of objects
        const parseSheet = (sheetName, altIndex = 0) => {
          const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[altIndex]];
          if (!ws) return [];
          return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        };

        // ── Tab 1: Styles (required) ──────────────────────────────
        const stylesAoa = parseSheet('Styles', 0);
        if (stylesAoa.length < 2) { finish([]); return; }
        const rawHdrs = stylesAoa[0].map(h => String(h).trim().toLowerCase().replace(/[\s#*]+/g, '_'));
        const colIdx = {
          styleNumber: rawHdrs.findIndex(h => /style.?(num|#|no|number)/.test(h) || h === 'style_'),
          styleName:   rawHdrs.findIndex(h => /style.?name/.test(h)),
          fabric:      rawHdrs.findIndex(h => /fabric|fabrication/.test(h)),
          notes:       rawHdrs.findIndex(h => /note|comment|remark/.test(h)),
        };
        const pick = (row, key, pos) => { const i = colIdx[key] >= 0 ? colIdx[key] : pos; return String(row[i] || '').trim(); };
        const styleRows = stylesAoa.slice(1).map(row => ({
          styleNumber: pick(row, 'styleNumber', 0),
          styleName:   pick(row, 'styleName',   1),
          fabric:      pick(row, 'fabric',       2),
          notes:       pick(row, 'notes',        3),
        })).filter(r => r.styleNumber);

        // ── Tab 2: Fabrics (optional) ─────────────────────────────
        const fabAoa = parseSheet('Fabrics', -1);
        if (fabAoa.length > 1) {
          const fHdrs = fabAoa[0].map(h => String(h).trim().toLowerCase().replace(/[\s#*]+/g, '_'));
          App._handoffParsedFabrics = fabAoa.slice(1).map(row => {
            const get = (patterns, pos) => { const i = fHdrs.findIndex(h => patterns.some(p => h.includes(p))); return String(row[i >= 0 ? i : pos] || '').trim(); };
            return {
              refNumber: get(['ref','code'], 0),
              supplier:  get(['supplier'], 1),
              name:      get(['name'], 2),
              color:     get(['color'], 3),
              content:   get(['content','composition'], 4),
              weight:    get(['weight','gsm'], 5),
              notes:     get(['note','comment'], 6),
            };
          }).filter(r => r.refNumber || r.name);
        }

        // ── Tab 3: Trims (optional) ───────────────────────────────
        const trimAoa = parseSheet('Trims', -1);
        if (trimAoa.length > 1) {
          const tHdrs = trimAoa[0].map(h => String(h).trim().toLowerCase().replace(/[\s#*]+/g, '_'));
          App._handoffParsedTrims = trimAoa.slice(1).map(row => {
            const get = (patterns, pos) => { const i = tHdrs.findIndex(h => patterns.some(p => h.includes(p))); return String(row[i >= 0 ? i : pos] || '').trim(); };
            return {
              refNumber:   get(['ref','code'], 0),
              supplier:    get(['supplier'], 1),
              description: get(['desc','name'], 2),
              color:       get(['color'], 3),
              unit:        get(['unit'], 4),
              notes:       get(['note','comment'], 5),
            };
          }).filter(r => r.refNumber || r.description);
        }

        finish(styleRows);
      } catch(err) {
        finish([]);
        const preview = document.getElementById('dh-preview');
        if (preview) preview.innerHTML = '<div class="alert alert-danger">❌ Could not read Excel file: ' + err.message + '</div>';
      }
    };

    reader.readAsArrayBuffer(file);
  } else {
    // ── CSV / TSV / TXT path ──────────────────────────────────────────────────
    // Read as ArrayBuffer so we can detect the BOM (Byte Order Mark) and pick
    // the right encoding. Excel often writes:
    //   UTF-16 LE BOM: FF FE  → every character shows as garbage in UTF-8 mode
    //   UTF-16 BE BOM: FE FF
    //   UTF-8  BOM:    EF BB BF  → shows as  at start
    // Windows ANSI (CP-1252) has no BOM but is common for Excel "Save as CSV".
    const reader = new FileReader();
    reader.onload = ev => {
      const buf   = ev.target.result;
      const bytes = new Uint8Array(buf);
      let text;

      if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        // UTF-16 Little Endian BOM
        text = new TextDecoder('utf-16le').decode(buf);
      } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        // UTF-16 Big Endian BOM
        text = new TextDecoder('utf-16be').decode(buf);
      } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        // UTF-8 BOM — strip it, decode as UTF-8
        text = new TextDecoder('utf-8').decode(buf.slice(3));
      } else {
        // No BOM — try UTF-8 first; if we get replacement chars (U+FFFD)
        // fall back to Windows-1252 which covers most Western Excel files.
        text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('\uFFFD')) {
          try { text = new TextDecoder('windows-1252').decode(buf); } catch (_) {}
        }
      }

      // Strip any leftover BOM that snuck through
      text = text.replace(/^\uFEFF/, '');

      finish(App._parseHandoffCSV(text));
    };
    reader.readAsArrayBuffer(file);
  }
};

// ── Fabric List upload handlers ──────────────────────────────────────────────
// Shared encoding-aware file reader (reused for both style and fabric uploads)
App._readFileWithEncoding = function(file, onText) {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  if (isExcel) {
    if (typeof XLSX === 'undefined') { onText(null, 'SheetJS not loaded'); return; }
    const r = new FileReader();
    r.onload = ev => {
      try {
        const wb  = XLSX.read(ev.target.result, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Convert to CSV-like text so the same text parsers work
        const csv = aoa.map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        onText(csv, null);
      } catch(e) { onText(null, e.message); }
    };
    r.readAsArrayBuffer(file);
  } else {
    const r = new FileReader();
    r.onload = ev => {
      const buf = ev.target.result, bytes = new Uint8Array(buf);
      let text;
      if (bytes[0]===0xFF&&bytes[1]===0xFE)      text = new TextDecoder('utf-16le').decode(buf);
      else if (bytes[0]===0xFE&&bytes[1]===0xFF)  text = new TextDecoder('utf-16be').decode(buf);
      else if (bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF) text = new TextDecoder('utf-8').decode(buf.slice(3));
      else {
        text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('\uFFFD')) try { text = new TextDecoder('windows-1252').decode(buf); } catch(_){}
      }
      onText(text.replace(/^\uFEFF/,''), null);
    };
    r.readAsArrayBuffer(file);
  }
};

// Parse Fabric List: Fabric Code, Fabric Name, Content
App._parseFabricListCSV = function(text) {
  const delim = text.indexOf('\t') !== -1 ? '\t' : ',';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const norm = s => s.trim().toLowerCase().replace(/[\s#*]+/g,'_');
  const hdrs = lines[0].split(delim).map(norm);
  const colIdx = {
    fabricCode: hdrs.findIndex(h => /fabric.?code|code/.test(h)),
    fabricName: hdrs.findIndex(h => /fabric.?name|name/.test(h)),
    content:    hdrs.findIndex(h => /content|composition/.test(h)),
  };
  const pick = (cols, key, pos) => {
    const i = colIdx[key] >= 0 ? colIdx[key] : pos;
    // Strip surrounding quotes from Excel CSV output
    return (cols[i] || '').replace(/^"|"$/g,'').trim();
  };
  return lines.slice(1).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch==='"') { inQ=!inQ; continue; }
      if (ch===delim&&!inQ) { cols.push(cur); cur=''; } else cur+=ch;
    }
    cols.push(cur);
    return { fabricCode: pick(cols,'fabricCode',0), fabricName: pick(cols,'fabricName',1), content: pick(cols,'content',2) };
  }).filter(r => r.fabricCode);
};

App._handoffParsedFabrics = null;

App.handleHandoffFabricDrop = function(e) {
  e.preventDefault();
  document.getElementById('dh-fab-upload-zone')?.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) App._processHandoffFabricFile(file);
};

App.handleHandoffFabricFile = function(e) {
  const file = e.target.files[0];
  if (file) App._processHandoffFabricFile(file);
};

App._processHandoffFabricFile = function(file) {
  const zone = document.getElementById('dh-fab-upload-zone') || document.getElementById('add-fab-zone');
  if (zone) { zone.style.borderColor='var(--accent)'; const ic=zone.querySelector('.upload-icon'); if(ic) ic.textContent='⏳'; }
  App._readFileWithEncoding(file, (text, err) => {
    if (err || !text) {
      App._handoffParsedFabrics = [];
      const preview = document.getElementById('dh-fab-preview') || document.getElementById('add-fab-preview');
      if (preview) preview.innerHTML = '<div class="alert alert-danger">❌ ' + (err||'Could not read file') + '</div>';
      return;
    }
    const rows = App._parseFabricListCSV(text);
    App._handoffParsedFabrics = rows;
    if (zone) { zone.style.borderColor=''; const ic=zone.querySelector('.upload-icon'); if(ic) ic.textContent=rows.length?'✅':'❌'; }
    const preview = document.getElementById('dh-fab-preview') || document.getElementById('add-fab-preview');
    const btn     = document.getElementById('add-fab-submit-btn');
    if (!preview) return;
    if (!rows.length) {
      preview.innerHTML = '<div class="alert alert-danger">❌ No valid rows. Expected headers: Fabric Code, Fabric Name, Content</div>';
      if (btn) btn.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;
    preview.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:8px">✓ ' + rows.length + ' fabrics loaded from <strong>' + file.name + '</strong></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Fabric Code</th><th>Fabric Name</th><th>Content</th></tr></thead><tbody>' +
      rows.slice(0, 6).map(r =>
        '<tr><td class="primary font-bold">' + r.fabricCode + '</td><td>' + (r.fabricName||'—') + '</td><td class="text-sm text-muted">' + (r.content||'—') + '</td></tr>'
      ).join('') +
      '</tbody></table></div>' +
      (rows.length > 6 ? '<p class="text-sm text-muted mt-1">…and ' + (rows.length-6) + ' more</p>' : '');
  });
};

App.openBuildRequestFromHandoff = function(handoffId) {
  App.navigate('build-from-handoff', handoffId);
};

// ── Vendor allocation directly from a Design Handoff ──────────────
// Production can pre-assign TCs before the Sales Request stage.
App.openAssignVendorsToHandoff = function(handoffId) {
  const h   = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  const tcs      = API.cache.tradingCompanies;
  const assigned = h.assignedTCIds || [];
  const name     = [h.season, h.year, h.retailer].filter(Boolean).join(' ') || 'Design Handoff';
  App.showModal(`
  <div class="modal-header">
    <div>
      <h2>🏭 Pre-Assign Vendors</h2>
      <p class="text-muted text-sm">${name}</p>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
  </div>
  <p class="mb-3">Allocate trading companies now so costing can begin in parallel with the Sales Request. Assignments carry forward automatically when the program is created.</p>

  <div style="background:var(--bg-elevated);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:16px">
    <div class="text-sm font-bold mb-3" style="color:var(--accent)">📅 Production Schedule</div>
    <div class="form-row form-row-3">
      <div class="form-group">
        <label class="form-label">1st CRD (Cancel/Ready Date) *</label>
        <input class="form-input" id="hv-first-crd" type="date" value="${h.firstCRD||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Production Start Date</label>
        <input class="form-input" id="hv-start-date" type="date" value="${h.startDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">End / Ship Date</label>
        <input class="form-input" id="hv-end-date" type="date" value="${h.endDate||''}">
      </div>
    </div>
  </div>

  <div id="htc-chips" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
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
    <button class="btn btn-primary" onclick="App.saveHandoffVendors('${handoffId}')">Save Allocation</button>
  </div>`);
};

App.saveHandoffVendors = async function(handoffId) {
  const tcIds     = [...document.querySelectorAll('#htc-chips div[data-tcid].selected')].map(el => el.dataset.tcid);
  const firstCRD  = document.getElementById('hv-first-crd')?.value  || null;
  const startDate = document.getElementById('hv-start-date')?.value || null;
  const endDate   = document.getElementById('hv-end-date')?.value   || null;
  await API.DesignHandoffs.update(handoffId, { assignedTCIds: tcIds, firstCRD, startDate, endDate, vendorsAssignedAt: new Date().toISOString() });
  App.closeModal();
  App.navigate('programs');
};

// ── Vendor allocation directly from a Sales Request ───────────────────
App.openAssignVendorsToRequest = function(requestId) {
  const r   = API.SalesRequests.get(requestId);
  if (!r) return;
  const tcs      = API.cache.tradingCompanies;
  const assigned = r.assignedTCIds || [];
  const name     = [r.season, r.year, r.retailer].filter(Boolean).join(' ') || 'Sales Request';
  App.showModal(`
  <div class="modal-header">
    <div>
      <h2>🏭 Pre-Assign Vendors</h2>
      <p class="text-muted text-sm">${name}</p>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
  </div>
  <p class="mb-3">Allocate trading companies now so costing can begin as soon as this request becomes a program. Assignments carry forward automatically.</p>

  <div style="background:var(--bg-elevated);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:16px">
    <div class="text-sm font-bold mb-3" style="color:var(--accent)">📅 Production Schedule</div>
    <div class="form-row form-row-3">
      <div class="form-group">
        <label class="form-label">1st CRD (Cancel/Ready Date) *</label>
        <input class="form-input" id="rv-first-crd" type="date" value="${r.firstCRD||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Production Start Date</label>
        <input class="form-input" id="rv-start-date" type="date" value="${r.startDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">End / Ship Date</label>
        <input class="form-input" id="rv-end-date" type="date" value="${r.endDate||''}">
      </div>
    </div>
  </div>

  <div id="rtc-chips" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
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
    <button class="btn btn-primary" onclick="App.saveRequestVendors('${requestId}')">Save Allocation</button>
  </div>`);
};

App.saveRequestVendors = async function(requestId) {
  const tcIds     = [...document.querySelectorAll('#rtc-chips div[data-tcid].selected')].map(el => el.dataset.tcid);
  const firstCRD  = document.getElementById('rv-first-crd')?.value  || null;
  const startDate = document.getElementById('rv-start-date')?.value || null;
  const endDate   = document.getElementById('rv-end-date')?.value   || null;
  await API.SalesRequests.update(requestId, { assignedTCIds: tcIds, firstCRD, startDate, endDate, vendorsAssignedAt: new Date().toISOString() });
  App.closeModal();
  App.navigate('programs');
};

// Quick-navigate from Programs pipeline table to the detail view
// These open modals so the user stays on the Programs tab
App.viewHandoff = function(handoffId) {
  App.openHandoffDetail(handoffId);
};

App.viewSalesRequest = function(requestId) {
  App.openSalesRequestDetail(requestId);
};


App._brfToggleRow = function(idx) {
  const chk = document.getElementById('brf-chk-' + idx);
  const row = document.getElementById('brf-row-' + idx);
  if (!chk || !row) return;
  row.style.opacity    = chk.checked ? '1' : '0.38';
  row.style.background = chk.checked ? '' : 'rgba(239,68,68,0.06)';
  App._brfUpdateCount();
};

App._brfCancelStyle = function(idx) {
  const chk = document.getElementById('brf-chk-' + idx);
  const row = document.getElementById('brf-row-' + idx);
  if (!chk || !row) return;
  chk.checked = false;
  const noteEl = document.getElementById('brf-note-' + idx);
  if (noteEl && !noteEl.value) noteEl.value = 'Cancelled';
  row.style.opacity    = '0.38';
  row.style.background = 'rgba(239,68,68,0.06)';
  App._brfUpdateCount();
};

App._brfSelectAll = function(checked) {
  document.querySelectorAll('.brf-check').forEach(chk => {
    chk.checked = checked;
    const row = document.getElementById('brf-row-' + chk.dataset.idx);
    if (row) { row.style.opacity = checked ? '1' : '0.38'; row.style.background = checked ? '' : 'rgba(239,68,68,0.06)'; }
  });
  App._brfUpdateCount();
};

App._brfUpdateCount = function() {
  const checked = document.querySelectorAll('.brf-check:checked').length;
  const el = document.getElementById('brf-selected-count');
  if (el) el.textContent = checked;
};

App.saveBuildRequestFromHandoff = async function(handoffId) {
  const h       = API.DesignHandoffs.get(handoffId);
  const user    = App._getState()?.user || {};
  const season  = document.getElementById('brf-season')?.value   || h?.season || '';
  const year    = document.getElementById('brf-year')?.value     || h?.year   || '';
  const retailer= document.getElementById('brf-retailer')?.value || h?.tier   || '';
  const inWhseDate  = document.getElementById('brf-inwh-date')?.value || null;
  const costDueDate = document.getElementById('brf-cost-due')?.value  || null;
  const checks  = document.querySelectorAll('.brf-check');
  const styles  = [], cancelled = [];

  checks.forEach(chk => {
    const idx = parseInt(chk.dataset.idx);
    const src = (h?.stylesList||[])[idx] || {};
    const qty  = parseFloat(document.getElementById('brf-qty-'  + idx)?.value) || 0;
    const sell = parseFloat(document.getElementById('brf-sell-' + idx)?.value) || 0;
    const note = (document.getElementById('brf-note-' + idx)?.value || '').trim();
    const obj  = { styleNumber: src.styleNumber||'', styleName: src.styleName||'',
                   fabrication: src.fabric||src.fabrication||'', projQty: qty, projSell: sell, notes: note, cancelled: !chk.checked };
    if (chk.checked) styles.push(obj);
    else cancelled.push(obj);
  });

  if (!styles.length) { alert('Select at least one style to include.'); return; }

  await API.SalesRequests.create({ season, year, retailer,
    brand:   h?.brand  || '',
    gender:  h?.gender || '',
    styles, cancelledStyles: cancelled,
    inWhseDate, costDueDate,
    sourceHandoffId: handoffId,
    submittedByName: user?.name || user?.email || '',
    submittedById:   user?.id   || '',
    status: 'submitted',

  });

  App.navigate('sales-requests');
};

// ── Keyboard navigation for the Build-from-Handoff spreadsheet ───────────────
// Editable columns by index (within the inputs array on a given row):
//   0 = Proj Qty  |  1 = Proj Sell  |  2 = Notes
App._initBuildFromHandoffKbd = function() {
  const table = document.getElementById('brf-spreadsheet');
  if (!table) return;

  // Build a 2D map: cells[row][col] = input element
  // col 0 = qty, 1 = sell, 2 = notes
  const buildMap = () => {
    const map = [];
    table.querySelectorAll('tbody tr.brf-style-row').forEach((tr, ri) => {
      map[ri] = [
        document.getElementById('brf-qty-'  + ri),
        document.getElementById('brf-sell-' + ri),
        document.getElementById('brf-note-' + ri),
      ];
    });
    return map;
  };

  const moveFocus = (ri, ci, dr, dc) => {
    const map  = buildMap();
    const rows = map.length;
    const cols = 3;
    let nr = ri + dr, nc = ci + dc;
    // Wrap columns
    if (nc < 0)    { nc = cols - 1; nr--; }
    if (nc >= cols){ nc = 0;        nr++; }
    // Clamp rows
    nr = Math.max(0, Math.min(rows - 1, nr));
    const target = map[nr]?.[nc];
    if (target) { target.focus(); target.select(); }
  };

  // Attach keydown to each editable input
  const attachHandlers = () => {
    const map = buildMap();
    map.forEach((cols, ri) => {
      cols.forEach((inp, ci) => {
        if (!inp || inp._brf_kbd) return;
        inp._brf_kbd = true;
        inp.addEventListener('keydown', e => {
          switch(e.key) {
            case 'Tab':
              e.preventDefault();
              moveFocus(ri, ci, 0, e.shiftKey ? -1 : 1);
              break;
            case 'Enter':
              e.preventDefault();
              moveFocus(ri, ci, 1, 0);
              break;
            case 'ArrowDown':
              e.preventDefault();
              moveFocus(ri, ci, 1, 0);
              break;
            case 'ArrowUp':
              e.preventDefault();
              moveFocus(ri, ci, -1, 0);
              break;
            case 'ArrowLeft':
              // only move left if at start of text
              if (inp.selectionStart === 0 && inp.selectionEnd === 0) {
                e.preventDefault();
                moveFocus(ri, ci, 0, -1);
              }
              break;
            case 'ArrowRight':
              // only move right if at end of text
              if (inp.selectionStart === inp.value.length) {
                e.preventDefault();
                moveFocus(ri, ci, 0, 1);
              }
              break;
            case 'Escape':
              inp.blur();
              break;
          }
        });
      });
    });

    // Space on checkbox column — handled by the checkbox itself
    // Ctrl/Cmd+S to save
    if (!document._brf_save_bound) {
      document._brf_save_bound = true;
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          const page = document.getElementById('brf-page');
          if (!page) { document._brf_save_bound = false; return; }
          e.preventDefault();
          const hidId = document.getElementById('brf-handoff-id')?.value;
          if (hidId) App.saveBuildRequestFromHandoff(hidId);
        }
      });
    }
  };

  // Attach after paint
  setTimeout(attachHandlers, 50);
};



// ── Style number normalization (strips spaces, dashes, underscores for fuzzy match) ──
App._normStyle = function(n) { return (n || '').toUpperCase().replace(/[\s\-_\.]/g, ''); };

// ── Reconcile a Sales Request against a Design Handoff ────────────────────────
App.openReconcileModal = function(requestId, handoffId) {
  const req = API.SalesRequests.get(requestId);
  const h   = API.DesignHandoffs.get(handoffId);
  if (!req || !h) return;

  const norm = App._normStyle;

  // Build lookup maps keyed by normalized style number
  const salesMap  = {};
  (req.styles || []).forEach(s => { salesMap[norm(s.styleNumber)]  = s; });
  const designMap = {};
  (h.stylesList || []).forEach(s => { designMap[norm(s.styleNumber)] = s; });

  const allNorms = new Set([...Object.keys(salesMap), ...Object.keys(designMap)]);

  const matched    = [];  // { key, design, sales }
  const salesOnly  = [];  // { key, sales }
  const designOnly = [];  // { key, design }

  allNorms.forEach(key => {
    const d = designMap[key];
    const s = salesMap[key];
    if (d && s)       matched.push({ key, design: d, sales: s });
    else if (s && !d) salesOnly.push({ key, sales: s });
    else if (d && !s) designOnly.push({ key, design: d });
  });

  const cur = (n, fallback = '$0.00') => {
    const v = parseFloat(n);
    return isNaN(v) ? fallback : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2 });
  };
  const num = n => { const v = parseFloat(n); return isNaN(v) ? '—' : v.toLocaleString(); };

  // Row builders
  const matchRow = m => `
    <tr style="background:rgba(34,197,94,0.04)">
      <td style="padding:8px 6px;text-align:center"><input type="checkbox" class="recon-chk" data-key="${m.key}" data-type="matched" checked></td>
      <td style="padding:8px 10px"><span class="font-bold" style="color:#22c55e">✅</span></td>
      <td style="padding:8px 10px;font-weight:600">${m.sales.styleNumber || m.design.styleNumber}</td>
      <td style="padding:8px 10px;font-size:0.82rem">${m.design.styleName || m.sales.styleName || '—'}</td>
      <td style="padding:8px 10px;font-size:0.8rem;color:#94a3b8">${m.design.fabric || m.design.fabrication || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem">${num(m.sales.projQty)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem">${cur(m.sales.projSell)}</td>
    </tr>`;

  const salesRow = s => `
    <tr style="background:rgba(59,130,246,0.04)">
      <td style="padding:8px 6px;text-align:center"><input type="checkbox" class="recon-chk" data-key="${s.key}" data-type="sales" checked></td>
      <td style="padding:8px 10px"><span class="font-bold" style="color:#3b82f6">📝</span></td>
      <td style="padding:8px 10px;font-weight:600">${s.sales.styleNumber}</td>
      <td style="padding:8px 10px;font-size:0.82rem">${s.sales.styleName || '—'}</td>
      <td style="padding:8px 10px;font-size:0.8rem;color:#f59e0b" title="Design hasn't submitted this style yet">⚠ Pending Design</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem">${num(s.sales.projQty)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem">${cur(s.sales.projSell)}</td>
    </tr>`;

  const designRow = d => `
    <tr style="background:rgba(245,158,11,0.04)">
      <td style="padding:8px 6px;text-align:center"><input type="checkbox" class="recon-chk" data-key="${d.key}" data-type="design"></td>
      <td style="padding:8px 10px"><span class="font-bold" style="color:#f59e0b">🎨</span></td>
      <td style="padding:8px 10px;font-weight:600">${d.design.styleNumber}</td>
      <td style="padding:8px 10px;font-size:0.82rem">${d.design.styleName || '—'}</td>
      <td style="padding:8px 10px;font-size:0.8rem;color:#94a3b8">${d.design.fabric || d.design.fabrication || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem;color:#94a3b8">—</td>
      <td style="padding:8px 10px;text-align:right;font-size:0.82rem;color:#94a3b8">—</td>
    </tr>`;

  const noDiscrepancy = !salesOnly.length && !designOnly.length;
  const thStyle = 'padding:8px 10px;font-size:0.74rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:500';

  App.showModal(`
    <div class="modal-header">
      <div>
        <h2 style="margin:0">⚡ Reconcile Styles</h2>
        <div style="font-size:0.8rem;color:#94a3b8;margin-top:3px">
          ${req.season||''} ${req.year||''} · Sales: ${(req.styles||[]).length} styles · Design: ${(h.stylesList||[]).length} styles
        </div>
      </div>
      <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
    </div>

    <!-- Summary cards -->
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <div style="flex:1;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:#22c55e">${matched.length}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">✅ Matched</div>
      </div>
      <div style="flex:1;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:#3b82f6">${salesOnly.length}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">📝 Sales only</div>
      </div>
      <div style="flex:1;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:1.6rem;font-weight:700;color:#f59e0b">${designOnly.length}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">🎨 Design only</div>
      </div>
    </div>

    ${noDiscrepancy
      ? '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:12px 16px;font-size:0.88rem;color:#22c55e;margin-bottom:16px">✅ Both lists match perfectly — no discrepancies found.</div>'
      : `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px;font-size:0.82rem;color:#f59e0b;margin-bottom:14px">
          ⚠ Check the boxes below to choose which styles to include. Unchecked styles will be excluded from the reconciled list.
        </div>`}

    <!-- Style table -->
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:4px">
      <div style="overflow-y:auto;max-height:320px">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--bg-elevated);position:sticky;top:0;z-index:1">
            <tr>
              <th style="${thStyle};width:36px;text-align:center">
                <input type="checkbox" id="recon-chk-all" checked onchange="document.querySelectorAll('.recon-chk').forEach(c=>c.checked=this.checked)">
              </th>
              <th style="${thStyle};width:32px"></th>
              <th style="${thStyle}">Style #</th>
              <th style="${thStyle}">Name</th>
              <th style="${thStyle}">Fabrication</th>
              <th style="${thStyle};text-align:right">Proj Qty</th>
              <th style="${thStyle};text-align:right">Sell Price</th>
            </tr>
          </thead>
          <tbody>
            ${matched.map(matchRow).join('')}
            ${salesOnly.map(salesRow).join('')}
            ${designOnly.map(designRow).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="font-size:0.74rem;color:#94a3b8;margin-bottom:16px;padding:0 4px">
      ✅ Matched — data from both · 📝 Sales only — Design submission pending · 🎨 Design only — not yet bought by Sales
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.applyReconciliation('${requestId}','${handoffId}')">
        ✅ Apply Reconciliation → Update Sales Request
      </button>
    </div>
  `, 'modal-xl');

  // Store data for applyReconciliation to use
  App._reconData = { matched, salesOnly, designOnly, salesMap, designMap };
};

// ── Apply the reconciliation — merge checked styles into the Sales Request ─────
App.applyReconciliation = async function(requestId, handoffId) {
  const req  = API.SalesRequests.get(requestId);
  const h    = API.DesignHandoffs.get(handoffId);
  if (!req || !h) return;

  const data = App._reconData;
  if (!data) return;

  const norm = App._normStyle;
  const mergedStyles = [];

  document.querySelectorAll('.recon-chk:checked').forEach(chk => {
    const key  = chk.dataset.key;
    const type = chk.dataset.type;

    if (type === 'matched') {
      const d = data.designMap[key];
      const s = data.salesMap[key];
      mergedStyles.push({
        styleNumber:  s.styleNumber || d.styleNumber,
        styleName:    d.styleName   || s.styleName || '',
        fabrication:  d.fabric || d.fabrication || s.fabrication || '',
        projQty:      s.projQty   || '',
        projSell:     s.projSell  || '',
      });
    } else if (type === 'sales') {
      const s = data.salesMap[key];
      mergedStyles.push({ ...s, fabrication: s.fabrication || '' });
    } else if (type === 'design') {
      const d = data.designMap[key];
      mergedStyles.push({
        styleNumber:  d.styleNumber,
        styleName:    d.styleName || '',
        fabrication:  d.fabric || d.fabrication || '',
        projQty:      '',
        projSell:     '',
      });
    }
  });

  // Update the Sales Request with the merged style list + link to handoff
  await API.SalesRequests.update(requestId, {
    styles:          mergedStyles,
    sourceHandoffId: handoffId,
    reconciledAt:    new Date().toISOString(),
  });

  // Mark the handoff as linked
  await API.DesignHandoffs.update(handoffId, { linkedRequestId: requestId });

  App.closeModal();

  // Show confirmation
  setTimeout(() => {
    App.showModal(`
      <div class="modal-header"><h2>✅ Reconciliation Applied</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
      <div style="padding:8px 0 20px">
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:14px 16px;margin-bottom:16px">
          <div style="font-weight:600;color:#22c55e;margin-bottom:6px">✅ Sales Request updated</div>
          <div style="font-size:0.85rem;color:#94a3b8">${mergedStyles.length} styles merged. Design fabrication data and Sales pricing carried forward.</div>
        </div>
        <div style="font-size:0.85rem;color:#94a3b8">You can now propose a program from this Sales Request — it will have complete style data from both teams.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="App.closeModal();App.navigate('sales-requests')">Go to Sales Requests →</button>
      </div>`);
  }, 100);
};

App.downloadHandoffTemplate = function() {
  if (typeof XLSX === 'undefined') {
    alert('SheetJS not loaded — please check your internet connection and reload.');
    return;
  }

  const headerStyle = {
    font:      { bold: true, color: { rgb: '1E293B' } },
    fill:      { fgColor: { rgb: 'C7D8F0' }, patternType: 'solid' },
    alignment: { horizontal: 'center' },
    border:    { bottom: { style: 'thin', color: { rgb: '94A3B8' } } },
  };

  const styledSheet = (data, colWidths) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = colWidths;
    const numCols = data[0].length;
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = headerStyle;
    }
    return ws;
  };

  // Tab 1 — Styles
  const wsStyles = styledSheet([
    ['Style Number', 'Style Name', 'Category', 'Fabrication / Fabric', 'Notes'],
    ['HEW243', 'Running Short', 'Bottoms', '88% Poly 12% Spandex', ''],
    ['HEW244', 'Track Pant',   'Bottoms', '100% Polyester',        'Revised hem length'],
  ], [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 32 }]);

  // Tab 2 — Fabrics
  const wsFabrics = styledSheet([
    ['Fabric Ref #', 'Supplier', 'Fabric Name', 'Color', 'Content / Composition', 'Weight (gsm)', 'Notes'],
    ['FAB-001', 'Wicking Co.', 'Performance Mesh', 'Navy', '88% Polyester 12% Spandex', '180', ''],
    ['FAB-002', 'Knit Mills',  'French Terry',     'Grey', '80% Cotton 20% Polyester',  '320', ''],
  ], [{ wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 24 }]);

  // Tab 3 — Trims
  const wsTrims = styledSheet([
    ['Trim Ref #', 'Supplier', 'Description', 'Color', 'Unit', 'Notes'],
    ['TRM-001', 'Zip Co.',   'YKK Zipper 20cm', 'Black', 'pcs', ''],
    ['TRM-002', 'Label Co.', 'Woven Label',      'White', 'pcs', 'Main brand label'],
  ], [{ wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 24 }]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsStyles,  'Styles');
  XLSX.utils.book_append_sheet(wb, wsFabrics, 'Fabrics');
  XLSX.utils.book_append_sheet(wb, wsTrims,   'Trims');

  XLSX.writeFile(wb, 'design_handoff_template.xlsx');
};



App.saveNewHandoff = async function(e) {
  e.preventDefault();
  const user   = App._getState()?.user || {};
  const season = document.getElementById('dh-season')?.value || '';
  const year   = document.getElementById('dh-year')?.value   || '';
  const sourceSalesRequestId = document.getElementById('dh-sr-seed')?.value || null;
  const brand  = document.getElementById('dh-brand')?.value || '';
  const gender = document.getElementById('dh-gender')?.value || '';
  const tier   = document.getElementById('dh-tier')?.value   || '';
  const supplierRequestNumber = (document.getElementById('dh-supplier-req')?.value || '').trim();
  const rows   = App._handoffParsedRows;

  if (!brand)  { alert('Please select a Brand.'); return; }
  if (!gender) { alert('Please select a Gender.'); return; }
  if (!tier)   { alert('Please select a Tier of Distribution.'); return; }
  if (!rows || !rows.length) { alert('Please upload a style list file first.'); return; }

  const stylesList = rows.map(r => ({
    styleNumber: r.styleNumber,
    styleName:   r.styleName,
    fabric:      r.fabric,
    notes:       r.notes,
    fabrication: r.fabric, // alias so Sales Request seeding still works
  }));

  // Include fabric list if it was uploaded in the same session
  const trimsList   = (App._handoffParsedTrims || []).map(t => ({
    refNumber: t.refNumber||'', supplier: t.supplier||'', description: t.description||'', color: t.color||'', unit: t.unit||'', notes: t.notes||'',
  }));
  const fabricsList = (App._handoffParsedFabrics || []).map(f => ({
    fabricCode: f.fabricCode,
    fabricName: f.fabricName,
    content:    f.content,
  }));

  await API.DesignHandoffs.create({ season, year, brand, gender, tier, supplierRequestNumber, stylesList, fabricsList, trimsList, trimsUploaded: trimsList.length > 0,
    submittedByName: user?.name || user?.email || '',
    submittedById:   user?.id  || '',
    sourceSalesRequestId: sourceSalesRequestId || undefined,
  });
  App._handoffParsedRows    = null;
  App._handoffParsedFabrics = null;
  App._handoffParsedTrims   = null;
  App._handoffParsedFabrics = null;
  App.closeModal();
  App.navigate('design-handoff');
};

// ── Edit existing Design Handoff header ─────────────────────────────────────
App.openEditHandoffModal = function(handoffId) {
  const h = API.DesignHandoffs.get(handoffId);
  if (!h) return;

  const seasons = ['N/A','Q1','Q2','Q3','Q4'];
  const years   = ['2026','2027','2028','2029','2030'];
  const genders = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
  const tiers   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
  const brands  = (() => { const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort(); return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head']; })();

  const selOpts = (arr, cur) => arr.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('');

  App.showModal(`
  <div class="modal-header">
    <div>
      <h2>✏ Edit Handoff</h2>
      <p class="text-muted text-sm">${h.season || ''} ${h.year || ''} — header details only</p>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
  </div>
  <form onsubmit="App.saveEditHandoff(event,'${h.id}')">
    <div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label">Season</label>
        <select class="form-select" id="eh-season">${selOpts(seasons, h.season)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Year</label>
        <select class="form-select" id="eh-year">${selOpts(years, h.year)}</select>
      </div>
    </div>
    <div class="form-row form-row-3">
      <div class="form-group">
        <label class="form-label">Brand <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="eh-brand" required>
          <option value="">— Select —</option>
          ${selOpts(brands, h.brand)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Gender <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="eh-gender" required>
          <option value="">— Select —</option>
          ${selOpts(genders, h.gender)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tier of Distribution <span style="color:var(--danger)">*</span></label>
        <select class="form-select" id="eh-tier" required>
          <option value="">— Select —</option>
          ${selOpts(tiers, h.tier)}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Supplier Request #</label>
      <input class="form-input" id="eh-supplier-req" value="${h.supplierRequestNumber||''}" placeholder="e.g. SR-2026-014">
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Changes</button>
    </div>
  </form>`);
};

App.saveEditHandoff = async function(e, handoffId) {
  e.preventDefault();
  const season = document.getElementById('eh-season')?.value || '';
  const year   = document.getElementById('eh-year')?.value   || '';
  const brand  = document.getElementById('eh-brand')?.value.trim() || '';
  const gender = document.getElementById('eh-gender')?.value || '';
  const tier   = document.getElementById('eh-tier')?.value   || '';
  const supplierRequestNumber = (document.getElementById('eh-supplier-req')?.value || '').trim();

  if (!brand)  { alert('Please select a Brand.'); return; }
  if (!gender) { alert('Please select a Gender.'); return; }
  if (!tier)   { alert('Please select a Tier of Distribution.'); return; }

  await API.DesignHandoffs.update(handoffId, { season, year, brand, gender, tier, supplierRequestNumber });
  App.closeModal();
  App.navigate('design-handoff');
};

App.openHandoffDetail = function(handoffId) {
  const h = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const fmtShort = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const styleRows = (h.stylesList||[]).map(s =>
    '<tr>' +
    '<td class="primary font-bold">' + (s.styleNumber||'—') + '</td>' +
    '<td>' + (s.styleName||'—') + '</td>' +
    '<td class="text-sm">' + (s.fabric || s.fabrication || '—') + '</td>' +
    '<td class="text-sm text-muted">' + (s.notes||'—') + '</td>' +
    '</tr>'
  ).join('');

  // Build activity timeline
  const timeline = [
    { icon: '🎨', label: 'Design Submitted', ts: fmtDate(h.createdAt), val: h.submittedByName || '' },
    h.fabricsUploadedAt ? { icon: '🧵', label: 'Fabrics Uploaded', ts: fmtDate(h.fabricsUploadedAt), val: `${(h.fabricsList||[]).length} fabrics` } : null,
    h.vendorsAssignedAt ? { icon: '🏭', label: 'Vendors Pre-Assigned', ts: fmtDate(h.vendorsAssignedAt), val: `${(h.assignedTCIds||[]).length} TC(s)` } : null,
  ].filter(Boolean);

  const timelineHtml = `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px">
    ${timeline.map(t => `<div style="background:var(--bg-elevated);border-radius:var(--radius-sm);padding:10px 14px;flex:1;min-width:160px">
      <div style="font-size:0.85rem;font-weight:600;margin-bottom:2px">${t.icon} ${t.label}</div>
      <div class="text-muted" style="font-size:0.75rem">${t.ts}</div>
      ${t.val ? `<div style="font-size:0.8rem;color:var(--text-secondary)">${t.val}</div>` : ''}
    </div>`).join('')}
  </div>`;

  // Production dates if set
  const hasDates = h.firstCRD || h.startDate || h.endDate;
  const datesHtml = hasDates ? `<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap">
    <div class="text-sm font-bold" style="width:100%;margin-bottom:4px;color:var(--accent)">📅 Production Schedule</div>
    ${h.firstCRD ? `<div><span class="text-muted text-sm">1st CRD:</span> <strong>${fmtShort(h.firstCRD)}</strong></div>` : ''}
    ${h.startDate ? `<div><span class="text-muted text-sm">Start:</span> <strong>${fmtShort(h.startDate)}</strong></div>` : ''}
    ${h.endDate ? `<div><span class="text-muted text-sm">End/Ship:</span> <strong>${fmtShort(h.endDate)}</strong></div>` : ''}
  </div>` : '';

  App.showModal(
    '<div class="modal-header"><h2>🎨 Handoff — ' + (h.season||'') + ' ' + (h.year||'') + '</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>' +
    timelineHtml +
    datesHtml +
    '<div class="table-wrap">' +
    '<table><thead><tr><th>Style Number</th><th>Style Name</th><th>Fabric</th><th>Notes</th></tr></thead>' +
    '<tbody>' + (styleRows||'<tr><td colspan="4" class="text-muted text-center" style="padding:32px">No styles uploaded</td></tr>') + '</tbody></table></div>' +
    '<div class="modal-footer"><button class="btn btn-secondary" onclick="App.closeModal()">Close</button>' +
    (!h.submittedForCosting && !h.linkedProgramId ? '<button class="btn btn-primary ml-2" onclick="App.closeModal();App.openConvertHandoffModal(\'' + h.id + '\')">📤 Submit for Costing →</button>' : h.linkedProgramId ? '<span class="badge badge-placed" style="padding:6px 12px">✅ Program Created</span>' : '<span class="badge badge-costing" style="padding:6px 12px">⏳ Submitted to Sales</span>') +
    (!h.fabricsUploaded ? '<button class="btn btn-ghost btn-sm ml-2" onclick="App.closeModal();App.openAddTabModal(\'' + h.id + '\',\'fabrics\')">+ Add Fabrics</button>' : '') +
    (!h.trimsUploaded   ? '<button class="btn btn-ghost btn-sm ml-1" onclick="App.closeModal();App.openAddTabModal(\'' + h.id + '\',\'trims\')">+ Add Trims</button>'   : '') +
    '</div>', 'modal-lg');
};

// B1: "Submit for Costing" — creates an Open Sales Request for Sales to fill in
App.openConvertHandoffModal = function(handoffId) {
  const h = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  if (!confirm(`Submit "${[h.season,h.year,h.brand,h.tier,h.gender].filter(Boolean).join(' · ')}" for costing? This will create an open Sales Request for Sales to add quantities and pricing.`)) return;
  App.submitHandoffForCosting(handoffId);
};

App.submitHandoffForCosting = async function(handoffId) {
  const h    = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  const user = App._getState()?.user || App._stateRef?.user || {};
  // Build pre-populated Sales Request from handoff data
  const styles = (h.stylesList || []).map(s => ({
    styleNumber:  s.styleNumber || '',
    styleName:    s.styleName   || '',
    fabrication:  s.fabrication || s.fabric || '',
    projQty:      0,   // Sales fills in
    projSell:     0,   // Sales fills in
  }));
  await API.SalesRequests.create({
    season:          h.season  || '',
    year:            h.year    || '',
    brand:           h.brand   || '',
    retailer:        h.tier    || '',
    gender:          h.gender  || '',
    styles,
    sourceHandoffId: handoffId,
    submittedByName: user.name || user.email || 'Design',
    submittedById:   user.id   || '',
    status:          'submitted',
    note:            'Auto-created from Design Handoff',
  });
  await API.DesignHandoffs.update(handoffId, { submittedForCosting: true });
  App.navigate('design-handoff');
};

// Legacy: keep saveConvertHandoff for any existing references but redirect
App.saveConvertHandoff = function(e, handoffId) {
  if (e) e.preventDefault();
  App.submitHandoffForCosting(handoffId);
};

App.deleteHandoff = async function(id) {
  if (confirm('Delete this design handoff?')) { await API.DesignHandoffs.delete(id); App.navigate('design-handoff'); }
};

// ─ Sales Requests ────────────────────────────────────────────────
App.openNewSalesRequestModal = function() {
  const seasons  = ['N/A','Q1','Q2','Q3','Q4'];
  const years    = ['2026','2027','2028','2029','2030'];
  const tiers    = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];
  const genders  = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
  const brands   = (() => { const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort(); return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head']; })();
  const handoffs = API.DesignHandoffs.all();
  App._srParsedRows = null;
  App.showModal(`
  <div class="modal-header"><h2>📝 New Sales Costing Request</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
  <form onsubmit="App.saveSalesRequest(event)">
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Season</label>
        <select class="form-select" id="sr-season">${seasons.map(s => `<option>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Year</label>
        <select class="form-select" id="sr-year">${years.map(y => `<option>${y}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row form-row-3">
      <div class="form-group">
        <label class="form-label">Brand *</label>
        <select class="form-select" id="sr-brand" required>
          <option value="">— Select Brand —</option>
          ${brands.map(b => `<option>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Retailer / Tier <span class="text-muted text-sm">(select all that apply)</span></label>
        <div id="sr-retailer-wrap" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input)">
          ${tiers.map(t => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.85rem;font-weight:500">
            <input type="checkbox" class="sr-retailer-chk" value="${t}" style="width:14px;height:14px;accent-color:var(--accent)"> ${t}
          </label>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Gender *</label>
        <select class="form-select" id="sr-gender" required>
          <option value="">— Select —</option>
          ${genders.map(g => `<option>${g}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div class="form-group">
        <label class="form-label">📦 In-Warehouse Date *</label>
        <input class="form-input" id="sr-inwh-date" type="date" required>
      </div>
      <div class="form-group">
        <label class="form-label">⏰ Cost Request Due Date *</label>
        <input class="form-input" id="sr-cost-due" type="date" required title="Target date for production to submit costs by">
      </div>
    </div>
    ${handoffs.length ? `<div class="form-group">
      <label class="form-label">Seed from Design Handoff <span class="text-muted">(optional)</span></label>
      <select class="form-select" id="sr-handoff" onchange="App.seedSalesFromHandoff()">
        <option value="">— Start fresh —</option>
        ${handoffs.map(h => {
          const label = [h.season, h.year, h.brand, h.tier, h.gender].filter(Boolean).join(' · ');
          return `<option value="${h.id}">${label} — ${(h.stylesList||[]).length} styles</option>`;
        }).join('')}
      </select>
    </div>` : ''}
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <label class="form-label" style="margin:0">Style List</label>
        <button type="button" class="btn btn-ghost btn-xs" onclick="App.downloadSRTemplate()">⬇ Download Template</button>
      </div>
      <label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px;border:2px dashed var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--bg-elevated);margin-bottom:10px;transition:border-color .2s"
        onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <span style="font-size:1.4rem">📂</span>
        <span style="font-size:0.85rem;font-weight:600">Upload Excel or CSV</span>
        <span style="font-size:0.75rem;color:#94a3b8">Click to browse or drag & drop · .xlsx .xls .csv</span>
        <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" style="display:none" onchange="App.handleSRFile(event)">
      </label>
      <div id="sr-file-preview" style="margin-bottom:8px"></div>
      <details style="margin-top:4px">
        <summary style="font-size:0.78rem;color:#94a3b8;cursor:pointer;user-select:none">Or paste CSV manually</summary>
        <textarea class="form-textarea" id="sr-styles-csv" rows="5" style="margin-top:6px" placeholder="Style #,Style Name,Proj Qty,Proj Sell,Fabrication"></textarea>
      </details>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Request</button>
    </div>
  </form>`, 'modal-lg');
};

App.seedSalesFromHandoff = function() {
  const hId = document.getElementById('sr-handoff')?.value;
  const ta  = document.getElementById('sr-styles-csv');
  if (!ta) return;
  if (!hId) { ta.value = ''; return; }
  const h = API.DesignHandoffs.get(hId);
  // Auto-fill retailer checkboxes from handoff tier
  if (h?.tier) {
    document.querySelectorAll('.sr-retailer-chk').forEach(chk => {
      chk.checked = chk.value === h.tier;
    });
  }
  if (!h?.stylesList?.length) return;
  ta.value = ['Style #,Style Name,Proj Qty,Proj Sell,Fabrication', ...h.stylesList.map(s => `${s.styleNumber},${s.styleName||''},,, ${s.fabrication||''}`)].join('\n');
};

App.saveSalesRequest = async function(e) {
  e.preventDefault();
  const user       = App._getState()?.user || {};
  const season     = document.getElementById('sr-season')?.value    || '';
  const year       = document.getElementById('sr-year')?.value      || '';
  const brand      = document.getElementById('sr-brand')?.value     || '';
  const retailer   = [...document.querySelectorAll('.sr-retailer-chk:checked')].map(c=>c.value).join(', ') || '';
  const gender     = document.getElementById('sr-gender')?.value    || '';
  const handoffId  = document.getElementById('sr-handoff')?.value   || '';
  const inWhseDate = document.getElementById('sr-inwh-date')?.value || null;
  const costDueDate= document.getElementById('sr-cost-due')?.value  || null;
  // Use pre-parsed rows from file upload if available (avoids CSV round-trip)
  let styles;
  if (App._srParsedRows && App._srParsedRows.length > 0) {
    styles = App._srParsedRows.map(s => ({ ...s }));
    App._srParsedRows = null;
  } else {
    const csv = document.getElementById('sr-styles-csv')?.value || '';
    const lines = csv.trim().split('\n').map(l=>l.trim()).filter(Boolean);
    const hdrs  = lines.length ? lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/[\s#]+/g,'_')) : [];
    styles = lines.slice(1).map(line => {
      const cols = line.split(',').map(c=>c.trim());
      const r = {}; hdrs.forEach((h,i) => { r[h] = cols[i]||''; });
      return { styleNumber: r['style_']||r['style_number']||Object.values(r)[0]||'',
        styleName: r['style_name']||Object.values(r)[1]||'',
        projQty: parseFloat(r['proj_qty']||r['qty']||Object.values(r)[2])||null,
        projSellPrice: parseFloat(r['proj_sell']||r['sell']||Object.values(r)[3])||null,
        fabrication: r['fabrication']||Object.values(r)[4]||'' };
    }).filter(s => s.styleNumber);
  }
  await API.SalesRequests.create({ season, year, brand, retailer, gender, styles, sourceHandoffId: handoffId||null,
    inWhseDate, costDueDate,
    salesSubmittedAt: new Date().toISOString(),
    submittedByName: user?.name||user?.email||'', submittedById: user?.id||'' });
  App.closeModal();
  App.navigate('sales-request');
};

App.openSalesRequestDetail = function(requestId) {
  const r = API.SalesRequests.get(requestId);
  if (!r) return;
  const d   = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const fmtShort = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  // Activity timeline
  const srTimeline = [
    { icon: '📝', label: 'Sales Submitted', ts: fmtDate(r.salesSubmittedAt || r.createdAt), val: r.submittedByName || '' },
    r.vendorsAssignedAt ? { icon: '🏭', label: 'Vendors Assigned', ts: fmtDate(r.vendorsAssignedAt), val: `${(r.assignedTCIds||[]).length} TC(s)` } : null,
  ].filter(Boolean);

  const srTimelineHtml = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
    ${srTimeline.map(t => `<div style="background:var(--bg-elevated);border-radius:var(--radius-sm);padding:8px 12px;flex:1;min-width:140px">
      <div style="font-size:0.82rem;font-weight:600">${t.icon} ${t.label}</div>
      <div class="text-muted" style="font-size:0.73rem">${t.ts}</div>
      ${t.val ? `<div style="font-size:0.78rem;color:var(--text-secondary)">${t.val}</div>` : ''}
    </div>`).join('')}
    ${r.inWhseDate ? `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:var(--radius-sm);padding:8px 12px;flex:1;min-width:110px">
      <div style="font-size:0.82rem;font-weight:600">📦 In-Warehouse</div>
      <div style="font-size:0.82rem;font-weight:700;color:#10b981">${fmtShort(r.inWhseDate)}</div>
    </div>` : ''}
    ${r.costDueDate ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:var(--radius-sm);padding:8px 12px;flex:1;min-width:110px">
      <div style="font-size:0.82rem;font-weight:600">⏰ Cost Due</div>
      <div style="font-size:0.82rem;font-weight:700;color:#f59e0b">${fmtShort(r.costDueDate)}</div>
    </div>` : ''}
    ${r.firstCRD ? `<div style="background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.2);border-radius:var(--radius-sm);padding:8px 12px;flex:1;min-width:110px">
      <div style="font-size:0.82rem;font-weight:600">📅 1st CRD</div>
      <div style="font-size:0.82rem;font-weight:700;color:#8b5cf6">${fmtShort(r.firstCRD)}</div>
    </div>` : ''}
  </div>`;

  const allStyles = [...(r.styles||[]), ...(r.cancelledStyles||[])];
  const rows = allStyles.map(s => {
    const isCancelled = s.cancelled || (r.cancelledStyles||[]).some(cs => cs.styleNumber === s.styleNumber);
    return `<tr style="${isCancelled ? 'opacity:0.45;background:rgba(239,68,68,0.05)' : ''}">
      <td class="primary font-bold">${s.styleNumber||'—'}</td>
      <td>${s.styleName||'—'}</td>
      <td class="text-sm text-muted">${s.fabrication||s.fabric||'—'}</td>
      <td style="padding:4px 6px">
        <input class="form-input sr-qty-input" data-sn="${s.styleNumber}" type="number" min="0"
          value="${s.projQty||''}" placeholder="Qty" style="width:90px;padding:4px 6px"
          ${r.linkedProgramId ? 'disabled' : ''}>
      </td>
      <td style="padding:4px 6px">
        <input class="form-input sr-sell-input" data-sn="${s.styleNumber}" type="number" min="0" step="0.01"
          value="${s.projSell||s.projSellPrice||''}" placeholder="$0.00" style="width:100px;padding:4px 6px"
          ${r.linkedProgramId ? 'disabled' : ''}>
      </td>
      <td style="padding:4px 6px">
        <input class="form-input sr-note-input" data-sn="${s.styleNumber}" type="text"
          value="${(s.notes||'').replace(/"/g,'&quot;')}" placeholder="Notes…" style="width:140px;padding:4px 6px"
          ${r.linkedProgramId ? 'disabled' : ''}>
      </td>
      <td><span class="badge ${isCancelled ? 'badge-cancelled' : 'badge-costing'}">${isCancelled ? 'Cancelled' : 'Active'}</span></td>
    </tr>`;
  }).join('');

  const canEdit = !r.linkedProgramId;

  App.showModal(

    `<div class="modal-header"><h2>📝 Sales Request — ${r.season||''} ${r.year||''}</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>` +
    `<div class="text-sm text-muted mb-3">Retailer: <strong>${r.retailer||'—'}</strong>` +
    (r.linkedProgramId ? ' · <span class="badge badge-placed">→ Linked to Program</span>' : '') + `</div>` +
    srTimelineHtml +
    `<div class="table-wrap" style="max-height:360px;overflow-y:auto"><table>
      <thead><tr>
        <th>Style #</th><th>Style Name</th><th>Fabric</th>
        <th>Proj Qty</th><th>Proj Sell</th><th>Notes</th><th>Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="text-muted text-center">No styles</td></tr>'}</tbody>
    </table></div>` +
    `<div class="modal-footer" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="App.downloadSalesRequest('${r.id}')">⬇ Download Excel</button>
        ${canEdit ? `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
          ⬆ Import Excel
          <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="App.importSalesRequestXlsx(event,'${r.id}')">
        </label>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
        ${canEdit ? `<button class="btn btn-primary" onclick="App.saveSalesRequestEdits('${r.id}')">💾 Save Changes</button>` : ''}
        ${canEdit ? `<button class="btn btn-primary ml-2" onclick="App.closeModal();App.proposeProgramFromRequest('${r.id}')">✅ Create Program</button>` : ''}
      </div>
    </div>`, 'modal-xl');
};

App.convertSalesRequest = function(requestId) {
  const r = API.SalesRequests.get(requestId);
  if (!r) return;
  const ips = DB.InternalPrograms.all();
  const seasons = ['N/A','Q1','Q2','Q3','Q4'], years = ['2026','2027','2028','2029','2030'];
  App.showModal(`
  <div class="modal-header"><h2>Convert Sales Request → Program</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
  <p class="text-muted mb-3">Creates a Program pre-loaded with all ${(r.styles||[]).length} styles from this Sales Request.</p>
  <form onsubmit="App.saveConvertSalesRequest(event,'${requestId}')">
    <div class="form-group"><label class="form-label">Brand *</label>
      <select class="form-select" id="csr-ip" required><option value="">Select brand…</option>${ips.map(ip=>`<option value="${ip.id}">${ip.name}</option>`).join('')}</select>
    </div>
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Season</label>
        <select class="form-select" id="csr-season">${seasons.map(s=>`<option ${s===(r.season||'N/A')?'selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Year</label>
        <select class="form-select" id="csr-year">${years.map(y=>`<option ${y===(r.year||'2026')?'selected':''}>${y}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Retailer</label><input class="form-input" id="csr-retailer" value="${r.retailer||''}"></div>
      <div class="form-group"><label class="form-label">Market</label>
        <select class="form-select" id="csr-market"><option>USA</option><option>Canada</option></select>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Create Program</button>
    </div>
  </form>`, 'modal-lg');
};

App.saveConvertSalesRequest = async function(e, requestId) {
  e.preventDefault();
  const ipId    = document.getElementById('csr-ip')?.value;
  const ip      = DB.InternalPrograms.get(ipId);
  if (!ip || !ipId) return;
  const season   = document.getElementById('csr-season')?.value;
  const year     = document.getElementById('csr-year')?.value;
  const retailer = document.getElementById('csr-retailer')?.value || '';
  const market   = document.getElementById('csr-market')?.value   || 'USA';
  await API.SalesRequests.convertToProgram(requestId, { internalProgramId: ipId, name: ip.name, targetMargin: ip.targetMargin||0, season, year, retailer, market, status: 'Costing' });
  const updated = API.SalesRequests.get(requestId);
  App.closeModal();
  if (updated?.linkedProgramId) App.navigate('styles', updated.linkedProgramId);
  else App.navigate('sales-request');
};

// ── Shared xlsx blob download helper ─────────────────────────────────────────
App._xlsxDownload = function(wb, filename) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ── Build Sheet Download (from the build-from-handoff full-page form) ──────────
// Reads current DOM input values so any edits already typed are preserved.
App.downloadBuildSheet = function(handoffId) {
  const h = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  const season   = document.getElementById('brf-season')?.value   || h.season   || '';
  const year     = document.getElementById('brf-year')?.value     || h.year     || '';
  const retailer = document.getElementById('brf-retailer')?.value || '';

  const header = [['Style Number','Style Name','Fabric','Proj Qty','Proj Sell','Notes','Status']];
  const dataRows = (h.stylesList || []).map((s, i) => {
    const qty    = document.getElementById('brf-qty-'   + i)?.value || '';
    const sell   = document.getElementById('brf-sell-'  + i)?.value || '';
    const note   = document.getElementById('brf-note-'  + i)?.value || '';
    const chk    = document.getElementById('brf-chk-'   + i);
    const status = (chk && !chk.checked) ? 'Cancelled' : 'Active';
    return [s.styleNumber||'', s.styleName||'', s.fabric||s.fabrication||'', qty, sell, note, status];
  });

  const ws = XLSX.utils.aoa_to_sheet([...header, ...dataRows]);
  ws['!cols'] = [{wch:14},{wch:24},{wch:22},{wch:10},{wch:10},{wch:30},{wch:10}];
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Request');
  const fname = ['SalesRequest', season, year, retailer].filter(Boolean).join('-') + '.xlsx';
  App._xlsxDownload(wb, fname);
};

// ── Import Excel into the build-from-handoff page ─────────────────────────────
// Matches rows by Style Number and fills in Qty / Sell / Notes inputs.
App.importBuildSheet = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) { alert('No data rows found in file.'); return; }

      // Detect columns by header name (case-insensitive, whitespace-stripped)
      const hdr  = r => (r||'').toString().toLowerCase().replace(/[\s#_]/g,'');
      const cols = rows[0].map(hdr);
      const snCol   = cols.findIndex(h => h.includes('style') && (h.includes('num') || h.includes('#') || h === 'stylenumber'));
      const qtyCol  = cols.findIndex(h => h.includes('qty')  || h.includes('quantity'));
      const sellCol = cols.findIndex(h => h.includes('sell') || h.includes('price'));
      const noteCol = cols.findIndex(h => h.includes('note'));
      const stCol   = cols.findIndex(h => h.includes('status'));

      if (snCol < 0) { alert('Could not find a "Style Number" column in the uploaded file.\n\nExpected headers: Style Number, Proj Qty, Proj Sell, Notes, Status'); return; }

      // Build lookup: UPPERCASE styleNumber → file row
      const lookup = {};
      rows.slice(1).forEach(r => {
        const sn = (r[snCol]||'').toString().toUpperCase().trim();
        if (sn) lookup[sn] = r;
      });

      let updated = 0;
      document.querySelectorAll('.brf-style-row').forEach(tr => {
        const idx = tr.id.replace('brf-row-', '');
        const snEl  = tr.querySelector('td:nth-child(2)');
        const sn    = (snEl?.textContent || '').trim().toUpperCase();
        const match = lookup[sn];
        if (!match) return;

        const set = (inpId, colIdx) => {
          if (colIdx < 0) return;
          const inp = document.getElementById(inpId + idx);
          if (inp && match[colIdx] !== '') inp.value = match[colIdx];
        };
        set('brf-qty-',  qtyCol);
        set('brf-sell-', sellCol);
        set('brf-note-', noteCol);

        // Handle Status column → toggle cancel
        if (stCol >= 0) {
          const st  = (match[stCol]||'').toString().toLowerCase();
          const chk = document.getElementById('brf-chk-' + idx);
          if (chk) {
            const cancel = st === 'cancelled';
            if (cancel && chk.checked)  { chk.checked = false; App._brfToggleRow(parseInt(idx)); }
            if (!cancel && !chk.checked){ chk.checked = true;  App._brfToggleRow(parseInt(idx)); }
          }
        }
        updated++;
      });

      App._brfUpdateCount();
      event.target.value = ''; // Allow re-uploading same file
      alert(`✅ Imported ${updated} styles from ${file.name}.`);
    } catch (err) {
      alert('❌ Could not read file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── Download a saved Sales Request from DB ────────────────────────────────────
App.downloadSalesRequest = function(requestId) {
  const r = API.SalesRequests.get(requestId);
  if (!r) return;

  const header = [['Style Number','Style Name','Fabric','Proj Qty','Proj Sell','Notes','Status']];
  const activeRows = (r.styles||[]).map(s =>
    [s.styleNumber||'', s.styleName||'', s.fabrication||s.fabric||'',
     s.projQty != null ? s.projQty : '', s.projSell||s.projSellPrice||'', s.notes||'', 'Active']);
  const cancelRows = (r.cancelledStyles||[]).map(s =>
    [s.styleNumber||'', s.styleName||'', s.fabrication||s.fabric||'',
     s.projQty != null ? s.projQty : '', s.projSell||s.projSellPrice||'', s.notes||'', 'Cancelled']);

  const ws = XLSX.utils.aoa_to_sheet([...header, ...activeRows, ...cancelRows]);
  ws['!cols'] = [{wch:14},{wch:24},{wch:22},{wch:10},{wch:10},{wch:30},{wch:10}];
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Request');
  const fname = ['SalesRequest', r.season, r.year, r.retailer].filter(Boolean).join('-') + '.xlsx';
  App._xlsxDownload(wb, fname);
};

// ── Import filled Excel back into a saved Sales Request ───────────────────────
App.importSalesRequestXlsx = async function(event, requestId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { alert('No data rows found in file.'); return; }

      const hdr  = r => (r||'').toString().toLowerCase().replace(/[\s#_]/g,'');
      const cols = rows[0].map(hdr);
      const snCol   = cols.findIndex(h => h.includes('style') && (h.includes('num') || h.includes('#') || h === 'stylenumber'));
      const qtyCol  = cols.findIndex(h => h.includes('qty')  || h.includes('quantity'));
      const sellCol = cols.findIndex(h => h.includes('sell') || h.includes('price'));
      const noteCol = cols.findIndex(h => h.includes('note'));
      const stCol   = cols.findIndex(h => h.includes('status'));

      if (snCol < 0) { alert('Could not find "Style Number" column.'); return; }

      const r = API.SalesRequests.get(requestId);
      if (!r) return;

      // Build lookup from file
      const lookup = {};
      rows.slice(1).forEach(row => {
        const sn = (row[snCol]||'').toString().toUpperCase().trim();
        if (sn) lookup[sn] = row;
      });

      const applyMatch = (s) => {
        const key   = (s.styleNumber||'').toUpperCase().trim();
        const match = lookup[key];
        if (!match) return s; // no change
        return {
          ...s,
          projQty:   qtyCol  >= 0 && match[qtyCol]  !== '' ? parseFloat(match[qtyCol])  || 0 : s.projQty,
          projSell:  sellCol >= 0 && match[sellCol] !== '' ? parseFloat(match[sellCol]) || 0 : s.projSell,
          notes:     noteCol >= 0 && match[noteCol] !== '' ? match[noteCol] : s.notes,
          cancelled: stCol   >= 0 ? (match[stCol]||'').toString().toLowerCase() === 'cancelled' : s.cancelled,
        };
      };

      const allStyles     = [...(r.styles||[]), ...(r.cancelledStyles||[])].map(applyMatch);
      const newActive     = allStyles.filter(s => !s.cancelled);
      const newCancelled  = allStyles.filter(s =>  s.cancelled);
      const updated       = Object.keys(lookup).filter(sn =>
        allStyles.some(s => (s.styleNumber||'').toUpperCase() === sn)
      ).length;

      await API.SalesRequests.update(requestId, { styles: newActive, cancelledStyles: newCancelled });
      event.target.value = '';
      App.closeModal();
      App.navigate('sales-requests');
      setTimeout(() => alert(`✅ Imported successfully — ${updated} styles updated from ${file.name}.`), 150);
    } catch (err) {
      alert('❌ Could not read file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
};

// ── Download blank Sales Request style-list template ─────────────────────────
App.downloadSRTemplate = function() {
  if (typeof XLSX === 'undefined') { alert('SheetJS not loaded — please reload the page.'); return; }
  const data = [
    ['Style #', 'Style Name', 'Proj Qty', 'Proj Sell', 'Fabrication', 'Notes'],
    ['SR-001', 'Example Style 1', 500, 24.99, 'French Terry', ''],
    ['SR-002', 'Example Style 2', 300, 19.99, 'Jersey Knit', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:14},{wch:26},{wch:12},{wch:12},{wch:24},{wch:30}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Request');
  App._xlsxDownload(wb, 'sales_request_template.xlsx');
};

// ── Upload Excel/CSV into the New SR modal textarea ───────────────────────────
App.handleSRFile = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById('sr-file-preview');
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  const process = (aoa) => {
    // Skip any leading blank / title rows to find the actual header row
    const firstNonEmpty = aoa.findIndex(row => row.some(c => (c||'').toString().trim()));
    if (firstNonEmpty < 0 || firstNonEmpty >= aoa.length - 1) {
      if (preview) preview.innerHTML = '<span style="color:#ef4444;font-size:0.82rem">No data rows found in file.</span>';
      return;
    }

    // Normalise a header string: lowercase, strip spaces/punctuation
    const norm = h => (h||'').toString().toLowerCase().replace(/[\s\-_.#*()\[\]]+/g,'');
    const hdrs = aoa[firstNonEmpty].map(norm);

    // Generous column detection — tries multiple aliases
    const findCol = (...pats) => hdrs.findIndex(h => pats.some(p => h === p || h.startsWith(p) || h.includes(p)));
    const snCol   = findCol('style','sku','item','code','articl','ref');
    const nmCol   = findCol('stylename','name','description','desc','title');
    const qtyCol  = findCol('projqty','qty','quantity','units','pcs');
    const sellCol = findCol('projsell','sell','price','retail','fob');
    const fabCol  = findCol('fabric','material','fabrication','category');
    const noteCol = findCol('note','comment','remark');

    if (snCol < 0) {
      const found = aoa[firstNonEmpty].filter(Boolean).join(', ');
      if (preview) preview.innerHTML = `<span style="color:#ef4444;font-size:0.82rem">⚠ Couldn't identify a Style # column. Detected headers: <em>${found||'(none)'}</em></span>`;
      return;
    }

    const get = (row, col) => col >= 0 ? (row[col] ?? '') : '';
    const dataRows = aoa.slice(firstNonEmpty + 1)
      .filter(row => row.some(c => (c||'').toString().trim()))       // skip blank rows
      .filter(row => (row[snCol]||'').toString().trim())             // must have a style number
      .map(row => ({
        styleNumber:  get(row, snCol).toString().trim(),
        styleName:    get(row, nmCol).toString().trim(),
        projQty:      get(row, qtyCol) !== '' ? parseFloat(get(row, qtyCol))  || null : null,
        projSell:     get(row, sellCol) !== '' ? parseFloat(get(row, sellCol)) || null : null,
        projSellPrice:get(row, sellCol) !== '' ? parseFloat(get(row, sellCol)) || null : null,
        fabrication:  get(row, fabCol).toString().trim(),
        notes:        get(row, noteCol).toString().trim(),
      }));

    if (dataRows.length === 0) {
      if (preview) preview.innerHTML = '<span style="color:#ef4444;font-size:0.82rem">File parsed OK but no style rows found. Make sure the Style # column has values.</span>';
      return;
    }

    // Store directly — bypass textarea entirely
    App._srParsedRows = dataRows;

    // Show a compact inline preview
    const previewRows = dataRows.slice(0, 5).map(s =>
      `<tr>
        <td style="padding:3px 8px;font-family:monospace;font-size:0.75rem">${s.styleNumber}</td>
        <td style="padding:3px 8px;font-size:0.75rem;color:#94a3b8">${s.styleName||'—'}</td>
        <td style="padding:3px 8px;font-size:0.75rem;text-align:right">${s.projQty != null ? s.projQty.toLocaleString() : '—'}</td>
        <td style="padding:3px 8px;font-size:0.75rem;text-align:right">${s.projSell != null ? '$'+s.projSell.toFixed(2) : '—'}</td>
      </tr>`
    ).join('');

    if (preview) preview.innerHTML = `
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:10px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#22c55e;font-size:0.83rem;font-weight:600">✅ ${dataRows.length} styles ready — ${file.name}</span>
          <button type="button" onclick="App._srParsedRows=null;document.getElementById('sr-file-preview').innerHTML=''" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:0.8rem">✕ Clear</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="padding:2px 8px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:500">Style #</th>
            <th style="padding:2px 8px;text-align:left;font-size:0.7rem;color:#64748b;font-weight:500">Name</th>
            <th style="padding:2px 8px;text-align:right;font-size:0.7rem;color:#64748b;font-weight:500">Proj Qty</th>
            <th style="padding:2px 8px;text-align:right;font-size:0.7rem;color:#64748b;font-weight:500">Proj Sell</th>
          </tr></thead>
          <tbody>${previewRows}</tbody>
        </table>
        ${dataRows.length > 5 ? `<div style="font-size:0.72rem;color:#64748b;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">+ ${dataRows.length - 5} more styles</div>` : ''}
      </div>`;
    event.target.value = '';
  };

  if (isExcel) {
    if (typeof XLSX === 'undefined') {
      if (preview) preview.innerHTML = '<span style="color:#ef4444;font-size:0.82rem">SheetJS library not loaded — please reload the page.</span>';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        process(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));
      } catch (err) {
        if (preview) preview.innerHTML = `<span style="color:#ef4444;font-size:0.82rem">Error reading file: ${err.message}</span>`;
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const text  = ev.target.result;
      const delim = text.indexOf('\t') !== -1 ? '\t' : ',';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      process(lines.map(l => l.split(delim)));
    };
    reader.readAsText(file);
  }
};

// ── Save inline edits from the detail modal directly ─────────────────────────
App.saveSalesRequestEdits = async function(requestId) {
  const r = API.SalesRequests.get(requestId);
  if (!r) return;

  const allStyles = [...(r.styles||[]), ...(r.cancelledStyles||[])];
  const newActive = [], newCancelled = [];

  allStyles.forEach(s => {
    const sn  = (s.styleNumber||'').replace(/"/g,'');
    const qty  = parseFloat(document.querySelector(`.sr-qty-input[data-sn="${sn}"]`)?.value)  || s.projQty  || 0;
    const sell = parseFloat(document.querySelector(`.sr-sell-input[data-sn="${sn}"]`)?.value) || s.projSell || 0;
    const note = (document.querySelector(`.sr-note-input[data-sn="${sn}"]`)?.value ?? s.notes ?? '');
    const isCancelled = s.cancelled || (r.cancelledStyles||[]).some(cs => cs.styleNumber === s.styleNumber);
    const updated = { ...s, projQty: qty, projSell: sell, notes: note };
    if (isCancelled) newCancelled.push(updated);
    else newActive.push(updated);
  });

  await API.SalesRequests.update(requestId, { styles: newActive, cancelledStyles: newCancelled });
  App.closeModal();
  App.navigate('sales-requests');
};

App.deleteSalesRequest = async function(id) {
  if (confirm('Delete this sales request?')) { await API.SalesRequests.delete(id); App.navigate('sales-request'); }
};

// ── Propose a Draft Program from a Sales Request ──────────────────────────────
// Sales fills in the program name and target margin, then it lands in
// the PC's "Pending Proposals" queue. PC reviews → Acknowledge → Costing.
App.proposeProgramFromRequest = function(requestId) {
  const r = API.SalesRequests.get(requestId);
  if (!r) return;
  const margin = DB.BrandTierMargins.lookup(r.brand, r.retailer) ||
    DB.InternalPrograms.all().find(ip => ip.brand === r.brand && ip.tier === r.retailer)?.targetMargin || 0;
  App.showModal(`
  <div class="modal-header">
    <h2>✅ Create Costing Program</h2>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button>
  </div>
  <p class="text-muted mb-3">All ${(r.styles||[]).length} styles transfer automatically. Pre-allocated vendors carry forward too.</p>
  <div style="background:var(--bg-elevated);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap">
    <div><div class="text-muted text-sm">Brand</div><div class="font-bold">${r.brand||'—'}</div></div>
    <div><div class="text-muted text-sm">Tier / Retailer</div><div class="font-bold">${r.retailer||'—'}</div></div>
    <div><div class="text-muted text-sm">Gender</div><div class="font-bold">${r.gender||'—'}</div></div>
    <div><div class="text-muted text-sm">Season / Year</div><div class="font-bold">${r.season||''} ${r.year||''}</div></div>
    <div><div class="text-muted text-sm">Styles</div><div class="font-bold">${(r.styles||[]).length}</div></div>
  </div>
  <form onsubmit="App.saveProposeProgram(event,'${requestId}')">
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">✅ Create Program</button>
    </div>
  </form>`, 'modal-lg');
};

App.saveProposeProgram = async function(e, requestId) {
  e.preventDefault();
  const r = API.SalesRequests.get(requestId);
  if (!r) return;

  // Auto-resolve the best matching Internal Program from the SR's brand + tier + gender
  const allIPs = DB.InternalPrograms.all();
  const matchingIP = allIPs.find(ip => ip.brand === r.brand && ip.tier === r.retailer && ip.gender === r.gender)
    || allIPs.find(ip => ip.brand === r.brand && ip.tier === r.retailer)
    || allIPs.find(ip => ip.brand === r.brand)
    || null;

  const ipId         = matchingIP?.id || null;
  const targetMargin = DB.BrandTierMargins.lookup(r.brand, r.retailer) || matchingIP?.targetMargin || 0;
  const name         = [r.brand, r.retailer, r.gender].filter(Boolean).join(' · ')
                     || [r.season, r.year, r.retailer].filter(Boolean).join(' ')
                     || 'Sales Request';

  await API.SalesRequests.convertToProgram(requestId, {
    internalProgramId: ipId,
    name,
    targetMargin,
    season:          r.season   || '',
    year:            r.year     || '',
    retailer:        r.retailer || '',
    brand:           r.brand    || '',
    gender:          r.gender   || '',
    market:          'USA',
    status:          'Costing',
    sourceHandoffId: r.sourceHandoffId || null,
  });

  // Carry vendor pre-allocations: merge request's + any from source handoff
  const updated = API.SalesRequests.get(requestId);
  const progId  = updated?.linkedProgramId;
  if (progId) {
    const reqTCIds     = r.assignedTCIds || [];
    const handoffTCIds = r.sourceHandoffId ? (API.DesignHandoffs.get(r.sourceHandoffId)?.assignedTCIds || []) : [];
    const merged       = [...new Set([...reqTCIds, ...handoffTCIds])];
    if (merged.length) await API.Assignments.assign(progId, merged);
    App.closeModal();
    App.navigate('cost-summary', progId);
  } else {
    App.closeModal();
    App.navigate('programs');
  }
};

// ── PC acknowledges a Draft program → sets to Costing + assigns TCs ───────────
App.acknowledgeProgram = function(programId) {
  const p = API.Programs.get(programId);
  if (!p) return;
  const tcList  = API.cache.tradingCompanies;
  const seasons = ['N/A','Q1','Q2','Q3','Q4'];
  const years   = ['2025','2026','2027','2028','2029','2030'];
  const genders = ['Mens','Ladies','Boys','Girls','Infant/Toddler'];
  const brands  = (() => { const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort(); return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head']; })();
  const tiers   = ['Mass','Mid Tier','Off Price','Clubs','Specialty'];

  App.showModal(`
  <div class="modal-header">
    <h2>&#x2705; Acknowledge &amp; Release Program</h2>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">&#x2715;</button>
  </div>
  ${p.pendingDesignHandoff ? `<div class="alert alert-warning mb-3">&#x26A0; <strong>Pending Design Handoff.</strong> Design has not yet uploaded their style list. You can release now or wait.</div>` : ''}
  <p class="text-muted mb-3">Review and complete the program header, then release to Trading Companies.</p>
  <form onsubmit="App.saveAcknowledgeProgram(event,'${programId}')">
    <div class="form-group">
    </div>
    <div class="form-row form-row-3">
      <div class="form-group"><label class="form-label">Brand</label>
        <select class="form-select" id="ack-brand">
          <option value="">&#x2014; Select &#x2014;</option>
          ${brands.map(b => `<option${p.brand===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Retailer / Tier</label>
        <select class="form-select" id="ack-retailer">
          <option value="">&#x2014; Select &#x2014;</option>
          ${tiers.map(t => `<option${p.retailer===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Gender</label>
        <select class="form-select" id="ack-gender">
          <option value="">&#x2014; Select &#x2014;</option>
          ${genders.map(g => `<option${p.gender===g?' selected':''}>${g}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row form-row-3">
      <div class="form-group"><label class="form-label">Season</label>
        <select class="form-select" id="ack-season">
          ${seasons.map(s => `<option${p.season===s?' selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Year</label>
        <select class="form-select" id="ack-year">
          ${years.map(y => `<option${p.year===y?' selected':''}>${y}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin %</label>
        <input class="form-input" id="ack-margin" type="number" min="0" max="100" step="0.1" value="${p.targetMargin||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Assign Trading Companies</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--bg-elevated);border-radius:var(--radius-sm);">
        ${tcList.map(tc => {
          const assigned = API.Assignments.byProgram(programId).some(a => a.tcId === tc.id);
          return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" class="ack-tc-chk" value="${tc.id}" ${assigned ? 'checked' : ''}>
            <span>${tc.name} <span class="text-muted text-sm">(${tc.code})</span></span>
          </label>`;
        }).join('')}
        ${!tcList.length ? '<p class="text-muted text-sm">No trading companies set up yet.</p>' : ''}
      </div>
    </div>
    ${p.pendingDesignHandoff ? `<div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="ack-clear-flag" checked>
        <span>Clear the "Pending Design Handoff" flag</span>
      </label>
    </div>` : ''}
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">&#x2705; Release to Trading Companies</button>
    </div>
  </form>`, 'modal-lg');
};


App.saveAcknowledgeProgram = async function(e, programId) {
  e.preventDefault();
  const brand    = (document.getElementById('ack-brand')?.value || '').trim();
  const retailer = (document.getElementById('ack-retailer')?.value || '').trim();
  const gender   = (document.getElementById('ack-gender')?.value || '').trim();
  const season   = (document.getElementById('ack-season')?.value || '').trim();
  const year     = (document.getElementById('ack-year')?.value || '').trim();
  const margin   = parseFloat(document.getElementById('ack-margin')?.value) || 0;
  const clearFlag= document.getElementById('ack-clear-flag')?.checked ?? true;
  const tcIds    = [...document.querySelectorAll('.ack-tc-chk:checked')].map(c => c.value);

  // Auto-derive name from fields
  const autoName = [season, year, brand, retailer, gender].filter(Boolean).join(' · ');
  await API.Programs.update(programId, {
    name:         autoName || API.Programs.get(programId)?.name || 'Program',
    brand, retailer, gender, season, year,
    targetMargin: margin,
    status:       'Costing',
    pendingDesignHandoff: clearFlag ? false : true,
  });

  // Assign TCs (replace all current assignments for this program)
  await API.Assignments.assign(programId, tcIds);

  App.closeModal();
  App.navigate('programs');
};

// Allow Design or PC to manually toggle the "Pending Design Handoff" flag
App.togglePendingHandoffFlag = async function(programId) {
  const p = API.Programs.get(programId);
  if (!p) return;
  await API.Programs.update(programId, { pendingDesignHandoff: !p.pendingDesignHandoff });
  App.navigate('programs');
};


App.openNewSalesRequestFromHandoff = function(handoffId) {
  App.openNewSalesRequestModal();
  setTimeout(() => { const sel = document.getElementById('sr-handoff'); if (sel) { sel.value = handoffId; App.seedSalesFromHandoff(); } }, 100);
};



// ── Tech Pack Status History modal ────────────────────────────────────────────
App.openTechPackHistory = function(styleId) {
  const s = API.Styles.get(styleId);
  if (!s) return;
  const history = (s.techPackHistory || []).slice().reverse();
  const labels = { not_submitted: '\u25a1 Not Submitted', submitted: '\ud83d\udce6 Submitted', changed: '\ud83d\udd04 Changed' };
  const colors = { not_submitted: '#94a3b8', submitted: '#3b82f6', changed: '#f59e0b' };

  const rows = history.length ? history.map(h => {
    const dt = new Date(h.changedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const col = colors[h.status] || '#94a3b8';
    return `<tr>
      <td><span style="color:${col};font-weight:600;font-size:0.82rem">${labels[h.status] || h.status || '\u2014'}</span></td>
      <td class="text-sm text-muted">${dt}</td>
      <td class="text-sm">${h.changedBy || '\u2014'}</td>
      <td class="text-sm text-muted">${h.note || '\u2014'}</td>
      ${h.recostRequestId ? `<td><span class="tag" style="font-size:0.7rem;color:#f59e0b">\ud83d\udd04 Re-cost</span></td>` : '<td></td>'}
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="text-muted text-center" style="padding:20px">No status changes recorded yet.</td></tr>`;

  const current = s.techPackStatus || 'not_submitted';
  const canEdit = (() => { const p = App.getPerms ? App.getPerms() : {}; return p.canEditTechPack !== false; })();

  App.showModal(`
  <div class="modal-header">
    <div>
      <h2>\ud83d\udce6 Tech Pack History \u2014 ${s.styleNumber}</h2>
      <p class="text-muted text-sm">${s.styleName || ''}</p>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">&#x2715;</button>
  </div>
  ${canEdit ? `<div class="form-row form-row-2 mb-3" style="align-items:end">
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label">Update Status</label>
      <select class="form-select" id="tp-status-sel">
        <option value="not_submitted"${current==='not_submitted'?' selected':''}>&#x25a1; Not Submitted</option>
        <option value="submitted"${current==='submitted'?' selected':''}>&#x1f4e6; Submitted</option>
        <option value="changed"${current==='changed'?' selected':''}>&#x1f504; Changed</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label">Note (optional)</label>
      <input class="form-input" id="tp-note-inp" placeholder="e.g. Sent to factory 04/14">
    </div>
  </div>
  <div style="text-align:right;margin-bottom:16px">
    <button class="btn btn-primary btn-sm" onclick="
      const v = document.getElementById('tp-status-sel')?.value;
      const n = document.getElementById('tp-note-inp')?.value || '';
      App.saveStyleDeptStatus('${styleId}','techPackStatus',v,n);
      App.closeModal();
    ">Save Status</button>
  </div>` : ''}
  <table style="width:100%">
    <thead><tr>
      <th>Status</th><th>Date</th><th>Changed By</th><th>Note</th><th>Trigger</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`);
};

// ── FOB / Quote History modal ──────────────────────────────────────────────────
App.openFobHistory = function(styleId) {
  const s = API.Styles.get(styleId);
  if (!s) return;
  const subs  = API.Submissions.byStyle(styleId);
  const prog  = API.Programs.get(s.programId);
  const asgns = API.Assignments.byProgram(s.programId || '');

  if (!subs.length) {
    App.showModal(`<div class="modal-header"><h2>\ud83d\udcca Quote History \u2014 ${s.styleNumber}</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">&#x2715;</button></div>
    <div class="empty-state" style="padding:40px;text-align:center"><div style="font-size:2rem">\ud83d\udcca</div><h3>No quotes yet</h3></div>`);
    return;
  }

  // Sort subs by TC, then COO, then date desc
  const sorted = [...subs].sort((a, b) => {
    const ta = a.tcId + a.coo; const tb = b.tcId + b.coo;
    if (ta !== tb) return ta.localeCompare(tb);
    return new Date(b.createdAt||0) - new Date(a.createdAt||0);
  });

  const rows = sorted.map(sub => {
    const tc  = API.TradingCompanies.get(sub.tcId);
    const dt  = sub.createdAt ? new Date(sub.createdAt).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '\u2014';
    const r   = sub.fob ? DB.calcLDP(parseFloat(sub.fob), s, sub.coo, s.market||'USA', 'NY', sub.paymentTerms, sub.factoryCost) : null;
    const ldp = r ? '$' + r.ldp.toFixed(2) : '\u2014';
    const fob = sub.fob ? '$' + parseFloat(sub.fob).toFixed(2) : '\u2014';
    const onTarget = r && prog && r.ldp <= (DB.computeTargetLDP(s, prog) || Infinity);
    const trigger = sub.recostRequestId ? `<span class="tag" style="font-size:0.68rem;color:#f59e0b">\ud83d\udd04 Re-cost</span>` : '';
    return `<tr>
      <td class="font-bold text-sm">${tc?.code || sub.tcId}</td>
      <td class="text-sm">${sub.coo || '\u2014'}</td>
      <td class="text-sm text-muted">${dt}</td>
      <td class="font-bold">${fob}</td>
      <td class="font-bold ${onTarget ? 'text-success' : r ? 'text-warning' : ''}">${ldp}</td>
      <td class="text-sm">${sub.paymentTerms || '\u2014'}</td>
      <td>${trigger}</td>
    </tr>`;
  }).join('');

  App.showModal(`
  <div class="modal-header">
    <div>
      <h2>\ud83d\udcca Quote History \u2014 ${s.styleNumber}</h2>
      <p class="text-muted text-sm">${s.styleName || ''} &middot; ${subs.length} quotes</p>
    </div>
    <button class="btn btn-ghost btn-icon" onclick="App.closeModal()">&#x2715;</button>
  </div>
  <table style="width:100%">
    <thead><tr>
      <th>TC</th><th>COO</th><th>Date</th><th>FOB</th><th>LDP</th><th>Terms</th><th>Trigger</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`, 'modal-lg');
};

// ── Inline cell edit in Programs table ────────────────────────────────────────
App._inlineEdit = function(e, programId, field) {
  e.stopPropagation();
  const cell = e.currentTarget;
  if (cell.querySelector('input,select')) return; // already editing
  const p = API.Programs.get(programId);
  if (!p) return;

  const OPTS = {
    season: ['N/A','Q1','Q2','Q3','Q4'],
    year:   ['2025','2026','2027','2028','2029','2030'],
    gender: ['','Mens','Ladies','Boys','Girls','Infant/Toddler'],
  };

  const restore = () => {
    const fresh = API.Programs.get(programId) || p;
    const v = fresh[field] || '';
    if (field === 'name') {
      cell.innerHTML = (v || 'Unnamed') + ' <span style="opacity:0.35;font-size:0.7rem">&#x270F;</span>';
    } else if (field === 'gender') {
      cell.innerHTML = v ? `<span class="tag">${v}</span>` : '<span class="text-muted">&mdash;</span>';
    } else {
      cell.textContent = v || '—';
    }
  };

  if (OPTS[field]) {
    const sel = document.createElement('select');
    sel.className = 'form-select';
    sel.style.cssText = 'padding:2px 4px;font-size:0.85rem;border-radius:4px;max-width:120px';
    OPTS[field].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o || '— None —';
      if ((p[field] || '') === o) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => { API.Programs.update(programId, { [field]: sel.value }).then(restore); };
    sel.onblur   = restore;
    cell.innerHTML = '';
    cell.appendChild(sel);
    sel.focus();
  } else {
    const inp = document.createElement('input');
    inp.className = 'form-input';
    inp.style.cssText = 'padding:2px 6px;font-size:0.875rem;min-width:180px;border-radius:4px';
    inp.value = p[field] || '';
    const save = () => {
      const v = inp.value.trim() || p[field];
      API.Programs.update(programId, { [field]: v }).then(restore);
    };
    inp.onblur   = save;
    inp.onkeydown = ev => {
      if (ev.key === 'Enter')  { save(); }
      if (ev.key === 'Escape') { restore(); }
    };
    cell.innerHTML = '';
    cell.appendChild(inp);
    inp.focus(); inp.select();
  }
};

// ── Inline chip edit in Cost Summary header strip ─────────────────────────────
App._editProgHeader = function(programId, field, chipEl) {
  if (chipEl.querySelector('input,select')) return;
  const p = API.Programs.get(programId);
  if (!p) return;
  const valEl = chipEl.querySelector('.chip-val');
  if (!valEl) return;

  const brands = (() => {
    const b = [...new Set(DB.BrandTierMargins.all().map(m => m.brand).filter(Boolean))].sort();
    return b.length ? b : ['Reebok','Champion','And1','Gaiam','Head'];
  })();

  const OPTS = {
    season:   ['N/A','Q1','Q2','Q3','Q4'],
    year:     ['2025','2026','2027','2028','2029','2030'],
    gender:   ['','Mens','Ladies','Boys','Girls','Infant/Toddler'],
    brand:    brands,
    retailer: ['Mass','Mid Tier','Off Price','Clubs','Specialty'],
    market:   ['USA','Canada'],
    status:   ['Draft','Costing','Placed','Cancelled'],
  };

  const save = (val) => {
    API.Programs.update(programId, { [field]: val });
    valEl.textContent = val || '—';
    if (field === 'name') {
      const h1 = document.querySelector('h1.page-title');
      if (h1) h1.textContent = (val || 'Program') + ' \u2014 Cost Summary';
    }
  };

  if (OPTS[field]) {
    const sel = document.createElement('select');
    sel.className = 'form-select';
    sel.style.cssText = 'padding:2px 6px;font-size:0.82rem;max-width:160px;display:inline-block';
    OPTS[field].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o || '\u2014 None \u2014';
      if ((p[field] || '') === o) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => { save(sel.value); sel.blur(); };
    sel.onblur   = () => {
      setTimeout(() => {
        if (chipEl.contains(sel)) { valEl.textContent = API.Programs.get(programId)?.[field] || '\u2014'; sel.remove(); }
      }, 100);
    };
    valEl.innerHTML = '';
    valEl.appendChild(sel);
    sel.focus();
  } else {
    const inp = document.createElement('input');
    inp.className = 'form-input';
    inp.style.cssText = 'padding:2px 6px;font-size:0.82rem;min-width:150px;display:inline-block;border-radius:4px';
    inp.value = p[field] || '';
    const done = () => {
      const v = inp.value.trim();
      save(v || p[field]);
      valEl.innerHTML = v || p[field] || '\u2014';
    };
    inp.onblur   = done;
    inp.onkeydown = ev => {
      if (ev.key === 'Enter')  { done(); }
      if (ev.key === 'Escape') { valEl.textContent = p[field] || '\u2014'; }
    };
    valEl.innerHTML = '';
    valEl.appendChild(inp);
    inp.focus(); inp.select();
  }
};

// ─ Design Changes ────────────────────────────────────────────────
App.openDesignChangeModal = function(styleId) {
  const style   = API.Styles.get(styleId);
  if (!style) return;
  const prog     = API.Programs.get(style.programId);
  const isLocked = prog && ['Costing','Placed'].includes(prog.status);
  const existing = API.DesignChanges.byStyle(styleId);

  const lockBanner = isLocked ? `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
                background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);
                border-radius:var(--radius-sm);margin-bottom:16px">
      <span style="font-size:1.3rem">🔒</span>
      <div>
        <div style="font-weight:700;color:#f59e0b;font-size:0.9rem">Style Locked — Re-cost Required</div>
        <div class="text-sm text-muted">This program is in <strong>Costing</strong> status.
          Submitting this change will automatically create a Re-cost Request
          that must be approved by Sales, then released by Production before vendors are notified.</div>
      </div>
    </div>` : '';

  const btnLabel = isLocked ? '🔄 Submit Re-cost Request' : 'Log Change';
  const btnClass = isLocked ? 'btn btn-warning' : 'btn btn-primary';

  App.showModal(
    `<div class="modal-header" style="display:block;margin-bottom:20px">` +
    `<div style="display:flex;justify-content:space-between;align-items:center">` +
    `<h2>${isLocked ? '🔒' : '📌'} Design Change — ${style.styleNumber}</h2>` +
    `<button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>` +
    `<div class="text-sm text-muted mt-1">${style.styleName||''} ${isLocked ? '· <span style=\'color:#f59e0b\'>Locked Program</span>' : ''}</div></div>` +
    lockBanner +
    `<div class="font-bold mb-3" style="color:var(--accent)">Log New Change</div>` +
    `<form onsubmit="App.saveDesignChange(event,'${styleId}','${style.programId||''}')">` +
    `<input type="hidden" id="dc-locked" value="${isLocked ? '1' : '0'}">` +
    `<div class="form-group"><label class="form-label">Description *</label>` +
    `<input class="form-input" id="dc-desc" placeholder="e.g. Changed hem length, updated collar, color change…" required></div>` +
    `<div class="form-row form-row-3">` +
    `<div class="form-group"><label class="form-label">Field Changed</label>` +
    `<select class="form-select" id="dc-field"><option value="">General Change</option>` +
    `<option>Fabrication</option><option>Colorway</option><option>Construction</option>` +
    `<option>Silhouette</option><option>Trim</option><option>Embellishment</option>` +
    `<option>Sizing</option><option>Label / Branding</option><option>Other</option></select></div>` +
    `<div class="form-group"><label class="form-label">Previous Value</label><input class="form-input" id="dc-prev"></div>` +
    `<div class="form-group"><label class="form-label">New Value</label><input class="form-input" id="dc-new"></div></div>` +
    `<div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>` +
    `<button type="submit" class="${btnClass}">${btnLabel}</button></div></form>` +
    (existing.length ? `<div class="font-bold mt-4 mb-2" style="color:var(--text-secondary)">History (${existing.length})</div>${AdminViews.designChangeHistoryPanel(styleId)}` : ''),
    'modal-xl');
};

App.saveDesignChange = async function(e, styleId, programId) {
  e.preventDefault();
  const user     = App._getState()?.user || {};
  const style    = API.Styles.get(styleId);
  const pid      = programId || style?.programId;
  const isLocked = document.getElementById('dc-locked')?.value === '1';
  const desc     = document.getElementById('dc-desc')?.value  || '';
  const field    = document.getElementById('dc-field')?.value || '';
  const prev     = document.getElementById('dc-prev')?.value  || '';
  const newVal   = document.getElementById('dc-new')?.value   || '';

  // Always log the design change
  const changeEntry = await API.DesignChanges.log({
    styleId, programId: pid,
    styleNumber:   style?.styleNumber || styleId,
    description:   desc,
    field,
    previousValue: prev,
    newValue:      newVal,
    changedBy:     user?.id   || '',
    changedByName: user?.name || user?.email || '',
  });

  if (isLocked) {
    // Create a re-cost request requiring Sales → Production approval chain
    const rcr = await API.RecostRequests.create({
      programId:   pid,
      styleId,
      styleIds:    [styleId],
      status:      'pending_sales',
      category:    field || 'Design Change',
      note:        desc,
      previousValue: prev,
      newValue:    newVal,
      requestedBy:     user?.id   || '',
      requestedByName: user?.name || user?.email || 'Design',
      designChangeId: changeEntry?.id || null,
    });

    // Mark Tech Pack as Changed and write history entry
    App.saveStyleDeptStatus(styleId, 'techPackStatus', 'changed',
      `Re-cost requested: ${desc}`, rcr?.id);
  }

  App.closeModal();
  const st = App._getState();
  App.navigate(st?.route, st?.routeParam);
};

// ─ Fabric Standard Requests ──────────────────────────────────────
App.openFabricRequestModal = function(tcId) {
  const tc      = API.TradingCompanies.get(tcId);
  const user    = App._getState()?.user || {};
  const allProgs= API.Assignments.all().filter(a => a.tcId === tcId).map(a => API.Programs.get(a.programId)).filter(Boolean);
  const fabLib  = API.FabricLibrary.all();
  App.showModal(`
  <div class="modal-header"><h2>🧵 Request Fabric Swatch</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
  <form onsubmit="App.saveFabricRequest(event,'${tcId}')">
    <div class="form-group"><label class="form-label">Program</label>
      <select class="form-select" id="fr-prog">
        <option value="">— General Request —</option>
        ${allProgs.map(p => `<option value="${p.id}">${p.name} ${p.season||''} ${p.year||''}</option>`).join('')}
      </select>
    </div>
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Fabric Code *</label>
        <input class="form-input" id="fr-code" list="fr-code-dl" placeholder="e.g. FAB001" required>
        <datalist id="fr-code-dl">${fabLib.map(f => `<option value="${f.fabricCode}">${f.fabricCode} — ${f.fabricName}</option>`).join('')}</datalist>
      </div>
      <div class="form-group"><label class="form-label">Fabric Name</label>
        <input class="form-input" id="fr-name" placeholder="e.g. Woven Tech Pique">
      </div>
    </div>
    <div class="form-row form-row-2">
      <div class="form-group"><label class="form-label">Content</label>
        <input class="form-input" id="fr-content" placeholder="e.g. 88% Poly 12% Spandex">
      </div>
      <div class="form-group"><label class="form-label">Swatch Qty *</label>
        <input class="form-input" id="fr-qty" type="number" min="1" placeholder="e.g. 3" required>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Style Numbers (comma-separated, optional)</label>
      <input class="form-input" id="fr-styles" placeholder="e.g. HEW243, HEW244">
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Submit Request</button>
    </div>
  </form>`, 'modal-lg');
};

App.saveFabricRequest = async function(e, tcId) {
  e.preventDefault();
  const tc       = API.TradingCompanies.get(tcId);
  const user     = App._getState()?.user || {};
  const progId   = document.getElementById('fr-prog')?.value || '';
  const prog     = progId ? API.Programs.get(progId) : null;
  const styleStr = document.getElementById('fr-styles')?.value || '';
  const styleNums= styleStr.split(',').map(s=>s.trim()).filter(Boolean);
  const styleIds = styleNums.map(sn => API.Styles.all().find(st => st.styleNumber.trim() === sn)?.id).filter(Boolean);
  const payload  = {
    tcId, tcName: tc?.name||tcId, tcEmail: tc?.email||'',
    programId: progId||null, programName: prog?.name||'',
    fabricCode:  document.getElementById('fr-code')?.value    || '',
    fabricName:  document.getElementById('fr-name')?.value    || '',
    content:     document.getElementById('fr-content')?.value || '',
    swatchQty:   parseInt(document.getElementById('fr-qty')?.value)||1,
    styleNumbers: styleNums, styleIds, requestedBy: user?.name||user?.email||tcId,
  };
  try {
    await fetch('/api/fabric-requests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } catch {
    const local = JSON.parse(localStorage.getItem('vcp_fabric_req_local')||'[]');
    local.push({ ...payload, id: Date.now().toString(36), requestedAt: new Date().toISOString(), status: 'pending' });
    localStorage.setItem('vcp_fabric_req_local', JSON.stringify(local));
  }
  App.closeModal();
  App.navigate('fabric-standards');
};

App.markFabricSent = async function(id) {
  const awb = prompt('AWB / Tracking Number (optional):', '');
  if (awb === null) return; // user cancelled
  try {
    await fetch(`/api/fabric-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sent', awbNumber: awb.trim(), sentAt: new Date().toISOString() }),
    });
  } catch { alert('Could not update — server not reachable.'); return; }
  App._refreshStandards();
};

App.markFabricReceived = async function(id) {
  try {
    await fetch(`/api/fabric-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'received', receivedAt: new Date().toISOString() }),
    });
  } catch { alert('Could not update — server not reachable.'); return; }
  App._refreshStandards();
};


App.deleteFabricRequest = async function(id) {
  if (!confirm('Cancel this fabric request?')) return;
  try { await fetch(`/api/fabric-requests/${id}`, { method:'DELETE' }); }
  catch { alert('Could not delete — server not reachable.'); return; }
  App.navigate('fabric-standards');
};

App.filterFabricRequests = async function() {
  const statusF = document.getElementById('fabric-status-filter')?.value || '';
  const tcF     = document.getElementById('fabric-tc-filter')?.value     || '';
  let all = [];
  try { all = await (await fetch('/api/fabric-requests')).json(); } catch { return; }
  let rows = all;
  if (statusF) rows = rows.filter(r => r.status === statusF);
  if (tcF)     rows = rows.filter(r => (r.tcName||r.tcId) === tcF);
  const tbody = document.getElementById('fabric-requests-tbody');
  if (!tbody) return;
  const isVendor = !['admin','pc','planning','design'].includes(App._getState()?.user?.role);
  const fd = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  const sc = s => ({pending:'<span class="badge badge-pending">🟡 Pending</span>',sent:'<span class="badge badge-costing">🔵 Sent</span>',received:'<span class="badge badge-placed">✅ Received</span>'}[s]||'<span class="badge">—</span>');
  tbody.innerHTML = rows.map(r => {
    const styles = Array.isArray(r.styleNumbers) ? r.styleNumbers.join(', ') : (r.styleNumbers||'—');
    const adminBtns = `<div style="display:flex;gap:6px">${r.status==='pending'?`<button class="btn btn-primary btn-sm" onclick="App.markFabricSent('${r.id}')">📤 Sent</button>`:''}${r.status==='sent'?`<button class="btn btn-success btn-sm" onclick="App.markFabricReceived('${r.id}')">✅ Rcvd</button>`:''}${r.status!=='received'?`<button class="btn btn-danger btn-sm" onclick="App.deleteFabricRequest('${r.id}')">🗑</button>`:''}</div>`;
    const tcBtns   = r.status==='pending' ? `<button class="btn btn-danger btn-sm" onclick="App.deleteFabricRequest('${r.id}')">Cancel</button>` : '';
    return `<tr>${!isVendor?`<td class="font-bold">${r.tcName||'—'}</td>`:''}<td class="font-bold primary">${r.fabricCode||'—'}</td><td>${r.fabricName||'—'}</td><td class="text-sm text-muted">${r.content||'—'}</td><td class="text-center font-bold">${r.swatchQty||'—'}</td><td class="text-sm">${styles}</td><td class="text-sm">${r.programName||'—'}</td><td class="text-sm text-muted">${fd(r.requestedAt)}</td><td>${r.sentAt?fd(r.sentAt):'—'}</td><td>${sc(r.status)}</td><td>${isVendor?tcBtns:adminBtns}</td></tr>`;
  }).join('') || `<tr><td colspan="${isVendor?10:11}" class="text-center text-muted" style="padding:40px">No results.</td></tr>`;
};

App.sendFabricDigestNow = async function() {
  const btn = event?.currentTarget || event?.target;
  if (btn) { btn.disabled=true; btn.textContent='📧 Sending…'; }
  try {
    const res  = await fetch('/api/send-digest', { method:'POST' });
    const data = await res.json();
    alert(data.ok ? `✅ Digest sent to ${data.sent} TC(s).` : `⚠ ${data.error||data.skipped||'Unknown'}`);
  } catch { alert('⚠ Could not reach server — is it running?'); }
  finally { if (btn) { btn.disabled=false; btn.textContent='📧 Send Digest Now'; } }
};

} catch (_appInitErr) {
  // The App IIFE threw — App is safely undefined (var, not const)
  // This error will be visible when DOMContentLoaded fires below.
  console.error('[FATAL] app.js IIFE crashed:', _appInitErr);
  window._appErr = _appInitErr; // expose for inline error banner
}

document.addEventListener('DOMContentLoaded', () => {
  if (!App) {
    console.error('[App] App is undefined — IIFE crashed. Error:', window._appErr);
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fecaca;font-family:monospace;padding:16px 24px;font-size:13px;white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto';
    errDiv.textContent = '[App failed to load] ' + (window._appErr ? window._appErr.stack : 'unknown error');
    document.body.appendChild(errDiv);
    return;
  }
  try {
    App.init();
  } catch(err) {
    console.error('[App.init ERROR]', err);
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fecaca;font-family:monospace;padding:16px 24px;font-size:13px;white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto';
    errDiv.textContent = '[App.init ERROR] ' + err.message + '\n\n' + err.stack;
    document.body.appendChild(errDiv);
  }
});


// Generic PATCH helper for fabric requests
App._patchFabricRequest = async function(id, data) {
  try {
    const res = await fetch('/api/fabric-requests/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  } catch(e) { console.error('patch failed', e); }
};

// Multi-select create shipment package
App.createShipmentPackage = async function() {
  const checked = [...document.querySelectorAll('.fab-req-chk:checked')];
  if (!checked.length) { alert('Select at least one item.'); return; }
  const awb = prompt('AWB / Tracking Number for this package:');
  if (!awb) return;
  const sentDate = new Date().toISOString();
  for (const chk of checked) {
    await App._patchFabricRequest(chk.value, {
      status: 'sent', awbNumber: awb.trim(), sentAt: sentDate,
    });
  }
  if (typeof App._refreshStandards === 'function') App._refreshStandards();
  else location.reload();
};

// TC marks received
App.markFabricReceived = async function(id) {
  await App._patchFabricRequest(id, { status: 'received', receivedAt: new Date().toISOString() });
  if (typeof App._refreshStandards === 'function') App._refreshStandards();
  else location.reload();
};

App._refreshStandards = function() {
  const user = App._getState()?.user || {};
  AdminViews.renderFabricStandards(user.role, user.tcId).then(html => {
    const mc = document.getElementById('content');
    if (mc) mc.innerHTML = html;
  });
};


// ── Tech Design Notes — per-style save ───────────────────────────────────────
App.saveTechDesignNote = function(styleId, value) {
  const trimmed = (value || '').trim();
  API.Styles.update(styleId, { techDesignNotes: trimmed });
};

// ── Add Fabrics / Trims to existing handoff (piecemeal upload) ────────────────
App.openAddTabModal = function(handoffId, tabType) {
  const h   = API.DesignHandoffs.get(handoffId);
  if (!h) return;
  const label = tabType === 'fabrics' ? 'Fabrics' : 'Trims';
  const hdrs  = tabType === 'fabrics'
    ? 'Fabric Ref #, Supplier, Fabric Name, Color, Content/Composition, Weight (gsm), Notes'
    : 'Trim Ref #, Supplier, Description, Color, Unit, Notes';
  App.showModal(`
  <div class="modal-header"><h2>🧵 Add ${label} to Handoff</h2><button class="btn btn-ghost btn-icon" onclick="App.closeModal()">✕</button></div>
  <p class="text-muted mb-3">Upload the ${label} tab from the 3-tab template, or any matching Excel/CSV file.</p>
  <div class="form-group">
    <label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;border:2px dashed var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--bg-elevated)"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="font-size:1.6rem">📂</span>
      <span style="font-weight:600">Upload Excel or CSV</span>
      <span style="font-size:0.75rem;color:#94a3b8">Expected columns: ${hdrs}</span>
      <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="App._handleAddTabFile(event,'${handoffId}','${tabType}')">
    </label>
    <div id="add-tab-preview" style="margin-top:10px"></div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
    <button class="btn btn-primary" id="add-tab-save-btn" disabled onclick="App._saveAddTab('${handoffId}','${tabType}')">Save ${label}</button>
  </div>`, 'modal-lg');
};

App._addTabParsed = null;
App._handleAddTabFile = function(e, handoffId, tabType) {
  const file = e.target.files[0]; if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    document.getElementById('add-tab-preview').innerHTML = '<div class="alert alert-danger">Please upload an Excel file (.xlsx or .xls)</div>';
    return;
  }
  if (typeof XLSX === 'undefined') { alert('SheetJS not loaded'); return; }
  const r = new FileReader();
  r.onload = ev => {
    try {
      const wb   = XLSX.read(ev.target.result, { type: 'array' });
      // Look for tab named Fabrics or Trims first, fall back to first sheet
      const sheetName = tabType === 'fabrics' ? 'Fabrics' : 'Trims';
      const ws   = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
      const aoa  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (aoa.length < 2) { document.getElementById('add-tab-preview').innerHTML = '<div class="alert alert-danger">No data rows found.</div>'; return; }
      const hdrs = aoa[0].map(h => String(h).trim().toLowerCase().replace(/[\s#*]+/g,'_'));
      const get  = (row, patterns, pos) => { const i = hdrs.findIndex(h => patterns.some(p => h.includes(p))); return String(row[i >= 0 ? i : pos] || '').trim(); };
      let rows;
      if (tabType === 'fabrics') {
        rows = aoa.slice(1).map(row => ({
          refNumber: get(row,['ref','code'],0), supplier: get(row,['supplier'],1),
          name: get(row,['name'],2), color: get(row,['color'],3),
          content: get(row,['content','composition'],4), weight: get(row,['weight','gsm'],5), notes: get(row,['note'],6),
        })).filter(r => r.refNumber || r.name);
      } else {
        rows = aoa.slice(1).map(row => ({
          refNumber: get(row,['ref','code'],0), supplier: get(row,['supplier'],1),
          description: get(row,['desc','name'],2), color: get(row,['color'],3),
          unit: get(row,['unit'],4), notes: get(row,['note'],5),
        })).filter(r => r.refNumber || r.description);
      }
      App._addTabParsed = rows;
      const previewEl = document.getElementById('add-tab-preview');
      const btn = document.getElementById('add-tab-save-btn');
      if (previewEl) previewEl.innerHTML = `<div class="alert alert-info">✓ ${rows.length} ${tabType === 'fabrics' ? 'fabric' : 'trim'} rows loaded from <strong>${file.name}</strong></div>`;
      if (btn) btn.disabled = false;
    } catch(err) {
      document.getElementById('add-tab-preview').innerHTML = '<div class="alert alert-danger">❌ ' + err.message + '</div>';
    }
  };
  r.readAsArrayBuffer(file);
};

App._saveAddTab = async function(handoffId, tabType) {
  const rows = App._addTabParsed;
  if (!rows || !rows.length) { alert('No data to save.'); return; }
  if (tabType === 'fabrics') {
    await API.DesignHandoffs.update(handoffId, { fabricsList: rows, fabricsUploaded: true, fabricsUploadedAt: new Date().toISOString() });
  } else {
    await API.DesignHandoffs.update(handoffId, { trimsList: rows, trimsUploaded: true, trimsUploadedAt: new Date().toISOString() });
  }
  App._addTabParsed = null;
  App.closeModal();
  App.navigate('design-handoff');
};
