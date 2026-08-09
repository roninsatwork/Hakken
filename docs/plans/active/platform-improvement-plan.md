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

## Phase 2 — Workflow retries and a dead-letter queue — PARTIALLY DONE 2026-08-09

**Built and tested:** `workflowRetryService.ts` (transient-error classifier,
deny-by-default retryable-node policy — only `agentNode` qualifies today, with
the reasoning recorded in the module; 3-attempt budget; 5s/25s backoff);
`requeueStepForRetry` returns a RUNNING step to PENDING with the attempt
counted and the surviving error kept, flowing retries through the normal claim
path so fan-out collision safety applies unchanged; `executeNode`'s catch now
consults the policy. Steps carry a 1-based `attempt`. 7 new tests, including
the acceptance property that side-effecting node types never retry.

**Still to do:** an end-to-end test driving the real `executeNode` through
fail-twice-succeed-third; and a decision on the review surface — FAILED
executions already appear in the admin executions list with the attempt count
on their steps, which may be enough, or may deserve a filtered
"needs attention" view.

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

## Phase 3 — Streaming in the app (2–4 days for the primary provider)

**What:** replies appear word-by-word instead of all at once. The write side —
flushing partial text to the database at a bounded rate, live-updating
subscribed screens, and marking abandoned replies as stalled — already exists
and the agent runtime uses it. The missing half is reading from the model as it
generates: the provider adapters currently wait for the complete answer.

**Order:** the primary runtime provider (Vertex) first; the remaining adapters
(~1 day each) after, only if wanted.

**Acceptance:**
- A reply arrives in more than one database write for answers beyond the flush
  threshold, and the widget and assistant screens render the partial text.
- A stream that dies mid-answer surfaces as stalled, not as a complete answer.
- Token and cost accounting for a streamed run matches an unstreamed run of the
  same transcript.

## Phase 4 — Evals that exercise the real runtime (1–2 weeks)

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
