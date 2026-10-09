// The living scene: the Temple Mount under the real sky, with everyone where the world says they are. The camera is
// the visitor's eyes and is set from outside (controls.js). Looks are placeholders until the art direction is chosen;
// everything visual goes through this file so a new figure style can replace `figure()` in one place.
import * as THREE from "three";
import { C, lerp, clamp, sstep, mat, glow, flame, put, box, halo, figure, poseFigure, goat } from "./kit.js";
import { buildTemple } from "./temple.js";
import { buildLand } from "./land.js";
import { sunPosition } from "../world/sky.js";
import { RIPPLES } from "../world/jericho.js";

const DEG = Math.PI / 180;
const PRIEST = { robe: "#f7f2e6", headwear: "turban", headColor: "#f7f2e6" };
const LOOKS = {
  priest: (i) => ({ ...PRIEST, sash: ["#b23a48", "#3d6fb5", "#7a4fb0", "#c2572b", "#2f8a7a", "#b0457a"][i % 6], beard: ["#3a2a1e", "#5a4632", "#2a2019", "#8a8078"][i % 4], skin: ["#cf9f72", "#b9855a", "#d8ac80"][i % 3] }),
  officer: () => ({ ...PRIEST, sash: "#6a4fb0", headColor: "#e6c15a", beard: "#d9d4cc", skin: "#c99668", scale: 1.06 }),
  levite: (i) => ({ robe: "#dfe7ee", sash: ["#3d6fb5", "#2f6a8a", "#4a5fa8"][i % 3], headwear: "cap", headColor: ["#3d6fb5", "#2f6a8a", "#4a5fa8"][i % 3], beard: ["#3a2a1e", "#5a4632"][i % 2], skin: "#c18e62", scale: 1.04 }),
  villager: (i) => ({ robe: ["#c9753a", "#3f8f8a", "#b0457a", "#8a6a3a", "#5f7a3a", "#a04a3a"][i % 6], sash: ["#f1e4c8", "#3a2a1e", "#d9b25a"][i % 3], headwear: ["scarf", "cap", "hair", "scarf"][i % 4], headColor: ["#f1e4c8", "#d99a3e", "#4a2f1c", "#c9b9a0"][i % 4], beard: i % 3 ? null : "#3a2a1e", skin: ["#c18e62", "#d4a476", "#a9784e"][i % 3], scale: i % 7 === 3 ? 0.68 : 0.95 + (i % 5) * 0.03 }),
};
const SEEN = 90; // metres beyond which figures are not drawn

/** Direction to a body at altitude/azimuth (degrees) in the layout frame (x east, y up, z south). */
const skyDir = (v, alt, az) => v.set(Math.sin(az * DEG) * Math.cos(alt * DEG), Math.sin(alt * DEG), -Math.cos(az * DEG) * Math.cos(alt * DEG));

export function createWorldScene(canvas, layout, places, cast, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#0b1030", 0.004);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 9000);
  camera.rotation.order = "YXZ";
  const { F, TOP } = places;
  const [AX, , AZ] = places.ALTAR;

  // Sky dome: the side of the sun wakes first; a rose and orange band sits on the horizon under it.
  const sunDir = new THREE.Vector3(1, 0, 0);
  const sky = put(new THREE.SphereGeometry(7000, 32, 18), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { dawn: { value: 0 }, sunDir: { value: sunDir } },
    vertexShader: "varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float dawn; uniform vec3 sunDir; varying vec3 d;
      void main(){
        vec3 n = normalize(d);
        float h = max(n.y, 0.0);
        vec3 flatSun = normalize(vec3(sunDir.x, 0.0001, sunDir.z));
        float toward = pow(max(dot(normalize(vec3(n.x, 0.0, n.z)), vec3(flatSun.x, 0.0, flatSun.z)), 0.0), 3.0);
        float k = clamp(dawn * 1.2 + (toward - 0.3) * 0.35 * (1.0 - dawn) * step(0.01, dawn), 0.0, 1.0);
        float g = pow(1.0 - h, 2.4);
        vec3 night = mix(vec3(0.016, 0.024, 0.09), vec3(0.06, 0.085, 0.23), g);
        vec3 day = mix(vec3(0.27, 0.52, 0.86), vec3(0.99, 0.9, 0.76), g);
        vec3 c = mix(night, day, smoothstep(0.0, 1.0, k));
        float low = 1.0 - smoothstep(0.05, 0.3, sunDir.y);
        float band = smoothstep(0.02, 0.4, dawn) * low;
        c += vec3(1.0, 0.46, 0.18) * band * toward * exp(-h * 7.0) * 0.95;
        c += vec3(0.8, 0.26, 0.44) * band * (0.3 + 0.7 * toward) * exp(-h * 3.2) * 0.34;
        c += vec3(1.0, 0.82, 0.55) * pow(max(dot(n, sunDir), 0.0), 60.0) * 0.45 * smoothstep(0.4, 0.6, dawn);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky);
  // Stars from a fixed seed, so every visitor sees the same sky.
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const starPos = [];
  for (let i = 0; i < 1100; i += 1) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const v = new THREE.Vector3(r * Math.cos(a), Math.abs(u) * 0.95 + 0.03, r * Math.sin(a)).normalize();
    starPos.push(...v.multiplyScalar(6500).toArray());
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: "#fff6dc", size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  scene.add(stars);
  const moon = new THREE.Group();
  const moonDisc = put(new THREE.SphereGeometry(130, 20, 12), glow("#fbf3da", 0.999), 0, 0, 0, moon);
  const moonHalo = halo("#aebfff", 1300, 0.5, moon);
  scene.add(moon);
  const sunDisc = new THREE.Group();
  const sunCore = halo("#fff6dc", 620, 1, sunDisc);
  const sunHalo = halo("#ffc27a", 2300, 0.5, sunDisc);
  scene.add(sunDisc);

  const hemi = new THREE.HemisphereLight("#3a4a9a", "#1a1420", 1);
  const sun = new THREE.DirectionalLight("#ffb070", 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 700 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.3;
  const moonLight = new THREE.DirectionalLight("#8598e8", 0.5);
  const altarLight = new THREE.PointLight("#ff8a3c", 0, 260, 1.2);
  altarLight.position.set(AX, TOP + 5, AZ);
  const gateLight = new THREE.PointLight("#ffd27a", 0, 70, 1.4);
  gateLight.position.set(-35, F + 5, AZ);
  const torchLight = new THREE.PointLight("#ff9c3c", 0, 26, 1.5);
  torchLight.position.set(4.4, F + 3.4, AZ);
  scene.add(hemi, sun, sun.target, moonLight, moonLight.target, altarLight, gateLight, torchLight);

  // The menorah's light inside the hall.
  const lampLight = new THREE.PointLight("#ffc46a", 6, 18, 1.6);
  lampLight.position.set(-52.2, F + 2.2, -43.9);
  scene.add(lampLight);
  const temple = buildTemple(layout, places);
  const land = buildLand(RIPPLES.length);
  const rippleTimes = RIPPLES.map((r) => r.t);
  scene.add(temple.g, land.g);

  const torch = (hand) => {
    box(0.07, 1.5, 0.07, mat("#6e4526"), 0, 0.5, 0, hand);
    const f = put(new THREE.ConeGeometry(0.16, 0.5, 5), flame("#ffb24a", 0.95), 0, 1.45, 0, hand);
    const h = halo("#ff9c3c", 3, 0.7, hand);
    h.position.y = 1.45;
    hand.userData.flames = [f, h];
  };
  const figures = {};
  const counts = {};
  for (const who of cast) {
    if (who.look === "ox") {
      // The ox of the first fruits: horns covered with gold (Mishnah Bikkurim 3:3), a placeholder like every figure.
      const ox = goat("#8a5a36", 1.9);
      ox.head.traverse((o) => { if (o.isMesh && o.geometry.type === "ConeGeometry" && o.position.y > 0.4) o.material = new THREE.MeshLambertMaterial({ color: "#e0b040", emissive: "#3a2806", flatShading: true }); });
      ox.g.visible = false;
      figures[who.id] = { g: ox.g, ox: true };
      scene.add(ox.g);
      continue;
    }
    const i = (counts[who.look] = (counts[who.look] ?? -1) + 1);
    const look = LOOKS[who.look](i);
    let h = 7;
    for (const ch of who.id) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    const f = figure({ ...look, prop: who.id === "officer" ? torch : null, phase: (h / 9973) * 6 });
    f.g.traverse((o) => { if (o.isMesh && o.material.isMeshLambertMaterial) o.castShadow = !lowPower; });
    f.g.visible = false;
    figures[who.id] = f;
    scene.add(f.g);
  }

  const tmp = new THREE.Vector3(), moonDir = new THREE.Vector3();
  let portrait = false;

  /**
   * Draw the world at one moment, seen from `eye` ({ x, y, z, yaw, pitch }). `flight`, when the visitor follows the
   * sound to Jericho, takes the camera instead: { s, pos, look, zoom, smell } (see world/jericho.js).
   */
  function update(world, eye, dt, time, flight = null) {
    const { dawn, sun: sunDeg, azimuth, embers, gate, wheel } = world.env;
    const day = sstep(0.1, 0.9, dawn), night = 1 - sstep(0, 0.6, dawn);
    if (flight) {
      camera.position.set(...flight.pos);
      camera.lookAt(tmp.set(...flight.look));
      eye = { x: flight.pos[0], y: flight.pos[1], z: flight.pos[2] };
    } else {
      camera.position.set(eye.x, eye.y, eye.z);
      camera.rotation.set(eye.pitch, eye.yaw, 0);
    }
    const fov = (portrait ? 72 : 62) / (flight?.zoom ?? 1);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    skyDir(sunDir, sunDeg, azimuth);
    sky.material.uniforms.dawn.value = dawn;
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.material.opacity = clamp(1 - dawn * 2.1);
    // The moon falls behind the sun by about 49 minutes a day of its age: it stands roughly where the sun stood then.
    const moonAge = world.calendar.day - 1, mp = sunPosition(world.t - moonAge * 48.8 * 60000);
    skyDir(moonDir, mp.altitude, mp.azimuth);
    const fullness = 1 - Math.abs(moonAge - 14.5) / 14.5;
    moon.position.copy(moonDir).multiplyScalar(6000).add(camera.position);
    moon.visible = moonDir.y > -0.05 && dawn < 0.6 && moonAge > 1;
    moonDisc.material.opacity = (1 - sstep(0.2, 0.5, dawn)) * (0.35 + 0.65 * fullness);
    moonHalo.material.opacity = 0.5 * (1 - sstep(0.1, 0.45, dawn)) * fullness;
    moonLight.position.copy(moonDir).multiplyScalar(300).add(camera.position);
    moonLight.target.position.copy(camera.position);
    moonLight.intensity = 0.95 * night * (0.35 + 0.65 * fullness) * (moonDir.y > 0 ? 1 : 0.4);
    sunDisc.position.copy(sunDir).multiplyScalar(6000).add(camera.position);
    sunHalo.material.opacity = 0.5 * sstep(-1, 6, sunDeg);
    sunCore.material.opacity = sstep(-0.5, 3, sunDeg);
    const horizon = C("#10183c").lerp(C("#f0c6a2"), sstep(0.05, 0.85, dawn)).lerp(C("#d6e4f2"), sstep(0.8, 1, dawn) * 0.6);
    scene.fog.color.copy(horizon);
    scene.fog.density = lerp(0.0042, 0.0016, dawn) * (flight ? 0.4 : 1); // the far land stays clear in flight
    const blush = sstep(0.08, 0.45, dawn) * (1 - sstep(0.55, 1, dawn));
    hemi.color.copy(C("#3c4fae").lerp(C("#d9a9bd"), blush * 0.7).lerp(C("#cfe1ff"), day * day));
    hemi.groundColor.copy(C("#14122c").lerp(C("#c9a777"), day));
    hemi.intensity = lerp(1.05, 1.5, day) + blush * 0.7;
    const lit = sstep(0.2, 2.4, sunDeg);
    sun.color.copy(C("#ff8a4a").lerp(C("#fff0d2"), sstep(2, 20, sunDeg)));
    sun.intensity = lit * lerp(3.4, 2.5, sstep(4, 20, sunDeg));
    renderer.shadowMap.autoUpdate = lit > 0;
    sun.target.position.copy(camera.position);
    sun.position.copy(sunDir).multiplyScalar(320).add(camera.position);
    temple.gold.emissive.copy(C("#33230a").lerp(C("#a8740f"), sstep(0.3, 0.95, dawn)));
    renderer.toneMappingExposure = lerp(1.05, 0.92, day);

    // Fire, embers, smoke and torches.
    const flick = 0.84 + 0.1 * Math.sin(time * 11) + 0.07 * Math.sin(time * 23.7);
    const heat = lerp(0.75, 1.3, embers);
    altarLight.intensity = flick * heat * lerp(22, 8, day);
    const { emberBed, flames, halo: fireHalo, smoke, sparks } = temple.fire;
    emberBed.material.color.copy(C("#8a2408").lerp(C("#ffc050"), clamp(embers * flick)));
    for (const f of flames) {
      const lick = 0.8 + 0.28 * Math.sin(time * 6.3 + f.o) + 0.14 * Math.sin(time * 14.1 + f.o * 2);
      f.m.scale.set(1, lick * heat, 1);
      f.m.position.set(f.x + Math.sin(time * 3.1 + f.o) * 0.12, 1 + (f.h * lick * heat) / 2, f.z + Math.cos(time * 2.7 + f.o) * 0.12);
      f.m.rotation.set(Math.sin(time * 2.2 + f.o) * 0.12, time * 0.6 + f.o, Math.cos(time * 1.9 + f.o) * 0.12);
      f.m.material.opacity = lerp(0.42, 0.8, day);
    }
    fireHalo.scale.setScalar(lerp(20, 9, day) * (0.92 + 0.08 * flick) * lerp(0.9, 1.15, embers));
    fireHalo.material.opacity = lerp(0.6, 0.3, day);
    for (const s of smoke) {
      const k = (time * 0.06 + s.o) % 1;
      s.m.position.set(Math.sin(k * 5 + s.o * 20) * (0.3 + k * 1.6), 3.5 + k * 52, Math.cos(k * 4 + s.o * 9) * (0.3 + k * 1.6));
      s.m.scale.setScalar(0.9 + k * 3.6);
      s.m.material.opacity = 0.3 * Math.sin(k * Math.PI) * lerp(0.5, 1, day);
    }
    for (const s of sparks) {
      const k = (time * 0.42 + s.o) % 1;
      s.m.position.set(Math.cos(s.a + k * 3) * (0.6 + k * 1.6), 1.2 + k * 8 * heat, Math.sin(s.a + k * 3) * (0.6 + k * 1.6));
      s.m.visible = k < 0.9 && (embers > 0.5 || s.o < 0.4);
    }
    temple.torches.forEach((t, i) => {
      const f = 0.85 + 0.22 * Math.sin(time * 9 + i * 2);
      t.f.scale.setScalar(f);
      t.f.visible = t.h.visible = dawn < 0.86;
      t.h.material.opacity = 0.75 * f * (1 - sstep(0.5, 0.86, dawn));
    });
    torchLight.intensity = 9 * flick * (1 - sstep(0.4, 0.86, dawn));
    temple.doors.forEach(({ hinge, side }) => { hinge.rotation.y = side * gate * 1.5; });
    temple.bolt.visible = gate < 0.05;
    const fest = world.festive;
    temple.festive.willows.visible = fest.willows;
    temple.festive.stands.visible = fest.stands;
    temple.festive.flames.forEach((f, i) => { f.visible = fest.lit; f.scale.setScalar(0.85 + 0.2 * Math.sin(time * 7 + i)); });
    temple.festive.glows.forEach((h) => { h.material.opacity = fest.lit ? 0.85 * flick : 0; });
    temple.festive.chanukah.visible = fest.chanukah;
    if (fest.lit) { hemi.color.lerp(C("#ffcf8a"), 0.35); hemi.intensity += 0.55; } // "no courtyard in Jerusalem unlit"
    temple.lamps.forEach((l, i) => { l.scale.setScalar(0.85 + 0.2 * Math.sin(time * 8 + i * 1.3)); });
    lampLight.intensity = 6 * flick;
    temple.doorHalo.scale.setScalar(1 + gate * 13);
    temple.doorHalo.material.opacity = gate * 0.55;
    temple.spill.material.opacity = gate * 0.55;
    gateLight.intensity = gate * 38;
    temple.wheel.rotation.x -= dt * 3.4 * (wheel ?? 0);

    // People.
    for (const [id, f] of Object.entries(figures)) {
      const p = world.people[id];
      const d = Math.hypot(p.pos[0] - eye.x, p.pos[2] - eye.z);
      const near = p.visible && d < SEEN && d > 0.7; // the unseen visitor passes through people
      f.g.visible = near;
      if (!near) continue;
      if (f.ox) { f.g.position.set(...p.pos); if (p.heading !== null) f.g.rotation.y = p.heading - Math.PI / 2; continue; }
      poseFigure(f, p, time, dt);
      if (f.held?.userData.flames) for (const fl of f.held.userData.flames) fl.visible = dawn < 0.6;
    }
    land.update(flight ? flight.s : -1000, time, flight?.smell ?? 0, rippleTimes);
    renderer.render(scene, camera);
  }

  return {
    update,
    camera,
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      portrait = w < h;
      camera.fov = portrait ? 72 : 62;
      camera.updateProjectionMatrix();
    },
    /** Screen position of a world point, or null when it is behind the camera. */
    project(pos, w, h) {
      tmp.set(...pos).project(camera);
      return tmp.z > 1 || tmp.z < -1 ? null : { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h };
    },
    /** Where a screen point meets the floor plane at height `planeY`, or null when it points at the sky. */
    ground(sx, sy, w, h, planeY) {
      const dir = new THREE.Vector3((sx / w) * 2 - 1, -(sy / h) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
      if (dir.y > -0.02) return null;
      const k = (planeY - camera.position.y) / dir.y;
      return [camera.position.x + dir.x * k, camera.position.z + dir.z * k];
    },
    info: () => renderer.info.render,
    /** A goat sneezes `s` seconds into the flight. */
    sneeze(goat, s) { if (land.goats[goat]) land.goats[goat].sneeze = s; },
  };
}
