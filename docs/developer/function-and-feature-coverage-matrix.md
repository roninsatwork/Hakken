---
product: Hakken
documentation_type: Developer reference
feature_area: Technical inventory and evidence mapping
audience: developers and documentation maintainers
source_repository: roninsatwork/Hakken
source_path: docs/developer/function-and-feature-coverage-matrix.md
last_reviewed: '2026-10-26T14:55:43+00:00'
reviewed_against: current implementation
status: Current
---
# Function And Feature Coverage Matrix

> **Product:** Hakken · **Document type:** Developer reference · **Feature area:** Technical inventory and evidence mapping
> **Reviewed:** 26 October 2026, 14:55:43 GMT (Europe/London)
> **Source path:** `docs/developer/function-and-feature-coverage-matrix.md` · **Status:** Current

This document maps technical inventory types to their evidence and maintenance responsibilities. The current capability review status and prioritized remaining queue live only in [the documentation front door](../index.md#documentation-coverage-inventory). Earlier route/function completion tables here drifted from the product and duplicated the central queue. Use this matrix for locating source and understanding what a kind of evidence proves; use the central inventory for whether a capability's guides have actually been reviewed.

A route file, exported backend function, schema declaration, test, and guide are different units. Counting one does not establish the others. A single customer workflow can use many pages and functions, while one shared query can serve several workflows. Current implementation is the behavior source; PRODUCT.md remains intent and distinguishes planned surface from implemented foundations. Existing product-status discrepancies are recorded without declaring all planned work delivered.

## Evidence Matrix

| Inventory unit | Current technical source | What to verify before a feature guide is complete |
| --- | --- | --- |
| Routed screen | [Route reference](./route-reference.md), actual page/layout and navigation | Intended audience, location, saved actions, permission states, loading/error/empty states and redirects. |
| Backend entry point | [Convex API/schema reference](./convex-api-and-schema-reference.md), function handler and wrapper | Arguments/returns, authentication, company ownership, side effects, bounds and errors. |
| Shared service | Owning feature module and utility/service callers | Reuse, configuration, selection semantics, trusted inputs and effects not visible in the screen. |
| Table/index | Schema declaration and actual indexed readers/writers | Ownership, index keys, retained history, denormalized counters and removal path. |
| Durable job | Cron/job ledger, scheduled action and saved queue/run records | Dispatch, progress/heartbeat, continuation, timeout, retry/idempotency and actual recovery. |
| Integration | Provider service, safe HTTP boundary and owning feature guide | Credential names, quota, expiry, retries, external acceptance and disconnect/cleanup distinction. |
| Test | Relevant local source and, when authorized, recorded execution | The behavior asserted, its fixture scope and what remains untested or not live. |
| Documentation | Audience guide plus central capability row | Source paths, actual review date, implemented/planned/uncertain distinction, usable workflow and remaining uncertainty. |

## Current Static Inventory Scope

The current reference pass found **419 page files**, **5 Next route handlers**, **2099 mechanically recognized registered exports across 430 top-level Convex modules**, **300 table declarations**, and **84 directly referenced environment names**. These are static-discovery totals for stated patterns, not a complete count of coherent capabilities or a score for deployed product acceptance.

The route reference lists source-backed URL shapes, including dynamic IDs and redirect entry points. The API reference recognizes object-form exported query/mutation/action wrappers and table definitions; it intentionally does not call every utility constant a public API. The environment reference inventories direct named reads without collecting environment values. Static extraction misses dynamic registration/access patterns, and the owning source must still be read for semantics.

## Customer Workflow To Technical Boundary

| Workflow family | Main implementation boundary | Detailed evidence guide |
| --- | --- | --- |
| Workspace sign-in/team | Auth session, invitation/provisioning and company ownership | [Authentication](./route-protection-and-authentication.md), [company users](./company-user-management.md). |
| Website visibility | Shared hosts, company holdings and private tracking membership | [Websites](./websites-and-visibility.md), [Google search tracking](./google-search-tracking.md), [AI questions](./ai-questions-and-answers.md). |
| Source measurements | Provider connection, held slots/parts and tenant projections | [Analytics](./google-analytics.md), [Search Console](./search-console.md), [Bing](./bing-webmaster.md), [Clarity](./microsoft-clarity.md). |
| Insights | Facts, findings, planning, checks and attributed drafts | [Findings](./insights-findings.md), [Track record](./insights-track-record.md), related advanced guides. |
| Conversations | Thread/message ownership, provider routing and optional tools | [Assistant](./assistant-chat.md), [photo actions](./photo-actions.md). |
| Knowledge/Wiki | Controlled uploads, processing, receipts, maintained pages and review | [Knowledge](./knowledge-management.md), [Company Wiki](./company-wiki.md). |
| Reading/editorial | Published content, collection, retained copies and engagement | [Reading room](./reading-room.md), [collector](./news-collector-and-editorial-recovery.md). |
| Agent/workflow operations | Durable runs/steps, approvals, budgets and effect-specific retries | [Agents](./agents.md), [operations](./agent-runtime-operations.md), [workflow internals](./workflow-runtime-internals.md). |
| Billing/usage | Company frontend subscription flow, platform setup and supplier accounting | [Plans/quotas](./platform-plans-and-quotas.md), [credits](./credit-ledger-and-usage.md), [Stripe operations](../operator/stripe-billing.md). |
| Governance/operations | Audit, protected exports, purge ownership, job/health evidence | [Governance](./governance-and-trust.md), [retention](./data-retention-and-purges.md), [Health](./system-health-and-platform-alerts.md). |

These are ownership links rather than duplicate full feature descriptions or a second prioritized queue. Closely related capabilities can share one substantial guide; internal processes need developer/operator coverage rather than an artificial customer counterpart. An existing file is not complete merely because this matrix links it.

## Authorization Coverage Must Follow The Data

The frontend shell and menu decide presentation and entry, while backend wrappers/handlers decide actual data access. Admin section access does not give a read-only account write authority. Company administrators use workspace functions and frontend Billing; auditors have a narrow governance route scope. A route hidden by a diagnostic switch is not a protected endpoint merely because its menu item disappeared.

Company-owned holdings and private tracking lists are especially important when external measurements are shared. Querying by host, keyword or AI question without the owning list/holding can bypass the intended privacy boundary. Thread/session credentials similarly matter for widget reads and confirmation. Internal functions trust their callers to provide consistent ownership unless they independently validate it; internal visibility alone is not semantic tenant proof.

Current documentation records identified source discrepancies separately, including broad rule-list branches and the subject-access action's company association. Those records are not permission to change source in a documentation task, and a guide must not claim a uniform guarantee contradicted by its evidence. Fixing an application issue and documenting its present behavior are different completion criteria.

## Runtime And Side-Effect Evidence

A provider catalog list, a saved default, a passed contract check, a completed rehearsal, and a delivered external action prove different things. Contract smoke evaluation can finish without a fresh model answer. Model-graded checks run real runtime work; explicit rehearsal suppresses selected side effects but still performs real reads. A trace showing a rehearsed write does not prove the destination accepted it.

Idempotency is effect-specific. A completed arcade receipt can return the same score on retry. Workflow email identity can collapse intended repeated iterator items because it lacks an item index. News account cursors can advance before summaries are saved. A general run SUCCESS or mutation transaction cannot erase those differences. Document the actual mechanism before promising automatic recovery or lossless continuation.

Jobs should be reviewed through saved progress and scheduling calls, not comments alone. A role can dispatch per-company actions and finish its outer run before those actions finish. Daily or weekly cron registration is local configuration, not deployed scheduler acceptance. The News Collector's later-run dependence is documented as a gap against the general automatic-handoff rule; it is not silently upgraded to the SEO collector's continuation model in prose.

## Data And Financial Evidence

Bounded reads need explicit limits, truncation signals and correct totals. Loaded-client search does not search an unlimited archive. A chart assembled from a budgeted subset can be partial even when a table remains usable. Missing provider rows can produce zeros without measuring true zero behavior. A timestamp labeled checked can mean a missing-source question was raised rather than a claim was verified.

Supplier model spend is USD in current accounting. Assigned-plan inventory value retains GBP plan fields and is a formula, not collected Stripe revenue. Paid-company counts, covered users, provisioned users and per-seat billing are different concepts. Decision calls have a separate ledger so a batched judgement is not counted once per question as independent model requests. Source financial formulas should not become unqualified commercial claims in user guides.

Raw events, current records, permanent aggregates and external provider copies have distinct lifetimes. A bounded delete or disconnect does not automatically remove every related table or outside copy. Use keep rules and the actual owner-specific removal path, preserving old verification records rather than rewriting them as later outcomes.

## Maintaining This Matrix

When a capability changes, inspect its route, functions, schema/indexes, jobs, configuration and relevant tests, then refresh the established audience guide. Update the central inventory with actual review time, evidence, pairing applicability and remaining work. Refresh technical references when file/entry-point structure changes. Do not add a parallel completion queue here or infer delivery from a plan checkbox.

Possibly removed features require checked-area evidence and manual review before deletion. Gmail notes remain retirement records; absent Sales/Properties/movement/Swarm screens do not authorize deleting residual storage or history. A documentation-only pass leaves app behavior, configuration, product direction, plans, commits and deployments untouched.

This reference reconciliation used static source/file inspection only. No app, browser, capture, paid model request, provider probe, migration, backfill, queue operation, deployment or full application gate was run. Markdown structure, metadata, relative links and diff whitespace are validated separately. The central inventory records current library progress and outstanding work; this technical map does not certify the unknown full platform total.
