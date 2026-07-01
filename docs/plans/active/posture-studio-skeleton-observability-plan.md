# Posture Studio Skeleton Observability Plan

Last reviewed: 2026-07-01
Status: proposed
Scope: option C from the avatar recovery brainstorm: add a skeleton truth and replay layer so posture studio avatar bugs can be diagnosed quickly instead of tuned by guesswork.

## Goal

Make the movement demo observable enough that a broken avatar frame can be classified in minutes.

The current failure mode is too blended. When the player avatar stands upright during a squat, lifts the wrong leg, loses hands, or fails at webcam distance, the team still has to ask one vague question:

```text
Why does the avatar look wrong?
```

This plan replaces that with a visible, testable pipeline:

```text
raw MediaPipe landmarks
  -> normalized truth skeleton
  -> retarget frame / ownership
  -> avatar bones
  -> screenshot and debug proof
```

The point is not more UI for its own sake. The point is faster diagnosis:

```text
Raw landmarks wrong:
  camera / MediaPipe / recording problem

Raw landmarks right, truth skeleton wrong:
  normalization / calibration problem

Truth skeleton right, avatar wrong:
  retargeting / VRM bone mapping problem

Avatar right, score wrong:
  scoring / coaching / eval problem
```

## Why This Matters

The instructor, capture, and player avatar should not feel like three separate systems. They should share a motion contract.

The latest debugging showed that distance from the webcam is not a rare edge case. The user must step back to fit their whole body in frame, which reduces landmark confidence even when the visible skeleton still looks correct. Without a truth layer, that becomes a confidence-threshold argument. With a truth layer, it becomes a simple comparison:

- Did the full-body skeleton still show the squat or leg raise?
- Did the normalized body model preserve the squat or leg raise?
- Did the avatar receive and apply that body model?

This plan supports the longer-term direction in [Movement Demo Retargeting Approach](../../developer/movement-demo-retargeting-approach.md): source-skeleton proof, neutral calibration, vector retargeting, foot locking, and debug comparison instead of label-driven animation.

## Non-Goals

- Do not rewrite the movement demo as a production motion-capture platform.
- Do not replace the working instructor playback path while it is useful.
- Do not hide uncertainty by adding more canned poses.
- Do not make labels such as `squat` or `left-leg-raise` the primary animation source.
- Do not require the user to manually test every iteration before we have synthetic proof.
- Do not commit generated Playwright reports, screenshots, or scratch capture artifacts unless explicitly requested.

## Definitions

### Raw Landmarks

The direct MediaPipe-shaped pose, face, hand, and optional `worldLandmarks` frame data. This is what capture and live webcam tracking produce.

### Truth Skeleton

A normalized, body-relative skeleton derived from raw landmarks and calibration. It should be independent of VRM model quirks and stable across recorded instructor frames, live player frames, and synthetic eval frames.

It should expose:

- joint positions in a normalized coordinate space.
- segment vectors for spine, shoulders, hips, upper arms, lower arms, thighs, shins, and feet.
- per-joint and per-segment confidence.
- body scale, floor estimate, foot contact candidates, hip drop, knee lift, and torso lean.
- source status such as `raw`, `held-last-good`, `synthetic`, `low-confidence`, or `rejected`.

### Retarget Frame

The avatar-facing output of the truth skeleton. It decides which body segments are safe to apply, what was clamped or held, and which owner path is responsible for each visible body area.

### Proof Artifact

A repeatable debug frame, screenshot, metrics JSON, or Playwright attachment that shows exactly what the raw source, truth skeleton, and avatar did for the same movement moment.

## Target Diagnostic View

`?debugTracking=1` should eventually show three synchronized views for both instructor and player:

```text
Raw source skeleton | Truth skeleton | Avatar result
```

The debug panel should include compact rows for:

- frame id / timestamp / source type.
- calibration quality and body scale.
- head, torso, left arm, right arm, left leg, right leg, and feet confidence.
- spine side bend, torso lean, hip drop, left knee lift, right knee lift.
- left/right foot contact and floor lock state.
- owner labels for spine, arms, lower body, feet, and head.
- solved, held, rejected, and clamped segment counts.
- a copyable or downloadable bad-frame payload for replay.

The display should make it visually obvious whether the skeleton or the avatar is lying.

## Phase 1: Truth Skeleton Contract

Goal: define one normalized skeleton data contract shared by recorded, live, and synthetic movement frames.

Tasks:

- Add a dedicated truth-skeleton module under the movement demo library.
- Convert raw landmarks into normalized body-relative joints and segment vectors.
- Include confidence and source status on every joint and segment.
- Preserve enough data to distinguish:
  - close full-confidence movement.
  - far-camera lower-confidence movement.
  - missing feet or wrists.
  - held-last-good fallback.
  - synthetic proof input.
- Unit test neutral standing, side bend, squat, left leg raise, right leg raise, far squat, and far leg raises.

Acceptance:

- The same truth-skeleton builder accepts recorded instructor frames, live player frames, and synthetic proof frames.
- Far-camera poses keep their movement intent in vectors even when confidence is lower.
- Neutral calibration and body scale are explicit inputs, not hidden inside avatar rendering.

## Phase 2: Debug Overlay And Frame Inspector

Goal: make the truth skeleton visible beside raw landmarks and the avatar.

Tasks:

- Extend the existing source-skeleton debug overlay with a separate truth-skeleton overlay.
- Use distinct colors or line styles for raw source and normalized truth.
- Add a compact debug panel section for truth-skeleton metrics.
- Show instructor and player diagnostics separately.
- Keep the overlay available under `?debugTracking=1` and out of the normal client demo path.
- Make exact frame jumps update raw skeleton, truth skeleton, retarget metrics, and avatar together.

Acceptance:

- A developer can pause a frame and compare raw skeleton, truth skeleton, and avatar without reading code.
- A screenshot of debug mode is enough to classify most failures.
- If the truth skeleton is correct but the avatar is wrong, the debug view points to retargeting instead of tracking.

## Phase 3: Bad-Frame Capture And Replay

Goal: stop relying on the user to recreate a broken movement.

Tasks:

- Add a debug-only action to capture the current diagnostic frame.
- Store the raw frame, truth skeleton, calibration snapshot, retarget output, owner labels, and useful metrics.
- Keep captured artifacts in a non-committed scratch location such as `tmp/movement-debug-frames/`.
- Add a replay path that can load one captured frame into the proof route or a dedicated debug route.
- Add a small fixture format that can be promoted into tests when a failure is important.

Acceptance:

- A live-camera failure can be saved once and replayed deterministically.
- The replay path does not require camera access.
- Captured bad frames can become regression fixtures without preserving unrelated user video.

## Phase 4: Evals That Prove Each Layer

Goal: make the automated proof answer more than "the avatar screenshot changed."

Tasks:

- Extend `npm run eval:movement-avatar` or add a sibling eval for skeleton observability.
- For each synthetic movement, assert:
  - raw source frame contains expected landmarks.
  - truth skeleton contains expected segment vectors and confidence states.
  - retarget frame reports expected owners and solved/held segments.
  - avatar screenshot is visually distinct from standing where appropriate.
- Include far-camera cases for squat, left leg raise, and right leg raise.
- Add screenshot attachments for raw skeleton, truth skeleton, and avatar result.
- Add metrics attachments for confidence, segment vectors, owner labels, and silhouette differences.

Acceptance:

- A broken movement test says which layer failed.
- Far-camera full-body operation is part of the default proof, not an optional manual check.
- The user is not asked to test until synthetic replay proves that the code can express the target motion.

## Phase 5: Shared Motion Contract For Instructor And Player

Goal: prepare the cleaner path where instructor and player use the same skeleton-to-retarget contract.

Tasks:

- Feed instructor playback through the truth-skeleton contract without changing visible behavior.
- Feed live player tracking through the same contract.
- Keep separate calibration sources, but normalize the output shape.
- Move player-specific fallback decisions into retarget metadata rather than scattered `VrmAvatar` branches.
- Keep `VrmAvatar` focused on applying a retarget frame to VRM bones.

Acceptance:

- Instructor and player debug data use the same schema.
- A saved instructor frame and a live/synthetic player frame can be compared with the same tooling.
- New motion fixes target the contract or retargeter instead of one-off avatar branches.

## Recommended Implementation Order

1. Add the truth-skeleton types and builder with unit tests.
2. Wire synthetic proof poses through the truth-skeleton builder.
3. Render truth skeleton beside raw skeleton on the proof route.
4. Add truth-skeleton metrics to debug state and Playwright attachments.
5. Add debug-only bad-frame capture and deterministic replay.
6. Move instructor and player retarget inputs toward the shared truth-skeleton contract.

## Verification Gates

Focused checks:

```bash
npm run eval:movement-avatar
npm run test:run -- 'src/app/(dashboard)/demos/movements'
```

Repository gate before merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Proof artifacts should be summarized in the handoff, but generated reports and scratch frames should stay uncommitted unless explicitly requested.

## Stop Conditions

Pause and reassess if:

- The truth skeleton requires a broad capture/storage schema migration before it can be useful.
- The debug view becomes too visually noisy to classify failures.
- The captured frame format contains unnecessary video, biometric, or personal data.
- A proposed fix starts driving body animation primarily from labels rather than segment vectors.
- Instructor playback regresses while adding player observability.

## Success Criteria

This plan is successful when a future failure can be classified like this:

```text
User reports: "The avatar stands up when I squat far from camera."

Debug/replay shows:
  raw skeleton = squat
  truth skeleton = squat with lower confidence
  retarget = lower body held
  avatar = standing

Conclusion:
  retarget gate bug, not capture bug.
```

That is the whole point: fewer circles, faster fixes, and a path toward one shared movement contract for capture, instructor, and player avatar.
