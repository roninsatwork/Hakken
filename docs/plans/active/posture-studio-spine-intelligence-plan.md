# Posture Studio Spine Intelligence Plan

Last reviewed: 2026-07-01
Status: implemented for demo
Scope: posture studio capture, saved movement metadata, instructor authoring, playback, avatar rendering, scoring, and coaching feedback.

## Goal

Make the posture studio feel centered on spinal quality rather than generic movement matching. The client signal is clear: for her posture exercises, the spine is the most important part. The product should therefore help an instructor capture the intended spinal pattern, help a student see their own spine behavior, and help playback compare the student's spinal organization against the instructor's movement.

The target is not clinical diagnosis. The target is premium posture coaching language and visuals:

- Is the head stacked over the pelvis?
- Are shoulders and hips balanced?
- Is the student hinging, rolling, rotating, or collapsing?
- Does the avatar show the spine goal clearly enough for a child and parent to understand?
- Can the instructor explain what the movement is training?

## Product Thesis

The posture studio should evolve from:

```text
Follow the instructor's skeleton.
```

into:

```text
Practice the instructor's spinal intent with a friendly avatar and simple coaching cues.
```

This becomes a stronger product story for posture, Pilates, children's movement education, and premium remote coaching. It also gives the demo a differentiated center: the app understands posture priorities, not just pose landmarks.

## Non-Goals

- Do not position the feature as medical assessment, diagnosis, treatment, or injury screening.
- Do not promise true vertebra-by-vertebra spine tracking from a single webcam.
- Do not replace instructor judgment with automated correction.
- Do not make the temporary demo a full production biomechanics engine before the product direction is validated.
- Do not drive avatar body animation primarily from canned labels such as `squat`, `roll down`, or `hinge`. Use landmarks, calibrated source models, vector evidence, and confidence.

## Current Foundation

The existing posture studio already has useful building blocks:

- Capture route: `/demos/movement-capture`
- Library route: `/demos/movements`
- Detail/review route: `/demos/movements/[id]`
- Practice route: `/demos/movements/[id]/play`
- Saved pose frames with pose landmarks, optional `worldLandmarks`, face landmarks, blendshapes, and hand captures.
- Instructor playback from recorded frames.
- Player live tracking, calibration, avatar profiles, VRM rigging, retargeting, scoring, and debug overlays.
- Retargeting source models with shoulder, hip, torso, leg, foot, and spine segment evidence.

The missing layer is a named, persistent "spine intelligence" model that turns those tracking signals into instructor-facing intent, student-facing visuals, and playback scoring.

## Spine Model

Create a posture-specific spine model derived from existing pose data. The model should be simple, inspectable, and stable enough for demo and product discovery.

### Derived Landmarks

Compute these from MediaPipe pose landmarks:

- `headCenter`: nose/ears or face-informed head center.
- `shoulderCenter`: midpoint between left and right shoulders.
- `ribcageCenter`: estimated midpoint between shoulder center and hip center.
- `pelvisCenter`: midpoint between left and right hips.
- `leftShoulder`, `rightShoulder`, `leftHip`, `rightHip`.
- Optional `neckBase`: midpoint near shoulder center with head direction.

### Core Metrics

Start with metrics that map cleanly to coaching language:

- Head-over-pelvis offset.
- Shoulder tilt.
- Hip tilt.
- Shoulder-to-hip rotation difference.
- Torso lean forward/back.
- Torso side bend.
- Ribcage-over-pelvis offset.
- Spine line length change against neutral.
- Symmetry score between left and right sides.
- Neutral stack score.

### Movement-Specific Metrics

Layer movement intent on top of the core model:

- `neutralStack`: maintain head, ribcage, and pelvis alignment.
- `segmentalFlexion`: controlled roll-down or roll-up shape.
- `hipHinge`: pelvis moves while spine stays long.
- `thoracicRotation`: ribcage rotates relative to pelvis.
- `sideBend`: controlled lateral curve without hip collapse.
- `extension`: chest opens while pelvis remains controlled.
- `squatWithStack`: knees and hips bend while the spine remains organized.

## Capture Plan

Goal: help instructors record movements with explicit spinal intent and enough visible tracking quality to support later playback.

### Capture UI

Add a spine overlay during capture:

- Head-to-pelvis guide line.
- Shoulder bar.
- Hip bar.
- Optional ribcage/pelvis rings.
- Capture quality indicator split into body quality and spine quality.

Keep normal recording simple. The overlay should feel like a studio guide, not a developer skeleton.

### Instructor Intent

When saving a movement, collect posture intent:

- Spine goal: neutral stack, hip hinge, roll down, thoracic rotation, side bend, extension, squat with stack.
- Primary cue: short text such as "keep ribs over hips" or "roll down one segment at a time".
- Body focus: neck, shoulders, ribcage, pelvis, hips, feet.
- Difficulty and age range remain separate from spine goal.

This metadata can start as optional local/demo fields and later become a durable schema change if the product direction is accepted.

### Capture Acceptance

- The instructor can see a spine guide while recording.
- The save flow records the intended spine goal.
- The app warns when the camera cannot see enough shoulders/hips/knees to make a useful full-body posture recording.
- A saved movement can be reviewed with its spine goal visible.

## Studio And Library Plan

Goal: make the studio itself communicate posture education, not just movement storage.

### Library

Add spine-aware summaries to movement cards/table rows:

- Spine goal.
- Primary cue.
- Best frame preview for the spine goal.
- Recorded quality: body, spine, lower body.
- Tags such as "Neutral spine", "Thoracic rotation", "Hip hinge".

### Detail Review

The detail page should show:

- A frame viewer with spine overlay.
- Peak spine moments:
  - deepest bend
  - largest rotation
  - best neutral stack
  - largest asymmetry
- Instructor note/cue.
- A short explanation of what this routine trains.

### Studio Acceptance

- An instructor can find routines by spine goal.
- A parent/client can understand what the routine is for without seeing raw technical debug labels.
- Debug information remains available behind debug mode, while normal studio language stays calm and premium.

## Playback Plan

Goal: compare the student's spine behavior to the instructor's spinal intent during guided practice.

### Instructor Playback

For each recorded frame:

- Compute instructor spine model.
- Store or derive normalized spine metrics.
- Identify target moments for the selected spine goal.
- Expose the instructor spine guide to the avatar and overlay layers.

### Student Playback

For live player frames:

- Compute player spine model from calibrated pose data.
- Compare against the instructor's current frame and movement goal.
- Prefer goal-specific scoring over generic skeleton distance.

Example:

- In a hip hinge, reward long spine and pelvis movement more than exact hand position.
- In a roll-down, reward progressive head/ribcage/pelvis relationship.
- In thoracic rotation, reward ribcage rotation while pelvis stays calmer.
- In squat with stack, reward hip/knee bend while head and ribcage stay organized over pelvis.

### Feedback Language

Keep feedback instructional and non-clinical:

- "Stack head over hips."
- "Keep ribs quiet."
- "Let the hips lead the hinge."
- "Soften both knees evenly."
- "Rotate through the upper back."
- "Return to tall spine."

### Playback Acceptance

- The student can see their spine guide beside or over the avatar.
- The instructor avatar shows the intended spine path.
- The score includes a spine component.
- Feedback explains the posture goal rather than only saying "match better."

## Avatar And Visual Plan

Goal: make the instructor and student avatars show spinal intent clearly without making the experience clinical.

### Instructor Avatar

Add optional guide visuals:

- Subtle spine glow/path.
- Shoulder and hip bars.
- Pelvis/ribcage rings for rotation/stacking.
- Ghost spine trail during roll-down or rotation.

The instructor should look like a calm reference model. Her spine guide should communicate the ideal shape.

### Student Avatar

Add responsive guide visuals:

- Student spine line changes color by alignment quality.
- Head-over-pelvis plumb line.
- Ribcage/pelvis offset indicator.
- Gentle correction cue when the student drifts.

The student avatar should never look punished. Visual language should be warm, clear, and encouraging.

### Camera Overlay

On live camera surfaces, use the same conceptual guides:

- Capture overlay for instructor recording.
- Optional practice overlay for live student tracking.
- Debug overlay remains more technical and hidden by default.

### Avatar Acceptance

- The instructor and student avatars can communicate "spine goal" at a glance.
- The avatar still moves naturally and does not become covered in technical clutter.
- The same guide system works across selectable avatars through avatar profile offsets.

## Scoring Plan

Goal: make scoring reflect posture quality.

### Score Components

Use a weighted score:

- Timing/sync.
- Spine goal match.
- Balance/asymmetry.
- Lower-body support where relevant.
- Smooth return to neutral.

The weights should come from movement intent. A hip-hinge routine should score spine length and pelvis relationship more heavily than arm position. A squat routine should include knees/hips/feet as support for spinal stack.

### Result Summary

After practice, show a simple summary:

- Best spine stack.
- Main practice cue.
- Strongest phase.
- One next focus.

Example:

```text
Best stack: 82%
Focus next time: keep ribs over hips during the return.
Strongest moment: neutral standing.
```

### Scoring Acceptance

- A student can improve their spine score without perfectly matching every limb.
- A routine's score reflects the instructor's stated movement intent.
- Scores remain explainable in plain language.

## Data And Storage Plan

Start without a disruptive backend migration if possible.

### Phase 1 Data

Compute spine metrics live from existing frame payloads:

- No required storage schema change.
- Debug and detail pages can derive metrics client-side.
- Tests can use deterministic frame fixtures.

### Phase 2 Data

Add optional movement metadata:

- `spineGoal`
- `primaryCue`
- `bodyFocus`
- `qualitySummary`

This likely touches `convex/movements.ts`, save dialog inputs, library rows, and detail pages.

### Phase 3 Data

Consider storing derived frame analysis only if needed:

- cached peak moments
- recording quality summary
- instructor source spine model

Do not store derived analysis until recomputation becomes too slow or inconsistent.

## Implementation Phases

### Phase 1: Spine Metrics Library

Status: complete for demo.

Tasks:

- Add a pure `movementSpineMetrics` helper.
- Compute derived spine points from pose landmarks.
- Compute neutral stack, tilt, lean, rotation, and symmetry metrics.
- Add deterministic tests.

Acceptance:

- Metrics can be computed from saved instructor frames and live player frames.
- Weak landmarks return a low-confidence model rather than misleading values.

### Phase 2: Capture Spine Overlay

Status: complete for demo.

Tasks:

- Draw a polished spine guide in capture when pose landmarks exist.
- Keep skeleton/debug visuals separate from normal studio visuals.
- Show spine quality separately from full-body capture quality.

Acceptance:

- Bones/guides are visible during capture.
- The instructor can tell whether the recording contains useful spinal data.

### Phase 3: Movement Intent Metadata

Status: complete for demo.

Tasks:

- Extend save flow to collect spine goal and primary cue.
- Show spine goal in library and detail pages.
- Keep legacy movement records working with default goal labels.

Acceptance:

- New recordings carry instructor intent.
- Old recordings remain playable.

### Phase 4: Playback Spine Comparison

Status: complete for demo.

Tasks:

- Compute instructor and player spine metrics during playback.
- Add goal-specific spine scoring.
- Add simple coaching feedback.

Acceptance:

- A practice session can explain spine performance independently from generic sync.
- The score is visibly affected by posture quality.

### Phase 5: Avatar Spine Guides

Status: complete for demo overlay/camera guides; avatar-native glow remains a future polish item.

Tasks:

- Add instructor spine guide visuals.
- Add student spine guide visuals.
- Add guide tuning to avatar profiles if model offsets require it.

Acceptance:

- The avatar communicates spinal intent clearly.
- The guides work across the main selected instructor and student avatars.

### Phase 6: Instructor Review Tools

Status: complete for demo.

Tasks:

- Add detail-page spine frame review.
- Identify peak bend, rotation, stack, and asymmetry frames.
- Show the instructor's cue next to these moments.

Acceptance:

- An instructor can review and explain a recording's spine goal before assigning or presenting it.

### Phase 7: Demo Narrative And Operator Docs

Status: complete for demo.

Tasks:

- Update presenter card and runbook with the spine-centered story.
- Add manual smoke checks for spine overlay, scoring, and feedback.
- Keep claims non-medical and coaching-oriented.

Acceptance:

- The presenter can answer "why spine?" with product language and visible proof in the app.

## Verification Strategy

Automated:

- Unit tests for spine metric calculations.
- Unit tests for goal-specific scoring.
- Fixture tests for recorded squat, hinge, roll-down, and rotation sequences.
- Existing movement capture, playback, and save tests continue to pass.

Manual:

- Capture a neutral standing routine and verify spine quality.
- Capture a squat with stacked spine and verify shoulder/hip/head guide behavior.
- Capture a hip hinge and verify pelvis movement with long spine.
- Run guided preview and live practice with `debugTracking=1`.
- Confirm old recordings still play.

Demo smoke script:

1. Open `/demos/movements` and confirm Full Body Flow and Tall Spine Flow appear with spine-goal filters.
2. Hover each row action and confirm the actions read as start live practice, review recording, and delete routine.
3. Open a routine detail page and point out the spine goal, instructor cue, average stack, symmetry, and peak spine moments.
4. Start guided preview and confirm the HUD shows a separate Spine score and cue.
5. Run live practice and finish the routine; the completion dialog should show Alignment Result plus Best Spine.
6. Open `/demos/movement-capture`, verify bones/spine guide draw before recording, then save with spine goal, cue, and body focus.
7. Keep language coaching-oriented: say posture quality, spinal intent, and movement education; avoid medical assessment claims.

Repo gates before merge/push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Suggested First Slice

Build the pure spine metrics layer first.

Why:

- It does not force UI or schema decisions.
- It can be tested with existing recorded frames.
- It gives capture, playback, scoring, debug, and avatar visuals a shared language.
- It helps the next client conversation with concrete terms and screenshots.

First-slice deliverables:

- `movementSpineMetrics` helper.
- Tests for neutral stack, hip hinge, squat with stack, and asymmetric collapse.
- Debug-only display of instructor/player spine metrics.
- A one-line "Spine" score in the practice HUD.

## Roadmap Estimate

Overall posture studio foundation: about 100% of the current demo scope is implemented.

Spine intelligence layer: about 100% of the current demo scope is implemented. Future product hardening would add stored derived analysis, avatar-native guide materials, broader capture QA, and production assignment/reporting flows.
