// Turns the slice's set dressing (courtyard.js) into meshes: each prop's geometry is loaded once and stood in every place
// it is listed. Geometry carries UV0 for colour and UV1 for the baked occlusion; materials are made here, as for the wall
// bays. Props that fail to load are left out and the court stays whole.
import * as THREE from "three";
import { gradeStone, flag } from "./kit.js";
import { loadTexture, meshLoader, meshGeometry } from "./textures.js";
import { addSwayWeights } from "./life.js";

const BASE = new URL("../assets/props/dressing/", import.meta.url).href;
const METAL = { "ash-pan": { metalness: 0.65, roughness: 0.5 }, "lamp-stand": { metalness: 0.7, roughness: 0.45 }, bench: { metalness: 0, roughness: 0.9 } };

/** `life` (life.js), when given, makes the banners' cloth sway. */
export async function loadDressing(slice, { F, shadows = true, life = null } = {}) {
  const group = new THREE.Group();
  group.name = "dressing";
  const kit = await (await fetch(`${BASE}dressing.json`)).json();
  const loader = meshLoader();
  const map = (rel, srgb, channel = 0) => loadTexture(`props/dressing/${rel}`, { srgb, flipY: false, channel });
  const wanted = [...new Set(slice.dressing.map((d) => d.prop))].filter((id) => kit.props.some((p) => p.id === id));
  const parts = new Map();
  await Promise.all(wanted.map(async (id) => {
    try {
      const entry = kit.props.find((p) => p.id === id), dir = `${BASE}${id}/`;
      const gltf = await loader.loadAsync(BASE + entry.glb);
      const geometry = meshGeometry(gltf);
      const aoMap = map(`${id}/${id}-ao.jpg`, false, 1);
      const material = new THREE.MeshStandardMaterial({ map: map(`${id}/${id}-color.jpg`, true), aoMap, aoMapIntensity: 1, roughness: 0.85, metalness: 0, ...METAL[id] });
      const graded = flag("grade", true) ? gradeStone(material) : material;
      if (id === "banner" && life) { addSwayWeights(geometry); graded.side = THREE.DoubleSide; life.sway(graded); }
      parts.set(id, { geometry, material: graded });
    } catch (e) { console.warn(`dressing prop ${id} failed`, e); }
  }));
  for (const d of slice.dressing) {
    const p = parts.get(d.prop);
    if (!p?.geometry) continue;
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.position.set(d.at[0], F, d.at[1]);
    mesh.rotation.y = d.yaw ?? 0;
    mesh.scale.setScalar(d.scale ?? 1);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.name = d.id;
    group.add(mesh);
  }
  return group;
}
