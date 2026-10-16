// Quality tiers: what this device draws (contracts/quality-tiers.md). The tier is a pure function of what the device
// reports; the governor then steps presentation down, never up, when frames run slow. Neither touches the world: figure
// count in a routine, sound content and every world value stay the same on every device. (`seen` is how far, in metres, people are
// drawn at all: beyond it a person is a speck, and the scene's matrix walk over hundreds of them is what a phone cannot afford.)

/** The settings each tier names (data-model.md, Quality tier). Starting values, tuned from bench reports. */
export const TIERS = {
  high: { pixelRatioMax: 1.75, pixelBudgetMP: 2.2, shadowMap: 2048, post: "bloom", figureLod: { near: 14, mid: 45 }, lifeEffects: "all", textureSet: "2k", maxFigures: 20, maxCrowd: 120, seen: 90 },
  medium: { pixelRatioMax: 1.5, pixelBudgetMP: 1.5, shadowMap: 1024, post: "none", figureLod: { near: 10, mid: 35 }, lifeEffects: "reduced", textureSet: "1k", maxFigures: 14, maxCrowd: 80, seen: 70 },
  low: { pixelRatioMax: 1.0, pixelBudgetMP: 0.9, shadowMap: 0, post: "none", figureLod: { near: 6, mid: 25 }, lifeEffects: "minimal", textureSet: "1k", maxFigures: 12, maxCrowd: 40, seen: 55 },
};
const ORDER = ["high", "medium", "low"];
const LIFE = ["all", "reduced", "minimal"];

/**
 * `{ software, touch, minScreenSide, dpr, deviceMemoryGB?, probeFrameMs?, override? }` → `{ name, settings }`.
 * `override` (from `?tier=`) is for tests and screenshots only.
 */
export function selectTier({ software = false, touch = false, minScreenSide = 1000, deviceMemoryGB, probeFrameMs, override, gpu = "", dpr = 1 } = {}) {
  const pick = (name) => ({ name, settings: structuredClone(TIERS[name]) });
  if (override && TIERS[override]) return pick(override);
  if (software) return pick("low");
  if (touch || minScreenSide < 700) {
    if ((deviceMemoryGB !== undefined && deviceMemoryGB <= 2) || probeFrameMs > 40) return pick("low");
    return pick("medium");
  }
  // A laptop's integrated or mid-range GPU behind a Retina screen draws four times the pixels it can shade (a 2019 MacBook Pro: 15 fps on high).
  if (dpr >= 1.5 && /intel|uhd|iris|hd graphics|radeon pro \d{3}|radeon pro vega|geforce (mx|gt)/i.test(gpu)) return pick("medium");
  return pick(probeFrameMs > 25 ? "medium" : "high");
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * How many device pixels to draw for a canvas of `cssW` by `cssH`: the screen's own density, capped by the tier and by a budget
 * of megapixels (a 2019 Retina laptop would otherwise draw four million pixels of physically based shading).
 */
export const pixelRatioFor = (settings, dpr, cssW, cssH) => Math.max(0.5, Math.min(dpr, settings.pixelRatioMax, Math.sqrt((settings.pixelBudgetMP * 1e6) / Math.max(1, cssW * cssH))));

/**
 * Watches frame times and steps presentation down, never up: the post pass first, then pixel ratio, shadow resolution, figure LOD
 * distances, how many figures are animated, life effects, then the tier name (each in the order of what costs the device most
 * for the least to look at). For the first twelve seconds it calibrates: one-second windows, no rest after a step, and a bigger
 * jump the slower the frames (a device at 15 fps does not spend a minute finding its tier). After that, a window is two seconds
 * and a step is followed by one unjudged window (the step's own hitch). "Slow" is a window median over 36 ms: a device the
 * browser holds at 30 fps (33.3 ms) already meets the floor. Feed it every frame with `feed(frameMs, elapsedMs)`; it returns the
 * steps it took (an array), or null. `state.settings` is what to draw with.
 */
export function createGovernor(name, { windowMs = 2000, warmupMs = 1500, calibrateUntilMs = 12000, slowMs = 36, settings } = {}) {
  const state = { name, settings: settings ? structuredClone(settings) : structuredClone(TIERS[name]), steps: [] };
  let stage = 0, windowStart = warmupMs, samples = [], settling = false;
  const record = (what, from, to) => { const s = { what, from, to }; state.steps.push(s); return s; };
  const STAGES = [
    // the post pass: a half-float multisampled target and a bloom, the costliest thing on a laptop
    (s) => { if (s.post === "none") return null; const from = s.post; s.post = "none"; return record("post", from, "none"); },
    (s) => { // pixel ratio, down to just over half of the tier's own
      const floor = Math.max(0.6, 0.55 * TIERS[state.name].pixelRatioMax), next = Math.max(floor, s.pixelRatioMax * 0.85);
      if (next >= s.pixelRatioMax - 1e-9) return null;
      const from = s.pixelRatioMax; s.pixelRatioMax = next; s.pixelBudgetMP = Math.max(0.6, s.pixelBudgetMP * 0.85); return record("pixelRatio", from, next);
    },
    (s) => { // shadow map: 2048, 1024, 512, none
      if (s.shadowMap === 0) return null;
      const from = s.shadowMap; s.shadowMap = from > 512 ? from / 2 : 0; return record("shadowMap", from, s.shadowMap);
    },
    (s) => { if (s.figureLod.near <= 4) return null; const from = { ...s.figureLod }; s.figureLod = { near: from.near * 0.75, mid: from.mid * 0.75 }; return record("figureLod", from, s.figureLod); },
    // how many people are drawn as animated figures (the rest as placeholders): the CPU cost the pixel ratio does not touch
    (s) => { if (s.maxFigures <= 6) return null; const from = s.maxFigures; s.maxFigures = Math.max(6, Math.floor(from * 0.75)); return record("rigs", from, s.maxFigures); },
    (s) => { const i = LIFE.indexOf(s.lifeEffects); if (i >= LIFE.length - 1) return null; const from = s.lifeEffects; s.lifeEffects = LIFE[i + 1]; return record("lifeEffects", from, s.lifeEffects); },
    (s) => {
      const i = ORDER.indexOf(state.name);
      if (i >= ORDER.length - 1) return null;
      const from = state.name, lower = TIERS[ORDER[i + 1]];
      state.name = ORDER[i + 1];
      // Take the lower tier's value wherever it is lower; never raise anything.
      s.pixelRatioMax = Math.min(s.pixelRatioMax, lower.pixelRatioMax);
      s.pixelBudgetMP = Math.min(s.pixelBudgetMP, lower.pixelBudgetMP);
      s.shadowMap = Math.min(s.shadowMap, lower.shadowMap);
      s.post = lower.post === "none" ? "none" : s.post;
      s.figureLod = { near: Math.min(s.figureLod.near, lower.figureLod.near), mid: Math.min(s.figureLod.mid, lower.figureLod.mid) };
      s.lifeEffects = LIFE[Math.max(LIFE.indexOf(s.lifeEffects), LIFE.indexOf(lower.lifeEffects))];
      s.textureSet = lower.textureSet === "1k" ? "1k" : s.textureSet;
      s.maxFigures = Math.min(s.maxFigures, lower.maxFigures);
      s.maxCrowd = Math.min(s.maxCrowd, lower.maxCrowd);
      s.seen = Math.min(s.seen, lower.seen);
      stage = 0; // the lower tier has its own floors to reach
      return record("tier", from, state.name);
    },
  ];
  function step() {
    while (stage < STAGES.length) {
      const taken = STAGES[stage](state.settings);
      if (taken) return taken;
      stage += 1;
    }
    return null;
  }
  return {
    state,
    feed(frameMs, elapsedMs) {
      if (elapsedMs < warmupMs) return null;
      samples.push(frameMs);
      const calibrating = elapsedMs < calibrateUntilMs, length = calibrating ? 1000 : windowMs;
      if (elapsedMs - windowStart < length) return null;
      const m = median(samples);
      samples = []; windowStart = elapsedMs;
      if (!calibrating && settling) { settling = false; return null; }
      if (m <= slowMs) return null;
      settling = !calibrating;
      // The slower, the bigger the jump: twice the allowed time is two steps, three times is three.
      const n = calibrating ? Math.min(3, Math.max(1, Math.floor(m / slowMs))) : 1, taken = [];
      for (let k = 0; k < n; k += 1) { const t = step(); if (!t) break; taken.push(t); }
      return taken.length ? taken : null;
    },
  };
}

/** Reads the device for `selectTier`. Browser only. `?tier=` overrides, for tests and screenshots. */
export function readDevice(renderer) {
  const gl = renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
  const params = new URLSearchParams(location.search);
  return {
    gpu: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "",
    software: !!info && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))),
    touch: matchMedia("(pointer: coarse)").matches,
    minScreenSide: Math.min(screen.width, screen.height),
    dpr: window.devicePixelRatio || 1,
    deviceMemoryGB: navigator.deviceMemory,
    override: params.get("tier") ?? undefined,
  };
}
