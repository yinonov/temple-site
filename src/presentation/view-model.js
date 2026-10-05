// Presentation view model (docs/contracts/view-model.md, EXECUTION_PLAN.md §2.8). Pure: no DOM, Date, I/O
// or randomness. Input `state` is worldStateAt() output; `world` is importWorld().world.
//
// Text provenance: every historical string is copied from a data record (title, summary, name, label, action,
// question, option label, claim, excerpt, translation, period note). Everything else comes from `strings`.
// This module never composes a historical assertion; it only arranges data and labels.
//
// Fields beyond the frozen contract (additive, documented in docs/ui/interaction-contract.md §View model):
//   time.sequence.{name, orderNote, steps[]}, time.sequences[], dayType.{hint, options[]},
//   empty.title, conditional[], clockNotice, activeLocations[], timeline.clockEventStarts[],
//   events[].{selected, previewBadge, publicationLabel, location.basis, location.spatialStatusLabel},
//   events[].alternatives[].{status, statusLabel, selectable, options[].effect},
//   events[].evidence[].{missing, certainty, proposedCertainty, excerptNote, sources[] (each with note), interpretation, period,
//   variants[]}, evidence[].{allSources[] (record order, no translation pairing), alternativeRefs[]},
//   evidence[].skepticSummary is an object { text, current, stale[] } (contract left its shape open),
//   diagnostics[].code, banner.detail, fixture, events[].tier, evidence[].tier, certainty.{tier, grantedLabel} (TASK-5-24).
import { format } from "./strings.he.js";
import { licenceLink } from "./licence-link.js";

const CHECK_ORDER = ["periodMixing", "translationDependence", "missingContext", "architecturalOverreach",
  "competingReadings", "wordingOverreach", "quoteVerification"];
const RESULT_RANK = { fail: 0, concern: 1 };
const TOP_CONCERNS = 3;
const ENTITY_MAP = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&apos;": "'" };

const he = (text) => (text && typeof text === "object" ? text.he ?? null : typeof text === "string" ? text : null);
const indexById = (list) => new Map((Array.isArray(list) ? list : []).map((record) => [record.id, record]));

/** Decode the HTML entities that vendored manuscripts carry (e.g. Kaufmann marginalia "&lt;מקראות&gt;"). */
export function decodeEntities(text) {
  if (typeof text !== "string") return text;
  return text.replace(/&(lt|gt|amp|quot|#39|apos);/g, (match) => ENTITY_MAP[match] ?? match);
}

/** Minute of day → "HH:MM" (24h). */
export function formatClock(minuteOfDay) {
  const minute = Math.max(0, Math.min(1439, Math.trunc(Number(minuteOfDay) || 0)));
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Who checked a published record (data: `record.tier`, TASK-5-21): "provisional" (automated gate + independent
 * Skeptic challenge, no expert) or "expert_reviewed" (a current human approval). null for unpublished records.
 */
export function tierView(tier, strings) {
  const entry = tier ? strings.tier[tier] : null;
  return entry ? { value: tier, chip: entry.chip, text: entry.text, explanation: entry.explanation } : null;
}

/**
 * Certainty chip data. `granted` is true for published records (R-06): the level passed the publication gate.
 * Who set it depends on the tier: only an `expert_reviewed` record says a person approved its level (TASK-5-24);
 * a `provisional` one says it was set by the automated gate and the independent Skeptic challenge.
 * `traditionLabel` names the tradition(s) for a traditional level from the records' own catalog titles (R-13).
 */
function certaintyView(level, strings, granted = false, traditionTitles = null, tier = null) {
  const titles = Array.isArray(traditionTitles) ? [...new Set(traditionTitles)] : traditionTitles ? [traditionTitles] : [];
  // M3-13: catalog titles may contain commas themselves ("משנה, תמיד"), so the list is separated by semicolons.
  const traditionLabel = titles.length ? titles.join("; ") : null;
  const entry = strings.certainty[level] ?? strings.certainty.unknown;
  const grantedLabel = !granted ? strings.certainty.notGranted
    : tier === "expert_reviewed" ? strings.certainty.granted
      : tier === "provisional" ? strings.certainty.grantedProvisional : strings.publication.published;
  return { level: level ?? null, labelHe: entry.label, explanationHe: entry.explanation, granted: Boolean(granted),
    grantedLabel, tier: granted ? tierView(tier, strings) : null,
    traditionLabel: level === "traditional" && traditionLabel ? traditionLabel : null,
    traditionTitles: level === "traditional" ? titles : [] };
}

const INTERNAL_PATH = /(?:\b(?:src|scripts|data|reviews|research|docs|test|\.planning)\/[\w./-]+|\b[\w-]+\.(?:js|json|md)\b)/g;
/** Remove repository paths/file names from reviewer prose shown to visitors (R-19). */
export function stripInternalPaths(text, replacement = "[…]") {
  return typeof text === "string" ? text.replace(INTERNAL_PATH, replacement) : text;
}

const ISOLATE_RUN = /[A-Za-z\u0370-\u03FF\u1F00-\u1FFF][A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF'’.\-]*(?:[ ,]+[A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF][A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF'’.\-]*)*/g;
/** Wrap Latin/Greek runs inside Hebrew text in LRI…PDI so punctuation is not displaced by bidi (R-15, R-21). */
export function isolateLatin(text) {
  if (typeof text !== "string" || !/[\u0590-\u05FF]/.test(text)) return text;
  return text.replace(ISOLATE_RUN, (run) => `\u2066${run}\u2069`);
}

/** A source note may be a string (English) or { he, en }; visitors get Hebrew when present (R-04). Never authoringNote. */
function noteView(note) {
  if (typeof note === "string") return note.trim() ? { text: note, lang: "en" } : null;
  if (note && typeof note === "object") {
    if (typeof note.he === "string" && note.he.trim()) return { text: note.he, lang: "he", en: typeof note.en === "string" ? note.en : null };
    if (typeof note.en === "string" && note.en.trim()) return { text: note.en, lang: "en" };
  }
  return null;
}

function countLabel(count, strings) {
  const kind = count?.kind ?? "unspecified";
  if (kind === "exact" && Number.isInteger(count.value)) return format(strings.count.exact, { value: count.value });
  if (kind === "range" && Number.isInteger(count.min) && Number.isInteger(count.max)) return format(strings.count.range, count);
  return strings.count.unspecified;
}

/** Honest timing text: sequence position + anchors, never a fabricated hour. */
export function timingText(event, ctx, { anchorNotice = null } = {}) {
  const { strings, sequencesById, anchorsById } = ctx;
  const timing = event?.timing ?? {};
  const t = strings.timing;
  if (timing.axis === "clock") {
    // LRI…PDI keeps "HH:MM–HH:MM" in reading order inside Hebrew text.
    return format(t.clockRange, { start: `\u2066${formatClock(timing.startMinute)}`, end: `${formatClock(timing.endMinute)}\u2069` });
  }
  if (timing.axis !== "sequence") return t.noClock;
  const sequence = sequencesById.get(timing.sequenceId);
  const count = Array.isArray(sequence?.steps) ? sequence.steps.length : "?";
  const from = timing.startStep + 1;
  const to = timing.endStep; // half-open [start, end) → last included step is end-1, shown 1-based as end
  const parts = [to > from ? format(t.sequenceRange, { from, to, count }) : format(t.sequenceSingle, { step: from, count })];
  const name = he(sequence?.name);
  if (name) parts.push(format(t.sequenceOf, { name }));
  // N-01: when the event is shown under a day type it was not computed for, its anchors are not stated as timing.
  if (anchorNotice && (timing.anchors ?? []).length) {
    parts.push(anchorNotice);
    parts.push(t.noClock);
    return parts.join(t.separator);
  }
  for (const ref of timing.anchors ?? []) {
    const anchor = anchorsById.get(ref.anchorId);
    const label = he(anchor?.label);
    const template = t.anchor[ref.relation];
    if (!label || !template) continue;
    // R-17: an anchor may time only one step of the event (anchor.appliesToStep or the reference's own field).
    const step = Number.isInteger(ref.appliesToStep) ? ref.appliesToStep : Number.isInteger(anchor?.appliesToStep) ? anchor.appliesToStep : null;
    const text = format(template, { label });
    const stepLabel = step === null ? null : he(sequence?.steps?.find((item) => item.step === step)?.label);
    parts.push(step === null ? text : format(stepLabel ? t.anchorForStepLabel : t.anchorForStep, { step: step + 1, label: stepLabel ?? "", text }));
  }
  parts.push(t.noClock);
  return parts.join(t.separator);
}

function textMeta(textRef, texts) {
  const text = textRef && texts ? texts[textRef.textId] : null;
  return { edition: text?.edition ?? null, license: text?.license ?? null, textId: textRef?.textId ?? null,
    textAttribution: typeof text?.attribution === "string" && text.attribution ? text.attribution : null };
}

function attributionFor(textId, meta, strings) {
  if (typeof textId === "string" && textId.endsWith(".en.kulp")) return strings.evidence.attribution.kulp;
  if (typeof textId === "string" && textId.includes(".en.whiston")) return strings.evidence.attribution.whiston;
  return [meta.edition, meta.license].filter(Boolean).join(" · ") || null;
}

/** Catalog title for visitors: a Hebrew title when the catalog has one (`title.he` or `titleHe`), else the title (3D-20). */
export function catalogTitle(entry) {
  if (!entry) return null;
  if (entry.title && typeof entry.title === "object") return entry.title.he ?? entry.title.en ?? null;
  return entry.titleHe ?? entry.title ?? null;
}

const ACCESS_MODES_SHOWN = new Set(["search_snippet", "page_read"]);

const normaliseLabel = (text) => String(text ?? "").replace(/[\u2066-\u2069\u200e\u200f]/g, "").replace(/[\s,.;:·–—-]+/g, "");

/**
 * M3-13: the catalog title is dropped when the locator already says it ("משנה, כלים" + "משנה כלים א, ח" would print
 * the work twice). Returns the label to show, or null.
 */
export function shownSourceLabel(label, locator) {
  if (!label) return null;
  const wanted = normaliseLabel(label);
  return wanted && normaliseLabel(locator).includes(wanted) ? null : label;
}

function sourceView(source, ctx) {
  const { strings, catalogById, texts } = ctx;
  const meta = textMeta(source.textRef, texts);
  const isTranslation = source.excerptRole === "translation";
  return {
    catalogSourceId: source.catalogSourceId,
    sourceLabel: catalogTitle(catalogById.get(source.catalogSourceId)) ?? source.catalogSourceId,
    sourceLabelShown: shownSourceLabel(catalogTitle(catalogById.get(source.catalogSourceId)) ?? source.catalogSourceId, source.locator?.display ?? null),
    // 3D-16 (UI side): the kind of catalogued work, e.g. an online encyclopedia is named as such.
    catalogKindLabel: strings.evidence.catalogKinds?.[catalogById.get(source.catalogSourceId)?.kind] ?? null,
    locatorDisplay: source.locator?.display ?? null,
    // M3-02: how the project reached the source ("search_snippet" | "page_read" | "vendored_text"; absent = not stated).
    accessMode: ACCESS_MODES_SHOWN.has(source.accessMode) ? source.accessMode : null,
    accessLabel: strings.evidence.accessMode?.[source.accessMode] ?? null,
    segment: source.textRef?.segment ?? null,
    excerpt: decodeEntities(source.excerpt ?? null),
    language: source.language ?? null,
    role: source.excerptRole ?? null,
    roleLabel: strings.evidence.excerptRole[source.excerptRole] ?? source.excerptRole ?? null,
    relation: source.relation ?? null,
    relationLabel: strings.evidence.relation[source.relation] ?? source.relation ?? null,
    editionLabel: meta.edition,
    licenseLabel: meta.license,
    licenseLink: licenceLink(meta.license),
    // The vendored text's own attribution travels with each quotation (CC BY / BY-SA).
    textAttribution: meta.textAttribution,
    attribution: isTranslation ? attributionFor(meta.textId, meta, strings) : null,
    // Source/translator caveat. Always shown directly beneath the excerpt (Skeptic round 2); `authoringNote` never.
    note: noteView(source.note)?.text ?? null,
    noteLang: noteView(source.note)?.lang ?? null
  };
}

function concernsOf(challenge, strings) {
  const checks = challenge?.checks ?? {};
  const keys = [...CHECK_ORDER, ...Object.keys(checks).filter((key) => !CHECK_ORDER.includes(key)).sort()];
  return keys
    .filter((key) => checks[key] && Object.hasOwn(RESULT_RANK, checks[key].result))
    .map((key, index) => ({ key, index, rank: RESULT_RANK[checks[key].result] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ key }) => ({
      check: key,
      checkLabel: strings.evidence.checks[key] ?? key,
      result: checks[key].result,
      resultLabel: strings.evidence.checkResult[checks[key].result] ?? checks[key].result,
      note: stripInternalPaths(checks[key].note ?? "")
    }));
}

function challengeView(challenge, stale, strings) {
  const concerns = concernsOf(challenge, strings);
  const recommendationLabel = strings.evidence.recommendation[challenge.recommendation] ?? challenge.recommendation ?? null;
  const maxLevel = challenge.recommendedMaxCertainty ?? null;
  return {
    id: challenge.id,
    stale,
    staleLabel: stale ? strings.evidence.skepticStale : strings.evidence.skepticCurrent,
    recommendation: challenge.recommendation ?? null,
    recommendationLabel,
    recommendedMaxCertainty: maxLevel ? certaintyView(maxLevel, strings) : null,
    concernCount: concerns.length,
    topConcerns: concerns.slice(0, TOP_CONCERNS),
    moreConcernsLabel: concerns.length > TOP_CONCERNS ? format(strings.evidence.moreConcerns, { count: concerns.length - TOP_CONCERNS }) : null
  };
}

function skepticSummary(record, ctx) {
  const { strings, challenges } = ctx;
  const currentIds = new Set(record.lifecycle?.challengeIds ?? []);
  const all = challenges.filter((challenge) => challenge.evidenceId === record.id);
  const current = all.filter((challenge) => currentIds.has(challenge.id)).map((challenge) => challengeView(challenge, false, strings));
  const stale = all.filter((challenge) => !currentIds.has(challenge.id)).map((challenge) => challengeView(challenge, true, strings));
  const main = current.at(-1) ?? null;
  let text = strings.evidence.skepticNone;
  if (main) {
    text = [main.recommendationLabel, main.recommendedMaxCertainty ? `${strings.evidence.recommendedMax} ${main.recommendedMaxCertainty.labelHe}` : null,
      main.concernCount ? `${strings.evidence.topConcerns}: ${main.concernCount}` : null].filter(Boolean).join(" · ");
  } else if (stale.length) {
    text = strings.evidence.skepticStale;
  }
  return { text, current: main, stale };
}

function alternativeRefsFor(record, ctx) {
  const { strings, groupsById } = ctx;
  const ids = new Set(Array.isArray(record.alternativeGroupIds) ? record.alternativeGroupIds : []);
  // Only the record's structured alternativeGroupIds; free text (note, and never authoringNote) is not scanned.
  return [...ids].filter((id) => groupsById.has(id)).sort().map((id) => {
    const group = groupsById.get(id);
    const decided = group.approvedDefaultOptionId != null;
    return { groupId: id, question: he(group.question), statusLabel: decided ? strings.event.alternativeApprovedDefault : strings.evidence.alternativeUndecided,
      caveat: he(group.caveat) ?? null };
  });
}

function evidenceRoles(record, roleContext, strings) {
  if (!roleContext) return [];
  const roles = [];
  if (roleContext.stepEvidence?.has(record.id)) roles.push(strings.evidence.roles.step);
  if (roleContext.anchorEvidence?.has(record.id)) roles.push(strings.evidence.roles.timing);
  if (roleContext.locationEvidence?.has(record.id)) roles.push(strings.evidence.roles.location);
  return roles;
}

function evidenceView(id, ctx, roleContext = null) {
  const { strings, evidenceById, texts, catalogById } = ctx;
  const record = evidenceById.get(id);
  if (!record) {
    return { id, missing: true, claim: null, lifecycleLabel: format(strings.evidence.missing, { id }), sourceLabel: null,
      locatorDisplay: null, excerpt: null, editionLabel: null, licenseLabel: null, skepticSummary: null, periodNote: null, sources: [], variants: [], roles: [] };
  }
  const sources = Array.isArray(record.sources) ? record.sources : [];
  // R-05: translations are NOT paired with quotations. Without a data field naming the quotation a translation
  // renders (e.g. a future `translates` index), any pairing is a guess — two quotations can share a segment.
  // Every source is its own item, in the record's order; a translation is labelled as a translation of its locator.
  const primary = sources.find((source) => source.relation === "supports" && source.excerptRole === "quotation") ?? sources[0] ?? null;
  const primaryView = primary ? sourceView(primary, ctx) : null;
  const allSources = sources.map((source) => {
    const view = sourceView(source, ctx);
    view.primary = source === primary;
    if (view.role === "translation") view.translationLabel = format(strings.evidence.translationOf, { locator: view.locatorDisplay ?? "" });
    return view;
  });
  const others = allSources.filter((view) => !view.primary);
  const sourceTypeLabel = strings.evidence.sourceTypes[record.sourceType] ?? null;
  const tradition = [...new Set(sources.filter((source) => source.relation === "supports").map((source) => catalogTitle(catalogById.get(source.catalogSourceId))).filter(Boolean))];
  const view = {
    id,
    missing: false,
    claim: he(record.claim),
    claimKindLabel: strings.evidence.claimKinds[record.claimKind] ?? null,
    sourceTypeLabel,
    roles: evidenceRoles(record, roleContext, strings),
    lifecycleLabel: strings.lifecycle[record.lifecycle?.state] ?? strings.lifecycle.unknown,
    lifecycleState: record.lifecycle?.state ?? null,
    certainty: certaintyView(record.effectiveCertainty ?? record.certainty, strings, record.publication === "published", tradition || null, record.tier ?? null),
    tier: record.publication === "published" ? tierView(record.tier ?? null, strings) : null,
    proposedCertainty: record.proposedCertainty ? certaintyView(record.proposedCertainty, strings) : null,
    sourceLabel: primaryView?.sourceLabel ?? null,
    sourceLabelShown: shownSourceLabel(primaryView?.sourceLabel, primaryView?.locatorDisplay),
    locatorDisplay: primaryView?.locatorDisplay ?? null,
    accessMode: primaryView?.accessMode ?? null,
    excerpt: primaryView?.excerpt ?? null,
    excerptLanguage: primaryView?.language ?? null,
    editionLabel: primaryView?.editionLabel ?? null,
    licenseLabel: primaryView?.licenseLabel ?? null,
    excerptNote: primaryView?.note ?? null,
    excerptNoteLang: primaryView?.noteLang ?? null,
    // N-03: the record's alternative groups, once per evidence item.
    alternativeRefs: alternativeRefsFor(record, ctx),
    allSources,
    // Public build: translations removed from the deployed bundle (scripts/lib/public-filter.js); the page says so.
    omittedTranslations: Number(ctx.omissions?.[id]) > 0 ? strings.evidence.translationOmitted : null,
    sources: others,
    skepticSummary: skepticSummary(record, ctx),
    periodNote: record.period?.note ?? null,
    period: record.period ? {
      sourceDate: record.period.sourceDate ?? null,
      describedPeriod: record.period.describedPeriod ?? null,
      gapRisk: record.period.gapRisk ?? null,
      gapRiskLabel: strings.evidence.gapRiskValues[record.period.gapRisk] ?? null,
      note: record.period.note ?? null
    } : null,
    interpretation: record.interpretation ? {
      inference: record.interpretation.inference ?? null,
      notStated: Array.isArray(record.interpretation.notStatedBySource) ? [...record.interpretation.notStatedBySource] : []
    } : null,
    variants: (Array.isArray(record.textualVariants) ? record.textualVariants : []).map((variant) => ({
      witness: textMeta(variant.textRef, texts).edition ?? variant.textRef?.textId ?? null,
      segment: variant.textRef?.segment ?? null,
      reading: decodeEntities(variant.reading ?? ""),
      effect: decodeEntities(variant.effect ?? "")
    }))
  };
  return view;
}

function alternativeView(resolution, ctx) {
  const { strings, groupsById } = ctx;
  const group = groupsById.get(resolution.groupId);
  const e = strings.event;
  const statusLabel = resolution.status === "unresolved" ? e.alternativeUnresolved
    : resolution.status === "selected" ? e.alternativeSelected : e.alternativeApprovedDefault;
  return {
    groupId: resolution.groupId,
    question: he(group?.question),
    unresolved: resolution.status === "unresolved",
    status: resolution.status,
    statusLabel,
    selectable: group?.selectionPolicy === "visitor_selectable",
    notes: he(group?.notes) ?? null,
    caveat: he(group?.caveat) ?? null,
    options: (group?.options ?? []).map((option) => ({
      id: option.id,
      label: he(option.label),
      effect: he(option.effect),
      selected: resolution.optionId === option.id
    }))
  };
}

function locationView(event, ctx) {
  const { strings, locationsById } = ctx;
  const location = locationsById.get(event.locationId);
  const spatialStatus = location?.spatial?.status ?? "unknown";
  const basis = event.locationBasis ?? "unknown";
  return {
    id: event.locationId ?? null,
    name: he(location?.name),
    basis,
    basisLabel: strings.locationBasis[basis] ?? strings.locationBasis.unknown,
    // R-08: an inferred location is said in words, not only by a chip.
    inferredNotice: basis === "inferred" ? strings.event.locationInferredNotice : null,
    spatialStatus,
    spatialStatusLabel: strings.spatialStatus[spatialStatus] ?? strings.spatialStatus.unknown,
    // R-04: a place with a piece drawn in the 3D model is not "unplaced" there; the dialog says it is drawn as an estimated part.
    drawnLabel: spatialStatus !== "schematic" && ctx.geometryByLocation?.get(event.locationId) ? strings.spatialStatus.drawnPiece : null,
    // 3D-17: the 3D diagram places pieces the topology leaves unplaced; say so and link to it.
    geometryPieceId: ctx.geometryByLocation?.get(event.locationId) ?? null,
    otherViewNote: ctx.geometryByLocation?.get(event.locationId) && spatialStatus !== "schematic" ? strings.scene3d.otherViewNote : null,
    certainty: location ? certaintyView(location.effectiveCertainty ?? location.certainty, strings, location.publication === "published", null, location.tier ?? null) : null,
    evidence: (location?.evidenceIds ?? []).map((id) => evidenceView(id, ctx))
  };
}

/** Event evidence in the record's own order (main claim first, R-18); ids the state adds are appended. */
function orderedEvidenceIds(event, active) {
  const fromState = active.evidenceIds ?? [];
  const own = (event.evidenceIds ?? []).filter((id) => fromState.includes(id));
  return [...own, ...fromState.filter((id) => !own.includes(id))];
}

function roleContextFor(event, ctx) {
  const timing = event.timing ?? {};
  const sequence = timing.axis === "sequence" ? ctx.sequencesById.get(timing.sequenceId) : null;
  const stepEvidence = new Set((sequence?.steps ?? []).filter((step) => step.step >= timing.startStep && step.step < timing.endStep)
    .flatMap((step) => step.evidenceIds ?? []));
  const anchorEvidence = new Set((timing.anchors ?? []).flatMap((ref) => [...(ref.evidenceIds ?? []), ...(ctx.anchorsById.get(ref.anchorId)?.evidenceIds ?? [])]));
  const locationEvidence = new Set(ctx.locationsById.get(event.locationId)?.evidenceIds ?? []);
  return { stepEvidence, anchorEvidence, locationEvidence };
}

function eventView(active, ctx, selection, { anchorNotice = null } = {}) {
  const { strings, eventsById, entitiesById, rolesById } = ctx;
  const event = eventsById.get(active.eventId) ?? { id: active.eventId };
  const title = he(event.title);
  const evidenceIds = orderedEvidenceIds(event, active);
  const roleContext = roleContextFor(event, ctx);
  const evidence = evidenceIds.map((id) => evidenceView(id, ctx, roleContext));
  const tradition = [...new Set(evidence.flatMap((item) => item.certainty?.traditionTitles ?? []))];
  return {
    id: event.id,
    title,
    summary: he(event.summary),
    publication: active.publication,
    publicationLabel: strings.publication[active.publication] ?? null,
    previewBadge: active.publication === "preview_only" ? strings.certainty.previewBadge : null,
    selected: selection?.selectedEventId === event.id,
    certainty: certaintyView(active.certainty, strings, active.publication === "published", tradition || null, event.tier ?? null),
    tier: active.publication === "published" ? tierView(event.tier ?? null, strings) : null,
    location: locationView(event, ctx),
    participants: (event.participants ?? []).map((participant) => {
      const entity = entitiesById.get(participant.entityId);
      const role = rolesById.get(participant.roleId ?? entity?.roleId);
      return { entityId: participant.entityId, label: he(entity?.label), roleName: he(role?.name),
        countLabel: countLabel(entity?.count, strings), action: he(participant.action) };
    }),
    timingText: timingText(event, ctx, { anchorNotice }),
    applicability: applicabilityView(event, strings),
    alternatives: (active.alternatives ?? []).map((resolution) => alternativeView(resolution, ctx)),
    evidence,
    showEvidenceLabel: format(strings.event.showEvidenceLabel, { title: title ?? event.id }),
    showEvidenceText: format(strings.event.showEvidence, { count: evidenceIds.length })
  };
}

/** Day-type applicability basis (R-01): "source" | "editorial_viewing_assumption" | "unknown", with the data note. */
function applicabilityView(event, strings) {
  const basis = event?.applicability?.basis ?? "unknown";
  return { basis, basisLabel: strings.applicabilityBasis[basis] ?? strings.applicabilityBasis.unknown, note: he(event?.applicability?.note) };
}

function sequenceView(time, ctx) {
  const { strings, sequencesById } = ctx;
  const sequence = sequencesById.get(time.sequenceId);
  const steps = Array.isArray(sequence?.steps) ? sequence.steps : [];
  const current = steps.find((step) => step.step === time.step);
  const name = he(sequence?.name);
  return {
    id: time.sequenceId,
    step: time.step,
    stepLabel: he(current?.label) ?? "",
    stepCount: steps.length,
    name,
    // R-11: the stage qualifier is a data string, shown uncollapsed under the sequence name.
    stageNote: he(sequence?.stageNote),
    orderNote: he(sequence?.orderNote),
    certainty: sequence ? certaintyView(sequence.effectiveCertainty ?? sequence.certainty, strings, sequence.publication === "published", null, sequence.tier ?? null) : null,
    // R-07: the order itself and every step label have a route to their evidence.
    orderEvidence: [...new Set([...(sequence?.orderEvidenceIds ?? [])])].map((id) => evidenceView(id, ctx)),
    steps: steps.map((step) => ({ step: step.step, label: he(step.label), current: step.step === time.step,
      valueText: format(strings.timeline.sequenceValueText, { step: step.step + 1, count: steps.length, label: he(step.label) ?? "" }),
      evidence: (step.evidenceIds ?? []).map((id) => evidenceView(id, ctx)),
      evidenceTitle: format(strings.timeline.stepEvidenceTitle, { step: step.step + 1, label: he(step.label) ?? "" }) })),
    orderEvidenceTitle: format(strings.timeline.orderEvidenceTitle, { name: name ?? "" })
  };
}

/** Evidence items for arbitrary ids (used by the 3D inspector, TASK-6-19); same rendering data as event evidence. */
export function evidenceItems({ world, strings, ids }) {
  const w = world ?? {};
  const ctx = { strings, eventsById: indexById(w.events), locationsById: indexById(w.locations), entitiesById: indexById(w.entities),
    rolesById: indexById(w.roles), sequencesById: indexById(w.sequences), anchorsById: indexById(w.anchors),
    groupsById: indexById(w.alternatives), evidenceById: indexById(w.evidence), catalogById: indexById(w.catalog),
    challenges: Array.isArray(w.challenges) ? w.challenges : [], texts: w.texts ?? null, omissions: w.publicOmissions?.translations ?? null };
  return (ids ?? []).map((id) => evidenceView(id, ctx));
}

/** Certainty chip data for a non-event record (geometry pieces). */
export function recordCertainty(record, strings) {
  return certaintyView(record?.effectiveCertainty ?? record?.certainty, strings, record?.publication === "published", null, record?.tier ?? null);
}

/**
 * buildViewModel({ state, world, mode, strings, selection, stats, importDiagnostics }) — see the contract.
 * `selection` = { selectedEventId }, `stats` = importWorld().stats (for pendingCount),
 * `importDiagnostics` = importWorld().diagnostics (only counted, in preview).
 */
export function buildViewModel({ state, world, mode, strings, selection = {}, stats = null, importDiagnostics = [], conditionalStates = null, dayTypes = null }) {
  const w = world ?? {};
  const ctx = {
    strings,
    eventsById: indexById(w.events),
    locationsById: indexById(w.locations),
    entitiesById: indexById(w.entities),
    rolesById: indexById(w.roles),
    sequencesById: indexById(w.sequences),
    anchorsById: indexById(w.anchors),
    groupsById: indexById(w.alternatives),
    evidenceById: indexById(w.evidence),
    catalogById: indexById(w.catalog),
    challenges: Array.isArray(w.challenges) ? w.challenges : [],
    texts: w.texts ?? null,
    omissions: w.publicOmissions?.translations ?? null,
    geometryByLocation: new Map([...(w.geometry ?? [])].reverse().filter((piece) => piece.locationId).map((piece) => [piece.locationId, piece.id]))
  };
  const isPreview = mode === "preview";
  const banner = isPreview
    ? { kind: "preview_sandbox", text: strings.banner.preview, detail: strings.banner.previewDetail }
    : { kind: "none", text: "", detail: "" };
  const fixture = typeof w.baselineId === "string" && w.baselineId.includes("synthetic");
  const dayTypeValue = state?.query?.dateContext?.dayType ?? "unspecified";
  // R-10: day-type labels and definitions come from data (data/world/day-types.json) when present.
  const dayTypeRecords = new Map((Array.isArray(dayTypes) ? dayTypes : []).map((record) => [record.value ?? record.id, record]));
  const dayTypeLabel = (value) => he(dayTypeRecords.get(value)?.label)
    ?? (value === "unspecified" ? strings.dayType.values[value] : strings.dayType.values[value] ? `${strings.dayType.values[value]} ${strings.dayType.provisionalSuffix}` : value);
  const dayType = {
    value: dayTypeValue,
    label: dayTypeLabel(dayTypeValue),
    definition: he(dayTypeRecords.get(dayTypeValue)?.definition) ?? null,
    // N-06: a chrome fallback label is as provisional as the data it stands in for.
    provisional: dayTypeValue === "unspecified" ? null
      : !dayTypeRecords.has(dayTypeValue) || /^provisional/.test(dayTypeRecords.get(dayTypeValue)?.status ?? "") ? strings.dayType.provisional : null,
    basisLabel: strings.dayType.basis,
    hint: strings.dayType.hint,
    options: Object.keys(strings.dayType.values).map((value) => ({ value, label: dayTypeLabel(value), selected: value === dayTypeValue }))
  };
  const clockEventStarts = [...new Set((w.events ?? []).filter((event) => event.timing?.axis === "clock").map((event) => event.timing.startMinute))]
    .sort((a, b) => a - b);
  const sequences = (w.sequences ?? []).map((sequence) => ({ id: sequence.id, name: he(sequence.name), stepCount: (sequence.steps ?? []).length }));

  if (!state) {
    return {
      mode, banner, fixture, dayType,
      time: null,
      headline: { kind: "error", title: strings.error.title, body: strings.error.stateError },
      empty: null, events: [], unplaced: [], conditional: [], revealedEvents: [], clockNotice: null, activeLocations: [], locationRecords: [], edgeRecords: [],
      timeline: { clockEventStarts, sequences },
      diagnostics: [{ severity: "error", code: "STATE_UNAVAILABLE", userMessage: strings.error.stateError }]
    };
  }

  const q = state.query.time;
  const time = q.axis === "clock"
    ? { axis: "clock", minuteOfDay: q.minuteOfDay, clockLabel: format(strings.time.clockLabel, { time: formatClock(q.minuteOfDay) }) }
    : { axis: "sequence", sequence: sequenceView(q, ctx) };
  time.sequences = sequences;

  const events = state.activeEvents.map((active) => eventView(active, ctx, selection));
  const titleOf = (id) => he(ctx.eventsById.get(id)?.title) ?? id;
  const unplaced = state.unplacedEvents.map((item) => ({ id: item.eventId, title: titleOf(item.eventId), reason: item.reason,
    reasonText: strings.reasons[item.reason] ?? item.reason }));
  // R-01: a day-type filter is described by its basis. An editorial filter is never worded as a fact about the
  // world ("אינו חל"); the visitor can show the event anyway, computed by worldStateAt under one of its own day types.
  const revealedIds = new Set(selection?.revealedEventIds ?? []);
  const conditional = state.conditionalEvents.map((item) => {
    const applicability = applicabilityView(ctx.eventsById.get(item.eventId), strings);
    // The simulation reports the basis per conditional event; it wins over the record when present.
    if (Object.hasOwn(item, "applicabilityBasis")) {
      applicability.basis = item.applicabilityBasis ?? "unknown";
      applicability.basisLabel = strings.applicabilityBasis[applicability.basis] ?? strings.applicabilityBasis.unknown;
    }
    const reasons = strings.conditionalReasons[item.reason] ?? {};
    const revealValue = conditionalStates?.get?.(item.eventId) ?? null;
    const revealEntry = revealValue?.entry ?? revealValue;
    return { id: item.eventId, title: titleOf(item.eventId), reason: item.reason, basis: applicability.basis,
      reasonText: reasons[applicability.basis] ?? reasons.unknown ?? strings.reasons[item.reason] ?? item.reason,
      note: applicability.note, canReveal: Boolean(revealEntry), revealLabel: strings.conditionalReveal.show,
      revealed: Boolean(revealEntry) && revealedIds.has(item.eventId) };
  });
  // N-01/N-08: a revealed card names the day type it was computed for and does not present that day type's
  // timing anchors as the selected day type's timing.
  const revealedEvents = conditional.filter((item) => item.revealed).map((item) => {
    const value = conditionalStates.get(item.id);
    const entry = value?.entry ?? value;
    const computedFor = value?.dayType ?? ctx.eventsById.get(item.id)?.applicability?.dayTypes?.[0] ?? null;
    const computedLabel = dayTypeLabel(computedFor);
    const anchorNotice = computedFor !== dayTypeValue
      ? format(strings.conditionalReveal.anchorNotApplied, { dayType: computedLabel }) : null;
    return { ...eventView(entry, ctx, selection, { anchorNotice }),
      revealedNotice: strings.conditionalReveal.revealedNotice[item.basis] ?? strings.conditionalReveal.revealedNotice.unknown,
      revealedComputedFor: format(strings.conditionalReveal.computedFor, { dayType: computedLabel }),
      revealedNote: item.note, computedForDayType: computedFor };
  });

  let empty = null;
  if (events.length === 0) {
    const eventCount = (w.events ?? []).length;
    if (eventCount === 0) {
      const pendingCount = isPreview ? 0 : stats?.events ? (stats.events.previewOnly ?? 0) : null;
      // TASK-5-24: worded by the policy the bundle was built under; never "waiting for the owner" (ADR-002).
      const template = w.publicationPolicy === "automated_challenge" ? strings.empty.no_approved_data_automated : strings.empty.no_approved_data;
      const text = isPreview ? strings.empty.no_approved_data_preview : format(template, { pendingCount: pendingCount ?? "?" });
      empty = { reason: "no_approved_data", text, pendingCount };
    } else if (conditional.length > 0) {
      const unspecified = conditional.some((item) => item.reason === "DAY_TYPE_UNSPECIFIED");
      const editorial = conditional.every((item) => item.basis === "editorial_viewing_assumption");
      const text = unspecified ? strings.empty.day_type_unspecified
        : editorial ? strings.empty.day_type_not_applicable_editorial : strings.empty.day_type_not_applicable;
      empty = { reason: "day_type_not_applicable", text, pendingCount: null };
    } else if (unplaced.length > 0) {
      empty = { reason: "only_unplaced_events", text: strings.empty.only_unplaced_events, pendingCount: null };
    } else {
      empty = { reason: "no_event_at_time", text: strings.empty.no_event_at_time, pendingCount: null };
    }
    empty.title = strings.empty.titles[empty.reason];
  }

  let clockNotice = null;
  if (q.axis === "clock") {
    const sequenceTimed = [...unplaced, ...conditional]
      .filter((item) => ctx.eventsById.get(item.id)?.timing?.axis === "sequence")
      .map((item) => ({ id: item.id, title: item.title }));
    const seen = new Set();
    const list = sequenceTimed.filter((item) => (seen.has(item.id) ? false : seen.add(item.id)));
    if (list.length) clockNotice = { text: strings.timeline.clockNotice, detail: strings.timeline.clockNoticeDetail, events: list, actionLabel: strings.timeline.switchToSequence };
  }

  const headline = events.length
    ? { kind: "event", title: events.length === 1 ? events[0].title : format(strings.state.eventsCount, { count: events.length }), body: events.length === 1 ? events[0].timingText : "" }
    : { kind: "empty", title: empty.title, body: empty.text };

  const activeLocations = (state.locationStates ?? []).filter((item) => item.activeEventIds.length > 0).map((item) => {
    const location = ctx.locationsById.get(item.locationId);
    const status = location?.spatial?.status ?? "unknown";
    const inferred = item.activeEventIds.some((id) => ctx.eventsById.get(id)?.locationBasis === "inferred");
    return { id: item.locationId, name: he(location?.name), spatialStatusLabel: strings.spatialStatus[status] ?? strings.spatialStatus.unknown,
      inferred, inferredLabel: inferred ? strings.scene.inferredLocation : null,
      evidence: (location?.evidenceIds ?? []).map((id) => evidenceView(id, ctx)),
      evidenceTitle: format(strings.scene.locationEvidenceTitle, { name: he(location?.name) ?? item.locationId }) };
  });

  // Every topology edge ("via" passage) with its evidence (R-07).
  const edgeRecords = (w.locations ?? []).flatMap((location) => (location.spatial?.topologyEdges ?? []).map((edge, index) => ({
    key: `${location.id}:${index}`, from: location.id, to: edge.toLocationId, via: he(edge.via),
    fromName: he(location.name), toName: he(ctx.locationsById.get(edge.toLocationId)?.name),
    evidence: (edge.evidenceIds ?? []).map((id) => evidenceView(id, ctx)),
    evidenceTitle: format(strings.scene.edgeEvidenceTitle, { via: he(edge.via) ?? "" }) })));

  // Every location record with its own evidence, so any place name shown (card, list, scene) has a route to it (R-07).
  const locationRecords = (w.locations ?? []).map((location) => ({ id: location.id, name: he(location.name),
    spatialStatusLabel: strings.spatialStatus[location.spatial?.status ?? "unknown"] ?? strings.spatialStatus.unknown,
    certainty: certaintyView(location.effectiveCertainty ?? location.certainty, strings, location.publication === "published", null, location.tier ?? null),
    evidence: (location.evidenceIds ?? []).map((id) => evidenceView(id, ctx)),
    evidenceTitle: format(strings.scene.locationEvidenceTitle, { name: he(location.name) ?? location.id }) }));

  const diagnostics = (state.diagnostics ?? []).map((item) => ({ severity: item.severity, code: item.code,
    userMessage: strings.diagnostics[item.code] ?? format(strings.diagnostics.generic, { code: item.code }) }));
  if (isPreview) {
    const problems = (importDiagnostics ?? []).filter((item) => item.severity === "error").length;
    if (problems) diagnostics.push({ severity: "warning", code: "IMPORT_ISSUES", userMessage: format(strings.diagnostics.importIssues, { count: problems }) });
  }

  return { mode, banner, fixture, time, dayType, headline, empty, events, unplaced, conditional, revealedEvents, clockNotice, activeLocations, locationRecords, edgeRecords,
    timeline: { clockEventStarts, sequences }, diagnostics };
}
