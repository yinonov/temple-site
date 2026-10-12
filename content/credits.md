# Credits and licences

Buildings, sky, fire and smoke are built in code; every sound is synthesised in the browser with Web Audio; text uses
the reader's own system fonts. The only models, textures and animations shipped are the two CC0 packs under "Spike
assets" below (the fidelity spike on branch `fidelity-spike`; the default figures are still drawn in code).

| Item | Source | Licence |
| --- | --- | --- |
| Three.js 0.179 (`vendor/three`) | three.js authors | MIT (`vendor/three/LICENSE`) |
| Three.js addons 0.179.1: post-processing, shaders, SimplexNoise, GLTFLoader, SkeletonUtils, BufferGeometryUtils (`vendor/three/addons`) | three.js authors, copied unmodified from the npm package (checksums in `vendor/three/SHA256SUMS`) | MIT |
| Hebrew Mishnah quotes in `facts.json` | Mishnah, ed. Romm, Vilna 1913, digitised by Sefaria (`research/texts/*.he.vilna-1913.json`) | Public domain |
| Layout snapshot `layout.json` | This project's own solved geometry | Project's own work |

Bavli Yoma 20b is cited by locator and paraphrased in our own words; no text of the vendored CC BY-SA file is reproduced.
The English narration is our own wording; the Kulp English Mishnah is not used.

## Voices

Spoken lines (`content/voices/*.mp3`) are generated at authoring time with ElevenLabs text-to-speech, model `eleven_v4`, voice "Daniel" (`onwK4e9ZLuTAKqWW03F9`), under the owner's paid plan, which includes commercial use. Each clip says one line quoted from the public-domain Hebrew Mishnah (or a plain imagined line); none says the divine name or names the slaughter.

## Not shipped: character files (`app/assets/priest/`)

These Quaternius files are kept out of the repository and out of the public build until the creator confirms in writing that the packs are CC0 for public serving (the site-wide Quaternius Asset License of 2026-08-28 does not mention them). Listed here for the record only.

Both packs are by Quaternius and are released under CC0 1.0 (public domain dedication). The licence is stated on the
creator's own pages (https://quaternius.com/packs/universalbasecharacters.html and
https://quaternius.com/packs/universalanimationlibrary.html: "Free to use in personal, educational and commercial
projects", linking CC0) and in `License_Standard.txt` / `License.txt` inside each zip. Both were downloaded from the
creator's itch.io page (https://quaternius.itch.io/) on 2026-10-10. Credit is not required; it is given anyway.

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `body.gltf`, `body.bin`, `skin-*.jpg`, `normal.jpg`, `rough.jpg`, `eye-*.png`, `hair-*.png` | Universal Base Characters [Standard], `Superhero_Male_FullBody` (zip sha256 `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`) | CC0 1.0 | Textures resized to at most 1024 px and the large ones saved as JPEG; texture paths in the glTF renamed |
| `beard.gltf`, `beard.bin` | Same pack, `Hairstyles/Rigged to Head Bone/Hair_Beard` | CC0 1.0 | Texture paths renamed |
| `animations.glb` | Universal Animation Library [Standard], `UAL1_Standard.glb` (zip sha256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`) | CC0 1.0 | Cut down to seven clips (Idle_Loop, Idle_Talking_Loop, Idle_Torch_Loop, Interact, PickUp_Table, Push_Loop, Walk_Formal_Loop); the mannequin mesh removed |

The robe, sleeves, sash and turban are drawn in code over this body, after the garment list in
`app/world/garments.js` (Mishnah Yoma 7:5); their colours and cut are imagination.

## Spike assets (`app/assets/walls/`)

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `stone-color.jpg`, `stone-normal.jpg`, `stone-rough.jpg` | ambientCG "Tiles 144", 2K-JPG (https://ambientcg.com/a/Tiles144), downloaded 2026-10-11 | CC0 1.0, stated on https://docs.ambientcg.com/license/ ("copy, modify, distribute and perform the assets, even for commercial purposes"; no credit required) | Colour map only: saturation and hue graded toward pale limestone (`app/scripts/blender/grade_stone.py`). Normal and roughness unchanged |
| `wall_bay_1.glb` to `wall_bay_4.glb`, `wall-ao-1.jpg` to `wall-ao-4.jpg` | Made for this project in Blender with `app/scripts/blender/build_wall_bay.py` | Project's own work | The occlusion maps are baked from the geometry |

The walls' form (drafted margins, pilasters, cornice, merlons) is imagination. Blender 4.5 is GPL; its output is ours.

## Spike assets (`app/assets/stone/`)

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `paving-color.jpg`, `paving-normal.jpg`, `paving-rough.jpg` | ambientCG "Paving Stones 128", 2K-JPG (https://ambientcg.com/a/PavingStones128), downloaded 2026-10-11 | CC0 1.0 (https://docs.ambientcg.com/license/) | Colour re-graded warm; all three re-saved as JPEG; roughness reduced to 1024 px (`app/scripts/blender/grade_variants.py`) |
| `marble-color.jpg` | Made from ambientCG "Tiles 144" (above), graded nearly white | CC0 1.0 | Contrast and saturation reduced, warm white tint |

## Spike assets (`app/assets/props/lamp-a/`)

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `lamp-a.glb`, `lamp-color.jpg`, `lamp-normal.jpg`, `lamp-orm.jpg` | Made for this project in Blender with `app/scripts/blender/build_lamp.py` | Project's own work | Form after the reference sheet in `docs/fidelity-workplan.md` (measurements; three CC0 Wikimedia Commons photos by Gary Todd, used only as references, not copied into any texture) |

## Spike assets (`app/assets/props/jar`, `stone-cup`, `bowl`, `torch`)

All four are made for this project in Blender with `app/scripts/blender/prop_lib.py` and the `build_*.py` scripts: project's
own work, no third-party files. Forms follow the references in `docs/fidelity-workplan.md` (measurements and visual references
only; no photo was copied into any texture): the jar is a Qumran-type jar after the Metropolitan Museum's example (62 x 27.9
cm); the mug after ibiblio/Library of Congress mug KhQ 1036 (7.5 x 8 cm). The bronze bowl and the torch have no sourced form:
they are imagination, as the title screen says of in-between things.
