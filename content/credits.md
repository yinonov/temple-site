# Credits and licences

No model, texture, audio clip or font is shipped in `app/`. Figures, buildings, sky, fire and smoke are built in code;
every sound is synthesised in the browser with Web Audio; text uses the reader's own system fonts.

| Item | Source | Licence |
| --- | --- | --- |
| Three.js 0.179 (`vendor/three`) | three.js authors | MIT (`vendor/three/LICENSE`) |
| Hebrew Mishnah quotes in `facts.json` | Mishnah, ed. Romm, Vilna 1913, digitised by Sefaria (`research/texts/*.he.vilna-1913.json`) | Public domain |
| Layout snapshot `layout.json` | This project's own solved geometry | Project's own work |

Bavli Yoma 20b is cited by locator and paraphrased in our own words; no text of the vendored CC BY-SA file is reproduced.
The English narration is our own wording; the Kulp English Mishnah is not used.

## Voices

Spoken lines (`content/voices/*.mp3`) are generated at authoring time with ElevenLabs text-to-speech, model `eleven_v4`, voice "Daniel" (`onwK4e9ZLuTAKqWW03F9`), under the owner's paid plan, which includes commercial use. Each clip says one line quoted from the public-domain Hebrew Mishnah (or a plain imagined line); none says the divine name or names the slaughter.
