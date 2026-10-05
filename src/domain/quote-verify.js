// Mechanical quotation verification (EXECUTION_PLAN.md D9). Pure ESM, no I/O: callers pass
// the vendored texts keyed by textId (scripts/lib/read-world.js loads them in Node).
import { diagnostic } from "./diagnostics.js";

const NAMED_ENTITIES = Object.freeze({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " });

function decodeEntities(text) {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (whole, dec, hex, name) => {
    if (dec !== undefined || hex !== undefined) {
      const code = dec !== undefined ? Number(dec) : parseInt(hex, 16);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole;
  });
}

/**
 * Normalise text for substring matching. Order matters and is fixed:
 *  1. Unicode NFC.
 *  2. Remove Kaufmann marginal variants written as entity-escaped `&lt;...&gt;` (before entities are
 *     decoded, so they cannot be confused with real text).
 *  3. Replace `<br>` with a space, then strip HTML tags (`<small>`, `</small>`, ...). Tags start with
 *     an ASCII letter or `/`.
 *  4. Remove any remaining literal `<...>` marginalia (non-tag angle-bracket spans, e.g. Hebrew).
 *  5. Decode basic entities (&amp; &lt; &gt; &quot; &#39; &nbsp; numeric). Decoding comes after
 *     tag stripping so a decoded `<`/`>` is never treated as markup.
 *  6. Re-apply NFC, collapse whitespace (including NBSP) to single spaces, trim.
 *  7. Strip trailing `:` `.` `׃` (sof pasuq).
 *  8. With ignoreNiqqud, remove U+0591-U+05C7 points and cantillation (letters U+05D0-U+05EA stay).
 */
export function normalizeForMatch(text, { ignoreNiqqud = false } = {}) {
  let out = String(text ?? "").normalize("NFC");
  out = out.replace(/&lt;[^&]*?&gt;/g, "");
  out = out.replace(/<br\s*\/?>/gi, " ");
  out = out.replace(/<\/?[A-Za-z][^<>]*>/g, "");
  out = out.replace(/<[^<>]*>/g, "");
  out = decodeEntities(out).normalize("NFC");
  if (ignoreNiqqud) out = out.replace(/[֑-ׇ]/g, "");
  out = out.replace(/[\s ]+/g, " ").trim();
  out = out.replace(/[:.׃]+$/u, "").trim();
  return out;
}

const VERIFIED_ROLES = new Set(["quotation", "translation"]);
const isKaufmann = (textId) => typeof textId === "string" && textId.includes(".kaufmann");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function lookupText(textsById, textId) {
  if (typeof textId !== "string") return undefined;
  if (textsById instanceof Map) return textsById.get(textId);
  return textsById && Object.hasOwn(textsById, textId) ? textsById[textId] : undefined;
}

function lookupSegment(text, segment) {
  const segments = text?.segments;
  return isObject(segments) && typeof segment === "string" && Object.hasOwn(segments, segment) ? segments[segment] : undefined;
}

function parseSection(value) {
  const match = /^(\d+)\.(\d+)$/.exec(String(value));
  return match ? { book: Number(match[1]), section: Number(match[2]) } : null;
}

/** Coverage check for Josephus English chunks: locator section(s) must lie in coverage[segment]. */
function coverageProblem(source, text) {
  const { locator, textRef } = source;
  if (locator?.scheme !== "josephus" || text.language !== "en") return null;
  const range = isObject(text.coverage) && Object.hasOwn(text.coverage, textRef.segment) ? text.coverage[textRef.segment] : undefined;
  if (typeof range !== "string") return `text ${text.textId} declares no coverage for segment ${textRef.segment}`;
  const [from, to] = range.split("-").map(parseSection);
  if (!from || !to || from.book !== to.book) return `text ${text.textId} has unparseable coverage "${range}" for segment ${textRef.segment}`;
  const first = locator.section;
  const last = locator.sectionEnd ?? locator.section;
  if (locator.book !== from.book || !(first >= from.section && last <= to.section)) {
    return `locator ${locator.book}.${first}${last !== first ? `-${last}` : ""} is outside coverage ${range} of segment ${textRef.segment}`;
  }
  return null;
}

/**
 * Verify quotation/translation excerpts and textual-variant readings of one evidence record.
 * @param {object} record evidence record v2
 * @param {Map<string, object>|Record<string, object>} textsById vendored texts keyed by textId
 * @returns {{ diagnostics: object[], verified: number }}
 */
export function verifyExcerptsDetailed(record, textsById, { file } = {}) {
  const diagnostics = [];
  const recordId = typeof record?.id === "string" ? record.id : null;
  const add = (path, code, message) => diagnostics.push(diagnostic({ recordId, path, code, message, ...(file ? { file } : {}) }));
  let verified = 0;

  const sources = Array.isArray(record?.sources) ? record.sources : [];
  sources.forEach((source, i) => {
    if (!isObject(source)) return;
    const base = `sources[${i}]`;
    const textId = source.textRef?.textId;
    if (source.matchMode !== undefined && (source.matchMode !== "ignore_niqqud" || !isKaufmann(textId))) {
      add(`${base}.matchMode`, "ENUM_INVALID", `matchMode ${JSON.stringify(source.matchMode)} is allowed only as "ignore_niqqud" on a ".kaufmann" text`);
    }
    if (!VERIFIED_ROLES.has(source.excerptRole) || !isObject(source.textRef)) return;
    const text = lookupText(textsById, textId);
    if (text === undefined) return add(`${base}.textRef.textId`, "TEXT_UNKNOWN", `no vendored text with id ${JSON.stringify(textId)}`);
    const segment = lookupSegment(text, source.textRef.segment);
    if (segment === undefined) return add(`${base}.textRef.segment`, "QUOTE_NOT_FOUND", `text ${textId} has no segment ${JSON.stringify(source.textRef.segment)}`);
    const before = diagnostics.length;
    if (text.language !== source.language) {
      add(`${base}.language`, "ENUM_INVALID", `source language ${JSON.stringify(source.language)} differs from text ${textId} language ${JSON.stringify(text.language)}`);
    }
    const problem = coverageProblem(source, { ...text, textId });
    if (problem) add(`${base}.textRef.segment`, "LOCATOR_TEXTREF_MISMATCH", problem);
    const ignoreNiqqud = source.matchMode === "ignore_niqqud" && isKaufmann(textId);
    const excerpt = normalizeForMatch(source.excerpt, { ignoreNiqqud });
    if (excerpt.length === 0 || !normalizeForMatch(segment, { ignoreNiqqud }).includes(excerpt)) {
      add(`${base}.excerpt`, "QUOTE_NOT_FOUND", `excerpt is not a substring of ${textId} segment ${source.textRef.segment}${ignoreNiqqud ? " (ignoring niqqud)" : ""}`);
    }
    if (diagnostics.length === before) verified += 1;
  });

  const variants = Array.isArray(record?.textualVariants) ? record.textualVariants : [];
  variants.forEach((variant, j) => {
    if (!isObject(variant) || !isObject(variant.textRef)) return;
    const base = `textualVariants[${j}]`;
    const { textId, segment: segmentKey } = variant.textRef;
    const text = lookupText(textsById, textId);
    if (text === undefined) return add(`${base}.textRef.textId`, "TEXT_UNKNOWN", `no vendored text with id ${JSON.stringify(textId)}`);
    const segment = lookupSegment(text, segmentKey);
    if (segment === undefined) return add(`${base}.textRef.segment`, "QUOTE_NOT_FOUND", `text ${textId} has no segment ${JSON.stringify(segmentKey)}`);
    const ignoreNiqqud = isKaufmann(textId);
    const reading = normalizeForMatch(variant.reading, { ignoreNiqqud });
    if (reading.length === 0 || !normalizeForMatch(segment, { ignoreNiqqud }).includes(reading)) {
      add(`${base}.reading`, "QUOTE_NOT_FOUND", `reading is not a substring of ${textId} segment ${segmentKey}`);
    }
  });

  return { diagnostics, verified };
}

/** @returns {object[]} Diagnostic[] (empty when every excerpt and variant reading is verified) */
export function verifyExcerpts(record, textsById, options) {
  return verifyExcerptsDetailed(record, textsById, options).diagnostics;
}
