---
product: Hakken
documentation_type: Developer guide
feature_area: Agent skill authoring and Markdown import
audience: skill authors and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/agent-skill-authoring-guide.md
last_reviewed: '2026-10-26T14:56:47+00:00'
reviewed_against: current implementation
status: Current
---
# Agent Skill Authoring Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Agent skill authoring and Markdown import
> **Reviewed:** 26 October 2026, 14:56:47 GMT (Europe/London)
> **Source path:** `docs/developer/agent-skill-authoring-guide.md` · **Status:** Current

Use this guide when creating or reviewing reusable Hakken agent skills.

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

Required tools contribute to readiness advice, not execution permissions or a universal activation gate. Attaching a skill does not grant execution rights. Runtime tool use still depends on agent tool bindings and backend policy checks.

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
- The Markdown import mutation creates a new draft, but the current catalog upload immediately follows it with activation. Same-name replacements preserve existing status. Bundle import still starts a draft; these are different entry paths.

The import review compares parsed tool names with active Hakken `aiTools.handlerMapping` values. Use the active mapping controls in the review step to replace aliases or external tool names with real handler mappings before rollout.

## Versioning And Rollout

Saving a skill creates a new immutable skill version when the snapshot changes.

Bindings retain version evidence, but runtime reads current active catalog instructions. Markdown replacement can roll attached agent version references forward. General edits and explicit upgrades have different version behavior; do not promise that an old binding freezes execution text or describe an absent separate skill-detail route as a current screen.

## Review Checklist

Before marking a skill production-ready:

- The instruction is reusable and tenant-neutral.
- Risk level matches the worst credible side effect.
- Required tools are minimal and justified.
- At least two starter eval fixtures exist.
- High-risk behavior has approval, refusal, or threshold coverage.
- The skill has been attached to a test agent and smoke evals pass on the current version.
- Upgrade impact is reviewed for agents pinned to older versions.

## Parser Scope And Honest Tool Hints

The Markdown parser is `convex/utils/skillMarkdownService.ts`, with normalization/contracts in the adjacent skill helpers. Its frontmatter reader is a simple line-based key/value parser, not a full YAML implementation. Quoted scalar fields and recognized headings are useful inputs; complex nested YAML does not automatically become a validated capability contract. Keep instructions explicit in the body and verify the actual preview rather than assuming another tool's SKILL.md format is interpreted identically.

The importer can infer a title from the first heading, a description from opening prose, and risk from recognized frontmatter or body terms. Risk inference is a heuristic, not an independent safety assessment. Use the highest credible effect of the actual tools when reviewing a skill. Required/recommended tool names are extracted from recognized headings and text/backticks; they are hints that must match real active handler mappings before tool execution can succeed.

The example mappings above illustrate shape. They are not a guarantee those handlers are installed in this deployment. Catalog preview compares against bounded active tool metadata and reports unresolved hints. Changing a name in a skill does not install a connector, grant an account permission, set credentials, or bypass company ownership. A good instruction explains what to do when required evidence/tools are unavailable, rather than ordering the model to improvise access.

## Upload Identity And Runtime Consequences

The current upload UI requires an entered name and file. The entered name wins over parsed frontmatter. The backend searches a bounded exact-name set and updates the first non-archived match, while a matching source hash can return unchanged. A re-upload is therefore not always a new independent draft. Review name collisions, old archived namesakes, and the source hash before replacing shared behavior.

Instruction text is capped at 8,000 characters and Markdown/JSON fields at 24,000 under `skillContracts.ts`. A long authoring document can be richer than the instruction extracted from its recognized sections; inspect the preview for what will actually be saved. The runtime's deliberate two-skill limit also means splitting one behavior into many overlapping skills is not a useful workaround for a large prompt.

Shared catalog changes can affect linked companies and agents. Active runtime text comes from the current central record, while version IDs support evidence and fixture currency. Markdown replacement additionally updates agent bindings through the rollout helper. Archive stops active runtime resolution; delete removes attachments and a bounded version set. None of these operations rewrites historical runs or proves every external side effect of an old run has been reversed.

## Fixtures Are Evidence, Not Publication Approval

The fixture counts in this guide are authoring recommendations. The backend does not universally refuse to activate an agent because a high-risk skill lacks a passed smoke test. Contract-only smoke evaluation checks configuration; model-graded evaluation runs real runtime work; explicit rehearsal suppresses selected effects. Match the fixture to the evidence needed and review whether its action is permitted before running it. Documentation maintenance runs none of these evaluations.

Write rubrics around observable behavior, justified refusals and source use. Avoid a fixture that merely restates the skill instruction and passes because the configured mapping exists. An empty expected tool plan in a rehearsal proves completion rather than exact tool choice, and extra handlers do not automatically fail that grader. A passed local sample does not establish production connector acceptance, calibrated confidence, or tenant security across every caller.

Use [configuration/catalogs](./agent-configuration-and-catalogs.md) for actual import, binding, bulk-operation and cap details, and [runtime operations](./agent-runtime-operations.md) for evaluation/learning evidence. This authoring review inspected parser and test source without uploading a skill, activating an agent, generating a candidate, or calling a provider. Product direction and dated records remain unchanged.
