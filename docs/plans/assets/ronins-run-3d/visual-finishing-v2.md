# Visual finishing — 2026-09-13

This delivery addresses the three remaining visual areas identified with the
user: patrol characters, repetitive architecture/scenery, and lighting/wet
surfaces. It preserves the four original navigation layouts and gameplay rules.

## Characters

- `TailoredGeometry.ts` now samples smooth authored cross-sections for the
  gathered coat, waist, shoulders and trousers. The coat retains its opening.
- The guard has overlapping collar bands, a tied sash, cloth face wrap and a
  narrow curved eye opening. Broad stacked cuff bands and square boots are
  replaced by fine straps and shaped boot meshes. Sleeve caps close the shoulder
  openings. The existing hip/knee/ankle gait and foot placement remain unchanged.
- The hound has a continuous chest/ribcage/haunch silhouette, three overlapping
  curved armour shells, shaped thigh plates, pointed ears and narrow illuminated
  eyes. Existing joints, stride, collision and powered-contact behaviour remain.
- These meshes are authored in this repository; no downloaded model pack or
  additional dependency is used. The existing generated surface atlases and
  sculpted hand asset retain their provenance.

## Buildings and planting

- `Architecture.ts` adds hipped roofs alongside the gabled roof family. Upper
  verandas, painted curtain crests and three pottery profiles provide variation
  within existing placement/eave allowances.
- `GardenAssets.ts` gives branches varied angles/heights and distributes foliage
  into irregular clusters along branches, replacing repeated disc-shaped crowns.
- Fine straw weave and larger lantern crests are generated once at loading.
  `NightAtmosphere.ts` adds visible lunar surface variation to the existing sky.

## Surface response

- Paving texture scale is reduced from a three-metre tile to 1.35 metres, so
  individual stones are closer to the reference's street scale.
- `BakedSurfaces.ts` prepares a 1024-square contact-occlusion map from static
  ground-level geometry. It uses a separate world-aligned UV channel and adds
  no dynamic shadow-camera pass. Distant and elevated objects are excluded.
- A 512-square roughness map distinguishes wet stone response from its surface
  grain. Reduced ambient/moon/environment intensity retains darker recesses
  while existing local lamps light the street. Lantern paper retains its texture
  without the previous washed-out crest.
- Reflection resolution, reflection frequency, frame-rate and pixel limits are
  unchanged. All maps are prepared before play and released with scene resources.

Close-up inspection uses the actual meshes and loaded materials in an ignored
temporary viewer; those inspection images are not presented as gameplay.
Final game screenshots are captured separately from the actual Arcade page.
The historical concept remains an illustration, not a screenshot or a measured
photorealism benchmark. Current delivery quality must be judged from the actual
rendered scenes, without the former unsupported overall percentage.
