// The courtyard's dawn work, as data: before the morning service, while the priests of the lottery go about the altar,
// others bring wood up the ramp, sweep the ash from the court, and trim the lamp stands by the gate and the Ulam. The
// sources name the lottery, the laver, the ash and the menorah (staged by `clearing` in routines.js); who carries wood,
// who sweeps and who trims the courtyard's lamps is imagination (the title screen says so), so this routine carries no
// quoted speech and no fact claims. It is staged on the ash, wood and lamp work and stops short of the slaughter: no
// step names a place or a pose in app/content/exclusions.json (courtyard-dawn.test.js holds it to that).
//
// Cast: six of the incoming watch (q0-q5) carry wood and sweep; four Levites (s0-s3) trim the lamp stands; four more (s4-s7)
// sweep the south of the court. Fourteen figures in all, none of the lottery's.
export const COURTYARD_DAWN = {
  id: "courtyard-dawn",
  view: { eye: [2, -24], look: [-11, -40] }, // where a visitor arriving now is set down: the ramp and the work about it
  anchor: { at: "dawn", min: 12 },
  until: { at: "sunrise", min: 4 },
  note: "imagined-day",
  steps: [
    // Wood for the altar, up the ramp: three carry, three wait and then follow.
    { who: ["q0", "q1", "q2"], at: 0, dur: 6, place: [-4.8, -28.4], pose: "carry", enter: "eastGate" },
    { who: ["q0", "q1", "q2"], at: 7, dur: 9, place: "altarTop", pose: "carry" },
    { who: ["q0", "q1", "q2"], at: 17, dur: 12, place: [-4.8, -28.4], pose: "stand" },
    { who: ["q3", "q4", "q5"], at: 0, dur: 14, place: [-17.6, -28.2], pose: "rake", enter: "eastGate" },
    { who: ["q3", "q4", "q5"], at: 15, dur: 5, place: [-5.6, -30.6], pose: "carry" },
    { who: ["q3", "q4", "q5"], at: 21, dur: 12, place: "altarTop", pose: "carry" },
    // The lamp stands: one Levite to each, trimming.
    { who: "s0", at: 1, dur: 16, place: [2.4, -54.0], pose: "trim", face: [3.6, -54.0] },
    { who: "s1", at: 1, dur: 16, place: [2.4, -39.6], pose: "trim", face: [3.6, -39.6] },
    { who: "s2", at: 1, dur: 16, place: [-26.2, -60.0], pose: "trim", face: [-27.4, -60.0] },
    { who: "s3", at: 1, dur: 16, place: [-26.2, -33.6], pose: "trim", face: [-27.4, -33.6] },
    { who: ["s0", "s1", "s2", "s3"], at: 18, dur: 30, place: "levitesPlatform", pose: "stand", wander: 1.5 },
    // Sweeping the south of the court, then standing back as the service begins.
    { who: ["s4", "s5"], at: 0, dur: 14, place: [-7.4, -19.8], pose: "rake", enter: "eastGate" },
    { who: ["s6", "s7"], at: 0, dur: 14, place: [-14.8, -19.4], pose: "rake", enter: "eastGate" },
    { who: ["s4", "s5", "s6", "s7"], at: 15, dur: 30, place: "levitesPlatform", pose: "stand", wander: 1.5 },
  ],
};
