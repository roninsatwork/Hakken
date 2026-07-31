# Platform Hardening Plan

Last reviewed: 2026-07-25
Status: Active. Single source of truth for all **platform** (non-movement) work.
When this plan and any older platform/architecture plan disagree, this plan wins.
Owner: Anthony

## Scope And Rules

**In scope:** the Sonae platform core — agent runtime, tool/connector execution,
tenancy and authz, knowledge/RAG, workflows, admin surfaces, operational
envelope, and the reusability of this repo as a starter for other products.

**Out of scope (explicitly):** the movement / Posture Studio demo. It stays. It
is a live client demo and nothing in this plan deletes, moves, or refactors it.
Where movement affects a platform metric (coverage denominators, dependency
weight, build time) this plan **fences it**, it does not remove it. Movement work
is governed by [Movement Definitive Plan](./movement-definitive-plan.md).

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- `sonae.ronins.co.uk` is an OLD deployment. Test on `localhost:3000`.
- Node 24.18.0 for trusted checks; `verify:env` enforces the checked-in Node
  and direct dependency baseline before local commands run.
- Every item below carries an acceptance test. "It looks right" is not acceptance
  for platform work; a failing-then-passing test is.

## Why This Plan Exists

A code audit on 2026-07-25 found the platform's real shape differs from how
`PRODUCT.md` describes it:

- The **governance layer is genuinely strong** — zero `any` across 240k LOC,
  254 indexes with essentially no unbounded `.collect()`, deny-by-default tool
  authorization, real prompt-injection hardening, a correct durable run schema,
  and scheduler-driven workflow execution that properly sidesteps Convex action
  limits.
- The **agent capability layer is thin** — a 4-step loop, 2 executable tool
  handlers out of 29 declared, no streaming, no resumption, no prompt caching.
- The **operational envelope is close to absent** — no error tracking, no health
  check, no error boundaries, no migrations, no rollback path.
- `PRODUCT.md` claims capabilities that do not exist in the code. That is a
  commercial liability if the document has ever reached a client.

The goal of this plan is to make the platform's reality match, and then exceed,
its description — and to make it genuinely reusable for the next product.

---

## Phase 0 — Correctness And Security (do first)

Every item here is a confirmed defect, verified against source on 2026-07-25.
These are not refactors. They are bugs with a security or data-integrity impact.

### P0.1 — Widget domain allowlist enforces nothing

**Where:** `convex/widgets.ts:335` (`createWidgetThread`), client caller at
`src/app/w/[widgetId]/page.tsx:199`.

**Problem:** `sourceUrl` is a caller-supplied `v.string()`, filled in the browser
from `document.referrer || window.location.href`. The "Zero-Trust Enforcer"
comment validates that string against `widget.allowedDomains`. Any attacker
calling the mutation directly passes any string they like. There is no `Origin`
header check and no CORS involvement in this path at all, contrary to
`PRODUCT.md` §7.

**Correction (2026-07-25):** the original prescription here — "read the real
`Origin` header in a Convex HTTP action" — was **wrong for this architecture**
and would have shipped a control that enforces nothing. `public/embed.js:190`
sets `iframe.src = <host>/w/<widgetId>`, so the widget runs in an iframe served
from *our own* origin. Every request it makes carries our origin, never the
embedding site's. Validating that against `allowedDomains` would pass for any
attacker. The embedding site is knowable only via `frame-ancestors` (which the
browser enforces against the real parent) or the `Referer` on the document
request.

**Fix as implemented:**

- `convex/utils/widgetOriginPolicy.ts` — shared, pure domain matching and
  `frame-ancestors` construction, so the header and the server-side checks
  cannot drift. Rejects credential-embedded URLs and suffix lookalikes
  (`acmecorp.com.evil.test`); denies by default on an empty allowlist.
- `src/lib/widgetEmbedPolicy.ts` — the per-request decision, Next-free so it is
  directly unit testable.
- `src/proxy.ts` — emits an **enforcing** per-widget
  `Content-Security-Policy: frame-ancestors` on `/w/<widgetId>`, and 403s a
  document request whose `Referer` host is not allowlisted. Fails closed when
  the widget is unknown or Convex is unreachable.
- `next.config.ts` — dropped the static `frameAncestors: ["*"]`; it was
  report-only (where the spec ignores frame-ancestors) and contradicted the real
  policy.
- `convex/widgets.ts` — `sourceUrl` is now documented and treated as an
  untrusted client-reported hint, retained as a sanity filter and audit signal
  only, using the shared helper.

**Status: done.** 17 unit tests plus updated `widgets.test.ts` attack cases;
verified end to end against a running server (unknown widget → 403 +
`frame-ancestors 'none'`; disallowed `Referer` → 403; direct visit → 200).

**Operational follow-up:** all three widgets in the current deployment have
`allowedDomains: []`, so they are now embeddable nowhere. They already could not
create threads (the old code also denied an empty allowlist), so this is not a
regression — but each widget needs its domains configured before it can be
embedded.

### P0.2 — Anonymous BOLA on `getSwarmLogs`

**Where:** `convex/swarmRuntime.ts:13-19`.

**Problem:**
```ts
if (thread.widgetId && !thread.userId) {
   // Allow access
}
```
Every other widget path requires a hashed access token
(`convex/chatService.ts:56` `assertCanAccessThread`). This one does not. Anyone
holding a widget thread id reads up to 10,000 swarm log rows — agent reasoning
and tool dispatch traces — unauthenticated. `swarmLogs` has no `companyId`, so
nothing downstream can re-scope it.

**Fix:** require the widget session token, using the same
`assertCanAccessThread` helper as every sibling path. Add `companyId` to
`swarmLogs` and backfill.

**Acceptance:** test asserting `getSwarmLogs` returns `[]` (or throws) for an
anonymous caller without a valid widget token, and succeeds with one.

### P0.3 — Iterator fan-out hangs workflow runs permanently

**Where:** `convex/workflowEngine.ts:512-523`.

**Problem:** N `workflowExecutionSteps` rows are inserted for N iterator items,
but `readyToSchedule.push(dId)` fires **once**, outside the loop.
`scheduleDownstreamNodes` dispatches one `executeNode` per unique node id and
`claimNextPendingStep` claims exactly one PENDING row. So 1 of N items runs and
N−1 sit PENDING forever. That also makes the PENDING check at
`workflowEngine.ts:529` permanently true, so the execution never reaches SUCCESS.
Downstream dependency checks use `.order("desc").first()`, which then sees a
PENDING sibling and never unblocks.

**Fix:** schedule one worker per inserted step (push `dId` per payload, or move
to explicit per-step scheduling keyed by step id). Add a configurable fan-out
cap; iterator arrays are currently unbounded.

**Acceptance:** test executing an iterator node over a 5-item array asserting all
5 steps reach SUCCESS and the execution transitions to SUCCESS. This test does
not exist today; `convex/workflowRuntime.test.ts:151` only asserts output shape.

### P0.4 — RAG discards relevance scores, starving tenant knowledge

**Where:** `convex/aiPromptAssembly.ts:94-100`, consumed at `convex/ai.ts:290-311`.

**Problem:** `orderAssistantKnowledgeMatches` is literally
`[...globalMatches, ...companyMatches, ...threadMatches]`. Convex's `_score` is
discarded. Three `vectorSearch` calls at `limit: 50` produce 150 candidates,
which the packing loop truncates at a 32,000-char budget **in that fixed tier
order**. At ~1000 chars/chunk that is ~32 chunks. **If global knowledge holds 32
or more chunks, tenant-specific and just-uploaded thread knowledge never reach
the prompt at all.** This silently defeats the Ephemeral Thread RAG feature.

**Fix:** merge all three tiers by `_score` descending. Apply an optional tier
boost (thread > company > global) as a score multiplier, not as ordering. Reserve
a minimum share of the char budget for thread matches so an uploaded file is
always represented.

**Acceptance:** test with 40 high-scoring global chunks and 1 near-perfect thread
chunk asserting the thread chunk appears in the assembled context.

### P0.5 — Connector "connection test" never contacts the provider

**Where:** `convex/aiTools.ts:605` — it is a `mutation`, so it structurally
cannot make an outbound request.

**Problem:** it checks that secret *ref names* are present and that
`authConnectionStatus === "CONNECTED"`, then writes `"Connection test passed."`
A connector whose OAuth was "completed" by typing an arbitrary `tokenRef` reports
a passing test. That is actively misleading, not merely incomplete.

**Fix (interim, this phase):** rename to `validateConnectorConfiguration` and
change the UI copy to "Configuration valid — not yet connected". Do not claim a
connection was tested. Real connectivity testing lands in Phase 3 with real
connectors.

**Acceptance:** no admin surface reports a passing *connection* test for a
connector with no working credentials.

### P0.6 — Owner's personal email seeded into an AI rule

**Where:** `convex/aiRules.ts:199`.

**Problem:** the seeded "Pricing Protocol" rule instructs agents to direct all
pricing questions to `anthony@ronins.co.uk`. This ships in every fork and every
client deployment.

**Fix:** move the contact address to `systemSettings` (alongside `platformName`)
and template it into the rule. Default to empty, with the rule omitted when unset.

**Acceptance:** `grep -rn "ronins.co.uk" convex/ src/` returns no hits outside
docs and test fixtures.

### P0.7 — Deploy gate is red

**Where:** `.github/workflows/deploy.yml` runs `npm audit --audit-level=high`.

**Problem:** verified 2026-07-25 — exit 1, **19 high + 1 critical**. The critical
is in `@auth/core`, the authentication library itself. `next` carries a
middleware/proxy-bypass advisory that targets the mechanism `src/proxy.ts` uses
to gate `/admin`, `/app`, `/demos`. Mitigating factor: Convex enforces roles
server-side (`convex/authz.ts`, used across 44 files), so this is not an authz
bypass — but `main` cannot deploy today. The last three commits are hand-pinned
`overrides` fighting this, and there are now 10 of them.

**Fix:** upgrade `@auth/core` and `next` to patched versions rather than adding
an 11th override. Remove overrides that upstream has since fixed. Add a weekly
scheduled audit workflow so this is caught before it blocks a release rather than
during one.

**Acceptance:** `npm audit --audit-level=high` exits 0; `npm run check` and
`npm run build` pass; a scheduled audit job exists.

### P0.8 — Parallel tool calls silently dropped

**Where:** `convex/agentRuntime.ts:490` — `response.functionCalls?.[0]`.

**Problem:** if the model returns three parallel calls, two vanish. Only one
`functionResponse` is appended, so the transcript sent back to the model no
longer matches the calls it made. Silent wrong behaviour, not an error.

**Fix (minimum, this phase):** iterate all returned `functionCalls`, execute
sequentially, and append a `functionResponse` for each. Genuine parallel
execution lands in Phase 3.

**Acceptance:** test with a mocked provider returning 3 function calls asserting
3 tool-call rows and 3 `functionResponse` entries.

---

## Phase 1 — Operational Envelope

Today a production failure is invisible and unrecoverable. This is the phase that
decides whether a client-facing product built on Sonae is defensible.

### P1.1 — Error tracking and health

- Sentry (or equivalent) wired into client, Next server, and Convex actions.
- `/api/health` returning build SHA, Convex reachability, and provider config
  status. `src/app/api/` currently contains only e2e fixtures.
- `HEALTHCHECK` in the `Dockerfile`.
- **Acceptance:** a deliberately thrown error in each of the three runtimes
  appears in the error tracker with a correlation id.

### P1.2 — Error boundaries and user-facing errors

- `src/app/global-error.tsx` plus per-segment `error.tsx` for `/admin` and
  `/app`. None exist today, so any client render exception is an untelemetered
  white screen.
- A toast/error surface. Zero files reference `toast` today, while the backend
  throws 26 `ConvexError`s — it is currently unclear how any of them reach a user.
- **Acceptance:** a thrown error in an admin page renders a recoverable boundary,
  reports to the tracker, and does not blank the app.

### P1.3 — Immutable deploys and rollback

- Tag images by commit SHA; keep `:latest` as an alias only. `deploy.yml`
  currently tags `:latest` alone, so there is no previous tag to roll back to.
- Document the one-command rollback in `docs/developer/deployment.md`.
- **Acceptance:** a documented, rehearsed rollback to the previous SHA.

### P1.4 — Migrations

- Adopt a migration/backfill mechanism for Convex. There are **77 tables and zero
  migration tooling**; `npx convex deploy` pushes schema unversioned, ahead of
  the app image, with no gate between them.
- Backfills needed by this plan alone: `swarmLogs.companyId` (P0.2), plus the
  `companyId` tightening in P2.1.
- **Acceptance:** one real migration written, dry-run, and applied through the
  mechanism.

### P1.5 — Backups — REMOVED FROM SCOPE (2026-07-25, Anthony)

Dropped at Anthony's request. Not reinstated by a future agent without him
asking. Data *lifecycle* is already handled in-repo (`convex/crons.ts` purges,
vector GC, quota resets); backup and restore are treated as out of scope here.

### P1.6 — Make the quality gates real

- `coverage-thresholds.json` is set at 41/40/31/41 while actual coverage is
  66.25% lines. That is 25 points of slack; coverage could fall by a third and CI
  stays green. `lastMeasuredAt` is 2026-06-01 and `nextRatchet` (45) is below
  actual. Ratchet to just under actual and re-measure.
- **Fence movement out of the platform coverage number.** Movement is ~52% of
  non-test `src/` and is propping up the headline figure. Report platform
  coverage (convex + `src/app/(dashboard)/admin` + `src/app/(dashboard)/app` +
  `src/ui`) separately from demo coverage, and gate only on the platform number.
  This keeps the demo without letting it flatter the platform.
- Current platform reality to target: `src/app` end-user surface **11.2% lines**,
  `src/app/(dashboard)/admin` admin surface **34.9% branches**, backend 80.1% lines.
- Run the full gate on `dev`, not only on PRs into `main`.
- Drop `--quiet` from `npm run lint` so warnings are visible.
- **Acceptance:** platform-only coverage is reported and gated; the gate fails if
  platform coverage drops.

---

## Phase 2 — Structural Integrity

### P2.1 — Make tenancy a mechanism, not a convention

**This is the highest-leverage structural change in the plan.**

Today `convex/authz.ts` is a bag of helper functions that each of ~358 exported
functions must remember to call, and each must remember its own
`.withIndex("by_company", ...)`. There is no wrapper, no lint rule, and no test
enumerating the API surface. 40 tables declare `companyId` optional and 25 omit
it entirely, so the type system cannot catch a miss. `convex/bola.test.ts` is 5
tests — roughly 1.4% of the surface — and it demonstrably missed P0.2.

The discipline in the existing code is genuinely high. The problem is that it is
100% human-maintained, and this repo is meant to be extended by people who have
not read `AGENTS.md`.

**Measured before starting (2026-07-25):** of 360 client-callable functions,
**339 already had a guard and 21 did not** — and 12 of those 21 are the movement
demo. So the discipline was better than "convention means nothing"; the problem
was the absence of a mechanism, not widespread neglect.

**Mechanism delivered (2026-07-25):**

- `convex/tenantFunctions.ts` — `tenantQuery`/`tenantMutation`,
  `adminQuery`/`adminMutation`, `superAdminQuery`/`superAdminMutation`, plus
  `publicQuery`/`publicMutation`/`publicAction` which require a written
  `reason`. Handlers receive `user`, `userId` and the active `companyId`
  (impersonation-aware) on `ctx`. Built on
  `convex-helpers/server/customFunctions` — hand-rolling the wrapper meant
  re-deriving Convex's argument and data-model generics, which TypeScript could
  not reconcile. `convex-helpers` is first-party and added **one** lock entry
  with no effect on the production audit.
- `convex/authzEnforcement.test.ts` — fails CI when a client-callable function
  uses a raw `query`/`mutation`/`action`. Verified by adding an unguarded
  function and watching it fail, then removing it.
- `convex/authz-migration-allowlist.json` — the 355-function backlog, with a
  `maxEntries` ratchet that may only shrink and a stale-entry check so it cannot
  drift.
- `docs/developer/tenancy-enforcement.md` — the rule, the builder table, and
  how to migrate a module.

**Important design note:** enforcement is *structural* (which builder declared
the function), not textual (does the body call a guard). A text search cannot
see a guard delegated into a domain helper — `getKnowledgeDocumentsForScope`
authenticates correctly but greps as unguarded — so a text-based rule would emit
false positives and be ignored.

**Deliberately not done:** the builders do **not** auto-filter reads. Tables
differ too much for that to be safe generically; handlers still scope their own
queries, with `requireTenant` and `assertTenantAccess` provided. Claiming
automatic filtering would be worse than not having it.

**Still outstanding under this item:**
- Migrate the 355 allowlisted functions, a module at a time. Existing auth tests
  should pass unchanged — that is the proof a swap preserved behaviour.
- Tighten `companyId` from optional to required where semantically mandatory,
  backfilled via P1.4.
- Add `companyId` to `workflowExecutionSteps`, `schedules`, `aiTools`,
  `toolConnectorSecretRefs`. (`swarmLogs` was done in P0.2, with a backfill
  migration registered.)

**Acceptance: met.** A new Convex function written without a tenant builder
fails CI; the allowlist is documented, ratcheted, and shrinking (358 → 355).

### P2.2 — Fence the movement demo (without touching it) — DONE 2026-07-25

**Measured, not assumed.** The shared root bundle every route downloads is
**447 KB**. three.js accounts for **4,359 KB** across three chunks, MediaPipe
65 KB — all code-split, none in the shared root. So the platform was *already*
not paying for the demo's weight.

But that held only because nothing outside the demo imported those packages,
which is invisible while editing. It had already drifted once:
the former `src/ui/components/Robot.tsx`, a generated 3D component in the platform's
**shared UI folder**, imported `three`, `@react-three/fiber`,
`@react-three/drei` and `three-stdlib`, and was rendered by nothing. One import
away from pulling 4.3 MB into a shared chunk. Moved to
`src/app/(dashboard)/demos/movements/_components/` rather than deleted.

`src/movement-boundary.test.ts` now enforces the property:

- no platform file may import the demo's heavy rendering/ML packages
- no platform file may import from the demo directories at all (which would drag
  them in transitively)
- every guarded package must still be installed, so an upstream rename cannot
  quietly empty the guard

Verified by adding `import * as THREE from 'three'` to a platform component and
watching it fail, then reverting.

Also added `npm run help`, which prints the ~20 platform scripts grouped, since
`npm run` lists 132 of which 101 are `movement:*`.

Coverage fencing was delivered earlier under P1.6. Schema tables and the demo
itself are untouched, as intended.

Movement stays and keeps working. But it should stop taxing the platform:

- **Dependencies:** `three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`,
  `react-webcam`, `@react-three/fiber`, `@react-three/drei`, `kalidokit`, and the
  TensorFlow packages are used almost exclusively by movement (43 of 44 `three`
  imports). Ensure they are `next/dynamic`-loaded and confirm they do not enter
  the shared client bundle. Verify with a bundle analysis, not by assumption.
- **npm scripts:** 101 of 132 scripts are `movement:*`. Namespace platform
  scripts clearly so a newcomer can find `check`, `build`, and `verify:env`.
- **Coverage:** fenced per P1.6.
- **Schema:** leave `movements` and `movementDebugSessions` in place; they are 2
  of 77 tables and cost nothing.
- **Acceptance:** the platform route bundle does not include TensorFlow/three;
  movement pages still work end-to-end.

### P2.3 — Extract the brand

- `SonaeModal`, `SonaeMarkdown`, `SonaeEmptyState`, `generateSonaeResponse`,
  `createOrUpdateSonaeAuthUser` — rename to neutral identifiers.
- Brand strings embedded in prompt assembly (`convex/aiPromptAssembly.ts:4,68`,
  `convex/orchestrator.ts:55`, `convex/aiSafetyPolicy.ts:58,67`,
  `convex/salesReportActions.ts:156`) must read from `systemSettings`, so a fork
  does not ship an assistant that calls itself Sonae.
- `priceGBP` in `plans` and `inventoryRollups` → currency-neutral minor units,
  using the existing `systemSettings.currencySymbol`.
- Give real credit to what already works: the runtime theming layer
  (`convex/schema.ts:60-100` — platform name, logos, brand colour, fonts, radius,
  20 palette tokens) is genuinely wired through `SystemSettingsContext`. This
  item finishes a job that is already 80% done.
- **Acceptance:** a fork with `platformName` changed shows no "Sonae" anywhere in
  the UI or in any model-facing prompt.

### P2.4 — Navigation as configuration — DONE 2026-07-25

"Navigation Profiles" was guidance presented as a feature: the three profiles in
`getWhiteLabelNavigationProfiles` were rendered in the settings screen and
consumed by nothing.

**Delivered:**

- `src/lib/navigationVisibility.ts` — the rule, pure and React-free, 9 tests.
  Unclassified keys stay **visible**: deny-by-default would silently delete any
  newly added menu item on every deployment using a profile.
- `systemSettings.navigationProfileKey` — a deployment can now select a profile.
- `SidebarNavigation.tsx` — 35 items carry a `navKey`, and `NavItem` /
  `SubNavItem` exclude themselves via context rather than 29 call sites each
  being wrapped in a conditional that someone would eventually forget.
- Parent sections carry keys too. Hiding only a child left an empty expandable
  heading behind — caught by a test, not by review.

**Verification.** Because this could not be inspected by eye, the verification
gap was closed first: `.claude/launch.json` gained an `next-dev-e2e-auth`
configuration that signs in through the e2e route with **no secret required**,
so admin screens can be driven locally. Then
`SidebarNavigation.characterisation.test.tsx` recorded the full navigation for
every role (21 links super admin, 13 company admin, 10 user and signed-out)
before any change, and it passes unchanged afterwards. Confirmed visually as
well: the sidebar is identical.

**Not done:** the rendering was not collapsed into a data-driven loop. The
per-item active-state predicates are genuinely bespoke, so the remaining benefit
is stylistic rather than functional, and it is not worth restructuring working
navigation for. The choke-point cost stands: adding a menu item still edits this
file.

### P2.4 (original scope note) — Navigation as configuration

`WhiteLabelNavigationProfile` (`convex/settingsService.ts:103-110`) is a struct of
advisory strings rendered in an admin screen. `SidebarNavigation.tsx` never
imports it — it is 561 lines with 30 literal `<SubNavItem>` elements. The
white-label docs describe a feature that does not exist.

**Fix:** convert the sidebar to a `navConfig` array that the existing
`hide[]`/`visible[]` profile actually filters. ~150 lines, and it makes the
documentation true. It also removes one of the two shared choke points every new
feature must edit (the other is `messages/*.json`).

**Acceptance:** hiding a section in the navigation profile actually hides it.

---

## Phase 3 — Agent Runtime

The runtime is the product's core claim and currently its weakest layer.

### P3.1 — Per-agent runtime configuration

`DEFAULT_AGENT_OBJECTIVE_LIMITS` (`convex/agentRuntimeService.ts:1`) is
`maxSteps: 4, maxToolCalls: 3, maxRuntimeMs: 120000, maxCostGBP: 1` as hardcoded
module constants. Every agent on the platform is capped at 4 model turns forever.

Move limits onto the agent record with platform-level ceilings. Fix the budget
check placement: `shouldStopForRuntimeBudget` is evaluated *after* the
`requestedToolCalls === 0` break (`agentRuntime.ts:446-458`), so cost and token
budgets are never enforced for a run that returns text on the first turn.

**Done.** `resolveAgentObjectiveLimits` reads `maxSteps`, `maxToolCalls`,
`maxRuntimeMs` and `maxCostGBP` from the agent record, clamped to
`AGENT_OBJECTIVE_LIMIT_CEILINGS` (24 / 20 / 8 min / £20). Bad or missing values
fall back to the default rather than failing the run. The budget checks now run
before the `requestedToolCalls === 0` break, so a text-only run is checked too.

Raising the defaults surfaced a related gap worth recording. The old limits — 4
steps, 3 tools — were too tight for real work, but they were the only thing
actually bounding spend: `calculateModelCostGBP` multiplies token counts by rates
stored on the model record, and only 2 of the 7 enabled models have any rates
set. For the other 5 the computed cost is always £0, so the £1 cap can never
fire. Raising step counts without addressing that would have removed the one real
backstop.

So the defaults are now 10 steps / 8 tools / 5 min / £1, but only where cost can
be measured. `isModelCostMeasurable` checks the model for rates; when there are
none, `resolveAgentObjectiveLimits` holds the run to
`UNPRICED_MODEL_OBJECTIVE_LIMITS` (the old 4 / 3 / 2 min) however the agent is
configured. A deliberately *lower* per-agent budget is still honoured. The model
catalogue marks any enabled model with no rates "No pricing", explaining that
spend is untracked and the budget reduced — previously this was invisible.

Covered by `convex/agentRuntimeService.test.ts`, `convex/agentRuntime.test.ts`
and the catalogue page test.

### P3.2 — Streaming

No streaming exists anywhere (`grep generateContentStream` → no hits). Every run
is a blocking call with one DB write at the end, so users watch a spinner for the
entire run. For a chat product this is the most visible weakness in the system.

Stream tokens into the message row and subscribe from the client.

**Done.** Convex queries are already reactive, so streaming is: patch the partial
reply into the message row and every subscribed client re-renders. No new
transport, no server-sent events, and all three chat surfaces (assistant page,
agentic testing, public widget) get it from the one change.

- `streamVertexContentWithRetry` (`convex/vertexProviderService.ts`) wraps
  `generateContentStream` and returns a response shaped like the blocking one, so
  the objective loop is otherwise unchanged. It will not retry once a fragment
  has been delivered — a retry would replay the answer and duplicate what the
  reader already saw. `withProviderRetry` gained a `shouldRetry` veto for this.
- `convex/streamingService.ts` holds the flush policy as pure functions: write at
  most every 250ms or once 120 characters are pending. Writing per token would
  turn one answer into hundreds of transactions fanned out to every subscriber.
- The message row is created on the *first* fragment, not at run start. The chat
  surfaces infer "assistant is thinking" from the last message being the user's,
  so an empty row up front would swap the thinking indicator for a blank bubble
  while the model warms up.
- Each model turn's text replaces the previous turn's, so tool-call narration
  ("let me look that up") does not sit in front of the answer that follows it.
- Every exit — success, budget stop, provider failure — closes the row. A reply
  left marked as streaming shows a caret against an answer that is never coming.
- A run killed outright cannot close its own row, so `getStreamPresentation`
  treats a reply older than 10 minutes as stalled and the UI says so.
  `useStreamPresentation` resolves that on a tick: reading the clock during
  render is impure and would never re-evaluate.

Covered by `convex/streamingService.test.ts`, `convex/agentRuntime.test.ts` (the
mock streams in fragments, so the flush path is genuinely exercised),
`src/hooks/useStreamPresentation.test.ts` and the chat component tests. The
runtime tests were verified to fail when the per-turn reset and the
close-on-failure paths are removed.

**Not done:** the sound in the public widget now waits for the reply to finish
rather than firing on the first token, but auto-scroll still fires on every
flush. That is the desired behaviour for streaming text and was left alone.

### P3.3 — Durable, resumable, cancellable runs — DONE 2026-07-25

All four defects are fixed. The shape of the change: the objective loop was one
long-lived action holding everything in memory, and it is now a loop that keeps
its place in the database and can be entered by any action — which is what makes
cancellation, resumption and approval all work, since each is a variation on
"stop here and possibly carry on later".

**Cancellation was cosmetic.** `cancelRun` writes CANCELLED, a FINAL step and a
reason, then returns; it has no way to interrupt an action already running. The
loop never looked, so tools kept executing and the answer was still posted —
the operator was told the run had stopped while it carried on spending.

`readStopRequest` now polls the run's status at the top of every turn *and*
before each tool inside a batch. Per tool, not per turn: a batch may hold several
calls, and these are the operations with real side effects, so "cancelled" has to
mean nothing further ran. On a stop the runtime deliberately does **not** rewrite
the run's status — `cancelRun` already recorded the operator's reason and
overwriting it would replace their record with the runtime's. It does the part
`cancelRun` cannot: closes the streaming reply with that reason, and records the
spend incurred up to the stop.

**Resumption: `agentRunCheckpoints`.** One row per in-flight run holding the
provider transcript and the loop counters, replaced after every model turn. Two
things read it — a scheduled continuation, and the sweeper below.

- `continueAgentObjective` reloads the agent's configuration through the same
  `buildLoopExecutionContext` a fresh run uses, restores the transcript, and
  re-enters the same `executeObjectiveLoop`. The transcript is restored rather
  than rebuilt: RAG, memory lookup and document parsing are expensive and
  non-deterministic, and their results are already in it. Redoing them would pay
  twice and could ground the second half of a run in different knowledge from the
  first.
- Counters (tokens, tool calls, step index) travel in the checkpoint, and the
  runtime budget is measured from `run.startedAt`, not from the segment. A
  resumption that reset either would leave the run with no effective budget.
- A segment hands over after `AGENT_RUN_SEGMENT_BUDGET_MS` (3 minutes against a
  ~10 minute action ceiling), checked between turns only — mid-turn the
  transcript is not in a state the next segment could pick up. Never on a
  segment's first turn, or a run could bounce between segments without progress.
- The streamed reply's message id is carried across, so one answer stays one
  message however many segments produce it.
- Transcripts are trimmed from the front to fit a checkpoint. A tool interaction
  is two turns — a `model` turn carrying the calls and a `function` turn carrying
  the results — so trimming that exposed a leading `function` turn would leave an
  orphan the provider rejects. `trimConversationForCheckpoint` drops it with its
  partner.

**Recovery: `agent-run-stall-recovery`, every 2 minutes.** A killed action runs
no catch block, so before this a run stayed RUNNING for ever with its reply
marked as streaming. The sweeper revives a run from its checkpoint, and after
three attempts fails it properly — terminal step, run status, memory-usage
outcome, and the reply closed or posted. Written as a **mutation**, deliberately:
claiming a stale checkpoint must be atomic with scheduling the continuation, or
two overlapping sweeps could both revive a run and execute its tools twice. The
stall window is the action ceiling plus two minutes, for the same reason — a live
action holds no lock the sweeper can see, so the only thing preventing a
double-run is that the window outlasts any possible action.

**Approval now resumes.** `resumeApprovedToolCall` ran the tool, posted a fixed
sentence and marked the run finished; the model never saw the result, so an agent
that asked permission to look something up could not use what it found. The
approved call and its result are now appended to the checkpointed transcript and
the loop continues. Results of any calls that ran earlier in the same batch are
kept rather than discarded. A rejected run's checkpoint is deleted by
`decideApproval` — it parks in AWAITING_APPROVAL, which the sweeper ignores by
design, so nothing else would ever clear it.

**`agent.humanApprovalRequired` is wired.** It was stored on the agent and
offered in the admin UI while the runtime derived approval solely from tool
`sideEffectLevel`, so switching it on changed nothing. It now gates every call
including reads. A control that looks like a restriction and is not is worse than
no control.

**Verification.** 36 new tests (`convex/agentRunContinuationService.test.ts` for
the policy, `convex/agentRuntime.test.ts` for behaviour). Every one was confirmed
to fail against deliberately broken code — 14 separate mutations, including
removing each cancellation check individually, disabling the handover, letting
the sweeper claim without moving `updatedAt`, and reverting the approval feedback.

Two verification gaps were found and closed first rather than worked around:

- The tool fixture in `agentRuntime.test.ts` had no `inputSchema`. Without one
  `buildProviderToolDeclaration` skips the tool, the runtime cannot find its
  metadata, falls back to requiring super-admin and denies the call — so every
  test that believed it was exercising tool execution was exercising the denial
  path. Fixed; tools now genuinely execute under test.
- `src/quality-drift.test.ts` pinned the runtime's safety helpers by reading one
  exported function. Splitting the loop out would have silently emptied that
  guard. It now pins the whole run path — `runAgentObjective`,
  `continueAgentObjective`, `buildLoopExecutionContext` and
  `executeObjectiveLoop` — each to the helper it owns, so a resumed run cannot
  become a way around tool authorization. Confirmed to fail when `canExecuteTool`
  is removed from the loop.

**Deliberately not done:** if a model requests several tools in one turn and one
of them needs approval, the calls *after* it in that batch are dropped rather
than queued. The model can re-request them on the next turn, and this is already
better than the previous behaviour, which discarded the whole batch. Sequencing
multiple approvals within a single turn is not worth the complexity until a real
agent needs it.

**Historical note:** when this phase first ran, `npm run test:run` and
`npm run build` were blocked by `verify:env` unless Node was 22.13.x. The repo
has since moved to Node 24.18.0 / npm 11, and the checked-in `verify:env` gate
is now the current source of truth for the local baseline.

### P3.4 — Prompt caching — DONE 2026-07-25

Zero caching existed. The full system prompt, skills, RAG context and memory were
re-sent on every turn of every run — direct, recurring, avoidable spend.

**Scope correction (2026-07-25, Anthony):** the original prescription named two
providers. Sonae takes any model and an OpenRouter-style gateway is coming, so
caching had to be built as a platform capability rather than a Vertex feature.

**The design follows from how providers actually differ.** There are three
mechanisms and no common API:

| Style | Providers | How |
|---|---|---|
| `EXPLICIT_RESOURCE` | Google Vertex | Upload the prefix as a cache object, reference it by name, delete it |
| `INLINE_BREAKPOINTS` | Anthropic | Markers inside the request declare what is cacheable |
| `AUTOMATIC_PREFIX` | OpenAI, gateways passing through to it | The provider matches leading content itself; no API at all |

What they **do** share is the precondition: the unchanging part of the prompt
must come first and stay byte-identical between calls. That is the universal
mechanism, it costs nothing, and it is what `resolvePromptCacheSegments`
protects. An unrecognised provider therefore defaults to `AUTOMATIC_PREFIX`, not
`NONE` — automatic handling adds nothing to the request, so it is safe against a
provider that turns out not to cache, whereas `NONE` would silently opt a newly
added provider out of a discount it may well support.

**Delivered:**

- `convex/promptCacheService.ts` — the policy, pure and provider-neutral: which
  style a provider uses, where a request's stable prefix ends, and whether an
  explicit cache is worth building. The prefix boundary is never allowed to fall
  inside a tool exchange; a `model` turn carrying calls and the `function` turn
  answering them are one unit, and a prefix ending between them describes a
  request the model never made.
- `convex/aiCostService.ts` — `calculateModelCostGBP`, lifted out of
  `agentRuntime.ts` and taught about cached tokens. **`cachedInputCostBelow200k`
  and `cachedInputCostAbove200k` have been on the model record and collected by
  the admin model page all along, and nothing read them** — every cached token
  was billed internally at the full rate. An unset cached rate falls back to the
  standard rate rather than to zero: over-stating spend slightly is safe, while
  under-stating it would let a run pass a cost ceiling it had actually exceeded.
- `createVertexPromptCache` / `deleteVertexPromptCache` — the Google lifecycle.
  Both return quietly on failure. Providers reject caches for reasons that vary
  by model and change over time, and none of them is worth failing a run for.
- Runtime wiring: the cache is built at the *third* turn, never earlier. Creating
  one writes the whole prefix, so a run must have shown it is the long kind
  before it pays — most chat runs answer in a turn or two and never get there.
  Once built, the request carries only what follows the prefix, with the
  instruction and tools coming from the cache rather than being repeated.
- The cache name rides in the `agentRunCheckpoint`, so a run split across
  segments (P3.3) reuses one cache instead of rebuilding it per segment, which
  would have cancelled out the saving on exactly the runs worth caching.
- Released on every terminal path, and on the approval park — a person may take
  hours to decide and a cache lives for minutes.
- A cached request the provider rejects is retried once in full, but only while
  nothing has reached the reader. After that a retry would replay the answer from
  the start, which is the rule P3.2 already established for streaming.

**Verification.** 34 new tests across `promptCacheService.test.ts`,
`aiCostService.test.ts` and `agentRuntime.test.ts`, each confirmed to fail
against deliberately broken code (8 mutations: caching a one-turn run, creating a
cache but never using it, billing cached tokens at full rate, skipping each
release path, dropping the uncached retry, and having a continuation rebuild the
cache).

Two tests were found to be passing for the wrong reason and corrected:

- The cost tests initially asserted below-tier prices against above-tier token
  counts. They failed on first run, and the *tests* were wrong, not the code.
- "releases the cache when the run fails" was being satisfied by the in-loop
  uncached retry, so it never exercised the failure handler at all. It now fails
  *after* text has reached the reader — the one path the runtime must not retry —
  so the error genuinely escapes the loop.

**Deliberately not done:**

- **Anthropic `cache_control` is not implemented.** The style is declared and the
  policy routes to it, but the Anthropic adapter is text-only and cannot host an
  agent (see P3.7), so there is no code path to place breakpoints on. Writing it
  now would mean shipping an untestable, unreachable implementation. P3.7 fills
  this in against a working adapter.
- **No cross-run cache of the agent's system prompt.** Caching the per-agent
  configuration once and sharing it across every run of that agent is the larger
  prize for high-volume short chats, but it needs a cache registry with
  invalidation on agent edit, and getting that wrong serves a stale system prompt
  — a correctness bug, not a cost one. Worth doing once there is real traffic to
  measure against.
- **Nothing here proves a real provider accepts these requests.** The suite mocks
  the provider, so it verifies every decision the runtime makes and none of the
  wire contract. That is why every caching path fails open: the first contact
  with a real Vertex project can only cost the discount, never the run.

### P3.5 — Real tools, honestly counted — PARTIALLY DONE 2026-07-25

**Done: the honesty work, idempotency, one real connector, and the OAuth surface.
Outstanding: `http.request` and `workflow.task.create`.**

**Stub calls no longer report success.** The five stub handlers returned a
payload that said "not implemented" — and returned it *normally*, so the runtime
recorded `SUCCESS` and the run log showed a green tick against a tool that did
nothing. A log full of ticks could be a log full of nothing happening, and the
eval grading that run could not tell a working connector from a declared one.

- `NOT_IMPLEMENTED` is now a tool-call status of its own. Not SUCCESS, which is a
  lie, and not FAILED, which says the connector is broken when in fact it does
  not exist. The step timeline still shows FAILED: the run genuinely did not do
  what it set out to, and softening that is the same flattery as the tick was.
- Declared-but-unbuilt connectors report themselves instead of throwing. A typo
  in a tool's configuration and an entire missing integration used to produce the
  identical unhelpful error; they need different answers, so a mapping nothing
  declares is still a thrown error.
- The model is told plainly — "not available on this platform, do not retry" —
  so it says so rather than reporting the job done.
- The stub *handlers* were deleted rather than kept as a list. Executability is
  now derived from one thing: does an implementation exist. A parallel list of
  "these are stubs" would drift, and drift between catalogue and code is exactly
  what this item exists to remove.

**The marketplace tells the truth.** 21 connectors were presented identically
while 2 could execute, so an admin could install one, assign it to an agent and
discover it was hollow only by reading a run log afterwards. Each card now
carries an availability badge derived from the handler registry.

**`idempotencyKey` is real.** It was accepted by the write tool, written into the
audit log, and never read — so a retried write applied twice. That was survivable
while a run was one uninterruptible action. It is not now: **P3.3 made runs
resumable**, so a tool call genuinely can be re-issued after a crash or an
approval, and the protection had to become real before the thing it protects
against became possible. `agentToolIdempotency` records completed calls and
replays the original result, scoped per company — keys come from a model, so two
tenants colliding on one is plausible, and a collision that silently discarded a
write would be a cross-tenant data fault rather than a performance quirk. Purged
hourly.

A test named "updates company overview *idempotently*" was asserting the
opposite — two audit entries for one repeated request. It had been passing for
months while documenting behaviour the code never had.

**`notification.send` genuinely sends.** Email through the Resend path the
workflow engine already uses. The security question this turns on is *who an
agent may email*: an agent that can reach arbitrary addresses is a phishing tool,
and "email this to X" is an instruction an attacker can plant in a retrieved
document. The rule is therefore the tightest one that leaves the connector
useful — **recipients must already have an account in the same tenant** — and it
needs no configuration to hold, because a policy that has to be switched on is a
policy that will be left off. A request naming even one outside address is
refused whole rather than partially delivered; a partial send would report
success while hiding the attempted breach. Bodies are escaped rather than
trusted as markup, an actor is required for the audit trail, and a deployment
with no email configured says so instead of logging a simulated dispatch and
reporting success.

**OAuth stops pretending.** `beginConnectorOAuth` minted a link to
`/api/connectors/oauth/authorize` — a route that does not exist — so "Connect"
gave the administrator a 404 and left the connector showing PENDING for ever.
Both OAuth mutations now refuse with an explanation.

This is a gate, not a deletion. `isConnectorOAuthAvailable()` is a single
function returning `false`; the connection records, state handling, scope
validation and secret-reference guards are all intact, so building the real flow
flips one switch. The guards moved to `convex/connectorSecretPolicy.ts` and are
tested directly — a security check that only runs inside a disabled feature is
one nobody notices breaking.

**The real blocker for OAuth is not the routes.** The platform stores `tokenRef`,
a pointer into a vault, and there is no vault integration. A real flow returns an
actual access and refresh token that must be stored encrypted somewhere. That
decision — encrypt at rest in Convex, or integrate a secret manager — gates
everything else and should be made deliberately. Registering OAuth apps with each
provider is Anthony's to do.

**The connector design was missing its other half.** `toolConnectorSecretRefs`
stores a `providerRef` — a pointer to a credential rather than the credential
itself, which is the right design and is enforced when an administrator types
it. But **nothing anywhere read that pointer back.** A connector could be fully
"configured" and still have no way to obtain the address or key it needed. That,
not the absence of an implementation, is why `http.request` could not be
written, and it is half of what blocks OAuth.

`convex/connectorSecretResolver.ts` resolves references from the deployment
environment, namespaced under `CONNECTOR_SECRET_` so a reference called `path`
can never read `PATH`. Deliberately the modest option: no new dependency, no key
management, no decision about encryption at rest — and being read-only it does
not foreclose a real secret manager later. Resolution is all-or-nothing, because
a connector holding an address but no credential would issue an unauthenticated
request to a customer's system and hand the agent a 401 to reason about.

**`http.request` executes, with the host outside the agent's reach.** The safety
argument is structural rather than a list of filters: the connector's contract
gives the model a `method` and a `path` and nothing else, while the base URL
comes from a super-admin's configuration. An injected "fetch
http://169.254.169.254" has no field to express itself in. `httpConnectorPolicy`
defends what remains — a path trying to escape its base, and a base URL that
should never have been configured:

- https only, no embedded credentials, and refusal of loopback, RFC1918,
  carrier-grade NAT, link-local (the cloud metadata endpoint, the classic SSRF
  prize), IPv6 loopback and unique-local, and `.local` / `.internal` names.
- A leading `/` in the agent's path resolves relative to the base, not the host
  root, so a connector scoped to `/v1/` cannot be walked to `/admin`. Absolute
  URLs, protocol-relative `//host`, other schemes and backslashes are refused.
  Containment is checked three ways over; removing any one still fails safe, and
  removing all three fails the tests.
- Method allowlist, JSON-only bodies, a 15s timeout, a 128KB response cap, and
  **redirects are refused rather than followed** — following one would let the
  endpoint forward the request, and the connector's credential with it,
  somewhere the administrator never scoped.
- A non-2xx is returned to the agent as information, not raised as a transport
  failure: a 404 means the record is not there, which is an answer.

**Known limit, stated rather than papered over:** a hostname that resolves to a
private address cannot be caught here, because the runtime has no DNS resolution
before the request. The residual risk needs an attacker who already holds
super-admin, at which point this connector is not the weakest thing available to
them.

**Still outstanding:**

- **`workflow.task.create`** — declared as "create a governed task", and there is
  no task table and no screen to see one. Implementing it as written would give
  an agent a write-only table nobody can read, which is a hollow capability of
  exactly the kind this item removes. It needs a data model and a surface first,
  which is a feature in its own right rather than a connector.

So the count is **four connectors that genuinely execute** — `knowledge.search`,
`company.overview.update`, `notification.send` and `http.request` — against the
plan's target of five. Recording four honestly is more in keeping with this item
than building a task-management feature to reach a number.

### P3.5 (original scope note) — Real tools, honestly counted

21 connectors are defined across `convex/toolConnectorDefinitions.ts` with
schemas, scopes, and side-effect levels. **Two are executable**
(`knowledge.search`, `company.overview.update`). Five return
`buildConnectorStubResult` — which is recorded as `toolStatus: "SUCCESS"`, so a
stub call looks like a working call in the run log. The remaining ~22 throw
`"Unknown or unimplemented tool handler mapping."`

- Fix the status first: a stub must record as `NOT_IMPLEMENTED`, never SUCCESS.
- Hide unimplemented connectors from the admin marketplace, or badge them
  clearly as unavailable.
- Then implement OAuth properly and ship **5 genuinely working connectors**
  rather than 21 declared ones. Today `buildOAuthAuthorizationUrl`
  (`convex/aiTools.ts:234`) points at `/api/connectors/oauth/authorize`, a route
  that **does not exist** — `src/app/api/` contains only e2e fixtures. There is
  no token exchange, no refresh, no revocation, and no token storage; the admin
  supplies `tokenRef` as an arbitrary string.
- `idempotencyKey` on the one write tool (`convex/aiToolWriteTools.ts:26`) is
  accepted and logged but never used for dedup. Make it real or drop it.

### P3.6 — Make the readiness gate mean something — DONE 2026-07-25

**An agent could go live having never produced a token.** Activation required
`successfulSmokeEvalRunCount > 0`, and a `CONTRACT_ONLY` smoke eval checks
configuration — rubric non-empty, tool mappings bound, blocked-actions JSON
parses — then writes a *synthetic successful run*. No model was called. The gate
was satisfied by the agent being wired up correctly, which is not the question
anyone was asking.

- Readiness now counts `successfulModelGradedEvalCount` separately, and both the
  activation gate and the `smokeEval` readiness check use it. A configuration
  check is still useful and still reported; it just no longer counts as evidence
  the agent works.
- The blocked message says which is which, because an admin who has run a
  configuration check and been refused needs to know the difference.

**Evals now run the agent that ships.** The model-graded path sent the system
prompt and the objective straight to the provider — no tools, memories, skills,
retrieval, history or budgets. An agent whose whole job is looking things up was
being evaluated with its ability to look things up removed. It now opens a
throwaway thread and goes through `runAgentObjective`, the same path a real
conversation takes, and grades what the agent actually said.

Eval threads carry `purpose: "EVAL"` and are filtered out of `getThreads`. They
keep the triggering admin's user id deliberately — tool authorisation resolves
from the thread's user, so an eval run under no user would be denied every tool
the agent relies on and would grade an agent unable to do its job.

**Grading is independent.** The same model generated the answer and marked it.
Models favour their own output, and one that has just confidently asserted
something wrong is the least likely thing to notice — so the grade measured
self-consistency, not correctness. A different enabled model now grades.
A deployment with only one enabled model cannot do this, and the result says so
rather than letting a weaker grade read like a full one.

`agentEvalGradingService` also holds `combineGradeSamples` for N-sample runs,
which requires *every* sample to pass: this decides whether an agent goes live,
and one that passes two times in three fails one conversation in three.

**An unreadable grade fails.** `parseGradeVerdict` requires `pass === true`
exactly — a grader replying `"true"` or `1` has not answered the contract, and
guessing its intent is how a wrong agent ships.

**Verification.** 13 policy tests plus end-to-end runtime tests, each confirmed
to fail against broken code. Six existing tests were asserting the old behaviour
— that a configuration check makes an agent ready — and were updated to require
a model-graded run before activation, which is a stronger assertion than the one
they replaced.

**Deliberately not done:** the `CONTRACT_ONLY` literal was not renamed. It is
stored inside run metadata JSON on existing records, so renaming it means a
migration for cosmetic gain; every user-facing label now calls it a
configuration check instead. N-sample runs are implemented in the service but
not yet wired to a per-fixture sample count in the UI.

### P3.6 (original scope note) — Make the readiness gate mean something

The default smoke eval is `CONTRACT_ONLY` (`convex/agentEvalFixtures.ts:1020`):
it asserts the rubric string is non-empty, that tool mappings are bound and
active, and that blocked-actions JSON parses — then writes a synthetic
successful run. **An agent can pass the activation gate having never produced a
token.**

- Rename it to what it is: a configuration check, not an eval.
- Require at least one model-graded eval before activation.
- The model-graded path (`convex/agentEvalGradingActions.ts:96`) does make real
  inference, but it bypasses the runtime — no tools, no memories, no skills, no
  RAG, no history — so it does not test the agent that ships. Route it through
  the real runtime.
- Use an independent grader model; it currently self-grades with `targetModel`.
- Add N-sample runs and a regression baseline.

### P3.7 — Provider breadth — IN PROGRESS 2026-07-25

**Done: the Anthropic translation layer. Outstanding: wiring the runtime to it,
the streaming transport, and the stale model constants.**

**Why a translation layer is the whole problem.** The two providers do not model
a tool exchange the same way. Google puts a tool request and its result in
separate turns, matched by position and name, with `functionCall` /
`functionResponse` parts. Anthropic puts the request in an `assistant` turn as a
`tool_use` block and the result in the **user** turn that follows as a
`tool_result` block, matched by an explicit `tool_use_id`. The system prompt is
a top-level field, not a turn.

A mistake here does not throw. It produces a subtly wrong conversation — the
model answering as though a tool returned nothing, or handed one tool's result
under another tool's name. That is why `convex/anthropicMessageService.ts` is
pure and carries 22 tests, each confirmed to fail against broken code (results
pointed at the wrong turn, results sent as an assistant turn, a refusal read as
a normal ending, empty turns emitted).

Covered: role mapping, tool-use id derivation, parallel calls in one turn, error
results flagged with `is_error`, unserialisable results reported rather than
sent as the string "undefined", tool declarations (including the missing-schema
case, which Anthropic rejects for the *whole* request), and `cache_control`
breakpoint placement — the `INLINE_BREAKPOINTS` style P3.4 declared, placed on
the last tool and the last system block, which covers the whole prefix given
Anthropic renders tools → system → messages, and stays inside the four-breakpoint
limit.

`interpretAnthropicStopReason` separates the outcomes the runtime must not
conflate — in particular `refusal`, which carries no usable answer and would
otherwise post an empty reply as though the agent had finished.

**Still outstanding:**

**Runtime wiring — done.** The objective loop no longer speaks Google. It builds
a neutral `AgentTurnRequest` (`convex/agentProviderTypes.ts`) and calls
`provider.streamTurn`, where `provider` comes from
`getAgentProviderAdapter(modelConfig.providerKey)`. Everything provider-shaped —
how a tool request is represented, how a stream is framed, how caching is
expressed — sits behind that one call, because those are exactly what the two
providers disagree about.

`convex/googleAgentProvider.ts` is deliberately a thin pass-through over
`streamVertexContentWithRetry`. That matters beyond tidiness: the runtime's 47
existing behavioural tests mock that function, so routing the loop through the
adapter left them exercising the same path — **and they passed unchanged**,
which is the evidence the seam changed no behaviour. Same technique that proved
the P3.3 restructure.

`convex/anthropicAgentProvider.ts` assembles the request from the translation
service, streams it through the accumulator, and returns the same normalised
shape. It marks its own `cache_control` breakpoints rather than using
`cacheName`, because Anthropic caches inline while Google caches by resource.

**An unsupported provider now fails by name.** Previously the runtime resolved
every model through `getGoogleVertexProviderModelId`, so a valid catalogue entry
on another provider failed with an error saying the runtime "requires a Google
Vertex model" — true, but it sent whoever debugged it looking at Vertex for a
model that had nothing to do with it. The registry now refuses with the
offending provider named, before any provider call. Covered by a test that fails
if the loop hardcodes a provider instead of reading the model's own.

**The transcript stays in Google's `Content` shape** and each adapter translates
on the way out. Rewriting the stored shape would invalidate every in-flight
checkpoint on deploy, for no gain the adapters do not already provide.

**Still outstanding:**

- **The prompt-cache lifecycle is now behind the adapter.** `createPromptCache`
  and `releasePromptCache` are optional methods on `AgentProviderAdapter` —
  optional because they only apply to the explicit-resource style. A provider
  that caches by inline breakpoints has nothing to create, omits them, and the
  loop simply never has a cache name to pass back. The objective loop no longer
  constructs a Vertex client at all. Verified by mutation: making the Google
  adapter refuse to create a cache fails five of the caching tests, so they now
  genuinely cover the adapter path rather than a direct call.

  `agentRuntime.ts` nevertheless stays on the quality-drift guard's provider-SDK
  allowlist, for reasons unrelated to the objective loop: the RAG embedding call,
  `runTriggeredAgentObjective`, and `executeAgentNode` still use Vertex directly.
  Those are separate execution paths and bringing them behind the seam is its own
  piece of work.
- **No end-to-end run against a real Anthropic key.** The adapter is exercised by
  unit tests over its translation and streaming services; nothing has yet
  confirmed the assembled request is accepted by the live API. Expect the first
  real call to surface small shape corrections.
- **A provider failure before the run row exists is invisible in run history.**
  `buildLoopExecutionContext` resolves the adapter before `createRunInternal`, so
  an unsupported-provider failure is recorded in `agentLogs` and shown to the
  reader, but leaves no FAILED run for an admin to find. Creating the run earlier
  would fix it.
**Streaming transport — done.** `convex/anthropicStreamService.ts` parses the SSE
stream the raw-HTTP adapter receives (the repo has no `@anthropic-ai/sdk`). Two
failure modes drove the design, and both are invisible to a naive test:

- **Framing.** A network chunk boundary has nothing to do with a line boundary,
  so `data: {"text":"hel` and `lo"}` can arrive separately. A parser that treats
  each chunk independently drops that event — under load only, never in a test
  that feeds whole messages. `parseSseChunk` returns the unterminated tail for
  the caller to prepend to the next chunk.
- **Tool arguments arrive as fragments.** A call's name comes on
  `content_block_start` and its arguments as a series of `input_json_delta`
  pieces that are not valid JSON until the block closes. The accumulator emits a
  call only on `content_block_stop`, and keys pending blocks by index so
  interleaved parallel calls cannot have their arguments spliced together.

Text is handed to `onText` as it arrives — and awaited, because the runtime's
handler writes to the database and un-awaited writes would land out of order.
Cached input tokens are captured so P3.4's pricing applies to this provider too.
16 tests, each confirmed to fail against broken code.

**Stale model constants — partly addressed.** `resolveExecutionModel` and
`getDefaultModelId` now prefer *any enabled catalogue model* before reaching the
compiled-in `SYSTEM_FAILSAFE_MODEL_ID`, so on any deployment with a single
enabled model that constant is unreachable. The catalogue is the source of truth
for what a deployment can actually call; reaching past it means running a model
nobody configured, pinned to whatever generation was current when the constant
was written — which fails as an opaque provider 404 rather than as "no model
configured".

**Deliberately not finished:** the constant still exists, and the correct end
state is to delete it and fail with "configure and enable an AI model" when the
catalogue is empty. That changes agent *creation* as well as execution and
touches several fixtures, so it is a deliberate decision rather than a side
effect of this work. `GOOGLE_VERTEX_EMBEDDING_MODEL_ID` is untouched for a
different reason: it seeds the catalogue (a legitimate place for a literal), it
is stale, and picking a replacement requires verifying current Google embedding
model IDs — guessing one would be exactly the error this item warns against.

**Note for whoever continues:** the Anthropic API surface moved significantly in
2025–26 and training priors are stale. `budget_tokens` is rejected on current
models (use `thinking: {type: "adaptive"}` with `output_config.effort`);
sampling parameters are rejected on the current Opus tier; assistant prefills
return 400. Read the bundled Claude API reference skill before writing adapter
code rather than working from memory.

Only Google Vertex is wired to the agent runtime — every path calls
`getGoogleVertexProviderModelId`, which throws for other providers
(`convex/aiModelService.ts:107`). The Anthropic adapter is real but text-only
(no tool use, no streaming, no caching) and cannot host an agent.

Bring Anthropic to parity through the existing `aiProviderRegistry` abstraction.
Also refresh two stale defaults, both of which pin a superseded generation:
`SYSTEM_FAILSAFE_MODEL_ID` and the default embedding model constant, in
`convex/aiModelService.ts`. Note the repo's own quality-drift guard forbids
hardcoded provider model ID literals outside the model catalogue, so route these
through the catalogue rather than replacing one literal with another.

### P3.8 — Test the runtime

There is **no `agentRuntime.test.ts`**. The 1,406-line runtime is untested, while
`agentRuns.test.ts` (bookkeeping) is 1,519 lines. The audit trail is heavily
tested; the agent is not. Every item in Phase 3 lands with tests in this file.

---

## Phase 4 — Framework Leverage

Only start this once Phases 0–2 are done.

### P4.1 — Entity generator — DONE 2026-07-25

`scripts/generate-entity.mjs` scaffolds a domain entity: the Convex module, its
test, the admin page, and both locale files.

**The design point is what it refuses to skip.** Adding an entity by hand touches
eight to ten files, and the parts dropped under time pressure are always the same
three — the tenant guard, the second locale, and the test. A generator that
emitted those as TODOs would make the problem worse, not better: it would produce
the omission at scale, with the appearance of having been done properly. So the
generated code passes the repo's existing gates as written:

- Functions declared with the tenant builders, because `authzEnforcement.test.ts`
  fails CI for a raw `query`/`mutation` and its allowlist may only shrink.
- Reads scoped by company **at the index**, not filtered afterwards — a filter is
  something a later edit can drop with nothing failing.
- `get` throws for another tenant's record rather than returning null, so a
  probing caller cannot distinguish "not yours" from "does not exist".
- Both locales. A key present in one and missing from the other renders as the
  raw key to whoever is reading in the other language.
- A real test asserting the tenant boundary in both directions — read and write —
  plus the unauthenticated case.

**Verified by generating one.** A `supplier` entity was generated into the real
repo, wired to the schema, and run through `convex codegen`, `typecheck`, the
generated test, `authzEnforcement.test.ts`, the quality-drift guard and lint —
then removed. That pass caught three template defects that reading the code would
not have: two admin primitives whose prop contracts had been guessed
(`AdminTableEmptyRow` requires an `icon`; `AdminConfirmationModal` takes children
and `isSubmitting`, not a `description` and `isBusy`), and a generated test with
implicit `any` parameters, which this repo forbids.

`src/generate-entity.test.ts` keeps it honest: 12 tests running the generator
into a sandbox, asserting the properties above. Each was confirmed to fail
against a deliberately broken generator — emitting raw builders, dropping the
index scope, writing only English.

**Deliberately manual, and told to the developer rather than attempted:**

- **The schema table.** `convex/schema.ts` encodes ordering and relationships a
  generator cannot infer, and a bad automated edit there is expensive. The
  command prints the exact block to paste.
- **The sidebar link.** Printed with the `navKey` to use, so the new page can be
  hidden by navigation profile (P2.4).
- **Pluralisation is naive** and the chosen table name is printed back. "supplys"
  is obvious at a glance and a one-character fix; silently choosing a table name
  the developer did not expect is not.

**Not done:** create and edit forms. The generated page lists, searches and
deletes; adding a record still needs a form written against `AdminModalForm`.
Generating a form means generating per-field validation and error handling, which
is where a scaffold stops saving time and starts producing code people fight.

### P4.1 (original scope note) — Entity generator

Adding a domain entity today touches 8–10 files, two of which
(`SidebarNavigation.tsx`, `messages/*.json`) are shared choke points every
feature must edit. There is no generator — `scripts/` holds five files, none of
them scaffolding. The one oversized Convex module this note originally pointed
at seeded *database rows*, not code, and has since been deleted along with the
feature it belonged to.

Build `scripts/generate-entity.mjs` emitting: schema table + indexes, tenant-safe
Convex CRUD, an `AdminTable`-based page, i18n keys in both locales, and a test
skeleton. The admin primitives in `src/app/(dashboard)/admin/_components/` are
already good and adopted by 64 files — this generates against them.

### P4.2 — Reduce the hand-rolled admin surface — DONE 2026-07-25

`src/hooks/useAdminAction.ts` now runs every admin write: 49 call sites across 19
pages, replacing a hand-written try/catch at each one.

**It was never a tidying exercise.** All 49 copies got the same three things
wrong, and each is invisible while the happy path works:

1. They printed the raw `error.message`, which on a Convex failure is an
   envelope — request ID, the placeholder `Server Error`, the author's sentence,
   and in development a stack fragment. The reader saw either nothing useful or
   our file paths.
2. None of the 19 pages called `reportError`, so every failed admin action was
   invisible to error tracking. The user saw a modal; we saw nothing.
3. Double submits went through. A `useState` busy flag cannot guard them — two
   clicks in one tick both read the pre-update value. The guard has to be a ref.

The hook returns an outcome rather than throwing, so a caller can still close a
modal on success and keep it open on failure without a catch block of its own —
rethrowing would have recreated the 49 duplicates.

**One runner per page, except where two would print the same sentence twice.**
Pages that show a failure inline in more than one place — the API-keys create
form and its revoke modal, the company-evals batch banner and its archive modal,
the agent-memory review banner and its delete modal — take a second runner, so a
failure in one surface cannot leak into the other. Where the two surfaces are
modals that are never open together and already clear on open (company skills),
one runner is correct and a second would be noise.

**Client-side validation deliberately stays out of the runner.** Two sites keep
their own state: a `FileReader` failure in `agents/skills/page.tsx` and the
evidence-JSON parse in the company eval run page. Neither is a server call, and
routing them through the runner would report a stray comma to error tracking as
an incident. Those pages render `validationError || action.error`.

**Two latent bugs fell out of the migration**, both the same shape: an `await` on
a mutation with no catch at all, inside a confirmation modal. Archiving a company
skill and archiving an eval case each left the modal open and said nothing when
the write failed. They now report, and say so. A third site — deleting an agent
memory — had been missed by the earlier pass on that page and was still printing
the raw envelope.

**`getErrorMessage` was the wider version of defect 1.** It is used by ~26 more
files and returned `error.message` untouched, so those admin forms were printing
the whole Convex envelope too. It now delegates to `toUserFacingMessage`, which
moved from `ToastContext.tsx` into `src/lib/errors.ts` so non-React callers can
use it; the old import path still works. Six tests cover it, four of them new,
each confirmed to fail against the pre-fix implementation.

**Not done:** the list/detail/form extraction below. The 1,400-line pages are
still hand-written. What was fixed is the defect they all shared, which is the
part that was hurting users; collapsing their layout is a separate, larger job
and is the natural next tranche.

### P4.2 (original scope note) — Reduce the hand-rolled admin surface

113 admin pages, ~40,000 LOC, against 27 shared components. The largest are 1,400
–1,500 lines each (`AppKitsClient.tsx`, `agents/[id]/evals/page.tsx`,
`agents/[id]/runs/page.tsx`). Every new entity means another one by hand, and
that is the recurring per-product cost.

Extract the repeated list/detail/form patterns into data-driven components. Target
the top 5 offenders first.

### P4.3 — Template branch — DONE 2026-07-25

`npm run template:build -- --out <dir>` writes the platform template: the repo
with `properties`, `salesReports`, `arcade` and `movement` removed. 2,428 files
kept, 615 dropped.

**Generated, not tagged by hand.** A `template/main` cut by deleting folders and
committing answers the question once. Six months on, nobody can say what the
template is missing or how to refresh it, so it is refreshed by redoing the same
deletions from memory. Generating it from `template.manifest.json` makes the
split a reviewable list of paths and table names, makes it testable in the normal
suite, and makes refreshing it one command — so it can happen every release.

**Two removal mechanisms.** Whole files cover almost everything, and cannot
half-work. Fence markers — `template:remove:start <vertical>` …
`template:remove:end` — cover the seven shared files a vertical unavoidably
touches: the schema, the HTTP router, the workflow engine, the sidebar, and three
test files. A marker sits where the code is, so it is visible to whoever edits
that code next, and the boundary test checks every marker is balanced and names a
declared vertical. `package.json` takes neither: 12 dependencies and 104 scripts
go by name.

**Verified by building it and running its own gate**, which is the only check
that means anything here: the generated template typechecks clean, passes 1,223
tests across 219 files, lints with 0 errors (89 warnings, down from 103), and
builds — 130 routes against the product's 150, and 5.4MB of static output against
12MB, the difference being three.js and MediaPipe leaving with the demo.

**Four couplings only the build could find**, each a platform file quietly
depending on a vertical:

1. `convex/workflowEngine.ts` allowlisted `properties`, `arcadeScores` and
   `salesReports` as workflow-queryable tables, and had a whole `case
   "properties"` block querying by Rightmove ID.
2. `convex/bola.test.ts` proved tenant isolation using the properties table. The
   template would have dropped the proof along with the vertical, so the three
   vertical BOLA tests moved to `convex/bola.verticals.test.ts` — same tests,
   split by owner, leaving the platform's two behind.
3. Two workflow tests used properties rows as their fixtures.
4. The sidebar characterisation snapshots record the whole navigation tree, which
   the template legitimately changes. Copying the product's snapshot would fail
   on the one difference that is the point of the exercise, so the build drops the
   file and the template's first test run records its own.

**The template ships the machinery with an empty manifest.** It keeps the build
script and the boundary test, but declares no verticals — it has none. The guard
reads green from day one and starts working the moment the new product grows
something that will not belong in the next template.

**Deliberately not done: the script does not touch git.** It writes a directory
and prints the `git init`/`tag` commands. Force-pushing a shared `template/main`
is not something a build script should be able to do by accident.

**Also not done: `convex codegen` is not run.** It contacts the Convex API for
deployment details, which a fresh template directory has none of. The generated
API index is pruned directly instead — two mechanical lines per module — and the
operator's first `npx convex dev` confirms it matches.

**Kept on purpose:** the white-label navigation profiles still name `properties`
and `arcade` in their `hide` lists. Hiding a nav item that does not exist is a
no-op, and a product that later adds its own properties module inherits the same
decision.

---

## Cross-Cutting — Documentation Truth Pass

`PRODUCT.md` describes a system that does not exist. Confirmed overclaims:

| Claim | Reality |
|---|---|
| "Turing-complete workflow orchestrator", "thousands of computational loops" | Cycles are rejected client-side only; `WORKFLOWS.md` itself says loops are prevented |
| "natively executes Javascript V8 Sandboxes" | No interpreter, no isolate, no `eval`. The code node is a `{{a.b.c}}` string replacer (`convex/workflowRuntimeService.ts:363`). Worse, the AI copilot at `convex/ai.ts:545` instructs users to write JS for it, producing silently wrong workflows |
| "militarized data isolation", "no possibility of cross-contamination" | Convention-only enforcement; see P2.1 |
| "Zero-Trust Security Framework ... relies strictly on CORS allowedDomains" | No CORS check exists in that path; see P0.1 |
| Connector marketplace with OAuth lifecycle | 2 of 29 handlers executable; OAuth authorize route does not exist |
| "top 50 highly relevant internal data points" | ~32 chunks, selected in tier order with scores discarded; see P0.4 |
| RAG "Files up to 50MB" | Ingestion embeds one chunk per API call sequentially; a large document times out before finishing |

**Action:** rewrite `PRODUCT.md` to describe what exists, with a clearly separated
roadmap section for what is planned. Note that the internal developer docs
(`docs/developer/agentic-starter-framework-overview.md`) are already honest —
they say "stubs" and "scaffolding" where `PRODUCT.md` says "marketplace". Bring
the product doc up to the standard of the developer docs.

**Priority:** do this in Phase 0. It is the cheapest item in the plan and it is
the one with commercial exposure.

---

## Work Queue

Ordered. Sizes are working days for one developer.

| # | Item | Phase | Size | Blocks |
|---|---|---|---|---|
| 1 | Documentation truth pass | X | 0.5 | — |
| 2 | P0.7 deploy gate green + scheduled audit | 0 | 1 | all releases |
| 3 | P0.2 swarm log BOLA | 0 | 0.5 | — |
| 4 | P0.1 widget origin enforcement | 0 | 1.5 | — |
| 5 | P0.4 RAG score-ordered merge | 0 | 1 | — |
| 6 | P0.3 iterator fan-out | 0 | 1 | — |
| 7 | P0.8 parallel tool calls | 0 | 0.5 | — |
| 8 | P0.6 personal email → settings | 0 | 0.25 | — |
| 9 | P0.5 rename connector test | 0 | 0.25 | — |
| 10 | P1.1 error tracking + health | 1 | 1.5 | — |
| 11 | P1.2 error boundaries + toasts | 1 | 1 | — |
| 12 | P1.3 SHA tags + rollback | 1 | 0.5 | — |
| 13 | P1.4 migrations | 1 | 2 | P2.1 backfills |
| 14 | P1.6 platform-only coverage gate | 1 | 1 | — |
| 15 | P2.1 tenant builders + enumeration test | 2 | 4 | P4.1 |
| 16 | P2.2 fence movement deps/scripts | 2 | 1 | — |
| 17 | P2.3 brand extraction | 2 | 1.5 | P4.3 |
| 18 | P2.4 nav as config | 2 | 1 | P4.1 |
| 19 | P3.1 per-agent limits + budget placement | 3 | 1 | P3.3 |
| 20 | P3.8 runtime test harness | 3 | 1.5 | all of P3 |
| 21 | P3.2 streaming | 3 | 3 | — |
| 22 | P3.3 durable/resumable/cancellable | 3 | 4 | — |
| 23 | P3.4 prompt caching | 3 | 1.5 | — |
| 24 | P3.5 stub status + 5 real connectors | 3 | 5 | — |
| 25 | P3.6 real readiness gate | 3 | 2 | — |
| 26 | P3.7 Anthropic parity + model refresh | 3 | 2 | — |
| 27 | P4.1 entity generator | 4 | 3 | — |
| 28 | P4.2 data-driven admin | 4 | 5 | — |
| 29 | P4.3 template branch | 4 | 1 | — |

**Phase 0: ~6.5 days. Phase 1: ~6 days. Phase 2: ~7.5 days.**
(29 items / ~49 days after P1.5 backups was removed from scope.)
Phases 0–2 (~3 weeks) take the platform from "works because Anthony is careful"
to "defensible to a client and safe for another developer to extend". Phases 3–4
are the capability and leverage investment on top.

---

## Verification

Standard gate for every item in this plan:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For Convex schema or API changes, run `npx convex codegen`. For frontend changes,
start the app and inspect the changed route in the in-app browser.

**Additional gates introduced by this plan:**
- `npm audit --audit-level=high` exits 0 (P0.7).
- The API enumeration test passes with a non-growing allowlist (P2.1).
- Platform-only coverage does not regress (P1.6).

## Non-Goals

- Deleting, moving, or refactoring the movement demo.
- Rewriting the Convex data access layer. It is the strongest part of the
  codebase — 254 indexes, 5 `.collect()` calls backend-wide, 415 `.take()`,
  70 `.paginate()`, no N+1 patterns found. Leave it alone.
- Loosening type strictness. Zero `any` and zero `as any` across 240k LOC with
  `no-explicit-any` as a lint error is a genuine asset; extend it
  (`noUncheckedIndexedAccess`) rather than relaxing it.
- Replacing Convex, Next, or the auth stack.
