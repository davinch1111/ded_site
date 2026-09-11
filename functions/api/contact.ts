// POST /api/contact — contact form handler.
//
// Cloudflare Pages Function. Replaces the third-party Web3Forms endpoint so
// the studio owns the pipeline end to end: no public access key in the repo,
// mail sent from our own verified sender, and Turnstile in front of it.
//
// Progressive enhancement — one handler serves both paths:
//   with JS    → fetch() sends Accept: application/json, gets JSON back
//   without JS → a normal form POST, gets a 303 redirect to /thanks/
//                (or back to /#contact?error=… on failure)
//
// Required env vars (Pages → Settings → Environment variables):
//   RESEND_API_KEY        — Resend API key, secret
//   TURNSTILE_SECRET_KEY  — Turnstile secret, secret. If unset, token
//                           verification is SKIPPED (see verifyTurnstile).

interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
}

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
 * Verify the Turnstile token.
 *
 * Returns 'skipped' when no secret is configured (so the form keeps working
 * before Turnstile is set up) or when no token was submitted — the no-JS
 * path cannot produce one, because Turnstile requires JS. Those submissions
 * are still accepted but flagged in the email, so unverified mail is visible
 * rather than silently trusted. The honeypot still applies to both paths.
 */
async function verifyTurnstile(
  token: string,
  secret: string | undefined,
  ip: string | null
): Promise<'ok' | 'skipped' | 'failed'> {
  if (!secret || !token) return 'skipped';

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
    return data.success ? 'ok' : 'failed';
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

  // Honeypot: hidden from people, tempting to bots. Report success so the
  // bot does not learn it was caught, but send nothing.
  if (clean(form.get('botcheck'))) {
    return respond(wantsJson, true, 200, 'Thanks — message received.', '/thanks/');
  }

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 254);
  const company = clean(form.get('company'), 160);
  const budget = clean(form.get('budget'), 60);
  const timeline = clean(form.get('timeline'), 60);
  const description = clean(form.get('description'), MAX_DESCRIPTION);
  const services = form
    .getAll('services')
    .map((v) => clean(v, 40))
    .filter(Boolean);

  if (!name || !email) {
    return respond(wantsJson, false, 400, 'Name and email are required.', '/#contact?error=required');
  }
  if (!isEmail(email)) {
    return respond(wantsJson, false, 400, 'That email address looks wrong.', '/#contact?error=email');
  }

  const verdict = await verifyTurnstile(
    clean(form.get('cf-turnstile-response'), 2048),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP')
  );
  if (verdict === 'failed') {
    return respond(wantsJson, false, 403, 'Verification failed. Please try again.', '/#contact?error=verify');
  }

  if (!env.RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY is not set — cannot send.');
    return respond(
      wantsJson,
      false,
      500,
      'The form is misconfigured. Please email info@davidedigerdesign.com.',
      '/#contact?error=config'
    );
  }

  const verifyNote =
    verdict === 'skipped'
      ? 'Not verified by Turnstile (no-JS submission, or Turnstile not configured).'
      : 'Verified by Turnstile.';

  const rows: [string, string][] = [
    ['Name', name],
    ['Email', email],
    ['Company', company || '—'],
    ['Services', services.length ? services.join(', ') : '—'],
    ['Budget', budget || '—'],
    ['Timeline', timeline || '—'],
  ];

  const textBody = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Project description:',
    description || '—',
    '',
    verifyNote,
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
      escapeHtml(description) || '—'
    }</p>
    <p style="font:12px/1.5 system-ui,sans-serif;margin:24px 0 0;color:#999">${verifyNote}</p>`;

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

    if (!res.ok) {
      console.error('[contact] Resend returned', res.status, await res.text());
      return respond(
        wantsJson,
        false,
        502,
        'Could not send right now. Please email info@davidedigerdesign.com.',
        '/#contact?error=send'
      );
    }
  } catch (err) {
    console.error('[contact] Resend request threw', err);
    return respond(
      wantsJson,
      false,
      502,
      'Could not send right now. Please email info@davidedigerdesign.com.',
      '/#contact?error=send'
    );
  }

  return respond(
    wantsJson,
    true,
    200,
    "Thanks — I'll be in touch within two business days.",
    '/thanks/'
  );
};

/** Anything other than POST gets a proper 405 rather than a 404. */
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
