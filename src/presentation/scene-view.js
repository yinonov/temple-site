// Presentation-side view of the scene descriptors (TASK-5-11). Pure; Node-testable.
// R-16: the diagram shows only the locations relevant to the current view (locations of events in the current lane,
// plus their direct topology neighbours). Other locations are listed separately with a route to their evidence.

const LEGEND_ORDER = ["evidenced", "provisional", "speculative", "unplaced", "activeEvent", "entity", "inferredLocation"];

/** Location ids relevant to the current time axis: events on the queried sequence, or every event on the clock axis. */
export function relevantLocationIds(world, time) {
  const events = (world?.events ?? []).filter((event) => time?.axis !== "sequence"
    || (event.timing?.axis === "sequence" && event.timing.sequenceId === time.sequenceId));
  const ids = new Set(events.map((event) => event.locationId).filter(Boolean));
  for (const location of world?.locations ?? []) {
    for (const edge of location.spatial?.topologyEdges ?? []) {
      if (ids.has(location.id)) ids.add(edge.toLocationId);
    }
  }
  // Second pass: an edge pointing *into* a relevant location makes its source a neighbour too.
  for (const location of world?.locations ?? []) {
    if ((location.spatial?.topologyEdges ?? []).some((edge) => events.some((event) => event.locationId === edge.toLocationId))) ids.add(location.id);
  }
  return ids;
}

/**
 * Filter descriptors to `keep` location ids. Entity markers follow their host; edges need both ends.
 * Legend presence is recomputed; `inferred` (location ids whose active event location is inferred) adds a legend key.
 */
export function filterDescriptors(descriptors, keep, inferred = new Set()) {
  const keepLocation = (item) => item.refKind !== "location" || keep.has(item.refId);
  const keepItem = (item) => (item.refKind === "entity" ? (!item.attachedTo || keep.has(item.attachedTo.refId)) : keepLocation(item));
  const nodes = descriptors.nodes.filter(keepItem);
  const tray = descriptors.tray.filter(keepItem);
  const edges = descriptors.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
  const layers = nodes.filter((node) => node.position && Number.isInteger(node.position.layer)).map((node) => node.position.layer);
  const all = [...nodes, ...tray];
  const present = {
    evidenced: [...nodes, ...edges].some((item) => item.treatment === "evidenced"),
    provisional: [...nodes, ...edges, ...tray].some((item) => item.treatment === "provisional" || item.recordTreatment === "provisional"),
    speculative: nodes.some((item) => item.treatment === "speculative"),
    unplaced: tray.length > 0,
    activeEvent: all.some((item) => item.refKind === "location" && item.hasActiveEvent),
    entity: all.some((item) => item.refKind === "entity"),
    inferredLocation: all.some((item) => item.refKind === "location" && inferred.has(item.refId))
  };
  return Object.freeze({
    ...descriptors,
    layout: { ...descriptors.layout, layerCount: layers.length ? Math.max(...layers) + 1 : descriptors.layout.layerCount },
    nodes,
    tray,
    edges,
    legend: { ...descriptors.legend, items: LEGEND_ORDER.map((key) => ({ key, present: present[key] })) }
  });
}

/** Locations whose active event places them by inference (event.locationBasis === "inferred"). */
export function inferredLocationIds(world, state) {
  const events = new Map((world?.events ?? []).map((event) => [event.id, event]));
  return new Set((state?.activeEvents ?? []).map((active) => events.get(active.eventId))
    .filter((event) => event?.locationBasis === "inferred").map((event) => event.locationId));
}

/** Memoised filter: the same output object while the input descriptors and the kept/inferred sets are unchanged. */
export function createSceneFilterMemo() {
  let last = null;
  let lastInput = null;
  let lastKey = null;
  return (descriptors, keep, inferred) => {
    const key = `${[...keep].sort().join(",")}|${[...inferred].sort().join(",")}`;
    if (last && descriptors === lastInput && key === lastKey) return last;
    last = filterDescriptors(descriptors, keep, inferred);
    lastInput = descriptors;
    lastKey = key;
    return last;
  };
}
