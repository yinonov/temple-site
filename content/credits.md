# Credits and licences

Buildings, sky, fire and smoke are built in code; every sound is synthesised in the browser with Web Audio; text uses
the reader's own system fonts. The only models, textures and animations shipped are the two CC0 packs under "Spike
assets" below (the fidelity spike on branch `fidelity-spike`; the default figures are still drawn in code).

| Item | Source | Licence |
| --- | --- | --- |
| Three.js 0.179 (`vendor/three`) | three.js authors | MIT (`vendor/three/LICENSE`) |
| Three.js addons 0.179.1: post-processing, shaders, SimplexNoise, GLTFLoader, SkeletonUtils, BufferGeometryUtils (`vendor/three/addons`) | three.js authors, copied unmodified from the npm package (checksums in `vendor/three/SHA256SUMS`) | MIT |
| Three.js addons 0.179.1: KTX2Loader, WorkerPool, ColorSpaces (`vendor/three/addons`) | three.js authors, copied unmodified from the same npm package | MIT |
| `ktx-parse.module.js`, `zstddec.module.js` (`vendor/three/addons/libs`) | Don McCurdy, bundled in the three.js npm package | MIT (ktx-parse); MIT and BSD (zstddec, wrapping Zstandard) |
| `meshopt_decoder.module.js` (`vendor/three/addons/libs`) | meshoptimizer, Arseny Kapoulkine (header of the file), bundled in the three.js npm package | MIT |
| `basis_transcoder.js`, `basis_transcoder.wasm` (`vendor/three/addons/libs/basis`) | Binomial LLC, Basis Universal, bundled in the three.js npm package | Apache 2.0 |
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

## Courtyard slice assets (`app/assets/props/dressing/`)

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `wood-stack/`, `ash-pan/`, `basket/`, `bench/`, `lamp-stand/`, `water-vessel/`, `banner/` (each a `<id>.glb` with `<id>-color.jpg` and `<id>-ao.jpg`), `dressing.json` | Made for this project in Blender with `app/scripts/blender/build_dressing.py` (the banner alone with `build_banner.py`) | Project's own work | Procedural colour and baked occlusion only; no third-party model, texture or reference image was used |

The forms (log stack, ash pan, basket, bench, lamp stand, water jar on its rest, banner on its pole) are imagination: no sourced form. Nothing in them shows fire, blood or an animal.

## Courtyard slice assets (`app/assets/courtyard/`)

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `courtyard-ground-ao.jpg`, `courtyard-ground-ao-1k.jpg`, `courtyard-ground-ao.json` | Made for this project in Blender (Cycles bake) with `app/scripts/blender/bake_courtyard.py` from the geometry that `app/scripts/export-occluders.js` reads out of `app/scene/temple.js`; no third-party image is used | Project's own work | A top-down map of the inner court's skylight and contact occlusion (1 = open sky). The walls, altar and columns it shades are imagination |

## Compressed copies (`app/assets/**/*.ktx2`, `app/assets/manifest.json`)

Made with `app/scripts/compress-assets.js` (Basis Universal's `basisu`, Apache 2.0, and glTF Transform, MIT; both run at authoring time and are not shipped) from the project's own and the CC0 ambientCG images named in the sections above, under the same licences as their sources. Colour and occlusion maps become KTX2 (ETC1S); the GLB meshes under `walls/`, `props/dressing/` and the animations in `figures/motions.glb` are stored with Meshopt compression. Files: `ash-pan-ao.ktx2`, `ash-pan-color.ktx2`, `basket-ao.ktx2`, `basket-color.ktx2`, `banner-ao.ktx2`, `banner-color.ktx2`, `bench-ao.ktx2`, `body-ao.ktx2`, `body-color.ktx2`, `courtyard-ground-ao-1k.flip.ktx2`, `courtyard-ground-ao.flip.ktx2`, `eyes-color.ktx2`, `garment-ao.ktx2`, `lamp-stand-ao.ktx2`, `lamp-stand-color.ktx2`, `marble-color-1k.flip.ktx2`, `marble-color.flip.ktx2`, `paving-color-1k.flip.ktx2`, `paving-color.flip.ktx2`, `stone-color-1k.flip.ktx2`, `stone-color-1k.ktx2`, `stone-color.flip.ktx2`, `stone-color.ktx2`, `wall-ao-1-1k.ktx2`, `wall-ao-1.ktx2`, `wall-ao-2-1k.ktx2`, `wall-ao-2.ktx2`, `wall-ao-3-1k.ktx2`, `wall-ao-3.ktx2`, `wall-ao-4-1k.ktx2`, `wall-ao-4.ktx2`, `water-vessel-ao.ktx2`, `water-vessel-color.ktx2`, `wood-stack-ao.ktx2`, `wood-stack-color.ktx2`.

## Courtyard slice figures (`app/assets/figures/`)

Made for this project in Blender 4.5 with `app/scripts/blender/build_figure.py`, `author_motions.py` and `figure_rig.py`, from the CC0 "Human Base Meshes" bundle v1.4.1 (Blender Studio and community contributions; body, head, hand, eye and jaw by Dan Ulrich, CC0 1.0; https://www.blender.org/download/demo-files/ ; zip sha256 `811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515`). CC0 needs no credit; it is given anyway. The bundle itself is not in the repo, only the derived files below. Everything else (garments, eyes, brows, hair, beard, textures, rig, motions) is generated by the scripts, with no downloaded texture, mesh or animation.

| Files | Source | Licence | What we changed |
| --- | --- | --- | --- |
| `figure-near.glb`, `figure-mid.glb` | Base: "Body Male - Realistic" from the bundle above. Scripts: `build_figure.py`, `figure_rig.py` | CC0 1.0 (base); the rest is the project's own work | Kept only head and neck, the left hand and wrist and the left foot and ankle (the rest is under the tunic), retopology by decimation to a left half that is mirrored, new UVs, rigged to a 24-bone armature (the 20 body bones plus fingers and thumb of each hand) with skin weights; tunic, turban (wound cloth with five wraps), sash, eyeballs, eyebrows, hair and beard (alpha-tested shells) made by script and skinned to the same armature |
| `figure-far.glb`, `figure-far.vat.bin`, `figure-far.json` | Derived from `figure-mid.glb` and `motions.glb` above by `build_far.py` (Blender): the same body and garments decimated to about 380 triangles and joined, and every clip baked to a vertex-animation texture (raw float16, offsets from the rest pose) | CC0 1.0 (base) as above; the rest is the project's own work | No new source, image or licence: part colours are vertex colours (skin, robe, headwear, sash, hair) tinted in the browser; eyes, brows and beard are left out |
| `motions.glb`, `motions.json` | `author_motions.py` | Project's own work | Seven looping clips (idle, walk, carry, work-a, work-b, bow, pray) authored by script; feet and tool grips placed by an analytic two-bone IK solver and baked to bone rotations, finger and thumb curls by hand |
| `body-color.jpg`, `body-normal.jpg`, `body-ao.jpg` | Baked in Blender (Cycles) from the sculpt levels of the base body; skin colour painted procedurally | CC0 1.0 (base); the rest is the project's own work | Normal and occlusion baked from the three multires levels; albedo is a near-neutral warm map (pores, lips, cheeks, eye sockets, lash lines, stubble) that the browser tints |
| `eyes-color.jpg`, `hair-color.png`, `hair-normal.jpg`, `garment-normal.jpg`, `garment-ao.jpg` | Procedural, by `build_figure.py` (numpy and a Cycles occlusion bake) | Project's own work | Iris and sclera, tileable short hair strands (alpha) and their relief, cloth folds, wrinkles and wound-cloth pleats, baked garment occlusion |
| `figure-parts.json` | Written by `build_figure.py` | Project's own work | Which part uses which texture, alpha test, double-sided, roughness |

The faces, forms and colours are imagination. The dress follows the garment list of Mishnah Yoma 7:5 (tunic, turban, sash; the breeches are under the tunic and not drawn). Nothing in the figures or motions shows blood, an animal, a weapon or the sacrifice. The compressed copies of the colour and occlusion maps (`figures/*.ktx2`) are made by `compress-assets.js` (see below) from the images above.
