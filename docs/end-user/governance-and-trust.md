# Governance And Trust

Sonae's Governance area helps a workspace or platform operator explain what AI
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
data handling.

Use it to answer:

- which AI systems need attention
- whether high-risk or public-facing systems are documented
- whether approvals or unattended actions need review
- whether evidence has been exported recently
- whether personal-data requests can be handled from the product

The customer workspace view is scoped to the active workspace. The platform view
can see platform-level evidence and cross-workspace status where the operator is
allowed to see it.

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
Approving lets the run continue. Rejecting or cancelling ends the action and is
confirmed before it happens.

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
summary, remove or dissociate data where the data model allows it, and record
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
