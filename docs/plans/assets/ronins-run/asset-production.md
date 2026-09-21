# Night Heist asset production

Created 2026-09-12 for the first local playable build. All bitmap assets were generated
with the built-in image generation tool for this conversation. No purchased pack,
third-party game map, sprite, soundtrack or logo was imported. This is production
provenance, not a legal clearance claim.

The unchanged [concept reference](night-heist-concept-v1.png) remains separate from
the runtime plate. The live renderer uses no baked-in hero, interface, target marker
or patrol cone. Those are real game objects and localised interface elements.

## Selected exports

### courtyard-v1.png

- Runtime: [file](../../../../public/games/ronins-run/courtyard-v1.png).
- Dimensions: 1586 × 992.
- Generated source: `exec-4d129a1f-c6ff-4eb4-9d40-3f3c8f6354b8.png`.
- SHA-256: `d2a087230e810bff4c635fb9879b632ff6af348b9a8b23f0cb6776794f279582`.
- Generation brief: Clean environment derived from the preserved concept: remove every actor, pickup, chest, text, HUD, cone and rain streak; retain the illustrated courtyard and lantern lighting.

### ronin-walk-v1.png

- Superseded first-pass sheet, retained for comparison: [file](../../../../public/games/ronins-run/ronin-walk-v1.png).
- Dimensions: 1254 × 1254.
- Generated source: `exec-b9bb7252-5cf6-42c3-b351-1a0b569d607b.png`.
- SHA-256: `19ce2e3b22069d86a90a74141d663d3a5552a383fcb3a42b26742ae1163b36f3`.
- Generation brief: Original masked ronin, straw hat, navy clothing and red scarf. Four directions, four walking phases per direction; extracted to real alpha with the image tool.

### ronin-run-v2.png

- Runtime: [file](../../../../public/games/ronins-run/ronin-run-v2.png).
- Dimensions: 1254 × 1254, RGBA; measured alpha range 0–255.
- Generated source: `exec-04e8f37e-bd44-4a8f-9dbf-f290a46a3ddf.png`.
- SHA-256: `4f66601e315a16bf5599e19c8e269e451ee26b630de3a5d95b974a0ac4926fb9`.
- Generation brief: Rebuild the same hero with distinct contact, knee compression,
  push-off and flight poses, opposite arm swing, consistent anatomical scale and
  separated cells. Front and back views mirror for left-facing travel.
- Selected lineage: initial run exploration `exec-c872bfc5-67ba-42e5-9abc-6843d5a40c99.png`,
  separated 4 × 4 layout `exec-d7f57b70-bb2f-4b00-9224-de448d99d1e4.png`, then true alpha extraction.
  The renderer selects six coherent phases per view from sixteen candidates.
- Full [generation prompts](ronin-animation-v2-prompts.md). Opaque checkerboard,
  overlapping-layout and imperfect-cutout drafts were rejected and are not runtime assets.

### ronin-idle-v2.png

- Runtime: [file](../../../../public/games/ronins-run/ronin-idle-v2.png).
- Dimensions: 1254 × 1254, RGBA; measured alpha range 0–255.
- Generated source: `exec-8604e58f-16cc-42a4-96aa-d53dc0343bf6.png`.
- SHA-256: `86ed5882a0d969d2cb03669e3aa038ecf718b1e8e5b67af390548edd90be4d41`.
- Generation brief: Two views of the same hero standing with both feet planted,
  soft knees, lowered arms and a resting scarf. Idle uses its own artwork instead
  of freezing a running pose. Generation source: `exec-3a11b601-83f7-459a-8bf8-477c2a4caf58.png`.
- Full [generation prompts](ronin-animation-v2-prompts.md); generated and extracted
  with the built-in image tool. No scripted raster editing was used.

### patrols-walk-v1.png

- Runtime: [file](../../../../public/games/ronins-run/patrols-walk-v1.png).
- Dimensions: 1254 × 1254.
- Generated source: `exec-c026bea0-e6f4-4703-ab88-8fdf8d07230c.png`.
- SHA-256: `4a0bcddcb47823123da27ecc8f1e9f3bf237d2f81104cb350cb12c78c46bafd6`.
- Generation brief: Original physical lantern guard and mechanical hound. Front/back views, four walking phases each. Final background removal uses real alpha; opaque checkerboard drafts were rejected.

### treasure-v1.png

- Runtime: [file](../../../../public/games/ronins-run/treasure-v1.png).
- Dimensions: 1254 × 1254.
- Generated source: `exec-c14114f9-2249-4937-b5f5-4d73ca74091f.png`.
- SHA-256: `8040c11404c4771521b18cc07928d7973ddcc5138512215fd0e8c1b740def8e0`.
- Generation brief: Two isolated versions of the same painted indigo wooden coffer with brass straps and jade scrolls: closed and open, equal camera angle and size, true alpha.

## Atlas and animation

[atlas.json](../../../../public/games/ronins-run/atlas.json) records each crop in source
pixels and its ground anchor. Metadata uses alpha inspection and authored staging,
without resampling or editing the generated images. Runtime Canvas `drawImage` crops frames.
The chosen character and treasure files were checked for alpha ranging from 0 to 255.

- Ronin v2 run: four columns, four rows. Front-view candidates occupy indices 0–7;
  back-view candidates 8–15. Selected phase order is `[0, 1, 2, 3, 4, 7]` for front
  and `[8, 9, 10, 11, 12, 15]` for back. Left views mirror the matching right view.
  These form two contact–compression–flight steps over 88 travelled world pixels.
  At normal speed that is about 0.57 s per cycle and 3.5 footfalls per second.
- Run source scale is fixed at 76 / 256 for every pose. Whole cell crops and explicit
  `anchorX`/`anchorY` stage origins preserve knee compression and airborne foot height;
  the renderer must never fit each frame to its own painted bounds. Ground rows are
  305/608/927/1235 source pixels, with 10-pixel lift staging on rear flight frames 10/15.
- Idle has separate front/back planted poses, fixed 84 / 660 source scale, and authored
  origins between the feet. Upright idle is taller than the crouched running silhouette.
- Ordinary gait resets to contact after stopping. A dash holds a distinct extended
  pose (front 3/back 10), suppresses running footfalls, then resumes on contact. Shadows
  contract under airborne poses. Distance-based footfall events share the 44-pixel
  half-stride boundary with the renderer; idle/blocked motion does not emit footsteps.
- Patrols: four columns. Row bounds are 0/396/775/981/1254 pixels: guard front, guard back, hound front, hound back. Left-facing versions mirror the corresponding right-facing frame. Guard height is 83 pixels, hound height 46.
- Treasure: two columns, closed/open. Both use the same 52-world-pixel width and bottom anchor.
- Every level has a fixed 1586 × 992 coordinate system. Actor feet determine navigation and rendering depth. Courtyard uses two foreground masks; the other maps define their own in Levels.ts. Masks redraw matching environment pieces after actors behind them; an outline marks the hero when obscured.
- Rain, seal runes, sight cones, glow and contact shadows are original code-native effects. UI and effect colours resolve Hakken theme variables; the illustrated bitmap keeps its own painted colours.

The v1 running sheet repeated nearly the same leg pose and its per-frame size fitting
flattened vertical movement. The user identified the resulting glide on 2026-09-12;
v2 addresses that specific defect. These are generated sprite poses with authored
timing/staging, not a hand-animated or skeletal character. Smooth acceleration,
dedicated capture/escape animation and wider visual review remain polish work.
Do not mark final animation acceptance without reviewing movement in the live game.

## Audio

`AudioEngine.ts` contains the original oscillator/envelope score and cues. A sparse
pentatonic motif runs at 290 ms per beat; pursuit adds low percussion. Footsteps,
seal/chest pickups, dash, alert and result stingers are synthesised locally. No
external music or sound recording is used. Running footsteps now follow actual travel
and the visual contact phases rather than an independent quarter-second timer.
Mute/volume are visible controls; essential
information also has visible cues. Auditory mix approval remains part of play testing.

## Four-map expansion — 2026-09-12

User-approved expansion. All three opaque background plates were generated with the built-in image tool using the original courtyard solely as a style/camera reference. No raster processing or compositing was applied. Exact [generation prompts](four-map-environment-prompts.md) are preserved.

### night-market-v1.png

- Runtime: [file](../../../../public/games/ronins-run/night-market-v1.png).
- Dimensions: 1586 × 992.
- Generated source: `exec-04db4eef-0d3c-470a-83e0-0c1ea84faa32.png`.
- SHA-256: `c08b9b9d6a25de852afe50aeb823293ff9e6c3aebdf345f2942b8c9584dd925f`.
- Brief: Branching streets around separate stall islands.

### canal-docks-v1.png

- Runtime: [file](../../../../public/games/ronins-run/canal-docks-v1.png).
- Dimensions: 1586 × 992.
- Generated source: `exec-09b841ce-b4cc-4b08-9d76-e2d1544c7ecf.png`.
- SHA-256: `22bf5bbec109f3ed573f345d0b3708a583d148abd4967b3374ec0f11df357b33`.
- Brief: Two quays and three original timber bridges.

### fortress-gardens-v1.png

- Runtime: [file](../../../../public/games/ronins-run/fortress-gardens-v1.png).
- Dimensions: 1585 × 992.
- Generated source: `exec-f9ea111e-001c-4812-b2db-50e90c997453.png`.
- SHA-256: `0a48b58bbf10b25ceecd1004722985377c92b04580499b89ee869275aa03794a`.
- Brief: Formal garden loops and a fortress gate.

All maps use the same 1586 × 992 world coordinates. Collision polygons, solid cover, objective positions and foreground masks are authored in `engine/Levels.ts`, after inspecting each selected plate. Market/garden islands act as solid cover; each dock bridge has a separate local-crossing regression test. Existing hero/patrol/chest atlases and gait anchors are unchanged.

### Spirit Power effects — 2026-09-12

The blue flame, plinth, hero aura, grounded patrol transforms and knockout sparks
are original Canvas drawing code in `NightHeistRenderer.ts`. They reuse the existing
patrol atlas and theme colours without modifying the bitmap assets. Power pickup,
warning, expiry and knockout audio are original procedural cues in `AudioEngine.ts`.
The improved v2 run and idle sheets remain unchanged.

### Audio mix adjustment — 2026-09-12

After feedback that music and sound were too quiet, master volume defaults to
65% rather than 35%. The procedural motif, bass, percussion and footsteps have
stronger gains; mute and volume remain available. No asset sources changed.
Exact working values and verification are in section 15 of the Night Heist plan.
