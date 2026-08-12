# Sonae: Product & Feature Specification

> **How to read this document.** Everything in sections 1–9 is implemented and
> verifiable in the codebase. Anything planned but not yet built is in section
> 10, "Not Built Yet", and is never described above it as though it exists.
> Last verified against the code on 2026-07-25.

## 1. Platform Vision & Overview

Sonae is a multi-tenant platform for building and operating governed AI agents.
It is a **developer-led product foundation**, not a finished end-user SaaS: it
provides the tenancy, governance, orchestration, and admin surfaces that an
agentic product needs, so a specific product can be built on top of it.

Its strengths are the parts that are tedious and risky to build from scratch —
tenant-scoped data access, an allowlisted tool dispatcher, durable run records
with per-step token and cost attribution, prompt-injection hardening, audit
logging, and a workflow engine that survives serverless execution limits.

## 2. Multi-Tenant Architecture & Governance

Three roles, enforced server-side in Convex rather than in the UI:

* **Super Administrators.** Global oversight: onboard workspaces, set the global
  system prompt, view platform-wide analytics, and impersonate a tenant to
  troubleshoot. Impersonation is stored server-side on the user record, never
  claimed by the client, and is written to the audit log.
* **Workspace Tenants (Companies).** Administrators are scoped to their own
  `companyId` for logs, agent configuration, and knowledge.
* **End Users.** Can use deployed agents and manage their own profile. No access
  to admin surfaces, billing telemetry, or agent configuration.

**How isolation is enforced, precisely.** Every query and mutation resolves the
caller through shared helpers in `convex/authz.ts` and scopes its own reads by
`companyId`. This is enforced by convention and reviewed per function; there is
not yet a structural mechanism that makes an unscoped function impossible to
write. Hardening this into a compile-or-CI failure is the highest-priority item
in `docs/plans/active/platform-hardening-plan.md`.

## 3. The Intelligence Orchestrator

* **Dynamic Model Resolution.** Administrators choose which configured model
  serves each use case without a code deployment. The **agent runtime currently
  executes on Google Vertex only**; OpenAI and Anthropic adapters exist and are
  used by the assistant chat path, but are text-only and cannot yet host a
  tool-calling agent.
* **The Behavioural Rule Engine.** Workspaces configure rules (for example,
  "if the user asks about pricing, do not quote figures") that are aggregated by
  priority and injected into the system instruction. **Rules apply to the
  assistant chat path.** The agent runtime does not currently read them; agent
  behaviour is governed by its system prompt, its bound skills, and its tool
  policy.
* **Agent Runtime.** A durable, audited loop: each run records its steps, model
  calls, tool calls, approvals, final output, failures, tokens, and cost. It is
  bounded by platform limits — currently 4 model turns and 3 tool calls per run,
  with runtime, token, and cost ceilings. A model turn may request several tool
  calls at once; all of them are executed and answered.
* **Tool Governance.** Tools are database records bound to an agent. Execution
  is deny-by-default: a tool runs only if its handler is in the runtime's
  allowlist, the caller clears the required role, the tenant matches, and the
  arguments satisfy the declared schema. Any non-read tool requires explicit
  human approval. Crucially, the tenant a tool acts on is taken from the
  conversation, never from arguments the model produced.
* **Generative Flow Configuration.** An AI copilot turns plain-English intent
  into node configuration and variable bindings for the workflow graph, so
  linking nodes does not require hand-writing JSON.

## 4. Workflow Orchestration

A visual directed-acyclic-graph editor with an engine that executes each node as
its own scheduled step. State is persisted per step, so a workflow is not bound
by any single function's execution time limit and survives process restarts.

* **Node types that execute today:** agent, API/action, code transform, logic,
  database, wait, approval, iterator, merge, email, and a pass-through for
  unrecognised types.
* **Human-in-the-loop.** Approval nodes genuinely halt a run and resume it once
  an administrator decides.
* **Tenant-safe database access.** The database node works against an explicit
  table allowlist, forces `companyId` on insert, and verifies ownership before
  update, delete, or select.
* **Iterator fan-out.** An iterator schedules one worker per item, bounded to
  100 items per node, and fails loudly rather than silently processing a subset.
* **The code node performs variable substitution, not code execution.** It
  resolves `{{node.output.field}}` placeholders into a string or JSON structure.
  There is no script interpreter or sandbox.

The graph is acyclic by design; cycles are rejected in the editor. Workflows
express sequences, branches, and bounded fan-out — not unbounded loops.

## 5. Knowledge & Retrieval (RAG)

* **Vector retrieval.** Documents are chunked and embedded as 768-dimension
  vectors in a Convex vector index, filtered by tenant, agent, document, thread,
  and global scope.
* **Three-tier scoping.** Global knowledge is available to every tenant;
  tenant knowledge is restricted to its workspace; thread knowledge belongs to a
  single conversation. Matches from all three are ranked together by relevance,
  with a reserved share of the prompt budget for files uploaded into the current
  conversation so they cannot be crowded out.
* **Ephemeral thread knowledge.** Files uploaded to a conversation (up to 50MB)
  are vectorised for that conversation only and garbage-collected on a schedule.
* **Supported formats.** PDF, DOCX, XLSX, and plain text, plus URL ingestion
  with server-side protection against internal-network fetches.
* **Untrusted by construction.** Retrieved content is wrapped in explicit
  untrusted-context markers with delimiter neutralisation, and the system
  instruction states that retrieved documents cannot override safety or tenant
  policy.

Retrieval is vector similarity only — there is no keyword/vector hybrid and no
reranking model. Large documents are embedded chunk-by-chunk, so very large
files can exceed a single ingestion run.

## 6. Quantitative Reporting

Agents can return structured JSON rather than prose — pipeline health, risk
indicators, closing windows, and performance measures. The dashboard renders
that JSON as interactive charts instead of a wall of text, and charts can be
exported as PNG matching the active light/dark theme.

## 7. Usage Telemetry & Plans

* **Subscription plans.** Workspaces are assigned tiers that set message quotas.
* **Token and operation telemetry.** Input and output tokens are aggregated per
  run and per tenant, with cost attribution held internally.
* **Dashboard analytics.** Administrators see interaction volumes (internal
  versus public widget) and knowledge-asset utilisation.

## 8. Edge Interfaces (Public Widgets)

Workspaces can embed a chat widget on external sites via a script tag that
injects an iframe.

* **Embedding is enforced by the browser.** Each widget serves a
  `Content-Security-Policy: frame-ancestors` header built from its own allowed
  domains, so it cannot be framed by a site its owner has not approved. A widget
  with no domains configured is embeddable nowhere. Document requests carrying a
  disallowed referrer are refused, and blocked attempts are audit-logged.
* **Anonymous sessions are token-bound.** Each widget conversation issues a
  256-bit session token, stored only as a hash; reading messages or agent
  reasoning requires presenting it.
* **Abuse limits.** Message payloads are capped at 10,000 characters and each
  conversation is rate-limited.
* **Theming.** Colours, logo, greeting, and starter prompts are configurable per
  widget.

Rate limiting is currently per conversation rather than per widget, tenant, or
IP address, so it does not by itself bound total spend from anonymous traffic.

## 9. Internationalisation

The platform ships with English and Italian throughout. An automated test
enforces translation parity between locales, so a missing translation fails the
build rather than reaching a user.

## 10. Not Built Yet

Listed so that nothing above has to be hedged. These are tracked in
`docs/plans/active/platform-hardening-plan.md`.

| Area | Current state |
|---|---|
| Connector marketplace | 29 connector tools are defined with schemas and scopes; **2 are executable end-to-end** (knowledge search, company overview update). Five return an explicit "not implemented" result and the remainder are not registered. |
| Connector OAuth | Install and status records exist, but there is no authorisation-code exchange, token storage, refresh, or revocation. Configuration validation checks local settings only — it does not contact the provider. |
| MCP (Model Context Protocol) | Not supported. |
| Response streaming | Built for chat: assistant and widget replies stream word by word on all four providers, and agent-backed threads already did. Structured-output surfaces (reports, node-config generation, grading) still deliver whole. See `docs/plans/active/assistant-streaming-all-providers-plan.md`. |
| Prompt caching | Not implemented. |
| Run cancellation and resumption | Cancellation marks the record but does not interrupt an in-flight run; failed runs cannot be resumed from a checkpoint. |
| Agent evaluations | The default readiness check validates configuration rather than model behaviour. Model-graded evaluation exists but does not exercise the full agent runtime. |
| Per-agent runtime limits | Step, tool, cost, and timeout ceilings are platform-wide constants, not per-agent settings. |
| Workflow resilience | No automatic retries, dead-letter queue, or compensating actions; a failed node fails its execution. |
| Observability | No error tracking, tracing, alerting, or health endpoint. |
| Schema migrations | No migration or backfill tooling; schema changes are pushed unversioned ahead of the application image. |
