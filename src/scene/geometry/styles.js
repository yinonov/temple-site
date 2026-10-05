// Certainty styling for the 3D view (TASK-6-18, revised by TASK-6-24 for review findings 3D-07/3D-11; ADR-003 D2;
// docs/scene/3d-architecture.md §5). Pure data, no rendering library: the UI may import LEGEND_3D without loading
// Three.js, and the renderer maps each solved piece through pieceStyle().
//
// Two independent channels, so a sourced plan stays visible even when the piece as a whole is speculative:
// - FILL encodes the SIZE basis, per face: top/bottom faces = the plan (length × width/thickness); side faces = the
//   weaker of plan and height. sourced → plain opaque; alternative → opaque with a dot pattern; speculative →
//   translucent with a diagonal hatch. Patterns are drawn in screen space (constant pixel size at any distance).
// - OUTLINE encodes the PLACEMENT basis: solid = position stated by a source (or the chosen reading); dashed = not
//   stated (a completion, a solver default, or the diagram origin of a root piece).
// Colour never encodes certainty alone.

/** Neutral palette (no material, era or time-of-day claim). Numbers are 0xRRGGBB. */
export const PALETTE = Object.freeze({
  background: 0xe9e7e2,
  ground: 0xd6d3cc,
  fill: 0xc9c3b6,
  edge: 0x2f2d29,
  selected: 0x1f5fbf,
  focus: 0x1f5fbf
});

/**
 * Depth handling (TASK-6-26, review N-07). Fills use a small polygon offset so edge lines stay visible; the unlabelled
 * ground plane is pushed back much further and sits GROUND_GAP_FRACTION of the scene below the lowest piece, so it
 * can never win the depth test against a piece's face (on distant, grazing faces the slope-scaled fill offset used to
 * push the Mount's dotted top behind a ground only ~1 m below it, and the face read as plain = "sourced").
 */
export const FILL_POLYGON_OFFSET = Object.freeze({ factor: 1, units: 1 });
export const GROUND_POLYGON_OFFSET = Object.freeze({ factor: 8, units: 64 });
export const GROUND_GAP_FRACTION = 0.01;
export const GROUND_GAP_MIN_METRES = 0.5;
/** y of the ground plane for scene bounds ({ minY }) and the scene's largest extent (metres). */
export function groundLevel(bounds, extent) {
  return bounds.minY - Math.max(extent * GROUND_GAP_FRACTION, GROUND_GAP_MIN_METRES);
}

/** Fill per size style. `pattern` is drawn in screen space; `patternPx` is its period in CSS pixels. */
export const SIZE_STYLES = Object.freeze({
  sourced: Object.freeze({ fill: "solid", opacity: 1, pattern: "none", patternPx: 0 }),
  alternative: Object.freeze({ fill: "solid", opacity: 1, pattern: "dots", patternPx: 7 }),
  speculative: Object.freeze({ fill: "translucent", opacity: 0.4, pattern: "hatch", patternPx: 9 })
});

/** Outline per placement key. */
export const PLACEMENT_STYLES = Object.freeze({
  stated: Object.freeze({ edge: "solid" }),
  completion: Object.freeze({ edge: "dashed" }),
  origin: Object.freeze({ edge: "dashed" })
});

/**
 * Legend entries in display order. `key` is the strings key the UI provides (`strings.legend[key]`); `channel`
 * says which visual channel it explains; `swatch` describes a matching sample.
 */
export const LEGEND_3D = Object.freeze([
  Object.freeze({ key: "sizeSourced", channel: "size", style: "sourced", swatch: Object.freeze({ fill: "solid", pattern: "none", edge: "none" }) }),
  Object.freeze({ key: "sizeAlternative", channel: "size", style: "alternative", swatch: Object.freeze({ fill: "solid", pattern: "dots", edge: "none" }) }),
  Object.freeze({ key: "sizeSpeculative", channel: "size", style: "speculative", swatch: Object.freeze({ fill: "translucent", pattern: "hatch", edge: "none" }) }),
  Object.freeze({ key: "placementStated", channel: "placement", style: "stated", swatch: Object.freeze({ fill: "none", pattern: "none", edge: "solid" }) }),
  Object.freeze({ key: "placementCompletion", channel: "placement", style: "completion", swatch: Object.freeze({ fill: "none", pattern: "none", edge: "dashed" }) })
]);

const sizeKey = (style) => (SIZE_STYLES[style] ? style : "speculative");
const RANK = { sourced: 0, alternative: 1, speculative: 2 };
const weaker = (a, b) => (RANK[sizeKey(a)] >= RANK[sizeKey(b)] ? sizeKey(a) : sizeKey(b));

/** Placement key: "stated" (sourced/alternative), "origin" (a root), else "completion". */
export function placementKey(placementStyle) {
  if (placementStyle === "sourced" || placementStyle === "alternative") return "stated";
  if (placementStyle === "origin") return "origin";
  return "completion";
}

/**
 * Drawing parameters for one solved piece (unknown styles fail towards speculative / completion).
 * @returns {{ top: string, side: string, topFill: object, sideFill: object, placement: string, edge: string }}
 */
export function pieceStyle(piece) {
  const top = sizeKey(piece?.footprintStyle ?? piece?.sizeStyle ?? piece?.certaintyStyle);
  const side = weaker(top, piece?.heightStyle ?? piece?.sizeStyle ?? piece?.certaintyStyle);
  const placement = placementKey(piece?.placementStyle);
  return { top, side, topFill: SIZE_STYLES[top], sideFill: SIZE_STYLES[side], placement, edge: PLACEMENT_STYLES[placement].edge };
}

/** Which legend rows a solved scene uses. */
export function legendPresence(pieces) {
  const present = new Set();
  for (const piece of Array.isArray(pieces) ? pieces : []) {
    const style = pieceStyle(piece);
    present.add(`size:${style.top}`).add(`size:${style.side}`).add(`placement:${style.placement === "origin" ? "completion" : style.placement}`);
  }
  return LEGEND_3D.map((entry) => ({ key: entry.key, present: present.has(`${entry.channel}:${entry.style}`) }));
}

// ---------- Presentation style (TASK-6-56; ADR-004 Decision 1-2) ----------
// A second look for presentation mode: neutral stone tones that vary by piece KIND only (no gold, no marble, no
// colour claimed for a material), procedural variation in the shader, a vertical-gradient sky and a fixed hemisphere +
// directional light. The certainty contract stays: the basis of each piece is carried by the EDGE PATTERN (solid /
// dotted / dashed) and by opacity, never by colour alone. `certainty` (above) remains the default look.

export const STYLE_MODES = Object.freeze(["certainty", "presentation"]);
export const normalizeStyleMode = (mode) => (mode === "presentation" ? "presentation" : "certainty");

/** Per overall basis (piece.certaintyStyle): opacity, edge pattern and how far the kind tone is lightened (0..1). */
export const PRESENTATION_STYLES = Object.freeze({
  sourced: Object.freeze({ opacity: 1, edge: "solid", lighten: 0, edgeColor: 0x2b2822 }),
  alternative: Object.freeze({ opacity: 1, edge: "dotted", lighten: 0, edgeColor: 0x3a342b }),
  speculative: Object.freeze({ opacity: 0.7, edge: "dashed", lighten: 0.2, edgeColor: 0x4d463b })
});

/** Neutral limestone-like tones per piece kind: illustration only (the UI shows a persistent "appearance is illustration" chip). */
export const PRESENTATION_TONES = Object.freeze({
  platform: 0xcdc3b0, court: 0xd9d0be, gate: 0xc3b69f, chamber: 0xc8bba4, structure: 0xc1b399, building: 0xc6b89e,
  portico: 0xd2c7b1, barrier: 0xbdb099, wall: 0xbdb099, stair: 0xcfc4ad
});
export const PRESENTATION_DEFAULT_TONE = 0xc8bda6;
export const PRESENTATION_LIGHTEN_TARGET = 0xf3eee3;

/** Environment colours (0xRRGGBB): sky gradient (no sun disc), ground, contact shade and horizon haze. */
export const PRESENTATION_ENVIRONMENT = Object.freeze({
  skyZenith: 0x7ea3cb, skyHorizon: 0xdddbd6, groundNear: 0x9d9686, groundFar: 0xdddbd6, contactShade: 0x5a5448,
  hemisphereSky: 0xe3ebf4, hemisphereGround: 0x9a8f7c, hemisphereIntensity: 1.0, sunColor: 0xfff3e0, sunIntensity: 2.3
});

/** The three presentation legend rows (the UI supplies strings.legend[key]); each differs by edge and opacity, not only colour. */
export const LEGEND_PRESENTATION = Object.freeze([
  Object.freeze({ key: "presentationSourced", style: "sourced", swatch: Object.freeze({ opacity: 1, edge: "solid" }) }),
  Object.freeze({ key: "presentationAlternative", style: "alternative", swatch: Object.freeze({ opacity: 1, edge: "dotted" }) }),
  Object.freeze({ key: "presentationSpeculative", style: "speculative", swatch: Object.freeze({ opacity: 0.7, edge: "dashed" }) })
]);

const presentationBasis = (piece) => {
  const key = piece?.certaintyStyle ?? pieceStyle(piece).side;
  return PRESENTATION_STYLES[key] ? key : "speculative";
};

/** Blend two 0xRRGGBB colours (t = share of b). */
export function mixHex(a, b, t) {
  const k = Math.min(Math.max(t, 0), 1);
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Stone tone for a kind and basis (speculative is lighter). */
export function presentationTone(kind, basis) {
  const base = PRESENTATION_TONES[kind] ?? PRESENTATION_DEFAULT_TONE;
  const style = PRESENTATION_STYLES[basis] ?? PRESENTATION_STYLES.speculative;
  return mixHex(base, PRESENTATION_LIGHTEN_TARGET, style.lighten);
}

/** Drawing parameters for one solved piece in the presentation style (unknown basis fails towards speculative). */
export function presentationStyle(piece) {
  const basis = presentationBasis(piece);
  const style = PRESENTATION_STYLES[basis];
  return { basis, tone: presentationTone(piece?.kind, basis), opacity: style.opacity, edge: style.edge, edgeColor: style.edgeColor };
}

/** Which presentation legend rows a scene uses. */
export function presentationLegendPresence(pieces) {
  const present = new Set((Array.isArray(pieces) ? pieces : []).map((piece) => presentationBasis(piece)));
  return LEGEND_PRESENTATION.map((entry) => ({ key: entry.key, present: present.has(entry.style) }));
}
