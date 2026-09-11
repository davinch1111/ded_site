// Keep the Cloudflare preview hosts out of search results.
//
// This has to be a Function, not a `_headers` rule: `_headers` matches on
// PATH only and applies to every hostname serving the project, so it cannot
// distinguish ded-site.pages.dev from the production custom domain. Matching
// on the Host header is the only way to scope the header to previews.
//
// Anything on *.pages.dev (the project host plus per-deploy preview hosts)
// gets X-Robots-Tag: noindex, nofollow. The production custom domain is left
// untouched and stays fully indexable.

export const onRequest: PagesFunction = async ({ request, next }) => {
  const response = await next();
  const host = new URL(request.url).hostname;

  if (host.endsWith('.pages.dev')) {
    // Clone before mutating: a response served straight from the static
    // asset store can have immutable headers.
    const patched = new Response(response.body, response);
    patched.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return patched;
  }

  return response;
};
