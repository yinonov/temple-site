// The courtyard quality slice: the east half of the Court of the Priests (Azarah), as data. Which baked modules it uses,
// what stands about (set dressing), and where to look from. Nothing here is drawn; dressing.js turns it into meshes, and
// courtyard.test.js holds it to the truth rule (a placement that is not imagination names a fact), the licence rule (every
// shipped file has a credits line) and the exclusion zones (nothing in the slaughter area or the Holy of Holies).
export const COURTYARD = {
  id: "azarah-east",
  // The east half of the inner court (layout.json geo-azarah); the court's floor is at F = 6.96.
  bounds: { x0: -37.4, x1: 7.4, z0: -79.6, z1: -14 },
  zone: "courtyard",
  // Baked light and stone, each a file under app/assets/ (a credits line for each).
  modules: [
    { id: "ground-ao", file: "courtyard/courtyard-ground-ao.jpg", note: "skylight and contact occlusion of the court floor (bake_courtyard.py)" },
    { id: "wall-bays", file: "walls/wall_bay_1.glb", note: "dressed-stone wall bays, four layouts (build_wall_bay.py)" },
  ],
  // `prop` is an id of app/assets/props/dressing/dressing.json or an older prop folder; `at` is [x, z] on the court floor.
  // Forms and places are imagination unless a `fact` is named.
  dressing: [
    // By the laver (its place is sourced, Middot 3:6; the jars are imagination).
    { id: "laver-jar-1", prop: "water-vessel", at: [-20.2, -33.6], yaw: 0.4, imagined: true, note: "water for the priests' washing, by the laver" },
    { id: "laver-jar-2", prop: "water-vessel", at: [-24.6, -38.3], yaw: 2.1, imagined: true, note: "" },
    { id: "laver-jar-3", prop: "water-vessel", at: [-19.4, -38.9], yaw: 3.6, imagined: true, note: "" },
    // The altar's wood store and ash work, west and south of it.
    { id: "wood-1", prop: "wood-stack", at: [-24.0, -54.4], yaw: 0.05, imagined: true, note: "wood for the altar fire, stacked west of the altar" },
    { id: "wood-2", prop: "wood-stack", at: [-26.9, -54.0], yaw: -0.08, imagined: true, note: "" },
    { id: "wood-3", prop: "wood-stack", at: [-25.4, -40.4], yaw: 1.57, imagined: true, note: "" },
    { id: "wood-4", prop: "wood-stack", at: [-17.6, -29.4], yaw: 1.4, imagined: true, note: "a smaller stack at the ramp's west foot" },
    { id: "wood-5", prop: "wood-stack", at: [-4.4, -28.8], yaw: -1.5, imagined: true, note: "and one at its east foot" },
    { id: "ash-pan-1", prop: "ash-pan", at: [-21.8, -42.4], yaw: 0.9, imagined: true, note: "a pan for the ashes, by the altar's west foot (the silver fire-pan of Tamid 1:4 is not claimed: imagination)" },
    { id: "ash-pan-2", prop: "ash-pan", at: [-17.4, -24.2], yaw: 0.2, imagined: true, note: "at the ramp's foot" },
    { id: "ash-pan-3", prop: "ash-pan", at: [-4.8, -25.0], yaw: 2.6, imagined: true, note: "" },
    { id: "basket-1", prop: "basket", at: [-23.1, -52.0], yaw: 0.6, imagined: true, note: "" },
    { id: "basket-2", prop: "basket", at: [-27.4, -43.0], yaw: 2.4, imagined: true, note: "" },
    { id: "basket-3", prop: "basket", at: [-16.2, -27.6], yaw: 1.1, imagined: true, note: "" },
    { id: "basket-4", prop: "basket", at: [-5.9, -30.4], yaw: 4.0, imagined: true, note: "" },
    { id: "basket-5", prop: "basket", at: [-1.4, -22.0], yaw: 0.3, imagined: true, note: "near the south-east corner, where a visitor arrives" },
    // The colonnades: somewhere to sit in the shade.
    { id: "bench-s1", prop: "bench", at: [2.6, -16.6], yaw: Math.PI, imagined: true, note: "benches in the south colonnade" },
    { id: "bench-s2", prop: "bench", at: [-10.2, -16.6], yaw: Math.PI, imagined: true, note: "" },
    { id: "bench-s3", prop: "bench", at: [-22.8, -16.6], yaw: Math.PI, imagined: true, note: "" },
    { id: "bench-n1", prop: "bench", at: [-14.0, -76.6], yaw: 0, imagined: true, note: "and in the north colonnade" },
    { id: "bench-n2", prop: "bench", at: [-30.0, -76.6], yaw: 0, imagined: true, note: "" },
    // Banners (linen hangings on cedar poles that sway in the wind): near the ramp's foot, where a visitor arrives, and by the gate.
    { id: "banner-1", prop: "banner", at: [-19.2, -26.8], yaw: 0.15, imagined: true, note: "linen hangings on poles, imagination: no source describes any" },
    { id: "banner-2", prop: "banner", at: [-3.0, -26.4], yaw: -0.1, imagined: true, note: "" },
    { id: "banner-3", prop: "banner", at: [3.6, -35.8], yaw: 1.5, imagined: true, note: "" },
    { id: "banner-4", prop: "banner", at: [3.6, -57.2], yaw: 1.6, imagined: true, note: "" },
    // Lamp stands: either side of the east gate, along the ramp, and at the Ulam's corners.
    { id: "lamp-1", prop: "lamp-stand", at: [3.6, -54.0], yaw: 0, imagined: true, note: "lamp stands either side of the east gate" },
    { id: "lamp-2", prop: "lamp-stand", at: [3.6, -39.6], yaw: 0, imagined: true, note: "" },
    { id: "lamp-3", prop: "lamp-stand", at: [-27.4, -60.0], yaw: 1.57, imagined: true, note: "by the Ulam's north corner" },
    { id: "lamp-4", prop: "lamp-stand", at: [-27.4, -33.6], yaw: 1.57, imagined: true, note: "by the Ulam's south corner" },
    { id: "lamp-5", prop: "lamp-stand", at: [-16.2, -24.4], yaw: 0, imagined: true, note: "either side of the ramp's foot" },
    { id: "lamp-6", prop: "lamp-stand", at: [-5.8, -24.4], yaw: 0, imagined: true, note: "" },
  ],
  // Where tests and screenshots stand: [x, z, yaw] (yaw 0 faces north; `?pos=x,z,yaw`).
  viewpoints: {
    dawn: { pos: [-6, -42, -1.82], note: "the dawn eye-level start used by perf:app and the stills of the fidelity spike" },
    court: { pos: [2.0, -22.0, 0.482], note: "the south-east corner, looking across the court to the altar, its ramp and the Heichal" },
    laver: { pos: [-13.5, -31.5, 1.23], note: "south of the altar, looking at the laver and its wheel" },
    colonnade: { pos: [2.5, -20.5, Math.PI / 2], note: "in the south colonnade, looking west along the columns" },
  },
};

const inside = ([x0, x1, z0, z1], x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

/**
 * Problems with a slice description (an empty list is a pass). `known` holds `facts` (ids), `props` (ids of the dressing
 * kit and older props), `credited` (a predicate: is this file named in credits.md?) and `exclusions` (exclusions.json).
 */
export function validateCourtyard(c, { facts, props, credited, exclusions }) {
  const problems = [];
  const { x0, x1, z0, z1 } = c.bounds;
  const ids = new Set();
  for (const d of c.dressing) {
    if (ids.has(d.id)) problems.push(`${d.id}: duplicate id`);
    ids.add(d.id);
    if (!props.has(d.prop)) problems.push(`${d.id}: unknown prop "${d.prop}"`);
    if (!d.imagined && !(d.fact && facts.has(d.fact))) problems.push(`${d.id}: not imagined, so it needs a fact id that exists in facts.json`);
    if (d.fact && !facts.has(d.fact)) problems.push(`${d.id}: fact ${d.fact} is not in facts.json`);
    const [x, z] = d.at;
    if (!inside([x0, x1, z0, z1], x, z)) problems.push(`${d.id}: at [${x}, ${z}] is outside the slice`);
    for (const zone of exclusions.zones) if (inside(zone.box, x, z)) problems.push(`${d.id}: at [${x}, ${z}] is inside the ${zone.id}`);
  }
  for (const m of c.modules) if (!credited(m.file)) problems.push(`module ${m.id}: ${m.file} has no credits.md line`);
  for (const [name, v] of Object.entries(c.viewpoints)) {
    for (const zone of exclusions.zones) if (inside(zone.box, v.pos[0], v.pos[1])) problems.push(`viewpoint ${name}: stands inside the ${zone.id}`);
  }
  return problems;
}
