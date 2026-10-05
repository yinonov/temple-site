// DOM-free helpers for the SVG topology renderer (TASK-6-01/6-03, ADR-001): pixel layout, keyboard navigation
// along edges, accessible-name composition and label wrapping. Pure ESM; Node-testable.
// No display text lives here: every word comes from `labelFor` (data) or `strings` (UI chrome).

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

export const METRICS = Object.freeze({
  margin: 12,
  nodeWidth: 168,
  nodeMinWidth: 120,
  columnGap: 56,
  rowGap: 20,
  lineHeight: 16,
  nodePadding: 10,
  markerHeight: 24,
  markerGap: 4,
  trayGap: 28,
  trayTitleHeight: 22,
  chipWidth: 200,
  chipGap: 10,
  maxLabelLines: 3,
  charWidth: 7.2,
  schematicMaxHeight: 160
});

/** Key used for DOM lookups and navigation: `${refKind}:${refId}`. */
export const refKey = (item) => `${item.refKind}:${item.refId}`;

const LRI = "\u2066";
const PDI = "\u2069";
/** Close bidi isolates (LRI…PDI) that a line break split, and reopen them on the next line (R-15). */
export function balanceIsolates(lines) {
  let open = 0;
  return lines.map((line) => {
    let text = open > 0 ? LRI.repeat(open) + line : line;
    for (const ch of line) {
      if (ch === LRI) open += 1;
      else if (ch === PDI && open > 0) open -= 1;
    }
    if (open > 0) text += PDI.repeat(open);
    return text;
  });
}

/**
 * Greedy word wrap by estimated character width. With the default `maxLines` (Infinity) nothing is cut, so a
 * parenthetical citation in a label is never truncated mid-word (R-15); a finite `maxLines` ellipsises.
 */
export function wrapLabel(text, maxChars, maxLines = Infinity) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const limit = Math.max(4, Math.floor(maxChars));
  const lines = [];
  let current = "";
  for (const word of words) {
    const piece = word.length > limit ? `${word.slice(0, limit - 1)}…` : word;
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= limit) current = candidate;
    else { if (current) lines.push(current); current = piece; }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return balanceIsolates(lines);
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = last.length >= limit ? `${last.slice(0, limit - 1)}…` : `${last}…`;
  return balanceIsolates(kept);
}

function attachedMarkers(descriptors) {
  const map = new Map();
  for (const node of descriptors.nodes) {
    if (node.refKind !== "entity" || !node.attachedTo) continue;
    const key = `location:${node.attachedTo.refId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(node);
  }
  for (const list of map.values()) list.sort((a, b) => compareText(a.refId, b.refId));
  return map;
}

/**
 * Pixel layout in a viewBox whose width is the available width (1 unit = 1 CSS px).
 * Diagram nodes: columns by layer along the reading direction (RTL: layer 0 at the right), rows by order.
 * Schematic nodes: a separate region below, scaled from their (speculative) boxes.
 * Tray: a band at the bottom; chips wrap in rows. Tray chip positions are UI layout only.
 * @param {object} descriptors sceneDescriptors output
 * @param {{ width: number, dir?: "rtl"|"ltr", labelFor?: (ref:object)=>string }} options
 * @returns {{ width, height, boxes: Map<string,{x,y,w,h,lines?}>, regions: { graph, schematic, tray } }}
 */
export function computePixelLayout(descriptors, { width, dir = "rtl", labelFor = () => "", tagsFor = () => [] } = {}) {
  const m = METRICS;
  const layout = descriptors.layout;
  const columns = Math.max(1, layout.layerCount);
  const inner = Math.max(m.nodeMinWidth, width - 2 * m.margin);
  const nodeWidth = Math.max(m.nodeMinWidth, Math.min(m.nodeWidth, (inner - (columns - 1) * m.columnGap) / columns));
  const graphWidth = columns * nodeWidth + (columns - 1) * m.columnGap;
  const totalWidth = Math.max(width, graphWidth + 2 * m.margin);
  const boxes = new Map();
  const markers = attachedMarkers(descriptors);
  const charsPerLine = (w) => (w - 2 * m.nodePadding) / m.charWidth;

  const blockFor = (item, x, y, w) => {
    const tags = (tagsFor(item) ?? []).filter(Boolean);
    const lines = [...wrapLabel(labelFor(item.labelRef), charsPerLine(w)), ...tags];
    const h = Math.max(1, lines.length) * m.lineHeight + 2 * m.nodePadding;
    boxes.set(refKey(item), { x, y, w, h, lines, tagCount: tags.length });
    let bottom = y + h;
    for (const marker of markers.get(refKey(item)) ?? []) {
      const markerLines = wrapLabel(labelFor(marker.labelRef), charsPerLine(w - 16));
      const markerHeight = markerLines.length > 1 ? markerLines.length * m.lineHeight + 8 : m.markerHeight;
      boxes.set(refKey(marker), { x: x + 8, y: bottom + m.markerGap, w: w - 16, h: markerHeight, lines: markerLines });
      bottom += m.markerGap + markerHeight;
    }
    return bottom;
  };

  // Diagram region.
  const diagram = descriptors.nodes.filter((node) => node.refKind === "location" && node.placement === "diagrammatic");
  const byLayer = new Map();
  for (const node of diagram) {
    if (!byLayer.has(node.position.layer)) byLayer.set(node.position.layer, []);
    byLayer.get(node.position.layer).push(node);
  }
  const offset = (totalWidth - graphWidth) / 2;
  let graphBottom = m.margin;
  for (const [layer, members] of [...byLayer].sort((a, b) => a[0] - b[0])) {
    const column = dir === "rtl" ? columns - 1 - layer : layer;
    const x = offset + column * (nodeWidth + m.columnGap);
    let y = m.margin;
    for (const node of members.sort((a, b) => a.position.order - b.position.order)) {
      y = blockFor(node, x, y, nodeWidth) + m.rowGap;
    }
    graphBottom = Math.max(graphBottom, y - m.rowGap);
  }
  const graphRegion = { x: 0, y: 0, w: totalWidth, h: diagram.length ? graphBottom + m.margin : 0 };

  // Schematic region (speculative boxes scaled into the available width; aspect preserved).
  const schematic = descriptors.nodes.filter((node) => node.refKind === "location" && node.placement === "schematic");
  let schematicRegion = { x: 0, y: graphRegion.h, w: totalWidth, h: 0 };
  if (schematic.length) {
    const minX = Math.min(...schematic.map((n) => n.position.x));
    const minY = Math.min(...schematic.map((n) => n.position.y));
    const maxX = Math.max(...schematic.map((n) => n.position.x + n.position.w));
    const maxY = Math.max(...schematic.map((n) => n.position.y + n.position.h));
    // Fit to width, but cap the region height so a speculative box never dominates the diagram.
    const scale = Math.min((totalWidth - 2 * m.margin) / Math.max(1e-9, maxX - minX), m.schematicMaxHeight / Math.max(1e-9, maxY - minY));
    const top = graphRegion.h + m.trayGap;
    for (const node of schematic) {
      const rawX = (node.position.x - minX) * scale;
      const w = Math.max(24, node.position.w * scale);
      const x = dir === "rtl" ? totalWidth - m.margin - rawX - w : m.margin + rawX;
      const y = top + (node.position.y - minY) * scale;
      const h = Math.max(m.lineHeight + 2 * m.nodePadding, node.position.h * scale);
      boxes.set(refKey(node), { x, y, w, h, lines: wrapLabel(labelFor(node.labelRef), charsPerLine(w), 2) });
    }
    schematicRegion = { x: 0, y: top, w: totalWidth, h: (maxY - minY) * scale + m.margin };
  }

  // Tray band.
  const trayTop = schematicRegion.y + schematicRegion.h + (graphRegion.h || schematicRegion.h ? m.trayGap : m.margin);
  const chipWidth = Math.min(m.chipWidth, totalWidth - 2 * m.margin);
  const perRow = Math.max(1, Math.floor((totalWidth - 2 * m.margin + m.chipGap) / (chipWidth + m.chipGap)));
  let rowTop = trayTop + m.trayTitleHeight;
  let rowBottom = rowTop;
  descriptors.tray.forEach((item, index) => {
    const column = index % perRow;
    if (column === 0 && index > 0) rowTop = rowBottom + m.chipGap;
    const x = dir === "rtl" ? totalWidth - m.margin - (column + 1) * chipWidth - column * m.chipGap : m.margin + column * (chipWidth + m.chipGap);
    rowBottom = Math.max(rowBottom, blockFor(item, x, rowTop, chipWidth));
  });
  const trayRegion = { x: 0, y: trayTop, w: totalWidth, h: Math.max(m.trayTitleHeight, rowBottom - trayTop) + m.margin };
  return { width: totalWidth, height: trayRegion.y + trayRegion.h, boxes, regions: { graph: graphRegion, schematic: schematicRegion, tray: trayRegion } };
}

/**
 * Navigation model. Focusable items: location nodes, entity markers, tray chips.
 * - forward/back: along edges (outgoing/incoming neighbours, edges are undirected visually but layered by record
 *   direction); entity markers use their host's edges; in the tray, forward/back step through chips.
 * - down/up: next/previous item in the same column (node then its markers), then into/out of the tray.
 * - home/end: first/last focusable item.
 */
export function buildNavigation(descriptors) {
  const markers = attachedMarkers(descriptors);
  const diagram = descriptors.nodes.filter((node) => node.refKind === "location" && node.placement !== "attached");
  const columnOrder = (node) => node.placement === "schematic" ? [Number.MAX_SAFE_INTEGER, node.refId] : [node.position.layer, node.position.order];
  const sortedDiagram = [...diagram].sort((a, b) => {
    const [la, oa] = columnOrder(a);
    const [lb, ob] = columnOrder(b);
    return la - lb || (typeof oa === "number" ? oa - ob : compareText(oa, ob));
  });
  const columns = new Map();
  for (const node of sortedDiagram) {
    const column = columnOrder(node)[0];
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(refKey(node), ...(markers.get(refKey(node)) ?? []).map(refKey));
  }
  const trayKeys = [];
  for (const item of descriptors.tray) trayKeys.push(refKey(item), ...(markers.get(refKey(item)) ?? []).map(refKey));
  const order = [...[...columns.values()].flat(), ...trayKeys];

  const host = new Map();
  for (const [hostKey, list] of markers) for (const marker of list) host.set(refKey(marker), hostKey);
  const neighbours = new Map(order.map((key) => [key, { out: [], in: [] }]));
  for (const edge of descriptors.edges) {
    const from = `location:${edge.from}`;
    const to = `location:${edge.to}`;
    if (neighbours.has(from) && neighbours.has(to)) {
      neighbours.get(from).out.push(to);
      neighbours.get(to).in.push(from);
    }
  }
  for (const value of neighbours.values()) { value.out.sort(compareText); value.in.sort(compareText); }
  const columnOf = new Map();
  for (const list of columns.values()) for (const key of list) columnOf.set(key, list);
  for (const key of trayKeys) columnOf.set(key, trayKeys);
  return { order, neighbours, host, columnOf, trayKeys };
}

/** Map a keyboard key to a logical direction. In RTL, ArrowLeft is "forward" (reading direction). */
export function directionForKey(key, dir = "rtl") {
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return "forward";
  if (key === back) return "back";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowUp") return "up";
  if (key === "Home") return "home";
  if (key === "End") return "end";
  return null;
}

/** Next focus key, or null when the key does not move focus. Never wraps silently past the ends. */
export function nextFocusKey(nav, currentKey, direction) {
  const { order } = nav;
  if (!order.length) return null;
  if (direction === "home") return order[0];
  if (direction === "end") return order[order.length - 1];
  if (!nav.neighbours.has(currentKey)) return order[0];
  const inTray = nav.trayKeys.includes(currentKey);
  if (direction === "forward" || direction === "back") {
    if (inTray) {
      const index = nav.trayKeys.indexOf(currentKey) + (direction === "forward" ? 1 : -1);
      return nav.trayKeys[index] ?? null;
    }
    const base = nav.host.get(currentKey) ?? currentKey;
    const list = nav.neighbours.get(base)?.[direction === "forward" ? "out" : "in"] ?? [];
    return list[0] ?? null;
  }
  const column = nav.columnOf.get(currentKey) ?? [];
  const index = column.indexOf(currentKey);
  if (direction === "down") {
    if (index + 1 < column.length) return column[index + 1];
    return inTray ? null : nav.trayKeys[0] ?? null;
  }
  if (direction === "up") {
    if (index > 0) return column[index - 1];
    if (inTray) return order.find((key) => !nav.trayKeys.includes(key)) ?? null;
    return null;
  }
  return null;
}

/** Fill `{name}` placeholders. */
export function fill(template, values = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match));
}

/**
 * Accessible name for a focusable item: data label + certainty + treatment + activity + access, joined by
 * `strings.separator`. Missing strings are skipped, never replaced by literals.
 */
export function accessibleName(item, { labelFor, strings = {}, extraParts = [] }) {
  const parts = [labelFor(item.labelRef), ...extraParts];
  if (item.refKind === "entity") parts.push(strings.entityMarker);
  const certainty = strings.certainty?.[item.effectiveCertainty];
  if (certainty) parts.push(fill(strings.certaintyPrefix ?? "{level}", { level: certainty }));
  parts.push(strings.treatment?.[item.treatment]);
  if (item.treatment === "unplaced" && item.recordTreatment === "provisional") parts.push(strings.treatment?.provisional);
  if (item.publication === "preview_only") parts.push(strings.publication?.preview_only);
  if (item.hasActiveEvent) parts.push(fill(strings.activeEvents, { count: item.activeEventIds.length }));
  const access = item.accessSummary;
  if (access?.evaluated) {
    for (const result of ["allow", "deny", "unknown"]) {
      if (access[result] > 0) parts.push(fill(strings.access?.[result], { count: access[result] }));
    }
  }
  return parts.filter((part) => typeof part === "string" && part.length > 0).join(strings.separator ?? " · ");
}

/** Stroke style per treatment. Values only; colours come from currentColor/CSS custom properties in the renderer. */
export function strokeFor(treatment, { active = false } = {}) {
  const width = active ? 3 : 1.5;
  switch (treatment) {
    case "evidenced": return { dasharray: null, width, hatched: false };
    case "speculative": return { dasharray: "2 3", width, hatched: true };
    case "unplaced": return { dasharray: "1 4", width, hatched: false };
    default: return { dasharray: "6 4", width, hatched: false };
  }
}
