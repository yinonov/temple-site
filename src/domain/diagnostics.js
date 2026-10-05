// Structured validation diagnostics shared by every domain validator and the importer.
// Contract: .planning/EXECUTION_PLAN.md §2.6. Pure ESM, no I/O.

/** Every diagnostic code a domain validator may emit (§2.6, plus CHALLENGE_NOT_INDEPENDENT and the world-schema codes). */
export const DIAGNOSTIC_CODES = Object.freeze([
  "SCHEMA_VERSION_UNSUPPORTED",
  "FIELD_REQUIRED",
  "TYPE_MISMATCH",
  "ENUM_INVALID",
  "ID_FORMAT",
  "ID_DUPLICATE",
  "REF_UNKNOWN_SOURCE",
  "REF_UNKNOWN_EVIDENCE",
  "REF_UNKNOWN_LOCATION",
  "REF_UNKNOWN_ROLE",
  "REF_UNKNOWN_ENTITY",
  "REF_UNKNOWN_SEQUENCE",
  "REF_UNKNOWN_ANCHOR",
  "REF_UNKNOWN_ALTERNATIVE",
  "TIME_RANGE_INVALID",
  "SEQUENCE_STEP_INVALID",
  "BASELINE_MISMATCH",
  "CERTAINTY_SELF_PROMOTED",
  "CERTAINTY_UNPUBLISHABLE",
  "CERTAINTY_EXCEEDS_EVIDENCE",
  "EVIDENCE_NOT_APPROVED",
  "DECISION_NOT_HUMAN",
  "DECISION_DIGEST_STALE",
  "CATALOG_ONLY_SOURCE",
  "QUOTE_NOT_FOUND",
  "LOCATOR_TEXTREF_MISMATCH",
  "TEXT_UNKNOWN",
  "SYNTHETIC_IN_REAL_DATA",
  "PARTICIPANT_CONFLICT",
  "DEMO_STATE_IMPORT",
  "CHALLENGE_NOT_INDEPENDENT",
  // World-record schemas (TASK-2-01; docs/contracts/world-data.md)
  "ALTERNATIVE_DEFAULT_UNAPPROVED",
  "CLOCK_TIMING_UNAPPROVED",
  "PARTICIPANT_ROLE_MISMATCH",
  // Geometry schema (TASK-6-11; docs/contracts/world-data.md "Geometry v1")
  "REF_UNKNOWN_GEOMETRY",
  "GEOMETRY_EVIDENCE_UNSUITABLE",
  "GEOMETRY_REF_UNLISTED",
  "GEOMETRY_CYCLE",
  // World-state engine (TASK-3-01..06; docs/contracts/world-state.md)
  "ACCESS_DENIED",
  "ALTERNATIVE_SELECTION_IGNORED",
  // Importer and publishability gate (TASK-1-05/2-02/2-03/2-04)
  "REF_UNKNOWN_EVENT",
  "CHALLENGE_MISSING",
  "RECORD_NOT_APPROVED",
  "DEPENDENCY_UNPUBLISHED",
  "CERTAINTY_MIXED_BASIS",
  "PUBLICATION_EXCLUDED",
  // TASK-2-07 hardening
  "QUOTE_UNVERIFIED",
  // TASK-5-21 automated publication gate (STRATEGY-2026-10 §3; docs/contracts/world-data.md)
  "HUMAN_VETO",
  "CHALLENGE_OBJECTION",
  "REF_UNKNOWN_TARGET"
]);

export const DIAGNOSTIC_SEVERITIES = Object.freeze(["error", "warning", "info"]);

const codeSet = new Set(DIAGNOSTIC_CODES);
const severitySet = new Set(DIAGNOSTIC_SEVERITIES);

/**
 * Build one frozen diagnostic. Unknown codes or severities throw, so a typo in a
 * validator fails loudly in tests instead of producing an unrecognised code.
 * @returns {{recordId: string|null, path: string, code: string, message: string, severity: string, file?: string}}
 */
export function diagnostic({ recordId = null, path = "", code, message, severity = "error", file } = {}) {
  if (!codeSet.has(code)) throw new TypeError(`Unknown diagnostic code: ${code}`);
  if (!severitySet.has(severity)) throw new TypeError(`Unknown diagnostic severity: ${severity}`);
  if (typeof message !== "string" || message.length === 0) throw new TypeError("Diagnostic message is required");
  if (recordId !== null && typeof recordId !== "string") throw new TypeError("Diagnostic recordId must be a string or null");
  if (typeof path !== "string") throw new TypeError("Diagnostic path must be a string");
  const result = { recordId, path, code, message, severity };
  if (file !== undefined) {
    if (typeof file !== "string") throw new TypeError("Diagnostic file must be a string");
    result.file = file;
  }
  return Object.freeze(result);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Return a new array sorted by (file, recordId, path, code), then message for full
 * determinism. Missing file/recordId sort first. Uses code-unit order, not locale order.
 */
export function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((left, right) =>
    compareText(left.file ?? "", right.file ?? "") ||
    compareText(left.recordId ?? "", right.recordId ?? "") ||
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message));
}
