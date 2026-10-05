// Browser renderer for scene descriptors (TASK-6-01..6-04, ADR-001): an inline SVG connectivity diagram.
// mountScene(container, { onSelect, labelFor, strings, dir? }) → { update(descriptors), setSelected(ref|null), destroy() }
//
// Rules: no historical text here (labels come from labelFor(labelRef) = data; chrome from strings); no positions
// for unplaced things beyond the tray band; edges carry no arrowheads (record direction is not asserted as a
// one-way passage); the textual view stays complete without this module. See docs/scene/integration.md.

import { accessibleName, buildNavigation, computePixelLayout, directionForKey, nextFocusKey, refKey, strokeFor, wrapLabel, METRICS } from "./svg-layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let mountCounter = 0;

function svg(tag, attributes = {}, children = []) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    element.setAttribute(name, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

function html(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "text") element.textContent = String(value);
    else element.setAttribute(name, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

function textLines(lines, { x, y, anchor, className }) {
  const text = svg("text", { x, y, "text-anchor": anchor, class: className, fill: "currentColor", "font-size": 13 });
  lines.forEach((line, index) => {
    const span = svg("tspan", { x, dy: index === 0 ? 0 : METRICS.lineHeight });
    // M3-13: wrapped lines are separate tspans, so a space at the break keeps the label's text content readable aloud.
    span.textContent = index < lines.length - 1 ? `${line} ` : line;
    text.append(span);
  });
  return text;
}

function swatch(treatment, { active = false, hatchId, entity = false } = {}) {
  const stroke = strokeFor(treatment, { active });
  const shape = entity
    ? svg("rect", { x: 2, y: 3, width: 28, height: 10, rx: 5, fill: "none", stroke: "currentColor", "stroke-width": stroke.width, "stroke-dasharray": stroke.dasharray })
    : svg("rect", { x: 1, y: 1, width: 30, height: 14, rx: 3, fill: stroke.hatched ? `url(#${hatchId})` : "none",
      stroke: "currentColor", "stroke-width": stroke.width, "stroke-dasharray": stroke.dasharray });
  return svg("svg", { width: 32, height: 16, viewBox: "0 0 32 16", "aria-hidden": "true", focusable: "false", class: "scene-swatch" }, [shape]);
}

/**
 * @param {HTMLElement} container element the scene owns (its children are replaced)
 * @param {{ onSelect: (sel: { refKind: string, refId: string, eventIds: string[] }) => void,
 *           labelFor: (labelRef: { kind: string, id?: string, locationId?: string, index?: number }) => string,
 *           strings: object, dir?: "rtl"|"ltr" }} options
 */
export function mountScene(container, { onSelect = () => {}, labelFor = () => "", strings = {}, dir, annotate = () => null } = {}) {
  const id = `scene-${(mountCounter += 1)}`;
  const hatchId = `${id}-hatch`;
  const direction = dir ?? (getComputedStyle(container).direction === "ltr" ? "ltr" : "rtl");
  const safeLabel = (ref) => {
    try { return String(labelFor(ref) ?? ""); } catch { return ""; }
  };
  // Optional UI annotation per item: { inferred?: boolean, nameParts?: string[] } (TASK-5-11, R-08).
  const safeAnnotate = (item) => {
    try { return annotate(item) ?? {}; } catch { return {}; }
  };
  const tagsFor = (item) => (safeAnnotate(item).inferred && strings.inferredLocation ? [`(${strings.inferredLocation})`] : []);

  const figure = html("figure", { class: "scene-figure", "data-scene-id": id });
  const svgRoot = svg("svg", { role: "group", "aria-label": strings.groupLabel ?? "", class: "scene-svg", "data-layout": "diagrammatic" });
  svgRoot.setAttribute("direction", direction);
  svgRoot.style.direction = direction;
  svgRoot.style.display = "block";
  svgRoot.style.maxWidth = "none";
  svgRoot.style.color = "inherit";
  const legend = html("figcaption", { class: "scene-legend" });
  figure.append(svgRoot, legend);
  container.replaceChildren(figure);

  let descriptors = null;
  let nav = null;
  let selectedKey = null;
  let destroyed = false;
  const items = new Map(); // refKey → { element, item }

  const select = (item) => onSelect({ refKind: item.refKind, refId: item.refId, eventIds: [...(item.activeEventIds ?? [])] });

  function focusKey(key) {
    items.get(key)?.element.focus();
  }

  function onKeyDown(event) {
    const target = event.target.closest?.("[data-ref-key]");
    if (!target || !descriptors) return;
    const key = target.getAttribute("data-ref-key");
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      const entry = items.get(key);
      if (entry) select(entry.item);
      return;
    }
    const logical = directionForKey(event.key, direction);
    if (!logical) return;
    event.preventDefault();
    const next = nextFocusKey(nav, key, logical);
    if (next) focusKey(next);
  }

  function onClick(event) {
    const target = event.target.closest?.("[data-ref-key]");
    if (!target) return;
    const entry = items.get(target.getAttribute("data-ref-key"));
    if (entry) select(entry.item);
  }

  const onFocusIn = (event) => event.target.closest?.("[data-ref-key]")?.querySelector(".scene-focus-ring")?.setAttribute("visibility", "visible");
  const onFocusOut = (event) => event.target.closest?.("[data-ref-key]")?.querySelector(".scene-focus-ring")?.setAttribute("visibility", "hidden");
  svgRoot.addEventListener("keydown", onKeyDown);
  svgRoot.addEventListener("click", onClick);
  svgRoot.addEventListener("focusin", onFocusIn);
  svgRoot.addEventListener("focusout", onFocusOut);

  function focusable(item, box, { kind }) {
    const key = refKey(item);
    const active = item.refKind === "location" && item.hasActiveEvent;
    const stroke = strokeFor(item.treatment, { active });
    const group = svg("g", {
      tabindex: 0, role: "button", "data-ref-key": key, "data-ref-kind": item.refKind, "data-ref-id": item.refId,
      "data-treatment": item.treatment, "data-geometry-certainty": item.geometryCertainty, "data-active": active ? "true" : "false",
      "aria-label": accessibleName(item, { labelFor: safeLabel, strings, extraParts: [
        ...(safeAnnotate(item).inferred ? [strings.inferredLocation] : []), ...(safeAnnotate(item).nameParts ?? [])] }),
      "data-inferred": safeAnnotate(item).inferred ? "true" : null,
      class: `scene-item scene-${kind} scene-${item.treatment}`,
      "aria-current": key === selectedKey ? "true" : null
    });
    group.style.cursor = "pointer";
    group.style.outline = "none";
    const radius = item.refKind === "entity" ? box.h / 2 : 6;
    group.append(svg("rect", { class: "scene-focus-ring", x: box.x - 4, y: box.y - 4, width: box.w + 8, height: box.h + 8, rx: radius + 4,
      fill: "none", stroke: "currentColor", "stroke-width": 2, visibility: "hidden" }));
    group.append(svg("rect", { class: "scene-shape", x: box.x, y: box.y, width: box.w, height: box.h, rx: radius,
      fill: stroke.hatched ? `url(#${hatchId})` : "var(--scene-fill, Canvas)", stroke: "currentColor",
      "stroke-width": stroke.width, "stroke-dasharray": stroke.dasharray }));
    if (active) {
      const cx = direction === "rtl" ? box.x + 10 : box.x + box.w - 10;
      group.append(svg("circle", { class: "scene-active-dot", cx, cy: box.y + 10, r: 4, fill: "currentColor" }));
    }
    // text-anchor "start" follows the SVG `direction` (set on the root), so RTL text starts at the right padding.
    const anchor = "start";
    const tx = direction === "rtl" ? box.x + box.w - METRICS.nodePadding : box.x + METRICS.nodePadding;
    const ty = item.refKind === "entity" && box.h === METRICS.markerHeight ? box.y + box.h / 2 + 4
      : item.refKind === "entity" && kind === "marker" ? box.y + 16 : box.y + METRICS.nodePadding + 11;
    group.append(textLines(box.lines ?? [], { x: tx, y: ty, anchor, className: "scene-label" }));
    group.append(svg("title", {}, [document.createTextNode(group.getAttribute("aria-label"))]));
    items.set(key, { element: group, item });
    return group;
  }

  function renderLegend() {
    const list = html("ul", { class: "scene-legend-items" });
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.display = "flex";
    list.style.flexWrap = "wrap";
    list.style.gap = "0.25rem 1rem";
    for (const entry of descriptors.legend.items) {
      const text = strings.legend?.[entry.key];
      // R-22: the legend explains only marks that are on screen.
      if (!text || !entry.present) continue;
      const item = html("li", { "data-legend-key": entry.key, "data-present": entry.present ? "true" : "false" });
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "0.4rem";
      const sample = entry.key === "inferredLocation" ? swatch("provisional", { active: true, hatchId })
        : entry.key === "activeEvent" ? swatch("evidenced", { active: true, hatchId })
        : entry.key === "entity" ? swatch("provisional", { entity: true, hatchId }) : swatch(entry.key, { hatchId });
      item.append(sample, html("span", { text }));
      list.append(item);
    }
    legend.replaceChildren(...[
      strings.legendTitle ? html("strong", { class: "scene-legend-title", text: strings.legendTitle }) : null,
      html("p", { class: "scene-legend-note", text: strings.legend?.[descriptors.legend.noteKey] ?? "" }),
      descriptors.layout.schematic.present && strings.legend?.schematicNote ? html("p", { class: "scene-legend-note", text: strings.legend.schematicNote }) : null,
      list
    ].filter(Boolean));
  }

  function render() {
    const hadFocus = svgRoot.contains(document.activeElement) ? document.activeElement.getAttribute("data-ref-key") : null;
    items.clear();
    const width = Math.max(METRICS.nodeMinWidth + 2 * METRICS.margin, Math.floor(container.clientWidth || 320));
    const layout = computePixelLayout(descriptors, { width, dir: direction, labelFor: safeLabel, tagsFor });
    nav = buildNavigation(descriptors);
    svgRoot.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svgRoot.setAttribute("width", layout.width);
    svgRoot.setAttribute("height", layout.height);

    const defs = svg("defs", {}, [
      svg("pattern", { id: hatchId, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
        [svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "currentColor", "stroke-width": 1, "stroke-opacity": 0.35 })])
    ]);

    // Edges first (behind nodes). Undirected lines between box centres; to a tray chip, a dotted connector.
    const edgeLayer = svg("g", { class: "scene-edges", "aria-hidden": "true" });
    const edgeLabels = [];
    for (const edge of descriptors.edges) {
      const a = layout.boxes.get(`location:${edge.from}`);
      const b = layout.boxes.get(`location:${edge.to}`);
      if (!a || !b) continue;
      const toTray = edge.toPlacement === "tray" || edge.fromPlacement === "tray";
      const stroke = strokeFor(toTray ? "unplaced" : edge.treatment);
      const line = svg("line", { x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2, stroke: "currentColor",
        "stroke-width": stroke.width, "stroke-dasharray": stroke.dasharray, "stroke-opacity": 0.7,
        class: `scene-edge scene-${edge.treatment}`, "data-ref-id": edge.refId, "data-to-placement": edge.toPlacement });
      const via = safeLabel(edge.viaRef);
      if (via) line.append(svg("title", {}, [document.createTextNode(via)]));
      edgeLayer.append(line);
      // R-07: the passage label is visible text, not only a tooltip. N-04: it is placed only where it overlaps no
      // item box (candidate points along the edge); otherwise it is omitted from the diagram (the UI lists passages).
      if (via) {
        const lines = wrapLabel(via, 22);
        const w = Math.max(...lines.map((line) => line.length)) * METRICS.charWidth + 8;
        const hgt = lines.length * METRICS.lineHeight + 4;
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
        // Item boxes plus the tray title strip are off limits.
        const tray = layout.regions.tray;
        const boxes = [...layout.boxes.values(), ...(descriptors.tray.length ? [{ x: 0, y: tray.y - 6, w: layout.width, h: METRICS.trayTitleHeight + 6 }] : [])];
        const free = (cx, cy) => boxes.every((box) => cx + w / 2 + 3 < box.x || cx - w / 2 - 3 > box.x + box.w
          || cy + hgt / 2 + 3 < box.y || cy - hgt / 2 - 3 > box.y + box.h)
          && cx - w / 2 >= 0 && cx + w / 2 <= layout.width;
        let spot = null;
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          for (const dy of [0, -hgt, hgt]) {
            const cx = ax + (bx - ax) * t;
            const cy = ay + (by - ay) * t + dy;
            if (!spot && free(cx, cy)) spot = { cx, cy };
          }
        }
        if (spot) {
          const top = spot.cy - hgt / 2 + METRICS.lineHeight - 2;
          const label = textLines(lines, { x: spot.cx, y: top, anchor: "middle", className: "scene-edge-label" });
          label.setAttribute("data-edge-label", edge.refId);
          label.setAttribute("paint-order", "stroke");
          label.setAttribute("stroke", "var(--scene-fill, Canvas)");
          label.setAttribute("stroke-width", "4");
          label.setAttribute("stroke-linejoin", "round");
          for (const span of label.querySelectorAll("tspan")) span.setAttribute("x", spot.cx);
          edgeLabels.push(label);
        }
      }
    }

    // Entity markers follow their host in DOM order so Tab order matches the arrow-key column order.
    const markersByHost = new Map();
    for (const node of descriptors.nodes) {
      if (node.refKind !== "entity" || !node.attachedTo) continue;
      const hostKey = `location:${node.attachedTo.refId}`;
      if (!markersByHost.has(hostKey)) markersByHost.set(hostKey, []);
      markersByHost.get(hostKey).push(node);
    }
    const appendWithMarkers = (layer, item, kind) => {
      const box = layout.boxes.get(refKey(item));
      if (!box) return;
      layer.append(focusable(item, box, { kind }));
      for (const marker of markersByHost.get(refKey(item)) ?? []) {
        const markerBox = layout.boxes.get(refKey(marker));
        if (markerBox) layer.append(focusable(marker, markerBox, { kind: "marker" }));
      }
    };

    const nodeLayer = svg("g", { class: "scene-nodes" });
    const diagramNodes = descriptors.nodes.filter((node) => node.refKind === "location");
    for (const key of nav.order) {
      const node = diagramNodes.find((candidate) => refKey(candidate) === key);
      if (node) appendWithMarkers(nodeLayer, node, node.placement === "schematic" ? "schematic" : "node");
    }

    const trayLayer = svg("g", { class: "scene-tray" });
    const region = layout.regions.tray;
    if (descriptors.tray.length) {
      trayLayer.append(svg("rect", { x: METRICS.margin / 2, y: region.y - 6, width: layout.width - METRICS.margin, height: region.h,
        rx: 8, fill: "none", stroke: "currentColor", "stroke-dasharray": "1 4", "stroke-opacity": 0.6, "aria-hidden": "true" }));
      const title = strings.trayTitle ?? "";
      const x = direction === "rtl" ? layout.width - METRICS.margin : METRICS.margin;
      trayLayer.append(textLines([title], { x, y: region.y + 12, anchor: "start", className: "scene-tray-title" }));
      for (const item of descriptors.tray) appendWithMarkers(trayLayer, item, "chip");
    }

    const empty = descriptors.nodes.length === 0 && descriptors.tray.length === 0;
    const emptyText = empty && strings.empty ? textLines([strings.empty], { x: layout.width / 2, y: METRICS.margin + 14, anchor: "middle", className: "scene-empty" }) : null;
    const edgeLabelLayer = svg("g", { class: "scene-edge-labels", "aria-hidden": "true" }, edgeLabels);
    svgRoot.replaceChildren(defs, edgeLayer, nodeLayer, trayLayer, edgeLabelLayer, ...(emptyText ? [emptyText] : []));
    renderLegend();
    if (hadFocus && items.has(hadFocus)) focusKey(hadFocus);
  }

  let resizeObserver = null;
  let lastWidth = container.clientWidth;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      if (!descriptors || destroyed || container.clientWidth === lastWidth) return;
      lastWidth = container.clientWidth;
      render();
    });
    resizeObserver.observe(container);
  }

  return {
    /** Re-render only when the descriptor object changes (createSceneMemo returns the same reference otherwise). */
    update(next) {
      if (destroyed || !next || next === descriptors) return;
      descriptors = next;
      render();
    },
    /** Mark the currently inspected item (aria-current); `null` clears. Does not call onSelect. */
    setSelected(ref) {
      selectedKey = ref ? `${ref.refKind}:${ref.refId}` : null;
      for (const [key, { element }] of items) {
        if (key === selectedKey) element.setAttribute("aria-current", "true");
        else element.removeAttribute("aria-current");
      }
    },
    /** Focus the first focusable item (for a "go to diagram" control). Returns false when there is none. */
    focusFirst() {
      const first = nav?.order[0];
      if (!first) return false;
      focusKey(first);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      svgRoot.removeEventListener("keydown", onKeyDown);
      svgRoot.removeEventListener("click", onClick);
      svgRoot.removeEventListener("focusin", onFocusIn);
      svgRoot.removeEventListener("focusout", onFocusOut);
      items.clear();
      figure.remove();
    }
  };
}
