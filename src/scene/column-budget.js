// Browser-side choice of the per-portico column budget (TASK-6-43). Kept out of src/scene/geometry/, which stays pure.
import { COLUMN_BUDGET_DESKTOP, columnBudgetFor } from "./geometry/portico-lod.js";

/** The budget for the current browser window (desktop budget without a window). */
export function columnBudgetForWindow(win = typeof window === "undefined" ? null : window) {
  if (!win) return COLUMN_BUDGET_DESKTOP;
  let coarsePointer = false;
  try { coarsePointer = Boolean(win.matchMedia?.("(pointer: coarse)").matches); } catch { coarsePointer = false; }
  return columnBudgetFor({ width: win.innerWidth, coarsePointer });
}
