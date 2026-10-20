# Home model format

`home.js` exports a plain object. See `kit/template/home.js` for a small complete
example and `projects/kalpataru-radiance/home.js` for the migrated apartment.

## Presentation

Required: `title`. Optional: `brand`, `mark`, `subtitle`, `location`,
`stats: [{value,unit,label}]`,
`source: {label,url,note}`, `floorPlan: {image,alt,note}`,
`resources: [{name,photos: [imagePath,...]}]` for additional photo groups,
`theme: 'riso' | 'almanac' | 'drafting'`, `lighting: 'daylight' | 'afternoon'`.
Text is plain text; use `\n` for a headline line break.

Images are project-relative JPG, PNG or WebP paths, for example
`assets/living.jpg`. Builds check them and rewrite them relative to `out/`; they are
loaded from disk, not embedded. Remote image URLs, paths outside
the project, and symbolic links to outside files are refused. A missing room
photo is shown as missing, never replaced with the previously selected room's image.

## resources.md

When a project has `resources.md`, the build reads it after `home.js` (see
`kit/resources.js`). Each `## Section` is a gallery of `![alt](path)` lines:

- `## Floor plan` sets `floorPlan`; its first image is the plan, its prose the note.
- A section named like a room (case-insensitive), or tagged `## Name {#room-id}`,
  sets that room's `photos`. An unknown `{#id}` is an error.
- Any other section is appended to `resources`.

Other prose is ignored by the parser; use it for provenance.

## inventory.md and library/

When a project has `inventory.md`, every markdown table in it with `Asset` and `Room`
columns becomes `home.inventory` (see `kit/inventory.js`). Columns: Asset, Room (id or
name), Kind, Qty (whole number, default 1), Dims (w×h×d metres, estimated), Colour
(`#rrggbb` hint), Model, Photos (comma-separated; `living-01` means
`assets/living-01.jpg`), Notes. Unknown rooms, bad quantities, uncatalogued ids and
missing model files are build errors.

Model is either an id from `library/catalog.json` or a **primitive** built at load time
from Dims and Colour, with no library file (`kit/primitives.js`): `@frame`, `@mirror`,
`@mirror-arch`, `@rug`, `@curtain`, `@box`. Use primitives for low-stakes flat or boxy
items (prints, mirrors, rugs, curtains, AC units); use library models for pieces with
character. Placed library models are scaled to the row's Dims and tinted toward its
Colour; the build notes stretches beyond about 0.6–1.67× per axis.

Library models are shared by all homes, in metres, resting on y = 0, centered on x/z,
front facing +z. They load with `fetch`, so their previews need `kit/home serve`.

## placements.json

Positions inventory items in the home: `{"placements":[{asset, room, at:[x,z],
rotation, y?, model?}]}`, one entry per instance. `asset` names the inventory row,
whose Model, Dims and Colour the instance uses (`model` overrides). `at` is the
footprint center in metres in the same plan space as the walls; `rotation` is degrees
about the vertical (0 = front faces +z, 90 = +x); `y` lifts the base (lamps on tables,
wall-hung prints and AC units; set `at` half the item's depth off the wall face).
Positions outside the room polygon and more instances than the row's Qty are build
errors. Items whose `y` is above the wall cutaway are hidden with the wall. Furniture
does not yet block Walk mode.

## Geometry

All coordinates, heights, widths and offsets are **metres**.
Plan points are `[x,z]`: x increases right, z increases down the plan, y is up.
The model need not be centered at the origin; the viewer fits its outline.
Keep each shared wall once. Polygons should be simple, non-self-intersecting
outlines without repeating the first vertex. The validator catches malformed or
zero-area polygons; it does not detect every self-intersection, overlap or tracing error.

| Field in `model` | Meaning |
| --- | --- |
| `wallHeight` | Full height, metres |
| `wallThickness` | Wall thickness, metres |
| `cutaway` | Initial visible height, from 0.15 m to full height |
| `outline` | Slab polygon, at least three points |
| `rooms` | Room records (below) |
| `walls` | Segments `{a:[x,z], b:[x,z], openings?:[]}` |
| `railings` | Optional segments `{a,b,height?}`; default height 1.05 m |
| `voids` | Optional service-void polygons, shown with the duct material |

Room records: `{id,name,center,polygon,featured?,dimension?,photo?,photos?,surface?}`.
`photos` is an array of project-relative image paths. The optional `photo` is the
cover image; the viewer deduplicates it against `photos`. Resources shows the
complete gallery; selecting a room in Home3D shows its gallery and thumbnails.
`id` is unique kebab-case. `center` locates the label and camera focus.
`featured: true` shows the room in navigation; all rooms have clickable floors.
`surface` is `floor`, `wet`, or `balcony`. `dimension` is a display label copied
from evidence, not a computed area. Room polygons overlay the slab.

Openings are `{start,end,type,bottom,top}`. Offsets are measured from endpoint
`a` toward `b`, must be ascending, non-overlapping, and fit the segment length.
`type` is `door`, `window`, or `slider`; bottom and top are elevations in metres.
Doors use a schematic fixed swing; handedness is not yet a project field.
Reset (whole home, angled) and Top-down are camera presets: they move the 3D camera and change nothing else.

## Tracing an image

Record the source image, a reliable printed dimension, its pixel length, and a
chosen origin in `plan.md`. Convert each pixel point once:

```js
const point = ([px, py]) => [(px - originX) * metresPerPixel,
                           (py - originY) * metresPerPixel];
```

Opening offsets are pixel lengths multiplied by that scale, without an origin
subtraction. Heights are already metres. Printed dimension labels can differ
from traced geometry: record that uncertainty instead of silently changing them.
