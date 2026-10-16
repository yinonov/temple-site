// The far figure's pose, as numbers (no three.js, so a test can hold it to the render rules): which clip, how far into it, and
// the short blend from the clip before. Everything follows from the instant and the person (the walk phase follows the distance
// walked, as the rigs' does, through walk-phase.js). The shader reads a row of the baked animation texture from these.
import { stepWalk } from "./walk-phase.js";

export const CLIP_BLEND = 0.25; // seconds, as the rigs'
export const GROUND_SPEED = 1.15; // m/s: the pace of everyone who is walking (world/schedule.js WALK)
const frac = (x) => ((x % 1) + 1) % 1;

/** How far through `clip` the person is, 0 to 1 (not including 1). `st.walkT` is their walk time; `variant` the seeded rate and phase. */
export function clipFraction(clip, { seconds, variant, walkT, meta }) {
  const dur = meta[clip].duration;
  if (clip === "walk" || clip === "carry") return frac(walkT / dur);
  return frac(seconds * variant.rate / dur + variant.phase);
}

/**
 * Advance one person's far state by `dt` seconds. `st` is { clip, prev, blend, walkT } (created by `newFarState`); `want` the
 * clip the pose calls for; `moving` whether they are walking. Returns `st`.
 */
export function stepFar(st, { want, moving, build, meta, dt }) {
  if (want !== st.clip) { st.prev = st.clip; st.clip = want; st.blend = 1; }
  st.blend = Math.max(0, st.blend - dt / CLIP_BLEND);
  st.walkT = stepWalk(st.walkT, { want, moving, speed: moving ? GROUND_SPEED : 0, build, meta: meta[want], dt });
  return st;
}
export const newFarState = (clip, walkT = 0) => ({ clip, prev: clip, blend: 0, walkT });

/** The two rows to read for a clip at `fraction`: { row0, count, f } with f the position in rows (0 to count). */
export const clipRows = (rows, clip, fraction) => ({ row0: rows[clip].row, count: rows[clip].count, f: fraction * rows[clip].count });

/** Per-instance numbers for the shader: the current clip, the one before it and how much of the before is still in the blend. */
export function instanceNumbers(st, ctx) {
  const a = clipFraction(st.clip, { ...ctx, walkT: st.walkT }), b = clipFraction(st.prev, { ...ctx, walkT: st.walkT });
  const A = clipRows(ctx.rows, st.clip, a), B = clipRows(ctx.rows, st.prev, b);
  return { a: [A.row0, A.count, a], b: [B.row0, B.count, b], w: st.blend };
}
