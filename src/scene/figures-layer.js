// Moving figures of the living layer (TASK-6-164, ADR-005 Decisions 2–3).
// WHO and HOW MANY come from markersAt() (src/simulation/markers.js) through the itineraries of the playback clock
// (src/simulation/clock.js); nothing is invented. Everything else here is ILLUSTRATION, labelled as such in the UI:
// positions inside a piece (layoutMarkers), walking routes (navgraph.js), walking speed, the walk cycle, the single generic
// "taking part" ring cue (no pose or gesture), figure shape and one neutral untinted surface tone (no garment is depicted). A figure performs an event only at that event's geometry
// piece; an event whose place has no piece draws no figure (ADR-004 D3), so the figure is hidden for that leg.
//
// Pure part (eventSpots, buildFigurePlan, figureStateAt): Node-testable. createFiguresLayer(THREE, …) is browser-only.
import { layoutMarkers, placementFor, roleTint } from "./markers-layer.js";
import { pointAlong, routeLength } from "./navgraph.js";

/** Illustrative walking speed (m per playback second) and the share of a leg's first slot a walk may use. */
export const WALK_SPEED = 3;
export const WALK_INTO_LEG = 0.5;
/** Fade (playback seconds) when a figure appears or leaves without walking. */
export const FADE = 0.6;
/** Beyond this distance (m) the arms are not drawn (LOD). */
export const ARM_LOD_DISTANCE = 70;
/** One neutral surface tone for every role: no garment, dress, cloth or skin tone is depicted (a mannequin grey). */
export const NEUTRAL_CLOTH = "#9c958a";
export const NEUTRAL_HEAD = "#857d72";

/** Order in which pieces of one location are preferred as the place where figures stand. */
const KIND_PREFERENCE = ["chamber", "court", "platform", "stair"]; // then any other kind; buildings last
const LAST_KINDS = new Set(["building", "barrier"]);

/** The piece of a location where its figures stand: preferred kind, then the largest footprint. Null when none. */
export function pieceForLocation(pieces, locationId) {
  const own = (pieces ?? []).filter((piece) => piece?.locationId === locationId && piece.box);
  if (!own.length) return null;
  const rank = (piece) => { const i = KIND_PREFERENCE.indexOf(piece.kind); return i >= 0 ? i : LAST_KINDS.has(piece.kind) ? KIND_PREFERENCE.length + 1 : KIND_PREFERENCE.length; };
  return [...own].sort((a, b) => rank(a) - rank(b) || b.box.sx * b.box.sz - a.box.sx * a.box.sz || (a.id < b.id ? -1 : 1))[0];
}

/** TASK-6-169 L-04: a raised or closed piece (a tall block, a ramp, a chamber inside a building) has no drawn surface to stand on. */
export const isRaised = (piece) => Boolean(piece?.box) && placementFor(piece.kind, piece.box) === "base";

/**
 * Display spots of one event's participants on `piece` (layoutMarkers): entityId → [{x,y,z}] (displayCount spots), plus the
 * group anchors (for the bubbles) and the piece centre the figures face. Null when the event has no piece.
 */
export function eventSpots(markers, piece) {
  if (!piece?.box || !markers?.length) return null;
  const layout = layoutMarkers(markers, piece.box, { kind: piece.kind });
  const spots = new Map();
  for (const figure of layout.figures) {
    const entityId = markers[figure.group]?.entityId;
    if (!entityId) continue;
    const list = spots.get(entityId) ?? [];
    list.push({ x: figure.x, y: figure.y, z: figure.z });
    spots.set(entityId, list);
  }
  return { spots, anchors: layout.groups.map((group) => ({ entityId: group.descriptor?.entityId ?? null, ...group.anchor })),
    centre: { x: piece.box.x, z: piece.box.z }, pieceId: piece.id, placement: layout.placement };
}

/**
 * Plan every figure's timeline from the clock's itineraries.
 * @param {{ itineraries: Map<string, {fromSlot,toSlot,eventId,locationId,roleId}[]>, secondsPerStep: number,
 *   spotsFor: (eventId) => ReturnType<eventSpots>|null, routeBetween: (from, to, roleId) => {x,y,z}[]|null,
 *   meta: (entityId) => { displayCount: number, unspecifiedGroup: boolean }, reduced?: boolean,
 *   noWalkInto?: (eventId) => boolean }} input
 * @returns {{ key, entityId, roleId, index, unspecifiedGroup, legs: { fromT, toT, eventId, spot|null, facing|null, approach|null }[] }[]}
 *   approach: { route, startT, endT } — the illustrative walk into the leg from the previous leg of the SAME entity.
 *
 * TASK-6-161 conditions: a figure is drawn only while its entity takes part in an active event or walks between two of its
 * own consecutive events (A-13: no idle bystanders); no walk into an event that references an alternative group (A-04:
 * a drawn route would pick a reading); a gap longer than GAP_WALK_FACTOR × the walk time is crossed by fading, not walking.
 */
export const GAP_WALK_FACTOR = 3;
export function buildFigurePlan({ itineraries, secondsPerStep, spotsFor, routeBetween, meta, reduced = false, noWalkInto = () => false }) {
  const figures = [];
  for (const [entityId, legs] of itineraries ?? []) {
    const info = meta(entityId) ?? { displayCount: 1, unspecifiedGroup: false };
    const count = Math.max(1, Math.floor(info.displayCount ?? 1));
    for (let index = 0; index < count; index += 1) {
      const planned = [];
      for (const leg of legs) {
        const placed = spotsFor(leg.eventId);
        const spot = placed?.spots.get(entityId)?.[index] ?? null;
        const facing = spot ? Math.atan2(-(placed.centre.x - spot.x), -(placed.centre.z - spot.z)) : null;
        planned.push({ fromT: leg.fromSlot * secondsPerStep, toT: leg.toSlot * secondsPerStep, eventId: leg.eventId, spot, facing, approach: null });
      }
      // A walk links two consecutive PLACED legs at different spots. After an unplaced leg the figure fades in instead:
      // walking through an unplaced event would put the figure somewhere the data does not say.
      for (let i = 1; i < planned.length; i += 1) {
        const previous = planned[i - 1];
        const leg = planned[i];
        if (reduced || !previous.spot || !leg.spot || noWalkInto(leg.eventId) || noWalkInto(previous.eventId)) continue;
        const distance = Math.hypot(leg.spot.x - previous.spot.x, leg.spot.z - previous.spot.z);
        if (distance < 0.05) continue;
        const route = routeBetween(previous.spot, leg.spot, legs[i].roleId);
        if (!route) continue; // no legal route: fade instead of walking through a forbidden or closed piece
        const natural = routeLength(route) / WALK_SPEED;
        const gap = Math.max(leg.fromT - previous.toT, 0);
        if (gap > natural * GAP_WALK_FACTOR) continue; // a long pause between its events: the figure is not drawn meanwhile
        // The walk fills the gap (slower when the gap is longer) and runs into the leg only when the gap is too short.
        const into = Math.min(Math.max(natural - gap, 0), (leg.toT - leg.fromT) * WALK_INTO_LEG);
        leg.approach = { route, startT: previous.toT, endT: leg.fromT + into };
      }
      figures.push({ key: `${entityId}#${index}`, entityId, roleId: legs[0]?.roleId ?? null, index, unspecifiedGroup: Boolean(info.unspecifiedGroup), legs: planned });
    }
  }
  return figures;
}

const HIDDEN = Object.freeze({ visible: false, scale: 0, x: 0, y: 0, z: 0, heading: 0, mode: "hidden", eventId: null, walked: 0 });

/**
 * State of one planned figure at playback time t (seconds).
 * @returns {{ visible, scale, x, y, z, heading, mode: "walk"|"perform"|"hidden", eventId, walked }}
 *   `walked` = metres walked on the current approach (drives the walk cycle). Fades happen INSIDE the event's own time.
 */
export function figureStateAt(figure, t, { reduced = false } = {}) {
  const legs = figure?.legs ?? [];
  const fade = (value) => (reduced ? 1 : Math.min(Math.max(value / FADE, 0), 1));
  const same = (a, b) => a?.spot && b?.spot && a.spot.x === b.spot.x && a.spot.z === b.spot.z;
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    const previous = legs[i - 1] ?? null;
    const next = legs[i + 1] ?? null;
    const approach = leg.approach;
    if (approach && t >= approach.startT && t < approach.endT && t < leg.toT) {
      const span = approach.endT - approach.startT;
      const p = span > 0 ? (t - approach.startT) / span : 1;
      const at = pointAlong(approach.route, p);
      return { visible: true, scale: 1, x: at.x, y: at.y, z: at.z, heading: at.heading, mode: "walk", eventId: leg.eventId, walked: p * routeLength(approach.route) };
    }
    if (t >= leg.fromT && t < leg.toT) {
      if (!leg.spot) return HIDDEN;
      const arrives = Boolean(approach) || (same(previous, leg) && previous.toT === leg.fromT);
      const leaves = Boolean(next?.approach) || (same(leg, next) && next.fromT === leg.toT);
      const scale = Math.min(arrives ? 1 : fade(t - leg.fromT), leaves ? 1 : fade(leg.toT - t));
      return scale > 0 ? { visible: true, scale, ...leg.spot, heading: leg.facing ?? 0, mode: "perform", eventId: leg.eventId, walked: 0 } : HIDDEN;
    }
  }
  return HIDDEN;
}

// ---------------------------------------------------------------------------------------------------------------------
// Browser layer. Cost: six instanced meshes (body, head, arms, role band, group disc, taking-part ring) = 6 draw calls for any count.

const BODY = Object.freeze({ height: 1.38, top: 0.16, bottom: 0.27 });
const HEAD = Object.freeze({ radius: 0.13, y: 1.52 });
const ARM = Object.freeze({ length: 0.6, radius: 0.045, shoulderX: 0.2, shoulderY: 1.3 });
const BAND = Object.freeze({ y: 0.82, height: 0.07 });

/**
 * createFiguresLayer(THREE, { parent, capacity }) → { setPlan(figures), update(t, camera, { reduced }), stats(), dispose() }
 * `update` returns the number of visible figures and records, per event, the visible figures' positions (for the bubbles).
 */
export function createFiguresLayer(THREE, { parent, capacity = 256 }) {
  const group = new THREE.Group();
  group.name = "figures";
  parent.add(group);
  const bodyGeometry = new THREE.CylinderGeometry(BODY.top, BODY.bottom, BODY.height, 8);
  bodyGeometry.translate(0, BODY.height / 2, 0);
  const headGeometry = new THREE.SphereGeometry(HEAD.radius, 10, 8);
  const armGeometry = new THREE.CylinderGeometry(ARM.radius, ARM.radius * 0.85, ARM.length, 5);
  armGeometry.translate(0, -ARM.length / 2, 0); // pivot at the shoulder
  const bandGeometry = new THREE.CylinderGeometry(BODY.top + (BODY.bottom - BODY.top) * 0.42 + 0.012, BODY.top + (BODY.bottom - BODY.top) * 0.42 + 0.018, BAND.height, 8);
  const discGeometry = new THREE.RingGeometry(0.75, 0.9, 28);
  discGeometry.rotateX(-Math.PI / 2);
  const cloth = new THREE.MeshStandardMaterial({ color: NEUTRAL_CLOTH, roughness: 0.92, metalness: 0 });
  const head = new THREE.MeshStandardMaterial({ color: NEUTRAL_HEAD, roughness: 0.9, metalness: 0 });
  const band = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  const make = (geometry, material, count) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const bodies = make(bodyGeometry, cloth, capacity);
  const heads = make(headGeometry, head, capacity);
  const arms = make(armGeometry, cloth, capacity * 2);
  const bands = make(bandGeometry, band, capacity);
  const discs = make(discGeometry, disc, capacity);
  const cueGeometry = new THREE.RingGeometry(0.34, 0.42, 24);
  cueGeometry.rotateX(-Math.PI / 2);
  const cue = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  const cues = make(cueGeometry, cue, capacity);
  let figures = [];
  let lastVisible = 0;
  let lastDrawn = [];
  let eventPositions = new Map();
  const base = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  const camPos = new THREE.Vector3();

  function setPlan(next) {
    figures = (next ?? []).slice(0, capacity);
    figures.forEach((figure, i) => {
      colour.set(roleTint(figure.roleId));
      bands.setColorAt(i, colour);
      discs.setColorAt(i, colour);
    });
    if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
    if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
  }

  function update(t, camera, { reduced = false } = {}) {
    if (camera) camPos.setFromMatrixPosition(camera.matrixWorld);
    let n = 0;
    let armCount = 0;
    let discCount = 0;
    let cueCount = 0;
    eventPositions = new Map();
    const drawn = new Set();
    for (const figure of figures) {
      const state = figureStateAt(figure, t, { reduced });
      if (!state.visible || state.scale <= 0) continue;
      drawn.add(figure.entityId);
      const s = state.scale;
      const bob = state.mode === "walk" && !reduced ? Math.abs(Math.sin(state.walked * 2.4)) * 0.035 : 0; // L-13: no motion while taking part
      rotation.setFromAxisAngle(yAxis, state.heading);
      position.set(state.x, state.y + bob, state.z);
      scale.set(s, s, s);
      base.compose(position, rotation, scale);
      bodies.setMatrixAt(n, base);
      part.makeTranslation(0, HEAD.y, 0);
      heads.setMatrixAt(n, out.multiplyMatrices(base, part));
      part.makeTranslation(0, BAND.y, 0);
      bands.setMatrixAt(n, out.multiplyMatrices(base, part));
      if (bands.instanceColor) { colour.set(roleTint(figure.roleId)); bands.setColorAt(n, colour); }
      const far = camera ? camPos.distanceTo(position) > ARM_LOD_DISTANCE : false;
      if (!far) {
        for (const side of [-1, 1]) {
          // Walk: arms swing in opposition. Otherwise they hang down: no pose or gesture is drawn for any act (TASK-6-161 A-05).
          const angle = state.mode === "walk" ? (reduced ? 0 : Math.sin(state.walked * 2.4) * 0.45 * side) : 0.05 * side;
          part.makeRotationX(angle);
          part.setPosition(side * ARM.shoulderX, ARM.shoulderY, 0);
          arms.setMatrixAt(armCount, out.multiplyMatrices(base, part));
          armCount += 1;
        }
      }
      if (state.mode === "perform") {
        // The "taking part" cue is non-anatomical: a ring at the feet, pulsing gently (static under reduced motion).
        const pulse = reduced ? 1 : 1 + Math.sin(t * 2.4 + n) * 0.12;
        part.makeScale(pulse, 1, pulse);
        part.setPosition(0, 0.02, 0);
        cues.setMatrixAt(cueCount, out.multiplyMatrices(base, part));
        if (cues.instanceColor) { colour.set(roleTint(figure.roleId)); cues.setColorAt(cueCount, colour); }
        cueCount += 1;
      }
      if (figure.unspecifiedGroup && state.mode === "perform" && figure.index === 0) {
        part.makeTranslation(0, 0.03, 0);
        discs.setMatrixAt(discCount, out.multiplyMatrices(base, part));
        if (discs.instanceColor) { colour.set(roleTint(figure.roleId)); discs.setColorAt(discCount, colour); }
        discCount += 1;
      }
      if ((state.mode === "perform" || state.mode === "walk") && state.eventId) {
        const list = eventPositions.get(state.eventId) ?? [];
        list.push({ x: state.x, y: state.y, z: state.z, entityId: figure.entityId, walking: state.mode === "walk" });
        eventPositions.set(state.eventId, list);
      }
      n += 1;
    }
    for (const [mesh, count] of [[bodies, n], [heads, n], [bands, n], [arms, armCount], [discs, discCount], [cues, cueCount]]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    lastVisible = n;
    lastDrawn = [...drawn].sort();
    return n;
  }

  return {
    setPlan,
    update,
    setVisible(on) { group.visible = Boolean(on); },
    /** Visible figures performing (or walking to) each event: event id → [{x,y,z,entityId,walking}] (last update). */
    eventPositions: () => eventPositions,
    /** Event ids with at least one figure performing at its spot (not walking). */
    performing: () => [...eventPositions.entries()].filter(([, list]) => list.some((p) => !p.walking)).map(([id]) => id),
    stats: () => ({ planned: figures.length, visible: lastVisible, drawCalls: 6 }),
    /** Entity ids drawn at the last update (the e2e/unit invariant: active participants ∪ walkers). */
    drawnEntities: () => lastDrawn,
    dispose() {
      parent.remove(group);
      for (const mesh of [bodies, heads, arms, bands, discs, cues]) mesh.dispose();
      for (const geometry of [bodyGeometry, headGeometry, armGeometry, bandGeometry, discGeometry, cueGeometry]) geometry.dispose();
      for (const material of [cloth, head, band, disc, cue]) material.dispose();
    }
  };
}
