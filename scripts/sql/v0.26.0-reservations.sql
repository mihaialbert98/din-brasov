-- v0.26.0 — reservations: closed dates, per-party turn time, tables held back for
-- walk-ins. Fully ADDITIVE: every column has a default or is nullable, so existing
-- rows and the currently deployed code keep working unchanged.
--
-- Run in the Neon SQL editor against the PRODUCTION branch BEFORE deploying.

-- 1. Dates the restaurant takes no ONLINE bookings (holiday / private event / vacation).
CREATE TABLE IF NOT EXISTS reservation_closures (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date_from     text NOT NULL,
  date_to       text NOT NULL,
  reason        text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_closures_restaurant_idx
  ON reservation_closures (restaurant_id);

-- 2. Optional longer turn for large parties + its two behaviour switches.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS reservation_long_turn_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_long_turn_from_party integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS reservation_long_turn_minutes    integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS reservation_allow_reduced_turn   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reservation_show_duration        boolean NOT NULL DEFAULT false;

-- 3. Per-booking duration, fixed at booking time. NULL = "the restaurant's standard
--    turn", which is exactly how every existing row already behaves — so NO backfill.
--    Storing it is what stops a settings change from moving an existing booking's
--    end time (and therefore from creating a new overlap).
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS turn_minutes integer;

-- 4. Tables held back from the public form (walk-ins / phone bookings). Default true
--    = every existing table stays bookable online exactly as before.
ALTER TABLE reservation_tables
  ADD COLUMN IF NOT EXISTS bookable_online boolean NOT NULL DEFAULT true;

-- 5. REPAIR: tables added before „Interior & terasă” was switched on kept area = NULL.
--    With zones on, availability filters per area, so an area-less table matches
--    NEITHER interior nor terasă and silently disappears from the booking form —
--    the whole room looks fully booked. Put them in the main room; the owner can move
--    any of them to the terrace from Setări. (The app now assigns an area when zones
--    are enabled and when a table is created, so this cannot recur.)
--    Deliberately NOT limited to „mese individuale”: a restaurant can have zones on
--    while still using „capacitate totală” (tables unused, so nothing looks wrong) and
--    switch to individual tables later — at which point the stale NULLs would bite.
--    Setting an area on a table is inert while the restaurant uses total capacity.
UPDATE reservation_tables
   SET area = 'inside'
 WHERE area IS NULL
   AND restaurant_id IN (
     SELECT id FROM restaurants WHERE reservation_areas_enabled = true
   );

-- ── Verification (expect: 5 restaurant cols, 1 reservation col, 1 table col,
--    the closures table, and turn_minutes NULL on every existing booking) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'restaurants'
       AND column_name IN ('reservation_long_turn_enabled','reservation_long_turn_from_party',
                           'reservation_long_turn_minutes','reservation_allow_reduced_turn',
                           'reservation_show_duration'))                       AS restaurant_cols,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'reservations' AND column_name = 'turn_minutes')       AS reservation_cols,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'reservation_tables' AND column_name = 'bookable_online') AS table_cols,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'reservation_closures')                                AS closures_table,
  (SELECT count(*) FROM reservations WHERE turn_minutes IS NOT NULL)           AS bookings_with_turn,
  (SELECT count(*) FROM reservation_tables WHERE bookable_online = false)      AS tables_held_back,
  -- Must be 0: no table may be left without a zone while zones are on.
  (SELECT count(*) FROM reservation_tables t
     JOIN restaurants r ON r.id = t.restaurant_id
    WHERE t.area IS NULL
      AND r.reservation_areas_enabled = true)                                  AS tables_without_zone;
