# AI Administration

AI administration is where Sonae operators govern the assistant, agent, workflow, widget, and model behavior that users experience across the platform. These controls decide which AI engines are available, which model is used by default for each use case, what global and company prompts apply, which rules are active, what knowledge can be retrieved, which tools and connectors agents may use, how embedded widgets look, and how cost and chat activity are monitored.

This guide describes the implemented product surface. It is written for platform operators, customer-success teams, sales engineers, and support teams who need to understand what the AI administration screens do without reading the code.

## Where To Find It

Global AI administration is under `/admin/ai`:

- `/admin/ai/costs` shows AI cost and usage analytics.
- `/admin/ai/chat-logs` lists conversation threads and lets an admin inspect and copy transcripts.
- `/admin/ai/rules` manages global AI rules.
- `/admin/ai/rules/new` and `/admin/ai/rules/[id]` create and edit rules.
- `/admin/ai/system-prompt` edits the global system prompt.
- `/admin/ai/global-knowledge` manages global knowledge.
- `/admin/ai/widget` configures the global embeddable widget.
- `/admin/ai/models` manages providers, model catalog entries, enabled status, and defaults.
- `/admin/ai/models/[id]` edits model display and pricing configuration.
- `/admin/ai/tools` manages the connector marketplace and Sonae action tools.
- `/admin/ai/tools/new`, `/admin/ai/tools/[id]`, and `/admin/ai/tools/connectors/[id]` create or manage tool and connector records.

Company-level AI administration appears inside company detail routes:

- `/admin/companies/[id]/ai` shows the Company AI readiness overview: what the company has configured, what inherits platform defaults, and what needs attention.
- `/admin/companies/[id]/ai/prompt` manages the company prompt.
- `/admin/companies/[id]/ai/rules` manages company-scoped rules.
- `/admin/companies/[id]/ai/knowledge` and `/admin/companies/[id]/knowledge` manage company knowledge.
- `/admin/companies/[id]/ai/models` manages company model defaults.
- `/admin/companies/[id]/ai/chat-logs` reviews company-scoped chat logs.
- `/admin/companies/[id]/widget` configures a company widget.

Normal users do not manage these screens. Company admins use organization settings in the main app for tenant-level user and diagnostics work; the global `/admin` AI screens are super-admin platform controls.

## How AI Controls Layer Together

Sonae uses layered AI configuration. Platform safety and tenant isolation always sit above configurable prompts, rules, knowledge, model defaults, widgets, and tools. A prompt or uploaded document cannot authorize cross-tenant access, reveal hidden platform instructions, or bypass permissions.

The global system prompt applies platform-wide behavior. Company prompts tailor behavior for a specific tenant. Rules add targeted instructions or constraints. Knowledge supplies reference material for retrieval. Model defaults decide which model should be used for each product use case. Tools and connectors define actions that agents can ask to perform. Widgets expose a controlled chat experience outside the logged-in app.

When troubleshooting AI behavior, review the layers in this order: user or company context, selected model and model defaults, active rules, global and company prompts, relevant knowledge, agent or widget configuration, tool permissions, and platform safety refusals.

## Models, Providers, And Defaults

The model screen manages available AI models. It includes provider controls for Google Vertex AI, OpenAI, and Anthropic. Operators can sync supported model catalogs from those providers, test provider connectivity, enable or disable a provider, search and filter models, and enable or disable individual models.

Models can be filtered by active or inactive status, provider, capability, and supported use case. Capabilities include text, reasoning, vision, audio, tool calling, JSON mode, streaming, embeddings, and transcription. Use cases include chat, agent, workflow, report, router, title, embedding, transcription, vision, and tool calling.

The defaults tab sets platform defaults by use case. For example, chat, agents, workflows, embeddings, and transcription can each resolve to different default models. Company model defaults can override platform defaults for a tenant. If a company default is cleared, that company falls back to the global default for the same use case.

Some provider-backed helper actions also use these configured defaults. Voice transcription uses the global transcription path, and workflow node configuration uses the global workflow model setting. These helper actions validate input and throttle rapid repeated requests before calling a provider, so a user who repeatedly records audio or asks the workflow builder to generate node mappings may see a temporary "too many requests" style error.

Opening a model detail page lets an operator set a friendly name and pricing values. Friendly names are shown in user-facing selectors. Pricing values feed analytics and estimated cost displays. Treat pricing as operational reporting data, not invoice-grade billing unless the surrounding billing process explicitly validates it.

Changing model defaults can affect live assistant, agent, workflow, title generation, embedding, and transcription behavior. Current agent and workflow-agent execution paths still require Google Vertex-compatible resolved models, even though the model catalog can list other providers for supported surfaces. After changing defaults or provider state, test a normal assistant prompt and any affected agent or workflow path.

## Prompts And Rules

The global system prompt page edits the platform-wide prompt. It has unsaved-change detection, save feedback, a revert action, and a safety warning panel. Prompt edits can affect assistant chat, agent behavior, and other AI execution paths that assemble platform instructions.

Rules are structured AI instructions. Global rules apply platform-wide. Company rules apply to a tenant. Agent-scoped rules can apply to a specific agent. Rules include a trigger, instruction, priority, active state, and creator metadata. The rules list supports search, pagination, activation toggles, editing, and deletion.

Use rules for targeted guidance that should be easier to review and change than a large prompt. Use the system prompt for foundational behavior. Avoid putting tenant-specific instructions in the global system prompt when a company prompt or company rule would be more precise.

## Knowledge Management

Global knowledge and company knowledge use the same knowledge manager. Knowledge can be added from websites, uploaded files, or manually entered text. Supported file validation is handled before upload, and the backend extracts text, chunks it, embeds it, and stores retrieval-ready chunks. For persisted knowledge, use PDF, CSV, Word `.docx`, or plain text for reliable extraction; Excel files currently pass shared upload validation but do not have dedicated spreadsheet extraction in the knowledge ingestion action. The manager shows document status, quality indicators, repair actions, retry controls, document inspection, and retrieval testing.

Website ingestion starts by mapping a URL, then queueing selected URLs. File ingestion stores the uploaded document and processes it asynchronously. Manual text knowledge is useful for short curated facts or procedures that do not need a separate file.

Knowledge scopes matter:

- Global knowledge can be used platform-wide where retrieval includes global scope.
- Company knowledge is tenant-specific and should not leak across companies.
- Agent knowledge is attached to agents.
- Thread knowledge comes from user chat uploads.

When users report that an answer missed expected knowledge, check whether the document is ready, whether chunks exist, whether retrieval testing finds the content, and whether the relevant assistant, company, agent, or thread scope can actually see it.

## Tools And Connectors

The tools page has two related areas: connector marketplace installations and individual Sonae action tools. Connectors represent installable integrations such as knowledge, profile, workflow, HTTP, email, or custom integrations. A connector can require no auth, secret references, or OAuth. It can be globally available or tenant-restricted. Operators can install, sync, manage, and test connectors.

Sonae action tools define model-callable capabilities. They include a name, description, handler mapping, optional connector link, required role, input and output schema, side-effect level, confirmation requirement, active state, version, and audit metadata. Side-effect levels help distinguish read-only, write, destructive, and external actions.

Tools are powerful because AI models may request them during agent runs. The platform still validates tool availability, role requirements, input schema, tenant boundaries, side-effect level, and approval requirements before execution. Do not treat a model's requested tool call as permission to execute the tool.

## Widgets

Widgets let Sonae expose chat outside the logged-in dashboard. The global widget page configures a system-wide widget, while company widget screens configure tenant-specific widgets.

Widget configuration includes name, allowed domains, primary color, greeting text, logo, placeholder, sounds, popup preview, name/email gateway requirements, conversation starters, and integration snippet. The global widget page displays an embed script such as a `script` tag with a widget id. The sandbox route lets operators test the embedded widget in a simulated host page.

The public widget route checks widget status and allowed domains before starting or reusing a widget thread. It can require a visitor name or email before chat. Widget conversations are stored as threads linked to the widget and company where applicable.

Use allowed domains carefully. An empty or wildcard domain configuration makes embedding broader. For production customer sites, prefer explicit domains and test from the real host.

## Costs And Chat Logs

The AI costs screen shows global AI cost analytics for a selected timeframe. It includes timeline charts, aggregate metrics, provider and model distributions, and leaderboards for top agents, companies, and users. Custom date ranges are available.

Chat logs list conversation threads in a split-pane viewer. Super admins can search global threads, inspect messages, and copy a transcript as rich text or plain text. Company chat log screens scope the same idea to a selected tenant. Use chat logs for support, debugging, safety review, and cost investigation. Remember that chat logs can contain customer data, uploaded-file summaries, or sensitive business context.

## Permissions And Safety

Global AI administration is super-admin controlled. Company AI screens still enforce backend company access. Global knowledge and global widgets are super-admin-only. Company-scoped knowledge, widgets, rules, chat logs, and model defaults require admin access to that company.

Sonae also records audit events for many sensitive AI configuration changes, including model default changes, model enforcement changes, provider state changes, system prompt updates, rule changes, knowledge changes, tool changes, widget changes, and safety refusals where implemented. Audit coverage can vary by subsystem, so use feature-specific logs and admin notes when a change is operationally important.

## Practical Guidance

Change one layer at a time when possible. If a tenant wants different behavior, start with a company prompt or company rule before changing the global system prompt. If users need new reference material, upload or map knowledge and test retrieval before changing models. If answers are slow or expensive, review model defaults, use cases, and cost analytics before disabling providers.

Before enabling a new model or provider for production use, confirm provider connectivity, supported use cases, pricing values, and a simple assistant test. Before exposing a widget, confirm allowed domains, greeting, gateway requirements, and sandbox behavior. Before enabling tools for agents, confirm side-effect levels, role requirements, schemas, and approval behavior.

AI administration changes can affect live users quickly. Make the smallest clear change, test the affected user journey, and leave enough context for the next operator to understand why it changed.
