// The Jericho flight: when the great gate opens, a visitor may follow its sound east to Jericho and on to the goats of
// Har Mikhvar (Mishnah Tamid 3:8), then come back to where they stood. It is a camera flight, not time travel: the
// world keeps running, and it is offered, never forced. A pure function of seconds since the visitor chose it.
// The flight, the timing and the land are imagination; the named sounds and the goats carry fact ids.
import { sampleTrack } from "../story/director.js";
import { chapter } from "../story/chapter-1.js";

const FROM = 130; // where the old chapter's flight begins
const LEAD = 3; // seconds to rise from the visitor's eyes to the start of the flight
const shift = (keys) => keys.filter(([t]) => t >= FROM).map(([t, v, flow]) => [t - FROM + LEAD, v, flow].filter((x) => x !== undefined));
const POS = shift(chapter.camera.pos), LOOK = shift(chapter.camera.look);
const ZOOM = shift(chapter.tracks.zoom), SMELL = shift(chapter.tracks.smell);
const HOLD = 4; // a last look at the goats before coming home
export const FLIGHT = POS.at(-1)[0] + HOLD;
const FADE = 1.2; // the cut home is a short fade

/** The named sounds as they arrive over Jericho (seconds into the flight), with their fact ids. */
export const RIPPLES = chapter.ripples.map((r) => ({ ...r, t: r.t - FROM + LEAD }));
/** The goats' sneezes: [seconds, goat]. */
export const SNEEZES = chapter.cues.filter((c) => c.id === "sneeze").map((c) => [c.t - FROM + LEAD, c.goat]);
/** The moment the flight is offered, and for how long, after the great gate opens (milliseconds). */
export const OFFER = { after: 0, for: 150000 };

const mixed = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const ease = (k) => k * k * (3 - 2 * k);

/**
 * The camera `s` seconds into the flight, starting from `home` ([x, y, z] of the visitor's eyes, and `look`, a point
 * they were looking at). Returns { pos, look, zoom, smell, fade, done }.
 */
export function flightAt(s, home) {
  if (s >= FLIGHT) return { pos: home.pos, look: home.look, zoom: 1, smell: 0, fade: 0, done: true };
  let pos = sampleTrack(POS, s), look = sampleTrack(LOOK, s);
  if (s < LEAD) { const k = ease(s / LEAD); pos = mixed(home.pos, POS[0][1], k); look = mixed(home.look, LOOK[0][1], k); }
  const fade = Math.max(0, Math.min(1, (s - (FLIGHT - FADE)) / FADE));
  return { pos, look, zoom: sampleTrack(ZOOM, s), smell: sampleTrack(SMELL, s), fade, done: false };
}

/** Names of the sounds and sneezes that fall in (a, b] seconds of the flight. */
export function flightCuesBetween(a, b) {
  return [
    ...RIPPLES.filter((r) => r.t > a && r.t <= b).map((r) => ({ kind: "ripple", id: r.id, ripple: r })),
    ...SNEEZES.filter(([t]) => t > a && t <= b).map(([t, goat]) => ({ kind: "sneeze", id: "sneeze", goat, t })),
  ];
}
