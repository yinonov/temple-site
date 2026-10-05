// Entity states derived from active events. Contract: docs/contracts/world-state.md "Entities, locations, access".
// Pure ESM. An entity with no active event is "idle_unknown": no activity or position is invented for it.

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

/**
 * Map entityId → [{ eventId, locationId, action }] over the given (active) events, id-sorted by eventId.
 */
export function participationsByEntity(events) {
  const map = new Map();
  for (const event of [...events].sort((a, b) => compareText(a.id, b.id))) {
    for (const participant of event.participants ?? []) {
      if (!map.has(participant.entityId)) map.set(participant.entityId, []);
      map.get(participant.entityId).push({ eventId: event.id, locationId: event.locationId, action: participant.action });
    }
  }
  return map;
}

/**
 * One state per world entity, sorted by entityId.
 * - exactly one active event → { status: "active", eventId, locationId, action }
 * - several active events (shared attendance or a reported conflict) → { status: "active" } plus `locationId` only
 *   when every event is at the same location; the engine never picks one event over another.
 * - none → { status: "idle_unknown" }
 */
export function deriveEntityStates(entities, activeEvents) {
  const participations = participationsByEntity(activeEvents);
  return [...entities]
    .sort((a, b) => compareText(a.id, b.id))
    .map((entity) => {
      const list = participations.get(entity.id) ?? [];
      if (list.length === 0) return { entityId: entity.id, status: "idle_unknown" };
      if (list.length === 1) {
        const [only] = list;
        return { entityId: entity.id, status: "active", eventId: only.eventId, locationId: only.locationId, action: only.action };
      }
      const locations = new Set(list.map((item) => item.locationId));
      return locations.size === 1
        ? { entityId: entity.id, status: "active", locationId: list[0].locationId }
        : { entityId: entity.id, status: "active" };
    });
}
