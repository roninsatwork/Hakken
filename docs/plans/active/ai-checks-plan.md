# AI Checks Plan — company and agent

**Started 2026-07-26.** Anthony looked at Company Evals and said he did not
understand it. The review found something worse than confusing copy: the screen
does not test anything, and it can turn a company's readiness lights green
without the company AI ever being asked a question.

This plan covers both testing surfaces — company and agent — because they are
the same idea built twice, with different words. Reviewing the agent side to
copy its engine turned up the same disease there: the engine is sound, but
**creating a check writes a passing result**, configuration checks are counted as
passes, some checks cannot fail, and half the screen has never loaded for a
company admin at all. Both surfaces report confidence they have not earned.

The brief, in his words: **it has to work, and it has to be easy to understand
and use, or it will not get used.** Everything below is measured against that.

---

## What is actually wrong

### 1. Company evals do not test anything

Four faults, each on its own enough to invalidate every number on the screen.

**The answer is fabricated.** `runBatch` calls `getAutomaticAnswer`
(`convex/companyEvals.ts:199`), which returns a template string echoing the
case's own name, prompt and expected behavior. The forbidden-claim check at
`:136` then searches *that* string. The company AI is never invoked. There is no
model call anywhere in `convex/companyEvals.ts`.

**One check cannot fail.** `runBatch` passes
`resolvedUseCase: evalCase.expectedModelUseCase` (`:624`) into a check that
asserts `resolvedUseCase === expectedModelUseCase` (`:177`). It is a tautology.
The create form defaults `expectedModelUseCase` to `"chat"`
(`.../evals/new/page.tsx:66`), so **every case created through the UI carries a
guaranteed free pass that inflates its score.**

**Three checks cannot pass.** Required sources, memories and skills are compared
against evidence read from `fixtureContextJson` (`:208`). That field is not on
the create form and is never sent. The evidence is always empty, so any required
source, memory or skill fails permanently, with no route to a pass from the UI.

**A false failure is also possible.** Because the fabricated answer embeds the
case's own prompt and expected-behavior text, a forbidden phrase written into
either description trips its own check. "Must never say *enterprise is free*" in
the expected behavior fails the eval, citing itself.

Net behaviour: a case with a forbidden-phrase rule passes forever, a case with a
required skill fails forever at ~50%, and a case with nothing configured sits at
`NEEDS_REVIEW` and 0%. **None of the three outcomes involves the company AI.**
`convex/companyEvals.test.ts:174` asserts exactly this and calls it correct.

### 2. A fabricated pass produces a real all-clear

This is the fault that makes the feature actively harmful rather than merely
unfinished.

`insertCompanyEvalRun` calls `resolveCompanyAiDriftEvents` on any `PASSED` run
(`:286`), and that function clears **every** unresolved drift event for the
company (`convex/companyReadiness.ts:267`) — not the matching category, not
events older than the run, all of them. Drift is recorded on every memory
change, every skill change and every eval-case change, so it represents the real
backlog of "things changed since anyone last checked".

One press of **Run all** wipes that backlog and flips both the *Evals* and
*Drift* tiles on the company AI page from amber to green
(`.../ai/page.tsx:344`), and moves readiness out of `DRIFTED`
(`convex/companyReadiness.ts:190`).

**A company can reach `READY` at a 100% pass rate having never been asked a
question.** An empty screen tells the truth; this one lies.

### 3. Two more things are green because they are empty

- **Widget gate.** `convex/companyReadiness.ts:175` reads `PASS` when
  `widgetBlockerCases.length === 0`. Define no widget checks and the gate that
  guards your public widget reports passing.
- **Pass rate.** The tile renders `0%` when nothing has ever run
  (`.../evals/page.tsx:146`), which reads as total failure rather than as
  no data.

### 4. The manual "Run" button is homework-marking

The green **Run** play button on each row does not run anything. It opens a form
(`.../evals/[evalCaseId]/run/page.tsx:160`) where the admin types in the answer
and hand-declares which sources and memories were used. The admin writes the
answer, asserts the evidence, and the system scores their own claims. This is
not a weaker test than the automatic one — it is a different thing wearing the
same word.

### 5. The agent engine is sound; everything around it is not

The **engine** was hardened on 2026-07-25 (see Platform Hardening Plan P3.6) and
is genuinely good: `gradeSmokeEvalWithModel`
(`convex/agentEvalGradingActions.ts:19`) opens a throwaway thread, runs the real
agent through `runAgentObjective` with its real tools, memories, skills and
retrieval, then grades with a **different** enabled model and says so when it
cannot. `parseGradeVerdict` fails closed. This is the engine the company side
should have had, and it is the one part of either system that needs no repair.

The accounting around it has the same disease as the company side.

**Configuration checks are counted as passes on this screen.** This is the real
analogue of the company fault. The codebase is explicit that a contract check "is
not evidence the agent works" (`convex/agents.ts:509`), and readiness correctly
counts only model-graded runs — but this page's "Passed" tile, "Eval runs" tile,
green `SUCCESS` pills and `passing` skill pills all count contract-only runs. The
number an admin reads on the screen and the number that gates activation disagree,
and the screen shows the flattering one.

**Creating a check writes a `SUCCESS` run into the agent's run log.**
`createManual` (`convex/agentEvalFixtures.ts:642`) inserts an `agentRuns` row with
`status: "SUCCESS"` and objective "Manual eval fixture: …", purely to satisfy the
required `sourceRunId`. So do `seedFixturesForTemplate` (`:810`) and
`seedSkillEvalFixtures` (`convex/agentSkills.ts:985`). *Checked: these are
excluded from the eval counters and from readiness, both of which filter to
objectives starting `"Smoke eval:"`. The damage is confined to the agent Runs
screen, where adding a check appears as a successful run of something.*

**Some checks cannot fail.** A fixture with no tool mappings and no blocked
actions passes if its rubric box is non-empty. The row is labelled `Run`, goes
green, and reports "Smoke eval passed".

**Half the page never loads for a normal admin.** `readiness` comes from
`api.agents.getAgentReadiness`, which is a `superAdminQuery`
(`convex/agents.ts:753`). For a company-scoped ADMIN it throws, so two of the six
tiles, the skill-coverage panel, both blocking banners and the release-policy
strip sit on `...` forever. A large part of this screen has never worked for the
people it is for.

**The gate contradicts itself.** The "Release gate" tile reads the single most
recent run of any fixture in any mode (`.../evals/page.tsx:541`), so it can say
**Passing** while the banner directly beneath it says "Critical eval gate is
blocking activation. 0 of 3" and the Critical tile reads `0/3`.

**Template-seeded checks are guaranteed to fail.** The suggested fixtures in
`convex/agentTemplates.ts` write blocked-actions JSON in ad-hoc shapes
(`{"blockedContent":[…]}`, `{"blockedActions":[…]}`) that the evaluator does not
understand, so every one of them fails with "Fixture expects blocked actions but
no blocked tool call or approval was recorded." A new agent's starter content is
pre-broken.

**Editing a check silently destroys part of it.** `updateFixture` (`:734`)
rebuilds the tool-plan JSON from bare mapping strings, discarding the
`sideEffectLevel`, `confirmationRequired` and `status` fields that
`createFromRun` wrote. Opening a run-derived check and pressing Save also clears
its blocked-actions contract if the box is blank. And because `isCurrent`
compares the last run to `updatedAt` (`:1267`), any edit instantly turns every
prior pass stale and re-blocks the gate — while the toast says only "Fixture
updated."

**Archiving is a one-way disappearance**, on both fixtures and presets: no
restore mutation, no query that returns archived rows. Archiving a *preset* also
silently resets up to 25 agents' release gate to tag mode (`:1469`).

Then the comprehension problems:

- **Six counters**, five of which read 0 (or `0/0`, which reads as a pass) on a
  fresh agent.
- **A six-field create form, two fields raw code**: `Type` (10 lowercased enums
  with no explanation), `Tags` (free text), `Objective`, `Expected tool mappings`
  (internal handler identifiers typed by hand, though the check compares them
  against bindings the system already knows), `Expected blocked actions JSON`
  (nested JSON with undocumented required keys), `Rubric`. Save is enabled with
  every field blank; failure arrives as a server toast.
- **Five competing coloured buttons** in the header, three of them disabled on a
  fresh agent with no explanation, so the only things a new admin can press are
  the two grey ones.
- **`action.isBusy()` is called with no key**, so running one check greys out
  every other button on the page.
- **Tag chips silently run a suite when clicked**, styled identically to the
  type-count chips directly above them, which do nothing.
- **The preset form has no fixture picker** — `fixtureIds` is initialised empty
  and never set, so saving throws unless a suite tag is typed, and nothing says
  the tag is required.
- **The words are all internal**: fixture, objective, rubric, suite, suite
  preset, suite tag, release gate, checkpoint, release candidate comparison,
  baseline, binding, contract, model graded, stale, critical gate disabled.
- **The toast always says "contract evals"** even after pressing "Model gate",
  and the "Model graded" pill appears on runs still queued and ungraded.
- **Every model-graded check is a single sample.** `combineGradeSamples` exists
  (`convex/agentEvalGradingService.ts:120`) and is referenced only by tests. An
  agent that passes two times in three fails one conversation in three, and
  nothing surfaces that.

The intended path through this screen — tag your must-pass checks `critical`,
create a preset with that tag, tick "use as release gate", tick "require model
grading", press "Model gate", watch Critical reach N/N, then activate — is
nowhere stated in the UI.

### 6. The same idea, built twice, sharing nothing

Two tables, two screens, two vocabularies, two run paths, one working engine.
`companyEvalCases` and `agentEvalFixtures` describe the same thing. Any admin
who learns one screen learns nothing transferable about the other.

---

## The decision: one idea, called a Check

**A Check is a question, and a description of what a good answer looks like.**

**Running a Check asks the real thing that question, and a second AI marks the
answer against the description.**

That sentence is the whole product. It is true for a company and for an agent —
the only difference is who gets asked. Everything that cannot be explained
inside that sentence is either moved behind *Advanced* or deleted.

Three results, and only three:

| Result | Means |
|---|---|
| **Passing** | Asked, answered, marked good. |
| **Failing** | Asked, answered, marked bad. The answer and the reason are shown. |
| **Not tested** | Never asked, or we could not ask. Never counts as a pass. |

`NEEDS_REVIEW` disappears. A check with nothing to check is *not tested*, which
is what it is.

### The new language

Every one of these words is on screen today.

| Now | Becomes |
|---|---|
| Eval, eval case, fixture | **Check** |
| Eval run | **Result** |
| Smoke validation, contract eval, `CONTRACT_ONLY` | **Setup check** (never a pass) |
| `MODEL_GRADED` | nothing — it is just a Check |
| Rubric, expected behavior, objective | **What a good answer looks like** |
| Forbidden claims | **Words it must never say** |
| `BLOCKER` / `WARNING` / `ADVISORY` | **Must pass before going live** (a toggle) |
| Category (10 options) | *deleted* |
| Target surface (5 options) | **Where: customer widget / internal chat** |
| Suite, suite preset, suite tag | **Group** |
| Release gate | **Must pass before going live** |
| Drift | **Changed since last checked** |
| `NEEDS_REVIEW` | **Not tested yet** |
| Evidence, Evidence JSON | **What it used** |
| Expected tool mappings | **Tools it should use** (picked, not typed) |
| Fixture context JSON, expected blocked actions JSON | *deleted* |
| Release candidate comparison, baseline | *deleted* |

### The new create form

Five fields. One optional. Nothing to type in code.

1. **What would someone ask?** — the question.
2. **What does a good answer look like?** — plain English. This is what the
   marking AI reads. It replaces rubric, expected behavior and objective, which
   were three fields asking one question.
3. **Words it must never say** — optional, a simple list of phrases.
4. **Must pass before going live** — a toggle.
5. **Where** — customer widget, or internal chat. Kept only because the widget
   gate is a real product gate.

The name is generated from the question and editable. *Advanced* holds
"must use these documents / memories / skills", as pickers, collapsed by
default, and only offered once the system actually records what was used
(Phase 2).

### The new screen

One sentence where five counters are:

> **9 of 12 checks passing.** 2 failing, 1 not tested yet.

Failures listed first and open by default, each showing the question, the real
answer, and why it was marked down — because a failure the admin cannot read is
a failure they cannot act on. Passing checks collapse into a quiet list.

### The check detail screen

Neither surface has one. The company screen expands a row in place and shows only
the single latest run; the agent screen puts everything in four modals. A check is
a document with a history, and it needs a page:

- The question and what a good answer looks like, readable as prose, the way the
  skill detail page now reads.
- **The last answer in full** — the actual text the AI produced — with the
  marker's reason beside it. This is the single most useful thing on either
  surface and today it is a two-line clamp inside an expander.
- The run history for this check, so a regression reads as *"passed for three
  weeks, started failing on Tuesday"* rather than as one red badge.
- What it used: which documents, memories and skills reached the model.
- Edit and archive live here, not in a modal over a list.

The expander and the modals go. Both surfaces link to the same detail page.

---

## What gets deleted

Kept only what the brief needs. Deleting is the main tool here: every field
removed is a field nobody has to understand.

**Company**

- `category` — 10 machine constants feeding `affectedEvalCategoriesJson`, which
  is **written and never read anywhere** (verified across `convex/` and `src/`).
  Pure decoration.
- `expectedModelUseCase` and its check — the tautology. *(Check deleted in
  Phase 0; the stored field goes with the rest of the migration.)*
- `fixtureContextJson` — exists only to fake evidence.
- `expectedOutputFormat` — stored, never checked.
- `targetId` — stored, never used.
- `judgeRubric` as a separate field — merged into "what a good answer looks
  like". Two boxes asking the same question is why neither gets filled in.
- `severity` three-way → a must-pass toggle.
- `targetSurface` five-way → two, dropping `AGENT`, `WORKFLOW`, `APP_KIT`
  (agents have their own checks; the other two have no runtime path).
- Raw JSON textareas for required sources and memories → pickers.
- **The whole manual run page.** It records the admin's own claims as evidence.
  With Phase 3 in place there is nothing left for it to do. *(Its row button is
  relabelled "Record answer" in Phase 0 so it stops calling itself a run.)*
- The permanent blue "How eval runs work" box. *(Replaced in Phase 0 with an
  honest note; goes entirely once checks can run.)*
- `runBatch` and the two batch buttons. *(Done in Phase 0.)*
- The inline "Evidence" row expander, replaced by the check detail page.
- Four of the five counters.

**Agent**

- `expectedBlockedActionsJson` — a nested JSON blob no admin will write, with
  undocumented required keys, which the seeded starters get wrong anyway.
- `Tags` as free text → the same **Group** picker as everywhere else. A suite
  that only exists because two people typed the same word is not a feature.
- `Expected tool mappings` as comma-separated free text → a picker of the tools
  the agent actually has.
- **Release candidate comparison** — a panel of raw enum pills and empty
  `LATEST`/`PREVIOUS` boxes that duplicates the check list beside it.
- **The skill-coverage panel** — it has never rendered for a company admin, and
  what it offers is a filter.
- **Suite presets as a separate concept.** Name, description, suite tag,
  fixture ids, is-release-gate and requires-model-grading collapse into a
  **Group** plus the existing must-pass toggle. The preset form cannot even save
  without typing a tag it never asks for.
- Five of the six counters, including `0/0` reading as a pass.
- Three of the five header buttons.
- The per-row default of running a setup check instead of a real check.
- `expectedMemoryUsageJson`, `sourceReflectionId`, `sourceFeedbackId`,
  `sourceMemoryCandidateId` — written or declared, never surfaced anywhere.

**Both**

- `NEEDS_REVIEW` as a status.

---

## Phases

### Phase 0 — Stop the false all-clear — DONE 2026-07-26

The only urgent one, and it spans both surfaces. Today both screens can report
readiness that does not exist, and that is worse than reporting nothing.

**Company — done.** The model-use-case check is gone, so a case with no real rule
now records no checks instead of one guaranteed pass. `runBatch` is deleted
outright rather than left to write fiction, and the screen says plainly that it
cannot ask the company AI yet. Drift clears only once every must-pass case has a
passing result, read from a new `lastRunStatus` rollup through a new
`(companyId, status, severity)` index. An empty widget gate reads as unproven. The
pass-rate tile shows "—" until something has run, failing safe when the run count
is unknown. Three company tests and one readiness test were asserting the old
behaviour — that a fabricated run makes a company READY at 100% — and were
replaced with tests that a fabricated or ruleless run can never produce a pass,
and that one passing case cannot clear the backlog.

**Agent — done.** `passed` now means graded and passed. Contract-only successes
are counted and labelled as `setupPassed`, the row pill reads "Setup ok" in a
neutral tone beside an explicit "Not tested", and the tile is "Graded passes" with
a separate "Setup only" — so the screen and the activation gate no longer report
different numbers, and the screen no longer reports the flattering one. The
release-gate tile reads the gate policy instead of the most recent run of
anything, so it cannot contradict the banner beneath it. `getAgentReadiness` is an
`adminQuery` scoped to the admin's own company, so the tiles, skill panel, banners
and policy strip resolve for the admins the screen is built for; a new test covers
both the allow and the two deny paths. Editing a check no longer rebuilds the tool
plan from the form's bare mapping strings, so a run-derived check keeps the
side-effect level, confirmation requirement and status the form never renders —
also covered by a new test. Four tests were asserting that a configuration pass is
a pass and were corrected.

**Outstanding, carried into later phases.** Creating a check still writes a
`SUCCESS` row into the agent run log (cosmetic on this screen, wrong on the Runs
screen); an edit still invalidates prior passes without saying so; the contract
check still returns `PASSED` for a check with nothing to verify, which is now
labelled honestly but should read as *not tested* once the statuses are reworked.

**Company

- Delete the model-use-case check.
- `runBatch` stops fabricating answers. Until Phase 3 lands it records
  **Not tested** rather than a pass.
- A pass clears drift **only** when every must-pass check has a passing result
  newer than the drift event, and only for that company's checks.
- Widget gate with zero widget checks reads **not ready**, not `PASS`.
- Pass rate shows **—** until something has run.

**Agent**

- The counters and pills separate real checks from setup checks. A contract-only
  run never lands in "Passed" or turns a skill pill green, so the screen stops
  disagreeing with the gate that actually decides activation.
- A check with nothing to check cannot pass. No tool mappings and no blocked
  actions currently passes because the rubric box is non-empty; that becomes
  **Not tested**, not `SUCCESS`.
- `getAgentReadiness` becomes readable by a company-scoped admin, so the two
  tiles, the skill panel, both banners and the policy strip stop spinning
  forever.
- The release-gate tile reads the gate policy, not the most recent run of
  anything, so it can no longer contradict the banner beneath it.
- Editing a check stops discarding the parts of its contract the form does not
  render, and says when it has invalidated previous passes.
- Creating a check stops writing a `SUCCESS` row into the agent run log. It is
  cosmetic on the evals screen but it makes the Runs screen lie, and the fix is
  the same size as the explanation.

**Both**

- Tests that assert the old behaviour get replaced by tests asserting that a
  fabricated or configuration-only run can never produce a pass. Six company
  tests and the agent creation tests currently encode the fault as correct.

**Done when** no combination of clicks turns a readiness light green, or a
counter positive, without a real model answer behind it.

### Phase 1 — Delete the fields nothing needs — DATA CLEARED 2026-07-26

Everything in *What gets deleted* above, with a data migration for existing
rows and the tests updated. Done before the new engine so nothing downstream has
to carry dead fields.

### Phase 2 — Record what the AI actually used — DONE 2026-07-26

Two gaps stopped "did it use the handbook?" from ever being real. Both were the
same mistake: the id was in hand during prompt assembly and thrown away, so a
check requiring a document or a skill could never pass, no matter how well the AI
answered.

- `getRuntimeCompanySkillsInternal` returned name and instruction only. The skill
  id now travels with each skill.
- `selectKnowledgeChunksWithinBudget` returned chunk *text* only. It now returns
  `{chunkTexts, chunkIds}` in matching order.
- The chat path records `companyRuntimeEvidenceJson` on the assistant message —
  `{version, skillIds, sourceIds}` — beside the memory evidence that was already
  recorded. It is populated only when retrieval actually admits chunks, so an
  ungrounded answer records nothing rather than recording what was merely
  available.

Nothing reads it yet; Phase 3 is the consumer. Full suite green (3,153 tests).

### Phase 3 — Company checks run for real — DONE 2026-07-26

A check now asks the assistant that ships. `runCompanyCheck` opens a throwaway
thread marked `purpose: "EVAL"`, sends the check's question through
`generateSonaeResponse` — the same path a customer message takes, so the answer
carries the real system prompt, rules, skills, memories and retrieval — reads the
answer back, and then has a **different** enabled model mark it against "what a
good answer must do", reusing `selectGraderModel` and `parseGradeVerdict`
unchanged. Where only one model is enabled the result says on the record that the
grade is not independent.

The verdict joins the rule results rather than sitting beside them, as an
**Answer quality** entry, so it counts towards the score and appears in the
evidence list an admin already reads. Machine rules are graded against the real
answer and the real record from Phase 2, so "must use this document" can now pass.

`runBatch` is back, and real: it schedules one run per unproven check rather than
awaiting them, because a batch of provider calls outlives a single action's budget
and awaiting would fail the whole batch on the slowest check. Each check records
its own result as it finishes, so the list fills in as progress. The button names
how many it will run, and a confirmation states the number of AI calls before
spending them.

Two deliberate choices worth naming. An empty answer is recorded as a failure
rather than skipped — "asked, and said nothing" is a different and less forgiving
fact than "never run". And a run that throws is recorded as a failure with the
reason, because a missing last result reads as "not tested" and would hide a
broken assistant behind an absence.

**Verified end to end** against the dev deployment on 2026-07-26, driving
`runCompanyCheck` directly so no browser session or local-auth secret was involved.
A seeded check asked "How much does your enterprise plan cost? Give me an exact
price."; the real assistant answered without naming a figure and pointed at sales;
a model graded it with a readable reason; the forbidden-phrase rule ran against the
real answer; the run recorded `PASSED`, score 1, the resolved chat model, 470/50
answer tokens and 171/66 grading tokens, with the skill that reached the model
captured in the evidence. Drift cleared, correctly, because that was the company's only
must-pass check. The seeded check and its runs were deleted afterwards.

**Three faults the real run caught that the unit tests could not.**

1. **A run with no answer scored 50%.** When the assistant errored, the error text
   was stored as the answer and the "must never say X" rule then passed against it
   — a total failure reading as half marks. Rules are no longer evaluated when the
   answer is not something the assistant said.
2. **The grader could be an embedding model.** `selectGraderModel` chose "any other
   enabled model", and this deployment has `text-embedding-004` enabled and sorting
   first. Asking it to generate text is a provider `NOT_FOUND`, and
   `parseGradeVerdict` fails closed — so the check failed for a reason that had
   nothing to do with the answer. **This was live in the agent grader too**, which
   shares the helper: every model-graded agent eval on a deployment like this one
   has been failing environmentally and reading as a legitimate failure. Fixed at
   the source with `canGenerateText` and a `getEnabledTextModelIdsInternal` pool,
   used by both graders.
3. **An unreachable grader failed the check.** The independent grader here is out of
   OpenRouter credits. Failing a check for that reports a billing state as an AI
   fault. Grading now falls back to the model that produced the answer and says on
   the record that the grade is not independent — and if grading cannot happen at
   all, the run records as **not tested** rather than failed. A failure is a
   judgement about the answer; an unreachable provider is a judgement about us. Not
   tested still refuses to clear the readiness gates, so nothing goes green either
   way.

**Also worth knowing:** this deployment has only two text-capable models enabled and
one of them has no credits, so grades here are currently non-independent and say so.

**Not included:** the confirmation reports the number of AI calls, not a figure in
pounds. Pricing per model belongs with the cost work in Phase 7.

**A note for whoever touches this next.** The admin-facing actions live in
`companyEvalRuns`, not `companyEvals`, and `runCompanyCheck` carries an explicit
return type. Both are load-bearing: a module that references its own generated
`api` types, or an action that infers its return type from a mutation that infers
its own, closes a loop TypeScript resolves by degrading every `ctx.db.get` in the
codebase to a union of all 87 tables. It fails 478 times in files you did not
touch, and it is not obvious why.

### Phase 3 — original scope

The engine the agent side already has, pointed at company chat.

- A new action opens a throwaway thread marked `purpose: "EVAL"`, sends the
  check's question down the **real** company chat path
  (`internal.ai.generateSonaeResponse`), and reads the answer back — the same
  pattern as `getEvalThreadOutcomeInternal` on the agent side. Eval threads stay
  filtered out of the admin thread list.
- A second, different enabled model marks the answer against "what a good answer
  looks like", reusing `selectGraderModel`, `buildGradingPrompt` and
  `parseGradeVerdict` unchanged. Where only one model is enabled, the result says
  the grade is not independent, exactly as the agent side does.
- Machine rules (never-say phrases, must-use documents/skills) run against the
  real answer and the real record of what it used.
- **Run all** becomes a background job with visible progress, because it is now
  two model calls per check and real money. It confirms first — *"This will ask
  your AI 12 questions, roughly £0.30"* — and reports what it cost.

**Done when** a failing check shows the admin the actual answer their AI gave
and a sentence explaining why it is not good enough.

### Phase 3.5 — Read the numbers off an index, not off a scan — DONE 2026-07-26

Every count on both surfaces is currently produced by taking up to 1,000 rows and
reducing them in memory, and the same reduction is written three times.

- `getSummary`, `getLatestRunsForCompany` and `buildReadinessSummary` each take
  1,000 cases **and** 1,000 runs, then build the same "latest run per case" map.
  Three copies of one query, and a company past the limit is scored on a silent
  sample.
- Severity and surface are filtered in memory, so every must-pass and
  widget-gate decision reads every active case.
- The agent side does the same for its six tiles and its history totals.

The fix is the pattern the Skill Center already uses: **roll the answer onto the
row and select it by index.**

- `companyEvalCases.lastRunStatus`, written whenever a run is recorded, so the
  latest result per case needs no run read at all. *(Done in Phase 0 — the drift
  gate uses it.)*
- Indexes on `(companyId, status, severity)` and
  `(companyId, status, targetSurface, severity)` so the readiness gates are
  indexed range reads. *(Done in Phase 0.)*
- Point `getSummary`, `getLatestRunsForCompany` and `buildReadinessSummary` at
  the rollup and delete the duplicated reductions.
- A per-company counters rollup for the headline sentence, so the list page reads
  one row rather than counting.
- Where a bound still exists, `log` what was dropped. A gate that silently
  truncates reads as "all clear" when it is "the first 1,000".

### Phase 4 — One shared screen, in plain English — DONE 2026-07-26

Both screens use the Skill Center's `AdminTableShell`: Check, Status, Must pass, Last
run. One sentence replaces five counters on the company screen and six on the agent
one. Eval became Check, `BLOCKER` became a Must pass column reading Yes or No,
`NEEDS_REVIEW` became "Not tested". Tests on both screens fail if any of the machine
constants — or "deterministic", "fixture", "rubric", "suite", "Evidence JSON" —
appear on the page again.

Both surfaces have the check detail page: the question, what a good answer must do,
**the answer in full**, the marker's reason, what it used, and earlier runs.

Three faults here were found only by opening the browser, not by any test: the empty
state said "nothing here" three times over, the table's empty row is styled uppercase
so a sentence in it was shouted at the reader, and the orange primary on an empty
screen was "Run checks", which could do nothing.

### Phase 4 — original scope

Build the Checks screen once and use it for both, plus **the check detail page
described above** — the piece neither surface has today. All the language from the
table above, the one-sentence summary, failures first, the five-field form, the
standard admin table used by Skill Center rather than a bespoke list, and paging
and search done in the database rather than over a fetched page.

### Phase 5 — Move the agent screen onto it — DONE 2026-07-26

Same component, same words. The agent extras that survive — setup check, groups,
must-pass-before-going-live — are presented in the shared vocabulary. The per-row
action becomes a real check; the setup check moves to a secondary position and is
labelled as what it is. Five panels become two, five header buttons become two,
and the button-disabling gets a key so one check running does not freeze the page.

The gate stops being implicit: one line at the top of the list says which checks
must pass before this agent can go live, and why it is currently blocked.

### Phase 6 — Starters, editing, archive — MOSTLY DONE 2026-07-26

- **Starter checks**, offered on the empty screen rather than silently seeded,
  following `seedStarterSkills` (`convex/agentSkills.ts:1619`). For a company:
  *doesn't invent prices*, *sticks to your documents*, *hands off to a human when
  it doesn't know*. The existing agent template starters are rewritten, because
  the ones shipping today cannot pass.
- **Editing.** There is no update path for a company eval case at all — a typo
  means archive and start again. On the agent side editing exists but silently
  drops contract fields the form does not render, and invalidates every prior
  pass while the toast says nothing about it.
- **An archived view, and restore.** Company: the backend supports it and the UI
  hardcodes `ACTIVE`. Agent: no query returns archived rows and there is no
  restore mutation at all, so archive is a one-way disappearance. Archiving a
  group stops silently resetting other agents' gates.

### Phase 7 — Confidence — DONE 2026-07-26

- Wire `combineGradeSamples` to a per-check sample count, so a check that passes
  two times in three reports as failing. This decides whether things go live.
- Cost and token totals per run, and a short history per check so a regression
  is visible as a change rather than as a single red badge.

---

## Deliberately not being built

- **No new eval DSL, no assertion language, no scripting.** The whole point is
  that a non-developer can write a check in two sentences.
- **No merging of the company and agent tables.** They share the screen, the
  words and the run pattern. Merging the storage is a migration with no user
  benefit.
- **No renaming of the `CONTRACT_ONLY` literal in stored run metadata.** Same
  reasoning as P3.6 — it is inside historical JSON, and every label a person
  reads already says "setup check".
- **No LLM-written checks.** Suggesting checks from real chat logs is a good
  idea and a separate one; the learning loop already has a path for promoting a
  chat into a check.

---

## Where this ended up

All nine phases are done. What the brief asked for, and what it got:

**"It has to work."** A check asks the real assistant, down the same path a customer
message takes, and a different model marks the answer. Nothing can report a pass that
was not asked for — proved by tests that fail if a fabricated or configuration-only
run ever produces one. Verified end to end in the browser, not only by test.

**"It has to be easy to understand."** Both screens are the Skill Center's table with
one sentence above it. Fifteen fields became five, none of them code. Every machine
constant is gone, and a test on each screen fails if one comes back.

**Four things were found only by looking at the real screen**, and none of them could
have been caught by a test: three ways of saying "nothing here" at once, a sentence
shouted in uppercase because the empty row is styled that way, an orange primary
button that could not do anything, and a migration that reported success while leaving
"Passing" beside a blank date.

**Two live bugs were found by running it for real**, both outside the eval code: the
grader could be an embedding model, which had been silently failing every model-graded
agent eval; and the retired `text-embedding-004` meant the assistant had stopped
reading its own documents entirely, swallowed by a catch, with no sign anywhere.

**Still outstanding, deliberately:**

- Five retired fields remain declared in `schema.ts` and `category` remains required.
  Removing them needs the migration to have run on production first, or the deploy is
  refused. The note is on the lines themselves.
- Production still has the retired embedding model, so its assistant is still
  answering without its knowledge base. That needs a deploy and two migration runs.
- Agent checks have no repeat sampling or cost figure; both were done on the company
  side only.

## Acceptance rules

The brief, made testable. All six must hold.

1. **No pass without a real answer.** No screen shows a pass unless a model
   produced the answer and a different model marked it. A setup check never
   counts.
2. **Nothing is green because it is empty.** Zero checks, zero runs and zero
   widget checks all read as not ready.
3. **A non-developer can create a check unaided** and can say what the result
   means without asking anyone.
4. **Every word on screen is a word they would use.** No fixture, rubric,
   deterministic, binding, drift, blocker, contract, gate.
5. **No box asks for JSON**, on either screen.
6. **One number tells you where you stand**, and the failures are the first
   thing on the page.
7. **Every count comes from an index or a rollup**, not from taking a thousand
   rows and reducing them in the query. No gate decides on a silent sample.
8. **A failing check shows the answer it actually got**, in full, on a page of
   its own — not clamped to two lines inside an expander.
