// Where WebGL is missing: the same moment, in words. It says only what the app already says elsewhere: the clock line and
// the place notes (each marked as from the sources, or as imagined) of what is running now. Nothing new is claimed, and
// nothing about what comes next.
import { worldAt } from "./world/world.js";
import { NOTES } from "./world/notes.js";
import { UI, clockText } from "./ui-text.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const at = params.get("at") ? Date.parse(params.get("at")) : NaN;
const offset = Number.isFinite(at) ? at - Date.now() : 0;
let lang = params.get("lang") === "en" ? "en" : "he";

for (const id of ["stage", "enter", "stick", "keys", "clock", "sound", "bubbles", "note", "follow", "back", "heard"]) $(id)?.setAttribute("hidden", "");
$("plain").hidden = false;

function notesNow(world) {
  const running = new Set(world.routines.map((r) => r.id));
  const live = NOTES.filter((n) => n.during && [].concat(n.during).some((d) => running.has(d)));
  return live.length ? live : NOTES.filter((n) => !n.during && n.radius > 60);
}

function render() {
  const world = worldAt(Date.now() + offset);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  $("plain-title").textContent = $("enter").querySelector("h1").dataset[lang];
  $("plain-lead").textContent = UI[lang].plain;
  $("plain-clock").innerHTML = clockText(world, lang);
  $("plain-notes").replaceChildren(...notesNow(world).map((n) => {
    const card = document.createElement("article");
    card.className = n.imagined ? "imagined" : "";
    const kind = document.createElement("small");
    kind.textContent = n.imagined ? UI[lang].imagined : UI[lang].source;
    const text = document.createElement("p");
    text.textContent = n[lang];
    card.append(kind, text);
    return card;
  }));
  $("plain-disclaimer").textContent = $("enter").querySelector(".small").dataset[lang];
  $("plain-lang").textContent = UI[lang].lang;
  document.title = $("plain-title").textContent;
}
$("plain-lang").addEventListener("click", () => { lang = lang === "he" ? "en" : "he"; render(); });
render();
setInterval(render, 20000);
window.__temple = { plain: true, state: () => ({ plain: true, text: $("plain").innerText, dir: document.documentElement.dir }) };
