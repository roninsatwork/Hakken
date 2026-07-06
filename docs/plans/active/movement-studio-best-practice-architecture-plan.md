# Movement Studio Best-Practice Architecture Plan

Last reviewed: 2026-07-06
Status: active architecture-hardening plan and standing audit board.
Scope: keep Posture Studio / Game Studio movement code on a maintainable motion-engine path for visible, believable child gameplay before expanding broader human movement support.

## Executive Verdict

The implementation is following the plan closely in shape, but it is not done and should not be treated as done. The other agent has moved the work in the right direction: live, recorded, and synthetic inputs now feed shared source/motion contracts; Game Studio routes pass motion frames into the avatars; scoring uses shared gameplay events; replay proof tooling is much stronger; and many avatar runtime helpers have been extracted.

This is a dirty-worktree audit, not a merged-state audit. Several movement runtime helpers, tests, debug scripts, and proof artifacts are currently uncommitted or untracked; treat the percentages below as the state of the checkout on this review pass, and re-audit after the other agent's branch is cleaned up.

The gaps that still matter most are boundaries and parity:

- Recorded proof now has 0 missing-proof blockers in the controlling reviewed manifest.
- The previous 35-row queue was closed honestly: 26 duplicate non-target blockers are `covered-by-other-recording`, and 9 `root-travel` rows are `product-scope-limitation` because root travel is internal/demo-only for the current user-facing recorded proof gate.
- These 35 rows are not all passes; they are no longer outstanding recording work for the current product scope.
- Game Studio visual parity is now capturable and semantically reviewed against Replay Studio for the current deterministic target set.
- The reviewed analysis has 37 deterministic Game visual-proof target frames across 9 sessions, `current-game-visual-proof-plan.json` points each target at a debug-only Game Studio recorded-frame route, and `tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json` captured all 37 frames with 0 script errors, 0 nonblank failures, and 0 requested-vs-captured frame mismatches.
- Semantic review of those exact-frame screenshots now passes 37/37 rows after fixing the frame-locked Game route to render the player avatar's paused debug pose and removing the incorrect `debugSessionId` route assumption from the visual-proof plan.
- `VrmAvatar.tsx` is thinner in ownership again, with frame access/fallback setup, solver-frame preparation/pose solving, frame setup/decision prep, frame target composition, debug telemetry, head-frame debug/application/ref-threading, root-frame runtime orchestration/ref-threading, hips/floor frame setup, retarget rest-map adapters, upper-body frame runtime, lower-body frame-state setup/ref-threading, lower-body application/retarget orchestration, support-frame composition, footing/hips/foot-lock frame composition/ref-threading, and end-frame expression/hand writeback moved into focused helpers, but it still owns frame sequencing and final VRM write callback handoffs.
- `movementAvatarPipeline.ts` is now a small compatibility facade plus final shared decision assembler: support-contact lock decisions, avatar application option policy, support-presentation family routing/estimators/builders, standing fold/chair, athletic standing, yoga standing, seated, kneeling, quadruped, supine, prone, and side-body support-presentation pose decisions, retarget debug decisions, root-orientation policy, lower-body source bounds, player leg-raise hold, tracking fallback label composition, lower-body pose recipes, arm target decisions, upper-body/head/foot-lock policy, head decisions, lower-body target selection, lower-body application/visual policy, lower-body application plan resolution, lower-body aim/foot-plant application, lower-body rotation/pose application, and shared type contracts now live in focused modules while the pipeline preserves compatibility re-exports.
- `movement:architecture-guard` now also checks coverage product truth, so current reviewed analysis must keep only `upright` user-facing and keep upper-body standing, squat/knee-lift, root-turn, and root-travel families internal/demo-only until full proof or product scope changes.
- `movement:architecture-guard` now also checks proof-manifest honesty, so the current 26 `covered-by-other-recording`, 18 `source-data-limitation`, 9 root-travel `product-scope-limitation`, and 27 accepted-limitation rows cannot silently disappear into passes.
- `movement:architecture-guard` now also checks Game visual analysis-to-capture and review-to-capture consistency, so stale captures or stale 37-row semantic decisions cannot pass if the reviewed analysis or capture manifest changes underneath them.
- Accepted source-data and product-scope limitations are limitations, not passes.
- Most non-upright movement families remain approximate, diagnostic, or synthetic-only.

Progress estimates:

- Overall full human-movement engine: 25-30%.
- Current standing/posture/Game Studio slice: 89-91%.
- Architecture-hardening slice: 99%.
- Current proof-closure slice: 100% for the reviewed gate.
- Current Game parity proof slice: 95%; score/message parity is proved, deterministic Game visual-proof targets are present in the reviewed analysis, a machine-readable target plan exists, Game Studio has a debug-only recorded-frame injection route, exact-frame capture is verified, semantic review passes 37/37 selected frames, the capture manifest is now checked against the current reviewed analysis for missing/stale/context-mismatched target rows, the semantic review is now checked against the capture manifest for missing/stale/context-mismatched decision rows, the focused route/planner/review tests plus typecheck now pass under Node 22.13.0, and the current reviewed artifacts still show 11,383 score/message parity frames with 0 divergence frames. Keep this below 100% until the route remains stable after the dirty-worktree cleanup and the parity artifacts are refreshed after any further motion/rendering changes.
- Average progress across the 15 plan sections: about 82%.
- Plan adherence for the current standing architecture: 96-97%.

The headline answer to "how closely have they stuck to it": close enough that the foundation is recognizable, not close enough to relax. The current work should continue to be judged by proof manifests, focused visual capture, and renderer-boundary size, not by the number of extracted helper files.

## Audit Inputs

This pass inspected the current dirty worktree and existing proof artifacts. It did not run the full video suite or the full repository gate.

Code and artifact areas inspected:

- `movementSourceFrame.ts`, `movementLiveMotionFrame.ts`, and `movementRecordedMotionFrame.ts`.
- `movementMotionFrame.ts`, `movementTruthSkeleton.ts`, `movementGameplayEvents.ts`, and `useMovementMatchScoring.ts`.
- Game Studio play-route wiring in `[id]/play/page.tsx`.
- `VrmAvatar.tsx` and the extracted avatar runtime helpers, including `movementAvatarFrameAccessRuntime.ts`, `movementAvatarSolverRuntime.ts`, `movementAvatarFrameSetupRuntime.ts`, `movementAvatarFrameDecisionRuntime.ts`, `movementAvatarFrameTargetRuntime.ts`, `movementAvatarRuntimeRefs.ts`, `movementAvatarRuntimeReset.ts`, `movementAvatarDebugTelemetry.ts`, `movementAvatarHeadFrameRuntime.ts`, `movementAvatarHeadFrameRefsRuntime.ts`, `movementAvatarRootFrameRuntime.ts`, `movementAvatarHipsFrameRuntime.ts`, `movementAvatarRetargetFrameRuntime.ts`, `movementAvatarUpperBodyFrameRuntime.ts`, `movementAvatarLowerBodyFrameStateRuntime.ts`, `movementAvatarLowerBodyFrameStateRefsRuntime.ts`, `movementAvatarLowerBodyFrameRuntime.ts`, `movementAvatarSupportFrameRuntime.ts`, `movementAvatarFootingFrameRuntime.ts`, and `movementAvatarEndFrameRuntime.ts`.
- `movementAvatarPipeline.ts`, `movementAvatarSupportContactDecision.ts`, `movementAvatarApplicationOptions.ts`, `movementAvatarSupportPresentationDecision.ts`, `movementAvatarStandingSupportPresentationDecision.ts`, `movementAvatarStandingFoldSupportPresentationDecision.ts`, `movementAvatarAthleticStandingSupportPresentationDecision.ts`, `movementAvatarYogaStandingSupportPresentationDecision.ts`, `movementAvatarSeatedSupportPresentationDecision.ts`, `movementAvatarKneelingSupportPresentationDecision.ts`, `movementAvatarHandsFeetSupportPresentationDecision.ts`, `movementAvatarHandsKneesSupportPresentationDecision.ts`, `movementAvatarSupineSupportPresentationDecision.ts`, `movementAvatarProneSupportPresentationDecision.ts`, `movementAvatarSideBodySupportPresentationDecision.ts`, `movementAvatarSupportPresentationDecisionBuilders.ts`, `movementAvatarSupportPresentationEstimators.ts`, `movementAvatarRetargetDebugDecision.ts`, `movementAvatarRootOrientationDecision.ts`, `movementCoverageRegistry.ts`, `movementReplayAnalyzer.ts`, and `movementRecordedProofManifest.ts`.
- Replay/debug scripts under `scripts/movement-debug`.
- `tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json`.
- `tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json`.
- `tmp/movement-replay-lab/current-scenario-reviewed-smoke-summary.md`.

Current proof snapshot:

- 117 total proof rows.
- 64 passed rows.
- 26 covered-by-other-recording rows.
- 0 missing-proof blockers.
- 0 active manual-review rows.
- 9 product-scope-limitation rows.
- 18 source-data-limitation rows.
- 27 accepted source/product limitations.
- 82 visual-capture rows.
- 474 visual frame matches.
- 0 visual-capture-missing rows.
- 11,383 Replay/Game score-message parity frames.
- 0 Replay/Game score-message divergence frames.
- 37 Game visual-proof target frames in the current reviewed analysis artifact.
- 37/37 Game visual-proof target screenshots captured in `tmp/movement-replay-lab/captures/game-visual-proof` with 0 capture errors, 0 nonblank failures, and 0 requested-vs-captured frame mismatches.
- Game visual review checklist/template written to `tmp/movement-replay-lab/current-game-visual-proof-review.md` and `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.json`.
- Filled semantic decisions written to `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json`: 37 readable-pass, 0 readable-fail, 0 TODO.
- Semantic pass/fail by proof case: baseline 9 pass / 0 fail, first-scoring-frame 9 pass / 0 fail, strongest-root-turn 8 pass / 0 fail, first-tracking-help-frame 1 pass / 0 fail, strongest-squat 9 pass / 0 fail, first-source-display-divergence 4 pass / 0 fail, strongest-left-leg-lift 4 pass / 0 fail, strongest-right-leg-lift 4 pass / 0 fail.
- Blocking codes: none.
- Blocking proof cases: none.
- Fresh recording scenarios remaining: none.
- Recording gap plan: 0 action groups and 0 capture scenarios.

## Product Target

This is gameplay mirroring for children aged roughly 6-14, not clinical biomechanics.

The intended experience:

```text
Child moves
  -> avatar visibly copies the broad movement
  -> game rewards effort and recognizable motion
  -> tracking failures degrade gracefully
```

The target is not perfect joint-angle measurement. A squat does not need medical-grade knee math, but the avatar must visibly squat. A lean does not need exact spinal geometry, but the avatar must lean the right way. A leg raise does not need clinical precision, but it must read as the correct leg lifting rather than a broken crouch.

## Target Architecture

All input types should normalize into one standard source contract before movement decisions:

```text
live webcam adapter      -> MovementSourceFrame
recorded replay adapter  -> MovementSourceFrame
synthetic proof adapter  -> MovementSourceFrame
  -> shared movement pipe
  -> get-ready countdown and calibration gate
  -> normalized truth skeleton
  -> camera confidence and uncertainty state
  -> movement confidence, orientation, support/contact model
  -> explicit mirror/display side mapping
  -> child-friendly scoring and motivation events
  -> retarget frame and owner decisions
  -> avatar application targets
  -> thin VRM/Three.js application layer
  -> replay eval coverage gate
  -> replay/game parity proof
```

Allowed differences after `MovementSourceFrame`:

- UI presentation.
- scoring screen state.
- player/instructor labels.
- route progression.
- debug display.
- documented avatar identity/profile differences.

Not allowed after `MovementSourceFrame`:

- separate Replay-only or Game-only movement decisions.
- separate player lower-body ownership rules.
- separate support/contact solving.
- separate readability amplification.
- separate retarget eligibility.
- separate fallback behavior when confidence drops.
- avatar bone behavior that is not clearly avatar-profile or rest-pose application.

## Current Implementation Map

| Area | What is aligned | Gap to keep open |
| --- | --- | --- |
| Source frame contract | `MovementSourceFrame` carries source origin, status, landmarks, camera confidence, and readiness. Live and recorded builders create source frames from raw/source landmarks before display preparation. Focused tests now cover pose, world pose, hands, and blendshape source identity across live and recorded adapters while display preparation mirrors/zeros separately. | Continue guarding source purity with tests so mirrored/display landmarks never become source truth. |
| Shared motion pipe | `resolveMovementMotionFrame` centralizes truth skeleton, readability, support/contact, mirror mapping, owners, root target, and avatar decisions. | It still computes a separate display decision when display landmarks differ from source landmarks, so visual parity must be proved rather than assumed. |
| Game Studio route wiring | Main player and recorded instructor paths use `useMovementLiveMotionFrame`, `useMovementRecordedMotionFrame`, and required `motionFrameRef` props. | Debug/preview bypasses remain by design; keep them non-production and prevent them becoming parallel decision chains. |
| Scoring and feedback | `useMovementMatchScoring` and replay game-path simulation now call the same pure score/message helper, and the analyzer records 11,383 Replay/Game score-message parity frames with 0 divergences. | HUD sync/spine comparison remains a separate presentation diagnostic; keep score/message parity in compare output so regressions stay visible. |
| Start readiness | Normal gameplay has countdown/gate state, camera confidence, readiness messages, and source-frame readiness metadata. | Play start still locally re-resolves readiness from the current player source frame. This is acceptable for now but should be kept centralized. |
| Replay proof | Analyzer, proof manifests, visual-review decisions, source-limitation decisions, strict validation, scenario summaries, scenario validation commands, deterministic Game visual parity proof-frame selection, a `movement:game-visual-plan` target-plan writer, a debug-only Game recorded-frame route, frame-locked Game screenshot capture, and semantic Game review decisions exist. | The reviewed analyzer gate is clean, but accepted limitations and product-scope rows must stay visible. Game Studio visual parity is closed only for the current 37-frame target set and must be rerun after meaningful motion/rendering changes. |
| Avatar renderer | `VrmAvatar.tsx` is 604 lines and delegates many runtime/math helpers plus frame access/fallback setup, solver-frame preparation/pose solving, frame setup/decision prep, frame setup/decision ref-threading, frame target composition, frame debug telemetry, head-frame debug/application/ref-threading, post-footing debug sequencing, root-frame runtime composition/ref-threading, hips/floor frame setup, retarget rest-map frame adapters, upper-body frame runtime, lower-body frame-state setup/ref-threading, lower-body application/retarget orchestration, support-frame composition, footing/hips/foot-lock frame composition/ref-threading, and end-frame expression/hand writeback. | It still owns overall frame sequencing, some runtime ref lifecycle/threading, and final VRM write callback handoffs. |
| Shared avatar application | Lower-body application is now split by facade, shared type contracts, non-retarget plan resolution, retarget plan resolution, pure execution, application-plan VRM adapters, foot-plant VRM adapters, aim/foot-plant helpers, pure rotation/pose helpers, and rotation VRM adapters: `movementAvatarLowerBodyApplication.ts` is 74 lines, `movementAvatarLowerBodyApplicationTypes.ts` is 74 lines, `movementAvatarLowerBodyApplicationPlan.ts` is 133 lines, `movementAvatarLowerBodyRetargetApplicationPlan.ts` is 214 lines, `movementAvatarLowerBodyApplicationExecution.ts` is 120 lines, `movementAvatarLowerBodyApplicationVrmAdapters.ts` is 157 lines, `movementAvatarLowerBodyFootPlantVrmAdapters.ts` is 79 lines, `movementAvatarLowerBodyAimApplication.ts` is 189 lines, `movementAvatarLowerBodyRotationApplication.ts` is 154 lines, and `movementAvatarLowerBodyRotationVrmAdapters.ts` is 164 lines. Existing import compatibility is preserved through re-exports. | The old parent, plan, rotation, and application-adapter hotspots are closed for now. Watch `movementAvatarLowerBodyRetargetApplicationPlan.ts`, `movementAvatarLowerBodyApplicationVrmAdapters.ts`, `movementAvatarLowerBodyFootPlantVrmAdapters.ts`, and `movementAvatarLowerBodyRotationVrmAdapters.ts` for re-growth after lower-body movement changes. |
| Shared avatar pipeline | Most formerly centralized pose/option/debug/application policy now lives in focused modules while `movementAvatarPipeline.ts` is a 94-line compatibility facade. The final shared decision assembler now lives in `movementAvatarPipelineDecision.ts` at 163 lines, support-context composition lives in `movementAvatarPipelineSupportDecision.ts` at 67 lines, lower-body/retarget context composition lives in `movementAvatarPipelineLowerBodyDecision.ts` at 135 lines, and shared type contracts live in `movementAvatarPipelineTypes.ts` at 479 lines. The split modules cover support-contact locks, avatar application options, support-presentation family routing/builders/estimators, standing fold/chair, athletic standing, yoga standing, seated, kneeling, hands-feet, hands-knees, supine, prone, and side-body support-presentation poses, retarget debug decisions, root orientation, lower-body source bounds, player leg-raise hold, tracking fallback labels, lower-body pose recipes, arm target decisions, upper-body/head/foot-lock policy, head decisions, lower-body target selection, lower-body application/visual policy, lower-body/retarget pipeline context, and shared type contracts. | The old pipeline hotspot is closed for now. Watch `movementAvatarPipeline.ts` for facade re-growth, `movementAvatarPipelineDecision.ts` for final-assembler sprawl, `movementAvatarPipelineSupportDecision.ts` for support-context sprawl, and `movementAvatarPipelineLowerBodyDecision.ts` for lower-body/retarget context sprawl. `movementAvatarSupportPresentationDecision.ts` is a 64-line family router, and `movementAvatarStandingSupportPresentationDecision.ts` is a 20-line upright-family combiner. |
| Coverage truth | `movementCoverageRegistry.ts` separates supported, approximate, diagnostic-only, and unsupported movement families. Only `upright` is user-facing full support. | Synthetic/demo-ready families must remain internal/debug until recorded replay analyzer proof, visual capture, and Game Studio parity proof exist. |

## Section Progress

Use this as the standing report for each section. Reopen any row when code inspection, replay proof, or client-visible behavior shows the claim is too optimistic.

| Section | Progress | Current status | Open gap |
| --- | ---: | --- | --- |
| Phase 0: Freeze Pose Expansion | 90% | Expansion is documented and `movementCoverageRegistry.ts` prevents unsupported families from being invisible. | Keep synthetic/demo-ready families out of user-facing support claims. |
| Phase 1: Standard Source Frame Contract | 87% | Live, recorded, and synthetic paths can produce `MovementSourceFrame`; source construction now happens before display preparation in the main builders, and focused live/recorded adapter tests cover source pose, world pose, hands, and blendshape identity separately from display preparation. | Keep source-adapter purity tests active and add coverage whenever a new adapter appears. |
| Phase 2: Camera Confidence And Uncertainty | 75% | Confidence states, body-part confidence, stale-frame checks, score gating, prompts, and analyzer metrics exist. | Hidden-part scoring and confidence thresholds need broader saved-recording and Game/Replay parity proof. |
| Phase 3: Calibration And Start Readiness | 75% | Countdown/readiness gates exist for normal play and recording, with readiness metadata in frames/debug/replay. | Play route still performs local readiness completion checks; debug/preview bypasses must stay explicit. |
| Phase 4: Motion Contract Inventory | 99% | Renderer and avatar-pipeline responsibilities are better inventoried and many helpers have focused tests; `movementAvatarPipeline.ts` is now a compatibility facade over focused decision/type/support-context/lower-body-context modules, support-presentation is routed through focused family/upright-subfamily resolvers, and lower-body application has separate type, non-retarget plan, retarget plan, pure execution, application-plan VRM adapter, foot-plant VRM adapter, aim, pure rotation, and rotation VRM adapter modules. | Refresh inventory after every extraction; current line numbers and responsibility lists drift quickly. |
| Phase 5: Truth Skeleton Contract | 70% | `movementTruthSkeleton.ts` builds truth skeletons from `MovementSourceFrame` and `MovementMotionFrame` includes them. | Needs broader recorded/synthetic proof across seated, kneeling, floor, far-camera, and unsupported orientations. |
| Phase 6: Believable Game Motion Gate | 88% | Readability metrics, display amplification, visual proof tooling, visual decisions, the recorded squat visible-entry assertion, zero-blocker proof accounting, Game visual-proof frame selection, an actionable Game target plan, frame-locked Game captures, and semantic Game review now pass for 37/37 targets. | Keep proof focused on visible child-readable motion; broaden saved-recording and Game/Replay visual parity only when the product scope expands. |
| Phase 7: Replay Studio Eval Coverage Gate | 97% | Analyzer, manifest, visual-review, source-limitation, product-scope-limitation, strict validation, scenario smoke, scenario validation tooling, covered-by-other-recording normalization, and proof-manifest honesty guarding exist. | Tooling is strong; keep accepted limitations and zero-scenario validation summaries fresh after every proof pass. |
| Phase 8: Mirror Contract And Side Ownership | 84% | Mirror mode, side mapping, source-to-avatar metadata, mirror-side proof rows, and focused Game visual parity rows now pass for the current mirrored left/right knee-raise target set. | Mirror support should stay under focused visual proof before being claimed broadly across new movement families. |
| Phase 9: Shared Movement Pipe | 86% | `resolveMovementMotionFrame` is the central decision entry point and has focused source/display parity tests. Avatar pipeline compatibility exports now delegate to `movementAvatarPipelineDecision.ts` for final decision assembly, `movementAvatarPipelineSupportDecision.ts` for support-context composition, and `movementAvatarPipelineLowerBodyDecision.ts` for lower-body/retarget context composition. Focused Game captures are frame-locked and semantic review passes 37/37 targets. | Keep source/display and Replay/Game visual parity proof mandatory whenever display-specific behavior changes. |
| Phase 10: Child-Friendly Scoring And Motivation | 80% | Shared gameplay events drive live score deltas and feedback messages, and Replay/Game score-message parity is now explicit in analyzer output and comparison metrics. | Keep broad motivational tuning and child-friendly copy polish open; HUD sync/spine remains presentation-only. |
| Phase 11: Small Avatar Application Extraction | 98-99% | Many runtime helpers exist and are tested; `VrmAvatar.tsx` consumes route-provided motion frames, while frame access/fallback setup, solver-frame preparation/pose solving, frame setup/decision prep, frame setup/decision ref-threading, frame target composition, frame debug telemetry, head-frame debug/application/ref-threading, post-footing debug sequencing, root-frame runtime composition/ref-threading, hips/floor frame setup, retarget rest-map frame adapters, upper-body frame runtime, lower-body frame-state setup/ref-threading, lower-body application/retarget orchestration, support-frame composition, footing/hips/foot-lock frame composition/ref-threading, and end-frame expression/hand writeback now live outside the renderer. Avatar pipeline decision assembly, lower-body type contracts, non-retarget plan resolution, retarget plan resolution, pure execution, application-plan VRM-bone adapters, foot-plant VRM-bone adapters, aim/foot-plant, pure rotation/pose application, and rotation VRM-bone adapters are also separated from compatibility facades. | `VrmAvatar.tsx` remains an orchestration-heavy renderer, not a thin adapter. Lower-body application and avatar pipeline are now mostly watch-and-protect areas rather than the main extraction blockers. |
| Phase 12: Shared Replay/Game Motion Contract | 92% | Game path simulation, replay analyzer, live/recorded hooks, route motion refs, visual captures, context-validated decisions, cleaner proof gap ownership, score/message parity proof, 37 Game visual-proof frame targets, a machine-readable Game visual target plan, debug-only recorded-frame Game route injection, frame-lock capture assertions, filled semantic decisions, analysis-to-capture consistency checks, and semantic-review-to-capture consistency checks pass for the current target set. | Keep the route/debug proof harness non-production and rerun visual parity after any motion-frame, display-mirror, or avatar-application change. |
| Phase 13: Support Status Before New Families | 79% | Product truth is encoded in the coverage registry, replay proof metadata, and the fast architecture guard, with duplicate and out-of-scope proof gaps no longer counted as fresh recording work or silently converted to passes. | Approximate floor/yoga/Pilates/root-travel families must remain internal/debug until proof exists or product scope changes. |
| Phase 14: Expand Movement Families In Order | 20% | Expansion order and coverage honesty are documented. | Most non-upright movement remains diagnostic, approximate, or synthetic-only. |

## Always-Open Outstanding Tasks

These tasks are intentionally allowed to reopen. A previously completed item should become open again whenever proof, code inspection, or client-visible behavior invalidates it.

### Priority 0: Proof Before More Architecture Churn

- [x] Close the 35 missing-proof rows from the previous reviewed manifest without converting limitations into passes.
- [x] Add `npm run movement:architecture-guard` as a fast movement architecture/proof drift gate for watched hotspot line counts, `MovementSourceFrame` source-truth purity, debug/preview route-bypass purity in core libs/hooks, coverage product truth, Game visual semantic decisions, Game visual analysis-to-capture consistency, Game visual review-to-capture consistency, Replay/Game parity, Game visual target count, proof-manifest blocking rows, and proof-manifest limitation honesty.
- [ ] Maintain 0 missing-proof, manual-review, failed, and blocking rows in `tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json`.
- [ ] Run `npm run movement:architecture-guard` before and after meaningful movement architecture slices; reopen the relevant phase when it fails.
- [ ] Keep the 9 `root-travel` rows as visible `product-scope-limitation` rows until root travel is intentionally moved into user-facing scope with dedicated recorded proof.
- [ ] Keep `tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json` at 0 action groups and 0 capture scenarios unless a new proof blocker appears.
- [ ] Keep the 26 `covered-by-other-recording` rows visible in the manifest so duplicate non-target gaps do not reappear as false recording work.
- [x] Automate proof-manifest limitation honesty in `movement:architecture-guard` so covered-by-other rows, source-data limitations, root-travel product-scope limitations, accepted limitations, and unresolved source-data limitation counts cannot silently drift.
- [ ] After each fresh recording lands, run the focused validator first: `npm run movement:replay:validate-scenario -- --scenario <fresh-recording-label> --quiet`.
- [ ] Reopen regression fixtures for any client-visible movement that still looks wrong even when analyzer rows pass.
- [ ] Keep accepted product limitations counted as limitations, not passes; reopen them if product promise or source data changes.

### Priority 1: Prove Replay/Game Parity

- [x] Add focused Game Studio visual capture proof harness and captures for source/display semantic parity before raising Phase 9 or Phase 12.
- [x] Review the focused Game Studio screenshots against Replay/source-display semantics before raising Phase 9 or Phase 12 further.
- [x] Add deterministic Game visual parity proof-frame selection for baseline, source/display divergence, scoring, tracking-help, lower-body, and root-motion capture targets.
- [x] Emit deterministic Game visual parity proof-frame targets from replay analysis output and CLI summaries.
- [x] Add a machine-readable `movement:game-visual-plan` command that converts replay analysis target frames into a Game Studio visual capture target plan.
- [x] Regenerate `tmp/movement-replay-lab/current-analysis-reviewed.json` with current analyzer code so `gamePath.visualProofFrames` is non-empty before planning Game visual captures.
- [x] Run `npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/current-analysis-reviewed.json --out tmp/movement-replay-lab/current-game-visual-proof-plan.json` and keep the resulting target plan with the parity capture work.
- [x] Add a debug-only Game Studio recorded-frame injection route with `debugTracking=1&guidedPreview=1&debugGameFrame=<frameIndex>` so target-plan URLs can render the selected frame.
- [x] Capture screenshots for the 37 target frames in `tmp/movement-replay-lab/current-game-visual-proof-plan.json`.
- [x] Generate a Game visual semantic review checklist and JSON decision template for the 37 captured screenshots.
- [x] Fill and preserve semantic review decisions for the 37 screenshots in `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json`.
- [x] Automate Game visual capture consistency in `movement:architecture-guard` so missing, stale, or context-mismatched capture target rows fail the fast gate when compared with the current reviewed analysis.
- [x] Automate Game visual semantic-review consistency in `movement:architecture-guard` so missing, stale, or context-mismatched review rows fail the fast gate when compared with the capture manifest.
- [x] Fix Game visual target selection/frame-index parity so selected `strongest-squat`, `strongest-left-leg-lift`, `strongest-right-leg-lift`, and `first-source-display-divergence` frames are visually readable in frame-locked Game captures.
- [x] Regenerate `current-game-visual-proof-plan.json`, recapture the 37 target frames, and rerun semantic review until the selected proof cases pass or are explicitly scoped out.
- [x] Add a focused regression assertion that debug Game routes keep player paused-pose rendering enabled while `debugGameFrame` freezes playback.
- [x] Prove Replay and Game produce the same score/message events from the same `MovementMotionFrame` in recorded scenarios.
- [ ] Keep Replay/Game score-message parity at 0 divergence frames in analyzer and comparison outputs.
- [ ] Add or refresh focused proof for mirror side ownership if Game Studio visual parity shows Replay-vs-Game side drift.
- [ ] Keep HUD sync/spine comparison documented as presentation diagnostics unless it is deliberately moved into the shared gameplay event contract.

### Priority 2: Keep The Pipe Honest

- [ ] Keep `MovementSourceFrame` canonical: no mirrored display landmarks, solver landmarks, avatar-role presentation state, or route-only cleanup should become source truth.
- [x] Automate a source-truth purity check in `movement:architecture-guard` so `MovementSourceFrame` fails the fast gate if display landmarks, mirror mode, solver landmarks, avatar role, or debug route concepts creep in.
- [x] Add focused runtime source-adapter purity tests for current live and recorded adapters. Proof cases: live source pose/world pose/hands/blendshapes keep raw payload identity while display landmarks are prepared separately; recorded source pose/world pose keeps raw payload identity while display pose/world pose are mirrored or zeroed separately.
- [ ] Add source-adapter purity tests for every new adapter or saved-recording normalization path.
- [x] Automate route-bypass purity in `movement:architecture-guard` so debug/guided-preview/manual-preview/auto-baseline route terms fail the fast gate if they leak into core movement libs/hooks outside the explicit start-bypass helper.
- [ ] Keep debug, guided-preview, manual-preview, and auto-baseline bypasses marked as non-production/test paths.
- [ ] If `resolveMovementMotionFrame` gains more display-specific behavior, require a focused parity test or visual proof for it.

### Priority 3: Thin The Renderer Carefully

- [ ] Extract remaining `VrmAvatar.tsx` ownership one stateful concern at a time, with named proof cases before each slice.
- [x] Extract frame debug telemetry composition from `VrmAvatar.tsx` into `movementAvatarDebugTelemetry.ts`.
- [x] Extract per-frame VRM access, bone easing, and demo fallback setup from `VrmAvatar.tsx` into `movementAvatarFrameAccessRuntime.ts`.
- [x] Extract solver-frame preparation and pose solving from `VrmAvatar.tsx` into `movementAvatarSolverRuntime.ts`.
- [x] Extract frame setup and active decision preparation from `VrmAvatar.tsx` into `movementAvatarFrameSetupRuntime.ts` and `movementAvatarFrameDecisionRuntime.ts`.
- [x] Extract head-frame debug assembly from `VrmAvatar.tsx` into `movementAvatarHeadFrameRuntime.ts`.
- [x] Extract optional post-footing debug sequencing from `VrmAvatar.tsx` into `movementAvatarDebugTelemetry.ts`.
- [x] Extract frame target composition from `VrmAvatar.tsx` into `movementAvatarFrameTargetRuntime.ts`.
- [x] Extract root-frame runtime composition from `VrmAvatar.tsx` into `movementAvatarRootFrameRuntime.ts`.
- [x] Extract hips/floor frame setup from `VrmAvatar.tsx` into `movementAvatarHipsFrameRuntime.ts`.
- [x] Extract retarget rest-map callback plumbing from `VrmAvatar.tsx` into `movementAvatarRetargetFrameRuntime.ts`.
- [x] Extract upper-body runtime and recorded upper-body retarget count composition from `VrmAvatar.tsx` into `movementAvatarUpperBodyFrameRuntime.ts`.
- [x] Extract lower-body hold/visual/target frame-state setup from `VrmAvatar.tsx` into `movementAvatarLowerBodyFrameStateRuntime.ts`.
- [x] Extract lower-body application/retarget orchestration from `VrmAvatar.tsx` into `movementAvatarLowerBodyFrameRuntime.ts`.
- [x] Extract support presentation/contact frame composition from `VrmAvatar.tsx` into `movementAvatarSupportFrameRuntime.ts`.
- [x] Extract footing/hips/foot-lock frame composition from `VrmAvatar.tsx` into `movementAvatarFootingFrameRuntime.ts`.
- [x] Extract end-frame expression/hand writeback from `VrmAvatar.tsx` into `movementAvatarEndFrameRuntime.ts`.
- [x] Extract per-frame VRM/root runtime context from `VrmAvatar.tsx` into `movementAvatarFrameRuntimeContext.ts`. Proof cases: missing VRM skips the frame, missing avatar root skips the frame, and a ready frame updates the VRM exactly once with the render delta.
- [x] Extract solved-frame readiness branching from `VrmAvatar.tsx` into `movementAvatarReadyFrameRuntime.ts`. Proof cases: missing solver input applies demo fallback, solve-failed and empty-pose frames skip, ready frames without a VRM humanoid skip, and ready frames with a humanoid proceed.
- [x] Extract lower-body frame callback plumbing from `VrmAvatar.tsx` into `movementAvatarLowerBodyFrameCallbacksRuntime.ts`. Proof cases: missing last-good quaternion returns null, storing a last-good quaternion mutates the ref map, and world-matrix updates call the scene recursively.
- [x] Extract frame setup ref-threading from `VrmAvatar.tsx` into `movementAvatarFrameSetupRefsRuntime.ts`. Proof cases: setup state ref updates to the frame setup decision, retarget source model ref updates to the frame setup decision, and a null retarget model clears the ref.
- [x] Extract frame decision ref-threading from `VrmAvatar.tsx` into `movementAvatarFrameDecisionRefsRuntime.ts`. Proof cases: exercise transition state ref updates before fallback, missing avatar decision falls back, missing exercise transition falls back, and ready decision/transition values continue the frame.
- [x] Extract lower-body frame-state ref-threading from `VrmAvatar.tsx` into `movementAvatarLowerBodyFrameStateRefsRuntime.ts`. Proof cases: player leg-raise hold ref updates, player lower-body visual ref updates, instructor lower-body visual ref updates, and returned leg-raise hold decision matches the runtime decision.
- [x] Extract head-frame result ref-threading from `VrmAvatar.tsx` into `movementAvatarHeadFrameRefsRuntime.ts`. Proof cases: next base head position updates the base-bone ref, next tracking debug state updates the tracking ref, missing runtime values leave refs unchanged, and tracking debug ref remains optional.
- [x] Extract root-frame debug ref-threading from `VrmAvatar.tsx` into `movementAvatarRootFrameRefsRuntime.ts`. Proof cases: root debug updates an existing tracking-debug state, empty tracking-debug refs are not created, missing root debug leaves state unchanged, and tracking debug ref remains optional.
- [x] Extract footing-frame ref-threading from `VrmAvatar.tsx` into `movementAvatarFootingFrameRefsRuntime.ts`. Proof cases: next base hips position updates the base-hips ref, next foot-lock state updates the planted-foot-lock ref, drift/correction telemetry is returned, and null base hips clears the ref.
- [ ] Next reasonable extraction candidates: runtime ref lifecycle/threading, remaining final VRM write callback plumbing, or the next small frame-sequencing boundary.
- [ ] Do not extract more than one stateful avatar application concern per slice.
- [ ] Run `npm run eval:movement-avatar` before and after avatar-application behavior changes that can affect visible motion.
- [ ] Do not remove `movementAvatarLegacyDecision.ts` compatibility wrappers until parity harnesses no longer need explicit Replay-vs-Studio comparison names.

### Priority 4: Split Large Shared Modules Only With Proof

- [x] Move support-contact lock decisions out of `movementAvatarPipeline.ts` into `movementAvatarSupportContactDecision.ts`, while preserving pipeline re-exports.
- [x] Move avatar application option policy out of `movementAvatarPipeline.ts` into `movementAvatarApplicationOptions.ts`, while preserving pipeline re-exports.
- [x] Move support-presentation pose decisions out of `movementAvatarPipeline.ts` into `movementAvatarSupportPresentationDecision.ts`, while preserving pipeline re-exports.
- [x] Move support-presentation landmark estimator math into `movementAvatarSupportPresentationEstimators.ts`.
- [x] Move standing support-presentation pose decisions into `movementAvatarStandingSupportPresentationDecision.ts`.
- [x] Move standing fold/chair support-presentation pose decisions into `movementAvatarStandingFoldSupportPresentationDecision.ts`.
- [x] Move athletic standing support-presentation pose decisions into `movementAvatarAthleticStandingSupportPresentationDecision.ts`.
- [x] Move yoga standing support-presentation pose decisions into `movementAvatarYogaStandingSupportPresentationDecision.ts`.
- [x] Move seated support-presentation pose decisions into `movementAvatarSeatedSupportPresentationDecision.ts`.
- [x] Move kneeling support-presentation pose decisions into `movementAvatarKneelingSupportPresentationDecision.ts`.
- [x] Move hands-feet support-presentation pose decisions into `movementAvatarHandsFeetSupportPresentationDecision.ts`.
- [x] Move hands-knees support-presentation pose decisions into `movementAvatarHandsKneesSupportPresentationDecision.ts`.
- [x] Move supine/back-floor support-presentation pose decisions into `movementAvatarSupineSupportPresentationDecision.ts`.
- [x] Move prone/chest-floor support-presentation pose decisions into `movementAvatarProneSupportPresentationDecision.ts`.
- [x] Move side-body-floor support-presentation pose decisions into `movementAvatarSideBodySupportPresentationDecision.ts`.
- [x] Move support-presentation empty-pose/spec/decision builders into `movementAvatarSupportPresentationDecisionBuilders.ts`.
- [x] Move retarget debug label/count decisions into `movementAvatarRetargetDebugDecision.ts`, while preserving pipeline re-exports.
- [x] Move root-orientation policy into `movementAvatarRootOrientationDecision.ts`, while preserving pipeline re-exports.
- [x] Move lower-body source-bound checks into `movementAvatarLowerBodySourceBounds.ts`, while preserving pipeline re-exports.
- [x] Move player leg-raise hold smoothing/state decisions into `movementAvatarPlayerLegRaiseHold.ts`, while preserving pipeline re-exports.
- [x] Move tracking fallback label composition into `movementAvatarTrackingFallbackLabels.ts`, while preserving pipeline re-exports.
- [x] Move lower-body pose recipes into `movementAvatarLowerBodyPoseDecision.ts`, while preserving pipeline re-exports.
- [x] Move arm tracking readiness and arm target decisions into `movementAvatarArmTargetDecision.ts`, while preserving pipeline re-exports.
- [x] Move spine/head/foot-lock policy into `movementAvatarUpperBodyPoseDecision.ts`, while preserving pipeline re-exports.
- [x] Move head decision policy into `movementAvatarHeadDecision.ts`, while preserving pipeline re-exports.
- [x] Move lower-body target selection into `movementAvatarLowerBodyTargetSelection.ts`, while preserving pipeline re-exports.
- [x] Move lower-body application, retarget-segment, stage, inactive, and visual decisions into `movementAvatarLowerBodyApplicationDecision.ts`, while preserving pipeline re-exports.
- [x] Move lower-body application-plan and retarget application-plan resolution into `movementAvatarLowerBodyApplicationPlan.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body retarget application-plan, retarget segment-count, and retarget decision-application helpers into `movementAvatarLowerBodyRetargetApplicationPlan.ts`, while preserving lower-body application-plan and lower-body application re-exports.
- [x] Move lower-body application shared type contracts into `movementAvatarLowerBodyApplicationTypes.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body aim and instructor foot-plant application helpers into `movementAvatarLowerBodyAimApplication.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body rotation/spec/pose application helpers into `movementAvatarLowerBodyRotationApplication.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body rotation/spec/pose VRM-bone adapters into `movementAvatarLowerBodyRotationVrmAdapters.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body non-retarget/retarget pure execution into `movementAvatarLowerBodyApplicationExecution.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body VRM-bone adapters into `movementAvatarLowerBodyApplicationVrmAdapters.ts`, while preserving lower-body application re-exports.
- [x] Move lower-body instructor foot-plant VRM-bone adapters into `movementAvatarLowerBodyFootPlantVrmAdapters.ts`, while preserving lower-body application re-exports.
- [x] Move shared pipeline type contracts into `movementAvatarPipelineTypes.ts`, while preserving pipeline re-exports.
- [x] Move final avatar pipeline decision assembly into `movementAvatarPipelineDecision.ts`, while preserving pipeline re-exports.
- [x] Move avatar pipeline support-context composition into `movementAvatarPipelineSupportDecision.ts`.
- [x] Move avatar pipeline lower-body/retarget context composition into `movementAvatarPipelineLowerBodyDecision.ts`.
- [ ] Treat `movementAvatarPipeline.ts` as a compatibility facade and watch `movementAvatarPipelineDecision.ts`, `movementAvatarPipelineSupportDecision.ts`, and `movementAvatarPipelineLowerBodyDecision.ts` for re-growth after every movement slice.
- [x] Automate the watched hotspot line-count guard for `VrmAvatar.tsx`, the avatar-pipeline facade/assembler/context modules, and lower-body retarget/VRM-adapter modules in `movement:architecture-guard`.
- [ ] Prefer extracting pure contracts with existing tests first: coverage/product truth, retarget-frame shaping, support/contact ownership, body orientation, readability, and any facade cleanup that does not disturb the shared final decision assembler.
- [ ] Watch the support-presentation family routers for re-growth after every movement slice; split further only if focused support-presentation owner assertions, game-path simulation, and typecheck stay green.
- [ ] Watch `movementAvatarLowerBodyApplication.ts` and `movementAvatarLowerBodyApplicationPlan.ts` for facade re-growth, plus `movementAvatarLowerBodyRetargetApplicationPlan.ts`, `movementAvatarLowerBodyApplicationVrmAdapters.ts`, `movementAvatarLowerBodyFootPlantVrmAdapters.ts`, and `movementAvatarLowerBodyRotationVrmAdapters.ts` for lower-body application re-growth after every lower-body movement slice.
- [ ] Keep the single shared decision entry point intact unless the replacement has source/display and Replay/Game parity proof.

### Priority 5: Product Truth And Gates

- [ ] Keep `movementCoverageRegistry.ts`, proof manifests, user-facing copy, and this plan aligned after every movement-family change.
- [ ] Do not promote approximate, diagnostic-only, or synthetic proof families to support claims.
- [x] Automate coverage product-truth checks in `movement:architecture-guard` so reviewed analysis fails the fast gate if non-upright families become user-facing or if current internal/demo-only families stop being marked as missing full proof.
- [ ] Keep `movement:architecture-guard` thresholds aligned with this plan whenever a watched module is intentionally split, merged, or scoped differently.
- [ ] Before merge or push, run the local gate under Node 22.13.0 after `npm ci`: `npm run verify:env`, `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check`.

## Recommended Next Slice

The safest next slice is no longer root-travel recording capture, raw Game screenshot capture, visual target-selection repair, the paused-pose regression assertion, focused Node 22 reruns, the first frame-context renderer extraction, solved-frame readiness branching, lower-body frame callback plumbing, frame setup ref-threading, frame decision ref-threading, lower-body frame-state ref-threading, head-frame result ref-threading, root-frame debug ref-threading, or footing-frame ref-threading. It is proof hardening around the now-passing Game visual parity route:

1. Keep `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json` at 37 readable passes after any motion-frame, display-mirror, or avatar-application change.
2. Keep Replay/Game score-message parity at 0 divergence frames while visual parity work proceeds.
3. Keep the reviewed manifest at 0 blocking rows, while keeping accepted source-data and product-scope limitations separate from passes.
4. Run `npm run movement:architecture-guard` as the cheap drift gate before choosing the next extraction.
5. Only then pick the next renderer extraction and name the proof cases it can regress.

Recent focused verification:

- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFootWorldRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHipsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLockRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRootStepRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRuntimeState.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarTarget.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarInactiveLowerBodyRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarPlantedSquatIkRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarHipsFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFloorRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHipsRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameTargetRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarArmTarget.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyTargetSelection.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameAccessRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarDemoFallbackRuntime.test.ts`
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarSolverRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/vrmRigging.test.ts`
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts'` passed: 3 files / 260 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts'` passed again after the full support-presentation family-router split: 3 files / 260 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts'` passed again after the standing upright-subfamily split: 3 files / 260 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts'` passed after the lower-body aim/foot-plant and rotation/pose application split: 1 file / 44 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts'` passed again after the lower-body application-plan split: 1 file / 44 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts'` passed again after the lower-body facade/types/execution split: 1 file / 44 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts'` passed again after the lower-body pure-execution/VRM-adapter split: 1 file / 44 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts'` passed again after the lower-body retarget-plan split: 1 file / 44 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts'` passed after the lower-body rotation VRM-adapter split: 2 files / 47 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameRuntime.test.ts'` passed after the lower-body foot-plant VRM-adapter split: 2 files / 46 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts'` passed after the avatar pipeline decision/facade split: 3 files / 265 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts'` passed again after the avatar pipeline support-context split: 3 files / 265 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts'` passed again after the avatar pipeline lower-body/retarget context split: 3 files / 265 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts'` passed after adding deterministic Game visual parity proof-frame selection: 3 files / 268 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' scripts/movement-debug/analyze-sessions-cli.test.ts` passed after replay analysis started emitting Game visual parity proof-frame targets: 3 files / 282 tests.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/game-visual-proof-plan.test.mjs 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts'` passed after adding the Game visual-proof target plan command: 3 files / 279 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameDecisionRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameSetupRefsRuntime.test.ts'` passed after extracting lower-body frame-state ref-threading: 4 files / 8 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRefsRuntime.test.ts'` passed after extracting head-frame result ref-threading: 4 files / 10 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts'` passed after extracting root-frame debug ref-threading: 3 files / 10 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRefsRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts'` passed after extracting footing-frame ref-threading: 4 files / 12 tests.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding the fast architecture/proof drift guard: 1 file / 9 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed: watched hotspot line counts were under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, coverage product truth stayed user-facing `upright` with internal-demo-only families separated, Game visual proof was 37/37 readable-pass, Replay/Game parity was 11,383 frames with 0 divergences, Game visual proof frames were 37, and the proof manifest had 0 blocking rows.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementDisplayLandmarks.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts'` passed after adding runtime source-adapter purity assertions: 5 files / 26 tests.
- `npx -p node@22.13.0 npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/current-analysis-reviewed.json --out /tmp/sonae-game-visual-proof-plan.json --max-sessions 2 --max-frames-per-session 3` passed and correctly reported that the existing reviewed analysis predates `gamePath.visualProofFrames`.
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationTypes.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationExecution.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyAimApplication.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyTargetSelection.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationExecution.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationVrmAdapters.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationPlan.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyRetargetApplicationPlan.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyRotationApplication.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyRotationVrmAdapters.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationVrmAdapters.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFootPlantVrmAdapters.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationVrmAdapters.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineSupportDecision.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineLowerBodyDecision.ts'`
- `npx eslint --fix 'src/app/(dashboard)/demos/movements/_lib/movementGameVisualParityProof.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts'`
- `npx eslint --fix scripts/movement-debug/analyze-sessions-cli.ts 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.ts' 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGameVisualParityProof.ts'`
- `npx eslint --fix scripts/movement-debug/game-visual-proof-plan.mjs scripts/movement-debug/game-visual-proof-plan.test.mjs`
- `npx -p node@22.13.0 npm run typecheck`
- `git diff --check`

Full all-video runs should be reserved for broad avatar-application behavior changes or pre-merge confidence. For ordinary proof iteration, use the focused scenario validators and focused Replay/Game visual captures.

## Verification Notes

This documentation audit ran code inspection plus JSON summary checks against the reviewed manifest and recording plan. It did not run the full video suite, `npm run eval:movement-avatar`, `npm run build`, or the full repository gate.

Additional checks from this audit:

- `git diff --check -- docs/plans/active/movement-studio-best-practice-architecture-plan.md`
- `npx -p node@22.13.0 npm run movement:replay:analyze -- --export tmp/movement-replay-lab/runs/limit100-movement-recordings.convex-export.zip --visual-captures tmp/movement-replay-lab/captures/current-proof-set --review-decisions tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json --source-limitation-decisions tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json --out tmp/movement-replay-lab/current-analysis-reviewed.json` passed: 9 sessions, 0 failed, 52 warnings, 11,383 score-message parity frames, 0 score-message divergences, 37 Game visual-proof target frames, manifest gate passed.
- `npx -p node@22.13.0 npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/current-analysis-reviewed.json --out tmp/movement-replay-lab/current-game-visual-proof-plan.json` passed: 9 sessions, 37 target frames.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/game-visual-proof-plan.test.mjs src/app/(dashboard)/demos/movements/[id]/play/_components/MovementPlayComponents.test.tsx` passed: 2 files / 23 tests.
- `LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npx -p node@22.13.0 npm run dev -- -p 3100` served the debug route for focused Game capture.
- `npx -p node@22.13.0 npm run movement:game-visual-capture -- --base-url http://localhost:3100 --plan tmp/movement-replay-lab/current-game-visual-proof-plan.json --out tmp/movement-replay-lab/captures/game-visual-proof --local-test-auth --secret sonae-local-test-auth` passed after adding frame-lock capture assertions: 37/37 captured, 0 errors, 0 nonblank failures, 0 requested-vs-captured `debugGameFrame` mismatches.
- `npx -p node@22.13.0 npm run movement:game-visual-review -- --manifest tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json --out tmp/movement-replay-lab/current-game-visual-proof-review.md --decisions-out tmp/movement-replay-lab/current-game-visual-proof-review-decisions.template.json` passed: 37/37 checklist rows, 0 capture errors.
- Earlier filled semantic decisions in `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json` showed 13 readable-pass, 24 readable-fail, 0 TODO. This reopened Game visual target selection/frame-index parity for squat, leg-lift, and source/display divergence proof cases.
- After fixing the debug route paused-pose rendering and removing the invalid `debugSessionId` plan parameter, `npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/current-analysis-reviewed.json --out tmp/movement-replay-lab/current-game-visual-proof-plan.json --base-url http://localhost:3102` passed: 9 sessions, 37 target frames.
- `LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run movement:game-visual-capture -- --plan tmp/movement-replay-lab/current-game-visual-proof-plan.json --out tmp/movement-replay-lab/captures/game-visual-proof --base-url http://localhost:3102 --local-test-auth --secret sonae-local-test-auth` passed: 37/37 captured, 0 errors, 0 nonblank failures.
- `npm run movement:game-visual-review -- --manifest tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json --out tmp/movement-replay-lab/current-game-visual-proof-review.md --decisions-out tmp/movement-replay-lab/current-game-visual-proof-review-decisions.json` passed: 37/37 checklist rows, 0 capture errors.
- Filled semantic decisions in `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json`: 37 readable-pass, 0 readable-fail, 0 TODO.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/game-visual-proof-plan.test.mjs scripts/movement-debug/capture-game-visual-proof.test.mjs scripts/movement-debug/write-game-visual-review.test.mjs` passed before the local Node 22 `npx` path hit a restricted-network cache miss: 3 files / 9 tests.
- A later `npx -p node@22.13.0 ...` command failed because the sandbox could not resolve `registry.npmjs.org`; escalated public-registry execution with the local auth secret was rejected, so the follow-up visual capture and review ran with the local shell Node against a localhost-only dev server.
- `npm run typecheck` passed under the local shell Node after the route cleanup.
- `./node_modules/.bin/vitest run scripts/movement-debug/game-visual-proof-plan.test.mjs scripts/movement-debug/capture-game-visual-proof.test.mjs scripts/movement-debug/write-game-visual-review.test.mjs` passed under the local shell Node after the route cleanup: 3 files / 9 tests.
- `git diff --check` passed after the plan and route updates.
- `./node_modules/.bin/vitest run src/app/(dashboard)/demos/movements/_lib/movementGameDebugRoute.test.ts scripts/movement-debug/game-visual-proof-plan.test.mjs scripts/movement-debug/capture-game-visual-proof.test.mjs scripts/movement-debug/write-game-visual-review.test.mjs` passed after adding the paused-pose regression assertion: 4 files / 11 tests.
- `npm run typecheck` passed after adding the paused-pose regression assertion.
- `git diff --check` passed after adding the paused-pose regression assertion.
- `npx -p node@22.13.0 node -v` returned `v22.13.0` without escalation.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementGameDebugRoute.test.ts scripts/movement-debug/game-visual-proof-plan.test.mjs scripts/movement-debug/capture-game-visual-proof.test.mjs scripts/movement-debug/write-game-visual-review.test.mjs` passed: `verify:env` plus 4 files / 11 tests.
- `npx -p node@22.13.0 npm run typecheck` passed.
- `git diff --check` passed after the focused Node 22 rerun.
- Artifact guard check passed: `tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json` has 37 `readable-pass` decisions and 0 failures/TODO rows.
- Artifact guard check passed: `tmp/movement-replay-lab/current-analysis-reviewed.json` has 11,383 score/message parity frames, 0 score-message divergence frames, 0 overall parity divergence frames, and 37 Game visual targets.
- Artifact guard check passed: `tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json` has 0 blocking rows, 0 failed rows, 0 missing-proof rows, and 0 manual-review rows.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameRuntimeContext.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameAccessRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarSolverRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementGameDebugRoute.test.ts` passed after extracting the frame-context renderer boundary: `verify:env` plus 4 files / 14 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting the frame-context renderer boundary.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameRuntimeContext.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarSolverRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameAccessRuntime.test.ts` passed after extracting solved-frame readiness branching: `verify:env` plus 4 files / 16 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting solved-frame readiness branching.
- `git diff --check` passed after extracting solved-frame readiness branching.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameCallbacksRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameRuntimeContext.test.ts` passed after extracting lower-body frame callback plumbing: `verify:env` plus 4 files / 12 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting lower-body frame callback plumbing.
- `git diff --check` passed after extracting lower-body frame callback plumbing.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameSetupRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameSetupRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameRuntimeContext.test.ts` passed after extracting frame setup ref-threading: `verify:env` plus 4 files / 11 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting frame setup ref-threading.
- `git diff --check` passed after extracting frame setup ref-threading.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameDecisionRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameDecisionRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameSetupRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameRuntime.test.ts` passed after extracting frame decision ref-threading: `verify:env` plus 4 files / 11 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting frame decision ref-threading.
- `git diff --check` passed after extracting frame decision ref-threading.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameDecisionRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameSetupRefsRuntime.test.ts` passed after extracting lower-body frame-state ref-threading: `verify:env` plus 4 files / 8 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting lower-body frame-state ref-threading.
- `git diff --check` passed after extracting lower-body frame-state ref-threading.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRefsRuntime.test.ts` passed after extracting head-frame result ref-threading: `verify:env` plus 4 files / 10 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting head-frame result ref-threading.
- `git diff --check` passed after extracting head-frame result ref-threading.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts` passed after extracting root-frame debug ref-threading: `verify:env` plus 3 files / 10 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting root-frame debug ref-threading.
- `git diff --check` passed after extracting root-frame debug ref-threading.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarFootingFrameRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRefsRuntime.test.ts src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadFrameRefsRuntime.test.ts` passed after extracting footing-frame ref-threading: `verify:env` plus 4 files / 12 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after extracting footing-frame ref-threading.
- `git diff --check` passed after extracting footing-frame ref-threading.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding the fast architecture/proof drift guard: `verify:env` plus 1 file / 9 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding the fast architecture/proof drift guard: watched files under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, coverage product truth stayed user-facing `upright` with upper-body-standing, squat-knee-lift, root-turn, and root-travel internal/demo-only, 37/37 readable Game visual passes, 11,383 Replay/Game parity frames, 0 divergences, 37 Game visual proof frames, and 0 proof-manifest blocking rows.
- `npx -p node@22.13.0 npm run test:run -- src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.test.ts src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.test.ts src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.test.ts src/app/(dashboard)/demos/movements/_lib/movementDisplayLandmarks.test.ts src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts` passed after adding runtime source-adapter purity assertions: `verify:env` plus 5 files / 26 tests.
- `npx -p node@22.13.0 npm run typecheck` passed after adding runtime source-adapter purity assertions.
- `git diff --check` passed after adding runtime source-adapter purity assertions.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding coverage product-truth checks to the architecture guard: `verify:env` plus 1 file / 9 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding coverage product-truth checks: watched files under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, coverage product truth stayed user-facing `upright` with upper-body-standing, squat-knee-lift, root-turn, and root-travel internal/demo-only, 37/37 readable Game visual passes, 11,383 Replay/Game parity frames, 0 divergences, 37 Game visual proof frames, and 0 proof-manifest blocking rows.
- `npx -p node@22.13.0 npm run typecheck` passed after adding coverage product-truth checks to the architecture guard.
- `npx eslint scripts/movement-debug/movement-architecture-guard.mjs scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding coverage product-truth checks.
- `git diff --check` passed after adding coverage product-truth checks.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding proof-manifest limitation honesty checks to the architecture guard: `verify:env` plus 1 file / 9 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding proof-manifest limitation honesty checks: watched files under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, coverage product truth stayed user-facing `upright` with upper-body-standing, squat-knee-lift, root-turn, and root-travel internal-demo-only, 37/37 readable Game visual passes, 11,383 Replay/Game parity frames, 0 divergences, 37 Game visual proof frames, 117 proof rows, 0 blocking rows, and 27 accepted limitations.
- `npx -p node@22.13.0 npm run typecheck` passed after adding proof-manifest limitation honesty checks to the architecture guard.
- `npx eslint scripts/movement-debug/movement-architecture-guard.mjs scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding proof-manifest limitation honesty checks.
- `git diff --check` passed after adding proof-manifest limitation honesty checks.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding Game visual review-to-capture consistency checks to the architecture guard: `verify:env` plus 1 file / 10 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding Game visual review-to-capture consistency checks: watched files under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, 37/37 readable Game visual passes, 37 captures, 0 missing decisions, 0 stale decisions, 0 context mismatches, 11,383 Replay/Game parity frames, 0 divergences, 37 Game visual proof frames, coverage product truth stayed user-facing `upright`, and the proof manifest had 117 rows, 0 blocking rows, and 27 accepted limitations.
- `npx -p node@22.13.0 npm run typecheck` passed after adding Game visual review-to-capture consistency checks.
- `npx eslint scripts/movement-debug/movement-architecture-guard.mjs scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding Game visual review-to-capture consistency checks.
- `git diff --check` passed after adding Game visual review-to-capture consistency checks.
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding Game visual analysis-to-capture consistency checks to the architecture guard: `verify:env` plus 1 file / 11 tests.
- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding Game visual analysis-to-capture consistency checks: watched files under threshold, `MovementSourceFrame` source purity had 0 forbidden terms, route-bypass purity scanned 159 files with 0 forbidden terms, 37/37 readable Game visual passes, 37 analysis targets, 0 missing captures, 0 stale captures, 0 capture context mismatches, 37 captures, 0 missing decisions, 0 stale decisions, 0 decision context mismatches, 11,383 Replay/Game parity frames, 0 divergences, 37 Game visual proof frames, coverage product truth stayed user-facing `upright`, and the proof manifest had 117 rows, 0 blocking rows, and 27 accepted limitations.
- `npx -p node@22.13.0 npm run typecheck` passed after adding Game visual analysis-to-capture consistency checks.
- `npx eslint scripts/movement-debug/movement-architecture-guard.mjs scripts/movement-debug/movement-architecture-guard.test.mjs` passed after adding Game visual analysis-to-capture consistency checks.
- `git diff --check` passed after adding Game visual analysis-to-capture consistency checks.
- `npx -p node@22.13.0 npm run typecheck`
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts' 'src/app/(dashboard)/demos/movements/_hooks/useMovementMatchScoring.test.ts'` passed: 3 files / 16 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts'` passed: 5 files / 268 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootTarget.test.ts'` passed: 8 files / 286 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRuntimeState.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts'` passed: 5 files / 276 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPlantedSquatIkRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSegmentApplication.test.ts'` passed: 5 files / 318 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameTargetRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarArmTarget.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts'` passed: 5 files / 273 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadTarget.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLock.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLockRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyFrameRuntime.test.ts'` passed: 7 files / 284 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadTarget.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyTargetSelection.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFrameStateRuntime.test.ts'` passed: 7 files / 310 tests.
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationRuntime.test.ts'` passed: 3 files / 260 tests.
- `npx -p node@22.13.0 npm run typecheck`
- `git diff --check -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineTypes.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarApplicationOptions.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationEstimators.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetDebugDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootOrientationDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodySourceBounds.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerLegRaiseHold.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarTrackingFallbackLabels.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyPoseDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarArmTargetDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPoseDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadDecision.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyTargetSelection.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationDecision.ts' docs/plans/active/movement-studio-best-practice-architecture-plan.md`
- Plain `npm run verify:env` failed under the shell default Node `23.10.0`; the Node 22.13.0 `npx` run above passed `verify:env`.

Focused checks already recorded in this worktree on 2026-07-06:

- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts'`
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_hooks/useMovementMatchScoring.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts' scripts/movement-debug/compare-replay-analysis.test.mjs scripts/movement-debug/analyze-sessions-cli.test.ts`
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRuntimeState.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLockRuntime.test.ts'`
- `npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootFrameRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootMotionRuntime.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootTarget.test.ts' 'src/app/(dashboard)/demos/movements/_lib/movementAvatarRootTransformRuntime.test.ts'`
- `npx -p node@22.13.0 npm run typecheck`
- `npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/validate-recording-scenario.test.mjs scripts/movement-debug/scenario-smoke-summary.test.mjs scripts/movement-debug/compare-replay-analysis.test.mjs scripts/movement-debug/run-replay-iteration.test.mjs scripts/movement-debug/analyze-sessions-cli.test.ts scripts/movement-debug/write-replay-proof-review.test.mjs`
- `npx -p node@22.13.0 npm run movement:replay:analyze -- --export tmp/movement-replay-lab/runs/limit100-movement-recordings.convex-export.zip --visual-captures tmp/movement-replay-lab/captures/current-proof-set --review-decisions tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json --source-limitation-decisions tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json --out tmp/movement-replay-lab/current-analysis-reviewed.json`
- `npx -p node@22.13.0 npm run movement:replay:review -- --manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --captures tmp/movement-replay-lab/captures/current-proof-set --decisions tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json --source-limitation-decisions tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json --recording-plan-out tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json --recording-guide-out tmp/movement-replay-lab/current-proof-recording-guide.reviewed.md --summary-out tmp/movement-replay-lab/current-proof-review-summary.reviewed.json --out tmp/movement-replay-lab/current-proof-visual-review.reviewed.md`
- `npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --summary-out tmp/movement-replay-lab/current-scenario-validation-summary.json --summary-markdown-out tmp/movement-replay-lab/current-scenario-validation-summary.md`
- `git diff --check` for the changed plan, replay README, proof manifest, and replay analyzer test files.

Use these focused commands before broad suites:

```bash
npm run movement:replay:validate-scenario -- --scenario <fresh-recording-label> --quiet
npm run movement:replay:scenario-summary
npm run movement:replay:compare
```

Use the full local gate only before asking to merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Stop Conditions

Stop and reopen the relevant task if any of these happen:

- A user-facing movement looks wrong even though analyzer status says pass.
- A movement family is being promoted without recorded replay analyzer proof, visual capture, and Game Studio parity proof.
- A Game-only or Replay-only movement decision appears after `MovementSourceFrame`.
- A renderer extraction changes visible motion without focused before/after proof.
- A proof decision file is missing context, stale, or converts source limitations into passes.
