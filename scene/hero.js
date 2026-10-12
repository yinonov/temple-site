// A skinned, animated person for the fidelity spike: Quaternius' Universal Base Characters and Universal Animation
// Library (both CC0, see app/content/credits.md), dressed in code from the garments list. The pose is set from the
// instant of the world (clip time = world seconds + the person's phase), so two visitors see the same pose.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { mat } from "./kit.js";
import { PRIEST_GARMENTS } from "../world/garments.js";

const BASE = new URL("../assets/priest/", import.meta.url).href;
const FACT = Object.fromEntries(PRIEST_GARMENTS.map((g) => [g.part, g.fact]));

export async function loadHero() {
  const loader = new GLTFLoader();
  const [body, anim, beard] = await Promise.all(["body.gltf", "animations.glb", "beard.gltf"].map((f) => loader.loadAsync(BASE + f)));
  let beardMesh = null;
  beard.scene.traverse((o) => { if (o.isSkinnedMesh) beardMesh = o; });
  return { body, beardMesh, clips: Object.fromEntries(anim.animations.map((c) => [c.name, c])) };
}

/** The clip a person plays, from what the world says they are doing. */
const clipFor = (actor) => actor.moving || actor.pose === "walk" ? "Walk_Formal_Loop"
  : actor.pose === "carry" ? "Idle_Torch_Loop"
  : ["ask", "listen"].includes(actor.pose) ? "Idle_Talking_Loop"
  : ["push", "crank"].includes(actor.pose) ? "Push_Loop"
  : ["reach", "wash", "rake"].includes(actor.pose) ? "Interact"
  : "Idle_Loop";

/** A garment mesh placed in the rest pose, then fastened to a bone so it follows the body. */
function fasten(model, boneName, mesh, fact, part) {
  mesh.userData.fact = fact;
  mesh.userData.part = part;
  mesh.castShadow = true;
  model.getObjectByName(boneName).attach(mesh);
  return mesh;
}
const wp = (model, name) => model.getObjectByName(name).getWorldPosition(new THREE.Vector3());

export function hero(kit, { robe = "#f6f1e4", sash = "#b23a48", skin = 0, headwear = "turban", headColor = "#f6f1e4", beard = null, scale = 1, phase = 0 } = {}) {
  const model = clone(kit.body.scene);
  model.updateMatrixWorld(true);
  const skinned = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    if (o.isSkinnedMesh) skinned.push(o);
    if (o.material?.name === "MI_Hair_1") o.visible = headwear === "hair";
  });
  const pelvis = wp(model, "pelvis"), head = wp(model, "Head"), neck = wp(model, "neck_01");
  const robeMat = mat(robe, { roughness: 0.92, side: THREE.DoubleSide });
  const tunic = new THREE.LatheGeometry([[0.01, 0], [0.43, 0.02], [0.4, 0.5], [0.3, 0.95], [0.255, 1.18], [0.27, 1.32], [0.2, 1.42], [0.09, 1.46], [0.01, 1.46]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const tunicMesh = new THREE.Mesh(tunic, robeMat);
  tunicMesh.position.set(0, 0.1, 0.0);
  fasten(model, "pelvis", tunicMesh, FACT.robe, "robe");
  // Sleeves: tubes from the shoulder to the wrist, laid along the rest-pose bones.
  for (const s of ["l", "r"]) {
    const a = wp(model, `upperarm_${s}`).lerp(wp(model, `clavicle_${s}`), 0.55), b = wp(model, `hand_${s}`);
    const len = a.distanceTo(b) * 0.88, tube = new THREE.CylinderGeometry(0.095, 0.064, len, 12);
    const m = new THREE.Mesh(tube, robeMat);
    m.position.copy(a).lerp(b, 0.44);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    fasten(model, `upperarm_${s}`, m, FACT.robe, "robe");
  }
  const sashMesh = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.05, 8, 28), mat(sash, { roughness: 0.8 }));
  sashMesh.rotation.x = Math.PI / 2;
  sashMesh.position.set(0, pelvis.y + 0.2, 0.0);
  fasten(model, "pelvis", sashMesh, FACT.sash, "sash");
  if (headwear === "turban") {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14), mat(headColor, { roughness: 0.9 }));
    t.scale.set(1.12, 0.78, 1.18);
    t.position.set(head.x, head.y + 0.1, head.z - 0.005);
    fasten(model, "Head", t, FACT.headwear, "headwear");
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat(headColor, { roughness: 0.9 }));
    top.position.set(head.x, head.y + 0.2, head.z);
    fasten(model, "Head", top, FACT.headwear, "headwear");
  }
  if (beard && kit.beardMesh && skinned[0]) {
    const b = kit.beardMesh.clone();
    b.material = b.material.clone();
    b.material.color.set(beard);
    b.frustumCulled = false;
    skinned[0].parent.add(b);
    b.bind(skinned[0].skeleton, b.bindMatrix);
  }
  const g = new THREE.Group();
  g.add(model);
  g.scale.setScalar(scale);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.2, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [name, clip] of Object.entries(kit.clips)) { const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); actions[name] = a; }
  return { g, hero: true, mixer, actions, weights: {}, phase, skinned };
}

/** Pose a person for this instant: move to the actor's place and heading, and blend to the clip the actor's state asks for. */
export function poseHero(f, actor, worldSeconds, dt) {
  const want = clipFor(actor), k = dt ? Math.min(1, dt * 7) : 1;
  for (const [name, action] of Object.entries(f.actions)) {
    const w = f.weights[name] ?? 0, next = w + ((name === want ? 1 : 0) - w) * k;
    f.weights[name] = next;
    action.setEffectiveWeight(next);
    if (next > 0.001) action.time = (worldSeconds + f.phase) % action.getClip().duration;
  }
  f.mixer.update(0);
  f.g.position.set(...actor.pos);
  if (actor.heading !== null && actor.heading !== undefined) {
    let d = actor.heading - f.g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    f.g.rotation.y += d * (dt ? k : 1);
  }
}
