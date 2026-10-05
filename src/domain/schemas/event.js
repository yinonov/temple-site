// Event record v2 (§2.5, D7). Pure ESM, no I/O.
import { EVENT_DAY_TYPES, ID_PREFIXES, at, collector, isObject, join, refGet, rootNotObject } from "./common.js";

export const EVENT_SCHEMA_VERSION = 2;
export const EVENT_KINDS = Object.freeze(new Set(["ritual_step", "activity"]));
export const LOCATION_BASES = Object.freeze(new Set(["stated", "inferred"]));
export const TIMING_AXES = Object.freeze(new Set(["sequence", "clock"]));
export const ANCHOR_RELATIONS = Object.freeze(new Set(["near", "before", "after", "at"]));
export const PROPOSAL_STATUSES = Object.freeze(new Set(["draft", "publish_candidate"]));
/**
 * Why an event's applicability.dayTypes is what it is (TASK-5-08, R-01). Optional in v2 (additive):
 *   "source" — a cited source restricts the event to these day types;
 *   "editorial_viewing_assumption" — the project chose to show the event only on these day types; no source
 *     restricts it. Requires applicability.note { he, en } explaining the assumption.
 * An absent basis means "not stated"; consumers must never present it as a source restriction.
 */
export const APPLICABILITY_BASES = Object.freeze(new Set(["source", "editorial_viewing_assumption"]));
export const MINUTES_PER_DAY = 1440;

/**
 * Validate one event v2 record.
 *
 * `context.refs` (all optional; a check runs only when its collection is supplied):
 *   evidenceIds, locationIds, roleIds, entityIds, sequenceIds, anchorIds,
 *   alternativeGroupIds — Sets (or arrays / Maps / objects) of known ids;
 *   sequences — Map|object id → sequence record (enables the endStep upper bound);
 *   entities  — Map|object id → entity record (enables the participant role check).
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateEvent(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "event record", context.file);
  const c = collector(record, context);
  const refs = context.refs ?? null;
  c.header(EVENT_SCHEMA_VERSION, ID_PREFIXES.event, { evidenceMin: 1 });
  c.enumValue(record, "kind", "kind", EVENT_KINDS);
  c.bilingual(record, "title", "title");
  c.bilingual(record, "summary", "summary");
  c.refId(record, "locationId", "locationId", ID_PREFIXES.location, "locationIds", "REF_UNKNOWN_LOCATION", "location");
  c.enumValue(record, "locationBasis", "locationBasis", LOCATION_BASES);

  validateParticipants(c, record, refs);
  validateTiming(c, record, refs, Boolean(context.allowSynthetic));
  validateApplicability(c, record);
  validateAlternatives(c, record);
  validateCompatibility(c, record);
  c.enumValue(record, "proposalStatus", "proposalStatus", PROPOSAL_STATUSES);
  return c.result();
}

function validateParticipants(c, record, refs) {
  const participants = c.array(record, "participants", "participants", { minLength: 1 });
  const seen = new Set();
  participants?.forEach((participant, index) => {
    const path = at("participants", index);
    if (!isObject(participant)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const entityId = c.refId(participant, "entityId", join(path, "entityId"), ID_PREFIXES.entity, "entityIds", "REF_UNKNOWN_ENTITY", "entity");
    if (entityId !== null) {
      if (seen.has(entityId)) c.add(join(path, "entityId"), "ID_DUPLICATE", `${path}.entityId repeats participant ${JSON.stringify(entityId)}`);
      seen.add(entityId);
    }
    const roleId = c.refId(participant, "roleId", join(path, "roleId"), ID_PREFIXES.role, "roleIds", "REF_UNKNOWN_ROLE", "role");
    c.bilingual(participant, "action", join(path, "action"));
    if (entityId !== null && roleId !== null && refs?.entities) {
      const entity = refGet(refs.entities, entityId);
      if (isObject(entity) && typeof entity.roleId === "string" && entity.roleId !== roleId) {
        c.add(join(path, "roleId"), "PARTICIPANT_ROLE_MISMATCH",
          `${path}.roleId ${JSON.stringify(roleId)} differs from entity ${entityId}'s role ${JSON.stringify(entity.roleId)}`);
      }
    }
  });
}

function validateTiming(c, record, refs, allowSynthetic) {
  const timing = c.object(record, "timing", "timing");
  if (!timing) return;
  const axis = c.enumValue(timing, "axis", "timing.axis", TIMING_AXES);
  if (axis === "sequence") validateSequenceTiming(c, timing, refs);
  if (axis === "clock") validateClockTiming(c, timing, allowSynthetic);
}

function validateSequenceTiming(c, timing, refs) {
  const sequenceId = c.refId(timing, "sequenceId", "timing.sequenceId", ID_PREFIXES.sequence, "sequenceIds", "REF_UNKNOWN_SEQUENCE", "sequence");
  const step = (key) => {
    const path = join("timing", key);
    const value = timing[key];
    if (value === undefined || value === null) { c.add(path, "FIELD_REQUIRED", `${path} is required`); return null; }
    if (!Number.isInteger(value) || value < 0) {
      c.add(path, "SEQUENCE_STEP_INVALID", `${path} must be a non-negative integer, got ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };
  const start = step("startStep");
  const end = step("endStep");
  if (start !== null && end !== null && start >= end) {
    c.add("timing.endStep", "SEQUENCE_STEP_INVALID", `timing must satisfy startStep < endStep (half-open), got [${start}, ${end})`);
  }
  if (sequenceId !== null && end !== null && refs?.sequences) {
    const sequence = refGet(refs.sequences, sequenceId);
    if (isObject(sequence) && Array.isArray(sequence.steps) && end > sequence.steps.length) {
      c.add("timing.endStep", "SEQUENCE_STEP_INVALID",
        `timing.endStep ${end} exceeds ${sequenceId}'s ${sequence.steps.length} step(s)`);
    }
  }

  const anchors = c.array(timing, "anchors", "timing.anchors");
  const seen = new Set();
  anchors?.forEach((anchor, index) => {
    const path = at("timing.anchors", index);
    if (!isObject(anchor)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const anchorId = c.refId(anchor, "anchorId", join(path, "anchorId"), ID_PREFIXES.anchor, "anchorIds", "REF_UNKNOWN_ANCHOR", "anchor");
    if (anchorId !== null) {
      if (seen.has(anchorId)) c.add(join(path, "anchorId"), "ID_DUPLICATE", `${path}.anchorId repeats anchor ${JSON.stringify(anchorId)}`);
      seen.add(anchorId);
    }
    c.enumValue(anchor, "relation", join(path, "relation"), ANCHOR_RELATIONS);
    c.evidenceIds(anchor, "evidenceIds", join(path, "evidenceIds"), { minLength: 1 });
    // Optional scope (TASK-5-08, R-17): the one step of the event's span that the anchor times.
    if (anchor.appliesToStep !== undefined && anchor.appliesToStep !== null) {
      const stepPath = join(path, "appliesToStep");
      const value = anchor.appliesToStep;
      if (!Number.isInteger(value) || value < 0) {
        c.add(stepPath, "SEQUENCE_STEP_INVALID", `${stepPath} must be a non-negative integer, got ${JSON.stringify(value)}`);
      } else if (start !== null && end !== null && (value < start || value >= end)) {
        c.add(stepPath, "SEQUENCE_STEP_INVALID", `${stepPath} ${value} must lie within the event's steps [${start}, ${end})`);
      }
    }
  });
}

function validateClockTiming(c, timing, allowSynthetic) {
  const minute = (key) => {
    const path = join("timing", key);
    const value = timing[key];
    if (value === undefined || value === null) { c.add(path, "FIELD_REQUIRED", `${path} is required`); return null; }
    if (!Number.isInteger(value) || value < 0 || value > MINUTES_PER_DAY) {
      c.add(path, "TIME_RANGE_INVALID", `${path} must be an integer minute in 0..${MINUTES_PER_DAY}, got ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };
  const start = minute("startMinute");
  const end = minute("endMinute");
  if (start !== null && start === MINUTES_PER_DAY) {
    c.add("timing.startMinute", "TIME_RANGE_INVALID", `timing.startMinute must be below ${MINUTES_PER_DAY}`);
  } else if (start !== null && end !== null && start >= end) {
    c.add("timing.endMinute", "TIME_RANGE_INVALID", `timing must satisfy startMinute < endMinute (half-open), got [${start}, ${end})`);
  }
  if (!allowSynthetic) {
    c.add("timing.axis", "CLOCK_TIMING_UNAPPROVED",
      "clock timing is allowed only in synthetic data until clock evidence is approved; use the sequence axis with anchors");
  }
}

function validateApplicability(c, record) {
  const applicability = c.object(record, "applicability", "applicability");
  if (!applicability) return;
  const dayTypes = c.array(applicability, "dayTypes", "applicability.dayTypes", { minLength: 1 });
  const seen = new Set();
  dayTypes?.forEach((dayType, index) => {
    const path = at("applicability.dayTypes", index);
    if (!EVENT_DAY_TYPES.has(dayType)) {
      c.add(path, "ENUM_INVALID", `${path} must be one of ${[...EVENT_DAY_TYPES].join("|")}, got ${JSON.stringify(dayType)}`);
      return;
    }
    if (seen.has(dayType)) c.add(path, "ID_DUPLICATE", `${path} repeats day type ${JSON.stringify(dayType)}`);
    seen.add(dayType);
  });
  // Optional basis and note (TASK-5-08, R-01); the note is required when the basis is editorial.
  const hasBasis = applicability.basis !== undefined && applicability.basis !== null;
  const basis = hasBasis ? c.enumValue(applicability, "basis", "applicability.basis", APPLICABILITY_BASES) : null;
  const hasNote = applicability.note !== undefined && applicability.note !== null;
  if (basis === "editorial_viewing_assumption" || hasNote) c.bilingual(applicability, "note", "applicability.note");
}

function validateAlternatives(c, record) {
  const alternatives = c.array(record, "alternatives", "alternatives");
  const seen = new Set();
  alternatives?.forEach((alternative, index) => {
    const path = at("alternatives", index);
    if (!isObject(alternative)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const groupId = c.refId(alternative, "groupId", join(path, "groupId"), ID_PREFIXES.alternative_group,
      "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
    if (groupId !== null) {
      if (seen.has(groupId)) c.add(join(path, "groupId"), "ID_DUPLICATE", `${path}.groupId repeats ${JSON.stringify(groupId)}`);
      seen.add(groupId);
    }
  });
}

function validateCompatibility(c, record) {
  const compatibility = c.object(record, "compatibility", "compatibility");
  if (!compatibility) return;
  c.boolean(compatibility, "sharedAttendance", "compatibility.sharedAttendance");
  const exceptions = c.array(compatibility, "overlapExceptions", "compatibility.overlapExceptions");
  const seen = new Set();
  exceptions?.forEach((exception, index) => {
    const path = at("compatibility.overlapExceptions", index);
    if (!isObject(exception)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const eventId = c.id(exception, "eventId", join(path, "eventId"), ID_PREFIXES.event);
    if (eventId !== null) {
      if (eventId === record.id) c.add(join(path, "eventId"), "ID_DUPLICATE", `${path}.eventId must not name the event itself`);
      if (seen.has(eventId)) c.add(join(path, "eventId"), "ID_DUPLICATE", `${path}.eventId repeats ${JSON.stringify(eventId)}`);
      seen.add(eventId);
    }
    c.bilingual(exception, "reason", join(path, "reason"));
    c.evidenceIds(exception, "evidenceIds", join(path, "evidenceIds"), { minLength: 1 });
  });
}
