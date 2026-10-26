---
product: Hakken
documentation_type: End-user guide
feature_area: Health and operational evidence
audience: authorized administrators and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/health.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Health

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Health and operational evidence
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/end-user/health.md` · **Status:** Current


One screen answers two questions: is anything wrong, and how have your agents been running. Use it after changing an agent, switching a model, enabling a tool, or investigating something that went wrong.

It was two screens — Run Observatory and System Health — which asked the same question at two altitudes and both led with counters that read zero on a healthy platform.

For agent setup tasks, see [Agent Setup And Configuration](./agent-setup-and-configuration.md). For run-level investigation, see [Agent Operations And Review](./agent-operations-and-review.md).

## Where To Find It

`/admin/health`, under Maintenance.

## What It Tells You

The screen opens with a verdict: either **Nothing needs attention**, or a count of the things that do.

Anything needing attention is listed by name — approvals nobody has answered, runs that failed, runs that started and never finished, tool calls that failed, repeated failures from a model provider, agents near their spend limit, schedules that should have fired. Each one links to the screen where it is fixed. Nothing is listed while it is at zero.

Beneath that is the last seven days: how many runs, how many failed, what was spent, and how long a run takes on average — then the runs themselves, each linking to its own timeline.

## You Are Emailed When Something Is Wrong

A daily local-health check queues an alert in the Outbox when a signal exists. Configured recipients take precedence, with a fallback of up to ten super-admin addresses. Actual delivery depends on the Outbox and provider state; a missing inbox message does not prove the platform was healthy.

## The Older Detail
- `/admin/agents/[id]/runs`: detailed run timelines linked from the observatory.
- `/admin/agents/[id]/evals`: the checks and must-pass evidence reported as readiness advice; current activation does not universally enforce a passing gate.

The run observatory shows a platform view for super admins, or a company-scoped workspace view for admins with a company context.

## What It Shows

The observatory is a recent-health dashboard, not a full historical analytics report. The current page uses a 7-day view and shows:

- sampled runs
- success rate
- failed runs
- active runs
- sampled cost
- average latency
- recent run evidence
- status mix
- failure reasons
- agents needing attention
- tool risk
- model usage
- trigger counts
- token sample notes

Each recent run links to its agent run timeline for exact details.

## How To Use The Evidence

Use the observatory after:

- switching an agent live
- changing model defaults
- enabling or editing tools
- changing prompts, rules, schemas, or skills
- resolving an incident
- noticing cost or latency changes

Start with failures, active runs, and pending approvals. Open run timelines for failed, cancelled, or expensive runs. Convert repeatable failures into checks where appropriate. Review tool risk when failures involve write, destructive, external, approval-required, or denied tool calls.

Use model and trigger breakdowns to spot whether a regression is tied to a model change, schedule, workflow, webhook, or manual launch pattern.

## Scope And Privacy

Super admins can use the platform observatory view. Company admins with a company context receive a workspace-scoped view where supported by backend access.

Run evidence can include sensitive operational context. Treat observatory data, run timelines, tool previews, failure reasons, and cost signals as operational records. Do not copy them into external support notes unless that destination is approved for customer data.

## Practical Flow

After switching an agent live or changing how it works:

1. Open `/admin/health`.
2. Check failures, active runs, high-cost agents, risky tools, and failure reasons.
3. Open affected run timelines.
4. Review tool calls, approvals, errors, and replay options.
5. Add feedback or create checks from repeatable failures.
6. Switch the agent back to draft if it is behaving unacceptably, and keep it there until new evidence passes.

A change should not be considered complete until someone has watched recent run evidence and confirmed the agent behaves as expected under real usage.

## Read The Window And Sample

The normal Health view asks for seven days. Its run observatory retains at most 120 recent runs and a bounded sample of 300 tool calls. The broader system report also caps source reads and examples. These are practical investigation views, not complete archives or billing ledgers. A failure outside the returned population can still exist, and an empty list does not certify that every historical operation succeeded.

Run cost is recorded supplier spend in USD. The high-cost signal focuses on AI model cost and excludes selected paid service purchases; other usage screens can include different sources. An average run duration describes the sampled completed work, not a response-time guarantee for every customer request. Record scope, window and checked time when sharing a diagnostic result.

## Follow The Original Evidence

Start with a named warning and open the linked run, approval, schedule, provider setting or source report. A pending approval can be waiting for a legitimate human decision; a scheduled job may be paused or missing configuration. Reading Health does not retry, cancel or repair either. Decide the actual operation only after inspecting its consequences and the permitted recovery path.

Auth diagnostics is a separate ledger for sign-in/invitation events. Its screen loads the newest 500 accessible events and filters that returned list; All is not an unlimited archive search. Company users do not receive every unscoped platform sign-in attempt. A started or simulated email event is not proof of a completed identity-provider callback or delivered magic link.

Governance audit pages provide indexed dates, direct entry detail, and bounded export. The older audit-detail compatibility route searches a recent feed, so a missing old item there can still exist in the proper Governance view. Audit history describes recorded actions, and coverage is not perfectly uniform across every historical feature. Do not infer that missing evidence proves no action occurred.

## Scope And Alert Delivery

System Health resolves ordinary admins to their active company, while the run observatory service uses its own company selection branch. A platform operator should compare the returned scope before assuming all panels reflect an impersonated workspace in exactly the same way. Admin layout access and backend evidence permissions remain separate, especially for read-only and auditor accounts.

The alert cron is registered daily at 00:25 UTC and normally reports a seven-day window. The queue identity includes alert type and report dates, limiting duplicate queue entries for that identity. It does not establish mailbox delivery, resolution by an operator, or a fresh independent provider probe. Inspect the Outbox's own state when an alert should have arrived.

Optional error monitoring covers unexpected application errors separately and needs deployment configuration. Silence from monitoring can mean it is disabled. No email, telemetry test, provider probe, model call, repair script, run replay or destructive action was executed for this documentation review. See [System health and maintenance](./system-health-and-maintenance.md) and [operational diagnostics](./operational-diagnostics-and-retention.md) for the more detailed controls and retention boundaries.

## Share useful diagnostic context

When reporting a warning, name the company or website selected, the screen, the reported period and the linked run or event. Explain the outcome you expected: a refreshed report, a completed approval, or a delivered notification. Those outcomes travel through different records, so a green indicator in one panel cannot answer every question. Keep credentials, browser storage and private message text out of screenshots or copied reports; the row identity and safe error wording are usually the useful starting evidence.
