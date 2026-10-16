// The courtyard's life: lamp flames and their smoke, cloth that sways, dust turning in the low sun, birds over the court.
// Everything is drawn by shaders from `clock` (life-clock.js: the instant's seconds within its minute) and per-emitter seeds,
// so there is no particle state to accumulate and the same instant looks the same to every visitor. The JS side only sets
// uniforms and a few per-instance switches once a frame. Amounts follow the quality tier (`lifeEffects`), and a visitor who
// asked for reduced motion gets flicker and sway at a tenth of their size.
import * as THREE from "three";
import { EMITTERS, contextOf } from "../world/emitters.js";
import { lifeClock, lifeAmounts, flameFlicker, swayAmount, birdLoop, amplitude, WRAP } from "./life-clock.js";

const GLSL_TAU = "const float TAU = 6.2831853;";
const FLAMES = EMITTERS.filter((e) => e.kind === "flame");
const SMOKES = EMITTERS.filter((e) => e.kind === "smoke");
const DUST = EMITTERS.find((e) => e.kind === "dust");
const FLOCK = EMITTERS.find((e) => e.kind === "bird");
const MAX_SMOKE_PER_LAMP = 5, MAX_BIRDS = 7, MAX_DUST = 320;
const DUST_BOX = [18, 7, 18];

// A small seeded generator for fixed layouts (dust positions): the same every run, never `Math.random()`.
function seeded(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Attribute `sway` on a banner's geometry: 0 on the pole and bar, growing with the height below the bar on the cloth (squared, as it drapes). */
export function addSwayWeights(geometry) {
  const pos = geometry.getAttribute("position"), n = pos.count;
  let top = -Infinity, bottom = Infinity;
  for (let i = 0; i < n; i += 1) { top = Math.max(top, pos.getY(i)); bottom = Math.min(bottom, pos.getY(i)); }
  // The pole runs the whole height, the cloth hangs in front of it (build_dressing.py): tell them apart by depth, using the
  // pole's top (above the bar there is only pole) and the cloth's middle (well below the bar, away from the pole's axis).
  let poleZ = -Infinity, clothZ = Infinity, barY = -Infinity;
  for (let i = 0; i < n; i += 1) if (pos.getY(i) > top - 0.06) poleZ = Math.max(poleZ, pos.getZ(i));
  for (let i = 0; i < n; i += 1) if (pos.getY(i) < top * 0.8 && Math.abs(pos.getX(i)) > 0.2) clothZ = Math.min(clothZ, pos.getZ(i));
  for (let i = 0; i < n; i += 1) if (Math.abs(pos.getX(i)) > 0.6) barY = Math.max(barY, pos.getY(i));
  const cut = (poleZ + clothZ) / 2, hangTop = barY - 0.05;
  const w = new Float32Array(n);
  let hemY = Infinity;
  for (let i = 0; i < n; i += 1) if (pos.getZ(i) > cut && pos.getY(i) < hangTop) hemY = Math.min(hemY, pos.getY(i));
  for (let i = 0; i < n; i += 1) {
    if (pos.getZ(i) <= cut || pos.getY(i) >= hangTop) continue;
    const k = Math.min(1, Math.max(0, (hangTop - pos.getY(i)) / Math.max(0.1, hangTop - hemY)));
    w[i] = k * k;
  }
  geometry.setAttribute("sway", new THREE.BufferAttribute(w, 1));
  return geometry;
}

export function createLife({ scene, calm = false, level = "all" }) {
  const clockU = { value: 0 }, calmU = { value: calm ? 1 : 0 }, windU = { value: 0.3 };
  let amounts = lifeAmounts(level, calm);
  const group = new THREE.Group();
  group.name = "life";
  scene.add(group);

  // ---- lamp flames: one draw, a billboarded teardrop per lit lamp ---------------------------------------------------
  const flameGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1, 1, 3);
  quad.translate(0, 0.5, 0);
  flameGeo.index = quad.index;
  flameGeo.setAttribute("position", quad.getAttribute("position"));
  flameGeo.setAttribute("uv", quad.getAttribute("uv"));
  const flamePos = new Float32Array(FLAMES.length * 3), flameSeed = new Float32Array(FLAMES.length), flameOn = new Float32Array(FLAMES.length);
  FLAMES.forEach((e, i) => { flamePos.set(e.at, i * 3); flameSeed[i] = (e.seed % 1000) / 1000; });
  flameGeo.setAttribute("iPos", new THREE.InstancedBufferAttribute(flamePos, 3));
  flameGeo.setAttribute("iSeed", new THREE.InstancedBufferAttribute(flameSeed, 1));
  const flameOnAttr = new THREE.InstancedBufferAttribute(flameOn, 1);
  flameGeo.setAttribute("iOn", flameOnAttr);
  flameGeo.instanceCount = FLAMES.length;
  const flames = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uClock: clockU, uCalm: calmU },
    vertexShader: `${GLSL_TAU}
      attribute vec3 iPos; attribute float iSeed; attribute float iOn;
      uniform float uClock; uniform float uCalm;
      varying vec2 vUv; varying float vF;
      // The same three sines as flameFlicker() in life-clock.js (whole cycles per minute).
      float flicker(float c, float s) { return 0.6 + (0.2 * sin(TAU * 97.0 * c / 60.0 + s * TAU) + 0.12 * sin(TAU * 143.0 * c / 60.0 + s * 12.9) + 0.08 * sin(TAU * 211.0 * c / 60.0 + s * 4.1)) * mix(1.0, 0.1, uCalm); }
      void main() {
        vUv = uv;
        float f = flicker(uClock, iSeed);
        vF = f;
        vec4 mv = viewMatrix * vec4(iPos, 1.0);
        float h = 0.30 * (0.7 + 0.5 * f) * iOn, w = 0.13 * (0.9 + 0.2 * f) * iOn;
        float lean = sin(TAU * 41.0 * uClock / 60.0 + iSeed * 20.0 + position.y * 2.0) * 0.035 * mix(1.0, 0.1, uCalm) * position.y;
        mv.xy += vec2((position.x * w) + lean, position.y * h);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying float vF;
      void main() {
        float y = vUv.y;
        float width = 1.6 * sqrt(y) * pow(1.0 - y, 1.3) / 0.55; // a teardrop: narrow at the wick, full a quarter up, pointed at the tip
        float d = abs(vUv.x - 0.5) * 2.0 / max(width, 0.001);
        float body = smoothstep(1.0, 0.25, d) * smoothstep(1.0, 0.8, y);
        vec3 col = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.42, 0.1), smoothstep(0.0, 0.9, y));
        gl_FragColor = vec4(col * (0.8 + 0.8 * vF), body * 0.9);
      }`,
  }));
  flames.frustumCulled = false;
  flames.renderOrder = 6;
  group.add(flames);

  // A single small light that stands at the nearest lit lamp (high tier only: a light in the scene costs every lit surface).
  let lampLight = null;
  if (amounts.lampLight) {
    lampLight = new THREE.PointLight("#ffa04a", 0, 14, 1.6);
    scene.add(lampLight);
  }

  // ---- smoke: instanced soft quads rising from each lit lamp --------------------------------------------------------
  const smokeCount = SMOKES.length * MAX_SMOKE_PER_LAMP;
  const smokeGeo = new THREE.InstancedBufferGeometry();
  const sq = new THREE.PlaneGeometry(1, 1);
  smokeGeo.index = sq.index;
  smokeGeo.setAttribute("position", sq.getAttribute("position"));
  smokeGeo.setAttribute("uv", sq.getAttribute("uv"));
  const smokePos = new Float32Array(smokeCount * 3), smokeSeed = new Float32Array(smokeCount * 2), smokeOn = new Float32Array(smokeCount);
  SMOKES.forEach((e, l) => {
    for (let j = 0; j < MAX_SMOKE_PER_LAMP; j += 1) {
      const n = l * MAX_SMOKE_PER_LAMP + j;
      smokePos.set(e.at, n * 3);
      smokeSeed[n * 2] = j / MAX_SMOKE_PER_LAMP + ((e.seed % 100) / 100) * 0.1; // phases spread evenly along the plume
      smokeSeed[n * 2 + 1] = (e.seed % 997) / 997;
    }
  });
  smokeGeo.setAttribute("iPos", new THREE.InstancedBufferAttribute(smokePos, 3));
  smokeGeo.setAttribute("iSeed", new THREE.InstancedBufferAttribute(smokeSeed, 2));
  const smokeOnAttr = new THREE.InstancedBufferAttribute(smokeOn, 1);
  smokeGeo.setAttribute("iOn", smokeOnAttr);
  smokeGeo.instanceCount = smokeCount;
  const smoke = new THREE.Mesh(smokeGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uClock: clockU, uWind: windU, uCalm: calmU, uTint: { value: new THREE.Color("#8a8580") } },
    vertexShader: `${GLSL_TAU}
      attribute vec3 iPos; attribute vec2 iSeed; attribute float iOn;
      uniform float uClock; uniform float uWind; uniform float uCalm;
      varying vec2 vUv; varying float vK; varying float vOn;
      void main() {
        vUv = uv;
        float k = fract(uClock / 12.0 + iSeed.x); // a plume loops every 12 s: five times a minute
        vK = k; vOn = iOn;
        vec3 p = iPos;
        p.y += 0.12 + k * 2.4;
        p.x += (0.25 + 1.1 * uWind) * k * k + sin(TAU * k + iSeed.y * 30.0) * 0.08 * k * mix(1.0, 0.2, uCalm);
        p.z += (0.1 + 0.4 * uWind) * k * 0.4 + cos(TAU * k + iSeed.y * 17.0) * 0.06 * k * mix(1.0, 0.2, uCalm);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float s = (0.05 + 0.55 * k) * iOn;
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uTint; varying vec2 vUv; varying float vK; varying float vOn;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r) * sin(3.14159 * vK) * (1.0 - vK) * 0.34 * vOn;
        vec3 warm = mix(vec3(1.0, 0.62, 0.3), uTint, smoothstep(0.0, 0.25, vK));
        gl_FragColor = vec4(warm, a);
      }`,
  }));
  smoke.frustumCulled = false;
  smoke.renderOrder = 5;
  group.add(smoke);

  // ---- dust in the shaft: points in a box that follows the eye ----------------------------------------------------
  const dustGeo = new THREE.BufferGeometry();
  const dustSeed = new Float32Array(MAX_DUST * 4), rnd = seeded(DUST?.seed ?? 1);
  for (let i = 0; i < dustSeed.length; i += 1) dustSeed[i] = rnd();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DUST * 3), 3)); // unused, but a draw needs it
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(dustSeed, 4));
  const camU = { value: new THREE.Vector3() }, sunU = { value: new THREE.Vector3(0, 1, 0) }, dustLitU = { value: 0 }, pxU = { value: 1 };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uClock: clockU, uCam: camU, uSun: sunU, uLit: dustLitU, uBox: { value: new THREE.Vector3(...DUST_BOX) }, uPx: pxU, uColor: { value: new THREE.Color("#fff1d0") } },
    vertexShader: `${GLSL_TAU}
      attribute vec4 aSeed;
      uniform float uClock; uniform vec3 uCam; uniform vec3 uSun; uniform float uLit; uniform vec3 uBox; uniform float uPx;
      varying float vA;
      void main() {
        // One box a minute along each axis, so the wrap of the clock is a whole number of boxes: no jump.
        vec3 drift = uBox / 60.0 * vec3(1.0, 1.0, -1.0);
        vec3 wander = vec3(sin(TAU * 11.0 * uClock / 60.0 + aSeed.w * 40.0), 0.5 * sin(TAU * 7.0 * uClock / 60.0 + aSeed.w * 71.0), cos(TAU * 13.0 * uClock / 60.0 + aSeed.w * 23.0)) * 0.35;
        vec3 q = aSeed.xyz * uBox + drift * uClock + wander;
        vec3 world = uCam + mod(q - uCam, uBox) - 0.5 * uBox;
        vec3 e = abs((world - uCam) / (0.5 * uBox));
        float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, max(e.y, e.z)));
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uPx * (0.7 + aSeed.w) * 2.2 / max(-mv.z, 0.5), 1.0, 7.0);
        vec3 view = normalize(world - uCam);
        float scatter = 0.3 + 0.9 * pow(max(dot(view, uSun), 0.0), 3.0); // brighter looking toward the sun
        float twinkle = 0.75 + 0.25 * sin(TAU * (30.0 + floor(aSeed.w * 40.0)) * uClock / 60.0 + aSeed.x * 50.0);
        vA = uLit * scatter * edge * twinkle * smoothstep(0.6, 2.5, -mv.z) * (0.25 + 0.5 * aSeed.w);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(uColor, smoothstep(1.0, 0.1, r) * vA);
      }`,
  }));
  dust.frustumCulled = false;
  dust.renderOrder = 7;
  group.add(dust);

  // ---- birds: flat silhouettes on seeded loops, wings beating ------------------------------------------------------
  const birdGeo = new THREE.InstancedBufferGeometry();
  // a body and two swept wings, a gull-like M in profile when the wings are raised
  const birdVerts = new Float32Array([0, 0, 0.2, 0, 0, -0.14, -0.16, 0, 0.02, -0.44, 0, -0.1, 0.16, 0, 0.02, 0.44, 0, -0.1]);
  birdGeo.setAttribute("position", new THREE.BufferAttribute(birdVerts, 3));
  birdGeo.setIndex([0, 1, 2, 2, 1, 3, 0, 4, 1, 4, 5, 1]);
  const FLOCK_SEED = FLOCK?.seed ?? 1;
  const loops = Array.from({ length: MAX_BIRDS }, (_, i) => birdLoop(i, FLOCK_SEED));
  const bA = new Float32Array(MAX_BIRDS * 4), bB = new Float32Array(MAX_BIRDS * 4);
  loops.forEach((l, i) => { bA.set([l.laps, l.phase, l.r, l.rz], i * 4); bB.set([l.dy, l.risePhase, (i * 0.37) % 1, 0], i * 4); });
  birdGeo.setAttribute("iA", new THREE.InstancedBufferAttribute(bA, 4));
  birdGeo.setAttribute("iB", new THREE.InstancedBufferAttribute(bB, 4));
  birdGeo.instanceCount = 0;
  const birdCenter = { value: new THREE.Vector3(...(FLOCK?.at ?? [0, 30, 0])) };
  const birds = new THREE.Mesh(birdGeo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uClock: clockU, uCenter: birdCenter, uColor: { value: new THREE.Color("#1d1a18") }, uOpacity: { value: 0.85 } },
    vertexShader: `${GLSL_TAU}
      attribute vec4 iA; attribute vec4 iB; uniform float uClock; uniform vec3 uCenter;
      void main() {
        float a = TAU * (iA.x * uClock / 60.0 + iA.y);
        float rise = TAU * (3.0 * uClock / 60.0 + iB.y);
        vec3 c = uCenter + vec3(cos(a) * iA.z, iB.x + sin(rise) * 1.5, sin(a) * iA.w);
        float heading = atan(cos(a) * iA.w, -sin(a) * iA.z);
        float flap = sin(TAU * (330.0 + floor(iB.z * 60.0)) * uClock / 60.0 + iB.z * 20.0) * 0.55;
        vec3 p = position * 1.7; // a wingspan near a metre
        p.y += abs(position.x) * flap * 1.7;
        float cs = cos(heading), sn = sin(heading);
        vec3 w = vec3(p.x * cs + p.z * sn, p.y, -p.x * sn + p.z * cs);
        gl_Position = projectionMatrix * viewMatrix * vec4(c + w, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
  }));
  birds.frustumCulled = false;
  birds.renderOrder = 4;
  group.add(birds);

  function setLevel(next) {
    amounts = lifeAmounts(next, calm);
    dustGeo.setDrawRange(0, amounts.dust);
    dust.visible = amounts.dust > 0;
    smoke.visible = amounts.smokePerLamp > 0;
    if (!amounts.lampLight && lampLight) lampLight.intensity = 0; // the light stays in the scene (a changed light count recompiles every material); it just gives none
  }
  setLevel(level);

  return {
    group,
    /** A banner's material: the cloth below the bar sways with the wind (weights from `addSwayWeights`). */
    sway(material) {
      const prior = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        prior?.call(material, shader, renderer);
        Object.assign(shader.uniforms, { uClock: clockU, uWind: windU, uCalm: calmU });
        shader.vertexShader = shader.vertexShader
          .replace("void main() {", `${GLSL_TAU}\nattribute float sway;\nuniform float uClock; uniform float uWind; uniform float uCalm;\nvoid main() {`)
          .replace("#include <begin_vertex>", `#include <begin_vertex>
            {
              vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
              float ph = origin.x * 0.7 + origin.z * 1.3;
              float amp = (0.1 + 0.4 * clamp(uWind, 0.0, 1.0)) * mix(1.0, 0.1, uCalm);
              float billow = sin(TAU * 31.0 * uClock / 60.0 + ph + position.x * 2.5) * 0.35 + sin(TAU * 47.0 * uClock / 60.0 + ph * 1.7 + position.y * 3.0) * 0.18 + sin(TAU * 5.0 * uClock / 60.0 + ph) * 0.5;
              transformed.z += sway * amp * (0.5 + billow);
              transformed.x += sway * amp * 0.12 * sin(TAU * 37.0 * uClock / 60.0 + ph + position.y * 2.0);
              transformed.y -= sway * amp * 0.05 * abs(billow);
            }`);
      };
      material.customProgramCacheKey = ((key) => () => `${key?.() ?? ""}-sway`)(material.customProgramCacheKey?.bind(material));
      return material;
    },
    /** Once a frame: `world` (the instant and sky), `eye` (where the camera is) and `sunDir` (a unit vector toward the sun). */
    update(world, eye, sunDir) {
      const clock = lifeClock(world.t), c = contextOf(world, eye.y);
      clockU.value = clock;
      windU.value = c.wind;
      camU.value.set(eye.x, eye.y, eye.z);
      sunU.value.copy(sunDir);
      pxU.value = 1;
      dustLitU.value = DUST ? DUST.activeWhen(c) : 0;
      let nearest = null, nearestD = Infinity, any = false;
      FLAMES.forEach((e, i) => {
        const on = e.activeWhen(c);
        flameOn[i] = on;
        const d = Math.hypot(e.at[0] - eye.x, e.at[2] - eye.z);
        if (on > 0.05) { any = true; if (d < nearestD) { nearest = e; nearestD = d; } }
      });
      flameOnAttr.needsUpdate = true;
      flames.visible = any;
      SMOKES.forEach((e, l) => {
        const on = e.activeWhen(c);
        for (let j = 0; j < MAX_SMOKE_PER_LAMP; j += 1) smokeOn[l * MAX_SMOKE_PER_LAMP + j] = j < amounts.smokePerLamp ? on : 0;
      });
      smokeOnAttr.needsUpdate = true;
      if (lampLight) {
        if (amounts.lampLight && nearest) {
          lampLight.position.set(nearest.at[0], nearest.at[1] + 0.35, nearest.at[2]);
          lampLight.intensity = 2.6 * flameFlicker(clock, nearest.seed, calm) * flameOn[FLAMES.indexOf(nearest)] * (1 - Math.min(1, c.dawn * 1.2));
        } else lampLight.intensity = 0;
      }
      const flock = FLOCK ? FLOCK.activeWhen(c) : 0;
      birdGeo.instanceCount = Math.min(MAX_BIRDS, Math.round(amounts.birds * flock));
      birds.visible = birdGeo.instanceCount > 0;
      birds.material.uniforms.uColor.value.set(c.dawn < 0.15 ? "#0c0b0e" : "#1d1a18");
    },
    /** For the bench: where the lit flames are right now (world metres). */
    litFlames: () => FLAMES.filter((_, i) => flameOn[i] > 0.3).map((e) => e.at),
    amounts: () => ({ ...amounts }),
    /** What is drawn this frame: lit flames, birds in the air, dust points, smoke plumes (for tests). */
    shown: () => ({ flames: flameOn.filter((v) => v > 0.3).length, birds: birdGeo.instanceCount, dust: dust.visible ? Math.round(amounts.dust * dustLitU.value) : 0, smoke: smoke.visible ? Math.round(smokeOn.reduce((a, v) => a + (v > 0.3 ? 1 : 0), 0)) : 0 }),
    swayAmount: (wind) => swayAmount(wind, calm),
    amplitude: () => amplitude(calm),
    wrap: WRAP,
  };
}
