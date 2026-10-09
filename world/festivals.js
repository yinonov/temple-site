// The festivals, as routines: what is different on the Mount on their days. Sourced steps carry fact ids through
// their notes and speech; hours, routes and crowds are imagined. A festival's Hebrew day runs from sunset to sunset,
// so day-long markers are anchored at the sunset before.
import { CAST } from "./cast.js";

const say = (he, gloss, facts) => ({ he, gloss, facts });
const PRIESTS = CAST.filter((c) => /^p\d+$/.test(c.id)).map((c) => c.id);
const P = (from, count) => PRIESTS.slice(from, from + count);
const has = (cal, id) => cal.festivals.find((f) => f.id === id);
const WALK = 1.15 * 60; // metres a minute

/** A festival's whole Hebrew day, from the sunset before to sunset: a marker its notes can hang on. */
const wholeDay = (id, festival) => ({ id, anchor: { at: "sunset", day: -1 }, until: { at: "sunset" }, days: (cal) => Boolean(has(cal, festival)), steps: [] });

// Around the altar and its ramp, keeping clear of the laver (Mishnah Sukkah 4:5 says only "they went round").
const LOOP = [[-1, -57], [-20.3, -57], [-20.3, -20.5], [-1, -20.5]];
function circuits(laps) {
  const steps = [], walkers = P(0, 10);
  let t = 0;
  for (let lap = 0; lap < laps; lap += 1) for (let c = 0; c < LOOP.length; c += 1) {
    const [x, z] = LOOP[c], [px, pz] = LOOP[(c + LOOP.length - 1) % LOOP.length];
    t += lap === 0 && c === 0 ? 0 : Math.hypot(x - px, z - pz) / WALK;
    walkers.forEach((who, i) => steps.push({ who, at: t + i * 0.025, dur: 0.01, place: [x, z], pose: "hold" }));
  }
  return { steps, end: t + Math.hypot(LOOP[0][0] - LOOP[3][0], LOOP[0][1] - LOOP[3][1]) / WALK };
}
function sukkotCircuit(id, laps, days) {
  const { steps, end } = circuits(laps);
  return {
    id,
    view: { eye: [3, -26], look: [-11, -40] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 135 },
    days,
    note: "sukkah-4-5-circuit",
    steps: [
      ...steps,
      ...(laps === 7 ? [{ who: "p0", at: end, dur: 0.15, say: say("יופי לך מזבח", { he: "יופי לך, מזבח!", en: "Beauty is yours, O altar!" }, ["sukkah-4-5-farewell"]) }] : []),
      { who: P(0, 10), at: end + 0.5, dur: 240, place: "priestsCourt", pose: "stand", wander: 5 }, // back to the day's work
    ],
  };
}
const sukkotDay = (cal) => has(cal, "sukkot") && cal.weekday !== 6;

// The nights of the water-drawing: those that begin Hebrew days 16–21 Tishrei, except a night of Shabbat
// (Mishnah Sukkah 5:1: five or six). Anchored after nightfall, so the evening's overlap never decides it.
const waterDrawingNight = (cal) => cal.month === 7 && cal.day >= 16 && cal.day <= 21 && cal.weekday !== 6;

export const FESTIVAL_ROUTINES = [
  // Sukkot: the willows stand at the altar all seven days (shown by the scene), the circuit each day and seven times
  // on the seventh, the water poured in the morning, and the nights of the water-drawing.
  sukkotCircuit("sukkot-circuit", 1, (cal) => sukkotDay(cal) && has(cal, "sukkot").day < 7),
  sukkotCircuit("sukkot-seven-circuits", 7, (cal) => sukkotDay(cal) && has(cal, "sukkot").day === 7),
  {
    id: "water-libation",
    view: { eye: [-26, -18.8], look: [-11, -30] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 60 },
    days: (cal) => Boolean(has(cal, "sukkot")),
    note: "sukkah-4-9-libation",
    steps: [
      { who: "p6", at: 0, dur: 1.5, place: "waterGate", pose: "carry" },
      { who: ["p13", "p14"], at: 0, dur: 2, place: "waterGateTrumpets", pose: "raise" },
      { who: "p13", at: 0.6, dur: 0.3, sound: "trumpet" },
      { who: "p6", at: 3, dur: 2, place: "rampFoot", pose: "carry" },
      { who: "p6", at: 6, dur: 4, place: "altarTop", pose: "carry" },
      { who: "p7", at: 2, dur: 8, place: [-6.5, -24], pose: "point", face: [-11, -38] },
      { who: "p7", at: 6.5, dur: 1.5, say: say("הגבה ידך", { he: "הרם את ידך!", en: "Raise your hand!" }, ["sukkah-4-9-libation"]) },
      { who: ["p6", "p7", "p13", "p14"], at: 11, dur: 240, place: "priestsCourt", pose: "stand", wander: 4 }, // back to the court
    ],
  },
  {
    id: "water-drawing",
    view: { eye: [30, -58], look: [40, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "nightfall", min: 20 },
    until: { at: "dawn", day: 1, min: -30 },
    days: waterDrawingNight,
    note: "sukkah-5-2-lamps",
    steps: [
      // Four young priests climb the ladders and pour the oil.
      ...["q0", "q1", "q2", "q3"].map((who, i) => ({ who, at: 0, dur: 9, place: `lampStand${i}`, pose: "reach" })),
      ...["q0", "q1", "q2", "q3"].map((who) => ({ who, at: 10, dur: "until", place: "womensCourt", pose: "stand", wander: 6 })),
      // The Levites on the fifteen steps, with instruments beyond number; the pious dance with torches below.
      { who: { group: "s", count: 8 }, at: 2, dur: "until", place: "fifteenSteps", pose: "raise" },
      ...Array.from({ length: 30 }, (_, k) => ({ who: "s0", at: 6 + k * 14, dur: 0.3, sound: k % 3 === 1 ? "flute" : k % 3 === 2 ? "cymbal" : "song" })),
      { who: { group: "g", count: 24 }, at: 4, dur: "until", place: "womensCourt", pose: "raise", wander: 7 },
    ],
  },
  {
    // At cockcrow two priests sound the trumpets down the steps and across the court to its east gate, then turn west.
    id: "water-drawing-dawn",
    view: { eye: [50, -40], look: [69.5, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "dawn", min: -32 },
    days: waterDrawingNight,
    note: "sukkah-5-4-faces",
    steps: [
      { who: ["q4", "q5"], at: 0, dur: 2, place: "upperGate", pose: "raise" },
      { who: "q4", at: 0.5, dur: 0.3, sound: "trumpet" },
      { who: ["q4", "q5"], at: 2.2, dur: 1, place: [9.4, -46.8], pose: "raise" },
      { who: "q4", at: 2.5, dur: 0.3, sound: "trumpet" },
      { who: ["q4", "q5"], at: 3.6, dur: 1, place: [13, -46.8], pose: "raise" },
      { who: "q4", at: 3.9, dur: 0.3, sound: "trumpet" },
      { who: ["q4", "q5"], at: 5, dur: 4, place: "womensGateInside", pose: "stand", face: [0, -46.8] },
      { who: "q5", at: 6, dur: 2, say: say("אבותינו שהיו במקום הזה אחוריהם אל היכל ופניהם קדמה", { he: "אבותינו שעמדו במקום הזה — גבם אל ההיכל ופניהם מזרחה", en: "Our fathers who stood in this place had their backs to the Sanctuary and their faces to the east" }, ["sukkah-5-4-faces"]) },
    ],
  },
  // Rosh Hashanah: the shofar with its mouth of gold, between two trumpets.
  {
    id: "rosh-hashanah-shofar",
    view: { eye: [5.5, -34], look: [0, -47.5] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 112 },
    days: (cal) => Boolean(has(cal, "rosh-hashanah")),
    note: "rosh-hashanah-3-3-shofar",
    steps: [
      { who: "p12", at: 0, dur: 9, place: [0, -47.5], pose: "raise", face: [-11, -46.8] },
      { who: "p13", at: 0, dur: 9, place: [0, -49], pose: "raise", face: [-11, -46.8] },
      { who: "p14", at: 0, dur: 9, place: [0, -46], pose: "raise", face: [-11, -46.8] },
      ...[1, 3.5, 6].flatMap((at) => [{ who: "p12", at, dur: 0.3, sound: "shofar" }, { who: "p13", at: at + 0.05, dur: 0.2, sound: "trumpet" }]),
      { who: ["p12", "p13", "p14"], at: 10, dur: 240, place: "priestsCourt", pose: "stand", wander: 4 }, // back to the court
    ],
  },
  // Shavuot: the first fruits come up with the ox before them and the flute playing, baskets on shoulders.
  {
    id: "first-fruits",
    view: { eye: [-12, 60], look: [-30.6, 100] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 150 },
    days: (cal) => Boolean(has(cal, "shavuot")),
    note: "bikkurim-3-3-ox",
    steps: [
      { who: "ox", at: 0, dur: 30, place: [-24, 66], pose: "stand", enter: "huldahWest" },
      { who: { group: "b", count: 16 }, at: 0.6, dur: 6, place: "outerSouth", pose: "carry", enter: "huldahWest" },
      ...[1, 3, 5].map((at) => ({ who: "b0", at, dur: 0.3, sound: "flute" })),
      { who: { group: "b", count: 16 }, at: 12, dur: 6, place: "womensCourt", pose: "carry" },
      { who: { group: "b", count: 16 }, at: 22, dur: 8, place: "firstFruits", pose: "carry" },
      { who: { group: "s", count: 8 }, at: 20, dur: 14, place: "levitesPlatform", pose: "stand" },
      { who: { group: "s", count: 8 }, at: 24, dur: 8, pose: "raise", sound: "song" },
    ],
  },
  // Days that are marked by a note and a fuller Mount (see schedule.js), and on Chanukah lamps at night.
  wholeDay("sukkot-day", "sukkot"),
  wholeDay("yom-kippur-day", "yom-kippur"),
  wholeDay("chanukah-day", "chanukah"),
  wholeDay("purim-day", "purim"),
  wholeDay("rosh-chodesh-day", "rosh-chodesh"),
];
