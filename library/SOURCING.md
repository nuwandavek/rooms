# Sourcing models for the library

A working doc for deciding where `library/` models come from. Nothing here is decided;
the **Open questions** at the end are what we need to settle.

## Where we are

- The first home, `kalpataru-radiance`, has **69 inventory rows (95 pieces)** across
  9 rooms, identified from the listing photos.
- `library/` has **2 models**, both box blockouts from `generators/blockouts.mjs`: `bed-queen`
  (used 3×) and `sofa-3seat` (1×). Four instances are placed via `placements.json`.
- Every model is a `.glb` in metres, resting on y = 0, centered on x/z, front facing +z.
  The Assets tab renders a preview and shows the measured size.

### What the inventory needs

| Kind | Rows | Pieces | Typical items |
| --- | --- | --- | --- |
| furniture | 18 | 27 | beds, bedside tables, sofa, armchairs, dining set, desk, stools |
| decor | 18 | 30 | 13 framed prints, 5 plants, 4 curtain sets, 3 rugs, mirrors |
| fixture | 19 | 19 | wardrobes, kitchen cabinets, WCs, basins, showers, mirrors |
| lighting | 6 | 10 | 6 table lamps, sconces, pendant, floor lamp |
| appliance | 8 | 9 | 5 split ACs, TV, fridge, hob, chimney |

Most of this is **simple geometry**: boxes, cylinders and panels (tables, wardrobes,
cabinets, frames, rugs, ACs, mirrors). A smaller set has **character**, where a box
reads wrong: tub armchairs, the velvet sofa, dining chairs, lamps, plants, sanitaryware.

## What a good library model needs

- **Scale and orientation** match the convention above; a size check against the
  inventory notes (e.g. queen bed ≈ 1.6 × 2.0 m mattress).
- **Light enough** to load many at once: a rough budget of < 20k triangles and
  < 1 MB per model, textures ≤ 1024 px. A home may place 100+ instances.
- **Fits the look**: Riso wants pale, slightly flat materials. Photoreal PBR models
  can look out of place next to the shell; we may want to restyle materials on load.
- **Licence we can ship**: models are served with the viewer and may end up in shared
  exports. CC0 or our own work is simplest; CC-BY is fine with attribution in
  `library/README.md`; anything "personal use only" or "editorial" is out.
- **Reusable**: ids describe a generic piece (`armchair-tub`), not one home's item,
  so the next home can reuse it. Per-home colour could come from a placement option.

## Options

### 1. Parametric generators (extend `generators/blockouts.mjs`)

Small functions that build a model from parameters: `bed({width, length, headboard})`,
`table({shape:'round', diameter, height})`, `wardrobe({width, doors})`, `frame({w, h})`.

- **Good:** exact dimensions, consistent style, tiny files, no licence questions,
  fast to add variants. Covers most of the inventory (cabinets, wardrobes, tables,
  frames, rugs, mirrors, ACs, TV, curtains as panels).
- **Bad:** looks like a diagram. Curved, upholstered or organic items (armchairs,
  plants, lamps) are hard to make convincing from primitives.
- **Effort:** low per item once there are 5–6 shared building blocks (box, rounded
  box, cylinder, legs, panel with frame, simple lathe for lamps and vases).

### 2. Free CC0 libraries

- **Poly Haven** (CC0): high-quality, photoreal furniture and decor; limited catalogue;
  heavy textures that would need downsizing.
- **Kenney – Furniture Kit** (CC0): low-poly, stylised, very light; generic shapes;
  could suit Riso well.
- **Quaternius** (CC0): low-poly packs including furniture and plants.
- **Good:** no licence friction, ready today, plants and lamps solved cheaply.
- **Bad:** rarely matches the actual item; style varies between sources; models need
  re-scaling, re-centering and orientation fixes on import.

### 3. Large catalogues (Sketchfab and similar)

Downloadable models filtered by licence (CC0 / CC-BY).

- **Good:** huge range; often a close match for specific pieces (tub armchair, arched
  mirror, vessel basin).
- **Bad:** licence must be checked per model; quality and triangle counts vary wildly;
  attribution bookkeeping; some need cleanup in Blender.
- Manufacturer and retailer models (e.g. furniture brands' 3D files) usually forbid
  redistribution, so they are probably out for a shared library.

### 4. Generate from the photos (image-to-3D)

Crop the item from a listing photo and run an image-to-3D model.

- **Good:** closest to *this* home's actual furniture; scales to many homes without a
  catalogue; fun.
- **Bad:** uneven quality, especially for thin parts (chair legs, lamp stems) and glass;
  outputs need decimation, scaling and orientation; licensing of the tool's output and
  of the source photo needs checking; results vary between runs.
- Worth a spike on 3–4 hero items before committing.

### 5. Model by hand

Blender (or similar) for the handful of pieces that matter most.

- **Good:** best quality and style control.
- **Bad:** slowest; does not scale across homes.

## Proposal (to discuss)

A layered approach, with one id per generic piece so any layer can replace another:

1. **Generators for the simple majority**: wardrobes, cabinets, tables, beds, frames,
   rugs, mirrors, ACs, TV, curtains, sanitaryware as simple shapes. This gets the
   whole kalpataru home furnished at blockout fidelity quickly.
2. **CC0 low-poly packs for organic filler**: plants, lamps, vases.
3. **Spike image-to-3D** on the hero items (tub armchair, sofa, dining chair, arched
   mirror) and compare against a Sketchfab CC-BY find for each.
4. Track every model's source, licence and tool in `library/README.md`, plus a
   `fidelity` note (blockout / stylised / matched) so we know what to upgrade.

Possible kit additions this would need:

- An `import` command that normalises a downloaded model (scale to metres, center on
  x/z, drop to y = 0, rotate front to +z, decimate, compress textures) and writes
  `library/models/<id>.glb` with a catalog row (now `library/tools/import.py`).
- Optional per-placement `color` or material override, so one generic model serves
  pink and grey sofas.
- Variants: `bed-queen` vs `bed-queen-slatted`, or parameters stored in the library
  and generated at build time.

## Open questions

1. **Fidelity target:** blockouts everywhere first, or match the photos as closely as
   possible for each home?
2. **Style:** should models match the Riso look (flat, pale) or look realistic?
3. **Licence bar:** CC0 only, or CC-BY with attribution as well?
4. **Scope:** do fixtures (kitchen cabinets, sanitaryware, wardrobes) get models, or
   should they be part of the shell geometry instead?
5. **Decor depth:** do the 13 framed prints, curtains and plants matter now, or only
   furniture that affects layout?
6. **Image-to-3D:** worth a spike? Which tool, and is its output licence acceptable?
7. **Shared vs per-home:** keep one global `library/`, or allow `projects/<name>/models/`
   for one-off pieces?
