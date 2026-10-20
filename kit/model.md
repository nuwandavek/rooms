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
`assets/living.jpg`. Builds embed those files. Remote image URLs, paths outside
the project, and symbolic links to outside files are refused. A missing room
photo is shown as missing, never replaced with the previously selected room's image.

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
Plan mode displays a 0.15 m cutaway and restores the previous slider height in 3D.

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
