# Authored 3D finishing assets — 2026-09-13

These are original meshes and procedural material/light sources authored for this
repository. No external model packs, licences or dependencies were added. This
record supplements the existing character/foliage atlas provenance; those source
images are unchanged.

## Continuous glove mesh

- Source: `scripts/arcade/build-character-assets.mjs`.
- Reproduce from the repository root: `node scripts/arcade/build-character-assets.mjs`.
- Output: `src/app/(dashboard)/app/arcade/ronins-run-3d/engine/assets/ronin-hand-v2.json`.
- 2,958 vertices and 5,912 triangles per hand. Both hands, sleeves, seams and
  wrist wraps together use 15,900 triangles, below the existing 16,000 limit.
- Signed-distance palm, wrist, thenar pad, webbing and five bent digits are
  joined offline. The browser uploads the finished mesh; it does not run the
  sculpting algorithm. Mirroring reverses triangle winding as well as normals.
- The mesh regression checks closed edge topology, positive enclosed volume,
  mirrored orientation, physical proportions and bounded vertex count.
- SHA-256: `58981195203adcd8c4c7e1097b155f2e27012eebc27f0fdefe69e54f5930918c`.

## Architecture, vegetation and light

`Architecture.ts` adds upper-storey variants, latticed windows and a lower eave
within the existing footprint. All four districts use these shared models.
Guard sleeves use folded cross sections; the straw hat has a shaped, closed
profile. Existing guard/hound joints and animation rules are preserved.

`GardenAssets.ts` provides a tapered bent trunk, curved branches and denser,
layered leaf crowns with the existing cutout atlas. Explicit shadow flags survive
spatial batching. Lantern paper does not cast or receive shadows; paving receives
shadows without becoming a caster.

`ArtLighting.ts` authors the lantern's paper fibres, ribs and original three-petal
crest, plus a small static night environment. The environment is prefiltered once
while loading to give brass, leather and wet stone reflected colour. It is not a
live cube camera or an extra per-frame lighting pass. Its render target and source
textures are disposed with the scene. Lantern bodies use a pleated lathed profile.

The vertical camera field of view changes from 76 to 68 degrees. Camera-relative
movement, collision, minimap coordinates and all gameplay timing remain unchanged.
`PrepareGeometry.ts` uploads hidden/offscreen meshes while loading, before the
player can start. It restores visibility/culling and renderer targets even when
preparation fails. All existing resolution/frame-rate/reflection caps remain.

## Acceptance

This is authored artwork used by the running game, not another concept image.
It improves the hands, building variety and material response but remains visibly
more stylised than the approved cinematic concept. Physical-device results and
final visual acceptance cannot be inferred from local Chrome or these meshes.
