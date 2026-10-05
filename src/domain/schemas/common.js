// Shared building blocks for the versioned world-record validators (§2.5).
// Contract: .planning/EXECUTION_PLAN.md §2, §2.5, §2.6; docs/contracts/world-data.md.
// Pure ESM, no I/O. Every helper returns Diagnostic objects (shape from diagnostics.js).
import { diagnostic, sortDiagnostics } from "../diagnostics.js";
import { CERTAINTY_LEVELS } from "../world-schema.js";
import { DAY_TYPES, ID_PATTERN, isRecordId } from "../evidence-schema.js";

/** Record id grammar and id test are shared with the evidence schema (§2). */
export { ID_PATTERN, isRecordId };

/** Id prefix for each world-record kind (§2). */
export const ID_PREFIXES = Object.freeze({
  location: "loc-",
  role: "role-",
  entity: "ent-",
  access_policy: "acc-",
  sequence: "seq-",
  anchor: "anc-",
  alternative_group: "altgrp-",
  alternative_option: "alt-",
  event: "evt-",
  evidence: "ev-",
  geometry: "geo-"
});

/**
 * Diagnostic codes introduced by the world-record schemas (registered in diagnostics.js
 * DIAGNOSTIC_CODES; documented in docs/contracts/world-data.md).
 */
export const WORLD_SCHEMA_CODES = Object.freeze([
  "ALTERNATIVE_DEFAULT_UNAPPROVED",
  "CLOCK_TIMING_UNAPPROVED",
  "PARTICIPANT_ROLE_MISMATCH",
  // Geometry v1 (TASK-6-11)
  "REF_UNKNOWN_GEOMETRY",
  "GEOMETRY_EVIDENCE_UNSUITABLE",
  "GEOMETRY_REF_UNLISTED",
  "GEOMETRY_CYCLE"
]);

/** Day types an event may declare in `applicability.dayTypes` (shared with evidence scope). */
export const EVENT_DAY_TYPES = DAY_TYPES;

/** Build one frozen Diagnostic (thin alias of diagnostics.js `diagnostic`). */
export const worldDiagnostic = (fields) => diagnostic(fields);

export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const typeName = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
/** JSON path helpers: join("timing", "startStep") → "timing.startStep"; at("participants", 0) → "participants[0]". */
export const join = (base, key) => (base ? `${base}.${key}` : key);
export const at = (base, index) => `${base}[${index}]`;

const make = (recordId, path, code, message, file) => worldDiagnostic({ recordId, path, code, message, file });

/** Id format check (no prefix requirement). */
export function checkIdFormat(value, path, { recordId = null, file } = {}) {
  if (value === undefined || value === null) return [make(recordId, path, "FIELD_REQUIRED", `${path} is required`, file)];
  if (typeof value !== "string") return [make(recordId, path, "TYPE_MISMATCH", `${path} must be a string, got ${typeName(value)}`, file)];
  if (!ID_PATTERN.test(value)) {
    return [make(recordId, path, "ID_FORMAT", `${path} must match ${ID_PATTERN}, got ${JSON.stringify(value)}`, file)];
  }
  return [];
}

/** Id format plus required prefix check, e.g. prefix "loc-". */
export function checkPrefixedId(value, path, prefix, options = {}) {
  const format = checkIdFormat(value, path, options);
  if (format.length) return format;
  if (!isRecordId(value, prefix)) {
    return [make(options.recordId ?? null, path, "ID_FORMAT",
      `${path} must start with "${prefix}" followed by an id segment, got ${JSON.stringify(value)}`, options.file)];
  }
  return [];
}

/** Bilingual text `{ he, en }`: exactly one object with two non-empty strings. */
export function checkBilingual(value, path, { recordId = null, file } = {}) {
  if (value === undefined || value === null) return [make(recordId, path, "FIELD_REQUIRED", `${path} is required`, file)];
  if (!isObject(value)) {
    return [make(recordId, path, "TYPE_MISMATCH", `${path} must be a { he, en } object, got ${typeName(value)}`, file)];
  }
  const found = [];
  for (const language of ["he", "en"]) {
    const text = value[language];
    const subPath = join(path, language);
    if (text === undefined || text === null) found.push(make(recordId, subPath, "FIELD_REQUIRED", `${subPath} is required`, file));
    else if (typeof text !== "string") found.push(make(recordId, subPath, "TYPE_MISMATCH", `${subPath} must be a string, got ${typeName(text)}`, file));
    else if (text.trim().length === 0) found.push(make(recordId, subPath, "FIELD_REQUIRED", `${subPath} must not be empty`, file));
  }
  return found;
}

/** schemaVersion must equal the supported version. */
export function checkSchemaVersion(value, expected, { recordId = null, file, path = "schemaVersion" } = {}) {
  if (value === undefined || value === null) return [make(recordId, path, "FIELD_REQUIRED", `${path} is required`, file)];
  if (value !== expected) {
    return [make(recordId, path, "SCHEMA_VERSION_UNSUPPORTED", `${path} must be ${expected}, got ${JSON.stringify(value)}`, file)];
  }
  return [];
}

/** Enumerated value check; `allowed` is a Set or array. */
export function checkEnum(value, path, allowed, { recordId = null, file } = {}) {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  if (value === undefined || value === null) return [make(recordId, path, "FIELD_REQUIRED", `${path} is required`, file)];
  if (!set.has(value)) {
    return [make(recordId, path, "ENUM_INVALID", `${path} must be one of ${[...set].join("|")}, got ${JSON.stringify(value)}`, file)];
  }
  return [];
}

/**
 * World-record certainty: must be a CERTAINTY_LEVELS value; in non-synthetic data it
 * must be "requires_review" (an agent-proposed record can never promote itself, D1).
 */
export function checkCertainty(value, path, { recordId = null, file, allowSynthetic = false } = {}) {
  const invalid = checkEnum(value, path, CERTAINTY_LEVELS, { recordId, file });
  if (invalid.length) return invalid;
  if (!allowSynthetic && value !== "requires_review") {
    return [make(recordId, path, "CERTAINTY_SELF_PROMOTED",
      `${path} must be "requires_review"; certainty is granted only by a human decision record, got ${JSON.stringify(value)}`, file)];
  }
  return [];
}

/** Read a Set-like or Map-like reference collection; returns null when not supplied. */
function refHas(collection, id) {
  if (collection instanceof Set || collection instanceof Map) return collection.has(id);
  if (Array.isArray(collection)) return collection.includes(id);
  if (isObject(collection)) return Object.hasOwn(collection, id);
  return null;
}

/** Look up a record in a Map or plain-object index; undefined when absent. */
export function refGet(collection, id) {
  if (collection instanceof Map) return collection.get(id);
  if (isObject(collection) && Object.hasOwn(collection, id)) return collection[id];
  return undefined;
}

/**
 * Diagnostic collector bound to one record. Methods push diagnostics and return the
 * value when it is usable (or null), so validators can keep going without crashing.
 */
export function collector(record, { file, allowSynthetic = false, refs = null } = {}) {
  const recordId = isObject(record) && typeof record.id === "string" ? record.id : null;
  const list = [];
  const options = { recordId, file };
  const push = (found) => { list.push(...found); return found.length === 0; };
  const add = (path, code, message, severity = "error") => {
    list.push(worldDiagnostic({ recordId, path, code, message, severity, file }));
  };

  const present = (parent, key, path, optional) => {
    const value = parent?.[key];
    if (value === undefined || value === null) {
      if (!optional) add(path, "FIELD_REQUIRED", `${path} is required`);
      return false;
    }
    return true;
  };

  const object = (parent, key, path, { optional = false } = {}) => {
    if (!present(parent, key, path, optional)) return null;
    const value = parent[key];
    if (!isObject(value)) {
      add(path, "TYPE_MISMATCH", `${path} must be an object, got ${typeName(value)}`);
      return null;
    }
    return value;
  };

  const array = (parent, key, path, { optional = false, minLength = 0 } = {}) => {
    if (!present(parent, key, path, optional)) return null;
    const value = parent[key];
    if (!Array.isArray(value)) {
      add(path, "TYPE_MISMATCH", `${path} must be an array, got ${typeName(value)}`);
      return null;
    }
    if (value.length < minLength) {
      add(path, "FIELD_REQUIRED", `${path} must contain at least ${minLength} item(s), got ${value.length}`);
    }
    return value;
  };

  const string = (parent, key, path, { optional = false } = {}) => {
    if (!present(parent, key, path, optional)) return null;
    const value = parent[key];
    if (typeof value !== "string") {
      add(path, "TYPE_MISMATCH", `${path} must be a string, got ${typeName(value)}`);
      return null;
    }
    if (value.trim().length === 0) {
      add(path, "FIELD_REQUIRED", `${path} must not be empty`);
      return null;
    }
    return value;
  };

  const boolean = (parent, key, path) => {
    if (!present(parent, key, path, false)) return null;
    const value = parent[key];
    if (typeof value !== "boolean") {
      add(path, "TYPE_MISMATCH", `${path} must be a boolean, got ${typeName(value)}`);
      return null;
    }
    return value;
  };

  const enumValue = (parent, key, path, allowed) => {
    const value = parent?.[key];
    return push(checkEnum(value, path, allowed, options)) ? value : null;
  };

  const id = (parent, key, path, prefix) => {
    const value = parent?.[key];
    return push(checkPrefixedId(value, path, prefix, options)) ? value : null;
  };

  const bilingual = (parent, key, path) => {
    const value = parent?.[key];
    return push(checkBilingual(value, path, options)) ? value : null;
  };

  const schemaVersion = (parent, expected) => push(checkSchemaVersion(parent?.schemaVersion, expected, options));

  const certainty = (parent, key, path) => {
    const value = parent?.[key];
    return push(checkCertainty(value, path, { ...options, allowSynthetic })) ? value : null;
  };

  /**
   * Reference check against refs[refKey] (a Set/Map/array/object of ids). Skipped when
   * the importer did not supply that collection.
   */
  const ref = (value, path, refKey, code, label, severity = "error") => {
    if (value === null || value === undefined || !refs) return;
    const known = refHas(refs[refKey], value);
    if (known === false) add(path, code, `${path} references unknown ${label} ${JSON.stringify(value)}`, severity);
  };

  /** Prefixed id that must resolve against refs[refKey] when refs are given. */
  const refId = (parent, key, path, prefix, refKey, code, label, severity = "error") => {
    const value = id(parent, key, path, prefix);
    ref(value, path, refKey, code, label, severity);
    return value;
  };

  /** Array of evidence ids ("ev-…"), unique, each resolving when refs.evidenceIds is given. */
  const evidenceIds = (parent, key, path, { minLength = 0 } = {}) => {
    const values = array(parent, key, path, { minLength });
    if (!values) return null;
    const seen = new Set();
    values.forEach((value, index) => {
      const itemPath = at(path, index);
      if (!push(checkPrefixedId(value, itemPath, ID_PREFIXES.evidence, options))) return;
      if (seen.has(value)) add(itemPath, "ID_DUPLICATE", `${itemPath} repeats evidence id ${JSON.stringify(value)}`);
      seen.add(value);
      ref(value, itemPath, "evidenceIds", "REF_UNKNOWN_EVIDENCE", "evidence record");
    });
    return values;
  };

  /** Common header of every world record: schemaVersion, prefixed id, certainty, evidenceIds. */
  const header = (version, prefix, { evidenceMin = 0 } = {}) => {
    schemaVersion(record, version);
    id(record, "id", "id", prefix);
    certainty(record, "certainty", "certainty");
    evidenceIds(record, "evidenceIds", "evidenceIds", { minLength: evidenceMin });
  };

  const result = () => sortDiagnostics(list);

  return {
    recordId, allowSynthetic, refs, add, push, object, array, string, boolean, enumValue, id, bilingual,
    schemaVersion, certainty, ref, refId, evidenceIds, header, result, options
  };
}

/** Diagnostic list for a record that is not an object at all. */
export function rootNotObject(record, label, file) {
  return [worldDiagnostic({ recordId: null, path: "", code: "TYPE_MISMATCH", message: `${label} must be an object, got ${typeName(record)}`, file })];
}
