export const CERTAINTY_LEVELS = new Set([
  "documented",
  "traditional",
  "archaeological",
  "reconstructed",
  "speculative",
  "requires_review"
]);

export const PUBLISHABLE_CERTAINTY_LEVELS = new Set([
  "documented",
  "traditional",
  "archaeological",
  "reconstructed",
  "speculative"
]);

function isMinute(value) {
  return Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

/**
 * Validate a legacy v1 event (startMinute/durationMinutes/participantIds/sourceIds).
 * Returns stable, human-readable errors so agents can repair an artifact.
 * @deprecated Legacy compatibility wrapper. Event v2 is validated by `validateEvent` in
 *   `./schemas/event.js` and published only through `importWorld` (`./importer.js`), where a
 *   v1 event citing only catalog `sourceIds` is rejected with CATALOG_ONLY_SOURCE.
 */
export function validateEvent(event, world) {
  const errors = [];
  if (!event || typeof event !== "object") return ["event must be an object"];
  if (!event.id || typeof event.id !== "string") errors.push("event.id is required");
  if (!isMinute(event.startMinute)) errors.push("event.startMinute must be between 0 and 1439");
  if (!Number.isInteger(event.durationMinutes) || event.durationMinutes <= 0) {
    errors.push("event.durationMinutes must be a positive integer");
  }
  if (!CERTAINTY_LEVELS.has(event.certainty)) errors.push("event.certainty is invalid");
  if (!Array.isArray(event.sourceIds) || event.sourceIds.length === 0) {
    errors.push("event.sourceIds must contain at least one source");
  }

  const sourceIds = new Set(world.sources.map((source) => source.id));
  for (const sourceId of event.sourceIds ?? []) {
    if (!sourceIds.has(sourceId)) errors.push(`event source does not exist: ${sourceId}`);
  }

  const locationIds = new Set(world.locations.map((location) => location.id));
  if (!locationIds.has(event.locationId)) errors.push(`event location does not exist: ${event.locationId}`);

  const entityIds = new Set(world.entities.map((entity) => entity.id));
  for (const entityId of event.participantIds ?? []) {
    if (!entityIds.has(entityId)) errors.push(`event participant does not exist: ${entityId}`);
  }
  return errors;
}

/**
 * @deprecated Legacy compatibility wrapper. Publication is decided by the publishability gate
 *   (`isPublishable` in `./publishability.js`) inside `importWorld`; a self-asserted certainty
 *   never authorises publication.
 */
export function validatePublishedEvent(event, world) {
  const errors = validateEvent(event, world);
  if (!PUBLISHABLE_CERTAINTY_LEVELS.has(event?.certainty)) {
    errors.push("requires_review events cannot be published");
  }
  return errors;
}

/** @deprecated Legacy v1 clock overlap. Use `eventsOverlap` in `./compatibility.js` (both axes, half-open, day types). */
export function eventOverlaps(left, right) {
  const leftEnd = left.startMinute + left.durationMinutes;
  const rightEnd = right.startMinute + right.durationMinutes;
  return left.startMinute < rightEnd && right.startMinute < leftEnd;
}

/** @deprecated Legacy v1 conflict finder. Use `findConflicts` in `./compatibility.js` (PARTICIPANT_CONFLICT diagnostics). */
export function findParticipantConflicts(events) {
  const conflicts = [];
  for (let index = 0; index < events.length; index += 1) {
    for (let other = index + 1; other < events.length; other += 1) {
      const shared = events[index].participantIds.filter((id) => events[other].participantIds.includes(id));
      if (shared.length && eventOverlaps(events[index], events[other])) {
        conflicts.push({ eventIds: [events[index].id, events[other].id], participantIds: shared });
      }
    }
  }
  return conflicts;
}

