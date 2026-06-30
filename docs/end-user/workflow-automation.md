# Workflow Automation

Workflow automation is the part of Sonae where super admins build and monitor automated operational flows. A workflow can connect AI agents, external API calls, data lookups, routing rules, delays, approval checkpoints, repeated item processing, merge points, and email sending. Sonae records each run so administrators can review what happened, where a run paused or failed, and what output was produced.

This guide is written for customer admins, operators, support teams, sales engineers, and client success teams who need to understand what the workflow screens do. In the current product, workflow building and schedule management are super-admin functions. Standard users and company admins do not manage this area. They may see effects of workflows elsewhere in the product, such as records, messages, agent outputs, or emails, but they do not author workflows from these admin screens.

## Where To Find It

Workflow screens are in the admin area:

- `/admin/workflows` opens the workflow list.
- `/admin/workflows/[id]` opens the visual workflow builder for one workflow.
- `/admin/workflows/schedules` opens the schedule list for workflow and agent schedules.
- `/admin/workflows/schedules/new` creates a schedule.
- `/admin/workflows/schedules/[id]` edits a schedule.
- `/admin/workflows/logs` opens the execution log list.
- `/admin/workflows/logs/[id]` opens one execution report.

The admin navigation may group these screens with other agentic platform tools. Access is role-based: if a person cannot open the admin workflow pages, they likely do not have the required super-admin role.

## What Workflows Are For

Workflows are useful when a repeated process needs several steps and those steps should be visible, reusable, and auditable. Examples include routing incoming data through an AI agent, calling an external system, checking a condition, waiting before continuing, asking a human to approve a sensitive step, writing or reading selected Sonae data, and sending a final email.

A workflow is not just a single prompt. It is a graph. Each block in the graph is called a node, and lines between nodes decide the order. Some nodes transform data. Some call agents. Some decide which branch should run next. Some pause the flow. The final execution log shows the path that ran and the output state that was collected along the way.

Because workflows can call external systems and change data, Sonae keeps this feature in the super-admin area. Use it for carefully managed operational automation, not casual one-off chat.

## Workflow List

The workflow list shows existing workflows in a table. Each row includes the workflow name, description when present, trigger type, and status. The trigger type tells you how the workflow is intended to start:

- `MANUAL` means an admin can run it from the builder.
- `SCHEDULE` means a schedule can launch it automatically.
- `WEBHOOK` means an external system can call a secure endpoint to start it.

The status column shows whether the workflow is active or still treated as a draft. Active status matters for scheduled and webhook runs. A workflow that is inactive should not be expected to run from those automated entry points.

Use search to filter by workflow name. The list loads in pages, so use the load-more control when there are more results. Clicking a row opens the visual builder. The row actions include a builder shortcut and delete. Deleting a workflow removes the workflow record; it should be treated as a destructive action because the builder screen will no longer be available for that workflow. Existing run logs may still need separate review.

To create a workflow, use the new workflow action, enter a name and optional description, and submit. Sonae creates an active manual workflow and opens the builder so you can start designing the graph.

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
| Database Action | Reads or changes selected Sonae records. |
| Wait / Delay | Delays downstream steps. |
| Human Approval | Pauses the run until it is approved from the execution report. |
| Send Email | Sends or simulates an email depending on email service configuration. |

Use the save graph button after changing the canvas. Sonae checks for direct cycles before saving. If the canvas routes backward and could loop forever, Sonae rejects the save and shows an in-app message. Use the iterator node when the goal is repeated work over a list.

The manual run button starts the real workflow graph from the builder. It creates an execution record and queues the first node or nodes. Open the execution logs to inspect progress and results.

## Configuring Triggers

A trigger node controls how the workflow should start.

Manual workflows are run from the builder. This is the safest mode for testing because an admin chooses when to launch the run.

Scheduled workflows are intended to run automatically. When a saved workflow graph contains a trigger node set to schedule mode, Sonae creates or updates a linked schedule record for that workflow. The workflow also needs to remain active and have trigger type `SCHEDULE` for the backend dispatcher to run it.

Webhook workflows expose an endpoint that an external system can call with a `POST` request. The builder displays the endpoint format. A secure webhook secret is generated for webhook workflows and must be sent in the `x-sonae-secret` request header. The secret is not accepted in the URL, which reduces the chance of leaking it through proxy or browser logs. The request body becomes the initial workflow payload and must stay within the current 20,000-character limit. If the workflow is inactive, is no longer configured for webhooks, has the wrong secret, or receives an oversized payload, the webhook should not run.

## Configuring Agent Nodes

An AI Agent node can use an inline agent that belongs to the workflow or an existing global agent. When opening the agent editor, you can set the agent name, instructions, expected input variables, output variables, model behavior, reasoning settings, internet access, and temperature. The mapping tab controls how upstream workflow data is passed into the agent.

For most operators, the mapping tab is the practical starting point. You can describe what data should be sent to the agent and let Sonae generate a mapping, or switch to developer mapping to bind values manually. The advanced engine tab is more technical and should be changed carefully because it controls the actual model behavior and the shape of data expected from the agent.

Workflow agent execution currently requires the resolved workflow or agent model to be compatible with the Google Vertex runtime path. Treat non-Vertex providers in the model catalog as available for the surfaces that already support them, not as a guarantee that workflow agent nodes can execute with them.

AI-generated mapping is intended for short, specific configuration help. Very long prompts, oversized graph context, or repeated rapid generation attempts can be rejected before Sonae calls the AI provider. The mapping helper currently uses the platform global workflow model setting rather than a tenant-specific model override. If generation fails, shorten the request, configure the mapping manually, or wait before trying again.

Inline agents can be promoted to global agents. Promoting makes the agent reusable outside this one workflow, so treat that as a governance action rather than a routine edit.

## Configuring Action, Data, And Control Nodes

API Action nodes call outside systems. They support method, URL, headers, and a request body for methods that allow one. Upstream node output can be inserted into the URL, headers, or body. Use these nodes only with trusted endpoints and be mindful that the run log can contain response data.

Database Action nodes read or change selected Sonae records. These are powerful and should be used only by administrators who understand the target data. Some database reads use indexed query contracts, such as looking up records by company, thread, status, or another supported index. Sonae applies backend authorization and tenant checks, but the safest operating practice is still to test on limited data before relying on an automated data-changing workflow.

Logic Router nodes compare values and choose a downstream branch. They are useful for paths such as "if the score is high, continue to approval; otherwise send a summary." Merge nodes bring branches together. A merge can wait for all required upstream branches or continue when any one branch succeeds, depending on configuration. Iterator nodes turn a list into repeated downstream steps, one per item. Wait nodes add a delay before downstream nodes are scheduled.

Human Approval nodes pause a run. When a run reaches an approval node, the execution report shows the step as needing approval. The current admin report exposes an approve-and-resume action. Approval allows downstream steps to continue. Rejection behavior exists in the backend, but the current report screen presents the approval path as the visible action.

Send Email nodes build an email from configured fields and workflow data. If Sonae's email service is configured, the node sends through that service. If it is not configured in the environment, the run records a simulated email output so admins can still test the workflow path without sending a real email.

## Standalone Schedules

The schedule list is separate from the workflow builder. It can schedule either workflow graphs or autonomous agents. Each schedule row shows the schedule name, target, interval summary, active or paused status, and row actions. Search filters by schedule name and target name. The list paginates locally with 15 rows per page.

Creating a schedule starts with a name, a target type, a selected target, schedule timing, and the active or paused state. Target type can be workflow graph or autonomous agent. The screen defaults to agent mode, so switch to workflow graph when you intend to schedule a workflow. You can search available workflows or agents and select one.

Schedule timing supports recurring and targeted-time modes. Recurring schedules can run hourly, daily, weekly, or monthly. Targeted-time schedules can contain one or more local times. The builder shows the local time and a UTC preview so operators can check whether the schedule lines up with the expected dispatch time. Sonae stores schedule configuration in a versioned format and calculates the next run time from it.

The active toggle is important. Active schedules are armed and can run when their next run time arrives. Paused schedules remain saved but should not dispatch. Editing a schedule lets you change the target, cadence, timing, and active state. Deleting a schedule removes the schedule.

The force-run button on the schedule list behaves differently by target type. For agent schedules, it queues a real agent run and links it to the execution log. For workflow schedules, the current force-run action creates an execution log and completes it through a backend heartbeat simulation rather than running the visual workflow graph. To test the real graph manually, open the workflow builder and use manual run. To test the automatic scheduled graph path, use an active schedule with a workflow whose trigger type is `SCHEDULE`.

## Execution Logs

The execution log list shows recent runs. Each row includes status, workflow or target name, trigger type, and start time. Status can be running, success, or failed. The list can be searched by workflow name, status, or trigger type and paginates at 15 rows per page.

Opening a log shows the execution report. The top section summarizes status, trigger, target, and start time. If the run has node steps, the report lists each step in order with its node id and status. Failed steps show an error message. Approval steps show as needing approval and include an approve-and-resume button when the workflow id is available.

The lower section shows the execution state JSON. This is technical, but it is useful when support or implementation teams need to inspect what data moved through the workflow. The copy button copies the formatted state. Be careful sharing this output because it can contain customer data, external API responses, agent outputs, or email content, depending on the workflow.

## Permissions, Boundaries, And Practical Guidance

Only super admins manage workflows, schedules, and workflow logs from these screens. This protects tenants from accidental cross-company automation and protects system settings from regular user actions. Backend checks also restrict public webhook triggers to active webhook workflows and require the webhook secret in a request header.

When building workflows, start small. Create the workflow, add a trigger and one or two nodes, save, run manually, and inspect logs. Add data-changing, email, webhook, or external API steps only after the earlier path is behaving as expected. Use clear node labels so execution reports are easier to interpret. Keep secrets out of request bodies and visible labels. Prefer approved, stable external endpoints over temporary test URLs.

For scheduled operations, confirm both the schedule and the workflow trigger type. A standalone schedule can target a workflow, but the backend dispatcher only runs workflow graph schedules when the workflow exists, is active, and is configured as a scheduled workflow. Paused schedules, inactive workflows, deleted targets, and workflows with the wrong trigger type will not produce the expected automated run.

For webhook operations, verify the endpoint, workflow id, active status, trigger type, `x-sonae-secret` header, and request size. The request body becomes initial workflow data, so keep it within the expected shape and avoid sending unnecessary sensitive data. Oversized webhook payloads are rejected before execution rather than truncated into the workflow run.

For approvals, monitor execution logs. A run can remain in progress while it waits for approval. Approving resumes the downstream path. Failed runs should be inspected from the step list and execution state before being retried.

Workflow automation connects to the rest of Sonae through agents, models, settings, knowledge, database records, email branding, and logs. Changes in those areas can affect workflow behavior. For example, an inactive agent may prevent a scheduled agent run, missing email configuration may make email nodes simulate rather than send, and model settings can affect agent node output. Treat workflows as operational assets that need periodic review, especially after changing agents, model configuration, external endpoints, or company data structures.
