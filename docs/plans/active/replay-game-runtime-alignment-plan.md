# Replay Studio And Game Studio Runtime Alignment Plan

Last reviewed: 2026-07-18
Status: active, scope-expanded, and product-blocked. The shared post-input runtime is substantially aligned, proof identity and eight schema-v2 comparison boundaries now fail closed, schema-v3 Deep Capture adds a ninth exact dense-fusion boundary, and eight legacy recordings produced zero observed Replay/Game output differences. That historical evidence remains diagnostic rather than final acceptance because no complete current commissioning packet has yet been captured and exercised through fresh Replay and mounted Game runs. The product scope now also requires a versioned Deep Capture contract for higher-fidelity hands, wrists, fingers, face, eyes, and genuinely denser whole-body evidence; existing partial hand/face foundations do not satisfy those expanded acquisition, renderer, or proof requirements end to end.
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

For the pre-expansion pose scope, the post-input runtime and mounted recorded-Game proof route are shared. Its remaining acceptance gap is source evidence and commissioning, not a separate Game bone solver. Deep Capture adds new shared acquisition, application, performance, and proof work described below.

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

## Deep Capture Scope Expansion

“Deep Capture” means materially more source evidence than the existing 33-point pose skeleton. It must not be implemented by merely interpolating extra points between the current pose landmarks and labelling those points as observed.

The expanded acquisition contract is a hybrid:

```text
physical RGB frame
  -> high-rate 33-point pose skeleton
  -> high-resolution left/right hand crops
  -> high-resolution face/eye crop
  -> lower-cadence dense-body estimator
  -> temporal identity, confidence, and occlusion fusion
  -> immutable schema-v3 Deep Capture packet
  -> shared setup/calibration and movement-game-runtime-v1
  -> Replay + mounted Game + final rendered-VRM proof
```

The packet must label the origin of every signal:

- `observed`: returned directly by the active detector from the current image;
- `model-estimated`: inferred by a dense body, face, gaze, depth, or orientation model from the current image;
- `temporally-tracked`: carried from an earlier observation with age and decay metadata;
- `derived`: calculated from other packet fields, such as a palm normal, wrist twist, joint angle, surface normal, or contact estimate.

No derived or temporally tracked point may be counted as a newly observed body point. Missing, occluded, low-resolution, or ambiguous evidence must remain explicit and confidence-gated.

### Hands, fingers, and wrists

The Deep Capture hand contract must preserve, per anatomical side:

- all 21 hand landmarks in image and world coordinates, model-level detection/presence/tracking confidence, per-point quality where the selected model supports it, detector-provided handedness, and the pose-wrist association used to resolve conflicts;
- a native-resolution hand region of interest and crop transform so hands are re-detected at useful pixel size even when the whole body is far from the camera;
- thumb plus four-finger MCP/PIP/DIP/tip flexion, extension, spread/abduction, opposition, and curl evidence;
- wrist flexion/extension, radial/ulnar deviation, pronation/supination, and a signed palm normal;
- explicit `palm-facing-camera | palm-facing-away | edge-on | unknown` classification with confidence, never a guess from a single 2D point;
- occlusion, clipping, inter-hand overlap, reassociation, and reacquisition status;
- final rendered hand, wrist, and every available finger-bone transform after VRM application.

Current code retains hand image/world landmarks and applies finger rotations, but it assigns detected hands by pose-wrist proximity and deliberately does not apply the solved wrist rotation. Deep Capture must retain detector handedness as evidence, reconcile rather than discard disagreement, and add a reviewed wrist swing/twist application path shared by Replay and Game.

### Face, eyes, and expression

The Deep Capture face contract must preserve:

- every dense face landmark returned by the selected model, including eye contours and iris landmarks when available;
- all model-returned expression/blendshape coefficients rather than only the small current blink, jaw-open, and smile subset;
- the facial transformation matrix when the selected runtime supports it;
- bilateral blink, squint, eye-wide, brow, cheek, mouth-corner, jaw, lip, and asymmetric expression ownership;
- per-eye gaze direction and a fused gaze target, clearly labelled `model-estimated` or `derived` rather than directly observed;
- head/face orientation, eye visibility, glasses/occlusion status, crop resolution, and per-channel confidence;
- final rendered eye-look, eyelid, jaw, mouth, and supported VRM expression weights.

The current face detector already requests blendshapes but disables facial transformation matrices, and the renderer consumes only a narrow expression subset. Deep Capture must widen both storage and application proof without letting a face/eye failure invalidate otherwise trustworthy body evidence.

### Genuinely denser whole-body capture

The existing 33 pose landmarks remain the high-rate skeletal baseline, but they are not sufficient to describe rotation or surface motion across the chest, back, abdomen, shoulders, upper/lower arms, pelvis, thighs, calves, shins, hands, and feet.

The target dense-body channel is browser-native and on-device:

- a body segmentation/silhouette result with source-image dimensions and confidence;
- a reviewed browser-native segmentation or dense correspondence model that runs entirely in the client browser with no raw-frame upload;
- approximately 200-500 persistent, anatomically labelled surface anchors sampled across the visible body, not thousands of raw model vertices sent directly to the avatar;
- stable anchor identity, body region, anatomical side, front/back ownership, source coordinates, confidence, occlusion state, observation origin, and temporal age; depth and surface normal remain optional capabilities and must never be invented when the browser model cannot measure them;
- extra hand/foot contact contours and heel, sole, toe, knuckle, palm, elbow, knee, shoulder, chest, back, pelvis, thigh, calf, and shin surface coverage;
- fusion with the 33-point skeleton so dense evidence improves twist, surface orientation, contact, and occlusion diagnosis without replacing the stable skeletal owner contract.

Production candidates are limited to models that run locally in the client browser through WebGL, WebGPU, or WASM. The implementation spike must record supported devices, model size, frame time, memory, licence constraints, camera-distance behaviour, occlusion recovery, and accuracy before a production dependency is approved. The minimum device matrix must include a representative iPad and an older laptop; a result measured only on the development Mac cannot approve a model.

Rejected research checkpoint (2026-07-18): Detectron2/DensePose is server/PyTorch oriented, SMPL-X introduces a separate commercial model-licence decision, and a DensePose plus Depth Anything service would require raw-frame processing outside the client. Those routes violate the agreed client-browser product boundary and are not implementation options for this plan. MediaPipe Pose segmentation and browser-native semantic models may still be used honestly for additional visible-body coverage without claiming full 3D geometry.

Post-soak browser decision checkpoint (2026-07-18): the measured BodyPix MobileNet candidate adds browser-native semantic body coverage, but it is not yet approved because the benchmark has only run on the development machine. It does not provide true depth or surface normals, and the product must describe those fields as unavailable rather than turning that limitation into a server dependency.

- Do not build or benchmark a server-GPU, external-frame-processing, DensePose, Depth Anything, or SMPL-X product path under this plan.
- Do not require true depth or 3D normals to approve useful additional browser-native body coverage. Require honest capability labels and keep the 33-point world-pose skeleton as the stable 3D bone owner.
- Use adaptive input resolution and cadence tiers so dense semantic capture cannot freeze the camera, hands, face, Replay Studio, or Game Studio on a lower-powered device.

The next implementation step is a browser-device qualification pass: measure the existing browser-native candidate on a representative iPad and older laptop, define automatic high/medium/low capture tiers, and keep the dense channel disabled or reduced when it would break interactive frame budgets. Replay Studio and Game Studio must consume the same honestly labelled packet at every tier.

Dense inference may run at a lower cadence than pose, hands, or face. Every channel therefore needs its own source timestamp, inference timestamp, cadence, age, confidence, and fail-closed coverage accounting. Temporal tracking may bridge dense updates but cannot manufacture accepted observations.

### Packet, privacy, and runtime boundary

This expansion requires an explicit schema v3 and a new acquisition-profile ID. Schema v2 remains readable as legacy evidence but cannot certify Deep Capture. A schema-v3 packet must include the complete setup/readiness prefix and immutable hashes plus the new hand-orientation, facial-transform/gaze, dense-body, segmentation, provenance, cadence, and coverage fields.

Raw RGB frames or source video must not be persisted by default. The normal commissioning packet stores derived landmarks, masks or compact surface anchors, confidence/provenance, timing, and hashes. Persisting identifiable source imagery requires a separate explicit product/privacy decision, retention policy, and user consent.

Replay, mounted Game, and live Game must consume the same versioned normalized packet below the physical detector boundary. Dense capture must not become a Capture-only diagnostic, a Replay-only visualizer, or a Game-only correction path.

### Live acquisition observability

Before recording starts, the capture page must show per-channel evidence rather than one generic “ready” state:

- pose: observed points out of 33 and required full-body regions;
- left/right hands: observed points out of 21, crop resolution, handedness confidence, palm orientation confidence, and wrist evidence;
- face/eyes: dense landmark, iris/gaze, facial transform, and blendshape availability;
- dense body: sampled anchors observed/tracked out of the configured target, region coverage, cadence, age, and segmentation quality;
- setup/readiness: accepted prefix frames, camera metadata, clipping, source timing, and exact blocking reasons.

The recorder may start with an explicitly declared reduced capability only when the requested proof profile allows it. A commissioning or Deep Capture acceptance profile must fail closed when any required channel is missing.

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

Progress: 85%. The downstream contract is named and shared, and the complete movement library, hooks, Game lifecycle/components, Replay lifecycle, capture page, and final avatar application now participate in the proof fingerprint. A fresh complete packet still has to prove the serializable contract end to end.

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

Progress: 75%. New Replay and mounted Game capture artifacts export matching code and packet identity plus eight raw runtime boundaries, the comparator rejects missing/stale identity and any exact boundary drift, and one command now orchestrates fresh Replay, mounted Game, and comparison. A genuine complete packet and normal live Game commissioning remain open.

Tasks:

- [x] Make Replay execute the named Game player/instructor runtime contract rather than ask the user to locate movement failures manually.
- [ ] Require exact source identity, a complete current runtime fingerprint on both artifacts, runtime-lane identity, and complete frame accounting. Legacy diagnostic runs currently lack these acceptance fields.
- [x] Require deterministic final-bone proof, intended-time neutral-reset/jerk proof and independent paired-role proof.
- [x] Run the combined gate across all nine acceptance recordings and return a machine-readable pass/fail report.

The automated handoff is incomplete until the same complete packet can be run through Replay and the normal mounted Game session and produce one binary result. Human live-camera viewing is a one-time commissioning check for acquisition changes, not the recurring movement-debugging loop.

### Phase 8: Establish One Shared Acquisition Contract

Progress: 90%. Shared preparation, filters, setup policy, schema provenance, and the expanded runtime fingerprint are implemented and focused tests pass. No current full-channel packet has yet proven byte-equivalent live and replayed acquisition/setup output.

Tasks:

- [x] Extract one shared result-preparation module used by Movement Capture and Game player tracking for pose, world pose, hands, face landmarks, blendshapes, timestamps, and camera metadata.
- [x] Create one versioned detector/filter profile and shared filter factory; remove route-local pose, hand, and face filter constants.
- [x] Create one named setup policy with the same accepted-frame count, neutral-selection rules, timeout, readiness semantics, and calibration builder in Replay and Game.
- [x] Replace route-owned numeric setup limits, including the former 60-versus-12 divergence, with that policy.
- [x] Add an architecture guard that fails on new route-local acquisition filters, setup lengths, or calibration construction.
- [x] Include detector options, filter profile, setup policy, and calibration builder versions in the recording/runtime provenance.
- [x] Extend the pipeline fingerprint to every movement library and hook plus the Game lifecycle/components, Replay lifecycle, capture page, and final application hook, with a regression requiring the previously omitted live tracking, automatic setup, input-contract, and frame-runtime owners. The architecture guard remains a separate drift gate.

Exit criteria:

- The physical camera and recording decoder are the only different acquisition components.
- Given the same MediaPipe result sequence, Capture, Replay, and Game produce byte-equivalent normalized acquisition packets and setup/calibration provenance.
- A pose, hand, face, setup, or calibration change cannot land in one route without failing the guard.

### Phase 9: Record One Complete, Replayable Input Packet

Progress: 85%. Schema v2, per-frame readiness history, channel/provenance preservation, SHA-256 packet integrity, Replay-session schema propagation, and proof-artifact identity are implemented; a current complete canonical commissioning capture remains open.

Tasks:

- [x] Define recording schema v2 with pose, world pose, left/right hands and world hands, face landmarks, blendshapes, source and capture timestamps, frame dimensions/orientation, camera metadata, confidence, detector/filter profile, and setup provenance.
- [x] Preserve the actual setup prefix and readiness transitions rather than storing only post-setup movement frames. Every retained frame now stores the readiness decision that accompanied it, including the 60-frame setup prefix.
- [x] Record the source packet before movement decisions so future repairs can rerun the unchanged input through current code.
- [x] Validate channel completeness at save time; unsupported or missing channels remain explicit and cannot be counted as passing evidence for that behaviour.
- [ ] Capture or migrate a canonical acceptance set. Keep `FULL MOTION EXERCISES` as the named whole-body control, but do not pretend its current pose-only payload proves hands, face, or live camera preparation.
- [x] Hash the immutable packet and retain its schema/profile versions in every proof artifact. Save hashes the complete schema-v2 envelope with SHA-256; Replay sessions and both combined proof artifacts now preserve and enforce schema version, packet hash, input/setup IDs, channel summary, and per-frame readiness.

Exit criteria:

- The same saved packet can reconstruct what the Game player knew, in order, without future frames or synthetic calibration.
- Missing hands, face, camera, timing, or setup evidence blocks the corresponding supported behaviour instead of becoming a diagnostic limitation.
- The user performs a motion once for commissioning; subsequent debugging and certification use the saved packet.

### Phase 10: Replay Through The Normal Mounted Game Session

Progress: 85%. The mounted historical lifecycle, frame acknowledgement, setup-prefix handling, start gate, pause/resume, rendered accounting, fail-closed identity, and exact eight-boundary comparison are implemented. Eight legacy recordings produced 10,327 active frames with zero observed output differences under the former narrower comparator. Closure remains blocked because no fresh complete schema-v2 packet exists locally to exercise the strengthened contract and the ordinary live-camera setup/calibration path has no commissioning packet.

Tasks:

- [x] Add a recorded source provider at the physical-camera boundary of the real Game route; do not inject a prebuilt motion frame or precomputed calibration.
- [x] Mount the actual Game route and prove its normal lobby/setup, readiness, match start, active play, scoring completion, pause/hold, and resume transitions.
- [ ] Exercise missing-input hold/recovery with a dedicated packet fixture through the same mounted lifecycle.
- [x] Feed every packet frame at its recorded source time and require complete processed-source and rendered-frame accounting. The mounted run passed 632/632 processed source frames and 572/572 active rendered frames; the 60 setup frames are deliberately processed before the avatar scene mounts.
- [ ] Run fresh Replay and mounted Game from the same immutable packet, avatar profile, setup policy, commit, and complete runtime fingerprint. The latest Game run is current, but its Replay comparisons reused captures from a different fingerprint.
- [x] Export raw comparable acquisition, setup, calibration, motion-frame, owner/root/support, instructor-rendered, player-rendered, and final applied-bone boundaries from both routes. Mounted Game also exports a declared checksum for each boundary; the comparator recomputes and requires exact one-for-one equality for all eight boundaries.
- [x] Seed mounted Game's live motion runtime from the same collected 60-frame setup prefix and require a fresh motion-frame render acknowledgement before associating an avatar render with a source index. At frame 60, Replay and Game now match exactly for head input/application, body confidence, spine drive, retarget decisions, hands/expressions, and applied avatar spine.
- [x] Make Replay and mounted Game use a deterministic source-time final-render lifecycle. Route presentation offsets are normalized, while feet, floor contact and every compared final VRM segment remain tolerance-checked.
- [x] Advance recorded prestart input only while the normal Game gate is checking visibility, count genuinely new source indexes as fresh checks, and acknowledge each prestart frame before publishing the next. This repairs the former frame-59 deadlock without weakening production readiness rules.
- [x] Prevent the live motion runtime from consuming the 60-frame setup prefix twice when the current live ref initially repeats the last setup payload. This removes shifted root-turn/contact history and restores exact Spins parity.
- [x] Derive the comparable active range from the Game-reported `activeFrameStartIndex`; setup and prestart frames are explicit lifecycle evidence rather than hidden or hard-coded exclusions.
- [x] Expand the pipeline fingerprint to cover every movement library and hook plus the Game lifecycle/components, Replay lifecycle, capture page, and final VRM application, including `useMovementPlayerTracking.ts`, `useMovementLivePlayerSetup.ts`, `movementPlayerInputContract.ts`, and `useVrmAvatarFrameRuntime.ts`.
- [x] Export the complete pipeline fingerprint, input-contract ID, source packet hash, commit, avatar profile, setup policy, runtime contract, and shared parity proof mode from new Replay and mounted Game artifacts.
- [x] Reject reused Replay captures unless their complete fingerprint, commit, packet hash, input contract, setup policy, avatar profile, runtime contract, and parity proof mode exactly match both the current code and the Game run. Legacy or missing identity remains diagnostic-only and cannot pass.
- [x] Make any exact comparable boundary-checksum difference a hard failure. Tolerance analysis may diagnose visual fidelity, but it cannot waive Replay/Game identity.
- [ ] Remove `--allow-legacy` from acceptance commands. Legacy sessions may remain diagnostic controls but cannot produce product acceptance.
- [ ] Exercise the ordinary live Game calibration/readiness path with a complete saved camera-boundary packet; debug recorded-source readiness must not stand in for this final proof.
- [x] Add `movement:replay-game:packet-proof`, which rejects legacy/incomplete packets before browser startup, captures fresh deterministic three-party Replay and uninterrupted mounted Game artifacts, runs the exact eight-boundary comparator, and writes one binary summary.
- [x] Add `/demos/movement-capture?commissioning=1`, which blocks saving unless the packet has schema-v2/input/setup identity, a complete setup prefix, a ready capture start, readiness on every retained frame, and non-empty pose/world-pose/hand/face/blendshape/camera evidence. Successful commissioning saves remain on the page and expose the immutable recording ID for the proof handoff.
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

### Phase 12: Make Capture Start Reliable And Lock The Deep Contract

Progress: 98%. The timed one-shot start check has been removed: Record now arms indefinitely and starts as soon as full-body readiness arrives, with explicit `ARMED - NOT RECORDING YET`, `RECORDING - N MOMENTS SAVED`, and failed-start states. The record-to-save regression passes, live channel preflight exposes exact current and Deep Capture evidence, face counting no longer applies Pose visibility semantics to valid Face Landmarker coordinates, dense-body readiness cannot contradict missing-region output, and schema v3 has a versioned profile, packet builder/parser, channel summaries, privacy defaults, fail-closed save mode, and cross-route profile guard. Once recording is active, every detected pose frame is retained with its real readiness and channel evidence; temporary occlusion is no longer silently deleted. Palm/wrist, bilateral gaze, and native-crop refinement report observed evidence rather than `planned`.

Tasks:

- [x] Replace the timed countdown and one-shot visibility check with an untimed armed state that continuously observes readiness and starts automatically whenever the whole body becomes ready. Make the not-recording, armed, active-recording, and failed-start lifecycle states visually unambiguous.
- [x] Add a page-level regression that clicks Record, completes the countdown, starts frame retention, records at least the minimum duration, stops, and reaches the save dialog without requiring the user to approach the camera. The regression retains 180 frames and reaches the save dialog.
- [x] Add live per-channel observability for pose, both hands, wrist/palm orientation, face, eyes/gaze, dense-body coverage, camera, setup prefix, and readiness. Current channels report exact counts; wrist/palm and gaze switch to observed counts only when their new evidence exists, while dense body remains explicitly `planned`.
- [x] Freeze the schema-v3 field vocabulary, observation-origin labels, per-channel cadence/age rules, coverage rules, and privacy boundary. `movementDeepCaptureContract.ts` owns the typed schema and 200-500-anchor contract.
- [x] Add a capability profile that distinguishes ordinary pose capture from required Deep Capture commissioning. Ordinary saves remain schema v2; `/demos/movement-capture?deepCapture=1` builds, hashes, validates, and stores schema v3 only when the complete required profile passes.
- [x] Make the start/save gate list exact missing channels and regions. Do not report generic visibility failure when the whole body was present but a hand, face, eye, dense-body, or lifecycle requirement was missing. The live preflight now distinguishes coarse from native-crop-refined hand/face evidence, reports exact channel counts, and the schema-v3 validator names frame/channel/region failures before upload.
- [x] Add architecture tests preventing Capture, Replay, and Game from owning different Deep Capture profiles or coverage thresholds. `movement:acquisition-contract-guard` now locks the one profile ID, schema, 200-500 threshold, capture builder/validator, Replay conversion/runtime carriage, shared source field, and Game runtime carriage.

Exit criteria:

- The record button reliably produces retained frames and a saveable packet after the countdown.
- A failed start or save identifies the exact channel, region, confidence, age, or lifecycle reason.
- The user is not asked to perform another session until the start regression and on-screen preflight both pass.

### Phase 13: Capture And Render High-Fidelity Hands, Wrists, Face, And Eyes

Progress: 78%. The shared acquisition path retains detector handedness and pose-wrist reconciliation, records native-frame hand/face ROI transforms, and now runs dedicated image-mode hand and face models against those crops behind Deep Capture mode. Crop-relative results map back into native source-frame coordinates, anatomical side remains owned by the pose-wrist association, slow inference triggers dynamic cadence backoff, and carried results expire after 150 ms with explicit `temporally-tracked` provenance. Brief detector loss no longer disables that carry merely because the current coarse ROI disappeared. Hand and face evidence now records `observed`, `temporally-carried`, or `reacquired` state plus explicit occlusion; eye visibility is bilateral and fail-closed, while eyewear remains explicitly `unknown` because the current model cannot honestly classify glasses. Capture preflight exposes carried/reacquired state instead of silently showing old evidence as current. The capture retains 21 image/world hand points, derives fail-closed palm/wrist and 15 finger-joint signals, enables facial transformation matrices, and derives bilateral plus fused gaze. The shared renderer applies wider VRM eye/expression targets and a confidence-gated, bounded wrist target only for Deep Capture evidence, with mirrored player hand ownership exchanged exactly once. A new immutable frame test passes recording-to-Replay conversion and the live-source Game adapter through the same player runtime and actual final VRM writers, proving exact equality across at least 30 bilateral wrist/finger rotations and five eye/expression writes. Deterministic guards now cover crossed-hand disagreement, camera-boundary crop clamping, edge-on palms, incomplete/occluded irises, low-resolution crop sizing, carry without a current ROI, reacquisition state, and stale carry expiry. Real RGB occlusion/reacquisition fixtures, device measurements, and browser-mounted full-sequence Replay/Game rendered proof remain open.

Tasks:

- [x] Add two-stage native-resolution hand/face crops and preserve all 21 image/world landmarks for each hand with handedness, crop transform, confidence, and temporal identity. Dedicated `IMAGE`-mode refiners use native camera ROIs, bounded 192/256-pixel minimum inputs, source-frame remapping, one-batch scheduling, duration-based backpressure, and a 150 ms fail-closed carry window. Schema-v3 commissioning and live preflight now reject coarse-only hand/face evidence.
- [x] Reconcile detector handedness with pose-wrist proximity; retain disagreement as evidence instead of silently assigning one result.
- [x] Derive palm normals and wrist swing/twist with degeneracy checks, camera-facing classification, confidence, explicit `unknown` output, and `derived` provenance.
- [x] Apply reviewed wrist rotations and full supported finger articulation through the shared VRM path, with anatomical ownership resolved exactly once. Existing finger targets remain shared; wrist targets require non-unknown Deep Capture orientation at confidence 0.5 or higher, use bounded 0.35 interpolation, remain off for legacy evidence, and exchange sides with the facing-player display transform.
- [x] Enable and preserve facial transformation matrices when supported, retain all dense face/iris landmarks and all model blendshapes, and add explicit per-eye/fused gaze provenance.
- [x] Expand shared VRM expression and eye-look application beyond blink/jaw/smile while preserving asymmetric left/right ownership. The shared final writer now maps bilateral eye look, surprise, anger, sadness, pucker/funnel/stretch mouth shapes, and the existing asymmetric blinks.
- [ ] Add occlusion, edge-on palm, crossed-hand, glasses/eye-occlusion, reacquisition, and low-resolution fixtures.
- [ ] Add actual-renderer bilateral hand/wrist/finger/eye/expression proof in Replay and mounted Game with zero silent skips.

Exit criteria:

- Both palm-facing directions, wrist rotations, representative individual finger motions, blinks, gaze directions, and asymmetric expressions are measured, replayable, and visibly applied.
- Missing or ambiguous hand/eye evidence is visible and never converted into a confident pose.
- Replay and mounted Game produce exact packet/runtime boundary checksums and accepted final rendered transforms for the same supported frames.

### Phase 14: Add Dense Whole-Body Surface Capture And Fusion

Progress: 99%. The explicit Deep Capture lab can request MediaPipe's model-produced segmentation mask, immediately encode it as compact RLE with source/mask dimensions, confidence, timing, provenance, and zero invented anchors, and show `segmentation ready / 0 of 200 anchors` in preflight. A model-neutral `movement-dense-capture-adapter-v1` boundary requires a model SHA-256, runtime/timing/input metadata, 200-500 unique persistent anchors, explicit configured-region state, valid image/depth/normal/provenance fields, and fail-closed commissioning validation. The shared capture hook accepts a selected adapter, copies the current camera frame into an isolated model-sized canvas, runs one asynchronous request at a time, validates descriptor/result hash, model id, runtime, and dimensions before publication, and otherwise leaves segmentation/skeletal capture intact. Reduced-rate scheduling dynamically backs off slow inference; temporal fusion can carry a complete prior measurement for at most 300 ms with decayed confidence, `temporally-tracked` origin, and occlusion truth, then removes it. A versioned `movement-dense-capture-fusion-v1` layer now joins accepted anchors to the retained 33 image/world pose points without transferring skeletal ownership. It accounts for every configured region as current, tracked, occluded, or missing; keeps observed, model-estimated, derived, and temporally tracked counts separate; derives torso-twist only from non-occluded current surface normals; and emits foot-contact eligibility with image-floor proximity rather than inventing a calibrated contact verdict. Live preflight and schema-v3 commissioning require a valid state for every region but do not discard an otherwise valid visible-surface measurement merely because one invisible or unresolved region is explicitly `missing`. A shared `movement-dense-capture-proof-v1` snapshot now gives Replay and mounted Game the same compact ninth schema-v3 comparison boundary: exact model identity, persistent-anchor identity checksum, regional coverage, observation/estimated/tracked/derived/occluded counts, retained skeleton coverage, torso twist, and foot-contact candidates. The comparator requires and checks that boundary only for Deep Capture, retaining all eight schema-v2 boundaries unchanged. Unit boundary proof preserves exact dense model identity and each frame's anchor IDs through schema/recording conversion, Replay, the shared source boundary, and mounted Game proof packets; it no longer requires the entire visible anchor set to be identical between frames because visibility changes. `/demos/movement-capture/benchmark` provides an explicit-consent, local-download-only capture workflow for all six required RGB scenarios with a five-second walk-back countdown, ten-second takes, accepted browser-format selection, deterministic scenario filenames, manual re-download, no Convex mutation, and no movement-packet upload. `movement:dense-capture:benchmark:ingest` now finds the newest complete six-file download set, requires a second explicit consent, copies rather than moves the originals, rejects empty/unrelated files, and reports byte counts plus SHA-256 hashes. `movement:dense-capture:benchmark:prepare` then inventories the private copies and writes no manifest without complete scenario coverage; `movement:dense-capture:benchmark` refuses model approval without real clips, at least two measured candidates, per-clip results, licence/size/warm-up/median/p95/memory/thermal/device evidence, and a measured selection. Six representative RGB clips were recorded on 2026-07-18, copied non-destructively into the private benchmark workspace, individually SHA-256 hashed, and accepted as a complete six-scenario manifest. The executable loopback-only browser runner measured two pinned official BodyPix variants against five frames from every clip. The renewed anchor-aware run completed MobileNet inference on all 30 frames at 55.2 ms median and 61.3 ms p95, produced exactly 400 samples on every frame, and measured median stable-ID retention from 30.5% during the front/back turn to 70% during body occlusion. Only one of 30 sampled frames contained all 21 configured semantic regions at once; per-view misses included hands, calves, shoulders, chest/back during turning, and cropped leg/foot regions near the camera. That result corrected the former per-frame all-region rule: missing visible-model regions are now retained as explicit fusion state instead of causing 29 valid frames to vanish or encouraging fabricated back-side anchors. ResNet50 again exceeded the 90-second model-load budget and remains rejected. A dedicated MobileNet-only sustained lane then ran three complete six-clip cycles: 90 samples at 55.0 ms median and 63.7 ms p95, with cycle medians of 57.1, 55.4, and 52.3 ms, a 0.916 final-to-first latency ratio, zero TensorFlow tensor-memory growth, and a 4.96 MB peak. The soak gate passed, while its status remains `automated-soak-complete` rather than reviewed physical thermal evidence. The measured MobileNet candidate is instantiated only when `deepCapture=1`: before model loading it re-downloads and SHA-256 verifies the exact 2,658,079-byte manifest-plus-shard identity, then runs WebGL part segmentation and samples at most 400 deterministic part-relative anchors. Those anchors preserve detector anatomical left/right and front/back labels, subdivide visible torso, shoulder, shin, and calf regions, use `model-estimated` provenance, and deliberately keep depth and 3D normal `null` because BodyPix cannot measure either. The real capture path now starts conservatively from browser device memory, CPU concurrency, and iPad detection, then promotes after five sustained fast samples or demotes after two repeated slow samples across explicit high `960x540/100ms`, medium `640x360/180ms`, and low `384x216/300ms` tiers. Every dense frame records its tier, input dimensions, cadence, inference timing, and browser runtime; commissioning rejects server runtimes or inconsistent tier metadata, and the capture UI exposes the live tier without changing pose, hands, face, or recording controls. A new `/demos/movement-capture/benchmark/device` workflow accepts an existing local video on a declared iPad or older laptop, runs at least sixty adaptive samples across a sustained two-minute browser soak, and downloads only model/device measurements in a `measured-awaiting-review` JSON report. Every sample carries monotonic elapsed time so the duration can be reconstructed; the report also records browser model startup time, first/last-window latency drift, and TensorFlow start/end/peak bytes and tensor counts. After the run, the page requires the user to record whether the physical device stayed cool, became warm but responsive, or became hot/slow/unstable before enabling download; the outcome, optional note, and post-run timestamp are bound into the report. Supported iPad browsers can Share or AirDrop that exact JSON-only artifact directly to the commissioning Mac, while unsupported browsers retain the identical download path; neither transfer contains the selected video. The selected video name and contents are not included in that report and are never uploaded. `movement:dense-capture:device-review` independently recomputes both reports from all raw samples, rejects modified summaries, short or non-monotonic timelines, latency drift above 1.5, TensorFlow memory growth above 5 MB, tensor-count growth above two, raw-video fields, missing hashes, different model identities, or incomplete device classes, proves the real iPad/laptop browser class, requires a valid post-run physical observation embedded in each report, rejects hot/slow/unstable outcomes, promotes the worst-device startup/latency/memory measurements, and only binds reviewed evidence to the exact benchmark candidate after a named reviewer, ISO review time, and explicit physical-review confirmation. `movement:dense-capture:device-ingest` now locates the newest complete Downloads pair, strictly validates both before copying, preserves the originals, refuses overwrites, and writes hashes into a private ingest manifest. `movement:dense-capture:device-finish` combines that ingest with the named, time-bound physical review and worst-device candidate promotion behind both explicit consent flags. Production approval still requires the actual reports and full-sequence rendered proof; candidate selection remains deliberately pending until those real evidence lanes pass.

Tasks:

- [ ] Measure browser-native candidates only against representative near/far camera, turning, floor-work, occlusion, and loose-clothing clips. DensePose, Depth Anything services, SMPL-X, and external GPU processing are explicitly out of scope.
- [ ] Record model licence, download size, warm-up, WebGL/WebGPU/WASM support, median/p95 inference time, memory, thermal behaviour, and reviewed results from a representative iPad plus older laptop before selection.
- [x] Add automatic high/medium/low browser quality tiers for input resolution and dense inference cadence, while pose, hands, face, recording controls, and the UI remain responsive. The runtime starts conservatively from device signals, promotes only after sustained fast samples, demotes after repeated slow samples, records the chosen tier in every dense frame, and rejects server or inconsistent tier evidence at commissioning.
- [x] Add a private physical-device benchmark workflow that uses an existing local video, runs at least sixty adaptive browser samples across a sustained two-minute soak, records latency drift, TensorFlow memory, and a post-run physical observation, transfers no raw video, and produces an explicit `measured-awaiting-review` report for either iPad or older-laptop review. Download and supported Web Share/AirDrop paths use the same timestamped JSON-only report; the consent-gated ingest copies the newest valid two-device pair without moving or overwriting Downloads originals.
- [x] Add a strict two-device review command that re-hashes and recomputes the iPad and older-laptop reports, proves the physical browser/device class, reconstructs their sustained timelines, applies latency and TensorFlow-memory leak ceilings, records model startup time and mandatory physical thermal observations, promotes the worst-device measurements, forbids embedded video data, requires exact model identity, and cannot promote the device evidence without explicit reviewer confirmation. `movement:dense-capture:device-finish` performs preserved ingest plus strict review in one command and refuses missing consent, stale destinations, invalid benchmark evidence, or failed promotion.
- [ ] Add body segmentation and the selected dense-model output to the shared acquisition profile. Segmentation is implemented behind the explicit Deep Capture lab and remains only partial until the selected correspondence model supplies persistent anchors and a verified model hash.
- [ ] Produce approximately 200-500 persistent semantic or surface anchors across all configured regions with region/side/front-back identity, confidence, occlusion, origin, cadence, and age. Store depth and normals only when the selected browser model genuinely provides them.
- [x] Add versioned skeleton/dense diagnostic fusion that preserves 33-point bone ownership, separates current/tracked/occluded/missing region evidence, derives twist only from current normals, and treats foot evidence as contact candidates until a calibrated temporal contact decision exists.
- [ ] Fuse dense anchors with the 33-point skeleton and hand/face channels without changing anatomical side ownership or treating temporal interpolation as observation.
- [ ] Use the dense channel to improve twist, palm/body facing, surface/contact, clipping, and occlusion diagnosis; keep final avatar bone decisions inside the shared motion runtime.
- [x] Define reduced-rate scheduling, frame-budget backpressure, fallback to skeletal capture, and recovery without blocking the UI thread. The asynchronous adapter runs one request at a time, dynamically backs off from measured duration, preserves ordinary skeletal capture on failure, and carries only validated evidence for 300 ms.
- [ ] Add immutable fixtures and full-sequence proof for front/back turns, torso/limb twist, floor contact, body-region coverage, dense-update gaps, and occlusion recovery.

Exit criteria:

- The saved packet contains genuinely more measured/model-estimated evidence across the body than the 33-point pose skeleton.
- Every configured body region has explicit observed/tracked/missing coverage and persistent anchor identity.
- A representative iPad and older laptop meet the supported-device budget at an automatic quality tier; development-Mac evidence alone cannot pass.
- No raw camera frames leave the browser, and no accepted runtime depends on a server GPU or separately licensed parametric body model.

### Phase 15: Commission Once And Lock Deep-Capture Regression Protection

Progress: 90%. The existing record-once commissioning command now has an explicit Deep Capture mode and dedicated package command. The canonical `?commissioning=1&deepCapture=1` route now resolves to one schema-v3 save requirement instead of sending mutually exclusive schema-v2 and schema-v3 flags and rejecting an otherwise valid take before upload. A successful proof-mode save displays the exact stored recording ID, schema profile, and its direct Replay/Game proof command. A complete 60-frame schema-v3 save regression now exercises readiness, both hands and world hands, finger articulation, palm orientation, face/iris/gaze, segmentation, 200 persistent anchors, fusion, camera identity, hashing, JSON upload, `storage-json-v3` metadata, and the returned immutable recording ID. Packet construction is now shared by cloud save and a proof-mode local backup button: after a valid take the user can download the exact hashed derived-tracking JSON without raw video or images, even if upload fails, while the frames remain in the open save dialog. `movement:replay:recover-local-packet` validates that preserved schema-v2/v3 source without moving or deleting it, rebuilds the normal Replay session, and requires the recovered session to pass the complete shared Replay/Game packet preflight with zero failures. `movement:replay-game:deep-local-proof` composes that recovery with fresh Replay and the mounted Game proof, supports a safe preflight-only mode, and is printed in the browser save dialog after download. A backend acceptance test also takes the exact browser-emitted JSON, reloads it through the stored-recording Replay conversion, and requires zero failures from the same fail-closed Deep Capture packet validator used before Replay and mounted Game launch; the acquisition guard locks both recovery paths as well as the validator and storage-format boundary. `movement:replay-game:deep-latest-proof` now creates or reuses an export, inventories every saved movement, selects the newest eligible schema-v3 packet by stored creation time, and routes that immutable ID into the existing combined proof. It fails before either browser when only legacy or incomplete packets exist and explicitly retains them. Recording export preserves the schema-v3 profile, deep-channel accounting, per-frame acquisition profile, refinements, dense adapter/model identity, anchor IDs, and an opaque physical-camera fingerprint; the raw browser device id and label are not persisted. That camera identity now survives stored-packet conversion into Replay and the mounted Game source boundary. Deep-channel proof now requires explicit measured coverage rather than the physically impossible rule that both hands, face, gaze, segmentation and dense anchors be visible on every natural-motion frame: hands/palms require at least 15 frames and 10% of a take, face/gaze at least 30 frames and 50%, and segmentation/dense body at least 30 frames and 80%. Every source frame is still retained and accounted for; any evidence that is present is validated fail-closed, invalid or ambiguous claimed evidence still blocks, and coverage below the declared floor blocks. The same coverage-aware validator powers browser save and the no-browser Replay/Game eligibility command, while schema-v2 commissioning remains compatible and explicitly separate. Its report compacts repeated per-frame failures into counted frame ranges, retaining the total raw failure count without generating multi-megabyte unreadable inventories for legacy recordings. `movement:replay-game:deep-recording-inventory` discovers every saved movement directly from an export, converts each packet, preserves canonical stored titles, records the exact source export and selection mode, and therefore includes future schema-v3 recordings without a maintained ID manifest. A fresh read-only 18 July development export confirmed that the saved nine-recording acceptance set remains schema v1: all nine preserve full pose/world-pose tracks and remain regression fixtures, but none contains schema-v3 Deep Capture evidence. Ordered `deep-targeted-proof`, `deep-representative-proof`, and `deep-all-nine-proof` commands now select their declared recording sets, preflight every selected schema-v3 packet, run the mounted Game lifecycle, capture Replay, and compare exact boundaries. The representative tier is fixed to Full Motion Exercises, Full Spinal Flow, and Spins; final proof requires exactly nine recordings. The movement finish gate now invokes a strict tier-summary gate that requires targeted before representative before all-nine, refuses schema-v2 or legacy profiles, enforces tier sizes, and blocks any exact boundary drift. A versioned capture-reuse policy now compares the complete stored detector/options/filter/setup contract, Deep Capture/refinement/dense-adapter policy, selected dense-model id/hash, and physical-camera fingerprint against the current acquisition boundary. It explicitly reuses immutable packets after solver, shared-runtime, renderer, or proof-harness changes, while camera or acquisition drift requires a new live capture; missing current camera/model identity returns `cannot-determine` rather than guessing. A versioned reviewer-manifest command now binds reviewer/date, clean commit, shared runtime and acquisition fingerprints, selected dense-model hash and supported-device measurements, commissioning packet hash, and the exact seven source artifacts. Its verifier re-hashes those artifacts, rejects substituted evidence or stale code, requires the exact two-minute iPad and older-laptop timelines plus their accepted post-run physical observations, bounds latency and TensorFlow tensor-memory drift, and checks the candidate aggregates against the worst measured device before the final movement finish-gate can pass. The physical-device handoff now supports JSON-only Share/AirDrop from iPad to the Mac, followed by one consent-gated command from preserved Downloads reports to a reviewed candidate artifact; actual schema-v3 captures, browser runs, an accepted reviewer manifest, and passing tier summaries remain open.

Tasks:

- [x] Add `movement:replay-game:deep-commissioning-eligibility` and `movement:replay-game:deep-commissioning-proof` so one immutable recording ID is exported, validated as schema v3, and then routed through the existing fresh Replay plus mounted Game comparison without weakening schema-v2 compatibility.
- [x] Add `movement:replay-game:deep-recording-inventory` so a fresh export can discover, convert, and classify every saved recording without a manually maintained ID list; retain exact stored titles and compact repeated per-frame failures into counted ranges.
- [x] Prove the complete schema-v3 save path with a realistic 60-frame packet, real hashing and upload metadata, and an immutable returned recording ID; guard against validator or `storage-json-v3` drift.
- [x] Feed the exact browser-emitted schema-v3 JSON through saved-recording Replay conversion and the shared Deep Capture Replay/Game preflight; require zero validation failures before browser proof can begin.
- [x] Keep a failed upload from wasting a complete take: share the hashed packet builder between cloud save and a local JSON-only backup, retain the recorded frames, and provide a non-destructive command that validates and converts that exact downloaded packet into the normal Replay/Game harness session.
- [x] Add `movement:replay-game:deep-local-proof` so one downloaded schema-v3 packet can be recovered, given a zero-failure shared preflight, and then routed through fresh Replay plus mounted Game without moving, overwriting, uploading, or deleting the original download; expose the exact preflight command in the save dialog.
- [x] Repair the live capture contradiction shown on 18 July: use face-coordinate validity rather than body visibility for Face Landmarker counts, refuse dense-body `ready` while configured regions are missing, retain every pose frame after recording begins, replace timed one-shot start with continuous untimed arming, and validate declared natural-motion channel coverage instead of requiring mutually occluded channels on every frame.
- [x] Add `movement:replay-game:deep-latest-proof` to fresh-export or reuse an export, inventory all recordings, select the newest eligible schema-v3 packet, and route its immutable ID into the combined Replay/Game proof without manual copying.
- [ ] After Phases 8-14 pass, run one short real-camera Game commissioning session covering the complete Deep Capture matrix and automatically save its immutable schema-v3 packet.
- [ ] Immediately rerun that exact packet through Replay and mounted Game and compare acquisition/setup provenance plus final rendered telemetry.
- [x] Add a durable reviewer manifest that records reviewer/date, clean commit, runtime and acquisition fingerprints, model hash, packet hash, exact sustained iPad/older-laptop measurements, the honest TensorFlow-tensors-only memory scope, and exact artifact hashes. `movement:replay-game:deep-review-manifest-gate` independently requires both two-minute device timelines, bounded latency/memory/tensor drift, worst-device aggregate metrics, and re-hashes the seven required artifacts; creating an accepted instance remains part of the real commissioning run.
- [x] Add targeted, fixed three-recording representative-subset, and final exactly-nine mounted Game lanes to the movement finish gate in tiered order. Each tier fails before browser capture on incomplete schema-v3 packets, and the strict finish gate rejects missing prior tiers, legacy profiles, incorrect tier size, failed runs, or exact boundary divergence.
- [x] Require a new live commissioning capture only when the physical camera, detector/model version or options, acquisition preparation, filter profile, dense-body model, hand/face crop policy, or setup/calibration policy changes. `movement:replay-game:deep-capture-reuse` makes the decision from exact semantic contracts plus opaque camera/model identity; shared solver, runtime, renderer, and proof-harness repairs reuse existing immutable packets.
- [ ] Include squats, forward/lateral leg raises, side bends, torso/limb twist, front/back turns, head motion, arm motion, palm front/back/edge-on, wrist rotation, individual and combined finger motion, gaze, blinks/asymmetric expression, root turns, steps/jumps, and support/contact transitions; this is a minimum floor, not an allow-list.
- [ ] Capture browser-visible Replay and ordinary live Game evidence for the commissioning packet so telemetry cannot be the only product-facing acceptance proof.

Exit criteria:

- The one-time live session agrees with its Replay and mounted Game reproductions across every required Deep Capture channel.
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
- per-hand detector handedness, pose-wrist association, native crop transform/resolution, 21-point image/world coverage, palm normal, facing classification, wrist swing/twist, and finger-joint evidence;
- dense face/iris landmark coverage, facial transformation matrix, full blendshape coverage, gaze provenance, eye visibility, and face-crop quality;
- segmentation identity plus dense-body model/profile/hash;
- persistent dense-anchor id, body region, anatomical side, front/back ownership, source coordinates, estimated depth, surface normal, confidence, occlusion state, observation origin, cadence, and temporal age;
- per-channel expected, observed, model-estimated, temporally tracked, derived, missing, and compared counts with zero silent skips;
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
- Deep Capture uses genuinely expanded hand, face/eye, and dense-body evidence; interpolated helper points are not counted as observations.
- The same schema-v3 packet preserves detector/model identity, per-channel timing and provenance, dense-anchor identity, and complete coverage accounting across Capture, Replay, and Game.
- Palm-facing direction, wrist rotation, finger articulation, gaze, asymmetric expression, torso/limb twist, body-surface orientation, and configured contact regions are hard source-to-final and Replay-to-mounted-Game gates when supported.
- A one-time real-camera Game commissioning session visibly preserves Replay-accepted motion across the full Deep Capture behaviour matrix and is saved as a complete replayable packet.
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
- Do not call interpolated skeletal helper points, held values, or temporally propagated anchors newly observed body points.
- Do not infer `palm-facing-camera` from one 2D wrist/hand point; require a signed palm normal and sufficient non-collinear hand evidence.
- Do not run a heavy dense model on every frame without measured device budgets, cadence control, and backpressure.
- Do not send thousands of raw dense-model vertices directly into VRM bone application; retain a stable sampled evidence layer and a separate shared retarget decision.
- Do not persist raw camera frames or video by default under the Deep Capture label.
- Do not add dense-body, gaze, wrist, or expression behaviour to Capture/Replay without the mounted Game lane, or vice versa.
- Do not ask the user to make another recording until the countdown/start regression and live per-channel preflight are green.

## Verification Strategy

Use Node `22.13.0`.

The following command names are required outcomes of Phases 8-15; they are planned interfaces and must not be reported as available until implemented and tested:

```bash
npm run movement:acquisition-contract-guard
npm run movement:replay-game:targeted -- --packet <packet> --frame-start <n> --frame-end <n>
npm run movement:replay-game:fast-subset -- --manifest <manifest>
npm run movement:replay-game:certify -- --manifest <manifest>
npm run movement:deep-capture:profile-gate -- --packet <packet>
npm run movement:deep-capture:device-benchmark -- --profile <profile>
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
  -> capture countdown/start-to-save regression
  -> Deep Capture profile and supported-device benchmark gates
  -> exact Full Motion Exercises packet/frame in Replay and mounted Game
  -> short timed failure window through the normal Game lifecycle
  -> complete Full Motion Exercises packet
  -> three-recording representative subset
  -> final nine-recording Replay + mounted Game certification
  -> one-time schema-v3 real-camera commissioning when acquisition boundaries changed
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
- Documented pre-expansion end-to-end alignment design: 100%.
- Deep Capture contract and roadmap definition: 100% for this documentation slice; the expanded implementation is approximately 75% overall.
- Shared post-input motion and final-render foundation: approximately 90%.
- End-to-end Replay-to-Game implementation: approximately 88%; proof identity and the final reviewer record are now fail-closed, but fresh current-fingerprint Replay/Game acceptance is missing.
- Shared acquisition/setup contract: approximately 90% implementation; no current complete packet has commissioned the ordinary live boundary.
- Complete record-once packet: 97% implementation; capture-time commissioning validation and command preflight now share the same required-channel contract, and the saved recording ID can now drive export, Replay-session conversion, and Replay/Game packet proof in one command. No canonical commissioning packet has been captured.
- Normal mounted Game-session replay: 85%; lifecycle, acceptance identity, and exact boundary enforcement are implemented, while fresh complete-packet and live equivalence remain open.
- Zero-escape supported-behaviour matrix: 65%.
- Reliable capture start and Deep Capture observability: 95%; start/save lifecycle, coarse-versus-refined live channel reporting, separate schema-v2/schema-v3 modes, fail-closed validation/upload, and cross-route drift protection are implemented, while the required-profile pre-record veto awaits dense acquisition.
- High-fidelity hands/wrists/fingers and face/eyes/gaze: 78%; native-crop second-pass inference, source-frame remapping, short-lived carry through missing ROIs, explicit observed/carried/reacquired and occlusion state, bilateral fail-closed eye visibility, deterministic crossed-hand/edge/crop/stale guards, facial matrices, eye/expression expansion, guarded wrist/finger application, shared source-boundary carriage, and exact immutable-frame equality through recording conversion, the shared Replay/Game player runtime, and actual final VRM writers are implemented, while representative RGB occlusion/device measurements and browser-mounted full-sequence rendered proof remain open.
- Dense whole-body surface acquisition and fusion: 78%; model segmentation, a versioned adapter/validation boundary, persistent-ID and explicit full-region-state requirements, an asynchronous shared-capture runner, descriptor/result identity checks, reduced-rate/backpressure rules, bounded temporal carry, versioned skeleton/dense region fusion with honest twist/contact-candidate semantics, a local-only six-scenario RGB capture workflow, non-destructive consent-gated download ingest with hashes, a complete six-clip manifest, an executable two-candidate GPU browser runner, exact model artifact hashes, a completed anchor-aware 30-frame MobileNet measurement, a passing three-cycle/90-sample automated soak with bounded latency drift and zero tensor-memory growth, an explicit repeat ResNet load-time rejection, a Deep-Capture-only provisional MobileNet adapter, runtime artifact re-verification, deterministic part-relative 400-anchor sampling on all measured frames, measured stable-ID retention, explicit missing-region behaviour, geometry-capability selection and reviewer vetoes, exact Replay/Game boundary preservation, compact storage, and identity-aware live preflight are implemented. Candidate selection, lower-tier-device and physical thermal review, genuine depth/normal correspondence, and full-sequence rendered proof remain open.
- Schema-v3 Deep Capture packet and commissioning proof: 55%; types, profile, builder/parser, channel accounting, privacy defaults, guarded save selection, dense-adapter identity validation, Replay/shared-source/Game carriage, fail-closed Replay-packet validation, eligibility reporting, the one-command fresh Replay/mounted Game route, ordered proof tiers, capture-reuse decisions, and the durable reviewer-manifest gate are implemented, while actual dense acquisition and final visible proof are open.
- One-time schema-v2 commissioning tooling remains approximately 45% of the former narrower closure phase, but that packet cannot certify the newly expanded Deep Capture scope.
- Product acceptance: blocked.

The current legacy diagnostic lane observed zero Replay/Game output differences across 10,327 active frames in eight sessions. It does not prove current-code identity because Replay captures were reused from a mismatched fingerprint, all recordings lack hands/face/schema-v2 identity, and live commissioning remains open. New artifacts now carry fail-closed current code/packet identity, all eight exported runtime boundaries are exact hard gates, the commissioning route refuses incomplete packets, and one command now starts from the saved recording ID and runs export, Replay-session conversion, fresh Replay capture, fresh mounted Game capture, and exact comparison. There is still no qualifying saved packet to run through the proof.

Against the former narrower Replay/Game alignment scope, the implementation is approximately **90%**. The repaired capture lifecycle, live preflight, guarded schema-v3 path, native-crop hand/face refinement with explicit short-occlusion recovery, shared hand/face/wrist/expression slice, asynchronous dense adapter plus versioned skeleton/surface fusion runtime, private six-scenario RGB capture, a real six-clip evidence pack, an executable two-candidate browser benchmark with exact artifact hashes and an explicit heavyweight-model rejection, a hash-verified provisional MobileNet adapter producing deterministic semantic surface samples only in Deep Capture, a real 30-frame anchor/region/identity measurement, visibility-aware explicit missing-region validation, a passing 90-sample automated soak, geometry-capability production vetoes, an explicit ninth schema-v3 dense-fusion parity boundary, schema-v3 commissioning preflight/orchestration, strict targeted-to-representative-to-all-nine mounted proof tiers, semantic capture-reuse decisions with opaque physical-camera identity, a fail-closed reviewer-manifest gate, and honest segmentation foundation move the expanded roadmap estimate to approximately **90%**. Browser-mounted hand/eye proof, lower-tier-device and physical thermal review, genuine depth/normal surface correspondence, and renewed commissioning remain real new scope rather than regressions in the retained runtime.

## Immediate Next Slice

1. Use the new deterministic low-resolution, edge-on palm, crossed-hand, reacquisition, eyewear-unknown, eye-occlusion, crop-boundary contract, and the six recorded RGB scenarios to prove the refined signals reach the actual shared Replay and mounted Game renderer with zero silent skips.
2. Review MobileNetV1 0.75 quant2 as the provisional browser candidate: the three-cycle automated soak is green on the M4 Max; repeat the exact benchmark on a declared lower-tier supported device and complete physical thermal review. Keep ResNet50 rejected unless its greater-than-90-second M4 Max load failure is materially changed. Do not set `selectedCandidateId` or allow the final benchmark gate to pass before the device, thermal, licence/attribution, and body-part coverage decision is recorded.
3. Keep the measured BodyPix lattice provisional and add a genuine depth/normal correspondence candidate before production selection. The current 400-anchor semantic layer is useful for visible-region and occlusion evidence, but it does not satisfy camera-space depth or 3D surface-normal acceptance.
4. Treat the existing nine recordings as legacy pose/world-pose diagnostics. They remain useful for shared solver and renderer regression, but they cannot prove newly added hand, face/eye, or dense-body channels.
5. Only after the start gate, preflight, profile, and capture channels are green, record one schema-v3 commissioning packet at `/demos/movement-capture?commissioning=1&deepCapture=1`, preflight it with `npm run movement:replay-game:deep-commissioning-eligibility -- --recording-id <id> --export <export> --fail-on-ineligible`, and run `npm run movement:replay-game:deep-commissioning-proof -- --recording-id <id>` from its immutable recording ID.
6. Add browser-visible Replay and ordinary Game review plus strict targeted, representative, all-nine, Deep Capture, and commissioning lanes to the tiered finish gate.

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
- The motion-pipeline fingerprint now covers all non-test movement libraries and hooks, all Game play components, the Game and Replay route lifecycles, Movement Capture, and final VRM application. A focused regression explicitly requires `useMovementPlayerTracking.ts`, `useMovementLivePlayerSetup.ts`, `movementPlayerInputContract.ts`, and `useVrmAvatarFrameRuntime.ts`.
- New Replay and mounted Game captures now export the same full commit, current pipeline fingerprint, immutable packet hash, input-contract ID, named setup-policy ID, avatar profile, runtime contract, and `replay-mounted-game-player-v1` parity proof mode.
- Replay/mounted Game comparison now blocks missing or legacy identity, mismatched identity, stale/current-code fingerprint or commit drift, and any exact player-render checksum difference. The former test that allowed a sub-tolerance exact checksum difference to pass is reversed; focused identity/fingerprint/comparator coverage passes 16/16 tests.
- Replay and mounted Game now export the same eight raw comparison boundaries on every active frame: acquisition, setup, calibration, motion frame, owner/root/support, instructor-rendered, player-rendered, and final player-applied telemetry. The comparator recomputes every checksum, detects a mismatched declared Game checksum, reports the first differing boundary, and blocks any exact difference; focused coverage passes 17/17 tests.
- Stored recording schema version now survives conversion into a Replay session and is a required parity identity field. `movement:replay-game:packet-proof` validates schema v2, packet/setup identity, complete setup prefix, per-frame readiness, and non-empty pose/world-pose/hand/face/blendshape/camera evidence before launching fresh Replay and mounted Game captures; the focused proof/identity suite passes 21/21 tests.
- Movement Capture now has an explicit commissioning route that validates the completed schema-v2 envelope before upload, blocks incomplete saves with channel-specific failures, and displays the newly created recording ID rather than navigating away. A drift test locks its six required capture channels to the command-line proof preflight. The running local app renders the commissioning contract banner with tracking ready and no application errors.
- `movement:replay-game:commissioning-proof` now starts from the saved commissioning recording ID, creates a fresh Convex export with file storage unless an explicit export is supplied, converts that recording to the canonical Replay session packet, invokes the existing fresh Replay/mounted Game packet proof, and writes a top-level binary summary. Focused orchestration coverage passes with the packet-proof preflight suite: 2 files / 8 tests under Node 22.13.0.
- `movement:replay-game:commissioning-eligibility` now checks existing packets before any repeat capture request. It can inspect a session manifest or re-convert saved recording IDs from a Convex export, then apply the same fail-closed packet validator. The export-backed nine-recording run wrote `tmp/movement-replay-lab/current-nine-commissioning-eligibility-from-export.json` and found 0/9 eligible: every current nine recording lacks schema-v2 packet identity, setup identity, source hash, readiness history, and schema-v2 channel evidence required by the strengthened proof.
- Current verification passes Node 22.13.0 environment validation, acquisition-contract guard, clean typecheck, focused commissioning proof coverage with 3 files / 12 tests, `npm run check` with 345 test files / 2,428 tests, and `git diff --check`. `lint:all` exits green with two warnings from the generated `tmp/movement-replay-lab/export-replay-session-cli.bundle.mjs` scratch bundle, not source files. The broader architecture guard remains blocked only by the six documented pre-existing line-budget overages; none of those files changed in this slice, while source purity, route-bypass purity, 11,383 Replay/Game parity frames, 50/50 Game visual checks, Phase 14 script contracts, and proof-manifest blocking rows remain green.
- Still blocked: a setup-valid replacement for `Head Roll`, a fresh complete canonical packet exercised through both routes, one-for-one checksums for the remaining acquisition/setup/calibration/motion/owner/instructor/applied boundaries, the remaining zero-escape visual/mirror assertions, and one-time live commissioning.

### 2026-07-17 Renewed Mounted All-Nine Evidence

- The former `Spins` and `Walking on the Spot` blocks were harness lifecycle failures, not missing motion: the recorded source stopped at frame 59 while Game correctly waited for genuinely newer full-body frames. `Spins` becomes ready at frame 73 and `Walking on the Spot` at frame 64.
- Recorded prestart playback now advances only during the initial visibility check, waits for motion-frame acknowledgement, counts new source indexes rather than timer ticks, and stops synchronously when pause is requested. Production readiness thresholds are unchanged.
- A second fault duplicated setup frames 0-59 in `useMovementLiveMotionFrame`, shifting root history and causing 39 `Spins` root-yaw divergences. The live ref now recognises initial-sequence payloads already consumed and does not rebuild them.
- Mounted Game summary: `tmp/movement-replay-lab/current-mounted-game-nine-proof-aligned-v3/summary.json`; eight of nine pass, with complete source processing for every passing recording.
- Replay/Game comparison summary: `tmp/movement-replay-lab/current-replay-mounted-game-nine-comparison-aligned-v3/summary.json`; eight runnable recordings, 10,327 compared rendered frames, zero tolerance divergences, and zero exact checksum divergences.
- `Head Roll` contains no full-body-ready frame across its 554 frames because both feet are never simultaneously present. It must be replaced or re-recorded; the Game gate must not be weakened to manufacture a ninth pass.

## 2026-07-16 Game Runtime Repair Evidence

The following is historical downstream-runtime evidence. It does not close Phases 8-15 and must not be used as a current end-to-end acceptance claim.

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
