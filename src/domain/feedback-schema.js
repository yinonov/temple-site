// Visitor feedback record: pure validation and normalization. No I/O, no clock, no randomness
// unless injected. Contract: docs/contracts/feedback.md.
import { diagnostic, sortDiagnostics } from "./diagnostics.js";

export const FEEDBACK_SCHEMA_VERSION = 1;
export const TARGET_KINDS = Object.freeze(["evidence", "event", "location", "role", "entity", "sequence", "alternative_group", "geometry", "ui", "general"]);
export const CATEGORIES = Object.freeze(["wrong", "missing_source", "alternative", "ui", "other"]);
export const LIMITS = Object.freeze({ message: 4000, sourceSuggestion: 1000, pageUrl: 500, contact: 200, targetId: 200, viewport: 20000 });

const STORED_FIELDS = new Set(["schemaVersion", "id", "createdAt", "target", "category", "message", "sourceSuggestion", "pageUrl", "viewport"]);
const INPUT_FIELDS = new Set(["schemaVersion", "target", "category", "message", "sourceSuggestion", "pageUrl", "viewport", "contact"]);
const ID_PATTERN = /^fb-\d{8}-[0-9a-f]{8}$/;
const TARGET_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.:#\/-]*$/;
// Control characters except \n and \t (multi-line fields only), plus bidi embedding/override/isolate controls.
const BAD_MULTILINE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;
const BAD_SINGLE_LINE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function makeReporter(list, recordId) {
  return (code, path, message) => list.push(diagnostic({ recordId, path, code, message }));
}

function checkText(report, value, path, { max, min = 0, multiline = false }) {
  if (typeof value !== "string") return report("TYPE_MISMATCH", path, `${path} must be a string`);
  if (value.length < min || (min > 0 && value.trim().length === 0)) return report("FIELD_REQUIRED", path, `${path} must not be empty`);
  if (value.length > max) return report("TYPE_MISMATCH", path, `${path} must be at most ${max} characters`);
  if ((multiline ? BAD_MULTILINE : BAD_SINGLE_LINE).test(value)) return report("TYPE_MISMATCH", path, `${path} contains control characters`);
}

/**
 * Validate a stored feedback record (what lands in feedback/inbox). `contact` is rejected there
 * unless `allowContact` is set (used while normalizing, before the contact is split off).
 * @returns diagnostics (empty array = valid)
 */
export function validateFeedback(obj, { allowContact = false } = {}) {
  const list = [];
  if (!isObject(obj)) {
    list.push(diagnostic({ path: "", code: "TYPE_MISMATCH", message: "feedback must be an object" }));
    return list;
  }
  const recordId = typeof obj.id === "string" && ID_PATTERN.test(obj.id) ? obj.id : null;
  const report = makeReporter(list, recordId);
  const allowed = allowContact ? new Set([...STORED_FIELDS, "contact"]) : STORED_FIELDS;
  for (const key of Object.keys(obj)) if (!allowed.has(key)) report("TYPE_MISMATCH", key, `unknown field ${JSON.stringify(key.slice(0, 40))}`);

  if (obj.schemaVersion !== FEEDBACK_SCHEMA_VERSION) report("SCHEMA_VERSION_UNSUPPORTED", "schemaVersion", `schemaVersion must be ${FEEDBACK_SCHEMA_VERSION}`);
  if (typeof obj.id !== "string") report(obj.id === undefined ? "FIELD_REQUIRED" : "TYPE_MISMATCH", "id", "id must be a string");
  else if (!ID_PATTERN.test(obj.id)) report("ID_FORMAT", "id", "id must match fb-<yyyymmdd>-<8 hex>");
  if (typeof obj.createdAt !== "string") report(obj.createdAt === undefined ? "FIELD_REQUIRED" : "TYPE_MISMATCH", "createdAt", "createdAt must be an ISO string");
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(obj.createdAt) || Number.isNaN(Date.parse(obj.createdAt))) report("TYPE_MISMATCH", "createdAt", "createdAt must be an ISO UTC timestamp");

  if (!isObject(obj.target)) report(obj.target === undefined ? "FIELD_REQUIRED" : "TYPE_MISMATCH", "target", "target must be an object { kind, id }");
  else {
    for (const key of Object.keys(obj.target)) if (key !== "kind" && key !== "id") report("TYPE_MISMATCH", `target.${key}`, "unknown target field");
    if (!TARGET_KINDS.includes(obj.target.kind)) report("ENUM_INVALID", "target.kind", `target.kind must be one of ${TARGET_KINDS.join(", ")}`);
    const targetId = obj.target.id;
    if (targetId === undefined) report("FIELD_REQUIRED", "target.id", "target.id must be a string or null");
    else if (targetId !== null) {
      if (typeof targetId !== "string") report("TYPE_MISMATCH", "target.id", "target.id must be a string or null");
      else if (targetId.length === 0 || targetId.length > LIMITS.targetId) report(targetId.length === 0 ? "FIELD_REQUIRED" : "TYPE_MISMATCH", "target.id", `target.id must be 1..${LIMITS.targetId} characters`);
      else if (!TARGET_ID_PATTERN.test(targetId) || targetId.includes("..")) report("ID_FORMAT", "target.id", "target.id may contain only letters, digits and _ . : # / -");
    }
  }

  if (!CATEGORIES.includes(obj.category)) report("ENUM_INVALID", "category", `category must be one of ${CATEGORIES.join(", ")}`);
  if (obj.message === undefined) report("FIELD_REQUIRED", "message", "message is required");
  else checkText(report, obj.message, "message", { max: LIMITS.message, min: 1, multiline: true });
  if (obj.sourceSuggestion !== undefined) checkText(report, obj.sourceSuggestion, "sourceSuggestion", { max: LIMITS.sourceSuggestion });
  if (obj.pageUrl !== undefined) checkText(report, obj.pageUrl, "pageUrl", { max: LIMITS.pageUrl });
  if (allowContact && obj.contact !== undefined) checkText(report, obj.contact, "contact", { max: LIMITS.contact });
  if (obj.viewport !== undefined) {
    if (!isObject(obj.viewport)) report("TYPE_MISMATCH", "viewport", "viewport must be { width, height }");
    else {
      for (const key of Object.keys(obj.viewport)) if (key !== "width" && key !== "height") report("TYPE_MISMATCH", `viewport.${key}`, "unknown viewport field");
      for (const key of ["width", "height"]) {
        const v = obj.viewport[key];
        if (!Number.isInteger(v) || v < 1 || v > LIMITS.viewport) report("TYPE_MISMATCH", `viewport.${key}`, `viewport.${key} must be an integer 1..${LIMITS.viewport}`);
      }
    }
  }
  return sortDiagnostics(list);
}

function defaultRandomHex() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Turn client input into a stored record plus the split-off contact. The id and createdAt are
 * always server-made; client-supplied id/createdAt are rejected as unknown fields.
 * @param {object} input client JSON
 * @param {{now?: () => Date, randomHex?: () => string}} [deps] injected clock and random source
 * @returns {{ok: boolean, diagnostics: object[], feedback: object|null, contact: string|null}}
 */
export function normalizeFeedback(input, { now = () => new Date(), randomHex = defaultRandomHex } = {}) {
  if (!isObject(input)) return { ok: false, diagnostics: validateFeedback(input), feedback: null, contact: null };
  const extra = [];
  for (const key of Object.keys(input)) {
    if (!INPUT_FIELDS.has(key)) extra.push(diagnostic({ path: key, code: "TYPE_MISMATCH", message: `unknown field ${JSON.stringify(key.slice(0, 40))}` }));
  }
  const date = now();
  const iso = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  const hex = String(randomHex());
  const record = { schemaVersion: input.schemaVersion ?? FEEDBACK_SCHEMA_VERSION, id: `fb-${iso.slice(0, 10).replaceAll("-", "")}-${hex}`, createdAt: iso };
  for (const key of ["target", "category", "message", "sourceSuggestion", "pageUrl", "viewport", "contact"]) if (input[key] !== undefined) record[key] = input[key];
  const diagnostics = sortDiagnostics([...extra, ...validateFeedback(record, { allowContact: true })]);
  if (diagnostics.length > 0) return { ok: false, diagnostics, feedback: null, contact: null };
  const { contact, ...feedback } = record;
  return { ok: true, diagnostics: [], feedback, contact: contact ?? null };
}
