// Named places on the Mount, the floor height anywhere, and walking routes between places. Coordinates are metres
// in the frozen layout frame (x east, y up, z south). Routines name places; only this file knows where they are.

export const F = 6.96; // the inner court (azarah)
export const WOMEN = 3.35; // the women's court
export const HEL = 2.85; // the terrace inside the soreg
export const ALTAR = { x: -11.04, z: -46.8, top: 11.28, half: 7.7 };
export const RAMP = { x0: -14.9, x1: -7.2, zTop: -40.1, zFoot: -23 };

// The Sanctuary (heichal) inside: forty cubits from its doorway to the curtains (Mishnah Middot 4:7), entered through
// the great gate. `curtain` is the outer curtain's line; nothing beyond it is ever walked, drawn or shown.
export const HEICHAL = { x0: -59.04, x1: -39.84, z0: -51.6, z1: -42, door: [-39.84, -36.6, -49.2, -44.4], curtain: -59.04, inner: -59.52 };

/** The golden lamp stands of the water-drawing in the women's court (Mishnah Sukkah 5:2); placement and count ours. */
export const LAMP_STANDS = [[24, -64], [24, -29.6], [56, -64], [56, -29.6]];

// Rectangles: [x0, x1, z0, z1].
const COURT = [-82.6, 7.4, -79.6, -14];
const WOMENS = [7.4, 72, -79.2, -14.4];
const SOREG = [-87.5, 76.9, -84.1, -9.5];
const MOUNT = [-118, 118, -118, 118];
const inside = ([x0, x1, z0, z1], x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const smooth = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };

/** Which part of the Mount a point is in. */
export function zoneOf(x, z) {
  const H = HEICHAL;
  if ((x >= H.x0 && x <= H.x1 && z >= H.z0 && z <= H.z1) || (x > H.door[0] && x <= H.door[1] && z >= H.door[2] && z <= H.door[3])) return "heichal";
  if (x >= 7.2 && x <= 10.8 && z >= -54 && z <= -39.6) return "steps";
  if (inside(COURT, x, z)) return "court";
  if (inside(WOMENS, x, z)) return "women";
  if (inside(SOREG, x, z)) return "hel";
  return "mount";
}

/** Floor height under a point: courts, the fifteen steps, the altar ramp and its top. */
export function floorY(x, z) {
  const zone = zoneOf(x, z);
  if (zone === "steps") return WOMENS_TOP(x);
  if (zone === "court") {
    if (x >= RAMP.x0 && x <= RAMP.x1 && z <= RAMP.zFoot && z >= RAMP.zTop) return F + (ALTAR.top - F) * ((RAMP.zFoot - z) / (RAMP.zFoot - RAMP.zTop));
    if (Math.abs(x - ALTAR.x) <= 6.72 && Math.abs(z - ALTAR.z) <= 6.72) return ALTAR.top;
    return F;
  }
  if (zone === "women") return WOMEN;
  if (zone === "heichal") return F;
  if (zone === "hel") return HEL;
  return 0;
}
const WOMENS_TOP = (x) => WOMEN + (F - WOMEN) * smooth(10.8, 7.2, x);

/**
 * Places. `at` is the centre; `spread` lays a group out around it (metres between people); `face` is a point people
 * there turn toward. `quote` marks a place whose name comes from a source (see facts.json).
 */
export const PLACES = {
  // Inner court.
  altarTop: { at: [-11, -44.6], spread: 1.6, face: [-11, -46.8] },
  rampFoot: { at: [-11, -21.6], spread: 1.4, face: [-11, -30] },
  laver: { at: [-22.5, -38.9], spread: 1.2, face: [-22.5, -36] },
  ulamSteps: { at: [-26.6, -46.8], spread: 1.3, face: [10, -46.8] },
  greatGate: { at: [-35.2, -46.8], spread: 1.0, face: [-40, -46.8] },
  wicket: { at: [-36.2, -50.6], spread: 0.8, face: [-40, -50.6] },
  levitesPlatform: { at: [3.4, -46.8], spread: 1.1, face: [-30, -46.8], line: "z" },
  priestsCourt: { at: [-2, -40], spread: 2.4, face: [-11, -46.8] },
  courtNorth: { at: [-22, -74], spread: 3, face: [-22, -46.8] },
  courtSouth: { at: [-24, -18.5], spread: 3, face: [-24, -46.8] },
  lotteryCircle: { at: [-44, -74.4], spread: 1.3, ring: true },
  hearth: { at: [-56, -76.2], spread: 1.25, face: [-56, -60], line: "x" }, // the Chamber of the Hearth, at the north colonnade (placement imagined)
  colonnadeEast: { at: [2, -76.5], spread: 1, face: [2, -60] },
  colonnadeWest: { at: [-78, -76.5], spread: 1, face: [-60, -76.5] },
  nicanor: { at: [4.6, -46.8], spread: 1.2, face: [20, -46.8] },
  // Inside the Sanctuary. The placement of the vessels is ours; Mishnah Menachot 11:6 has every vessel lie along the
  // length of the house.
  menorah: { at: [-51.1, -43.9], spread: 0.8, face: [-52.2, -43.9] }, // on the stone with three steps before it
  goldenAltar: { at: [-50.2, -46.8], spread: 0.8, face: [-51, -46.8] },
  tableNorth: { at: [-52.2, -50.6], spread: 0.55, face: [-52.2, -46], line: "x" }, // those bringing the bread in
  tableSouth: { at: [-52.2, -48.4], spread: 0.55, face: [-52.2, -52], line: "x" }, // those taking it out
  porchTables: { at: [-34.7, -44.6], spread: 0.7, face: [-34.7, -43], line: "x" }, // marble and gold, by the doorway
  // Festival places. The Water Gate's spot on the south of the court is ours; so are the lamp stands' (Sukkah 5:2).
  waterGate: { at: [-40, -16.4], spread: 1, face: [-11, -30] },
  waterGateTrumpets: { at: [-40, -20.4], spread: 1.4, face: [-40, -15], line: "x" },
  crowdSouth: { at: [-24, -24], spread: 1.3, face: [-11, -40] }, // Israel filling the court before cockcrow
  crowdNorth: { at: [-10, -66], spread: 1.3, face: [-11, -50] },
  firstFruits: { at: [-24.5, -25], spread: 1.5, face: [-11, -40] }, // the baskets brought into the court
  fifteenSteps: { at: [9, -46.8], spread: 1, face: [40, -46.8], line: "z" },
  upperGate: { at: [6.4, -46.8], spread: 1.2, face: [40, -46.8], line: "z" },
  womensGateInside: { at: [67.5, -46.8], spread: 1.2, face: [0, -46.8], line: "z" },
  ...Object.fromEntries(LAMP_STANDS.map(([x, z], i) => [`lampStand${i}`, { at: [x + 1.3, z], spread: 1, face: [x, z] }])),
  // Women's court and the Mount.
  womensCourt: { at: [40, -46.8], spread: 3.5, face: [8, -46.8] },
  womensGate: { at: [69.5, -46.8], spread: 1.4, face: [90, -46.8] },
  helEast: { at: [74.5, -30], spread: 2, face: [90, -30] },
  eastGate: { at: [114, -1.8], spread: 1.5, face: [0, -1.8] },
  huldahWest: { at: [-30.6, 114], spread: 1.5, face: [-30.6, 0] },
  huldahEast: { at: [27, 114], spread: 1.5, face: [27, 0] },
  kiponus: { at: [-114, -11.4], spread: 1.5, face: [0, -11.4] },
  taddi: { at: [-1.8, -114], spread: 1.5, face: [-1.8, 0] },
  outerSouth: { at: [0, 70], spread: 6, face: [0, 0] },
  outerEast: { at: [95, 20], spread: 6, face: [0, 20] },
  outerWest: { at: [-95, 30], spread: 6, face: [0, 30] },
};

// The watch posts of the night (Middot 1:1): gates of the Mount, its corners from inside, gates of the court, its
// corners from outside, and the chambers. Positions are placements on our layout.
export const POSTS = [
  "eastGate", "huldahWest", "huldahEast", "kiponus", "taddi",
  [110, -110], [-110, -110], [110, 110], [-110, 110],
  "nicanor", [-30, -82], [-30, -11.5], [-62, -82], [-62, -11.5],
  [-86, -86], [12, -86], [-86, -7], [12, -7],
  [-48, -82], [-48, -11.5], "womensGate",
].map((p, i) => ({ id: `post${i}`, at: typeof p === "string" ? PLACES[p].at : p }));

/** Where member `i` of `n` stands at a place. */
export function spot(placeId, i = 0, n = 1) {
  const p = PLACES[placeId] ?? { at: placeId, spread: 1 };
  const [cx, cz] = p.at;
  if (n <= 1) return [cx, cz];
  if (p.ring) {
    const r = (p.spread * n) / (2 * Math.PI) + 0.4, a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  }
  if (p.line) {
    const d = (i - (n - 1) / 2) * p.spread;
    return p.line === "z" ? [cx, cz + d] : [cx + d, cz];
  }
  const cols = Math.ceil(Math.sqrt(n)), row = Math.floor(i / cols), col = i % cols;
  return [cx + (col - (cols - 1) / 2) * p.spread + (row % 2) * p.spread * 0.3, cz + (row - (Math.ceil(n / cols) - 1) / 2) * p.spread];
}
export const faceOf = (placeId) => PLACES[placeId]?.face ?? null;

// Walking routes: the inner court, the women's court and the Mount connect only through the Nicanor gate (and its
// fifteen steps) and the women's court's east gate. Inside the court, people walk around the altar and ramp.
const DOORS = {
  "heichal|court": [[-41, -46.8], [-33.6, -46.8]], // through the great gate and the porch
  "court|women": [[4.5, -46.8], [12, -46.8]],
  "women|hel": [[69.5, -46.8], [74.5, -46.8]],
  "hel|mount": [[75.5, -38], [90, -30]], // through the soreg east of the women's court
};
const LINKS = { heichal: ["court"], court: ["heichal", "women"], steps: ["court", "women"], women: ["court", "hel"], hel: ["women", "mount"], mount: ["hel"] };
export const area = (z) => (z === "steps" ? "women" : z);
function zonePath(a, b) {
  const seen = new Map([[a, null]]), queue = [a];
  while (queue.length) {
    const z = queue.shift();
    if (z === b) break;
    for (const n of LINKS[z]) if (!seen.has(n)) { seen.set(n, z); queue.push(n); }
  }
  const path = [b];
  while (seen.get(path[0])) path.unshift(seen.get(path[0]));
  return path;
}
// Things to walk around: in the court, the altar with its ramp and the Sanctuary; outside, the walled courts.
const BLOCKS = {
  // The Sanctuary is three blocks around its open porch, so the great gate can be reached from the court.
  court: [[ALTAR.x - ALTAR.half - 0.8, ALTAR.x + ALTAR.half + 0.8, ALTAR.z - ALTAR.half - 0.8, RAMP.zFoot + 0.6], [-78, -28.4, -71.6, -51.3], [-78, -28.4, -42.3, -22], [-78, -37.4, -51.3, -42.3]],
  women: [],
  heichal: [],
  hel: [[-84.6, 74, -81.6, -12.2]],
  mount: [[-89, 78.5, -85.6, -8]],
};
function crosses([x0, x1, z0, z1], [ax, az], [bx, bz]) {
  for (let k = 0.05; k < 1; k += 0.05) if (inside([x0, x1, z0, z1], ax + (bx - ax) * k, az + (bz - az) * k)) return true;
  return false;
}
function around(a, b, depth = 0) {
  const zone = area(zoneOf(...a));
  // The big blocks of this area, then every wall (thin; its ends are where people turn the corner).
  // Outside the courts the big block already holds every court wall.
  const walls = zone === "court" || zone === "women" ? WALLS.slice(0, 11).map(([x0, x1, z0, z1]) => [x0 - 0.7, x1 + 0.7, z0 - 0.7, z1 + 0.7]) : [];
  for (const block of [...(BLOCKS[zone] ?? []), ...walls]) {
    const pts = aroundOne(block, a, b);
    if (pts.length > 2) {
      if (depth > 3) return pts;
      // The detour may cross something else; detour each leg as well.
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i += 1) out.push(...around(out[out.length - 1], pts[i], depth + 1).slice(1));
      return out;
    }
  }
  return [a, b];
}
function aroundOne(BLOCK, a, b) {
  if (inside(BLOCK, ...a) || inside(BLOCK, ...b) || !crosses(BLOCK, a, b)) return [a, b];
  const [x0, x1, z0, z1] = BLOCK;
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  let best = null;
  for (let i = 0; i < 4; i += 1) for (const dir of [1, -1]) for (let n = 1; n <= 3; n += 1) {
    const pts = [a];
    for (let k = 0; k < n; k += 1) pts.push(corners[(i + dir * k + 4) % 4]);
    pts.push(b);
    let ok = true;
    for (let k = 1; k < pts.length; k += 1) if (crosses([x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1], pts[k - 1], pts[k])) ok = false;
    if (ok && (!best || len(pts) < len(best))) best = pts;
  }
  return best ?? [a, b];
}

/** Beyond the outer curtain: never walked, never drawn. */
export const beyondCurtain = (x, z) => x < HEICHAL.curtain && x > -77.2 && z > -70.8 && z < -22.8;
/** Inside the Sanctuary building, beyond the porch: the hall, its doorway, and the walls (where the hidden go). */
export const inSanctuary = (x, z) => x > -77.2 && x < -29.28 && z > -70.8 && z < -22.8 && !(x > -36.6 && Math.abs(z + 46.8) < 4.8); // the porch is open; its back wall (with the doors) is the line

/** Whether someone may stand at (x, z) while staying in `zone`: inside it and clear of what must be walked around. */
export function standable(x, z, zone) {
  if (area(zoneOf(x, z)) !== zone) return false;
  if (blocked(x, z)) return false;
  return !(BLOCKS[zone] ?? []).some((b) => inside([b[0] - 0.5, b[1] + 0.5, b[2] - 0.5, b[3] + 0.5], x, z));
}

const ORDER = ["heichal", "court", "women", "hel", "mount"];
/** A walking route [[x, z], …] from a to b. */
export function route(a, b) {
  const zones = zonePath(area(zoneOf(...a)), area(zoneOf(...b)));
  const pts = [a];
  for (let i = 1; i < zones.length; i += 1) {
    const key = [zones[i - 1], zones[i]].sort((p, q) => ORDER.indexOf(p) - ORDER.indexOf(q)).join("|");
    const door = DOORS[key];
    pts.push(...(ORDER.indexOf(zones[i - 1]) < ORDER.indexOf(zones[i]) ? door : [...door].reverse()));
  }
  pts.push(b);
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) out.push(...around(out[out.length - 1], pts[i]).slice(1));
  return out;
}
export const routeLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
export function along(pts, d) {
  for (let i = 1; i < pts.length; i += 1) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, Math.max(0, d / seg)) : 1;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k, heading: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) };
    }
    d -= seg;
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}

// Walls and buildings the visitor cannot walk through, as rectangles [x0, x1, z0, z1]. Steps up of more than 0.6 m
// (the altar's sides) are refused separately, so the altar is climbed only by its ramp.
export const WALLS = [
  // The inner court; its east side opens only through the Nicanor gatehouse.
  [-83.4, 8.2, -80.4, -78.8], [-83.4, 8.2, -14.8, -13.2], [-83.4, -81.8, -80.4, -13.2],
  [6.6, 8.2, -80.4, -53], [5.9, 8.9, -53, -49.2], [5.9, 8.9, -44.4, -40.6], [6.6, 8.2, -40.6, -13.2],
  // The women's court, open to the east.
  [7.4, 72.8, -80, -78.4], [7.4, 72.8, -15.2, -13.6], [71.2, 72.8, -80, -50], [71.2, 72.8, -43.6, -13.6],
  // The Sanctuary around its open porch and its hall: the doorway's sides, and everything beyond the outer curtain.
  [-77.2, -29.28, -70.8, -51.6], [-77.2, -29.28, -42, -22.8], [-39.84, -36.6, -51.6, -49.2], [-39.84, -36.6, -44.4, -42], [-77.2, HEICHAL.curtain, -51.6, -42],
  // The vessels of the hall, and the two tables in the porch.
  [-52.7, -51.7, -44.15, -43.65], [-51.3, -50.7, -47.1, -46.5], [-52.7, -51.7, -49.85, -49.35], [-36.4, -33.0, -43.6, -42.7],
  // The walls of the Mount.
  [-121.2, 121.2, -121.2, -118.8], [-121.2, 121.2, 118.8, 121.2], [-121.2, -118.8, -121.2, 121.2], [118.8, 121.2, -121.2, 121.2],
];
const R = 0.3; // the visitor's radius
export const blocked = (x, z) => WALLS.some(([x0, x1, z0, z1]) => x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R);
/** Inside a wall's own footprint (no margin): for checking where people walk. */
export const inWall = (x, z) => WALLS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
