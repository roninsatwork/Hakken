# Replay Avatar-Follow Correction Plan

Last reviewed: 2026-07-10
Status: Phases 0-2 implemented; Phase 3 and acceptance gap closure in progress; Phase 4 structural slice complete with original broad-consolidation target superseded. See the Handoff runbook section before changing avatar code.
Scope: fix the root causes that make the replay/posture studio avatar hard to keep following recorded movement, then reduce the movement engine's structural overhead so future tuning is cheap.

## Why this plan exists

A code review on 2026-07-09 (branch `dev`) found that the avatar-follow behaviour "almost works but takes a lot of manual effort" for a specific, fixable set of reasons. The core retargeting mathematics is sound — the rest-pose-compensated rotation retargeting in `movementAvatarRestPose.ts` and `movementAvatarRestMappedSegmentApplication.ts` is the correct design. The effort cost comes from what surrounds it:

1. **The limb retargeting consumes 2D screen landmarks instead of the 3D world landmarks we already capture.** MediaPipe world landmarks (metric, camera-independent) are captured and OneEuro-filtered on every frame, but `resolveMovementMotionFrame` passes the normalized image-space pose into `solveMovementRetargetFrame` (`movementMotionFrame.ts:233`, `movementRetargeting.ts:127`). Image-space z is not real depth, so the codebase compensates with hand-tuned hacks: `zScale`, `safeZScale` (0.24/0.32 by squat state, `movementAvatarArmTargetDecision.ts:221`), the whole `frontBias` in-front-of-torso heuristic (`movementAvatarArmTargetDecision.ts:64-118`), a magic `*3.0` hip-relative scale and hardcoded 640x480 solver image size (`vrmRigging.ts:374, 426`). World landmarks are only used for root motion and match scoring today.
2. **At baseline, three retargeting systems arbitrated per body part every frame.** A Kalidokit Euler solver, an aim-vector solver, and the rest-mapped segment solver coexisted behind per-frame owner flags. Phases 1–2 removed the competing body solvers; the remaining owner strings are telemetry/presentation labels rather than solver selectors.
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
- A supported recording cannot be accepted while its Replay Studio judge is `review` or `blocked`, while required rendered proof is stale/missing, or while capture-backed region error exceeds the acceptance thresholds.

---

## Acceptance gap closure — IN PROGRESS 2026-07-10

Why this reopened: the nine-recording avatar-follow gate could report success while supported recordings remained `accepted-candidate`, had Replay Studio status `review`, or sat below the nominal 0.85 visual-match target. That is weaker than the product success criterion above and explains how visibly wrong output could coexist with a green command.

Work order:

1. **Gate truth first — done for the recorded gate.** An unresolved supported Replay `review` session is `review-only` and blocks acceptance; `blocked` remains blocked. The old path where a review session with no persisted worst frame became `accepted-candidate` is gone. A review caused only by the unframed headless `visual_match_low` warning becomes effective `pass` only when current-fingerprint rendered captures exist and every capture-backed region threshold is clean; the gate reports both the source analysis status and this rendered-proof resolution.
2. **Tighten rendered error — done for the recorded gate.** Use 0.22 as the general capture-backed lower-body ceiling, retaining 0.12 for active-leg proof, 0.18 for upper body/mirror-side proof, and 0.08 for planted-foot clearance. The headless visual-match heuristic remains diagnostic until it is recalibrated or backed by rendered telemetry; it does not override stronger capture-backed evidence.
3. **Require fresh proof — done for the recorded gate.** Each capture manifest carries a deterministic SHA-256 fingerprint over the production motion pipeline and the Replay rendered-judge path; the analyzer propagates capture fingerprints into the proof manifest; the gate rejects missing, mixed, or stale fingerprints. The final current-fingerprint bundle contains 52 rendered frames across the six recordings with supported rows, and the canonical `movement:replay-studio-verdict-gate` passes against it.
4. **Fix instructor feet from recorded data — code and refreshed recorded proof complete.** Every confident instructor foot segment now reaches the shared world-space retargeter. The three old motion/contact/knee-lift vetoes are deleted; planted-foot flattening and floor/foot-lock remain the post-retarget contact authority. Side-bend investigation also found that both spine drives put 60% side-bend roll into the hips, vertically splitting otherwise straight legs. Hips now stay level for side bend while spine/chest/upper-chest carry the bend. On the exact user-reported Full Motion Exercises frame 2743, planted-foot clearances improved from `+0.2851/-0.2916` to exactly `0/0`, lower error improved from `0.0412` to `0.0285`, and the current-frame failure list cleared. Frames 2781/2782 also hold both feet at `0` in the current focused capture. No exercise label drives these decisions.
5. **Finish lower-body ownership cleanup — code complete.** `retargetOwnsLowerBody` is deleted. `hasCompleteLegRetarget` reports the concrete applied-segment/source-quality capability, while lower-body and feet owner strings remain separate presentation/debug decisions. No second body solver is selected.
6. **Close cross-avatar and live proof — cross-avatar and instructor proof done, live webcam check remains.** The final 52-frame supported-recording set was recaptured with current-fingerprint VIPE, unprofiled MoonGirl, and unprofiled Eugenia. All three separately pass `movement:avatar-follow-gate`; no avatar-specific profile block was added. Capture-backed lower/upper errors for the five supported recordings are:

   | Avatar | px736…q8jv | px75…trpm | px7b…f1qs | px7f…n6m0 | px7fm…x7e3 |
   |---|---:|---:|---:|---:|---:|
   | VIPE | .086/.016 | .014/.003 | .005/.010 | .015/.014 | .068/.068 |
   | MoonGirl | .105/.017 | .018/.004 | .007/.015 | .023/.011 | .102/.051 |
   | Eugenia | .106/.016 | .008/.003 | .006/.010 | .011/.014 | .104/.069 |

   MoonGirl has no toe bones, so foot-direction telemetry is unavailable rather than zero. On the reported side-bend frames 2743/2781/2782, planted-foot clearance is `0.0001` for MoonGirl and `0.0002` for Eugenia, with no failures. The real play-screen instructor path was checked at Full Motion Exercises frames 420/632: both left/right leg-raise cases report `recorded-retarget+planted-flat`, `6/6` lower bones, the opposite planted foot, and foot lock `1.00`. A live check was attempted on 2026-07-10, but the available browser reported `Camera permission is blocked`, `Camera ?x?`, `Video ?x?`, and the player pipeline remained `0% / waiting`; this was recorded as an environment block, not a pass. The remaining work is the same short check in a camera-enabled browser with a person in frame.
7. **Make scrubbing, slow turns, and Replay head ownership deterministic — code and refreshed recorded proof complete.** Exact paused-frame changes now reset the normalized VRM pose and all temporal runtime refs, preventing hips/feet from leaking out of an earlier captured pose. The root target now also recognizes a confident cumulative heading of at least `0.9 rad`; previously a slow 180-degree turn was never applied because turn intent required a single-frame jump of `0.35 rad`. Focused `p986` captures apply source/avatar root yaw `0.9006/0.8926`, `1.5991/1.5911`, and `2.9819/2.9815`. The side-bend regression check remains front-facing at source headings through `-0.6105`, so recorded bend drift is not misclassified as a turn. Replay now passes the shared motion frame's prepared recorded-head target into `VrmAvatar` instead of recomputing a live-player target; at `p986` frames 866/907 applied head yaw changed from `0.058` to `0.754` and the current failure list cleared.

Current recorded acceptance result: `movement:replay-studio-verdict-gate` passes all nine checked recordings. All five recordings with supported proof rows are `accepted`; their capture-backed lower/upper errors are `0.086/0.016`, `0.014/0.003`, `0.005/0.010`, `0.015/0.014`, and `0.068/0.068`. The other four remain explicitly `not-supported` and are not being claimed as corrected. The only remaining acceptance gap is the short live webcam check in step 6.

Exit criteria: all supported recordings are accepted rather than candidate/review; capture proof is current; general lower error <= 0.22, active-leg error <= 0.12, upper/mirror error <= 0.18, planted-foot clearance <= 0.08; Replay/Game parity remains zero-divergence; unprofiled avatars remain comparable; instructor-foot and live checks are recorded.

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

## Phase 2 — One solver, one clock — COMPLETE 2026-07-09

Goal: remove the per-frame arbitration between competing solvers and the duplicate solve inside the render loop.

Progress log:

- **2a (done, commit `76d9538`): arms are rest-mapped-solver-owned unconditionally.** The tracked-aim arm path no longer executes: `movementAvatarArmApplication.ts` now only knows `retargeted | hold-last-good | relax`. The body-wide `sourceQuality >= 0.45` gate no longer decides arm ownership (it was dominated by lower-body visibility). Application order preserved for the spine: segment retarget still applies after the angle-based spine drive (getting this wrong doubled spine error; caught by the golden re-score and fixed). Golden-recording follow errors: unchanged to slightly better across all 25 region cells vs Phase 1.
- Note: `armTargetComposition` (elbow/wrist targets, frontBias, safeZScale) is still *computed* because the debug fallback labels and analyzer read `armTargets` telemetry — the computation is now application-dead and goes in the 2c sweep along with the fallback-label rationalization.
- Remaining: 2b single clock (stop the Kalidokit pose re-solve in `VrmAvatar`'s `useFrame`; keep Kalidokit hands), 2c owner-flag and dead-plumbing sweep, 2d smoothing consolidation.

Measured input for 2b (headless decision sweep over the exported recordings, 692 sampled frames):

- The Kalidokit `riggedPose` has exactly three remaining consumers: the spine "solver torso" fallback (`sources: riggedPose.Hips/.Spine`), the solved-lower-body sources (`riggedPose` legs), and the `if (riggedPose)` ready gate in the frame orchestration.
- `recorded-solver` owns the torso on **~15% of frames** (102/692) — whenever the angle-based spine drive gates off. Removing the solve therefore needs a torso hold/segment-ownership answer for those frames, not just deletion. The spine *segment* retarget still applies on those frames (it runs unconditionally since 2a), so the gap is chest/upperChest/hips rotations only.
- The solved-lower-body owner never fires on the golden recordings (owners seen: `player-lower-body-neutral`, `player-retarget`, `retarget-legacy-fallback`, `player-stable-squat`, `neutral`) — its removal is low-risk for recorded replays.
- Suggested 2b order: (1) make `riggedPose` optional so solve failure is non-fatal and the ready gate keys on prepared landmarks; (2) replace solver-torso fallback with hold + spine-segment ownership, re-score; (3) drop solved-lower-body sources, re-score; (4) delete `solveVrmPose` call and the `*3.0`/640x480 solver-landmark scaffolding (`createVrmImageSolverLandmarks`), keep `solveVrmHand`.
- **2b steps 2–3 done (commit `b04fb9b`):** Kalidokit rotations no longer reach any bone. Solver-torso branch holds with empty sources (spine segment refines after); solved-lower-body plan mode holds with empty sources. Re-score: spine/arm/upper identical, lower unchanged, feet +0.01–0.02 on 3/5 goldens (loss of the Kalidokit hips rotation on spine-drive-off frames) — accepted; feet ownership is the 2c target.
- **2b step 4 done (commit `a23ea4c`): the per-frame Kalidokit pose solve is deleted.** `resolveMovementAvatarSolvedFrameRuntime` no longer solves; the `solve-failed`/`empty-pose` statuses and the `riggedPose` application gate in `VrmAvatar` are gone. Kalidokit remains only for hand solving (`solveVrmHand`). One retargeting solver now drives the whole body: the rest-mapped world-direction segment retarget, with angle-based spine/head drives and planted-foot IK as designed complements.
- **2c done (commits `97c8033`, `017200b`, `bbdd273`, `58179ea`, `d8ae957`):** the arm aim-target computation chain (frontBias heuristic, safeZScale, guided elbows, hand-wrist `*3.0`, `solveVrmPose` with its 640x480), the legacy lower-body aim path, and the `shouldUseRetargetedUpperBody` owner flag are all deleted. Debug fallback labels now report real arm application modes. Arms use one unified segment slerp (0.72/0.78). Golden captures unchanged at every step.
- **2d done (commit `b33b032`):** dead smoothing knobs removed (`handNeutralSlerp`, `solvedLowerBodySlerp`), the held-since-2b solved-lower-body application path fully deleted, and the orphaned aim-vector module removed. `resolveMovementAvatarBoneEaseOptions` is now the single bone-ease table.
- **Live-path regressions found by user testing and fixed (commits `6b96ade`, `079c15d`):** segment directions now solve without a calibration model (webcam framings cannot build one, which froze arms), and upper-body directions are tilt-corrected against the calibrated neutral spine (MediaPipe world axes follow the camera, which pitched the avatar's torso/head up). Both failure modes are now permanently probed by the analyzer (commit `bb0606d`: `uncalibrated_arms_would_freeze`, `spine_vertical_reference_missing`).
- **Deferred from 2c to Phase 3, implemented 2026-07-10; fresh proof pending:** feet were the weakest region (0.15–0.31 error on goldens), and three instructor foot vetoes meant feet rarely followed. Those vetoes are now deleted; recorded feet flow through the shared segment solve before contact handling.

Phase 2 exit status: **complete.** One solver (rest-mapped world-direction segments + angle-based spine/head drives + planted-foot IK), no per-frame solver arbitration, no Kalidokit pose solve (hands only), single bone-ease table. 132 test files / 977 tests green; golden capture scores held or improved through every step.

Audit correction resolved 2026-07-10: `retargetOwnsLowerBody` was replaced by the explicit `hasCompleteLegRetarget` capability fact. Squat/IK fallback planning consumes that capability without claiming that the retargeter owns an entire body region; owner strings are telemetry/presentation labels only.

- **2e residue sweep (done 2026-07-09):** an audit against this plan found leftovers that contradicted the exit criteria as written; all removed with golden captures at 0 cells worse per step. (1) The dead legacy aim type plumbing: `MovementAvatarAimOptionsDecision` (with `frontBias`/`zScale`), the `LegacyLowerBodyAim*` spec/request/target types, the computed-but-never-read `shouldApplyLegacyAim` plan flag, and the duplicate `aimTargets` record. (2) `movementAvatarLegacyDecision.ts`: the replay/studio compat wrappers are inlined at their three call sites (analyzer + replay-lab parity harness) as direct `resolveMovementAvatarPipelineDecision` calls. (3) `shouldUseLegacyLowerBody` (pure negation of `retargetOwnsLowerBody`) and the `legacy-*` owner labels (`retarget-partial-fallback` / `neutral-fallback` / `player-foot-fallback` now). (4) `createVrmImageSolverLandmarks` and its hip-centred `*3.0` scaling — prepared `solverLandmarks` are world-or-null now, and the debug-only target selections fall back to image landmarks; the never-read `kalidokitSolverLandmarks` copy went with it. Remaining owner strings (`lowerBodyOwner`/`feetOwner`/`torsoOwner` etc.) are telemetry labels, not solver arbitration; foot-ownership rationalization stays deferred to Phase 3 step 5.

1. Extend the rest-mapped solver (`movementAvatarRestPose.ts` + `movementAvatarRestMappedSegmentApplication.ts`) to own the full body: arms, spine, and head, fed by world-landmark segment directions. It already implements the correct math (rest-direction → desired-direction world rotation, converted to local via parent).
2. Retire the Kalidokit pose path (`solveVrmPose` and the re-solve inside `VrmAvatar`'s `useFrame`) and the aim-vector limb path (`movementAvatarAimApplication.ts`, `movementAvatarArmApplication.ts`). Keep Kalidokit hand solving if finger tracking is retained. Keep planted-foot IK — that is the one place IK belongs.
3. Delete solver-arbitration flags and their decision plumbing. Keep owner strings only where they describe the already-selected result for telemetry or presentation; they must not select a competing body solver.
4. One clock: the page (or playback hook) resolves one motion frame per recorded frame; `VrmAvatar`'s `useFrame` only applies the latest resolved frame with interpolation. No solving inside the render loop.
5. One smoothing story: OneEuro on landmarks at ingest plus a single per-bone application slerp. Remove the stacked mode-specific slerp variants (`armRelaxedSlerp`, `demoFallbackSlerp`, `squatFlexionSlerp`, `singleLegRaiseSlerp`, `solvedLowerBodySlerp`, fallback slerp tiers) in favour of one table.
6. Re-score golden recordings after each retirement; no regression beyond an agreed tolerance.

Exit criteria: exactly one solver produces limb/spine/head rotations; `VrmAvatar` contains no solver calls; owner flags gone; scores at or better than Phase 1.

## Handoff runbook — read this before changing any avatar code

The working discipline that kept Phases 0–2 safe. Follow it exactly; do not batch multiple behavioural changes between re-scores.

**Environment (one-time per machine):**

1. Node 22.13+ and `npm ci`; `npm run verify:env` must pass.
2. Start the dev app with test auth: use the `next-dev-test-auth` config in `.claude/launch.json` (it runs `LOCAL_TEST_AUTH_ENABLED=1 npm run dev`). Convex is a cloud dev deployment — you do not need `convex:dev` unless you change `convex/` functions.
3. The capture secret: `export LOCAL_TEST_AUTH_SECRET="$(npx convex env get LOCAL_TEST_AUTH_SECRET)"`.
4. The golden recordings live in the `movements` Convex table; the local export cache is `tmp/movement-replay-lab/export/` (first analyzer run creates it).

**The change loop (every behavioural change):**

```bash
# 1. Before touching code: capture the reference run
npm run movement:replay:analyze -- --limit 5 --out tmp/movement-replay-lab/ref.json --manifest-out tmp/movement-replay-lab/ref.proof-manifest.json
npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/ref.json --manifest tmp/movement-replay-lab/ref.proof-manifest.json --local-test-auth --out tmp/movement-replay-lab/captures-before

# 2. Make ONE focused change; npm run typecheck; npx vitest run "src/app/(dashboard)/demos/movements/"

# 3. Re-capture and compare (exits non-zero on regression; tolerance 0.01 per cell)
npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/ref.json --manifest tmp/movement-replay-lab/ref.proof-manifest.json --local-test-auth --out tmp/movement-replay-lab/captures-after
node scripts/movement-debug/aggregate-follow-errors.mjs tmp/movement-replay-lab/captures-before tmp/movement-replay-lab/captures-after

# 4. Zero regressions (or an explicitly justified trade recorded in this doc) -> commit. Otherwise fix or revert.
```

If a capture run fails with "no frames were available", it is usually a transient Convex load timeout — retry once before investigating.

**Traps that have already bitten once — do not rediscover them:**

- **Mirroring conventions differ by space.** Image landmarks mirror with `x -> 1 - x`; world landmarks (hip-centred metres) mirror with `x -> -x`. Mixing them corrupts directions silently.
- **Application order is load-bearing.** The spine *segment* retarget must apply **after** the angle-based spine drive (it refines; the drive must not overwrite it). Getting this backwards doubled spine error and was only caught by the re-score.
- **Foot scores have run-to-run capture variance** (~±0.02). A single worse foot cell in an otherwise clean run is noise; re-run before reacting.
- **The headless `visualMatchScore` under-reports** since world landmarks landed (its `visualMotionCoverage` heuristic was tuned for exaggerated image-z angles). The capture-backed per-region errors are the authoritative metric.
- **World landmarks are camera-axis-aligned, not gravity-aligned.** Any new "world direction applied to a bone" needs the tilt correction (`resolveMovementAvatarCameraTiltCorrection`, keyed off `retargetFrame.neutralSpineDirection`) or it bakes the webcam's pitch into the avatar.
- **The live player path has no calibration model in most webcam framings.** Segment directions must never require one (see commit `6b96ade`); the analyzer probes `uncalibrated_arms_would_freeze` / `spine_vertical_reference_missing` guard this.
- **Run vitest from the repo root** — running it from `_lib/` picks up the wrong config.
- Recorded replays cannot prove the live webcam path end-to-end; before client demos do a 2-minute live check in the play screen (arms follow, nod direction, torso lean).

## Phase 3 — Derive calibration from the rig

Goal: a new VRM follows well with zero required hand-authored geometric calibration. Documented cosmetic mesh trims may remain when the skeleton cannot observe the mesh feature they correct.

Progress log:

- **Step 1 done (2026-07-09):** `measureMovementAvatarRig` (`movementAvatarRestPose.ts`) walks the same normalized bind pose as the rest map and records hip height, averaged leg/arm chain lengths, and hips→head torso length. Exposed as `MovementAvatarRigMeasurements | null` on the new `rigMeasurementsRef` runtime ref, populated in `resetMovementAvatarRuntimeRefs` at VRM load. Returns null for rigs missing hips/head or both leg/arm chains.
- **Step 2, floorCorrection knobs done (2026-07-09):** `getCalibratedFloorCorrection` now derives scale = `hipHeight / (calibration.floorY − hipCenter.y)` and limit = `0.4 × hipHeight` when measurements exist; profile knobs are the fallback for unmeasured rigs and degenerate calibrations (`hipToFloor ≤ 0.2`). The measured VIPE hip height (0.875) makes the derived scale ≈1.59 vs the hand-tuned 1.6 — the knob was encoding exactly this ratio, so scores are unchanged. (An earlier note here claimed px7fmzw2 improved; that run was a capture anomaly following a transient failure — two later stability runs reproduce the baseline exactly. Correction: score-neutral, which is the expected and desired outcome.)
- **Step 2, squat drop done (2026-07-09):** `resolveMovementAvatarHipsPositionOptions` derives the recorded-presentation `squatHipDropScale`/`Limit` as `0.54 × legLength` / `0.59 × legLength` — the hand-authored 0.38/0.42 encode these ratios at the measured VIPE leg length of 0.708. The live player-squat 0.88/0.78 values are role tuning and stay. Note the current golden set cannot exercise squat drop (all five recordings are standing); guarded by unit tests and the geometric identity until a squat golden lands.
- **Step 2, headPitchOffset resolved by measurement (2026-07-09):** *not derivable from the rig.* A GLTF probe (`tmp/measure-vrm.mjs`) shows all four VIPE skeletons are geometrically identical (hip 0.875, leg 0.708, arm 0.358, torso 0.498; raw and normalized head rest pitch both 0) while the hand-tuned offsets differ (0/+0.03/−0.02/+0.02) — they compensate for where each *mesh* carries its face, which no bone measurement observes. Kept as the single surviving per-avatar knob, documented as mesh-aesthetic.
- **Steps 2 slerps + 3 profile shrink done (2026-07-09):** smoothing knobs (`headSlerp`, `neckSlerp`, `legSlerp`, `footSlerp`) and the surviving arm-visibility gate are unified in `DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE` at the converged tuned values. `movementAvatarProfiles.ts` shrank from ~18 values × 4 avatars to `headPitchOffset` × 3. An unprofiled VRM now gets the tuned behavior plus rig-derived geometry — the step 3 acceptance test (novel VRM, no profile block, comparable scores) remains to be run, ideally with a non-VIPE rig since all VIPE skeletons are identical.
- **Step 3 acceptance test passed (2026-07-09):** the replay-lab avatar is now parameterisable (`?avatarUrl=`, `--avatar-url` on the capture scripts). Unprofiled `MoonGirl.vrm` (leg 0.955, +35% vs VIPE) scores equal-or-better on every measurable cell — lower-body errors 2–4× better; she has no toe bones so foot segments have nothing to measure. Unprofiled `Eugenia.vrm` (leg 0.579, −18%) is comparable-or-better on 23/25 cells. The "brand-new VRM with no profile block" success criterion is met at both ends of the rig-size range.
- **Step 5 done for the player path (2026-07-09), measurement-led.** `scripts/movement-debug/count-foot-gates.mjs` over the goldens: instructor foot segments are gated off on **100%** of frames (`recorded-foot-low-motion` 77%, `planted` 12%, `low-confidence` 10%, `low-knee-lift` 1% — "active" never occurs); player foot segments pass their gates 90% of the time, but the `player-neutral` stage parked the whole lower body — feet included — whenever standing motion was low (`playerRetargetLowerBodyMotion < 0.16/0.32`). Capture diagnostics made the attribution airtight: foot error is **0.000** when feet own the retarget; the worst cells (up to 0.665) were exactly neutral-held feet while the body pivots ("Turning Around in Circles"). Fix: in the player-neutral stage, foot mappings apply after the neutral ease (`movementAvatarLowerBodyFrameRuntime.ts`), per-segment confidence gate intact. Golden foot error dropped 3–5× (0.299→0.054, 0.213→0.044, 0.200→0.028, 0.151→0.044), lower-body aggregate similarly, all other cells identical across two runs. Feet are no longer the weakest region.
- **Step 5 instructor-path proof complete (2026-07-10):** the real play-screen instructor path at Full Motion Exercises frames 420/632 reports `recorded-retarget+planted-flat`, `6/6` lower bones, left/right leg-raise ownership with the opposite foot planted, and foot lock `1.00`. The old all-frames-closed instructor-foot measurement no longer describes current code.
- **Step 4 default-profile collapse complete (2026-07-10):** a production-consumer audit removed six dead compatibility knobs (`upperArmSlerp`, `lowerArmSlerp`, `armStoreVisibility`, `legStoreVisibility`, `legVisibility`, `footVisibility`). Every surviving field has a runtime consumer and a comment describing whether it is mesh trim, range, smoothing, visibility, measured-rig fallback, or recorded-presentation emphasis.
- Remaining: only the live-path webcam check the runbook requires before client demos. The available browser was camera-blocked on 2026-07-10, so the check remains open rather than being inferred from recorded or instructor proof.

Recipe (each step is one change-loop iteration):

1. **Build a rig-measurement reader.** At VRM load, next to `buildMovementAvatarRetargetRestMap` (`movementAvatarRestPose.ts` — it already walks the humanoid bind pose), compute: hip height (hips bone world y), leg length (upperLeg->foot), torso length (hips->head), arm length. Expose as a `MovementAvatarRigMeasurements` object on the runtime refs.
2. **Replace the geometric profile knobs one at a time,** re-scoring after each: `floorCorrectionScale`/`floorCorrectionLimit` (derivable from hip height vs the source's hip-to-floor ratio), `squatHipDropScale`/`squatHipDropLimit` (leg length), `headPitchOffset` (rest head orientation). The slerp-style knobs (`headSlerp`, `legSlerp`, `footSlerp`) are smoothing, not geometry — unify them across avatars the way arm slerps were unified in 2c (fixed values, commit `bbdd273`) rather than deriving them.
3. **Shrink `movementAvatarProfiles.ts`** toward zero required entries. Success test: load a VRM that has no profile block and confirm golden-recording scores comparable to `VIPE_Hero__1793.vrm`. (The replay lab hardcodes that avatar at `replay-lab/page.tsx` — parameterise it or temporarily swap the URL for this test.)
4. **Collapse `DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE`** (`movementTrackingCalibration.ts:248`) to the survivors, each with a comment stating the constraint it encodes.
5. **Foot ownership rationalization (deferred from 2c).** Feet are the weakest region (0.15–0.31). Start by measuring, not changing: count how often each instructor foot gate (`activeFootMotion < 0.22`, planted, `kneeLift < 0.45` in `movementAvatarRetargetSegmentApplicationDecision.ts`) blocks application on the goldens, then decide whether feet should follow world segment directions whenever confident-and-unplanted. Expect interaction with the planted-foot lock and floor clearance — watch `avatarFollowLeftFootClearance` in the capture diagnostics.

Exit criteria: unprofiled-VRM test passes; required geometric per-avatar profile blocks are removed; any cosmetic override is enumerated and justified; foot error meaningfully reduced or the blocker documented; current recorded and live proof is complete.

## Phase 4 — Structural cleanup

Goal: reduce navigation and maintenance cost. Deliberately last so we do not refactor code Phases 1-2 delete.

Progress log:

- **Completed 2026-07-10.** Item 4: `AvatarPreview.tsx` deleted (zero consumers); the `legacy-*` `MovementDataFormat` variants stay because stored recordings actively use them. Item 2: `movementRecordedProofManifest.ts` (2,042 lines) and `movementExpansionPreviewAudit.ts` (348 + test) moved to `scripts/movement-debug/lib/`; only the analyze CLI, one analyzer test, and npm script contracts touch them. Item 3: the page's pure helpers/thresholds, six QA/render panels, capture hook, recording-loading hook, batch-analysis hook, and pure current-frame verdict helper were extracted under `replay-lab/`. The debug-session recording is now derived instead of copied into state from an effect. `page.tsx` is 3,505 → 1,321 lines; the extracted verdict helper has focused regression tests.
- The `movementCoverageRegistry` decoupling is done: family/status types and the family → {status, summary} runtime table moved to `movementSupportStatus.ts`; `movementBodyOrientation`/`movementExercisePose` now import only the runtime module; the registry composes proof bookkeeping (labels, proof levels, remaining gaps) on top and re-exports for compat, so the pinned test/script paths were untouched. `movementProofRehearsalEvidence`/`movementNextProofRehearsal` stay in `replay-lab/_lib` by design — they were already scoped there with a JSON items file the readiness script reads, and the replay-lab QA panel renders them.
- Item 1's wrapper fold is done: the 61-file `*Runtime`/`*Orchestration` frame-chain topology folded into 8 seam modules — `movementAvatarFrameEntry`, `movementAvatarFramePreparation`, `movementAvatarBodyFrame`, `movementAvatarLocomotionFrame`, `movementAvatarFootingFrame`, `movementAvatarHeadFrame`, `movementAvatarSupportFrame`, `movementAvatarFrameApplication` — with tests merged per module (test parity checked each seam; three obsolete mock-wiring tests removed because intra-module seams cannot be mocked, replaced by movementAvatarFrameApplication.integration.test.ts which drives a real standing frame from entry through body solve and completion plus the demo-pose fallback branch; suite back at full parity). Post-fold A/B verified: the headless replay iteration over the golden Convex export produces byte-identical per-recording scores (pass, visual match, failure counts) at pre-fold commit `1d1678b2` and post-fold HEAD — 0 cells worse. The guard's two ready-frame watched-file caps merged into one cap on `movementAvatarFrameApplication`; the stale retarget-segment cap and wrapper-fold dead imports/parameters were cleaned. The five surviving `*Runtime`-named files (`Solver`, `VrmAsset`, `HeadApplication`, `PlayerSpineDrive`, `SupportContactDecision`) are real modules, three of them deliberately separated and guard-watched.
- The final non-wrapper audit found no dead movement runtime modules: every source module has a production consumer, with one test-fixture-only module by design. The small facade entrypoints remain because the architecture guard intentionally treats them as domain surfaces; replacing them with dozens of direct imports would increase coupling without reducing implementation. Current flat `_lib`: 217 TypeScript files / 56,276 lines, split into 30,981 source lines and 25,295 test lines. The original "well under half including tests" expectation was rejected as a misleading target: consolidation preserves implementation lines, and relocating tests would only make the directory count look smaller.
- **Remaining:** none for the accepted structural slice. The original broad 6–8-module/under-half-line target is superseded, not achieved; further module changes need a concrete hotspot, dead consumer, or behavior task rather than a file-count target.

1. **Completed for the forwarding topology; broad target superseded.** The frame-chain `*Runtime`/`*Orchestration` wrappers folded into eight real seam modules. The broader proposal to collapse all surviving `movementAvatar*` files into 6–8 files is not an accepted target because it would merge focused domain modules without reducing behavior.
2. **Rebaselined.** Heavy proof manifest generation moved to scripts; runtime support status split from proof bookkeeping. Replay Lab keeps proof rehearsal data because it is an explicit QA surface, not hidden production motion policy.
3. **Completed.** `replay-lab/page.tsx` split into focused panels, hooks, and pure verdict helpers.
4. **Completed with stored-data exception.** Dead preview/wrappers removed; `legacy-*` data formats retained because stored recordings use them.
5. **Completed.** Architecture guards describe and cap the surviving focused modules and folded frame seams.

Exit criteria met with the line-count correction above: wrapper topology removed; dead plumbing removed; Replay Lab split into focused panels/hooks/helpers; architecture guard green; Replay/Game parity green across 11,383 frames with 0 score or wrapper divergences; full 2,038-test check, production build, and focused Replay Lab browser proof green.

---

## Sequencing, risk, and effort

- Phases 0-1 are the high-confidence core and should deliver most of the "effort to follow" fix on their own. Do them first and in order.
- Phase 2 is the largest behavioural change and the riskiest; it must not start before the Phase 0 metric exists. Retire one solver path at a time, re-scoring between steps.
- Phase 3 is what makes new avatars cheap; it depends on Phase 2 having removed the constants that only existed to balance solver handoffs.
- Phase 4 is pure structure; it can trail or interleave with Phase 3 but must not precede Phase 2.
- All work on a branch, with the golden-recording follow-error score reported in each PR description.
