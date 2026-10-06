// Presentation mode shell (TASK-6-57, ADR-004): a full-viewport overlay with the 3D stage, a HUD and the tour bar.
// DOM controller only. The renderer, the store and the tour are driven by app.js through the hooks below; every
// historical string arrives as data (the tour model), every chrome string comes from strings.he.js.
import { h } from "./dom.js";
import { certaintyChip } from "./evidence-panel.js";
import { format } from "./strings.he.js";
import { tourKeyAction } from "./tour.js";
import { isolateLatin } from "./view-model.js";

/** `?present=1` → true. Never throws. */
export function parsePresentParam(search) {
  try { return new URLSearchParams(typeof search === "string" ? search : "").get("present") === "1"; } catch { return false; }
}

/** `search` with `present=1` set (or removed); other parameters keep their order. */
export function withPresentParam(search, on) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("present");
  if (on) params.set("present", "1");
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const arrow = (glyph) => h("span", { "aria-hidden": "true", text: glyph });

/**
 * @param {{ strings: object, dialogs: HTMLElement[], assumptions: HTMLElement, conflicts: HTMLElement,
 *   hooks: { onExit: () => void, onStyle: (mode: "presentation"|"certainty") => void, onStart: () => void,
 *     onPrev: () => void, onNext: () => void, onChapter?: (stopIndex: number) => void, onDetails: () => void, onEndTour: () => void, onOverview: () => void } }} options
 */
export function createPresentation({ strings, dialogs, assumptions, conflicts, hooks }) {
  const s = strings.present;
  const st = strings.tour;
  let open = false;
  let root = null;
  let saved = null;
  let styleMode = "presentation";
  let fullscreenOwned = false;
  let lastIndex = null;
  const popovers = [];
  const restore = [];

  // ---- HUD pieces ----
  const stage = h("div", { class: "present-stage", id: "present-stage" });
  const status = h("p", { class: "present-status", role: "status", hidden: true });
  const live = h("p", { class: "sr-only", id: "present-live", "aria-live": "polite" });

  const exitButton = h("button", { type: "button", id: "present-exit", class: "present-btn present-exit", "aria-label": s.exitLabel, on: { click: () => hooks.onExit() } },
    arrow("✕ "), h("span", { class: "present-exit-text", text: s.exit }));
  const certaintyButton = h("button", { type: "button", id: "present-certainty", class: "present-btn", "aria-pressed": "false", title: s.certaintyToggleHint,
    on: { click: () => setStyle(styleMode === "certainty" ? "presentation" : "certainty", { notify: true }) } }, s.certaintyToggle);
  const altButton = h("button", { type: "button", id: "present-alternatives", class: "present-btn", text: s.alternatives, hidden: true });
  const legendButton = h("button", { type: "button", id: "present-legend", class: "present-btn", text: s.legend });
  const piecesButton = h("button", { type: "button", id: "present-pieces", class: "present-btn", title: s.piecesHint, text: s.pieces, hidden: true });
  const fullscreenButton = h("button", { type: "button", id: "present-fullscreen", class: "present-btn", hidden: true,
    on: { click: () => toggleFullscreen() } });

  const brand = h("div", { class: "present-brand" },
    h("span", { class: "present-sigil", "aria-hidden": "true", text: "◒" }),
    h("div", {}, h("p", { class: "present-kicker", text: strings.app.kicker }), h("p", { class: "present-title", text: strings.app.heading })));
  const previewStrip = h("p", { class: "present-preview-strip", text: s.previewStrip, hidden: true });
  // On a phone the one-line explanation sits behind the badge (tap to read); elsewhere it is always visible.
  const tierButton = h("button", { type: "button", class: "present-tier-chip", id: "present-tier-chip", "data-tier": "provisional", "aria-controls": "present-tier-text",
    "aria-label": `${strings.scene3d.tierChip}: ${s.provisionalToggle}`, on: { click: () => toggleTier() } }, h("span", { "aria-hidden": "true", text: strings.scene3d.tierChip }));
  const tierBadge = h("p", { class: "present-tier", id: "present-tier", hidden: true }, tierButton, " ",
    h("span", { class: "present-tier-text", id: "present-tier-text", text: strings.scene3d.tierStatement }));
  const phone = typeof matchMedia === "function" ? matchMedia("(max-width: 600px)") : null;
  function syncTier() {
    const compact = Boolean(phone?.matches);
    tierButton.disabled = !compact;
    if (compact) tierButton.setAttribute("aria-expanded", String(tierBadge.dataset.open === "true"));
    else { tierButton.removeAttribute("aria-expanded"); delete tierBadge.dataset.open; }
  }
  function toggleTier() { tierBadge.dataset.open = String(tierBadge.dataset.open !== "true"); syncTier(); }
  phone?.addEventListener?.("change", syncTier);
  syncTier();
  const materialChip = h("p", { class: "present-chip present-material", id: "present-material", text: s.materialChip });
  // ADR-005 D5: in live mode a second chip says that motion, figures, durations and light are illustration. Never hidden there.
  const motionChip = h("p", { class: "present-chip present-material present-motion", id: "present-motion", text: strings.live.motionChip, hidden: true });

  // popovers: alternatives, legend, pieces
  function popover({ id, title, trigger, body }) {
    const closeButton = h("button", { type: "button", class: "present-btn present-popover-close", text: s.close, "aria-label": `${s.close}: ${title}` });
    const panel = h("section", { id: `present-pop-${id}`, class: "present-popover", role: "group", "aria-labelledby": `present-pop-${id}-title`, hidden: true },
      h("div", { class: "present-popover-head" }, h("h2", { id: `present-pop-${id}-title`, text: title, tabindex: "-1" }), closeButton),
      h("div", { class: "present-popover-body" }, body));
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", panel.id);
    const item = { id, trigger, panel, body: panel.querySelector(".present-popover-body") };
    trigger.addEventListener("click", () => (panel.hidden ? openPopover(item) : closePopover(item, { focus: true })));
    closeButton.addEventListener("click", () => closePopover(item, { focus: true }));
    popovers.push(item);
    return item;
  }
  function openPopover(item) {
    for (const other of popovers) if (other !== item) closePopover(other);
    item.panel.hidden = false;
    item.trigger.setAttribute("aria-expanded", "true");
    root.dataset.popover = item.id;
    item.panel.querySelector("h2")?.focus();
  }
  function closePopover(item, { focus = false } = {}) {
    if (item.panel.hidden) return;
    item.panel.hidden = true;
    item.trigger.setAttribute("aria-expanded", "false");
    if (root && root.dataset.popover === item.id) delete root.dataset.popover;
    if (focus) item.trigger.focus();
  }
  const openPopovers = () => popovers.filter((item) => !item.panel.hidden);

  const altPop = popover({ id: "alternatives", title: s.alternatives, trigger: altButton, body: [] });
  const legendBody = h("div", { class: "present-legend-body" },
    h("p", { class: "present-material-explain", id: "present-material-explain", text: s.materialExplain }),
    h("p", { class: "present-markers-explain", id: "present-markers-explain" }, h("strong", { text: `${s.markersLegendTitle}: ` }), s.markersLegend),
    h("div", { class: "present-live-legend", id: "present-live-legend", hidden: true },
      h("p", {}, h("strong", { text: `${strings.live.legendTitle}: ` }), strings.live.legend),
      h("p", { text: strings.live.figuresLegend }), h("p", { text: strings.live.lightLegend }), h("p", { text: strings.live.durationNote }),
      h("p", { text: strings.live.orderLegend }), h("p", { text: strings.live.conditionalLegend }),
      h("p", { class: "small", text: strings.live.walkHint })),
    h("p", { class: "present-key-help small muted", text: s.keyHelp }),
    // R-06: the licences dialog is reachable without leaving the presentation (it opens inside the overlay, on top).
    h("p", { class: "present-legend-footer" }, h("button", { type: "button", id: "present-licences", class: "present-btn", "aria-haspopup": "dialog",
      text: strings.licences.button, on: { click: (event) => hooks.onLicences?.(event.currentTarget) } })));
  const legendPop = popover({ id: "legend", title: s.legendTitle, trigger: legendButton, body: legendBody });
  const piecesPop = popover({ id: "pieces", title: s.pieces, trigger: piecesButton, body: [] });

  // ---- bottom: start card + tour card ----
  const startButton = h("button", { type: "button", id: "present-start", class: "present-btn present-primary", text: strings.tour.start, on: { click: () => hooks.onStart() } });
  const idleBody = h("p", { class: "present-idle-body", id: "present-idle-body" });
  const idleCard = h("div", { class: "present-idle", id: "present-idle" },
    h("h2", { class: "present-idle-title", text: s.startTitle }),
    idleBody,
    h("p", { class: "present-explore", text: s.startExplore }),
    h("p", { class: "present-idle-actions" }, startButton,
      h("button", { type: "button", id: "present-back-live", class: "present-btn", text: s.backToLive, hidden: !hooks.onLive, on: { click: () => hooks.onLive?.() } })));
  // M6 live mode (ADR-005): the live HUD (built by live.js) takes the place of the idle and tour cards.
  const liveSlot = h("div", { class: "present-live", id: "present-live", hidden: true });

  const stepLabel = h("p", { class: "present-step", id: "present-step" });
  // TASK-6-77: the chapter ("משנה תמיד ד") beside the step, and a compact chapter picker (native select: keyboard and phone friendly).
  const chapterText = h("span", { class: "present-chapter", id: "present-chapter" });
  const chapterSelect = h("select", { id: "present-chapter-select", class: "present-chapter-select", "aria-label": st.chapterControl,
    on: { change: () => hooks.onChapter?.(Number(chapterSelect.value)) } });
  const chapterPicker = h("span", { class: "present-chapter-picker", hidden: true }, chapterSelect);
  const stopTitle = h("h2", { class: "present-stop-title", id: "present-stop-title", tabindex: "-1" });
  const attribution = h("p", { class: "present-attribution", id: "present-attribution" });
  const chipRow = h("p", { class: "present-chip-row", id: "present-chip-row" });
  // T-03: the stage note, the continuation note at a sequence boundary and the standing "order is the story's order" line.
  const stageNoteEl = h("p", { class: "present-stage-note", id: "present-stage-note", hidden: true });
  const continuationEl = h("p", { class: "present-continuation", id: "present-continuation", role: "note", hidden: true });
  const orderLine = h("p", { class: "present-order-line small", id: "present-order-line", text: s.orderLine });
  const notes = h("div", { class: "present-notes", id: "present-notes" }, stageNoteEl, continuationEl, orderLine);
  const endText = h("p", { class: "present-end-text", id: "present-end-text" });
  const overviewButton = h("button", { type: "button", id: "present-overview", class: "present-btn", text: s.backToOverview, on: { click: () => hooks.onOverview() } });
  const endExitButton = h("button", { type: "button", id: "present-end-exit", class: "present-btn", text: s.exit, "aria-label": s.exitLabel, on: { click: () => hooks.onExit() } });
  // End card (TASK-6-58): at the last stop, says where the recorded steps stop and offers the overview or leaving.
  const endNote = h("div", { class: "present-end", id: "present-end", role: "group", "aria-label": s.endCardTitle, hidden: true }, endText,
    h("div", { class: "present-end-actions" }, overviewButton, endExitButton));
  const progress = h("div", { class: "present-progress", "aria-hidden": "true" });
  const prevButton = h("button", { type: "button", id: "present-prev", class: "present-btn", on: { click: () => hooks.onPrev() } }, arrow("→ "), s.prev);
  const nextButton = h("button", { type: "button", id: "present-next", class: "present-btn present-primary", on: { click: () => hooks.onNext() } }, s.next, arrow(" ←"));
  // R-08: on a phone the card is compact (one-line attribution, chips on one scrolling line); this toggle shows everything.
  const moreButton = h("button", { type: "button", id: "present-more", class: "present-btn present-quiet present-more", "aria-expanded": "false", "aria-controls": "present-active-main",
    text: s.more, on: { click: () => setExpanded(activeMain.dataset.expanded !== "true") } });
  function setExpanded(on) {
    activeMain.dataset.expanded = String(on);
    moreButton.setAttribute("aria-expanded", String(on));
    moreButton.textContent = on ? s.less : s.more;
  }
  const detailsButton = h("button", { type: "button", id: "present-details", class: "present-btn", "aria-haspopup": "dialog", "aria-label": s.detailsLabel,
    on: { click: () => hooks.onDetails() } }, s.details);
  const endTourButton = h("button", { type: "button", id: "present-end-tour", class: "present-btn present-quiet", text: s.endTour, on: { click: () => hooks.onEndTour() } });
  const activeMain = h("div", { class: "present-tour-main", id: "present-active-main", "data-expanded": "false" },
    h("div", { class: "present-step-row" }, h("span", { class: "present-step-group" }, stepLabel, chapterText),
      h("span", { class: "present-step-actions" }, chapterPicker, moreButton, endTourButton)), stopTitle,
    h("div", { class: "present-meta" }, attribution, chipRow), notes, endNote);
  const activeCard = h("div", { class: "present-active", id: "present-active", hidden: true },
    activeMain,
    h("div", { class: "present-tour-controls", role: "group", "aria-label": st.controlsLabel }, prevButton, nextButton, detailsButton),
    progress);
  const bottom = h("section", { class: "present-bottom", id: "present-bottom", "aria-label": st.barLabel }, idleCard, activeCard, liveSlot);

  const actions = h("div", { class: "present-actions", role: "group", "aria-label": s.regionLabel }, certaintyButton, altButton, legendButton, piecesButton, fullscreenButton, exitButton);
  const top = h("header", { class: "present-top" },
    h("div", { class: "present-top-row" }, brand, actions),
    h("div", { class: "present-top-row present-chips" }, previewStrip, tierBadge, materialChip, motionChip),
    altPop.panel, legendPop.panel, piecesPop.panel);
  const top_rows = () => top.querySelectorAll(".present-top-row");
  const hud = h("div", { class: "present-hud" }, top, bottom);

  function buildRoot() {
    root = h("div", { id: "present", class: "present", role: "region", "aria-label": s.regionLabel, "data-style-mode": styleMode, "data-tour": "idle", "data-live": "false", dir: "rtl" }, hud, stage, status, live);
    stage.addEventListener("pointerdown", () => { for (const item of openPopovers()) closePopover(item); });
    return root;
  }

  // ---- style (certainty overlay) ----
  function setStyle(mode, { notify = false } = {}) {
    styleMode = mode === "certainty" ? "certainty" : "presentation";
    certaintyButton.setAttribute("aria-pressed", String(styleMode === "certainty"));
    if (root) root.dataset.styleMode = styleMode;
    if (notify) hooks.onStyle(styleMode);
  }

  // ---- fullscreen ----
  const fsElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
  function requestFullscreen() {
    const fn = root?.requestFullscreen ?? root?.webkitRequestFullscreen;
    if (!fn) return;
    try {
      const result = fn.call(root);
      if (result && typeof result.then === "function") result.then(() => { fullscreenOwned = fsElement() === root; syncFullscreenButton(); }, () => {});
    } catch { /* fullscreen is optional */ }
  }
  function leaveFullscreen() {
    if (fsElement()) {
      try { const result = (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document); result?.catch?.(() => {}); } catch { /* ignore */ }
    }
  }
  function toggleFullscreen() {
    if (fsElement() === root) { fullscreenOwned = false; leaveFullscreen(); } else requestFullscreen();
  }
  function syncFullscreenButton() {
    const supported = Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);
    fullscreenButton.hidden = !supported;
    const on = fsElement() === root;
    fullscreenButton.textContent = on ? s.fullscreenExit : s.fullscreen;
    fullscreenButton.setAttribute("aria-pressed", String(on));
  }
  const onFullscreenChange = () => {
    if (!open) return;
    if (fsElement() === root) { fullscreenOwned = true; syncFullscreenButton(); return; }
    syncFullscreenButton();
    // The browser left fullscreen (Esc, F11, the OS): presentation mode ends too, unless a dialog or a popover was
    // open: browsers spend the first Esc on leaving fullscreen, so that one closes the dialog or popover instead.
    if (!fullscreenOwned) return;
    fullscreenOwned = false;
    const popoversOpen = openPopovers();
    if (dialogOpen() || popoversOpen.length) {
      hooks.onCloseDialogs?.();
      for (const item of popoversOpen) closePopover(item, { focus: true });
      return;
    }
    hooks.onExit();
  };

  // ---- keyboard ----
  const dialogOpen = () => dialogs.some((dialog) => dialog.open);
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (dialogOpen()) return; // the dialog's own handlers deal with Escape and Tab
    if (event.key === "Escape") {
      const current = openPopovers();
      event.preventDefault();
      event.stopPropagation();
      if (current.length) { for (const item of current) closePopover(item, { focus: true }); return; }
      (hooks.onEscape ?? hooks.onExit)(); // R-11: Esc ends the tour as well; the "יציאה" button keeps it for the page
      return;
    }
    if (event.target.closest?.("input, select, textarea")) return;
    const action = tourKeyAction(event.key, "rtl");
    if ((action === "next" || action === "prev") && root.dataset.tour === "active") {
      event.preventDefault();
      event.stopPropagation();
      (action === "next" ? hooks.onNext : hooks.onPrev)();
    }
  }
  // Capture phase: with a tour running, the arrows step the tour even when the canvas has focus.
  const onCapturedKey = (event) => { if (open && (root.contains(event.target) || event.target === document.body)) onKeyDown(event); };

  // ---- open / close ----
  function setInert(on) {
    if (on) {
      restore.length = 0;
      for (const child of document.body.children) {
        if (child === root || child.tagName === "SCRIPT" || child.id === "live-status" || child.hasAttribute("inert")) continue;
        child.setAttribute("inert", "");
        restore.push(child);
      }
    } else {
      for (const child of restore) child.removeAttribute("inert");
      restore.length = 0;
    }
  }
  const homes = [];
  function adoptDialogs() {
    homes.length = 0;
    for (const dialog of dialogs) {
      homes.push({ dialog, parent: dialog.parentNode, next: dialog.nextSibling });
      root.append(dialog);
    }
    for (const [node, item] of [[conflicts, altPop], [assumptions, altPop]]) {
      homes.push({ dialog: node, parent: node.parentNode, next: node.nextSibling });
      item.body.append(node);
    }
  }
  function returnDialogs() {
    for (const dialog of dialogs) if (dialog.open) dialog.close();
    for (const { dialog, parent, next } of homes.reverse()) {
      if (next && next.parentNode === parent) parent.insertBefore(dialog, next); else parent.append(dialog);
    }
    homes.length = 0;
  }

  return {
    stage,
    isOpen: () => open,
    styleMode: () => styleMode,
    /** Build and show the overlay (synchronously, so a fullscreen request stays inside the user gesture). */
    open({ fullscreen = false, opener = null } = {}) {
      if (open) return;
      open = true;
      saved = { x: window.scrollX, y: window.scrollY, opener: opener ?? document.activeElement };
      buildRoot();
      document.body.append(root);
      document.body.classList.add("is-presenting");
      adoptDialogs();
      setInert(true);
      setStyle("presentation");
      syncFullscreenButton();
      document.addEventListener("fullscreenchange", onFullscreenChange);
      document.addEventListener("webkitfullscreenchange", onFullscreenChange);
      document.addEventListener("keydown", onCapturedKey, true);
      if (fullscreen) requestFullscreen();
      (startButton.hidden ? nextButton : startButton).focus({ preventScroll: true });
    },
    close() {
      if (!open) return;
      open = false;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onCapturedKey, true);
      fullscreenOwned = false;
      returnDialogs();
      leaveFullscreen();
      setInert(false);
      for (const item of popovers) { item.panel.hidden = true; item.trigger.setAttribute("aria-expanded", "false"); }
      root.remove();
      document.body.classList.remove("is-presenting");
      lastIndex = null;
      root = null;
    },
    /** After the page has re-rendered: put the scroll position and the focus back where the visitor left them. */
    restoreView() {
      if (!saved) return;
      window.scrollTo(saved.x, saved.y);
      let target = saved.opener;
      if (!target?.isConnected || target === document.body) target = document.getElementById("present-open"); // entered by URL
      if (target && !target.hidden) target.focus({ preventScroll: true });
      saved = null;
    },
    markReady() { if (root) root.dataset.ready = "true"; },
    /** Live mode on (with the HUD node from live.js) or off (null): swaps the bottom card and shows the motion chip. */
    setLive(node) {
      const on = Boolean(node);
      liveSlot.replaceChildren(...(on ? [node] : []));
      liveSlot.hidden = !on;
      motionChip.hidden = !on;
      legendBody.querySelector("#present-live-legend").hidden = !on;
      legendBody.querySelector("#present-markers-explain").hidden = on; // the M4 marker text does not describe moving figures
      if (on) { idleCard.hidden = true; activeCard.hidden = true; }
      else if (root?.dataset.tour !== "active") idleCard.hidden = false;
      if (root) { root.dataset.live = String(on); root.setAttribute("aria-label", on ? strings.live.regionLabel : s.regionLabel); }
    },
    isLive: () => !liveSlot.hidden,
    setStyle,
    setStatus(text) { status.hidden = !text; status.textContent = text ?? ""; },
    /** Adopt renderer-owned nodes (legend, piece list) into the popovers so they never cover the canvas. */
    adoptRendererNodes({ legend = null, list = null } = {}) {
      if (legend) legendBody.prepend(legend);
      if (list) { piecesPop.body.replaceChildren(list); piecesButton.hidden = false; }
    },
    /** Context from the 3D panel render: preview strip, provisional badge, alternatives availability, conflicts. */
    /** The tour's chapters ({ label, firstStopIndex }) for the picker; set once after the tour is built. */
    setChapters(chapters = []) {
      chapterSelect.replaceChildren(...chapters.map((chapter) => h("option", { value: String(chapter.firstStopIndex), text: format(st.chapterOption, { label: chapter.label, n: chapter.firstStopIndex + 1 }) })));
      chapterPicker.hidden = chapters.length < 2;
    },
    setContext({ preview = false, provisional = false, hasAlternatives = false, conflict = false, total = 0 } = {}) {
      previewStrip.hidden = !preview;
      tierBadge.hidden = !provisional;
      altButton.hidden = !hasAlternatives;
      altButton.textContent = conflict ? s.alternativesWarn : s.alternatives;
      altButton.dataset.conflict = String(conflict);
      if (!hasAlternatives) closePopover(altPop);
      idleBody.textContent = format(s.startBody, { total });
    },
    /**
     * model: null (before the tour) or { index, total, title, chapterTitle, chapterStart, endText, conditionalKind, conditionalLabel,
     *   conditionalNote, locator, locationBasis, inferred, placed, certainty,
     *   shown, sameAsPrevious, shotKind: "piece"|"area"|"overview", areaName }.
     */
    setTour(model) {
      const active = Boolean(model);
      if (!root) return;
      root.dataset.tour = active ? "active" : "idle";
      const liveOn = !liveSlot.hidden;
      idleCard.hidden = active || liveOn;
      activeCard.hidden = !active || liveOn;
      if (!active) { lastIndex = null; return; }
      stepLabel.textContent = format(st.indicator, { n: model.index + 1, total: model.total });
      chapterText.textContent = model.chapterTitle ?? "";
      if (model.chapterStart != null && chapterSelect.querySelector(`option[value="${model.chapterStart}"]`)) chapterSelect.value = String(model.chapterStart);
      endText.textContent = model.endText ?? s.endCardNoRange;
      stopTitle.textContent = isolateLatin(model.title ?? "");
      // T-08: same locators as the title when it carries them ("לפי משנה תמיד א, ב; א, ד").
      attribution.textContent = model.attributionText ? isolateLatin(model.attributionText) : model.locator ? format(s.attribution, { locator: model.locator }) : s.noAttribution;
      attribution.dataset.same = String(Boolean(model.attributionText));
      stageNoteEl.hidden = !model.stageNote;
      stageNoteEl.textContent = model.stageNote ? isolateLatin(model.stageNote) : "";
      continuationEl.hidden = !model.continuation;
      continuationEl.replaceChildren(...(model.continuation ? [h("strong", { text: `${st.continuationHeading}: ` }),
        h("span", { text: isolateLatin(model.continuation.previousSequenceName ?? "") }), " ", h("span", { text: isolateLatin(model.continuation.note ?? "") })] : []));
      const chips = [
        model.conditionalLabel ? h("span", { class: "present-chip present-conditional", "data-conditional": model.conditionalKind ?? "other", text: model.conditionalLabel }) : null,
        model.certainty ? certaintyChip(model.certainty, strings, "present-chip present-certainty-chip") : null,
        h("span", { class: "present-chip present-location", "data-basis": model.locationBasis ?? "unknown",
          text: `${s.locationLabel}: ${strings.locationBasis[model.locationBasis] ?? strings.locationBasis.unknown}` }),
        !model.placed ? h("span", { class: "present-chip present-note", "data-shot": model.shotKind ?? "overview",
          text: model.shotKind === "area" && model.areaName ? format(s.unplacedArea, { area: model.areaName }) : s.unplacedNote }) : null,
        model.placed && model.shown === false ? h("span", { class: "present-chip present-note", text: st.pieceNotShown }) : null,
        model.placed && model.sameAsPrevious ? h("span", { class: "present-chip present-note", text: st.sameAsPrevious }) : null,
        model.conditionalNote ? h("span", { class: "present-chip present-note present-conditional-note", text: model.conditionalNote }) : null
      ].filter(Boolean);
      chipRow.replaceChildren(...chips);
      const last = model.index === model.total - 1;
      endNote.hidden = !last;
      root.dataset.end = String(last);
      if (progress.childElementCount !== model.total) progress.replaceChildren(...Array.from({ length: model.total }, () => h("span", { class: "present-progress-seg" })));
      [...progress.children].forEach((seg, i) => { seg.dataset.state = i < model.index ? "done" : i === model.index ? "current" : "todo"; });
      prevButton.disabled = model.index === 0;
      nextButton.disabled = last;
      if (lastIndex !== model.index) {
        lastIndex = model.index;
        setExpanded(false);
        live.textContent = "";
        const message = format(st.live, { n: model.index + 1, total: model.total, title: model.title ?? "" });
        requestAnimationFrame(() => { live.textContent = message; });
      }
      // A disabled button cannot keep focus: move to the control that still works.
      const focused = document.activeElement;
      if (focused === document.body || focused?.disabled) (nextButton.disabled ? prevButton : nextButton).focus({ preventScroll: true });
    },
    /** HUD overlap with the canvas (px): lets the renderer put the subject of a shot in the free area between top and bottom. */
    insets() {
      if (!root) return { top: 0, bottom: 0 };
      const height = root.getBoundingClientRect().height;
      const topBox = top.getBoundingClientRect();
      const bottomBox = bottom.getBoundingClientRect();
      return { top: Math.max(0, Math.round(topBox.bottom - 24)), bottom: Math.max(0, Math.round(height - bottomBox.top + 8)) };
    },
    focusStart() { if (!liveSlot.hidden) return; (activeCard.hidden ? startButton : nextButton).focus({ preventScroll: true }); },
    focusStop() { stopTitle.focus({ preventScroll: true }); },
    /** Pixels of the stage covered by the HUD at the top and the bottom (marker labels keep clear of them). */
    hudInsets() {
      const area = stage.getBoundingClientRect();
      const top = Math.max(0, ...[...top_rows()].map((el) => el.getBoundingClientRect().bottom - area.top));
      // The whole bottom panel (its padding and border included), so a label can never touch the card.
      return { top, bottom: Math.max(0, area.bottom - bottom.getBoundingClientRect().top) };
    },
    focusables: () => [...root.querySelectorAll(FOCUSABLE)],
    el: { get root() { return root; } }
  };
}
