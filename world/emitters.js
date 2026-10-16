// The courtyard's emitters, as data: the things that burn, smoke, drift, fly or sound at a place (data-model.md, Emitter).
// One list serves the eye and the ear: scene/life.js draws the `flame`, `smoke`, `dust` and `bird` kinds, audio.js sounds the
// `sound` ones. Each has a place, a seed (per-emitter phase) and `activeWhen`, a function of the sky and calendar that returns
// how strongly it is on (0 off, 1 full), so the same instant gives the same courtyard to every visitor. Everything here is
// imagination (the title screen says so once): no emitter states a fact, so none carries a fact id.
// Distance is handled in one place only: the listener's panners (audio.js) attenuate the `sound` emitters by their
// `refDistance` and `rolloff`; `level` here never includes distance.
import { dayKey } from "./sky.js";
import { hash } from "./schedule.js";
import { F } from "./places.js";
import { COURTYARD } from "../scene/courtyard.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const seedOf = (id) => Math.floor(hash("emitter", id) * 1e6);
const WINTER = new Set([8, 9, 10, 11, 12, 13]);

/**
 * The wind at the visitor's height: calm at night and dawn, rising through the afternoon, rougher in winter; each day has its
 * own temper. (Moved here from soundscape.js so that the cloth and the wind's sound agree.)
 */
export function windLevel(world, y = 0) {
  const { time, calendar: cal } = world;
  const day = time.part === "day";
  const hourly = day ? 0.22 + 0.3 * clamp((time.hour - 3) / 6) - 0.12 * clamp((2 - time.hour) / 2) : 0.18;
  return clamp(hourly * (WINTER.has(cal.month) ? 1.35 : 1) * (0.75 + 0.5 * hash(dayKey(world.t), "wind")) * (y > 10 ? 1.25 : 1));
}

/** What `activeWhen` reads: the sky and calendar at an instant (never the wall clock). */
export function contextOf(world, y = 0) {
  const { env, time, calendar: cal } = world;
  return { dawn: env.dawn, sunDeg: env.sun, lit: sstep(0.2, 2.4, env.sun), day: time.part === "day", hour: time.hour, month: cal.month, holy: cal.holy, hush: env.hush === 1, embers: env.embers, wind: windLevel(world, y) };
}

// Lamps burn from the night through the dawn, and are put out as the sun gets well up (the same time the torches burn to).
const lampLit = (c) => 1 - sstep(0.6, 0.9, c.dawn);
// Birds are dawn-biased: loudest as the sky pales, fewer through the day, none in the dark.
const birdsOn = (c) => sstep(0.15, 0.45, c.dawn) * (c.day ? 1 - 0.7 * sstep(0.4, 3, c.hour) : 1);
// Dust shows in a low sun's shaft; at noon the light is flat and it is hardly seen.
const dustOn = (c) => c.lit * (1 - 0.7 * sstep(20, 60, c.sunDeg));

const lamps = COURTYARD.dressing.filter((d) => d.prop === "lamp-stand");
const banners = COURTYARD.dressing.filter((d) => d.prop === "banner");
const flameAt = ([x, z]) => [x, F + 1.66, z]; // the top of a lamp stand's bowl (1.6 m, build_dressing.py)

/** @type {Array<{ id: string, kind: "sound" | "flame" | "smoke" | "dust" | "bird", at: number[], seed: number, activeWhen: (c: object) => number, voice?: string, gain?: number, refDistance?: number, rolloff?: number }>} */
export const EMITTERS = [
  ...lamps.flatMap((d, i) => [
    { id: `lamp-flame-${i + 1}`, kind: "flame", at: flameAt(d.at), seed: seedOf(`lamp-flame-${i + 1}`), activeWhen: lampLit },
    { id: `lamp-smoke-${i + 1}`, kind: "smoke", at: flameAt(d.at), seed: seedOf(`lamp-smoke-${i + 1}`), activeWhen: lampLit },
  ]),
  // A haze of dust turning in the low sun, over the middle of the court (it follows the eye in life.js; this is its centre of gravity).
  { id: "dust-shaft", kind: "dust", at: [-8, F + 3, -36], seed: seedOf("dust-shaft"), activeWhen: dustOn },
  // A small flock over the court, circling high.
  { id: "dawn-flock", kind: "bird", at: [-16, F + 22, -40], seed: seedOf("dawn-flock"), activeWhen: birdsOn },
  // What the ear gets (synthesised in audio.js, voice by voice).
  { id: "laver-water", kind: "sound", voice: "water", at: [-22.5, F + 0.9, -36], seed: seedOf("laver-water"), gain: 0.55, refDistance: 2.5, rolloff: 1.5, activeWhen: () => 1 },
  ...banners.map((d, i) => ({ id: `cloth-wind-${i + 1}`, kind: "sound", voice: "cloth", at: [d.at[0], F + 2.6, d.at[1]], seed: seedOf(`cloth-wind-${i + 1}`), gain: 0.5, refDistance: 3, rolloff: 1.3, activeWhen: (c) => clamp(c.wind * 2.2) })),
  { id: "birds-sw", kind: "sound", voice: "birds", at: [-33.5, F + 9, -22], seed: seedOf("birds-sw"), gain: 0.5, refDistance: 6, rolloff: 1.1, activeWhen: birdsOn },
  { id: "birds-se", kind: "sound", voice: "birds", at: [0.5, F + 9, -17], seed: seedOf("birds-se"), gain: 0.5, refDistance: 6, rolloff: 1.1, activeWhen: birdsOn },
];

// People at work (the ash raked, wood carried, lamps trimmed) and at prayer give sound where they stand; which two are
// heard is whoever is nearest the visitor (ties broken by id, so every client agrees).
export const WORK_POSES = new Set(["rake", "carry", "trim", "push", "wash"]);
export const PRAYER_POSES = new Set(["raise", "bow"]);
export const DYNAMIC_SLOTS = 2;
export const DYNAMIC = {
  work: { voice: "work", gain: 0.6, refDistance: 3, rolloff: 1.4, seedBase: seedOf("work") },
  murmur: { voice: "murmur", gain: 0.5, refDistance: 3, rolloff: 1.2, seedBase: seedOf("murmur") },
};
