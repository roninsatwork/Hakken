# Documentation Coverage Audit

Last reviewed: 2026-08-16
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
recent commits since the previous documentation run, package scripts, and the
existing Markdown indexes. The 2026-08-16 pass found real durable-doc gaps for
the newly implemented Company Wiki pages/map/import/review surface and the
spoken-channel surfaces that combine Ask Sonae live voice, inbound phone calls,
and voice administration, the implemented Gmail mailbox connector/watch loop,
and the photo-action flow that turns image-bearing chat/widget turns into
human-confirmed tasks, plus the receptionist/kiosk screen and widget embed-pass
security changes. Those gaps were repaired with dedicated end-user and
developer pairs or targeted refreshes.

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
- The newly routed Wiki pages under `/admin/ai/knowledge` and
  `/admin/companies/[id]/ai/pages`, their shared UI in
  `src/app/(dashboard)/admin/_features/wiki/`, and the `convex/wiki*.ts`
  backend modules.
- Spoken-channel routes and services, including `/app/calls`,
  `/app/calls/[id]`, `/admin/ai/voice`, Ask Sonae's real-time voice overlay,
  `convex/ai.ts` live voice helpers, `convex/voice*.ts`, `convex/telephony*.ts`,
  and the browser voice-session helpers under `src/lib/`.
- Gmail mailbox connector and watcher implementation, including the
  `google-gmail` connector definition, OAuth authorize/callback routes,
  encrypted token storage, refresh/revoke flow, `gmail.read` and `gmail.reply`
  handlers, `mailboxMessages`, the watcher cron, follow-up tasks, and Wiki
  handoff.
- Photo-action implementation, including Assistant chat image attachments,
  widget photo uploads, `convex/ai.ts` vision routing, `convex/agentRuntime.ts`
  image handling, `convex/photoActionService.ts`, `PhotoActionChip`,
  `tasks.confirmPhotoAction`, and upload-policy limits.
- Receptionist screen implementation, including `/app/reception`,
  `/kiosk/[widgetId]`, widget Integration opt-in, `convex/kiosk.ts`,
  `convex/kioskActions.ts`, kiosk schema fields, live relay behavior,
  heartbeat, rate limits, in-memory visitor tokens, and silence reset.
- Widget embed-pass implementation, including `src/proxy.ts`,
  `src/app/w/[widgetId]/page.tsx`, `WidgetIframeClient`, `convex/widgets.ts`,
  `convex/utils/widgetEmbedPass.ts`, `convex/utils/widgetOriginPolicy.ts`, and
  `src/lib/widgetEmbedPolicy.ts`.

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
- Run a fresh August coverage pass after the governance, sales-data, typed-code
  auth, user-directory, and email-preview work. This added dedicated Governance
  and Sales Data workspace doc pairs, refreshed `/verify`, one-time-code, email
  preview, read-only user-directory, and moved-approval-route docs, and updated
  the route, Convex, schema, and script coverage maps.
- Refresh documentation after the import-screen full-clear and workflow webhook
  origin fixes. The Sales Data guide pair now distinguishes the CRM-preserving
  reset from the import-screen full clear, including running-job refusal and
  workbook deletion. The workflow guide pair and deployment guide now record
  that webhook examples use `CONVEX_SITE_URL` for the Convex HTTP Actions site
  origin rather than guessing from the public Convex client URL.
- Refresh the knowledge pair for Markdown ingestion, OKF folder uploads,
  bounded browser concurrency, frontmatter title handling, queued processing,
  and hybrid retrieval with source evidence.
- Refresh the workflow pair and runtime guide for transient-only retries on
  safe agent nodes, including attempt limits, backoff, side-effect exclusions,
  and recorded retry evidence.
- Refresh agent, Company AI, and operations guides for rehearsal evals,
  automatic reflection, self-improvement controls, and autonomous memory.
- Refresh assistant and widget guides for provider-independent streaming,
  Convex-backed stream rows, progressive reveal pacing, feedback controls,
  anonymous widget quota privacy, and PII redaction order.
- Refresh deployment and system-health guides for optional Sentry monitoring,
  privacy defaults, source-map credentials, and the current deploy-workflow
  boundary.
- Refresh the central, end-user, developer, and plans indexes, then update the
  Convex/schema coverage references for all implementation files discovered in
  this pass.
- Add the Company Wiki documentation pair:
  `docs/end-user/company-wiki.md` and `docs/developer/company-wiki.md`.
- Refresh the knowledge guides so the source archive, ingestion, and repair
  layer is clearly separated from the new page-based Wiki layer.
- Refresh the route, Convex, schema, and coverage maps with Wiki routes,
  `convex/wiki*.ts` modules, wiki schema tables, review-before-write behavior,
  open questions, staff agents, page receipts, and map ownership.
- Add the spoken channels documentation pair:
  `docs/end-user/spoken-channels.md` and
  `docs/developer/spoken-channels.md`.
- Refresh assistant chat, AI administration, and deployment documentation so
  they distinguish dictation, live voice, phone calls, voice preview, model
  defaults, relay configuration, and phone-call runtime variables.
- Refresh the route, Convex, schema, and coverage maps with spoken routes,
  `convex/telephony*.ts`, `convex/voice*.ts`, real-time voice helpers,
  `phoneCalls`, `companies.spokenVoice`, relay tickets, call admission limits,
  and post-call summary/customer/task handoff behavior.
- Add the Gmail mailbox documentation pair:
  `docs/end-user/gmail-mailbox.md` and
  `docs/developer/gmail-mailbox.md`.
- Refresh AI tools/connectors, provider extension, outbound email, deployment,
  route, Convex, schema, and coverage docs so they no longer describe Gmail or
  OAuth as unavailable scaffolding and instead record the current OAuth-backed
  mailbox implementation plus its live-proof boundary.
- Add the photo-actions documentation pair:
  `docs/end-user/photo-actions.md` and
  `docs/developer/photo-actions.md`.
- Refresh assistant chat, embedded widget, model-default, upload-policy, Convex,
  schema, and coverage docs for image attachments, widget photo upload,
  `vision` defaults, non-vision fallback behavior, proposal extraction, and
  one-tap task confirmation.
- Refresh the active Gmail mailbox and photo-action plans so their historical
  2026-08-13 implementation baselines are no longer labelled as current product
  state, and so each plan records the 2026-08-16 implementation state plus its
  remaining live-proof boundary.
- Add the Receptionist screen documentation pair:
  `docs/end-user/receptionist-screen.md` and
  `docs/developer/receptionist-screen.md`.
- Refresh embedded widget, spoken-channel, deployment, route, Convex, schema,
  and coverage docs for widget embed-pass enforcement, per-widget
  `frame-ancestors`, `WIDGET_EMBED_SIGNING_SECRET`, receptionist opt-in,
  `/app/reception`, `/kiosk/[widgetId]`, kiosk heartbeats, anonymous kiosk
  tokens, and voice-session limits.
- Refresh the active receptionist-kiosk plan so its historical 2026-08-13
  implementation baseline is no longer labelled as current product state, and
  so it records the 2026-08-16 implementation state plus tablet-proof boundary.
- Refresh the active voice-session, voice-languages, telephone-agent, and
  showcase-channels plans so their shipped-channel status and historical
  2026-08-13 baselines no longer contradict the maintained spoken-channel,
  Gmail mailbox, photo-action, and receptionist-screen guides.
- Refresh the Company Wiki developer guide and coverage maps for current
  platform-scope UI routes and backend doors, including global page
  reads/writes, distill progress, open questions, and review decisions with
  super-admin and read-only access boundaries.
- Add the Tasks and Notifications documentation pair:
  `docs/end-user/tasks-and-notifications.md` and
  `docs/developer/tasks-and-notifications.md`.
- Refresh the route, Convex, schema, coverage, and active-plan maps for
  `/app/tasks`, task/notification tables, tenant task mutations, agent/workflow
  task creation, photo/Gmail/phone follow-up tasks, in-app notification read
  state, and the current delivered status of the platform-improvement and
  tasks/notifications plans.

### Remaining Follow-Up

The 2026-08-16 run completed the highest-priority Wiki, spoken-channel, Gmail
mailbox, photo-action, receptionist-screen, and widget embed-pass documentation
gaps. The next queue should re-audit the then-current implementation and
indexes for any newly changed routes, Convex modules, scripts, operational
procedures, or active plans rather than assuming this result is permanent.

This pass also refreshed `docs/plans/active/global-wiki-plan.md` after the
current worktree showed the platform Wiki screen fold and global Wiki doors had
landed. The plan now records the platform Wiki as partially built, with answer
integration, global staff rounds, and browser/audit proof still tracked as
implementation follow-up rather than missing documentation.

The public website still contains links to routes owned by
`docs/plans/active/public-website-plan.md` that have not shipped. That is a
product implementation item, not documentation work: the current public-site
guide already records the boundary. Do not add speculative route documentation
or change product behavior from this automation.

Continue to refresh Company AI, Sales Data, active-plan lifecycle, and operator
coverage only when their implementation changes or a real new operating
procedure appears. Do not create speculative runbooks or mark roadmap work
complete from documentation evidence alone.

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
