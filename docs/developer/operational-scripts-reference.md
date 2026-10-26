---
product: Hakken
documentation_type: developer reference
feature_area: package commands and operational boundaries
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/operational-scripts-reference.md
last_reviewed: '2026-10-26T15:14:20+00:00'
reviewed_against: current implementation
status: Current
---
# Operational Scripts Reference

> **Product:** Hakken · **Document type:** developer reference · **Feature area:** package commands and operational boundaries
> **Reviewed:** 26 October 2026, 15:14:20 GMT (Europe/London)
> **Source path:** `docs/developer/operational-scripts-reference.md` · **Status:** Current


This reference lists the current Hakken package commands and explains how to choose between local checks, application work and operations that touch another system. The command map was compared with `package.json`; the local-auth and deployment-environment scripts were also read. Packaging, generator, product initialization, recipes and framework-update implementations have now been reviewed in their dedicated guides; deployment has its own current reference. No command in the table was executed during this documentation pass.

## Scope And Audience

Engineers and operators use this reference to locate a command, not as blanket permission to run it. Repository documentation maintenance is restricted to reading source and validating Markdown. Commands that seed users, open browsers, save authentication sessions, contact Convex, change a theme record, create a template or apply a recipe need their own authorized task. Even a familiar command can write generated output or use a configured remote endpoint.

The precise command body is included below because npm aliases can hide several steps. Lifecycle entries beginning with `pre` are automatically invoked by npm before their matching command. Read the current AGENTS.md for required verification before a separately authorized push or merge; this table does not abbreviate those gates or establish that they passed.

## Current Package Command Map

Each row is a package key and its actual configured command. Arguments after `--` are passed through according to npm and the target tool. A script name is not a guarantee of read-only behavior or local-only scope.

| Package command | Configured implementation |
| --- | --- |
| `npm run help` | `node scripts/list-platform-scripts.mjs` |
| `npm run dev` | `next dev` |
| `npm run predev` | `npm run verify:env` |
| `npm run build` | `next build` |
| `npm run prebuild` | `npm run verify:env` |
| `npm run start` | `next start` |
| `npm run lint` | `eslint` |
| `npm run lint:all` | `eslint` |
| `npm run convex:dev` | `convex dev` |
| `npm run preconvex:dev` | `npm run verify:env` |
| `npm run test` | `vitest` |
| `npm run pretest` | `npm run verify:env` |
| `npm run test:run` | `vitest run --reporter=default --reporter=json --outputFile.json=test-results/test-timings.json && node scripts/check-test-speed.mjs` |
| `npm run pretest:run` | `npm run verify:env` |
| `npm run test:coverage` | `vitest run --coverage` |
| `npm run pretest:coverage` | `npm run verify:env` |
| `npm run coverage:check` | `node scripts/check-coverage-thresholds.mjs` |
| `npm run check:pagination` | `node scripts/check-convex-pagination.mjs` |
| `npm run check:encoding` | `node scripts/check-text-source-encoding.mjs` |
| `npm run check:layering` | `node scripts/check-layering.mjs` |
| `npm run check:screen-kit` | `node scripts/check-screen-kit.mjs` |
| `npm run check:orphans` | `knip --include files,dependencies,unlisted --no-config-hints` |
| `npm run check:fences` | `node scripts/strip-verticals.mjs --check` |
| `npm run check:guards` | `npm run check:encoding && npm run check:pagination && npm run check:layering && npm run check:screen-kit && npm run check:messages && npm run check:orphans && npm run check:fences` |
| `npm run check:theme` | `node scripts/check-theme-record.mjs` |
| `npm run theme:pull` | `node scripts/theme-pull.mjs` |
| `npm run drawing-kit` | `node scripts/drawing-kit.mjs` |
| `npm run check:drawing` | `node scripts/check-drawing.mjs` |
| `npm run template:build` | `node scripts/strip-verticals.mjs` |
| `npm run verify:env` | `node scripts/verify-local-environment.mjs` |
| `npm run verify:deployment` | `node scripts/verify-deployment-environment.mjs` |
| `npm run typecheck` | `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` |
| `npm run typecheck:cold` | `node -e "require('fs').rmSync('tsconfig.tsbuildinfo',{force:true})" && npm run typecheck` |
| `npm run check` | `npm run verify:env && npm run check:guards && npm run check:theme && npm run lint && npm run typecheck:cold && npm run test:run` |
| `npm run gate` | `npm run check:guards && npm run lint && npm run typecheck:cold && npm run test:run && npm run test:e2e && npm run test:coverage && npm run coverage:check` |
| `npm run setup:validate` | `node scripts/validate-setup.mjs` |
| `npm run test:e2e` | `playwright test` |
| `npm run pretest:e2e` | `npm run verify:env` |
| `npm run test:e2e:smoke` | `playwright test --grep @smoke` |
| `npm run pretest:e2e:smoke` | `npm run verify:env` |
| `npm run test:e2e:real-auth` | `playwright test -c playwright.real-auth.config.ts` |
| `npm run pretest:e2e:real-auth` | `npm run verify:env` |
| `npm run auth:local:seed` | `node scripts/local-test-auth.mjs seed` |
| `npm run auth:local:state` | `node scripts/local-test-auth.mjs state` |
| `npm run auth:local:cleanup` | `node scripts/local-test-auth.mjs cleanup` |
| `npm run demo:local:seed` | `node scripts/local-demo-seed.mjs` |
| `npm run check:messages` | `node scripts/check-messages.mjs` |
| `npm run template:verify` | `node scripts/verify-template.mjs` |
| `npm run product:init` | `node scripts/init-product.mjs` |
| `npm run feature:generate` | `node scripts/generate-entity.mjs` |
| `npm run product:recipe` | `node scripts/product-recipe.mjs` |
| `npm run framework:update` | `node scripts/framework-update.mjs` |

## Development And Verification

`dev` starts Next.js and `convex:dev` starts the backend development process; their environment guards run first. `build` creates application output and `start` serves an existing build. These are application operations and are not necessary to validate prose or local Markdown links. Starting services can make network connections or execute configured development behavior, so do not treat them as passive file inspection.

`verify:env` checks Node and installed direct dependency versions against the repository's expected environment and lockfile. Its success is a prerequisite for trusting application tests, not evidence of a deployed backend. This scheduled documentation task does not install dependencies merely to make a prose check green. Node and dependency requirements are reviewed with build/deployment documentation rather than copied into every guide where they can drift.

`check` is a composed gate: environment verification, grouped source guards, saved-theme consistency, lint, a cold type check and the test run. `test:run` writes JSON timing output and then applies the speed checker, so it is not equivalent to a bare Vitest invocation. `typecheck:cold` removes the incremental TypeScript build information before calling the standard type check. Both can write or remove generated/local state. A result from a previous checkout is not automatically evidence for today's source.

Coverage runs and coverage thresholds are separate package commands. The `gate` command includes browser and coverage stages but does not contain exactly the same composition as `check`; consult the actual table rather than assuming one always subsumes the other. `test:e2e:smoke` selects Playwright tests tagged for smoke coverage, while `test:e2e:real-auth` uses its separate configuration. Browser tests may authenticate, save state and exercise application behavior; none is part of this documentation-only review.

The guard family covers encoding, pagination, import layering, the shared screen kit, locale parity, orphan detection and copy boundaries. `check:guards` composes several of them; theme checking remains explicit in `check`. A hypothetical documentation-related error in one of those application guards is not a reason to edit source under this maintenance authorization. Report the unrelated failure and retain the validated documentation diff.

## Environment And Authentication Operations

`setup:validate` reads local configuration and environment to check selected providers and capabilities. `verify:deployment` is different: `scripts/verify-deployment-environment.mjs` invokes `npx --no-install convex env list`, choosing production when `--prod` is supplied. The implementation validates required setting names and suppresses raw command errors because they may include values. A successful name check does not prove credential validity, provider connectivity, frontend configuration, deployment success or live integration acceptance.

The deterministic local-auth commands have three different effects. Seed calls a backend mutation to create/update test users. Cleanup calls another mutation and reports queued cleanup. State launches Chromium through Playwright, signs in selected deterministic roles and saves session files under `e2e/.auth`. The state command does not merely print a diagnostic report. These session files contain credentials and should not become documentation attachments or committed fixtures.

The auth helper requires `LOCAL_TEST_AUTH_SECRET`. Backend URL resolution checks `LOCAL_TEST_AUTH_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`, a value in `.env.local`, then a loopback fallback. Browser base selection checks `LOCAL_TEST_AUTH_BASE_URL` before its localhost default. The command name does not itself lock execution to a particular database. The defaults also use different ports for the backend and browser app. Consult the [Local Test Auth Runbook](../operator/local-test-auth-runbook.md) before a separately authorized testing workflow, and do not copy actual environment values into a guide.

## Theme, Drawings And Generated Work

`theme:pull`, `drawing-kit` and `check:drawing` serve the repository's drawing workflow. Pulling the theme can change the saved record and the kit command can generate assets. This reference establishes their current entry points, not a replacement for the [Drawing Guide](./drawing-guide.md) or [Screen Kit](./screen-kit.md). Drawings use the actual saved theme and component kit; an old document or screenshot is not authority for recreating those assets.

The template, feature generator, product recipe, product initialization and framework update commands represent broader engineering workflows. Their dedicated guides cover the reviewed preview/apply modes, stale-file checks and side effects; this package table remains a command lookup rather than duplicating those procedures. Read their guides and source before running an apply/update operation. In particular, the presence of a framework update command does not authorize fetching upstream or editing Sonae from a Hakken documentation task.

## Missing Or Historical Commands

The previous version of this reference listed many movement capture, replay, proof and evaluation command families. Those package keys were not found in the current package script map. Their absence means the old commands cannot be advertised as current invocation paths; it does not authorize deleting historical proof records, declaring the underlying feature removed, or adding scripts back. The optional/possibly removed capability review remains in the [documentation inventory](../index.md).

When a command appears in an old guide, compare the current package key, target script and applicable operator runbook. A missing package key is not a valid current command just because its old documentation exists. Conversely a script still present on disk may have no supported package alias. Record that distinction and ask for a product decision before restoring or retiring functionality.

For maintenance actions inside the application, use [Maintenance Scripts](./maintenance-scripts.md). That registry is a typed backend allowlist with its own actor, history and migration scheduling. It is separate from package commands on a developer machine. Neither registry should be expanded with arbitrary command execution to work around an operational problem. Current documentation validation checks paths, links, metadata and whitespace; full application gates, live environment inspection, authentication saves and migrations remain unrun in this pass.
