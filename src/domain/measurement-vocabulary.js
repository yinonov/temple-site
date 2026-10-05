// Measurement and placement vocabulary shared by evidence records and geometry records (TASK-6-10/6-11;
// .planning/STRATEGY-2026-10.md §4, §6; docs/contracts/evidence-record.md, docs/contracts/world-data.md).
// Pure ESM, no I/O, no imports: evidence-schema.js and schemas/geometry.js both read these sets.
//
// Nothing here is a historical claim. The unit names are vocabulary only; how long an amah was is an open question
// recorded as an alternative group (UNIT_CONVERSION_GROUPS), never as a constant in code.

const freezeSet = (values) => Object.freeze(new Set(values));

/** What a `measurement` evidence record measures. `thickness` is for walls and barriers. */
export const MEASUREMENT_QUANTITIES = freezeSet(["length", "width", "height", "thickness", "area", "count"]);

/**
 * Length units. Rabbinic: amah, tefach, etzba; kaneh (the measuring reed of Ezekiel 40:5 — comparison sources only
 * in practice). Greek (Josephus): cubit_greek (pēchys), pous, plethron, stadion. Modern: metre, centimetre.
 */
export const LENGTH_UNITS = freezeSet([
  "amah", "tefach", "etzba", "kaneh", "cubit_greek", "pous", "plethron", "stadion", "metre", "centimetre"
]);
export const AREA_UNITS = freezeSet(["amah_sq", "metre_sq"]);
export const COUNT_UNITS = freezeSet(["item"]);
export const MEASUREMENT_UNITS = freezeSet([...LENGTH_UNITS, ...AREA_UNITS, ...COUNT_UNITS]);

/** The unit family a quantity must use. */
export function unitsForQuantity(quantity) {
  if (quantity === "area") return AREA_UNITS;
  if (quantity === "count") return COUNT_UNITS;
  return LENGTH_UNITS;
}

/** Relative placement relations (evidence `placement.relation` and geometry `placement.relation`). */
export const PLACEMENT_RELATIONS = freezeSet([
  "inside", "centered_on", "east_of", "west_of", "north_of", "south_of", "adjoins"
]);
/** Optional side an `inside`/`adjoins` placement is measured from. */
export const PLACEMENT_SIDES = freezeSet(["east", "west", "north", "south"]);

/**
 * Record-level `useScope` values. `comparison_only`: the record may be shown as a comparison, never used as a
 * dimension or placement source for the Herodian build. Required on every `prophetic_vision` record.
 */
export const USE_SCOPES = freezeSet(["comparison_only"]);

/** Source types whose records must carry `useScope: "comparison_only"`. */
export const COMPARISON_ONLY_SOURCE_TYPES = freezeSet(["prophetic_vision"]);

/**
 * Source types whose supporting source may be a summary (no quotation required). Their proposedCertainty is capped
 * at MODERN_RECONSTRUCTION_MAX_CERTAINTY.
 */
export const SUMMARY_SUFFICIENT_SOURCE_TYPES = freezeSet(["modern_reconstruction"]);
export const MODERN_RECONSTRUCTION_ALLOWED_CERTAINTY = freezeSet(["reconstructed", "speculative"]);

/**
 * Units whose metric length is an open question, resolved only through a visitor-visible alternative group
 * (TASK-6-11; tefach, cubit_greek, stadion added by TASK-6-17b). Each option of such a group carries exactly one
 * conversion key from UNIT_CONVERSION_KEYS[unit]. The solver never assumes a value.
 */
export const UNIT_CONVERSION_GROUPS = Object.freeze({
  amah: "altgrp-amah-length",
  tefach: "altgrp-tefach-per-amah",
  cubit_greek: "altgrp-josephus-cubit",
  stadion: "altgrp-stadion-length"
});

/**
 * Option keys that express a conversion, and what they mean:
 * - `metres`: metres per one unit.
 * - `tefachPerAmah`: how many tefachim make one amah (one tefach = amah / value).
 * - `amahPerCubit`: how many amot make one cubit (one cubit = amah × value).
 * Keys based on the amah resolve through the visitor's `altgrp-amah-length` option.
 */
export const CONVERSION_OPTION_KEYS = Object.freeze({
  metres: Object.freeze({ base: "metre", operation: "multiply" }),
  tefachPerAmah: Object.freeze({ base: "amah", operation: "divide" }),
  amahPerCubit: Object.freeze({ base: "amah", operation: "multiply" })
});

/** Conversion keys allowed on the options of each unit's conversion group (exactly one per option). */
export const UNIT_CONVERSION_KEYS = Object.freeze({
  amah: Object.freeze(["metres"]),
  tefach: Object.freeze(["tefachPerAmah", "metres"]),
  cubit_greek: Object.freeze(["amahPerCubit", "metres"]),
  stadion: Object.freeze(["metres"])
});

/** Units with a fixed, non-historical metric factor (modern units only). */
export const FIXED_METRES_PER_UNIT = Object.freeze({ metre: 1, centimetre: 0.01 });

/** `web` locator: a dated, titled URL for summary-only modern sources. */
export const WEB_URL_PATTERN = /^https?:\/\/[^\s]+$/;
