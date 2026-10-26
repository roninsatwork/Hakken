---
product: Hakken
documentation_type: End-user guide
feature_area: Agent configuration and skills
audience: platform administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/agent-setup-and-configuration.md
last_reviewed: '2026-10-26T14:18:05+00:00'
reviewed_against: current implementation
status: Current
---
# Agent Setup And Configuration

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Agent configuration and skills
> **Reviewed:** 26 October 2026, 14:18:05 GMT (Europe/London)
> **Source path:** `docs/end-user/agent-setup-and-configuration.md` · **Status:** Current

Agent setup is where an authorized administrator turns a repeatable AI task into a governed Hakken agent. Use this guide when creating an agent, choosing a template, attaching skills, editing schemas, or checking logs and transaction summaries before an agent is used operationally.

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

From `/admin/agents`, choose Add to open `/admin/agents/new`. The current Add page uses the same configuration sections as Settings. It creates a new agent from scratch. The earlier template/mission/policy/readiness wizard is no longer the normal screen workflow. Template creation functions remain in the backend, but their existence does not make the removed wizard available to a person using this page.

Set a clear name and description, an accountable owner where needed, risk level, model selection, reasoning effort, internet access, approval behavior, and applicable execution limits. The page also supports a system role; choose one only when the agent should perform that role's particular job. A role is a dispatch contract, not simply a category label. New agents default to draft/inactive and to requiring a person for governed actions.

The model can inherit platform configuration or override it with an available agent model. A cleared or unusable limit follows backend defaults rather than guaranteeing unlimited execution. Runtime minutes are converted to milliseconds on submission. The Add page warns about an untested agent if you choose Active, but test evidence is advisory: creation does not enforce a mandatory passed eval suite before accepting an active agent.

After creating the agent, review its Settings and Instructions. Add a standing job when it should run without a fresh instruction. Configure knowledge, rules, permitted tools, and its answer format through their actual tabs. A new agent's presence in the catalog is not proof that credentials, integrations, or provider acceptance are ready. See [Agents](./agents.md) for the runtime boundaries and [Agent operations](./agent-operations-and-review.md) for evidence review.

## Configure The Answer Shape

The Interfaces screen edits the output schema through the structured field builder. Use this when a downstream task needs a predictable object with named fields. The implemented simple builder supports object properties such as text, numbers, and booleans. Emptying the builder removes the saved output schema rather than creating a meaningful empty response contract.

The legacy input-schema field is not an input form consumed by the current agent workflow. Do not follow old instructions to configure a pair of input and output schema tabs. A schema governs the path that actually consumes it; it is not a promise that every third-party tool, system role, or workflow validates the same shape. Review a representative run before depending on a strict format in unattended work.

## Manage The Skill Catalog

Skills are reusable capability packages. A skill can include instructions, risk level, required tools, recommended tools, recommended knowledge, default rules, and suggested eval fixtures.

Open `/admin/ai/skills` for the current catalog, also reused by `/admin/agents/skills`. The implemented catalog centers on named Markdown skill uploads, search/status filtering, editing, and delete confirmation. It does not provide a separate current skill-detail route. Older instructions describing every backend catalog operation as a visible catalog button are inaccurate.

When uploading, supply a name and a Markdown file. The name typed into the screen takes precedence over the file's frontmatter name. Description can come from the entered value or the parsed file. The preview extracts instruction and tool/eval hints and reports validation warnings. Successful upload imports the skill and then marks it active: there is no separate publish step in this visible flow. Import and activation are separate backend calls, so a failed activation can leave an imported record that needs inspection before retrying.

A same-name Markdown re-upload can update the first non-archived exact-name match and move attached agent bindings onto the new version. A byte-identical source hash is treated as unchanged by the import path. It is therefore important to check the displayed name and intended target before replacing a file; a new upload is not always a new independent skill. Archived namesakes are skipped within the bounded lookup.

Skills can also be created, cloned, archived, or exported through retained authorized backend operations, including portable bundles, but those APIs do not establish that all corresponding controls are present on this catalog screen. Imported bundles start as drafts; that differs from the upload screen's follow-up activation. An archived skill remains in the catalog/history but is excluded from active runtime use. Delete removes the catalog entry and its agent attachments and reports how many agents lost it. Confirm the consequence before deleting; deleting is not simply hiding a row from search.

## Attach Skills To An Agent

Use `/admin/agents/[id]/skills` to add active skills to a specific agent. After attaching a skill, review:

- whether the skill is enabled
- whether the agent has required tool mappings
- whether the skill version is current
- whether high-risk skill smoke evidence exists
- whether eval fixtures cover the behavior the skill introduces

Skill changes can alter an agent's behavior even when the main prompt is unchanged. Treat skill upgrades like configuration changes that need testing and review. An agent is intended to carry two skills, keeping standing instructions focused. Attaching a new skill checks the enabled-binding limit and refuses a third enabled attachment with an explanation. Removing an unnecessary attachment is preferable to assuming the runtime silently ignores extra work.

Version labels provide evidence of attachment and eval currency, but the reviewed runtime reads instruction text from the current active skill record. A saved old version label is not a guarantee that old instruction text is still executing. Markdown replacement also rolls attached agent version references forward. Keep this distinction in mind when investigating a run after a catalog edit; use its actual evidence rather than assuming a frozen skill snapshot.

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

These are review practices for the operator. The implementation reports readiness warnings and does not make passed evals or release gates a universal activation blocker. Runtime approvals, credentials, and execution budgets still apply independently. Choosing to proceed with a warning does not establish that its underlying problem was resolved.

## Troubleshooting

If an agent cannot be created, check that the administrator has the required platform role and that AI model defaults are configured for agents.

If an agent was created from a template but seems incomplete, review missing tool mappings, knowledge setup, and eval fixtures.

If schemas appear to save but behavior does not change, test with a run that actually uses the expected input/output path and verify that the agent prompt and workflow entry point reference the schema expectations.

If a skill cannot be attached, confirm that the skill is active and that required tool mappings are available.

If logs or transactions look empty, confirm that the agent has actually run in the relevant company scope and that the viewer has permission to see that scope.

## Catalog Scale, Evidence, And Limits

Catalog search and active-skill picking use pagination rather than a single fixed list of every skill. A health panel can use a maintained rollup and report its age or partial state. A stale or partial figure is not a reliable exact adoption total. The backend keeps bounded analytics and operation walks, and bulk changes refuse an attachment population beyond their safety ceiling instead of silently updating the first page.

This guide describes repository implementation and source tests, not a live provider verification. No agents, skills, runs, or paid calls were created during documentation maintenance. Known rename cutover issues in [PRODUCT.md](../../PRODUCT.md) can affect external integrations independently of a locally configured agent. If upload fails, retain the error, check whether an imported draft already exists, and inspect authorized catalog state before repeating a change. Never paste credentials or private trace text into an unrestricted support message.
