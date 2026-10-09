// Boot: the world runs on Jerusalem's clock; the visitor walks through it. Nothing here decides what happens on the
// Mount — world/world.js does — this file only shows it: the scene, speech above heads, notes about the place, sound.
import { createWorldScene } from "./scene/world-scene.js";
import { createWalker } from "./controls.js";
import { createAudio } from "./audio.js";
import { worldAt, soundsBetween, arrivalAt } from "./world/world.js";
import { soundscapeAt, callsBetween, musicBetween } from "./world/soundscape.js";
import { notesAt, NOTES } from "./world/notes.js";
import { flightAt, flightCuesBetween, OFFER, FLIGHT } from "./world/jericho.js";
import { CAST } from "./world/cast.js";
import { UI, clockText } from "./ui-text.js";
import { F, ALTAR, HEICHAL } from "./world/places.js";
import { EYE } from "./controls.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Always now. `?at=<ISO instant>` exists for tests and screenshots only and is never offered in the page.
const at = params.get("at") ? Date.parse(params.get("at")) : NaN;
const offset = Number.isFinite(at) ? at - Date.now() : 0;
const frozen = params.has("still");
// The shared moment trusts the device clock, unless the server's own (its Date header) says the device is well off.
let skew = 0;
const now = () => (frozen ? at : Date.now() + offset + skew);
if (!params.has("at")) fetch(location.pathname, { method: "HEAD", cache: "no-store" }).then((r) => { const s = Date.parse(r.headers.get("date")) - Date.now(); if (Math.abs(s) > 5000) skew = s; }).catch(() => {});
const lowPower = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600;
let lang = params.get("lang") === "en" ? "en" : "he";
let lastNote = null;

const layout = await (await fetch("./content/layout.json")).json();
const canvas = $("stage");
const scene = createWorldScene(canvas, layout, { F, TOP: ALTAR.top, ALTAR: [ALTAR.x, ALTAR.top, ALTAR.z], LAVER: [-22.5, F, -36], HEICHAL }, CAST, { lowPower });
const audio = createAudio();
const spawn = (params.get("pos") ?? "").split(",").map(Number);
// Arrive facing whatever is going on now (or where a test asks).
const walker = createWalker(spawn.length >= 2 && spawn.every(Number.isFinite) ? { x: spawn[0], z: spawn[1], yaw: spawn[2] ?? Math.PI / 2 } : arrivalAt(now()), { gateOpen: () => (world?.env.gate ?? 0) > 0.6 });

// Text.
function setLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  $("lang").textContent = UI[lang].lang;
  for (const el of document.querySelectorAll("[data-he]")) el.textContent = el.dataset[lang];
  lastNote = null;
  $("follow").textContent = UI[lang].follow;
  $("back").textContent = UI[lang].back;
  $("stage").setAttribute("aria-label", UI[lang].canvas);
  $("note").setAttribute("aria-label", UI[lang].noteRegion);
  paintSound();
}
setLang(lang);

// Quiet mode: a setting, remembered on this device.
const remembered = (() => { try { return localStorage.getItem("temple.sound"); } catch { return null; } })();
audio.mute(remembered === "off");
function paintSound() {
  $("sound").setAttribute("aria-pressed", String(!audio.muted));
  $("sound").setAttribute("aria-label", audio.muted ? UI[lang].soundOff : UI[lang].soundOn);
}
$("sound").addEventListener("click", () => {
  audio.mute(!audio.muted);
  try { localStorage.setItem("temple.sound", audio.muted ? "off" : "on"); } catch { /* private window: it stays for this visit */ }
  paintSound();
  audio.start();
});
paintSound();

// Arrival.
let entered = params.has("at") || params.has("enter");
$("enter").hidden = entered;
$("go").addEventListener("click", () => { entered = true; $("enter").hidden = true; audio.start(); });
$("lang").addEventListener("click", () => setLang(lang === "he" ? "en" : "he"));
// On a phone the note starts folded to one line, so the view stays clear; tap it to read.
let folded = matchMedia("(max-width: 520px), (max-height: 500px)").matches;
const fold = (v) => { folded = v; $("note").classList.toggle("folded", folded); $("note-fold").textContent = folded ? "▴" : "▾"; };
fold(folded);
$("note").querySelector("header").addEventListener("click", () => fold(!folded));

// Input: keys, mouse drag, a touch stick, touch drag.
const keys = new Set();
addEventListener("keydown", (e) => { if (!e.target.closest?.("button")) keys.add(e.code); if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); });
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const stick = { id: null, x: 0, y: 0 };
const looks = new Map();
canvas.addEventListener("pointerdown", (e) => { looks.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); canvas.setPointerCapture?.(e.pointerId); audio.start(); });
canvas.addEventListener("pointermove", (e) => {
  const p = looks.get(e.pointerId);
  if (!p || flight) return;
  walker.look((e.clientX - p.x) * 0.0042 * (lang === "he" ? 1 : 1), (e.clientY - p.y) * 0.0035);
  p.x = e.clientX; p.y = e.clientY;
});
const endLook = (e) => {
  const p = looks.get(e.pointerId);
  looks.delete(e.pointerId);
  // A tap (barely moved, quickly lifted) reads a person or a place, or on a desktop walks to the spot.
  if (e.type === "pointerup" && p && !flight && entered && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && performance.now() - p.t0 < 450) tap(e.clientX, e.clientY);
};
canvas.addEventListener("pointerup", endLook);
canvas.addEventListener("pointercancel", endLook);
const pad = $("stick"), knob = $("knob");
pad.addEventListener("pointerdown", (e) => { stick.id = e.pointerId; pad.setPointerCapture(e.pointerId); moveStick(e); audio.start(); });
pad.addEventListener("pointermove", (e) => { if (e.pointerId === stick.id) moveStick(e); });
const endStick = () => { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
pad.addEventListener("pointerup", endStick);
pad.addEventListener("pointercancel", endStick);
function moveStick(e) {
  const r = pad.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  stick.x = dx; stick.y = dy;
  knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
}

// Tap or click: a person gives the note of where they stand and what they are doing; a place gives its note on a
// touch screen, and on a desktop the visitor walks there (the note follows on arrival).
let pinned = null, target = null;
const coarse = matchMedia("(pointer: coarse)").matches;
function tap(sx, sy) {
  if (!world) return;
  let best = null;
  for (const p of Object.values(world.people)) {
    if (!p.visible || Math.hypot(p.pos[0] - walker.me.x, p.pos[2] - walker.me.z) > 45) continue;
    const a = scene.project([p.pos[0], p.pos[1] + 1.0, p.pos[2]], innerWidth, innerHeight);
    const d = a ? Math.hypot(a.x - sx, a.y - sy) : Infinity;
    if (d < (coarse ? 56 : 40) && (!best || d < best.d)) best = { d, x: p.pos[0], z: p.pos[2] };
  }
  const ground = best ? null : scene.ground(sx, sy, innerWidth, innerHeight, walker.me.y - EYE);
  const spot = best ? [best.x, best.z] : ground;
  if (!spot) return;
  if (best || coarse) {
    const note = notesAt(spot[0], spot[1], world.routines)[0];
    if (note) { pinned = { note, x: walker.me.x, z: walker.me.z, at: performance.now() }; lastNote = null; fold(false); }
  } else if (Math.hypot(spot[0] - walker.me.x, spot[1] - walker.me.z) < 90) target = { x: spot[0], z: spot[1], from: [walker.me.x, walker.me.z], since: performance.now(), t0: performance.now() };
}

// Speech bubbles, pooled.
const bubbles = new Map();
function showSpeech(w) {
  const seen = new Set();
  if (flight) { for (const b of bubbles.values()) b.remove(); bubbles.clear(); return; }
  for (const p of Object.values(w.people)) {
    if (!p.say || !p.visible) continue;
    const d = Math.hypot(p.pos[0] - walker.me.x, p.pos[2] - walker.me.z);
    if (d > 40) continue;
    const s = scene.project([p.pos[0], p.pos[1] + 2.6, p.pos[2]], innerWidth, innerHeight);
    if (!s || s.x < -100 || s.x > innerWidth + 100 || s.y < -50 || s.y > innerHeight) continue;
    let b = bubbles.get(p.id);
    if (!b) {
      b = document.createElement("div");
      b.className = "bubble";
      b.innerHTML = '<span class="said" lang="he" dir="rtl"></span><span class="gloss"></span>';
      $("bubbles").append(b);
      bubbles.set(p.id, b);
    }
    b.firstChild.textContent = p.say.he;
    b.lastChild.textContent = p.say.gloss[lang];
    b.lastChild.dir = lang === "he" ? "rtl" : "ltr";
    const scale = Math.max(0.55, Math.min(1, 14 / Math.max(d, 1)));
    b.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    seen.add(p.id);
  }
  for (const [id, b] of bubbles) if (!seen.has(id)) { b.remove(); bubbles.delete(id); }
}

// The note about where you stand.
function showNote(w) {
  if (pinned && (flight || performance.now() - pinned.at > 20000 || Math.hypot(walker.me.x - pinned.x, walker.me.z - pinned.z) > 4)) pinned = null;
  const note = flight ? EAST : pinned?.note ?? notesAt(walker.me.x, walker.me.z, w.routines)[0] ?? null;
  const key = note ? `${note.id}:${lang}` : null;
  if (key === lastNote) return;
  lastNote = key;
  $("note").hidden = !note || !entered;
  if (!note) return;
  $("note-kind").textContent = `${note.imagined ? UI[lang].imagined : UI[lang].source} · ${note[lang].split(/[.:]/)[0]}`;
  $("note-text").textContent = note[lang];
  $("note-text").className = note.imagined ? "imagined" : "";
}

// The Jericho flight: offered for a while after the great gate opens, never forced. The world keeps running; only the
// camera flies, and it comes back to exactly where the visitor stood.
let flight = null, offered = null, declined = null;
const EAST = NOTES.find((n) => n.id === "east");
function startFlight() {
  const { x, y, z, yaw, pitch } = walker.me;
  const home = { pos: [x, y, z], look: [x - Math.sin(yaw) * Math.cos(pitch) * 10, y + Math.sin(pitch) * 10, z - Math.cos(yaw) * Math.cos(pitch) * 10] };
  flight = { started: performance.now(), s: 0, home, mark: offered };
  declined = offered; // offered once per opening
  offered = null;
  keys.clear(); endStick();
  $("follow").hidden = true;
  $("back").hidden = false;
  $("heard").hidden = true;
  document.body.classList.add("flying");
  for (let g = 0; g < 4; g += 1) scene.sneeze(g, -9);
  lastNote = null;
  audio.start();
}
function endFlight() {
  flight = null;
  document.body.classList.remove("flying");
  $("back").hidden = true;
  $("heard").hidden = true;
  $("fade").style.opacity = 0;
  lastNote = null;
}
$("follow").addEventListener("click", startFlight);
$("back").addEventListener("click", endFlight);
addEventListener("keydown", (e) => { if (e.code === "Escape" && flight) endFlight(); });
function stepFlight() {
  const s = (performance.now() - flight.started) / 1000;
  for (const c of flightCuesBetween(flight.s, s)) {
    if (c.kind === "sneeze") scene.sneeze(c.goat, c.t);
    audio.play(c.id, c.kind === "ripple" ? 0.8 : 0.6);
    if (c.kind === "ripple") { $("heard").hidden = false; $("heard").innerHTML = `<small>${UI[lang].heard}</small>${c.ripple[lang]}`; flight.heard = s; }
  }
  if (flight.heard !== undefined && s - flight.heard > 3.5) $("heard").hidden = true;
  flight.s = s;
  const view = flightAt(s, flight.home);
  $("fade").style.opacity = view.fade;
  if (view.done) { endFlight(); return null; }
  return { ...view, s };
}

const resize = () => scene.resize(innerWidth, innerHeight);
addEventListener("resize", resize);
resize();

const LOOK = 600; // ms: notes are scheduled this far ahead so their rhythm is not ragged
let last = performance.now(), lastT = now(), musicT = lastT + LOOK, callT = lastT, frames = 0, world = null, heard = null;
function frame(ms) {
  if ($("go").disabled) $("go").disabled = false; // loaded: the Mount can be entered
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  let forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - stick.y;
  const right = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + stick.x;
  // Walking to a clicked spot: turn toward it and go; any key or the stick takes over, and a wall ends it.
  if (target && (forward || right || flight || !entered)) target = null;
  if (target) {
    const dx = target.x - walker.me.x, dz = target.z - walker.me.z, d = Math.hypot(dx, dz);
    if (d < 0.7 || performance.now() - target.t0 > 60000) target = null;
    else {
      const want = Math.atan2(-dx, -dz);
      const diff = Math.atan2(Math.sin(want - walker.me.yaw), Math.cos(want - walker.me.yaw));
      walker.me.yaw += Math.max(-3 * dt, Math.min(3 * dt, diff));
      forward = Math.abs(diff) < 1 ? 1 : 0;
      if (performance.now() - target.since > 1500) { // every 1.5 s: still getting somewhere?
        if (Math.hypot(walker.me.x - target.from[0], walker.me.z - target.from[1]) < 0.4) target = null; // a wall
        else { target.from = [walker.me.x, walker.me.z]; target.since = performance.now(); }
      }
    }
  }
  const turn = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
  if (turn && !flight) walker.look(turn * dt * 1.6, 0);
  // Walking keeps real pace even when frames are slow (capped, so a stall never throws the visitor across a court).
  if (entered && !flight) walker.step(Math.min(0.25, (ms - (frame.prev ?? ms)) / 1000), { forward: Math.max(-1, Math.min(1, forward)), right: Math.max(-1, Math.min(1, right)) }, keys.has("ShiftLeft") || keys.has("ShiftRight"));
  frame.prev = ms;
  const t = now();
  world = worldAt(t);
  // After a hidden tab or a stall, what fell due meanwhile is not all played at once.
  for (const s of t - lastT < 10000 ? soundsBetween(lastT, t) : []) {
    if (s.id === "song") continue; // the song is the music's now (it comes from the same windows, in phrases)
    const p = world.people[s.who];
    const d = p ? Math.hypot(p.pos[0] - walker.me.x, p.pos[2] - walker.me.z) : 0;
    audio.play(s.id, Math.max(0.15, 1 - d / 140), p ? [p.pos[0], p.pos[1] + 1.6, p.pos[2]] : null);
  }
  // Offer the flight while the gate's sound is fresh, once per opening.
  const fresh = world.gateOpenedAt !== null && t - world.gateOpenedAt >= OFFER.after && t - world.gateOpenedAt < OFFER.for;
  if (fresh && entered && !flight && offered === null && world.gateOpenedAt !== declined) offered = world.gateOpenedAt;
  if (!fresh && offered !== null) offered = null;
  $("follow").hidden = offered === null || Boolean(flight);
  const view = flight ? stepFlight() : null;
  scene.update(world, walker.me, dt, frozen ? (t / 1000) % 1000 : ms / 1000, view);
  // What is heard: the beds a few times a second, the calls of the Mount as they fall due, footfalls every frame.
  audio.listen(walker.me);
  if (!heard || ms - heard.at > 250) {
    // The slow work, a few times a second: the beds, the calls that fell due since last time, and the notes of the
    // song for the next stretch (the music cursor runs ahead of the clock by LOOK, so each note is scheduled once).
    heard = { at: ms, scape: soundscapeAt(world, walker.me) };
    audio.hear(heard.scape, ms / 1000);
    for (const c of t - callT < 10000 ? callsBetween(callT, t, world, walker.me) : []) audio.play(c.id, c.level, c.pos);
    callT = t;
    for (const n of t + LOOK - musicT < 10000 ? musicBetween(musicT, t + LOOK, world, walker.me) : []) audio.note(n, (n.t - t) / 1000);
    musicT = t + LOOK;
  }
  lastT = t;
  audio.duck(flight ? 0.15 : 1);
  audio.tick(dt, entered && !flight ? walker.me.speed : 0);
  if (frames % 15 === 0) $("clock").innerHTML = clockText(world, lang);
  showSpeech(world);
  showNote(world);
  frames += 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** People within 40 m whose heads are on screen (how alive the view is right now). */
function inView() {
  if (!world) return 0;
  let n = 0;
  for (const p of Object.values(world.people)) {
    if (!p.visible || Math.hypot(p.pos[0] - walker.me.x, p.pos[2] - walker.me.z) > 40) continue;
    const s = scene.project([p.pos[0], p.pos[1] + 1.7, p.pos[2]], innerWidth, innerHeight);
    if (s && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight) n += 1;
  }
  return n;
}

// For tests: read the state and move the visitor. Not part of the experience.
window.__temple = {
  get frames() { return frames; },
  state: () => ({
    t: world?.t, x: walker.me.x, y: walker.me.y, z: walker.me.z, yaw: walker.me.yaw, entered, dir: document.documentElement.dir,
    visible: world ? Object.values(world.people).filter((p) => p.visible).length : 0,
    moving: world ? Object.values(world.people).filter((p) => p.visible && p.moving).length : 0,
    routines: world?.routines.map((r) => r.id) ?? [], bubbles: [...bubbles.keys()], note: lastNote,
    flight: flight ? Number(flight.s.toFixed(1)) : null, offered: offered !== null, camera: scene.camera.position.toArray().map((v) => Number(v.toFixed(2))), shabbat: world?.calendar.shabbat, audio: audio.state, muted: audio.muted, walking: target !== null, pinned: pinned?.note.id ?? null, loudness: Number(audio.level.toFixed(4)), sound: heard?.scape.summary ?? null,
    draws: scene.info().calls, inView: inView(),
  }),
  place: (x, z, yaw) => walker.place(x, z, yaw),
  /** Screen position of the nearest visible person within 25 m who is on screen (to tap on). */
  personOnScreen: () => {
    let best = null;
    for (const p of Object.values(world?.people ?? {})) {
      const d = Math.hypot(p.pos[0] - walker.me.x, p.pos[2] - walker.me.z);
      if (!p.visible || d > 25 || (best && d > best.d)) continue;
      const s = scene.project([p.pos[0], p.pos[1] + 1.0, p.pos[2]], innerWidth, innerHeight);
      if (s && s.x > 40 && s.x < innerWidth - 40 && s.y > 80 && s.y < innerHeight - 160) best = { id: p.id, d, x: s.x, y: s.y };
    }
    return best;
  },
};
