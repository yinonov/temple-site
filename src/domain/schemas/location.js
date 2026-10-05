// Location record v1 (§2.5). Pure ESM, no I/O.
import { ID_PREFIXES, at, collector, isObject, join, rootNotObject } from "./common.js";

export const LOCATION_SCHEMA_VERSION = 1;
export const LOCATION_KINDS = Object.freeze(new Set(["chamber", "court", "gate", "structure", "passage"]));
export const SPATIAL_STATUSES = Object.freeze(new Set(["unplaced", "topological", "schematic"]));

/**
 * Validate one location record.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 * @returns {object[]} sorted diagnostics; empty when valid
 */
export function validateLocation(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "location record", context.file);
  const c = collector(record, context);
  c.header(LOCATION_SCHEMA_VERSION, ID_PREFIXES.location);
  c.bilingual(record, "name", "name");
  c.enumValue(record, "kind", "kind", LOCATION_KINDS);

  if (record.parentId === undefined) {
    c.add("parentId", "FIELD_REQUIRED", "parentId is required (use null for a top-level location)");
  } else if (record.parentId !== null) {
    const parentId = c.refId(record, "parentId", "parentId", ID_PREFIXES.location, "locationIds", "REF_UNKNOWN_LOCATION", "location");
    if (parentId !== null && parentId === record.id) c.add("parentId", "REF_UNKNOWN_LOCATION", "parentId must not reference the location itself");
  }

  const spatial = c.object(record, "spatial", "spatial");
  if (!spatial) return c.result();
  const status = c.enumValue(spatial, "status", "spatial.status", SPATIAL_STATUSES);

  if (status === "topological" || spatial.topologyEdges !== undefined) {
    const edges = c.array(spatial, "topologyEdges", "spatial.topologyEdges", {
      optional: status !== "topological", minLength: status === "topological" ? 1 : 0
    });
    edges?.forEach((edge, index) => {
      const path = at("spatial.topologyEdges", index);
      if (!isObject(edge)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
      const to = c.refId(edge, "toLocationId", join(path, "toLocationId"), ID_PREFIXES.location, "locationIds", "REF_UNKNOWN_LOCATION", "location");
      if (to !== null && to === record.id) c.add(join(path, "toLocationId"), "REF_UNKNOWN_LOCATION", "a topology edge must not point at its own location");
      c.bilingual(edge, "via", join(path, "via"));
      c.evidenceIds(edge, "evidenceIds", join(path, "evidenceIds"), { minLength: 1 });
    });
  }

  if (status === "schematic" || spatial.schematic !== undefined) {
    const schematic = c.object(spatial, "schematic", "spatial.schematic", { optional: status !== "schematic" });
    if (schematic) {
      for (const key of ["x", "y", "w", "h"]) {
        const path = join("spatial.schematic", key);
        const value = schematic[key];
        if (value === undefined || value === null) c.add(path, "FIELD_REQUIRED", `${path} is required`);
        else if (typeof value !== "number" || !Number.isFinite(value)) c.add(path, "TYPE_MISMATCH", `${path} must be a finite number`);
        else if ((key === "w" || key === "h") && value <= 0) c.add(path, "TYPE_MISMATCH", `${path} must be greater than 0`);
      }
      c.enumValue(schematic, "certainty", "spatial.schematic.certainty", ["speculative"]);
      c.string(schematic, "note", "spatial.schematic.note");
    }
  }
  return c.result();
}
