# AI Rules And Prompts

Hakken uses prompts and rules to shape AI behavior without changing application code. These controls are powerful because they affect assistant, agent, workflow, and widget responses, so they should be changed deliberately and tested after each update.

This guide explains the implemented prompt and rule controls for operators, support teams, customer-success teams, and sales engineers.

## Where To Find It

Global prompt and rule controls live in the admin AI area:

- `/admin/ai/system-prompt` edits the global system prompt.
- `/admin/ai/rules` lists global AI rules.
- `/admin/ai/rules/new` creates a global rule.
- `/admin/ai/rules/[id]` edits an existing global rule.

Company prompt and rule controls live inside a company record:

- `/admin/companies/[id]/ai/prompt` edits the company prompt.
- `/admin/companies/[id]/ai/rules` lists company rules.
- `/admin/companies/[id]/ai/rules/new` creates a company rule.
- `/admin/companies/[id]/ai/rules/[ruleId]` edits a company rule.
Older direct company prompt and rule routes have been retired; use the `/ai`
company routes above.

Agent rules can also be attached to agents from agent administration surfaces:

- `/admin/agents/[id]/rules` lists rules for one agent.
- `/admin/agents/[id]/rules/new` creates an agent rule.
- `/admin/agents/[id]/rules/[ruleId]` edits an agent rule.

They use the same rule structure but apply only when the relevant agent is in scope.

## Prompt Layers

Hakken assembles AI instructions in layers. Platform safety and backend authorization always come first. Configurable prompts and rules can guide behavior, but they cannot grant access to another tenant's data, reveal hidden platform instructions, bypass role checks, or execute tools without backend validation.

The main configurable layers are:

- Global system prompt: platform-wide behavior used as the default operating voice and policy.
- Company prompt: tenant-specific behavior for a customer workspace.
- Active rules: targeted instructions that apply when their trigger is relevant.
- Agent prompt and skills: agent-specific behavior documented in the Agents guides.
- Retrieved knowledge and uploaded files: factual reference material, treated as untrusted context.

Use the global prompt for broad platform behavior. Use company prompts for customer-specific tone, policy, terminology, or operating instructions. Use rules for targeted behaviors that should be easy to search, activate, deactivate, and review.

## Editing The Global System Prompt

The global system prompt page shows the current configured prompt in a large editor. The page detects unsaved changes, offers a revert action, and only enables saving when the editor differs from the current stored prompt.

When the prompt is saved, Hakken stores the new prompt and records an audit event. The editor also displays a safety warning panel when the prompt appears to include risky instructions, such as revealing hidden prompts, weakening safety rules, or allowing cross-tenant access.

Recommended operating approach:

1. Make the smallest clear change.
2. Save the prompt.
3. Test a normal assistant conversation.
4. Test any affected agent, workflow, or widget path.
5. Review chat logs or run evidence if behavior changed unexpectedly.

## Creating And Editing Rules

Each rule has:

- Name: a friendly label for operators.
- Trigger: the user topic, wording, or situation that should activate the rule.
- Instruction: the behavior the AI should follow when the trigger applies.
- Priority: `LOW`, `NORMAL`, `HIGH`, or `CRITICAL`.
- Active state: whether the rule is currently available to AI prompt assembly.

The rules list supports search, pagination, activation toggles, editing, and deletion. Rules can be deactivated without deleting them, which is useful for testing or temporarily pausing behavior.

The create and edit forms also show the safety warning panel. Treat warnings as review prompts. They do not automatically prove the rule is invalid, but they flag wording that could weaken platform safety, disclose private configuration, or permit cross-tenant access.

## Rule Scope

Rules can be global, company-scoped, or agent-scoped.

Global rules apply across the platform and should be reserved for platform-wide behavior. Only super admins should manage global rules.

Company rules apply to one tenant. They are better for customer-specific language, escalation instructions, business policies, or domain constraints.

Agent rules apply when a specific agent is used. Standard company admins can only work with agent rules that are also scoped to their company; global agent rules remain super-admin territory.

## How Rules Affect Responses

When an AI response is assembled, Hakken can include active global rules, active company rules, and active agent rules. The rules are compiled into the instruction context with their priority, trigger, and instruction.

A rule should be written as a precise behavior, not as hidden policy text. Good rules explain what to do when a topic appears. Weak rules try to override safety boundaries, duplicate large prompt sections, or mix unrelated concerns.

Examples of appropriate rule uses:

- Escalate pricing questions to a named sales contact.
- Explain a tenant-specific return or onboarding policy.
- Instruct a support agent to ask for a customer reference number before diagnosis.
- Tell an agent to avoid unsupported legal, medical, or financial advice.

Avoid using rules to store secrets, API keys, customer-private credentials, or instructions that belong in backend authorization.

## Permissions And Audit Trail

Global prompt changes require super-admin access. Global rule management is super-admin controlled. Company-scoped rules require admin access to the company. Company prompt controls follow company admin access.

Hakken records audit events for global system prompt updates and rule creation, update, activation toggles, and deletion. Audit metadata can include safety warning categories when risky wording is detected.

## Troubleshooting

If AI behavior does not match a prompt or rule, check:

- Whether the rule is active.
- Whether the rule is global, company-scoped, or agent-scoped.
- Whether the conversation is running in the expected company or agent context.
- Whether a higher-priority platform safety rule prevents the requested behavior.
- Whether retrieved knowledge or previous conversation context is being mistaken for instructions.
- Whether a model or workflow path is using a different prompt assembly path.

If behavior changed after an edit, review the prompt or rule audit log, then compare chat logs or agent run evidence before changing another layer.
