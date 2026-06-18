# Starter Platform Expansion Plan

This plan captures the next platform layer for making Sonae an exceptional developer-led starter framework. It focuses on capabilities outside the connector marketplace.

The goal is not to add random admin pages or turn Sonae into a no-code SaaS product. The goal is to make Sonae a product factory where developers and operators can assemble, test, govern, ship, observe, and extend many different agentic products from one core platform.

## Direction Correction

Sonae is not intended to be the final end-user application. It is the reusable core that gives a developer a strong starting point, reusable modules, governed defaults, and clear extension points.

The admin surfaces should be treated as developer/operator tooling. They should help a builder prepare a product-specific implementation, not imply that a non-technical customer can self-serve the whole solution.

Build decisions should follow these rules:

- Prefer developer acceleration over self-serve SaaS ceremony.
- Prefer reusable templates, code-backed defaults, fixtures, and extension points over no-code abstractions.
- Make it obvious what is scaffolded, what is draft, and what still needs developer work.
- Keep risky agents, workflows, widgets, and external actions draft or disabled until a developer/operator reviews them.
- Use UI copy such as "starter," "build plan," "draft resources," and "developer follow-up" instead of implying a finished customer launch.

## Product North Star

Sonae should let a developer start with a customer or app idea and quickly produce a governed, product-specific starter that can then be completed with custom domain logic:

1. Create or seed a workspace.
2. Pick an app kit.
3. Generate a build plan with draft agents, connectors, knowledge scopes, workflows, evals, and suggested surfaces.
4. Let a developer add product-specific data models, tool handlers, integrations, workflows, UI, and permissions.
5. Test agents and workflows against fixtures and release gates.
6. Ship only after a developer/operator review, not as an automatic customer self-serve flow.
7. Observe runs, costs, approvals, knowledge quality, failures, and learning opportunities.
8. Improve safely through reviewed memory, evals, prompt versions, and rollback controls.

## Current Foundation

These foundations already exist and should be extended rather than rebuilt:

- Multi-tenant company, user, role, plan, audit, auth, widget, and settings model.
- Agent runtime with durable runs, run steps, tool calls, approvals, feedback, reflections, eval fixtures, memory candidates, memories, versions, and suggestions.
- Workflow runtime with schedules, logs, approval nodes, API/code/database/email nodes, and agent dispatch paths.
- Knowledge ingestion, chunks, retrieval, document quality inspection, retrieval tests, and repair/re-embed controls.
- Model provider configuration, provider defaults, cost telemetry, reports, and admin dashboards.
- Connector marketplace foundation with install/test/manage flows, OAuth scaffolding, safe secret references, and generated tool records.
- Admin surfaces for agents, tools/connectors, workflows, schedules, approvals, runs, memory, knowledge, models, widgets, companies, users, plans, settings, system health, scripts, and audit logs.

## Build Themes

### 1. App Kit Gallery

Move beyond single-agent templates into full developer-ready app starters.

Template catalogue:

#### Customer Support And Success

- Support Desk AI: triages inbound tickets, searches help docs, drafts replies, escalates sensitive cases, and creates follow-up tasks.
- Customer Success QBR Assistant: summarizes account health, usage notes, support history, risks, wins, and next-step recommendations before quarterly reviews.
- Onboarding Concierge: guides new customers through setup, answers product questions, checks missing implementation steps, and schedules human help when needed.
- Churn Risk Monitor: reviews customer signals, support tickets, usage notes, and renewal dates to flag risk and recommend save plays.
- Voice Of Customer Analyst: clusters feedback from tickets, surveys, calls, emails, and chat logs into themes, severity, and product opportunities.

#### Sales And Revenue

- Sales Research Copilot: researches target accounts, prepares account briefs, identifies likely pains, and drafts outreach angles.
- Lead Qualification Agent: scores inbound leads, enriches company context, asks clarifying questions, and routes qualified prospects.
- Proposal And RFP Assistant: answers RFP questions from approved knowledge, drafts compliant responses, and flags missing evidence.
- Deal Desk Assistant: reviews opportunity context, pricing rules, approval requirements, and contractual risks before handoff.
- Renewal Assistant: prepares renewal briefs, summarizes account history, drafts renewal messaging, and flags expansion opportunities.

#### Internal Knowledge And Operations

- Internal Knowledge Portal: answers employee questions from approved company knowledge and routes low-confidence answers to owners.
- Operations Playbook Assistant: guides teams through SOPs, incident checklists, handoffs, and recurring operational procedures.
- Meeting Briefing Assistant: prepares agendas, attendee context, open tasks, account notes, and follow-up drafts.
- Executive Briefing Analyst: produces concise leadership briefs from reports, metrics, risks, and recent operational changes.
- Policy And HR Assistant: answers policy questions, explains benefits/processes, and escalates sensitive HR issues.

#### Compliance, Legal, And Risk

- Compliance Review Assistant: checks documents, conversations, and proposed actions against policy rules and produces review notes.
- Contract Review Assistant: extracts obligations, risk clauses, renewal terms, missing fields, and negotiation notes from contracts.
- Data Privacy Assistant: helps classify data, review access requests, draft DSAR responses, and identify risky processing.
- Vendor Risk Assistant: reviews vendor documents, security questionnaires, certifications, and risk evidence.
- Audit Evidence Assistant: collects evidence, maps it to controls, identifies gaps, and prepares auditor-friendly summaries.

#### Finance And Admin

- Invoice And Billing Analyst: reviews invoice questions, payment status, customer billing history, and prepares billing responses.
- Expense Policy Assistant: checks expenses against policy, explains decisions, and drafts approval or rejection notes.
- Budget Variance Analyst: summarizes finance data, explains variances, and highlights follow-up questions for owners.
- Procurement Assistant: gathers vendor requirements, compares options, tracks approvals, and prepares purchase recommendations.

#### Product, Engineering, And Delivery

- Product Feedback Triage Agent: clusters feature requests, bug reports, support themes, and sales notes into product priorities.
- Engineering Incident Assistant: summarizes incidents, tracks timeline evidence, drafts updates, and creates postmortem sections.
- QA Test Case Generator: turns requirements, designs, or bug reports into test cases, acceptance checks, and regression suites.
- Release Notes Assistant: drafts user-facing and internal release notes from commits, issues, pull requests, and product context.
- Technical Documentation Assistant: converts implementation notes and product behavior into maintained docs and troubleshooting guides.

#### Industry Starters

- Property Or Lead Research Bot: researches properties, agents, owners, listings, planning context, and lead quality signals.
- Real Estate Client Concierge: answers buyer/seller questions, prepares viewing notes, and routes qualified enquiries.
- Healthcare Admin Assistant: answers approved administrative questions, prepares intake summaries, and routes clinical or urgent cases to humans.
- Education Course Advisor: helps learners pick courses, answers policy questions, and recommends next steps from approved course data.
- Recruitment Screening Assistant: summarizes CVs, compares requirements, drafts screening notes, and flags bias/sensitivity risks.
- Insurance Claims Triage Agent: classifies claim details, identifies missing evidence, summarizes policy context, and routes exceptions.
- Ecommerce Store Assistant: answers product/order questions, searches catalog context, drafts support replies, and flags refund/escalation cases.
- Hospitality Guest Concierge: answers venue questions, prepares booking support, handles FAQs, and routes special requests.

#### Platform And Developer Starters

- API Support Agent: answers developer questions from API docs, searches known issues, and drafts reproducible support responses.
- Integration Builder Assistant: guides connector setup, scopes, webhook configuration, test calls, and troubleshooting.
- Data Analyst Copilot: answers metric questions, explains dashboard anomalies, and prepares structured report summaries.
- Security Operations Assistant: triages alerts, summarizes evidence, maps to playbooks, and prepares escalation notes.
- Admin Copilot: helps platform admins configure tenants, agents, models, widgets, connectors, and release gates safely.

Good template criteria:

- It has a clear primary user and job to be done.
- It can start useful with sample knowledge and safe tool stubs.
- It has obvious eval fixtures and release-gate checks.
- It benefits from tenant isolation, approvals, audit logs, and replay.
- It can later grow into a vertical product without changing platform core.

Each template should define:

- Recommended agents.
- Starter prompts and behavioral rules.
- Required or suggested connectors.
- Knowledge scopes and starter documents.
- Suggested workflows and schedules.
- Widget/public API defaults where relevant.
- Eval fixtures and release-gate preset.
- Demo seed data.
- Readiness checklist items.
- Developer follow-up items that make clear what code, mapping, product policy, or customer-specific implementation still needs to be completed.
- Extension points for domain models, tool handlers, custom screens, fixtures, permissions, and observability hooks.
- Implementation pointers that name the likely code areas a developer will touch while completing the product-specific layer.
- Risk profile, approval policy, and blocked-action expectations.
- Suggested dashboard cards or reports.
- White-label navigation/module recommendations.

Acceptance:

- A super-admin can instantiate a full app template into draft resources.
- Created resources are draft or disabled by default.
- The template creates or recommends agents, tools, knowledge areas, workflows, evals, and widgets.
- The template records audit metadata showing source template, created resources, missing requirements, and next steps.
- Saved build plans preserve developer follow-up and extension-point guidance so the developer can complete the product-specific layer after scaffolding.
- Saved build plans include code pointers so developers can move from plan to implementation without guessing which platform files own the next step.
- English and Italian locale copy stays in parity.

Primary areas:

- `convex/agentTemplates.ts`
- `convex/agents.ts`
- `convex/workflows.ts`
- `convex/aiTools.ts`
- `convex/localDemoSeed.ts`
- `src/app/(dashboard)/admin/agents/page.tsx`
- `src/app/(dashboard)/admin/workflows/page.tsx`
- `messages/en.json`
- `messages/it.json`

### 2. Build Plan Workspace Setup

Add a guided developer/operator setup path for creating a new customer or app workspace build plan.

Build-plan steps:

1. Company profile.
2. Brand and theme.
3. First admin and invite policy.
4. Model defaults.
5. App template selection.
6. Starter knowledge import.
7. Connector bundle selection.
8. Agent readiness and smoke test.
9. Developer follow-up checklist for internal app, widget, webhook, or public API surfaces.

Acceptance:

- A super-admin can create a draft tenant build plan without jumping across ten admin pages.
- The setup flow can save progress and resume.
- The final review shows what will be created, what is missing, and what remains draft.
- The setup flow never activates risky agents, workflows, widgets, or external tools without explicit developer/operator review.
- The output clearly lists what still needs developer implementation.

Primary areas:

- `convex/companies.ts`
- `convex/users.ts`
- `convex/aiModels.ts`
- `convex/agents.ts`
- `convex/knowledge.ts`
- `convex/widgets.ts`
- `src/app/(dashboard)/admin/companies/page.tsx`
- New route: `src/app/(dashboard)/admin/app-kits/page.tsx` with `/admin/launch` kept as a compatibility alias

### 3. Agent Studio

Make agent creation and editing feel like a product-grade studio rather than a form.

Key capabilities:

- Purpose-first guided builder.
- Persona, tone, audience, and policy controls.
- Knowledge source picker.
- Tool and connector permission matrix.
- Approval policy editor.
- Model behavior controls.
- Test chat side panel.
- Readiness score.
- One-click smoke eval and release-gate eval run.
- Draft, candidate, active, paused, and archived states.

Acceptance:

- A user can understand why an agent is not ready to activate.
- Test chat can show retrieved knowledge, tool declarations, and blocked actions.
- Activation is blocked until configured readiness checks pass.
- Agent version changes produce a readable diff.

Primary areas:

- `convex/agents.ts`
- `convex/agentRuns.ts`
- `convex/agentEvalFixtures.ts`
- `convex/agentVersions.ts`
- `src/app/(dashboard)/admin/agents/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/evals/page.tsx`

### 4. Developer Ship Checks

Add a central developer/operator ship-check layer for agents, workflows, widgets, and app kits.

Release flow:

- Draft.
- Candidate.
- Approved.
- Live.
- Paused.
- Rolled back.

Capabilities:

- Candidate snapshots.
- Eval results and release-gate status.
- Prompt, rules, tools, model, knowledge, and workflow diffs.
- Required reviewer/developer approvals.
- Rollback to previous live version.
- Release notes generated from structured changes.

Acceptance:

- No high-risk agent or workflow can go live without release-gate evidence.
- A ship-check page explains exactly what changed, what evidence exists, and what still needs human/developer judgment.
- Rollback is explicit, audited, and preserves tenant isolation.

Primary areas:

- `convex/agentVersions.ts`
- `convex/agentEvalFixtures.ts`
- `convex/workflows.ts`
- `convex/auditLogs.ts`
- New route: `src/app/(dashboard)/admin/releases/page.tsx`

### 5. Run Observatory

Turn durable run data into a first-class debugging and trust surface.

Capabilities:

- Timeline of model calls, tool calls, approvals, retrieval hits, memory usage, and workflow steps.
- Cost, token, duration, and retry details.
- Sanitized arguments by default, raw previews only for authorized super-admins.
- Replay original, current-active, or same-version runs.
- Compare replay vs original.
- Convert failures into eval fixtures.
- Convert repeated useful facts into memory candidates.

Acceptance:

- An admin can explain why an agent gave an answer.
- A bad run can become an eval fixture in one or two clicks.
- Replays are safe by default and do not perform external/write/destructive side effects unless a future sandbox executor is explicitly approved.

Primary areas:

- `convex/agentRuns.ts`
- `convex/agentRuntime.ts`
- `convex/agentRunReflections.ts`
- `convex/agentEvalFixtures.ts`
- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx`
- `src/app/(dashboard)/admin/workflows/logs/page.tsx`

### 6. Knowledge Quality Center

Make knowledge operations a major differentiator.

Capabilities:

- Document freshness, drift, chunk, and ingestion status.
- Retrieval test bench.
- Chunk inspection with untrusted-reference warnings.
- Failed ingestion queue.
- Re-embed and repair actions.
- Agent coverage score by topic.
- Stale source detection.
- Bulk remediation.

Acceptance:

- Admins can see whether an agent has enough usable knowledge for its job.
- Failed or stale knowledge is visible and repairable.
- Retrieval tests remain tenant-scoped and bounded.

Primary areas:

- `convex/knowledge.ts`
- `convex/uploads.ts`
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`
- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx`

### 7. Memory And Learning Inbox

Make governed improvement feel alive.

Inbox items:

- Proposed memories.
- Improvement suggestions.
- Reflection evidence.
- Failed eval learnings.
- Tool-missing signals.
- Prompt/rule/policy patch suggestions.

Actions:

- Approve memory.
- Reject memory.
- Apply prompt/rule/policy suggestion.
- Create or update eval fixture.
- Dismiss reflection.
- Open source run.

Acceptance:

- The platform can suggest improvements without applying them silently.
- Every applied improvement is audited and versioned.
- Reviewers can filter by risk, type, source agent, and status.

Primary areas:

- `convex/agentMemoryCandidates.ts`
- `convex/agentImprovementSuggestions.ts`
- `convex/agentRunReflections.ts`
- `convex/agentMemories.ts`
- `src/app/(dashboard)/admin/agents/[id]/memory/page.tsx`

### 8. Public API And Webhook Layer

Make Sonae usable as infrastructure, not only a dashboard.

Capabilities:

- Tenant-scoped signed API keys.
- Trigger an agent run via API.
- Trigger a workflow via API.
- Status polling endpoint.
- Webhook callbacks.
- Rate limits.
- Callback retry and delivery logs.
- Audit trail for every public request.

Acceptance:

- External systems can safely trigger governed agents and workflows.
- API keys are scoped, revocable, and never grant admin dashboard access.
- Public endpoints enforce tenant isolation and budget/rate limits.

Primary areas:

- `convex/http.ts`
- `convex/agentRuns.ts`
- `convex/workflowRuntime.ts`
- `convex/auditLogs.ts`
- New admin route: `src/app/(dashboard)/admin/settings/api-keys/page.tsx`

### 9. White-Label App Shell

Let products built on Sonae feel like their own product.

Capabilities:

- Workspace name, logo, color theme, and app title.
- Module toggles.
- Internal app navigation presets.
- Tenant-facing dashboard mode.
- Widget branding presets.
- Optional custom domain readiness checklist.

Acceptance:

- A tenant-facing app can hide platform-owner admin surfaces.
- App branding is visible across internal app, widgets, emails, and generated embed code.
- Branding remains tenant-scoped.

Primary areas:

- `convex/system.ts`
- `convex/widgets.ts`
- `src/context/SystemSettingsContext.tsx`
- `src/ui/components/layout/SidebarNavigation.tsx`
- `src/app/(dashboard)/admin/settings/page.tsx`

Current implementation note:

- `Admin -> Settings -> System Options` now includes a white-label readiness panel that checks product identity, light/dark logos, brand accent, and diagnostic routing state, then flags widget branding, email sender, and production setup validation as handoff review items.
- Stored email sender name/address settings now feed invite, workflow, auth fallback, and platform-alert email sender defaults when `RESEND_FROM_EMAIL` is not set.
- Public widget config now falls back to system platform name, brand color, logo, greeting, and placeholder when widget-specific theme fields are unset.
- System Options now includes module presets for knowledge assistant, support widget, and operator workspace starter shapes so builders can decide visible modules, owner surfaces, and handoff checks without automatic route hiding.
- System Options now includes a brand handoff summary that composes product identity, logo mode, brand color, runtime email sender, widget posture, diagnostics posture, production validation, next actions, and ready module presets for vertical packaging.
- System Options now includes code-backed navigation profiles for Customer Workspace, Support Widget, and Operator Console builds, showing visible route groups, owner-only routes, hide candidates, and implementation notes without changing runtime authorization or route visibility yet.
- System Options now includes a custom domain readiness checklist for primary app host, widget domain allowlist, email sender domain, DNS/TLS, redirects, and tenant routing isolation as planning evidence before branded deployment.
- System Options now includes a copy-ready packaging checklist that combines brand handoff, readiness evidence, ready module presets, navigation profile previews, and developer follow-up into a single markdown artifact.
- `npm run setup:validate` and `docs/vertical-app-packaging-checklist.md` cover environment, provider, production smoke, and rebrand handoff checks for a new vertical starter.
- `docs/white-label-packaging-operator-guide.md` now explains the System Options white-label workflow from readiness review through packaging-checklist handoff.
- Remaining future work is a persisted route visibility system when a concrete customer build is ready to turn these profile previews into tenant-scoped runtime navigation.

### 10. Demo Seed And Showcase Mode

Create a "make the platform look alive" path for demos, onboarding, and QA.

Seeded data:

- Demo companies.
- Demo users.
- Demo app templates.
- Demo agents.
- Demo knowledge.
- Demo connector installs.
- Demo workflows.
- Demo runs.
- Demo eval passes and failures.
- Demo memory/review inbox items.
- Demo release candidates.

Acceptance:

- A fresh local environment can be made demo-ready with one command.
- Demo data is clearly marked and safe.
- The seed is idempotent.
- The seed does not require production credentials.

Primary areas:

- `convex/localDemoSeed.ts`
- `scripts/local-demo-seed.mjs`
- `README.md`
- `docs/new-agentic-app-setup-checklist.md`

Current implementation status:

- `npm run demo:local:seed` is available as the one-command local demo seed entrypoint through `scripts/local-demo-seed.mjs`.
- `convex/localDemoSeed.ts` seeds a clearly marked local demo tenant, demo super-admin and company-admin users, model defaults, starter knowledge, a `knowledge.search` tool, a draft demo knowledge assistant, starter eval fixtures, app template catalogue records, and sample build plans.
- The seed is idempotent: repeated runs update deterministic records and do not duplicate eval fixtures or launch plans.
- The seed fails closed unless `LOCAL_DEMO_SEED_ENABLED=1` and the shared `LOCAL_DEMO_SEED_SECRET` match, and it is blocked when `LOCAL_DEMO_SEED_ENVIRONMENT=production`.
- `convex/localDemoSeed.test.ts` verifies idempotency, draft-agent readiness, seeded catalogue/build-plan coverage, and disabled/production/wrong-secret failure paths.
- `docs/agentic-starter-framework-overview.md` and `docs/new-agentic-app-setup-checklist.md` document the local no-production-credentials seed path.

Phase 10 completion notes:

- Phase 10 is complete as a safe local showcase foundation. A fresh local environment can be made demo-ready with one command after enabling the guarded seed settings.
- Demo data remains clearly fake, deterministic, local-only, and does not require production credentials.
- Future showcase polish can add more vertical-specific sample data, but the roadmap acceptance criteria for Demo Seed and Showcase Mode are complete.

## Recommended Build Order

### Phase 1: Productize Developer Assembly

Build:

- App Kit Gallery.
- Build Plan Workspace Setup.
- Demo Seed And Showcase Mode updates.

Why first:

- This creates the strongest "a developer can build many products from this" moment.
- It turns existing foundations into a coherent product assembly path.

Current implementation status:

- Added `Admin -> App Kits` with a code-backed app kit gallery in `convex/appTemplates.ts`; `/admin/app-kits` is the visible route and `/admin/launch` remains as a compatibility alias.
- Added 12 starter templates spanning support, sales, operations, compliance, finance, product, industry, and platform/developer use cases.
- Added saved build plans in `appLaunchPlans` with parsed plan detail, audit logs, archive flow, and recent plan listing.
- Added target workspace creation/linking from saved build plans. Workspaces are real company records, audited, inventory-aware, idempotent, and linked back to the plan.
- Added existing-workspace linking from saved build plans, so operators can connect a starter to a real tenant instead of always creating a new workspace.
- Added explicit draft-resource materialization from a saved build plan. Created agents and workflows start inactive, and seeded eval fixtures attach to the draft agents.
- Added connector readiness checks for recommended connectors, including installed/missing state, auth connection state, test status, and links back to Marketplace.
- Added a Build Plan Readiness summary with created/planned counts, connector coverage, blockers, and next actions.
- Added Developer Handoff guidance with follow-up counts, extension-point counts, implementation code pointers, target surfaces, and a compact developer checklist.
- Added a Developer Task Map on saved build plans covering workspace, draft resources, connectors, knowledge, code, and release checks with ready/pending/blocked status.
- Added action labels and links to the Developer Task Map so builders can jump to the relevant workspace, Marketplace, knowledge, agents, or Ship Checks surface.
- Added a task summary strip with blocked/pending/ready counts and the next recommended developer task for faster scanning.
- Added saved Workspace Setup Plan guidance to build plans covering brand/theme, first-admin invite policy, tenant model defaults, and plan assignment, with matching Developer Task Map rows and admin-surface links.
- Added setup-intent fields to App Kit plan creation so operators can capture product name, brand accent, first-admin candidate, invite policy notes, model-default use cases, and target plan before saving a draft.
- Added Guided Setup Actions on saved build plans so brand, first-admin invite, model defaults, and plan assignment show blocked/pending state and route operators to the exact existing admin surface.
- Added Connector Bundle Plan metadata to build plans so operators can select connector keys, capture connector owner, and save integration setup notes before Marketplace activation.
- Added Starter Knowledge Import planning to build plans so operators can capture knowledge owner, source candidates, and missing-source notes before ingestion work starts.
- Added Publish Surface Plan metadata to build plans so operators can capture surface owner, target surfaces, dashboard-card review, and widget/API/embed notes before customer-facing activation.
- Added Surface Implementation Actions on saved build plans so planned target surfaces and dashboard cards become explicit pending review items linked to widget, workflow, schedule, API/tool, app, or report surfaces.
- Added a persisted App Kit catalogue registry with sync/update mutations, editable lifecycle status, owner, notes, source snapshots, demo seed coverage, and inline admin controls on the App Kits page.
- Added `/admin/app-kits` route aliases for the gallery and saved build-plan detail pages, and moved visible navigation/module links to the App Kits path while preserving `/admin/launch`.
- Polished visible navigation and review copy toward App Kits and build-plan language while keeping existing routes stable.
- Updated local demo seeding to include sample build plans, including one materialized plan linked to the seeded demo company and one draft plan for review-flow demos.
- Added focused Convex and React tests for catalogue metadata, authorization, plan creation, materialization, connector readiness, and the app kit UI.

Phase 1 completion notes:

- Workspace setup is complete for Phase 1 as a guided build-plan flow: operators can create/link workspaces, preserve setup intent, and follow generated actions into existing admin surfaces without automatic tenant mutation.
- Knowledge scopes, connector bundles, publish surfaces, and dashboard cards are complete for Phase 1 as planning and implementation-action records; creating production widgets, public APIs, dashboards, and connector installs remains deliberate developer/operator work.
- The App Kit catalogue is now persisted as editable registry objects for lifecycle, owner, notes, and source snapshots; code templates remain the scaffold-default source.
- `/admin/app-kits` is now the visible route; `/admin/launch` remains available for existing links.
- Phase 1 is complete as a developer assembly foundation. The next product work starts in Phase 2: making agents more developer-shippable in Agent Studio and release flows.

### Phase 2: Make Agents Developer-Shippable

Build:

- Agent Studio upgrades.
- Developer Ship Checks foundation.
- Release notes and rollback path.

Why second:

- Developers/operators need confidence before wiring agents into real workflows, widgets, APIs, and customer-specific surfaces.

Current implementation status:

- Started `Admin -> Release Center` as the first Phase 2 ship-check foundation screen. The route name is legacy; visible UI should refer to Developer Ship Checks.
- Added a code-backed release readiness overview in `convex/releases.ts` that reuses existing agent readiness checks, activation warnings, smoke evals, and release gate policy data.
- Added summary counts for blocked drafts, ready release candidates, live agents that need attention, and healthy live agents.
- Added release-lifecycle counts for recent pending, approved, activated, rolled-back, and cancelled ship-check records so operators can scan the release queue separately from agent readiness.
- Added agent-level next actions and direct links into settings, evals, and run history.
- Added record-level recommended next actions for pending, approved, live, rolled-back, and cancelled releases so each ship-check record explains the immediate operator move.
- Added persisted `agentReleases` records with agent version snapshots, release notes, rollback plans, sign-off, activation, rollback, and audit logs.
- Added ship-check controls in `Admin -> Release Center` for creating candidates, approving, activating, and rolling back releases.
- Added release evidence summaries on ship-check records so stored readiness evidence for tools, knowledge, fixtures, smoke evals, release gates, and model configuration is visible without reopening raw agent state.
- Added inline Agent Studio release visibility on agent settings, including latest release state, version number, release notes, rollback warning, and a direct Ship Checks link.
- Added inline Agent Studio release actions for the current lifecycle state: create candidate, approve candidate, activate release, and rollback release.
- Added release owner assignment and approval-comment capture to Developer Ship Checks, with owner/comment visibility in Agent Studio and release audit metadata.
- Added manual activation-window capture, display, and enforcement so approved releases can be constrained to a reviewed launch window before activation.
- Added compact release snapshot comparison against the previous live agent version so Ship Checks and Agent Studio can show which tracked areas changed before approval, with short before/after details for prompt, tools, rules, memory, model, and policy changes.
- Added visible activation-window guards to Ship Checks and Agent Studio so approved candidates show whether activation is open, pending, or expired before an operator clicks Activate.
- Added scheduled activation automation so approved release candidates with reviewed activation windows are activated automatically when the window opens.
- Added expandable Agent Studio snapshot diffs with full tracked-field before/after details and stable-field visibility for deeper release review.
- Added release-candidate cancellation with cancellation reason capture, audit metadata, recent-record visibility, and inline Agent Studio controls for pending or approved candidates that should not ship.
- Added rollback reason capture, audit metadata, and post-rollback investigation guidance so a rollback explains what happened before a replacement candidate is created.
- Added rollback restoration for prior live agent snapshots when available, falling back to deactivation only when there is no earlier live release to restore.
- Added sidebar navigation and focused Convex/React tests for the Ship Checks foundation.

Phase 2 foundation status:

- Release records now preserve owner assignment, approval comments, cancellation reasons, manual activation windows, scheduled activation automation, rollback reasons, and prior-live-snapshot rollback restoration.
- Agent Studio now surfaces latest release state, lifecycle actions, owner assignment, approval comments, activation windows, compact snapshot comparisons, expandable full tracked-field diffs, and stable-field visibility inline.

### Phase 3: Make Trust Visible

Build:

- Run Observatory.
- Knowledge Quality Center refinements.
- Memory And Learning Inbox refinements.

Why third:

- The platform becomes explainable, debuggable, and self-improving under human governance.

Current implementation status:

- Started `Admin -> Run Observatory` as the first Phase 3 trust surface for cross-agent run health.
- Added a code-backed run observatory summary in `convex/agentRuns.ts` that aggregates recent run status, success rate, active runs, failures, cost, token usage, latency, trigger mix, model mix, top agents, tool risk, failure reasons, and recent run next actions.
- Added tenant-scoped observatory behavior: company admins see only their company runs; super admins see platform-wide sampled runs.
- Added deep links from observatory rows back into existing per-agent run timelines for sanitized step inspection, replay, fixture creation, and memory candidate workflows.
- Added sidebar navigation and focused Convex/React tests for the Run Observatory foundation.
- Started Knowledge Quality Center refinements with an agent topic coverage score that compares agent profile terms against sampled ready knowledge, highlights covered and missing topics, and gives release-review guidance before operators trust a candidate.
- Added Learning Review Inbox triage guidance so the agent memory screen prioritizes high-risk learning, improvement suggestions, proposed memories, and reflection evidence before reviewers approve durable behavior changes.

### Phase 4: Make It Infrastructure

Build:

- Public API and webhook layer.
- API keys and rate limits.
- Webhook delivery logs.

Why fourth:

- Once the core experience is safe and observable, Sonae can power external products and customer systems.

Current implementation status:

- Started the Public API foundation with tenant-scoped API key governance before enabling external trigger endpoints.
- Added API key records with company scope, scopes, one-time raw secret return, stored digest and prefix, rate limit metadata, revocation fields, and create/revoke audit logs.
- Added `Admin -> Settings -> API Keys` so operators can create keys for companies, inspect prefixes/scopes/status/limits, and revoke keys through an in-app flow.
- Added internal public-request authentication with request logs, scope checks, expiration/revocation checks, `lastUsedAt` updates, and per-key rate limit enforcement, plus a signed `/api/public/v1/ping` smoke endpoint for validating keys before trigger endpoints are enabled.
- Added a signed `/api/public/v1/run-status?runId=...` polling endpoint that requires `run:read`, enforces API-key tenant scope, and returns sanitized run state without raw tool arguments or step payloads.
- Added a signed `POST /api/public/v1/agent-runs` trigger endpoint that requires `agent:run`, creates tenant-scoped queued agent runs from external systems, snapshots the active agent configuration, and returns the run ID plus polling URL.
- Added a signed `POST /api/public/v1/workflow-runs` trigger endpoint that requires `workflow:run`, runs only active webhook-configured workflows, and records the API-key tenant on the workflow execution.
- Started webhook delivery logs with tenant-scoped delivery records, attempt/retry/failure metadata, preview-only request/response storage, summary health metrics, and an `Admin -> Settings -> Webhook Deliveries` inspection surface.
- Added a reusable webhook delivery dispatcher that queues callback payloads, posts them with bounded previews, records success/failure evidence, schedules exponential retries, and marks exhausted deliveries as abandoned.

### Phase 5: Make It Rebrandable

Build:

- White-label app shell.
- Custom module presets.
- Widget and email branding alignment.

Why fifth:

- This turns the platform into a repeatable base for many vertical products.

Current implementation status:

- Started the white-label readiness foundation with a code-backed `settings.getWhiteLabelReadiness` query that scores product identity, logos, brand color, diagnostic route posture, widget branding, email sender setup, and production setup validation.
- Connected the settings readiness panel to backend readiness evidence while preserving the existing local form fallback during loading or unsaved edits.
- Added a code-backed white-label module preset catalog via `settings.getWhiteLabelModulePresets`, giving Knowledge Assistant, Support Widget, and Operator Workspace stable module lists, owner surfaces, handoff checks, readiness dependencies, and destination links for reuse beyond the settings UI.
- Added a code-backed `settings.getWhiteLabelHandoffSummary` query and settings panel so builders can confirm the product name, logo posture, brand color, runtime sender, widget readiness, diagnostics posture, production gate, next actions, and ready presets from one packaging summary.
- Added code-backed white-label navigation profiles via `settings.getWhiteLabelNavigationProfiles`, previewing which route groups a vertical starter should show, reserve for operators, or hide while preserving server-side authorization as the real access boundary.
- Added a code-backed `settings.getWhiteLabelCustomDomainChecklist` query and settings panel so builders can track branded host, widget allowlist, sender domain, DNS/TLS, redirect, and tenant-routing review evidence before packaging.
- Added a code-backed `settings.getWhiteLabelPackagingChecklist` query and settings panel that produces a copy-ready markdown handoff artifact from readiness evidence, brand posture, module presets, navigation profiles, and developer follow-up.
- Added `docs/white-label-packaging-operator-guide.md` and expanded `docs/vertical-app-packaging-checklist.md` so operators know how to use the white-label readiness, handoff, module, navigation, custom-domain, and packaging panels before a customer-specific build handoff.

Phase 5 completion notes:

- Phase 5 is complete as a rebrandable starter foundation: builders can review white-label readiness, confirm brand and email posture, choose module presets, preview navigation profiles, track custom-domain handoff evidence, and copy a packaging checklist from System Options.
- Widget and email branding alignment is complete at the starter layer: stored system branding feeds runtime email sender fallback behavior and public widget defaults, while widget-specific configuration can still override the customer-facing experience.
- Module and navigation customization remains intentionally planning-first. Runtime route hiding should only be persisted for a concrete product build after server authorization, tenant routing, audit behavior, and support workflows are reviewed.
- The next roadmap work starts after Phase 5 with demo seed/showcase mode and any customer-specific packaging polish requested during an actual vertical build.

## Roadmap Completion

This Starter Platform Expansion Plan is complete as a foundation implementation.

Completed foundations:

- App Kit Gallery and build-plan workspace setup
- Agent Studio and developer ship checks
- Trust, run observability, knowledge quality, and learning review surfaces
- Public API, API key governance, workflow triggers, and webhook delivery foundations
- White-label/rebrandable packaging tools
- Local demo seed and showcase mode

Remaining work should now be treated as customer-specific product packaging, persisted route visibility for a concrete build, flagship showcase content, or follow-on roadmap work rather than unfinished scope in this plan.

## Design Principles

- Build workflows, not isolated forms.
- Default everything risky to draft, disabled, or approval-required.
- Treat every agent action as explainable evidence.
- Make tenant isolation visible and testable.
- Prefer setup wizards for first-run flows and dense admin surfaces for repeat operations.
- Keep external side effects governed by approvals, audit logs, scopes, and secret references.
- Keep demo data useful but clearly fake.
- Keep English and Italian locales in parity.

## Open Questions

- Should "app template" become a first-class persisted object, or remain a versioned code catalogue initially?
- Should the launch wizard create workflows immediately, or recommend them as post-launch steps?
- Should release gates apply to widgets and workflows as strictly as agents?
- Should public API usage count against the same plan quotas as chat and widgets?
- Which first vertical app should become the flagship showcase?

## Near-Term Candidate Slice

The next practical slice is:

1. Add a new `Admin -> App Kits` route for the app kit/build-plan workspace setup flow.
2. Add a code-backed app template catalogue with 5-7 templates.
3. Let the setup flow instantiate a draft tenant build plan before creating resources.
4. Create resources only after an explicit review step.
5. Add demo seed coverage so the setup flow can be shown with realistic data.

This slice gives Sonae the biggest product lift without requiring live third-party connector execution.
