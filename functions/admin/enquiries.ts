// GET /admin/enquiries — enquiry inbox.
//
// A Pages Function rather than an Astro page: the site builds with
// output: 'static' and no SSR adapter, so a page cannot be server-rendered.
//
// AUTH IS CLOUDFLARE ACCESS, and this handler FAILS CLOSED.
//
// Access is configured in the dashboard, but a dashboard setting is not
// something this code can assume. The page exposes names, email addresses
// and message bodies, so shipping it "open until someone adds a policy"
// would publish the studio's enquiry inbox. Instead it verifies the
// Cf-Access-Jwt-Assertion JWT on every request — signature against the
// team's JWKS, plus aud and exp — and returns 403 when
// CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are unset. Unconfigured therefore
// means unreachable, never public.
//
// Env vars (Pages → Settings):
//   DB                     — D1 binding to ded-enquiries
//   CF_ACCESS_TEAM_DOMAIN  — e.g. davidediger.cloudflareaccess.com
//   CF_ACCESS_AUD          — the Access application's Audience tag

interface Env {
  DB?: D1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
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

const PAGE_SIZE = 50;

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

// ── Cloudflare Access JWT verification ──────────────────────────────────

const b64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

interface AccessIdentity {
  email: string;
}

/**
 * Returns the verified identity, or null. Null means "deny" in every case —
 * missing config, missing token, bad signature, wrong audience, expired.
 */
async function verifyAccess(request: Request, env: Env): Promise<AccessIdentity | null> {
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!team || !aud) return null;

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSig] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(rawHeader)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(rawPayload)));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;

  let jwks: { keys?: Array<JsonWebKey & { kid?: string }> };
  try {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    jwks = await res.json();
  } catch {
    return null;
  }

  const jwk = jwks.keys?.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(rawSig),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  return { email: payload.email ?? 'unknown' };
}

// ── Querying ────────────────────────────────────────────────────────────

/** Flagged = honeypot hit or a failed Turnstile check. */
const FLAGGED_SQL = "(honeypot_triggered = 1 OR turnstile_status = 'failed')";

function buildWhere(filter: string, q: string): { sql: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (filter === 'real') clauses.push(`NOT ${FLAGGED_SQL}`);
  else if (filter === 'flagged') clauses.push(FLAGGED_SQL);

  if (q) {
    clauses.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR message LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

// ── CSV ─────────────────────────────────────────────────────────────────

/**
 * Quote a CSV cell, and defuse spreadsheet formula injection: a cell
 * starting with = + - @ is executed by Excel/Sheets on open.
 */
function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS: (keyof Row)[] = [
  'id', 'created_at', 'name', 'email', 'company', 'message', 'budget', 'timeline',
  'services', 'source_page', 'ip_country', 'user_agent', 'turnstile_status',
  'honeypot_triggered', 'spam_score', 'email_sent', 'resend_id', 'notes',
];

// ── Views ───────────────────────────────────────────────────────────────

const STYLE = `
  :root { color-scheme: dark; --bg:#0b0c10; --panel:#14161c; --line:#232733;
          --ink:#e9e9ec; --dim:#9aa0ae; --accent:#5b7fe0; --warn:#e0a35b; --bad:#e06b5b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
  a { color:var(--accent); }
  header { padding:20px 24px; border-bottom:1px solid var(--line);
           display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:16px; margin:0; font-weight:600; letter-spacing:.02em; }
  .who { color:var(--dim); font-size:12px; margin-left:auto; }
  main { padding:24px; max-width:1400px; margin:0 auto; }
  form.tools { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; align-items:center; }
  input[type=search] { background:var(--panel); border:1px solid var(--line); color:var(--ink);
                       padding:8px 12px; border-radius:6px; min-width:260px; }
  .tabs { display:flex; gap:6px; }
  .tab { padding:8px 14px; border:1px solid var(--line); border-radius:6px;
         text-decoration:none; color:var(--dim); background:var(--panel); }
  .tab[aria-current="true"] { color:var(--ink); border-color:var(--accent); }
  .btn { padding:8px 14px; border:1px solid var(--line); border-radius:6px;
         background:var(--panel); color:var(--ink); text-decoration:none; cursor:pointer; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line);
           vertical-align:top; }
  th { color:var(--dim); font-weight:500; font-size:12px; text-transform:uppercase;
       letter-spacing:.08em; }
  tr:hover td { background:rgba(255,255,255,.02); }
  .pill { display:inline-block; padding:2px 8px; border-radius:100px; font-size:11px;
          border:1px solid var(--line); color:var(--dim); white-space:nowrap; }
  .pill.bad { color:var(--bad); border-color:var(--bad); }
  .pill.warn { color:var(--warn); border-color:var(--warn); }
  .pill.ok { color:var(--accent); border-color:var(--accent); }
  .msg { color:var(--dim); max-width:46ch; overflow:hidden; text-overflow:ellipsis;
         white-space:nowrap; }
  .empty { color:var(--dim); padding:48px 0; text-align:center; }
  dl { display:grid; grid-template-columns:180px 1fr; gap:10px 20px; margin:0 0 28px; }
  dt { color:var(--dim); }
  dd { margin:0; overflow-wrap:anywhere; }
  .body { background:var(--panel); border:1px solid var(--line); border-radius:8px;
          padding:16px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .pager { display:flex; gap:10px; margin-top:20px; align-items:center; color:var(--dim); }
  .banner { background:#3a2a12; border:1px solid var(--warn); color:#f0d6ab;
            padding:12px 16px; border-radius:8px; margin-bottom:20px; }
  .foot { margin-top:24px; }
`;

function shell(nonce: string, title: string, who: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title><style nonce="${nonce}">${STYLE}</style></head>
<body><header><h1>Enquiries</h1>
<a class="tab" href="/admin/enquiries">All submissions</a>
<span class="who">${esc(who)}</span></header><main>${body}</main></body></html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      // Self-contained page: no scripts, no external anything.
      'Content-Security-Policy':
        `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'self' data:; ` +
        `form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}

const badge = (r: Row): string => {
  if (r.honeypot_triggered) return '<span class="pill bad">honeypot</span>';
  if (r.turnstile_status === 'failed') return '<span class="pill bad">turnstile failed</span>';
  if (r.turnstile_status === 'unverified') return '<span class="pill warn">unverified</span>';
  return '<span class="pill ok">verified</span>';
};

function listView(
  nonce: string, who: string, rows: Row[], total: number,
  filter: string, q: string, page: number
): Response {
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ filter, q, page: String(page), ...(over as object) });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/admin/enquiries?${p}`;
  };

  const tab = (key: string, label: string) =>
    `<a class="tab" href="${esc(qs({ filter: key, page: 1 }))}" aria-current="${filter === key}">${label}</a>`;

  const body = rows.length
    ? `<table><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Services</th>
       <th>Message</th><th>Status</th><th>Mail</th></tr></thead><tbody>
       ${rows
         .map((r) => {
           let services: string[] = [];
           try { services = JSON.parse(r.services || '[]'); } catch { /* keep [] */ }
           return `<tr>
             <td><a href="/admin/enquiries?id=${r.id}">${esc(r.created_at.replace('T', ' ').slice(0, 16))}</a></td>
             <td>${esc(r.name) || '<span class="pill">—</span>'}</td>
             <td>${esc(r.email)}</td>
             <td>${esc(services.join(', ')) || '—'}</td>
             <td class="msg">${esc(r.message.slice(0, 90))}</td>
             <td>${badge(r)}${r.spam_score >= 50 ? ` <span class="pill bad">spam ${r.spam_score}</span>` : ''}</td>
             <td>${r.email_sent ? '<span class="pill ok">sent</span>' : '<span class="pill warn">not sent</span>'}</td>
           </tr>`;
         })
         .join('')}
       </tbody></table>`
    : `<p class="empty">No submissions match.</p>`;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pager = `<div class="pager">
      ${page > 1 ? `<a class="btn" href="${esc(qs({ page: page - 1 }))}">← Newer</a>` : ''}
      <span>Page ${page} of ${pages} · ${total} record${total === 1 ? '' : 's'}</span>
      ${page < pages ? `<a class="btn" href="${esc(qs({ page: page + 1 }))}">Older →</a>` : ''}
    </div>`;

  return shell(nonce, 'Enquiries', who, `
    <form class="tools" method="GET" action="/admin/enquiries">
      <input type="search" name="q" value="${esc(q)}" placeholder="Search name, email, company, message">
      <input type="hidden" name="filter" value="${esc(filter)}">
      <button class="btn" type="submit">Search</button>
      <div class="tabs">${tab('all', 'All')}${tab('real', 'Real')}${tab('flagged', 'Flagged')}</div>
      <a class="btn" href="${esc(qs({ export: 'csv' }))}">Export CSV</a>
    </form>
    ${body}${pager}`);
}

function detailView(nonce: string, who: string, r: Row): Response {
  let services: string[] = [];
  try { services = JSON.parse(r.services || '[]'); } catch { /* keep [] */ }

  const subject = encodeURIComponent('Re: your enquiry — David Ediger Design');
  const mailto = `mailto:${encodeURIComponent(r.email)}?subject=${subject}`;

  const field = (k: string, v: string) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;

  return shell(nonce, `Enquiry #${r.id}`, who, `
    <p><a href="/admin/enquiries">← Back to all</a></p>
    ${
      r.honeypot_triggered || r.turnstile_status === 'failed'
        ? `<div class="banner">Flagged as likely spam — kept for audit, and no email was sent.
           Check it before discarding: this is where a false positive would show up.</div>`
        : ''
    }
    <dl>
      ${field('Received', esc(r.created_at))}
      ${field('Name', esc(r.name) || '—')}
      ${field('Email', `<a href="${esc(mailto)}">${esc(r.email)}</a>`)}
      ${field('Company', esc(r.company) || '—')}
      ${field('Services', esc(services.join(', ')) || '—')}
      ${field('Budget', esc(r.budget) || '—')}
      ${field('Timeline', esc(r.timeline) || '—')}
      ${field('Status', badge(r))}
      ${field('Spam score', String(r.spam_score))}
      ${field('Email sent', r.email_sent ? `yes${r.resend_id ? ` (${esc(r.resend_id)})` : ''}` : 'no')}
      ${field('Source page', esc(r.source_page) || '—')}
      ${field('Country', esc(r.ip_country) || '—')}
      ${field('User agent', esc(r.user_agent) || '—')}
      ${field('Notes', esc(r.notes) || '—')}
    </dl>
    <div class="body">${esc(r.message) || '—'}</div>
    <p class="foot"><a class="btn" href="${esc(mailto)}">Reply by email</a></p>`);
}

// ── Handler ─────────────────────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await verifyAccess(request, env);
  if (!identity) {
    return new Response(
      'Forbidden. This page is protected by Cloudflare Access and is unavailable ' +
        'until an Access application and the CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD ' +
        'environment variables are configured.',
      { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }

  if (!env.DB) {
    return new Response('The DB binding is not configured on this Pages project.', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id') || 0);
  const rawFilter = url.searchParams.get('filter') || '';
  const filter = ['all', 'real', 'flagged'].includes(rawFilter) ? rawFilter : 'all';
  const q = (url.searchParams.get('q') || '').slice(0, 120).trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);

  // Detail
  if (id > 0) {
    const row = await env.DB.prepare('SELECT * FROM enquiries WHERE id = ?1').bind(id).first<Row>();
    if (!row) return new Response('Not found', { status: 404 });
    return detailView(nonce, identity.email, row);
  }

  const { sql: where, binds } = buildWhere(filter, q);

  // CSV export — honours the current filter/search, not just the page shown.
  if (url.searchParams.get('export') === 'csv') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM enquiries ${where} ORDER BY created_at DESC LIMIT 10000`
    )
      .bind(...binds)
      .all<Row>();

    const lines = [
      CSV_COLUMNS.join(','),
      ...(results ?? []).map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(',')),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    // Leading BOM so Excel reads it as UTF-8.
    return new Response('﻿' + lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="enquiries-${filter}-${stamp}.csv"`,
        'Cache-Control': 'no-store, private',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM enquiries ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await env.DB.prepare(
    `SELECT * FROM enquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<Row>();

  return listView(nonce, identity.email, results ?? [], countRow?.n ?? 0, filter, q, page);
};
