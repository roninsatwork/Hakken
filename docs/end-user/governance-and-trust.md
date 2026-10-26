---
product: Hakken
documentation_type: User guide
feature_area: governance, audit evidence and personal data
audience: governance readers, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/governance-and-trust.md
last_reviewed: '2026-10-26T10:31:26+00:00'
reviewed_against: current implementation
status: Current
---
# Governance And Trust

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Governance, audit evidence and personal data
> **Reviewed:** 26 October 2026, 10:31:26 GMT (Europe/London)
> **Source path:** `docs/end-user/governance-and-trust.md` · **Status:** Current

Hakken's Governance area helps a workspace or platform operator explain what AI
systems exist, what rules govern them, what happened recently, and what evidence
can be handed to an auditor or customer.

There are two views:

- `/admin/governance` for platform super admins.
- `/app/governance` for a customer's own workspace view.

Both views are read-focused. They make evidence visible without turning every
governance question into an AI-configuration task.

## Governance Overview

The overview shows the current governance standing. It combines checks for AI
systems, policies, activity, approvals, retention, evidence exports, and personal
data handling. Current overview cards read precomputed rollups/snapshots where
available so the page does not sweep the whole operational estate every time it
opens.

Use it to answer:

- which AI systems need attention
- whether high-risk or public-facing systems are documented
- whether approvals or unattended actions need review
- what evidence is available for the period under review
- whether personal-data requests can be handled from the product

The normal register and standing view includes the active workspace plus platform-wide systems. Personal-data exports have a separate scope caveat described below. The platform view
can see platform-level evidence and cross-workspace status where the operator is
allowed to see it. Read-only and auditor-style access can inspect governance
evidence without receiving normal configuration write controls.

## AI Register

The AI register lists AI systems that exist in the product, including assistants,
widgets, and workflows. It is built from current records rather than filled in by
hand, so newly configured systems appear without a separate manual register step.

The register highlights incomplete records. An entry can need attention when it
is missing a purpose, an owner, or a risk rating. Filters and count chips let an
operator narrow the list to incomplete, unrated, high-risk, public-facing, or
unattended systems.

## Policies

The policies page lists active AI rules in force. It is deliberately separate
from the AI rule editor: governance readers need to know what rules exist, while
AI administrators need to change them.

Policies can be reviewed by priority and scope:

- everywhere
- one workspace
- one agent

Critical or unnamed rules should be reviewed carefully because they either carry
high operational weight or lack enough explanation for a governance record.

## Audit Trail

The governance audit trail shows privileged and operational events. It supports
search, time-period filtering, action filtering, person filtering, workspace
filtering, detail pages, and CSV export.

Exports are capped when necessary and say when they were truncated. Treat an
export as evidence for the selected filters, not as a permanent full archive of
all platform history.

## Approvals

The governance approvals route shows pending agent approvals. Approvals can be
expanded to inspect the requested tool, side-effect level, message, and payload.
Super admins can decide approvals: approving lets the run continue; rejecting or cancelling ends the action and is confirmed before it happens. Governance read access alone does not grant that decision permission.

Use this queue when an automated process is waiting for a human decision.

## Evidence Packs

Evidence packs summarize recent AI activity in a form that can be exported and
shared. They include what ran, what actions were taken, what decisions were
recorded, which policies were active, and the scope of the evidence.

Evidence packs are designed for explanation. They do not replace the underlying
audit trail or run logs when a detailed investigation is needed.

## Personal Data

The governance view includes personal-data tools for subject access and erasure
workflows. These help an operator find records by email, produce a subject-access
summary, request removal or dissociation where the manifest allows it, and explain
exceptions when data must be retained.

Personal-data actions are sensitive. Check the target email and workspace before
using them, and keep any exported evidence in the appropriate secure location.

## Practical Guidance

Use Governance before customer reviews, security reviews, and operational
handoffs. Start with the overview, inspect incomplete register entries, check
policies, export evidence only for the period needed, and use the audit trail
for event-level detail.

Do not use the Governance area to bypass AI administration. If a rule, model,
agent, widget, or workflow needs changing, make the change in its owning admin
area and then return to Governance to verify the evidence reads correctly.

## Read The Scope Before Sharing Evidence

Governance readers include company admins, platform super admins, READ_ONLY accounts and AUDITOR accounts. These roles do not all receive identical records. The register, overview and evidence pack treat SUPER_ADMIN and READ_ONLY as platform readers. Other governance readers receive their active workspace plus records that have no company, because a global assistant can serve a customer workspace. The audit trail uses a stricter platform rule: only SUPER_ADMIN receives platform-wide audit rows; the other roles need an active company and receive that company's rows. An empty audit screen therefore does not prove that no platform activity occurred.

The personal-data panel appears on both overview routes. Its subject-access action currently looks up the supplied email without comparing the found account with the caller's company. This differs from the workspace limitation expected of other customer governance surfaces. Treat subject-access exports as requiring platform oversight until that authorization difference is resolved in separately approved application work. This documentation review did not exercise the action or export anyone's data. Restricting who operates a panel is not a substitute for repairing a backend permission boundary.

The overview's standing is an operational signal, not a legal certification or proof that every private-data request has been completed. It checks missing ratings, incomplete records, approvals, public-facing systems, conformance and retention configuration. It does not currently establish a complete account of every data store or external service. The dashboard builds an approval link for a workspace even though a workspace approval route is not implemented; use the platform queue with an authorized super admin instead of expecting that link to grant access.

## Use Activity And Evidence Packs Carefully

Activity uses a calendar-period picker and stored UTC day buckets. The screen can show recent runs, unfinished work, side effects, waits for people and busy assistants. Pending approvals remain visible regardless of the selected period, while decided approvals are selected by their request time. A long-waiting approval is therefore not hidden simply by choosing a recent month. Counts are periodically rebuilt, so changing a configuration does not guarantee an immediately matching overview card.

The rollup is scheduled every ten minutes and refreshes the recent two days. A selected older period can contain previously stored day summaries; it is not a fresh recount of all underlying records. Respect any incomplete-data indication. A register entry's recent run figure also has a ceiling, so it is a sense of activity rather than a billing or usage accounting total.

An evidence pack combines current systems and rules with bounded recent run narratives and approval records. It is produced on request and downloaded through the browser. The export itself is recorded for governance evidence. Its system descriptions reflect current records, not guaranteed historical versions of every rule at the moment an older run happened. The pack is consequently useful for explaining an investigation, but should be read alongside the audit trail and relevant run detail.

The pack reads a bounded newest set of runs before applying the chosen period. A quiet old month can have little or no narrative coverage when newer activity has filled that read window. Selecting a smaller old period does not necessarily recover the missing runs. Preserve the limitations included with the pack, identify the selected period and scope in the receiving record, and ask an authorized operator for a separate investigation when complete archival evidence is required.

## Subject Access And Erasure Outcomes

Subject access accepts an email, resolves one canonical account and downloads JSON. An empty or unknown address produces an error; duplicate canonical identities produce a repair-required conflict rather than selecting an arbitrary person. The export follows a table manifest with declared user-reference fields. Some private personal-memory text is deliberately redacted for the administrator producing it. It is not a search for every occurrence of an email inside arbitrary chat text or an external supplier database.

Erasure is a separate super-admin action, requires confirmation, and refuses to erase the account currently performing it. It treats different rows differently: personal notifications, sign-in records and recurring personal tasks are deleted; shared work such as generic tasks can remain with the person's reference removed; audit and approval evidence is retained with stated exceptions. Attached business-file bookkeeping can remain after the uploader is dissociated. Do not describe every retained item as an erasure failure, or describe success as proof that every uploaded byte and free-text mention disappeared.

Large erasures continue in the background. A queued response means work remains; the panel follows the returned run until success or failure and shows the resulting summary. Normal transient failures receive bounded automatic retries. A failed run is an operator investigation point, not permission to repeatedly submit the request or silently report completion. The review inspected these source paths without performing any destructive action.

For day-to-day use, first identify the question and authorized scope, inspect the relevant records, then export only evidence needed by its recipient. Keep exported JSON and evidence packs within the customer's agreed handling process. Configuration or permission problems belong with the owning operator; governance readers should not try to repair them through unrelated screens. Current implementation evidence includes `convex/governanceDashboard.ts`, `governanceRegister.ts`, `evidencePack.ts`, `auditLogs.ts`, `personalData.ts` and the shared governance panels. The historical implementation plan remains useful context, not proof of deployed acceptance.
