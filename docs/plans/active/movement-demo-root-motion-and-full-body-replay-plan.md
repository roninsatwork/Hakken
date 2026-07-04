# Movement Demo Root Motion And Full-Body Replay Plan

Last reviewed: 2026-07-04
Status: complete for the current movement-demo root-motion scope. Phase 1 diagnostics, the pure root-motion helper, game-path root-motion simulation, replay-lab path strip, gated replay avatar root transform, shared live avatar root-motion history, root-motion iteration report metrics, capture-manifest root diagnostics, applied avatar root telemetry, saved-recording proof runs, automated proof-set capture, deterministic live root-turn proof, deterministic live root-travel proof in left/right/forward/back directions, opposite-direction turn proof, and mixed turn-plus-travel proof are implemented.
Scope: replay lab, live game path, avatar retargeting, source-data diagnostics, and acceptance tests for full-body movement beyond fixed-spot pose bending.

## Purpose

The movement demo can currently make the avatar bend from saved or live body landmarks, but it does not yet replay the whole person moving through space. A recorded user can turn around on the spot, step across the floor, pivot, or travel forward/back, while the avatar stays planted in one fixed forward-facing location.

This plan adds the missing layer between landmark retargeting and the VRM scene:

```text
MediaPipe landmarks
  -> calibrated body pose
  -> root-motion solve
  -> body heading and floor path
  -> foot contact and step events
  -> avatar root transform
  -> bone retargeting
  -> replay/game parity proof
```

The goal is to build toward broad human-movement replay, not just fixed-spot posture poses. Raw points are the starting evidence, but the avatar needs additional layers for root motion, floor contact, body heading, stepping, confidence, and failure diagnostics before those points can safely drive "any movement." If the source data is good enough, the avatar should reproduce both the pose and the whole-body movement; if the source data is not good enough, the replay/game tools should say exactly why.

## Current Finding

The current system mostly asks:

```text
How should each bone bend?
```

It does not yet consistently ask:

```text
Where is the whole person standing?
Which way is the person facing?
Which foot is planted?
Which foot stepped?
How should the avatar root move?
```

Known current behavior:

- `VrmAvatar` mounts the avatar group at a fixed X/Z position and fixed facing direction.
- The avatar root only moves vertically for squat/drop and small foot-lock corrections.
- `movementRetargeting.ts` solves segment directions, hip drop, squat depth, knee lift, and foot contact, but not root heading or floor path.
- Replay lab "Game Path" currently means avatar decision path, not physical path through the room.
- Saved movement frames may contain `worldLandmarks`, but the avatar layer uses them mostly as pose/depth inputs rather than as a durable floor-space trajectory.

## Saved Movement Proof Corpus

The existing saved movement recordings are the proof corpus for this plan. They already contain the points the system captured, and every root-motion change must prove two things against those saved points:

1. Existing saved movements still replay at least as well as they do today.
2. New root-motion behavior is derived from the saved points, not from route-specific visual guesses.

Use these saved data sources as first-class regression inputs:

- `movements.poseData` and `poseDataUrl` payloads loaded through `useMovementFrames`.
- Saved frame payload fields:
  - `pose` / `landmarks`
  - `worldLandmarks`
  - `faceLandmarks`
  - `hands`
  - timestamps and capture FPS where available
- `movementDebugSessions.samplesJson` for game-path proof, including:
  - `tracking.pose`
  - `tracking.worldPose`
  - `poseBounds`
  - `bodyConfidence`
  - `fallbacks`
  - `retarget`
  - `headRaw` / `headApplied`
  - camera metadata

Before changing avatar behavior, capture a baseline replay analysis over the selected saved movements. After changing behavior, run the same saved movements again and compare:

- source landmark availability
- retarget quality
- lower/feet ownership
- avatar visual segment error
- root heading estimate
- root X/Z path estimate
- held/clamped root-motion frames
- replay/game parity

If a saved movement has good source points and currently works, root-motion work must not make it worse. If a saved movement currently fails because the avatar root is fixed, the new diagnostics should identify that failure before any visual compensation is added.

## Human Movements Not Fully Covered Yet

The following movement classes are not inside the avatar layer as proper full-body motion yet:

- Whole-body turn-around, including 90, 180, and 360 degree turns.
- Rotating on the spot while feet stay near the same floor location.
- Walking or stepping along a path across the floor.
- Forward, backward, and sideways travel.
- Pivots where one foot plants and the body rotates around it.
- Weight transfer from one foot to the other.
- Step detection and release/replant of individual feet.
- Reliable facing-away-from-camera handling.
- Fast turns where landmarks briefly cross, hide, or swap apparent sides.
- Jumps, hops, lunges with travel, and deep dynamic moves.
- Sitting, kneeling, lying down, rolling, crawling, and floor-contact poses.
- Prop or environment contact, such as chair, wall, floor, ball, or reformer interaction.

Some of these can be supported well enough for demo use; some require explicit source-data limits and diagnostics.

## Principles

- Do not add replay-only compensation. Body movement rules must live in shared helpers or `VrmAvatar` so replay lab and game use the same behavior.
- Labels remain diagnostic. Do not drive root motion from labels like `turn`, `walk`, or `squat` alone.
- Root motion should be derived from calibrated body geometry, foot contact, world landmarks when available, and confidence gates.
- Saved movement points are the source of truth for regression proof. Do not tune only against a new hand-made synthetic pose while ignoring existing recordings.
- If world landmarks are missing or unreliable, degrade gracefully to fixed-spot pose replay with a clear warning.
- Keep the source skeleton proof layer. If the source skeleton turns and the avatar does not, the root-motion solve or avatar application is at fault.
- The demo must stay believable before it becomes ambitious. A stable 180-degree turn with planted feet is more valuable than a fragile attempt at every movement.

## Target Architecture

Add a new root-motion layer alongside the existing retargeting layer:

```text
Recorded / live tracking frame
  -> frame validation
  -> neutral body calibration
  -> source body model
  -> root-motion solve
       - body heading
       - pelvis/root position
       - floor plane
       - foot contacts
       - step events
       - source reliability
  -> vector/bone retarget solve
  -> avatar root transform
       - yaw
       - X/Z floor position
       - Y root drop
       - planted-foot correction
  -> avatar bone rotations
  -> debug telemetry
```

Important separation:

- `movementRetargeting.ts`: body-relative segment and pose solve.
- New root-motion helper, suggested name `movementRootMotion.ts`: floor-space movement and heading solve.
- `VrmAvatar.tsx`: applies root transform and bone rotations, with smoothing and guards.
- Replay/game analyzer: proves the same movement passes through both routes.

## Data Model Shape

Suggested pure result type:

```ts
type MovementRootMotionFrame = {
  headingYaw: number;
  headingConfidence: number;
  rootPosition: {
    x: number;
    y: number;
    z: number;
  };
  rootPositionConfidence: number;
  floor: {
    y: number;
    confidence: number;
  };
  feet: {
    left: {
      contact: boolean;
      worldPosition: { x: number; y: number; z: number } | null;
      stepPhase: "planted" | "lifting" | "swinging" | "landing" | "unknown";
    };
    right: {
      contact: boolean;
      worldPosition: { x: number; y: number; z: number } | null;
      stepPhase: "planted" | "lifting" | "swinging" | "landing" | "unknown";
    };
  };
  debug: {
    source: "world-landmarks" | "image-landmarks" | "held" | "unavailable";
    reasons: string[];
  };
};
```

The exact type can change, but the root-motion concept must be explicit. It should not be hidden inside lower-body owner labels.

## Phase 1: Audit And Diagnostics

Goal: make root-motion absence visible in replay lab and game debug mode.

Tasks:

- Select an initial saved-movement proof set from existing recordings:
  - fixed-spot neutral/posture movement that should not drift
  - squat or knee-lift movement that currently works
  - the turn-around recording that currently fails
  - any recording with `worldLandmarks`
  - any recording with weak/missing lower-body points
- Record baseline replay/game analyzer output for that proof set before root-motion implementation.
- Add a root-motion diagnostic row to replay lab and `?debugTracking=1`.
- Report:
  - whether world landmarks are present
  - whether a floor estimate is usable
  - current body heading estimate
  - heading confidence
  - root X/Z offset estimate
  - per-foot contact and step phase
  - reason root motion was applied, held, or disabled
- Rename or clarify the existing replay lab "Game Path" language so users do not confuse it with physical travel path.
- Add analyzer warnings:
  - `root_motion_missing`
  - `heading_unavailable`
  - `world_landmarks_missing`
  - `root_turn_detected`
  - `root_path_detected`

Acceptance:

- The selected saved movements can be replayed and summarized as the baseline corpus.
- A turn-around recording clearly reports that source motion suggests a turn and needs avatar root-motion visual review.
- A recording without usable world/floor data reports source limitation instead of pretending the avatar matched.
- No avatar motion behavior changes are required in this phase.

## Phase 2: Root-Motion Solver

Goal: create a pure, tested helper that converts landmarks into a stable floor-space motion model.

Tasks:

- Add `movementRootMotion.ts` or equivalent pure helper.
- Accept saved movement frame payloads as first-class input, including both `pose`/`landmarks` and `worldLandmarks`.
- Build neutral calibration from upright frames:
  - pelvis center
  - shoulder center
  - hip line
  - shoulder line
  - foot baseline
  - floor estimate
  - initial facing direction
- Prefer `worldLandmarks` for X/Z path and heading when present.
- Fall back to image landmarks only for limited heading/turn hints, not full path travel.
- Estimate body heading from a combination of:
  - shoulder line
  - hip line
  - nose/ears/face direction where reliable
  - left/right foot placement
  - temporal continuity
- Estimate root position from:
  - pelvis center
  - planted foot midpoint
  - floor-normalized scale
  - held last-good position when confidence drops
- Emit debug reasons for every hold/clamp/reject decision.

Acceptance:

- Synthetic 90/180-degree turns produce monotonic heading changes.
- Existing fixed-spot saved movements produce near-zero X/Z path drift.
- Existing saved movements with usable `worldLandmarks` produce stable, repeatable root estimates.
- Standing still does not drift.
- A side step produces X/Z root movement when world landmarks are present.
- Low-confidence or missing lower-body frames hold last-good root motion instead of snapping.

## Phase 3: Foot Contact, Step Events, And Weight Transfer

Goal: stop treating feet as just bendable bones; use them as floor anchors.

Tasks:

- Detect per-foot contact from ankle/heel/toe stability over time.
- Track planted-foot world anchors.
- Identify step phases:
  - planted
  - lifting
  - swinging
  - landing
  - unknown
- Detect pivot events where one foot is planted and body heading changes around it.
- Estimate weight transfer from hip/pelvis position relative to planted feet.
- Add guardrails for side swaps and self-occlusion during turns.

Acceptance:

- A planted pivot rotates the avatar around the planted foot rather than sliding both feet.
- A small step moves the avatar root after the stepping foot lands.
- Feet do not skate badly during slow turns.
- When foot evidence is weak, the system reports `unknown` and reduces root/path application.

## Phase 4: Apply Root Transform In Avatar

Goal: make the VRM whole body move, not only bend.

Tasks:

- Extend `VrmAvatar` with shared root-motion input.
- Add a feature gate or conservative apply mode for root transform while replay proof is being built, so existing saved movements can be compared before root motion is applied visually.
- Apply:
  - yaw to the avatar group
  - X/Z root movement to the avatar group
  - existing Y drop/floor correction through the same root-motion state
- Smooth root yaw and position separately from bone smoothing.
- Add clamp limits:
  - max yaw velocity
  - max X/Z velocity
  - max correction per frame
  - max recovery after tracking loss
- Keep instructor and player profile differences explicit.
- Ensure root transform composes safely with existing planted-foot lock and squat drop.

Acceptance:

- A saved 180-degree turn makes the avatar visibly turn around.
- A recorded step path moves the avatar across the floor at a believable scale.
- Normal fixed-spot squat recordings still look stable and do not start drifting.
- Existing saved movements in the proof set do not regress in segment retarget quality, lower/feet ownership, or visual stability.
- The source skeleton and avatar remain visually close in replay lab.

## Phase 5: Replay Lab Physical Path View

Goal: make physical movement inspectable.

Tasks:

- Add a floor mini-map or path strip to replay lab.
- Show:
  - source pelvis path
  - avatar root path
  - left/right foot contacts
  - heading arrows
  - held/clamped frames
- Add a proof-set selector or batch summary for saved movements so agents can compare before/after root-motion behavior without asking for a new recording.
- Add frame-level rows for:
  - source heading
  - avatar heading
  - source root X/Z
  - avatar root X/Z
  - path error
  - heading error
- Keep existing source skeleton and avatar view.

Acceptance:

- A user can see whether a bad replay is caused by source tracking, root solver, or avatar application.
- "Game Path" and physical path are separated in the UI.
- Frame scrubber updates root-motion diagnostics exactly like bone diagnostics.
- Existing saved movements can be reviewed as a batch, with clear pass/regression/source-limited status.

## Phase 6: Game Path Integration

Goal: prove root motion works in the live practice route, not only replay lab.

Tasks:

- Feed root-motion solve through the same shared path for:
  - saved movement replay
  - instructor avatar in `/demos/movements/[id]/play`
  - player avatar in live practice
  - replay lab
- Extend `movementGamePathSimulation.ts` to include root-motion fields.
- Reconstruct calibration for saved debug sessions so game-path root decisions match live behavior.
- Add parity flags when replay-lab root behavior diverges from game-path root behavior.
- Run saved movement recordings and saved debug sessions through the same root-motion reporting shape, even when one source lacks fields the other has.

Acceptance:

- A fix cannot pass replay lab while failing the game simulation unnoticed.
- Saved debug sessions can prove turn/path behavior without needing a new webcam recording each time.
- The same root-motion helper drives both replay and game.
- Saved movement recordings prove the recorded-instructor path, and saved debug sessions prove the live-player game path.

## Phase 7: Tests And Visual Proofs

Goal: prevent future regressions and avoid subjective-only tuning.

Saved movement regression tests:

- Parse representative existing saved movement payloads through `movementFrameCodec`.
- Verify current fixed-spot movements stay fixed when no real path is present.
- Verify saved recordings with `worldLandmarks` produce deterministic root heading/path values.
- Verify the failing turn-around recording is classified as root-motion needed, not as successful fixed-spot replay.
- Verify missing/weak world data is classified as source-limited, not avatar-pass.

Pure tests:

- neutral root calibration
- heading solve for 90/180-degree synthetic turns
- no-drift standing
- side-step X/Z path
- forward/back travel
- pivot around planted foot
- foot contact transitions
- confidence loss and last-good hold
- missing world-landmark fallback

Analyzer tests:

- `root_turn_detected`
- `root_path_detected`
- heading/path parity between replay and game simulation
- source-fail vs avatar-fail classification

Visual checks:

- replay lab source skeleton vs avatar for a 180-degree turn
- replay lab path strip for stepping
- game route `?debugTracking=1` proof for at least one deterministic or saved session
- before/after frame strip for saved movement proof set

Acceptance:

- Root-motion changes include focused tests before being called complete.
- Saved movement proof set is run before and after every material root-motion change.
- Visual movement changes include screenshots or frame strips when practical.
- Full verification is run before merge/push according to `AGENTS.md`.

## Implementation Order

1. Select saved movement proof corpus and capture baseline metrics.
2. Add diagnostics and honest labels.
3. Add pure root-motion solver with saved-movement and synthetic tests.
4. Add foot contact and step-phase tracking.
5. Apply root yaw only for controlled turn recordings.
6. Apply X/Z path only when saved/world landmarks and floor confidence are good.
7. Add replay lab physical path view and proof-set batch summary.
8. Bridge root motion into game-path simulation.
9. Add visual proofs and regression corpus coverage.

This order is deliberate. Heading is easier to validate than full path travel, and path travel should not land until foot contact and floor confidence are good enough to prevent sliding.

## Completed Initial Slice

Overall root-motion roadmap: 100% for the current code/testable movement-demo scope.
Current slice: saved-data root-motion diagnostics, proof wiring, game-path root-motion bridge, replay-lab path strip, first gated replay avatar root transform, shared game avatar root-motion bridge, replay-iteration root-motion reporting, screenshot manifest diagnostics, applied avatar root telemetry, normalized yaw, proof-set automation, deterministic live root-turn proof, deterministic live root-travel proof in left/right/forward/back directions, opposite-direction turn proof, mixed turn-plus-travel proof, and root-motion intent diagnostics for travel, turns, pivots, foot release/landing, weight transfer, and jump flight/landing complete.

Implemented:

1. Added a pure root-motion helper that reads saved `pose` / `worldLandmarks` frames and reports:
   - body heading yaw
   - heading confidence
   - root X/Z position
   - root position confidence
   - floor estimate
   - left/right foot contact
   - basic step phase
   - source-limited reasons
2. Added focused tests proving:
   - fixed-spot saved movement frames do not drift
   - saved world points can expose a 180-degree turn
   - saved world points can expose X/Z travel
   - image-only saved points are source-limited for physical path proof
   - simple foot lift/landing phases are detected
3. Extended replay analysis with root-motion metrics and warnings:
   - `world_landmarks_missing`
   - `heading_unavailable`
   - `root_turn_detected`
   - `root_path_detected`
4. Added replay analyzer tests for saved movement proof behavior.
5. Added a replay lab Physical Path diagnostic section showing source type, heading, root X/Z, path confidence, step phases, and batch world/source-limited counts.
6. Extended `movementGamePathSimulation.ts` so every simulated game decision carries the same root-motion frame used by replay analysis.
7. Added game-path tests proving saved world points expose heading and X/Z travel through the game simulation.
8. Added a small replay-lab physical path strip that plots saved root X/Z path and marks the current scrubbed frame.
9. Added an optional `rootMotionFrame` input to `VrmAvatar` and wired replay lab to apply saved world-landmark heading and X/Z travel to the avatar group behind confidence gates.
10. Added a rolling live root-motion history inside `VrmAvatar` so the game route can reuse the same root-motion solver when no explicit replay frame is supplied.
11. Extended replay analysis, comparison, and iteration report scripts so saved-movement runs surface root yaw, root path, world-landmark frame count, source-limited frame count, and root confidence deltas.
12. Extended replay lab and `movement:replay:capture` so screenshots carry per-frame root-motion diagnostics in their JSON manifest.
13. Captured saved-recording replay proof runs during development; generated proof artifacts were kept under `tmp/` only while reviewing and are intentionally not committed.
14. Normalized avatar-facing root yaw to `-180deg..180deg` so reports and avatar targets do not produce impossible multi-turn values from angle wrapping.
15. Added applied avatar root telemetry and refreshed a curated turn proof at `tmp/movement-replay-lab/captures/root-motion-turn-proof`, where target and applied yaw match on the selected turn frames.
16. Added `npm run movement:replay:proof-set`, which reads a replay analysis JSON, selects a stable baseline plus root turn/path review recordings, captures first/review/max-yaw/max-path/mid/end frames, and writes `movement-replay-proof-set-manifest.json`.
17. Added automated proof-set capture coverage that includes turn frames with target/applied yaw parity.
18. Added deterministic `root-turn-left` proof fixtures and a Playwright proof that validates the live avatar path applies world-landmark root yaw.
19. Added deterministic `root-travel-left`, `root-travel-right`, `root-travel-forward`, and `root-travel-back` proof fixtures and Playwright/game-path coverage that validates the live avatar path applies world-landmark root X/Z travel in each direction.
20. Added deterministic `root-turn-right` and `root-turn-travel` proof fixtures plus Playwright coverage for opposite-direction yaw and mixed yaw-plus-path movement.
21. Added root-motion intent diagnostics for `root-travel`, `turn-on-spot`, `turn-and-travel`, planted-foot pivots, foot release/landing, weight transfer, jump flight, and jump landing.
22. Surfaced root-motion intent in replay analysis metrics, CLI reports, replay comparison metrics, Replay Lab DOM attributes, Replay Lab Physical Path UI, and `movement:replay:capture` manifests.

Future manual QA, outside the code-complete scope:

- Add real-camera/manual QA captures for a user walking through a larger room once that data exists.
- Add foot-lock/path smoothing polish only if those real captures show visible sliding during longer travel.

## Risks

- MediaPipe world landmarks are camera-relative and can drift; they need calibration and smoothing before driving root position.
- Turning away from the camera can reduce landmark quality or swap apparent left/right evidence.
- Applying root yaw before bone retargeting is stable can make existing limb errors more visible.
- Aggressive smoothing can hide real turns; weak smoothing can make the avatar wobble.
- The demo can become harder to reason about if root motion, foot lock, and squat drop fight each other.

## Definition Of Done

This plan is complete when:

- Existing saved movements have a baseline and after-change comparison in replay/game tooling.
- Replay lab can show source and avatar physical path separately from decision-path diagnostics.
- The avatar can replay a controlled turn-around recording with visible whole-body rotation.
- The avatar can replay a controlled step/path recording with believable X/Z movement.
- Fixed-spot posture movements do not regress.
- Replay and game simulation report the same root-motion decisions for the same saved session.
- Source limitations are reported clearly when the tracking data is not sufficient.
- Tests cover root heading, root path, foot contacts, and replay/game parity.

## Roadmap Estimate

Overall roadmap: 100% implemented for the current root-motion and physical-path replay scope.
Current implementation slice: 100% for saved-data diagnostics, pure root-motion proof wiring, game-path root-motion simulation, replay-lab path strip, avatar application, and deterministic directional proof coverage.
