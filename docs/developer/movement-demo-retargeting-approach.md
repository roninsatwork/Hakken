# Movement Demo Retargeting Approach

Last reviewed: 2026-07-10
Status: required direction for any future body-motion work in the movement demo.
Audience: future agents working on the posture / movement demo.

## Purpose

This document exists because the movement demo can look deceptively close to working while still being architecturally wrong. The head, eyes, mouth, and face tracking are convincing, but arms, torso, hips, legs, and feet need a real retargeting layer before the demo can reliably match recorded human movement.

Future agents should read this before changing:

- `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementSourceSkeleton.tsx`
- `src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.ts`
- `src/app/(dashboard)/demos/movements/_lib/vrmRigging.ts`

Before changing any left/right mapping, display preparation, scoring correspondence, or avatar-side ownership, also read [`movement-mirror-and-side-ownership-contract.md`](./movement-mirror-and-side-ownership-contract.md). It is the canonical rule for the three-party relationship: recorded instructor motion preserves anatomical side, the live player's avatar uses the opposite anatomical side, and the two rendered avatars must therefore perform the same anatomical movement.

Coordinate reflection, preview mirroring, anatomical ownership, and player-to-instructor scoring are separate decisions. Do not use one generic mirror flag or `facing-player` label as a substitute for the side-ownership contract.

The frozen movement demo implementation currently spans these route-local files:

- `src/app/(dashboard)/demos/movements/_components/MovementCapturePanel.tsx` renders capture camera/model/status controls, live tracking indicators, and capture actions.
- `src/app/(dashboard)/demos/movements/_components/MovementDeleteDialog.tsx` is the shared delete confirmation for library/detail cleanup.
- `src/app/(dashboard)/demos/movements/_components/MovementFrameViewer.tsx` renders recorded frame playback for detail and preview-style inspection.
- `src/app/(dashboard)/demos/movements/_components/MovementLibraryTable.tsx` renders the paginated/searchable movement library rows and action buttons.
- `src/app/(dashboard)/demos/movements/_components/MovementSaveDialog.tsx` captures save metadata for a recording before upload.
- `src/app/(dashboard)/demos/movements/_hooks/useMediaPipeVision.ts` loads and shares the MediaPipe vision runtime.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementCapture.ts` owns capture webcam processing, smoothing, frame buffering, skeleton drawing, and tracking-quality state.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementFrames.ts` loads movement rows, resolves storage URLs, parses stored frame payloads, and exposes normalized frame data.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementMatchScoring.ts` drives score/combo feedback and completion state for the play loop.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementMatchSession.ts` owns lobby, avatar selection, playback toggles, calibration reset, rematch, and exit-reset state.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementPlayerTracking.ts` runs the live webcam MediaPipe loop for the player avatar during practice.
- `src/app/(dashboard)/demos/movements/_hooks/useMovementTrackingCalibration.ts` manages live tracking calibration state for the play route.
- `src/app/(dashboard)/demos/movements/_lib/handMatching.ts` compares hand landmarks and hand openness for movement matching.
- `src/app/(dashboard)/demos/movements/_lib/mediaPipeConfig.ts` centralizes MediaPipe model and runtime configuration.
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarProfiles.ts` defines selectable avatar profiles and presentation metadata.
- `src/app/(dashboard)/demos/movements/_lib/movementFrameCodec.ts` parses and normalizes saved movement frame payloads.
- `src/app/(dashboard)/demos/movements/_lib/movementPresentation.ts` formats route-facing movement presentation labels and values.
- `src/app/(dashboard)/demos/movements/_lib/movementScoring.ts` contains pure scoring helpers for angle sync, tolerance, expression, hand matching, and combo behavior.
- `src/app/(dashboard)/demos/movements/_lib/movementSkeleton.ts` draws normalized skeleton previews from movement landmarks.
- `src/app/(dashboard)/demos/movements/_lib/movementTypes.ts` defines the shared movement frame, landmark, metadata, and tracking types.
- `src/app/(dashboard)/demos/movements/_lib/saveMovementRecording.ts` validates capture save inputs, uploads the frame payload, calculates metadata, and creates the movement row.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementCalibrationOverlay.tsx` renders the live calibration overlay before practice.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementCompletionDialog.tsx` renders completion/rematch/exit actions.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementFeedbackOverlay.tsx` renders transient practice feedback.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementHud.tsx` renders score, sync, playback readiness, retry action, and webcam picture-in-picture.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementMatchScene.tsx` composes the Three.js training scene, instructor/player avatars, lights, controls, grid, and debug source skeleton overlays.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementSparkles.tsx` renders the lightweight scene feedback particles.

The business context matters: this is a pitch-critical premium posture / Pilates demo for a client interested in posture coaching for children aged 8-14. The avatar body cannot look broken, disabled, floppy, or artificially puppeted.

## Core Finding

It is possible to correlate the user's movement data to the avatar, but not by directly pushing MediaPipe landmarks into VRM bones.

The failed shortcut is:

```text
MediaPipe landmarks -> Kalidokit / custom bone aiming -> VRM bones
```

That path is unstable because MediaPipe landmarks and VRM avatars do not share:

- Body proportions.
- Rest pose.
- Bone axes.
- Limb lengths.
- Foot contact model.
- Floor height.
- Camera projection and depth scale.
- Avatar-specific shoulder, hip, knee, ankle, and foot orientation.

When the code maps landmarks directly to bones, squats and knee lifts can look exaggerated, twisted, or unrelated to the original recording even when the source tracking data is usable.

## What Went Wrong In The Recent Iterations

Several patches tried to improve squats by classifying lower-body intent:

- `squat`
- `left-knee-raise`
- `right-knee-raise`
- `mixed-lower-body`

That helped diagnostics, but it became dangerous when those labels started driving animation directly. The worst version treated a frame as a squat and then forced a canned crouch pose onto the avatar. That made the instructor look like it was performing an invented motion rather than replaying the recorded movement.

Important rule:

> Labels are useful diagnostics. Labels must not be the primary animation source.

The animation source should be normalized, calibrated movement vectors derived from the recording.

## Source Skeleton Proof Layer

`MovementSourceSkeleton` was added as a debug-only proof tool.

When `?debugTracking=1` is present, it draws a thin skeleton from the raw recorded landmarks over the instructor avatar, and from live landmarks over the student avatar. This is the first thing to inspect before making further rig changes.

Use it to decide where the fault is:

- If the source skeleton matches the intended human movement but the avatar does not, the retargeting is wrong.
- If the source skeleton itself looks wrong, the recording / MediaPipe tracking data is wrong.
- If the skeleton is right in 2D but depth or floor contact is wrong, the retargeter needs camera/depth normalization and foot locking.

Do not remove this debug overlay until a proper retargeting test harness replaces it.

## Correct Architecture

The target pipeline is:

```text
Recorded / live MediaPipe landmarks
  -> frame validation and confidence scoring
  -> neutral-pose calibration
  -> body-relative normalized vectors
  -> avatar rest-pose skeleton map
  -> vector-to-bone retarget solve
  -> foot locking and floor constraints
  -> avatar-profile smoothing and limits
  -> VRM bone application
  -> debug comparison against source skeleton
```

The key difference is that landmarks become a normalized human movement model before they touch avatar bones.

## Required Retargeter

The first dedicated retargeting module now exists:

`src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts`

Expected responsibilities:

- Build a neutral source body model from upright frames.
- Build an avatar rest body model from the VRM humanoid bones.
- Normalize each frame into source vectors:
  - shoulder line
  - hip line
  - spine vector
  - upper arm vectors
  - lower arm vectors
  - thigh vectors
  - shin vectors
  - foot vectors
  - head center offset
  - hip drop
  - foot contact candidates
- Convert source vectors into avatar-local bone rotations.
- Respect avatar-specific rest pose and bone axes.
- Preserve foot contact during squats and weight shifts.
- Return debug metadata explaining what was solved, clamped, held, or rejected.

Current implemented state:

- `movementRetargeting.ts` builds an upright source model, rejects crouched calibration frames, solves segment directions, detects squat depth, identifies single-knee lift vs planted squat contact, and reports solved/held segments.
- `VrmAvatar.tsx` builds an avatar rest-pose map once the VRM loads, then maps source thigh, shin, and foot segment directions onto each avatar's own neutral bone directions.
- Debug mode now reports retarget quality, squat depth, foot contacts, solved segment count, applied lower-body segment count, root drop, and planted squat IK depth.
- Because front-facing squat recordings hide much of the knee bend in depth, `VrmAvatar.tsx` also applies a planted squat IK presentation layer only when the retargeter reports both feet planted. This is not label-driven and should stay tied to `retargetFrame.squatDepth` plus foot contacts.
- `MovementDebugFrameScrubber` appears only under `?debugTracking=1` and controls the same instructor landmark ref that drives the avatar. Use it to pause, step, scrub, or type an exact frame number instead of trying to visually catch a short guided preview.
- Debug scrubbing must keep the instructor in a paused-pose mode. Normal pause can still put the instructor into standby, but `debugTracking=1` must continue applying the selected recorded frame so diagnostics update after manual frame jumps.
- The instructor retarget source model is now chosen from the whole loaded recording by `buildInstructorRetargetSourceModel`, instead of whichever frame the avatar sees first. This matters because the current client test recording starts with low-confidence / crouched frames, and first-frame neutral calibration makes the instructor look permanently squatted.
- `buildInstructorRetargetAnalysis` scans the whole recording and feeds peak-frame hints into the debug scrubber. It ignores weak startup frames for peak squat, requires planted feet for squat hints, and uses good-quality frames for knee hints. Use those hints first for tuning: peak squat, left knee, right knee, and strongest single-knee lift.
- Exact debug frame jumps bypass playback smoothing and reset the instructor filters. Normal playback still uses One Euro smoothing, but manual frame jumps must show the exact selected frame; otherwise squat frames can smear into knee-lift checks and make diagnostics untrustworthy.

Suggested public shape:

```ts
type MovementRetargetCalibration = {
  sourceNeutral: SourceBodyModel;
  avatarRest: AvatarBodyModel;
  floorY: number;
};

type MovementRetargetResult = {
  rotations: Partial<Record<VrmBoneName, THREE.Quaternion>>;
  offsets: {
    hips?: THREE.Vector3;
    head?: THREE.Vector3;
  };
  contacts: {
    leftFoot: boolean;
    rightFoot: boolean;
  };
  debug: {
    sourceQuality: number;
    solvedBones: string[];
    heldBones: string[];
    clampedBones: string[];
  };
};
```

The exact types can differ, but the separation of calibration, solve result, contacts, and debug metadata should remain.

## Neutral Calibration

The retargeter needs an upright baseline. It can be built from the first stable full-body frames or from an explicit calibration step.

Capture:

- Head center.
- Shoulder center and width.
- Hip center and width.
- Torso height.
- Left/right upper arm length.
- Left/right forearm length.
- Left/right thigh length.
- Left/right shin length.
- Left/right foot baseline.
- Floor line from ankle / heel / toe landmarks.

Reject neutral samples when:

- Foot visibility is weak.
- Knees are already deeply bent.
- Hip-to-floor ratio suggests the user is already squatting or seated.
- Shoulder/hip confidence is too low.

## Vector Retargeting

For each limb segment:

1. Read the source vector in body-relative coordinates.
2. Normalize by the source neutral body model.
3. Read the avatar rest vector for the corresponding bone chain.
4. Compute the quaternion from avatar rest vector to source movement vector.
5. Convert to the bone's local space.
6. Apply profile limits.
7. Smooth with a confidence-aware factor.

This should replace the current mix of Kalidokit rotation application, raw `aimVector`, and lower-body label-driven boosts.

## Foot Locking

Squats will not look credible without foot locking.

The rule is:

- During a squat, the feet should remain visually planted unless the source data clearly shows a step or knee raise.
- Hips should move relative to planted feet.
- The avatar root should not bounce up and down in a way that makes the avatar float or sink.

Implementation direction:

- Detect foot contact from toe/ankle/heel stability over several frames.
- Store the planted foot world positions.
- After solving hips/legs, correct hip/root offset so planted feet remain near the floor.
- Clamp correction to avoid snapping.
- Release a foot lock when the source knee/foot clearly lifts.

Current interim behavior:

- The demo gates visible root drop and planted squat IK on both-foot contact so single-knee raises do not pull the whole avatar downward.
- `VrmAvatar.tsx` now stores left/right planted foot world positions while both feet are in contact, then applies a conservative post-solve root correction to reduce lateral foot drift and damp vertical foot bounce.
- Debug mode appends `lock`, `corr`, and `drift` values to the retarget row. A healthy planted squat frame should show `lock` approaching `1.00` with small `corr` values.
- Instructor root drop is capped lower than player root drop. The hips and planted squat IK should carry most of the visual squat so the avatar does not look like the entire model is jumping down through the floor.
- Squat depth uses a soft hip-drop ramp instead of raw hip drop. Raw `hip` remains visible in diagnostics, but only committed hip movement drives `squatDepth`, root drop, and planted squat IK. This prevents later near-standing frames from staying in a permanent squat while preserving the early deep-squat frames.
- Foot lock has a large-drift reset guard. If a planted lock sees an impossible jump, it re-anchors rather than applying stale correction. This protects exact debug jumps and real tracking glitches from dragging old foot targets into a new pose.
- This is intentionally conservative so it does not cancel the visible squat. A production-quality pass can move this into a tested helper and use stronger per-foot IK, but do not replace it with a root-only drop.

## Diagnostics And Acceptance

Keep `?debugTracking=1` useful.

At minimum, debug mode should show:

- Source skeleton overlay.
- Lower-body intent label, but only as diagnostics.
- Foot contact state.
- Retarget source quality.
- Held/clamped bones.
- Floor mode.

Acceptance criteria for the next serious pass:

- Source skeleton and avatar agree on upright, squat, and knee-lift timing.
- Avatar no longer enters a permanent squat unless the source skeleton does.
- Avatar does not use a canned squat pose.
- Feet remain grounded during squats.
- Knee lifts do not look like broken squats.
- Head/eyes/mouth quality does not regress.
- Debug overlay can prove whether a mismatch is source-data or retargeting.

## What Not To Do

Do not:

- Drive animation primarily from labels such as `squat` or `left-knee-raise`.
- Add more one-off multipliers in `VrmAvatar` to chase a single recording.
- Reintroduce a canned squat pose that overwrites the recorded limb vectors.
- Treat Kalidokit output as final without avatar rest-pose correction.
- Hide the source skeleton proof while body motion is still being tuned.
- Assume a new recording will fix retargeting issues without first checking the source skeleton.

## Practical Next Step

Completed from the original plan:

1. Created `movementRetargeting.ts`.
2. Added synthetic upright, squat, and knee-lift tests.
3. Built source neutral calibration from stable upright frames.
4. Built avatar rest vectors inside `VrmAvatar` once the VRM loads.
5. Replaced direct lower-body application with retargeted vector solves for hips, thighs, shins, and feet, with a legacy fallback.
6. Kept the source skeleton overlay enabled in debug mode to compare source vs avatar.
7. Added an exact-frame debug scrubber, structured retarget metrics, and a regression test for selecting the most neutral source model from the recording.

Next useful implementation pass:

1. Extract the avatar rest-map and planted squat IK helpers out of `VrmAvatar.tsx` into a small tested module.
2. Promote the interim foot lock into a tested helper with per-foot correction limits and explicit release tests for knee raises.
3. Use the debug scrubber to tune exact squat, upright, and knee-lift frames from the recorded sequence. For the current recording, the cleaned analyzer now reports peak squat around frame `23`, not the low-quality startup frame `1`. In the latest browser sample: frame `23` showed `s1.00`, hip `1.00`, root drop `0.56`, IK `1.00`, lock `1.00`, correction `0.02`, and drift `0.04`; frame `1850` showed `s0.00`, root drop `0.00`.
4. For knee-lift checks on the current recording, the analyzer reports strongest single-knee lift at frame `851`, and another important knee-lift frame at `1067`. At those frames, the live debug panel showed squat `0.00`, root drop `0.00`, and foot lock `0.00`, which is the desired behavior for one-leg raises. Exact readings after the smoothing bypass: frame `851` had quality `0.98`, knee `0.77/0.00`, feet `-R`, drift `0.00`; frame `1067` had quality `0.99`, knee `0.00/0.56`, feet `L-`, drift `0.00`.
5. Extend retargeting to arms/torso with the same rest-pose mapping approach after the lower body is stable.

This is the path with the best chance of making the demo commercially credible.
