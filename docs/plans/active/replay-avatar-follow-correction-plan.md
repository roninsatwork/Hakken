# Replay Avatar-Follow Correction Plan

Last reviewed: 2026-07-09
Status: active engineering plan, not yet started.
Scope: fix the root causes that make the replay/posture studio avatar hard to keep following recorded movement, then reduce the movement engine's structural overhead so future tuning is cheap.

## Why this plan exists

A code review on 2026-07-09 (branch `dev`) found that the avatar-follow behaviour "almost works but takes a lot of manual effort" for a specific, fixable set of reasons. The core retargeting mathematics is sound — the rest-pose-compensated rotation retargeting in `movementAvatarRestPose.ts` and `movementAvatarRestMappedSegmentApplication.ts` is the correct design. The effort cost comes from what surrounds it:

1. **The limb retargeting consumes 2D screen landmarks instead of the 3D world landmarks we already capture.** MediaPipe world landmarks (metric, camera-independent) are captured and OneEuro-filtered on every frame, but `resolveMovementMotionFrame` passes the normalized image-space pose into `solveMovementRetargetFrame` (`movementMotionFrame.ts:233`, `movementRetargeting.ts:127`). Image-space z is not real depth, so the codebase compensates with hand-tuned hacks: `zScale`, `safeZScale` (0.24/0.32 by squat state, `movementAvatarArmTargetDecision.ts:221`), the whole `frontBias` in-front-of-torso heuristic (`movementAvatarArmTargetDecision.ts:64-118`), a magic `*3.0` hip-relative scale and hardcoded 640x480 solver image size (`vrmRigging.ts:374, 426`). World landmarks are only used for root motion and match scoring today.
2. **Three retargeting systems arbitrate per body part every frame.** A Kalidokit Euler solver (`vrmRigging.ts:419`), an aim-vector solver (`movementAvatarAimApplication.ts`), and the rest-mapped segment solver coexist, selected by per-frame owner flags (`shouldUseRetargetedUpperBody`, `retargetOwnsLowerBody`, `feetOwner`, `torsoOwner`, `shouldUseLegacyLowerBody` in `movementAvatarPipelineTypes.ts`). Tuning one path shifts the handoff behaviour of the others — this is the manual-effort treadmill.
3. **Calibration is hand-authored constants, not derived from the rig.** Over 100 magic numbers govern follow behaviour: a ~30-knob default profile (`movementTrackingCalibration.ts:248-277`) plus ~18 hand-set values per avatar file (`movementAvatarProfiles.ts`). Adding a new VRM currently requires hand-tuning a new profile block.
4. **(Corrected 2026-07-09 after code inspection.)** The replay lab drives recordings through the `player` role while the play screen's instructor uses the recorded/instructor path. Initial review read this as accidental divergence; it is intentional — the lab is a deterministic test rig for the **player** pipeline (recorded data standing in for live camera input), and the replay/game parity harnesses in `movementReplayAnalyzer.ts` exist to prove the two paths agree. The real cost of the split is that the pipeline has role-dependent branches at all; Phase 2 reduces those branches rather than flipping the lab's role.
5. **Structural overhead slows every change.** `_lib/` holds 333 files / ~62k lines in one flat directory; ~155 files begin `movementAvatar`, including ~24 sub-60-line `*Runtime` shims re-stitched by an `Orchestration` layer. The 2,042-line `movementRecordedProofManifest.ts` is imported by exactly one test. The replay-lab page is ~3,500 lines, roughly 70% QA dashboard.

## Relationship to existing plans

- Complements [Replay Studio Avatar-Follow Observability Plan](./replay-studio-avatar-follow-observability-plan.md) and [Replay Lab Visual Acceptance Tightening Plan](./replay-lab-visual-acceptance-tightening-plan.md): those improve how we *see and gate* follow quality; this plan changes *why* follow quality is low.
- Overlaps [Movement Studio Best-Practice Architecture Plan](./movement-studio-best-practice-architecture-plan.md) and [Movement Demo Refactor Plan](./movement-demo-refactor-plan.md) on structure. Where they conflict, this plan's position is: solver consolidation and data-source correction come **before** further architecture guarding, and readiness tracking should move out of the shipped TypeScript bundle.

## Success criteria

- A recorded movement replays on the avatar with visibly correct depth (arms forward, squats, turns) with **no per-recording manual tuning**.
- A brand-new VRM avatar follows acceptably with **no hand-authored profile block**.
- One retargeting solver owns each body region statically; no per-frame solver arbitration.
- Role-dependent pipeline branches (player vs instructor) are reduced to input differences, not different solvers.
- Follow error is a number, tracked per golden recording, and it goes down (or holds) with every phase.

---

## Phase 0 — Make "follows the video" measurable — DONE 2026-07-09

Goal: convert follow quality from eyeball judgement to a regression number before changing any behaviour.

Findings from execution: the measurement infrastructure already existed and was reused instead of built.

- The metric: `buildMovementAvatarVisualTelemetry` (`movementAvatarVisualTelemetry.ts`) computes per-segment error `1 - dot(avatarBoneWorldDir, sourceDesiredDir)` against the live VRM, aggregated as `avatarUpperError` / `avatarLowerError` plus per-segment values in each capture's `diagnostics`.
- The loop: `npm run movement:replay:iteration` (headless decision-level analysis over the Convex recording export) + `npm run movement:replay:proof-set -- --local-test-auth` (in-browser captures with VRM telemetry; requires the dev app running with `LOCAL_TEST_AUTH_ENABLED=1`) + `npm run movement:replay:analyze -- --visual-captures <dir>` (folds captures into the analysis).
- Golden set: the 5 saved recordings in the current Convex export (`px7fmzw2…`, `px71h2bs…`, `px74tzfb…`, `px7ebpmf…`, `px72q2e5…`), all standing/upper-body family. A squat-heavy and a leg-raise recording should be added to the golden set when available.

Baseline (2026-07-09, player path, `VIPE_Hero__1793.vrm`, capture-backed; also saved to `tmp/movement-replay-lab/phase0-baseline-follow-error.json`):

| Recording | Frames | Upper avg | Lower avg | Spine avg | Arm avg | Foot avg | Visual match |
|---|---|---|---|---|---|---|---|
| px7fmzw2…89x7e3 | 10 | 0.054 | 0.081 | 0.259 | 0.005 | 0.324 | 0.779 |
| px71h2bs…89wbx3 | 17 | 0.033 | 0.079 | 0.143 | 0.054 | 0.178 | 0.703 |
| px74tzfb…89xr2z | 12 | 0.028 | 0.037 | 0.114 | 0.123 | 0.073 | 0.852 |
| px7ebpmf…89xwj6 | 13 | 0.047 | 0.089 | 0.224 | 0.044 | 0.171 | 0.515 |
| px72q2e5…89wjt7 | 11 | 0.033 | 0.104 | 0.165 | 0.152 | 0.153 | 0.724 |

Reading: spine and feet are the worst-following regions — both are where image-space depth loss bites hardest (baseline diagnostics show source segment z-components near -0.8 rendered as avatar z near 0). 4 of 5 recordings sit below the 0.85 visual-match gate. This is the number Phase 1 must move.

Exit criteria met: baseline recorded above. Note: the originally planned "unify replay lab onto the recorded path" step was dropped — see corrected finding 4; the lab's player role is by design.

## Phase 1 — Feed the retargeting world landmarks (root-cause fix) — CORE DONE 2026-07-09

Goal: eliminate the screen-space depth problem at the source instead of compensating for it downstream.

What shipped:

1. `movementRetargeting.ts` is now space-aware: `MovementRetargetSourceModel` and `MovementRetargetFrame` carry `space: "image" | "world"`. When world landmarks (33, valid torso) are available, segment **directions** come from the metric world pose (confidence still from image visibility); scalar heuristics (hip drop, knee lift, contacts, floor) stay image-based deliberately.
2. World landmarks are threaded through the whole decision path: `MovementAvatarSource.worldPoseLandmarks` → pipeline decision → lower-body decision → `solveMovementRetargetFrame`. Producers updated: live calibration hook, instructor playback model builder (world mirrored `x → -x`, image mirrored `x → 1-x`), avatar frame-setup runtime, game-path simulation, analyzer parity harness, replay-lab parity panel.
3. The half-finished `hasWorldLandmarks` migration was completed and corrected: previously the mere *presence* of world landmarks set `zScale: 1` while segment directions were still image-space — i.e. junk image depth applied at full scale. Now `zScale` derives from the frame's actual segment space (`getMovementRetargetSegmentZScale`), and the flag was removed from the segment-application chain. The aim-vector arm path keeps its old behaviour until Phase 2 retires it.
4. Cross-space safety: motion-depth comparison between calibration and frame segments returns 0 when spaces differ (prevents phantom motion when a recording lacks world landmarks); image-space fallback is data-availability only, not runtime arbitration.
5. Regression tests added in `movementRetargeting.test.ts` (world-space depth solving, image fallback, cross-space guard). Full movements suite: 1006 tests green.

Measured result (capture-backed, real VRM vs source direction, same golden recordings — lower is better):

| Region | Baseline avg (5 recordings) | Phase 1 avg | Note |
|---|---|---|---|
| Spine | 0.114–0.259 | 0.049–0.153 | roughly halved everywhere |
| Upper body | 0.028–0.054 | 0.012–0.032 | better on all 5 |
| Lower body | 0.037–0.104 | 0.047–0.094 | better on 4/5 |
| Arms | 0.005–0.152 | 0.010–0.195 | slightly worse on 4/5 — arms are still driven by the image-space aim path; the telemetry target is now the *true* direction, so this exposes the aim path's real error. Phase 2 fixes it. |
| Feet | 0.073–0.324 | 0.073–0.306 | mixed — worst case much better; foot ownership/rest-pose cases are Phase 2 territory |

Also verified visually on capture frames: neutral poses unchanged; motion frames (e.g. lower-body-out-of-frame lean) show the avatar noticeably less twisted than baseline.

Known follow-ups moved to later phases:

- Diagnostic finding: image-space z is not merely noisy, it *dominates* segment directions (a standing shin read `z ≈ 0.8–0.98`, i.e. "pointing at the camera"). Every slerp/damping constant tuned before this change was compensating for that.
- The headless analyzer's `visualMotionCoverage` heuristic (`(angle − 0.12) / 0.75`) was calibrated against those exaggerated image-space angles and now under-reports motion (headless visualMatchScore reads lower despite the avatar following better). Recalibrate it when the avatar-follow gate is next tightened; the capture-backed direction errors are the authoritative metric until then.
- `zScale`/`safeZScale`/`frontBias`/`*3.0`/640x480 deletions belong to Phase 2 since they live in the aim/Kalidokit paths being retired there.

Exit criteria status: limb *segment* directions no longer use image z when world data exists ✅; follow-error improved on segment-driven regions ✅; aim-path constants deferred to Phase 2 by design.

## Phase 2 — One solver, one clock

Goal: remove the per-frame arbitration between competing solvers and the duplicate solve inside the render loop.

1. Extend the rest-mapped solver (`movementAvatarRestPose.ts` + `movementAvatarRestMappedSegmentApplication.ts`) to own the full body: arms, spine, and head, fed by world-landmark segment directions. It already implements the correct math (rest-direction → desired-direction world rotation, converted to local via parent).
2. Retire the Kalidokit pose path (`solveVrmPose` and the re-solve inside `VrmAvatar`'s `useFrame`) and the aim-vector limb path (`movementAvatarAimApplication.ts`, `movementAvatarArmApplication.ts`). Keep Kalidokit hand solving if finger tracking is retained. Keep planted-foot IK — that is the one place IK belongs.
3. Delete the owner-arbitration flags and their decision plumbing: `shouldUseRetargetedUpperBody`, `retargetOwnsLowerBody`, `shouldUseLegacyLowerBody`, `feetOwner`, `lowerBodyOwner`, `torsoOwner`, and `movementAvatarLegacyDecision.ts` once nothing consumes it.
4. One clock: the page (or playback hook) resolves one motion frame per recorded frame; `VrmAvatar`'s `useFrame` only applies the latest resolved frame with interpolation. No solving inside the render loop.
5. One smoothing story: OneEuro on landmarks at ingest plus a single per-bone application slerp. Remove the stacked mode-specific slerp variants (`armRelaxedSlerp`, `demoFallbackSlerp`, `squatFlexionSlerp`, `singleLegRaiseSlerp`, `solvedLowerBodySlerp`, fallback slerp tiers) in favour of one table.
6. Re-score golden recordings after each retirement; no regression beyond an agreed tolerance.

Exit criteria: exactly one solver produces limb/spine/head rotations; `VrmAvatar` contains no solver calls; owner flags gone; scores at or better than Phase 1.

## Phase 3 — Derive calibration from the rig

Goal: a new VRM follows well with zero hand-authored constants.

1. At VRM load, read bone lengths, hip height, arm span, and rest orientations from the `@pixiv/three-vrm` humanoid (the rest-map builder already reads the bind pose — extend it) and derive scale, floor-correction, and hip-drop parameters from those measurements.
2. Shrink `movementAvatarProfiles.ts` to genuinely aesthetic overrides only; target zero required entries per avatar. Success test: drop in a VRM that has never been profiled and confirm acceptable follow on the golden recordings.
3. Collapse the ~30-knob default tracking profile to the constants that survived Phases 1-2, each with a comment stating the constraint it encodes.

Exit criteria: unprofiled-VRM test passes; per-avatar profile blocks removed or empty; remaining constants enumerated and justified.

## Phase 4 — Structural cleanup

Goal: reduce navigation and maintenance cost. Deliberately last so we do not refactor code Phases 1-2 delete.

1. Fold the surviving `movementAvatar*` files into ~6-8 modules along real seams: ingest/normalize, solve, apply, ik, root-motion, types. Remove the sub-60-line `*Runtime` forwarding shims and the `*Orchestration` layers that exist only to re-stitch them.
2. Move proof/readiness tracking out of the runtime bundle: `movementRecordedProofManifest.ts`, `movementCoverageRegistry.ts`, `movementProofRehearsalEvidence.ts`, `movementNextProofRehearsal*`, `movementExpansionPreviewAudit.ts` and related evidence files become docs, JSON consumed by CI scripts, or are deleted where they no longer inform decisions. The shipped demo bundle should contain no project-management state.
3. Split `replay-lab/page.tsx` (~3,500 lines): the QA dashboard becomes its own component tree; the avatar wiring becomes a small, legible module.
4. Delete confirmed dead code: `_components/AvatarPreview.tsx` (unused by the replay pipeline), legacy decision wrappers, and the `legacy-*` `MovementDataFormat` variants if no stored recordings use them.
5. Update the architecture guard line-count/purity checks to describe the new module layout instead of the wrapper topology.

Exit criteria: `_lib` file count and line count substantially reduced (expectation: well under half of the current ~62k lines including tests); guards green; golden-recording scores unchanged.

---

## Sequencing, risk, and effort

- Phases 0-1 are the high-confidence core and should deliver most of the "effort to follow" fix on their own. Do them first and in order.
- Phase 2 is the largest behavioural change and the riskiest; it must not start before the Phase 0 metric exists. Retire one solver path at a time, re-scoring between steps.
- Phase 3 is what makes new avatars cheap; it depends on Phase 2 having removed the constants that only existed to balance solver handoffs.
- Phase 4 is pure structure; it can trail or interleave with Phase 3 but must not precede Phase 2.
- All work on a branch, with the golden-recording follow-error score reported in each PR description.
