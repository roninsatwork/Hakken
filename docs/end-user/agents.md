# Agents

Agents are Sonae's governed AI workers. They can be configured with a purpose, model behavior, reusable skills, knowledge, rules, schemas, integrations, evals, approvals, release controls, and run history. In the current product, agent creation and most agent administration live in the super-admin area. Company admins can participate in some company-scoped operational review flows, such as run evidence, evals, approvals, and memory review when backend permissions allow their company scope.

This guide describes the feature as it is implemented now. It does not describe future agent marketplace, autonomous scheduling, or learning behavior unless it is already present in the app.

## Where To Find It

Agent administration is under the admin area:

- `/admin/agents` lists agents, searches them, creates agents, and deletes agents.
- `/admin/agents/[id]` opens an agent dashboard with usage, token, and cost summaries.
- `/admin/agents/[id]/runs` shows runs, feedback, replay, cancellation, eval creation, memory candidates, reflections, and improvement suggestions.
- `/admin/agents/[id]/evals` manages eval fixtures, smoke eval history, release-gate comparisons, and eval suite presets.
- `/admin/agents/[id]/settings` manages identity, model behavior, and whether the agent is a draft or live.
- `/admin/agents/[id]/skills` attaches reusable skills to one agent.
- `/admin/agents/[id]/knowledge` connects knowledge documents to an agent.
- `/admin/agents/[id]/memory` reviews stored memories, proposed memories, reflections, and improvement suggestions.
- `/admin/agents/[id]/system-prompt` edits the agent's system prompt.
- `/admin/agents/[id]/rules` manages rules attached to an agent.
- `/admin/agents/[id]/interfaces` chooses which tools the agent may use, and whether it answers in plain English or in a fixed set of fields.
- `/admin/agents/[id]/logs` and `/admin/agents/[id]/logs/[logId]` inspect agent logs.
- `/admin/ai/skills` manages the reusable skill catalog.
- `/admin/ai/skills/[id]` opens one skill.
- `/admin/agents/approvals` shows paused agent tool calls waiting for an approval decision.
- `/app/agentic-testing` provides a sandbox for sending prompts to a selected agent or using automatic routing.

If a user cannot open these routes, they probably do not have the required role or company context.

## What Agents Are For

Use agents when a repeatable AI task needs governance beyond a normal chat thread. An agent can have a standing mission, a configured model, selected knowledge, rules, tools, reusable skills, input and output expectations, human approval settings, eval evidence, release history, and operational telemetry.

Agents are useful for work such as research triage, support preparation, tool-backed operations, structured output generation, workflow steps, and scheduled or manually launched tasks. They differ from assistant chat because they are intended to become durable operational assets rather than personal conversations. They differ from workflows because an agent is one governed worker, while a workflow is a graph that can call agents and other nodes.

## Agent List And Creation

The agent list shows agents in a paginated admin table with search, model information, status, and row actions. The table follows the admin pagination standard of 15 rows per page.

Creating an agent opens a guided builder. The builder can start from a template or create a custom agent. It asks for mission and audience details, policy choices, model behavior preference, knowledge and tool planning choices, and readiness acknowledgement. Template-based creation can seed an agent with a system prompt, trigger type, approval settings, temperature, recommended tools, and eval fixtures. Newly created template agents can start inactive so they can be configured and tested before use.

Deleting an agent is a destructive admin action. Treat it as a configuration removal rather than routine cleanup. If an agent has generated runs, logs, or operational evidence, review those records before removing the agent from active use.

## Agent Detail Tabs

The dashboard tab summarizes usage for one agent. It shows generation count, token totals, and cost totals, then lists recent agent transactions with timestamps, model or pipeline, token counts, cost, and status.

The runs tab is the main operational review area. Runs can be filtered by status: queued, running, pending approval, success, failed, or cancelled. A run can show step timelines, tool calls, approvals, feedback, reflections, memory candidates, eval fixture links, and improvement suggestions. Failed or cancelled runs can be replayed. Runs that are still queued, running, or waiting for approval can be cancelled. Operators can add feedback labels such as incorrect, missed context, wrong tool, unsafe, too expensive, too slow, or should become eval.

The evals tab manages tests for the agent. Evals can be manually created or generated from runs and reflections. The implemented fixture types cover happy paths, approval pauses, rejected actions, prompt injection, tenant boundary checks, bad tool arguments, cancellation, replayed failures, tool plans, and cost or latency budgets. Smoke evals and eval suites provide evidence for readiness and release gates.

The settings tab controls agent identity and runtime behavior. It includes name, description, avatar, model selection mode, reasoning effort, thinking mode, internet access, and whether the agent is a draft or live. An agent cannot be switched live until it has passed a check: the screen names the one reason it is held back and links to the checks that fix it. Having no tools or no knowledge documents is not a reason to hold an agent back.

The skills tab attaches active reusable skills to one agent. A skill is a capability package with instructions, risk level, tool requirements, and suggested evals. Skill bindings can be enabled, disabled, upgraded to the latest version, or removed.

The knowledge, prompt, rules, integrations, and schemas tabs define what the agent can use and how it should behave. Knowledge documents supply reference material. The system prompt sets core instructions. Rules add governance constraints. Integrations and tools define actions the agent may call. Schemas define expected input and output shapes.

The memory tab supports controlled learning. It shows active memories, memory quality indicators, proposed memory candidates, reflections, and improvement suggestions. High-risk learning items need review before they should be treated as routine memory changes. Memory candidates can be approved or rejected; approved candidates become active memories.

## Approvals

Agents can pause when a tool call requires human review. The approvals page lists pending approvals with the tool name, side-effect level, preview JSON, agent, run objective, and actions. An administrator can approve, reject, or cancel the pending tool call. Approving records the decision and allows the run to resume. Rejecting or cancelling records a decision and prevents the tool call from continuing as originally planned.

Approvals are important for data-changing, external, destructive, or otherwise sensitive actions. They are not a substitute for good tool configuration. Agents should still be configured with appropriate tools, rules, model choices, and release evidence before being used operationally.

## Skill Catalog

The skill catalog at `/admin/ai/skills` manages reusable agent capabilities. It shows catalog health, adoption, upgrade lag, validation status, and skills needing attention. Super admins can seed starter skills, create new skills, import skill bundles, export bundles from individual skills, clone skills, archive skills, and review learning analytics.

A skill can be draft, active, or archived. Only active skills can be attached to agents. Risk level matters: high-risk skills require stronger evidence before they should be relied on, and activation checks can block agents whose enabled high-risk skills do not have current smoke evidence.

## Agentic Testing Sandbox

The agentic testing sandbox at `/app/agentic-testing` lets a user choose a specific agent or `Any (Auto-Route)` and send prompts into an isolated chat-like session. When auto-route is selected, Sonae tries to route the prompt to a matching agent; if no match is found, it can fall back to the global AI path. This screen is useful for trying agent behavior without navigating through each admin tab, but it does not replace evals, release gates, or approval review.

## Permissions And Boundaries

Agent creation, template creation, agent list access, and core agent updates are super-admin functions in the current backend. Several run, eval, memory, approval, transaction, and log views use admin-level access with company scoping. Standard company admins must have a company context, and backend checks prevent them from reviewing or changing records outside their company.

Raw tool arguments are more sensitive than summarized run evidence. The run detail backend only exposes raw tool arguments to super admins. Company-scoped admins receive scoped views where applicable.

Model choices are resolved from configured AI model settings. Users should not assume that a raw provider model name entered somewhere will always be used; model defaults, active model status, and allowed override rules affect runtime selection. Current agent execution also requires the resolved model to be compatible with the Google Vertex runtime path, so enabling another provider in the catalog does not by itself make that provider usable for live agent runs.

## Practical Guidance

Treat agents as governed assets. Before activating an agent, confirm its mission, prompt, model, knowledge, tools, rules, schemas, and skills. Run smoke evals and review release gate evidence. For high-risk skills or external actions, verify approval behavior and tool previews. After an agent starts running, monitor runs and approvals, turn useful failures into evals, and approve memory or prompt changes deliberately.

For support and customer success teams, the most useful agent evidence is usually the run history, approval history, eval status, and release state. These explain what the agent tried to do, whether it used tools, whether a human paused or rejected an action, and why the agent is considered ready or blocked.

Agents connect to assistant chat, workflows, schedules, tools, knowledge, AI model configuration, release management, and audit logs. Changes in any of those areas can affect an agent's behavior. Review agents after changing model defaults, tool definitions, knowledge policies, company rules, or workflow/schedule entry points.
