// Where the app is served from (TASK-6-54, ADR-004 Decision 4). The app is pure static files and must work at "/"
// (dev server) and under a subpath (GitHub Pages: /temple-site/). Runtime URLs are therefore never root-absolute; they are
// resolved against the document base. The public build marks itself with <meta name="temple-build" content="public">
// (injected by scripts/build-site.js), so there is no extra request and no 404 at development.

/** Base URL of the page, or null outside a browser. */
export function documentBase(doc = globalThis.document) {
  try { return doc?.baseURI ?? null; } catch { return null; }
}

/**
 * Resolve a site-relative path ("data/x.json" or legacy "/data/x.json") against `base`. Returns the same-origin path
 * ("/temple/data/x.json"), or the input unchanged when there is no base.
 */
export function sitePath(path, base = documentBase()) {
  if (!base) return path;
  return new URL(String(path).replace(/^\/+/, ""), base).pathname;
}

/** Same as sitePath but keeps the query string (for links such as "?mode=preview"). */
export function siteUrl(path, base = documentBase()) {
  if (!base) return path;
  const url = new URL(String(path).replace(/^\/+/, ""), base);
  return `${url.pathname}${url.search}`;
}

/** True on the deployed public build (preview mode and the feedback endpoint are unavailable there). */
export function isPublicBuild(doc = globalThis.document) {
  try { return doc?.querySelector?.('meta[name="temple-build"]')?.getAttribute("content") === "public"; } catch { return false; }
}
