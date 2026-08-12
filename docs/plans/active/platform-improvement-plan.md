# Platform Improvement Plan

Status: Agreed with Anthony 2026-08-09. Not started.
Owner: Anthony

The four remaining improvements from the 2026-08-09 deep review, in the order
agreed. The fifth item from that review — widget traffic constrained by the
company's plan — has its own plan
([widget-plan-quota-plan.md](./widget-plan-quota-plan.md)) and comes first.

Each phase is independent: any can ship alone, none depends on another. Every
phase carries acceptance in the platform's usual form — a failing-then-passing
test, not "it looks right".

---

## Phase 1 — Hybrid retrieval — DONE 2026-08-09

**What:** knowledge search currently ranks by meaning-similarity alone. Add
keyword search over the same chunks (the database's built-in text search, which
the platform already uses for a dozen other tables) and blend both result
lists, so an exact product name or code is found even when its embedding is not
a close neighbour.

**Also in scope, first:** the retrieval logic is duplicated in four places
(agent runtime, assistant chat, sales reports, swarm). Fold it into one shared
function before changing the algorithm, so the improvement lands everywhere at
once and the four copies cannot drift again.

**Out of scope:** a reranking model. The blend gets most of the benefit; a
reranker is a separate decision with per-query cost.

**Acceptance — all met 2026-08-09:**
- A document containing a distinctive keyword is retrieved for a query using
  that keyword: `searchChunksByTextInternal` tests (exact code found; tenant
  fencing proven) plus `fuseRetrievalRankings` tests (keyword-only results
  retrievable; agreement outranks either list alone; empty keyword results
  leave the vector ranking untouched).
- All four former call sites use the shared spine (`knowledgeRetrieval.ts`),
  and a boundary test fails if any module searches `knowledgeChunks` outside
  it.
- Existing scoping tests pass unchanged; full suite 4,407.

**Found and fixed while consolidating:** the swarm's copy searched with *no
filter* when the thread had no company, which would read every tenant's
chunks. The scope type is now closed — an unfiltered search is inexpressible;
a company-less swarm reads global knowledge only.

**Noted:** the swarm site still injects retrieved text without the untrusted-
knowledge wrapper the other sites use. Pre-existing, unchanged, worth its own
look.

## Phase 2 — Workflow retries and a dead-letter queue — DONE 2026-08-09 (review surface: existing screen)

**Built and tested:** `workflowRetryService.ts` (transient-error classifier,
deny-by-default retryable-node policy — only `agentNode` qualifies today, with
the reasoning recorded in the module; 3-attempt budget; 5s/25s backoff);
`requeueStepForRetry` returns a RUNNING step to PENDING with the attempt
counted and the surviving error kept, flowing retries through the normal claim
path so fan-out collision safety applies unchanged; `executeNode`'s catch now
consults the policy. Steps carry a 1-based `attempt`. 7 new tests, including
the acceptance property that side-effecting node types never retry.

**End-to-end proof (same day):** `workflowRetryEndToEnd.test.ts` drives the
real `executeNode` — real claim, real requeue, real finalize; only the agent
objective is stood in for — through fail-twice-succeed-third. The step ends
SUCCESS on attempt 3 with the survived error still visible, the execution
completes, and the objective ran exactly three times.

**Review surface:** FAILED executions appear in the existing admin executions
list with per-step attempt counts and errors. A dedicated filtered
"needs attention" view remains available as a small follow-up if Anthony wants
one.

**What:** a workflow step that fails for a transient reason (network, provider
hiccup, rate limit) retries with backoff — a small number of attempts — before
failing. A run that still fails lands in a reviewable "needs attention" list
rather than dying silently.

**The care:** only steps that are safe to run twice may retry automatically.
Steps with external side effects (email, outbound API calls that change state)
never auto-retry; they fail to the review list on the first error.

**Acceptance:**
- A step failing twice with a transient error and succeeding on the third
  attempt completes its run, with the attempts recorded on the execution.
- A side-effecting step never runs twice for one execution, provably.
- A run exhausting its retries appears in the review list with its error.

## Phase 3 — Streaming in the app — DONE 2026-08-09 (Vertex; other adapters degrade gracefully)

**What was actually missing:** less than planned. The agent runtime already
streamed end to end (provider stream function, flush policy, stalled
handling), and the widget and dashboard already render streaming rows. The
gap was the plain assistant path (`generateSonaeResponse`): it waited for the
whole answer and saved once.

**Built:** the registry request gains an optional `onText` listener; the
Google adapter streams via the existing `streamVertexContentWithRetry` when a
listener is present and keeps its exact non-streaming behaviour otherwise
(structured-output callers unchanged). The assistant action now uses the same
flush discipline as the agent runtime — bounded-rate partial writes, then a
finalize that carries tokens and evidence. A provider failure mid-stream
closes the row with the partial text plus the failure notice, instead of
leaving a stalled caret and a second error message. OpenAI/Anthropic/
OpenRouter assistant-path adapters simply never call `onText` and land in one
write — a degradation, not a breakage; the agent path already streams
Anthropic via its own adapter.

**What:** replies appear word-by-word instead of all at once. The write side —
flushing partial text to the database at a bounded rate, live-updating
subscribed screens, and marking abandoned replies as stalled — already exists
and the agent runtime uses it. The missing half is reading from the model as it
generates: the provider adapters currently wait for the complete answer.

**Acceptance — met 2026-08-09, proven failing-then-passing:**
- A long reply lands via the streamed row (start + finalize = more than one
  write; `streamStartedAt` is the database-visible proof) and both screens
  already render streaming rows.
- A provider killed mid-answer leaves one closed message with the partial text
  and the failure notice — no stalled caret, no duplicate error message.
- A streamed reply carries the same token accounting as a single-write reply.

**Remaining if wanted:** onText in the OpenAI/Anthropic/OpenRouter assistant
adapters, ~1 day each. — Done 2026-08-11 under
`assistant-streaming-all-providers-plan.md`, which owns those adapters'
streaming behaviour from here.

## Phase 4 — Evals that exercise the real runtime — FOUNDATION DONE 2026-08-09

**Built and tested (the runtime half):** rehearsal runs. `agentRuns` carries
`isRehearsal` (on the record, so checkpoint resume inherits it);
`runTriggeredAgentObjective` takes `rehearsal: true` and threads it through
both its paths. Inside the objective loop, a non-read tool call in a rehearsal
is recorded with its arguments as status `REHEARSED` — a new tool-call status,
distinct from SUCCESS (nothing happened) and DENIED (nothing was refused) —
and the model is told to continue as if it succeeded. This includes writes an
autonomous agent would have made without asking; reads execute for real; hard
denials (role, tenant) still deny. The run completes instead of parking on
approval. Three runtime tests prove: the write never reaches its handler and
no approval row is created, reads still execute, and ordinary runs are
byte-for-byte unchanged.

**The eval half — done 2026-08-09:**
- `runRehearsalEval` (admin mutation on the fixtures module) validates agent,
  fixture ownership and status, then schedules
  `runRehearsalEvalInternal`: the drill runs through the real loop, and
  `gradeRehearsalToolPlan` (pure, tested) compares the handlers the run
  performed (reads) or rehearsed (writes) against the fixture's expected tool
  plan. The verdict lands as a grading step on the run's own record. Proven
  end to end both ways: a drill making the expected write grades PASSED; one
  that never calls it grades FAILED naming the missing handler. DENIED/FAILED
  calls do not count as performed; a crashed drill fails regardless.
- **Exclusions, with one deliberate deviation from this plan's first draft:**
  usage quotas were never touched by drills (the message quota is chat-side).
  Model cost of a drill is *kept* in cost figures and alerts — the spend is
  real, and hiding it would falsify the books. What is excluded is traffic:
  drill transactions carry `isRehearsal`, so interaction analytics can tell a
  drill from a customer.

**UI — done 2026-08-09, verified in Anthony's browser:** the "Rehearse"
button sits beside "Run this check" on the fixture page (seen live on the
Rightmove Agent fixture; not pressed — a rehearsal is a real, paid model
run, and starting one is Anthony's call). Drill badges on the runs list and
the run detail drawer — text-labelled, never colour-only. The badges render
from the run's `isRehearsal` flag; no drill exists in dev data yet, so their
first live appearance comes with the first real rehearsal.

**Deliberately left:** analytics dashboards filtering drill transactions out
of traffic counts. The flag is on every drill transaction already; applying
it changes what the charts mean (cost keeps drills, traffic drops them), so
the filtering lands when Anthony can look at the charts and agree with what
they say.

**What:** today's readiness checks validate configuration and grade prose
answers, but never run the agent through its actual loop with tools. Add a
rehearsal mode: the runtime executes a scripted fixture for real — real model,
real reads — but every write-tool call is intercepted and recorded as "would
have done this" instead of executing. The transcript is then graded.

**Why it leans on existing machinery:** the tool dispatcher already routes
every non-read tool through an approval gate; rehearsal mode is a policy at
that same gate (record instead of ask), not a parallel runtime.

**Acceptance:**
- A rehearsal run produces a full run record marked as rehearsal, with every
  would-be write captured with its arguments, and no data changed anywhere.
- A fixture whose expectations name required tool calls fails its eval when
  the agent does not make them, and passes when it does.
- Rehearsal runs are excluded from usage quotas, cost alerts, and analytics
  rollups (they are drills, not traffic).

---

## Not in this plan, decided elsewhere

- **Widget plan quota** — own plan, precedes Phase 1.
- **Error monitoring** — built 2026-08-09; awaiting Anthony's Sentry account
  (DSN) and the Convex log-stream connection to switch on.
- **Connector marketplace / OAuth, new product features** (scheduled agents,
  "what are people asking" mining, phone approvals, knowledge auto-refresh,
  WhatsApp) — discussed 2026-08-09, no commitment yet; would each get their own
  plan if chosen.
