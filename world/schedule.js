// From routines to everyone's day. For a solar day the routines become claims (who is where, from when to when,
// doing what) and overlays (a pose, a line said aloud, a sound). Between claims people walk at a steady pace along
// real routes; when they have nothing to do they idle where they are, or leave the Mount. Everything is a closed-form
// function of the instant, seeded only by the day and the person's id, so every visitor sees the same world.
import { solarDay, dayKey, atHour } from "./sky.js";
import { calendarAt } from "./calendar.js";
import { ROUTINES } from "./routines.js";
import { CAST, CAST_BY_ID, who } from "./cast.js";
import { spot, faceOf, route, routeLength, along, floorY, PLACES, standable, zoneOf, area, inSanctuary } from "./places.js";

export const WALK = 1.15; // metres per second
const MIN = 60000;
const EXITS = ["eastGate", "huldahWest", "huldahEast", "kiponus", "taddi"];

/** A deterministic number in [0, 1) from any list of integers or strings. */
export function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function anchorTime(anchor, key) {
  const day = solarDay(key + (anchor.day ?? 0));
  const base = anchor.hour !== undefined ? atHour(day, anchor.hour) : day[anchor.at];
  return base + (anchor.min ?? 0) * MIN;
}

const resolvePlace = (place, i, n) => (Array.isArray(place) ? place : spot(place, i, n));

// Pilgrims come in small parties: they enter by a gate of the Mount, linger in one or two courts, and leave. Each
// cast member stands for a stream of visitors: when one party leaves, another arrives later in the same slot.
function pilgrimSteps(key, cal) {
  // More people on Shabbat and on the days of the calendar, many more on the pilgrim festivals (imagined numbers).
  const slots = cal.pilgrimage ? 160 : cal.festivals.some((f) => f.id === "yom-kippur") ? 130 : cal.shabbat || cal.festivals.length ? 96 : 64;
  const day = solarDay(key);
  const end = (day.sunset - day.sunrise) / MIN - 90; // minutes after the anchor when the last visit must be over
  const stops = ["outerSouth", "outerEast", "outerWest", "womensCourt", "womensCourt", "womensCourt", "outerSouth"];
  const long = cal.pilgrimage ? 1.6 : 1; // on festivals people stay longer
  const steps = [];
  for (let i = 0, party = 0; i < slots; party += 1) {
    const size = Math.min(slots - i, 1 + Math.floor(hash(key, "size", party) * 4));
    let t = 5 + hash(key, "first", party) * 50;
    for (let visit = 0; t < end - 60; visit += 1) {
      const r = (k) => hash(key, "party", party, visit, k);
      const a = stops[Math.floor(r(2) * stops.length)], b = stops[Math.floor(r(3) * stops.length)];
      const stayA = (20 + r(4) * 40) * long, stayB = (15 + r(5) * 30) * long;
      const enter = EXITS[Math.floor(r(7) * EXITS.length)], exit = EXITS[Math.floor(r(9) * EXITS.length)];
      const near = (place, k) => { const [x, z] = spot(place), w = (PLACES[place].spread ?? 3) * 3; return [x + (r(k) - 0.5) * 2 * w, z + (r(k + 1) - 0.5) * 2 * w]; };
      const [ax, az] = near(a, 10), [bx, bz] = near(b, 20);
      for (let m = 0; m < size; m += 1) {
        const id = `g${i + m}`, dx = (m % 2 ? 1 : -1) * 0.9 * Math.ceil(m / 2), dz = (m % 3) * 0.6;
        steps.push({ who: id, at: t + m * 0.15, dur: stayA, place: [ax + dx, az + dz], pose: r(30 + m) < 0.3 ? "point" : "stand", wander: 2, enter });
        steps.push({ who: id, at: t + stayA + 6, dur: stayB, place: [bx + dx, bz + dz], pose: r(40 + m) < 0.3 ? "ask" : "stand", wander: 2, exit });
      }
      // Time to leave, and for the next party to come in from a gate.
      t += stayA + 6 + stayB + 14 + r(12) * 20;
    }
    i += size;
  }
  return steps;
}

const exitOf = (x, z, prefer) => {
  if (prefer) return PLACES[prefer].at;
  let best = null, d = Infinity;
  for (const g of EXITS) { const [gx, gz] = PLACES[g].at; const e = Math.hypot(gx - x, gz - z); if (e < d) { d = e; best = [gx, gz]; } }
  return best;
};
const AWAY_GAP = 40 * MIN;
const homeOf = (id) => spot(CAST_BY_ID.get(id).home, Number(id.replace(/\D/g, "")) || 0, 16);

const compiled = new Map();
/** Claims, overlays, sounds and marks for every routine instance that can touch a day. Cached per day. */
export function compileDay(key) {
  if (compiled.has(key)) return compiled.get(key);
  const claims = new Map(CAST.map((c) => [c.id, []]));
  const overlays = new Map(CAST.map((c) => [c.id, []]));
  const sounds = [], marks = [], active = [];
  for (const k of [key - 1, key, key + 1]) {
    for (const routine of ROUTINES) {
      const start = anchorTime(routine.anchor, k);
      const cal = calendarAt(start);
      if (routine.days && !routine.days(cal)) continue;
      const end = routine.until ? anchorTime({ ...routine.until, day: (routine.until.day ?? 0) }, k) : null;
      const steps = routine.pilgrims ? pilgrimSteps(k, cal) : routine.steps;
      let last = start;
      for (const step of steps) {
        if (step.days && !step.days(cal)) continue; // a step kept only on some days
        const ids = who(step.who);
        const from = start + step.at * MIN;
        const to = step.dur === "until" ? end : from + step.dur * MIN;
        if (!step.idle) last = Math.max(last, to); // a step that only says where people go afterwards does not keep a routine running
        ids.forEach((id, i) => {
          if (!claims.has(id)) throw new Error(`routine ${routine.id}: unknown cast member ${id}`);
          if (step.place !== undefined) {
            const [x, z] = resolvePlace(step.place, i, ids.length);
            claims.get(id).push({ id, start: from, end: to, x, z, pose: step.pose ?? "stand", face: step.face ?? (Array.isArray(step.place) ? null : faceOf(step.place)), wander: step.wander ?? 0, hidden: Boolean(step.hidden), routine: routine.id, enter: step.enter, exit: step.exit });
          } else overlays.get(id).push({ start: from, end: to, pose: step.pose, say: step.say, routine: routine.id });
          if (step.sound && i === 0) sounds.push({ t: from, id: step.sound, who: id, routine: routine.id, dur: to - from });
        });
      }
      for (const [name, at] of Object.entries(routine.marks ?? {})) marks.push({ name, t: start + at * MIN });
      active.push({ id: routine.id, start, end: end ?? last, note: routine.note });
    }
  }
  for (const [id, list] of claims) {
    list.sort((a, b) => a.start - b.start);
    // A later claim cuts short the one before it.
    for (let i = 0; i + 1 < list.length; i += 1) if (list[i].end > list[i + 1].start) list[i].end = list[i + 1].start;
    // Make the day walkable: if someone cannot reach a place in time, they arrive late and everything after shifts.
    // People who come and go (pilgrims, Levites off duty) enter by a gate and leave by one when they have a long gap.
    const person = CAST_BY_ID.get(id);
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i], prev = list[i - 1];
      const fresh = person.away && (!prev || c.enter || c.start - prev.end > AWAY_GAP);
      if (prev) prev.leave = fresh;
      const from = fresh ? (c.enter ? PLACES[c.enter].at : exitOf(c.x, c.z)) : prev ? [prev.x, prev.z] : person.home ? homeOf(id) : [c.x, c.z];
      c.fresh = fresh;
      c.route = route(from, [c.x, c.z]);
      c.walk = (routeLength(c.route) / WALK) * 1000;
      c.walkStart = prev && !fresh ? Math.max(prev.end, c.start - c.walk) : c.start - c.walk;
      const arrive = c.walkStart + c.walk;
      if (arrive > c.start) { c.start = arrive; if (c.end < c.start) c.end = c.start; }
      if (prev && !fresh && prev.end > c.walkStart) prev.end = c.walkStart;
    }
    const last = list[list.length - 1];
    if (last && person.away) last.leave = true;
    for (const c of list) if (c.leave) {
      c.exitRoute = route([c.x, c.z], exitOf(c.x, c.z, c.exit));
      c.exitWalk = (routeLength(c.exitRoute) / WALK) * 1000;
    }
  }
  sounds.sort((a, b) => a.t - b.t);
  marks.sort((a, b) => a.t - b.t);
  const day = { key, claims, overlays, sounds, marks, active };
  if (compiled.size > 8) compiled.clear();
  compiled.set(key, day);
  return day;
}

// Milling about: every few seconds a person strolls to a new spot near their place, never leaving its area.
const STROLL = 0.45; // metres per second
function wanderAt(c, t, id) {
  if (!c.wander) return { x: c.x, z: c.z, moving: false };
  const SLOT = 8000 + c.wander * 2500 + hash(id, "slot") * 5000, phase = hash(id, "phase") * SLOT;
  const slot = Math.floor((t + phase) / SLOT);
  const zone = area(zoneOf(c.x, c.z));
  const target = (s) => {
    if (s * SLOT - phase < c.start || (s + 1) * SLOT - phase > c.end - 2000) return [c.x, c.z]; // start and end at the centre
    for (let k = 0; k < 8; k += 1) {
      const a = hash(id, s, 1, k) * Math.PI * 2, r = c.wander * (0.45 + 0.55 * hash(id, s, 2, k));
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if ([0.25, 0.5, 0.75, 1].every((f) => standable(c.x + (x - c.x) * f, c.z + (z - c.z) * f, zone) && !inSanctuary(c.x + (x - c.x) * f, c.z + (z - c.z) * f))) return [x, z];
    }
    return [c.x, c.z];
  };
  const [ax, az] = target(slot - 1), [bx, bz] = target(slot);
  const clear = (f) => standable(ax + (bx - ax) * f, az + (bz - az) * f, zone) && !inSanctuary(ax + (bx - ax) * f, az + (bz - az) * f);
  // Strolls go straight, or by way of the place's centre if the straight line would cut a corner.
  const pts = [0.2, 0.4, 0.6, 0.8].every(clear) ? [[ax, az], [bx, bz]] : [[ax, az], [c.x, c.z], [bx, bz]];
  const len = routeLength(pts), speed = Math.max(STROLL, len / (0.85 * SLOT / 1000)), walked = ((t + phase - slot * SLOT) / 1000) * speed; // every stroll ends within its slot
  if (len < 0.05 || walked >= len) return { x: bx, z: bz, moving: false };
  return { ...along(pts, walked), moving: true };
}

/**
 * Where one person is and what they are doing at instant t: position (x, y, z), heading, pose, whether they are
 * walking, whether they are on the Mount at all, and what they are saying.
 */
export function personAt(id, t) {
  const day = compileDay(dayKey(t));
  const list = day.claims.get(id);
  const person = CAST_BY_ID.get(id);
  let i = list.findIndex((c) => c.end > t);
  if (i < 0) i = list.length;
  const prev = list[i - 1] ?? null, next = list[i] ?? null;
  let state;
  if (next && t >= next.walkStart) {
    if (t < next.walkStart + next.walk) {
      // Set off from wherever the last stroll left them, a little briskly so as to arrive on time.
      const lead = prev && !next.fresh && prev.wander ? wanderAt(prev, prev.end, id) : null;
      const pts = lead ? [[lead.x, lead.z], ...next.route.slice(1)] : next.route;
      const p = along(pts, ((t - next.walkStart) / next.walk) * routeLength(pts));
      state = { ...p, moving: true, visible: !(next.hidden && inSanctuary(p.x, p.z)) };
    }
    else state = { ...wanderAt(next, t, id), visible: !next.hidden, pose: next.pose, face: next.face };
  } else if (prev?.leave) {
    const k = t - prev.end;
    state = k < prev.exitWalk ? { ...along(prev.exitRoute, (k / 1000) * WALK), moving: true, visible: true } : { x: prev.exitRoute.at(-1)[0], z: prev.exitRoute.at(-1)[1], visible: false };
  } else if (prev) state = { x: prev.x, z: prev.z, moving: false, visible: !prev.hidden, pose: prev.pose, face: prev.face };
  else if (next && !next.fresh) state = { x: next.route[0][0], z: next.route[0][1], moving: false, visible: true, pose: "stand" };
  else if (!person.away && person.home) { const [x, z] = homeOf(id); state = { x, z, moving: false, visible: true, pose: "stand" }; }
  else state = { x: next?.route[0][0] ?? 0, z: next?.route[0][1] ?? 0, visible: false };
  // Overlays: a pose held for a while, a line said aloud.
  let pose = state.moving ? "walk" : state.pose ?? "stand", say = null;
  for (const o of day.overlays.get(id)) {
    if (o.start <= t && t < o.end) {
      if (o.pose && !state.moving) pose = o.pose;
      if (o.say && state.visible) say = o.say;
    }
  }
  let heading = state.heading ?? null;
  if (!state.moving && state.face) heading = Math.atan2(state.face[0] - state.x, state.face[1] - state.z);
  return { id, pos: [state.x, floorY(state.x, state.z), state.z], heading, pose, moving: Boolean(state.moving), visible: state.visible !== false, say };
}
