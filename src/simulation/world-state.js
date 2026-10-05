// Deterministic world state at a query point. Frozen contract: docs/contracts/world-state.md (§2.7).
// Pure ESM: no clock reads, randomness, DOM, globals or I/O. Same inputs → deep-equal outputs.

import { diagnostic, sortDiagnostics } from "../domain/diagnostics.js";
import { applicability, normalizeDateContext } from "./date-context.js";
import { eventInterval, eventMatchesTime } from "./intervals.js";
import { findConflicts } from "../domain/compatibility.js";
import { deriveEntityStates, participationsByEntity } from "./entity-state.js";
import { evaluateAccess } from "./access.js";

/** Certainty rank (world-state.md "Evidence and certainty"). */
export const CERTAINTY_RANK = Object.freeze({
  requires_review: 0,
  speculative: 1,
  reconstructed: 2,
  traditional: 3,
  archaeological: 3,
  documented: 4
});

const MINUTES_PER_DAY = 1440;
const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const byId = (a, b) => compareText(a.id, b.id);
const sortedUnique = (values) => [...new Set(values)].sort(compareText);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

/** Normalise a time query. Throws TypeError on a malformed query (it is a caller error, not world data). */
export function normalizeTime(time) {
  if (!time || typeof time !== "object") throw new TypeError("time must be an object");
  if (time.axis === "clock") {
    if (!isNonNegativeInteger(time.minuteOfDay) || time.minuteOfDay >= MINUTES_PER_DAY) {
      throw new TypeError("time.minuteOfDay must be an integer 0..1439");
    }
    return { axis: "clock", minuteOfDay: time.minuteOfDay };
  }
  if (time.axis === "sequence") {
    if (typeof time.sequenceId !== "string" || time.sequenceId.length === 0) {
      throw new TypeError("time.sequenceId must be a non-empty string");
    }
    if (!isNonNegativeInteger(time.step)) throw new TypeError("time.step must be a non-negative integer");
    return { axis: "sequence", sequenceId: time.sequenceId, step: time.step };
  }
  throw new TypeError('time.axis must be "clock" or "sequence"');
}

/** Normalise selections to a key-sorted plain object of string → string. */
export function normalizeSelections(alternativeSelections = {}) {
  const input = alternativeSelections ?? {};
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("alternativeSelections must be an object");
  const result = {};
  for (const key of Object.keys(input).sort(compareText)) {
    if (typeof input[key] !== "string") throw new TypeError(`alternativeSelections.${key} must be an option id string`);
    result[key] = input[key];
  }
  return result;
}

function validSelections(selections, groupsById, diagnostics) {
  const valid = new Map();
  for (const [groupId, optionId] of Object.entries(selections)) {
    const path = `alternativeSelections.${groupId}`;
    const group = groupsById.get(groupId);
    if (!group) {
      diagnostics.push(diagnostic({ recordId: groupId, path, code: "REF_UNKNOWN_ALTERNATIVE", severity: "warning",
        message: `Selection for unknown alternative group ${groupId} ignored` }));
    } else if (!(group.options ?? []).some((option) => option.id === optionId)) {
      diagnostics.push(diagnostic({ recordId: groupId, path, code: "REF_UNKNOWN_ALTERNATIVE", severity: "warning",
        message: `Option ${optionId} is not an option of ${groupId}; selection ignored, no other option substituted` }));
    } else if (group.selectionPolicy === "show_all") {
      diagnostics.push(diagnostic({ recordId: groupId, path, code: "ALTERNATIVE_SELECTION_IGNORED", severity: "warning",
        message: `${groupId} has selectionPolicy show_all; selection of ${optionId} ignored` }));
    } else {
      valid.set(groupId, optionId);
    }
  }
  return valid;
}

function resolveAlternative(groupId, group, selections) {
  if (selections.has(groupId)) return { groupId, optionId: selections.get(groupId), status: "selected" };
  const approved = group?.approvedDefaultOptionId ?? null;
  if (approved !== null && (group.options ?? []).some((option) => option.id === approved)) {
    return { groupId, optionId: approved, status: "approved_default" };
  }
  return { groupId, optionId: null, status: "unresolved" };
}

/** Evidence of the options a resolution makes applicable: the chosen option, or every option when unresolved. */
function optionEvidence(resolution, group) {
  const options = group?.options ?? [];
  const shown = resolution.optionId === null ? options : options.filter((option) => option.id === resolution.optionId);
  return shown.flatMap((option) => option.evidenceIds ?? []);
}

function certaintySummary(activeEvents) {
  const byLevel = Object.fromEntries(Object.keys(CERTAINTY_RANK).map((level) => [level, 0]));
  let weakest = null;
  for (const event of activeEvents) {
    byLevel[event.certainty] = (byLevel[event.certainty] ?? 0) + 1;
    const rank = CERTAINTY_RANK[event.certainty] ?? 0;
    if (weakest === null || rank < CERTAINTY_RANK[weakest] || (rank === CERTAINTY_RANK[weakest] && event.certainty < weakest)) {
      weakest = event.certainty;
    }
  }
  return { byLevel, weakest, hasPreviewContent: activeEvents.some((event) => event.publication === "preview_only") };
}

/**
 * worldStateAt({ world, dateContext, time, alternativeSelections = {} }) — see docs/contracts/world-state.md.
 */
export function worldStateAt({ world, dateContext, time, alternativeSelections = {} }) {
  const query = {
    dateContext: normalizeDateContext(dateContext),
    time: normalizeTime(time),
    alternativeSelections: normalizeSelections(alternativeSelections)
  };
  const q = query.time;
  const diagnostics = [];
  const events = [...(world?.events ?? [])].sort(byId);
  const entities = [...(world?.entities ?? [])].sort(byId);
  const locations = [...(world?.locations ?? [])].sort(byId);
  const groupsById = new Map((world?.alternatives ?? []).map((group) => [group.id, group]));
  const anchorsById = new Map((world?.anchors ?? []).map((anchor) => [anchor.id, anchor]));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  if (q.axis === "sequence" && !(world?.sequences ?? []).some((sequence) => sequence.id === q.sequenceId)) {
    diagnostics.push(diagnostic({ path: "time.sequenceId", code: "REF_UNKNOWN_SEQUENCE", severity: "warning",
      message: `Queried sequence ${q.sequenceId} is not in the world; no event can be active` }));
  }
  const selections = validSelections(query.alternativeSelections, groupsById, diagnostics);

  // Placement: candidates are events on the queried axis/sequence whose interval holds the point, plus every
  // sequence-timed event on a clock query (it can never be placed on the clock). Day type is filtered first.
  const active = [];
  const unplacedEvents = [];
  const conditionalEvents = [];
  for (const event of events) {
    const interval = eventInterval(event);
    const sequenceOnClock = q.axis === "clock" && interval?.axis === "sequence";
    if (!sequenceOnClock && !eventMatchesTime(event, q)) continue;
    const applies = applicability(event, query.dateContext);
    // applicabilityBasis (TASK-5-08, R-01): "source" | "editorial_viewing_assumption" | null (not stated). Only
    // "source" may be presented as the source restricting the event; anything else is a viewing filter.
    const applicabilityBasis = event.applicability?.basis ?? null;
    if (applies === "not_applicable") conditionalEvents.push({ eventId: event.id, reason: "DAY_TYPE_NOT_APPLICABLE", applicabilityBasis });
    else if (applies === "unspecified") conditionalEvents.push({ eventId: event.id, reason: "DAY_TYPE_UNSPECIFIED", applicabilityBasis });
    else if (sequenceOnClock) unplacedEvents.push({ eventId: event.id, reason: "SEQUENCE_ONLY_TIMING" });
    else active.push(event);
  }

  const evidence = [];
  const activeEvents = active.map((event) => {
    const alternatives = sortedUnique((event.alternatives ?? []).map((ref) => ref.groupId)).map((groupId) => {
      const group = groupsById.get(groupId);
      const resolution = resolveAlternative(groupId, group, selections);
      evidence.push(...optionEvidence(resolution, group));
      return resolution;
    });
    evidence.push(...(event.evidenceIds ?? []));
    for (const anchorRef of event.timing?.anchors ?? []) {
      evidence.push(...(anchorRef.evidenceIds ?? []), ...(anchorsById.get(anchorRef.anchorId)?.evidenceIds ?? []));
    }
    return {
      eventId: event.id,
      publication: event.publication,
      certainty: event.effectiveCertainty ?? event.certainty,
      evidenceIds: sortedUnique(event.evidenceIds ?? []),
      alternatives
    };
  });

  // Exclusive-attendance check over the active events only (shared rules: docs/contracts/world-data.md).
  diagnostics.push(...findConflicts(active, { dayType: query.dateContext.dayType, entitiesById }));

  const entityStates = deriveEntityStates(entities, active);
  const locationStates = locations.map((location) => ({
    locationId: location.id,
    activeEventIds: active.filter((event) => event.locationId === location.id).map((event) => event.id)
  }));

  const accessResults = [];
  for (const [entityId, list] of [...participationsByEntity(active)].sort((a, b) => compareText(a[0], b[0]))) {
    const entity = entitiesById.get(entityId);
    if (!entity) continue;
    for (const locationId of sortedUnique(list.map((item) => item.locationId))) {
      const location = locationsById.get(locationId) ?? { id: locationId };
      const access = evaluateAccess(entity, location, world, { time: q, dateContext: query.dateContext });
      accessResults.push({ entityId, locationId, ...access });
      evidence.push(...access.evidenceIds);
      if (access.result === "deny") {
        diagnostics.push(diagnostic({ recordId: entityId, path: "", code: "ACCESS_DENIED", severity: "warning",
          message: `Access rule denies ${entityId} at ${locationId} while it participates in an active event; not corrected` }));
      }
    }
  }

  return {
    query,
    activeEvents,
    unplacedEvents,
    conditionalEvents,
    entityStates,
    locationStates,
    accessResults,
    evidenceRefs: sortedUnique(evidence),
    certaintySummary: certaintySummary(activeEvents),
    diagnostics: sortDiagnostics(diagnostics)
  };
}
