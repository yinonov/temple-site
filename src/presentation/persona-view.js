// Persona ("מי אתם?") view model (TASK-6-35). Pure; no DOM. Turns accessibleAreas() into the rows the text view
// shows. Place names, role names, attribution and locators come from data; chrome from strings.scene3d.persona.
import { accessibleAreas, personasFromWorld } from "../domain/access.js";
import { evidenceItems, isolateLatin, recordCertainty } from "./view-model.js";

const he = (text) => (text && typeof text === "object" ? text.he ?? null : typeof text === "string" ? text : null);

/**
 * Personas the data supports: [{ id, label, shortLabel }]. Empty when no policy is published.
 * M2-10: `shortLabel` (the role name before any parenthesised source term) is what the narrow select shows;
 * the full name stays in `label` and is shown under the select.
 */
export function personaOptions(world) {
  return personasFromWorld(world).map((persona) => {
    const name = he(persona.name) ?? persona.roleId;
    const short = name.replace(/\s*[(（].*$/s, "").trim() || name;
    return { id: persona.roleId, label: isolateLatin(name), shortLabel: isolateLatin(short) };
  });
}

const dedupeLines = (lines) => {
  const seen = new Set();
  return lines.filter((line) => { const key = `${line.sourceLabelShown ?? ""}|${line.locator ?? ""}|${line.accessMode ?? ""}|${line.certainty?.level ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
};

/** piece id → status, for the renderer. Empty when no persona is chosen. */
export function pieceAccessMap(areas) {
  return areas?.personaKnown ? Object.fromEntries(areas.pieces.map((piece) => [piece.pieceId, piece.status])) : {};
}

/**
 * @returns {{ options, personaId, label, rows: Array<{ locationId, name, status, statusLabel, ruleLines, pieceCount, certainty }>, counts }|null}
 *   null when the world has no persona at all (the selector is then hidden).
 */
export function buildPersonaView({ world, personaId, strings }) {
  const options = personaOptions(world);
  if (!options.length) return null;
  const t = strings.scene3d.persona;
  const known = options.some((option) => option.id === personaId);
  const view = { options, personaId: known ? personaId : null, label: options.find((option) => option.id === personaId)?.label ?? null, rows: [], counts: null };
  if (!known) return view;
  const areas = accessibleAreas(personaId, world);
  const policies = new Map((world.accessPolicies ?? []).map((policy) => [policy.id, policy]));
  const roles = new Map((world.roles ?? []).map((role) => [role.id, role]));
  const locations = new Map((world.locations ?? []).map((location) => [location.id, location]));
  const ruleLinesOf = (entry) => entry.policyIds.flatMap((policyId) => {
    const policy = policies.get(policyId);
    return (policy?.rules ?? []).filter((rule) => entry.ruleIds.includes(rule.id)).map((rule) => ({
      policyId, ruleId: rule.id,
      text: `${t.ruleEffect[rule.effect] ?? rule.effect} — ${isolateLatin(he(roles.get(rule.roleId)?.name) ?? rule.roleId)}`,
      evidenceIds: [...(rule.evidenceIds ?? [])],
      // M3-02/M3-13: the access chip travels with the locator; a work name the locator repeats and identical lines are dropped.
      evidence: dedupeLines(evidenceItems({ world, strings, ids: rule.evidenceIds ?? [] }).map((item) => ({ id: item.id, sourceLabel: item.sourceLabel,
        sourceLabelShown: item.sourceLabelShown, locator: item.locatorDisplay, accessMode: item.accessMode, certainty: item.certainty }))),
      certainty: recordCertainty(policy, strings)
    }));
  });
  const piecesByLocation = new Map();
  for (const piece of areas.pieces) if (piece.locationId) piecesByLocation.set(piece.locationId, (piecesByLocation.get(piece.locationId) ?? 0) + 1);
  view.counts = { allowed: 0, forbidden: 0, no_source: 0 };
  // M3-14: pieces drawn only for some mount options (the exterior: porticoes, gates, Antonia) that sit at no location.
  // When none has a rule this is said once, instead of once per piece.
  const geometryById = new Map((world.geometry ?? []).map((piece) => [piece.id, piece]));
  const exterior = areas.pieces.filter((piece) => !piece.locationId && geometryById.get(piece.pieceId)?.appliesTo);
  view.exterior = { count: exterior.length, noneHasRule: exterior.length > 0 && exterior.every((piece) => piece.status === "no_source") };
  for (const piece of areas.pieces) view.counts[piece.status] += 1;
  view.rows = areas.locations.map((entry) => {
    const location = locations.get(entry.locationId);
    const ruleLines = ruleLinesOf(entry);
    return { locationId: entry.locationId, name: isolateLatin(he(location?.name) ?? entry.locationId), status: entry.status,
      statusLabel: t.status[entry.status], ruleLines, pieceCount: piecesByLocation.get(entry.locationId) ?? 0,
      conditional: entry.conditionalRuleIds.length > 0 };
  }).sort((a, b) => (a.status === "no_source") - (b.status === "no_source"));
  // M2-02: the verdict for each drawn piece (the inspector shows it), with the governing rule lines.
  view.pieceVerdicts = Object.fromEntries(areas.pieces.map((piece) => [piece.pieceId, { status: piece.status, statusLabel: t.status[piece.status],
    ruleLines: ruleLinesOf(piece), conflict: Boolean(piece.conflict) }]));
  return view;
}

/** Evidence ids of one persona rule (for the evidence dialog, subject "rule:<ruleId>"). */
export function ruleEvidence({ world, ruleId, strings }) {
  for (const policy of world.accessPolicies ?? []) {
    const rule = (policy.rules ?? []).find((item) => item.id === ruleId);
    if (rule) {
      const role = (world.roles ?? []).find((item) => item.id === rule.roleId);
      const effect = strings.scene3d.persona.ruleEffect[rule.effect] ?? rule.effect;
      return { policyId: policy.id, rule, text: `${effect} — ${isolateLatin(he(role?.name) ?? rule.roleId)}`,
        items: evidenceItems({ world, strings, ids: rule.evidenceIds ?? [] }) };
    }
  }
  return null;
}
