// The air and light of the Mount as a pure function of the sun's height: fog colour and density (thinning with height and
// warming toward the sun when it is low), the colour and strength of sun, sky fill and image light, the exposure, and the
// grade the stone gets (warm in the shade, cool in the light). Nothing here reads a clock or keeps state: the same instant
// gives the same air for every visitor. Colours are linear RGB triples; the scene turns them into three.js colours.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** "#rrggbb" to linear RGB. */
export const rgb = (hex) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

const HORIZON = { night: rgb("#10183c"), dawn: rgb("#f0c6a2"), day: rgb("#d6e4f2") };
const HEMI = { night: rgb("#3c4fae"), blush: rgb("#d9a9bd"), day: rgb("#e6ebf6"), groundNight: rgb("#14122c"), groundDay: rgb("#c9a777") };
const SUN = { low: rgb("#ff8a4a"), high: rgb("#fff0d2") };
const SHADE = rgb("#ffe9c9"), LIGHT = rgb("#e4f0ff"); // what shade and light are pulled toward (warm, cool)

/** How quickly the haze thins with height above the paving, per metre. The courtyard sits in the thick of it, the wall tops above it. */
export const HAZE_FALLOFF = 0.045;

/**
 * `{ dawn, sun }`: `dawn` 0 (night) to 1 (full day) and `sun` the sun's altitude in degrees (world.env). Returns
 * `{ fog, hemi, sun, exposure, envIntensity, haze, grade }`.
 */
export function atmosphereAt({ dawn, sun: sunDeg }) {
  const day = sstep(0.1, 0.9, dawn);
  const blush = sstep(0.08, 0.45, dawn) * (1 - sstep(0.55, 1, dawn));
  const lit = sstep(0.2, 2.4, sunDeg);
  const low = lit * (1 - sstep(4, 30, sunDeg)); // the sun is up but low: long warm light, the thickest haze toward it

  const fogColor = mix(mix(HORIZON.night, HORIZON.dawn, sstep(0.05, 0.85, dawn)), HORIZON.day, sstep(0.8, 1, dawn) * 0.6);
  return {
    fog: { color: fogColor, density: lerp(0.0042, 0.0016, dawn) * (1 + 0.45 * low) },
    hemi: {
      color: mix(mix(HEMI.night, HEMI.blush, blush * 0.7), HEMI.day, day * day),
      ground: mix(HEMI.groundNight, HEMI.groundDay, day),
      intensity: (lerp(1.05, 1.5, day) + blush * 0.7) * 0.35, // the environment map carries most of the ambient light
    },
    sun: { color: mix(SUN.low, SUN.high, sstep(2, 20, sunDeg)), intensity: lit * lerp(3.4, 2.5, sstep(4, 20, sunDeg)), lit },
    exposure: lerp(1.05, 0.92, day),
    envIntensity: lerp(0.9, 0.52, day),
    // Aerial haze: warmed toward the sun's colour in the direction of the sun, strongest when the sun is low.
    haze: { toward: mix(mix(SUN.low, [1, 0.78, 0.5].map((v) => toLinear(v)), 0.5), fogColor, 0.15), strength: 0.75 * low, falloff: HAZE_FALLOFF },
    // Stone grade: shade is pulled warm and light cool, most at low sun, softly at noon, not at all at night.
    grade: { shade: SHADE, light: LIGHT, amount: 0.5 * sstep(-2, 6, sunDeg) * (1 - 0.5 * sstep(20, 60, sunDeg)) },
  };
}
