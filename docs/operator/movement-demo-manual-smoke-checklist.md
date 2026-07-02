# Movement Demo Manual Smoke Checklist

Last reviewed: 2026-06-03
Purpose: repeatable signed-in browser smoke for the camera and MediaPipe paths that are intentionally not fully automated in Playwright.

## When To Run

Run this checklist before a client demo, before pushing a movement-demo change, and after changing any of these areas:

- `src/app/(dashboard)/demos/movement-capture/**`
- `src/app/(dashboard)/demos/movements/**`
- `convex/movements.ts`
- MediaPipe, webcam, VRM, scoring, or frame-codec helpers.
- Whole-body tracking, calibration, avatar profiles, head/neck solving, limb solving, or floor/foot constraints.

## Preflight

1. Confirm the repo is on `dev`.
2. Start the app and Convex dev services:

```bash
npm run dev
npm run convex:dev
```

3. Open `http://localhost:3000/login`.
4. Sign in with a user allowed to access `/demos`.
5. Allow browser camera permissions for `localhost:3000`.
6. Keep the browser console open and watch for uncaught errors.

## Smoke Steps

Record the result beside each item as `PASS`, `FAIL`, or `N/A`.

| Area | Check | Result | Notes |
| --- | --- | --- | --- |
| Library | `/demos/movements` loads without redirecting back to login. |  |  |
| Library | Existing movement rows show title, difficulty, recorded date, and action buttons. |  |  |
| Library | Search filters movement rows and returns a clear empty state when no rows match. |  |  |
| Capture | `/demos/movement-capture` loads the camera panel. |  |  |
| Capture | Camera permission failure shows the in-app permission guidance, not a native browser dialog. |  |  |
| Capture | MediaPipe status reaches `AI Vision: Active`, or a retryable model error is shown. |  |  |
| Capture | Start capture is disabled until vision is ready. |  |  |
| Capture | Start capture increments frame count and shows tracking quality. |  |  |
| Capture | Tracked hand landmarks feel responsive during capture, without obvious left/right swapping. |  |  |
| Capture | Stop capture opens the save dialog. |  |  |
| Capture | Save is blocked for missing title or too few frames with clear in-app guidance. |  |  |
| Capture | A valid title and enough frames save successfully and return to the library. |  |  |
| Detail | Opening the saved movement detail page renders the skeleton viewer. |  |  |
| Detail | Scrubber changes the displayed frame without console errors. |  |  |
| Detail | Play/pause preview loops the recording without layout jumps. |  |  |
| Detail | Telemetry shows frame count, duration, and storage/data format. |  |  |
| Play | Opening the saved movement play route reaches the avatar lobby. |  |  |
| Play Debug | Reopen the play route with `?debugTracking=1`; the tracking debug overlay appears only in this debug URL. |  |  |
| Play Debug | The Posture Check-In overlay shows `Debug Auto Baseline` only in the debug URL, and pressing it starts the automatic baseline path without using the client-facing guided preview button. |  |  |
| Play Debug | Starting from the library `Debug auto baseline` action auto-saves diagnostic tracking chunks; no separate save button is required for live camera/avatar tracking evidence. |  |  |
| Play Debug | The debug overlay is readable during motion: readiness, status, age, primary tuning action, key confidences, fallbacks, and health warnings remain visible. |  |  |
| Play Debug | The Baseline row reports `manual-calibration` after a full posture check-in, `upper-body-auto-baseline` when only a neutral upper body is reliable, or `none` when no safe baseline exists. |  |  |
| Play Debug | Missing or weak calibration appears as `Run calibration` or `Recalibrate neutral stance` before limb tuning. |  |  |
| Play Debug | If the avatar looks down, sideways, or tilted while the user is neutral, head clamp warnings point to pitch, yaw, or roll offset tuning. |  |  |
| Play Debug | If one arm feels limp or delayed, the overlay identifies weak endpoints, last-good holding, or left/right arm confidence imbalance. |  |  |
| Play Debug | If feet float, stick, or lose contact, the overlay identifies fixed-floor fallback, foot last-good holding, or left/right foot confidence imbalance. |  |  |
| Play Debug | After calibration, readiness is at least `80%` with status `Ready`, or any lower status has clear health warnings to tune against. |  |  |
| Play Debug | Health warnings identify weak head, torso, arm, knee, foot, or fallback sources without browser console errors. |  |  |
| Play Debug | Pausing or blocking the camera/solver causes `Tracking data is stale` and caps readiness instead of showing a false-ready state. |  |  |
| Play | Player and instructor avatar selections update pressed state. |  |  |
| Play | Begin Session opens the match scene with instructor and player avatars. |  |  |
| Play | Webcam preview appears only once. |  |  |
| Play | Start match is disabled until vision is ready, then toggles play/pause. |  |  |
| Play | Player hand side, wrist orientation, and finger curls follow real hand motion closely enough for demo use. |  |  |
| Play | Looking straight at the camera makes the avatar look straight ahead, not down. |  |  |
| Play | Looking up, down, left, and right maps to believable avatar head motion without exaggerated drift. |  |  |
| Play | Left and right arms respond equally when raised, lowered, and crossed. |  |  |
| Play | Elbows and wrists stay plausible when hands move quickly or briefly lose confidence. |  |  |
| Play | Standing still keeps the avatar grounded without floating, sinking, or knee collapse. |  |  |
| Play | Small steps or foot lifts are visible without breaking floor contact on the planted foot. |  |  |
| Play | Recalibration, when available, fixes a bad neutral posture without refreshing the page. |  |  |
| Play | Pressing Calibrate starts a visible countdown before samples are collected, giving time to move into position. |  |  |
| Play | If calibration reports weak tracking, `Continue without calibration` enters the match for tuning and the HUD still allows recalibration. |  |  |
| Play | Before calibration succeeds, the player avatar head starts in a neutral camera-facing pose rather than following noisy raw head angles. |  |  |
| Play | If the camera cannot see enough lower body, the avatar stays usable in an upper-body fallback instead of twisting hips, legs, or feet from partial landmarks. |  |  |
| Play | Score and sync update during motion without direct DOM or hydration errors. |  |  |
| Play | Completion dialog appears once at the end of playback. |  |  |
| Play | Rematch resets score/playback and Exit Match returns to the lobby. |  |  |
| Delete | Delete confirmation opens from library or detail. |  |  |
| Delete | Cancel leaves the movement intact. |  |  |
| Delete | Confirm removes the movement from the library. |  |  |

## Required Evidence

For a demo-ready pass, capture these notes:

- Browser and device used.
- Signed-in role used.
- Movement title created or reused.
- Any console errors or warnings.
- Whether camera permission was already granted or newly granted.
- Whether MediaPipe model loading needed retry.

## Known Non-Blocking Noise

- Playwright may emit Node warnings about `NO_COLOR` and `FORCE_COLOR` during local e2e runs. These are not app lint warnings and do not indicate a movement-demo regression.
- The Convex dev server may print the optional Convex AI files message. This is not movement-demo related.

## Failure Handling

If any item fails:

1. Record the exact route and step.
2. Copy the first browser console error.
3. Note whether the issue reproduces after a hard refresh.
4. Run:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

5. Fix the smallest owned surface first: frame codec, hook, component, route, then Convex mutation/query.
