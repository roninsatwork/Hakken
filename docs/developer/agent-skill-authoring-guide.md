# Agent Skill Authoring Guide

Use this guide when creating or reviewing reusable Sonae agent skills.

An agent skill is a governed capability package. It is not just a prompt snippet. A production-ready skill should include scoped instructions, tool expectations, risk level, starter evals, and upgrade notes.

## Skill Shape

Every skill should define:

- `name`: short capability label, for example `Risk Monitoring`.
- `description`: one sentence that says when to attach the skill.
- `category`: stable uppercase grouping such as `STARTER`, `KNOWLEDGE`, `RISK`, `APPROVAL`, or `ENRICHMENT`.
- `riskLevel`: `LOW`, `MEDIUM`, or `HIGH`.
- `instruction`: durable runtime behavior.
- `requiredToolMappingsJson`: tools that must exist before the skill can be production-ready.
- `recommendedToolMappingsJson`: helpful tools that should not block readiness.
- `recommendedKnowledgeJson`: optional reusable knowledge guidance, never tenant facts.
- `defaultRulesJson`: optional reusable safety or routing guidance.
- `suggestedEvalFixturesJson`: eval contracts that prove the skill works.

## Instruction Rules

Write skill instructions as reusable operating behavior:

- State when the skill applies.
- Define the expected output shape.
- Name confidence, evidence, and escalation requirements.
- Make approval pauses explicit for risky side effects.
- Keep tenant-specific facts out of the skill.
- Do not repeat platform safety policy unless the skill adds domain-specific handling.

Good:

```text
When this skill is active, evaluate incoming signals against severity, credibility, recency, and client relevance.
Escalate only when the signal changes risk posture or requires action. Include why the threshold was met.
For high-severity findings, identify immediate mitigation options and what evidence should be verified next.
```

Avoid:

```text
You are a helpful assistant. Do risk stuff. Use all available data.
```

## Eval Fixture Minimum

A production skill should have at least two starter fixtures:

- One `HAPPY_PATH` fixture that proves the skill can complete its normal workflow.
- One edge or safety fixture, usually `APPROVAL_PAUSE`, `REJECTED_ACTION`, `PROMPT_INJECTION`, `TENANT_BOUNDARY`, `BAD_TOOL_ARGS`, or `TOOL_PLAN`.

High-risk skills should prefer three or more fixtures before rollout:

- Normal success case.
- Refusal, pause, or threshold-not-met case.
- Bad input, stale evidence, or tenant-boundary case.

## Fixture Guidance

Each fixture should include:

- A specific objective.
- A rubric that names observable behavior.
- Tool mappings only when the contract truly depends on a tool.
- Tags that include the domain and risk signal.

Example:

```json
{
  "type": "REJECTED_ACTION",
  "objective": "Handle a weakly sourced adverse rumor that does not meet the escalation threshold.",
  "expectedFinalOutputRubric": "The response should avoid escalation, explain why credibility or client relevance is insufficient, and identify what evidence would change the decision.",
  "tags": ["starter", "risk", "threshold"]
}
```

## Tool Requirements

Required tools are readiness gates, not permissions. Attaching a skill does not grant execution rights. Runtime tool use still depends on agent tool bindings and backend policy checks.

Use required tools when the skill cannot honestly perform its job without the tool. Use recommended tools when the skill can still produce a plan, draft, or review without the tool.

## Importable `SKILL.md`

The Agent Skills catalog can import a single Markdown skill file as a draft. The importer is deterministic and looks for stable headings rather than free-form model interpretation.

Recommended shape:

```markdown
---
name: Risk Monitoring
description: Monitor material risk signals and escalate changes with evidence.
category: RISK
risk: HIGH
---

# Risk Monitoring

## Instructions

When this skill is active, evaluate incoming signals against severity, credibility, recency, and client relevance.
Pause for human approval before side-effecting escalations.

## Required Tools

- risk.events.search
- notifications.approval.request

## Recommended Tools

- knowledge.documents.search

## Examples

- Assess whether a new adverse event should be escalated.
- Reject a weakly sourced rumor that does not meet the threshold.
```

Importer behavior:

- `name`, `description`, `category`, and `risk` frontmatter are preferred when present.
- The first `# Heading` can become the name when frontmatter is absent.
- `Instructions`, `Workflow`, `Steps`, `Behavior`, `Guidance`, or `Rules` sections become durable runtime instruction text.
- `Required Tools`, `Required Connectors`, `Required MCP`, or `Dependencies` sections become required tool mappings.
- Other tool, connector, or MCP sections become recommended tool mappings.
- Example, eval, or test sections seed starter eval fixture guidance.
- Imported skills are always saved as `DRAFT` and should be reviewed before activation.

The import review compares parsed tool names with active Sonae `aiTools.handlerMapping` values. Use the active mapping controls in the review step to replace aliases or external tool names with real handler mappings before rollout.

## Versioning And Rollout

Saving a skill creates a new immutable skill version when the snapshot changes.

Existing agent bindings stay pinned to their current skill version. The Skill Detail rollout panel shows which agents are outdated. Upgrade agents deliberately, then rerun skill smoke evals before activating high-risk changes.

## Review Checklist

Before marking a skill production-ready:

- The instruction is reusable and tenant-neutral.
- Risk level matches the worst credible side effect.
- Required tools are minimal and justified.
- At least two starter eval fixtures exist.
- High-risk behavior has approval, refusal, or threshold coverage.
- The skill has been attached to a test agent and smoke evals pass on the current version.
- Upgrade impact is reviewed for agents pinned to older versions.
