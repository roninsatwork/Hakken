# Agent Release Infrastructure Developer Guide

Agent release infrastructure is the implementation behind Developer Ship Checks. It turns a ready draft global agent into a reviewed release candidate, stores the exact agent version being reviewed, records approval and activation evidence, supports scheduled activation, and provides rollback to the previous live snapshot when one exists.

Read this before changing release readiness, release lifecycle mutations, scheduled activation, snapshot comparison, or rollback behavior. For the operator workflow, see [Developer Ship Checks Operator Guide](../operator/developer-ship-checks-operator-guide.md). For the broader launch area, see [Launch, Releases, And Observability](./launch-releases-and-observability.md).

## Product Surface

- `src/app/(dashboard)/admin/releases/page.tsx` renders Developer Ship Checks at `/admin/releases`.
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx` embeds the latest release state and release actions in Agent Studio.
- `convex/releases.ts` owns release readiness queries, release lifecycle mutations, scheduled activation, evidence summaries, snapshot comparisons, and rollback.
- `convex/agentVersioningService.ts` creates or reuses the immutable `agentVersions` snapshot attached to each release.
- `convex/agents.ts` provides `buildAgentReadiness`, which release creation, approval, and activation all re-check.
- `convex/crons.ts` runs `internal.releases.activateDueReleaseCandidates` every minute.

The release center is a platform administration surface. Release queries and mutations require super-admin access. It only creates candidates for global agents, not workflow-owned or company-scoped helper agents.

## Release Data Model

`agentVersions` stores immutable agent snapshots. Release code relies on these fields:

- `agentId` and optional `companyId`
- `versionNumber`
- `snapshotHash` and `snapshotJson`
- `promptHash`, `toolSetHash`, `skillSetHash`, `memoryRevisionHash`, `ruleSetHash`, `modelConfigHash`, and `policyHash`
- `createdAt`

`agentReleases` stores release lifecycle records:

- `agentId` and `agentVersionId`
- `status`: `PENDING_SIGNOFF`, `APPROVED`, `ACTIVATED`, `ROLLED_BACK`, or `CANCELLED`
- `title`, `releaseNotes`, `rollbackPlan`, optional `ownerEmail`, `approvalComment`, `rollbackReason`, and `cancellationReason`
- optional `activationWindowStart` and `activationWindowEnd`
- `readinessJson`, which captures the readiness evidence at candidate creation and is refreshed on approval and activation
- actor ids and timestamps for creation, approval, activation, rollback, and cancellation

Indexes used by the release module are `by_agent_created`, `by_status_created`, and `by_agent_status_created`. Preserve those access patterns if the release query shape changes; the release center intentionally fetches small recent samples rather than scanning all historical releases.

## Readiness Overview

`getReleaseReadinessOverview` loads recent workflow-independent agents, filters them through `isGlobalAgent`, builds readiness for each agent, joins the latest release, and classifies each agent for the release center.

The implementation status values are:

- `DRAFT_BLOCKED`: the agent is inactive and has readiness warnings.
- `READY_FOR_RELEASE`: the agent is inactive and has no readiness warnings.
- `LIVE_NEEDS_ATTENTION`: the agent is active but has activation risk or readiness warnings.
- `LIVE`: the agent is active and currently clear.

The readiness evidence comes from `buildAgentReadiness`, including activation warnings, activation risk, tool bindings, approved knowledge count, active eval fixtures, successful smoke evals, latest smoke eval timestamp, release-gate policy, and model readiness. `getPrimaryNextAction` converts common warnings into operator-facing next actions such as adding tools, adding knowledge, creating eval fixtures, running a smoke eval, passing the release gate, or configuring a usable model.

Do not weaken release readiness in `convex/releases.ts` to make the UI easier to use. If a requirement changes, update the readiness source in `buildAgentReadiness`, the tests, and the operator docs together.

## Candidate Creation

`createReleaseCandidate` performs these checks and writes:

1. Requires super-admin authorization.
2. Loads the agent and rejects missing or non-global agents.
3. Rejects creation when the same agent already has a non-terminal release. Terminal release statuses are `ACTIVATED`, `ROLLED_BACK`, and `CANCELLED`.
4. Calls `buildAgentReadiness` and `assertReadyForRelease`.
5. Creates or reuses an immutable agent version snapshot with `ensureAgentVersionSnapshot`.
6. Normalizes the optional activation window and rejects windows whose end is not after the start.
7. Inserts an `agentReleases` row in `PENDING_SIGNOFF`.
8. Stores release notes, rollback plan, owner email, activation window, and serialized readiness evidence.
9. Writes a `CREATE_AGENT_RELEASE` audit log.

`assertReadyForRelease` is stricter than the visual ready state. It rejects active agents, any readiness warning, a latest smoke eval that is not `SUCCESS`, and release-gate failures or release-gate warnings. Keep creation strict so release records represent reviewable, tested candidates.

## Approval And Cancellation

`approveReleaseCandidate` only accepts `PENDING_SIGNOFF` records. It re-checks readiness, moves the release to `APPROVED`, records the approver and approval comment, refreshes `readinessJson`, and writes an `APPROVE_AGENT_RELEASE` audit log.

`cancelReleaseCandidate` accepts `PENDING_SIGNOFF` and `APPROVED` records. It stores a cancellation reason, marks the release `CANCELLED`, and writes a `CANCEL_AGENT_RELEASE` audit log. Cancellation is the right state for a candidate whose scope, evidence, owner, or launch timing changed before activation.

Approved releases are still not live. Activation is a separate operation so a reviewed candidate can wait for a manual launch or a scheduled window.

## Activation And Scheduled Activation

Manual activation calls `activateReleaseCandidate`, which delegates to `activateReleaseRecord`. Scheduled activation calls the same helper from `activateDueReleaseCandidates`.

Activation requires:

- super-admin authorization for manual activation, or the internal scheduled mutation for cron activation
- release status `APPROVED`
- a fresh successful readiness check
- an open activation window when a window is configured

When activation succeeds, the implementation sets the agent `isActive` flag to `true`, marks the release `ACTIVATED`, stores activation actor and timestamp, refreshes `readinessJson`, and writes an `ACTIVATE_AGENT_RELEASE` audit log. The audit metadata includes whether activation was automated.

The cron in `convex/crons.ts` runs once per minute. It scans recent approved releases in ascending creation order, skips releases whose start window has not opened, skips expired windows, attempts eligible activations, and returns counts for checked, activated, skipped, failed, and failure reasons.

Do not add side effects to scheduled activation that bypass manual release review. The cron exists to activate already-approved candidates when their reviewed launch window opens.

## Snapshot Comparison

Release snapshot comparison is built from the `agentVersions` hashes and summarized for the release center and Agent Studio.

Tracked comparison areas are:

- Prompt and schemas
- Tools
- Memory
- Rules
- Model config
- Policy

When no previous live snapshot exists, the comparison reports an initial release snapshot. When a previous activated or rolled-back release exists for the same agent, the comparison uses the most recent eligible baseline created before the current release and compares the tracked hash fields. The detail builders summarize prompt/schema content, tool handler mappings, active memory counts, rule names/triggers, model configuration, and approval/internet/trigger policy.

If agent snapshots gain new safety-critical fields, update `agentVersioningService`, the hash fields, `versionHashComparisons`, detail summaries, release tests, and this guide. Otherwise operators may miss meaningful changes between candidates.

## Rollback

`rollbackRelease` only accepts `ACTIVATED` releases. It records a rollback reason, writes a `ROLLBACK_AGENT_RELEASE` audit log, and then either restores the previous live snapshot or deactivates the agent.

Previous live baseline lookup considers earlier `ACTIVATED` and `ROLLED_BACK` releases for the same agent, sorted by activation or rollback recency. If a previous version exists, `buildAgentRestorePatch` restores the tracked agent fields that live in the version snapshot:

- name and description
- system prompt, input schema, and output schema
- model id, selection mode, reasoning effort, temperature, and thinking mode
- human approval requirement, internet access policy, and trigger type
- active state

Rollback does not restore every related table. Tool assignments, rules, memories, knowledge rows, eval fixtures, and other joined resources are represented in snapshot comparison evidence, but rollback currently patches the agent row fields listed above. Treat this as an intentional current limitation when investigating incidents and writing rollback plans.

If no previous live snapshot exists, rollback deactivates the agent. This keeps the first production-style release from staying live after a rollback with no safe baseline.

## Release Evidence And Next Actions

`buildReleaseEvidenceSummary` parses stored `readinessJson` and summarizes the evidence attached to the release record. It reports tools, knowledge, fixtures, smoke evals, release gate, and model status as `PASS` or `WARN`. This is stored evidence from the release lifecycle, not a substitute for opening the agent and current run timelines when investigating an incident.

`buildReleaseNextAction` converts lifecycle state and evidence warnings into release-center guidance:

- pending candidates may be ready for sign-off or need evidence review
- approved candidates may need to wait for the activation window, activate now, or be cancelled after an expired window
- activated releases should be monitored
- rolled-back releases require investigation before replacement
- cancelled releases should only be replaced after the cancellation reason is resolved

Keep next-action wording operational. It is used by internal reviewers during release handoff and should not describe future behavior that the code does not enforce.

## Authorization And Audit

All public release queries and mutations call `requireSuperAdmin`. Standard company admins cannot read platform-wide release readiness or mutate release records.

Audit log action types written by release mutations are:

- `CREATE_AGENT_RELEASE`
- `APPROVE_AGENT_RELEASE`
- `ACTIVATE_AGENT_RELEASE`
- `CANCEL_AGENT_RELEASE`
- `ROLLBACK_AGENT_RELEASE`

Include the agent id, agent version id, release id where applicable, reviewer-supplied reasons, and activation-window metadata in new release audit events. Release records are compliance and incident-response evidence, so avoid silent lifecycle changes.

## Verification

Focused coverage lives in:

- `convex/releases.test.ts` for access control, readiness overview, invalid activation windows, candidate creation, approval, activation, evidence summaries, rollback, snapshot comparison, cancellation, scheduled activation, and restore behavior.
- `convex/agentVersions.test.ts` for snapshot creation and reuse.
- `src/app/(dashboard)/admin/releases/page.test.tsx` for release-center UI rendering and actions where present.
- `src/app/(dashboard)/admin/agents/[id]/settings/page.test.tsx` for latest-release visibility and Agent Studio release actions.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
