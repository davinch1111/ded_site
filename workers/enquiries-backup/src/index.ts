// Weekly D1 → R2 backup of the enquiries table.
//
// WHY THIS IS A SEPARATE WORKER, NOT A PAGES FUNCTION:
// Pages Functions have no `scheduled` handler — cron triggers are a Workers
// feature. So this cannot live in site/functions/ with the rest. It is
// deployed independently:
//
//   cd workers/enquiries-backup && wrangler deploy
//
// It binds to the SAME D1 database as the Pages project, plus an R2 bucket.
//
// Writes two objects per run, so the data is readable by machine and by a
// human without tooling:
//   enquiries/<YYYY>/enquiries-<YYYY-MM-DD>.json
//   enquiries/<YYYY>/enquiries-<YYYY-MM-DD>.csv
//
// Full-table snapshots, not incrementals: the table is small (one row per
// enquiry) and a self-contained snapshot restores without replaying history.

interface Env {
  DB: D1Database;
  BACKUPS: R2Bucket;
}

interface Row {
  id: number;
  created_at: string;
  name: string;
  email: string;
  company: string;
  message: string;
  budget: string;
  timeline: string;
  services: string;
  source_page: string;
  ip_country: string;
  user_agent: string;
  turnstile_status: string;
  honeypot_triggered: number;
  spam_score: number;
  email_sent: number;
  resend_id: string;
  notes: string;
}

const COLUMNS: (keyof Row)[] = [
  'id', 'created_at', 'name', 'email', 'company', 'message', 'budget', 'timeline',
  'services', 'source_page', 'ip_country', 'user_agent', 'turnstile_status',
  'honeypot_triggered', 'spam_score', 'email_sent', 'resend_id', 'notes',
];

/** Quote a CSV cell and defuse spreadsheet formula injection. */
function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

async function runBackup(env: Env): Promise<{ rows: number; keys: string[] }> {
  const { results } = await env.DB.prepare('SELECT * FROM enquiries ORDER BY id ASC').all<Row>();
  const rows = results ?? [];

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const year = day.slice(0, 4);
  const base = `enquiries/${year}/enquiries-${day}`;

  const json = JSON.stringify(
    { exported_at: now.toISOString(), count: rows.length, rows },
    null,
    2
  );

  // Leading BOM so Excel opens it as UTF-8.
  const csv =
    '﻿' +
    [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n');

  await env.BACKUPS.put(`${base}.json`, json, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { rows: String(rows.length), exported_at: now.toISOString() },
  });

  await env.BACKUPS.put(`${base}.csv`, csv, {
    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
    customMetadata: { rows: String(rows.length), exported_at: now.toISOString() },
  });

  return { rows: rows.length, keys: [`${base}.json`, `${base}.csv`] };
}

export default {
  /** Cron entry point. The schedule lives in wrangler.toml. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runBackup(env)
        .then((r) => console.log(`[backup] wrote ${r.rows} rows →`, r.keys.join(', ')))
        // Log and rethrow, so a failed run shows as failed in the Cron
        // Triggers dashboard instead of silently counting as a success.
        .catch((err) => {
          console.error('[backup] FAILED', err);
          throw err;
        })
    );
  },

  /**
   * Manual trigger, for checking the bindings without waiting a week.
   * Leave the Worker un-routed (no `routes` in wrangler.toml) so this is
   * only reachable via `wrangler dev`, or a workers.dev subdomain you can
   * switch off again afterwards.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/run') {
      return new Response('Not found', { status: 404 });
    }
    try {
      const r = await runBackup(env);
      return Response.json({ ok: true, ...r });
    } catch (err) {
      console.error('[backup] manual run failed', err);
      return Response.json({ ok: false, error: String(err) }, { status: 500 });
    }
  },
};
