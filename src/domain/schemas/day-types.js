// Day-type definitions v1 (TASK-5-08, R-10). Pure ESM, no I/O.
// data/world/day-types.json defines each day-type id used by event `applicability.dayTypes` (and the query-only
// value "unspecified") as a *project viewing category*, with its relation to source categories. A source term is
// never written here as free text: each `sourceTerm` must be found in a quotation excerpt of the cited evidence
// record, so every source wording is reached through an evidence id. Contract: docs/contracts/world-data.md.
import { DAY_TYPES } from "../evidence-schema.js";
import { normalizeForMatch } from "../quote-verify.js";
import { ID_PREFIXES, at, collector, isObject, join, refGet, rootNotObject } from "./common.js";

export const DAY_TYPES_SCHEMA_VERSION = 1;
/** Self-identifying `kind` of the file, so loaders can route it without knowing its path. */
export const DAY_TYPE_DEFINITIONS_KIND = "day_type_definitions";
/** Query-only value: the visitor has not chosen a day type (never an event applicability value). */
export const QUERY_ONLY_DAY_TYPES = Object.freeze(["unspecified"]);
/** Every day-type id the file must define, in display order. */
export const DEFINED_DAY_TYPES = Object.freeze([...DAY_TYPES, ...QUERY_ONLY_DAY_TYPES]);
export const DAY_TYPE_USAGES = Object.freeze(new Set(["event_and_query", "query_only"]));
/** Only a provisional status exists until a decision target kind for day types is added (owner decision). */
export const DAY_TYPE_STATUSES = Object.freeze(new Set(["provisional_owner_decision"]));
/**
 * How the project category relates to a source category:
 *   defined_from — the project category is named after this source category (its extent may still differ; say how);
 *   excludes — the project category leaves out the days of this source category;
 *   overlaps_undetermined — the two overlap, and how far is not determined.
 */
export const SOURCE_CATEGORY_RELATIONS = Object.freeze(new Set(["defined_from", "excludes", "overlaps_undetermined"]));

const quotationExcerpts = (evidence) => (Array.isArray(evidence?.sources) ? evidence.sources : [])
  .filter((source) => isObject(source) && source.excerptRole === "quotation" && typeof source.excerpt === "string")
  .map((source) => source.excerpt);

/**
 * Validate the day-type definitions file.
 * @param {unknown} file parsed data/world/day-types.json
 * @param {{ evidenceById?: Map<string, object>|object, file?: string }} [context]
 *   With `evidenceById`, each evidenceId must resolve and each sourceTerm must occur in one of that record's
 *   quotation excerpts (niqqud ignored).
 * @returns {object[]} Diagnostic[]
 */
export function validateDayTypes(file, context = {}) {
  if (!isObject(file)) return rootNotObject(file, "day-type definitions", context.file);
  const c = collector(file, { file: context.file, allowSynthetic: true });
  const evidenceById = context.evidenceById ?? null;
  c.schemaVersion(file, DAY_TYPES_SCHEMA_VERSION);
  c.enumValue(file, "kind", "kind", new Set([DAY_TYPE_DEFINITIONS_KIND]));
  const records = c.array(file, "records", "records", { minLength: 1 });
  if (!records) return c.result();

  const seen = new Set();
  records.forEach((record, index) => {
    const path = at("records", index);
    if (!isObject(record)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const id = c.string(record, "id", join(path, "id"));
    if (id !== null) {
      if (!DEFINED_DAY_TYPES.includes(id)) {
        c.add(join(path, "id"), "ENUM_INVALID", `${path}.id must be one of ${DEFINED_DAY_TYPES.join("|")}, got ${JSON.stringify(id)}`);
      } else if (seen.has(id)) {
        c.add(join(path, "id"), "ID_DUPLICATE", `${path}.id repeats day type ${JSON.stringify(id)}`);
      }
      seen.add(id);
    }
    const usage = c.enumValue(record, "usage", join(path, "usage"), DAY_TYPE_USAGES);
    if (usage !== null && id !== null && DEFINED_DAY_TYPES.includes(id)) {
      const expected = QUERY_ONLY_DAY_TYPES.includes(id) ? "query_only" : "event_and_query";
      if (usage !== expected) c.add(join(path, "usage"), "ENUM_INVALID", `${path}.usage for ${id} must be ${JSON.stringify(expected)}`);
    }
    c.enumValue(record, "status", join(path, "status"), DAY_TYPE_STATUSES);
    c.bilingual(record, "label", join(path, "label"));
    c.bilingual(record, "definition", join(path, "definition"));

    const categories = c.array(record, "sourceCategories", join(path, "sourceCategories"));
    categories?.forEach((category, j) => {
      const catPath = at(join(path, "sourceCategories"), j);
      if (!isObject(category)) { c.add(catPath, "TYPE_MISMATCH", `${catPath} must be an object`); return; }
      const evidenceId = c.id(category, "evidenceId", join(catPath, "evidenceId"), ID_PREFIXES.evidence);
      const term = c.string(category, "sourceTerm", join(catPath, "sourceTerm"));
      c.enumValue(category, "relation", join(catPath, "relation"), SOURCE_CATEGORY_RELATIONS);
      c.bilingual(category, "explanation", join(catPath, "explanation"));
      if (evidenceId === null || evidenceById === null) return;
      const evidence = refGet(evidenceById, evidenceId);
      if (evidence === undefined) {
        c.add(join(catPath, "evidenceId"), "REF_UNKNOWN_EVIDENCE", `${catPath}.evidenceId references unknown evidence record ${JSON.stringify(evidenceId)}`);
        return;
      }
      if (term === null) return;
      const needle = normalizeForMatch(term, { ignoreNiqqud: true });
      const found = quotationExcerpts(evidence).some((excerpt) => normalizeForMatch(excerpt, { ignoreNiqqud: true }).includes(needle));
      if (!found) {
        c.add(join(catPath, "sourceTerm"), "QUOTE_NOT_FOUND", `${catPath}.sourceTerm is not found in any quotation excerpt of ${evidenceId}`);
      }
    });
  });
  for (const id of DEFINED_DAY_TYPES) {
    if (!seen.has(id)) c.add("records", "FIELD_REQUIRED", `records must define day type ${JSON.stringify(id)}`);
  }
  return c.result();
}
