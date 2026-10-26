---
product: Hakken
documentation_type: Developer guide
feature_area: governance, audit evidence and personal data
audience: governance readers, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/governance-and-trust.md
last_reviewed: '2026-10-26T10:31:26+00:00'
reviewed_against: current implementation
status: Current
---
# Governance And Trust Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Governance, audit evidence and personal data
> **Reviewed:** 26 October 2026, 10:31:26 GMT (Europe/London)
> **Source path:** `docs/developer/governance-and-trust.md` · **Status:** Current

Governance is the evidence layer over Hakken's AI systems. It spans platform
super-admin routes, customer workspace routes, Convex governance queries/actions,
audit exports, evidence packs, personal-data rights, and conformance checks.

Read this before changing:

- `src/app/(dashboard)/admin/governance/**`
- `src/app/(dashboard)/app/governance/**`
- `convex/governance*.ts`
- `convex/evidencePack*.ts`
- `convex/personalData*.ts`
- `convex/conformanceService.ts`
- approval, audit-log, policy, or AI-register behavior

Historical implementation intent is recorded in
[Governance And Trust Plan](../plans/active/governance-and-trust-plan.md).

## Routes

Platform routes:

- `/admin/governance`
- `/admin/governance/register`
- `/admin/governance/policies`
- `/admin/governance/audit-trail`
- `/admin/governance/audit-trail/[id]`
- `/admin/governance/approvals`

Workspace routes:

- `/app/governance`
- `/app/governance/register`
- `/app/governance/policies`
- `/app/governance/audit-trail`

The workspace overview uses the same standing components as the platform view,
but scoped to the active workspace. The workspace view intentionally does not
own the platform-wide approval queue.

## Backend Ownership

`convex/governanceDashboard.ts` exposes the governance overview. It combines
register, policy, retention, approval, evidence, and personal-data signals into
stateful checks. The current screen reads rollup/snapshot data for expensive
estate-wide counts instead of collecting the full estate during page render.

`convex/governanceRegister.ts` builds the AI register from current assistants,
widgets, and workflows. `convex/governanceRegisterService.ts` owns conversion,
missing-field descriptions, risk sorting, filtering, and summaries.

`convex/governanceActivity.ts`, `convex/governanceRollups.ts`,
`convex/governanceRollupService.ts`, and
`convex/governanceActivityService.ts` summarize recent AI activity, side-effect
levels, oversight outcomes, busiest systems, and risk mix. Scheduled rollup
rebuilds keep overview reads bounded.

`convex/governancePolicyService.ts` turns active AI rules into governance policy
records with priority and scope filters. Policy editing remains in the AI rule
surfaces; Governance is the read/evidence view.

`convex/evidencePack.ts` gathers and records evidence-pack exports.
`convex/evidencePackService.ts` owns period handling, plain-language action and
outcome descriptions, run narration, decision/policy summaries, and counts.

`convex/personalData.ts` implements subject-access and erasure actions.
`convex/personalDataService.ts` defines table treatment rules, indexes, section
summaries, erasure tallies, and retained-exception descriptions.

`convex/conformanceService.ts` checks whether observed tool side effects stay
inside an agent's configured risk rating and describes any findings.

## Authorization

Governance functions use governance-specific wrappers and must preserve the
difference between platform scope and workspace scope. Platform governance is a
super-admin, read-only console, or auditor evidence concern depending on the
route and action. Workspace governance must only expose records belonging to the
active company.

Personal-data erasure is a super-admin action. Subject-access production and retained-exception reads are governance actions. The current subject-access implementation lacks a caller-company comparison; see the scope discrepancy below before claiming tenant isolation.

Do not make a UI-only authorization assumption. Any new Governance query,
mutation, or action must enforce role and company access in Convex.

## Audit And Evidence

Governance reads from `auditLogs`, `agentRuns`, `agentRunApprovals`,
`agentToolCalls`, `aiRules`, `agents`, `widgets`, and `workflows`. The audit
trail pages use paginated reads for screen display and a separate export path for
CSV output.

Evidence packs should describe what happened in words a customer can read. If a
new run status, trigger type, side-effect level, or policy shape is added, update
the evidence-pack service, UI copy, and tests together.

## Personal Data Contract

Personal-data rules are table-specific. A table can erase rows, dissociate a
person from retained operational records, or retain records for audit/legal
reasons. Keep `PERSONAL_DATA_RULES`, `PERSONAL_DATA_INDEXES`, subject-access
sections, and erasure behavior aligned.

Do not add a new table containing personal data without deciding how subject
access and erasure should treat it.

## Tests And Verification

Focused tests include:

- `convex/governanceDashboardService.test.ts`
- `convex/governanceRegisterService.test.ts`
- `convex/governancePolicyService.test.ts`
- `convex/governanceActivityService.test.ts`
- `convex/governanceRollupService.test.ts`
- `convex/governanceRollups.test.ts`
- `convex/evidencePack.test.ts`
- `convex/evidencePackService.test.ts`
- `convex/personalData.test.ts`
- `convex/personalDataService.test.ts`
- `convex/conformanceService.test.ts`

For documentation-only edits, run `git diff --check` and the documentation
coverage scans. For implementation changes, also run the focused tests above
and the repo gates from `AGENTS.md`.

## Actual Role And Scope Contracts

`GOVERNANCE_READ_ROLES` in `convex/authz.ts` contains ADMIN, SUPER_ADMIN, READ_ONLY and AUDITOR. `governanceQuery` and `governanceAction` enforce this role list; the wrapper does not automatically scope every later database read. Handlers must choose that scope themselves. The register, dashboard, activity and evidence pack use SUPER_ADMIN or READ_ONLY for platform scope. Other readers use `getActiveCompanyId` and include no-company records as shared platform systems. The evidence-pack action explicitly rejects a non-platform reader with no active company.

Audit APIs implement a different rule. `getAuditPage`, `getAuditEntry`, filter options and `getAuditExport` use SUPER_ADMIN alone for platform scope. Unauthorized public-query callers receive empty output rather than an authentication exception. Non-platform callers without a company also receive empty output. Company/time indexes constrain the base read before other filters. Therefore READ_ONLY is not a universal cross-company audit permission merely because it can view platform model or register information.

`produceSubjectAccess` is a governance action that calls `findByEmail` and then walks the person's manifest references. `findByEmail` canonicalizes and resolves account identity, refusing duplicates, but neither this helper nor the public action compares the target with the caller's active company. Both overview pages render `PersonalDataPanel`. This is a concrete authorization discrepancy requiring separately authorized source work; route wording does not establish a backend company boundary. Erasure remains a `superAdminAction`, blocks self-erasure and uses a separate durable worker. Do not change either policy as part of documentation maintenance.

## Bounded Registers, Summaries And Exports

The register reads up to 1,000 agents, widgets and workflows each before applying scope. Owner candidates similarly scan a maximum of 1,000 users. It resolves account names and checks an agent's indexed recent runs for thirty days, capped at 500. A selected company cannot recover entries excluded before filtering. These are bounded implementation views, not a demonstrated complete estate inventory at every scale. Assistant risk is explicit or UNRATED; widget purpose comes from its greeting and widgets remain UNRATED in the conversion helper. Public-facing status is derived from non-empty allowed domains, not a verified external installation.

`rebuildGovernanceRollups` runs through `jobLedger.runJob` every ten minutes. It rebuilds recent two-day buckets and estate snapshots; raw activity reads have an 8,000-row ceiling with an extra sentinel, estate reads a 500-row ceiling with an extra sentinel. Conformance uses seven days of stored observations. `governanceDayRollups` uses `by_date`; rows carry company keys, counts and computation times. Older stored summaries are not automatically recounted merely because a user selects an older calendar period.

The dashboard reads estate summaries, up to 2,000 pending approvals and the parsed `PURGE_PIPELINES_CONFIG`. Retention checks assess configuration, not actual deletion completion. `getGovernanceActivity` combines the selected UTC calendar span with approval reads capped at 2,000 per decided status and 2,000 pending. Decided reads constrain request timestamps; pending reads are not bounded by the selected period. Its returned `truncated` value comes from merged rollup buckets, so it is not an independent proof that every live approval read stayed below its cap.

`evidencePack.gather` scans at most 500 rows for each system/rule collection and the approval collection, and 400 newest runs before scope and time filtering. It narrates at most 100 runs and reads at most forty tool calls per narrated run. Consequently an old-period pack can miss runs displaced by newer activity even when the chosen period itself is small. Active policies are current rule records; this is not historical policy reconstruction. `produce` passes caller-derived scope and records the export after gathering. If recording fails, the action can fail even though gathering succeeded; there is no promise that all retries are one logical export event.

Audit CSV export reads 5,001 rows to detect the 5,000 base-row limit. Search, action, actor and requested company filters are applied after this bounded read. A short filtered CSV can still omit older matching rows. Its mutation records the export action, including exported row count and truncation evidence. Keep those semantics distinct from a complete paginated archive or a provider revenue report.

## Personal-Data Manifest And Durable Erasure

`PERSONAL_DATA_RULES` declares ERASE, DISSOCIATE or RETAIN per table and referenced field. `PERSONAL_DATA_INDEXES` selects efficient user-key indexes; unindexed fallbacks scan pages and match in code. Subject access uses indexed pages of 500 or scan pages of 200, with at most 200 pages per field and a per-section truncation flag. Rows matching multiple fields can appear more than once. The export is reference-based and does not search arbitrary nested text, email strings or storage bytes. `collectPage` blanks fields named in `redactFields`, including private personal-memory text.

Erasure processes twenty pages per action segment and checkpoints rule index, field index, cursor and tallies in `personalDataErasureRuns`. The comment's approximate 4,000-write estimate should not be treated as a strict bound: indexed pages can contain 500 rows. It deletes ERASE rows, clears designated fields on DISSOCIATE rows, and leaves RETAIN rows. Notifications are erased; generic tasks retain the work while clearing assigned/creator references according to the manifest. Dissociating upload reservations does not itself delete attached storage objects or inspect every business document for personal text.

Large requests schedule `continueErasure` automatically. `findRunningErasure` returns an existing running job to avoid a normal second submission starting another background run; the initial action still performs a segment before creating a durable run, so do not claim a fully transactional one-request lock across concurrent initial actions. Worker failures increment attempts, retry while attempts are below five and schedule exponential minute delays capped at fifteen minutes. Final failure preserves FAILED status for operator review. Progress saving and scheduling are separate action calls; a crash between them is not demonstrated recovered by an independent watchdog in this inspected path.

`finalizeErasure` purges auth identity and deletes the user in one mutation with the completion audit and optional run success status. Its success describes the declared manifest, not recursive deletion of every child record or external supplier copy. `erasureStatus` uses `superAdminQuery`, including READ_ONLY reads under that wrapper, while starting erasure remains SUPER_ADMIN-only. No erasure, export or automatic test was executed in this documentation review; test files listed above establish available source coverage, not live acceptance.
