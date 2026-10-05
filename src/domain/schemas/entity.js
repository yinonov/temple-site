// Entity record v1 (§2.5). Pure ESM, no I/O.
import { ID_PREFIXES, collector, isObject, join, rootNotObject } from "./common.js";

export const ENTITY_SCHEMA_VERSION = 1;
export const ENTITY_KINDS = Object.freeze(new Set(["role_instance", "group", "named_person"]));
export const COUNT_KINDS = Object.freeze(new Set(["unspecified", "exact", "range"]));

const isCount = (value) => Number.isInteger(value) && value >= 1;

/**
 * Validate one entity record. An entity holds exactly one role (`roleId`); see the
 * mutually-exclusive-roles rule in docs/contracts/world-data.md.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateEntity(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "entity record", context.file);
  const c = collector(record, context);
  c.header(ENTITY_SCHEMA_VERSION, ID_PREFIXES.entity);
  c.enumValue(record, "kind", "kind", ENTITY_KINDS);
  c.refId(record, "roleId", "roleId", ID_PREFIXES.role, "roleIds", "REF_UNKNOWN_ROLE", "role");
  c.bilingual(record, "label", "label");

  const count = c.object(record, "count", "count");
  if (!count) return c.result();
  const kind = c.enumValue(count, "kind", "count.kind", COUNT_KINDS);
  const number = (key) => {
    const path = join("count", key);
    if (count[key] === undefined || count[key] === null) { c.add(path, "FIELD_REQUIRED", `${path} is required when count.kind is ${kind}`); return null; }
    if (!isCount(count[key])) { c.add(path, "TYPE_MISMATCH", `${path} must be a positive integer, got ${JSON.stringify(count[key])}`); return null; }
    return count[key];
  };
  const forbid = (keys) => {
    for (const key of keys) {
      if (count[key] !== undefined) c.add(join("count", key), "TYPE_MISMATCH", `count.${key} is not allowed when count.kind is ${kind}`);
    }
  };
  if (kind === "unspecified") forbid(["value", "min", "max"]);
  if (kind === "exact") { number("value"); forbid(["min", "max"]); }
  if (kind === "range") {
    const min = number("min");
    const max = number("max");
    forbid(["value"]);
    if (min !== null && max !== null && min >= max) c.add("count", "TYPE_MISMATCH", `count.min must be less than count.max, got ${min}..${max}`);
  }
  return c.result();
}
