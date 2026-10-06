// Persona gates for free walking (TASK-6-166, ADR-005 D6). Pure; Node-testable.
// The verdict per piece comes from accessibleAreas() (src/domain/access.js): a published, unconditional rule. "forbidden"
// blocks the step, a conditional rule only warns, and no rule means no verdict (never blocked by assumption).
// TASK-6-161 A-08: a forbidding rule whose own evidence states an exception (`exceptions`: pieceId → the record's text) only
// warns and shows that text, because blocking would present an absolute ban the source does not state.
// The walker stands on the topmost floor piece under it (as the renderer's floorAt); a low barrier is entered when the step's
// segment crosses its footprint, so a fast step cannot jump over it.

const FLOOR_KINDS = new Set(["court", "platform"]);
const inside = (box, x, z) => Math.abs(x - box.x) <= box.sx / 2 && Math.abs(z - box.z) <= box.sz / 2;

/** Does segment a→b cross (or end in) the box footprint? Slab test in plan. */
export function segmentHitsBox(a, b, box) {
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, min, max] of [[a.x, b.x - a.x, box.x - box.sx / 2, box.x + box.sx / 2], [a.z, b.z - a.z, box.z - box.sz / 2, box.z + box.sz / 2]]) {
    if (Math.abs(d) < 1e-12) { if (p < min || p > max) return false; continue; }
    let u0 = (min - p) / d;
    let u1 = (max - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * createGate({ pieces, areas }) → { check(from, to) → { allowed, reason: null|"forbidden"|"inside"|"conditional", pieceId, locationId } }
 * `pieces` = solved pieces; `areas` = accessibleAreas(personaId, world) (null = no persona: everything allowed, nothing said).
 */
export function createGate({ pieces = [], areas = null, exceptions = new Map() } = {}) {
  const byPiece = new Map((areas?.personaKnown ? areas.pieces : []).map((entry) => [entry.pieceId, entry]));
  const floors = pieces.filter((piece) => FLOOR_KINDS.has(piece.kind) && piece.box);
  const blocking = (id) => byPiece.get(id)?.status === "forbidden" && !exceptions.has(id);
  const barriers = pieces.filter((piece) => !FLOOR_KINDS.has(piece.kind) && piece.box && blocking(piece.id));
  const topFloor = (p) => floors.filter((piece) => inside(piece.box, p.x, p.z)).sort((a, b) => (b.box.y + b.box.sy / 2) - (a.box.y + a.box.sy / 2))[0] ?? null;
  const verdict = (piece) => (piece ? byPiece.get(piece.id) ?? null : null);
  // Active only when some piece has a verdict that can stop or warn the walker (a forbidden or a conditional rule).
  const active = [...byPiece.values()].some((entry) => entry.status === "forbidden" || entry.conditionalRuleIds?.length);
  return {
    active,
    /** A blocking piece whose footprint contains p (containment-aware: a court inside a forbidden platform counts). */
    forbiddenFootprintAt(p) { return pieces.find((piece) => piece.box && blocking(piece.id) && inside(piece.box, p.x, p.z)) ?? null; },
    /** Verdict entry of the floor under p (or null). */
    at(p) { const piece = topFloor(p); return piece ? { pieceId: piece.id, entry: verdict(piece) } : null; },
    check(from, to) {
      if (!active) return { allowed: true, reason: null, pieceId: null, locationId: null };
      const here = topFloor(from);
      const there = topFloor(to);
      const hereForbidden = verdict(here)?.status === "forbidden";
      const crossed = barriers.find((piece) => segmentHitsBox(from, to, piece.box) && !segmentHitsBox(from, from, piece.box));
      if (crossed) return { allowed: false, reason: "forbidden", pieceId: crossed.id, locationId: crossed.locationId ?? null };
      // L-05: containment-aware. Inside the footprint of a blocking piece (even under a court with no rule): moving is
      // allowed and said; entering such a footprint from outside it is blocked.
      const fromIn = pieces.find((piece) => piece.box && blocking(piece.id) && inside(piece.box, from.x, from.z)) ?? null;
      const toIn = pieces.find((piece) => piece.box && blocking(piece.id) && inside(piece.box, to.x, to.z)) ?? null;
      if (toIn && !fromIn) return { allowed: false, reason: "forbidden", pieceId: toIn.id, locationId: toIn.locationId ?? null };
      if (toIn && fromIn) return { allowed: true, reason: "inside", pieceId: fromIn.id, locationId: fromIn.locationId ?? null };
      const entry = verdict(there);
      if (entry?.status === "forbidden" && exceptions.has(there.id)) {
        return { allowed: true, reason: there !== here ? "exception" : null, pieceId: there.id, locationId: there.locationId ?? null, exception: exceptions.get(there.id) };
      }
      if (entry?.status === "forbidden") {
        // Already inside a forbidden piece (e.g. after choosing the persona there): moving within or out is allowed.
        if (hereForbidden && !exceptions.has(here.id)) return { allowed: true, reason: "inside", pieceId: there.id, locationId: there.locationId ?? null };
        return { allowed: false, reason: "forbidden", pieceId: there.id, locationId: there.locationId ?? null };
      }
      if (entry?.conditionalRuleIds?.length && there !== here) return { allowed: true, reason: "conditional", pieceId: there.id, locationId: there.locationId ?? null };
      return { allowed: true, reason: null, pieceId: there?.id ?? null, locationId: there?.locationId ?? null };
    }
  };
}
