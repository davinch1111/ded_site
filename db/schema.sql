-- D1 schema for contact enquiries.
--
-- Apply:
--   wrangler d1 execute ded-enquiries --remote --file=db/schema.sql
--
-- Every submission is stored, including honeypot hits and failed Turnstile
-- checks. Those are FLAGGED, never discarded, so false positives can be
-- audited rather than silently lost.

CREATE TABLE IF NOT EXISTS enquiries (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  -- ISO-8601 UTC, e.g. 2026-01-15T09:30:00.000Z. TEXT because SQLite has no
  -- native date type, and ISO strings sort lexicographically.
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  name               TEXT    NOT NULL DEFAULT '',
  email              TEXT    NOT NULL DEFAULT '',
  company            TEXT    NOT NULL DEFAULT '',
  message            TEXT    NOT NULL DEFAULT '',

  -- Not in the original spec, but the form collects them and dropping them
  -- would lose data the studio actually uses when quoting.
  budget             TEXT    NOT NULL DEFAULT '',
  timeline           TEXT    NOT NULL DEFAULT '',

  -- JSON array of the selected service chips, e.g. ["Print","Web"].
  services           TEXT    NOT NULL DEFAULT '[]',

  source_page        TEXT    NOT NULL DEFAULT '',
  ip_country         TEXT    NOT NULL DEFAULT '',
  user_agent         TEXT    NOT NULL DEFAULT '',

  turnstile_status   TEXT    NOT NULL DEFAULT 'unverified'
                             CHECK (turnstile_status IN ('verified','unverified','failed')),
  honeypot_triggered INTEGER NOT NULL DEFAULT 0 CHECK (honeypot_triggered IN (0,1)),
  spam_score         INTEGER NOT NULL DEFAULT 0 CHECK (spam_score BETWEEN 0 AND 100),

  email_sent         INTEGER NOT NULL DEFAULT 0 CHECK (email_sent IN (0,1)),
  resend_id          TEXT    NOT NULL DEFAULT '',

  -- Free-text, for the studio's own annotations.
  notes              TEXT    NOT NULL DEFAULT ''
);

-- Listing is always newest-first.
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries (created_at DESC);

-- The admin "real vs flagged" filter keys off these two.
CREATE INDEX IF NOT EXISTS idx_enquiries_triage
  ON enquiries (honeypot_triggered, turnstile_status, created_at DESC);

-- Finding a person's previous enquiries.
CREATE INDEX IF NOT EXISTS idx_enquiries_email ON enquiries (email);
