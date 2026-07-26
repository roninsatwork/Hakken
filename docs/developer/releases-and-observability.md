# Releases And Observability Developer Guide

Release operations connect draft agents, eval fixtures, agent version snapshots, agent releases, and run observability. This guide covers the implementation that exists now and should be read before changing release operations or the run observatory. For release candidate lifecycle, scheduled activation, snapshot comparison, and rollback internals, see [Agent Release Infrastructure](./agent-release-infrastructure.md). For the sampled agent run health dashboard, see [Run Observatory](./run-observatory.md).

## Product Surface

- `src/app/(dashboard)/admin/releases/page.tsx` renders agent release readiness and recent release candidates.
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx` embeds latest release state, snapshot comparison, and release actions in Agent Studio.
- `src/app/(dashboard)/admin/agents/[id]/evals/page.tsx` renders release-gate fixtures, eval suite presets, and release candidate comparison for one agent.
- `src/app/(dashboard)/admin/run-observatory/page.tsx` renders recent agent run evidence from `api.agentRuns.getRunObservatory`.

Release mutations are super-admin-only. The run observatory accepts admins, but standard admins must have a company id and receive company-scoped data.

## Core Convex Modules

`convex/releases.ts` owns agent release readiness, recent release summaries, latest release lookup, candidate creation, approval, cancellation, activation, scheduled activation, and rollback. Its detailed lifecycle contract is documented in [Agent Release Infrastructure](./agent-release-infrastructure.md).

`convex/agentRuns.ts` owns the run observatory query in addition to run listing, detail, analytics, approvals, replay, cancellation, and internal run writes. The observatory sampling and scoping contract is documented in [Run Observatory](./run-observatory.md).

Related modules include `convex/agents.ts` for `buildAgentReadiness`, `convex/agentVersioningService.ts` for agent version snapshots, `convex/agentEvalFixtures.ts` for seeded fixtures, `convex/agentTemplates.ts` for the agent archetypes used by the agent builder, and `convex/aiTools.ts` for connector readiness.

## Data Model

`agentVersions` stores immutable snapshots for agent release review. Snapshot hashes cover prompt, tools, skills, memory, rules, model config, and policy. `agentReleases` links an agent to an agent version snapshot and stores release status, title, notes, rollback plan, owner, activation window, readiness JSON, reviewer ids, timestamps, approval comments, cancellation reasons, and rollback reasons.

`agentRuns`, `agentToolCalls`, and related run tables supply observatory data. The observatory uses run status, trigger type, company id, provider/model telemetry, costs, token counts, timings, errors, final output, tool call status, side-effect level, and handler mapping.

## Agent Releases

`getReleaseReadinessOverview` loads global agents, builds readiness through `buildAgentReadiness`, joins the latest release, and classifies each agent as `DRAFT_BLOCKED`, `READY_FOR_RELEASE`, `LIVE_NEEDS_ATTENTION`, or `LIVE`.

`createReleaseCandidate` is super-admin-only and only works for global agents. It rejects existing open releases, asserts readiness, creates or reuses an agent version snapshot through `ensureAgentVersionSnapshot`, stores readiness JSON, release notes, rollback plan, owner email, and activation window, then writes an audit log.

`approveReleaseCandidate` rechecks readiness and moves a pending candidate to `APPROVED`. `activateReleaseCandidate` rechecks readiness, enforces activation windows, activates the agent, updates the release, and writes audit evidence. `activateDueReleaseCandidates` is an internal mutation that activates approved candidates whose activation window has opened. `cancelReleaseCandidate` cancels pending or approved candidates. `rollbackRelease` only applies to activated releases; it restores the previous live snapshot when available or deactivates the agent if no previous snapshot exists.

Agent version snapshots store prompt and schemas, tools, skills, memory, rules, model config, and policy hashes. The current release snapshot comparison UI uses the implemented `versionHashComparisons` list in `convex/releases.ts`, which compares prompt and schemas, tools, memory, rules, model config, and policy. Although `agentVersions.skillSetHash` is stored, skill changes are not yet surfaced as a named comparison area. Preserve the existing comparison areas when changing snapshot structure, and add skill comparison explicitly before telling operators that skill changes appear in release diffs.

Agent Studio surfaces reuse the same release backend. The settings page reads `getLatestReleaseForAgent` and can activate, cancel, or roll back the latest release where the lifecycle allows it. The evals page reads `getReleaseCandidateComparison` so reviewers can compare release-gate fixtures against latest and previous eval checkpoints before sign-off.

## Run Observatory

`agentRuns.getRunObservatory` accepts optional `lookbackDays` and `limit`. It clamps lookback to 1-90 days and the result limit to the configured observatory limit. Super admins sample recent runs across statuses from the platform. Standard admins must have `companyId` and receive runs by company.

The query aggregates status counts, trigger counts, total cost, input tokens, output tokens, success rate, failed runs, active runs, average completed latency, model statistics, agent statistics, failure reason counts, tool statistics, and recent run evidence.

The observatory intentionally samples for operator visibility rather than full historical analytics. Use analytics tables for broader cost dashboards and run detail pages for exact per-run timelines.

## Authorization And Audit

Release overview, recent releases, release mutations, and latest release lookup are super-admin-only.

Run observatory uses `requireAdmin`. Non-super-admins without a company id are rejected, and tool calls are filtered by company when summarizing sampled tools.

Audit logs are written for release creation, approval, activation, cancellation, and rollback. When adding new release mutations, include audit metadata with company id, agent id, release id, and human reason fields where applicable.

## Verification

Focused tests include `convex/releases.test.ts`, `convex/agentRuns.test.ts`, `convex/agentVersions.test.ts`, release UI tests, and run observatory UI tests where present.

For documentation-only edits, run `git diff --check`. Before merging code changes in this area, run the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
