# Sonae — Product Vision & Specification

> **This is the single source of truth for what Sonae is.** Every other
> document in this repository defers to it. If another file appears to describe
> the product, it is either a narrower view that links back here, or it is out
> of date and should be corrected rather than allowed to disagree.
>
> **How to read it.** Part One is the vision and commercial strategy. Part Two
> describes only what is implemented and verifiable in the codebase. Anything
> planned but not yet built lives in Part Three, "Not Built Yet", and is never
> described above it as though it exists.
>
> Last verified against the code on 2026-08-23.

---

# Part One — The Vision

## 1. What Sonae Is

Sonae is Ronins' AI application framework for building rapid AI proofs of
concept, client-owned products, internal tools, and off-the-shelf micro-SaaS
opportunities.

Its strategic value is **speed, reuse, and governed production control**. Sonae
gives Ronins a working foundation for AI products at a pace traditional bespoke
development rarely supports. Tenant workspaces, private knowledge, configurable
assistants, governed agents, workflow automation, tools, integrations,
model and provider control, usage controls, observability, release evidence,
APIs, webhooks, and embedded widgets are already there to build from.

Sonae is also **model-agnostic rather than locked to one AI provider**. The
platform routes work across several providers, and the model catalogue is
designed to hold a large library rather than a handful of hand-picked entries.

That means Sonae is not only a standalone product idea. It is the framework
Ronins uses to prove ideas quickly, then turn the strongest proofs into real
products with less repeated groundwork.

## 2. The Three Strategic Lanes

### 2.1 Rapid AI POCs

Sonae builds fast, credible AI prototypes that test whether a workflow, data
product, agent, or internal tool is worth pursuing. Instead of starting every
proof from a blank bespoke build, Ronins reuses the framework for
authentication, company workspaces, knowledge, assistants, agents, workflows,
tools, model configuration, cost controls, audit trails, and operational review.

The goal is not speed for its own sake. The goal is to reach a useful proof
quickly enough that the client and Ronins can make better decisions before
committing to a heavier product build.

### 2.2 Client-Owned Products

After a successful rapid POC, Ronins can clone or fork Sonae for a client and
shape it into a client-owned product — with its own workflows, data,
integrations, deployment choices, and operating model. The client gets a
cheaper and faster path to a tailored product.

**Ronins retains the core Sonae framework IP.** The client receives the specific
product built for them; Ronins keeps the reusable foundation that makes the next
POC and the next product faster to deliver.

### 2.3 Off-The-Shelf And Micro-SaaS Products

Sonae also builds Ronins-owned off-the-shelf applications and micro-SaaS
products. Candidate directions under consideration — **examples of where the
framework can go, not adopted product plans** — include:

* a cybersecurity SaaS product;
* an SEO SaaS product built on the DataForSEO API;
* a PR and media-training mentor application.

They show the strategic direction: use Sonae wherever common AI product
infrastructure can be reused and the differentiation sits in the workflow, the
data, the domain logic, and the user experience.

## 3. The Strategic Thesis

Sonae's future is a mix of rapid POCs, client-owned product builds, internal
client apps, off-the-shelf applications, and micro-SaaS products. Its advantage
is that every lane draws on the same underlying framework instead of recreating
the same AI product infrastructure from scratch.

The open question for strategy is where Sonae creates the most leverage: which
POCs become repeatable client products, which internal workflows become useful
off-the-shelf applications, and which micro-SaaS ideas are strong enough to
become standalone businesses.

**How to apply this when building.** Judge a change by "does this make the next
product cheaper to build", not only "does this work for Sonae today". Base-layer
capability that every cloned product would otherwise have to build for itself
beats a feature that serves one screen.

---

# Part Two — What Is Built Today

## 4. Multi-Tenant Architecture & Governance

Three roles, enforced server-side in Convex rather than in the UI:

* **Super Administrators.** Global oversight: onboard workspaces, set the global
  system prompt, view platform-wide analytics, and impersonate a tenant to
  troubleshoot. Impersonation is stored server-side on the user record, never
  claimed by the client, and is written to the audit log.
* **Workspace Tenants (Companies).** Administrators are scoped to their own
  `companyId` for logs, agent configuration, and knowledge.
* **End Users.** Can use deployed agents and manage their own profile. No access
  to admin surfaces, billing telemetry, or agent configuration.

**How isolation is enforced, precisely.** Every client-callable Convex function
must be declared with a builder from `convex/tenantFunctions.ts` — `tenantQuery`,
`adminMutation`, `superAdminQuery`, and so on — which authenticates the caller
and resolves `companyId` *before* the handler is entered. A function declared
this way cannot run unauthenticated.

This is **structural, not conventional**, and it fails CI rather than review:
`convex/authzEnforcement.test.ts` asserts which builder declared each function,
a syntactic fact with no false positives. Functions that predate the rule sit in
a migration allowlist that may only shrink; every new function must use a
builder. Deliberately open surfaces are declared as such with `publicQuery` /
`publicMutation`, so an open endpoint is a recorded decision rather than an
oversight.

## 5. The Intelligence Orchestrator

* **Model-agnostic by design.** Four providers are wired in — **Google Vertex,
  Anthropic, OpenAI, and OpenRouter** — and a model is chosen from a database
  catalogue rather than hardcoded at runtime. The OpenRouter catalogue is
  synced into the platform by a super-admin action, which is what turns "a few
  configured models" into a large library; OpenRouter alone publishes several
  hundred. The catalogue is built to scale, holding up to 2,000 rows with
  database-side paging and filtered search indexes.
* **Agent execution runs on all four providers.** Each has an adapter that
  handles tool calling, so an agent is not confined to one vendor. An
  unsupported provider fails at the registry with a message naming the model,
  rather than deep inside a provider call.
* **Dynamic Model Resolution.** Administrators choose which configured model
  serves each use case without a code deployment.
* **The Behavioural Rule Engine.** Workspaces configure rules (for example,
  "if the user asks about pricing, do not quote figures") that are aggregated by
  priority and injected into the system instruction. **Rules apply to the
  assistant chat path.** The agent runtime does not currently read them; agent
  behaviour is governed by its system prompt, its bound skills, and its tool
  policy.
* **Agent Runtime.** A durable, audited loop: each run records its steps, model
  calls, tool calls, approvals, final output, failures, tokens, and cost. A
  model turn may request several tool calls at once; all of them are executed
  and answered.
* **Tool Governance.** Tools are database records bound to an agent. Execution
  is deny-by-default: a tool runs only if its handler is in the runtime's
  allowlist, the caller clears the required role, the tenant matches, and the
  arguments satisfy the declared schema. Any non-read tool requires explicit
  human approval. Crucially, the tenant a tool acts on is taken from the
  conversation, never from arguments the model produced.
* **Per-agent runtime limits.** Each agent sets its own budget for five things:
  how many steps it may take, how many tools it may call, how much it may read,
  how long it may run, and how much it may spend. They are held on the agent
  record, edited on the agent create and settings screens, clamped to a platform
  ceiling when saved so the record says what will actually run, and applied to
  every run — including one that pauses and resumes. Two limits stay
  platform-wide: how much an agent may write, which has no per-agent setting;
  and, on a model with no pricing configured, the step, tool and time budgets,
  which fall back to conservative platform values because spend cannot be
  measured there — an agent's own settings can then only lower those three,
  never raise them.
* **Generative Flow Configuration.** An AI copilot turns plain-English intent
  into node configuration and variable bindings for the workflow graph, so
  linking nodes does not require hand-writing JSON.

## 6. Workflow Orchestration

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

## 7. Knowledge & Retrieval (RAG)

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

## 8. Quantitative Reporting

Agents can return structured JSON rather than prose — pipeline health, risk
indicators, closing windows, and performance measures. The dashboard renders
that JSON as interactive charts instead of a wall of text, and charts can be
exported as PNG matching the active light/dark theme.

## 9. Usage Telemetry & Plans

* **Subscription plans.** Workspaces are assigned tiers that set message quotas.
* **Token and operation telemetry.** Input and output tokens are aggregated per
  run and per tenant, with cost attribution held internally.
* **Dashboard analytics.** Administrators see interaction volumes (internal
  versus public widget) and knowledge-asset utilisation.

## 10. Edge Interfaces (Public Widgets)

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

## 11. Governance, Privacy, And Supply Chain

This is the proof base behind the commercial positioning. Each item below is
implemented; the wording is deliberately precise, because these claims are
headed for external sales material.

* **Governance evidence.** An AI register with risk classification, maintained
  governance rollups, and exportable evidence packs. Designed to be
  **compatible with EU AI Act expectations** around controlled AI use, evidence,
  review, and operational traceability. It is a supporting posture, not a
  certification.
* **Personal-data rights.** Subject-rights handling, retention policies, and a
  purge cascade with scheduled enforcement — the machinery **GDPR obligations
  require**. Compliance itself is an organisational determination, not something
  a codebase can assert on its own.
* **Tenancy and access controls.** Tenant-aware access boundaries, route
  protection and authentication, audit logs, and connector execution policy,
  each with test coverage.
* **Supply-chain scanning.** Socket runs alongside `npm audit` for
  package-policy and supply-chain analysis. It runs **on direct pushes to `dev`**
  — pull requests from forks do not receive repository secrets — and an
  unhealthy report blocks the push check before the more expensive stages run.
* **Deployment gates.** Production deployment is refused when any required check
  fails: runtime dependency audit, a passing CI run covering the same code,
  source guards, lint, typecheck, unit and integration tests with coverage, and
  coverage thresholds.
* **Scheduled security auditing.** A weekly audit workflow re-checks runtime
  dependencies as a blocking signal and the full tree, including dev tooling, as
  a reporting-only signal.
* **Recurring review workflows.** A read-only security review that maps findings
  to OWASP web/API/LLM risks and STRIDE, separating confirmed findings from
  unverified areas; and a documentation maintenance pass that checks for stale,
  missing, thin, inaccurate, or unindexed documentation.

**For sales material,** package these into current proof artifacts rather than
quoting this document: a model catalogue export, a GDPR control mapping, Socket
and npm scanning evidence, an EU AI Act mapping, and a security-test summary.
Numbers such as the size of the model library are a per-deployment fact — read
them from the catalogue at the time of the claim.

## 12. Internationalisation

The platform ships with English and Italian throughout. An automated test
enforces translation parity between locales, so a missing translation fails the
build rather than reaching a user.

---

# Part Three — Not Built Yet

Listed so that nothing above has to be hedged. These are tracked in
`docs/plans/active/platform-hardening-plan.md`.

| Area | Current state |
|---|---|
| Connector marketplace | 29 connector tools are defined with schemas and scopes; **2 are executable end-to-end** (knowledge search, company overview update). Five return an explicit "not implemented" result and the remainder are not registered. |
| Connector OAuth | Install and status records exist, but there is no authorisation-code exchange, token storage, refresh, or revocation. Configuration validation checks local settings only — it does not contact the provider. |
| MCP (Model Context Protocol) | Not supported. |
| Response streaming | Built for chat: assistant and widget replies stream word by word on all providers, and agent-backed threads already did. Structured-output surfaces (reports, node-config generation, grading) still deliver whole. See `docs/plans/active/assistant-streaming-all-providers-plan.md`. |
| Prompt caching | Not implemented. |
| Run cancellation and resumption | Cancellation marks the record but does not interrupt an in-flight run; failed runs cannot be resumed from a checkpoint. |
| Agent evaluations | The default readiness check validates configuration rather than model behaviour. Model-graded evaluation exists but does not exercise the full agent runtime. |
| Behavioural rules in agents | The rule engine applies to the assistant chat path only. Agent behaviour is governed by system prompt, skills, and tool policy. |
| Workflow resilience | Automatic retries exist, deliberately narrow: a step retries only if the error classifies as transient **and** the node type cannot repeat an externally visible effect. Today that is `agentNode` alone, up to 3 attempts, and even then not when the agent executes tools autonomously or when the failure came after the real work finished. Email, action, and database nodes never retry. No dead-letter queue and no compensating actions; anything unretryable fails to the review list. |
| Observability | Sentry is **installed and wired** — server, edge, and client start-up hooks, plus `onRequestError` so server components and route handlers report. It **no-ops until a DSN is configured**, which has not been done, so there is no live error signal yet. Tracing, alerting, and a health endpoint beyond the in-app system health surface remain unbuilt. |
| Schema migrations | Schema changes are pushed ahead of the application image, but data migrations have tooling: named, resumable, idempotent backfills in `convex/dataMigrations.ts`, run one page at a time with progress recorded so a completed migration never re-runs. |

---

## Change Log

* **2026-08-23 (later)** — Three claims corrected against the code. Tenant
  isolation is now structurally enforced by function builders plus a CI test,
  not by convention. Sentry is installed and wired but has no DSN connected, so
  the code exists and the signal does not. Workflow steps do retry, under a
  deliberately narrow safety policy.
* **2026-08-23** — Consolidated into the single source of truth. Part One
  replaced with the current commercial vision and the three strategic lanes.
  Corrected the claim that the agent runtime executes on Google Vertex only: it
  runs on Google Vertex, Anthropic, OpenAI, and OpenRouter, all with tool
  calling. Added §11 covering the governance, privacy, and supply-chain proof
  base. Legacy product descriptions elsewhere in the repository now defer here.
* **2026-08-18** — Corrected the per-agent runtime limits and schema migration
  rows, both of which had stopped being true.
