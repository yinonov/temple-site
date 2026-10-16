// The JS side of the courtyard's life effects (flame, smoke, cloth, dust, birds), kept free of three.js so a test can hold it
// to the render rules: everything is a closed-form function of the instant and a seed, never of the frame count or the wall
// clock, and the same instant gives the same effect to every visitor.
//
// Shaders take `clock`: the instant's seconds wrapped to a minute in double precision here (raw epoch seconds, about 1.8e9,
// would lose all their fractions in a float32 shader). Every periodic term in a shader runs a whole number of cycles per
// minute (or its period divides 60 s), so the wrap at the minute is invisible.

export const WRAP = 60; // seconds

/** The instant (ms, UTC) as seconds within its minute, in double precision. */
export const lifeClock = (tMs) => (((tMs / 1000) % WRAP) + WRAP) % WRAP;

const TAU = Math.PI * 2;

/**
 * What each tier draws (data-model.md: lifeEffects). `all`: everything. `reduced`: dust halved, no lamp lights, thinner smoke
 * and fewer birds. `minimal`: flame and cloth only.
 */
export const LIFE_LEVELS = {
  all: { lampLight: true, smokePerLamp: 5, dust: 320, birds: 7, cloth: true },
  reduced: { lampLight: false, smokePerLamp: 3, dust: 160, birds: 4, cloth: true },
  minimal: { lampLight: false, smokePerLamp: 0, dust: 0, birds: 0, cloth: true },
};
export const lifeAmounts = (level, calm = false) => {
  const a = { ...(LIFE_LEVELS[level] ?? LIFE_LEVELS.minimal) };
  if (calm) a.birds = Math.ceil(a.birds / 2); // fewer things crossing the sky for a visitor who asked for calm
  return a;
};

/** Under `prefers-reduced-motion` flicker and sway keep this fraction of their size. */
export const CALM_AMPLITUDE = 0.1;
export const amplitude = (calm) => (calm ? CALM_AMPLITUDE : 1);

/**
 * A flame's brightness, 0 to 1 around 0.5: three sines at whole cycles per minute (1.6, 2.4 and 3.5 Hz), each shifted by the
 * emitter's seed. The same expression is in the flame shader (life.js); `calm` shrinks the swing, not the mean.
 */
export function flameFlicker(clock, seed, calm = false) {
  const s = (seed % 1000) / 1000;
  const swing = 0.2 * Math.sin(TAU * (97 * clock) / WRAP + s * TAU) + 0.12 * Math.sin(TAU * (143 * clock) / WRAP + s * 12.9) + 0.08 * Math.sin(TAU * (211 * clock) / WRAP + s * 4.1);
  return 0.6 + swing * amplitude(calm);
}

/** How far the cloth swings, in metres at its hem: more with the wind, almost none when calm. */
export const swayAmount = (wind, calm = false) => (0.1 + 0.4 * Math.min(1, Math.max(0, wind))) * amplitude(calm);

/**
 * A bird's loop over the court, from the emitter's seed and its own number: a closed ellipse, a whole number of laps per
 * minute (2 to 4), its own radii, height and phase. The shader gets these as per-bird attributes and runs `birdAt`'s formula.
 */
export function birdLoop(i, seed) {
  const k = (n) => { let h = Math.imul(seed ^ 0x9e3779b9, 2654435761) ^ Math.imul(i * 977 + n * 131 + 1, 2246822519); h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const r = 9 + k(3) * 11;
  return { laps: 2 + Math.floor(k(1) * 3), phase: k(2), r, rz: r * (0.6 + 0.3 * k(4)), dy: (k(6) - 0.5) * 8, risePhase: k(5) };
}

/** A bird's place and heading at `clock` on its loop around `center`: { x, y, z, heading }. */
export function birdAt(clock, loop, center) {
  const a = TAU * (loop.laps * clock / WRAP + loop.phase), rise = TAU * (3 * clock / WRAP + loop.risePhase);
  return {
    x: center[0] + Math.cos(a) * loop.r, y: center[1] + loop.dy + Math.sin(rise) * 1.5, z: center[2] + Math.sin(a) * loop.rz,
    heading: Math.atan2(Math.cos(a) * loop.rz, -Math.sin(a) * loop.r), // along the tangent
  };
}
