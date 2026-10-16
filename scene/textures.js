// Where textures and meshes come from. Colour and occlusion maps ship as KTX2 (compressed on the GPU: a quarter of the
// memory and no JPEG decode on a phone) when assets/manifest.json lists them, and as plain images otherwise (a dev
// checkout before `compress-assets.js`, or a file that is smaller as a JPEG). Meshes may be Meshopt-compressed.
// `loadTexture` returns a texture at once and fills it when the data arrives, as three's TextureLoader does.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const ASSETS = new URL("../assets/", import.meta.url).href;
const manifest = await fetch(`${ASSETS}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const images = new THREE.TextureLoader();
let ktx2 = null;

/** Call once with the renderer, before textures are asked for. */
export function initTextures(renderer) {
  if (ktx2) return;
  ktx2 = new KTX2Loader().setTranscoderPath(import.meta.resolve("three/addons/libs/basis/")).detectSupport(renderer);
}

/**
 * `rel` is a path under assets/ (the .jpg name). `flipY` is the orientation the image would have had as a plain image (true,
 * three's default, for BoxGeometry-style UVs; false for glTF-style UVs). Options: srgb, wrap (repeat), anisotropy, channel, onLoad.
 */
export function loadTexture(rel, { srgb = false, flipY = true, wrap = false, anisotropy = 8, channel = 0, onLoad } = {}) {
  const entry = manifest?.textures?.[rel];
  const file = entry && ktx2 ? (flipY ? entry.flip : entry.plain) : null;
  const apply = (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    t.channel = channel;
  };
  if (!file) {
    const t = images.load(ASSETS + rel, (loaded) => onLoad?.(loaded));
    t.flipY = flipY;
    apply(t);
    return t;
  }
  const t = new THREE.CompressedTexture();
  apply(t);
  ktx2.load(ASSETS + file, (loaded) => {
    t.copy(loaded);
    apply(t);
    t.needsUpdate = true;
    onLoad?.(t);
  }, undefined, (e) => console.warn(`${file} failed to load`, e));
  return t;
}

/** A GLTFLoader that reads Meshopt-compressed meshes. */
export function meshLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

/**
 * The first mesh of a loaded glTF as plain float geometry in the scene's own units. Meshopt output is quantized (normalized
 * integers plus a node transform to restore the size), so the attributes are expanded and the transform baked in.
 */
export function meshGeometry(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const src = mesh.geometry, geometry = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i += 1) for (let k = 0; k < a.itemSize; k += 1) out[i * a.itemSize + k] = [a.getX, a.getY, a.getZ, a.getW][k].call(a, i);
    geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  geometry.setIndex(src.index);
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingSphere();
  return geometry;
}
