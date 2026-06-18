# Developer Ship Checks Operator Guide

Developer Ship Checks is the release-review layer for draft agents. Use it when an agent looks ready in Agent Studio, but should not become live until a developer or operator has reviewed the evidence, recorded sign-off, and confirmed the launch window.

This is not a customer self-serve launch flow. It is a governed handoff between agent configuration, release evidence, and controlled activation.

## Where To Work

- Agent Studio: `/admin/agents/{agentId}/settings`
- Developer Ship Checks: `/admin/releases`
- Agent evals: `/admin/agents/{agentId}/evals`
- Agent runs: `/admin/agents/{agentId}/runs`

## Release States

- Pending sign-off: a release candidate exists and needs reviewer approval or cancellation.
- Approved: the candidate passed sign-off and can activate manually or when its activation window opens.
- Activated: the release is live and should be monitored through recent runs.
- Rolled back: the release was pulled back with an operator reason. If a prior live snapshot exists, rollback restores that snapshot; otherwise the agent is deactivated.
- Cancelled: the candidate was stopped before activation because scope, evidence, or timing changed.

## Standard Flow

1. Prepare the draft agent in Agent Studio.
2. Run smoke evals and release-gate evals until readiness is clear.
3. Open Developer Ship Checks and find the ready agent.
4. Set the release owner and optional activation window.
5. Create the release candidate.
6. Review release evidence, snapshot comparison, owner, rollback plan, and recommended next action.
7. Add an approval comment and approve the candidate.
8. Activate manually, or let scheduled activation run when the reviewed launch window opens.
9. Monitor recent runs after activation.
10. Roll back with a clear reason if production-style evidence regresses.

## What To Review Before Approval

- Tools: required tools are attached and safe for the agent's purpose.
- Knowledge: relevant approved knowledge is present.
- Smoke evals: at least one successful smoke eval exists.
- Release gate: required fixtures are passing and no release-gate warning is present.
- Model config: the agent resolves to a usable model configuration.
- Snapshot comparison: prompt, tools, rules, memory, model, and policy changes are understandable.
- Rollback plan: the operator knows what to do if the release behaves badly.

## Activation Windows

Activation windows are optional but useful for reviewed launches.

- If a window has not opened, Activate is blocked and the UI shows when it opens.
- If a window is open, the release can be activated manually.
- If a window closes before activation, the release should be cancelled or replaced.
- A cron checks due approved releases every minute and activates candidates whose reviewed start window has opened.

## Rollback Behavior

Rollback always records a reason.

If the agent has a previous live release snapshot, rollback restores the prior tracked agent configuration and keeps the agent active. If there is no previous live release, rollback deactivates the agent.

After rollback, review recent runs and the snapshot comparison before creating a replacement candidate.

## When To Cancel Instead

Cancel a candidate when the release should not ship but has not gone live yet.

Good cancellation reasons include changed scope, stale evidence, wrong owner, expired launch window, missing fixture coverage, or a developer decision to rebuild the candidate.

## Quick Mental Model

Agent Studio answers: is this agent configured and testable?

Developer Ship Checks answers: should this exact version ship, who approved it, when can it go live, and how do we undo it safely?
