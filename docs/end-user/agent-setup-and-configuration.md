# Agent Setup And Configuration

Agent setup is where an authorized administrator turns a repeatable AI task into a governed Sonae agent. Use this guide when creating an agent, choosing a template, attaching skills, editing schemas, or checking logs and transaction summaries before an agent is used operationally.

For day-to-day run review, approvals, replay, evals, memories, and release readiness, see [Agent Operations And Review](./agent-operations-and-review.md). For the broader feature overview, see [Agents](./agents.md).

## Who Can Use It

Agent creation and most agent configuration are super-admin functions in the current product. Company admins may be able to review company-scoped operational evidence where the backend allows it, but they should not expect to create or globally edit agents unless their role has that platform-level access.

If a user cannot open the routes below, first check their role, company assignment, and whether they are working inside the expected tenant scope.

## Where To Find It

Use these admin routes:

- `/admin/agents`: search agents, create agents, and delete agents.
- `/admin/agents/[id]`: review usage, token, cost, and transaction summaries for one agent, or launch a manual scheduled run from the agent shell.
- `/admin/agents/[id]/settings`: edit identity, avatar, model mode, reasoning effort, internet access, and whether the agent is a draft or live.
- `/admin/agents/[id]/knowledge`: manage the agent's tenant-scoped knowledge library.
- `/admin/agents/[id]/system-prompt`: edit the agent Instructions screen, including its standing job and behavior/system-prompt field.
- `/admin/agents/[id]/rules`: list, add, and edit agent governance rules.
- `/admin/agents/[id]/interfaces`: choose which tools the agent may use, and whether it answers in plain English or in a fixed set of fields.
- `/admin/agents/[id]/skills`: attach reusable skills to one agent.
- `/admin/agents/[id]/runs`: review run evidence, feedback, replay, cancellation, memory candidates, eval creation, and improvement suggestions.
- `/admin/agents/[id]/evals`: manage eval fixtures, smoke evals, suite presets, release gates, and skill coverage.
- `/admin/agents/[id]/memory`: review active memories, memory quality, candidates, reflections, and suggestions.
- `/admin/agents/[id]/logs`: inspect agent trace history.
- `/admin/agents/[id]/logs/[logId]`: inspect one trace.
- `/admin/governance/approvals`: review pending tool-call approvals across agents.
- `/admin/ai/skills` and `/admin/agents/skills`: manage the reusable skill catalog. Skill detail and edit controls currently live inside the Skill Center surface rather than a separate implemented skill-detail route.

## Create An Agent

Open `/admin/agents` and choose the new-agent action. The builder walks through four setup steps:

1. Choose a template or start blank.
2. Define the mission with an objective, audience, and name.
3. Choose policy options such as approval posture, model behavior, and whether to use template knowledge or tools.
4. Confirm readiness checks before creating the draft.

Template-based creation is useful when the agent resembles a common pattern. Current built-in templates include internal knowledge, support triage, sales research, document review, and reporting analyst agents. Templates can seed prompts, approval posture, trigger type, recommended tools, and starter eval fixtures.

Blank creation is useful when the work does not fit a template. Blank agents still need a clear mission, standing job when they should run unattended, behavior prompt, model behavior, knowledge, tools, rules, schemas, and eval evidence before activation.

New agents should be treated as drafts until a human has reviewed their configuration and run evidence. If an agent should be launched from the Run Agent button or a schedule without a one-off instruction, give it a standing job on the Instructions screen.

## Choose Or Adjust A Template

Templates are starting points, not approval to go live. After creating a template-based agent, review:

- agent name and description
- standing job and behavior prompt
- model behavior and reasoning settings
- knowledge connections
- tool and integration bindings
- approval requirements
- suggested eval fixtures
- release or activation readiness

If the template recommends a tool that is not configured in the platform, the agent may need manual tool binding before it can be considered ready.

## Edit Input And Output Schemas

The schemas tab defines structured expectations around the agent:

- the input schema describes the structured context the agent expects
- the output schema describes the shape of the response the agent should produce

Schemas are best for stable, repeatable work such as extracting fields, preparing reports, or passing agent output into a workflow. Avoid making schemas stricter than the real task requires. Overly strict output schemas can make otherwise useful agent responses fail validation or become brittle.

When changing schemas, test the agent with realistic examples and review the output before using it in customer-facing or automated flows.

## Manage The Skill Catalog

Skills are reusable capability packages. A skill can include instructions, risk level, required tools, recommended tools, recommended knowledge, default rules, and suggested eval fixtures.

Use `/admin/ai/skills` to:

- search the skill catalog
- review catalog analytics and adoption
- seed starter skills
- create a skill manually
- import a skill bundle

Use the Skill Center to:

- edit skill content
- clone a skill
- archive a skill
- export a skill bundle
- review which agents use the skill
- upgrade agents to the latest skill version
- review skill-related learning analytics

Only active skills can be attached to agents. High-risk skills deserve stronger review, especially when they influence external actions, approvals, regulated content, tenant data, or operational decisions.

## Attach Skills To An Agent

Use `/admin/agents/[id]/skills` to add active skills to a specific agent. After attaching a skill, review:

- whether the skill is enabled
- whether the agent has required tool mappings
- whether the skill version is current
- whether high-risk skill smoke evidence exists
- whether eval fixtures cover the behavior the skill introduces

Skill changes can alter an agent's behavior even when the main prompt is unchanged. Treat skill upgrades like configuration changes that need testing and review.

## Review Logs

Use `/admin/agents/[id]/logs` when investigating lower-level agent traces. The log list supports search and pagination. Each row links to a trace detail page.

Logs are useful for:

- prompt or response inspection
- tool-dispatch investigation
- schema validation problems
- timeout or failure investigation
- support handoff when an agent behaved unexpectedly

Logs can contain sensitive business context. Use them for operational troubleshooting and avoid copying trace details into places that are not approved for customer data.

## Review Transaction Summaries

The agent dashboard at `/admin/agents/[id]` summarizes recent activity:

- generation count
- input and output token totals
- estimated operational cost
- recent transaction history
- model or pipeline used
- success or failure status

Use transaction summaries to spot cost spikes, unusual token growth, repeated failures, or unexpected model usage. For deeper behavior investigation, open run history and logs rather than relying only on cost rows.

## Before Activation

Before activating an agent or asking another team to use it, check:

- the mission is specific and current
- templates have been reviewed rather than accepted blindly
- required tools and knowledge are connected
- schemas are realistic and tested
- high-risk skills have smoke evidence
- approval behavior is understood
- evals cover likely failure modes
- recent logs and runs do not show unresolved failures
- transaction cost looks acceptable for expected usage

If any of these checks fail, keep the agent in draft or inactive status until the configuration is corrected and reviewed.

## Troubleshooting

If an agent cannot be created, check that the administrator has the required platform role and that AI model defaults are configured for agents.

If an agent was created from a template but seems incomplete, review missing tool mappings, knowledge setup, and eval fixtures.

If schemas appear to save but behavior does not change, test with a run that actually uses the expected input/output path and verify that the agent prompt and workflow entry point reference the schema expectations.

If a skill cannot be attached, confirm that the skill is active and that required tool mappings are available.

If logs or transactions look empty, confirm that the agent has actually run in the relevant company scope and that the viewer has permission to see that scope.
