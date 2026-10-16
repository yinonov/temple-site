// A festival day in the court: on the pilgrim festivals the courtyard fills with priests of every watch, who stand in
// rows about the ramp and the altar's south and east while the morning service goes on. The sources say that on the
// festivals every watch has a share in the offerings; the vendored text carries no passage for how many stood where, so the
// numbers, the rows and the hour are imagination (the title screen says so once), and this routine carries no quoted
// speech and no fact claims. It stops well short of the slaughter: nobody stands in app/content/exclusions.json's zones, the
// rows keep clear of the ramp and of the laver's lane, and no step names a forbidden pose (courtyard-festival.test.js).
//
// Cast: ninety-six priests of the festival watches (f0 to f95), all away on ordinary days. Three blocks, each facing the altar:
// the south-west of the court (east of the Sanctuary), the south-east, and the east strip north of the gate.
import { hash } from "../figure-seed.js";

export const FESTIVAL_CROWD = 96;
const FACE = [-11, -44];
// [x0, x1, z0, z1, count] in metres: kept inside the slice (courtyard.js bounds) and out of the ramp (x -16.4 to -5.7), the laver's lane and the slaughter area.
const BLOCKS = [
  [-27.2, -17.5, -33, -19, 40],
  [-4.6, 5.2, -33, -19, 28],
  [-3.6, 5.2, -56, -37, 28],
];

/** Where person `i` stands: a jittered grid in its block, the same for everyone every day (a hash of the index, no chance). */
function stand(i) {
  let k = i;
  for (const [x0, x1, z0, z1, n] of BLOCKS) {
    if (k < n) {
      const cols = Math.ceil(Math.sqrt((n * (x1 - x0)) / (z1 - z0))), rows = Math.ceil(n / cols);
      const c = k % cols, r = Math.floor(k / cols);
      const jx = (hash(7, `fx${i}`) / 4294967296 - 0.5) * 0.6, jz = (hash(7, `fz${i}`) / 4294967296 - 0.5) * 0.6;
      return [x0 + ((c + 0.5) / cols) * (x1 - x0) + jx, z0 + ((r + 0.5) / rows) * (z1 - z0) + jz];
    }
    k -= n;
  }
  throw new Error("more people than places");
}

const steps = [];
for (let i = 0; i < FESTIVAL_CROWD; i += 1) {
  const u = hash(11, `pose${i}`) / 4294967296;
  steps.push({
    who: `f${i}`, at: 0.25 * i, dur: 480, place: stand(i), enter: "eastGate", face: FACE, wander: 0.4,
    pose: u < 0.14 ? "raise" : u < 0.2 ? "bow" : "stand",
  });
}

export const COURTYARD_FESTIVAL = {
  id: "courtyard-festival",
  view: { eye: [2, -22], look: [-14, -30] }, // where a visitor arriving now is set down: the south-east corner, looking across the crowd
  anchor: { at: "sunrise", min: 45 },
  until: { at: "sunrise", min: 540 }, // through the day, until the afternoon service is near
  days: (cal) => cal.pilgrimage,
  note: "imagined-day",
  steps,
};
