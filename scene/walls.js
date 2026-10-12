// Dressed-stone wall bays (fidelity spike). Each 8 m bay is built from individual blocks in Blender (scripts kept with the
// spike's notes), with margin-drafted bosses, a cornice, merlons and half-pilasters at the ends that hide the joins.
// Geometry carries two UV sets: UV0 samples one stone of the texture per block, UV1 holds the baked ambient occlusion.
// The stone texture is ambientCG Tiles144 (CC0), graded paler; see app/content/credits.md.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tierName } from "./kit.js";

const ASSETS = new URL("../assets/", import.meta.url).href, BASE = `${ASSETS}walls/`;
const BAY = 8, BODY = 7.57, VARIANTS = 4; // bay length, height of the body up to the cornice's top, number of layouts

export async function loadWalls() {
  const loader = new GLTFLoader(), textures = new THREE.TextureLoader();
  const load = (name, srgb) => textures.loadAsync(ASSETS + tierName(`walls/${name}`)).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false; // the UVs follow the glTF convention (origin top left)
    t.anisotropy = 8;
    return t;
  });
  const [map, normalMap, roughnessMap] = await Promise.all([load("stone-color.jpg", true), load("stone-normal.jpg", false), load("stone-rough.jpg", false)]);
  const bays = await Promise.all(Array.from({ length: VARIANTS }, async (_, i) => {
    const [gltf, aoMap] = await Promise.all([loader.loadAsync(`${BASE}wall_bay_${i + 1}.glb`), load(`wall-ao-${i + 1}.jpg`, false)]);
    let geometry = null;
    gltf.scene.traverse((o) => { if (o.isMesh) geometry = o.geometry; });
    aoMap.channel = 1; // the occlusion is laid out on the second UV set
    return { geometry, material: new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, metalness: 0, aoMap, aoMapIntensity: 1 }) };
  }));
  return bays;
}

/** Stand bays along each run ({ x0, x1, z0, z1, y0, h }), the way temple.js laid its plain walls. */
export function wallInstances(bays, runs, { shadows = true } = {}) {
  const placements = bays.map(() => []);
  runs.forEach((r, k) => {
    const alongX = Math.abs(r.x1 - r.x0) > Math.abs(r.z1 - r.z0);
    const len = alongX ? Math.abs(r.x1 - r.x0) : Math.abs(r.z1 - r.z0);
    const n = Math.max(1, Math.round(len / BAY)), sx = len / (n * BAY), sy = r.h / BODY;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const x = r.x0 + (r.x1 - r.x0) * t, z = r.z0 + (r.z1 - r.z0) * t;
      const v = (k * 7 + i * 3 + (i >> 1)) % bays.length; // fixed pattern: the same world for everyone
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, r.y0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? 0 : Math.PI / 2), new THREE.Vector3(sx, sy, 1));
      placements[v].push(m);
    }
  });
  const group = new THREE.Group();
  bays.forEach((bay, v) => {
    const mesh = new THREE.InstancedMesh(bay.geometry, bay.material, Math.max(1, placements[v].length));
    placements[v].forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = placements[v].length;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return group;
}
