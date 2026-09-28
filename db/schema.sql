-- D1 schema for the contact form.
--
-- Apply (remote, the real database):
--   npx wrangler d1 execute ded-enquiries --remote --file=db/schema.sql
-- Apply (local, for `wrangler pages dev`):
--   npx wrangler d1 execute ded-enquiries --local --persist-to .wrangler/state \
--     --file=db/schema.sql
--
-- TWO TABLES, DELIBERATELY. Accepted enquiries carry personal data and live in
-- `enquiries`. Rejections carry a reason and an email DOMAIN and nothing else —
-- same privacy level as the console logs they mirror. Keeping them apart means
-- the spam table can never accumulate names, addresses or message bodies, and
-- can be pruned on a schedule without touching real leads.

-- ─── Accepted submissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- ISO-8601 UTC. TEXT because SQLite has no date type, and ISO strings sort
  -- lexicographically, so ORDER BY created_at DESC is chronological.
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  name         TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  company      TEXT NOT NULL DEFAULT '',
  -- JSON array of the selected chips, e.g. ["Print","Web"].
  services     TEXT NOT NULL DEFAULT '[]',
  budget       TEXT NOT NULL DEFAULT '',
  timeline     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',

  -- The row is INSERTed as 'pending' BEFORE Resend is called, then UPDATEd.
  -- A row stuck on 'pending' means the handler died between insert and update:
  -- the enquiry is safe, but nobody knows whether the mail went out.
  email_status TEXT NOT NULL DEFAULT 'pending'
               CHECK (email_status IN ('pending','sent','failed')),
  email_error  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_enquiries_created  ON enquiries (created_at DESC);
-- Supports the "anything that did not send" review query.
CREATE INDEX IF NOT EXISTS idx_enquiries_status   ON enquiries (email_status);

-- ─── Blocked submissions ───────────────────────────────────────────────────
-- NO personal data beyond the email domain. Not an oversight: this table is
-- large, long-lived and exists only for tuning the traps. Storing names or
-- message bodies here would turn a spam counter into a personal-data store.
CREATE TABLE IF NOT EXISTS rejections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- Matches the console log reason exactly: honeypot, timetrap-too-fast,
  -- timetrap-expired, cyrillic, too-many-urls, blocked-domain,
  -- turnstile-token-missing, turnstile-failed:<codes>, …
  reason       TEXT NOT NULL,
  -- Domain only, never the local part. '' when there was no usable address.
  email_domain TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_rejections_created ON rejections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rejections_reason  ON rejections (reason);
