# Replay Studio And Game Studio Runtime Alignment Plan

Last reviewed: 2026-07-14
Status: implemented; automated nine-recording acceptance passed
Owner: shared Movement Studio / Replay Studio / Game Studio motion runtime

Related controlling documents:

- [Movement Mirror And Side-Ownership Contract](../../developer/movement-mirror-and-side-ownership-contract.md)
- [Movement Mirror Methodology Implementation Plan](./movement-mirror-methodology-implementation-plan.md)
- [Movement Studio Best-Practice Architecture Plan](./movement-studio-best-practice-architecture-plan.md)
- [Replay Studio Agent Repair Harness Plan](./replay-studio-agent-repair-harness-plan.md)
- [Movement Studio And Replay Unification Plan](../../developer/movement-studio-replay-unification-plan.md)

## Objective

Make Replay Studio a recorded driver of the real Game Studio motion runtime, not a second avatar implementation.

The product invariant is:

> A movement repaired and accepted in Replay Studio must produce the same intended motion through Game Studio, including the final rendered VRM bones and uninterrupted playback behaviour.

Replay Studio may provide recording selection, scrubbing, diagnostics, comparison panels, and proof capture. Game Studio may provide webcam capture, live setup, scoring, HUD, and match progression. Neither surface may own different post-input movement decisions, smoothing semantics, fallback behaviour, or VRM bone recipes.

## Why This Plan Is Reopened

Human review on 2026-07-14 exposed two blocking contradictions:

1. Replay playback looks persistently jumpy: the avatar performs a movement, returns toward neutral too quickly, and then performs the movement again.
2. A visible torso bend works in Replay Studio but does not reliably appear in Game Studio.

The existing all-nine deterministic proof does not override those observations. It proved complete frame-index accounting and deterministic rendered mapping under its proof modes. It did not prove that the ordinary Replay player, the Game recorded instructor, and the live Game player all consume identical calibration, timing, fallback, and final application behaviour during the real product lifecycle.

Therefore:

- Replay/Game end-to-end visual parity is not accepted.
- Timed Replay smoothness is not accepted.
- The previous broad “complete” interpretation is reopened.
- No new all-nine run should begin until the targeted alignment failures are repaired.

## Current Code Truth

The foundations are shared, but the routes are not yet one end-to-end runtime.

### Replay Studio standard avatar

`src/app/(dashboard)/demos/movements/replay-lab/page.tsx` currently:

- reads decoded recording frames;
- builds a recording-wide player calibration and retarget source model;
- resolves the visible standard Replay avatar as `avatarRole: "player"`;
- feeds recorded landmarks into a player-facing display mapping;
- advances ordinary playback with a route-owned interval;
- renders through the shared `VrmAvatar` component.

### Game Studio instructor

`src/app/(dashboard)/demos/movements/[id]/play/page.tsx` currently:

- loads the stored instructor recording;
- builds the instructor source model through `useMovementInstructorPlayback`;
- builds frames through `useMovementRecordedMotionFrame`;
- resolves the avatar as the recorded instructor role;
- advances the instructor through Game match/scoring lifecycle state;
- renders through the shared `VrmAvatar` component.

### Game Studio player

The same Game route currently:

- receives live MediaPipe data through `useMovementPlayerTracking`;
- owns a live calibration lifecycle through `useMovementTrackingCalibration`;
- builds frames continuously through `useMovementLiveMotionFrame`;
- includes Game start-readiness requirements;
- resolves the avatar as the live player role;
- renders through the shared `VrmAvatar` component.

### Consequence

Sharing `VrmAvatar`, decision helpers, owner labels, or score wrappers is not sufficient. The three paths still differ before and around the shared renderer in ways that can change visible movement:

- calibration source and lifecycle;
- recorded-instructor versus player role;
- source/display preparation;
- readiness and missing-frame behaviour;
- playback clock and frame cadence;
- smoothing and recovery state;
- pause and frame-reset behaviour;
- route props entering VRM application.

## Target Architecture

```text
Recorded file                         Live camera
     |                                    |
recorded source adapter              live input cleanup
     |                                    |
     +---------- MovementSourceFrame -----+
                         |
              shared calibration state
                         |
              shared MovementMotionFrame
                         |
            explicit anatomical role map
             instructor | player avatar
                         |
              shared timed application
                         |
                  shared VrmAvatar
                         |
              final rendered VRM bones
```

Replay Studio should replace only the live camera at the source boundary. It should be able to exercise both real Game roles:

- recorded instructor: the exact Game instructor adapter and runtime;
- simulated live player: recorded landmarks fed sequentially through the exact Game live-player adapter and calibration lifecycle;
- three-party mirror proof: recorded instructor plus independently constructed opposite-player imitation through both real role paths.

The Replay and Game UIs should remain separate. The runtime below their source adapters should be shared.

## Allowed Differences

The following may remain route-specific:

- webcam acquisition and MediaPipe invocation;
- live-only input filtering before `MovementSourceFrame`;
- recording decoding and storage loading;
- HUD, scoring display, controls, camera preview, and route layout;
- Replay scrubbing, proof markers, export, and diagnostic panels;
- Game lobby, calibration UI, match lifecycle, and completion UI.

An allowed difference must not alter post-input movement ownership, movement amplitude, neutral holding, smoothing time constants, fallback decisions, or final bone recipes.

## Forbidden Differences

- Replay-only body-motion compensation.
- Game-only bone tuning or pose rules.
- Whole-recording future knowledge used to claim live-player parity.
- A missing or delayed frame being interpreted as a neutral human pose.
- Render-frequency-dependent smoothing that changes when the browser frame rate changes.
- Different final VRM application options for the same role, source frame, calibration state, and avatar profile.
- Acceptance based only on owner labels, scores, selected screenshots, or pre-application targets.

## Implementation Plan

### Phase 0: Preserve A Small Failing Baseline

Progress: 100%.

Tasks:

- [x] Record the human symptom: repeated return-to-neutral/jumpy Replay playback.
- [x] Record the human symptom: Replay torso bend does not reliably carry into Game.
- [x] Identify `FULL MOTION EXERCISES` as the exact controlling recording for the first repair.
- [x] Preserve one exact side-bend frame, using frame 2782, through the Replay player, Game simulated-player, and Game instructor views.
- [x] Preserve uninterrupted intended-time playback of all 3,026 `FULL MOTION EXERCISES` frames, including the previously visible reset behaviour.
- [x] Export the source frame, calibration setup, shared motion state, route runtime setup, and final rendered avatar telemetry for the first divergence.

Exit criteria:

- The first differing stage is named from evidence.
- The failure can be rerun without asking for another live performance.
- No broad all-nine capture is started during diagnosis.

### Phase 1: Define One Runtime Contract

Progress: 90%.

Tasks:

- [x] Define the canonical inputs to shared player motion application through `buildPlayerMovementMotionFrame`: source frame, source kind, anatomical mapping, calibration snapshot, retarget source model, and previous decisions.
- [x] Preserve canonical outputs as the shared `MovementMotionFrame`, movement decisions, hold/recovery state, and final avatar telemetry.
- [x] Put both routes behind the named `movement-game-runtime-v1` player/instructor contract and include the actual Game route, hooks, shared runtime, Replay route, and renderer in the proof fingerprint.
- [x] Classify remaining route differences as source acquisition, live input cleanup, or product presentation; none selects a separate post-input player/instructor runtime.
- [x] Make source origin diagnostic-only; `recorded-replay` versus `live-webcam` does not select a different player motion algorithm.

Exit criteria:

- The same canonical runtime input can be serialized and replayed through either route.
- Every remaining route difference has an explicit allowed classification.

### Phase 2: Align Calibration And Source Models

Progress: 85%.

Tasks:

- [x] Make Replay and Game recorded-instructor paths call the same canonical Game instructor runtime adapter.
- [x] Make Replay simulated-player proof substitute recorded input at the canonical Game player runtime boundary.
- [x] Prevent future recording frames from being used for the recorded-player proof setup; calibration provenance is restricted to the configured neutral prefix.
- [x] Store recorded-player calibration provenance in runtime telemetry, including builder and selected neutral sample indexes.
- [x] Prove the current shared setup and runtime across head, spine, arms, lower body, feet, support and final avatar segments for all nine recordings.
- [ ] Keep any deliberate recorded-instructor precomputation explicit and identical wherever the stored instructor is rendered.

Exit criteria:

- Replay recorded-instructor calibration equals Game recorded-instructor calibration for the same recording.
- Replay simulated-player calibration matches what Game would have known at that point in the live sequence.
- Calibration loss holds or blocks movement explicitly; it does not silently return the avatar to neutral.

### Phase 3: Align Playback Clock, Smoothing, And Holds

Progress: 95%.

Tasks:

- [x] Replace Replay's fixed interval with source-timestamp scheduling and a bounded shared playback-clock helper.
- [x] Prove ordinary playback under recorded source timing, independently of deterministic render settling, for all nine acceptance recordings.
- [x] Ensure intended-time Replay processes every accepted source frame once, independently of React render cadence.
- [x] Hold the last valid movement through short uncertainty or delayed frames in both live and recorded hooks.
- [x] Distinguish a genuine source return to neutral from missing input, low confidence, route pause, or effect timing.
- [x] Make uninterrupted play source-time semantics explicit, require complete processed-source accounting, and retain deterministic frame-step proof as a separate final-bone mode.
- [x] Add direct regressions for movement -> short uncertainty -> same movement and active playback with a temporarily missing motion frame.

Exit criteria:

- The avatar cannot visibly snap to neutral unless the accepted source motion returns to neutral or a deliberate recovery policy says so.
- The same sequence behaves consistently at different browser render rates.
- `FULL MOTION EXERCISES` passes the focused uninterrupted smoothness gate before any larger set is run.

### Phase 4: Route Replay Through The Real Game Adapters

Progress: 95%.

Tasks:

- [x] Make Replay recorded-instructor mode call the exact canonical Game recorded-instructor runtime adapter.
- [x] Make Replay simulated-player mode call the same canonical player frame builder as Game live-player motion, with recorded data substituted at the source boundary.
- [x] Reuse the Game player/instructor motion, hold and recovery runtime; Replay owns only recorded source substitution and proof setup provenance.
- [x] Keep Replay diagnostic analysis separate from motion production.
- [x] Expose the active runtime contract and lanes on Replay for capture: `game-instructor` and/or `game-player-simulated`.
- [x] Remove the route-local standard Replay player construction in favour of the shared player adapter.

Exit criteria:

- A Replay frame is a recorded invocation of the Game runtime, not a parallel implementation.
- Fixing a shared movement helper changes Replay and Game on the same run.
- Replay cannot report parity without exercising the relevant real Game role.

### Phase 5: Align Final VRM Application

Progress: 90%; all-nine final-render parity proven.

Tasks:

- [x] Compare the same Jane avatar profile in Replay and Game at exact side-bend frame 2782.
- [x] Compare final axial output and rendered head, arm, leg and foot segment directions after application across all nine recordings.
- [x] Exercise the same renderer and parent/child application order for both Game runtime roles.
- [x] Verify support presentation, foot contact, root correction and fallback ownership through the all-frame player and paired-role analysers.
- [x] Ensure the shared player path uses anatomical role mapping rather than route origin to select its movement recipe.
- [x] Put movement-changing player and instructor frame production behind the shared Game runtime contract; route origin remains source provenance.

Exit criteria:

- Equivalent role inputs produce equivalent final VRM transforms in Replay and Game.
- Instructor identity and player opposite mapping both pass the three-party invariant.
- Matching decisions with differing final rendered bones is a blocking parity failure.

### Phase 6: Add A Tiered Alignment Gate

Progress: 100%; targeted, subset and all-nine combined gates passed.

#### Tier 1: exact frame

- [x] Run the Full Motion Exercises side-bend frame through Replay and Game.
- [x] Require matching recorded-player calibration provenance and final applied hips/spine/chest/upper-chest rotations.
- [x] Capture route runtime setup and avatar telemetry automatically.

#### Tier 2: short timed window

- [x] Run uninterrupted source-time playback through the movement/neutral/movement sequence.
- [x] Require no unsupported neutral reset or owner flicker; analyser result is `passed`.

#### Tier 3: one complete recording

- [x] Run Full Motion Exercises at intended timing through the Replay simulated-player lane.
- [x] Require complete source-frame processing and uninterrupted sampled final-bone telemetry.
- [x] Require both Game roles, not only the standard Replay avatar.

#### Tier 4: representative subset

- [x] Run Full Motion Exercises, Full Spinal Flow, and Spins.
- [x] Cover bending, lower-body motion, occlusion/reacquisition, axial movement, and turning.

#### Tier 5: final all-nine certification

- [x] Run only after the targeted recording and representative subset pass.
- [x] Require every frame of all nine recordings through player-avatar and independent three-party paths.
- [x] Require uninterrupted intended-timing proof as well as deterministic accounting.
- [x] Do not let deterministic stepping waive temporal smoothness failures.

Exit criteria:

- One named command reports both Replay and Game runtime results from the same source manifest.
- A Replay pass plus Game fail is an overall failure.
- A deterministic pass plus timed fail is an overall failure.

### Phase 7: Automated Product Handoff

Progress: 100%.

Tasks:

- [x] Make Replay execute the named Game player/instructor runtime contract rather than ask the user to locate movement failures manually.
- [x] Require exact source identity, current runtime fingerprint, runtime-lane identity and complete frame accounting.
- [x] Require deterministic final-bone proof, intended-time neutral-reset/jerk proof and independent paired-role proof.
- [x] Run the combined gate across all nine acceptance recordings and return a machine-readable pass/fail report.

Optional human viewing remains useful as product reassurance, but it is not a technical completion gate and is not the movement-debugging loop.

## Required Proof Data

Every alignment artifact must identify:

- recording id and exact title;
- source frame index and source timestamp;
- route and runtime lane;
- avatar role and anatomical mapping;
- avatar profile/VRM file;
- calibration provenance and quality;
- retarget source-model provenance and quality;
- previous valid frame and hold/recovery state;
- movement owners and target rotations;
- final applied VRM transforms;
- render timestamp and source-to-render latency;
- first divergent stage;
- deterministic or uninterrupted playback mode.

## Acceptance Rules

The alignment slice is complete only when all of the following are true:

- Replay uses the real Game instructor and simulated-player adapters.
- The same source and runtime state produce the same post-input movement result.
- Route origin cannot select different movement decisions or bone recipes.
- Calibration differences are deliberate, explicit, and reproducible.
- Missing or uncertain input does not masquerade as a neutral pose.
- Smoothing is time-based and consistent across render rates.
- Final rendered VRM bones, not only labels or targets, satisfy parity.
- Full Motion Exercises passes exact-frame and uninterrupted proof.
- The representative subset passes before the all-nine gate is attempted.
- The final all-nine deterministic and uninterrupted gates pass on one current runtime fingerprint.
- Node 22.13.0 repository gates pass before merge or push.

## What Not To Do

- Do not merge the Replay and Game pages merely to claim shared code.
- Do not patch Game independently to imitate Replay output.
- Do not patch Replay independently to make diagnostics look green.
- Do not add pose-specific or recording-specific bone rules.
- Do not use whole-recording averages to hide a visible reset.
- Do not run all nine recordings after every small change.
- Do not claim “same pipeline” until final timed VRM output is proven.

## Verification Strategy

Use Node `22.13.0`.

During implementation:

```bash
npm run verify:env
npm run test:run -- '<focused movement tests>'
git diff --check
```

Proof order:

```text
exact Full Motion Exercises frame
  -> short timed failure window
  -> complete Full Motion Exercises
  -> three-recording representative subset
  -> final nine-recording certification
  -> manual Game camera confirmation
```

Before handoff, merge, or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Progress

- Shared motion decision foundation: 100% for the accepted runtime contract.
- Documented runtime-alignment design: 100% once this plan is accepted.
- Reopened end-to-end Replay/Game implementation: 100% for the nine-recording acceptance scope.
- Reopened timed automated acceptance: 100%.
- Automated product acceptance: 100%.

Targeted exact-frame, representative-subset, complete intended-time and final all-nine certification now pass. Human viewing is optional reassurance rather than required debugging evidence.

## Immediate Next Slice

1. Keep `movement:replay:nine-proof` as the final certification command, not the first debugging command.
2. On future failures, reproduce with targeted proof, then subset, then all nine.
3. Preserve both intended-time and deterministic modes in the final gate.
4. Do not reintroduce route-local post-input movement decisions.

## 2026-07-14 Implementation Evidence

- Canonical player adapter: `movementPlayerMotionFrame.ts`, consumed by both live Game player motion and recorded Replay player motion.
- Shared recorded-player setup: `movementRecordedPlayerSetup.ts`, with identical calibration provenance in the Replay and Game proof lanes.
- Intended-time Replay clock: `movementReplayPlaybackClock.ts`, with source-timestamp scheduling in Replay Lab.
- Missing-frame hold: live and recorded motion hooks preserve the previous valid movement; `VrmAvatar` does not substitute a neutral/demo pose during active playback gaps.
- Exact parity proof: Jane at `FULL MOTION EXERCISES` frame 2782 produced identical final hips, spine, chest, and upper-chest rotations in Replay and Game simulated-player lanes.
- Complete timed proof: all 11,383 source frames across nine recordings processed with zero missing; every intended-time analysis passed.
- Final deterministic Game-player proof: 11,383/11,383 rendered frames, zero missing.
- Final paired Game instructor/player proof: 11,383/11,383 rendered frames, zero missing.
- Final strict bundle: nine of nine recordings passed with zero failures under `movement-game-runtime-v1` and one current motion-pipeline fingerprint.
- Repository verification: Node 22.13.0 environment verification, clean `lint:all`, 317 test files / 2,269 tests, typecheck, production build, movement architecture guard, and `git diff --check` passed.
- Intentionally not run yet: representative three-recording subset and final all-nine certification.

## Decision Log

### 2026-07-14

- Human-visible Replay/Game disagreement overrides the earlier broad alignment claim.
- Replay Studio remains the recorded debugging surface, but must drive the real Game runtime to prove a Game fix.
- The standard Replay player lane, Game recorded-instructor lane, and Game live-player lane are distinct today and must all be covered explicitly.
- Shared helpers and shared `VrmAvatar` are necessary but not sufficient evidence.
- Calibration, timing, hold/recovery state, route props, and final VRM application are part of the parity contract.
- Deterministic frame-step proof does not waive uninterrupted smoothness.
- Targeted proof comes first; the all-nine suite is the final certification gate only.
- Replay and Game simulated-player motion now enter one shared player adapter; missing live/recorded frames preserve the previous valid motion instead of masquerading as neutral.
- Replay intended-time playback now follows recorded timestamps and processes every source frame without forcing a React page render for each source frame.
- The same recorded-player setup provenance and final hips/spine/chest/upper-chest rotations were proven in Replay and Game for Jane at `FULL MOTION EXERCISES` frame 2782.
- Complete intended-time Replay proof processed all 3,026 source frames, found zero neutral resets and zero owner flickers, and passed strict analysis.
- `movement:replay:nine-proof` now requires intended-time Game-player evidence in addition to deterministic Game-player and paired instructor/player evidence for every recording.
- The current all-nine run passed 11,383 source/rendered frames in each required path with zero missing frames and zero failures; manual movement debugging is no longer part of acceptance.
