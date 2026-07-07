# Movement Replay Lab Runbook

Purpose: replay stored movement debug recordings without asking for another live camera recording after every tweak.

Use Node `22.13.0` for these commands.

## Main Loop

Run one replay iteration:

```bash
npx -p node@22.13.0 npm run movement:replay:iteration -- --limit 5 --label current
```

By default this analyzes saved movement recordings from the `movements` table, not short debug snapshots.
If a recording is stored in Convex file storage, the first run creates a Convex export with `_storage`
files and later runs reuse that export so code-fix iterations stay fast.

After making new recordings, refresh the export:

```bash
npx -p node@22.13.0 npm run movement:replay:iteration -- --limit 5 --label after-new-recordings --refresh-export
```

This writes timestamped files under `tmp/movement-replay-lab/runs/`:

- `*.analysis.json`: current analyzer output for stored sessions.
- `*.comparison.json`: before/after deltas when a previous run exists.
- `*.md`: readable summary report.
- `latest-analysis-path.txt`: pointer used as the next run's comparison baseline.
- `latest-export-path.txt`: pointer to the Convex storage export used for saved recordings.

The Markdown report and analyzer output include coverage product-truth counts:
`user-facing`, `internal-demo-only`, and `missing-proof`. Treat `internal-demo-only`
as proof/demo readiness, not user-facing support.

Use this after each movement/retarget/avatar code change. The user should only need to make a new recording when the stored sessions no longer cover the failure being investigated.

For a hard proof gate after code changes, run the iteration wrapper with `--strict-manifest`. This forwards the recorded proof manifest gate to the analyzer while still writing the usual analysis, proof-manifest, comparison, and Markdown report. The Markdown report includes proof manifest counts, blocking proof-case and missing-layer summaries, and a blocking-row table with required layers and next actions, so `missing-proof`, `manual-review`, and `source-data-limitation` cases are visible without opening the JSON:

```bash
npx -p node@22.13.0 npm run movement:replay:iteration -- --limit 5 --label current --strict-manifest
```

## Useful Commands

Run the fast architecture/proof drift guard before and after movement architecture work:

```bash
npx -p node@22.13.0 npm run movement:architecture-guard
```

This checks the watched movement hotspots from the architecture plan, `MovementSourceFrame` source-truth purity, debug/preview route-bypass purity in core movement libs/hooks, coverage product-truth claims, the current Game visual semantic decisions, Game visual analysis-to-capture consistency, Game visual review-to-capture consistency, Replay/Game score-message parity, Game visual proof-frame count, and reviewed proof-manifest honesty. It is not a replacement for the full merge gate, but it is the cheapest way to catch `VrmAvatar`, pipeline facade, lower-body adapter, source/display contract, debug-route leakage, coverage-claim drift, stale Game visual captures or review decisions, hidden limitation-to-pass drift, or proof-artifact drift without running video captures.

Run the focused squat/knee-lift support-claim audit when changing coverage claims or lower-body proof logic:

```bash
npx -p node@22.13.0 npm run movement:squat-knee-lift-support-audit -- --strict
```

This requires one reviewed recording bundle to cover neutral standing, clear squat, left-only knee lift, right-only knee lift, mirror-side readability, and child-readable Game view before `squat-knee-lift` remains user-facing full support. The architecture guard also checks this audit while the family is user-facing.

Run the upper-body readiness audit before changing `upper-body-standing` support claims:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit
```

This is expected to report `blocked` for the broad `upper-body-standing` family until arm/reach/twist/shoulder proof and upper-body Game visual target/review cases exist. The narrow `standing-side-bend-head-direction` family is separately guarded by the same audit and the architecture guard while it remains user-facing. Use `--strict` only when intentionally trying to promote the broad family.
Pass repeated `--game-visual-plan` and `--semantic-review` paths when auditing focused supplemental proof alongside the stable default review, for example the default 49-frame plan plus a broad upper-body arm/reach/twist review.
Add `--candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md` to write a Markdown checklist for the ranked broad evidence candidates and fallback capture protocol. That checklist is decision support only: broad `upper-body-standing` remains internal/demo-only until recorded proof rows are no longer product-scoped and the audit passes.
Add `--capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md` after deciding existing candidates are not enough. The guide writes the explicit broad capture protocol plus the post-capture analyzer, focused Game visual plan/capture/review, and merged readiness-audit commands. Use `--capture-label <label>` to customize the scratch output names, and pass `--recording-id <id>` after the recording exists to write executable commands instead of `<new-recording-id>` placeholders.

Analyze recent stored sessions:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --out tmp/movement-replay-lab/latest-current-analysis.json
```

The direct analyzer now auto-creates or reuses a Convex export when saved recordings are stored in file storage. It also writes a recorded proof manifest next to `--out`, using the suffix `.proof-manifest.json`. The manifest is a row-by-row proof checklist for standing, side bend, head direction, standing arm raise, standing twist, standing reach, shoulder/scapula control, squat, far squat, left/right leg raise, weak feet, lower-body out of frame, root turn, root travel, mirror side ownership, and scoring/message events. Rows are marked as `passed`, `failed`, `missing-proof`, `source-data-limitation`, `manual-review`, `covered-by-other-recording`, or `product-scope-limitation`; each row also includes `automatedStatus` so analyzer/Game proof can pass while a missing recorded visual capture remains an overall blocker. The analyzer reports Replay/Game wrapper parity plus score-message parity; score-message parity recomputes each replay motion frame through the same Game scoring helper used by `useMovementMatchScoring`, and any event/message/score mismatch becomes a replay analysis error. It also emits deterministic Game Studio visual-proof capture targets under `gamePath.visualProofFrames` and prints a `game visual proof targets` summary; these targets identify baseline, source/display divergence, scoring, tracking-help, lower-body, and root-motion frames for the current Game Studio visual capture pass. Add `--include-standing-upper-body-targets` only for focused supplemental broad upper-body analysis; the default analyzer path keeps the stable reviewed target set unchanged. Add `--include-broad-upper-body-product-scope-proof` only for an explicit broad capture validation pass; the default manifest still keeps broad upper-body rows as product-scope limitations. `covered-by-other-recording` means the row is not a fresh recording task because another recording already passed that proof case; it is not counted as a pass. `product-scope-limitation` means the proof case remains internal/demo-only for the current user-facing recorded gate; it is accepted and non-blocking, but not counted as a pass. Rows include observed, candidate, and required amplitude fields where relevant, and blocking rows include `proofBlockerCode`; missing analyzer-proof rows also include best-candidate-vs-required wording plus candidate rejection codes/reasons in `statusReason` and `nextAction`. The manifest summary stores blocker counts by status, proof blocker code, proof case, missing proof layer, and candidate rejection code. When `--strict-manifest` blocks, the analyzer prints the same counts before exiting nonzero.

To turn the analyzer's Game Studio visual-proof targets into a machine-readable capture plan, run:

```bash
npx -p node@22.13.0 npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/latest-current-analysis.json --out tmp/movement-replay-lab/latest-game-visual-proof-plan.json
```

The plan lists selected sessions, target frame indexes, proof cases, movement route hints, and the explicit `game-studio-recorded-frame-injection-needed` capture mode. It is a target list for the next focused Game Studio capture harness, not visual proof by itself.
If the plan reports zero sessions from an older analysis file, rerun `movement:replay:analyze` first so the JSON includes `gamePath.visualProofFrames`.
Use repeated `--proof-case <case>` values for focused supplemental plans, such as a broad upper-body pass that keeps only frames containing `strongest-standing-arm-raise`, `strongest-standing-reach`, or `strongest-standing-twist`.

To capture those selected frames through Game Studio, run the app with local test auth enabled and then run the focused capture helper:

```bash
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npx -p node@22.13.0 npm run dev -- -p 3100
npx -p node@22.13.0 npm run movement:game-visual-capture -- --base-url http://localhost:3100 --plan tmp/movement-replay-lab/latest-game-visual-proof-plan.json --out tmp/movement-replay-lab/captures/latest-game-visual-proof --local-test-auth --secret sonae-local-test-auth
```

The capture helper uses the debug-only route shape `?debugTracking=1&guidedPreview=1&debugGameFrame=<frameIndex>` so each screenshot renders the exact stored frame selected by the analyzer. Its manifest records page screenshots, canvas screenshots, canvas pixel metrics, the captured debug frame index, capture errors, and nonblank failures. The helper fails a row when the debug scrubber's captured frame does not match the requested `debugGameFrame`. A clean capture manifest is still a screenshot-production proof; semantic Replay/Game review remains a separate decision step.

After capture, generate the semantic review checklist and JSON decision template:

```bash
npx -p node@22.13.0 npm run movement:game-visual-review -- --manifest tmp/movement-replay-lab/captures/latest-game-visual-proof/game-visual-proof-captures-manifest.json --out tmp/movement-replay-lab/latest-game-visual-proof-review.md --decisions-out tmp/movement-replay-lab/latest-game-visual-proof-review-decisions.template.json
```

Fill the decision template with `readable-pass`, `readable-fail`, `needs-stronger-automated-assertion`, or `needs-recapture`. Leave rows as `TODO` until reviewed.

Use `--strict-manifest` when this should be a hard gate. Unlike `--strict`, which only fails for error-level replay analysis failures, `--strict-manifest` exits non-zero when any proof row is still `failed`, `missing-proof`, `manual-review`, or unresolved `source-data-limitation`; `covered-by-other-recording` and accepted `product-scope-limitation` rows are non-blocking:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --out tmp/movement-replay-lab/latest-current-analysis.json --strict-manifest
```

After running Replay Lab visual captures, pass the capture manifest file or directory back into the analyzer to attach visual evidence to matching proof rows:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --out tmp/movement-replay-lab/latest-current-analysis.json --visual-captures tmp/movement-replay-lab/captures
```

To capture the rows that already have automated analyzer/Game proof but are still missing recorded visual evidence, pass both the analysis and proof manifest to the proof-set helper:

```bash
npx -p node@22.13.0 npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/latest-current-analysis.json --manifest tmp/movement-replay-lab/latest-current-analysis.proof-manifest.json --out tmp/movement-replay-lab/captures/latest-current-proof-set
```

Add `--dry-run` to print the selected sessions and frames without launching Playwright.

Verified on 2026-07-05: the manifest-driven proof-set captured 9 saved-recording sessions through local-test auth, and a follow-up analyzer run with `--visual-captures` attached 94 Replay Lab screenshots to 74 proof rows.

After visual captures are attached, generate a Markdown review checklist for the remaining manual-review rows:

```bash
npx -p node@22.13.0 npm run movement:replay:review -- --manifest tmp/movement-replay-lab/latest-current-analysis.proof-manifest.json --captures tmp/movement-replay-lab/captures/latest-current-proof-set --out tmp/movement-replay-lab/latest-current-visual-review.md --decisions-out tmp/movement-replay-lab/latest-current-review-decisions.template.json
```

Add `--source-limitation-decisions-out <file>` to also write a source-limitation decision template for `source-data-limitation` rows. Add `--passed-visual-audit-decisions-out <file>` to write a decision template for captured rows that already passed the analyzer but still need client-visible readability sign-off; feed the filled file back with `--passed-visual-audit-decisions <file>` so the generated Markdown only keeps unresolved passed-audit rows.
Add `--recording-plan-out <file>` to write a machine-readable action plan for rows that visual review cannot close, such as missing analyzer proof, below-threshold candidate motion, mirror-side evidence that is not isolated, or unresolved source-data limitations. The plan includes `owner`, `priority`, proof-case-specific `protocol` fields, compact `captureScenarios`, per-scenario `validationCommand`, `validationArgs`, `validationOutputPath`, and structured `validation` fields, summary rollups, grouped action buckets, and `summary.topActionGroups` so recording work, engineering proof-definition work, product source-limitation decisions, and automated scenario validation can be split cleanly. The protocol spells out setup, movement, and acceptance criteria for cases such as isolated left/right leg raises, root travel, root turns, side bends, mirror-side ownership, and far-camera squats. Capture scenarios collapse compatible proof cases, for example left-leg, right-leg, and mirror-side ownership rows become one front-leg-isolation shot list. Add `--recording-guide-out <file>` to write the same shot list as a concise standalone Markdown guide for the recording owner. Add `--summary-out <file>` to write a compact machine-readable handoff summary with manifest counts, decision progress, manual-review/source-limitation queues, strict-readiness booleans, and recording-gap rollups. The review command also prints the same recording-gap summary and top action buckets that appear at the top of the Markdown checklist.

The checklist includes proof-row metadata, proof blocker code rollups, observed/candidate/required amplitudes, candidate rejection codes/reasons, TODO result slots, avatar/source screenshots, and capture diagnostics. It also includes a manual-review queue summary, a passed visual-audit queue for captured `passed` rows that do not yet have an accepted passed-audit decision, a proof-gap triage table, and a recording-gap action plan for `missing-proof` and unresolved `source-data-limitation` rows, because those blockers cannot be accepted by visual review alone. `covered-by-other-recording` rows stay visible in the manifest but should not appear as recording-gap actions. Recording-gap rows show owner, priority, triage disposition, recommended action, proof context, and capture protocol beside each row, and the grouped action table collapses repeated rows by owner, priority, triage, blocker, proof case, and protocol. Fill the JSON decisions template with one of `readable-pass`, `readable-fail`, `source-data-limitation`, or `needs-stronger-automated-assertion`; unedited `TODO` rows are ignored by the analyzer. The decisions template includes a machine-readable `summary` plus a `reviewContext` object for each row with status, blocker, amplitude, missing-layer, visual-frame, and next-action metadata. `--strict-decisions` requires that context, compares it with the current manifest, and fails missing-context, stale, or unknown-row decision files before they are passed to the analyzer; strict failure messages include the same valid/TODO/missing/invalid/context/unknown counts shown in the checklist. Analyzer ingestion also requires matching context, so legacy or stale decisions are ignored even when the preflight command is skipped.

Source limitations use a separate template because accepting them is a product decision, not a visual-readability pass. The generated source-limitation template also includes a machine-readable `summary` for the unresolved product-decision queue, and the checklist/CLI prints the same source-limitation queue summary. Fill each unresolved source-limitation row with `accepted-product-limitation` or `needs-better-recording`, then validate it before feeding it back to the analyzer:

```bash
npx -p node@22.13.0 npm run movement:replay:review -- --manifest tmp/movement-replay-lab/latest-current-analysis.proof-manifest.json --captures tmp/movement-replay-lab/captures/latest-current-proof-set --source-limitation-decisions tmp/movement-replay-lab/latest-current-source-limitations.json --strict-source-limitations
```

Before feeding decisions back into the analyzer, validate that every review row has a non-TODO decision:

```bash
npx -p node@22.13.0 npm run movement:replay:review -- --manifest tmp/movement-replay-lab/latest-current-analysis.proof-manifest.json --captures tmp/movement-replay-lab/captures/latest-current-proof-set --decisions tmp/movement-replay-lab/latest-current-review-decisions.json --strict-decisions
```

Then pass the filled decisions file back to the analyzer so accepted manual-review rows become durable manifest status changes:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --out tmp/movement-replay-lab/latest-current-analysis-reviewed.json --visual-captures tmp/movement-replay-lab/captures/latest-current-proof-set --review-decisions tmp/movement-replay-lab/latest-current-review-decisions.json
```

Add `--source-limitation-decisions tmp/movement-replay-lab/latest-current-source-limitations.json` when explicit product limitations have been accepted. Accepted source limitations remain counted as `source-data-limitation`, but they no longer count as unresolved strict-manifest blockers or appear in new source-limitation templates. Analyzer ingestion applies these decisions only when their embedded `reviewContext` matches the current manifest row, and the CLI reports loaded/applied/ignored decision counts so stale files are visible. If a manual-review decision first converts a visual row into `source-data-limitation`, regenerate the source-limitation template from that reviewed manifest before accepting it as a product limitation.

The iteration wrapper can also forward both artifacts so its Markdown report and strict manifest gate use the reviewed proof manifest. Iteration Markdown includes manual-review and source-limitation queue summaries, plus both a general blocking-proof table and a separate recording-gap action table for `missing-proof` / unresolved `source-data-limitation` rows that visual review cannot close. Each iteration also writes sibling `<run>.recording-guide.md`, `<run>.recording-plan.json`, and `<run>.summary.json` artifacts with the same unresolved recording/product-decision queue, including capture scenarios, owner/priority rollups, grouped action buckets, per-scenario reviewed-state validation commands, analysis counts, proof counts, proof trend, and input paths. It updates `latest-analysis-path.txt`, `latest-report-path.txt`, `latest-recording-guide-path.txt`, `latest-recording-plan-path.txt`, and `latest-summary-path.txt` in the run directory so the current analysis, Markdown report, recording guide, recording plan, and compact handoff summary are easy to locate. Its terminal output repeats the manual-review queue, source-limitation queue, recording-gap summary, and top action buckets after writing the run files:

```bash
npx -p node@22.13.0 npm run movement:replay:iteration -- --label reviewed --visual-captures tmp/movement-replay-lab/captures/latest-current-proof-set --review-decisions tmp/movement-replay-lab/latest-current-review-decisions.json --source-limitation-decisions tmp/movement-replay-lab/latest-current-source-limitations.json --strict-manifest
```

When a previous analysis is available, `movement:replay:compare` and the iteration Markdown comparison section also include proof-manifest deltas for total blockers, manual-review/missing/source-limited rows, visual-capture rows, accepted limitations, and blocker-code counts. The comparison output labels the proof trend as `improved`, `unchanged`, `regressed`, or `missing` and lists improvement reasons, so a run can show clearer blocker-code diagnostics without hiding whether the overall proof gate moved forward. Add `--strict-proof-regression` to `movement:replay:compare` or `movement:replay:iteration` when the run should fail if proof blockers increase, passed rows decrease, accepted limitations decrease, visual-capture coverage drops, or the sibling proof manifests needed for comparison are missing.

To force a fresh storage export:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --create-export --out tmp/movement-replay-lab/latest-current-analysis.json
```

To analyze an exact saved-recording proof set from a Convex export instead of relying on the most recent rows, pass the export and the generated recording-plan JSON. The plan exposes the current blocker ids at `summary.recordingIds`; this is the preferred shape for replaying the current missing-proof recording queue:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-plan tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json --out tmp/movement-replay-lab/latest-current-analysis.json
```

To rerun just one fresh-recording scenario from the plan, add `--recording-scenario <id-or-label>`. The matcher accepts the scenario id, the fresh recording label, the title, or a proof case, so both `root-travel` and `movement-proof-root-travel` work. The current reviewed plan has one label:

- `movement-proof-root-travel`

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-plan tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json --recording-scenario movement-proof-root-travel --out tmp/movement-replay-lab/latest-root-travel-analysis.json
```

When reviewing against the current proof gate, include the reviewed visual captures, visual decisions, and accepted source limitations so the focused scenario manifest matches the real reviewed state instead of reopening already-reviewed rows:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-plan tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json --recording-scenario movement-proof-root-travel --visual-captures tmp/movement-replay-lab/captures/current-proof-set --review-decisions tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json --source-limitation-decisions tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json --out tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json
```

The shorter validation runner reads the selected scenario's structured `validation` object from the plan, resolves `tmp/movement-replay-lab/runs/latest-export-path.txt`, runs the same reviewed-state analyzer command, and prints the resulting proof-manifest counts. Add `--quiet` for the compact summary-only path, or `--dry-run` when you only want to inspect the exact command:

```bash
npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet
```

To validate every capture scenario in the reviewed plan without the long per-session analyzer dump:

```bash
npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --summary-out tmp/movement-replay-lab/current-scenario-validation-summary.json --summary-markdown-out tmp/movement-replay-lab/current-scenario-validation-summary.md
```

The all-scenario validation summaries include the controlling reviewed manifest first for unique blocker counts, then row-occurrence totals because capture scenarios overlap.

After running one or more scenario smokes, summarize their proof manifests with:

```bash
npx -p node@22.13.0 npm run movement:replay:scenario-summary -- --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --manifest tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.proof-manifest.json --out tmp/movement-replay-lab/current-scenario-reviewed-smoke-summary.json --markdown-out tmp/movement-replay-lab/current-scenario-reviewed-smoke-summary.md
```

Scenario rows can overlap, so the summary's scenario totals are row-occurrences. The optional controlling manifest section prints the unique blocker count at the top.

The iteration wrapper forwards the same id and scenario filters:

```bash
npx -p node@22.13.0 npm run movement:replay:iteration -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-plan tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json --recording-scenario movement-proof-root-travel --label root-travel
```

To disable automatic export creation/reuse and fail fast when a storage-backed recording is encountered:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --no-auto-export
```

Analyze old observability snapshots when needed:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --source debug-sessions --limit 5
```

Compare two analysis files:

```bash
npm run movement:replay:compare -- --before tmp/movement-replay-lab/before.json --after tmp/movement-replay-lab/after.json
```

Capture replay proof images from the visual replay page:

```bash
npx -p node@22.13.0 npm run movement:replay:capture -- --frames auto
```

If the capture script redirects to `/login`, either pass an authenticated Playwright storage state with `--storage-state`, or run the app with local test auth enabled and pass `--local-test-auth`.

## Browser Viewer

Open the app and go to:

```text
/demos/movements/replay-lab
```

The viewer includes:

- saved movement recording picker
- source skeleton canvas
- frame scrubber and timeline
- avatar replay scene
- current frame diagnostics
- analyzer flags
- in-page `Scene PNG` and `Source Strip` capture buttons

## Current Pass Criteria

Before asking for another user recording, the latest saved-recording iteration should show:

- zero error-level replay failures
- strong full-body sessions using `player-retarget` for lower body
- no lower-body owner flicker in strong sessions
- no false knee-raise override when squat/stand evidence is strong
- no neutral feet when confident foot/leg vectors are available
- source-data warnings kept separate from avatar-code failures

The latest verified run on 2026-07-03 analyzed five stored sessions with `0 failed`, `0 errors`, and `6` source-data warnings from the short out-of-frame recording.

The direct analyzer auto-export path was verified on 2026-07-05 with:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 1 --out tmp/movement-replay-lab/limit1-analysis.json
```

That run created a Convex storage export automatically, analyzed one saved recording, wrote `limit1-analysis.json` plus `limit1-analysis.proof-manifest.json`, and reported `0` errors with `6` warnings. Treat that as export-path proof, not as full movement proof; the full saved-recording proof set still needs to run cleanly and the visual-capture layer still needs to be attached before manual-review rows can become overall passes.
