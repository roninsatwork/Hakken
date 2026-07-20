> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Movement Demo Whole-Body Tracking Accuracy Plan

Last reviewed: 2026-06-03
Status: in progress, implementation largely complete, pending real-camera tuning
Scope: movement demo tracking, calibration, avatar rigging, debug tooling, and manual validation. This is not a full production fitness-product rewrite.

## Goal

Make the movement demo avatar feel reliable and accurate across the whole body: head, torso, shoulders, arms, hands, hips, legs, and feet. The target is a believable client-demo character that follows the user consistently, recovers gracefully when tracking confidence drops, and can be debugged without guesswork.

The immediate motivating issue is that the user's real head can be looking at the camera while the avatar looks down. Similar issues can appear in the right arm, wrists, shoulders, knees, or feet when raw tracking data, coordinate systems, smoothing, and VRM bone offsets are mixed too directly.

## Non-Goals

- Do not turn the demo into a production biomechanics engine.
- Do not add heavy load tests for the movement demo.
- Do not make the shared demo records tenant-scoped.
- Do not rewrite the whole play route again before the current refactor is committed or intentionally continued.
- Do not hide tracking flaws with only visual smoothing; the solver needs better inputs and calibration.

## Current Problem Model

The current movement pipeline is roughly:

1. MediaPipe produces pose, face, and hand landmarks.
2. Filters smooth those landmarks.
3. Kalidokit and custom vector aiming convert landmarks into VRM bone rotations.
4. The avatar applies those rotations with fixed smoothing and a few fallback rules.

This works, but it is fragile because:

- The user's neutral pose is not calibrated.
- The avatar's neutral VRM bone offsets are not calibrated.
- Head orientation is inferred partly from pose landmarks instead of a robust face-based solve.
- Arms can depend too heavily on low-confidence pose wrists.
- Hands, pose wrists, elbows, and shoulders are not solved as one coherent chain.
- Legs and feet do not have strong floor, knee-direction, or foot-orientation constraints.
- Confidence fallbacks are not consistently visible or tunable per body part.
- Debugging is mostly visual, so fixes can become per-limb guesswork.

## Target Architecture

Introduce a clearer tracking pipeline:

```text
MediaPipe raw landmarks
  -> normalized tracked body frame
  -> calibrated user skeleton
  -> confidence-aware body-part solver
  -> avatar profile offsets
  -> VRM bone application
  -> debug overlay and manual smoke checks
```

The important change is that MediaPipe data should not drive avatar bones directly. It should first become a calibrated, confidence-aware body model that can be inspected and tested.

## Phase 1: Instrumentation And Debug View

Goal: make tracking problems visible before tuning them.

Status: implemented. Debug mode is gated behind `?debugTracking=1` and now reports a compact readiness panel with body-part confidence, fallback sources, head raw/applied angles, avatar profile name, missing/weak calibration detection, head clamp pressure, arm imbalance/last-good detection, foot/floor fallback detection, stale-frame detection, health warnings, a primary tuning action, and a readiness score for manual tuning.

Tasks:

- Add a developer/debug toggle on the play route, hidden by default.
- Show raw pose skeleton, solved canonical skeleton, and avatar bone targets.
- Show per-body-part confidence:
  - head
  - torso
  - left/right shoulder
  - left/right elbow
  - left/right wrist
  - left/right hand
  - hips
  - left/right knee
  - left/right ankle
  - left/right foot
- Show current head pitch, yaw, and roll before and after avatar offsets.
- Show which fallback is active for each body part:
  - live tracking
  - blended hand target
  - last-good pose
  - eased neutral
- Add debug numbers without changing normal user-facing demo UI.

Acceptance:

- We can see why the avatar head is looking down: raw input, calibrated input, avatar offset, or final clamp.
- We can inspect right/left limb confidence during real webcam use.
- Debug mode does not appear in the normal demo flow.

## Phase 2: Calibration Step

Goal: establish the user's neutral pose and the avatar's neutral correction before a session begins.

Status: implemented. Sessions show a countdown before collecting neutral calibration samples, reject weak tracking, expose recalibration from the HUD, allow continuing without calibration for manual tuning, and keep calibration in session state only.

Tasks:

- Add a short calibration step before play starts.
- Ask the user to face the camera in a neutral standing pose for about two seconds.
- Capture:
  - head neutral pitch/yaw/roll
  - shoulder width
  - hip center
  - torso height
  - left/right wrist positions
  - floor estimate from feet or avatar baseline
- Store calibration only in session state for now.
- Add recalibrate action in the HUD/debug controls.
- If calibration quality is too low, show in-app guidance instead of starting with bad offsets.

Acceptance:

- A user looking at the camera calibrates as avatar looking at the camera.
- Recalibration fixes bad head/torso offsets without refreshing the page.
- Calibration failure has clear in-app guidance.

## Phase 3: Head And Neck Accuracy

Goal: fix the most visible trust issue first: the avatar head should look where the user is looking.

Status: implemented, pending real-camera tuning. Head orientation prefers face landmarks, applies neutral calibration and profile offsets, clamps pitch/yaw/roll, and splits motion between head and neck.

Tasks:

- Prefer face landmarks/blendshapes for head orientation rather than only pose nose/ears.
- Convert face-derived pitch/yaw/roll into the same coordinate convention as the VRM head bone.
- Apply the calibrated neutral head offset from phase 2.
- Add avatar-profile head pitch/yaw correction.
- Clamp downward pitch more aggressively so a bad solve does not make the character stare at the floor.
- Split head and neck contribution so the head does not over-rotate alone.

Acceptance:

- When the user looks straight at the camera, the avatar looks straight ahead.
- Looking up/down/left/right is recognizable without exaggerated drift.
- Temporary face confidence loss holds the last good head pose briefly, then eases toward neutral.
- Debug view clearly shows raw head angles, calibrated angles, and applied angles.

## Phase 4: Arms, Wrists, And Hands As Coherent Chains

Goal: make both arms reliable, with wrists and hands reinforcing forearm motion rather than fighting it.

Status: implemented, pending real-camera tuning. Wrist endpoints select between pose, hand tracker, and last-good fallback by confidence; arm and hand response values now live in avatar profiles.

Tasks:

- Solve each arm as a chain:
  - shoulder target
  - elbow target
  - wrist/hand target
- Blend pose wrist and hand-tracker wrist based on confidence.
- Use hand tracker wrist as the preferred forearm endpoint when pose wrist confidence is weak.
- Keep elbow direction plausible so elbows do not collapse or twist backward.
- Add separate smoothing for upper arm, lower arm, wrist, and fingers.
- Keep the player side responsive while keeping instructor playback smooth.
- Add per-arm debug output for live source selection and confidence.

Acceptance:

- Left and right arms feel equally responsive in manual smoke.
- A raised hand lifts the correct forearm without limp lag.
- Wrist rotation follows hand orientation without breaking the elbow/forearm line.
- Finger curls remain responsive without causing the whole wrist to twitch.

## Phase 5: Torso, Hips, Legs, And Feet

Goal: make the lower body stable enough that the full avatar feels grounded.

Status: implemented, pending real-camera tuning. The rig uses torso confidence, knee-direction guards, foot/toe source selection, calibrated floor correction, and an upper-body fallback when a close camera cannot see reliable lower-body landmarks.

Tasks:

- Use shoulders and hips to solve torso direction with calibrated neutral offsets.
- Add spine/chest smoothing that is slower than arms but not sluggish.
- Add knee-direction constraints to avoid inverted or collapsing knees.
- Add foot orientation from ankle/toe landmarks where confidence allows.
- Add floor lock or floor easing so the avatar does not float or sink during normal standing movement.
- Handle temporary ankle/foot loss by holding last good lower-body pose before easing neutral.

Acceptance:

- Standing still looks grounded.
- Stepping or lifting a foot is visible without large floor drift.
- Knees bend in plausible directions.
- Torso follows rotation without dragging the head downward.

## Phase 6: Avatar Profiles

Goal: make different VRM avatars correctable without hardcoding one-off fixes in the rig loop.

Status: implemented. Each selectable VRM has explicit whole-body tracking profile values for head, neck, arms, legs, feet, confidence thresholds, and floor correction.

Tasks:

- Add a small avatar profile config for each selectable avatar.
- Include:
  - head pitch offset
  - head yaw offset
  - shoulder/arm twist offset
  - wrist offset
  - hand/finger gain
  - leg/foot offset
  - floor/scale offset
  - response speed defaults
- Load the profile with the selected avatar.
- Keep defaults safe if an avatar has no explicit profile.

Acceptance:

- The same user movement looks broadly consistent across selectable avatars.
- Avatar-specific fixes live in profile data, not scattered through the rigging loop.

## Phase 7: Regression Tests And Manual Smoke

Goal: prevent the tracking pipeline from drifting back into fragile per-limb tuning.

Status: partially implemented. Automated tests now cover calibration, head orientation, limb endpoint selection, knee guards, floor correction, health summaries, and avatar profile merging. The remaining gate is the real signed-in webcam smoke pass.

Automated tests:

- Pure calibration math:
  - neutral head offset
  - shoulder/hip baseline
  - low-quality calibration rejection
- Head solver:
  - face-derived pitch/yaw/roll conversion
  - neutral offset application
  - clamp behavior
- Limb source selection:
  - hand wrist preferred when pose wrist confidence is low
  - pose wrist used when hand data is missing
  - last-good fallback when both are weak
- Avatar profile application:
  - offsets are applied deterministically
  - missing profile uses defaults

Manual smoke additions:

- Looking straight at camera makes avatar look straight ahead.
- Looking up/down/left/right maps to believable avatar head motion.
- Both arms respond equally to raising, lowering, and crossing.
- Fingers curl/open without swapping sides.
- Standing still keeps feet grounded.
- Small steps do not make the avatar float or collapse.
- Recalibrate fixes a deliberately bad starting posture.

## Proposed Implementation Order

1. Add debug view and measurement output.
2. Add session calibration and recalibrate control.
3. Fix head/neck with face-based orientation plus neutral offsets.
4. Rework arms as confidence-aware chains.
5. Rework lower body with torso, knee, foot, and floor constraints.
6. Add avatar profile config.
7. Expand tests and manual smoke checklist.

This order is deliberate: debug and calibration should come before more tuning. Otherwise we will keep chasing symptoms limb by limb.

## Product Decision Points

Before implementation, decide:

- Should calibration be mandatory before every match, or optional with a "skip" path?
- Should debug mode be controlled by a URL parameter, environment flag, or admin-only UI toggle?
- Should avatar profiles live as local TypeScript config for the demo, or as editable data later?
- How polished should calibration UI be for the client demo: minimal overlay or full guided step?

Recommended defaults:

- Make calibration required for the play session once this work begins.
- Gate debug mode behind a URL parameter such as `?debugTracking=1`.
- Store avatar profiles as local TypeScript config while this remains a demo.
- Keep calibration UI simple, direct, and demo-safe.

## Definition Of Done

The whole-body tracking work is considered done when:

- The avatar looks at the camera when the user looks at the camera.
- Head, arms, hands, torso, legs, and feet each have confidence-aware fallback behavior.
- Calibration can correct neutral posture and avatar offset issues without a reload.
- The debug view explains tracking issues without editing code.
- Avatar-specific corrections are isolated in profile config.
- Automated tests cover calibration, head orientation, limb source selection, and profile offsets.
- The manual smoke checklist includes whole-body tracking rows and passes in a real signed-in browser session.
- `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check` pass with no lint warnings.
