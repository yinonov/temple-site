// Single canonical query state (TASK-4-03). Every control dispatches an action here; rendering derives
// everything from worldStateAt(state) + buildViewModel(). Pure reducer, no DOM; testable in Node.
//
// state = { mode, time: { axis: "sequence", sequenceId, step } | { axis: "clock", minuteOfDay },
//           dayType, alternativeSelections, selectedEventId, inspector: { open, eventId, subject },
//           revealedEventIds,
//           timeMemory: { sequence, clock }, playing }
// `timeMemory` remembers the last position on the other axis so switching tabs is reversible; it is UI memory,
// not part of the world-state query. `playing` is the clock autoplay flag.

export const DAY_TYPES = Object.freeze(["unspecified", "ordinary", "festival", "yom_kippur"]);
export const DEFAULT_DAY_TYPE = "ordinary";
export const CLOCK_MIN = 0;
export const CLOCK_MAX = 1439;
export const CLOCK_STEP = 5;
export const PLAY_STEP = 15;
const DEFAULT_MINUTE = 720;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * @param {{ mode: string, sequences: Array<{ id: string, steps: Array<{ step: number }> }> }} options
 */
export function initialState({ mode, sequences = [], selections = {}, persona = null, sequenceId = null }) {
  // M3-14: ?seq=<sequenceId> restores the timeline's sequence (an unknown id falls back to the first sequence).
  const first = sequences.find((item) => item.id === sequenceId) ?? sequences[0];
  const sequence = first ? { axis: "sequence", sequenceId: first.id, step: firstStep(first) } : null;
  const clock = { axis: "clock", minuteOfDay: DEFAULT_MINUTE };
  return {
    mode,
    time: sequence ?? clock,
    // STRATEGY-2026-10 §7.5 (ADR-002): the default view is the ordinary day ("בכל יום"), shown as a visible,
    // changeable viewing-assumption chip; "unspecified" stays available in the day-type select.
    dayType: DEFAULT_DAY_TYPE,
    // The one selections map (groupId → optionId) for every visitor-selectable alternative group. Absent = the
    // solver's default. Serialised in the URL as ?alt=<groupId>:<optionId>,… (see parseAltParam/withAltParam).
    alternativeSelections: { ...selections },
    // Access persona (TASK-6-35): a role id or null. Serialised as ?persona=<roleId>; not part of the world-state query.
    persona: persona ?? null,
    selectedEventId: null,
    inspector: { open: false, eventId: null, subject: null },
    revealedEventIds: [],
    timeMemory: { sequence, clock },
    playing: false
  };
}

function firstStep(sequence) {
  const steps = (sequence?.steps ?? []).map((step) => step.step);
  return steps.length ? Math.min(...steps) : 0;
}

function stepBounds(sequences, sequenceId) {
  const sequence = sequences.find((item) => item.id === sequenceId);
  const steps = (sequence?.steps ?? []).map((step) => step.step);
  return steps.length ? { min: Math.min(...steps), max: Math.max(...steps) } : { min: 0, max: 0 };
}

/**
 * reduce(state, action, { sequences }) → new state. Unknown actions return the same state.
 */
export function reduce(state, action, { sequences = [] } = {}) {
  switch (action.type) {
    case "setAxis": {
      if (action.axis === state.time.axis) return state;
      const memory = { ...state.timeMemory, [state.time.axis]: state.time };
      const target = memory[action.axis];
      if (!target) return state; // e.g. no sequence in this mode
      return { ...state, time: target, timeMemory: memory, playing: false };
    }
    case "setStep": {
      if (state.time.axis !== "sequence") return state;
      const { min, max } = stepBounds(sequences, state.time.sequenceId);
      const step = clamp(Math.round(Number(action.step)), min, max);
      if (!Number.isFinite(step) || step === state.time.step) return state;
      return { ...state, time: { ...state.time, step } };
    }
    case "stepBy": {
      if (state.time.axis !== "sequence") return state;
      return reduce(state, { type: "setStep", step: state.time.step + action.delta }, { sequences });
    }
    case "setSequence": {
      if (!sequences.some((item) => item.id === action.sequenceId)) return state;
      const time = { axis: "sequence", sequenceId: action.sequenceId, step: firstStep(sequences.find((item) => item.id === action.sequenceId)) };
      return { ...state, time, timeMemory: { ...state.timeMemory, sequence: time }, playing: false };
    }
    case "setMinute": {
      if (state.time.axis !== "clock") return state;
      const minuteOfDay = clamp(Math.round(Number(action.minuteOfDay)), CLOCK_MIN, CLOCK_MAX);
      if (!Number.isFinite(minuteOfDay)) return state;
      const playing = action.fromPlay ? state.playing : false;
      if (minuteOfDay === state.time.minuteOfDay && playing === state.playing) return state;
      return { ...state, time: { axis: "clock", minuteOfDay }, playing };
    }
    case "tick": {
      if (state.time.axis !== "clock" || !state.playing) return state;
      const next = state.time.minuteOfDay + PLAY_STEP;
      if (next > CLOCK_MAX) return { ...state, time: { axis: "clock", minuteOfDay: CLOCK_MAX }, playing: false };
      return { ...state, time: { axis: "clock", minuteOfDay: next } };
    }
    case "setPlaying":
      if (state.time.axis !== "clock") return state.playing ? { ...state, playing: false } : state;
      return Boolean(action.playing) === state.playing ? state : { ...state, playing: Boolean(action.playing) };
    case "setDayType":
      return DAY_TYPES.includes(action.dayType) && action.dayType !== state.dayType ? { ...state, dayType: action.dayType } : state;
    case "selectAlternative": {
      const alternativeSelections = { ...state.alternativeSelections };
      if (action.optionId) alternativeSelections[action.groupId] = action.optionId;
      else delete alternativeSelections[action.groupId];
      return { ...state, alternativeSelections };
    }
    case "setPersona": {
      const persona = typeof action.personaId === "string" && action.personaId ? action.personaId : null;
      return persona === state.persona ? state : { ...state, persona };
    }
    case "selectEvent":
      return { ...state, selectedEventId: action.eventId ?? null };
    case "openInspector":
      return { ...state, selectedEventId: action.eventId, inspector: { open: true, eventId: action.eventId, subject: `event:${action.eventId}` } };
    case "openSubject": {
      // Evidence for a non-event subject: "step:<n>", "order:<sequenceId>", "location:<locationId>".
      if (typeof action.subject !== "string" || !/^(step|order|location|edge|event|geometry|rule):/.test(action.subject)) return state;
      const eventId = action.subject.startsWith("event:") ? action.subject.slice(6) : null;
      return { ...state, inspector: { open: true, eventId, subject: action.subject } };
    }
    case "closeInspector":
      return state.inspector.open ? { ...state, inspector: { open: false, eventId: null, subject: null } } : state;
    case "toggleReveal": {
      const has = state.revealedEventIds.includes(action.eventId);
      const revealedEventIds = has ? state.revealedEventIds.filter((id) => id !== action.eventId) : [...state.revealedEventIds, action.eventId].sort();
      return { ...state, revealedEventIds };
    }
    default:
      return state;
  }
}

/** World-state query derived from the store state (the only input worldStateAt receives). */
export function toQuery(state) {
  const time = state.time.axis === "clock"
    ? { axis: "clock", minuteOfDay: state.time.minuteOfDay }
    : { axis: "sequence", sequenceId: state.time.sequenceId, step: state.time.step };
  return {
    dateContext: { calendarDate: null, dayType: state.dayType, dayTypeBasis: "visitor_selection" },
    time,
    alternativeSelections: { ...state.alternativeSelections }
  };
}

/** Minimal observable store. */
export function createStore(initial, context) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    dispatch(action) {
      const next = reduce(state, action, context);
      if (next === state) return state;
      const previous = state;
      state = next;
      for (const listener of listeners) listener(state, previous, action);
      return state;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

/**
 * Parse the `alt` query parameter against the world's alternative groups. Only visitor-selectable groups and
 * options that exist are kept; anything else (unknown group, unknown option, show_all group, malformed entry,
 * duplicate group) is ignored silently so the solver default applies. Pure; never throws.
 * @param {string} search location.search (with or without the leading "?")
 * @param {Array<{ id: string, selectionPolicy?: string, options?: Array<{ id: string }> }>} groups
 * @returns {Record<string, string>}
 */
export function parseAltParam(search, groups) {
  const result = {};
  let raw = null;
  try { raw = new URLSearchParams(typeof search === "string" ? search : "").get("alt"); } catch { return result; }
  if (!raw) return result;
  const byId = new Map((Array.isArray(groups) ? groups : []).map((group) => [group?.id, group]));
  for (const part of raw.split(",")) {
    const index = part.indexOf(":");
    if (index <= 0) continue;
    const groupId = part.slice(0, index).trim();
    const optionId = part.slice(index + 1).trim();
    const group = byId.get(groupId);
    if (!group || group.selectionPolicy !== "visitor_selectable" || Object.hasOwn(result, groupId)) continue;
    if ((group.options ?? []).some((option) => option?.id === optionId)) result[groupId] = optionId;
  }
  return result;
}

/** The `alt` value for a selections map: sorted `groupId:optionId` pairs joined by commas ("" when empty). */
export function serializeAlt(selections) {
  return Object.entries(selections ?? {}).filter(([groupId, optionId]) => groupId && typeof optionId === "string" && optionId)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([groupId, optionId]) => `${groupId}:${optionId}`).join(",");
}

/**
 * `search` with its `alt` parameter replaced by the selections (removed when empty); other parameters keep their
 * order and encoding. The alt value is written unescaped (ids are ASCII kebab-case; ":" and "," are legal in a query).
 */
export function withAltParam(search, selections) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("alt");
  const rest = params.toString();
  const alt = serializeAlt(selections);
  const query = [rest, alt ? `alt=${alt}` : ""].filter(Boolean).join("&");
  return query ? `?${query}` : "";
}

/** The `persona` query parameter if it names one of `personaIds`; otherwise null (ignored silently). Pure; never throws. */
export function parsePersonaParam(search, personaIds) {
  let raw = null;
  try { raw = new URLSearchParams(typeof search === "string" ? search : "").get("persona"); } catch { return null; }
  return raw && (Array.isArray(personaIds) ? personaIds : []).includes(raw) ? raw : null;
}

/** `search` with its `persona` parameter set (or removed when null); other parameters keep their order. */
export function withPersonaParam(search, personaId) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("persona");
  if (personaId) params.set("persona", personaId);
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}

/** The `seq` query parameter if it names one of `sequenceIds`; otherwise null (ignored silently). Pure; never throws. */
export function parseSeqParam(search, sequenceIds) {
  let raw = null;
  try { raw = new URLSearchParams(typeof search === "string" ? search : "").get("seq"); } catch { return null; }
  return raw && (Array.isArray(sequenceIds) ? sequenceIds : []).includes(raw) ? raw : null;
}

/** `search` with `seq` set to the chosen sequence; removed when it is the default (first) sequence or null. */
export function withSeqParam(search, sequenceId, defaultSequenceId = null) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("seq");
  if (sequenceId && sequenceId !== defaultSequenceId) params.set("seq", sequenceId);
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}
