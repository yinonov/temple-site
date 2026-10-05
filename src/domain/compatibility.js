// Participant compatibility checks for event v2 (TASK-2-04; docs/contracts/world-data.md
// "Compatibility rules"). Pure ESM, no I/O.
import { diagnostic, sortDiagnostics } from "./diagnostics.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

function interval(event) {
  const timing = event?.timing;
  if (!isObject(timing)) return null;
  if (timing.axis === "clock" && Number.isInteger(timing.startMinute) && Number.isInteger(timing.endMinute)) {
    return { axis: "clock", scope: "clock", start: timing.startMinute, end: timing.endMinute };
  }
  if (timing.axis === "sequence" && typeof timing.sequenceId === "string" && Number.isInteger(timing.startStep) && Number.isInteger(timing.endStep)) {
    return { axis: "sequence", scope: `sequence:${timing.sequenceId}`, start: timing.startStep, end: timing.endStep };
  }
  return null;
}

function describe(span) {
  return span.axis === "clock" ? `minutes [${span.start}, ${span.end})` : `steps [${span.start}, ${span.end}) of ${span.scope.slice(9)}`;
}

/**
 * Do the two events' day-type applicability sets admit a common day? With a concrete
 * `dayType` both must list it; with no day type (or "unspecified") any shared day type counts.
 */
function dayTypesMeet(left, right, dayType) {
  const a = list(left?.applicability?.dayTypes);
  const b = list(right?.applicability?.dayTypes);
  if (dayType && dayType !== "unspecified") return a.includes(dayType) && b.includes(dayType);
  return a.some((value) => b.includes(value));
}

/**
 * True when two events overlap per the compatibility rules: same axis, same sequence (sequence
 * axis), intersecting half-open intervals and a common applicable day type.
 * @param {object} left event v2
 * @param {object} right event v2
 * @param {{ dayType?: string|null }} [options]
 */
export function eventsOverlap(left, right, { dayType = null } = {}) {
  const a = interval(left);
  const b = interval(right);
  if (!a || !b || a.scope !== b.scope) return false;
  if (!(a.start < b.end && b.start < a.end)) return false;
  return dayTypesMeet(left, right, dayType);
}

function exempt(left, right) {
  if (left?.compatibility?.sharedAttendance === true && right?.compatibility?.sharedAttendance === true) return true;
  const names = (event, other) => list(event?.compatibility?.overlapExceptions).some((item) => item?.eventId === other?.id);
  return names(left, right) || names(right, left);
}

/**
 * Conflicting (event, event, entity) triples, before they are turned into diagnostics.
 * @returns {{ leftId, rightId, entityId, participantIndex, leftEvent, rightEvent }[]} ordered by leftId, rightId, index
 */
export function findConflictPairs(events, { dayType = null } = {}) {
  const sorted = list(events).filter((event) => isObject(event) && typeof event.id === "string").sort((l, r) => byText(l.id, r.id));
  const pairs = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const left = sorted[i];
      const right = sorted[j];
      if (left.id === right.id || !eventsOverlap(left, right, { dayType }) || exempt(left, right)) continue;
      const rightIds = new Set(list(right.participants).map((participant) => participant?.entityId));
      list(left.participants).forEach((participant, index) => {
        const entityId = participant?.entityId;
        if (typeof entityId === "string" && rightIds.has(entityId)) pairs.push({ leftId: left.id, rightId: right.id, entityId, participantIndex: index, leftEvent: left, rightEvent: right });
      });
    }
  }
  return pairs;
}

/**
 * Find participant allocation conflicts among event v2 records (both timing axes).
 * An entity may attend at most one overlapping event, unless both events declare
 * `compatibility.sharedAttendance: true` or either lists the other in `overlapExceptions`.
 * @param {object[]} events
 * @param {{ dayType?: string|null, entitiesById?: Map<string, object>|Record<string, object>, file?: (event) => string|undefined }} [options]
 *   `dayType` null/"unspecified" compares events that share any applicable day type;
 *   `entitiesById` (optional) lets messages name the entity's English label.
 * @returns {object[]} PARTICIPANT_CONFLICT diagnostics (severity error) on the first event of each pair, sorted
 */
export function findConflicts(events, { dayType = null, entitiesById = null, file = null } = {}) {
  const label = (entityId) => {
    const entity = entitiesById instanceof Map ? entitiesById.get(entityId) : isObject(entitiesById) ? entitiesById[entityId] : undefined;
    const en = entity?.label?.en;
    return typeof en === "string" && en ? ` (${en})` : "";
  };
  return sortDiagnostics(findConflictPairs(events, { dayType }).map(({ leftId, rightId, entityId, participantIndex, leftEvent, rightEvent }) => {
    const f = typeof file === "function" ? file(leftEvent) : undefined;
    return diagnostic({
      recordId: leftId,
      path: `participants[${participantIndex}].entityId`,
      code: "PARTICIPANT_CONFLICT",
      message: `Entity ${entityId}${label(entityId)} is allocated to overlapping events ${leftId} and ${rightId} ` +
        `(${describe(interval(leftEvent))} and ${describe(interval(rightEvent))}) without shared attendance or an overlap exception`,
      ...(f ? { file: f } : {})
    });
  }));
}
