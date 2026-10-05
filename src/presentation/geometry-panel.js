// 3D panel chrome and the geometry inspector block (TASK-6-19/6-20). Renders geometry-view.js objects only.
// The Three.js renderer (src/scene/three-renderer.js) is loaded lazily by app.js; this module never imports it.
import { h } from "./dom.js";
import { accessChip, certaintyChip } from "./evidence-panel.js";
import { format } from "./strings.he.js";

function optionDetails(group, s3, strings) {
  const rows = group.options.filter((option) => option.effect || option.locators.length);
  return rows.length ? h("details", { class: "scene3d-option-details small" }, h("summary", { text: s3.optionDetails }),
    h("ul", {}, rows.map((option) => h("li", { "data-option-id": option.id, class: option.selected ? "is-selected" : "" },
      h("strong", { text: option.label }), option.effect ? ` — ${option.effect}` : "",
      option.locators.length ? h("span", { class: "muted" }, " ", s3.optionEvidence, " ",
        (option.locatorItems ?? option.locators.map((display) => ({ display, accessMode: null }))).map((entry, index) =>
          [index ? "; " : null, h("span", { class: "locator", text: entry.display }), entry.accessMode ? [" ", accessChip(entry.accessMode, strings)] : null])) : null)))) : null;
}

/**
 * The single alternatives panel (TASK-6-31): every alternative group of the world. Visitor-selectable groups get a
 * picker (the same store action as the inspector's per-piece pickers); show_all groups are listed as shown together.
 */
export function renderAlternatives(container, view, strings, { onSelect }) {
  const s3 = strings.scene3d;
  const { selectable, shownTogether } = view.alternatives;
  container.hidden = selectable.length + shownTogether.length === 0;
  if (container.hidden) { container.replaceChildren(); return; }
  const head = (group) => [
    h("p", { class: "scene3d-question", text: group.question }),
    group.certainty ? h("p", { class: "small" }, certaintyChip(group.certainty, strings)) : null,
    group.caveat ? h("p", { class: "small muted", text: group.caveat }) : null,
    group.notice ? h("p", { class: `scene3d-notice ${group.assumed ? "assumed-notice" : ""}`, text: group.notice }) : null];
  container.replaceChildren(...[
    h("h3", { text: s3.assumptionsHeading, id: "scene3d-assumptions-heading", tabindex: "-1" }),
    h("p", { class: "hint", text: s3.alternativesIntro }),
    selectable.length ? h("h4", { text: s3.selectableHeading }) : null,
    selectable.length ? h("ul", { class: "scene3d-assumptions" }, selectable.map((group) => {
      const selectId = `scene3d-alt-${group.groupId}`;
      return h("li", { class: `scene3d-assumption ${group.assumed ? "is-assumed" : ""}`, "data-group-id": group.groupId, "data-status": group.status, "data-policy": "visitor_selectable" },
        head(group),
        h("div", { class: "field" },
          h("label", { for: selectId, class: "sr-only", text: group.chooseLabel }),
          h("select", { id: selectId, "data-group-id": group.groupId, "data-focus-key": selectId,
            on: { change: (event) => onSelect(group.groupId, event.currentTarget.value || null) } },
          h("option", { value: "", text: s3.notChosenOption, selected: group.status !== "selected" }),
          group.options.map((option) => h("option", { value: option.id, text: option.label, selected: group.status === "selected" && option.selected })))),
        optionDetails(group, s3, strings),
        group.usedByText ? h("p", { class: "small muted", text: group.usedByText }) : h("p", { class: "small muted", text: s3.notUsedNote }));
    })) : null,
    shownTogether.length ? h("h4", { text: s3.shownTogetherHeading }) : null,
    shownTogether.length ? h("p", { class: "hint", text: s3.shownTogetherNote }) : null,
    shownTogether.length ? h("ul", { class: "scene3d-assumptions" }, shownTogether.map((group) =>
      h("li", { class: "scene3d-assumption", "data-group-id": group.groupId, "data-policy": "show_all" },
        head(group),
        h("ul", { class: "scene3d-options" }, group.options.map((option) => h("li", { text: option.label }))),
        optionDetails(group, s3, strings),
        group.usedByText ? h("p", { class: "small muted", text: group.usedByText }) : null))) : null].filter(Boolean));
}

/** Pieces that cannot be drawn are listed, never silently dropped. */
export function renderUnresolved(container, view, strings) {
  container.hidden = view.unresolved.length === 0;
  container.replaceChildren(...(view.unresolved.length ? [h("h3", { text: strings.scene3d.unresolvedHeading }),
    h("ul", { class: "scene3d-unresolved" }, view.unresolved.map((item) => h("li", { "data-ref-id": item.id, "data-reason": item.reason }, item.text)))] : []));
}

/**
 * Pieces whose data covers other options of a group only (TASK-6-44) are listed, never dropped. M3-08: one line per
 * piece (naming the current option) and one disclosure holding the full list of options that show each piece.
 */
export function renderNotShown(container, view, strings) {
  const s3 = strings.scene3d;
  container.hidden = view.notShown.length === 0;
  container.replaceChildren(...(view.notShown.length ? [h("h3", { text: s3.notShownHeading }), h("p", { class: "hint", text: s3.notShownIntro }),
    h("ul", { class: "scene3d-not-shown" }, view.notShown.map((item) => h("li", { "data-ref-id": item.id, "data-group-id": item.groupId, text: item.line ?? item.text }))),
    h("details", { class: "scene3d-not-shown-details small", id: "scene3d-not-shown-details" }, h("summary", { text: s3.notShownOptions }),
      h("ul", {}, view.notShown.map((item) => h("li", { "data-ref-id": item.id }, h("strong", { text: `${item.label}: ` }), item.shownIn ?? item.optionsText))))] : []));
}

/** Text list of pieces (used when the renderer is unavailable; the renderer brings its own list otherwise). */
export function renderPieceList(container, view, strings, { onOpen, access = {} }) {
  container.replaceChildren(...(view.pieces.length ? [h("h3", { text: strings.scene3d.listTitle }),
    h("ul", { class: "scene3d-text-pieces" }, view.pieces.map((piece) => h("li", {},
      h("button", { type: "button", class: `scene3d-text-piece scene3d-${piece.style}`, "data-ref-id": piece.id, "data-focus-key": `geo-${piece.id}`,
        on: { click: () => onOpen(piece.id) } }, piece.label, " ", h("span", { class: "muted small", title: piece.assumedText ?? "", text: `(${piece.styleLabel}${piece.assumedSpecific ? ` · ${strings.scene3d.assumed}` : ""})` }),
        access[piece.id] ? h("span", { class: `persona-status persona-status-${access[piece.id]}`, "data-access": access[piece.id], text: ` ${strings.scene3d.access[access[piece.id]]}` }) : null))))] : []));
}

function provenanceRow(dim, strings) {
  const t = strings.scene3d.inspector;
  const locatorLine = (label, display, access, cls = "small") => h("p", { class: cls }, `${label} `, h("span", { class: "locator", text: display }), access ? [" ", accessChip(access, strings)] : null);
  // M3-12: a placeholder is prefixed "השערה:" and muted; it never looks like a sourced figure.
  const value = dim.placeholder
    ? [h("span", { class: "geo-placeholder-prefix", text: `${t.speculativePrefix} ` }), h("span", { class: "geo-placeholder-value muted", text: dim.placeholderText ?? "" }), " ",
      h("span", { class: "muted small", text: `(${t.speculativeValue})` })]
    : [dim.valueText ?? "", dim.valueText ? " " : "", dim.metresText ? h("span", { class: "muted", text: dim.metresText }) : null,
      dim.rangeText ? h("span", { class: "muted small", text: ` ${dim.rangeText}` }) : null];
  return h("li", { class: `geo-dimension style-${dim.style} ${dim.placeholder ? "is-placeholder" : ""}`.trim(), "data-dimension": dim.key, "data-speculative": dim.speculative ? "true" : "false",
    "data-placeholder": dim.placeholder ? "true" : "false" },
    h("p", {}, h("strong", { text: `${dim.keyLabel}: ` }), ...value,
      " ", h("span", { class: `geo-style geo-style-${dim.style}`, text: `[${dim.sourceLabel}]` })),
    // 3D-01: a speculative value always carries its note, directly under the number.
    dim.speculative ? h("p", { class: "small geo-speculative geo-note" }, h("strong", { text: `${t.noSourceNote} ` }), dim.note ?? t.noteMissing) : null,
    dim.locator ? locatorLine(t.sourceLabel, dim.locator, dim.locatorAccess) : null,
    dim.derivedFrom ? locatorLine(t.derivedFrom, dim.derivedFrom, dim.derivedAccess, "small muted") : null,
    dim.alternativeText ? h("p", { class: "small", text: dim.alternativeText }) : null,
    dim.conversionText ? h("p", { class: `small ${dim.assumed ? "assumed-notice" : "muted"}`, text: dim.conversionText }) : null);
}

/** The geometry provenance block shown at the top of the inspector dialog. */
export function renderGeometryProvenance(subject, strings, { onOpenEvent, onSelectAlternative, access = null }) {
  const t = strings.scene3d.inspector;
  const piece = subject.piece;
  const p = piece.placement;
  return h("section", { class: "geo-provenance", "data-geometry-id": piece.id },
    // N-02: a conflict under the current choices comes first.
    subject.conflicts?.length ? h("div", { class: "geo-conflicts", role: "note" }, subject.conflicts.map((item) => h("p", { "data-code": item.code, text: item.text }))) : null,
    h("p", { class: "small" }, certaintyChip(piece.certainty, strings), " ",
      h("span", { class: "muted", text: [piece.planStyleLabel ?? `${t.sizeStyle} ${piece.sizeStyleLabel}`, piece.heightStyleLabel,
        piece.placementStyleLabel === t.placementRootStyle ? piece.placementStyleLabel : `${t.placementStyle} ${piece.placementStyleLabel}`].filter(Boolean).join(" · ") })),
    // M2-02: the chosen persona's verdict for this piece, with the governing rule(s).
    access ? h("div", { class: `geo-access persona-row persona-${access.status}`, "data-access": access.status, "data-persona-id": access.personaId },
      h("h3", { text: t.accessHeading }),
      h("p", {}, format(t.accessLine, { persona: access.personaLabel }), " ", h("strong", { class: `persona-status persona-status-${access.status}`, text: access.statusLabel })),
      ...access.ruleLines.map((line) => h("p", { class: "small", "data-rule-id": line.ruleId }, `${t.accessRule} `, line.text, " ",
        ...line.evidence.map((ev) => [h("span", { class: "locator", text: ev.locator ?? ev.sourceLabel ?? "" }), ev.accessMode ? [" ", accessChip(ev.accessMode, strings)] : null, " "])))) : null,
    piece.locationNote ? h("p", { class: "small geo-location-note", "data-location-note": "true", text: piece.locationNote }) : null,
    piece.assumedText ? h("p", { class: "small assumed-notice", "data-assumed-groups": piece.assumedGroupIds.join(" "), text: piece.assumedText }) : null,
    h("h3", { text: t.sizeHeading }),
    h("ul", { class: "geo-dimensions" }, piece.dimensions.map((dim) => provenanceRow(dim, strings))),
    // M3-07: the four side lengths of a drawn outline, each with its own provenance (sourced / speculative).
    piece.outline ? h("div", { class: "geo-outline", "data-outline": "true" }, h("h3", { text: piece.outline.heading }),
      h("ul", { class: "geo-dimensions" }, piece.outline.sides.map((side) => provenanceRow(side, strings))),
      piece.outline.construction ? h("p", { class: "small geo-speculative" }, h("strong", { text: `${t.outlineConstruction} ` }), piece.outline.construction) : null) : null,
    piece.appliesNote ? h("p", { class: "small geo-applies", "data-applies-to": "true", text: piece.appliesNote }) : null,
    piece.lodNote ? h("p", { class: "small geo-lod", "data-lod": "thinned", text: piece.lodNote }) : null,
    p ? h("div", { class: "geo-placement" },
      h("h3", { text: t.placementHeading }),
      h("p", {}, p.text, " ", h("span", { class: `geo-style geo-style-${p.style}`, text: `[${p.sourceLabel}]` })),
      p.locator ? h("p", { class: "small" }, `${t.sourceLabel} `, h("span", { class: "locator", text: p.locator }), p.locatorAccess ? [" ", accessChip(p.locatorAccess, strings)] : null) : null,
      p.note ? h("p", { class: "small geo-speculative" }, h("strong", { text: `${t.noSourceNote} ` }), p.note) : null,
      p.offset || p.crossOffset ? h("ul", { class: "geo-dimensions" }, [p.offset, p.crossOffset].filter(Boolean).map((row) => provenanceRow(row, strings))) : null,
      p.axes?.length ? h("div", { class: "small geo-axes" }, h("p", { text: t.axesHeading }),
        h("ul", {}, p.axes.map((axis) => h("li", { "data-axis": axis.axis, "data-basis": axis.basis, text: axis.text })))) : null,
      p.defaults.length ? h("ul", { class: "small geo-defaults" }, p.defaults.map((text) => h("li", { text }))) : null) : null,
    subject.notSwitchable?.length ? h("ul", { class: "small geo-not-switchable" }, subject.notSwitchable.map((item) => h("li", { "data-group-id": item.groupId, text: item.text }))) : null,
    subject.alternatives.length ? h("div", {},
      h("h3", { text: t.alternativesHeading }),
      h("ul", { class: "geo-alternatives" }, subject.alternatives.map((group) => h("li", {},
        h("p", { class: "small" }, h("strong", { text: group.question }), group.notice ? ` — ${group.notice}` : ""),
        // N-03: a group without a selector lists its options right here.
        !group.selectable ? h("ul", { class: "small geo-group-options" }, group.options.map((option) => h("li", { text: option.label }))) : null,
        group.selectable ? h("select", { "aria-label": group.chooseLabel, "data-group-id": group.groupId,
          on: { change: (event) => onSelectAlternative(group.groupId, event.currentTarget.value || null) } },
        h("option", { value: "", text: strings.scene3d.notChosenOption, selected: group.status !== "selected" }),
        group.options.map((option) => h("option", { value: option.id, text: option.label, selected: group.status === "selected" && option.selected }))) : null)))) : null,
    h("div", { class: "geo-events" },
      h("h3", { text: t.eventsHeading }),
      subject.activeEvents.length
        ? h("ul", {}, subject.activeEvents.map((event) => h("li", {}, h("button", { type: "button", class: "inline-evidence geo-open-event", "data-event-id": event.id,
          text: format(t.openEvent, { title: event.title }), on: { click: () => onOpenEvent(event.id) } }))))
        : h("p", { class: "small muted", text: t.noEvents })),
    h("h3", { text: t.evidenceHeading }));
}

/** 3D-05: the amah reading next to the canvas; activating it moves to the amah selector. */
export function renderAmahChip(container, view, strings, { onChange, onMore }) {
  const amah = view.amah;
  container.hidden = !amah;
  if (!amah) { container.replaceChildren(); return; }
  const s3 = strings.scene3d;
  const more = amah.otherAssumptions;
  container.replaceChildren(...[
    h("button", { type: "button", class: `scene3d-amah-chip ${amah.assumed ? "is-assumed" : ""}`, id: "scene3d-amah-chip", "data-focus-key": "scene3d-amah-chip",
      text: amah.text, on: { click: onChange } }),
    more ? h("button", { type: "button", class: "scene3d-more-assumptions", text: more === 1 ? s3.moreAssumptionsOne : format(s3.moreAssumptions, { count: more }),
      on: { click: onMore } }) : null].filter(Boolean));
}

/** N-02: solver conflicts next to the canvas. */
export function renderConflicts(container, view, strings) {
  container.hidden = view.conflicts.length === 0;
  container.replaceChildren(...(view.conflicts.length ? [h("p", { class: "scene3d-conflicts-title", text: strings.scene3d.conflictsHeading }),
    h("ul", {}, view.conflicts.map((item) => h("li", { "data-ref-id": item.refId, "data-code": item.code, text: item.text })))] : []));
}

/** "מי אתם?" (TASK-6-35): the persona picker, the access legend and, for the chosen persona, the governing rule per place. */
export function renderPersona(container, personaView, strings, { onSelect, onOpenRule = () => {} }) {
  const t = strings.scene3d.persona;
  container.hidden = !personaView;
  if (!personaView) { container.replaceChildren(); return; }
  const selectId = "scene3d-persona-select";
  const row = (item) => h("li", { class: `persona-row persona-${item.status}`, "data-location-id": item.locationId, "data-status": item.status },
    h("p", {}, h("strong", { text: item.name }), " ", h("span", { class: `persona-status persona-status-${item.status}`, text: item.statusLabel })),
    ...item.ruleLines.map((line) => h("div", { class: "small persona-rule", "data-rule-id": line.ruleId },
      h("p", {}, `${t.rule} `, line.text, " ", certaintyChip(line.certainty, strings)),
      ...line.evidence.map((ev) => h("p", { class: "muted" }, `${t.source} `, ev.sourceLabelShown ?? "", ev.sourceLabelShown && ev.locator ? " " : "", ev.locator ? h("span", { class: "locator", text: ev.locator }) : null,
        ev.accessMode ? [" ", accessChip(ev.accessMode, strings)] : null,
        " ", ev.certainty ? certaintyChip(ev.certainty, strings) : null)),
      // M2-02: the evidence dialog for this rule's evidence ids.
      h("p", {}, h("button", { type: "button", class: "inline-evidence persona-rule-evidence", "data-rule-id": line.ruleId, "data-focus-key": `persona-rule-${line.ruleId}`,
        text: t.evidenceButton, on: { click: () => onOpenRule(line.ruleId) } })))),
    item.conditional ? h("p", { class: "small muted", text: t.conditional }) : null,
    item.pieceCount ? h("p", { class: "small muted", text: format(t.pieces, { count: item.pieceCount }) }) : h("p", { class: "small muted", text: t.noPieces }));
  const decided = personaView.rows.filter((item) => item.status !== "no_source");
  const open = personaView.rows.filter((item) => item.status === "no_source");
  const chosen = personaView.options.find((option) => option.id === personaView.personaId);
  container.replaceChildren(...[
    h("h3", { text: t.heading, id: "scene3d-persona-heading" }),
    h("p", { class: "hint", text: t.intro }),
    h("div", { class: "field" },
      h("label", { for: selectId, class: "sr-only", text: t.selectLabel }),
      h("select", { id: selectId, "data-focus-key": selectId, on: { change: (event) => onSelect(event.currentTarget.value || null) } },
        h("option", { value: "", text: t.none, selected: !personaView.personaId }),
        personaView.options.map((option) => h("option", { value: option.id, text: option.shortLabel ?? option.label, selected: option.id === personaView.personaId })))),
    // M2-10: the full role name (the select shows the short one); also the persona caption next to the canvas (M2-03).
    chosen ? h("p", { class: "persona-caption", "data-persona-caption": "true", text: format(t.caption, { name: chosen.label }) }) : null,
    // M2-03: what each styling means; swatches use the same colours as the canvas (styles.css).
    h("div", { class: "persona-legend", "data-persona-legend": "true" },
      h("p", { class: "small" }, h("strong", { text: t.legendHeading })),
      h("ul", { class: "persona-legend-items small" }, ["allowed", "forbidden", "no_source"].map((key) =>
        h("li", { "data-access": key }, h("span", { class: `persona-swatch persona-swatch-${key}`, "aria-hidden": "true" }), " ", t.legend[key])))),
    personaView.personaId ? h("div", { class: "persona-result", "data-persona-id": personaView.personaId },
      h("p", { class: "small", "data-persona-summary": "true", text: format(t.summary, personaView.counts) }),
      h("p", { class: "small muted", text: t.dimNote }),
      personaView.exterior?.noneHasRule ? h("p", { class: "small persona-exterior-none", "data-persona-exterior": "none", text: format(t.exteriorNone, { count: personaView.exterior.count }) }) : null,
      decided.length ? h("h4", { text: t.rulesHeading }) : null,
      decided.length ? h("ul", { class: "persona-rows" }, decided.map(row)) : null,
      open.length ? h("h4", { text: t.noRulesHeading }) : null,
      open.length ? h("ul", { class: "persona-rows" }, open.map(row)) : null) : null
  ].filter(Boolean));
}
