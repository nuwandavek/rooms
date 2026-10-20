# Plan and assumptions

`home.js` is the model's source of truth. Coordinates, thicknesses, heights,
and opening offsets are in metres. Points are `[x,z]`; +z is down the plan.

When tracing a plan, record its image dimensions, calibration dimension,
metres-per-pixel scale and chosen origin here. Preserve printed room dimensions
separately from inferred geometry. Record uncertain walls and openings.

The starter assumes a 2.85 m ceiling and 0.15 m walls. Replace those values
when measurements are available. Add source images in `references/` and small
viewer images in `assets/`.
