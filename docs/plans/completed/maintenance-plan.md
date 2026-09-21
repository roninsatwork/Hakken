# Maintenance Plan

Last reviewed: 2026-08-19
Status: COMPLETE — all 11 phases executed 2026-08-19, uncommitted on `dev`.
Approved by Anthony on 2026-08-19 from the code-maintenance audit of the same date.
Owner: Anthony

## Completion note (2026-08-19)

Every phase below was executed the same day the plan was written. Final
verification: 5,525 tests across 598 files pass, `check:guards` (now eight
guards, including the new orphan and fence checks), lint and typecheck all
clean; the platform coverage gate rose from 61/58/47/59 to 66/63/54/62.
Notable deviations from the written plan, all recorded in place:
- M6.3: `executeObjectiveLoop` shrank only ~55 lines — earlier refactors had
  already extracted the big pure pieces; ten decision functions were still
  extracted and unit-tested (25 new tests).
- Phase 10: `template.manifest.json` had existed and was deleted 2026-08-09
  (not "never existed"); the fences-only stripper was built as chosen. Its
  first build exposed two fence mislabels (wiki tables inside the salesData
  fence in schema.ts; a core import fenced in SidebarNavigation) — both
  fixed. Remaining marker-coverage gaps are listed in
  platform-hardening-plan.md P4.3.
- Phase 11: 408 raw buttons frozen (audit's 387 was dashboard-only), seven
  real variants shipped, first ten migrated.
- Webhook signature header names keep "Hakken" (wire protocol; renaming
  breaks existing consumers) — commented at the site.

## Scope And Rules

**In scope:** the 15 audit findings Anthony approved (numbers refer to the
audit report): 1–12, 14, 16, 17. Safety defaults, client setup, CI gaps,
provider tests, deletions, duplication, error handling, branding, the template
stripper, and a Button primitive.

**Out of scope (explicitly, by owner decision on 2026-08-19):**
- **Finding 13 — dependency removal.** `apify-client`, `resend`, and `gsap`
  stay in `package.json`. Anthony has confirmed Apify and Resend are in use.
  Do not remove any dependency under this plan.
- **Finding 15 — movement/Posture Studio.** The demo and its debug lab
  (`scripts/movement-debug/`, the 101 `movement:*` scripts) stay in Hakken.
  It is a live demo / POC. Movement work is governed by
  Movement Definitive Plan (not included in this copy).

**Standing decisions recorded here so nobody "fixes" them later:**
- Anthony (`anthony@ronins.co.uk`) as SUPER_ADMIN on deployments is **the
  desired behaviour** (owner decision 2026-08-19). Phase 2 repairs the setup
  path around it; it does not remove it.
- "Powered by Ronins" credit on emails and public pages is **deliberate
  branding** and stays. Phase 9 is about the platform *name* ("Hakken"
  hardcoded where `systemSettings.platformName` should be read), not the
  credit.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Every item carries an acceptance test. A failing-then-passing test is
  acceptance; "it looks right" is not.
- Day numbers are working days, in order. One phase finishes before the next
  starts unless marked independent.

---

## Phase 1 — Safety defaults (Day 1)

### M1.1 — Purge pipelines default to enabled *(audit finding 1)*

**Where:** `convex/purgeScheduleService.ts:28` — `DAILY_2AM` ships
`enabled: false`; only `purgeHistory` overrides it. 14 of 15 retention
pipelines are off on a fresh deployment. Phone transcripts, mailbox
messages, and auth events are never pruned unless a human ticks 14 boxes.

**Fix:** flip the default to `enabled: true` for all pipelines at their
already-documented retention days (90/180/400). The 30-day floor already
guards against over-aggressive values. Add an admin-overview line and a
daily-platform-alert line reporting "N pipelines disabled" for deployments
where someone turns them off deliberately.

**Acceptance:** a test in `convex/purgeScheduleService` asserting every
pipeline key resolves to `enabled: true` by default; a test that a disabled
pipeline is surfaced in the alert payload.

### M1.2 — Sales-data reset becomes admin-only *(audit finding 4)*

**Where:** `convex/salesDataReset.ts:97,314` — `resetSalesData` and
`clearAllSalesData` are `tenantAction` (any authenticated member).

**Fix:** change both to `adminAction`. One line each. (Demo/POC today, but
the wrappers already exist and the change costs nothing.)

**Acceptance:** `convexTest` case: USER-role caller gets an authorization
error; ADMIN-role caller succeeds.

---

## Phase 2 — Client setup repaired (Day 2) *(audit finding 2)*

### M2.1 — Fix the bespoke runbook and setup script

**Where:** `bespoke.md` §4.1 and `bespoke-installation/master-setup.zsh:71`
instruct "Update SUPER_ADMIN email in `convex/auth.ts`" — that setting no
longer exists there. Following the runbook yields a deployment with no
reachable admin.

**Fix:** replace the stale step with
`npx convex env set INITIAL_SUPER_ADMIN_EMAIL <email> --prod` inside the
script itself (the code path at `convex/authUserProvisioning.ts:154` already
works). Keep `convex/seedUsers.ts` — Anthony as SUPER_ADMIN is desired — but
remove the dead `"ACME Inc"` company lookup while there.

**Acceptance:** running `master-setup.zsh` against a scratch deployment
produces a working super-admin without manual file edits.

### M2.2 — Environment coverage check

**Where:** code reads 44 distinct `process.env` keys in `convex/`;
`master-setup.zsh` sets 10; `.env.example` lists 4. Missing keys fail
silently as features that do nothing.

**Fix:** extend `scripts/verify-local-environment.mjs` with a
`verify:deployment` mode that checks the full key list against a deployment
and reports missing vs optional. Run it as the final step of
`master-setup.zsh`. Update `.env.example` to list every key with a comment.

**Acceptance:** `npm run verify:deployment` against a deployment missing a
required key exits non-zero and names the key.

---

## Phase 3 — Release safety net (Days 3–4) *(audit findings 3 and 5)*

### M3.1 — Browser smoke tests on every PR

**Where:** `.github/workflows/ci.yml` — `full-gate` (which runs
`test:e2e`) fires only on PRs targeting `main`. Daily work on `dev` never
runs a browser test.

**Fix:** tag ~4 specs `@smoke` (`security`, `auth-journey`, `admin-smoke`,
`user-chat-flow`) and add a job running the smoke subset on every PR and on
push to `dev` (~3 minutes). Full suite stays on the main gate.

**Acceptance:** a PR into `dev` shows the smoke job in its checks.

### M3.2 — Deploy pipeline gets the guards

**Where:** `deploy.yml` runs lint/typecheck/tests/build but skips
`check:guards` and `coverage:check` — production is held to a lower bar
than a PR.

**Fix:** add `npm run check:guards` and `npm run coverage:check` to
`deploy.yml` before the build step. Also add a build-time assertion that
fails `next build` if `E2E_AUTH_ENABLED === "1"` while
`NODE_ENV === "production"` (the e2e auth bypass must never ship armed).

**Acceptance:** deploy workflow runs the guards; a deliberate
`E2E_AUTH_ENABLED=1` production build fails.

### M3.3 — Provider adapter contract tests

**Where:** `convex/anthropicAgentProvider.ts` (224 lines),
`convex/googleAgentProvider.ts` (180), `convex/openrouterAgentProvider.ts`
(190) — zero tests, and `agentRuntime.test.ts` mocks at exactly the
`getAgentProviderAdapter` boundary, so the wire-protocol code is invisible
to the whole suite.

**Fix:** one contract test per adapter (~150 lines each, recorded fixtures,
no network): request shape out, response normalisation back, error mapping.

**Acceptance:** three new test files pass in `npm run test:run`; coverage
ratchet (`nextRatchet` in `coverage-thresholds.json`) bumped once they land.

---

## Phase 4 — Deletions and build hygiene (Day 5) *(audit findings 12, 14, 16)*

Independent of phases 1–3. Pure subtraction — no dependency removals (see
out-of-scope).

### M4.1 — Delete `adk-python/`

1,543 tracked files, 29 MB, vendored copy of Google's ADK, committed in the
initial commit and never referenced. `git rm -r adk-python`, drop its
exclusion entries from `tsconfig.json`, `vitest.config.ts`,
`eslint.config.mjs`, and `src/quality-drift.test.ts:112`. Record the
upstream commit SHA in `docs/developer/` if it was reference material.

### M4.2 — Delete orphaned files, relocate phantom routes

- True orphans: `admin/_features/widget-config/WidgetConfigTabs.tsx`,
  `src/ui/components/header.tsx` + `footer.tsx` + their
  `ShellComponents.test.tsx`, `src/ui/atoms/input.tsx` + its test block,
  `demos/movements/_components/Robot.tsx`, `PreviewModal.tsx`, and the 8
  zero-importer `_lib` modules (~1,650 lines total). A test is not a
  consumer — component and test go together.
- Phantom routes: 7 legacy company pages (1,812 lines, e.g.
  `admin/companies/[id]/chat-logs/page.tsx`) sit at URLs that
  `next.config.ts:88-135` permanently redirects away, while the real routes
  are 1-line re-export shims. Move each implementation into its `ai/*` /
  `directory/*` folder and delete the legacy directory. Redirects keep old
  URLs working.
- Add `knip` (or `ts-prune`) to `check:guards` with a shrink-only allowlist
  frozen at the post-cleanup state, so orphans can't accumulate again.

### M4.3 — `.dockerignore`

Currently 8 entries; excludes none of `docs/`, `e2e/`,
`scripts/movement-debug/`, `coverage/`, `test-results/`,
`playwright-report/`, `tmp/`. Add them. (Movement-debug stays in the repo —
finding 15 — it just doesn't belong in the Docker build context.)

**Acceptance for the phase:** `npm run check:guards && npm run test:run &&
npm run build` green after all deletions; docker build context measurably
smaller (record before/after in the PR description).

---

## Phase 5 — Duplicated helpers (Day 6) *(audit finding 8)*

**Where / fix, in priority order:**
1. `constantTimeEqual` — byte-identical in `apiKeys.ts:25`, `webhooks.ts:6`,
   `workflows.ts:14`, `utils/widgetEmbedPass.ts:77`. Consolidate into
   `convex/utils/security.ts` (already exists). Security primitive; four
   forks means a fix lands in one.
2. `requireCompanyAccess` — five copies (`companyLearningLoop.ts:73`,
   `companyMemories.ts:131`, `companyReadiness.ts:25`, `companySkills.ts:163`,
   superset in `companyEvals.ts:361`). Consolidate into `convex/authz.ts`
   using the superset signature. Already flagged in `AGENTS.md:193`.
3. `getErrorMessage` (×9), `isRecord` (×8), `parseStoredStringArray` (×5),
   `stableStringify` (×3) → new `convex/utils/lang.ts`. Mechanical, ~25
   call sites.
4. The chat-logs copy-paste pair (`admin/ai/chat-logs/page.tsx` +
   `admin/companies/[id]/chat-logs/page.tsx`) → one
   `admin/_features/chat-logs/ChatLogsScreen.tsx` taking
   `scope: { kind: "global" } | { kind: "company"; companyId }`, matching
   the 11 `_features/` screens that already work this way. (Do after M4.2
   moves the company page to its real folder.)

**Acceptance:** `rg` finds exactly one definition of each helper; both
chat-logs pages are ≤20-line wrappers; existing tests green.

---

## Phase 6 — Oversized files (Days 7–9) *(audit finding 7)*

### M6.1 — Extract approvals from `agentRuns.ts` (Day 7)

**Where:** `convex/agentRuns.ts` (2,757 lines) holds five unrelated jobs;
the approvals subsystem alone is ~1,100 lines (`:1550-2508`, `:2626-2757`).
It is also most of the mutual `agentRuntime ↔ agentRuns` coupling — the one
circular dependency in the backend.

**Fix:** lift approvals into `convex/agentRunApprovals.ts`; lift
`getAnalyticsForAgent` and `getRunObservatory` bodies into the existing
`agentObservabilityService.ts`. Update `internal.*` references.

### M6.2 — Split the agent runs admin page (Day 8)

**Where:** `admin/agents/[id]/runs/page.tsx` (1,403 lines) — one
~1,080-line component, 10 mutations, 8+ useState, hand-rolled cursor stack,
and lines 27–123 of untested business rules.

**Fix:** lift the rules/formatters into `admin/agents/_lib/runStatusRules.ts`
with unit tests; split the body into `RunsTable`, `RunDetailDrawer`,
`FeedbackPanel`, `MemoryCandidatesPanel`, `EvalPanel` (the ten mutations
already cluster that way); replace the cursor stack with
`useCursorPagination` from `screens/CursorPagination.tsx`.

### M6.3 — Shrink `executeObjectiveLoop` (Day 9)

**Where:** `convex/agentRuntime.ts:1032` — one 1,049-line private function,
36% of the file.

**Fix:** extract the pure decision logic into the existing
`agentRuntimeService.ts` (already imported there; the `*Service` convention
is enforced by lint). This also prepares Phase 8.

**Acceptance for the phase:** no behaviour change — existing
`agentRuntime.test.ts` / `agentRuns.test.ts` suites pass unmodified; new
unit tests exist for `runStatusRules`.

---

## Phase 7 — Errors that survive to production (Days 10–11) *(audit finding 9)*

**Where:** 791 `throw new Error(...)` sites get redacted to a generic
message in production; only 7 newer files use `ConvexError`. The client
compensates by regex-scraping messages in `src/lib/errors.ts`.

**Fix:** standardise on `ConvexError` with a `{ code, message }` payload.
Convert `convex/authz.ts` and `convex/tenantFunctions.ts` first — they sit
behind every request. Add a `code` branch to `toUserFacingMessage` and keep
the string-scrape as legacy fallback. Convert remaining files
opportunistically as they're touched; do not big-bang all 791 sites.

**Acceptance:** an authz failure in a production-mode test surfaces its
real message and code to the client; `toUserFacingMessage` has unit tests
for the structured path.

---

## Phase 8 — One model turn (Days 12–14) *(audit finding 6)*

**Where:** `convex/ai.ts` (assistant chat) and `convex/agentRuntime.ts`
(agent runtime) each independently wire the same eight collaborators —
safety policy, knowledge retrieval, streaming, evidence, prompt assembly,
provider registry, photo actions, PII redaction. Safety changes must land
twice; divergence is invisible.

**Fix:** extract one `runModelTurn()` in `agentRuntimeService.ts` covering
assemble prompt → redact → retrieve → call provider → stream → evaluate
safety → record cost. Both entry points keep their own orchestration and
call the shared turn. Highest-value refactor in the codebase; do it after
Phase 6 has already slimmed the runtime.

**Acceptance:** both the chat suite and the runtime suite pass; a
deliberate safety-policy change lands in exactly one file and both surfaces
pick it up (write one test proving this on each side).

---

## Phase 9 — Platform name, not builder name (Days 15–16) *(audit finding 10)*

**Where:** "Hakken" is hardcoded in 369 non-test places despite
`systemSettings.platformName` existing. Customer-visible offenders: AI
system prompts (`convex/aiPromptAssembly.ts:4,121`), safety refusal text
(`convex/aiSafetyPolicy.ts:58,67`), invite email subject/body
(`convex/invites.ts:58-60`), the Gmail label written into the client's
mailbox (`convex/gmailWatcher.ts:27`), webhook headers
(`convex/webhookSignatureService.ts:21-22`), error copy
(`convex/ai.ts:687`). Also the builder's own marketing copy shipped as
fixtures in `convex/wikiExamService.ts:28-114`.

**Reminder:** "Powered by Ronins" stays (deliberate credit). This phase is
the platform *name* only.

**Fix:** thread `platformName` through the ~20 customer-facing call sites;
replace the Ronins-specific wiki exam fixtures with neutral ones; widen the
guard in `src/no-client-specific-fallbacks.test.ts` to a `BUILDER_STRINGS`
list so new hardcoding fails CI. Internal comments and header names may
keep "Hakken".

**Acceptance:** the widened guard test passes; changing `platformName` on a
dev deployment changes the invite email, the AI's self-identification, and
refusal copy.

---

## Phase 10 — Template stripper exists or the markers go (Day 17) *(audit finding 11)*

**Where:** 35+ `template:remove` fences (start/end pairs naming a vertical) across `src/` and
`convex/` (incl. `schema.ts`) for 5 verticals — with no script anywhere
that reads them. `platform-hardening-plan.md:1291` records P4.3 "Template
branch — DONE 2026-07-25" describing `npm run template:build` and
`template.manifest.json`; neither exists.

**Fix (Anthony chose: build it):** write `scripts/strip-verticals.mjs`
(~60 lines) taking `--keep base,salesData,...`, plus a guard test asserting
every `:start` has a matching `:end` and every named vertical exists in
`COMPANY_MODULES`. Add `template:build` to `package.json`. Correct
`platform-hardening-plan.md` P4.3 and the CI description in
`architecture.md:99-100` (it documents jobs that don't exist).

**Acceptance:** `npm run template:build -- --keep base` produces a tree
with the fenced blocks removed that still passes `typecheck`; the
fence-balance guard runs in `check:guards`.

---

## Phase 11 — A real Button (Days 18–19) *(audit finding 17)*

**Where:** no Button primitive exists; 387 raw `<button>` elements across
`(dashboard)`, with per-file peaks in `runs/page.tsx` (16),
`ConfigDrawer.tsx` (12), `KnowledgeManager.tsx` (12).

**Fix:** add `src/ui/atoms/Button.tsx` with the variants already implicit
in the call sites (primary / ghost / icon / destructive), then extend
`scripts/check-screen-kit.mjs` with a fourth rule counting raw `<button>`
elements, frozen at the current count with a shrink-only allowlist — the
exact pattern the kit already uses for tables and inputs. Migrate the
worst three files as the first shrink.

**Acceptance:** guard reports the frozen count and fails on any increase;
the three migrated files render identically (screenshot check via the
e2e-auth fixture per `verify-screens-in-browser` rule).

---

## Timeline summary

| Phase | Days | What |
|---|---|---|
| 1 | Day 1 | Purges on by default; resets admin-only |
| 2 | Day 2 | Client setup script + runbook + env coverage |
| 3 | Days 3–4 | Smoke e2e on PRs; guards in deploy; provider tests |
| 4 | Day 5 | Delete adk-python, orphans, phantom routes; .dockerignore |
| 5 | Day 6 | Consolidate duplicated helpers; merge chat-logs pair |
| 6 | Days 7–9 | Split agentRuns, runs page, objective loop |
| 7 | Days 10–11 | Structured errors from the auth layer out |
| 8 | Days 12–14 | Shared model turn for chat + agent runtime |
| 9 | Days 15–16 | platformName threaded through customer copy |
| 10 | Day 17 | Vertical stripper + docs corrected |
| 11 | Days 18–19 | Button primitive + guard |

19 working days (~4 calendar weeks). Phases 1–4 are independent of each
other and can be reordered; phases 6 → 8 must run in that order.
