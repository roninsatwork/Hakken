# Replay Avatar-Follow Correction Plan

Last reviewed: 2026-07-09
Status: Phases 0-2 complete; Phase 3 next. See the Handoff runbook section before changing avatar code.
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
- **Deferred from 2c to Phase 3: foot ownership rationalization.** Feet remain the weakest region (0.15–0.31 error on goldens); the instructor foot gates (`activeFootMotion < 0.22`, planted, `kneeLift < 0.45`) mean feet rarely follow. This needs measurement-led redesign alongside the rig-derived calibration work.

Phase 2 exit status: **complete.** One solver (rest-mapped world-direction segments + angle-based spine/head drives + planted-foot IK), no per-frame solver arbitration, no Kalidokit pose solve (hands only), single bone-ease table. 132 test files / 977 tests green; golden capture scores held or improved through every step.

- **2e residue sweep (done 2026-07-09):** an audit against this plan found leftovers that contradicted the exit criteria as written; all removed with golden captures at 0 cells worse per step. (1) The dead legacy aim type plumbing: `MovementAvatarAimOptionsDecision` (with `frontBias`/`zScale`), the `LegacyLowerBodyAim*` spec/request/target types, the computed-but-never-read `shouldApplyLegacyAim` plan flag, and the duplicate `aimTargets` record. (2) `movementAvatarLegacyDecision.ts`: the replay/studio compat wrappers are inlined at their three call sites (analyzer + replay-lab parity harness) as direct `resolveMovementAvatarPipelineDecision` calls. (3) `shouldUseLegacyLowerBody` (pure negation of `retargetOwnsLowerBody`) and the `legacy-*` owner labels (`retarget-partial-fallback` / `neutral-fallback` / `player-foot-fallback` now). (4) `createVrmImageSolverLandmarks` and its hip-centred `*3.0` scaling — prepared `solverLandmarks` are world-or-null now, and the debug-only target selections fall back to image landmarks; the never-read `kalidokitSolverLandmarks` copy went with it. Remaining owner strings (`lowerBodyOwner`/`feetOwner`/`torsoOwner` etc.) are telemetry labels, not solver arbitration; foot-ownership rationalization stays deferred to Phase 3 step 5.

1. Extend the rest-mapped solver (`movementAvatarRestPose.ts` + `movementAvatarRestMappedSegmentApplication.ts`) to own the full body: arms, spine, and head, fed by world-landmark segment directions. It already implements the correct math (rest-direction → desired-direction world rotation, converted to local via parent).
2. Retire the Kalidokit pose path (`solveVrmPose` and the re-solve inside `VrmAvatar`'s `useFrame`) and the aim-vector limb path (`movementAvatarAimApplication.ts`, `movementAvatarArmApplication.ts`). Keep Kalidokit hand solving if finger tracking is retained. Keep planted-foot IK — that is the one place IK belongs.
3. Delete the owner-arbitration flags and their decision plumbing: `shouldUseRetargetedUpperBody`, `retargetOwnsLowerBody`, `shouldUseLegacyLowerBody`, `feetOwner`, `lowerBodyOwner`, `torsoOwner`, and `movementAvatarLegacyDecision.ts` once nothing consumes it.
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

Goal: a new VRM follows well with zero hand-authored constants.

Progress log:

- **Step 1 done (2026-07-09):** `measureMovementAvatarRig` (`movementAvatarRestPose.ts`) walks the same normalized bind pose as the rest map and records hip height, averaged leg/arm chain lengths, and hips→head torso length. Exposed as `MovementAvatarRigMeasurements | null` on the new `rigMeasurementsRef` runtime ref, populated in `resetMovementAvatarRuntimeRefs` at VRM load. Returns null for rigs missing hips/head or both leg/arm chains.
- **Step 2, floorCorrection knobs done (2026-07-09):** `getCalibratedFloorCorrection` now derives scale = `hipHeight / (calibration.floorY − hipCenter.y)` and limit = `0.4 × hipHeight` when measurements exist; profile knobs are the fallback for unmeasured rigs and degenerate calibrations (`hipToFloor ≤ 0.2`). The measured VIPE hip height (0.875) makes the derived scale ≈1.59 vs the hand-tuned 1.6 — the knob was encoding exactly this ratio, so scores are unchanged. (An earlier note here claimed px7fmzw2 improved; that run was a capture anomaly following a transient failure — two later stability runs reproduce the baseline exactly. Correction: score-neutral, which is the expected and desired outcome.)
- **Step 2, squat drop done (2026-07-09):** `resolveMovementAvatarHipsPositionOptions` derives the recorded-presentation `squatHipDropScale`/`Limit` as `0.54 × legLength` / `0.59 × legLength` — the hand-authored 0.38/0.42 encode these ratios at the measured VIPE leg length of 0.708. The live player-squat 0.88/0.78 values are role tuning and stay. Note the current golden set cannot exercise squat drop (all five recordings are standing); guarded by unit tests and the geometric identity until a squat golden lands.
- **Step 2, headPitchOffset resolved by measurement (2026-07-09):** *not derivable from the rig.* A GLTF probe (`tmp/measure-vrm.mjs`) shows all four VIPE skeletons are geometrically identical (hip 0.875, leg 0.708, arm 0.358, torso 0.498; raw and normalized head rest pitch both 0) while the hand-tuned offsets differ (0/+0.03/−0.02/+0.02) — they compensate for where each *mesh* carries its face, which no bone measurement observes. Kept as the single surviving per-avatar knob, documented as mesh-aesthetic.
- **Steps 2 slerps + 3 profile shrink done (2026-07-09):** smoothing knobs (`headSlerp`, `neckSlerp`, `upperArmSlerp`, `lowerArmSlerp`, `legSlerp`, `footSlerp`) and visibility gates unified into `DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE` at the converged tuned values (the per-avatar entries differed by ≤0.02; the old defaults were far snappier and untested). Every default knob now carries a comment stating what it encodes (step 4's discipline). `movementAvatarProfiles.ts` shrank from ~18 values × 4 avatars to `headPitchOffset` × 3. An unprofiled VRM now gets the tuned behavior plus rig-derived geometry — the step 3 acceptance test (novel VRM, no profile block, comparable scores) remains to be run, ideally with a non-VIPE rig since all VIPE skeletons are identical.
- **Step 3 acceptance test passed (2026-07-09):** the replay-lab avatar is now parameterisable (`?avatarUrl=`, `--avatar-url` on the capture scripts). Unprofiled `MoonGirl.vrm` (leg 0.955, +35% vs VIPE) scores equal-or-better on every measurable cell — lower-body errors 2–4× better; she has no toe bones so foot segments have nothing to measure. Unprofiled `Eugenia.vrm` (leg 0.579, −18%) is comparable-or-better on 23/25 cells. The "brand-new VRM with no profile block" success criterion is met at both ends of the rig-size range.
- **Step 5 done for the player path (2026-07-09), measurement-led.** `scripts/movement-debug/count-foot-gates.mjs` over the goldens: instructor foot segments are gated off on **100%** of frames (`recorded-foot-low-motion` 77%, `planted` 12%, `low-confidence` 10%, `low-knee-lift` 1% — "active" never occurs); player foot segments pass their gates 90% of the time, but the `player-neutral` stage parked the whole lower body — feet included — whenever standing motion was low (`playerRetargetLowerBodyMotion < 0.16/0.32`). Capture diagnostics made the attribution airtight: foot error is **0.000** when feet own the retarget; the worst cells (up to 0.665) were exactly neutral-held feet while the body pivots ("Turning Around in Circles"). Fix: in the player-neutral stage, foot mappings apply after the neutral ease (`movementAvatarLowerBodyFrameRuntime.ts`), per-segment confidence gate intact. Golden foot error dropped 3–5× (0.299→0.054, 0.213→0.044, 0.200→0.028, 0.151→0.044), lower-body aggregate similarly, all other cells identical across two runs. Feet are no longer the weakest region.
- **Step 5 remainder — instructor path:** instructor foot gating is unchanged and remains fully closed (the measurement above). Loosening it cannot be validated by the goldens (they exercise the player role); it needs a play-screen check. Do this alongside the next live webcam verification.
- Remaining: step 4 default-profile collapse review (partially done via the unification comments), instructor-foot decision above, and the live-path check the runbook requires before client demos (this change touches the live player path too).

Recipe (each step is one change-loop iteration):

1. **Build a rig-measurement reader.** At VRM load, next to `buildMovementAvatarRetargetRestMap` (`movementAvatarRestPose.ts` — it already walks the humanoid bind pose), compute: hip height (hips bone world y), leg length (upperLeg->foot), torso length (hips->head), arm length. Expose as a `MovementAvatarRigMeasurements` object on the runtime refs.
2. **Replace the geometric profile knobs one at a time,** re-scoring after each: `floorCorrectionScale`/`floorCorrectionLimit` (derivable from hip height vs the source's hip-to-floor ratio), `squatHipDropScale`/`squatHipDropLimit` (leg length), `headPitchOffset` (rest head orientation). The slerp-style knobs (`headSlerp`, `legSlerp`, `footSlerp`) are smoothing, not geometry — unify them across avatars the way arm slerps were unified in 2c (fixed values, commit `bbdd273`) rather than deriving them.
3. **Shrink `movementAvatarProfiles.ts`** toward zero required entries. Success test: load a VRM that has no profile block and confirm golden-recording scores comparable to `VIPE_Hero__1793.vrm`. (The replay lab hardcodes that avatar at `replay-lab/page.tsx` — parameterise it or temporarily swap the URL for this test.)
4. **Collapse `DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE`** (`movementTrackingCalibration.ts:248`) to the survivors, each with a comment stating the constraint it encodes.
5. **Foot ownership rationalization (deferred from 2c).** Feet are the weakest region (0.15–0.31). Start by measuring, not changing: count how often each instructor foot gate (`activeFootMotion < 0.22`, planted, `kneeLift < 0.45` in `movementAvatarRetargetSegmentApplicationDecision.ts`) blocks application on the goldens, then decide whether feet should follow world segment directions whenever confident-and-unplanted. Expect interaction with the planted-foot lock and floor clearance — watch `avatarFollowLeftFootClearance` in the capture diagnostics.

Exit criteria: unprofiled-VRM test passes; per-avatar profile blocks removed or empty; remaining constants enumerated and justified; foot error meaningfully reduced or the blocker documented.

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
