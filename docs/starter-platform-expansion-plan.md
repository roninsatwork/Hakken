# Starter Platform Expansion Plan

This plan captures the next product layer for making Sonae feel like an exceptional reusable starter platform. It focuses on capabilities outside the connector marketplace.

The goal is not to add random admin pages. The goal is to make Sonae a launchpad where a team can create, test, govern, publish, observe, and improve many different agentic products from one core platform.

## Product North Star

Sonae should let a builder start with a customer or app idea and quickly produce a governed, production-ready agentic application:

1. Create a workspace.
2. Pick an app template.
3. Configure brand, model defaults, knowledge, connectors, workflows, and widgets.
4. Build and test agents.
5. Pass release gates.
6. Publish internal and external surfaces.
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

### 1. App Template Gallery

Move beyond single-agent templates into full app starters.

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
- Risk profile, approval policy, and blocked-action expectations.
- Suggested dashboard cards or reports.
- White-label navigation/module recommendations.

Acceptance:

- A super-admin can instantiate a full app template into draft resources.
- Created resources are draft or disabled by default.
- The template creates or recommends agents, tools, knowledge areas, workflows, evals, and widgets.
- The template records audit metadata showing source template, created resources, missing requirements, and next steps.
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

### 2. New Workspace Launch Wizard

Add a guided setup path for creating a new customer or app workspace.

Wizard steps:

1. Company profile.
2. Brand and theme.
3. First admin and invite policy.
4. Model defaults.
5. App template selection.
6. Starter knowledge import.
7. Connector bundle selection.
8. Agent readiness and smoke test.
9. Publish internal app and optional widget.

Acceptance:

- A super-admin can create a usable tenant without jumping across ten admin pages.
- The wizard can save progress and resume.
- The final review shows what will be created, what is missing, and what remains draft.
- The wizard never activates risky agents, workflows, widgets, or external tools without explicit review.

Primary areas:

- `convex/companies.ts`
- `convex/users.ts`
- `convex/aiModels.ts`
- `convex/agents.ts`
- `convex/knowledge.ts`
- `convex/widgets.ts`
- `src/app/(dashboard)/admin/companies/page.tsx`
- New route: `src/app/(dashboard)/admin/launch/page.tsx`

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

### 4. Release Center

Add a central release management layer for agents, workflows, widgets, and app templates.

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
- Required reviewer approvals.
- Rollback to previous live version.
- Release notes generated from structured changes.

Acceptance:

- No high-risk agent or workflow can go live without release-gate evidence.
- A release page explains exactly what changed and why it is safe.
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

## Recommended Build Order

### Phase 1: Productize The Launch Moment

Build:

- App Template Gallery.
- New Workspace Launch Wizard.
- Demo Seed And Showcase Mode updates.

Why first:

- This creates the strongest "I can build many apps from this" moment.
- It turns existing foundations into a coherent product path.

### Phase 2: Make Agents Feel Shippable

Build:

- Agent Studio upgrades.
- Release Center foundation.
- Release notes and rollback path.

Why second:

- Users need confidence before giving agents real workflows and customers.

### Phase 3: Make Trust Visible

Build:

- Run Observatory.
- Knowledge Quality Center refinements.
- Memory And Learning Inbox refinements.

Why third:

- The platform becomes explainable, debuggable, and self-improving under human governance.

### Phase 4: Make It Infrastructure

Build:

- Public API and webhook layer.
- API keys and rate limits.
- Webhook delivery logs.

Why fourth:

- Once the core experience is safe and observable, Sonae can power external products and customer systems.

### Phase 5: Make It Rebrandable

Build:

- White-label app shell.
- Custom module presets.
- Widget and email branding alignment.

Why fifth:

- This turns the platform into a repeatable base for many vertical products.

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

1. Add a new `Admin -> Launch` route for the workspace/app launch wizard.
2. Add a code-backed app template catalogue with 5-7 templates.
3. Let the wizard instantiate a draft tenant setup plan before creating resources.
4. Create resources only after an explicit review step.
5. Add demo seed coverage so the wizard can be shown with realistic data.

This slice gives Sonae the biggest product lift without requiring live third-party connector execution.
