# Movement Mirror Methodology Implementation Plan

Last reviewed: 2026-07-14
Status: active for human Replay and live acceptance. Current-fingerprint deterministic Replay proof passes 9/9 recordings across both rendered paths with 22,766/22,766 total frame-path checks, zero missing, and zero failures. The 2026-07-11 live Game check-in remains unaccepted pending human confirmation. Replay, injected-frame, internal bone-name, mapping-metadata, or automated artifacts must not be reported as current live acceptance.
Owner: shared Movement Studio / Replay Studio / Game Studio motion pipeline.
Canonical contract: [`docs/developer/movement-mirror-and-side-ownership-contract.md`](../../developer/movement-mirror-and-side-ownership-contract.md)

## Objective

Implement and permanently prove the mirror-game relationship:

```text
Instructor anatomical right
  -> instructor-avatar right

Player imitates with anatomical left
  -> player-avatar right

Final visible result
  -> instructor avatar and player avatar both move right
```

The symmetric left-side rule must also hold. The methodology must cover all pose landmarks, head and torso axes, root travel, hands, fingers, asymmetric face signals, scoring, diagnostics, Replay Studio, Game Studio, and the actual rendered VRM bones.

This plan exists because the previous generic `facing-player L->avatarRight R->avatarLeft` mapping was applied or reported for both instructor and player paths. Focused tests could therefore pass while the two rendered avatars visibly used different anatomical sides.

## Product Decision

The product rule is fixed by the canonical contract. Implementation and tests must conform to it; the contract must not be weakened to preserve current code or green tests.

Four concepts are independent:

1. Preview mirroring: how the webcam/video is shown on screen.
2. Coordinate reflection: how image, MediaPipe world, Three.js, and VRM axes are converted.
3. Anatomical ownership: which source body side owns which destination avatar bone.
4. Match correspondence: which player side is compared with which instructor side.

No single Boolean or generic mirror-mode label may represent all four.

## Current Status

Overall movement roadmap: **73%** on the standing architecture board. The narrower automated mirror-methodology and rendered Replay acceptance slice is approximately **96%**; human Replay review and live Game confirmation remain open.

Mirror methodology slice:

- Contract definition: 100%.
- Prominent repository handoff: 100%.
- Implementation plan: 100% when this document is accepted.
- Core role-based mapping implementation: replay/injection behaviour is advanced, but live Game correctness is unaccepted after the visible wrong-side arm failure.
- Retarget segment boundary: updated on 2026-07-11 to forbid a second player-only horizontal reflection after display-side ownership has already mapped player left/right into avatar destination sides.
- Head pitch boundary: updated on 2026-07-11 so raw player/instructor head intent is preserved until VRM application, then inverted once because the Jane rig's visible head pitch axis is opposite the tracking pitch sign.
- Hand-authored three-party rendered regression proof: incomplete as an acceptance oracle because it asserts internal bone identity/direction without proving the final visible screen side in the real webcam lifecycle.
- Deterministic player-avatar all-frame, all-nine proof: 100% under the current fingerprint, **11,383/11,383** frames with zero missing and zero failures.
- Deterministic independent three-party harness: 100% implemented and passing all nine recordings, **11,383/11,383** frames with zero missing and zero failures.
- Uninterrupted all-nine capture and frame accounting: 100% under the current fingerprint; **22,766/22,766** total rendered frame-path checks.
- Uninterrupted all-nine automated acceptance: passed under the strengthened sustained-divergence gate.
- Current same-runtime evidence: strict 9/9 pass on both rendered proof paths. The controlling local bundle is `tmp/movement-replay-lab/current-nine-recording-proof-final-v3-2026-07-14/` and is intentionally uncommitted.
- Manual flagged-event confirmation: 100% across the controlling nine recordings.
- Live Game mirror acceptance: **reopened / pending human confirmation**. The first human check-in failed visibly; the focused synthetic proof page now passes the basic left-arm/right-arm and head-sign boundary checks, but this does not replace a real camera check.
- Combined implementation-and-acceptance estimate: automated mirror implementation and rendered Replay acceptance are approximately 96% complete; human Replay review and real Game Studio camera acceptance remain separate open evidence lanes.

Phase 8 remains open only for human Replay review and live Game confirmation. The previous live human result is still not accepted, so automated Replay proof must not be used to claim that the camera lifecycle is fixed.

## Definition Of Done

This work is complete only when all of the following are true:

- Raw live and recorded source frames retain MediaPipe anatomical ownership.
- Recorded instructor source-left drives instructor-avatar left; source-right drives instructor-avatar right.
- Live player source-left drives player-avatar right; source-right drives player-avatar left.
- Player-left is scored against instructor-right; player-right is scored against instructor-left.
- Head pitch, forward/back lean, squat/rise, and vertical travel preserve direction.
- Head yaw/roll, side bend, twist, and lateral travel preserve instructor direction and reverse player-avatar direction.
- Hands, fingers, asymmetric face signals, legs, heels, and toes obey the same role rule.
- Debug UI shows distinct instructor, player-avatar, match, preview, and coordinate mappings.
- Hand-authored asymmetric tests prove both directions without using the production mirror helper as the expected-value oracle.
- Actual rendered VRM bones prove the three-party invariant.
- Every frame of all nine recordings passes deterministic frame-step proof with zero missing frames.
- Every one of the nine recordings passes uninterrupted playback proof without wrong-side movement, owner flicker, floor snaps, or unsupported jerk.
- No low whole-recording result is overridden by a few clean selected captures.
- Manual testing confirms the exact instructor-right / player-left / both-avatars-right scenario and its symmetric opposite across the whole body.
- Trusted Node 22.13.0 repository gates pass before merge or push.

## Scope

### In scope

- MediaPipe pose indexes 0-32.
- Pose world landmarks.
- Recorded instructor display and avatar paths.
- Live player display and avatar paths.
- Head pitch, yaw, and roll.
- Spine forward lean, side bend, and twist.
- Root rotation and lateral/vertical/depth travel.
- Arms, elbows, wrists, and pose hand anchors.
- Dedicated left/right hand payload ownership and finger application.
- Asymmetric face landmarks and blendshape side names.
- Hip, thigh, knee, shin, ankle, heel, foot, and toe ownership.
- Foot contact and planted/swing-foot owner labels.
- Scoring correspondence.
- Debug overlays and exported telemetry.
- Synthetic proof routes.
- Replay Lab and Game Studio shared runtime application.
- Full rendered acceptance tooling for all nine recordings.

### Out of scope

- New movement families unrelated to mirror ownership.
- Per-recording canned poses or bone-specific patches.
- A Game-only fix that diverges from Replay/shared motion.
- Relaxing visual thresholds to make existing artifacts green.
- Treating webcam preview orientation as motion ownership.
- Re-recording source videos before the existing recordings have been exercised through the corrected harness.

## Current Code Inventory

### Source truth and capture

These boundaries must remain anatomical and unmirrored:

- `src/app/(dashboard)/demos/movements/_hooks/useMovementCapture.ts`
- `src/app/(dashboard)/demos/movements/_hooks/useMovementPlayerTracking.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementFrameCodec.ts`

Required invariant: a landmark named/indexed left is still the tracked person's anatomical left when it enters `MovementSourceFrame`.

### Ownership and display preparation

Primary implementation boundaries:

- `src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementDisplayLandmarks.ts`
- `src/app/(dashboard)/demos/movements/_lib/vrmRigging.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarMotionFrameInput.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarSolverRuntime.ts`

Known issue: instructor and player display paths currently converge on the same broad side-swap semantics even though the instructor requires identity and the player avatar requires opposite ownership.

### Retarget and VRM application

- `src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarArmTargetDecision.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyTargetSelection.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBody.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarTarget.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarBodyFrame.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameApplication.ts`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`

Required invariant: destination bone names are selected by the explicit role mapping before rest-pose retargeting. Retargeting must not introduce another side swap. Segment/vector application receives already-owned player-avatar destinations, so it must not apply an additional player-only horizontal reflection to arms, legs, feet, or hands.

### Axial motion

- `src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadDecision.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadTarget.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerSpineDriveShared.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarRecordedSpineDrive.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementSpineMetrics.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementRootMotion.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementBodyOrientation.ts`

Required invariant: lateral signs are role-controlled; sagittal and vertical motion are not reversed merely because the player is mirrored. Head pitch raw intent is preserved through tracking and decision layers, then may invert exactly once at the VRM head-bone application boundary when the rig's local pitch axis is visually opposite to the tracking sign.

### Hands, face, scoring, and diagnostics

- `src/app/(dashboard)/demos/movements/_lib/handMatching.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementScoring.ts`
- `src/app/(dashboard)/demos/movements/_hooks/useMovementMatchScoring.ts`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementTrackingDebugOverlay.tsx`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.ts`
- `src/app/(dashboard)/demos/movements/replay-lab/page.tsx`

Required invariant: scoring remains opposite-human correspondence while avatar ownership is role-specific. A correct score cannot mask visibly inconsistent avatars.

### Existing candidate proof tooling

The current worktree includes candidate commands that may be retained, revised, or replaced during implementation:

- `movement:avatar:live-behavior-gate`
- `movement:replay:full-sequence`
- `movement:replay:full-sequence:analyze`
- `movement:avatar-follow-gate`
- `movement:replay-studio-verdict-gate`
- `movement:today-finish-gate`

Candidate tooling is not accepted merely because it runs. It must be aligned with this plan, tested, indexed by exact rendered frame, and unable to pass on sparse or pre-render evidence.

## Target Architecture

### 1. One canonical bilateral registry

Define one canonical pose-pair registry for:

- eyes, ears, and mouth anchors;
- shoulders, elbows, wrists, and hand anchors;
- hips, knees, ankles, heels, and toes.

Every consumer either uses that registry or proves an intentional derived mapping. Remove independent pair arrays that can drift.

### 2. Explicit role mapping

Use a role-level decision with semantics equivalent to:

```text
instructor output -> anatomical identity
player-avatar output -> anatomical opposite
```

The exact type names can change. The semantics cannot.

### 3. Separate coordinate policy

Image X reflection, world X reflection, avatar facing, and VRM handedness must be explicit coordinate policies. They must not swap array indexes or destination bone ownership unless the anatomical mapping step requested it.

### 4. One anatomical conversion

Each avatar path performs anatomical ownership mapping exactly once:

- instructor: identity conversion;
- player avatar: opposite conversion.

The pipeline must record where that conversion happened. Later stages consume destination-side data without guessing or mirroring again.

### 5. Source and display remain inspectable

`MovementMotionFrame` must retain:

- raw anatomical source truth;
- explicit output role;
- explicit anatomical mapping;
- coordinate reflection metadata;
- destination-side display landmarks or targets;
- scoring correspondence;
- actual rendered-bone telemetry.

This makes wrong-side failures localizable rather than hidden behind a generic display frame.

## Implementation Sequence

The order is deliberate. Do not start with bone tuning.

### Phase 0: Freeze The Contract And Capture A Failing Baseline

Progress: 100%.

Tasks:

- [x] Publish the canonical mirror and side-ownership contract.
- [x] Promote it into `AGENTS.md` and documentation indexes.
- [x] Reopen Phase 8 in the standing architecture board.
- [x] Capture one deterministic failing instructor-right / player-left / rendered-output example from the current code.
- [x] Export current source ownership, display ownership, destination bones, coordinate reflection, and actual rendered bone directions for that example.
- [x] Preserve the baseline below for before/after comparison without treating it as acceptance proof.

Captured baseline and first corrected proof, 2026-07-10:

| Role and source | Mapping reported before | Rendered upper arm before | Mapping after first correction | Rendered upper arm after |
|---|---|---|---|---|
| Instructor source-right raise | `facing-player L->avatarRight R->avatarLeft` | left `y=0.83`; right `y=-0.97` | `same-side L->avatarLeft R->avatarRight` | left `y=-0.97`; right `y=0.83` |
| Player source-left raise | `facing-player L->avatarRight R->avatarLeft` | left `y=-0.84`; right `y=0.97` | unchanged player mapping | left `y=-0.84`; right `y=0.97` |

The baseline located the first visible ownership divergence in recorded-instructor input preparation: coordinate reflection and anatomical pair swapping were combined. The correction splits those operations. This table is arm-slice evidence only; it is not whole-body or all-recording acceptance.

Exit criteria:

- The current wrong relationship is reproducible and named at the first divergent stage.
- No implementation change has started before the red baseline exists.

### Phase 1: Add Failing Contract Tests Before Changing Runtime

Progress: 92%.

Tasks:

- [x] Add a hand-authored instructor-right / player-left arm case.
- [x] Add the symmetric instructor-left / player-right arm case.
- [x] Add an independent all-33 pose-landmark ownership table covering elbow, wrist/hand anchors, hip, knee, ankle, heel, and toe in both roles.
- [x] Add head yaw/roll, side bend, twist, and lateral-root sign cases. Each passes both directions at the actual-renderer boundary.
- [ ] Add preserved pitch, forward lean, squat/rise, and vertical-root cases. Head pitch now passes; the remaining axial cases stay open.
- [x] Make the arm expected destination sides explicit test data rather than calling the production mirror helper.
- [x] Prove that the previous code fails the instructor-identity assertion.

Exit criteria:

- The tests are red for the known contract violation.
- The test oracle cannot share the production mapping implementation.

### Phase 2: Establish One Ownership Registry And Typed Decisions

Progress: 65%.

Tasks:

- [x] Consolidate the 16 bilateral pose pairs into one canonical registry and make VRM preparation consume it.
- [x] Define an explicit `identity | opposite` anatomical-mapping decision separately from avatar role.
- [x] Separate coordinate reflection from anatomical side swapping in VRM input preparation.
- [ ] Define match-correspondence metadata separately.
- [ ] Remove or deprecate generic naming that implies `facing-player` fully specifies ownership.
- [x] Add an exhaustive independent expected-value test covering the unpaired centre point and all 16 bilateral pose pairs without importing the production registry as its oracle.

Exit criteria:

- One source of truth owns bilateral pose pairing.
- Tests prove all pose indexes for instructor identity and player-avatar opposite mapping.
- No coordinate or preview flag silently changes anatomical ownership.

### Phase 3: Correct Recorded Instructor Identity

Progress: 88%.

Tasks:

- [x] Make recorded source-left drive instructor-avatar left for the rendered arm proof.
- [x] Make recorded source-right drive instructor-avatar right for the rendered arm proof.
- [x] Preserve necessary image/world coordinate conversion without pair swapping in recorded VRM preparation.
- [x] Verify instructor arms, legs, feet, head lateral axes, spine, root, hands/fingers, and asymmetric blink ownership. Broader mouth/face coverage remains in Phase 6 rather than weakening this proof.
- [ ] Confirm Replay and Game recorded-instructor paths use the same result.

Exit criteria:

- Instructor asymmetric tests pass in both directions.
- Actual rendered instructor bones match source anatomical ownership.
- Replay/Game parity remains intact.

Rollback condition:

- Revert the smallest instructor-mapping slice if coordinate handedness makes previously correct non-lateral movement reverse or if Replay/Game diverge. Do not compensate with per-bone side patches.

### Phase 4: Preserve Live Player-Avatar Opposite Mapping

Progress: 85%.

Tasks:

- [x] Make the player-avatar display decision consume an explicit opposite anatomical mapping while source and instructor decisions consume identity.
- [x] Prove with rendered arms, legs, head yaw/roll, side bend, twist, lateral root, fingers, and asymmetric blinks that player left drives avatar right and player right drives avatar left.
- [ ] Remove double swaps across display preparation, retarget target selection, and VRM application.
- [ ] Preserve calibration, smoothing, confidence holds, foot contact, and rest-pose mapping.

Exit criteria:

- Player asymmetric tests pass in both directions for all bilateral regions.
- Actual rendered player-avatar bones use the expected opposite destination side.
- No loss of movement amplitude or new neutral/static limbs is introduced.

### Phase 5: Align Axial Motion

Progress: 90%.

Tasks:

- [x] Preserve head pitch for instructor and player avatar in rendered head-down proof.
- [ ] Preserve forward/back lean, squat/rise, and vertical root movement.
- [x] Preserve instructor head yaw/roll, side bend, twist, and lateral root travel.
- [x] Reverse player-avatar head yaw/roll, side bend, twist, and lateral root travel.
- [ ] Verify transitions through neutral do not flicker ownership or sign.

Exit criteria:

- Head-down, side-lean, twist, and lateral-travel rendered-bone tests pass.
- Source-supported lateral motion never becomes static because of side mapping.
- Non-lateral movement is not accidentally reversed.

### Phase 6: Align Hands And Face

Progress: 80%.

Tasks:

- [x] Preserve instructor hand payload ownership.
- [x] Swap player hand payload ownership exactly once.
- [x] Solve fingers using destination handedness without a second ownership swap.
- [x] Preserve instructor asymmetric eye expression side.
- [x] Swap player-avatar asymmetric eye expression side.
- [ ] Audit full face-side handling rather than relying on a partial pair swap.

Exit criteria:

- One-sided hand gestures and asymmetric facial signals pass identity/opposite tests.
- Final rendered hand/finger and expression ownership agrees with pose anchors.

### Phase 7: Align Scoring, Diagnostics, And UI Truth

Progress: 25%.

Tasks:

- [ ] Keep player-left compared with instructor-right and vice versa.
- [ ] Prove scoring uses raw anatomical truth or explicit match correspondence, not avatar display indexes by accident.
- [ ] Show instructor output as `anatomical-identity`.
- [ ] Show player-avatar output as `anatomical-opposite`.
- [ ] Show match correspondence separately.
- [ ] Show preview and coordinate reflections separately. Actual head/spine/root telemetry and mapped spine comparison are now exposed; complete transform labels remain open.
- [ ] Block acceptance when scoring is high but rendered avatar sides disagree.
- [ ] Update Replay Lab exports and failure codes for role-specific wrong-side failures.

Exit criteria:

- Debug UI cannot show the same generic side map for both avatars.
- A reviewer can identify source side, destination bone, coordinate transform, scoring partner, and actual rendered side for any frame.

### Phase 8: Three-Party Actual-Renderer Proof

Progress: 90%.

Tasks:

- [x] Build instructor-right / player-left / both-avatars-right rendered proof for arms and legs.
- [x] Build the symmetric left proof for arms and legs.
- [x] Cover arms, elbows, hands/fingers, legs, feet, head yaw/roll, side bend, twist, and lateral root travel in both directions; asymmetric blink expressions are also covered.
- [x] Read actual VRM arm, thigh, shin, foot, floor, head, spine, chest, upper-chest, root, finger-bone, and expression transforms/weights after application.
- [x] Compare rendered instructor and rendered player-avatar destination transforms for the arm/leg/head/side-bend/twist/root/finger/blink slice.
- [x] Prove movement amplitude as well as categorical side ownership for the covered slice.
- [ ] Capture first/worst failure with source and rendered telemetry.

Exit criteria:

- Every asymmetric three-party case passes actual-rendered assertions.
- No test passes only because solver targets agree before VRM application.

### Phase 9: Deterministic Every-Frame Proof Across All Nine Recordings

Progress: 100% implementation and **9/9 acceptance** with **11,383/11,383** rendered frames, zero missing, and zero failures. The independent three-party path scores every rendered segment frame, including low-confidence frames, and hard-fails missing rendered roles or segments.

Tasks:

- [x] Load the controlling nine-recording fixture set and retain all identifiers in the per-recording artifacts.
- [x] Step each source frame deterministically while preserving one continuous avatar runtime per recording.
- [x] Wait for source-frame selection, committed replay refs, and a subsequent actual avatar render before accepting the same frame index.
- [x] Render instructor identity output with role-specific actual-bone telemetry.
- [x] Construct the opposite player imitation using an independent, explicitly duplicated landmark/hand/face table plus physical coordinate reflection.
- [x] Run the imitation through the real live-player motion-frame and avatar path.
- [x] Compare actual instructor/player-avatar bones for the three-party invariant.
- [x] Report expected, rendered, missing, role-missing, axial, per-segment, and failed frame counts for the Walking pilot. Aggregate all-nine reporting remains open.
- [x] Fail the player-avatar gate on any missing index, wrong-side result, unsupported sign reversal, or sparse-capture substitution. Duplicate-index rejection must still be made explicit in the aggregate gate.

Exit criteria:

- All 11,383 source frames are accounted for across nine recordings.
- Zero expected frames are missing from rendered comparison.
- Zero categorical side-ownership failures occur on confident asymmetric movement.
- Each recording independently meets the whole-recording visual threshold; averaging across recordings cannot hide a failure.

### Phase 10: Uninterrupted Playback And Smoothness Proof Across All Nine Recordings

Progress: 100% for automated capture, analysis, and flagged-event review on the controlling current-runtime set.

Tasks:

- [x] Play every complete recording sequentially at its intended timing.
- [x] Capture frame-indexed actual rendered telemetry throughout playback.
- [x] Detect and report owner transitions unsupported by the source.
- [x] Detect floor snaps, leg drops, one-frame neutral resets, and return jumps.
- [x] Detect head/spine/arm/leg freezing during confident source motion.
- [x] Measure source-relative jerk so genuine fast human motion is retained for review rather than misclassified.
- [x] Fail when any recording times out or loses frames; recordings were captured sequentially rather than in concurrent browsers.

Exit criteria:

- All nine uninterrupted sequences complete.
- No unsupported wrong-side transition or owner flicker occurs.
- No source-independent leg-to-floor snap or bounce occurs.
- No confident sustained movement is rendered static.
- Worst-frame artifacts are exported and reviewed.

### Phase 11: Manual Release Confirmation And Full Repository Gate

Progress: 30%. All flagged uninterrupted events have been visually reviewed; the exact live three-party scenarios and full repository gate remain open.

Tasks:

- [ ] Manually confirm instructor-right / player-left / both-avatars-right.
- [ ] Confirm the symmetric side.
- [ ] Repeat for arms, legs, side bend, head yaw/roll, twist, and lateral movement.
- [ ] Confirm pitch, forward lean, squat, and rise preserve direction.
- [ ] Run the focused mirror gate and both all-nine gates.
- [ ] Run Node 22.13.0 repository verification from `AGENTS.md`.
- [ ] Update the contract, standing board, verification notes, and support claims with final evidence.

Exit criteria:

- User-visible manual behaviour matches the contract.
- All automated rendered gates are green on fresh artifacts from the current pipeline fingerprint.
- No merge, push, or release claim is made before the full gate passes.

## Acceptance Recording Set

The controlling set contains nine recordings and 11,383 source frames:

| Recording id | Expected frames |
| --- | ---: |
| `px71h2bsqg9xv8pxyffv5xgaed89wbx3` | 648 |
| `px72q2e5m8pw9gctaj11yh36a989wjt7` | 632 |
| `px736zs97w9axrn39je7pfahc989q8jv` | 1,290 |
| `px74tzfb514yq5zpm2mpt3fdkx89xr2z` | 708 |
| `px75fgt11wbg0jvr17j6fc2dvd89trpm` | 3,026 |
| `px7b0y1rcfbe1e1zanknsgefp986f1qs` | 1,815 |
| `px7ebpmfazdrtbad9bpefxnmp589xwj6` | 554 |
| `px7fafa0wypmmc5rfz1nzmdvas88n6m0` | 2,169 |
| `px7fmzw2v4yzex6yx3n9dchj0h89x7e3` | 541 |
| **Total** | **11,383** |

The gate must discover or verify this controlling set from an explicit manifest. A recording may be classified source-limited for a particular fidelity metric, but it may not be silently omitted from frame accounting or mirror-side ownership reporting.

## Fresh All-Nine Uninterrupted Baseline

Captured 2026-07-10 from the current motion-pipeline fingerprint. This is a failing baseline, not acceptance proof. The nine recordings ran sequentially so concurrent browsers could not distort playback timing.

| Recording id | Expected | Captured | Missing | Strict result | Primary blockers |
| --- | ---: | ---: | ---: | --- | --- |
| `px71h2bsqg9xv8pxyffv5xgaed89wbx3` | 648 | 648 | 0 | blocked | side-bend under-response 54; jerk 66 |
| `px72q2e5m8pw9gctaj11yh36a989wjt7` | 632 | 632 | 0 | blocked | jerk 29; lower-arm side mismatch 64; thigh mismatch 17 |
| `px736zs97w9axrn39je7pfahc989q8jv` | 1,290 | 1,289 | 1 | blocked | missing frame 1; side-bend under-response 425; jerk 56 |
| `px74tzfb514yq5zpm2mpt3fdkx89xr2z` | 708 | 707 | 1 | blocked | missing frame 1; jerk 20; shin mismatch 44 |
| `px75fgt11wbg0jvr17j6fc2dvd89trpm` | 3,026 | 3,026 | 0 | blocked | suppressed leg motion 294; side-bend under-response 1,113; jerk 99 |
| `px7b0y1rcfbe1e1zanknsgefp986f1qs` | 1,815 | 1,815 | 0 | blocked | suppressed leg motion 392; jerk 116 |
| `px7ebpmfazdrtbad9bpefxnmp589xwj6` | 554 | 554 | 0 | blocked | side-bend under-response 34; thigh mismatch 15 |
| `px7fafa0wypmmc5rfz1nzmdvas88n6m0` | 2,169 | 2,169 | 0 | blocked | suppressed leg motion 174; side-bend under-response 236; jerk 78; upper-arm mismatch 92 |
| `px7fmzw2v4yzex6yx3n9dchj0h89x7e3` | 541 | 541 | 0 | blocked | jerk 14; thigh mismatch 90 |
| **Total** | **11,383** | **11,381** | **2** | **9/9 blocked** | **482 jerk events; 359 owner transitions** |

Across the asymmetric movement samples, the analyzer recorded 354 upper-arm, 267 lower-arm, 281 thigh, and 291 shin wrong-side comparisons. These are diagnostic counts, not independent frame totals; multiple segment failures can occur in one frame. Head correlation was strong across the set (`0.9359` to `1.0000`), while side-bend response was weak or reversed in several recordings. The next repair order is therefore:

1. stop lower-body owner churn and suppressed leg motion;
2. remove source-independent leg/thigh/shin jumps;
3. restore sustained side-bend response;
4. correct remaining asymmetric arm/leg side continuity;
5. add deterministic stepping so all 11,383 indexes are guaranteed independently of uninterrupted playback observation;
6. rerun the uninterrupted gate and require zero missing frames.

### First lower-body repair against the full recording

The first repair removed label-driven squat ownership when a complete source retarget is available. Before the change, `Full Motion Exercises` frame 1534 switched from 6/6 applied lower-body segments to 0/6 under `player-stable-squat`, immediately suppressing leg motion. After the change, a complete 3,026-frame rerun kept 6/6 retarget segments active through that window and reduced suppressed-leg frames from **294 to 0**.

This is not a pass. The rerun captured 3,025/3,026 frames, jerk fell only from 99 to 95, owner transitions fell from 80 to 76, and side-bend under-response remained 1,113 frames. At frames 1534–1537 both feet still move below the floor (worst observed clearance about `-0.38`), even while the owner stays `player-retarget`. That isolates the next defect to support-contact/root/floor correction rather than lost leg ownership. The plan must not describe the legs as smooth or accepted until that separate snap is removed and the whole recording passes.

### Planted-foot floor-continuity repair against the full recording

The floor snap had three separate causes, and the intermediate full-recording runs were kept as rejected evidence rather than promoted:

1. vertical correction shared the small lateral smoothing scale and a `0.05` clamp, so it could recover only about `0.02` from a roughly `0.20` one-frame drop;
2. the feet were measured before the hips moved, so the correction used stale pre-hips positions;
3. the anchor-reset threshold used full 3D distance, so a deep vertical squat released the floor anchors even when there was no horizontal step.

The runtime now keeps lateral correction smoothed at the existing player/instructor scales, gives vertical floor correction its own bounded scale, re-measures the feet after the hips write, and resets anchors from lateral travel rather than vertical squat travel. Planted retargeted squat translation also uses continuous source `hipDrop` instead of the thresholded squat label/depth jump. The no-contact far-camera fallback remains label-derived because it has no reliable planted retarget signal.

The rejected iterations show why the whole recording is required: vertical strength alone increased jerk to 127; fixing the stale measurement reduced it to 115; preserving anchors through vertical travel reduced it to 101. None was accepted as the final slice.

The current uninterrupted `Full Motion Exercises` rerun captured **3,026/3,026** frames with **0 missing**, **0 suppressed-leg frames**, **91 jerk frames**, and **75 owner transitions**. At the original failure window, left-foot clearance stays between about `-0.024` and `-0.026` through frames 1534–1545 instead of plunging to `-0.38`; right-foot clearance remains between about `+0.077` and `-0.005`. Visual root drop now grows continuously from `0.0147` at frame 1534 to `0.1542` at frame 1545 instead of jumping from `0.2329` toward `1.36` over the same transition.

This closes the isolated floor-plunge defect, not whole-video acceptance. The recording remains strictly blocked by 91 jerk frames, and the all-nine set has not yet been recaptured after this repair.

### Rendered side-bend proof correction

The legacy uninterrupted analyzer classified 1,113 `Full Motion Exercises` frames as side-bend under-response by comparing the side-bend drive with `avatarVisual.segments.spine.direction.x`. That visual vector is the hips-to-spine positional offset. Rotating the chest and upper-chest changes their descendants, not the spine bone's own offset, so the metric was observing the wrong rendered surface.

Actual post-application VRM telemetry tells the opposite story. Across all 1,113 qualifying frames, rendered chest/upper-chest Z rotation tracks side-bend drive with **1.000 correlation** and **1.55 response ratio**; the strongest observed window reaches about `0.58` radians on the chest and `0.49` on the upper chest. A regression test now holds the hips-to-spine vector constant while rendered chest rotations follow the drive, and requires the full-sequence analyzer to pass that motion.

Re-analyzing the existing nine-recording telemetry removes every historical side-bend blocker. The five recordings with qualifying side-bend samples report correlations from `0.9973` to `1.0000` and response ratios from `1.5494` to `1.5527`; the other four contain no qualifying side-bend samples. This is a proof correction, not an animation tuning change. All nine recordings remain blocked by their remaining real failures: jerk, missing frames, suppressed legs in older pre-repair captures, or mirror-side mismatches. The current complete `Full Motion Exercises` artifact now has one strict blocker: **91 jerk frames**.

The first temporal audit splits those 91 events into 46 foot-clearance jumps and 45 limb-direction jumps; only 22 events coincide with an owner transition. A trial that made the legacy foot lock switch between bilateral and single-foot anchors increased the complete-run total from 91 to 100, so it was rejected and rolled back. The next continuity repair must consolidate the overlapping support-contact and legacy foot-lock constraints rather than add another anchor-mode transition.

The retained consolidation makes the legacy foot lock yield whenever the shared support-contact constraint applies. A complete 3,026/3,026 run reduces jerk from **91 to 78** with 0 missing frames, 0 suppressed-leg frames, and side-bend still passing at 1.000 correlation / 1.55 response. Two follow-up attempts were rejected: per-foot bone correction raised jerk to 101, while moving root-only correction after hips produced an incomplete diagnostic at 92 events plus large startup clearance jumps. The retained 78-event version allows the lower planted foot to reach about `-0.16` in the squat window, so floor-contact precision is reopened even though the original `-0.38` plunge remains substantially reduced. Whole-recording acceptance stays blocked.

The next complete `Full Motion Exercises` run fixes two same-frame ownership conflicts. Parent torso writers now finish before child arm segment retargeting, and a complete six-segment player leg retarget is no longer overwritten by planted-squat IK. The resulting artifact captured **3,026/3,026** frames with **0 missing**, **0 suppressed-leg frames**, **59 jerk frames**, **75 owner transitions**, head correlation `1.000`, and side-bend correlation/response `1.000 / 1.55`. This is a 24% jerk reduction from the retained 78-event baseline: the synchronized four-leg snaps at frames 1541–1542 and four-arm snaps at frames 2184–2185 are removed, while the large frame-2999–3001 arm corrections are reduced to small residual movement. Squat-window floor clearance remains on the reopened one-owner baseline (about `-0.16` for the lower left foot; the lower right foot improves to about `-0.02`). The recording therefore remains strict-blocked by 59 real temporal events, dominated by foot-clearance and lower-body owner transitions; all-nine post-repair acceptance remains open.

The retained multi-foot floor rule then replaces opposing-error averaging with the correction required by the lowest positive-weight floor anchor. Mixed surfaces such as chair-plus-feet keep weighted averaging. A complete **3,026/3,026** run reduces total jerk from **59 to 53** and foot-clearance events from **44 to 33**; squat-window minimum clearance improves from about `-0.16` to `-0.09` on the left while the right remains about `-0.02`. Head and side-bend proof still pass and suppressed-leg frames remain zero. The tradeoff is explicit: limb-direction events rise from 15 to 20 overall (leg events from 13 to 18; arm events remain 2), so this is retained as a net floor/continuity improvement, not acceptance. The next repair must target lower-body owner transitions without weakening source-complete retarget ownership.

Complete recorded leg directions now remain retarget-owned through quiet `neutral` labels instead of easing to neutral and switching back at a motion threshold. A complete **3,026/3,026** replay reduces jerk from **53 to 34**, owner transitions from **75 to 59**, and leg-direction jerk from **18 to 3**. The remaining split is 29 foot-clearance events, 2 arm events, and 3 leg events; only 7 total events coincide with an owner transition. Squat minimum clearance remains about `-0.09 / -0.02`, with 0 missing and 0 suppressed-leg frames plus unchanged head and side-bend proof. This validates continuous source ownership but does not pass the recording: startup leg acquisition, the isolated frame-2306 arm discontinuity, residual foot-clearance oscillation, and all-nine acceptance remain open.

The foot-clearance proof then gained the same source-relative treatment as limb-direction jerk. It now compares rendered foot clearance with the mirrored source ankle-height change normalized by torso length; genuine raised-foot travel is no longer hardcoded as zero source motion. Dedicated regression tests prove both halves: a moving source foot does not fail, while a rendered clearance jump against a stable source still does. Re-analysis reduces `Full Motion Exercises` from 34 reported events to **16 genuine review events** and the automated strict session gate passes because the event rate is below 1%. An attempted relaxed-to-last-good arm easing change moved the isolated frame-2306 event to three events near frames 2999–3000 and raised a complete run from 34 to 35 under the old proof, so it was rejected and rolled back. The 16 review events remain visible and manual acceptance is not implied by the automated pass.

## Fresh Post-Repair All-Nine Uninterrupted Result

Captured sequentially on 2026-07-10 from the repaired runtime and analyzed with source-relative side-bend, limb, and foot-clearance proof. Every recording has complete frame accounting; this is **2/9 automated pass**, not release acceptance.

| Recording id | Captured | Missing | Strict result | Jerk review events | Owner transitions | Suppressed legs | Primary blocker |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| `px71h2bsqg9xv8pxyffv5xgaed89wbx3` | 648/648 | 0 | blocked | 32 | 22 | 0 | rendered motion jerk |
| `px72q2e5m8pw9gctaj11yh36a989wjt7` | 632/632 | 0 | blocked | 17 | 26 | 0 | rendered motion jerk |
| `px736zs97w9axrn39je7pfahc989q8jv` | 1,290/1,290 | 0 | blocked | 26 | 38 | 1 | rendered motion jerk; one suppressed-leg frame remains |
| `px74tzfb514yq5zpm2mpt3fdkx89xr2z` | 708/708 | 0 | blocked | 11 | 15 | 0 | rendered motion jerk |
| `px75fgt11wbg0jvr17j6fc2dvd89trpm` | 3,026/3,026 | 0 | passed | 16 | 59 | 0 | automated pass; 16 manual review events remain |
| `px7b0y1rcfbe1e1zanknsgefp986f1qs` | 1,815/1,815 | 0 | blocked | 39 | 14 | 0 | rendered motion jerk |
| `px7ebpmfazdrtbad9bpefxnmp589xwj6` | 554/554 | 0 | blocked | 3 | 4 | 0 | 20 thigh mirror-side mismatches |
| `px7fafa0wypmmc5rfz1nzmdvas88n6m0` | 2,169/2,169 | 0 | blocked | 15 | 44 | 0 | 92 upper-arm mirror-side mismatches |
| `px7fmzw2v4yzex6yx3n9dchj0h89x7e3` | 541/541 | 0 | passed | 3 | 34 | 0 | automated pass; 3 manual review events remain |
| **Total** | **11,383/11,383** | **0** | **2 passed / 7 blocked** | **162** | **256** | **1** | **all-nine release acceptance remains blocked** |

Compared with the first all-nine baseline, missing frames improve from 2 to 0, reported jerk from 482 to 162, owner transitions from 359 to 256, and suppressed-leg frames from 860 to 1. The focused repair below removes the repeated 2-radian arm teleports in two representative short recordings. The next priority is low-confidence arm catch-up and side-response proof, followed by the 20 thigh and 92 upper-arm mirror mismatches. These must be repaired and all nine rerun; the two automated session passes do not override the seven blocked recordings or manual review events.

### Focused arm-continuity repair after the all-nine run

The first repeated short-recording arm clusters were not one generic smoothing defect. They combined three ownership faults: a direction-only spine writer competed with the calibrated multi-axis spine drive and teleported both child arms; a one-frame tracking drop relaxed an established arm instead of holding its stored pose; and a segment crossing the `0.3` confidence boundary immediately used the normal `0.72..0.78` blend. The retained repair gives the calibrated spine drive sole torso ownership, holds an established arm through transient loss, ramps the low-confidence blend, and bounds each recovering arm bone to `0.08` rad per frame until segment confidence reaches `0.75`. Clear high-confidence tracking keeps the existing response.

Complete focused recaptures prove this is a measured improvement, not all-nine acceptance:

| Recording id | Before | Retained focused result | Status |
| --- | --- | --- | --- |
| `px72q2e5m8pw9gctaj11yh36a989wjt7` | 17 jerk events; peak arm snap `2.02` rad | 5 genuine review events after source-relative proof; 632/632, 0 missing | automated session passes; manual review still open |
| `px74tzfb514yq5zpm2mpt3fdkx89xr2z` | 11 jerk events; peak arm snap `2.05` rad | 4 genuine review events after source-relative proof; 708/708, 0 missing | automated session passes; manual review still open |

Artifacts are `px72.after-continuous-arm-owner.*` and `px74.after-continuous-arm-owner.*` under `tmp/movement-replay-lab/full-sequence-current/`. A wider limiter through `0.9` confidence reduced the first recording to six reported events but delayed correction into a new `0.75` rad snap and was rejected. The ownership-aware proof repair below separates genuine wrong-side behavior from unavailable/ambiguous evidence; remaining runtime work stays focused on temporal catch-up rather than another wider delay threshold.

### Ownership-aware proof and remaining temporal work

The full-sequence analyzer now distinguishes evidence from unavailable ownership instead of forcing every asymmetric source frame into pass/fail:

- arm side ownership requires both adjacent frames to be confidently retargeted (`>= 0.75`); recovery frames are counted as excluded;
- leg side ownership requires an active lower-body retarget chain on both adjacent frames plus usable segment confidence; neutral/no-owner frames are counted as excluded;
- expected-side and wrong-side movement within `0.006` rad is counted as ambiguous, not a wrong-side failure;
- limb world-space jerk includes intended source-driven root yaw, so a child moving with a real root turn is not misreported as an isolated limb snap.

Dedicated tests prove that low-confidence/unowned frames are excluded, near-ties are ambiguous, high-confidence wrong-side motion still fails, intended root turns do not create child jerk, and the same child motion against a stable root still fails. The analyzer also measures child-chain motion relative to its intended parent and arm motion relative to intended spine drive, so valid torso, thigh, and upper-arm travel is not double-counted as child jerk. Mirror side response is accumulated across a short three-transition window, preventing normal retarget smoothing from falsely reporting a side swap when one arm finishes the preceding frame's movement. A dedicated regression keeps that delayed handoff non-failing while the high-confidence wrong-side case remains failing.

Runtime diagnosis on `px736...` found two additional same-frame writers. A `player-spine-held` state previously eased toward neutral instead of holding rendered bones, then reacquired large lean/twist at normal speed. Held mode now performs zero spine writes and active spine catch-up is capped at `0.04` rad per bone per frame. Support-presentation arm poses could also overwrite successfully retargeted arms whenever the spine was not active; support arm specs are now filtered per side and cannot write a retarget-owned arm. Focused tests, typecheck, lint, and architecture guard pass.

Complete exact-session proof now exists for both remaining interim blockers. `px736...` captured **1,290/1,290** frames with zero missing and passes with 12 genuine review events; `px7b...` captured **1,815/1,815** frames with zero missing and passes with 11 genuine review events. The capture harness reads the fixture ID, clicks that exact row, and waits until `data-active-session-id` matches before capture. It also persists current-frame and playback-completion evidence on timeout instead of silently discarding partial progress. A proposed deterministic scrubber capture mode unmounted mid-run and was rejected rather than being kept as a flaky gate. These two exact captures close the interim automated blockers, but neither the mixed-age 9/9 result nor the review-event threshold substitutes for a fresh sequential all-nine run and human visual acceptance.

### Pre-visual-review all-nine result

The fresh sequential capture now covers all nine recordings and every expected frame. The first `px75...` attempt reached the final frame but missed index 576 and was rejected; its complete retry is the controlling artifact. All strict analyses pass under the same ownership-aware analyser:

| Recording | Frames | Missing | Review events | Automated status |
| --- | ---: | ---: | ---: | --- |
| `px71...` | 648/648 | 0 | 6 | passed |
| `px72...` | 632/632 | 0 | 3 | passed |
| `px736...` | 1,290/1,290 | 0 | 11 | passed |
| `px74...` | 708/708 | 0 | 2 | passed |
| `px75...` | 3,026/3,026 | 0 | 14 | passed |
| `px7b...` | 1,815/1,815 | 0 | 5 | passed |
| `px7eb...` | 554/554 | 0 | 1 | passed |
| `px7f...` | 2,169/2,169 | 0 | 10 | passed |
| `px7fm...` | 541/541 | 0 | 2 | passed |
| **Total** | **11,383/11,383** | **0** | **54** | **9/9 passed** |

This result triggered the human-visible review; it did not close release acceptance. That review found a real double-foot plunge at `px75...` frames 1677–1680 which the sub-1% session threshold had allowed. Both planted feet dropped roughly `0.36` world units while the source feet were effectively stationary. The support-contact correction had run before the hips application, so the hips moved the leg chain after the final floor constraint and the yielding legacy foot lock did not restore it.

The corrected runtime applies hips first, keeps the legacy foot lock yielded, applies the single support-contact owner last, and remeasures final foot telemetry after that correction. A focused regression proves final planted-foot world positions remain on the floor after a squat hips change. The complete `px75...` recapture captures **3,026/3,026** frames with zero missing, removes the entire 1678–1680 plunge cluster, keeps clearance at `0.000 / about 0.067` through that window, and reduces review events from 14 to 8 with no automated failures. Visual inspection of the remaining mid-recording events found the mirrored one-leg pose at frame 2121 stable and no visible discontinuity at frames 2952–2953 or 3003–3004; startup/end events remain explicitly source-limited. Because this runtime change post-dates the prior all-nine set, the other eight recordings must be recaptured before 9/9 current-runtime acceptance can be restored.

That post-repair recapture is now complete. All nine recordings pass strict analysis on the same corrected runtime with **11,383/11,383** frames, zero missing, **48** review events (down from the pre-visual-review 54), **256** owner transitions, and one suppressed-leg diagnostic frame in `px736...`. Per-recording review-event counts are `5, 5, 11, 4, 8, 3, 2, 6, 4` in controlling-set order. This restores current-runtime automated 9/9 while keeping human visual acceptance open beyond the completed `Full Motion Exercises` flagged-event review.

### Side-bend ownership continuity and current all-nine result

Visual review of `Full Spinal Flow` found a second genuine defect at frames 288–289. Complete, high-confidence recorded legs were forced to `player-lower-body-neutral` whenever absolute side bend was at least `0.12`, then switched back to `player-retarget` immediately below that hard threshold. The source remained smooth while all four rendered leg directions snapped together. The side-bend-specific neutral owner has therefore been removed: complete recorded legs now remain continuously retarget-owned through a feet-floor side bend, including a lateral leg lift. A focused regression proves that frames on both sides of the former threshold resolve to the same retarget owner.

The complete `Full Spinal Flow` recapture captures **1,290/1,290** frames with zero missing and strict-passes. Its former mid-motion event clusters at frames 289, 348, 430, and 469 disappear. The remaining endpoint events are source-limited: both feet are missing during startup and the lower body plus one arm leave capture at the final frame. Human visual review therefore covers this recording as well as `Full Motion Exercises`.

Because the ownership repair changed shared runtime behaviour, all nine recordings were recaptured sequentially rather than inheriting the older eight results. The controlling current-runtime set under `tmp/movement-replay-lab/full-sequence-current/all-nine-sidebend-owner/` records **9/9 strict passes**, **11,383/11,383** frames, **zero missing**, **33 review events**, **238 owner transitions**, and one suppressed-leg diagnostic frame in `px736...`. This supersedes the 48-event post-support-order set. It restores automated current-runtime acceptance, but manual visual acceptance remains open for the other seven recordings and deterministic frame-step proof remains unimplemented.

### Limb reacquisition continuity and final acceptance set

Completing manual review exposed two more threshold defects rather than allowing the 33-event aggregate to stand in for visual quality. `Body Capture 3D` switched a shin from four-segment partial fallback to six-segment retarget as knee confidence crossed `0.30`; `Star Jumps`, `Spins`, and `Turning Around in Circles` showed the same catch-up class in arm or leg chains when a temporary per-bone step bound was released. Moving the threshold only moved the visible jerk and was rejected.

The final policy separates the body regions. Arms use an eased confidence-response ramp from `0.30` through `0.90` plus a continuous confidence-scaled angular bound. Legs use a shorter linear response ramp and reach their continuous clear-tracking bound by `0.60`. Neither path has an on/off release threshold. Focused regressions cover initial acquisition, mid-confidence response, and clear-tracking limits. Complete recaptures remove the known shin snaps at `Body Capture 3D` frames 918 and 1114, the `Star Jumps` catch-up cluster, the `Spins` arm catch-up, and the `Turning Around in Circles` frame-316 shin release without suppressing normal mirrored response.

The final controlling set is `tmp/movement-replay-lab/full-sequence-current/final-mirror-acceptance/`. It records **9/9 strict passes**, **11,383/11,383 frames**, **zero missing**, **12 review events**, **238 owner transitions**, and one suppressed-leg diagnostic frame. Five recordings have zero review events. The remaining events are startup/end source acquisition, the already-reviewed one-leg foot-clearance frame, or monotonic recovery during the severe occlusion and 180-degree turn in `Body Capture 3D`; every flagged sequence has been manually inspected. This closes uninterrupted all-nine automated and flagged-event visual acceptance on the current runtime. Deterministic frame-step proof and final live three-party confirmation remain separate open definition-of-done items.

## Proof Matrix

### Bilateral regions

| Region | Instructor identity | Player opposite | Scoring correspondence | Final avatar parity |
| --- | --- | --- | --- | --- |
| Eyes/ears/mouth anchors | Required | Required | Diagnostic | Required for asymmetric face proof |
| Shoulder/upper arm | Required | Required | Opposite human sides | Required |
| Elbow/lower arm | Required | Required | Opposite human sides | Required |
| Wrist/hand anchors | Required | Required | Opposite human sides | Required |
| Dedicated hand/fingers | Required | Required | Opposite human sides | Required |
| Hip/thigh | Required | Required | Opposite human sides | Required |
| Knee/shin | Required | Required | Opposite human sides | Required |
| Ankle/heel/toe | Required | Required | Opposite human sides | Required |
| Contact/planted foot | Required | Required | Opposite human sides | Required |

### Axial motion

| Motion | Instructor | Player avatar | Final avatar relation |
| --- | --- | --- | --- |
| Head pitch | Preserve | Preserve | Same |
| Head yaw | Preserve | Reverse player | Same after opposite imitation |
| Head roll | Preserve | Reverse player | Same after opposite imitation |
| Forward/back lean | Preserve | Preserve | Same |
| Side bend | Preserve | Reverse player | Same after opposite imitation |
| Twist | Preserve | Reverse player | Same after opposite imitation |
| Squat/rise | Preserve | Preserve | Same |
| Vertical root | Preserve | Preserve | Same |
| Lateral root | Preserve | Reverse player | Same after opposite imitation |

## Gate Rules

### Non-negotiable categorical gates

- Wrong anatomical destination side: zero accepted failures.
- Missing expected rendered frame: zero.
- Silently skipped recording: zero.
- Sparse selected-frame override of full-recording failure: forbidden.
- Scoring green while rendered side ownership fails: blocking.
- Instructor and player avatar finishing on opposite anatomical sides for a valid imitation: blocking.

### Fidelity and smoothness gates

- Each supported recording must meet at least the existing `0.85` whole-recording visual threshold; this is necessary but not sufficient.
- Confident segment-direction error thresholds must live in one acceptance configuration, not per-recording tuning.
- Head, spine, arm, leg, and foot response must be compared against source movement amplitude and direction.
- Jerk must be source-relative: a large avatar step is a failure only when the source target did not make a corresponding step.
- Any owner change or neutral reset that causes a visible floor snap, leg drop, or one-frame pose jump is blocking even if the session average passes.
- Worst-frame output is mandatory for every metric; averages remain diagnostic.

Numerical thresholds may be calibrated during Phase 0/1 using stable fixtures, but they must be recorded centrally before the runtime fix is tuned. Weakening a threshold after seeing a failure requires an explicit contract review and before/after evidence.

## Verification Commands

Use Node `22.13.0`.

### Cheap checks during implementation

```bash
npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.test.ts'
npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.test.ts'
npx -p node@22.13.0 npm run typecheck
git diff --check
```

### Rendered behaviour proof

```bash
npx -p node@22.13.0 npm run movement:avatar:live-behavior-gate -- --movement-id <id> --secret <local-test-secret>
npx -p node@22.13.0 npm run movement:replay:full-sequence -- --debug-session-json <fixture> --out <telemetry>
npx -p node@22.13.0 npm run movement:replay:full-sequence:analyze -- --telemetry <telemetry> --session <fixture> --strict
```

The final plan requires one aggregate alias that runs the deterministic and uninterrupted rendered gates sequentially over the controlling nine-recording manifest. That alias does not yet constitute accepted proof and must be implemented and tested in Phase 9/10.

### Before handoff, merge, or push

```bash
npx -p node@22.13.0 npm run movement:today-finish-gate
npx -p node@22.13.0 npm run verify:env
npx -p node@22.13.0 npm run lint:all
npx -p node@22.13.0 npm run check
npx -p node@22.13.0 npm run build
git diff --check
```

## Artifact Requirements

Final proof artifacts must include:

- controlling manifest with all nine ids and expected frame counts;
- current code/pipeline fingerprint;
- deterministic per-frame rendered telemetry;
- uninterrupted-playback per-frame rendered telemetry;
- aggregate report plus one report per recording;
- missing/duplicate frame indexes;
- source side, destination side, match side, and actual rendered side;
- head/spine/root axis comparisons;
- arm/leg/foot segment comparisons;
- ownership transition and source-relative jerk events;
- first and worst failing frames;
- rendered screenshots or strips for the worst failures;
- manual review decision and reviewer/date;
- exact commands and Node version.

Stale artifacts from a different motion-pipeline fingerprint cannot prove the current code.

## Stop Conditions

Stop and diagnose before continuing when:

- source truth has already been side-swapped before role mapping;
- instructor identity only works by breaking player opposite mapping;
- player opposite mapping only works through a Game-only branch;
- a coordinate reflection changes anatomical ownership;
- scoring passes while actual rendered sides disagree;
- an all-nine command omits, times out, or silently reclassifies a recording;
- selected screenshots look correct while uninterrupted playback still snaps or freezes;
- concurrent browser execution changes playback timing or causes missing frames;
- a fix requires a per-recording or per-pose bone rule;
- a threshold is being weakened after a failure without contract review.

## Rollback Strategy

- Implement in small role-specific slices with failing tests first.
- Keep raw source construction untouched unless a source-purity test proves it is wrong.
- If an instructor fix regresses player behaviour, revert the shared ownership change and split the role decision explicitly; do not add another mirror.
- If a coordinate conversion regresses depth or facing, revert only that conversion and retain the anatomical mapping tests.
- If VRM application differs by avatar model, keep the anatomical contract fixed and correct the avatar rest-map/application layer.
- Never roll back by restoring the generic same mapping for both avatars.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Same production helper generates both input imitation and expected output | Use an independent hand-authored oracle and explicit expected destination bones. |
| X reflection and side swapping are accidentally combined again | Separate typed decisions and expose both in telemetry. |
| Existing green tests encode the old behaviour | Start with red contract tests and update old expectations only with rendered evidence. |
| Whole-recording averages hide one bad transition | Gate worst frames and categorical ownership, not averages alone. |
| Deterministic stepping misses runtime smoothing jerk | Require a second uninterrupted playback gate. |
| Uninterrupted playback misses source indexes due browser load | Run recordings sequentially, tag rendered telemetry by source index, and fail on missing indexes. |
| Source-limited recordings are silently skipped | Keep all nine in accounting; separate source limitation from omission. |
| Hands/face drift separately from pose ownership | Include them in the same role contract and rendered proof matrix. |
| Future refactor reintroduces ambiguity | Keep the contract mandatory in `AGENTS.md`, centralize the registry, and make the aggregate gate part of the finish gate. |

## Execution Checklist

### Contract and planning

- [x] Canonical mirror methodology documented.
- [x] Methodology promoted to `AGENTS.md`.
- [x] Developer and root documentation indexes updated.
- [x] Architecture Phase 8 reopened.
- [x] Dedicated implementation plan written.

### Runtime

- [x] Failing three-party arm baseline captured.
- [x] Independent red arm contract tests added.
- [x] Canonical bilateral registry established.
- [ ] Role mapping separated from coordinate reflection. Primary VRM preparation path is split; remaining consumers are open.
- [x] Instructor identity corrected for the rendered whole-body proof matrix.
- [x] Player-avatar opposite mapping proved for the rendered whole-body proof matrix.
- [ ] Axial sign rules corrected and proved. Lateral axes pass; forward/back lean, squat/rise, vertical root, and uninterrupted neutral transitions remain open.
- [ ] Hands and face corrected and proved. Finger bones and asymmetric blinks pass; broader face-side coverage remains open.
- [ ] Scoring and diagnostics aligned.

### Acceptance

- [ ] Actual-renderer three-party tests pass. Arms, legs, planted-foot contact, head pitch/yaw/roll, side bend, twist, lateral root, finger curls, and asymmetric blinks pass; scoring and broader face-side coverage remain open.
- [ ] Current-fingerprint deterministic all-nine / 11,383-frame gate passes under the strengthened sustained-divergence checks. `Full Spinal Flow` passes; the all-nine run is incomplete.
- [ ] Current-fingerprint uninterrupted all-nine playback gate passes.
- [x] Worst-frame visual review passes for all flagged uninterrupted events.
- [ ] Manual whole-body mirror confirmation passes.
- [ ] Full Node 22.13.0 repository gate passes.
- [ ] Architecture board and support truth updated from fresh evidence.

## Decision Log

### 2026-07-10

- The mirror game is defined as instructor/avatar anatomical agreement plus opposite human imitation.
- Recorded instructor output is anatomical identity.
- Live player-avatar output is anatomical opposite.
- Scoring compares opposite human anatomy.
- Preview mirroring and coordinate reflection are not anatomical ownership.
- The old generic mapping claim is reopened.
- Actual rendered bones, not solver labels, are the acceptance surface.
- Completion requires both deterministic every-frame proof and uninterrupted playback across all nine recordings.
- Selected frames cannot override a failing full sequence.
- The first runtime slice split coordinate reflection from anatomical side swapping; rendered arm telemetry now proves both symmetric mirror directions.
- The second runtime slice used retarget contact ownership for recorded single-leg poses instead of anchoring both instructor feet. Before correction, the planted instructor foot was `0.3443` below the floor in either leg direction; after correction, instructor and player planted-foot clearance are both `0.0000`, with the intended raised foot remaining clear of the floor.
- The leg result is deterministic-pose evidence only. It does not close uninterrupted transition jerk or all-nine playback acceptance.
- Valid current face landmarks now override stale pose-only prepared head targets. Player lateral head axes are role-mirrored, while pitch remains unchanged.
- Player display decisions now carry explicit opposite anatomical mapping. Side bend and twist lateral signs reverse there; source and instructor decisions remain identity-mapped.
- Both head-yaw directions and both side-bend directions pass actual rendered telemetry.
- Player spine visual telemetry now compares against the post-ownership mapped direction; the observed side-bend error dropped from `0.3328` to `0.0944` without changing arm/leg comparison space.
- Twist angle deltas are normalized across the `-π/+π` seam. Both twist directions now produce symmetric `±0.5277` intent and matching actual chest/upper-chest yaw.
- Face roll now uses eye separation independent of reflected x ordering, so a level recorded head cannot become a false 180-degree roll. The already-mapped player roll is no longer reversed a second time.
- Actual head-node roll telemetry proves both three-party directions with matching instructor/player signs.
- Actual normalized finger-bone telemetry proves instructor-right/player-left -> both right-hand curl and the symmetric left-hand case.
- Actual VRM expression weights prove instructor-right/player-left -> both `blinkRight=0.92` and the symmetric `blinkLeft=0.92` case.
- The first current-fingerprint all-nine uninterrupted run captured 11,381/11,383 frames and blocked all nine recordings. Two recordings each missed one frame; aggregate diagnostics found 482 jerk events, 359 owner transitions, and widespread arm/leg side-continuity failures.
- `px75fgt11wbg0jvr17j6fc2dvd89trpm` remains a high-priority failure: 294 suppressed-leg frames, 1,113 side-bend under-response frames, and 99 jerk events. Selected clean captures do not override this result.
- The first full-recording lower-body repair keeps complete source retargeting active during squat/hold labels. On the `px75...` rerun, suppressed-leg frames improved from 294 to 0, while jerk remained 95, side-bend under-response remained 1,113, one capture index was missing, and foot clearance still plunged to about `-0.38`. Leg ownership and floor continuity are therefore separate blockers.
- The follow-up floor-continuity repair re-measures feet after hips application, separates vertical floor correction from lateral smoothing, prevents vertical squat travel from resetting anchors, and drives planted squat translation from continuous source hip drop. The complete `px75...` rerun captured 3,026/3,026 frames with 0 missing, 0 suppressed-leg frames, 91 jerk frames, and 75 owner transitions. The original frame-1534 floor plunge is removed, but strict whole-recording acceptance remains blocked and the all-nine recapture remains open.
- The historical side-bend blocker was a proof-surface bug: the full-sequence analyzer measured the non-rotating hips-to-spine offset instead of actual rendered chest/upper-chest Z rotations. Corrected analysis reports 1.000 correlation and 1.55 response across all 1,113 qualifying `px75...` frames. Existing all-nine telemetry shows the same result wherever side-bend samples exist; none of the nine recordings now fails side-bend response. This removes a false blocker without changing avatar motion. `px75...` remains blocked by 91 jerk frames.
- Parent-before-child application order and complete-retarget ownership now remove the known synchronized arm and leg snaps without threshold tuning. The complete `px75...` artifact records 3,026/3,026 frames, 0 missing, 0 suppressed-leg frames, and 59 jerk frames, down from the retained 78-event support-owner baseline. Floor precision and the remaining 59 temporal events stay open; all-nine acceptance has not yet been rerun.
- Multi-foot floor contacts now keep the lowest planted foot on the floor instead of averaging one foot above and one below it. The complete `px75...` run improves from 59 to 53 jerk events, foot-clearance events from 44 to 33, and squat minimum clearance from roughly `-0.16` to `-0.09`. Leg-direction events rise from 13 to 18, so lower-body transition continuity and all-nine acceptance remain blocked.
- Complete player leg retarget now remains the owner through quiet neutral-labelled frames. The complete `px75...` run improves from 53 to 34 jerk events, owner transitions from 75 to 59, and leg-direction jerk from 18 to 3 while preserving 0 suppressed-leg frames and the `-0.09 / -0.02` squat floor minimum. The remaining 34 events and all-nine acceptance keep the release blocked.
- Source-relative mirrored ankle-height proof removes genuine raised-foot travel from the foot-clearance jerk count while retaining stable-source floor snaps. `px75...` reports 16 genuine review events and passes the automated sub-1% session threshold, but manual review remains open. The fresh all-nine run captures 11,383/11,383 frames with 0 missing, 162 jerk review events, 256 owner transitions, and 1 suppressed-leg frame: 2 recordings pass and 7 remain blocked, including 20 thigh and 92 upper-arm mirror mismatches.
- The deterministic transition harness supplies a world-space neutral baseline and samples the short rolling window. Both avatars now prove matching `±0.58` lateral root targets, and root telemetry is preserved through the later head-debug write.

### 2026-07-11

- Replay Lab now exposes a debug-only deterministic frame-step bridge. A frame is accepted only after the selected index reaches the page, replay refs commit that index, and the avatar emits a later rendered telemetry update. Normal manual scrubbing retains its reset behaviour; deterministic proof deliberately preserves one runtime so smoothing and limb reacquisition are not destroyed between frames.
- The player-avatar deterministic set under `tmp/movement-replay-lab/full-sequence-current/deterministic-proof/` passes **9/9 recordings**, **11,383/11,383 rendered frames**, **zero missing frames**, and **zero acceptance failures**. It reports 33 rapid-change diagnostics without treating debug step cadence as intended playback timing.
- Temporal jerk is a blocking criterion only for uninterrupted intended-timing playback. Deterministic stepping continues to report the same diagnostics, while missing frames, mirror-side mismatch, head/spine under-response, suppressed legs, and sparse substitution remain hard failures. Focused analyzer tests prove that separation.
- This closes deterministic player-avatar frame accounting, not the full Phase 9 three-party oracle. Deterministic instructor identity rendering, independently constructed opposite player imitation through the real live path, and actual instructor/player bone comparison remain explicit open work.
- The independent three-party harness now renders the original recording as instructor identity and constructs a physical opposite-player imitation without importing the production mirror table. A frame is retained only when both actual VRMs emit fresh telemetry. The corrected Walking pilot captures **541/541 frames**, **zero missing**, and **zero missing roles**, but is correctly **blocked**: all ten tracked limb/foot destinations exceed their visual agreement thresholds and axial p95 difference is `0.1216` against `0.12`.
- Walking telemetry identifies a real role-path split rather than a capture problem. At frame 100 the instructor owns `lower recorded-neutral; feet neutral` with `0/6` lower segments applied, while the player owns `lower player-retarget; feet recorded-retarget` with `6/6` lower segments applied. Arms and head/spine also use distinct recorded/player policies. No all-nine three-party pass may run until this first-recording failure is corrected and recaptured.
- The Walking role-path split is repaired in the shared runtime rather than hidden by thresholds. Complete instructor leg retarget remains active, complete instructor feet retain solved directions, player limb lateral mapping is explicit, and already-owned head yaw is not reversed twice.
- The final arm blocker was transform order. The player camera-frame reflection was applied before camera-tilt correction, but reflection and 3D rotation do not commute. Applying the player world reflection after its reflected camera tilt is cancelled drops all four arm p95 differences from roughly `0.27..0.31` to `0.012..0.013` without changing the `0.12` thresholds.
- The controlling Walking artifact is `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/walking.corrected-arm-transform-order.analysis.json`: **passed**, **541/541 frames**, **zero missing**, **zero missing roles**, **zero failures**. Lower-body p95 differences are `0.0113..0.0144`; axial p95 is `0.1148` against `0.12`. Phase 9 independent three-party acceptance is now **1/9**.
- Spins is the second complete independent run. `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/spins.analysis.json` captures **648/648 frames**, **zero missing**, and **zero missing roles**. Every tracked arm, leg, shin, and foot segment passes, but axial p95 is `0.2050` against `0.12`, so Spins remains blocked and acceptance stays **1/9**.
- Spins proves that remaining axial drift is not source ownership: instructor and player raw head angles and twist are identical after mapping. The recorded instructor head/spine solver and calibrated live-player head/spine solver then apply different neutral offsets, deadzones, caps, and presentation gains. Two calibration-selection experiments were fully recaptured and rejected because they worsened axial p95 to `0.5549` and `0.2458`; neither remains in runtime code. The next repair must unify axial intent/application semantics rather than tune the three-party threshold or select convenient calibration frames.
- The shared axial source model now drives recorded and player full-body spine paths. Spins passes all 648 frames with axial p95 `0.0006`, and Walking remains green on the same runtime. Turning Around in Circles passes all 632 frames after removing an instructor-only flat-foot overwrite from active retargeting. Head Roll passes all 554 rendered frames under the strict analyser, and Star Jumps passes all 708.
- The three-party analyser now scores every rendered segment frame rather than discarding low-confidence source frames. It reports confident and missing sample counts separately, and any missing rendered segment is a hard failure. This prevents a six-frame or high-confidence-only sample from representing a whole recording.
- Full Spinal Flow has been recaptured repeatedly across all **1,290/1,290** frames with zero missing. Shared axial intent, role-neutral support classification, and removal of the complete-leg canned squat overwrite bring head/spine, both arms, both thighs, and both shins under threshold. The retained artifact is `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/full-spinal-flow.role-neutral-squat-fallback.analysis.json`: only left foot (`0.2579` vs `0.20`) and right foot (`0.2585` vs `0.20`) remain blocked.
- The retained foot fallback uses the same source squat evidence for instructor and player when a complete leg solve is unavailable. It removes the catastrophic low-confidence foot flip: the worst left-foot difference falls from about `1.48` to `0.68`, while all leg segments remain passing. An experiment that forced partial source-leg ownership reduced foot p95 only slightly but regressed both thighs to about `0.164`; it was fully reverted and is not part of the runtime.
- A narrower experiment planted only missing instructor feet during strong recorded squat fallback. A complete 1,290-frame recapture was statistically unchanged (`0.2579 / 0.2586` foot p95), so that extra rule and its tests were reverted. The remaining defect is therefore not a simple local flat-foot omission; it is a persistent world-space foot-direction difference produced by the two partial-chain fallback paths.
- Aligning instructor/player squat-fallback interpolation speed was also rejected. It worsened foot p95 to about `0.345` and regressed both thighs to about `0.24`, proving that the remaining issue is not merely temporal easing. The role-specific speed was restored.
- Body Capture 3D passes the strict independent three-party gate across **1,815/1,815** rendered frames with zero missing frames, zero missing roles, and zero failures. The controlling artifact is `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/body-capture-3d.current.analysis.json`; axial p95 is `0.0002`, and every limb/foot p95 is between `0.0127` and `0.0143`, including the turning and occlusion sequence.
- Full Body passes the strict independent three-party gate across **2,169/2,169** rendered frames with zero missing frames, zero missing roles, and zero failures. The controlling artifact is `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/full-body.current.analysis.json`; axial p95 is `0.0003`, and every limb/foot p95 is between `0.0126` and `0.0141`.
- Full Motion Exercises passes the strict independent three-party gate across **3,026/3,026** rendered frames with zero missing frames, zero missing roles, and zero failures. The controlling artifact is `tmp/movement-replay-lab/full-sequence-current/three-party-deterministic/full-motion-exercises.current.analysis.json`; axial p95 is `0.0003`, and every limb/foot p95 is between `0.0127` and `0.0142`. This completes the first independent all-nine frame accounting set: **11,383/11,383**, zero missing, **8 passed / 1 blocked**.
- After rejecting and reverting the final Full Spinal Flow experiments, the five earlier passes were recaptured rather than inherited. `walking.retained-runtime`, `spins.retained-runtime`, `turning-around-in-circles.retained-runtime`, `head-roll.retained-runtime`, and `star-jumps.retained-runtime` all pass with zero missing frames and zero failures. Their axial p95 values are `0.0002..0.0006` and maximum limb/foot p95 values are `0.0136..0.0160`. Together with the current Body Capture 3D, Full Body, Full Motion Exercises, and retained Full Spinal Flow artifacts, this establishes a genuine same-runtime **11,383/11,383**, zero-missing, **8/9** result.
- The remaining Full Spinal Flow failure was an application-order defect. A partial-chain squat fallback rotated thigh/shin parents after the instructor foot target was applied, while the player squat path performed no final foot refinement. Foot targets now refine after parent fallback application for both roles. When foot confidence falls during occlusion, the same world-direction refinement remains active from confidence `0.03` with a minimum blend of `0.02`, preventing a role-specific parent-chain offset without making noisy feet respond quickly.
- `full-spinal-flow.occlusion-foot-refine.analysis.json` passes **1,290/1,290** frames with zero missing and zero failures. Left-foot p95 improves from `0.2579` to `0.1590`; right-foot p95 improves from `0.2585` to `0.1778`, both below the unchanged `0.20` threshold. Thighs, shins, arms, and axial motion remain passing.
- Because the foot application path is shared, the other eight recordings were recaptured sequentially rather than inheriting prior results. The `*.final-foot-runtime.analysis.json` artifacts plus Full Spinal Flow establish the final same-runtime set: **9/9 recordings**, **11,383/11,383 rendered frames**, **zero missing**, and **zero failures**. Maximum per-recording segment p95 is `0.1778` and maximum axial p95 is `0.0891`, both from Full Spinal Flow and both within their unchanged thresholds.

### 2026-07-13

- The strengthened analyzers now fail three or more consecutive above-threshold rendered segment or axial frames and use actual post-application head world rotations. This reopens the historical session-p95 9/9 result instead of diluting short visible adherence failures.
- The shared lower-body repair preserves applicable bilateral thigh targets ahead of player squat labels, prevents planted-squat and canned-flexion overwrites when those thigh targets exist, and gives explicit recorded-neutral and inactive-neutral paths the same exact planted-foot target.
- The current `Full Spinal Flow` artifact under `tmp/movement-replay-lab/cycle-break-full-spinal-inactive-neutral-parity-2026-07-13/` passes **1,290/1,290** player-avatar frames and **1,290/1,290** independent three-party frames with zero missing and zero failures. This is a recording-level repair proof, not an all-nine claim.
- A fresh all-nine run was started as the final shared-pipeline regression gate and stopped at the user's request during `Spins`. It is incomplete and must not be reported as current acceptance.
