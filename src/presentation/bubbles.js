// Background bubbles of the living layer (TASK-6-167, ADR-005 D5). Small labels over the active figures and places:
// role · action, a one-line locator, the certainty chip and any conditional mark. Every visible word comes from the
// published records (role names, participant actions, locators, certainty) or from chrome strings. Tap → evidence dialog.
// Pure part (bubbleModel, selectBubbles, stackBubbles): Node-testable. createBubbles(): DOM.
import { h } from "./dom.js";
import { certaintyChip } from "./evidence-panel.js";
import { format } from "./strings.he.js";
import { isolateLatin } from "./view-model.js";

export const BUBBLE_CAP = Object.freeze({ phone: 3, wide: 5 });
export const FADE_NEAR = 18;
export const FADE_FAR = 140;

const he = (text) => (text && typeof text === "object" ? text.he ?? "" : typeof text === "string" ? text : "");
/** The role name without its parenthesised source gloss (as the marker labels show it). */
const shortRole = (role) => he(role?.name).replace(/\s*\(.*$/s, "").trim();

/** Most role–action pairs a bubble lists; the rest are counted and left to the sources (TASK-6-169 L-01). */
export const BUBBLE_PAIRS = 2;

/**
 * One bubble's content for an event: { eventId, pairs: [{ role, action }], more, roles, locator, count, conditional, placed,
 * raised, inferred, areaName }. `stop` = the tour stop (buildTourStops), `markers` = markersAt(world, { eventId }).markers.
 * L-01: every action is printed beside the role of the participant whose action it is in the record, never beside another
 * role; identical role–action pairs are listed once.
 */
export function bubbleModel({ stop, markers = [], world, strings, conditionalText = null, raised = false }) {
  const roles = new Map((world?.roles ?? []).map((role) => [role.id, role]));
  const all = [];
  for (const marker of markers) {
    const pair = { role: shortRole(roles.get(marker.roleId)) || marker.roleId || "", action: marker.action?.he ?? "" };
    if (!all.some((item) => item.role === pair.role && item.action === pair.action)) all.push(pair);
  }
  const names = [...new Set(all.map((pair) => pair.role).filter(Boolean))];
  const s = strings.live;
  const counts = markers.map((marker) => (marker.capped ? format(s.bubbleCapped, { shown: marker.displayCount, total: marker.count?.value })
    : marker.countStated === false ? s.bubbleCountUnstated : null)).filter(Boolean);
  return {
    eventId: stop?.eventId ?? null,
    title: stop?.title ?? "",
    roles: names.join(", "),
    pairs: all.slice(0, BUBBLE_PAIRS),
    more: Math.max(0, all.length - BUBBLE_PAIRS),
    // L-15: the same locators as the title when it lists them ("(לפי משנה תמיד ה, ה)"), else the primary evidence locator.
    locator: /\(לפי ([^)]*)\)\s*$/u.exec(stop?.title ?? "")?.[1] ?? stop?.evidenceLocator ?? null,
    count: [...new Set(counts)].join(" · ") || null,
    conditional: conditionalText,
    placed: Boolean(stop?.placed),
    raised: Boolean(raised),
    inferred: Boolean(stop?.inferred),
    areaName: stop?.frame?.kind === "area" ? stop.frame.areaName : null
  };
}

/**
 * Pick and fade the bubbles to show. candidates: [{ id, distance, onScreen, priority? }]. Off-screen ones are dropped; the
 * nearest `cap` stay. Opacity: 1 up to `near`, falling linearly to 0 at `far` (a bubble at or past `far` is dropped).
 */
export function selectBubbles(candidates, { cap = BUBBLE_CAP.wide, near = FADE_NEAR, far = FADE_FAR } = {}) {
  return (candidates ?? [])
    .filter((item) => item.onScreen && Number.isFinite(item.distance) && item.distance < far)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.distance - b.distance || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, cap))
    .map((item) => ({ ...item, opacity: item.distance <= near ? 1 : Math.max(0, 1 - (item.distance - near) / (far - near)) }));
}

/**
 * Greedy de-overlap: bubbles sorted by their anchor's y are pushed up until they clear the ones already placed.
 * items: [{ id, x, y, w, h }] (top-left boxes, px). Returns new y per id. `minTop` keeps them below the HUD.
 */
export function stackBubbles(items, { minTop = 0, gap = 6 } = {}) {
  const placed = [];
  const out = new Map();
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    let y = item.y;
    for (let guard = 0; guard < 20; guard += 1) {
      const hit = placed.find((other) => item.x < other.x + other.w && other.x < item.x + item.w && y < other.y + other.h + gap && other.y < y + item.h + gap);
      if (!hit) break;
      y = hit.y - item.h - gap;
    }
    y = Math.max(y, minTop);
    placed.push({ ...item, y });
    out.set(item.id, y);
  }
  return out;
}

/**
 * DOM layer over the canvas. update(list) where list = [{ id, model, view (event view for certainty), px, py, opacity }].
 * Elements are reused per event id. onOpen(eventId, element) opens the evidence dialog.
 */
export function createBubbles({ container, strings, onOpen }) {
  const layer = h("div", { class: "live-bubbles", id: "live-bubbles", "aria-label": strings.live.bubblesLabel });
  container.append(layer);
  const els = new Map();
  let visible = true;
  function element(item) {
    let el = els.get(item.id);
    const key = `${JSON.stringify(item.model.pairs)}|${item.model.more}|${item.model.raised}|${item.model.locator}|${item.view?.certainty?.level ?? ""}|${item.model.conditional ?? ""}|${item.model.count ?? ""}`;
    if (el && el.dataset.key === key) return el;
    const m = item.model;
    const s = strings.live;
    const notes = [
      m.raised ? s.bubbleRaised : !m.placed ? s.bubbleUnplaced : null,
      m.placed && m.inferred ? s.bubbleInferred : null,
      m.count
    ].filter(Boolean);
    const body = [
      ...m.pairs.map((pair) => h("span", { class: "live-bubble-line live-bubble-who" }, h("strong", { text: isolateLatin(pair.role) }), pair.action ? `: ${isolateLatin(pair.action)}` : "")),
      m.more ? h("span", { class: "live-bubble-line live-bubble-note", text: format(s.bubblePairsMore, { n: m.more }) }) : null,
      h("span", { class: "live-bubble-line live-bubble-meta" },
        m.locator ? h("span", { class: "live-bubble-locator", text: isolateLatin(format(s.locatorPrefix, { locator: m.locator })) }) : null,
        item.view?.certainty ? certaintyChip(item.view.certainty, strings, "live-bubble-chip") : null,
        m.conditional ? h("span", { class: "live-bubble-chip live-bubble-conditional", text: m.conditional }) : null),
      notes.length ? h("span", { class: "live-bubble-line live-bubble-note", text: notes.join(" · ") }) : null
    ].filter(Boolean);
    const next = h("button", { type: "button", class: "live-bubble", "data-event-id": item.id, "data-placed": String(m.placed), "data-focus-key": `live-bubble-${item.id}`,
      "aria-label": format(s.bubbleOpen, { title: m.title || m.roles }), on: { click: (event) => onOpen(item.id, event.currentTarget) } }, ...body);
    next.dataset.key = key;
    if (el) el.replaceWith(next); else layer.append(next);
    els.set(item.id, next);
    return next;
  }
  return {
    layer,
    setVisible(on) { visible = Boolean(on); layer.hidden = !visible; },
    isVisible: () => visible,
    update(list, { minTop = 0 } = {}) {
      const keep = new Set(list.map((item) => item.id));
      for (const [id, el] of els) if (!keep.has(id)) { el.remove(); els.delete(id); }
      if (!visible) return;
      const width = layer.clientWidth || container.clientWidth || 0;
      const boxes = list.map((item) => {
        const el = element(item);
        const w = el.offsetWidth;
        const hgt = el.offsetHeight;
        const x = Math.min(Math.max(item.px - w / 2, 4), Math.max(width - w - 4, 4));
        return { id: item.id, x, y: item.py - hgt - 6, w, h: hgt, el, opacity: item.opacity };
      });
      const ys = stackBubbles(boxes, { minTop });
      for (const box of boxes) {
        box.el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(ys.get(box.id))}px)`;
        box.el.style.opacity = String(Math.round(box.opacity * 100) / 100);
        box.el.tabIndex = box.opacity > 0.25 ? 0 : -1;
      }
      layer.dataset.count = String(list.length);
    },
    dispose() { layer.remove(); els.clear(); }
  };
}
