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

## Live Game Fix Plan (2026-07-21) — the current work

Anthony watched the new recording (`Full Mmotion Set London`,
`px78w9xf95hx7kzh17gdbcvqn18awdp7`) in both studios. Replay is good. The
ordinary live Game is broken in two specific ways, both now reproduced
automatically with `scripts/movement-debug/capture-ordinary-game-live-proof.mjs`
(fake full-body webcam clip, real live Game route, screenshots — no human
needed to reproduce):

Confirmed by Anthony 2026-07-21, tested with the correct recording
(`Full Mmotion Set London`) and the startup gate behaving exactly as intended
(you MUST be full-frame before start — this is correct and must not change;
no UI change is wanted, only the avatars must move correctly):

1. **Player avatar frozen (case B).** Fully in frame, game started and
   scoring, and the player avatar still does not follow at all. In the
   automated full-frame repro the player DID follow (gate reads "applied"),
   so the freeze is input/condition specific and not yet reproduced. Next:
   measure whether the applied player avatar bones actually change frame to
   frame (not just whether the gate says "applied"); a stuck-but-"applied"
   avatar means the retarget/calibration output is rest-like, a rejected gate
   means the sync/hold path. Suspect: player calibration
   (`useMovementLivePlayerSetup`, the sliding setup) not completing for the
   live body even though the game starts.
2. **Instructor looks wrong (case A).** The instructor plays the recording
   but head and arms render wrong — the same head-pitch/arm-reach fidelity
   Anthony saw in Replay. Deterministic and fully reproducible from the
   recording, so it can be fixed and proven with screenshots.

Note: the `.webm` files under `dense-capture/clips` are throwaway
pretend-webcam videos for the automated test (they stand in for a live
camera), NOT recordings. Only the full-frame clip is used, so the startup
gate passes exactly as in real use.

Why this could coexist with the passed alignment proof: the nine-boundary
proof drives the Game through the recorded packet adapter, which bypasses the
two live input doors (webcam → player application, stored recording →
instructor lane). The shared post-input pipeline is genuinely aligned; these
two doors are the remaining unshared code and they are where both defects
live.

### 2026-07-21 progress

- **Live player freeze — fixed at the most likely cause.** The avatar's
  source-sync gate required the applied motion frame's timestamp to exactly
  match the current landmark. Correct for recorded scrubbing, but the live
  webcam motion frame is always one render-tick behind the newest landmark,
  so on some machines' render timing the gate rejects every frame and freezes
  the avatar. `shouldWaitForMovementAvatarSourceSync` now never waits for a
  `live-webcam` motion frame (recorded playback stays strict). Pure and
  unit-tested (10 tests). This freeze is timing-dependent, which is why it
  showed on Anthony's machine but not in a clean test clip — so the automated
  full-frame repro could not reproduce it, and the real confirmation is
  Anthony seeing his avatar follow in a live game.
- Automated live-game repro after the fix: player follows (moved, 3 distinct
  poses, gate "applied"). Instrumentation (`window.__sonaeMovementLivePlayerGate`)
  left in place for live diagnosis.
- Still open: instructor head/arms fidelity (case A — the floor-stare from
  looking at the screen while recording).

### Fix steps (in order)

1. **Instrument the reproduction.** The harness dumps the avatar's internal
   gate verdicts (`window.__sonaeMovementAvatarDebug`, frame application
   proof counters) alongside each screenshot so every run states *why* a
   frame was or was not applied.
2. **Fix the player apply gate.** Find the gate that rejects live motion
   frames (suspect: frameId/capturedAt mismatch between `landmarksRef` and
   `motionFrameRef`, or the hold-last-pose path), fix it in the shared
   runtime, and add a unit test that reproduces the exact reject with
   live-style refs.
3. **Close the instructor door.** Numerically diff the Game instructor lane
   (instructor retarget source model + recorded motion frames) against
   Replay's rendering of the same frames; fix so both consume identical
   instructor inputs. Preferred shape: ONE loader — the ordinary Game reads
   the recording through the same conversion Replay uses, so the second door
   stops existing as separate code.
4. **Regression-lock the live route.** The ordinary-game harness becomes an
   npm command and part of acceptance for any future avatar/instructor
   change, alongside the existing packet proof.

### Acceptance for this fix — seen working, no excuses

This item is done ONLY when all of the following hold, in this order:

- The harness run shows the player avatar visibly mirroring the fake webcam
  clip (arms out on screen → arms out on the avatar) across the screenshot
  sequence, and the instructor visibly matching Replay's rendering of the
  same recording. Screenshots are the evidence, attached to the run.
- The automated packet proof still passes (no regression to the aligned
  pipeline).
- Anthony opens the live Game himself and sees his avatar follow him and the
  instructor perform the recording correctly. His eyes are the final gate.

Explanations of why the code "should" work do not count as evidence for this
item. Checksum or test output alone does not count. Only the rendered, moving
avatars count.

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
