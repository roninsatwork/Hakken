# Replay Studio And Game Studio Runtime Alignment Plan

Last reviewed: 2026-07-17
Status: active and product-blocked. The shared post-input runtime is substantially aligned, and eight legacy recordings produced zero observed Replay/Game output differences. That evidence is diagnostic rather than final acceptance because the Replay captures are stale against the current fingerprint, the mounted Game artifacts are unversioned and legacy, exact differences are not yet hard failures, and the ordinary live-camera boundary has not been commissioned.
Owner: shared Movement Studio / Replay Studio / Game Studio motion runtime

Related controlling documents:

- [Movement Mirror And Side-Ownership Contract](../../developer/movement-mirror-and-side-ownership-contract.md)
- [Movement Mirror Methodology Implementation Plan](./movement-mirror-methodology-implementation-plan.md)
- [Movement Studio Best-Practice Architecture Plan](./movement-studio-best-practice-architecture-plan.md)
- [Replay Studio Agent Repair Harness Plan](./replay-studio-agent-repair-harness-plan.md)
- [Replay Lab Visual Acceptance Tightening Plan](./replay-lab-visual-acceptance-tightening-plan.md)
- [Movement Studio And Replay Unification Plan](../../developer/movement-studio-replay-unification-plan.md)

## Objective

Make Replay Studio a recorded driver of the real Game Studio motion runtime, not a second avatar implementation.

The product invariant is:

> A movement repaired and accepted in Replay Studio must produce the same intended motion through Game Studio, including the final rendered VRM bones and uninterrupted playback behaviour.

“Flawlessly” in this plan means a deterministic, fail-closed engineering contract: every declared supported behaviour passes from one immutable input packet through both Replay and the normal mounted Game lifecycle, with complete frame/channel accounting and identical versioned setup. It does not mean claiming software can never contain another defect. It means Replay cannot say accepted while the corresponding Game evidence is absent, limited, stale, or failing.

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

Human Game testing on 2026-07-16 exposed a further, more important contradiction: Replay visibly followed squats and approximately 45-degree leg raises while the real Game player did not. The prior “Game” parity proof had exercised a recorded simulated-player adapter, and one visual capture mounted the Game route while its player lifecycle was paused. Neither proved the live Game setup and active player application path. The broad 100% and “human viewing is optional” claims below are therefore superseded by the 2026-07-16 evidence and acceptance boundary.

## Current Code Truth

The post-input runtime and mounted recorded-Game proof route are shared. The remaining acceptance gap is source evidence and commissioning, not a separate Game bone solver.

### Replay Studio standard avatar

`src/app/(dashboard)/demos/movements/replay-lab/page.tsx` currently:

- reads decoded recording frames;
- builds a recording-wide player calibration and retarget source model;
- resolves the visible standard Replay avatar as `avatarRole: "player"`;
- feeds recorded landmarks into a player-facing display mapping;
- advances ordinary playback with the shared source-timestamp playback-clock semantics, while Replay still owns playback controls;
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

### 2026-07-16 end-to-end audit verdict

The code audit confirms a real shared downstream foundation, but not the product invariant in this plan.

| Boundary | Current evidence | Verdict |
| --- | --- | --- |
| Motion-frame construction | Replay and live Game both call `buildMovementGamePlayerRuntimeFrame`. | Shared foundation; passing. |
| Motion decision and final avatar application | Both paths resolve the same movement runtime and use the same `VrmAvatar` application path; source provenance is diagnostic rather than a motion-algorithm branch. | Shared foundation; passing. |
| Live setup window | Replay/debug recorded setup uses a 60-frame neutral prefix; automatic Game preview stops setup after 12 accepted frames. | Blocking divergence. |
| Camera acquisition and filtering | Capture and Game own duplicated MediaPipe result preparation. Pose filter settings currently match, but hand smoothing differs (`1.6` versus `2.2`). | Blocking drift surface. |
| Canonical `FULL MOTION EXERCISES` payload | The 3,026 samples contain pose and world-pose data, but not hands, face, blendshapes, camera metadata, or a versioned acquisition/setup profile. | Insufficient end-to-end fixture. |
| Mounted Game proof | The current gate proves synthetic calibration and selected whole-body poses, but lists root turn, hand curl, and face blink as diagnostic limitations rather than failures. | Useful regression evidence; not product parity. |
| Real Game session lifecycle | Recorded debug proof injects a 60-frame setup and does not prove the normal 12-frame automatic setup, real readiness transitions, or complete live acquisition lifecycle. | Not proven. |

This 2026-07-16 audit verdict is retained as the reason the work was reopened. The mounted 2026-07-17 evidence proves that the shared post-input route can produce matching output from legacy recordings. It does **not** yet prove the product implication `Replay accepted -> ordinary live Game accepted`, because current-source identity, a complete packet, exact fail-closed enforcement, and live commissioning remain open.

This plan must close that gap without asking the user to repeat squats, leg raises, or side bends as the debugging harness. A one-time commissioning capture may be needed to prove real camera acquisition. After that capture exists, the saved complete packet and mounted Game-session gate must reproduce failures and verify repairs automatically.

### 2026-07-17 proof-trust correction

The previous 98% and “final-code exact comparison” language was too strong. A deep code-and-artifact audit found:

- all eight passing mounted reports identify themselves as `legacy-lifecycle-only` with `contractStatus: legacy-missing`, `inputContractId: null`, and `sourcePacketHash: null`;
- every comparison reports `identityStatus: legacy-unverifiable`;
- the latest comparison reused Replay captures rather than generating Replay output from the final code;
- the reused `Full Motion Exercises` Replay fingerprint is `sha256:e3febe41804742e8cf7f337b42e191fbd7a77c8b6d1b5ab01e200a87c3fccabd`, while the audited current fingerprint is `sha256:6f92118efa97b61d71b2611ce316dfe921edec146fdce68b216e6c823ac4a3d6`;
- mounted Game reports do not currently export a motion-pipeline fingerprint, so the comparator cannot prove both sides ran the same code;
- `movementPipelineFingerprintFiles()` omits `useMovementPlayerTracking.ts`, `useMovementLivePlayerSetup.ts`, `movementPlayerInputContract.ts`, and `useVrmAvatarFrameRuntime.ts`;
- the comparator records exact checksum differences but does not add them to `failures`, so a sub-tolerance exact mismatch can still pass;
- the comparator checks final player visual telemetry and selected applied telemetry, but does not enforce every exported acquisition, setup, calibration, motion-frame, owner/root/support, instructor-rendered, and player-rendered boundary checksum;
- all nine historical recordings contain pose and world-pose on every frame, but zero recorded hand, face, or blendshape frames;
- `Head Roll` contains no full-body-ready frame with both feet simultaneously visible;
- no current schema-v2 live-camera commissioning packet has passed fresh Replay and fresh mounted Game runs.

Therefore the 10,327 zero-difference rendered frames remain valuable evidence that the shared post-input implementation is close. They are not a release certificate and must not be described as proof that every future Replay repair automatically reaches the ordinary live Game.

## Target Architecture

```text
Recorded complete packet                  Live camera
          |                                    |
          |                         MediaPipe acquisition only
          |                                    |
          +------ shared acquisition preparation ------+
                                |
                     MovementAcquisitionFrame
               pose/world + hands/face + timing
                camera + filter/setup provenance
                                |
                  shared setup/calibration policy
                                |
                   shared Game session driver
             readiness + holds + clock + lifecycle
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

Replay Studio should replace only the physical camera and MediaPipe invocation at the source boundary. The prepared acquisition packet, setup/calibration policy, Game session driver, movement runtime, and final renderer below that boundary must be identical. Replay must be able to exercise both real Game roles:

- recorded instructor: the exact Game instructor adapter and runtime;
- simulated live player: a complete recorded acquisition packet fed sequentially through the exact Game live-player preparation, setup, readiness, calibration, timing, hold/recovery, and avatar lifecycle;
- three-party mirror proof: recorded instructor plus independently constructed opposite-player imitation through both real role paths.

The Replay and Game UIs should remain separate. The acquisition configuration and runtime below the physical camera/decoder boundary must be shared and fingerprinted.

## Allowed Differences

The following may remain route-specific:

- webcam permissions, device selection, and the physical MediaPipe invocation;
- recording decoding and storage loading;
- HUD, scoring display, controls, camera preview, and route layout;
- Replay scrubbing, proof markers, export, and diagnostic panels;
- Game lobby, calibration UI presentation, match navigation, and completion UI. The underlying setup/readiness/session transition semantics remain shared proof inputs.

Detector options, result-to-landmark preparation, pose/hand/face filtering, setup length, neutral selection, calibration construction, readiness semantics, and missing-frame treatment are not route-specific allowances. They must come from one shared, versioned profile. An allowed difference must not alter movement ownership, amplitude, neutral holding, smoothing time constants, fallback decisions, or final bone recipes.

## Forbidden Differences

- Replay-only body-motion compensation.
- Game-only bone tuning or pose rules.
- Whole-recording future knowledge used to claim live-player parity.
- A missing or delayed frame being interpreted as a neutral human pose.
- Render-frequency-dependent smoothing that changes when the browser frame rate changes.
- Different final VRM application options for the same role, source frame, calibration state, and avatar profile.
- Acceptance based only on owner labels, scores, selected screenshots, or pre-application targets.
- Route-local detector, filter, setup-window, neutral-selection, or calibration constants.
- A Replay pass when the mounted Game-session lane was skipped, proof-limited, or accepted with a diagnostic limitation for a supported behaviour.
- A debug-only setup injection that bypasses the normal Game readiness and setup lifecycle.

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

Progress: 80%. The downstream contract is named and shared; acquisition, setup policy, and Game session lifecycle must now join the fingerprint.

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

Progress: 85%. Replay, passive Game setup, and explicit Game calibration now use the same named 60-frame setup builder. A complete schema-v2 packet has not yet proven that ordinary live Game and Replay received byte-equivalent setup inputs and provenance.

Tasks:

- [x] Make Replay and Game recorded-instructor paths call the same canonical Game instructor runtime adapter.
- [x] Make Replay simulated-player proof substitute recorded input at the canonical Game player runtime boundary.
- [x] Prevent future recording frames from being used for the recorded-player proof setup; calibration provenance is restricted to the configured neutral prefix.
- [x] Store recorded-player calibration provenance in runtime telemetry, including builder and selected neutral sample indexes.
- [x] Prove the current shared setup and runtime across head, spine, arms, lower body, feet, support and final avatar segments for all nine recordings.
- [x] Build explicit Game posture check-in calibration with `buildMovementRecordedPlayerSetup`, the same neutral-prefix setup builder used by Replay.
- [x] Build a passive neutral-prefix setup for Guided Preview so skipping the explicit check-in does not leave Game without the calibration and retarget model required by lower-body motion.
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

Progress: 85%. Replay reaches the canonical frame builder and the mounted recorded source enters through Game player tracking. The mounted proof still uses debug packet readiness orchestration and has not commissioned the ordinary live-camera calibration/readiness lifecycle from a complete packet.

Tasks:

- [x] Make Replay recorded-instructor mode call the exact canonical Game recorded-instructor runtime adapter.
- [x] Make Replay simulated-player mode call the same canonical player frame builder as Game live-player motion, with recorded data substituted at the source boundary.
- [x] Reuse the Game player/instructor motion, hold and recovery runtime; Replay owns only recorded source substitution and proof setup provenance.
- [x] Keep Replay diagnostic analysis separate from motion production.
- [x] Expose the active runtime contract and lanes on Replay for capture: `game-instructor` and/or `game-player-simulated`.
- [x] Remove the route-local standard Replay player construction in favour of the shared player adapter.
- [x] Substitute recorded input at the physical-camera boundary of the mounted Game route rather than injecting prepared setup or motion state.
- [ ] Exercise the normal automatic setup, readiness, active-play, pause/resume, and completion lifecycle.

Exit criteria:

- A Replay frame is a recorded invocation of the Game runtime, not a parallel implementation.
- Fixing a shared movement helper changes Replay and Game on the same run.
- Replay cannot report parity without exercising the relevant real Game role.

### Phase 5: Align Final VRM Application

Progress: 90%. The shared final renderer has strong recorded evidence; complete-packet parity through the normal mounted Game lifecycle remains open.

Tasks:

- [x] Compare the same Jane avatar profile in Replay and Game at exact side-bend frame 2782.
- [x] Compare final axial output and rendered head, arm, leg and foot segment directions after application across all nine recordings.
- [x] Exercise the same renderer and parent/child application order for both Game runtime roles.
- [x] Verify support presentation, foot contact, root correction and fallback ownership through the all-frame player and paired-role analysers.
- [x] Ensure the shared player path uses anatomical role mapping rather than route origin to select its movement recipe.
- [x] Put movement-changing player and instructor frame production behind the shared Game runtime contract; route origin remains source provenance.
- [x] Resolve player head behaviour by avatar role rather than Replay/live source provenance.
- [x] Resolve live Game root history once per MediaPipe source frame, and provide that shared result to final VRM application instead of appending duplicate renderer-tick samples.

Exit criteria:

- Equivalent role inputs produce equivalent final VRM transforms in Replay and Game.
- Instructor identity and player opposite mapping both pass the three-party invariant.
- Matching decisions with differing final rendered bones is a blocking parity failure.

### Phase 6: Add A Tiered Alignment Gate

Progress: 70%. The historical downstream targeted, subset, and all-nine lanes passed; each tier must now include acquisition/setup fingerprints and the normal mounted Game session.

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

Progress: 55%. The existing commands prove substantial downstream recorded-runtime behaviour, but current source identity, complete fingerprints, strict exact comparison, fresh artifact generation, and normal live Game commissioning are not closed.

Tasks:

- [x] Make Replay execute the named Game player/instructor runtime contract rather than ask the user to locate movement failures manually.
- [ ] Require exact source identity, a complete current runtime fingerprint on both artifacts, runtime-lane identity, and complete frame accounting. Legacy diagnostic runs currently lack these acceptance fields.
- [x] Require deterministic final-bone proof, intended-time neutral-reset/jerk proof and independent paired-role proof.
- [x] Run the combined gate across all nine acceptance recordings and return a machine-readable pass/fail report.

The automated handoff is incomplete until the same complete packet can be run through Replay and the normal mounted Game session and produce one binary result. Human live-camera viewing is a one-time commissioning check for acquisition changes, not the recurring movement-debugging loop.

### Phase 8: Establish One Shared Acquisition Contract

Progress: 85%. Shared preparation, filters, setup policy, and schema provenance are implemented and focused tests pass. The fingerprint/guard surface is incomplete and no current full-channel packet has proven byte-equivalent live and replayed acquisition/setup output.

Tasks:

- [x] Extract one shared result-preparation module used by Movement Capture and Game player tracking for pose, world pose, hands, face landmarks, blendshapes, timestamps, and camera metadata.
- [x] Create one versioned detector/filter profile and shared filter factory; remove route-local pose, hand, and face filter constants.
- [x] Create one named setup policy with the same accepted-frame count, neutral-selection rules, timeout, readiness semantics, and calibration builder in Replay and Game.
- [x] Replace route-owned numeric setup limits, including the former 60-versus-12 divergence, with that policy.
- [x] Add an architecture guard that fails on new route-local acquisition filters, setup lengths, or calibration construction.
- [x] Include detector options, filter profile, setup policy, and calibration builder versions in the recording/runtime provenance.
- [ ] Extend the architecture guard and pipeline fingerprint to every live acquisition/setup owner and final application hook so a route-local change cannot evade stale-proof detection.

Exit criteria:

- The physical camera and recording decoder are the only different acquisition components.
- Given the same MediaPipe result sequence, Capture, Replay, and Game produce byte-equivalent normalized acquisition packets and setup/calibration provenance.
- A pose, hand, face, setup, or calibration change cannot land in one route without failing the guard.

### Phase 9: Record One Complete, Replayable Input Packet

Progress: 80%. Schema v2, per-frame readiness history, channel/provenance preservation, and SHA-256 packet integrity are implemented; a current complete canonical commissioning capture and hash propagation into every exported proof artifact remain.

Tasks:

- [x] Define recording schema v2 with pose, world pose, left/right hands and world hands, face landmarks, blendshapes, source and capture timestamps, frame dimensions/orientation, camera metadata, confidence, detector/filter profile, and setup provenance.
- [x] Preserve the actual setup prefix and readiness transitions rather than storing only post-setup movement frames. Every retained frame now stores the readiness decision that accompanied it, including the 60-frame setup prefix.
- [x] Record the source packet before movement decisions so future repairs can rerun the unchanged input through current code.
- [x] Validate channel completeness at save time; unsupported or missing channels remain explicit and cannot be counted as passing evidence for that behaviour.
- [ ] Capture or migrate a canonical acceptance set. Keep `FULL MOTION EXERCISES` as the named whole-body control, but do not pretend its current pose-only payload proves hands, face, or live camera preparation.
- [ ] Hash the immutable packet and retain its schema/profile versions in every proof artifact. Save now hashes the complete schema-v2 envelope with SHA-256 and Replay retains the hash; combined exported proof artifacts still need to surface and enforce it.

Exit criteria:

- The same saved packet can reconstruct what the Game player knew, in order, without future frames or synthetic calibration.
- Missing hands, face, camera, timing, or setup evidence blocks the corresponding supported behaviour instead of becoming a diagnostic limitation.
- The user performs a motion once for commissioning; subsequent debugging and certification use the saved packet.

### Phase 10: Replay Through The Normal Mounted Game Session

Progress: 80%. The mounted historical lifecycle, frame acknowledgement, setup-prefix handling, start gate, pause/resume, and rendered accounting are implemented. Eight legacy recordings produced 10,327 active frames with zero observed output differences. Closure remains blocked because the comparison reused stale Replay captures, Game reports carry no current pipeline fingerprint, source identity is legacy-unverifiable, exact differences are not hard failures, and the ordinary live-camera setup/calibration path has no complete commissioning packet.

Tasks:

- [x] Add a recorded source provider at the physical-camera boundary of the real Game route; do not inject a prebuilt motion frame or precomputed calibration.
- [x] Mount the actual Game route and prove its normal lobby/setup, readiness, match start, active play, scoring completion, pause/hold, and resume transitions.
- [ ] Exercise missing-input hold/recovery with a dedicated packet fixture through the same mounted lifecycle.
- [x] Feed every packet frame at its recorded source time and require complete processed-source and rendered-frame accounting. The mounted run passed 632/632 processed source frames and 572/572 active rendered frames; the 60 setup frames are deliberately processed before the avatar scene mounts.
- [ ] Run fresh Replay and mounted Game from the same immutable packet, avatar profile, setup policy, commit, and complete runtime fingerprint. The latest Game run is current, but its Replay comparisons reused captures from a different fingerprint.
- [ ] Export and enforce comparable acquisition, setup, calibration, motion-frame, owner/root/support, instructor-rendered, player-rendered, and final applied-bone checksums from both routes. Mounted Game exports seven boundary checksums, but the comparator currently enforces only final visual/applied telemetry.
- [x] Seed mounted Game's live motion runtime from the same collected 60-frame setup prefix and require a fresh motion-frame render acknowledgement before associating an avatar render with a source index. At frame 60, Replay and Game now match exactly for head input/application, body confidence, spine drive, retarget decisions, hands/expressions, and applied avatar spine.
- [x] Make Replay and mounted Game use a deterministic source-time final-render lifecycle. Route presentation offsets are normalized, while feet, floor contact and every compared final VRM segment remain tolerance-checked.
- [x] Advance recorded prestart input only while the normal Game gate is checking visibility, count genuinely new source indexes as fresh checks, and acknowledge each prestart frame before publishing the next. This repairs the former frame-59 deadlock without weakening production readiness rules.
- [x] Prevent the live motion runtime from consuming the 60-frame setup prefix twice when the current live ref initially repeats the last setup payload. This removes shifted root-turn/contact history and restores exact Spins parity.
- [x] Derive the comparable active range from the Game-reported `activeFrameStartIndex`; setup and prestart frames are explicit lifecycle evidence rather than hidden or hard-coded exclusions.
- [ ] Expand the pipeline fingerprint to cover every file that can change acquisition, automatic setup, calibration, motion history, Game lifecycle, Replay lifecycle, and final VRM application, including `useMovementPlayerTracking.ts`, `useMovementLivePlayerSetup.ts`, `movementPlayerInputContract.ts`, and `useVrmAvatarFrameRuntime.ts`.
- [ ] Export the complete pipeline fingerprint, input-contract ID, source packet hash, commit, avatar profile, setup policy, and proof mode from both Replay and mounted Game artifacts.
- [ ] Reject reused Replay captures unless their complete fingerprint and packet hash exactly match the current Game run. Stale reuse must trigger recapture, never a pass.
- [ ] Make any exact comparable boundary-checksum difference a hard failure. Tolerance analysis may diagnose visual fidelity, but it cannot waive Replay/Game identity.
- [ ] Remove `--allow-legacy` from acceptance commands. Legacy sessions may remain diagnostic controls but cannot produce product acceptance.
- [ ] Exercise the ordinary live Game calibration/readiness path with a complete saved camera-boundary packet; debug recorded-source readiness must not stand in for this final proof.
- [ ] Fail at the first differing boundary and retain first/worst screenshots or frame strips.

Exit criteria:

- The proof lane cannot bypass or substitute different readiness/calibration semantics for the ordinary Game automatic and explicit setup lifecycle.
- Fresh Replay acceptance and fresh mounted Game acceptance are produced by one command from one current schema-v2 packet.
- Both artifacts carry the same complete pipeline fingerprint, input-contract ID, source hash, avatar profile, setup policy, commit, and proof mode.
- Exact comparison covers every exported boundary and any exact difference fails.
- Any Replay pass plus mounted Game fail is an overall failure and a product release blocker.

Current mounted evidence:

- Command: `npm run movement:game:packet-proof -- --base-url http://localhost:3100 --debug-session-json <session.json> --out tmp/movement-replay-lab/current-mounted-game-packet-proof.json --allow-legacy --local-test-auth --secret sonae-local-test-auth`.
- Passing lifecycle packet: `px72q2e5m8pw9gctaj11yh36a989wjt7`, 632 expected and processed frames, 572 expected and rendered active frames, zero missing/duplicates, pause held frame 67, final player/instructor indexes 631/631, and seven boundary checksums per active frame.
- Honest evidence tier: `legacy-lifecycle-only`; this historical packet has no `movement-player-input-v1` fingerprint or source packet hash and cannot certify the acquisition boundary.
- Historical negative-control note: `Walking on the Spot` originally blocked when the recorded harness froze at frame 59. After chronological prestart repair it passes; it must not remain documented as source-invalid.
- Current mounted diagnostic batch: `tmp/movement-replay-lab/current-mounted-game-nine-proof-aligned-v3/summary.json`. Eight recordings pass complete source/render accounting: `Spins` 648/648, `Turning Around in Circles` 632/632, `Full Spinal Flow` 1,290/1,290, `Star Jumps` 708/708, `Full Motion Exercises` 3,026/3,026, `Body Capture 3D` 1,815/1,815, `Full Body Flow` 2,169/2,169, and `Walking on the Spot` 541/541. `Head Roll` is the only blocked recording. Every passing report remains `legacy-lifecycle-only`.
- The renewed batch evaluates every available frame until the unchanged Game gate either starts or gives a fail-closed setup verdict. `Spins` first becomes ready at source frame 73 and `Walking on the Spot` at frame 64; both now progress instead of freezing at frame 59. `Head Roll` has no full-body-ready frame across all 554 source frames because both feet are never simultaneously visible, so weakening the gate would invent evidence.
- Current diagnostic comparison: `tmp/movement-replay-lab/current-replay-mounted-game-nine-comparison-aligned-v3/summary.json`. All eight runnable sessions compared 10,327 active rendered frames with zero observed tolerance or exact visual-checksum differences. `Head Roll` contributes zero active frames and remains explicitly blocked. This is not current-code acceptance: the Replay inputs were reused from a mismatched fingerprint and every row is `legacy-unverifiable`.

### Phase 11: Make Every Supported Behaviour A Hard Gate

Progress: 65%. Former root-turn, hand-curl, and face-blink limitations are hard failures, both lateral leg directions have near/far fixtures, and the mounted lane emits whole-frame/channel/body-region coverage. The legacy recordings contain complete pose/world-pose but no hands, face, blendshapes, schema-v2 identity, or current-code fresh cross-route proof. `Head Roll`, exact all-boundary enforcement, missing-input recovery, mirror-bone proof, and current full-channel evidence remain open.

The acceptance matrix must cover, in both anatomical directions where applicable:

- head pitch, yaw, and roll;
- spine forward bend, side bend, twist, and return to neutral;
- both arms, elbow/wrist/hand ownership, and reach amplitude;
- squat/rise and root-height response;
- both forward leg raises and both approximately 45-degree lateral leg raises;
- thighs, shins, ankles, heels, toes, planted support, and foot-plane contact;
- root turn, lateral/vertical/depth travel, step, and jump;
- left/right hand curl and representative asymmetric face/blink behaviour;
- acquisition loss, low-confidence holds, reacquisition, pause/resume, and render-rate variation.

Non-negotiable whole-recording rule: this matrix is a minimum coverage floor, not an allow-list of movements to inspect. Every frame and every movement actually present in each of the nine recordings must be evaluated across every recorded channel from source input through the mounted Game avatar. The gate must not select only named exercises, labelled events, peak poses, convenient windows, or the three initially reported failures. Motion outside the named matrix still requires continuous source-to-render response, ownership, amplitude, direction, timing, support, and transition checks; an unclassified or unmeasured recorded movement is a blocking coverage failure, not a pass.

Tasks:

- [x] Emit a per-recording coverage manifest proving that every source frame and every available pose, world-pose, hand, face, root, support, and transition channel was evaluated, including movements not assigned a known exercise label. The historical nine contain complete pose/world-pose but no hand, face, or blendshape channels; those missing channels remain explicit rather than inferred.
- [ ] Convert every supported matrix row into a hard source-to-final and Replay-to-mounted-Game assertion.
- [x] Remove `diagnosticLimitations` as an acceptance escape for supported root, hand, face, or body behaviour.
- [ ] Require the strengthened `0.10` clean-frame fidelity contract, independent per-segment checks, semantic torso/head proof, and rendered heel/sole/toe evidence from the visual-acceptance plan.
- [ ] Require mirror-side ownership through actual rendered VRM bones, not solver labels or scoring output.
- [ ] Fail closed for missing packet fields, missing rendered roles, skipped frames, stale fingerprints, unsupported lifecycle states, or proof-limited evidence.
- [ ] Require every recorded channel present in the packet to be processed and compared on every frame. A pose-only historical packet cannot certify hands, face, blendshapes, camera preparation, or setup provenance.
- [ ] Make the ordinary live Game path and the recorded mounted path share the same named readiness/calibration state machine, with route differences limited to physical acquisition versus immutable packet playback.

Exit criteria:

- Every supported behaviour is `passed` or `blocked`; none is silently skipped, averaged away, or recorded only as a limitation.
- Squats, lateral leg raises, and side bends cannot pass Replay certification while failing in mounted Game.

### Phase 12: Commission Once And Lock Regression Protection

Progress: 0%.

Tasks:

- [ ] After Phases 8-11 pass, run one short real-camera Game commissioning session covering the acceptance matrix and automatically save its complete packet.
- [ ] Immediately rerun that exact packet through Replay and mounted Game and compare acquisition/setup provenance plus final rendered telemetry.
- [ ] Record the reviewer, date, commit, runtime fingerprint, acquisition fingerprint, packet hash, and artifacts.
- [ ] Add the targeted, representative-subset, and final all-nine mounted Game lanes to the movement finish gate in tiered order.
- [ ] Require a new live commissioning capture only when the physical camera, MediaPipe version/options, acquisition preparation, filter profile, or setup/calibration policy changes. Shared solver or renderer repairs use the existing immutable packets.
- [ ] Include squats, both forward and lateral leg raises, side bends, head motion, arm motion, root turns, steps/jumps, support transitions, hands, and representative face/blink input in the commissioning packet; this is a minimum floor, not an allow-list.
- [ ] Capture browser-visible Replay and ordinary live Game evidence for the commissioning packet so telemetry cannot be the only product-facing acceptance proof.

Exit criteria:

- The one-time live session agrees with its Replay and mounted Game reproductions.
- Future Replay fixes are accepted only when the same packets automatically pass mounted Game.
- The user is no longer the repetitive regression harness.

## Required Proof Data

Every alignment artifact must identify:

- recording id and exact title;
- commit SHA and complete motion-pipeline fingerprint;
- input-contract ID, setup-policy ID, avatar profile, and proof mode;
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
- deterministic or uninterrupted playback mode;
- recording schema and immutable packet hash;
- detector options and acquisition/filter profile;
- camera metadata and frame orientation;
- setup policy, accepted setup indexes, readiness transitions, and calibration checksum;
- pose/world-pose, hand/world-hand, face, and blendshape channel completeness;
- mounted Game session state and lifecycle transitions;
- acquisition, setup, motion-frame, and final-render boundary checksums;
- explicit supported-behaviour coverage with no hidden diagnostic limitations.

## Acceptance Rules

The alignment slice is complete only when all of the following are true:

- Replay uses the real Game instructor and player adapters from a complete source packet.
- Capture, Replay, and Game use one versioned acquisition/filter and setup/calibration contract.
- The same source and runtime state produce the same post-input movement result.
- Replay and Game artifacts come from the current code and the same immutable packet; stale or legacy artifacts cannot be reused as acceptance evidence.
- Route origin cannot select different movement decisions or bone recipes.
- Calibration differences are deliberate, explicit, and reproducible.
- Missing or uncertain input does not masquerade as a neutral pose.
- Smoothing is time-based and consistent across render rates.
- Final rendered VRM bones, not only labels or targets, satisfy parity.
- Every comparable boundary checksum is exact and any exact difference blocks acceptance; visual tolerances are fidelity diagnostics, not a parity waiver.
- Full Motion Exercises passes exact-frame and uninterrupted proof.
- The representative subset passes before the all-nine gate is attempted.
- The final all-nine deterministic and uninterrupted gates pass on one current runtime fingerprint.
- The mounted Game proof exercises the normal setup, readiness, active-play, hold/recovery, pause/resume, and completion lifecycle without debug-only setup injection.
- Every supported body, hand, face, root, support, and lifecycle behaviour is a hard gate; no diagnostic limitation counts as acceptance.
- A one-time real-camera Game commissioning session visibly preserves Replay-accepted motion across the full behaviour matrix and is saved as a complete replayable packet.
- Rerunning that commissioning packet produces accepted Replay and mounted Game results from the same fingerprints.
- The combined gate enforces the implication: `Replay accepted -> mounted Game accepted`; otherwise the overall result is blocked.
- Node 22.13.0 repository gates pass before merge or push.

## What Not To Do

- Do not merge the Replay and Game pages merely to claim shared code.
- Do not patch Game independently to imitate Replay output.
- Do not patch Replay independently to make diagnostics look green.
- Do not add pose-specific or recording-specific bone rules.
- Do not use whole-recording averages to hide a visible reset.
- Do not run all nine recordings after every small change.
- Do not claim “same pipeline” until final timed VRM output is proven.
- Do not treat matching filter constants in duplicated hooks as a shared acquisition contract.
- Do not use a synthetic calibration or prebuilt motion frame to claim the normal Game setup lifecycle passed.
- Do not ask the user to repeat live movements while a matching complete packet can be replayed automatically.
- Do not call a supported behaviour accepted when its evidence is missing or listed as a diagnostic limitation.

## Verification Strategy

Use Node `22.13.0`.

The following command names are required outcomes of Phases 8-12; they are planned interfaces and must not be reported as available until implemented and tested:

```bash
npm run movement:acquisition-contract-guard
npm run movement:replay-game:targeted -- --packet <packet> --frame-start <n> --frame-end <n>
npm run movement:replay-game:fast-subset -- --manifest <manifest>
npm run movement:replay-game:certify -- --manifest <manifest>
```

Each command must emit one combined binary verdict. A Replay pass cannot be printed as product acceptance if its mounted Game lane is absent or failing.

During implementation:

```bash
npm run verify:env
npm run test:run -- '<focused movement tests>'
git diff --check
```

Proof order:

```text
acquisition/setup contract guards
  -> exact Full Motion Exercises packet/frame in Replay and mounted Game
  -> short timed failure window through the normal Game lifecycle
  -> complete Full Motion Exercises packet
  -> three-recording representative subset
  -> final nine-recording Replay + mounted Game certification
  -> one-time real-camera commissioning when acquisition boundaries changed
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
- Documented end-to-end alignment design: 100%.
- Shared post-input motion and final-render foundation: approximately 90%.
- End-to-end Replay-to-Game implementation: approximately 85%; eight legacy recordings show zero observed differences, but fresh current-fingerprint Replay/Game acceptance is missing.
- Shared acquisition/setup contract: approximately 85% implementation; no current complete packet has commissioned the ordinary live boundary.
- Complete record-once packet: 80%.
- Normal mounted Game-session replay: 80%; lifecycle works, acceptance identity and live equivalence remain open.
- Zero-escape supported-behaviour matrix: 65%.
- One-time commissioning and regression lock: 0% of the newly required closure phase.
- Product acceptance: blocked.

The current legacy diagnostic lane observed zero Replay/Game output differences across 10,327 active frames in eight sessions. It does not prove current-code identity because Replay captures were reused from a mismatched fingerprint, mounted Game artifacts carry no pipeline fingerprint, exact differences are not hard failures, all recordings lack hands/face/schema-v2 identity, and live commissioning remains open. The honest overall estimate is approximately **80%**.

## Immediate Next Slice

1. Complete the fingerprint file set and export the same fingerprint, commit, packet hash, input-contract ID, avatar profile, setup policy, and proof mode from Replay and mounted Game.
2. Make stale capture reuse, legacy identity, missing metadata, and every exact comparable boundary difference hard failures.
3. Extend Replay output so acquisition, setup, calibration, motion-frame, owner/root/support, instructor-rendered, player-rendered, and applied-bone boundaries can be compared one-for-one with Game.
4. Generate fresh Replay and mounted Game evidence from the same current schema-v2 packet in one command; do not pass `--allow-legacy` and do not reuse mismatched artifacts.
5. Capture one complete real-camera Game commissioning packet with pose, world pose, hands, face, blendshapes, timing, camera metadata, readiness history, and setup provenance.
6. Rerun that immutable packet through fresh Replay and mounted Game, then require exact all-boundary parity plus browser-visible review.
7. Replace or re-record `Head Roll` with both feet visible and regenerate a genuine current 9/9 certificate.
8. Add the strict targeted, representative, all-nine, and commissioning lanes to the finish gate so a Replay-only repair cannot be accepted.

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

## 2026-07-17 End-To-End Contract Implementation Checkpoint

- Stable source-frame IDs now cross recording payloads, Game adapters, Replay payloads, renderer telemetry, and proof acknowledgements; duplicate source timestamps can no longer associate a render with the wrong frame.
- Game setup frames are prewarmed once through the actual shared `VrmAvatar` application path, and successful raw source objects are applied only once. Not-ready fallbacks are never recorded as applied source frames.
- The live motion hook preserves its temporal root history across readiness and play-state changes instead of rebuilding the sequence from volatile React effect dependencies.
- Shared avatar smoothing uses a valid positive source-time delta as authoritative and falls back to render time only for repeated, missing, or backward source timestamps.
- Historical targeted diagnostic: `Turning Around in Circles` produced Replay 632/632 rendered source frames, mounted Game 632/632 processed source frames, and 572/572 active renders with zero observed output differences. It remains legacy evidence rather than current-source acceptance.
- Exact proof artifacts: `tmp/movement-replay-lab/current-replay-game-checksum-proof/px72q2e5m8pw9gctaj11yh36a989wjt7.three-party-source-time.json`, `px72q2e5m8pw9gctaj11yh36a989wjt7.mounted-game-source-time.json`, and `comparison-source-time.json` in the same directory.
- The legacy combined `movement:replay-game:nine-compare` diagnostic observed zero tolerance or exact visual-checksum differences across 10,327 active frames in eight runnable historical sessions. It reports `Head Roll` as setup-blocked rather than silently skipping it.
- This result is strong downstream evidence but not current-code acceptance: Replay captures were reused from a mismatched fingerprint, mounted Game artifacts carry no pipeline fingerprint, and every row remains `legacy-unverifiable`.
- Final repository verification under Node 22.13.0 passes lint with no errors, typecheck, 341 test files / 2,409 tests, production build, and `git diff --check`.
- `movement-player-input-v1` now owns the MediaPipe model/options fingerprint, pose/hand filter definitions, the 60-frame setup prefix, and the 12-sample neutral selector.
- Movement Capture and live Game tracking both use `prepareMovementAcquisitionFrame` and `createMovementAcquisitionFilters`; the former hand-filter divergence (`1.6` versus `2.2`) is removed in favour of the recording-compatible shared profile.
- Replay, automatic Game setup, explicit posture calibration, and mounted recorded proof now consume `buildMovementPlayerSetupFromPrefix`; the former automatic 12-frame completion path is removed.
- `movement:acquisition-contract-guard` blocks route-local filters, setup counts, direct setup construction, or MediaPipe options outside the shared contract.
- New recordings use schema v2 and preserve the acquisition profile, source/wall timestamps, camera dimensions, pose/world pose, hands/world hands, face, blendshapes, per-channel coverage, and setup-prefix provenance. Version-one recordings remain readable.
- Every retained capture frame now preserves its readiness decision, and save computes a SHA-256 hash over the complete immutable schema-v2 source envelope. Replay retains that hash with the session.
- Replay session construction retains the schema-v2 hand, face, camera, channel, setup, and input-contract evidence rather than reducing the packet back to pose/world-pose only.
- Mounted recorded Game proof now streams its setup prefix and target frame through `useMovementPlayerTracking`, then waits for `useMovementLivePlayerSetup`; it no longer injects precomputed setup/calibration or a prebuilt motion sequence below the acquisition boundary.
- Supported root-turn, hand-curl, and asymmetric-blink failures are blocking in the mounted Game behaviour gate. Both right and left approximately 45-degree lateral leg fixtures now exist at near and far camera scale.
- Verification passes under Node 22.13.0: acquisition contract guard, `npm run check` (333 test files / 2,389 tests, lint, and typecheck), production build, recording codec/replay tests, automatic setup/tracking-boundary tests, hard-gate policy tests, and `git diff --check`.
- The parity frame lifecycle was extracted into `useVrmAvatarFrameRuntime`, reducing `VrmAvatar.tsx` from 350 to 133 lines and restoring that renderer adapter to its architecture budget. The broader movement architecture audit now reports only its six pre-existing untouched line-budget failures. Source purity, route-bypass purity, 11,383-frame downstream Replay/Game parity, and all 50 stored Game visual checks pass inside that audit.
- Still blocked: a setup-valid replacement for `Head Roll`, a fresh complete canonical packet, packet-hash propagation into combined proof artifacts, the remaining zero-escape visual/mirror assertions, and one-time live commissioning.

### 2026-07-17 Renewed Mounted All-Nine Evidence

- The former `Spins` and `Walking on the Spot` blocks were harness lifecycle failures, not missing motion: the recorded source stopped at frame 59 while Game correctly waited for genuinely newer full-body frames. `Spins` becomes ready at frame 73 and `Walking on the Spot` at frame 64.
- Recorded prestart playback now advances only during the initial visibility check, waits for motion-frame acknowledgement, counts new source indexes rather than timer ticks, and stops synchronously when pause is requested. Production readiness thresholds are unchanged.
- A second fault duplicated setup frames 0-59 in `useMovementLiveMotionFrame`, shifting root history and causing 39 `Spins` root-yaw divergences. The live ref now recognises initial-sequence payloads already consumed and does not rebuild them.
- Mounted Game summary: `tmp/movement-replay-lab/current-mounted-game-nine-proof-aligned-v3/summary.json`; eight of nine pass, with complete source processing for every passing recording.
- Replay/Game comparison summary: `tmp/movement-replay-lab/current-replay-mounted-game-nine-comparison-aligned-v3/summary.json`; eight runnable recordings, 10,327 compared rendered frames, zero tolerance divergences, and zero exact checksum divergences.
- `Head Roll` contains no full-body-ready frame across its 554 frames because both feet are never simultaneously present. It must be replaced or re-recorded; the Game gate must not be weakened to manufacture a ninth pass.

## 2026-07-16 Game Runtime Repair Evidence

The following is historical downstream-runtime evidence. It does not close Phases 8-12 and must not be used as a current end-to-end acceptance claim.

- Root cause: Game Guided Preview could enter the player runtime with both calibration and retarget source model null; Replay always constructed both from a neutral prefix. The lower-body solver requires that setup, explaining why Replay squats and leg raises did not carry into Game.
- Explicit Game posture calibration and passive Guided Preview setup now use `buildMovementRecordedPlayerSetup`, the same setup builder and provenance contract as Replay.
- Live Game motion now carries source-frame root history and the resolved root frame into `VrmAvatar`; duplicate render ticks no longer dilute step, travel, turn or jump transitions.
- Player head semantics are selected by player role, not by `recorded-replay` versus `live-webcam` provenance.
- The actual Game route now has an active recorded-frame proof lifecycle. `FULL MOTION EXERCISES` frame 1559 produced matching Replay/Game body telemetry after timestamps and presentation offsets were excluded. The remaining stored-recording hand difference is input availability: Replay recordings do not retain hand/face landmarks.
- The mounted Game renderer behaviour gate passes mirrored left/right arms, mirrored left/right leg raises, approximately 45-degree leg abduction, squat/root-height response, head response, spine side bend and jumping-jack whole-body reach.
- A second real-camera failure report exposed a missing proof condition: the mounted gate used close-camera lower-body fixtures even though the player must stand farther back to fit their whole body into a laptop camera. The gate now enforces far-camera squat, both forward leg raises, lateral 45-degree leg abduction and side bend.
- Far-camera input no longer discards a complete four-segment leg chain because unrelated whole-body landmarks pull average confidence below `0.45`; per-segment applicability and the existing conservative confidence blend own the rendered legs.
- Squat depth uses vertical torso scale for camera-distance normalization, so lateral torso displacement during a side bend cannot be mistaken for a squat.
- The expanded mounted Game gate now passes with zero failures: far lateral leg-abduction direction error `0`, far squat all `6/6` lower-body segments applied with average direction error `0.3061` (matching the close-camera fixture), and far side-bend rendered spine direction `-0.6463` from source `-0.73125`.
- Repository verification passes `npm run check` with 328 test files / 2,375 tests, `npm run build`, and `git diff --check`.
- The architecture umbrella remains blocked by pre-existing line-limit debt in seven watched files; each has the same current and `HEAD` line count. The stored July 10 Replay visual manifest is also correctly stale against the new pipeline fingerprint and retains three pre-existing review-only sessions, so it is not represented as current proof.
- Not yet accepted: complete acquisition/setup and normal Game-session parity. The next real-camera check is a one-time commissioning capture after automated parity passes, not another request for the user to act as the debugging loop.

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

### 2026-07-16

- The earlier simulated-player proof did not prove the real Game player setup or active lifecycle; it cannot be used as a claim of complete product parity.
- Replay remains unchanged as the accepted source of motion truth. Repairs belong in Game input setup, shared source-frame state, or common VRM application plumbing.
- Real-camera Game confirmation is mandatory final acceptance, even after recorded, deterministic and mounted synthetic gates pass.
- The audit confirms the downstream movement frame, solver, and final `VrmAvatar` application are genuinely shared; that work is retained.
- The audit also confirms setup is not identical: Replay/debug proof uses a 60-frame prefix while automatic Game preview stops after 12 frames.
- Capture and Game result preparation remain duplicated, and hand smoothing already differs. Matching pose constants are not sufficient protection against future drift.
- The existing `FULL MOTION EXERCISES` fixture contains pose/world-pose data but not hands, face, blendshapes, camera metadata, or a versioned setup/acquisition profile.
- The mounted synthetic gate cannot certify supported behaviour while root turn, hand curl, or face blink remain diagnostic limitations.
- Product parity is reset to approximately 80% until one shared acquisition/setup contract, a complete packet, the normal mounted Game lifecycle, hard supported-behaviour gates, and a one-time commissioning capture are complete.
- The user must not be asked to repeat live motions while the record-once harness can reproduce the same boundary automatically.
