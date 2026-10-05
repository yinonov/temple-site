// Day-type context for world-state queries. Isolated so that a future, approved calendar adapter can
// replace it without touching the engine. Contract: docs/contracts/world-state.md "Inputs". Pure ESM.
//
// The in-world date is unresolved: `calendarDate` is always null and no calendar conversion exists.
// The day type is a visitor selection and is never inferred; "unspecified" means not chosen.

export const QUERY_DAY_TYPES = Object.freeze(["ordinary", "festival", "yom_kippur", "unspecified"]);
export const DAY_TYPE_BASIS = "visitor_selection";

/**
 * Normalise a date context. Missing fields default to the honest "unspecified" visitor selection.
 * Throws TypeError on a non-null calendarDate, an unknown dayType or an unknown dayTypeBasis.
 */
export function normalizeDateContext(dateContext = {}) {
  const input = dateContext ?? {};
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("dateContext must be an object");
  const calendarDate = input.calendarDate ?? null;
  if (calendarDate !== null) {
    throw new TypeError("dateContext.calendarDate must be null: no calendar conversion is approved");
  }
  const dayType = input.dayType ?? "unspecified";
  if (!QUERY_DAY_TYPES.includes(dayType)) {
    throw new TypeError(`dateContext.dayType must be one of ${QUERY_DAY_TYPES.join("|")}`);
  }
  const dayTypeBasis = input.dayTypeBasis ?? DAY_TYPE_BASIS;
  if (dayTypeBasis !== DAY_TYPE_BASIS) throw new TypeError(`dateContext.dayTypeBasis must be "${DAY_TYPE_BASIS}"`);
  return { calendarDate: null, dayType, dayTypeBasis };
}

/**
 * Does the event apply on the selected day type?
 * → "applies" | "not_applicable" | "unspecified" (visitor has not chosen; never assumed "ordinary").
 */
export function applicability(event, dateContext) {
  const { dayType } = normalizeDateContext(dateContext);
  if (dayType === "unspecified") return "unspecified";
  const dayTypes = event?.applicability?.dayTypes;
  return Array.isArray(dayTypes) && dayTypes.includes(dayType) ? "applies" : "not_applicable";
}
