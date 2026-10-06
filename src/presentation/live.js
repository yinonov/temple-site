// Live mode controller (TASK-6-166/167, ADR-005 as amended after the TASK-6-161 challenge): the morning plays while the
// visitor walks. Sourced skeleton: the playback order (chained published sequences), the active events (worldStateAt),
// who and how many (markersAt), places (geometry pieces by locationId), access verdicts (accessibleAreas), conditional and
// alternative marks (tour.js, event records). Illustrative layer: playback durations, routes, walking, the taking-part cue,
// figure looks, fire and smoke. The light stays fixed (ADR-004 D2). Chrome text: strings.live; historical text: records.
import { h } from "./dom.js";
import { certaintyChip } from "./evidence-panel.js";
import { format } from "./strings.he.js";
import { conditionalLabel, conditionalNote } from "./tour.js";
import { isolateLatin } from "./view-model.js";
import { BUBBLE_CAP, bubbleModel, createBubbles, selectBubbles } from "./bubbles.js";
import { createGate } from "./live-gate.js";
import { accessibleAreas } from "../domain/access.js";
import { markersAt } from "../simulation/markers.js";
import { PLAYBACK_SPEEDS, buildTimeline, createPlayback, entityItineraries, liveStateAt, playbackReducer, slotAt, timeOfSlot } from "../simulation/clock.js";

/** `?live=1`, or a bare URL (no parameters at all), opens live mode. Never throws. */
export function parseLiveParam(search) {
  try {
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    if (params.get("live") === "1") return true;
    if (params.get("live") === "0" || params.get("view") === "page") return false;
    return [...params.keys()].length === 0;
  } catch { return false; }
}

/** `search` with live=1 set (only when other parameters exist: a bare URL already means live), or view=page on leaving. */
export function withLiveParam(search, on) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("live");
  params.delete("view");
  const others = [...params.keys()].length > 0;
  if (on && others) params.set("live", "1");
  if (!on) params.set("view", "page");
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}

const he = (text) => (text && typeof text === "object" ? text.he ?? "" : typeof text === "string" ? text : "");
const shortName = (text) => he(text).replace(/\s*\([^)]*\)\s*$/u, "").trim();
const EXCEPTION = /(^|[\s,;])אלא(?=[\s,;])|\bexcept\b/iu;

/**
 * TASK-6-161 A-08: forbidding rules whose own evidence states an exception. pieceId → the evidence record's Hebrew claim (data),
 * for the pieces `roleId` is forbidden. A gate on such a piece only warns.
 */
export function exceptionsFor(world, roleId) {
  const out = new Map();
  if (!roleId) return out;
  const evidence = new Map((world?.evidence ?? []).map((record) => [record.id, record]));
  for (const entry of accessibleAreas(roleId, world).pieces) {
    if (entry.status !== "forbidden") continue;
    const texts = entry.evidenceIds.map((id) => evidence.get(id)?.claim).filter(Boolean);
    const stated = texts.find((text) => EXCEPTION.test(he(text)) || EXCEPTION.test(text?.en ?? ""));
    if (stated) out.set(entry.pieceId, he(stated));
  }
  return out;
}

/**
 * Is the step one the records describe only under a condition (A-02), so that it is not performed by default?
 * TASK-6-169 L-02: a Shabbat variant (the same daily step, with a different wording on Shabbat) and a partial mark (part of
 * a daily step is conditional) are daily steps: they are performed, and their own mark and note are shown.
 */
export const isConditionalStop = (stop) => Boolean(stop?.conditional) && !stop.conditional.partial
  // L-14: a Shabbat variant whose own title opens "בשבת:" is an act that exists only on Shabbat, not a daily step's wording.
  && (stop.conditional.kind !== "shabbatVariant" || /^בשבת:/u.test(stop.title ?? ""));
/** Any mark the tour derives for the step (conditional, Shabbat variant, partial, High Priest). */
export const isMarkedStop = (stop) => Boolean(stop?.conditional);
/** Does the event reference an alternative group (route, place, performer or other reading left open)? (A-04) */
export const hasAlternatives = (event) => (event?.alternatives ?? []).length > 0;

/**
 * createLive({ world, strings, tour, sequenceOrder, reducedMotion, hooks }) → controller.
 * hooks: { solved(), state(), personaOptions(), viewFor(eventId), openEvent(eventId, opener), openRule(ruleId, opener),
 *   onTour(), onPersona(personaId|null), hudTop(), openLegend() }
 */
export function createLive({ world, strings, tour, sequenceOrder, reducedMotion = false, hooks }) {
  const s = strings.live;
  const stopsByEvent = new Map(tour.stops.map((stop) => [stop.eventId, stop]));
  const eventsById = new Map((world.events ?? []).map((event) => [event.id, event]));
  const sequencesById = new Map((world.sequences ?? []).map((sequence) => [sequence.id, sequence]));
  const timeline = buildTimeline(world, { sequenceOrder, secondsPerStep: 8 });
  const total = timeline.slots.length;
  const firstSlotOf = new Map(timeline.sequences.map((entry) => [entry.sequenceId, entry.firstSlot]));
  let playback = createPlayback({ duration: timeline.duration, playing: !reducedMotion });
  let renderer = null;
  let ctx = null;
  let figures = null;
  let fire = null;
  let bubbles = null;
  let gate = null;
  let plan = null;
  let active = [];
  let lastSlot = -1;
  let lastHud = 0;
  let running = false;
  let gateTimer = null;
  let includeConditional = false;
  let styleMode = "presentation";

  // ---------- HUD ----------
  const playButton = h("button", { type: "button", id: "live-play", class: "present-btn present-primary live-play", on: { click: () => dispatch({ type: "toggle" }) } });
  const scrub = h("input", { id: "live-scrub", class: "live-scrub", type: "range", min: "0", max: String(timeline.duration), step: "0.1", value: "0",
    "aria-label": s.scrubLabel, title: s.durationNote, on: { input: () => dispatch({ type: "seek", t: Number(scrub.value) }) } });
  const speed = h("select", { id: "live-speed", class: "live-speed", "aria-label": s.speedLabel, on: { change: () => dispatch({ type: "setSpeed", speed: Number(speed.value) }) } },
    ...PLAYBACK_SPEEDS.map((value) => h("option", { value: String(value), text: format(s.speedOption, { speed: value }), ...(value === 1 ? { selected: "" } : {}) })));
  const position = h("span", { class: "live-pos", id: "live-pos" });
  const stepText = h("span", { class: "live-step", id: "live-step" });
  const now = h("p", { class: "live-now", id: "live-now" }, position, " ", stepText);
  // A-06: the current step's disclosures never depend on the bubbles: certainty, place notes, conditional and open readings.
  const sourcesButton = h("button", { type: "button", id: "live-sources", class: "live-chip-btn", "aria-label": s.sourcesLabel, text: s.sources,
    on: { click: (event) => { const id = primaryEvent(); if (id) hooks.openEvent(id, event.currentTarget); } } });
  const chips = h("p", { class: "live-chips", id: "live-chips" });
  const dayChip = h("span", { class: "live-chip live-day", id: "live-day" });
  const chipRow = h("div", { class: "live-chip-row" }, dayChip, chips, sourcesButton);
  // A-09: the stage note and the continuation note at a sequence boundary (data), and A-02's conditional sentence.
  const condNote = h("p", { class: "live-cond-note", id: "live-cond-note", hidden: true });
  const notes = h("p", { class: "live-notes", id: "live-notes", hidden: true });
  const notesToggle = h("button", { type: "button", class: "live-chip-btn live-notes-toggle", id: "live-notes-toggle", "aria-controls": "live-notes", "aria-expanded": "false",
    hidden: true, text: s.notesMore, on: { click: () => setNotesOpen(notes.dataset.open !== "true") } });
  function setNotesOpen(on) { notes.dataset.open = String(on); notesToggle.setAttribute("aria-expanded", String(on)); notesToggle.textContent = on ? s.notesLess : s.notesMore; }
  const gotoButton = h("button", { type: "button", id: "live-goto", class: "present-btn", title: s.goToActionHint, text: s.goToAction, on: { click: () => goToAction() } });
  const bubblesButton = h("button", { type: "button", id: "live-bubbles-toggle", class: "present-btn", "aria-pressed": "true", title: s.bubblesLabel, text: s.bubbles,
    on: { click: () => setBubbles(!(bubbles?.isVisible() ?? true)) } });
  const conditionalButton = h("button", { type: "button", id: "live-conditional", class: "present-btn", "aria-pressed": "false", title: s.conditionalToggleLabel, text: s.conditionalToggle,
    on: { click: () => setConditional(!includeConditional) } });
  const personaSelect = h("select", { id: "live-persona", class: "live-persona", "aria-label": s.personaLabel, title: s.personaNote,
    on: { change: () => hooks.onPersona(personaSelect.value || null) } });
  const tourButton = h("button", { type: "button", id: "live-tour", class: "present-btn", title: s.tourHint, text: s.tour, on: { click: () => hooks.onTour() } });
  const gateText = h("span", { class: "live-gate-text" });
  const gateEvidence = h("button", { type: "button", class: "present-btn live-gate-evidence", text: s.gateEvidence });
  const gateNote = h("p", { class: "live-gate", id: "live-gate", role: "status", hidden: true }, gateText, " ", gateEvidence,
    h("button", { type: "button", class: "present-btn present-quiet", text: s.gateDismiss, on: { click: () => { gateNote.hidden = true; } } }));
  const info = h("p", { class: "live-info small", id: "live-info", role: "status", hidden: true });
  const reducedNote = h("p", { class: "live-info small", text: s.reduced, hidden: !reducedMotion });
  // A-15: the two-layer sentence is on screen at first load.
  const intro = h("p", { class: "live-intro", id: "live-intro" }, h("span", { text: s.intro }), " ",
    h("button", { type: "button", class: "live-chip-btn", text: s.introLegend, on: { click: () => hooks.openLegend?.() } }), " ",
    h("button", { type: "button", class: "live-chip-btn", text: s.introDismiss, on: { click: () => { intro.hidden = true; } } }));
  const hud = h("div", { class: "live-hud", id: "live-hud", role: "group", "aria-label": s.hudLabel },
    intro,
    h("div", { class: "live-row live-transport" }, playButton, scrub, speed),
    now, chipRow, condNote, h("div", { class: "live-notes-row" }, notes, notesToggle),
    h("div", { class: "live-row live-tools" }, gotoButton, bubblesButton, conditionalButton, personaSelect, tourButton),
    gateNote, info, reducedNote);

  function syncPlayButton() {
    playButton.textContent = playback.playing ? `❚❚ ${s.pause}` : `▶ ${s.play}`;
    playButton.setAttribute("aria-label", playback.playing ? s.pauseLabel : s.playLabel);
    playButton.setAttribute("aria-pressed", String(playback.playing));
    hud.dataset.playing = String(playback.playing);
  }
  function syncPersona() {
    const options = hooks.personaOptions();
    const current = hooks.state().persona ?? "";
    if (personaSelect.childElementCount !== options.length + 1) {
      personaSelect.replaceChildren(h("option", { value: "", text: s.personaNone }), ...options.map((option) => h("option", { value: option.id, text: option.shortLabel })));
    }
    personaSelect.value = current;
  }
  function syncDay() {
    const value = hooks.state().dayType;
    dayChip.textContent = format(s.dayChip, { label: strings.dayType.chipShort?.[value] ?? strings.dayType.values?.[value] ?? value });
    dayChip.dataset.dayType = value;
  }
  function stepLabelOf(slot) {
    const sequence = sequencesById.get(slot.sequenceId);
    return he((sequence?.steps ?? []).find((step) => step.step === slot.step)?.label);
  }
  function syncHud(force = false) {
    const clock = performance.now();
    if (!force && clock - lastHud < 200) return;
    lastHud = clock;
    const slot = slotAt(timeline, playback.t);
    if (!slot) return;
    if (document.activeElement !== scrub) scrub.value = String(Math.round(playback.t * 10) / 10);
    const n = slot.index + 1;
    position.textContent = format(s.positionShort, { n, total });
    if (stepText.dataset.slot !== String(slot.index)) {
      const label = stepLabelOf(slot);
      stepText.textContent = isolateLatin(label);
      stepText.title = label;
      stepText.dataset.slot = String(slot.index);
      scrub.setAttribute("aria-valuetext", `${format(s.position, { n, total })}: ${label}`);
    }
    hud.dataset.t = playback.t.toFixed(1);
    if (playback.ended) showInfo(s.ended);
  }
  function showInfo(text) { info.textContent = text ?? ""; info.hidden = !text; }

  function dispatch(action) {
    const next = playbackReducer(playback, action);
    if (next === playback) return;
    const wasEnded = playback.ended;
    playback = next;
    if (wasEnded && !playback.ended) showInfo(null);
    if (action.type === "play" || action.type === "toggle") intro.hidden = true;
    syncPlayButton();
    syncHud(true);
    renderer?.wake();
  }

  // ---------- plan (figures, spots, routes) ----------
  function dateContext() { return { calendarDate: null, dayType: hooks.state().dayType, dayTypeBasis: "visitor_selection" }; }
  function planKey() { const state = hooks.state(); return `${state.dayType}|${JSON.stringify(state.alternativeSelections)}|${includeConditional}`; }
  async function buildPlan() {
    const solved = hooks.solved();
    const pieces = solved?.pieces ?? [];
    const [{ buildNavGraph, forbiddenCells, forbiddenPieceIdsFrom, routeFor }, { buildFigurePlan, eventSpots, isRaised, pieceForLocation }] =
      await Promise.all([import("../scene/navgraph.js"), import("../scene/figures-layer.js")]);
    const graph = buildNavGraph(pieces);
    const forbidden = new Map();
    const forbiddenFor = (roleId) => {
      if (!forbidden.has(roleId)) forbidden.set(roleId, forbiddenCells(graph, forbiddenPieceIdsFrom(accessibleAreas(roleId, world))));
      return forbidden.get(roleId);
    };
    const spots = new Map();
    const raised = new Map(); // eventId → pieceId of the raised or closed piece
    const markersOf = new Map();
    for (const event of world.events ?? []) {
      const result = markersAt(world, { eventId: event.id });
      markersOf.set(event.id, result.markers);
      const piece = result.locationId ? pieceForLocation(pieces, result.locationId) : null;
      // L-04: no figure on or in a raised or closed piece (altar, ramp, chamber): no standing surface is drawn for them.
      if (isRaised(piece)) { raised.set(event.id, piece.id); spots.set(event.id, null); continue; }
      spots.set(event.id, piece ? eventSpots(result.markers, piece) : null);
    }
    const meta = new Map();
    const kinds = new Map((world.entities ?? []).map((entity) => [entity.id, entity.kind]));
    for (const list of markersOf.values()) for (const marker of list) {
      if (!meta.has(marker.entityId)) meta.set(marker.entityId, { displayCount: marker.displayCount, unspecifiedGroup: marker.countStated === false && kinds.get(marker.entityId) === "group" });
    }
    const include = (event) => includeConditional || !isConditionalStop(stopsByEvent.get(event.id));
    const itineraries = entityItineraries(world, timeline, { dateContext: dateContext(), include });
    const figurePlan = buildFigurePlan({ itineraries, secondsPerStep: timeline.secondsPerStep, spotsFor: (eventId) => spots.get(eventId) ?? null,
      routeBetween: (a, b, roleId) => routeFor({ graph, from: a, to: b, forbidden: forbiddenFor(roleId) }),
      meta: (entityId) => meta.get(entityId) ?? { displayCount: 1, unspecifiedGroup: false }, reduced: reducedMotion,
      noWalkInto: (eventId) => hasAlternatives(eventsById.get(eventId)) });
    return { key: planKey(), spots, raised, markersOf, pieces, figurePlan };
  }

  async function applyPlan() {
    if (!ctx) return;
    if (plan?.key === planKey() && plan.pieces === hooks.solved()?.pieces) return;
    const next = await buildPlan();
    if (!running) return;
    plan = next;
    figures.setPlan(plan.figurePlan);
    hud.dataset.planned = String(plan.figurePlan.length);
    // Fire and smoke: on the piece whose kind is the data's "altar" kind, only when it exists; constant all morning (A-12).
    if (!fire) {
      const firePiece = plan.pieces.find((piece) => piece.kind === "altar" && piece.box);
      if (firePiece) {
        const { createFire } = await import("../scene/ambience.js");
        if (running && !fire) fire = createFire(ctx.THREE, { parent: ctx.scene, box: firePiece.box });
      }
    }
    applyStyle();
    lastSlot = -1;
    syncGate();
    renderer.wake();
  }

  // ---------- slot → active events, HUD disclosures ----------
  function onSlot(slot) {
    lastSlot = slot.index;
    try {
      const { state } = liveStateAt({ world, timeline, t: playback.t, dateContext: dateContext(), alternativeSelections: hooks.state().alternativeSelections });
      active = (state?.activeEvents ?? []).map((item) => item.eventId);
    } catch (error) {
      console.error("live state failed", error);
      active = [];
    }
    hud.dataset.slot = String(slot.index);
    hud.dataset.active = active.join(" ");
    renderDisclosures(slot);
  }
  /** The event the HUD speaks for: the first active one that is placed, else the first. */
  function primaryEvent() { return active.find((id) => plan?.spots.get(id)) ?? active[0] ?? null; }
  function renderDisclosures(slot) {
    const id = primaryEvent();
    const stop = id ? stopsByEvent.get(id) : null;
    const view = id ? modelFor(id).view : null;
    const markers = id ? plan?.markersOf.get(id) ?? markersAt(world, { eventId: id }).markers : [];
    const model = id ? modelFor(id).model : null;
    const marked = active.map((eventId) => stopsByEvent.get(eventId)).filter(isMarkedStop);
    const conditionals = marked.filter(isConditionalStop);
    // Conditional and open-reading marks first: on a phone the row scrolls, and these must be in view.
    const items = [
      ...marked.slice(0, 1).map((item) => h("span", { class: "live-chip live-conditional", "data-conditional": item.conditional.kind, text: conditionalLabel(item.conditional, strings.tour) })),
      active.some((eventId) => hasAlternatives(eventsById.get(eventId))) ? h("span", { class: "live-chip live-alt", text: s.alternativeOpen }) : null,
      model?.locator ? h("span", { class: "live-chip", text: isolateLatin(format(s.locatorPrefix, { locator: model.locator })) }) : null,
      view?.certainty ? certaintyChip(view.certainty, strings, "live-chip live-certainty") : null,
      active.length > 1 ? h("span", { class: "live-chip", text: format(s.sharedSlot, { n: active.length }) }) : null,
      id && plan?.raised.has(id) ? h("span", { class: "live-chip", text: s.bubbleRaised }) : stop && !stop.placed ? h("span", { class: "live-chip", text: s.bubbleUnplaced }) : null,
      stop?.placed && stop.inferred ? h("span", { class: "live-chip", text: s.bubbleInferred }) : null,
      model?.count ? h("span", { class: "live-chip", text: model.count }) : null
    ].filter(Boolean);
    chips.replaceChildren(...items);
    sourcesButton.hidden = !id;
    void markers;
    // Notes: the sequence's stage note, the continuation note on a sequence's first slot, steps with no event before it
    // (A-18), and the conditional sentence (A-02). All except the last are data.
    const sequence = sequencesById.get(slot.sequenceId);
    const first = firstSlotOf.get(slot.sequenceId) === slot.index;
    const lines = [];
    if (first) {
      const firstStep = timeline.slots[slot.index].step;
      for (const step of (sequence?.steps ?? []).filter((item) => item.step < firstStep)) lines.push(he(step.label));
      const boundary = stopsByEvent.get(timeline.slots[slot.index].eventIds[0])?.continuation;
      if (boundary) lines.push(`${strings.tour.continuationHeading}: ${boundary.previousSequenceName} — ${boundary.note}`);
    }
    if (he(sequence?.stageNote)) lines.push(he(sequence.stageNote));
    // The conditional sentence is never clamped and comes first (L-03): its own element. A true conditional says it is not
    // performed by default; a Shabbat variant or a partial mark shows the tour's own note for that kind (L-02).
    const mark = marked[0] ?? null;
    const condLines = [];
    if (conditionals.length) condLines.push(includeConditional ? s.conditionalShown : s.conditionalHidden);
    if (mark) { const note = conditionalNote(mark.conditional, strings.tour); if (note) condLines.push(note); }
    condNote.textContent = condLines.map((line) => isolateLatin(line)).join(" ");
    condNote.hidden = condLines.length === 0;
    condNote.dataset.kind = mark?.conditional.kind ?? "";
    notes.textContent = lines.map((line) => isolateLatin(line)).join(" · ");
    notes.hidden = lines.length === 0;
    setNotesOpen(false);
    notesToggle.hidden = lines.length === 0;
    hud.dataset.conditional = String(conditionals.length > 0);
    hud.dataset.marked = mark?.conditional.kind ?? "";
    // L-06: a day type with no applicable event plays an empty Temple: say so.
    if (!active.length && hooks.state().dayType !== "ordinary") showInfo(s.emptyDayType); else if (info.textContent === s.emptyDayType) showInfo(null);
  }

  // ---------- bubbles ----------
  const models = new Map();
  function modelFor(eventId) {
    const key = `${eventId}|${planKey()}`;
    if (!models.has(key)) {
      const stop = stopsByEvent.get(eventId);
      const markers = plan?.markersOf.get(eventId) ?? markersAt(world, { eventId }).markers;
      const marks = [isMarkedStop(stop) ? conditionalLabel(stop.conditional, strings.tour) : null, hasAlternatives(eventsById.get(eventId)) ? s.alternativeOpen : null].filter(Boolean).join(" · ") || null;
      models.set(key, { model: bubbleModel({ stop, markers, world, strings, conditionalText: marks, raised: Boolean(plan?.raised.has(eventId)) }), view: hooks.viewFor(eventId) });
    }
    return models.get(key);
  }
  const scratch = { v: null, c: null };
  function placeBubbles() {
    if (!bubbles || !ctx) return;
    if (!bubbles.isVisible()) { bubbles.update([]); return; }
    const { camera, viewport, THREE } = ctx;
    scratch.v ??= new THREE.Vector3();
    scratch.c ??= new THREE.Vector3();
    const camPos = scratch.c.setFromMatrixPosition(camera.matrixWorld);
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const top = hooks.hudTop?.() ?? 0;
    const candidates = [];
    let docked = 0;
    for (const eventId of active) {
      if (!plan?.spots.get(eventId)) {
        // A-14: an unplaced event's label is not anchored in 3D (no area is chosen for it): it sits at a fixed screen spot.
        // L-16: docked labels stack downwards with a real gap, so two in one slot never cover each other.
        candidates.push({ id: eventId, distance: 0, onScreen: true, priority: 1, px: width / 2, py: top + 96 + docked * 104, docked: true });
        docked += 1;
        continue;
      }
      if (styleMode === "certainty") continue; // L-08: figures are hidden in the certainty style, so their labels are too
      const positions = figures?.eventPositions().get(eventId);
      if (!positions?.length) continue; // placed, but no figure drawn yet (or not performed): no floating label
      const mean = (k) => positions.reduce((sum, p) => sum + p[k], 0) / positions.length;
      const v = scratch.v.set(mean("x"), Math.max(...positions.map((p) => p.y)) + 2.1, mean("z"));
      const distance = camPos.distanceTo(v);
      v.project(camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02;
      candidates.push({ id: eventId, distance, onScreen, priority: 0, px: ((v.x + 1) / 2) * width, py: ((1 - v.y) / 2) * height });
    }
    hud.dataset.bubbleCandidates = candidates.map((c) => `${c.id}:${c.docked ? "docked" : c.onScreen ? "on" : "off"}:${Math.round(c.distance)}`).join(" ");
    const cap = width < 600 ? BUBBLE_CAP.phone : BUBBLE_CAP.wide;
    bubbles.update(selectBubbles(candidates, { cap }).map((item) => ({ ...item, ...modelFor(item.id) })), { minTop: top });
  }
  function setBubbles(on) {
    bubbles?.setVisible(on);
    bubblesButton.setAttribute("aria-pressed", String(Boolean(on)));
    try { localStorage.setItem("temple-live-bubbles", on ? "1" : "0"); } catch { /* per-viewer convenience only */ }
    placeBubbles();
  }
  function setConditional(on) {
    includeConditional = Boolean(on);
    conditionalButton.setAttribute("aria-pressed", String(includeConditional));
    models.clear();
    applyPlan().then(() => { const slot = slotAt(timeline, playback.t); if (slot) renderDisclosures(slot); renderer?.wake(); });
  }

  // ---------- certainty overlay (A-07): figures, fire and smoke are hidden in the certainty style ----------
  function applyStyle() {
    const show = styleMode !== "certainty";
    figures?.setVisible(show);
    fire?.setVisible(show);
    hud.dataset.style = styleMode;
  }

  // ---------- gates ----------
  function syncGate() {
    const persona = hooks.state().persona ?? null;
    gate = createGate({ pieces: plan?.pieces ?? hooks.solved()?.pieces ?? [], areas: persona ? accessibleAreas(persona, world) : null, exceptions: exceptionsFor(world, persona) });
    renderer?.setWalkGuard(gate.active ? onWalkStep : null);
    hud.dataset.gate = gate.active ? persona : "";
    gateNote.hidden = true; // a new persona or plan: the previous note no longer applies
    // L-05: a persona chosen while standing inside a piece its rules forbid is told so at once (not moved).
    if (gate.active && renderer) {
      const pose = renderer.walkPose();
      const inside = gate.forbiddenFootprintAt({ x: pose.x, z: pose.z });
      if (inside) showGate({ allowed: true, reason: "inside", pieceId: inside.id, locationId: inside.locationId ?? null });
    }
    syncPersona();
    syncDay();
  }
  function placeName(locationId) { return isolateLatin(shortName((world.locations ?? []).find((item) => item.id === locationId)?.name) || locationId || ""); }
  function onWalkStep(from, to) {
    const result = gate.check(from, to);
    if (!result.allowed || result.reason) showGate(result);
    return result.allowed;
  }
  function showGate(result) {
    const persona = hooks.personaOptions().find((option) => option.id === hooks.state().persona);
    const template = { forbidden: s.gateBlocked, inside: s.gateInside, exception: s.gateException }[result.reason] ?? s.gateConditional;
    gateText.textContent = format(template, { place: placeName(result.locationId), persona: persona?.shortLabel ?? "", exception: isolateLatin(result.exception ?? "") });
    const entry = accessibleAreas(hooks.state().persona, world).pieces.find((piece) => piece.pieceId === result.pieceId);
    const ruleId = (entry?.ruleIds ?? [])[0] ?? (entry?.conditionalRuleIds ?? [])[0] ?? null;
    gateEvidence.hidden = !ruleId;
    gateEvidence.onclick = ruleId ? (event) => hooks.openRule(ruleId, event.currentTarget) : null;
    gateNote.hidden = false;
    gateNote.dataset.reason = result.reason;
    if (!result.allowed) hud.dataset.gateHits = String(Number(hud.dataset.gateHits ?? 0) + 1);
    // The note stays until dismissed (or the persona changes), so its evidence button can always be reached.
  }
  /** A walker position outside every piece a published rule forbids to the persona (footprints, containment-aware). */
  function legal(spot) { return !gate?.active || !gate.forbiddenFootprintAt(spot); }

  // ---------- go to the action ----------
  function goToAction() {
    const placed = active.map((id) => ({ id, spots: plan?.spots.get(id), raisedPiece: plan?.raised.get(id) })).find((item) => item.spots || item.raisedPiece);
    if (!placed) { showInfo(s.goToActionNone); return; }
    const piece = plan.pieces.find((candidate) => candidate.id === (placed.spots?.pieceId ?? placed.raisedPiece));
    if (!piece) return;
    const anchors = placed.spots?.anchors ?? [];
    const target = anchors.length ? { x: anchors.reduce((a, p) => a + p.x, 0) / anchors.length, z: anchors.reduce((a, p) => a + p.z, 0) / anchors.length } : { x: piece.box.x, z: piece.box.z };
    if (!legal(target)) { showInfo(s.goToActionBlocked); return; }
    // Stand a few metres south of the figures (+z), facing them, never inside a piece forbidden to the persona.
    const clear = placed.raisedPiece ? piece.box.sz / 2 : 0; // beside a raised piece, not inside it
    for (const offset of [9, 6, 13, 4]) {
      const spot = { x: target.x, z: target.z + clear + offset };
      if (legal(spot)) {
        renderer.setWalkPose({ x: spot.x, z: spot.z, yaw: 0, pitch: -0.12 });
        showInfo(null);
        return;
      }
    }
    showInfo(s.goToActionBlocked);
  }

  /** Display choice: start south-east of the centre of the pieces where figures perform, looking at them; never inside a
   *  piece forbidden to the persona (A-08): then further out along the same line until it is clear. */
  function spawn() {
    const pieces = hooks.solved()?.pieces ?? [];
    const ids = new Set((world.events ?? []).map((event) => event.locationId).filter(Boolean));
    const used = pieces.filter((piece) => ids.has(piece.locationId) && piece.box && piece.box.sx * piece.box.sz < 4000);
    if (!used.length) return;
    const cx = used.reduce((sum, piece) => sum + piece.box.x, 0) / used.length;
    const cz = used.reduce((sum, piece) => sum + piece.box.z, 0) / used.length;
    let from = { x: cx + 14, z: cz + 26 };
    for (let k = 1; k < 40 && !legal(from); k += 1) from = { x: cx + 14 * (1 + k * 0.25), z: cz + 26 * (1 + k * 0.25) };
    renderer.setWalkPose({ x: from.x, z: from.z, yaw: Math.atan2(-(cx - from.x), -(cz - from.z)), pitch: -0.06 });
  }

  // ---------- frame ----------
  function onFrame(dt) {
    if (!running || !ctx) return false;
    ctx.camera.updateMatrixWorld(); // the walk pose may have changed since the last render
    playback = playbackReducer(playback, { type: "tick", dtMs: dt });
    if (playback.ended && hud.dataset.playing === "true") syncPlayButton();
    const slot = slotAt(timeline, playback.t);
    if (slot && slot.index !== lastSlot) onSlot(slot);
    figures?.update(playback.t, ctx.camera, { reduced: reducedMotion });
    fire?.update(performance.now() / 1000, { reduced: reducedMotion, pixelHeight: ctx.viewport.clientHeight });
    placeBubbles();
    syncHud();
    if (figures) {
      hud.dataset.figures = String(figures.stats().visible);
      hud.dataset.performing = figures.performing().map((id) => `${id}@${plan?.spots.get(id)?.pieceId ?? ""}`).join(" ");
      hud.dataset.drawn = figures.drawnEntities().join(" ");
    }
    return playback.playing;
  }

  return {
    hud,
    timeline,
    isRunning: () => running,
    /** Attach to a mounted renderer (presentation style) and start. */
    async start(nextRenderer) {
      renderer = nextRenderer;
      ctx = renderer.liveContext();
      running = true;
      const { createFiguresLayer } = await import("../scene/figures-layer.js");
      if (!running) return;
      figures = createFiguresLayer(ctx.THREE, { parent: ctx.scene });
      bubbles = createBubbles({ container: ctx.viewport, strings, onOpen: (eventId, opener) => hooks.openEvent(eventId, opener) });
      let on = true;
      try { on = localStorage.getItem("temple-live-bubbles") !== "0"; } catch { /* default on */ }
      setBubbles(on);
      renderer.clearMarkers?.();
      renderer.setMode("walk");
      syncPlayButton();
      syncPersona();
      syncDay();
      await applyPlan();
      if (!running) return;
      spawn();
      renderer.setLive({ onFrame });
      syncHud(true);
    },
    stop() {
      running = false;
      clearTimeout(gateTimer);
      renderer?.setLive(null);
      renderer?.setWalkGuard(null);
      figures?.dispose();
      fire?.dispose();
      bubbles?.dispose();
      figures = fire = bubbles = null;
      plan = null;
      ctx = null;
      lastSlot = -1;
      renderer = null;
    },
    /** Store changed (day type, choices, persona): rebuild what depends on it. */
    refresh() {
      if (!running) return;
      models.clear();
      applyPlan().then(() => { syncGate(); lastSlot = -1; renderer?.wake(); });
    },
    /** The presentation's style toggle: "certainty" hides figures, fire and smoke (A-07). */
    setStyle(mode) { styleMode = mode; applyStyle(); renderer?.wake(); },
    pause() { dispatch({ type: "pause" }); },
    seekSlot(index) { dispatch({ type: "seek", t: timeOfSlot(timeline, index) + 0.01 }); },
    focus() { playButton.focus({ preventScroll: true }); }
  };
}
