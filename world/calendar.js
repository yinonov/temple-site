// The Hebrew calendar for any instant in Jerusalem: date, weekday, Shabbat and the festivals. Arithmetic from
// Reingold and Dershowitz, "Calendrical Calculations" (fixed dates count days from 1 January of year 1, Gregorian).
// The fixed arithmetic calendar is a modern stand-in for the observed months of Temple times; facts.json says so.
import { dayKey, solarDay } from "./sky.js";

const EPOCH = -1373427; // fixed date of 1 Tishrei, year 1
const UNIX_FIXED = 719163; // fixed date of 1970-01-01
export const MONTHS = ["", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul", "Tishrei", "Cheshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar II"];
export const MONTHS_HE = ["", "ניסן", "אייר", "סיון", "תמוז", "אב", "אלול", "תשרי", "חשון", "כסלו", "טבת", "שבט", "אדר", "אדר ב׳"];

const floor = Math.floor;
const mod = (a, b) => a - b * floor(a / b);

export const isLeap = (y) => mod(7 * y + 1, 19) < 7;
const lastMonth = (y) => (isLeap(y) ? 13 : 12);

function elapsedDays(y) {
  const months = floor((235 * y - 234) / 19);
  const parts = 12084 + 13753 * months;
  const days = 29 * months + floor(parts / 25920);
  return mod(3 * (days + 1), 7) < 3 ? days + 1 : days;
}
function yearCorrection(y) {
  const a = elapsedDays(y - 1), b = elapsedDays(y), c = elapsedDays(y + 1);
  if (c - b === 356) return 2;
  if (b - a === 382) return 1;
  return 0;
}
const newYears = new Map();
export function newYear(y) {
  if (!newYears.has(y)) newYears.set(y, EPOCH + elapsedDays(y) + yearCorrection(y));
  return newYears.get(y);
}
export const daysInYear = (y) => newYear(y + 1) - newYear(y);
const longCheshvan = (y) => [355, 385].includes(daysInYear(y));
const shortKislev = (y) => [353, 383].includes(daysInYear(y));

export function daysInMonth(m, y) {
  if ([2, 4, 6, 10, 13].includes(m)) return 29;
  if (m === 12 && !isLeap(y)) return 29;
  if (m === 8 && !longCheshvan(y)) return 29;
  if (m === 9 && shortKislev(y)) return 29;
  return 30;
}

/** Fixed day number of a Hebrew date (months numbered from Nisan = 1; the year starts at Tishrei = 7). */
export function fixedFromHebrew(y, m, d) {
  let days = newYear(y) + d - 1;
  if (m < 7) {
    for (let k = 7; k <= lastMonth(y); k += 1) days += daysInMonth(k, y);
    for (let k = 1; k < m; k += 1) days += daysInMonth(k, y);
  } else for (let k = 7; k < m; k += 1) days += daysInMonth(k, y);
  return days;
}

export function hebrewFromFixed(fixed) {
  const approx = floor((fixed - EPOCH) / (35975351 / 98496)) + 1;
  let year = approx - 1;
  while (newYear(year + 1) <= fixed) year += 1;
  let month = fixed < fixedFromHebrew(year, 1, 1) ? 7 : 1;
  while (fixed > fixedFromHebrew(year, month, daysInMonth(month, year))) month += 1;
  return { year, month, day: fixed - fixedFromHebrew(year, month, 1) + 1 };
}

export const fixedFromDayKey = (key) => key + UNIX_FIXED;
export const weekday = (fixed) => mod(fixed, 7); // 0 = Sunday … 6 = Shabbat

/** Name of a month, in English or Hebrew, telling Adar of a plain year from Adar I of a leap year. */
export function monthName(m, y, lang = "en") {
  if (m === 12 && isLeap(y)) return lang === "he" ? "אדר א׳" : "Adar I";
  return (lang === "he" ? MONTHS_HE : MONTHS)[m];
}

// Festivals as kept in the Land of Israel in Temple times (one day, except Rosh Hashanah). Purim follows walled
// Jerusalem (15 Adar). Shavuot is fixed at 6 Sivan, the reckoning of the Mishnah; the Boethusians counted otherwise.
const FESTIVALS = [
  { id: "rosh-hashanah", m: 7, from: 1, to: 2, holy: true },
  { id: "yom-kippur", m: 7, from: 10, to: 10, holy: true },
  { id: "sukkot", m: 7, from: 15, to: 21, holy: [15] },
  { id: "shemini-atzeret", m: 7, from: 22, to: 22, holy: true },
  { id: "chanukah", m: 9, from: 25, to: 32 },
  { id: "purim", m: "adar-last", from: 15, to: 15 },
  { id: "pesach", m: 1, from: 15, to: 21, holy: [15, 21] },
  { id: "shavuot", m: 3, from: 6, to: 6, holy: true },
];
export const PILGRIM_FESTIVALS = new Set(["pesach", "shavuot", "sukkot", "shemini-atzeret"]);

function festivalsOn(fixed) {
  const { year, month, day } = hebrewFromFixed(fixed);
  const out = [];
  for (const f of FESTIVALS) {
    for (const y of [year, year - 1]) {
      const s = fixedFromHebrew(y, f.m === "adar-last" ? lastMonth(y) : f.m, f.from);
      const e = s + (f.to - f.from);
      if (fixed >= s && fixed <= e) {
        const n = fixed - s + 1;
        out.push({ id: f.id, day: n, holy: f.holy === true || (Array.isArray(f.holy) && f.holy.includes(f.from + n - 1)) });
        break;
      }
    }
  }
  if (day === 1 || day === 30) if (!(month === 7 && day === 1)) out.push({ id: "rosh-chodesh", day: 1, holy: false });
  return out;
}

/**
 * The calendar at an instant in Jerusalem. The Hebrew day begins at sunset; Shabbat runs from Friday sunset to
 * Saturday nightfall, and so does a holy festival day.
 */
export function calendarAt(ms) {
  const key = dayKey(ms);
  const sun = solarDay(key);
  const civil = fixedFromDayKey(key);
  const fixed = ms >= sun.sunset ? civil + 1 : civil; // the Hebrew day that is running now
  const date = hebrewFromFixed(fixed);
  const dow = weekday(fixed);
  // Between sunset and nightfall the day that is ending still counts as holy for Shabbat and festivals.
  const lingering = ms >= sun.sunset && ms < sun.nightfall ? fixed - 1 : null;
  const holyDay = (f) => weekday(f) === 6 || festivalsOn(f).some((x) => x.holy);
  const festivals = festivalsOn(fixed);
  return {
    fixed,
    ...date,
    weekday: dow,
    monthName: monthName(date.month, date.year),
    monthNameHe: monthName(date.month, date.year, "he"),
    shabbat: dow === 6 || (lingering !== null && weekday(lingering) === 6),
    festivals,
    holy: holyDay(fixed) || (lingering !== null && holyDay(lingering)),
    pilgrimage: festivals.some((f) => PILGRIM_FESTIVALS.has(f.id)),
    // The moon is new at the start of the month and full at mid-month.
    moon: (date.day - 1) / 29.53,
  };
}
