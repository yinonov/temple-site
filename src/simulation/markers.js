// People-marker descriptors for ONE published event. Contract: ADR-004 Decision 3.
// Pure ESM, data-only: nothing is invented. A missing location stays null, an unspecified count stays unspecified.
// Display positions are NOT decided here (scene's choice); this module only says who, where (per record) and how many.
import { CERTAINTY_RANK } from "./world-state.js";

/** Largest number of markers drawn for an exact count; callers must disclose the cap when `capped` is true. */
export const MAX_DISPLAY = 6;

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const sortedUnique = (list) => [...new Set(list)].sort(compareText);
const weakerOf = (a, b) => ((CERTAINTY_RANK[a] ?? 0) <= (CERTAINTY_RANK[b] ?? 0) ? a : b);

function countOf(entity) {
  const count = entity?.count;
  if (count?.kind === "exact" && Number.isInteger(count.value) && count.value >= 1) {
    const capped = count.value > MAX_DISPLAY;
    return {
      count: { kind: "exact", value: count.value },
      displayCount: capped ? MAX_DISPLAY : count.value,
      capped,
      countStated: true
    };
  }
  // Unspecified (or anything not a clean exact count): one marker, never a guessed number.
  return { count: { kind: "unspecified" }, displayCount: 1, capped: false, countStated: false };
}

/**
 * markersAt(world, { eventId, selections }) → { eventId, locationId, unplaced, markers[] }
 * `world` = importWorld().world. `selections` (alternative choices) is accepted for API symmetry with worldStateAt;
 * alternatives change evidence, never who takes part or how many, so they do not alter markers.
 * Unknown / missing eventId → { eventId: null|id, locationId: null, unplaced: true, markers: [] }; never throws.
 */
export function markersAt(world, { eventId } = {}) {
  const event = (world?.events ?? []).find((candidate) => candidate?.id === eventId);
  if (!event) return { eventId: eventId ?? null, locationId: null, unplaced: true, markers: [] };

  const locationIds = new Set((world?.locations ?? []).map((location) => location.id));
  const locationId = typeof event.locationId === "string" && locationIds.has(event.locationId) ? event.locationId : null;
  const entitiesById = new Map((world?.entities ?? []).map((entity) => [entity.id, entity]));
  const eventCertainty = event.effectiveCertainty ?? event.certainty ?? "requires_review";

  const markers = (event.participants ?? []).map((participant) => {
    const entity = entitiesById.get(participant.entityId);
    const entityCertainty = entity ? (entity.effectiveCertainty ?? entity.certainty ?? "requires_review") : "requires_review";
    return {
      entityId: participant.entityId,
      roleId: participant.roleId ?? entity?.roleId ?? null,
      locationId,
      locationBasis: locationId === null ? null : (event.locationBasis ?? null),
      ...countOf(entity),
      action: { he: participant.action?.he ?? "", en: participant.action?.en ?? "" },
      evidenceIds: sortedUnique([...(event.evidenceIds ?? []), ...(entity?.evidenceIds ?? [])]),
      certainty: weakerOf(eventCertainty, entityCertainty)
    };
  }).sort((a, b) => compareText(a.entityId, b.entityId));

  return { eventId: event.id, locationId, unplaced: locationId === null, markers };
}
