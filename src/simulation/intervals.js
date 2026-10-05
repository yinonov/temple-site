// Half-open interval helpers shared by the clock and sequence axes (D7).
// Contract: docs/contracts/world-state.md "Intervals are half-open". Pure ESM, no I/O.

/** True iff `start <= point < end` (half-open; the end point is excluded). */
export function containsPoint(start, end, point) {
  return start <= point && point < end;
}

/**
 * Normalised interval of an event's timing:
 * { axis: "clock", start, end } | { axis: "sequence", sequenceId, start, end } | null when malformed.
 */
export function eventInterval(event) {
  const timing = event?.timing;
  if (!timing || typeof timing !== "object") return null;
  if (timing.axis === "clock") {
    return { axis: "clock", start: timing.startMinute, end: timing.endMinute };
  }
  if (timing.axis === "sequence") {
    return { axis: "sequence", sequenceId: timing.sequenceId, start: timing.startStep, end: timing.endStep };
  }
  return null;
}

/**
 * Is the event's interval on the queried axis (and sequence) and does it contain the queried point?
 * A sequence-timed event never matches a clock query and vice versa (no fabricated clock position).
 */
export function eventMatchesTime(event, time) {
  const interval = eventInterval(event);
  if (!interval || interval.axis !== time.axis) return false;
  if (time.axis === "clock") return containsPoint(interval.start, interval.end, time.minuteOfDay);
  return interval.sequenceId === time.sequenceId && containsPoint(interval.start, interval.end, time.step);
}
