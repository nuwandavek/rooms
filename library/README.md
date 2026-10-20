# Model library

Shared 3D models for every home, referenced by id from a project's `inventory.md`
(`Model` column) as `library/<id>.glb`. Units are metres; each model sits on y = 0,
centered on x/z, with its front facing +z. Record every model's provenance here.

| Id | What | Source | Licence | Notes |
| --- | --- | --- | --- | --- |
| bed-queen | Queen bed, upholstered headboard | `blockouts.mjs` | Own work | Box blockout for sizing |
| sofa-3seat | Three-seat sofa, 2.0 m | `blockouts.mjs` | Own work | Box blockout for sizing |

Blockouts are regenerated with `node library/blockouts.mjs`. Replace a blockout by
writing a better model to the same id; homes that reference it update on rebuild.
