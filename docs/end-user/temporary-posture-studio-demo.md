# Temporary Posture Studio Demo

The temporary posture studio demo is a motion-capture and guided-practice prototype. It lets a signed-in user record a posture routine with a webcam, save the routine, inspect the saved frame data, and play the routine back in a split instructor/player studio with VRM avatars.

This demo is frozen. It exists for a client presentation and is expected to be removed later. It should not be treated as a permanent Hakken product area or expanded without an explicit request.

## Where To Find It

- `/demos/movements` opens the Posture Studio Library.
- `/demos/movement-capture` records a new routine.
- `/demos/movements/[id]` opens routine details.
- `/demos/movements/[id]/play` opens live practice.
- `/demos/movements/[id]/play?guidedPreview=1` starts guided preview without requiring the normal calibration flow.
- `/demos/movements/[id]/play?debugTracking=1` enables debug tracking overlays and frame scrubbing for diagnosis.

The routes require an authenticated user. They are demo routes, not normal customer onboarding screens.

## Library

The library lists saved routines in a paginated table with search. Each row can open guided preview, live practice, details, or delete confirmation. The library uses 15 rows per page and searches routine titles.

The "New Routine" action opens the capture route.

## Capture

Capture uses the webcam and MediaPipe vision tasks for pose, face, and hand tracking. The screen shows camera and vision readiness, tracking quality, recording state, and frame count. Starting and stopping recording captures tracked frames from the live camera.

After recording stops, the save dialog asks for a title and difficulty: Beginner, Intermediate, or Advanced. A recording must have enough frames before it can be saved. Saved recordings are written to Convex with metadata such as title, difficulty, frame count, duration, capture FPS, format, and storage id where applicable.

If camera or MediaPipe setup fails, the UI exposes retry and error states. Recording quality depends heavily on browser camera permissions, lighting, framing, and full-body visibility.

## Routine Details

The routine detail page shows the routine title, difficulty, recording date and time, a frame viewer with scrubber controls, duration, posture moment count, recording format, guided preview and live practice actions, and a destructive delete action.

The frame viewer is useful for checking whether a saved routine contains usable data before launching practice.

## Guided Preview And Live Practice

The play screen starts with an avatar selector lobby unless guided preview starts automatically. The studio then renders two VRM avatars: an instructor on the left driven by recorded routine frames and a player on the right driven by live webcam tracking.

Live practice includes calibration, play/pause controls, scoring, synchronization feedback, HUD state, camera/vision readiness, completion feedback, and sparkles tied to key player landmarks. Guided preview skips calibration and starts playback so operators can show the routine quickly.

Debug tracking mode adds raw source skeleton overlays and a frame scrubber so developers can inspect whether mismatches come from the recorded landmarks, live tracking, or avatar retargeting.

## Data And Deletion

Saved movement records are stored in the `movements` table and may reference storage-backed frame data. Deleting a routine removes the movement row and attempts to delete the associated storage object when one exists.

The demo does not currently provide company-level routine ownership, publishing, coaching programs, student accounts, progress history, or customer reporting. It is a temporary authenticated demo surface.

## Operational Guidance

For demos, prepare recordings before the presentation, check guided preview, and test live practice with the actual camera and browser. Use a bright room, keep the full body in frame, and avoid changing the demo implementation during rehearsal.

If avatar body motion appears wrong, use `debugTracking=1` to inspect the source skeleton before concluding the avatar is broken. Do not request retargeting or lower-body animation changes unless the movement demo is explicitly reopened.
