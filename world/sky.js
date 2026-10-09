// The sky over the Temple Mount for any instant: the sun's position and the day's solar events, computed for
// Jerusalem (31.778 N, 35.235 E, sea-level horizon) with the NOAA solar equations. Temple time is reckoned by the
// sun, so the wall clock, time zones and daylight saving never enter.

export const JERUSALEM = { lat: 31.778, lon: 35.235 };
const RAD = Math.PI / 180;
const DAY_MS = 86400000;

/** Angles below the horizon that mark the day's events (degrees of solar altitude). */
export const EVENTS = {
  dawn: -16.1, // first light (alot hashachar), the reckoning recorded in facts.json
  sunrise: -0.833, // upper limb at the horizon, with refraction
  sunset: -0.833,
  nightfall: -7.083, // three stars (tzeit), as Hebcal's tzeit7083deg
};

function julianCentury(ms) {
  return (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
}

/** Sun's declination (radians) and the equation of time (minutes) at an instant. */
function solar(ms) {
  const T = julianCentury(ms);
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eot };
}

/** The sun's altitude and azimuth (degrees; azimuth clockwise from north) over Jerusalem at an instant. */
export function sunPosition(ms, { lat, lon } = JERUSALEM) {
  const { decl, eot } = solar(ms);
  const utcMinutes = ((ms % DAY_MS) + DAY_MS) % DAY_MS / 60000;
  const trueSolar = (((utcMinutes + eot + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolar / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZenith = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const altitude = 90 - zenith / RAD;
  const az = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180;
  return { altitude, azimuth: (az + 360) % 360 };
}

/** The local solar day containing an instant, as an integer key (days since 1970 at Jerusalem's mean solar time). */
export function dayKey(ms, { lon } = JERUSALEM) {
  return Math.floor((ms + (lon / 15) * 3600000) / DAY_MS);
}
/** Instant of local mean midnight that starts a day key. */
export const dayStart = (key, { lon } = JERUSALEM) => key * DAY_MS - (lon / 15) * 3600000;

/** Solar noon (ms) of a day key. */
function solarNoon(key, place = JERUSALEM) {
  let noon = dayStart(key, place) + DAY_MS / 2;
  for (let i = 0; i < 2; i += 1) noon = dayStart(key, place) + DAY_MS / 2 - solar(noon).eot * 60000;
  return noon;
}

/** The instant the sun crosses `angle` on the rising (dir −1) or setting (dir +1) side of a day's noon. */
function crossing(key, angle, dir, place = JERUSALEM) {
  const noon = solarNoon(key, place);
  let t = noon;
  for (let i = 0; i < 4; i += 1) {
    const { decl } = solar(t);
    const phi = place.lat * RAD;
    const cosH = (Math.sin(angle * RAD) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
    const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD; // degrees
    t = noon + dir * H * 4 * 60000;
  }
  return t;
}

const days = new Map();
/** The solar events of a day (instants in ms) and the length of its seasonal hours. Cached per day. */
export function solarDay(key, place = JERUSALEM) {
  const id = `${key}:${place.lat}:${place.lon}`;
  if (days.has(id)) return days.get(id);
  const day = {
    key,
    noon: solarNoon(key, place),
    dawn: crossing(key, EVENTS.dawn, -1, place),
    sunrise: crossing(key, EVENTS.sunrise, -1, place),
    sunset: crossing(key, EVENTS.sunset, 1, place),
    nightfall: crossing(key, EVENTS.nightfall, 1, place),
  };
  day.hour = (day.sunset - day.sunrise) / 12; // a seasonal hour of the day, sunrise to sunset
  if (days.size > 64) days.clear();
  days.set(id, day);
  return day;
}

/**
 * Where an instant falls in Temple time: the seasonal hour of the day (0 at sunrise, 12 at sunset), or of the night
 * (0 at sunset, 12 at the next sunrise), and which third of the night (the watches) it is.
 */
export function seasonalTime(ms) {
  const key = dayKey(ms);
  const today = solarDay(key);
  if (ms >= today.sunrise && ms < today.sunset) return { part: "day", hour: (ms - today.sunrise) / today.hour, day: today };
  const [from, to] = ms < today.sunrise ? [solarDay(key - 1).sunset, today.sunrise] : [today.sunset, solarDay(key + 1).sunrise];
  const hour = ((ms - from) / (to - from)) * 12;
  return { part: "night", hour, watch: Math.min(3, Math.floor(hour / 4) + 1), day: today };
}

/** The instant of seasonal hour `h` of a day (sunrise + h hours). */
export const atHour = (day, h) => day.sunrise + h * day.hour;
