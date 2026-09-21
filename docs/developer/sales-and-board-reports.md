# Sales And Board Reports

This document covers Hakken's implemented sales report and board-reporting
surface. It is for engineers and agents maintaining the report information page,
latest-report dashboard, Convex report storage, and internal report-generation
action. The related user-facing documentation is
`docs/end-user/sales-and-board-reports.md`.

This feature is not a generic report builder. It currently has two concrete
product loops:

- a Sales Report Agent reads its latest pipeline knowledge document, uses
  configured AI context, saves a structured report record, and the app shows the
  latest accessible report as a board-ready dashboard;
- a workspace opportunity-report agent and deterministic backend tools read the
  current sales-data import, prospects, customer sizes, and group category spend
  to price prospect opportunities and chain product gaps.

## Product Surface

`src/app/(dashboard)/app/reports/information/page.tsx` is the explanation page.
It describes the report's ingredients, report anatomy, trust model, glossary,
and FAQ. Its supporting visual components live in
`src/app/(dashboard)/app/reports/information/_components/ReportInfoVisuals.tsx`.
The call to action links to `/app/reports`.

`src/app/(dashboard)/app/reports/page.tsx` is the report viewer. It calls
`api.salesReports.getLatestReport` and renders:

- a loading spinner while the Convex query result is `undefined`;
- an empty state when the result is `null`;
- the structured dashboard when a report exists.

The dashboard includes an executive headline and summary, KPI cards, closing
window chart, top deals, pipeline by stage, pipeline by rep, risk radar, a
synthetic risk-vector radar, team spotlight, patterns, and priorities. It keeps
a legacy fallback for older report rows that do not have newer structured
sections such as `closingWindows`, `riskRadar`, or `teamSpotlight`.

The page-level `Export to Board` action uses `html2canvas` against the report
container and downloads `hakken-board-report-YYYY-MM-DD.png`. This is client-side
image export only. There is no server-side PDF, slide, or editable workbook
generation in this route.

`src/app/(dashboard)/app/[workspace]/opportunity-report/page.tsx` is the
workspace Opportunity Report. It is behind the workspace sales-data area rather
than the top-level Reports section. The page reads
`api.salesOpportunityReports.getOpportunityReport`, starts work through
`api.salesOpportunityReports.startOpportunityReport`, and renders phase/status
copy from the report row rather than trusting the agent's prose.

The opportunity-report screen has two ranked business sections:

- prospect opportunities, priced from comparable customer spend and the
  prospect's bedrooms or pupils when present;
- chain gaps, priced from products bought by sister accounts in the same group
  but not by the target customer.

Chain gap rows now render the named sister-account comparison as well as the
buyer count: `GapRow` formats `gap.comparedTo[].accountName` through
`formatAccountList` and uses the `salesData.opportunityReport.sistersBuyThisNamed`
message. Keep English and Italian locale keys in parity if this row copy changes.

## Data Model

`convex/schema.ts` defines the `salesReports` table. Current fields include:

- optional `companyId` and `agentId`;
- `headline`;
- optional `executiveSummary`;
- optional legacy `markdownReport`;
- structured `kpis`;
- optional `closingWindows`;
- optional `topDeals`;
- optional `chartData`;
- optional legacy `riskTables`;
- optional `pipelineHealth`;
- optional `riskRadar`;
- optional `teamSpotlight`;
- optional `patterns`;
- optional `priorities`;
- `createdAt`.

The table has `by_company` on `companyId, createdAt` and `by_agent` on
`agentId, createdAt`.

The viewer intentionally tolerates optional structured fields because older
rows can exist with the legacy report shape. Be careful when tightening schema
or rendering assumptions: a schema migration may be needed before removing
fallback UI.

`convex/schema.ts` also defines `salesOpportunityReports` for the workspace
opportunity report. A row is a snapshot against one company and import, with
phase/status fields, prospect opportunity rows, chain gap rows, headline totals,
exceptions, and the agent-written summary where available. Do not treat the
agent summary as the source of truth for numbers; the deterministic tool passes
own the figures saved on the row.

## Query And Storage Functions

`convex/salesReports.ts` owns report reads and writes.

`getLatestReport` is an admin query. Non-super-admin users must have an active
company and receive the latest report for that company using the `by_company`
index. A `SUPER_ADMIN` currently receives the globally latest report by creation
time. Treat that global super-admin behavior as current product behavior unless
the user approves a tenancy change.

`getAgentQuery` is an internal query used by generation to load the agent.

`getAgentKnowledgeDocumentsQuery` is an internal query used by generation to
load the newest knowledge document attached to the agent. It currently takes
one document ordered newest first. In normal operation, that document contains
the sales pipeline CSV.

`saveGeneratedReport` is an internal mutation used by the generation action to
insert the structured report row. It saves the generated report sections and
sets `createdAt` with `Date.now()`.

## Generation Flow

`convex/salesReportActions.ts` owns generation. `generateReport` is an internal
action with `agentId`, optional `companyId`, and optional `focus`.

The action:

1. Loads the agent through `internal.salesReports.getAgentQuery`.
2. Reads the newest agent knowledge document through
   `internal.salesReports.getAgentKnowledgeDocumentsQuery`.
3. Extracts CSV text from `textContent`, or from Convex file storage when only
   `fileId` is available.
4. Resolves the model configuration through
   `internal.aiModels.resolveModelConfigForExecution` with use case `report`.
5. Builds grounding context from agent memories, company memories, and vector
   search over knowledge chunks, while skipping the pipeline document's own
   chunks because the CSV is already included in full.
6. Reads active AI rules through `internal.aiRules.getActiveRulesInternal`.
7. Asks the resolved model to produce JSON matching the report schema.
8. Parses the JSON and saves it through `internal.salesReports.saveGeneratedReport`.

Missing knowledge documents cause the action to skip generation and return
`null`. Empty extracted CSV text is an error. Grounding failures are logged and
degrade to a report without that extra grounding rather than blocking the whole
run.

The action uses the shared model-resolution path instead of hardcoding a runtime
model literal. Keep that behavior when changing providers or report-specific
model defaults.

## Opportunity Report Generation Flow

`convex/salesOpportunityReports.ts` owns the workspace opportunity report. The
public mutation starts one report run per workspace and prevents duplicate active
runs. The agent is the conductor, but the calculations are backend-owned:

1. Price prospects from `salesDataProspects`, `salesDataCustomers`, and
   `salesDataAccounts`, using bedrooms or pupils from
   `extraFieldForType` where available.
2. Price group gaps from `salesDataRows` category spend across customers sharing
   the same `groupNameKey`.
3. Write the summary and mark the report complete, or let the watchdog finish a
   report with exceptions when the computed rows already exist but the agent did
   not produce prose.

The matching rules and pricing rules should stay deterministic and tested. A
model may narrate what matters, but it must not invent a prospect value, product
gap, comparable account, or six-month total.

The opportunity report relies on the customer research job for stronger pricing:
hotels and care homes need bedrooms; schools need pupils. If those values are
missing, the report falls back to weaker averages and records that weaker basis.
Changes to the research queue, prospect filing, or not-found handling should be
checked against [Workspace Customer Research Agent Plan](../plans/active/workspace-customer-research-agent-plan.md),
[Research Agent Autopilot Plan](../plans/active/research-agent-autopilot-plan.md),
and [Comax Opportunity Report Plan](../plans/active/comax-opportunity-report-plan.md).

## Report Contract

The generated JSON must include:

- `headline`;
- `executiveSummary`;
- `kpis`;
- `closingWindows`;
- `topDeals`;
- `chartData`;
- `pipelineHealth`;
- `riskRadar`;
- `teamSpotlight`;
- `patterns`;
- `priorities`.

The prompt instructs the model to produce an eight-section sales pipeline report
covering executive headline, pipeline at a glance, closing windows, pipeline
health, risk radar, team spotlight, patterns, and weekly priorities.

Every numeric sales figure should be derived from the CSV. Memory, rules, and
knowledge are supporting context for interpretation and recommendations. Do not
change this contract into free-form analysis without updating the viewer,
schema, tests, and user-facing docs.

## Authorization And Tenancy

The report viewer relies on `getLatestReport` for authorization. Do not move
tenant filtering into the client. Company admins must only receive their active
company's latest report. A company admin without an active company receives an
unauthorized error.

Super-admin behavior is intentionally broader today: without an active company,
the query returns the globally latest report. If product requirements change to
make super admins choose a company, update this guide, the user guide, and
focused tests in the same change.

`generateReport` is internal. The public or scheduled caller is responsible for
choosing the correct `agentId`, `companyId`, and run context. When wiring a new
manual trigger, schedule path, or workflow node, make that caller establish the
tenant boundary before invoking the internal action.

## Related Systems

Sales report generation depends on:

- agent configuration and system prompts;
- agent knowledge documents;
- knowledge chunk embeddings for supplemental retrieval;
- agent memories;
- company memories;
- AI rules;
- model defaults and provider configuration;
- scheduled or orchestrated agent execution.

The report viewer only reads saved output. It does not upload the CSV, bind
knowledge, edit rules, choose models, or run the agent.

## Edge Cases And Caveats

The newest agent knowledge document is treated as the pipeline input. If an
operator uploads a non-CSV document after the pipeline CSV, generation may read
the wrong source. Future improvements could add document typing or explicit
pipeline-source selection before generation.

Only the latest report is exposed in the current route. There is no report
archive, report comparison screen, delete control, or manual regenerate button
in the implemented UI.

The export is a browser capture. Layout, fonts, chart render timing, and
third-party canvas behavior can affect the PNG. If report export becomes a
formal compliance artifact, prefer a server-generated document pipeline and add
visual verification.

## Verification

For focused implementation changes in this area, run:

```bash
npm run test:run -- convex/salesReports.test.ts
```

If generation changes touch model routing, knowledge retrieval, memories, AI
rules, or schedules, include the focused tests for those touched systems as
well. For broader pre-merge verification, follow `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For documentation-only edits, this automation runs Markdown link validation and
`git diff --check`.
