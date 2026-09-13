# Ronin's Run 3D — separate first-person game

Agreed 2026-09-12. The existing Night Heist stays unchanged. This is a second
Arcade entry, at `/app/arcade/ronins-run-3d`, with all four existing layouts.

## Scope and boundaries

- Lantern Courtyard, Night Market, Canal Docks and Fortress Gardens retain their
  exact paths, obstacle footprints, starts, seals, treasure, Spirit Power, exits
  and patrol routes. Import the original definitions without editing them.
- Import the original simulation and audio as separate runtime instances. No
  changes to original balancing, artwork, animation, scores or progression.
- Build genuine 3D ground, boundaries, architecture, objectives and animated
  guards/hounds. Concept artwork is an art target, not a shipped screenshot.
- Desktop controls: WASD relative to camera, mouse look, Space decoy dash,
  Escape pause. Drag look and keyboard turning provide a pointer-lock fallback.
- All four maps are selectable in this first playable version. Escape advances
  to the next map. Results live in this page session; do not write 3D scores into
  the original game's leaderboard or unlock state. Persistent 3D progression is
  a later, separate backend slice.
- Provide a route map, readable threat/Spirit timers, volume and mute, reduced
  camera motion, retry, pause/resume, fullscreen and useful graphics errors.
- English and Italian copy, existing diagnostic Arcade visibility and headers.

## Implementation and validation

1. Map adapter: one reversible scale from authored map coordinates into X/Z.
   Derive exposed boundaries from the union of walkable polygons, subtracting
   blocked islands. Never wall off overlaps that join paths and bridges.
2. 3D scene: four distinct environment treatments with original map geometry;
   first-person camera/hands and stride-driven patrol limbs; game-state visuals.
3. Runtime: fixed simulation steps, controls, user-initiated audio, pause on lost
   focus/pointer lock, resize, cleanup and recoverable WebGL failure.
4. App entry: separate page/menu and locale copy. Record existing-game file
   hashes before editing and compare after implementation.
5. Verify layout boundary membership and connecting corridors; camera-relative
   movement, collisions, all-map collection/escape, live enemies, Spirit Power,
   pause/retry and independent simulation instances. Browser-check all four
   scenes, controls and console. Run guards, lint and type checks.

## Current status — 2026-09-13

Gameplay implementation: 100%. The final character/environment/lighting
checklist is implemented and locally verified: 100% of that concrete checklist.
The former overall 95% estimate is withdrawn: it did not measure the visual gap
meaningfully. Historical percentages below describe earlier snapshots, not the
current result. The latest verification record is at the end of this plan.

All four campaigns now pass together in Chrome and WebKit. Real-time pickup
and Quiet-rendering checks are separate from the controlled-clock route pilot.
The preceding pass fixes WebKit drag-look, adds side/rear building details and a
mountain/forest/keep background, and replaces conical distant trees with fine
branch cutouts. See [forest asset provenance and prompt](../assets/ronins-run-3d/distant-tree-production.md).

The latest work is documented in [visual finishing](../assets/ronins-run-3d/visual-finishing-v2.md):
smooth patrol clothing/body shells, corrected facial details and boots, hipped
roofs/verandas/props, irregular canopies, smaller paving and baked contact shade.
Physical-device coverage remains unverified. The final real game captures are
the record of delivered appearance; a claimed percentage of concept resemblance
must not substitute for them.

## Progress and evidence — 2026-09-12

Overall estimate: about 85%. Gameplay foundation: 100% of the agreed local slice.
The earlier 92% overall estimate overstated progress against the visual target;
the current estimate includes that gap. Percentages are planning judgments, not
measured fidelity scores. Final visual acceptance remains open.
Current final polish pass: 100% of this local slice; implementation, focused
tests, production build and successful browser runs are recorded below.
Four-district gameplay/performance completion pass: 100% of the local build slice.
Concept-fidelity acceptance remains open.
Idle rendering, pickup stalls and pickup clarity repair: 100% of that slice.
These are estimates against the full agreed game, not a claim of matching the
reference image. This remains a playable development build, not a finished game.

Implemented locally:

- Separate Arcade menu item, breadcrumb and page; all four levels selectable.
- Exact original layout coordinates, movement/collision and simulation rules.
- Camera-relative movement, dash, mouse/keyboard look, pause, retries, local
  session completion markers, minimap with position/direction and objectives.
- Original procedural audio in an independent instance; volume and mute.
- [Generated material atlas](../assets/ronins-run-3d/material-production.md) remains the surface source.
- Courtyard-specific scenery: low retaining blocks, red canal rails with finials,
  timber shop fronts, latticed shoji windows, solid roof gables, individual curved
  tile joints/end caps, rafters, cloth crests, pottery and stacked crates.
- Branch-and-leaf maple trees, bamboo, ferns, mossy rocks and fallen leaves;
  distant layered keep and a continuous mountain ridge. Bulky courtyard scenery
  is checked against the shared walkable area before placement.
- Shared planar water reflection capture, rippled water and irregular puddles
  on the original path polygons. Rain streaks and procedural moon/cloud sky.
  Reflective surfaces, camera hands and rain are excluded from the reflection
  capture; render target resources are disposed when changing districts.
- Shared guards with layered coat, woven hat detail, masks and jointed legs;
  curved brass hound plates and articulated knees/paws. Rigid details are merged
  by material while animated joints remain separate. First-person hands have
  bent finger segments, gloves, sleeve and wrist wraps.
- Blue Spirit Power is an animated translucent flame inside a stone lantern.
  The pickup position, timer and shared simulation remain unchanged.
- Fullscreen canvas now fills the available height rather than leaving the
  normal embedded-game height and a large empty area below it.
- Distinct green seals and blue flame; immediate Spirit/knockout HUD updates,
  blue target rings during power, persistent disabled-patrol count.

Validation:

- 134 focused tests in 18 files passed, including the existing game's tests,
  all-map traversal and exposed-boundary checks, runtime input/pause tests and
  four-map comparisons of powered guard/hound contact against the original.
  A batching regression also verifies transformed geometry bounds and moving
  joints survive merging, rather than testing only mesh counts.
- In those runtime comparisons, collecting the flame disables both enemy types
  on contact, they stay disabled after ten seconds, and retry restores patrols.
- Chrome rendered and started all four districts with no recorded console
  errors. Dash moved the player and minimap; Escape paused the game. A real
  Canal Docks dash collected the redesigned blue flame and displayed the Spirit
  timer. Fullscreen was visually checked: the canvas filled 1,155.5 px of a
  1,265 px viewport, with the remaining height used by the game controls.
- Browser mouse capture was unavailable in the automated session; drag/keyboard
  fallback is provided. A complete mouse-driven escape was not browser-proven.
- Source guards and new-game ESLint passed. Type checking still reports the
  same three pre-existing Next page-export errors in unrelated agent
  observability, AI tools and device-benchmark pages. No new game type errors.
- Hash comparison confirms all 31 original game source/artwork files match
  the saved pre-3D snapshot.
- No commits, pushes or deployment.

## User corrections and visual acceptance

The user explicitly rejected the blocky appearance and expects the
[approved first-person concept](../assets/ronins-run-3d/first-person-concept-v1.png).
That image is AI-generated concept art, not a screenshot from this renderer.
Its detailed meshes, textures and lighting setup do not exist as usable 3D
assets. The current geometry and texture pass does **not** meet that target.
Do not call graphics complete or describe more texture changes as sufficient.

All four districts now have their own scenery placement pass, described in the
completion section below. The environment is richer, but it remains more stylised
than the concept. The finishing pass adds shaped hands/clothing and generated
foliage surfaces; character and architectural variety still need close-range
visual acceptance. Do not describe these
procedural models as cinematic final-quality assets or call this milestone
concept-fidelity acceptance.

The next visual milestone is final character/environment asset production and
comparison against the reference at player eye level. All four maps retain their
existing navigation. Wider device benchmarking remains separate from the local
Chrome evidence below. No final-fidelity promise has been established.

## Performance and pickup clarity repair — 2026-09-12

The user reported excessive fan activity, multi-second pickup freezes, and being
caught after collecting a light. Two rendering problems were found:

- `FirstPersonGame` continued rendering and publishing HUD updates while ready,
  paused or finished. It now renders an idle frame only when needed (initial
  readiness, resizing, visibility return or a presentation setting change), then
  stops scheduling work. Active drawing is capped at 60 fps on faster displays;
  shared simulation steps remain 60 Hz. Resume resets its frame timestamp.
- Pickup lights were children of objects whose visibility was switched off on
  collection. The installed Three.js renderer includes the number of visible
  point lights in its shader-program key, so every pickup could require new
  shader variants during play. Pickup lights now remain attached to the scene,
  and collected lights have zero intensity. Their count stays constant.
- Materials, including hidden Spirit rings, decoys and the gate effect, are
  prepared before play for the main and reflection render targets. Graphics
  disposal waits for pending shader preparation to settle.

Observed browser evidence after the repair:

- Courtyard ready menu stayed at exactly one rendered frame across repeated
  reads. A paused Docks run stopped at frame 811. No recorded console errors.
- Docks shader count stayed at 47 before the blue pickup, after collection and
  after expiry. The first observed run's maximum measured main-thread render
  call was 6.5 ms; the short repeated pickup check was 2.6 ms. These are local
  main-thread render-call measurements, not GPU timing or a sustained FPS claim.
- The blue pickup showed both the new ACTIVE confirmation and the ten-second
  timer immediately. Existing tests still verify both enemy types are disabled
  on powered contact and remain disabled after expiry.
- New regressions cover idle/pause/hidden scheduling, resize redraw, resume time,
  the 120 Hz drawing cap, stable pickup light topology and pickup feedback.

The user's specific caught run was inspected before restarting it: 1/3 seals,
11 seconds elapsed, player around map position (1442, 829), and the blue Spirit
marker at (420, 455) still present. That run had collected the southeastern green
seal without activating Spirit Power. This is evidence for that run, not proof
that every earlier report had the same cause.

The 3D presentation now gives nearby pickups separate labels, confirms seal
recovery versus power activation/expiry, and explicitly shows power as inactive
or ended. Green seals use faceted geometry. Capture copy explains whether the
blue flame had never been collected or power had expired. English and Italian
keys are in parity. No green seal was changed into a power-up, and the original
game's simulation, movement, pickup positions and artwork remain untouched.

Host CPU snapshots also showed activity in Codex and macOS WindowServer; leaving
the game removed Chrome's prominent CPU entries. Do not attribute all fan noise
to the game or claim that playing detailed 3D graphics has no GPU cost.

Persistent independent 3D progression/leaderboards remain the separate later
backend slice defined above. Spatial Foley and touch controls are now implemented
as described below; physical touch-device and wider hardware checks remain open.


## Four-district completion pass — 2026-09-12

The playable campaign now has its complete local session flow. This does not
close the separate concept-art fidelity milestone.

Implemented:

- **Night Market:** cloth-covered stalls, produce crates, pottery, dense shop
  fronts and a town skyline. **Canal Docks:** shaped cargo boats, masts, ropes,
  warehouse fronts and quay bollards. **Fortress Gardens:** shrine pavilions,
  planted solid islands, bamboo, maples and a tiered keep. The courtyard retains
  its own placement pass. Deterministic scenery footprints include building
  overhangs and props and are tested against the unchanged walking area.
- Tapered, continuous curled fingers, glove seams, folded sleeves and separate
  hand motion while running. Cloth and leather have small reusable height maps.
  These remain procedural models, not approved final cinematic character assets.
- Spirit Power turns the patrol bodies blue as well as showing their ground
  rings. Appearance changes update uniforms on isolated patrol materials, leaving
  the original scenery and shader configuration intact. The ten-second timer,
  contact-disable rules and patrol recovery on retry still come from the original.
- An all-four-district completion banner and best-run total for the current
  visit, with replay available. Mute, volume, minimap, steady camera and graphics
  preferences survive changing districts. Nothing writes into 2.5D progression.
- Left movement pad, right look pad and dash for coarse-pointer devices. Touch
  input uses the same camera-relative movement and dash path, clears on pause,
  and cancels when a pointer is lost. The minimap is smaller at narrow widths.
- Nearby patrol footfalls have camera-relative stereo direction, distance fade
  and muffling behind solid cover. Rain ambience shares the volume/mute controls.
  Audio sources are bounded, suspended outside play and released on disposal.
- Graphics recovery creates a fresh canvas before constructing a replacement
  renderer, avoiding reuse of a context that has been lost.

Performance changes:

- Quiet is the default: 30 fps cap, 850,000 drawing-buffer pixels, 384-square
  reflection capture at 15 Hz. Balanced caps at 60 fps / 1.6 million pixels;
  Detailed at 60 fps / 2.7 million pixels. The original simulation always steps
  at 60 Hz. Settings affect presentation only. Renderer creation uses the browser
  default GPU preference rather than forcing the high-performance GPU.
- Eight fixed decorative-light slots select nearby lanterns. Pickup and player
  lights remain independent and their count stays stable during collection.
- Static moon shadows are captured once. Moving patrols use ground contact
  shadows. Indexed geometry retains vertex sharing; static batches are grouped
  spatially so off-screen streets can be culled.
- Reflection resolution/cadence follow the selected preset. Frame scheduling
  retains its target deadline to avoid accumulating timing drift. Ready, paused,
  caught, escaped and hidden states do not run a continuous drawing loop.
- Development-only canvas diagnostics expose rolling ten-second frame timing,
  shader count, render-call duration and renderer geometry/texture counts.
  They are measurements of this browser, not claims about other hardware.

Verification:

- 153 focused tests in 26 files passed, covering the new game, original game,
  navigation, menu/header integration, theme drift and mobile sidebar restoration.
- All four authored maps complete from their real starts with live patrols,
  normal power duration, treasure and all three seals, using camera-relative
  inputs. No enemies are removed and no positions, timers or balancing are
  modified in these campaign traversal checks. Retry restores the original start
  and patrol states; terminal runs stop advancing. This is simulation proof,
  not a claim that a human-driven browser escape was recorded.
- Campaign UI, settings across map changes, active/expired/caught feedback,
  graphics recovery, geometry batching bounds, scene footprints, stereo direction,
  material isolation and render budgets have focused regressions.
- Chrome rendered the new market, docks and gardens. A real Docks dash collected
  the blue flame, immediately displayed ACTIVE / 10 seconds, and showed a blue
  vulnerable hound. Shader count stayed at 30 through the pickup; the observed
  maximum main-thread render call for that short check was 3.1 ms.
- A Quiet courtyard run continued for over two minutes. Its last ten-second
  sample measured 30.0 fps over 300 frame intervals, with 35.4 ms p95 and 37.0 ms
  worst interval. A fresh run with the final default GPU preference measured
  29.8 fps, 34.3 ms p95 and 100.8 ms worst interval over its last ten seconds;
  shader count remained 32. These were stationary local runs, not whole-route
  or multi-device soaks.
- The final Balanced courtyard sample measured 59.5 fps over 595 intervals,
  17.4 ms p95 and 119.9 ms worst interval. There was no multi-second pickup stall,
  but this sample still contains an occasional longer frame and is not a guarantee
  of perfect pacing on every device.
- At a 390 px viewport the original open sidebar left the canvas only 78 px
  wide. The 3D page now collapses it at narrow widths and restores its previous
  state on desktop/route exit. Chrome verified a 318 px canvas with no document
  overflow. Desktop sizing and the original sidebar state were restored after
  the check. This verifies layout, not physical touch input.
- Guards and new-game ESLint pass. Type checking has no new game errors; the
  three existing invalid Next page-export errors in agent observability, AI tools
  and the device benchmark still prevent a clean repository-wide type gate.
- All 31 original game source/art files still match their pre-3D hashes. All 49
  first-person locale keys match between English and Italian. No new dependencies,
  commits, pushes or deployment.

Still required before claiming the whole original visual ambition complete:

- Final authored character/environment assets and close-range visual acceptance
  against the approved concept. The current screenshots remain visibly stylised.
- Physical touch-device play and wider GPU/device measurements. Local Chrome
  checks and runtime tests do not establish those results.
- Human playtesting remains useful for feel and difficulty. The browser coverage
  gap below has since been closed using the repository's Playwright runner with
  held-key movement, as recorded in the finishing pass.

The preceding pass ended at 85% overall. Its page-export build blockers and
browser-control limitation are addressed by the finishing pass below. The active
plan remains open for the listed visual/device acceptance work.

## Asset and browser finishing pass — 2026-09-12

Implemented:

- Authored cross-section meshes replace the cylindrical coat, oval glove palm
  and simple hound head: open coat panels, shaped torso, narrow wrist/broad
  knuckles, folded sleeves and a brass brow/cheek/muzzle shell. Articulated
  fingers, running joints and the shared simulation remain in place.
- New generated leather, indigo cloth, brass and red cotton surfaces; curved
  maple, bamboo and fern cards use an alpha-tested foliage atlas. Exact prompts,
  asset links and provenance are in the
  [character and foliage production record](../assets/ronins-run-3d/character-foliage-production.md).
  All textures decode before play. Lantern ribs follow the paper body, and
  hidden bevel subdivisions were reduced while retaining silhouettes.
- Six geometry regressions check finite mesh data, shaped characters and
  articulated joints, plus all four scenery budgets after spatial batching.
  Guards/hounds remain below 35,000 triangles each, hands below 16,000, and each
  static scenery graph below 1.2 million triangles / 430 mesh objects.
- Three existing Next page-export blockers are repaired without changing their
  UI: observability and AI tools helpers are private, and the device report
  sharing helper/types move to a sibling module. Their 25 tests pass.
- The heavy-dependency guard allows Three.js only inside this lazy-loaded
  arcade engine, with tests keeping ML libraries and engine imports out of the
  shared platform. The unchanged 3D product name is explicitly registered in the
  English/Italian translation guard.
- An on-demand Playwright configuration uses headless Chrome and port 3100,
  keeping port 3000 available. Its `.next-arcade` cache and strict TypeScript
  configuration are separate; generated output is excluded from source scans.
  The ordinary metered CI browser subset is unchanged.

Browser evidence (successful local runs, not a single all-four run):

- Courtyard: 39 seconds; Market: 33.6 seconds; Docks: 33 seconds; Gardens:
  35 seconds. Each starts at the real start, collects the blue flame, three
  seals and treasure, escapes with live patrols, retries and verifies pause.
  The runner reads the visible minimap and sends held keys/mouse gestures; it
  does not teleport, remove enemies, alter time or access the game instance.
- Initial Docks/Gardens routes were caught. The test route now takes the Docks
  flame first and drops a Gardens decoy before the final blind crossing. No map,
  timing or difficulty rules were changed to make the tests pass.
- Each passing route recorded no page errors, stable sampled shader counts and
  no sampled frame interval reaching one second. Ready and paused frames stop.
  The final Gardens run sampled 29.8–30.3 fps in Quiet mode, 33.5–33.7 ms p95,
  125.9 ms worst interval and at most 4.4 ms main-thread render calls; shader
  count stayed at 35. These are rolling local samples, not complete GPU timing,
  perfect frame pacing or measurements on other devices.
- The repeatable command and report locations are in [the E2E guide](../../../e2e/README.md#ronins-run-3d-local-browser-pass).
  Reports remain ignored local artifacts rather than committed generated files.
- All 31 original game source/art hashes still match the pre-3D snapshot.

Final repository verification:

- `npm ci --offline` completed on Node 24.18.0; `verify:env` confirmed all 57
  locked direct dependencies. No package or lockfile changes were needed.
- `npm run check` passed: source guards, ESLint, cold TypeScript and all 6,406
  tests in 738 files. ESLint reports one existing `Header.tsx` effect dependency
  warning; the movement tests also retain their existing nested-mock warnings.
- `SONAE_ARCADE_CHECK=1 npm run build` passed, including production TypeScript
  validation and all 108 static-page generation steps. This built into the
  isolated cache while the normal app remained on port 3000. `npx next typegen`
  then restored the normal generated route-type references without a restart.
- `git diff --check` and the plan/asset document links passed. All 31 original
  game source/art hashes still match. The branch remains `dev`.
- Chrome was confirmed on the fresh 3D start screen with both Arcade menu entries;
  the frontend and Convex development service remain running.

The visual result is improved and playable but still stylised;
concept-fidelity acceptance and physical touch /
wider GPU testing remain open. Independent persistent scores remain a separate
future backend slice. No commits, pushes or deployment.

## Final local polish — 2026-09-12

The user approved finishing the remaining polish after reviewing a real game
screenshot. This pass keeps all four maps, timings and original game behavior.

- Reduced palm/wrist proportions and replaced the raised, outward-facing hand
  pose with a low inward-facing pose. Open-finger gloves share a continuous mesh
  between leather and exposed fingertips. Fine leather/cloth texture scales,
  wrist wraps and independent stride/dash motion replace the previous broad
  mitten-like appearance; steady-camera mode suppresses that motion.
- Guards have articulated elbows and ankles and a two-bone leg pose. During the
  contact portion of a stride the foot travels backward relative to the moving
  body; a regression measures the actual rendered ankle remaining within 1 mm
  of its world position across that stance. Footfalls use the same cycle length.
  Hounds retain diagonal trot phases with revised knee recovery. Neither changes
  pursuit speed, collision radius or the shared simulation.
- Four shop-front variants add split noren curtains, red cloth, reed blinds,
  partially closed shutters and doorway rope/paper details inside the already
  checked scenery footprints. Maple canopies use smaller, denser leaves on
  simpler curved cards; lantern bodies are smoother with thinner ribs.
- Raised cool ambient/moon fill and moved the player's local light ahead of the
  hands to illuminate the route. Reduced oversized pavement/wood/plaster bump
  depth. Fixed light counts, shader preparation, Quiet's 30 fps cap and existing
  geometry budgets remain in place.
- Added a two-minute uninterrupted Quiet rendering/resource check and browser
  touch events at 390 × 844 for movement, release, look and pause. These exercise
  the app in Chrome; they cannot establish physical phone heat or native Safari
  behavior. The all-four-route browser pass is rerun against the final assets.

Final verification:

- 63 focused tests in 16 files pass, including rendered guard-foot stance,
  hand motion, geometry budgets, controls, campaign traversal and game parity.
  The earlier whole-repository check passed 6,406 tests before this final polish.
- Two uninterrupted minutes in Quiet mode pass: 22 rolling samples at
  29.8–30 fps, maximum p95 interval 35 ms and worst recorded interval 117.8 ms.
  Shader, texture and geometry counts remain unchanged during that stationary
  render check. This measures local rendering, not device temperature.
- Chrome touch emulation at 390 × 844 passes move, release, look, pause and
  horizontal-overflow checks. It is not a physical-device acceptance test.
- Source guards, game/test ESLint and environment verification pass on Node
  24.18.0 with all 57 locked direct dependencies. Original-game hash comparison
  still matches all 31 files. The isolated production build passes compilation,
  TypeScript and all 108 page-generation steps. Normal route types were restored
  with `npx next typegen` after the isolated checks.
- Browser-driver diagnostics found that small mouse-steering deviations could
  leave a formerly clear segment blocked at a courtyard corner. The driver now
  checks that segment with the original actor radius and recalculates its path
  from the visible marker when necessary. It also reserves the decoy for the
  courtyard and final garden crossings and verifies its visible cooldown after
  pressing Space. The first courtyard run with this correction passed in 37.5 s.
  The correction is confined to the courtyard: applying it to the Docks caused
  repeated replanning, so Docks retains its original controller. No simulation,
  patrol, collision or timing rules were changed for these tests.
- Final successful browser evidence is from two runs, not one all-green suite:
  Courtyard 37.5 s, Market 33.1 s and Gardens 37.6 s passed together; Docks passed
  separately in 32.9 s after the controller restriction. Each collects the flame,
  three seals and treasure, escapes with live patrols, retries and verifies pause.
  Earlier bot attempts failed on wall contact or decoy timing; the checks retain
  their original capture/escape assertions and do not hide failures with retries.
  Across the successful runs, rolling p95 frame intervals stay at or below
  34.2 ms, the worst recorded interval is 207.3 ms, shader counts stay stable and
  no page errors are recorded. These samples do not prove every frame or device.
- The real Quiet-mode Chrome capture is saved locally at
  `tmp/ronins-run-3d-final.png`; the live game is paused after the capture.
- The normal app remains available on port 3000 and Chrome shows both Arcade
  entries. `git diff --check` passes. Changes are local on `dev`; no commit,
  push or deployment was performed.

The latest reference comparison remains a real
Chrome screenshot, not an image-generation preview. This local polish does not
turn the procedural assets into the cinematic concept or complete physical-device
acceptance. Persistent 3D progression and public deployment are separate steps.


## Authored art and loading completion — 2026-09-13

The user asked to finish the remaining build. The original 2.5D game, the four
navigation layouts, simulation rules, power duration and audio remain unchanged.
No persistent 3D backend, commits, pushes or deployment were added.

Delivered:

- Original offline sculpted gloves, complete with joined palm/webbing/five bent
  fingers, leather surface, seams and wrist wraps. Both fully dressed hands use
  15,900 triangles, within the unchanged 16,000 limit. Closed topology and
  mirrored winding are checked. The script and asset provenance are documented.
- Shared taller building variants, upper latticed windows and lower eaves;
  folded guard sleeves and shaped straw hats; curved trunks/branches with fuller
  leaf crowns. All four district scenery budgets still pass, with the same
  ground footprint rules. Existing hound models and patrol animation remain.
- Pleated paper lanterns with authored fibres, ribs and original crests. Spatial
  batching now preserves cast/receive-shadow flags instead of forcing both on.
  A static prefiltered night environment gives metal and wet materials reflected
  colour without a live extra camera pass. Field of view is 68 degrees.
- A startup draw into a one-pixel target uploads hidden/offscreen geometry while
  the loading screen is visible. Shader compilation alone had left some vertex
  buffers unprepared; the first two-minute run exposed a geometry-count increase.
  The preparation restores scene/renderer state even on error and is covered by
  a regression. Frame/resolution/reflection budgets and pause behavior remain.

Final local verification:

- Node 24.18.0 and all 57 installed direct dependencies match the locked baseline.
  All 62 focused tests in 17 files pass, including geometry budgets, resource
  preparation/restoration, navigation/parity, controls and animation. Game,
  asset-script and browser-spec ESLint pass. The production build compiles,
  passes TypeScript and generates all 108 pages. Source guards and whitespace
  checks pass. The original 31 source/art hashes are unchanged.
- The final two-minute Quiet run passes: 22 samples at 29.6–30 fps, maximum p95
  interval 34.7 ms, worst interval 139.8 ms, and constant 37 shaders, 20 textures
  and 547 geometries. Touch movement/look/release/pause at 390 × 844 also passes.
  This is local Chrome evidence, not a physical phone temperature measurement.
- Successful complete browser escapes exist for all four districts across two
  runs: Courtyard 37.7 s, Market 33.1 s, Docks 33.6 s and Gardens 38.9 s. Each
  success collects the flame, three seals and treasure, escapes, retries and
  checks pause. The final post-preparation run passes five of six checks: its
  Market pilot was caught before the final seal, whereas Market passed in the
  preceding run. Gardens was caught in the preceding run and passed in the
  final run. There is no claim of a consistently green full automated suite;
  the pilot remains sensitive to route/decoy timing. No gameplay values or
  escape assertions were changed to hide this. Full run reports are retained
  locally in `/tmp/ronin-sept13-first-browser-run.json` and
  `/tmp/ronin-sept13-final-browser-run.json`.
- A separate art-review capture passes and saves all four actual running scenes
  in `tmp/ronins-run-3d-{courtyard,market,docks,gardens}-sept13.png`. These are
  native Chrome screenshots with the real game HUD, not generated previews.
- The frontend is restarted after the build; the existing Convex dev process is
  retained. The review game is left idle so it does not continuously render.

Remaining acceptance is explicit: the images are still more stylised than the
approved cinematic reference, and physical touch devices/wider GPUs have not
been tested. The browser pilot's occasional captures also mean one consistently
passing full-route suite is not established. Those limitations must accompany
any claim of whole-game completion; this local art/build pass is complete.

## Campaign, landscape and browser completion — 2026-09-13

This record supersedes the earlier browser-pilot limitation above. The original
game's 31 saved source/art hashes still match. Shared map layouts, movement,
patrol rules, ten-second Spirit Power, audio and progression remain unchanged.

Delivered in this completion pass:

- A continuous mountain ring, forest and layered hilltop keep around all four
  districts. Side and rear facades have weatherboards, recessed shutters,
  windows and beams. Far scenery remains outside all playable ground, with
  upward terrain normals and the existing triangle/mesh limits checked.
- One generated RGBA tree atlas on crossed, alpha-tested cards replaces the
  far forest's crude cones. Broader static batching keeps the forest affordable;
  the renderer loads its single texture before play and disposes it on teardown.
  Lantern crests and the moon's position/brightness are refined. Final views are
  still stylised; they are not claimed to match the cinematic reference.
- WebKit's unlocked mouse movement can report zero relative movement. Drag-look
  now measures client-coordinate differences while pointer-locked looking keeps
  relative movement. The regression checks dragging, release and a second
  gesture without a camera jump. A failed WebKit campaign run exposed this real
  control bug; all four campaigns pass after the fix.
- Campaign steering now uses a controlled browser clock and ordinary keyboard/
  mouse inputs, reading only the visible minimap. This removes host input latency
  and corner overshoot from the pilot. Patrols remain active, power expires
  normally, and all seals/treasure/escape/retry/pause assertions remain. No game
  instance injection, teleport, extended power or disabled patrols are used.
  Controlled-clock frame samples are explicitly not performance measurements.

Current verification:

- 64 focused tests in 18 files pass. Game/spec/config ESLint, TypeScript,
  environment verification and source guards pass on Node 24.18.0 with all 57
  locked direct dependencies. The scene budgets were kept unchanged.
- One complete Chrome run passes all eight checks, with zero retries/skips:
  four campaigns, four-scene art capture, touch movement/look/release/pause,
  two-minute Quiet rendering and a real-time flame pickup. Earlier campaign and
  pickup repetitions also pass 10/10. Following the WebKit control repair,
  Chrome's four campaigns and pickup pass again together, 5/5.
- WebKit passes 6/6: the four complete campaigns, real-time flame pickup and
  all-four-scene capture. Its initial test configuration incorrectly inherited
  Chrome's launch channel; that was corrected before the control diagnosis.
  This is browser-engine coverage, not a physical iPhone or macOS Safari test.
- The final two-minute Chrome Quiet run has 22 samples at 29.8–30 fps, maximum
  rolling p95 interval 34.2 ms, worst recorded interval 141.2 ms, and constant
  37 shaders, 21 textures and 566 geometries. The flame run records 29.8 fps,
  p95 33.5 ms and worst interval 85.7 ms after collection, with stable shader and
  geometry counts. These are local samples, not temperature measurements or a
  guarantee for every device/frame.
- Actual Chrome screenshots for each district are saved under
  `tmp/ronins-run-3d-{courtyard,market,docks,gardens}-final.png`. These capture
  the running renderer and real HUD, not an image-generation mockup. Local
  reports are `/tmp/ronin-completion-final-chrome.json`,
  `/tmp/ronin-completion-chrome-controls.json` and
  `/tmp/ronin-completion-final-webkit.json`.

Remaining overall acceptance: comparison with the cinematic art target and
physical touch-device/wider-GPU testing. Persistent 3D scores and deployment
remain outside this approved local scope. No commit, push or deployment made.

The final production build passes compilation, TypeScript and all 108 page
generation steps using the isolated `.next-arcade` output. Normal route types
were restored with `npx next typegen`. The normal frontend is restarted on
port 3000 and the existing Convex development service is retained. Temporary
browser-test servers are stopped; review scenes remain idle. Whitespace and the
31-file original-game hash comparison pass. The approved local build is complete.

## Final visual delivery — 2026-09-13

The user explicitly asked to finish the remaining visual work after confirming
that gameplay already played well. The implemented changes are documented in
[visual finishing](../assets/ronins-run-3d/visual-finishing-v2.md).

Completed visual checklist:

- Guard: smooth folded coat/trousers, corrected wrap collar, narrow curved eye
  opening, cloth mask, closed shoulders, finer straps and shaped boots.
- Hound: continuous ribcage/chest, overlapping armour, shaped thigh plates,
  pointed ears and narrow lit eyes. Character inspection includes front and
  side views at close range, using the actual loaded meshes/materials.
- Environment: hipped/gabled roof families, upper verandas, painted crests,
  varied vessel shapes, irregular branch/leaf clusters and detailed lunar disc.
- Surface/light: correctly smaller paving, static contact shade, stone
  roughness variation, straw weave, readable lantern printing and less uniform
  ambient illumination. Frame, reflection and pixel limits are unchanged.

Final verification of these changes:

- All 64 focused tests in 18 files pass, including original geometry budgets,
  movement/parity, foot planting and resource preparation. ESLint, TypeScript,
  environment verification, source guards and whitespace checks pass.
- Chrome: all eight browser checks pass in one run, no retries/skips. WebKit:
  all six selected checks pass in one run, no retries/skips. Each engine completes
  all four campaigns with active patrols, pickups, escape, retry and pause.
- Real-time Chrome Quiet performance: 22 samples over two minutes, 29.8–30 fps,
  maximum rolling p95 interval 35.1 ms, worst recorded interval 134.3 ms. Counts
  remain at 37 shaders, 24 textures and 571 geometries. The separate real-time
  flame pickup records 29.9 fps, p95 33.5 ms and worst interval 104.6 ms, with no
  shader or geometry growth. This does not measure physical device heat.
- Final actual Arcade screenshots are at
  `tmp/ronins-run-3d-delivered-{courtyard,market,docks,gardens}.png`. These are
  unedited screenshots of the running renderer. The separate ignored character
  study is asset inspection, not gameplay evidence.
- Browser reports are retained locally in `/tmp/ronin-final-visual-chrome.json`
  and `/tmp/ronin-final-visual-webkit.json`. The original game's 31 saved file
  hashes remain unchanged. No gameplay rules, original artwork, menu scope,
  persistence, dependencies or deployment were changed in this visual delivery.

The concrete character/environment/lighting work above is delivered. Physical
phones/tablets and additional GPUs remain untested; browser-engine and emulated
touch checks must not be labelled physical-device acceptance. The current result
is a stylised browser game. It must not be advertised as an exact photorealistic
match to the generated concept or assigned a fabricated fidelity percentage.

Final production build: passed compilation, TypeScript and all 108 page
generation steps. Normal route types are restored, the local frontend is
restarted on port 3000, and the existing Convex service is retained. Temporary
test/viewer servers are stopped. This delivery remains local on `dev`, without
a commit, push or deployment.
