// Anchor record v1 (§2.5, §5). A relative anchor with no clock resolution.
// Pure ESM, no I/O.
import { ID_PREFIXES, collector, isObject, rootNotObject } from "./common.js";

export const ANCHOR_SCHEMA_VERSION = 1;

/**
 * Validate one anchor record. `clockResolution` must be null in v1: no clock evidence
 * is approved, and converting a relative anchor to minutes would invent precision.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateAnchor(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "anchor record", context.file);
  const c = collector(record, context);
  c.header(ANCHOR_SCHEMA_VERSION, ID_PREFIXES.anchor);
  c.bilingual(record, "label", "label");
  if (record.clockResolution === undefined) {
    c.add("clockResolution", "FIELD_REQUIRED", "clockResolution is required and must be null in anchor v1");
  } else if (record.clockResolution !== null) {
    c.add("clockResolution", "CLOCK_TIMING_UNAPPROVED", "clockResolution must be null in anchor v1; no clock evidence is approved");
  }
  if (record.alternativeGroupId === undefined) {
    c.add("alternativeGroupId", "FIELD_REQUIRED", "alternativeGroupId is required (use null when the anchor is undisputed)");
  } else if (record.alternativeGroupId !== null) {
    c.refId(record, "alternativeGroupId", "alternativeGroupId", ID_PREFIXES.alternative_group,
      "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group");
  }
  return c.result();
}
