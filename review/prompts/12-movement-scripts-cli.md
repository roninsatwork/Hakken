# Move movement-debug scripts behind their own CLI

## Context

`scripts/movement-debug/` holds 143 files and drives ~120 of the repo's ~160 npm scripts — many hyper-specific one-shots (`movement:expansion-preview-handoff:sitting:best-partial`, `movement:today-finish-gate`, …) pointing at `tmp/movement-replay-lab/current-*.json` paths. The subsystem is maintained (tests, runbook README, recent commits) but the movement demo itself is declared frozen, and the scripts block makes `package.json` effectively unreadable for platform work — `npm run help` (`scripts/list-platform-scripts.mjs`) exists precisely because of this.

## Task

1. Read `scripts/list-platform-scripts.mjs` and the `scripts/movement-debug/` README to understand how scripts are categorized and which entry points the runbooks reference.
2. Build a single dispatcher CLI, e.g. `scripts/movement-debug/cli.mjs`, exposing every current `movement:*` command as a subcommand (`node scripts/movement-debug/cli.mjs replay:analyze …`), with a `--help`/list output generated from a command registry. Reuse the existing script files as modules — do not rewrite their logic.
3. Replace the ~120 `movement:*` entries in `package.json` with a single `"movement": "node scripts/movement-debug/cli.mjs"` entry (invoked as `npm run movement -- <subcommand>`). Keep any movement script referenced by CI or by non-movement `pre*` hooks as-is — check `.github/workflows/` first.
4. Update the movement-debug README and any `docs/operator/`/`docs/plans/` runbooks that spell out old `npm run movement:*` commands; grep the whole repo (including `scripts/` and docs) for `movement:` script references.
5. Update `scripts/list-platform-scripts.mjs` if it special-cases the movement prefix.

## Constraints

- Zero behavior change in the scripts themselves; this is packaging only. The demo is frozen — do not touch `src/app/(dashboard)/demos/**`.
- Every previously runnable command must remain runnable; produce a mapping table (old npm script → new subcommand) in your summary.
- No code comments; do not commit or push.

## Acceptance

- `package.json` scripts block shrinks to the platform scripts plus one `movement` entry; `npm run help` output is clean.
- `npm run movement -- --help` lists all subcommands; spot-check two previously-used commands run identically.
- `npm run check` passes and no workflow/doc references a removed script name.
