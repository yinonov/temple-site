// The figure family: skinned, animated people (assets/figures/, built in Blender by script) standing where the world says
// they are. A small pool of rigs (as many as the tier allows) is lent to the people nearest the visitor; everyone else is
// drawn by the placeholder figures of kit.js. Each rig has a near and a mid level of detail that cross-fade with a dithered
// alpha, a shared skeleton and seven clips (idle, walk, carry, work-a, work-b, bow, pray) blended over a quarter of a second.
// Body, dress tint and motion variant come from world/figure-seed.js (hash of the day and the id: no chance), and a clip's
// time is the world's seconds plus the person's phase, so two visitors at one moment see the same pose. Walking and carrying
// are the exception: their phase advances with the distance actually covered, at the playback rate that matches the clip's
// travel speed to the speed on the ground, so that feet do not slide.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { meshLoader, loadTexture } from "./textures.js";
import { figureSeed } from "../world/figure-seed.js";
import { personAt } from "../world/schedule.js";
import { stepWalk } from "./walk-phase.js";

const BASE = new URL("../assets/figures/", import.meta.url).href;
const DBG = new URLSearchParams(location.search).get("dbg"); // measuring only
const FADE = 0.25; // seconds to blend between clips
const FADE_RIG = 0.3; // seconds for a rig to appear or leave (the far figure takes the other half of the cross-fade)

/** The clip a pose (and walking) calls for. */
const CLIP_OF = { stand: "idle", ask: "idle", point: "idle", reach: "idle", hold: "idle", listen: "idle", peek: "idle", sleep: "idle", rake: "work-a", push: "work-a", crank: "work-a", wash: "work-a", trim: "work-b", bow: "bow", raise: "pray" };
// Standing with a load (pose "carry") holds the carry clip at the moment the legs pass each other.
export const clipFor = (actor) => (actor.pose === "carry" ? "carry" : actor.moving ? "walk" : CLIP_OF[actor.pose] ?? "idle");
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Loads the two levels of detail, the clips and their metadata, the parts' material hints and their textures (shared by every rig). */
export async function loadFigureFamily() {
  const loader = meshLoader();
  const [near, mid, motions, meta, parts] = await Promise.all([
    loader.loadAsync(`${BASE}figure-near.glb`), loader.loadAsync(`${BASE}figure-mid.glb`), loader.loadAsync(`${BASE}motions.glb`),
    fetch(`${BASE}motions.json`).then((r) => r.json()), fetch(`${BASE}figure-parts.json`).then((r) => r.json()),
  ]);
  // One texture object per file: colour maps are sRGB, the rest data; glTF-style UVs (flipY false); hair repeats.
  const textures = {};
  for (const file of parts.textures) {
    const colour = /-color\./.test(file);
    textures[file] = loadTexture(`figures/${file}`, { srgb: colour, flipY: false, wrap: /hair/.test(file), anisotropy: 4 });
  }
  return { near: near.scene, mid: mid.scene, clips: motions.animations, meta, parts: parts.parts, textures };
}

const partName = (o) => o.userData?.name ?? o.name;

function makeLevel(template, family, materials) {
  const PART_NAMES = Object.keys(family.parts);
  const root = cloneSkinned(template), parts = {};
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const name = partName(o);
    if (!PART_NAMES.includes(name)) return;
    o.material = materials[name];
    o.frustumCulled = false; // skinned bounds follow the rest pose; people are small and few
    parts[name] = o;
  });
  // One skeleton for all the parts of a figure (clones give each part its own): its bone texture is made and sent once a frame.
  const meshes = Object.values(parts), shared = meshes[0]?.skeleton;
  if (shared) for (const m of meshes) if (m.skeleton !== shared) m.bind(shared, m.bindMatrix);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of family.clips) { const a = mixer.clipAction(clip); a.play(); a.timeScale = 0; a.weight = 0; actions[clip.name] = a; }
  root.visible = false;
  return { root, parts, mixer, actions };
}

/** The material of one part for one rig, from figure-parts.json (the textures are shared, the colour is the rig's own). */
function partMaterial(family, name) {
  const cfg = family.parts[name], t = cfg.textures ?? {};
  const m = new THREE.MeshStandardMaterial({
    vertexColors: name !== "body" && name !== "eyes", // the parts that carry COLOR_0 (fold shading, edge alpha)
    map: t.map ? family.textures[t.map] : null, normalMap: t.normalMap ? family.textures[t.normalMap] : null, aoMap: t.aoMap ? family.textures[t.aoMap] : null,
    roughness: cfg.roughness ?? 0.8, metalness: 0, side: cfg.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: cfg.alphaTest ?? 0, alphaHash: !cfg.alphaTest, // cut-out hair is cut; everything else dithers during the level-of-detail cross-fade
    transparent: false,
  });
  if (name === "eyes") m.envMapIntensity = 0.3; // the cornea would mirror the whole sky otherwise
  if (m.normalMap) m.normalScale.set(0.9, 0.9);
  return m;
}

/**
 * A pool of `size` rigs. `setShadows(on)` follows the tier. `place(candidates, ...)` is called every frame, nearest first:
 * `{ id, look, actor, d, dayKey, walkT? }`. Returns a Map of the people it drew to how fully (0 to 1: a rig fades in and out over a
 * third of a second), so that the caller can hand each person over to the far figure or the placeholder in step.
 */
export function createFigureRigs(scene, family, { size, shadows = true }) {
  const rigs = [];
  for (let i = 0; i < size; i += 1) {
    const names = Object.keys(family.parts);
    const mats = Object.fromEntries(names.map((n) => [n, partMaterial(family, n)]));
    const matsMid = Object.fromEntries(names.map((n) => [n, partMaterial(family, n)]));
    const group = new THREE.Group();
    const near = makeLevel(family.near, family, mats), mid = makeLevel(family.mid, family, matsMid);
    group.add(near.root, mid.root);
    // What is held: a rake (a long handle and a toothed head) and a bundle of wood, laid between the hands each frame.
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5532", roughness: 0.9 }), logs = new THREE.MeshStandardMaterial({ color: "#a47a4c", roughness: 0.95 });
    const rake = new THREE.Group();
    rake.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1, 6).translate(0, 0.5, 0), wood));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.05), wood); head.position.y = 0.02; rake.add(head);
    for (let k = -3; k <= 3; k += 1) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.12, 0.018), wood); tooth.position.set(k * 0.065, -0.04, 0); rake.add(tooth); }
    const bundle = new THREE.Group();
    for (const [x, y] of [[-0.1, 0], [0.1, 0], [0, 0.17], [-0.2, 0.17], [0.2, 0.17]]) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.62, 7).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), logs); log.position.set(x, y, 0); bundle.add(log); }
    rake.visible = bundle.visible = false;
    rake.matrixWorldAutoUpdate = bundle.matrixWorldAutoUpdate = false;
    group.add(rake, bundle);
    group.visible = false;
    group.matrixWorldAutoUpdate = false; // a rig that is not drawn is not walked over by the scene's matrix update either
    scene.add(group);
    rigs.push({ group, near, mid, rake, bundle, mats, matsMid, id: null, seed: null, k: 0, appear: 0, leaving: false, weights: Object.fromEntries(family.clips.map((c) => [c.name, 0])), clip: "idle", walkT: 0, last: null, speed: 0, turn: 0, frame: i });
  }
  const byId = new Map();
  const cost = { speed: 0, mixer: 0, ik: 0, props: 0 }, acc = { speed: 0, mixer: 0, ik: 0, props: 0 }; // milliseconds a frame (smoothed), for measuring only
  const clipDuration = Object.fromEntries(family.clips.map((c) => [c.name, c.duration]));
  let shadowsOn = shadows, limit = size;
  const TINT = { skin: (s) => s.body.skinTone, hair: (s) => s.hair, robe: (s) => s.garments.robe, headwear: (s) => s.garments.headwear, sash: (s) => s.garments.sash };
  const tint = (rig, seed) => {
    for (const set of [rig.mats, rig.matsMid]) for (const [name, m] of Object.entries(set)) { const k = family.parts[name].tint; m.color.set(k ? TINT[k](seed) : "#ffffff"); }
    rig.group.scale.set(seed.body.build * seed.body.shoulder ** 0.5, seed.body.height, seed.body.build);
    for (const lv of [rig.near, rig.mid]) if (lv.parts.beard) lv.parts.beard.visible = seed.beard;
  };
  const setCast = (rig, on) => {
    // Only the near level casts: far people's shadows are too small to see and cost a draw each.
    for (const lv of [rig.near, rig.mid]) for (const m of Object.values(lv.parts)) { m.castShadow = on && lv === rig.near; m.receiveShadow = true; }
  };
  setShadowsAll();
  function setShadowsAll() { for (const r of rigs) setCast(r, shadowsOn); }

  function pose(rig, actor, world, dt) {
    const want = clipFor(actor), seed = rig.seed, v = seed.motionVariant;
    // Speed on the ground: how far the world moves this person across half a second either side of now, so it is a function of
    // the instant (no measurement noise), and exactly what the walk cycle has to keep up with.
    rig.last = [actor.pos[0], actor.pos[2]];
    const tS = performance.now();
    const t = world.seconds * 1000, a = actor.speed === undefined ? personAt(rig.id, t - 250) : null, b = a ? personAt(rig.id, t + 250) : null;
    const target = actor.speed ?? (a.visible && b.visible ? Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) / 0.5 : 0); // `actor.speed` is for tests
    rig.speed += (target - rig.speed) * Math.min(1, dt * 10);
    acc.speed += performance.now() - tS;
    // Blend weights toward the wanted clip.
    for (const name of Object.keys(rig.weights)) {
      const target = name === want ? 1 : 0, w = rig.weights[name];
      rig.weights[name] = w + clamp(target - w, -dt / FADE, dt / FADE);
    }
    rig.clip = want;
    const locomotion = want === "walk" || want === "carry";
    rig.holding = want === "carry" && !actor.moving;
    const meta = family.meta[want];
    rig.walkT = stepWalk(rig.walkT, { want, moving: actor.moving, speed: rig.speed, build: seed.body.build, meta, dt });
    // Position and heading first, so that the feet can be pinned in world space after the clips are applied.
    rig.group.position.set(actor.pos[0], actor.pos[1], actor.pos[2]);
    if (actor.heading !== null && actor.heading !== undefined) {
      let d = actor.heading - rig.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      rig.group.rotation.y += d * (dt ? Math.min(1, dt * 8) : 1);
    }
    rig.group.updateMatrixWorld(true);
    const levels = [rig.near, rig.mid].filter((lv) => lv.root.visible);
    const evaluate = (lv, ticked) => {
      if (!ticked) return;
      for (const [name, a] of Object.entries(lv.actions)) {
        const w = rig.weights[name];
        a.enabled = w > 0.001;
        if (!a.enabled) continue;
        a.weight = w;
        const dur = clipDuration[name];
        const t = name === "walk" || name === "carry" ? rig.walkT / (family.meta[name].duration || dur) : world.seconds * v.rate / dur + v.phase;
        a.time = (((t % 1) + 1) % 1) * dur;
      }
      const t1 = performance.now();
      lv.mixer.update(0);
      const t2 = performance.now();
      pinFeet(rig, lv, locomotion ? want : rig.clip);
      const t3 = performance.now();
      if (lv.root.visible && (lv === rig.near || !rig.near.root.visible)) holdProps(rig, lv);
      acc.mixer += t2 - t1; acc.ik += t3 - t2; acc.props += performance.now() - t3;
    };
    // Far figures are posed every other frame, except while walking (a foot pinned half a frame late would visibly drag).
    for (const lv of levels) evaluate(lv, lv === rig.near || locomotion || (world.frame + rig.frame) % 2 === 0);
  }

  const hr = new THREE.Vector3(), hl = new THREE.Vector3(), axis = new THREE.Vector3(), mid = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function holdProps(rig, lv) {
    const rake = rig.weights["work-a"] > 0.5, load = rig.weights.carry > 0.5;
    rig.rake.visible = rake; rig.bundle.visible = load;
    rig.rake.matrixWorldAutoUpdate = rake; rig.bundle.matrixWorldAutoUpdate = load; // held things only cost when held
    if (!rake && !load) return;
    const L = lv.root.getObjectByName("handL"), R = lv.root.getObjectByName("handR");
    if (!L || !R) return;
    lv.root.updateMatrixWorld(true);
    L.getWorldPosition(hl); R.getWorldPosition(hr);
    mid.copy(hl).add(hr).multiplyScalar(0.5);
    if (rake) {
      // The handle runs through both hands: its top above the higher hand, its foot well below the lower one.
      axis.copy(hr).sub(hl);
      if (axis.lengthSq() < 1e-4) axis.set(0, 1, 0);
      axis.normalize(); if (axis.y < 0) axis.negate();
      const low = hl.y < hr.y ? hl : hr;
      rig.rake.position.copy(rig.group.worldToLocal(low.clone().addScaledVector(axis, -0.9)));
      rig.rake.quaternion.setFromUnitVectors(up, axis);
      rig.rake.quaternion.premultiply(rig.group.getWorldQuaternion(new THREE.Quaternion()).invert());
      rig.rake.scale.set(1, 1.6, 1);
    } else {
      rig.bundle.position.copy(rig.group.worldToLocal(mid.clone().add(new THREE.Vector3(0, 0.1, 0))));
      rig.bundle.quaternion.copy(rig.group.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(hr.x - hl.x, hr.z - hl.z)));
    }
  }

  // Foot pin: while a foot is in its stance (from the moment it lands until the other lands) it is held where it landed, by
  // bending the leg with a two-bone solve, so that it does not skate however the stride and the ground speed differ a little.
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3(), Bn = new THREE.Vector3(), Fw = new THREE.Vector3();
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), qw = new THREE.Quaternion();
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function turnBone(bone, from, to) {
    // Rotate `bone` so that the direction `from` (world) becomes `to`.
    q.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(qw);
    bone.parent.getWorldQuaternion(qp);
    bone.quaternion.copy(qp.invert().multiply(q).multiply(qw));
    bone.updateMatrixWorld(true);
  }
  function pinFeet(rig, lv, clip) {
    const loco = rig.holding ? 0 : smooth(0.5, 1, rig.weights.walk + rig.weights.carry);
    const meta = family.meta[clip === "carry" ? "carry" : "walk"], u = rig.walkT / meta.duration;
    const pins = (lv.pins ??= { L: null, R: null });
    for (const side of ["L", "R"]) {
      const contact = (meta.contacts.find((c) => c.foot === side)?.t ?? 0) / meta.duration;
      // The foot is flat on the floor from the heel's landing until about half the cycle; hold it there.
      const s = (((u - contact) % 1) + 1) % 1, stance = 0.5;
      const inStance = loco > 0 && s < stance;
      const thigh = lv.root.getObjectByName(`thigh${side}`), shin = lv.root.getObjectByName(`shin${side}`), foot = lv.root.getObjectByName(`foot${side}`);
      if (!thigh || !shin || !foot) continue;
      lv.root.updateMatrixWorld(true);
      if (!inStance) { pins[side] = null; continue; }
      foot.getWorldPosition(Fw);
      pins[side] ??= Fw.clone();
      const w = loco * smooth(0, 0.06, s) * (1 - smooth(0.38, 0.5, s));
      if (w < 0.01) { if (s < 0.1) pins[side] = Fw.clone(); continue; }
      T.set(pins[side].x, Fw.y, pins[side].z).lerp(Fw, 1 - w);
      thigh.getWorldPosition(A); shin.getWorldPosition(B);
      const l1 = A.distanceTo(B), l2 = B.distanceTo(Fw);
      const reach = Math.min(A.distanceTo(T), (l1 + l2) * 0.999);
      N.copy(T).sub(A).normalize();
      // The knee bends forward: its current side of the line from hip to target, or the figure's forward when the leg is straight.
      P.copy(B).sub(A); P.addScaledVector(N, -P.dot(N));
      if (P.lengthSq() < 1e-6) P.set(0, 0, 1).applyQuaternion(rig.group.quaternion);
      P.normalize();
      const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      Bn.copy(A).addScaledVector(N, a).addScaledVector(P, h);
      turnBone(thigh, B.sub(A).normalize(), Bn.clone().sub(A).normalize());
      shin.getWorldPosition(B);
      foot.getWorldPosition(Cc);
      turnBone(shin, Cc.sub(B).normalize(), T.clone().sub(B).normalize());
    }
  }

  return {
    size,
    get loaded() { return true; },
    /** A drawn person's walk phase (seconds into the walk cycle), for the far figure to carry on from. */
    walkTOf(id) { return byId.get(id)?.walkT; },
    /** The governor lowers how many people are drawn as animated figures. */
    setLimit(n) { limit = n; },
    setShadows(on) { shadowsOn = on; setShadowsAll(); },
    /** `world`: { seconds, frame }. `lod`: { near, mid } distances in metres. Returns the set of ids drawn by a rig. */
    place(candidates, world, dt, lod) {
      for (const k of Object.keys(acc)) acc[k] = 0;
      const all = new Map(candidates.map((c) => [c.id, c]));
      const wanted = candidates.filter((c) => c.d < lod.mid).slice(0, Math.min(size, limit)), ids = new Set(wanted.map((c) => c.id));
      // A person who falls out of the pool does not vanish: their rig fades out over a third of a second while the far figure (or
      // placeholder) takes over, so that nobody pops at the edge of the pool.
      for (const [id, rig] of byId) if (!ids.has(id)) rig.leaving = true;
      const free = rigs.filter((r) => r.id === null);
      const drawn = new Map();
      const roster = [...wanted, ...[...byId].filter(([id, r]) => r.leaving && !ids.has(id) && all.has(id)).map(([id]) => all.get(id))];
      for (const c of roster) {
        let rig = byId.get(c.id);
        if (rig && ids.has(c.id)) rig.leaving = false;
        if (!rig) {
          rig = free.pop();
          if (!rig) continue;
          rig.id = c.id; byId.set(c.id, rig);
          rig.seed = figureSeed(c.dayKey, c.id, c.look);
          tint(rig, rig.seed);
          rig.group.rotation.y = c.actor.heading ?? 0;
          rig.last = null; rig.speed = 0; rig.k = c.d > lod.near ? 1 : 0; rig.appear = 0; rig.leaving = false;
          rig.walkT = Number.isFinite(c.walkT) ? c.walkT : rig.seed.motionVariant.phase * 2; // the far figure's own walk phase, so the legs do not jump
          for (const k of Object.keys(rig.weights)) rig.weights[k] = k === clipFor(c.actor) ? 1 : 0;
        }
        rig.appear += clamp((rig.leaving ? 0 : 1) - rig.appear, -dt / FADE_RIG, dt / FADE_RIG);
        if (dt === 0) rig.appear = rig.leaving ? 0 : 1; // a still frame is drawn complete
        // Level of detail: near inside lod.near, mid beyond, with half a metre of hysteresis; a switch is a short dithered fade
        // in time, so that a figure standing on the boundary is not left speckled.
        const want = c.d > lod.near + (rig.k >= 0.5 ? -0.5 : 0.5) ? 1 : 0;
        rig.k = lod.force === "near" ? 0 : lod.force === "mid" ? 1 : rig.k + clamp(want - rig.k, -dt / 0.4, dt / 0.4); // `force` is for tests (?lod=)
        const k = rig.k;
        rig.near.root.visible = k < 1;
        rig.mid.root.visible = k > 0;
        for (const m of Object.values(rig.mats)) m.opacity = (1 - k) * rig.appear;
        for (const m of Object.values(rig.matsMid)) m.opacity = k * rig.appear;
        rig.group.visible = DBG !== "hide";
        rig.group.matrixWorldAutoUpdate = true;
        rig.near.root.matrixWorldAutoUpdate = rig.near.root.visible;
        rig.mid.root.matrixWorldAutoUpdate = rig.mid.root.visible;
        if (DBG !== "nopose") pose(rig, c.actor, world, dt);
        drawn.set(c.id, rig.appear);
        if (rig.leaving && rig.appear <= 0.001) { byId.delete(c.id); rig.id = null; rig.leaving = false; rig.group.visible = false; rig.group.matrixWorldAutoUpdate = false; drawn.delete(c.id); }
      }
      for (const [id, rig] of [...byId]) if (!all.has(id)) { byId.delete(id); rig.id = null; rig.leaving = false; rig.group.visible = false; rig.group.matrixWorldAutoUpdate = false; } // gone from the world
      for (const k of Object.keys(acc)) cost[k] += (acc[k] - cost[k]) * 0.05;
      return drawn;
    },
    /** For measuring: each drawn person's position, ground speed and the world position of both feet (near level, else mid). */
    probe() {
      const out = [], v = new THREE.Vector3();
      for (const r of rigs) {
        if (!r.id) continue;
        const lv = r.near.root.visible ? r.near : r.mid, feet = {};
        for (const side of ["L", "R"]) { lv.root.getObjectByName(`foot${side}`)?.getWorldPosition(v); feet[side] = v.toArray(); }
        out.push({ id: r.id, clip: r.clip, speed: r.speed, pos: r.group.position.toArray(), feet, level: lv === r.near ? "near" : "mid" });
      }
      return out;
    },
    info() { return { cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, +v.toFixed(2)])), size, drawn: byId.size, near: rigs.filter((r) => r.id && r.near.root.visible).length, mid: rigs.filter((r) => r.id && r.mid.root.visible).length }; },
  };
}
