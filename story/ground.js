// The imagined land east of the Temple Mount, as a pure height function (metres; x east, z south).
// Distances are squeezed: a valley, a ridge, the long drop to the plain, Jericho, and the goats' hill beyond.
// None of this is a map; it is a stage for the flight in beat 7.

const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / r ** 2);

export const JERICHO = [1000, 40];
export const GOATS = [1350, -262];
export const RIDGE = { x: 400, top: 61 };

export function groundY(x, z) {
  const drop = sstep(520, 940, x);
  const valley = -30 * Math.exp(-(((x - 190) / 55) ** 2));
  const ridge = 62 * Math.exp(-(((x - RIDGE.x) / 120) ** 2));
  const flat = Math.max(bump(x, z, JERICHO[0], JERICHO[1], 170), bump(x, z, GOATS[0], GOATS[1], 60));
  const rough = (14 * Math.sin(x * 0.013 + z * 0.021) * Math.cos(z * 0.011 - x * 0.004) + 7 * Math.sin(x * 0.041 + 1.3) * Math.sin(z * 0.037))
    * sstep(150, 330, Math.abs(x) + Math.abs(z) * 0.6) * (1 - flat) * (0.45 + 0.55 * drop);
  const hill = 74 * bump(x, z, GOATS[0], GOATS[1], 130);
  // Around the Mount: the Tyropoeon valley to the west, then the upper city climbing; the slope falls away south.
  const mount = Math.max(0, 1 - sstep(122, 150, Math.max(Math.abs(x), Math.abs(z))));
  const tyropoeon = -26 * Math.exp(-(((x + 175) / 48) ** 2)) * (1 - sstep(300, 600, Math.abs(z)));
  const upper = 22 * sstep(-230, -480, x);
  const south = -18 * sstep(140, 420, z);
  return (-1 + valley + ridge - 96 * drop + rough + hill + tyropoeon + upper + south) * (1 - mount) + -1 * mount;
}
