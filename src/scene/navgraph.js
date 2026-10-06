// Walkable navigation grid and routes for the living layer (TASK-6-163, ADR-005 Decision 2). Pure ESM, Node-testable.
// Routes are an ILLUSTRATIVE display choice: no source says which way anyone walked. The one hard rule is that a route
// never enters a piece the published access data forbids to the walker's role. If no legal route exists, routeFor returns
// null and the caller fades the figure instead of walking it through the forbidden piece.
//
// Model: a uniform grid over the open floors (court/platform pieces below the root) and stairs. Buildings, other raised
// pieces, chambers and doorway (gate) pieces block, so a route never asserts a passage through a wall, a door or an
// interior; a figure whose event is inside one appears there by fading (its start and goal cells are always allowed, but
// nothing else opens a way in). Low barriers (the soreg) do not block movement, because their openings are not modelled;
// they still count as forbidden for a role that the data forbids there.

/** Routes use open floors and stairs only (TASK-6-161 A-03): never a chamber, doorway or building interior. */
export const WALKABLE_KINDS = Object.freeze(new Set(["court", "platform", "stair"]));
const CLOSED_KINDS = new Set(["chamber", "gate"]);
/** Non-floor pieces taller than this block walking (buildings, raised structures); low barriers do not. */
export const BLOCKING_MIN_HEIGHT = 1.5;
const LOW_KINDS = new Set(["barrier"]);
export const DEFAULT_CELL = 1.5;

const inside = (box, x, z, pad = 0) => Math.abs(x - box.x) <= box.sx / 2 + pad && Math.abs(z - box.z) <= box.sz / 2 + pad;

/**
 * buildNavGraph(pieces, { cell }) → { cell, minX, minZ, cols, rows, walkable: Uint8Array, pieceCells: Map<pieceId, number[]>, floor }
 * `pieces` = solved pieces ({ id, kind, parentId, box }). The grid spans the walkable pieces that have a parent (the root
 * platform is the whole mount and is left out, which keeps the grid small).
 */
export function buildNavGraph(pieces, { cell = DEFAULT_CELL } = {}) {
  const list = (Array.isArray(pieces) ? pieces : []).filter((piece) => piece?.box);
  // TASK-6-169 L-04: a tall stair (a ramp up to a raised piece) is not walked at court height; it blocks like a raised piece.
  const tall = (piece) => piece.box.sy > BLOCKING_MIN_HEIGHT;
  const walkers = list.filter((piece) => WALKABLE_KINDS.has(piece.kind) && piece.parentId && !(piece.kind === "stair" && tall(piece)));
  const empty = { cell, minX: 0, minZ: 0, cols: 0, rows: 0, walkable: new Uint8Array(0), pieceCells: new Map(), floor: () => 0 };
  if (!walkers.length) return empty;
  const minX = Math.min(...walkers.map((p) => p.box.x - p.box.sx / 2));
  const maxX = Math.max(...walkers.map((p) => p.box.x + p.box.sx / 2));
  const minZ = Math.min(...walkers.map((p) => p.box.z - p.box.sz / 2));
  const maxZ = Math.max(...walkers.map((p) => p.box.z + p.box.sz / 2));
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const walkable = new Uint8Array(cols * rows);
  const blockers = list.filter((piece) => CLOSED_KINDS.has(piece.kind) || ((piece.kind === "stair" || !WALKABLE_KINDS.has(piece.kind)) && !LOW_KINDS.has(piece.kind) && tall(piece)));
  const pieceCells = new Map(list.map((piece) => [piece.id, []]));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = minX + (c + 0.5) * cell;
      const z = minZ + (r + 0.5) * cell;
      const index = r * cols + c;
      const onFloor = walkers.some((piece) => inside(piece.box, x, z));
      const blocked = blockers.some((piece) => inside(piece.box, x, z));
      walkable[index] = onFloor && !blocked ? 1 : 0;
      // A cell belongs to every piece whose footprint touches it (half a cell of slack so thin pieces are never missed).
      for (const piece of list) if (inside(piece.box, x, z, cell / 2)) pieceCells.get(piece.id).push(index);
    }
  }
  const floors = list.filter((piece) => piece.kind === "court" || piece.kind === "platform");
  const floor = (x, z) => {
    let top = -Infinity;
    for (const piece of floors) if (inside(piece.box, x, z)) top = Math.max(top, piece.box.y + piece.box.sy / 2);
    return Number.isFinite(top) ? top : 0;
  };
  return { cell, minX, minZ, cols, rows, walkable, pieceCells, floor };
}

const cellOf = (graph, x, z) => {
  const c = Math.min(Math.max(Math.floor((x - graph.minX) / graph.cell), 0), graph.cols - 1);
  const r = Math.min(Math.max(Math.floor((z - graph.minZ) / graph.cell), 0), graph.rows - 1);
  return r * graph.cols + c;
};
const centreOf = (graph, index) => ({ x: graph.minX + ((index % graph.cols) + 0.5) * graph.cell, z: graph.minZ + (Math.floor(index / graph.cols) + 0.5) * graph.cell });

/** Cell indexes a role may not enter: every cell touched by a forbidden piece. */
export function forbiddenCells(graph, forbiddenPieceIds = []) {
  const out = new Set();
  for (const id of forbiddenPieceIds) for (const index of graph.pieceCells.get(id) ?? []) out.add(index);
  return out;
}

/** Piece ids the data forbids to `roleId`, from accessibleAreas(roleId, world).pieces (status "forbidden"). */
export function forbiddenPieceIdsFrom(areas) {
  return (areas?.pieces ?? []).filter((piece) => piece.status === "forbidden").map((piece) => piece.pieceId).sort();
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const passable = (graph, blocked, index, start, goal) => index === start || index === goal || (graph.walkable[index] === 1 && !blocked.has(index));

/** Grid line of sight (supercover walk) between two cells; used to straighten the A* path. */
function clearLine(graph, blocked, a, b, start, goal) {
  const p = centreOf(graph, a);
  const q = centreOf(graph, b);
  const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (graph.cell * 0.5));
  for (let i = 1; i < steps; i += 1) {
    const index = cellOf(graph, p.x + ((q.x - p.x) * i) / steps, p.z + ((q.z - p.z) * i) / steps);
    if (!passable(graph, blocked, index, start, goal)) return false;
  }
  return true;
}

/**
 * routeFor({ graph, from: {x,z}, to: {x,z}, forbidden: Set<cellIndex> }) → [{x,y,z}, …] (from … to) | null
 * 8-connected A* (no corner cutting), then string-pulled. Start and goal cells are always allowed (a figure already
 * standing there is not moved by the route). y is the floor height under each point.
 */
export function routeFor({ graph, from, to, forbidden = new Set() }) {
  if (!graph?.cols || !from || !to) return null;
  const start = cellOf(graph, from.x, from.z);
  const goal = cellOf(graph, to.x, to.z);
  const withY = (points) => points.map((point) => ({ x: point.x, y: graph.floor(point.x, point.z), z: point.z }));
  if (start === goal) return withY([from, to]);
  const { cols, rows } = graph;
  const g = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const goalCentre = centreOf(graph, goal);
  const h = (index) => {
    const p = centreOf(graph, index);
    const dx = Math.abs(p.x - goalCentre.x) / graph.cell;
    const dz = Math.abs(p.z - goalCentre.z) / graph.cell;
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const heap = new MinHeap();
  g[start] = 0;
  heap.push([h(start), start]);
  const closed = new Uint8Array(cols * rows);
  let found = false;
  while (heap.size) {
    const [, current] = heap.pop();
    if (closed[current]) continue;
    if (current === goal) { found = true; break; }
    closed[current] = 1;
    const cr = Math.floor(current / cols);
    const cc = current % cols;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const r = cr + dr;
        const c = cc + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const next = r * cols + c;
        if (!passable(graph, forbidden, next, start, goal)) continue;
        // No corner cutting past a blocked or forbidden cell.
        if (dr && dc && (!passable(graph, forbidden, cr * cols + c, start, goal) || !passable(graph, forbidden, r * cols + cc, start, goal))) continue;
        const cost = g[current] + (dr && dc ? Math.SQRT2 : 1);
        if (cost < g[next]) { g[next] = cost; came[next] = current; heap.push([cost + h(next), next]); }
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let at = goal; at !== -1; at = came[at]) cells.push(at);
  cells.reverse();
  // String pulling: keep a cell only when the straight line from the last kept cell to the one after it is not clear.
  const kept = [cells[0]];
  for (let i = 1; i < cells.length - 1; i += 1) if (!clearLine(graph, forbidden, kept.at(-1), cells[i + 1], start, goal)) kept.push(cells[i]);
  kept.push(cells.at(-1));
  const middle = kept.slice(1, -1).map((index) => centreOf(graph, index));
  return withY([{ x: from.x, z: from.z }, ...middle, { x: to.x, z: to.z }]);
}

/** Total length (m) of a polyline in plan. */
export function routeLength(points) {
  let total = 0;
  for (let i = 1; i < (points?.length ?? 0); i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

/** Point at fraction 0..1 of a polyline's plan length → { x, y, z, heading } (heading: radians, 0 = facing -z). */
export function pointAlong(points, fraction) {
  if (!points?.length) return null;
  if (points.length === 1) return { ...points[0], heading: 0 };
  const total = routeLength(points);
  let rest = Math.min(Math.max(fraction, 0), 1) * total;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (rest <= length || i === points.length - 1) {
      const f = length > 0 ? Math.min(rest / length, 1) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
    }
    rest -= length;
  }
  return { ...points.at(-1), heading: 0 };
}

/** Does a polyline pass through any forbidden cell (sampled every half cell)? For tests and assertions. */
export function routeCrosses(graph, points, forbidden, { ignoreEnds = true } = {}) {
  if (!points || points.length < 2) return false;
  const start = cellOf(graph, points[0].x, points[0].z);
  const goal = cellOf(graph, points.at(-1).x, points.at(-1).z);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (graph.cell * 0.5)));
    for (let s = 0; s <= steps; s += 1) {
      const index = cellOf(graph, a.x + ((b.x - a.x) * s) / steps, a.z + ((b.z - a.z) * s) / steps);
      if (ignoreEnds && (index === start || index === goal)) continue;
      if (forbidden.has(index)) return true;
    }
  }
  return false;
}
