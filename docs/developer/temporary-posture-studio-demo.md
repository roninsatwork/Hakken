# Temporary Posture Studio Demo Developer Guide

The temporary posture studio demo is a frozen movement-capture prototype under `src/app/(dashboard)/demos/`. This guide documents the current user flow and implementation boundaries. Do not refactor, redesign, or expand the frozen implementation unless the user explicitly reopens it or a required quality gate is broken by it.

Frozen implementation paths:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `convex/movements.ts`

Read `docs/developer/movement-demo-retargeting-approach.md` before changing avatar body motion, `VrmAvatar`, lower-body tracking, retargeting, or debug tracking. Also read `docs/developer/movement-demo-game-replay-parity-plan.md` before using replay-lab findings to tune game behavior.

## Product Surface

- `src/app/(dashboard)/demos/movements/page.tsx` renders the Posture Studio Library.
- `src/app/(dashboard)/demos/movement-capture/page.tsx` records routines.
- `src/app/(dashboard)/demos/movements/[id]/page.tsx` renders routine details.
- `src/app/(dashboard)/demos/movements/[id]/play/page.tsx` renders the full-screen practice studio.
- `src/app/(dashboard)/demos/movements/squat-proof/page.tsx` renders deterministic synthetic webcam-to-avatar proof poses for regression evaluation.

The main components and hooks live under `src/app/(dashboard)/demos/movements/_components`, `_hooks`, and `_lib`, plus play-specific components under `src/app/(dashboard)/demos/movements/[id]/play/_components`.

## Backend

`convex/movements.ts` is the only backend module for the demo. It requires an authenticated Convex auth user for list, paginated list, get, create, remove, upload URL generation, and storage URL lookup.

Movement records include title, difficulty, pose data, pose data format, optional storage id, frame count, duration, capture FPS, schema version, creator, and creation timestamp. Supported data formats are `legacy-inline-json`, `legacy-storage-json`, and `storage-json-v1`.

Delete removes the movement record and attempts to delete associated storage-backed pose data when it can infer a storage id.

## Capture Flow

`movement-capture/page.tsx` wires together:

- `react-webcam` for camera input.
- `useMediaPipeVision` for pose, face, and hand landmarker setup.
- `useMovementCapture` for frame capture, recording state, frame count, and tracking quality.
- `MovementCapturePanel` for capture UI.
- `MovementSaveDialog` for title, difficulty, and save state.
- `saveMovementRecording` for storage and Convex record creation.

`MIN_MOVEMENT_CAPTURE_FRAMES` gates saving. Save returns to `/demos/movements` after the record is created.

## Library And Detail Flow

`movements/page.tsx` uses `api.movements.getPaginated` with 15 initial items and optional title search. `MovementLibraryTable` exposes guided preview, live practice, details, and delete actions.

`movements/[id]/page.tsx` loads one movement, fetches frames through `useMovementFrames`, renders `MovementFrameViewer`, summarizes duration and frame count, links to guided preview and live practice, and deletes through `api.movements.remove`.

## Practice Studio Flow

`movements/[id]/play/page.tsx` is a fixed full-screen studio. It loads the movement and frames, initializes MediaPipe, starts in an avatar selector lobby, and then renders instructor and player avatars in `MovementMatchScene`.

The selectable lobby roster comes from `src/lib/constants/avatars.ts`. It currently points to the shipped VRM files under `/models/` and is consumed by the frozen movement match session hook. Documentation updates may describe the roster, but changing the roster or avatar behavior is movement-demo implementation work and remains frozen unless the user explicitly reopens it.

The instructor avatar is driven by recorded frames through `useMovementInstructorPlayback`. The player avatar is driven by live landmarks through `useMovementPlayerTracking`. `useMovementTrackingCalibration` manages player calibration, and `useMovementMatchScoring` updates final score, HUD score, sync, feedback, and completion state.

## Scoring

Scoring runs on a 140ms tick and has two layers.

Per tick, `resolveMovementGameplayEvents` grades the frame:

- It reads `readability.rawMovementStrength` — the source lane, not the display lane. The display lane exists to make the avatar read well on screen and can diverge from the tracked body; `displayAmplification` records that divergence and must never buy points.
- Effort is graded, not pass/fail. Below `0.28` nothing scores; from `0.28` to `0.60` credit ramps from `0.4` to `1.0`.
- `instructorSync` (0-100 joint-angle agreement from `resolveMovementMatchHudFrame`) multiplies the clear-movement award, so following the routine beats moving for its own sake. Below 50% agreement the player is told to follow the coach's shape. Lanes with no instructor reference — replay simulation, solo practice — pass `null` and fall back to effort-only grading, which is what keeps game/replay parity intact.

Across the session, `movementSessionScore.ts` accumulates those ticks into a result:

- `overallPercent` is the headline 0-100, blending coach match, effort, active share, spine hold, and tracking coverage. Every component is an average or a share, so a longer routine cannot outrank a better-performed shorter one. Raw points are still carried as `points` for the HUD.
- Reps are counted with hysteresis (enter at `0.28`, exit at `0.15`) so one movement is one rep.
- Spine is averaged over scoreable ticks and the reported cue is the session's most frequent one. A single well-held frame is not the practice.
- Coach match only accumulates while the player is moving: two people standing still agree perfectly and prove nothing.

`MovementCompletionDialog` renders the headline, grade band, points, reps, coach match, spine hold, movement size, and tracking coverage. Nothing is persisted — the result lives for the length of the session.

Query parameters change behavior:

- `guidedPreview=1` skips calibration, resets playback/scoring, and starts playback automatically once frames are loaded.
- `debugTracking=1` enables source skeleton overlays, retarget debug state, and `MovementDebugFrameScrubber`.
- `/demos/movements/squat-proof?mode=...` selects a synthetic proof pose such as `standing`, `side-bend`, `hands-front`, `squat`, `left-leg-raise`, `right-leg-raise`, `upper-body-auto`, or `upper-body-auto-rejected`.

## Retargeting And Debug Boundaries

Existing developer notes are split by purpose:

- `docs/developer/movement-tracking.md` documents coordinate-system and VRM tracking rules.
- `docs/developer/movement-demo-retargeting-approach.md` documents the required future direction for body-motion work.
- `docs/developer/movement-demo-game-replay-parity-plan.md` documents the acceptance rule that replay-lab fixes must prove themselves against the actual game path.

The current implementation includes source skeleton proof overlays, retarget analysis, exact frame jumps in debug mode, neutral source model selection from the recording, foot contact diagnostics, conservative planted squat handling, and debug metadata for lower-body retargeting. These are part of the frozen demo state and should not be replaced casually.

If future body-motion work is explicitly reopened, preserve the documented direction: source-skeleton proof, neutral calibration, vector retargeting, avatar rest-pose mapping, foot locking, smoothing, and debug comparison. Do not drive body animation primarily from labels such as `squat` or from canned poses.

## Verification

Focused tests exist under the movement demo folders for capture panels, library table, frame viewer, save dialog, frame codec, presentation helpers, retargeting, tracking calibration, instructor playback, match session, hand matching, avatar profiles, scoring, and VRM rigging.

For documentation-only changes, run `git diff --check`. For any reopened implementation work, also run the full repo gate from `AGENTS.md` and manually verify:

- Library search and load-more behavior.
- Capture permission, MediaPipe readiness, recording, save, and return to library.
- Detail frame scrubber and delete confirmation.
- Guided preview route.
- Live practice calibration and scoring.
- `debugTracking=1` source skeleton overlays and exact frame scrubber.

For avatar body-motion work, also run:

```bash
npm run eval:movement-avatar
```

The eval feeds synthetic skeleton poses into the live player avatar path, checks debug baseline/ownership for manual calibration, accepted upper-body auto-baseline, rejected moving auto-baseline, squat, and leg raises, and compares screenshot silhouettes so visually identical avatar modes fail before manual review.
