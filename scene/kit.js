// Building blocks for the look: materials, code-drawn textures, glows, robed figures and goats.
// Everything here is imagination: faces, robes, colours and proportions are picture-book choices.
import * as THREE from "three";

export const C = (hex) => new THREE.Color(hex);
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
export const glow = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false, ...extra });
export const flame = (color, opacity = 0.9) => glow(color, opacity, { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

export function put(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
export const box = (sx, sy, sz, material, x, y, z, parent) => put(new THREE.BoxGeometry(sx, sy, sz), material, x, y, z, parent);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size, draw, repeat = true) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Big drafted stones, two to a row and four rows to the tile. The tile multiplies the material colour. */
export const ashlarTexture = () => canvasTexture(256, (g, n) => {
  const r = rng(7), bw = n / 2, bh = n / 4;
  const tone = Array.from({ length: 8 }, () => 224 + Math.floor(r() * 31));
  for (let row = 0; row < 4; row += 1) for (let col = -1; col < 3; col += 1) {
    const x = col * bw + (row % 2) * (bw / 2), y = row * bh, v = tone[row * 2 + (((col % 2) + 2) % 2)];
    g.fillStyle = `rgb(${v},${v},${v - 5})`;
    g.fillRect(x, y, bw, bh);
    g.strokeStyle = "rgba(96,80,60,.5)";
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.lineWidth = 2;
    g.strokeRect(x + 7, y + 7, bw - 14, bh - 14);
  }
});

/** A woven curtain, hanging in folds: deep blue with bands of purple, crimson and linen (colours imagined). */
export const curtainTexture = () => canvasTexture(256, (g, n) => {
  g.fillStyle = "#34489a";
  g.fillRect(0, 0, n, n);
  for (const [y, h, c] of [[18, 10, "#5b2a6e"], [30, 6, "#9a2233"], [38, 4, "#efe6d2"], [200, 4, "#efe6d2"], [206, 6, "#9a2233"], [214, 10, "#5b2a6e"]]) { g.fillStyle = c; g.fillRect(0, y, n, h); }
  g.fillStyle = "rgba(239,230,210,.18)";
  for (let y = 60; y < 190; y += 26) for (let x = (y / 26) % 2 ? 0 : 16; x < n; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 9); g.lineTo(x, y + 18); g.lineTo(x - 8, y + 9); g.fill(); }
  for (let x = 0; x < n; x += 1) { const k = 0.5 + 0.5 * Math.cos((x / n) * Math.PI * 8); g.fillStyle = `rgba(0,0,0,${(0.24 * k).toFixed(3)})`; g.fillRect(x, 0, 1, n); } // folds
});

/** Square pavers, four by four to the tile. */
export const pavingTexture = () => canvasTexture(256, (g, n) => {
  const r = rng(21), s = n / 4;
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    const v = 226 + Math.floor(r() * 26) - ((i + j) % 2) * 8;
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(i * s, j * s, s, s);
    g.strokeStyle = "rgba(96,80,60,.42)";
    g.lineWidth = 2.5;
    g.strokeRect(i * s + 1, j * s + 1, s - 2, s - 2);
  }
});

let haloTex = null;
export const haloTexture = () => haloTex ?? (haloTex = canvasTexture(128, (g, n) => {
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,.13)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
}, false));

/** A soft additive glow that always faces the camera. */
export function halo(color, size, opacity = 1, parent) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  parent?.add(s);
  return s;
}
/** The same glow lying flat (light spilling on a floor). */
export function pool(color, sx, sz, opacity, parent) {
  const m = put(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: haloTexture(), color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), 0, 0, 0, parent);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A box whose texture repeats every `tile` metres on every face. */
export function tileBox(sx, sy, sz, tile = 6) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f += 1) for (let j = 0; j < 4; j += 1) {
    const i = f * 4 + j;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
  }
  return geo;
}

const HEADWEAR = {
  turban(head, color) {
    put(new THREE.SphereGeometry(0.3, 9, 6), mat(color), 0, 0.15, -0.01, head).scale.set(1, 0.62, 1);
    put(new THREE.SphereGeometry(0.11, 6, 5), mat(color), 0, 0.36, 0, head);
  },
  cap(head, color) { put(new THREE.SphereGeometry(0.285, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), 0, 0.03, 0, head); },
  hair(head, color) {
    put(new THREE.SphereGeometry(0.29, 9, 5, 0, Math.PI * 2, 0, Math.PI / 1.9), mat(color), 0, 0.02, -0.03, head);
    put(new THREE.SphereGeometry(0.1, 6, 4), mat(color), 0.08, 0.2, 0.2, head);
  },
  scarf(head, color) {
    put(new THREE.SphereGeometry(0.3, 9, 6), mat(color), 0, 0.04, -0.05, head).scale.set(1, 1, 0.95);
    box(0.5, 0.42, 0.1, mat(color), 0, -0.3, -0.2, head);
  },
};

/**
 * A robed picture-book figure, about two metres tall at scale 1, facing +z.
 * `prop(hand)` may hang something on the right hand.
 */
export function figure({ robe = "#f6f1e4", sash = "#b23a48", skin = "#cf9f72", headwear = "turban", headColor = "#f6f1e4", beard = null, scale = 1, prop = null, phase = 0 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const robeMat = mat(robe), skinMat = mat(skin);
  put(new THREE.CylinderGeometry(0.21, 0.5, 1.16, 9), robeMat, 0, 0.58, 0, body);
  put(new THREE.CylinderGeometry(0.27, 0.3, 0.11, 9), mat(sash), 0, 0.84, 0, body);
  box(0.09, 0.4, 0.05, mat(sash), 0.1, 0.62, 0.33, body).rotation.x = -0.25;
  put(new THREE.SphereGeometry(0.24, 8, 5), robeMat, 0, 1.12, 0, body).scale.set(1.15, 0.6, 0.9);
  const head = new THREE.Group();
  head.position.set(0, 1.43, 0);
  put(new THREE.SphereGeometry(0.27, 10, 8), skinMat, 0, 0, 0, head);
  const eye = glow("#2a1c14");
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.036, 6, 5), eye, s * 0.1, 0.02, 0.248, head);
  if (beard) {
    const b = put(new THREE.ConeGeometry(0.19, 0.36, 7), mat(beard), 0, -0.24, 0.13, head);
    b.rotation.x = Math.PI;
    b.scale.z = 0.7;
  }
  HEADWEAR[headwear]?.(head, headColor);
  body.add(head);
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 1.13, 0);
    put(new THREE.CylinderGeometry(0.075, 0.1, 0.56, 6), robeMat, 0, -0.27, 0, pivot);
    put(new THREE.SphereGeometry(0.075, 6, 5), skinMat, 0, -0.6, 0, pivot);
    body.add(pivot);
    return pivot;
  });
  let held = null;
  if (prop) {
    held = new THREE.Group();
    held.position.set(0, -0.6, 0.02);
    prop(held);
    arms[1].add(held);
  }
  const shadow = put(new THREE.CircleGeometry(0.55, 14), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.03, 0, g);
  shadow.rotation.x = -Math.PI / 2;
  g.scale.setScalar(scale * 1.15);
  return { g, body, head, arms, held, phase };
}

const POSES = {
  // [left x, left z, right x, right z, lean, head tilt]
  stand: [0.06, -0.14, 0.06, 0.14, 0, 0],
  listen: [0.06, -0.14, -2.7, -0.42, 0.07, 0.2],
  point: [0.06, -0.14, -1.55, 0.1, 0, 0],
  ask: [-0.5, -0.3, -1.25, 0.3, 0.05, 0.12],
  raise: [-2.75, -0.42, -2.75, 0.42, -0.06, -0.12],
  reach: [-1.9, -0.1, -1.9, 0.1, 0.05, 0],
  push: [-1.45, -0.1, -1.45, 0.1, 0.22, 0],
  crank: [-0.6, -0.1, -1.25, 0.05, 0.14, 0.05],
  wash: [-1.0, 0.2, -1.0, -0.2, 0.24, 0.1],
  carry: [-1.05, 0.25, -1.05, -0.25, 0.02, 0],
  rake: [-1.15, 0.2, -1.15, -0.2, 0.18, 0.08],
  peek: [-0.1, -0.14, -1.0, -0.3, 0.2, 0.1],
  hold: [0.06, -0.14, -1.35, 0.12, 0, 0],
  bow: [0.1, -0.14, 0.1, 0.14, 0.6, 0.3], // bending low, as the people did at each blast (Tamid 7:3)
};

/** Move a figure to its actor state: place, heading, pose. */
export function poseFigure(f, actor, time, dt) {
  const [L, R] = f.arms;
  const s = Math.sin(time * 7 + f.phase);
  let [lx, lz, rx, rz, lean, tilt] = POSES[actor.pose] ?? POSES.stand;
  let bob = 0;
  switch (actor.pose) {
    case "walk": lx = s * 0.6; rx = -s * 0.6; lz = -0.14; rz = 0.14; bob = Math.abs(s) * 0.05; lean = 0.06; break;
    case "carry": bob = actor.moving ? Math.abs(s) * 0.04 : 0; break;
    case "raise": lx += Math.sin(time * 3 + f.phase) * 0.12; rx += Math.sin(time * 3 + f.phase) * 0.12; break;
    case "ask": rx += Math.sin(time * 4) * 0.2; break;
    case "push": lx += Math.sin(time * 2.2) * 0.1; rx += Math.sin(time * 2.2) * 0.1; break;
    case "crank": rx += Math.sin(time * 5) * 0.5; break;
    case "wash": lx += s * 0.15; rx -= s * 0.15; break;
    case "rake": lx += Math.sin(time * 3.2) * 0.3; rx += Math.sin(time * 3.2) * 0.3; lean += Math.sin(time * 3.2) * 0.05; break;
    case "listen": tilt += Math.sin(time * 0.9 + f.phase) * 0.04; break;
    case "peek": lean += Math.sin(time * 0.8) * 0.04; break;
    default: lean += Math.sin(time * 0.9 + f.phase) * 0.015;
  }
  if (actor.moving && actor.pose === "carry") { lx = -1.05; rx = -1.05; lean = 0.06; }
  const k = Math.min(1, dt * 8 || 1);
  L.rotation.x = lerp(L.rotation.x, lx, k);
  L.rotation.z = lerp(L.rotation.z, lz, k);
  R.rotation.x = lerp(R.rotation.x, rx, k);
  R.rotation.z = lerp(R.rotation.z, rz, k);
  f.body.rotation.x = lerp(f.body.rotation.x, lean, k);
  f.head.rotation.z = lerp(f.head.rotation.z, tilt, k);
  f.body.position.y = bob;
  f.g.position.set(...actor.pos);
  if (actor.heading !== null && actor.heading !== undefined) {
    let d = actor.heading - f.g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    f.g.rotation.y += d * (dt ? k : 1);
  }
}

/** A goat, facing +x. Returns the parts the sneeze moves. */
export function goat(color, scale = 1) {
  const g = new THREE.Group();
  const coat = mat(color), dark = mat("#3c3028"), eye = glow("#1c140e");
  const body = new THREE.Group();
  g.add(body);
  box(1.15, 0.62, 0.56, coat, 0, 0.82, 0, body);
  put(new THREE.SphereGeometry(0.34, 7, 5), coat, -0.5, 0.86, 0, body).scale.set(1, 0.95, 0.85);
  for (const [lx, lz] of [[-0.42, -0.19], [-0.42, 0.19], [0.42, -0.19], [0.42, 0.19]]) {
    box(0.13, 0.56, 0.13, coat, lx, 0.28, lz, body);
    box(0.15, 0.1, 0.15, dark, lx, 0.05, lz, body);
  }
  box(0.3, 0.12, 0.1, coat, -0.72, 1.08, 0, body).rotation.z = -0.7;
  const head = new THREE.Group();
  head.position.set(0.56, 1.14, 0);
  box(0.3, 0.42, 0.3, coat, 0.06, -0.06, 0, head).rotation.z = -0.5;
  box(0.52, 0.4, 0.4, coat, 0.28, 0.16, 0, head);
  box(0.24, 0.24, 0.3, mat("#f1dfd0"), 0.56, 0.08, 0, head);
  for (const s of [-1, 1]) {
    put(new THREE.SphereGeometry(0.05, 6, 5), eye, 0.4, 0.24, s * 0.205, head);
    const ear = box(0.26, 0.1, 0.05, coat, 0.1, 0.22, s * 0.25, head);
    ear.rotation.set(s * 0.5, 0, -0.5);
    put(new THREE.ConeGeometry(0.06, 0.42, 5), dark, 0.12, 0.52, s * 0.11, head).rotation.z = 0.6;
  }
  put(new THREE.ConeGeometry(0.07, 0.26, 5), coat, 0.5, -0.16, 0, head).rotation.x = Math.PI;
  body.add(head);
  const puff = put(new THREE.SphereGeometry(1, 7, 5), glow("#ffffff", 0.75), 1.2, 1.2, 0, g);
  puff.visible = false;
  const shadow = put(new THREE.CircleGeometry(0.75, 14), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.03, 0, g);
  shadow.rotation.x = -Math.PI / 2;
  g.scale.setScalar(scale);
  return { g, body, head, puff, sneeze: -9 };
}
