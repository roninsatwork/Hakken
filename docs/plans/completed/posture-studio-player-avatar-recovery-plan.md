> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Posture Studio Player Avatar Recovery Plan

Last reviewed: 2026-07-01
Status: proposed
Scope: live player avatar behavior on `/demos/movements/[id]/play`, especially spine, torso, hands, squats, and leg raises.

## Goal

Restore confidence in the live player avatar after the posture studio refactor.

The latest recorded routine, `Full Spinal Flow`, proves the instructor side can replay a new spine-focused movement well. The problem is therefore not capture, saved frames, movement metadata, or VRM capability in general. The problem is that the live player avatar is still driven by a different, more fragile pipeline than the instructor avatar.

The goal is a demo-safe player avatar that visibly follows the user's main posture intent:

- Side bends and spinal flow should move the player's torso and chest.
- Hands should stay on the correct side of the body and not jump behind the avatar.
- Squats should bend down when the user squats and return when the user stands.
- Single-leg raises should read as a lifted leg rather than a broken squat or frozen neutral stance.
- Debug mode should make the active body owner obvious.

This plan is intentionally narrower than a full biomechanics rewrite. It is a recovery pass for the client-facing posture demo.

## Current Finding

The instructor and player now have different reliability profiles:

```text
Instructor
  recorded frames
  -> instructor retarget source model
  -> replay / retarget analysis
  -> avatar output that currently looks good

Player
  live webcam frames
  -> calibration and auto-calibration gates
  -> Kalidokit pose solve
  -> custom aim vectors
  -> retarget fallback
  -> movement-intent labels
  -> special squat presentation path
  -> avatar output that can fail badly
```

The spine work added useful landmark-based scoring and coaching, but it did not make the player avatar render from that spine model. The player avatar still relies mostly on `VrmAvatar.tsx` ownership decisions, calibration state, legacy aim-vector logic, and lower-body fallback paths.

Most important current code smells:

- Player torso ownership is tied too closely to lower-body readiness. A side bend can be detected for scoring while the visible avatar torso remains neutral.
- The lower body has multiple overlapping owners: stable squat presentation, retarget, legacy aim-vector fallback, and neutral easing.
- Far-camera player movements can produce enough landmark evidence to detect a squat or leg raise while still failing the older hip-confidence gate, so the avatar can stand upright precisely when the user steps back to get their whole body in the webcam frame.
- The recent stable squat path avoids one inversion but bypasses real leg detail, so leg raises and mixed movements can still fail.
- Player arm aiming still uses live image landmarks plus a small Z component. That can put hands behind the avatar when MediaPipe depth is noisy or sign-flipped.
- Some uncalibrated lower-body fallback data blurs squat depth and knee raise values, making intent ownership harder to reason about.

## Non-Goals

- Do not refactor the entire movement demo.
- Do not rewrite capture or instructor playback while they are proving good recordings.
- Do not make the temporary movement demo a full production motion-capture product.
- Do not drive all animation from labels alone. Labels can choose a guarded presentation mode, but the pose should still come from calibrated landmark evidence where available.
- Do not remove `?debugTracking=1`; it is essential for checking the fix.

## Recovery Strategy

Introduce a small player-avatar controller layer that sits between live landmarks/spine intent and VRM bone application.

The controller should make explicit, stable ownership decisions for the player:

```text
live player landmarks
  -> calibrated spine and body evidence
  -> player avatar controller
  -> torso/spine owner
  -> arms/hands owner
  -> lower-body owner
  -> VRM bone application
  -> debug owner labels
```

The key change is separation of concerns:

- Spine and torso should be allowed to animate from spine evidence even when lower-body tracking is not ready.
- Arms should use a safe 2D-first player mode unless reliable world depth is proven.
- Lower body should choose between squat, single-leg raise, planted stance, and neutral deliberately.
- Instructor playback should keep the more detailed recorded retargeting path.

## Phase 1: Stabilize Player Spine Ownership

Goal: make side bends and spinal flow visible on the player avatar.

Tasks:

- Add a player spine drive derived from the existing spine model or equivalent shoulder/hip landmarks.
- Decouple player spine/chest/upperChest animation from `shouldApplyLowerBody`.
- Let torso animation require torso confidence and calibration, not foot/knee readiness.
- Apply conservative side-bend, rotation, and forward/back lean to `spine`, `chest`, and `upperChest`.
- Keep head calibration separate so head motion does not drag the whole torso into a bad pose.
- Add debug owner text such as `player-spine-model`, `player-spine-neutral`, or `player-spine-held`.

Acceptance:

- On `Full Spinal Flow`, the player avatar side-bends when the user side-bends.
- Torso motion continues when knees or feet briefly lose confidence.
- Standing neutral returns the torso to neutral without waiting for lower-body retargeting.
- Debug mode clearly shows that the spine is not being blocked by lower-body readiness.

## Phase 2: Make Player Arms Demo-Safe

Goal: keep hands and forearms in plausible front/side space.

Tasks:

- Add a player-safe arm mode that primarily follows 2D shoulder, elbow, and wrist shape.
- Clamp or ignore live player Z unless `worldLandmarks` are available and pass a confidence/sign sanity check.
- Bias wrists and elbows forward when hands are near the torso and visible.
- Continue using hand landmarks for finger curls, but do not let finger solving fight wrist/forearm placement.
- Add debug owner text such as `player-safe-arms`, `player-world-arms`, or `relaxed-arm`.

Acceptance:

- Hands raised in front of the body do not go behind the avatar.
- Left and right arms do not swap or collapse during side bends.
- Fingers can still open and curl without moving the entire hand to an impossible position.

## Phase 3: Split Squat And Leg-Raise Ownership

Goal: stop squats and single-leg raises from fighting each other.

Tasks:

- Replace ambiguous lower-body ownership with explicit player states:
  - `neutral`
  - `planted-squat`
  - `left-leg-raise`
  - `right-leg-raise`
  - `mixed-lower-body`
  - `held`
- Keep planted squat presentation only when both-foot contact or strong symmetric squat evidence exists.
- Add a single-leg raise presentation path that lifts one thigh/shin while keeping the opposite foot planted.
- Stop treating uncalibrated symmetric knee bend as both knee raises in downstream debug/drive state.
- Keep root drop for planted squats only; do not root-drop for single-leg raises.

Acceptance:

- Squat down makes the avatar bend down.
- Standing returns the avatar upright.
- Raising one knee does not trigger a squat.
- Single-leg raises visibly lift the correct leg without pulling both hips downward.

## Phase 4: Unify Debug And Proof

Goal: make future tuning fast and less speculative.

Tasks:

- Show separate debug rows for player spine, arms, and lower-body owners.
- Include raw evidence values in debug mode:
  - torso side bend
  - shoulder/hip tilt
  - arm source and Z mode
  - squat depth
  - left/right knee raise
  - foot contact
- Update or extend the proof route to include:
  - side bend
  - hands in front
  - planted squat
  - far-camera planted squat with smaller/lower-confidence landmarks
  - far-camera left and right leg raises with smaller/lower-confidence landmarks
  - left knee raise
  - right knee raise
- Keep instructor and player debug registries separate.

Acceptance:

- A failing live-camera test can be diagnosed by reading debug owner labels.
- Synthetic proof can show whether a problem is in detection or VRM bone application.
- The current good instructor playback remains unchanged.

## Phase 5: Verification

Goal: protect the recovery path without over-testing the temporary demo.

### Proof Without User Testing

The user should not be the first proof that the avatar recovery works. Before asking for a live-camera opinion, the implementation should produce repeatable evidence from controlled inputs.

The proof strategy is:

- Unit tests prove intent selection and drive math:
  - neutral spine returns to neutral.
  - side-bend landmarks produce spine/chest rotation.
  - player arm depth is clamped in safe mode.
  - squat and single-leg raise choose different lower-body states.
- Synthetic avatar proof proves the rendered VRM code path:
  - feed controlled synthetic player landmark frames into the same `VrmAvatar` component.
  - run side bend, hands-front, planted squat, far-camera planted squat, left-leg raise, far-camera left-leg raise, right-leg raise, and far-camera right-leg raise poses.
  - assert debug owner labels such as `player-spine-model`, `player-2d-safe-arms`, `player-stable-squat`, and `player-left-leg-raise`.
  - capture Playwright screenshots for each pose.
- Browser-level visual proof checks that the scene is not merely "tests green":
  - the player avatar canvas renders nonblank pixels.
  - side-bend screenshots show the torso/chest tilted relative to neutral.
  - hands-front screenshots do not show forearms disappearing behind the torso.
  - squat screenshots show lower hips/knee bend versus neutral.
  - leg-raise screenshots show only the selected leg raised.
- Debug registry proof reads `window.__sonaeMovementRetargetDebug.player` and the tracking debug ref to confirm the live player path is using the expected owners.

Artifacts should be saved under a non-committed scratch path such as `tests/artifacts/movement-player-avatar-proof/` or `tmp/movement-player-avatar-proof/`, then summarized in the handoff. These artifacts are not committed unless explicitly requested.

This does not replace a real-camera smoke pass. It does prove that the code can make the player avatar perform the target motions before the user spends time testing it.

Automated checks:

- Unit tests for player spine-drive math.
- Unit tests for safe arm Z clamping.
- Unit tests for lower-body state selection.
- Existing movement tests remain green.
- `npm run eval:movement-avatar` runs `e2e/movement-avatar-proof.eval.spec.ts`.
- Playwright synthetic proof for neutral, side bend, hands forward, squat, left leg raise, and right leg raise.
- Playwright synthetic proof for far-camera squat and far-camera leg raises, so lower body does not silently return to upright when hip confidence drops but whole-body movement evidence remains clear.
- Debug-owner assertions for player spine, arms, and lower body.
- Screenshot pixel assertions confirm the right-side player-avatar region is visibly rendered.
- Screenshot silhouette assertions compare squat and leg-raise renders against standing so visually identical poses fail the eval.
- Playwright screenshots are attached to the eval report for each synthetic webcam pose.

Manual smoke:

- Record or use `Full Spinal Flow`.
- Play the movement with `?debugTracking=1`.
- Calibrate in a neutral standing pose.
- Test side bend left/right.
- Test hands forward and hands overhead.
- Test squat down/up.
- Test left and right knee raise.
- Confirm instructor still matches the recording.
- Confirm player debug owners match the visible behavior.

Local gate before merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Implementation Order

1. Add the player spine-drive helper and wire torso/chest ownership through it.
2. Add focused tests for side-bend and neutral return.
3. Add player-safe arm Z handling.
4. Add explicit lower-body state selection for squat vs leg raise.
5. Update debug labels and proof scenarios.
6. Run focused tests, then the full local gate.
7. Do a real-camera smoke pass on `Full Spinal Flow`.

## Stop Conditions

Pause and reassess if:

- The source skeleton is visibly wrong in debug mode.
- Calibration cannot produce stable torso/hip baselines.
- The player avatar fails synthetic proof poses.
- A fix requires broad refactoring of capture, storage, instructor playback, or schema.

If those happen, the issue is larger than the player-avatar recovery slice and should be split into a separate plan.
