// Scene adapter (TASK-6-01, ADR-001). Maps worldStateAt output + the importer's world to render descriptors.
// Pure ESM: no DOM, Date, randomness, I/O or globals. Same (state, world) → deep-equal, frozen output.
//
// The scene is a consumer of world data, never a second fact store (VIS-01):
// - every visual element carries a record reference (refKind + refId) and a geometryCertainty;
// - labels are references (`labelRef`) resolved by the UI from data; this module contains no display text;
// - positions of graph nodes are computed from connectivity alone (layout.kind "diagrammatic"); coordinates are read
//   from data only for spatial.status "schematic", and are then marked speculative;
// - "unplaced" locations go to the tray and never receive a position.

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const byRef = (a, b) => compareText(a.refKind, b.refKind) || compareText(a.refId, b.refId);
const sortedUnique = (values) => [...new Set(values)].sort(compareText);

export const LAYOUT_NOTE = "positions encode connectivity only, not geometry";
export const SCHEMATIC_NOTE = "schematic boxes are labelled visual completions, not claims";

/** Visual treatments. The renderer maps them to stroke/fill styles; the legend explains each. */
export const TREATMENTS = Object.freeze(["evidenced", "provisional", "speculative", "unplaced"]);
/** Legend item keys in display order (the UI supplies text for each under strings.legend). */
export const LEGEND_KEYS = Object.freeze(["evidenced", "provisional", "speculative", "unplaced", "activeEvent", "entity"]);

const WEAK_CERTAINTY = new Set(["requires_review", "speculative"]);

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** Stable JSON: object keys sorted, arrays in given order. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(compareText).filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Memoisation key of a world state for the scene: only the fields the adapter reads. `query` and `diagnostics` are
 * excluded, so two different times that produce the same world state have the same key.
 * @param {object|null} state worldStateAt output
 * @returns {string}
 */
export function sceneKey(state) {
  return stableStringify({
    activeEvents: (state?.activeEvents ?? []).map((event) => ({
      eventId: event.eventId, publication: event.publication, certainty: event.certainty
    })),
    entityStates: state?.entityStates ?? [],
    locationStates: state?.locationStates ?? [],
    accessResults: state?.accessResults ?? []
  });
}

function recordTreatment(record) {
  if (!record) return "provisional";
  const certainty = record.effectiveCertainty ?? record.certainty ?? "requires_review";
  return record.publication === "published" && !WEAK_CERTAINTY.has(certainty) ? "evidenced" : "provisional";
}

function certaintyOf(record) {
  return record?.effectiveCertainty ?? record?.certainty ?? "requires_review";
}

function spatialStatus(location) {
  const status = location?.spatial?.status;
  return status === "topological" || status === "schematic" ? status : "unplaced";
}

/** Deterministic layering over directed edges: Kahn's algorithm with id-sorted ready queue; cycles broken by id. */
export function layerGraph(nodeIds, edges) {
  const ids = sortedUnique(nodeIds);
  const known = new Set(ids);
  const preds = new Map(ids.map((id) => [id, new Set()]));
  const succs = new Map(ids.map((id) => [id, new Set()]));
  for (const { from, to } of edges) {
    if (!known.has(from) || !known.has(to) || from === to) continue;
    succs.get(from).add(to);
    preds.get(to).add(from);
  }
  const remainingIn = new Map(ids.map((id) => [id, preds.get(id).size]));
  const layer = new Map();
  const done = new Set();
  const visit = (id) => {
    let value = 0;
    for (const pred of preds.get(id)) if (done.has(pred)) value = Math.max(value, layer.get(pred) + 1);
    layer.set(id, value);
    done.add(id);
    for (const next of succs.get(id)) remainingIn.set(next, remainingIn.get(next) - 1);
  };
  while (done.size < ids.length) {
    const ready = ids.filter((id) => !done.has(id) && remainingIn.get(id) <= 0);
    // Cycle: no ready node; take the smallest remaining id (deterministic, independent of input order).
    const pick = ready.length ? ready[0] : ids.find((id) => !done.has(id));
    visit(pick);
  }
  const layers = new Map();
  for (const id of ids) {
    const index = layer.get(id);
    if (!layers.has(index)) layers.set(index, []);
    layers.get(index).push(id);
  }
  const position = new Map();
  for (const [index, members] of layers) members.forEach((id, order) => position.set(id, { layer: index, order }));
  return {
    position,
    layerCount: layers.size === 0 ? 0 : Math.max(...layers.keys()) + 1,
    maxLayerSize: layers.size === 0 ? 0 : Math.max(...[...layers.values()].map((members) => members.length))
  };
}

function accessSummaryFor(accessResults, predicate) {
  const results = accessResults.filter(predicate)
    .map(({ entityId, locationId, result, reason, evidenceIds }) => ({
      entityId, locationId, result, reason, evidenceIds: sortedUnique(evidenceIds ?? [])
    }))
    .sort((a, b) => compareText(a.entityId, b.entityId) || compareText(a.locationId, b.locationId));
  const count = (kind) => results.filter((item) => item.result === kind).length;
  return { evaluated: results.length > 0, allow: count("allow"), deny: count("deny"), unknown: count("unknown"), results };
}

/**
 * sceneDescriptors({ state, world, viewModel? }) → { layout, nodes, edges, tray, legend }
 * `viewModel` is accepted for call-site symmetry but not read: descriptors depend on (state, world) only.
 * See docs/scene/integration.md for the field list.
 */
export function sceneDescriptors({ state, world, viewModel = null } = {}) {
  void viewModel;
  const locations = [...(world?.locations ?? [])].sort((a, b) => compareText(a.id, b.id));
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const entitiesById = new Map((world?.entities ?? []).map((entity) => [entity.id, entity]));
  const evidenceById = new Map((world?.evidence ?? []).map((record) => [record.id, record]));
  const eventsById = new Map((world?.events ?? []).map((event) => [event.id, event]));
  const activeEventIds = sortedUnique((state?.activeEvents ?? []).map((event) => event.eventId));
  const activeSet = new Set(activeEventIds);
  const activeAt = new Map((state?.locationStates ?? []).map((item) => [item.locationId, sortedUnique(item.activeEventIds ?? [])]));
  const accessResults = state?.accessResults ?? [];

  const placementOf = (locationId) => {
    const location = locationsById.get(locationId);
    if (!location) return "missing";
    return spatialStatus(location) === "unplaced" ? "tray" : "graph";
  };

  // ---- Edges: every topology edge whose endpoints both exist in this world ----
  const edges = [];
  for (const location of locations) {
    (location.spatial?.topologyEdges ?? []).forEach((edge, index) => {
      const to = edge?.toLocationId;
      if (typeof to !== "string" || to === location.id || placementOf(to) === "missing") return;
      const evidenceIds = sortedUnique(edge.evidenceIds ?? []);
      const evidencePublished = evidenceIds.length > 0 && evidenceIds.every((id) => evidenceById.get(id)?.publication === "published");
      const sourceTreatment = recordTreatment(location);
      edges.push({
        refKind: "edge",
        refId: `${location.id}~${index}`,
        from: location.id,
        to,
        fromPlacement: placementOf(location.id),
        toPlacement: placementOf(to),
        viaRef: { kind: "topologyEdgeVia", locationId: location.id, index },
        evidenceIds,
        publication: location.publication ?? "preview_only",
        effectiveCertainty: certaintyOf(location),
        treatment: sourceTreatment === "evidenced" && evidencePublished ? "evidenced" : "provisional",
        directed: false
      });
    });
  }
  edges.sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to) || compareText(a.refId, b.refId));

  // ---- Layout: topological nodes layered from the graph alone ----
  const topologicalIds = locations.filter((location) => spatialStatus(location) === "topological").map((location) => location.id);
  const layered = layerGraph(topologicalIds, edges);

  const baseLocation = (location) => {
    const ids = activeAt.get(location.id) ?? [];
    return {
      refKind: "location",
      refId: location.id,
      labelRef: { kind: "location", id: location.id },
      locationKind: location.kind ?? null,
      publication: location.publication ?? "preview_only",
      effectiveCertainty: certaintyOf(location),
      evidenceIds: sortedUnique(location.evidenceIds ?? []),
      hasActiveEvent: ids.length > 0,
      activeEventIds: ids,
      accessSummary: accessSummaryFor(accessResults, (item) => item.locationId === location.id)
    };
  };

  const nodes = [];
  const tray = [];
  for (const location of locations) {
    const status = spatialStatus(location);
    if (status === "topological") {
      nodes.push({ ...baseLocation(location), placement: "diagrammatic", geometryCertainty: "topological",
        treatment: recordTreatment(location), position: { ...layered.position.get(location.id) } });
    } else if (status === "schematic") {
      const box = location.spatial?.schematic ?? {};
      nodes.push({ ...baseLocation(location), placement: "schematic", geometryCertainty: "speculative", treatment: "speculative",
        position: { x: box.x, y: box.y, w: box.w, h: box.h }, schematicNoteRef: { kind: "locationSchematicNote", id: location.id } });
    } else {
      tray.push({ ...baseLocation(location), placement: "tray", geometryCertainty: "unplaced", treatment: "unplaced",
        recordTreatment: recordTreatment(location) });
    }
  }

  // ---- Entity markers: attached to their active location; no location → tray chip, never a position ----
  for (const entityState of state?.entityStates ?? []) {
    if (entityState.status !== "active") continue;
    const entity = entitiesById.get(entityState.entityId);
    const eventIds = entityState.eventId ? [entityState.eventId]
      : activeEventIds.filter((id) => (eventsById.get(id)?.participants ?? []).some((p) => p.entityId === entityState.entityId));
    const host = typeof entityState.locationId === "string" ? placementOf(entityState.locationId) : "missing";
    const marker = {
      refKind: "entity",
      refId: entityState.entityId,
      labelRef: { kind: "entity", id: entityState.entityId },
      publication: entity?.publication ?? "preview_only",
      effectiveCertainty: certaintyOf(entity),
      evidenceIds: sortedUnique(entity?.evidenceIds ?? []),
      countKind: entity?.count?.kind ?? "unspecified",
      hasActiveEvent: eventIds.length > 0,
      activeEventIds: sortedUnique(eventIds.filter((id) => activeSet.has(id))),
      accessSummary: accessSummaryFor(accessResults, (item) => item.entityId === entityState.entityId
        && (host === "missing" || item.locationId === entityState.locationId)),
      treatment: recordTreatment(entity)
    };
    if (host === "missing") {
      tray.push({ ...marker, placement: "tray", geometryCertainty: "unplaced", attachedTo: null });
    } else {
      nodes.push({ ...marker, placement: "attached", geometryCertainty: host === "tray" ? "unplaced" : "topological",
        attachedTo: { refKind: "location", refId: entityState.locationId, placement: host } });
    }
  }

  nodes.sort(byRef);
  tray.sort(byRef);

  const present = {
    evidenced: [...nodes, ...edges].some((item) => item.treatment === "evidenced"),
    provisional: [...nodes, ...edges, ...tray].some((item) => item.treatment === "provisional" || item.recordTreatment === "provisional"),
    speculative: nodes.some((item) => item.treatment === "speculative"),
    unplaced: tray.length > 0,
    activeEvent: [...nodes, ...tray].some((item) => item.refKind === "location" && item.hasActiveEvent),
    entity: [...nodes, ...tray].some((item) => item.refKind === "entity")
  };

  return deepFreeze({
    layout: {
      kind: "diagrammatic",
      note: LAYOUT_NOTE,
      layerCount: layered.layerCount,
      maxLayerSize: layered.maxLayerSize,
      schematic: nodes.some((node) => node.placement === "schematic")
        ? { present: true, certainty: "speculative", note: SCHEMATIC_NOTE } : { present: false }
    },
    nodes,
    edges,
    tray,
    legend: { noteKey: "diagramNotMap", items: LEGEND_KEYS.map((key) => ({ key, present: present[key] })) }
  });
}

/**
 * Memoised adapter: returns the identical (frozen) descriptor object while `world` (by reference) and
 * `sceneKey(state)` are unchanged. The renderer can skip `update` when the reference is the same.
 */
export function createSceneMemo() {
  let lastWorld = null;
  let lastKey = null;
  let last = null;
  return function memoSceneDescriptors({ state, world, viewModel = null }) {
    const key = sceneKey(state);
    if (last && world === lastWorld && key === lastKey) return last;
    last = sceneDescriptors({ state, world, viewModel });
    lastWorld = world;
    lastKey = key;
    return last;
  };
}
