// Abstract people markers (TASK-6-60, ADR-004 Decision 3).
// A marker is a role figure: a pillar with a sphere head, ~1.7 m tall at real scale, tinted per role. No garments, faces,
// implements, gestures or crowds beyond the stated count. Everything here is a DISPLAY choice; who and how many comes
// from markersAt() (src/simulation/markers.js) and is never invented.
// Pure part (layoutMarkers, roleTint, markerNotes): Node-testable. createMarkersLayer(THREE, …) is browser-only and
// takes the THREE namespace so this module stays importable in Node.

/** Legibility floor: from far away the figures are drawn larger so they stay at least this fraction of the view height
 * tall (at most MAX_SCALE x real size). Nearer than that they are exactly 1.7 m. */
export const MIN_SCREEN_FRACTION = 0.06; // R-09: was 0.04; a figure at a placed stop must read on a projector
export const MAX_SCALE = 4;
/** Above this display scale a label says the figure is enlarged for legibility. */
export const ENLARGED_ABOVE = 1.02;
/** Radius (m) of the soft ground disc that marks a group of unspecified size (no extra figures, no number implied). */
export const GROUP_DISC_RADIUS = 0.9;

/** Display scale for a figure of real height `height` at `distance` from a camera with vertical `fov` (degrees). */
export function legibleScale(distance, fov, height = 1.7) {
  if (!(distance > 0)) return 1;
  const fraction = height / (2 * distance * Math.tan((fov * Math.PI) / 360));
  return Math.min(MAX_SCALE, Math.max(1, MIN_SCREEN_FRACTION / fraction));
}

/** A piece that is not a floor (platform/court) and stands taller than this above its base is a raised structure: figures
 * stand at its BASE level beside it, never on top (TASK-6-64a, review F1). Heights are never inferred from event text. */
export const RAISED_MIN_HEIGHT = 1.5;
export const BESIDE_GAP = 0.9;
const FLOOR_KINDS = new Set(["platform", "court"]);

/** "top" for floors/courts and low pieces, "base" for raised structures (building, stair, wall, a tall block ...). */
export function placementFor(kind, box) {
  return !FLOOR_KINDS.has(kind) && Number(box?.sy) > RAISED_MIN_HEIGHT ? "base" : "top";
}

export const FIGURE = Object.freeze({ height: 1.7, bodyHeight: 1.45, bodyRadiusTop: 0.17, bodyRadiusBottom: 0.23, headRadius: 0.16 });

/** Muted, distinct tints. Colour is never the only cue: every group also has a text label with the role name. */
const TINTS = Object.freeze({
  "role-kohen": "#6f8fb0",
  "role-memuneh": "#b08a5e",
  "role-levite": "#7f9f7a",
  "role-israelite-man": "#9a7fa8",
  "role-israelite-woman": "#a87f8f",
  "role-man": "#8f9a6a",
  "role-non-priest": "#6fa3a0",
  "role-foreigner": "#a39a8c",
  // TASK-6-77: roles of Tamid 4-7 (colour is only a secondary cue; the label names the role)
  "role-kohen-gadol": "#c9a24a",
  "role-segan": "#7a7ab0",
  "role-chazan": "#b0755e",
  "role-rosh-hamaamad": "#b0a35e",
  "role-tamei": "#8a8a8a",
  "role-people": "#c8b8a0",
  "role-cymbal-striker": "#b06a6a"
});
const FALLBACK_TINTS = Object.freeze(["#7d8fa6", "#a69078", "#85a082", "#a08aa8", "#9fa07a", "#7aa5a3"]);

/** Hex tint for a role id: a fixed table for known roles, else a stable hash into a small neutral palette. */
export function roleTint(roleId) {
  if (TINTS[roleId]) return TINTS[roleId];
  let hash = 0;
  for (const char of String(roleId ?? "")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}

/**
 * Deterministic layout for a piece box ({x,y,z,sx,sy,sz}, centred, metres): on the top surface of a floor/court (or a low
 * piece), at the piece's base level just outside its +z edge for a raised structure (see placementFor).
 * Figures fill a row-major grid, group after group (descriptor order), spacing <= 1.4 m, inset 10% from the edges. The grid
 * is shifted toward the +x/+z side of the top (as far as it fits) so that, from the default viewing side, the figures stand
 * clear of the piece-name label that sits over the middle of the top.
 * @returns {{ figures: {x:number,y:number,z:number,group:number,roleId:string|null}[],
 *   groups: {index:number, descriptor:object, count:number, anchor:{x:number,y:number,z:number}}[], spacing:number }}
 */
export function layoutMarkers(descriptors, box, { kind = null } = {}) {
  const list = Array.isArray(descriptors) ? descriptors : [];
  const counts = list.map((descriptor) => Math.max(1, Math.floor(descriptor?.displayCount ?? 1)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!box || !total) return { figures: [], groups: [], spacing: 0, placement: null };
  const usableX = Math.max(box.sx * 0.8, 0.5);
  const usableZ = Math.max(box.sz * 0.8, 0.5);
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * (usableX / usableZ))));
  const rows = Math.ceil(total / cols);
  const spacing = Math.min(1.4, usableX / cols, usableZ / rows);
  const placement = placementFor(kind, box);
  const top = placement === "base" ? box.y - box.sy / 2 : box.y + box.sy / 2;
  const shift = (offset, usable, count) => Math.max(0, Math.min(offset, usable / 2 - ((count - 1) * spacing) / 2));
  const cx = box.x + shift(box.sx * 0.2, usableX, cols);
  // Beside a raised piece: the grid starts BESIDE_GAP outside the +z edge and grows away from it.
  const cz = placement === "base" ? box.z + box.sz / 2 + BESIDE_GAP + ((rows - 1) * spacing) / 2 : box.z + shift(box.sz * 0.25, usableZ, rows);
  const figures = [];
  const groups = [];
  let slot = 0;
  list.forEach((descriptor, group) => {
    const mine = [];
    for (let i = 0; i < counts[group]; i += 1, slot += 1) {
      const row = Math.floor(slot / cols);
      const inRow = Math.min(cols, total - row * cols);
      const col = slot % cols;
      const figure = { x: cx + (col - (inRow - 1) / 2) * spacing, y: top, z: cz + (row - (rows - 1) / 2) * spacing, group, roleId: descriptor?.roleId ?? null };
      figures.push(figure);
      mine.push(figure);
    }
    const mean = (key) => mine.reduce((sum, figure) => sum + figure[key], 0) / mine.length;
    groups.push({ index: group, descriptor, count: mine.length, anchor: { x: mean("x"), y: top + FIGURE.height, z: mean("z") } });
  });
  return { figures, groups, spacing, placement };
}

const fill = (template, values) => String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

/**
 * The disclosure lines of one role group, from chrome strings (`strings.markers`): count (only when capped or
 * unspecified), the display-choice position note (always), the inferred-place note (only when the basis is inferred).
 */
export function markerNotes(descriptor, strings = {}) {
  const notes = [];
  if (descriptor?.capped) notes.push(fill(strings.countCapped, { shown: descriptor.displayCount, total: descriptor.count?.value }));
  else if (descriptor?.countStated === false) notes.push((descriptor?.entityKind === "group" ? strings.groupUnspecified : null) ?? strings.countUnspecified ?? "");
  notes.push(strings.position ?? "");
  if (descriptor?.locationBasis === "inferred") notes.push(strings.locationInferred ?? "");
  return notes.filter(Boolean);
}

/**
 * T-01 (TASK-6-79a): all the role groups of one stop share ONE label panel, so labels can never overlap one another; this
 * picks a spot for that panel. `anchor` = projected anchor {px,py}; `size` = {w,h}; `area` = {width,height,minTop,maxBottom};
 * `avoid` = rectangles to stay clear of (the piece-name label). Candidates are tried in a fixed order (above the anchor,
 * above/below the avoided rectangles, the free area's top and bottom); the first that is inside the free area and clear of
 * every avoided rectangle wins, else the one with the least overlap.
 * @returns {{ left:number, top:number, clear:boolean }}
 */
export function placePanel(anchor, size, area, avoid = []) {
  const { w, h } = size;
  const minTop = area.minTop;
  const maxTop = Math.max(area.maxBottom - h, minTop);
  const clampTop = (top) => Math.min(Math.max(top, minTop), maxTop);
  const clampLeft = (value) => Math.min(Math.max(value, 4), Math.max(area.width - w - 4, 4));
  const overlap = (x0, y0) => avoid.reduce((sum, r) => {
    const x = Math.min(x0 + w, r.left + r.w) - Math.max(x0, r.left);
    const y = Math.min(y0 + h, r.top + r.h) - Math.max(y0, r.top);
    return sum + (x > -4 && y > -4 ? Math.max(x + 4, 0) * Math.max(y + 4, 0) : 0);
  }, 0);
  const left = clampLeft(anchor.px - w / 2);
  // Candidate spots, best first: above the anchor, clear above/below an avoided rectangle, beside it, then the free area's ends.
  const spots = [[left, clampTop(anchor.py - h - 8)]];
  for (const r of avoid) {
    spots.push([left, clampTop(r.top - h - 6)], [left, clampTop(r.top + r.h + 6)]);
    for (const x of [r.left - w - 6, r.left + r.w + 6]) spots.push([clampLeft(x), clampTop(anchor.py - h - 8)], [clampLeft(x), minTop], [clampLeft(x), maxTop]);
  }
  spots.push([left, minTop], [left, maxTop]);
  let best = null;
  for (const [x, y] of spots) {
    const cost = overlap(x, y);
    if (cost === 0) return { left: x, top: y, clear: true };
    if (!best || cost < best.cost) best = { left: x, top: y, cost };
  }
  return { left: best.left, top: best.top, clear: false };
}

/** Disclosure notes that every group of a multi-group stop has (shown once), and each group's remaining ones. */
export function splitNotes(noteLists) {
  if (noteLists.length < 2) return { shared: [], own: noteLists.map((list) => [...list]) };
  const shared = noteLists[0].filter((text) => noteLists.every((list) => list.includes(text)));
  return { shared, own: noteLists.map((list) => list.filter((text) => !shared.includes(text))) };
}

const LABEL_STYLE = "position:absolute;left:0;top:0;display:none;pointer-events:none;box-sizing:border-box;max-width:min(26em,92%);padding:.3rem .5rem;" +
  "border-radius:.35rem;background:rgba(255,255,255,.94);color:#1d1c1a;border:1px solid rgba(60,60,60,.55);line-height:1.3;z-index:1;overflow-wrap:anywhere";

/**
 * Browser layer. `parent` = the three.js scene, `viewport` = the element the labels live in.
 * Cost: two instanced meshes (bodies, heads) = 2 draw calls.
 */
export function createMarkersLayer(THREE, { parent, viewport, strings = {}, labelFor = () => "", insets = () => ({ top: 0, bottom: 0 }), avoid = () => [] }) {
  const group = new THREE.Group();
  group.name = "markers";
  group.visible = false;
  parent.add(group);
  const box = document.createElement("div");
  box.className = "scene3d-markers";
  box.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  viewport.append(box);
  const bodyGeometry = new THREE.CylinderGeometry(FIGURE.bodyRadiusTop, FIGURE.bodyRadiusBottom, FIGURE.bodyHeight, 14);
  bodyGeometry.translate(0, FIGURE.bodyHeight / 2, 0);
  const headGeometry = new THREE.SphereGeometry(FIGURE.headRadius, 16, 12);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  let meshes = [];
  let discs = [];
  let labels = [];
  const discGeometry = new THREE.CircleGeometry(1, 40);
  discGeometry.rotateX(-Math.PI / 2);
  const ringGeometry = new THREE.RingGeometry(0.92, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  let layout = null;
  let scale = 1;
  const matrix = new THREE.Matrix4();
  const scaleMatrix = new THREE.Matrix4();
  const lift = new THREE.Matrix4();

  /** (Re)write the instance matrices at the given display scale (figures grow from their feet). */
  function writeMatrices(factor) {
    if (!layout || meshes.length !== 2) return;
    const [bodies, heads] = meshes;
    layout.figures.forEach((figure, i) => {
      scaleMatrix.makeScale(factor, factor, factor);
      matrix.makeTranslation(figure.x, figure.y, figure.z).multiply(scaleMatrix);
      bodies.setMatrixAt(i, matrix);
      lift.makeTranslation(0, FIGURE.bodyHeight + FIGURE.headRadius * 0.55, 0);
      matrix.makeTranslation(figure.x, figure.y, figure.z).multiply(scaleMatrix).multiply(lift);
      heads.setMatrixAt(i, matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    for (const disc of discs) disc.scale.setScalar(disc.userData.radius * factor);
    scale = factor;
    for (const label of labels) label.enlarged.style.display = factor > ENLARGED_ABOVE ? "block" : "none";
  }

  function clear() {
    for (const mesh of meshes) { group.remove(mesh); mesh.dispose(); }
    meshes = [];
    for (const disc of discs) { group.remove(disc); disc.material.dispose(); for (const child of disc.children) child.material.dispose(); }
    discs = [];
    for (const label of labels) label.el.remove();
    labels = [];
    layout = null;
    group.visible = false;
  }

  /** Show `descriptors` on the top of `pieceBox` (null clears). Returns the number of figures drawn. */
  function set(descriptors, pieceBox, pieceKind = null) {
    clear();
    const next = layoutMarkers(descriptors, pieceBox, { kind: pieceKind });
    if (!next.figures.length) return 0;
    layout = next;
    const bodies = new THREE.InstancedMesh(bodyGeometry, material, next.figures.length);
    const heads = new THREE.InstancedMesh(headGeometry, material, next.figures.length);
    const color = new THREE.Color();
    next.figures.forEach((figure, i) => {
      color.set(roleTint(figure.roleId));
      bodies.setColorAt(i, color);
      heads.setColorAt(i, color);
    });
    for (const mesh of [bodies, heads]) { mesh.raycast = () => {}; mesh.frustumCulled = false; group.add(mesh); }
    bodies.name = "marker-bodies";
    heads.name = "marker-heads";
    meshes = [bodies, heads];
    next.groups.forEach((entry) => {
      const d = entry.descriptor;
      if (d.entityKind !== "group" || d.countStated !== false) return;
      const f = next.figures.find((figure) => figure.group === entry.index);
      const tint = roleTint(d.roleId);
      const disc = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.28, depthWrite: false }));
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.7, depthWrite: false }));
      ring.raycast = () => {}; disc.raycast = () => {};
      disc.add(ring);
      disc.position.set(f.x, f.y + 0.12, f.z); // lifted clear of the coplanar floor so it never z-fights
      disc.renderOrder = ring.renderOrder = 10;
      disc.userData.radius = GROUP_DISC_RADIUS;
      disc.name = "marker-group-disc";
      disc.frustumCulled = false;
      group.add(disc);
      discs.push(disc);
    });
    // One panel per stop (T-01): a row per role group, the notes every group shares written once at the foot.
    const el = document.createElement("div");
    el.className = `scene3d-marker-label${next.groups.length > 1 ? " scene3d-marker-combined" : ""}`;
    el.dataset.roleId = next.groups.length === 1 ? (next.groups[0].descriptor.roleId ?? "") : "";
    el.dataset.groups = String(next.groups.length);
    el.style.cssText = LABEL_STYLE;
    const noteLists = next.groups.map((entry) => markerNotes(entry.descriptor, strings));
    const { shared, own } = splitNotes(noteLists);
    const addNote = (parent, text) => {
      const note = document.createElement("div");
      note.className = "scene3d-marker-note";
      note.textContent = text;
      note.style.cssText = "font-size:.88em;color:#4a4742";
      parent.append(note);
    };
    next.groups.forEach((entry, i) => {
      const d = entry.descriptor;
      const row = document.createElement("div");
      row.className = "scene3d-marker-group";
      row.dataset.roleId = d.roleId ?? "";
      row.style.cssText = i ? "margin-top:.3rem;padding-top:.3rem;border-top:1px solid rgba(60,60,60,.25)" : "";
      const head = document.createElement("div");
      head.style.cssText = "display:flex;flex-wrap:wrap;align-items:baseline;gap:.1rem .35rem";
      const dot = document.createElement("span");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = `flex:none;width:.7rem;height:.7rem;border-radius:50%;background:${roleTint(d.roleId)};border:1px solid rgba(0,0,0,.35);align-self:center`;
      const role = document.createElement("span");
      role.className = "scene3d-marker-role";
      role.style.cssText = "font-weight:600";
      role.textContent = String(labelFor({ kind: "role", id: d.roleId }) ?? "");
      head.append(dot, role);
      if (d.conditional && strings.conditional) {
        const cond = document.createElement("span");
        cond.className = "scene3d-marker-conditional";
        cond.style.cssText = "font-weight:700;color:#7a4a00";
        cond.textContent = strings.conditional;
        head.append(cond);
      }
      if (d.action?.he) {
        const action = document.createElement("span");
        action.className = "scene3d-marker-action";
        action.textContent = d.action.he;
        action.style.cssText = "overflow-wrap:anywhere"; // never clamped: a trailing hedge must stay visible (TASK-6-64a, F2)
        head.append(action);
      }
      row.append(head);
      for (const text of own[i]) addNote(row, text);
      el.append(row);
    });
    if (shared.length) {
      const foot = document.createElement("div");
      foot.className = "scene3d-marker-shared";
      foot.style.cssText = "margin-top:.3rem;padding-top:.3rem;border-top:1px solid rgba(60,60,60,.25)";
      for (const text of shared) addNote(foot, text);
      el.append(foot);
    }
    const enlarged = document.createElement("div");
    enlarged.className = "scene3d-marker-note scene3d-marker-enlarged";
    enlarged.textContent = strings.enlarged ?? "";
    enlarged.style.cssText = "font-size:.88em;color:#4a4742;display:none";
    el.append(enlarged);
    box.append(el);
    const mean = (key) => next.groups.reduce((sum, entry) => sum + entry.anchor[key], 0) / next.groups.length;
    labels = [{ el, anchor: { x: mean("x"), y: Math.max(...next.groups.map((entry) => entry.anchor.y)), z: mean("z") }, enlarged }];
    writeMatrices(1);
    return next.figures.length;
  }

  const projected = new THREE.Vector3();
  const centre = new THREE.Vector3();
  /** Before rendering: keep the figures legible from far away (see MIN_SCREEN_FRACTION). */
  function fit(camera) {
    if (!layout || !group.visible) return;
    const first = layout.groups[0].anchor;
    centre.set(first.x, first.y, first.z);
    const next = legibleScale(camera.position.distanceTo(centre), camera.fov);
    if (Math.abs(next - scale) > 0.03) writeMatrices(next);
  }
  /** Place the labels (called every frame while the layer is visible). */
  function place(camera) {
    if (!layout) return;
    if (!group.visible) { for (const label of labels) label.el.style.display = "none"; return; }
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const { top: insetTop = 0, bottom: insetBottom = 0 } = insets() ?? {};
    const minTop = Math.min(insetTop + 6, height / 2);
    const maxBottom = Math.max(height - insetBottom - 6, minTop + 20);
    // R-09: label type scales with the viewport (14 px on a phone up to 20 px on a projector) so it stays readable.
    const fontPx = Math.round(Math.min(20, Math.max(14, width / 90)) * 10) / 10;
    box.style.fontSize = `${fontPx}px`;
    const fixed = (avoid() ?? []).map((r) => ({ ...r }));
    for (const label of labels) {
      projected.set(label.anchor.x, label.anchor.y + (scale - 1) * FIGURE.height, label.anchor.z).project(camera);
      if (projected.z > 1 || projected.z < -1) { label.el.style.display = "none"; continue; }
      label.el.style.display = "block";
      // Fit the free area between the HUD bars: shrink the type a little before anything could be cut (never below 14 px).
      const free = Math.max(maxBottom - minTop, 20);
      let px = fontPx;
      label.el.style.fontSize = "";
      while (label.el.offsetHeight > free && px > 14) { px -= 1; label.el.style.fontSize = `${px}px`; }
      label.el.style.maxHeight = `${Math.floor(free)}px`;
      label.el.style.overflowY = "auto";
      const w = label.el.offsetWidth;
      const h = label.el.offsetHeight;
      const at = placePanel({ px: ((projected.x + 1) / 2) * width, py: ((1 - projected.y) / 2) * height }, { w, h }, { width, height, minTop, maxBottom }, fixed);
      label.el.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
      label.el.dataset.clear = String(at.clear);
      if (!at.clear) {
        // No spot clear of the piece-name label: the panel keeps its place and the name label moves next to it (above, else below).
        for (const r of fixed) {
          if (typeof r.move !== "function" || !(r.left < at.left + w + 4 && r.left + r.w + 4 > at.left && r.top < at.top + h + 4 && r.top + r.h + 4 > at.top)) continue;
          const nameLeft = Math.min(Math.max(r.left, 4), Math.max(width - r.w - 4, 4));
          const slot = [at.top - r.h - 4, at.top + h + 4].find((top) => top >= minTop - 2 && top + r.h <= maxBottom + 2);
          if (slot !== undefined) { r.move(nameLeft, slot); label.el.dataset.clear = "true"; }
        }
      }
    }
  }

  return {
    set, clear, place, fit,
    setVisible(on) { group.visible = Boolean(on) && meshes.length > 0; if (!group.visible) for (const label of labels) label.el.style.display = "none"; },
    scale: () => scale,
    count: () => (group.visible && layout ? layout.figures.length : 0),
    layout: () => layout,
    dispose() { clear(); discGeometry.dispose(); ringGeometry.dispose(); bodyGeometry.dispose(); headGeometry.dispose(); material.dispose(); box.remove(); parent.remove(group); }
  };
}
