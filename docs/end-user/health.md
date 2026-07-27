# Health

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

A daily check emails every system administrator when the platform is unhealthy, so this screen is somewhere you go because you were told to, not somewhere you have to remember to visit. Delivery needs an email key configured on the deployment; without one the check still runs and records its finding, but no message is sent.

## The Older Detail
- `/admin/agents/[id]/runs`: detailed run timelines linked from the observatory.
- `/admin/agents/[id]/evals`: the checks an agent has to pass, including the ones marked must-pass before it can go live.

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
