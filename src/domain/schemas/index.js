// Registry of versioned world-record schemas (§2.5). Pure ESM, no I/O.
// Keys match decision-record target kinds (§2.4).
import { ID_PREFIXES } from "./common.js";
import { LOCATION_SCHEMA_VERSION, validateLocation } from "./location.js";
import { ROLE_SCHEMA_VERSION, validateRole } from "./role.js";
import { ENTITY_SCHEMA_VERSION, validateEntity } from "./entity.js";
import { ACCESS_POLICY_SCHEMA_VERSION, validateAccessPolicy } from "./access-policy.js";
import { SEQUENCE_SCHEMA_VERSION, validateSequence } from "./sequence.js";
import { ANCHOR_SCHEMA_VERSION, validateAnchor } from "./anchor.js";
import { ALTERNATIVE_GROUP_SCHEMA_VERSION, validateAlternativeGroup } from "./alternative-group.js";
import { EVENT_SCHEMA_VERSION, validateEvent } from "./event.js";
import { GEOMETRY_SCHEMA_VERSION, validateGeometry } from "./geometry.js";

const entry = (version, prefix, validate) => Object.freeze({ version, prefix, validate });

/** record kind → { version, prefix, validate(record, context?) → Diagnostic[] } */
export const SCHEMAS = Object.freeze({
  location: entry(LOCATION_SCHEMA_VERSION, ID_PREFIXES.location, validateLocation),
  role: entry(ROLE_SCHEMA_VERSION, ID_PREFIXES.role, validateRole),
  entity: entry(ENTITY_SCHEMA_VERSION, ID_PREFIXES.entity, validateEntity),
  access_policy: entry(ACCESS_POLICY_SCHEMA_VERSION, ID_PREFIXES.access_policy, validateAccessPolicy),
  sequence: entry(SEQUENCE_SCHEMA_VERSION, ID_PREFIXES.sequence, validateSequence),
  anchor: entry(ANCHOR_SCHEMA_VERSION, ID_PREFIXES.anchor, validateAnchor),
  alternative_group: entry(ALTERNATIVE_GROUP_SCHEMA_VERSION, ID_PREFIXES.alternative_group, validateAlternativeGroup),
  event: entry(EVENT_SCHEMA_VERSION, ID_PREFIXES.event, validateEvent),
  geometry: entry(GEOMETRY_SCHEMA_VERSION, ID_PREFIXES.geometry, validateGeometry)
});

// Day-type definitions are a viewing vocabulary file, not a record kind or decision target (TASK-5-08).
export { DAY_TYPES_SCHEMA_VERSION, DEFINED_DAY_TYPES, validateDayTypes } from "./day-types.js";
export {
  validateLocation, validateRole, validateEntity, validateAccessPolicy,
  validateSequence, validateAnchor, validateAlternativeGroup, validateEvent, validateGeometry
};
export { GEOMETRY_KINDS, DIMENSION_KEYS, findGeometryCycles } from "./geometry.js";
export {
  ID_PATTERN, ID_PREFIXES, EVENT_DAY_TYPES, WORLD_SCHEMA_CODES, worldDiagnostic,
  checkIdFormat, checkPrefixedId, checkBilingual, checkSchemaVersion, checkEnum, checkCertainty, isRecordId
} from "./common.js";
