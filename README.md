# rooms.

A reusable kit for interactive home studies: one renderer, separate projects,
and a skill for making more. This follows the `kit/` + `projects/` approach in
`../how-does-that-work`.

The current home is **`projects/kalpataru-radiance/`**. All files from the previous
version, including the original standalone HTML, are preserved in **`archive/`**.

## Setup

Use Node.js 22.12+ and npm. From this repository:

```sh
npm ci
```

## Start a new project

```sh
kit/home new my-next-home
kit/home serve my-next-home
```

Open **http://127.0.0.1:4173**. The starter contains a small illustrative room.
Gather source images first and list them in `resources.md` (the Resources tab
reads it). Replace the layout and text in `projects/my-next-home/home.js`, record the scope
in `brief.md`, and keep calibration and assumptions in `plan.md`. Add source
images in `references/` and smaller viewer images in `assets/` as needed.
Existing project folders are never overwritten by `new`.

## Open an existing project / run a server

```sh
kit/home list
kit/home serve kalpataru-radiance
```

Visit **http://127.0.0.1:4173**. The server listens locally and rebuilds on each
page request: edit the project or kit, then **refresh the browser**. Stop it with
**Ctrl+C**. This is refresh-to-rebuild, not automatic live reload.

To use another port, including when another project is already running:

```sh
kit/home serve kalpataru-radiance --port 4174
```

To open a project without running a server:

```sh
kit/home open kalpataru-radiance
```

This builds and opens `projects/kalpataru-radiance/out/index.html` in your default
browser. It includes the code and styles and loads images from the project folder
by relative path, so it works over `file://` without network access as long as it
stays inside `projects/<name>/out/`. Re-run `open` after changing source files.
WebGL is needed for the 3D view; the source plan remains available without it.

## Host a home

Homes are static sites, served at `https://rooms.isopolis.city/<project>/` from the shared
`isopolis` S3 bucket (`rooms/` prefix) through CloudFront. Settings live in `.env`
(gitignored; copy `.env.example`).

```sh
bash kit/hosting/setup.sh                 # once: CloudFront distribution + bucket grant; prints the DNS CNAME
kit/home publish kalpataru-radiance       # stage projects/<name>/out/site (only the files it uses)
kit/home deploy kalpataru-radiance        # publish, upload, invalidate; add --dry-run to preview
```

All examples run from the repository root. You can also run the absolute path
to `kit/home` from any directory, or use `npm run home -- <command> <name>`.

## Viewer tabs

Visitors see **Listing** (the resources), **3D Tour** (the Realistic stage), and
**3D Tour (Improved Lighting)** when a bake exists. The improved tour opens by
default, falling back to the regular tour for homes without a bake. Both tours
share the same isometric cutaway; improved lighting applies in Free Walk and Guided Tour.
The **Dev** toggle at top right (off by default, remembered per browser, or
`?dev=1`) shows every tab, numbered by authoring stage: **1 Listing** (resources),
**2 Assets**, **3 Shell**, **4 Fit-out**, **5 Furnished**, **6 3D Tour** (realistic).

**Resources** contains the floor plan, room photo galleries, and other source
images. Click any image to enlarge it, or use **View in 3D** to focus its room.
**Assets** lists the inventory. **Shell**, **Fit-out** and **Furnished** share one 3D
viewer and add layers left to right: walls, rooms and openings; then the project's
`fitout.json` (floor, wall, door and frame finishes from `library/materials.json`,
built-ins such as kitchen counters) plus placed `fixture` rows; then loose furniture,
lighting and decor. The viewer keeps the room
list, selected-room photos and thumbnails beside the model, with **Isometric View**, **Free Walk** and **Guided Tour** modes at top left and **↺ Reset** / **Top-down** cameras at
top right. View settings includes zoom −/+, wall cutaway, layers and lighting.
The project name, location, bedrooms and floor area live in the collapsible
**Project details** card at the top right.

Choose **Walk** for a standing view at 1.65 m eye height. **Click the floor** to
glide there (a ring shows where you will land), **drag** to look around (Street View
style), and use **WASD** or the **arrow keys** to move, **Q/E** or **←/→** to turn and
the **scroll wheel** to step. **Mouse look** in settings captures the mouse and turns
like a game; **Esc** releases it. Click the scene to resume keyboard control after using UI
controls. Walls, windows, railings, voids and slab edges block movement; doorways
and open sliding doors are passable. Room buttons jump to that room. Walk uses
full-height walls; switching back to 3D restores the cutaway setting.

**Guided Tour** walks the same camera from room to room, making one slow pan at each
stop, with pause, previous and next controls. Stops come from the project's optional
`tour.json` (see `kit/model.md`); without it the tour visits every featured room.
**Free Walk** takes over from wherever the tour is.

To open a stage directly, visit `http://127.0.0.1:4173/?tab=shell` (or `fitout`,
`furnished`, `realistic`; `?tab=home3d` opens the last 3D stage). Add `&mode=walk` (or `&mode=tour`) to
start in Walk mode (or the tour) (`&mode=3d` is the default); the URL keeps both as you switch. In
Walk mode it also keeps `&cam=x,z,heading,pitch`, so copying the address shares the exact view.

## Assets tab and model library

**Assets** lists each project's `inventory.md`: every item per room with its kind,
quantity, the photos it appears in, and a rendered preview when it references a model
from the shared library. Previews load models over the local server, so use
`kit/home serve`. The library is `library/catalog.json` (tracked: id, path, size,
source) plus `library/models/*.glb` (gitignored, shared separately); see
`library/README.md` for importing downloads and generating models.
`placements.json` puts library models into the 3D home (toggle with **Furniture** in
View settings); see `kit/model.md` for the format.

## Baked lighting

With Blender installed, `kit/home bake kalpataru-radiance --draft` exports
the furnished scene and bakes separate daylight and night lightmaps. Use
the command without `--draft` for a 4096² atlas with 128 samples (draft: 2048², 64 samples).
Set `BLENDER=/path/to/blender` if Blender is not in the standard application path.
Refresh the viewer and choose **3D Tour (Improved Lighting)** to inspect the result.

Models and the selected lightmap download concurrently. EXR decoding runs in an
embedded worker, and the other day/night map loads only when selected; both are
cached for the lifetime of the viewer. The original 4K HDR pixels are preserved.
Shaders prepare asynchronously and texture uploads yield between batches. The
outdoor city builds in short background tasks, while room reflections refine
progressively after the interior is usable, starting with the current room.
The baked walkthrough hides **Doors closed**, since its door geometry is fixed.

The bake includes diffuse direct light, bounced light and furniture shadows.
Overlapping structural wall boxes are united before baking, and the ceiling is
clipped to their inner faces. Lightmap borders are rebuilt from interior texels to
remove bright seams, and narrow charts are filtered separately so wall ends and
skirting do not pick up neighbouring surfaces.
Furniture and reflective materials remain live; local room probes supply their
reflections. Day and night use separate half-float HDR lightmaps (ZIP-compressed EXR)
to preserve smooth shadow gradients. The previous bake is
kept under `out/bake/previous-*`; an incomplete bake never replaces it.
Lamp origins can be anchored to the actual bulb with placement `light` metadata
(see `kit/model.md`). Lighting remains an illustrative study, not a measurement.

## Build and check

```sh
kit/home build kalpataru-radiance
npm test
kit/home check kalpataru-radiance
```

`build` validates geometry and image paths and creates the standalone HTML in
the project's `out/`. `check` also opens a browser, exercises room selection,
3D/Walk modes, camera presets, cutaway, layer toggles, lighting, references, and mobile layout,
and writes `out/check.json` plus `out/check-{3d,top-down,light,walk,mobile}.png`
and resource screenshots (`check-resources.png`, `check-resources-mobile.png`).
Look at the screenshots; the automated check cannot judge visual quality.

The check command uses installed Google Chrome on macOS, or Playwright Chromium.
If no browser is installed, run `npx playwright install chromium`. To select
a browser executable explicitly:

```sh
HOME3D_BROWSER=/path/to/chrome kit/home check kalpataru-radiance
```

Browser launches and local ports can be restricted inside an agent sandbox.
Run `serve` and `check` in your local terminal if that happens.

## Structure

```text
SKILL.md                       Authoring workflow for agents
kit/
  home                         CLI: new, list, build, open, serve, check
  home.js / home.css           Shared viewer and interface
  geometry.js                 Shell, floors, walls, openings, railings
  themes.js / themes/         Artifactbin palettes, 3D materials and lights
  template/                   A new home's starting files
  model.md                    Model format and coordinate conventions
projects/
  kalpataru-radiance/
    brief.md / plan.md        Intent, evidence, assumptions
    resources.md              Resources tab galleries and image provenance
    tour.json                 Optional Guided Tour stops
    inventory.md              Assets tab: furniture and fittings per room
    home.js                   This home's model and presentation data
    index.html                Page template used by the build
    assets/                   Viewer-sized images
    references/               Original photos, plan and provenance
    out/                      Generated exports and checks (gitignored)
library/                      Shared .glb models and their provenance
archive/                      The entire previous version
```

The runtime does not read the archive or neighboring repositories. Do not edit
generated `out/index.html`; edit the project or shared kit and rebuild.

## Themes, materials and lighting

The default is **Riso** from Artifactbin: cream paper, navy outlines, bright blue
controls, pink accents, yellow highlights, and playful print-style edges. The
model uses pale floors, blue wet areas and warm soft light. **Almanac** remains
available for a quieter green-and-terracotta presentation.
**Drafting** is included for a cooler, technical presentation with a ground grid.
Choose in a project's `home.js`:

```js
theme: 'riso',          // or 'almanac', 'drafting'
lighting: 'day',        // or 'night'
```

The viewer's Light study buttons switch between **Day** (soft daylight) and
**Night** (faint moonlight, lamps on). Walk mode looks out at a generated city (plain towers
under a gradient sky, lit windows at night) with the street `storey` floors below
(`storey: 5` in `home.js`, default 3). Lighting is illustrative, not a sun-path or illuminance calculation.
The 3D palette and light setup live in `kit/themes.js`; exact source palette
snapshots and principles live in `kit/themes/`. Riso loads Fraunces and Space Mono from Google Fonts (fonts.gstatic.com), using
Artifactbin’s pinned font definitions. System fonts are the offline fallback;
photographs load from the project folder.

## Skill

[SKILL.md](SKILL.md) tells an agent how to make and edit homes with this kit.
[AGENTS.md](AGENTS.md) points repository work to it. A `.claude/skills/home3d/`
symlink exposes the same file in the pattern used by `how-does-that-work`.
To invoke it explicitly: “Use this repo's Home3D skill to create a project for …”.
The skill lives in this repository; it has not been installed globally.
