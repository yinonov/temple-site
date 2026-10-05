// "מקורות ורישיונות" dialog (TASK-6-54, ADR-004 Decision 4). Lists every quoted text of the loaded bundle with its
// attribution and licence, then the project's own licences. Text metadata is copied from the bundle unchanged; only the
// licence link is derived (from the licence name), and only for licences with a known canonical page.
import { FOCUSABLE, h } from "./dom.js";
import { sitePath } from "./site.js";

import { licenceLink } from "./licence-link.js";

export { licenceLink };

/**
 * One row per text of the bundle's `texts` map, sorted by textId. Pure; used by the dialog and the E2E scenario.
 * @returns {{ textId: string, title: string, language: string|null, attribution: string, licence: string, link: string|null }[]}
 */
export function buildLicenceEntries(texts) {
  return Object.entries(texts ?? {})
    .filter(([, text]) => text && typeof text === "object")
    .map(([key, text]) => {
      const textId = typeof text.textId === "string" ? text.textId : key;
      const title = [text.work, text.edition].filter((part) => typeof part === "string" && part).join(" — ") || textId;
      const licence = typeof text.license === "string" ? text.license : "";
      return { textId, title, language: typeof text.language === "string" ? text.language : null,
        attribution: typeof text.attribution === "string" ? text.attribution : "", licence, link: licenceLink(licence) };
    })
    .sort((a, b) => (a.textId < b.textId ? -1 : a.textId > b.textId ? 1 : 0));
}

function externalLink(href, text) {
  return h("a", { href, text, target: "_blank", rel: "noopener noreferrer", dir: "ltr" });
}

/** Dialog controller. `getTexts()` is read each time the dialog opens, so it also works after a data-load failure. */
export function createLicencesDialog({ dialog, title, body, closeButton, strings, getTexts, hasOmissions = () => false }) {
  const l = strings.licences;
  let opener = null;
  title.textContent = l.title;
  closeButton.textContent = l.close;

  function render() {
    const entries = buildLicenceEntries(getTexts());
    const list = entries.length
      ? h("ul", { class: "licence-list", id: "licences-texts" }, entries.map((entry) => h("li", { class: "licence-item", "data-text-id": entry.textId },
        h("p", { class: "licence-title" }, h("strong", { text: entry.title, dir: "auto", ...(entry.language && entry.language !== "he" ? { lang: entry.language } : {}) })),
        h("p", { class: "small muted" }, `${l.textIdLabel}: `, h("bdi", { dir: "ltr", text: entry.textId })),
        h("p", { class: "small" }, h("strong", { text: `${l.attributionLabel}: ` }), h("span", { text: entry.attribution, dir: "auto", lang: "en" })),
        h("p", { class: "small" }, h("strong", { text: `${l.licenceLabel}: ` }), h("span", { class: "licence-name", text: entry.licence || l.unknownLicence, dir: "auto" }),
          entry.link ? [" · ", externalLink(entry.link, l.licenceLink)] : null),
        h("p", { class: "small muted licence-unchanged", text: l.unchanged }))))
      : h("p", { class: "hint", id: "licences-texts", text: l.noTexts });
    const fileLink = (path, text) => h("li", {}, h("a", { href: sitePath(path), text, dir: "auto" }));
    body.replaceChildren(
      h("p", { class: "hint", text: l.intro }),
      h("h3", { text: l.textsHeading }), list,
      hasOmissions() ? h("p", { class: "hint licence-omission", id: "licences-omission", text: l.omissionNote }) : null,
      h("h3", { text: l.projectHeading }),
      h("ul", { class: "licence-project", id: "licences-project" },
        h("li", { text: l.content }), h("li", { text: l.code }), h("li", { text: l.three })),
      h("h3", { text: l.filesHeading }),
      h("ul", {}, fileLink("LICENSE", l.fileCode), fileLink("LICENSE-CONTENT.md", l.fileContent), fileLink("NOTICE.md", l.fileNotice),
        fileLink("vendor/three/LICENSE", l.fileThree)));
  }

  // Closing finishes synchronously (as the evidence dialog does) so a quick reopen is never closed by a stale event.
  function finish() {
    if (!opener) return;
    const target = opener;
    opener = null;
    if (target.isConnected) target.focus();
  }
  function close() { if (dialog.open) dialog.close(); finish(); }
  closeButton.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) finish(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return {
    open(from = document.activeElement) {
      opener = from;
      render();
      body.scrollTop = 0;
      if (!dialog.open) dialog.showModal();
      closeButton.focus();
    },
    close,
    isOpen: () => dialog.open
  };
}
