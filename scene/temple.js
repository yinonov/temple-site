// The Temple Mount: floors from the frozen layout, dressed with imagined walls, colonnades, the Sanctuary front,
// the altar with its fire, the laver and its wheel, and torches. Sizes of the floors come from layout.json;
// everything added here (walls, columns, trim, colours) is imagination.
import * as THREE from "three";
import { LAMP_STANDS } from "../world/places.js";
import { mat, glow, flame, put, box, halo, pool, tileBox, ashlarTexture, pavingTexture, curtainTexture, haloTexture } from "./kit.js";

export function buildTemple(layout, places) {
  const { F, TOP } = places;
  const [AX, , AZ] = places.ALTAR;
  const g = new THREE.Group();
  const ashlar = ashlarTexture(), paving = pavingTexture();
  const stone = (color) => mat(color, { map: ashlar });
  const wall = stone("#e6dabd"), marble = stone("#f6f1e6"), white = stone("#f3eee2"), plinth = stone("#cdbf9f");
  const floors = { platform: mat("#cfc1a0", { map: paving }), court: mat("#e2d6b9", { map: paving }), barrier: mat("#b9a57c") };
  const gold = new THREE.MeshLambertMaterial({ color: "#dba935", emissive: "#3a2806", flatShading: true });
  const bronze = new THREE.MeshLambertMaterial({ color: "#b0763a", emissive: "#2a1606", flatShading: true });
  const cedar = mat("#6e4526"), dark = mat("#2a1d14"), roof = mat("#b9805a");
  const block = (sx, sy, sz, material, x, y, z) => put(tileBox(sx, sy, sz), material, x, y, z, g);
  // A block given by its extents: x0..x1, y0..y1, z0..z1.
  const span = (x0, x1, y0, y1, z0, z1, material) => block(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  for (const b of layout.boxes) {
    if (/zone|interior|space|ezrat|altar|kevesh|ulam|heichal|kodesh/.test(b.id)) continue;
    if (b.id === "geo-fifteen-steps") {
      for (let i = 0; i < 15; i += 1) block(b.sx * (1 - i / 15), b.sy / 15, b.sz, wall, b.x - (b.sx * i) / 30, b.y - b.sy / 2 + (i + 0.5) * (b.sy / 15), b.z);
    } else if (floors[b.kind]) block(b.sx, b.sy, b.sz, floors[b.kind], b.x, b.y, b.z);
  }

  // Instanced repeats: merlons on the walls and the columns of the court.
  const merlons = [], columns = [];
  const crenellate = (x0, x1, z0, z1, y) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.6));
    for (let i = 0; i <= n; i += 1) merlons.push([x0 + ((x1 - x0) * i) / n, y + 0.55, z0 + ((z1 - z0) * i) / n]);
  };
  const run = (x0, x1, z0, z1, y0, h, t = 1.6, material = wall) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    span(alongX ? x0 : x0 - t / 2, alongX ? x1 : x1 + t / 2, y0, y0 + h, alongX ? z0 - t / 2 : z0, alongX ? z1 + t / 2 : z1, material);
    crenellate(x0, x1, z0, z1, y0 + h);
  };

  // The inner court's walls and the gatehouse on the east (the gate Yonatan's father keeps).
  const W = 8, [x0, x1, z0, z1] = [-82.6, 7.4, -79.6, -14];
  run(x0, x1 + 0.8, z0, z0, F, W);
  run(x0, x1 + 0.8, z1, z1, F, W);
  run(x0, x0, z0, z1, F, W);
  run(x1, x1, z0, -53, F, W);
  run(x1, x1, -40.6, z1, F, W);
  span(5.9, 8.9, F, F + 13.4, -53, -49.2, wall);
  span(5.9, 8.9, F, F + 13.4, -44.4, -40.6, wall);
  span(5.9, 8.9, F + 9.6, F + 13.4, -49.2, -44.4, wall);
  crenellate(7.4, 7.4, -53, -40.6, F + 13.4);
  span(5.7, 9.1, F + 9.2, F + 9.6, -49.6, -44, gold);
  for (const side of [-1, 1]) {
    // The bronze leaves stand open against the piers.
    box(2.3, 9.2, 0.2, bronze, 10.1, F + 4.6, AZ + side * 2.5, g);
    for (const y of [2.3, 4.6, 6.9]) box(2.34, 0.14, 0.26, cedar, 10.1, F + y, AZ + side * 2.5, g);
  }
  // Colonnades along the north and south walls.
  for (const [zc, zw] of [[-75.4, -77.6], [-18.2, -16]]) {
    for (let x = -80; x <= 4.2; x += 4.2) columns.push([x, F + 3.1, zc]);
    span(-81.6, 5.4, F + 6.2, F + 6.9, Math.min(zc, zw) - 1.2, Math.max(zc, zw) + 0.9, wall);
    span(-81.6, 5.4, F + 6.9, F + 7.15, Math.min(zc, zw) - 1.5, Math.max(zc, zw) + 1.2, roof);
  }
  // The women's court below the fifteen steps, the Mount's outer wall.
  const WF = 3.35;
  run(7.4, 72, -79.2, -79.2, WF, 7);
  run(7.4, 72, -14.4, -14.4, WF, 7);
  run(72, 72, -79.2, -50, WF, 7);
  run(72, 72, -43.6, -14.4, WF, 7);
  span(70.6, 73.4, WF + 7, WF + 9.6, -51.4, -42.2, wall);
  for (const [a, b2, c, d] of [[-120, 120, -120, -120], [-120, 120, 120, 120], [-120, -120, -120, 120], [120, 120, -120, 120]]) run(a, b2, c, d, 0, 1.1, 1.2, plinth); // a parapet on the Mount's edge, so the city can be seen

  const merlonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), wall, merlons.length);
  const columnMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.58, 6.2, 10), marble, columns.length);
  const m4 = new THREE.Matrix4();
  merlons.forEach((p, i) => merlonMesh.setMatrixAt(i, m4.makeTranslation(...p)));
  columns.forEach((p, i) => columnMesh.setMatrixAt(i, m4.makeTranslation(...p)));
  g.add(merlonMesh, columnMesh);

  // The Sanctuary: a tall white front with a great open porch, and the golden doors set deep inside it.
  const FX = -29.28, BX = -37, ROOF = 55, [PZ0, PZ1] = [-51.6, -42], PH = 19.2, [DZ0, DZ1] = [-49.2, -44.4], DH = 9.6;
  span(BX, FX, F, ROOF, -70.8, PZ0, marble);
  span(BX, FX, F, ROOF, PZ1, -22.8, marble);
  span(BX, FX, F + PH, ROOF, PZ0, PZ1, marble);
  // The doorway's depth (the wall, six cubits), then the hall: forty cubits long, twenty wide and forty high (Mishnah
  // Middot 4:7), its walls overlaid with gold (Middot 4:1). Behind the outer curtain the building is solid: nothing
  // beyond it is modelled, so no angle can show it.
  const H = places.HEICHAL, HY = F + 19.2;
  span(H.x1, BX, F, ROOF, -63.6, DZ0, white);
  span(H.x1, BX, F, ROOF, DZ1, -30, white);
  span(H.x1, BX, F + DH, ROOF, DZ0, DZ1, white);
  span(-77.2, H.x1, F, ROOF, -63.6, H.z0, white);
  span(-77.2, H.x1, F, ROOF, H.z1, -30, white);
  span(H.x0 - 0.6, H.x1, HY, ROOF, H.z0, H.z1, white);
  span(-77.2, H.inner - 0.08, F, ROOF, H.z0, H.z1, white);
  const leaf = new THREE.MeshLambertMaterial({ color: "#e2b85c", emissive: "#3a2808", map: ashlar });
  span(H.x0, H.x1, F, HY, H.z0, H.z0 + 0.05, leaf);
  span(H.x0, H.x1, F, HY, H.z1 - 0.05, H.z1, leaf);
  span(H.x1 - 0.05, H.x1, F, HY, H.z0, DZ0, leaf);
  span(H.x1 - 0.05, H.x1, F, HY, DZ1, H.z1, leaf);
  span(H.x1 - 0.05, H.x1, F + DH, HY, DZ0, DZ1, leaf);
  span(H.x0, H.x1, HY - 0.05, HY, H.z0, H.z1, leaf);
  span(H.x0, H.x1, F, F + 0.02, H.z0, H.z1, leaf); // the floor, gold as well
  // Two curtains a cubit apart (Mishnah Yoma 5:1; Rabbi Yose says one). Woven colours are imagined.
  const weave = curtainTexture();
  weave.repeat.set(3, 1);
  const cloth = new THREE.MeshLambertMaterial({ map: weave });
  for (const x of [H.curtain, H.inner]) put(new THREE.BoxGeometry(0.06, HY - F, H.z1 - H.z0), cloth, x - 0.03, (F + HY) / 2, AZ, g);
  span(H.x0 + 0.05, H.x0 + 0.25, HY - 0.6, HY - 0.3, H.z0, H.z1, gold); // the rod it hangs from
  // The menorah, its lamps along the length of the house (Menachot 11:6), and the stone with three steps before it
  // on which the priest stands to tend the lamps (Tamid 3:9). Its shape is drawn from the usual picture.
  const MX = -52.2, MZ = -43.9, MY = F + 1.75;
  const menorah = new THREE.Group();
  menorah.position.set(MX, F, MZ);
  put(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 8), gold, 0, 0.875, 0, menorah);
  put(new THREE.CylinderGeometry(0.12, 0.3, 0.22, 8), gold, 0, 0.11, 0, menorah);
  for (const r of [0.18, 0.33, 0.48]) {
    const arm = put(new THREE.TorusGeometry(r, 0.035, 5, 16, Math.PI), gold, 0, 1.75, 0, menorah);
    arm.rotation.z = Math.PI;
  }
  const lamps = [];
  for (const dx of [-0.48, -0.33, -0.18, 0, 0.18, 0.33, 0.48]) {
    put(new THREE.CylinderGeometry(0.05, 0.035, 0.06, 8), gold, dx, 1.78, 0, menorah);
    lamps.push(put(new THREE.ConeGeometry(0.035, 0.12, 5), flame("#ffc35a", 0.95), MX + dx, MY + 0.13, MZ, g));
  }
  g.add(menorah);
  for (let i = 0; i < 3; i += 1) block(0.7 - i * 0.2, 0.12, 0.7, marble, -51.0 - i * 0.1, F + 0.06 + i * 0.12, MZ);
  const lampGlow = halo("#ffcf7a", 2.6, 0.55, g);
  lampGlow.position.set(MX, MY + 0.14, MZ);
  // The golden altar of incense, with its horns, and a thread of smoke.
  block(0.48, 0.96, 0.48, gold, -51, F + 0.48, AZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(0.08, 0.1, 0.08, gold, -51 + sx * 0.2, F + 1.01, AZ + sz * 0.2);
  block(0.3, 0.03, 0.3, glow("#ff7a2a"), -51, F + 0.975, AZ);
  // The table of gold with the bread on it always (Menachot 11:7): two rows of six, two cups of frankincense.
  const TZ = -49.6, bread = mat("#d9a35e");
  block(0.96, 0.06, 0.48, gold, MX, F + 0.72, TZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(0.05, 0.69, 0.05, gold, MX + sx * 0.44, F + 0.345, TZ + sz * 0.2);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) block(0.4, 0.075, 0.3, bread, MX + sx * 0.24, F + 0.79 + i * 0.085, TZ);
    put(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 8), gold, MX + sx * 0.24, F + 1.32, TZ, g);
  }
  // In the porch, by the doorway of the house, a table of marble and a table of gold (Menachot 11:7).
  for (const [x, m] of [[-35.6, marble], [-33.8, gold]]) {
    block(0.96, 0.08, 0.48, m, x, F + 0.72, -43.15);
    block(0.7, 0.68, 0.3, m, x, F + 0.34, -43.15);
  }
  span(FX - 0.05, FX + 1.1, F, F + 1.3, -70.8, PZ0 - 1.2, plinth);
  span(FX - 0.05, FX + 1.1, F, F + 1.3, PZ1 + 1.2, -22.8, plinth);
  for (const z of [PZ0 - 0.6, PZ1 + 0.6]) span(FX, FX + 0.5, F, F + PH + 1.2, z - 0.6, z + 0.6, gold);
  span(FX, FX + 0.5, F + PH, F + PH + 1.2, PZ0 - 1.2, PZ1 + 1.2, gold);
  // Five beams above the porch opening, each a little longer than the one below.
  for (let i = 0; i < 5; i += 1) span(FX, FX + 0.4, F + PH + 2.2 + i * 1.5, F + PH + 2.75 + i * 1.5, PZ0 - 1.4 - i * 0.6, PZ1 + 1.4 + i * 0.6, cedar);
  for (const z of [-67, -57.2, -36.4, -26.6]) {
    span(FX, FX + 0.45, F + 1.3, ROOF - 3.4, z - 1.3, z + 1.3, marble);
    span(FX, FX + 0.6, ROOF - 5.2, ROOF - 3.4, z - 1.6, z + 1.6, gold);
  }
  span(BX - 0.3, FX + 0.7, ROOF - 3, ROOF - 1.4, -71.4, -22.2, gold);
  span(BX - 0.2, FX + 0.3, ROOF - 1.4, ROOF, -71.1, -22.5, marble);
  const spikes = [];
  for (let z = -70; z <= -23.4; z += 2.2) for (const x of [FX - 0.8, BX + 0.8]) spikes.push([x, ROOF + 0.9, z]);
  const spikeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 1.8, 4), gold, spikes.length);
  spikes.forEach((p, i) => spikeMesh.setMatrixAt(i, m4.makeTranslation(...p)));
  g.add(spikeMesh);
  // The great gate: gold frame, two leaves that swing inward, light behind them. The small wicket is to the north.
  for (const z of [DZ0 - 0.35, DZ1 + 0.35]) span(BX, BX + 0.35, F, F + DH + 0.7, z - 0.35, z + 0.35, gold);
  span(BX, BX + 0.35, F + DH, F + DH + 0.7, DZ0 - 0.7, DZ1 + 0.7, gold);
  span(BX - 0.05, BX + 0.12, F, F + 2.5, -51.1, -50.0, dark);
  span(BX, BX + 0.2, F + 2.5, F + 2.75, -51.3, -49.8, gold);
  const doors = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(BX - 0.05, F, AZ + side * 2.4);
    box(0.24, DH, 2.4, gold, 0, DH / 2, -side * 1.2, hinge);
    for (const y of [1.6, 3.2, 4.8, 6.4, 8]) box(0.3, 0.14, 2.3, cedar, 0.02, y, -side * 1.2, hinge);
    for (const y of [0.8, 2.4, 4, 5.6, 7.2, 8.8]) for (const z of [0.5, 1.2, 1.9]) put(new THREE.SphereGeometry(0.09, 6, 4), gold, 0.14, y, -side * z, hinge);
    g.add(hinge);
    return { hinge, side };
  });
  const bolt = box(0.3, 0.3, 3.6, cedar, BX + 0.22, F + 3.4, AZ, g);
  const doorHalo = halo("#ffd98a", 1, 0, g);
  doorHalo.position.set(BX + 0.6, F + 5.2, AZ);
  const spill = pool("#ffd27a", 20, 12, 0, g);
  spill.position.set(BX + 8, F + 0.06, AZ);

  // The altar: whitewashed tiers with four horns, and the ramp on the south.
  const altarStone = mat("#f4efe3", { map: ashlar });
  block(15.4, 0.48, 15.4, altarStone, AX, F + 0.24, AZ);
  block(14.4, 2.4, 14.4, altarStone, AX, F + 1.68, AZ);
  block(13.44, 1.44, 13.44, altarStone, AX, F + 3.6, AZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(0.6, 0.6, 0.6, altarStone, AX + sx * 6.42, TOP + 0.3, AZ + sz * 6.42);
  const [RZ0, RZ1] = [-23, -40.1];
  const rampGeo = tileBox(7.7, TOP - F, RZ0 - RZ1);
  const rp = rampGeo.attributes.position;
  for (let i = 0; i < rp.count; i += 1) if (rp.getZ(i) > 0 && rp.getY(i) > 0) rp.setY(i, -(TOP - F) / 2 + 0.04);
  rampGeo.computeVertexNormals();
  put(rampGeo, altarStone, AX, (F + TOP) / 2, (RZ0 + RZ1) / 2, g);

  const fire = new THREE.Group();
  fire.position.set(AX, TOP, AZ);
  for (let layer = 0; layer < 3; layer += 1) for (const o of [-1, 0, 1]) {
    const log = box(3.3, 0.28, 0.34, cedar, layer % 2 ? o * 0.9 : 0, 0.16 + layer * 0.28, layer % 2 ? 0 : o * 0.9, fire);
    if (layer % 2) log.rotation.y = Math.PI / 2;
  }
  const emberBed = box(2.9, 0.16, 2.9, glow("#ff5a1c"), 0, 0.98, 0, fire);
  // Tongues of flame: slim cones around a bright heart, each swaying to its own rhythm.
  const flames = Array.from({ length: 11 }, (_, i) => {
    const ring = i < 4 ? 0.2 : i < 8 ? 0.75 : 1.2, a = i * 2.39, h = i < 4 ? 3.6 - i * 0.3 : i < 8 ? 2.5 : 1.6;
    const m = put(new THREE.ConeGeometry(i < 4 ? 0.62 : 0.5, h, 5), flame(["#ffe9a0", "#ffc94a", "#ff9a26", "#ff6a16"][i < 2 ? 0 : i < 4 ? 1 : i < 8 ? 2 : 3], 0.7), Math.cos(a) * ring, 1 + h / 2, Math.sin(a) * ring, fire);
    return { m, x: Math.cos(a) * ring, z: Math.sin(a) * ring, h, o: i * 1.7 };
  });
  const fireHalo = halo("#ff9440", 18, 0.9, fire);
  fireHalo.position.y = 2.2;
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const smoke = Array.from({ length: 24 }, (_, i) => ({ m: put(puffGeo, new THREE.MeshLambertMaterial({ color: "#ddd3cf", transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, fire), o: i / 24 }));
  const sparks = Array.from({ length: 22 }, (_, i) => ({ m: box(0.1, 0.1, 0.1, glow("#ffd27a"), 0, 0, 0, fire), o: i / 22, a: i * 2.4 }));
  g.add(fire);

  // The laver and the wooden wheel beside it.
  const laver = new THREE.Group();
  laver.position.set(...places.LAVER);
  put(new THREE.CylinderGeometry(0.62, 0.95, 1.1, 10), bronze, 0, 0.55, 0, laver);
  put(new THREE.CylinderGeometry(1.55, 0.7, 1.05, 12), bronze, 0, 1.62, 0, laver);
  put(new THREE.CylinderGeometry(1.4, 1.4, 0.06, 12), glow("#5d86b8"), 0, 2.1, 0, laver);
  for (let i = 0; i < 12; i += 1) put(new THREE.ConeGeometry(0.07, 0.3, 5), gold, Math.cos((i * Math.PI) / 6) * 1.25, 1.25, Math.sin((i * Math.PI) / 6) * 1.25, laver).rotation.set(Math.sin((i * Math.PI) / 6) * 1.4, 0, -Math.cos((i * Math.PI) / 6) * 1.4);
  // A gantry behind the basin carries the wheel; a rope runs from it down into the water.
  for (const zz of [-1.55, 1.55]) box(0.2, 4.3, 0.2, cedar, -2.5, 2.15, zz, laver);
  box(0.22, 0.22, 3.5, cedar, -2.5, 4.3, 0, laver);
  box(0.12, 1.5, 0.12, cedar, -2.5, 3.5, 0, laver);
  const wheel = new THREE.Group();
  wheel.position.set(-2.5, 2.75, 0);
  put(new THREE.TorusGeometry(1.2, 0.11, 6, 18), cedar, 0, 0, 0, wheel).rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i += 1) box(0.1, 2.4, 0.1, cedar, 0, 0, 0, wheel).rotation.x = (i * Math.PI) / 4;
  put(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), cedar, 0, 0, 0, wheel).rotation.z = Math.PI / 2;
  box(0.6, 0.1, 0.1, cedar, 0.3, 0.9, 0, wheel);
  laver.add(wheel);
  const rope = box(0.05, 2.6, 0.05, mat("#c9b38a"), -1.3, 2.9, 0, laver);
  rope.rotation.z = -1.05;
  g.add(laver);

  // Torches: a bracket, a flame and a glow.
  const torches = [];
  const spots = [[5.6, 3.3, -50.3], [5.6, 3.3, -43.3], [9.2, 3.3, -50.3], [9.2, 3.3, -43.3], [FX + 0.9, 4.2, PZ0 - 2.6], [FX + 0.9, 4.2, PZ1 + 2.6]];
  for (const x of [-68, -47, -9]) spots.push([x, 3.6, -78.5], [x, 3.6, -15.1]);
  for (const [x, y, z] of spots) {
    box(0.14, 1.1, 0.14, cedar, x, F + y - 0.7, z, g);
    const f = put(new THREE.ConeGeometry(0.24, 0.8, 5), flame("#ffb24a", 0.95), x, F + y + 0.2, z, g);
    const h = halo("#ff9c3c", 4.2, 0.75, g);
    h.position.set(x, F + y + 0.25, z);
    torches.push({ f, h });
  }

  // Festival scenery, hidden until its day (world-scene.js shows it).
  const festive = buildFestive(places, gold, cedar);
  g.add(festive.willows, festive.stands, festive.chanukah);

  // Everything that moves or glows stays a separate object; the rest of the stonework is merged into one mesh per
  // material, which turns hundreds of draw calls into a handful.
  const dynamic = new Set([festive.willows, festive.stands, festive.chanukah, lampGlow, ...lamps, doorHalo, spill, bolt, fire, laver, ...doors.map((d) => d.hinge), ...torches.flatMap((t) => [t.f, t.h])]);
  mergeStatic(g, dynamic);
  g.traverse((o) => {
    if (!o.isMesh) return;
    const solid = o.material.isMeshLambertMaterial && !o.material.transparent;
    o.castShadow = solid;
    o.receiveShadow = solid;
  });
  return { g, gold, bronze, doors, bolt, lamps, lampGlow, festive, doorHalo, spill, wheel, torches, fire: { emberBed, flames, halo: fireHalo, smoke, sparks } };
}

function mergeStatic(root, dynamic) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  for (const o of [...root.children]) {
    if (dynamic.has(o) || !o.isMesh || o.isInstancedMesh || o.material.transparent || o.children.length) continue;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (!geo.attributes.uv || !geo.attributes.normal) continue;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(geo);
    root.remove(o);
  }
  for (const [material, geos] of groups) {
    const merged = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const size = geos[0].attributes[name].itemSize;
      const out = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].count * size, 0));
      let at = 0;
      for (const g of geos) { out.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(out, size));
    }
    merged.computeBoundingSphere();
    root.add(new THREE.Mesh(merged, material));
  }
}

/**
 * Sukkot's willows standing at the altar's sides with their tops bent over it (Mishnah Sukkah 4:5); the golden lamp
 * stands of the water-drawing in the women's court, four bowls and four ladders each (Sukkah 5:2); and Chanukah lamps
 * along the walls (imagined). Shapes, sizes and counts are ours.
 */
function buildFestive(places, gold, cedar) {
  const { F, TOP } = places;
  const [AX, , AZ] = places.ALTAR;
  const willows = new THREE.Group(), leaf = mat("#7f9a4a"), stem = mat("#8a7a4a");
  const half = 7.35;
  for (let i = 0; i < 44; i += 1) {
    const side = i % 4, k = (Math.floor(i / 4) + 0.5) / 11 * 2 - 1;
    const [x, z, ax, az] = side === 0 ? [AX + k * half, AZ - half, 0, 1] : side === 1 ? [AX + half, AZ + k * half, -1, 0] : side === 2 ? [AX - half, AZ + k * half, 1, 0] : [AX + k * half, AZ + half, 0, -1];
    if (side === 3 && Math.abs(x - AX) < 4) continue; // the ramp comes up on the south
    const b = new THREE.Group();
    b.position.set(x - ax * 0.35, F, z - az * 0.35);
    box(0.08, 6.4, 0.08, stem, 0, 3.2, 0, b);
    for (let j = 0; j < 6; j += 1) box(0.5, 0.9, 0.06, leaf, (j % 2 ? 0.18 : -0.18), 3 + j * 0.6, 0, b).rotation.z = j % 2 ? -0.5 : 0.5;
    b.rotation.order = "YXZ"; // turned to face the altar, then leaning in so the tops bend over it
    b.rotation.y = Math.atan2(ax, az);
    b.rotation.x = 0.42;
    willows.add(b);
  }
  flatten(willows);
  willows.visible = false;

  const stands = new THREE.Group(), flames = [], glows = [];
  const W = 3.35, H = 15;
  for (const [x, z] of LAMP_STANDS) {
    box(1.2, 0.6, 1.2, gold, x, W + 0.3, z, stands);
    put(new THREE.CylinderGeometry(0.28, 0.4, H, 10), gold, x, W + H / 2, z, stands);
    box(3.2, 0.2, 0.2, gold, x, W + H, z, stands);
    box(0.2, 0.2, 3.2, gold, x, W + H, z, stands);
    for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
      put(new THREE.CylinderGeometry(0.42, 0.24, 0.36, 10), gold, x + dx, W + H + 0.25, z + dz, stands);
      flames.push(put(new THREE.ConeGeometry(0.28, 1.1, 6), flame("#ffc35a", 0.95), x + dx, W + H + 0.95, z + dz, stands));
      // A ladder leaning on the stand under each bowl.
      const ladder = new THREE.Group();
      ladder.position.set(x + dx * 2.2, W, z + dz * 2.2);
      ladder.rotation.y = Math.atan2(dx, dz);
      ladder.rotation.order = "YXZ";
      ladder.rotation.x = -0.16;
      for (const s of [-0.28, 0.28]) box(0.08, H - 0.4, 0.08, cedar, s, (H - 0.4) / 2, 0, ladder);
      for (let r = 0; r < 14; r += 1) box(0.56, 0.06, 0.06, cedar, 0, 0.6 + r * 1.0, 0, ladder);
      stands.add(ladder);
    }
    const h = halo("#ffcf7a", 15, 0, stands);
    h.position.set(x, W + H + 1, z);
    glows.push(h);
  }
  flatten(stands, new Set([...flames, ...glows]));
  stands.visible = false;

  // Chanukah: small flames along the tops of the court walls, one batch of points.
  const pts = [];
  for (let x = -80; x <= 70; x += 6) for (const z of [-79.6, -14]) if (x < 7 || x > 9) pts.push(x, (x < 7.4 ? F + 8.2 : 3.35 + 7.2), z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const chanukah = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffd27a", size: 5.5, map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  chanukah.visible = false;
  return { willows, stands, flames, glows, chanukah };
}

/** Merge every opaque mesh under `group` (nested or not) into one mesh per material, keeping `keep` as they are. */
function flatten(group, keep = new Set()) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert(), byMat = new Map(), drop = [];
  group.traverse((o) => {
    if (!o.isMesh || keep.has(o) || o.material.transparent) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld.clone().premultiply(inv));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
    drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const [material, geos] of byMat) {
    const merged = new THREE.BufferGeometry();
    for (const name of ["position", "normal"]) {
      const size = geos[0].attributes[name].itemSize, out = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].count * size, 0));
      let at = 0;
      for (const g of geos) { out.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(out, size));
    }
    merged.computeBoundingSphere();
    group.add(new THREE.Mesh(merged, material));
  }
  for (const o of [...group.children]) if (o.isGroup && !o.children.length) group.remove(o);
}
