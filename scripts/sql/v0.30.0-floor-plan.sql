-- v0.30.0 — „Plan de sală” + „Schimbă masa”.
--
-- Fully ADDITIVE: two new tables, two new columns, three indexes. Nothing existing is
-- altered or backfilled, so the currently deployed code keeps behaving exactly as before.
-- Safe to run BEFORE the deploy, and safe to leave in place if the deploy is rolled back
-- (the older code simply never reads these columns).
--
-- Run in the Neon SQL editor against the PRODUCTION branch.
-- Run PART 1, then PART 2 on its own and paste the single result row back.

-- ══ PART 1 — the migration ═══════════════════════════════════════════════════

-- Sections of the room, named by the owner („Sala 1”, „Terasă”, „Etaj”).
CREATE TABLE IF NOT EXISTS floor_sections (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label         text NOT NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS floor_sections_restaurant_idx ON floor_sections (restaurant_id);

-- The physical tables. No seat count on purpose: these record WHERE a booking sits, not
-- how many people fit (that is reservation_tables, used by „Mese individuale”).
-- section_id is ON DELETE SET NULL so deleting a section can never delete a table that
-- bookings are assigned to — those tables fall back to „Fără secțiune”.
CREATE TABLE IF NOT EXISTS floor_tables (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  section_id    text REFERENCES floor_sections(id) ON DELETE SET NULL,
  label         text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS floor_tables_restaurant_idx ON floor_tables (restaurant_id);
CREATE INDEX IF NOT EXISTS floor_tables_section_idx    ON floor_tables (section_id);

-- „Plan de sală”: JSON array of floor_tables ids staff pinned by hand. NULL = no table
-- chosen, which is an ordinary booking — assignment is optional everywhere.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS floor_table_ids text;

-- „Schimbă masa”: true when STAFF chose the table by hand rather than the engine picking
-- it. Without it an edit would silently recompute the assignment and undo their choice.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS assigned_tables_manual boolean NOT NULL DEFAULT false;


-- ══ PART 2 — verification (run separately; one row out) ══════════════════════
--
-- Expected:
--   tables_created            2
--   columns_added             2
--   indexes_created           3
--   floor_ids_nullable        YES        (an unassigned booking must stay legal)
--   manual_default            false      (every existing booking behaves as today)
--   section_fk_rule           n          (n = SET NULL: deleting a section keeps tables)
--   restaurant_fk_rule        c          (c = CASCADE: deleting a restaurant cleans up)
--   bookings_with_floor_tables 0         (nothing was backfilled)
--   manual_choices            0          (ditto)
--   reservations_total / restaurants_total — unchanged from before the migration

SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('floor_sections', 'floor_tables'))              AS tables_created,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'reservations'
       AND column_name IN ('floor_table_ids', 'assigned_tables_manual'))  AS columns_added,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN ('floor_sections_restaurant_idx',
                         'floor_tables_restaurant_idx',
                         'floor_tables_section_idx'))                     AS indexes_created,
  (SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'reservations'
       AND column_name = 'floor_table_ids')                               AS floor_ids_nullable,
  (SELECT column_default FROM information_schema.columns
     WHERE table_name = 'reservations'
       AND column_name = 'assigned_tables_manual')                        AS manual_default,
  (SELECT confdeltype FROM pg_constraint
     WHERE conrelid = 'floor_tables'::regclass
       AND confrelid = 'floor_sections'::regclass LIMIT 1)                AS section_fk_rule,
  (SELECT confdeltype FROM pg_constraint
     WHERE conrelid = 'floor_tables'::regclass
       AND confrelid = 'restaurants'::regclass LIMIT 1)                   AS restaurant_fk_rule,
  (SELECT count(*) FROM reservations
     WHERE floor_table_ids IS NOT NULL)                                   AS bookings_with_floor_tables,
  (SELECT count(*) FROM reservations
     WHERE assigned_tables_manual)                                        AS manual_choices,
  (SELECT count(*) FROM reservations)                                     AS reservations_total,
  (SELECT count(*) FROM restaurants)                                      AS restaurants_total;
