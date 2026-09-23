// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://davidedigerdesign.com',

  // /thanks/ carries <meta name="robots" content="noindex"> — it is the no-JS
  // contact landing, reachable only by submitting the form. Listing a noindex
  // page in the sitemap sends Google two contradictory signals about the same
  // URL, which is reported in Search Console as "Submitted URL marked
  // noindex". Excluded here so the sitemap only ever advertises indexable
  // pages. Astro already omits 404.
  integrations: [sitemap({ filter: (page) => !page.endsWith('/thanks/') })],

  // All styles ship as external CSS files — no inline <style> except Astro's
  // own island stylesheet, which security.csp hashes. Keeps style-src free of
  // 'unsafe-inline'.
  build: { inlineStylesheets: 'never' },

  // Never inline bundled page scripts into the HTML (Astro inlines anything
  // under 4KB by default). External files are covered by script-src 'self';
  // inline ones would each need a hash.
  vite: { build: { assetsInlineLimit: 0 } },

  // Single source of truth for the Content-Security-Policy, emitted as a
  // per-page <meta> tag with SHA-256 hashes for the island-runtime scripts
  // that Astro must inline. public/_headers carries ONLY frame-ancestors
  // (banned in meta CSP) — so there is exactly one effective script-src,
  // with no 'unsafe-inline' anywhere.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "img-src 'self' data: https://davidedigerdesign.in https://*.r2.dev https://*.r2.cloudflarestorage.com",
        // blob: — hls.js attaches via MSE, setting video.src to a blob: URL.
        // cloudflarestream.com — Safari plays the HLS manifest natively (media-src).
        "media-src 'self' blob: https://davidedigerdesign.in https://*.r2.dev https://*.r2.cloudflarestorage.com https://customer-svfce6is3mlvvekf.cloudflarestream.com",
        // Montserrat is self-hosted (public/fonts); icons are inline SVG — no
        // third-party font or style origins remain.
        "font-src 'self'",
        // cloudflarestream.com — the showreel modal embeds the Stream iframe player.
        // challenges.cloudflare.com — Turnstile renders its widget in an iframe.
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://customer-svfce6is3mlvvekf.cloudflarestream.com https://challenges.cloudflare.com",
        // cloudflarestream.com — hls.js fetches the manifest + segments via XHR.
        // cloudflareinsights.com — Web Analytics beacon POSTs RUM data to /cdn-cgi/rum.
        // The contact form now posts to our own /api/contact Pages Function,
        // which 'self' already covers — the Web3Forms origin is gone.
        "connect-src 'self' https://customer-svfce6is3mlvvekf.cloudflarestream.com https://cloudflareinsights.com",
      ],
      styleDirective: {
        resources: ["'self'"],
      },
      scriptDirective: {
        // cloudflareinsights.com — the Web Analytics beacon (beacon.min.js) is
        // an external third-party script, not hashed like the bundled islands.
        // challenges.cloudflare.com — Turnstile's api.js, same situation.
        resources: [
          "'self'",
          'https://static.cloudflareinsights.com',
          'https://challenges.cloudflare.com',
        ],
      },
    },
  },
});