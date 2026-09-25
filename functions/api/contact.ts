// POST /api/contact — contact form handler.
//
// Cloudflare Pages Function. The studio owns the pipeline end to end: no
// public access key in the repo, mail from our own verified sender, and
// Turnstile in front of it.
//
// Progressive enhancement — one handler serves both paths:
//   with JS    → fetch() sends Accept: application/json, gets JSON back
//   without JS → a normal form POST, gets a 303 redirect to /thanks/
//                (or back to /#contact?error=… on failure)
//
// TURNSTILE NOW FAILS CLOSED. The previous version returned 'skipped' when the
// token was missing, so a direct POST that simply omitted the token was
// emailed through with a "Not verified by Turnstile" note appended. That note
// was the spam channel, not a safeguard: bots do not run JS, so they never
// send a token, and every one of them took the skipped path. A submission now
// needs a token that verifies against our secret AND resolves to our hostname,
// or it does not become mail.
//
// The cost is real and deliberate: a genuine visitor with JS disabled can no
// longer use the form, because Turnstile cannot produce a token without JS.
// The <noscript> block on the form gives them the studio address instead.
//
// Required env vars (Pages → Settings → Environment variables, PRODUCTION):
//   RESEND_API_KEY        — Resend API key, secret
//   TURNSTILE_SECRET_KEY  — Turnstile secret, secret. Without it NOTHING is
//                           accepted — that is the point of failing closed.

interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
}

const TO_ADDRESS = 'info@davidedigerdesign.com';
const FROM_ADDRESS = 'David Ediger Design <website@send.davidedigerdesign.com>';
const MAX_DESCRIPTION = 5000;
const MIN_DESCRIPTION = 30;

/**
 * Hostnames whose Turnstile tokens we accept. siteverify echoes back the
 * hostname the widget was solved on, so a token farmed from a clone of this
 * form on another domain fails here even if it is otherwise valid.
 *
 * Preview deploys are deliberately NOT listed: submitting the form on
 * ded-site.pages.dev will fail hostname validation. Add the preview host here
 * temporarily if you need to test a real submission against it.
 */
const ALLOWED_TURNSTILE_HOSTNAMES = ['davidedigerdesign.com'];

/** Minimum time a human plausibly needs. Anything faster is scripted. */
const MIN_FILL_MS = 3_000;
/** Older than this and the page has been sitting open, or `ts` was forged. */
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Free-mail domains that generate effectively all of this form's spam, plus a
 * short disposable-address list. Kept small on purpose — an aggressive list
 * blocks real clients, and the Turnstile gate is doing the heavy lifting.
 */
const BLOCKED_EMAIL_DOMAINS = new Set([
  'mail.ru', 'rambler.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'internet.ru',
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com',
  'dispostable.com', 'throwawaymail.com',
]);

const SUCCESS_MESSAGE = "Thanks — I'll be in touch within two business days.";

/** Collapse whitespace and hard-cap length. */
const clean = (v: FormDataEntryValue | null, max = 300): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Deliberately permissive — real addresses beat clever regexes. */
const isEmail = (v: string): boolean =>
  v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const emailDomain = (v: string): string => v.split('@')[1]?.toLowerCase() ?? '';

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

/** Any HTML-ish tag. Legitimate project briefs do not contain markup. */
const hasHtmlTag = (s: string): boolean => /<\s*\/?\s*[a-z][^>]*>/i.test(s);

/** http(s):// or bare www. — link-stuffing is the usual payload. */
const countUrls = (s: string): number => (s.match(/https?:\/\/|\bwww\./gi) || []).length;

/**
 * Share of letters that are Cyrillic. Counts against LETTERS, not total
 * characters, so punctuation and digits cannot dilute the ratio and let a
 * mostly-Cyrillic message through.
 */
const cyrillicShare = (s: string): number => {
  const letters = s.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return 0;
  const cyrillic = s.match(/\p{Script=Cyrillic}/gu);
  return (cyrillic?.length ?? 0) / letters.length;
};

/**
 * Rejection log. Email DOMAIN only — never the address, name, or message, so
 * the logs stay useful for tuning without becoming a store of personal data.
 */
const logReject = (reason: string, domain: string): void => {
  console.log(`[contact] rejected reason=${reason} domain=${domain || 'none'}`);
};

type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify the Turnstile token server-side. Fails closed on every path:
 * no secret, no token, success=false, unexpected hostname, or a network
 * error while verifying.
 */
async function verifyTurnstile(
  token: string,
  secret: string | undefined,
  ip: string | null
): Promise<TurnstileResult> {
  if (!secret) return { ok: false, reason: 'turnstile-secret-unset' };
  if (!token) return { ok: false, reason: 'turnstile-token-missing' };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  // Binds the token to the requesting IP, so a token solved elsewhere and
  // replayed from a spam host is rejected.
  if (ip) body.append('remoteip', ip);

  let data: { success?: boolean; hostname?: string; 'error-codes'?: string[] };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    data = await res.json();
  } catch {
    return { ok: false, reason: 'turnstile-unreachable' };
  }

  if (!data.success) {
    const codes = (data['error-codes'] || []).join(',') || 'unknown';
    return { ok: false, reason: `turnstile-failed:${codes}` };
  }
  if (data.hostname && !ALLOWED_TURNSTILE_HOSTNAMES.includes(data.hostname)) {
    return { ok: false, reason: `turnstile-hostname:${data.hostname}` };
  }
  return { ok: true };
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

  /**
   * Looks exactly like a delivered message but sends nothing. Used for every
   * automated rejection so a bot cannot tell which trap it hit and tune
   * around it — the reason goes to the log, never to the caller.
   */
  const silentDrop = (reason: string, domain = ''): Response => {
    logReject(reason, domain);
    return respond(wantsJson, true, 200, SUCCESS_MESSAGE, '/thanks/');
  };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(wantsJson, false, 400, 'Could not read the form.', '/#contact?error=1');
  }

  // ── Honeypots ──────────────────────────────────────────────────────────
  // `website` is the new visually-hidden field; `botcheck` is the original.
  // Both are off-screen via a stylesheet class and out of the tab order, so a
  // person cannot fill either by accident.
  if (clean(form.get('website')) || clean(form.get('botcheck'))) {
    return silentDrop('honeypot');
  }

  // ── Time trap ──────────────────────────────────────────────────────────
  // `ts` is stamped by the bundled script at page load. Missing means the
  // form was posted without ever rendering the page.
  const tsRaw = clean(form.get('ts'), 32);
  const ts = Number(tsRaw);
  if (!tsRaw || !Number.isFinite(ts) || ts <= 0) {
    return silentDrop('timetrap-missing');
  }
  const age = Date.now() - ts;
  if (age < MIN_FILL_MS) return silentDrop('timetrap-too-fast');
  if (age > MAX_FORM_AGE_MS) return silentDrop('timetrap-stale');

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

  const domain = emailDomain(email);

  // ── Visible validation: real mistakes a person can fix ─────────────────
  if (!name || !email) {
    return respond(wantsJson, false, 400, 'Name and email are required.', '/#contact?error=required');
  }
  if (!isEmail(email)) {
    return respond(wantsJson, false, 400, 'That email address looks wrong.', '/#contact?error=email');
  }
  if (services.length === 0) {
    return respond(
      wantsJson,
      false,
      400,
      'Please pick at least one thing I can help with.',
      '/#contact?error=services'
    );
  }
  if (description.length < MIN_DESCRIPTION) {
    return respond(
      wantsJson,
      false,
      400,
      `Please tell me a little more about the project — at least ${MIN_DESCRIPTION} characters.`,
      '/#contact?error=description'
    );
  }

  // ── Silent content heuristics ──────────────────────────────────────────
  if (hasHtmlTag(description) || hasHtmlTag(name)) return silentDrop('html-in-content', domain);
  if (/\[url=/i.test(description)) return silentDrop('bbcode-url', domain);
  if (countUrls(description) > 2) return silentDrop('too-many-urls', domain);
  if (cyrillicShare(`${name} ${description}`) > 0.3) return silentDrop('cyrillic', domain);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return silentDrop('blocked-domain', domain);

  // ── Turnstile, fail closed ─────────────────────────────────────────────
  const turnstile = await verifyTurnstile(
    clean(form.get('cf-turnstile-response'), 2048),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP')
  );
  if (!turnstile.ok) {
    logReject(turnstile.reason, domain);
    return respond(
      wantsJson,
      false,
      400,
      'We could not verify that submission. Please reload the page and try again.',
      '/#contact?error=verify'
    );
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

  const rows: [string, string][] = [
    ['Name', name],
    ['Email', email],
    ['Company', company || '—'],
    ['Services', services.join(', ')],
    ['Budget', budget || '—'],
    ['Timeline', timeline || '—'],
  ];

  const textBody = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Project description:',
    description,
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
    <p style="font:14px/1.7 system-ui,sans-serif;margin:0;white-space:pre-wrap">${escapeHtml(
      description
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

  return respond(wantsJson, true, 200, SUCCESS_MESSAGE, '/thanks/');
};

/** Anything other than POST gets a proper 405 rather than a 404. */
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
