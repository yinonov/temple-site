// The living scene: the Temple Mount under the real sky, with everyone where the world says they are. The camera is
// the visitor's eyes and is set from outside (controls.js). Looks are placeholders until the art direction is chosen;
// everything visual goes through this file so a new figure style can replace `figure()` in one place.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { C, lerp, clamp, sstep, mat, glow, flame, put, box, halo, figure, poseFigure, goat, flag, setLowTextures, GRADE } from "./kit.js";
import { atmosphereAt } from "./atmosphere.js";
import { installHaze } from "./haze.js";
import { initTextures } from "./textures.js";
import { COURTYARD } from "./courtyard.js";
import { loadDressing } from "./dressing.js";
import { createLife } from "./life.js";
import { loadFigureFamily, createFigureRigs } from "./figures.js";
import { loadFar, createFarCrowd } from "./far-crowd.js";
import { buildTemple } from "./temple.js";
import { buildLand } from "./land.js";
import { loadHero, hero, poseHero } from "./hero.js";
import { loadWalls, wallInstances } from "./walls.js";
import { buildLab } from "./lab.js";
import { selectTier, createGovernor, readDevice, pixelRatioFor } from "./tiers.js";
import { sunPosition } from "../world/sky.js";
import { RIPPLES } from "../world/jericho.js";

const DEG = Math.PI / 180;
if (flag("haze", true)) installHaze(); // height-thinned fog, before any material compiles
const PRIEST = { robe: "#f7f2e6", headwear: "turban", headColor: "#f7f2e6" };
const LOOKS = {
  priest: (i) => ({ ...PRIEST, sash: ["#b23a48", "#3d6fb5", "#7a4fb0", "#c2572b", "#2f8a7a", "#b0457a"][i % 6], beard: ["#3a2a1e", "#5a4632", "#2a2019", "#8a8078"][i % 4], skin: ["#cf9f72", "#b9855a", "#d8ac80"][i % 3] }),
  officer: () => ({ ...PRIEST, sash: "#6a4fb0", headColor: "#e6c15a", beard: "#d9d4cc", skin: "#c99668", scale: 1.06 }),
  levite: (i) => ({ robe: "#dfe7ee", sash: ["#3d6fb5", "#2f6a8a", "#4a5fa8"][i % 3], headwear: "cap", headColor: ["#3d6fb5", "#2f6a8a", "#4a5fa8"][i % 3], beard: ["#3a2a1e", "#5a4632"][i % 2], skin: "#c18e62", scale: 1.04 }),
  villager: (i) => ({ robe: ["#c9753a", "#3f8f8a", "#b0457a", "#8a6a3a", "#5f7a3a", "#a04a3a"][i % 6], sash: ["#f1e4c8", "#3a2a1e", "#d9b25a"][i % 3], headwear: ["scarf", "cap", "hair", "scarf"][i % 4], headColor: ["#f1e4c8", "#d99a3e", "#4a2f1c", "#c9b9a0"][i % 4], beard: i % 3 ? null : "#3a2a1e", skin: ["#c18e62", "#d4a476", "#a9784e"][i % 3], scale: i % 7 === 3 ? 0.68 : 0.95 + (i % 5) * 0.03 }),
};

/** Direction to a body at altitude/azimuth (degrees) in the layout frame (x east, y up, z south). */
const skyDir = (v, alt, az) => v.set(Math.sin(az * DEG) * Math.cos(alt * DEG), Math.sin(alt * DEG), -Math.cos(az * DEG) * Math.cos(alt * DEG));

export function createWorldScene(canvas, layout, places, cast, { lowPower = false } = {}) {
  // `lowPower` only decides antialiasing, which is fixed when the context is made; everything else follows the tier.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  // A software renderer (SwiftShader, llvmpipe) is far too slow for the physically based shaders at full size: draw it at
  // 60% and skip the post-processing, so walking and tests stay usable.
  const device = readDevice(renderer), software = device.software;
  const chosen = selectTier(device);
  const governor = createGovernor(chosen.name, { settings: chosen.settings });
  const tier = governor.state; // { name, settings }: what to draw with, stepped down by the governor
  const fixedTier = new URLSearchParams(location.search).get("governor") === "0"; // tests and measurements only: hold the tier still
  const pxOverride = Number(new URLSearchParams(location.search).get("px")) || null; // tests and measurements only
  let cssSize = [innerWidth, innerHeight];
  const pixelRatio = () => (software ? 0.6 : pxOverride ?? pixelRatioFor(tier.settings, device.dpr, cssSize[0], cssSize[1]));
  renderer.setPixelRatio(pixelRatio());
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
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { dawn: { value: 0 }, sunDir: { value: sunDir }, envDesat: { value: 0 } },
    vertexShader: "varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float dawn; uniform float envDesat; uniform vec3 sunDir; varying vec3 d;
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
        // Only when baking the light the world receives: less blue, as the sun-warmed stone bounces light into the shade
        c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))) * vec3(1.08, 1.0, 0.86), envDesat);
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

  // Image-based light: the sky itself, baked to a small environment map each time it has moved enough to matter. It lights
  // the stone, cloth and metal the way the real sky would, and gives the gold something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  let envKey = "", envTarget = null;
  const bakeEnv = (dawn, sunDeg, azimuth) => {
    const key = `${Math.round(dawn * 30)}|${Math.round(sunDeg / 2)}|${Math.round(azimuth / 15)}`;
    if (key === envKey) return;
    envKey = key;
    sky.material.uniforms.envDesat.value = 0.6;
    const next = pmrem.fromScene(envScene, 0, 1, 10000);
    sky.material.uniforms.envDesat.value = 0;
    envTarget?.dispose();
    envTarget = next;
    scene.environment = next.texture;
  };

  const hemi = new THREE.HemisphereLight("#3a4a9a", "#1a1420", 1);
  const sun = new THREE.DirectionalLight("#ffb070", 0);
  sun.castShadow = true;
  sun.castShadow = tier.settings.shadowMap > 0;
  renderer.shadowMap.enabled = sun.castShadow;
  sun.shadow.mapSize.set(tier.settings.shadowMap || 1024, tier.settings.shadowMap || 1024);
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
  initTextures(renderer);
  setLowTextures(tier.settings.textureSet === "1k" || software);
  const temple = buildTemple(layout, places, { fine: flag("stone", true) }); // `?stone=0` for the plain look
  const land = buildLand(RIPPLES.length);
  const rippleTimes = RIPPLES.map((r) => r.t);
  scene.add(temple.g, land.g);
  const lab = new URLSearchParams(location.search).get("lab"); // `?lab=lamp`: a single object on a plinth, in the real light
  if (lab) scene.add(buildLab(lab, places));
  // Dressed-stone bays (built in Blender) stand in place of the plain tall walls; `?walls=0` keeps the plain ones. Software
  // renderers and the low tier keep the plain walls by default (too slow); tiers without a shadow map get bays that cast none.
  if (flag("walls", !software && tier.name !== "low")) {
    loadWalls().then((bays) => {
      for (const o of [...temple.walls.parts, temple.walls.merlons]) o.visible = false;
      temple.g.add(wallInstances(bays, temple.walls.runs, { shadows: tier.settings.shadowMap > 0 }));
    }).catch((e) => console.warn("wall assets failed", e));
  }

  // Flames on the lamp stands, their smoke, cloth that sways, dust in the sun and birds (life.js), all from the instant; `?life=0` leaves them out.
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const life = flag("life", true) ? createLife({ scene, calm, level: tier.settings.lifeEffects }) : null;

  // The courtyard slice's set dressing (courtyard.js), after the walls; `?dress=0` leaves it out.
  if (flag("dress", true)) {
    loadDressing(COURTYARD, { F, shadows: tier.settings.shadowMap > 0, life }).then((g) => scene.add(g)).catch((e) => console.warn("dressing failed", e));
  }

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
      ox.head.traverse((o) => { if (o.isMesh && o.geometry.type === "ConeGeometry" && o.position.y > 0.4) o.material = new THREE.MeshStandardMaterial({ color: "#e0b040", emissive: "#3a2806", roughness: 0.35, metalness: 0.85 }); });
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
    f.g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) o.castShadow = tier.settings.shadowMap > 0; });
    f.g.visible = false;
    f.look = who.look;
    figures[who.id] = f;
    scene.add(f.g);
  }

  // Skinned, animated people (figures.js) for the nearest priests, Levites and officers; the rest stay placeholders. The
  // pool is as large as the tier allows and appears once its files have loaded; `?rigs=0` keeps the placeholders.
  let lastList = [];
  let rigs = null, family = null, far = null, farState = flag("far", true) ? "idle" : "off"; // the far level loads when a crowd first needs it
  const showPeople = flag("people", true); // `?people=0` (tests): an empty courtyard, so the scene's own motion can be told from the people's
  const forceLod = new URLSearchParams(location.search).get("lod"); // tests only: draw every rig at one level of detail
  const RIGGED = new Set(["priest", "levite", "officer"]);
  if (flag("rigs", true)) {
    loadFigureFamily().then((fam) => { family = fam; rigs = createFigureRigs(scene, fam, { size: tier.settings.maxFigures, shadows: tier.settings.shadowMap > 0 });
      const only = new URLSearchParams(location.search).get("maxfigures"); // tests only: draw at most this many people as rigs (0: everyone as far figures)
      if (only !== null && Number.isFinite(Number(only))) rigs.setLimit(Number(only)); }).catch((e) => console.warn("figures failed", e));
  }

  // Finishing: ambient occlusion in the corners and under the figures, a soft bloom on flame and gold, and tone mapping
  // last. The medium and low tiers skip it and draw straight to the screen.
  let composer = null, bloom = null;
  if (tier.settings.post !== "none" && !software) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    // The occlusion pass draws depth and normals for everything; glows, flames, the sky and other see-through things must
    // not count as walls, so they are hidden for that pass (relies on the pinned three 0.179.1 addon's hooks).
    const loose = [], baseHide = ao._overrideVisibility.bind(ao), baseShow = ao._restoreVisibility.bind(ao);
    ao._overrideVisibility = () => {
      baseHide();
      scene.traverse((o) => { if ((o.isMesh || o.isSprite) && o.visible && !(o.material.isMeshStandardMaterial && !o.material.transparent)) { o.visible = false; loose.push(o); } });
    };
    ao._restoreVisibility = () => { baseShow(); for (const o of loose.splice(0)) o.visible = true; };
    if (new URLSearchParams(location.search).get("ao") === "1") composer.addPass(ao); // opt-in: it roughly halves the frame rate on an integrated GPU (see docs/fidelity-spike.md)
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // Fidelity spike: `?hero=1` swaps the robed people for skinned, animated characters once their files have loaded.
  if (new URLSearchParams(location.search).get("hero") === "1") {
    loadHero().then((kit) => {
      for (const who of cast) {
        if (!who.look || who.look === "ox" || who.look === "villager" || !figures[who.id]) continue;
        const old = figures[who.id];
        const i = Number(who.id.replace(/\D/g, "")) || 0;
        const fresh = hero(kit, { ...LOOKS[who.look](i), phase: old.phase });
        fresh.g.visible = false;
        scene.remove(old.g);
        figures[who.id] = fresh;
        scene.add(fresh.g);
      }
    }).catch((e) => console.warn("hero assets failed", e));
  }

  const tmp = new THREE.Vector3(), moonDir = new THREE.Vector3();
  let portrait = false;
  // The governor steps presentation down when frames run slow. It reads real frame times and changes nothing in the world.
  let frameCount = 0;
  let started = performance.now(), lastFrame = started, frameMs = 16, frameAt = started;
  function applyGovernor(step) {
    if (!step) return;
    const s = tier.settings;
    if (step.what === "pixelRatio" || step.what === "tier") { renderer.setPixelRatio(pixelRatio()); resizeNow(); }
    if (step.what === "rigs" || step.what === "tier") rigs?.setLimit(s.maxFigures);
    if (step.what === "lifeEffects" || step.what === "tier") life?.setLevel(s.lifeEffects);
    if (step.what === "shadowMap" || step.what === "tier") {
      const on = s.shadowMap > 0;
      sun.castShadow = on; renderer.shadowMap.enabled = on;
      if (on) sun.shadow.mapSize.set(s.shadowMap, s.shadowMap);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      for (const f of Object.values(figures)) f.g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) o.castShadow = on; });
    }
  }
  let size = [1, 1];
  const resizeNow = () => { renderer.setSize(size[0], size[1], false); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(size[0], size[1]); } };

  /**
   * Draw the world at one moment, seen from `eye` ({ x, y, z, yaw, pitch }). `flight`, when the visitor follows the
   * sound to Jericho, takes the camera instead: { s, pos, look, zoom, smell } (see world/jericho.js).
   */
  function update(world, eye, dt, time, flight = null) {
    frameAt = performance.now(); frameMs = frameAt - lastFrame; lastFrame = frameAt;
    const { dawn, sun: sunDeg, azimuth, embers, gate, wheel } = world.env;
    const day = sstep(0.1, 0.9, dawn), night = 1 - sstep(0, 0.6, dawn);
    const air = atmosphereAt({ dawn, sun: sunDeg }); // the air and light, from the sun's height (atmosphere.js)
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
    bakeEnv(dawn, sunDeg, azimuth);
    scene.environmentIntensity = air.envIntensity;
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
    // The haze warms toward the sun when the camera faces it.
    const facing = Math.max(0, -Math.sin(camera.rotation.y) * sunDir.x - Math.cos(camera.rotation.y) * sunDir.z) / Math.max(0.0001, Math.hypot(sunDir.x, sunDir.z));
    scene.fog.color.setRGB(...air.fog.color.map((v, i) => lerp(v, air.haze.toward[i], air.haze.strength * facing * facing)), THREE.LinearSRGBColorSpace);
    scene.fog.density = air.fog.density * (flag("haze", true) ? 0.7 : 1) * (flight ? 0.4 : 1); // the far land stays clear in flight
    hemi.color.setRGB(...air.hemi.color, THREE.LinearSRGBColorSpace);
    hemi.groundColor.setRGB(...air.hemi.ground, THREE.LinearSRGBColorSpace);
    hemi.intensity = air.hemi.intensity;
    sun.color.setRGB(...air.sun.color, THREE.LinearSRGBColorSpace);
    sun.intensity = air.sun.intensity;
    renderer.shadowMap.autoUpdate = air.sun.lit > 0;
    GRADE.shade.value.setRGB(...air.grade.shade, THREE.LinearSRGBColorSpace);
    GRADE.light.value.setRGB(...air.grade.light, THREE.LinearSRGBColorSpace);
    GRADE.amount.value = air.grade.amount;
    sun.target.position.copy(camera.position);
    sun.position.copy(sunDir).multiplyScalar(320).add(camera.position);
    temple.gold.emissive.copy(C("#33230a").lerp(C("#a8740f"), sstep(0.3, 0.95, dawn)));
    renderer.toneMappingExposure = air.exposure;

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
    const candidates = [];
    let k = 0;
    for (const [id, f] of Object.entries(figures)) {
      const p = world.people[id];
      const d = Math.hypot(p.pos[0] - eye.x, p.pos[2] - eye.z);
      const near = showPeople && p.visible && d < tier.settings.seen && d > 0.7; // the unseen visitor passes through people
      f.g.visible = near;
      // A figure that is not drawn is not walked over by the scene's matrix update; a placeholder far away (a speck, whose stride no
      // one can read, from 30 m) is posed and walked over one frame in three, and drawn from its last pose in between.
      f.g.matrixWorldAutoUpdate = near && (!(f.shown && d > 30) || (frameCount + k) % 3 === 0);
      f.shown = near;
      k += 1;
      f.drawn = false;
      if (near && rigs && RIGGED.has(f.look)) candidates.push({ id, look: f.look, actor: p, d, dayKey: world.sun.key, f });
    }
    let drawnRigs = new Map(), farDrawn = new Set();
    if (rigs) {
      if (rigs.shadowsOn !== tier.settings.shadowMap > 0) { rigs.shadowsOn = tier.settings.shadowMap > 0; rigs.setShadows(rigs.shadowsOn); }
      candidates.sort((a, b) => a.d - b.d);
      const lod = { ...tier.settings.figureLod, force: forceLod === "far" ? undefined : forceLod };
      if (forceLod === "far") lod.mid = 0; // tests only: no rig, everyone is drawn by the far level
      if (far) for (const c of candidates) c.walkT = far.walkTOf(c.id); // a person who takes a rig carries on from their far walk phase
      drawnRigs = rigs.place(candidates, { seconds: world.t / 1000, frame: frameCount }, Math.min(dt, 0.1), lod);
      // Everyone the rigs do not draw fully is drawn by the far level (a crowd: it loads on first need), up to the tier's crowd cap.
      if (farState === "idle" && (candidates.length - drawnRigs.size >= 4 || forceLod === "far")) {
        farState = "loading";
        loadFar().then((f) => { far = createFarCrowd(scene, f, { capacity: 160, shadows: tier.settings.shadowMap > 0 }); farState = "ready"; }).catch((e) => { farState = "off"; console.warn("far figures failed", e); });
      }
      if (far) {
        for (const c of candidates) { c.fade = 1 - (drawnRigs.get(c.id) ?? 0); c.walkT = drawnRigs.has(c.id) ? rigs.walkTOf(c.id) : undefined; }
        farDrawn = far.place(candidates, { seconds: world.t / 1000, dt: Math.min(dt, 0.1), meta: family.meta, cap: Math.max(0, tier.settings.maxCrowd - drawnRigs.size) });
      }
      lastList = candidates.map((c) => ({ id: c.id, d: +c.d.toFixed(2), rig: +(drawnRigs.get(c.id) ?? 0).toFixed(2), far: farDrawn.has(c.id) }));
      for (const c of candidates) {
        const f = c.f, appear = drawnRigs.get(c.id) ?? 0;
        // With the far level on, everyone it could draw is hidden as a placeholder: those past the tier's crowd cap are simply not drawn.
        if (appear >= 0.5 || far || farDrawn.has(c.id)) { f.g.visible = false; f.g.matrixWorldAutoUpdate = false; f.drawn = true; }
      }
    }
    frameCount += 1;
    for (const [id, f] of Object.entries(figures)) {
      const p = world.people[id];
      if (!f.g.visible || !f.g.matrixWorldAutoUpdate) continue;
      if (f.ox) { f.g.position.set(...p.pos); if (p.heading !== null) f.g.rotation.y = p.heading - Math.PI / 2; continue; }
      if (f.hero) poseHero(f, p, world.t / 1000, dt); else poseFigure(f, p, time, dt);
      if (f.held?.userData.flames) for (const fl of f.held.userData.flames) fl.visible = dawn < 0.6;
    }
    land.update(flight ? flight.s : -1000, time, flight?.smell ?? 0, rippleTimes);
    life?.update(world, eye, sunDir);
    if (composer && tier.settings.post !== "none") composer.render(); else renderer.render(scene, camera);
    if (!fixedTier) for (const step of governor.feed(frameMs, frameAt - started) ?? []) applyGovernor(step);
  }

  return {
    update,
    camera,
    resize(w, h) {
      size = [w, h]; cssSize = [innerWidth, innerHeight]; renderer.setPixelRatio(pixelRatio());
      resizeNow();
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
    /** The courtyard's life effects (flame, smoke, cloth, dust, birds), or null with `?life=0`. */
    life,
    /** The tier in force ("high", "medium", "low") and the settings the governor has left it with. */
    /** For measuring: how many objects the scene holds, and how many a matrix update walks. */
    census: () => { let all = 0, walked = 0; const walk = (o, on) => { all += 1; if (on) walked += 1; for (const c of o.children) walk(c, on && o.matrixWorldAutoUpdate); }; walk(scene, true); const parts = scene.children.map((c) => { let n = 0; c.traverse(() => { n += 1; }); return `${c.type}${c.name ? `:${c.name}` : ""}=${n}`; }).filter((x) => !/=1$/.test(x)); return { all, walked, parts }; },
    tier: () => ({ name: tier.name, settings: tier.settings, steps: tier.steps }),
    /** How many people are drawn by skinned rigs, and at which level of detail. */
    figureProbe: () => (rigs ? rigs.probe() : []),
    /** Every person who could be a figure, nearest first, with how fully a rig draws them and whether the far level does (tests). */
    figureList: () => lastList,
    figures: () => ({ ...(rigs ? rigs.info() : { size: 0, drawn: 0, near: 0, mid: 0 }), far: far ? far.info().drawn : 0, farState }),
    renderer,
    /** A goat sneezes `s` seconds into the flight. */
    sneeze(goat, s) { if (land.goats[goat]) land.goats[goat].sneeze = s; },
  };
}
