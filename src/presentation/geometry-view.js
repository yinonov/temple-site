// 3D view model (TASK-6-19/6-20). Pure: no DOM, no Three.js. Turns solveGeometry() output + the world into what
// the 3D panel and the geometry inspector show. Every place name, number, note and option label is copied from
// data records; chrome comes from strings.scene3d. Contract: docs/scene/3d-architecture.md §3, §6.
import { format } from "./strings.he.js";
import { UNIT_CONVERSION_GROUPS } from "../domain/measurement-vocabulary.js";
import { evidenceItems, isolateLatin, recordCertainty } from "./view-model.js";
import { thinColumns } from "../scene/geometry/portico-lod.js";

const he = (text) => (text && typeof text === "object" ? text.he ?? null : typeof text === "string" ? text : null);
const byId = (list) => new Map((Array.isArray(list) ? list : []).map((record) => [record.id, record]));

// Unit conversion groups (tefach, cubit_greek, stadion, amah) are resolved by the solver itself through
// UNIT_CONVERSION_GROUPS; the UI never builds a conversion. An unresolved unit names its group so the visitor can choose.

function noteText(record, ref) {
  if (!record || !ref) return null;
  if (ref.kind === "geometryNote") {
    const dim = record.dimensions?.[ref.dimension];
    return he(ref.optionId ? dim?.byOption?.[ref.optionId]?.note : dim?.note) ?? he(dim?.note);
  }
  if (ref.kind === "geometryCountNote") { // TASK-6-43: counts (rows, columns, steps) carry notes like dimensions
    const count = record.counts?.[ref.field];
    return he(ref.optionId ? count?.byOption?.[ref.optionId]?.note : count?.note) ?? he(count?.note);
  }
  if (ref.kind === "geometryOutlineNote") { // M3-07: the four side lengths and the construction convention of an outline
    const entry = record.outline?.byOption?.[ref.optionId];
    return ref.field === "construction" ? he(entry?.construction) : he(entry?.sides?.[ref.field]?.note) ?? he(entry?.construction);
  }
  if (ref.kind === "geometryPlacementNote") {
    // N-01: offsets and cross-offsets may vary by option; their per-option note wins.
    if (ref.field === "offset" || ref.field === "crossOffset") {
      const value = record.placement?.[ref.field];
      return he(ref.optionId ? value?.byOption?.[ref.optionId]?.note : null) ?? he(value?.note);
    }
    return he(record.placement?.note);
  }
  return null;
}

function primarySource(evidence) {
  const sources = evidence?.sources ?? [];
  return sources.find((source) => source.relation === "supports" && source.excerptRole === "quotation") ?? sources[0];
}

function locatorOf(evidence) {
  return primarySource(evidence)?.locator?.display ?? null;
}

/** M3-02: how the primary source was reached ("search_snippet" | "page_read"); null when not stated or mechanically checked. */
function accessOf(evidence) {
  const mode = primarySource(evidence)?.accessMode;
  return mode === "search_snippet" || mode === "page_read" ? mode : null;
}

function optionLabel(groups, groupId, optionId) {
  return he(groups.get(groupId)?.options?.find((option) => option.id === optionId)?.label) ?? optionId ?? null;
}

/** Rounded metres (3D-13): whole metres from 10 m, one decimal below; the "≈" stays in the template. */
export function roundMetres(metres) {
  if (!Number.isFinite(metres)) return metres;
  return Math.abs(metres) >= 10 ? Math.round(metres) : Math.round(metres * 10) / 10;
}

/** Hebrew unit label agreeing with the number (3D-14): singular for 1, plural otherwise. */
function unitLabelFor(unit, value, strings) {
  const s3 = strings.scene3d;
  if (value === 1) return s3.units[unit] ?? unit ?? "";
  return s3.unitsPlural?.[unit] ?? s3.units[unit] ?? unit ?? "";
}

/**
 * The note text a speculative value must carry. A value is speculative when its style is speculative — a
 * `{ speculative: true }` dimension, a speculative alternative option (`source: "alternative"`, `style:
 * "speculative"`, `optionSpeculative`) or a solver default. 3D-01: the note is resolved whenever a `noteRef` exists,
 * including `noteRef.optionId`; a speculative number is never shown without it (a fixed chrome line when the data
 * has none).
 */
function speculativeNote(dim, record, t) {
  if (dim.default === "height_unstated") return t.heightUnstated;
  const speculative = dim.style === "speculative" || dim.source === "speculative" || dim.optionSpeculative === true;
  if (!speculative) return null;
  const ref = dim.noteRef ? { ...dim.noteRef, optionId: dim.noteRef.optionId ?? dim.optionId } : null;
  return noteText(record, ref) ?? noteText(record, dim.noteRef) ?? t.noteMissing;
}

/** N-05: axis wording follows the piece's actual orientation (a north–south wall's length runs north–south). */
function dimensionLabel(key, t, orientation) {
  if (orientation === "north_south" && (key === "length" || key === "thickness")) return t.dimensionNorthSouth[key] ?? t.dimension[key] ?? key;
  return t.dimension[key] ?? key;
}

function dimensionView(key, dim, ctx, record, { orientation = null, label = null } = {}) {
  const { strings, groups, evidence } = ctx;
  const t = strings.scene3d.inspector;
  const ev = dim.evidenceId ? evidence.get(dim.evidenceId) : null;
  const conversion = dim.conversion;
  let conversionText = null;
  if (conversion?.kind === "alternative") {
    conversionText = `${format(t.conversion, { option: optionLabel(groups, conversion.groupId, conversion.optionId) })}${conversion.assumed ? ` ${t.conversionAssumed}` : ""}`;
  } else if (conversion?.kind === "display") {
    const via = conversion.evidenceId ? (locatorOf(evidence.get(conversion.evidenceId)) ?? conversion.evidenceId) : t.source.speculative;
    conversionText = format(t.displayConversion, { text: via });
  }
  // 3D-13: the metric size depends on the amah reading, so the range over every amah option is shown with it.
  let rangeText = null;
  const amahGroup = groups.get("altgrp-amah-length");
  if (dim.unit === "amah" && typeof dim.value === "number" && amahGroup) {
    const factors = (amahGroup.options ?? []).map((option) => option.metres).filter((value) => typeof value === "number");
    if (factors.length > 1) {
      const low = roundMetres(dim.value * Math.min(...factors));
      const high = roundMetres(dim.value * Math.max(...factors));
      // LRI…PDI keeps "low–high" in reading order inside Hebrew text.
      if (low !== high) rangeText = format(t.amahRange, { low: `\u2066${low}`, high: `${high}\u2069` });
    }
  }
  const note = speculativeNote(dim, record, t);
  // The tag follows the style, not the source: a speculative option is "השערה", never "לפי חלופה".
  const tagKey = note && dim.default !== "height_unstated" ? "speculative" : dim.style === "speculative" ? "speculative" : dim.source;
  // M3-12: a placeholder (speculative style, no evidence) is a display value, never a figure in a source's unit.
  const placeholder = dim.style === "speculative" && !dim.evidenceId && dim.value !== undefined;
  const plain = dim.unit === "metre" || dim.unit === "item";
  return {
    key,
    keyLabel: label ?? dimensionLabel(key, t, orientation),
    valueText: dim.value !== undefined ? (dim.unit === "item" ? String(dim.value) : format(t.value, { value: dim.value, unit: unitLabelFor(dim.unit, dim.value, strings) })) : null,
    // A value already in metres (or a count) is not repeated as "≈ … מ׳".
    metresText: plain ? null : format(t.metres, { metres: roundMetres(dim.metres) }),
    placeholder,
    placeholderText: placeholder ? (plain ? (dim.unit === "item" ? String(dim.value) : format(t.value, { value: dim.value, unit: unitLabelFor(dim.unit, dim.value, strings) }))
      : format(t.metres, { metres: roundMetres(dim.metres) })) : null,
    rangeText,
    source: dim.source,
    sourceLabel: t.source[tagKey] ?? dim.source,
    style: dim.style,
    styleLabel: strings.scene3d.certaintyStyle[dim.style] ?? dim.style,
    speculative: Boolean(note),
    evidenceId: dim.evidenceId ?? null,
    // A speculative value never carries a plain "מקור:" line; evidence it was derived from is named as such.
    locator: !note && ev ? locatorOf(ev) : null,
    locatorAccess: !note && ev ? accessOf(ev) : null,
    derivedFrom: note && ev ? locatorOf(ev) : null,
    derivedAccess: note && ev ? accessOf(ev) : null,
    note,
    alternativeText: dim.groupId ? format(t.alternative, { question: he(groups.get(dim.groupId)?.question) ?? dim.groupId,
      option: optionLabel(groups, dim.groupId, dim.optionId) }) : null,
    conversionText,
    groupId: dim.groupId ?? null,
    conversionGroupId: conversion?.groupId ?? null,
    assumed: Boolean(dim.assumed)
  };
}

function placementView(placement, ctx, record, labelOf) {
  const { strings, evidence } = ctx;
  const t = strings.scene3d.inspector;
  if (!placement) return null;
  const ev = placement.evidenceId ? evidence.get(placement.evidenceId) : null;
  return {
    // 3D-14: "‹relation›: ‹label›" — no prefix glued to a definite article.
    text: placement.relation ? format(t.relationText, { relation: t.relation[placement.relation] ?? placement.relation,
      of: placement.of ? labelOf(placement.of) : "" }) : t.root,
    source: placement.source,
    sourceLabel: t.placementSource[placement.source] ?? placement.source,
    style: placement.style,
    // 3D-07: the model origin is not a claim, whatever style the solver gives it.
    styleLabel: placement.source === "root" || placement.style === "origin" ? t.placementRootStyle
      : placement.source === "evidence" && (placement.defaults ?? []).length ? t.placementEvidencePartial
        : strings.scene3d.certaintyStyle[placement.style] ?? placement.style,
    evidenceId: placement.evidenceId ?? null,
    locator: ev ? locatorOf(ev) : null,
    locatorAccess: ev ? accessOf(ev) : null,
    note: placement.source === "speculative" ? noteText(record, placement.noteRef) : null,
    defaults: (placement.defaults ?? []).map((key) => t.defaults[key] ?? t.unknownDefault ?? "").filter(Boolean),
    // TASK-6-24: what fixes each axis of the box centre.
    axes: placement.axes ? ["x", "z", "y"].filter((axis) => placement.axes[axis]).map((axis) => ({ axis, basis: placement.axes[axis],
      text: `${t.axis[axis]}: ${t.axisBasis[placement.axes[axis]] ?? placement.axes[axis]}` })) : [],
    // N-01: each distance says which side it is measured from; the cross-offset is its own row.
    offset: placement.offset ? dimensionView("offset", placement.offset, ctx, record,
      { label: placement.relation === "inside" && placement.side ? t.distanceFrom[placement.side] : t.offset.replace(/:$/, "") }) : null,
    crossOffset: placement.crossOffset ? dimensionView("crossOffset", placement.crossOffset, ctx, record,
      { label: t.distanceFrom[placement.crossOffset.side] ?? t.offset.replace(/:$/, "") }) : null
  };
}

/**
 * buildGeometryView({ solved, world, strings, mode, selections }) →
 * { pieces[], unresolved[], groups[], legend[], empty, emptyText, preview }
 */
export function buildGeometryView({ solved, world, strings, mode, selections = {}, columnBudget = null }) {
  const s3 = strings.scene3d;
  const geometry = byId(world?.geometry);
  const groups = byId(world?.alternatives);
  const evidence = byId(world?.evidence);
  const ctx = { strings, groups, evidence };
  // TASK-6-31: a piece is "assumed" only through the assumed (defaulted) groups its own values use: a dimension or
  // offset in a group the solver defaulted, or converted through a defaulted unit group (e.g. the amah).
  const assumedGroupIdsOf = (solvedPiece) => {
    const placement = solvedPiece.placement ?? {};
    const rows = [...Object.values(solvedPiece.dimensions ?? {}), placement.offset, placement.crossOffset].filter(Boolean);
    const ids = new Set();
    for (const dim of rows) {
      if (dim.groupId && dim.assumed) ids.add(dim.groupId);
      if (dim.conversion?.kind === "alternative" && dim.conversion.assumed) ids.add(dim.conversion.groupId);
    }
    return [...ids];
  };
  const labelOf = (id) => isolateLatin(he(geometry.get(id)?.label) ?? "") || (s3.kind[geometry.get(id)?.kind] ?? id);
  const pieces = (solved?.pieces ?? []).map((piece) => {
    const record = geometry.get(piece.id);
    return {
      id: piece.id,
      label: labelOf(piece.id),
      kind: piece.kind,
      locationId: piece.locationId ?? null,
      locationNote: he(piece.locationNote ?? record?.locationNote) ?? null,
      style: piece.certaintyStyle,
      styleLabel: s3.certaintyStyle[piece.certaintyStyle] ?? piece.certaintyStyle,
      sizeStyleLabel: s3.certaintyStyle[piece.sizeStyle] ?? piece.sizeStyle,
      planStyleLabel: piece.footprintStyle ? (s3.basis.plan[piece.footprintStyle] ?? piece.footprintStyle) : null,
      heightStyleLabel: piece.heightStyle ? (s3.basis.height[piece.heightStyle] ?? piece.heightStyle) : null,
      placementStyleLabel: piece.placement?.source === "root" || piece.placementStyle === "origin" ? s3.inspector.placementRootStyle
        : piece.placement?.source === "evidence" && (piece.placement.defaults ?? []).length ? s3.inspector.placementEvidencePartial
          : s3.certaintyStyle[piece.placementStyle] ?? piece.placementStyle,
      assumedGroupIds: assumedGroupIdsOf(piece),
      assumed: assumedGroupIdsOf(piece).length > 0,
      assumedText: null,
      publication: piece.publication,
      certainty: recordCertainty(record ?? piece, strings),
      dimensions: [...Object.entries(piece.dimensions ?? {}), ...Object.entries(piece.counts ?? {})]
        .map(([key, dim]) => dimensionView(key, dim, ctx, record, { orientation: piece.orientation })),
      // TASK-6-43: a portico drawn with fewer columns than the model holds says so (same thinning as the renderer).
      lodNote: (() => {
        if (!piece.portico || !Number.isFinite(columnBudget) || !s3.inspector.porticoThinned) return null;
        const lod = thinColumns({ rows: piece.portico.rows, perRow: piece.portico.columnsPerRow }, columnBudget);
        return lod.thinned ? format(s3.inspector.porticoThinned, { drawn: lod.drawn, total: lod.total }) : null;
      })(),
      // TASK-6-44: a piece drawn only for some options of a group says which (appliesTo).
      appliesNote: piece.appliesTo ? format(s3.inspector.appliesOnly, { options: piece.appliesTo.optionIds.map((id) => optionLabel(groups, piece.appliesTo.groupId, id)).join("; ") }) : null,
      placement: placementView(piece.placement, ctx, record, labelOf),
      // M3-07: a drawn quadrilateral outline lists its four side lengths, each with its own provenance.
      outline: piece.outline?.sides ? {
        heading: s3.inspector.outlineHeading,
        sides: ["north", "east", "south", "west"].filter((side) => piece.outline.sides[side])
          .map((side) => dimensionView(`outline-${side}`, piece.outline.sides[side], ctx, record, { label: s3.inspector.outlineSide[side] })),
        construction: noteText(record, piece.outline.construction?.noteRef ?? { kind: "geometryOutlineNote", field: "construction", optionId: piece.outline.optionId }),
        optionId: piece.outline.optionId
      } : null,
      alternativeGroupIds: (record?.alternatives ?? []).map((ref) => ref.groupId),
      evidenceIds: [...(record?.evidenceIds ?? piece.evidenceIds ?? [])]
    };
  });
  // TASK-6-44: pieces the data has for other options only are listed, never dropped silently.
  const notShown = (solved?.notShown ?? []).map((item) => {
    const options = item.optionIds.map((id) => optionLabel(groups, item.groupId, id)).join("; ");
    // M3-08: one line per piece naming the current option; the full list of options sits behind a disclosure.
    const currentEntry = (solved?.selections ?? []).find((entry) => entry.groupId === item.groupId);
    const current = currentEntry?.optionId ? optionLabel(groups, item.groupId, currentEntry.optionId) : null;
    return { id: item.id, label: labelOf(item.id), groupId: item.groupId, optionIds: item.optionIds, current, optionsText: options,
      line: current ? format(s3.notShownLine, { label: labelOf(item.id), current }) : format(s3.notShownLineNoCurrent, { label: labelOf(item.id) }),
      shownIn: format(s3.notShownShownIn, { options }),
      text: format(s3.notShownItem, { label: labelOf(item.id), options }) };
  });
  const unresolved = (solved?.unresolved ?? []).map((item) => {
    const unitGroup = UNIT_CONVERSION_GROUPS[item.unit];
    const conversionGroupId = item.reason === "UNIT_NOT_CONVERTIBLE" && unitGroup && groups.has(unitGroup)
      && groups.get(unitGroup).selectionPolicy === "visitor_selectable" ? unitGroup : null;
    const template = conversionGroupId ? s3.unresolvedReason.UNIT_NOT_CONVERTIBLE_choose : s3.unresolvedReason[item.reason] ?? s3.unresolvedReason.generic;
    return { id: item.id, label: labelOf(item.id), reason: item.reason, unit: item.unit ?? null, conversionGroupId,
      text: format(template, { label: labelOf(item.id), unit: s3.units[item.unit] ?? item.unit ?? "", reason: item.reason }) };
  });
  // Every alternative group the drawing depends on, plus conversion groups the unresolved pieces could use.
  const groupView = (groupId, entry) => {
    const group = groups.get(groupId);
    const selectable = group?.selectionPolicy === "visitor_selectable";
    const selectedId = entry?.optionId ?? selections[groupId] ?? null;
    const status = entry?.status ?? (selections[groupId] ? "selected" : "unselected");
    const option = optionLabel(groups, groupId, selectedId);
    let notice = null;
    if (!selectable && entry) notice = format(s3.showAllNotice, { option });
    else if (entry?.assumed) notice = format(s3.assumedNotice, { option });
    else if (status === "selected") notice = format(s3.chosenNotice, { option });
    return { groupId, question: he(group?.question) ?? groupId, status, assumed: Boolean(entry?.assumed), selectable, notice,
      certainty: group ? recordCertainty(group, strings) : null, caveat: he(group?.caveat),
      selectedOption: selectedId, usedCount: entry?.usedBy?.length ?? 0,
      usedByText: entry ? ((entry.usedBy?.length ?? 0) === 1 ? s3.usedByOne : format(s3.usedBy, { count: entry.usedBy?.length ?? 0 })) : null,
      chooseLabel: format(s3.chooseLabel, { question: he(group?.question) ?? groupId }),
      options: (group?.options ?? []).map((item) => ({ id: item.id, label: he(item.label) ?? item.id, selected: item.id === selectedId,
        effect: he(item.effect), locators: (item.evidenceIds ?? []).map((id) => locatorOf(evidence.get(id))).filter(Boolean),
        locatorItems: (item.evidenceIds ?? []).map((id) => ({ display: locatorOf(evidence.get(id)), accessMode: accessOf(evidence.get(id)) })).filter((entry) => entry.display) })) };
  };
  const selectionGroups = (solved?.selections ?? []).map((entry) => groupView(entry.groupId, entry));
  const conversionGroups = [...new Set(unresolved.map((item) => item.conversionGroupId).filter(Boolean))]
    .filter((id) => !selectionGroups.some((group) => group.groupId === id)).map((id) => groupView(id, null));
  // TASK-6-31: one list of every alternative group in the world — visitor-selectable ones with a picker, show_all
  // ones listed as shown together. Labels, effects, caveats and locators come from the group records.
  const solvedEntries = new Map((solved?.selections ?? []).map((entry) => [entry.groupId, entry]));
  const alternativeList = [...groups.values()].map((group) => groupView(group.id, solvedEntries.get(group.id) ?? null));
  const alternatives = { selectable: alternativeList.filter((group) => group.selectable), shownTogether: alternativeList.filter((group) => !group.selectable) };
  const groupQuestion = new Map(alternativeList.map((group) => [group.groupId, group.question]));
  // M2-11: a default every piece depends on (e.g. the amah) is said once; a piece is tagged only for its own other assumptions.
  const commonGroupIds = pieces.length > 1 ? pieces[0].assumedGroupIds.filter((id) => pieces.every((piece) => piece.assumedGroupIds.includes(id))) : [];
  for (const piece of pieces) {
    piece.assumedSpecificIds = piece.assumedGroupIds.filter((id) => !commonGroupIds.includes(id));
    piece.assumedSpecific = piece.assumedSpecificIds.length > 0;
    piece.assumedText = piece.assumed ? format(s3.assumedDepends, { questions: piece.assumedGroupIds.map((id) => groupQuestion.get(id) ?? id).join("; ") }) : null;
  }
  const commonAssumed = commonGroupIds.length ? { groupIds: commonGroupIds,
    text: format(s3.commonAssumedNotice, { questions: commonGroupIds.map((id) => groupQuestion.get(id) ?? id).join("; ") }) } : null;
  const presentStyles = new Set(pieces.map((piece) => piece.style));
  const legend = ["sourced", "alternative", "speculative"].filter((key) => s3.legend[key]).filter((key) => presentStyles.has(key)).map((key) => ({ key, text: s3.legend[key] }));
  if (pieces.some((piece) => piece.assumed)) legend.push({ key: "assumed", text: s3.legend.assumed });
  const empty = pieces.length === 0 && unresolved.length === 0;
  // 3D-05: the amah reading sets every metre value; it is summarised next to the canvas.
  const amahUnit = solved?.units?.amah ?? null;
  const amah = amahUnit ? {
    groupId: amahUnit.groupId,
    assumed: Boolean(amahUnit.assumed),
    text: format(amahUnit.assumed ? s3.amahChipAssumed : s3.amahChipChosen, { cm: Math.round(amahUnit.metresPerUnit * 1000) / 10 }),
    otherAssumptions: [...selectionGroups].filter((group) => group.groupId !== amahUnit.groupId && (group.assumed || !group.selectable)).length
  } : null;
  // N-02: solver conflicts stated to visitors (e.g. a piece larger than the piece it is placed inside).
  // Per-piece warnings (TASK-6-26) name the container and the overflowing sides; diagnostics are the fallback.
  const fromWarnings = (solved?.pieces ?? []).flatMap((piece) => (piece.warnings ?? []).filter((item) => s3.conflicts[item.code])
    .map((item) => ({ code: item.code, refId: piece.id, of: item.containerId ?? geometry.get(piece.id)?.placement?.of ?? null,
      sides: Object.keys(item.overflow ?? {}).filter((side) => s3.sideNames[side]) })));
  const fromDiagnostics = (solved?.diagnostics ?? []).filter((item) => s3.conflicts[item.code] && !fromWarnings.some((w) => w.refId === item.refId && w.code === item.code))
    .map((item) => ({ code: item.code, refId: item.refId, of: geometry.get(item.refId)?.placement?.of ?? null, sides: [] }));
  const conflicts = [...fromWarnings, ...fromDiagnostics].map((item) => ({ code: item.code, refId: item.refId,
    text: format(s3.conflicts[item.code], { label: labelOf(item.refId), of: item.of ? labelOf(item.of) : "",
      sides: item.sides.length ? format(s3.conflictSides, { sides: item.sides.map((side) => s3.sideNames[side]).join(", ") }) : "" }) }));
  return { pieces, notShown, unresolved, groups: [...selectionGroups, ...conversionGroups], alternatives, legend, commonAssumed, empty, amah, conflicts,
    emptyText: empty ? (mode === "published" ? s3.emptyPublished : s3.empty) : null, preview: mode === "preview" };
}

/** Inspector subject for one piece: provenance block data + evidence items + active events at its location. */
/** Evidence ids a group rests on: its own list and every option's. */
function groupEvidence(group) {
  return new Set([...(group?.evidenceIds ?? []), ...(group?.options ?? []).flatMap((option) => option.evidenceIds ?? [])]);
}

export function geometrySubject({ view, pieceId, world, strings, worldState }) {
  const piece = view.pieces.find((item) => item.id === pieceId);
  if (!piece) return null;
  const t = strings.scene3d.inspector;
  const s3 = strings.scene3d;
  const events = byId(world?.events);
  const activeIds = (worldState?.locationStates ?? []).find((item) => item.locationId === piece.locationId)?.activeEventIds ?? [];
  const evidenceById = byId(world?.evidence);
  const groupsById = byId(world?.alternatives);
  const record = byId(world?.geometry).get(pieceId);
  const placementRows = [piece.placement?.offset, piece.placement?.crossOffset].filter(Boolean);
  const alternatives = view.groups.filter((group) => piece.alternativeGroupIds.includes(group.groupId)
    || [...piece.dimensions, ...placementRows].some((dim) => dim.groupId === group.groupId || dim.conversionGroupId === group.groupId));
  // 3D-09: a group linked to the record but not used by any drawn value is listed with its options (never hidden).
  const listed = new Set(alternatives.map((group) => group.groupId));
  const recordedOnly = (record?.alternatives ?? []).map((ref) => ref.groupId).filter((id) => !listed.has(id) && groupsById.has(id))
    .map((id) => {
      const group = groupsById.get(id);
      return { groupId: id, question: he(group.question) ?? id, status: "unselected", assumed: false, selectable: false,
        notice: s3.recordedNotDrawn, options: (group.options ?? []).map((option) => ({ id: option.id, label: he(option.label) ?? option.id, selected: false })) };
    });
  // 3D-02 stopgap, N-04: a dispute recorded on the piece's evidence is "not switchable" only when no drawn group of this
  // piece rests on the same evidence (e.g. a combined base-and-height group supersedes two older groups).
  const drawn = new Set(view.groups.map((group) => group.groupId));
  const pieceGroupEvidence = alternatives.map((group) => groupEvidence(groupsById.get(group.groupId)));
  const covered = (id) => {
    const needed = [...groupEvidence(groupsById.get(id))];
    return needed.length > 0 && pieceGroupEvidence.some((have) => needed.every((evidenceId) => have.has(evidenceId)));
  };
  const referenced = [...new Set(piece.evidenceIds.flatMap((id) => evidenceById.get(id)?.alternativeGroupIds ?? []))]
    .filter((id) => !drawn.has(id) && !listed.has(id) && groupsById.has(id) && !covered(id) && !recordedOnly.some((group) => group.groupId === id)).sort();
  return {
    piece,
    notSwitchable: referenced.map((id) => ({ groupId: id, question: he(groupsById.get(id).question) ?? id,
      text: format(t.notSwitchable, { question: he(groupsById.get(id).question) ?? id }) })),
    title: format(t.title, { label: piece.label }),
    alternatives: [...alternatives, ...recordedOnly],
    // N-02: conflicts the solver reports for this piece.
    conflicts: view.conflicts.filter((item) => item.refId === pieceId),
    activeEvents: activeIds.map((id) => ({ id, title: he(events.get(id)?.title) ?? id })),
    evidence: evidenceItems({ world, strings, ids: piece.evidenceIds })
  };
}
