// Derived evidence lifecycle (EXECUTION_PLAN.md D1, D2). A record never asserts its own
// review state: "challenged" and "approved_for_scope" come only from separate challenge and
// decision records whose digest matches the record's current canonical content.
import { recordDigest } from "./digest.js";
import { validateChallengeRecord, validateDecisionRecord } from "./evidence-schema.js";

export const LIFECYCLE_STATES = Object.freeze([
  "drafted", "challenged", "approved_for_scope", "rejected", "changes_requested", "withdrawn", "superseded"
]);

const DECISION_STATES = Object.freeze({
  approved: "approved_for_scope",
  rejected: "rejected",
  changes_requested: "changes_requested"
});

const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

function evidenceTarget(decision, evidenceId) {
  if (!Array.isArray(decision?.targets)) return null;
  return decision.targets.find((target) => target?.kind === "evidence" && target.id === evidenceId) ?? null;
}

/**
 * Pick the decision that determines a record's state among its current (valid, digest-matching)
 * decisions. The latest `decidedAt` wins. `decidedAt` has day resolution, so several decisions can
 * share the latest day: then any `rejected` beats `changes_requested`, which beats `approved`
 * (fail-closed; TASK-2-07 / QA finding B1). Remaining ties are broken by id for determinism only.
 * @param {object[]} current valid decisions whose target digest matches the record
 * @returns {object|null}
 */
export function selectDecidingDecision(current) {
  if (current.length === 0) return null;
  const latestDay = current.reduce((max, item) => (item.decidedAt > max ? item.decidedAt : max), current[0].decidedAt);
  const severity = { rejected: 0, changes_requested: 1, approved: 2 };
  const sameDay = current.filter((item) => item.decidedAt === latestDay);
  sameDay.sort((left, right) => (severity[left.decision] ?? 0) - (severity[right.decision] ?? 0) || byText(left.id, right.id));
  return sameDay[0];
}

/**
 * Derive one evidence record's lifecycle from separate challenge and decision records.
 *
 * - Only records that validate and target this record are considered; invalid ones are
 *   listed in `ignored` and never count (e.g. a non-human decision).
 * - A challenge/decision counts only when its digest equals recordDigest(record);
 *   others are listed in `stale`.
 * - The latest current decision by decidedAt wins; on a same-day tie a rejection or
 *   changes_requested beats an approval (selectDecidingDecision).
 * - recordStatus withdrawn/superseded overrides any review outcome.
 *
 * @param {object} record evidence record v2
 * @param {object[]} challenges challenge records (any evidence; filtered here)
 * @param {object[]} decisions decision records (any targets; filtered here)
 * @param {{ allowSynthetic?: boolean }} [options]
 */
export function deriveLifecycle(record, challenges = [], decisions = [], { allowSynthetic = false } = {}) {
  const digest = recordDigest(record);
  const evidenceById = new Map([[record.id, record]]);
  const stale = { challenges: [], decisions: [] };
  const ignored = { challenges: [], decisions: [] };

  const currentChallengeIds = [];
  for (const challenge of challenges) {
    if (challenge?.evidenceId !== record.id) continue;
    if (challenge.targetKind !== undefined && challenge.targetKind !== "evidence") continue; // a world-record challenge (TASK-5-21)
    if (validateChallengeRecord(challenge, { evidenceById }).some((item) => item.severity === "error")) {
      ignored.challenges.push(String(challenge.id));
    } else if (challenge.evidenceDigest === digest) {
      currentChallengeIds.push(challenge.id);
    } else {
      stale.challenges.push(challenge.id);
    }
  }

  const currentDecisions = [];
  for (const decision of decisions) {
    const target = evidenceTarget(decision, record.id);
    if (!target) continue;
    if (validateDecisionRecord(decision, { allowSynthetic }).some((item) => item.severity === "error")) {
      ignored.decisions.push(String(decision.id));
    } else if (target.digest === digest) {
      currentDecisions.push(decision);
    } else {
      stale.decisions.push(decision.id);
    }
  }
  const latest = selectDecidingDecision(currentDecisions);

  let state = "drafted";
  if (record.recordStatus === "withdrawn" || record.recordStatus === "superseded") state = record.recordStatus;
  else if (latest) state = DECISION_STATES[latest.decision];
  else if (currentChallengeIds.length > 0) state = "challenged";

  const approved = state === "approved_for_scope";
  return {
    state,
    digest,
    challengeIds: currentChallengeIds.sort(byText),
    decisionId: latest ? latest.id : null,
    grantedCertainty: approved ? latest.grantedCertainty[record.id] : null,
    stale: { challenges: stale.challenges.sort(byText), decisions: stale.decisions.sort(byText) },
    ignored: { challenges: ignored.challenges.sort(byText), decisions: ignored.decisions.sort(byText) }
  };
}
