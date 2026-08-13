-- v0.27.0 — reservation success-screen wording.
-- Fully ADDITIVE and defaulted, so existing rows and the currently deployed code
-- keep behaving exactly as before.
--
-- Run in the Neon SQL editor against the PRODUCTION branch BEFORE deploying.

-- Auto-confirm restaurants only: whether the success screen tells the guest that a
-- confirmation email is on its way. Purely wording — the email is sent either way.
-- Default true = the message every existing restaurant already shows today.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS reservation_show_email_notice boolean NOT NULL DEFAULT true;

-- ── Verification (expect: 1 column, and every restaurant still opted in) ──
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'restaurants'
       AND column_name = 'reservation_show_email_notice')          AS column_added,
  (SELECT count(*) FROM restaurants
     WHERE reservation_show_email_notice = true)                   AS restaurants_showing_notice,
  (SELECT count(*) FROM restaurants
     WHERE reservation_show_email_notice = false)                  AS restaurants_hiding_notice;
