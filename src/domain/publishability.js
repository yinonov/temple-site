// Publishability gate (EXECUTION_PLAN.md §2.5, D1, D2, D8; TASK-1-05 / TASK-2-03).
// Pure ESM, no I/O, no Date. Decides which records may appear in the published runtime world.
//
// A record is published only when:
//  - it has a current approval: a valid decision (human, or synthetic_test_fixture under allowSynthetic)
//    whose target of the record's kind carries the record's current digest;
//  - evidence additionally has ≥1 current, valid, independent challenge recommending
//    `ready_for_human_review` (CHALLENGE_MISSING otherwise), matches the approved baseline, is not
//    withdrawn/superseded, quotes a source (catalog-only support never authorises: CATALOG_ONLY_SOURCE),
//    has every quotation/translation verified against supplied texts (QUOTE_UNVERIFIED), and its granted
//    certainty exceeds neither its proposedCertainty nor any ready challenge's recommendedMaxCertainty;
//  - every evidence id it cites (top-level and nested) is itself published (EVIDENCE_NOT_APPROVED);
//  - every record it depends on is published (DEPENDENCY_UNPUBLISHED); computed as a greatest fixpoint so
//    mutual references (e.g. topology edges both ways) neither recurse forever nor block each other;
//  - a certainty granted to a world record never exceeds the certainty of its evidence
//    (CERTAINTY_EXCEEDS_EVIDENCE).
//
// Effective certainty of a published record: evidence → the decision's grantedCertainty; world records →
// the decision's grantedCertainty for that record when given, else the weakest granted certainty of the
// evidence it cites. `traditional` and `archaeological` share rank 3 but are not interchangeable: a basis
// mixing them is `reconstructed` (warning CERTAINTY_MIXED_BASIS), and granting one on a basis of the other
// counts as exceeding the evidence.
//
// Publication policy (TASK-5-21, STRATEGY-2026-10 §3, ADR-002; src/domain/policy.js). Everything above is the
// `human_decision` policy (the default), where every published record has tier "expert_reviewed". Under
// `automated_challenge` a human approval is not required. Evidence and every world-record kind publish when:
//  - the record validates, its baseline is approved and its quotations verify (as above);
//  - it has ≥1 current (digest-matching), valid, independent challenge by reviewer.role "skeptic" recommending
//    `ready_for_human_review` (CHALLENGE_MISSING otherwise); world records are challenged with targetKind/targetId;
//  - no current valid challenge recommends revise/reject (CHALLENGE_OBJECTION, fail-closed);
//  - no current human decision rejects it or requests changes (HUMAN_VETO; same-day ties fail closed through
//    selectDecidingDecision);
//  - every evidence id it cites and every dependency is published (fixpoint, as above).
// Effective certainty = the weakest of: proposedCertainty (evidence) or the evidence basis (world records), every
// ready skeptic challenge's recommendedMaxCertainty, and a current human approval's grantedCertainty (which can
// only lower it; a higher grant is a CERTAINTY_EXCEEDS_EVIDENCE warning). Tier is "provisional", or
// "expert_reviewed" when a current human approval exists.
//
// TASK-5-28 additions (both policies):
//  - `geometry` is a record kind: dependencies are parentId, placement.of (geometry), locationId (location),
//    alternatives[].groupId and every dimension's / offset's alternativeGroupId (alternative_group); cited evidence is
//    evidenceIds plus placement.evidenceId and every (option) value's evidenceId. A geometry record may cite no evidence
//    (a wholly speculative placeholder); any speculative part, or citing no evidence, caps its basis at `speculative`.
//  - `modern_reconstruction` evidence may be supported by text-less summaries (like archaeological/modern_scholarship).
//  - Day-type definitions are display metadata evaluated by explainDayTypesPublishability (automated_challenge only).
import { recordDigest } from "./digest.js";
import { deriveLifecycle, selectDecidingDecision } from "./lifecycle.js";
import { verifyExcerptsDetailed } from "./quote-verify.js";
import { validateChallengeRecord, validateDecisionRecord } from "./evidence-schema.js";
import { PUBLISHABLE_CERTAINTY_LEVELS } from "./world-schema.js";
import { PUBLICATION_POLICIES, DEFAULT_PUBLICATION_POLICY } from "./policy.js";

/** Certainty rank (§2.5). requires_review is 0 and never publishable. */
export const CERTAINTY_RANK = Object.freeze({
  documented: 4, traditional: 3, archaeological: 3, reconstructed: 2, speculative: 1, requires_review: 0
});

/** Record kinds the gate understands (decision target kinds, §2.4; geometry since TASK-5-28). */
export const RECORD_KINDS = Object.freeze([
  "evidence", "location", "role", "entity", "access_policy", "sequence", "anchor", "alternative_group", "event", "geometry"
]);

/** Challenge target kind of the day-type definitions (display metadata, not a record kind; TASK-5-28). */
export const DAY_TYPES_TARGET_KIND = "day_types";

const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const keyOf = (kind, id) => `${kind}:${id}`;
const isSyntheticId = (value) => typeof value === "string" && value.includes("synthetic");

/**
 * Combine granted certainty levels into the basis certainty (the weakest one).
 * @param {string[]} levels publishable levels
 * @returns {{ level: string|null, mixed: boolean }} level null when `levels` is empty
 */
export function combineCertainty(levels) {
  const known = levels.filter((level) => PUBLISHABLE_CERTAINTY_LEVELS.has(level));
  if (known.length === 0) return { level: null, mixed: false };
  const minRank = Math.min(...known.map((level) => CERTAINTY_RANK[level]));
  const atMin = new Set(known.filter((level) => CERTAINTY_RANK[level] === minRank));
  if (atMin.size > 1) return { level: "reconstructed", mixed: true };
  return { level: [...atMin][0], mixed: false };
}

/**
 * True when `granted` claims more than `basis` supports: higher rank, or the same rank with a
 * different level (traditional vs archaeological).
 */
export function certaintyExceeds(granted, basis) {
  if (!PUBLISHABLE_CERTAINTY_LEVELS.has(granted) || !PUBLISHABLE_CERTAINTY_LEVELS.has(basis)) return false;
  const rank = CERTAINTY_RANK[granted] - CERTAINTY_RANK[basis];
  return rank > 0 || (rank === 0 && granted !== basis);
}

/** Evidence ids a record cites, top-level and nested, sorted and de-duplicated. */
export function collectEvidenceIds(record, kind) {
  if (!isObject(record)) return [];
  const ids = [...list(record.evidenceIds)];
  if (kind === "location") for (const edge of list(record.spatial?.topologyEdges)) ids.push(...list(edge?.evidenceIds));
  if (kind === "access_policy") for (const rule of list(record.rules)) ids.push(...list(rule?.evidenceIds));
  if (kind === "sequence") {
    for (const step of list(record.steps)) ids.push(...list(step?.evidenceIds));
    ids.push(...list(record.orderEvidenceIds));
  }
  if (kind === "alternative_group") for (const option of list(record.options)) ids.push(...list(option?.evidenceIds));
  if (kind === "event") {
    for (const anchor of list(record.timing?.anchors)) ids.push(...list(anchor?.evidenceIds));
    for (const exception of list(record.compatibility?.overlapExceptions)) ids.push(...list(exception?.evidenceIds));
  }
  if (kind === "geometry") {
    ids.push(record.placement?.evidenceId);
    for (const value of geometryValues(record)) ids.push(value.evidenceId);
  }
  return [...new Set(ids.filter((id) => typeof id === "string"))].sort(byText);
}

/**
 * Every length value object of a geometry record (dimensions, placement.offset and placement.crossOffset), flattened: an alternative value
 * yields itself (carrying alternativeGroupId) and each of its byOption values. Callers read evidenceId / speculative.
 */
function geometryValues(record) {
  const out = [];
  const visit = (value) => {
    if (!isObject(value)) return;
    out.push(value);
    if (isObject(value.byOption)) for (const option of Object.values(value.byOption)) visit(option);
  };
  if (isObject(record?.dimensions)) for (const value of Object.values(record.dimensions)) visit(value);
  visit(record?.placement?.offset);
  visit(record?.placement?.crossOffset); // TASK-6-24: second placement distance
  // TASK-6-34: the side lengths of a quadrilateral outline, per option.
  if (isObject(record?.outline?.byOption)) {
    for (const entry of Object.values(record.outline.byOption)) if (isObject(entry?.sides)) Object.values(entry.sides).forEach(visit);
  }
  return out;
}

/** [path, alternativeGroupId] of each geometry dimension and of placement.offset, for dependency reporting. */
function geometryAlternativeRefs(record) {
  const refs = [];
  if (isObject(record?.dimensions)) {
    for (const [key, value] of Object.entries(record.dimensions)) refs.push([`dimensions.${key}.alternativeGroupId`, value?.alternativeGroupId]);
  }
  refs.push(["placement.offset.alternativeGroupId", record?.placement?.offset?.alternativeGroupId]);
  refs.push(["placement.crossOffset.alternativeGroupId", record?.placement?.crossOffset?.alternativeGroupId]);
  refs.push(["outline.alternativeGroupId", record?.outline?.alternativeGroupId]);
  refs.push(["appliesTo.groupId", record?.appliesTo?.groupId]); // TASK-6-44
  return refs;
}

/**
 * True when a geometry record states anything without a measurement/placement source: it cites no evidence at all,
 * or its placement or any length value (dimension, offset, alternative option) is `speculative: true`. Such a record's
 * effective certainty is capped at `speculative` (TASK-5-28): the record-level certainty is the weakest of its parts.
 */
export function geometryHasSpeculativePart(record) {
  if (!isObject(record)) return false;
  if (collectEvidenceIds(record, "geometry").length === 0) return true;
  if (record.placement?.speculative === true) return true;
  return geometryValues(record).some((value) => value.speculative === true);
}

/** Records a world record depends on: [{ kind, id, path }]. Evidence has none. */
export function collectDependencies(record, kind) {
  if (!isObject(record)) return [];
  const deps = [];
  const add = (depKind, id, path) => { if (typeof id === "string") deps.push({ kind: depKind, id, path }); };
  if (kind === "location") {
    add("location", record.parentId, "parentId");
    list(record.spatial?.topologyEdges).forEach((edge, i) => add("location", edge?.toLocationId, `spatial.topologyEdges[${i}].toLocationId`));
  } else if (kind === "entity") {
    add("role", record.roleId, "roleId");
  } else if (kind === "access_policy") {
    add("location", record.locationId, "locationId");
    list(record.rules).forEach((rule, i) => add("role", rule?.roleId, `rules[${i}].roleId`));
  } else if (kind === "anchor") {
    add("alternative_group", record.alternativeGroupId, "alternativeGroupId");
  } else if (kind === "event") {
    add("location", record.locationId, "locationId");
    list(record.participants).forEach((participant, i) => {
      add("entity", participant?.entityId, `participants[${i}].entityId`);
      add("role", participant?.roleId, `participants[${i}].roleId`);
    });
    if (record.timing?.axis === "sequence") {
      add("sequence", record.timing.sequenceId, "timing.sequenceId");
      list(record.timing.anchors).forEach((anchor, i) => add("anchor", anchor?.anchorId, `timing.anchors[${i}].anchorId`));
    }
    list(record.alternatives).forEach((alternative, i) => add("alternative_group", alternative?.groupId, `alternatives[${i}].groupId`));
  } else if (kind === "geometry") {
    add("geometry", record.parentId, "parentId");
    add("geometry", record.placement?.of, "placement.of");
    add("location", record.locationId, "locationId");
    list(record.alternatives).forEach((alternative, i) => add("alternative_group", alternative?.groupId, `alternatives[${i}].groupId`));
    for (const [path, groupId] of geometryAlternativeRefs(record)) add("alternative_group", groupId, path);
  }
  return deps;
}

/**
 * Lifecycle of a non-evidence world record, derived from decision records exactly like
 * deriveLifecycle derives evidence lifecycle (lifecycle.js semantics unchanged): only valid
 * decisions with a target of the same kind and id count; a digest mismatch makes them stale; the
 * latest current decision wins, a same-day rejection/changes_requested beating an approval
 * (selectDecidingDecision). World-record challenges (TASK-5-21) are those with `targetKind === kind` and
 * `targetId === record.id`; valid ones whose targetDigest matches are current (state "challenged" without a
 * decision), others are stale or ignored, exactly like evidence challenges.
 * @param {{ allowSynthetic?: boolean, challenges?: object[] }} [options]
 * @returns {{ state, digest, decisionId, grantedCertainty, challengeIds, stale, ignored }}
 */
export function deriveRecordLifecycle(record, kind, decisions = [], { allowSynthetic = false, challenges = [] } = {}) {
  const digest = recordDigest(record);
  const stale = [];
  const ignored = [];
  const current = [];
  const challengeIds = [];
  const staleChallenges = [];
  const ignoredChallenges = [];
  const recordsByKind = { [kind]: new Map([[record.id, record]]) };
  for (const challenge of list(challenges)) {
    if (challenge?.targetKind !== kind || challenge.targetId !== record.id) continue;
    if (validateChallengeRecord(challenge, { recordsByKind }).some((item) => item.severity === "error")) ignoredChallenges.push(String(challenge.id));
    else if (challenge.targetDigest === digest) challengeIds.push(challenge.id);
    else staleChallenges.push(challenge.id);
  }
  for (const decision of decisions) {
    const target = list(decision?.targets).find((item) => item?.kind === kind && item.id === record.id);
    if (!target) continue;
    if (validateDecisionRecord(decision, { allowSynthetic }).some((item) => item.severity === "error")) ignored.push(String(decision.id));
    else if (target.digest === digest) current.push(decision);
    else stale.push(decision.id);
  }
  const latest = selectDecidingDecision(current);
  const states = { approved: "approved_for_scope", rejected: "rejected", changes_requested: "changes_requested" };
  const state = latest ? states[latest.decision] : challengeIds.length > 0 ? "challenged" : "drafted";
  const granted = state === "approved_for_scope" && isObject(latest.grantedCertainty) ? latest.grantedCertainty[record.id] ?? null : null;
  return {
    state, digest, decisionId: latest ? latest.id : null, grantedCertainty: granted, challengeIds: challengeIds.sort(byText),
    stale: { challenges: staleChallenges.sort(byText), decisions: stale.sort(byText) },
    ignored: { challenges: ignoredChallenges.sort(byText), decisions: ignored.sort(byText) }
  };
}

/**
 * Build the context the gate evaluates against. Records should already be schema-valid (the
 * importer excludes invalid ones); a record missing here counts as unpublished.
 * @param {{ baseline: object, evidence?: object[], challenges?: object[], decisions?: object[],
 *           records?: Partial<Record<string, object[]>>, allowSynthetic?: boolean, texts?: object|Map|null }} input
 *   `records` maps a world kind (location, role, …, event) to its records.
 *   `texts`: vendored texts keyed by textId. Fail-closed: with no texts (the default), no evidence that
 *   carries a quotation/translation excerpt can be published (QUOTE_UNVERIFIED).
 *   `policy`: "human_decision" (default) or "automated_challenge" (TASK-5-21; see the header).
 */
export function createPublicationContext({ baseline = null, evidence = [], challenges = [], decisions = [], records = {}, allowSynthetic = false, texts = null, policy = DEFAULT_PUBLICATION_POLICY } = {}) {
  if (!PUBLICATION_POLICIES.includes(policy)) throw new TypeError(`policy must be one of ${PUBLICATION_POLICIES.join("|")}, got ${JSON.stringify(policy)}`);
  const byKey = new Map();
  for (const record of evidence) if (typeof record?.id === "string" && !byKey.has(keyOf("evidence", record.id))) byKey.set(keyOf("evidence", record.id), { kind: "evidence", record });
  for (const kind of RECORD_KINDS) {
    if (kind === "evidence") continue;
    for (const record of list(records[kind])) {
      if (typeof record?.id === "string" && !byKey.has(keyOf(kind, record.id))) byKey.set(keyOf(kind, record.id), { kind, record });
    }
  }
  return { baseline, challenges: list(challenges), decisions: list(decisions), allowSynthetic, texts: texts ?? null, policy, byKey, own: new Map(), published: null, lifecycles: new Map() };
}

/** Lifecycle of any record kind in this context (memoised). */
export function lifecycleOf(record, kind, ctx) {
  const key = keyOf(kind, record.id);
  if (ctx.byKey.get(key)?.record === record && ctx.lifecycles.has(key)) return ctx.lifecycles.get(key);
  const lifecycle = kind === "evidence"
    ? deriveLifecycle(record, ctx.challenges, ctx.decisions, { allowSynthetic: ctx.allowSynthetic })
    : deriveRecordLifecycle(record, kind, ctx.decisions, { allowSynthetic: ctx.allowSynthetic, challenges: ctx.challenges });
  if (ctx.byKey.get(key)?.record === record) ctx.lifecycles.set(key, lifecycle);
  return lifecycle;
}

function approvalProblems(lifecycle, ctx, notApprovedCode, add) {
  if (lifecycle.state === "approved_for_scope") return;
  if (lifecycle.stale.decisions.length > 0) {
    add("DECISION_DIGEST_STALE", "", `approval ${lifecycle.stale.decisions.join(", ")} was given for a different version of this record`);
  }
  for (const id of lifecycle.ignored.decisions) {
    const decision = ctx.decisions.find((item) => item?.id === id);
    const codes = validateDecisionRecord(decision, { allowSynthetic: ctx.allowSynthetic }).map((item) => item.code);
    if (codes.includes("DECISION_NOT_HUMAN")) add("DECISION_NOT_HUMAN", "", `decision ${id} was not made by a human reviewer and does not count`);
  }
  const why = lifecycle.state === "drafted" || lifecycle.state === "challenged" ? "has no current approval" : `is ${lifecycle.state}`;
  add(notApprovedCode, "", `record ${why}`);
}

/** Own (dependency-free) gate result for one record; memoised per context. */
function ownStatus(record, kind, ctx) {
  const key = keyOf(kind, record?.id);
  const memo = ctx.byKey.get(key)?.record === record ? ctx.own.get(key) : undefined;
  if (memo) return memo;
  const problems = [];
  const warnings = [];
  const add = (code, path, message) => problems.push({ code, path, message });
  let effective = null;
  let lifecycle = null;

  if (!isObject(record) || typeof record.id !== "string" || !RECORD_KINDS.includes(kind)) {
    add("TYPE_MISMATCH", "", `cannot evaluate a ${kind} record without an id`);
  } else {
    if (!ctx.allowSynthetic && isSyntheticId(record.id)) add("SYNTHETIC_IN_REAL_DATA", "id", "synthetic fixture ids never publish in real data");
    if (!isObject(ctx.baseline) || ctx.baseline.status !== "approved") add("BASELINE_MISMATCH", "", "no approved baseline");
    lifecycle = lifecycleOf(record, kind, ctx);
    if (kind === "evidence") effective = ownEvidence(record, lifecycle, ctx, add, warnings);
    else effective = ownWorldRecord(record, kind, lifecycle, ctx, add, warnings);
    // An approving decision must belong to the approved baseline.
    if (lifecycle.decisionId && isObject(ctx.baseline)) {
      const decision = ctx.decisions.find((item) => item?.id === lifecycle.decisionId);
      if (decision && decision.baselineId !== ctx.baseline.id) add("BASELINE_MISMATCH", "", `decision ${decision.id} belongs to baseline ${JSON.stringify(decision.baselineId)}`);
    }
  }
  const ok = problems.length === 0;
  const tier = !ok ? null : ctx.policy === "automated_challenge" && lifecycle.state !== "approved_for_scope" ? "provisional" : "expert_reviewed";
  const status = { ok, problems, warnings, effectiveCertainty: ok ? effective : null, tier, lifecycle };
  if (ctx.byKey.get(key)?.record === record) ctx.own.set(key, status);
  return status;
}

/**
 * Source types whose non-textual (object/page/web) sources may be summarised without a vendored text.
 * `modern_reconstruction` (TASK-5-28, STRATEGY-2026-10 §4): attributed summaries of modern reconstructions (Temple
 * Institute, scholars' models), typically with a `web` locator; the schema caps their proposedCertainty at
 * `reconstructed` (evidence-kind-rules.js), so the gate never yields more than that.
 */
export const UNVERIFIABLE_SUMMARY_SOURCE_TYPES = Object.freeze(new Set(["archaeological", "modern_scholarship", "modern_reconstruction"]));

/**
 * Quote verification as a gate (D9, fail-closed). Every quotation/translation excerpt must be verified
 * against a supplied vendored text; a source without a textRef is acceptable only as a `summary` in an
 * archaeological, modern_scholarship or modern_reconstruction record.
 */
function quoteProblems(record, ctx, add) {
  const failed = ctx.texts ? new Set(verifyExcerptsDetailed(record, ctx.texts).diagnostics.map((item) => /^sources\[(\d+)\]/.exec(item.path)?.[1]).filter(Boolean).map(Number)) : null;
  list(record.sources).forEach((source, index) => {
    if (!isObject(source)) return;
    const path = `sources[${index}]`;
    const hasText = isObject(source.textRef);
    const verifiable = source.excerptRole === "quotation" || source.excerptRole === "translation";
    if (!hasText) {
      if (!(source.excerptRole === "summary" && UNVERIFIABLE_SUMMARY_SOURCE_TYPES.has(record.sourceType))) {
        add("QUOTE_UNVERIFIED", path, `${path} has no vendored text; without one only a summary in an archaeological, modern_scholarship or modern_reconstruction record is allowed`);
      }
      return;
    }
    if (!verifiable) return;
    if (!ctx.texts) add("QUOTE_UNVERIFIED", path, `${path} ${source.excerptRole} was not verified: no vendored texts were supplied`);
    else if (failed.has(index)) add("QUOTE_UNVERIFIED", path, `${path} ${source.excerptRole} does not verify against ${source.textRef.textId}`);
  });
}

const isAutomated = (ctx) => ctx.policy === "automated_challenge";

/** automated_challenge: a current human rejection or changes_requested vetoes publication (HUMAN_VETO). */
function vetoProblems(lifecycle, add) {
  if (lifecycle.state === "rejected" || lifecycle.state === "changes_requested") {
    add("HUMAN_VETO", "", `current human decision ${lifecycle.decisionId} ${lifecycle.state === "rejected" ? "rejects" : "requests changes to"} this version; it is not published`);
  }
}

/**
 * automated_challenge: challenge requirements shared by evidence and world records. Every current challenge that
 * recommends revise/reject blocks (CHALLENGE_OBJECTION); at least one current one by a `skeptic` must recommend
 * ready_for_human_review (CHALLENGE_MISSING). Returns those ready skeptic challenges.
 */
function automatedChallengeProblems(lifecycle, ctx, add, label) {
  const current = lifecycle.challengeIds.map((id) => ctx.challenges.find((item) => item?.id === id)).filter(Boolean);
  for (const challenge of current) {
    if (challenge.recommendation !== "ready_for_human_review") {
      add("CHALLENGE_OBJECTION", "", `current challenge ${challenge.id} recommends ${challenge.recommendation} for this version of the ${label}`);
    }
  }
  const ready = current.filter((challenge) => challenge.recommendation === "ready_for_human_review" && challenge.reviewer?.role === "skeptic");
  if (ready.length === 0) {
    add("CHALLENGE_MISSING", "", `no current, valid, independent skeptic challenge recommends ready_for_human_review for this version of the ${label}`);
  }
  return ready;
}

/**
 * automated_challenge effective certainty: the weakest of `levels` (proposed or evidence basis, and challenge
 * maxima), then a human grant may only lower it (a higher grant is reported as a warning and does not raise it).
 */
function automatedCertainty(levels, granted, warnings) {
  const cap = combineCertainty(levels);
  const mixedWarned = () => warnings.some((item) => item.code === "CERTAINTY_MIXED_BASIS");
  if (cap.mixed && !mixedWarned()) {
    warnings.push({ code: "CERTAINTY_MIXED_BASIS", path: "certainty", message: `its certainty caps mix traditional and archaeological; effective certainty is reconstructed` });
  }
  if (!granted || cap.level === null) return cap.level;
  if (certaintyExceeds(granted, cap.level)) {
    warnings.push({ code: "CERTAINTY_EXCEEDS_EVIDENCE", path: "certainty", message: `human-granted certainty ${granted} exceeds the automated cap ${cap.level}; a grant can only lower certainty, so the lower level applies` });
  }
  return combineCertainty([cap.level, granted]).level;
}

function ownEvidence(record, lifecycle, ctx, add, warnings) {
  if (isObject(ctx.baseline) && record.baselineId !== ctx.baseline.id) {
    add("BASELINE_MISMATCH", "baselineId", `baselineId ${JSON.stringify(record.baselineId)} is not the approved baseline ${JSON.stringify(ctx.baseline.id)}`);
  }
  if (record.recordStatus === "withdrawn" || record.recordStatus === "superseded") {
    add("EVIDENCE_NOT_APPROVED", "recordStatus", `evidence is ${record.recordStatus}`);
  } else if (isAutomated(ctx)) {
    vetoProblems(lifecycle, add);
  } else {
    approvalProblems(lifecycle, ctx, "EVIDENCE_NOT_APPROVED", add);
  }
  const quoted = list(record.sources).some((source) =>
    source?.relation === "supports" && typeof source.excerpt === "string" && source.excerpt.trim().length > 0);
  if (!quoted) add("CATALOG_ONLY_SOURCE", "sources", "no supporting source with an excerpt; a catalog entry alone never authorises a claim");
  quoteProblems(record, ctx, add);
  if (isAutomated(ctx)) {
    const ready = automatedChallengeProblems(lifecycle, ctx, add, "evidence");
    const granted = lifecycle.state === "approved_for_scope" ? lifecycle.grantedCertainty : null;
    return automatedCertainty([record.proposedCertainty, ...ready.map((challenge) => challenge.recommendedMaxCertainty)], granted, warnings);
  }
  const ready = lifecycle.challengeIds
    .map((id) => ctx.challenges.find((item) => item?.id === id))
    .filter((item) => item?.recommendation === "ready_for_human_review");
  if (ready.length === 0) {
    add("CHALLENGE_MISSING", "", "no current, valid, independent challenge recommends ready_for_human_review for this version of the evidence");
  }
  const granted = lifecycle.state === "approved_for_scope" ? lifecycle.grantedCertainty : null;
  if (granted) {
    // The owner may grant less than proposed/recommended, never more (TASK-2-07 O4).
    if (certaintyExceeds(granted, record.proposedCertainty)) {
      add("CERTAINTY_EXCEEDS_EVIDENCE", "proposedCertainty", `granted certainty ${granted} exceeds the proposed certainty ${record.proposedCertainty}`);
    }
    for (const challenge of ready) {
      if (certaintyExceeds(granted, challenge.recommendedMaxCertainty)) {
        add("CERTAINTY_EXCEEDS_EVIDENCE", "certainty", `granted certainty ${granted} exceeds ${challenge.recommendedMaxCertainty}, the maximum recommended by challenge ${challenge.id}`);
      }
    }
  }
  return granted;
}

function ownWorldRecord(record, kind, lifecycle, ctx, add, warnings) {
  const automated = isAutomated(ctx);
  let ready = [];
  if (automated) {
    vetoProblems(lifecycle, add);
    ready = automatedChallengeProblems(lifecycle, ctx, add, kind);
  } else {
    approvalProblems(lifecycle, ctx, "RECORD_NOT_APPROVED", add);
  }
  const evidenceIds = collectEvidenceIds(record, kind);
  // Geometry (TASK-5-28) may be wholly speculative: a placeholder that cites no evidence publishes (once challenged)
  // with effective certainty `speculative`; any speculative part caps the record there too.
  const speculativeGeometry = kind === "geometry" && geometryHasSpeculativePart(record);
  if (evidenceIds.length === 0 && kind !== "geometry") {
    if (Array.isArray(record.sourceIds) && record.sourceIds.length > 0) add("CATALOG_ONLY_SOURCE", "sourceIds", "cites only catalog sources; publication requires approved evidence records");
    else add("EVIDENCE_NOT_APPROVED", "evidenceIds", "record cites no evidence");
  }
  const levels = [];
  for (const id of evidenceIds) {
    const entry = ctx.byKey.get(keyOf("evidence", id));
    if (!entry) { add("REF_UNKNOWN_EVIDENCE", "evidenceIds", `evidence ${id} is not a known valid evidence record`); continue; }
    const status = ownStatus(entry.record, "evidence", ctx);
    if (!status.ok) {
      const stale = status.problems.some((problem) => problem.code === "DECISION_DIGEST_STALE");
      add(stale ? "DECISION_DIGEST_STALE" : "EVIDENCE_NOT_APPROVED", "evidenceIds", `evidence ${id} is not published (${[...new Set(status.problems.map((p) => p.code))].join(", ")})`);
    }
    // Certainty ceilings are checked against granted levels even when another blocker exists, so an
    // explanation lists every problem at once. Under automated_challenge the basis is the evidence's own
    // effective certainty, which exists only when that evidence passes its own gate.
    if (automated) { if (status.ok && status.effectiveCertainty) levels.push(status.effectiveCertainty); }
    else if (status.lifecycle?.state === "approved_for_scope" && status.lifecycle.grantedCertainty) levels.push(status.lifecycle.grantedCertainty);
  }
  if (levels.length !== evidenceIds.length || (evidenceIds.length === 0 && !speculativeGeometry)) return null;
  if (speculativeGeometry) levels.push("speculative");
  const basis = combineCertainty(levels);
  if (basis.mixed) {
    warnings.push({ code: "CERTAINTY_MIXED_BASIS", path: "evidenceIds", message: "cites both traditional and archaeological evidence; effective certainty is reconstructed" });
  }
  if (automated) {
    if (PUBLISHABLE_CERTAINTY_LEVELS.has(record.certainty) && certaintyExceeds(record.certainty, basis.level)) {
      add("CERTAINTY_EXCEEDS_EVIDENCE", "certainty", `stated certainty ${record.certainty} exceeds its evidence (${basis.level})`);
    }
    const humanGrant = lifecycle.state === "approved_for_scope" ? lifecycle.grantedCertainty : null;
    return automatedCertainty([basis.level, ...ready.map((challenge) => challenge.recommendedMaxCertainty)], humanGrant, warnings);
  }
  const granted = lifecycle.grantedCertainty;
  if (granted && certaintyExceeds(granted, basis.level)) {
    add("CERTAINTY_EXCEEDS_EVIDENCE", "certainty", `granted certainty ${granted} exceeds its evidence (${basis.level})`);
  }
  if (PUBLISHABLE_CERTAINTY_LEVELS.has(record.certainty) && certaintyExceeds(record.certainty, basis.level)) {
    add("CERTAINTY_EXCEEDS_EVIDENCE", "certainty", `stated certainty ${record.certainty} exceeds its evidence (${basis.level})`);
  }
  return granted ?? basis.level;
}

/** Greatest fixpoint: records whose own gate passes and whose dependencies are all published. */
function publishedSet(ctx) {
  if (ctx.published) return ctx.published;
  const published = new Set();
  for (const [key, { kind, record }] of ctx.byKey) if (ownStatus(record, kind, ctx).ok) published.add(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...published]) {
      const { kind, record } = ctx.byKey.get(key);
      if (collectDependencies(record, kind).some((dep) => !published.has(keyOf(dep.kind, dep.id)))) {
        published.delete(key);
        changed = true;
      }
    }
  }
  ctx.published = published;
  return published;
}

/**
 * Explain whether one record may be published.
 * @param {object} record
 * @param {string} kind one of RECORD_KINDS
 * @param {object} ctx from createPublicationContext
 * @returns {{ publishable: boolean, reasons: string[], details: {code, path, message}[],
 *             warnings: {code, path, message}[], effectiveCertainty: string|null, tier: string|null, lifecycle: object|null }}
 *   `reasons` are unique codes, sorted; effectiveCertainty and tier are null unless publishable. tier is
 *   "expert_reviewed" (human_decision, or a current human approval) or "provisional" (automated_challenge).
 */
export function explainPublishability(record, kind, ctx) {
  const own = ownStatus(record, kind, ctx);
  const details = [...own.problems];
  const known = isObject(record) && ctx.byKey.get(keyOf(kind, record.id))?.record === record;
  if (isObject(record)) {
    const published = publishedSet(ctx);
    for (const dep of collectDependencies(record, kind)) {
      if (!published.has(keyOf(dep.kind, dep.id))) {
        details.push({ code: "DEPENDENCY_UNPUBLISHED", path: dep.path, message: `depends on ${dep.kind} ${dep.id}, which is not published` });
      }
    }
  }
  if (details.length === 0 && !known) {
    details.push({ code: "RECORD_NOT_APPROVED", path: "", message: "record is not part of the publication context" });
  }
  const publishable = details.length === 0;
  return {
    publishable,
    reasons: [...new Set(details.map((item) => item.code))].sort(byText),
    details,
    warnings: own.warnings,
    effectiveCertainty: publishable ? own.effectiveCertainty : null,
    tier: publishable ? own.tier : null,
    lifecycle: own.lifecycle
  };
}

/**
 * Day-type definitions (data/world/day-types.json; TASK-5-28). They are display metadata — project viewing categories,
 * not a world record kind and not a decision target kind — and publish with the published world, all or nothing:
 *  - only under `automated_challenge` (under `human_decision` no decision kind covers them: RECORD_NOT_APPROVED);
 *  - the baseline is approved;
 *  - every definition has ≥1 current (targetDigest = recordDigest(definition)), valid, independent `skeptic` challenge
 *    with targetKind "day_types" and targetId = its id recommending ready_for_human_review, and none recommending
 *    revise/reject (CHALLENGE_MISSING / CHALLENGE_OBJECTION, path `records[<id>]`);
 *  - every evidence record a `sourceCategories[].evidenceId` cites is published (EVIDENCE_NOT_APPROVED), because the
 *    definitions display source terms found in that evidence.
 * Definitions carry no certainty; a published file has tier "provisional".
 * @param {object|null} file a schema-valid day-type definitions file
 * @param {object} ctx from createPublicationContext
 * @returns {{ publishable: boolean, reasons: string[], details: {code, path, message}[], tier: string|null,
 *             challengeIds: string[] }} challengeIds: the current challenges of every definition, sorted
 */
export function explainDayTypesPublishability(file, ctx) {
  const details = [];
  const add = (code, path, message) => details.push({ code, path, message });
  const challengeIds = [];
  const records = isObject(file) ? list(file.records) : [];
  if (records.length === 0) add("TYPE_MISMATCH", "records", "no day-type definitions to evaluate");
  if (!isObject(ctx.baseline) || ctx.baseline.status !== "approved") add("BASELINE_MISMATCH", "", "no approved baseline");
  if (!isAutomated(ctx)) {
    add("RECORD_NOT_APPROVED", "", "no decision kind covers day-type definitions; they publish only under the automated_challenge policy");
  } else {
    const published = publishedSet(ctx);
    for (const record of records) {
      if (!isObject(record) || typeof record.id !== "string") continue;
      const path = `records[${record.id}]`;
      const lifecycle = deriveRecordLifecycle(record, DAY_TYPES_TARGET_KIND, [], { allowSynthetic: ctx.allowSynthetic, challenges: ctx.challenges });
      challengeIds.push(...lifecycle.challengeIds);
      const own = [];
      automatedChallengeProblems(lifecycle, ctx, (code, _path, message) => own.push({ code, path, message }), `day-type definition ${record.id}`);
      details.push(...own);
      for (const category of list(record.sourceCategories)) {
        const id = category?.evidenceId;
        if (typeof id === "string" && !published.has(keyOf("evidence", id))) {
          add("EVIDENCE_NOT_APPROVED", `${path}.sourceCategories`, `evidence ${id} is not published`);
        }
      }
    }
  }
  const publishable = details.length === 0;
  return {
    publishable,
    reasons: [...new Set(details.map((item) => item.code))].sort(byText),
    details,
    tier: publishable ? "provisional" : null,
    challengeIds: [...new Set(challengeIds)].sort(byText)
  };
}

/** @returns {boolean} true when the record passes the publishability gate */
export function isPublishable(record, kind, ctx) {
  return explainPublishability(record, kind, ctx).publishable;
}
