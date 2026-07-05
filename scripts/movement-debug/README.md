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

Analyze recent stored sessions:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --out tmp/movement-replay-lab/latest-current-analysis.json
```

The direct analyzer now auto-creates or reuses a Convex export when saved recordings are stored in file storage. It also writes a recorded proof manifest next to `--out`, using the suffix `.proof-manifest.json`. The manifest is a row-by-row proof checklist for standing, side bend, head direction, squat, far squat, left/right leg raise, weak feet, lower-body out of frame, root turn, root travel, mirror side ownership, and scoring/message events. Rows are marked as `passed`, `failed`, `missing-proof`, `source-data-limitation`, or `manual-review`; each row also includes `automatedStatus` so analyzer/Game proof can pass while a missing recorded visual capture remains an overall blocker. The manifest summary stores blocker counts by status, proof case, and missing proof layer. When `--strict-manifest` blocks, the analyzer prints the same counts before exiting nonzero.

Use `--strict-manifest` when this should be a hard gate. Unlike `--strict`, which only fails for error-level replay analysis failures, `--strict-manifest` exits non-zero when any proof row is still `failed`, `missing-proof`, `manual-review`, or `source-data-limitation`:

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

To force a fresh storage export:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --create-export --out tmp/movement-replay-lab/latest-current-analysis.json
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
