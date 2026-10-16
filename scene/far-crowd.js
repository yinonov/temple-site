// The far level of the figure family, for crowds: one instanced mesh of about 400 triangles, animated by a baked
// vertex-animation texture (built by app/scripts/blender/build_far.py from the same body and the same clips as the near and mid
// levels). Every person the pool of rigs does not draw is drawn here, in the same garments and the same seeded tints; each
// instance reads two clips from the texture (the current one and the one before, for a quarter-second blend), so a person's pose
// is a function of the instant and of the distance they have walked, exactly as the rigs' is. The files load only when a crowd
// is first needed. The mesh and the texture carry no image: part colours come from instance attributes.
import * as THREE from "three";
import { meshLoader, meshGeometry } from "./textures.js";
import { figureSeed } from "../world/figure-seed.js";
import { clipFor } from "./figures.js";
import { stepFar, newFarState, instanceNumbers } from "./far-clip.js";

const BASE = new URL("../assets/figures/", import.meta.url).href;
const half = (bits) => { // IEEE half to float, for the first rows only (a self-check); the GPU reads the texture itself
  const s = (bits & 0x8000) ? -1 : 1, e = (bits >> 10) & 0x1f, f = bits & 0x3ff;
  return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? s * Infinity : s * 2 ** (e - 15) * (1 + f / 1024);
};

/** Loads the far mesh, its animation texture and its table of clips. */
export async function loadFar() {
  const [gltf, bin, info] = await Promise.all([
    meshLoader().loadAsync(`${BASE}figure-far.glb`),
    fetch(`${BASE}figure-far.vat.bin`).then((r) => { if (!r.ok) throw new Error("figure-far.vat.bin"); return r.arrayBuffer(); }),
    fetch(`${BASE}figure-far.json`).then((r) => r.json()),
  ]);
  const geometry = meshGeometry(gltf);
  const data = new Uint16Array(bin); // float16 bits, RGBA, one row per frame and one column per vertex
  if (data.length !== info.frames * info.vertices * 4) throw new Error("far figure texture does not match its description");
  const vat = new THREE.DataTexture(data, info.vertices, info.frames, THREE.RGBAFormat, THREE.HalfFloatType);
  vat.minFilter = vat.magFilter = THREE.NearestFilter;
  vat.generateMipmaps = false;
  vat.needsUpdate = true;
  return { geometry, vat, info, firstOffset: half(data[0]) };
}

// Per-instance attributes are packed into six four-vectors: with a mesh's position, normal, uv, colour and instance matrix (four
// slots) that is 14 of the 16 vertex attributes a phone's GPU guarantees.
//   iA, iB: current clip and the clip before it (first row, rows, fraction; iB.w the blend)
//   iT1..iT4: skin + hair.r, robe + hair.g, headwear + hair.b, sash + fade
const VERT_HEAD = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iT1; attribute vec4 iT2; attribute vec4 iT3; attribute vec4 iT4;
uniform highp sampler2D uVat; uniform float uCols;
varying vec3 vSkin; varying vec3 vRobe; varying vec3 vHead; varying vec3 vSash; varying vec3 vHair; varying float vFade;
vec3 vatAt(float row, float col) { return texelFetch(uVat, ivec2(int(col), int(row)), 0).xyz; }
// One clip at a fraction of its length: the two rows either side, blended (c = row0, count, fraction).
vec3 vatClip(vec3 c, float col) {
  float f = c.z * c.y, a = floor(f), t = f - a;
  return mix(vatAt(c.x + a, col), vatAt(c.x + mod(a + 1.0, c.y), col), t);
}`;
const FRAG_HEAD = "varying vec3 vSkin; varying vec3 vRobe; varying vec3 vHead; varying vec3 vSash; varying vec3 vHair; varying float vFade;";

function farMaterial(far) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, alphaHash: true, transparent: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uVat = { value: far.vat };
    shader.uniforms.uCols = { value: far.info.vertices };
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${VERT_HEAD}\nvoid main() {`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          float col = floor(uv.x * uCols);
          vec3 now = vatClip(iA.xyz, col), before = vatClip(iB.xyz, col);
          transformed += mix(now, before, iB.w);
          vSkin = iT1.rgb; vRobe = iT2.rgb; vHead = iT3.rgb; vSash = iT4.rgb; vHair = vec3(iT1.a, iT2.a, iT3.a); vFade = iT4.a;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${FRAG_HEAD}\nvoid main() {`)
      .replace("#include <color_fragment>", `
        {
          vec3 k = vColor.rgb; // which part this is: skin, robe, headwear, sash or hair (build_far.py)
          float wSkin = k.r * (1.0 - k.g) * (1.0 - k.b), wRobe = (1.0 - k.r) * k.g * (1.0 - k.b), wHead = (1.0 - k.r) * (1.0 - k.g) * k.b, wSash = k.r * k.g * (1.0 - k.b), wHair = (1.0 - k.r) * k.g * k.b;
          diffuseColor.rgb *= wSkin * vSkin * vec3(0.84, 0.66, 0.52) + wRobe * vRobe * 1.0 + wHead * vHead * 1.0 + wSash * vSash + wHair * vHair * 0.55;
          diffuseColor.a *= vFade;
        }`);
  };
  m.customProgramCacheKey = () => "far-crowd";
  return m;
}

/**
 * `capacity` instances at most. `place(list, ctx)` is called every frame with every person who could be drawn as a figure, nearest
 * first: `{ id, look, actor, d, dayKey, fade }` where `fade` (0 to 1) is how much of the person the far level draws (1 when no rig
 * has them; a rig's appearing and leaving take the rest of the cross-fade). `ctx`: { seconds, dt, meta (the clips' durations and speeds), cap }.
 */
export function createFarCrowd(scene, far, { capacity = 160, shadows = false } = {}) {
  const mesh = new THREE.InstancedMesh(far.geometry, farMaterial(far), capacity);
  const attrs = {};
  for (const name of ["iA", "iB", "iT1", "iT2", "iT3", "iT4"]) {
    const size = 4;
    attrs[name] = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attrs[name].setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute(name, attrs[name]);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false; // far shadows are too small to see
  mesh.receiveShadow = shadows;
  mesh.count = 0;
  mesh.name = "far-crowd";
  scene.add(mesh);
  const people = new Map(); // id -> { st, seed, tints, yaw }
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Color();
  let drawn = 0;
  // A person's five tints as linear colours, in the order skin, robe, headwear, sash, hair.
  const tints = (seed) => { const out = []; for (const hex of [seed.body.skinTone, seed.garments.robe, seed.garments.headwear, seed.garments.sash, seed.hair]) { tmp.set(hex); out.push(tmp.r, tmp.g, tmp.b); } return out; };

  return {
    mesh,
    /** The far walk phase of a person (seconds into the walk cycle), for a rig to carry on from. */
    walkTOf: (id) => people.get(id)?.st.walkT,
    /** Update everyone's state and draw those the far level is showing. Returns the set of ids drawn. */
    place(list, ctx) {
      const { seconds, dt, meta, cap } = ctx, rows = far.info.rows;
      const seen = new Set(), out = new Set();
      let n = 0;
      for (const c of list) {
        seen.add(c.id);
        let p = people.get(c.id);
        const want = clipFor(c.actor);
        if (!p) {
          const seed = figureSeed(c.dayKey, c.id, c.look);
          p = { seed, st: newFarState(want, Number.isFinite(c.walkT) ? c.walkT : seed.motionVariant.phase * 2), yaw: c.actor.heading ?? 0, rgb: tints(seed) };
          people.set(c.id, p);
        }
        if (Number.isFinite(c.walkT)) p.st.walkT = c.walkT; // a rig has them: its walk phase leads
        stepFar(p.st, { want, moving: c.actor.moving, build: p.seed.body.build, meta, dt });
        if (c.fade <= 0.001 || n >= cap || n >= capacity) continue;
        let d = (c.actor.heading ?? p.yaw) - p.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw += d * (dt ? Math.min(1, dt * 8) : 1);
        const b = p.seed.body, v = p.seed.motionVariant;
        pos.set(c.actor.pos[0], c.actor.pos[1], c.actor.pos[2]);
        quat.setFromAxisAngle(up, p.yaw);
        scale.set(b.build * b.shoulder ** 0.5, b.height, b.build);
        mesh.setMatrixAt(n, m4.compose(pos, quat, scale));
        const num = instanceNumbers(p.st, { seconds, variant: v, meta, rows });
        attrs.iA.setXYZW(n, num.a[0], num.a[1], num.a[2], 0);
        attrs.iB.setXYZW(n, num.b[0], num.b[1], num.b[2], num.w);
        const t = p.rgb; // skin, robe, headwear, sash, hair: worked out once
        attrs.iT1.setXYZW(n, t[0], t[1], t[2], t[12]);
        attrs.iT2.setXYZW(n, t[3], t[4], t[5], t[13]);
        attrs.iT3.setXYZW(n, t[6], t[7], t[8], t[14]);
        attrs.iT4.setXYZW(n, t[9], t[10], t[11], c.fade);
        out.add(c.id);
        n += 1;
      }
      for (const id of people.keys()) if (!seen.has(id)) people.delete(id); // out of sight: their state restarts from the seed
      mesh.count = n; drawn = n;
      mesh.instanceMatrix.needsUpdate = true;
      for (const a of Object.values(attrs)) a.needsUpdate = true;
      return out;
    },
    info: () => ({ drawn, capacity, triangles: far.info.triangles, vertices: far.info.vertices, frames: far.info.frames }),
  };
}
