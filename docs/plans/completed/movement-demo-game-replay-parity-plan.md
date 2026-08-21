# Movement Demo Game And Replay Parity Plan

Last reviewed: 2026-07-03
Status: initial game-path simulation harness implemented; player lower-body owner selection is shared with the `VrmAvatar` render path; synthetic player proof route is linked to harness owner checks and visual proofs for weak-feet/out-of-frame cases; first regression corpus is in place.
Audience: agents working on avatar alignment, replay lab, live practice, or movement debug sessions.

## Purpose

Replay alignment is only valuable if it proves fixes that carry into the actual game.

The replay lab currently helps inspect recorded movement data, source skeletons, retarget diagnostics, and avatar output without asking the user to record the same movement again. That is useful, but it is not enough. The live game adds player calibration, webcam smoothing, player lower-body intent, scoring-driven frame advance, lag compensation, and fallback ownership decisions.

The rule for future work:

> A replay-alignment fix is not complete until the same scenario passes through the game path, or through a test harness that faithfully simulates the game path.

Do not build route-local replay behavior that makes `/demos/movements/replay-lab` look good while `/demos/movements/[id]/play` remains broken.

## Current Parity Gap

Shared today:

- `VrmAvatar` applies the final VRM body behavior for both replay lab and play route.
- `movementRetargeting.ts` solves source body model, segment motion, squat depth, knee lift, and foot contact.
- `movementTrackingCalibration.ts` computes live calibration and lower-body intent.
- `movementAvatarLowerBody.ts` decides player lower-body drive and ownership.
- Debug metadata uses the same owner labels and retarget fields.

Different today:

- Replay lab feeds saved frames directly into `VrmAvatar`.
- Replay lab builds its source model from the whole stored recording.
- The play route drives the player avatar from live webcam frames.
- The play route depends on a manual calibration window for the player.
- The play route uses `useMovementPlayerTracking` smoothing and live MediaPipe confidence.
- The instructor in the play route advances through `useMovementMatchScoring`, including lag compensation.
- The play route can change behavior through score state, calibration state, preview state, and debug flags.

This means replay lab can prove that a saved recording can drive an avatar, but it does not automatically prove that live practice will behave correctly.

## Non-Negotiable Rules

1. Fix body behavior in shared modules whenever possible.

   Preferred files:

   - `src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts`
   - `src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.ts`
   - `src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBody.ts`
   - `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`
   - small tested helpers extracted from those files

2. Do not add replay-only avatar compensation.

   Replay lab may show diagnostics, source skeletons, frame strips, and captures. It must not own special body-motion rules that bypass the game path.

3. Treat replay lab as a microscope, not a product mode.

   It should explain failures and reproduce them. It should not become a second avatar implementation.

4. Every visual replay fix needs a game-path proof.

   Game-path proof can be:

   - a focused unit test through shared player/live helpers
   - a saved debug-session replay through a game-simulation harness
   - an E2E check against `/demos/movements/[id]/play?debugTracking=1`
   - a manual live check by the user after the automated path passes

5. Labels stay diagnostic.

   Do not make `squat`, `left-knee-raise`, `right-knee-raise`, or `mixed-lower-body` the primary animation source. Use calibrated vectors, body-relative scale, foot contact, and avatar rest-pose mapping.

## Target Pipeline

The same source data should be able to flow through two harnesses:

```text
Stored movement recording
  -> recorded-frame replay harness
  -> shared retargeting
  -> VrmAvatar
  -> replay-lab diagnostics
```

```text
Stored game debug session
  -> game-path simulation harness
  -> player calibration reconstruction
  -> player smoothing / confidence gates
  -> movement lower-body drive
  -> shared retargeting
  -> VrmAvatar
  -> game-path diagnostics
```

The second path is the important missing bridge. It should make recorded game failures replayable without the webcam while still exercising the same decisions the live game uses.

## Phase 1: Parity Audit

Goal: make the replay-vs-game differences explicit in code and tests.

Tasks:

- Create a short parity matrix in code comments or docs that maps each game behavior to its replay-lab equivalent.
- Identify which replay-lab diagnostics come from shared code and which come from route-local analysis.
- Confirm every owner label used in replay lab exists in the game path or is marked as replay-only diagnostics.
- Document the exact files that must be touched for avatar behavior changes.

Acceptance:

- A future agent can answer "does this replay result exercise the game path?" without rereading the whole route.
- Any replay-only diagnostic is named as diagnostic-only.
- No avatar motion logic is added in this phase.

## Phase 2: Game-Path Simulation Harness

Goal: replay stored game debug sessions through the same decisions used by the player avatar.

Input:

- `movementDebugSessions.samplesJson`
- saved `tracking.pose`
- saved `tracking.worldPose`
- saved face/hand payloads when available
- camera metadata
- pose bounds
- body confidence
- calibration quality and baseline summary
- stored owner labels and retarget diagnostics for before/after comparison

Simulation responsibilities:

- Reconstruct or select a neutral calibration sample from the debug session.
- Feed frames through the same shared helpers used by the player path:
  - `buildMovementCalibration`
  - `buildMovementRetargetSourceModel`
  - `getMovementLowerBodyIntent`
  - `solveMovementRetargetFrame`
  - `resolveMovementAvatarLowerBodyDrive`
- Model the same confidence gates used by `VrmAvatar` for lower-body readiness.
- Emit frame-by-frame game-path decisions:
  - lower-body owner
  - feet owner
  - squat depth
  - hip drop
  - knee lift
  - retarget quality
  - foot contacts
  - visual root drop target

Acceptance:

- A saved debug session where the live game falsely squats while the user stands can be replayed without the webcam.
- The harness can fail before a fix and pass after the fix.
- The harness separates source-data failures from game-path decision failures.

## Phase 3: Replay Lab UI Must Show Both Paths

Goal: make visual review honest by showing whether a frame is passing the recorded replay path, the game simulation path, or both.

Replay lab should show:

- `Recorded replay`: saved recording frame driving the avatar.
- `Game simulation`: saved live/debug frame through player calibration and lower-body drive.
- `Source skeleton`: raw landmarks for the selected frame.
- `Owner timeline`: lower body and feet ownership for both paths.
- `Parity flags`: clear warnings when replay passes but game simulation fails.

Suggested labels:

- `replay-pass / game-pass`
- `replay-pass / game-fail`
- `source-fail`
- `calibration-fail`
- `owner-diverged`
- `distance-drift`
- `sticky-squat`
- `false-knee-raise`

Acceptance:

- A user-observed game bug cannot be hidden by a good-looking replay avatar.
- The UI makes route divergence visible.
- The replay lab remains developer/debug tooling, not a public product feature.

## Phase 4: Regression Corpus

Goal: keep fixed game failures from returning.

Sources:

- Synthetic poses under `/demos/movements/squat-proof`.
- Sanitized minimal debug-session fixtures.
- Stored local debug-session exports under `tmp/` for non-committed iteration.

Required cases:

- Standing neutral close to camera.
- Standing neutral after stepping back.
- Real squat after stepping back.
- Squat then recovery to standing.
- Single-knee lift without squat.
- Weak feet but usable hips/knees.
- Lower body out of frame.
- Startup frames that are crouched or low confidence.

Acceptance:

- Shared helper tests cover the pure math and state decisions.
- Replay analyzer tests cover session-level failure detection.
- E2E or visual captures cover at least one game-path replay scenario.
- Real user-derived fixtures are committed only with explicit approval and only after minimization/sanitization.

## Phase 5: Definition Of Done For Avatar Fixes

Any future avatar alignment fix should include:

- Problem statement:
  - source recording/session id, if applicable
  - observed game behavior
  - expected behavior
- Code location:
  - shared helper or `VrmAvatar`
  - no replay-only body-motion patch
- Tests:
  - focused unit tests for the changed helper
  - replay analyzer or game-simulation test for the saved scenario
  - visual/E2E proof when body output changes materially
- Verification:
  - `npm run verify:env`
  - focused tests
  - `npm run eval:movement-avatar` for body-motion changes
  - game route check with `debugTracking=1` when feasible

Do not call a fix complete from replay-lab visuals alone.

## Completed Initial Slice

Overall roadmap: about 65%.
Current slice: game-path simulation harness, synthetic player proof bridge, first regression corpus, and weak-source visual proof complete.

Implemented:

1. Add a pure helper that converts a parsed `movementDebugSessions` sample into game-path lower-body decisions.
2. Reuse `movementReplayAnalyzer` parsing instead of inventing another parser.
3. Add tests with synthetic debug-session frames for standing-close, standing-far, far-squat, squat-recovery, and knee-lift.
4. Add a `gamePath` section to replay analyzer output.
5. Update replay lab to show when `currentFrame.retarget` and recomputed game-path decisions disagree.
6. Extract synthetic player proof poses into shared fixtures and assert their proof-route owner labels match the game-path simulation harness.
7. Add minimized game-path fixtures for weak feet, lower body out of frame, and crouched startup frames.
8. Add synthetic proof route modes for weak-feet standing and lower-body out-of-frame, including owner bridge checks and screenshot/canvas proof coverage.
9. Move player lower-body owner selection into `movementAvatarLowerBody.ts` so `movementGamePathSimulation` and `VrmAvatar` share the same owner contract instead of duplicating shadow decision logic.

Still not proven:

- The actual `/demos/movements/[id]/play?debugTracking=1` route has not yet been driven by deterministic webcam input.
- Replay-lab visuals alone still do not prove the live studio path.
- Manual live-camera smoke on the client movement remains required before calling studio and replay fully unified.

## Immediate Next Slice

Goal: broaden route-level and visual proof after the core owner decisions are stable.

Steps:

1. Add a focused `/demos/movements/[id]/play?debugTracking=1` check only if deterministic player webcam input is added; the current route-level owner proof lives in `/demos/movements/squat-proof`.
2. Add deterministic player webcam input to the play route only if the temporary demo needs true `/play` route parity beyond the synthetic proof surface.
3. Run the full local gate before any merge or push.

## Relationship To Existing Docs

Read these together:

- [Temporary Posture Studio Demo](../../developer/temporary-posture-studio-demo.md) for frozen scope and routes.
- [Movement Demo Retargeting Approach](../../developer/movement-demo-retargeting-approach.md) for avatar body architecture.
- [Movement Demo Replay Lab Plan](./movement-demo-replay-lab-plan.md) for stored-session replay tooling.
- [Movement Tracking](../../developer/movement-tracking.md) for coordinate systems, smoothing, and tracking contracts.

This document adds the missing acceptance rule: replay-lab success must prove game-path success.
