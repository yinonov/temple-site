// Illustrative ambience of the living layer (TASK-6-165, ADR-005 Decision 4 as amended after TASK-6-161 A-01/A-12).
// The light is NOT changed in live mode: ADR-004 D2's fixed, neutral light stays (a ramp tied to playback position would
// depict when dawn breaks). The fire glow and smoke are drawn on the piece the caller names (the presentation picks it from
// the data); they are constant over the whole playback, never respond to events or steps, and claim nothing about any fire.
// Pure part (smokeParticle): Node-testable. createFire(THREE, …) is browser-only.

/** Most smoke particles drawn (performance budget). */
export const SMOKE_PARTICLES = 40;

/**
 * Deterministic smoke particle i at time t (seconds, real time, not playback) above an origin: rises, drifts, fades.
 * @returns {{ x, y, z, size, alpha }}
 */
export function smokeParticle(i, t, origin, { count = SMOKE_PARTICLES, life = 9, rise = 14 } = {}) {
  const phase = ((t / life) + i / count) % 1;
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const r = seed - Math.floor(seed);
  const angle = r * Math.PI * 2;
  const spread = 0.6 + phase * 3.2;
  return {
    x: origin.x + Math.cos(angle) * spread * 0.5 + phase * 2.2,
    y: origin.y + 0.3 + phase * rise,
    z: origin.z + Math.sin(angle) * spread * 0.5,
    size: 1.2 + phase * 4.5,
    alpha: Math.max(0, Math.sin(Math.PI * phase)) * 0.32
  };
}

/**
 * Browser layer: an emissive glow on top of a piece and one-draw-call smoke above it. `box` = that piece's box.
 * Returns { update(nowSeconds, { reduced, pixelHeight }), dispose() }. Under reduced motion only the static glow is drawn.
 */
export function createFire(THREE, { parent, box }) {
  const group = new THREE.Group();
  group.name = "fire";
  parent.add(group);
  const top = box.y + box.sy / 2;
  const glowGeometry = new THREE.CircleGeometry(Math.min(box.sx, box.sz) * 0.16, 24);
  glowGeometry.rotateX(-Math.PI / 2);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.85, depthWrite: false });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.set(box.x, top + 0.04, box.z);
  group.add(glow);
  const light = new THREE.PointLight(0xff9a50, 6, Math.max(box.sx, 12) * 1.6, 1.6);
  light.position.set(box.x, top + 1.2, box.z);
  group.add(light);
  // Smoke: one Points draw call; per-particle size and alpha in a small shader (soft round sprite, no texture asset).
  const positions = new Float32Array(SMOKE_PARTICLES * 3);
  const sizes = new Float32Array(SMOKE_PARTICLES);
  const alphas = new Float32Array(SMOKE_PARTICLES);
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  smokeGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x8a8580) }, uScale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; varying float vAlpha; uniform float uScale;
      void main() { vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(uColor, vAlpha * (1.0 - d * d)); }`,
    transparent: true, depthWrite: false
  });
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
  smoke.frustumCulled = false;
  group.add(smoke);
  const origin = { x: box.x, y: top, z: box.z };
  return {
    update(now, { reduced = false, pixelHeight = 600 } = {}) {
      smokeMaterial.uniforms.uScale.value = pixelHeight;
      const flicker = reduced ? 1 : 0.85 + Math.sin(now * 11) * 0.08 + Math.sin(now * 23.7) * 0.05;
      glowMaterial.opacity = 0.75 * flicker;
      light.intensity = 5 * flicker;
      smoke.visible = !reduced;
      if (reduced) return;
      for (let i = 0; i < SMOKE_PARTICLES; i += 1) {
        const p = smokeParticle(i, now, origin);
        positions.set([p.x, p.y, p.z], i * 3);
        sizes[i] = p.size;
        alphas[i] = p.alpha;
      }
      for (const name of ["position", "size", "alpha"]) smokeGeometry.getAttribute(name).needsUpdate = true;
    },
    setVisible(on) { group.visible = Boolean(on); },
    dispose() {
      parent.remove(group);
      glowGeometry.dispose();
      glowMaterial.dispose();
      smokeGeometry.dispose();
      smokeMaterial.dispose();
    }
  };
}
