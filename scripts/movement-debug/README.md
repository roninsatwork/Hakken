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

Use this after each movement/retarget/avatar code change. The user should only need to make a new recording when the stored sessions no longer cover the failure being investigated.

## Useful Commands

Analyze recent stored sessions:

```bash
npx -p node@22.13.0 npm run movement:replay:analyze -- --limit 5 --out tmp/movement-replay-lab/latest-current-analysis.json
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
