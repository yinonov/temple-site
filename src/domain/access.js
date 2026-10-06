// Access personas (TASK-6-35). Pure: derives, from access policies and roles only, which locations / geometry
// pieces a role may enter, may not enter, or has no source for. Nothing here is a historical claim: the status is a
// restatement of an access-policy rule that carries its own evidence ids and certainty. Absent a rule the answer is
// "no_source" — never allow/deny by assumption (policy `default` is "unknown").

export const ACCESS_STATUS = Object.freeze({ ALLOWED: "allowed", FORBIDDEN: "forbidden", NO_SOURCE: "no_source" });

const list = (value) => (Array.isArray(value) ? value : []);
const hasConditions = (rule) => Object.keys(rule?.conditions ?? {}).length > 0;

/** Primary locator text of an evidence record (supporting quotation first), or null. */
function locatorOf(evidence) {
  const sources = list(evidence?.sources);
  const primary = sources.find((s) => s.relation === "supports" && s.excerptRole === "quotation") ?? sources[0];
  return primary?.locator?.display ?? null;
}

function attributionFor(evidenceIds, evidenceById) {
  return evidenceIds.map((evidenceId) => {
    const record = evidenceById.get(evidenceId);
    const primary = list(record?.sources).find((s) => s.relation === "supports" && s.excerptRole === "quotation") ?? list(record?.sources)[0];
    return { evidenceId, catalogSourceId: primary?.catalogSourceId ?? null, locator: locatorOf(record) };
  });
}

/**
 * Roles that have at least one rule in a policy: the personas the data supports. Sorted by id.
 * @returns {Array<{ roleId: string, name: object|null, policyIds: string[] }>}
 */
export function personasFromWorld(world) {
  const roles = new Map(list(world?.roles).map((role) => [role.id, role]));
  const found = new Map();
  for (const policy of list(world?.accessPolicies)) {
    for (const rule of list(policy.rules)) {
      if (!roles.has(rule.roleId)) continue;
      const entry = found.get(rule.roleId) ?? { roleId: rule.roleId, name: roles.get(rule.roleId).name ?? null, policyIds: [] };
      if (!entry.policyIds.includes(policy.id)) entry.policyIds.push(policy.id);
      found.set(rule.roleId, entry);
    }
  }
  return [...found.values()].sort((a, b) => (a.roleId < b.roleId ? -1 : a.roleId > b.roleId ? 1 : 0));
}

function decide(personaId, locationId, policies, evidenceById) {
  const mine = policies.filter((policy) => policy.locationId === locationId);
  const matching = [];
  for (const policy of mine) for (const rule of list(policy.rules)) if (rule.roleId === personaId) matching.push({ policy, rule });
  const decisive = matching.filter(({ rule }) => !hasConditions(rule) && (rule.effect === "allow" || rule.effect === "deny"));
  const effects = new Set(decisive.map(({ rule }) => rule.effect));
  // A rule with conditions (purity/purpose/timing) cannot be evaluated here: it never decides. Contradictory unconditional
  // rules are not resolved by picking one.
  const status = effects.size !== 1 ? ACCESS_STATUS.NO_SOURCE : effects.has("allow") ? ACCESS_STATUS.ALLOWED : ACCESS_STATUS.FORBIDDEN;
  const governing = status === ACCESS_STATUS.NO_SOURCE ? [] : decisive;
  const evidenceIds = [...new Set(governing.flatMap(({ rule }) => list(rule.evidenceIds)))].sort();
  return {
    locationId,
    status,
    policyIds: [...new Set(governing.map(({ policy }) => policy.id))].sort(),
    ruleIds: governing.map(({ rule }) => rule.id).sort(),
    evidenceIds,
    attribution: attributionFor(evidenceIds, evidenceById),
    conflict: effects.size > 1,
    conditionalRuleIds: matching.filter(({ rule }) => hasConditions(rule)).map(({ rule }) => rule.id).sort()
  };
}

/**
 * accessibleAreas(personaId, world) → { personaId, personaKnown, locations: [...], pieces: [...] }
 *
 * - `personaId` is a role id (see personasFromWorld). An unknown persona gets `no_source` everywhere.
 * - `locations`: one entry per world location. `pieces`: one entry per geometry piece, taking the status of the
 *   location its own `locationId` names. A piece without a `locationId` is `no_source`: nothing is inherited from a
 *   parent piece, because no rule says a policy extends to children.
 * - Entry: { status: allowed|forbidden|no_source, policyIds, ruleIds, evidenceIds, attribution: [{ evidenceId,
 *   catalogSourceId, locator }], conflict, conditionalRuleIds } plus `locationId` (and `pieceId` for pieces).
 */
export function accessibleAreas(personaId, world) {
  const policies = list(world?.accessPolicies);
  const evidenceById = new Map(list(world?.evidence).map((record) => [record.id, record]));
  const personaKnown = list(world?.roles).some((role) => role.id === personaId)
    && policies.some((policy) => list(policy.rules).some((rule) => rule.roleId === personaId));
  const byLocation = new Map();
  const forLocation = (locationId) => {
    if (!byLocation.has(locationId)) byLocation.set(locationId, decide(personaKnown ? personaId : null, locationId, policies, evidenceById));
    return byLocation.get(locationId);
  };
  const locations = list(world?.locations).map((location) => forLocation(location.id));
  const pieces = list(world?.geometry).map((piece) => {
    const base = piece.locationId ? forLocation(piece.locationId) : decide(null, null, [], evidenceById);
    return { ...base, pieceId: piece.id, locationId: piece.locationId ?? null };
  });
  return { personaId: personaId ?? null, personaKnown, locations, pieces };
}
