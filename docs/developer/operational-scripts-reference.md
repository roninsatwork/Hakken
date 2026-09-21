# Operational Scripts Reference

Last reviewed: 2026-07-30 17:39 BST +0100
Status: current package-script inventory
Audience: engineers, agents, and operators choosing the right local command or documenting a recurring operation.

## Purpose

This reference groups `package.json` scripts by job. It does not replace
operator runbooks. If a script becomes a recurring human process, create an
operator runbook and link it from `docs/operator/index.md`.

Before pushing, follow the verification gates in `AGENTS.md`. Do not push just
because a script passes locally.

## Development And Verification

| Script | Purpose |
| --- | --- |
| `npm run help` | Lists platform scripts. |
| `npm run product:recipe -- <recipe>` | Previews a complete starter recipe; `--list` shows the catalog and `--apply` writes it locally. See [Product Recipes](./product-recipes.md). |
| `npm run framework:update -- --upstream <export>` | Compares a pristine matching export; optional review-plan and baseline-recording steps are explicit. See [Framework Updates](../operator/framework-updates.md). |
| `npm run feature:generate -- <entity>` | Previews a complete tenant feature; `--apply` writes it locally. See [Feature Generator](./feature-generator.md). |
| `npm run dev` | Runs the Next.js dev server after `verify:env`. |
| `npm run convex:dev` | Runs Convex dev after `verify:env`. |
| `npm run build` | Builds the Next.js app after `verify:env`. |
| `npm run start` | Starts the built Next.js app. |
| `npm run verify:env` | Checks Node and installed direct dependency versions against the lockfile. |
| `npm run lint` | Runs ESLint. |
| `npm run lint:all` | Runs the current full lint target. |
| `npm run typecheck` | Runs TypeScript with `--noEmit`. |
| `npm run test` | Runs Vitest in watch/default mode after `verify:env`. |
| `npm run test:run` | Runs the Vitest suite once after `verify:env`. |
| `npm run test:coverage` | Runs coverage after `verify:env`. |
| `npm run coverage:check` | Checks coverage thresholds. |
| `npm run check:pagination` | Runs the pagination drift guard. |
| `npm run check:encoding` | Runs the source/document encoding guard. |
| `npm run check:layering` | Runs the app layering/import-boundary guard. |
| `npm run check:guards` | Runs the project guard checks as a grouped command. |
| `npm run check` | Runs environment verification, lint, typecheck, and Vitest. |
| `npm run gate` | Runs lint, typecheck, unit tests, E2E, coverage, and coverage threshold check. |
| `npm run setup:validate` | Checks local files/environment against the providers and capabilities in `hakken.product.json`; no network calls. |
| `npm run verify:deployment` | Reads the selected Convex deployment's environment and checks required key names using the same product rules; `--prod` selects production. |

These npm lifecycle guards run automatically before their matching scripts:

| Script | Purpose |
| --- | --- |
| `npm run predev` | Runs `verify:env` before `npm run dev`. |
| `npm run preconvex:dev` | Runs `verify:env` before `npm run convex:dev`. |
| `npm run prebuild` | Runs `verify:env` before `npm run build`. |
| `npm run pretest` | Runs `verify:env` before `npm run test`. |
| `npm run pretest:run` | Runs `verify:env` before `npm run test:run`. |
| `npm run pretest:coverage` | Runs `verify:env` before `npm run test:coverage`. |
| `npm run pretest:e2e` | Runs `verify:env` before `npm run test:e2e`. |
| `npm run pretest:e2e:real-auth` | Runs `verify:env` before `npm run test:e2e:real-auth`. |
| `npm run preeval:movement-avatar` | Runs `verify:env` before `npm run eval:movement-avatar`. |

## Browser And Auth Testing

| Script | Purpose |
| --- | --- |
| `npm run test:e2e` | Runs Playwright tests. |
| `npm run test:e2e:movement` | Runs the on-demand movement Playwright config. |
| `npm run eval:movement-avatar` | Runs the movement avatar proof evaluation. |
| `npm run test:e2e:real-auth` | Runs Playwright tests against real auth config. |
| `npm run auth:local:seed` | Seeds deterministic local auth state. |
| `npm run auth:local:state` | Prints deterministic local auth state. |

Use [Local Test Auth Runbook](../operator/local-test-auth-runbook.md) for the
human workflow around deterministic local auth.

## Demo, Seed, And Template Scripts

| Script | Purpose |
| --- | --- |
| `npm run demo:local:seed` | Seeds local demo data. |
| `npm run product:init -- --config <file>` | Previews product defaults; `--apply` explicitly updates a clone. See [Product Setup](../operator/product-setup.md). |
| `npm run template:build -- --out <directory>` | Writes a framework + Arcade copy; optional areas are opt-in. |
| `npm run template:verify` | Installs and verifies temporary template copies. |

Use [Local Demo Seed Runbook](../operator/local-demo-seed-runbook.md)
and [Vertical App Packaging Checklist](../operator/vertical-app-packaging-checklist.md)
when these scripts are part of a handoff or packaging process.

## Movement Script Families

The movement demo is frozen unless explicitly reopened or a gate is broken.
Movement scripts are numerous and intentionally specialized. They are grouped
here by purpose rather than repeated as one long command list.

| Family | Examples | Purpose |
| --- | --- | --- |
| Replay analysis and comparison | `movement:replay:analyze`, `movement:replay:compare`, `movement:replay:three-party:analyze` | Analyze and compare recorded movement sessions. |
| Replay capture and proof | `movement:replay:capture`, `movement:replay:proof-set`, `movement:replay:nine-proof`, `movement:replay:fast-subset-proof`, `movement:replay:targeted-proof` | Capture and validate replay proof sets. |
| Replay/Game comparison | `movement:replay-game:compare`, `movement:replay-game:packet-proof`, `movement:replay-game:deep-targeted-proof`, `movement:replay-game:deep-all-nine-proof` | Compare Replay Studio and mounted Game Studio behavior. |
| Game visual proof | `movement:game-visual-plan`, `movement:game-visual-capture`, `movement:game-visual-review`, `movement:game:packet-proof`, `movement:game:nine-proof` | Plan, capture, and review Game visual proof. |
| Support-readiness audits | `movement:facing-occlusion-support-audit`, `movement:root-travel-support-audit`, `movement:sitting-support-audit`, `movement:walking-support-audit`, strict variants | Check readiness for specific movement families or support categories. |
| Deep capture and dense capture | `movement:replay-game:deep-local-proof`, `movement:dense-capture:benchmark`, `movement:dense-capture:device-review` | Validate deep capture and dense capture behavior. |
| Architecture and plan gates | `movement:architecture-guard`, `movement:roadmap-progress-report`, `movement:outstanding-tasks-audit`, strict variants | Keep movement plan/status/proof claims aligned. |
| Scenario validation | `movement:proof:validate:facing-occlusion`, `movement:proof:validate:root-travel`, `movement:proof:validate:seated-forward-fold` | Validate named movement proof scenarios. |

Before using these scripts, read:

- [Movement Definitive Plan](../plans/active/movement-definitive-plan.md)
- [Movement Mirror And Side-Ownership Contract](./movement-mirror-and-side-ownership-contract.md)
- [Movement Tracking Developer Notes](./movement-tracking.md)

## Adding Or Changing Scripts

When adding a script:

1. Choose a stable name with an obvious family prefix.
2. Keep the script command portable across machines.
3. Document required services or environment variables.
4. Add or update the relevant developer guide or operator runbook.
5. If the script is part of a verification gate, make its failure actionable.
6. If the script writes proof artifacts, keep generated output out of commits
   unless the repo explicitly tracks that artifact.

## Verification

Documentation-only changes to script docs should run:

```bash
git diff --check
```

Script behavior changes should run the focused script and the relevant gate from
`AGENTS.md`. For high-cost, live-data, or external-service scripts, get explicit
approval before running them.
