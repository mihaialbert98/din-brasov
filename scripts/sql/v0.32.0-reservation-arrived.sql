-- v0.32.0 — „Rezervarea a sosit” toggle on the reservations board.
--
-- Fully ADDITIVE: one nullable column, no backfill. NULL = not arrived, which is the
-- correct value for every existing row. Safe to run BEFORE the deploy and safe to leave
-- in place on rollback (older code never reads it).
--
-- Run in the Neon SQL editor against the PRODUCTION branch (or `drizzle-kit push`).

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS arrived_at timestamp;

-- Verify (expect one row: arrived_at | timestamp without time zone | YES):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reservations' AND column_name = 'arrived_at';
