// Seeds for people: everything that varies between two figures comes from hash(utcDayNumber, id), never from chance, so every
// visitor at the same moment sees the same people. Body, dress tint and motion variant are derived here; the browser only
// applies them. Colours and builds are imagination (the title screen says so); the garment list itself follows Mishnah Yoma 7:5.

/** A small 32-bit integer hash of a number and a string (FNV-1a over the id, mixed with the day, then avalanched). */
export function hash(day, id) {
  let h = 0x811c9dc5 ^ (Math.trunc(day) >>> 0);
  h = Math.imul(h, 0x01000193) >>> 0;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** hash() as a number in [0, 1), optionally for a named facet of the same person ("height", "sash", ...). */
export const unit = (day, id, facet = "") => hash(day, facet ? `${id}:${facet}` : id) / 4294967296;

/** Ranges of the seeded body (applied to an asset about 1.72 m tall; see contracts/figure-asset.md). */
export const BODY_RANGE = { height: [0.93, 1.07], build: [0.92, 1.1], shoulder: [0.95, 1.06] };
/** Playback variation of every clip: how fast this person moves, within a few percent. */
export const RATE_RANGE = [0.94, 1.06];

const lerp = (a, b, k) => a + (b - a) * k;
const pick = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];
// Multiplied onto the face and hand maps, which are already warm: these are light, low-saturation tones (the texture carries the colour).
const SKIN = ["#f4e3d6", "#ecd5c0", "#dfc0a6", "#d2ac8c", "#c49a7a", "#e8cdb6"];
// Multiplied onto a strand texture: near-black would hide the strands, so the darkest is a dark brown with some lift.
const HAIR = ["#2a1d14", "#3a2a1e", "#5a4632", "#7c7268", "#a39a90"];
const IVORY = ["#f7f2e6", "#f3ecdc", "#faf6ec", "#efe7d4"];
const SASH = ["#b23a48", "#3d6fb5", "#7a4fb0", "#c2572b", "#2f8a7a", "#b0457a"];
const LEVITE_ROBE = ["#dfe7ee", "#d6e0ea", "#e4e9ee"], LEVITE_CAP = ["#3d6fb5", "#2f6a8a", "#4a5fa8"];
const VILLAGE = ["#c9753a", "#3f8f8a", "#b0457a", "#8a6a3a", "#5f7a3a", "#a04a3a"], VILLAGE_SASH = ["#f1e4c8", "#3a2a1e", "#d9b25a"];

/**
 * Everything seeded about one person on one solar day: body, dress tints (the garment parts of garments.js), and the
 * motion variant (a phase into each loop, a playback rate, and a seed for idle fidgets). `look` is the cast look.
 */
export function figureSeed(day, id, look = "priest") {
  const u = (facet) => unit(day, id, facet);
  const body = {
    height: lerp(...BODY_RANGE.height, u("height")) * (look === "levite" ? 1.02 : 1),
    build: lerp(...BODY_RANGE.build, u("build")),
    shoulder: lerp(...BODY_RANGE.shoulder, u("shoulder")),
    skinTone: pick(SKIN, u("skin")),
  };
  const hair = pick(HAIR, u("hair")), beard = look === "priest" || look === "officer" ? u("beard") < 0.8 : u("beard") < 0.35;
  let garments;
  if (look === "levite") garments = { robe: pick(LEVITE_ROBE, u("robe")), headwear: pick(LEVITE_CAP, u("head")), sash: pick(LEVITE_CAP, u("sash")) };
  else if (look === "officer") garments = { robe: pick(IVORY, u("robe")), headwear: "#e6c15a", sash: "#6a4fb0" };
  else if (look === "villager") garments = { robe: pick(VILLAGE, u("robe")), headwear: pick(IVORY, u("head")), sash: pick(VILLAGE_SASH, u("sash")) };
  else garments = { robe: pick(IVORY, u("robe")), headwear: pick(IVORY, u("head")), sash: pick(SASH, u("sash")) };
  return {
    id, look, body, hair, beard, garments,
    motionVariant: { phase: u("phase"), rate: lerp(...RATE_RANGE, u("rate")), idleSeed: hash(day, `${id}:idle`) % 1000 },
  };
}
