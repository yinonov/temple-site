// Event cards and the evidence inspector dialog (TASK-4-04, TASK-5-09/5-10). Renders view-model objects only; every
// historical string shown here is a view-model field copied from data, every label comes from strings.he.js.
import { FOCUSABLE, h, langAttrs } from "./dom.js";
import { reportButton } from "./feedback.js";
import { format } from "./strings.he.js";

/**
 * M3-02: how the project reached a source, as a chip next to its locator. "search_snippet" says the page itself was not
 * read; "page_read" says it was. No chip for other or absent modes (vendored texts are checked mechanically).
 */
export function accessChip(mode, strings) {
  const label = strings?.evidence?.accessMode?.[mode];
  return label ? h("span", { class: `access-chip access-${mode}`, "data-access-mode": mode, text: label }) : null;
}

/**
 * Tier chip for a published record (TASK-5-24): "זמני" (provisional) or "נבדק בידי אדם" (expert_reviewed). The
 * full sentence is in the accessible name and the tooltip; the evidence dialog states it in words as well.
 */
export function tierChip(tier, strings, extraClass = "", { decorative = false } = {}) {
  if (!tier) return null;
  // `decorative`: the sentence is printed right next to the chip, so the chip adds only the short visible word.
  return h("span", { class: `tier-chip ${extraClass}`.trim(), "data-tier": tier.value, title: tier.text },
    h("span", { "aria-hidden": "true", text: tier.chip }), decorative ? null : h("span", { class: "sr-only", text: tier.text }));
}

/** The tier stated in words (dialog): full sentence + what the checks were. */
export function tierStatement(tier, strings, label = strings.tier.label) {
  if (!tier) return null;
  return h("div", { class: `tier-statement tier-${tier.value}`, "data-tier": tier.value },
    h("p", {}, h("strong", { text: `${label} ` }), tier.text),
    h("p", { class: "small muted", text: tier.explanation }));
}

export function certaintyChip(certainty, strings, extraClass = "", { prefix = true } = {}) {
  const tradition = certainty.traditionLabel ? ` · ${strings.certainty.traditionPrefix} \u2068${certainty.traditionLabel}\u2069` : "";
  return h("span", { class: `certainty-chip ${extraClass}`.trim(), "data-level": certainty.level ?? "unknown",
    title: certainty.explanationHe }, `${prefix ? `${strings.certainty.chipPrefix} ` : ""}${certainty.labelHe}${tradition}`);
}

function fact(label, ...value) {
  return h("div", { class: "fact" }, h("dt", { text: label }), h("dd", {}, ...value));
}

/** Evidence button for any inspector subject (event, step, order, location). */
export function evidenceButton({ subjectKey, label, text, onOpen, className = "show-evidence", extra = {} }) {
  return h("button", { type: "button", class: className, "data-focus-key": `evidence-${subjectKey}`, "data-subject": subjectKey,
    "aria-label": label, "aria-haspopup": "dialog", on: { click: () => onOpen(subjectKey) }, ...extra }, text);
}

export function alternativesBlock(event, strings, onSelectAlternative) {
  if (!event.alternatives.length) return null;
  return h("div", { class: "alternatives" },
    h("h4", { text: strings.event.alternativesHeading }),
    event.alternatives.map((group) => {
      const name = `alt-${event.id}-${group.groupId}`;
      // R-03: the caveat (or, without one, the group's own notes) is shown uncollapsed.
      const caveat = group.caveat ?? group.notes;
      const status = [h("p", { class: `alt-status ${group.unresolved ? "is-unresolved" : ""}`, text: group.statusLabel }),
        caveat ? h("p", { class: "alt-caveat small" }, h("strong", { text: `${strings.event.alternativeCaveat} ` }), caveat) : null,
        group.caveat && group.notes ? h("details", { class: "alt-notes" }, h("summary", { text: strings.event.alternativeNotes }), h("p", { class: "small", text: group.notes })) : null];
      if (!group.selectable) {
        return h("div", { class: "alt-group", "data-group-id": group.groupId }, h("p", { class: "alt-question", text: group.question }), status,
          h("p", { class: "hint", text: strings.event.alternativeShowAll }),
          h("ul", { class: "alt-options" }, group.options.map((option) => h("li", {},
            h("span", { class: "alt-label", text: option.label }),
            option.effect ? h("span", { class: "alt-effect" }, `${strings.event.effectLabel} ${option.effect}`) : null))));
      }
      const noneSelected = !group.options.some((option) => option.selected);
      const radio = (value, label, checked, effect) => {
        const id = `${name}-${value || "none"}`;
        return h("div", { class: "alt-option" },
          h("input", { type: "radio", id, name, value, checked, "data-focus-key": id,
            on: { change: () => onSelectAlternative(group.groupId, value || null) } }),
          h("label", { for: id }, h("span", { class: "alt-label", text: label }),
            effect ? h("span", { class: "alt-effect" }, `${strings.event.effectLabel} ${effect}`) : null));
      };
      return h("fieldset", { class: "alt-group", "data-group-id": group.groupId },
        h("legend", { class: "alt-question", text: group.question }),
        status,
        group.options.map((option) => radio(option.id, option.label, option.selected, option.effect)),
        radio("", strings.event.alternativeNoChoice, noneSelected, null));
    }));
}

/** One event card. `revealed` cards carry the reason they are normally hidden (R-01). */
export function renderEventCard(event, strings, { onShowEvidence, onSelectAlternative, onOpenSubject, onOpen3d, onReport, idSuffix = "" }) {
  // `idSuffix` keeps ids and focus keys unique when the same event is shown twice (the guided tour card, TASK-6-47).
  const titleId = `event-title-${event.id}${event.revealedNotice ? "-revealed" : ""}${idSuffix}`;
  const p = event.participants;
  return h("article", { class: `event-card ${event.publication === "preview_only" ? "is-preview" : ""} ${event.revealedNotice ? "is-revealed" : ""}`,
    "data-event-id": event.id, "aria-labelledby": titleId },
    event.publication === "preview_only" ? h("p", { class: "card-preview-strip", text: strings.banner.previewStrip }) : null,
    event.revealedNotice ? h("div", { class: "revealed-notice" },
      h("p", {}, h("strong", { text: `${strings.conditionalReveal.revealedHeading}. ` }), event.revealedNotice),
      h("p", { class: "revealed-computed-for", text: event.revealedComputedFor }),
      event.revealedNote ? h("p", { class: "small", text: event.revealedNote }) : null) : null,
    h("header", { class: "card-head" },
      h("h3", { id: titleId, class: "event-title", text: event.title }),
      h("div", { class: "card-badges" },
        certaintyChip(event.certainty, strings),
        tierChip(event.tier, strings),
        event.previewBadge ? h("span", { class: "preview-badge", text: event.previewBadge }) : null)),
    h("p", { class: "certainty-explanation" }, event.certainty.explanationHe, " ", h("span", { class: "muted", text: `(${event.certainty.grantedLabel})` })),
    h("p", { class: "summary", text: event.summary }),
    h("dl", { class: "facts" },
      fact(strings.event.location,
        h("span", { text: event.location.name ?? event.location.id }), " ",
        h("span", { class: `basis-label basis-${event.location.basis}`, text: event.location.basisLabel }),
        event.location.inferredNotice ? h("span", { class: "block location-inferred", text: event.location.inferredNotice }) : null,
        h("span", { class: "muted block", text: event.location.spatialStatusLabel }),
        // R-10: without a 3D view (onOpen3d null) neither the invitation nor its button is shown.
        event.location.otherViewNote && onOpen3d ? h("span", { class: "block small other-view-note" }, event.location.otherViewNote, " ",
          h("button", { type: "button", class: "inline-evidence open-3d", "data-geometry-id": event.location.geometryPieceId,
            text: strings.scene3d.otherViewOpen, on: { click: () => onOpen3d(event.location.geometryPieceId) } })) : null,
        event.location.evidence?.length ? evidenceButton({ subjectKey: `location:${event.location.id}`, className: "inline-evidence",
          label: format(strings.event.locationEvidenceTitle, { name: event.location.name ?? event.location.id }),
          text: strings.event.locationEvidence, onOpen: onOpenSubject }) : null,
        onReport && event.location.id ? reportButton({ target: { kind: "location", id: event.location.id }, subject: event.location.name ?? event.location.id,
          strings, onReport, className: "report-button inline-report" }) : null),
      fact(strings.event.timing, h("span", { class: "timing-text", text: event.timingText })),
      p.length ? fact(strings.event.participants, h("ul", { class: "participants" }, p.map((item) => h("li", {},
        h("strong", { text: item.label ?? item.entityId }),
        h("span", { class: "muted" }, ` · ${strings.event.participantRole} ${item.roleName ?? "—"} · ${strings.event.participantCount} ${item.countLabel}`),
        item.action ? h("span", { class: "block action", text: item.action }) : null)))) : null),
    alternativesBlock(event, strings, onSelectAlternative),
    h("div", { class: "card-actions" },
      h("button", { type: "button", class: "show-evidence", "data-event-id": event.id, "data-focus-key": `show-evidence-${event.id}${idSuffix}`,
        "aria-label": event.showEvidenceLabel, "aria-haspopup": "dialog", on: { click: (e) => onShowEvidence(event.id, e.currentTarget) } },
      event.showEvidenceText),
      onReport ? reportButton({ target: { kind: "event", id: event.id }, subject: event.title ?? event.id, strings, onReport }) : null));
}

/** Source/translator caveat, rendered directly beneath its excerpt (never collapsed). */
function sourceNote(note, lang, strings) {
  if (!note) return null;
  // N-02: "(באנגלית)" only when the note shown is English.
  return h("p", { class: "source-note small" }, h("strong", { text: `${lang === "he" ? strings.evidence.sourceNote : strings.evidence.sourceNoteEnglish} ` }),
    h("span", { ...(lang === "he" ? {} : { lang: "en", dir: "ltr" }), class: "en-note", text: note }));
}

/** R-04: an alternative group a translation or its note refers to, shown next to it. */
function alternativeRefs(refs, strings) {
  if (!refs?.length) return null;
  return refs.map((ref) => h("p", { class: "alt-ref small", "data-group-id": ref.groupId },
    h("strong", { text: `${strings.evidence.alternativeRefLabel} ` }), ref.question ?? ref.groupId, " — ",
    h("span", { class: "alt-ref-status", text: ref.statusLabel }),
    ref.caveat ? h("span", { class: "block", text: ref.caveat }) : null));
}

/** R-05: each source of the record is its own item, in record order; translations are never attached to a quotation. */
function sourceLine(source, strings, seenNotes = new Set(), headingMode = null) {
  const isTranslation = source.role === "translation";
  // M3-13: an identical caveat under several sources of one record is printed once.
  const noteKey = source.note ? `${source.noteLang}|${source.note}` : null;
  const repeatedNote = noteKey !== null && seenNotes.has(noteKey);
  if (noteKey !== null) seenNotes.add(noteKey);
  return h("li", { class: `source-item relation-${source.relation} ${isTranslation ? "is-translation" : ""}`, "data-role": source.role },
    h("p", { class: "source-meta" },
      h("span", { class: `relation-tag relation-${source.relation}`, text: source.relationLabel }), " ",
      h("span", { text: `${source.roleLabel} · ` }),
      source.sourceLabelShown ? [h("bdi", { text: source.sourceLabelShown }),
        source.catalogKindLabel ? h("span", { class: "catalog-kind", text: ` (${source.catalogKindLabel})` }) : null, " · "] : null,
      h("span", { class: "locator", text: source.locatorDisplay ?? "" }),
      // The heading above already shows the primary source's chip; a source reached differently gets its own.
      source.accessMode && source.accessMode !== headingMode ? [" ", accessChip(source.accessMode, strings)] : null),
    isTranslation ? h("p", { class: "translation-label small", text: source.translationLabel }) : null,
    source.excerpt ? h("blockquote", { class: `excerpt ${isTranslation ? "translation" : ""}`, ...langAttrs(source.language) }, source.excerpt) : null,
    repeatedNote ? null : sourceNote(source.note, source.noteLang, strings),
    sourceCredit(source, strings, isTranslation));
}

/** In-place credit: the quotation carries its edition, licence (linked to the licence page when known) and attribution. */
function sourceCredit(source, strings, isTranslation) {
  const link = source.licenseLink
    ? [" · ", h("a", { class: "licence-link", href: source.licenseLink, target: "_blank", rel: "noopener noreferrer", text: strings.licences.licenceLink })] : null;
  const meta = [source.editionLabel ? `${strings.evidence.edition}: ${source.editionLabel}` : null,
    source.licenseLabel ? `${strings.evidence.license}: ${source.licenseLabel}` : null].filter(Boolean).join(" · ");
  const attribution = isTranslation ? source.attribution : source.textAttribution;
  return h("div", { class: "source-credit" },
    meta ? h("p", { class: "muted small source-licence" }, h("bdi", { text: meta }), link) : null,
    attribution ? h("p", { class: "muted small attribution" }, `${strings.licences.attributionLabel}: `,
      h("bdi", { ...(isTranslation ? {} : { lang: "en", dir: "ltr" }), text: attribution })) : null);
}

function challengeBlock(item, strings) {
  return h("div", { class: `skeptic ${item.stale ? "is-stale" : ""}` },
    h("p", { class: "skeptic-head" },
      h("span", { class: "skeptic-state", text: item.staleLabel }), " · ",
      h("span", { text: item.recommendationLabel ?? "" }),
      item.recommendedMaxCertainty ? h("span", { text: ` · ${strings.evidence.recommendedMax} ${item.recommendedMaxCertainty.labelHe}` }) : null),
    item.topConcerns.length ? h("p", { class: "small" }, `${strings.evidence.topConcerns}: `,
      item.topConcerns.map((concern) => `${concern.checkLabel} (${concern.resultLabel})`).join(" · ")) : null,
    item.moreConcernsLabel ? h("p", { class: "muted small", text: item.moreConcernsLabel }) : null,
    // R-19: full prose on demand only.
    item.topConcerns.length ? h("details", { class: "concern-details" }, h("summary", { text: strings.evidence.concernDetails }),
      h("ul", { class: "concerns" }, item.topConcerns.map((concern) => h("li", {},
        h("strong", { text: `${concern.checkLabel} — ${concern.resultLabel}: ` }),
        h("span", { lang: "en", dir: "ltr", class: "en-note", text: concern.note }))))) : null);
}

function skepticBlock(summary, strings) {
  if (!summary) return null;
  return h("section", { class: "ev-section" },
    h("h4", { text: strings.evidence.skeptic }),
    summary.current ? challengeBlock(summary.current, strings) : h("p", { class: "muted", text: summary.text }),
    summary.stale.length ? h("details", { class: "stale-challenges" },
      h("summary", { text: format(strings.evidence.staleSummary, { count: summary.stale.length }) }),
      summary.stale.map((item) => challengeBlock(item, strings))) : null);
}

/** One evidence item inside the dialog. */
export function renderEvidenceItem(item, strings, { onReport = null } = {}) {
  const e = strings.evidence;
  if (item.missing) return h("article", { class: "evidence-item is-missing" }, h("p", { text: item.lifecycleLabel }));
  return h("article", { class: "evidence-item", "data-evidence-id": item.id },
    h("h3", { class: "evidence-heading" }, h("span", { class: "locator", text: item.locatorDisplay ?? "" }),
      item.sourceLabelShown ? h("span", { class: "muted" }, " · ", h("bdi", { text: item.sourceLabelShown })) : null),
    item.accessMode ? h("p", { class: "small evidence-access" }, accessChip(item.accessMode, strings)) : null,
    h("p", { class: "small muted evidence-kind" }, [
      item.roles?.length ? `${e.rolesLabel} ${item.roles.join(", ")}` : null,
      item.claimKindLabel ? `${e.claimKind} ${item.claimKindLabel}` : null,
      item.sourceTypeLabel ? `${e.sourceType} ${item.sourceTypeLabel}` : null].filter(Boolean).join(" · ")),
    h("p", { class: "claim-label small muted", text: e.claim }),
    h("p", { class: "claim", text: item.claim }),
    h("dl", { class: "facts compact" },
      fact(e.lifecycle, item.lifecycleLabel),
      // N-09: the row label already says "סוג הביסוס"; the chip drops its prefix here.
      fact(strings.event.certainty, certaintyChip(item.certainty, strings, "", { prefix: false }),
        item.proposedCertainty ? h("span", { class: "muted block small" }, `${e.proposedCertainty} ${item.proposedCertainty.labelHe}`) : null),
      // 3D-18: the tier sentence is printed once (the chip's own screen-reader text would repeat it).
      item.tier ? fact(strings.tier.label, tierChip(item.tier, strings, "", { decorative: true }), h("span", { class: "block small", text: item.tier.text }),
        h("span", { class: "block small muted", text: item.tier.explanation })) : null),
    h("section", { class: "ev-section" },
      h("h4", { text: e.sourcesHeading }),
      h("ol", { class: "source-list" }, (() => { const seen = new Set(); return (item.allSources ?? []).map((source) => sourceLine(source, strings, seen, item.accessMode)); })()),
      item.omittedTranslations ? h("p", { class: "muted small omitted-translation", lang: "he", text: item.omittedTranslations }) : null,
      alternativeRefs(item.alternativeRefs, strings)),
    item.interpretation ? h("section", { class: "ev-section" },
      h("h4", { text: e.interpretation }),
      item.interpretation.inference ? h("p", { lang: "en", dir: "ltr", class: "en-note", text: item.interpretation.inference }) : null,
      item.interpretation.notStated.length ? h("p", { class: "small", text: e.notStated }) : null,
      h("ul", { lang: "en", dir: "ltr", class: "en-note" }, item.interpretation.notStated.map((text) => h("li", { text })))) : null,
    item.variants.length ? h("section", { class: "ev-section" },
      h("h4", { text: e.variants }),
      h("ul", { class: "variants" }, item.variants.map((variant) => h("li", {},
        h("p", { class: "small muted" }, `${e.variantWitness}: `, h("bdi", { text: variant.witness ?? "" }), variant.segment ? ` (${variant.segment})` : ""),
        h("blockquote", { class: "excerpt", lang: "he", text: variant.reading }),
        h("p", { class: "small" }, `${e.variantEffect}: `, h("span", { lang: "en", dir: "ltr", class: "en-note", text: variant.effect })))))) : null,
    skepticBlock(item.skepticSummary, strings),
    item.period ? h("section", { class: "ev-section" },
      h("h4", { text: e.period }),
      h("dl", { class: "facts compact" },
        fact(e.periodSource, h("span", { lang: "en", dir: "ltr", class: "en-note", text: item.period.sourceDate ?? "" })),
        fact(e.periodDescribed, h("span", { lang: "en", dir: "ltr", class: "en-note", text: item.period.describedPeriod ?? "" })),
        item.period.gapRiskLabel ? fact(e.gapRisk, item.period.gapRiskLabel) : null),
      item.periodNote ? h("p", { lang: "en", dir: "ltr", class: "en-note", text: item.periodNote }) : null) : null,
    onReport ? h("div", { class: "evidence-actions" }, reportButton({ target: { kind: "evidence", id: item.id },
      subject: item.locatorDisplay ?? item.id, strings, onReport })) : null);
}

/**
 * Evidence dialog controller: native <dialog> (modal: background inert), plus an explicit Tab trap,
 * Escape closes, focus returns to the opener (or the subject's button after a re-render).
 * open(subject) with subject = { key, title, evidence[], location?, preview }.
 */
export function createEvidenceDialog({ dialog, title, body, closeButton, strip, strings, onClose, onReport = null }) {
  let returnKey = null;
  let opener = null;
  closeButton.textContent = strings.evidence.close;
  let active = false;
  // The native "close" event is dispatched asynchronously; closing is finished synchronously here so that a
  // quick reopen (Escape then Enter/Space) can never be closed by a stale event.
  const finish = () => {
    if (!active) return;
    active = false;
    const key = returnKey;
    const previous = opener;
    returnKey = null;
    opener = null;
    onClose();
    const target = previous?.isConnected && previous !== document.body ? previous
      : key ? document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null;
    if (target) target.focus();
  };
  const closeNow = () => { if (dialog.open) dialog.close(); finish(); };
  closeButton.addEventListener("click", closeNow);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeNow(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest("[hidden]") && el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("close", () => { if (!dialog.open) finish(); });
  function fill(subject) {
    // R-09: the preview marker is part of the dialog header, so a dialog screenshot cannot pass as published.
    strip.hidden = !subject.preview;
    strip.textContent = subject.preview ? strings.evidence.previewStrip : "";
    title.textContent = subject.title;
    const location = subject.location ? h("p", { class: "dialog-location" },
      h("strong", { text: `${strings.scene.inspectorLocation} ` }), subject.location.name ?? subject.location.id ?? "", " ",
      h("span", { class: `basis-label basis-${subject.location.basis}`, text: subject.location.basisLabel }), " ",
      h("span", { class: "muted", text: `· ${subject.location.drawnLabel ?? subject.location.spatialStatusLabel}` }),
      subject.location.inferredNotice ? h("span", { class: "block location-inferred", text: subject.location.inferredNotice }) : null) : null;
    const tier = subject.tier ? tierStatement(subject.tier, strings, subject.tierLabel ?? strings.tier.label) : null;
    // TASK-6-19: a subject may bring its own leading block (3D piece provenance) and a report target for itself.
    const report = subject.report && onReport ? h("p", { class: "subject-report" }, reportButton({ target: subject.report.target,
      subject: subject.report.subject, strings, onReport })) : null;
    // T-06: the sequence-level evidence (the story-order record every stop of a sequence repeats) sits behind one disclosure.
    const collapseIds = new Set(subject.collapseIds ?? []);
    const own = subject.evidence.filter((item) => !collapseIds.has(item.id));
    const shared = subject.evidence.filter((item) => collapseIds.has(item.id));
    const sequenceBlock = shared.length ? h("details", { class: "sequence-evidence" },
      h("summary", { text: format(strings.evidence.sequenceEvidence, { count: shared.length }) }),
      shared.map((item) => renderEvidenceItem(item, strings, { onReport }))) : null;
    // T-11: an event-level alternative group the visitor cannot select (show_all) is shown with its question and caveat.
    const groups = subject.alternatives?.length ? alternativesBlock({ id: subject.eventId ?? "event", alternatives: subject.alternatives }, strings, null) : null;
    body.replaceChildren(...[location, tier, report, subject.extra ?? null, groups, ...own.map((item) => renderEvidenceItem(item, strings, { onReport })), sequenceBlock].filter(Boolean));
  }
  return {
    open(subject) {
      returnKey = subject.returnKey;
      opener = document.activeElement;
      fill(subject);
      body.scrollTop = 0;
      if (!dialog.open) dialog.showModal();
      active = true;
      closeButton.focus();
    },
    /** Replace the content of an open dialog (e.g. after an alternative changed inside it); focus is kept. */
    update(subject) {
      if (!dialog.open) return;
      const scroll = body.scrollTop;
      const key = document.activeElement?.dataset?.groupId ?? null;
      fill(subject);
      body.scrollTop = scroll;
      if (key) dialog.querySelector(`[data-group-id="${CSS.escape(key)}"]`)?.focus();
    },
    close: closeNow,
    isOpen: () => dialog.open
  };
}
