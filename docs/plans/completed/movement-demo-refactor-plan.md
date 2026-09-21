> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Movement Demo Refactor Plan

Last reviewed: 2026-06-03
Status: implementation substantially complete; pending signed-in real-camera smoke and tuning
Scope note: the previous movement-demo freeze is explicitly lifted for this work by user request on 2026-06-03. This plan covers only the movement demo and its direct support code.

## Goal

Make the movement demo sustainable enough to maintain, demo, debug, and extend without turning it into a full production fitness product. The target is a stable client-facing demo with clear data contracts, reusable motion utilities, safer storage behavior, better recovery states, and focused regression tests.

## Current Surface

Routes and files:

- `src/app/(dashboard)/demos/movements/page.tsx`
  - Movement library table, search, client-side pagination, delete modal.
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - Webcam capture, MediaPipe triad init, smoothing, canvas skeleton overlay, upload, save modal.
- `src/app/(dashboard)/demos/movements/[id]/page.tsx`
  - Movement detail page, frame loading, canvas preview, scrubber, delete.
- `src/app/(dashboard)/demos/movements/[id]/play/page.tsx`
  - 3D match/play experience, MediaPipe tracking, VRM avatar rigging, scoring, HUD, completion flow.
- `src/app/(dashboard)/demos/movements/[id]/play/_components/AvatarSelectorLobby.tsx`
  - Avatar selection lobby.
- `src/app/(dashboard)/demos/movements/_components/PreviewModal.tsx`
  - Modal preview of movement frames.
- `src/app/(dashboard)/demos/movements/_components/AvatarPreview.tsx`
  - Standalone VRM preview component.
- `convex/movements.ts`
  - Authenticated movement CRUD and storage URL helpers.
- `convex/schema.ts`
  - `movements` table: `title`, `difficulty`, `poseData`, `createdAt`.
- `convex/movements.test.ts`
  - Auth hardening tests only.
- `docs/developer/movement-tracking.md`
  - Existing coordinate-system notes for MediaPipe, VRM, Kalidokit, and Three.js.

## Current Data Flow

1. User opens the library at `/demos/movements`.
2. Library calls `api.movements.list`, which authenticates then collects every movement.
3. Capture page initializes Pose, Face, and Hand MediaPipe models from external CDN/model URLs.
4. Capture loop reads webcam frames, smooths pose/hand data with `PoseFilterWrapper`, draws a skeleton, and appends frames to a ref while recording.
5. Save uploads raw frame JSON to Convex storage, then creates a movement row where `poseData` stores the storage ID string.
6. Legacy records may store direct JSON in `poseData`; UI code detects this with `poseData.startsWith("[")`.
7. Detail, preview, and play pages each load and parse movement frames independently.
8. Play page loads instructor frames, starts webcam tracking, rigs two VRM avatars, compares player angles to instructor angles, mutates DOM for score/sync display, and shows completion state.

## Main Findings

### Data And Backend

- `api.movements.list` is authenticated but unbounded and returns all records.
- `api.movements.getPaginated` exists but is not used by the library page.
- Movement records are intentionally shared demo assets. Any authenticated user can list, get, delete, and play demo records.
- `poseData` is overloaded. It can mean a storage ID or legacy JSON string.
- Storage metadata such as frame count, duration, version, capture FPS, and schema version is not stored on the movement row.
- Deletes remove the movement row but do not remove the associated storage object.
- Difficulty is a free string, not a constrained value.
- Uploads are client-side JSON blobs with no size/shape validation before create.

### Client Architecture

- `movement-capture/page.tsx` is a 420-line page that owns model loading, camera lifecycle, capture state, smoothing, skeleton drawing, upload, and save UI.
- `movements/[id]/play/page.tsx` is 1,449 lines and combines:
  - movement frame loading,
  - MediaPipe init,
  - webcam loop,
  - smoothing,
  - avatar loading,
  - VRM rigging,
  - Kalidokit solving,
  - scoring,
  - feedback,
  - HUD rendering,
  - session completion.
- Detail and preview duplicate frame loading and skeleton drawing.
- Capture and play duplicate MediaPipe triad initialization.
- Play has two `Webcam` instances using the same `webcamRef`: one hidden tracker and one picture-in-picture preview. This is fragile and can bind the ref to the wrong instance.
- Play and detail mutate DOM directly via `document.getElementById` for score, sync, scrubber labels, and calibration status.
- Play contains two session-complete modal implementations in the same component.
- Console error monkey-patching for MediaPipe logs is duplicated across capture and play.
- Rendering math, UI state, and side effects are intertwined, making small visual changes risky.

### Usability

- Library search is client-side only and depends on loading all movements first.
- Capture gives limited guidance on camera permission, model loading, tracking quality, frame count, and whether the recording is valid enough to save.
- Save allows empty or very short recordings if a title exists.
- Upload/save failure only logs to console.
- Detail page reports corrupted data but cannot retry or show why parsing failed.
- Play loading states do not distinguish movement loading, frame loading, model loading, camera permission, or avatar loading.
- The avatar lobby visual language says "fighter/combatants", which does not match the Pilates/demo framing.
- Play HUD is visually intense and less usable on small screens.

### Test Coverage

Covered today:

- Anonymous users cannot call movement CRUD/storage helpers.
- Authenticated users can create/list/get/delete a movement.

Not covered:

- Tenant isolation for movement records.
- Paginated library queries.
- Pose data contract parsing.
- Storage ID versus legacy JSON handling.
- Frame loading from storage.
- Skeleton drawing data normalization.
- MediaPipe model lifecycle.
- Recording start/stop/save validation.
- Scoring math.
- Avatar selection.
- Play session lifecycle.
- Camera permission and model-load failure states.
- Browser smoke test for `/demos/movements`, `/demos/movement-capture`, detail, and play routes.

## Refactor Principles

- Keep behavior stable first; change internals before changing the demo experience.
- Preserve existing routes so current links do not break.
- Split pure math and data-shape code before touching WebGL or MediaPipe loops.
- Add tests around each seam before moving the riskiest code.
- Do not introduce load tests for this demo. Use unit tests, focused component tests, and a lightweight browser smoke test.
- Do not expand the demo into a new product area until the current demo is maintainable.

## Implementation Progress

Completed on 2026-06-03:

- Added this documented plan and linked it from `docs/index.md`.
- Added shared movement frame types, frame codec, frame loader hook, and skeleton drawer.
- Updated detail and preview surfaces to share frame loading and skeleton drawing.
- Updated new captures to save a versioned storage JSON envelope and movement metadata.
- Added Convex movement metadata fields, constrained difficulty values, search index, paginated/search query support, and storage cleanup on delete.
- Updated the library to use paginated/search loading instead of fetching every movement at once.
- Added pure movement scoring utilities and regression tests for angle sync, tolerance decay, hand aperture, expression bonus, and combo scoring.
- Removed direct DOM score/sync/calibration mutations from play in favor of throttled React state.
- Removed the duplicate play webcam and duplicate completion modal.
- Added shared MediaPipe configuration constants for capture and play.
- Added shared hand-side matching logic with unit coverage and switched capture/play to use it.
- Switched play frame loading to the shared `useMovementFrames` hook.
- Added `useMediaPipeVision` for shared Pose/Face/Hand model loading, teardown, retry, and MediaPipe console-noise suppression.
- Switched capture and play to use `useMediaPipeVision`, including readiness guards and retry UI for model-load failures.
- Added `useMovementCapture` for capture webcam processing, smoothing filters, frame buffering, frame count, tracking quality, and skeleton drawing.
- Slimmed the capture route down to UI, model status, save modal state, and the Convex save mutation.
- Added `saveMovementRecording` for capture save validation, storage upload, upload response validation, metadata calculation, and movement creation.
- Added user-facing save errors and a minimum valid-frame save guard in the capture modal.
- Extracted the play HUD into `MovementHud`, including score, sync, playback readiness, retry action, and webcam picture-in-picture.
- Extracted the play completion modal into `MovementCompletionDialog`.
- Extracted the play Canvas, lighting, controls, and training grid into `MovementMatchScene`.
- Added `useMovementPlayerTracking` for the play route's live webcam MediaPipe loop, smoothing filters, hand matching, and live landmark ref updates.
- Added `useMovementInstructorPlayback` for instructor frame cursor state, smoothing filters, lag-compensated frame selection, and reset behavior.
- Added `vrmRigging` helpers for VRM landmark normalization, instructor mirroring, Kalidokit pose/hand solving adapters, and pure regression coverage.
- Extracted play scene actors into `VrmAvatar` and `MovementSparkles`, leaving the route focused on session orchestration.
- Added `useMovementMatchScoring` for the play animation loop, score/combo refs, HUD score state, feedback timeout, and completion state.
- Extracted the play feedback burst into `MovementFeedbackOverlay`; the play route is now mostly session orchestration and composition.
- Updated the avatar lobby from combat framing to movement-practice framing, made it responsive, added pressed-state semantics for avatar choices, and covered those interactions in component tests.
- Added component regression coverage for play lobby selections, completion actions, feedback overlay visibility, HUD readiness/error states, and the accessible play toggle.
- Added `useMovementMatchSession` to isolate lobby state, avatar URLs and display names, playback toggling, calibration reset, and rematch/exit reset behavior from the play route.
- Added hook regression coverage for lobby transitions, avatar name resolution, vision-gated playback, and reset/rematch behavior.
- Extracted the movement library table and delete confirmation into `MovementLibraryTable` and `MovementDeleteDialog`.
- Added component regression coverage for library loading/empty states, row actions, pagination, and delete confirmation actions.
- Extracted detail/preview skeleton playback into `MovementFrameViewer` and reused `MovementDeleteDialog` on the detail page.
- Added component regression coverage for viewer loading, error, empty, scrubber, and compact modal controls.
- Extracted the capture save modal into `MovementSaveDialog`.
- Added component regression coverage for capture save dialog title, difficulty, minimum-frame guidance, save disabling, saving, and error states.
- Extracted the capture camera/model/status controls into `MovementCapturePanel`.
- Added component regression coverage for camera permission guidance, model status, frame/tracking stats, retry action, and recording button states.
- Added repeatable unauthenticated browser smoke coverage for the movement library, capture, detail, and play routes. These routes must now return a non-5xx shell or redirect cleanly to login with no client errors.
- Added deterministic e2e movement fixture data and authenticated browser smoke coverage for the movement library, capture shell, detail viewer, and play avatar lobby.
- Updated the e2e Convex React mock to avoid auth-user hydration mismatch noise by deferring cookie-dependent user data until the client has hydrated.
- Added a dedicated signed-in manual smoke checklist for the real camera and MediaPipe tracking paths: `docs/operator/movement-demo-manual-smoke-checklist.md`.
- Confirmed movement recordings remain shared demo assets for all authenticated users, not tenant-scoped production assets.
- Tuned live and captured hand tracking after manual smoke: player hands are no longer forcibly mirrored before Kalidokit solving, hand smoothing is more responsive, and finger rotations are applied with stronger player-side curl.
- Added the whole-body tracking follow-up plan covering calibration, head/neck accuracy, arm/hand chains, torso/hips/legs/feet, avatar profiles, debug tooling, and manual smoke requirements.
- Added session calibration before match play with weak-tracking rejection, progress, sample count, and HUD recalibration.
- Added face-preferred head solving, neutral calibration offsets, avatar profile head/neck clamps, and explicit head pitch/yaw/roll clamp-pressure diagnostics.
- Added confidence-aware arm, wrist, hand, knee, foot, floor, and last-good fallback selection with debug visibility.
- Added full-body avatar tracking profiles for each selectable VRM so avatar-specific tuning lives in profile config rather than scattered rig-loop literals.
- Added a compact `?debugTracking=1` overlay with readiness score, frame age, primary tuning action, calibration quality, body-part confidence, fallback sources, health warnings, and stale-frame detection.
- Added health diagnostics for missing/weak calibration, stale tracking, head clamp pressure, arm endpoint weakness/imbalance/last-good holding, knee correction, foot confidence/imbalance/last-good holding, and fixed-floor fallback.
- Expanded regression coverage for calibration math, head calibration, limb source selection, knee guards, floor correction, avatar profiles, health summaries, play components, capture components, library/detail components, and browser smoke shells.

Remaining highest-value work:

- Run the full manual smoke checklist in a real signed-in browser session with camera access.
- Use `?debugTracking=1` during the live pass to tune head offsets, right/left arm balance, hand responsiveness, foot/floor behavior, and avatar profile values.
- Re-run `npm run build` after the real-camera tuning pass and before staging/pushing the refactor.

## Target Architecture

Proposed file layout:

```text
src/app/(dashboard)/demos/movements/
  page.tsx
  _components/
    MovementLibraryTable.tsx
    MovementDeleteDialog.tsx
    MovementFrameCanvas.tsx
    MovementPlaybackControls.tsx
    MovementCapturePanel.tsx
    MovementSaveDialog.tsx
    MovementLoadingState.tsx
    MovementErrorState.tsx
  _hooks/
    useMovementFrames.ts
    useMovementCapture.ts
    useMovementInstructorPlayback.ts
    useMovementMatchScoring.ts
    useMediaPipeVision.ts
    useMovementPlayback.ts
    useMovementScoring.ts
  _lib/
    movementTypes.ts
    movementFrameCodec.ts
    movementSkeleton.ts
    movementScoring.ts
    mediaPipeConfig.ts
    handMatching.ts
    vrmRigging.ts
```

Keep the route files thin:

- Library route: query, search state, render table.
- Capture route: call `useMovementCapture`, render capture panel and save dialog.
- Detail route: call `useMovementFrames`, render `MovementFrameCanvas` and playback controls.
- Play route: orchestrate session state and render smaller `MovementMatchScene`, `MovementHud`, `AvatarSelectorLobby`, and completion modal.

## Proposed Data Contract

Keep backwards compatibility but stop adding ambiguous records.

New movement row shape to migrate toward:

```ts
{
  title: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  poseData: string; // legacy compatibility only
  poseStorageId?: Id<"_storage">;
  poseDataFormat?: "legacy-json" | "storage-json-v1";
  frameCount?: number;
  durationMs?: number;
  captureFps?: number;
  schemaVersion?: 1;
  createdBy?: Id<"users">;
  createdAt: number;
  updatedAt?: number;
}
```

Frame payload v1:

```ts
{
  schemaVersion: 1;
  capturedAt: number;
  fps: number;
  frames: MovementFrame[];
}
```

The loader should support:

- Legacy direct array JSON from `poseData`.
- Legacy storage JSON array from `poseData`.
- New storage JSON object `{ schemaVersion, fps, frames }`.

## Phased Plan

### Phase 0: Safety Harness

Goal: make the current behavior observable before moving code.

Tasks:

- Add `docs/plans/active/movement-demo-refactor-plan.md` and link it from `docs/index.md`.
- Add a quality-drift exception note that movement demo scope is explicitly reopened by this plan.
- Add tests for pure frame parsing once the codec exists.
- Add browser smoke test stubs or a manual checklist for:
  - library route loads,
  - capture route shows model/camera state,
  - detail route handles missing/corrupt data,
  - play route reaches lobby without crashing.

Verification:

- `npm run lint:all`
- `npm run check`
- `npm run build`
- `git diff --check`

### Phase 1: Backend And Data Contract

Goal: remove unbounded and ambiguous backend behavior without breaking existing recordings.

Tasks:

- Replace library use of `api.movements.list` with `api.movements.getPaginated`.
- Decide scope:
  - if movement recordings are shared demo assets, make them super/admin managed and read-only for normal users;
  - keep demo recordings globally visible to authenticated users unless this route graduates into a production product surface.
- Add `listPaginated` or update `getPaginated` to support search and server-side pagination.
- Constrain `difficulty` with Convex validators.
- Add optional metadata fields: `poseStorageId`, `poseDataFormat`, `frameCount`, `durationMs`, `captureFps`, `schemaVersion`, `createdBy`.
- Update create mutation to accept structured metadata while still writing `poseData` for compatibility if needed.
- Add deletion behavior for associated storage once storage IDs are explicit.
- Add tests for:
  - pagination,
  - authorization/tenant access,
  - create validation,
  - delete behavior,
  - legacy records still readable.

Exit criteria:

- Library no longer fetches all movement rows.
- New records are unambiguous.
- Existing records still load.

### Phase 2: Frame Codec And Canvas Utilities

Goal: create one source of truth for loading, validating, and drawing movement frames.

Tasks:

- Add `movementTypes.ts` for frame, hand, blendshape, and metadata types.
- Add `movementFrameCodec.ts`:
  - `parseMovementFramePayload`,
  - `isLegacyFrameArray`,
  - `normalizeMovementFrame`,
  - `getFrameLandmarks`,
  - `getFrameMetadata`.
- Add `movementSkeleton.ts`:
  - shared pose connections,
  - visibility threshold,
  - `drawMovementSkeleton`.
- Replace duplicated frame loading in detail and preview with `useMovementFrames`.
- Replace duplicated canvas skeleton drawing in capture, preview, and detail with the shared drawer.
- Keep visual output close to current neon skeleton initially.

Tests:

- Parse legacy direct array JSON.
- Parse storage payload object.
- Reject invalid/corrupt payloads with a typed error.
- Normalize `{ landmarks }` frames and raw array frames.
- Keep skeleton draw unit tests light: validate calls with a mocked canvas context rather than screenshotting.

Exit criteria:

- Detail and preview use the same loader and drawer.
- Corrupt data has a consistent error state.

### Phase 3: MediaPipe And Capture Extraction

Goal: separate camera/model lifecycle from capture UI.

Tasks:

- Add `mediaPipeConfig.ts` for model URLs, confidence thresholds, and delegates.
- Add `useMediaPipeVision`:
  - load/close Pose, Face, Hand models,
  - expose statuses: `idle`, `loading`, `ready`, `failed`,
  - expose error message and retry.
- Add `useMovementCapture`:
  - own webcam processing loop,
  - own recording frame buffer,
  - expose frame count, elapsed time, tracking quality, start/stop/reset.
- Extract hand side matching into `handMatching.ts`.
- Extract capture save into a small `saveMovementRecording` flow or hook.
- Add save guards:
  - title required,
  - minimum frame count,
  - valid core landmark visibility,
  - upload response validation.
- Replace console-only failures with in-app feedback.
- Keep one webcam element per capture surface.

Tests:

- Hook/unit tests for capture state transitions where practical.
- Pure tests for hand side matching.
- Component tests for save disabled states and failure states.

Exit criteria:

- Capture page route is mostly composition.
- Model/camera states are visible and recoverable.
- Save cannot create empty recordings.

### Phase 4: Detail And Library Usability

Goal: make stored recordings easier to find, inspect, and manage.

Tasks:

- Move library table into `MovementLibraryTable`.
- Use server-side pagination/search.
- Show frame count, duration, data format, created date, and owner/scope when available.
- Add explicit row actions:
  - Play,
  - Details,
  - Delete.
- Keep 15 rows per page, matching admin table conventions.
- Add a retry button in detail frame loading errors.
- Use React state for scrubber label instead of DOM mutation.
- Add a single reusable delete dialog.

Tests:

- Library empty/loading/search states.
- Pagination argument checks.
- Detail loading/error/success states with mocked frame loader.

Exit criteria:

- Library stays fast with many records.
- Detail and preview share components and have no direct DOM mutation.

### Phase 5: Play Page Decomposition

Goal: reduce the 1,449-line play page into maintainable modules without changing the demo flow.

Tasks:

- Extract pure scoring to `movementScoring.ts`:
  - angle calculation,
  - mirrored joint mapping,
  - aperture bonus,
  - expression bonus,
  - combo update.
- Extract VRM rigging helpers to `vrmRigging.ts`:
  - landmark normalization,
  - mirroring,
  - root rotation,
  - FK limb application,
  - hand/finger mapping.
- Extract `MovementMatchScene` for Three.js canvas and avatars.
- Extract `MovementHud` for score/sync/play controls.
- Extract `MovementCompletionDialog`; remove duplicate completion modal.
- Use a single webcam instance for tracking and preview.
- Replace `document.getElementById` score/sync/calibration updates with a small external store or throttled React state.
- Add typed session states:
  - `lobby`,
  - `loadingModels`,
  - `cameraRequired`,
  - `ready`,
  - `playing`,
  - `complete`,
  - `error`.

Tests:

- Pure scoring tests for perfect match, tolerance decay, hidden joints ignored, hand aperture bonus, smile bonus, combo reset.
- Component smoke tests for lobby, HUD, and completion dialog.
- Browser smoke test for play route reaching the lobby and opening the match scene with mocked or skipped camera where possible.

Exit criteria:

- Play route file is an orchestrator, not the implementation.
- Scoring math can be changed safely.
- One webcam ref controls one webcam element.
- No duplicate session-complete UI.

### Phase 6: Visual And UX Pass

Goal: keep the demo impressive while making it clearer and more coherent.

Tasks:

- Rename the lobby language from combat/fighter terms to movement/demo/trainer terms unless the client specifically wants arcade combat framing.
- Improve responsive layout for play HUD and lobby.
- Add clearer readiness steps:
  - camera permission,
  - model loaded,
  - body detected,
  - recording valid,
  - movement loaded.
- Add a low-motion or fallback mode for devices that cannot initialize GPU MediaPipe or WebGL.
- Add "try again" flows for camera/model/frame failures.
- Keep visual styling aligned with Hakken UI where possible, while allowing the demo to stay more expressive than the operational admin surfaces.

Tests:

- Component tests for status messages and buttons.
- Browser screenshot smoke on desktop and mobile viewports for library, capture, lobby, and detail.

Exit criteria:

- The demo is usable without developer coaching.
- Failure states tell the user what to do next.

### Phase 7: Optional Cleanup Or Promotion Decision

Goal: decide whether this stays a demo or becomes a supported product surface.

If it stays a demo:

- Keep it behind a feature flag.
- Keep docs clear that it is demo-grade.
- Keep data retention limited.

If it becomes product:

- Keep tenant isolation out of this demo unless it graduates into a production product surface.
- Add upload policy coverage to `docs/developer/upload-and-knowledge-policy.md`.
- Add audit logs for create/delete.
- Add storage cleanup/backfill.
- Add richer e2e coverage with mocked camera inputs.

## Proposed Work Order

Recommended first implementation batch:

1. Add movement frame codec and tests.
2. Switch detail and preview to shared loader/drawer.
3. Switch library to paginated/search query.
4. Add metadata fields and create validation.
5. Extract MediaPipe model lifecycle hook.
6. Extract capture hook and save flow.
7. Extract scoring pure functions.
8. Decompose play UI and scene.

This order reduces risk because backend/data parsing gets stable before the most fragile 3D page is touched.

## Verification Gates

Run after each implementation batch:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

For visual/browser changes, also run or manually perform:

```bash
npm run test:e2e
```

Manual smoke checklist:

- Run `docs/operator/movement-demo-manual-smoke-checklist.md` in a real signed-in browser session with camera access enabled.

## Open Decisions

1. Resolved: movement recordings are shared demo assets for all authenticated users and are not company-scoped.
2. Should normal users be allowed to delete recordings, or should this be admin-only?
3. Resolved: the lobby is reframed as a movement-practice demo rather than combat/fighter framing.
4. Should legacy direct-JSON records be migrated or only supported as read-only compatibility?
5. Resolved for now: e2e remains lightweight route/shell smoke with deterministic fixtures; real camera/model tracking uses the manual smoke checklist.

## Definition Of Done

- Movement demo routes still exist and remain usable.
- New movement records use an explicit data format.
- Library no longer loads all records client-side.
- Detail and preview share frame loading and canvas rendering utilities.
- Capture model/camera lifecycle is isolated behind hooks.
- Play page is decomposed enough that scoring, rigging, HUD, lobby, and session completion can be modified independently.
- Direct DOM mutations are removed from detail and play.
- Duplicate webcam ref and duplicate completion modal are removed.
- Tests cover frame parsing, scoring, movement API authorization/scope, pagination, tracking calibration, avatar profiles, health diagnostics, and key UI states.
- The whole-body debug overlay explains head, arm, hand, foot, floor, calibration, and stale-tracking issues without code edits.
- The signed-in real-camera manual smoke checklist passes with acceptable head, arm, hand, torso, leg, and foot behavior.
- All standard quality gates pass.
