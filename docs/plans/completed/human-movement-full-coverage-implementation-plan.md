> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Human Movement Full Coverage Implementation Plan

Last reviewed: 2026-07-04
Status: active implementation plan. Early diagnostic and approximate avatar support is now implemented for seated, seated twist, kneeling, half-kneel, low-lunge setup, quadruped, bear-crawl prep, child pose prep, plank prep, down-dog prep, supine, Pilates hundred prep, bridge prep, prone, prone extension/cobra prep, side-lying, side-lying leg lift, root travel, on-the-spot turns, planted-foot pivots, foot release/landing response, planted weight transfer, floor-roll transitions, jump flight/landing response, virtual chair contact, and facing/occlusion handling. These classes now have root orientation, full-body presentation specs where appropriate, deterministic proof fixtures, replay/game parity checks, conservative per-anchor support correction for seated/kneeling/quadruped/hands-feet support, body-plane floor correction for lying work, exercise pose quality/tolerance bands, root-heading/source-limited confidence gates, and replay-lab/reporting visibility. Exact full-body contact IK, wall/ball/reformer prop constraints, full gait IK, continuous rolling/crawling locomotion, impact/balance recovery animation, robust side-swap/self-occlusion recovery, and full yoga/Pilates libraries remain incomplete.
Scope: full human motion capture, replay, live avatar mirroring, fitness/posture coaching, yoga, Pilates, floor work, sitting, lying, transitions, props, and complex movement classes currently missing or only partially supported by Posture Studio.

## Purpose

Posture Studio has useful movement-demo groundwork: live camera tracking, saved movement playback, avatar retargeting, spine/limb diagnostics, root-motion diagnostics, and some proof modes for standing, side bend, squat, leg raise, and simple root travel/turn. That is not the same as a complete human movement system.

This document defines the larger implementation path for full-body human movement coverage, including:

- Sitting down and standing up.
- Lying down, side-lying, supine, prone, rolling, and crawling.
- Yoga poses and yoga transitions.
- Pilates mat work and reformer-style motion where possible.
- Walking, turning, pivoting, weight transfer, stepping, lunging, hopping, and jumping.
- Floor contact, chair contact, wall contact, and prop-aware poses.
- Saved replay and live game parity for all supported motion classes.

The target is not a pile of per-pose hacks. The target is a motion engine that understands the human body in relation to floor, camera, avatar, support surfaces, and confidence limits.

## Current Reality

The current implementation is still mostly an upright avatar retargeting system. It can bend and move a character convincingly for some standing poses, but it does not yet own the full body as a physical object in the scene.

Known implemented or partially implemented areas:

- Live MediaPipe pose, face, and hand tracking.
- Saved movement capture and playback.
- Source skeleton overlays in debug mode.
- Neutral calibration and guarded auto-baseline.
- Head, arms, hands, torso, hips, knees, feet, floor fallback, and debug telemetry.
- Retarget source model for upright standing recordings.
- Lower-body intent diagnostics for neutral, squat, single-leg raise, and mixed lower-body.
- Synthetic proof modes for standing, side bend, hands front, head directions, squat, leg raises, weak feet, lower body out of frame, root travel, and root turn.
- Root-motion groundwork for heading, floor path, X/Z avatar root movement, root-motion intent, foot release/landing, pivot, weight-transfer, and jump flight/landing diagnostics when world landmark confidence is usable.
- Body-orientation diagnostics for seated, kneeling, quadruped, supine, prone, and side-lying.
- Support-contact and support-intent diagnostics for feet, seat, knees, hands/knees, side body, back, and chest floor contact.
- Root pitch/roll/height application for floor orientation and non-standing height drops.
- Conservative avatar support-presentation poses for seated, kneeling, tabletop, bird dog prep, supine, bridge prep, prone, prone extension/cobra prep, side-lying, and side-lying leg lift.
- Expanded named proof poses for seated twist, half-kneel, low-lunge setup, bear-crawl prep, child pose prep, plank prep, down-dog prep, and Pilates hundred prep.
- Conservative support-anchor contact correction for virtual seat, knees, hands/knees, back, chest, and side-body anchors.
- Replay/Game debug parity fields for exercise pose, exercise transition, support intent, support constraint, and support-presentation owners.

Known missing or incomplete areas:

- Lying down has approximate root orientation and presentation poses, but not reliable whole-body contact IK.
- Sitting and kneeling have approximate support states, presentation poses, and conservative chair/knee contact correction; exact chair geometry and full shin/foot rest solving remain incomplete.
- Yoga and Pilates pose-family groundwork now covers a larger proof set with diagnostic scoring and approximate presentation/contact response, but the full libraries and transition rules are incomplete.
- The floor is modeled diagnostically and for root presentation, but not yet as a full-body constraint surface.
- Virtual chair contact is modeled; wall, ball, reformer, and explicit prop calibration remain incomplete.
- Full walking and gait IK remain incomplete; approximate travel direction, step release/landing response, planted-foot pivot, weight-transfer labels, low-lunge setup, and bear-crawl setup are implemented.
- Jump/hop flight and landing are detected from world-landmark floor contact and drive conservative avatar lift/compression; impact/balance recovery is not implemented.
- Facing away from camera and self-occlusion now have approximate root-heading/source-limited handling, but are not production-robust.
- Fast turns and side swaps use conservative ownership handling and can still degrade under heavy occlusion.
- Motion classes are represented in a shared coverage taxonomy, but not all production acceptance tests are complete.

## Product Goal

Build a high-trust motion product where a user can perform a broad range of human movements and see the avatar reproduce the movement in a believable, diagnosable way.

The first audience is posture, Pilates, yoga, and movement-coaching demos. The longer-term architecture should also support rehabilitation, mobility screening, dance-like motion, sport drills, and child-friendly guided exercise.

The system should answer:

- What is the person's body doing?
- Where is the body in the room?
- Which surface is supporting the body?
- Which body parts are in contact with the floor, chair, wall, mat, or prop?
- Which way is the body facing?
- Is this a supported movement class, a partial approximation, or a tracking failure?
- Does Replay Studio and Game Studio produce the same movement decision?

## Non-Goals

- Do not promise clinical-grade biomechanics without a separate medical validation program.
- Do not hardcode every yoga or Pilates pose as a canned animation.
- Do not classify a pose by label and then force a cartoon version of it onto the avatar.
- Do not tune Game Studio separately from Replay Studio.
- Do not make live webcam repetition the primary debugging loop when a saved recording can be replayed.
- Do not make props magical: prop contact should be explicit, optional, and confidence-gated.
- Do not claim a movement is supported until source skeleton, normalized body model, avatar result, and tests agree.

## Core Principles

- Replay Studio is the motion source of truth.
- Labels are diagnostics, not the primary animation source.
- The source skeleton must remain inspectable.
- Movement support must be classed as `supported`, `approximate`, `diagnostic-only`, or `unsupported`.
- Every supported class needs saved-recording proof and deterministic synthetic proof.
- Floor and support contact must be modeled before floor work is claimed.
- Avatar root orientation is as important as limb angles.
- Transitions matter as much as static poses.
- Confidence failures must produce clear debug reasons instead of fake-ready avatar motion.
- The engine must degrade gracefully rather than inventing motion.

## Definition Of Fully Implemented

A movement class is fully implemented only when all of these are true:

- Source landmarks and confidence are captured or replayed reliably enough for the class.
- A normalized body model represents the movement without relying on a one-off route branch.
- The avatar root has correct position, yaw, pitch, roll, and support relationship.
- Limb, spine, head, pelvis, and foot/hand contact are solved in shared code.
- Replay Studio and Game Studio use the same decision path.
- Debug output explains classification, support state, contacts, owners, confidence, and fallbacks.
- Deterministic tests cover the movement class.
- Saved recording tests cover real capture data.
- Visual proof verifies the avatar is not standing, floating, flipped, twisted, or collapsed incorrectly.
- Manual QA instructions exist for camera setup and user performance.

## Movement Coverage Matrix

Use this matrix to track product truth. Do not move a class to `supported` without proof.

| Movement family | Examples | Current state | Target state |
| --- | --- | --- | --- |
| Neutral upright | Standing, posture check-in | Mostly supported | Supported |
| Upper-body standing | Side bend, arm reach, hands front | Partially supported | Supported |
| Head and neck | Look up/down/left/right | Partially supported | Supported |
| Squat and knee lift | Squat, single knee raise | Partially supported | Supported |
| Root turn | 90, 180, 360 turn | Partially implemented groundwork | Supported with confidence gates |
| Root travel | Left/right/forward/back steps | Partially implemented groundwork | Supported with step phases |
| Walking | Walk in place, walk forward, walk sideways | Approximate root travel + foot release/landing response + bear-crawl setup | Supported or approximate by camera setup |
| Pivot and weight transfer | Plant foot and rotate, lunge transfer | Approximate pivot + weight-transfer response | Supported |
| Jump/hop | Small hop, jumping jack, rebound | Approximate flight + landing root response | Approximate first, supported later |
| Sitting | Sit down, seated neutral, chair pose | Approximate presentation + contact correction | Supported |
| Kneeling | Tall kneel, half kneel, quadruped setup | Approximate presentation + contact correction | Supported |
| Lying down | Supine, prone, side-lying | Approximate presentation + contact correction | Supported |
| Rolling/crawling | Roll side to side, crawl, quadruped | Approximate floor-roll transition + bear-crawl setup | Approximate first, supported later |
| Yoga | Mountain, warrior, plank, down dog, child's pose, cobra, bridge | Larger proof-set approximate support | Supported in phased library |
| Pilates mat | Hundred prep, single-leg stretch, bridge, side kicks, roll down, teaser prep | Larger proof-set approximate support | Supported in phased library |
| Props/contact | Chair, wall, mat, ball, reformer | Approximate virtual chair contact support | Explicit prop/contact support |

## Architecture Target

The future pipeline should be:

```text
Camera / recording input
  -> raw MediaPipe landmarks
  -> frame validation and camera metadata
  -> normalized body skeleton
  -> support-surface and contact solve
  -> root pose solve
       - root position
       - root yaw
       - root pitch
       - root roll
       - body support state
  -> body phase and movement-class solve
       - static pose
       - transition
       - gait/step phase
       - floor-work phase
       - prop/contact phase
  -> avatar retarget solve
       - spine/pelvis
       - head/neck
       - arms/hands
       - legs/feet
       - contact constraints
  -> avatar application
       - root transform
       - IK/contact locks
       - bone rotations
       - smoothing and hold/release
  -> scoring / feedback
  -> debug and replay parity proof
```

Important module boundaries:

- `movementFrameCodec`: parse and normalize saved frame payloads.
- `movementTrackingCalibration`: body calibration and tracking health.
- `movementRetargeting`: body-relative segment solve.
- `movementRootMotion`: floor-space heading and path solve.
- New `movementSupportSurfaces`: floor/chair/wall/mat/prop contact model.
- New `movementBodyOrientation`: upright, seated, kneeling, prone, supine, side-lying, inverted, quadruped.
- New `movementPhaseClassifier`: static hold, transition, gait phase, roll phase, jump phase.
- New `movementPoseFamilies`: yoga, Pilates, posture, mobility, gait, floor work.
- New `movementAvatarContactSolver`: hand, foot, knee, hip, shoulder, back, belly, seat, and prop locks.
- New `movementCoverageRegistry`: feature flags, support status, proof status, and UI labels.

## Data Model Concepts

The exact types can change, but these concepts should exist.

```ts
type MovementSupportSurface =
  | "none"
  | "floor"
  | "mat"
  | "chair"
  | "wall"
  | "ball"
  | "reformer"
  | "unknown";

type MovementBodyOrientation =
  | "upright"
  | "seated"
  | "kneeling"
  | "quadruped"
  | "supine"
  | "prone"
  | "sideLyingLeft"
  | "sideLyingRight"
  | "inverted"
  | "transitional"
  | "unknown";

type MovementContactPoint =
  | "leftFoot"
  | "rightFoot"
  | "leftHand"
  | "rightHand"
  | "leftKnee"
  | "rightKnee"
  | "leftHip"
  | "rightHip"
  | "seat"
  | "back"
  | "chest"
  | "belly"
  | "leftElbow"
  | "rightElbow"
  | "head";

type MovementPoseFamily =
  | "posture"
  | "gait"
  | "strength"
  | "mobility"
  | "yoga"
  | "pilates"
  | "floorWork"
  | "propWork";

type MovementSupportStatus =
  | "supported"
  | "approximate"
  | "diagnostic-only"
  | "unsupported";
```

## Required Source Data

Full movement coverage needs richer recording evidence than upright posture.

For each frame, preserve or derive:

- Pose landmarks.
- World landmarks.
- Face landmarks.
- Hand landmarks.
- Timestamp and frame delta.
- Camera aspect ratio and facing mode.
- Camera-to-user distance estimate.
- Pose bounds in image space.
- Landmark visibility and tracking confidence.
- Support-surface estimate.
- Contact candidates and confidence.
- Root position, root yaw, root pitch, root roll.
- Body orientation and movement phase.
- Solver warnings and unsupported-class reasons.

For future capture, consider adding:

- Optional floor calibration step.
- Optional mat/chair/wall calibration.
- Optional body-height estimate.
- Optional user orientation prompt: facing camera, side-on, floor mat visible.
- Optional second-camera support later, but do not require it for the first product pass.

## Camera And Tracking Constraints

Many hard movements are camera problems before they are avatar problems.

Known constraints:

- A laptop webcam often cannot see full body and floor at once.
- Floor work may hide knees, hips, hands, or feet behind the torso.
- Side-lying and prone poses can collapse landmark depth.
- Facing away causes landmark swaps and weaker face/head data.
- Yoga inversions and down dog change the expected head/hip/foot relationship.
- Pilates mat work often moves legs out of frame.
- Chairs and props are invisible unless explicitly modeled or approximated.

Product handling:

- Give camera setup guidance per movement family.
- Detect when the current camera framing cannot support the requested movement.
- Allow `approximate` mode for demos, but mark it in debug output.
- Store unsupported reasons in replay analysis.
- Prefer honest partial avatar behavior over invented full-body motion.

## Support Surfaces And Contacts

Floor work cannot be solved as standing with more bend. The engine needs support states.

Support states to model:

- Standing: feet support the body.
- Seated: seat/hips support the body, feet may support or float.
- Kneeling: knees and possibly feet support the body.
- Quadruped: hands and knees/feet support the body.
- Supine: back/shoulders/hips support the body.
- Prone: chest/belly/hips support the body.
- Side-lying: side hip/shoulder/arm support the body.
- Plank: hands/forearms and feet support the body.
- Bridge: feet and shoulders/back support the body.
- Wall-supported: hands/back/side contacts wall.
- Chair-supported: seat and/or hands contact chair.

Contact solve should report:

- Contact point.
- Surface.
- Confidence.
- Position.
- Stick/slide/release state.
- Whether the contact is active, held, inferred, or rejected.
- Which avatar constraint consumed it.

## Root Orientation

The avatar root needs full orientation, not only yaw and X/Z translation.

Root orientation dimensions:

- Yaw: turning left/right around vertical.
- Pitch: lying forward/back, plank, prone, supine.
- Roll: side-lying or rolling sideways.
- Height/drop: squat, sitting, kneeling, floor contact.
- Support offset: root placed relative to support surface.

Examples:

- Supine lying: avatar root pitch/roll must orient body onto the floor, not merely bend spine sideways.
- Side-lying: root roll must place the body on the side and lock the lower side to the floor.
- Seated chair: root height must land pelvis on a seat plane, not sink through the floor.
- Plank: root pitch and contact locks must preserve hands/forearms and feet on the floor.

## Movement Families To Implement

### Upright And Standing

Examples:

- Neutral stance.
- Mountain pose.
- Side bend.
- Arm raise.
- Hands front.
- Roll down.
- Standing twist.
- Weight shift.

Implementation needs:

- Keep existing calibration and spine drive.
- Add weight-transfer state.
- Add hand/arm reach confidence.
- Add foot pressure/contact approximation.
- Add explicit support status for standing.

Acceptance:

- Avatar remains grounded.
- Torso and head follow without exaggerated lean.
- Weight transfer visibly shifts pelvis/root without sliding feet.

### Walking, Stepping, And Travel

Examples:

- Walk in place.
- Step forward/back.
- Side step.
- Cross step.
- Turn and walk.

Implementation needs:

- Step phase detection per foot: planted, lifting, swinging, landing.
- Root path smoothing.
- Foot release and replant.
- Body heading from hips/shoulders/world landmarks.
- Confidence guard for foot swaps.

Acceptance:

- Planted foot stays stable during weight transfer.
- Swing foot moves without dragging the whole avatar.
- Root translation matches the source path when world landmarks are usable.
- Without usable world landmarks, system reports fixed-spot approximation.

### Turns, Pivots, And Facing Away

Examples:

- 90 degree turn.
- 180 degree turn.
- 360 degree turn.
- Pivot on one foot.
- Facing away from camera.

Implementation needs:

- Continuous heading unwrap.
- Left/right side ownership tracking.
- Foot plant pivot model.
- Conservative occlusion recovery and source-limited holding.
- Face/head fallback when face landmarks disappear.

Acceptance:

- Avatar turns as a whole body.
- Limbs do not swap sides during the turn.
- Facing-away frames are held, gated, or solved approximately instead of being twisted into front-facing motion.

### Squats, Lunges, Hops, And Jumps

Examples:

- Squat.
- Split squat.
- Forward lunge.
- Side lunge.
- Small hop.
- Jumping jack.

Implementation needs:

- Stronger pelvis/root drop model.
- Knee direction and foot contact locks.
- Support release for jumps.
- Landing detection.
- Energy/impact smoothing.

Acceptance:

- Squats stay grounded and symmetrical unless source says otherwise.
- Lunges move one foot and bend one knee without collapsing hips.
- Jumps show both support release and landing, or report unsupported if tracking is insufficient.

### Sitting And Chair Work

Examples:

- Sit down.
- Stand up from chair.
- Seated neutral posture.
- Seated twist.
- Seated leg lift.
- Chair pose without a physical chair.
- Wall sit.

Implementation needs:

- Seat plane model.
- Pelvis support contact.
- Sitting transition phase: standing -> lowering -> seated -> rising.
- Feet on floor vs feet lifted.
- Chair optional prop calibration.

Acceptance:

- Avatar pelvis lands on a seat plane or on an explicit "virtual chair" plane.
- Knees and hips bend plausibly.
- Feet remain on the floor when source feet are planted.
- System does not treat sitting as a squat forever.

### Kneeling And Quadruped

Examples:

- Tall kneel.
- Half kneel.
- Child's pose setup.
- Tabletop/quadruped.
- Cat cow.
- Bird dog.

Implementation needs:

- Knee contact solve.
- Shin/foot rest state.
- Hand contact solve for quadruped.
- Root height and pelvis orientation changes.
- Wrist/shoulder support constraints.

Acceptance:

- Knees visibly become support points.
- Quadruped body is horizontal enough to read as hands-and-knees, not upright bending.
- Bird dog raises opposite arm/leg while support contacts stay stable.

### Lying Down And Floor Work

Examples:

- Supine lying.
- Prone lying.
- Side-lying left/right.
- Roll from supine to side.
- Crawl.
- Bridge.
- Dead bug.
- Hollow hold.

Implementation needs:

- Body orientation classifier for supine/prone/side-lying.
- Floor support contacts for back, chest, hips, shoulders, and side body.
- Root pitch/roll application.
- Limb solve while body root is horizontal.
- Roll phase detection.
- Camera setup guidance for full-body floor visibility.

Acceptance:

- Avatar root rotates onto the floor.
- Lying down does not render as upright side bend.
- Supine/prone/side-lying are visually distinct.
- Bridge raises hips while feet and shoulders/back remain supported.
- Unsupported floor frames report exactly what data is missing.

### Yoga Pose Family

Initial yoga library:

- Mountain.
- Forward fold.
- Half lift.
- Chair.
- Warrior I.
- Warrior II.
- Triangle.
- Tree.
- Downward dog.
- Plank.
- Cobra.
- Child's pose.
- Bridge.
- Low lunge.
- Cat cow.
- Seated twist.
- Savasana.

Implementation needs:

- Pose-family registry.
- Static pose snapshots and transition states.
- Support surface requirements per pose.
- Expected contact points per pose.
- Tolerance bands for coaching.
- Pose-specific camera framing hints.

Acceptance:

- The avatar can show the broad pose family shape.
- Debug output names support state and contact model.
- Scoring can compare relevant cues without requiring perfect biomechanics.
- Pose transitions do not snap between canned states.

### Pilates Pose Family

Initial Pilates mat library:

- Neutral seated.
- Roll down.
- Hundred prep.
- Single-leg stretch.
- Double-leg stretch prep.
- Glute bridge.
- Side-lying leg lift.
- Clam.
- Swan/cobra-style extension.
- Swimming prep.
- Quadruped arm/leg reach.
- Teaser prep.
- Spine twist.
- Mermaid side bend.

Later Pilates/reformer-style library:

- Footwork approximation.
- Scooter/lunge approximation.
- Long stretch/plank.
- Short box seated posture.
- Side splits approximation.

Implementation needs:

- Mat support model.
- Supine/prone/side-lying root orientation.
- Repetition and range tracking.
- Smooth leg and hip articulation from floor poses.
- Optional prop/reformer abstraction rather than a full equipment simulator at first.

Acceptance:

- Mat poses are distinguishable and stable.
- Repetitions can be counted only when source evidence supports them.
- Reformer-style movements are labeled approximate unless prop geometry is modeled.

### Props And Environment Contact

Examples:

- Chair.
- Wall.
- Mat.
- Ball.
- Reformer.
- Floor.

Implementation needs:

- Prop registry and calibration UI.
- Virtual support planes.
- Contact candidates against prop planes.
- Per-prop confidence and support status.
- Prop-aware avatar constraints.

Acceptance:

- Chair sitting uses chair support, not invisible squat logic.
- Wall support uses wall plane constraints.
- Mat/floor work uses floor plane constraints.
- Ball/reformer support is approximate until explicit geometry is available.

## Implementation Phases

### Phase 0: Freeze Current Truth

Goal: make the current state explicit before expanding.

Tasks:

- Keep the existing root-motion plan as the root-motion scope record.
- Add this full-coverage plan as the larger product/engine roadmap.
- Add a movement coverage registry doc/table.
- Mark lying, sitting, yoga, Pilates, and prop work as not implemented.
- Capture current proof screenshots and replay reports for standing, side bend, squat, leg raise, root turn, and root travel.

Acceptance:

- No one can confuse partial root-motion work with full human-movement support.

### Phase 1: Coverage Registry And Diagnostics

Goal: the app and docs should know what is supported.

Tasks:

- Create a typed coverage registry for movement families.
- Add support state: supported, approximate, diagnostic-only, unsupported.
- Add debug labels for body orientation and support surface.
- Add replay analyzer warnings for unsupported orientation and unsupported contact model.
- Add proof expectations per movement family.

Acceptance:

- Lying down reports `unsupported` or `diagnostic-only` until implemented.
- Debug mode can explain why a movement failed.

### Phase 2: Body Orientation Classifier

Goal: stop treating every body as upright.

Tasks:

- Detect upright, seated, kneeling, quadruped, supine, prone, side-lying, and transitional.
- Use shoulder/hip/head/ankle geometry, world landmarks, image bounds, and confidence.
- Add confidence and rejection reasons.
- Add synthetic fixtures for each orientation.
- Add saved-recording fixtures for real examples.

Acceptance:

- A lying user is classified as lying or unknown, not side bend.
- A seated user is classified as seated or unknown, not squat.

### Phase 3: Support Surface And Contact Model

Goal: model what the body is resting on.

Tasks:

- Add floor/mat plane estimate.
- Add contact candidates for hands, feet, knees, hips, back, chest, seat, and elbows.
- Add contact states: planted, sliding, released, inferred, rejected.
- Add debug output for contact owners.
- Add test fixtures for floor, chair, kneel, plank, bridge, side-lying.

Acceptance:

- Floor poses have floor support contacts.
- Sitting has seat support contact.
- Plank has hand/forearm and foot support.

### Phase 4: Root Pitch/Roll Application

Goal: allow avatar body orientation beyond upright yaw.

Tasks:

- Extend root-motion output with root pitch and root roll.
- Add smoothing and confidence gates for root pitch/roll.
- Apply pitch/roll to avatar group or an intermediate body root safely.
- Prevent limb solvers from double-applying horizontal body orientation.
- Add visual tests for supine, prone, side-lying, plank, quadruped.

Acceptance:

- Supine, prone, and side-lying visibly rotate the avatar body onto the floor.
- Existing upright movement does not regress.

### Phase 5: Sitting And Kneeling

Goal: support common non-standing positions before full yoga/Pilates.

Tasks:

- Implement seated body orientation.
- Implement sit-down and stand-up phases.
- Implement kneeling and half-kneeling support states.
- Add chair and virtual-seat support planes.
- Add avatar pelvis/leg constraints for seated and kneeling postures.

Acceptance:

- Sitting down, seated neutral, seated twist, tall kneel, and half kneel are visually stable.

### Phase 6: Lying And Floor Work

Goal: support the floor-work base needed for yoga and Pilates.

Tasks:

- Implement supine, prone, and side-lying.
- Implement rolling transition.
- Implement bridge and basic crawl/quadruped transitions.
- Add body-contact constraints for back, chest, hips, shoulders, knees, hands, and feet.
- Add floor-work camera guidance.

Acceptance:

- Lying down is no longer displayed as an upright side bend.
- Bridge, plank, child pose, and side-lying leg lift are plausible.

### Phase 7: Yoga Library

Goal: add named yoga support on top of the physical movement model.

Tasks:

- Add initial yoga pose registry.
- Map each pose to body orientation, expected contacts, key angles, and camera setup.
- Add guided sequence support for transitions.
- Add yoga-specific scoring cues.
- Add deterministic proof per initial pose.

Acceptance:

- The initial yoga library can be replayed and mirrored live with honest support statuses.

### Phase 8: Pilates Library

Goal: add Pilates mat and approximate reformer-style support.

Tasks:

- Add Pilates pose/movement registry.
- Add repetition phase models for mat exercises.
- Add range and symmetry metrics.
- Add optional reformer approximation with explicit warnings.
- Add deterministic and saved proof recordings.

Acceptance:

- Initial Pilates mat movements are stable enough for demo use.
- Reformer-style movements are clearly labeled as approximate until prop geometry exists.

### Phase 9: Gait, Dynamic Movement, And Props

Goal: complete the broad motion classes.

Tasks:

- Improve walking and stepping with gait phases.
- Add pivot and weight transfer.
- Add jump/hop support release and landing.
- Add chair/wall/ball/reformer prop calibration.
- Add multi-phase transition smoothing.

Acceptance:

- The system can explain and render dynamic movement without hiding unsupported cases.

### Phase 10: Productization

Goal: turn the expanded engine into a maintainable product feature.

Tasks:

- Add UI movement-family filters.
- Add routine builder support for yoga/Pilates/floor work.
- Add camera setup cards per movement family.
- Add movement support badges in the library.
- Add replay QA dashboard.
- Add coverage reports.
- Add documentation for operators and users.

Acceptance:

- Operators can tell what is supported, what is approximate, and what needs re-recording.

## Test Strategy

Each movement family needs four layers of verification:

1. Pure helper tests.
2. Synthetic avatar proof fixtures.
3. Saved recording replay analysis.
4. Browser visual proof.

Minimum tests:

- Body orientation classifier for upright, seated, kneeling, quadruped, supine, prone, side-lying.
- Support contact solver for feet, hands, knees, seat, back, chest, hips.
- Root pitch/roll/yaw smoothing and confidence gates.
- Avatar application tests for horizontal body roots.
- Replay/game parity tests for each supported movement family.
- Visual screenshot tests for standing, sitting, kneeling, supine, prone, side-lying, plank, bridge, down dog, child pose, seated twist, side-lying leg lift.

Regression rule:

- Existing standing/squat/leg-raise/root-motion proof must remain green before any floor-work support is considered complete.

## Saved Recording Proof Set

Build a proof corpus in stages.

Initial required recordings:

- Neutral standing.
- Side bend.
- Squat.
- Single knee raise.
- Step left/right/forward/back.
- 90 degree turn.
- 180 degree turn.
- Sit down and stand up.
- Seated twist.
- Tall kneel.
- Half kneel.
- Quadruped/tabletop.
- Child's pose.
- Plank.
- Bridge.
- Supine lying.
- Prone lying.
- Side-lying left/right.
- Downward dog.
- Cobra.
- Warrior II.
- Tree.
- Pilates hundred prep.
- Pilates single-leg stretch.
- Pilates side-lying leg lift.

Each recording should preserve:

- Source landmarks.
- World landmarks where available.
- Debug state.
- Camera metadata.
- Operator notes.
- Expected support status.
- Expected body orientation.
- Expected supported/approximate/unsupported status.

## Debug Overlay Requirements

Future debug mode should include:

- Movement family.
- Body orientation.
- Support surface.
- Contact points.
- Root position.
- Root yaw/pitch/roll.
- Step/transition phase.
- Pose-class confidence.
- Unsupported reasons.
- Replay/game parity status.
- Avatar root application status.
- Contact lock owners.
- Source data missing reasons.

Example debug strings:

```text
Family: Pilates mat
Orientation: supine
Surface: mat
Contacts: back inferred 0.72, leftFoot planted 0.86, rightFoot planted 0.84
Root: yaw 3.14, pitch -1.48, roll 0.02
Support: approximate
Reason: world landmarks present; back contact inferred from shoulder/hip plane
```

```text
Family: Yoga
Orientation: unsupported
Surface: unknown
Reason: body is mostly out of frame; floor plane unavailable; hands hidden
```

## User Experience Requirements

The user-facing product should not expose implementation jargon, but it should be honest.

Needed UX:

- Camera setup prompt per routine.
- "Move mat into frame" prompt for floor work.
- "Step back until full body is visible" prompt for standing work.
- "Chair visible" prompt for chair work.
- Support badge in debug/rehearsal only: supported, approximate, unsupported.
- In-app feedback when a routine cannot be tracked.
- No native `alert`, `confirm`, or `prompt`.

Do not show walls of technical explanation during a client demo. Keep the detailed diagnostics in debug/replay tooling.

## Risks

- One camera may not be enough for reliable floor work in all homes.
- MediaPipe may produce plausible but wrong landmarks for occluded floor poses.
- Avatar rigs vary; root pitch/roll can expose bad rest-pose assumptions.
- Prop support can look fake if the prop plane is guessed incorrectly.
- Visual smoothing can hide real solver errors.
- Scoring complex yoga/Pilates poses may imply more accuracy than the system has.

Mitigations:

- Keep explicit support statuses.
- Capture proof recordings for each class.
- Prefer approximate rendering with honest badges over silent fake precision.
- Add operator runbooks for camera setup.
- Add confidence gates before enabling scoring.

## Documentation Work

Documents to update as implementation proceeds:

- `docs/developer/temporary-posture-studio-demo.md`
- `docs/developer/movement-tracking.md`
- `docs/developer/movement-demo-retargeting-approach.md`
- `docs/plans/active/movement-demo-root-motion-and-full-body-replay-plan.md`
- Operator runbooks for yoga/Pilates/floor-work camera setup.
- Manual smoke checklist.
- End-user routine guidance.

## Milestone Roadmap

Rough roadmap estimate:

- Milestone A: Coverage registry, diagnostics, and unsupported-status honesty.
- Milestone B: Body orientation classifier.
- Milestone C: Support surfaces and contacts.
- Milestone D: Root pitch/roll avatar application.
- Milestone E: Sitting and kneeling.
- Milestone F: Lying and basic floor work.
- Milestone G: Yoga initial library.
- Milestone H: Pilates mat initial library.
- Milestone I: Gait, dynamic movement, and props.
- Milestone J: Product UI, QA dashboard, and operator documentation.

## Current Diagnostic Phase Status

Overall progress estimate: 100% for the first diagnostic/approximate-coverage phase. The movement system now has explicit coverage registry entries, body-orientation diagnostics, support-contact intent, root-motion intent, deterministic proof fixtures, Replay/Game parity checks, replay-analysis counters, and Replay Lab/capture visibility for the original missing movement buckets.

This does not mean the full human-motion engine is production-complete. It means the system no longer hides unsupported or partial classes. The next product/engine phase should convert diagnostic and approximate classes into physical avatar behavior:

1. Full body-plane floor contact IK for supine, prone, side-lying, rolling, and crawling.
2. Foot-plant pivot IK and gait sequencing for walking, stepping, lunges, and bear crawl.
3. Jump/hop flight, impact, and balance recovery animation.
4. Explicit prop/environment models for chair, wall, floor, ball, and reformer interaction.
5. Robust side-swap and self-occlusion recovery for fast turns and away-facing movement.
5. Larger yoga/Pilates libraries backed by recorded proof data rather than only synthetic fixtures.
