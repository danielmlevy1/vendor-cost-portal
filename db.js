// =============================================================
// VENDOR COST PORTAL — Data Layer (db.js)
// localStorage-backed data store with seed data
// Schema v11: Pre-costing workflow (Design Handoff, Sales Request,
//             Fabric Library, Design Changes)
// =============================================================

const DB = (() => {
    const KEYS = {
        users: 'vcp_users',
        programs: 'vcp_programs',
        internalPrograms: 'vcp_internal_programs',
        brandTierMargins: 'vcp_brand_tier_margins',
        styles: 'vcp_styles',
        tradingCompanies: 'vcp_trading_companies',
        assignments: 'vcp_assignments',
        submissions: 'vcp_submissions',
        placements: 'vcp_placements',
        cooRates: 'vcp_coo_rates',
        pendingChanges: 'vcp_pending_changes',
        cellFlags: 'vcp_cell_flags',
        revisions: 'vcp_revisions',
        customers: 'vcp_customers',
        customerBuys: 'vcp_customer_buys',
        customerAssignments: 'vcp_customer_assignments',
        session: 'vcp_session',
        // Pre-costing workflow (v11)
        designHandoffs:  'vcp_design_handoffs',
        fabricLibrary:   'vcp_fabric_library',
        salesRequests:   'vcp_sales_requests',
        designChanges:   'vcp_design_changes',
        departments:     'vcp_departments',
        styleLinks:      'vcp_style_links',
        recostReqs:      'vcp_recostreqs',
        costHistory:     'vcp_cost_history',
    };

    const get = k => JSON.parse(localStorage.getItem(k) || '[]');
    const getObj = k => JSON.parse(localStorage.getItem(k) || 'null');
    const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const now = () => new Date().toISOString();

    // ── Seed ───────────────────────────────────────────────────
    const SEED_USERS = [
        { id: 'admin',    name: 'Admin Team',        email: 'admin@company.com',    password: 'admin123',  role: 'admin',    internalProgramId: null },
        { id: 'pc1',      name: 'Production Team',   email: 'pc@company.com',        password: 'pc123',     role: 'pc',       internalProgramId: null },
        { id: 'planning1',name: 'Planning & Sales',  email: 'planning@company.com',  password: 'plan123',   role: 'planning', internalProgramId: 'ip1' },
        { id: 'sales1',   name: 'Sales',             email: 'sales@company.com',     password: 'sales123',  role: 'planning', internalProgramId: 'ip1' },
        { id: 'design1',  name: 'Design Team',       email: 'design@company.com',    password: 'design123', role: 'design',   internalProgramId: 'ip1' },
        { id: 'techdes1', name: 'Tech Design',       email: 'techdesign@company.com',password: 'tech123',   role: 'design',   internalProgramId: 'ip1' },
    ];

    const SEED_CUSTOMERS = [
        { id: 'cust1', code: 'WMT', name: 'Walmart' },
        { id: 'cust2', code: 'TGT', name: 'Target' },
        { id: 'cust3', code: 'COST', name: 'Costco' },
    ];

    const SEED_INTERNAL_PROGRAMS = [
        { id: 'ip1', name: 'Reebok WM',      brand: 'Reebok',   tier: 'Mass',     gender: 'Mens',   targetMargin: 0.55 },
        { id: 'ip2', name: 'Reebok Canada',  brand: 'Reebok',   tier: 'Mass',     gender: 'Ladies', targetMargin: 0.55 },
        { id: 'ip3', name: 'Champion WM',    brand: 'Champion', tier: 'Mass',     gender: 'Mens',   targetMargin: 0.45 },
        { id: 'ip4', name: 'And1 WM',        brand: 'And1',     tier: 'Mass',     gender: 'Mens',   targetMargin: 0.48 },
        { id: 'ip5', name: 'Gaiam WM',       brand: 'Gaiam',    tier: 'Mass',     gender: 'Ladies', targetMargin: 0.50 },
        { id: 'ip6', name: 'Head Specialty', brand: 'Head',     tier: 'Specialty',gender: 'Mens',   targetMargin: 0.52 },
    ];

    const SEED_BRAND_TIER_MARGINS = [
        // Reebok
        { id: 'btm_rb_ms',  brand: 'Reebok',   tier: 'Mass',      targetMargin: 0.55 },
        { id: 'btm_rb_mt',  brand: 'Reebok',   tier: 'Mid Tier',  targetMargin: 0.52 },
        { id: 'btm_rb_op',  brand: 'Reebok',   tier: 'Off Price', targetMargin: 0.48 },
        { id: 'btm_rb_cl',  brand: 'Reebok',   tier: 'Clubs',     targetMargin: 0.50 },
        { id: 'btm_rb_sp',  brand: 'Reebok',   tier: 'Specialty', targetMargin: 0.53 },
        // Champion
        { id: 'btm_ch_ms',  brand: 'Champion', tier: 'Mass',      targetMargin: 0.45 },
        { id: 'btm_ch_mt',  brand: 'Champion', tier: 'Mid Tier',  targetMargin: 0.43 },
        { id: 'btm_ch_op',  brand: 'Champion', tier: 'Off Price', targetMargin: 0.40 },
        { id: 'btm_ch_cl',  brand: 'Champion', tier: 'Clubs',     targetMargin: 0.42 },
        { id: 'btm_ch_sp',  brand: 'Champion', tier: 'Specialty', targetMargin: 0.45 },
        // And1
        { id: 'btm_a1_ms',  brand: 'And1',     tier: 'Mass',      targetMargin: 0.48 },
        { id: 'btm_a1_mt',  brand: 'And1',     tier: 'Mid Tier',  targetMargin: 0.46 },
        { id: 'btm_a1_op',  brand: 'And1',     tier: 'Off Price', targetMargin: 0.42 },
        { id: 'btm_a1_cl',  brand: 'And1',     tier: 'Clubs',     targetMargin: 0.44 },
        { id: 'btm_a1_sp',  brand: 'And1',     tier: 'Specialty', targetMargin: 0.48 },
        // Gaiam
        { id: 'btm_ga_ms',  brand: 'Gaiam',    tier: 'Mass',      targetMargin: 0.50 },
        { id: 'btm_ga_mt',  brand: 'Gaiam',    tier: 'Mid Tier',  targetMargin: 0.48 },
        { id: 'btm_ga_op',  brand: 'Gaiam',    tier: 'Off Price', targetMargin: 0.44 },
        { id: 'btm_ga_cl',  brand: 'Gaiam',    tier: 'Clubs',     targetMargin: 0.46 },
        { id: 'btm_ga_sp',  brand: 'Gaiam',    tier: 'Specialty', targetMargin: 0.50 },
        // Head
        { id: 'btm_hd_ms',  brand: 'Head',     tier: 'Mass',      targetMargin: 0.48 },
        { id: 'btm_hd_mt',  brand: 'Head',     tier: 'Mid Tier',  targetMargin: 0.50 },
        { id: 'btm_hd_op',  brand: 'Head',     tier: 'Off Price', targetMargin: 0.44 },
        { id: 'btm_hd_cl',  brand: 'Head',     tier: 'Clubs',     targetMargin: 0.46 },
        { id: 'btm_hd_sp',  brand: 'Head',     tier: 'Specialty', targetMargin: 0.52 },
    ];

    // Freight multipliers (usaMult / canadaMult) sourced from PreCostingTemplate Internal sheet.
    // Proj TTL Freight/unit = ROUND(estFreight × (1 + multiplier), 0.01)
    // e.g. KH usaMult=1.5 → totalFreight = estFreight × 2.5
    const SEED_COO_RATES = [
        { id: 'BD', code: 'BD', country: 'Bangladesh', addlDuty: 0.100, usaMult: 1.5000, canadaMult: 1.5714 },
        { id: 'KH', code: 'KH', country: 'Cambodia',   addlDuty: 0.190, usaMult: 1.5000, canadaMult: 1.5714 },
        { id: 'CN', code: 'CN', country: 'China',       addlDuty: 0.275, usaMult: -0.5556, canadaMult: 1.5714 },
        { id: 'EG', code: 'EG', country: 'Egypt',       addlDuty: 0.100, usaMult: 1.5000, canadaMult: 0 },
        { id: 'ET', code: 'ET', country: 'Ethiopia',    addlDuty: 0.100, usaMult: 2.1667, canadaMult: 0 },
        { id: 'ID', code: 'ID', country: 'Indonesia',   addlDuty: 0.190, usaMult: 1.5000, canadaMult: 1.4286 },
        { id: 'HT', code: 'HT', country: 'Haiti',       addlDuty: 0.100, usaMult: 1.5000, canadaMult: 1.4286 },
        { id: 'JD', code: 'JD', country: 'Jordan',      addlDuty: 0.150, usaMult: 2.0000, canadaMult: 1.2857 },
        { id: 'KY', code: 'KY', country: 'Kenya',       addlDuty: 0.100, usaMult: 2.0000, canadaMult: 2.0000 },
        { id: 'LS', code: 'LS', country: 'Lesotho',     addlDuty: 0.150, usaMult: 2.0000, canadaMult: 2.2857 },
        { id: 'PK', code: 'PK', country: 'Pakistan',    addlDuty: 0.190, usaMult: 1.1667, canadaMult: 1.1429 },
        { id: 'TH', code: 'TH', country: 'Thailand',    addlDuty: 0.190, usaMult: 1.3333, canadaMult: 2.0000 },
        { id: 'TK', code: 'TK', country: 'Turkey',      addlDuty: 0.200, usaMult: 1.1667, canadaMult: 0 },
        { id: 'VN', code: 'VN', country: 'Vietnam',     addlDuty: 0.200, usaMult: 1.5000, canadaMult: 1.5714 },
        { id: 'ES', code: 'ES', country: 'Eswatini',    addlDuty: 0.100, usaMult: 2.0000, canadaMult: 2.0000 },
    ];

    // Trading Companies — grouped by company; coos = countries they can quote from
    const SEED_TRADING_COMPANIES = [
        { id: 'tc_az',   code: 'AZ',   name: 'Amazing Space',      email: 'az@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['CN','KH'] },
        { id: 'tc_cs',   code: 'CS',   name: 'Consummate',          email: 'cs@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: [] },
        { id: 'tc_eg',   code: 'EG',   name: 'Eastern Garment',     email: 'eg@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['PK'] },
        { id: 'tc_fhd',  code: 'FHD',  name: 'Federal Home Depot',  email: 'fhd@vendor.com',  password: 'vendor123', paymentTerms: 'FOB', coos: ['KH'] },
        { id: 'tc_gm',   code: 'GM',   name: 'Guomao',              email: 'gm@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
        { id: 'tc_gu',   code: 'GU',   name: 'Great Union',         email: 'gu@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['KH','KY'] },
        { id: 'tc_hnm',  code: 'HNM',  name: 'HNM',                 email: 'hnm@vendor.com',  password: 'vendor123', paymentTerms: 'FOB', coos: ['PK'] },
        { id: 'tc_hr',   code: 'HR',   name: 'Hongren',             email: 'hr@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['CN','KH'] },
        { id: 'tc_hs',   code: 'HS',   name: 'Hansae',              email: 'hs@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
        { id: 'tc_kt',   code: 'KT',   name: 'KT Group',            email: 'kt@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: [] },
        { id: 'tc_ly',   code: 'LY',   name: 'Liyang',              email: 'ly@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['KH'] },
        { id: 'tc_mk',   code: 'MK',   name: 'Makalot',             email: 'mk@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
        { id: 'tc_ml',   code: 'ML',   name: 'Morelands',           email: 'ml@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['JD','KH'] },
        { id: 'tc_rl',   code: 'RL',   name: 'Reliance',            email: 'rl@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['KH'] },
        { id: 'tc_semi', code: 'SEMI', name: 'Semisphere',          email: 'semi@vendor.com', password: 'vendor123', paymentTerms: 'FOB', coos: [] },
        { id: 'tc_shk',  code: 'SHK',  name: 'SHK',                 email: 'shk@vendor.com',  password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
        { id: 'tc_sw',   code: 'SW',   name: 'Shinwon',             email: 'sw@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH','VN'] },
        { id: 'tc_tb',   code: 'TB',   name: 'Twobees',             email: 'tb@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ID','KH'] },
        { id: 'tc_tf',   code: 'TF',   name: 'TopForm',             email: 'tf@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['TH'] },
        { id: 'tc_tl',   code: 'TL',   name: 'Talent',              email: 'tl@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['CN','KH'] },
        { id: 'tc_tx',   code: 'TX',   name: 'Texray',              email: 'tx@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['ES'] },
        { id: 'tc_ty',   code: 'TY',   name: 'Taieasy',             email: 'ty@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['KH'] },
        { id: 'tc_uni',  code: 'UNI',  name: 'Universal',           email: 'uni@vendor.com',  password: 'vendor123', paymentTerms: 'FOB', coos: ['TH'] },
        { id: 'tc_wb',   code: 'WB',   name: 'Willbes',             email: 'wb@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['HT','ID'] },
        { id: 'tc_wbg',  code: 'WBG',  name: 'WorldBest',           email: 'wbg@vendor.com',  password: 'vendor123', paymentTerms: 'FOB', coos: [] },
        { id: 'tc_wd',   code: 'WD',   name: 'Windeson',            email: 'wd@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['CN','KH','LS'] },
        { id: 'tc_yt',   code: 'YT',   name: 'Yuenthai',            email: 'yt@vendor.com',   password: 'vendor123', paymentTerms: 'FOB', coos: ['KH','TH'] },
    ];

    // Departments — define access rules for internal user groups
    const SEED_DEPARTMENTS = [
        { id: 'dept-management',  name: 'Management',             canViewFOB: true,  canViewSellPrice: true,  canEdit: false, canEditTechPack: true,  canEditSellStatus: true,  brandFilter: [], tierFilter: [], description: 'Full view of everything in the system' },
        { id: 'dept-production',  name: 'Production',             canViewFOB: true,  canViewSellPrice: true,  canEdit: true,  canEditTechPack: true,  canEditSellStatus: true,  brandFilter: [], tierFilter: [], description: 'Full view and edit access with optional brand/tier filter' },
        { id: 'dept-sales-price', name: 'Sales Management',       canViewFOB: true,  canViewSellPrice: true,  canEdit: false, canEditTechPack: false, canEditSellStatus: true,  brandFilter: [], tierFilter: [], description: 'Full pricing visibility (FOB/LDP) + Sell Status edit access' },
        { id: 'dept-sales-noprc', name: 'Sales',                   canViewFOB: false, canViewSellPrice: true,  canEdit: false, canEditTechPack: false, canEditSellStatus: true,  brandFilter: [], tierFilter: [], description: 'Can see sell-in pricing but NOT vendor FOB/LDP' },
        { id: 'dept-design',      name: 'Design / Tech Design',   canViewFOB: false, canViewSellPrice: false, canEdit: false, canEditTechPack: true,  canEditSellStatus: false, brandFilter: [], tierFilter: [], description: 'No pricing visibility of any kind' },
    ];

    // ── Init with schema migration ─────────────────────────────
    function init() {
        const ver = localStorage.getItem('vcp_schema_ver');
        if (ver !== '3' && ver !== '4' && ver !== '5' && ver !== '6' && ver !== '7' && ver !== '8' && ver !== '9' && ver !== '10' && ver !== '11' && ver !== '12' && ver !== '13' && ver !== '14') {
            localStorage.removeItem(KEYS.assignments);
            localStorage.removeItem(KEYS.submissions);
            localStorage.removeItem('vcp_vendors');
            localStorage.removeItem(KEYS.tradingCompanies);
        }
        if (ver !== '5' && ver !== '6' && ver !== '7' && ver !== '8' && ver !== '9' && ver !== '10' && ver !== '11' && ver !== '12' && ver !== '13' && ver !== '14') {
            localStorage.removeItem(KEYS.cooRates);
        }
        // v10: replace all TCs with the full real company list
        if (ver !== '10' && ver !== '11' && ver !== '12' && ver !== '13' && ver !== '14') {
            localStorage.removeItem(KEYS.tradingCompanies);
        }

        // ── Seed defaults (safe — only runs if key is absent) ──────
        if (!localStorage.getItem(KEYS.users)) set(KEYS.users, SEED_USERS);
        if (!localStorage.getItem(KEYS.cooRates)) set(KEYS.cooRates, SEED_COO_RATES);
        if (!localStorage.getItem(KEYS.internalPrograms)) set(KEYS.internalPrograms, SEED_INTERNAL_PROGRAMS);
        if (!localStorage.getItem(KEYS.brandTierMargins)) set(KEYS.brandTierMargins, SEED_BRAND_TIER_MARGINS);
        if (!localStorage.getItem(KEYS.tradingCompanies)) set(KEYS.tradingCompanies, SEED_TRADING_COMPANIES);
        if (!localStorage.getItem(KEYS.programs)) set(KEYS.programs, []);
        if (!localStorage.getItem(KEYS.styles)) set(KEYS.styles, []);
        if (!localStorage.getItem(KEYS.assignments)) set(KEYS.assignments, []);
        if (!localStorage.getItem(KEYS.submissions)) set(KEYS.submissions, []);
        if (!localStorage.getItem(KEYS.placements)) set(KEYS.placements, []);
        if (!localStorage.getItem(KEYS.pendingChanges)) set(KEYS.pendingChanges, []);
        if (!localStorage.getItem(KEYS.cellFlags))  set(KEYS.cellFlags, []);
        if (!localStorage.getItem(KEYS.revisions))  set(KEYS.revisions, []);
        if (!localStorage.getItem(KEYS.customers))  set(KEYS.customers, SEED_CUSTOMERS);
        if (!localStorage.getItem(KEYS.customerBuys)) set(KEYS.customerBuys, []);
        if (!localStorage.getItem(KEYS.customerAssignments)) set(KEYS.customerAssignments, []);
        // v11: pre-costing workflow
        if (!localStorage.getItem(KEYS.designHandoffs)) set(KEYS.designHandoffs, []);
        if (!localStorage.getItem(KEYS.fabricLibrary))  set(KEYS.fabricLibrary, []);
        if (!localStorage.getItem(KEYS.salesRequests))  set(KEYS.salesRequests, []);
        if (!localStorage.getItem(KEYS.designChanges))  set(KEYS.designChanges, []);
        if (!localStorage.getItem(KEYS.departments))    set(KEYS.departments, SEED_DEPARTMENTS);
        if (!localStorage.getItem(KEYS.styleLinks))      set(KEYS.styleLinks, []);
        if (!localStorage.getItem(KEYS.recostReqs))      set(KEYS.recostReqs, []);
        if (!localStorage.getItem(KEYS.costHistory))      set(KEYS.costHistory, []);

        // ── Always ensure required users exist + correct passwords (repair broken sessions) ──
        {
            const users = get(KEYS.users);
            let dirty = false;
            SEED_USERS.forEach(seed => {
                const idx = users.findIndex(u => u.email === seed.email);
                if (idx < 0) {
                    users.push(seed);
                    dirty = true;
                } else if (users[idx].password !== seed.password || users[idx].role !== seed.role) {
                    // Always keep seed password + role in sync so login page credentials always work
                    users[idx] = { ...users[idx], password: seed.password, role: seed.role };
                    dirty = true;
                }
            });
            if (dirty) set(KEYS.users, users);
        }

        // ── Always ensure seed TC accounts exist + correct passwords (repair broken sessions) ──
        {
            const tcs = get(KEYS.tradingCompanies);
            let dirty = false;
            SEED_TRADING_COMPANIES.forEach(seed => {
                const idx = tcs.findIndex(t => t.email === seed.email);
                if (idx < 0) {
                    tcs.push(seed);
                    dirty = true;
                } else if (tcs[idx].password !== seed.password) {
                    // Always keep seed password in sync
                    tcs[idx] = { ...tcs[idx], password: seed.password };
                    dirty = true;
                }
            });
            if (dirty) set(KEYS.tradingCompanies, tcs);
        }

        // ── Patch Sales department names if using old labels ────────────
        {
            const NAME_MAP = {
                'Sales (with pricing)': 'Sales Management',
                'Sales (no pricing)':   'Sales',
            };
            const depts = get(KEYS.departments);
            let dirty = false;
            depts.forEach(d => {
                if (NAME_MAP[d.name]) { d.name = NAME_MAP[d.name]; dirty = true; }
            });
            if (dirty) set(KEYS.departments, depts);
        }

        // v14: Force FOB off for sales departments + fix description + add canEditTechPack/canEditSellStatus ──
        {
            const DEPT_PATCH = {
                'dept-management':  { canViewFOB: true,  canEditTechPack: true,  canEditSellStatus: true  },
                'dept-production':  { canViewFOB: true,  canEditTechPack: true,  canEditSellStatus: true  },
                'dept-sales-price': { canViewFOB: true,  canEditTechPack: false, canEditSellStatus: true,  description: 'Full pricing visibility (FOB/LDP) + Sell Status edit access' },
                'dept-sales-noprc': { canViewFOB: false, canEditTechPack: false, canEditSellStatus: true,  description: 'Can see sell-in pricing but NOT vendor FOB/LDP' },
                'dept-design':      { canViewFOB: false, canEditTechPack: true,  canEditSellStatus: false },
            };
            const depts = get(KEYS.departments);
            let dirty = false;
            depts.forEach(d => {
                const patch = DEPT_PATCH[d.id];
                if (!patch) return;
                Object.entries(patch).forEach(([k, v]) => {
                    if (d[k] !== v) { d[k] = v; dirty = true; }
                });
            });
            if (dirty) set(KEYS.departments, depts);
        }

        // ── Stamp schema version ────────────────────────────────────
        localStorage.setItem('vcp_schema_ver', '14');
    }




    // ── Auth ───────────────────────────────────────────────────
    const Auth = {
        login(email, password) {
            // Check admin users first
            const admins = get(KEYS.users);
            const admin = admins.find(u => u.email === email && u.password === password);
            if (admin) { set(KEYS.session, admin); return admin; }
            // Check trading companies
            const tcs = get(KEYS.tradingCompanies);
            const tc = tcs.find(t => t.email === email && t.password === password);
            if (tc) {
                const user = { id: tc.id, name: tc.name, email: tc.email, role: 'vendor', tcId: tc.id };
                set(KEYS.session, user); return user;
            }
            return null;
        },
        logout() { localStorage.removeItem(KEYS.session); },
        current() { return getObj(KEYS.session); },
    };

    // ── Programs ───────────────────────────────────────────────
    const Programs = {
        all() { return get(KEYS.programs); },
        get(id) { return get(KEYS.programs).find(p => p.id === id); },
        create(data) { const list = get(KEYS.programs); const p = { id: uid(), createdAt: now(), ...data }; list.push(p); set(KEYS.programs, list); return p; },
        update(id, d) { const list = get(KEYS.programs).map(p => p.id === id ? { ...p, ...d } : p); set(KEYS.programs, list); },
        delete(id) {
            set(KEYS.programs, get(KEYS.programs).filter(p => p.id !== id));
            set(KEYS.styles, get(KEYS.styles).filter(s => s.programId !== id));
            set(KEYS.assignments, get(KEYS.assignments).filter(a => a.programId !== id));
            // Cascade: remove style link groups for this program
            set(KEYS.styleLinks, get(KEYS.styleLinks).filter(l => l.programId !== id));
            // Cascade: remove re-cost requests for this program
            set(KEYS.recostReqs, get(KEYS.recostReqs).filter(r => r.programId !== id));
            set(KEYS.costHistory, get(KEYS.costHistory).filter(h => h.programId !== id));
        },
        styleCount(id) { return get(KEYS.styles).filter(s => s.programId === id).length; },
        tcCount(id) { return get(KEYS.assignments).filter(a => a.programId === id).length; },
        quotedCount(id) {
            const styles = get(KEYS.styles).filter(s => s.programId === id).map(s => s.id);
            const subs = get(KEYS.submissions);
            return styles.filter(sid => subs.some(s => s.styleId === sid)).length;
        },
        vendorCount(id) { return this.tcCount(id); },
        placeAll(programId) {
            // Place all non-cancelled styles and mark program as Placed
            set(KEYS.styles, get(KEYS.styles).map(s =>
                s.programId === programId && s.status !== 'cancelled' ? { ...s, status: 'placed' } : s
            ));
            this.update(programId, { status: 'Placed' });
        },
    };

    // ── Internal Programs ──────────────────────────────────────
    const InternalPrograms = {
        all() { return get(KEYS.internalPrograms); },
        get(id) { return get(KEYS.internalPrograms).find(p => p.id === id); },
        upsert(data) { const list = get(KEYS.internalPrograms); const idx = list.findIndex(p => p.id === data.id); if (idx >= 0) list[idx] = { ...list[idx], ...data }; else list.push({ id: uid(), ...data }); set(KEYS.internalPrograms, list); },
        delete(id) { set(KEYS.internalPrograms, get(KEYS.internalPrograms).filter(p => p.id !== id)); },
    };

    // ── Brand-Tier Margins ──────────────────────────────────────
    // Reference table: Brand + Tier → Target Margin %
    const BrandTierMargins = {
        all()   { return get(KEYS.brandTierMargins); },
        get(id) { return get(KEYS.brandTierMargins).find(m => m.id === id); },
        lookup(brand, tier) {
            const m = get(KEYS.brandTierMargins).find(m => m.brand === brand && m.tier === tier);
            return m ? m.targetMargin : null;
        },
        upsert(data) {
            const list = get(KEYS.brandTierMargins);
            // Unique by brand+tier
            const idx = data.id
                ? list.findIndex(m => m.id === data.id)
                : list.findIndex(m => m.brand === data.brand && m.tier === data.tier);
            if (idx >= 0) list[idx] = { ...list[idx], ...data };
            else list.push({ id: uid(), ...data });
            set(KEYS.brandTierMargins, list);
        },
        delete(id) { set(KEYS.brandTierMargins, get(KEYS.brandTierMargins).filter(m => m.id !== id)); },
    };

    // ── Styles ─────────────────────────────────────────────────
    const Styles = {
        all() { return get(KEYS.styles); },
        get(id) { return get(KEYS.styles).find(s => s.id === id); },
        byProgram(pid) { return get(KEYS.styles).filter(s => s.programId === pid); },
        create(data) { const list = get(KEYS.styles); const s = { id: uid(), createdAt: now(), status: 'open', ...data }; list.push(s); set(KEYS.styles, list); return s; },
        update(id, data) { set(KEYS.styles, get(KEYS.styles).map(s => s.id === id ? { ...s, ...data } : s)); },
        delete(id) { set(KEYS.styles, get(KEYS.styles).filter(s => s.id !== id)); set(KEYS.submissions, get(KEYS.submissions).filter(s => s.styleId !== id)); },
        bulkCreate(pid, rows) { const list = get(KEYS.styles); rows.forEach(r => list.push({ id: uid(), createdAt: now(), status: 'open', programId: pid, ...r })); set(KEYS.styles, list); },
    };

    // ── Trading Companies ──────────────────────────────────────
    const TradingCompanies = {
        all() { return get(KEYS.tradingCompanies); },
        get(id) { return get(KEYS.tradingCompanies).find(t => t.id === id); },
        create(data) { const list = get(KEYS.tradingCompanies); const t = { id: uid(), coos: [], ...data }; list.push(t); set(KEYS.tradingCompanies, list); return t; },
        update(id, d) { set(KEYS.tradingCompanies, get(KEYS.tradingCompanies).map(t => t.id === id ? { ...t, ...d } : t)); },
        delete(id) { set(KEYS.tradingCompanies, get(KEYS.tradingCompanies).filter(t => t.id !== id)); },
        // Return all (tc, coo) pairs for assignment display
        tcCooList() {
            return this.all().flatMap(tc => tc.coos.map(coo => ({ tc, coo })));
        },
    };

    // ── Assignments (program ↔ trading company) ────────────────
    const Assignments = {
        all() { return get(KEYS.assignments); },
        byProgram(pid) {
            const asgns = get(KEYS.assignments).filter(a => a.programId === pid);
            return asgns.map(a => ({ ...a, tc: TradingCompanies.get(a.tcId) })).filter(a => a.tc);
        },
        assign(programId, tcIds) {
            const rest = get(KEYS.assignments).filter(a => a.programId !== programId);
            const next = tcIds.map(tcId => ({ id: uid(), programId, tcId }));
            set(KEYS.assignments, [...rest, ...next]);
        },
        // Returns all styles visible to this TC (all programs they're assigned to)
        stylesByTc(tcId) {
            const programIds = get(KEYS.assignments).filter(a => a.tcId === tcId).map(a => a.programId);
            return get(KEYS.styles).filter(s => programIds.includes(s.programId));
        },
    };

    // ── Submissions (tcId + styleId + coo unique key) ──────────
    const Submissions = {
        all() { return get(KEYS.submissions); },
        get(id) { return get(KEYS.submissions).find(s => s.id === id); },
        byStyle(styleId) { return get(KEYS.submissions).filter(s => s.styleId === styleId); },
        byTcAndStyle(tcId, styleId) { return get(KEYS.submissions).filter(s => s.tcId === tcId && s.styleId === styleId); },
        // Upsert by (tcId, styleId, coo) — unique combination; records revision when FOB/factoryCost changes
        upsert(data, submitterName) {
            const list = get(KEYS.submissions);
            const idx = list.findIndex(s => s.tcId === data.tcId && s.styleId === data.styleId && s.coo === data.coo);
            const revList = get(KEYS.revisions);
            if (idx >= 0) {
                const existing = list[idx];
                // Record revision for FOB if changed
                if (data.fob !== undefined && String(data.fob) !== String(existing.fob)) {
                    revList.push({ id: uid(), subId: existing.id, field: 'fob',
                        oldValue: existing.fob, newValue: data.fob,
                        submittedBy: data.tcId, submittedByName: submitterName || data.tcId,
                        submittedAt: now() });
                }
                // Record revision for factoryCost if changed
                if (data.factoryCost !== undefined && String(data.factoryCost) !== String(existing.factoryCost)) {
                    revList.push({ id: uid(), subId: existing.id, field: 'factoryCost',
                        oldValue: existing.factoryCost, newValue: data.factoryCost,
                        submittedBy: data.tcId, submittedByName: submitterName || data.tcId,
                        submittedAt: now() });
                }
                set(KEYS.revisions, revList);
                list[idx] = { ...list[idx], ...data, updatedAt: now() };
            } else {
                const newSub = { id: uid(), status: 'submitted', createdAt: now(), ...data };
                // Record initial revision
                if (data.fob)         revList.push({ id: uid(), subId: newSub.id, field: 'fob',         oldValue: null, newValue: data.fob,         submittedBy: data.tcId, submittedByName: submitterName || data.tcId, submittedAt: now() });
                if (data.factoryCost) revList.push({ id: uid(), subId: newSub.id, field: 'factoryCost', oldValue: null, newValue: data.factoryCost, submittedBy: data.tcId, submittedByName: submitterName || data.tcId, submittedAt: now() });
                set(KEYS.revisions, revList);
                list.push(newSub);
            }
            set(KEYS.submissions, list);
            // Return the saved sub
            const saved = get(KEYS.submissions).find(s => s.tcId === data.tcId && s.styleId === data.styleId && s.coo === data.coo);
            return saved;
        },
        flag(id, reason) { set(KEYS.submissions, get(KEYS.submissions).map(s => s.id === id ? { ...s, status: 'flagged', flagReason: reason } : s)); },
        unflag(id) { set(KEYS.submissions, get(KEYS.submissions).map(s => s.id === id ? { ...s, status: 'submitted', flagReason: '' } : s)); },
        accept(id) { set(KEYS.submissions, get(KEYS.submissions).map(s => s.id === id ? { ...s, status: 'accepted' } : s)); },
    };

    // ── Placements ─────────────────────────────────────────────
    const Placements = {
        get(styleId) { return get(KEYS.placements).find(p => p.styleId === styleId); },
        place(data) { const list = get(KEYS.placements).filter(p => p.styleId !== data.styleId); list.push({ id: uid(), ...data }); set(KEYS.placements, list); },
        unplace(sid) { set(KEYS.placements, get(KEYS.placements).filter(p => p.styleId !== sid)); },
    };

    // ── Pending Changes (PC → Admin approval queue) ────────────
    const PendingChanges = {
        all()     { return get(KEYS.pendingChanges); },
        pending() { return get(KEYS.pendingChanges).filter(c => c.status === 'pending'); },
        get(id)   { return get(KEYS.pendingChanges).find(c => c.id === id); },
        propose(data) {
            const list = get(KEYS.pendingChanges);
            const entry = { id: uid(), status: 'pending', proposedAt: now(), ...data };
            list.push(entry);
            set(KEYS.pendingChanges, list);
            return entry;
        },
        approve(id, reviewerId) {
            const list = get(KEYS.pendingChanges);
            const idx = list.findIndex(c => c.id === id);
            if (idx < 0) return;
            const c = list[idx];
            list[idx] = { ...c, status: 'approved', reviewedBy: reviewerId, reviewedAt: now() };
            set(KEYS.pendingChanges, list);
            // Apply the change to the real table
            const d = c.data;
            if (c.type === 'tc') {
                if (c.action === 'create') { const tcs = get(KEYS.tradingCompanies); tcs.push({ id: uid(), coos: [], ...d }); set(KEYS.tradingCompanies, tcs); }
                else if (c.action === 'update') { set(KEYS.tradingCompanies, get(KEYS.tradingCompanies).map(t => t.id === d.id ? { ...t, ...d } : t)); }
                else if (c.action === 'delete') { set(KEYS.tradingCompanies, get(KEYS.tradingCompanies).filter(t => t.id !== d.id)); }
            } else if (c.type === 'coo') {
                if (c.action === 'create' || c.action === 'update') { const rates = get(KEYS.cooRates); const i = rates.findIndex(r => r.code === d.code); if (i >= 0) rates[i] = { ...rates[i], ...d }; else rates.push(d); set(KEYS.cooRates, rates); }
                else if (c.action === 'delete') { set(KEYS.cooRates, get(KEYS.cooRates).filter(r => r.code !== d.code)); }
            } else if (c.type === 'internal-program') {
                if (c.action === 'create' || c.action === 'update') { const ips = get(KEYS.internalPrograms); const i = ips.findIndex(p => p.id === d.id); if (i >= 0) ips[i] = { ...ips[i], ...d }; else ips.push({ id: uid(), ...d }); set(KEYS.internalPrograms, ips); }
                else if (c.action === 'delete') { set(KEYS.internalPrograms, get(KEYS.internalPrograms).filter(p => p.id !== d.id)); }
            } else if (c.type === 'pc-user') {
                if (c.action === 'create') { const users = get(KEYS.users); users.push({ id: uid(), role: 'pc', ...d }); set(KEYS.users, users); }
                else if (c.action === 'update') { set(KEYS.users, get(KEYS.users).map(u => u.id === d.id ? { ...u, ...d } : u)); }
                else if (c.action === 'delete') { set(KEYS.users, get(KEYS.users).filter(u => u.id !== d.id)); }
            }
        },
        reject(id, reviewerId) {
            set(KEYS.pendingChanges, get(KEYS.pendingChanges).map(c =>
                c.id === id ? { ...c, status: 'rejected', reviewedBy: reviewerId, reviewedAt: now() } : c
            ));
        },
    };

    // ── COO Rates ──────────────────────────────────────────────
    const CooRates = {
        all() { return get(KEYS.cooRates); },
        get(code) { return get(KEYS.cooRates).find(r => r.code === code || r.id === code); },
        upsert(data) { const list = get(KEYS.cooRates); const idx = list.findIndex(r => r.code === data.code); if (idx >= 0) list[idx] = { ...list[idx], ...data }; else list.push(data); set(KEYS.cooRates, list); },
        delete(code) { set(KEYS.cooRates, get(KEYS.cooRates).filter(r => r.code !== code && r.id !== code)); },
    };

    // ── LDP Calculator (per unit) ──────────────────────────────
    // Duty Amount varies by payment terms:
    //   FCA        → $0 duty, $0 freight
    //   CIF        → Addl Duty × FOB, $0 freight (seller pays freight)
    //   DUTY FREE / CPTPP → Addl Duty × FOB, normal freight
    //   FIRST SALE → (Addl Duty + Base Duty) × FactoryCost, normal freight
    //   FOB (default) → (Addl Duty + Base Duty) × FOB, normal freight
    //
    // Freight from COO table = total container cost ÷ projQty.
    // Market routing: USA → usaNY rate; Canada → caToronto rate.
    function calcLDP(fob, styleData, cooCode, market = 'USA', port = 'NY', paymentTerms = 'FOB', factoryCost = null) {
        if (!fob || isNaN(fob)) return null;
        const rate = CooRates.get(cooCode);
        if (!rate) return null;

        const baseDutyRate = styleData?.dutyRate || 0;
        const addlDuty = rate.addlDuty || 0;
        const terms = (paymentTerms || 'FOB').toUpperCase().trim();

        let duty = 0;
        let effectiveDutyRate = 0;
        let noFreight = false;   // true when terms mean $0 freight

        if (terms === 'FCA') {
            duty = 0;
            effectiveDutyRate = 0;
            noFreight = true;    // FCA: buyer arranges freight, $0 in LDP
        } else if (terms === 'CIF') {
            // CIF: seller includes freight — we don't add it separately
            effectiveDutyRate = addlDuty;
            duty = fob * addlDuty;
            noFreight = true;
        } else if (terms === 'DUTY FREE' || terms === 'CPTPP') {
            // Only additional (COO) duty applied, on FOB; normal freight
            effectiveDutyRate = addlDuty;
            duty = fob * addlDuty;
        } else if (terms === 'FIRST SALE') {
            // Full combined rate applied to factory cost; normal freight
            effectiveDutyRate = addlDuty + baseDutyRate;
            const base = (factoryCost != null && !isNaN(factoryCost)) ? parseFloat(factoryCost) : fob;
            duty = base * effectiveDutyRate;
        } else {
            // FOB (default): full combined rate on FOB; normal freight
            effectiveDutyRate = addlDuty + baseDutyRate;
            duty = fob * effectiveDutyRate;
        }

        // Freight formula (matches PreCostingTemplate Internal sheet):
        //   Proj TTL Freight = ROUND(estFreight × (1 + COO_multiplier), 0.01)
        //   FCA / CIF → $0 freight
        //   If estFreight not set → freight = null (N/A)
        const estFr = (styleData?.estFreight != null && !isNaN(styleData.estFreight))
            ? parseFloat(styleData.estFreight) : null;
        const cooMult = market === 'USA' ? (rate.usaMult || 0) : (rate.canadaMult || 0);
        let freightPerUnit;
        if (noFreight) {
            freightPerUnit = 0;
        } else if (estFr != null) {
            freightPerUnit = Math.round(estFr * (1 + cooMult) * 100) / 100;
        } else {
            freightPerUnit = null;  // estFreight not entered — show N/A
        }
        const specialPkg = styleData?.specialPackaging || 0;
        const ldp = fob + duty + (freightPerUnit || 0) + specialPkg;
        return {
            ldp: Math.round(ldp * 100) / 100,
            duty: Math.round(duty * 100) / 100,
            dutyRate: effectiveDutyRate,
            freight: freightPerUnit,
            noQty: false,
            noFreight,
            terms,
        };
    }

    function computeTargetLDP(style, program) {
        if (program?.targetMargin && style?.projSellPrice) {
            return Math.round(style.projSellPrice * program.targetMargin * 100) / 100;
        }
        return null;
    }

    // ── CSV Helpers ────────────────────────────────────────────
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
        });
    }

    function csvRowToStyle(row) {
        const n = k => { const x = parseFloat(row[k]); return isNaN(x) ? null : x; };
        return {
            styleNumber: row['Style #']?.trim() || row['Style Number']?.trim() || '',
            styleName: row['Style Name']?.trim() || '',
            category: row['Category']?.trim() || '',
            fabrication: row['Main Fabrication']?.trim() || row['Fabrication']?.trim() || '',
            projQty: n('Proj Qty'),
            projSellPrice: n('Proj Sell Price'),
            dutyRate: n('Duty Rate'),
            estFreight: n('Est Base Freight'),
            specialPackaging: n('Special Packaging'),
        };
    }

    // ── Departments ─────────────────────────────────────────────────────────
    const Departments = {
        all()    { return get(KEYS.departments); },
        get(id)  { return get(KEYS.departments).find(d => d.id === id); },
        create(data) {
            const list = get(KEYS.departments);
            list.push({ id: 'dept-' + uid(), ...data });
            set(KEYS.departments, list);
        },
        update(id, data) {
            set(KEYS.departments, get(KEYS.departments).map(d => d.id === id ? { ...d, ...data } : d));
        },
        delete(id) {
            set(KEYS.departments, get(KEYS.departments).filter(d => d.id !== id));
            // Clear departmentId from users that had this dept
            set(KEYS.users, get(KEYS.users).map(u => u.departmentId === id ? { ...u, departmentId: null } : u));
        },
        memberCount(id) { return get(KEYS.users).filter(u => u.departmentId === id).length; },
    };

    // ── Style Links ──────────────────────────────────────────────────────────
    // Placement preference groups: styles that should be placed together.
    // One group per style (a style belongs to at most one link group per program).
    const LINK_COLORS = [
        '#6366f1','#f59e0b','#10b981','#ef4444',
        '#a855f7','#3b82f6','#ec4899','#14b8a6',
    ];
    const StyleLinks = {
        all()            { return get(KEYS.styleLinks); },
        byProgram(pid)   { return get(KEYS.styleLinks).filter(l => l.programId === pid); },
        get(id)          { return get(KEYS.styleLinks).find(l => l.id === id); },
        // Returns the link group a given style belongs to (null if none)
        byStyle(styleId) { return get(KEYS.styleLinks).find(l => Array.isArray(l.styleIds) && l.styleIds.includes(styleId)) || null; },
        // Check which styles in an array are already linked
        linkedStyleIds(programId) {
            return get(KEYS.styleLinks)
                .filter(l => l.programId === programId)
                .flatMap(l => l.styleIds);
        },
        create(data) {
            const list = get(KEYS.styleLinks);
            // Auto-assign color: count existing groups in this program and cycle palette
            const progGroups = list.filter(l => l.programId === data.programId);
            const color = LINK_COLORS[progGroups.length % LINK_COLORS.length];
            const entry = { id: 'sl_' + uid(), createdAt: now(), color, ...data };
            list.push(entry);
            set(KEYS.styleLinks, list);
            return entry;
        },
        update(id, data) {
            set(KEYS.styleLinks, get(KEYS.styleLinks).map(l => l.id === id ? { ...l, ...data } : l));
        },
        delete(id) {
            set(KEYS.styleLinks, get(KEYS.styleLinks).filter(l => l.id !== id));
        },
        deleteByProgram(programId) {
            set(KEYS.styleLinks, get(KEYS.styleLinks).filter(l => l.programId !== programId));
        },
    // ── close Departments and open StyleLinks done — close StyleLinks below
    // dummy close (Departments' closing brace was consumed above, add it back):
    };

    // ── PCUsers convenience (reads from vcp_users filtered by role) ───
    const PCUsers = {
        all()         { return get(KEYS.users).filter(u => u.role === 'pc'); },
        allStaff()    { return get(KEYS.users).filter(u => u.role === 'admin' || u.role === 'pc'); },
        allInternal() { return get(KEYS.users).filter(u => ['admin','pc','planning','design'].includes(u.role)); },
        create(data)  { const list = get(KEYS.users); list.push({ id: uid(), role: 'pc', ...data }); set(KEYS.users, list); },
        update(id, d) { set(KEYS.users, get(KEYS.users).map(u => u.id === id ? { ...u, ...d } : u)); },
        delete(id)    { set(KEYS.users, get(KEYS.users).filter(u => u.id !== id)); },
    };

    // ── Re-cost Requests ──────────────────────────────────────────────────────────
    // Design/Sales can request re-costing of a style with a note.
    // Production must review and release before vendors are re-notified.
    const RecostRequests = {
        all()             { return get(KEYS.recostReqs); },
        byProgram(pid)    { return get(KEYS.recostReqs).filter(r => r.programId === pid); },
        byStyle(sid)      { return get(KEYS.recostReqs).filter(r => r.styleId === sid); },
        // Active (non-dismissed) request for a style — any open stage
        active(sid)       { return get(KEYS.recostReqs).find(r => r.styleId === sid && !['dismissed','rejected','released'].includes(r.status)); },
        // All open requests (any non-terminal status)
        pending()         { return get(KEYS.recostReqs).filter(r => !['dismissed','rejected','released'].includes(r.status)); },
        // Stage-specific filters
        pendingSales()    { return get(KEYS.recostReqs).filter(r => r.status === 'pending_sales' || r.status === 'pending'); },
        pendingProduction(){ return get(KEYS.recostReqs).filter(r => r.status === 'pending_production'); },
        get(id)           { return get(KEYS.recostReqs).find(r => r.id === id); },
        create(data) {
            const list = get(KEYS.recostReqs);
            const entry = { id: 'rcr_' + uid(), createdAt: now(), status: 'pending', ...data };
            list.push(entry);
            set(KEYS.recostReqs, list);
            return entry;
        },
        // Production releases style for re-costing
        release(id, releasedBy, releasedByName) {
            set(KEYS.recostReqs, get(KEYS.recostReqs).map(r =>
                r.id === id ? { ...r, status: 'released', releasedBy, releasedByName, releasedAt: now() } : r
            ));
            // Mark all existing submissions for this style as 'outdated'
            const req = get(KEYS.recostReqs).find(r => r.id === id);
            if (req?.styleId) {
                set(KEYS.submissions, get(KEYS.submissions).map(s =>
                    s.styleId === req.styleId ? { ...s, isOutdated: true } : s
                ));
                // Write a cost history entry so all roles can see the re-cost event
                const histList = get(KEYS.costHistory);
                histList.push({
                    id: uid(),
                    styleId:         req.styleId,
                    programId:       req.programId,
                    type:            'recosted',
                    category:        req.category || 'Other',
                    note:            req.note || '',
                    requestedBy:     req.requestedBy,
                    requestedByName: req.requestedByName,
                    releasedBy,
                    releasedByName,
                    timestamp:       now(),
                });
                set(KEYS.costHistory, histList);
            }
        },
        reject(id, rejectionNote, rejectedStage) {
            set(KEYS.recostReqs, get(KEYS.recostReqs).map(r =>
                r.id === id ? { ...r, status: 'rejected', rejectionNote, rejectedStage: rejectedStage || 'production', rejectedAt: now() } : r
            ));
        },
        // Sales approves — advances to Production review
        salesApprove(id, approvedBy, approvedByName) {
            set(KEYS.recostReqs, get(KEYS.recostReqs).map(r =>
                r.id === id ? { ...r, status: 'pending_production', salesApprovedBy: approvedBy, salesApprovedByName: approvedByName, salesApprovedAt: now() } : r
            ));
        },
        dismiss(id) {
            set(KEYS.recostReqs, get(KEYS.recostReqs).map(r =>
                r.id === id ? { ...r, status: 'dismissed' } : r
            ));
        },
        deleteByProgram(programId) {
            set(KEYS.recostReqs, get(KEYS.recostReqs).filter(r => r.programId !== programId));
        },
    };

    // ── Cost History ──────────────────────────────────────────
    // Records significant costing events per style (re-costs, placements, notes)
    const CostHistory = {
        all()              { return get(KEYS.costHistory); },
        byStyle(sid)       { return get(KEYS.costHistory).filter(h => h.styleId === sid); },
        byProgram(pid)     { return get(KEYS.costHistory).filter(h => h.programId === pid); },
        create(data) {
            const list = get(KEYS.costHistory);
            const entry = { id: uid(), timestamp: now(), ...data };
            list.push(entry);
            set(KEYS.costHistory, list);
            return entry;
        },
        deleteByProgram(programId) {
            set(KEYS.costHistory, get(KEYS.costHistory).filter(h => h.programId !== programId));
        },
    };

    // ── Design Handoffs ────────────────────────────────────────
    // Two separate lists: stylesList + fabricsList (uncorrelated)
    const DesignHandoffs = {
        all()   { return get(KEYS.designHandoffs); },
        get(id) { return get(KEYS.designHandoffs).find(h => h.id === id); },
        create(data) {
            const list = get(KEYS.designHandoffs);
            const h = {
                id: uid(), createdAt: now(),
                stylesUploaded:  Array.isArray(data.stylesList)  && data.stylesList.length  > 0,
                fabricsUploaded: Array.isArray(data.fabricsList) && data.fabricsList.length > 0,
                ...data,
            };
            list.push(h);
            set(KEYS.designHandoffs, list);
            // Upsert fabrics into FabricLibrary
            if (Array.isArray(data.fabricsList) && data.fabricsList.length) {
                const lib = get(KEYS.fabricLibrary);
                data.fabricsList.forEach(f => {
                    const idx = lib.findIndex(x => x.fabricCode === f.fabricCode);
                    const entry = { ...f, source: 'design-handoff', handoffId: h.id, updatedAt: now() };
                    if (idx >= 0) lib[idx] = { ...lib[idx], ...entry };
                    else lib.push({ id: uid(), createdAt: now(), ...entry });
                });
                set(KEYS.fabricLibrary, lib);
            }
            return h;
        },
        // Attach a fabric list to an existing handoff (can be done after initial upload)
        addFabricList(id, fabricsList) {
            if (!Array.isArray(fabricsList) || !fabricsList.length) return;
            const list = get(KEYS.designHandoffs);
            const idx  = list.findIndex(h => h.id === id);
            if (idx < 0) return;
            list[idx] = { ...list[idx], fabricsList, fabricsUploaded: true, fabricsUploadedAt: now() };
            set(KEYS.designHandoffs, list);
            // Upsert into FabricLibrary
            const lib = get(KEYS.fabricLibrary);
            fabricsList.forEach(f => {
                const li = lib.findIndex(x => x.fabricCode === f.fabricCode);
                const entry = { ...f, source: 'design-handoff', handoffId: id, updatedAt: now() };
                if (li >= 0) lib[li] = { ...lib[li], ...entry };
                else lib.push({ id: uid(), createdAt: now(), ...entry });
            });
            set(KEYS.fabricLibrary, lib);
        },
        update(id, data) {
            set(KEYS.designHandoffs, get(KEYS.designHandoffs).map(h => h.id === id ? { ...h, ...data } : h));
        },
        delete(id) {
            set(KEYS.designHandoffs, get(KEYS.designHandoffs).filter(h => h.id !== id));
        },
    };

    // ── Fabric Library ─────────────────────────────────────────
    // Master fabric records: Code, Name, Content
    const FabricLibrary = {
        all()   { return get(KEYS.fabricLibrary); },
        get(id) { return get(KEYS.fabricLibrary).find(f => f.id === id); },
        getByCode(code) { return get(KEYS.fabricLibrary).find(f => f.fabricCode === code); },
        create(data) {
            const list = get(KEYS.fabricLibrary);
            // Dedup by fabricCode
            const idx = list.findIndex(f => f.fabricCode === data.fabricCode);
            if (idx >= 0) { list[idx] = { ...list[idx], ...data, updatedAt: now() }; set(KEYS.fabricLibrary, list); return list[idx]; }
            const f = { id: uid(), createdAt: now(), source: 'manual', ...data };
            list.push(f); set(KEYS.fabricLibrary, list); return f;
        },
        update(id, data) { set(KEYS.fabricLibrary, get(KEYS.fabricLibrary).map(f => f.id === id ? { ...f, ...data, updatedAt: now() } : f)); },
        delete(id) { set(KEYS.fabricLibrary, get(KEYS.fabricLibrary).filter(f => f.id !== id)); },
    };

    // ── Sales Requests ─────────────────────────────────────────
    // Costing request from planning/sales with styles + qty + fabric
    const SalesRequests = {
        all()   { return get(KEYS.salesRequests); },
        get(id) { return get(KEYS.salesRequests).find(r => r.id === id); },
        create(data) {
            const list = get(KEYS.salesRequests);
            const r = { id: uid(), createdAt: now(), status: 'submitted', ...data };
            list.push(r); set(KEYS.salesRequests, list); return r;
        },
        update(id, data) { set(KEYS.salesRequests, get(KEYS.salesRequests).map(r => r.id === id ? { ...r, ...data } : r)); },
        delete(id) { set(KEYS.salesRequests, get(KEYS.salesRequests).filter(r => r.id !== id)); },
        // Convert to a Program — creates Program + bulk-creates Styles
        convertToProgram(requestId, programData) {
            const req = this.get(requestId);
            if (!req) return null;
            const prog = Programs.create(programData);
            if (Array.isArray(req.styles) && req.styles.length) {
                Styles.bulkCreate(prog.id, req.styles);
            }
            this.update(requestId, { linkedProgramId: prog.id, status: 'converted' });
            return prog;
        },
    };

    // ── Design Changes ─────────────────────────────────────────
    // Append-only log of design changes per style
    const DesignChanges = {
        all()              { return get(KEYS.designChanges); },
        byStyle(styleId)   { return get(KEYS.designChanges).filter(c => c.styleId === styleId).sort((a, b) => b.changedAt.localeCompare(a.changedAt)); },
        byProgram(pid)     { return get(KEYS.designChanges).filter(c => c.programId === pid).sort((a, b) => b.changedAt.localeCompare(a.changedAt)); },
        log(data) {
            const list = get(KEYS.designChanges);
            const entry = { id: uid(), changedAt: now(), ...data };
            list.push(entry);
            set(KEYS.designChanges, list);
            return entry;
        },
        countByStyle(styleId) { return get(KEYS.designChanges).filter(c => c.styleId === styleId).length; },
        recentByStyle(styleId, days = 7) {
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            return get(KEYS.designChanges).filter(c => c.styleId === styleId && c.changedAt >= cutoff);
        },
    };

    // ── Cell Flags (admin/PC flags a cell for TC to see) ───────
    // One flag per (subId, field) — upsert replaces; clear removes.
    const CellFlags = {
        all()  { return get(KEYS.cellFlags); },
        // Get flag for a specific submission field
        get(subId, field) { return get(KEYS.cellFlags).find(f => f.subId === subId && f.field === field); },
        // Get all flags for a submission
        bySubmission(subId) { return get(KEYS.cellFlags).filter(f => f.subId === subId); },
        // Set or update a flag
        set(subId, field, color, note, flaggedBy, flaggedByName) {
            const list = get(KEYS.cellFlags);
            const idx = list.findIndex(f => f.subId === subId && f.field === field);
            const entry = { id: idx >= 0 ? list[idx].id : uid(), subId, field, color, note, flaggedBy, flaggedByName, flaggedAt: now() };
            if (idx >= 0) list[idx] = entry; else list.push(entry);
            set(KEYS.cellFlags, list);
            return entry;
        },
        // Clear a flag
        clear(subId, field) {
            set(KEYS.cellFlags, get(KEYS.cellFlags).filter(f => !(f.subId === subId && f.field === field)));
        },
        // Clear all flags on a submission (e.g. when TC revises)
        clearAll(subId) {
            set(KEYS.cellFlags, get(KEYS.cellFlags).filter(f => f.subId !== subId));
        },
    };

    // ── Revisions (append-only quote history per subId + field) ─
    const Revisions = {
        all()               { return get(KEYS.revisions); },
        bySubmission(subId) { return get(KEYS.revisions).filter(r => r.subId === subId); },
        byField(subId, field) { return get(KEYS.revisions).filter(r => r.subId === subId && r.field === field && !r.type).sort((a, b) => a.submittedAt < b.submittedAt ? -1 : 1); },
        byFieldAll(subId, field) { return get(KEYS.revisions).filter(r => r.subId === subId && r.field === field).sort((a, b) => a.submittedAt < b.submittedAt ? -1 : 1); },
        log(entry) { const list = get(KEYS.revisions); list.push({ id: uid(), submittedAt: now(), ...entry }); set(KEYS.revisions, list); },
    };

    // ── Customers ───────────────────────────────────────────────
    const Customers = {
        all()            { return get(KEYS.customers); },
        get(id)          { return get(KEYS.customers).find(c => c.id === id); },
        create(data)     { const list = get(KEYS.customers); const c = { id: uid(), ...data }; list.push(c); set(KEYS.customers, list); return c; },
        update(id, data) { set(KEYS.customers, get(KEYS.customers).map(c => c.id === id ? { ...c, ...data } : c)); },
        delete(id)       { set(KEYS.customers, get(KEYS.customers).filter(c => c.id !== id)); },
    };

    // ── Customer Program Assignments ────────────────────────────
    // Tracks which customers are active for a given program
    const CustomerAssignments = {
        byProgram(pid)         { return get(KEYS.customerAssignments).filter(a => a.programId === pid).map(a => a.customerId); },
        assign(programId, customerIds) {
            const rest = get(KEYS.customerAssignments).filter(a => a.programId !== programId);
            const next = customerIds.map(customerId => ({ id: uid(), programId, customerId }));
            set(KEYS.customerAssignments, [...rest, ...next]);
        },
    };

    // ── Customer Buys ───────────────────────────────────────────
    // One record per (programId, styleId, customerId)
    const CustomerBuys = {
        all()                       { return get(KEYS.customerBuys); },
        byProgram(pid)              { return get(KEYS.customerBuys).filter(b => b.programId === pid); },
        byStyle(styleId)            { return get(KEYS.customerBuys).filter(b => b.styleId === styleId); },
        get(programId, styleId, customerId) {
            return get(KEYS.customerBuys).find(b => b.programId === programId && b.styleId === styleId && b.customerId === customerId);
        },
        upsert(data) {
            const list = get(KEYS.customerBuys);
            const idx  = list.findIndex(b => b.programId === data.programId && b.styleId === data.styleId && b.customerId === data.customerId);
            if (idx >= 0) list[idx] = { ...list[idx], ...data, updatedAt: now() };
            else list.push({ id: uid(), createdAt: now(), ...data });
            set(KEYS.customerBuys, list);
        },
        delete(programId, styleId, customerId) {
            set(KEYS.customerBuys, get(KEYS.customerBuys).filter(b => !(b.programId === programId && b.styleId === styleId && b.customerId === customerId)));
        },
    };

    // ── Internal Staff Users ─────────────────────────────────────────
    const Users = {
        all()    { return get(KEYS.users); },
        get(id)  { return get(KEYS.users).find(u => u.id === id); },
        update(id, data) {
            const list = get(KEYS.users);
            const idx  = list.findIndex(u => u.id === id);
            if (idx >= 0) {
                list[idx] = { ...list[idx], ...data };
                set(KEYS.users, list);
                // Also update session if this is the logged-in user
                const cur = getObj(KEYS.session);
                if (cur && cur.id === id) set(KEYS.session, { ...cur, ...data });
            }
        },
    };

    return {
        Auth, Programs, InternalPrograms, BrandTierMargins, Styles, Users,
        TradingCompanies,
        Vendors: null,
        Assignments, Submissions, Placements, CooRates,
        PendingChanges, Departments, PCUsers,
        CellFlags, Revisions,
        Customers, CustomerAssignments, CustomerBuys,
        // Pre-costing workflow (v11)
        DesignHandoffs, FabricLibrary, SalesRequests, DesignChanges,
        // Style linking (v12)
        StyleLinks,
        // Re-costing requests (v13)
        RecostRequests, CostHistory,
        calcLDP, computeTargetLDP, parseCSV, csvRowToStyle,
        init,
    };

})();
