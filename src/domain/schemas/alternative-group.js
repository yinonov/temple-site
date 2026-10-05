// Alternative group v1 (§2.5, TASK-1-04): mutually exclusive readings kept side by side.
// Pure ESM, no I/O.
import { ID_PREFIXES, at, collector, isObject, join, rootNotObject } from "./common.js";
import { CONVERSION_OPTION_KEYS, UNIT_CONVERSION_GROUPS, UNIT_CONVERSION_KEYS } from "../measurement-vocabulary.js";

/**
 * Unit-conversion groups (e.g. altgrp-amah-length, altgrp-tefach-per-amah): group id → conversion keys its options
 * may use. Each option must carry exactly one of them (TASK-6-11, TASK-6-17b).
 */
const UNIT_GROUP_KEYS = new Map(Object.entries(UNIT_CONVERSION_GROUPS).map(([unit, groupId]) => [groupId, UNIT_CONVERSION_KEYS[unit] ?? ["metres"]]));
const ALL_CONVERSION_KEYS = Object.keys(CONVERSION_OPTION_KEYS);

export const ALTERNATIVE_GROUP_SCHEMA_VERSION = 1;
export const SELECTION_POLICIES = Object.freeze(new Set(["visitor_selectable", "show_all"]));

/**
 * Validate one alternative group.
 * `defaultOptionId` must be null unless `context.approvedAlternativeDefaults[groupId]`
 * (built by the importer from current, approved, human decision records) names the
 * same option. Otherwise → ALTERNATIVE_DEFAULT_UNAPPROVED.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string,
 *           approvedAlternativeDefaults?: Record<string, string|null> }} context
 */
export function validateAlternativeGroup(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "alternative group record", context.file);
  const c = collector(record, context);
  c.header(ALTERNATIVE_GROUP_SCHEMA_VERSION, ID_PREFIXES.alternative_group);
  c.bilingual(record, "question", "question");
  if (record.caveat !== undefined) c.bilingual(record, "caveat", "caveat");
  // supersededBy is an informational pointer: a target that is not in the loaded set (e.g. unpublished after an edit) is a warning, not an error (TASK-6-39).
  // Optional geometry scope (TASK-6-38, M2-05): marks a group that draws nothing, or whose drawing is taken over by another group.
  if (record.geometryScope !== undefined) {
    const scope = record.geometryScope;
    if (!isObject(scope)) {
      c.add("geometryScope", "TYPE_MISMATCH", "geometryScope must be an object { affectsGeometry, supersededBy?, note }");
    } else {
      for (const key of Object.keys(scope)) {
        if (!["affectsGeometry", "supersededBy", "note"].includes(key)) c.add(join("geometryScope", key), "TYPE_MISMATCH", `geometryScope.${key} is not allowed (affectsGeometry, supersededBy, note)`);
      }
      if (typeof scope.affectsGeometry !== "boolean") c.add("geometryScope.affectsGeometry", "TYPE_MISMATCH", "geometryScope.affectsGeometry must be a boolean");
      if (scope.supersededBy !== undefined) {
        const target = c.refId(scope, "supersededBy", "geometryScope.supersededBy", ID_PREFIXES.alternative_group, "alternativeGroupIds", "REF_UNKNOWN_ALTERNATIVE", "alternative group", "warning");
        if (target !== null && target === record.id) c.add("geometryScope.supersededBy", "TYPE_MISMATCH", "a group cannot supersede itself");
        if (scope.affectsGeometry === true) c.add("geometryScope.supersededBy", "TYPE_MISMATCH", "supersededBy requires affectsGeometry: false");
      }
      c.bilingual(scope, "note", "geometryScope.note");
    }
  }
  c.enumValue(record, "selectionPolicy", "selectionPolicy", SELECTION_POLICIES);

  const optionIds = new Set();
  // A dispute needs at least two readings; a unit-conversion group may record a single attested conversion,
  // so that the number still carries its source instead of becoming a constant in code.
  const minOptions = UNIT_GROUP_KEYS.has(record.id) ? 1 : 2;
  const options = c.array(record, "options", "options", { minLength: minOptions });
  options?.forEach((option, index) => {
    const path = at("options", index);
    if (!isObject(option)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    const optionId = c.id(option, "id", join(path, "id"), ID_PREFIXES.alternative_option);
    if (optionId !== null) {
      if (optionIds.has(optionId)) c.add(join(path, "id"), "ID_DUPLICATE", `${path}.id repeats option id ${JSON.stringify(optionId)}`);
      optionIds.add(optionId);
    }
    c.bilingual(option, "label", join(path, "label"));
    c.evidenceIds(option, "evidenceIds", join(path, "evidenceIds"));
    c.bilingual(option, "effect", join(path, "effect"));
    // Conversion keys (TASK-6-11 `metres`; TASK-6-17b `tefachPerAmah`, `amahPerCubit`): finite numbers > 0.
    // Outside unit-conversion groups they are optional; in a unit group exactly one of the group's keys is required.
    const present = ALL_CONVERSION_KEYS.filter((key) => option[key] !== undefined && option[key] !== null);
    for (const key of present) {
      const keyPath = join(path, key);
      if (typeof option[key] !== "number" || !Number.isFinite(option[key]) || option[key] <= 0) {
        c.add(keyPath, "TYPE_MISMATCH", `${keyPath} must be a finite number greater than 0`);
      }
    }
    const allowed = UNIT_GROUP_KEYS.get(record.id);
    if (allowed) {
      for (const key of present.filter((k) => !allowed.includes(k))) {
        c.add(join(path, key), "TYPE_MISMATCH", `${join(path, key)} is not a conversion key of ${record.id}; use ${allowed.join("|")}`);
      }
      const used = present.filter((k) => allowed.includes(k));
      if (used.length === 0) {
        const keyPath = allowed.length === 1 ? join(path, allowed[0]) : path;
        c.add(keyPath, "FIELD_REQUIRED", `${keyPath}: ${allowed.join(" or ")} is required in the unit-conversion group ${record.id}`);
      } else if (used.length > 1) {
        c.add(path, "TYPE_MISMATCH", `${path} must use exactly one conversion key (${allowed.join("|")}), found ${used.join(", ")}`);
      }
    }
  });

  if (record.defaultOptionId === undefined) {
    c.add("defaultOptionId", "FIELD_REQUIRED", "defaultOptionId is required (null unless a human decision approved a default)");
  } else if (record.defaultOptionId !== null) {
    const defaultId = c.id(record, "defaultOptionId", "defaultOptionId", ID_PREFIXES.alternative_option);
    if (defaultId !== null) {
      if (options && !optionIds.has(defaultId)) {
        c.add("defaultOptionId", "REF_UNKNOWN_ALTERNATIVE", `defaultOptionId ${JSON.stringify(defaultId)} is not one of this group's options`);
      }
      const approved = context.approvedAlternativeDefaults;
      const approvedHere = isObject(approved) && Object.hasOwn(approved, record.id) && approved[record.id] === defaultId;
      if (!approvedHere) {
        c.add("defaultOptionId", "ALTERNATIVE_DEFAULT_UNAPPROVED",
          `defaultOptionId must be null unless a human decision record approves ${JSON.stringify(defaultId)} as the default`);
      }
    }
  }
  return c.result();
}
