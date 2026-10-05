// Guided tour model (TASK-6-47). Pure and Node-testable: no DOM, no I/O.
// The stops are the published events of the tour's sequences in sequence order (steps), then by step span.
// Every historical string (titles, notes, names) is copied from data records; chrome text lives in strings.he.js.

/** Sequences of the morning-service tour, in narrative order; the second continues the first (its own orderNote says so). */
export const TOUR_SEQUENCE_IDS = Object.freeze(["seq-tamid-morning", "seq-tamid-morning-1-4-to-3-5"]);

const he = (text) => (text && typeof text === "object" ? text.he ?? null : typeof text === "string" ? text : null);

/** Locator of the event's first evidence record that has one (primary source: a supporting quotation, else the first), or null. */
function eventLocator(world, event) {
  const byId = new Map((world?.evidence ?? []).map((record) => [record.id, record]));
  for (const id of event?.evidenceIds ?? []) {
    const sources = byId.get(id)?.sources ?? [];
    const primary = sources.find((source) => source.relation === "supports" && source.excerptRole === "quotation") ?? sources[0];
    if (primary?.locator?.display) return primary.locator.display;
  }
  return null;
}

/**
 * @param {{ world: object, sequenceIds?: string[] }} input world = importWorld().world
 * @returns {{ stops: object[], sequences: object[] }}
 *   stop: { index, number, eventId, sequenceId, sequenceName, stageNote, continuation: { sequenceName, note } | null,
 *           startStep, endStep, title, locationId, locationBasis, inferred, pieces: [{ id, label }], placed }
 */
export function buildTourStops({ world, sequenceIds = TOUR_SEQUENCE_IDS }) {
  const sequencesById = new Map((world?.sequences ?? []).map((sequence) => [sequence.id, sequence]));
  const pieces = (world?.geometry ?? []).filter((piece) => piece?.locationId);
  const stops = [];
  const sequences = [];
  for (const sequenceId of sequenceIds) {
    const sequence = sequencesById.get(sequenceId);
    if (!sequence) continue;
    const events = (world?.events ?? [])
      .filter((event) => event?.timing?.axis === "sequence" && event.timing.sequenceId === sequenceId)
      .sort((a, b) => a.timing.startStep - b.timing.startStep || a.timing.endStep - b.timing.endStep || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!events.length) continue;
    const previous = sequences.at(-1) ?? null;
    sequences.push({ id: sequenceId, name: he(sequence.name), firstStopIndex: stops.length, stopCount: events.length });
    events.forEach((event, position) => {
      const own = pieces.filter((piece) => piece.locationId === event.locationId).map((piece) => ({ id: piece.id, label: he(piece.label) }));
      const index = stops.length;
      stops.push({
        index, number: index + 1, eventId: event.id, sequenceId, sequenceName: he(sequence.name), stageNote: he(sequence.stageNote),
        // The boundary stop carries the continuation note the data gives (the later sequence's orderNote).
        continuation: position === 0 && previous ? { sequenceName: he(sequence.name), previousSequenceName: previous.name, note: he(sequence.orderNote) } : null,
        startStep: event.timing.startStep, endStep: event.timing.endStep, title: he(event.title),
        locationId: event.locationId ?? null, locationBasis: event.locationBasis ?? null, inferred: event.locationBasis === "inferred",
        evidenceLocator: eventLocator(world, event),
        pieces: own, placed: own.length > 0
      });
    });
  }
  planShots(stops, world);
  // M3-10: a stop at the same placed location as the one before it needs no new camera move.
  stops.forEach((stop, i) => { stop.sameAsPrevious = i > 0 && stop.placed && stops[i - 1].placed && stops[i - 1].locationId === stop.locationId; });
  return { stops, sequences };
}

/** `?tour=<n>` (1-based) → 0-based stop index, or null when absent or out of range. Never throws. */
export function parseTourParam(search, stopCount) {
  let raw = null;
  try { raw = new URLSearchParams(typeof search === "string" ? search : "").get("tour"); } catch { return null; }
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  const number = Number(raw);
  return number >= 1 && number <= stopCount ? number - 1 : null;
}

/** `search` with `tour` set to the 1-based stop number (removed for null); other parameters keep their order. */
export function withTourParam(search, index) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("tour");
  if (Number.isInteger(index) && index >= 0) params.set("tour", String(index + 1));
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}

/** Keyboard: Escape exits; arrows follow reading direction, so in RTL ArrowLeft is "next". */
export function tourKeyAction(key, dir = "rtl") {
  if (key === "Escape") return "exit";
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return "next";
  if (key === back) return "prev";
  return null;
}

/** Touch: a mostly-horizontal swipe of at least `threshold` px; in RTL a swipe to the right moves forward. */
export function swipeAction(dx, dy, dir = "rtl", threshold = 60) {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  const forwardSign = dir === "rtl" ? 1 : -1;
  return Math.sign(dx) === forwardSign ? "next" : "prev";
}

/** Clamp a stop index into [0, count - 1]. */
export const clampStop = (index, count) => Math.min(Math.max(Math.trunc(Number(index)) || 0, 0), Math.max(count - 1, 0));

// ---- Camera plan (TASK-6-58) ----
/** Deterministic azimuth offsets (degrees) for consecutive stops that frame the same target, and matching elevations. */
export const SHOT_AZIMUTHS = Object.freeze([0, 25, -25, 50, -50]);
export const SHOT_ELEVATIONS = Object.freeze([40, 36, 42, 38, 44]);

/**
 * Where the camera looks for each stop. A placed stop frames its own pieces. A stop whose location has no piece frames
 * the nearest area the data relates it to by a recorded passage (spatial.topologyEdges, either direction) when that area
 * has a piece, else the whole mount. The related area is never highlighted: the model does not draw the stop's own place.
 * Consecutive stops with the same target get different azimuths so the view visibly moves.
 * stop.frame: { kind: "piece"|"area"|"overview", pieceIds, azimuth, elevation, areaLocationId, areaName }
 */
export function planShots(stops, world) {
  const pieceIdsAt = (locationId) => (world?.geometry ?? []).filter((piece) => piece?.locationId === locationId).map((piece) => piece.id);
  const locations = world?.locations ?? [];
  // The record names carry their attribution in parentheses ("(לפי משנה …)"); the caption wants the bare name.
  const nameOf = (id) => he(locations.find((location) => location.id === id)?.name)?.replace(/\s*\([^)]*\)\s*$/, "") ?? null;
  const related = (locationId) => {
    const own = locations.find((location) => location.id === locationId);
    const out = (own?.spatial?.topologyEdges ?? []).map((edge) => edge?.toLocationId);
    const back = locations.filter((location) => (location.spatial?.topologyEdges ?? []).some((edge) => edge?.toLocationId === locationId)).map((location) => location.id);
    return [...out, ...back].find((id) => id && pieceIdsAt(id).length > 0) ?? null;
  };
  let previousKey = null;
  let run = 0;
  for (const stop of stops) {
    let frame;
    if (stop.placed) frame = { kind: "piece", pieceIds: stop.pieces.map((piece) => piece.id), areaLocationId: null, areaName: null };
    else {
      const area = stop.locationId ? related(stop.locationId) : null;
      frame = area ? { kind: "area", pieceIds: pieceIdsAt(area), areaLocationId: area, areaName: nameOf(area) }
        : { kind: "overview", pieceIds: [], areaLocationId: null, areaName: null };
    }
    const key = frame.kind === "overview" ? null : frame.pieceIds.join("|");
    run = key !== null && key === previousKey ? run + 1 : 0;
    previousKey = key;
    stop.frame = { ...frame, azimuth: SHOT_AZIMUTHS[run % SHOT_AZIMUTHS.length], elevation: SHOT_ELEVATIONS[run % SHOT_ELEVATIONS.length] };
  }
  return stops;
}
