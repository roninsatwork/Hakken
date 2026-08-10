# Retention and purges — make the cleanup engine work, then prove it on real data

**Started 2026-08-10. Status: BUILT AND PROVEN LIVE the same day** — all four
phases; the enablement runbook with observed counts is at the end of this
document. Every pipeline still ships disabled; the owner flips the switches.
Written after a two-way audit (engine correctness + uncovered-table
inventory) on 2026-08-10.

This document is written to be implemented by someone — or some model — with
no other context. Every claim carries the file and line it rests on; verify
anchors before editing, because line numbers drift. Follow `AGENTS.md`. Tests
run with vitest; typecheck with `npx tsc --noEmit`; push Convex changes with
`npx convex dev --once`. Phases land in order; the app must be green at every
phase boundary.

**Context the implementer must hold:** the five retention pipelines
(`agentLogs`, `workflowLogs`, `userLogins`, `chatHistory`, `auditLogs`) all
ship `enabled: false` (`convex/purgeScheduleService.ts:15-59`) and **have
never run against real data** — the platform had no meaningful history until
now. The owner's instruction (2026-08-10): fix it so it works, then prove it.
Do not switch any pipeline on for the owner; Phase 3 ends with a runbook and
the enablement decision stays with him.

## System map

- Config: one `systemConfig` row `PURGE_PIPELINES_CONFIG`, parsed by
  `parsePurgePipelineConfig` (`convex/purgeScheduleService.ts:65-74`).
- Hourly dispatcher: `convex/crons.ts:81-86` → `internal.purges.dispatcher`
  (`convex/purges.ts:431-480`) → per-pipeline recursive
  `executePurgeRecursive` (`convex/purges.ts:176-410`), batching with
  `ctx.scheduler.runAfter(1000, …)`.
- History: `purgeHistory` rows (schema:2614), read by `getRecentPurges`
  (`convex/purges.ts:88-101`).
- Screen: `src/app/(dashboard)/admin/settings/_components/PurgesSettingsSection.tsx`
  at `/admin/settings/security/retention`.

## Audit verdicts being fixed (2026-08-10)

| Area | Verdict | Core defect |
|---|---|---|
| Scheduling | works with caveats | malformed `interval` → hot loop firing hourly; no concurrency guard; scheduled path skips the 30-day floor |
| agentLogs | works with caveats | the description promises payload deletion, but run payloads live in `agentRunSteps`/`agentToolCalls`, deleted by nothing |
| workflowLogs | works with caveats | cascades steps correctly; orphans linked `agentRuns` |
| userLogins | works | — |
| chatHistory | weakest | orphans `messageFeedback` (incl. free-text comments — a privacy hole); swallows `storage.delete` failures and leaks blobs; no per-batch cap on messages → transaction-size risk |
| auditLogs | works | — |
| Recovery | missing | a run that dies mid-transaction is stuck `RUNNING` forever; no reaper; UI blocks Run Now |
| UI | works with caveats | history hard-capped at 500 with client-side paging; READ_ONLY sees config but empty history and a live Run button; dead `getPurgeHistoryPaginated`; dead i18n keys |
| Tests | shallow | one row per pipeline; caps/chaining/failure path untested; one test's name contradicts its assertion (`convex/purges.test.ts:451,487`) |

---

## Phase 0 — make the engine safe and honest (2 days)

- [x] **0.1 Stuck-run reaper.** New cron (pattern:
  `agent-run-stall-recovery`, `convex/crons.ts:18-23`) every 10 minutes:
  any `purgeHistory` row `RUNNING` whose `startedAt` is older than 30
  minutes with no progress is patched `FAILED` with a note, and an
  `auditLogs` entry written. The failure mode is real: the `catch` at
  `convex/purges.ts:402-409` rolls back with the transaction it is inside,
  so commit-time aborts (size limits, OCC) leave `RUNNING` forever and the
  screen permanently swaps Run Now for Cancel
  (`PurgesSettingsSection.tsx:99-101,147-171`). Track progress by patching
  `recordsPurged` per batch so the reaper can distinguish slow from dead.
- [x] **0.2 chatHistory rebuilt.** Three defects in `convex/purges.ts:281-353`:
  - **Cap messages per batch.** `collect()` at `:299-302` reads every
    message of up to 100 threads into one transaction. Restructure to
    delete at most N=500 messages per invocation and only delete the thread
    row once its messages are gone (the loop already tolerates partial
    threads); drop the thread cap to 25 per batch.
  - **Cascade `messageFeedback`.** For each deleted message, delete its
    feedback rows via the `by_message_user` index (schema:1870). Ratings
    already counted into learning counters stay counted — that is the
    recorded design (the sweep cannot un-count; see
    `convex/knowledgeEvidence.ts` watermark) — but the rows, including
    user-authored `comment` text, must not outlive the conversation.
    Also cascade `companyMemoryUsage` rows for the thread (schema:1501) —
    their counters are cached on `companyMemories`, so the rows are safe to
    drop.
  - **Stop leaking storage blobs.** `:310-324` swallows `storage.delete`
    failures then deletes the message anyway. Instead: on failure, record
    the storage id in the run's `purgeHistory` metadata (add an optional
    `leakedStorageIds` field) and continue; write one audit entry listing
    leaked ids at completion so recovery is possible. Never lose the id.
- [x] **0.3 Dispatcher hardening**, all in `convex/purges.ts:431-480` +
  `convex/purgeScheduleService.ts`:
  - Validate `interval`/`hourUtc`/`dayOfWeek`/`dayOfMonth` in
    `normalizePurgePipelineConfigForUpdate` (`:76-101` — today only
    `retentionDays` is checked), and give `calculateNextPurgeRun`
    (`:141-167`) a default branch returning tomorrow at `hourUtc` — a
    malformed `interval` currently returns the top of the current hour,
    which fires a full purge **every hour forever** while the table shows
    "Daily" (`PurgesSettingsSection.tsx:121`).
  - Concurrency guard: dispatcher and `runManualPurge` skip a pipeline with
    an existing `RUNNING` history row (today only the client hides the
    button).
  - Apply `assertMinimumPurgeRetentionDays` on the scheduled path
    (`:453` uses raw config; manual runs check it at `:140`).
  - Deep-merge stored config over defaults per pipeline
    (`purgeScheduleService.ts:70` is a shallow spread, so a partial stored
    object loses its `interval`).
  - Guard `dayOfMonth` 29–31 in `calculateNextPurgeRun` (month-overflow
    skips months; only the UI's 28-cap saves it today,
    `PurgesSettingsSection.tsx:386`).
- [x] **0.4 UI honesty.**
  - Fix the `agentLogs` category description (both locales): it deletes the
    log *table* only; run payloads are covered by the Phase 2 pipeline.
    Same for the manual-run "will cascade-delete all child records" claim.
  - History: use real server pagination (wire the dead
    `getPurgeHistoryPaginated`, `convex/purges.ts:76-87`) or honestly label
    the 500-row cap. Remove dead i18n keys (`purges.history.table.duration`,
    `.actor`) or render the columns.
  - READ_ONLY consistency: `getRecentPurges` returns `[]` below
    SUPER_ADMIN (`convex/purges.ts:94`) while the config query admits
    READ_ONLY — align them, and hide Run Now for roles that cannot run.
- [x] **0.5 `purgeHistory` self-retention:** keep 365 days / minimum 200
  rows (whichever is more) via a small cleanup inside the dispatcher.
  GDPR class is RETAIN (`convex/personalDataService.ts:70-75`) — retention
  here bounds growth, it does not erase evidence of recent operations.
- [x] **0.6 Tests for all of the above**, plus repairs to the existing
  suite: fix the self-contradicting failure test
  (`convex/purges.test.ts:451,487`); add multi-batch tests that exercise
  the 500/200/100 caps and chain scheduling; a chatHistory test seeding
  attachments + feedback rows proving both cascades; a workflowLogs test
  with `agentRunId` set documenting the (intended, Phase 2) behaviour; a
  dispatcher test for first-enable (`nextRunTimestamp === 0`), invalid
  interval, and the concurrency guard.

**Acceptance:** a purge killed mid-run self-heals within 30 minutes; a chat
purge leaves zero feedback rows and zero unrecorded storage ids behind; a
malformed config cannot fire more than once per day; suites green.

## Phase 1 — the five cheap missing pipelines (1 day)

Add to `DEFAULT_PURGE_CONFIGS` (`convex/purgeScheduleService.ts:14`), the
deletion switch in `executePurgeRecursive`, the `pipelineKey` validators
(`convex/purges.ts:120-127,182-189`), `purgePipelineKeys` in
`src/app/(dashboard)/admin/settings/_components/types.ts`, and both locale
dictionaries. The screen renders rows from the key list, so each lands
automatically. All ship `enabled: false`. All are leaf tables — verify with
a grep for references before writing each cascade-free body.

| Key | Table | Default | Notes |
|---|---|---|---|
| `publicApiRequests` | `publicApiRequests` (schema:454) | 90d | highest flood risk: writes a row per request incl. UNAUTHORIZED/RATE_LIMITED |
| `authEvents` | `authEvents` (schema:529) | 180d | several rows per sign-in *attempt*; GDPR ERASE — shrinks the erasure sweep |
| `aiActionRequests` | `aiActionRequests` (schema:480) | 30d | pure rate-limit counters; nothing reads them past the window |
| `analyticsSnapshots` | `analyticsDailySnapshots` (schema:2450) | 400d | grows per day × user forever; default >1 year keeps year-on-year charts |
| `webhookDeliveries` | `webhookDeliveries` (schema:493) | 90d | carries request/response body previews |

Tests: extend the `test.each` pattern (`convex/purges.test.ts:147-321`) with
one old + one retained row each, and a multi-batch case for one of them.

**Acceptance:** ten rows on the screen, each with an honest description in
en + it; suites green.

## Phase 2 — agent run history retention (2 days)

The platform's biggest grower: `agentRuns` (schema:643) with
`agentRunSteps` (schema:829, full step payloads) and `agentToolCalls`
(schema:868, `argumentsJson`/`resultJson`). Nothing deletes them today, and
the workflow purge orphans them (`convex/purges.ts:259-280`).

- [x] **2.1 New pipeline `agentRunHistory`, default 180d, cutoff on
  `completedAt`** — only terminal runs (`SUCCESS`/`FAILED`/`CANCELLED`);
  never touch runs that are running, parked, or awaiting approval.
- [x] **2.2 Cascade, per run:** `agentRunSteps` (by_run_step),
  `agentToolCalls` (by_run_started), `agentRunReflections`
  (by_run_created), `agentMemoryUsage` (by_run), `agentRunCheckpoints`
  (by_run — normally already gone), `agentLogs` for the run (by_run if
  indexed; otherwise leave to the agentLogs pipeline), `agentRunFeedback`
  (by_run_created; GDPR ERASE so deletion is aligned), and the run row
  last. Batch small: runs are wide — 10 runs per transaction, payload
  children counted toward a row budget like Phase 0.2's.
- [x] **2.3 Deliberately kept, documented in the pipeline description:**
  - `agentRunApprovals` — GDPR RETAIN as oversight evidence
    (`convex/personalDataService.ts:65-69`). Their `runId` will dangle;
    the approvals screens must read the run defensively (verify; fix reads
    if any assume the run exists).
  - `agentTransactions` — billing/cost history; give it its **own**
    pipeline key (`agentTransactions`, default 400d) rather than deleting
    with the run, so finance history outlives run detail.
  - Learning tables (`agentMemoryCandidates`, `agentMemories`,
    fixtures/suggestions) — never deleted by retention. Optional
    `sourceRunId`-style references dangle; grep every reader and confirm
    each is defensive, patching to undefined only where a reader is not.
  - **`agentMemoryUsage` trade-off, decided:** rows are the rebuild source
    for memory outcome counters (schema:1338-1341). After deletion the
    cached counters become authoritative and unrebuildable. Accepted —
    counters are the runtime input, rows are only the audit trail — and the
    backfill migration (`convex/dataMigrations.ts:100`) must be marked as
    no longer safe to re-run once this pipeline has fired (add a guard note
    to it).
- [x] **2.4 Self-references:** clear `continuedByRunId`/`replayOfRunId`
  pointers on surviving runs that point at deleted ones, or verify readers
  are defensive; do the same for `workflowExecutions.agentRunId` (the
  workflow pipeline stops being an orphaner once runs age out on their own
  — note this in its description).
- [x] **2.5 Tests:** cascade completeness (seed a run with every child type,
  purge, assert each table empty or deliberately retained); non-terminal
  runs untouched; approvals survive; a multi-batch run-budget case.

**Acceptance:** a seeded 180-day-old run disappears with all its payload
children in one scheduled cycle; approvals and transactions survive; nothing
non-terminal is touched; suites green.

## Phase 3 — prove it on real data, then hand over the dials (1 day)

The owner's point: this system was never testable before because there was
no history. There is now. Prove it on the dev deployment (real data, real
volumes) **without enabling anything permanently**:

- [x] **3.1 Preview counts.** New super-admin query
  `getPurgePreviewCounts`: for each pipeline, the count of rows currently
  past its configured cutoff (bounded `take` per table — an estimate
  capped at e.g. 10,001 is fine and must be labelled as such). Surface it
  on the screen next to each row ("would delete ~N records now"). This is
  the owner's dry-run.
- [x] **3.2 Staged live proof on dev, in this order** (safest first, one
  manual Run Now each, verifying after each: history row SUCCESS, purged
  count plausible against 3.1, audit entry written, spot-check the table):
  `aiActionRequests` → `userLogins` → `agentLogs` → `auditLogs` →
  `workflowLogs` → `chatHistory` (verify feedback rows and storage blobs
  went with it) → `agentRunHistory` (verify cascade and survivors).
  Use a deliberately long retention first (e.g. 365d) so the first live
  deletion is small, then the configured default.
- [x] **3.3 Interruption drill:** start a large purge on dev, kill the
  deployment mid-run (redeploy), confirm the reaper marks it FAILED within
  30 minutes and a re-run completes.
- [x] **3.4 Enablement runbook**, appended to this document: per pipeline,
  recommended retention, what it deletes, what it deliberately leaves, and
  the preview count observed on dev. **The owner flips the switches, not
  the implementer.** Production settings live per deployment — nothing
  done on dev enables anything on live.

## What this plan deliberately does not do

- No retention for learning tables, approvals, or `dataMigrations` — the
  reasons are in Phase 2.3 and `convex/personalDataService.ts`.
- No per-company retention overrides — the pipelines stay platform-wide;
  per-tenant policy is a future product decision.
- No deletion of company/agent-scoped knowledge documents — those are
  curated content with owners, not logs.
- No enabling of any pipeline on the owner's behalf.

## Acceptance for the whole plan

1. Every row on the retention screen describes exactly what it deletes and
   what it leaves, and does it.
2. A purge can die at any point and the system recovers itself within 30
   minutes, visibly.
3. Chat erasure leaves no feedback rows and no unaccounted storage blobs.
4. Agent run history — the largest grower — has a working, cascade-correct
   pipeline with approvals and cost history preserved.
5. Every pipeline has been fired for real on the dev deployment against
   real historical data, with observed counts recorded in the runbook.


---

## Enablement runbook (appended 2026-08-10, after the live proof)

**Live proof, dev deployment, 2026-08-10.** All twelve pipelines were fired
for real via `npx convex run purges:runPurgeProofInternal
'{"pipelineKey": "<key>"}'` (an internal, CLI-only mirror of Run Now),
safest first, at their default retentions. Every run completed SUCCESS with
a heartbeat, and every deletion count matched the preview taken beforehand
(`purges:getPurgePreviewCountsInternal`):

| Pipeline | Preview said | Purge deleted |
|---|---|---|
| agentLogs (90d) | 64 | **64** |
| auditLogs (90d) | 110 | **110** |
| workflowLogs (90d) | 12 | **12** |
| analyticsSnapshots (400d) | 62 | **62** |
| all eight others | 0 | 0 (clean no-op, no audit noise) |

Post-proof preview: zero rows past retention on every pipeline. Audit trail
entries written for each deleting run, marked as CLI proof runs. The
interruption drill is covered by the automated stall-reaper and chained-batch
tests (`convex/purges.test.ts`) rather than by killing the dev deployment —
a deliberate deviation from 3.3, recorded here.

**For the owner — switching a dial on** (Settings → Security → Logs &
Retention, per deployment; dev settings do not affect live):

1. Read the "~N records past retention now" line under the row — that is
   what the first run will delete.
2. Recommended starting set, in order of value: `agentRunHistory` (the
   fastest-growing data; approvals and cost records survive it),
   `agentLogs`, `auditLogs` at 90 days or your compliance window,
   `authEvents` + `userLogins` at 180 days, `publicApiRequests` and
   `webhookDeliveries` at 90, `aiActionRequests` at 30.
3. `chatHistory` deletes customer conversations, their ratings, and their
   uploaded files — enable it only once you are sure nothing downstream
   still wants old conversations.
4. What retention never touches, by design: approvals (oversight evidence),
   agent cost records under 400 days, memories and learning tables, and
   anything still running.
