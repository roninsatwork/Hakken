# Movement Demo Replay Lab Plan

Last reviewed: 2026-07-03
Status: Usable replay loop complete. Further replay-viewer overlays and capture-auth polish are optional follow-up work, not blockers for stored-session iteration.
Audience: agents working on the temporary movement demo after user-recorded debug sessions exposed avatar/body mismatch.

## Purpose

Stop using repeated live user recordings as the main test loop.

The movement demo already stores debug tracking sessions with camera settings, MediaPipe landmarks, world landmarks, body confidence, pose bounds, retarget diagnostics, and avatar ownership metadata. Those sessions should become a replayable test corpus. The engineering loop should move from:

```text
User records live -> agent inspects averages -> agent tweaks code -> user records again
```

to:

```text
Stored debug sessions -> replay/analyze locally -> patch avatar pipeline -> replay/analyze again
```

The target is not just better numbers. The target is an avatar that visibly follows the stored skeleton: arms and head stay responsive, torso returns upright, legs follow the recorded lower-body motion, and feet do not jitter or stay neutral when the source skeleton is usable.

## Current Problem

Recent debug sessions showed mixed evidence:

- Camera constraints now request and receive a wider `1280x960` 4:3 stream.
- Some captures contain strong full-body tracking, including knees and feet.
- Other captures still lose feet/knees when normalized landmarks extend below frame bounds.
- In at least one user-observed run, the avatar squatted but did not stand upright again.
- In another run, live tracking was strong enough for body/legs but the avatar classified the movement as a single-knee raise and kept feet neutral.

This means the failure is no longer only camera framing. The replay lab must identify which layer is failing per frame:

- source tracking data
- calibration / neutral model
- intent classification
- retarget solve
- avatar ownership switching
- visual smoothing / hold / fallback
- foot lock and floor correction

## Scope

Build a developer-only replay and analysis workflow for `movementDebugSessions`.

In scope:

- Export or load saved debug sessions from Convex dev data.
- Parse `samplesJson` into typed replay frames.
- Feed stored landmarks through the same pure movement analysis helpers used by the live avatar path.
- Report frame-by-frame and session-level failures.
- Add regression tests around the worst stored scenarios.
- Add a debug-only replay page or tool after the analyzer proves useful.

Out of scope for the first slice:

- Rebuilding the movement demo UI.
- Replacing MediaPipe.
- Refactoring unrelated movement-library pages.
- Production-facing replay features.
- Training an ML model.

## Principles

- The raw source skeleton is the truth for this task. If the source skeleton shows a squat/stand, the avatar should not invent a knee raise.
- Labels are diagnostics, not the primary animation source.
- Avatar behavior should be driven by calibrated source vectors, foot contact, and confidence-gated retarget data.
- Smoothing must reduce jitter without hiding recovery to neutral.
- A replay failure should produce a concrete reason, not only a score.
- The replay harness should use stored user sessions as fixtures only in local/dev tooling unless the user explicitly asks to commit sanitized fixtures.

## Closed Iteration Loop

The replay lab should behave like a repeatable optimization loop, not a one-time inspection tool.

Important parity rule: replay-lab success is not enough by itself. Use [Movement Demo Game And Replay Parity Plan](./movement-demo-game-replay-parity-plan.md) as the acceptance gate for any avatar/body fix found through the replay lab. A replay-lab fix should land in shared movement code or pass a game-path simulation before it is considered done.

Loop:

```text
select stored recordings
  -> replay/analyze every selected session
  -> group failures by cause
  -> patch the smallest responsible module
  -> run focused tests
  -> replay/analyze the same sessions again
  -> compare before/after metrics and frame flags
  -> repeat until the pass criteria are met across the recording set
```

The user should not need to make another recording for each tweak. New live recordings should be requested only when the stored corpus no longer covers the failure being investigated.

The loop should track each iteration with:

- code change summary
- sessions replayed
- failure counts before and after
- owner transition counts before and after
- stand recovery time before and after
- false knee-raise frames before and after
- feet-neutral-while-leg-motion frames before and after
- screenshots or frame strips for the key before/after moments once the visual viewer exists

The aim is to make progress measurable. "Looks better" is useful feedback, but a replay iteration should also show whether the same stored frames now pass.

Initial pass criteria:

- At least three recent stored sessions replay without parser errors.
- Strong full-body sessions keep lower-body ownership stable through squat and stand recovery.
- Stand recovery returns to neutral within the agreed frame window after the source skeleton stands upright.
- False single-knee labels are not allowed to override strong squat/stand evidence.
- Feet do not stay neutral when source feet and leg vectors are confidently available.
- Weak or out-of-frame lower-body sessions are reported as source-data failures, not silently treated as avatar failures.

Do not claim the movement demo is "perfect" from the loop alone. Claim it is ready for another user-facing check when the selected stored recordings pass the criteria and the visual replay shows no obvious body/feet mismatch.

## Data Sources

Primary table:

- `movementDebugSessions`

Relevant fields:

- `movementId`
- `trigger`
- `sampleCount`
- `durationMs`
- `startedAt`
- `endedAt`
- `baselineSummary`
- `warningSummary`
- `samplesJson`

Relevant sample fields already observed:

- `tracking.pose`
- `tracking.worldPose`
- `tracking.leftHand`
- `tracking.rightHand`
- `camera`
- `poseBounds`
- `bodyConfidence`
- `fallbacks`
- `retarget`
- `health`
- `headRaw`
- `headApplied`
- `calibrationQuality`

Useful local inspection command:

```bash
npx convex data movementDebugSessions --limit 10 --order desc --format json
```

If Convex CLI telemetry/network reporting fails in the sandbox, retry with local approved tooling or export once into `tmp/` for analysis. Do not commit raw user debug dumps unless explicitly requested.

## Phase 1: Session Export And Parser

Goal: make stored sessions easy to inspect without manual JSON scrolling.

Deliverables:

- A local script, for example `scripts/movement-debug/export-replay-sessions.mjs`, that fetches recent `movementDebugSessions`.
- A parser module that turns `samplesJson` into typed replay frames.
- A compact summary output for each session:
  - session id
  - time
  - duration
  - sample count
  - camera mode
  - average pose bounds
  - average body confidence
  - owner transitions
  - lower-body labels
  - retarget quality range
  - stand/squat/leg-raise state transitions

Acceptance:

- Running the script prints the latest sessions without requiring a browser.
- It flags malformed sessions clearly.
- It can write temporary JSON summaries under `tmp/movement-replay-lab/`.

## Phase 2: Pure Replay Analyzer

Goal: detect the exact failure modes seen in the user recordings.

The analyzer should run over saved frames and emit failures such as:

- `source_lower_body_out_of_frame`
- `source_feet_weak`
- `squat_not_detected`
- `stand_recovery_missing`
- `knee_raise_false_positive`
- `lower_body_owner_flicker`
- `feet_neutral_while_leg_motion_present`
- `retarget_quality_drop`
- `squat_hold_too_sticky`
- `foot_lock_drift_high`

Metrics:

- percent of frames with full-body confidence above threshold
- max and average out-of-frame landmarks
- number of owner transitions per second
- longest neutral recovery time after squat depth falls
- frames where knees/feet are visible but avatar feet stay neutral
- frames where one-knee label wins without matching foot/ankle evidence

Acceptance:

- The analyzer explains the recent "squatted but did not stand up again" session.
- It separates source-data problems from avatar-code problems.
- It exits non-zero only when run in strict mode, so it can be used both for exploration and tests.

## Phase 3: Regression Fixtures And Tests

Goal: turn the worst failures into repeatable local tests.

Approach:

- Create sanitized minimal fixtures from stored sessions:
  - keep only fields required by pure analysis
  - remove user identity and unnecessary raw hand detail unless needed
  - shorten to key frames: neutral, squat, deepest squat, stand recovery, false knee raise
- Store fixtures only after explicit approval if they contain real user-derived pose data. Otherwise keep them under `tmp/`.
- Add tests around pure functions first:
  - intent classification
  - retarget frame solve
  - lower-body drive state
  - replay analyzer state transitions

Acceptance:

- A false knee-raise replay case fails before the fix and passes after.
- A squat/stand replay case proves the avatar state returns to neutral within an agreed frame window.
- Tests do not require webcam, browser camera permission, or Convex auth.

## Phase 4: Replay Viewer

Goal: visually replay stored sessions inside the app without asking the user to record again.

Suggested route:

- Debug-only page under the movement demo area, guarded behind development/debug mode.

Viewer layout:

- Session selector.
- Timeline scrubber.
- Source skeleton.
- Avatar response.
- Frame diagnostics panel.
- Owner timeline for head / torso / lower / feet.
- Confidence and pose-bounds charts.

Controls:

- play / pause
- step frame
- jump to flagged failure
- toggle smoothing on/off
- toggle retarget vs legacy fallback
- show raw source skeleton over avatar

Acceptance:

- A saved session can be replayed without the webcam.
- The same frame can be replayed after a code change.
- Flagged analyzer frames are easy to inspect visually.

## Phase 5: Visual Regression Capture

Goal: produce proof artifacts without manual screen observation.

Deliverables:

- Playwright or Three.js capture script for key replay frames.
- Frame strip output under `tmp/movement-replay-lab/`.
- Optional pixel or pose-proxy checks:
  - avatar upright at neutral frames
  - avatar lower body bent at squat frames
  - avatar returns upright after stand recovery

Acceptance:

- The script captures before/after frame strips for the same stored session.
- The user can see whether the avatar improved without making a new recording.
- The capture does not become a required production gate until it is stable.

## Implementation Notes

Prefer pure modules before browser work:

- `movementDebugReplay.ts` for parsing and summarizing sessions.
- `movementReplayAnalyzer.ts` for state/failure detection.
- Existing modules should remain the source of truth:
  - `movementTrackingCalibration.ts`
  - `movementRetargeting.ts`
  - `movementAvatarLowerBody.ts`
  - `movementAvatarPlayerDrive.ts`

Avoid duplicating live avatar logic in the analyzer. Where visual-only logic currently lives inside `VrmAvatar.tsx`, extract small pure decisions only when needed, such as:

- lower-body owner selection
- squat hold/release state
- leg-raise gating
- retarget-vs-neutral fallback decision

Do not broad-refactor the movement demo while building the lab. Keep changes small and aimed at making the replay loop useful.

## Initial Failure Cases To Encode

Use the recent sessions as named scenarios:

- `wide-camera-good-body`: 1280x960, high knees/feet confidence, high source quality, all or most lower-body segments solved.
- `wide-camera-feet-out-of-frame`: 1280x960, strong torso/hips but feet below normalized frame, lower body rejected.
- `squat-hold-sticky`: avatar enters squat but does not recover to upright quickly enough.
- `false-right-knee-raise`: source skeleton has usable full body, but lower-body owner becomes `player-right-leg-raise` while feet remain neutral.
- `neutral-leg-noise`: standing frames with low-amplitude leg noise should not move feet or trigger lower-body ownership changes.

## Done Criteria

The replay lab is useful when an agent can:

1. Pull the latest stored sessions.
2. Run one command to summarize failures.
3. Run tests for known bad sessions.
4. Replay a session visually without the user recording.
5. Patch the retarget/avatar code.
6. Re-run the same replay and see whether the failure is resolved.

The movement demo is ready for another user recording only after the replay lab shows:

- squat starts when the source skeleton squats
- stand recovery returns to neutral within the frame window
- lower-body owner does not flicker excessively
- feet are not neutral when strong foot/leg vectors are available
- false knee-raise classifications are gated by matching foot/ankle evidence

## Suggested First Task

Build Phase 1 and the non-visual part of Phase 2:

```text
convex movementDebugSessions
  -> local replay-session parser
  -> summary report
  -> failure labels for stand recovery, knee-raise false positives, and foot/leg ownership
```

Once that works on the stored sessions, use the analyzer output to decide the next code fix instead of asking for another live recording.

Status:

- Added `movementDebugReplay.ts` to parse stored debug-session rows and samples.
- Added `movementReplayAnalyzer.ts` to recompute current-code lower-body decisions from saved pose frames and emit replay failure labels.
- Added `movementReplayAnalyzer.test.ts` for stable squat/stand recovery, false knee raise, out-of-frame lower body, sticky squat recovery, and owner flicker cases.
- Added `npm run movement:replay:analyze` to fetch recent `movementDebugSessions`, run the analyzer, print a report, and optionally write JSON under `tmp/movement-replay-lab/`.
- Added `npm run movement:replay:compare` to compare two analyzer JSON files and report pass/fail, warning/error, failure-code, and metric deltas between replay iterations.
- Added `npm run movement:replay:iteration` to run a timestamped replay analysis, compare it with the previous run when available, write a Markdown summary report, and update `tmp/movement-replay-lab/runs/latest-analysis-path.txt`.
- Added `scripts/movement-debug/README.md` as the runbook for the replay iteration workflow.
- Latest local run against five stored sessions passed with zero current-code errors and only source-data warnings for the out-of-frame recording.
- Added `getDebugTrackingSession` in `convex/movements.ts` so the app can fetch full sample payloads for a selected debug session.
- Added `/demos/movements/replay-lab` as the first visual replay viewer: session picker, frame scrubber, source skeleton canvas, VRM avatar replay scene, current frame diagnostics, and current-code analyzer flags.
- Added a Replay Lab entry point from the movement library header.
- Added in-page capture controls for the visual viewer:
  - `Scene PNG` captures the current avatar replay frame.
  - `Source Strip` captures key source skeleton frames from the same stored recording.
- Added `npm run movement:replay:capture` for Playwright proof captures from `/demos/movements/replay-lab`; it writes avatar/source frame PNGs and a manifest under `tmp/movement-replay-lab/captures/`.
  - It supports `--storage-state` for an existing authenticated browser state.
  - It supports `--local-test-auth` when Next and Convex dev are started with `LOCAL_TEST_AUTH_ENABLED=1`.
- Added deterministic replay-lab E2E coverage:
  - `src/e2e/convexReactMock.tsx` now includes a mock debug replay session.
  - `e2e/movement-demo-authenticated.spec.ts` verifies the replay lab, session picker, frame timeline, source canvas, avatar section, and capture buttons.
  - Focused run passed on 2026-07-03: `npx -p node@22.13.0 npm run test:e2e -- --project=super-admin e2e/movement-demo-authenticated.spec.ts -g "replay lab"`.
- Optional follow-up: improve the avatar replay scene with side-by-side camera presets and richer owner/confidence overlays.
- Optional follow-up: decide whether to keep real-session capture auth manual or always run captures through local-test auth.
