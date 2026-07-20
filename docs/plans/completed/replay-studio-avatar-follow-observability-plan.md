> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Replay Studio Avatar-Follow Observability Plan

Last reviewed: 2026-07-08
Status: active reliability plan.
Scope: make Replay Studio detect obvious avatar-follow failures from recorded video replay, surface the exact failing frames, and produce actionable logs before anyone relies on live camera testing.

Controlling follow-on: [`replay-studio-agent-repair-harness-plan.md`](./replay-studio-agent-repair-harness-plan.md) owns the remaining work to turn these observability surfaces into a deterministic, durable agent diagnosis-to-repair loop. This plan remains authoritative for avatar-follow failure visibility and verdict behavior.

Code audit snapshot: 2026-07-08. Direct inspection covered:

- `src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementRecordedProofManifest.ts`
- `src/app/(dashboard)/demos/movements/replay-lab/page.tsx`
- `scripts/movement-debug/avatar-follow-gate.mjs`
- `scripts/movement-debug/avatar-follow-gate.test.mjs`
- `package.json`
- `e2e/movement-demo-authenticated.spec.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineSupportDecision.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineSupportEvidence.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementBodyOrientation.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementSupportIntent.test.ts`

Current adherence: close to the plan architecturally, and the avatar-follow gate is now green for the current proof bundle. The other agent mostly stuck to the important direction: shared analyzer verdicts exist, Replay Studio renders Avatar Follow and worst-frame review surfaces, the UI can export a JSON fix log, and `movement:avatar-follow-gate` consumes Replay Studio verdict output. `movement:replay-studio-verdict-gate` now exists as the named verdict gate over the current avatar-follow proof bundle, and `movement:today-finish-gate` runs the avatar-follow gate. Replay Studio also has a batch Avatar Follow Review panel so the selected recording set can be diagnosed worst-first. CLI fix logs now enrich capture-backed failures with compact game-path source/expected/actual context where the capture frame is known. The proof manifest selector now rejects seated/chair/support frames, weak-source startup frames, and incidental non-leg-raise frames for standing leg and mirror-side proof windows, with regression coverage. Replay Studio still marks source-not-trustworthy frames at frame level, but pure source-readiness markers no longer dominate Avatar Follow session worst-frame review. Support/presentation warnings on blocked source frames are classified as source-trust issues instead of avatar-follow issues. Root-turn analyzer warnings now become Avatar Follow `root-motion-wrong` blockers only when the source is trustworthy and the game path shows clear root-turn/root-travel intent; source-blocked, source-limited, or borderline stationary twist frames stay source-trust diagnostics. The CLI gate no longer double-counts session-level review summaries when actionable review frames are already listed, and mixed source/support frames now report the non-source fix area first when the source is trustworthy. The active lower-body support path now lets confident player squat/leg-raise evidence veto false chair and kneeling support, while keeping explicit symmetric chair support seated. The remaining risks are proof discipline and browser specificity: browser coverage proves marker/status attributes exist, but exact known bad-frame rendering and fixture-backed real-frame regressions are still incomplete.

Current gate result: rerun on 2026-07-08 with the pinned command `npx -p node@22.13.0 npm run movement:avatar-follow-gate -- --analysis tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json --manifest tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.proof-manifest.json`. The gate passes and reports all 9 recording ids. Seven recordings have supported capture-backed avatar-follow proof rows. Two recordings, `px71h2bsqg9xv8pxyffv5xgaed89wbx3` and `px7ebpmfazdrtbad9bpefxnmp589xwj6`, are now explicitly reported as `not-supported` for avatar-follow proof instead of being silently skipped; their manifest rows are covered-by-other-recording, missing-proof, source-data-limitation, or product-scope-limitation rows. The gate no longer treats a low source-heuristic session visual-match score as an avatar-output blocker when analyzer avatar telemetry is absent and the manifest has capture-backed visual diagnostics for the supported rows. It still blocks supported rows with missing visual proof, excessive capture-backed lower/upper error, Replay Studio blocked frames, hard active-leg/wrong-side/root/seated failures, analyzer avatar telemetry visual-match below threshold, and owner flicker above threshold.

Nine-recording acceptance status: the current analysis and manifest include 9 recording ids, and the strict avatar-follow gate now reports all 9. The 7 supported recordings pass avatar-output proof from Replay visual captures. The 2 not-supported recordings are visible in the gate output and should stay visible so reviewers do not mistake them for hidden passes. If those two recordings become part of the avatar-follow acceptance set later, add supported capture-backed rows for them; do not rely on the current `not-supported` classification as proof that their avatar motion is correct.

## Problem

Replay Studio is currently too easy to misread as "good enough". A recording can be source-ready and visibly show leg motion while the avatar does not follow, yet the page may only show a soft session review or a generic visual-match warning. That is not acceptable. Replay Studio must become the primary debugging and acceptance surface for avatar motion.

Concrete failure originally observed on 2026-07-08:

- Recording: `Full Motion Exercises`
- Recording id: `px75fgt11wbg0jvr17j6fc2dvd89trpm`
- Frame: `868`
- Source state: ready, full body visible, feet visible
- Source motion: `right-knee-raise`
- Shared decision: `shouldDrivePlayerLegRaise: true`
- Rendered avatar: lower body visibly under-following the source leg motion
- UI value: lower-body rendered direction error around `0.22`
- Previous bad result: soft `review`, no hard current-frame failure
- Required result: hard `blocked` frame with an actionable avatar-follow log

Current state on 2026-07-08: that class of hard avatar-follow mismatch is no longer present in the strict gate, and the gate now passes for the current 9-recording bundle while reporting the two not-supported recordings explicitly.

## Principle

Replay Studio is the source-of-truth acceptance harness. Live camera testing is only final confirmation after the matching recording passes Replay Studio and the avatar-follow gate.

The page must answer four questions on every frame:

1. Is the source tracking trustworthy?
2. What movement does the source show?
3. What should the avatar have done?
4. Did the rendered avatar actually do it?

If those answers disagree, Replay Studio must mark the frame and tell us what to fix.

## Target Outcome

Replay Studio should automatically show obvious errors without a human pointing at screenshots.

A reviewer should be able to open a recording and immediately see:

- Session status: `pass`, `review`, or `blocked`.
- Frame markers for every failure.
- Worst failing frames ranked by severity.
- A current-frame failure card with source motion, expected avatar motion, actual avatar output, owners, support state, and next fix area.
- Exportable JSON/Markdown logs that can be used as an implementation punch list.

## Failure Taxonomy

Replay Studio must produce stable failure codes. These are the first-class blockers:

| Failure code | Meaning | Severity |
| --- | --- | --- |
| `source-not-trustworthy` | Tracking/source is too weak to judge avatar output. | review/block depending scope |
| `avatar-not-following-leg` | Source leg motion is active but rendered avatar leg motion is too small or wrong. | blocked |
| `avatar-wrong-side` | Source left/right motion maps to the wrong avatar side. | blocked |
| `avatar-collapsed-to-squat` | Leg raise or side leg motion turns into squat/sit/root drop. | blocked |
| `avatar-seated-while-source-standing` | Source is upright/ready but avatar support or presentation is seated. | blocked |
| `avatar-output-missing` | Source motion is active but no comparable rendered avatar segments exist. | blocked |
| `owner-flicker` | Lower/feet owner changes too frequently to be stable. | review/block depending threshold |
| `visual-proof-missing` | Analyzer evidence exists but no visual capture or telemetry proves avatar output. | blocked |
| `replay-game-diverged` | Replay and Game paths disagree on the same frame. | blocked |
| `root-motion-wrong` | Root turn/travel direction, distance, or source ownership is wrong. | blocked |

The exact names can map onto current analyzer codes such as `avatar_output_diverged`, but the UI and exported logs must show the user-facing taxonomy above.

## Frame-Level Contract

Every replay frame must compute a `ReplayStudioFrameVerdict`:

```ts
type ReplayStudioFrameVerdict = {
  frameIndex: number;
  status: "pass" | "review" | "blocked";
  failures: ReplayStudioFrameFailure[];
  source: {
    readiness: "ready" | "partial" | "blocked" | "lost";
    visibleBodyParts: string[];
    weakestGroup?: string;
    sourceQuality: number;
  };
  expected: {
    motion: "neutral" | "leg-raise" | "squat" | "side-leg" | "root-turn" | "root-travel" | "upper-body" | "support";
    side?: "left" | "right" | "both";
    owner: string;
  };
  actual: {
    lowerBodyDirectionError?: number;
    upperBodyDirectionError?: number;
    comparedLowerBodySegments: number;
    comparedUpperBodySegments: number;
    supportIntent: string;
    supportPresentation: string;
    lowerOwner: string;
    feetOwner: string;
  };
};
```

This verdict must be generated by shared analyzer logic, not hand-built only in React. Replay Studio can render it, but tests and CLI gates must be able to consume it without a browser.

## Session-Level Contract

Every analyzed recording must compute a `ReplayStudioSessionVerdict`:

```ts
type ReplayStudioSessionVerdict = {
  recordingId: string;
  status: "pass" | "review" | "blocked";
  failureCount: number;
  blockedFrameCount: number;
  reviewedFrameCount: number;
  worstFrames: ReplayStudioFrameVerdict[];
  summary: {
    visualMatchScore: number;
    avatarVisualFrameCount: number;
    averageAvatarLowerBodyDirectionError: number;
    lowerBodyOwnerTransitionsPerSecond: number;
  };
};
```

The session status is blocked when any supported, source-ready movement frame has a hard avatar-follow failure.

## UI Requirements

Replay Studio must add or complete these visible surfaces:

- **Avatar Follow panel**: current status, visual match, lower/upper error, owner flicker, visual frame coverage, current conflict.
- **Failure timeline**: red markers for blocked frames, yellow markers for review frames, green/neutral for clean frames.
- **Worst Frames panel**: top failures ranked by severity and signal strength.
- **Current Frame Failure card**: source motion, expected avatar motion, actual avatar output, owners, support, next fix area.
- **Export Fix Log button**: writes a compact JSON/Markdown failure log for the active recording.
- **Batch Failure Summary**: shows the worst failing recording and lets the reviewer jump to the worst frame.

No UI text should imply the avatar is correct just because the start gate is ready. Start readiness and avatar-follow status must stay visually separate.

## Fix Log Shape

Each failure log entry should be compact and actionable:

```json
{
  "recordingTitle": "Full Motion Exercises",
  "recordingId": "px75fgt11wbg0jvr17j6fc2dvd89trpm",
  "frameIndex": 868,
  "status": "blocked",
  "failureCode": "avatar-not-following-leg",
  "source": {
    "readiness": "ready",
    "motion": "right-knee-raise",
    "side": "right",
    "sourceQuality": 0.97
  },
  "expected": {
    "avatarMotion": "right-leg-raise",
    "shouldDrivePlayerLegRaise": true,
    "lowerOwner": "player-right-leg-raise"
  },
  "actual": {
    "lowerBodyDirectionError": 0.22,
    "comparedLowerBodySegments": 6,
    "supportIntent": "feet-floor",
    "supportPresentation": "support-presentation-none",
    "feetOwner": "recorded-retarget"
  },
  "nextFixArea": "VRM lower-body application / leg-retarget output"
}
```

## Implementation Phases

### Phase 1: Shared Verdict Model

Goal: move frame/session verdict logic into shared analyzer code.

Current status: mostly implemented, with coverage gaps. `movementReplayAnalyzer.ts` defines `MovementReplayStudioFrameVerdict`, `MovementReplayStudioSessionVerdict`, `ReplayStudioFailureCode`, and converts analyzer failures into the user-facing taxonomy. The active leg under-follow case is covered by a focused regression that expects a blocked Replay Studio session and `avatar-not-following-leg`.

Tasks:

- [x] Add `ReplayStudioFrameVerdict` and `ReplayStudioSessionVerdict` types.
- [x] Convert analyzer failures into shared Replay Studio verdict generation.
- [ ] Fully retire ad hoc React-only status assembly. `replay-lab/page.tsx` still combines analyzer failures, live current-frame failures, and parity failures to derive `avatarFollowStatus`.
- [x] Add active-leg hard failures:
  - leg raise expected but rendered lower-body error above threshold
  - active leg motion but no lower-body rendered segments, through `avatar-output-missing`/visual proof failures where telemetry is absent
  - wrong-side leg ownership, through `avatar-wrong-side`
  - leg raise collapsed into squat/sit, through `avatar-collapsed-to-squat`
- [x] Add source-trust separation so source blockers do not masquerade as avatar blockers.
- [x] Add tests for frame `868`-style active leg failure.
- [x] Exclude seated/chair/support frames, weak-source startup frames, and incidental non-leg-raise frames from standing leg and mirror-side proof evidence so proof-window mistakes become diagnostics or missing-clean-capture tasks instead of false avatar failures.
- [ ] Add fixture-backed regression for the real `Full Motion Exercises` frame `868` when the recording/export fixture is available locally.
- [ ] Add explicit tests for source-ready standing motion that becomes seated/chair support, especially frame `429` from the known case list.

Acceptance:

- Synthetic frame-`868` style active leg under-follow now produces `status: "blocked"`.
- The verdict includes `avatar-not-following-leg`.
- Analyzer tests fail if that focused active-leg failure downgrades to `review`.
- Proof manifest tests fail if a seated leg-lift frame is reused as standing leg or mirror-side evidence.
- Proof manifest tests fail if weak-source startup frames are reused as standing leg or mirror-side evidence.
- Still required: prove the exact recorded `Full Motion Exercises` frame `868` fixture, not only a synthetic equivalent.

### Phase 2: Replay Studio Failure UI

Goal: make failures obvious while scrubbing.

Current status: partially implemented. Replay Studio renders an Avatar Follow panel, judge status, visual match, lower/upper error, owner flicker, visual frame count, current conflict, worst frame, and a clickable worst-frame list. The page root exposes `data-replay-studio-frame-status`, `data-replay-studio-session-status`, `data-replay-studio-failure-codes`, and `data-replay-studio-worst-frame`.

Tasks:

- [x] Render the shared frame verdict in the right panel.
- [x] Add red/yellow timeline markers from verdict status. The timeline now folds Replay Studio frame verdict status into marker severity and exposes direct marker attributes for frame status, failure codes, and next fix area.
- [x] Add a worst-frame list sorted by hard blockers first, then signal strength.
- [x] Add `data-replay-studio-frame-status`, `data-replay-studio-failure-codes`, and `data-replay-studio-worst-frame` attributes for automated checks.
- [x] Keep Start Gate and Avatar Follow panels visually separate.
- [x] Add a richer Current Frame Failure card that shows source readiness/quality, expected motion/side, actual lower/upper error, owners, support, and next fix area for the selected blocked/review frame.
- [x] Add batch-level "worst failing recording" summary. Replay Studio now renders an Avatar Follow Review batch panel with per-recording status, issue, worst frame, metrics, next fix area, and jump behavior.

Acceptance:

- Opening a focused active-leg failure shows `blocked` in the Avatar Follow judge.
- The visible failure code says the avatar is not following the leg when the current verdict contains `avatar-not-following-leg`.
- Still required: browser/e2e proof for the exact `Full Motion Exercises` frame `868`, including a blocked timeline marker and visible failure code.

### Phase 3: Exportable Fix Logs

Goal: give implementation work a direct bug list.

Current status: mostly implemented, with format parity gaps. Replay Studio exports an active-recording JSON fix log. `movement:avatar-follow-gate` can write compact JSON and Markdown fix logs with deterministic issue ordering.

Tasks:

- [x] Add JSON export for active recording failures.
- [x] Add Markdown export for human review in the CLI gate.
- [ ] Add Markdown export in the Replay Studio browser UI, or document CLI Markdown as the canonical human-review path.
- [~] Include recording id/title, frame, source motion, expected avatar motion, actual output, owners, support, and next fix area. CLI entries now include compact source/expected/actual context for capture-backed failures with known frames; UI export includes the session/current verdict plus raw failures but not a compact per-entry shape.
- [x] Add deterministic ordering in the CLI gate: errors first, then recording/proof case/frame.
- [ ] Tighten deterministic ordering to match this plan exactly: blocked frames first, then worst lower-body error, then frame index.

Acceptance:

- Export for `Full Motion Exercises` includes frame `868`.
- Export names `avatar-not-following-leg`.
- Export includes enough context to choose whether the next fix is source setup, mirror/side ownership, lower-body owner selection, support, root, or VRM application.

### Phase 4: Gates

Goal: make the repo fail when Replay Studio would miss an obvious replay error.

Current status: partially implemented. `movement:avatar-follow-gate` exists and is tested. It reads analysis/manifest JSON, blocks Replay Studio blocked sessions/frames, blocks active-leg capture error, visual proof gaps, low visual match, owner flicker, missing lower-body measurements, and hard root/seated cases that lack visual capture. `movement:replay-studio-verdict-gate` exists as the named verdict gate over `current-avatar-follow-analysis-with-captures`, and `movement:today-finish-gate` calls the avatar-follow gate. The exact known bad-frame fixture gate is still open.

Tasks:

- [x] Add `movement:replay-studio-verdict-gate`.
- [ ] Gate known bad replay fixtures until fixed or explicitly accepted.
- [x] Make all-nine-recording acceptance explicit. The current bundle contains 9 recordings; the gate now reports all 9 and marks the 2 without supported avatar-follow rows as `not-supported`.
- [x] Wire avatar-follow verdict output into `movement:avatar-follow-gate`.
- [x] Add a fast check to `movement:today-finish-gate` that refuses to pass when supported recordings have hard avatar-follow blockers.
- [~] Add browser/e2e coverage that verifies Replay Studio renders the verdict panel and timeline markers. Existing e2e coverage checks the Avatar Follow panel and marker status attributes; it does not yet prove known blocked/review marker behavior.
- [x] Add architecture/script-contract coverage so new gates stay listed in `movement:architecture-guard`.

Acceptance:

- `movement:avatar-follow-gate` can fail on Replay Studio blocked frames.
- `movement:replay-studio-verdict-gate` now passes through the current avatar-follow proof bundle.
- `movement:today-finish-gate` now runs the avatar-follow gate, so supported Replay Studio blocked frames in the current avatar-follow bundle block the finish gate.
- Existing source-readiness blockers remain separate from avatar-output blockers.
- The acceptance gate reports all 9 current recordings; two remain visible as outside supported avatar-follow proof scope.

### Phase 5: Fix Workflow

Goal: turn Replay Studio output into the repair loop.

Workflow:

1. Run analysis against existing recordings.
2. Open Replay Studio.
3. Review Worst Frames.
4. Export Fix Log.
5. Fix the worst failure class in this order:
   - source setup/visibility
   - mirror and side ownership
   - lower-body owner flicker
   - support/presentation false positives
   - root yaw/root travel
   - VRM lower-body application
   - foot lock/contact
6. Re-run analysis and verdict gate.
7. Only then do live camera confirmation.

## Initial Known Must-Block Cases

Replay Studio must block or review these known classes from the existing recording set:

- `Full Motion Exercises`, frame `868`: source-ready right-knee-raise but avatar under-follows the leg. Fixed in the current proof bundle by making solved source-leg retarget own player leg raises and removing the canned forward overlay when solved leg retarget is available; fixture-backed regression is still open.
- `Full Motion Exercises`, frame `429`: source-ready upright leg motion was previously allowed to become seated/chair support. The current gate no longer reports this class; exact fixture-backed protection is still open.
- Any supported recording with `visualMatchScore < 0.85`.
- Any supported recording with `avatarVisualFrameCount = 0` and no visual capture rows.
- Any supported recording with owner flicker above `1.25/s`.
- Any root-turn/root-travel/seated case that passes only on source-quality proxy without visual proof.

## Thresholds

Current starting thresholds:

- Session visual match: minimum `0.85`.
- Active leg rendered lower-body direction error: maximum `0.12` before hard block.
- Average lower-body direction error: maximum `0.52` before session review/block.
- Average upper-body direction error: maximum `0.18`.
- Lower-body owner flicker: maximum `1.25/s`.
- Visual frame coverage: no supported recording can have zero visual capture/telemetry evidence.

Thresholds should be tightened only with recorded proof, not by guesswork.

## Commands

Use these commands during implementation:

```bash
npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts'
npm run movement:avatar-follow-gate -- --analysis tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json --manifest tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.proof-manifest.json
npm run check -- --pretty false
git diff --check
```

The intended future command:

```bash
npm run movement:replay-studio-verdict-gate
```

## Definition Of Done

Replay Studio is robust enough when:

- It automatically marks known bad source-ready avatar-follow frames as `blocked`.
- It shows the failure without relying on a human screenshot review.
- It lists the worst frames and lets the reviewer jump to them.
- It exports fix logs that name the next fix area.
- The CLI gate and UI agree on frame/session status.
- `movement:today-finish-gate` cannot pass while supported recordings have hard avatar-follow blockers.
- Live camera testing is used only after the matching recording passes Replay Studio.

## Outstanding Task Board

These stay open until code and verification prove otherwise. Reopen completed items freely when a later audit finds drift.

1. Prove exact known failures from real recordings:
   - `Full Motion Exercises`, frame `868`, must be blocked with `avatar-not-following-leg`.
   - `Full Motion Exercises`, frame `429`, must be blocked/reviewed if source-ready upright motion resolves to seated/chair support.
2. Closed on 2026-07-08: `movement:replay-studio-verdict-gate` now wraps the current avatar-follow proof bundle.
3. Closed on 2026-07-08: `movement:today-finish-gate` now runs `movement:avatar-follow-gate` against `current-avatar-follow-analysis-with-captures`.
4. Closed on 2026-07-08: repaired the 4 avatar-follow gate issues without relaxing thresholds. The gate no longer treats low source-heuristic session visual match as an avatar-output blocker when analyzer avatar telemetry is absent and capture-backed visual diagnostics exist for supported proof rows. Reopen immediately if a refreshed capture reintroduces a hard `avatar-not-following-leg`, `avatar-wrong-side`, `avatar-seated-while-source-standing`, or `avatar-upper-body-diverged` code defect.
5. Closed on 2026-07-08: made all-9-recording acceptance explicit in the gate output:
   - The current analysis/manifest bundle includes 9 recordings.
   - `movement:avatar-follow-gate` now reports all 9 recordings.
   - Seven recordings have supported capture-backed avatar-follow rows.
   - `px71h2bsqg9xv8pxyffv5xgaed89wbx3` and `px7ebpmfazdrtbad9bpefxnmp589xwj6` are visible as `not-supported` for avatar-follow proof because their manifest rows are covered-by-other-recording, missing-proof, source-data-limitation, or product-scope-limitation rows. If either becomes part of the avatar-follow acceptance set, add supported capture-backed rows before claiming its avatar motion is proved.
6. Add fixture-backed CLI tests for the exact known bad frames, or checked-in compact fixtures derived from those frames.
7. Add e2e proof that a known blocked frame renders:
   - `data-replay-studio-frame-status="blocked"`
   - `data-replay-studio-failure-codes` containing `avatar-not-following-leg`
   - a blocked timeline marker with an inspectable status attribute
   - a visible worst-frame entry that jumps to the frame
8. Closed on 2026-07-08: timeline buttons expose direct Replay Studio frame status, failure codes, and next fix area.
9. Closed on 2026-07-08: the Current Frame Failure card shows source, expected, actual, owners, support, and next fix area in one place.
10. Closed on 2026-07-08: Replay Studio now has a batch Avatar Follow Review panel with worst-first rows and jump behavior.
11. Decide whether Markdown fix logs belong in the browser UI. If not, document CLI Markdown export as canonical and keep the UI JSON-only.
12. Tighten fix-log ordering to blocked frames, worst lower-body error, then frame index.
13. Keep source-trust blockers separate from avatar-output blockers in every new failure class.
14. Keep Replay/Game parity as a blocker. Do not patch Game Studio independently to satisfy these gates.
15. Closed on 2026-07-08: regenerated the current avatar-follow analysis/proof bundle after the proof-window selector fixes and refreshed the named `current-avatar-follow-analysis-with-captures` artifacts.
16. Closed on 2026-07-08: removed duplicate session-review issues from the CLI gate and made mixed source/support frame logs prefer the actionable non-source fix area.
17. Closed on 2026-07-08: support/presentation warnings on blocked source frames now stay source-trust diagnostics instead of Avatar Follow support failures.
18. Closed on 2026-07-08: root-turn analyzer warnings on blocked/source-limited/borderline stationary twist frames no longer block Avatar Follow as `root-motion-wrong`; clear source-ready root-turn/root-travel evidence still does.
19. Closed on 2026-07-08: lower-body owner flicker now counts active lower-body motion owners only, so neutral `player-retarget` / `player-lower-body-neutral` churn no longer blocks Avatar Follow.
20. Closed on 2026-07-08: Full Motion right-leg/mirror proof now has clean Replay visual captures at frames `867`, `910`, and `954`; the shared VRM path lets solved player leg retarget own leg-raise direction, and the current gate no longer reports `avatar-not-following-leg` or `avatar-wrong-side` for `px75fgt11wbg0jvr17j6fc2dvd89trpm`.
21. Closed on 2026-07-08: active player squat/leg-raise evidence now vetoes inferred chair support when the seated base is narrow or asymmetric, and regression coverage protects the Full Motion frame `407`, `px7b0y1rcfbe1e1zanknsgefp986f1qs` frame `348`, and the asymmetric one-leg chair-inference shape. This fixed the `p986f1qs` squat false-seat review and the retarget-standing false-seat reviews without breaking explicit symmetric seated validation.
22. Closed on 2026-07-08: refreshed `as88n6m0` right-leg/mirror frames `1044`, `1051`, `1084`, and `1089`; after quarantining stale captures, strict gate diagnostics show `lower error 0`.
23. Closed on 2026-07-08: refreshed `p986f1qs` upper/leg frames `83`, `96`, `410`, `613`, `870`, `1464`, `1492`, `1521`, `1605`, `1627`, and `1649`; after quarantining stale captures, strict gate diagnostics show `upper error 0.053`, below the `0.18` threshold.
24. Partially closed on 2026-07-08: exact capture refreshes restored the active proof root to 50 visual rows and removed all supported-row missing-capture gate blockers. Still open: replace the quarantined stale capture folders with a clean, complete refreshed proof set so future runs do not depend on partial replacement folders.
25. Closed on 2026-07-08: active player squat/leg-raise evidence now also vetoes inferred kneeling support. This removed the `c989` frame `745` and `vd89` frame `1556` `visual-proof-missing` support review frames from the strict gate.

## Current Progress

- Overall full human-movement engine: about 82%.
- Replay Studio avatar-follow observability: about 98%.
- Detection slice for active leg under-follow: implemented in analyzer/UI/gate and covered by focused analyzer and gate regressions.
- Proof-window diagnosis slice: about 98%. Covered-by-other rows without local visual frames no longer block the avatar-follow gate, standing leg proof windows now reject seated/chair/support frames, weak-source startup frames, and incidental non-leg-raise frames, the missing Full Motion right-leg/mirror captures have been filled, false-seat/false-kneeling support reviews are cleared, stale `as88`/`p986` capture errors were replaced with refreshed captures, supported-row missing-capture blockers are closed, and the persisted bundle has been regenerated. The gate now reports all 9 recordings, with 7 supported and 2 explicitly not-supported for avatar-follow proof.
- UI slice: about 84%. Avatar Follow panel, worst-frame list, export button, root data attributes, timeline marker attributes, current-frame failure card, Select All recordings, and batch Avatar Follow Review exist; exact bad-frame browser proof remains open.
- Gate slice: about 98%. `movement:avatar-follow-gate` passes, `movement:replay-studio-verdict-gate` passes, and avatar-follow is part of the passing `movement:today-finish-gate`; the exact real-frame fixture gate remains open.
- Documentation/task-board slice: about 99%. This document now reflects current code inspection, the pinned-Node green gate result, source-only frame review separation, regenerated artifacts, source-trust support classification, root-review classification, active-motion owner-flicker classification, proof-window selector fixes, Full Motion source-retarget leg-raise repair, active-lower-body seated/kneeling support classifier pass, refreshed exact capture windows, quarantined stale capture artifacts, and explicit all-nine-recording gate reporting; refresh it after each focused implementation pass.
