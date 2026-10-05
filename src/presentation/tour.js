// Guided tour model (TASK-6-47). Pure and Node-testable: no DOM, no I/O.
// The stops are the published events of the tour's sequences in sequence order (steps), then by step span.
// Every historical string (titles, notes, names) is copied from data records; chrome text lives in strings.he.js.
import { format } from "./strings.he.js";

const he = (text) => (text && typeof text === "object" ? text.he ?? null : typeof text === "string" ? text : null);

// ---- Locators: "משנה תמיד ד, ג" -> { tractate, chapter: 4, mishnah: 3 } (TASK-6-77) ----
const LETTER_VALUES = Object.freeze(Object.fromEntries([..."אבגדהוזחטיכלמנסעפצקרשת"].map((letter, i) => [letter, i < 9 ? i + 1 : i < 18 ? (i - 8) * 10 : (i - 17) * 100])));
/** Hebrew numeral ("ד", "יא", "ט״ו") -> number, or null. */
export function hebrewNumeral(text) {
  const letters = [...String(text ?? "").replace(/["'׳״]/g, "")];
  if (!letters.length || letters.some((letter) => !(letter in LETTER_VALUES))) return null;
  return letters.reduce((sum, letter) => sum + LETTER_VALUES[letter], 0);
}
/** number -> Hebrew numeral without quote marks (15 and 16 follow the usual ט״ו, ט״ז). */
export function toHebrewNumeral(n) {
  let rest = Math.trunc(Number(n));
  if (!(rest > 0)) return "";
  if (rest === 15) return "טו";
  if (rest === 16) return "טז";
  let out = "";
  for (const [value, letter] of [[400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"], [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"], [9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"]]) {
    while (rest >= value) { out += letter; rest -= value; }
  }
  return out;
}
/** Parse a locator display such as "משנה תמיד ד, ג" (a trailing range is ignored). Null when it has no chapter, mishnah pair. */
export function parseLocator(display) {
  const match = /^(.*?)\s*([א-ת"'׳״]{1,4}),\s*([א-ת"'׳״]{1,4})(?:\s*[–\-—].*)?$/u.exec(String(display ?? "").trim());
  if (!match) return null;
  const chapter = hebrewNumeral(match[2]);
  const mishnah = hebrewNumeral(match[3]);
  if (!chapter || !mishnah) return null;
  return { tractate: match[1].trim() || null, chapter, mishnah, chapterLabel: toHebrewNumeral(chapter), mishnahLabel: toHebrewNumeral(mishnah) };
}

/**
 * The tour's sequences in chain order. A later sequence's orderNote names the one it continues ("הרצף ממשיך את „<name>”");
 * the chain is read from those names, so nothing here lists sequence ids. Sequences with no recorded predecessor are roots
 * (several roots keep file order); anything left over (a cycle) is appended in file order.
 */
export function orderSequences(sequences) {
  const byName = new Map(sequences.map((sequence) => [he(sequence.name), sequence]));
  const previousOf = new Map();
  for (const sequence of sequences) {
    const match = /ממשיך את\s*[„"]([^”"]+)[”"]/u.exec(he(sequence.orderNote) ?? "");
    const previous = match ? byName.get(match[1].trim()) : null;
    if (previous && previous !== sequence) previousOf.set(sequence.id, previous);
  }
  const next = new Map();
  for (const sequence of sequences) {
    const previous = previousOf.get(sequence.id);
    if (previous) next.set(previous.id, [...(next.get(previous.id) ?? []), sequence]);
  }
  const ordered = [];
  const seen = new Set();
  const visit = (sequence) => {
    if (seen.has(sequence.id)) return;
    seen.add(sequence.id);
    ordered.push(sequence);
    for (const child of next.get(sequence.id) ?? []) visit(child);
  };
  for (const sequence of sequences) if (!previousOf.has(sequence.id)) visit(sequence);
  for (const sequence of sequences) visit(sequence);
  return ordered;
}

/**
 * Conditional steps (TASK-6-77). The data has no structured field for this: the event title says "(מותנה)" and the
 * applicability note opens "הפעולה מותנית" (whole step) or "חלק מהאירוע מותנה" / "הנוסח ... מותנה" (part of it). Read
 * from those words only. kind: "shabbat" (the title says בשבת), "highPriest" (title or note names the high priest), else "other".
 * @returns {{ kind: "shabbat"|"highPriest"|"other", partial: boolean } | null}
 */
export function conditionalOf(event) {
  const title = he(event?.title) ?? "";
  const note = he(event?.applicability?.note) ?? "";
  const whole = /מותנה/u.test(title) || /^הפעולה מותנית/u.test(note);
  const partial = !whole && (/^חלק מהאירוע מותנה/u.test(note) || /^הנוסח[^.]*מותנה/u.test(note));
  if (!whole && !partial) return null;
  const kind = /בשבת/u.test(title) ? "shabbat" : /כהן (?:ה)?גדול/u.test(`${title} ${note}`) ? "highPriest" : "other";
  return { kind, partial };
}

const HIGH_PRIEST_ROLE = "role-kohen-gadol";
const HP_NAME = /כהן (?:ה)?גדול/u;
/**
 * T-02 (TASK-6-79a). No structured applicability field exists, so this reads the same record the visitor sees: an event whose
 * participants include the High Priest, or whose applicability note names him as the one in whose participation the Mishnah
 * describes the act ("מתארת אותה רק לגבי המקרה שבו הכהן הגדול משתתף", "כשהכהן הגדול הוא הנותן", "אינה אומרת אם הוא נעשה גם בלעדיו").
 * kind "highPriestDescribed" = described with him, the record does not say whether it happens without him; "highPriest" = he
 * takes part. Used only when the event is not already conditional (conditionalOf).
 * @returns {{ kind: "highPriest"|"highPriestDescribed", partial: boolean } | null}
 */
export function highPriestOf(event) {
  const note = he(event?.applicability?.note) ?? "";
  const participates = (event?.participants ?? []).some((participant) => participant?.roleId === HIGH_PRIEST_ROLE);
  const describedWith = HP_NAME.test(note) && /(?:אינה אומרת|לא נאמר|רק לגבי המקרה|נתנו לו|כשהכהן|בהשתתפות)/u.test(note);
  if (describedWith) return { kind: "highPriestDescribed", partial: false };
  return participates ? { kind: "highPriest", partial: false, participant: true } : null;
}

/** Locator of the event's first evidence record that has one (primary source: a supporting quotation, else the first), or null. */
function eventLocator(byId, event) {
  for (const id of event?.evidenceIds ?? []) {
    const sources = byId.get(id)?.sources ?? [];
    const primary = sources.find((source) => source.relation === "supports" && source.excerptRole === "quotation") ?? sources[0];
    if (primary?.locator?.display) return primary.locator.display;
  }
  return null;
}

/**
 * @param {{ world: object, sequenceIds?: string[] }} input world = importWorld().world
 * @returns {{ stops: object[], sequences: object[] }}
 *   stop: { index, number, eventId, sequenceId, sequenceName, stageNote, continuation: { sequenceName, note } | null,
 *           startStep, endStep, title, locationId, locationBasis, inferred, pieces: [{ id, label }], placed }
 */
export function buildTourStops({ world, sequenceIds = null }) {
  const sequencesById = new Map((world?.sequences ?? []).map((sequence) => [sequence.id, sequence]));
  const piecesByLocation = new Map();
  for (const piece of world?.geometry ?? []) {
    if (!piece?.locationId) continue;
    piecesByLocation.set(piece.locationId, [...(piecesByLocation.get(piece.locationId) ?? []), { id: piece.id, label: he(piece.label) }]);
  }
  const evidenceById = new Map((world?.evidence ?? []).map((record) => [record.id, record]));
  const eventsBySequence = new Map();
  for (const event of world?.events ?? []) {
    if (event?.timing?.axis !== "sequence") continue;
    eventsBySequence.set(event.timing.sequenceId, [...(eventsBySequence.get(event.timing.sequenceId) ?? []), event]);
  }
  // Default: every published sequence that has events, in the order the data chains them. An explicit list keeps its own order.
  const chosen = sequenceIds
    ? sequenceIds.map((id) => sequencesById.get(id)).filter(Boolean)
    : orderSequences((world?.sequences ?? []).filter((sequence) => eventsBySequence.has(sequence.id)));
  const stops = [];
  const sequences = [];
  for (const sequence of chosen) {
    const events = [...(eventsBySequence.get(sequence.id) ?? [])]
      .sort((a, b) => a.timing.startStep - b.timing.startStep || a.timing.endStep - b.timing.endStep || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!events.length) continue;
    const previous = sequences.at(-1) ?? null;
    sequences.push({ id: sequence.id, name: he(sequence.name), firstStopIndex: stops.length, stopCount: events.length });
    events.forEach((event, position) => {
      const own = piecesByLocation.get(event.locationId) ?? [];
      const index = stops.length;
      const evidenceLocator = eventLocator(evidenceById, event);
      stops.push({
        index, number: index + 1, eventId: event.id, sequenceId: sequence.id, sequenceName: he(sequence.name), stageNote: he(sequence.stageNote),
        // A boundary stop carries the continuation note the data gives (the later sequence's orderNote) and both titles, never ids.
        continuation: position === 0 && previous ? { sequenceName: he(sequence.name), previousSequenceName: previous.name, note: he(sequence.orderNote) } : null,
        startStep: event.timing.startStep, endStep: event.timing.endStep, title: he(event.title),
        locationId: event.locationId ?? null, locationBasis: event.locationBasis ?? null, inferred: event.locationBasis === "inferred",
        evidenceLocator, locator: parseLocator(evidenceLocator), conditional: conditionalOf(event) ?? highPriestOf(event),
        pieces: own, placed: own.length > 0
      });
    });
  }
  planShots(stops, world);
  // M3-10: a stop at the same placed location as the one before it needs no new camera move.
  stops.forEach((stop, i) => { stop.sameAsPrevious = i > 0 && stop.placed && stops[i - 1].placed && stops[i - 1].locationId === stop.locationId; });
  const { chapters, range } = summariseLocators(stops, world);
  return { stops, sequences, chapters, range };
}

/**
 * T-10: passages of `tractate` that the world's evidence cites but that no stop names (neither as its primary locator nor in
 * the "(לפי …; …)" list of its title). Only what the data shows: nothing is added from outside the records.
 * @returns {{ tractate, chapter, mishnah, chapterLabel, mishnahLabel }[]} in text order
 */
export function excludedPassages(stops, world, tractate) {
  const key = (locator) => locator.chapter * 1000 + locator.mishnah;
  const cited = new Map();
  for (const record of world?.evidence ?? []) {
    for (const source of record?.sources ?? []) {
      const locator = parseLocator(source?.locator?.display);
      if (locator && locator.tractate === tractate) cited.set(key(locator), locator);
    }
  }
  const named = new Set();
  for (const stop of stops) {
    if (stop.locator?.tractate === tractate) named.add(key(stop.locator));
    const list = /\(לפי ([^)]*)\)\s*$/u.exec(stop.title ?? "")?.[1] ?? "";
    for (const piece of list.split(";")) {
      const locator = parseLocator(piece.includes(tractate) ? piece : `${tractate} ${piece}`);
      if (locator && locator.tractate === tractate) named.add(key(locator));
    }
  }
  return [...cited.entries()].filter(([k]) => !named.has(k)).sort((a, b) => a[0] - b[0]).map(([, locator]) => locator);
}

/** Where the published Mishnah ends, per tractate: reaching it means the tractate's narrative is covered to its last mishnah. */
const TRACTATE_END = Object.freeze({ "משנה תמיד": Object.freeze({ chapter: 7, mishnah: 4 }) });

/**
 * Chapters and covered range, derived from the stops' locators (nothing hard-coded but the end of Tamid above).
 * chapters: [{ chapter, label, tractate, title ("משנה תמיד ד"), firstStopIndex, stopCount }] in order of first appearance.
 * range: null, or { tractate, first: {chapter, mishnah, text}, last: {…}, text ("א, ב – ז, ד"), complete }.
 * Each stop gets `chapter` (number|null) and `chapterTitle`; a stop without a locator inherits the previous stop's chapter.
 */
function summariseLocators(stops, world = null) {
  const chapters = [];
  let current = null;
  for (const stop of stops) {
    const locator = stop.locator ?? current;
    if (stop.locator) current = stop.locator;
    stop.chapter = locator?.chapter ?? null;
    stop.chapterTitle = locator ? [locator.tractate, locator.chapterLabel].filter(Boolean).join(" ") : null;
    if (!locator) continue;
    let entry = chapters.find((item) => item.chapter === locator.chapter && item.tractate === locator.tractate);
    if (!entry) {
      entry = { chapter: locator.chapter, label: locator.chapterLabel, tractate: locator.tractate, title: stop.chapterTitle, firstStopIndex: stop.index, stopCount: 0 };
      chapters.push(entry);
    }
    entry.stopCount += 1;
  }
  const located = stops.filter((stop) => stop.locator);
  if (!located.length) return { chapters, range: null };
  const tractate = located[0].locator.tractate;
  const same = located.map((stop) => stop.locator).filter((locator) => locator.tractate === tractate);
  const key = (locator) => locator.chapter * 1000 + locator.mishnah;
  const first = same.reduce((a, b) => (key(b) < key(a) ? b : a));
  const last = same.reduce((a, b) => (key(b) > key(a) ? b : a));
  const part = (locator) => ({ chapter: locator.chapter, mishnah: locator.mishnah, text: `${locator.chapterLabel}, ${locator.mishnahLabel}` });
  const end = TRACTATE_END[tractate];
  const excluded = excludedPassages(stops, world, tractate).map(part);
  return { chapters, range: { tractate, first: part(first), last: part(last), text: `${part(first).text} – ${part(last).text}`,
    excluded, excludedText: excluded.map((item) => item.text).join("; "),
    complete: Boolean(end && last.chapter === end.chapter && last.mishnah === end.mishnah) } };
}

const COND_NAMES = Object.freeze({ highPriest: "HighPriest", highPriestDescribed: "HighPriestDescribed", shabbat: "Shabbat", other: "Other" });
/** Chip text for a conditional step ("מותנה: כהן גדול"); `s` = strings.tour. */
export function conditionalLabel(conditional, s) {
  return conditional ? s[`conditional${COND_NAMES[conditional.kind] ?? "Other"}${conditional.partial ? "Partial" : ""}`] : "";
}
/** One-line note for a conditional step; `s` = strings.tour. */
export function conditionalNote(conditional, s) {
  if (conditional?.participant) return s.conditionalNoteHighPriestParticipant;
  return conditional ? s[`conditionalNote${conditional.partial ? "Partial" : ""}${COND_NAMES[conditional.kind] ?? "Other"}`] : "";
}

/** End-of-tour text from the derived range. `templates`: { range, complete, none } (chrome strings with {tractate} {range}). */
export function endText(range, templates) {
  if (!range) return templates.none;
  const shown = range.excludedText && templates.excluded ? format(templates.excluded, { range: range.text, passages: range.excludedText }) : range.text;
  return format(range.complete ? templates.complete : templates.range, { tractate: range.tractate ?? "", range: shown }).replace(/\s{2,}/g, " ");
}

/** `?tour=<n>` (1-based) → 0-based stop index, or null when absent or out of range. Never throws. */
export function parseTourParam(search, stopCount) {
  let raw = null;
  try { raw = new URLSearchParams(typeof search === "string" ? search : "").get("tour"); } catch { return null; }
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  const number = Number(raw);
  return number >= 1 && number <= stopCount ? number - 1 : null;
}

/** `search` with `tour` set to the 1-based stop number (removed for null); other parameters keep their order. */
export function withTourParam(search, index) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  params.delete("tour");
  if (Number.isInteger(index) && index >= 0) params.set("tour", String(index + 1));
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query ? `?${query}` : "";
}

/** Keyboard: Escape exits; arrows follow reading direction, so in RTL ArrowLeft is "next". */
export function tourKeyAction(key, dir = "rtl") {
  if (key === "Escape") return "exit";
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return "next";
  if (key === back) return "prev";
  return null;
}

/** Touch: a mostly-horizontal swipe of at least `threshold` px; in RTL a swipe to the right moves forward. */
export function swipeAction(dx, dy, dir = "rtl", threshold = 60) {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  const forwardSign = dir === "rtl" ? 1 : -1;
  return Math.sign(dx) === forwardSign ? "next" : "prev";
}

/** Clamp a stop index into [0, count - 1]. */
export const clampStop = (index, count) => Math.min(Math.max(Math.trunc(Number(index)) || 0, 0), Math.max(count - 1, 0));

// ---- Camera plan (TASK-6-58) ----
/** Deterministic azimuth offsets (degrees) for consecutive stops that frame the same target, and matching elevations. */
export const SHOT_AZIMUTHS = Object.freeze([0, 25, -25, 50, -50]);
export const SHOT_ELEVATIONS = Object.freeze([40, 36, 42, 38, 44]);

/**
 * Where the camera looks for each stop. A placed stop frames its own pieces. A stop whose location has no piece frames
 * the nearest area the data relates it to by a recorded passage (spatial.topologyEdges, either direction) when that area
 * has a piece, else the whole mount. The related area is never highlighted: the model does not draw the stop's own place.
 * Consecutive stops with the same target get different azimuths so the view visibly moves.
 * stop.frame: { kind: "piece"|"area"|"overview", pieceIds, azimuth, elevation, areaLocationId, areaName }
 */
export function planShots(stops, world) {
  const pieceIdsAt = (locationId) => (world?.geometry ?? []).filter((piece) => piece?.locationId === locationId).map((piece) => piece.id);
  const locations = world?.locations ?? [];
  // The record names carry their attribution in parentheses ("(לפי משנה …)"); the caption wants the bare name.
  const nameOf = (id) => he(locations.find((location) => location.id === id)?.name)?.replace(/\s*\([^)]*\)\s*$/, "") ?? null;
  const related = (locationId) => {
    const own = locations.find((location) => location.id === locationId);
    const out = (own?.spatial?.topologyEdges ?? []).map((edge) => edge?.toLocationId);
    const back = locations.filter((location) => (location.spatial?.topologyEdges ?? []).some((edge) => edge?.toLocationId === locationId)).map((location) => location.id);
    return [...out, ...back].find((id) => id && pieceIdsAt(id).length > 0) ?? null;
  };
  let previousKey = null;
  let run = 0;
  for (const stop of stops) {
    let frame;
    if (stop.placed) frame = { kind: "piece", pieceIds: stop.pieces.map((piece) => piece.id), areaLocationId: null, areaName: null };
    else {
      const area = stop.locationId ? related(stop.locationId) : null;
      frame = area ? { kind: "area", pieceIds: pieceIdsAt(area), areaLocationId: area, areaName: nameOf(area) }
        : { kind: "overview", pieceIds: [], areaLocationId: null, areaName: null };
    }
    const key = frame.kind === "overview" ? null : frame.pieceIds.join("|");
    run = key !== null && key === previousKey ? run + 1 : 0;
    previousKey = key;
    stop.frame = { ...frame, azimuth: SHOT_AZIMUTHS[run % SHOT_AZIMUTHS.length], elevation: SHOT_ELEVATIONS[run % SHOT_ELEVATIONS.length] };
  }
  return stops;
}
