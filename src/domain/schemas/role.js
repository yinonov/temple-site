// Role record v1 (§2.5). Pure ESM, no I/O.
import { ID_PREFIXES, collector, isObject, rootNotObject } from "./common.js";

export const ROLE_SCHEMA_VERSION = 1;

/**
 * Validate one role record.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateRole(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "role record", context.file);
  const c = collector(record, context);
  c.header(ROLE_SCHEMA_VERSION, ID_PREFIXES.role);
  c.bilingual(record, "name", "name");
  c.bilingual(record, "description", "description");
  return c.result();
}
