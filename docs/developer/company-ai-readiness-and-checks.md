---
product: Hakken
documentation_type: Developer guide
feature_area: Company AI readiness and checks
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/company-ai-readiness-and-checks.md
last_reviewed: '2026-10-26T14:37:23+00:00'
reviewed_against: current implementation
status: Current
---
# Company AI Readiness And Checks Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Company AI readiness and checks
> **Reviewed:** 26 October 2026, 14:37:23 GMT (Europe/London)
> **Source path:** `docs/developer/company-ai-readiness-and-checks.md` · **Status:** Current


## Implementation Scope

Company AI is implemented under
`src/app/(dashboard)/admin/companies/[id]/ai/` and several legacy company detail
routes. It covers company-specific AI setup: overview, knowledge, prompt, rules,
model defaults, checks, memory, skills, usage, money, saved answers, Wiki diary,
unanswered questions, and chat logs.

The main routes are:

- `src/app/(dashboard)/admin/companies/[id]/ai/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/new/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/edit/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/memory/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/skills/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/skills/new/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/[pageId]/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/map/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/diary/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/unanswered/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/saved-answers/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/money/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/models/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/prompt/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/rules/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/usage/page.tsx`

The active planning context is:

- `docs/plans/active/company-ai-readiness-rebuild-plan.md`
- `docs/plans/active/ai-checks-plan.md`

Read those before making product or semantics changes in this area.

## Overview State Model

`convex/companyReadiness.ts` owns the Company AI overview query. The exported
admin query is `getCompanyAiReadiness`.

The overview deliberately uses three area states:

- `NEEDS_ATTENTION`
- `SET_HERE`
- `NOT_CONFIGURED`

Only `NEEDS_ATTENTION` is a problem. `NOT_CONFIGURED` means the company inherits
platform configuration, which is usually acceptable. This avoids treating every
unset tenant-specific option as launch-blocking.

`buildCompanyAiAreas` currently builds areas for:

- knowledge
- widget
- instructions
- model routing
- memory
- skills
- checks
- drift

The page sorts `NEEDS_ATTENTION` first, then `SET_HERE`, then
`NOT_CONFIGURED`. The headline state is derived from the same area list that the
table renders, so the summary and table should not disagree.

Company AI pages use the shared `AiWorkspaceNav` for the company-scope AI menu.
Routes such as diary, unanswered, saved answers, and money are not readiness
inputs by themselves, but they explain why a company reads the way it does and
where operators should inspect gaps after a failed answer or customer review.

## Readiness Inputs

The readiness query reads:

- active company AI rules
- company knowledge documents
- company model routing summary
- latest company widget
- approved and proposed company memories
- active company skills and enabled company skill bindings
- active company eval cases
- unresolved company AI drift events
- company prompt length

Related Wiki and answer-demand routes read `wikiPages`, `wikiReviews`,
`wikiOpenQuestions`, `wikiPageRevisions`, `wikiUnansweredQuestions`, and audit
rows through the `convex/wiki*` modules. The saved-answers route is a redirect
into the company Wiki; it does not own a separate table or Convex module. Keep
those screens scoped by company id; do not let a platform-level Wiki result
appear in a company AI tab unless the backend explicitly returns it for that
company.

Important limits include:

- knowledge scan limit: 500 documents
- rule scan limit: 200 rules
- memory scan limit: 1000 memories
- eval readiness limit: 1000 cases
- drift scan limit: 100 events

Counts that hit a limit should be displayed honestly rather than treated as a
complete total.

## Checks Data Model

Company checks use these schema tables:

- `companyEvalCases`
- `companyEvalRuns`

The main module is `convex/companyEvals.ts`. It exports summary, listing, case
detail, run listing, create, update, starter creation, delete, batch estimate,
internal thread creation, internal thread outcome lookup, internal batch lookup,
case lookup for run, and graded-run recording.

`convex/companyEvalRuns.ts` exposes the admin actions that start work:

- `runCheck`
- `runBatch`

`convex/companyEvalRunActions.ts` contains the internal action
`runCompanyCheck`, which performs the provider-backed check workflow.

## Check Semantics

A check stores a prompt and expected behavior. It can also carry deterministic
requirements such as forbidden claims, required sources, required memories, and
required skills. Stored statuses include passing, failing, and needs review
states; the UI deliberately describes uncompleted or inconclusive cases as "not
tested" rather than showing machine language.

The checks page reads:

- `api.companyEvals.getSummary`
- `api.companyEvals.getCasesForCompany`
- `api.companyEvals.getBatchEstimate`
- `api.companyEvals.createStarterCases`
- `api.companyEvals.deleteCase`
- `api.companyEvalRuns.runCheck`
- `api.companyEvalRuns.runBatch`

Batch runs are bounded because every check can require provider calls. The UI
confirms how many questions and provider calls will run. If the batch estimate
is capped, the UI says only the first capped set will run.

Starter checks are inserted by `createStarterCases`. They cover common customer
risks: invented pricing, unsupported document claims, and failure to hand over
to a person.

## Drift Tracking

`recordCompanyAiDriftEvent` and `resolveCompanyAiDriftEvents` live in
`convex/companyReadiness.ts`. Drift events are written when company AI inputs
change in modules such as company evals, company memory, and company skills.

The source validator currently recognizes:

- `KNOWLEDGE`
- `MEMORY`
- `SKILL`
- `EVAL`
- `RULE`
- `MODEL`
- `WIDGET`
- `PROMPT`

Drift should mean previous check evidence may be stale. It should not be used as
a generic audit log. Audit logs and drift events serve different jobs.

## Memory

Company memory lives in `convex/companyMemories.ts` and uses:

- `companyMemories`
- `companyMemoryCandidates`
- `companyMemoryUsage`
- `companyMemorySweeps`

Important exported functions include summary and preview queries, memory detail
reads, approved memory listing, candidate listing, create/update/archive/restore
mutations, candidate creation, candidate approval, candidate rejection, runtime
memory queries, always-memory queries, and runtime usage recording.

The company memory page uses admin pagination, search, modal editing, archive
and restore flows, candidate approval, and candidate rejection. It resolves
older memories without `applyMode` by falling back from the legacy category.

`convex/companyMemorySuggestions.ts` runs the company-message evidence sweep. Its record mutation reuses the normal memory safety checks, duplicate normalization, and rejected-fingerprint suppression. When `SELF_IMPROVEMENT_CONFIG.autonomousMemory` is true, an accepted-safe suggestion is inserted directly into `companyMemories` with auto-applied evidence and an audit row; otherwise it remains in `companyMemoryCandidates` for approval or rejection. Keep the UI able to distinguish and remove auto-applied memory.

Always-applied memories are capped by `MAX_ALWAYS_MEMORIES`. Preserve that cap
when changing memory UI or runtime application.

## Skills

Company skills live in `convex/companySkills.ts` and use:

- `companySkills`
- `companySkillBindings`
- global `agentSkills` as import sources

The company skills page lists active company skills, searches company skills,
imports skills from the global Skill Center, and archives company skills.
Importable global skills are searched and paged in the database rather than
loaded as a fixed browser-side slice.

Runtime company skills are limited by `MAX_SKILLS_PER_COMPANY`. The screen copy
currently explains that two skills at most can be attached. Keep UI text,
runtime limit, and readiness checks aligned.

## Authorization

Company AI modules use admin wrappers and company access checks. The common
pattern is:

1. require an admin user
2. load the company
3. call `assertAdminCanAccessCompany`
4. operate only on records tied to that company

Do not authorize company AI changes by route params alone. The route supplies
the company id, but Convex functions must remain authoritative.

## Interaction With Broader AI Admin

Company AI sits on top of global AI settings. If no company model default,
prompt, rule, knowledge, memory, skill, or widget exists, the company inherits
the platform layer where applicable. The readiness screen should not report
ordinary inheritance as broken.

Company model routing uses `summariseCompanyModelRouting` from `convex/aiModels.ts`.
If a company-specific model choice cannot run, the overview reports that the
platform model is used instead and links to model settings.

## Tests And Verification

Focused tests include:

- `convex/companyEvals.test.ts`
- `convex/companyLearningLoop.test.ts`
- `convex/companyMemories.test.ts`
- `convex/companyMemorySuggestions.test.ts`
- `convex/companySkills.test.ts`
- `convex/companyReadiness.test.ts`
- `convex/wikiFeedback.test.ts`
- `convex/wikiDiary.test.ts`
- `convex/wikiPages.test.ts`
- UI tests under `src/app/(dashboard)/admin/companies/[id]/ai/`

For documentation-only edits, run `git diff --check` and Markdown link
validation.

For implementation changes, follow the repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Also verify the browser paths for overview, checks, memory, skills, and model
routing because the area states are meant to be understandable to non-technical
admins.

## Reviewed Readiness Projection And Limits

`companyReadiness.getCompanyAiReadiness` is an admin query that calls `requireCompanyAccess`, builds the eight area rows, and derives READY only when no row is NEEDS_ATTENTION. It is not a deployment gate or model-quality score. The projection reads knowledge 500, active rules 200, approved/proposed memory 1,000 each, skills 1,000, enabled bindings up to 1,000 per surface, active evals 1,000, and unresolved drift 100. `formatCount` exposes a plus sign at supported caps; do not turn the projection into exact lifetime inventory.

Skills are considered unsafe only when actively bound and meeting the implemented missing-tools/policy conditions; parsing an approval-policy JSON value is not external enforcement proof. Never-run cases are counted independently of passes. Only failing BLOCKER cases drive that check warning branch, while never-run cases can remain SET_HERE with explanatory text. The newest created widget supplies the widget summary, and saved `isActive` is not a live health probe.

`recordCompanyAiDriftEvent` inserts typed source changes. Automatic resolution reads at most 1,000 unresolved rows; explicit `resolveDriftEvents` can narrow by source after the bounded read. Resolving is an audited state transition and does not by itself execute a model or prove a passing eval. Preserve this distinction in readiness and support language.

## Current Company Evaluation Execution

Public admin actions are `companyEvalRuns.runCheck` and `runBatch`, with company authorization before the Node worker. `companyEvalRunActions.runCompanyCheck` loads an active case, creates an EVAL-purpose thread, and calls `hakkenAssistant.answerInternal`. It records answer evidence from the runtime, then chooses a text-capable grader, preferring independence. Sample count is clamped one through five and the loop can stop after failure. Empty answers fail without spending a judge call; exceptions record not-tested evidence with no invented verdict.

`companyEvals` limits names to 140 characters, prompt/expected behavior to 4,000 each, answers to 12,000, and JSON evidence fields to 8,000. Batch selection is 100 cases, summary reads are 2,000, and must-pass/starter scans take 200. Estimates use two provider calls per sample but actual runtime tools/retrieval can add work. Required-source/memory/skill grading depends on runtime IDs that reached the model, not a search against answer wording alone. A WIDGET target label does not create a real widget session in the worker; all supported labels must be interpreted through the actual answer entry point.

Graded results store model/token/cost evidence in USD. Deleting a case removes at most 500 run records before the parent; it is not an unbounded cascade proof. Check archives, cases, run evidence, and EVAL threads have separate lifecycle ownership. This pass performed no eval, side effect, or privacy erasure operation.

## Central Skills And Memory Application

`companySkills` imports links from the active central catalog rather than supporting independent arbitrary local instruction editing. Runtime `sourceAgentSkillId` resolution uses current central name/instruction/category/risk, excludes missing/archived central records, and returns at most `MAX_SKILLS_PER_COMPANY` (two) with an isCapped flag when appropriate. A central replacement can affect linked tenants without a separate copy synchronization task.

`companyMemories` separates ALWAYS from WHEN_RELEVANT. `MAX_ALWAYS_MEMORIES` is five, and legacy unstamped rows are resolved through application-mode defaults before the final cap. The company suggestion path shares safety, duplicate, rejection-fingerprint, and autonomous-memory policy. Those are distinct from agent skill versions and from the requesting administrator's private notes. Source tests in companyReadiness, companyEvals, companySkills, companyMemories, and suggestion modules provide local examples, not exhaustive live acceptance. No provider or saved-data operation ran during this review.
