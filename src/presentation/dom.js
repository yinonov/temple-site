// Tiny DOM builder. Text always goes through textContent (never innerHTML), so data strings cannot inject markup.

/**
 * h("p", { class: "x", lang: "en", "data-id": "y" }, "text", childNode, [more], null)
 * Special attrs: class, text, hidden (boolean), on: { click: fn }.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "on") for (const [event, handler] of Object.entries(value)) el.addEventListener(event, handler);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === "") continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Language attributes for a data string in a given language (Hebrew is the page default). */
export function langAttrs(language) {
  if (!language || language === "he") return {};
  if (language === "en" || language === "grc") return { lang: language, dir: "ltr" };
  return { lang: language };
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
