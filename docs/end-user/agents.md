---
product: Hakken
documentation_type: user guide
feature_area: agent configuration and core runtime
audience: platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/agents.md
last_reviewed: '2026-10-26T15:14:20+00:00'
reviewed_against: current implementation
status: Current
---
# Agents

> **Product:** Hakken · **Document type:** user guide · **Feature area:** agent configuration and core runtime
> **Reviewed:** 26 October 2026, 15:14:20 GMT (Europe/London)
> **Source path:** `docs/end-user/agents.md` · **Status:** Current


Core configuration/runtime and approval behavior were revalidated in this pass. Detailed skill, learning, eval and release sections remain separate review work; this document is not a claim that those whole subsystems are current.

Agents are Hakken's governed AI workers. They can be configured with a purpose, model behavior, reusable skills, knowledge, rules, schemas, integrations, evals, approvals, release controls, and run history. In the current product, agent creation and most agent administration live in the super-admin area. Company admins can participate in some company-scoped operational review flows, such as run evidence, evals, approvals, and memory review when backend permissions allow their company scope.

This guide describes the feature as it is implemented now. It does not describe future agent marketplace, autonomous scheduling, or learning behavior unless it is already present in the app.

## Where To Find It

Agent administration is under the admin area:

- `/admin/agents` lists and searches agents and offers permitted deletion actions. `/admin/agents/new` is the dedicated creation page.
- `/admin/agents/[id]` opens an agent dashboard with usage, token, and cost summaries.
- `/admin/agents/[id]/runs` shows runs, feedback, replay, cancellation, eval creation, memory candidates, reflections, and improvement suggestions.
- `/admin/agents/[id]/evals` manages eval fixtures, smoke eval history, release-gate comparisons, and eval suite presets.
- `/admin/agents/[id]/settings` manages identity, model behavior, and whether the agent is a draft or live.
- `/admin/agents/[id]/skills` attaches reusable skills to one agent.
- `/admin/agents/[id]/knowledge` connects knowledge documents to an agent.
- `/admin/agents/[id]/memory` reviews stored memories, proposed memories, reflections, and improvement suggestions.
- `/admin/agents/[id]/system-prompt` opens the agent Instructions screen. It stores the standing job the agent should run when launched, plus the behavior/system-prompt instructions that shape how it works.
- `/admin/agents/[id]/rules` manages rules attached to an agent.
- `/admin/agents/[id]/interfaces` chooses which tools the agent may use, and whether it answers in plain English or in a fixed set of fields.
- `/admin/agents/[id]/logs` and `/admin/agents/[id]/logs/[logId]` inspect agent logs.
- `/admin/ai/skills` and `/admin/agents/skills` manage the reusable skill catalog. Skill detail and edit controls currently live inside the Skill Center surface rather than a separate implemented skill-detail route.
- `/admin/governance/approvals` shows paused agent tool calls waiting for an approval decision.
- `/app/agentic-testing` provides a sandbox for sending prompts to a selected agent or using automatic routing.

If a user cannot open these routes, they probably do not have the required role or company context.

## What Agents Are For

Use agents when a repeatable AI task needs governance beyond a normal chat thread. An agent can have a standing mission, a configured model, selected knowledge, rules, tools, reusable skills, input and output expectations, human approval settings, eval evidence, release history, and operational telemetry.

Agents are useful for work such as research triage, support preparation, tool-backed operations, structured output generation, workflow steps, and scheduled or manually launched tasks. They differ from assistant chat because they are intended to become durable operational assets rather than personal conversations. They differ from workflows because an agent is one governed worker, while a workflow is a graph that can call agents and other nodes.

## Agent List And Creation

The agent list shows agents in a paginated admin table with search, model information, status, and row actions. The table follows the admin pagination standard of 15 rows per page.

Creating an agent opens its own page using the same form sections as Settings. Enter its name, purpose and accountable owner, then choose the model behavior, risk, approval needs and budgets. The server requires purpose and an existing accountable person for a new custom agent. The normal starting state is draft, but the operator can choose active. Separate template-creation support exists in the backend; do not expect the old step-by-step template wizard on the current Add page.

Deleting an agent is a destructive admin action. Treat it as a configuration removal rather than routine cleanup. If an agent has generated runs, logs, or operational evidence, review those records before removing the agent from active use.

## Agent Detail Tabs

The dashboard tab summarizes usage for one agent. It shows generation count, token totals, and cost totals, then lists recent agent transactions with timestamps, model or pipeline, token counts, cost, and status.

The runs tab is the main operational review area. Runs can be filtered by status: queued, running, pending approval, success, failed, or cancelled. A run can show step timelines, tool calls, approvals, feedback, reflections, memory candidates, eval fixture links, and improvement suggestions. Failed or cancelled runs can be replayed. Runs that are still queued, running, or waiting for approval can be cancelled. Operators can add feedback labels such as incorrect, missed context, wrong tool, unsafe, too expensive, too slow, or should become eval.

The evals tab manages tests for the agent. Evals can be manually created or generated from runs and reflections. The implemented fixture types cover happy paths, approval pauses, rejected actions, prompt injection, tenant boundary checks, bad tool arguments, cancellation, replayed failures, tool plans, and cost or latency budgets. Smoke evals and eval suites provide evidence for readiness and release gates.

The settings tab controls agent identity and runtime behavior. It includes name, description, avatar, model selection mode, reasoning effort, thinking mode, internet access, and whether the agent is a draft or live. Readiness checks report what has or has not been proven; they do not block the active switch. An operator can activate an untested agent. Model selection, risk and approval policies remain enforced separately. Having no tools or knowledge documents is not by itself a fault.

The skills tab attaches active reusable skills to one agent. A skill is a capability package with instructions, risk level, tool requirements, and suggested evals. Skill bindings can be enabled, disabled, upgraded to the latest version, or removed.

The knowledge, instructions, rules, integrations, and schemas tabs define what the agent can use and how it should behave. Knowledge documents supply reference material. The Instructions screen has two responsibilities: the standing job says what the agent should do when launched without a one-off instruction, and the system-prompt field sets core behavior. Rules add governance constraints. Integrations and tools define actions the agent may call. Schemas define expected input and output shapes.

The memory tab supports controlled learning. It shows active memories, memory quality indicators, proposed memory candidates, reflections, and improvement suggestions. High-risk prompt, tool, routing, approval-policy, skill, and eval changes remain review work. When the platform-wide Autonomous memory switch is on, safe memory candidates are saved immediately, labelled as saved by the AI, audited, and remain removable. With that switch off, candidates wait for approval or rejection.

## Approvals

Agents can pause when a tool call requires human review. The approvals page lists pending approvals with the tool name, side-effect level, preview JSON, agent, run objective, and actions. A super admin can approve, reject, or cancel the pending tool call. Read-only platform accounts can inspect the approval query but cannot decide it; company admins cannot make this platform approval decision. Approval schedules the tool to execute. Rejection denies that tool and gives the refusal back to the agent so it can continue another way; cancellation stops the run. Neither operation reverses side effects already completed.

Approvals are important for data-changing, external, destructive, or otherwise sensitive actions. They are not a substitute for good tool configuration. Agents should still be configured with appropriate tools, rules, model choices, and release evidence before being used operationally.

## Skill Catalog

The skill catalog at `/admin/ai/skills` manages reusable agent capabilities. It shows catalog health, adoption, upgrade lag, validation status, and skills needing attention. Super admins can seed starter skills, create new skills, import skill bundles, export bundles from individual skills, clone skills, archive skills, and review learning analytics.

A skill can be draft, active, or archived. Only active skills can be attached to agents. Risk level matters: high-risk skills need stronger evidence before operators rely on them. Missing tool mappings and skill evidence appear in readiness reports; those reports do not themselves veto agent activation.

## Agentic Testing Sandbox

The agentic testing sandbox at `/app/agentic-testing` lets a user choose a specific agent or `Any (Auto-Route)` and send prompts into an isolated chat-like session. When auto-route is selected, Hakken tries to route the prompt to a matching agent; if no match is found, it can fall back to the global AI path. This screen is useful for trying agent behavior without navigating through each admin tab, but it does not replace evals, release gates, or approval review.

## Permissions And Boundaries

Agent creation, template creation and core updates are super-admin writes. Agent list/get queries also admit read-only platform accounts. Several run, eval, memory, approval, transaction, and log views use admin-level access with company scoping. Standard company admins must have a company context, and backend checks prevent them from reviewing or changing records outside their company.

Raw tool arguments are more sensitive than summarized run evidence. The run detail backend only exposes raw tool arguments to super admins. Company-scoped admins receive scoped views where applicable.

Model choices are resolved from configured AI model settings. Users should not assume that a raw provider model name entered somewhere will always be used; model defaults, active model status, and allowed override rules affect runtime selection. The agent adapter registry currently supports Google Vertex, Anthropic, OpenAI and OpenRouter. TypeSafe decision models cannot run an agent. Capability restrictions still apply: the reviewed image path and workflow Google grounding have narrower Google-specific requirements, so provider support does not mean every model supports every input or tool.

## Practical Guidance

Treat agents as governed assets. Before activating an agent, confirm its mission, standing job if it should run unattended, behavior prompt, model, knowledge, tools, rules, schemas, and skills. Run smoke evals and review release gate evidence. For high-risk skills or external actions, verify approval behavior and tool previews. After an agent starts running, monitor runs and approvals, turn useful failures into evals, and approve memory or prompt changes deliberately.

For support and customer success teams, the most useful agent evidence is usually the run history, approval history, eval status, and release state. These explain what the agent tried to do, whether it used tools, whether a human paused or rejected an action, and why the agent is considered ready or blocked.

Agents connect to assistant chat, workflows, schedules, tools, knowledge, AI model configuration, release management, and audit logs. Changes in any of those areas can affect an agent's behavior. Review agents after changing model defaults, tool definitions, knowledge policies, company rules, or workflow/schedule entry points.

## Roles, Risk And Limits

An agent's Role is a stored job identity, separate from its name and from a human user's access role. Assignable jobs include DataForSEO planning and collection, keyword research, News collection, weekly digests, Search Console, Google Analytics, Bing and the Insights team. One agent holds an assignable role at a time; if another already has it, the save is refused with that holder's name. Renaming an agent does not change its job key. Built-in roles such as Wiki staff and Decisions cannot be reassigned through this dropdown.

An agent holding any system role cannot be deleted directly. Switch it off, or return an assignable role to General agent first. Switching off a role holder stops eligible future work through the relevant role consumer; it does not prove that an already executing provider call has been interrupted. The specific collection and content guides explain those workers' behavior. The collector roles use specialized implementations rather than a universal promise that every setting has the same effect on every worker.

A high-risk agent cannot be configured for autonomous tool execution. Trying to turn autonomy on at high risk is refused. Raising an already autonomous agent to high risk is accepted and turns autonomy off, with a separate risk-change audit entry. Older unrated records are not automatically classified as high risk. Keep the purpose and accountable owner meaningful; a risk label describes and constrains execution, but does not replace review of the actual tools.

Run budgets cover steps, tool calls, elapsed runtime, accumulated input tokens and configured model cost. Empty or unusable override values revert to platform defaults, while excessive values are clamped to ceilings. An unpriced model receives more conservative limits because an estimated zero cost cannot safely bound spending. These are application estimates and run controls, not a supplier invoice cap. A stopped or cancelled run may already have spent tokens or completed approved actions.

Approvals normally expire after twenty-four hours, with platform configuration and a per-agent override between one and seven hundred twenty hours. Expiry cancels pending work; it never approves it automatically. A stale browser cannot approve an already expired or reviewed request. When several tools are waiting, approving one does not mean the whole run is free of pending approvals. Review the run and each remaining request before assuming execution finished.

This refresh verifies core configuration, roles, provider dispatch, readiness reporting, run continuation and approval decisions. Detailed skill authoring, learning-policy internals, eval grading, release workflows and the separate agent configuration/operations guides remain a follow-up review. No model was called, run launched, approval decided or role changed while preparing this guide. Existing local source and tests do not establish deployment or live supplier acceptance.

## Detailed configuration and operations coverage

Use [Agent setup and configuration](./agent-setup-and-configuration.md) for the catalog/binding lifecycle and [Agent operations and review](./agent-operations-and-review.md) for learning, evals, versions and release evidence. These specialist reviews now complement the core guide.
