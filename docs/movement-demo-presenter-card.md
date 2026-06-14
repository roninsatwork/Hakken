# Movement Demo Presenter Card

Last reviewed: 2026-06-14
Audience: presenter running the premium posture studio demo.

Use this as the quick pre-call checklist. Use `docs/movement-demo-pitch-runbook.md` for the full runbook.

## Primary Route

1. Open `http://localhost:3000/demos/movements`.
2. Choose **Guided Preview** for **Tall Spine Flow**.
3. Choose the student and coach avatars.
4. Click **Begin Practice**.
5. Confirm the studio opens full-screen.
6. Confirm the HUD says:
   - **Guided Practice**
   - **Preview Mode**
   - **Posture Sync**
7. Do not mention camera permission if using Guided Preview.

## Client Story

Opening:

"This is the posture studio concept. The child chooses a student avatar and a coach avatar, then follows a calm guided practice for posture, balance, and confidence."

What to point out:

- The child has a student avatar.
- The teacher has a coach avatar.
- The experience feels like practice, not scoring or judgement.
- The product direction is posture awareness for children aged 8-14.

Close:

"The value is repetition without pressure. It lets a child practise posture awareness in a way that feels personal, calm, and premium."

## Do Say

- posture studio
- guided practice
- student
- coach
- posture check
- alignment
- posture sync
- confidence

## Do Not Say

- game
- match
- fight
- score
- raw AI
- capture data
- debugging

## Live Mode Only If Rehearsed

Only show live camera mode if it has passed the same-day rehearsal.

Live rehearsal route:

`/demos/movements/{movementId}/play?debugTracking=1`

Accept live mode only if:

- Head and face stay expressive.
- Arm raises look smooth.
- Neutral stance looks relaxed.
- Small side bends do not snap.
- Camera tile does not cover Posture Sync.

If live mode is not clearly good, use Guided Preview.

## Emergency Fallback

If camera permission, tracking, or body motion looks weak:

1. Stop troubleshooting.
2. Return to the movement library.
3. Open **Guided Preview**.
4. Say:

"I'll show the guided practice path first. The live posture check-in is available when the camera is connected, but this preview shows the coach/student experience and the visual direction."
