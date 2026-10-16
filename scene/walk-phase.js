// Where a person is in their walk cycle. Walking and carrying advance with the distance covered, at the rate that matches the
// clip's travel speed to the speed on the ground (so that feet do not slide); standing with a load holds the carry clip at the
// moment the legs pass each other. The rigs (figures.js) and the far figures (far-crowd.js) use this one function, so that a
// person handed from one to the other carries on from the same step. Pure.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * `meta`: { duration, speed } of the clip being played (`want`: "walk", "carry", or any other). `speed` is the ground speed in
 * m/s, `build` the body's stride scale. Returns the new walk time in seconds.
 */
export function stepWalk(walkT, { want, moving, speed, build, meta, dt }) {
  const dur = meta?.duration || 1;
  if (want === "carry" && !moving) return walkT + ((Math.round(walkT / dur - 0.25) + 0.25) * dur - walkT) * Math.min(1, dt * 6); // a quarter of the way round, in whole cycles
  if (want === "walk" || want === "carry") return walkT + dt * clamp(speed / ((meta.speed || 1) * build), 0.35, 1.6);
  return walkT;
}
