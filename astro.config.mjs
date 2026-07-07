// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://davidedigerdesign.com',
  integrations: [sitemap()],

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
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://customer-svfce6is3mlvvekf.cloudflarestream.com",
        // cloudflarestream.com — hls.js fetches the manifest + segments via XHR.
        // cloudflareinsights.com — Web Analytics beacon POSTs RUM data to /cdn-cgi/rum.
        // api.web3forms.com — contact form AJAX submit (no-JS fallback is a
        // plain form POST, which CSP form-action does not restrict here).
        "connect-src 'self' https://customer-svfce6is3mlvvekf.cloudflarestream.com https://cloudflareinsights.com https://api.web3forms.com",
      ],
      styleDirective: {
        resources: ["'self'"],
      },
      scriptDirective: {
        // cloudflareinsights.com — the Web Analytics beacon (beacon.min.js) is
        // an external third-party script, not hashed like the bundled islands.
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
      },
    },
  },
});