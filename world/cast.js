// The people of the Mount. Ids are stable, so everyone's day can be computed from the clock alone.
// Counts are imagination (the sources give roles, not a roster); looks are placeholders until the art is chosen.

const many = (prefix, n, look, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, look, ...extra }));

export const CAST = [
  { id: "officer", look: "officer", role: "officer of the Temple Mount", home: "nicanor", away: false },
  { id: "memuneh", look: "officer", role: "the appointed one (superintendent)", home: "priestsCourt" },
  ...many("p", 16, "priest", { role: "priest", home: "hearth" }),
  ...many("q", 8, "priest", { role: "priest of the incoming watch", away: true }), // arrives on Shabbat
  ...many("w", 21, "levite", { role: "Levite watchman", away: true }),
  ...many("s", 8, "levite", { role: "Levite singer", away: true }),
  ...many("g", 160, "villager", { role: "pilgrim", away: true }),
  ...many("b", 16, "villager", { role: "bringer of first fruits", away: true }), // on Shavuot
  { id: "ox", look: "ox", role: "the ox before the first fruits", away: true },
];
export const CAST_BY_ID = new Map(CAST.map((c) => [c.id, c]));

/** Pick cast ids: "officer", ["p0", "p1"], or { group: "p", from: 0, count: 4 }. */
export function who(spec) {
  if (typeof spec === "string") return [spec];
  if (Array.isArray(spec)) return spec;
  return Array.from({ length: spec.count }, (_, i) => `${spec.group}${(spec.from ?? 0) + i}`);
}
