// App shell: load data → importWorld(mode) → store → worldStateAt(query) → buildViewModel → DOM.
// Historical text reaches the DOM only through view-model fields (data); chrome text comes from strings.he.js.
import { importWorld } from "../domain/importer.js";
import { worldStateAt } from "../simulation/world-state.js";
import { markersAt } from "../simulation/markers.js";
import { DataLoadError, loadWorldData } from "./data-source.js";
import { h } from "./dom.js";
import { createEvidenceDialog, evidenceButton, renderEventCard } from "./evidence-panel.js";
import { createFeedbackDialog, reportButton } from "./feedback.js";
import { createSceneFilterMemo, inferredLocationIds, relevantLocationIds } from "./scene-view.js";
import { buildGeometryView, geometrySubject } from "./geometry-view.js";
import { columnBudgetForWindow } from "../scene/column-budget.js";
import { webglAvailable } from "../scene/webgl-check.js";
import { renderAmahChip, renderConflicts, renderAlternatives, renderGeometryProvenance, renderNotShown, renderPersona, renderPieceList, renderUnresolved } from "./geometry-panel.js";
import { accessibleAreas } from "../domain/access.js";
import { buildPersonaView, personaOptions, pieceAccessMap, ruleEvidence } from "./persona-view.js";
import { createStore, initialState, parseAltParam, parsePersonaParam, parseSeqParam, toQuery, withAltParam, withPersonaParam, withSeqParam } from "./store.js";
import { format, strings } from "./strings.he.js";
import { createTimeline } from "./timeline.js";
import { buildTourStops, conditionalLabel, conditionalNote, endText as tourEndText, orderSequences, parseTourParam, withTourParam } from "./tour.js";
import { createLive, parseLiveParam, withLiveParam } from "./live.js";
import { createTourPanel } from "./tour-panel.js";
import { createLicencesDialog } from "./licences.js";
import { createPresentation, parsePresentParam, withPresentParam } from "./present.js";
import { isPublicBuild, siteUrl } from "./site.js";
import { buildViewModel, isolateLatin } from "./view-model.js";

const $ = (id) => document.getElementById(id);
const MODES = ["published", "preview"];

export function modeFromSearch(search) {
  const requested = new URLSearchParams(search).get("mode");
  if (requested === null) return { mode: "published", unknown: false };
  return MODES.includes(requested) ? { mode: requested, unknown: false } : { mode: "published", unknown: true };
}

function applyChrome(mode, unknownMode, previewBlocked = false) {
  const s = strings;
  document.title = (mode === "preview" ? s.app.previewTitlePrefix : "") + s.app.title;
  $("skip-link").textContent = s.app.skipToState;
  $("app-kicker").textContent = s.app.kicker;
  $("app-heading").textContent = s.app.heading;
  $("app-scope").textContent = s.app.scope;
  $("mode-label").textContent = s.app.modeLabel[mode];
  $("footer-note").textContent = s.footer.note;
  for (const id of ["feedback-general", "feedback-footer"]) {
    $(id).textContent = s.feedback.generalReport;
    $(id).hidden = false;
  }
  $("licences-button").textContent = s.licences.button;
  $("licences-button").hidden = false;
  $("loading").textContent = s.app.loading;
  $("state-heading").textContent = s.state.heading;
  $("scene-heading").textContent = s.scene.heading;
  document.body.dataset.mode = mode;
  if (mode === "preview") {
    $("mode-banner").hidden = false;
    $("mode-banner-text").textContent = s.banner.preview;
    $("mode-banner-detail").hidden = false;
    $("mode-banner-detail").textContent = s.banner.previewDetail;
    if (!document.querySelector('meta[name="robots"]')) document.head.append(h("meta", { name: "robots", content: "noindex, nofollow" }));
  } else if (previewBlocked) {
    // Public build: ?mode=preview is not available; the page stays on the published view and says so.
    $("mode-banner").hidden = false;
    $("mode-banner").classList.add("is-info");
    $("mode-banner-text").textContent = s.banner.previewUnavailable;
  } else if (unknownMode) {
    $("mode-banner").hidden = false;
    $("mode-banner").classList.add("is-info");
    $("mode-banner-text").textContent = s.banner.unknownMode;
  }
}

function showError(error) {
  const s = strings.error;
  const panel = $("error-state");
  const file = error instanceof DataLoadError && error.file ? error.file : null;
  panel.replaceChildren(
    h("h2", { class: "panel-heading", text: s.title }),
    h("p", { text: error instanceof DataLoadError && error.kind === "manifest_rejected" ? s.manifestRejected : s.body }),
    file ? h("p", { class: "muted", dir: "auto" }, format(s.detail, { file })) : null,
    h("button", { type: "button", id: "retry-button", text: s.retry, on: { click: () => location.reload() } }));
  panel.hidden = false;
  for (const id of ["timeline", "state-region", "scene"]) $(id).hidden = true;
  $("loading").hidden = true;
  $("app").setAttribute("aria-busy", "false");
}

function renderList(container, heading, items) {
  container.hidden = items.length === 0;
  container.replaceChildren(...(items.length ? [h("h3", { text: heading }),
    h("ul", {}, items.map((item) => h("li", { "data-event-id": item.id, "data-basis": item.basis ?? null },
      h("span", { text: item.title ?? item.id }), " — ",
      h("span", { class: "reason-text", text: item.reasonText }),
      item.note ? h("span", { class: "block small muted", text: item.note }) : null,
      // R-01: an event hidden by a viewing assumption can be shown anyway, labelled as such.
      item.canReveal ? h("button", { type: "button", class: "reveal-button", "data-event-id": item.id, "data-focus-key": `reveal-${item.id}`,
        "aria-pressed": String(item.revealed), text: item.revealed ? strings.conditionalReveal.hide : item.revealLabel,
        on: { click: () => store.dispatch({ type: "toggleReveal", eventId: item.id }) } }) : null)))] : []));
}

function renderEmpty(container, vm) {
  const empty = vm.empty;
  container.hidden = !empty;
  if (!empty) { container.replaceChildren(); return; }
  const children = [h("p", { class: "empty-title", text: empty.title }), h("p", { class: "empty-text", text: empty.text })];
  if (empty.reason === "no_approved_data" && vm.mode === "published" && !isPublicBuild()) {
    const e = strings.previewExplainer;
    children.push(h("details", { class: "explainer", id: "preview-explainer" },
      h("summary", { text: e.summary }),
      h("p", { text: e.body }),
      h("a", { href: siteUrl("./?mode=preview"), id: "preview-link", text: e.link })));
  }
  if (empty.reason === "only_unplaced_events") {
    children.push(h("button", { type: "button", class: "inline-action", "data-focus-key": "empty-switch",
      text: strings.timeline.switchToSequence, on: { click: () => { store.dispatch({ type: "setAxis", axis: "sequence" }); $("tab-sequence").focus(); } } }));
  }
  container.replaceChildren(...children);
}

let store;
let world;
let data;
let importResult;
let dialog;
let feedback;
let licences;
let timeline;
let lastLive = "";
let dayTypeRecords = null;
let scene = null;
let memoScene = null;
// Guided tour (TASK-6-47): UI-local state; the URL carries ?tour=<n>.
let tourPanel = null;
let tourEventView = null;
let tourEvidenceFor = null;
let tourTotal = 0;
let tourChapters = [];
let tourRange = null;
// Presentation mode (TASK-6-57): a second renderer lives in the overlay; scene3d.renderer points at it while presenting.
let presentation = null;
const presenting = { token: 0, renderer: null, pageRenderer: null };
// M6 live mode (ADR-005): the morning plays inside the presentation overlay; liveEventView backs the evidence dialog for a bubble.
let live = null;
let liveEventView = null;
let tourDataAll = null;
const isPresenting = () => Boolean(presentation?.isOpen());
const memoFilter = createSceneFilterMemo();
let sceneAnnotations = { inferred: new Set(), via: new Map() };
// 3D view (TASK-6-19): UI-local state. The solver and the Three.js renderer are imported only when the panel opens.
const scene3d = { open: false, loading: false, solver: null, renderer: null, status: null, view: null, reducedMotion: null,
  webgl: null, outlineKey: undefined, autoFramedAll: false, flownSolved: null };

// ---- Scene (Phase 6 topology diagram; docs/scene/integration.md). Loaded dynamically so that a scene failure
// never breaks the textual view, which stays complete on its own.
function labelFor(ref) {
  const byId = (list, id) => (list ?? []).find((record) => record.id === id);
  // Latin/Greek runs are bidi-isolated so the visual label keeps its punctuation in place (R-15).
  if (ref?.kind === "location") return isolateLatin(byId(world.locations, ref.id)?.name?.he ?? "");
  if (ref?.kind === "entity") return isolateLatin(byId(world.entities, ref.id)?.label?.he ?? "");
  if (ref?.kind === "topologyEdgeVia") return isolateLatin(byId(world.locations, ref.locationId)?.spatial?.topologyEdges?.[ref.index]?.via?.he ?? "");
  if (ref?.kind === "locationSchematicNote") return byId(world.locations, ref.id)?.spatial?.schematic?.note ?? "";
  return "";
}

function announce(message) {
  // Re-announce identical text by clearing first.
  const live = $("live-status");
  live.textContent = "";
  lastLive = "";
  requestAnimationFrame(() => { live.textContent = message; lastLive = message; });
}

function hideChooser() {
  $("scene-chooser").hidden = true;
  $("scene-chooser").replaceChildren();
}

function onSceneSelect({ eventIds }) {
  hideChooser();
  if (eventIds.length === 1) {
    store.dispatch({ type: "openInspector", eventId: eventIds[0] });
  } else if (eventIds.length > 1) {
    const titleOf = (id) => world.events.find((event) => event.id === id)?.title?.he ?? id;
    const chooser = $("scene-chooser");
    chooser.replaceChildren(
      h("p", { id: "scene-chooser-title", text: strings.scene.chooserTitle }),
      h("ul", { "aria-labelledby": "scene-chooser-title" }, eventIds.map((id) => h("li", {},
        h("button", { type: "button", class: "chooser-option", "data-event-id": id, "data-focus-key": `chooser-${id}`, text: titleOf(id),
          on: { click: () => { hideChooser(); store.dispatch({ type: "openInspector", eventId: id }); } } })))),
      h("button", { type: "button", class: "chooser-close", text: strings.scene.chooserClose, on: { click: hideChooser } }));
    chooser.hidden = false;
    chooser.querySelector("button")?.focus();
  } else {
    announce(strings.scene.noEventHere);
  }
}

function annotateSceneItem(item) {
  if (item.refKind !== "location") return null;
  const via = sceneAnnotations.via.get(item.refId) ?? [];
  return { inferred: sceneAnnotations.inferred.has(item.refId), nameParts: via.map((text) => `${strings.scene.graph.edgeVia} ${text}`) };
}

function edgeViaLabels() {
  const map = new Map();
  for (const location of world.locations ?? []) {
    (location.spatial?.topologyEdges ?? []).forEach((edge, index) => {
      const text = labelFor({ kind: "topologyEdgeVia", locationId: location.id, index });
      if (!text) return;
      for (const id of [location.id, edge.toLocationId]) map.set(id, [...(map.get(id) ?? []), text]);
    });
  }
  return map;
}

/** Resolve an inspector subject key to { title, evidence, location?, returnKey } from the view model. */
function resolveSubject(subject, vm, worldState = null) {
  if (!subject) return null;
  const [kind, ...rest] = subject.split(":");
  const id = rest.join(":");
  const preview = vm.mode === "preview";
  if (kind === "geometry" && scene3d.view) {
    const geo = geometrySubject({ view: scene3d.view, pieceId: id, world, strings, worldState });
    if (!geo) return null;
    // M2-02: the chosen persona's verdict for this piece.
    const personaView = buildPersonaView({ world, personaId: store.get().persona, strings });
    const verdict = personaView?.personaId ? personaView.pieceVerdicts?.[id] : null;
    const access = verdict ? { ...verdict, personaId: personaView.personaId, personaLabel: personaView.label } : null;
    return { title: geo.title, evidence: geo.evidence, preview, returnKey: `geo-${id}`, tier: geo.piece.certainty.tier,
      report: { target: { kind: "geometry", id }, subject: geo.piece.label },
      extra: renderGeometryProvenance(geo, strings, {
        onOpenEvent: (eventId) => { store.dispatch({ type: "closeInspector" }); store.dispatch({ type: "openInspector", eventId }); },
        onSelectAlternative: (groupId, optionId) => store.dispatch({ type: "selectAlternative", groupId, optionId }),
        access
      }) };
  }
  if (kind === "rule") {
    const found = ruleEvidence({ world, ruleId: id, strings });
    return found ? { title: format(strings.scene3d.persona.evidenceDialogTitle, { rule: found.text }), evidence: found.items, preview,
      returnKey: `persona-rule-${id}` } : null;
  }
  if (kind === "event") {
    // A tour stop's event need not be active at the timeline's current step; its own view is searched last.
    const event = [...vm.events, ...(vm.revealedEvents ?? []), ...(tourEventView ? [tourEventView] : []), ...(liveEventView ? [liveEventView] : [])].find((item) => item.id === id);
    const eventRecord = (world?.events ?? []).find((item) => item.id === id);
    const sequenceRecord = (world?.sequences ?? []).find((item) => item.id === eventRecord?.timing?.sequenceId);
    return event ? { title: format(strings.evidence.dialogTitle, { title: event.title ?? event.id }), evidence: event.evidence, location: event.location,
      collapseIds: sequenceRecord?.orderEvidenceIds ?? [], eventId: event.id, alternatives: (event.alternatives ?? []).filter((group) => !group.selectable),
      returnKey: liveEventView?.id === event.id && live?.isRunning() ? `live-bubble-${event.id}` : tourEvidenceFor === event.id ? `show-evidence-${event.id}-tour` : `show-evidence-${event.id}`, preview, tier: event.tier } : null;
  }
  const seq = vm.time?.sequence;
  if (kind === "step" && seq) {
    const step = seq.steps.find((item) => String(item.step) === id);
    return step ? { title: step.evidenceTitle, evidence: step.evidence, returnKey: `evidence-${subject}`, preview } : null;
  }
  if (kind === "order" && seq && seq.id === id) return { title: seq.orderEvidenceTitle, evidence: seq.orderEvidence, returnKey: `evidence-${subject}`, preview };
  if (kind === "edge") {
    const edge = vm.edgeRecords.find((item) => item.key === id);
    return edge ? { title: edge.evidenceTitle, evidence: edge.evidence, returnKey: `evidence-${subject}`, preview } : null;
  }
  if (kind === "location") {
    const record = vm.locationRecords.find((item) => item.id === id);
    return record ? { title: record.evidenceTitle, evidence: record.evidence, returnKey: `evidence-${subject}`, preview } : null;
  }
  return null;
}

/** R-01: for each conditional event, its active-state entry under one of its own day types (same time, same choices). */
function conditionalStatesFor(worldState, state) {
  const map = new Map();
  for (const item of worldState?.conditionalEvents ?? []) {
    const event = world.events.find((candidate) => candidate.id === item.eventId);
    const dayType = event?.applicability?.dayTypes?.[0];
    if (!dayType) continue;
    try {
      const query = toQuery(state);
      const alt = worldStateAt({ world, ...query, dateContext: { ...query.dateContext, dayType } });
      const entry = alt.activeEvents.find((active) => active.eventId === item.eventId);
      if (entry) map.set(item.eventId, { entry, dayType });
    } catch { /* no reveal for this event */ }
  }
  return map;
}

async function mountSceneSafely() {
  try {
    const [{ createSceneMemo }, { mountScene }] = await Promise.all([import("../scene/scene-adapter.js"), import("../scene/topology-svg.js")]);
    memoScene = createSceneMemo();
    scene = mountScene($("scene-graph"), { strings: strings.scene.graph, labelFor, onSelect: onSceneSelect, annotate: annotateSceneItem });
    $("scene-placeholder").hidden = true;
    render();
  } catch (error) {
    scene = null;
    console.error("scene mount failed", error);
    $("scene-graph").hidden = true;
    $("scene-placeholder").hidden = false;
    $("scene-placeholder").textContent = strings.scene.unavailable;
  }
}

function makeCardHandlers() {
  return {
    onShowEvidence: (eventId) => store.dispatch({ type: "openInspector", eventId }),
    onSelectAlternative: (groupId, optionId) => store.dispatch({ type: "selectAlternative", groupId, optionId }),
    onOpenSubject: (subject) => store.dispatch({ type: "openSubject", subject }),
    // R-10: without WebGL there is no 3D view to open, so the card offers no button for it.
    onOpen3d: scene3d.webgl === false ? null : (pieceId) => { open3dAt(pieceId); },
    onReport
  };
}

// ---- Guided tour (TASK-6-47). Stops come from data/world/sequences.json via tour.js; the card is the ordinary event card.
const tourKey = (state) => `${state.dayType}|${JSON.stringify(state.alternativeSelections)}|${state.mode}`;

/** The stop's event card view: computed at the event's own first step, in the visitor's day type when the event applies there. */
function tourCardFor(stop) {
  const found = eventCardView(stop);
  tourEventView = found?.event ?? null;
  return found;
}

/** An event's card view at its own first step, in the visitor's day type when it applies there (else one of its own). */
function eventCardView(stop) {
  const state = store.get();
  const event = world.events.find((item) => item.id === stop.eventId);
  const base = toQuery(state);
  const dayTypes = [...new Set([state.dayType, ...(event?.applicability?.dayTypes ?? [])])];
  for (const dayType of dayTypes) {
    try {
      const worldState = worldStateAt({ world, ...base, dateContext: { ...base.dateContext, dayType },
        time: { axis: "sequence", sequenceId: stop.sequenceId, step: stop.startStep } });
      if (!worldState.activeEvents.some((active) => active.eventId === stop.eventId)) continue;
      const vm = buildViewModel({ state: worldState, world, mode: state.mode, strings, selection: {},
        stats: data.stats ?? importResult.stats, importDiagnostics: importResult.diagnostics, dayTypes: dayTypeRecords });
      const view = vm.events.find((item) => item.id === stop.eventId);
      if (view) return { event: view, dayType, dayTypeLabel: dayType !== state.dayType ? (strings.dayType.values[dayType] ?? dayType) : null };
    } catch (error) {
      console.error("tour stop failed", error);
    }
  }
  return null;
}

// ---- Live mode (M6, ADR-005) ----
function syncLiveUrl(on) {
  try {
    const search = withLiveParam(location.search, on);
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
  } catch { /* URL sync is a convenience; never break the view */ }
}

function liveHooks() {
  const stopOf = (eventId) => tourDataAll?.stops.find((stop) => stop.eventId === eventId) ?? null;
  return {
    solved: () => scene3d.solver?.({ world, selections: store.get().alternativeSelections }) ?? null,
    state: () => store.get(),
    personaOptions: () => personaOptions(world),
    viewFor: (eventId) => { const stop = stopOf(eventId); return stop ? eventCardView(stop)?.event ?? null : null; },
    openEvent: (eventId) => {
      const stop = stopOf(eventId);
      liveEventView = stop ? eventCardView(stop)?.event ?? null : null;
      if (!liveEventView) return;
      live?.pause(); // the bubble stays put while its sources are read
      tourEvidenceFor = null;
      store.dispatch({ type: "openInspector", eventId });
    },
    openRule: (ruleId) => store.dispatch({ type: "openSubject", subject: `rule:${ruleId}` }),
    onTour: () => { stopLive(); tourPanel.start(0, { focus: false }); presentation.focusStart(); },
    onPersona: (personaId) => store.dispatch({ type: "setPersona", personaId }),
    hudTop: () => presentation.hudInsets().top,
    openLegend: () => document.getElementById("present-legend")?.click()
  };
}

async function startLive() {
  if (!isPresenting() || !presenting.renderer || live?.isRunning()) return;
  if (tourPanel?.isActive()) tourPanel.exit({ focus: false });
  presenting.renderer.clearMarkers?.();
  presenting.renderer.setLabelNote?.(null);
  live ??= createLive({ world, strings, tour: tourDataAll, reducedMotion: scene3d.reducedMotion?.matches ?? false, hooks: liveHooks(),
    sequenceOrder: orderSequences((world.sequences ?? []).filter((sequence) => (world.events ?? []).some((event) => event.timing?.sequenceId === sequence.id))).map((sequence) => sequence.id) });
  presentation.setLive(live.hud);
  syncLiveUrl(true);
  try {
    await live.start(presenting.renderer);
    presentation.markLive?.();
    live.focus();
  } catch (error) {
    console.error("live mode failed", error);
    stopLive();
  }
}

function stopLive() {
  if (!live?.isRunning()) return;
  live.stop();
  liveEventView = null;
  presentation.setLive(null);
}

function syncTourUrl(index) {
  try {
    const search = withTourParam(location.search, index);
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
  } catch { /* URL sync is a convenience; never break the view */ }
}

/** M3-01: bring the canvas (and the tour bar above it) into view when most of the canvas is off screen. */
function keepTourVisible() {
  if (isPresenting() || !tourPanel?.barVisible()) return;
  const viewport = $("scene3d-container").querySelector(".scene3d-viewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  if (rect.height > 0 && visible < rect.height * 0.5) $("tour-bar").scrollIntoView({ block: "start", behavior: "auto" });
}

/**
 * TASK-6-60 (ADR-004 D3): abstract role figures for the stop's event, in presentation mode only. Events whose location has no
 * geometry piece draw none (the caption already says the place is not in the model). The renderer hides them in the certainty style.
 */
function syncTourMarkers(renderer, stop) {
  if (!renderer?.setMarkers) return;
  if (!isPresenting() || !stop?.placed) { renderer.clearMarkers?.(); return; }
  const { markers } = markersAt(world, { eventId: stop.eventId });
  // entityKind (entities.json "kind", e.g. "group") lets the scene mark a group of unspecified size without adding figures.
  const kinds = new Map((world?.entities ?? []).map((entity) => [entity.id, entity.kind]));
  // T-02: a High Priest marker is always conditional (the label says so); it is never the daily default.
  renderer.setMarkers(markers.map((marker) => ({ ...marker, entityKind: kinds.get(marker.entityId) ?? null, conditional: marker.roleId === "role-kohen-gadol" })), { pieceIds: stop.pieces.map((piece) => piece.id) });
}

/**
 * Highlight the stop's location pieces and fly the camera to them (jump under prefers-reduced-motion or `jump`).
 * `same` (M3-10): the stop is at the place of the previous one, so the camera is not flown again; the tour says so.
 */
function syncTourScene(stop, { jump = false, same = false, scroll = false } = {}) {
  const renderer = scene3d.open || isPresenting() ? scene3d.renderer : null;
  if (!renderer) { tourPanel?.setScene({ open: scene3d.open, renderer: false, shown: null }); return; }
  try {
    renderer.setSelected(stop.locationId ? { refKind: "location", refId: stop.locationId } : null);
    syncTourMarkers(renderer, stop);
    // M3-10: the canvas label says when the event's place is an inference.
    renderer.setLabelNote?.(stop.inferred ? (isPresenting() ? strings.present.labelInferred : strings.tour.inferredLocation) : null);
    if (isPresenting()) {
      // TASK-6-58: cinematic shot. Placed: the piece with its surroundings, from an azimuth that differs from the previous
      // stop at the same place. Unplaced: the related area the data names, else the whole mount; never the stop's own place.
      const animate = !(jump || scene3d.reducedMotion?.matches);
      syncPresent(); // the bottom card changes height with the stop; measure it before aiming the camera
      renderer.setInsets?.(presentation.insets());
      const frame = stop.frame ?? { kind: "overview", pieceIds: [] };
      // R-09: a stop with figures is framed a little closer (the piece fills more of the free height) so the figure reads.
      const closer = stop.placed && Number(presentation.stage.querySelector(".scene3d")?.getAttribute("data-markers-count") ?? 0) > 0;
      const flown = frame.kind !== "overview" && renderer.flyTo(frame.pieceIds, { animate, cinematic: true, azimuth: frame.azimuth, elevation: frame.elevation, ...(closer ? { fraction: 0.44 } : {}) });
      if (!flown) renderer.showOverview?.({ animate });
      const shown = stop.placed ? Boolean(flown) : null;
      scene3d.lastShown = shown;
      tourPanel?.setScene({ open: true, renderer: true, shown });
    } else if (stop.placed && same) { scene3d.lastShown = null; tourPanel?.setScene({ open: true, renderer: true }); }
    else {
      // No piece for the location: a note says so and the camera stays where it is.
      const shown = stop.placed ? renderer.flyTo(stop.pieces.map((piece) => piece.id), { animate: !(jump || scene3d.reducedMotion?.matches) }) : null;
      scene3d.lastShown = shown;
      tourPanel?.setScene({ open: true, renderer: true, shown });
    }
    if (scroll) keepTourVisible();
  } catch (error) {
    console.error("tour camera failed", error);
  }
}

function onTourStop(stop, { reason }) {
  tourPanel.refresh(tourKey(store.get()));
  syncTourUrl(stop.index);
  const step = reason === "step";
  // Presentation flies from the overview to stop 1 too; only a restored stop (URL) jumps.
  syncTourScene(stop, { jump: isPresenting() ? reason === "restore" : !step, same: step && stop.sameAsPrevious, scroll: step });
  syncPresent();
}

/** Presentation mode: mirror the tour (stop, attribution, certainty, location basis) into the overlay's tour bar. */
function syncPresent() {
  if (!isPresenting()) return;
  const stop = tourPanel?.isActive() ? tourPanel.stop() : null;
  if (!stop) { presentation.setTour(null); return; }
  const event = tourEventView?.id === stop.eventId ? tourEventView : null;
  const chapter = tourChapters.find((item) => item.chapter === stop.chapter);
  // T-08: the attribution line names the same locators as the title ("(לפי משנה תמיד א, ב; א, ד)"), else the primary locator.
  const titleLocators = /\((לפי [^)]*)\)\s*$/u.exec(stop.title ?? "")?.[1] ?? null;
  presentation.setTour({ index: stop.index, total: tourTotal, title: stop.title ?? stop.eventId, locator: stop.evidenceLocator ?? null,
    attributionText: titleLocators, stageNote: stop.stageNote ?? null,
    continuation: stop.continuation ? { previousSequenceName: stop.continuation.previousSequenceName ?? "", note: stop.continuation.note ?? "" } : null,
    chapterTitle: stop.chapterTitle ?? null, chapterStart: chapter?.firstStopIndex ?? null,
    endText: tourEndText(tourRange, { range: strings.present.endCardRange, complete: strings.present.endCardComplete, none: strings.present.endCardNoRange, excluded: strings.present.endCardExcluded }),
    conditionalKind: stop.conditional?.kind ?? null, conditionalLabel: stop.conditional ? conditionalLabel(stop.conditional, strings.tour) : null,
    conditionalNote: stop.conditional ? conditionalNote(stop.conditional, strings.tour) : null,
    locationBasis: stop.locationBasis, inferred: stop.inferred, placed: stop.placed, certainty: event?.certainty ?? null,
    shown: scene3d.lastShown, sameAsPrevious: stop.sameAsPrevious, shotKind: stop.frame?.kind ?? "overview", areaName: stop.frame?.areaName ?? null });
}

function onTourExit() {
  tourEventView = null;
  scene3d.renderer?.setLabelNote?.(null);
  if (isPresenting() && scene3d.renderer) { scene3d.renderer.setInsets?.(presentation.insets()); scene3d.renderer.showOverview?.({ animate: !scene3d.reducedMotion?.matches }); scene3d.lastShown = null; }
  presenting.renderer?.clearMarkers?.();
  syncTourUrl(null);
  render();
  syncPresent();
}

async function tourOpen3d() {
  if (!scene3d.open) await open3d();
  if (tourPanel?.barVisible()) $("tour-bar").scrollIntoView({ block: "start" });
  else $("scene3d-container").scrollIntoView({ block: "center" });
  ($("scene3d-container").querySelector("canvas") ?? $("scene3d-toggle")).focus({ preventScroll: true });
}

function render() {
  const state = store.get();
  let worldState = null;
  try {
    worldState = worldStateAt({ world, ...toQuery(state) });
  } catch (error) {
    console.error("worldStateAt failed", error);
  }
  const vm = buildViewModel({ state: worldState, world, mode: state.mode, strings,
    selection: { selectedEventId: state.selectedEventId, revealedEventIds: state.revealedEventIds },
    stats: data.stats ?? importResult.stats, importDiagnostics: importResult.diagnostics,
    conditionalStates: conditionalStatesFor(worldState, state), dayTypes: dayTypeRecords });
  const cardHandlers = makeCardHandlers();
  const report = (kind, id, subject, className) => reportButton({ target: { kind, id }, subject, strings, onReport, className });

  const focusKey = document.activeElement?.dataset?.focusKey ?? null;
  timeline.render(vm, state);
  renderDayTypeChip(vm);

  $("time-readout").textContent = vm.time?.axis === "clock" ? vm.time.clockLabel
    : vm.time?.sequence ? `${format(strings.timing.sequenceSingle, { step: vm.time.sequence.step + 1, count: vm.time.sequence.stepCount })} · ${vm.time.sequence.stepLabel}` : "";
  $("headline").replaceChildren(
    h("p", { class: `headline-title headline-${vm.headline.kind}`, text: vm.headline.title }),
    vm.headline.kind === "event" && vm.headline.body ? h("p", { class: "muted", text: vm.headline.body }) : null);
  // A single event card already carries its title and timing; the headline only summarises several events.
  $("headline").hidden = vm.headline.kind === "empty" || (vm.headline.kind === "event" && vm.events.length === 1);
  renderEmpty($("empty-state"), vm);
  $("event-list").replaceChildren(...vm.events.map((event) => renderEventCard(event, strings, cardHandlers)));
  renderList($("conditional-list"), strings.state.conditionalHeading, vm.conditional);
  $("revealed-list").replaceChildren(...vm.revealedEvents.map((event) => renderEventCard(event, strings, cardHandlers)));
  renderList($("unplaced-list"), strings.state.unplacedHeading, vm.time?.axis === "clock" ? [] : vm.unplaced);
  const diagnostics = $("diagnostics");
  diagnostics.hidden = vm.diagnostics.length === 0;
  diagnostics.replaceChildren(...vm.diagnostics.map((item) => h("li", { class: `diag diag-${item.severity}`, text: item.userMessage })));
  $("scene-locations").replaceChildren(...(vm.activeLocations.length ? [h("h3", { text: strings.scene.locationsHeading }),
    h("ul", {}, vm.activeLocations.map((item) => h("li", { "data-location-id": item.id }, h("span", { text: item.name ?? item.id }),
      item.inferredLabel ? h("span", { class: "basis-label basis-inferred", text: item.inferredLabel }) : null, " — ",
      h("span", { class: "muted", text: item.spatialStatusLabel }), " ",
      evidenceButton({ subjectKey: `location:${item.id}`, className: "inline-evidence", label: item.evidenceTitle,
        text: strings.event.locationEvidence, onOpen: cardHandlers.onOpenSubject }), " ",
      report("location", item.id, item.name ?? item.id, "report-button inline-report"))))] : []));

  if (focusKey && document.activeElement === document.body) document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();

  const keep = worldState ? relevantLocationIds(world, worldState.query.time) : new Set();
  const hidden = vm.locationRecords.filter((item) => !keep.has(item.id));
  $("scene-other-locations").replaceChildren(...(scene && hidden.length ? [h("details", { class: "other-locations" },
    h("summary", { text: format(strings.scene.otherLocations, { count: hidden.length }) }),
    h("ul", {}, hidden.map((item) => h("li", { "data-location-id": item.id }, h("span", { text: item.name ?? item.id }), " ",
      evidenceButton({ subjectKey: `location:${item.id}`, className: "inline-evidence", label: item.evidenceTitle,
        text: strings.event.locationEvidence, onOpen: cardHandlers.onOpenSubject }), " ",
      report("location", item.id, item.name ?? item.id, "report-button inline-report")))))] : []));
  const shownEdges = vm.edgeRecords.filter((edge) => keep.has(edge.from) && keep.has(edge.to) && edge.evidence.length);
  $("scene-edges").replaceChildren(...(scene && shownEdges.length ? [h("h3", { text: strings.scene.edgesHeading }),
    h("ul", {}, shownEdges.map((edge) => h("li", { "data-edge-key": edge.key }, h("span", { text: edge.via ?? "" }),
      h("span", { class: "muted block small", text: format(strings.scene.edgeBetween, { from: edge.fromName ?? edge.from, to: edge.toName ?? edge.to }) }),
      evidenceButton({ subjectKey: `edge:${edge.key}`, className: "inline-evidence", label: edge.evidenceTitle,
        text: strings.scene.edgeEvidence, onOpen: cardHandlers.onOpenSubject }), " ",
      // A passage is part of its location record (topologyEdges[i]); the report targets "<locationId>#edge-<i>".
      report("location", `${edge.from}#edge-${edge.key.split(":").at(-1)}`, edge.via ?? edge.key, "report-button inline-report"))))] : []));
  if (scene && worldState) {
    try {
      const inferred = inferredLocationIds(world, worldState);
      sceneAnnotations = { ...sceneAnnotations, inferred };
      scene.update(memoFilter(memoScene({ state: worldState, world }), keep, inferred));
      const open = state.inspector.open ? world.events.find((event) => event.id === state.inspector.eventId) : null;
      scene.setSelected(open ? { refKind: "location", refId: open.locationId } : null);
    } catch (error) {
      console.error("scene update failed", error);
    }
  }

  render3d(state, worldState, vm);
  tourPanel?.refresh(tourKey(state));
  syncPresent();

  // Inspector.
  const inspected = state.inspector.open ? resolveSubject(state.inspector.subject, vm, worldState) : null;
  if (inspected && !dialog.isOpen()) dialog.open(inspected);
  else if (inspected && state.inspector.subject?.startsWith("geometry:") && lastSolvedForDialog !== scene3d.lastSolved) dialog.update(inspected);
  else if (!inspected && dialog.isOpen()) dialog.close();
  lastSolvedForDialog = inspected ? scene3d.lastSolved : null;

  const live = vm.headline.title ?? "";
  if (live !== lastLive) { $("live-status").textContent = live; lastLive = live; }
}

let lastSolvedForDialog = null;

/** The framing button mirrors the renderer's framing. */
function syncFramingButton() {
  const renderer = scene3d.renderer;
  if (!renderer?.getFraming) return;
  const all = renderer.getFraming() === "all";
  $("scene3d-framing").setAttribute("aria-pressed", String(all));
  $("scene3d-framing").textContent = all ? strings.scene3d.framingFocus : strings.scene3d.framingAll;
}

/**
 * M3-07: a mount option that draws an outline (the platform) is framed whole, so the platform is in view without a
 * visit to "show the whole Temple Mount"; leaving such an option restores the sanctuary framing we replaced.
 */
function reframeForOutline(solved) {
  const renderer = scene3d.renderer;
  if (!renderer?.setFraming) return;
  const key = solved.pieces.filter((piece) => piece.outline).map((piece) => `${piece.id}:${piece.outline.optionId}`).join("|");
  if (key === scene3d.outlineKey) return;
  scene3d.outlineKey = key;
  if (key && renderer.getFraming?.() !== "all") { renderer.setFraming("all"); scene3d.autoFramedAll = true; }
  else if (!key && scene3d.autoFramedAll) { renderer.setFraming("focus"); scene3d.autoFramedAll = false; }
  syncFramingButton();
}

/** M2-04: scroll the canvas into view when most of it is off screen (the alternatives panel sits below it). */
function keepCanvasVisible() {
  const el = $("scene3d-container").querySelector(".scene3d-viewport") ?? $("scene3d-container");
  const rect = el.getBoundingClientRect();
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  if (rect.height > 0 && visible < rect.height * 0.5) el.scrollIntoView({ block: "start", behavior: "auto" });
}

// M2-11: the renderer tags a piece "(הנחה)" only for assumptions specific to it (a default shared by every piece is said once).
const rendererSolvedCache = new WeakMap();
function rendererSolved(solved, view) {
  if (!view.commonAssumed) return solved;
  if (!rendererSolvedCache.has(solved)) {
    const specific = new Set(view.pieces.filter((piece) => piece.assumedSpecific).map((piece) => piece.id));
    rendererSolvedCache.set(solved, { ...solved, pieces: solved.pieces.map((piece) => ({ ...piece, assumed: specific.has(piece.id) })) });
  }
  return rendererSolvedCache.get(solved);
}

/** 3D panel: solve with the visitor's selections, render assumptions/unresolved, update the renderer (TASK-6-19). */
function render3d(state, worldState, vm) {
  const s3 = strings.scene3d;
  $("scene3d-toggle").textContent = scene3d.open ? s3.toggleHide : s3.toggle;
  $("scene3d-toggle").setAttribute("aria-expanded", String(scene3d.open));
  const presentingNow = isPresenting();
  $("scene3d-panel").hidden = !scene3d.open || presentingNow;
  if (!scene3d.open && !presentingNow) return;
  $("scene3d-preview-strip").hidden = vm.mode !== "preview";
  $("scene3d-preview-strip").textContent = strings.evidence.previewStrip;
  const status = scene3d.loading ? s3.loading : scene3d.status;
  if (!scene3d.solver) { $("scene3d-status").textContent = status ?? ""; return; }
  const solved = scene3d.solver({ world, selections: state.alternativeSelections });
  scene3d.lastSolved = solved;
  scene3d.columnBudget ??= columnBudgetForWindow();
  const view = buildGeometryView({ solved, world, strings, mode: vm.mode, selections: state.alternativeSelections, columnBudget: scene3d.columnBudget });
  scene3d.view = view;
  $("scene3d-status").textContent = view.empty ? view.emptyText : status ?? "";
  // Every geometry group's display default is its Middot option (architect, TASK-6-22 round); say so once.
  $("scene3d-middot").hidden = view.pieces.length === 0;
  $("scene3d-middot").textContent = s3.middotDefault;
  // M2-04: after a choice the canvas is brought back into view, so the change is seen.
  const onSelect = (groupId, optionId) => { store.dispatch({ type: "selectAlternative", groupId, optionId }); if (!isPresenting()) keepCanvasVisible(); };
  renderAlternatives($("scene3d-assumptions"), view, strings, { onSelect });
  // TASK-6-35: persona ("מי אתם?") — rules from access-policies only; pieces without a rule are "no_source".
  const personaView = buildPersonaView({ world, personaId: state.persona, strings });
  renderPersona($("scene3d-persona"), personaView, strings, { onSelect: (personaId) => store.dispatch({ type: "setPersona", personaId }),
    onOpenRule: (ruleId) => store.dispatch({ type: "openSubject", subject: `rule:${ruleId}` }) });
  $("scene3d-common-assumed").hidden = !view.commonAssumed;
  $("scene3d-common-assumed").textContent = view.commonAssumed?.text ?? "";
  const access = personaView?.personaId ? pieceAccessMap(accessibleAreas(personaView.personaId, world)) : {};
  renderAmahChip($("scene3d-amah"), view, strings, {
    onChange: () => { const select = $(`scene3d-alt-${view.amah.groupId}`); select?.scrollIntoView({ block: "center" }); select?.focus(); },
    // N-06: focus moves to the list heading.
    onMore: () => { const heading = $("scene3d-assumptions-heading"); heading?.scrollIntoView({ block: "start" }); heading?.focus(); }
  });
  renderConflicts($("scene3d-conflicts"), view, strings);
  // 3D-04: published pieces are provisional; the panel says so next to its heading (preview has its own strip).
  const provisional = vm.mode === "published" && view.pieces.some((piece) => piece.certainty?.tier?.value === "provisional");
  const tierLine = $("scene3d-tier");
  tierLine.hidden = !provisional;
  tierLine.replaceChildren(...(provisional ? [h("span", { class: "tier-chip", "data-tier": "provisional", text: s3.tierChip }), " ", s3.tierStatement] : []));
  if (presentingNow) presentation.setContext({ preview: vm.mode === "preview", provisional, hasAlternatives: !$("scene3d-assumptions").hidden,
    conflict: !$("scene3d-conflicts").hidden, total: tourTotal });
  renderUnresolved($("scene3d-unresolved"), view, strings);
  renderNotShown($("scene3d-not-shown"), view, strings);
  const open = (id) => store.dispatch({ type: "openSubject", subject: `geometry:${id}` });
  if (scene3d.renderer) {
    $("scene3d-text-list").replaceChildren();
    try {
      scene3d.renderer.update(rendererSolved(solved, view));
      scene3d.renderer.setAccess?.(access);
      reframeForOutline(solved);
      const subject = state.inspector.open ? state.inspector.subject : null;
      scene3d.renderer.setSelected(subject?.startsWith("geometry:") ? { refKind: "geometry", refId: subject.slice(9) }
        : state.inspector.open && state.inspector.eventId ? { refKind: "location", refId: world.events.find((e) => e.id === state.inspector.eventId)?.locationId ?? null }
          : tourPanel?.stop()?.locationId ? { refKind: "location", refId: tourPanel.stop().locationId } : null);
    } catch (error) {
      console.error("3D update failed", error);
    }
  } else {
    renderPieceList($("scene3d-text-list"), view, strings, { onOpen: open, access });
  }
  // M3-11: a change of choices refits the scene; an active tour flies back to its current stop.
  if (scene3d.renderer && tourPanel?.isActive()) {
    if (scene3d.flownSolved && scene3d.flownSolved !== solved) syncTourScene(tourPanel.stop(), { jump: false });
    scene3d.flownSolved = solved;
  } else if (scene3d.renderer) scene3d.flownSolved = solved;
  const walkable = Boolean(scene3d.renderer);
  $("scene3d-modes").hidden = !walkable;
  $("scene3d-help").hidden = !walkable;
  $("scene3d-reduced").hidden = !(walkable && scene3d.reducedMotion?.matches);
}

async function open3d() {
  scene3d.open = !scene3d.open;
  // The first opening mounts the in-page renderer (presentation mode may already have loaded the solver).
  if (scene3d.open && !scene3d.pageMountTried && !scene3d.loading) {
    scene3d.pageMountTried = true;
    scene3d.loading = true;
    render();
    try {
      if (!scene3d.solver) {
        const { createGeometrySolver } = await import("../scene/geometry/solve.js");
        scene3d.solver = createGeometrySolver();
      }
      const solved = scene3d.solver({ world, selections: store.get().alternativeSelections });
      const { webglAvailable } = await import("../scene/webgl-check.js");
      if (solved.pieces.length > 0 && !webglAvailable()) {
        // 3D-19: feature-detect before downloading Three.js.
        scene3d.status = strings.scene3d.unavailable;
      } else if (solved.pieces.length > 0) {
        try {
          const { mountThreeScene } = await import("../scene/three-renderer.js");
          scene3d.renderer = mountThreeScene($("scene3d-container"), {
            strings: strings.scene3d,
            labelFor: (ref) => (ref?.kind === "geometry" ? isolateLatin(world.geometry.find((g) => g.id === ref.id)?.label?.he ?? "") : ""),
            reducedMotion: scene3d.reducedMotion?.matches ?? false,
            columnBudget: scene3d.columnBudget,
            onSelect: ({ refId }) => store.dispatch({ type: "openSubject", subject: `geometry:${refId}` }),
            onModeChange: (mode) => syncModeButtons(mode)
          });
          // M2-03: the persona controls sit directly below the canvas.
          $("scene3d-container").querySelector(".scene3d-viewport")?.after($("scene3d-persona"));
        } catch (error) {
          scene3d.renderer = null;
          if (error?.code === "WEBGL_UNAVAILABLE") scene3d.status = strings.scene3d.unavailable;
          else { console.error("3D renderer failed", error); scene3d.status = strings.scene3d.failed; }
        }
      }
    } catch (error) {
      console.error("3D solver failed to load", error);
      scene3d.status = strings.scene3d.failed;
    }
    scene3d.loading = false;
  }
  render();
  if (tourPanel?.isActive()) syncTourScene(tourPanel.stop(), { jump: true });
  if (scene3d.open) $("scene3d-heading").scrollIntoView({ block: "nearest" });
}

// ---- Presentation mode (TASK-6-57, ADR-004) ----
function syncPresentUrl(on) {
  try {
    const search = withPresentParam(location.search, on);
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
  } catch { /* URL sync is a convenience; never break the view */ }
}

async function enterPresent({ fullscreen = false, opener = null, live: wantLive = false } = {}) {
  if (!presentation || presentation.isOpen() || scene3d.webgl !== true) return false;
  const token = ++presenting.token;
  // The overlay and the fullscreen request happen synchronously, inside the click that asked for them.
  presentation.open({ fullscreen, opener });
  if (!wantLive) syncPresentUrl(true);
  presentation.setStatus(strings.present.loading);
  try {
    if (!scene3d.solver) {
      const { createGeometrySolver } = await import("../scene/geometry/solve.js");
      scene3d.solver = createGeometrySolver();
    }
    scene3d.columnBudget ??= columnBudgetForWindow();
    const { mountThreeScene } = await import("../scene/three-renderer.js");
    if (token !== presenting.token || !presentation.isOpen()) return false; // left while loading
    const renderer = mountThreeScene(presentation.stage, {
      strings: strings.scene3d,
      labelFor: (ref) => {
        if (ref?.kind === "role") return isolateLatin(((world.roles ?? []).find((role) => role.id === ref.id)?.name?.he ?? "").replace(/\s*\(.*$/, "")); // the name without its source gloss
        return ref?.kind === "geometry" ? isolateLatin(world.geometry.find((g) => g.id === ref.id)?.label?.he ?? "") : "";
      },
      reducedMotion: scene3d.reducedMotion?.matches ?? false,
      columnBudget: scene3d.columnBudget,
      styleMode: "presentation",
      fill: true,
      markerInsets: () => presentation.hudInsets(),
      onSelect: ({ refId }) => store.dispatch({ type: "openSubject", subject: `geometry:${refId}` })
    });
    presenting.renderer = renderer;
    presenting.pageRenderer = scene3d.renderer;
    scene3d.renderer = renderer;
    presentation.adoptRendererNodes({ legend: presentation.stage.querySelector(".scene3d-legend"), list: presentation.stage.querySelector(".scene3d-list") });
    presentation.setStatus(null);
    scene3d.flownSolved = null;
    renderer.setShortLabels?.(true); // the canvas label is short here; the long description is in the inspector
    render();
    renderer.setInsets?.(presentation.insets());
    if (tourPanel?.isActive()) syncTourScene(tourPanel.stop(), { jump: true });
    else renderer.showOverview?.({ animate: false }); // establishing shot: the whole mount for the current option
    syncPresent();
    if (wantLive && !tourPanel?.isActive()) await startLive();
    presentation.markReady();
    presentation.focusStart();
    return true;
  } catch (error) {
    if (error?.code === "WEBGL_UNAVAILABLE") { exitPresent(); return false; }
    console.error("presentation mode failed", error);
    presentation.setStatus(strings.present.failed);
    return false;
  }
}

function exitPresent() {
  if (!presentation?.isOpen()) return;
  presenting.token += 1;
  // Close the inspector through its controller first, so the store is consistent before the page re-renders.
  if (dialog?.isOpen()) dialog.close();
  const wasLive = Boolean(live?.isRunning());
  stopLive();
  const renderer = presenting.renderer;
  renderer?.clearMarkers?.();
  presenting.renderer = null;
  presentation.close();
  try { renderer?.destroy(); } catch (error) { console.error("presentation renderer destroy failed", error); }
  scene3d.renderer = presenting.pageRenderer;
  presenting.pageRenderer = null;
  scene3d.flownSolved = null;
  syncPresentUrl(false);
  if (wasLive) syncLiveUrl(false); // the page stays the page on reload (?view=page)
  tourPanel?.setScene({ open: scene3d.open, renderer: Boolean(scene3d.renderer) });
  render();
  if (tourPanel?.isActive() && scene3d.open && scene3d.renderer) syncTourScene(tourPanel.stop(), { jump: true });
  presentation.restoreView();
}

function setupPresent() {
  const button = $("present-open");
  button.textContent = strings.present.open;
  button.title = strings.present.openHint;
  presentation = createPresentation({ strings, dialogs: [$("evidence-dialog"), $("feedback-dialog"), $("licences-dialog")],
    assumptions: $("scene3d-assumptions"), conflicts: $("scene3d-conflicts"),
    hooks: {
      onExit: exitPresent,
      onStyle: (mode) => { presenting.renderer?.setStyleMode?.(mode); live?.setStyle(mode); },
      onStart: () => { tourPanel.start(0, { focus: false }); presentation.focusStart(); },
      onPrev: () => tourPanel.go(tourPanel.index() - 1, { focus: null }),
      onNext: () => tourPanel.go(tourPanel.index() + 1, { focus: null }),
      onChapter: (stopIndex) => tourPanel.go(stopIndex, { focus: null }),
      onDetails: () => {
        const stop = tourPanel.stop();
        if (!stop) return;
        tourEvidenceFor = stop.eventId;
        store.dispatch({ type: "openInspector", eventId: stop.eventId });
      },
      onEndTour: () => { tourPanel.exit({ focus: false }); presentation.focusStart(); },
      // R-11: Esc leaves the presentation and ends the tour, like the end-tour button (the URL loses ?tour); "יציאה" keeps the tour for the page.
      onEscape: () => { if (tourPanel.isActive()) tourPanel.exit({ focus: false }); exitPresent(); },
      onLicences: (opener) => licences?.open(opener),
      onOverview: () => { tourPanel.exit({ focus: false }); presentation.focusStart(); },
      onLive: () => { startLive(); },
      // The browser took the first Esc to leave fullscreen while a dialog was open: close it, stay in the overlay.
      onCloseDialogs: () => { if (dialog?.isOpen()) dialog.close(); for (const id of ["feedback-dialog", "licences-dialog"]) if ($(id).open) $(id).close(); }
    } });
  if (scene3d.webgl === true) {
    button.hidden = false;
    button.addEventListener("click", (event) => { enterPresent({ fullscreen: true, opener: event.currentTarget }); });
  }
}

/** 3D-17: open the 3D panel focused on one piece (from a place whose topology position is not set). */
async function open3dAt(pieceId) {
  if (!scene3d.open) await open3d();
  if (scene3d.renderer) {
    scene3d.renderer.setSelected({ refKind: "geometry", refId: pieceId });
    $("scene3d-container").scrollIntoView({ block: "center" });
    scene3d.renderer.focusFirst?.();
  } else {
    $("scene3d-text-list").querySelector(`[data-ref-id="${CSS.escape(pieceId)}"]`)?.focus();
  }
}

function syncModeButtons(mode) {
  const plan = mode !== "walk" && scene3d.renderer?.getViewAngle?.() === "plan";
  $("scene3d-overview").setAttribute("aria-pressed", String(mode !== "walk" && !plan));
  $("scene3d-plan").setAttribute("aria-pressed", String(plan));
  $("scene3d-walk").setAttribute("aria-pressed", String(mode === "walk"));
}

function setup3d() {
  const s3 = strings.scene3d;
  scene3d.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  $("scene3d-heading").textContent = s3.heading;
  $("scene3d-intro").textContent = s3.intro;
  $("scene3d-modes").setAttribute("aria-label", s3.modeLabel);
  $("scene3d-overview").textContent = s3.overview;
  $("scene3d-walk").textContent = s3.walk;
  $("scene3d-plan").textContent = s3.plan;
  $("scene3d-plan").title = s3.planLabel;
  $("scene3d-plan").addEventListener("click", () => {
    const renderer = scene3d.renderer;
    if (!renderer) return;
    if (renderer.getMode() === "walk") renderer.setMode("overview");
    renderer.setViewAngle("plan");
    syncModeButtons(renderer.getMode());
  });
  $("scene3d-framing").textContent = s3.framingAll;
  $("scene3d-framing").addEventListener("click", () => {
    const renderer = scene3d.renderer;
    if (!renderer?.setFraming) return;
    renderer.setFraming(renderer.getFraming?.() === "all" ? "focus" : "all");
    scene3d.autoFramedAll = false;
    syncFramingButton();
  });
  $("scene3d-help-summary").textContent = s3.helpSummary;
  $("scene3d-help-text").textContent = s3.help;
  $("scene3d-reduced").textContent = s3.reducedMotion;
  $("scene3d-toggle").addEventListener("click", () => { open3d(); });
  for (const [id, mode] of [["scene3d-overview", "overview"], ["scene3d-walk", "walk"]]) {
    $(id).addEventListener("click", () => {
      if (!scene3d.renderer) return;
      scene3d.renderer.setMode(mode);
      if (mode === "overview") scene3d.renderer.setViewAngle?.("oblique");
      syncModeButtons(scene3d.renderer.getMode());
      if (mode === "walk") $("scene3d-container").querySelector("canvas")?.focus();
    });
  }
}

/** Feedback entry point handler (docs/contracts/feedback.md): opens the dialog prefilled with the target. */
function onReport({ target, subject, returnKey, opener }) {
  feedback?.open({ target, subject, returnKey, opener });
}

/** STRATEGY-2026-10 §7.5: the current viewing assumption is always visible; activating the chip moves to the select. */
function renderDayTypeChip(vm) {
  const chip = $("day-type-chip");
  const value = vm.dayType.value;
  const short = strings.dayType.chipShort[value] ?? vm.dayType.label;
  chip.textContent = format(strings.dayType.chip, { label: short });
  chip.dataset.dayType = value;
  chip.title = vm.dayType.label ?? "";
  chip.setAttribute("aria-label", format(strings.dayType.chipLabel, { label: vm.dayType.label ?? short }));
}

async function boot() {
  const publicBuild = isPublicBuild();
  const requested = modeFromSearch(location.search);
  const previewBlocked = publicBuild && requested.mode === "preview";
  const mode = previewBlocked ? "published" : requested.mode;
  const unknown = requested.unknown;
  applyChrome(mode, unknown, previewBlocked);
  licences = createLicencesDialog({ dialog: $("licences-dialog"), title: $("licences-title"), body: $("licences-body"),
    closeButton: $("licences-close"), strings, getTexts: () => data?.texts ?? {}, hasOmissions: () => Boolean(data?.publicOmissions) });
  $("licences-button").addEventListener("click", (event) => licences.open(event.currentTarget));
  // The general report works even when data fails to load (a load error is itself worth reporting).
  feedback = createFeedbackDialog({ dialog: $("feedback-dialog"), strings });
  for (const id of ["feedback-general", "feedback-footer"]) {
    $(id).addEventListener("click", (event) => onReport({ target: { kind: "general", id: null }, subject: strings.feedback.generalSubject,
      returnKey: event.currentTarget.dataset.focusKey, opener: event.currentTarget }));
  }
  try {
    // The public build ignores ?manifest= (fixtures are not deployed); every request resolves against the document base.
    data = await loadWorldData({ search: publicBuild ? "" : location.search, origin: location.origin, mode, baseUrl: document.baseURI });
  } catch (error) {
    if (error instanceof DataLoadError && error.kind === "manifest_rejected") console.warn("Data source rejected:", error.file);
    else console.error("Data load failed:", error);
    showError(error);
    return;
  }
  try {
    importResult = importWorld(data.raw, { mode, allowSynthetic: data.allowSynthetic, texts: data.texts, files: data.files });
  } catch (error) {
    console.error("Import failed:", error);
    showError(error);
    return;
  }
  // Public build: translations removed from the deployed bundle are reported by the page (the world object is frozen, so copy).
  world = { ...importResult.world, publicOmissions: data.publicOmissions ?? null };
  if (data.allowSynthetic) {
    $("fixture-banner").hidden = false;
    $("fixture-banner").textContent = strings.banner.syntheticFixture;
  }
  const errors = importResult.diagnostics.filter((item) => item.severity === "error");
  if (errors.length) console.info(`importWorld: ${errors.length} error diagnostic(s); affected records were excluded.`, errors);

  const context = { sequences: world.sequences };
  // TASK-6-30: ?alt=<groupId>:<optionId>,… restores the visitor's alternative choices; invalid ids fall back silently.
  store = createStore(initialState({ mode, sequences: world.sequences, selections: parseAltParam(location.search, world.alternatives),
    persona: parsePersonaParam(location.search, personaOptions(world).map((option) => option.id)),
    sequenceId: parseSeqParam(location.search, world.sequences.map((item) => item.id)) }), context);
  const defaultSequenceId = world.sequences[0]?.id ?? null;
  const sequenceOf = (state) => (state.time.axis === "sequence" ? state.time.sequenceId : null);
  store.subscribe((next, previous) => {
    // M3-14: the timeline's sequence is part of the shared link (?seq=), like the alternatives and the persona.
    const sequenceChanged = sequenceOf(next) !== sequenceOf(previous) && sequenceOf(next) !== null;
    if (next.alternativeSelections === previous.alternativeSelections && next.persona === previous.persona && !sequenceChanged) return;
    try {
      let search = withPersonaParam(withAltParam(location.search, next.alternativeSelections), next.persona);
      if (sequenceChanged) search = withSeqParam(search, sequenceOf(next), defaultSequenceId);
      if (live?.isRunning()) search = withLiveParam(search, true); // a shared live link stays live
      if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
    } catch { /* URL sync is a convenience; never break the view */ }
  });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  timeline = createTimeline({ store, strings, reducedMotion, onOpenSubject: (subject) => store.dispatch({ type: "openSubject", subject }), onReport });
  sceneAnnotations = { inferred: new Set(), via: edgeViaLabels() };
  dayTypeRecords = Array.isArray(world.dayTypes?.records) ? world.dayTypes.records : null;
  dialog = createEvidenceDialog({ dialog: $("evidence-dialog"), title: $("evidence-dialog-title"), body: $("evidence-body"),
    closeButton: $("evidence-close"), strip: $("evidence-dialog-strip"), strings, onClose: () => { tourEvidenceFor = null; store.dispatch({ type: "closeInspector" }); }, onReport });
  $("day-type-chip").addEventListener("click", () => { $("day-type").focus(); $("day-type").scrollIntoView({ block: "center" }); });
  store.subscribe((next, previous) => { if (next.time !== previous.time || next.dayType !== previous.dayType) hideChooser(); render(); });
  store.subscribe((next, previous) => {
    if (next.dayType !== previous.dayType || next.alternativeSelections !== previous.alternativeSelections || next.persona !== previous.persona) live?.refresh();
  });

  setup3d();
  scene3d.webgl = webglAvailable();
  const tourData = buildTourStops({ world });
  tourDataAll = tourData;
  tourPanel = createTourPanel({ section: $("tour"), strings, tour: tourData, cardFor: tourCardFor,
    renderCard: (event) => renderEventCard(event, strings, { ...makeCardHandlers(), idSuffix: "-tour",
      onShowEvidence: (eventId) => { tourEvidenceFor = eventId; store.dispatch({ type: "openInspector", eventId }); } }),
    onStop: onTourStop, onExit: onTourExit, onOpen3d: tourOpen3d, bar: $("tour-bar") });
  tourPanel.setScene({ webgl: scene3d.webgl });
  tourTotal = tourData.stops.length;
  tourChapters = tourData.chapters;
  tourRange = tourData.range;
  setupPresent();
  presentation.setChapters(tourChapters);
  $("loading").hidden = true;
  for (const id of ["timeline", "state-region", "scene"]) $(id).hidden = false;
  $("app").setAttribute("aria-busy", "false");
  render();
  // TASK-6-47: ?tour=<n> restores the stop (text view; the camera follows once the 3D panel is open).
  const tourIndex = parseTourParam(location.search, tourData.stops.length);
  if (tourIndex !== null) tourPanel.start(tourIndex, { focus: false, reason: "restore" });
  // M2-06: a shared link with ?alt= or ?persona= opens the 3D panel, where the selection is shown.
  const initial = store.get();
  const shared = Object.keys(initial.alternativeSelections ?? {}).length > 0 || Boolean(initial.persona);
  // M3-11: a shared tour link opens the 3D panel too (when the browser has WebGL), so the stop is seen as well as read.
  const tourIn3d = tourIndex !== null && scene3d.webgl === true;
  const presentRequested = parsePresentParam(location.search) && scene3d.webgl === true;
  if (parsePresentParam(location.search) && !presentRequested) syncPresentUrl(false); // no WebGL: the normal page, silently
  // M6 (ADR-005 D6): a bare URL (or ?live=1) opens the living morning; without WebGL, in preview or with ?view=page, the page.
  const liveRequested = !presentRequested && tourIndex === null && mode === "published" && parseLiveParam(location.search) && scene3d.webgl === true;
  if (liveRequested) {
    await enterPresent({ fullscreen: false, live: true });
  } else if (presentRequested) {
    // ?present=1: the overlay opens in place of the 3D panel (no fullscreen: browsers require a click for that).
    await enterPresent({ fullscreen: false });
  } else if (shared || tourIn3d) {
    await open3d();
    if (tourIn3d && tourPanel.barVisible()) $("tour-bar").scrollIntoView({ block: "start" });
    else $("scene3d-section").scrollIntoView({ block: "start" });
  } else if (tourIndex !== null) {
    $("tour").scrollIntoView({ block: "start" });
  }
  await mountSceneSafely();
  document.body.dataset.ready = "true";
}

boot();
