// Published runtime bundle (TASK-5-07, release review R-02). Pure ESM: no I/O, no Date, no randomness.
//
//   buildPublishedBundle(raw, { texts, files, allowSynthetic, policy }) → bundle
//
// Runs importWorld(mode "published") over the full data and keeps only what the published world needs: the
// baseline, the catalog entries cited by published evidence, the published evidence and world records (as their
// original, un-annotated records), the challenges and decisions backing them, and only the vendored text segments
// that published evidence cites. Nothing that failed the publishability gate — no requires_review record, no
// unapproved record, no day-type definitions that did not pass the gate — can enter the bundle.
//
// The bundle is self-verifying: it is re-imported in published mode and must reproduce the same published world;
// otherwise buildPublishedBundle throws. The browser loads it in published mode with
//   importWorld(bundle.raw, { mode: "published", texts: bundle.texts })
// and takes the pending counts from bundle.stats (contract: docs/contracts/world-data.md).
//
// Publication policy (TASK-5-21): the bundle carries the policy it was built under as `raw.policy`
// ({ schemaVersion: 1, publication }) and `publicationPolicy`, so the browser's re-import (which passes no policy
// option) applies the same gate and reproduces the same tiers.
import { importWorld, rawFromReadWorld, WORLD_COLLECTIONS } from "./importer.js";
import { validateDecisionRecord } from "./evidence-schema.js";
import { POLICY_SCHEMA_VERSION } from "./policy.js";

export const PUBLISHED_BUNDLE_SCHEMA_VERSION = 1;
export const PUBLISHED_BUNDLE_PATH = "data/published/world.json";
export const PUBLISHED_BUNDLE_GENERATED_FROM = "importWorld published";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const sortById = (list) => [...list].sort((left, right) => byText(left.id, right.id));
const isReadWorldShape = (raw) => isObject(raw) && (raw.world !== undefined || raw.ontology !== undefined) && raw.locations === undefined;

/** Keys of the world that a re-import must reproduce exactly (texts and catalog are trimmed on purpose). */
const COMPARED_WORLD_KEYS = Object.freeze([
  "baselineId", "mode", "publicationPolicy", "evidence", "challenges", "decisions", "alternatives", "locations", "roles", "entities",
  "accessPolicies", "sequences", "anchors", "events", "geometry", "dayTypes"
]);

/** Every textRef an evidence record cites: sources[].textRef and textualVariants[].textRef. */
function textRefsOf(record) {
  const refs = [];
  for (const source of Array.isArray(record?.sources) ? record.sources : []) {
    if (isObject(source?.textRef)) refs.push(source.textRef);
  }
  for (const variant of Array.isArray(record?.textualVariants) ? record.textualVariants : []) {
    if (isObject(variant?.textRef)) refs.push(variant.textRef);
  }
  return refs.filter((ref) => typeof ref.textId === "string" && typeof ref.segment === "string");
}

function textOf(texts, textId) {
  if (texts instanceof Map) return texts.get(textId);
  return isObject(texts) && Object.hasOwn(texts, textId) ? texts[textId] : undefined;
}

/** Keep each cited text's metadata and only its cited segments (and their coverage entries). */
function trimTexts(evidence, texts) {
  const wanted = new Map();
  for (const record of evidence) {
    for (const ref of textRefsOf(record)) {
      if (!wanted.has(ref.textId)) wanted.set(ref.textId, new Set());
      wanted.get(ref.textId).add(ref.segment);
    }
  }
  const out = {};
  for (const textId of [...wanted.keys()].sort(byText)) {
    const text = textOf(texts, textId);
    if (!isObject(text)) continue; // the import already failed closed (TEXT_UNKNOWN); nothing to ship
    const segments = [...wanted.get(textId)].sort(byText);
    const trimmed = {};
    for (const key of Object.keys(text).sort(byText)) {
      if (key === "segments" || key === "coverage") continue;
      trimmed[key] = structuredClone(text[key]);
    }
    const pick = (map) => Object.fromEntries(segments.filter((segment) => isObject(map) && Object.hasOwn(map, segment)).map((segment) => [segment, map[segment]]));
    trimmed.segments = pick(text.segments);
    if (isObject(text.coverage)) trimmed.coverage = pick(text.coverage);
    out[textId] = trimmed;
  }
  return out;
}

function trimCatalog(catalog, evidence) {
  const cited = new Set();
  for (const record of evidence) {
    for (const source of Array.isArray(record?.sources) ? record.sources : []) {
      if (typeof source?.catalogSourceId === "string") cited.add(source.catalogSourceId);
    }
  }
  const keep = (sources) => sortById(sources.filter((source) => cited.has(source?.id))).map((source) => structuredClone(source));
  if (Array.isArray(catalog)) return keep(catalog);
  if (isObject(catalog)) return { ...structuredClone(catalog), sources: keep(Array.isArray(catalog.sources) ? catalog.sources : []) };
  return null;
}

/** Comparable JSON of the parts of a world the bundle must reproduce. */
function comparable(world) {
  return JSON.stringify(Object.fromEntries(COMPARED_WORLD_KEYS.map((key) => [key, world[key] ?? null])));
}

/**
 * Build the published runtime bundle.
 * @param {object} raw read-world.js shape or the importer's §2.6 shape
 * @param {{ texts?: object|Map|null, files?: Map<object,string>|null, allowSynthetic?: boolean, policy?: string|object }} [options]
 *   `policy` as for importWorld (default: raw.policy, else human_decision).
 * @returns {{ schemaVersion: number, generatedFrom: string, baselineId: string|null, publicationPolicy: string,
 *             stats: object, raw: object, texts: object }}
 */
export function buildPublishedBundle(raw, { texts = null, files = null, allowSynthetic = false, policy = undefined } = {}) {
  const textsIn = texts ?? (isObject(raw) && isObject(raw.texts) ? raw.texts : null);
  const full = importWorld(raw, { mode: "published", texts: textsIn, files, allowSynthetic, policy });
  const { world } = full;
  const source = isReadWorldShape(raw) ? rawFromReadWorld(raw, files).raw : (isObject(raw) ? raw : {});

  /** The original (un-annotated) records of one raw collection whose ids the published world kept. */
  const originals = (key, publishedList) => {
    const wanted = new Set(publishedList.map((record) => record.id));
    const found = new Map();
    for (const record of Array.isArray(source[key]) ? source[key] : []) {
      if (isObject(record) && wanted.has(record.id) && !found.has(record.id)) found.set(record.id, record);
    }
    return sortById([...found.values()]).map((record) => structuredClone(record));
  };

  const evidence = originals("evidence", world.evidence);
  const bundleRaw = {
    policy: { schemaVersion: POLICY_SCHEMA_VERSION, publication: world.publicationPolicy },
    baseline: isObject(source.baseline) ? structuredClone(source.baseline) : null,
    catalog: trimCatalog(source.catalog ?? null, evidence),
    evidence,
    challenges: originals("challenges", world.challenges)
  };

  // Decisions: those deciding a published record, plus every valid decision that concerns a published alternative
  // group (approved defaults are computed from all of them, not only from the group's own deciding decision).
  const publishedGroupIds = new Set(world.alternatives.map((group) => group.id));
  const decisionIds = new Set(world.decisions.map((decision) => decision.id));
  const baseline = isObject(source.baseline) ? source.baseline : undefined;
  for (const decision of Array.isArray(source.decisions) ? source.decisions : []) {
    if (!isObject(decision) || typeof decision.id !== "string" || decisionIds.has(decision.id)) continue;
    const concerns = (Array.isArray(decision.targets) ? decision.targets : []).some((target) => target?.kind === "alternative_group" && publishedGroupIds.has(target.id)) ||
      Object.keys(isObject(decision.alternativeDefaults) ? decision.alternativeDefaults : {}).some((groupId) => publishedGroupIds.has(groupId));
    if (!concerns) continue;
    const errors = validateDecisionRecord(decision, { allowSynthetic, ...(baseline ? { baseline } : {}) }).filter((item) => item.severity === "error");
    if (errors.length === 0) decisionIds.add(decision.id);
  }
  bundleRaw.decisions = originals("decisions", [...decisionIds].map((id) => ({ id })));

  for (const key of Object.keys(WORLD_COLLECTIONS)) bundleRaw[key] = originals(key, world[key]);
  // Day-type definitions travel only when they passed the gate (TASK-5-28: automated_challenge, every definition
  // challenged, cited evidence published); otherwise world.dayTypes is null in published mode.
  bundleRaw.dayTypes = world.dayTypes?.publication === "published" && isObject(source.dayTypes) ? structuredClone(source.dayTypes) : null;

  const bundleTexts = trimTexts(evidence, textsIn ?? {});
  const records = Object.fromEntries(["evidence", "challenges", "decisions", ...Object.keys(WORLD_COLLECTIONS)].map((key) => [key, bundleRaw[key].length]));
  const bundle = {
    schemaVersion: PUBLISHED_BUNDLE_SCHEMA_VERSION,
    generatedFrom: PUBLISHED_BUNDLE_GENERATED_FROM,
    baselineId: world.baselineId,
    publicationPolicy: world.publicationPolicy,
    stats: {
      evidence: structuredClone(full.stats.evidence),
      events: structuredClone(full.stats.events),
      records,
      texts: { texts: Object.keys(bundleTexts).length, segments: Object.values(bundleTexts).reduce((sum, text) => sum + Object.keys(text.segments).length, 0) }
    },
    raw: bundleRaw,
    texts: bundleTexts
  };

  const again = importWorld(bundle.raw, { mode: "published", texts: bundle.texts, allowSynthetic });
  const againErrors = again.diagnostics.filter((item) => item.severity === "error");
  if (againErrors.length > 0 || comparable(again.world) !== comparable(world)) {
    const first = againErrors[0];
    throw new Error(`published bundle does not reproduce the published world${first ? ` (${first.code} at ${first.recordId ?? "-"} ${first.path})` : ""}`);
  }
  if (again.world.events.some((event) => event.publication !== "published") || again.world.evidence.some((record) => record.publication !== "published")) {
    throw new Error("published bundle re-import yielded an unpublished record");
  }
  return bundle;
}

export const renderPublishedBundle = (bundle) => `${JSON.stringify(bundle, null, 2)}\n`;
