> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Posture Studio Pre-Demo Polish Plan

Last reviewed: 2026-06-29
Status: draft for pre-demo polish
Scope: posture studio demo reliability, presenter flow, fallback readiness, and light UI polish.

## Goal

Make the posture studio feel calm, reliable, and client-ready without disturbing the working movement demo. The current demo is good enough to protect, so this plan is a focused polish pass: reduce live-demo risk, clarify the presenter path, and prepare graceful fallbacks.

Overall demo readiness estimate: 87%.
Current polish slice estimate: 65% implemented.

## Operating Principle

Treat the demo as a working pitch asset. Do not refactor, redesign, or expand the movement engine unless a rehearsal finds a specific blocker that cannot be solved by presentation, fallback, copy, or small UI polish.

Default approach:

- Preserve the existing guided preview and live practice flows.
- Prefer configuration, copy, checklist, and operator-runbook improvements before code changes.
- Keep the normal client path free of debug labels and technical language.
- Keep `?debugTracking=1` available only for rehearsal.
- Use the presenter-safe guided preview as the primary fallback if camera permission, lighting, or live tracking is uncertain.

Implementation changes to frozen movement-demo files require an explicit decision before starting.

## References

- Presenter runbook: `docs/operator/movement-demo-pitch-runbook.md`
- Manual smoke checklist: `docs/operator/movement-demo-manual-smoke-checklist.md`
- Live rehearsal notes: `docs/operator/movement-demo-live-rehearsal-notes-template.md`
- Existing pitch plan: `docs/plans/active/movement-demo-client-pitch-excellence-plan.md`
- Developer demo context: `docs/developer/movement-demo-client-recovery-plan.md`

## Phase 1: Demo Freeze And Evidence

Goal: prove the current working path and avoid accidental churn.

Tasks:

- Confirm the intended client route: guided preview first, live practice only if rehearsal is strong.
- Record the exact movement routine, presenter avatar, student avatar, browser, device, and route URL.
- Run the manual smoke checklist for the chosen route.
- Capture one clean rehearsal notes file using the live rehearsal template.
- Confirm the browser console is free of application errors during the presenter route.
- Confirm there are no unplanned implementation changes in frozen movement demo paths.

Acceptance:

- The presenter can start and finish the chosen route twice in a row.
- The fallback route is known and can be opened without developer explanation.
- Any remaining risk is written down with presenter wording or a mitigation.

## Phase 2: Presenter-Friendly Flow

Goal: make the experience easy to run under demo pressure.

Tasks:

- Decide the one preferred route from the library to the studio.
- Decide the exact opening, avatar-selection, check-in, movement, and close lines.
- Remove ambiguity from the rehearsal path: no searching for IDs, debug parameters, or alternate buttons during the live moment.
- Confirm the UI states support the spoken story: posture studio, guided practice, student, coach, alignment, posture sync, check-in.
- Make sure the presenter never needs to mention raw capture, telemetry, match scoring, or implementation details.

Acceptance:

- The presenter can run a 60-90 second version without improvising technical explanation.
- The viewer always knows whether they are choosing avatars, checking in, practicing, or seeing the wrap-up.
- The demo story works even if live camera tracking is skipped.

## Phase 3: Reliability Reset And Fallbacks

Goal: make recovery boring and predictable.

Candidate improvements:

- Add or document a one-step reset path back to the expected starting state.
- Confirm rematch, exit, reload, and guided preview recovery behavior.
- Confirm camera permission failure shows in-app guidance and does not force troubleshooting in front of the client.
- Prepare a known-good fallback route using `?guidedPreview=1`.
- Keep a rehearsal decision point: if live tracking is not clearly premium, use guided preview as the client route.

Acceptance:

- A failed or awkward live attempt can be abandoned quickly.
- Guided preview remains polished and does not show camera-error language once active.
- The presenter has a short fallback sentence ready.

## Phase 4: Light UI Polish

Goal: improve perceived quality without changing the demo mechanics.

Candidate improvements:

- Tighten status labels that appear during loading, check-in, and practice.
- Ensure loading states read as intentional setup, not a stalled app.
- Check button hierarchy for the preferred presenter path.
- Confirm spacing and responsive layout on the actual demo screen.
- Confirm camera tile, HUD, and wrap-up dialog do not cover each other.
- Avoid adding new marketing text, heavy redesign, or decorative UI.

Acceptance:

- The first screen reads as a premium posture studio.
- No client-facing label sounds like a generic game, raw AI demo, or debugging tool.
- The presenter path is visually obvious without adding instructions inside the app.

## Phase 5: Rehearsal And Go/No-Go

Goal: decide the client route using evidence, not optimism.

Rehearsal sequence:

1. Start local app and Convex dev services.
2. Open the movement library.
3. Run the guided preview path end to end.
4. Run the live path with `?debugTracking=1`.
5. Rehearse the safe movement sequence at half speed.
6. Rehearse it at meeting speed.
7. Remove debug mode and run the chosen client path once.

Go criteria:

- Guided preview is clean.
- Live practice is clean enough, or guided preview is accepted as the route.
- Avatar posture starts relaxed and intentional.
- Camera permission status is known before the client sees the screen.
- The presenter can recover from a bad state in under 20 seconds.
- Browser console has no application errors.

No-go triggers:

- Camera permission cannot be resolved and the presenter route depends on live mode.
- The avatar shows obvious broken posture during the safe movement sequence.
- The route cannot be reset quickly after a failed attempt.
- The UI exposes debugging or error language in the client-facing flow.

## Suggested Pre-Demo Scope

Highest-return work before the demo:

1. Run and record a full guided preview rehearsal.
2. Run a live-camera rehearsal with debug overlay.
3. Decide whether the client route is guided preview or live practice.
4. Add only the smallest polish fixes needed by that route.
5. Update the presenter card/runbook with the final route and fallback wording.

Defer until after the demo:

- Full body-retargeting changes.
- New avatar behavior.
- Movement capture redesign.
- Scoring model changes.
- Broad refactors under the frozen movement demo paths.

## Completion Definition

This plan is complete when:

- The chosen client route is documented.
- The fallback route is documented.
- The smoke checklist and rehearsal notes have been filled for the actual demo device/browser.
- Any last-minute implementation changes have passed the local verification gate.
- The presenter has a short script and a short fallback sentence.

## Implementation Notes

2026-06-29:

- Added a presenter reset affordance to the play HUD so the studio can return to the avatar lobby after clearing calibration, instructor playback, and scoring state.
- Added a direct guided-preview recovery action when the live camera needs attention, giving the presenter a quick fallback without troubleshooting camera permissions in front of the client.
- Added component coverage for the reset and guided-preview recovery controls.
- Focused verification passed: `npm run test:run -- MovementPlayComponents`.
