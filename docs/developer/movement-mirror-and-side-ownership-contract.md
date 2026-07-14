# Movement Mirror And Side-Ownership Contract

Last reviewed: 2026-07-13
Status: canonical contract; implementation and acceptance proof are currently reopened.
Audience: product, movement-engine, Game Studio, Replay Studio, scoring, QA, and future coding agents.

## Latest State Of Play, 2026-07-13

Contract/documentation score: **95%** complete. The intended anatomical side-ownership rules, pipeline order, vocabulary, diagnostics, and acceptance requirements are now explicit enough to govern implementation.

Implementation/adherence score: **72%** complete against this contract. The shared repair work has fixed the currently proven `Full Spinal Flow` path, but final acceptance is still blocked until the current-fingerprint all-nine rendered gate passes.

Current rendered-acceptance score: **11% recording coverage**. `Full Spinal Flow` is the only current strict-passing acceptance recording: **1,290/1,290** player-avatar frames and **1,290/1,290** independent three-party frames, with zero missing and zero failures. The historical 2026-07-12 all-nine bundle has complete frame accounting, but it is no longer a current pass because the strengthened analyzer detects sustained segment disagreements and the artifacts predate the current motion-pipeline fingerprint.

Remaining work:

- rerender targeted failing recordings and a fast representative subset while repairing;
- repair any sustained instructor/player-avatar disagreements in the shared Replay/Game pipeline;
- keep preview mirroring, coordinate reflection, anatomical ownership, and scoring correspondence as separate named decisions;
- run the full nine-recording frame-by-frame gate with zero silent skips only as final certification before claiming global acceptance;
- use Game Studio live-camera testing only as final confirmation after Replay proof passes.

## Purpose

This document defines how anatomical left and right must travel from an instructor recording and a live player through the movement pipeline into the two rendered avatars.

This is a mirror-following game. The instructor and the player's avatar must visibly perform the same anatomical movement. The human player uses the opposite anatomical side because they are facing and imitating the instructor as if looking in a mirror.

The primary invariant is:

> Instructor anatomical right -> instructor avatar right. Player anatomical left -> player avatar right. Therefore, the instructor avatar and player avatar both visibly move their right side.

The symmetric rule applies in the other direction:

> Instructor anatomical left -> instructor avatar left. Player anatomical right -> player avatar left. Therefore, the instructor avatar and player avatar both visibly move their left side.

This contract must be satisfied by actual rendered VRM bones. Matching source labels, solver decisions, debug metadata, or scoring values alone is not acceptance proof.

## Canonical Roles

| Source and destination | Required anatomical mapping | Example |
| --- | --- | --- |
| Recorded instructor -> instructor avatar | Identity | Recorded right arm drives instructor-avatar right arm. |
| Live player -> player avatar | Opposite side | Player left arm drives player-avatar right arm. |
| Player -> instructor matching | Opposite side | Player left arm is compared with instructor right arm. |
| Instructor avatar -> player avatar visual result | Same side | Both rendered avatars raise their right arm together. |

Screen-left and screen-right are never anatomical ownership terms. They change with camera presentation, avatar facing direction, viewport cropping, and scene layout.

## Required Vocabulary

Use these terms in code, tests, diagnostics, and future documentation:

- `anatomical identity`: source left drives avatar left and source right drives avatar right.
- `anatomical opposite`: source left drives avatar right and source right drives avatar left.
- `coordinate reflection`: an X-axis or handedness conversion needed to move between camera, MediaPipe, Three.js, and VRM coordinate systems. It must not silently change anatomical ownership.
- `preview mirror`: a CSS, canvas, or video presentation transform. It must not mutate tracking data or anatomical ownership.
- `match correspondence`: which player body part is compared with which instructor body part.

Do not use `facing-player` as a complete mirror contract. It is ambiguous because it can mean visual facing direction, coordinate reflection, anatomical side swapping, or scoring correspondence. Those are separate decisions.

## Source Truth

MediaPipe pose indexes describe the tracked person's anatomical body. Raw capture and decoded recording data must retain that ownership:

- index `11` remains the tracked person's left shoulder;
- index `12` remains the tracked person's right shoulder;
- index `23` remains the tracked person's left hip;
- index `24` remains the tracked person's right hip;
- the same rule applies to every other bilateral landmark.

The webcam preview may be visually mirrored for the user. That presentation must not rewrite the raw pose, world-pose, hand, face, or blendshape source truth.

## Complete Pose-Landmark Ownership Table

MediaPipe pose has one midline point and 16 bilateral pairs. Every pair must follow the role mapping above.

| Body region | Left index | Right index | Instructor avatar | Player avatar |
| --- | ---: | ---: | --- | --- |
| Nose | 0 | 0 | Preserve midline | Preserve midline |
| Inner eye | 1 | 4 | Identity | Opposite |
| Eye | 2 | 5 | Identity | Opposite |
| Outer eye | 3 | 6 | Identity | Opposite |
| Ear | 7 | 8 | Identity | Opposite |
| Mouth corner | 9 | 10 | Identity | Opposite |
| Shoulder | 11 | 12 | Identity | Opposite |
| Elbow | 13 | 14 | Identity | Opposite |
| Wrist | 15 | 16 | Identity | Opposite |
| Pinky | 17 | 18 | Identity | Opposite |
| Index finger anchor | 19 | 20 | Identity | Opposite |
| Thumb anchor | 21 | 22 | Identity | Opposite |
| Hip | 23 | 24 | Identity | Opposite |
| Knee | 25 | 26 | Identity | Opposite |
| Ankle | 27 | 28 | Identity | Opposite |
| Heel | 29 | 30 | Identity | Opposite |
| Foot index / toe | 31 | 32 | Identity | Opposite |

`Identity` means left-to-left and right-to-right. `Opposite` means left-to-right and right-to-left.

The bilateral mapping must have one canonical registry. Pose preparation, retargeting, debug overlays, scoring, analyzers, and tests must consume or prove the same registry rather than maintaining independent pair lists.

## Axial And Whole-Body Motion

Not every movement belongs to a named left or right limb. Axial movement requires explicit sign rules:

| Motion | Instructor avatar | Player avatar |
| --- | --- | --- |
| Head pitch / nod up-down | Preserve | Preserve |
| Forward or backward torso lean | Preserve | Preserve |
| Squat, rise, and vertical root travel | Preserve | Preserve |
| Head yaw left-right | Preserve | Reverse |
| Head roll / ear-to-shoulder tilt | Preserve | Reverse |
| Torso side bend | Preserve | Reverse |
| Torso twist | Preserve | Reverse |
| Lateral root travel | Preserve | Reverse |

`Preserve` and `Reverse` refer to anatomical or body-local intent, not raw camera-space signs. Coordinate-system conversion may change a numeric sign without changing the required anatomical result.

Depth and travel must be defined in body-local terms. A future camera or avatar-facing change must not alter the instructor/player anatomical contract.

## Hands And Face

Hand payload ownership follows the same body-side rule:

- recorded instructor left hand -> instructor-avatar left hand;
- recorded instructor right hand -> instructor-avatar right hand;
- live player left hand -> player-avatar right hand;
- live player right hand -> player-avatar left hand.

Finger curl, aperture, and gesture shape must then be solved for the destination avatar hand. Coordinate reflection and destination handedness are application details; they must not create a second ownership swap.

Asymmetric facial ownership follows the same rule:

- instructor left/right eye and mouth expressions remain identity-mapped;
- player left/right eye and mouth expressions are opposite-mapped for the player avatar;
- head pitch intent remains preserved through tracking and decision layers;
- head yaw and roll follow the axial rules above.

Partial face-point swapping is not sufficient proof. Face landmarks, asymmetric blendshape names, and the final rendered expression must agree on destination side.

## Required Pipeline Order

The intended pipeline is:

```text
Raw anatomical source truth
  -> validation, confidence, and calibration
  -> explicit role-based anatomical mapping
       instructor: anatomical identity
       player avatar: anatomical opposite
  -> body-relative normalized vectors
  -> coordinate-system / handedness conversion
  -> avatar rest-pose retargeting
  -> smoothing, limits, contact, and floor constraints
  -> VRM bone application
  -> rendered-bone telemetry and visual proof
```

Preview mirroring is outside this motion pipeline. Scoring correspondence is a consumer of source truth and must not be used to determine avatar bone ownership.

There must be exactly one anatomical ownership conversion in each avatar path. Coordinate reflection must be independently named and independently tested so it cannot become an accidental second side swap.

Retarget segment and vector application receives already-owned destination segments. It must not add a player-only horizontal reflection after the explicit role-based mapping has selected the avatar side. If a numeric axis must flip for Three.js, MediaPipe, or VRM handedness, that conversion must be named as coordinate-system conversion, not anatomical ownership, and it must be tested without using the production mirror helper as its expected-value oracle.

Head pitch has one special rig-boundary rule: the raw intent remains the user's down/up pitch, but a VRM can use the opposite local bone sign for visible pitch. That sign conversion belongs only at final head-bone application and must be proven by rendered or bone-boundary telemetry. Tests must not treat raw pitch sign preservation as proof of visible head pitch correctness.

## Scoring Contract

Mirror-game scoring compares opposite human anatomy:

| Instructor | Matching player |
| --- | --- |
| Right arm and hand | Left arm and hand |
| Left arm and hand | Right arm and hand |
| Right hip, leg, and foot | Left hip, leg, and foot |
| Left hip, leg, and foot | Right hip, leg, and foot |
| Lean or turn right | Lean or turn left |
| Lean or turn left | Lean or turn right |
| Pitch, forward bend, squat, and rise | Same non-lateral movement |

The scoring result and both rendered avatars must agree. A high score while the avatars visibly use different anatomical sides is a blocking failure.

## Required Diagnostics

Debug UI and exported telemetry must state the role and mapping explicitly:

```text
Instructor output: anatomical-identity L->avatarLeft R->avatarRight
Player-avatar output: anatomical-opposite L->avatarRight R->avatarLeft
Match rule: playerLeft<->instructorRight playerRight<->instructorLeft
Preview: mirrored | not-mirrored
Coordinate reflection: image-x | world-x | none
```

Do not show the same generic side-map label for both avatars. Do not describe a CSS-mirrored webcam preview as proof that avatar ownership is correct.

## Acceptance And Regression Proof

### 1. Exhaustive ownership tests

Test all 16 bilateral pose pairs in both roles:

- instructor source left -> instructor avatar left;
- instructor source right -> instructor avatar right;
- player source left -> player avatar right;
- player source right -> player avatar left.

Add equivalent ownership tests for hand payloads, asymmetric blendshapes, head yaw/roll, side bend, twist, and lateral root travel.

### 2. Independent asymmetric pose proofs

Use hand-authored, one-sided poses that cannot pass through symmetry:

- right and left arm at 45 degrees;
- right and left elbow bend;
- right and left hand gesture;
- right and left single-leg raise;
- right and left lateral leg extension;
- right and left side bend;
- right and left head turn and head tilt;
- right and left step or lateral root travel.

The expected destination bones must be written explicitly in test data. The production mirror helper must not be reused as its own oracle.

### 3. Three-party rendered integration proof

For each proof case, run all three parties:

```text
Instructor source right movement
  -> rendered instructor right movement

Player source left imitation
  -> rendered player-avatar right movement

Assert rendered instructor right ~= rendered player-avatar right
```

Assertions must read actual VRM bone transforms after application. Solver labels or pre-render targets are supporting diagnostics only.

### 4. Full nine-recording frame-by-frame gate

The full nine-recording gate is the final certification gate. It is not required after every repair iteration.

During active development, use a tiered proof loop:

| Gate | Scope | When to run |
| --- | --- | --- |
| Targeted repro | The current failing recording or frame window | While repairing the failure with `movement:replay:targeted-proof` |
| Fast representative subset | Two or three diverse recordings | Before saying a fix is ready for final proof with `movement:replay:fast-subset-proof` |
| Full nine-recording gate | All nine acceptance recordings, every frame | Only before claiming global mirror-side ownership acceptance with `movement:replay:nine-proof` |

The recommended fast subset for the current reopened adherence work is `Full Spinal Flow`, `Spins`, and either `Full Motion Exercises` or `Full Body Flow`.

For every frame of every one of the nine acceptance recordings:

1. Render the recorded source through the instructor path.
2. Construct the anatomically opposite player imitation through an independent test oracle.
3. Run that imitation through the real live-player path.
4. Capture the actual rendered instructor and player-avatar bone transforms.
5. Assert both avatars perform the same anatomical movement within the agreed tolerance.

The gate must report:

- all nine recording identifiers;
- total frames expected, rendered, compared, missing, and failed;
- per-region side-ownership failures;
- axial-direction failures;
- owner transitions or one-frame side flicker;
- the first and worst failing frame for each category.

Acceptance requires uninterrupted full sequences, zero silently skipped frames, and no sparse selected-frame override.

### 5. Manual visual confirmation

Manual testing remains final confirmation:

- instructor raises right; player raises left; both avatars visibly raise right;
- repeat on the other side;
- repeat for arms, legs, side bend, head yaw/roll, twist, and lateral travel;
- confirm head pitch, forward bend, squat, and rise are preserved rather than reversed.

Manual confirmation does not replace the rendered-bone and all-frame gates.

## Current Known Non-Conformance

As of 2026-07-10, the current implementation does not satisfy this contract consistently:

- live player display preparation applies anatomical-opposite mapping, which is the intended player-avatar rule;
- recorded instructor display preparation also applies the side swap, but the instructor requires anatomical identity;
- both motion frames are currently described with the generic `facing-player` mirror mode;
- scoring already compares opposite player/instructor limbs, so scoring can appear correct while the rendered avatars visibly disagree;
- current tests prove the player-side swap and in places explicitly expect instructor mirroring, but they do not prove the three-party rendered invariant;
- current full-recording proof does not yet run recorded instructor identity and opposite live-player imitation together through actual rendered bones for every frame.

2026-07-11 follow-up: the player-avatar retarget segment layer had been adding a second horizontal reflection after display-side ownership had already mapped player anatomy into the destination avatar side. That is forbidden by this contract. The head path also preserved raw pitch sign into a rig boundary where the visible Jane head pitch axis is opposite, causing down/up to render inverted. Both cases are examples of why anatomical ownership and coordinate/bone-axis conversion must remain separate.

2026-07-13 adherence update: the three-party all-frame capture now exists for all nine recordings with complete 11,383/11,383 frame accounting on both proof paths. However, the strengthened analyzer detects sustained above-threshold instructor/player-avatar segment disagreement that the earlier session-p95 gate diluted; for example, the historical Spins artifact diverges on both shins for frames 645-647. Those artifacts also predate the current motion-pipeline fingerprint. Complete telemetry is evidence availability, not automatic adherence.

2026-07-13 latest repair state: the current-fingerprint targeted proof for `Full Motion Exercises` now passes both strict paths: **3,026/3,026** player-avatar frames and **3,026/3,026** independent three-party frames, zero missing and zero failures. The fix keeps upper-arm and lower-body ownership in the retarget/world space consumed by those render paths, but measures lower-arm side dominance from raw anatomical pose so world-pose lower-arm flips cannot relabel the human arm that moved. Three-party startup also keeps the synthetic player head neutral until the instructor recorded head path is active, preventing the first three frames from using a role-specific calibrated-player head path while the instructor is still neutral.

2026-07-13 fast-subset update: the current-fingerprint fast subset now passes `Spins`, `Full Spinal Flow`, and `Full Motion Exercises` across both strict rendered paths. Frame accounting is complete with zero missing and zero failures: `Spins` **648/648** player-avatar plus **648/648** three-party, `Full Spinal Flow` **1,290/1,290** plus **1,290/1,290**, and `Full Motion Exercises` **3,026/3,026** plus **3,026/3,026**.

Progress score as of this update:

- Contract documentation: **96%** complete.
- Shared implementation/adherence: **88%** complete.
- Current strict rendered acceptance: **33% recording coverage** (`Spins`, `Full Spinal Flow`, and `Full Motion Exercises` under the latest fingerprint).
- Next gate: run all nine only as final certification, then perform Game Studio live confirmation.

Until the current-fingerprint all-nine gate passes the sustained rendered-bone checks, mirror-side ownership remains blocked for acceptance.

## Change Control

Any change to capture, display preparation, landmark ownership, scoring correspondence, retargeting, root motion, head/spine signs, hands, face, VRM application, or debug telemetry must preserve this contract.

A change is not complete until:

1. the canonical contract remains unchanged or is deliberately reviewed with product ownership;
2. exhaustive ownership tests pass;
3. asymmetric three-party rendered proofs pass;
4. the full nine-recording frame-by-frame gate passes when the change affects shared avatar behaviour;
5. the architecture plan and verification notes reflect the current evidence honestly.

Do not change the contract merely to make an existing implementation or test pass.
