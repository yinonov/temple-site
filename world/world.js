// The world at an instant: the sky, the calendar, everyone on the Mount, what is said and heard, and what is going
// on. This is the only thing the scene, the sound and the page read. It is a pure function of the instant.
import { sunPosition, solarDay, dayKey, seasonalTime } from "./sky.js";
import { calendarAt } from "./calendar.js";
import { CAST } from "./cast.js";
import { compileDay, personAt } from "./schedule.js";
import { ROUTINES } from "./routines.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sstep = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };

/** Lighting inputs derived from the real sun: `dawn` 0 (night) to 1 (full day), the sun's altitude and azimuth. */
export function lightAt(t) {
  const { altitude, azimuth } = sunPosition(t);
  return { dawn: sstep(-18, 8, altitude), sun: altitude, azimuth };
}

/** Whether the great gate stands open, from the day's marks (opened at sunrise, shut at sunset). */
function gateAt(t, day) {
  let open = 0;
  for (const m of day.marks) {
    if (m.t > t) break;
    if (m.name === "gateOpen") open = clamp((t - m.t) / 8000);
    if (m.name === "gateClose") open = 1 - clamp((t - m.t) / 8000);
  }
  return open;
}

export function worldAt(t) {
  const key = dayKey(t);
  const day = compileDay(key);
  const sun = solarDay(key);
  const light = lightAt(t);
  const calendar = calendarAt(t);
  const people = {};
  for (const c of CAST) people[c.id] = personAt(c.id, t);
  const routines = day.active.filter((r) => r.start <= t && t < r.end);
  // The fire flares when the ashes have just been cleared.
  const cleared = day.sounds.find((s) => s.id === "embers" && s.t <= t && t - s.t < 600000);
  const wheel = day.sounds.some((s) => s.id === "wheel" && s.t <= t && t - s.t < 6000) ? 1 : 0;
  // When the great gate last opened (its sound is what carries to Jericho).
  const opened = day.marks.filter((m) => m.name === "gateOpen" && m.t <= t).at(-1)?.t ?? null;
  return {
    t,
    gateOpenedAt: opened,
    sun,
    light,
    time: seasonalTime(t),
    calendar,
    people,
    routines,
    // What the festivals change in the scene: willows at the altar on Sukkot, the lamp stands up from its second day
    // and lit on the nights of the water-drawing, Chanukah lamps at night.
    festive: {
      willows: calendar.festivals.some((f) => f.id === "sukkot"),
      stands: calendar.month === 7 && calendar.day >= 16 && calendar.day <= 21,
      lit: routines.some((r) => r.id === "water-drawing"),
      chanukah: routines.some((r) => r.id === "chanukah-day") && light.dawn < 0.55,
    },
    env: { dawn: light.dawn, sun: light.sun, azimuth: light.azimuth, embers: cleared ? 1 : 0.55, wheel, gate: gateAt(t, day), reach: 0, smell: 0, hush: light.dawn < 0.3 || calendar.festivals.some((f) => f.id === "yom-kippur") ? 1 : 0.3, zoom: 1 },
  };
}

/** Sounds that start in (a, b]. */
export function soundsBetween(a, b) {
  const out = new Map();
  for (const key of new Set([dayKey(a), dayKey(b)])) for (const s of compileDay(key).sounds) if (s.t > a && s.t <= b) out.set(`${s.t}:${s.id}:${s.who}`, s);
  return [...out.values()];
}

// Where a visitor can be set down when nothing running has a view of its own: places from which the court or the
// Mount can be seen. Each is { eye: [x, z], look: [x, z] }.
const VANTAGES = [
  { eye: [-2, -24], look: [-11, -40] }, // the court's south, toward the altar
  { eye: [4, -58], look: [-20, -46.8] }, // the court's north, toward the porch
  { eye: [20, -28], look: [40, -46.8] }, // the women's court from the south west, toward where people gather
  { eye: [22, -62], look: [40, -46.8] }, // the women's court from the north
  { eye: [0, 50], look: [0, 70] }, // the outer court, south
  { eye: [40, 60], look: [0, 70] }, // the outer court, south east
  { eye: [72, 20], look: [95, 20] }, // the outer court, east
  { eye: [-72, 30], look: [-95, 30] }, // the outer court, west
];
const yawOf = ([ex, ez], [lx, lz]) => Math.atan2(-(lx - ex), -(lz - ez));

/** How much life a vantage looks at: people within 4-35 m and 40 degrees of where it faces (moving ones count more). */
function lifeFrom(v, people) {
  const yaw = yawOf(v.eye, v.look);
  let n = 0;
  for (const p of Object.values(people)) {
    if (!p.visible) continue;
    const dx = p.pos[0] - v.eye[0], dz = p.pos[2] - v.eye[1], d = Math.hypot(dx, dz);
    if (d < 4 || d > 35) continue;
    const off = Math.atan2(Math.sin(Math.atan2(-dx, -dz) - yaw), Math.cos(Math.atan2(-dx, -dz) - yaw));
    if (Math.abs(off) < 0.7) n += p.moving ? 1.5 : 1;
  }
  return n;
}

/**
 * Where to set down a visitor arriving at t: facing the most recently begun routine that has a view, or else the
 * vantage that looks at the most life right now. A pure function of the instant, so everyone arrives at the same view.
 */
export function arrivalAt(t) {
  const w = worldAt(t);
  const running = w.routines.filter((r) => ROUTINES.find((x) => x.id === r.id)?.view).sort((a, b) => b.start - a.start);
  // What is going on has a bonus (it is what the visitor came for), but not over a crowd it cannot see.
  const options = VANTAGES.map((v) => ({ v, score: lifeFrom(v, w.people) }));
  if (running.length) { const v = ROUTINES.find((x) => x.id === running[0].id).view; options.push({ v, score: lifeFrom(v, w.people) + 3 }); }
  const view = options.reduce((best, c) => (c.score > best.score ? c : best)).v;
  const [ex, ez] = view.eye;
  return { x: ex, z: ez, yaw: yawOf(view.eye, view.look) };
}
