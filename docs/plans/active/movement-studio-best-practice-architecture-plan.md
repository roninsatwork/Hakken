# Movement Studio Best-Practice Architecture Plan

Last reviewed: 2026-07-04
Status: active architecture-hardening plan.
Scope: make Posture Studio / Game Studio movement code follow a maintainable motion-engine architecture for visible, believable child gameplay before expanding toward broader human movement coverage.

## Purpose

The current movement stack is going in the right direction, but it is at the point where more feature work can either become a real motion engine or collapse into pose-specific avatar patches.

This plan defines the best-practice route:

```text
live webcam adapter  -> MovementSourceFrame
recorded data adapter -> MovementSourceFrame
synthetic proof adapter -> MovementSourceFrame
  -> one standard movement pipe
  -> get-ready countdown and calibration gate
  -> normalized truth skeleton
  -> camera confidence and uncertainty state
  -> movement confidence, orientation, and support/contact model
  -> explicit mirror/display side mapping
  -> child-friendly scoring and motivation events
  -> retarget frame and owner decisions
  -> avatar application targets
  -> thin VRM/Three.js application layer
  -> replay-studio eval coverage gate
  -> replay/game parity proof
```

The goal is not to make every possible human movement work immediately. The goal is to make the architecture honest, testable, and safe to extend while making the avatar feel visibly connected to the child.

## Product Target

The audience is children aged roughly 6-14. This is a gameplay mirroring product, not a clinical biomechanics product.

The desired experience is:

```text
Child moves
  -> avatar clearly appears to copy the broad movement
  -> game rewards effort and recognizable motion
  -> tracking failures degrade gracefully
```

The target is not:

- perfect knee, hip, wrist, or spine angles.
- medical or rehabilitation-grade measurement.
- strict punishment for small form errors.
- full-body exactness when one webcam cannot see enough evidence.

The target is:

- visible movement mimicry.
- believable avatar motion.
- low frustration for smaller, faster, or less precise children.
- forgiving scoring.
- stable, game-readable poses.
- clear fallback behavior when the camera cannot see enough.

This changes the acceptance bar. A squat does not need a perfect knee angle, but the avatar must visibly squat. A lean does not need exact spinal geometry, but the avatar must clearly lean the correct way. A leg raise does not need clinical precision, but it must read as the correct leg lifting rather than a broken crouch.

## Standard Pipe Target

The ideal architecture is one movement pipe fed by different input adapters.

```text
Live webcam data
  -> live input adapter
  -> MovementSourceFrame
  -> shared movement pipe
  -> avatar/game output
```

```text
Recorded Replay data
  -> replay input adapter
  -> MovementSourceFrame
  -> shared movement pipe
  -> avatar/game output
```

```text
Synthetic proof data
  -> proof input adapter
  -> MovementSourceFrame
  -> shared movement pipe
  -> avatar/game output
```

Live webcam, recorded replay, and synthetic proof data may differ before the pipe. Live input can smooth points, handle latency, manage active calibration, and clean camera noise. Recorded input can decode saved frames, restore timestamps, and normalize stored payloads. Synthetic proof input can create controlled fixtures.

After those adapters produce `MovementSourceFrame`, Replay Studio and Game Studio should use the same movement logic.

Allowed differences after `MovementSourceFrame`:

- UI presentation.
- scoring screen state.
- player/instructor labels.
- route progression.
- debug display.
- documented avatar identity/profile differences.

Not allowed after `MovementSourceFrame`:

- separate Replay-only or Game-only movement decisions.
- separate player lower-body ownership rules.
- separate support/contact solving.
- separate readability amplification.
- separate retarget eligibility.
- separate fallback behavior when confidence drops.
- separate avatar bone behavior unless it is only avatar-profile/rest-pose application.

Current state: partially aligned, not complete. `movementAvatarPipeline.ts`, `movementRetargeting.ts`, `movementGamePathSimulation.ts`, replay analyzer tests, and proof fixtures are moving toward this target. `VrmAvatar.tsx` still contains final application behavior and some remaining route/role differences, so Replay and Game can still diverge visually after shared decisions.

## Current Diagnosis

Overall full human-movement engine progress estimate: 15-20%.
Current standing/posture/Game Studio slice estimate: 65-75%.
This architecture-hardening slice progress estimate: 0% until implemented.

The good direction:

- `movementRetargeting.ts` has a real source-body model and retarget frame concept.
- `movementAvatarPipeline.ts` now owns many shared movement decisions instead of leaving every decision inside the renderer.
- `movementBodyOrientation.ts`, `movementSupportContact.ts`, and `movementCoverageRegistry.ts` start to model unsupported movement honestly.
- `movementGamePathSimulation.ts` and replay analyzer tests are moving Replay Studio toward being the motion source of truth.
- Existing plans already warn that labels are diagnostics, not animation sources.
- The codebase already has the start of Replay/Game wrappers, but they need to converge on a single `MovementSourceFrame -> MovementMotionFrame` contract.
- `e2e/movement-avatar-proof.eval.spec.ts`, `movementReplayAnalyzer`, replay capture scripts, and proof fixtures provide a useful base for hard movement evals.

The main risk:

- `VrmAvatar.tsx` still owns too much final behavior: root transforms, retarget quaternion application, legacy lower-body aiming, foot lock, planted squat IK, arm aiming, head/neck application, hand rigging, and debug registry writes.
- Broad extraction recently regressed the visual route, so the right next step is not another large refactor. The right next step is small, proven extractions with visual proof after each one.
- The avatar can be technically "using points" while still failing the product goal because the visible motion is too small, confusing, jittery, or physically unbelievable.
- Current evals are valuable but not yet a complete contract. They prove selected synthetic states and some visual differences, but they do not yet guarantee every supported movement, recorded replay, mirror mode, scoring event, Instructor behavior, and known client-visible regression has a hard failing proof.

## Non-Negotiable Rules

1. Replay Studio remains the source of truth.

   A live Game Studio bug should first be reproduced through a saved recording, debug session, synthetic proof, or game-path simulation. Live webcam testing is final confirmation, not the primary debugging loop.

2. Labels do not drive animation.

   Labels such as `squat`, `left-knee-raise`, `supine`, `plank`, `warrior`, or `pilates-hundred` may explain diagnostics, scoring, or support status. They must not become canned animation branches that overwrite calibrated segment vectors.

3. `VrmAvatar` must become a thin application layer over time.

   It may hold refs, load VRM files, apply Three.js transforms, and write visual debug state. It should not be the place where movement ownership, support state, body orientation, or pose-family behavior is invented.

4. Unsupported movement is a valid product result.

   A movement can be `supported`, `approximate`, `diagnostic-only`, or `unsupported`. The system should say why it cannot solve a movement instead of faking precision.

5. Expansion follows proof.

   Do not add sitting, floor work, yoga, Pilates, walking, jumping, or prop movement as user-facing supported behavior until source skeleton, normalized body model, avatar result, replay/game parity, and tests agree.

6. Readability is part of correctness.

   For this product, a technically plausible bone solve is not enough. A movement only passes if a child, parent, or client can immediately read what the avatar is doing during gameplay.

7. One standard pipe after input adaptation.

   Replay and Game may prepare source data differently, but once data becomes `MovementSourceFrame`, it must flow through the same truth skeleton, movement state, readability, retarget, and avatar target decisions.

8. Mirror side ownership is explicit.

   Source left/right must mean the child's anatomical left/right. Display mirroring must be declared once as motion metadata and then shared by Replay Studio, Game Studio, proof routes, and Instructor views. No route should silently swap sides on its own.

9. Scoring and motivation consume shared motion events.

   Scoring, encouragement, streaks, hints, and celebration messages must be derived from `MovementMotionFrame`, readability state, and explicit gameplay events. They should not read raw landmarks, route-local labels, or hidden renderer state directly.

10. Known visible failures become hard eval fixtures.

   If Replay Studio, Game Studio, Instructor, or a client recording exposes a visible movement failure, that failure must be added to the replay/eval proof set with a clear expected result. A fix is not complete until the new fixture fails before the fix and passes after the fix.

11. Uncertainty is not user failure.

   When the camera cannot see enough body evidence, the product should enter an explicit uncertainty/help state. It should guide the child with simple visibility feedback such as "move where I can see you" instead of reducing score, saying they failed, or pretending the movement was measured accurately.

12. Recording and gameplay need a start-readiness gate.

   Starting a recording or game immediately after a button press is not child-friendly. The product should give a countdown, time to walk back into frame, a visibility check, and a calibration/readiness result before it starts capturing scored movement.

## Target Module Boundaries

### Source And Capture

Owns camera and MediaPipe concerns only.

Allowed responsibilities:

- load MediaPipe.
- collect raw pose, world pose, face, hand, blendshape, timestamp, camera, and frame-bound data.
- perform live-only smoothing or cleanup before shared movement decisions.
- store recordings and debug-session samples.

Not allowed:

- choose avatar bone ownership.
- special-case Game Studio avatar behavior after points exist.

### Source Adapters

Own converting different input origins into one standard pipe input.

Expected output shape:

```ts
type MovementSourceFrame = {
  origin: "live-webcam" | "recorded-replay" | "synthetic-proof";
  frameId?: string;
  timestampMs: number;
  poseLandmarks: TrackingLandmark[];
  worldLandmarks?: TrackingLandmark[] | null;
  faceLandmarks?: TrackingLandmark[] | null;
  hands?: MovementHandsForConfidence | null;
  blendshapes?: unknown[] | null;
  camera?: MovementCameraMetadata | null;
  calibration?: MovementCalibration | null;
  cameraConfidence?: MovementCameraConfidence | null;
  startReadiness?: MovementStartReadiness | null;
  sourceStatus: "raw" | "smoothed" | "decoded" | "synthetic" | "held-last-good";
  warnings: string[];
};
```

The exact type names can change, but every source should enter the shared movement pipe through one standard frame shape.

Adapter responsibilities:

- live webcam adapter: smoothing, current calibration, latency/frame age, camera metadata, live confidence cleanup.
- recorded replay adapter: saved payload decoding, timestamp normalization, stored world/pose/hand/face restoration.
- synthetic proof adapter: controlled fixture generation and expected proof labels.

Not allowed:

- movement-family decisions.
- avatar bone ownership.
- Replay-only or Game-only confidence fallback.

### Camera Confidence And Uncertainty

Owns whether the system has enough camera evidence to judge, score, and animate the movement fairly.

Expected confidence shape:

```ts
type MovementCameraConfidenceState =
  | "ready"
  | "partial"
  | "uncertain"
  | "lost";

type MovementCameraConfidence = {
  state: MovementCameraConfidenceState;
  reasons: Array<
    | "body-too-close"
    | "body-too-far"
    | "body-out-of-frame"
    | "feet-not-visible"
    | "hands-not-visible"
    | "face-not-visible"
    | "low-light"
    | "motion-blur"
    | "low-landmark-confidence"
    | "stale-frame"
    | "calibration-missing"
  >;
  visibleParts: Partial<Record<MovementSegmentName, number>>;
  scoreAllowed: boolean;
  avatarDriveAllowed: boolean;
  messageEvent?: "move-where-i-can-see-you" | "step-back" | "step-closer" | "show-your-hands" | "show-your-feet";
};
```

Rules:

- `ready`: score normally and drive the avatar normally.
- `partial`: allow forgiving scoring only for visible body parts; avoid scoring hidden parts.
- `uncertain`: pause or soften scoring, hold recent clear avatar motion briefly, and show a help message.
- `lost`: stop scoring, use safe fallback avatar state, and show a camera-recovery prompt.

Not allowed:

- treating poor camera evidence as a child movement failure.
- scoring hidden body parts as wrong.
- hiding uncertainty behind fake precision.
- letting Replay and Game use different uncertainty thresholds after `MovementSourceFrame`.
- showing harsh failure language when `scoreAllowed` is false.

### Calibration And Start Readiness

Owns the get-ready flow before a recording or gameplay attempt begins.

Expected readiness shape:

```ts
type MovementStartReadinessState =
  | "idle"
  | "countdown"
  | "checking-visibility"
  | "calibrating"
  | "ready"
  | "blocked";

type MovementStartReadiness = {
  state: MovementStartReadinessState;
  countdownSecondsRemaining?: number;
  requiredVisibleParts: Array<"head" | "torso" | "hips" | "hands" | "knees" | "feet">;
  visibleParts: Partial<Record<"head" | "torso" | "hips" | "hands" | "knees" | "feet", number>>;
  calibrationQuality: "none" | "poor" | "partial" | "good";
  canStartRecording: boolean;
  canStartGame: boolean;
  messageEvent?:
    | "get-ready"
    | "walk-back-into-frame"
    | "stand-where-i-can-see-you"
    | "show-your-whole-body"
    | "show-your-feet"
    | "hold-still-for-calibration"
    | "ready-to-start";
};
```

Rules:

- Pressing record or play starts a 5-second get-ready countdown by default.
- During countdown, the UI should tell the child to walk back into frame and get into position.
- After countdown, the app checks whether required body parts are visible for the selected movement.
- Calibration should only be accepted when visibility and stillness are good enough for the movement.
- Recording/gameplay starts only when `canStartRecording` or `canStartGame` is true.
- If visibility is poor, stay in `blocked` or `checking-visibility` and show a simple help message instead of starting a bad recording.
- Replay Studio should store readiness/calibration metadata so failed starts and poor recordings can be diagnosed later.

Not allowed:

- starting a scored game or recording immediately on button press.
- silently recording unusable setup frames as if they were movement proof.
- accepting calibration when the body is mostly out of frame.
- requiring exact adult stillness from a child before starting.
- using different readiness rules for recording and live gameplay without documenting the reason.

### Truth Skeleton

Owns a normalized, body-relative skeleton independent of VRM quirks.

Expected responsibilities:

- normalize pose/world landmarks against calibration.
- expose joint positions, segment vectors, confidence, source status, and body scale.
- preserve low-confidence but geometrically meaningful far-camera movement.
- report held, rejected, synthetic, and low-confidence states.

This should become the shared input to retargeting, scoring, diagnostics, and replay/game parity.

### Movement State

Owns what the human body appears to be doing.

Expected responsibilities:

- body orientation: upright, seated, kneeling, quadruped, supine, prone, side-lying, transitional, unknown.
- support contacts: feet, hands, knees, seat, back, chest, side body, props when modeled.
- root pose: position, yaw, pitch, roll, height/drop, support offset.
- movement phase: static hold, transition, gait phase, jump phase, floor-work phase.
- movement support status and unsupported reasons.

### Retarget And Motion Contract

Owns avatar-facing motion decisions but not direct Three.js mutation.

Expected output shape:

```ts
type MovementMotionFrame = {
  source: MovementSourceFrame;
  display: MovementDisplayMapping;
  cameraConfidence: MovementCameraConfidence;
  bodyOrientation: MovementBodyOrientationDecision;
  support: MovementSupportContactDecision;
  rootTarget: MovementRootTarget;
  segmentTargets: Partial<Record<MovementSegmentName, MovementSegmentTarget>>;
  contacts: MovementContactTarget[];
  owners: Record<string, string>;
  confidence: Record<string, number>;
  held: string[];
  clamped: string[];
  rejected: string[];
  readability: MovementReadabilityTarget;
  unsupportedReasons: string[];
};
```

Expected display mapping shape:

```ts
type MovementMirrorMode = "facing-player" | "same-side";
type MovementDisplayRole = "player-avatar" | "instructor-avatar" | "replay-avatar";

type MovementDisplayMapping = {
  role: MovementDisplayRole;
  mirrorMode: MovementMirrorMode;
  sideMap: {
    sourceLeft: "avatarLeft" | "avatarRight";
    sourceRight: "avatarLeft" | "avatarRight";
  };
};
```

The exact names can change, but the contract should separate:

- source/truth data.
- source anatomical side from avatar display side.
- support and orientation decisions.
- avatar target decisions.
- debug/owner metadata.
- readability and safe amplification metadata.
- final VRM application.

### Game Readability Layer

Owns the safe presentation choices that make child movement visible without pretending to be clinically exact.

Allowed responsibilities:

- amplify broad motion from tracked evidence so it reads clearly on the avatar.
- smooth jitter without hiding meaningful movement.
- convert tiny but confident child motion into a larger game-readable avatar response.
- choose forgiving thresholds for gameplay scoring.
- hold a recent clear motion briefly when confidence dips for a few frames.
- expose debug values showing raw motion vs displayed motion.

Not allowed:

- invent a movement with no source evidence.
- turn labels into full-body canned animations.
- hide unsupported movement behind fake precision.
- make Replay and Game Studio display different broad motions from the same source frame.

Example:

```text
tracked squat evidence: medium confidence, small child-sized hip drop
readability layer: display a clearer, stable squat response
debug: raw squat 0.32, displayed squat 0.55, source child-scale amplified
```

### Scoring And Motivation Layer

Owns child-friendly gameplay interpretation after movement has already been normalized, mirrored, and made readable.

Expected responsibilities:

- turn `MovementMotionFrame` output into score events, streaks, badges, progress, and feedback triggers.
- reward effort, recognizable movement, and consistency more than exact joint angles.
- use forgiving thresholds tuned for children aged roughly 6-14.
- distinguish tracking uncertainty from user effort, so a child is not punished when the camera cannot see enough.
- trigger motivational messages from stable gameplay events such as `good-effort`, `clear-match`, `keep-going`, `try-bigger-motion`, `tracking-lost`, or `great-recovery`.
- expose debug values showing why a score or message fired.

Not allowed:

- reading raw pose landmarks directly from the scoring layer.
- scoring from pose labels alone.
- scoring differently in Replay and Game Studio for the same `MovementMotionFrame`.
- telling the child they failed when the system is actually uncertain.
- motivational messages that contradict the visible avatar movement.
- exact-angle language such as "knee angle incorrect" for normal child gameplay.

Example:

```text
motion frame: squat readable 0.58, confidence medium, held clear motion 120ms
score event: partial squat match, effort rewarded
message event: "Nice move - try making the next one a little bigger."
debug: raw squat 0.34, displayed squat 0.58, confidence medium, threshold child-forgiving
```

### Replay Studio Eval Harness

Owns the proof matrix that prevents regressions from being missed or ignored.

Expected responsibilities:

- keep a written coverage matrix of required proof cases, current support status, and last verified command.
- run synthetic proof, recorded replay analysis, replay visual capture, and Game Studio parity checks as one reviewable gate.
- include positive cases, negative cases, edge cases, and known regression cases.
- evaluate semantic movement evidence, not only pixel difference:
  - which body part moved.
  - which anatomical side moved.
  - which avatar side moved after mirror mapping.
  - whether direction is correct.
  - whether the movement amplitude is visible enough.
  - whether the movement happens during the expected frame window.
- classify failures by source-data limitation, movement-pipe decision, avatar application, mirror mapping, scoring/message event, or UI presentation.
- attach replay screenshots, source-strip captures, and analyzer JSON to failing proof runs when useful.
- make missing coverage visible as a warning or failure, not as silent absence.
- require every client-visible bug to add or update at least one proof fixture before the bug is closed.
- run the picky eval contract against all saved recordings that claim to cover movement proof, not only the latest or easiest sessions.

Not allowed:

- treating a green synthetic proof as enough when the recorded replay path is untested.
- treating a replay analyzer pass as enough when the avatar still looks wrong.
- relying on manual live webcam confirmation without adding a recorded/synthetic proof case.
- allowing supported or approximate movement families without named replay/eval coverage.
- ignoring failures because they are "only visual" when the product goal is visible believable movement.
- passing an eval because the avatar pixels changed while the wrong limb, wrong side, wrong direction, or wrong body level moved.
- sampling only one frame when the failure is visible across a movement sequence.

Minimum proof layers:

```text
unit proof
  -> source/truth/motion/scoring contract checks
synthetic visual proof
  -> deterministic proof route screenshots and silhouette metrics
recorded replay proof
  -> saved client/user recordings through Replay Studio analyzer and visual capture
semantic recorded proof
  -> body-part, side, direction, amplitude, timing, and scoring assertions per recording window
game parity proof
  -> same source frames produce same gameplay result in Game Studio path
manual review note
  -> short human-readable note only where automated judgement is not yet possible
```

### Mirror Contract And Side Ownership

Owns how source anatomical sides map to avatar display sides.

Default gameplay mode should be `facing-player`, because the avatar is operating like a mirror for the child:

```text
child/source left arm  -> avatar right arm
child/source right arm -> avatar left arm
child/source left leg  -> avatar right leg
child/source right leg -> avatar left leg
```

`same-side` mode remains useful for anatomical debug views, clinician-style review, or any future mode where the avatar should match source side labels directly:

```text
child/source left arm  -> avatar left arm
child/source right arm -> avatar right arm
```

Rules:

- Preserve source anatomical truth before the display mapping.
- Apply the side map once.
- Store the chosen mirror mode in motion/debug output.
- Show debug labels as both source side and avatar side, for example `source: leftArm`, `avatar: rightArm`, `mirror: facing-player`.
- Use the same mirror mapping in Replay Studio, Game Studio, synthetic proof, and Instructor views when they share the same `mirrorMode`.
- Make Instructor mode explicit. If Instructor is facing the child, use `facing-player`; if Instructor is showing anatomical playback/debug, use `same-side`.

Not allowed:

- swapping landmark arrays in one route and swapping bones again later.
- treating Replay as anatomical while Game is mirrored without explicit metadata.
- applying different side maps to arms and legs.
- leaving Instructor side behavior implicit.
- hiding mirror behavior inside `VrmAvatar` role branches.

### Avatar Application

Owns applying a motion frame to a VRM.

Allowed responsibilities:

- build avatar rest-pose map from VRM bones.
- convert segment targets into local bone quaternions.
- apply root transform, head/neck, spine, limbs, hands, and contacts.
- smooth toward target values.
- expose renderer debug metrics.

Not allowed:

- decide whether a movement family is supported.
- invent pose-family logic.
- apply pose labels as canned full-body animation.
- diverge between Replay and Game Studio except for documented presentation/input-cleanup reasons.

## Preferred Implementation Order

The safest order is not "build the whole pipe, then test it later." The safer order is contract, eval harness, then pipe migration in small proven slices.

Preferred sequence:

1. Define the shared input and setup contracts.

   Add `MovementSourceFrame`, `MovementCameraConfidence`, and `MovementStartReadiness` first so live webcam, recorded replay, and synthetic proof data all describe the same source truth, uncertainty, countdown, and calibration state.

2. Inventory current renderer-owned movement decisions.

   Audit `VrmAvatar` before moving logic. This prevents accidentally deleting behavior that currently keeps a demo alive.

3. Evals first: build the picky Replay Studio eval gate before broad pipe refactors.

   Add the coverage matrix, recorded-movement manifest, semantic failure codes, `missing-proof` reporting, and known-regression fixtures. The evals should fail for known issues such as reversed head direction, missing leg lifts, missing hip drop, missing side bend, bad camera confidence, and bad start readiness.

4. Pipe next: formalize the one shared movement pipe.

   Introduce `MovementSourceFrame -> MovementMotionFrame` as the only movement-decision path after input adaptation. Replay Studio, Game Studio, and proof routes should call the same entry point.

5. Pipe parity: make Replay and Game consume the same result.

   Prove that the same source frame produces the same camera confidence, readiness, truth skeleton, motion frame, mirror mapping, scoring event, and avatar target decisions.

6. Downstream consumers: add mirror and scoring after the pipe result exists.

   Mirror side mapping and child-friendly scoring should consume the shared motion frame. They should not read raw landmarks or route-local state.

7. Renderer cleanup last: extract avatar application one small piece at a time.

   Only after the eval gate is strict should `VrmAvatar` be thinned through small extractions such as rest-pose map, segment quaternion application, root transform, foot lock, and hands.

Non-negotiable ordering rule:

- Do not perform a broad avatar/pipe refactor before the semantic replay/eval gate can catch the known missed failures.
- Do not wait until the end to add evals. Each movement fix should add or update the fixture that proves it.
- Do not add new movement families before source contracts, readiness/confidence, and replay/eval coverage are in place.

## Implementation Phases

### Phase 0: Freeze Pose Expansion

Goal: stop increasing complexity while architecture is still mixed.

Tasks:

- Treat new movement-family support as blocked until this plan's Phase 1, Phase 2, and Phase 3 are complete.
- Treat Replay/Game divergence as an architecture bug unless it is documented input adaptation or presentation.
- Keep existing demo behavior stable.
- Do not add more branches inside `VrmAvatar` for individual named poses.
- Keep the movement coverage registry honest.

Acceptance:

- Any new movement request is marked as `diagnostic-only` or `unsupported` unless it has proof.
- No new pose-specific `VrmAvatar` branch lands without an explicit plan exception.
- No new movement logic is added separately to Replay and Game routes.

### Phase 1: Standard Source Frame Contract

Goal: define the one frame shape that live webcam, recorded Replay, and synthetic proof data all feed into the shared pipe.

Tasks:

- Add or formalize `MovementSourceFrame` under movement `_lib`.
- Create live, recorded, and synthetic adapter helpers.
- Ensure adapters preserve source-specific metadata without making movement decisions.
- Add tests that the same standing, squat, side bend, and leg raise source can be represented from live-style, recorded-style, and synthetic inputs.
- Add debug output that identifies source origin and source status.

Acceptance:

- Replay, Game, and proof paths can all produce `MovementSourceFrame`.
- Movement decisions do not depend on route-local input shape after this adapter step.
- A future movement helper can accept one source frame type instead of three route-specific payloads.

### Phase 2: Camera Confidence And Uncertainty Contract

Goal: make poor tracking explicit so the app can help the child instead of scoring them badly.

Tasks:

- Add or formalize `MovementCameraConfidence`.
- Compute frame-level visibility, camera distance, stale frame state, calibration state, and key body-part confidence.
- Distinguish:
  - `ready`: enough evidence to score and animate normally.
  - `partial`: enough evidence for some body parts, not all.
  - `uncertain`: not enough evidence to judge fairly.
  - `lost`: tracking is unavailable or stale.
- Add child-friendly message events such as `move-where-i-can-see-you`, `step-back`, `step-closer`, `show-your-hands`, and `show-your-feet`.
- Ensure scoring reads `scoreAllowed` and body-part confidence before awarding or withholding points.
- Ensure avatar application can briefly hold the last clear pose during short uncertainty windows.
- Add Replay/Game parity tests for low-confidence, out-of-frame, weak-feet, hidden-hands, stale-frame, and calibration-missing cases.

Acceptance:

- A child is not marked wrong when the camera cannot see enough evidence.
- Low-confidence camera frames produce help/recovery events, not harsh failure messages.
- Hidden feet do not cause leg movement to be scored as wrong.
- Hidden hands do not cause arm movement to be scored as wrong.
- Replay Studio and Game Studio report the same uncertainty state for equivalent source frames.
- Debug output explains which body parts were visible, uncertain, held, or not scoreable.

### Phase 3: Calibration And Start Readiness

Goal: make recording and gameplay starts reliable, child-friendly, and diagnosable.

Tasks:

- Add or formalize `MovementStartReadiness`.
- Add a default 5-second countdown before new recordings and live gameplay attempts.
- During countdown, show simple get-ready prompts that tell the child to walk back into frame and get into position.
- After countdown, run a visibility check for the selected movement's required body parts.
- Require enough visible evidence before setting `canStartRecording` or `canStartGame`.
- Calibrate from a short stable window only after the child is visible enough.
- Allow movement-specific requirements:
  - full-body movements need head, torso, hips, knees, and feet where possible.
  - upper-body-only movements can start with feet hidden if lower-body scoring is disabled.
  - hand/arm movements need enough hand/arm visibility.
- Store countdown, readiness, visibility, and calibration-quality metadata with recordings and replay debug frames.
- Add tests for immediate-start prevention, countdown flow, walk-back prompts, blocked visibility, partial upper-body starts, and successful calibration.

Acceptance:

- Pressing record or play does not immediately start scored capture.
- The child has time to walk back and get into frame.
- The app does not start a full-body recording when feet/hips are missing unless the movement explicitly supports upper-body-only capture.
- The app gives clear setup guidance such as `walk-back-into-frame`, `show-your-whole-body`, or `hold-still-for-calibration`.
- Replay Studio can explain whether a bad recording came from poor readiness, poor calibration, or later tracking failure.

### Phase 4: Motion Contract Inventory

Goal: know exactly what `VrmAvatar` still decides.

Tasks:

- Audit every remaining `VrmAvatar` helper and branch.
- Classify each item as:
  - `runtime-ref`
  - `input-cleanup`
  - `movement-decision`
  - `avatar-application`
  - `presentation-debug`
- Create a checklist in this plan or a follow-up implementation note.
- Identify which decisions already exist in `movementAvatarPipeline.ts` and which still leak through renderer code.
- Phase 4 inventory note: `docs/developer/movement-studio-vrm-avatar-inventory.md`.

Acceptance:

- A future engineer can tell which code is safe renderer plumbing and which code is still movement policy.
- Every player-vs-recorded difference has a written reason.
- Every remaining route/role branch is classified as input adaptation, presentation, avatar-profile application, or architecture debt.

### Phase 5: Truth Skeleton Contract

Goal: make raw landmarks inspectable before retargeting.

Tasks:

- Add or formalize a truth-skeleton module under `src/app/(dashboard)/demos/movements/_lib`.
- Convert raw recorded, live, and synthetic frames into the same normalized skeleton contract.
- Include segment confidence, source status, body scale, floor estimate, contacts, and held/rejected reasons.
- Add unit tests for standing, side bend, squat, leg raise, far-camera squat, seated, kneeling, supine, prone, side-lying, quadruped, plank, and bridge fixtures.

Acceptance:

- The same truth-skeleton builder accepts Replay, Game Studio, and synthetic proof inputs.
- Far-camera movement remains visible in vectors even when confidence is lower.
- Unsupported floor/sitting states are detected as unsupported or diagnostic-only instead of upright pose variants.

### Phase 6: Believable Game Motion Gate

Goal: make visible believability a measurable requirement before deeper refactors or new movement families.

Tasks:

- Define a small set of gameplay-readable proof poses:
  - standing.
  - side bend left/right.
  - arm reach / hands front.
  - squat.
  - left and right leg raise.
  - far-camera squat.
  - far-camera leg raise.
  - weak feet but usable body.
- For each proof pose, define expected visual result in plain terms, not exact angles.
- Add debug metrics that compare raw motion strength to displayed motion strength.
- Allow a controlled presentation amplification field, derived from source movement, for child-scale readability.
- Add screenshot or silhouette assertions that fail when the avatar looks too close to standing for an active movement.

Acceptance:

- A squat proof fails if the avatar still reads as standing.
- A leg-raise proof fails if the wrong leg moves or both legs collapse into a crouch.
- A side-bend proof fails if the avatar does not visibly lean.
- Far-camera proof keeps broad movement readable without requiring perfect landmark confidence.
- Debug output can explain when displayed motion was amplified from smaller child-scale source movement.

### Phase 7: Replay Studio Eval Coverage Gate

Goal: make Replay Studio and movement evals strong enough that agents cannot miss or ignore client-visible movement failures.

Tasks:

- Create a replay/eval coverage matrix for every current proof claim:
  - standing.
  - side bend left/right.
  - hands front.
  - head up/down/left/right.
  - squat.
  - far-camera squat.
  - left/right leg raise.
  - far-camera left/right leg raise.
  - root turn.
  - root travel.
  - weak feet.
  - lower body out of frame.
  - mirror side ownership.
  - scoring and motivational message events.
- Create a recorded-movement manifest for every saved recording used as proof. Each manifest row should declare:
  - recording/session id.
  - movement family.
  - expected frame windows or timestamp ranges.
  - expected source side and avatar side.
  - expected body-part motion.
  - expected direction sign.
  - expected minimum visible amplitude.
  - expected scoring/message event when relevant.
  - whether the case is positive proof, negative proof, edge proof, or known regression proof.
- Mark each case with required proof layers:
  - unit contract.
  - synthetic visual proof.
  - recorded replay analyzer proof.
  - recorded replay visual capture.
  - Game Studio parity proof.
  - manual review note when automation cannot yet judge the result.
- Make missing coverage explicit as `missing-proof`, not a silent pass.
- Add a failure taxonomy to replay analysis:
  - `source-data-limitation`.
  - `movement-pipe-decision`.
  - `avatar-application`.
  - `mirror-mapping`.
  - `scoring-event`.
  - `message-event`.
  - `ui-presentation`.
- Add strict semantic failure codes for visible movement regressions:
  - `head-direction-reversed`.
  - `head-motion-missing`.
  - `side-bend-missing`.
  - `side-bend-wrong-direction`.
  - `hip-drop-missing`.
  - `hip-shift-wrong-direction`.
  - `leg-lift-missing`.
  - `leg-lift-wrong-side`.
  - `leg-lift-collapsed-to-squat`.
  - `squat-missing`.
  - `squat-collapsed-to-leg-lift`.
  - `root-turn-reversed`.
  - `root-travel-reversed`.
  - `mirror-side-mismatch`.
  - `movement-visible-but-unscored`.
  - `score-positive-but-avatar-wrong`.
- Require every fixed movement bug to add a fixture or coverage-matrix row before it can be marked fixed.
- Add minimum visual thresholds for replay captures where possible:
  - active pose differs from standing.
  - expected side moves.
  - avatar is nonblank.
  - root/limb/head motion direction matches expected display mode.
  - scoring/message event matches the visible motion.
- Add per-body-part semantic thresholds, not a single global silhouette threshold:
  - head yaw/pitch sign must match expected display direction.
  - torso/shoulder center must lean the expected way during side bends.
  - hip center must drop enough during squats.
  - lifted leg foot/knee must move upward and on the expected avatar side.
  - non-lifted support leg must stay plausibly planted where required.
  - root yaw and root travel must use separate checks.
- Keep a short human-readable proof report after each replay/eval run so future agents can see what was proved and what remains unproved.

Acceptance:

- A green eval run cannot hide an untested supported movement family or route.
- A known regression fails in replay/eval before the fix and passes after the fix.
- Replay Studio proof includes both analyzer decisions and visible avatar output for the important gameplay cases.
- Game Studio parity is checked from the same source frames instead of being assumed from Replay success.
- Missing proof is reported as a blocker or warning in the plan/status, not left for memory.
- Recorded proof sessions fail if the head turns the opposite way, the side bend leans the wrong way, the hip does not visibly drop, or the expected leg does not visibly lift.
- The eval report lists every proof recording checked, every expected movement window, every detected semantic failure code, and every missing expectation.

### Phase 8: Mirror Contract And Side Ownership

Goal: make mirrored gameplay consistent and testable across Replay Studio, Game Studio, proof routes, and Instructor views.

Tasks:

- Add or formalize `MovementMirrorMode` and `MovementDisplayMapping`.
- Decide default mode per surface:
  - Game Studio player avatar: `facing-player`.
  - Replay player avatar: `facing-player` when proving gameplay parity.
  - Synthetic proof route: explicit test-selected mode.
  - Instructor avatar: explicit mode based on whether it is facing the child or showing anatomical reference.
- Move side swaps into one shared mapping helper used by the motion pipe.
- Remove or quarantine duplicate side-swap logic from route-local code as it becomes safe to do so.
- Add debug output that shows source side, avatar side, and mirror mode for limbs and hands.
- Add proof fixtures for left/right arms, legs, side bends, and hands-front symmetry.

Acceptance:

- In `facing-player` mode, a child/source left arm raise visibly raises the avatar right arm in Replay and Game Studio.
- In `facing-player` mode, a child/source right arm raise visibly raises the avatar left arm in Replay and Game Studio.
- In `facing-player` mode, a child/source left leg raise visibly raises the avatar right leg, and the reverse also holds.
- In `same-side` mode, source left maps to avatar left and source right maps to avatar right.
- Replay, Game Studio, proof routes, and Instructor produce the same side mapping for the same source frame and mirror mode.
- Debug output makes double-swaps obvious.

### Phase 9: Shared Movement Pipe

Goal: make the core movement pipe consume `MovementSourceFrame` and produce one `MovementMotionFrame`.

Tasks:

- Introduce or formalize a single pipeline entry point such as `resolveMovementMotionFrame(sourceFrame)`.
- Move truth skeleton, body orientation, support contacts, root target, readability, retarget frame, and owner decisions behind that entry point.
- Make Replay wrapper, Game wrapper, and game-path simulation call the same entry point.
- Keep route-specific work before the adapter or after motion output only.
- Add parity tests that feed equivalent live-style and recorded-style source frames into the same pipeline and compare motion output.

Acceptance:

- Replay and Game no longer each assemble movement decisions from separate helper chains.
- The same source frame produces the same body orientation, support contacts, readability target, retarget eligibility, and owner labels.
- Divergence after `MovementMotionFrame` is limited to avatar-profile/rest-pose application or route presentation.

### Phase 10: Child-Friendly Scoring And Motivation Contract

Goal: make gameplay scoring and encouragement stable, forgiving, and consistent across live Game Studio and Replay proof.

Tasks:

- Define a small `MovementGameplayEvent` contract derived from `MovementMotionFrame`.
- Define score inputs such as readable movement strength, confidence, held/clear motion duration, route target, and mirror mode.
- Define message triggers that separate:
  - effort reward.
  - clear movement match.
  - bigger movement prompt.
  - tracking uncertainty.
  - recovery after lost tracking.
  - streak/celebration.
- Make Replay produce the same gameplay events as Game Studio for the same motion frames.
- Add child-friendly thresholds for partial credit, not exact-angle pass/fail.
- Add debug output explaining which movement evidence triggered the score and message.

Acceptance:

- A child gets credit for a visible, believable movement even if exact joint angles are not perfect.
- A low-confidence camera frame does not trigger harsh failure language.
- Replay and Game Studio produce the same score event for the same `MovementMotionFrame`.
- Motivation messages match what the avatar visibly did.
- Scoring does not read raw landmarks, route-local labels, or renderer-only state.

### Phase 11: One Small Avatar Application Extraction At A Time

Goal: shrink `VrmAvatar` without repeating the broad-extraction visual regression.

Extraction order:

1. Avatar rest-pose map builder.
2. Retarget segment-to-bone quaternion application.
3. Root transform application.
4. Foot lock state and correction.
5. Planted squat IK application.
6. Head/neck application.
7. Hand/finger application.

Rules:

- Extract one item per PR/slice.
- Keep behavior byte-for-byte or visually equivalent where possible.
- Add focused unit tests for pure math or decision pieces.
- Run the main Studio visual proof before and after each extraction.
- Roll back only the specific extraction if the visual proof regresses.

Acceptance:

- `VrmAvatar` loses responsibilities gradually while the client-visible route stays stable.
- Extracted helpers are independently tested.
- Main Studio route visual behavior is verified after every extraction.

### Phase 12: Shared Replay/Game Motion Contract

Goal: Replay and Game Studio consume the same motion decision output.

Tasks:

- Make Replay and Game Studio wrappers produce and consume the same source-frame and motion-frame shapes.
- Move player-specific fallback decisions into motion-frame metadata rather than renderer branches.
- Extend game-path simulation to assert root, support, owner, and retarget parity.
- Ensure generated debug frames include raw source, truth skeleton, motion frame, and avatar debug output.

Acceptance:

- A saved player debug frame can be replayed without webcam access.
- A replay pass cannot hide a Game Studio failure.
- Parity tests fail when Replay and Game Studio produce different movement decisions from the same source frame.

### Phase 13: Support Status Before New Movement Families

Goal: make product claims match engine capability.

Tasks:

- Keep `movementCoverageRegistry.ts` as the source of product truth.
- Add proof requirements per family:
  - source skeleton proof.
  - truth skeleton proof.
  - support/contact proof.
  - avatar visual proof.
  - replay/game parity proof.
- Add unsupported reasons to debug output and replay analysis.
- Keep user-facing UI simple while preserving technical detail in debug tools.

Acceptance:

- Sitting, kneeling, floor work, yoga, Pilates, walking, jumping, and props are not shown as supported until proof exists.
- Unsupported movement produces clear debug reasons.
- Approximate behavior is labeled honestly in debug/rehearsal contexts.

### Phase 14: Expand Movement Families In The Right Order

Recommended order:

1. Upright standing polish.
2. Standing upper-body and head/neck.
3. Squat, knee lift, lunge, and weight transfer.
4. Root turn and root travel.
5. Sitting and kneeling.
6. Basic floor orientation: supine, prone, side-lying, quadruped.
7. Floor contacts: bridge, plank, child pose.
8. Yoga pose family.
9. Pilates mat family.
10. Walking, hopping, jumping, and props.

Acceptance:

- Each movement family enters as `diagnostic-only` first.
- It becomes `approximate` only after visual proof.
- It becomes `supported` only after saved-recording and replay/game parity proof.

## Verification Gates

Focused checks for this plan:

```bash
npm run test:run -- 'src/app/(dashboard)/demos/movements'
npm run eval:movement-avatar
npm run movement:replay:analyze
npm run movement:replay:iteration -- --limit 5 --label current
npm run movement:replay:capture -- --frames auto
npm run movement:replay:proof-set -- --analysis <analysis-json>
```

Repository gate before merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Visual proof expectations:

- Capture before/after screenshots for the main Game Studio route when changing avatar application.
- Include at least standing, side bend, squat, leg raise, far-camera squat, weak feet, and lower-body-out-of-frame proof cases.
- Include mirror proof cases:
  - source left arm raise -> avatar right arm in `facing-player`.
  - source right arm raise -> avatar left arm in `facing-player`.
  - source left leg raise -> avatar right leg in `facing-player`.
  - source right leg raise -> avatar left leg in `facing-player`.
  - source left/right side bend maps consistently across Replay, Game Studio, proof, and Instructor for the same mirror mode.
  - `same-side` mode maps source left to avatar left and source right to avatar right.
- Include scoring/motivation proof cases:
  - visible but imperfect movement earns partial credit.
  - clear movement earns positive reinforcement.
  - tiny movement prompts a bigger-motion hint without harsh failure language.
  - low-confidence tracking produces a tracking/help message instead of blaming the child.
  - Replay and Game Studio produce the same score/message event for the same motion frame.
- Include camera-confidence proof cases:
  - poor tracking enters `uncertain` or `lost` instead of scoring failure.
  - hidden feet prevent lower-body scoring but still allow visible upper-body gameplay when appropriate.
  - hidden hands prevent arm/hand scoring but do not fail unrelated visible movement.
  - stale frames stop scoring and prompt recovery.
  - camera help messages match the reason, such as `step-back`, `show-your-feet`, or `move-where-i-can-see-you`.
  - Replay and Game Studio produce the same confidence state for equivalent frames.
- Include calibration/start-readiness proof cases:
  - pressing record starts a 5-second countdown rather than immediate capture.
  - pressing play starts a 5-second countdown rather than immediate scored gameplay.
  - countdown prompts the child to walk back into frame and get ready.
  - full-body recording stays blocked when head/torso/hips/feet are not visible enough.
  - upper-body-only movement can start with lower-body hidden only when lower-body scoring is disabled.
  - calibration requires enough visibility and a short stable window.
  - recordings store readiness and calibration-quality metadata for Replay Studio.
- Include replay/eval harness proof:
  - every supported or approximate movement has a coverage-matrix row.
  - every row declares which proof layers exist and which are missing.
  - every known client-visible regression has a named fixture.
  - analyzer output and visual replay capture agree on pass/fail for the important gameplay cases.
  - missing proof is reported as `missing-proof`.
- Include semantic recorded-movement proof:
  - every proof recording has a manifest row with expected movement windows.
  - head left/right, head up/down, side bends, squats, leg lifts, hip/root movement, and mirror side cases are checked with direction-specific assertions.
  - wrong-side, wrong-direction, missing-amplitude, and collapsed-movement failures are hard failures.
  - the eval report states how many proof recordings were checked and how many were skipped, with reasons.
- Verify that active proof poses are visibly different from standing.
- Prefer broad, stable, game-readable motion over exact joint-angle matching.
- Do not commit generated screenshots or scratch artifacts unless explicitly requested.

## Stop Conditions

Pause and reassess if:

- A proposed fix requires adding another pose-specific branch inside `VrmAvatar`.
- A label starts driving full-body animation directly.
- Replay passes while Game Studio fails for the same source frame.
- Replay and Game route equivalent source data through different movement decision chains.
- A broad extraction changes multiple renderer behaviors at once.
- A movement family is being marketed as supported without saved-recording and parity proof.
- One-camera source data cannot see enough body/support evidence for the requested movement.
- The avatar technically responds to landmarks but the motion is not visible or believable to a child/player.
- Readability amplification starts inventing motion rather than amplifying tracked evidence.
- Source anatomical left/right is changed before the canonical truth skeleton without explicit mirror metadata.
- Replay, Game Studio, proof routes, or Instructor use different side maps for the same `mirrorMode`.
- A limb is swapped twice, so the avatar appears same-side when gameplay expects `facing-player`.
- Scoring reads raw landmarks, route-local labels, or renderer-only state instead of shared motion/gameplay events.
- Motivational messages blame the child when the system confidence is low or tracking is uncertain.
- Replay and Game Studio produce different score or message events for the same `MovementMotionFrame`.
- A green eval run depends on absence of coverage instead of positive proof.
- A visible client/user failure is fixed without first becoming a replay/eval fixture.
- Replay analyzer decisions pass while replay visual capture still shows the wrong or unreadable avatar motion.
- Eval output only says the avatar changed, without proving the expected body part, side, direction, and amplitude changed.
- Any proof recording is skipped without a visible `missing-proof` or `source-data-limitation` reason.
- A previously observed failure such as reversed head yaw, missing leg lift, missing hip drop, or missing side bend lacks a named regression fixture.
- Poor camera confidence causes a bad score, harsh message, or fake precise movement instead of an uncertainty/help state.
- Hidden or low-confidence body parts are scored as wrong instead of not scoreable.
- Recording or gameplay starts immediately after button press without countdown/readiness.
- A full-body recording starts while the child is out of frame or missing required body parts.
- Calibration is accepted from a mostly missing, moving, or badly framed body.
- A bad recording cannot be diagnosed later because readiness/calibration metadata was not stored.

## Success Criteria

This plan succeeds when:

- `VrmAvatar` is mostly a VRM application adapter.
- Live webcam, recorded replay, and synthetic proof data all enter the movement engine through `MovementSourceFrame`.
- Movement decisions are made in shared, tested modules.
- Replay Studio and Game Studio use the same `MovementSourceFrame -> MovementMotionFrame` pipe after input adaptation.
- Replay Studio evals include a coverage matrix, recorded replay proof, visual avatar proof, and explicit `missing-proof` reporting.
- Replay Studio evals catch semantic movement failures across all proof recordings: wrong side, wrong direction, missing amplitude, missing body-part response, and movement-family collapse.
- Camera confidence is explicit, shared by Replay and Game, and prevents poor tracking from being treated as child failure.
- Recording and gameplay use a countdown plus calibration/readiness gate so the child can walk back into frame before capture starts.
- `facing-player` mirror mode consistently maps child/source left to avatar right and child/source right to avatar left across Replay, Game Studio, proof routes, and configured Instructor views.
- Scoring and motivational messages come from shared movement/gameplay events and remain forgiving for children.
- The system can explain unsupported movement instead of faking it.
- Broad child movements are visibly and believably mirrored in gameplay.
- Scoring and feedback are forgiving enough for children without hiding real tracking failures.
- New movement families can be added through truth skeleton, support/contact, retarget, and proof layers rather than through renderer patches.

## Immediate Next Slice

Current slice progress estimate: 88%.

Completed in this implementation run:

1. Added the Phase 1 `MovementSourceFrame` contract and live/recorded/synthetic adapters.
2. Added the Phase 2 camera confidence, uncertainty, body-part visibility, help-event, and score-allowed contract.
3. Added the Phase 3 start-readiness metadata path and setup/calibration helper extraction.
4. Added the Phase 4 `VrmAvatar` responsibility inventory at `docs/developer/movement-studio-vrm-avatar-inventory.md`.
5. Added Replay/Game proof metadata for source frames, camera confidence, start readiness, gameplay events, and missing-proof reporting.
6. Added shared mirror mapping, truth skeleton, motion-frame, gameplay-event, lower-body target, lower-body target-selection, head target, exercise transition, setup, root-target, arm-target, avatar rest-pose, segment quaternion, planted-IK basis, planted foot-lock, head/neck application, and hand rotation target helper coverage.
7. Began Phase 11 renderer cleanup with small, tested target-composition extractions while leaving broad VRM bone application in place.
8. Added the avatar-side `motionFrameRef` socket so `VrmAvatar` can prefer shared `MovementMotionFrame.avatarDecision` when routes provide it, then wired the synthetic proof route and Replay Lab through that shared motion-frame path.

Remaining plan-critical gaps:

1. Finish the Phase 9 route wiring so the main Game Studio route passes `MovementMotionFrame` into `VrmAvatar`; the avatar-side socket exists and the synthetic proof/Replay Lab routes are wired, but live gameplay still mostly falls back to renderer-local decision assembly.
2. Replace lower-body branch-specific bone application with a shared avatar application contract after parity proof is green.
3. Extract remaining avatar application helpers one slice at a time: remaining planted squat IK VRM application and final hand/blendshape VRM application.
4. Run the full local verification gate plus replay/eval and visual proof captures before any merge or push.
