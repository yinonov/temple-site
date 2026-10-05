// Visitor feedback dialog (TASK-7-11; contract: docs/contracts/feedback.md "UI contract", STRATEGY-2026-10 §5).
// A report is never a historical claim: it is a note for triage. The dialog never says a report was sent unless the
// endpoint answered 201; on any other outcome the text stays in the form and can be downloaded or copied.
// The form is UI-local state (not world state), so it lives here rather than in store.js.
import { FOCUSABLE, h } from "./dom.js";
import { isPublicBuild, sitePath } from "./site.js";
import { format } from "./strings.he.js";

export const FEEDBACK_ENDPOINT = "/api/feedback";
export const CATEGORIES = Object.freeze(["wrong", "missing_source", "alternative", "ui", "other"]);
export const LIMITS = Object.freeze({ message: 4000, sourceSuggestion: 1000, contact: 200, pageUrl: 500 });
const SOURCE_CATEGORIES = new Set(["wrong", "missing_source", "alternative"]);
const FIELD_PATHS = Object.freeze(["category", "message", "sourceSuggestion", "contact"]);
const KEPT_PARAMS = ["mode", "manifest"];

/** Page location without secrets: origin + path + only the app's own parameters (no hash, no other query). */
export function safePageUrl(href) {
  try {
    const url = new URL(href);
    const kept = new URLSearchParams();
    for (const key of KEPT_PARAMS) if (url.searchParams.has(key)) kept.set(key, url.searchParams.get(key));
    const query = kept.toString();
    const value = `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
    return value.length <= LIMITS.pageUrl ? value : `${url.origin}${url.pathname}`.slice(0, LIMITS.pageUrl);
  } catch {
    return undefined;
  }
}

const singleLine = (value) => String(value ?? "").replace(/\s*[\r\n\t]+\s*/g, " ").trim();

/**
 * Client JSON for POST /api/feedback (no id/createdAt: those are server-made). Optional fields are omitted when empty.
 * @param {{ target: { kind: string, id: string|null }, category: string, message: string, sourceSuggestion?: string,
 *   contact?: string, pageUrl?: string, viewport?: { width: number, height: number } }} form
 */
export function buildPayload(form) {
  const payload = { schemaVersion: 1, target: { kind: form.target.kind, id: form.target.id ?? null }, category: form.category, message: form.message };
  const source = singleLine(form.sourceSuggestion);
  if (source) payload.sourceSuggestion = source;
  const contact = singleLine(form.contact);
  if (contact) payload.contact = contact;
  if (form.pageUrl) payload.pageUrl = form.pageUrl;
  if (form.viewport && Number.isInteger(form.viewport.width) && Number.isInteger(form.viewport.height)
    && form.viewport.width > 0 && form.viewport.height > 0) payload.viewport = { width: form.viewport.width, height: form.viewport.height };
  return payload;
}

/** Client-side required/length checks. Returns { path: messageText }. The server stays the authority. */
export function validateForm(form, strings) {
  const f = strings.feedback;
  const errors = {};
  if (!CATEGORIES.includes(form.category)) errors.category = f.required.category;
  if (!String(form.message ?? "").trim()) errors.message = f.required.message;
  else if (form.message.length > LIMITS.message) errors.message = format(f.tooLong, { max: LIMITS.message });
  if (singleLine(form.sourceSuggestion).length > LIMITS.sourceSuggestion) errors.sourceSuggestion = format(f.tooLong, { max: LIMITS.sourceSuggestion });
  if (singleLine(form.contact).length > LIMITS.contact) errors.contact = format(f.tooLong, { max: LIMITS.contact });
  return errors;
}

/**
 * Classify an endpoint outcome. `status` null = network error.
 * → { kind: "sent", id } | { kind: "fields", errors: { path: text } } | { kind: "retry", status } | { kind: "fallback", status }
 * A 400 is a field error only when every diagnostic names a form field; anything else falls back (contract).
 */
export function classifyResponse(status, body, strings) {
  if (status === 201 && body && typeof body.id === "string") return { kind: "sent", id: body.id };
  if (status === 400 && Array.isArray(body?.diagnostics) && body.diagnostics.length) {
    const paths = body.diagnostics.map((item) => String(item?.path ?? "").split(".")[0]);
    if (paths.every((path) => FIELD_PATHS.includes(path))) {
      const errors = {};
      for (const [index, path] of paths.entries()) {
        if (errors[path]) continue;
        const code = body.diagnostics[index]?.code;
        errors[path] = code === "FIELD_REQUIRED" ? (strings.feedback.required[path] ?? strings.feedback.fieldInvalid)
          : code === "ENUM_INVALID" ? strings.feedback.required.category : strings.feedback.fieldInvalid;
      }
      return { kind: "fields", errors };
    }
  }
  if (status === 413 || status === 429) return { kind: "retry", status };
  return { kind: "fallback", status };
}

/** Local timestamp file name: feedback-YYYYMMDD-HHMMSS.json. */
export function fallbackFileName(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `feedback-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}

/** Plain-text version of a payload for the clipboard. */
export function plainTextReport(payload, subjectLabel, strings) {
  const t = strings.feedback.plainText;
  const lines = [t.header, `${t.subject}: ${subjectLabel}${payload.target.id ? ` (${payload.target.kind}: ${payload.target.id})` : ` (${payload.target.kind})`}`,
    `${t.category}: ${strings.feedback.categories[payload.category] ?? payload.category} (${payload.category})`, `${t.message}:`, payload.message];
  if (payload.sourceSuggestion) lines.push(`${t.sourceSuggestion}: ${payload.sourceSuggestion}`);
  if (payload.contact) lines.push(`${t.contact}: ${payload.contact}`);
  if (payload.pageUrl) lines.push(`${t.page}: ${payload.pageUrl}`);
  if (payload.viewport) lines.push(`${t.viewport}: ${payload.viewport.width}×${payload.viewport.height}`);
  return lines.join("\n");
}

/**
 * A "דווחו על בעיה" button. `target` = { kind, id }, `subject` = visible name of the thing reported (data string or
 * chrome), used in the accessible name and the dialog. `focusKey` lets focus return after a re-render.
 */
export function reportButton({ target, subject, strings, onReport, className = "report-button" }) {
  const key = `report-${target.kind}-${target.id ?? "general"}`;
  return h("button", { type: "button", class: className, "data-focus-key": key, "data-feedback-kind": target.kind,
    "data-feedback-id": target.id ?? "", "aria-haspopup": "dialog",
    "aria-label": format(strings.feedback.reportLabel, { subject: subject ?? target.id ?? strings.feedback.generalSubject }),
    on: { click: (event) => onReport({ target, subject, returnKey: key, opener: event.currentTarget }) } }, strings.feedback.report);
}

/**
 * Dialog controller. `fetchImpl` and `now` are injectable for tests. The dialog element is built here once.
 */
export function createFeedbackDialog({ dialog, strings, fetchImpl = (...args) => globalThis.fetch(...args), now = () => new Date(),
  location: loc = globalThis.location, publicBuild = isPublicBuild(), viewport = () => ({ width: Math.round(globalThis.innerWidth), height: Math.round(globalThis.innerHeight) }) }) {
  const f = strings.feedback;
  const ids = { title: "feedback-title", subject: "feedback-subject", intro: "feedback-intro" };
  let current = null; // { target, subject, returnKey, opener }
  const drafts = new Map(); // target key → unsent form values (nothing typed is lost on close)
  let busy = false;

  const fieldError = (name) => h("p", { class: "field-error", id: `feedback-${name}-error`, role: "alert", hidden: true });
  const categoryInputs = CATEGORIES.map((value) => h("div", { class: "fb-option" },
    h("input", { type: "radio", name: "feedback-category", id: `feedback-category-${value}`, value, required: true }),
    h("label", { for: `feedback-category-${value}`, text: f.categories[value] })));
  const categorySet = h("fieldset", { class: "fb-categories", id: "feedback-category", "aria-describedby": "feedback-category-error" },
    h("legend", { text: f.category }), categoryInputs, fieldError("category"));
  const message = h("textarea", { id: "feedback-message", name: "message", rows: 5, maxlength: LIMITS.message, required: true,
    "aria-describedby": "feedback-message-hint feedback-message-counter feedback-message-error" });
  const counter = h("p", { class: "hint fb-counter", id: "feedback-message-counter", "aria-live": "off" });
  const source = h("input", { type: "text", id: "feedback-source", name: "sourceSuggestion", maxlength: LIMITS.sourceSuggestion, dir: "auto",
    "aria-describedby": "feedback-source-hint feedback-sourceSuggestion-error" });
  const sourceField = h("div", { class: "field", id: "feedback-source-field" },
    h("label", { for: "feedback-source", text: f.sourceSuggestion }), h("p", { class: "hint", id: "feedback-source-hint", text: f.sourceSuggestionHint }),
    source, fieldError("sourceSuggestion"));
  const contact = h("input", { type: "text", id: "feedback-contact", name: "contact", maxlength: LIMITS.contact, dir: "auto", autocomplete: "off",
    "aria-describedby": "feedback-contact-hint feedback-contact-error" });
  const status = h("div", { class: "fb-status", id: "feedback-status", role: "status", "aria-live": "polite" });
  const submit = h("button", { type: "submit", id: "feedback-submit", class: "fb-primary", text: f.submit });
  const cancel = h("button", { type: "button", id: "feedback-cancel", text: f.cancel, on: { click: () => close() } });
  const form = h("form", { id: "feedback-form", novalidate: true, "aria-describedby": ids.intro },
    h("p", { class: "fb-subject", id: ids.subject }),
    h("p", { class: "hint", id: ids.intro, text: f.intro }),
    categorySet,
    h("div", { class: "field" }, h("label", { for: "feedback-message", text: f.message }),
      h("p", { class: "hint", id: "feedback-message-hint", text: f.messageHint }), message, counter, fieldError("message")),
    sourceField,
    h("fieldset", { class: "fb-contact" }, h("legend", { text: f.contact }),
      h("label", { for: "feedback-contact", class: "sr-only", text: f.contact }),
      h("p", { class: "hint", id: "feedback-contact-hint", text: f.contactHint }), contact, fieldError("contact")),
    h("p", { class: "hint fb-auto", text: f.autoData }),
    status,
    h("div", { class: "button-row fb-actions" }, submit, cancel));
  const closeButton = h("button", { type: "button", class: "close-button", id: "feedback-close", text: f.close, on: { click: () => close() } });
  dialog.replaceChildren(
    h("div", { class: "dialog-head" }, h("h2", { id: ids.title, text: f.title }), closeButton),
    h("div", { class: "dialog-body" }, form));
  dialog.setAttribute("aria-labelledby", ids.title);

  const selectedCategory = () => categoryInputs.map((node) => node.querySelector("input")).find((input) => input.checked)?.value ?? "";
  const targetKey = (target) => `${target.kind}:${target.id ?? ""}`;
  const formValues = () => ({ category: selectedCategory(), message: message.value, sourceSuggestion: sourceField.hidden ? "" : source.value, contact: contact.value });

  function updateCounter() { counter.textContent = format(f.counter, { count: message.value.length, max: LIMITS.message }); }
  function updateSourceVisibility() {
    const category = selectedCategory();
    sourceField.hidden = Boolean(category) && !SOURCE_CATEGORIES.has(category);
  }
  function showErrors(errors) {
    for (const name of ["category", ...FIELD_PATHS.slice(1)]) {
      const node = dialog.querySelector(`#feedback-${name}-error`);
      const text = errors[name] ?? "";
      node.textContent = text;
      node.hidden = !text;
      const control = name === "category" ? categorySet : name === "message" ? message : name === "sourceSuggestion" ? source : contact;
      if (text) control.setAttribute("aria-invalid", "true"); else control.removeAttribute("aria-invalid");
    }
    const first = Object.keys(errors)[0];
    if (first === "category") categoryInputs[0].querySelector("input").focus();
    else if (first === "message") message.focus();
    else if (first === "sourceSuggestion") { sourceField.hidden = false; source.focus(); }
    else if (first === "contact") contact.focus();
  }
  function setStatus(...children) { status.replaceChildren(...children); }

  function currentPayload() {
    return buildPayload({ target: current.target, ...formValues(), pageUrl: safePageUrl(loc?.href ?? ""), viewport: viewport() });
  }

  function fallbackPanel(payload, lead) {
    const text = plainTextReport(payload, current.subject ?? f.generalSubject, strings);
    const note = h("p", { class: "fb-note", id: "feedback-fallback-note" });
    const copyBox = h("textarea", { id: "feedback-copy-text", readonly: true, rows: 6, "aria-label": f.copyTextLabel, hidden: true, dir: "auto" });
    copyBox.value = text;
    const download = h("button", { type: "button", id: "feedback-download", text: f.download, on: { click: () => {
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = h("a", { href: url, download: fallbackFileName(now()), hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      note.textContent = f.downloaded;
    } } });
    const copy = h("button", { type: "button", id: "feedback-copy", text: f.copy, on: { click: async () => {
      try {
        await navigator.clipboard.writeText(text);
        note.textContent = f.copied;
      } catch {
        copyBox.hidden = false;
        copyBox.focus();
        copyBox.select();
        note.textContent = f.copyFailed;
      }
    } } });
    return h("div", { class: "fb-fallback", id: "feedback-fallback" },
      h("p", { class: "fb-fallback-title", text: f.fallbackTitle }),
      lead ? h("p", { text: lead }) : null,
      h("p", { text: f.fallbackBody }),
      h("p", { text: f.fallbackWhere }),
      h("div", { class: "button-row" }, download, copy),
      note, copyBox);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || !current) return;
    setStatus();
    const values = formValues();
    const errors = validateForm(values, strings);
    showErrors(errors);
    if (Object.keys(errors).length) { setStatus(h("p", { class: "fb-error", text: f.fieldErrorsSummary })); return; }
    const payload = currentPayload();
    busy = true;
    submit.disabled = true;
    submit.textContent = f.sending;
    let outcome;
    try {
      // Public static build: there is no endpoint, so go straight to the download/copy fallback with no request.
      if (publicBuild) throw new Error("public-build");
      const response = await fetchImpl(sitePath(FEEDBACK_ENDPOINT), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      outcome = classifyResponse(response.status, body, strings);
    } catch {
      outcome = classifyResponse(null, null, strings);
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = f.submit;
    }
    if (!dialog.open) return;
    if (outcome.kind === "sent") {
      drafts.delete(targetKey(current.target));
      form.hidden = true;
      const done = h("button", { type: "button", id: "feedback-done", class: "fb-primary", text: f.close, on: { click: () => close() } });
      dialog.querySelector(".dialog-body").append(h("div", { class: "fb-success", id: "feedback-success", role: "status" },
        h("p", { class: "fb-success-title", text: f.success }),
        h("p", { class: "fb-id" }, format(f.successId, { id: "" }), h("bdi", { dir: "ltr", text: outcome.id })),
        h("p", { text: f.successNext }), done));
      done.focus();
      return;
    }
    if (outcome.kind === "fields") {
      setStatus(h("p", { class: "fb-error", text: f.fieldErrorsSummary }));
      showErrors(outcome.errors);
      return;
    }
    const lead = outcome.kind === "retry" ? f.retryLater[outcome.status] : publicBuild ? f.publicBuildLead : null;
    setStatus(fallbackPanel(payload, lead));
    dialog.querySelector("#feedback-download")?.focus();
  }

  form.addEventListener("submit", onSubmit);
  message.addEventListener("input", updateCounter);
  for (const node of categoryInputs) node.querySelector("input").addEventListener("change", updateSourceVisibility);

  // Keep focus inside the modal (the native modal already makes the page inert; this wraps Tab at the ends).
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest("[hidden]") && el.getClientRects().length
      && !(el.type === "radio" && !el.checked && dialog.querySelector(`input[name="${el.name}"]:checked`)));
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });

  function saveDraft() {
    if (!current || form.hidden) return;
    const values = formValues();
    if (values.category || values.message || source.value || values.contact) drafts.set(targetKey(current.target), { ...values, sourceSuggestion: source.value });
  }

  function close() {
    if (!current) return;
    saveDraft();
    const { opener, returnKey } = current;
    current = null;
    if (dialog.open) dialog.close();
    dialog.querySelector(".fb-success")?.remove();
    const target = opener?.isConnected ? opener : returnKey ? document.querySelector(`[data-focus-key="${CSS.escape(returnKey)}"]`) : null;
    target?.focus();
  }

  function open({ target, subject = null, returnKey = null, opener = document.activeElement }) {
    if (current) close();
    current = { target, subject, returnKey, opener };
    dialog.querySelector(".fb-success")?.remove();
    form.hidden = false;
    const draft = drafts.get(targetKey(target)) ?? {};
    for (const node of categoryInputs) { const input = node.querySelector("input"); input.checked = input.value === (draft.category ?? (target.kind === "ui" ? "ui" : "")); }
    message.value = draft.message ?? "";
    source.value = draft.sourceSuggestion ?? "";
    contact.value = draft.contact ?? "";
    updateCounter();
    updateSourceVisibility();
    showErrors({});
    setStatus();
    const kindLabel = f.kinds[target.kind] ?? target.kind;
    // R-01: the visible subject is the record's visitor title, never its id (the id stays in the payload) and never a literal "null".
    const subjectText = subject ?? (target.kind === "general" ? f.generalSubject : null);
    dialog.querySelector(`#${ids.subject}`).replaceChildren(...[h("strong", { text: `${f.subject} ` }), `${kindLabel}`,
      subjectText ? " — " : null, subjectText ? h("bdi", { text: subjectText }) : null].filter((node) => node !== null));
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(".dialog-body").scrollTop = 0;
    (categoryInputs.map((node) => node.querySelector("input")).find((input) => input.checked) ?? categoryInputs[0].querySelector("input")).focus();
  }

  return { open, close, isOpen: () => dialog.open };
}
