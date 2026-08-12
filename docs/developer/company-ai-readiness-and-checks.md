# Company AI Readiness And Checks Developer Guide

Last reviewed: 2026-07-30 17:39 BST +0100
Status: current; related readiness and checks plans are still active
Audience: engineers and agents changing company AI readiness, checks, memory, skills, drift, or company AI routes.

## Implementation Scope

Company AI is implemented under
`src/app/(dashboard)/admin/companies/[id]/ai/` and several legacy company detail
routes. It covers company-specific AI setup: overview, knowledge, prompt, rules,
model defaults, checks, memory, skills, usage, and chat logs.

The main routes are:

- `src/app/(dashboard)/admin/companies/[id]/ai/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/new/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/edit/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/memory/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/skills/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/skills/new/page.tsx`
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
- `convex/companyEvals.test.ts`
- `convex/companyLearningLoop.test.ts`
- `convex/companyMemories.test.ts`
- `convex/companyMemorySuggestions.test.ts`
- `convex/companySkills.test.ts`
- `convex/companyReadiness.test.ts`
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
