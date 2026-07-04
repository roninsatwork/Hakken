# Movement Studio Reward Presentation Fix Plan

Last reviewed: 2026-07-03
Status: planning note only. No implementation work has been done.
Audience: agents working on the temporary Posture Studio reward, scoring, sparkle, or HUD experience.

## Purpose

The movement studio reward mechanic appears to be usable, but the reward presentation can make celebratory words and sparkles feel off screen or detached from the student avatar.

This plan documents the likely causes, the preferred fix order, and the verification expected before touching the frozen movement demo implementation.

## Boundaries

The movement demo is frozen unless the user explicitly asks to reopen it or a required quality gate is broken.

Frozen paths:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `convex/movements.ts`

This plan is not permission to redesign the movement studio. It is a scoped repair plan for reward visibility and placement only.

Do not refactor avatar motion, lower-body tracking, retargeting, or replay-lab behavior while fixing reward presentation. If avatar body motion is reopened separately, read `docs/developer/movement-demo-retargeting-approach.md` first.

## Current Reward Flow

Scoring lives in `src/app/(dashboard)/demos/movements/_lib/movementScoring.ts`.

Current behavior:

- Sync above `85` increments combo.
- Sync below `65` resets combo and clears feedback.
- Combo thresholds trigger reward text such as `PERFECT ALIGNMENT`, `FLAWLESS SYNCHRONIZATION`, and `UNSTOPPABLE MOMENTUM`.
- A smile expression can trigger `ZEN BONUS ACTIVE`.
- `useMovementMatchScoring` emits `feedbackMsg` for `MovementFeedbackOverlay`.
- `MovementSparkles` appears when sync is at least `85`.

The core reward logic is intentionally simple and should remain simple unless user feedback says the mechanic itself feels wrong. The first suspected issue is presentation.

## Suspected Issues

### Feedback text can exceed the viewport

`MovementFeedbackOverlay` renders reward text centered in a full-screen absolute overlay. The message uses large text and animates to a larger scale:

- `text-6xl`
- animated `scale: 1.5`
- exit `scale: 2`
- no max width
- no wrapping strategy
- no responsive text size

Long reward strings can become wider than the viewport. The studio root also uses `overflow-hidden`, so the text is clipped rather than allowed to scroll or wrap. This makes the reward look as if the words are off screen.

Most exposed strings:

- `FLAWLESS SYNCHRONIZATION`
- `UNSTOPPABLE MOMENTUM`
- `TOTAL BODY HARMONY`
- `PRECISION AND POWER`

### Sparkles may not share the player avatar transform

The player avatar is rendered with a positive X position offset in the play route. `VrmAvatar` applies that offset to the avatar group.

`MovementSparkles` computes particle positions directly from normalized landmarks:

- `baseX = (landmark.x - 0.5) * -15`
- `baseY = (0.5 - landmark.y) * 15`
- `baseZ = (landmark.z || 0) * -15 * 0.5`

The sparkle component does not receive or apply the same player avatar position offset. Depending on the input landmark source, this can make particles appear detached from the student avatar or too far across the world.

### Tests do not cover layout fit

The existing play component tests check that feedback text renders when present. They do not assert that the longest reward text fits inside the viewport, avoids HUD overlap, or remains attached to the player avatar.

## Fix Strategy

Prefer the smallest changes that make the reward presentation reliable.

### Phase 1: Confirm With Visual Reproduction

Goal: reproduce the issue before changing behavior.

Tasks:

- Launch the movement studio in guided preview or debug mode.
- Trigger or force the longest feedback strings in a local-only test harness or temporary debug route state.
- Capture desktop and mobile screenshots.
- Record whether text is clipped horizontally, vertically, or hidden behind HUD controls.
- Record whether sparkles are visually attached to the player avatar hands and feet.

Acceptance:

- At least one screenshot or written observation confirms the text clipping pattern.
- Sparkle placement is classified as one of:
  - aligned with avatar
  - detached from avatar
  - hidden by camera/frustum
  - unclear without more instrumentation

### Phase 2: Make Feedback Text Viewport-Safe

Goal: keep celebratory feedback visible on desktop and mobile without changing scoring.

Preferred implementation direction:

- Add a viewport-safe width to the feedback text container.
- Center text and allow wrapping.
- Use responsive font sizes rather than fixed `text-6xl`.
- Reduce the maximum animated scale.
- Consider `text-wrap: balance` where appropriate.
- Keep the overlay pointer-events disabled.
- Keep the reward visually energetic but bounded.

Possible shape:

- wrapper max width around `min(88vw, 920px)`
- mobile font around `2rem` to `2.75rem`
- desktop font around `4rem` to `5rem`
- animate to about `scale: 1.08` or `1.15`
- exit without growing beyond the safe container

Acceptance:

- `FLAWLESS SYNCHRONIZATION` fits on a narrow mobile viewport.
- `UNSTOPPABLE MOMENTUM` fits on a standard desktop viewport.
- Text stays readable and centered.
- Text does not cover critical HUD controls for the full two-second display window.

### Phase 3: Align Sparkles With Player Avatar

Goal: reward particles should feel attached to the student avatar.

Preferred implementation direction:

- Pass the player avatar position offset into `MovementSparkles`.
- Apply the offset to sparkle world positions, or render sparkles inside a group that uses the same position offset.
- Keep the component generic enough for future instructor/player use.
- Avoid changing avatar rigging or landmark normalization.

Open question:

- If sparkles should attach to the avatar mesh rather than raw screen/body landmarks, a later implementation may need a stronger anchor from `VrmAvatar`. Do not do that in the first pass unless simple offset alignment is proven insufficient.

Acceptance:

- Sparkles appear around the student avatar wrists and ankles during high sync.
- Sparkles remain visible with the player at the existing `positionOffset`.
- Sparkles do not appear around the instructor unless explicitly intended.

### Phase 4: Add Regression Coverage

Goal: prevent the same reward visibility issue from returning.

Recommended coverage:

- Component test for all reward strings to ensure rendering does not rely on a single short sample.
- Playwright or visual check for the longest reward strings on:
  - mobile viewport
  - laptop viewport
  - wide desktop viewport
- Optional 3D/canvas screenshot check to verify sparkles are nonblank and near the player side during high sync.

Component tests alone cannot prove browser layout fit. Use a browser-level check for the actual clipping bug.

Acceptance:

- The longest feedback string remains inside the viewport in browser verification.
- No reward overlay blocks essential controls.
- Existing movement scoring tests still pass.

## Product Decisions To Keep Small

Do not redesign the reward system as part of this fix.

Avoid these unless the user explicitly asks:

- replacing combo scoring
- changing sync thresholds
- changing score multipliers
- adding achievements, currency, levels, or persistent rewards
- redesigning the HUD
- changing avatar selection or avatar movement

Safe optional refinements:

- Shorten some reward strings if visual fit still feels too heavy.
- Move long praise copy into the HUD or completion dialog and keep the center burst short.
- Add a compact reward toast lane if center text remains distracting.

## Definition Of Done

The reward presentation fix is done when:

- Long reward words fit inside the viewport on mobile and desktop.
- Sparkles visually attach to the student avatar or are intentionally removed/hidden if they cannot be made reliable.
- Scoring logic still behaves as before.
- Focused movement tests pass.
- Browser-level verification confirms the visible issue is fixed.
- The final summary clearly states whether only presentation changed or whether any reward mechanic changed.

## Suggested Verification Commands

For implementation work limited to reward presentation:

```bash
npm run verify:env
npm run lint:all
npm run check
git diff --check
```

If the implementation changes scoring, game state, avatar rendering, or the play route more broadly, also run:

```bash
npm run build
```

Manual verification should include:

- Guided preview route.
- Live practice route if camera access is available.
- Longest feedback text on mobile and desktop viewports.
- High-sync sparkle visibility around student wrists and ankles.
