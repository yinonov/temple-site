// Access evaluator. Contract: docs/contracts/world-data.md "Access policy v1" and rule 5; world-state.md.
// Pure ESM. Absent an applicable rule the answer is "unknown" — never allow/deny by assumption.
//
// Condition tokens (`purity`, `timing`) have no approved vocabulary yet, so a rule that carries any condition
// cannot be evaluated and contributes "unknown" (CONDITION_NOT_EVALUABLE) instead of being assumed to hold.

export const ACCESS_REASONS = Object.freeze({
  RULE_DENY: "RULE_DENY",
  RULE_ALLOW: "RULE_ALLOW",
  CONDITION_NOT_EVALUABLE: "CONDITION_NOT_EVALUABLE",
  NO_APPLICABLE_RULE: "NO_APPLICABLE_RULE",
  NO_POLICY: "NO_POLICY",
  UNKNOWN_ENTITY_OR_LOCATION: "UNKNOWN_ENTITY_OR_LOCATION"
});

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

function evidenceOf(rules) {
  return [...new Set(rules.flatMap((rule) => rule.evidenceIds ?? []))].sort(compareText);
}

function hasConditions(rule) {
  const conditions = rule.conditions;
  return conditions !== null && typeof conditions === "object" && Object.keys(conditions).length > 0;
}

/**
 * Evaluate whether an entity may be at a location.
 * Precedence: unconditional deny → deny; a deny that cannot be evaluated → unknown; unconditional allow → allow;
 * an allow that cannot be evaluated → unknown; no matching rule → unknown.
 * `time` and `dateContext` are accepted for the future condition vocabulary; v1 conditions are not evaluable.
 * @returns {{ result: "allow"|"deny"|"unknown", reason: string, evidenceIds: string[] }}
 */
export function evaluateAccess(entity, location, world, { time = null, dateContext = null } = {}) {
  void time;
  void dateContext;
  if (!entity?.id || !location?.id) {
    return { result: "unknown", reason: ACCESS_REASONS.UNKNOWN_ENTITY_OR_LOCATION, evidenceIds: [] };
  }
  const policies = (world?.accessPolicies ?? []).filter((policy) => policy.locationId === location.id);
  if (policies.length === 0) return { result: "unknown", reason: ACCESS_REASONS.NO_POLICY, evidenceIds: [] };
  const rules = policies
    .flatMap((policy) => policy.rules ?? [])
    .filter((rule) => rule.roleId === entity.roleId);
  const pick = (effect, conditional) => rules.filter((rule) => rule.effect === effect && hasConditions(rule) === conditional);
  const deny = pick("deny", false);
  if (deny.length) return { result: "deny", reason: ACCESS_REASONS.RULE_DENY, evidenceIds: evidenceOf(deny) };
  const conditionalDeny = pick("deny", true);
  if (conditionalDeny.length) {
    return { result: "unknown", reason: ACCESS_REASONS.CONDITION_NOT_EVALUABLE, evidenceIds: evidenceOf(conditionalDeny) };
  }
  const allow = pick("allow", false);
  if (allow.length) return { result: "allow", reason: ACCESS_REASONS.RULE_ALLOW, evidenceIds: evidenceOf(allow) };
  const conditionalAllow = pick("allow", true);
  if (conditionalAllow.length) {
    return { result: "unknown", reason: ACCESS_REASONS.CONDITION_NOT_EVALUABLE, evidenceIds: evidenceOf(conditionalAllow) };
  }
  return { result: "unknown", reason: ACCESS_REASONS.NO_APPLICABLE_RULE, evidenceIds: [] };
}
