# Documentation Coverage Audit

Last reviewed: 2026-08-04 10:59 UTC
Status: active documentation-control note
Audience: agents keeping Sonae documentation aligned with the implementation.

## Purpose

This note records the current documentation audit state so future automation
runs do not have to rediscover the same coverage map from scratch. It is not a
replacement for the documentation indexes. The front door remains
`docs/index.md`, with audience maps in `docs/end-user/index.md`,
`docs/developer/index.md`, `docs/operator/index.md`, and `docs/plans/index.md`.
The full route, schema, Convex function-family, script, and feature coverage
map now lives in
`docs/developer/function-and-feature-coverage-matrix.md`.

The implementation remains the source of truth. This audit checked the current
route tree, sidebar navigation, Convex schema tables, Convex module inventory,
package scripts, and the existing Markdown indexes. It found broad guide
coverage for the routed product families, but it also found active planning
material that was not linked from the plan indexes and a public-site route drift
that should be handled by the public website work rather than hidden in docs.

## Implementation Areas Reviewed

- Repository identity: `AGENTS.md`, `package.json`, `docs/index.md`, `.git/`,
  branch `dev`, and remote `https://github.com/roninsatwork/Sonae.git`.
- App routes under `src/app/(dashboard)/app`, `src/app/(dashboard)/admin`,
  `src/app/(dashboard)/demos`, `src/app/(public)`, `/login`, `/w/[widgetId]`,
  `/sandbox/[widgetId]`, and the local/e2e API routes.
- Sidebar navigation in `src/ui/components/layout/SidebarNavigation.tsx`,
  including admin, assistant, reports, properties, Posture Studio,
  organization settings, arcade, system settings, maintenance, agents,
  workflows, AI, companies, users, and super-admin routes.
- Convex schema tables in `convex/schema.ts`, including companies, users,
  plans, auth, AI providers and models, agents, agent runs, approvals,
  evals, memories, skills, company AI, knowledge, threads/messages, tools,
  workflows, schedules, sales reports, widgets, analytics, Apify/property
  data, movement sessions, purges, and maintenance script runs.
- Non-generated Convex source modules by file inventory, including auth,
  tenancy, admin query helpers, AI/provider modules, agents, workflows,
  knowledge, widgets, public API/webhooks, analytics, arcade, properties,
  movement, local demo seed, local test auth, and maintenance scripts.
- Existing docs indexes and audience directories under `docs/`.

## Coverage Result

No high-priority missing documentation pair was found for the main routed
product families. Existing end-user and developer guides cover the broad
surfaces that are currently exposed in navigation:

- assistant chat and chat threads
- login, authentication, route protection, auth diagnostics, users, invites,
  companies, workspaces, and tenancy
- administration, shared admin UI, settings, plans, API keys, analytics, audit
  logs, system health, platform alerts, maintenance scripts, and data retention
- AI administration, AI rules and prompts, model/provider/cost settings,
  tools/connectors, knowledge, widgets, agents, agent configuration, agent
  runtime operations, evals, observability, memories, and approvals context
- workflow automation, executions, schedules, and runtime internals
- property research, Rightmove/Apify collection flow, scraped data, logs, and
  sales/board reports
- auxiliary experiences: Ronin's Run and Agentic Testing Sandbox
- public API, webhooks, embedded widgets, platform packaging, and white-label
  extension material
- the frozen temporary Posture Studio/movement demo documentation and required
  movement mirror/definitive-plan guardrails

The plan/documentation map was stale, however. Several active plans existed in
`docs/plans/active/` without being linked from `docs/plans/index.md` or the
main docs map. This run repaired the active plan list and added this audit note
as the durable documentation work queue.

## Documentation Work Queue

### Completed In This Run

- Link every current active plan from `docs/plans/index.md`.
- Reflect the full active plan set from the main `docs/index.md` map.
- Record this documentation coverage audit as an active plan/documentation
  control note.
- Add `docs/developer/function-and-feature-coverage-matrix.md` as the durable
  matrix for all routed feature families, Convex function families, schema
  tables, scripts, current documents, and remaining documentation work.
- Add a current public website documentation pair:
  `docs/end-user/public-website.md` and `docs/developer/public-website.md`.
- Add a current company AI readiness/checks documentation pair:
  `docs/end-user/company-ai-readiness-and-checks.md` and
  `docs/developer/company-ai-readiness-and-checks.md`.
- Add a dedicated sales and board reports documentation pair:
  `docs/end-user/sales-and-board-reports.md` and
  `docs/developer/sales-and-board-reports.md`.
- Update coverage notes so they no longer read as an unexplained blanket
  assertion.
- Run a second stale-content pass after recent Sonae changes. This corrected:
  Rightmove Agent execution docs, AI tool/connector OAuth availability, removed
  MCP/skill-detail routes, admin dashboard current behavior, company AI
  readiness routing, agent instructions/standing-job wording, public/frontend
  route paths, widget configuration component paths, workflow execution route
  history, and public-site screenshot asset notes.
- Refresh active-plan coverage after the August sales-data and email work:
  `docs/index.md` now links every current file under `docs/plans/active/`, and
  the plan index names the email system's neutral charcoal shell and accessible
  blue/gold/red signal ramp instead of the superseded forest palette.
- Refresh the email documentation pair for the implemented colour-blind-safe
  status contract: `docs/developer/email-system.md` records the palette tokens,
  dark-mode lock classes, severity text fallback, and tests; `docs/end-user/emails.md`
  explains that alerts carry status in words as well as colour.
- Refresh the sales and board reports documentation pair for the implemented
  workspace Opportunity Report: `docs/end-user/sales-and-board-reports.md`
  covers `/app/<workspace>/opportunity-report`, prospect valuation, group gaps,
  named sister-account comparisons, and size-field caveats; `docs/developer/sales-and-board-reports.md`
  covers `convex/salesOpportunityReports.ts`, deterministic pricing ownership,
  schema role, watchdog completion, and the localisation contract for named
  sister-account evidence.

### Remaining Follow-Up

1. Public website route drift: `src/app/(public)/_components/home/WhatSonaeIs.tsx`
   links to `/platform`, and `ContactLink` falls back to `/contact`, but those
   routes are still pending in `docs/plans/active/public-website-plan.md`. Do
   not fix this from documentation automation. Handle it under the public
   website plan with explicit user approval because it changes public product
   behaviour.
2. Company AI follow-up: the current overview, checks, memory, and skills routes
   are now documented, but the active Company AI readiness rebuild and AI Checks
   plans still own follow-up semantics. Refresh the pair when those plans settle.
3. Sales and board reports follow-up: the current information page, latest
   report dashboard, generation action, schema, export behavior, tenancy, and
   workspace Opportunity Report are now documented. Refresh the pair when report
   history, manual regeneration, source selection, formal document export, or a
   materially different opportunity-report workflow ships.
4. Thin-doc review: some audience guides are concise by design, but future
   runs should review the shorter end-user and developer documents when their
   implementation areas change. A short guide is not automatically wrong, but
   it should still be useful enough for the intended audience.
5. Active-plan lifecycle: several active plans are detailed investigations or
   handovers. Future agents should archive or mark them complete only after
   confirming the implementation state and receiving approval when scope or
   roadmap status changes.
6. Public website documentation: when `/platform`, `/showcase`, `/trust`, and
   `/contact` ship, add or refresh the appropriate end-user/operator/developer
   documentation and indexes in the same documentation pass.
7. Operator coverage: current operator docs cover local auth, demo seed,
   movement demos, and packaging. Add operator runbooks only when a real
   operational workflow exists; do not create speculative runbooks.

## Validation Notes

The audit found:

- no copied Conterra/Conterra Ops documentation prompt residue in `docs/` or
  `AGENTS.md`
- no empty Markdown files under `docs/`
- no broken local Markdown links under `docs/`
- no `docs/features/`, `docs/product-documentation-index.md`, or
  `docs/README.md` requirement in the Sonae docs structure
- every implemented app/API route is listed in
  `docs/developer/route-reference.md`
- every non-test top-level Convex source/config file is referenced from the
  Convex reference or coverage matrix
- every schema table is referenced from the Convex reference or coverage matrix
- every package script is either listed directly or covered by the documented
  `movement:*` script family grouping
- current docs and active plans have no unresolved backticked source-path
  references except explicitly planned files and explicitly historical paths

Draft-language scans include legitimate historical plan wording and product
copy such as widget input text, connector scaffolding, and old plan notes.
Treat those as review signals, not automatic failures, unless the current
document being edited is actually thin, empty, or scaffold-only.
