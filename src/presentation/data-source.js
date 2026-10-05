// Browser data loader (EXECUTION_PLAN.md D5). No domain logic here.
//
// Published mode (default) fetches exactly one data file: the published runtime bundle data/published/world.json
// (TASK-5-07, release review R-02), which by construction holds only publishable records. No requires_review record,
// challenge or full text is requested by a published page.
// Preview mode fetches data/manifest.json and every file it lists, and builds the same raw shape
// scripts/lib/read-world.js produces (collection files in `raw.world`, a record→file Map).
//
// Alternative data root (`?manifest=`): accepted only for same-origin paths under /test/fixtures/. A path under
// /test/fixtures/synthetic/ may be a single-file "world bundle" ({ raw, texts }) and is the only case where
// allowSynthetic is true. Any other value is rejected with an error state; it never falls back silently.

import { sitePath } from "./site.js";

// URLs below are root-relative site paths; loadWorldData({ baseUrl }) resolves every request against the document
// base, so the same code works at "/" and under a subpath such as /temple/.
export const DEFAULT_MANIFEST = "/data/manifest.json";
export const PUBLISHED_BUNDLE = "/data/published/world.json";
const FIXTURE_ROOT = "/test/fixtures/";
const SYNTHETIC_ROOT = "/test/fixtures/synthetic/";

export class DataLoadError extends Error {
  constructor(kind, { file = null, status = null, cause = null } = {}) {
    super(`${kind}${file ? `: ${file}` : ""}`);
    this.name = "DataLoadError";
    this.kind = kind; // "fetch" | "json" | "manifest" | "manifest_rejected"
    this.file = file;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

/**
 * Resolve the manifest location from a URL search string.
 * @returns {{ ok: true, path: string, allowSynthetic: boolean, custom: boolean } | { ok: false, reason: string, value: string }}
 */
export function resolveManifest(search, origin = "http://localhost", mode = "preview") {
  const params = new URLSearchParams(search ?? "");
  if (!params.has("manifest")) {
    return mode === "published"
      ? { ok: true, path: PUBLISHED_BUNDLE, allowSynthetic: false, custom: false, publishedBundle: true }
      : { ok: true, path: DEFAULT_MANIFEST, allowSynthetic: false, custom: false };
  }
  const value = params.get("manifest") ?? "";
  let url;
  try {
    url = new URL(value, origin);
  } catch {
    return { ok: false, reason: "invalid", value };
  }
  const path = url.pathname;
  if (url.origin !== new URL(origin).origin || !value.startsWith("/") || value.startsWith("//")) return { ok: false, reason: "cross_origin", value };
  if (path.includes("..") || /%2e/i.test(value) || !path.startsWith(FIXTURE_ROOT) || !path.endsWith(".json")) return { ok: false, reason: "outside_fixtures", value };
  return { ok: true, path, allowSynthetic: path.startsWith(SYNTHETIC_ROOT), custom: true };
}

async function fetchJson(fetchImpl, path) {
  let response;
  try {
    response = await fetchImpl(path, { cache: "no-cache" });
  } catch (cause) {
    throw new DataLoadError("fetch", { file: path, cause });
  }
  if (!response.ok) throw new DataLoadError("fetch", { file: path, status: response.status });
  try {
    return await response.json();
  } catch (cause) {
    throw new DataLoadError("json", { file: path, cause });
  }
}

const asPath = (file) => (file.startsWith("/") ? file : `/${file}`);
const relative = (file) => file.replace(/^\/+/, "");

export const FETCH_CONCURRENCY = 24;

/** Runs at most `max` async tasks at a time, in call order. */
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; next(); });
  };
  return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

/** Build the read-world-shaped raw object from a manifest. Missing optional lists are fine. */
export async function loadFromManifest(manifest, fetchImpl, { base = "/", policyFallback = false } = {}) {
  const files = manifest?.files;
  if (!files || typeof files !== "object") throw new DataLoadError("manifest", { file: "manifest.files" });
  const resolve = (file) => asPath(base === "/" ? file : `${base.replace(/\/$/, "")}/${relative(file)}`);
  const fileMap = new Map();
  // Preview mode loads every record file (well over a thousand); unbounded parallel fetches exhaust the browser's request
  // pool (net::ERR_INSUFFICIENT_RESOURCES), so at most FETCH_CONCURRENCY requests are in flight at once.
  const limit = createLimiter(FETCH_CONCURRENCY);
  const get = async (file) => {
    const value = await limit(() => fetchJson(fetchImpl, resolve(file)));
    if (value !== null && typeof value === "object") fileMap.set(value, relative(file));
    return value;
  };
  const list = (value) => (Array.isArray(value) ? value : []);
  const all = (paths) => Promise.all(list(paths).map(get));

  const worldFiles = files.world && typeof files.world === "object" ? Object.values(files.world) : [];
  const [baseline, catalog, evidence, alternatives, challenges, decisions, world, events, textList] = await Promise.all([
    files.baseline ? get(files.baseline) : null,
    files.catalog ? get(files.catalog) : null,
    all(files.evidence), all(files.alternatives), all(files.challenges), all(files.decisions),
    all(worldFiles), all(files.events), all(files.texts)
  ]);
  const texts = {};
  for (const text of textList) if (text && typeof text.textId === "string") texts[text.textId] = text;
  const raw = { manifest, baseline, catalog, ontology: null, evidence, alternatives, challenges, decisions, world, events, texts };
  // TASK-5-24: the publication policy, so preview tiers match the published bundle. importWorld reads raw.policy
  // (validated there; an invalid file falls back to human_decision). Omitted when there is none.
  const policy = await loadPolicy(files, fetchImpl, resolve, fileMap, policyFallback);
  if (policy !== undefined) raw.policy = policy;
  return { raw, files: fileMap, texts };
}

export const DEFAULT_POLICY = "/data/policy.json";

/**
 * The policy file: `files.policy` when the manifest lists it (a failure is a load error, like any listed file);
 * otherwise `/data/policy.json` for the default manifest only, where a missing file (404) is tolerated.
 * @returns {Promise<object|undefined>}
 */
async function loadPolicy(files, fetchImpl, resolve, fileMap, policyFallback) {
  if (typeof files.policy === "string") {
    const value = await fetchJson(fetchImpl, resolve(files.policy));
    if (value !== null && typeof value === "object") fileMap.set(value, relative(files.policy));
    return value;
  }
  if (!policyFallback) return undefined;
  let response;
  try {
    response = await fetchImpl(DEFAULT_POLICY, { cache: "no-cache" });
  } catch (cause) {
    throw new DataLoadError("fetch", { file: DEFAULT_POLICY, cause });
  }
  if (response.status === 404) return undefined;
  if (!response.ok) throw new DataLoadError("fetch", { file: DEFAULT_POLICY, status: response.status });
  let value;
  try { value = await response.json(); } catch (cause) { throw new DataLoadError("json", { file: DEFAULT_POLICY, cause }); }
  if (value !== null && typeof value === "object") fileMap.set(value, relative(DEFAULT_POLICY));
  return value;
}

/**
 * Load everything the app needs. Resolves to { raw, files, texts, allowSynthetic, source } or throws DataLoadError.
 * @param {{ search?: string, origin?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function loadWorldData({ search = "", origin = "http://localhost", fetchImpl: rawFetch = globalThis.fetch?.bind(globalThis), mode = "preview", baseUrl = null } = {}) {
  const fetchImpl = baseUrl ? (path, options) => rawFetch(sitePath(path, baseUrl), options) : rawFetch;
  const resolved = resolveManifest(search, origin, mode);
  if (!resolved.ok) throw new DataLoadError("manifest_rejected", { file: resolved.value });
  const manifest = await fetchJson(fetchImpl, resolved.path);
  // Single-file world bundle: the published runtime bundle, or a synthetic fixture.
  if (manifest && typeof manifest === "object" && manifest.raw && typeof manifest.raw === "object") {
    if (!resolved.allowSynthetic && !resolved.publishedBundle) throw new DataLoadError("manifest_rejected", { file: resolved.path });
    if (resolved.publishedBundle && manifest.schemaVersion !== 1) throw new DataLoadError("manifest", { file: resolved.path });
    const texts = manifest.texts && typeof manifest.texts === "object" ? manifest.texts : {};
    const stats = manifest.stats && typeof manifest.stats === "object" ? manifest.stats : null;
    const publicOmissions = resolved.publishedBundle && manifest.publicOmissions && typeof manifest.publicOmissions === "object" ? manifest.publicOmissions : null;
    return { raw: manifest.raw, files: null, texts, stats, publicOmissions, allowSynthetic: resolved.allowSynthetic, source: resolved.path };
  }
  if (resolved.publishedBundle) throw new DataLoadError("manifest", { file: resolved.path });
  const loaded = await loadFromManifest(manifest, fetchImpl, { policyFallback: resolved.path === DEFAULT_MANIFEST });
  return { ...loaded, allowSynthetic: resolved.allowSynthetic, source: resolved.path };
}
