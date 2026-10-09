// Chapter 1, the slice: beats 4 to 7 of "Morning in the Temple" as plain data.
// Positions are metres in the frozen layout frame (x east, y up, z south). Times are seconds.
// Every narration line is either `imagined` or carries `facts` (ids in app/content/facts.json).
// Timing, routes, poses, camera work and the guide are imagination; the title screen says so.
import { groundY, JERICHO, GOATS } from "./ground.js";

const F = 6.96; // court floor
const TOP = 11.28; // altar top
const AX = -11.04, AZ = -46.8; // the altar's centre, and the axis of the gates
const E = Math.PI / 2, W = -Math.PI / 2, S = 0; // headings: east, west, south
const JY = groundY(...JERICHO), GY = groundY(...GOATS);
const [JX, JZ] = JERICHO, [GX, GZ] = GOATS;

export const places = { F, TOP, ALTAR: [AX, TOP, AZ], LAVER: [-22.5, F, -36] };

// Camera shots: [from, to, position at start, position at end, look at start, look at end]. A new shot is a cut.
const shots = [
  [0, 8, [1.2, 8.05, -45.9], [1.9, 7.95, -45.8], [5.6, 7.8, -45.5], [5.6, 7.8, -45.5]], // Yonatan at the gate
  [8, 17, [-24, 8.5, -72.5], [-26.5, 8.3, -64], [-13.1, 9.2, -58.3], [-17, 9.6, -47.9]], // alone, by firelight
  [17, 24.5, [-1.6, 8.9, -66], [-2.6, 8.7, -66.8], [-8.6, 8.2, -74.4], [-8.6, 8.2, -74.4]], // the others wait
  [24.5, 33, [-16.2, 8.7, -37.6], [-16.8, 8.4, -37.2], [-22.3, 8.5, -36.9], [-22.3, 8.5, -36.9]], // the laver wheel
  [33, 47, [-2.4, 7.9, -21], [-4.4, 8.7, -23.6], [-11, 10, -33], [-11, 11.8, -42]], // up the ramp
  [47, 54, [-4.4, 13.8, -39.2], [-5.4, 13.4, -40.2], [-11, 12.2, -45.6], [-11, 12.2, -45.6]], // the embers
  [54, 61.5, [-5.6, 12.9, -42.4], [-4.6, 12.7, -43.2], [5.5, 8.9, -47.2], [5.5, 8.9, -47.2]], // "go out and see"
  [61.5, 70.5, [-0.4, 8.8, AZ], [1.6, 9, AZ], [60, 11.5, AZ], [60, 11.5, AZ]], // Barkai, through the gate
  [70.5, 82, [-20, 40, -74], [-16, 38, -70], [120, 0, 60], [120, 0, 60]], // the whole east
  [82, 102, [38, 32, -20], [33, 34, -25], [-29, 27, AZ], [-29, 27, AZ]], // the stones turn gold
  [102, 112, [-19.6, 9.2, -51.5], [-21.5, 9.4, -49.8], [-37, 12.5, AZ], [-37, 12.5, AZ]], // to the great gate
  [112, 121, [-22.5, 9, AZ], [-25.5, 9.6, AZ], [-38, 12.4, AZ], [-38, 12.4, AZ]], // it opens
  [121, 130, [-8, 16, -34], [10, 40, -30], [-37, 14, AZ], [-34, 20, AZ]], // pull back
];
const camera = { pos: [], look: [] };
for (const [from, to, p0, p1, l0, l1] of shots) {
  camera.pos.push([from, p0], [to - 0.01, p1]);
  camera.look.push([from, l0], [to - 0.01, l1]);
}
// Beat 7 is one long flight ("flow" keys are joined by a smooth curve), with two places to rest.
const jerichoCam = [JX - 72, JY + 2.8, JZ + 55], goatsCam = [GX - 6.6, GY + 2, GZ + 6.4];
camera.pos.push([130, [20, 44, AZ]], [133, [150, 58, -40], "flow"], [136, [390, 98, -18], "flow"], [139, [690, 30, 25], "flow"], [142, jerichoCam, "flow"],
  [168.5, [JX - 68, JY + 3, JZ + 57]], [172, [1080, -40, -40], "flow"], [175.5, [1250, -20, -190], "flow"], [178.5, goatsCam, "flow"], [196, [GX - 6, GY + 1.8, GZ + 5.8]]);
camera.look.push([130, [300, 40, -40]], [133, [520, 60, -30], "flow"], [136, [800, -30, 10], "flow"], [139, [980, -80, 40], "flow"], [142, [JX, JY + 6, JZ], "flow"],
  [168.5, [JX, JY + 6, JZ]], [172, [1300, -30, -230], "flow"], [175.5, [GX, GY + 1, GZ], "flow"], [178.5, [GX + 0.3, GY + 0.85, GZ + 0.4], "flow"], [196, [GX + 0.3, GY + 0.85, GZ + 0.4]]);

// The sounds the Mishnah lists as heard from Jericho, in its order. `t` is when each one arrives over the town.
const ripples = [
  { id: "gate", t: 138.5, he: "קול השער הגדול", en: "The great gate" },
  { id: "magrefa", t: 143, he: "המגרפה", en: "The magrefa" },
  { id: "wheel", t: 147, he: "גלגל העץ של בן קטין", en: "Ben Katin's wooden wheel" },
  { id: "herald", t: 151.5, he: "גביני הכרוז", en: "Gevini the herald" },
  { id: "flute", t: 159.5, he: "החליל", en: "The flute" },
  { id: "cymbal", t: 162, he: "הצלצל", en: "The cymbal" },
  { id: "song", t: 164.5, he: "השיר", en: "The song" },
  { id: "shofar", t: 167, he: "השופר", en: "The shofar" },
].map((r) => ({ ...r, facts: ["tamid-3-8-sounds"] }));

const waiting = [[-6.2, -74.2], [-8.1, -75.3], [-10.4, -74.6], [-12.3, -75.3], [-7.4, -72.7]];
const villagers = [[JX - 60, JZ + 41], [JX - 58, JZ + 39.4], [JX - 61.6, JZ + 38.4]];

export const chapter = {
  id: "chapter-1",
  duration: 196,
  wheelAt: 24,
  boltAt: 108.8,
  scentAt: 168.5,
  beats: [
    { id: "alone", number: 4, start: 0, end: 54, title: { he: "לבד לאור האש", en: "Alone by firelight" } },
    { id: "barkai", number: 5, start: 54, end: 102, title: { he: "ברקאי!", en: "Barkai!" } },
    { id: "gate", number: 6, start: 102, end: 130, title: { he: "השער הגדול", en: "The great gate" } },
    { id: "jericho", number: 7, start: 130, end: 196, title: { he: "נשמע ביריחו", en: "Heard in Jericho" } },
  ],
  tracks: {
    dawn: [[0, 0], [56, 0], [62, 0.14], [72, 0.36], [82, 0.52], [98, 0.8], [130, 0.92], [150, 1]], // the sky's colour
    sun: [[0, -12], [56, -10], [82, 0.6], [99, 7.6], [130, 14], [160, 22]], // degrees above the horizon
    hush: [[0, 1], [23.6, 1], [26, 0.8], [54, 0.6], [102, 0.35], [112, 0.1], [130, 0]], // 1 = near silence
    embers: [[0, 0.15], [48, 0.15], [49.5, 1], [66, 0.75]],
    gate: [[0, 0], [111.5, 0], [119, 1]],
    reach: [[0, 0], [128, 0], [136, 1]], // 0 = inside the court, 1 = the open land
    smell: [[0, 0], [168.5, 0], [179.6, 1]],
    zoom: [[0, 1.25], [7.99, 1.25], [8, 1], [178.4, 1], [178.5, 1.7], [196, 1.85]], // a longer lens on wide screens
  },
  camera,
  // What each figure looks like is the scene's business; `ground` snaps a figure to the land outside the Mount.
  cast: {
    yonatan: { look: "boy" }, father: { look: "levite", prop: "torch" },
    ashPriest: { look: "priest", prop: "pan" }, officer: { look: "officer" }, lookout: { look: "priest" }, gatePriest: { look: "priest" },
    ...Object.fromEntries(waiting.map((_, i) => [`waiting${i}`, { look: "priest" }])),
    ...Object.fromEntries(villagers.map((_, i) => [`villager${i}`, { look: "villager", ground: true }])),
  },
  // Keys: [time, position, pose once arrived, heading while standing]. Between keys a figure walks.
  actors: {
    yonatan: [[0, [5, F, -45], "peek", -1.45], [58, [5, F, -45], "peek", 1.2]],
    father: [[0, [5.4, F, -48.9], "hold", W], [58, [5.4, F, -48.9], "hold", 1.9]],
    // The priest who won the clearing of the altar. The jump at 33 happens on a cut.
    ashPriest: [[0, [-9, F, -73], "stand", S], [4, [-9, F, -73], "stand", S], [12.7, [-21, F, -58]], [21.4, [-22.5, F, -38.9], "crank", S],
      [27, [-22.5, F, -38.9], "wash", S], [31.5, [-22.5, F, -38.9], "carry", S], [32.99, [-19.4, F, -38.1], "carry"],
      [33, [-19.5, F, -20], "carry", E], [36.9, [-11, F, -23], "carry"], [45.3, [-11, TOP, -40.1], "carry"], [47.2, [-11, TOP, -44.6], "rake", -0.1],
      [104, [-11, TOP, -44.6], "stand", -0.1]],
    officer: [[0, [-5, F, -72.2], "stand", -0.5], [43, [-5, F, -72.2], "stand", -0.5], [53.6, [-1.5, F, -49.5], "stand", E], [55.4, [-1.5, F, -49.5], "point", E],
      [61, [-1.5, F, -49.5], "stand", E], [71.5, [-1.5, F, -49.5], "ask", E], [79, [-1.5, F, -49.5], "stand", E]],
    lookout: [[0, [-3.4, F, -73.6], "listen", -0.5], [24.2, [-3.4, F, -73.6], "stand", -0.5], [43.4, [-3.4, F, -73.6], "stand", -0.5], [54.9, [-0.6, F, -47.4], "stand", E],
      [57, [-0.6, F, -47.4], "stand", E], [60.2, [6, F, AZ], "stand", E], [62.4, [6, F, AZ], "raise", E], [70, [6, F, AZ], "stand", E], [72.3, [6, F, AZ], "raise", E], [80, [6, F, AZ], "stand", E]],
    // He goes in by the small wicket on the north and opens the great gate from inside.
    gatePriest: [[0, [-13.6, F, -74], "listen", -0.5], [24.2, [-13.6, F, -74], "stand", -0.5], [93.5, [-13.6, F, -74], "stand", -0.5], [101.6, [-24, F, -58]], [108, [-37.9, F, -50.5]],
      [108.3, [-37.9, F, -50.5], "stand", W], [108.31, [-40.6, F, AZ], "stand", E], [119.5, [-40.6, F, AZ], "raise", E], [123, [-40.6, F, AZ], "stand", E], [125.4, [-35.2, F, AZ], "stand", E]],
    ...Object.fromEntries(waiting.map(([x, z], i) => [`waiting${i}`, [[0, [x, F, z], "listen", -0.5 + (i % 3) * 0.12], [24.2 + i * 0.15, [x, F, z], i % 2 ? "point" : "raise", -0.5 + (i % 3) * 0.12], [28, [x, F, z], "stand", -0.5 + (i % 3) * 0.12]]])),
    ...Object.fromEntries(villagers.map(([x, z], i) => [`villager${i}`, [[0, [x, 0, z], "stand", W + (i - 1) * 0.3], [138.6 + i * 0.5, [x, 0, z], "listen", W + (i - 1) * 0.3], [152 + i * 0.4, [x, 0, z], i === 2 ? "raise" : "listen", W + (i - 1) * 0.3]]])),
  },
  cues: [
    { t: 24, id: "wheel" }, { t: 48.6, id: "embers" }, { t: 62.6, id: "call" }, { t: 72.4, id: "answer" },
    { t: 108.8, id: "bolt" }, { t: 110.3, id: "latch" }, { t: 111.5, id: "gate" },
    ...ripples.map((r, index) => ({ t: r.t, id: "ripple", sound: r.id, index })),
    { t: 181.2, id: "sneeze", goat: 0 }, { t: 183.4, id: "sneeze", goat: 1 }, { t: 185.2, id: "sneeze", goat: 3 }, { t: 187.6, id: "sneeze", goat: 2 }, { t: 190.4, id: "sneeze", goat: 0 }, { t: 192.6, id: "sneeze", goat: 3 },
  ],
  lines: [
    { t: 0.8, d: 6.9, imagined: true, he: "ששש… עוד לילה בהר הבית. אני יונתן, ואבא שלי שומר השער. בואו, אראה לכם איך הבוקר מתחיל.", en: "Shh… it's still night on the Temple Mount. I'm Yonatan, and my father keeps this gate. Come, I'll show you how the morning begins." },
    { t: 8.4, d: 8.2, facts: ["tamid-1-4-firelight"], he: "המשנה מספרת: מי שזכה לנקות את המזבח נכנס לבדו, בלי נר ביד. הוא הולך רק לאור האש שעל המזבח.", en: "The Mishnah tells: the priest who won the clearing of the altar goes in alone, no lamp in his hand. He walks by the altar's firelight." },
    { t: 17.3, d: 6.2, facts: ["tamid-1-4-wheel"], he: "עכשיו לא רואים אותו ולא שומעים אותו. כולם מחכים בשקט, כך כתוב במשנה…", en: "Now nobody sees him and nobody hears him. Everyone waits in silence, the Mishnah says…" },
    { t: 24.8, d: 8.6, facts: ["tamid-1-4-wheel"], he: "שמעתם? המשנה אומרת שזה גלגל העץ שעשה בן קטין לכיור. עכשיו כולם יודעים: הגיע הזמן!", en: "Hear that? The Mishnah says it is the wooden wheel Ben Katin made for the laver. Now they all know: it's time!" },
    { t: 36.2, d: 9.4, facts: ["tamid-1-4-climb"], he: "לפי המשנה הוא רוחץ ידיים ורגליים מן הכיור, לוקח את מחתת הכסף ועולה לראש המזבח.", en: "As the Mishnah has it, he washes hands and feet at the laver, takes the silver pan and climbs to the top of the altar." },
    { t: 47.4, d: 6.2, imagined: true, he: "תראו איך הגחלים מתעוררות! עוד רגע גם השמיים יתעוררו.", en: "Look at the embers waking up! In a moment the sky will wake up too." },
    { t: 54.8, d: 6.5, facts: ["tamid-3-2-go"], he: "במשנה, הממונה אומר: צאו וראו אם הגיע הזמן.", en: "In the Mishnah the officer says: go out and see whether the time has come." },
    { t: 62.5, d: 7.6, facts: ["tamid-3-2-barkai"], shout: { he: "בַּרְקַאי!", en: "Barkai!" }, he: "ומי שרואה עונה, כך במשנה: ״ברקאי!״ האור מבריק!", en: "And the one who sees answers, says the Mishnah: “Barkai!” The light is flashing!" },
    { t: 71, d: 10.4, facts: ["tamid-3-2-hebron"], shout: { he: "עד חברון? הֵן!", en: "As far as Hebron? Yes!" }, he: "המשנה מביאה גם את מתיא בן שמואל: האיר כל המזרח, עד חברון? והתשובה: הן!", en: "The Mishnah also gives Matya ben Shmuel: is the whole east lit, as far as Hebron? And the answer: yes!" },
    { t: 83.5, d: 10.5, imagined: true, he: "תראו את האבנים: קודם כחולות, ועכשיו זהב. הכוכבים הולכים לישון.", en: "Look at the stones: blue a moment ago, and now gold. The stars are going to bed." },
    { t: 102.8, d: 8.8, facts: ["tamid-3-7-bolt"], he: "עכשיו השער הגדול של ההיכל. המשנה מספרת: הכהן נכנס מן הפשפש, מגיע לשער הגדול מבפנים, מסיר את הנגר ואת הפותחות, ופותח.", en: "Now the great gate of the Sanctuary. The Mishnah tells: the priest goes in by the small wicket, reaches the great gate from inside, draws the bolt and the latches, and opens." },
    { t: 112.6, d: 8, facts: ["tamid-3-7-sound"], he: "איזה רעש! לפי המשנה, עבודת הבוקר מחכה עד ששומעים את קול השער הגדול נפתח.", en: "What a noise! By the Mishnah, the morning's work waits until the great gate is heard opening." },
    { t: 121.8, d: 6.6, imagined: true, he: "והקול מתגלגל רחוק רחוק… בואו נעוף אחריו!", en: "And the sound rolls far, far away… come, let's fly after it!" },
    { t: 131, d: 9, facts: ["tamid-3-8-sounds"], he: "המשנה אומרת: מיריחו היו שומעים את קול השער הגדול שנפתח. הנה יריחו, למטה בין הדקלים!", en: "The Mishnah says: from Jericho they could hear the great gate opening. There is Jericho, down among the palms!" },
    { t: 141.4, d: 8.2, facts: ["tamid-3-8-sounds"], he: "ועוד קולות מונה המשנה: המגרפה… וגלגל העץ של בן קטין…", en: "The Mishnah counts more sounds: the magrefa… and Ben Katin's wooden wheel…" },
    { t: 150.4, d: 8, facts: ["tamid-3-8-sounds", "yoma-20b-call"], he: "וגביני הכרוז! בתלמוד מסופר שקרא לכהנים, ללוויים ולישראל לעמוד כל אחד במקומו.", en: "And Gevini the herald! The Talmud tells that he called priests, Levites and Israel each to their place." },
    { t: 159, d: 9.2, facts: ["tamid-3-8-sounds"], he: "ועוד במשנה: החליל, הצלצל, השיר והשופר. הכול נשמע עד יריחו.", en: "And more in the Mishnah: the flute, the cymbal, the song and the shofar. All heard as far as Jericho." },
    { t: 169, d: 9.8, facts: ["tamid-3-8-goats"], he: "אפילו ריח הקטורת הגיע רחוק. במשנה, רבי אליעזר בן דגלאי מספר: לבית אבא היו עיזים בהר מכוור…", en: "Even the smell of the incense travelled. In the Mishnah, Rabbi Eliezer ben Diglai tells: my father's house kept goats at Har Mikhvar…" },
    { t: 179.6, d: 8.6, facts: ["tamid-3-8-goats"], he: "…והמשנה ממשיכה: הן היו מתעטשות מריח הקטורת! לבריאות, עיזים!", en: "…and, the Mishnah goes on, they would sneeze from the smell of the incense! Bless you, goats!" },
    { t: 189.4, d: 6.2, imagined: true, he: "זה היה הבוקר שלי. בפעם הבאה אראה לכם עוד.", en: "That was my morning. Next time I'll show you more." },
  ],
  // Glowing things to tap. `spans` are the shots in which each one is in view.
  hotspots: [
    { id: "fire", spans: [[8.6, 16.8], [47.3, 54], [82.4, 102]], pos: [AX, TOP + 2.4, AZ], sound: "crackle", facts: ["tamid-1-4-firelight"], he: "המערכה, האש שעל המזבח. המשנה אומרת שרק לאורה הוא הולך.", en: "The altar's fire. The Mishnah says its light is all he walks by." },
    { id: "laver", spans: [[24.8, 32.8]], pos: [-22.5, F + 2.4, -36], sound: "wheel", facts: ["tamid-1-4-wheel"], he: "הכיור, והגלגל שעשה לו בן קטין. כך במשנה. הקשיבו לחריקה!", en: "The laver, and the wheel Ben Katin made for it, as the Mishnah says. Listen to it creak!" },
    { id: "doors", spans: [[102.4, 130]], pos: [-37, F + 6.4, AZ], sound: "gate", facts: ["tamid-3-7-bolt"], he: "השער הגדול. במשנה: נגר ופותחות, ואז הוא נפתח.", en: "The great gate. In the Mishnah: a bolt and latches, and then it opens." },
    { id: "goats", spans: [[178.8, 196]], pos: [GX + 0.4, GY + 2.3, GZ + 0.3], sound: "sneeze", facts: ["tamid-3-8-goats"], he: "העיזים של הר מכוור, מן המשנה. אפצ'י!", en: "The Mishnah's goats of Har Mikhvar. Achoo!" },
  ],
  ripples,
};
