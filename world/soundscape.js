// What the visitor hears at an instant, standing where they stand: wind, fire, the crowd, footsteps, animals, birds
// and the city beyond the walls. Like the world, it is a pure function of the instant (and the listener's spot):
// every bed and every call is seeded from the day, so two visitors at the same moment hear the same Mount.
// `app/audio.js` only renders it. All of it is imagination: no sound here states a fact, so none carries a fact id.
import { dayKey, solarDay, atHour } from "./sky.js";
import { compileDay, hash } from "./schedule.js";
import { CAST_BY_ID } from "./cast.js";
import { zoneOf, LAMP_STANDS, ALTAR } from "./places.js";
import { BEAT, SECTION, REST } from "./song.js";

const MIN = 60000;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const near = (d, ref) => clamp(ref / Math.max(ref, d)); // 1 within `ref` metres, then falling off as 1/d
const dist = (a, me) => Math.hypot(a[0] - me.x, a[2] - me.z);

// Where the unseen things are. The pens are beyond the north wall and never in the court; the doves nest in the
// colonnades; swifts wheel over the Sanctuary roof; jackals cry from the Mount of Olives; the city lies to the west.
const PENS = [[-40, 2, -150], [35, 2, -146]];
const DOVES = [[-60, 12, 113], [60, 12, 113], [113, 12, -40], [-113, 12, 40]];
const ROOF = [[-50, 46, -40], [-36, 50, -54], [-46, 44, -58]]; // over the Sanctuary, never over the Holy of Holies
const OLIVES = [[520, 60, -120], [480, 50, 90]];
export const CITY = [-420, 20, 160];
export const SITES = [...PENS, ...DOVES, ...ROOF, ...OLIVES, CITY];

/** Months of the Hebrew year when the swifts are here (Adar to Tammuz) and when the crickets sing (Iyar to Tishrei). */
const SWIFTS = new Set([12, 13, 1, 2, 3, 4]);
const CRICKETS = new Set([2, 3, 4, 5, 6, 7]);
const WINTER = new Set([8, 9, 10, 11, 12, 13]);

/**
 * When the animals are still: through the morning offering and the afternoon one (an hour before to well after), all
 * morning on Shabbat and festival days, from midday on the eve of Pesach, and on Yom Kippur. No call is ever timed to
 * the slaughter.
 */
export function animalsStill(t, cal) {
  if (cal.festivals.some((f) => f.id === "yom-kippur")) return true;
  const key = dayKey(t), day = solarDay(key);
  if (cal.month === 1 && cal.day === 14 && t >= atHour(day, 5)) return true;
  // The day's own instances (a compiled day also holds the evening before and the morning after).
  const active = compileDay(key).active.filter((r) => r.start >= day.dawn - 3 * 3600000 && r.start < day.sunset);
  const morning = active.find((r) => r.id === "morning-service")?.start ?? day.sunrise;
  const festive = cal.holy || cal.festivals.length > 0;
  if (t >= day.dawn && t < (festive ? atHour(day, 6) : morning + 110 * MIN)) return true;
  const afternoon = active.find((r) => r.id.startsWith("afternoon"))?.start;
  return afternoon !== undefined && t >= afternoon - 75 * MIN && t < afternoon + 40 * MIN;
}

/**
 * The calls of animals, birds and the city, as data. Each has sites, a slot length in seconds and a chance per slot
 * and site; `ground` marks beasts (never heard from the court); `when` says whether it can be heard at all; `ref` is
 * how near (metres) it is at full level.
 */
export const CALLS = [
  { id: "bleat", ground: true, sites: PENS, every: 9, chance: 0.3, level: 0.55, ref: 25, when: (c) => !c.still && !c.hush },
  // The ox lows on its way up with the first fruits, out on the Mount (it only walks on Shavuot morning).
  { id: "low", ground: true, sites: "ox", every: 12, chance: 0.35, level: 0.8, ref: 10, when: () => true },
  { id: "coo", sites: DOVES, every: 7, chance: 0.25, level: 0.5, ref: 18, when: (c) => c.day && c.hour > 0.3 && c.hour < 11.5 },
  { id: "swift", sites: ROOF, every: 5, chance: 0.45, level: 0.45, ref: 30, when: (c) => c.day && SWIFTS.has(c.month) && (c.hour < 2.5 || c.hour > 9) },
  { id: "jackal", sites: OLIVES, every: 80, chance: 0.3, level: 0.5, ref: 400, when: (c) => !c.day && (c.hour < 3.5 || c.hour > 8.5) },
  { id: "hammer", sites: [CITY], every: 3, chance: 0.3, level: 0.4, ref: 420, when: (c) => c.day && !c.holy && c.hour > 0.5 && c.hour < 10.5 },
];

function context(world, t) {
  const { time, calendar: cal } = world;
  return { day: time.part === "day", hour: time.hour, month: cal.month, holy: cal.holy, hush: world.env.hush === 1, still: animalsStill(t, cal) };
}

const human = (id) => { const look = CAST_BY_ID.get(id)?.look; return look && look !== "ox"; };

/**
 * The beds at an instant: continuous sounds with a place and a level, in fixed slots (wind, city, crickets, three
 * fires, three crowd voices, three walkers). `me` is the listener ({x, y, z}).
 */
export function soundscapeAt(world, me) {
  const { env, calendar: cal, time, people } = world;
  const key = dayKey(world.t);
  const day = time.part === "day";
  // Wind: calm at night and dawn, rising through the afternoon, rougher in winter; each day has its own temper.
  const hourly = day ? 0.22 + 0.3 * clamp((time.hour - 3) / 6) - 0.12 * clamp((2 - time.hour) / 2) : 0.18;
  const wind = clamp(hourly * (WINTER.has(cal.month) ? 1.35 : 1) * (0.75 + 0.5 * hash(key, "wind")) * (me.y > 10 ? 1.25 : 1));
  // The city works on weekdays by day; on Shabbat and festival days it is still.
  const city = day && !cal.holy ? 0.16 * env.dawn : 0;
  const crickets = !day && CRICKETS.has(cal.month) ? 0.14 : 0;

  // Fires: the altar's (brighter when the ashes have just been cleared), the officer's torch on his rounds, and the
  // great lamps of the water-drawing.
  const fires = [{ pos: [ALTAR.x, ALTAR.top + 1, ALTAR.z], level: env.embers }];
  const officer = people.officer;
  if (officer?.visible && world.routines.some((r) => r.id === "officer-rounds")) fires.push({ pos: [officer.pos[0], officer.pos[1] + 2, officer.pos[2]], level: 0.35 });
  if (world.festive.lit) {
    const lamp = LAMP_STANDS.map(([x, z]) => [x, 22, z]).sort((a, b) => dist(a, me) - dist(b, me))[0];
    fires.push({ pos: lamp, level: 1.4 });
  }
  const fire = fires.map((f) => ({ pos: f.pos, level: clamp(f.level * near(dist(f.pos, me), 6)) }));

  // The crowd: people within 70 m, counted in 14 m cells; the three loudest cells speak. On Yom Kippur and at night
  // talk falls to a murmur.
  const cells = new Map();
  let present = 0;
  const walkers = [];
  for (const p of Object.values(people)) {
    if (!p.visible || !human(p.id)) continue;
    present += 1;
    const d = dist(p.pos, me);
    if (p.moving && d < 18) walkers.push({ id: p.id, pos: p.pos, d });
    if (d > 70) continue;
    const k = `${Math.floor(p.pos[0] / 14)},${Math.floor(p.pos[2] / 14)}`;
    const c = cells.get(k) ?? { n: 0, x: 0, y: 0, z: 0 };
    c.n += 1; c.x += p.pos[0]; c.y += p.pos[1]; c.z += p.pos[2];
    cells.set(k, c);
  }
  const talk = env.hush === 1 ? 0.35 : 1;
  const crowd = [...cells.values()]
    .map((c) => { const pos = [c.x / c.n, c.y / c.n + 1.6, c.z / c.n]; return { pos, n: c.n, level: clamp(talk * 0.22 * c.n ** 0.6 * near(dist(pos, me), 8)) }; })
    .sort((a, b) => b.level - a.level)
    .slice(0, 3);
  // Footsteps: the three nearest walkers. Priests serve barefoot; everyone else wears sandals.
  const steps = walkers.sort((a, b) => a.d - b.d).slice(0, 3)
    .map((w) => ({ pos: w.pos, level: clamp(0.5 * near(w.d, 2)), bare: CAST_BY_ID.get(w.id).look === "priest" }));

  // And the whole Mount at once, far and diffuse: a thin hum on an ordinary day, a roar on the pilgrim festivals.
  const throng = clamp(talk * 0.3 * (present / 170) ** 1.3);
  const total = crowd.reduce((s, c) => s + c.level, 0);
  return {
    wind: { level: wind, bright: day ? 0.6 + 0.4 * env.dawn : 0.4 },
    city: { pos: CITY, level: city },
    crickets: { level: crickets },
    fire,
    crowd,
    throng: { level: throng },
    steps,
    song: musicNow(world, me),
    summary: {
      song: musicNow(world, me),
      wind: +wind.toFixed(3), city: +city.toFixed(3), crickets, fire: +Math.max(...fire.map((f) => f.level)).toFixed(3), fires: fire.length,
      crowd: +total.toFixed(3), throng: +throng.toFixed(3), present, walkers: steps.length, still: animalsStill(world.t, cal),
    },
  };
}

// ---- The Levites' song -------------------------------------------------------------------------------------------
// Wordless, so it never carries a text, a psalm or a name. The tune, the mode and the tempo are imagination; the
// instruments (singers with lyres and harps, and a cymbal elsewhere) follow the sources only in kind. The flute is
// not heard in the daily song. Like the calls, every note comes from the absolute instant: a visitor who arrives
// mid-song lands mid-phrase, and the same instant always gives the same notes.
const MODE = [0, 1, 4, 5, 7, 8, 10]; // semitones above the tonic: the "Phrygian dominant" colour
const TONIC = 146.83; // D3
const pitch = (d, up = 0) => TONIC * 2 ** ((12 * Math.floor(d / 7) + MODE[((d % 7) + 7) % 7] + 12 * up) / 12);

/** The song windows of a day: [from, to) of every routine step that sings, except around the eve of Pesach. */
const windowCache = new Map();
export function songWindows(key) {
  if (!windowCache.has(key)) windowCache.set(key, computeWindows(key));
  return windowCache.get(key);
}
function computeWindows(key) {
  return compileDay(key).sounds
    .filter((s) => s.id === "song" && s.dur >= 10000 && !s.routine.startsWith("afternoon-pesach-eve")) // no music around the Pesach offering
    .map((s) => ({ from: s.t, to: s.t + s.dur, who: s.who, routine: s.routine }));
}

/** One section of the song: the tune of `beats` beats, as { beat, len, d } (d = scale degree from the tonic). */
function tune(beats, r) {
  const notes = [];
  let d = [0, 2, 4][Math.floor(r(0) * 3)], beat = 0, i = 1;
  while (beat < beats - 8) {
    const len = [1, 1, 2, 2, 3][Math.floor(r(i++) * 5)];
    notes.push({ beat, len, d });
    const bias = d > 4 ? -1 : d < -1 ? 1 : 0;
    d = Math.max(-3, Math.min(7, d + [-3, -2, -1, -1, 1, 1, 2][Math.floor(r(i++) * 7)] + bias));
    beat += len;
  }
  notes.push({ beat, len: 2, d: 1 }, { beat: beat + 2, len: 2, d: 0 }, { beat: beat + 4, len: beats - beat - 4, d: 0 }); // the last note ends where the rest begins
  return notes;
}

/** Whether the Levites are singing now, and how loudly it reaches the visitor (0 when they are not). */
function musicNow(world, me) {
  const w = songWindows(dayKey(world.t)).find((x) => x.from <= world.t && world.t < x.to);
  if (!w) return 0;
  const singers = Object.values(world.people).filter((p) => p.visible && /^s\d/.test(p.id));
  if (!singers.length) return 0;
  return +clamp(0.9 * near(Math.hypot(singers[0].pos[0] - me.x, singers[0].pos[2] - me.z), 14)).toFixed(3);
}

/** Notes of the song that start in (a, b], each with its voice, pitch, length and where it comes from. */
export function musicBetween(a, b, world, me) {
  if (!(b > a) || b - a > 10000) return [];
  const key = dayKey(b), out = [];
  const windows = songWindows(key).filter((w) => w.to > a && w.from <= b);
  if (!windows.length) return out; // most of the day: nothing to do
  const singers = Object.values(world.people).filter((p) => p.visible && /^s\d/.test(p.id));
  if (!singers.length) return out;
  const pos = [0, 1, 2].map((k) => singers.reduce((s, p) => s + p.pos[k], 0) / singers.length);
  pos[1] += 1.6;
  const level = clamp(0.9 * near(dist(pos, me), 14));
  if (level < 0.02) return out;
  const CYCLE = (SECTION + REST) * BEAT;
  for (const w of windows) {
    for (let k = Math.max(0, Math.floor((a - w.from) / CYCLE)); w.from + k * CYCLE <= b; k += 1) {
      const start = w.from + k * CYCLE;
      const beats = Math.min(SECTION, Math.floor((w.to - start) / BEAT) - 1);
      if (beats < 6) continue;
      const r = (n) => hash(key, "song", w.from, k, n);
      const emit = (beat, voice, d, up, len, gain) => {
        const t = start + beat * BEAT;
        if (t > a && t <= b && t < w.to) out.push({ t, voice, freq: +pitch(d, up).toFixed(2), dur: +(len * BEAT / 1000).toFixed(2), level: +(level * gain).toFixed(3), pos });
      };
      for (const n of tune(beats, (j) => r(j))) emit(n.beat, "choir", n.d, 0, n.len, 1);
      // The lyre keeps to the chord notes of the mode, two beats at a time; the harp holds the tonic and the fifth.
      for (let beat = 0; beat < beats - 2; beat += 2) emit(beat, "kinnor", [0, 2, 4, 7][Math.floor(r(100 + beat) * 4)], 1, 2, 0.55);
      for (let beat = 0; beat < beats - 2; beat += 8) emit(beat, "nevel", beat % 16 ? 4 : 0, -1, 8, 0.8);
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

/** Calls that start in (a, b], each with where it comes from and how loud it is for `me`. */
export function callsBetween(a, b, world, me) {
  if (!(b > a) || b - a > 10000) return [];
  const ctx = context(world, b);
  const out = [];
  for (const call of CALLS) {
    if (!call.when(ctx)) continue;
    const sites = call.sites === "ox" ? (world.people.ox?.visible ? [[world.people.ox.pos[0], world.people.ox.pos[1] + 1.2, world.people.ox.pos[2]]] : []) : call.sites;
    const span = call.every * 1000;
    for (let slot = Math.floor(a / span); slot * span <= b; slot += 1) {
      sites.forEach((pos, s) => {
        if (hash(call.id, slot, s) >= call.chance) return;
        const t = slot * span + hash(call.id, slot, s, "t") * span;
        if (t <= a || t > b) return;
        if (call.ground && zoneOf(pos[0], pos[2]) === "court") return; // no beast is ever heard in the court
        const level = clamp(call.level * near(dist(pos, me), call.ref));
        if (level > 0.02) out.push({ t, id: call.id, pos, level: +level.toFixed(3) });
      });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
