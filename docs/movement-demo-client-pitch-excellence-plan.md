# Movement Demo Client Pitch Excellence Plan

Last reviewed: 2026-06-14
Status: implementation and non-camera verification complete; final live-camera tuning is blocked until browser camera permission is re-enabled.
Scope: movement demo avatar realism, demo choreography, reliability, visual polish, and pitch readiness.

## Goal

Make the movement demo feel impressive enough that a prospective client understands the product potential immediately. The demo should not merely prove that webcam tracking works. It should make the avatar feel alive, responsive, grounded, and commercially credible.

## Audience And Positioning

The client is a premium Pilates teacher with an exclusive private client base. The intended product direction is posture coaching for children aged 8-14, especially families who expect a polished, reassuring, high-trust experience.

The demo should feel:

- Private-studio premium, not arcade or fitness-game generic.
- Warm and aspirational for children, without becoming childish.
- Elegant enough for a teacher who works with high-profile clients.
- Focused on posture, poise, alignment, confidence, and healthy movement habits.
- Calmly luxurious, with precise feedback and no frantic visual noise.

Preferred language:

- "Posture studio"
- "Guided practice"
- "Student"
- "Coach"
- "Alignment"
- "Posture sync"
- "Check-in"
- "Practice"

Avoid client-facing language that sounds combative, clinical, or arcade-heavy:

- "Match"
- "Total score"
- "Fighter"
- "Combat"
- "Hologram"
- "Raw AI"
- Overly neon/game-like framing

The current head, eyes, and mouth already create the right emotional effect. The remaining risk is that arms, torso, hips, legs, and feet can look awkward or physically unnatural. That weakens the pitch because users forgive rough UI faster than they forgive an avatar body that feels broken.

The plan is to rewrite the body-rigging layer decisively while preserving the parts that already work: MediaPipe capture, face landmarks, blendshapes, calibration flow, frame storage, playback shell, scoring, and the existing demo routes.

## Success Bar

The client-facing bar is:

- The avatar looks intentional, athletic, and comfortable in its own body.
- Standing still looks stable, grounded, and relaxed.
- Raising, lowering, crossing, and extending arms looks natural.
- Torso and hips support the movement instead of fighting the head and limbs.
- Knees and feet never collapse, twist backward, or drift through the floor during normal demo movement.
- Temporary tracking loss degrades gracefully into a polished fallback pose.
- The normal demo path needs no developer narration to excuse body motion.

For the pitch, "believable and delightful" beats "raw landmark literalism." It is acceptable for the avatar to be slightly stylized if it looks premium and follows the user's intent.

## Current Diagnosis

The current movement body path is fragile because `VrmAvatar` calls `Kalidokit.Pose.solve(...)` but only applies a small subset of the solved output. Head and hand pieces are used, while most arm and leg motion is replaced by a custom `aimVector` bone-aiming path.

Known issues in the current approach:

- The face/head path has custom face landmarks, calibration, clamps, and tuned smoothing; the body path does not.
- Limbs are aimed segment by segment instead of solved as anatomical chains.
- Arms mix image-space and low-depth data while legs often use world landmarks, so body parts do not share one coherent motion model.
- Shoulder, elbow, hip, knee, ankle, and foot constraints are too light for a pitch-critical avatar.
- Hip/root rotation and floor correction can make the avatar feel stiff, drifting, or over-corrected.
- The custom vector path can make mathematically plausible directions look physically uncomfortable on a VRM body.

## Current Implementation Notes

Implemented on 2026-06-14:

- Expanded the rigged pose type to carry Kalidokit full-body output for arms, legs, spine, and hips.
- Replaced the old custom limb aiming path as the primary body driver in the play avatar.
- Kept the stronger face, eyes, mouth, and head path intact.
- Replaced additive hip/floor drift with baseline-relative correction.
- Added relaxed fallback posture behavior so missing camera or skipped calibration does not leave the student avatar in a hard T-pose.
- Repositioned the play, capture, save, and detail surfaces around premium posture-studio language.
- Added camera stream health messaging in the play HUD so permission failures read as a camera setup issue, not broken body tracking.
- Added an immersive full-screen studio route for avatar selection and play, hiding dashboard chrome and local dev indicators.
- Added Guided Preview as a presenter-safe route from the library and routine detail pages.
- Kept the camera tile visible in Guided Preview and live practice, positioned above the HUD so it does not cover Posture Sync.
- Changed skipped-calibration preview so the student starts from a straight neutral stance instead of inheriting a crouched or seated camera pose.
- Added an automatic upright full-body baseline for skipped-calibration preview, restoring live squat and knee-lift response once the presenter stands fully in frame.
- Added calibrated head-motion intent for side and forward/back head movement, with a diagnostics label for rehearsal.
- Added calibrated lower-body intent detection for squats and single-knee raises, then used that intent to drive visible hip drop, thigh lift, and knee bend in the student avatar.
- Added a lower-body diagnostics label so live rehearsal can confirm whether the system is reading `squat`, `left-knee-raise`, or `right-knee-raise`.
- Replaced legacy/default recording titles such as "Body Capture 3D" with "Tall Spine Flow" in client-facing studio UI.
- Changed Guided Preview completion to show a "Studio Ready" wrap-up instead of a low numeric alignment result.
- Added a pitch runbook and live rehearsal checklist covering camera permission, safe movement, fallback wording, and debug overlay observations.
- Added a narrow `esbuild@0.28.1` npm override to clear the high-severity audit advisory from Convex's pinned transitive dependency while preserving green build/test gates.

Live-camera status:

- The current in-app browser session reports the hidden webcam stream as permission denied.
- The play route now surfaces this as "Camera check needed" / "Camera permission is blocked."
- True live body tuning still needs the browser/site camera permission re-enabled on `localhost:3000`, then a real movement pass with `?debugTracking=1`.
- Non-camera verification is green: `npm run lint:all`, `npm run check`, `npm run build`, `npm audit --audit-level=high`, and `git diff --check` all passed after the implementation.

## Strategic Decision

Default posture: rewrite the avatar body motion layer first, because that is the highest-confidence path to fixing the visible problem without disrupting working capture, face, storage, and playback code.

Pitch posture: do not preserve existing movement-demo code for its own sake. If a broader rewrite gives a meaningfully better chance of a premium client demo, take the broader rewrite. The business goal is to win confidence, not to minimize touched lines.

Keep:

- Movement library, capture, detail, and play routes.
- MediaPipe Pose, Face, and Hand model loading.
- Face landmarks, eye/mouth blendshapes, and head calibration.
- Recorded frame format and Convex storage behavior.
- Avatar selection, match scene shell, HUD, scoring, debug overlay, and manual smoke checklist.

Replace or heavily rework:

- Body rigging in `VrmAvatar`.
- `VrmRiggedPose` typing so it represents Kalidokit's full pose result.
- Limb application, torso/hip application, floor correction, and body fallback behavior.
- Avatar-profile values for body response, offsets, constraints, and demo-safe fallback poses.

Rewrite freely if needed:

- The `VrmAvatar` component structure.
- The body-tracking state model.
- The play-route avatar scene composition.
- The calibration/session flow.
- The demo-specific avatar profile system.
- The normal/pitch/debug mode boundary.
- Any movement-specific UI that makes the pitch feel less polished.
- Any movement-specific language or styling that reads as arcade/combat/generic fitness instead of premium posture coaching.

Escalate from targeted rig rewrite to broader rewrite when:

- Full Kalidokit body application still looks uncanny after one tuning pass.
- The old play-route structure makes it hard to isolate stable pitch behavior.
- Confidence fallbacks need cleaner state than the current render loop can provide.
- The client-demo path needs a curated, presenter-safe mode that diverges from the generic movement match flow.
- Keeping compatibility with old body-rigging code slows down visible quality gains.

## Target Experience

The demo should be choreographed around movements that show off strengths:

1. Neutral stance: avatar breathes slightly or holds a relaxed premium idle posture.
2. Head and expression: user smiles, blinks, looks left/right/up/down.
3. Upper body: raise both arms, one-arm reach, open arms, controlled cross-body motion.
4. Torso: small side bend or rotation that feels supported by shoulders and hips.
5. Lower body: small step, weight shift, or gentle knee bend, only if camera framing supports it.
6. Recovery: briefly hide one hand or foot and show that the avatar remains composed.

Use these only in rehearsal until the live camera pass proves they look premium:

- Fast spins.
- Deep squats.
- Feet leaving camera frame.
- Extreme cross-body limb overlap.
- Floor exercises where MediaPipe lower-body confidence drops.
- High knee raises where the standing foot leaves frame.

## Architecture

Use a layered motion pipeline:

```text
MediaPipe landmarks
  -> smoothing and visibility scoring
  -> calibrated user body model
  -> Kalidokit full-body base pose
  -> confidence-aware chain refinement
  -> avatar profile offsets and constraints
  -> VRM bone application
  -> floor/idle/fallback polish
```

The important change: MediaPipe landmarks should not directly aim every avatar bone. They should first become a solved body pose with confidence, constraints, and demo-safe fallback behavior.

## Phase 1: Full Kalidokit Body Baseline

Goal: stop ignoring the solver's useful body output.

Tasks:

- Expand `VrmRiggedPose` to include:
  - `RightUpperArm`
  - `RightLowerArm`
  - `LeftUpperArm`
  - `LeftLowerArm`
  - `RightUpperLeg`
  - `RightLowerLeg`
  - `LeftUpperLeg`
  - `LeftLowerLeg`
  - `Spine`
  - `Hips.rotation`
- Apply Kalidokit rotations for arms, legs, spine, and hips as the baseline.
- Keep the current face-based head path instead of reverting to raw Kalidokit head behavior.
- Keep finger solving through `Kalidokit.Hand.solve(...)`.
- Feature-flag or isolate the old `aimVector` path so it can be compared or removed safely.

Acceptance:

- Avatar arms and legs no longer look limp, inverted, or manually puppeted in normal movement.
- The whole body follows one coordinate convention.
- The head/face quality does not regress.

## Phase 2: Body Constraints And Demo-Safe Fallbacks

Goal: make solved motion look comfortable on a VRM body.

Tasks:

- Add elbow and knee bend guards that prevent backward-looking joints.
- Add shoulder and upper-arm twist limits so raised arms do not look dislocated.
- Add hip and spine limits so torso motion supports the head instead of pulling it downward.
- Store last-good body-part quaternions by confidence.
- Ease weak body parts toward a premium fallback pose rather than freezing awkwardly.
- Add separate fallback postures:
  - full-body visible
  - upper-body-only
  - hand-tracking weak
  - lower-body weak

Acceptance:

- Weak tracking never leaves the avatar in a visually embarrassing pose.
- If lower body is not visible, the demo still looks intentional from the waist up.
- Arms recover smoothly after hands leave and re-enter frame.

## Phase 3: Grounding, Feet, And Hip Stability

Goal: make the avatar feel physically present.

Tasks:

- Replace additive per-frame hip-height correction with a baseline-relative correction.
- Add a floor anchor that eases toward a calibrated floor rather than chasing every noisy ankle frame.
- Prefer stable feet in neutral stance over literal foot jitter.
- Allow small visible steps only when ankle and toe confidence are strong.
- Clamp hip/root rotation changes when shoulder or hip confidence is low.

Acceptance:

- Standing still keeps feet planted.
- The avatar does not slowly float, sink, or bob from noisy floor correction.
- Knees and feet remain plausible during small demo-safe steps.

## Phase 4: Avatar Profiles For Commercial Polish

Goal: make each selectable avatar look tuned, not generic.

Tasks:

- Extend avatar profiles beyond head/neck response to include:
  - shoulder width compensation
  - upper-arm twist offset
  - lower-arm bend gain
  - wrist orientation offset
  - spine response
  - hip yaw/roll response
  - leg and foot response
  - fallback pose quaternions or named presets
- Pick one primary pitch avatar and tune it first.
- Keep other avatars selectable, but do not let them block the pitch path.

Acceptance:

- The primary pitch avatar is visibly better than the others and safe to use in front of the client.
- Avatar-specific tuning lives in profile config, not scattered through the render loop.

## Phase 5: Pitch Mode

Goal: give the demo a polished path that avoids risky states.

Tasks:

- Add a pitch/demo mode flag or route parameter if needed.
- In pitch mode, bias toward visual stability:
  - require calibration before start
  - prefer upper-body fallback when lower-body confidence is weak
  - use more forgiving lower-body response
  - show user-facing guidance only when it helps the presenter recover
- Add a short "ready" state after calibration so the presenter can begin cleanly.
- Keep debug details hidden from the client-facing path.

Acceptance:

- A presenter can start the demo without developer tools open.
- The avatar enters the session in a good neutral pose.
- If tracking quality is poor, the UI guides recovery without exposing implementation details.

## Phase 5A: Camera Readiness Gate

Goal: make camera setup failures obvious and recoverable before the presenter starts the practice.

Tasks:

- Detect whether the webcam video has actually received a stream, not just whether MediaPipe models are ready.
- Show premium-facing camera guidance when browser permission is denied or no stream arrives.
- Keep preview/fallback mode available even when camera permission is blocked.
- Before a client run, verify site camera permission on `localhost:3000` and run check-in with `?debugTracking=1`.

Acceptance:

- The presenter can distinguish "camera not available" from "tracking is weak."
- The avatar does not sit in a broken-looking pose while the hidden camera stream is blocked.
- The debug overlay shows live confidence values before the presenter removes `debugTracking=1`.

## Phase 6: Demo Choreography And Content

Goal: make the technology feel like a product story.

Presenter runbook: `docs/movement-demo-pitch-runbook.md`.

Tasks:

- Define a 60-90 second demo script:
  - what the presenter says
  - what movement they perform
  - what the client should notice
  - what fallback to use if tracking confidence drops
- Record or create two curated movement clips:
  - one expressive upper-body clip
  - one gentle whole-body clip
- Add internal notes for camera placement:
  - lens height
  - distance from camera
  - lighting
  - floor visibility
  - presenter clothing contrast
- Decide the primary avatar and movement clip before the client meeting.

Acceptance:

- The demo can be rehearsed consistently.
- The presenter knows exactly which movements are safe and impressive.
- The demo has a backup path if lower-body tracking is weak in the room.

## Phase 7: Validation Gates

Goal: avoid discovering avatar problems during the pitch.

Automated gates:

- `npm run verify:env`
- `npm run lint:all`
- `npm run check`
- `npm run build`
- `git diff --check`

Focused tests:

- Full Kalidokit pose typing and adapters.
- Body fallback selection.
- Floor correction relative to a baseline, not additive drift.
- Avatar profile merging for body response and fallback presets.
- Confidence thresholds for upper-body and lower-body pitch paths.

Manual gates:

- Run `docs/movement-demo-manual-smoke-checklist.md`.
- Run the pitch script on the actual laptop, browser, camera, and room setup when possible.
- Test with `?debugTracking=1`, then repeat without debug mode.
- Capture short screen recordings of the best run and the fallback run.

Acceptance:

- The primary avatar passes the smoke checklist.
- The pitch script can be repeated three times without a visually awkward body failure.
- The fallback path still looks professional.

## Implementation Order

1. Create the cleanest body-motion architecture that can plausibly win the pitch, even if that means replacing the current rig loop outright.
2. Expand pose types and apply Kalidokit full-body rotations or a better solver abstraction.
3. Replace or retire the old custom `aimVector` body path.
4. Add joint constraints and last-good/eased-neutral fallbacks.
5. Fix hip height and floor correction around a stable baseline.
6. Tune one primary pitch avatar profile.
7. Add pitch mode behavior if the normal path exposes risky states.
8. Rewrite movement-specific scene or session code if that is the fastest path to a clean pitch flow.
9. Write and rehearse the demo script.
10. Run real-camera smoke and capture evidence.

## Definition Of Done

This plan is done when:

- The primary pitch avatar looks natural in neutral, arm, torso, and small lower-body movements.
- Face, eyes, and mouth quality remain as strong as they are now.
- Arms, body, and legs no longer feel awkward or impaired during demo-safe movement.
- Lower-body weakness falls back gracefully instead of damaging the presentation.
- A presenter can run the demo from a script without developer explanation.
- The smoke checklist and build gates pass before the client session.
