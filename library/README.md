# Model library

Shared 3D models for every home, referenced by id from a project's `inventory.md`
(`Model` column) and `placements.json`.

| Path | Tracked | What |
| --- | --- | --- |
| `catalog.json` | yes | One entry per model: id, path, category, size, origin, source, licence |
| `models/` | **no** (gitignored) | The GLB files: `models/catalog/<id>.glb` (furniture, decor) and `models/outside/<id>.glb` (cartoon city kits for Walk mode's surroundings). Shared separately |
| `tools/` | yes | Importing downloads, catalog checks, contact sheets |

Every model is GLB: metres, resting on y = 0, centered on x/z, front facing +z. A build
fails if an id is not in the catalog or its file is missing from `models/`.

## Catalog fields

`catalog.json` holds `{"models": [...]}`, one model per line, sorted by id:

| Field | Meaning |
| --- | --- |
| `id` | Kebab-case, used in `inventory.md` and `placements.json`; prefixed by pack |
| `path` | Relative to `library/`, e.g. `models/catalog/cgt-chair-09.glb` |
| `category` | First guess from the name; correct by hand (hand edits survive re-import) |
| `size` | `[w, h, d]` in metres, measured after import |
| `origin` | `sourced` (download as is), `modified` (notes name the original id), `generated` |
| `source` | Pack and original file, or the generator script |
| `licence`, `tris`, `materials` | Licence, triangle count, named materials (future material slots) |
| `notes` | Free text |

## Getting a model for an inventory item

1. **Use one as is.** Pick an id from `catalog.json`.
2. **Modify one.** Copy and edit it (Blender), save as a new id, and add a row with
   origin `modified` and the original id in Notes.
3. **Generate one.** Write a script that writes `models/catalog/<id>.glb` and calls
   `addToCatalog` from `tools/catalog.mjs`, with origin `generated`.

The catalog holds realistic models only (textured, real proportions). Low-poly toy
kits were removed; `@box` and the other primitives cover anything with no good model yet.

## Importing a download

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  -P library/tools/import.py -- <pack> <unzipped folder>
node library/tools/contact-sheet.mjs <id prefix>   # review scale and front direction
node library/tools/catalog.mjs check
```

Each pack has a recipe in `tools/import.py`: which files to read, an id prefix, and a
scale and turn found once from a reference piece (a door or bed), with per-model
`scales`/`turns` for pieces modelled differently. Missing texture links are relinked by
file name (`textures`), FBX materials from Corona/V-Ray scenes are rebuilt (metal tint
is read from the FBX specular colour), and textures are capped at 1024 px. A new pack
needs a new recipe. The contact sheet shows every model from its front-right with its size; a
model seen from the back is turned wrong. Once converted, the download can be deleted:
the catalog records the pack and original file for each model.

Imported so far:

- CC0: Poly Haven (14 photoreal models, 1k textures, decimated to 40k triangles).
- **CGTrader free pack** (royalty free): 56 designer pieces from 3ds Max/Corona
  (`cgt-*`): armchairs, chairs, stools, benches, sofa, coffee/side/dining tables, floor,
  table, ceiling and wall lights, artwork and accessories.
- **Sketchfab Standard** (usable in projects, not redistributable as files): "Vase Pack"
  by powers28, split into 10 shapes x ceramic/glass (`vase-ceramic-01`...`vase-glass-10`).
- **Licence unknown**: `GLASS.obj`, split into five glass bud vases and bottles
  (`bud-vase-01`...`05`); its `.max` source has V-Ray materials we cannot read, so the
  importer gives them a plain clear glass.
- **Licence unknown** (user downloads): "Furniture Pack OBJ" (`furnpack-*`, 34 textured
  wooden beds, wardrobes, tables, chairs, kitchen cabinets and bathroom pieces; fronts
  turned from +x, sofa and armchair x0.34); `pillows.glb` (`cushion-square-*`,
  `cushion-long-*`: two fabric patterns x three colours, flat and upright; x0.24);
  `carpets_pack.glb` (`rug-01`...`08`, photo-textured, x0.34); one split AC indoor unit
  (`split-ac-indoor`).

Packs with many items in one file use `split` in their recipe: each mesh becomes its
own model.
