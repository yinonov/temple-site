// Timeline controls (TASK-4-03; contract: docs/ui/interaction-contract.md). Every control dispatches to the
// store; render() only reflects the view model + store state back into the controls.
import { h } from "./dom.js";
import { certaintyChip, evidenceButton, tierChip } from "./evidence-panel.js";
import { reportButton } from "./feedback.js";
import { format } from "./strings.he.js";
import { CLOCK_MAX, CLOCK_MIN, CLOCK_STEP } from "./store.js";
import { formatClock } from "./view-model.js";

const $ = (id) => document.getElementById(id);
const NEUTRAL_MARKS = [0, 360, 720, 1080];

export function createTimeline({ store, strings, reducedMotion, onOpenSubject, onReport = null }) {
  const t = strings.timeline;
  const el = {
    heading: $("timeline-heading"), dayType: $("day-type"), dayTypeLabel: $("day-type-label"), dayTypeHint: $("day-type-hint"),
    tabSequence: $("tab-sequence"), tabClock: $("tab-clock"), tabs: $("time-tabs"),
    panelSequence: $("panel-sequence"), panelClock: $("panel-clock"),
    sequenceIntro: $("sequence-intro"), sequenceBody: $("sequence-body"), noSequence: $("no-sequence"),
    sequenceSelectField: $("sequence-select-field"), sequenceSelect: $("sequence-select"), sequenceSelectLabel: $("sequence-select-label"),
    sequenceName: $("sequence-name"), sequencePosition: $("sequence-position"), stageNote: $("sequence-stage-note"),
    sequenceMeta: $("sequence-meta"), orderEvidence: $("order-evidence"), dayTypeDefinition: $("day-type-definition"),
    seqRange: $("seq-range"), seqRangeLabel: $("seq-range-label"),
    seqFirst: $("seq-first"), seqPrev: $("seq-prev"), seqNext: $("seq-next"), seqLast: $("seq-last"), seqSteps: $("seq-steps"),
    orderNote: $("order-note"), orderNoteSummary: $("order-note-summary"), orderNoteText: $("order-note-text"),
    clockIntro: $("clock-intro"), clockReadout: $("clock-readout"), clockRange: $("clock-range"), clockRangeLabel: $("clock-range-label"),
    clockJumps: $("clock-jumps"), clockNoEvents: $("clock-no-events"), play: $("play-button"), reducedNote: $("reduced-motion-note"),
    notice: $("clock-notice"), noticeText: $("clock-notice-text"), noticeDetail: $("clock-notice-detail"), noticeList: $("clock-notice-list"),
    switchToSequence: $("switch-to-sequence")
  };

  // Static labels.
  el.heading.textContent = t.heading;
  el.dayTypeLabel.textContent = strings.dayType.label;
  el.dayTypeHint.textContent = strings.dayType.hint;
  el.tabs.setAttribute("aria-label", t.tabsLabel);
  el.tabSequence.textContent = t.sequenceTab;
  el.tabClock.textContent = t.clockTab;
  el.sequenceIntro.textContent = t.sequenceIntro;
  el.noSequence.textContent = t.noSequence;
  el.sequenceSelectLabel.textContent = t.sequenceSelectLabel;
  el.seqRangeLabel.textContent = t.sequenceRangeLabel;
  el.seqFirst.textContent = t.first;
  el.seqPrev.textContent = t.prev;
  el.seqNext.textContent = t.next;
  el.seqLast.textContent = t.last;
  el.seqSteps.setAttribute("aria-label", t.stepsListLabel);
  el.orderNoteSummary.textContent = t.orderNoteLabel;
  el.clockIntro.textContent = t.clockIntro;
  el.clockRangeLabel.textContent = t.clockRangeLabel;
  el.clockRange.min = String(CLOCK_MIN);
  el.clockRange.max = String(CLOCK_MAX);
  el.clockRange.step = String(CLOCK_STEP);
  el.clockJumps.setAttribute("aria-label", t.jumpsLabel);
  el.clockNoEvents.textContent = t.noClockEvents;
  el.play.setAttribute("aria-label", t.playLabel);
  el.reducedNote.textContent = t.reducedMotion;
  el.switchToSequence.textContent = t.switchToSequence;
  for (const [value, label] of Object.entries(strings.dayType.values)) el.dayType.append(h("option", { value, text: label }));

  // Controls → store.
  el.dayType.addEventListener("change", () => store.dispatch({ type: "setDayType", dayType: el.dayType.value }));
  const selectTab = (axis, focus) => {
    store.dispatch({ type: "setAxis", axis });
    if (focus) (axis === "clock" ? el.tabClock : el.tabSequence).focus();
  };
  el.tabSequence.addEventListener("click", () => selectTab("sequence"));
  el.tabClock.addEventListener("click", () => selectTab("clock"));
  el.tabs.addEventListener("keydown", (event) => {
    const order = ["sequence", "clock"];
    const current = document.activeElement === el.tabClock ? 1 : 0;
    let next = null;
    // RTL: the visually next tab is to the left.
    if (event.key === "ArrowLeft") next = (current + 1) % 2;
    else if (event.key === "ArrowRight") next = (current + 1) % 2;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    if (next === null) return;
    event.preventDefault();
    if ((order[next] === "sequence" && el.tabSequence.disabled)) return;
    selectTab(order[next], true);
  });
  el.sequenceSelect.addEventListener("change", () => store.dispatch({ type: "setSequence", sequenceId: el.sequenceSelect.value }));
  el.seqRange.addEventListener("input", () => store.dispatch({ type: "setStep", step: Number(el.seqRange.value) }));
  el.seqFirst.addEventListener("click", () => store.dispatch({ type: "setStep", step: Number(el.seqRange.min) }));
  el.seqLast.addEventListener("click", () => store.dispatch({ type: "setStep", step: Number(el.seqRange.max) }));
  el.seqPrev.addEventListener("click", () => store.dispatch({ type: "stepBy", delta: -1 }));
  el.seqNext.addEventListener("click", () => store.dispatch({ type: "stepBy", delta: 1 }));
  el.clockRange.addEventListener("input", () => store.dispatch({ type: "setMinute", minuteOfDay: Number(el.clockRange.value) }));
  el.play.addEventListener("click", () => {
    if (reducedMotion.matches) return;
    store.dispatch({ type: "setPlaying", playing: !store.get().playing });
  });
  el.switchToSequence.addEventListener("click", () => {
    store.dispatch({ type: "setAxis", axis: "sequence" });
    el.tabSequence.focus();
  });

  let timer = null;
  const syncTimer = () => {
    const playing = store.get().playing && !reducedMotion.matches;
    if (playing && !timer) timer = setInterval(() => store.dispatch({ type: "tick" }), 700);
    if (!playing && timer) { clearInterval(timer); timer = null; }
  };
  reducedMotion.addEventListener?.("change", () => {
    if (reducedMotion.matches) store.dispatch({ type: "setPlaying", playing: false });
    render(lastVm, store.get());
  });

  let lastVm = null;
  let jumpKey = null;
  function renderJumps(starts, minute) {
    const key = starts.join(",");
    if (key !== jumpKey) {
      jumpKey = key;
      const buttons = NEUTRAL_MARKS.map((mark) => h("button", { type: "button", "data-minute": mark, text: formatClock(mark), dir: "ltr",
        on: { click: () => store.dispatch({ type: "setMinute", minuteOfDay: mark }) } }));
      buttons.push(h("button", { type: "button", id: "jump-prev-event", text: t.prevEvent, on: { click: () => jumpEvent(-1) } }));
      buttons.push(h("button", { type: "button", id: "jump-next-event", text: t.nextEvent, on: { click: () => jumpEvent(1) } }));
      el.clockJumps.replaceChildren(...buttons);
    }
    const prev = starts.filter((start) => start < minute).at(-1);
    const next = starts.find((start) => start > minute);
    $("jump-prev-event").disabled = prev === undefined;
    $("jump-next-event").disabled = next === undefined;
    el.clockNoEvents.hidden = starts.length > 0;
  }
  function jumpEvent(direction) {
    const starts = lastVm?.timeline.clockEventStarts ?? [];
    const minute = store.get().time.minuteOfDay;
    const target = direction < 0 ? starts.filter((start) => start < minute).at(-1) : starts.find((start) => start > minute);
    if (target !== undefined) store.dispatch({ type: "setMinute", minuteOfDay: target });
  }

  function render(vm, state) {
    if (!vm) return;
    lastVm = vm;
    const axis = state.time.axis;
    const hasSequence = vm.timeline.sequences.length > 0;
    el.dayType.value = state.dayType;
    for (const option of el.dayType.options) {
      const label = vm.dayType.options.find((item) => item.value === option.value)?.label;
      if (label && option.textContent !== label) option.textContent = label;
    }
    el.dayTypeDefinition.hidden = !vm.dayType.definition;
    el.dayTypeDefinition.textContent = [vm.dayType.provisional ? `(${vm.dayType.provisional})` : null, vm.dayType.definition].filter(Boolean).join(" ");
    el.tabSequence.setAttribute("aria-selected", String(axis === "sequence"));
    el.tabClock.setAttribute("aria-selected", String(axis === "clock"));
    el.tabSequence.tabIndex = axis === "sequence" ? 0 : -1;
    el.tabClock.tabIndex = axis === "clock" ? 0 : -1;
    el.panelSequence.hidden = axis !== "sequence";
    el.panelClock.hidden = axis !== "clock";
    el.sequenceBody.hidden = !hasSequence;
    el.noSequence.hidden = hasSequence;
    el.tabSequence.setAttribute("aria-disabled", String(!hasSequence));

    if (axis === "sequence" && vm.time?.sequence) {
      const seq = vm.time.sequence;
      el.sequenceSelectField.hidden = vm.timeline.sequences.length < 2;
      if (el.sequenceSelect.options.length !== vm.timeline.sequences.length) {
        el.sequenceSelect.replaceChildren(...vm.timeline.sequences.map((item) => h("option", { value: item.id, text: item.name ?? item.id })));
      }
      el.sequenceSelect.value = seq.id;
      el.sequenceName.textContent = seq.name ?? "";
      el.stageNote.hidden = !seq.stageNote;
      el.stageNote.textContent = seq.stageNote ?? "";
      el.sequenceMeta.replaceChildren(...(seq.certainty ? [h("span", { class: "small muted", text: `${t.sequenceCertainty} ` }), certaintyChip(seq.certainty, strings, "sequence-chip"),
        tierChip(seq.certainty.tier, strings)].filter(Boolean) : []),
        ...(seq.orderEvidence.length ? [evidenceButton({ subjectKey: `order:${seq.id}`, className: "inline-evidence", label: seq.orderEvidenceTitle,
          text: `${t.orderEvidence} (${seq.orderEvidence.length})`, onOpen: onOpenSubject })] : []),
        ...(onReport ? [reportButton({ target: { kind: "sequence", id: seq.id }, subject: seq.name ?? seq.id, strings, onReport, className: "report-button inline-report" })] : []));
      const steps = seq.steps.map((step) => step.step);
      const min = steps.length ? Math.min(...steps) : 0;
      const max = steps.length ? Math.max(...steps) : 0;
      el.seqRange.min = String(min);
      el.seqRange.max = String(max);
      el.seqRange.value = String(seq.step);
      const valueText = format(t.sequenceValueText, { step: seq.step + 1, count: seq.stepCount, label: seq.stepLabel });
      el.seqRange.setAttribute("aria-valuetext", valueText);
      el.sequencePosition.textContent = format(strings.timing.sequenceSingle, { step: seq.step + 1, count: seq.stepCount });
      el.seqFirst.disabled = el.seqPrev.disabled = seq.step <= min;
      el.seqLast.disabled = el.seqNext.disabled = seq.step >= max;
      el.seqSteps.replaceChildren(...seq.steps.map((step) => h("li", { class: `step-item ${step.current ? "is-current" : ""}` },
        h("button", { type: "button", class: "step-button", "aria-current": step.current ? "step" : null, "data-step": step.step,
          "data-focus-key": `step-${step.step}`, on: { click: () => store.dispatch({ type: "setStep", step: step.step }) } },
        h("span", { class: "step-number", text: format(t.stepButton, { step: step.step + 1 }) }),
        h("span", { class: "step-label", text: step.label ?? "" })),
        step.evidence.length ? evidenceButton({ subjectKey: `step:${step.step}`, className: "step-evidence", label: step.evidenceTitle,
          text: `${t.stepEvidence} (${step.evidence.length})`, onOpen: onOpenSubject }) : null)));
      el.orderNote.hidden = !seq.orderNote;
      el.orderNoteText.textContent = seq.orderNote ?? "";
    }

    if (axis === "clock" && vm.time) {
      el.clockRange.value = String(vm.time.minuteOfDay);
      el.clockRange.setAttribute("aria-valuetext", vm.time.clockLabel);
      el.clockReadout.textContent = vm.time.clockLabel;
      renderJumps(vm.timeline.clockEventStarts, vm.time.minuteOfDay);
      const reduced = reducedMotion.matches;
      el.play.disabled = reduced;
      el.reducedNote.hidden = !reduced;
      el.play.textContent = state.playing ? t.pause : t.play;
      el.play.setAttribute("aria-pressed", String(state.playing));
      if (reduced) el.play.setAttribute("aria-describedby", "reduced-motion-note");
      else el.play.removeAttribute("aria-describedby");
      const notice = vm.clockNotice;
      el.notice.hidden = !notice;
      if (notice) {
        el.noticeText.textContent = notice.text;
        el.noticeDetail.textContent = notice.detail;
        el.noticeList.replaceChildren(...notice.events.map((item) => h("li", { text: item.title ?? item.id })));
      }
    }
    syncTimer();
  }

  return { render };
}
