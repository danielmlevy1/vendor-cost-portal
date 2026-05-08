cat > clear.sql << 'CLAUDE_SQL_END'
-- =================================================================
-- VENDOR COST PORTAL — Transactional Data Clear
-- Generated: 2026-05-06
--
-- PRESERVED (not touched):
--   schema_migrations, users, departments, coo_rates, customers,
--   trading_companies, tc_coos, internal_programs, brand_tier_margins,
--   factories, fabric_library, pending_changes
--
-- CLEARED (transactional test data):
--   programs, styles, assignments, assignment_coos, submissions,
--   revisions, cell_flags, placements, customer_assignments,
--   customer_buys, style_links, tech_pack_history, design_changes,
--   recost_requests, cost_history, capacity_plans, capacity_plan_lines,
--   delivery_plans, delivery_plan_lines, design_handoffs, staged_batches,
--   sales_requests, fabric_requests, fabric_packages
--
-- NOTE: PRAGMA foreign_keys = OFF in this DB — no cascade fires.
--       Delete order is children-before-parents for correctness if
--       FKs are ever turned on later.
-- =================================================================

BEGIN TRANSACTION;

-- ── Row counts BEFORE (verify data was present) ──────────────────
SELECT 'programs',            COUNT(*) FROM programs;
SELECT 'styles',              COUNT(*) FROM styles;
SELECT 'assignments',         COUNT(*) FROM assignments;
SELECT 'assignment_coos',     COUNT(*) FROM assignment_coos;
SELECT 'submissions',         COUNT(*) FROM submissions;
SELECT 'revisions',           COUNT(*) FROM revisions;
SELECT 'cell_flags',          COUNT(*) FROM cell_flags;
SELECT 'placements',          COUNT(*) FROM placements;
SELECT 'customer_assignments', COUNT(*) FROM customer_assignments;
SELECT 'customer_buys',       COUNT(*) FROM customer_buys;
SELECT 'style_links',         COUNT(*) FROM style_links;
SELECT 'tech_pack_history',   COUNT(*) FROM tech_pack_history;
SELECT 'design_changes',      COUNT(*) FROM design_changes;
SELECT 'recost_requests',     COUNT(*) FROM recost_requests;
SELECT 'cost_history',        COUNT(*) FROM cost_history;
SELECT 'capacity_plans',      COUNT(*) FROM capacity_plans;
SELECT 'capacity_plan_lines', COUNT(*) FROM capacity_plan_lines;
SELECT 'delivery_plans',      COUNT(*) FROM delivery_plans;
SELECT 'delivery_plan_lines', COUNT(*) FROM delivery_plan_lines;
SELECT 'design_handoffs',     COUNT(*) FROM design_handoffs;
SELECT 'staged_batches',      COUNT(*) FROM staged_batches;
SELECT 'sales_requests',      COUNT(*) FROM sales_requests;
SELECT 'fabric_requests',     COUNT(*) FROM fabric_requests;
SELECT 'fabric_packages',     COUNT(*) FROM fabric_packages;

-- ── Delete: children before parents ──────────────────────────────
DELETE FROM revisions;
DELETE FROM cell_flags;
DELETE FROM submissions;
DELETE FROM placements;
DELETE FROM tech_pack_history;
DELETE FROM design_changes;
DELETE FROM recost_requests;
DELETE FROM cost_history;
DELETE FROM customer_buys;
DELETE FROM customer_assignments;
DELETE FROM style_links;
DELETE FROM assignment_coos;
DELETE FROM assignments;
DELETE FROM capacity_plan_lines;
DELETE FROM capacity_plans;
DELETE FROM delivery_plan_lines;
DELETE FROM delivery_plans;
DELETE FROM fabric_requests;
DELETE FROM fabric_packages;
DELETE FROM styles;
DELETE FROM staged_batches;
DELETE FROM sales_requests;
DELETE FROM design_handoffs;
DELETE FROM programs;

-- ── Row counts AFTER (all should be 0) ───────────────────────────
SELECT 'programs',            COUNT(*) FROM programs;
SELECT 'styles',              COUNT(*) FROM styles;
SELECT 'assignments',         COUNT(*) FROM assignments;
SELECT 'assignment_coos',     COUNT(*) FROM assignment_coos;
SELECT 'submissions',         COUNT(*) FROM submissions;
SELECT 'revisions',           COUNT(*) FROM revisions;
SELECT 'cell_flags',          COUNT(*) FROM cell_flags;
SELECT 'placements',          COUNT(*) FROM placements;
SELECT 'customer_assignments', COUNT(*) FROM customer_assignments;
SELECT 'customer_buys',       COUNT(*) FROM customer_buys;
SELECT 'style_links',         COUNT(*) FROM style_links;
SELECT 'tech_pack_history',   COUNT(*) FROM tech_pack_history;
SELECT 'design_changes',      COUNT(*) FROM design_changes;
SELECT 'recost_requests',     COUNT(*) FROM recost_requests;
SELECT 'cost_history',        COUNT(*) FROM cost_history;
SELECT 'capacity_plans',      COUNT(*) FROM capacity_plans;
SELECT 'capacity_plan_lines', COUNT(*) FROM capacity_plan_lines;
SELECT 'delivery_plans',      COUNT(*) FROM delivery_plans;
SELECT 'delivery_plan_lines', COUNT(*) FROM delivery_plan_lines;
SELECT 'design_handoffs',     COUNT(*) FROM design_handoffs;
SELECT 'staged_batches',      COUNT(*) FROM staged_batches;
SELECT 'sales_requests',      COUNT(*) FROM sales_requests;
SELECT 'fabric_requests',     COUNT(*) FROM fabric_requests;
SELECT 'fabric_packages',     COUNT(*) FROM fabric_packages;

COMMIT;
CLAUDE_SQL_END
