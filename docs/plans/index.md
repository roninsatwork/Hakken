# Plans

On 2026-07-20 the earlier movement and platform plans were retired to start
fresh. The current active folder now contains the live movement plan, current
platform/admin planning notes, and handover material for unfinished or recently
completed work.

## Active Plans

- [Movement Definitive Plan](./active/movement-definitive-plan.md) — the vision,
  acceptance rules, capture-screen rules, and work queue for all movement work.
- [Platform Hardening Plan](./active/platform-hardening-plan.md) — the platform
  hardening record for correctness, security, operational envelope, agent
  runtime, and reusability work. Its current handover states that all planned
  days are complete, but the document remains in `active/` as the detailed
  write-up until it is deliberately archived.
- [Admin UI/UX Plan](./active/admin-ux-plan.md) — the current admin usability
  plan for model catalogue, Skill Center, skill detail, model defaults, system
  options, API keys, and related admin surfaces.
- [OpenRouter And Model Scale Plan](./active/openrouter-and-model-scale-plan.md) —
  adding OpenRouter as a provider across the whole app, and the database-side
  paging, search indexes and rollups the model catalogue needs to hold hundreds
  of models. Owns the AI Providers screen and everything about provider
  resolution at run time.
- [AI Checks Plan](./active/ai-checks-plan.md) — the plan to make AI testing real
  and understandable across both surfaces. Owns company evals and agent evals,
  the shared "Check" vocabulary, and the readiness gates that depend on eval
  evidence. Read it before touching `convex/companyEvals.ts`,
  `convex/agentEvalFixtures.ts`, or either evals screen.
- [Agent Observability Plan](./active/agent-observability-plan.md) — the plan to
  replace the basic agent Logs tab with an Observability menu that answers
  whether an agent is working properly. Owns the agent Overview screen, the job
  detail and waterfall, the rebuilt raw logs, and the `agentLogs` fields that
  link a log entry back to its run. Read it before touching
  `convex/agentLogs.ts` or either of the agent logs and runs screens.
- [Rightmove Agent Execution Plan](./active/rightmove-agent-execution-plan.md) —
  the plan to make the Rightmove Agent the single execution path for property
  collection, whether started from admin or from the user-facing Properties
  Search screen. Owns the shift from direct Apify starts to agent-owned runs and
  the link between agent runs, Apify collections, Properties Logs, and Scraped
  Data.
- [Public Website Plan](./active/public-website-plan.md) — the active plan for
  the public pre-login website, including the home page, future platform,
  showcase, trust, and contact pages, animation direction, public copy rules,
  route state, and the contact backend design.
- [User Directory Plan](./active/user-directory-plan.md) — the plan for the
  read-only, platform-wide user directory at `/admin/directory`, and for the
  login recording and 30-day aggregation behind its two activity columns. Owns
  `users.lastLoginAt`, `users.loginCount30d`, and `recordLogin`. Read it before
  touching the `logins` table or adding anything to `/admin/users`.
- [Email Design System Plan](./active/email-design-system-plan.md) — the plan to
  put every outbound email through one shared shell: platform alerts, invites,
  agent notifications, and workflow email nodes. Owns the forest email palette,
  the sender identity, the plain-text alternative, and the legacy-Outlook client
  support matrix. Read it before touching `convex/platformAlertService.ts`,
  `convex/invites.ts`, `convex/aiToolNotificationService.ts`, or the email node
  in `convex/workflowRuntime.ts`.
- [Agent Autonomy And Approvals Plan](./active/agent-autonomy-and-approvals-plan.md) —
  the approvals and autonomous-tool-execution plan for agent runs and workflow
  approvals. Read it before changing approval queues, tool confirmation policy,
  parked run behaviour, or approval expiry.
- [Pressing Run Should Actually Run The Agent](./active/agents-run-properly-plan.md) —
  the plan/history for making manual and scheduled agent runs use the real
  tool-capable agent loop.
- [Company AI Readiness Rebuild Plan](./active/company-ai-readiness-rebuild-plan.md) —
  the replacement plan for the company AI readiness screen and its score,
  model-routing, eval, memory, widget, skill, and activity signals.
- [Company And Agent Model Defaults Plan](./active/company-and-agent-model-defaults-plan.md) —
  the plan for bringing company model overrides and agent engine settings up to
  the platform Model Defaults standard.
- [Observability Collection And Killswitch Handover](./active/observability-collection-and-killswitch-handover.md) —
  handover context for honest Apify collection reporting and a visible agent
  kill switch.
- [Workspace Sales Data Plan](./active/workspace-sales-data-plan.md) — the plan
  for the optional per-workspace spreadsheet import and its three browsable
  tables, and for the `companies.enabledModules` flag that switches any optional
  section on for one workspace without naming a client in platform code. Owns
  `convex/salesData.ts`, the workbook parser, and `/app/sales-data`. Read it
  before adding another client-specific section, or before touching the module
  registry in `convex/utils/companyModules.ts`.
- [Documentation Coverage Audit](./active/documentation-coverage-audit.md) —
  the current documentation audit map, work queue, and validation notes.
- [Outstanding Tasks](./active/OUTSTANDING-TASKS.md) — the current queue of
  work left outside the platform hardening plan or deliberately stopped short of
  that plan.
- [Handover](./active/HANDOVER.md) — the current platform-hardening handover
  state, including verification status, local operating notes, and unfinished
  follow-up context.

The plans do not overlap. If work touches movement, the Movement Definitive Plan
wins. If work touches non-movement platform hardening, check the Platform
Hardening Plan, then Outstanding Tasks and Handover for current status. If work
touches AI providers, provider resolution at run time, or the scale of the model
catalogue, use the OpenRouter And Model Scale Plan. If work touches AI testing —
company evals, agent evals, or the readiness gates that read eval evidence — use
the AI Checks Plan. If work touches how an agent's activity is displayed — the
Observability menu, the job detail, or raw logs — use the Agent Observability
Plan, which defers approvals behaviour to the Agent Autonomy And Approvals Plan
and eval content to the AI Checks Plan. If work touches the Rightmove property
collection flow, especially `/app/properties/search`, Apify collection linkage,
or whether the user frontend starts an agent or a scraper directly, use the
Rightmove Agent Execution Plan. If work touches the public pre-login site, use
the Public Website Plan. If work touches documentation coverage, use the
Documentation Coverage Audit. If work touches the other named admin UX screens,
use the Admin UI/UX Plan.

## Retired And Completed Plans

Everything in [completed/](./completed/) is historical reference only unless a
current active document explicitly points to it for background. Retired movement
plans carry a note at the top pointing back to the Movement Definitive Plan.
Completed platform plans such as provider-neutral model work, analytics scale
optimization, platform scale hardening, post-scale hardening, Replay repair, and
Replay/Game alignment should not be treated as current implementation
instructions unless they are deliberately reopened.
