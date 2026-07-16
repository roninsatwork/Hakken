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

Run the tiered rendered Replay proof loop for mirror/adherence repairs:

```bash
npx -p node@22.13.0 npm run movement:replay:targeted-proof -- --recording-ids px71h2bsqg9xv8pxyffv5xgaed89wbx3 --export tmp/movement-replay-lab/runs/<export>.zip
npx -p node@22.13.0 npm run movement:replay:fast-subset-proof -- --export tmp/movement-replay-lab/runs/<export>.zip
npx -p node@22.13.0 npm run movement:replay:nine-proof -- --export tmp/movement-replay-lab/runs/<export>.zip
```

Use `targeted-proof` while repairing a known failure, such as `Spins` around frames 645-647. Use `fast-subset-proof` before calling a fix ready for broader proof; it runs `Full Spinal Flow`, `Spins`, and `Full Motion Exercises`. Use `nine-proof` only for final certification before claiming global shared-avatar acceptance. Every tier requires intended-time Game-player processing, deterministic Game-player final rendering, and deterministic paired Game instructor/player rendering through the named runtime contract. Subset runs write repair-labeled manifests so they cannot be mistaken for all-nine acceptance.

Run the fast architecture/proof drift guard before and after movement architecture work:

```bash
npx -p node@22.13.0 npm run movement:architecture-guard
```

This checks the watched movement hotspots from the architecture plan, `MovementSourceFrame` source-truth purity, debug/preview route-bypass purity in core movement libs/hooks, coverage product-truth claims, the coverage-registry support-claim audit command, the all-family support readiness matrix, the architecture plan current-board status, the roadmap progress report, the outstanding-task/doc-hygiene audit, the current Game visual semantic decisions, Game visual analysis-to-capture consistency, Game visual review-to-capture consistency, Replay/Game score-message parity, Game visual proof-frame count, reviewed proof-manifest honesty, and the broad upper-body capture-contract proof scope. It is not a replacement for the full merge gate, but it is the cheapest way to catch `VrmAvatar`, pipeline facade, lower-body adapter, source/display contract, debug-route leakage, coverage-claim drift, stale plan percentages, stale historical plan wording, stale Game visual captures or review decisions, hidden limitation-to-pass drift, support-matrix drift, or proof-artifact drift without running video captures.

Run the all-family support readiness matrix when updating roadmap percentages, product copy, or support claims:

```bash
npx -p node@22.13.0 npm run movement:support-readiness-matrix -- --no-write
```

This reads the reviewed analysis, reviewed manifest, Game captures/review, focused seated artifacts, and the supplemental broad upper-body Game proof when present. It prints all 19 movement families with category, readiness, blockers, and next action, and separately reports production family support as `5/19 (26%)` for the current artifacts. It also reports `futureFamilyShapeFailures`; this must stay empty so all 10 source-backed future-family shapes remain surfaced as internal-preview blocked matrix rows. Use `movement:support-readiness-matrix:strict` when automation should fail if any current user-facing family loses its support proof or if future-family shape rows drift out of the matrix.

Run the future-family support-audit shape check when editing generic internal preview family promotion requirements:

```bash
npx -p node@22.13.0 npm run movement:future-family-support-audit-shapes -- --strict
```

This validates the first-pass recorded proof cases, Game visual cases, acceptable support copy, and fallback/non-promotion rule for the 10 internal preview families that do not yet have dedicated support-audit scripts. It is not a promotion gate by itself; the support-readiness matrix uses these shapes to keep those rows concrete while still blocked until real recorded proof, Game proof, semantic review, strict aliases, and architecture-guard readiness signals exist. If a future-family shape row disappears from the matrix, stops being internal-preview, or loses its blocker details, `movement:support-readiness-matrix:strict` reports future-family shape drift.

Run the architecture plan status audit when updating roadmap percentages or support counts:

```bash
npx -p node@22.13.0 npm run movement:architecture-plan-status-audit -- --strict
```

This compares the plan's Current Standing Board with the computed support readiness matrix and blocks stale current-board claims such as `4/19`, `15/19`, or `21%` production support after a promotion. It also requires the current board to keep `futureFamilyShapeFailures: []` visible and fails if the support matrix reports future-family shape drift. The architecture guard also runs this audit, so documentation drift now fails the cheap movement guard.

Run the roadmap progress report when explaining section progress versus overall progress:

```bash
npx -p node@22.13.0 npm run movement:roadmap-progress-report -- --strict
```

This parses the plan's 15 section-progress rows, compares the current overall estimate with the computed section average, and prints the support-matrix product truth beside it, including `futureFamilyShapeFailures`. By default it also writes ignored handoff artifacts to `tmp/movement-replay-lab/current-roadmap-progress-report.json` and `tmp/movement-replay-lab/current-roadmap-progress-report.md`; add `-- --no-write` for a read-only check. It is the quick answer for why the overall human-movement estimate can be lower than the section average while production support is still only `5/19 (26%)`, and it blocks strict progress reports when future-family shape rows drift. The architecture guard also runs this report.

Run the outstanding-task audit when editing the plan's task board or recommended next slice:

```bash
npx -p node@22.13.0 npm run movement:outstanding-tasks-audit -- --strict
```

This keeps the Always-Open Outstanding Tasks section from going empty or stale, checks that the Recommended Next Slice keeps `root-turn` in the current user-facing list while still scoping it to standing root orientation only, requires the Proof Artifact Policy, Current Handoff Inventory, Recent focused verification, and Historical Log Boundary, and keeps the 10 future-family audit shapes visible. It also blocks stale historical proof-count/current-label wording so older dated logs do not read like product truth. The architecture guard also runs this audit.

Run the pre-commit handoff audit before staging or committing the current movement slice:

```bash
npx -p node@22.13.0 npm run movement:precommit-handoff-audit
```

This checks the Current Handoff Inventory against Git source-control state. It blocks when tracked docs/package/guard files reference support-audit source candidates that are still untracked, when source/test candidates are accidentally ignored, or when a staged dependency set splits aliases/imports from the source files they need. Use `movement:precommit-handoff-audit:strict` for the commit gate; it is expected to pass when the seven current support-audit/test source candidates are tracked and staged with the dependent movement script/docs changes.

Run the current workplan finish gate before handing movement proof work back:

```bash
npx -p node@22.13.0 npm run movement:today-finish-gate
```

This runs the architecture guard, support-readiness matrix, roadmap progress report, architecture-plan status audit, outstanding-task audit, and queue-only next-proof capture preflight. It is expected to pass while the next proof families remain promotion-blocked, as long as the two active capture lanes, the facing/occlusion product-truth decision handoff, and policy docs are current.
The finish gate also runs the future-family support-audit shape check so generic internal preview rows cannot drift back into vague prose.

Run the coverage-registry claim audit when editing movement family support copy:

```bash
npx -p node@22.13.0 npm run movement:coverage-registry-claim-audit
```

This checks the registry tests that keep user-facing families at full proof, internal/demo-only families below full proof with explicit blocker/internal wording, `root-turn` scoped away from root travel and walking, and `upper-body-standing` scoped away from full-body support. The architecture guard tracks this command through the Phase 14 script-contract guard.

Run the focused squat/knee-lift support-claim audit when changing coverage claims or lower-body proof logic:

```bash
npx -p node@22.13.0 npm run movement:squat-knee-lift-support-audit -- --strict
```

This requires one reviewed recording bundle to cover neutral standing, clear squat, left-only knee lift, right-only knee lift, mirror-side readability, and child-readable Game view before `squat-knee-lift` remains user-facing full support. The architecture guard also checks this audit while the family is user-facing.

Run the focused root-turn support-claim audit when changing coverage claims, root-orientation logic, or Game visual proof decisions:

```bash
npx -p node@22.13.0 npm run movement:root-turn-support-audit -- --strict
```

This requires one reviewed recording bundle to cover a passed `root-turn` proof row and readable `strongest-root-turn` Game proof before narrow standing root-turn remains user-facing support. It does not promote root travel, walking, or turning while traveling. The architecture guard also checks this audit while `root-turn` is user-facing.

Run the seated support-readiness audit before changing `sitting` support claims:

```bash
npx -p node@22.13.0 npm run movement:sitting-support-audit
```

This consumes the opt-in seated validation manifest from `movement:replay:analyze -- --include-seated-targets --include-seated-product-scope-proof`, the focused seated Game visual plan, and any filled seated semantic review decisions. It is expected to report `blocked` until one recording bundle has passed rows for `seated-neutral`, `seated-twist`, `seated-forward-fold`, `seated-leg-lift`, and `chair-contact`, plus readable Game targets for chair/contact, twist, forward fold, and leg lift. Use `--strict` only when intentionally trying to promote `sitting`. The report splits next recording targets from Replay visual review targets and prints missing analyzer proof reasons, so current partial chair/contact, twist, and leg-lift evidence does not get confused with the remaining below-threshold seated-forward-fold blocker. The generated `movement:expansion-preview-handoff:sitting` command chain uses the matching validation manifest path and includes Replay proof-set capture, Replay review, reviewed analysis, Game capture/review, and the final strict sitting audit.

To bind the seated handoff to the current best partial Game visual evidence candidate:

```bash
npx -p node@22.13.0 npm run movement:expansion-preview-handoff:sitting:best-partial
```

This is useful for reviewing partial chair/contact plus twist evidence without treating `sitting` as promotable. Run the plain `movement:expansion-preview-handoff:sitting` command after a new seated recording exists.

Run the upper-body readiness audit before changing `upper-body-standing` support claims:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit
```

This should pass for the current scoped broad `upper-body-standing` claim while one reviewed bundle still proves arm/reach/twist/shoulder rows and the upper-body Game visual target/review cases remain readable. It also guards the narrow `standing-side-bend-head-direction` family while it remains user-facing. Use `--strict` when automation should fail if the scoped broad or narrow support evidence is lost.
By default the audit loads the stable current Game review and auto-adds the current supplemental broad upper-body Game plan/review when those files exist. Pass repeated `--game-visual-plan` and `--semantic-review` paths only when auditing a custom focused proof set.
Add `--candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md` to write a Markdown checklist for ranked broad evidence candidates, ranked broad passed-proof candidates, and fallback capture protocol. That checklist is decision support and regression context; current product truth still comes from the default audit, coverage registry, support-readiness matrix, and architecture guard.
Add `--capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md` after deciding existing candidates are not enough. The guide writes the explicit broad capture protocol plus the post-capture analyzer, focused Game visual plan/capture/review, and merged readiness-audit commands. Add `--capture-contract-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json` to write the same proof cases, paths, commands, broad passing recording ids, and broad passed-proof candidates as machine-readable JSON. After the contract's reviewed manifest and focused review files exist, run the final merged audit with `--capture-contract <file>` to load those contract paths directly and hard-fail if broad support is still blocked; contract mode is strict by default, validates the contract schema, proof-case scope, command chain, command artifact paths, focused Game visual plan proof cases, strict final audit, and focused semantic-review readable-pass decisions, then names any missing artifact, stale focused plan, or unreviewed focused Game case plus the next workflow action. Use `--capture-label <label>` to customize the scratch output names, and pass `--recording-id <id>` after the recording exists to write executable commands instead of `<new-recording-id>` placeholders.
Use the shortcut below to regenerate the current candidate review, capture guide, and JSON contract together:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-handoff
```

The generated capture guide includes the matching contract preflight command before the final contract-driven support audit command.

After the explicit broad recording is saved, bind that recording id into the generated command chain:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-handoff -- --recording-id <new-recording-id>
```

To bind the generated command chain to the current top product-scoped broad evidence candidate instead of copying the id from preflight output:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-handoff:top-candidate
```

Preflight the generated JSON contract before treating it as a final-audit handoff:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-preflight
```

The preflight reports contract-snapshot support status, broad passing recording ids, product-scoped broad evidence candidate ids, the top candidate handoff command, snapshot missing broad recorded/Game proof cases, shape issues, staged workflow progress, the next workflow command id and command when a recording-bound contract is partly complete, missing reviewed/focused artifacts, missing focused Game proof cases, and missing readable semantic decisions without running the final strict support audit. Add `-- --strict` when this should fail the shell until the contract is ready for the final audit; use the strict final audit as the recomputed support-readiness source of truth.
When the contract is still waiting for a recording id, the next workflow command is the recording-id handoff template.
Final-audit artifact checks stay in `waiting-for-recording-id` state until the contract is bound to a saved recording id, so pre-capture status output does not confuse missing post-capture files with the current blocker.
Generated capture guides use these shortcut commands for the default contract path, and fall back to explicit path-aware `movement:upper-body-standing-support-audit -- --capture-contract...` commands for custom contract files.
The analyzer and Replay Lab browser capture can both use the Convex export now: the generated broad capture workflow exports the selected recording into a Replay Lab session fixture with `movement:replay:export-session`, then passes that fixture to proof-set capture with `--debug-session-json`. If browser capture reports that no frames were available, rerun the contract preflight and confirm the `replay-session-export` stage is complete before rerunning proof-set.

Use the strict ready gate when automation should stop until preflight is ready:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-ready
```

After preflight reports `ready`, run the strict contract-driven final audit:

```bash
npx -p node@22.13.0 npm run movement:upper-body-standing-capture-final-audit
```

Analyze recent stored sessions:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --out tmp/movement-replay-lab/latest-current-analysis.json
```

The direct analyzer now auto-creates or reuses a Convex export when saved recordings are stored in file storage. It also writes a recorded proof manifest next to `--out`, using the suffix `.proof-manifest.json`. The manifest is a row-by-row proof checklist for standing, side bend, head direction, standing arm raise, standing twist, standing reach, shoulder/scapula control, squat, far squat, left/right leg raise, weak feet, lower-body out of frame, root turn, root travel, mirror side ownership, and scoring/message events. Rows are marked as `passed`, `failed`, `missing-proof`, `source-data-limitation`, `manual-review`, `covered-by-other-recording`, or `product-scope-limitation`; each row also includes `automatedStatus` so analyzer/Game proof can pass while a missing recorded visual capture remains an overall blocker. The analyzer reports Replay/Game wrapper parity plus score-message parity; score-message parity recomputes each replay motion frame through the same Game scoring helper used by `useMovementMatchScoring`, and any event/message/score mismatch becomes a replay analysis error. It also emits deterministic Game Studio visual-proof capture targets under `gamePath.visualProofFrames` and prints a `game visual proof targets` summary; these targets identify baseline, source/display divergence, scoring, tracking-help, lower-body, and root-motion frames for the current Game Studio visual capture pass. Add `--include-standing-upper-body-targets` only for focused supplemental broad upper-body analysis; the default analyzer path keeps the stable reviewed target set unchanged. Add `--include-broad-upper-body-product-scope-proof` only for an explicit broad capture validation pass; the default manifest still keeps broad upper-body rows as product-scope limitations. Add `--include-walking-product-scope-proof` only for a focused walking/root-travel promotion attempt; the default manifest still keeps root travel internal/demo-only. `covered-by-other-recording` means the row is not a fresh recording task because another recording already passed that proof case; it is not counted as a pass. `product-scope-limitation` means the proof case remains internal/demo-only for the current user-facing recorded gate; it is accepted and non-blocking, but not counted as a pass. Rows include observed, candidate, and required amplitude fields where relevant, and blocking rows include `proofBlockerCode`; missing analyzer-proof rows also include best-candidate-vs-required wording plus candidate rejection codes/reasons in `statusReason` and `nextAction`. The manifest summary stores blocker counts by status, proof blocker code, proof case, missing proof layer, and candidate rejection code. When `--strict-manifest` blocks, the analyzer prints the same counts before exiting nonzero.

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

For export-backed recordings that are not loaded into local Convex, first write a Replay Lab session fixture and pass it to proof-set capture:

```bash
npx -p node@22.13.0 npm run movement:replay:export-session -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-id <recording-id> --out tmp/movement-replay-lab/latest-replay-session.json
npx -p node@22.13.0 npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/latest-current-analysis.json --manifest tmp/movement-replay-lab/latest-current-analysis.proof-manifest.json --out tmp/movement-replay-lab/captures/latest-current-proof-set --debug-session-json tmp/movement-replay-lab/latest-replay-session.json
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

The shorter validation runner reads the selected scenario's structured `validation` object from the plan, resolves `tmp/movement-replay-lab/runs/latest-export-path.txt`, runs the same reviewed-state analyzer command, and prints the resulting proof-manifest counts. Add `--quiet` for the compact summary-only path, or `--dry-run` when you only want to inspect the exact command. If `--recording-plan` is omitted, the runner first checks the reviewed recording plan, then auto-discovers known facing/occlusion, root-travel/walking, and seated support recording plans by scenario label so support-audit quick commands such as `movement-proof-facing-occlusion-recovery`, `movement-proof-root-travel`, and `movement-proof-seated-forward-fold` work without memorizing the generated plan path:

```bash
npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet
```

To validate every capture scenario in the reviewed plan without the long per-session analyzer dump:

```bash
npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --summary-out tmp/movement-replay-lab/current-scenario-validation-summary.json --summary-markdown-out tmp/movement-replay-lab/current-scenario-validation-summary.md
```

The all-scenario validation summaries include the controlling reviewed manifest first for unique blocker counts, then row-occurrence totals because capture scenarios overlap.

## Proof Artifact Policy

Keep compact proof summaries in tracked documentation. Keep raw/generated proof artifacts under `tmp/movement-replay-lab/**` as ignored scratch by default.

Tracked docs may name commands, dates, proof counts, selected bundle ids, blocker counts, capture protocols, validation aliases, and accepted product/source limitations. Do not commit raw capture images, replay proof-set folders, generated reviewed-analysis JSON, generated Game visual plans, generated review templates, or generated recording plans by default. Promote a small reviewed artifact bundle only after an explicit product/engineering decision names the exact files and stale-context checks.

For the current expansion work queue, `movement:next-proof-readiness` runs the facing/occlusion, root-travel, seated, and walking support-readiness audits together, rewrites their support recording plans, and prints the concise next validation aliases and review/promotion candidates. The JSON and Markdown summaries also include the fresh recording label, proof cases, support recording-plan path, validation output path, and setup/movement/acceptance protocol for each next scenario. Use this as the quick handoff check before recording or validating the next root-travel or seated forward-fold proof, or before making the facing/occlusion product-truth decision:

```bash
npx -p node@22.13.0 npm run movement:next-proof-readiness
```

Use the strict shortcut when a promotion workflow should stop until facing/occlusion, root-travel, seated, and walking proof are ready:

```bash
npx -p node@22.13.0 npm run movement:next-proof-readiness:strict
```

Use the queue-only preflight shortcut immediately before a capture session. It succeeds while these families are still promotion-blocked, but fails if the expected two recording labels or required handoff fields drift:

```bash
npx -p node@22.13.0 npm run movement:next-proof-capture-queue
```

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

Add `--slider-seek-frames` to exercise the real range control in the provided order. The capture physically drags the slider, uses range-key correction only where track pixel resolution cannot address the exact frame, waits for the React commit and fresh final-VRM telemetry, and fails if any trustworthy head, spine, or arm result exceeds the shared `0.10` policy:

```bash
npm run movement:replay:capture -- --debug-session-json path/to/session.json --frames 281 --slider-seek-frames 281,1500,281,3025,281
```

If the capture script redirects to `/login`, either pass an authenticated Playwright storage state with `--storage-state`, run the normal app with local test auth enabled and pass `--local-test-auth`, or start the documented deterministic E2E-auth app and pass `--e2e-auth`. The explicit `--e2e-auth` path creates the role cookie in memory and does not trust a potentially stale storage-state file.

Build the canonical repair packet from the immutable source session and its complete final-VRM telemetry together:

```bash
npm run movement:diagnose -- --session path/to/session.json --rendered-telemetry path/to/player-avatar-deterministic.json --frame 281 --strict
```

The telemetry input must match the session/recording identity and source hash, contain every expected rendered frame with zero missing/playback errors, and expose final avatar visual telemetry for every frame. The command fails closed when any of those conditions is absent and preserves `--rendered-telemetry` in its reproduce and comparison commands.

Gate avatar-follow reliability after Replay visual captures are attached:

```bash
npx -p node@22.13.0 npm run movement:avatar-follow-gate -- --analysis tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json --manifest tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.proof-manifest.json
```

The gate blocks supported proof recordings when Replay visual capture frames are missing, visual match is below 85%, average avatar lower/upper direction error exceeds the analyzer thresholds, lower-body owner flicker exceeds the analyzer threshold, or hard root/seated cases pass without capture-backed visual proof.

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
