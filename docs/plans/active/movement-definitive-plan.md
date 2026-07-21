# Movement Definitive Plan

Last reviewed: 2026-07-21
Status: THE single source of truth for all movement work. When this plan and any older movement/posture/replay plan disagree, this plan wins.
Owner: Anthony

## HANDOFF (2026-07-21) — read this first

You are picking up mid-work. Read this section, then the rest of the plan.

**Goal (unchanged, do not re-question it):** Replay Studio and the live Game must
make the avatar and the instructor follow the recorded movement. Acceptance is the
follow-fidelity rule below (0.1 per body segment) AND Anthony seeing it look right.

**Environment / rules:**
- Work on branch `dev`. Current HEAD: `4ffa204c6`. Everything below is committed and pushed.
- Node 22.13.0 for trusted checks. If `npx -p node@22.13.0` can't reach the network, cached Node is at
  `/Users/ants/.npm/_npx/1bd81ab945294a66/node_modules/node/bin` — prefix commands with
  `PATH=/Users/ants/.npm/_npx/1bd81ab945294a66/node_modules/node/bin:$PATH`.
- **sonae.ronins.co.uk is an OLD deployment** — always test on `localhost:3000`. See [[check-which-environment-anthony-sees]].
- Never delete recordings/videos. Do not commit/push without Anthony asking (he has been approving each commit).
- Read AGENTS.md.

**The only recording that matters:** `Full Mmotion Set London`, id
`px78w9xf95hx7kzh17gdbcvqn18awdp7`, schema v3, full body, 822 frames. It is the ONLY
recording in the database. It contains one fast ~180° turn (around frame 300–308) and forward folds.

**What is DONE and committed today (dev):**
- `cdee59126`/`3dd660b19` — reliable capture + **live player-freeze fixed** (the avatar's
  source-sync gate froze the live webcam on a render-timing race;
  `shouldWaitForMovementAvatarSourceSync` now skips only the id-less live-webcam timestamp path).
  Anthony confirmed his avatar follows now.
- `8750e104c` — **head floor-stare fixed** (recorded head is now neutral-relative so looking
  at the screen while recording no longer makes the avatar stare at the floor).
- `872da795d` — **follow-variance rule** documented (see below).
- `4ffa204c6` — **upper-arm follow fixed** at moderate confidence (quartic→squared blend in
  `movementAvatarRetargetSegmentApplicationDecision.ts`).
- Body follow (torso, arms, forearms, thighs, shins) is WITHIN 0.1 across the whole video.

**THE "HEAD SPIN" BUG — SOLVED 2026-07-21 (root cause was NOT the head):**
- **The old theory in this section was wrong.** The head-slerp shortest-path theory was refuted
  by data: per-frame telemetry (`playerApplied.avatarHead` in `mounted-game.json`) showed the
  head bone reaching its target exactly every frame (target-vs-applied yaw delta ≈ 0, quaternion
  dot ±1.0). The head was innocent. Also wrong: the recording does NOT contain a fast turn at
  frames 300–308 — the person stands nearly still there. The real fast ~180° turn is at frames
  **~106–127**.
- **Actual root cause (proven):** the live root-motion pipeline
  (`appendMovementRootMotionHistoryFrame` in `movementRootMotion.ts`) kept a sliding 180-frame
  history and re-derived the heading/position calibration from the window's OLDEST frame each
  frame. When a real turn scrolled through that oldest slot, the calibration reference rotated
  ~360°, so the avatar ROOT counter-rotated in a phantom full spin exactly 180 frames (~6 s)
  after the real turn. Every head-error cluster matched: real turns at ~106/181/231 echoed at
  ~286/361/411. The head merely rode the spinning root; headChain was the only yaw-sensitive
  metric, which is why it alone flagged the problem. (This is also why the two root-yaw lerp
  fixes changed nothing — they altered the response to the phantom heading, not its source.
  Replay Studio's batch analyzer always calibrates from frame 0, which is why Replay never
  showed it.)
- **The fix (in working tree, not yet committed):** pin the calibration anchor frame during history trimming in
  `appendMovementRootMotionHistoryFrame` — the first qualifying frame is kept at position 0
  forever, so heading and root position stay measured against the same reference, matching the
  batch analyzer's semantics. Regression test added ("keeps heading stable after a past turn
  scrolls out of the trimmed history").
- **Proof (run `root-anchor-fix`, 2026-07-21):** phantom zone frames 280–310 head error
  1.90 → **0.021 max**; echo clusters 358–378 and 411–430 eliminated; head frames >0.1 dropped
  123 → 62; alignment 0 exact checksum divergences; screenshot of the zone shows both avatars
  facing the camera like the recorded person.
- **Known pre-existing issues, NOT caused by this fix (verified identical in pre-fix runs):**
  frame 812 `avatarRoot.appliedY` replay-vs-game ease delta 0.083 (tolerance 0.05) — the single
  visual-tolerance failure in every recent proof run; and frames 119–122 `rightUpperArm`
  sourceError ~0.10–0.12, marginally over the 0.1 bar during the real fast turn (the earlier
  "body is within 0.1 everywhere" claim missed these four frames).
- **Remaining head-error clusters (the real turns, avatar lags a fast spin):** 103–127 peak
  ~1.7, 183–199 peak ~0.43, 233–252 peak ~0.54. These are genuine under-follow during fast
  real turns — the avatar turns but lags/underswings. Separate, smaller problem; decide with
  Anthony whether it blocks acceptance or is acceptable motion smoothing.

**VALIDATION ON TWO RECORDINGS — DONE 2026-07-21 (anchor-pin fix confirmed on both):**
Anthony recorded a second video, so the fix was proven on both, on identical current code
(same fresh Convex export, run `full-exercises-london-2-proof` for the new one and
`old-recording-fresh-export` for the old one):
- `Full Mmotion Set London` (`px78w9…`, 822 frames): phantom zone 280–310 head error
  1.90 → **0.021**; 0 exact divergences; only pre-existing frame-812 ease-tolerance failure.
- `Full Exercises London #2` (`px793dke…`, 775 frames): **full proof passes cleanly, 0
  tolerance failures**. A dedicated phantom detector (rendered root spinning while the source
  body is still) found **NONE** — every real body turn (frames 298, 419, 658, 709) passes with
  no spurious echo ~180 frames later. This is the decisive cross-check: the sliding-window bug
  does not reappear on a fresh recording.
- Remaining >0.1 clusters on BOTH videos are all genuine fast-motion lag, never phantoms:
  the new video's head cluster 668–689 (peak 1.72) is a real ~300°-in-12-frame head turn (the
  person looked over their shoulder; source headYaw sweeps continuously, avatar smoothing lags
  mid-turn then resettles < 0.1), and shins 769–774 are a real fast leg movement in the final
  six frames. Same "avatar under-follows very fast motion" category as the old video's
  103–127 / 183–199 / 233–252 clusters.

Original plan for the turn-test recording (kept for reference): spin left AND spin right, one
slow full turn and one fast one, plus a head-turn with the body held still. `Full Exercises
London #2` covers moderate turns in both directions and a fast head-turn; a future take with a
full 180° spin each way would stress it further but is not required — the fix is proven.
Neither recording may ever be deleted.

**THE PLAYBACK-SPEED BUG — found 2026-07-21 when Anthony watched the game ("she moves
faster than I did", "everyone is mangled"):**
- **Root cause 1 (the big one):** the ordinary Game's instructor playback advanced **one
  recording frame per `requestAnimationFrame` tick** (`useMovementMatchScoring` game loop →
  `advanceInstructorFrame()` did `frameIndex + 1` with no clock). Playback speed equalled the
  display refresh rate: ~4.4× real speed on a 60Hz screen, ~8.8× on a 120Hz MacBook.
- **Root cause 2 (compounding):** recordings *declare* `fps: 30` (hardcoded in
  `saveMovementRecording`) but Deep Capture actually tracks at **~13-14fps** (measured: 73ms
  median frame interval on both recordings). Anything trusting the declared fps plays ≥2.2×
  fast. The per-frame `timestamp`/`capturedAt` fields DO carry the true cadence — the data is
  correct, the consumers were wrong.
- Replay Studio and the recorded-packet path already honoured timestamps
  (`resolveMovementReplayFrameDelay`), which is why the mounted-game proof never caught this:
  the proof drives frames one-by-one and never exercises the wall-clock lane.
- **The "mangled" look and most "avatar lags fast motion" clusters are symptoms:** at 2-9×
  playback the per-joint smoothing (tuned for real time) falls behind and blends limbs into
  poses the person never made. The remaining >0.1 clusters listed above must be re-measured
  at true speed before treating them as real followability problems.
- **Fix (in working tree):** `useMovementInstructorPlayback` now builds a per-frame timeline
  from recorded timestamps (fallback 30fps for legacy frames, per-step clamp 8–250ms) and
  `advanceInstructorFrame` follows accumulated wall time — pause-safe, tab-throttle-safe
  (250ms max step), display-rate independent. Scrubbing resyncs the clock. The
  `sourceFrameIndexRef` lane (mounted proofs) is untouched, so alignment proofs stay
  frame-driven and deterministic. Unit tests cover 60Hz-tick pacing, stall capping, and
  scrub resync.
- **Open (deliberately not changed yet):** the false `fps: 30` stamp at save time.

**THE INSTRUCTOR-LANE UNIFICATION — THE CURRENT TOP PRIORITY (agreed 2026-07-21):**

*Anthony's requirement, verbatim intent: the Game's instructor must work EXACTLY like the
Replay Studio avatar. Replay Studio is approved; the Game instructor is not. He called this
early ("the instructor should work the same as the replay studio") and the analysis proved
him right. Do not re-litigate this.*

**Why she is broken in the Game but fine in Replay Studio (proven 2026-07-21):**
- Replay Studio renders the recording through the PLAYER lane: un-mirrored frames +
  calibration from `buildMovementPlayerSetupFromPrefix` (the recording's purpose-captured
  setup prefix) → `VrmAvatar` with `isPlayer` (replay-lab/page.tsx ~1562).
- The Game's instructor is a SEPARATE pipeline: frames are mirrored
  (`getReflectedInstructorMotionLandmarks`), calibration comes from
  `buildInstructorRetargetSourceModel` — a heuristic that picks ONE "most neutral" frame
  from the whole video — plus `buildMovementRecordedInstructorCalibration` and instructor
  lag compensation (`useMovementInstructorPlayback.ts`).
- The recording's arm data is noisy (bone-length CV 9–17% on arms, left/right mean length
  mismatch up to 28% — measured; legs are 3–7% and fine). A single guessed calibration
  frame BAKES that one frame's arm distortion into every rendered pose; the prefix-based
  player calibration does not. Same data, two lanes, only one looks right.
- Why every proof passed anyway: the replay-vs-game instructor comparison checks the
  instructor pipeline against a COPY OF ITSELF in replay-lab (three-party proof). Nothing
  ever compared the instructor lane to the approved player lane. Consistency ≠ correctness.

**THE FIX (recommended and agreed direction — unify to one lane):**
1. In the Game (`[id]/play/page.tsx`), drive the instructor avatar from the same inputs
   Replay Studio uses: the recording frames UN-mirrored, calibration + retarget source
   model from `buildMovementPlayerSetupFromPrefix(loadedFrames)`. The instructor keeps her
   own VRM model, position, and name — the MOTION pipeline is what unifies.
2. Delete/stop using the bespoke instructor motion path for recordings:
   `buildInstructorRetargetSourceModel` neutral-frame heuristic,
   `getReflectedInstructorMotionLandmarks` reflection, and
   `buildMovementRecordedInstructorCalibration` — unless a specific consumer still needs
   them for something other than driving the instructor avatar.
3. Update replay-lab's instructor-proof lane to the SAME construction in the SAME change,
   so the Replay-vs-Game alignment proof compares the unified lane on both sides.
4. Keep the wall-clock playback clock (already fixed) — unification must not regress it.
5. Close the measurement gap permanently: the mounted-game proof must record the
   INSTRUCTOR's follow-vs-recording telemetry per frame (as `playerVisual` already is),
   so the instructor can never silently diverge again.

**WHAT WAS ACTUALLY BUILT (2026-07-21) — narrow calibration fix, mirror kept:**
Anthony chose to KEEP the "mirror the coach" behavior (you mirror the instructor;
scoring compares mirrored-player vs identity-instructor). So the full lane unification
above was NOT taken — it would have changed the game to "copy exactly" and shifted
scoring. Instead, only the mangling root cause was fixed:
- The Game instructor now gets its calibration AND retarget source model from
  `buildMovementPlayerSetupFromPrefix(effectiveLoadedFrames)` — the recording's stable
  setup prefix, the same robust baseline the Replay student uses — instead of
  `buildInstructorRetargetSourceModel` (single-guessed-neutral-frame) +
  `buildMovementRecordedInstructorCalibration`. See `[id]/play/page.tsx` (`instructorPlayerSetup`).
- The instructor's mirror mapping, avatar role, render path, and the whole
  `buildRecordedMovementMotionFrame` instructor lane are UNCHANGED — so scoring semantics
  and the mirror contract are preserved (all mirror-contract tests still pass).
- Verified visually (ordinary-game live proof, fake webcam, `instructor-narrow-fix-proof`):
  the instructor renders as a coherent human through arm raises and leans — the mangling is
  gone — and still mirrors, with scoring climbing normally. Full suite green (1374 tests).
- Not done here: the `buildInstructorRetargetSourceModel` neutral-frame heuristic still
  exists and is still used for the knee-lift retarget ANALYSIS (not for driving the avatar);
  leave it. The noisy-arm-data offline filter (below) was not needed — the stable neutral
  reference alone resolved the visible mangling.

**CORRECTED DIAGNOSIS (2026-07-21, after Anthony rejected the narrow fix — instructor still
mangled in folds): REPLAY STUDIO HAS AN ACCEPTANCE JUDGE; THE GAME DOES NOT.**
- The narrow calibration fix improved arms in ordinary moves but folds still render mangled
  in the Game (fold shown as a collapsed squat; head cranked upward mid-fold — likely the
  head-level logic fighting the folded torso).
- Verified in Replay Studio at the exact fold frames (frame 190 of `Full Exercises London
  #2`): the "AVATAR FOLLOW" judge reports **blocked-for-acceptance / support-contact /
  leg-motion conflict**, and the Replay avatar HOLDS A SAFE POSE (neutral/standing) instead
  of applying those frames. Worst frame 195 flagged `visual-proof-missing`. In other words:
  **Replay Studio looks right partly because it refuses to render the untrustworthy fold
  frames.** The Game instructor has no such gate and applies them raw — that is the mangling.
- So "make the instructor work like Replay Studio" concretely means: give the Game
  instructor the same follow-acceptance gating (hold last-good/neutral pose through blocked
  frames), not just the same calibration.
- **Product decision this raises (Anthony's call):** with the gate, flagged sections (the
  folds in this recording) will NOT animate — the instructor holds a pose through them,
  exactly as Replay does today. The alternative is the deeper work of making folds actually
  retarget correctly (fold-vs-squat interpretation + head-during-fold), which is what would
  let the full routine render. Options: (A) gate now to kill the mangling, then (B) fix fold
  retargeting so gated sections shrink over time. A then B is the recommended order.

**ACCEPTANCE — read carefully, this is the contract:**
- The bar is VISUAL and Anthony's alone: he opens Replay Studio and the Game on
  `localhost:3000` with the same recording, and the Game instructor's movement is
  indistinguishable from the Replay Studio avatar he already approved. He must SEE it
  working.
- Automated evidence (alignment proof, follow metrics, screenshots at the known trouble
  moments — the arm raises ~21s/24s, the fold ~13s, the head turn ~48s) is REQUIRED
  supporting evidence but NEVER sufficient. "The metrics pass" or "the code now does X"
  is not done. If Anthony says it looks wrong, it is wrong — find why, fix, show again.
- Do not close this item with an explanation. Close it with Anthony watching it work.

**If it still looks wrong in BOTH surfaces after unification:** then the residual problem
is the noisy recorded arm data itself, which now affects both lanes equally. The next step
in that case (and only then) is offline arm filtering at playback: smooth arm landmarks
across time (recordings are complete files — non-causal filtering is allowed) and enforce
constant limb lengths before retargeting. Provable by the bone-length CV metric dropping,
judged — as always — by Anthony's eyes.
- **Recording technique (learned 2026-07-21 from the failed "London Full Move 2" take):** the
  Deep Capture save gate requires face AND eye-gaze evidence in **≥ 50% of frames**
  (`movementFrameCodec.ts` — `faceCoverage`, applied to the `face` and `eyesGaze` channels in
  `summarizeMovementDeepCaptureChannels`). A turn-heavy recording spends much of its time facing
  away, so: **face the camera and hold for a couple of seconds between each turn, keep each spin
  brief** — roughly, at least one second facing the camera for every second mid-spin. If a take
  fails the gate anyway, ALWAYS download the local packet backup before closing the dialog
  (never lose a take).

**OPEN DESIGN DECISION — is the 50% face/eyesGaze coverage bar realistic? (raised 2026-07-21):**
Real clients will wear glasses and must stand far enough back to be full-body in frame.
- Face landmarks are robust to ordinary clear glasses; turning away and distance are what break
  that channel.
- Iris-derived gaze is the fragile channel: lens glare (worst with a bright screen in front of
  the player — the standard setup), frames clipping the eye corners, strong prescriptions, and
  the eye region being only a few pixels at full-body distance. Tinted/reactive lenses kill it.
- The avatar/instructor follow work does NOT depend on gaze at all, yet incomplete `eyesGaze`
  evidence blocks saving.
- **Evidence to gather:** read a downloaded packet backup from a far-back, glasses-on take and
  count frames with face landmarks vs gaze vectors. Face present + gaze missing = the
  glasses/distance signature; both missing together = turning away.
- **Options (Anthony's call, do not change unilaterally):** keep 50% for `face` but lower the
  `eyesGaze` ratio; or make gaze a recorded-when-available bonus channel rather than a
  save-blocking requirement. Either weakens the evidence guarantee deliberately — decide, then
  change.

**How to measure (the loop):**
- Full-video alignment + follow proof (≈10 min, needs the dev server running on :3000):
  `npm run movement:replay-game:deep-latest-proof -- --base-url http://localhost:3000 --local-test-auth --secret sonae-local-test-auth --export tmp/movement-replay-lab/full-motion-set-london-proof-2026-07-20/source.convex-export.zip --out tmp/movement-replay-lab/<name>`
  Then read `tmp/movement-replay-lab/<name>/commissioning-proof/packet-proof/mounted-game.json`:
  head follow = `playerVisual.semantic.headChain.sourceError` per frame; body segments =
  `playerVisual.segments.*.sourceError`; alignment = `comparison.json` `exactChecksumDivergenceCount`.
- Live-game visual repro (screenshots, fakes the webcam, no camera needed) — local diagnostic tool
  (uncommitted): `scripts/movement-debug/capture-ordinary-game-live-proof.mjs --recording-id px78w9xf95hx7kzh17gdbcvqn18awdp7 --clip far-camera-2026-07-18T10-52-32Z.webm --out tmp/movement-replay-lab/<name>`.
- Everything is shared runtime, so a fix lands in Replay AND Game together; the alignment proof
  should stay at 0 exact divergences (there are ~1–4 pre-existing avatar-ease warm-up tolerance
  frames around 104–105 that are a separate, accepted issue — do not confuse them with the head bug).

**Do not chase:** foot pointing direction (exempt by the rule — noisy metric, foot lands right);
the 3 warm-up-frame tolerance divergences (pre-existing ease settling).

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

### RULE — follow-fidelity variance (remembered standard)

The instructor and the player avatar must follow the recorded movement with a
maximum direction variance of **0.1** for every body segment: torso, spine,
upper arms, forearms, thighs, and shins. This is the acceptance bar for "the
avatar follows the recording."

- Measured 2026-07-21 on `Full Mmotion Set London`: upper body average
  direction error **0.002** (p95 0.017, max 0.064) and lower body average
  **0.021** (p95 0.039) — inside 0.1. Body follow passes.
- **Foot pointing direction is exempt from the 0.1 bar** and tracked
  separately. Foot *direction* is an inherently noisy metric — a tiny foot
  position wobble reads as a large direction change while the foot is still in
  the right place. On this recording ~245 foot-direction samples exceed 0.1
  while every body segment above the ankle stays well under. A dedicated
  foot-orientation pass may tighten this later; it does not block body-follow
  acceptance.
- How to measure: the mounted-Game proof records per-segment `sourceError`
  (rendered avatar segment vs recorded source direction) in
  `mounted-game.json` under `playerVisual.segments.*.sourceError`, plus
  `averageUpperBodyDirectionError` / `averageLowerBodyDirectionError` per
  frame. Any body segment (non-foot) exceeding 0.1 is a follow regression.

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
