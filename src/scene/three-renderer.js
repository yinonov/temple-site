// Browser-only 3D renderer for solved geometry (TASK-6-18, revised TASK-6-24; ADR-003; docs/scene/3d-architecture.md §4).
// mountThreeScene(container, { onSelect, labelFor, strings, reducedMotion, onModeChange, focusRefIds, framing })
//   (options also: columnBudget — most columns drawn per portico; default by viewport, see geometry/portico-lod.js)
//   → { update(solved), setSelected(ref|null), setMode("overview"|"walk"), getMode(), setFraming("focus"|"all"), setViewAngle("oblique"|"plan"),
//       getFraming(), flyTo(ids, { animate }), setLabelNote(text|null), focusFirst(), info(), destroy(),
//       setStyleMode("certainty"|"presentation"), getStyleMode(), setMarkers(descriptors, { pieceId|pieceIds }), clearMarkers() }
//   (options also: styleMode — "certainty" (default, the M1–M3 look) | "presentation" (ADR-004: stone tones, sky, edge-pattern
//   certainty cue); fill — true makes the viewport fill its container instead of using --scene3d-height)
//
// Rules: no display text here (labels come from labelFor(labelRef) = data; chrome from strings — a missing key is
// skipped, never replaced by a literal); one box per solved piece; fill per face encodes the SIZE basis (top/bottom =
// plan, sides = weaker of plan and height) and the outline encodes the PLACEMENT basis (geometry/styles.js);
// neutral sky and light with a fixed, non-solar direction (no time of day); render on demand (no idle loop).
// An accessible HTML list of pieces next to the canvas makes every piece selectable without WebGL pointer use, and
// an HTML label overlay names the focused/selected piece inside the canvas. Throws WebGLUnavailableError when WebGL2
// cannot be used; the UI should probe first with webgl-check.js (no Three.js download). Imports the bare specifier
// "three" and "three/addons/…" (import map in index.html).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FILL_POLYGON_OFFSET, GROUND_POLYGON_OFFSET, LEGEND_3D, LEGEND_PRESENTATION, PALETTE, PRESENTATION_ENVIRONMENT, PRESENTATION_STYLES, SIZE_STYLES, groundLevel, legendPresence, normalizeStyleMode, pieceStyle, presentationLegendPresence, presentationStyle } from "./geometry/styles.js";
import { createGroundMaterial, createSky, presentationFill } from "./presentation-materials.js";
import { FLOOR_KINDS, boxBounds, outsideDistance, sceneBounds } from "./geometry/solve.js";
import { columnBudgetForWindow } from "./column-budget.js";
import { thinColumns } from "./geometry/portico-lod.js";
import { webglAvailable } from "./webgl-check.js";
import { createMarkersLayer } from "./markers-layer.js";

export { LEGEND_3D, SIZE_STYLES, legendPresence, webglAvailable };

/** Eye height in walk mode (metres): a viewing parameter, not a historical claim. */
export const EYE_HEIGHT_METRES = 1.6;
/** T-09: a close-up shot is never nearer than this share of the distance that fits the piece's parent (its court) in view. */
export const MIN_CONTEXT_SHARE = 0.8;

/** Thrown when WebGL2 is unavailable or the renderer cannot be created; `code` is "WEBGL_UNAVAILABLE". */
export class WebGLUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "WebGLUnavailableError";
    this.code = "WEBGL_UNAVAILABLE";
    if (cause !== undefined) this.cause = cause;
  }
}

/** Kept for compatibility; prefer importing `webglAvailable` from webgl-check.js before loading this module. */
export function isWebGLAvailable() {
  return webglAvailable();
}

const VISUALLY_HIDDEN = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";

function html(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "text") element.textContent = String(value);
    else if (name === "style") element.style.cssText = value;
    else element.setAttribute(name, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
/** Legend/list swatch: { fill: "solid"|"translucent"|"none", pattern: "none"|"dots"|"hatch", edge: "solid"|"dashed"|"none" }. */
function swatchSvg({ fill = "solid", pattern = "none", edge = "solid", opacity = null, tone = null } = {}) {
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== "") node.setAttribute(k, String(v));
    return node;
  };
  const svg = el("svg", { width: 28, height: 16, viewBox: "0 0 28 16", "aria-hidden": "true", focusable: "false", class: "scene3d-swatch" });
  if (fill !== "none") svg.append(el("rect", { x: 1, y: 1, width: 26, height: 14, fill: hex(tone ?? PALETTE.fill), "fill-opacity": opacity ?? (fill === "translucent" ? 0.45 : 1) }));
  if (pattern === "hatch") {
    for (let i = -16; i < 28; i += 5) svg.append(el("line", { x1: i, y1: 16, x2: i + 16, y2: 0, stroke: hex(PALETTE.edge), "stroke-width": 1.2, opacity: 0.75 }));
  } else if (pattern === "dots") {
    for (let x = 4; x < 27; x += 5) for (let y = 4; y < 15; y += 5) svg.append(el("circle", { cx: x, cy: y, r: 0.9, fill: hex(PALETTE.edge) }));
  }
  if (edge !== "none") svg.append(el("rect", { x: 1, y: 1, width: 26, height: 14, fill: "none", stroke: hex(PALETTE.edge), "stroke-width": 1.5, "stroke-dasharray": edge === "dashed" ? "4 3" : edge === "dotted" ? "1 3" : "", "stroke-linecap": edge === "dotted" ? "round" : "" }));
  return svg;
}

/**
 * Fill material for one size style. The dot/hatch pattern is computed in screen space (gl_FragCoord), so it keeps
 * the same pixel size at every camera distance (review 3D-12: no moiré, legible at overview distance).
 */
/** Dimming per access status: forbidden strongly, no_source slightly (never brighter than a sourced allowed piece). */
const ACCESS_DIM = { forbidden: { mix: 0.55, opacity: 0.35 }, no_source: { mix: 0.2, opacity: 0.8 } };
// M2-03: "allowed" is a visible green tint (the legend swatch in styles.css uses the same hue), never the unmarked default.
const ACCESS_ALLOWED_TINT = { color: 0x58c48a, mix: 0.4 };

function fillMaterial(styleKey, { selected = false, pixelRatio = 1, strength = { value: 1 }, access = null } = {}) {
  const style = SIZE_STYLES[styleKey] ?? SIZE_STYLES.speculative;
  const translucent = style.fill === "translucent";
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.fill, roughness: 1, metalness: 0,
    transparent: translucent, opacity: style.opacity, depthWrite: !translucent, side: translucent ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: FILL_POLYGON_OFFSET.factor, polygonOffsetUnits: FILL_POLYGON_OFFSET.units
  });
  // Access persona (TASK-6-35): dim by darkening the colour and lowering opacity; the certainty pattern stays.
  const dim = access ? ACCESS_DIM[access] : null;
  if (access === "allowed") material.color.lerp(new THREE.Color(ACCESS_ALLOWED_TINT.color), ACCESS_ALLOWED_TINT.mix);
  if (dim) {
    material.color.lerp(new THREE.Color(PALETTE.ground), dim.mix);
    material.transparent = true;
    material.opacity = style.opacity * dim.opacity;
    material.depthWrite = false;
  }
  if (selected) {
    material.emissive = new THREE.Color(PALETTE.selected);
    material.emissiveIntensity = 0.35;
  }
  if (style.pattern !== "none") {
    const period = (style.patternPx * pixelRatio).toFixed(2);
    const code = style.pattern === "hatch"
      ? `float scenePattern = scenePatternStrength * step(0.55, fract((gl_FragCoord.x + gl_FragCoord.y) / ${period}));
         diffuseColor.rgb *= mix(1.0, 0.42, scenePattern);
         diffuseColor.a = mix(diffuseColor.a, 0.85, scenePattern);`
      : `vec2 sceneCell = mod(gl_FragCoord.xy, ${period}) - 0.5 * ${period};
         float scenePattern = scenePatternStrength * (1.0 - step(${(1.25 * pixelRatio).toFixed(2)}, length(sceneCell)));
         diffuseColor.rgb *= mix(1.0, 0.45, scenePattern);`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.scenePatternStrength = strength;
      shader.fragmentShader = `uniform float scenePatternStrength;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>\n${code}`);
    };
    material.customProgramCacheKey = () => `scene3d-${style.pattern}-${period}`;
  }
  return material;
}

/**
 * @param {HTMLElement} container element the scene owns (its children are replaced)
 * @param {{ onSelect?: (sel: { refKind: "geometry", refId: string, locationId: string|null }) => void,
 *           labelFor?: (labelRef: { kind: string, id: string }) => string, strings?: object,
 *           reducedMotion?: boolean, onModeChange?: (mode: "overview"|"walk") => void,
 *           focusRefIds?: string[], framing?: "focus"|"all" }} options
 *   focusRefIds: pieces the initial ("focus") framing fits; default = pieces at depth ≥ 2 of the parentId tree
 *   (the inner complex inside the root and its first ring), else depth ≥ 1, else all. framing "all" fits everything.
 */
export function mountThreeScene(container, { onSelect = () => {}, labelFor = () => "", strings = {}, reducedMotion, onModeChange = () => {},
  focusRefIds = null, framing: initialFraming = "focus", columnBudget = null, styleMode: initialStyleMode = "certainty", fill = false, markerInsets = () => ({ top: 0, bottom: 0 }) } = {}) {
  if (!webglAvailable()) throw new WebGLUnavailableError("WebGL2 is not available");
  const canvas = document.createElement("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  } catch (error) {
    throw new WebGLUnavailableError("WebGL renderer could not be created", error);
  }
  const reduce = reducedMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const budget = Number.isFinite(columnBudget) && columnBudget >= 2 ? columnBudget : columnBudgetForWindow();
  const safeLabel = (ref) => {
    try { return String(labelFor(ref) ?? ""); } catch { return ""; }
  };
  const sep = strings.separator ?? " · ";
  const styleText = (style) => strings.certaintyStyle?.[style] ?? strings.legend?.[style] ?? "";
  /** Basis parts for names and the overlay: plan, height, placement (strings.basis.*); fallback: overall style text. */
  const basisParts = (piece) => {
    const b = strings.basis;
    if (!b) return [styleText(piece.certaintyStyle)];
    const style = pieceStyle(piece);
    return [b.plan?.[style.top], b.height?.[piece.heightStyle] , b.placement?.[style.placement]].filter(Boolean);
  };

  // ---------- DOM ----------
  canvas.className = "scene3d-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  if (strings.canvasLabel) canvas.setAttribute("aria-label", strings.canvasLabel);
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline-offset:-3px";
  const empty = html("p", { class: "scene3d-empty", text: strings.empty ?? "", style: "position:absolute;inset:0;margin:0;display:none;align-items:center;justify-content:center;text-align:center;padding:1rem" });
  const overlay = html("div", { class: "scene3d-label", "aria-hidden": "true",
    style: "position:absolute;left:0;top:0;display:none;pointer-events:none;max-width:min(80%,22rem);padding:.2rem .45rem;border-radius:.3rem;" +
      "background:rgba(255,255,255,.92);color:#1d1c1a;border:1px solid #1f5fbf;font-size:.85rem;line-height:1.3;white-space:normal;z-index:1" });
  const viewport = html("div", { class: "scene3d-viewport", style: fill ? "position:relative;width:100%;height:100%;flex:1 1 auto;min-height:0;overflow:hidden" : "position:relative;width:100%;height:var(--scene3d-height,min(60vh,560px));min-height:240px;overflow:hidden" }, [canvas, empty, overlay]);
  const live = html("p", { class: "scene3d-live", "aria-live": "polite", style: VISUALLY_HIDDEN });
  const legendItems = html("ul", { class: "scene3d-legend-items", style: "list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1rem" });
  const legend = html("div", { class: "scene3d-legend" }, [
    strings.legendTitle ? html("strong", { class: "scene3d-legend-title", text: strings.legendTitle }) : null,
    strings.legendNote ? html("p", { class: "scene3d-legend-note", text: strings.legendNote, style: "margin:.25rem 0" }) : null,
    legendItems
  ]);
  const list = html("ul", { class: "scene3d-pieces", style: "list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem" });
  const listNav = html("nav", { class: "scene3d-list", "aria-label": strings.listLabel ?? null }, [
    strings.listTitle ? html("strong", { class: "scene3d-list-title", text: strings.listTitle }) : null, list
  ]);
  const root = html("div", { class: "scene3d", "data-mode": "overview", "data-framing": initialFraming === "all" ? "all" : "focus", "data-view-angle": "oblique", "data-style-mode": normalizeStyleMode(initialStyleMode), style: fill ? "display:flex;flex-direction:column;height:100%" : null }, [viewport, live, legend, listNav]);
  container.replaceChildren(root);

  // ---------- three.js scene ----------
  // Pixel ratio: min(dpr, 2), or min(dpr, 1.5) in a narrow container (< 600 px) to keep phones smooth (TASK-6-56).
  const ratioFor = (width) => Math.min(window.devicePixelRatio || 1, width > 0 && width < 600 ? 1.5 : 2);
  let pixelRatio = ratioFor(container.clientWidth || window.innerWidth || 0);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8f8b82, 1.6);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); // fixed, non-solar direction: shading only
  sun.position.set(0.45, 1, 0.7);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const sky = createSky(); // presentation style only (ADR-004 D2): vertical gradient, no sun disc
  sky.visible = false;
  scene.add(sky);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduce;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI * 0.495;
  const content = new THREE.Group();
  scene.add(content);
  // People markers (TASK-6-60, ADR-004 D3): only in the presentation style; the layer is its own group, not part of `content`.
  const markers = createMarkersLayer(THREE, { parent: scene, viewport, strings: strings.markers ?? {}, labelFor: safeLabel, insets: markerInsets,
    avoid: () => { // the piece-name label stays readable: marker labels keep clear of it (viewport coordinates)
      if (overlay.style.display !== "block") return [];
      const r = overlay.getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      // `move`: when the marker panel cannot clear this label it is moved next to the panel instead (never hidden).
      return [{ left: r.left - v.left, top: r.top - v.top, w: r.width, h: r.height, move: (left, top) => { overlay.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`; } }];
    } });
  root.setAttribute("data-markers-count", "0");
  let markerRequest = null; // { descriptors, pieceIds } kept so a style switch or a new solve redraws them
  function applyMarkers() {
    const piece = markerRequest ? pieces.filter((candidate) => markerRequest.pieceIds.includes(candidate.id))
      .sort((a, b) => b.box.sx * b.box.sz - a.box.sx * a.box.sz)[0] : null;
    markers.set(piece ? markerRequest.descriptors : [], piece?.box ?? null, piece?.kind ?? null);
    markers.setVisible(styleMode === "presentation");
    root.setAttribute("data-markers-count", String(markers.count()));
    requestRender();
  }
  /** Draw abstract role figures (markersAt descriptors) on the top of a floor/court piece, beside the base of a raised one: the largest of `pieceIds`. Shown only in the presentation style. */
  function setMarkers(descriptors, { pieceId = null, pieceIds = [] } = {}) {
    const ids = [...(pieceId ? [pieceId] : []), ...pieceIds];
    markerRequest = Array.isArray(descriptors) && descriptors.length && ids.length ? { descriptors, pieceIds: ids } : null;
    applyMarkers();
  }
  function clearMarkers() { setMarkers(null); }

  let styleMode = normalizeStyleMode(initialStyleMode);
  const fills = {}; // `${style}|${selected}` → material (certainty style)
  const presFills = {}; // presentation style: `${kind}|${basis}|${selected}|${access}` → material
  // Pattern contrast: full in the overview, softened at eye level in walk mode (stacked translucent layers).
  const patternStrength = { value: 1 };
  const fillFor = (style, selected, access = null) => (fills[`${style}|${selected}|${access}`] ??= fillMaterial(style, { selected, pixelRatio, strength: patternStrength, access }));
  const dashed = new Map(); // dash length (m) → LineDashedMaterial
  const dashedFor = (size) => {
    const dash = 2 ** Math.round(Math.log2(Math.max(size / 14, 0.05)));
    if (!dashed.has(dash)) dashed.set(dash, new THREE.LineDashedMaterial({ color: PALETTE.edge, dashSize: dash, gapSize: dash * 0.7 }));
    return dashed.get(dash);
  };
  const materials = {
    edgeSolid: new THREE.LineBasicMaterial({ color: PALETTE.edge }),
    selected: new THREE.LineBasicMaterial({ color: PALETTE.selected, depthTest: false, transparent: true }),
    focus: new THREE.LineDashedMaterial({ color: PALETTE.focus, dashSize: 1, gapSize: 0.5, depthTest: false, transparent: true }),
    // The ground must never win the depth test against a piece (review N-07: on distant, grazing faces the fills'
    // slope-scaled polygon offset pushed the Mount's top behind a ground plane only ~1 m below it, so its dot pattern
    // vanished in a screen-space band and the face read as plain = "sourced"). The ground is pushed back further
    // than any fill and sits GROUND_GAP_FRACTION of the scene size below the lowest piece.
    ground: new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: GROUND_POLYGON_OFFSET.factor, polygonOffsetUnits: GROUND_POLYGON_OFFSET.units }),
    presGround: createGroundMaterial()
  };
  // Presentation style: fills per kind and basis, edges per basis (solid / dotted / dashed — colour is never the only cue).
  const presFillFor = (piece, selected, access = null, basisOverride = null) => {
    const style = presentationStyle(basisOverride ? { ...piece, certaintyStyle: basisOverride } : piece);
    const key = `${piece.kind}|${style.basis}|${selected}|${access}`;
    return (presFills[key] ??= presentationFill({ tone: style.tone, opacity: style.opacity, selected, selectedColor: PALETTE.selected, access,
      accessDim: access ? ACCESS_DIM[access] ?? null : null, accessTint: ACCESS_ALLOWED_TINT, groundColor: PALETTE.ground }));
  };
  const presEdges = new Map(); // `${basis}|${dash}` → line material
  const presEdgeFor = (basis, size) => {
    const style = PRESENTATION_STYLES[basis] ?? PRESENTATION_STYLES.speculative;
    const dash = 2 ** Math.round(Math.log2(Math.max(size / 14, 0.05)));
    const key = `${style.edge}|${dash}`;
    if (!presEdges.has(key)) {
      presEdges.set(key, style.edge === "solid" ? new THREE.LineBasicMaterial({ color: style.edgeColor })
        : style.edge === "dotted" ? new THREE.LineDashedMaterial({ color: style.edgeColor, dashSize: dash * 0.1, gapSize: dash * 0.3 })
          : new THREE.LineDashedMaterial({ color: style.edgeColor, dashSize: dash, gapSize: dash * 0.7 }));
    }
    return presEdges.get(key);
  };
  /**
   * Box with at most two draw groups: sides (±x, ±z) first, then top/bottom (±y). BoxGeometry's own six groups would
   * cost six draw calls per piece (ADR-003 D6 budget: ≤ 150).
   */
  function boxGeometry(sx, sy, sz) {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const index = geometry.getIndex().array;
    const face = (n) => Array.from(index.slice(n * 6, n * 6 + 6)); // [+x, -x, +y, -y, +z, -z], 6 indices each
    geometry.setIndex([...face(0), ...face(1), ...face(4), ...face(5), ...face(2), ...face(3)]);
    geometry.clearGroups();
    geometry.addGroup(0, 24, 0);
    geometry.addGroup(24, 12, 1);
    return geometry;
  }
  /**
   * Prism over a quadrilateral outline (TASK-6-34), centred on the piece's box like boxGeometry. ExtrudeGeometry has
   * two groups: 0 = the top/bottom caps, 1 = the sides (the reverse of boxGeometry's order).
   */
  function prismGeometry(piece) {
    const { x, z, sy } = piece.box;
    const shape = new THREE.Shape(piece.outline.corners.map((corner) => new THREE.Vector2(corner.x - x, -(corner.z - z))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: sy, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2); // extrusion depth → up, shape y → -z (south is +z)
    geometry.translate(0, -sy / 2, 0);
    return geometry;
  }
  /**
   * Roof slab of a portico (TASK-6-43): a prism over the band along the container's edge, on top of the piece's box
   * (the box is columns + slab). Two groups like prismGeometry; drawn with one material (always speculative).
   */
  function porticoSlabGeometry(piece) {
    const { x, z, sy } = piece.box;
    const roof = piece.portico.displayDefaults.roofThicknessMetres;
    const shape = new THREE.Shape(piece.portico.band.map((corner) => new THREE.Vector2(corner.x - x, -(corner.z - z))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: roof, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, sy / 2 - roof, 0);
    return geometry;
  }
  /**
   * Stepped stair (TASK-6-43): a sawtooth profile (run × rise) extruded across the stair's width and turned so the
   * high end faces `stair.ascends`. ExtrudeGeometry groups: 0 = the two profile faces, 1 = treads and risers.
   */
  function stairGeometry(piece) {
    const { stair, box } = piece;
    const n = stair.steps;
    const run = stair.runMetres;
    const stepRun = run / n;
    const rise = box.sy / n;
    const points = [[0, 0], [run, 0]];
    for (let k = n - 1; k >= 0; k -= 1) points.push([(k + 1) * stepRun, (k + 1) * rise], [k * stepRun, (k + 1) * rise]);
    const across = stair.ascends === "east" || stair.ascends === "west" ? box.sz : box.sx;
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v))), { depth: across, bevelEnabled: false });
    geometry.translate(-run / 2, -box.sy / 2, -across / 2);
    geometry.rotateY({ east: 0, north: Math.PI / 2, west: Math.PI, south: -Math.PI / 2 }[stair.ascends] ?? 0);
    return geometry;
  }
  /**
   * One InstancedMesh for all columns of a portico (a single draw call, ADR-003 D6). Over `budget` columns the
   * drawing is thinned evenly along each row (portico-lod.js); the model keeps the full count.
   */
  function porticoColumns(piece, material) {
    const { portico, box } = piece;
    const lod = thinColumns({ rows: portico.rows, perRow: portico.columnsPerRow }, budget);
    const radius = portico.displayDefaults.columnDiameterMetres / 2;
    const height = portico.columnHeightMetres;
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, height, 10, 1), material, lod.drawn);
    const matrix = new THREE.Matrix4();
    lod.indices.forEach((index, slot) => {
      const column = portico.columns[index];
      matrix.makeTranslation(column.x - box.x, -box.sy / 2 + height / 2, column.z - box.z);
      mesh.setMatrixAt(slot, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = `${piece.id}:columns`;
    mesh.userData = { refKind: "geometry", refId: piece.id };
    return { mesh, lod };
  }
  /** Material of a portico's column instances (the piece's own basis). */
  const columnMaterial = (piece, selected) => (styleMode === "presentation"
    ? presFillFor(piece, selected, accessMap[piece.id] ?? null)
    : fillFor(pieceStyle(piece).side, selected, accessMap[piece.id] ?? null));
  /** [side, top] materials: top/bottom faces by the plan basis, sides by the weaker of plan and height. */
  const faceMaterials = (piece, selected) => {
    const style = pieceStyle(piece);
    const access = accessMap[piece.id] ?? null;
    if (styleMode === "presentation") return presFillFor(piece, selected, access, piece.portico ? "speculative" : null); // one material: the whole box
    // A portico's roof slab is always a visual completion: hatched and translucent whatever its columns' basis.
    if (piece.portico) return fillFor("speculative", selected, access);
    const faces = [fillFor(style.side, selected, access), fillFor(style.top, selected, access)];
    return piece.outline ? faces.reverse() : faces; // prisms list the caps first (see prismGeometry)
  };

  // ---------- state ----------
  let solved = null;
  let pieces = [];
  let bounds = null;
  let focusBounds = null;
  let framing = initialFraming === "all" ? "all" : "focus";
  let viewAngle = "oblique"; // "oblique" | "plan" (M2-07: a true top-down plan view for comparing outlines)
  let boundsKey = "";
  let extent = 1;
  let idsKey = "";
  const entries = new Map(); // id → { piece, mesh, edges, button, outline?, focusOutline?, columns?, lod? }
  let ground = null;
  let selectedIds = new Set();
  let accessMap = {}; // pieceId → allowed|forbidden|no_source (persona), {} when none
  let focusIndex = -1;
  let mode = "overview";
  let frame = 0;
  let destroyed = false;
  let pendingFit = false;
  const overviewView = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const walk = { position: new THREE.Vector3(), yaw: 0, pitch: 0, keys: new Set(), stick: null, lastTime: null };

  function render() {
    frame = 0;
    if (destroyed) return;
    let keepGoing = false;
    if (flight) keepGoing = stepFlight();
    else if (mode === "overview" && controls.enableDamping) keepGoing = controls.update();
    if (mode === "walk") keepGoing = stepWalk();
    if (sky.visible) sky.followCamera(camera);
    markers.fit(camera);
    renderer.render(scene, camera);
    placeOverlay();
    markers.place(camera);
    if (keepGoing) requestRender();
  }

  /** In-canvas label (review 3D-10) for the focused piece, else the first selected one, above its box top. */
  const projected = new THREE.Vector3();
  function placeOverlay() {
    const piece = pieces[focusIndex] ?? pieces.find((candidate) => selectedIds.has(candidate.id));
    // M3-10: a caller-supplied note (e.g. "inferred location" during the tour) follows the name of a selected piece.
    const base = piece ? (shortLabels ? shortNameFor(piece) : nameFor(piece)) : "";
    const text = base && labelNote && selectedIds.has(piece.id) ? [base, labelNote].join(sep) : base;
    if (!piece || !text) { overlay.style.display = "none"; return; }
    const { x, y, z, sy } = piece.box;
    projected.set(x, y + sy / 2, z).project(camera);
    if (projected.z > 1 || projected.z < -1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) { overlay.style.display = "none"; return; }
    if (overlay.textContent !== text) overlay.textContent = text;
    overlay.style.display = "block";
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const px = ((projected.x + 1) / 2) * width;
    const py = ((1 - projected.y) / 2) * height;
    const w = overlay.offsetWidth;
    const h = overlay.offsetHeight;
    const left = Math.min(Math.max(px - w / 2, 4), Math.max(width - w - 4, 4));
    const top = Math.min(Math.max(py - h - 10, 4), Math.max(height - h - 4, 4));
    overlay.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function requestRender() {
    if (!frame && !destroyed) frame = requestAnimationFrame(render);
  }
  controls.addEventListener("change", requestRender);

  function resize() {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    const ratio = ratioFor(width);
    if (ratio !== pixelRatio) {
      // Crossing the 600 px line: the screen-space pattern periods depend on the ratio, so the certainty fills are rebuilt.
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      for (const key of Object.keys(fills)) { fills[key].dispose(); delete fills[key]; }
      if (pieces.length) buildContent();
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(viewport);

  // ---------- content ----------
  function disposeContent() {
    for (const child of [...content.children]) {
      content.remove(child);
      child.traverse((object) => { object.geometry?.dispose(); if (object.isInstancedMesh) object.dispose(); });
    }
    entries.clear();
    ground = null;
  }

  /** Text saying a portico draws fewer columns than the model holds (strings.porticoThinned: "{drawn}" / "{total}"). */
  function lodText(entryOrId) {
    const lod = (typeof entryOrId === "string" ? entries.get(entryOrId) : entryOrId)?.lod;
    if (!lod?.thinned || !strings.porticoThinned) return "";
    return String(strings.porticoThinned).replace("{drawn}", String(lod.drawn)).replace("{total}", String(lod.total));
  }
  function nameFor(piece) {
    const label = safeLabel(piece.labelRef) || strings.kind?.[piece.kind] || "";
    return [label, ...basisParts(piece), piece.assumed ? strings.assumed ?? "" : "", lodText(piece.id)].filter(Boolean).join(sep);
  }

  // Presentation: the canvas label is the piece name and one basis word; the long description stays in the inspector.
  let shortLabels = false;
  function shortNameFor(piece) {
    const label = safeLabel(piece.labelRef) || strings.kind?.[piece.kind] || "";
    // The record name carries its attribution in a trailing parenthesis; the tour bar and the inspector show it.
    const name = label.replace(/\s*\([^)]*\)[⁦-⁩\s]*$/, "") || label;
    return [name, basisParts(piece)[0]].filter(Boolean).join(sep);
  }
  function setShortLabels(on) { shortLabels = Boolean(on); requestRender(); }

  function buildContent() {
    disposeContent();
    bounds = sceneBounds(pieces);
    extent = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, bounds.maxY - bounds.minY, 1) : 1;
    focusBounds = sceneBounds(focusPieces()) ?? bounds;
    materials.focus.dashSize = extent / 120;
    materials.focus.gapSize = extent / 240;
    const presentation = styleMode === "presentation";
    if (bounds) {
      const size = extent * (presentation ? 14 : 4); // presentation: far enough that the haze meets the sky horizon
      if (presentation) {
        materials.presGround.uniforms.uBox.value.set((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, (bounds.maxX - bounds.minX) / 2, (bounds.maxZ - bounds.minZ) / 2);
        materials.presGround.uniforms.uExtent.value = extent;
      }
      ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), presentation ? materials.presGround : materials.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set((bounds.minX + bounds.maxX) / 2, groundLevel(bounds, extent), (bounds.minZ + bounds.maxZ) / 2);
      ground.name = "ground";
      content.add(ground);
    }
    list.replaceChildren();
    pieces.forEach((piece, index) => {
      const style = pieceStyle(piece);
      const pres = presentationStyle(piece);
      const { x, y, z, sx, sy, sz } = piece.box;
      const geometry = piece.portico ? porticoSlabGeometry(piece) : piece.stair ? stairGeometry(piece) : piece.outline ? prismGeometry(piece) : boxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geometry, faceMaterials(piece, false));
      mesh.position.set(x, y, z);
      mesh.name = piece.id;
      mesh.userData = { refKind: "geometry", refId: piece.id };
      if (presentation ? pres.opacity < 1 || piece.portico : style.side === "speculative" || style.top === "speculative" || piece.portico) mesh.renderOrder = 1;
      const edgeMaterial = presentation ? presEdgeFor(pres.basis, Math.max(sx, sy, sz))
        : style.edge === "dashed" ? dashedFor(Math.max(sx, sy, sz)) : materials.edgeSolid;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      if (edgeMaterial.isLineDashedMaterial) edges.computeLineDistances();
      edges.raycast = () => {};
      mesh.add(edges);
      let columns = null;
      let lod = null;
      if (piece.portico) {
        ({ mesh: columns, lod } = porticoColumns(piece, columnMaterial(piece, false)));
        if (presentation ? pres.opacity < 1 : style.side === "speculative") columns.renderOrder = 1;
        mesh.add(columns);
      }
      content.add(mesh);
      const name = nameFor(piece);
      const label = safeLabel(piece.labelRef) || strings.kind?.[piece.kind] || "";
      const access = accessMap[piece.id] ?? null;
      const button = html("button", { type: "button", class: `scene3d-piece scene3d-${piece.certaintyStyle}`, "data-ref-id": piece.id, "data-access": access,
        "data-certainty-style": piece.certaintyStyle, "data-plan-style": style.top, "data-placement": style.placement, "aria-label": name || null, "aria-pressed": "false", "data-index": index,
        "data-columns-drawn": lod ? lod.drawn : null, "data-columns-total": lod ? lod.total : null, "data-lod": lod ? (lod.thinned ? "thinned" : "full") : null,
        style: "display:inline-flex;align-items:center;gap:.35rem" }, [
        presentation ? swatchSvg({ fill: "solid", opacity: pres.opacity, tone: pres.tone, edge: pres.edge })
          : swatchSvg({ fill: SIZE_STYLES[style.top].fill, pattern: SIZE_STYLES[style.top].pattern, edge: style.edge }),
        html("span", { class: "scene3d-piece-label", text: label }),
        piece.assumed && strings.assumedShort ? html("span", { class: "scene3d-piece-assumed", text: strings.assumedShort }) : null,
        access && strings.access?.[access] ? html("span", { class: `scene3d-piece-access persona-status persona-status-${access}`, text: strings.access[access] }) : null
      ]);
      list.append(html("li", {}, [button]));
      entries.set(piece.id, { piece, mesh, edges, button, columns, lod });
      if (lod?.thinned) button.setAttribute("aria-label", nameFor(piece));
    });
    const legendTable = presentation ? LEGEND_PRESENTATION : LEGEND_3D;
    legendItems.replaceChildren(...(presentation ? presentationLegendPresence(pieces) : legendPresence(pieces)).filter((item) => item.present && strings.legend?.[item.key]).map((item) =>
      html("li", { class: `scene3d-legend-item scene3d-legend-${item.key}`, style: "display:flex;align-items:center;gap:.4rem" }, [
        swatchSvg(legendTable.find((entry) => entry.key === item.key).swatch), html("span", { text: strings.legend[item.key] })
      ])));
    empty.style.display = pieces.length ? "none" : "flex";
    applySelection();
    applyFocus();
  }

  function outlineFor(entry, material, scale) {
    const { sx, sy, sz } = entry.piece.box;
    const pad = Math.max(extent / 400, 0.05);
    const box = new THREE.BoxGeometry(sx * scale + pad, sy * scale + pad, sz * scale + pad);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(box), material);
    box.dispose();
    if (material.isLineDashedMaterial) outline.computeLineDistances();
    outline.renderOrder = 10;
    outline.raycast = () => {};
    entry.mesh.add(outline);
    return outline;
  }
  function removeOutline(entry, key) {
    if (!entry[key]) return;
    entry.mesh.remove(entry[key]);
    entry[key].geometry.dispose();
    entry[key] = null;
  }

  function applySelection() {
    for (const [id, entry] of entries) {
      const on = selectedIds.has(id);
      entry.mesh.material = faceMaterials(entry.piece, on);
      if (entry.columns) entry.columns.material = columnMaterial(entry.piece, on);
      entry.button.setAttribute("aria-pressed", on ? "true" : "false");
      removeOutline(entry, "outline");
      if (on) entry.outline = outlineFor(entry, materials.selected, 1.0);
    }
    requestRender();
  }

  function applyFocus() {
    entries.forEach((entry) => removeOutline(entry, "focusOutline"));
    const piece = pieces[focusIndex];
    if (piece) {
      const entry = entries.get(piece.id);
      entry.focusOutline = outlineFor(entry, materials.focus, 1.02);
    }
    requestRender();
  }

  // ---------- camera ----------
  /** Pieces the "focus" framing fits: focusRefIds if any match, else depth ≥ 2, else depth ≥ 1, else all. */
  function focusPieces() {
    if (Array.isArray(focusRefIds) && focusRefIds.length) {
      const wanted = new Set(focusRefIds);
      const chosen = pieces.filter((piece) => wanted.has(piece.id));
      if (chosen.length) return chosen;
    }
    const byId = new Map(pieces.map((piece) => [piece.id, piece]));
    const depth = (piece, seen = new Set()) => {
      if (!piece?.parentId || !byId.has(piece.parentId) || seen.has(piece.id)) return 0;
      seen.add(piece.id);
      return 1 + depth(byId.get(piece.parentId), seen);
    };
    for (const min of [2, 1]) {
      const chosen = pieces.filter((piece) => depth(piece) >= min);
      if (chosen.length) return chosen;
    }
    return pieces;
  }

  /** Smallest distance from `centre` along unit `direction` at which every corner of `b` is in view (no margin). */
  function distanceToFit(b, centre, direction) {
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    let distance = 1;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const o = new THREE.Vector3(x, y, z).sub(centre);
      const depthTowardCamera = o.dot(direction);
      distance = Math.max(distance, depthTowardCamera + Math.abs(o.dot(right)) / tanH, depthTowardCamera + Math.abs(o.dot(up)) / tanV);
    }
    return distance;
  }

  /** Tight fit: the smallest distance along a fixed oblique direction at which every box corner is in view. */
  function fitOverview() {
    flight = null;
    const b = framing === "all" ? bounds : focusBounds;
    if (!b) {
      camera.position.set(10, 10, 10);
      controls.target.set(0, 0, 0);
    } else {
      const centre = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      const direction = (viewAngle === "plan" ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.55, 0.8, 0.9)).normalize();
      const distance = distanceToFit(b, centre, direction) * 1.08;
      camera.position.copy(centre).addScaledVector(direction, distance);
      controls.target.copy(centre);
      const whole = bounds ? Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) : distance;
      camera.near = Math.max(distance / 1000, 0.05);
      camera.far = (distance + whole) * 4;
      controls.minDistance = Math.max(distance / 50, 1);
      controls.maxDistance = Math.max(distance, whole * 1.5) * 3;
    }
    camera.updateProjectionMatrix();
    controls.update();
    overviewView.position.copy(camera.position);
    overviewView.target.copy(controls.target);
    root.setAttribute("data-fit", boundsInView() ? "ok" : "clipped"); // inspected by the E2E framing check (M2-07)
    if (lastShot) replayShot(); // a cinematic shot survives a refit (other mount option)
    requestRender();
  }

  // ---------- guided-tour camera (TASK-6-47) ----------
  let flight = null; // { from, to, start, duration } while the camera is moving
  const publishCamera = () => {
    root.setAttribute("data-camera-target", [controls.target.x, controls.target.y, controls.target.z].map((v) => v.toFixed(2)).join(","));
    root.setAttribute("data-camera-position", [camera.position.x, camera.position.y, camera.position.z].map((v) => v.toFixed(1)).join(","));
    root.setAttribute("data-flying", String(Boolean(flight)));
  };
  const cancelFlight = () => { if (flight) { flight = null; overviewView.position.copy(camera.position); overviewView.target.copy(controls.target); publishCamera(); } };
  controls.addEventListener("start", cancelFlight);
  const setNearFar = () => {
    const distance = camera.position.distanceTo(controls.target);
    const whole = bounds ? Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) : distance;
    camera.near = Math.max(distance / 1000, 0.05);
    camera.far = Math.max((distance + whole) * 4, camera.far);
    camera.updateProjectionMatrix();
  };
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
  function stepFlight() {
    if (!flight) return false;
    const t = Math.min(1, (performance.now() - flight.start) / flight.duration);
    const k = easeInOut(t);
    camera.position.lerpVectors(flight.from.position, flight.to.position, k);
    controls.target.lerpVectors(flight.from.target, flight.to.target, k);
    setNearFar();
    controls.update();
    if (t >= 1) { flight = null; overviewView.position.copy(camera.position); overviewView.target.copy(controls.target); }
    publishCamera();
    return Boolean(flight);
  }

  // ---------- cinematic shots (TASK-6-58) ----------
  // Presentation tour: an establishing shot of the whole mount, and per-stop shots that frame a piece together with its
  // surroundings at a set elevation and azimuth. HUD overlap is declared through setInsets so the subject sits in the free area.
  let insets = { top: 0, bottom: 0 };
  let lastShot = null; // { type: "overview" } | { type: "piece", ids, options } — replayed after the scene changes
  const BASE_AZIMUTH = Math.atan2(0.55, 0.9); // the same default direction the overview fit uses
  const rad = THREE.MathUtils.degToRad;
  const freeFraction = () => {
    const height = Math.max(viewport.clientHeight, 1);
    return THREE.MathUtils.clamp((height - insets.top - insets.bottom) / height, 0.3, 1);
  };
  const boundsCentre = (b) => new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  const solidPieces = () => pieces.filter((piece) => !FLOOR_KINDS.has(piece.kind));
  const insideSolid = (point) => solidPieces().some((piece) => {
    const b = boxBounds(piece.box);
    return point.x > b.minX && point.x < b.maxX && point.y > b.minY && point.y < b.maxY && point.z > b.minZ && point.z < b.maxZ;
  });
  const directionFor = (azimuthDeg, elevationDeg) => {
    const az = BASE_AZIMUTH + rad(azimuthDeg);
    const el = rad(elevationDeg);
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  };
  /** Projected extent (orthographic, camera frame) of the box corners of `b` seen along `direction`. */
  function spansOf(b, centre, direction) {
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, depth = 0;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const o = new THREE.Vector3(x, y, z).sub(centre);
      r0 = Math.min(r0, o.dot(right)); r1 = Math.max(r1, o.dot(right));
      u0 = Math.min(u0, o.dot(up)); u1 = Math.max(u1, o.dot(up));
      depth = Math.max(depth, Math.abs(o.dot(direction)));
    }
    return { width: r1 - r0, height: u1 - u0, depth, up };
  }
  /**
   * Camera pose for a box: `fraction` of the free viewport height is the box itself (so its surroundings show), never
   * closer than the distance at which the whole box is in view and never farther than one that fits `context`.
   */
  function poseFor(b, { azimuth = 0, elevation = 40, fraction = 0.32, context = null, wholeBox = false, margin = 1.08 } = {}) {
    const centre = boundsCentre(b);
    const free = freeFraction();
    const tanV = Math.tan(rad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    let el = elevation;
    let direction = directionFor(azimuth, el);
    let spans = spansOf(b, centre, direction);
    const visible = distanceToFit(b, centre, direction) / free * margin;
    let distance = visible;
    if (!wholeBox) {
      const wanted = Math.max(spans.height / (2 * tanV * fraction * free), spans.width / (2 * tanH * 0.5)) + spans.depth * 0.3;
      const cap = context ? distanceToFit(context, centre, direction) / free * 0.9 : Infinity;
      // T-09: a minimum camera distance, so a small piece is still seen within its court (walls and edge lines never fill the frame).
      const floor = context ? distanceToFit(context, centre, direction) / free * MIN_CONTEXT_SHARE : 0;
      distance = Math.max(visible, floor, Math.min(wanted, cap));
    }
    let target;
    let position;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const shift = ((insets.bottom - insets.top) / Math.max(viewport.clientHeight, 1)) * distance * tanV;
      target = centre.clone().addScaledVector(spans.up, -shift);
      position = target.clone().addScaledVector(direction, distance);
      if (!insideSolid(position)) break;
      el = Math.min(el + 8, 70); // never inside geometry: look down from higher up
      direction = directionFor(azimuth, el);
      spans = spansOf(b, centre, direction);
    }
    return { position, target, elevation: el, distance };
  }
  function applyPose(to, { animate, duration }) {
    flight = null;
    controls.maxDistance = Math.max(controls.maxDistance, to.distance * 1.5);
    controls.minDistance = Math.min(controls.minDistance, to.distance / 4);
    if (!animate) {
      camera.position.copy(to.position);
      controls.target.copy(to.target);
      setNearFar();
      controls.update();
      overviewView.position.copy(camera.position);
      overviewView.target.copy(controls.target);
    } else flight = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, start: performance.now(), duration };
    publishCamera();
    requestRender();
  }
  const publishShot = (kind, azimuth = null) => {
    root.setAttribute("data-camera-shot", kind);
    if (azimuth === null) root.removeAttribute("data-camera-azimuth"); else root.setAttribute("data-camera-azimuth", String(azimuth));
  };
  controls.addEventListener("start", () => { lastShot = null; publishShot("free"); });

  /** Declare the HUD overlap (px) at the top and bottom of the canvas; shots place the subject in the free area between. */
  function setInsets(next) {
    insets = { top: Math.max(0, Number(next?.top) || 0), bottom: Math.max(0, Number(next?.bottom) || 0) };
  }

  /** Establishing shot: the whole scene (the whole mount for the current mount-extent option) in the default oblique view. */
  function showOverview({ animate = !reduce, duration = 1200 } = {}) {
    if (!bounds) return false;
    if (mode === "walk") { setMode("overview"); onModeChange("overview"); }
    lastShot = { type: "overview" };
    root.removeAttribute("data-fly-ids");
    publishShot("overview", 0);
    // R-12: a lower view and a tighter margin let the mount fill the free canvas instead of floating in it.
    applyPose(poseFor(bounds, { azimuth: 0, elevation: 33, wholeBox: true, margin: 0.88 }), { animate, duration });
    return true;
  }

  /**
   * Move the overview camera to frame the pieces with the given ids.
   * Default: keep the current viewing direction and fit the pieces. `cinematic: true` (presentation tour): set the
   * azimuth offset (deg, from the default direction) and elevation, show the piece at ~35% of the free height with its
   * surrounding piece (its parent) in view. `animate: false` jumps (used for prefers-reduced-motion). Returns false,
   * keeping the camera, when no id matches a piece.
   */
  function flyTo(ids, { animate = !reduce, duration = null, cinematic = false, azimuth = 0, elevation = 40, fraction = 0.32 } = {}) {
    const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
    const chosen = pieces.filter((piece) => wanted.has(piece.id));
    const b = sceneBounds(chosen);
    if (!b) return false;
    if (mode === "walk") { setMode("overview"); onModeChange("overview"); }
    flight = null;
    root.setAttribute("data-fly-ids", chosen.map((piece) => piece.id).join(" "));
    if (cinematic) {
      const parent = pieces.find((piece) => piece.id === chosen[0].parentId);
      const pose = poseFor(b, { azimuth, elevation, fraction, context: parent ? boxBounds(parent.box) : null });
      lastShot = { type: "piece", ids: [...wanted], options: { cinematic, azimuth, elevation, fraction } };
      publishShot("piece", azimuth);
      applyPose(pose, { animate, duration: duration ?? 1200 });
      return true;
    }
    lastShot = null;
    publishShot("piece");
    const centre = boundsCentre(b);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.55, 0.8, 0.9);
    direction.normalize();
    const distance = THREE.MathUtils.clamp(distanceToFit(b, centre, direction) * 1.25, controls.minDistance, controls.maxDistance);
    applyPose({ position: centre.clone().addScaledVector(direction, distance), target: centre, distance }, { animate, duration: duration ?? 700 });
    return true;
  }

  /** After the scene changed (other mount option, other pieces): put the camera back on the last cinematic shot, without animating. */
  function replayShot() {
    if (!lastShot || mode !== "overview") return;
    const shot = lastShot;
    if (shot.type === "piece" && flyTo(shot.ids, { ...shot.options, animate: false })) return;
    showOverview({ animate: false });
  }

  function floorAt(x, z) {
    let top = bounds ? -Infinity : 0;
    for (const piece of pieces) {
      if (!FLOOR_KINDS.has(piece.kind)) continue;
      const b = boxBounds(piece.box);
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && (!piece.outline || outsideDistance(piece.outline.corners, { x, z }) <= 0)) top = Math.max(top, b.maxY);
    }
    return Number.isFinite(top) ? top : (bounds ? bounds.minY : 0);
  }

  function resetWalk() {
    const b = focusBounds ?? bounds;
    if (b) {
      walk.position.set((b.minX + b.maxX) / 2, 0, b.maxZ + Math.max((b.maxZ - b.minZ) * 0.15, 5));
    } else walk.position.set(0, 0, 0);
    walk.yaw = 0; // facing -z (north)
    walk.pitch = 0;
    placeWalkCamera();
  }

  function placeWalkCamera() {
    walk.position.y = floorAt(walk.position.x, walk.position.z) + EYE_HEIGHT_METRES;
    camera.position.copy(walk.position);
    camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ");
    camera.near = 0.05;
    camera.far = Math.max(extent * 10, 100);
    camera.updateProjectionMatrix();
  }

  const walkSpeed = () => Math.min(Math.max(extent / 25, 2), 25); // metres per second
  function stepWalk() {
    const now = performance.now();
    const dt = walk.lastTime === null ? 1 / 60 : Math.min((now - walk.lastTime) / 1000, 0.1);
    const k = walk.keys;
    let forward = 0;
    let strafe = 0;
    let turn = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) forward += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) forward -= 1;
    if (k.has("KeyA")) strafe -= 1;
    if (k.has("KeyD")) strafe += 1;
    if (k.has("KeyQ") || k.has("ArrowLeft")) turn += 1;
    if (k.has("KeyE") || k.has("ArrowRight")) turn -= 1;
    if (walk.stick) { forward += -walk.stick.dy; strafe += walk.stick.dx; }
    const moving = forward !== 0 || strafe !== 0 || turn !== 0;
    if (!moving) { walk.lastTime = null; placeWalkCamera(); return false; }
    walk.lastTime = now;
    const speed = walkSpeed() * (k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1);
    walk.yaw += turn * 1.6 * dt;
    const sin = Math.sin(walk.yaw);
    const cos = Math.cos(walk.yaw);
    walk.position.x += (-sin * forward + cos * strafe) * speed * dt;
    walk.position.z += (-cos * forward - sin * strafe) * speed * dt;
    placeWalkCamera();
    return true;
  }

  function orbitBy(dAzimuth, dPolar, zoom = 1) {
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += dAzimuth;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + dPolar, 0.05, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius * zoom, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
    requestRender();
  }

  // ---------- selection / focus ----------
  function selectPiece(id) {
    const entry = entries.get(id);
    if (!entry) return;
    onSelect({ refKind: "geometry", refId: id, locationId: entry.piece.locationId ?? null });
  }

  function stepFocus(delta) {
    if (!pieces.length) return;
    focusIndex = focusIndex < 0 ? (delta > 0 ? 0 : pieces.length - 1) : (focusIndex + delta + pieces.length) % pieces.length;
    applyFocus();
    live.textContent = nameFor(pieces[focusIndex]);
  }

  const raycaster = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const meshes = [...entries.values()].flatMap((entry) => (entry.columns ? [entry.mesh, entry.columns] : [entry.mesh]));
    const hit = raycaster.intersectObjects(meshes, false).find((h) => h.object.userData?.refId);
    return hit ? hit.object.userData.refId : null;
  }

  // ---------- input ----------
  const pointers = new Map(); // pointerId → { x, y, startX, startY, role }
  function onPointerDown(event) {
    cancelFlight();
    const rect = canvas.getBoundingClientRect();
    const role = mode === "walk" ? (event.pointerType === "touch" && event.clientX - rect.left < rect.width / 2 ? "stick" : "look") : "orbit";
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, role });
    if (mode === "walk") { canvas.setPointerCapture?.(event.pointerId); event.preventDefault(); }
  }
  function onPointerMove(event) {
    const p = pointers.get(event.pointerId);
    if (!p || mode !== "walk") return;
    if (p.role === "look") {
      walk.yaw -= (event.clientX - p.x) * 0.005;
      walk.pitch = THREE.MathUtils.clamp(walk.pitch - (event.clientY - p.y) * 0.005, -1.2, 1.2);
      placeWalkCamera();
      requestRender();
    } else {
      const radius = 60;
      const dx = THREE.MathUtils.clamp((event.clientX - p.startX) / radius, -1, 1);
      const dy = THREE.MathUtils.clamp((event.clientY - p.startY) / radius, -1, 1);
      walk.stick = { dx: Math.abs(dx) < 0.15 ? 0 : dx, dy: Math.abs(dy) < 0.15 ? 0 : dy };
      requestRender();
    }
    p.x = event.clientX;
    p.y = event.clientY;
  }
  function onPointerUp(event) {
    const p = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (p?.role === "stick") walk.stick = null;
    if (p && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < 6) {
      const id = pick(event.clientX, event.clientY);
      if (id) {
        focusIndex = pieces.findIndex((piece) => piece.id === id);
        applyFocus();
        selectPiece(id);
      }
    }
  }
  const WALK_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "]" || event.key === "PageDown") { event.preventDefault(); stepFocus(1); return; }
    if (event.key === "[" || event.key === "PageUp") { event.preventDefault(); stepFocus(-1); return; }
    if ((event.key === "Enter" || event.key === " ") && pieces[focusIndex]) { event.preventDefault(); selectPiece(pieces[focusIndex].id); return; }
    if (mode === "walk") {
      if (event.key === "Escape") { event.preventDefault(); setMode("overview"); onModeChange("overview"); return; }
      if (event.key === "Home") { event.preventDefault(); resetWalk(); requestRender(); return; }
      if (WALK_CODES.has(event.code)) {
        event.preventDefault();
        walk.keys.add(event.code);
        requestRender();
      }
      return;
    }
    const step = Math.PI / 36;
    const actions = {
      ArrowLeft: () => orbitBy(-step, 0), ArrowRight: () => orbitBy(step, 0),
      ArrowUp: () => orbitBy(0, -step), ArrowDown: () => orbitBy(0, step),
      "+": () => orbitBy(0, 0, 0.85), "=": () => orbitBy(0, 0, 0.85), "-": () => orbitBy(0, 0, 1 / 0.85),
      Home: () => fitOverview()
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); action(); }
  }
  function onKeyUp(event) {
    walk.keys.delete(event.code);
  }
  function onBlur() {
    walk.keys.clear();
    walk.stick = null;
  }
  function onListClick(event) {
    const button = event.target.closest?.("[data-ref-id]");
    if (!button) return;
    focusIndex = Number(button.getAttribute("data-index"));
    applyFocus();
    selectPiece(button.getAttribute("data-ref-id"));
  }
  function onListFocus(event) {
    const button = event.target.closest?.("[data-ref-id]");
    if (!button) return;
    focusIndex = Number(button.getAttribute("data-index"));
    applyFocus();
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);
  list.addEventListener("click", onListClick);
  list.addEventListener("focusin", onListFocus);

  // ---------- API ----------
  function setMode(next) {
    const target = next === "walk" ? "walk" : "overview";
    if (target === mode) return;
    if (target === "walk") {
      overviewView.position.copy(camera.position);
      overviewView.target.copy(controls.target);
      controls.enabled = false;
      mode = "walk";
      patternStrength.value = 0.45;
      resetWalk();
      if (strings.walkHint) live.textContent = strings.walkHint;
    } else {
      mode = "overview";
      patternStrength.value = 1;
      walk.keys.clear();
      walk.stick = null;
      camera.position.copy(overviewView.position);
      controls.target.copy(overviewView.target);
      camera.near = Math.max(camera.position.distanceTo(controls.target) / 1000, 0.05);
      camera.far = Math.max(extent * 20, 100);
      camera.updateProjectionMatrix();
      controls.enabled = true;
      controls.update();
      if (pendingFit) { pendingFit = false; fitOverview(); }
      if (strings.overviewHint) live.textContent = strings.overviewHint;
    }
    root.setAttribute("data-mode", mode);
    requestRender();
  }

  function update(next) {
    if (destroyed || next === solved) return;
    solved = next ?? null;
    pieces = Array.isArray(solved?.pieces) ? solved.pieces : [];
    const nextKey = pieces.map((piece) => piece.id).join("|");
    const focusedId = pieces[focusIndex]?.id ?? null;
    buildContent();
    applyMarkers();
    focusIndex = focusedId ? pieces.findIndex((piece) => piece.id === focusedId) : -1;
    applyFocus();
    // M2-07: a different outline (same pieces, other mount option) changes the bounds, so the camera is refitted.
    const nextBoundsKey = [bounds, focusBounds].map((b) => (b ? [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map((v) => Math.round(v * 100)).join(",") : "-")).join("|");
    const boundsChanged = nextBoundsKey !== boundsKey;
    boundsKey = nextBoundsKey;
    if (nextKey !== idsKey) {
      idsKey = nextKey;
      fitOverview();
      if (mode === "walk") resetWalk();
    } else if (boundsChanged) {
      if (mode === "overview") fitOverview(); else { pendingFit = true; placeWalkCamera(); }
    } else if (mode === "walk") placeWalkCamera();
    replayShot();
    requestRender();
  }

  /** Persona highlight: `map` is pieceId → status (empty/null clears it). Certainty styling is kept; see ACCESS_DIM. */
  function setAccess(map) {
    const next = map && typeof map === "object" ? map : {};
    const same = Object.keys(next).length === Object.keys(accessMap).length && Object.keys(next).every((id) => accessMap[id] === next[id]);
    if (same) return;
    accessMap = { ...next };
    buildContent();
    requestRender();
  }

  /** Light, background and sky for the current style mode (no remount; callers rebuild content and request a render). */
  function applyEnvironment() {
    const presentation = styleMode === "presentation";
    sky.visible = presentation;
    if (presentation) {
      scene.background = new THREE.Color(PRESENTATION_ENVIRONMENT.skyHorizon);
      hemisphere.color.set(PRESENTATION_ENVIRONMENT.hemisphereSky);
      hemisphere.groundColor.set(PRESENTATION_ENVIRONMENT.hemisphereGround);
      hemisphere.intensity = PRESENTATION_ENVIRONMENT.hemisphereIntensity;
      sun.color.set(PRESENTATION_ENVIRONMENT.sunColor);
      sun.intensity = PRESENTATION_ENVIRONMENT.sunIntensity;
      ambient.intensity = 0;
    } else {
      scene.background = new THREE.Color(PALETTE.background);
      hemisphere.color.set(0xffffff);
      hemisphere.groundColor.set(0x8f8b82);
      hemisphere.intensity = 1.6;
      sun.color.set(0xffffff);
      sun.intensity = 1.4;
      ambient.intensity = 0.35;
    }
  }

  /** Switch between the "certainty" look (default) and the "presentation" look; swaps materials and environment, keeps the camera. */
  function setStyleMode(next) {
    const target = normalizeStyleMode(next);
    if (target === styleMode) return;
    styleMode = target;
    root.setAttribute("data-style-mode", styleMode);
    applyEnvironment();
    buildContent();
    applyMarkers();
    requestRender();
  }

  function setFraming(next) {
    framing = next === "all" ? "all" : "focus";
    root.setAttribute("data-framing", framing);
    if (mode === "overview") fitOverview();
    else pendingFit = true; // applied when the visitor returns to the overview
  }

  function setViewAngle(next) {
    viewAngle = next === "plan" ? "plan" : "oblique";
    root.setAttribute("data-view-angle", viewAngle);
    if (mode === "overview") fitOverview();
    else pendingFit = true;
  }

  let labelNote = null;
  /** Text appended to the in-canvas label of the selected piece (null clears it). The caller supplies the words. */
  function setLabelNote(text) {
    const next = typeof text === "string" && text ? text : null;
    if (next === labelNote) return;
    labelNote = next;
    requestRender();
  }

  function setSelected(ref) {
    if (!ref) selectedIds = new Set();
    else if (ref.refKind === "geometry") selectedIds = new Set(entries.has(ref.refId) ? [ref.refId] : []);
    else if (ref.refKind === "location") selectedIds = new Set(pieces.filter((piece) => piece.locationId === ref.refId).map((piece) => piece.id));
    else selectedIds = new Set();
    applySelection();
  }

  function focusFirst() {
    const button = list.querySelector("button");
    if (!button) return false;
    button.focus();
    return true;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("keydown", onKeyDown);
    canvas.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("blur", onBlur);
    list.removeEventListener("click", onListClick);
    list.removeEventListener("focusin", onListFocus);
    controls.removeEventListener("change", requestRender);
    controls.dispose();
    for (const entry of entries.values()) { removeOutline(entry, "outline"); removeOutline(entry, "focusOutline"); }
    disposeContent();
    markers.dispose();
    for (const material of [...Object.values(materials), ...Object.values(fills), ...Object.values(presFills), ...dashed.values(), ...presEdges.values()]) material.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    container.replaceChildren();
  }

  /** True when every corner of the framed bounds projects inside the canvas (M2-07 check; overview modes only). */
  function boundsInView() {
    const b = framing === "all" ? bounds : focusBounds;
    if (!b) return true;
    camera.updateMatrixWorld();
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      if (Math.abs(p.x) > 1.001 || Math.abs(p.y) > 1.001 || p.z > 1) return false;
    }
    return true;
  }

  function info() {
    return { mode, framing, viewAngle, styleMode, pixelRatio, boundsInView: boundsInView(), pieceCount: pieces.length, selected: [...selectedIds].sort(), focused: pieces[focusIndex]?.id ?? null,
      overlay: overlay.style.display === "block" ? overlay.textContent : null,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      columnBudget: budget,
      porticos: [...entries.values()].filter((entry) => entry.lod).map((entry) => ({ id: entry.piece.id, drawn: entry.lod.drawn, total: entry.lod.total, thinned: entry.lod.thinned })) };
  }

  applyEnvironment();
  resize();
  fitOverview();
  update(null);
  empty.style.display = "flex";
  publishCamera();
  return { update, setAccess, setSelected, setMode, getMode: () => mode, setFraming, getFraming: () => framing, setViewAngle, getViewAngle: () => viewAngle, flyTo, showOverview, setInsets, setShortLabels, setLabelNote, focusFirst, info, destroy, setStyleMode, getStyleMode: () => styleMode, setMarkers, clearMarkers };
}
