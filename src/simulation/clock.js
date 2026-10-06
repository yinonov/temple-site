// Playback clock over the chained sequences (TASK-6-162, ADR-005 Decisions 1–2). Pure ESM: no DOM, no clock reads,
// no randomness. Same inputs → deep-equal outputs.
//
// The published events are timed on the SEQUENCE axis only: steps are ordinals and the records say the sources give no
// durations or hours. Playback therefore gives every step slot the same, ILLUSTRATIVE length (`secondsPerStep`) and
// queries worldStateAt on the sequence axis. Nothing here produces a clock time, an hour or a minuteOfDay.
//
// The chain order of the sequences is an INPUT (`sequenceOrder`): the presentation derives it from the data with
// orderSequences (tour.js); simulation must not import presentation.
import { worldStateAt } from "./world-state.js";
import { applicability } from "./date-context.js";

/** Seconds of playback per sequence step at speed 1. A display choice (ADR-005 D2), not a duration claim. */
export const DEFAULT_SECONDS_PER_STEP = 6;
export const PLAYBACK_SPEEDS = Object.freeze([0.5, 1, 2, 4]);
export const DURATION_BASIS = "illustrative";

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
/** Tour order inside a sequence (tour.js buildTourStops): start step, end step, id. */
const byTourOrder = (a, b) => a.timing.startStep - b.timing.startStep || a.timing.endStep - b.timing.endStep || compareText(a.id, b.id);

/**
 * buildTimeline(world, { sequenceOrder, secondsPerStep }) →
 *   { slots: [{ index, sequenceId, step, start, end, eventIds }], sequences: [{ sequenceId, firstSlot, slotCount }],
 *     duration, secondsPerStep, durationBasis: "illustrative" }
 * One slot per step in [min startStep, max endStep) of each sequence's events (half-open, as world-state). `eventIds` are the
 * sequence events whose interval holds the step, in tour order (day type is applied later, by worldStateAt / itineraries).
 * Unknown sequence ids and sequences without events are skipped.
 */
export function buildTimeline(world, { sequenceOrder = [], secondsPerStep = DEFAULT_SECONDS_PER_STEP } = {}) {
  if (!(secondsPerStep > 0)) throw new TypeError("secondsPerStep must be > 0");
  const known = new Set((world?.sequences ?? []).map((sequence) => sequence.id));
  const bySequence = new Map();
  for (const event of world?.events ?? []) {
    if (event?.timing?.axis !== "sequence") continue;
    const list = bySequence.get(event.timing.sequenceId) ?? [];
    list.push(event);
    bySequence.set(event.timing.sequenceId, list);
  }
  const slots = [];
  const sequences = [];
  for (const sequenceId of [...new Set(sequenceOrder)]) {
    const events = known.has(sequenceId) ? [...(bySequence.get(sequenceId) ?? [])].sort(byTourOrder) : [];
    if (!events.length) continue;
    const first = Math.min(...events.map((event) => event.timing.startStep));
    const last = Math.max(...events.map((event) => event.timing.endStep));
    sequences.push({ sequenceId, firstSlot: slots.length, slotCount: last - first });
    for (let step = first; step < last; step += 1) {
      const index = slots.length;
      slots.push({ index, sequenceId, step, start: index * secondsPerStep, end: (index + 1) * secondsPerStep,
        eventIds: events.filter((event) => event.timing.startStep <= step && step < event.timing.endStep).map((event) => event.id) });
    }
  }
  return { slots, sequences, duration: slots.length * secondsPerStep, secondsPerStep, durationBasis: DURATION_BASIS };
}

/** Clamp t into [0, duration]. */
export const clampTime = (timeline, t) => Math.min(Math.max(Number(t) || 0, 0), timeline?.duration ?? 0);

/**
 * slotAt(timeline, t) → { index, sequenceId, step, fraction } | null (empty timeline).
 * Half-open slots; t at or past the end resolves to the last slot with fraction 1.
 */
export function slotAt(timeline, t) {
  const slots = timeline?.slots ?? [];
  if (!slots.length) return null;
  const time = clampTime(timeline, t);
  const index = Math.min(Math.floor(time / timeline.secondsPerStep), slots.length - 1);
  const slot = slots[index];
  const fraction = Math.min(Math.max((time - slot.start) / timeline.secondsPerStep, 0), 1);
  return { index, sequenceId: slot.sequenceId, step: slot.step, fraction };
}

/** Start time of slot `index` (clamped). */
export const timeOfSlot = (timeline, index) => {
  const count = timeline?.slots?.length ?? 0;
  if (!count) return 0;
  return Math.min(Math.max(Math.trunc(index) || 0, 0), count - 1) * timeline.secondsPerStep;
};

/** Normalised playback position 0..1 (a fraction of the playback, not an hour). */
export const progressOf = (timeline, t) => (timeline?.duration ? clampTime(timeline, t) / timeline.duration : 0);

/**
 * liveStateAt({ world, timeline, t, dateContext, alternativeSelections }) → { slot, state }
 * `state` is worldStateAt on the SEQUENCE axis at the slot's step (null for an empty timeline).
 */
export function liveStateAt({ world, timeline, t, dateContext, alternativeSelections = {} }) {
  const slot = slotAt(timeline, t);
  if (!slot) return { slot: null, state: null };
  const state = worldStateAt({ world, dateContext, alternativeSelections, time: { axis: "sequence", sequenceId: slot.sequenceId, step: slot.step } });
  return { slot, state };
}

/**
 * Per-entity itineraries: entityId → [{ fromSlot, toSlot, eventId, locationId, roleId }] (toSlot exclusive), consecutive
 * slots of the same event merged. Only events that apply on the chosen day type (as worldStateAt places them).
 * An entity listed in two events in one slot keeps the first in tour order (the exclusive-attendance check reports it).
 */
export function entityItineraries(world, timeline, { dateContext, include = () => true } = {}) {
  const events = new Map((world?.events ?? []).map((event) => [event.id, event]));
  // `include(event)`: the caller may leave events out (TASK-6-161 A-02: conditional steps are not performed by default).
  const applies = (event) => applicability(event, dateContext) === "applies" && include(event);
  const out = new Map();
  for (const slot of timeline?.slots ?? []) {
    const seen = new Set();
    for (const eventId of slot.eventIds) {
      const event = events.get(eventId);
      if (!event || !applies(event)) continue;
      for (const participant of event.participants ?? []) {
        const entityId = participant?.entityId;
        if (!entityId || seen.has(entityId)) continue;
        seen.add(entityId);
        const list = out.get(entityId) ?? [];
        const last = list.at(-1);
        if (last && last.eventId === eventId && last.toSlot === slot.index) last.toSlot = slot.index + 1;
        else list.push({ fromSlot: slot.index, toSlot: slot.index + 1, eventId, locationId: event.locationId ?? null, roleId: participant.roleId ?? null });
        out.set(entityId, list);
      }
    }
  }
  return new Map([...out.entries()].sort((a, b) => compareText(a[0], b[0])));
}

// ---- Playback state (a reducer; the browser loop feeds it `tick` with the elapsed milliseconds) ----

/** Initial playback state. */
export function createPlayback({ duration = 0, playing = false, speed = 1, t = 0 } = {}) {
  return Object.freeze({ t: Math.min(Math.max(t, 0), duration), duration, playing: Boolean(playing) && duration > 0, speed: PLAYBACK_SPEEDS.includes(speed) ? speed : 1, ended: false });
}

/**
 * playbackReducer(state, action) → new state (same object when nothing changes).
 * Actions: { type: "play" | "pause" | "toggle" | "restart" }, { type: "setSpeed", speed }, { type: "seek", t },
 * { type: "tick", dtMs }. Playback stops at the end (no loop); "play" at the end restarts from 0.
 */
export function playbackReducer(state, action) {
  const next = (patch) => Object.freeze({ ...state, ...patch });
  switch (action?.type) {
    case "play":
      if (state.playing || state.duration <= 0) return state;
      return state.t >= state.duration ? next({ playing: true, t: 0, ended: false }) : next({ playing: true, ended: false });
    case "pause":
      return state.playing ? next({ playing: false }) : state;
    case "toggle":
      return playbackReducer(state, { type: state.playing ? "pause" : "play" });
    case "restart":
      return next({ t: 0, ended: false });
    case "setSpeed":
      return PLAYBACK_SPEEDS.includes(action.speed) && action.speed !== state.speed ? next({ speed: action.speed }) : state;
    case "seek": {
      const t = Math.min(Math.max(Number(action.t) || 0, 0), state.duration);
      return t === state.t ? state : next({ t, ended: t >= state.duration && state.duration > 0 ? state.ended : false });
    }
    case "tick": {
      const dt = Number(action.dtMs);
      if (!state.playing || !(dt > 0)) return state;
      const t = state.t + (Math.min(dt, 250) / 1000) * state.speed; // a long frame (hidden tab) never jumps more than 250 ms
      return t >= state.duration ? next({ t: state.duration, playing: false, ended: true }) : next({ t });
    }
    default:
      return state;
  }
}
