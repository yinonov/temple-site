// Evidence record v2, challenge record v1 and decision record v1 validators.
// Contract: .planning/EXECUTION_PLAN.md §2.1, §2.3, §2.4; docs/contracts/evidence-record.md.
// Pure ESM, no I/O. Every validator returns Diagnostic[] sorted per diagnostics.js.
import { CERTAINTY_LEVELS, PUBLISHABLE_CERTAINTY_LEVELS } from "./world-schema.js";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { DIGEST_PATTERN } from "./digest.js";
import { validateEvidenceKindRules } from "./evidence-kind-rules.js";
import { SUMMARY_SUFFICIENT_SOURCE_TYPES } from "./measurement-vocabulary.js";

export {
  MEASUREMENT_QUANTITIES, MEASUREMENT_UNITS, LENGTH_UNITS, PLACEMENT_RELATIONS, USE_SCOPES,
  COMPARISON_ONLY_SOURCE_TYPES, SUMMARY_SUFFICIENT_SOURCE_TYPES
} from "./measurement-vocabulary.js";

export const EVIDENCE_SCHEMA_VERSION = 2;
export const CHALLENGE_SCHEMA_VERSION = 1;
export const DECISION_SCHEMA_VERSION = 1;

/** Record id grammar shared by every world record (§2). */
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const freezeSet = (values) => Object.freeze(new Set(values));

export const RECORD_STATUSES = freezeSet(["drafted", "withdrawn", "superseded"]);
export const CLAIM_KINDS = freezeSet([
  "event_step", "practice", "location", "role", "object", "architecture",
  "access_rule", "chronology", "sequence_order",
  // TASK-6-10: one number (measurement { … }) or one relative position (placement { … }) per record.
  "measurement", "placement"
]);
export const SOURCE_TYPES = freezeSet([
  "rabbinic_tradition", "historical_narrative", "archaeological", "scripture", "modern_scholarship",
  // TASK-6-10: prophetic_vision requires useScope "comparison_only"; modern_reconstruction is summary-capable and
  // capped at proposedCertainty "reconstructed" (src/domain/evidence-kind-rules.js).
  "prophetic_vision", "modern_reconstruction"
]);
export const LOCATOR_SCHEMES = freezeSet(["mishnah", "josephus", "page", "object", "web"]);
export const JOSEPHUS_WORKS = freezeSet(["BJ", "AJ"]);
export const EXCERPT_ROLES = freezeSet(["quotation", "translation", "summary"]);
// TASK-6-39: how the Historian accessed a source. "search_snippet" = only a search-result snippet was read (page not
// opened); such a source may carry summaries only, never a quotation.
export const ACCESS_MODES = freezeSet(["vendored_text", "page_read", "search_snippet"]);
export const SOURCE_RELATIONS = freezeSet(["supports", "contextualizes", "complicates"]);
export const RUNTIME_USES = freezeSet(["not_allowed", "preview_only"]);
export const MATCH_MODES = freezeSet(["ignore_niqqud"]);
export const GAP_RISKS = freezeSet(["low", "medium", "high"]);
export const DAY_TYPES = freezeSet(["ordinary", "festival", "yom_kippur"]);
export const DRAFTER_KINDS = freezeSet(["ai_agent", "human"]);

export const CHALLENGE_CHECKS = Object.freeze([
  "periodMixing", "translationDependence", "missingContext", "architecturalOverreach",
  "competingReadings", "wordingOverreach", "quoteVerification"
]);
export const CHECK_RESULTS = freezeSet(["pass", "concern", "fail"]);
export const RECOMMENDATIONS = freezeSet(["ready_for_human_review", "revise", "reject"]);
export const CHALLENGER_KINDS = freezeSet(["ai_agent", "human"]);

export const DECISIONS = freezeSet(["approved", "rejected", "changes_requested"]);
export const DECISION_ROLES = freezeSet(["project_owner", "historian"]);
/** Decision target kinds and the id prefix each one must carry. */
export const TARGET_KIND_PREFIXES = Object.freeze({
  evidence: "ev-",
  event: "evt-",
  location: "loc-",
  role: "role-",
  entity: "ent-",
  sequence: "seq-",
  anchor: "anc-",
  alternative_group: "altgrp-",
  access_policy: "acc-",
  // TASK-5-28: geometry is gated like every world record, so a human can approve (expert_reviewed) or veto it.
  geometry: "geo-"
});
/**
 * Challenge target kinds (TASK-5-21, STRATEGY-2026-10 §3) and the targetId rule for each: every decision target kind
 * (same prefixes) plus `day_types`, which targets a day-type definition id (e.g. "ordinary") and is not a decision
 * target kind. `evidence` challenges keep evidenceId/evidenceDigest; every other kind uses targetId/targetDigest.
 */
export const CHALLENGE_TARGET_KINDS = Object.freeze([...new Set([...Object.keys(TARGET_KIND_PREFIXES), "day_types"])]);
const CHALLENGE_TARGET_PREFIXES = TARGET_KIND_PREFIXES;
const DAY_TYPE_ID_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Source types whose supporting quotation must not be an English translation. */
const ORIGINAL_LANGUAGE_SOURCE_TYPES = new Set(["rabbinic_tradition", "historical_narrative", "scripture", "prophetic_vision"]);

/** True when value is a well-formed id, optionally carrying a required prefix. */
export function isRecordId(value, prefix = "") {
  return typeof value === "string" && ID_PATTERN.test(value) && value.startsWith(prefix) && value.length > prefix.length;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const typeName = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
const join = (base, key) => (base ? `${base}.${key}` : key);
const at = (base, index) => `${base}[${index}]`;

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= days;
}

/** Small diagnostic collector bound to one record. */
function collector(record, file) {
  const recordId = isObject(record) && typeof record.id === "string" ? record.id : null;
  const list = [];
  const add = (path, code, message, severity = "error") => {
    list.push(diagnostic({ recordId, path, code, message, severity, file }));
  };

  /** Reports FIELD_REQUIRED / TYPE_MISMATCH and returns the object or null. */
  const object = (parent, key, path, { optional = false } = {}) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return null;
    }
    if (!isObject(value)) {
      add(path, "TYPE_MISMATCH", `${path} must be an object, got ${typeName(value)}`);
      return null;
    }
    return value;
  };

  const array = (parent, key, path, { optional = false, nonEmpty = false } = {}) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return null;
    }
    if (!Array.isArray(value)) {
      add(path, "TYPE_MISMATCH", `${path} must be an array, got ${typeName(value)}`);
      return null;
    }
    if (nonEmpty && value.length === 0) add(path, "FIELD_REQUIRED", `${path} must not be empty`);
    return value;
  };

  /** Non-empty string (after trimming). */
  const string = (parent, key, path, { optional = false, allowEmpty = false } = {}) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return null;
    }
    if (typeof value !== "string") {
      add(path, "TYPE_MISMATCH", `${path} must be a string, got ${typeName(value)}`);
      return null;
    }
    if (!allowEmpty && value.trim().length === 0) {
      add(path, "FIELD_REQUIRED", `${path} must not be empty`);
      return null;
    }
    return value;
  };

  const enumValue = (parent, key, path, allowed, { optional = false } = {}) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return null;
    }
    if (!allowed.has(value)) {
      add(path, "ENUM_INVALID", `${path} must be one of ${[...allowed].join("|")}, got ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };

  const positiveInt = (parent, key, path, { optional = false } = {}) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return null;
    }
    if (!Number.isInteger(value) || value < 1) {
      add(path, "TYPE_MISMATCH", `${path} must be a positive integer, got ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };

  const id = (parent, key, path, prefix) => {
    const value = string(parent, key, path);
    if (value !== null && !isRecordId(value, prefix)) {
      add(path, "ID_FORMAT", `${path} must match ${ID_PATTERN} with prefix "${prefix}", got ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };

  const schemaVersion = (parent, expected) => {
    if (parent.schemaVersion === undefined) {
      add("schemaVersion", "FIELD_REQUIRED", "schemaVersion is required");
    } else if (parent.schemaVersion !== expected) {
      add("schemaVersion", "SCHEMA_VERSION_UNSUPPORTED",
        `schemaVersion must be ${expected}, got ${JSON.stringify(parent.schemaVersion)}`);
    }
  };

  const bilingual = (parent, key, path) => {
    const value = parent?.[key];
    if (Array.isArray(value)) {
      add(path, "TYPE_MISMATCH", `${path} must be exactly one { he, en } object, not an array`);
      return null;
    }
    const text = object(parent, key, path);
    if (!text) return null;
    string(text, "he", join(path, "he"));
    string(text, "en", join(path, "en"));
    return text;
  };

  const stringArray = (parent, key, path, options = {}) => {
    const values = array(parent, key, path, options);
    values?.forEach((value, index) => {
      if (typeof value !== "string" || value.trim().length === 0) {
        add(at(path, index), "TYPE_MISMATCH", `${at(path, index)} must be a non-empty string`);
      }
    });
    return values;
  };

  const result = () => sortDiagnostics(list);
  const count = () => list.length;

  return { add, object, array, string, enumValue, positiveInt, id, schemaVersion, bilingual, stringArray, result, count };
}

function rootNotObject(record, label, file) {
  return [diagnostic({ recordId: null, path: "", code: "TYPE_MISMATCH", message: `${label} must be an object, got ${typeName(record)}`, file })];
}

function catalogIds(catalog) {
  const sources = Array.isArray(catalog) ? catalog : catalog?.sources;
  return new Set(Array.isArray(sources) ? sources.map((source) => source?.id) : []);
}

function validateTextRef(c, textRef, path) {
  if (!textRef) return;
  c.string(textRef, "textId", join(path, "textId"));
  c.string(textRef, "segment", join(path, "segment"));
}

function validateMishnahLocator(c, locator, path) {
  c.string(locator, "tractate", join(path, "tractate"));
  c.positiveInt(locator, "chapter", join(path, "chapter"));
  c.positiveInt(locator, "unit", join(path, "unit"));
}

function validateJosephusLocator(c, locator, path) {
  c.enumValue(locator, "work", join(path, "work"), JOSEPHUS_WORKS);
  c.positiveInt(locator, "book", join(path, "book"));
  const section = c.positiveInt(locator, "section", join(path, "section"));
  const sectionEnd = c.positiveInt(locator, "sectionEnd", join(path, "sectionEnd"), { optional: true });
  if (section !== null && sectionEnd !== null && sectionEnd <= section) {
    c.add(join(path, "sectionEnd"), "TYPE_MISMATCH", `${join(path, "sectionEnd")} must be greater than section`);
  }
  c.enumValue(locator, "numbering", join(path, "numbering"), new Set(["niese"]));
}

/**
 * Does the locator agree with textRef.segment? Only called when both are well-formed.
 * Mishnah: segment === "chapter:unit". Josephus original-language text: segment ===
 * "book.section". Josephus English (chunked) text: segment must be "book.start" with the
 * same book and start <= section; full chunk coverage is checked by quote verification.
 */
function checkLocatorTextRef(c, source, path) {
  const { locator, textRef } = source;
  const segment = textRef.segment;
  const segmentPath = join(path, "textRef.segment");
  if (locator.scheme === "mishnah") {
    const expected = `${locator.chapter}:${locator.unit}`;
    if (segment !== expected) {
      c.add(segmentPath, "LOCATOR_TEXTREF_MISMATCH", `${segmentPath} must be "${expected}" to match the locator, got "${segment}"`);
    }
  } else if (locator.scheme === "josephus") {
    if (source.language === "en") {
      const match = /^(\d+)\.(\d+)$/.exec(segment);
      if (!match || Number(match[1]) !== locator.book || Number(match[2]) > locator.section) {
        c.add(segmentPath, "LOCATOR_TEXTREF_MISMATCH",
          `${segmentPath} must be an English chunk "${locator.book}.<start>" starting at or before section ${locator.section}, got "${segment}"`);
      }
    } else {
      const expected = `${locator.book}.${locator.section}`;
      if (segment !== expected) {
        c.add(segmentPath, "LOCATOR_TEXTREF_MISMATCH", `${segmentPath} must be "${expected}" to match the locator, got "${segment}"`);
      }
    }
  }
  const parts = typeof textRef.textId === "string" ? textRef.textId.split(".") : [];
  if (parts.length >= 3 && typeof source.language === "string" && parts[1] !== source.language) {
    c.add(join(path, "language"), "LOCATOR_TEXTREF_MISMATCH",
      `${join(path, "language")} "${source.language}" does not match the language segment of textRef.textId "${textRef.textId}"`);
  }
}

function validateSource(c, source, path, sourceIds) {
  if (!isObject(source)) {
    c.add(path, "TYPE_MISMATCH", `${path} must be an object, got ${typeName(source)}`);
    return false;
  }
  const catalogSourceId = c.string(source, "catalogSourceId", join(path, "catalogSourceId"));
  if (catalogSourceId !== null && !sourceIds.has(catalogSourceId)) {
    c.add(join(path, "catalogSourceId"), "REF_UNKNOWN_SOURCE", `catalog source does not exist: ${catalogSourceId}`);
  }

  const locatorPath = join(path, "locator");
  const locator = c.object(source, "locator", locatorPath);
  let locatorOk = false;
  let scheme = null;
  if (locator) {
    const before = c.count();
    scheme = c.enumValue(locator, "scheme", join(locatorPath, "scheme"), LOCATOR_SCHEMES);
    if (scheme === "mishnah") validateMishnahLocator(c, locator, locatorPath);
    if (scheme === "josephus") validateJosephusLocator(c, locator, locatorPath);
    if (scheme === "page") c.string(locator, "pages", join(locatorPath, "pages"));
    if (scheme === "object") c.string(locator, "objectId", join(locatorPath, "objectId"));
    c.string(locator, "display", join(locatorPath, "display"));
    locatorOk = scheme !== null && c.count() === before;
  }

  const textRefPath = join(path, "textRef");
  const textualScheme = scheme === "mishnah" || scheme === "josephus";
  const textRef = c.object(source, "textRef", textRefPath, { optional: !textualScheme });
  const textRefBefore = c.count();
  validateTextRef(c, textRef, textRefPath);
  const textRefOk = textRef !== null && c.count() === textRefBefore;

  const language = c.string(source, "language", join(path, "language"));
  if (language !== null && !/^[a-z]{2,3}$/.test(language)) {
    c.add(join(path, "language"), "TYPE_MISMATCH", `${join(path, "language")} must be an ISO 639 code such as he, grc or en`);
  }
  c.string(source, "excerpt", join(path, "excerpt"));
  c.enumValue(source, "excerptRole", join(path, "excerptRole"), EXCERPT_ROLES);
  c.enumValue(source, "relation", join(path, "relation"), SOURCE_RELATIONS);
  c.enumValue(source, "matchMode", join(path, "matchMode"), MATCH_MODES, { optional: true });
  const accessMode = c.enumValue(source, "accessMode", join(path, "accessMode"), ACCESS_MODES, { optional: true });
  if (accessMode === "search_snippet" && source.excerptRole === "quotation") {
    c.add(join(path, "excerptRole"), "ENUM_INVALID",
      "a source with accessMode \"search_snippet\" may carry a summary only; a quotation needs the text itself (vendored_text or page_read)");
  }
  // Optional visitor-facing source/translator caveat; the UI renders it beside the excerpt. Either a legacy
  // string (written in English by earlier tasks) or a bilingual { he, en } object (TASK-5-07, R-04).
  const notePath = join(path, "note");
  if (isObject(source.note)) c.bilingual(source, "note", notePath);
  else c.string(source, "note", notePath, { optional: true });
  // Optional authoring instruction for agents and reviewers ("never display without …"). Never displayed.
  c.string(source, "authoringNote", join(path, "authoringNote"), { optional: true });

  if (locatorOk && textRefOk && textualScheme) checkLocatorTextRef(c, source, path);
  return true;
}

/**
 * Validate one evidence record v2 (§2.1).
 * @param {unknown} record
 * @param {{ baseline: object, catalog: object|object[], file?: string }} context
 * @returns {Array<object>} sorted diagnostics; empty when valid
 */
export function validateEvidenceRecord(record, context = {}) {
  const { baseline, catalog, file } = context;
  if (!isObject(record)) return rootNotObject(record, "evidence record", file);
  const c = collector(record, file);

  c.schemaVersion(record, EVIDENCE_SCHEMA_VERSION);
  c.id(record, "id", "id", "ev-");

  const baselineId = c.string(record, "baselineId", "baselineId");
  if (baselineId !== null) {
    if (!isObject(baseline) || baseline.status !== "approved") {
      c.add("baselineId", "BASELINE_MISMATCH", "no approved baseline was supplied to validate against");
    } else if (baseline.id !== baselineId) {
      c.add("baselineId", "BASELINE_MISMATCH", `baselineId "${baselineId}" is not the approved baseline "${baseline.id}"`);
    }
  }

  const status = c.enumValue(record, "recordStatus", "recordStatus", RECORD_STATUSES);
  const supersededBy = record.supersededBy ?? null;
  if (status === "superseded") {
    if (supersededBy === null) c.add("supersededBy", "FIELD_REQUIRED", "supersededBy is required when recordStatus is superseded");
    else if (!isRecordId(supersededBy, "ev-")) c.add("supersededBy", "ID_FORMAT", "supersededBy must be an ev- record id");
    else if (supersededBy === record.id) c.add("supersededBy", "ID_FORMAT", "a record cannot supersede itself");
  } else if (supersededBy !== null) {
    c.add("supersededBy", "TYPE_MISMATCH", "supersededBy must be null unless recordStatus is superseded");
  }

  c.enumValue(record, "claimKind", "claimKind", CLAIM_KINDS);
  const sourceType = c.enumValue(record, "sourceType", "sourceType", SOURCE_TYPES);
  c.bilingual(record, "claim", "claim");

  if (record.certainty === undefined || record.certainty === null) {
    c.add("certainty", "FIELD_REQUIRED", "certainty is required and must be requires_review");
  } else if (!CERTAINTY_LEVELS.has(record.certainty)) {
    c.add("certainty", "ENUM_INVALID", `certainty must be requires_review, got ${JSON.stringify(record.certainty)}`);
  } else if (record.certainty !== "requires_review") {
    c.add("certainty", "CERTAINTY_SELF_PROMOTED",
      `an evidence record may not assert certainty "${record.certainty}"; only a human decision record grants certainty`);
  }
  c.enumValue(record, "proposedCertainty", "proposedCertainty", PUBLISHABLE_CERTAINTY_LEVELS);

  const sources = c.array(record, "sources", "sources", { nonEmpty: true });
  if (sources) {
    const sourceIds = catalogIds(catalog);
    let hasOriginalQuotation = false;
    sources.forEach((source, index) => {
      if (!validateSource(c, source, at("sources", index), sourceIds)) return;
      const original = !ORIGINAL_LANGUAGE_SOURCE_TYPES.has(sourceType) || source.language !== "en";
      if (source.relation === "supports" && source.excerptRole === "quotation" && original) hasOriginalQuotation = true;
      // TASK-6-10: modern reconstructions may be supported by an attributed summary alone (any language).
      if (source.relation === "supports" && SUMMARY_SUFFICIENT_SOURCE_TYPES.has(sourceType)) hasOriginalQuotation = true;
    });
    if (sources.length > 0 && !hasOriginalQuotation) {
      c.add("sources", "FIELD_REQUIRED", SUMMARY_SUFFICIENT_SOURCE_TYPES.has(sourceType)
        ? "sources must include at least one relation \"supports\" source"
        : "sources must include at least one relation \"supports\" source with excerptRole \"quotation\" in the original language");
    }
  }

  const interpretation = c.object(record, "interpretation", "interpretation");
  if (interpretation) {
    c.string(interpretation, "inference", "interpretation.inference");
    c.stringArray(interpretation, "notStatedBySource", "interpretation.notStatedBySource");
  }

  const period = c.object(record, "period", "period");
  if (period) {
    c.string(period, "sourceDate", "period.sourceDate");
    c.string(period, "describedPeriod", "period.describedPeriod");
    c.enumValue(period, "gapRisk", "period.gapRisk", GAP_RISKS);
    c.string(period, "note", "period.note", { optional: true, allowEmpty: true });
  }

  const variants = c.array(record, "textualVariants", "textualVariants", { optional: true });
  variants?.forEach((variant, index) => {
    const path = at("textualVariants", index);
    if (!isObject(variant)) {
      c.add(path, "TYPE_MISMATCH", `${path} must be an object, got ${typeName(variant)}`);
      return;
    }
    validateTextRef(c, c.object(variant, "textRef", join(path, "textRef")), join(path, "textRef"));
    c.string(variant, "reading", join(path, "reading"));
    c.string(variant, "effect", join(path, "effect"));
  });

  const groups = c.array(record, "alternativeGroupIds", "alternativeGroupIds", { optional: true });
  groups?.forEach((groupId, index) => {
    if (!isRecordId(groupId, "altgrp-")) {
      c.add(at("alternativeGroupIds", index), "ID_FORMAT", `${at("alternativeGroupIds", index)} must be an altgrp- id`);
    }
  });

  const scope = c.object(record, "scope", "scope");
  if (scope) {
    const dayTypes = c.array(scope, "dayTypes", "scope.dayTypes", { optional: true, nonEmpty: true });
    dayTypes?.forEach((dayType, index) => {
      if (!DAY_TYPES.has(dayType)) {
        c.add(at("scope.dayTypes", index), "ENUM_INVALID", `${at("scope.dayTypes", index)} must be one of ${[...DAY_TYPES].join("|")}`);
      }
    });
  }

  const provenance = c.object(record, "provenance", "provenance");
  if (provenance) {
    const drafter = c.object(provenance, "draftedBy", "provenance.draftedBy");
    if (drafter) {
      c.enumValue(drafter, "kind", "provenance.draftedBy.kind", DRAFTER_KINDS);
      c.string(drafter, "role", "provenance.draftedBy.role");
      c.string(drafter, "taskId", "provenance.draftedBy.taskId", { optional: true });
    }
    if (provenance.draftedAt === undefined) c.add("provenance.draftedAt", "FIELD_REQUIRED", "provenance.draftedAt is required");
    else if (!isIsoDate(provenance.draftedAt)) c.add("provenance.draftedAt", "TYPE_MISMATCH", "provenance.draftedAt must be a YYYY-MM-DD date");
  }

  if (record.runtimeUse === "published") {
    c.add("runtimeUse", "ENUM_INVALID", "runtimeUse \"published\" is derived from a human decision and must never be written");
  } else {
    c.enumValue(record, "runtimeUse", "runtimeUse", RUNTIME_USES);
  }

  // Measurement/placement claims, prophetic_vision useScope, modern_reconstruction cap, web locators (TASK-6-10).
  return sortDiagnostics([...c.result(), ...validateEvidenceKindRules(record, { file })]);
}

function lookupEvidence(evidenceById, id) {
  if (evidenceById instanceof Map) return evidenceById.get(id);
  if (isObject(evidenceById) && Object.hasOwn(evidenceById, id)) return evidenceById[id];
  return undefined;
}

/**
 * Validate one Skeptic challenge record v1 (§2.3). A challenge is not invalidated by a
 * stale evidenceDigest/targetDigest; deriveLifecycle / deriveRecordLifecycle report staleness instead.
 *
 * `targetKind` (optional, default "evidence"; TASK-5-21) is one of CHALLENGE_TARGET_KINDS. An evidence challenge
 * names its record with evidenceId/evidenceDigest; any other kind with targetId/targetDigest. Independence: the
 * challenger's reviewer.taskId must differ from the target's provenance.draftedBy/revisedBy taskId; a world record
 * without provenance task ids requires a non-empty reviewer.independentOfTaskIds.
 * @param {unknown} challenge
 * @param {{ evidenceById: Map<string, object>|Record<string, object>,
 *           recordsByKind?: Record<string, Map<string, object>|Record<string, object>>, file?: string }} context
 *   `recordsByKind[kind]`, when supplied, is used to resolve a world-record target (REF_UNKNOWN_TARGET when absent)
 *   and its provenance; without it the target is not resolved and only its id format is checked.
 */
export function validateChallengeRecord(challenge, context = {}) {
  const { evidenceById, recordsByKind, file } = context;
  if (!isObject(challenge)) return rootNotObject(challenge, "challenge record", file);
  const c = collector(challenge, file);

  c.schemaVersion(challenge, CHALLENGE_SCHEMA_VERSION);
  c.id(challenge, "id", "id", "ch-");
  let targetKind = "evidence";
  if (challenge.targetKind !== undefined) {
    targetKind = c.enumValue(challenge, "targetKind", "targetKind", new Set(CHALLENGE_TARGET_KINDS));
  }
  let target;
  let targetKnown = false;
  if (targetKind === "evidence") {
    const evidenceId = c.id(challenge, "evidenceId", "evidenceId", "ev-");
    target = evidenceId === null ? undefined : lookupEvidence(evidenceById, evidenceId);
    if (evidenceId !== null && target === undefined) {
      c.add("evidenceId", "REF_UNKNOWN_EVIDENCE", `evidence record does not exist: ${evidenceId}`);
    }
    targetKnown = target !== undefined;
    const digest = c.string(challenge, "evidenceDigest", "evidenceDigest");
    if (digest !== null && !DIGEST_PATTERN.test(digest)) {
      c.add("evidenceDigest", "TYPE_MISMATCH", "evidenceDigest must look like sha256:<64 lowercase hex>");
    }
  } else if (targetKind !== null) {
    for (const key of ["evidenceId", "evidenceDigest"]) {
      if (challenge[key] !== undefined) c.add(key, "TYPE_MISMATCH", `${key} is only for evidence challenges; a ${targetKind} challenge uses targetId/targetDigest`);
    }
    const targetId = targetKind === "day_types" ? c.string(challenge, "targetId", "targetId") : c.id(challenge, "targetId", "targetId", CHALLENGE_TARGET_PREFIXES[targetKind]);
    if (targetKind === "day_types" && targetId !== null && !DAY_TYPE_ID_PATTERN.test(targetId)) {
      c.add("targetId", "ID_FORMAT", `targetId must be a day-type id such as "ordinary", got ${JSON.stringify(targetId)}`);
    }
    const lookup = isObject(recordsByKind) ? recordsByKind[targetKind] : undefined;
    if (targetId !== null && lookup !== undefined && lookup !== null) {
      target = lookupEvidence(lookup, targetId);
      targetKnown = target !== undefined;
      if (!targetKnown) c.add("targetId", "REF_UNKNOWN_TARGET", `${targetKind} record does not exist: ${targetId}`);
    }
    const digest = c.string(challenge, "targetDigest", "targetDigest");
    if (digest !== null && !DIGEST_PATTERN.test(digest)) {
      c.add("targetDigest", "TYPE_MISMATCH", "targetDigest must look like sha256:<64 lowercase hex>");
    }
  }

  const reviewer = c.object(challenge, "reviewer", "reviewer");
  if (reviewer) {
    c.enumValue(reviewer, "kind", "reviewer.kind", CHALLENGER_KINDS);
    c.string(reviewer, "role", "reviewer.role");
    const taskId = c.string(reviewer, "taskId", "reviewer.taskId", { optional: true });
    const independentOf = c.stringArray(reviewer, "independentOfTaskIds", "reviewer.independentOfTaskIds", { optional: true }) ?? [];
    const provenanceTaskIds = [target?.provenance?.draftedBy?.taskId, target?.provenance?.revisedBy?.taskId].filter((id) => typeof id === "string");
    if (taskId !== null && (provenanceTaskIds.includes(taskId) || independentOf.includes(taskId))) {
      c.add("reviewer.taskId", "CHALLENGE_NOT_INDEPENDENT",
        `challenge task ${taskId} is a task that drafted or revised the ${targetKind ?? "record"}; a challenge must come from an independent task`);
    }
    if (targetKind !== "evidence" && targetKind !== null && targetKnown && provenanceTaskIds.length === 0 && independentOf.length === 0) {
      c.add("reviewer.independentOfTaskIds", "CHALLENGE_NOT_INDEPENDENT",
        `the ${targetKind} record has no provenance task ids, so the challenge must name the drafting task(s) in reviewer.independentOfTaskIds`);
    }
  }

  const checks = c.object(challenge, "checks", "checks");
  if (checks) {
    for (const name of CHALLENGE_CHECKS) {
      const path = join("checks", name);
      const check = c.object(checks, name, path);
      if (!check) continue;
      c.enumValue(check, "result", join(path, "result"), CHECK_RESULTS);
      c.string(check, "note", join(path, "note"), { allowEmpty: true });
    }
  }

  const recommendation = c.enumValue(challenge, "recommendation", "recommendation", RECOMMENDATIONS);
  const maxCertainty = challenge.recommendedMaxCertainty ?? null;
  if (maxCertainty === null) {
    if (recommendation !== null && recommendation !== "reject") {
      c.add("recommendedMaxCertainty", "FIELD_REQUIRED", "recommendedMaxCertainty is required unless the recommendation is reject");
    }
  } else if (!PUBLISHABLE_CERTAINTY_LEVELS.has(maxCertainty)) {
    c.add("recommendedMaxCertainty", "CERTAINTY_UNPUBLISHABLE", "recommendedMaxCertainty must be a publishable certainty level");
  }
  c.array(challenge, "requiredWordingChanges", "requiredWordingChanges");
  c.array(challenge, "openQuestionsForHuman", "openQuestionsForHuman");
  return c.result();
}

/**
 * Validate one human decision record v1 (§2.4).
 * @param {unknown} decision
 * @param {{ allowSynthetic?: boolean, baseline?: object, file?: string }} context
 *   When `baseline` is given, baselineId must equal its id.
 */
export function validateDecisionRecord(decision, context = {}) {
  const { allowSynthetic = false, baseline, file } = context;
  if (!isObject(decision)) return rootNotObject(decision, "decision record", file);
  const c = collector(decision, file);

  c.schemaVersion(decision, DECISION_SCHEMA_VERSION);
  c.id(decision, "id", "id", "dec-");
  const baselineId = c.string(decision, "baselineId", "baselineId");
  if (baselineId !== null && baseline !== undefined && (!isObject(baseline) || baseline.id !== baselineId || baseline.status !== "approved")) {
    c.add("baselineId", "BASELINE_MISMATCH", `baselineId "${baselineId}" is not the approved baseline`);
  }

  const verdict = c.enumValue(decision, "decision", "decision", DECISIONS);
  const targetIds = new Set();
  const evidenceTargetIds = [];
  const targets = c.array(decision, "targets", "targets", { nonEmpty: true });
  targets?.forEach((target, index) => {
    const path = at("targets", index);
    if (!isObject(target)) {
      c.add(path, "TYPE_MISMATCH", `${path} must be an object, got ${typeName(target)}`);
      return;
    }
    const kind = c.enumValue(target, "kind", join(path, "kind"), new Set(Object.keys(TARGET_KIND_PREFIXES)));
    const id = kind === null ? c.string(target, "id", join(path, "id")) : c.id(target, "id", join(path, "id"), TARGET_KIND_PREFIXES[kind]);
    if (id !== null) {
      if (targetIds.has(id)) c.add(join(path, "id"), "ID_DUPLICATE", `target ${id} is listed more than once`);
      targetIds.add(id);
      if (kind === "evidence") evidenceTargetIds.push(id);
    }
    const digest = c.string(target, "digest", join(path, "digest"));
    if (digest !== null && !DIGEST_PATTERN.test(digest)) {
      c.add(join(path, "digest"), "TYPE_MISMATCH", `${join(path, "digest")} must look like sha256:<64 lowercase hex>`);
    }
  });

  const granted = c.object(decision, "grantedCertainty", "grantedCertainty", { optional: verdict !== "approved" }) ?? {};
  for (const [targetId, level] of Object.entries(granted)) {
    const path = join("grantedCertainty", targetId);
    if (!targetIds.has(targetId)) c.add(path, "REF_UNKNOWN_EVIDENCE", `grantedCertainty names ${targetId}, which is not a target`);
    if (level === "requires_review") c.add(path, "CERTAINTY_UNPUBLISHABLE", "requires_review cannot be granted");
    else if (!PUBLISHABLE_CERTAINTY_LEVELS.has(level)) c.add(path, "ENUM_INVALID", `${path} must be a publishable certainty level`);
  }
  if (verdict === "approved") {
    for (const evidenceId of evidenceTargetIds) {
      if (!Object.hasOwn(granted, evidenceId)) {
        c.add(join("grantedCertainty", evidenceId), "FIELD_REQUIRED", `an approval must grant a certainty level to ${evidenceId}`);
      }
    }
  } else if (verdict !== null && Object.keys(granted).length > 0) {
    c.add("grantedCertainty", "TYPE_MISMATCH", `grantedCertainty must be empty when the decision is ${verdict}`);
  }

  const defaults = c.object(decision, "alternativeDefaults", "alternativeDefaults", { optional: true });
  for (const [groupId, optionId] of Object.entries(defaults ?? {})) {
    const path = join("alternativeDefaults", groupId);
    if (!isRecordId(groupId, "altgrp-")) c.add(path, "ID_FORMAT", `${groupId} must be an altgrp- id`);
    if (optionId !== null && !isRecordId(optionId, "alt-")) c.add(path, "ID_FORMAT", `${path} must be null or an alt- id`);
  }

  const reviewer = c.object(decision, "reviewer", "reviewer");
  if (reviewer) {
    const syntheticOk = allowSynthetic && reviewer.kind === "synthetic_test_fixture";
    if (reviewer.kind !== "human" && !syntheticOk) {
      c.add("reviewer.kind", "DECISION_NOT_HUMAN", `decision reviewer.kind must be "human", got ${JSON.stringify(reviewer.kind)}`);
    }
    c.string(reviewer, "name", "reviewer.name");
    c.enumValue(reviewer, "role", "reviewer.role", DECISION_ROLES);
  }

  if (decision.decidedAt === undefined) c.add("decidedAt", "FIELD_REQUIRED", "decidedAt is required");
  else if (!isIsoDate(decision.decidedAt)) c.add("decidedAt", "TYPE_MISMATCH", "decidedAt must be a YYYY-MM-DD date");
  c.string(decision, "notes", "notes", { optional: true, allowEmpty: true });
  return c.result();
}
