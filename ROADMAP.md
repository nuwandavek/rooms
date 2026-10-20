# Roadmap: from shell to furnished, textured homes

Design notes from discussion, not yet implemented. The model library is described in
[library/README.md](library/README.md). Current behavior is in [README.md](README.md)
and [kit/model.md](kit/model.md).

## Where we are

Stages so far, per home:

1. **Resources** — listing images in `references/`, viewer copies in `assets/`,
   galleries in `resources.md`.
2. **v0 layout** — walls, rooms, openings, voids traced from the plan in `home.js`.
3. **Assets** — `inventory.md` lists every item seen in the photos (Assets tab).
4. **Placement** — `placements.json` positions library models (4 blockouts placed).

The first home (`kalpataru-radiance`) is being done mostly by hand. Later the same
pipeline should run across **many listings**, so the plan is: lock data formats now,
keep algorithms simple, and make each hand decision reusable.

## Principles

- **Formats are expensive to change; algorithms are cheap.** Get categories, ids,
  inventory fields, provenance and coordinate conventions right first.
- **Footprint before looks.** A correctly sized stand-in is enough for layout; looks
  can be upgraded later without moving anything.
- **This house is labelled data.** Record hand decisions (crops, dimensions, matches,
  trace choices) so they become the eval set for automation.
- **Every stage reports confidence.** At scale, only low-confidence items get reviewed.

## 1. Blockout and textured variants per asset

Each inventory item has two levels of detail:

- **Blockout** — generated from category + dimensions, always present. Defines the
  size contract: footprint and height.
- **Textured** — a matched or sourced library model, optional. Fitted to the
  blockout's bounds; the build flags one whose size differs by more than ~10%.

Views:

- **Study** renders blockouts: flat, honest about size, fits the Riso look.
- **Realistic** renders textured models and falls back to the blockout where none exists.

Implications:

- Placements reference **inventory items**, not model ids. The view picks the variant,
  so upgrading a model never touches `placements.json`.
- Blockouts need no library files: e.g. `bed 1.6×2.0`, `table round 1.0`,
  `wardrobe 1.8×0.6×2.1`, generated at build time.
- A per-row **colour hint** keeps Study readable (pink sofa, black dining table).
- The Assets tab shows coverage, e.g. `69 / 69 blockouts · 4 / 69 textured`.

Proposed inventory columns:

| Column | Example |
| --- | --- |
| Asset | Tub armchair, beige velvet |
| Room | living-dining |
| Kind | furniture / lighting / decor / appliance / fixture |
| Category | seating/armchair |
| Dims | 0.75×0.80×0.75 (w×h×d, metres, estimated) |
| Colour | #d8cbb8 |
| Qty | 2 |
| Blockout | armchair-tub 0.75×0.80×0.75 |
| Textured | (library id, optional) |
| Photos | living-01, living-03 |
| Notes | Facing the sofa |

Open: can instances of one item differ (e.g. mirrored bedside tables)? Probably defer.

## 2. Built-ins are part of the shell

The test is **shaped by the plan** vs **an object in the room**.

- **Shell / built-ins:** kitchen counter runs (base cabinets, slab, uppers), wardrobes
  (usually), bath vanity counters, shower ledges and niches, lofts, glass shower
  partitions, wall-fixed mirrors.
- **Objects (inventory + library):** sanitaryware (WC, basin, shower head),
  appliances (hob, chimney, fridge, AC, TV), loose furniture and decor. These are
  standard products that repeat across homes, where a library pays off.

Built-ins are **declared, not modelled**, next to the walls in `home.js`:

```js
builtins: [
  {type:'counter', wall:…, from:.2, to:3.4, depth:.6, height:.85, uppers:{bottom:1.45, top:2.1, depth:.35}},
  {type:'wardrobe', wall:…, from:.1, to:1.9, depth:.6, height:2.1},
]
```

The kit generates the geometry with **named surfaces** (top, fronts, plinth,
backsplash) that finishes can target. They block Walk mode like walls. Their
inventory rows stay as evidence but are marked **in shell** rather than needing a
model. Borderline cases (freestanding wardrobe, floor mirror) are decided per home.

## 3. Finishes: materials and where they go

Two layers, both text.

### Materials (shared, `library/materials/`)

Three kinds:

```
paint-warm-white:  paint   { colour: #f6f2ea, sheen: matte }
marble-beige:      tiles   { size: 0.8×0.8, grout: 2mm #e6dccb, colour: #efe5d3, variation: 4%, veining: soft }
granite-kitchen:   speckle { base: #2a2a2c, flecks: [#6b6b6b, #a8a8a8], density: 0.35, polish: high }
oak-laminate:      planks  { width: 0.2, length: 1.2, stagger: third, tone: #b89a74, grain: fine }
bath3-diamond:     tiles   { size: 0.3×0.6, pattern: diamond, colour: #c9b6a0, line: #b19c86 }

marble-scan:       image   { map: marble-beige-01.jpg, size: 0.8×0.8 }
oak-real:          image   { map: oak-01/colour.jpg, normal: oak-01/normal.jpg, roughness: oak-01/rough.jpg, size: 1.2×0.2 }

marble-tiles:      tiles   { size: 0.8×0.8, grout: 2mm #e6dccb, fill: marble-beige-01.jpg }
```

- **Procedural** (paint, tiles in grid/brick/herringbone/diagonal, planks, speckle,
  stripes): exact real-world scale, no files, easy to tweak, tiny at scale.
- **Image**: colour map plus optional normal and roughness maps, with a real-world
  size; must tile seamlessly. Sources: CC0 scans (ambientCG, Poly Haven), crops
  from listing photos (lighting baked in, needs cleanup), or generated textures.
- **Mixed**: procedural layout with an image fill per tile, with small random offsets
  or rotations so veins don't repeat.

### Assignments (per project)

```
floor of *                              marble-beige
floor of kitchen                        granite-kitchen
walls of *                              paint-warm-white
walls of master-bath   0–2.1 m          striped-marble-tile
                       2.1 m–top        paint-warm-white
walls of living-dining west 2.0–6.2 m   accent-limewash
counter.top                             granite-black
counter.fronts                          oak-laminate
skirting of *          0–0.1 m          marble-beige
ceiling of *                            paint-white
```

- A **wall face is selected by the room it faces**: one wall segment between Bath 3
  and Bedroom 3 gets tiles on the bath side and paint on the bedroom side.
- Targets: whole room (floor, walls, ceiling); **height bands** (dado, skirting);
  **spans along a wall** (accent wall); **built-in surfaces**.
- Later, more specific rules override earlier ones.

### Study vs Realistic

Realistic shows full textures. Study shows each material's average colour, or (nice
for Riso) the pattern as **linework**: tile grids and plank joints as thin navy lines.

### Deferred

- Raised details (the living room's arched wall moulding) are geometry, not texture:
  a small relief built-in, or a decal at first.
- Wallpaper with real motifs may need a photo crop or a shape-built pattern.

### First finishes for kalpataru-radiance (from photos)

Beige marble-look floor tiles throughout; speckled granite kitchen floor; black
granite counter; oak-laminate base cabinets with white uppers; grey tiles and black
granite in the common bath; striped marble-look tiles in the master bath; beige
diamond tiles in Bath 3; white arched wall moulding in the living room; artificial
grass on the balcony.

## 4. Textures on furniture models

GLBs carry full PBR materials and three.js renders them directly. Requirements:

- **UVs in metres** on generated models, so a shared material tiles at true scale on
  any piece. (Current blockouts have no UVs.)
- **Named material slots** (`fabric`, `wood`, `legs`, `top`) so the viewer can swap
  in a library material per slot: one generic sofa becomes pink velvet here, grey
  linen elsewhere, and all oak items share one texture in memory.
- Triplanar mapping is a fallback for models without usable UVs.
- Sourced models keep their own textures; image-to-3D outputs usually have one baked
  texture and can't be re-slotted.

What makes furniture look less flat, roughly by impact:

1. **Environment lighting** (image-based); the scene currently has only direct lights.
2. Normal and roughness maps (weave, grain, polish).
3. **Bevelled edges** (1–2 cm) on generated models.
4. **Contact shadows / ambient occlusion** where objects meet the floor.

## 5. A large library and matching

- **Catalog** (`library/catalog.json`, in git): id, category (fixed taxonomy), measured
  dimensions, tags (style, material, colour), fidelity (blockout / stylised /
  matched), licence and source, preview renders from 3–4 angles. Model files move
  to Git LFS or object storage as the library grows.
- **Inventory side**: category, estimated dimensions, tags, and a **crop box** on the
  best photo. Dimensions can be anchored on the traced plan ("spans most of the
  3.1 m wall").
- **Matching funnel**: filter by category → filter by dimensions (allow ~±15%
  uniform scale) → rank by look (image embeddings of crop vs previews) → vision
  model judges the top 3–5 → decide:
  - **match**: use as is, maybe recolour;
  - **close**: use as stand-in, flag for upgrade;
  - **none**: generate or create, add to the catalog.
- "Close enough" weights **footprint** (hard), then **silhouette**, then
  **material/colour** (cheapest to fix by material swap).
- Prefer **generic models with parameters**; allow a project-specific model only for
  distinctive pieces.
- Record each decision in `inventory.md` (model id, score, match type).

## 6. Scale considerations

- **Repetition is the lever.** Staged listings from one company likely reuse the same
  furniture, and one developer reuses fixtures across a tower. The library may
  converge after ~10 homes. Check by skimming 5–10 more Truva listings.
- **The plan may be the real bottleneck.** Tracing walls was the most judgement-heavy
  step. Truva's plans look consistently rendered (the wall-grey mask worked well),
  so a tracer built for that style could do most of the work. Confirm on more listings.
- **Confidence and review queues** for every automated stage; existing validators
  (inside-room, printed-dimension agreement) become automatic flags.
- **Cost**: cache vision calls; library previews and embeddings are computed once.
- **Rights**: listing photos and plans belong to the listing source. Using them to
  build models internally differs from publishing viewers that embed them; settle
  before anything is public.

## Implementation plan

### Phase 1 — blockouts for everything

1. Inventory columns: Category, Dims, Colour, Blockout, Textured.
2. Blockout generators in the kit (bed, sofa, armchair, table, chair, cabinet,
   wardrobe, lamp, plant, frame, rug, AC, TV, …) with bevels, metre UVs and named
   material slots.
3. Placements reference inventory items; view picks variant with fallback; build-time
   size check (textured within ~10% of blockout).
4. Study ↔ Realistic toggle in the top-right camera row.
5. Furniture footprints block Walk mode.

### Phase 2 — built-ins

6. `builtins` in `home.js`, declared along walls; generated geometry with named
   surfaces; part of Walk collision.
7. Inventory rows marked **in shell**, counted as such in the Assets tab.

### Phase 3 — finishes

8. Material definitions in `library/materials/`: procedural, image, mixed.
9. Per-project finish assignments with room/wall-face/band/span/built-in targeting.
10. Walls rendered per face (each side its own material) with height bands.
11. Study (average colour or linework) and Realistic rendering of materials.

### Alongside

12. Environment lighting and contact shadows.

### For scale (later)

- Library catalog and preview renders.
- An `import` command that normalises downloaded models (scale, center, y = 0,
  front to +z, decimate, compress textures) and records provenance.
- Recording hand decisions as eval data.
- Survey of other listings for furniture repetition and plan consistency.

Suggested order: **Phase 1 + item 12** first — the whole house furnished in Study view
with better lighting — then built-ins, then finishes.
