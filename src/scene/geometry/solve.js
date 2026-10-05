// Pure geometry solver (TASK-6-17; ADR-003; docs/scene/3d-architecture.md §2-§3).
// Geometry records (relative placement + dimensions in source units) → axis-aligned metric boxes, each number
// carrying where it came from. No DOM, no Date, no randomness, no I/O, no rendering library: runs in Node tests.
//
// Axes (right-handed, metres): +x = east, +z = south, +y = up (so -z = north, -x = west).
//   length = east-west extent (sx), width = north-south extent (sz), height = vertical (sy),
//   thickness = the short horizontal extent of a wall/barrier (see `orientation` below).
// The top surface of the first root record is y = 0.
//
// Honesty rules implemented here:
// - A number is never invented. A missing length/width → the piece is unresolved (MISSING_DIMENSION). A missing
//   height → a 0.05 m footprint flagged speculative (`default: "height_unstated"`).
// - Every solver default (unstated offset, unstated side, centring on an unstated axis) is listed in
//   `placement.defaults` and makes the placement speculative.
// - The amah has no metric value in code: it converts through the option of `altgrp-amah-length` (UNIT_CONVERSION_GROUPS).
//   Without a visitor selection or an approved default, the solver uses a NEUTRAL DISPLAY DEFAULT: the first listed
//   option (data order) whose values are all convertible to metres (reason "first_option" / "first_resolvable_option",
//   with the skipped options), else the first option (reason "no_resolvable_option"). That choice is never hidden:
//   it is reported with `assumed: true` in `selections`, `units` and `assumptions`, and every affected
//   piece/dimension carries `assumed: true`, so the UI can say "assuming X — choose". The same rule applies to every
//   alternative group a dimension depends on.
// - appliesTo (TASK-6-44): { groupId, optionIds } draws a piece only when the selected option of the group is listed;
//   the others are reported in `notShown` (and pieces placed on them), never silently dropped.
// - Other units convert through their own conversion group (UNIT_CONVERSION_GROUPS: tefach, cubit_greek, stadion),
//   whose options carry exactly one conversion key (`metres`, `tefachPerAmah`, `amahPerCubit`; amah-based keys go
//   through the amah option). Same selection rule as the amah. A sourced value converted through a non-amah group is
//   drawn at most "alternative" (its metric size depends on a visitor-switchable modern reading); the amah itself is
//   the model's global viewing assumption and does not cap styles.
// - A caller-supplied `unitConversions` entry overrides a non-amah unit (sourced by evidence or explicitly
//   speculative); such values are drawn speculative (`displayConversion: true`). A unit with neither → the piece is
//   listed in `unresolved` (UNIT_NOT_CONVERTIBLE) — never dropped.
import { CONVERSION_OPTION_KEYS, FIXED_METRES_PER_UNIT, UNIT_CONVERSION_GROUPS, UNIT_CONVERSION_KEYS } from "../../domain/measurement-vocabulary.js";

export const SOLVER_VERSION = 1;
/** Flat footprint height (metres) used when a record states no height. A display convention, flagged speculative. */
export const FOOTPRINT_HEIGHT_METRES = 0.05;
/** Certainty styles, weakest last. */
export const CERTAINTY_STYLES = Object.freeze(["sourced", "alternative", "speculative"]);
/** Kinds whose top surface is a floor that contained pieces stand on. Other parents share their base level. */
export const FLOOR_KINDS = Object.freeze(new Set(["platform", "court"]));
const THICKNESS_KINDS = new Set(["wall", "barrier"]);
const RANK = { sourced: 0, alternative: 1, speculative: 2 };
const SIDE_AXIS = { east: ["x", 1], west: ["x", -1], south: ["z", 1], north: ["z", -1] };
const RELATION_SIDE = { east_of: "east", west_of: "west", north_of: "north", south_of: "south" };
/** A portico with more column positions than this is not drawn (PORTICO_TOO_MANY): almost certainly a unit or count error. */
export const MAX_PORTICO_COLUMNS = 4000;
/**
 * Display conventions of a portico (TASK-6-43). No source in the model states a column diameter or a roof thickness,
 * so both are solver defaults, reported on the piece as `portico.displayDefaults` and always drawn speculative.
 */
export const PORTICO_ROOF_METRES = 0.4;
export const PORTICO_DIAMETER_RATIO = 0.2; // x column spacing, clamped to the range below
export const PORTICO_DIAMETER_MIN_METRES = 0.15;
export const PORTICO_DIAMETER_MAX_METRES = 1.5;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const weakest = (styles) => styles.reduce((worst, style) => (RANK[style] > RANK[worst] ? style : worst), "sourced");
const round = (value) => Math.round(value * 1e6) / 1e6;

function toList(collection) {
  if (Array.isArray(collection)) return collection;
  if (collection instanceof Map) return [...collection.values()];
  if (isObject(collection)) return Object.values(collection);
  return [];
}

function byIdMap(collection) {
  const map = new Map();
  for (const record of toList(collection)) if (isObject(record) && typeof record.id === "string" && !map.has(record.id)) map.set(record.id, record);
  return map;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** Canonical JSON (sorted keys) for memo keys. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

class Unresolvable extends Error {
  constructor(reason, detail, extra = {}) {
    super(detail);
    this.reason = reason;
    this.detail = detail;
    this.extra = extra;
  }
}

const CONVERSION_FACTOR_KEYS = ["perAmah", "amahPerUnit", "metresPerUnit"];
/**
 * Validate the caller-supplied display conversions for units without a conversion group (e.g. tefach, cubit_greek,
 * stadion). Shape: { [unit]: { perAmah | amahPerUnit | metresPerUnit: number > 0, evidenceId: "ev-…" | speculative: true,
 * note? } } — exactly one factor and exactly one basis. Overrides a unit's conversion group; fixed units and the amah
 * (the model's base unit, only ever converted through altgrp-amah-length) cannot be overridden.
 * Invalid entries are dropped with a UNIT_CONVERSION_INVALID diagnostic. Code never supplies a default.
 */
function readUnitConversions(input, diagnostics) {
  const out = new Map();
  if (!isObject(input)) return out;
  for (const unit of Object.keys(input).sort()) {
    const spec = input[unit];
    const bad = (detail) => diagnostics.push({ code: "UNIT_CONVERSION_INVALID", refId: unit, detail });
    if (Object.hasOwn(FIXED_METRES_PER_UNIT, unit) || unit === "amah") { bad(`${unit} cannot be overridden by a display conversion`); continue; }
    if (!isObject(spec)) { bad(`${unit}: conversion must be an object`); continue; }
    const factors = CONVERSION_FACTOR_KEYS.filter((key) => spec[key] !== undefined);
    if (factors.length !== 1 || !(typeof spec[factors[0]] === "number" && Number.isFinite(spec[factors[0]]) && spec[factors[0]] > 0)) {
      bad(`${unit}: give exactly one of ${CONVERSION_FACTOR_KEYS.join("|")} as a positive number`); continue;
    }
    const sourced = typeof spec.evidenceId === "string" && spec.evidenceId.length > 0;
    if (sourced === (spec.speculative === true)) { bad(`${unit}: give exactly one of evidenceId or speculative: true (with a note)`); continue; }
    out.set(unit, { [factors[0]]: spec[factors[0]], via: factors[0] === "metresPerUnit" ? "metre" : "amah",
      ...(sourced ? { evidenceId: spec.evidenceId } : { speculative: true }) });
  }
  return out;
}

/**
 * Corners of an irregular quadrilateral from its four side lengths (TASK-6-34), in metres, x = east, z = south.
 * Construction convention (a stated assumption, never a source claim): the south-west corner is a right angle, the
 * west wall runs due north-south and the south wall due east-west; the north-east corner is where the north wall
 * (from the north-west corner) and the east wall (from the south-east corner) meet, taking the intersection that lies
 * east of the west wall. Returns null when the four lengths cannot close a quadrilateral.
 * Corner order: NW, NE, SE, SW; the NW corner is the local origin (0, 0).
 */
export function quadrilateralCorners({ west, east, north, south }) {
  if (![west, east, north, south].every((side) => Number.isFinite(side) && side > 0)) return null;
  const k = north * north - east * east + south * south + west * west; // 2·S·x + 2·W·z = k
  const A = 1 + (south / west) ** 2;
  const B = -(south * k) / (west * west);
  const C = (k / (2 * west)) ** 2 - north * north;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return null;
  const x = (-B + Math.sqrt(discriminant)) / (2 * A);
  const z = (k - 2 * south * x) / (2 * west);
  if (!(x > 0)) return null;
  return [{ x: 0, z: 0 }, { x, z }, { x: south, z: west }, { x: 0, z: west }];
}

/**
 * One edge of a container as a directed segment with its inward unit normal (TASK-6-43). A container with a
 * quadrilateral outline (TASK-6-34) yields the polygon's own edge (slanted); a plain box yields its axis-aligned side.
 * `corners` are absolute { x, z } in the order NW, NE, SE, SW (the outline's order). Edges run NW to NE (north), NE to
 * SE (east), SE to SW (south), SW to NW (west). Returns null for an unknown side or a degenerate edge.
 */
export function edgeOfContainer(corners, side) {
  const index = { north: 0, east: 1, south: 2, west: 3 }[side];
  if (index === undefined || !Array.isArray(corners) || corners.length !== 4) return null;
  const a = corners[index];
  const b = corners[(index + 1) % 4];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(length > 0)) return null;
  const direction = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  const centre = { x: corners.reduce((sum, corner) => sum + corner.x, 0) / 4, z: corners.reduce((sum, corner) => sum + corner.z, 0) / 4 };
  let inward = { x: -direction.z || 0, z: direction.x };
  if (inward.x * (centre.x - a.x) + inward.z * (centre.z - a.z) < 0) inward = { x: direction.z, z: -direction.x || 0 };
  return { side, a, b, length, direction, inward };
}

/**
 * Lay out a colonnade along an edge (TASK-6-43; pure, metres). `edge` from edgeOfContainer; `depth` = the portico's
 * width measured inward from the edge (after `gap`); `segment` = optional length of the portico along the edge
 * (centred; default the whole edge); `rows` >= 1; exactly one of `columns` (per row, >= 1: ends included, evenly spaced)
 * or `spacing` (metres between column centres: as many as fit, centred on the segment).
 * Rows stand at the outer and inner faces (one row: mid-depth). Returns the band corners (a quadrilateral following
 * the edge), column centres and the counts, or null when nothing can be laid out.
 */
export function layoutPortico({ edge, depth, gap = 0, segment = null, rows, columns = null, spacing = null }) {
  if (!edge || !(depth > 0) || !(rows >= 1)) return null;
  const seg = Math.min(segment ?? edge.length, edge.length);
  if (!(seg > 0)) return null;
  const start = (edge.length - seg) / 2;
  let perRow;
  let step;
  let first;
  if (columns !== null) {
    perRow = columns;
    step = perRow > 1 ? seg / (perRow - 1) : 0;
    first = perRow > 1 ? 0 : seg / 2;
  } else if (spacing > 0) {
    perRow = Math.floor(seg / spacing + 1e-9) + 1;
    step = spacing;
    first = (seg - (perRow - 1) * spacing) / 2;
  } else return null;
  const at = (along, inward) => ({
    x: round(edge.a.x + edge.direction.x * (start + along) + edge.inward.x * inward),
    z: round(edge.a.z + edge.direction.z * (start + along) + edge.inward.z * inward)
  });
  const positions = [];
  for (let row = 0; row < rows; row += 1) {
    const inward = gap + (rows === 1 ? depth / 2 : (depth * row) / (rows - 1));
    for (let i = 0; i < perRow; i += 1) positions.push({ ...at(first + i * step, inward), row });
  }
  return {
    corners: [at(0, gap), at(seg, gap), at(seg, gap + depth), at(0, gap + depth)],
    columns: positions, rows, perRow, total: positions.length,
    spacingMetres: round(step), segmentMetres: round(seg), edgeMetres: round(edge.length), partial: seg < edge.length - 1e-9
  };
}

/** Signed distance (metres) by which `point` lies outside a convex polygon (≤ 0 inside). Corners in any winding order. */
export function outsideDistance(corners, point) {
  let area = 0;
  corners.forEach((a, i) => { const b = corners[(i + 1) % corners.length]; area += a.x * b.z - b.x * a.z; });
  const sign = area >= 0 ? 1 : -1;
  let worst = -Infinity;
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length === 0) return;
    // With the cross-product sign of the polygon area, interior points give a positive cross product on every edge.
    worst = Math.max(worst, -sign * ((b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x)) / length);
  });
  return worst;
}

/**
 * Solve geometry records into metric boxes.
 * @param {{ geometry?: object[]|Map|object, alternatives?: object[]|Map|object, evidence?: object[]|Map|object,
 *           selections?: { [altgrpId: string]: string }, world?: { geometry, alternatives, evidence } }} input
 *   `world` (importer output) supplies any collection not given explicitly.
 * @returns {Readonly<{ version, axes, pieces, unresolved, diagnostics, selections, units, assumptions }>} deep-frozen
 */
export function solveGeometry({ geometry, alternatives, evidence, selections = {}, unitConversions = {}, world } = {}) {
  const records = byIdMap(geometry ?? world?.geometry);
  const groups = byIdMap(alternatives ?? world?.alternatives);
  const evidenceById = byIdMap(evidence ?? world?.evidence);
  const chosen = isObject(selections) ? selections : {};
  const diagnostics = [];
  const resolvedSelections = new Map(); // groupId → { groupId, optionId, status, assumed, reason, skipped? }
  const usedBy = new Map(); // groupId → Set(pieceId)
  const displayConversions = readUnitConversions(unitConversions, diagnostics);

  // Every value each option of each group would contribute (dimensions and offsets of all records).
  const groupValues = new Map(); // groupId → Map(optionId → value[])
  const collect = (entry) => {
    if (!isObject(entry) || !isObject(entry.byOption) || typeof entry.alternativeGroupId !== "string") return;
    if (!groupValues.has(entry.alternativeGroupId)) groupValues.set(entry.alternativeGroupId, new Map());
    const byGroup = groupValues.get(entry.alternativeGroupId);
    for (const [optionId, value] of Object.entries(entry.byOption)) {
      if (!byGroup.has(optionId)) byGroup.set(optionId, []);
      byGroup.get(optionId).push(value);
    }
  };
  for (const record of records.values()) {
    if (isObject(record.dimensions)) Object.values(record.dimensions).forEach(collect);
    if (isObject(record.counts)) Object.values(record.counts).forEach(collect);
    if (isObject(record.placement)) collect(record.placement.offset);
  }

  const unitOfGroup = new Map(Object.entries(UNIT_CONVERSION_GROUPS).map(([unit, groupId]) => [groupId, unit]));
  /** The single valid conversion key of a unit-group option → { key, value, base, operation } | null. */
  function conversionKeyOf(unit, option) {
    if (!isObject(option)) return null;
    const keys = (UNIT_CONVERSION_KEYS[unit] ?? ["metres"]).filter((key) => option[key] !== undefined && option[key] !== null);
    if (keys.length !== 1) return null;
    const value = option[keys[0]];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    const meaning = CONVERSION_OPTION_KEYS[keys[0]];
    if (meaning.base === "amah" && unit === "amah") return null;
    return { key: keys[0], value, base: meaning.base, operation: meaning.operation };
  }
  /** Can this unit-group option convert (its key is valid and, if amah-based, the amah can convert)? */
  function unitOptionResolvable(unit, option) {
    const conv = conversionKeyOf(unit, option);
    return Boolean(conv) && (conv.base !== "amah" || unitConvertible("amah"));
  }
  /** Can this unit be converted to metres with the supplied groups / display conversions (option-independent)? */
  function unitConvertible(unit) {
    if (Object.hasOwn(FIXED_METRES_PER_UNIT, unit) || unit === "item") return true;
    const display = displayConversions.get(unit);
    if (display) return display.via !== "amah" || unitConvertible("amah");
    const groupId = UNIT_CONVERSION_GROUPS[unit];
    if (groupId) return (groups.get(groupId)?.options ?? []).some((option) => unitOptionResolvable(unit, option));
    return false;
  }
  /** Is an option usable as a display default: every value it contributes is convertible (unit group: it converts)? */
  function optionResolvable(groupId, optionId) {
    const group = groups.get(groupId);
    if (unitOfGroup.has(groupId)) {
      const option = group?.options?.find((candidate) => candidate?.id === optionId);
      return unitOptionResolvable(unitOfGroup.get(groupId), option);
    }
    return (groupValues.get(groupId)?.get(optionId) ?? []).every((value) =>
      isObject(value) && typeof value.unit === "string" && unitConvertible(value.unit));
  }

  /**
   * Resolve the option of a group: visitor selection → approved default → display default = the first listed option
   * whose values are all convertible (else the first option), flagged assumed with its reason.
   */
  function optionFor(groupId, fallbackOptionIds, pieceId) {
    if (!usedBy.has(groupId)) usedBy.set(groupId, new Set());
    if (pieceId !== null) usedBy.get(groupId).add(pieceId);
    if (resolvedSelections.has(groupId)) return resolvedSelections.get(groupId);
    const group = groups.get(groupId);
    const optionIds = Array.isArray(group?.options) ? group.options.map((option) => option?.id).filter((id) => typeof id === "string") : [...fallbackOptionIds].sort();
    if (!group) diagnostics.push({ code: "ALTERNATIVE_GROUP_UNKNOWN", refId: pieceId, detail: `${groupId} is not in the supplied alternatives` });
    let result = null;
    const selected = chosen[groupId];
    if (typeof selected === "string" && optionIds.includes(selected)) result = { optionId: selected, status: "selected", assumed: false, reason: "visitor_selection" };
    else {
      if (selected !== undefined) diagnostics.push({ code: "SELECTION_INVALID", refId: groupId, detail: `selection ${JSON.stringify(selected)} is not an option of ${groupId}` });
      if (typeof group?.defaultOptionId === "string" && optionIds.includes(group.defaultOptionId)) {
        result = { optionId: group.defaultOptionId, status: "approved_default", assumed: false, reason: "approved_default" };
      } else if (optionIds.length > 0) {
        const index = optionIds.findIndex((optionId) => optionResolvable(groupId, optionId));
        if (index === 0) result = { optionId: optionIds[0], status: "assumed", assumed: true, reason: "first_option" };
        else if (index > 0) result = { optionId: optionIds[index], status: "assumed", assumed: true, reason: "first_resolvable_option", skipped: optionIds.slice(0, index) };
        else result = { optionId: optionIds[0], status: "assumed", assumed: true, reason: "no_resolvable_option" };
      }
    }
    const entry = result ? { groupId, ...result } : null;
    resolvedSelections.set(groupId, entry);
    return entry;
  }

  /** Metres per unit, with conversion provenance. Throws Unresolvable for units without a conversion. */
  function metresPerUnit(unit, pieceId) {
    if (Object.hasOwn(FIXED_METRES_PER_UNIT, unit)) return { factor: FIXED_METRES_PER_UNIT[unit], conversion: { kind: "fixed", unit } };
    const display = displayConversions.get(unit);
    const groupId = UNIT_CONVERSION_GROUPS[unit];
    if (!display && groupId) {
      if (!groups.has(groupId)) throw new Unresolvable("UNIT_NOT_CONVERTIBLE", `unit ${unit} needs alternative group ${groupId}, which is not supplied`, { unit });
      const entry = optionFor(groupId, [], pieceId);
      const option = groups.get(groupId).options?.find((candidate) => candidate?.id === entry?.optionId);
      const conv = entry ? conversionKeyOf(unit, option) : null;
      if (!conv) {
        throw new Unresolvable("UNIT_NOT_CONVERTIBLE", `option ${entry?.optionId ?? "(none)"} of ${groupId} has no valid conversion key (${(UNIT_CONVERSION_KEYS[unit] ?? ["metres"]).join("|")})`,
          { unit, groupId, optionId: entry?.optionId ?? null });
      }
      let factor = conv.value;
      let amah = null;
      if (conv.base === "amah") {
        const base = metresPerUnit("amah", pieceId);
        amah = { groupId: base.conversion.groupId, optionId: base.conversion.optionId, metresPerUnit: base.factor, assumed: base.conversion.assumed };
        factor = conv.operation === "divide" ? base.factor / conv.value : base.factor * conv.value;
      }
      const evidenceIds = Array.isArray(option.evidenceIds) ? [...option.evidenceIds].sort() : [];
      return { factor, capStyle: unit !== "amah", conversion: {
        kind: "alternative", unit, groupId, optionId: entry.optionId, metresPerUnit: round(factor),
        ...(unit !== "amah" ? { key: conv.key, keyValue: conv.value } : {}),
        ...(amah ? { amah } : {}),
        evidenceIds,
        assumed: entry.assumed || amah?.assumed === true
      } };
    }
    if (!display) throw new Unresolvable("UNIT_NOT_CONVERTIBLE", `no conversion to metres for unit ${JSON.stringify(unit)} (no conversion group or unitConversions entry)`, { unit });
    let factor = display.metresPerUnit;
    let amah = null;
    if (display.via === "amah") {
      const base = metresPerUnit("amah", pieceId);
      amah = { groupId: base.conversion.groupId, optionId: base.conversion.optionId, metresPerUnit: base.factor, assumed: base.conversion.assumed };
      factor = display.perAmah !== undefined ? base.factor / display.perAmah : base.factor * display.amahPerUnit;
    }
    return { factor, display: true, conversion: {
      kind: "display", unit, metresPerUnit: round(factor), via: display.via,
      ...(display.perAmah !== undefined ? { perAmah: display.perAmah } : {}),
      ...(display.amahPerUnit !== undefined ? { amahPerUnit: display.amahPerUnit } : {}),
      ...(amah ? { amah } : {}),
      ...(display.evidenceId ? { evidenceId: display.evidenceId } : { speculative: true }),
      noteRef: { kind: "unitConversionNote", unit },
      assumed: amah?.assumed === true
    } };
  }

  /** One dimension value (sourced | speculative | alternative) → { metres, provenance }. */
  function resolveValue(entry, pieceId, noteRef) {
    if (!isObject(entry)) throw new Unresolvable("INVALID_DIMENSION", "dimension value is not an object");
    if (entry.alternativeGroupId !== undefined || entry.byOption !== undefined) {
      const groupId = entry.alternativeGroupId;
      const byOption = isObject(entry.byOption) ? entry.byOption : {};
      const selection = optionFor(groupId, Object.keys(byOption), pieceId);
      if (!selection) throw new Unresolvable("SELECTION_MISSING", `${groupId} has no option to use`);
      const inner = byOption[selection.optionId];
      if (!isObject(inner)) throw new Unresolvable("SELECTION_MISSING", `no value for option ${selection.optionId} of ${groupId}`);
      let resolved;
      try {
        resolved = resolveValue(inner, pieceId, noteRef ? { ...noteRef, optionId: selection.optionId } : null);
      } catch (error) {
        if (error instanceof Unresolvable) error.extra = { ...error.extra, groupId, optionId: selection.optionId };
        throw error;
      }
      const optionSpeculative = resolved.source === "speculative";
      return {
        ...resolved,
        source: "alternative",
        style: optionSpeculative || resolved.displayConversion ? "speculative" : "alternative",
        groupId,
        optionId: selection.optionId,
        assumed: selection.assumed || resolved.assumed,
        ...(optionSpeculative ? { optionSpeculative: true } : {})
      };
    }
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value) || entry.value <= 0) throw new Unresolvable("INVALID_DIMENSION", "dimension value must be a positive number");
    if (entry.unit === "item") { // a count (TASK-6-43): no unit conversion
      const count = { value: entry.value, unit: "item", count: entry.value, conversion: { kind: "count" }, assumed: false };
      if (entry.speculative === true) return { ...count, source: "speculative", style: "speculative", ...(noteRef ? { noteRef } : {}) };
      const evidenceRecord = evidenceById.get(entry.evidenceId);
      return { ...count, source: "evidence", style: "sourced", evidenceId: entry.evidenceId,
        evidencePublication: evidenceRecord?.publication ?? (evidenceRecord ? null : "unknown") };
    }
    const { factor, conversion, display, capStyle } = metresPerUnit(entry.unit, pieceId);
    const base = { value: entry.value, unit: entry.unit, metres: round(entry.value * factor), conversion, assumed: conversion.assumed === true,
      ...(display ? { displayConversion: true } : {}) };
    if (entry.speculative === true) return { ...base, source: "speculative", style: "speculative", ...(noteRef ? { noteRef } : {}) };
    const evidenceRecord = evidenceById.get(entry.evidenceId);
    // A number from evidence converted by a display conversion is drawn speculative: the metric size is not sourced.
    // Through a non-amah conversion group (a switchable modern reading) the metric size is at most "alternative".
    return { ...base, source: "evidence", style: display ? "speculative" : capStyle ? "alternative" : "sourced", evidenceId: entry.evidenceId,
      evidencePublication: evidenceRecord?.publication ?? (evidenceRecord ? null : "unknown") };
  }

  // ---- dependency order (parentId ∪ placement.of), cycles and missing references ----
  const ids = [...records.keys()].sort();
  const deps = (record) => [...new Set([record.parentId, record.placement?.of].filter((id) => typeof id === "string"))];
  const status = new Map(); // id → "visiting" | "done"
  const onCycle = new Set();
  const order = [];
  const visit = (id, stack) => {
    status.set(id, "visiting");
    stack.push(id);
    for (const next of deps(records.get(id)).sort()) {
      if (!records.has(next)) continue;
      if (status.get(next) === "visiting") for (const member of stack.slice(stack.indexOf(next))) onCycle.add(member);
      else if (!status.has(next)) visit(next, stack);
    }
    stack.pop();
    status.set(id, "done");
    order.push(id);
  };
  for (const id of ids) if (!status.has(id)) visit(id, []);

  const solved = new Map(); // id → piece
  const notShown = new Map(); // id → { id, refId, reason, groupId, optionIds, selectedOptionId, assumed }
  /** appliesTo of a record → null (none/invalid) | { shown, info: { reason, groupId, optionIds, selectedOptionId, assumed } }. */
  function appliesGate(record) {
    const spec = record.appliesTo;
    if (!isObject(spec) || typeof spec.groupId !== "string" || !Array.isArray(spec.optionIds)) return null;
    const optionIds = spec.optionIds.filter((optionId) => typeof optionId === "string");
    const selection = optionFor(spec.groupId, optionIds, record.id);
    if (!selection) return null;
    return { shown: optionIds.includes(selection.optionId),
      info: { reason: "NOT_IN_OPTION", groupId: spec.groupId, optionIds: [...optionIds].sort(), selectedOptionId: selection.optionId, assumed: selection.assumed } };
  }
  const unresolved = [];
  const roots = [];
  const fail = (id, reason, detail, extra = {}) => unresolved.push({ id, refId: id, reason, detail, ...extra });

  for (const id of order) {
    const record = records.get(id);
    if (onCycle.has(id)) { fail(id, "CYCLE", `${id} is on a parentId/placement.of cycle`); continue; }
    const missing = deps(record).filter((dep) => !records.has(dep));
    if (missing.length) { fail(id, "REF_MISSING", `references unknown geometry ${missing.join(", ")}`); continue; }
    // appliesTo (TASK-6-44): a piece for some options of a group only. Not drawn otherwise; reported in `notShown`,
    // never dropped silently. A piece placed on a not-shown piece is not shown either.
    const gate = appliesGate(record);
    if (gate && !gate.shown) { notShown.set(id, { id, refId: id, ...gate.info }); continue; }
    const hiddenDep = deps(record).find((dep) => notShown.has(dep));
    if (hiddenDep) { const { id: _id, refId: _refId, reason: _reason, ...info } = notShown.get(hiddenDep); notShown.set(id, { id, refId: id, reason: "PARENT_NOT_SHOWN", ...info }); continue; }
    const blocked = deps(record).filter((dep) => !solved.has(dep));
    if (blocked.length) { fail(id, "PARENT_UNRESOLVED", `depends on unresolved ${blocked.join(", ")}`); continue; }
    try {
      solved.set(id, solvePiece(record));
    } catch (error) {
      if (!(error instanceof Unresolvable)) throw error;
      fail(id, error.reason, error.detail, error.extra);
    }
  }

  /**
   * The quadrilateral outline of the selected option of record.outline, or null when the record has none for it.
   * Sides resolve like any dimension (sourced / speculative); the construction convention is always speculative, so
   * the outline's style is never "sourced". Corners are local (NW at 0,0), in metres.
   */
  function resolveOutline(record) {
    const spec = record.outline;
    if (!isObject(spec) || !isObject(spec.byOption) || typeof spec.alternativeGroupId !== "string") return null;
    const selection = optionFor(spec.alternativeGroupId, Object.keys(spec.byOption), record.id);
    const entry = selection ? spec.byOption[selection.optionId] : null;
    if (!isObject(entry) || !isObject(entry.sides)) return null;
    const sides = {};
    for (const side of ["west", "east", "north", "south"]) {
      sides[side] = resolveValue(entry.sides[side], record.id, { kind: "geometryOutlineNote", id: record.id, field: side, optionId: selection.optionId });
    }
    const corners = quadrilateralCorners({ west: sides.west.metres, east: sides.east.metres, north: sides.north.metres, south: sides.south.metres });
    if (!corners) throw new Unresolvable("OUTLINE_INVALID", `the four side lengths of ${record.id} (option ${selection.optionId}) do not close a quadrilateral`);
    return {
      shape: "quadrilateral", groupId: spec.alternativeGroupId, optionId: selection.optionId, corners, sides,
      construction: { style: "speculative", noteRef: { kind: "geometryOutlineNote", id: record.id, field: "construction", optionId: selection.optionId } },
      style: weakest([...Object.values(sides).map((side) => side.style), "speculative"]),
      assumed: selection.assumed || Object.values(sides).some((side) => side.assumed)
    };
  }

  /**
   * Portico preparation (TASK-6-43): the edge of the container (the selected mount option's own outline edge, quad
   * included), the colonnade layout along it and the band's bounds. The container must already be solved.
   */
  function preparePortico(record, dimensions, counts) {
    const id = record.id;
    const placement = record.placement;
    const container = isObject(placement) ? solved.get(placement.of) : null;
    if (!container || placement.relation !== "inside" || !SIDE_AXIS[placement.side]) {
      throw new Unresolvable("PLACEMENT_INVALID", `${id}: a portico needs placement.relation "inside" a solved container with side east|west|north|south`);
    }
    for (const key of ["depth", "height"]) if (!dimensions[key]) throw new Unresolvable("MISSING_DIMENSION", `${key} is not stated; the solver never invents it`);
    if (!counts.rows) throw new Unresolvable("MISSING_DIMENSION", "counts.rows is not stated; the solver never invents it");
    if (Boolean(counts.columns) === Boolean(dimensions.spacing)) {
      throw new Unresolvable("MISSING_DIMENSION", "give exactly one of counts.columns or dimensions.spacing");
    }
    const b = boxBounds(container.box);
    const corners = container.outline?.corners
      ?? [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }];
    const edge = edgeOfContainer(corners, placement.side);
    if (!edge) throw new Unresolvable("PLACEMENT_INVALID", `${id}: ${placement.of} has no usable ${placement.side} edge`);
    const gap = placement.offset !== undefined ? resolveValue(placement.offset, id, { kind: "geometryPlacementNote", id, field: "offset" }).metres : 0;
    const layout = layoutPortico({ edge, depth: dimensions.depth.metres, gap, segment: dimensions.length?.metres ?? null,
      rows: counts.rows.value, columns: counts.columns?.value ?? null, spacing: dimensions.spacing?.metres ?? null });
    if (!layout) throw new Unresolvable("PORTICO_INVALID", `${id}: the colonnade cannot be laid out along the ${placement.side} edge of ${placement.of}`);
    if (layout.total > MAX_PORTICO_COLUMNS) {
      throw new Unresolvable("PORTICO_TOO_MANY", `${id}: ${layout.total} column positions exceed the limit of ${MAX_PORTICO_COLUMNS}`, { total: layout.total });
    }
    const xs = layout.corners.map((corner) => corner.x);
    const zs = layout.corners.map((corner) => corner.z);
    return { edge, layout, containerId: placement.of, edgeStyle: container.footprintStyle, edgeAssumed: container.assumed === true,
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } };
  }

  /** The solved `portico` field: layout in absolute metres plus the display conventions (always speculative). */
  function porticoPiece(portico, sy) {
    const { layout, edge } = portico;
    const diameter = round(Math.min(Math.max(layout.spacingMetres * PORTICO_DIAMETER_RATIO, PORTICO_DIAMETER_MIN_METRES), PORTICO_DIAMETER_MAX_METRES));
    return {
      side: edge.side, containerId: portico.containerId,
      edge: { a: edge.a, b: edge.b, lengthMetres: layout.edgeMetres, inward: edge.inward },
      band: layout.corners, rows: layout.rows, columnsPerRow: layout.perRow, columnCount: layout.total,
      spacingMetres: layout.spacingMetres, segmentMetres: layout.segmentMetres, partial: layout.partial,
      columnHeightMetres: round(sy - PORTICO_ROOF_METRES),
      columns: layout.columns,
      displayDefaults: { columnDiameterMetres: diameter, roofThicknessMetres: PORTICO_ROOF_METRES, style: "speculative" }
    };
  }

  /** The solved `stair` field: stepped profile parameters (the box stays the bounding box). */
  function stairPiece(ascends, steps, box) {
    const run = ascends === "east" || ascends === "west" ? box.sx : box.sz;
    return { ascends, steps: steps.count, runMetres: round(run), stepRunMetres: round(run / steps.count), stepRiseMetres: round(box.sy / steps.count), style: steps.style };
  }

  function solvePiece(record) {
    const id = record.id;
    const dims = isObject(record.dimensions) ? record.dimensions : {};
    const noteRef = (dimension) => ({ kind: "geometryNote", id, dimension });
    const resolved = {};
    for (const key of ["length", "width", "height", "thickness", "depth", "spacing"]) {
      if (dims[key] !== undefined) resolved[key] = resolveValue(dims[key], id, noteRef(key));
    }
    const resolvedCounts = {};
    const countDims = isObject(record.counts) ? record.counts : {};
    for (const key of ["rows", "columns", "steps"]) {
      if (countDims[key] !== undefined) resolvedCounts[key] = resolveValue(countDims[key], id, { kind: "geometryCountNote", id, field: key });
    }
    const portico = record.kind === "portico" ? preparePortico(record, resolved, resolvedCounts) : null;
    // Optional quadrilateral outline for the selected option (TASK-6-34). The box stays the axis-aligned bounding
    // box (children are placed against it); the polygon is carried alongside and used for containment and drawing.
    const outline = resolveOutline(record);
    const thick = THICKNESS_KINDS.has(record.kind) && resolved.thickness && !resolved.width;
    if (portico) { /* length is an optional segment; the footprint comes from the container's edge */ } else if (!resolved.length) throw new Unresolvable("MISSING_DIMENSION", "length is not stated; the solver never invents it");
    if (!portico && !resolved.width && !thick) throw new Unresolvable("MISSING_DIMENSION", "width is not stated; the solver never invents it");
    if (!resolved.height) {
      resolved.height = { metres: FOOTPRINT_HEIGHT_METRES, source: "speculative", style: "speculative", default: "height_unstated", assumed: false };
    }

    const placement = record.placement;
    const relation = isObject(placement) ? placement.relation : null;
    // Wall/barrier with length + thickness: runs north-south when placed on an east/west side, else east-west.
    let orientation = null;
    let sx = portico ? portico.bounds.maxX - portico.bounds.minX : resolved.length.metres;
    let sz = portico ? portico.bounds.maxZ - portico.bounds.minZ : resolved.width?.metres;
    if (thick) {
      const side = placement?.side ?? RELATION_SIDE[relation];
      orientation = side === "east" || side === "west" ? "north_south" : "east_west";
      if (orientation === "north_south") { sx = resolved.thickness.metres; sz = resolved.length.metres; }
      else sz = resolved.thickness.metres;
    }
    let outlineBounds = null;
    if (outline) {
      const xs = outline.corners.map((corner) => corner.x);
      const zs = outline.corners.map((corner) => corner.z);
      outlineBounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
      sx = outlineBounds.maxX - outlineBounds.minX;
      sz = outlineBounds.maxZ - outlineBounds.minZ;
      for (const [key, size] of [["length", sx], ["width", sz]]) {
        if (Math.abs((resolved[key]?.metres ?? Infinity) - size) > 1) {
          diagnostics.push({ code: "OUTLINE_BOX_MISMATCH", refId: id,
            detail: `${id} ${key} ${resolved[key]?.metres ?? "missing"} m differs from the outline's bounding box ${round(size)} m; the outline wins` });
        }
      }
    }
    // A portico stands as high as its columns plus a roof slab (a display convention, see PORTICO_ROOF_METRES).
    const sy = resolved.height.metres + (portico ? PORTICO_ROOF_METRES : 0);

    // ---- placement ----
    const defaults = [];
    let offset = null;
    let cross = null;
    const warnings = []; // per-piece problems the UI must show (TASK-6-26): [{ code, containerId, overflow, detail }]
    let cx = 0;
    let cz = 0;
    let baseY;
    let placementSource = "speculative";
    let placementInfo;
    // Per-axis basis (TASK-6-24, review 3D-07): what fixes each coordinate of the box centre.
    // "sourced" | "alternative" | "speculative" (from the record / its offset), "solver_default" (a solver convention:
    // centring, zero gap, standing on the parent), "origin" (a root: the diagram's arbitrary origin, never a claim).
    let axes;
    if (!isObject(placement)) {
      roots.push(id);
      baseY = -sy; // every root's top surface at y = 0
      if (roots.length > 1) {
        defaults.push("root_at_origin");
        diagnostics.push({ code: "MULTIPLE_ROOTS", refId: id, detail: `${id} is a second root; placed at the origin` });
      }
      placementSource = "root";
      placementInfo = { relation: null, of: null, source: "root" };
      axes = { x: "origin", y: "origin", z: "origin" };
    } else {
      const ref = solved.get(placement.of);
      const R = boxBounds(ref.box);
      if (placement.offset !== undefined) offset = resolveValue(placement.offset, id, { kind: "geometryPlacementNote", id, field: "offset" });
      const d = offset?.metres ?? 0;
      let side = null;
      if (relation === "inside") {
        side = placement.side ?? null;
        cx = (R.minX + R.maxX) / 2;
        cz = (R.minZ + R.maxZ) / 2;
        if (!side) defaults.push("centred_in_parent");
        else {
          if (!offset) defaults.push("offset_unstated");
          const [axis, sign] = SIDE_AXIS[side];
          if (axis === "x") cx = sign > 0 ? R.maxX - d - sx / 2 : R.minX + d + sx / 2;
          else cz = sign > 0 ? R.maxZ - d - sz / 2 : R.minZ + d + sz / 2;
          defaults.push("cross_axis_centred");
        }
      } else if (relation === "centered_on") {
        cx = (R.minX + R.maxX) / 2;
        cz = (R.minZ + R.maxZ) / 2;
      } else if (RELATION_SIDE[relation] || relation === "adjoins") {
        side = RELATION_SIDE[relation] ?? placement.side ?? null;
        if (!side) { side = "east"; defaults.push("side_unstated"); }
        if (!offset && relation !== "adjoins") defaults.push("offset_unstated");
        const [axis, sign] = SIDE_AXIS[side];
        cx = (R.minX + R.maxX) / 2;
        cz = (R.minZ + R.maxZ) / 2;
        if (axis === "x") cx = sign > 0 ? R.maxX + d + sx / 2 : R.minX - d - sx / 2;
        else cz = sign > 0 ? R.maxZ + d + sz / 2 : R.minZ - d - sz / 2;
        defaults.push("cross_axis_centred");
      } else {
        throw new Unresolvable("PLACEMENT_INVALID", `unknown placement relation ${JSON.stringify(relation)}`);
      }
      // crossOffset (TASK-6-24 addendum, review 3D-08): the piece's `side` face lies that distance from the
      // reference's `side` face, toward the reference's interior, on the axis the relation leaves open.
      if (placement.crossOffset !== undefined) {
        const { side: crossSide, ...crossValue } = isObject(placement.crossOffset) ? placement.crossOffset : {};
        const crossAxis = SIDE_AXIS[crossSide];
        const ignore = (why) => diagnostics.push({ code: "CROSS_OFFSET_IGNORED", refId: id, detail: `placement.crossOffset ignored: ${why}` });
        if (!crossAxis) ignore(`side ${JSON.stringify(crossSide)} is not east|west|north|south`);
        else if (relation === "centered_on") ignore("centered_on already fixes both horizontal axes");
        else if (side && SIDE_AXIS[side][0] === crossAxis[0]) ignore(`side ${crossSide} is on the same axis as the placement side ${side}`);
        else {
          const value = resolveValue(crossValue, id, { kind: "geometryPlacementNote", id, field: "crossOffset" });
          const [axis, sign] = crossAxis;
          const dc = value.metres;
          if (axis === "x") cx = sign > 0 ? R.maxX - dc - sx / 2 : R.minX + dc + sx / 2;
          else cz = sign > 0 ? R.maxZ - dc - sz / 2 : R.minZ + dc + sz / 2;
          cross = { side: crossSide, ...value };
          const at = defaults.indexOf("cross_axis_centred");
          if (at >= 0) defaults.splice(at, 1);
        }
      }
      if (portico) { // the band along the container's edge fixes both axes; no offset/side defaults apply
        cx = (portico.bounds.minX + portico.bounds.maxX) / 2;
        cz = (portico.bounds.minZ + portico.bounds.maxZ) / 2;
        for (const name of ["offset_unstated", "cross_axis_centred"]) { const at = defaults.indexOf(name); if (at >= 0) defaults.splice(at, 1); }
        if (portico.layout.partial) defaults.push("segment_centred");
      }
      // Containment (TASK-6-26, review N-02): an `inside` piece must lie within its reference, and any piece within a
      // floor-like parent it stands on. Reported per piece in `warnings` (and in diagnostics), with the overflow per side.
      const containers = [];
      if (relation === "inside") containers.push(placement.of);
      const floorParent = solved.get(record.parentId);
      // A piece placed beside its own parent (east_of/…/adjoins with of === parentId) is outside it by design.
      const besideParent = placement.of === record.parentId && relation !== "inside" && relation !== "centered_on";
      if (floorParent && FLOOR_KINDS.has(floorParent.kind) && !besideParent && !containers.includes(record.parentId)) containers.push(record.parentId);
      for (const containerId of containers) {
        const C = boxBounds(solved.get(containerId).box);
        const overflow = {};
        const over = (side, amount) => { if (amount > 0.001) overflow[side] = round(amount); };
        over("east", cx + sx / 2 - C.maxX);
        over("west", C.minX - (cx - sx / 2));
        over("south", cz + sz / 2 - C.maxZ);
        over("north", C.minZ - (cz - sz / 2));
        // A container with a quadrilateral outline: the corners of the piece must lie inside the polygon too.
        const outlineOfContainer = solved.get(containerId).outline;
        if (outlineOfContainer) {
          const corners = portico ? portico.layout.corners
            : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dz]) => ({ x: cx + dx * sx / 2, z: cz + dz * sz / 2 }));
          const outside = Math.max(...corners.map((corner) => outsideDistance(outlineOfContainer.corners, corner)));
          if (outside > 0.001) overflow.outline = round(outside);
        }
        if (Object.keys(overflow).length) {
          const detail = `${id} extends past ${containerId} (${Object.entries(overflow).map(([k, v]) => `${k} ${v} m`).join(", ")})`;
          warnings.push({ code: "NOT_CONTAINED", containerId, overflow, detail });
          diagnostics.push({ code: "NOT_CONTAINED", refId: id, detail });
        }
      }
      // Vertical: stand on a floor-like parent's top surface; otherwise share the reference's base.
      const parent = solved.get(record.parentId) ?? null;
      const vertical = parent ?? ref;
      const vb = boxBounds(vertical.box);
      baseY = parent && FLOOR_KINDS.has(parent.kind) ? vb.maxY : vb.minY;
      placementSource = placement.speculative === true ? "speculative" : "evidence";
      const recordBasis = placementSource === "evidence" ? "sourced" : "speculative";
      const stated = offset ? weakest([recordBasis, offset.style]) : recordBasis;
      axes = { x: "solver_default", y: "solver_default", z: "solver_default" };
      if (relation === "centered_on") { axes.x = recordBasis; axes.z = recordBasis; }
      else if (side && !defaults.includes("side_unstated")) {
        // The stated side fixes one axis; without an offset that distance is a solver default (flush / zero gap),
        // except for `adjoins`, whose meaning is touching.
        axes[SIDE_AXIS[side][0]] = offset || relation === "adjoins" ? stated : "solver_default";
      }
      if (cross) axes[SIDE_AXIS[cross.side][0]] = weakest([recordBasis, cross.style]);
      if (portico) {
        const along = SIDE_AXIS[placement.side][0] === "x" ? "z" : "x";
        axes.x = stated; axes.z = stated;
        if (portico.layout.partial) axes[along] = "solver_default";
      }
      placementInfo = {
        relation, of: placement.of, side, source: placementSource,
        ...(placementSource === "evidence" ? { evidenceId: placement.evidenceId,
          evidencePublication: evidenceById.get(placement.evidenceId)?.publication ?? (evidenceById.has(placement.evidenceId) ? null : "unknown") } : {}),
        ...(placementSource === "speculative" ? { noteRef: { kind: "geometryPlacementNote", id, field: "note" } } : {}),
        ...(offset ? { offset } : {}),
        ...(cross ? { crossOffset: cross } : {})
      };
    }
    // A root's position is the diagram origin: style "origin", never "sourced", and it does not weaken certaintyStyle.
    const placementStyle = placementSource === "root"
      ? "origin"
      : weakest([placementSource === "evidence" ? "sourced" : "speculative", ...(offset ? [offset.style] : []), ...(cross ? [cross.style] : []), ...(defaults.length ? ["speculative"] : [])]);

    const dimensionStyles = [...Object.values(resolved), ...Object.values(resolvedCounts)].map((dim) => dim.style);
    const sizeStyle = weakest([...dimensionStyles, ...(outline ? [outline.style] : [])]);
    // Plan (horizontal extents) and height separately (TASK-6-24, review 3D-11): the renderer styles top/bottom faces
    // by the plan basis and side faces by the weaker of plan and height.
    const footprintStyle = weakest([...["length", "width", "thickness", "depth", "spacing"].filter((key) => resolved[key]).map((key) => resolved[key].style),
      ...Object.values(resolvedCounts).map((count) => count.style), ...(portico ? [portico.edgeStyle] : []),
      ...(outline ? [outline.style] : [])]);
    const heightStyle = resolved.height.style;
    const assumed = [...Object.values(resolved), ...Object.values(resolvedCounts)].some((dim) => dim.assumed) || portico?.edgeAssumed === true || offset?.assumed === true || cross?.assumed === true
      || outline?.assumed === true;
    const box = { x: round(cx), y: round(baseY + sy / 2), z: round(cz), sx: round(sx), sy: round(sy), sz: round(sz) };
    const outlinePiece = outline ? { ...outline, corners: outline.corners.map((corner) => ({
      x: round(box.x - box.sx / 2 + corner.x - outlineBounds.minX), z: round(box.z - box.sz / 2 + corner.z - outlineBounds.minZ) })) } : null;
    return {
      id,
      refKind: "geometry",
      refId: id,
      kind: record.kind,
      labelRef: { kind: "geometry", id },
      locationId: typeof record.locationId === "string" ? record.locationId : null,
      locationNote: record.locationNote ?? null,
      ...(isObject(record.appliesTo) && Array.isArray(record.appliesTo.optionIds) ? { appliesTo: (() => {
        const gate = appliesGate(record);
        return { groupId: record.appliesTo.groupId, optionIds: [...record.appliesTo.optionIds].sort(), selectedOptionId: gate?.info.selectedOptionId ?? null };
      })() } : {}),
      parentId: typeof record.parentId === "string" ? record.parentId : null,
      box,
      ...(outlinePiece ? { outline: outlinePiece } : {}),
      ...(portico ? { portico: porticoPiece(portico, sy) } : {}),
      ...(record.kind === "stair" && isObject(record.stair) && resolvedCounts.steps ? { stair: stairPiece(record.stair.ascends, resolvedCounts.steps, box) } : {}),
      orientation,
      dimensions: resolved,
      ...(Object.keys(resolvedCounts).length ? { counts: resolvedCounts } : {}),
      placement: { ...placementInfo, defaults: [...new Set(defaults)].sort(), style: placementStyle, axes },
      sizeStyle,
      footprintStyle,
      heightStyle,
      placementStyle,
      certaintyStyle: placementStyle === "origin" ? sizeStyle : weakest([sizeStyle, placementStyle]),
      assumed,
      warnings,
      publication: record.publication ?? null,
      tier: record.tier ?? null,
      effectiveCertainty: record.effectiveCertainty ?? record.certainty ?? null,
      evidenceIds: Array.isArray(record.evidenceIds) ? [...record.evidenceIds].sort() : []
    };
  }

  const pieces = [...solved.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  unresolved.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selectionList = [...resolvedSelections.values()].filter(Boolean).sort((a, b) => (a.groupId < b.groupId ? -1 : 1))
    .map((entry) => ({ ...entry, usedBy: [...(usedBy.get(entry.groupId) ?? [])].sort() }));
  const units = {};
  for (const [unit, groupId] of Object.entries(UNIT_CONVERSION_GROUPS)) {
    const entry = resolvedSelections.get(groupId);
    if (!entry || displayConversions.has(unit)) continue;
    let metres = null;
    try { metres = round(metresPerUnit(unit, null).factor); } catch { metres = null; }
    if (metres !== null) units[unit] = { groupId, optionId: entry.optionId, metresPerUnit: metres, status: entry.status, assumed: entry.assumed, reason: entry.reason };
  }
  diagnostics.sort((a, b) => stableStringify([a.code, a.refId, a.detail]).localeCompare(stableStringify([b.code, b.refId, b.detail])));
  return deepFreeze({
    version: SOLVER_VERSION,
    axes: { x: "east", y: "up", z: "south", unit: "metre" },
    pieces,
    unresolved,
    notShown: [...notShown.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    diagnostics,
    selections: selectionList,
    units,
    assumptions: selectionList.filter((entry) => entry.assumed)
  });
}

/** { x, y, z, sx, sy, sz } (centre + full size) → min/max bounds. */
export function boxBounds(box) {
  return {
    minX: box.x - box.sx / 2, maxX: box.x + box.sx / 2,
    minY: box.y - box.sy / 2, maxY: box.y + box.sy / 2,
    minZ: box.z - box.sz / 2, maxZ: box.z + box.sz / 2
  };
}

/** Union bounds of solved pieces, or null when empty. */
export function sceneBounds(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) return null;
  const all = pieces.map((piece) => boxBounds(piece.box));
  const pick = (key, fn) => fn(...all.map((b) => b[key]));
  return { minX: pick("minX", Math.min), maxX: pick("maxX", Math.max), minY: pick("minY", Math.min),
    maxY: pick("maxY", Math.max), minZ: pick("minZ", Math.min), maxZ: pick("maxZ", Math.max) };
}

/**
 * Memoised solver: returns the identical result while the collections (by reference) and the selections (by value)
 * are unchanged.
 */
export function createGeometrySolver() {
  let last = null;
  return (input = {}) => {
    const key = [input.world ?? null, input.geometry ?? null, input.alternatives ?? null, input.evidence ?? null, stableStringify(input.selections ?? {})];
    if (last && last.key.every((part, index) => part === key[index])) return last.result;
    const result = solveGeometry(input);
    last = { key, result };
    return result;
  };
}
