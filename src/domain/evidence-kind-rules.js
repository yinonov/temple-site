// Claim-kind and source-type rules for evidence record v2 (TASK-6-10; .planning/STRATEGY-2026-10.md §2.2, §4).
// Contract: docs/contracts/evidence-record.md "Measurement and placement claims", "Prophetic vision and modern
// reconstruction sources". Pure ESM, no I/O. Called by validateEvidenceRecord; returns Diagnostic[].
//
// - claimKind "measurement" → `measurement { quantity, value, unit, of, excerptContainsValue: true, sourceIndex? }`.
//   The validator cannot read Hebrew number words, so the Historian asserts that the number occurs in the cited
//   excerpt (`excerptContainsValue: true`) and the Skeptic verifies that assertion in the challenge.
// - claimKind "placement" → `placement { relation, subject, of }`.
// - sourceType "prophetic_vision" → `useScope: "comparison_only"` (never a dimension/placement source).
// - sourceType "modern_reconstruction" → proposedCertainty ≤ reconstructed; summaries suffice.
// - locator scheme "web" → `{ url, title, accessed: YYYY-MM-DD, display }`; without a textRef only a summary.
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import {
  MEASUREMENT_QUANTITIES, MEASUREMENT_UNITS, PLACEMENT_RELATIONS, USE_SCOPES, COMPARISON_ONLY_SOURCE_TYPES,
  SUMMARY_SUFFICIENT_SOURCE_TYPES, MODERN_RECONSTRUCTION_ALLOWED_CERTAINTY, WEB_URL_PATTERN, unitsForQuantity
} from "./measurement-vocabulary.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const typeName = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * @param {object} record an evidence record (already known to be an object)
 * @param {{ file?: string }} [context]
 * @returns {object[]} sorted diagnostics
 */
export function validateEvidenceKindRules(record, { file } = {}) {
  if (!isObject(record)) return [];
  const recordId = typeof record.id === "string" ? record.id : null;
  const list = [];
  const add = (path, code, message) => list.push(diagnostic({ recordId, path, code, message, ...(file ? { file } : {}) }));
  const requireString = (parent, key, path) => {
    const value = parent[key];
    if (value === undefined || value === null) add(path, "FIELD_REQUIRED", `${path} is required`);
    else if (!nonEmpty(value)) add(path, typeof value === "string" ? "FIELD_REQUIRED" : "TYPE_MISMATCH", `${path} must be a non-empty string`);
  };
  const requireEnum = (parent, key, path, allowed) => {
    const value = parent[key];
    if (value === undefined || value === null) { add(path, "FIELD_REQUIRED", `${path} is required`); return null; }
    if (!allowed.has(value)) { add(path, "ENUM_INVALID", `${path} must be one of ${[...allowed].join("|")}, got ${JSON.stringify(value)}`); return null; }
    return value;
  };
  const sources = Array.isArray(record.sources) ? record.sources : [];

  // ---- measurement ----
  if (record.claimKind === "measurement") {
    const m = record.measurement;
    if (m === undefined || m === null) add("measurement", "FIELD_REQUIRED", "a measurement claim requires measurement { quantity, value, unit, of, excerptContainsValue }");
    else if (!isObject(m)) add("measurement", "TYPE_MISMATCH", `measurement must be an object, got ${typeName(m)}`);
    else {
      const quantity = requireEnum(m, "quantity", "measurement.quantity", MEASUREMENT_QUANTITIES);
      if (m.value === undefined || m.value === null) add("measurement.value", "FIELD_REQUIRED", "measurement.value is required");
      else if (typeof m.value !== "number" || !Number.isFinite(m.value) || m.value <= 0) {
        add("measurement.value", "TYPE_MISMATCH", "measurement.value must be a finite number greater than 0");
      } else if (quantity === "count" && !Number.isInteger(m.value)) {
        add("measurement.value", "TYPE_MISMATCH", "a count must be an integer");
      }
      const unit = requireEnum(m, "unit", "measurement.unit", MEASUREMENT_UNITS);
      if (quantity !== null && unit !== null && !unitsForQuantity(quantity).has(unit)) {
        add("measurement.unit", "ENUM_INVALID", `unit ${JSON.stringify(unit)} does not measure ${quantity}; use one of ${[...unitsForQuantity(quantity)].join("|")}`);
      }
      requireString(m, "of", "measurement.of");
      if (m.excerptContainsValue !== true) {
        add("measurement.excerptContainsValue", "FIELD_REQUIRED",
          "measurement.excerptContainsValue must be true: the stated number must occur in the cited supporting excerpt (the Skeptic verifies it)");
      }
      if (m.sourceIndex !== undefined) {
        const index = m.sourceIndex;
        const source = Number.isInteger(index) && index >= 0 ? sources[index] : undefined;
        if (!isObject(source)) add("measurement.sourceIndex", "TYPE_MISMATCH", "measurement.sourceIndex must index an entry of sources");
        else if (source.relation !== "supports") add("measurement.sourceIndex", "TYPE_MISMATCH", "measurement.sourceIndex must point at a relation \"supports\" source");
      }
    }
  } else if (record.measurement !== undefined) {
    add("measurement", "TYPE_MISMATCH", "measurement is only allowed when claimKind is \"measurement\"");
  }

  // ---- placement ----
  if (record.claimKind === "placement") {
    const p = record.placement;
    if (p === undefined || p === null) add("placement", "FIELD_REQUIRED", "a placement claim requires placement { relation, subject, of }");
    else if (!isObject(p)) add("placement", "TYPE_MISMATCH", `placement must be an object, got ${typeName(p)}`);
    else {
      requireEnum(p, "relation", "placement.relation", PLACEMENT_RELATIONS);
      requireString(p, "subject", "placement.subject");
      requireString(p, "of", "placement.of");
    }
  } else if (record.placement !== undefined) {
    add("placement", "TYPE_MISMATCH", "placement is only allowed when claimKind is \"placement\"");
  }

  // ---- useScope / prophetic vision ----
  if (COMPARISON_ONLY_SOURCE_TYPES.has(record.sourceType)) {
    if (record.useScope === undefined || record.useScope === null) {
      add("useScope", "FIELD_REQUIRED", `a ${record.sourceType} record requires useScope "comparison_only"`);
    } else if (record.useScope !== "comparison_only") {
      add("useScope", "ENUM_INVALID", `a ${record.sourceType} record must have useScope "comparison_only", got ${JSON.stringify(record.useScope)}`);
    }
  } else if (record.useScope !== undefined && !USE_SCOPES.has(record.useScope)) {
    add("useScope", "ENUM_INVALID", `useScope must be one of ${[...USE_SCOPES].join("|")}, got ${JSON.stringify(record.useScope)}`);
  }

  // ---- modern reconstruction ----
  if (SUMMARY_SUFFICIENT_SOURCE_TYPES.has(record.sourceType) && typeof record.proposedCertainty === "string" &&
      !MODERN_RECONSTRUCTION_ALLOWED_CERTAINTY.has(record.proposedCertainty)) {
    add("proposedCertainty", "CERTAINTY_EXCEEDS_EVIDENCE",
      `a ${record.sourceType} record may propose at most "reconstructed", got ${JSON.stringify(record.proposedCertainty)}`);
  }

  // ---- web locators ----
  sources.forEach((source, index) => {
    if (!isObject(source) || !isObject(source.locator) || source.locator.scheme !== "web") return;
    const path = `sources[${index}].locator`;
    const { locator } = source;
    if (locator.url === undefined || locator.url === null) add(`${path}.url`, "FIELD_REQUIRED", `${path}.url is required`);
    else if (typeof locator.url !== "string" || !WEB_URL_PATTERN.test(locator.url)) add(`${path}.url`, "TYPE_MISMATCH", `${path}.url must be an http(s) URL`);
    requireString(locator, "title", `${path}.title`);
    if (locator.accessed === undefined || locator.accessed === null) add(`${path}.accessed`, "FIELD_REQUIRED", `${path}.accessed is required`);
    else if (!isIsoDate(locator.accessed)) add(`${path}.accessed`, "TYPE_MISMATCH", `${path}.accessed must be a YYYY-MM-DD date`);
    if (!isObject(source.textRef) && source.excerptRole !== undefined && source.excerptRole !== "summary") {
      add(`sources[${index}].excerptRole`, "ENUM_INVALID",
        `a web source without a vendored textRef can only be a "summary" (it cannot be verified as a ${source.excerptRole})`);
    }
  });

  return sortDiagnostics(list);
}
