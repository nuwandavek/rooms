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

All examples run from the repository root. You can also run the absolute path
to `kit/home` from any directory, or use `npm run home -- <command> <name>`.

## Viewer tabs

Tabs are numbered by authoring stage: **1 Resources**, **2 Assets**, **3 Shell**,
**4 Fit-out**, **5 Furnished**.

**Resources** opens first: the floor plan, room photo galleries, and other source
images. Click any image to enlarge it, or use **View in 3D** to focus its room.
**Assets** lists the inventory. **Shell**, **Fit-out** and **Furnished** share one 3D
viewer and add layers left to right: walls, rooms and openings; then the project's
`fitout.json` (floor, wall, door and frame finishes from `library/materials.json`,
built-ins such as kitchen counters) plus placed `fixture` rows; then loose furniture,
lighting and decor. The viewer keeps the room
list, selected-room photos and thumbnails beside the model, with **3D** and **Walk** modes at top left and **↺ Reset** / **Top-down** cameras at
top right. View settings includes zoom −/+, wall cutaway, layers and lighting.
The project name, location, bedrooms and floor area live in the collapsible
**Project details** card at the top right.

Choose **Walk** for a standing view at 1.65 m eye height. Use **WASD** to move
and drag on the scene to look. **Mouse look** in settings captures the mouse;
**Esc** releases it. Click the scene to resume keyboard control after using UI
controls. Walls, windows, railings, voids and slab edges block movement; doorways
and open sliding doors are passable. Room buttons jump to that room. Walk uses
full-height walls; switching back to 3D restores the cutaway setting.

To open a stage directly, visit `http://127.0.0.1:4173/?tab=shell` (or `fitout`,
`furnished`; `?tab=home3d` opens the last 3D stage).

## Assets tab and model library

**Assets** lists each project's `inventory.md`: every item per room with its kind,
quantity, the photos it appears in, and a rendered preview when it references a model
from the shared library. Previews load models over the local server, so use
`kit/home serve`. The library is `library/catalog.json` (tracked: id, path, size,
source) plus `library/models/*.glb` (gitignored, shared separately); see
`library/README.md` for importing downloads and generating models.
`placements.json` puts library models into the 3D home (toggle with **Furniture** in
View settings); see `kit/model.md` for the format.

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
lighting: 'daylight',   // or 'afternoon'
```

The viewer's Light study control switches between soft daylight and late
afternoon. Lighting is illustrative, not a sun-path or illuminance calculation.
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
