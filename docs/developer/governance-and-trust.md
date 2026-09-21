# Governance And Trust Developer Guide

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

The active product record is
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

Personal-data erasure is a super-admin action. Subject-access production and
retained-exception reads are governance actions and must not expose unrelated
tenant data.

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
