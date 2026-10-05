// World importer (EXECUTION_PLAN.md §2.6, D1, D4, D5, D8, D9; TASK-1-05 / TASK-2-02).
// Pure ESM: no I/O, no Date, no randomness. Turns raw parsed records into a frozen, id-sorted,
// lifecycle-annotated world for one runtime mode, plus diagnostics and stats.
//
//   importWorld(raw, { mode: "published"|"preview", allowSynthetic = false, texts = null, files = null, policy })
//   → { world, diagnostics, stats }
//
// `policy` (TASK-5-21) is "human_decision" | "automated_challenge" or a parsed data/policy.json; when omitted,
// `raw.policy` is used, and when that is absent too, "human_decision". An invalid policy file is reported and
// falls back to human_decision (fail-closed). world.publicationPolicy names the policy applied; every record is
// annotated with `tier` ("provisional" | "expert_reviewed" when published, null when preview_only).
//
// Geometry (TASK-5-28) is gated like every world record. world.dayTypes (the day-type definitions file) is present in
// preview whenever valid and in published mode only when explainDayTypesPublishability passes; it is annotated with
// `publication`, `tier` and `lifecycle: { challengeIds, publicationReasons }`.
//
// `raw` is either the §2.6 shape ({ manifest, baseline, catalog, evidence[], challenges[], decisions[],
// alternatives[], locations[], roles[], entities[], accessPolicies[], sequences[], anchors[], events[] }) or
// the shape scripts/lib/read-world.js returns (collection files in `raw.world`, legacy `raw.ontology`);
// the latter is converted by rawFromReadWorld. `files` maps record objects to repo-relative paths.
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { validateEvidenceRecord, validateChallengeRecord, validateDecisionRecord } from "./evidence-schema.js";
import { verifyExcerpts } from "./quote-verify.js";
import { SCHEMAS } from "./schemas/index.js";
import { findConflictPairs, findConflicts } from "./compatibility.js";
import { createPublicationContext, explainPublishability, explainDayTypesPublishability, DAY_TYPES_TARGET_KIND } from "./publishability.js";
import { validateDayTypes, DAY_TYPE_DEFINITIONS_KIND, DEFINED_DAY_TYPES } from "./schemas/day-types.js";
import { resolvePublicationPolicy } from "./policy.js";
import { findGeometryCycles } from "./schemas/geometry.js";

export const IMPORT_MODES = Object.freeze(["published", "preview"]);

/** raw collection key → record kind (decision target kind / SCHEMAS key). */
export const WORLD_COLLECTIONS = Object.freeze({
  locations: "location",
  roles: "role",
  entities: "entity",
  accessPolicies: "access_policy",
  sequences: "sequence",
  anchors: "anchor",
  alternatives: "alternative_group",
  events: "event",
  geometry: "geometry" // TASK-6-11: data/world/geometry.json
});

/** data/world/<name>.json holding the day-type definitions (not a record collection; TASK-5-08). */
const DAY_TYPES_FILE_BASE = "day-types";

/** data/world/<name>.json → raw collection key. */
const WORLD_FILE_COLLECTIONS = Object.freeze({
  locations: "locations", roles: "roles", entities: "entities", "access-policies": "accessPolicies",
  sequences: "sequences", anchors: "anchors", geometry: "geometry"
});
const PREFIX_COLLECTIONS = Object.freeze([
  ["loc-", "locations"], ["role-", "roles"], ["ent-", "entities"], ["acc-", "accessPolicies"],
  ["seq-", "sequences"], ["anc-", "anchors"], ["altgrp-", "alternatives"], ["evt-", "events"],
  ["geo-", "geometry"]
]);
const COLLECTION_FILE_VERSION = 1;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const containsSynthetic = (value) => typeof value === "string" && value.includes("synthetic");

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function fileLookup(files) {
  if (files instanceof Map) return (record) => files.get(record);
  return () => undefined;
}

/**
 * Convert scripts/lib/read-world.js output into the §2.6 raw shape.
 * Collection files in `world` (`{ schemaVersion, records }`) are routed by file name
 * (data/world/locations.json → locations, …) or, when the file is unknown, by each record's id prefix.
 * @param {object} readWorldRaw `raw` from readWorld()
 * @param {Map<object, string>|null} [files] `files` from readWorld()
 * @returns {{ raw: object, files: Map<object, string>, diagnostics: object[] }}
 */
export function rawFromReadWorld(readWorldRaw, files = null) {
  const source = isObject(readWorldRaw) ? readWorldRaw : {};
  const fileOf = fileLookup(files);
  const outFiles = new Map(files instanceof Map ? files : []);
  const diagnostics = [];
  const raw = {
    manifest: source.manifest ?? null,
    baseline: source.baseline ?? null,
    catalog: source.catalog ?? null,
    ontology: source.ontology ?? null,
    policy: source.policy ?? null,
    evidence: [...(Array.isArray(source.evidence) ? source.evidence : [])],
    challenges: [...(Array.isArray(source.challenges) ? source.challenges : [])],
    decisions: [...(Array.isArray(source.decisions) ? source.decisions : [])],
    alternatives: [...(Array.isArray(source.alternatives) ? source.alternatives : [])],
    locations: [], roles: [], entities: [], accessPolicies: [], sequences: [], anchors: [], geometry: [],
    events: [...(Array.isArray(source.events) ? source.events : [])],
    dayTypes: source.dayTypes ?? null
  };

  const route = (record, collection, file) => {
    let target = collection;
    if (!target) {
      const id = typeof record?.id === "string" ? record.id : "";
      target = PREFIX_COLLECTIONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null;
    }
    if (!target) {
      diagnostics.push(diagnostic({ recordId: typeof record?.id === "string" ? record.id : null, path: "id", code: "ID_FORMAT",
        message: "cannot tell which world collection this record belongs to (unknown file and id prefix)", ...(file ? { file } : {}) }));
      return;
    }
    raw[target].push(record);
    if (file && isObject(record)) outFiles.set(record, file);
  };

  if (isObject(source.world)) {
    for (const key of Object.keys(WORLD_COLLECTIONS)) {
      if (Array.isArray(source.world[key])) for (const record of source.world[key]) route(record, key, fileOf(record));
    }
    if (source.world.dayTypes !== undefined && source.world.dayTypes !== null) raw.dayTypes = source.world.dayTypes;
  } else if (Array.isArray(source.world)) {
    for (const wrapper of source.world) {
      const file = fileOf(wrapper);
      const base = typeof file === "string" ? file.split("/").pop().replace(/\.json$/, "") : null;
      const collection = base && Object.hasOwn(WORLD_FILE_COLLECTIONS, base) ? WORLD_FILE_COLLECTIONS[base] : null;
      const at = file ? { file } : {};
      if (base === DAY_TYPES_FILE_BASE || (isObject(wrapper) && wrapper.kind === DAY_TYPE_DEFINITIONS_KIND)) {
        raw.dayTypes = wrapper;
        continue;
      }
      if (!isObject(wrapper) || !Array.isArray(wrapper.records)) {
        diagnostics.push(diagnostic({ recordId: null, path: "records", code: "TYPE_MISMATCH", message: "a world collection file must be { schemaVersion, records: [] }", ...at }));
        continue;
      }
      if (wrapper.schemaVersion !== COLLECTION_FILE_VERSION) {
        diagnostics.push(diagnostic({ recordId: null, path: "schemaVersion", code: "SCHEMA_VERSION_UNSUPPORTED",
          message: `collection file schemaVersion must be ${COLLECTION_FILE_VERSION}, got ${JSON.stringify(wrapper.schemaVersion)}`, ...at }));
        continue;
      }
      for (const record of wrapper.records) route(record, collection, file);
    }
  }
  return { raw, files: outFiles, diagnostics };
}

const isReadWorldShape = (raw) => isObject(raw) && (raw.world !== undefined || raw.ontology !== undefined) && raw.locations === undefined;

/** Demo/sandbox presentation state (src/presentation/demo-state.js) must never enter the world. */
function findDemoState(node, path = "") {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findDemoState(node[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (Object.hasOwn(node, "actorCount")) return { path: path ? `${path}.actorCount` : "actorCount", why: "an actorCount field (presentation demo state)" };
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string" && (key === "id" || /Ids?$/.test(key)) && /^demo-/.test(value)) return { path: here, why: `the demo id ${JSON.stringify(value)}` };
    if (key === "PHASES") return { path: here, why: "a PHASES table (presentation demo state)" };
    const found = findDemoState(value, here);
    if (found) return found;
  }
  return null;
}

/** Every id-valued string (key `id`, `*Id`, `*Ids`, `baselineId`) containing "synthetic". */
function findSyntheticIds(node, path = "", out = []) {
  if (Array.isArray(node)) { node.forEach((item, i) => findSyntheticIds(item, `${path}[${i}]`, out)); return out; }
  if (!isObject(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    const idKey = key === "id" || /Ids?$/.test(key);
    if (idKey && containsSynthetic(value)) out.push({ path: here, value });
    else if (idKey && Array.isArray(value)) value.forEach((item, i) => { if (containsSynthetic(item)) out.push({ path: `${here}[${i}]`, value: item }); });
    findSyntheticIds(value, here, out);
  }
  return out;
}

const hasError = (list) => list.some((item) => item.severity === "error");

/** A valid day-type file with its records in DEFINED_DAY_TYPES order (input order never matters). */
function orderedDayTypes(file) {
  const copy = structuredClone(file);
  copy.records.sort((left, right) => DEFINED_DAY_TYPES.indexOf(left.id) - DEFINED_DAY_TYPES.indexOf(right.id));
  return copy;
}

/**
 * Import a world for one runtime mode.
 * @param {object} raw §2.6 raw shape or read-world.js shape
 * @param {{ mode?: "published"|"preview", allowSynthetic?: boolean, texts?: object|Map|null, files?: Map<object,string>|null,
 *           policy?: string|object|null }} [options]
 * @returns {{ world: object, diagnostics: object[], stats: object }}
 */
export function importWorld(raw, { mode = "published", allowSynthetic = false, texts = null, files = null, policy = undefined } = {}) {
  if (!IMPORT_MODES.includes(mode)) throw new TypeError(`importWorld mode must be one of ${IMPORT_MODES.join("|")}, got ${JSON.stringify(mode)}`);
  const diagnostics = [];
  let input = isObject(raw) ? raw : {};
  let fileMap = files;
  if (isReadWorldShape(input)) {
    const adapted = rawFromReadWorld(input, files);
    input = adapted.raw;
    fileMap = adapted.files;
    diagnostics.push(...adapted.diagnostics);
  }
  const fileOfRecord = fileLookup(fileMap);
  const withFile = (record) => { const file = fileOfRecord(record); return file ? { file } : {}; };
  const recordIdOf = (record) => (isObject(record) && typeof record.id === "string" ? record.id : null);

  // ---- Publication policy (TASK-5-21): option, else raw.policy, else human_decision; invalid → human_decision ----
  const policyInput = policy !== undefined ? policy : input.policy ?? null;
  const resolvedPolicy = resolvePublicationPolicy(policyInput, isObject(policyInput) ? withFile(policyInput) : {});
  diagnostics.push(...resolvedPolicy.diagnostics);
  const publicationPolicy = resolvedPolicy.publication;

  const baseline = isObject(input.baseline) ? input.baseline : null;
  const catalog = input.catalog ?? null;
  if (!baseline || baseline.status !== "approved" || typeof baseline.id !== "string") {
    diagnostics.push(diagnostic({ recordId: baseline && typeof baseline.id === "string" ? baseline.id : null, path: baseline ? "status" : "",
      code: "BASELINE_MISMATCH", message: "an approved baseline is required; nothing can be published without one", ...(baseline ? withFile(baseline) : {}) }));
  }
  if (baseline && !allowSynthetic && containsSynthetic(baseline.id)) {
    diagnostics.push(diagnostic({ recordId: baseline.id, path: "id", code: "SYNTHETIC_IN_REAL_DATA", message: `synthetic baseline ${JSON.stringify(baseline.id)} in real data`, ...withFile(baseline) }));
  }

  // Legacy ontology: report demo placeholders, never import them.
  const ontology = isObject(input.ontology) ? input.ontology : null;
  if (ontology && Array.isArray(ontology.locations)) {
    ontology.locations.forEach((location, i) => {
      const found = findDemoState(location);
      if (found) {
        diagnostics.push(diagnostic({ recordId: recordIdOf(location), path: `locations[${i}]`, code: "DEMO_STATE_IMPORT", severity: "warning",
          message: `legacy ontology contains ${found.why}; demo placeholders belong in data/sandbox/ and are not imported`, ...withFile(ontology) }));
      }
    });
  }

  // ---- Collect entries ----
  const entries = [];
  const collect = (key, kind) => {
    const value = input[key];
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
      diagnostics.push(diagnostic({ recordId: null, path: key, code: "TYPE_MISMATCH", message: `raw.${key} must be an array` }));
      return;
    }
    for (const record of value) entries.push({ kind, record, file: fileOfRecord(record), diags: [] });
  };
  collect("evidence", "evidence");
  collect("challenges", "challenge");
  collect("decisions", "decision");
  for (const [key, kind] of Object.entries(WORLD_COLLECTIONS)) collect(key, kind);
  const at = (entry) => (entry.file ? { file: entry.file } : {});
  const push = (entry, fields) => entry.diags.push(diagnostic({ recordId: recordIdOf(entry.record), ...at(entry), ...fields }));

  // ---- Duplicate ids across every record kind ----
  const byId = new Map();
  for (const entry of entries) {
    const id = recordIdOf(entry.record);
    if (id === null) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry);
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    const kinds = group.map((entry) => entry.kind).join(", ");
    for (const entry of group) push(entry, { path: "id", code: "ID_DUPLICATE", message: `id ${id} is used by ${group.length} records (${kinds})` });
  }
  const firstOf = (kind) => {
    const map = new Map();
    for (const entry of entries) if (entry.kind === kind && recordIdOf(entry.record) && !map.has(entry.record.id)) map.set(entry.record.id, entry.record);
    return map;
  };

  // ---- Reference sets (all ids, valid or not, so one bad record does not cascade) ----
  const evidenceById = firstOf("evidence");
  const entitiesById = firstOf("entity");
  const recordsByKind = Object.fromEntries(Object.values(WORLD_COLLECTIONS).map((kind) => [kind, firstOf(kind)]));
  // Day-type challenges (TASK-5-28) resolve their targetId against the definitions file when one is supplied.
  if (isObject(input.dayTypes) && Array.isArray(input.dayTypes.records)) {
    const definitions = new Map();
    for (const record of input.dayTypes.records) if (isObject(record) && typeof record.id === "string" && !definitions.has(record.id)) definitions.set(record.id, record);
    recordsByKind[DAY_TYPES_TARGET_KIND] = definitions;
  }
  const refs = {
    evidenceIds: new Set(evidenceById.keys()),
    locationIds: new Set(firstOf("location").keys()),
    roleIds: new Set(firstOf("role").keys()),
    entityIds: new Set(entitiesById.keys()),
    sequenceIds: new Set(firstOf("sequence").keys()),
    anchorIds: new Set(firstOf("anchor").keys()),
    alternativeGroupIds: new Set(firstOf("alternative_group").keys()),
    sequences: firstOf("sequence"),
    entities: entitiesById,
    // Geometry (TASK-6-11): geo- ids, evidence records (measurement/comparison checks) and groups (option coverage).
    geometryIds: new Set(firstOf("geometry").keys()),
    evidence: evidenceById,
    alternativeGroups: firstOf("alternative_group")
  };
  const eventIds = new Set(firstOf("event").keys());

  // Approved alternative defaults (fail-closed, TASK-2-07): for each group, the valid decisions that
  // concern it (target it, or name it in alternativeDefaults) are considered; only those with the latest
  // decidedAt count. The default is approved only if every one of them is an approval and every one that
  // states a default states the same option. A same-day rejection, a disagreement or no stated default
  // → null. The group's own digest is not required here (setting defaultOptionId changes it); the group
  // still needs its own current approval to be published.
  const approvedAlternativeDefaults = {};
  const validDecisions = entries
    .filter((entry) => entry.kind === "decision" && isObject(entry.record))
    .filter((entry) => !hasError(validateDecisionRecord(entry.record, { allowSynthetic, ...(baseline ? { baseline } : {}) })))
    .map((entry) => entry.record);
  const groupIds = new Set();
  for (const decision of validDecisions) {
    for (const target of decision.targets) if (target.kind === "alternative_group") groupIds.add(target.id);
    for (const groupId of Object.keys(decision.alternativeDefaults ?? {})) groupIds.add(groupId);
  }
  for (const groupId of [...groupIds].sort(byText)) {
    const concerning = validDecisions.filter((decision) =>
      decision.targets.some((target) => target.kind === "alternative_group" && target.id === groupId) ||
      Object.hasOwn(decision.alternativeDefaults ?? {}, groupId));
    const latestDay = concerning.reduce((max, decision) => (decision.decidedAt > max ? decision.decidedAt : max), "");
    const latest = concerning.filter((decision) => decision.decidedAt === latestDay);
    if (latest.some((decision) => decision.decision !== "approved")) continue;
    const stated = new Set(latest.filter((decision) => Object.hasOwn(decision.alternativeDefaults ?? {}, groupId)).map((decision) => decision.alternativeDefaults[groupId]));
    if (stated.size === 1) approvedAlternativeDefaults[groupId] = [...stated][0];
  }

  // ---- Per-record validation ----
  for (const entry of entries) {
    const { kind, record } = entry;
    const context = { ...at(entry) };
    if (kind === "evidence") {
      entry.diags.push(...validateEvidenceRecord(record, { baseline, catalog, ...context }));
      if (texts && isObject(record)) entry.diags.push(...verifyExcerpts(record, texts, context));
    } else if (kind === "challenge") {
      entry.diags.push(...validateChallengeRecord(record, { evidenceById, recordsByKind, ...context }));
    } else if (kind === "decision") {
      entry.diags.push(...validateDecisionRecord(record, { allowSynthetic, ...(baseline ? { baseline } : {}), ...context }));
    } else {
      entry.diags.push(...SCHEMAS[kind].validate(record, { refs, allowSynthetic, approvedAlternativeDefaults, ...context }));
      if (isObject(record) && Array.isArray(record.sourceIds) && !(Array.isArray(record.evidenceIds) && record.evidenceIds.length > 0)) {
        push(entry, { path: "sourceIds", code: "CATALOG_ONLY_SOURCE",
          message: "record cites catalog sources only (legacy sourceIds); a catalog entry never authorises a claim, cite evidence records" });
      }
      if (kind === "event" && isObject(record)) {
        const exceptions = Array.isArray(record.compatibility?.overlapExceptions) ? record.compatibility.overlapExceptions : [];
        exceptions.forEach((exception, i) => {
          const target = exception?.eventId;
          if (typeof target === "string" && target !== record.id && !eventIds.has(target)) {
            push(entry, { path: `compatibility.overlapExceptions[${i}].eventId`, code: "REF_UNKNOWN_EVENT", message: `overlap exception names unknown event ${JSON.stringify(target)}` });
          }
        });
      }
    }
    if (kind !== "challenge" && kind !== "decision") {
      const demo = findDemoState(record);
      if (demo) push(entry, { path: demo.path, code: "DEMO_STATE_IMPORT", message: `record contains ${demo.why}; sandbox demo state cannot be imported as world data` });
    }
    if (!allowSynthetic) {
      for (const found of findSyntheticIds(record)) {
        push(entry, { path: found.path, code: "SYNTHETIC_IN_REAL_DATA", message: `synthetic id ${JSON.stringify(found.value)} in real data (allowed only with allowSynthetic)` });
      }
    }
  }
  if (input.manifest) {
    const demo = findDemoState(input.manifest);
    if (demo) diagnostics.push(diagnostic({ recordId: null, path: demo.path, code: "DEMO_STATE_IMPORT", message: `manifest contains ${demo.why}`, ...withFile(input.manifest) }));
  }

  // ---- Day-type definitions (TASK-5-08): a project viewing vocabulary, validated in both modes ----
  const dayTypesFile = input.dayTypes ?? null;
  let dayTypesValid = false;
  if (dayTypesFile !== null) {
    const dayTypeDiags = validateDayTypes(dayTypesFile, { evidenceById, ...withFile(dayTypesFile) });
    diagnostics.push(...dayTypeDiags);
    dayTypesValid = !hasError(dayTypeDiags);
  }

  // ---- Participant compatibility among otherwise valid events ----
  const validEvents = entries.filter((entry) => entry.kind === "event" && !hasError(entry.diags));
  const eventEntry = new Map(validEvents.map((entry) => [entry.record.id, entry]));
  const conflictDiags = findConflicts(validEvents.map((entry) => entry.record), { entitiesById, file: (event) => eventEntry.get(event.id)?.file });
  for (const item of conflictDiags) eventEntry.get(item.recordId).diags.push(item);
  for (const pair of findConflictPairs(validEvents.map((entry) => entry.record))) {
    // Mark the second event invalid too, with its own diagnostic.
    const right = eventEntry.get(pair.rightId);
    const index = pair.rightEvent.participants.findIndex((participant) => participant?.entityId === pair.entityId);
    push(right, { path: `participants[${index}].entityId`, code: "PARTICIPANT_CONFLICT",
      message: `Entity ${pair.entityId} is allocated to overlapping events ${pair.leftId} and ${pair.rightId} without shared attendance or an overlap exception` });
  }

  // ---- Geometry placement graph must be acyclic (TASK-6-11) ----
  const validGeometry = entries.filter((entry) => entry.kind === "geometry" && !hasError(entry.diags));
  const geometryEntry = new Map(validGeometry.map((entry) => [entry.record.id, entry]));
  for (const item of findGeometryCycles(validGeometry.map((entry) => entry.record), { file: (record) => geometryEntry.get(record.id)?.file })) {
    geometryEntry.get(item.recordId).diags.push(item);
  }

  for (const entry of entries) diagnostics.push(...entry.diags);
  const valid = entries.filter((entry) => !hasError(entry.diags) && recordIdOf(entry.record) !== null);

  // ---- Publishability ----
  const validOf = (kind) => valid.filter((entry) => entry.kind === kind).map((entry) => entry.record);
  const records = {};
  for (const kind of Object.values(WORLD_COLLECTIONS)) records[kind] = validOf(kind);
  const ctx = createPublicationContext({
    baseline: baseline && !(containsSynthetic(baseline.id) && !allowSynthetic) ? baseline : null,
    evidence: validOf("evidence"), challenges: validOf("challenge"), decisions: validOf("decision"), records, allowSynthetic,
    texts: texts ?? null, policy: publicationPolicy
  });

  const out = { evidence: [], alternatives: [], locations: [], roles: [], entities: [], accessPolicies: [], sequences: [], anchors: [], events: [], geometry: [] };
  const collectionOfKind = { evidence: "evidence" };
  for (const [key, kind] of Object.entries(WORLD_COLLECTIONS)) collectionOfKind[kind] = key;
  const publishedKeys = new Set();
  const usedDecisionIds = new Set();
  const usedChallengeIds = new Set();
  let excludedCount = 0;
  const excludedByKind = {};
  const evidenceStats = { total: entries.filter((entry) => entry.kind === "evidence").length, challenged: 0, approved: 0, published: 0, pending: 0 };
  const eventStats = { published: 0, previewOnly: 0, excluded: entries.filter((entry) => entry.kind === "event").length - validOf("event").length };

  for (const entry of valid) {
    const { kind, record } = entry;
    if (kind === "challenge" || kind === "decision") continue;
    const explanation = explainPublishability(record, kind, ctx);
    for (const warning of explanation.warnings) diagnostics.push(diagnostic({ recordId: record.id, ...at(entry), severity: "warning", ...warning }));
    const { lifecycle } = explanation;
    if (kind === "evidence") {
      if (lifecycle.challengeIds.length > 0) evidenceStats.challenged += 1;
      if (lifecycle.state === "approved_for_scope") evidenceStats.approved += 1;
      if (explanation.publishable) evidenceStats.published += 1;
    }
    if (kind === "event") eventStats[explanation.publishable ? "published" : "previewOnly"] += 1;
    if (!explanation.publishable && mode === "published") {
      excludedCount += 1;
      excludedByKind[kind] = (excludedByKind[kind] ?? 0) + 1;
      continue;
    }
    if (explanation.publishable) {
      publishedKeys.add(`${kind}:${record.id}`);
      if (lifecycle.decisionId) usedDecisionIds.add(lifecycle.decisionId);
      for (const id of lifecycle.challengeIds) usedChallengeIds.add(id);
    }
    const annotated = {
      ...structuredClone(record),
      publication: explanation.publishable ? "published" : "preview_only",
      tier: explanation.tier ?? null,
      lifecycle: {
        state: lifecycle.state,
        digest: lifecycle.digest,
        decisionId: lifecycle.decisionId,
        grantedCertainty: lifecycle.grantedCertainty,
        challengeIds: lifecycle.challengeIds,
        publicationReasons: explanation.reasons
      },
      effectiveCertainty: explanation.publishable ? explanation.effectiveCertainty : "requires_review"
    };
    if (kind === "alternative_group") {
      annotated.approvedDefaultOptionId = Object.hasOwn(approvedAlternativeDefaults, record.id) ? approvedAlternativeDefaults[record.id] : null;
    }
    out[collectionOfKind[kind]].push(annotated);
  }
  evidenceStats.pending = evidenceStats.total - evidenceStats.published;

  // ---- Day-type definitions (TASK-5-28): display metadata, published all-or-nothing under automated_challenge ----
  let dayTypesOut = null;
  if (dayTypesValid) {
    const explanation = explainDayTypesPublishability(dayTypesFile, ctx);
    if (explanation.publishable) for (const id of explanation.challengeIds) usedChallengeIds.add(id);
    if (explanation.publishable || mode === "preview") {
      dayTypesOut = {
        ...orderedDayTypes(dayTypesFile),
        publication: explanation.publishable ? "published" : "preview_only",
        tier: explanation.tier,
        lifecycle: { challengeIds: explanation.challengeIds, publicationReasons: explanation.reasons }
      };
    }
  }

  if (mode === "published" && excludedCount > 0) {
    const parts = Object.keys(excludedByKind).sort(byText).map((kind) => `${excludedByKind[kind]} ${kind}`).join(", ");
    diagnostics.push(diagnostic({ recordId: null, path: "", code: "PUBLICATION_EXCLUDED", severity: "info",
      message: `${excludedCount} valid record(s) are not yet publishable and were left out of the published world (${parts}); see preview mode` }));
  }

  const reviewRecords = (kind, used) => valid
    .filter((entry) => entry.kind === kind && (mode === "preview" || used.has(entry.record.id)))
    .map((entry) => structuredClone(entry.record));
  const sortById = (list) => list.sort((left, right) => byText(left.id, right.id));

  const world = {
    baselineId: baseline && typeof baseline.id === "string" ? baseline.id : null,
    mode,
    publicationPolicy,
    catalog: structuredClone(Array.isArray(catalog) ? catalog : Array.isArray(catalog?.sources) ? catalog.sources : []),
    evidence: sortById(out.evidence),
    challenges: sortById(reviewRecords("challenge", usedChallengeIds)),
    decisions: sortById(reviewRecords("decision", usedDecisionIds)),
    alternatives: sortById(out.alternatives),
    locations: sortById(out.locations),
    roles: sortById(out.roles),
    entities: sortById(out.entities),
    accessPolicies: sortById(out.accessPolicies),
    sequences: sortById(out.sequences),
    anchors: sortById(out.anchors),
    events: sortById(out.events),
    geometry: sortById(out.geometry),
    // Day-type definitions: always in preview (when valid); in published mode only when they pass the gate.
    dayTypes: dayTypesOut
  };
  if (texts) world.texts = structuredClone(texts instanceof Map ? Object.fromEntries(texts) : texts);

  return {
    world: deepFreeze(world),
    diagnostics: Object.freeze(sortDiagnostics(diagnostics)),
    stats: deepFreeze({ evidence: evidenceStats, events: eventStats })
  };
}
