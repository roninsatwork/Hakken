---
product: Hakken
documentation_type: End-user guide
feature_area: Workflow automation
audience: authorized workflow administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/workflow-automation.md
last_reviewed: '2026-10-26T14:22:10+00:00'
reviewed_against: current implementation
status: Current
---
# Workflow Automation

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Workflow automation
> **Reviewed:** 26 October 2026, 14:22:10 GMT (Europe/London)
> **Source path:** `docs/end-user/workflow-automation.md` · **Status:** Current


Core execution entry points, mail queueing, role boundaries, approval expiry and retry policy were refreshed. Detailed designer/node configuration and related runtime guides remain queued for deeper review.

Workflow automation is the part of Hakken where super admins build and schedule automated operational flows. A workflow can connect AI agents, external API calls, data lookups, routing rules, delays, approval checkpoints, repeated item processing, merge points, and email sending. Hakken records workflow runs in backend execution tables, while agent-owned activity is reviewed from the relevant agent screens.

This guide is written for customer admins, operators, support teams, sales engineers, and client success teams who need to understand what the workflow screens do. In the current product, workflow building and schedule management are super-admin functions. Standard users and company admins do not manage this area. They may see effects of workflows elsewhere in the product, such as records, messages, agent outputs, or emails, but they do not author workflows from these admin screens.

## Where To Find It

Workflow screens are in the admin area:

- `/admin/workflows` opens the workflow list.
- `/admin/workflows/[id]` opens the visual workflow builder for one workflow.
- `/admin/workflows/schedules` opens the schedule list for workflow and agent schedules.
- `/admin/workflows/schedules/new` creates a schedule.
- `/admin/workflows/schedules/[id]` edits a schedule.

The admin navigation may group these screens with other agentic platform tools. Platform read-only accounts can read the workflow/schedule queries. Creating, editing, running, deleting and deciding workflow approvals require super-admin write/action permissions. Company admins do not manage this area.

## What Workflows Are For

Workflows are useful when a repeated process needs several steps and those steps should be visible, reusable, and auditable. Examples include routing incoming data through an AI agent, calling an external system, checking a condition, waiting before continuing, asking a human to approve a sensitive step, writing or reading selected Hakken data, and sending a final email.

A workflow is not just a single prompt. It is a graph. Each block in the graph is called a node, and lines between nodes decide the order. Some nodes transform data. Some call agents. Some decide which branch should run next. Some pause the flow. The runtime records path and output state for backend diagnostics.

Because workflows can call external systems and change data, Hakken keeps this feature in the super-admin area. Use it for carefully managed operational automation, not casual one-off chat.

## Workflow List

The workflow list shows existing workflows in a table. Each row includes the workflow name, description when present, trigger type, and status. The trigger type tells you how the workflow is intended to start:

- `MANUAL` means an admin can run it from the builder.
- `SCHEDULE` means a schedule can launch it automatically.
- `WEBHOOK` means an external system can call a secure endpoint to start it.

The status column shows whether the workflow is active or still treated as a draft. Active status matters for scheduled and webhook runs. A workflow that is inactive should not be expected to run from those automated entry points.

Use search to filter by workflow name. The list loads in pages, so use the load-more control when there are more results. Clicking a row opens the visual builder. The row actions include a builder shortcut and delete. Deleting a workflow removes the workflow record; it should be treated as a destructive action because the builder screen will no longer be available for that workflow. Existing run logs may still need separate review.

To create a workflow, use the new workflow action, enter a name and optional description, and submit. Hakken creates an active manual workflow and opens the builder so you can start designing the graph.

## Visual Builder

The builder is a canvas. The top bar shows the workflow name and its current trigger type. The main canvas displays nodes and lines. A node library button opens a panel of node types. Drag a node from the library onto the canvas, connect nodes with lines, and double-click a node to configure it.

The available node types are:

| Node | What It Does |
| --- | --- |
| Trigger Event | Defines whether the workflow starts manually, on a schedule, or by webhook. |
| AI Agent | Runs an AI agent as part of the workflow. |
| API Action | Calls an external HTTP endpoint. |
| Logic Router | Chooses a branch based on configured conditions. |
| Merge / Sync | Brings multiple branches back together. |
| Iterator (Loop) | Runs downstream work once per item in a list. |
| Code Transform | Restructures or maps data using the configured transform behavior. |
| Database Action | Reads or changes selected Hakken records. |
| Wait / Delay | Delays downstream steps. |
| Human Approval | Pauses the run until it is approved from the execution report. |
| Send Email | Queues a written message through the shared Outbox for later delivery. |

Use the save graph button after changing the canvas. Hakken checks for direct cycles before saving. If the canvas routes backward and could loop forever, Hakken rejects the save and shows an in-app message. Use the iterator node when the goal is repeated work over a list.

The manual run button starts the real workflow graph from the builder. It creates an execution record and queues the first node or nodes. Open `/admin/workflows/executions` and its individual execution report to inspect graph steps; agent runs have their own linked evidence.

## Configuring Triggers

A trigger node controls how the workflow should start.

Manual workflows are run from the builder. This is the safest mode for testing because an admin chooses when to launch the run.

Scheduled workflows are intended to run automatically. When a saved workflow graph contains a trigger node set to schedule mode, Hakken creates or updates a linked schedule record for that workflow. The workflow also needs to remain active and have trigger type `SCHEDULE` for the backend dispatcher to run it.

Webhook workflows expose an endpoint that an external system can call with a `POST` request. The builder displays the endpoint format. A secure webhook secret is generated for webhook workflows and must be sent in the `x-hakken-secret` request header. The secret is not accepted in the URL, which reduces the chance of leaking it through proxy or browser logs. The request body becomes the initial workflow payload and must stay within the current 20,000-character limit. If the workflow is inactive, is no longer configured for webhooks, has the wrong secret, or receives an oversized payload, the webhook should not run.

The endpoint shown in the builder comes from the configured Convex HTTP Actions
site origin. In deployed environments, that origin must be configured separately
from the normal Convex client URL so webhook examples point at the route that
actually serves `/api/webhooks/workflow`.

## Configuring Agent Nodes

An AI Agent node can use an inline agent that belongs to the workflow or an existing global agent. When opening the agent editor, you can set the agent name, instructions, expected input variables, output variables, model behavior, reasoning settings, internet access, and temperature. The mapping tab controls how upstream workflow data is passed into the agent.

For most operators, the mapping tab is the practical starting point. You can describe what data should be sent to the agent and let Hakken generate a mapping, or switch to developer mapping to bind values manually. The advanced engine tab is more technical and should be changed carefully because it controls the actual model behavior and the shape of data expected from the agent.

Agent execution resolves configured models through supported provider adapters, currently Google Vertex, Anthropic, OpenAI and OpenRouter. Google internet grounding remains a narrower Vertex capability. Provider support does not guarantee that every model accepts every input or tool; TypeSafe decision models cannot run an agent.

AI-generated mapping is intended for short, specific configuration help. Very long prompts, oversized graph context, or repeated rapid generation attempts can be rejected before Hakken calls the AI provider. The mapping helper currently uses the platform global workflow model setting rather than a tenant-specific model override. If generation fails, shorten the request, configure the mapping manually, or wait before trying again.

Inline agents can be promoted to global agents. Promoting makes the agent reusable outside this one workflow, so treat that as a governance action rather than a routine edit.

## Configuring Action, Data, And Control Nodes

API Action nodes call outside systems. They support method, URL, headers, and a request body for methods that allow one. Upstream node output can be inserted into the URL, headers, or body. Use these nodes only with trusted endpoints and be mindful that the run log can contain response data.

Database Action nodes read or change selected Hakken records. These are powerful and should be used only by administrators who understand the target data. Some database reads use indexed query contracts, such as looking up records by company, thread, status, or another supported index. Hakken applies backend authorization and tenant checks, but the safest operating practice is still to test on limited data before relying on an automated data-changing workflow.

Logic Router nodes compare values and choose a downstream branch. They are useful for paths such as "if the score is high, continue to approval; otherwise send a summary." Merge nodes bring branches together. A merge can wait for all required upstream branches or continue when any one branch succeeds, depending on configuration. Iterator nodes turn a list into repeated downstream steps, one per item. Wait nodes add a delay before downstream nodes are scheduled.

Human Approval nodes pause a run. When a run reaches an approval node, the execution report shows the step as needing approval. The current execution report exposes approval and rejection. Approval resumes downstream work; rejection requires confirmation and fails the workflow execution. This differs from rejecting an agent tool call, which can let the agent continue another way. Only a super admin can perform these workflow decisions.

Send Email nodes render the subject/body from configured fields and workflow data, then queue messages in the Outbox. The step reports queueing rather than recipient delivery. Sender configuration, preferences, provider readiness and later queue processing determine delivery. A workflow success is not proof of an email arriving; see [Emails](./emails.md) for the delivery lifecycle.

## Standalone Schedules

The schedule list is separate from the workflow builder. It can schedule either workflow graphs or autonomous agents. Each schedule row shows the schedule name, target, interval summary, active or paused status, and row actions. Search filters by schedule name and target name. The list paginates locally with 15 rows per page.

Creating a schedule starts with a name, a target type, a selected target, schedule timing, and the active or paused state. Target type can be workflow graph or autonomous agent. The screen defaults to agent mode, so switch to workflow graph when you intend to schedule a workflow. You can search available workflows or agents and select one.

Schedule timing supports recurring and targeted-time modes. Recurring schedules support hourly, daily, weekly, fortnightly and monthly timing. A fortnightly schedule uses an anchor date so missed dispatches do not silently change which week it belongs to. Targeted-time schedules can contain one or more local times. The builder shows the local time and a UTC preview so operators can check whether the schedule lines up with the expected dispatch time. Hakken stores schedule configuration in a versioned format and calculates the next run time from it.

The active toggle is important. Active schedules are armed and can run when their next run time arrives. Paused schedules remain saved but should not dispatch. Editing a schedule lets you change the target, cadence, timing, and active state. Deleting a schedule removes the schedule.

The force-run button on the schedule list behaves differently by target type. For agent schedules, it queues a real agent run that can be reviewed from the agent run/log surfaces. For workflow schedules, the current force-run action creates a backend execution record and completes it through a heartbeat simulation rather than running the visual workflow graph. To test the real graph manually, open the workflow builder and use manual run. To test the automatic scheduled graph path, use an active schedule with a workflow whose trigger type is `SCHEDULE`.

## Automatic Retry Behavior

Hakken automatically retries a narrow class of workflow failures: transient provider or network failures on an AI Agent node that is safe to run again. The first retry waits about five seconds and the second waits about 25 seconds, for at most three attempts including the original try. The execution step keeps its attempt count and most recent error so an operator can see that a successful run needed recovery.

Retries are deliberately denied for API actions, email, database writes, and other nodes that may already have changed an external system. Autonomous agents that can execute write tools without approval are also not retried, and neither are failures that happen after an agent's real work has already completed. Those cases fail on the first error and stay available for review. This avoids sending an email twice, repeating a POST, or applying a database write twice merely because bookkeeping or a provider response failed.

Unknown or permanent errors are not retried. If a run fails, inspect the execution step and attempt count before manually starting it again; a manual rerun can repeat side effects that the automatic policy intentionally refused to repeat.

## Permissions, Boundaries, And Practical Guidance

Only super admins manage workflows and schedules from these screens. This protects tenants from accidental cross-company automation and protects system settings from regular user actions. Backend checks also restrict public webhook triggers to active webhook workflows and require the webhook secret in a request header.

When building workflows, start small. Create the workflow, add a trigger and one or two nodes, save, and run manually. Add data-changing, email, webhook, or external API steps only after the earlier path is behaving as expected. Use clear node labels so backend execution records are easier to interpret if support needs to debug a run. Keep secrets out of request bodies and visible labels. Prefer approved, stable external endpoints over temporary test URLs.

For scheduled operations, confirm both the schedule and the workflow trigger type. A standalone schedule can target a workflow, but the backend dispatcher only runs workflow graph schedules when the workflow exists, is active, and is configured as a scheduled workflow. Paused schedules, inactive workflows, deleted targets, and workflows with the wrong trigger type will not produce the expected automated run.

For webhook operations, verify the endpoint, workflow id, active status, trigger type, `x-hakken-secret` header, and request size. The request body becomes initial workflow data, so keep it within the expected shape and avoid sending unnecessary sensitive data. Oversized webhook payloads are rejected before execution rather than truncated into the workflow run.

For approvals, open Workflow Runs. A run waiting on a person is flagged there and counted on the sidebar. Opening it shows what the approval node is asking, and its preview, with approve and reject on the waiting step. Approving resumes the downstream path; rejecting stops the whole run. An approval nobody answers expires on the platform window and the run is marked failed. Failed runs should be inspected from the step list before being retried.

Workflow automation connects to the rest of Hakken through agents, models, settings, knowledge, database records, email branding, and logs. Changes in those areas can affect workflow behavior. For example, an inactive agent may prevent a scheduled agent run, missing email configuration may make email nodes simulate rather than send, and model settings can affect agent node output. Treat workflows as operational assets that need periodic review, especially after changing agents, model configuration, external endpoints, or company data structures.

## Current Execution And Recovery Boundaries

Workflow Human Approval steps share the platform approval window, normally twenty-four hours. A scheduled sweep checks them every fifteen minutes. Expiry fails the halted workflow execution and its waiting approval steps; it never grants permission automatically. This workflow path reads the platform window rather than a per-agent override. The sweep is bounded, so the exact moment a waiting execution changes state can be later than its deadline. Check the execution report before acting from an older browser tab.

Webhook requests are limited after the secret is verified. A workflow can reserve at most sixty webhook starts in a rolling hour; an exhausted allowance returns a rate-limit response with retry timing. Invalid-secret calls do not consume that workflow allowance. The bounded input reader rejects oversized request bodies. A successful HTTP response contains an execution ID; it is not a final graph-completion or delivery certificate. Keep webhook secrets out of URLs, documentation examples, screenshots and ordinary logs.

The designer's manual Run starts the graph, while Force run on a workflow schedule still creates a simulated completion record. Choose the correct entry point when gathering evidence. For agents, the Run/Force run path starts durable agent work and resolves specialized role jobs separately. The Assistant is not a standalone scheduled worker: its manual-run path refuses a run without a person asking a conversational question.

Automatic retries apply only to a transient failure on an eligible agent node, with no evidence that its first attempt already acted externally. They do not undo earlier steps. API actions, writes, mail queueing and other side effects fail for review rather than being universally repeated. When deciding whether to retry a failed workflow manually, inspect completed steps and any outbox rows first. Starting a fresh execution can repeat those effects even if a prior execution later failed.

The backend also implements a task node that creates a generic company task using the workflow creator's company. The reviewed node-library UI did not expose that node, so this is not documented as an available drag-and-drop choice. It is distinct from personal Hakken recurring tasks. A workflow with no creator company cannot raise such a task and reports the missing workspace. Internal implementation is not enough to promise a complete customer workflow.

This refresh checked workflow CRUD and webhook handlers, graph dispatch, schedule/manual entry points, node dispatch, database authorization, approval decisions/expiry and retry policy. It did not launch a graph, send a webhook, buy provider data or deliver mail. Existing collection-specific guidance is linked from [Collection Operations](../operator/collection-operations.md), while the large runtime and node-configuration internals remain a separate detailed review. No local result in this pass establishes deployment or external rename cutover acceptance.

## Saving Detailed Node Configuration

Node drawer edits change the canvas configuration. Save the workflow before using Manual Run to check those changes: the run button dispatches the saved graph and does not automatically save pending edits. Record which saved configuration produced a result when reviewing a failure with another administrator. A successful mapping-generation message also does not establish that a real run used the newly generated fields.

Standard-mode mapping assistance turns a short description and available node information into mapping/template strings. Review the generated references before saving. Developer mapping uses saved node identifiers and output paths, rather than the node's friendly name alone. A missing string path can become an empty value, so check actual step output when a downstream message loses information. The helper has limits on prompt/context size, available nodes, and request frequency; repeated generation is model work and can cost money.

Iterator nodes refuse lists larger than 100 items instead of silently completing part of the list. Each item gets a separate downstream step, but a shared node's displayed output is not necessarily a full list of all item results. Use step evidence to understand what happened to each item, particularly around merge nodes or approvals.

There is a current email limitation when one email node repeats within the same execution. Its queued-message identity uses the execution and node, without the individual item index. Distinct iterations can therefore be treated as the same queued email and suppressed. Do not rely on an iterator around one email node as verified bulk delivery. This needs a separate application fix; the documentation loop does not alter the sending contract. An email step completing means it reached the Outbox path, not that every intended recipient received a message.

A human-task node creates an assignment or follow-up in the workflow's workspace, and refuses a workflow with no usable workspace context. It does not do that person's task automatically. Treat database changes, external actions, emails, and tasks as real effects when reviewing a graph; an execution preview or configuration helper is not universal simulation. The retained [runtime guide](../developer/workflow-runtime-internals.md) explains the implementation and the current repeated-email limit.
