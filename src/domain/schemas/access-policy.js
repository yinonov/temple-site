// Access policy record v1 (§2.5). Rules only; evaluation lives in the simulation layer.
// Pure ESM, no I/O.
import { ID_PATTERN, ID_PREFIXES, at, collector, isObject, join, rootNotObject } from "./common.js";

export const ACCESS_POLICY_SCHEMA_VERSION = 1;
export const ACCESS_DEFAULTS = Object.freeze(new Set(["unknown"]));
export const ACCESS_EFFECTS = Object.freeze(new Set(["allow", "deny"]));
/** Condition keys allowed in v1; values are opaque non-empty string tokens. */
export const ACCESS_CONDITION_KEYS = Object.freeze(new Set(["purity", "timing"]));

/**
 * Validate one access policy record.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateAccessPolicy(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "access policy record", context.file);
  const c = collector(record, context);
  c.header(ACCESS_POLICY_SCHEMA_VERSION, ID_PREFIXES.access_policy);
  c.refId(record, "locationId", "locationId", ID_PREFIXES.location, "locationIds", "REF_UNKNOWN_LOCATION", "location");
  c.enumValue(record, "default", "default", ACCESS_DEFAULTS);

  const rules = c.array(record, "rules", "rules");
  const seen = new Set();
  rules?.forEach((rule, index) => {
    const path = at("rules", index);
    if (!isObject(rule)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const ruleId = c.string(rule, "id", join(path, "id"));
    if (ruleId !== null) {
      if (!ID_PATTERN.test(ruleId)) c.add(join(path, "id"), "ID_FORMAT", `${path}.id must match ${ID_PATTERN}`);
      else if (seen.has(ruleId)) c.add(join(path, "id"), "ID_DUPLICATE", `${path}.id repeats rule id ${JSON.stringify(ruleId)}`);
      seen.add(ruleId);
    }
    c.refId(rule, "roleId", join(path, "roleId"), ID_PREFIXES.role, "roleIds", "REF_UNKNOWN_ROLE", "role");
    c.enumValue(rule, "effect", join(path, "effect"), ACCESS_EFFECTS);
    const conditions = c.object(rule, "conditions", join(path, "conditions"));
    if (conditions) {
      for (const key of Object.keys(conditions).sort()) {
        const conditionPath = join(join(path, "conditions"), key);
        if (!ACCESS_CONDITION_KEYS.has(key)) {
          c.add(conditionPath, "ENUM_INVALID", `${conditionPath} is not a known condition; use one of ${[...ACCESS_CONDITION_KEYS].join("|")}`);
        } else {
          c.string(conditions, key, conditionPath);
        }
      }
    }
    c.evidenceIds(rule, "evidenceIds", join(path, "evidenceIds"), { minLength: 1 });
  });
  return c.result();
}
