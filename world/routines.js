// The routines of an ordinary day, as data. Each routine is anchored to the sun (dawn, sunrise, sunset, nightfall,
// or a seasonal hour) and lists steps: who, where, when (minutes from the anchor), for how long, in what pose, and
// what is said aloud. Speech is either a quote (exact public-domain Hebrew with a fact id) or marked imagined.
// `view` is where a visitor who arrives while the routine runs is set down, facing it.
// Add a routine to grow the world; the engine does not change. A step marked `idle` (where people drift to afterwards)
// does not keep its routine "running", so its notes end when its work ends.
import { POSTS, PLACES } from "./places.js";
import { CAST } from "./cast.js";
import { FESTIVAL_ROUTINES } from "./festivals.js";
import { CYCLE_S, SECTION_S } from "./song.js";

// Speech. `he` is what is said; `gloss` is the translation shown under it.
const say = (he, gloss, facts) => ({ he, gloss, facts });
const imagined = (he, gloss) => ({ he, gloss, imagined: true });

const PRIESTS = CAST.filter((c) => /^p\d+$/.test(c.id)).map((c) => c.id);
const P = (from, count) => PRIESTS.slice(from, from + count);

/** The officer's rounds of the night (Middot 1:2): from post to post with torches, greeted at each. */
function rounds() {
  const stops = [];
  const loop = POSTS.map((p, i) => ({ post: p, watcher: `w${i}` }));
  let t = 0;
  for (let lap = 0; lap < 14; lap += 1) {
    for (const [k, { post, watcher }] of loop.entries()) {
      const prev = k ? loop[k - 1].post.at : loop[loop.length - 1].post.at;
      t += Math.hypot(post.at[0] - prev[0], post.at[1] - prev[1]) / 1.1 / 60 + 0.6; // walking, then a pause
      stops.push({ who: "officer", at: t, dur: 0.45, place: [post.at[0] + 1.6, post.at[1]], pose: "hold", face: post.at });
      stops.push({ who: watcher, at: t + 0.05, dur: 0.12, say: say("שלום עליך", { he: "שלום לך, איש הר הבית", en: "Peace be with you, officer of the Temple Mount" }, ["middot-1-2-rounds"]) });
    }
  }
  return stops;
}

const pesachEve = (cal) => cal.month === 1 && cal.day === 14;
// On Yom Kippur the High Priest himself tends the lamps and burns the incense (Mishnah Yoma 3:4, 7:4). That service,
// which ends beyond the curtain, is not staged; the ordinary priests' steps inside the hall are left out that day.
const notYomKippur = (cal) => !cal.festivals.some((f) => f.id === "yom-kippur");

/**
 * What Mishnah Tamid 7:3 gives the song: Ben Arza strikes the cymbal and the Levites sing; at each section of the song
 * a trumpet sounds and the people bow. `from` is when the song begins (minutes from the anchor) and `dur` how long it
 * runs; the pauses fall where the music rests (song.js). Which of us bows for "the people" is imagination.
 */
function songPauses(from, dur, bowing) {
  const steps = [{ who: "s0", at: from - 0.03, dur: 0.1, sound: "cymbal" }];
  for (let k = 0; (k * CYCLE_S + SECTION_S + 1) / 60 < dur - 0.2; k += 1) {
    const at = from + (k * CYCLE_S + SECTION_S + 0.35) / 60;
    steps.push({ who: "p13", at, dur: 0.1, sound: "blast" }, { who: bowing, at: at + 0.005, dur: 0.1, pose: "bow" });
  }
  return steps;
}

/** The lottery, the search by torchlight, the lone priest at the altar (Tamid 1:2–2:1; Yoma 2:1–2). */
function clearing(id, anchor, days, note, extra) {
  return {
    id,
    view: { eye: [-31, -74], look: [-44, -74.4] }, // where a visitor arriving now is set down
    anchor,
    days,
    note,
    steps: [
      { who: "memuneh", at: 0, dur: 5, place: [-56, -73.5], pose: "point", face: [-56, -76.2] },
      { who: "memuneh", at: 3, dur: 2, say: say("מי שטבל יבא ויפיס", { he: "מי שטבל יבוא ויטיל גורל", en: "Whoever has immersed, come and cast lots" }, ["tamid-1-2-lottery"]) },
      { who: P(0, 12), at: 6, dur: 7, place: "lotteryCircle", pose: "raise" },
      { who: P(12, 4), at: 6, dur: 60, place: "courtNorth", pose: "stand", wander: 5 },
      { who: "memuneh", at: 6, dur: 7, place: [-40.4, -72.6], pose: "ask", face: [-44, -74.4] },
      { who: "memuneh", at: 7, dur: 1.5, say: say("הצביעו", { he: "הוציאו אצבעות", en: "Hold up your fingers!" }, ["yoma-2-1-fingers"]) },
      // The search of the court by torchlight, in two groups that meet (Tamid 1:3).
      { who: P(0, 3), at: 14, dur: 9, place: "colonnadeEast", pose: "hold" },
      { who: P(3, 3), at: 14, dur: 9, place: "colonnadeWest", pose: "hold" },
      { who: P(0, 6), at: 24, dur: 4, place: [-30, -75.5], pose: "stand" },
      { who: "p0", at: 24.5, dur: 2, say: say("שלום הכל שלום", { he: "שלום, הכול בשלום", en: "Peace — all is well" }, ["tamid-1-3-search"]) },
      // The one who won goes alone to the laver; the others wait in silence until the wheel is heard (Tamid 1:4).
      { who: P(6, 6), at: 14, dur: 30, place: "priestsCourt", pose: "stand" },
      { who: "p8", at: 14, dur: 6, place: "laver", pose: "crank", sound: "wheel" },
      { who: "p9", at: 15, dur: 2, say: say("הגיע עת", { he: "הגיע הזמן", en: "The time has come" }, ["tamid-1-4-wheel"]) },
      { who: "p8", at: 20, dur: 3, place: "laver", pose: "wash" },
      { who: "p8", at: 26, dur: 16, place: "altarTop", pose: "rake", sound: "embers" },
      // His brothers see him come down and run up after him (Tamid 2:1).
      { who: P(0, 6), at: 44, dur: 30, place: "altarTop", pose: "rake" },
      ...extra,
    ],
  };
}

/** The afternoon offering in outline, `hour` being when it is offered: up the ramp, then the song and the trumpets. */
function afternoon(id, hour, days, note, pauses = false) {
  return {
    id,
    view: { eye: [4, -20], look: [-11, -44] }, // where a visitor arriving now is set down: the ramp, the altar, the singers
    anchor: { hour },
    days,
    note,
    steps: [
      { who: P(0, 4), at: -8, dur: 8, place: "rampFoot", pose: "carry" },
      { who: P(0, 4), at: 0, dur: 22, place: "altarTop", pose: "carry" },
      { who: P(4, 6), at: -8, dur: 34, place: "priestsCourt", pose: "stand", wander: 3 },
      { who: { group: "s", count: 8 }, at: -6, dur: 34, place: "levitesPlatform", pose: "stand" },
      { who: { group: "s", count: 8 }, at: 10, dur: 14, pose: "raise", sound: "song" },
      ...(pauses ? songPauses(10, 14, P(4, 6)) : []),
      { who: ["p13", "p14"], at: 6, dur: 18, place: [-5.5, -46.8], pose: "raise", face: [-11, -46.8] },
      { who: "p13", at: 8, dur: 0.3, sound: "trumpet" },
      // The incense of the afternoon, and the menorah lit for the night from its western lamp (Tamid 6:1).
      { who: "p5", at: 2, dur: 5, place: "goldenAltar", pose: "raise", days: notYomKippur },
      { who: "p3", at: 4, dur: 5, place: "menorah", pose: "reach", days: notYomKippur },
      { who: ["p3", "p5"], at: 10, dur: 240, place: "priestsCourt", pose: "stand", wander: 4, days: notYomKippur, idle: true }, // back out to the court
    ],
  };
}

export const ROUTINES = [
  {
    id: "night-watch",
    anchor: { at: "nightfall", min: -25 },
    until: { at: "sunrise", day: 1, min: 5 },
    note: "middot-1-1-watch",
    steps: [
      ...POSTS.map((p, i) => ({ who: `w${i}`, at: 0, dur: "until", place: p.at, pose: "hold", face: [0, -46.8], wander: 1.5 })),
    ],
  },
  {
    id: "officer-rounds",
    anchor: { at: "nightfall", min: 0 },
    until: { at: "dawn", day: 1, min: -100 },
    steps: rounds(),
  },
  {
    id: "priests-sleep",
    view: { eye: [-38, -73.5], look: [-56, -76.2] }, // where a visitor arriving now is set down
    anchor: { at: "nightfall", min: 0 },
    until: { at: "dawn", day: 1, min: -95 },
    note: "middot-1-8-hearth",
    steps: [{ who: P(0, 16), at: 0, dur: "until", place: "hearth", pose: "sleep" }],
  },
  // Clearing the altar (Mishnah Yoma 1:8): at cockcrow on ordinary days; on the pilgrim festivals from the first watch
  // of the night; on Yom Kippur from midnight, which, like the rest of that day's service, is not staged.
  clearing("before-dawn", { at: "dawn", min: -92 }, (cal) => !cal.pilgrimage && notYomKippur(cal), "tamid-1-2-lottery", [
    { who: "officer", at: 0, dur: 300, place: "nicanor", pose: "stand", wander: 5 },
  ]),
  { ...clearing("before-dawn-festival", { at: "nightfall", day: -1, min: 30 }, (cal) => cal.pilgrimage, "yoma-1-8-hours", [
    { who: P(0, 16), at: 76, dur: "until", place: "hearth", pose: "sleep" }, // back to sleep until the morning
  ]), until: { at: "dawn", min: -20 } },
  {
    // "Before cockcrow came, the court was full of Israel" (Yoma 1:8): on the pilgrim festivals, before dawn.
    id: "festival-crowd",
    view: { eye: [-6, -20], look: [-24, -24] }, // where a visitor arriving now is set down
    anchor: { at: "dawn", min: -120 },
    until: { at: "sunrise", min: 20 },
    days: (cal) => cal.pilgrimage,
    note: "yoma-1-8-hours",
    steps: [
      { who: { group: "g", from: 100, count: 30 }, at: 0, dur: "until", place: "crowdSouth", pose: "stand", wander: 1.2 },
      { who: { group: "g", from: 130, count: 30 }, at: 0, dur: "until", place: "crowdNorth", pose: "stand", wander: 1.2 },
    ],
  },
  {
    // Is it time? "Barkai!" (Tamid 3:2).
    id: "barkai",
    view: { eye: [-6, -42], look: [12, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "dawn", min: 18 },
    note: "tamid-3-2-barkai",
    steps: [
      { who: "memuneh", at: 0, dur: 14, place: [-1.5, -49.5], pose: "point", face: [10, -46.8] },
      { who: "memuneh", at: 0.5, dur: 2, say: say("צאו וראו אם הגיע זמן השחיטה", { he: "צאו לראות אם הגיע הזמן", en: "Go out and see whether the time has come" }, ["tamid-3-2-go"]) },
      { who: "p10", at: 0, dur: 14, place: [12.5, -46.8], pose: "raise", face: [80, -46.8] },
      { who: "p10", at: 4, dur: 2, say: say("ברקאי", { he: "האור מבריק!", en: "It's shining!" }, ["tamid-3-2-barkai"]) },
      { who: "memuneh", at: 7, dur: 2.5, say: say("האיר פני כל המזרח עד שהוא בחברון", { he: "האם האיר כל המזרח, עד חברון?", en: "Is the whole east lit, as far as Hebron?" }, ["tamid-3-2-hebron"]) },
      { who: "p10", at: 10, dur: 2, say: say("הין", { he: "כן!", en: "Yes!" }, ["tamid-3-2-hebron"]) },
    ],
  },
  {
    // The great gate (Tamid 3:7): in by the small northern door, the bolt, the latches, the doors.
    id: "great-gate",
    view: { eye: [-20, -47], look: [-37, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: -14 },
    note: "tamid-3-7-bolt",
    marks: { gateOpen: 9 },
    steps: [
      { who: "p11", at: 0, dur: 4, place: "wicket", pose: "reach" },
      { who: "p11", at: 4.2, dur: 5, place: [-40.6, -46.8], pose: "push", hidden: true },
      { who: "p11", at: 8.8, dur: 0.2, sound: "bolt" },
      { who: "p11", at: 9, dur: 0.2, sound: "gate" },
      { who: "p11", at: 9.4, dur: 10, place: "greatGate", pose: "raise" },
      // Those who won the clearing of the inner altar and of the menorah go in (Tamid 3:9).
      { who: "p2", at: 10, dur: 4, place: "goldenAltar", pose: "rake", days: notYomKippur },
      { who: "p3", at: 10, dur: 5, place: "menorah", pose: "reach", days: notYomKippur },
    ],
  },
  {
    // The morning offering in outline; the slaughter itself is never shown. The incense, the blessing from the steps
    // of the porch, and the song with trumpets and cymbal (Tamid 6–7).
    id: "morning-service",
    days: notYomKippur, // on Yom Kippur the High Priest offers (Yoma 3:4), and that is not staged
    view: { eye: [-4, -56], look: [3.4, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 5 },
    note: "tamid-7-3-trumpets",
    steps: [
      { who: P(0, 4), at: 0, dur: 70, place: "altarTop", pose: "carry" },
      { who: "p12", at: 30, dur: 12, place: "greatGate", pose: "hold" },
      { who: P(4, 8), at: 0, dur: 70, place: "priestsCourt", pose: "stand", wander: 4 },
      { who: P(12, 4), at: 0, dur: 100, place: "courtSouth", pose: "stand", wander: 5 },
      { who: "memuneh", at: 14, dur: 90, place: "priestsCourt", pose: "stand", wander: 4 },
      // Back to the menorah, leaving the western lamp burning (Tamid 6:1), and the incense on the golden altar.
      { who: "p3", at: 52, dur: 4, place: "menorah", pose: "reach", days: notYomKippur },
      { who: "p5", at: 56, dur: 6, place: "goldenAltar", pose: "raise", days: notYomKippur },
      { who: "memuneh", at: 54, dur: 9, place: [-47.6, -46.2], pose: "point", face: [-51, -46.8], days: notYomKippur },
      { who: "memuneh", at: 57.5, dur: 1.5, say: say("הקטר", { he: "הקטר!", en: "Burn the incense!" }, ["tamid-6-3-incense"]), days: notYomKippur },
      { who: "memuneh", at: 64, dur: 40, place: "priestsCourt", pose: "stand", wander: 4 }, // back out to the court
      { who: P(0, 8), at: 72, dur: 6, place: "ulamSteps", pose: "raise", note: "tamid-7-2-blessing" },
      { who: ["p13", "p14"], at: 80, dur: 22, place: [-5.5, -46.8], pose: "raise", face: [-11, -46.8] },
      { who: "p13", at: 82, dur: 0.3, sound: "trumpet", say: say("תקעו והריעו ותקעו", { he: "תקיעה, תרועה, תקיעה", en: "A long blast, a trill, a long blast" }, ["tamid-7-3-trumpets"]) },
      { who: { group: "s", count: 8 }, at: 70, dur: 34, place: "levitesPlatform", pose: "stand" },
      { who: { group: "s", count: 8 }, at: 84, dur: 18, pose: "raise", sound: "song" },
      ...songPauses(84, 18, P(12, 4)),
    ],
  },
  {
    // Through the day the priests are about the court (imagined): the altar, the laver, the court.
    id: "day-duty",
    view: { eye: [4, -58], look: [-20, -46.8] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 108 },
    until: { at: "nightfall", min: 0 }, // cut short by the evening and the night watch
    note: "imagined-day",
    steps: [
      { who: P(0, 3), at: 0, dur: "until", place: "altarTop", pose: "carry", wander: 2 },
      { who: P(3, 3), at: 0, dur: "until", place: "priestsCourt", pose: "stand", wander: 6 },
      { who: P(6, 3), at: 0, dur: "until", place: "courtSouth", pose: "stand", wander: 8 },
      { who: P(9, 4), at: 0, dur: "until", place: "courtNorth", pose: "stand", wander: 8 },
      { who: P(13, 3), at: 0, dur: "until", place: "laver", pose: "wash", wander: 2 },
      { who: "memuneh", at: 0, dur: "until", place: "nicanor", pose: "stand", wander: 4 },
      { who: "officer", at: 0, dur: "until", place: "womensGate", pose: "stand", wander: 6 },
      // Levite gatekeepers by day (imagined): the gates of the Mount and of the courts.
      ...["eastGate", "huldahWest", "huldahEast", "kiponus", "taddi", "womensGate", "nicanor"].map((g, i) => ({ who: `w${i}`, at: 0, dur: "until", place: [PLACES[g].at[0] + (i % 2 ? 2.2 : -2.2), PLACES[g].at[1] + 1.8], pose: "hold", face: PLACES[g].face, wander: 1.5 })),
    ],
  },
  // The afternoon offering (Mishnah Pesachim 5:1): offered at nine and a half seasonal hours; on the eve of Pesach an
  // hour earlier, and earlier still when the eve falls on a Friday. The slaughter an hour before is never shown.
  afternoon("afternoon-service", 9.5, (cal) => !pesachEve(cal) && notYomKippur(cal), "pesachim-5-1-tamid", true),
  afternoon("afternoon-pesach-eve", 8.5, (cal) => pesachEve(cal) && cal.weekday !== 5, "pesachim-5-1-eve"),
  afternoon("afternoon-pesach-eve-friday", 7.5, (cal) => pesachEve(cal) && cal.weekday === 5, "pesachim-5-1-eve"),
  {
    // Evening: the great gate is shut, and the priests go to the Chamber of the Hearth (Middot 1:8–9).
    id: "evening",
    view: { eye: [-38, -73.5], look: [-56, -76.2] }, // where a visitor arriving now is set down
    anchor: { at: "sunset", min: -30 },
    note: "middot-1-9-keys",
    marks: { gateClose: 6 },
    steps: [
      { who: "p11", at: 0, dur: 8, place: "greatGate", pose: "push" },
      { who: "p11", at: 6, dur: 0.2, sound: "gate" },
      { who: P(0, 16), at: 14, dur: 45, place: "hearth", pose: "stand", wander: 2 },
      { who: "memuneh", at: 40, dur: 14, place: [-56, -73.5], pose: "hold", face: [-56, -76.2] },
      { who: "officer", at: 0, dur: 40, place: "nicanor", pose: "stand", wander: 5 },
      { who: "memuneh", at: 46, dur: 2, say: imagined("הגיע זמן הנעילה", { he: "הגיע זמן לנעול", en: "It is time to lock up" }) },
    ],
  },
  {
    // Pilgrims (imagined): they come in by the gates of the Mount, cross to the women's court or the outer court,
    // linger, and leave. More come on Shabbat, and many more on the pilgrim festivals.
    id: "pilgrims",
    anchor: { at: "sunrise", min: 40 },
    note: "imagined-pilgrims",
    pilgrims: true,
    steps: [],
  },
  {
    // The bread of the table is changed on Shabbat (Menachot 11:7): four go ahead to take the old away, four bring the
    // new in, setting it first on the marble table in the porch; the old goes out by the golden one. The hour is ours.
    id: "shabbat-bread",
    view: { eye: [-44, -46.8], look: [-52.2, -49.6] }, // where a visitor arriving now is set down
    anchor: { at: "sunrise", min: 125 },
    days: (cal) => cal.weekday === 6,
    note: "menachot-11-7-shabbat",
    steps: [
      { who: P(4, 4), at: 0, dur: 4, place: "porchTables", pose: "carry" },
      { who: P(8, 4), at: 2, dur: 7, place: "tableSouth", pose: "reach" },
      { who: P(4, 4), at: 5, dur: 6, place: "tableNorth", pose: "carry" },
      { who: P(8, 4), at: 10, dur: 5, place: "porchTables", pose: "carry" },
      { who: P(4, 8), at: 16, dur: 300, place: "courtNorth", pose: "stand", wander: 6, idle: true }, // back out to the court
    ],
  },
  {
    // On Shabbat the priestly watch changes (Tamid 5:1 mentions the blessing for the departing watch). The incoming
    // priests arrive in the afternoon; the timing is imagined.
    id: "shabbat-watch",
    view: { eye: [-4, -21], look: [-24, -18.5] }, // where a visitor arriving now is set down
    anchor: { hour: 7 },
    days: (cal) => cal.weekday === 6,
    note: "tamid-5-1-watch",
    steps: [
      { who: { group: "q", count: 8 }, at: 0, dur: 240, place: "courtSouth", pose: "stand", wander: 4 },
    ],
  },
  ...FESTIVAL_ROUTINES,
];
