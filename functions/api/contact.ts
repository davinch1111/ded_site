// POST /api/contact — contact form handler.
//
// Cloudflare Pages Function. Owns the whole pipeline: no third-party form
// service, mail from our own verified sender, Turnstile in front, and every
// submission persisted to D1.
//
// Durability order is deliberate:
//   1. INSERT the row
//   2. send via Resend
//   3. UPDATE email_sent / resend_id
// A Resend outage therefore costs the notification, never the enquiry — if
// the row landed, the visitor is told it worked, and the failure is logged
// and visible in /admin/enquiries as email_sent = 0.
//
// Honeypot hits and failed Turnstile checks are STORED AND FLAGGED rather
// than dropped, so false positives can be audited. Neither sends email.
//
// Progressive enhancement — one handler, two paths:
//   with JS    → fetch() sends Accept: application/json, gets JSON back
//   without JS → a normal form POST, gets a 303 to /thanks/
//
// Bindings / env vars (Pages → Settings):
//   DB                    — D1 binding to the ded-enquiries database
//   RESEND_API_KEY        — Resend API key, secret
//   TURNSTILE_SECRET_KEY  — Turnstile secret, secret. If unset, token
//                           verification is SKIPPED (see verifyTurnstile).

interface Env {
  DB?: D1Database;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
}

type TurnstileStatus = 'verified' | 'unverified' | 'failed';

const TO_ADDRESS = 'info@davidedigerdesign.com';
const FROM_ADDRESS = 'David Ediger Design <website@send.davidedigerdesign.com>';
const MAX_DESCRIPTION = 5000;

/** Collapse whitespace and hard-cap length. */
const clean = (v: FormDataEntryValue | null, max = 300): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Deliberately permissive — real addresses beat clever regexes. */
const isEmail = (v: string): boolean =>
  v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

/**
 * Crude 0–100 spam heuristic, recorded for triage only. It never blocks a
 * submission by itself — the honeypot and Turnstile do that.
 */
function scoreSpam(input: {
  honeypot: boolean;
  turnstile: TurnstileStatus;
  name: string;
  message: string;
}): number {
  let score = 0;
  if (input.honeypot) score += 100;
  if (input.turnstile === 'failed') score += 60;
  if (input.turnstile === 'unverified') score += 10;

  const links = (input.message.match(/https?:\/\//gi) || []).length;
  if (links >= 1) score += 15;
  if (links >= 3) score += 25;
  if (/https?:\/\//i.test(input.name)) score += 30;
  if (/\b(viagra|casino|crypto|seo services|backlink)\b/i.test(input.message)) score += 30;
  if (input.message.length > 0 && input.message.length < 10) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Verify the Turnstile token.
 *
 * 'unverified' when no secret is configured or no token was submitted — the
 * no-JS path cannot produce one, since Turnstile requires JS. Those are
 * accepted but flagged, so progressive enhancement still works. A genuine
 * verification failure returns 'failed'.
 */
async function verifyTurnstile(
  token: string,
  secret: string | undefined,
  ip: string | null
): Promise<TurnstileStatus> {
  if (!secret || !token) return 'unverified';

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? 'verified' : 'failed';
  } catch {
    // Network failure while verifying: fail closed rather than wave it through.
    return 'failed';
  }
}

/** JSON for the fetch path, 303 redirect for the no-JS path. */
function respond(
  wantsJson: boolean,
  ok: boolean,
  status: number,
  message: string,
  redirectTo: string
): Response {
  if (wantsJson) {
    return new Response(JSON.stringify({ ok, message }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: redirectTo, 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(wantsJson, false, 400, 'Could not read the form.', '/#contact?error=1');
  }

  const honeypot = clean(form.get('botcheck')).length > 0;

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 254);
  const company = clean(form.get('company'), 160);
  const budget = clean(form.get('budget'), 60);
  const timeline = clean(form.get('timeline'), 60);
  const message = clean(form.get('description'), MAX_DESCRIPTION);
  const services = form
    .getAll('services')
    .map((v) => clean(v, 40))
    .filter(Boolean);

  // Validation applies to real submissions only. A honeypot hit is stored
  // as-is, however malformed — the whole point is to keep the evidence.
  if (!honeypot) {
    if (!name || !email) {
      return respond(wantsJson, false, 400, 'Name and email are required.', '/#contact?error=required');
    }
    if (!isEmail(email)) {
      return respond(wantsJson, false, 400, 'That email address looks wrong.', '/#contact?error=email');
    }
  }

  const turnstile = await verifyTurnstile(
    clean(form.get('cf-turnstile-response'), 2048),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP')
  );

  const spamScore = scoreSpam({ honeypot, turnstile, name, message });
  // Flagged submissions are recorded but never emailed.
  const flagged = honeypot || turnstile === 'failed';

  // ── 1. Persist first ──────────────────────────────────────────────────
  let rowId: number | null = null;
  if (env.DB) {
    try {
      const result = await env.DB.prepare(
        `INSERT INTO enquiries
           (created_at, name, email, company, message, budget, timeline, services,
            source_page, ip_country, user_agent, turnstile_status,
            honeypot_triggered, spam_score, email_sent, resend_id, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,0,'','')`
      )
        .bind(
          new Date().toISOString(),
          name,
          email,
          company,
          message,
          budget,
          timeline,
          JSON.stringify(services),
          clean(form.get('source_page'), 200) || new URL(request.url).pathname,
          (request as { cf?: { country?: string } }).cf?.country ??
            request.headers.get('CF-IPCountry') ??
            '',
          (request.headers.get('user-agent') || '').slice(0, 400),
          turnstile,
          honeypot ? 1 : 0,
          spamScore
        )
        .run();
      rowId = Number(result.meta?.last_row_id ?? 0) || null;
    } catch (err) {
      // Storage failure must not swallow the enquiry — fall through and
      // still attempt the email, which then becomes the only copy.
      console.error('[contact] D1 insert failed', err);
    }
  } else {
    console.error('[contact] DB binding missing — enquiry not persisted.');
  }

  // Honeypot: report success so the bot learns nothing. Row is already kept.
  if (honeypot) {
    return respond(wantsJson, true, 200, 'Thanks — message received.', '/thanks/');
  }

  // Failed Turnstile: stored and flagged, but rejected to the visitor so a
  // real person is prompted to retry.
  if (turnstile === 'failed') {
    return respond(wantsJson, false, 403, 'Verification failed. Please try again.', '/#contact?error=verify');
  }

  // ── 2. Notify ─────────────────────────────────────────────────────────
  const stored = rowId !== null;
  let sent = false;
  let resendId = '';

  if (!env.RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY is not set — cannot send.');
  } else if (!flagged) {
    const verifyNote =
      turnstile === 'verified'
        ? 'Verified by Turnstile.'
        : 'Not verified by Turnstile (no-JS submission, or Turnstile not configured).';

    const rows: [string, string][] = [
      ['Name', name],
      ['Email', email],
      ['Company', company || '—'],
      ['Services', services.length ? services.join(', ') : '—'],
      ['Budget', budget || '—'],
      ['Timeline', timeline || '—'],
    ];

    const storedNote = rowId
      ? `Enquiry #${rowId}`
      : 'NOT STORED — the D1 write failed, so this email is the only copy.';

    const textBody = [
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      'Project description:',
      message || '—',
      '',
      verifyNote,
      storedNote,
    ].join('\n');

    const htmlBody = `
      <h2 style="font:600 16px/1.4 system-ui,sans-serif;margin:0 0 16px">New project inquiry</h2>
      <table style="font:14px/1.6 system-ui,sans-serif;border-collapse:collapse">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 16px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(
                v
              )}</strong></td></tr>`
          )
          .join('')}
      </table>
      <p style="font:14px/1.6 system-ui,sans-serif;margin:20px 0 6px;color:#666">Project description</p>
      <p style="font:14px/1.7 system-ui,sans-serif;margin:0;white-space:pre-wrap">${
        escapeHtml(message) || '—'
      }</p>
      <p style="font:12px/1.5 system-ui,sans-serif;margin:24px 0 0;color:#999">${verifyNote}<br>${escapeHtml(
        storedNote
      )}</p>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [TO_ADDRESS],
          reply_to: email,
          subject: `New project inquiry — ${name}${company ? ` (${company})` : ''}`,
          text: textBody,
          html: htmlBody,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        sent = true;
        resendId = data.id ?? '';
      } else {
        console.error('[contact] Resend returned', res.status, await res.text());
      }
    } catch (err) {
      console.error('[contact] Resend request threw', err);
    }
  }

  // ── 3. Record the send outcome ────────────────────────────────────────
  if (env.DB && rowId !== null && sent) {
    try {
      await env.DB.prepare('UPDATE enquiries SET email_sent = 1, resend_id = ?1 WHERE id = ?2')
        .bind(resendId, rowId)
        .run();
    } catch (err) {
      // The enquiry itself is safe; only the send-receipt is missing.
      console.error('[contact] D1 update failed for row', rowId, err);
    }
  }

  // Success if the enquiry survived anywhere: stored, or at least emailed.
  if (stored || sent) {
    return respond(
      wantsJson,
      true,
      200,
      "Thanks — I'll be in touch within two business days.",
      '/thanks/'
    );
  }

  // Neither stored nor sent — the only case the visitor must be told about.
  return respond(
    wantsJson,
    false,
    500,
    'Could not record that. Please email info@davidedigerdesign.com.',
    '/#contact?error=config'
  );
};

/** Anything other than POST gets a proper 405 rather than a 404. */
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
