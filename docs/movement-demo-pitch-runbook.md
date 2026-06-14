# Movement Demo Pitch Runbook

Last reviewed: 2026-06-14
Status: active draft
Audience: premium posture / Pilates client demo for children aged 8-14.

Quick presenter card: `docs/movement-demo-presenter-card.md`.

## Positioning

Present the demo as a private posture studio, not a game and not a raw technology test.

The story:

- The student sees themselves represented by a friendly avatar.
- The coach demonstrates calm, repeatable posture practice.
- The product helps children build awareness, balance, confidence, and healthy movement habits.
- The technology is invisible when it works and graceful when tracking is imperfect.

Use these words:

- posture studio
- guided practice
- student
- coach
- alignment
- posture sync
- check-in
- practice

Avoid these words in the pitch:

- match
- fighter
- combat
- raw AI
- telemetry
- capture data
- debugging

## Required Setup

Before the client sees the screen:

1. Use Chrome or the in-app browser on the demo laptop.
2. Open `http://localhost:3000/demos/movements`.
3. Use the sparkle "Guided Preview" action in the movement library for the presenter-safe route.
4. Confirm `localhost:3000` has camera permission allowed if live practice will be shown.
5. Open the play route with `?debugTracking=1` for rehearsal only.
6. Confirm the debug overlay shows live posture values, not "Waiting for tracking data."
7. Reload without `?debugTracking=1` before the client-facing run.
8. Keep the presenter framed from head to feet if possible.
9. Put the camera around chest or eye height.
10. Use bright, even front lighting.
11. Avoid dark clothing against a dark background.

If browser camera permission is blocked:

1. Do not troubleshoot in front of the client.
2. Use the library "Guided Preview" action, or use "Start Guided Preview" from the posture check-in screen.
3. Start the practice and present it as a guided product preview.
4. Reset camera permission after the meeting or during a break.

Camera permission recovery before rehearsal:

1. In Chrome, open Site settings for `http://localhost:3000`.
2. Set Camera to Allow.
3. If the permission is still stuck, clear site data for `localhost:3000`, then reload the app and sign in again.
4. Close any other app that might be using the webcam.
5. Open `/demos/movements/{movementId}/play?debugTracking=1`.
6. Start live practice and confirm the debug panel updates body confidence values while the presenter moves.

Presenter-safe backup URL:

`/demos/movements/{movementId}/play?guidedPreview=1`

Use this URL when you want to choose coach/student avatars, then bypass camera setup after the presenter clicks "Begin Practice."

## Client-Facing Script

Target length: 60-90 seconds.

Opening:

"This is the posture studio concept. The child chooses a student avatar and a coach avatar, then follows a short guided practice. The idea is to make posture awareness feel calm, personal, and encouraging rather than clinical."

Avatar selection:

"For the demo I will keep Jane as the student and Charlotte as the coach. In the product, different children could choose an avatar that feels friendly and motivating to them."

Check-in:

"Before practice, the studio does a posture check-in. It sets a baseline so the avatar can respond to the child's head, shoulders, arms, and overall stance."

Movement:

"Now watch the head, eyes, and expression first. Then we move into the body: arms, shoulders, and balance. The important point is that the feedback feels like coaching, not scoring or judging."

Close:

"For children, the value is repetition without pressure. For the teacher, the value is a scalable posture practice that still feels premium, safe, and personal."

## Safe Movement Sequence

Use slow, deliberate movement. The demo should look poised, not athletic.

Recommended sequence:

1. Neutral stance: stand tall, shoulders soft, hands by sides.
2. Face expression: smile, blink, look gently left and right.
3. Both arms: raise both arms to shoulder height, pause, lower slowly.
4. One-arm reach: right arm reaches up and slightly out, then returns.
5. Open chest: both arms open slightly, shoulders relaxed.
6. Gentle side bend: small torso lean, return to center.
7. Weight shift: shift weight left and right without stepping.

Rehearse before the pitch, then include only if it looks polished:

- Controlled mini squat: bend knees slowly, keep feet visible, return to tall stance.
- Single-knee lift: stand on one leg, raise the other knee to hip height only if the camera still sees the standing foot.

Avoid during the pitch:

- fast spins
- deep squats unless rehearsal is excellent
- jumping
- floor work
- hands crossing tightly in front of the body
- feet leaving camera frame

## Live Rehearsal Pass

Use this pass only before the meeting, not in front of the client.

Capture findings in `docs/movement-demo-live-rehearsal-notes-template.md` so the next tuning pass has exact fallback labels and visible-motion notes.

1. Open the live route with `?debugTracking=1`.
2. Complete Posture Check-In with the presenter framed head to feet.
3. Confirm head source is face, not pose, when the presenter faces the camera.
4. Confirm left and right arm fallbacks do not stay on "relaxed-arm" during slow arm raises.
5. Confirm knees and feet do not stay on synthetic/upper-body fallbacks when the full body is visible.
6. Rehearse the safe sequence once at 50% speed and once at meeting speed.
7. Move the head gently left/right and forward/back; confirm the head-motion diagnostics label changes from `neutral`.
8. Rehearse a controlled mini squat and confirm the lower-body diagnostics label reads `squat`.
9. Rehearse left and right knee lifts and confirm the lower-body diagnostics label reads `left-knee-raise` or `right-knee-raise`.
10. If the arms or legs look awkward, record which fallback labels appear in the debug overlay at that moment.
11. Remove `?debugTracking=1` before the client-facing run.

Presenter accept criteria for live mode:

- The avatar keeps a relaxed neutral stance.
- Arm raises look smooth enough for a premium demo.
- Small side bends and weight shifts do not cause obvious body snapping.
- The face remains expressive and stable.
- The camera tile does not cover Posture Sync.
- If any of these fail, use Guided Preview as the meeting route.

## Fallback Path

If tracking is weak or camera permission fails, use preview mode.

Presenter wording:

"I'll show the guided practice path first. The live posture check-in is available when the camera is connected, but this preview shows the coach/student experience and the visual direction."

In preview mode:

- Do not call attention to camera permission.
- Keep the story focused on avatar choice, coach guidance, and the product feel.
- Use it as a polished backup, not an apology.

## Readiness Criteria

Do not show the client until all are true:

- The lobby has no stray background words or technical labels.
- The play HUD says "Guided Practice", "Alignment", and "Posture Sync".
- Preview mode has no camera error text in the main status.
- The student avatar starts from a relaxed pose, not a T-pose.
- The coach avatar plays the recorded sequence.
- Browser console has no application errors.
- Live camera rehearsal has been tested, or preview fallback has been accepted as the route for the meeting.
- Local verification is green: full test suite, typecheck, lint, build, and high-severity audit pass.

## Current Known State

As of 2026-06-14:

- The premium lobby and play surfaces are implemented.
- The sidebar and library now use Posture Studio language instead of Movement Demo language.
- The avatar lobby and play route now open as immersive full-screen studio surfaces, without dashboard chrome.
- Guided preview and live practice keep the camera tile above the HUD so it does not cover Posture Sync.
- Guided preview completion avoids numeric scoring and shows a "Studio Ready" wrap-up instead of a low alignment result.
- Full-body rigging now uses Kalidokit body rotations with safer fallbacks.
- Skipped-calibration preview keeps the student in a neutral lower-body stance until the camera sees a stable upright full-body frame, then uses an automatic baseline for live squat and knee-lift response.
- Live calibrated tracking adds head-motion intent for side and forward/back movement, exposed in the debug overlay.
- Live student rigging now adds calibrated lower-body intent for squats and single-knee raises, including visible hip drop and stronger knee lift response.
- The debug overlay includes a lower-body intent row for live rehearsal tuning.
- The movement library has a one-click "Guided Preview" action for the presenter-safe route.
- Routine detail pages also launch "Guided Preview" and "Live Practice" directly.
- Legacy/default recording titles such as "Body Capture 3D" are presented as "Tall Spine Flow" in the studio UI.
- "Start Guided Preview" is clean enough for a presenter-safe backup and hides camera-permission language once active.
- `?guidedPreview=1` opens the coach/student chooser, then starts the guided preview path after "Begin Practice."
- Local verification passed with 762 tests, production build, and `npm audit --audit-level=high`.
- The current browser session had `localhost:3000` camera permission blocked during testing.
- Live body tuning still requires re-enabling camera permission and rehearsing with `?debugTracking=1`.
