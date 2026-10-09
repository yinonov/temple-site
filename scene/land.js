// The land east of the Mount: hills, Jericho among its palms, the goats' hill, the travelling sounds and the
// drifting scent. All of it is imagined staging for beat 7.
import * as THREE from "three";
import { C, sstep, lerp, mat, glow, put, box, halo, goat } from "./kit.js";
import { groundY, JERICHO, GOATS, RIDGE } from "../story/ground.js";

const RIPPLE_COLORS = ["#ffd27a", "#ff9e6b", "#d9b27b", "#ff8fb0", "#8fe0c0", "#fff2a0", "#a9ccff", "#ffb347"];

export function buildLand(rippleCount) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(4200, 2600, 120, 74);
  geo.rotateX(-Math.PI / 2);
  geo.translate(900, 0, -60);
  const p = geo.attributes.position, colors = [];
  const sand = C("#dcc091"), low = C("#c4a574"), green = C("#8fae62"), olive = C("#a9a66c"), rock = C("#b89a72");
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), z = p.getZ(i), y = groundY(x, z);
    p.setY(i, y);
    const oasis = Math.exp(-((x - JERICHO[0]) ** 2 + (z - JERICHO[1]) ** 2) / 130 ** 2);
    const grove = Math.exp(-(((x - RIDGE.x) / 150) ** 2));
    const hill = Math.exp(-((x - GOATS[0]) ** 2 + (z - GOATS[1]) ** 2) / 120 ** 2);
    colors.push(...sand.clone().lerp(low, sstep(-95, -20, y) * 0.5).lerp(olive, grove * 0.6).lerp(green, oasis * 0.85).lerp(rock, hill * 0.45).toArray());
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = put(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0, 0, 0, g);
  ground.receiveShadow = true;
  // A far sliver of water south-east of the plain.
  const sea = put(new THREE.CircleGeometry(520, 40), glow("#7fb6d6", 0.9), 1500, -96.4, 620, g);
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(1, 1.6, 1);

  // Trees on the ridge.
  const m4 = new THREE.Matrix4(), trees = [];
  for (let i = 0; i < 90; i += 1) {
    const x = RIDGE.x - 150 + ((i * 97) % 300), z = -520 + ((i * 211) % 1000), s = 5 + (i % 4) * 1.5;
    trees.push([x, groundY(x, z) + s * 0.2, z, s]);
  }
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat("#6f8a4c"), trees.length);
  trees.forEach(([x, y, z, s], i) => crowns.setMatrixAt(i, m4.makeScale(s, s * 0.8, s).setPosition(x, y, z)));
  g.add(crowns);

  // Jericho: domed houses and palms.
  const [jx, jz] = JERICHO;
  const windows = [], solids = [];
  const houseColors = ["#f3e6c8", "#ecd9b4", "#f6ead2"].map((c) => mat(c));
  const dome = mat("#e9d2a6"), palmGreen = mat("#4f8a3c"), trunk = mat("#7a5a36"), door = mat("#6e4526");
  for (let i = 0; i < 18; i += 1) {
    const a = i * 2.4, r = 12 + i * 3.6, x = jx + Math.cos(a) * r, z = jz + Math.sin(a) * r, y = groundY(x, z), s = 5 + (i % 3) * 1.7;
    const h = new THREE.Group();
    h.position.set(x, y, z);
    h.rotation.y = Math.PI + (i % 5) * 0.25 - 0.5;
    solids.push(box(s, s * 0.8, s, houseColors[i % 3], 0, s * 0.4, 0, h), put(new THREE.SphereGeometry(s * 0.36, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), dome, 0, s * 0.8, 0, h));
    solids.push(box(s * 0.26, s * 0.42, 0.2, door, -s * 0.18, s * 0.21, s / 2 + 0.05, h));
    windows.push(box(0.9, 1.2, 0.2, glow("#3a2c20"), s * 0.2, s * 0.5, s / 2 + 0.06, h));
    g.add(h);
  }
  for (let i = 0; i < 30; i += 1) {
    const a = i * 1.9, r = 20 + i * 3.2, x = jx + Math.cos(a) * r, z = jz + 8 + Math.sin(a) * r, y = groundY(x, z), h = 7 + (i % 4) * 1.2;
    const t = put(new THREE.CylinderGeometry(0.28, 0.45, h, 6), trunk, x, y + h / 2, z, g);
    t.rotation.z = ((i % 3) - 1) * 0.06;
    solids.push(t);
    for (let k = 0; k < 6; k += 1) {
      const frond = put(new THREE.ConeGeometry(0.75, 4.6, 4), palmGreen, x + Math.cos(k * 1.05) * 1.6, y + h - 0.3, z + Math.sin(k * 1.05) * 1.6, g);
      frond.rotation.set(Math.sin(k * 1.05) * 1.95, 0, -Math.cos(k * 1.05) * 1.95);
      solids.push(frond);
    }
  }
  for (const m of solids) { m.castShadow = true; m.receiveShadow = true; }

  // The sounds: bright arcs that travel from the Temple and ring out over the town.
  const arcGeo = new THREE.TorusGeometry(1, 0.035, 5, 36, Math.PI);
  const ripples = Array.from({ length: rippleCount }, (_, i) => {
    const group = new THREE.Group();
    const m = glow(RIPPLE_COLORS[i % RIPPLE_COLORS.length], 0.9, { blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 3; k += 1) put(arcGeo, m, 0, 0, -k * 0.22, group).scale.setScalar(1 - k * 0.17);
    group.rotation.y = Math.PI / 2;
    group.visible = false;
    const ring = put(new THREE.RingGeometry(0.94, 1, 48), glow(RIPPLE_COLORS[i % RIPPLE_COLORS.length], 0.8, { blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), jx, groundY(jx, jz) + 1.2, jz, g);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    g.add(group);
    return { g: group, m, ring };
  });

  // The goats' hill: rocks, shrubs, three goats and a kid.
  const [gx, gz] = GOATS, gy = groundY(gx, gz);
  const shrub = mat("#7d9a55"), stoneMat = mat("#a89478");
  for (let i = 0; i < 14; i += 1) {
    const x = gx - 7 + ((i * 5.3) % 14), z = gz - 6 + ((i * 3.7) % 11), s = 0.32 + (i % 3) * 0.2;
    if (Math.hypot(x - gx, z - gz) < 2.6 || (x - gx) - (z - gz) < -2.5) continue; // keep the camera's side clear
    put(new THREE.IcosahedronGeometry(s, 0), i % 3 ? shrub : stoneMat, x, groundY(x, z) + s * 0.5, z, g).castShadow = true;
  }
  const goats = [["#f4efe6", 0.2, -0.4, 3.7, 1.25], ["#6a5240", 2.1, 0.9, 4.4, 1.2], ["#d2ae84", -1.7, 1.2, 3.3, 1.15], ["#f1e4d0", 0.4, 1.7, 4.1, 0.72]].map(([color, dx, dz, turn, scale]) => {
    const one = goat(color, scale);
    one.g.position.set(gx + dx, groundY(gx + dx, gz + dz), gz + dz);
    one.g.rotation.y = turn;
    one.g.traverse((o) => { if (o.isMesh && o.material.isMeshLambertMaterial) o.castShadow = true; });
    g.add(one.g);
    return one;
  });
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const scent = Array.from({ length: 14 }, () => put(puffGeo, glow("#f6b4d6", 0.24, { depthWrite: false }), 0, 0, 0, g));
  const scentGlow = halo("#ffc4e2", 9, 0, g);

  function update(t, time, smell, rippleTimes) {
    ripples.forEach((r, i) => {
      const k = (t - (rippleTimes[i] - 8)) / 8;
      r.g.visible = k > 0 && k < 1;
      if (r.g.visible) {
        const x = lerp(40, jx - 20, k);
        r.g.position.set(x, Math.max(groundY(x, lerp(-46, jz, k)) + 6, lerp(30, groundY(jx, jz) + 6, sstep(0.55, 1, k))), lerp(-46, jz, k));
        r.g.scale.setScalar(lerp(30, 85, k));
        r.m.opacity = 0.85 * Math.sin(Math.min(1, k * 1.2) * Math.PI) ** 0.5;
      }
      const j = (t - rippleTimes[i]) / 3.2;
      r.ring.visible = j > 0 && j < 1;
      if (r.ring.visible) { r.ring.scale.setScalar(4 + j * 95); r.ring.material.opacity = 0.8 * (1 - j); }
    });
    windows.forEach((w, i) => w.material.color.copy(C("#3a2c20").lerp(C("#ffd27a"), sstep(0, 1.5, t - rippleTimes[i % rippleTimes.length] - (i >= rippleTimes.length ? 0.8 : 0)))));
    // The scent: a ribbon of rosy puffs that leads the way to the hill and settles around the goats' noses.
    scent.forEach((m, i) => {
      const k = Math.max(0, Math.min(1, smell * 1.3 + 0.1 - i * 0.03)), e = sstep(0, 1, k), near = sstep(0.8, 1, k);
      const one = goats[i % goats.length], turn = one.g.rotation.y, size = one.g.scale.x;
      const nx = one.g.position.x + Math.cos(turn) * 1.25 * size, nz = one.g.position.z - Math.sin(turn) * 1.25 * size, ny = one.g.position.y + 1.35 * size;
      m.position.set(lerp(jx + 30, nx + ((i * 7) % 5) * 0.18 - 0.36, e) + Math.sin(time * 0.7 + i) * lerp(2.4, 0.12, near),
        lerp(groundY(jx, jz) + 34, ny + ((i * 3) % 4) * 0.14, e) + Math.sin(k * Math.PI) * 26 + Math.sin(time + i * 2) * lerp(1.2, 0.08, near),
        lerp(jz - 10, nz + ((i * 5) % 4) * 0.16 - 0.24, e) + Math.cos(time * 0.6 + i * 1.7) * lerp(2.4, 0.12, near));
      m.scale.setScalar(lerp(5.5 + (i % 3) * 1.6, 0.17 + (i % 3) * 0.05, near));
      m.material.opacity = lerp(0.3, 0.36, near);
      m.visible = smell > 0.01;
    });
    scentGlow.position.copy(scent[0].position);
    scentGlow.scale.setScalar(lerp(40, 3, sstep(0.6, 1, smell)));
    scentGlow.material.opacity = 0.3 * sstep(0, 0.2, smell) * (1 - sstep(0.85, 1, smell));
    for (const one of goats) {
      const k = (t - one.sneeze) / 0.9, on = k >= 0 && k < 1;
      const wind = on && k < 0.35 ? k / 0.35 : 0, out = on && k >= 0.35 ? Math.sin(((k - 0.35) / 0.65) * Math.PI) : 0;
      one.head.rotation.z = wind * 0.55 - out * 0.8 + Math.sin(time * 1.3 + one.g.position.x) * 0.06;
      one.body.position.y = out * 0.4;
      one.body.rotation.z = -out * 0.12;
      one.puff.visible = out > 0;
      one.puff.scale.setScalar(0.12 + (k - 0.35) * 0.9);
      one.puff.position.x = 1.25 + (k - 0.35) * 1.6;
    }
  }
  g.add(buildCity());
  return { g, goats, update, goatGround: gy };
}

/**
 * Jerusalem around the Mount, as scenery only: the upper and lower city to the west and south, a few houses on the
 * north, three tall towers far to the west. Seeded, so every visitor sees the same city. Placement and look are
 * imagination; nothing here is a map.
 */
function buildCity() {
  const city = new THREE.Group();
  let seed = 4242;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const houses = [];
  const add = (x, z, w, d, h, tint) => { if (Math.abs(x) < 136 && Math.abs(z) < 136) return; houses.push({ x, z, w, d, h, tint }); };
  // The upper city, west across the valley, climbing; the lower city, south, down the slope; a thinner north.
  for (let i = 0; i < 900; i += 1) {
    const x = -150 - rand() * 560, z = -420 + rand() * 900;
    if (rand() < 0.15) continue;
    add(x, z, 6 + rand() * 9, 6 + rand() * 9, 4 + rand() * 6 + Math.max(0, (-x - 300) * 0.01), rand());
  }
  for (let i = 0; i < 380; i += 1) add(-150 + rand() * 280, 140 + rand() * 360, 5 + rand() * 7, 5 + rand() * 7, 3.5 + rand() * 4, rand());
  for (let i = 0; i < 160; i += 1) add(-140 + rand() * 260, -150 - rand() * 280, 6 + rand() * 8, 6 + rand() * 8, 4 + rand() * 5, rand());
  const base = (x, z) => groundY(x, z);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), houses.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const tints = ["#e8dcc0", "#dccfb1", "#efe4cb", "#d3c4a2", "#e4d2ae"];
  houses.forEach((h, i) => {
    q.setFromAxisAngle(up, (rand() - 0.5) * 0.3);
    m.compose(new THREE.Vector3(h.x, base(h.x, h.z) - 0.5, h.z), q, new THREE.Vector3(h.w, h.h, h.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(tints[Math.floor(h.tint * tints.length)]));
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  city.add(mesh);
  // Three tall towers far to the west, and a long wall along the ridge.
  const stone = new THREE.MeshLambertMaterial({ color: "#d8c8a4", flatShading: true });
  for (const [x, z, h] of [[-640, 40, 42], [-660, 70, 36], [-615, 95, 30]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(18, h, 18), stone);
    t.position.set(x, base(x, z) + h / 2, z);
    city.add(t);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(8, 9, 900), stone);
  ridge.position.set(-720, base(-720, 0) + 4.5, 20);
  city.add(ridge);
  return city;
}
