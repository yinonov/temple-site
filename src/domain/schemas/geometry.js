// Geometry record v1 (TASK-6-11; .planning/STRATEGY-2026-10.md §6; docs/contracts/world-data.md "Geometry v1";
// docs/decisions/ADR-003-three-js-scene.md). Pure ESM, no I/O.
//
// A geometry record describes one piece of the 3D scene (platform, court, wall, gate, …) by relative placement and
// dimensions. Every number is either sourced (a `measurement` evidence record stating exactly that value and unit),
// switchable (an alternative group with one value per option), or explicitly speculative (with a visitor-facing
// note). Nothing is silently invented: the solver (src/scene/geometry/solve.js) and renderer style each piece from
// these markers. Evidence marked `useScope: "comparison_only"` (e.g. Ezekiel's vision) can never feed a geometry
// record, not even as an alternative option.
import { ID_PREFIXES, at, collector, isObject, join, refGet, rootNotObject, typeName, worldDiagnostic } from "./common.js";
import { COUNT_UNITS, LENGTH_UNITS, PLACEMENT_RELATIONS, PLACEMENT_SIDES } from "../measurement-vocabulary.js";

export const GEOMETRY_SCHEMA_VERSION = 1;
export const GEOMETRY_KINDS = Object.freeze(new Set([
  "platform", "court", "wall", "gate", "building", "altar", "barrier", "chamber", "stair", "portico"
]));
/** Dimension keys. Axes: length = east–west extent, width = north–south extent, height = vertical, thickness = wall. */
export const DIMENSION_KEYS = Object.freeze(["length", "width", "height", "thickness", "depth", "spacing"]);
/**
 * Count keys of the optional `counts` object (TASK-6-43), each a whole number with unit "item": `rows` (column rows of a
 * portico), `columns` (columns per row of a portico), `steps` (steps of a stair).
 */
export const COUNT_KEYS = Object.freeze(["rows", "columns", "steps"]);
/** Kind-specific dimension / count keys (a portico is described by depth, height, rows and spacing or columns). */
const PORTICO_DIMENSIONS = new Set(["length", "height", "depth", "spacing"]);
const PORTICO_COUNTS = new Set(["rows", "columns"]);
/** Measurement quantities a dimension may cite (area and count never size a box). */
const LINEAR_QUANTITIES = new Set(["length", "width", "height", "thickness"]);
const VALUE_KEYS = new Set(["value", "unit", "evidenceId"]);
const SPECULATIVE_KEYS = new Set(["speculative", "value", "unit", "note"]);
const ALTERNATIVE_KEYS = new Set(["alternativeGroupId", "byOption"]);
/** Sides of an optional quadrilateral outline (TASK-6-34). */
export const OUTLINE_SIDES = Object.freeze(["west", "east", "north", "south"]);
const OUTLINE_KEYS = new Set(["alternativeGroupId", "byOption"]);
const OUTLINE_OPTION_KEYS = new Set(["shape", "sides", "construction"]);
const AXIS_OF_SIDE = { east: "x", west: "x", north: "z", south: "z" };
const RELATION_SIDES = { east_of: "east", west_of: "west", north_of: "north", south_of: "south" };

/**
 * Validate one geometry record.
 * @param {unknown} record
 * @param {{ refs?: { evidenceIds?, evidence?: Map|object, locationIds?, geometryIds?, alternativeGroupIds?,
 *           alternativeGroups?: Map|object }, allowSynthetic?: boolean, file?: string }} context
 *   `refs.evidence` (id → evidence record) enables the measurement/comparison checks; `refs.alternativeGroups`
 *   (id → group) enables the option-coverage check. Each check is skipped when its collection is not supplied.
 * @returns {object[]} sorted diagnostics; empty when valid
 */
export function validateGeometry(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "geometry record", context.file);
  const c = collector(record, context);
  const refs = c.refs;
  c.header(GEOMETRY_SCHEMA_VERSION, ID_PREFIXES.geometry);
  c.enumValue(record, "kind", "kind", GEOMETRY_KINDS);
  c.bilingual(record, "label", "label");
  const listed = new Set(Array.isArray(record.evidenceIds) ? record.evidenceIds : []);

  if (record.locationId !== undefined && record.locationId !== null) {
    c.refId(record, "locationId", "locationId", ID_PREFIXES.location, "locationIds", "REF_UNKNOWN_LOCATION", "location");
  }
  // TASK-6-35g: optional visitor-facing note on how the piece is tied to its location (e.g. a conventional identification).
  if (record.locationNote !== undefined && record.locationNote !== null) {
    c.bilingual(record, "locationNote", "locationNote");
  }
  const geoRef = (parent, key, path) => {
    const value = c.refId(parent, key, path, ID_PREFIXES.geometry, "geometryIds", "REF_UNKNOWN_GEOMETRY", "geometry record");
    if (value !== null && value === record.id) c.add(path, "REF_UNKNOWN_GEOMETRY", `${path} must not reference the record itself`);
    return value;
  };
  const hasParent = record.parentId !== undefined && record.parentId !== null;
  if (hasParent) geoRef(record, "parentId", "parentId");

  // ---- alternatives the record depends on: [{ groupId }] ----
  const listedGroups = new Set();
  const alternatives = c.array(record, "alternatives", "alternatives", { optional: true });
  alternatives?.forEach((entry, index) => {
    const path = at("alternatives", index);
    if (!isObject(entry)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const groupId = c.refId(entry, "groupId", join(path, "groupId"), ID_PREFIXES.alternative_group,
      "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
    if (groupId !== null) {
      if (listedGroups.has(groupId)) c.add(join(path, "groupId"), "ID_DUPLICATE", `${path}.groupId repeats ${JSON.stringify(groupId)}`);
      listedGroups.add(groupId);
    }
  });

  /** Evidence suitability: listed at top level, and (when refs.evidence is given) of the required claim kind. */
  const citeEvidence = (value, path, { claimKind, number = null, unit = null, quantity = "length" }) => {
    if (!c.push(checkEvidenceId(value, path, c))) return;
    if (!listed.has(value)) c.add(path, "GEOMETRY_REF_UNLISTED", `${path} cites ${value}, which must also be listed in evidenceIds`);
    c.ref(value, path, "evidenceIds", "REF_UNKNOWN_EVIDENCE", "evidence record");
    const evidence = refs?.evidence ? refGet(refs.evidence, value) : undefined;
    if (!evidence) return;
    if (evidence.useScope === "comparison_only" || evidence.sourceType === "prophetic_vision") {
      c.add(path, "GEOMETRY_EVIDENCE_UNSUITABLE", `${path}: ${value} is comparison_only and can never be a dimension or placement source`);
      return;
    }
    if (evidence.claimKind !== claimKind) {
      c.add(path, "GEOMETRY_EVIDENCE_UNSUITABLE", `${path} must cite a "${claimKind}" evidence record; ${value} is "${evidence.claimKind}"`);
      return;
    }
    if (claimKind === "measurement" && isObject(evidence.measurement)) {
      const m = evidence.measurement;
      if (quantity === "count" ? m.quantity !== "count" : !LINEAR_QUANTITIES.has(m.quantity)) {
        c.add(path, "GEOMETRY_EVIDENCE_UNSUITABLE", `${path}: ${value} measures ${m.quantity}, not ${quantity === "count" ? "a count" : "a linear extent"}`);
      } else if (number !== null && unit !== null && (m.value !== number || m.unit !== unit)) {
        c.add(path, "GEOMETRY_EVIDENCE_UNSUITABLE",
          `${path}: ${value} states ${m.value} ${m.unit}, not ${number} ${unit}; a derived number must be marked speculative with a note`);
      }
    }
  };

  /** One length value: sourced { value, unit, evidenceId } or speculative { speculative: true, value, unit, note }. */
  const lengthValue = (entry, path, { allowAlternative, quantity = "length" }) => {
    if (!isObject(entry)) { c.add(path, entry === undefined || entry === null ? "FIELD_REQUIRED" : "TYPE_MISMATCH", `${path} must be a dimension object`); return; }
    if (entry.alternativeGroupId !== undefined || entry.byOption !== undefined) {
      if (!allowAlternative) { c.add(path, "TYPE_MISMATCH", `${path} cannot nest an alternative inside an alternative`); return; }
      alternativeValue(entry, path, quantity);
      return;
    }
    const speculative = entry.speculative !== undefined;
    const allowed = speculative ? SPECULATIVE_KEYS : VALUE_KEYS;
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) {
        c.add(join(path, key), "TYPE_MISMATCH", speculative
          ? `${join(path, key)} is not allowed on a speculative value (speculative, value, unit, note)`
          : `${join(path, key)} is not allowed on a sourced value (value, unit, evidenceId)`);
      }
    }
    let number = null;
    if (entry.value === undefined || entry.value === null) c.add(join(path, "value"), "FIELD_REQUIRED", `${join(path, "value")} is required`);
    else if (typeof entry.value !== "number" || !Number.isFinite(entry.value) || entry.value <= 0 || (quantity === "count" && !Number.isInteger(entry.value))) {
      c.add(join(path, "value"), "TYPE_MISMATCH", `${join(path, "value")} must be a finite number greater than 0${quantity === "count" ? " and a whole number" : ""}`);
    } else number = entry.value;
    const unit = c.enumValue(entry, "unit", join(path, "unit"), quantity === "count" ? COUNT_UNITS : LENGTH_UNITS);
    if (speculative) {
      if (entry.speculative !== true) c.add(join(path, "speculative"), "TYPE_MISMATCH", `${join(path, "speculative")} must be true`);
      c.bilingual(entry, "note", join(path, "note"));
    } else {
      citeEvidence(entry.evidenceId, join(path, "evidenceId"), { claimKind: "measurement", number, unit, quantity });
    }
  };

  /** { alternativeGroupId, byOption: { "alt-…": lengthValue } } — one value per option, every option covered. */
  const alternativeValue = (entry, path, quantity = "length") => {
    for (const key of Object.keys(entry)) {
      if (!ALTERNATIVE_KEYS.has(key)) c.add(join(path, key), "TYPE_MISMATCH", `${join(path, key)} is not allowed on an alternative value (alternativeGroupId, byOption)`);
    }
    const groupPath = join(path, "alternativeGroupId");
    const groupId = c.refId(entry, "alternativeGroupId", groupPath, ID_PREFIXES.alternative_group,
      "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
    if (groupId !== null && !listedGroups.has(groupId)) {
      c.add(groupPath, "GEOMETRY_REF_UNLISTED", `${groupPath} ${groupId} must also be listed in alternatives[].groupId`);
    }
    const byOption = c.object(entry, "byOption", join(path, "byOption"));
    if (!byOption) return;
    const optionIds = Object.keys(byOption);
    if (optionIds.length === 0) c.add(join(path, "byOption"), "FIELD_REQUIRED", `${join(path, "byOption")} must give a value for each option`);
    for (const optionId of optionIds) {
      const optionPath = join(join(path, "byOption"), optionId);
      if (!/^alt-[a-z0-9]+(-[a-z0-9]+)*$/.test(optionId)) c.add(optionPath, "ID_FORMAT", `${optionPath}: option keys must be alt- ids`);
      lengthValue(byOption[optionId], optionPath, { allowAlternative: false, quantity });
    }
    const group = groupId !== null && refs?.alternativeGroups ? refGet(refs.alternativeGroups, groupId) : undefined;
    if (isObject(group) && Array.isArray(group.options)) {
      const known = new Set(group.options.map((option) => option?.id));
      for (const optionId of optionIds) {
        if (!known.has(optionId)) c.add(join(join(path, "byOption"), optionId), "REF_UNKNOWN_ALTERNATIVE", `${optionId} is not an option of ${groupId}`);
      }
      for (const optionId of known) {
        if (typeof optionId === "string" && !Object.hasOwn(byOption, optionId)) {
          c.add(join(path, "byOption"), "FIELD_REQUIRED", `${join(path, "byOption")} has no value for option ${optionId} of ${groupId}; every option needs one`);
        }
      }
    }
  };

  /**
   * placement.crossOffset (TASK-6-24 addendum, review 3D-08): the distance of the piece's `side` face from the
   * reference's `side` face, measured toward the reference's interior, on the axis the relation leaves open.
   * Shape: { side } + one dimension value (sourced | speculative | alternative), e.g.
   * { side: "north", value: 75, unit: "amah", speculative: true, note: { he, en } }.
   */
  const crossOffset = (placement, path) => {
    const entry = placement.crossOffset;
    if (!isObject(entry)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object { side, value, unit, … }`); return; }
    const side = c.enumValue(entry, "side", join(path, "side"), PLACEMENT_SIDES);
    const { side: _side, ...value } = entry;
    lengthValue(value, path, { allowAlternative: true });
    if (placement.relation === "centered_on") {
      c.add(path, "TYPE_MISMATCH", `${path} is not allowed with centered_on (both horizontal axes are already fixed)`);
      return;
    }
    const primary = placement.relation === "inside" || placement.relation === "adjoins" ? placement.side : RELATION_SIDES[placement.relation];
    if (side !== null && typeof primary === "string" && AXIS_OF_SIDE[primary] === AXIS_OF_SIDE[side]) {
      c.add(join(path, "side"), "TYPE_MISMATCH", `${join(path, "side")} must be on the other axis than the placement's own side (${primary})`);
    }
  };

  // ---- placement ----
  if (record.placement === undefined || (record.placement === null && hasParent)) {
    c.add("placement", "FIELD_REQUIRED", hasParent || record.placement === undefined
      ? "placement is required (null only for a root record without parentId)" : "placement is required");
  } else if (record.placement !== null) {
    const placement = c.object(record, "placement", "placement");
    if (placement) {
      c.enumValue(placement, "relation", "placement.relation", PLACEMENT_RELATIONS);
      geoRef(placement, "of", "placement.of");
      if (placement.side !== undefined) c.enumValue(placement, "side", "placement.side", PLACEMENT_SIDES);
      if (placement.offset !== undefined) lengthValue(placement.offset, "placement.offset", { allowAlternative: true });
      if (placement.crossOffset !== undefined) crossOffset(placement, "placement.crossOffset");
      const speculative = placement.speculative !== undefined;
      if (speculative && placement.evidenceId !== undefined) {
        c.add("placement", "TYPE_MISMATCH", "placement is either sourced (evidenceId) or speculative (speculative: true + note), not both");
      } else if (speculative) {
        if (placement.speculative !== true) c.add("placement.speculative", "TYPE_MISMATCH", "placement.speculative must be true");
        c.bilingual(placement, "note", "placement.note");
      } else if (placement.evidenceId === undefined || placement.evidenceId === null) {
        c.add("placement.evidenceId", "FIELD_REQUIRED", "placement needs an evidenceId (a placement claim) or speculative: true with a note");
      } else {
        citeEvidence(placement.evidenceId, "placement.evidenceId", { claimKind: "placement" });
      }
    }
  }

  // ---- dimensions ----
  const dimensions = c.object(record, "dimensions", "dimensions");
  if (dimensions) {
    for (const key of Object.keys(dimensions)) {
      if (!DIMENSION_KEYS.includes(key)) {
        c.add(join("dimensions", key), "ENUM_INVALID", `dimensions.${key} is not a dimension; use ${DIMENSION_KEYS.join("|")}`);
        continue;
      }
      lengthValue(dimensions[key], join("dimensions", key), { allowAlternative: true });
    }
  }

  // ---- counts (TASK-6-43): whole numbers, each sourced / speculative / alternative like a dimension ----
  const counts = record.counts === undefined ? null : c.object(record, "counts", "counts");
  if (counts) {
    for (const key of Object.keys(counts)) {
      if (!COUNT_KEYS.includes(key)) { c.add(join("counts", key), "ENUM_INVALID", `counts.${key} is not a count; use ${COUNT_KEYS.join("|")}`); continue; }
      lengthValue(counts[key], join("counts", key), { allowAlternative: true, quantity: "count" });
    }
  }

  // ---- kind-specific rules (TASK-6-43) ----
  const dims = isObject(record.dimensions) ? record.dimensions : {};
  const countObject = isObject(record.counts) ? record.counts : {};
  if (record.kind === "portico") {
    // A portico: a colonnade along one edge of its container (placement.of, relation "inside", placement.side).
    for (const key of Object.keys(dims)) {
      if (!PORTICO_DIMENSIONS.has(key)) c.add(join("dimensions", key), "TYPE_MISMATCH", `dimensions.${key} is not used by a portico (length (optional segment), height, depth, spacing)`);
    }
    for (const key of Object.keys(countObject)) {
      if (!PORTICO_COUNTS.has(key)) c.add(join("counts", key), "TYPE_MISMATCH", `counts.${key} is not used by a portico (rows, columns)`);
    }
    for (const key of ["depth", "height"]) {
      if (dims[key] === undefined) c.add(join("dimensions", key), "FIELD_REQUIRED", `a portico needs dimensions.${key}`);
    }
    if (countObject.rows === undefined) c.add("counts.rows", "FIELD_REQUIRED", "a portico needs counts.rows (the number of column rows)");
    if ((countObject.columns === undefined) === (dims.spacing === undefined)) {
      c.add("counts", "FIELD_REQUIRED", "a portico needs exactly one of counts.columns (columns per row) or dimensions.spacing (column spacing)");
    }
    const p = record.placement;
    if (isObject(p) && (p.relation !== "inside" || typeof p.side !== "string")) {
      c.add("placement", "TYPE_MISMATCH", "a portico is placed along an edge of its container: placement.relation \"inside\" with placement.side and placement.of (the container)");
    }
    if (!isObject(p)) c.add("placement", "FIELD_REQUIRED", "a portico needs a placement inside its container");
  } else {
    for (const key of ["depth", "spacing"]) {
      if (dims[key] !== undefined) c.add(join("dimensions", key), "TYPE_MISMATCH", `dimensions.${key} is only allowed on a portico`);
    }
    for (const key of Object.keys(countObject)) {
      if (!(key === "steps" && record.kind === "stair")) c.add(join("counts", key), "TYPE_MISMATCH", `counts.${key} is not allowed on a ${record.kind}${key === "steps" ? " (steps: stair only)" : " (rows, columns: portico only)"}`);
    }
  }
  // stair: an optional stepped profile. The direction of ascent is a side; without `stair` the piece is a plain box.
  if (record.stair !== undefined) {
    const stair = c.object(record, "stair", "stair");
    if (stair) {
      if (record.kind !== "stair") c.add("stair", "TYPE_MISMATCH", "stair is only allowed on a stair record");
      for (const key of Object.keys(stair)) if (key !== "ascends") c.add(join("stair", key), "TYPE_MISMATCH", `${join("stair", key)} is not allowed (ascends)`);
      c.enumValue(stair, "ascends", "stair.ascends", PLACEMENT_SIDES);
      if (countObject.steps === undefined) c.add("counts.steps", "FIELD_REQUIRED", "a stepped stair needs counts.steps");
    }
  } else if (record.kind === "stair" && countObject.steps !== undefined) {
    c.add("stair", "FIELD_REQUIRED", "counts.steps needs stair.ascends (the side the stair rises toward)");
  }

  // ---- outline (TASK-6-34): an irregular quadrilateral footprint for some options of an alternative group ----
  if (record.outline !== undefined) {
    const path = "outline";
    const outline = c.object(record, "outline", path);
    if (outline) {
      for (const key of Object.keys(outline)) {
        if (!OUTLINE_KEYS.has(key)) c.add(join(path, key), "TYPE_MISMATCH", `${join(path, key)} is not allowed on an outline (alternativeGroupId, byOption)`);
      }
      if (record.kind !== "platform") c.add(path, "TYPE_MISMATCH", "outline is only allowed on a platform record");
      const groupPath = join(path, "alternativeGroupId");
      const groupId = c.refId(outline, "alternativeGroupId", groupPath, ID_PREFIXES.alternative_group,
        "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
      if (groupId !== null && !listedGroups.has(groupId)) {
        c.add(groupPath, "GEOMETRY_REF_UNLISTED", `${groupPath} ${groupId} must also be listed in alternatives[].groupId`);
      }
      const byOption = c.object(outline, "byOption", join(path, "byOption"));
      const group = groupId !== null && refs?.alternativeGroups ? refGet(refs.alternativeGroups, groupId) : undefined;
      const known = isObject(group) && Array.isArray(group.options) ? new Set(group.options.map((option) => option?.id)) : null;
      for (const optionId of byOption ? Object.keys(byOption) : []) {
        const optionPath = join(join(path, "byOption"), optionId);
        if (!/^alt-[a-z0-9]+(-[a-z0-9]+)*$/.test(optionId)) c.add(optionPath, "ID_FORMAT", `${optionPath}: option keys must be alt- ids`);
        if (known && !known.has(optionId)) c.add(optionPath, "REF_UNKNOWN_ALTERNATIVE", `${optionId} is not an option of ${groupId}`);
        const entry = c.object(byOption, optionId, optionPath);
        if (!entry) continue;
        for (const key of Object.keys(entry)) {
          if (!OUTLINE_OPTION_KEYS.has(key)) c.add(join(optionPath, key), "TYPE_MISMATCH", `${join(optionPath, key)} is not allowed (shape, sides, construction)`);
        }
        if (entry.shape !== "quadrilateral") c.add(join(optionPath, "shape"), "ENUM_INVALID", `${join(optionPath, "shape")} must be "quadrilateral"`);
        c.bilingual(entry, "construction", join(optionPath, "construction"));
        const sides = c.object(entry, "sides", join(optionPath, "sides"));
        if (sides) {
          for (const key of Object.keys(sides)) {
            if (!OUTLINE_SIDES.includes(key)) c.add(join(join(optionPath, "sides"), key), "ENUM_INVALID", `outline sides are ${OUTLINE_SIDES.join("|")}`);
          }
          for (const side of OUTLINE_SIDES) lengthValue(sides[side], join(join(optionPath, "sides"), side), { allowAlternative: false });
        }
        // The axis-aligned bounding box (length × width) of an outlined option is a derived number: speculative, in metres.
        for (const key of ["length", "width"]) {
          const value = isObject(record.dimensions?.[key]?.byOption) ? record.dimensions[key].byOption[optionId] : undefined;
          if (!isObject(value) || value.speculative !== true || value.unit !== "metre") {
            c.add(join("dimensions", key), "FIELD_REQUIRED",
              `dimensions.${key}.byOption.${optionId} must be a speculative value in metres: the bounding box of the outline for that option`);
          }
        }
      }
    }
  }

  // ---- appliesTo (TASK-6-44): draw the piece only when the selected option of a group is in the list ----
  if (record.appliesTo !== undefined) {
    const path = "appliesTo";
    const applies = c.object(record, "appliesTo", path);
    if (applies) {
      for (const key of Object.keys(applies)) {
        if (key !== "groupId" && key !== "optionIds") c.add(join(path, key), "TYPE_MISMATCH", `${join(path, key)} is not allowed on appliesTo (groupId, optionIds)`);
      }
      const groupPath = join(path, "groupId");
      const groupId = c.refId(applies, "groupId", groupPath, ID_PREFIXES.alternative_group,
        "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
      if (groupId !== null && !listedGroups.has(groupId)) {
        c.add(groupPath, "GEOMETRY_REF_UNLISTED", `${groupPath} ${groupId} must also be listed in alternatives[].groupId`);
      }
      const optionIds = c.array(applies, "optionIds", join(path, "optionIds"));
      const group = groupId !== null && refs?.alternativeGroups ? refGet(refs.alternativeGroups, groupId) : undefined;
      const known = isObject(group) && Array.isArray(group.options) ? new Set(group.options.map((option) => option?.id)) : null;
      if (optionIds && optionIds.length === 0) c.add(join(path, "optionIds"), "FIELD_REQUIRED", `${join(path, "optionIds")} must list at least one option`);
      const seen = new Set();
      optionIds?.forEach((optionId, index) => {
        const optionPath = at(join(path, "optionIds"), index);
        if (typeof optionId !== "string" || !/^alt-[a-z0-9]+(-[a-z0-9]+)*$/.test(optionId)) { c.add(optionPath, typeof optionId === "string" ? "ID_FORMAT" : "TYPE_MISMATCH", `${optionPath} must be an alt- option id`); return; }
        if (seen.has(optionId)) c.add(optionPath, "ID_DUPLICATE", `${optionPath} repeats ${JSON.stringify(optionId)}`);
        seen.add(optionId);
        if (known && !known.has(optionId)) c.add(optionPath, "REF_UNKNOWN_ALTERNATIVE", `${optionId} is not an option of ${groupId}`);
      });
    }
  }

  // ---- comparison-only evidence may not appear anywhere on a geometry record ----
  if (refs?.evidence) {
    (Array.isArray(record.evidenceIds) ? record.evidenceIds : []).forEach((id, index) => {
      const evidence = refGet(refs.evidence, id);
      if (isObject(evidence) && (evidence.useScope === "comparison_only" || evidence.sourceType === "prophetic_vision")) {
        c.add(at("evidenceIds", index), "GEOMETRY_EVIDENCE_UNSUITABLE",
          `${id} is comparison_only (${evidence.sourceType}); it may be shown as a comparison but never shapes Herodian geometry`);
      }
    });
  }
  return c.result();
}

function checkEvidenceId(value, path, c) {
  if (value === undefined || value === null) return [worldDiagnostic({ recordId: c.recordId, path, code: "FIELD_REQUIRED", message: `${path} is required`, file: c.options.file })];
  if (typeof value !== "string" || !/^ev-[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    return [worldDiagnostic({ recordId: c.recordId, path, code: typeof value === "string" ? "ID_FORMAT" : "TYPE_MISMATCH",
      message: `${path} must be an ev- id, got ${typeof value === "string" ? JSON.stringify(value) : typeName(value)}`, file: c.options.file })];
  }
  return [];
}

/**
 * Collection-level check: parentId and placement.of must form no cycle (the solver resolves pieces in dependency
 * order). Returns one GEOMETRY_CYCLE diagnostic per record on a cycle.
 * @param {object[]} records geometry records (ideally already individually valid)
 * @param {{ file?: (record) => string|undefined }} [options]
 * @returns {object[]}
 */
export function findGeometryCycles(records, { file = () => undefined } = {}) {
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) if (isObject(record) && typeof record.id === "string" && !byId.has(record.id)) byId.set(record.id, record);
  const targets = (record) => [record.parentId, record.placement?.of].filter((id) => typeof id === "string" && byId.has(id));
  const state = new Map(); // id → 1 visiting, 2 done
  const onCycle = new Set();
  const visit = (id, stack) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of targets(byId.get(id))) {
      if (state.get(next) === 1) for (const member of stack.slice(stack.indexOf(next))) onCycle.add(member);
      else if (!state.has(next)) visit(next, stack);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of [...byId.keys()].sort()) if (!state.has(id)) visit(id, []);
  return [...onCycle].sort().map((id) => {
    const record = byId.get(id);
    const where = file(record);
    return worldDiagnostic({ recordId: id, path: record.placement?.of && onCycle.has(record.placement.of) ? "placement.of" : "parentId",
      code: "GEOMETRY_CYCLE", message: `${id} is on a parentId/placement.of cycle; the solver needs an acyclic placement graph`, ...(where ? { file: where } : {}) });
  });
}
