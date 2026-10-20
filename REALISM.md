# Realism plan

How to take the viewer from "blocky study model" to as close to photoreal as practical,
plus the open items carried over from the old roadmap. Current behavior is in
[README.md](README.md) and [kit/model.md](kit/model.md); the model library in
[library/README.md](library/README.md).

## Where we are

Every stage now exists for `kalpataru-radiance`: resources, inventory (70 rows), shell,
fit-out (finishes per wall face and band, doors and frames, kitchen counter, bath
vanities) and furnished (97 placed pieces). Lighting assumes a roof (an undrawn
shadow-only slab) and Walk mode shows a ceiling.

It looks blocky because of content and lighting, not the engine:

1. **Models** — Kenney/Quaternius are deliberately low-poly toy kits: hard edges, flat
   colours, no fabric or wood detail. This is most of the effect.
2. **Lighting** — one sun, a hemisphere and a fill. Real interiors are lit mostly by
   bounced light (global illumination) with soft contact shadows; we have none.
3. **Materials** — procedural textures carry colour only: no normal or roughness
   variation, so marble, velvet and wood all read as painted plastic.
4. **Finishing** — no image-based lighting, ambient occlusion, bloom or careful tone
   mapping.
5. **Small details** — no skirting, handles, light fittings, cornices or ceiling
   coves; their absence reads as "model".

three.js can do all of the in-browser parts. Blender is optional: for baking light,
fixing models and offline hero stills.

## Principles

- **Realistic is a view, not a fork.** Study (today's look) stays the default and the
  data stays the same; Realistic swaps materials, models and lighting quality.
- **Fall back gracefully.** Any item without a realistic model or texture keeps its
  current one. A home is never broken by missing assets.
- **Measure against the photos.** Each step is judged by Walk-mode views from where the
  listing photos were taken, side by side.
- **Keep it fast enough to walk.** Realistic should hold interactive frame rates on a
  laptop; the expensive steps (path tracing, baking) are explicit, not automatic.

## Plan

### Step 1 — Lighting and finishing (whole house, cheap)

- **Environment map (biggest single gap).** Nothing sets `scene.environment` today, so
  PBR surfaces, mirrors and glass reflect nothing. Start with
  `PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04)`; later an interior
  HDR via `HDRLoader` (renamed from RGBELoader in r180) with
  `EquirectangularReflectionMapping`, assigned directly (no PMREM pass needed). Dim with
  `scene.environmentIntensity` (not `envMapIntensity`); align with
  `scene.environmentRotation`. Then retune the hemisphere and fill lights down.
- **Tone mapping.** Try `AgXToneMapping` and `NeutralToneMapping` against today's
  setting for neutral interior whites; tune exposure per theme.
- **Shadows.** `PCFSoftShadowMap` is removed in r186 (the console warning): switch to
  `PCFShadowMap` (already soft; `shadow.radius` still widens it), start at
  `normalBias 0.02`, `bias -0.0001`. The house is static, so freeze the map
  (`shadowMap.autoUpdate = false`, `needsUpdate` on sun or furniture change).
- **Ambient occlusion + antialiasing.** `RenderPass → GTAOPass (or SSAOPass) → SMAAPass →
  OutputPass` (FXAA would go after OutputPass). Composer targets need `samples: 4` or
  SMAA. AO radii must be tuned for metre-scale rooms. Alternative without a composer:
  `renderer.setEffects([...])` with `outputBufferType: HalfFloatType` (untested here).
- **Contact shadows.** A soft radial-gradient quad under each furniture footprint,
  `depthWrite: false`, just above the floor (three has no built-in ContactShadows).
- **Lamps that emit.** Physical units: point/spot lights in candela (hundreds, e.g.
  `PointLight(0xffdcb0, 100, 20)`) or `light.power` in lumens; emissive shades;
  `RectAreaLight` for window glow (no shadows). Each shadowed point light costs six
  depth passes, so keep lamp shadows off.
- **Later: `LightProbeGridWebGL`** baked once for position-dependent ambient light, a
  cheap stand-in for global illumination.
- Housekeeping: `compileAsync(scene, camera)` before the first frame (no shader
  hitches); `setAnimationLoop`; drop `preserveDrawingBuffer` unless screenshots need it.

### Step 2 — Real materials (finishes)

- Add an `image` kind to `library/materials.json`: colour, normal and roughness maps
  with a real-world size, from CC0 sets (Poly Haven, ambientCG).
- Upgrade the kalpataru finishes first: beige marble floor, granite, walnut doors,
  oak-laminate cabinets, white tiles, striped marble.
- Keep procedural materials as the Study look and as the fallback; Realistic picks the
  image variant when one exists.
- `MeshPhysicalMaterial` where it matters: clearcoat for polished stone and glazed
  tiles, sheen for fabric.

### Step 3 — Better furniture

- A second, optional model per inventory row (the "textured" variant from the old
  roadmap), used only in Realistic; the blockout or pack model remains the size
  contract and fallback.
- Sources, in order: CC0 photoreal models (Poly Haven), Sketchfab CC0/CC-BY with
  attribution, image-to-3D from listing crops for distinctive pieces, Blender edits.
- Every import goes through `library/tools/import.py` (normalise, decimate, compress
  textures) and gets a catalog row with `fidelity` and licence.
- Hero items first, by screen presence: sofa, beds, armchairs, dining set, wardrobes,
  lamps, plants, sanitaryware.

### Step 4 — Details

- Skirting along every wall face, broken at doorways (also an open item below).
- Door handles, window mullions and sills, ceiling coves and the living-room arch
  moulding, light fittings, switch plates.
- Prints with actual images (cropped from listing photos, kept local) instead of blank
  frames.

### Step 5 — Photographic stills

- A **Render** button that runs a progressive path tracer (`three-gpu-pathtracer`) on
  the current view while the camera is still, for near-photographic frames.
- Optionally, **Blender baking**: export the scene, bake global illumination with Cycles
  into lightmaps, and load them for photoreal lighting at interactive speed (static
  lighting only; larger files).
- Optionally, Cycles hero stills straight from Blender for listings.

### Suggested order

Step 1 on the whole house, then a **master bedroom spike** through Steps 2–4 (real
floor, walls and wood; better bed, bedside tables and lamps; skirting and handles) to
see how far we get, then roll out room by room, then Step 5.

## Skill and reference notes

- [cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills) (MIT, targets
  three.js r186 like us): lighting, materials, textures, post-processing, asset
  pipeline and performance skills. Findings from reviewing it are below.
- [OpenAEC Three.js skill package](https://github.com/OpenAEC-Foundation/Three.js-Claude-Skill-Package):
  renderer, tone mapping, colour management; not yet reviewed.
- Blender MCP and archviz skill bundles: useful later for baking and stills; reviews
  report weak camera framing and long-session drift, so keep sessions short.

### Findings from threejs-skills

All named classes exist in our three 0.186.1 (`RoomEnvironment`, `GTAOPass`,
`SMAAPass`, `SunLight`, `LightProbeGridWebGL`, `renderer.setEffects`); behaviour of the
newer ones is untested here. Most of it is folded into Step 1 above. Also worth
keeping:

- **Colour spaces:** colour maps `SRGBColorSpace`; normal, roughness, metalness and AO
  maps stay `NoColorSpace`. Our canvas maps are already tagged correctly.
- **Texture channels:** `aoMap`/`lightMap` read `uv` by default (`texture.channel = 0`);
  a separate baked unwrap goes in `uv1` with `channel = 1`. ORM packing is AO (R),
  roughness (G), metalness (B).
- **Physical materials:** fabric `sheen 1, sheenRoughness 0.5`; polished stone and
  lacquer `clearcoat 1, clearcoatRoughness 0.1`; brushed steel `anisotropy`. Glass
  `transmission 1, ior 1.5, thickness 0.5` is costly (re-renders opaque objects), so use
  it sparingly. Curtains: `forceSinglePass` avoids double draws for transparent
  `DoubleSide`.
- **Asset pipeline (gltf-transform):** `inspect` and `validate` first (validate can gate
  CI); `optimize in.glb out.glb --compress meshopt --texture-compress ktx2
  --texture-size 1024`; geometry compression must be the last step. KTX2 stays
  compressed on the GPU, while WebP/AVIF expand to full RGBA (a 2048² texture is ~22 MB
  of VRAM). One shared `KTX2Loader().detectSupport(renderer)` plus the meshopt and Draco
  decoders on `GLTFLoader`.
- **Performance for ~100 instances:** watch `renderer.info.render.calls` (includes
  shadow passes); avoid per-instance material clones (our `fitModel` tint clones today);
  instance repeated chairs (`InstancedMesh`/`BatchedMesh` or the glTF instancing
  extension, which needs shared materials); `matrixAutoUpdate = false` on static items;
  texture anisotropy from `renderer.capabilities.getMaxAnisotropy()` rather than a fixed 8.
- **Gaps in the skills:** no tone mapping guidance, only SSAOPass (not GTAOPass) for
  WebGL, SSAO values tuned for unit-scale demos, and nothing on path tracing or Blender
  baking. We keep our own notes for those here.

## Open items carried over from the old roadmap

- **Walk collision** for furniture footprints and built-ins.
- **Skirting** (Step 4).
- **More built-in types**: wardrobes and lofts as built-ins, shower ledges and niches,
  the living-room arch moulding.
- **Library matching at scale**: a catalog with tags and preview renders; matching an
  inventory row by category → dimensions (±15%) → look (image embeddings of a photo crop
  vs previews) → vision-model judgement → match / close / none; record the decision in
  `inventory.md`.
- **Scale across listings**: staged furniture and developer fixtures repeat, so the
  library should converge after ~10 homes; Truva plans look consistently rendered, so a
  tracer for that style could do most of the shell; every automated stage should report
  confidence and feed a review queue; cache vision calls.
- **Rights**: listing photos and plans belong to the listing source; settle before
  anything is published.
- **Project files in git**: `projects/` is gitignored, so each home's `inventory.md`,
  `placements.json` and `fitout.json` are not versioned yet.
