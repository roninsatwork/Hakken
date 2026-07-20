# Movement Definitive Plan

Last reviewed: 2026-07-20
Status: THE single source of truth for all movement work. When this plan and any older movement/posture/replay plan disagree, this plan wins.
Owner: Anthony

## The Vision

Two goals. Nothing else.

1. **Recording**: the capture screen gives the client a countdown timer. The countdown only starts when the whole body is visible and detectable across all tracking points, so the client has time to walk back into view.
2. **Replay and Game**: use the new recordings to make the avatar and the instructor move correctly in Replay Studio and the Game.

When both goals are proven with evidence on the new recordings, this plan is done.

## Goal 1: Recording — DONE

The capture screen at `/demos/movement-capture` now behaves like this:

- Start arms the capture. No second press needed.
- If the body is not fully visible, a plain centred message says so
  ("Walk back until your full body is in view", "Walk back until your feet are visible").
- When the full body is detected, a 3-2-1 countdown appears in the middle.
- Recording starts only after the countdown finishes.
- Recordings save in the latest format (schema v3, Deep Capture) with hands, face,
  eyes, and dense body data.

Proven on 2026-07-20: a real 1,023-frame recording was captured, saved, and passed
the full automated Replay/Game proof.

Hardened later the same day:

- The countdown can no longer start while the player is seated or partly out of
  view. The pose model invents in-frame guesses for hidden legs/feet, so the
  start gate now also requires real per-landmark visibility confidence, one
  second of steady whole-body detection, and it cancels if the body is lost
  mid-countdown. Proven both ways in the browser: a seated clip stays armed
  with the walk-back message for 25 s, a full-body clip still records.
- Tracking crashes now recover instead of dead-ending: the engine rebuilds on
  CPU, then without segmentation, then a bounded number of full restarts. A
  crashed hand/face model rebuilds everything rather than silently dropping
  finger and face markers. The debug footer shows engine state and the raw
  last error.
- Note: sonae.ronins.co.uk runs an old deployment. None of this is live until
  Anthony asks for a commit/push/deploy.

## Goal 2: Replay Studio and Game — IN PROGRESS

Fix the avatar and the instructor so what was recorded is what plays back, in both
Replay Studio and the Game.

What "fixed" means — BOTH of these, on the new recordings:

1. **Automated evidence**: the recording passes the existing Replay-versus-Game
   comparison (`movement:replay-game:deep-local-proof` family) — every frame
   accounted for, all nine comparison boundaries matching, zero differences.
2. **Looks right**: Anthony watches the replay and the game in the browser and the
   avatar and instructor visibly move the way the person did.

Automated evidence alone is not acceptance. Looking right alone is not acceptance.
Both.

## Recordings

- **The anchor recording**: being re-recorded. `Full Motion Exercises - London`
  (1,023 frames) proved the whole pipeline on 2026-07-20 — capture, save,
  Replay, mounted Game, all nine boundaries — but it was captured before the
  strict start gate, so its first ~21 frames showed the walk-back and carried
  one setup error. Anthony deleted it on 2026-07-20 (its proof artifacts are
  retained under `tmp/movement-replay-lab/full-motion-exercises-london-*`) and
  is recording a clean replacement under the fixed countdown gate. The
  replacement becomes the anchor once it passes the same automated proof.
- **Older recordings are retired.** Everything else in the database is schema v1/v2
  and lacks hand, face, and body-surface data that cannot be backfilled. They are
  not acceptance evidence and must never be silently promoted. (Removing them from
  the database is Anthony's manual decision — nothing deletes recordings
  automatically.)
- **New recordings on demand.** When a fix needs evidence the London recording
  cannot supply (a specific movement, a specific body position), Anthony records a
  new one on the capture page. There is no fixed set of nine, no required titles,
  and no tier ladder. Each new recording must pass the same two-part acceptance
  above.

## Capture Screen Rules — never regress these

Learned the hard way. Any change to the capture screen must keep all of these:

- Tracking markers are visible, defaulting to ALL points.
- The walk-back message is plain language, centred, readable from a distance.
- The 3-2-1 countdown only starts on full-body detection.
- The footer/preflight debug panel stays (useful for us).
- "Latest capture format active" stays visible.
- No technical Deep Capture jargon or blocking error panels in the client's view.
- Never delete or overwrite recordings or videos.

## Working Rules

- **Evidence first.** Every Replay/Game fix ships with the automated comparison
  passing plus browser-visible proof (screenshot or watched run). Never ask
  Anthony to record or manually test as the debugging loop — automation reproduces
  and verifies; Anthony records only to create new content.
- **Ceremony is dropped.** The old plans' reviewer manifests, fixed
  nine-recording certification, exact-title representative tiers, and
  device/thermal review gates are no longer acceptance requirements. The tooling
  stays in the repo (it is useful diagnostics) but it does not gate this plan.
- **Plain language.** Status updates and plan edits say what works and what
  doesn't, in simple words, with no percentage bookkeeping across fifteen
  categories.

## Work Queue

1. Run the Replay Studio player and the Game (instructor + player avatar) against
   the London recording in the browser and record what looks wrong, if anything.
   The last human review (2026-07-14/16) reported jumpy replay and a torso bend
   that didn't carry into the Game; several fixes have landed since, so this needs
   a fresh look.
2. Fix whatever that review finds, one issue at a time: automated comparison pass
   plus browser proof for each fix.
3. When London plays correctly everywhere, Anthony records the next movements he
   actually wants in the product, and each one goes through the same two-part
   acceptance.
4. Retire the superseded movement/posture/replay plans into `docs/plans/completed/`
   with a "superseded by Movement Definitive Plan" note, and update the plan index.

## Superseded Plans

Once retired, these older movement documents are historical reference only:
movement-demo-*, movement-mirror-*, movement-studio-*, human-movement-*,
posture-studio-*, replay-avatar-*, replay-game-runtime-alignment,
replay-lab-*, replay-studio-*.

Their useful lessons (shared runtime contract, fail-closed proof identity, the
countdown/walk-back UX, never using Anthony as the debug loop) are carried into
this plan; their open checklists are not.
