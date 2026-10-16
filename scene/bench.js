// Bench mode (`?bench=1`): a fixed 120 s scripted walk that measures frame times, draw cost, transfer and console errors,
// then POSTs one report to the LAN bench server (app/scripts/bench.js; contracts/bench-report.md). Normal visits never load
// this. It reads the clock only to measure; nothing it does feeds back into what the world shows.
const WINDOW_DEFAULT_S = 120;
const WARMUP_S = 3; // long frames are not counted in the first seconds (bays and textures stream in)

export function createBench({ params, canvas, scene, state }) {
  const WINDOW_S = Number(params.get("benchwindow")) || WINDOW_DEFAULT_S; // a shorter window is for testing the bench itself
  const errors = [];
  const origError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(" ").slice(0, 300)); origError.apply(console, a); };
  addEventListener("error", (e) => errors.push(String(e.message).slice(0, 300)));
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason).slice(0, 300)));

  const deltas = [], settled = [], stills = new Set();
  let wantStill = null;
  let t0 = null, last = null, done = false;
  const emulated = Boolean(navigator.webdriver) || params.has("emulated");

  /** The scripted walk: a slow circle, so every heading is seen and the same place is passed again and again. */
  const input = (s) => ({ forward: 1, turn: 0.35 * (s < 0 ? 0 : 1) });

  // Stills are taken right after a frame is drawn (the drawing buffer is not kept between frames).
  function takeStill(name) {
    canvas.toBlob((blob) => { if (blob) fetch(`/__bench/still?name=${name}`, { method: "POST", body: blob }).catch(() => {}); }, "image/jpeg", 0.85);
  }

  function transfer(firstViewUntil) {
    const entries = [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")];
    let firstViewBytes = 0, totalBytes = 0, estimated = 0;
    for (const e of entries) {
      // transferSize is 0 for cached and for some cross-origin entries; the decoded size is then the best figure we have.
      const bytes = e.transferSize > 0 ? e.transferSize : (estimated += 1, e.decodedBodySize || 0);
      totalBytes += bytes;
      if (e.responseEnd <= firstViewUntil) firstViewBytes += bytes;
    }
    return { firstViewBytes, totalBytes, note: estimated ? `${estimated} entries had no transferSize; decodedBodySize used for them` : "transferSize" };
  }

  async function finish(frames) {
    done = true;
    deltas.sort((a, b) => a - b);
    const pick = (q) => deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))];
    const elapsed = (last - t0) / 1000;
    const info = scene.renderer.info, tier = scene.tier();
    const dbg = scene.renderer.getContext().getExtension("WEBGL_debug_renderer_info");
    const counted = deltas.length;
    settled.sort((a, b) => a - b);
    const report = {
      build: params.get("build") ?? "unknown",
      device: {
        ua: navigator.userAgent, renderer: dbg ? scene.renderer.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown",
        dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`, deviceMemoryGB: navigator.deviceMemory ?? null, emulated,
      },
      tier: tier.name,
      instant: new Date(state().t).toISOString(),
      windowSeconds: Math.round(elapsed),
      timeToWalkMs: Math.round(t0Walk),
      frames: counted, // frames in the window; the long-frame counts below leave out the first 3 s
      framesAfterWarmup: settled.length,
      fps: { median: +(1000 / pick(0.5)).toFixed(1), p1low: +(1000 / pick(0.99)).toFixed(1), mean: +(counted / elapsed).toFixed(1) },
      longFrames: { over33ms: settled.filter((d) => d > 33.4).length, over50ms: settled.filter((d) => d > 50).length },
      render: { draws: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries },
      transfer: transfer(t0Walk + 5000),
      memory: { jsHeapBytes: performance.memory?.usedJSHeapSize ?? null, note: "Safari exposes no GPU memory" },
      crowd: { people: state().people ?? null, ...scene.figures() }, // how many people the world shows, and how many are rigs and far figures
      governorSteps: tier.steps,
      consoleErrors: errors.slice(0, 20),
      notes: params.get("notes") ?? "",
    };
    window.__bench = report;
    await fetch("/__bench/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) }).catch(() => {});
  }

  let t0Walk = 0;
  return {
    get active() { return !done; },
    /** Called right after the frame is drawn: takes a pending still. */
    afterRender() { if (wantStill) { takeStill(wantStill); wantStill = null; } },
    /** Called every frame with the rAF timestamp, the frame count and whether the visitor has entered. Returns the walk input. */
    frame(ms, frames, entered) {
      if (done) return null;
      if (t0 === null) {
        if (!entered || frames < 1) return null;
        t0 = last = ms; t0Walk = performance.now();
        return input(0);
      }
      deltas.push(ms - last);
      const s = (ms - t0) / 1000;
      if (s >= WARMUP_S) settled.push(ms - last);
      last = ms;
      for (const [at, name] of [[1, "start"], [WINDOW_S / 2, "mid"], [WINDOW_S - 1.5, "end"]]) if (s >= at && !stills.has(name)) { stills.add(name); wantStill = name; }
      if (s >= WINDOW_S) { finish(frames); return null; }
      return input(s);
    },
  };
}

/**
 * `?alive=1` (bench.js --alive): is the courtyard actually moving? Every `every` ms, right after a frame is drawn, copy the canvas
 * and compare each region (screen rectangles from main.js: fire, smoke, cloth, sky, and a control patch of paving that must stay
 * still) with the same region at the last sample. The camera does not move, so any difference is the scene's own motion.
 * Results: `window.__alive = { samples, regions: { category: [ [mean absolute difference per pixel, 0 to 255, per sample] ... ] } }`.
 */
export function createAliveProbe({ canvas, regions, every = 500 }) {
  const copy = document.createElement("canvas"), g = copy.getContext("2d", { willReadFrequently: true });
  let last = -Infinity, rects = null, prev = null, samples = 0;
  const out = { samples: 0, rects: {}, regions: {} };
  window.__alive = out;
  return {
    afterRender(ms) {
      if (ms - last < every) return;
      last = ms;
      rects ??= regions();
      if (copy.width !== canvas.width) { copy.width = canvas.width; copy.height = canvas.height; }
      g.drawImage(canvas, 0, 0);
      const k = canvas.width / innerWidth;
      const now = {};
      for (const [cat, list] of Object.entries(rects)) {
        now[cat] = list.map((r) => g.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.width * k), Math.round(r.height * k)).data);
        out.rects[cat] = list;
      }
      if (prev) {
        for (const [cat, list] of Object.entries(now)) {
          out.regions[cat] ??= list.map(() => []);
          list.forEach((d, i) => {
            const p = prev[cat][i];
            let sum = 0;
            for (let j = 0; j < d.length; j += 4) sum += Math.abs(d[j] - p[j]) + Math.abs(d[j + 1] - p[j + 1]) + Math.abs(d[j + 2] - p[j + 2]);
            out.regions[cat][i].push(+(sum / (d.length / 4) / 3).toFixed(4));
          });
        }
        samples += 1;
        out.samples = samples;
      }
      prev = now;
    },
  };
}
