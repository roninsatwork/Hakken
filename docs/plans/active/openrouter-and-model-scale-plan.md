# OpenRouter, and a model catalogue that scales

**Started 2026-07-26.** Anthony asked for OpenRouter in the platform, built to
scale, with the work done in the database rather than in the browser. This is the
review, the decisions taken, and the phases.

It follows the model catalogue and model page work recorded in
[admin-ux-plan.md](./admin-ux-plan.md) (phases E–H). The **AI Providers screen**
moves here, because fixing it turned out to be mostly a backend job.

---

## The one thing that decides the order

**Scale comes before OpenRouter, or OpenRouter breaks the screens.**

Every provider in the platform today publishes a handful of models. OpenRouter
publishes roughly four hundred. That is not a bigger version of the same problem;
it is a different problem, and four things break the moment those rows exist:

1. **The catalogue is not actually paginated in the database.**
   `getOffsetPaginatedModels` (`convex/aiModels.ts:90`) reads up to
   `MODEL_CATALOG_LIMIT = 500` rows, then filters and slices the page **in
   memory**. Every keystroke in the search box pulls the whole catalogue into the
   query.
2. **The search indexes have no filter fields.** `search_display_name` and
   `search_model_id` (`convex/schema.ts:1967-1968`) carry only their search field,
   so a filter is applied *after* the search has already paged. This is the exact
   fault fixed in the Skill Center at A4, where a search with ten matching rows
   returned nothing at all because the first page happened to be filtered out.
3. **Three screens load the entire catalogue with no search and no paging** —
   Model Defaults (`defaults/page.tsx:24`), agent settings
   (`admin/agents/[id]/page.tsx:26`) and the company models page
   (`admin/companies/[id]/models/page.tsx:56`), all via `getModels`. They become
   four-hundred-item dropdowns.
4. **The 500 cap starts truncating silently**, which is the failure mode this
   repo has already been bitten by once.

So syncing OpenRouter into today's code would make the platform measurably worse.
Phases K and L land first.

---

## What the AI Providers screen currently says that is not true

**"Healthy" means two different things.** `testProviderConnection`
(`convex/aiModelsActions.ts:249-267`) genuinely calls OpenAI and Anthropic and
counts models. For Vertex it only builds the credentials object — it never
touches the network — and then reports healthy. The same green badge means
"the API answered" for two providers and "the environment variables parse" for
the third.

**Test switches the provider on.** On success it writes `isEnabled: true`
(`convex/aiModelsActions.ts:269-276`). A button that reads as a read-only check
changes state behind the reader.

**Disable does not disable.** Turning a provider off hides its models from every
picker (`getActiveModels`, `convex/aiModels.ts:64-71`) and blocks new defaults
(`assertModelCanBeDefaultForUseCase`, `:310-320`) — but `resolveModelConfig`
(`:533-550`), which is what the runtime actually calls, never checks the provider
at all. **A model already set as a default keeps running on a disabled
provider.** The button states an outcome the system does not deliver.

**`GOOGLE / ENVIRONMENT`** prints the raw provider key beside a field that has
never held any other value: `authMode` is written as the literal `"environment"`
in all three places a provider row is created, and nothing but this label reads
it.

**"Health: Never"** reads as a health rating. It is a date.

**A latent bug in the sync dispatcher.** `syncProvider`
(`providers/page.tsx:40-57`) is an if/else-if chain whose final `else` calls the
Anthropic sync. Add a fourth provider to `SyncProviderKey` without adding a
branch — which is precisely what Phase M does — and pressing Sync on it silently
syncs Anthropic.

**And the number nobody shows:** how many models each provider contributes, and
how many of those are switched on. Today that means leaving for the catalogue and
filtering.

---

## Decisions

### Sync everything the provider offers

Four hundred models is not a reason to filter at sync time. A sync-time allowlist
is a hardcoded list wearing a disguise, and those are banned — see phase H of the
admin UX plan for why. Models arrive switched off, as they already do; search and
paging are what make a large catalogue navigable. This is the same conclusion the
Skill Center reached at three hundred skills.

### Counts come from a rollup, not from counting

The pager needs a total and the providers table wants "15 models · 4 on" per row.
Counting on every page load is the fan-out that was removed from the Skill Center
in A3, and an index finds rows — it does not total them. A small rollup document,
maintained when models are upserted or toggled, answers both.

Unlike the skills rollup, this one can be **maintained incrementally rather than
rebuilt on a schedule**, because the facts it counts change in exactly two places
— `internalBatchUpsert` and `toggleModelEnforcement`. The skills rollup was
rebuilt periodically because its inputs changed in eight places and drift was the
likelier failure; that reasoning does not apply here.

### Embeddings stay with Google, and the screen says so

`resolveEmbeddingModelConfigForExecution` (`convex/aiModels.ts:708-745`) throws
for any non-Google provider, because the knowledge vector index is built at 768
dimensions (`convex/knowledge.ts:196-198`). Changing that means re-embedding every
document in every company.

The fix is not to support it. It is to **stop offering it**: the embedding row on
the Defaults screen should only offer models that can actually serve it, rather
than accepting a choice that fails at run time.

### Pricing arrives from OpenRouter, in the wrong unit

OpenRouter's model listing is public and carries `pricing.prompt` and
`pricing.completion` **per token**, plus context length and modalities — the three
things Vertex does not report. Hakken stores rates **per million**
(`convex/aiCostService.ts:22`).

That conversion is a multiplication by one million, which is the precise mistake
phase E1 removed from the display layer. It gets done once, in the sync, with a
test that pins the stored rate against what the cost service charges.

### OpenRouter comes in levels, and they are separable

Level 1 makes it a catalogue provider (Phase M). Level 2 makes it usable by
agents (Phase N). Level 3 makes it usable everywhere in the app (Phase O).

**All three are in.** Anthony's instruction is that OpenRouter works across the
app, so Level 3 is not the optional tail it would otherwise be. The levels stay
separable because each leaves the product coherent on its own — but only if the
screen is honest about what is available at each stage, which is Phase P's job,
and only if the claim is checked by running it, which is Phase R's.

---

## Measured, not assumed

Numbers in this plan come from reading the code and from calling the real APIs,
not from estimating:

- **15 usable models** returned by the live Vertex listing, proven in phase H
  against the dev deployment's own service-account credentials.
- **345 models** in OpenRouter's listing, of which 340 carry prices and 274 can
  call tools — counted against the live API in Phase N, not estimated.
- **12 call sites** bypass the provider registry entirely and require a Google
  model, each one listed in Phase O. (An earlier count of eleven was wrong; the
  table in Phase O is the counted one.)
- **17 places** enumerate or switch on a provider key, listed in Phase M.

Each phase is verified in the running app, not only in tests. Every behavioural
claim gets a test, and every new test is confirmed to fail against deliberately
broken code before it is trusted — the standard used throughout this repo.

---

## The plan

Nine phases, roughly ten days, in this order:

| Phase | What | Days |
|---|---|---|
| **J** | The provider screen stops lying | 0.75 |
| **K** | The catalogue scales | 1.5 |
| **L** | The Providers table | 0.5 |
| **M** | OpenRouter, level 1: the catalogue | 1 |
| **N** | OpenRouter, level 2: agents | 1.5 |
| **O** | Any model, any job, everywhere in the app | 2.5 |
| **P** | The screen only offers what works | 0.5 |
| **Q** | Documentation and the provider checklist | 0.25 |
| **R** | Proven across the app, on a real key | 0.75 |

J and K are prerequisites rather than preferences: J removes a fallthrough that
Phase M would walk straight into, and K has to land before four hundred rows
exist. The rest run in order.

### Phase J — the provider screen stops lying (0.75 days)

Before anything is made prettier or larger, the three statements this screen
makes have to be true. Same principle as Phase A: a screen that shows the wrong
thing is worse than a screen that shows the right thing badly.

| # | Item | Size | State |
|---|---|---|---|
| J1 | Testing Vertex actually calls Vertex | 0.25 | **done** |
| J2 | Test stops switching the provider on | 0.1 | **done** |
| J3 | Disabling a provider actually stops it | 0.25 | **done** |
| J4 | The sync dispatcher loses its silent fallthrough | 0.15 | **done** |

**J1.** The Vertex branch builds a config object and returns "healthy". It now
lists models, the way the other two providers already do, and reports the count.
A test that passes without the network is not a test.

**J2.** A successful test stops writing `isEnabled: true`. Enabling is the
toggle's job, and it is one click away.

**J3.** `resolveModelConfig` gains a provider check, so a disabled provider stops
serving. This is a **runtime behaviour change and the riskiest item in the
plan**: if a company's only working default sits on a provider someone disabled
months ago, that company's agents stop rather than quietly continuing. That is
the correct outcome and it must not be a surprise, so the toggle warns when
disabling a provider that currently serves any default, naming them.

**J4.** The if/else-if chain becomes an exhaustive map keyed by provider, so an
unmapped provider is a visible error rather than an accidental Anthropic sync.
Phase M adds the fourth provider and would otherwise walk straight into this.

**Done.** `isModelServable` now gates every tier of model resolution, including
the embedding resolver, and `getProviderDefaultUsage` reads through a new
`by_provider` index on `aiModelDefaults` so the confirmation can name what a
provider is handling without scanning a table that grows with the number of
companies.

*How each item is proven:*

- **J3** has two tests, both confirmed to fail against the old behaviour: a
  global default and a company override each fall through to the next tier once
  their provider is switched off, while the model itself stays enabled.
- **J2** has a test that reaches the *success* path by stubbing the provider's
  HTTP call — the failure path never enabled anything, so testing it would have
  proven nothing. Confirmed to fail when the `isEnabled: true` write is put back.
- **J4** is enforced by the compiler rather than by a test: the dispatch map is
  typed `Record<SyncProviderKey, …>`, so extending the union in Phase M without
  adding a branch is a build error.
- **J1 is not unit-testable and was not faked.** With no Vertex credentials the
  old code also failed, so there is no observable difference in a test
  environment. The call itself is proven — phase H ran `listVertexModels` against
  the live API and got 15 models — and `testProviderConnection` now calls exactly
  that. The remaining check is one click on the Providers screen: the Vertex card
  should report a model count rather than "Credentials configured for …".

### Phase K — the catalogue scales (1.5 days)

| # | Item | Size | State |
|---|---|---|---|
| K1 | One filterable search index | 0.25 | **done** |
| K2 | Real cursor pagination in the database | 0.5 | **done** |
| K3 | A maintained counts rollup | 0.5 | **done** |
| K4 | Pickers stop reading the whole catalogue | 0.25 | **partly** |

**K1.** `search_display_name` and `search_model_id` gain
`filterFields: ["providerKey", "isEnabled"]`, and the query narrows inside the
index instead of afterwards. The test that matters reproduces the Skill Center's
A4 failure on models: a catalogue where the first page of search hits is entirely
inactive must still return the active matches.

**K2.** `.take(500)` plus an in-memory slice becomes real pagination over
`by_provider_enabled` or `by_enabled`, chosen by which filters are set. A page
costs the page.

The existing screen is a numbered pager, which needs a total — supplied by K3.
Where a total genuinely cannot be known, the footer says what it is showing
rather than inventing one, exactly as the Skill Center does.

**K3.** A rollup document holding counts per provider and per provider-and-status,
maintained by `internalBatchUpsert` and `toggleModelEnforcement`. It feeds both
the catalogue pager and the "15 models · 4 on" column in Phase L.

Two properties get tests, both confirmed to fail when removed: the count survives
a sync that adds and updates in the same batch, and toggling a model moves it
between the active and inactive counts rather than double-counting it.

**K4.** The three screens that load the whole catalogue get the treatment
`searchActiveSkills` gave the skill picker: searched and paged in the database.
This is a correctness fix as much as a UX one — at four hundred models the
current dropdowns silently omit whatever falls past the cap.

---

**K1 done, and it turned two search indexes into one.** `search_display_name`
and `search_model_id` could not be paginated together: merging two paginated
queries into one page means reading both in full, which is precisely why that
query took the whole catalogue and sliced it. A single `searchText` field —
friendly name, display name, stable id and provider id, plus a spaced form of
each id so a reader searching "otter" finds `vendor:quiet-otter` — carries one
index with `filterFields` for provider and status.

The test reproduces the Skill Center's A4 failure on models: twenty inactive
models matching the search word and one active one. Filtering after the search
returns nothing; filtering inside the index returns the one. Confirmed to fail
when the filter is moved back outside.

`buildModelSearchText` is rebuilt on every write, and
`backfillModelSearchText` gives existing rows one — **run once after deploy;
107 rows updated on the dev deployment.** A model with no search text is
invisible to search while looking perfectly normal in the list, so this is not
optional.

**K2 done.** `getOffsetPaginatedModels` is replaced by `getPaginatedModels`,
which pages in the database on `search_text`, `by_provider_enabled`,
`by_provider` or `by_enabled` according to which filters are set. The screen uses
`usePaginatedQuery` with the numbered pager pulling the next page in on demand —
the same shape the Skill Center settled on.

*One behaviour deliberately dropped:* the query used to sort the default model to
the top, which cost a full scan of the catalogue to move one row. The Default
column now answers that question on every row, so the sort earned nothing.

*And one special case removed:* filtering by Google used to scan every row so
that legacy models carrying no provider key would be included. That is exactly
the kind of hidden full read this phase exists to delete. Legacy rows are given a
provider key by `backfillGoogleVertexModelProviders`, which already existed for
the purpose; the test now runs it rather than relying on the scan.

**K3 done.** `aiModelRollups` holds one document: total, enabled, and per-provider
counts, with `computedAt` and `isPartial` so a screen can say how old the answer
is and whether it covers everything.

*Recomputed on write rather than kept as deltas.* Four paths can change these
counts — a sync, a toggle, setting a default, and the backfill. Keeping four
delta paths correct for ever is how counters silently drift, and this repo has
already written down that a quietly wrong number is worse than an honestly late
one. Recomputing costs one pass over the catalogue at moments an admin triggers,
and makes drift impossible. Tests cover a re-sync that updates existing rows
without inflating the total, and a toggle moving a model between counts rather
than double-counting it.

**K4 partly done, and honestly so.** All three screens now ask for models that
can actually be chosen — enabled, on a provider that is switched on — instead of
reading the whole catalogue and filtering in the browser. That removes the silent
truncation, which was the correctness fault.

What is **not** done is making those pickers searchable. They are still `<select>`
elements, so enabling three hundred models would produce a three-hundred-item
dropdown. That is now a deliberate act by an admin rather than something a sync
does to them, and the natural place to fix it is Phase P, which rebuilds these
same pickers so they only offer models that can do the job. Recorded here rather
than quietly counted as finished.

### Phase L — the Providers table (0.5 days) — **done**

The standard admin table, so this screen and the catalogue finally look related.

**Provider · Models · Status · Last synced · Active**

- **Models** reads *15 · 4 on*, from the K3 rollup. It is the question the screen
  exists to answer and it was not on it.
- **Status** says *Connected*, *Not connected* or *Off*, and after J1 those words
  mean the same thing for every provider.
- **Active** is the toggle, as it is on the catalogue — not a badge beside a
  separate button saying the same thing twice.
- Sync and Test become row actions.
- `providerKey / authMode` goes. It is an internal key beside a constant.

No search box: at four rows it is furniture, and the pager footer honestly
reports the count. Trivially added later if the provider list ever grows.

**Done.** `describeProviderStatus` turns the stored value into a word a reader
owns — *Connected*, *Not connected*, *Connected, with problems*, *Not checked
yet*, *Off* — and after J1 those words mean the same thing for every provider.
The Models column reads from the K3 rollup, so it costs one document rather than
a count per row. The health message keeps its place under the provider name,
where the raw provider key and `authMode` used to sit.

**Found by looking at it, not by the tests.** The rebuilt screen crashed on load
in the browser while all 2,685 tests passed. `HakkenModal` builds its children
whether or not it is open, so the confirmation body ran against a
`getProviderDefaultUsage` result of an unexpected shape and took the whole page
down with it. Guarding on "is this the shape I expect" rather than on "is this
still loading" fixes it. This is the reason each phase is checked in the running
app and not only in tests.

### Phase M — OpenRouter, level 1: the catalogue (1 day)

| # | Item | Size | State |
|---|---|---|---|
| M1 | Fix the model-id rule before anything syncs | 0.15 | **done** |
| M2 | The provider service: adapter and listing | 0.35 | **done** |
| M3 | Register the provider in all 17 places | 0.25 | **done** |
| M4 | Pricing, capabilities and context from the listing | 0.25 | **done** |

**M1 comes first and is not optional.** `internalBatchUpsert`
(`convex/aiModels.ts:891-895`) treats any model id containing a colon as already
provider-qualified. OpenRouter ids are `vendor/model` and some carry a
`:variant` suffix, so those rows would be stored unqualified and could collide in
the `by_model_id` index with another provider's row. Cheap now; painful to unpick
once four hundred rows exist.

**M2.** A new `convex/openrouterProviderService.ts` mirroring the shape the other
HTTP providers already use — env type, config builder that throws on missing
credentials, response extractor, adapter factory, and a listing function — all on
the existing `requestProviderJson` helper, which is already provider-neutral.

**M3.** The seventeen places that enumerate a provider key, from the constant in
`aiModelService.ts` through the registry switch, the display-name maps, the sync
actions, `testProviderConnection`, the env example and the setup validator, to
the four front-end display-name chains. J4 has already removed the trap in the
middle of this.

**M4.** OpenRouter reports what Vertex will not: price, context length, and input
and output modalities. Capabilities come from that metadata rather than from
guessing at the model id — the existing heuristic tags anything starting with "o"
as a reasoning model, which would mistag every id in the `openai/` namespace.

Pricing converts per-token to per-million once, in the sync, with the test
described under Decisions. Both context tiers get the same rate, because
OpenRouter has no long-context tier concept.

**Done, and one thing needs saying about M1.** The old rule read "a colon means
this id is already provider-qualified". The question it was really asking was
"is this already prefixed with *this* provider", so that is what it now asks —
`startsWith(providerKey + ":")`. The test upserts `vendor/model:beta` under two
different providers and asserts three distinct rows survive rather than two rows
and a silent overwrite.

**Prices reach the catalogue, and never wipe a typed-in one.** The upsert now
accepts rates and writes them only when the sync actually supplied them. For
every provider but OpenRouter those rates were entered by hand, so a re-sync that
reports no prices must leave them alone — there is a test for exactly that.

**The J4 compiler guard earned itself immediately.** Adding `openrouter` to
`SyncProviderKey` produced a build error on the dispatch map until the branch was
added. Under the old if/else-if chain that would have been a silent Anthropic
sync, which is the failure it was written to prevent.

**Capabilities come from OpenRouter's metadata**, not from the model id. The
id-based guess the other providers use adds "reasoning" to anything starting
with "o", which would have tagged the entire `openai/` namespace; there is a
test asserting it does not.

**Not yet run.** The sync needs `OPENROUTER_API_KEY` in the Convex environment.
Until then the provider appears in the table as *Not checked yet*, with no
models, which is the honest state rather than an error.

### Phase N — OpenRouter, level 2: agents (1.5 days) — **done**

Without this, choosing an OpenRouter model for the Agent or Workflow job fails at
run time. Level 1 alone buys chat, thread titles and memory suggestions — three
of the ten jobs.

A second adapter satisfying `AgentProviderAdapter`
(`convex/agentProviderTypes.ts:87-105`): streaming, tool calls, and the
normalised outcome the runtime switches on. OpenRouter speaks the OpenAI
protocol, so this is a known shape rather than a research problem.

Registered in `agentProviderRegistry.ts`, including `isAgentCapableProvider`.
Prompt caching needs no entry — `promptCacheService.ts` already defaults unknown
providers to automatic prefix caching, and that is the right behaviour here.

**Done, and proven against the live API.** A temporary probe deployed to the dev
deployment drove both adapters with the real key, then was deleted:

- **345 models listed, 340 with prices, 274 able to call tools.**
- **The text path answered.**
- **The agent path streamed a turn and came back with the tool call it was asked
  to make**, arguments intact — which is the whole point of this phase.

Translation and stream accumulation live in `openrouterMessageService` as pure
functions, so both are tested without a network call. Three properties are
pinned, each confirmed to fail against deliberately broken code: a tool result
pairs with the request in the *preceding* turn; parallel calls stay distinct by
index; and a call whose argument JSON never finished arriving is **dropped
rather than run with a guess** at what it said.

*The SSE framing moved to `providerHttpService` as `parseProviderSseChunk`.*
Every streaming provider frames its stream identically, so it belongs with the
neutral HTTP helpers rather than being copied per adapter.
`anthropicStreamService` predates it and keeps its own copy; it can adopt the
shared one whenever that path is next touched, which is a smaller risk than
rewiring a working streaming path for tidiness.

**Two findings from the live run, neither a bug in this code:**

- **M1 was not hypothetical.** The cheapest tool-capable model returned was
  `inclusionai/ling-3.0-flash:free` — a colon in the id, exactly the case that
  would have been stored unqualified under the old rule.
- **A reasoning model can spend its entire output budget thinking.** The first
  probe capped output at 32 tokens and got an empty reply with 32 tokens
  charged; the raw response showed the reasoning field had consumed all of them.
  Raised to a realistic cap, the same model answered. Worth knowing before Phase
  R, because agent budgets set that ceiling and a too-tight one on a reasoning
  model produces silence rather than an error.

### Phase O — any model, any job, everywhere in the app (2.5 days) — **done**

**Required, not optional.** Anthony's instruction is that OpenRouter works across
the app, and this is the phase that delivers it. Levels 1 and 2 make OpenRouter
available to chat and to agents; without this phase, most of the product still
quietly demands a Google model and says so only when something fails.

Twelve call sites bypass both registries and call
`getGoogleVertexProviderModelId`, which throws for anything else:

| Surface | Call site |
|---|---|
| Assistant RAG search | `convex/aiChat.ts:270` |
| Audio transcription | `convex/aiSpeech.ts:454` |
| Workflow validation | `convex/workflowNodeConfig.ts:534` |
| Agent RAG search | `convex/agentRuntime.ts:584` |
| Triggered agent execution | `convex/agentRuntime.ts:1704` |
| Workflow agent execution | `convex/agentRuntime.ts:2205` |
| Knowledge embedding | `convex/knowledgeActions.ts:165` |
| Swarm RAG search | `convex/swarmActions.ts:94` |
| Swarm workflow execution | `convex/swarmActions.ts:127` |
| Sales report generation | `convex/salesReportActions.ts:59` |
| Intent routing | `convex/orchestrator.ts:73` |
| Eval grading | `convex/agentEvalGradingActions.ts:106` |

Each either routes through the provider registry, or — where the capability
genuinely is Google-only — declares that plainly rather than throwing at run
time. **Transcription and embedding are the two that stay Google-only**, for the
reasons under Decisions; every other row on that list becomes provider-neutral.

Note that the two RAG-search rows and the knowledge row are embedding calls
wearing different names, so they resolve to the same answer: they stay with
Google, and Phase P makes that visible rather than surprising.

The test for this phase is behavioural, not structural: with an OpenRouter model
set as the platform default for a job, that job runs.

---

**Done, and the blocker was not what the list of call sites suggested.**

Three of those sites — intent routing, report generation, workflow-node
configuration — needed a **JSON answer matching a schema**, and each was written
directly against Vertex's `responseSchema`. They were not Vertex-only because the
models could not do the work. They were Vertex-only because *the request had no
neutral way to ask for structured output*.

So `AiGenerationRequest` gained `jsonSchema`, in plain JSON Schema, and all four
adapters honour it:

| Provider | How |
|---|---|
| Google | `responseSchema` + a JSON response mime type |
| OpenAI | `text.format` as `json_schema` |
| OpenRouter | `response_format` as `json_schema` |
| Anthropic | **a forced tool call** — see below |

Anthropic's Messages API has no `response_format`. The documented technique is to
offer a single tool whose input schema *is* the shape you want, force the model
to call it, and read the arguments it passed. The alternative — asking for JSON
in the prompt — fails silently whenever the model wraps the answer in prose.

**Nine sites moved to the registry:** intent routing, eval grading, triggered
agent execution, workflow agent execution, swarm workflow execution, workflow
node configuration, and report generation.

**What still requires Vertex, and why it should:**

| Still Google | Reason |
|---|---|
| Four embedding calls | The vector index is 768 dimensions |
| Audio transcription | No neutral contract for audio, and no second implementation |
| Two grounded-agent paths | Google Search grounding is a Vertex capability |

The two grounded paths now split rather than block: an agent with internet access
runs on Vertex and says *"internet access for a workflow agent"* requires it,
while the same agent without it runs anywhere. That is the difference between a
capability constraint and a hard-wiring, and the message now says which one the
reader has hit.

**Tests.** `structuredOutput.test.ts` drives each adapter with a stubbed
transport and reads the request it built, because a silently dropped schema does
not fail — it returns prose where the caller expects JSON, and the caller's
`JSON.parse` throws somewhere else entirely. Confirmed to fail when the mapping
is removed from either adapter.

**And one worth remembering.** Returning a union type — a Vertex response *or* a
neutral one — from a Convex handler made its inferred type circular and produced
**484 type errors in files nowhere near the edit**, reported as "implicitly has
type any". Both branches now normalise to one shape before returning. A cosmetic
saving is not worth an error cascade that points at the wrong file.

### Phase P — the screen only offers what works (0.5 days) — **done**

The payoff, and the thing that stops phases N and O being invisible.

Model Defaults currently offers any enabled model for any job, so a reader can
pick a model that cannot serve it and find out when something fails. Each job row
offers only models whose provider can actually do that job, and says why when the
list is short — "only Google models can turn documents into something searchable".

This is also where the embedding decision from Decisions becomes visible.

**Done.** `canProviderServeUseCase` and `describeUseCaseProviderLimit` live in
`aiModelService` — deliberately not in either registry, because the screens need
them too and the registries are Node-only. One answer in one place is what stops
the picker and the runtime disagreeing.

Both the platform Defaults screen and the company override screen now offer only
models that can do each job, and each restricted row says why in a sentence a
reader owns: *"Only Google models can do this job: the searchable index of your
documents is built to their shape, and changing it would mean rebuilding every
one."* A short list with no explanation reads as a bug.

**Enforced on the server as well**, in `assertModelCanBeDefaultForUseCase`. A
picker that offers only valid choices and a runtime that accepts anything is one
API call away from the failure it was meant to prevent — and that failure is
silent until the work does not happen. Three tests cover it, all confirmed to
fail when the rule is removed: an embedding job refuses a non-Google model, an
agent job refuses a provider with no agent adapter, and the same model is
accepted for a job that is only text.

### Phase Q — documentation and the provider checklist (0.25 days) — **done**

`docs/developer/ai-provider-tool-extension.md` carries a "when adding another
provider" checklist that is currently incomplete — following it would miss the
registry switches and the front-end display-name chains. Adding OpenRouter is the
first real exercise of it since it was written, so it gets corrected from what
actually had to change, and the count in it stops being a guess.

**Done.** The checklist was five lines describing the *shape* of the work without
saying where any of it lives — following it would have missed both registry
switches and all four front-end display-name chains, each of which fails quietly.
It is now eleven numbered steps split into backend, front end, and "to run
agents, not just chat", written from what adding OpenRouter actually took.

Two statements in the same document were also corrected because the code no
longer does what they described: no provider carries a fallback catalogue, and a
successful connection test no longer enables the provider.

### Phase R — proven across the app, on a real key (0.75 days) — **part done**

Phases M to O are correct in tests. This phase proves it in the running product,
because "provider-agnostic" is a claim about behaviour and the only honest way to
check it is to run the thing.

With an OpenRouter model set as the platform default, walk every surface that a
model reaches and confirm each one answers:

- the assistant chat, including a thread that gets a generated title
- the embedded widget
- an agent run with tool calls, from the agent screen
- a triggered agent run and a workflow agent node
- a swarm execution
- intent routing
- a generated report
- eval grading
- a company-scoped override, to prove per-company defaults reach the same path

Anything that fails goes back to Phase O rather than into a known-issues list.
The two Google-only capabilities are confirmed to **say so on screen** rather
than to fail — that is Phase P's work being verified here.

This phase also records what OpenRouter actually cost to run during the walk, as
the first real check that the per-token to per-million conversion in M4 produces
a spend figure matching OpenRouter's own dashboard. A pricing bug that is only
wrong by a factor of a million is exactly the kind this codebase has already
shipped once.

---

**Done so far, on the dev deployment:**

- **The first sync ran: 345 models.** The super-admin action cannot be invoked
  from the command line, so a temporary internal wrapper ran it and was then
  removed.
- **Prices are right, checked against the source.** A synced model stores 3 and
  15 per million; OpenRouter publishes 0.000003 and 0.000015 per token for that
  model, and reports the same context window and display name. The conversion is
  exact, verified against the provider rather than against our own test fixture.

**Still needs a signed-in reader**, because it cannot be done from tests or the
command line: the walk across chat, the widget, an agent run with tools, a
triggered run, a workflow node, a swarm, routing, a report, eval grading, and a
company override — with an OpenRouter model set as the default for each.

### Found during R: three runtime paths read the whole catalogue

Not in the plan, and it belongs to Phase K — which missed it.

`getAllModelsInternal` returns every model in the deployment. Three runtime paths
called it **to find a single row**, building a `Map` and taking one entry:
the agent loop's context build, the triggered-agent cost record, and report
costing. At twenty models that is invisible. At the 452 this deployment now
holds, it is 452 documents read per agent step, twice per run.

Replaced with `getModelByIdInternal`, one lookup on `by_model_id`. The eval
grader's use was a different shape — it wanted a list of enabled ids to choose a
grader from — so it gained `getEnabledModelIdsInternal`, which returns ids rather
than shipping every field of every model to build a list of strings.

`MODEL_CATALOG_LIMIT` was also raised from 500 to 2000. The catalogue list no
longer uses it — that pages in the database — but the counts rollup, the
search-text backfill and the enabled-model queries genuinely need every row, and
345 models from one gateway took this deployment to 452. A second gateway would
have crossed the old ceiling.

---

## Not in scope

- **Changing the embedding vector dimension.** It would mean re-embedding every
  document in every company, and nothing in this plan needs it.
- **Per-provider stored credentials.** Every provider reads from the environment,
  `authMode` has never held another value, and a credential-entry UI is a
  security surface that should be designed deliberately rather than added in
  passing.
- **The currency question.** Every cost figure in the product is a dollar
  labelled with a pound sign; `convertUsdToGbp` exists and has no callers.
  Deciding whether spend is tracked in dollars or pounds, applying it once at the
  point of calculation, and dealing with the historical records is its own piece
  of work. Recorded in the admin UX plan under E2.
- **Filtering the OpenRouter catalogue at sync time.** See Decisions.
