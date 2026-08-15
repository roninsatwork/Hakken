# Plans

On 2026-07-20 the earlier movement and platform plans were retired to start
fresh. The current active folder now contains the live movement plan, current
platform/admin planning notes, and handover material for unfinished or recently
completed work.

## Active Plans

- [The Wiki Replaces Knowledge](./active/wiki-replaces-knowledge-plan.md) —
  the agreed direction as of 2026-08-15: importing a website, file or text
  writes wiki pages directly, answers come from whole pages, and the
  document-and-fragment machinery retires behind an exam. Designs drawn;
  three decisions open; build not started.
- [The Self-Improving Wiki](./active/self-improving-wiki-plan.md) — Karpathy's
  LLM Wiki pattern built faithfully into Sonae: whole pages the AI rewrites
  after every conversation, tended on a schedule, readable and correctable in
  the company AI section. Agreed 2026-08-14; build awaits Anthony's go,
  phase by phase.
- [Movement Definitive Plan](./active/movement-definitive-plan.md) — the vision,
  acceptance rules, capture-screen rules, and work queue for all movement work.
- [Platform Hardening Plan](./active/platform-hardening-plan.md) — the platform
  hardening record for correctness, security, operational envelope, agent
  runtime, and reusability work. Its current handover states that all planned
  days are complete, but the document remains in `active/` as the detailed
  write-up until it is deliberately archived.
- [Platform Improvement Plan](./active/platform-improvement-plan.md) — the
  delivered follow-up covering shared hybrid retrieval, workflow retry safety,
  assistant streaming, rehearsal evals, and Sentry-backed error monitoring.
  Read it for the cross-feature acceptance record and use the more specific
  active plans where ownership has since split out.
- [Widget Messages Spend From The Company's Plan](./active/widget-plan-quota-plan.md) —
  the implemented decision that anonymous widget messages share the company's
  plan allocation, while quota refusals hide billing state, preserve PII
  redaction, and localize the platform-authored notice from browser language.
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
  agent notifications, and workflow email nodes. Owns the neutral charcoal
  shell, the blue/gold/red accessible signal ramp, the sender identity, the
  plain-text alternative, and the legacy-Outlook client support matrix. Read it
  before touching `convex/emailLayoutService.ts`,
  `convex/platformAlertService.ts`,
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
  `convex/salesData.ts`, the workbook parser, and `/app/<workspace>/spreadsheet-import`. Read it
  before adding another client-specific section, or before touching the module
  registry in `convex/utils/companyModules.ts`.
- [Workspace Customer CRM Plan](./active/workspace-customer-crm-plan.md) — the
  plan for customer records inside the workspace section: a searchable customer
  list, a profile holding the details staff type in, and the buying history the
  import already provides. Read it before adding anything customer-shaped to
  the sales data vertical, and for what the import does and does not hold —
  there are no orders in it, and only 39 customers behind the 4,568 rows.
- [Workspace Customer Research Agent Plan](./active/workspace-customer-research-agent-plan.md) —
  the plan for the agent that searches the internet for what the sales import
  cannot supply: the contact details behind each customer, and the other sites
  in a group the workspace does not yet sell to. Owns the
  `salesDataCustomerResearch` and `salesDataProspects` tables, the three
  customer research tools, the rule that decides whether a finding is written or
  parked for review, and the rules that stop a discovered site being filed as a
  prospect when it is already a customer. Read it before giving any agent write
  access to workspace customer data, before adding anything to the customer
  list that is not an imported account, and it defers autonomy and approval
  behaviour to the Agent Autonomy And Approvals Plan.
- [Market Discovery Agent Plan](./active/market-discovery-agent-plan.md) —
  the plan for the separate agent lane that finds new parent companies outside
  imported customer groups, then files their locations as clearly labelled
  market-discovery prospects. Owns the future `Find new groups` button, its
  queue-backed progress bar, discovered-parent-company records, prospect origin
  labels, and opportunity-report separation between warm existing-chain
  prospects and colder market-discovery prospects.
- [Comax Opportunity Report Plan](./active/comax-opportunity-report-plan.md) —
  the plan for the Comax - Opportunity Report Agent and its screen: pricing
  every prospect from the spend of similar-sized customers (bedrooms for care
  homes, pupils for schools, same parent group first), pricing the product
  categories a chain member is not buying that its siblings are, and the
  report screen with the run button and progress bar. Owns the
  `salesOpportunityReports` table, the `opportunityReport.*` tools, and
  `/app/<workspace>/opportunity-report`. Read it before adding anything
  opportunity-or-revenue-shaped to the sales data vertical.
- [Research Agent Autopilot Plan](./active/research-agent-autopilot-plan.md) —
  turning the customer research and prospecting sweeps into one job that runs all
  three tasks to completion under a single press, replacing the fan-out of one
  agent run per customer and per chain. Read it before touching the sweeps in
  `convex/salesDataResearch.ts`.
- [Governance And Trust Plan](./active/governance-and-trust-plan.md) — delivered
  2026-08-06, and kept in `active/` because its framework test and its recorded
  decisions govern what comes next. The phased plan for the AI register, risk
  classification, evidence export,
  governance navigation, and the access-control and personal-data-rights work a
  serious enterprise buyer checks for. Owns the Governance section, the auditor
  and read-only roles, one-time-code sign-in, and anything claiming compliance
  evidence. Records the decision not to build single sign-on. Read it before
  adding a governance surface, a new role, or a sign-in method.
- [Audit Trail Plan](./active/audit-trail-plan.md) — the plan to make the audit
  trail say what happened rather than only what fields changed, written after
  most rows on the finished screen read "nothing recorded" over records that
  held plenty. Owns `convex/auditLogService.ts`, `convex/auditLogs.ts`, both
  audit trail screens, and the rule the rest of the platform follows when
  writing an entry. Records the decision that retention deletion must log
  itself, and the decision not to build tamper-proofing or page-view logging
  yet. Read it before adding an audit entry anywhere.
- [Knowledge Markdown And Bulk Upload Plan](./active/knowledge-markdown-and-bulk-upload-plan.md) —
  the plan to accept `.md` files and Google Cloud's Open Knowledge Format
  bundles across global, company and agent knowledge, and to upload many files
  or a whole folder in one gesture. Owns the two duplicated upload allow-lists
  in `src/lib/constants/uploads.ts` and `convex/utils/uploadPolicy.ts`, the
  upload half of `KnowledgeManager.tsx`, and the new pending-file ingestion
  queue beside `processWebsiteQueue`. Records the latent
  `getNextPendingUrlInternal` defect that bulk file ingestion activates, and
  the decision to leave the whitespace-collapsing chunker alone for now. Read
  it before widening any upload allow-list or scheduling `ingestDocument`.
- [Self-Improvement Plan](./active/self-improvement-plan.md) — the plan to
  close the four learning loops that already collect signal and throw it away:
  automatic reflection on failed runs, outcome-weighted memory ranking,
  end-user feedback in chat, and retrieval priors from rated answers. Owns the
  `SELF_IMPROVEMENT_CONFIG` kill switches and the `messageFeedback` and
  `knowledgeChunkStats` tables. Phase 5 was decided 2026-08-10: memory
  learning is **fully autonomous** (`autonomousMemory`, default on) — new
  memories save immediately, labelled and audited, with no per-memory
  approval; the recorded decision in the plan says why and what still
  guards it. Read it before
  touching memory ranking in `convex/agentMemories.ts` or
  `convex/companyMemories.ts`, `convex/agentRunReflections.ts`,
  `convex/agentMemoryCandidates.ts`, `convex/companyMemorySuggestions.ts`, or
  the fusion in `convex/knowledgeRetrievalService.ts`.
- [Retention And Purge Plan](./active/retention-and-purge-plan.md) — the
  plan to make the Log Retention & Purges engine actually work now that the
  platform has real history to delete: a stuck-run reaper, a rebuilt chat
  purge that stops orphaning feedback and leaking storage blobs, dispatcher
  hardening, five cheap new pipelines (public API requests, auth events,
  rate-limit counters, analytics snapshots, webhook deliveries), the big
  agent-run-history pipeline with its cascade rules, and a staged live
  proof on dev data ending in an enablement runbook. Owns `convex/purges.ts`,
  `convex/purgeScheduleService.ts`, the retention screen, and the decision
  record on what retention must never delete (approvals, learning tables,
  cost history). Read it before adding any table that grows with time, or
  before deleting anything in bulk.
- [Theme Compliance Plan](./active/theme-compliance-plan.md) — the plan to
  make the Global Aesthetics screen truthful: fix the live font-cycle and
  save-corruption bugs, add the warning/info/sidebar/muted tokens the app
  actually needs, replace ~2,000 hardcoded colour sites with a StatusPill
  atom and four semantic tones, put usage descriptions on every row, and pin
  the drift with a ratchet test. Owns `src/context/SystemSettingsContext.tsx`,
  the `@theme` block in `src/app/globals.css`, the Aesthetics screen, and
  `useSystemSettingsForm`. Scope is the dashboard app only — the public
  site, login, and emails keep their own fixed designs by owner decision.
  Read it before adding a colour, a status pill, or a settings row anywhere.
- [Assistant Streaming All Providers Plan](./active/assistant-streaming-all-providers-plan.md) —
  the plan to make plain assistant replies stream word by word on OpenRouter,
  OpenAI, and Anthropic, matching what Google Vertex and the agent loop already
  do. Owns the `onText` behaviour of the three assistant-path provider
  adapters (`convex/openaiProviderService.ts`,
  `convex/anthropicProviderService.ts`, `convex/openrouterProviderService.ts`)
  and the retirement of the private SSE parser in
  `convex/anthropicStreamService.ts`. Provider resolution stays with the
  OpenRouter And Model Scale Plan. Read it before touching how any assistant
  reply reaches the message row.
- [Tasks And Notifications Plan](./active/tasks-and-notifications-plan.md) —
  the plan for the two primitives the platform has never had: a task, meaning
  work held for a named person, and an in-app notification, meaning the
  platform reaching that person somewhere other than their inbox. Owns the
  `tasks` and `notifications` tables, `/app/tasks`, the header bell, the
  `task.create` agent tool and the `taskNode` workflow node, and it closes
  `OUTSTANDING-TASKS.md` item 6. Read it before adding anything that assigns
  work to a person or tells them something happened. A task is not an
  approval — approvals stay with the Agent Autonomy And Approvals Plan.
- [Closing The Loop Plan](./active/closing-the-loop-plan.md) — the plan for
  four features that each turn something the platform already records into
  something a person can use: typing the correction a thumbs-down cannot
  carry, saving a good answer into company knowledge, and showing the evidence
  a reply already stores. A fourth — asking a question on a schedule — was
  built, proven, and then withdrawn; the plan says why. Owns the correction
  field on `messageFeedback.comment` and the evidence panel. It feeds the
  Self-Improvement Plan's candidate queue without changing its rules, and
  raises the tasks and notifications the Tasks And Notifications Plan owns.
- [Sonae Can Be Spoken To, Phoned, Emailed, And Shown A Photo](./active/showcase-channels-plan.md) —
  the showcase roadmap giving the one brain more doors: voice-to-voice with a
  talking character, spoken answers in the caller's own language, an inbound
  telephone agent with the hang-up-and-watch finale, acting on photos, a
  dedicated Gmail inbox the agent reads and replies from, and the
  receptionist kiosk screen. Owns the build order and the recorded decisions
  that Sonae answers calls but never makes them, that the email phase builds
  the platform's first working connector (Gmail, one dedicated mailbox,
  consent-screen key, no passwords ever), and that the rest of the connector
  catalogue stays out of scope. Each phase has its own detailed plan, listed
  next.
- [Sonae Speaks — The Voice Session And The Talking Character](./active/voice-session-plan.md) —
  phase 1: the voice session in Ask Sonae — speech in, spoken replies out,
  the moving sound-shape on screen. Owns the `speech` use case, the
  `synthesizeSpeech` action, the session surface and turn loop,
  sentence-buffered speaking, and the `SpeakingCharacter` interface.
  Records the decision that the character is a sound-shape (VRM avatars
  rejected as childlike) and that barge-in and open-mic are out of scope.
- [Ask In Any Language, Sonae Answers In Kind](./active/voice-languages-plan.md) —
  phase 2: the reply follows the language of the caller's latest turn.
  Owns language detection in `transcribeAudio`'s return shape, the
  reply-language rule for voice turns, and the language→voice map.
- [Sonae Answers The Phone](./active/telephone-agent-plan.md) — phase 3:
  the inbound number, the turn-based call loop over provider webhooks,
  and the hang-up-and-watch finale. Owns the `phoneCalls` table and its
  purge pipeline, the `/api/telephony/voice` route, the call log and call
  detail screens, and the per-company "inbound goes to" assignee setting
  it shares with the photo plan. Records the decisions that calls are
  turn-based (no audio streaming), the call loop is read-only while live,
  and unknown callers become tasks, not CRM rows.
- [Show Sonae A Photo And It Acts](./active/photo-actions-plan.md) —
  phase 4: photos into chat and widget, vision-aware model routing, and
  the human-confirmed action chip that files a task from what the photo
  says. Owns the `chatImage` upload policy, attachment rendering, the
  vision gate in model resolution, the widget attach flow over the
  dormant upload endpoints, and the fix for the agent path silently
  dropping images. Records the decision that photos are inline evidence,
  never ingested knowledge.
- [The Gmail Inbox That Answers Itself](./active/gmail-inbox-plan.md) —
  phase 5: the platform's first working connector. Owns the generic OAuth
  consent plumbing (authorize/callback routes, encrypted
  `connectorOAuthTokens`, refresh, real revocation), the `google-gmail`
  connector definition and its read/reply tools with hard reply rails,
  the mailbox watcher, the answer-versus-task rules, and the
  `mailboxMessages` table with its purge pipeline. Records the decisions
  that replies go out through Gmail itself (threading, human-visible
  Sent) and that the connected mailbox is a dedicated account, never a
  person's.
- [The Receptionist Screen](./active/receptionist-kiosk-plan.md) —
  phase 6: the walk-up kiosk. Owns the `/kiosk/[widgetId]` surface on the
  widget's anonymous machinery, the kiosk enable flag, tap-to-wake,
  inactivity reset and token rotation between visitors, and kiosk health
  on the admin widget screen. Records the decisions that the kiosk is a
  widget presented differently, and that wake words are out of scope.
- [Company Skills Apply Where They Are Bound](./active/company-skills-surfaces-plan.md) —
  the plan to wire up the per-surface skill switches that the schema, readiness
  gates, and eval categories already assume exist: the runtime filters company
  skills through enabled COMPANY_CHAT/WIDGET bindings, import creates them on
  by default, the admin skills list gets the two toggles, and a migration
  backfills existing skills so deploy day changes nothing. Records the
  decisions that skills stay always-on within their surface (no per-question
  matching) and that agent threads keep bypassing company skills. Read it
  before touching `getRuntimeCompanySkillsInternal`, `companySkillBindings`,
  or the company skills screen.
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
Rightmove Agent Execution Plan. If work touches an agent filling in customer
details from the internet, use the Workspace Customer Research Agent Plan. If
work touches new parent-company discovery outside imported groups, use the
Market Discovery Agent Plan. If it touches the customer screens themselves, the
Workspace Customer CRM Plan wins.
If work touches revenue opportunities — prospect valuation, group gap analysis,
or the opportunity report screen — use the Comax Opportunity Report Plan.
If work touches the AI register, risk classification, compliance evidence, the
Governance section, roles, sign-in methods, or personal data rights, use the
Governance And Trust Plan. It owns approvals and audit-trail *placement*; the
Agent Autonomy And Approvals Plan still owns approvals *behaviour*.
If work touches what the audit trail records, how an entry is worded, or the
audit trail screens themselves, use the Audit Trail Plan. It takes the audit
trail's *content* from the Governance And Trust Plan, which keeps its placement
in the Governance section.
If work touches how the AI learns over time — memory ranking, run reflections,
feedback collection, memory suggestion queues, or retrieval priors — use the
Self-Improvement Plan, which takes its eval fixtures from the AI Checks Plan
and its approvals philosophy from the Agent Autonomy And Approvals Plan.
If work touches what happens to a reply after it is given — correcting it,
saving it, showing why it said what it said, or re-asking it on a schedule —
use the Closing The Loop Plan.
If work touches assigning work to a person, or telling someone in the app that
something happened, use the Tasks And Notifications Plan. It takes approval
behaviour from the Agent Autonomy And Approvals Plan and email from the Email
Design System Plan; it owns neither.
If work touches a new way of reaching Sonae, the umbrella Sonae Can Be
Spoken To, Phoned, Emailed, And Shown A Photo plan owns the build order and
the channel decisions, and the six phase plans own their features: voice
sessions, speech synthesis, and the sound-shape belong to the Voice Session
plan; reply language and voice-per-language to the Voice Languages plan;
the phone number, call loop, and call records to the Telephone Agent plan;
images in chat or widget and acting on them to the Photo Actions plan;
OAuth consent plumbing, token storage, and the connected mailbox to the
Gmail Inbox plan; the walk-up surface to the Receptionist Kiosk plan.
Tasks raised from any channel stay with the Tasks And Notifications Plan,
outbound platform email styling stays with the Email Design System Plan,
and approvals behaviour stays with the Agent Autonomy And Approvals Plan.
If work touches which skills reach a company's chat or widget — the runtime
skill query, skill bindings, or the company skills screen — use the Company
Skills Apply Where They Are Bound plan. The Skill Center and skill authoring
stay with the Admin UI/UX Plan; eval content stays with the AI Checks Plan.
If work touches how an assistant reply streams into the message row — an
adapter's `onText` behaviour, the streaming mutations, or the flush policy —
use the Assistant Streaming All Providers Plan, which takes provider
resolution from the OpenRouter And Model Scale Plan.
If work touches theme tokens, the Aesthetics screen, status colours, or adds
any hardcoded colour to the dashboard app, use the Theme Compliance Plan.
If work touches the public pre-login site, use the Public Website Plan. If work touches documentation coverage, use the
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
