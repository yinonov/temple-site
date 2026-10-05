// Publication policy (STRATEGY-2026-10 §3, ADR-002; TASK-5-21). Pure ESM, no I/O.
//
// data/policy.json: { "schemaVersion": 1, "publication": "human_decision" | "automated_challenge" }
//
//   human_decision       a record publishes only with a current human approval (the original gate; tier
//                        "expert_reviewed").
//   automated_challenge  a record publishes when it passes the automated gate: valid, quotes verified, a current,
//                        valid, independent `skeptic` challenge recommending ready_for_human_review, no current human
//                        veto, dependencies publishable (tier "provisional"; "expert_reviewed" with a current human
//                        approval).
//
// Fail-closed: a missing policy means human_decision; an invalid policy is reported and also means human_decision.
import { diagnostic, sortDiagnostics } from "./diagnostics.js";

export const POLICY_SCHEMA_VERSION = 1;
export const POLICY_PATH = "data/policy.json";
export const PUBLICATION_POLICIES = Object.freeze(["human_decision", "automated_challenge"]);
export const DEFAULT_PUBLICATION_POLICY = "human_decision";
/** Tier of a published record. A preview_only record has tier null. */
export const PUBLICATION_TIERS = Object.freeze(["provisional", "expert_reviewed"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const KNOWN_KEYS = new Set(["schemaVersion", "publication", "note"]);

/**
 * Validate a parsed data/policy.json.
 * @param {unknown} policy
 * @param {{ file?: string }} [context]
 * @returns {object[]} sorted diagnostics; empty when valid
 */
export function validatePolicy(policy, { file } = {}) {
  const out = [];
  const add = (path, code, message) => out.push(diagnostic({ recordId: null, path, code, message, ...(file ? { file } : {}) }));
  if (!isObject(policy)) {
    add("", "TYPE_MISMATCH", "the publication policy must be an object { schemaVersion, publication }");
    return out;
  }
  if (policy.schemaVersion === undefined) add("schemaVersion", "FIELD_REQUIRED", "schemaVersion is required");
  else if (policy.schemaVersion !== POLICY_SCHEMA_VERSION) {
    add("schemaVersion", "SCHEMA_VERSION_UNSUPPORTED", `schemaVersion must be ${POLICY_SCHEMA_VERSION}, got ${JSON.stringify(policy.schemaVersion)}`);
  }
  if (policy.publication === undefined || policy.publication === null) add("publication", "FIELD_REQUIRED", "publication is required");
  else if (!PUBLICATION_POLICIES.includes(policy.publication)) {
    add("publication", "ENUM_INVALID", `publication must be one of ${PUBLICATION_POLICIES.join("|")}, got ${JSON.stringify(policy.publication)}`);
  }
  if (policy.note !== undefined && typeof policy.note !== "string") add("note", "TYPE_MISMATCH", "note must be a string");
  for (const key of Object.keys(policy).sort()) {
    if (!KNOWN_KEYS.has(key)) add(key, "TYPE_MISMATCH", `unknown policy field ${JSON.stringify(key)}`);
  }
  return sortDiagnostics(out);
}

/**
 * Resolve the effective publication policy.
 * @param {string|object|null|undefined} policy a policy name, a parsed policy file, or nothing
 * @param {{ file?: string }} [context]
 * @returns {{ publication: string, diagnostics: object[] }} an invalid file yields human_decision plus its errors
 * @throws {TypeError} when a policy *name* (string) is not one of PUBLICATION_POLICIES (a caller bug, like a bad mode)
 */
export function resolvePublicationPolicy(policy, context = {}) {
  if (policy === undefined || policy === null) return { publication: DEFAULT_PUBLICATION_POLICY, diagnostics: [] };
  if (typeof policy === "string") {
    if (!PUBLICATION_POLICIES.includes(policy)) {
      throw new TypeError(`publication policy must be one of ${PUBLICATION_POLICIES.join("|")}, got ${JSON.stringify(policy)}`);
    }
    return { publication: policy, diagnostics: [] };
  }
  const diagnostics = validatePolicy(policy, context);
  if (diagnostics.some((item) => item.severity === "error")) return { publication: DEFAULT_PUBLICATION_POLICY, diagnostics };
  return { publication: policy.publication, diagnostics };
}
