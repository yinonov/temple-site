// Level of detail for instanced porticoes (TASK-6-43). Pure, no Three.js: the renderer thins the columns it draws and
// the inspector view model computes the same numbers to say so ("N of M columns drawn"). The model always keeps the
// full count (solver `portico.columnCount`); only the drawing is thinned, evenly along each row, ends included.

/** Most columns one portico draws on a desktop-class screen. */
export const COLUMN_BUDGET_DESKTOP = 600;
/** Most columns one portico draws on a phone (narrow viewport or a coarse pointer). */
export const COLUMN_BUDGET_PHONE = 160;
/** Viewport width (CSS px) at or below which the phone budget applies. */
export const PHONE_MAX_WIDTH = 600;

/** The per-portico column budget for a viewport. */
export function columnBudgetFor({ width = Infinity, coarsePointer = false } = {}) {
  return width <= PHONE_MAX_WIDTH || coarsePointer ? COLUMN_BUDGET_PHONE : COLUMN_BUDGET_DESKTOP;
}

/**
 * Which columns of a portico to draw. `columns` are the solver's positions in row-major order (`rows` rows of
 * `perRow`). Over budget, each row keeps max(2, floor(budget / rows)) columns evenly spread from its first to its last.
 * @returns {{ total: number, drawn: number, thinned: boolean, indices: number[] }}
 */
export function thinColumns({ rows, perRow }, budget) {
  const total = rows * perRow;
  if (!(budget >= 2) || total <= budget || perRow <= 2) {
    return { total, drawn: total, thinned: false, indices: Array.from({ length: total }, (_, index) => index) };
  }
  const keep = Math.min(perRow, Math.max(2, Math.floor(budget / rows)));
  const picks = [...new Set(Array.from({ length: keep }, (_, j) => Math.round((j * (perRow - 1)) / (keep - 1))))];
  const indices = [];
  for (let row = 0; row < rows; row += 1) for (const pick of picks) indices.push(row * perRow + pick);
  return { total, drawn: indices.length, thinned: indices.length < total, indices };
}
