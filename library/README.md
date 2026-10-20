# Model library

Shared 3D models for every home, referenced by id from a project's `inventory.md`
(`Model` column) and `placements.json`.

| Path | Tracked | What |
| --- | --- | --- |
| `catalog.json` | yes | One entry per model: id, path, category, size, origin, source, licence |
| `models/` | **no** (gitignored) | The GLB files, flat: `models/<id>.glb`. Shared separately |
| `generators/` | yes | Code that builds models we make ourselves |
| `tools/` | yes | Importing downloads, catalog checks, contact sheets |

Every model is GLB: metres, resting on y = 0, centered on x/z, front facing +z. A build
fails if an id is not in the catalog or its file is missing from `models/`.

## Catalog fields

`catalog.json` holds `{"models": [...]}`, one model per line, sorted by id:

| Field | Meaning |
| --- | --- |
| `id` | Kebab-case, used in `inventory.md` and `placements.json`; prefixed by pack |
| `path` | Relative to `library/`, e.g. `models/kenney-chair.glb` |
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
3. **Generate one.** Write or extend a script in `generators/` that writes
   `models/<id>.glb` and calls `addToCatalog` (see `generators/blockouts.mjs`). Generated
   models are reusable library entries like any other.

## Importing a download

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  -P library/tools/import.py -- <pack> <unzipped folder>
node library/tools/contact-sheet.mjs <id prefix>   # review scale and front direction
node library/tools/catalog.mjs check
```

Each pack has a recipe in `tools/import.py`: which files to read, an id prefix, and a
scale and turn found once from a reference piece (a door or bed). A new pack needs a
new recipe. The contact sheet shows every model from its front-right with its size; a
model seen from the back is turned wrong. Once converted, the download can be deleted:
the catalog records the pack and original file for each model.

Imported so far (all CC0): Kenney Furniture Kit 2.0 (140, ×2 scale), Quaternius
Furniture Pack Oct 2017 (23, ×1.3, fronts turned from +x), Quaternius Furniture Pack
Mar 2019 (20, ×0.7).

Plans for the library (matching, textures, scale) are in [ROADMAP.md](../ROADMAP.md).
