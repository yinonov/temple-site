// The director: a pure function from (chapter, time) to scene state. No DOM, no Three.js, no clock.
// Tracks are arrays of [time, value] keys (value: number or number[]), sorted by time.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => k * k * (3 - 2 * k);

function mix(a, b, k) {
  return Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], k)) : lerp(a, b, k);
}

function curve(p0, p1, p2, p3, k) {
  const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (3 * b - a - 3 * c + d) * k * k * k);
  return Array.isArray(p1) ? p1.map((_, i) => f(p0[i], p1[i], p2[i], p3[i])) : f(p0, p1, p2, p3);
}

/**
 * Sample a keyed track at time t. `ease` false gives linear motion (used for walking).
 * A key marked "flow" is reached along a smooth curve through its neighbours (used for the flight).
 */
export function sampleTrack(keys, t, ease = true) {
  if (!keys || keys.length === 0) return undefined;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 1;
  while (keys[i][0] < t) i += 1;
  const [t0, v0] = keys[i - 1];
  const [t1, v1] = keys[i];
  const k = (t - t0) / (t1 - t0);
  if (keys[i][2] === "flow") {
    const before = keys[i - 1][2] === "flow" ? keys[i - 2][1] : v0;
    const after = keys[i + 1]?.[2] === "flow" ? keys[i + 1][1] : v1;
    return curve(before, v0, v1, after, k);
  }
  return mix(v0, v1, ease ? smooth(k) : k);
}

export function beatAt(chapter, t) {
  const beats = chapter.beats;
  let index = beats.findIndex((b) => t >= b.start && t < b.end);
  if (index < 0) index = t < beats[0].start ? 0 : beats.length - 1;
  const beat = beats[index];
  return { id: beat.id, index, number: beat.number, progress: clamp((t - beat.start) / (beat.end - beat.start)) };
}

function actorAt(keys, t) {
  // keys: [time, [x, y, z], pose?, heading?]. Position is linear. A walking figure faces where it goes; a standing
  // one takes the heading of its last key, or else keeps the way it was walking.
  const pos = sampleTrack(keys, t, false);
  let i = keys.findIndex((k) => k[0] > t);
  if (i < 0) i = keys.length;
  const prev = keys[Math.max(0, i - 1)];
  const next = keys[Math.min(keys.length - 1, i)];
  const dx = next[1][0] - prev[1][0];
  const dz = next[1][2] - prev[1][2];
  const moving = t >= keys[0][0] && i < keys.length && i > 0 && Math.hypot(dx, dz) > 0.01;
  let heading = null;
  if (moving) heading = Math.atan2(dx, dz);
  else if (typeof prev[3] === "number") heading = prev[3];
  else for (let j = Math.min(i - 1, keys.length - 1); j > 0 && heading === null; j -= 1) {
    const ax = keys[j][1][0] - keys[j - 1][1][0];
    const az = keys[j][1][2] - keys[j - 1][1][2];
    if (Math.hypot(ax, az) > 0.01) heading = Math.atan2(ax, az);
  }
  // Someone carrying something keeps carrying it while walking.
  return { pos, moving, heading, pose: moving ? (prev[2] === "carry" ? "carry" : "walk") : prev[2] ?? "stand" };
}

/** Everything the scene and the UI need to draw time t. */
export function stateAt(chapter, time) {
  const t = clamp(time, 0, chapter.duration);
  const env = {};
  for (const [name, keys] of Object.entries(chapter.tracks)) env[name] = sampleTrack(keys, t);
  const actors = {};
  for (const [id, keys] of Object.entries(chapter.actors)) actors[id] = actorAt(keys, t);
  const line = chapter.lines.find((l) => t >= l.t && t < l.t + l.d) ?? null;
  const hotspots = chapter.hotspots.filter((h) => h.spans.some(([from, to]) => t >= from && t < to));
  return {
    t,
    beat: beatAt(chapter, t),
    camera: { pos: sampleTrack(chapter.camera.pos, t), look: sampleTrack(chapter.camera.look, t) },
    env,
    actors,
    line,
    hotspots,
  };
}

/** Sound and effect cues with a < cue.t <= b, in order. */
export function cuesBetween(chapter, a, b) {
  return chapter.cues.filter((c) => c.t > a && c.t <= b);
}

/** The next moment after t where the story waits for a tap (the end of a beat), or the end of the chapter. */
export function nextStop(chapter, t) {
  for (const beat of chapter.beats) if (beat.end > t) return beat.end;
  return chapter.duration;
}

/** Where a tap during playback jumps to: the start of the next narration line, never past the next stop. */
export function skipTarget(chapter, t) {
  const stop = nextStop(chapter, t);
  const next = chapter.lines.find((l) => l.t > t + 0.05);
  return next && next.t < stop ? next.t : stop;
}

/** Parse `?t=<seconds>`; returns null when absent or invalid. */
export function parseStartTime(search, duration) {
  const raw = new URLSearchParams(search).get("t");
  if (raw === null || raw.trim() === "" || !Number.isFinite(Number(raw))) return null;
  return clamp(Number(raw), 0, duration);
}

/** Structural problems in a chapter (empty array when it is well formed). */
export function validateChapter(chapter) {
  const errors = [];
  let cursor = 0;
  for (const beat of chapter.beats) {
    if (beat.start !== cursor) errors.push(`beat ${beat.id} starts at ${beat.start}, expected ${cursor}`);
    if (!(beat.end > beat.start)) errors.push(`beat ${beat.id} has no length`);
    cursor = beat.end;
  }
  if (cursor !== chapter.duration) errors.push(`beats end at ${cursor}, duration is ${chapter.duration}`);
  const sorted = (keys, what) => keys.forEach((k, i) => { if (i && k[0] <= keys[i - 1][0]) errors.push(`${what}: keys out of order at ${k[0]}`); });
  for (const [name, keys] of Object.entries(chapter.tracks)) sorted(keys, `track ${name}`);
  for (const [name, keys] of Object.entries(chapter.actors)) sorted(keys, `actor ${name}`);
  sorted(chapter.camera.pos, "camera.pos");
  sorted(chapter.camera.look, "camera.look");
  chapter.lines.forEach((l, i) => {
    if (!l.he || !l.en) errors.push(`line at ${l.t} needs Hebrew and English`);
    if (i && l.t < chapter.lines[i - 1].t + chapter.lines[i - 1].d) errors.push(`line at ${l.t} overlaps the previous one`);
    if (l.t + l.d > chapter.duration) errors.push(`line at ${l.t} runs past the end`);
    if (!l.imagined && !(l.facts?.length > 0)) errors.push(`line at ${l.t} is neither imagined nor tied to a fact`);
  });
  for (const h of chapter.hotspots) {
    if (!h.he || !h.en) errors.push(`hotspot ${h.id} needs Hebrew and English`);
    if (!(h.spans?.length > 0) || h.spans.some(([from, to]) => !(to > from))) errors.push(`hotspot ${h.id} needs spans with a length`);
  }
  for (const [id, keys] of Object.entries(chapter.actors)) if (!chapter.cast?.[id]) errors.push(`actor ${id} is not in the cast`);
  for (const id of Object.keys(chapter.cast ?? {})) if (!chapter.actors[id]) errors.push(`cast member ${id} has no keys`);
  return errors;
}
