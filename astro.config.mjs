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
        "media-src 'self' https://davidedigerdesign.in https://*.r2.dev https://*.r2.cloudflarestorage.com",
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
        "connect-src 'self'",
      ],
      styleDirective: {
        resources: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      },
      scriptDirective: {
        resources: ["'self'"],
      },
    },
  },
});