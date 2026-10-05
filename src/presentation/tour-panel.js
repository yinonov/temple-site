// Guided tour panel (TASK-6-47): DOM controller. Content comes from tour.js stops (data); chrome from strings.he.js.
// The panel works without 3D: the text view lists every stop and shows the event card, location basis and evidence.
import { h } from "./dom.js";
import { format } from "./strings.he.js";
import { clampStop, swipeAction, tourKeyAction } from "./tour.js";
import { isolateLatin } from "./view-model.js";

/**
 * @param {{ section: HTMLElement, strings: object, tour: { stops: object[], sequences: object[] },
 *   cardFor: (stop: object) => ({ event: object, dayType: string, dayTypeLabel: string|null } | null),
 *   renderCard: (event: object) => HTMLElement,
 *   onStop: (stop: object, info: { reason: "start"|"step"|"restore" }) => void,
 *   onExit: () => void, onOpen3d: () => void, bar?: HTMLElement|null }} options
 *   bar (M3-01): the compact tour bar that sits next to the 3D canvas; shown while a tour and the canvas are both open.
 */
export function createTourPanel({ section, strings, tour, cardFor, renderCard, onStop, onExit, onOpen3d, bar = null }) {
  const s = strings.tour;
  const { stops, sequences } = tour;
  let active = false;
  let index = 0;
  let cardKey = null;
  let scene = { open: false, renderer: false, shown: null, webgl: null };

  const direction = () => (getComputedStyle(section).direction === "ltr" ? "ltr" : "rtl");
  const arrow = (glyph) => h("span", { "aria-hidden": "true", text: glyph });

  const heading = h("h2", { id: "tour-heading", class: "panel-heading", text: s.heading });
  const startButton = h("button", { type: "button", id: "tour-start", class: "tour-start", "data-focus-key": "tour-start", text: s.start,
    on: { click: () => start(0) } });
  const prevButton = h("button", { type: "button", id: "tour-prev", "data-focus-key": "tour-prev", on: { click: () => go(index - 1) } }, arrow("→ "), s.prev);
  const nextButton = h("button", { type: "button", id: "tour-next", "data-focus-key": "tour-next", on: { click: () => go(index + 1) } }, s.next, arrow(" ←"));
  const exitButton = h("button", { type: "button", id: "tour-exit", class: "tour-exit", "data-focus-key": "tour-exit", text: s.exit, on: { click: () => exit() } });
  const stopHeading = h("h3", { id: "tour-stop-heading", class: "tour-stop-heading", tabindex: "-1" });
  const sequenceLine = h("p", { class: "tour-sequence" });
  const stageNote = h("p", { class: "stage-note tour-stage-note" });
  const continuation = h("div", { class: "tour-continuation", role: "note" });
  const flags = h("p", { class: "tour-flags" });
  const card = h("div", { id: "tour-card", class: "tour-card" });
  const dayNote = h("p", { class: "hint tour-day-note" });
  const sceneNote = h("p", { id: "tour-3d-note", class: "tour-3d-note", role: "status" });
  const open3dButton = h("button", { type: "button", id: "tour-open-3d", class: "inline-action", text: s.open3d, on: { click: () => onOpen3d() } });
  const keyHint = h("p", { class: "hint tour-key-hint", text: s.keyHint });
  const live = h("p", { class: "sr-only", id: "tour-live", "aria-live": "polite" });
  const list = h("div", { class: "tour-stops-list" });
  const details = h("details", { class: "tour-stops", id: "tour-stops" }, h("summary", { text: format(s.stopsSummary, { total: stops.length }) }), list);
  const activeBox = h("div", { id: "tour-active", class: "tour-active", hidden: true },
    stopHeading,
    h("div", { class: "button-row tour-controls", role: "group", "aria-label": s.controlsLabel }, prevButton, nextButton, exitButton),
    sequenceLine, stageNote, continuation, flags, card, dayNote,
    h("div", { class: "tour-scene" }, sceneNote, open3dButton), keyHint);
  const idleBox = h("div", { class: "tour-idle", id: "tour-idle" }, h("p", { class: "hint", text: s.intro }), h("p", {}, startButton));
  const endNote = h("div", { class: "tour-end", role: "note", hidden: true });
  activeBox.insertBefore(endNote, keyHint);
  section.replaceChildren(heading, idleBox, activeBox, details, live);
  section.hidden = stops.length === 0;

  // M3-01: compact bar beside the canvas: step, title, flags, previous/next/details/exit, end message.
  const barStep = h("span", { class: "tour-bar-step" });
  const barTitle = h("strong", { class: "tour-bar-title", id: "tour-bar-title", tabindex: "-1" });
  const barFlags = h("p", { class: "tour-bar-flags small" });
  const barEnd = h("p", { class: "tour-bar-end small", hidden: true });
  const barPrev = h("button", { type: "button", id: "tour-bar-prev", "data-focus-key": "tour-bar-prev", on: { click: () => go(index - 1) } }, arrow("→ "), s.prev);
  const barNext = h("button", { type: "button", id: "tour-bar-next", "data-focus-key": "tour-bar-next", on: { click: () => go(index + 1) } }, s.next, arrow(" ←"));
  const barDetails = h("button", { type: "button", id: "tour-bar-details", "data-focus-key": "tour-bar-details", text: s.barDetails,
    on: { click: () => { stopHeading.scrollIntoView({ block: "start" }); focusHeading(); } } });
  const barExit = h("button", { type: "button", id: "tour-bar-exit", class: "tour-exit", "data-focus-key": "tour-bar-exit", text: s.exit, on: { click: () => exit() } });
  if (bar) {
    bar.classList.add("tour-bar");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", s.barLabel);
    bar.replaceChildren(h("p", { class: "tour-bar-head" }, barStep, " ", barTitle), barFlags, barEnd,
      h("div", { class: "button-row tour-bar-controls" }, barPrev, barNext, barDetails, barExit));
    bar.hidden = true;
  }

  function goFromList(target) {
    if (!active) { start(target); return; }
    go(target, { focus: "heading" });
  }
  function buildList() {
    list.replaceChildren(...sequences.map((sequence) => h("div", { class: "tour-stops-group" },
      h("h4", { text: isolateLatin(sequence.name ?? "") }),
      h("ol", { class: "step-list", "aria-label": s.stopsLabel },
        stops.slice(sequence.firstStopIndex, sequence.firstStopIndex + sequence.stopCount).map((stop) => h("li", {},
          h("button", { type: "button", class: "step-button tour-stop-button", "data-stop": String(stop.index), "data-focus-key": `tour-stop-${stop.index}`,
            on: { click: () => goFromList(stop.index) } },
          h("span", { class: "step-number", text: String(stop.number) }), h("span", { text: stop.title ?? stop.eventId }))))))));
  }
  buildList();

  function markList() {
    for (const button of list.querySelectorAll(".tour-stop-button")) {
      if (active && Number(button.dataset.stop) === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
  }

  function renderScene(stop) {
    const names = stop.pieces.map((piece) => piece.label ?? piece.id).join(" · ");
    const canOpen = scene.webgl !== false; // M3-10: without WebGL the 3D button and its invitation are not offered
    let text;
    let showButton = false;
    if (!stop.placed) text = s.noPiece;
    else if (!scene.open || !scene.renderer) {
      text = [format(s.pieceLine, { names }), canOpen ? s.open3dHint : s.open3dUnavailable].join(" ");
      showButton = canOpen && !scene.open;
    } else if (scene.shown === false) text = [format(s.pieceLine, { names }), s.pieceNotShown].join(" ");
    else text = [format(s.pieceLine, { names }), stop.sameAsPrevious ? s.sameAsPrevious : null].filter(Boolean).join(" · ");
    sceneNote.textContent = text;
    sceneNote.dataset.kind = !stop.placed ? "unplaced" : scene.open && scene.renderer ? (scene.shown === false ? "not-shown" : "shown") : "closed";
    open3dButton.hidden = !showButton;
    open3dButton.disabled = !canOpen;
    renderBar(stop);
  }

  function isBarVisible() { return Boolean(bar && active && scene.open && scene.renderer); }

  function renderBar(stop) {
    if (!bar) return;
    bar.hidden = !isBarVisible();
    if (bar.hidden) return;
    barStep.textContent = format(s.indicator, { n: stop.number, total: stops.length });
    barTitle.textContent = isolateLatin(stop.title ?? stop.eventId ?? "");
    barFlags.replaceChildren(...[
      stop.inferred ? h("span", { class: "basis-label basis-inferred tour-inferred", text: s.inferredLocation }) : null,
      stop.placed ? (stop.sameAsPrevious ? h("span", { class: "tour-same-place", text: s.sameAsPrevious }) : null) : h("span", { class: "tour-unplaced", text: s.noPiece }),
      stop.placed && scene.shown === false ? h("span", { class: "tour-not-shown", text: s.pieceNotShown }) : null].filter(Boolean).flatMap((node, i) => (i ? [" ", node] : [node])));
    barPrev.disabled = index === 0;
    barNext.disabled = index === stops.length - 1;
    barEnd.hidden = index !== stops.length - 1;
    barEnd.textContent = endText(stop);
  }

  /** M3-09: the tour ends at the last published step; the locator comes from the stop's own evidence. */
  function endText(stop) {
    return stop.evidenceLocator ? format(s.endBody, { locator: stop.evidenceLocator }) : s.endBodyNoLocator;
  }

  function render() {
    section.dataset.active = String(active);
    idleBox.hidden = active;
    activeBox.hidden = !active;
    markList();
    if (!active) { if (bar) bar.hidden = true; return; }
    const stop = stops[index];
    stopHeading.textContent = format(s.indicator, { n: stop.number, total: stops.length });
    prevButton.disabled = index === 0;
    nextButton.disabled = index === stops.length - 1;
    sequenceLine.replaceChildren(h("strong", { text: `${s.sequenceLabel} ` }), isolateLatin(stop.sequenceName ?? ""));
    stageNote.hidden = !stop.stageNote;
    stageNote.textContent = stop.stageNote ?? "";
    continuation.hidden = !stop.continuation;
    continuation.replaceChildren(...(stop.continuation ? [h("strong", { text: `${s.continuationHeading}: ` }),
      h("span", { text: isolateLatin(stop.continuation.note ?? "") })] : []));
    flags.hidden = !stop.inferred;
    flags.replaceChildren(...(stop.inferred ? [h("span", { class: "basis-label basis-inferred tour-inferred", text: s.inferredLocation })] : []));
    const last = index === stops.length - 1;
    endNote.hidden = !last;
    endNote.replaceChildren(...(last ? [h("strong", { text: `${s.endTitle}. ` }), h("span", { text: endText(stop) })] : []));
    renderScene(stop);
  }

  /** Re-render the event card when its inputs changed (`key` covers day type, alternatives, mode); keeps focus otherwise. */
  function refresh(key) {
    if (!active) return;
    const stop = stops[index];
    const wanted = `${stop.index}|${key}`;
    if (wanted === cardKey) return;
    cardKey = wanted;
    const result = cardFor(stop);
    card.replaceChildren(result?.event ? renderCard(result.event) : h("p", { class: "muted", text: s.unavailable }));
    dayNote.hidden = !result?.dayTypeLabel;
    dayNote.textContent = result?.dayTypeLabel ? format(s.computedFor, { dayType: result.dayTypeLabel }) : "";
  }

  function focusHeading() { stopHeading.focus({ preventScroll: false }); }
  // With the bar beside the canvas, focus stays there: the stop's title (not the far-away card heading).
  function focusStop() { if (isBarVisible()) barTitle.focus({ preventScroll: true }); else focusHeading(); }

  function setIndex(next, reason, focus) {
    index = clampStop(next, stops.length);
    cardKey = null;
    render();
    // Re-rendering the card needs the app's current key, so the app calls refresh() right after (see onStop).
    onStop(stops[index], { reason });
    const stop = stops[index];
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = format(s.live, { n: stop.number, total: stops.length, title: stop.title ?? "" }); });
    if (focus === "heading") focusStop();
    else if (focus === "keep") {
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.disabled) focusStop();
    }
  }

  function start(target = 0, { focus = true, reason = "start" } = {}) {
    if (!stops.length) return;
    active = true;
    details.open = true;
    setIndex(target, reason, focus ? "heading" : null);
  }
  function go(target, { focus = "keep" } = {}) {
    if (!active) return;
    const next = clampStop(target, stops.length);
    if (next === index) return;
    setIndex(next, "step", focus);
  }
  function exit({ focus = true } = {}) {
    if (!active) return;
    active = false;
    cardKey = null;
    render();
    onExit();
    if (focus) startButton.focus();
  }

  const onKey = (event) => {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.("input, select, textarea")) return;
    const action = tourKeyAction(event.key, direction());
    if (!action) return;
    event.preventDefault();
    if (action === "exit") exit();
    else go(index + (action === "next" ? 1 : -1));
  };
  section.addEventListener("keydown", onKey);
  bar?.addEventListener("keydown", onKey);
  let touchStart = null;
  card.addEventListener("touchstart", (event) => {
    const t = event.touches[0];
    touchStart = event.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  card.addEventListener("touchend", (event) => {
    const t = event.changedTouches[0];
    if (!touchStart || !t) return;
    const action = swipeAction(t.clientX - touchStart.x, t.clientY - touchStart.y, direction());
    touchStart = null;
    if (action) go(index + (action === "next" ? 1 : -1));
  }, { passive: true });

  return {
    start, go, exit, refresh,
    isActive: () => active,
    barVisible: isBarVisible,
    index: () => index,
    stop: () => (active ? stops[index] : null),
    setScene(next) { scene = { ...scene, ...next }; if (active) renderScene(stops[index]); },
    el: { section }
  };
}
