// In-memory SYNTHETIC world builder for simulation tests. Nothing here is a historical claim:
// every id is `*-synthetic-*` and every label says "SYNTHETIC". Shape mirrors the importer's `world`.

const text = (en) => ({ he: `SYNTHETIC ${en}`, en: `SYNTHETIC ${en}` });
const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function annotate(record, { certainty = "speculative", publication = "preview_only" } = {}) {
  return {
    certainty: "requires_review",
    evidenceIds: [],
    ...record,
    publication,
    lifecycle: { state: publication === "published" ? "approved_for_scope" : "drafted" },
    effectiveCertainty: certainty
  };
}

export const synthetic = {
  location: (id, extra = {}) => annotate({ schemaVersion: 1, id, name: text(id), kind: "court", parentId: null,
    spatial: { status: "unplaced" }, ...extra }),
  role: (id, extra = {}) => annotate({ schemaVersion: 1, id, name: text(id), description: text(id), ...extra }),
  entity: (id, roleId, extra = {}) => annotate({ schemaVersion: 1, id, kind: "group", roleId, label: text(id),
    count: { kind: "unspecified" }, ...extra }),
  sequence: (id, stepCount = 4, extra = {}) => annotate({ schemaVersion: 1, id, name: text(id),
    steps: Array.from({ length: stepCount }, (_, step) => ({ step, label: text(`step ${step}`), evidenceIds: ["ev-synthetic-order"] })),
    orderEvidenceIds: ["ev-synthetic-order"], orderNote: text("narrative order read as temporal order"), ...extra }),
  anchor: (id, extra = {}) => annotate({ schemaVersion: 1, id, label: text(id), clockResolution: null,
    alternativeGroupId: null, evidenceIds: ["ev-synthetic-anchor"], ...extra }),
  alternative: (id, optionIds, { approvedDefaultOptionId = null, selectionPolicy = "visitor_selectable", ...extra } = {}) => ({
    ...annotate({ schemaVersion: 1, id, question: text(id), selectionPolicy, defaultOptionId: approvedDefaultOptionId,
      options: optionIds.map((optionId) => ({ id: optionId, label: text(optionId), effect: text(optionId),
        evidenceIds: [`ev-${optionId.slice(4)}`] })), ...extra }),
    approvedDefaultOptionId
  }),
  accessPolicy: (id, locationId, rules, extra = {}) => annotate({ schemaVersion: 1, id, locationId, default: "unknown",
    rules, ...extra }),
  clockEvent: (id, startMinute, endMinute, extra = {}) => event(id, { axis: "clock", startMinute, endMinute }, extra),
  sequenceEvent: (id, sequenceId, startStep, endStep, extra = {}) =>
    event(id, { axis: "sequence", sequenceId, startStep, endStep, anchors: [] }, extra)
};

function event(id, timing, { participants = [["ent-synthetic-a", "role-synthetic-a"]], locationId = "loc-synthetic-a",
  dayTypes = ["ordinary"], alternatives = [], sharedAttendance = false, overlapExceptions = [], certainty = "speculative",
  publication = "preview_only", anchors, evidenceIds = [`ev-${id.slice(4)}`] } = {}) {
  return annotate({
    schemaVersion: 2, id, kind: "activity", title: text(id), summary: text(id), locationId, locationBasis: "inferred",
    participants: participants.map(([entityId, roleId]) => ({ entityId, roleId, action: text(`${entityId} action`) })),
    timing: anchors ? { ...timing, anchors } : timing,
    applicability: { dayTypes }, evidenceIds,
    alternatives: alternatives.map((groupId) => ({ groupId })),
    compatibility: { sharedAttendance, overlapExceptions }, proposalStatus: "draft"
  }, { certainty, publication });
}

const KEYS = ["evidence", "challenges", "decisions", "alternatives", "locations", "roles", "entities", "accessPolicies",
  "sequences", "anchors", "events"];

/** Build a frozen, id-sorted world. Pass `{ sort: false }` to keep the given order (for order-independence tests). */
export function buildWorld(parts = {}, { sort = true } = {}) {
  const world = { baselineId: "synthetic-baseline", mode: "preview", catalog: { schemaVersion: 1, sources: [] } };
  for (const key of KEYS) {
    const list = [...(parts[key] ?? [])];
    world[key] = sort ? list.sort((a, b) => compareText(a.id, b.id)) : list;
  }
  return deepFreeze(world);
}

/** A small default SYNTHETIC world: two locations, two roles, three entities, one sequence. */
export function baseParts() {
  return {
    locations: [synthetic.location("loc-synthetic-a"), synthetic.location("loc-synthetic-b")],
    roles: [synthetic.role("role-synthetic-a"), synthetic.role("role-synthetic-b")],
    entities: [
      synthetic.entity("ent-synthetic-a", "role-synthetic-a"),
      synthetic.entity("ent-synthetic-b", "role-synthetic-b"),
      synthetic.entity("ent-synthetic-c", "role-synthetic-a")
    ],
    sequences: [synthetic.sequence("seq-synthetic-a", 4), synthetic.sequence("seq-synthetic-b", 3)]
  };
}

export const ORDINARY = Object.freeze({ calendarDate: null, dayType: "ordinary", dayTypeBasis: "visitor_selection" });
export const clock = (minuteOfDay) => ({ axis: "clock", minuteOfDay });
export const seq = (sequenceId, step) => ({ axis: "sequence", sequenceId, step });
