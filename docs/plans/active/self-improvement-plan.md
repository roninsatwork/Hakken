# Self-improvement — close the four learning loops that are already half built

**Started 2026-08-09.** This document is written to be implemented by someone —
or some model — with no other context. Every claim below carries the file and
line it rests on; verify anchors before editing, because line numbers drift.
Follow the repo's working rules in `AGENTS.md`. Tests run with vitest
(`vitest.config.ts`); the end-to-end style to imitate is
`convex/agentRuntime.test.ts`, which drives the real runtime rather than
mocking it.

Sonae already has a real learning system: two memory tiers that reach every
prompt, a six-hourly sweep that proposes new company memories from live
conversations, a post-run candidate generator, a reflection taxonomy, and a
prompt-evolution path. Every one of those was built with a human approval gate,
on purpose, and this plan keeps that gate for anything that changes *what the
AI believes or says*.

What this plan changes is the part that was left unfinished: **four loops where
the signal is already collected and then thrown away.** Closing them is what
"self-improving" means here:

- the AI gets better **automatically** at *ranking and weighting* what it
  already knows (no human in that loop, because nothing new is ever believed);
- the AI gets better **with approval** at *acquiring* new memories, because the
  proposal queue finally fills itself from every failed run and from end-user
  feedback instead of waiting for an admin to press buttons.

Full autonomy — the AI writing to its own memory unattended — is Phase 5, a
separately-argued product decision with its own kill switch, and it originally
shipped **default off** behind the decision gate at the end of this document.

> **Decision taken, 2026-08-10.** Anthony was shown the middle path (auto-apply
> low-risk only, probation, expiry) and explicitly chose **fully automatic —
> no per-memory approvals**, in chat, twice. As built: every agent memory
> candidate and every company sweep suggestion applies immediately;
> `autonomousMemory` (default **true**) in `SELF_IMPROVEMENT_CONFIG` replaces
> the never-wired `autoApplyLowRisk` and is the platform-wide brake, toggleable
> on System Options. What remains of the gate: auto-saved memories carry
> `autoApplied: true`, render a "Saved by the AI" label on both memory screens,
> write an actor-less audit row marked `automatic`, and stay removable; an
> ALWAYS suggestion with no free ALWAYS slot stays PROPOSED because the cap is
> a product rule; safety screening, rejected-fingerprint suppression, and
> dedupe run unchanged before any save; rehearsal runs never reach any of it.
> Do not "restore" the approval queue as a drift fix — turning the switch off
> is the supported way back.

## As built, 2026-08-09

Phases 0–4 are implemented, tested (1,890 backend tests green, plus new
frontend suites), and verified in the running app: the Self-Improvement card
saves and persists on System Options, and the chat rating controls rate,
flip, and label against the real database. The
`2026-08-09-agent-memory-outcome-counters` backfill has been run on dev.
Departures from the spec above, each deliberate:

- **The chunk-prior cap is four head-adjacent rank gaps**
  (`4 * (1/(RRF_K+1) - 1/(RRF_K+2))`), not half a top contribution. RRF
  scores compress toward the tail, so a cap sized off the top *contribution*
  quietly dominated ordering below the head — the test that promised "a few
  positions, never a takeover" caught it vaulting seven places.
- **Evidence-sweep idempotency lives on the feedback row**
  (`messageFeedback.lastCountedRating` + a global `by_updated` index), not in
  watermark arithmetic alone — a watermark cannot see a rating flip on a row
  it already passed. The watermark (`systemConfig`,
  `KNOWLEDGE_EVIDENCE_SWEEP_WATERMARK`) only bounds the walk.
- **Run statuses are `SUCCESS`/`FAILED`/`CANCELLED`** — the plan's
  `COMPLETED` never existed. Reflection hooks FAILED and CANCELLED; SUCCESS
  keeps the direct candidate pass.
- **`createForRunInternal` always chains the candidate pass**, even with
  `autoReflection` off — candidates predate this plan and the switch must not
  take them down with it.
- **Ranking visibility** shipped as a "Track record" column on the agent
  memory screen (`getQualityForAgent` had no UI consumer to extend — the
  "dashboard" the plan assumed was a backend query only).
- **`companyMemories.lastFeedbackAt`** was added beside the two feedback
  counters so company-tier decay has a clock.
- **`messageFeedback` is classified in `personalDataService`** (ERASE, with
  its index) — the governance framework test enforces this for any new table
  holding a person link, which the plan had not anticipated.
- The Playwright spec (`e2e/user-chat-flow.spec.ts`, rating journey) is
  written but was not executed in the build session; it runs with the normal
  e2e suite.

---

## What is actually true today (verified 2026-08-09)

### The learning system exists and is deliberately human-gated

- `agentMemories` (`convex/schema.ts:1286`) and `companyMemories`
  (`convex/schema.ts:1352`) hold FACT/PREFERENCE/SUMMARY/INSTRUCTION memories
  with ALWAYS/WHEN_RELEVANT apply modes. ALWAYS memories are injected into the
  system instruction (`convex/aiPromptAssembly.ts:95-103`, `convex/ai.ts:264-286`,
  `convex/agentRuntime.ts:465-478`); WHEN_RELEVANT memories are searched per
  message (`convex/agentRuntime.ts:696-710`).
- The company sweep (`convex/companyMemorySuggestions.ts`, cron at
  `convex/crons.ts:63-68`) reads real conversations every six hours and writes
  `PROPOSED` rows only. Its file header (`:14-16`) is the design contract:
  *"Nothing here writes memory… a suggestion changes no answer until someone
  approves it."*
- Every terminal run already schedules the memory-candidate generator
  (`convex/agentRuns.ts:2136`), and the auto-apply gate
  (`convex/agentMemoryCandidates.ts:752`) is written so the scheduled path can
  never apply — only an admin passing `autoApplyLowRisk: true` through
  `generateForRun` (`:761`) can, and even then only LOW-risk FACT/SUMMARY
  (`shouldAutoApply`, `:504`).

None of that changes. The gate on *new beliefs* is load-bearing and stays.

### Loop 1 — outcome data is collected, scored, then ignored

`agentMemoryUsage` (`convex/schema.ts:1331`) stamps every consulted memory with
the run's outcome (`convex/agentRunStateService.ts:39-57`).
`getMemoryQualityScore` (`convex/agentMemories.ts:65-79`) already turns that
into a 0–1 quality score — **for an admin dashboard only**
(`convex/agentMemories.ts:204-215`, flags `UNUSED` and
`REVIEW_NEGATIVE_OUTCOMES`). Runtime ranking is purely positional:
`searchMemoryInternal` (`convex/agentMemories.ts:296-323`) and
`companyMemories.getRuntimeMemoriesInternal`
(`convex/companyMemories.ts:274-315`) rank by search-index order via
`rankScore(index, total)` (`convex/utils/memoryRetrieval.ts:68-71` —
`(total - index) / total`, so it is a 0–1 positional score).
`companyMemories.usageCount`/`lastUsedAt` are bumped on every use
(`convex/companyMemories.ts:330-360`) and read by nothing but a summary tile
(`:176`).

A memory that has sat in ten failed runs ranks exactly as it did on day one.

### Loop 2 — reflection exists and never fires

`agentRunReflections` (`convex/schema.ts:980-1026`) carries an 11-value failure
taxonomy plus four proposal fields (`proposedMemory`, `proposedPromptChange`,
`proposedToolChange`, `proposedEvalFixture`). Classification is deterministic
heuristics over the failed step and tool call
(`convex/agentRunReflections.ts:48-183`) — no model call, effectively free.
But `createForRun` is an `adminMutation` (`convex/agentRunReflections.ts:184`)
whose only caller is a button on the admin runs page
(`src/app/(dashboard)/admin/agents/[id]/runs/page.tsx:163`). No cron, no
scheduler, no post-run hook.

And because `getCandidateDrafts` (`convex/agentMemoryCandidates.ts:508-550`)
only produces drafts from **reflections or feedback** — both human-created
today — the generator that runs after every terminal run almost always finds
nothing. The queue stays empty not because runs teach nothing but because the
teacher is never asked.

### Loop 3 — end users have no voice

`agentRunFeedback` (`convex/schema.ts:949-978`) has ratings
POSITIVE/NEGATIVE/NEUTRAL and ten labels, but `upsertForRun` is an
`adminMutation` (`convex/agentRunFeedback.ts:50`) and the only UIs are the two
admin observability pages. There is no rating control anywhere in the end-user
chat, and chat messages are not agent runs, so today a chat rating has nowhere
to live.

### Loop 4 — retrieval never learns

`fuseRetrievalRankings` (`convex/knowledgeRetrievalService.ts:42-52`) is fixed
reciprocal-rank fusion: `score += 1/(RRF_K + rank + 1)` with `RRF_K = 60`
(`:24`), so a top-rank contribution is `1/61 ≈ 0.0164`. Yet every assistant
message already records which skills and chunks reached the model:
`messages.companyRuntimeEvidenceJson` (`convex/schema.ts:1783`, shape
`{version, skillIds, sourceIds}`) and which memories:
`messages.companyMemoryEvidenceJson` (`:1778`). The evidence trail needed to
learn "this chunk keeps producing good answers" exists end to end; nothing
reads it back.

### Confirmed absent (searched, zero matches)

No AI tool can write memory or knowledge (no remember/save tool in
`convex/aiTools.ts`, `aiToolWriteTools.ts`, `aiToolExecutionService.ts`). No
A/B prompts, bandits, or fine-tuning data collection anywhere in `convex/`.
`agentMemories.userId` is written (`convex/agentMemories.ts:400-402`) but never
read — per-user personalisation stays out of scope.

---

## Design commitments (binding on every phase)

1. **The human gate on new beliefs stays.** Nothing in Phases 1–4 adds, edits,
   or deletes a memory, rule, prompt, or knowledge document without a person
   approving it. Autonomous learning is confined to *ordering and weighting*
   content a human already approved.
2. **Every automatic adjustment is visible and reversible.** Ranking inputs are
   stored, surfaced in admin, and each phase's flag restores prior behaviour
   byte-for-byte.
3. **Learning signals are tenant-scoped.** No cross-company pooling of
   feedback, quality scores, or retrieval priors, ever. Every new table carries
   `companyId` and every query filters on it.
4. **Feedback is data, not instruction.** End-user feedback text is never
   injected into any prompt. It feeds the candidate generator and sweep, which
   safety-screen their own output (`convex/companyMemorySuggestions.ts:187-270`).
5. **UI signals follow the platform accessibility rule**: blue/gold ramp with
   text labels, never green-vs-red alone (the ramp is specified in
   `docs/plans/active/email-design-system-plan.md`).
6. **Kill switches per phase**, stored in the existing `systemConfig` key-value
   table (`convex/schema.ts:389-394`; read/write/audit pattern at
   `convex/agentRuns.ts:2424-2492`).

### The config object (build first, used by every phase)

New file `convex/selfImprovementConfig.ts`:

```ts
export type SelfImprovementConfig = {
  autoReflection: boolean;        // Phase 1, default true
  outcomeWeightedRanking: boolean;// Phase 2, default true
  endUserFeedback: boolean;       // Phase 3, default true
  retrievalPriors: boolean;       // Phase 4, default true
  autoApplyLowRisk: boolean;      // Phase 5, default false — HARD default
};
export const SELF_IMPROVEMENT_CONFIG_KEY = "SELF_IMPROVEMENT_CONFIG";
```

- `getSelfImprovementConfig(ctx)` reads the `systemConfig` row
  `by_key = SELF_IMPROVEMENT_CONFIG_KEY`, parses JSON, and fills **every**
  missing field with its default — an absent row means all defaults. Malformed
  JSON means all defaults plus a console warning, never a throw: config must
  not be able to take the assistant down.
- An `adminMutation` `updateSelfImprovementConfig` writes it with an
  `auditLogs` row, following the pattern at `convex/agentRuns.ts:2448-2470`.
- Admin surface: a "Self-improvement" card on the existing System Options
  screen (see `docs/plans/active/admin-ux-plan.md` for where that lives), five
  labelled toggles, `autoApplyLowRisk` visually separated with its warning
  copy. Do not build a new page.

---

## Phase 1 — reflection fires on every failed run, and the queue fills itself

**Goal:** a run that fails while nobody is watching still teaches the platform
something by the time anyone looks.

### 1.1 Extract the classifier into a shared service

- New file `convex/agentRunReflectionService.ts`. Move the classification body
  currently inlined in `convex/agentRunReflections.ts:48-183` into an exported
  `buildReflectionDraft(ctx, runId)` that loads the run, its steps and tool
  calls, and returns either `null` (run not terminal-failed, or nothing to say)
  or the full insert object for `agentRunReflections` minus `createdBy`.
- `createForRun` (`convex/agentRunReflections.ts:184`) keeps its exact external
  behaviour — same args, same return, same audit row — but calls the service.
  Its existing duplicate guard (one reflection per run) moves into the service
  so every caller shares it: query `agentRunReflections` via the
  `by_run_created` index (`convex/schema.ts:1023`); if a row exists for this
  `runId`, return its id without writing.

### 1.2 Add the internal entry point and the post-run chain

- New `createForRunInternal` (`internalMutation`) in
  `convex/agentRunReflections.ts`: args `{ runId: v.id("agentRuns") }`. Reads
  the config; if `autoReflection` is false, it does **not** classify, but it
  **always** finishes by scheduling
  `internal.agentMemoryCandidates.generateForRunInternal({ runId })` — the
  candidate pass must run exactly as often as it does today regardless of the
  flag. `createdBy` stays unset: the audit convention refuses to name an admin
  who was not involved (`convex/agentMemoryCandidates.ts:781-785` states it),
  and that stays true here.
- In `updateRunStatusInternal` (`convex/agentRuns.ts:2106-2139`), inside the
  `isTerminalRunStatus` block: when `args.status` is `FAILED` or `CANCELLED`,
  replace the direct schedule of `generateForRunInternal` at `:2136` with a
  schedule of `createForRunInternal`; when `COMPLETED`, keep scheduling
  `generateForRunInternal` directly, unchanged. **Chain, do not race**: the
  candidate generator must see the fresh reflection, which is why reflection
  schedules it rather than both being `runAfter(0)` siblings.
- No model call is added anywhere in this phase. Reflection stays
  deterministic and effectively free, which is what makes running it on every
  failure safe for cost.

### 1.3 Noise controls

- One reflection per run (the shared guard above).
- Run-sourced candidates already dedupe against queue and approved memories and
  respect rejected fingerprints (`convex/agentMemoryCandidates.ts` — verify the
  suppressors before touching). Add the sweep's back-pressure rule
  (`convex/companyMemorySuggestions.ts:148-178` stops at 10 queued) to the
  run-sourced path: if 10+ `PROPOSED` candidates already exist for the agent,
  `generateForRunInternal` writes nothing and logs nothing louder than a debug
  line.

### 1.4 Tests (write first)

In `convex/agentRunReflections.test.ts` (extend) and
`convex/agentRuntime.test.ts` (extend, real-engine style):

- `unattended failed run produces one reflection and, when the taxonomy
  proposes one, one PROPOSED candidate` — drive a run to FAILED through the
  runtime with no admin call; assert the reflection row, its `createdBy` is
  unset, and the candidate exists.
- `completed run produces no reflection` and still produces exactly one
  candidate-generation pass (i.e. current behaviour is untouched).
- `second terminal transition does not double-write` — retry storms are real.
- `autoReflection=false skips classification but candidate generation still
  runs`.
- All existing `createForRun` button-path tests pass unchanged.

**Definition of done:** a failing run with zero human interaction yields a
reflection and (when applicable) a queued memory candidate; flag off restores
today's behaviour exactly; no new model spend.

---

## Phase 2 — memory ranking learns from outcomes (first autonomous behaviour)

**Goal:** memories that keep helping rise; memories tied to failures sink —
no human in the loop, and no memory ever invented, hidden, or destroyed.

### 2.1 Denormalise outcome counters (no per-search fan-out)

Ranking must not fan out one usage-table query per candidate memory on every
message. Add to `agentMemories` (`convex/schema.ts:1286`):

```ts
successCount: v.optional(v.number()),
failureCount: v.optional(v.number()),
cancelledCount: v.optional(v.number()),
lastOutcomeAt: v.optional(v.number()),
```

All optional (existing rows have none; treat absent as 0).
`updateMemoryUsageOutcomeForRun` (`convex/agentRunStateService.ts:39-57`)
already touches every consulted memory's usage rows at terminal status — in the
same pass, increment the counter matching the outcome on the memory row itself
and set `lastOutcomeAt`. The `agentMemoryUsage` rows remain the ground truth;
the counters are a cache of them, and a one-off internal backfill mutation
(`convex/migrations/` pattern — see `dataMigrations`, `convex/schema.ts:2130`)
rebuilds counters from usage rows for existing memories.

Company tier: `companyMemories` already has `usageCount`/`lastUsedAt`
(`convex/companyMemories.ts:330-360` bumps them). Add
`positiveFeedbackCount` / `negativeFeedbackCount` (optional numbers) now, wired
to real data in Phase 3.4 — the chat path has no run outcome, so end-user
sentiment *is* its outcome signal. Until Phase 3 lands, company-tier ranking
uses recency only (see 2.3).

### 2.2 Move the quality score to shared code

Move `getMemoryQualityScore` (`convex/agentMemories.ts:65-79`) into
`convex/utils/memoryRetrieval.ts` as exported `memoryQualityScore(args)`,
same signature and maths, with one change carried out of the dashboard: the
recency reference is passed in (`now: number`) instead of calling `Date.now()`
inside, so tests control it. The dashboard (`convex/agentMemories.ts:204`)
imports it; behaviour there is unchanged.

Add alongside it:

```ts
export function blendedMemoryRank(args: {
  positionalScore: number;   // rankScore(index, total), already 0..1
  quality: number;           // memoryQualityScore(...), 0..1
  hasOutcomeHistory: boolean;
}): number {
  const quality = args.hasOutcomeHistory ? args.quality : 0.5; // neutral cold start
  return 0.7 * args.positionalScore + 0.3 * quality;
}
```

The weights are constants, named and exported (`MEMORY_RANK_TEXT_WEIGHT = 0.7`,
`MEMORY_RANK_QUALITY_WEIGHT = 0.3`). Text relevance stays dominant by
construction: 70/30 means quality can move a memory past a neighbour but never
past the whole list.

Decay on negative evidence, so a demoted memory can recover: when computing
quality for ranking, if `lastOutcomeAt` is more than 30 days before `now`,
regress the quality value halfway toward 0.5; more than 90 days, use 0.5
outright. (Implement inside a `qualityForRanking(...)` wrapper next to
`blendedMemoryRank`, not by touching `memoryQualityScore` — the dashboard
should keep showing the undecayed truth.)

### 2.3 Apply the blend at the two runtime ranking points

- `searchMemoryInternal` (`convex/agentMemories.ts:296-323`): after the search
  index returns and filters keep their current order, compute
  `blendedMemoryRank` per memory from its counters, **stable-sort descending by
  the blended score**, and report the blended score as the runtime score where
  `rankScore` is reported today (`:323`). Read the config once at the top of
  the handler; when `outcomeWeightedRanking` is false, skip the sort and score
  exactly as today.
- `companyMemories.getRuntimeMemoriesInternal`
  (`convex/companyMemories.ts:274-315`): same blend; until Phase 3.4 populates
  the feedback counters, its quality input is recency-only (a memory unused for
  90+ days drifts to 0.5-with-stale-penalty, matching the dashboard's stale
  rule) — which makes the flag a no-op-ish reorder at first and starts really
  moving once feedback flows. That is intended sequencing, not an oversight.
- `getRuntimeAgentMemories` (`convex/agentMemories.ts:283`, the ALWAYS fetch)
  is **not** touched: ALWAYS memories are injected unconditionally by design,
  and a quality score must not silently un-approve what a human approved.
  Low-quality ALWAYS memories keep surfacing through the existing
  `REVIEW_NEGATIVE_OUTCOMES` admin flag — a person decides.

**Floors, not exclusion:** the blend reorders; it never filters. No memory is
absent from results because of its score, and every currently-passing
relevance filter stays exactly where it is.

### 2.4 Admin visibility

The agent memory dashboard already shows quality and flags
(`convex/agentMemories.ts:204-215`). Add the blended runtime score and the
counter values to the same rows so an admin can see *why* a memory moved.
Signal colours blue/gold with text labels, per commitment 5.

### 2.5 Tests

New `convex/utils/memoryRetrieval.test.ts` cases (pure functions, exhaustive):
cold start is neutral; 30/90-day decay boundaries; weights sum to 1; blended
order is stable for equal scores. In `convex/agentMemories.test.ts` /
`agentRuntime.test.ts`: two textually-equal memories, one with repeated FAILED
outcomes, healthy one ranks first; flag off reproduces today's ordering
byte-for-byte; ALWAYS injection unaffected by any counter state; counters
increment once per run at terminal status and survive the backfill. Eval
fixtures for behaviour-level checks go through the AI Checks machinery — read
`docs/plans/active/ai-checks-plan.md` before writing them.

**Definition of done:** outcome history reorders WHEN_RELEVANT retrieval on
both tiers behind the flag; nothing is ever excluded by score; dashboards
explain every move; flag off is bit-identical to today.

---

## Phase 3 — end users get a voice, and it feeds the learning loops

**Goal:** the people actually using the assistant become the main source of
learning signal, without their feedback ever directly changing behaviour.

### 3.1 Schema

New table in `convex/schema.ts` (place after `messages`):

```ts
messageFeedback: defineTable({
  messageId: v.id("messages"),
  threadId: v.id("threads"),
  companyId: v.optional(v.id("companies")),
  userId: v.id("users"),
  rating: v.union(v.literal("POSITIVE"), v.literal("NEGATIVE")),
  labels: v.array(v.union(
    v.literal("GREAT_ANSWER"),
    v.literal("INCORRECT"),
    v.literal("MISSED_CONTEXT"),
    v.literal("UNHELPFUL")
  )),
  comment: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_message_user", ["messageId", "userId"])
  .index("by_thread_created", ["threadId", "createdAt"])
  .index("by_company_created", ["companyId", "createdAt"])
  .index("by_user_created", ["userId", "createdAt"]),
```

No NEUTRAL (a thumbs UI has two states), and a deliberately smaller label set
than `agentRunFeedback` — end users are not operators; `WRONG_TOOL` and friends
mean nothing to them.

Add to `agentRunFeedback` (`convex/schema.ts:949`):
`source: v.optional(v.union(v.literal("ADMIN"), v.literal("END_USER")))` —
absent means ADMIN (every existing row is one).

### 3.2 Writers

- New `convex/messageFeedback.ts`, `upsertForMessage` as a **tenant** mutation
  (see `convex/tenantFunctions.ts` for the guard constructors — pick the
  authenticated-user tier, not admin). Guards, in order, each a thrown error:
  message exists; `message.role === "assistant"`; message's thread exists and
  `thread`'s owner is the caller (or caller is an ADMIN of the same
  `companyId`); `message.companyId` matches the caller's company. Upsert via
  `by_message_user` — one row per user per message, rating changeable,
  `updatedAt` bumped; mirror the audit-row shape of
  `convex/agentRunFeedback.ts:83-110`. `comment` is length-capped (500 chars)
  and treated as untrusted text everywhere it is rendered.
- Rate cap: max 20 counted rows per user per day via `by_user_created`; past
  the cap the mutation still succeeds (the user is not punished) but the row is
  written with `labels: []` and skipped by every consumer below — implement as
  a `countsTowardLearning: v.optional(v.boolean())` field set at write time,
  so consumers filter on one flag instead of re-deriving the cap.
- End-user run feedback (widget/agent surfaces where a `runId` exists): add
  `upsertForRunAsEndUser` beside the admin one in
  `convex/agentRunFeedback.ts`, tenant-guarded to runs whose thread/session the
  caller owns, writing `source: "END_USER"`, restricted to the four end-user
  labels above. Anonymous widget visitors (no `userId`) are **out of scope**
  this phase — note it in the file header rather than inventing a session
  identity here.

### 3.3 UI

In the chat surface (`src/ui/components/chat`): a feedback row on assistant
messages, visible once `isStreaming` is no longer set
(`convex/schema.ts:1797`). Two controls with text labels — "Helpful" /
"Not right" — blue/gold active states, never green/red. "Not right" opens an
optional one-tap label picker (the three negative labels) plus optional
comment. One interaction, no modal, no interruption of the conversation.
Selection state must be visible on revisit (query by `by_message_user`).
Hide the row entirely when `endUserFeedback` is off in config.

### 3.4 Feed the loops (this is the point of the phase)

- **Sweep prioritisation:** in `convex/companyMemorySuggestions.ts:148-178`,
  before filling the 40-message window chronologically, first pull the user
  messages of threads that received NEGATIVE `messageFeedback` since the
  watermark (via `by_company_created`), then fill the remainder as today. Pass
  the *labels* (never the free-text comment) alongside those messages as
  context for what to look for.
- **Candidate branches:** `getCandidateDrafts`
  (`convex/agentMemoryCandidates.ts:508-550`) already converts POSITIVE run
  feedback and `MISSED_CONTEXT` into drafts. Verify END_USER-sourced
  `agentRunFeedback` rows flow through unchanged (they will — the branches
  read rating and labels, not source), and add a test proving it.
- **Memory evidence:** when feedback lands on a message that carries
  `companyMemoryEvidenceJson` (`convex/schema.ts:1778`), increment
  `positiveFeedbackCount`/`negativeFeedbackCount` (from 2.1) on each cited
  company memory. Idempotent per (user, message): a rating *change* decrements
  the old side and increments the new. Do this in the mutation, inline — it is
  a bounded handful of patches.
- **Chunk evidence** is Phase 4's job; the mutation does not touch chunks.

### 3.5 Tests

`convex/messageFeedback.test.ts`: every guard rejects (cross-tenant, wrong
role, user message, foreign thread); upsert is one row per user per message;
rating flip adjusts memory counters exactly once; cap row is written but
excluded from counters and sweep; comment length enforced.
`companyMemorySuggestions.test.ts`: negative-feedback threads enter the window
first; comments never appear in the model prompt (assert on the built prompt).
UI: a Playwright spec (`e2e/`) covering rate-a-message and revisit-state.

**Definition of done:** a signed-in user can rate any assistant message in
their own threads, exactly once, changeable, cross-tenant impossible at the
mutation layer; negative threads demonstrably reach the next sweep first;
memory counters move; admin observability shows END_USER rows labelled.

---

## Phase 4 — retrieval learns which knowledge produces good answers

**Goal:** the knowledge search stops treating every chunk as forever equal.
Built last because Phase 3's signal feeds it.

### 4.1 Evidence aggregation (batch, never inline)

New table:

```ts
knowledgeChunkStats: defineTable({
  companyId: v.id("companies"),
  chunkId: v.id("knowledgeChunks"),
  positiveEvidence: v.number(),
  negativeEvidence: v.number(),
  lastEvidenceAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_company_chunk", ["companyId", "chunkId"])
  .index("by_company_updated", ["companyId", "updatedAt"]),
```

A new cron (hourly, added to `convex/crons.ts` with a comment matching the
file's style) walks `messageFeedback` rows created since a watermark stored in
`systemConfig` key `"KNOWLEDGE_EVIDENCE_SWEEP_WATERMARK"` (same
read-and-advance shape as the company sweep's watermark —
`convex/companyMemorySweeps` at `convex/schema.ts:1474` is the reference).
For each counted feedback row whose message has `companyRuntimeEvidenceJson`,
parse it (shape `{version, skillIds, sourceIds}` — `convex/schema.ts:1779-1783`),
and increment positive/negative evidence for each cited chunk. Malformed or
version-unknown JSON is skipped and counted in the sweep's log line, never
thrown on. Rating flips are absorbed by the watermark walking `updatedAt`
order — process a row at most once per updatedAt value (store
`lastProcessedUpdatedAt`, strictly-greater filter).

### 4.2 The bounded prior in fusion

`fuseRetrievalRankings` (`convex/knowledgeRetrievalService.ts:42-52`) gains an
optional argument: `priors?: Map<IdType, number>`; the fused score becomes
`rrfScore + (priors?.get(id) ?? 0)`. The prior for a chunk is computed in a new
exported pure function:

```ts
// RRF top-rank contribution is 1/(RRF_K+1) ≈ 0.0164. The prior is capped at
// half of that, so history can move a chunk a few positions but can never
// outrank genuine textual relevance.
export const CHUNK_PRIOR_CAP = 0.5 / (RRF_K + 1);
export const CHUNK_PRIOR_SMOOTHING = 5;
export function chunkPrior(args: {
  positiveEvidence: number;
  negativeEvidence: number;
  lastEvidenceAt: number;
  now: number;
}): number {
  if (args.now - args.lastEvidenceAt > 90 * 24 * 60 * 60 * 1000) return 0; // decay to neutral
  const total = args.positiveEvidence + args.negativeEvidence;
  if (total === 0) return 0;
  const ratio = (args.positiveEvidence - args.negativeEvidence) /
                (total + CHUNK_PRIOR_SMOOTHING);
  return ratio * CHUNK_PRIOR_CAP; // in [-CAP, +CAP]
}
```

The retrieval call site (the fusion consumer in `convex/ai.ts:290-352` and the
agent-side equivalent) batch-loads stats for the candidate chunk ids via
`by_company_chunk` **after** the searches return (candidates are ~100, so this
is one indexed get per candidate at most — measure, and if it shows up in
latency, load only the top 3× budget). When `retrievalPriors` is off in
config, pass no priors; the function is then byte-identical to today.

Floors, not exclusion, again: the prior reorders; every relevance filter and
budget rule (`convex/ai.ts:290-352`, 32k budget, 30% thread reservation) stays
untouched. A chunk with only negative evidence still appears when it is the
only relevant source.

### 4.3 Admin visibility

On the knowledge screens, show per-document rollups of chunk evidence
(positive/negative counts, last evidence date) so "why does this document keep
winning" has an answer. Blue/gold, text labels.

### 4.4 Tests

Pure-function tests for `chunkPrior` (cap, smoothing, decay boundary, zero
cases). Sweep tests: watermark advances exactly once per row-version; rating
flip nets to the flipped side; malformed evidence JSON skipped not thrown.
Fusion tests in `convex/knowledgeRetrievalService.test.ts` (or create it):
equal-relevance chunks order by prior; flag off reproduces today's fusion
exactly; a negative-only chunk still returned. Eval fixtures through AI
Checks as in Phase 2.

**Definition of done:** rated answers move future retrieval within a hard cap,
per tenant, behind a flag, with the evidence visible in admin.

---

## Phase 5 — autonomous memory writing (a decision, not a default)

Everything above keeps the founding contract: no new belief without a human.
This phase is the deliberate, separately-approved break in that contract.
**Do not start it unbidden.** It ships default off behind
`autoApplyLowRisk` in the config object, and the flag alone is not the gate —
the build itself waits for an explicit go-ahead.

Scope if approved, all binding:

- Exactly the existing `shouldAutoApply` envelope
  (`convex/agentMemoryCandidates.ts:504-506`): LOW-risk FACT/SUMMARY only.
  Never PREFERENCE or INSTRUCTION, never prompt changes, never rules, never
  knowledge, never anything on the company tier's ALWAYS mode.
- Auto-applied memories carry `autoApplied: true` and
  `probationExpiresAt` (30 days). A daily cron deactivates expired
  probationary memories that no human has confirmed; confirming clears the
  probation. A dedicated admin review surface lists them newest-first with
  one-tap confirm/revert.
- Hard cap: 3 auto-applies per agent per day; the safety screen and
  rejected-fingerprint suppression run exactly as on the proposal path.
- Audit rows record the system as the applier, never a person — the existing
  convention (`convex/agentMemoryCandidates.ts:781-785`) already insists on
  this.
- **Decision gate:** before proposing the build, bring the number that says
  whether autonomy is ready — the approval rate of the proposal queue (share
  of `PROPOSED` candidates approved vs rejected since Phase 1 shipped). If
  humans reject a meaningful share of what the AI proposes, the AI is not
  ready to skip them, and the number will say so plainly.

---

## What this plan deliberately does not do

- No model fine-tuning, no training-data collection, no A/B prompt selection.
- No per-user personalisation (`agentMemories.userId` stays write-only; that is
  its own plan if ever wanted).
- No AI-writable knowledge base and no "remember this" tool exposed to the
  model in any phase, **including Phase 5**.
- No cross-tenant learning of any kind.
- No change to prompt-evolution approval: `applySuggestion` keeps requiring an
  admin decision plus explicit `apply: true`
  (`convex/agentImprovementSuggestions.ts:648-696`).

## Sequencing and dependencies

Phases land in order; each is releasable alone.

```
Config object ──► Phase 1 (reflection)  ──► Phase 5 (gated decision)
              ├─► Phase 2 (ranking)     ◄── Phase 3 feeds company-tier quality
              └─► Phase 3 (feedback)    ──► Phase 4 (retrieval priors)
```

Phase 2 can ship before Phase 3 (agent tier works immediately; company tier
sharpens when feedback arrives). Phase 4 must not ship before Phase 3 — it
would have no signal to aggregate.

## Work queue

- [x] **0.1** `convex/selfImprovementConfig.ts` + admin toggles card + audit +
      tests for default-fill and malformed JSON.
- [x] **1.1** Extract classifier to `agentRunReflectionService.ts`; shared
      duplicate guard; button path byte-identical.
- [x] **1.2** `createForRunInternal` chaining into `generateForRunInternal`;
      rewire `updateRunStatusInternal` FAILED/CANCELLED branch.
- [x] **1.3** Back-pressure (10 queued) on run-sourced candidates.
- [x] **1.4** Phase 1 test list above, green.
- [x] **2.1** Outcome counters on `agentMemories` + stamping in
      `agentRunStateService` + backfill migration; feedback counters on
      `companyMemories` (write path in 3.4).
- [x] **2.2** `memoryQualityScore` moved; `blendedMemoryRank`,
      `qualityForRanking`, weights and decay constants, pure-function tests.
- [x] **2.3** Blend applied in `searchMemoryInternal` and
      `getRuntimeMemoriesInternal` behind the flag; ALWAYS path untouched.
- [x] **2.4** Dashboard shows blended score + counters.
- [x] **2.5** Phase 2 test list above, green; AI Checks fixtures.
- [x] **3.1** `messageFeedback` table + `source` on `agentRunFeedback`.
- [x] **3.2** `upsertForMessage` with full guard set + caps;
      `upsertForRunAsEndUser`.
- [x] **3.3** Chat feedback UI (blue/gold, text labels, post-stream,
      revisit state, hidden when flag off) + Playwright spec.
- [x] **3.4** Sweep prioritisation; END_USER flow through
      `getCandidateDrafts` proven; memory-evidence counter wiring with
      flip-idempotency.
- [x] **3.5** Phase 3 test list above, green.
- [x] **4.1** `knowledgeChunkStats` + hourly evidence sweep + watermark.
- [x] **4.2** `chunkPrior` + optional `priors` argument in fusion + call-site
      batch load behind the flag.
- [x] **4.3** Knowledge-screen evidence rollups.
- [x] **4.4** Phase 4 test list above, green; AI Checks fixtures.
- [ ] **5.0** *(decision gate — requires explicit approval; bring the
      queue-precision number)* Probationary auto-apply as specified.

## Reading list before touching this area

- `AGENTS.md` — repo working rules; follow them over habit.
- `docs/plans/active/ai-checks-plan.md` — eval fixtures for Phases 2 and 4 go
  through its machinery; do not invent a parallel harness.
- `docs/plans/active/agent-autonomy-and-approvals-plan.md` — the approvals
  philosophy this plan inherits; Phase 5 here is the same argument applied to
  memory.
- `docs/plans/active/agent-observability-plan.md` — where reflections and
  feedback surface for admins.
- `docs/plans/active/email-design-system-plan.md` — the blue/gold signal ramp
  every new UI element in this plan uses.
- `convex/companyMemorySuggestions.ts:14-16` and
  `convex/agentMemoryCandidates.ts:750-785` — the in-code statements of the
  human-gate contract that Phases 1–4 must preserve.
