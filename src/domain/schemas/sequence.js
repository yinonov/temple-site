// Sequence record v1 (§2.5, D7). Steps are an ordinal order, never clock time.
// Pure ESM, no I/O.
import { ID_PREFIXES, at, collector, isObject, join, rootNotObject } from "./common.js";

export const SEQUENCE_SCHEMA_VERSION = 1;

/**
 * Validate one sequence record. `steps[i].step` must equal `i` (0-based, contiguous),
 * so an event's half-open `[startStep, endStep)` indexes steps directly.
 * @param {unknown} record
 * @param {{ refs?: object, allowSynthetic?: boolean, file?: string }} context
 */
export function validateSequence(record, context = {}) {
  if (!isObject(record)) return rootNotObject(record, "sequence record", context.file);
  const c = collector(record, context);
  c.header(SEQUENCE_SCHEMA_VERSION, ID_PREFIXES.sequence);
  c.bilingual(record, "name", "name");
  const steps = c.array(record, "steps", "steps", { minLength: 1 });
  steps?.forEach((step, index) => {
    const path = at("steps", index);
    if (!isObject(step)) { c.add(path, "TYPE_MISMATCH", `${path} must be an object`); return; }
    if (step.step === undefined || step.step === null) c.add(join(path, "step"), "FIELD_REQUIRED", `${path}.step is required`);
    else if (step.step !== index) {
      c.add(join(path, "step"), "SEQUENCE_STEP_INVALID", `${path}.step must equal its 0-based position ${index}, got ${JSON.stringify(step.step)}`);
    }
    c.bilingual(step, "label", join(path, "label"));
    c.evidenceIds(step, "evidenceIds", join(path, "evidenceIds"), { minLength: 1 });
  });
  c.evidenceIds(record, "orderEvidenceIds", "orderEvidenceIds", { minLength: 1 });
  c.bilingual(record, "orderNote", "orderNote");
  // Optional visible qualifier on the sequence as a whole (TASK-5-08, R-11), e.g. which historical stage of a
  // practice the order describes. Additive in v1; the UI shows it uncollapsed under the sequence name.
  if (record.stageNote !== undefined && record.stageNote !== null) c.bilingual(record, "stageNote", "stageNote");
  return c.result();
}
