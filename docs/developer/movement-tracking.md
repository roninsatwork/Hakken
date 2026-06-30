# Movement Tracking Developer Notes

The movement tracking implementation is part of the temporary posture studio demo. The source is frozen by `AGENTS.md`; update these notes when the implementation is audited, but do not refactor or expand the demo unless the user explicitly reopens it or a required quality gate is broken.

Related documents:

- [Temporary Posture Studio Demo](./temporary-posture-studio-demo.md) describes the product surface, routes, storage model, and verification commands.
- [Movement Demo Retargeting Approach](./movement-demo-retargeting-approach.md) records the intended direction if avatar body motion is explicitly reopened.

## Implemented Surface

The demo lives under:

- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `src/app/(dashboard)/demos/movements/**`
- `convex/movements.ts`

The route set is:

- `/demos/movement-capture` for capture and save.
- `/demos/movements` for the saved movement library.
- `/demos/movements/[id]` for review and frame inspection.
- `/demos/movements/[id]/play` for guided practice and player matching.

The play route accepts `guidedPreview=1` for guided-preview mode and `debugTracking=1` for the tracking debug overlays and frame scrubber. The route combines saved instructor frames, live player vision output, calibration state, match scoring, and avatar rendering in `src/app/(dashboard)/demos/movements/[id]/play/page.tsx`.

## Capture And Storage Flow

`useMediaPipeVision` owns MediaPipe task setup for pose, face, and hand landmarkers. `useMovementCapture` samples the live vision output, tracks frame quality, and passes movement frames to `saveMovementRecording`. Saved frames include pose landmarks, optional `worldLandmarks`, face landmarks, blendshapes, and hand captures when available.

`movementFrameCodec` is the compatibility boundary for saved frame payloads. The backend supports current and legacy frame shapes through `convex/movements.ts`:

- `storage-json-v1` for the current storage-backed JSON payload.
- `legacy-storage-json` for older storage-backed JSON payloads.
- `legacy-inline-json` for older inline movement records.

Keep new documentation aligned with those format names. Do not describe a migration as complete unless the legacy readers are removed from the implementation.

## Playback Pipeline

`useMovementFrames` loads the saved recording into the review and play surfaces. `useMovementInstructorPlayback` then turns saved instructor frames into the current instructor motion frame, applies smoothing filters, compensates for instructor lag, and builds retarget analysis from the saved pose sequence.

The shared smoothing utility is `src/lib/math/OneEuroFilter.ts`. It exports `OneEuroFilter` for one-dimensional signal smoothing and `PoseFilterWrapper` for per-landmark `x`, `y`, and `z` smoothing with timestamp-aware filtering. Capture, player tracking, and instructor playback use this helper to reduce landmark jitter while preserving sudden enough motion for the temporary demo. Because this is inside the frozen movement-demo support surface, document current behavior but do not tune filter parameters from this automation.

Instructor retarget analysis is derived from `movementRetargeting`:

- `buildInstructorRetargetSourceModel` scans saved frames for the best neutral source body model.
- `solveMovementRetargetFrame` computes per-frame hip drop, knee lift, squat depth, planted foot contact, solved segments, held segments, and source quality.
- The playback hook exposes peak left-knee lift, peak right-knee lift, peak single-knee lift, and peak squat frames for the debug and matching surfaces.

`MovementMatchScene` renders the instructor and player avatars together. `MovementDebugFrameScrubber`, `MovementTrackingDebugOverlay`, and `MovementSourceSkeleton` expose the debug data when `debugTracking=1` is present.

## Live Player Calibration

`useMovementTrackingCalibration` manages neutral-stance calibration for the player. It requires vision readiness, runs a three-second countdown, samples for about 1.6 seconds, and requires at least 12 valid samples before accepting a calibration. Operators can reset or skip calibration; skipped calibration leaves the avatar on fallback behaviour rather than a stored neutral model.

`movementTrackingCalibration` builds and averages calibration samples. The calibration model records body centers, floor estimate, head neutral, limb visibility, floor correction, lower-body intent, and debug warnings. Current lower-body labels include neutral, squat, single-knee raise, and mixed lower-body states. These labels are diagnostics for the current implementation, not a license to drive future body animation primarily from canned pose labels.

The same module summarizes tracking health into actionable warnings such as missing calibration, weak calibration, floor fallback, low foot confidence, held last-good foot pose, and left/right foot confidence imbalance.

## Retargeting Model

`movementRetargeting` is the source-model retargeting layer for saved instructor frames. It builds a neutral source model only when body quality is high enough and the detected pose is upright. The source model stores floor position, hip and shoulder centers, torso height, neutral knee lift, source quality, and normalized segment directions for spine, arms, thighs, shins, and feet.

For each frame, the solver:

- Rebuilds visible body segments and records solved versus held segments.
- Measures hip drop against the neutral source model.
- Measures left and right knee lift against neutral knee lift.
- Computes squat depth from hip drop and symmetric knee-bend evidence.
- Treats feet as planted when confidence and floor proximity support contact, or during a symmetric squat.

This matches the documented future direction in [Movement Demo Retargeting Approach](./movement-demo-retargeting-approach.md): use a source-skeleton proof, neutral calibration, vector/segment evidence, and foot contact rather than a stack of canned body poses.

## VRM Solver And Coordinate Rules

`vrmRigging` is the compatibility layer between MediaPipe-shaped movement frames, Kalidokit, and VRM avatar bones. It normalizes tuple and object landmarks, prefers `worldLandmarks` when present, synthesizes a 2D fallback when world landmarks are missing, mirrors instructor data for player-facing playback, mirrors hand payloads and blendshape sides, and calls Kalidokit pose and hand solvers.

The coordinate rules below are still the fragile part of the demo. Preserve them unless the user explicitly reopens avatar body motion and the implementation is changed with tests.

MediaPipe and Three.js use different conventions:

- MediaPipe image landmarks use positive Y downward.
- MediaPipe `worldLandmarks` provide depth-aware pose data for the solver.
- Three.js uses positive Y upward.
- Native VRM models face `-Z`.

The current implementation relies on a root-group orientation for the avatar presentation and careful solver input preparation. Avoid casual sign changes in the 2D fallback, hand mirroring, or absolute limb vectors; those changes can make limbs cross, flip sides, or face away from the camera.

When recordings do not include `worldLandmarks`, the 2D fallback must keep the same broad coordinate shape expected by the solver. Do not invert fallback X just to make the rendered avatar face the camera. Presentation orientation belongs at the avatar/group layer, while solver input should remain consistent with the source landmarks.

## Debug And Verification

The implementation has focused tests for the movement helpers:

- `src/app/(dashboard)/demos/movements/_lib/movementRetargeting.test.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.test.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarProfiles.test.ts`
- `src/app/(dashboard)/demos/movements/_lib/saveMovementRecording.test.ts`

When documentation-only automation audits this area, source reads are allowed but source edits are not. If the current behaviour needs product or code changes, report that the user must explicitly reopen the movement demo rather than changing the frozen files from this automation.
