---
name: home3d
description: Create or edit interactive 3D home studies with the Home3D kit, using floor plans and room photos. Use for new homes in the projects directory, architectural shells, room layouts, materials, lighting, and local previews or standalone HTML exports in this repository.
---

# Home3D

One shared `kit/`, many homes in `projects/<name>/`. The existing home is
`projects/kalpataru-radiance/`. `archive/` holds the original implementation;
leave it intact. The kit must run without anything in the archive or sibling repos.

Read [README.md](README.md) for setup and commands. Read
[kit/model.md](kit/model.md) when authoring geometry or changing the model format.
Resolve these paths from this skill's repository root, including when this file
was loaded through a discovery symlink.

## Mental model

| File | Responsibility |
| --- | --- |
| `projects/<name>/brief.md` | Purpose, scope, references, intended look |
| `projects/<name>/plan.md` | Calibration, evidence, measurements, assumptions |
| `projects/<name>/resources.md` | Resources tab: floor plan, room galleries, extra groups, provenance |
| `projects/<name>/inventory.md` | Assets tab: furniture and fittings per room, library model ids |
| `projects/<name>/home.js` | Source of truth: project text, geometry, theme |
| `projects/<name>/references/` | Original plans, photos, source records |
| `projects/<name>/assets/` | Viewer-sized images, loaded by relative path |
| `projects/<name>/index.html` | Thin page template with build markers |
| `projects/<name>/out/` | Generated HTML and checks; never edit these as source |
| `projects/<name>/placements.json` | Library models positioned in the home (metres, rotation) |
| `library/` | Shared `.glb` models by id, with provenance in `library/README.md` |
| `kit/` | Reusable geometry, viewer, themes, commands, starter |

Tabs follow the stages: **1 Resources** (floor plan, room galleries, extra photo
groups), **2 Assets** (inventory), then one shared 3D viewer as **3 Shell**,
**4 Fit-out** (plus built-ins and finishes; `fixture` rows for now) and **5 Furnished**
(plus loose items), with room focus, room photographs, and camera/layer/light controls.
Use `?tab=shell`, `fitout` or `furnished` to open a stage directly. Keep metadata in the collapsible Project details card;
do not add promotional intro copy or a plan-orientation indicator.

A home supplies data to `mount(home)`. Shared viewer code must not contain a
property name, listing URL, room count, plan coordinates, or project asset path.
Change project data for one home; change the kit for behavior shared by homes.

## Making a home

Homes are built in stages: **resources** (steps 1–2), **v0 layout** (3–6), then
**assets** (7), then **placement** (8). Model sourcing beyond blockouts is still open.

1. Run `kit/home list`, then `kit/home new <kebab-case-name>`. Existing folders
   are refused. The starter is an explicitly fictional 6 × 4 m room; replace it
   before describing it as a reconstruction. `npm ci` installs pinned dependencies.
2. **Resources first.** Record the user's scope in `brief.md`. Gather every source
   image before modelling: save full-size originals under `references/` (never
   replace them with compressed copies) and list each one's URL and what it shows in
   `references/sources.md`. Listing pages often hide their galleries in embedded JSON
   (look for image CDN URLs and per-room groupings); request the original size.
   Make ~1600 px copies in `assets/` named by room (`living-01.jpg`). Check what each
   photo actually shows — listings misfile bathrooms, balconies and parking — then
   write `resources.md`: `## Floor plan`, one `##` section per room (named as in
   `home.js`, or tagged `{#room-id}`), then extra groups. Serve and review the
   Resources tab before tracing geometry; add the room records it needs.
3. Establish scale from a labelled plan dimension and record the origin and
   calibration in `plan.md`. Convert to metres once. Printed dimensions remain
   display labels; they are not automatically computed from the trace.
4. Build the shell in `home.js`: outline, room polygons and centers, shared walls,
   openings, railings, service voids. Start with the whole layout before adding
   cosmetic detail. Infer only what the evidence supports and record provisional
   heights, thicknesses, placements, and unknown orientation in `plan.md`.
5. Apply the visual direction to the materials and lights as well as the UI.
   Preview with `kit/home serve <name>` and refresh after edits. Use
   `kit/home open <name>` for a standalone file without a server.
6. Run `kit/home check <name>` and inspect the generated screenshots. Review the
   whole shell, room labels, top-down view, late light, source images, and mobile layout.
   Source plans remain available if WebGL is unavailable. If the environment
   blocks browser launch or serving, still build and validate the model, and say
   exactly which visual checks could not run. A successful build is not a visual check.

7. **Assets.** Go through every room photo and list what is in it in `inventory.md`:
   one table row per distinct item with Room (id), Kind (fixture, appliance,
   furniture, lighting, decor), Qty, the photos it appears in, and placement notes.
   Estimate Dims (w×h×d) and a Colour hint per row. For Model, use a catalog id from
   `library/catalog.json` where one fits (as is, a modified copy, or a new generator in
   `library/generators/`; see `library/README.md`), or a primitive such as `@frame`,
   `@rug`, `@curtain`, `@box` for low-stakes items. The Assets tab renders each one.

8. **Placement.** Position models in `placements.json` (metres, same plan space as the
   walls), one entry per instance linked to its inventory row with `asset`. Staging
   photos win over furniture drawn on the plan when they disagree; note it in the row.
   Check top-down, then Walk-mode views from where the photos were taken.

Continue within the user's authorized scope; this workflow does not impose
stage-by-stage signoffs. Ask only when missing source evidence or an unresolved
choice materially affects the result.

## Visual direction

The app is named **rooms.**; the CLI and skill remain `home` and `home3d`.
The default is **Riso**, adapted from Artifactbin. Palette snapshots and
principles are in `kit/themes/riso.json`, `kit/themes/almanac.json`, and `kit/themes/drafting.json`.
`kit/themes.js` maps those tokens into the UI, materials, and lighting. No runtime
dependency on `../../minusx/artifactbin` is required.

- **Riso:** cream stock, navy outlines, blue controls, pink accents and yellow
  highlights; hard offset shadows on controls and photo frames. Keep 3D materials
  pale enough to read rooms, with soft warm lighting.
- **Almanac:** warm paper, forest-green ink, restrained terracotta, serif display
  type, light rules, and simple photo framing. In 3D: warm plaster, pale timber,
  quiet green wet areas, soft daylight, and gentle shadows. Keep the model dominant.
- **Drafting:** cool vellum, cobalt annotations, technical type, crisp framing,
  a subtle ground grid, and cooler neutral materials. Set `theme: 'drafting'` in
  the project; do not fork the viewer.
- Light presets are illustrative studio choices. “Late afternoon” changes
  direction, warmth and ambient light; it is not a geolocated solar simulation.
  Do not claim true north, a measured light level, or a certified architectural plan.
- Preserve material meaning across rooms. Use the selected-room treatment for
  interaction, not to imply a different permanent floor finish.
- Riso’s font definitions and component styles live in `kit/themes/riso.css`.
  Fraunces and Space Mono load from fonts.gstatic.com; system fallbacks keep the
  export usable offline. Images load from the project folder by relative path, so
  `out/index.html` works over `file://` or `serve` but is not a single portable file.

## Editing and checking

For layout feedback, change `home.js` and update the relevant assumptions in
`plan.md`. For material/lighting feedback across all homes, change `kit/themes.js`.
For a new capability needed by one project, keep its project data separate from
reusable rendering behavior. The current kit covers architectural shells; it
does not yet provide a furniture library or multi-storey model. Walk mode uses
a 1.65 m eye-height perspective camera, WASD, drag or pointer-lock look, and
plan-based wall/doorway collision in `kit/walk.js`. Keep its geometry checks when
changing openings or coordinates. Switching tabs or opening dialogs stops movement.

Opening offsets run from wall endpoint `a` toward `b`, in metres, sorted and
non-overlapping. Each shared wall appears once. Shapes use `[x,z]`, positive z
down the plan, y up. Keep source dimension labels separate from these coordinates.

Before finishing: validate/build every affected project, run `npm test` after
shared model changes, and run/inspect `kit/home check` where a browser is available.
Also build a fresh starter after changes to the template or generic viewer.
Report what changed, where to open it, and any checks that could not run.
