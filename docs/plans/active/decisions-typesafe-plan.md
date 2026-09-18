# Decisions — the judgments Sonae makes, visible and switchable

**Started 2026-09-17.** Agreed with Anthony the same day: TypeSafe comes in
as a provider, and every judgment it makes becomes a named **Decision** you
can see on screen, switch on and off, and trace through the observability
screens. Phase A is built; see Progress below.

TypeSafe ("System One", model `jev-latest`) is not a chat model. You hand it
some text plus one or more questions and it returns typed answers with a
probability spread: a yes/no with a probability (they call it a Noul), a
pick-one from a list with a probability per option (Choice), or a position on
an ordered scale (Score). Choice and Score answers also carry a single
`confidence` number derived from the spread. It answers in roughly 150ms and
bills per token like the other providers (`usage.input_tokens` /
`usage.output_tokens` on every response). Docs: https://docs.typesafe.ai
(index at `/llms.txt`; any page is Markdown with `.md` appended). JavaScript
SDK is `@typesafe-ai/sdk`; we will call the HTTP endpoint directly through
`providerHttpService` like every other provider, because the SDK's retry
policy and ours must not both run.

**Progress.** Ruling 2026-09-17 evening: Decisions must not depend on
TypeSafe; any model can answer them. Phase G built the same evening: the
Decisions job's dropdown offers every model the Fast Chat row offers (plus
TypeSafe when synced), a text model answers in JSON against a schema built
from the questions, its certainty is cut higher, run rows say which path
answered, and with no job default the platform's default model answers
(like every other job) rather than the rule. Tests, typecheck, lint, guards
green; dropdown checked in Chrome. Overall ≈75%.

**Live proof, 2026-09-18 morning.** Key set on dev; Sync listed two
TypeSafe models, Test connected; `jev-latest` chosen for the Decisions job.
The mailbox proof could not run: the Gmail connection on dev has lapsed
since August and reconnecting needs Anthony's consent click. Proven through
chat instead: all seven Decisions set to "Ask a person", one innocent
question ("summarise the platform policy on refunds") through Ask Sonae.
TypeSafe answered all three chat Decisions "Ordinary message · Sure" in one
request, the turn went through, the runs sit on the Decision detail page,
the pills sit under the question in the chat logs and in "Why this answer?",
and the Running Costs page shows TypeSafe, Jev and the Decision Maker. One
fault found and fixed in passing: `ChatMessage` never rendered its `footer`
for user messages, so the chat-log pills were invisible until it did. The
seven modes are left at "Ask a person" on dev.

**Phases F.2–F.4 and the rest of E, built 2026-09-18.** Five wiki Decisions:
worth filing (high stakes; ask-a-person hands the note to the wiki's
open-questions panel as a new FILING item), claim still supported, two
pages disagree, page answers the question (each of the chooser's picks is
checked, linked to the thread so "Why this answer?" shows it), and real
question (judged after the greeting rule writes, correcting the Unanswered
list only when sure the rule was wrong either way). Open questions carry
which Decision raised them and how sure, shown as the pill. A staff round's
Decision runs are filed under its agent run by time and key when the round
is recorded, the run page lists them with pills, and the agent Overview has
a Decisions block. All twelve Decisions ship switched off. Tests, typecheck,
lint, guards green; the run page draws its Decisions as lines, not a
table, because that page draws its own header. Overall ≈95%: what remains
is the mailbox proof (Gmail), TypeSafe's output price on the catalogue, and
the commit.

**Security review, 2026-09-18, four findings fixed the same morning.** (1)
The chat safety gate is monotonic: a regex refusal always stands and a
Decision can only add a refusal, never remove one; the disagreement stays on
the record. (2) The per-agent Decisions summary counts only the caller's
company's runs unless the caller is platform-wide. (3) One Decision can be
asked about several things in one provider request (each request carries
its own id), the page checks use it, and Decision calls retry at most once.
A dedicated per-company Decision budget is recorded here as a follow-up,
not built: spend already lands on the ledger and the cost screens. (4)
TypeSafe replies are checked against the question asked (ranges, options,
sums, scale), read under a 256 KB cap while still arriving, and every
request carries a 20-second timeout. The fifth finding, the widget's
report-only content security policy, predates this work and is filed as its
own task.

**Second security review, 2026-09-18, one High finding fixed the same day.**
The public widget, not the Decisions work: an anonymous visitor could
multiply model work by opening thread after thread (the per-thread minute
limit times the hourly thread ceiling, with no plan quota on a company
without a plan), and could name a model, a thinking level or the swarm on a
widget message. Fixed in three parts. (1) Every widget now has an hourly
message ceiling across all of its threads (600, `WIDGET_MESSAGES_PER_HOUR`
in chatService), the one bound that holds whatever the plan; the crossing is
audit-logged once per window and the visitor gets the same soft "try again
later" reply as an exhausted plan. (2) A widget session that names a model,
a thinking level or the swarm is refused outright; the widget's agent and
the company's defaults decide for a visitor. (3) The swarm passes through
the shared safety gate like every other model turn, proved by the same
runtime test that covers chat and agents. The embed pass stays reusable on
purpose: single-use passes would not stop a script that reloads the page
per thread and would cost a table of spent passes; the note on the pass
says so. The Low finding (report-only widget CSP) is the task already filed.

Phase A done 2026-09-17: code, tests (712 in the affected
areas), typecheck, lint and guards green; Convex functions pushed to dev;
Providers, platform Model Defaults, company Model Defaults and Health checked
in Anthony's Chrome. Sync and Test correctly refuse until `TYPESAFE_API_KEY`
is set on the dev backend (not yet).

Phase B built 2026-09-17: registry, engine, both tables, settings resolution,
fallback, cost and audit, 103 tests green, typecheck, lint and guards green.
Built flat rather than under `convex/decisions/` (a folder and a file cannot
share the name `decisions` in Convex's API): `decisionService.ts` (pure
rules), `decisionRegistry.ts` (the Decisions), `decisionRuns.ts` (tables,
modes, cost, audit), `decisionActions.ts` (`runDecisions`, the one door).
Three adjustments to the commitments, all recorded in the code: the fallback
rule is passed by the caller per request rather than stored in the registry
(its inputs are the caller's); tokens sit on the one ledger row per request
and each run row carries its cost share; every TypeSafe call is charged to a
seeded system agent, "The Decision Maker", the wiki-staff precedent, so the
cost screens and leaderboards have a name for it. The four mailbox Decisions
are registered now (switched off by default, wired to nothing yet) so Phase
C's screen has real rows. Retention: `decisionRuns` pipeline at 90 days, and
in passing the phone-call and mailbox pipelines gained the titles and dry-run
counts they had been missing, and the retention screen now reads the
backend's pipeline list instead of a hand-copied one (which is why those two
never appeared). Retention screen checked in Chrome: 16 rows.

Phase C built 2026-09-17: `convex/decisions.ts` (the screens' reads and
writes, company access asserted, mode changes audited as
`DECISION_MODE_CHANGED`), `DecisionsScreen` at `/admin/ai/decisions` and
`/admin/companies/[id]/ai/decisions`, `DecisionDetailScreen` under each, the
`DecisionPill` kit part, the Instructions and company-AI menu entries, and a
"Decisions" row on the company readiness overview. The mode saves on change
per row (the Model Defaults shape) rather than through one Save button, since
each row is its own setting. Tests, typecheck, lint, guards green. Overall
≈45%. Checked in Chrome: platform list, detail, company list, the mode
saving both ways, the readiness row, and the audit entries (which first
rendered as "Risk rating" because a bare from/to pair is the trail's risk
shape; now the trail's own `changes` shape, with the Decision named as the
target).

Phase D built 2026-09-17: the watcher asks the three triage Decisions in one
request after the free header pre-filter, and the needs-a-person Decision in
a second request once the draft exists. A sure "not a customer" leaves the
mail alone in the Decision's words; ask-a-person on that Decision sends
nothing and files a "decide whether to answer" task; the review Decision
overrules the reply model's own `needsHuman` when sure and hands over when
not; the language Decision picks the dressing; a sure "urgent" prefixes the
task title and makes it due within four hours (tasks have no priority field,
so this is what "priority" means here). The mailbox ledger carries each
email's Decision runs and the screen shows them as pills, with a "Not sure"
filter. Five new watcher tests with TypeSafe stubbed at HTTP; the five old
ones untouched and green. Mailbox screen checked in Chrome for a company
with no mail and one with 27 rows: the "Not sure" filter is there and the
list still pages. Pills cannot be seen until a Decision has run, which waits
on the key.

Phase E, Health part, built 2026-09-17: three lines on the Health page's
attention list — Decisions waiting for a person, Decisions running on simple
rules (fell back while switched on), and a Decision unsure far more than
usual (its "not sure" share over the window more than double its 30-day
share, on at least 20 runs) — computed in `systemHealth.ts` from the run
rows, carried through the health report type in its four hand-written copies
and the validator, tested. The agent-run, chat-log and "Why this answer?"
parts of Phase E wait for Phase F to produce Decisions linked to runs and
messages; they are built together with it.

Phase F.1 built 2026-09-17: three chat safety Decisions (hidden
instructions, permission bypass, another company's data; high stakes; off by
default) wired into the shared safety gate with the three regexes as their
rules. Switched off, the gate is exactly what it was. Switched on, a sure
"yes" refuses with the policy's own wording and the refusal's audit entry
carries the certainty word; anything less sure lets the turn through and is
on the record. Both runtimes pass the thread's company. The chat logs
(global and company) show each judged user turn's pills, and "Why this
answer?" gains a "Checks that ran on the question" group; both read the runs
filed on the thread between the question and the reply, since the user
message's id is not in hand at the gate. Tests: the guard's old tests adapted
for the one record-keeping write, plus a switched-on test where the Decision
clears an innocent "summarise the platform policy" the regex would refuse
and catches a paraphrased extraction attempt the regex would miss. Overall
≈72%. Next: F.2, the wiki checkers, with the agent-run part of Phase E.

Scope is the provider, the Decision concept end to end, and the first live
Decisions in the order below. Rewiring every candidate found in the survey
is explicitly **not** in scope; the candidate list is recorded at the end so
it is not lost.

---

## Current implementation state (verified 2026-09-17)

**Providers.** One SDK dependency (`@google/genai`); Anthropic, OpenAI and
OpenRouter are raw HTTPS. Text completion has one door,
`generateTextWithResolvedModel` in `convex/aiProviderRegistry.ts`; agent
runs have a second registry, `convex/agentProviderRegistry.ts`. Adding a
provider today touches `convex/aiModelService.ts` (key constant,
`canProviderServeUseCase` at `:212`, `describeUseCaseProviderLimit` at
`:228`), both registries, `convex/aiModelsActions.ts` (sync + test), and the
`syncActionsByProvider` record on
`src/app/(dashboard)/admin/ai/models/providers/page.tsx`. `getProviders` in
`convex/aiModels.ts` returns inferred platform rows, so a provider appears on
the Providers table before it has ever been stored. Keys are Convex
environment variables (`docs/developer/convex-environment-variables.md`),
never in the UI.

**Use cases.** `DEFAULT_MODEL_USE_CASES` (`convex/aiModelService.ts:100`) is
the list both defaults screens render (`/admin/ai/models/defaults`,
`/admin/companies/[id]/ai/models`). Adding a use case puts a row on both
screens with no UI work, provided `canProviderServeUseCase` restricts it and
`describeUseCaseProviderLimit` says why the dropdown is short.

**Cost.** `agentTransactions` rows are priced at write time from the
`aiModels` pricing fields (`convex/aiCostService.ts`,
`calculateModelCostGBP`). A model with no pricing reads as *not measurable*
(`isModelCostMeasurable`, `convex/utils/modelPricing.ts`) and the cost
screens show the `IncompleteFiguresNotice`. Two places still price by hand
and skip the service (`convex/wikiStaff.ts:282-294`,
`convex/salesReportActions.ts:~331-340`); this plan does not add a third.

**The judgments that exist today, and how they are made.**

| Where | Judgment | Made by |
| --- | --- | --- |
| Every assistant and agent turn (`convex/aiSafetyPolicy.ts`, called from `modelTurnService.guardModelTurn`) | Is this message trying to override instructions, bypass permissions, or reach another company's data? | Three regexes. Paraphrase slips through; innocent mentions of "policy" can trip it. |
| Mailbox (`convex/gmailWatcher.ts`) | Skip or answer (`skipReason`, `:242`); needs a person (`needsHuman`, inside the reply-writing prompt, `:486-537`); reply language; greeting (`GREETING_PATTERN`, `:161`) | Gmail labels + no-reply regex; the reply model's own JSON; a hand-written regex |
| Wiki staff (`convex/wikiFilingActions.ts`, `wikiFreshnessActions.ts`, `wikiContradictionActions.ts`, `wikiActions.ts:28-186`) | Worth filing? Claim still supported? Two pages disagree? Which pages answer this question? | `fast-chat` model asked for JSON, parsed with a regex, fail-open |
| Unanswered questions (`convex/wikiFeedbackService.ts`) | Is this a real customer question? | 27-word greeting stop-list + word count |
| Intent router (`convex/orchestrator.ts:86`) | Which agent handles this? | Model self-reports `confidence`; hard-coded `> 0.65`; number never shown |
| Agent self-improvement (`convex/agentRunReflectionService.ts:59-95`) | Which of 11 failure categories? | Substring matching on the error blob |
| Company checks (`convex/companyEvals.ts:180-195`) | Does the answer make a forbidden claim? | `includes()` on the exact wording |
| Prospect matching, workbook import (`convex/salesDataProspectMatching.ts`, `salesDataImportService.ts:108-230`) | Same business? Which column is which? | Token fingerprints, alias lists |
| Customer research (`convex/salesDataResearchService.ts`) | Write the found figure or queue it? | Agent's self-reported HIGH/MEDIUM/LOW |

**Where a judgment is visible today.** Almost nowhere. The mailbox screen
(`src/app/(dashboard)/admin/_features/work/CompanyMailboxScreen.tsx`) shows a
`decisionReason` string under the subject and a Decision pill
(REPLIED / TASK / PENDING / SKIPPED, blue/amber/grey, written labels). Chat
has the "Why this answer?" disclosure
(`src/ui/components/chat/AnswerEvidence.tsx`) listing pages, documents,
memories and skills used. The opportunity report prints a confidence
*phrase* with a brand-or-grey dot. Audit entries exist for agent actions
(`AGENT_ACTION`, `AGENT_RUN_FINISHED`, `ASSISTANT_SAFETY_REFUSAL`) but carry
no confidence.

**Controls that exist.** Provider on/off switch with the "this would break
these defaults" dialog; model `isEnabled`; agent `isActive` (the wiki staff
switch); the five self-improvement switches
(`/admin/settings/options/self-improvement`, one JSON blob under
`SELF_IMPROVEMENT_CONFIG`, table of Name · Description · Switched on with an
explicit Save); approval policy; Stop Agent.

**Observability.** `/admin/health` (system health, run observatory,
connections from `convex/connectionProbes.ts` with kinds MAILBOX / PHONE /
PROVIDER / WIDGET / TOOL_SERVER, scheduled jobs, and a "needs attention" list
built in `HealthResults.tsx:97-102`); per agent Observability ▾ Overview /
Activity (`/runs`) / Raw logs (`/logs`) and the run detail waterfall at
`/admin/agents/[id]/observability/[runId]`; chat logs global and per company
(`src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen.tsx`); the
audit trail.

---

## The decision

One concept, one control screen, one visual marker, one vocabulary of three
words, and the old rules kept as the fallback.

- **A Decision** is a named judgment with a plain-English question, a fixed
  answer set, a stakes level, a fallback (the rule Sonae uses today), and a
  record of every run.
- **Admins never meet TypeSafe by name** outside the Providers table and the
  model catalogue. Everywhere else they meet Decisions.
- **Three certainty words, never a number:** *Sure*, *Fairly sure*,
  *Not sure*. Blue (`info`) for handled, amber (`warning`) for worth a look,
  always with the word. Never a red/green signal; Anthony is red/green colour
  blind and the status-colour drift test enforces it.
- **Three modes per Decision:** *Off* (fallback rule runs), *Ask a person*
  (every answer becomes a queue item or a task; nothing acts), *Acts on its
  own* (acts when sure enough for its stakes, otherwise asks a person).
- **Switching the provider off** turns every Decision to its fallback and the
  screens say "Using simple rules". Nothing goes silent.

---

## Anthony's ruling, 2026-09-17 evening: no dependency on TypeSafe

Decisions must work with any model. TypeSafe is an optional provider for the
Decisions job, not the only one, and Sonae must never depend on it. Every
Decision, screen, record and audit entry stays exactly as designed; what
changes is who answers the question.

**What this means, concretely (Phase G, built first thing next session):**

- The Decisions job accepts ordinary text models as well as TypeSafe. The
  TypeSafe-only rule in `canProviderServeUseCase` goes; a judgment model is
  still refused for every text job.
- A second adapter behind `runDecisions`: when the chosen model is a text
  model, the platform asks it the same question and requires a yes/no (or
  the chosen option, or the score) with a number from 0 to 1 for how sure it
  is, as strict JSON through the existing `jsonSchema` path. The answer is
  turned into the same `DecisionAnswer` shape, so certainty words, modes,
  run rows, cost rows, pills and audit entries are untouched.
- Certainty from a text model is its own estimate, not a measured
  probability, so the cut-offs for that path start more cautious than
  TypeSafe's (sure ≥ 0.85, fairly sure ≥ 0.6) and are recorded in one place
  beside the TypeSafe ones. The run row records which path answered.
- Cost goes through the same ledger row per request; tokens are the text
  model's.
- The Decisions job resolves like every other job: its own default, then
  the platform's default model, then the compiled-in failsafe. Only the
  failsafe means "no model", and then every Decision still falls back to
  whatever makes the call today (the rule, or the model that already
  answers as part of a bigger job). Nothing about "off" changes.
- The screens' amber line changes from "no TypeSafe model" to "no model can
  answer the Decisions job right now".

Commitment 1 below is amended by this ruling; commitment 5's thresholds
become per-path. **Built the same evening** (`decisionTextProviderService.ts`,
the `TEXT_MODEL` source on run rows, the higher cut-offs in
`decisionService.ts`, the any-model rules in `aiModelService.ts` and both
`modelSupportsUseCase` copies).

## Design commitments (binding on every phase)

1. **TypeSafe is a provider, not a text model.** It gets a provider key,
   a Providers-table row, a sync action, a test action, a connection probe,
   and a catalogue row with pricing. It is *never* selectable for a text
   use case; `canProviderServeUseCase` refuses it for everything but the new
   `decision` use case, and refuses every other provider for `decision`.
   `describeUseCaseProviderLimit` carries the sentence that explains this.
2. **One door for judgments.** `convex/decisions/decisionService.ts` is the
   only code that calls TypeSafe. It takes a Decision key plus state, resolves
   the model through `resolveModelConfigForExecution({ useCase: "decision" })`,
   asks all of that Decision's questions in **one request**, applies the
   certainty bands and mode, writes the run row, the `agentTransactions`
   cost row and (when it acted) the audit entry, and returns a typed result.
   Callers never see raw probabilities unless they ask for them to display.
3. **Every Decision is declared in code, in one registry.**
   `convex/decisions/registry.ts` holds each Decision: key, copy keys for
   name and description, the questions in TypeSafe's shape, the answer set,
   stakes (`LOW` | `HIGH`), default mode, where it is used, and the fallback
   function. Question IDs are for code; the full meaning lives in the
   instructions and criteria, per TypeSafe's own guidance. Nothing outside
   the registry constructs a question.
4. **The fallback is the rule that runs today, unchanged.** `skipReason`,
   the safety regexes, the greeting stop-list and the rest are not deleted;
   they become the Decision's fallback and stay covered by their existing
   tests. A Decision run records whether TypeSafe or the fallback answered.
5. **Certainty bands are set per Decision in code, never on a screen.**
   Starting values, to be validated on our own data as TypeSafe's docs
   insist: for a yes/no, distance from 0.5 doubled (`|p − 0.5| × 2`) of
   ≥ 0.7 is *Sure*, ≥ 0.4 is *Fairly sure*, below is *Not sure*; for a
   pick-one or score, the returned `confidence` on the same cut-offs.
   `LOW` stakes act on *Fairly sure*; `HIGH` stakes act only on *Sure*.
   *Not sure* never acts, in any mode.
6. **Every run is a row.** New table `decisionRuns`: decision key, company,
   subject (`kind` + id: email, message, wiki page, agent run), the answers
   with their spreads, certainty band, mode in force, outcome
   (`ACTED` | `HANDED_TO_PERSON` | `RECORDED`), source (`TYPESAFE` |
   `RULES`), tokens, cost, and optional `agentRunId` / `threadId` /
   `messageId` links so the observability screens can find it. Body text of
   the subject is never stored, only the reference; same restraint as the
   mailbox.
7. **Settings follow the model-defaults shape.** New table
   `decisionSettings` with `scope: "global" | "company"`, `companyId?`,
   `decisionKey`, `mode`. Resolution: company row → global row → registry
   default. Super-admin writes the global rows; a company admin writes the
   company rows.
8. **One pill everywhere.** A new kit component
   `src/ui/components/screens/DecisionPill.tsx`: Decision name + certainty
   word, `info` or `warning` tone through `toneForStatus`, click opens a
   popover with the answer spread as short bars (brand for the chosen
   answer, `muted` for the rest, labels on every bar). No screen draws its
   own version. The kit guard (`scripts/check-screen-kit.mjs`) gets a rule
   refusing a hand-drawn certainty label.
9. **Audit only what acted.** A run with outcome `ACTED` writes one audit
   entry, new action type `DECISION_ACTED` with an `ACTION_WORDS` entry ("A
   Decision acted"), metadata: Decision name, answer, certainty word, what
   it did. Handed-over runs write nothing; the queue item or task is the
   record. Fallback runs that acted write the same entry with source
   "simple rules" so a fallback period is visible in the trail.
10. **Copy is catalogued.** Every Decision name, description, answer label
    and certainty word lives in `messages/en.json` and `messages/it.json`
    in parity; the copy-catalogue drift test makes a new file start at zero
    hardcoded sentences.
11. **Retention rides the existing purge.** `decisionRuns` joins the
    retention-and-purge schedule with the same window as `agentLogs`.
12. **No second environment, no automated screen checks.** Each phase is
    proven with unit tests on the service and a check of the real screens in
    Anthony's Chrome at ~1280px, with clickable URLs sent to him.

---

## Phase A — The provider (≈1.5 days)

**Goal:** TypeSafe shows on the Providers table with Sync, Test and the
on/off switch working; a `Decisions` job row appears on both defaults
screens; the Health page probes it; the cost screens can price it.

- `TYPESAFE_PROVIDER_KEY` in `convex/aiModelService.ts`; `decision` added to
  `DEFAULT_MODEL_USE_CASES` with its sentence in `describeModelUseCase` and
  the limit sentence in `describeUseCaseProviderLimit`; the two
  `canProviderServeUseCase` rules from commitment 1.
- `convex/typesafeProviderService.ts`: `askTypesafe` over
  `providerHttpService` with the house retry service handling 429 and 529
  by backoff (529 was missing from the retryable set and is added);
  `listTypesafeModels`. The Test button and the hourly probe both list
  models rather than ask a question: listing is free, and the probe runs
  every hour for every enabled provider, so it must never spend a token.
  Key from `TYPESAFE_API_KEY`, documented in
  `docs/developer/convex-environment-variables.md`, in the
  `scripts/provider-requirements.mjs` groups (and `typesafe` allowed in
  `sonae.product.json`'s `providers.ai`, to be added there at go-live).
- Sync and test actions in `convex/aiModelsActions.ts`; `syncActionsByProvider`
  entry on the providers page (the type forces it). Capability inference by
  id substring is **not** extended; TypeSafe models are stamped
  `capabilities: ["decision"]`, `supportedUseCases: ["decision"]` by the
  sync itself.
- Both provider registries refuse the key with a clear error, so no text
  path can ever route to it.
- `connectionProbes.ts`: PROVIDER-kind probe for TypeSafe; the Health
  connections list shows it like Anthropic and Google.
- Pricing entered on `/admin/ai/models/[id]` like any model; until entered
  the cost screens show the incomplete-figures notice rather than zero.
- Tests: use-case refusal both ways, retry on 429/529, test-connection
  shape, disable dialog names the `decision` default when set.
- **Not in this phase:** any Decision. The provider exists and does nothing.

## Phase B — The Decision engine (≈2 days)

**Goal:** the registry, the service, the two tables, settings resolution,
fallback, audit and cost, all proven by tests with a stub Decision.

- `convex/decisions/registry.ts` (commitment 3) with a `DecisionDefinition`
  type and a `decisions.test.ts` that walks every entry: copy keys exist in
  both message files, at least one question, a fallback, a stakes level, a
  no-match answer where the answer set is open.
- `convex/decisions/decisionService.ts` (commitment 2): `runDecision`,
  `resolveDecisionMode`, `certaintyBand`, `outcomeFor(mode, band, stakes)`.
  Fallback path when the provider is off, disabled, failing, or the model
  default is unset.
- Schema: `decisionRuns`, `decisionSettings` (commitments 6, 7), indexes by
  company + key + time, by subject, by `agentRunId`, by `threadId`.
- `agentTransactions` row per TypeSafe call through `aiCostService`, with
  `actionContext: "decision:<key>"` so the cost dashboards' model and
  provider distributions pick it up unchanged.
- `DECISION_ACTED` audit type (commitment 9), rendered by the existing
  `describeAuditChange`.
- Retention hook (commitment 11).
- Tests: every outcome cell of mode × band × stakes; fallback on each
  failure kind; run row written on every path; audit only on `ACTED`;
  cost row only on TypeSafe source; company setting beats global beats
  default.

## Phase C — The Decisions screens (≈2 days)

**Goal:** an admin can see every Decision, what it does, how often it ran,
how often it handed over, and set its mode, globally and per company.

- `/admin/ai/decisions` under **Instructions ▾** in `AiWorkspaceNav`, and
  `/admin/companies/[id]/ai/decisions` in the company AI dropdown. Route
  reference and nav tests updated.
- Anatomy copied from the self-improvement page: `PageHeader`, an `Info`
  box saying what a Decision is and that Off means simple rules, `DataTable`
  with search, explicit `SaveAction`. Columns: **Decision** (name +
  description) · **Used in** (plain words: Mailbox, Chat, Wiki) · **This
  week** (ran / handed to a person, two counts) · **Mode** (a `Select`:
  Off / Ask a person / Acts on its own; company copy has "Follow platform"
  first, like the model defaults). One brand action: Save.
- When the provider is off or failing, a warning-toned line under the
  header: "TypeSafe is off. Every Decision is using its simple rule." with
  a link to Providers.
- Row click → `/admin/ai/decisions/[key]`: `DetailHeader`; the question
  wording as the model sees it and the answer set; a `DataTable` of the
  last runs (When · Subject link · Answer · Certainty pill · Outcome ·
  Source); a cost line for the period. No editing of the question on
  screen.
- Company AI overview (`CompanyAiOverviewContent.tsx`) gains an Area row
  "Decisions" with state SET_HERE / INHERITED, or "Using simple rules".
- Verification: both screens in Chrome; guard scripts; copy tests; a
  screenshot of each sent to Anthony with the URLs.

## Phase D — First live Decisions: the mailbox (≈2 days)

**Goal:** the mailbox's four judgments become Decisions, visible on the
mailbox screen, with the whole path exercised end to end.

Registry entries, all asked in one request over the inbound message plus
the company's name and the sender line:

- `mailbox.message-kind` — pick-one: customer enquiry · newsletter or
  marketing · automated notification or bounce · spam · something else.
  Stakes `LOW`. Fallback: `skipReason`. The label and no-reply checks stay
  as a free pre-filter before the call.
- `mailbox.needs-a-person` — yes/no, asked over the message **and** the
  drafted reply and the pages used, after the reply model has written.
  Stakes `HIGH`. Fallback: the reply model's own `needsHuman` flag, which
  stays in the prompt so the fallback still works. `Not sure` files the
  task, exactly as `needsHuman: true` does today.
- `mailbox.language` — pick-one over the company's configured languages
  plus "another language". Stakes `LOW`. Fallback: the reply model's
  `language` field.
- `mailbox.urgent` — yes/no. Stakes `LOW`. Consumed as the task's priority
  and shown on the mailbox row. Fallback: none (answer "no").

Screen changes (`CompanyMailboxScreen.tsx`): the `decisionReason` line under
the subject becomes the `DecisionPill` for `message-kind` (and
`needs-a-person` when it ran); the segmented filter gains **Not sure**;
`listMailboxForCompany` returns the run summary, never body text.

Tests: watcher behaviour identical with the provider off (the existing
gmailWatcher tests keep passing untouched); each Decision's outcome routing;
one request per message. Proof: a real message in the connected test
mailbox, the row on the mailbox screen, the audit entry, the cost line, all
checked in Chrome.

## Phase E — Observability (≈2 days)

**Goal:** Decisions show up wherever an admin already looks when something
feels off.

- **Health.** Three attention lines in `HealthResults.tsx`: "Decisions
  waiting for a person" (count, link to the Decisions screen filtered to
  handed-over), "Decisions running on simple rules" (only when the provider
  is off or failing), "A Decision is unsure far more than usual" (share of
  *Not sure* over 7 days more than double its 30-day share; link to that
  Decision). Counts come from `decisionRuns`.
- **Agent run detail.** The waterfall lists a Decision run linked by
  `agentRunId` as a step, with the pill and spread, beside model and tool
  calls. The Overview gains a block: decisions this period, share acted,
  share handed over, cost. Activity rows show a small count of decisions in
  the run.
- **Chat logs.** A message that a Decision touched (linked by `messageId`)
  shows the pill inline, global and company screens.
- **Why this answer?** `AnswerEvidence` gains a "Checks" line listing the
  Decisions that ran on that turn with their pills (populated from Phase F
  onward; until then the line is absent, not empty).
- **Costs.** No change needed beyond Phase B; verify TypeSafe appears in the
  provider and model distributions and in the company usage breakdown.
- Verification in Chrome for each screen, with URLs to Anthony.

## Phase F — The next Decisions, in order (≈3 days, then per Decision)

Each is its own small step, following the Phase D recipe: registry entry,
fallback kept, pill on the screen that shows the result, tests, Chrome
check. Build strictly in this order and stop after each for Anthony's look.

1. `chat.safety` — three yes/no questions (instruction override, permission
   bypass, cross-tenant reach) over the user turn. Stakes `HIGH`; in *Acts
   on its own* mode a *Sure* yes refuses exactly as today; *Fairly sure*
   and *Not sure* let the turn through but record the run so the chat logs
   show it. The regexes stay as a pre-check and the fallback. The
   `ASSISTANT_SAFETY_REFUSAL` audit entry gains the certainty word.
2. `wiki.worth-filing` (Filing Clerk's yes/no), `wiki.claim-supported`
   (Freshness Checker), `wiki.claims-disagree` (Contradiction Finder).
   Open-questions items show which Decision raised them and the pill. The
   staff agents keep their `isActive` switch; the Decision mode sits
   underneath it.
3. `wiki.pages-for-question` — a per-page relevance score used as the
   rerank behind `selectWikiContextForQuery`, with the rarity-weighted word
   match as fallback. Shown in "Why this answer?".
4. `wiki.real-question` — replaces the greeting stop-list on the Unanswered
   screen.

Recorded candidates after that, not scheduled: agent failure category
(`agentRunReflectionService`), forbidden-claim check (`companyEvals`),
prospect matching, workbook column mapping, research finding verification
before an automatic write, the intent router's threshold.

---

## Proof, per phase

- Unit tests on the service and each Decision's routing; the existing tests
  for every fallback rule untouched and green.
- `npm run check:guards` (kit guard, copy catalogue, theme drift,
  status-colour drift) green.
- Every screen touched opened in Anthony's Chrome at ~1280px; URLs sent.
- A progress line with a percentage in every update.

## Out of scope, recorded

- Replacing the reply-writing model in the mailbox, the wiki page writers,
  call summaries or the sales report. Those generate text; TypeSafe judges.
- The opportunity report's arithmetic. Deliberately model-free and staying so.
- Editing a Decision's question on screen. Questions are code.
- A slider or number for certainty anywhere in the UI.
- The Posture Studio area.

## Waiting on Anthony

- A TypeSafe account and an API key, set as `TYPESAFE_API_KEY` on dev
  first. Phase A can be built and tested against a stub without it; Phase
  D's proof cannot.
- Their pricing, to enter on the model catalogue row. The docs confirm
  per-token billing but the public price page could not be read on
  2026-09-17.
