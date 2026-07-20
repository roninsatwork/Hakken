> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Replay Lab Visual Acceptance Tightening Plan

Last reviewed: 2026-07-16
Status: active and reopened. The July 15 final-fingerprint bundle remains valid evidence of complete lane accounting, temporal continuity, side ownership, and target-to-final VRM application, but it is not current visual acceptance. The July 16 frame-648-656 repair window and all three complete automated `Full Body Flow` lanes now pass the strengthened source-to-final torso/head and calibrated sole-contact contract: deterministic player, intended-time player, and independent three-party proof each account for 2,169/2,169 frames with zero missing and zero strict failures. Current manual-seek, fast-subset, all-nine, and broader human proof remain required before global acceptance is reclaimed.
Scope: make Replay Lab, full-sequence rendered proof, three-party proof, and `movement:avatar-follow-gate` fail loudly when the avatar does not visually match the recorded source, even if side ownership, parity, coverage, or aggregate analyzer gates are green.

Controlling follow-on: [`replay-studio-agent-repair-harness-plan.md`](./replay-studio-agent-repair-harness-plan.md) owns durable fixtures, repair packets, one-command diagnosis, and agent workflow. This plan remains authoritative for false-green prevention and rendered visual acceptance thresholds.

Related contracts:

- [`movement-mirror-methodology-implementation-plan.md`](./movement-mirror-methodology-implementation-plan.md) owns anatomical identity/opposite mapping and all-nine mirror certification.
- [`replay-game-runtime-alignment-plan.md`](./replay-game-runtime-alignment-plan.md) owns Replay/Game shared-runtime parity.
- This plan owns absolute source-to-final-VRM fidelity, per-segment deviation limits, neutral/standing continuity, and manual seek acceptance.

## 2026-07-16 Semantic Proof Reopening: Full Body Flow Frame 652

Human review of `Full Body Flow` frame 652 (`px7fafa0wypmmc5rfz1nzmdvas88n6m0`) found a visibly hunched head/upper torso and raised toes while the source remained substantially upright with both feet on the floor. The final-fingerprint artifact at `tmp/movement-replay-lab/current-nine-recording-proof-2026-07-15-final-0-10/` reports the recording as passed across all three lanes. That acceptance claim is withdrawn.

Saved source and final-render telemetry establish the following red baseline:

| Evidence | Frame-652 value | Acceptance meaning |
| --- | ---: | --- |
| Source hip-midpoint to shoulder-midpoint lean, derived from saved world landmarks | `0.1499 rad` / `8.6deg` | Trustworthy upright source reference |
| Solver `spineDrive.forwardLean` | `0.8303 rad` / `47.6deg` | Wrong motion target; source-to-target delta is about `0.6804 rad` |
| Applied spine/chest/upper-chest rotations | Equal the solver target to telemetry precision | Proves application consistency only; does not prove source fidelity |
| Head target world quaternion versus applied world quaternion | Identical | Zero application error can coexist with a visibly wrong head/neck/torso silhouette |
| Support intent / constraint | `feet-floor` / `active` | Both feet are expected to be planted |
| Retarget contacts | left `false`, right `false` | Contradicts the active planted-foot support claim |
| Foot-lock strength | `0` | No effective legacy foot lock is present |
| Reported foot clearance | left `0`, right `0.0467` | Measures foot-bone origins, not heel/sole/toe contact |

The frame passed for four specific reasons:

1. Head fidelity compared the requested world quaternion with the applied world quaternion. It did not independently compare the source-supported head/neck relationship with the final avatar relationship.
2. Active-spine fidelity compared `spineDrive.targetRotations` with `avatarSpine`. It did not compare the source torso vector with the final rendered torso chain, so a wrong `0.8303`-radian lean target received a zero-error result.
3. The average upper-body direction value contained the four arm segments while the active spine used a separate target-application metric. The displayed average therefore could not reveal this source-to-spine-target error.
4. Foot-floor telemetry sampled the normalized `leftFoot` and `rightFoot` node positions. Standing support corrected those nodes to the floor, but no telemetry sampled the rendered heel, sole, or toe contact points. The analyzer checked sudden clearance changes, not persistent absolute toe lift.

Product decision:

- `0.10` remains the maximum clean-frame angular or direction-error ceiling for every trustworthy source-to-final anatomical comparison.
- Target-to-final equality is application proof, not visual-fidelity proof. Both layers are required.
- Floor contact uses a separate avatar-scaled distance policy; `0.10` raw world units is not an acceptable sole-contact threshold.
- A `feet-floor` frame cannot pass when required heel/toe evidence is missing, either foot lacks planted contact without a source-supported lift, or the support/contact/lock evidence is internally contradictory.
- The immutable regression window is `Full Body Flow` frames 648-656, with frame 652 as the controlling first/worst example. It must fail before repair and pass after repair without changing the source recording.

### July 16 implementation and targeted proof checkpoint

The first record-once repair loop now passes against the unchanged `Full Body Flow` source hash `sha256:8a00b45ba5e3f1ec29ac2b5e224504b8cca4f680eca60da69eed9ac43e6f9e17`:

- sanitized immutable regression fixture: `scripts/movement-debug/fixtures/full-body-flow-frames-648-656-semantic-contact.json`;
- independent final rendered telemetry now covers calibrated torso direction, head-chain direction, avatar scale, per-foot source clearance ratio, heel/sole/toe clearances, and foot-plane angle;
- full-sequence and three-party analyzers, plus Replay Lab selected-frame failures, now emit the semantic/contact failure codes defined by this plan and fail closed when required proof is absent;
- the shared spine target now derives signed sagittal source geometry instead of the former projection-length heuristic;
- Replay contact classification now uses current-frame torso-normalized bilateral sole clearance instead of an absolute floor coordinate from a potentially differently framed neutral source model;
- planted retarget feet finish on the calibrated bind-pose world direction after all parent-chain and fallback writes, for both avatar roles.

Fresh deterministic player proof at `tmp/movement-replay-lab/phase13/full-body-flow-648-656.player-v5.json` accounts for 9/9 frames with zero missing. Across 18 planted-foot samples it reports zero contact contradictions, zero heel/toe divergence, and zero foot-plane divergence. At frame 652, torso source error is `0.0011`, head-chain source error is `0.0599`, both foot-plane errors are `0`, and all heel/sole/toe clearances remain below the avatar-scaled threshold. The legacy head-response correlation reports a low-variance nine-frame window failure, but its direct target/final head-axis maximum is only `0.0005 rad`; complete-recording proof remains authoritative for that temporal statistic.

Fresh three-party proof at `tmp/movement-replay-lab/phase13/full-body-flow-648-656.three-party-v1.json` passes 9/9 frames with no missing roles and no failures. Instructor and player semantic torso/head-chain/foot samples all pass; corresponding instructor/player rendered segment differences are effectively zero. This closes the targeted repair window only. It does not close Phase 14 or restore all-nine acceptance.

Complete deterministic player proof at `tmp/movement-replay-lab/phase13/full-body-flow-full.player-v3.json` now passes **2,169/2,169** frames with zero missing and zero failures under analysis `full-body-flow-full.player-v3.analysis.json`. The result includes zero trustworthy torso, head-orientation, planted-foot, heel, toe, or foot-plane divergences; every eligible head quaternion is present; maximum head-axis error is `0.0013 rad`; and maximum spine target/final error is `0.0016 rad`. Source-limited and limited-review samples remain explicitly counted rather than accepted. Contact-constrained shin-side frames pass only when the mapped active shin independently stays within the `0.10` source-to-final ceiling; they are reported as contact-constrained, not silently skipped.

Final-code Phase 14 proof supersedes that earlier deterministic checkpoint. `tmp/movement-replay-lab/phase14/full-body-flow-full.player-v4.json`, `full-body-flow-full.player-intended-v6.json`, and `full-body-flow-full.three-party-v6.json` each account for **2,169/2,169** frames with zero missing; their strict analyses all pass with zero failures. The three-party lane has zero missing roles and axial p95 difference `0`. This closes the complete automated `Full Body Flow` lanes under the current runtime. It does not substitute for manual seek/reset review or the renewed fast-subset and all-nine proof.

The shared repair now also uses two-bone planted-foot endpoint IK. For bilateral plants, the shared root moves to the raised endpoint and the other leg bends back to the floor; foot world orientation is preserved and unreachable targets are refused rather than stretching bone translations. The recorded frames 2072-2108 transition window passes 37/37 after this change.

## 2026-07-15 Reopening Decision

The prior automated result proved a narrower contract than the product needs. It proved complete frame accounting, mirror-side ownership, role parity, and selected temporal behavior. It did not prove that the final rendered head, spine, and arms stayed close enough to the recorded source.

The user-visible review of `Full Motion Exercises` at frame 281 is the new controlling red baseline:

| Metric | Observed | New classification |
| --- | ---: | --- |
| Average upper-body source-direction error | `0.2939` | Severe; blocking |
| Left upper-arm source-direction error | `0.6694` | Severe; blocking |
| Spine source-direction error | `0.2592` | Severe; blocking |
| Existing Replay UI limit | `0.18` | Already exceeded |
| New clean-frame pass ceiling | `0.10` | Required for acceptance |

The retained targeted artifact that was labelled passed contains the same frame-281 values. Across its 3,026 rendered frames, 1,444 frames have average upper-body error above `0.18`, and the p95 average upper-body error is `1.0973`. Regardless of whether any individual telemetry transform still needs coordinate-space correction, a proof artifact containing those values cannot be called accepted while the UI and the user-visible avatar identify them as divergence.

The manual frame-step path is a second independent gap. Normal Previous/Next/slider navigation supplies a changing `frameResetKey`, which resets the normalized VRM pose and all smoothing, hold, support, and contact state. Deterministic certification deliberately disables that reset. The visible neutral-to-standing alternation during manual review is therefore outside the path exercised by the passing deterministic suite.

Implementation audit subsequently proved that the retained player artifact's arm `sourceError` values were calculated after a second horizontal reflection in visual telemetry. The player retarget frame had already been mapped into display/application space. The same audit proved that the retained spine `sourceError` compared a retarget segment with bones owned by the separate active spine model. Those historical values remain valid evidence that the artifact and old gate were not acceptance-safe; they are not valid evidence of current arm/spine fidelity after the coordinate/owner repairs. Current proof must use the exact already-mapped arm application direction and the active spine drive's target rotations.

The missing July 14 directory is not reused. A fresh current-fingerprint proof now exists at `tmp/movement-replay-lab/current-nine-recording-proof-2026-07-15-final-timing/`, with an auditable manifest and strict final report in `bundle-report.final.json`.

## 2026-07-15 Implementation Checkpoint

Implemented:

- canonical `0.10 / 0.15 / 0.25` policy with confidence and proof classifications;
- Replay current-frame thresholds, full-sequence analysis, three-party independent-source analysis, and avatar-follow bundle threshold alignment;
- exact minimized frame-281 regression assertions;
- calibrated final-world head pitch/yaw/roll proof instead of raw rig-local Euler comparison;
- active-spine target-rotation telemetry and owner-aligned spine fidelity;
- removal of the second player visual-telemetry reflection;
- queued manual frame-jump reset, consumed only when the selected solved pose can be reapplied in the same render tick.
- capped temporal target budgets across recorded timestamp stalls instead of snapping to a raw target;
- source-aware final VRM application timing so sparse render cadence cannot make arms and spine lag their shared target;
- arm continuity bounded once in world-target space, removing the incorrect child-local cap that fought lower-arm compensation when an upper-arm parent moved;
- complete three-party rendered proof made authoritative over the older magnitude-only side heuristic, while missing/incomplete three-party evidence and every non-side failure remain blocking.
- paused Replay proof frames discard temporal target history, so a discontinuous seek resolves the selected pose instead of stopping after one bounded smoothing step between the old and new poses;
- paused Replay presentation ignores the imperative timed root-motion ref, so a heading retained from playback or a previous recording cannot override the declarative root pose for the newly selected frame;
- intended-time Replay presents exactly one source frame per scheduled tick, using recorded delay when valid and nominal FPS when timestamps stall, so a catch-up loop cannot process hundreds of poses inside one browser render;
- temporal jerk acceptance blocks a persistent three-frame run per segment even when the run is less than one percent of a long recording;
- upper-arm reacquisition uses a deliberately flat fourth-power response ramp while clear `0.90` confidence retains the original response;
- arm targets are capped at `4.8 rad/s`, and source-limited lower arms retain a responsive world-target continuation band so a moving upper-arm parent cannot carry the forearm away and then snap it back at the `0.30` confidence boundary.

Verification at this checkpoint:

- `npm run verify:env` passed;
- `npm run lint:all` passed, with only Babel size notices for ignored `tmp` replay bundles;
- changed-file ESLint and `git diff --check` passed;
- `npm run typecheck` passed;
- `npm run test:run` passed: 322 files and 2,325 tests.

The prior all-nine rendered reproof remains valuable historical evidence: deterministic player-avatar and three-party lanes each compared `11,383/11,383` frames and the old timed lane processed every source frame. Human Replay review then exposed two paths that proof did not certify: paused seeks retained one step of temporal target history, and intended-time playback could collapse timestamp stalls between sparse rendered samples. The current controlling timed slice is `tmp/movement-replay-lab/current-nine-recording-proof-2026-07-15-browser-clock/`: the final `*.final-child-continuation.*` artifacts render and compare `Full Motion Exercises` at `3,026/3,026`, `Star Jumps` at `708/708`, and `Body Capture 3D` at `1,815/1,815`, all with zero missing frames, zero persistent jerk runs, zero neutral resets, zero owner flickers, and no strict failures. Star Jumps and Body Capture have zero jerk frames; Full Motion retains only four isolated two-frame foot-clearance diagnostics at frames 1863-1864, with no upper-body jerk. Source-limited arm frames remain labelled source-limited and are not trustworthy clean-frame evidence. All-nine deterministic/timed/three-party refresh and final Game Studio confirmation remain mandatory before product-wide acceptance.

## Deviation Metric Semantics

Rendered segment source-direction error is currently calculated as:

```text
error = 1 - clamp(dot(renderedDirection, expectedSourceDirection), -1, 1)
```

Approximate angular meaning for one segment:

| Error | Approximate direction difference |
| ---: | ---: |
| `0.10` | `26deg` |
| `0.15` | `32deg` |
| `0.18` | `35deg` |
| `0.25` | `41deg` |
| `0.2939` | `45deg` |
| `0.6694` | `71deg` |

The average upper-body error is a diagnostic summary, not an oracle. Acceptance must inspect each required segment independently so several good segments cannot cancel one broken arm or spine.

Before these thresholds become final gates, the expected direction must be proven to be in the same anatomical and coordinate space as the final rendered VRM direction. A telemetry-coordinate defect must be repaired; it is not permission to ignore the metric or call the avatar accepted.

## Strengthened Fidelity Contract

### Source eligibility

Every frame and segment must be classified before fidelity scoring:

| Source evidence | Classification | Acceptance treatment |
| --- | --- | --- |
| Segment confidence `>= 0.75`, complete required landmarks, current rendered telemetry | `trustworthy` | Apply all strict fidelity limits. |
| Segment confidence `>= 0.45` and `< 0.75`, or a brief recoverable occlusion | `limited-review` | Keep visible and report deviation; cannot silently count as accepted. |
| Segment confidence `< 0.45`, missing required landmarks, or invalid source bounds | `source-limited` | Exclude only from that fidelity comparison, retain in complete frame accounting, and never count it as an accepted comparison. |
| Missing final VRM telemetry, stale fingerprint, or coordinate-space ambiguity | `proof-limited` | Block acceptance until evidence is repaired. |

Source limitation is per segment, not a whole-recording escape hatch. A weak foot must not prevent trustworthy head, spine, or arm evidence from being judged.

### Segment deviation policy

For every trustworthy head/spine/arm comparison:

| Error | Outcome | Required action |
| ---: | --- | --- |
| `<= 0.10` | `pass` | No fidelity repair required. |
| `> 0.10` and `<= 0.15` | `repair-required` | Keep the frame visible. Three consecutive frames block immediately; an isolated occurrence prevents final `accepted` status until reviewed and repaired or deliberately reclassified with evidence. |
| `> 0.15` | `blocked` | Immediate high-confidence fidelity failure. |
| `> 0.25` | `severe` | Immediate blocking failure, highlighted as first/worst evidence. |

The final all-nine result may be `accepted` only when every trustworthy required comparison is `<= 0.10`, every expected frame is accounted for, and no recording remains `repair-required`, `review-only`, `proof-limited`, missing, stale, or skipped.

### Required independent segments

The following must be judged independently on every eligible frame:

- source hip-to-shoulder torso vector versus the final rendered hips/spine/chest/upper-chest chain;
- left and right upper arm;
- left and right lower arm;
- source-supported head-to-torso relationship versus final rendered neck/head forward and up directions;
- final rendered head pitch, yaw, and roll after neutral calibration;
- hips/root vertical posture when squat, rise, standing height, or vertical travel is visible.
- left and right heel, sole, and toe contact when the source and support intent say the foot is planted.

Hands, thighs, and shins retain their existing movement-specific gates and must be migrated to the same `pass | repair-required | blocked | severe | source-limited | proof-limited` vocabulary in a later whole-body slice. Planted feet are no longer deferred: heel/sole/toe contact is required by the current reopened slice.

### Head alignment

Head acceptance must no longer rely only on response correlation or instructor/player agreement. It must compare the source-supported expected head intent with final rendered head-bone telemetry:

- body-local head forward/up direction error must be `<= 0.10` on trustworthy frames;
- calibrated final pitch, yaw, and roll delta has an initial ceiling of `0.10` radians per axis;
- source torso lean and source-relative cervical/head posture must be compared with the final rendered torso/neck/head chain after avatar-neutral calibration;
- target-to-final world-quaternion delta must remain as VRM-application proof, but it cannot substitute for the independent source-to-final comparison;
- a correct final head quaternion cannot pass when a wrong spine/chest target makes the combined silhouette visibly hunched;
- reversed sign, a neutralized strong source motion, or a sustained delta above the ceiling is blocking;
- both avatars agreeing with each other is insufficient if both disagree with the source.

The `0.10`-radian axis ceiling is provisional until the red baseline and a small set of visually accepted neutral/head-motion fixtures establish that rig-neutral conversion is correct. It may be made stricter. It may not be relaxed after a visible failure without explicit product review and before/after evidence.

### Torso and cervical-chain alignment

Active-spine proof requires two independent comparisons:

1. **Decision/application proof:** each final spine/chest/upper-chest rotation must remain within `0.10` radians of the active target so late VRM application defects are caught.
2. **Source/final visual proof:** the final hips-to-shoulders torso direction and calibrated torso/neck/head chain must remain within `0.10` radians of the trustworthy source-supported direction.

Neither comparison can replace the other. A source-to-target divergence above `0.10` is repair-required even when the target is applied exactly. A final-to-target divergence above `0.10` is repair-required even when the target itself matches the source.

The source/final comparison must use independently derived saved-landmark geometry and final rendered VRM joint positions/world axes. It must not derive both expected and actual from `spineDrive.targetRotations`, production rest-pose mapping, or one shared solver output.

### Planted-foot and sole-contact alignment

Planted-foot acceptance must measure the visible contact surface, not only a foot bone origin:

- infer source contact separately for each foot from ankle, heel, and toe height plus short-window velocity and confidence hysteresis;
- capture final rendered heel, toe-base/toe-end, and calibrated sole contact anchors for each avatar foot;
- normalize clearance thresholds by avatar scale and calibrated shoe/sole thickness rather than using raw world units;
- require both heel and toe/forefoot contact within the calibrated tolerance while the source foot is planted;
- compare final foot pitch/roll with the source-supported foot plane, using the same `0.10`-radian ceiling for trustworthy angular error;
- treat `feet-floor` plus false contacts, absent contact strength/correction, missing contact anchors, or visible clearance as a blocking support-contact contradiction;
- judge left and right independently, with no averaging and no use of the lower foot to define a self-fulfilling floor;
- retain temporal jerk checks, but also block a stable floating foot or toe because an absolute contact violation does not need to move to be wrong.

The exact distance ceiling must be calibrated from the avatar's neutral rendered sole and expressed as a small fraction of avatar height or foot length. It must be fixed before the regression fixture is repaired and cannot be loosened to make frame 652 pass.

### Neutral, standing, and vertical continuity

Acceptance must detect source-independent alternation between neutral/rest and the intended standing/moving pose:

- compare final hips/root height, spine direction, head orientation, and arm directions on adjacent rendered frames;
- detect a one-frame reset toward normalized/rest pose followed by a return to the previous source-supported pose;
- detect alternating reset/application patterns across Previous, Next, slider, deterministic stepping, and intended-time playback;
- block any visible reset even if the owner label is stable and even if total event rate is below 1%;
- preserve genuine source jumps, squat/rise, and fast arm motion by comparing against the source step.

### No average masking

- Average upper-body error remains a useful summary and must itself be `<= 0.10` for trustworthy frames.
- Every required segment must also pass independently.
- Whole-recording p95, visual-match percentage, or three-party parity cannot override a failing frame or segment.
- The gate must report the first failure, worst failure, longest sustained run, and total count for every region.
- A three-party test must compare both avatars to the independent expected source result, not only to each other.

## Why This Exists

The current 9-recording avatar-follow gate can pass while Replay Lab still shows visible avatar mismatch. The screenshot reviewed on 2026-07-09 showed a frame with:

- `Judge: pass - review session`
- `Visual match: 84%`
- `visual_match_low`
- `avatar_output_diverged`
- no persisted VRM bone telemetry for the replay
- visible mismatch in head alignment, spine/body angle, arms, and standing-foot contact

That is not acceptable product proof. It is a false acceptance signal. The system may still be useful as a diagnostic, but it must not call this accepted.

## Current Risk

### 2026-07-10 correction

Manual playback disproved the previous green result. Frames that were not in the sparse selected capture set showed under-driven head motion, arms at a materially different camera-plane angle, lateral leg motion being neutralized, and abrupt lower-body owner changes. The earlier statement that the nine-recording avatar-follow gate passed is therefore historical, not current acceptance evidence.

The current correction run processes every stored frame in all nine recordings. It is clean at the solver/analyzer error level, but it is not a full rendered-avatar acceptance pass: six recordings remain below the `0.85` whole-recording visual-match threshold or are source-limited, and no recording has persisted full-sequence VRM bone telemetry. Selected rendered recaptures are supporting diagnostics, not permission to override a failing whole-recording score.

The false-green threshold path is now closed, but the current proof set is still incomplete:

- Supported Replay Studio `review` sessions remain blocked rather than accepted.
- Supported recordings below `0.85` now block for both analyzer telemetry and replay visual-capture evidence.
- The previous proof bundle has a stale/missing motion-pipeline fingerprint and must be recaptured after these solver changes.
- Full-sequence rendered-avatar telemetry is still absent, so selected frame captures cannot prove smoothness across every transition.
- Per-frame head, spine/body, arm, and planted-foot criteria exist, but the remaining review/source-limited recordings still need fresh evidence.
- Session averages remain diagnostic only; a failing selected proof frame continues to block acceptance.

## Acceptance Principle

For supported avatar-follow proof, acceptance means the recorded source and rendered avatar are visually close enough on every selected proof frame.

Accepted must mean:

- No supported recording has Replay Studio `review` or `blocked` status.
- No selected proof frame has `visual_match_low`.
- No selected proof frame has `avatar_output_diverged`.
- No selected proof frame is missing required avatar telemetry or capture-backed proof.
- Head, spine/body angle, arms, and planted-foot contact are within explicit tolerances.

Review is not accepted.

## User-Visible Criteria

The acceptance gate must answer these four questions for every selected proof frame:

1. Is the avatar head aligned with the recorded head direction?
2. Is the avatar body and spine angle aligned with the recorded torso/spine direction?
3. Are the avatar arms close enough to the recorded arm pose for the movement being proved?
4. Is the standing or planted leg visibly stable, with the foot flat enough on the floor?

If any answer is no, the recording is not accepted.

## Implementation Plan

### Phase 1: Stop False Green

Goal: make the existing proof gate fail when Replay Lab already says the session needs review.

Tasks:

- Update `scripts/movement-debug/avatar-follow-gate.mjs` so supported recordings fail when `replayStudio.session.status` is `review` or `blocked`.
- Fail `visualMatchScore < 0.85` for supported recordings when the basis is analyzer telemetry or replay visual captures.
- Fail supported recordings that have `avatar_output_diverged`, `visual_match_low`, `avatar_head_spine_diverged`, `avatar-upper-body-diverged`, `avatar-not-following-leg`, `avatar-wrong-side`, or foot/contact divergence in selected proof frames.
- Keep `not-supported` recordings visible, but do not count them as accepted proof.
- Change summary language so the CLI reports `accepted`, `blocked`, `review-only`, and `not-supported` clearly.

Expected result: the screenshot scenario blocks the gate instead of passing.

### Phase 2: Fix Replay Lab UI Language

Goal: make the UI impossible to misread during demo/test day.

Tasks:

- Replace `pass - review session` with an acceptance-aware label.
- Use visible states:
  - `Accepted`
  - `Blocked: visual mismatch`
  - `Blocked: missing telemetry`
  - `Blocked: source not trustworthy`
  - `Review only`
  - `Not supported`
- Add an acceptance banner when current frame/session is not accepted.
- Keep Start Gate and Avatar Follow separate. Start readiness must never imply avatar acceptance.

Expected result: a reviewer cannot look at a bad avatar frame and see a pass-like status.

### Phase 3: Add Explicit Visual Criteria

Goal: make the four user-visible criteria executable.

Tasks:

- Add head alignment metrics:
  - yaw, pitch, and roll delta between source head direction and avatar applied head direction.
  - fail selected proof frames when confident source head motion is missing, neutralized, or reversed.
- Add spine/body alignment metrics:
  - torso lean, side-bend, root/body facing delta, and source-vs-avatar spine drive delta.
  - fail when body/spine appears to face a materially different direction than the recording.
- Add arm pose metrics:
  - shoulder, elbow, wrist, and hand direction deltas where landmarks are visible.
  - fail for selected upper-body frames when arms are not close to the source pose.
- Add foot contact metrics:
  - planted-foot floor distance, foot tilt, support owner, and support/contact confidence.
  - fail when the standing/planted foot floats, rolls visibly off the floor, or uses an incompatible support state.

Expected result: the exact concerns from the screenshot become named failure codes, not subjective comments.

### Phase 4: Stop Average Masking

Goal: one visibly bad selected proof frame should block acceptance.

Tasks:

- Evaluate max error per selected proof frame, not only session averages.
- Require every selected proof frame to pass the relevant criteria for its proof case.
- Keep averages as diagnostic summaries only.
- Add worst-frame reporting for each acceptance criterion.

Expected result: a recording cannot pass because most frames are fine while the selected proof frame is visually wrong.

### Phase 5: Regression Tests And Proof Artifacts

Goal: lock the tightened contract into tests.

Tasks:

- Add tests for a supported recording with:
  - `84%` visual match.
  - Replay Studio `review` session.
  - no persisted VRM bone telemetry.
  - `avatar_output_diverged`.
  - capture-backed proof rows.
  - expected result: gate blocked.
- Add tests that `not-supported` recordings remain visible but do not count as accepted.
- Add Replay Lab/e2e coverage for acceptance labels.
- Add a fixture-backed regression for the known bad frame class when a stable export fixture is available.

Expected result: future agents cannot relax the gate back into false green without failing tests.

## Reopened Implementation Sequence, 2026-07-15

The earlier Phase 1-5 work remains useful history, but it did not close absolute rendered fidelity. Execute the following phases in order. Do not start by tuning Jane's bones or weakening the error metric.

### Phase 6: Preserve The Red Baseline And Prove The Metric

Progress: 65%. The frame-281 values, immutable sanitized five-frame red window, coordinate-space defect, manual reset-path divergence, and first-frame head-calibration blind spot are covered. A fresh five-frame current-fingerprint render is still required.

Tasks:

- [x] Record `Full Motion Exercises` frame 281 as the controlling visible false-green example.
- [x] Record its passing-artifact upper-body, left-upper-arm, and spine errors.
- [x] Identify that manual stepping resets runtime state while deterministic certification does not.
- [x] Preserve a minimized, anonymized frame-281 telemetry fixture and exact threshold assertions.
- [x] Prove that player visual telemetry was reflecting the already-mapped application direction a second time, and remove that false comparison.
- [x] Prove that raw local head Euler values include rig rest rotation, and replace direct comparison with calibrated final-world head evidence.
- [x] Preserve a sanitized frame window covering frames 279-283 with immutable source hash, expected 3,026-frame source count, independent expected directions, final rendered directions, and historical-only acceptance metadata.
- [ ] Add a small visually accepted comparison window for neutral standing and a known-good head/arm pose.
- [ ] Independently verify source-direction mapping for instructor identity and player-avatar opposite ownership without importing the production mapping helper as the expected oracle.
- [ ] Prove that error `0.10` corresponds to the intended final-VRM/source comparison rather than a coordinate-space mismatch.
- [ ] Add a current-fingerprint artifact manifest for the targeted window.
- [x] Replace first-arbitrary-frame head calibration with target/final world-quaternion proof for current artifacts; constant wrong head orientation must block rather than define the baseline.

Exit criteria:

- The known-bad window fails before any runtime repair.
- A visually accepted fixture passes without special-case thresholds.
- The test oracle cannot make both expected and actual wrong in the same way.

### Phase 7: Centralize The Strengthened Acceptance Policy

Progress: 65%. The policy is shared by Replay UI, full-sequence analysis, three-party analysis, and the avatar-follow bundle gate; repair-packet and Markdown export integration remains.

Tasks:

- [x] Define one shared fidelity configuration for the `0.10`, `0.15`, and `0.25` bands, confidence eligibility, sustained-run length, and head-axis ceiling.
- [x] Add stable outcomes: `pass`, `repair-required`, `blocked`, `severe`, `source-limited`, and `proof-limited`.
- [ ] Make Replay UI, full-sequence analyzer, three-party analyzer, bundle gate, repair packet, JSON/Markdown exports, and CLI consume the same policy.
- [ ] Remove any React-only or script-only threshold that can disagree with the canonical result.
- [ ] Make strict CLI mode exit non-zero for `repair-required`, `blocked`, `severe`, and `proof-limited` results.
- [ ] Keep `source-limited` frames in expected/rendered accounting and report eligible versus limited comparisons per region.

Exit criteria:

- The same frame produces the same status, failure code, threshold, and evidence classification in UI, CLI, tests, and exported repair packet.
- No surface can display accepted while another surface reports error above `0.10` on a trustworthy segment.

### Phase 8: Add Per-Segment And Absolute Head Gates

Progress: 75%. Per-segment, average-upper, calibrated head-axis, and independent three-party source gates are implemented; head forward/up vectors and remaining export details are open.

Tasks:

- [x] Gate average upper-body error and spine/arm segment error independently.
- [ ] Add independent final rendered head forward/up vectors and calibrated pitch/yaw/roll evidence. Calibrated pitch/yaw/roll is complete; forward/up vectors remain.
- [x] Block instructor/player parity when both rendered avatars agree with each other but disagree with the independent expected source pose.
- [x] Detect isolated, sustained, and severe error bands without session-average dilution.
- [ ] Export first, worst, longest-run, and total failure counts per segment and head axis.
- [ ] Add adversarial fixtures where four segments pass and one arm fails, and where both avatars share the same wrong head/arm transform.
- [x] Add exact frame-281 regression assertions.

Exit criteria:

- Frame 281 cannot pass.
- A single severe arm/spine failure cannot be averaged away.
- Consistently wrong instructor/player agreement cannot satisfy three-party acceptance.

### Phase 9: Make Manual Seeking A First-Class Acceptance Path

Progress: 80%. The normalized-pose flash, stranded-between-poses seek, and stale cross-recording heading mechanisms are repaired and unit-covered. Human browser checks cover Previous/Next, discontinuous frame selection, seek-then-play, frames 279-283, uninterrupted playback, and a turned `Body Capture 3D` frame 1044 to forward-facing `Full Motion Exercises` frame 281 switch; a durable automated browser interaction lane and convergence-boundary export remain.

Tasks:

- [ ] Add a browser harness for Previous, Next, slider seek, non-adjacent seek, and seek-then-play.
- [ ] Capture final VRM telemetry before seek, during any reset/settle boundary, and after the target frame is stable.
- [ ] Add a failing test demonstrating the current normalized-pose/runtime-state reset on frames 279-283.
- [x] Choose and document one continuity strategy:
  - warm the shared runtime through a bounded preceding-frame window before presenting the target;
  - restore a deterministic runtime snapshot for the target frame; or
  - settle the target without exposing the intermediate normalized pose.
- [x] Queue a discontinuous frame-jump reset until a solved target pose is ready, then clear only temporal history while preserving the visible pose and rig calibration.
- [x] Preserve adjacent-frame continuity; non-adjacent seeks clear stale root history, foot locks, exercise transitions, holds, and last-good filters without calling `resetNormalizedPose`.
- [ ] Prove adjacent seeking and intended-time playback converge on the same final pose within the strengthened limits.
- [x] Prove in the browser that a frame-0 to frame-281 jump resolves the overhead-arm target instead of retaining a one-step intermediate chest pose.
- [x] Prove in the browser that switching from turned Body Capture frame 1044 to Full Motion frame 281 cannot retain the prior recording's heading; source and avatar face forward with both arms overhead.

Exit criteria:

- No source-independent neutral/standing flash is rendered to the reviewer.
- Previous/Next and slider navigation are visually stable and deterministic.
- Arbitrary seeks do not inherit invalid contact, smoothing, or owner state.

### Phase 10: Repair The Shared Motion Pipeline

Progress: 100% for the controlling recording. The shared visual-telemetry reflection, manual reset presentation bug, adjacent-step continuity, discontinuous-seek cleanup, spine/head proof, arm target stability, elapsed-time final VRM application, head parent-write order, and torso ownership conflict are repaired. Deterministic and timed current-fingerprint proof now pass the unchanged `0.10` policy for `Full Motion Exercises`.

Tasks:

- [x] Use the frame-281 repair packet and final-bone telemetry to identify the divergent application stages for spine, each arm, and head.
- [x] Repair the double-reflected player expected direction at the shared visual-telemetry boundary.
- [x] Repair reset/application order so manual stepping does not expose normalized pose between selected frames.
- [x] Repair the remaining retarget smoothing and final VRM application defects exposed by deterministic and timed current-fingerprint proof.
- [x] Keep Replay and Game Studio on the same shared runtime result; no Replay-only bone rules were added.
- [x] Avoid per-recording, per-frame, canned-pose, Replay-only, Game-only, and Jane-only behavior.
- [x] Rerun the same immutable source after every repair and preserve source hash `sha256:47e1940250c10f9855d8b1086308b8f80361a424efc5d3a4e591f0936e204e1f`.

Exit criteria:

- The frame-279-283 window passes the strengthened policy without threshold changes.
- The visible head, arms, spine, and standing posture match the source during playback and seeking.
- No lower-body, mirror-side, floor/contact, or Replay/Game parity regression is introduced.

### Phase 11: Tiered Reproof

Progress: 100%. Targeted frame 281, the complete Full Motion slider sequence, and the final-fingerprint all-nine deterministic, intended-time, and three-party bundle pass. Every one of the `34,149/34,149` lane-frames is accounted for with zero failures, and all five discontinuous slider events converge with zero `0.10` repair samples.

Run in this order:

1. Targeted frame-279-283 fidelity and seek proof.
2. Complete `Full Motion Exercises` targeted proof through deterministic, intended-time, manual-seek, and three-party paths.
3. Fast subset: `Spins`, `Full Spinal Flow`, and `Full Motion Exercises` or `Full Body Flow`.
4. Full nine-recording current-fingerprint proof.

The final bundle must report for each recording and region:

- expected, rendered, compared, trustworthy, limited-review, source-limited, proof-limited, repair-required, blocked, and severe frame counts;
- average, p95, maximum, first failure, worst failure, and longest sustained run;
- per-segment spine/arm values and head-axis values;
- manual seek reset/continuity events;
- source hash, runtime contract, motion-pipeline fingerprint, commit, and exact command;
- screenshots or strips for every severe failure and the worst non-severe failure.

Exit criteria:

- All nine recordings are regenerated under the current fingerprint and strengthened policy.
- No historical or missing artifact is inherited into the result.
- Zero trustworthy comparisons exceed `0.10` at final acceptance.
- Zero manual seek or intended-time neutral/reset events remain.

### Phase 12: Human Replay And Live Confirmation

Progress: reopened. The earlier interaction checks remain useful, but broader human Replay acceptance and Game confirmation cannot close until Phases 13-14 pass.

Tasks:

- [x] Review `Full Motion Exercises` frames 279-283 through Previous/Next, discontinuous seek, and seek-then-play; complete timed browser telemetry covers all 3,026 frames.
- [ ] Review head, spine, both arms, squat/rise, standing height, and representative lower-body movement across the remaining acceptance set.
- [x] Exercise Previous, Next, discontinuous frame selection, seek-then-play, uninterrupted playback, and durable real slider dragging. The automated sequence `281 -> 1500 -> 281 -> 3025 -> 281` passes 5/5 exact commit, paused-state, fresh-telemetry, and `0.10` convergence checks.
- [ ] Perform the final short Game Studio live-camera confirmation only after Replay proof passes.
- [x] Update the controlling Replay support claims and handoff documentation from the all-nine and slider artifacts. Final Game Studio confirmation still needs to be appended.

Exit criteria:

- Human review agrees with telemetry and sees no visible head, arm, spine, neutral/standing, or continuity defect.
- Game Studio confirms the Replay-proven shared result without a route-specific patch.
- Product acceptance is explicitly recorded with reviewer, date, commit, fingerprint, and artifact path.

### Phase 13: Close Source-Semantic And Sole-Contact Blind Spots

Progress: 92%. The fixture, confidence-aware independent telemetry, focused gates, shared spine/contact/endpoint-IK repair, deterministic/three-party repair-window proof, and complete deterministic `Full Body Flow` player proof are complete. Remaining work is cross-surface packet/bundle/avatar-follow integration plus the other complete-recording lanes and broader acceptance proof.

Tasks:

- [x] Preserve and document `Full Body Flow` frame 652 evidence from the final-fingerprint artifact.
- [x] Prove that source torso lean (`0.1499 rad`) and solver forward lean (`0.8303 rad`) disagree while target-to-final spine application passes.
- [x] Prove that target/final head quaternions are identical while the combined torso/neck/head silhouette is visibly hunched.
- [x] Prove that foot-floor telemetry samples normalized foot nodes while visible toe/sole contact remains unmeasured.
- [ ] Commit a sanitized immutable `Full Body Flow` frames 648-656 source/telemetry regression fixture with the existing source hash and expected pre-repair failures. The fixture is added locally and test-covered; the repository commit is pending.
- [x] Add independent source torso direction, final rendered torso-chain direction, source-relative cervical posture, and final neck/head-chain telemetry.
- [x] Add calibrated left/right heel, sole, toe-base/toe-end, foot-plane, and floor-contact telemetry.
- [x] Add canonical failure classification for source-to-target torso divergence, source-to-final head-chain divergence, planted-foot contact contradiction, toe clearance, and foot-plane angular divergence.
- [ ] Make UI, full-sequence, intended-time, three-party, repair packet, bundle, and avatar-follow gates consume the same new evidence and fail closed when required evidence is missing.
- [x] Repair the shared source-to-spine target and foot/sole-contact boundaries without Replay-only, Game-only, recording-specific, frame-specific, or avatar-specific rules.

Exit criteria:

- Frame 652 fails before the runtime repair for both the torso/head-chain and toe/sole-contact reasons.
- The repaired frames 648-656 pass the unchanged `0.10` angular ceiling and the predeclared scale-normalized contact threshold.
- A deliberately wrong target that is applied perfectly still fails source-to-final acceptance.
- A foot bone placed on the floor while the toe/sole remains raised still fails planted-foot acceptance.

### Phase 14: Renewed Tiered And Human Acceptance

Progress: 10%. The first deterministic and three-party repair-window lanes pass with complete accounting. Manual seek, complete-recording, intended-time, fast-subset, all-nine, and human review remain open.

Run in order:

1. `Full Body Flow` frames 648-656 deterministic rendered proof and manual seek proof.
2. Complete `Full Body Flow` deterministic, intended-time, three-party, Previous/Next, slider, and seek-then-play proof.
3. Fast subset covering `Full Body Flow`, `Full Motion Exercises`, and `Full Spinal Flow`.
4. Fresh all-nine current-fingerprint proof with the new semantic and sole-contact fields present on every eligible frame.
5. Broad human Replay review of head/torso silhouette and planted feet before the final Game Studio live confirmation.

Exit criteria:

- Zero trustworthy source-to-final torso/head-chain comparisons exceed `0.10`.
- Zero trustworthy planted feet exceed the calibrated heel/sole/toe clearance or `0.10` foot-plane angular limits.
- Zero required semantic/contact samples are proof-limited, silently skipped, or replaced by target-to-final self-consistency.
- Human review agrees with telemetry on the controlling frame and representative frames across all nine recordings.
- Only after all preceding gates pass may all-nine visual acceptance and final Game Studio confirmation be reclaimed.

## Proposed Failure Codes

- `visual-acceptance-review-session`
- `visual-match-below-threshold`
- `avatar-output-diverged`
- `avatar-head-alignment-diverged`
- `avatar-spine-angle-diverged`
- `avatar-arm-pose-diverged`
- `avatar-planted-foot-diverged`
- `avatar-telemetry-missing`
- `selected-proof-frame-unaccepted`
- `rendered-fidelity-repair-required`
- `rendered-fidelity-severe`
- `rendered-segment-direction-diverged`
- `rendered-head-axis-diverged`
- `rendered-head-vector-diverged`
- `rendered-torso-source-diverged`
- `rendered-head-chain-source-diverged`
- `rendered-neutral-standing-reset`
- `rendered-planted-foot-contact-contradiction`
- `rendered-heel-clearance-diverged`
- `rendered-toe-clearance-diverged`
- `rendered-foot-plane-diverged`
- `manual-seek-pose-diverged`
- `manual-seek-reset-visible`
- `rendered-fidelity-source-limited`
- `rendered-fidelity-proof-limited`

## Gate Commands

Use Node 22.13.0.

Focused tightening checks:

```bash
npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/avatar-follow-gate.test.mjs
npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/analyze-replay-full-sequence.test.mjs scripts/movement-debug/analyze-replay-three-party.test.mjs
npx -p node@22.13.0 npm run test:run -- 'src/app/(dashboard)/demos/movements/replay-lab/_lib/replayLabFrameFailures.test.ts'
npx -p node@22.13.0 npm run movement:avatar-follow-gate -- --analysis tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json --manifest tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.proof-manifest.json
```

Reopened targeted proof after the harness supports the new policy:

```bash
npm run movement:replay:targeted-proof -- \
  --recording-ids px75fgt11wbg0jvr17j6fc2dvd89trpm \
  --frame-start 279 \
  --frame-end 283 \
  --export <convex-export.zip|dir>
```

If the existing runner does not yet accept `--frame-start` and `--frame-end`, Phase 6 must add and test those options rather than silently running a different scope.

Before handoff:

```bash
npx -p node@22.13.0 npm run movement:architecture-guard
npx -p node@22.13.0 npm run test:run -- scripts/movement-debug/avatar-follow-gate.test.mjs e2e/movement-demo-authenticated.spec.ts
git diff --check
```

Before merge or push, use the repo gate from `AGENTS.md`.

## Stop Conditions

Stop and reopen the acceptance contract if any of these happen:

- Replay Lab shows `review` but the CLI gate passes as accepted.
- A supported proof frame has low visual match and still passes.
- A selected proof frame has no avatar telemetry and no sufficient capture-backed proof.
- A visibly wrong head, spine, arm, or planted-foot frame is treated as accepted.
- A session summary says pass while the UI shows `avatar_output_diverged`.
- Any trustworthy head, spine, or arm segment exceeds `0.10` while the final result says accepted.
- An average or p95 result hides a failing individual segment or frame.
- Instructor and player avatars agree with each other but both disagree with the independent expected source pose.
- Previous/Next or slider review exposes a normalized-pose flash that deterministic proof does not exercise.
- A source-limited or proof-limited comparison is silently counted as passing.
- A missing or stale July 14 artifact is used as current certification evidence.
- A threshold is relaxed after seeing a visible failure without explicit product review and before/after evidence.
- A wrong torso/head target passes because the final bones accurately applied that target.
- A `feet-floor` frame passes while required rendered heel/sole/toe evidence is missing or while retarget contact and support evidence contradict each other.
- A foot-bone origin on the floor is treated as proof that the visible shoe sole and toes are planted.
- A persistent floating toe passes because only frame-to-frame clearance change is evaluated.

## Implementation Log

2026-07-16:

- Human Replay review reopened acceptance on `Full Body Flow` frame 652. The source is substantially upright with planted feet, while the avatar shows a hunched torso/head silhouette and visibly raised toes.
- The saved world landmarks produce an approximately `0.1499`-radian source torso lean, while `spineDrive.forwardLean` is `0.8303` radians. The roughly `0.6804`-radian source-to-target mismatch is not measured by the existing active-spine gate.
- Existing active-spine proof reports success because `avatarSpine` matches `spineDrive.targetRotations`. Existing head proof reports zero application error because the target and applied world quaternions are identical. Both are valid application checks but invalid as the only visual-fidelity oracle.
- Existing upper-body averaging contains four arm segments and does not include a source-direction spine sample while active spine ownership is present. This allows a wrong torso target to remain absent from the displayed average.
- Existing foot clearance reads normalized `leftFoot` and `rightFoot` node origins. At frame 652 it reports left `0` and right `0.0467`, while the rendered toes visibly remain above the floor.
- The same frame reports `feet-floor` support intent and an active support constraint, but left/right retarget contact are both false and foot-lock strength is `0`. This contradiction was not blocking.
- Product decision: retain the `0.10` angular/direction ceiling, add an independent source-to-final torso/head-chain layer, and add scale-normalized rendered heel/sole/toe contact proof. Target-to-final equality and foot-node-on-floor are no longer sufficient acceptance evidence.
- The July 15 9/9 artifact is retained as coverage, temporal, side-ownership, and application evidence, but its visual-acceptance claim is withdrawn until Phases 13-14 pass.

2026-07-15:

- Human Replay review reopened visual acceptance on `Full Motion Exercises` frame 281. The avatar visibly alternates between a near-neutral/reset state and standing/moving state, while the head and arms do not match the source closely enough.
- The artifact previously described as passing records frame-281 average upper-body error `0.2939`, left upper-arm error `0.6694`, and spine error `0.2592`, all above the existing `0.18` UI threshold and far above the new `0.10` clean-frame ceiling.
- The same 3,026-frame artifact contains 1,444 frames above `0.18` average upper-body error and p95 `1.0973`, demonstrating that side ownership, parity, and coverage gates can pass while absolute pose fidelity is wrong.
- Manual seeking changes `frameResetKey` and resets the VRM/runtime state; deterministic certification disables that reset. Manual frame-step continuity is now an explicit acceptance lane.
- Product decision: `0.10` is the maximum clean-frame direction error for trustworthy head/spine/arm comparisons. Values above `0.10` require repair; sustained values above `0.10`, high-confidence values above `0.15`, and any value above `0.25` block as defined by the strengthened fidelity contract.
- Product decision: averages cannot mask individual segments, and two avatars agreeing with the same wrong result is not three-party acceptance.
- The current-fingerprint July 14 certification directory named in the repair-harness plan is absent locally. A fresh auditable bundle is required before acceptance can be reclaimed.
- Root cause correction: the first July 15 seek change only delayed the old full reset until a solved frame was available. It still called `resetNormalizedPose` and cleared calibrated rig state on every paused frame index, so rapidly stepping frames repeatedly pulled the visible avatar toward standing. The repaired contract never resets visible bones for a seek.
- Adjacent Previous/Next navigation now preserves temporal continuity. A discontinuous slider or diagnosis jump clears root history, foot locks, transition/hold state, stability state, and last-good filters, while preserving visible bones, rest mapping, source calibration, rig measurements, and setup calibration.
- Focused runtime regressions assert both directions of adjacent frame 280/281 navigation do not reset, a 12-to-281 jump does reset temporal history, and neither frame-jump path calls `resetNormalizedPose`.
- Added `full-motion-frames-279-283-fidelity.json`, a sanitized immutable red window with source hash `sha256:47e1940250c10f9855d8b1086308b8f80361a424efc5d3a4e591f0936e204e1f`, source frame count `3026`, source indexes 279-283, and historical-only acceptance metadata. Its independent direction vectors reproduce the retained dot-product errors without raw landmarks.
- The five-frame window proves sustained historical divergence: average upper-body error remains `0.2907-0.2972`, left upper-arm error remains `0.6532-0.6870`, and right lower-arm error remains `0.2798-0.3345`. The historical active-spine owner lacks its own target rotations, so the strengthened analyzer correctly reports those five spine samples as proof-limited rather than reusing the cross-owner visual metric.
- Head proof no longer uses the first trustworthy rendered movement frame as a rest offset. Current telemetry records target and final world quaternions; the analyzer computes the real quaternion delta per pitch/yaw/roll axis. A constant `0.20`-radian wrong orientation now blocks all frames, and current-fingerprint artifacts missing quaternion proof fail closed.
- Fresh deterministic rendered proof now covers all `3,026/3,026` `Full Motion Exercises` frames with zero missing frames, zero neutral resets, zero owner flickers, and zero strict failures under the unchanged `0.10` policy. Maximum errors are `0.0051` average upper body, `0.0447` spine, `0.0192` left upper arm, `0.0039` left lower arm, `0.0101` right upper arm, and `0.0382` right lower arm. Head maxima are `0.0302` pitch, `0.0283` roll, and `0.0409` yaw across `3,023` quaternion-eligible frames.
- The reopened frame 281 is no longer a false green: fresh final rendered proof reports average upper-body error `0`, upper-arm errors `0.0001`, lower-arm errors `0`, and no visible-bone reset. This replaces the historical `0.2939` average, `0.6694` left upper arm, and `0.2592` spine evidence for the current fingerprint without changing the source hash.
- The deterministic harness now carries the prior motion frame during paused frame stepping, so deterministic certification exercises the same temporal target contract used by timed Replay and Game Studio. The prior harness rebuilt isolated frames and could not prove temporal target stabilization.
- Replay now exposes the imperative timed root-motion ref to the avatar only while playback is running. While paused, the declarative selected-frame root pose is authoritative, preventing the last played or previous-recording heading from persisting indefinitely. Unit regressions cover both presentation modes, and a browser reproduction switching from turned Body Capture frame 1044 to Full Motion frame 281 confirms both source and avatar face forward with arms overhead.
- Arm target construction now blends toward the metric world direction when the display-plane forearm vector is foreshortened, preventing tiny camera-plane sign crossings near frames 3006-3014 from becoming full target reversals. Shared arm and spine targets are rate-limited across adjacent source frames before final VRM application.
- Final arm continuity is no longer timing-sensitive at a child confidence boundary. Arm target motion is capped at `4.8 rad/s`; lower arms remain active down to `0.15` confidence with a responsive child compensation slerp, while upper-arm ownership retains the normal `0.30` threshold. This keeps a source-limited forearm attached to its world target as its parent moves instead of accumulating error and snapping back on reacquisition.
- Held-spine analysis now compares the visible held pose with the previous rendered pose. A held drive emits a zero-valued no-op command, so comparing it with zero incorrectly reported more than 200 severe frames even when the avatar correctly held its last pose.
- Final spine and arm application now scale interpolation and angular budgets by elapsed render time, capped at `0.10s` so a resumed browser tab cannot apply an unbounded jump. The active spine writer can catch up at `3.84 rad/s`, above the target stabilizer's maximum rate, while retaining the same shared target contract in Replay and Game Studio.
- Head application now writes upper-chest and neck parents before the final head world quaternion. When calibrated spine drive owns the torso, head application no longer writes a second upper-chest compensation, removing the late-recording parent/owner conflict.
- Uninterrupted timed playback now passes strict analysis under a deliberately sparse capture cadence: all `3,026` source frames were processed, `749` rendered samples were compared, zero rendered frames were missing, and there were zero strict failures, neutral resets, owner flickers, or jerk frames. Maxima were `0.0976` spine, `0.0368` across the arm chains, and `0.0012` across head axes.
- Final deterministic reproof also passes: `3,026/3,026` final rendered frames compared, zero missing, zero failures, zero neutral resets, and zero owner flickers. Maximum errors were `0.0017` average upper body, `0.0008` spine, `0.0154` left upper arm, and at most `0.0003` on any head axis. Four foot-clearance snap diagnostics at frames 1863-1864 remain non-blocking and outside this reopened upper-body slice.
- Strict fast-subset proof now passes `Spins`, `Full Spinal Flow`, and `Full Motion Exercises` together. Deterministic/three-party coverage is `648/648`, `1,290/1,290`, and `3,026/3,026`; intended-time captures processed every source frame with `220`, `512`, and `843` rendered samples respectively, all with zero missing frames.
- The first fast-subset analysis correctly exposed two proof-layer defects without changing runtime thresholds. Three-party head fidelity still used calibrated Euler yaw and manufactured near-`pi` errors when `Spins` crossed the wrap boundary; it now uses the same target-to-final world-quaternion delta as full-sequence proof. Aggregate upper-body confidence now inherits the weakest required-segment confidence, preventing a source-limited arm from being promoted to trustworthy by unrelated whole-body quality while preserving the `0.10` gate for trustworthy averages and every required segment.
- A complete July 15 all-nine refresh accounted for **34,149 lane-frames** with zero missing: `11,383` deterministic player frames, `11,383` intended-time processed source frames, and `11,383` three-party frames. After proof-layer reanalysis it remained honestly **7/9**; Star Jumps and Body Capture retained rendered-fidelity blockers, so the bundle was never promoted to acceptance.
- The subsequent latest-runtime all-nine refresh again captured all **34,149 lane-frames** with zero missing and advanced to **8/9**. Star Jumps and Body Capture passed; Full Spinal Flow alone blocked on timed spine error `0.1001` at frame 898 plus a held-static false positive for an unapplied neutral-fallback right-thigh target at frames 1287-1289.
- The final-fingerprint all-nine refresh at `current-nine-recording-proof-2026-07-15-final-0-10` passed **9/9** under the July 15 fields with deterministic, intended-time, and three-party totals of `11,383/11,383` each, zero missing and zero failures. It was promoted as the controlling global Replay artifact at that checkpoint; the July 16 frame-652 reopening now classifies it as historical coverage/application evidence rather than visual acceptance.
- Held-spine three-party proof now compares the current rendered pose with the prior rendered pose instead of comparing a no-op command with zero. Both analyzers normalize rounded telemetry vectors before computing angles, preventing false divergence and false held-static results. Deterministic batch capture also preserves prior motion-frame history, matching the timed/shared target contract instead of rebuilding isolated frames.
- Full Spinal Flow then exposed a genuine root/support feedback snap around frames 801-802: the root-height command consumed the previous post-support correction, and a low-confidence foot-contact boundary switched the lower-body presentation model toward neutral. Root command history is now independent of the support offset, planted contact uses confidence hysteresis, and suppressed contact changes retain planted-squat ownership and hip-drop presentation.
- The timed jerk gate now blocks any single rendered step of at least `0.25`, even below one percent of the recording and without a three-frame persistent run. The former approximately `0.52` foot-clearance plunge therefore cannot pass as an isolated diagnostic.
- Held-static leg proof now requires the lower-body retarget to be actively applied on both frames, so moving targets ignored by a neutral fallback cannot masquerade as a frozen applied bone. The bounded final spine writer is `0.064` radians per 60 fps step.
- Final-fingerprint Full Spinal Flow passes all three strict lanes at **1,290/1,290**, zero missing, zero failures, and zero severe snaps. Frame 801 keeps left clearance `0`, while right clearance progresses smoothly; frame 898 and the sequence-wide maximum spine error are `0.0802` without changing the `0.10` limit. The end-of-recording right-thigh static count is correctly zero.
- The matching deterministic player and independent three-party captures also pass **1,290/1,290** frames each with zero missing and zero failures. Three-party proof reports zero missing role frames and axial p95 `0`. Because these runtime changes alter the fingerprint after the complete all-nine run, global all-nine acceptance still requires a fresh rerun.

2026-07-10:

- Reproduced the user-reported problems on `px75fgt11wbg0jvr17j6fc2dvd89trpm`, including the leg owner switch around frames 418-474 and the missing lateral leg travel at frames 840 and 970.
- Ran the shared Replay/Game motion path over every stored frame in all nine acceptance recordings. The baseline had 1 failed session and 9 analyzer errors; the corrected run has 0 failed sessions and 0 analyzer errors. The remaining 45 warnings are principally source visibility/feet quality and whole-recording visual-match review warnings.
- Corrected world-landmark arm retargeting so depth is retained while the camera-plane arm direction follows the visible source pose. This closes the metric blind spot where the applied arm could agree with its internally generated target while visibly disagreeing with the source image.
- Kept complete recorded lower-body retargeting in continuous ownership through leg raises instead of switching the feet to a planted-flat pose at a classification threshold.
- Stopped neutral side-bend presentation from suppressing a visible lateral leg lift when both source feet are not in contact.
- Increased recorded head yaw, pitch, and roll fidelity so stable replay data is not visually flattened by live-input damping.
- Removed a false `squat_not_detected` classification for side-on turn/standing frames by requiring actual squat shape evidence, not raw hip drop alone.
- Rendered recaptures of px75 frames 441, 840, and 970 confirm continuous recorded foot ownership; frame 840 lower-body direction error changed from `0.1664` to `0`, and frame 970 retains a planted-foot clearance blocker for further review rather than being called accepted.
- Tightened `movement:avatar-follow-gate`: a supported recording below `0.85` now blocks regardless of a few clean selected captures. The prior rule that allowed sparse captures to override an `84%` whole-recording score has been removed and regression-tested.
- Current corrected whole-recording scores include px75 `89%`, px7b0 `88%`, and px7fafa `91%`; the other six recordings remain review/source-limited at `40%` to `77%`. The all-nine set is therefore improved and honestly blocked, not visually complete.
- Verification passed under Node 22.13.0: 374 focused correction/gate tests, `verify:env`, `lint:all`, the full `check` gate, production `build`, `movement:architecture-guard`, and `git diff --check`. `movement:today-finish-gate` now stops at the avatar-follow gate on the stale proof bundle, which is the intended honest result until fresh captures are recorded.

2026-07-09:

- Phase 1 false-green prevention started.
- `movement:avatar-follow-gate` now blocks supported capture-backed recordings when visual match is below `0.85`, not only telemetry-backed recordings.
- `movement:avatar-follow-gate` now blocks supported Replay Studio `review` sessions even when no specific worst-frame blocker is emitted.
- CLI output now says avatar-follow acceptance is blocked and prints per-recording acceptance state.
- Replay Lab now exposes `data-avatar-follow-acceptance-status` and displays `accepted`, `review-only`, or `blocked-for-acceptance` instead of a pass-like badge for review states.
- Added regression coverage for the screenshot-shaped false green: supported recording, `84%` visual match, Replay Studio `review`, no persisted avatar telemetry, and capture-backed proof.
- Current real proof bundle now blocks as intended with 8 acceptance issues instead of passing.
- Phase 3 diagnostics started. Replay Lab current-frame checks now emit named visual acceptance blockers for `avatar_head_alignment_diverged`, `avatar_spine_angle_diverged`, `avatar_arm_pose_diverged`, and `avatar_planted_foot_diverged` using existing head/spine/avatar segment/foot-owner telemetry.
- The shared replay failure-code union and CLI fix-area mapper now know those named visual blockers, so they can become fix-log tasks rather than loose UI text.
- Shared lower-body owner selection now keeps player leg-raise feet on `player-leg-raise-planted-flat` when foot segments are available, instead of handing those feet to `recorded-retarget`; missing-foot leg raises still use `player-legacy-foot-fallback`, and squat feet remain recorded-retarget.
- Added focused Replay/Game regression checks for player leg raises with available feet, missing-foot leg raises, and Replay analyzer compatibility.
- Runtime lower-body retarget plans now apply an explicit player leg-raise overlay even when solved leg retargeting is available, because the px75 frame 868 proof showed generic retarget ownership could leave the avatar visually standing/seated while the Game path classified a leg raise.
- The single-leg-raise pose now ramps visible lift earlier and includes stronger lateral abduction for side-leg proof frames. A recapture of `px75fgt11wbg0jvr17j6fc2dvd89trpm` frame 868 improved from the seated/drifting posture to a flat planted-foot standing pose with the moving leg lifted, while still remaining blocked by lower-body visual error (`0.1582`) rather than accepted.
- Replay Lab and `movement:replay:capture` now expose/persist the live feet owner for selected proof frames.
- Replay Lab now reads live lower/feet owners from `fallbacks.owners` before falling back to recorded replay metadata. A recapture of `px75fgt11wbg0jvr17j6fc2dvd89trpm` frame 868 now reports `lowerOwner: player-right-leg-raise` and `feetOwner: player-leg-raise-planted-flat`, confirming the UI is showing the live runtime owner instead of stale `recorded` labels.
- Replay Lab now shows and exports per-frame Avatar Follow acceptance criteria for head, body/spine, arms, and planted foot. The capture manifest records the four criteria statuses plus current failure codes and per-segment errors.
- Tightened the body/spine criterion so high avatar spine segment error with confident torso source tracking blocks even when the recorded spine-drive magnitude is not classified as strong. The recaptured `px75fgt11wbg0jvr17j6fc2dvd89trpm` frame 868 now reports `blocked-for-acceptance` with `avatar_spine_angle_diverged`, `avatar_head_alignment_diverged`, `avatar_planted_foot_diverged`, and `avatar_output_diverged`; criteria are `head: blocked`, `spine: blocked`, `arms: pass`, `foot: blocked`.
- Fixed replay/game motion-frame head yaw application so display-mirrored motion-frame landmarks are not mirrored a second time. The same `px75fgt11wbg0jvr17j6fc2dvd89trpm` frame 868 now reports raw pose yaw `0.6529`, applied yaw `0.7089`, and `head: pass`. The frame remains correctly blocked on `avatar_spine_angle_diverged`, `avatar_planted_foot_diverged`, and `avatar_output_diverged`.
- Replay capture manifests now export spine confidence, side-bend, forward-lean, and twist. On the current blocked px75 frame 868, spine confidence is `0.9999`, side-bend is `0.2270`, forward-lean is `0.1641`, twist is `0.2212`, and spine segment error remains `0.2187`.
- A pipeline-level attempt to choose recorded spine ownership for replay-origin frames was rejected because it breaks the Replay/Game parity guard. The remaining spine/body fix should happen in shared motion-frame presentation or VRM application plumbing, not by splitting Replay from Game Studio source ownership.
- Replay capture manifests now export individual left/right foot and shin segment errors. On px75 frame 868 this showed the planted left foot was the foot blocker (`leftFoot 0.1464`) while the right lifted shin remained the largest leg mismatch (`rightShin 0.3782`).
- Reduced the planted-side foot neutralization in the single-leg overlay so solved foot retargeting can preserve the recorded planted-foot direction. The same frame now reports `leftFoot 0.0207`, `rightFoot 0.0845`, `footMax 0.0845`, and `foot: pass`; it remains blocked on `avatar_spine_angle_diverged` and `avatar_output_diverged`.
- Added capture/export diagnostics for source-vs-avatar shin and spine vectors, so frame-level failures can explain the direction mismatch instead of only reporting scalar error.
- Empirically rejected a lower-leg sign flip for the px75 frame because it worsened right-shin error (`0.3783 -> 0.4757`) and re-blocked the planted foot.
- Changed retargeted player leg-raise handling so complete solved lower-body retargeting owns the pose instead of applying a canned leg-raise overlay on top. On `px75fgt11wbg0jvr17j6fc2dvd89trpm` frame 868, this moved `rightShin 0.3783 -> 0`, both foot errors to `0`, and cleared `avatar_output_diverged`.
- Included the spine segment in recorded upper-body retarget mapping so the source skeleton can be the final visual authority for Replay/shared motion-frame proof. On the same frame, `spine 0.2187 -> 0.0526`, criteria became `head: pass`, `spine: pass`, `arms: pass`, `foot: pass`, and current failure codes cleared.
- Refreshed a 6-session Replay visual proof set and re-analyzed the 9-recording avatar-follow bundle into `tmp/movement-replay-lab/replay-lab-tightening-avatar-follow-analysis.json`. The tightened gate still blocks honestly with 32 issues: missing visual captures, review-only sessions, and two low visual-match recordings remain. Two recordings are accepted candidates (`px74tzfb514yq5zpm2mpt3fdkx89xr2z`, `px7b0y1rcfbe1e1zanknsgefp986f1qs`), and the inspected px75 frame is visually clean, but the full 9-recording gate is not accepted yet.
- Captured the remaining analyzer-selected visual-proof candidate frames for seven recordings and re-analyzed the bundle into `tmp/movement-replay-lab/replay-lab-tightening-avatar-follow-analysis-v2.json`. Manifest pass rows improved from 15 to 28, manual-review rows dropped from 21 to 8, missing-proof rows dropped from 24 to 10, visual-capture rows increased from 31 to 54, and the avatar-follow gate dropped from 32 issues to 6 source/session review issues.
- Refined `movement:avatar-follow-gate` so source-coverage-only Replay Studio review status and coarse visual-match warnings do not fail avatar-follow when selected visual captures are clean and there are no reviewed/blocked visual frames. The screenshot-shaped false green still blocks when Replay Studio has an actionable review frame.
- Updated the local current proof artifacts (`tmp/movement-replay-lab/current-analysis-with-captures*` and `tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures*`) to the v2 report. `npm run movement:avatar-follow-gate` and `npm run movement:replay-studio-verdict-gate` now pass across 9 checked recordings: supported rows are `accepted-candidate`, and source-limited rows remain explicitly `not-supported`.
- Broader verification passed: `npx -p node@22.13.0 npm run movement:architecture-guard`, `npm run movement:avatar-follow-gate`, `npm run movement:replay-studio-verdict-gate`, `npm run verify:env`, `npm run lint:all`, `npm run check` (352 files / 2053 tests), and `git diff --check`. The local Replay Lab endpoint still responds and redirects unauthenticated users to `/login`.
- Reopened the planted-foot criterion after the 2026-07-09 screenshot showed the source planted foot on the floor while the avatar foot appeared to float and the UI still reported `Planted foot PASS`. The gap was that the foot criterion measured only source-vs-avatar foot segment direction, so a correct-looking foot direction could pass while the whole foot/root was above the grid.
- Avatar visual telemetry now carries live foot world positions plus floor clearance (`leftFootClearance`, `rightFootClearance`), sourced from the existing footing runtime snapshot. Replay Lab evaluates the current root-motion `plantedFoot` side, shows `clear` in the Planted foot criterion, exports left/right/planted clearance data attributes, and emits `avatar_planted_foot_diverged` when selected planted-foot clearance is above `0.08`.
- Replay visual capture manifests now summarize `avatarPlantedFootClearance`, and `movement:avatar-follow-gate` blocks capture-backed proof rows when the summarized planted-foot clearance exceeds the same `0.08` threshold. Existing current proof artifacts still pass because they were generated before this clearance field existed; the next proof refresh will carry and enforce the new clearance metric.
- Verification for the planted-foot tightening passed: focused telemetry/manifest/avatar-follow tests (3 files / 76 tests), `npx -p node@22.13.0 npm run check` (352 files / 2055 tests), and `npx -p node@22.13.0 npm run movement:today-finish-gate`. A temporary local-auth capture attempt on port 3100 could not be completed because the sandbox blocked the network fetch for the Node package used by `npx`; the main local app on port 3000 remained reachable.

## Progress

- Overall movement roadmap: approximately 96%. The shared runtime, frame accounting, temporal proof, side ownership, target-to-final application, semantic torso/head orientation, and rendered sole-contact gates now pass all three complete automated `Full Body Flow` lanes; broader renewed acceptance remains open.
- July 16 diagnosis/documentation slice: 100%.
- Phase 13 semantic/contact hardening: 96%; fixture, confidence classification, telemetry, focused gates, shared repair, targeted proof, and all three complete automated `Full Body Flow` lanes pass. Packet/bundle/avatar-follow propagation remains.
- Phase 14 renewed tiered/human acceptance: 45%; deterministic player, intended-time player, and three-party `Full Body Flow` proof pass under the final runtime. Current manual seek, fast subset, all-nine, and broader human review remain open.
- Earlier rendered-fidelity work remains historical implementation evidence, not current global visual acceptance. It must not be summarized as 9/9 accepted until the new gates are present and the proof is regenerated.
- Phase 6 red baseline and metric proof: 100%.
- Phase 7 canonical strengthened policy: 100%.
- Phase 8 per-segment and absolute head gates: 100%.
- Phase 9 manual seek acceptance: 100%; human interaction, cross-recording root-heading checks, and durable physical slider-drag convergence all pass.
- Phase 10 shared runtime repair: 100% for the controlling and fast-subset recordings.
- Phase 11 historical tiered reproof: 100% for the July 15 policy and fields; the artifact accounts for all `34,149/34,149` lane-frames but is insufficient for July 16 visual acceptance.
- Phase 12 human Replay and live confirmation: reopened; broader human Replay review remains mandatory before Game Studio confirmation.
- Historical false-green prevention work remains valuable, but its earlier `100% implemented` status is superseded by the frame-281 reopening.
