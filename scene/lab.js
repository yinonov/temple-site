// Lab placements for judging single objects in the real scene's light (fidelity work, flag only: `?lab=lamp` or `?lab=props`).
// Stone plinths near the east gate carry the objects, so the real sun, sky light and grade apply. Hand-built in Blender
// with app/scripts/blender/; sizes are true (metres).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mat } from "./kit.js";

const BASE = new URL("../assets/props/", import.meta.url).href;
const textures = new THREE.TextureLoader(), loader = new GLTFLoader();
const map = (url, srgb) => { const t = textures.load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.anisotropy = 16; return t; };

// name, folder, files, metalness
const PROPS = {
  lamp: { dir: "lamp-a", glb: "lamp-a.glb", color: "lamp-color.jpg", normal: "lamp-normal.jpg", orm: "lamp-orm.jpg", metal: 0 },
  cup: { dir: "stone-cup", glb: "stone-cup.glb", color: "color.jpg", normal: "normal.jpg", orm: "orm.jpg", metal: 0 },
  bowl: { dir: "bowl", glb: "bowl.glb", color: "color.jpg", normal: "normal.jpg", orm: "orm.jpg", metal: 0.85 },
  jar: { dir: "jar", glb: "jar.glb", color: "color.jpg", normal: "normal.jpg", orm: "orm.jpg", metal: 0 },
  torch: { dir: "torch", glb: "torch.glb", color: "color.jpg", normal: "normal.jpg", orm: "orm.jpg", metal: 0 },
};

function prop(name) {
  const p = PROPS[name], g = new THREE.Group(), dir = `${BASE}${p.dir}/`, orm = map(dir + p.orm, false);
  const material = new THREE.MeshStandardMaterial({ map: map(dir + p.color, true), normalMap: map(dir + p.normal, false), roughnessMap: orm, aoMap: orm, roughness: 1, metalness: p.metal });
  loader.loadAsync(dir + p.glb).then((gltf) => {
    gltf.scene.traverse((o) => { if (o.isMesh) { o.material = material; o.castShadow = o.receiveShadow = true; } });
    g.add(gltf.scene);
  }).catch((e) => console.warn(`${name} assets failed`, e));
  return g;
}

const plinth = (g, x, y, z, w, h, d, F) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat("#d9ceb6", { roughness: 0.9 }));
  m.position.set(x, F + y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
};

/** `lamp`: one lamp on a plinth. `props`: a row of five along z, about a metre apart, facing the visitor to the west. */
export function buildLab(kind, { F }, at = [1.0, -47.0]) {
  const g = new THREE.Group(), [x, z] = at;
  if (kind === "lamp") {
    plinth(g, x, 0.65, z, 0.6, 1.3, 0.6, F);
    const lamp = prop("lamp");
    lamp.position.set(x, F + 1.3, z);
    lamp.rotation.y = -Math.PI * 0.62;
    g.add(lamp);
    return g;
  }
  const row = [["lamp", -1.8], ["cup", -0.9], ["bowl", 0], ["jar", 0.9], ["torch", 1.8]];
  for (const [name, dz] of row) {
    const o = prop(name);
    if (name === "jar") o.position.set(x, F, z + dz);                                   // stands on the floor
    else if (name === "torch") {                                                         // lies along a low plinth
      plinth(g, x, 0.3, z + dz, 0.16, 0.6, 1.3, F);
      o.rotation.x = Math.PI / 2;
      o.position.set(x, F + 0.6 + 0.02, z + dz - 0.55);
    } else {
      plinth(g, x, 0.65, z + dz, 0.6, 1.3, 0.6, F);
      o.position.set(x, F + 1.3, z + dz);
      if (name === "lamp") o.rotation.y = -Math.PI * 0.62;
    }
    g.add(o);
  }
  return g;
}
