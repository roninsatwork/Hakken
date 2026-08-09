# Sales Data Workspace Developer Guide

Sales Data is an optional workspace vertical for spreadsheet import, customer
records, research/prospecting jobs, market discovery, and opportunity reports.
It lives under workspace-scoped app routes and tenant-scoped Convex functions.

Read this before changing:

- `src/app/(dashboard)/app/[workspace]/**`
- `src/app/(dashboard)/app/sales-data/**`
- `convex/salesData*.ts`
- `convex/salesOpportunity*.ts`
- `convex/salesReport*.ts`

Related active plans include [Workspace Sales Data Plan](../plans/active/workspace-sales-data-plan.md),
[Workspace Customer CRM Plan](../plans/active/workspace-customer-crm-plan.md),
[Workspace Customer Research Agent Plan](../plans/active/workspace-customer-research-agent-plan.md),
[Market Discovery Agent Plan](../plans/active/market-discovery-agent-plan.md),
[Comax Opportunity Report Plan](../plans/active/comax-opportunity-report-plan.md),
and [Research Agent Autopilot Plan](../plans/active/research-agent-autopilot-plan.md).

## Routes

Current routes:

- `/app/[workspace]/spreadsheet-import`
- `/app/[workspace]/import-data`
- `/app/[workspace]/customers`
- `/app/[workspace]/customers/[account]`
- `/app/[workspace]/opportunity-report`
- `/app/sales-data`
- `/app/sales-data/import`

The `/app/sales-data` routes are legacy redirects. They resolve the signed-in
user's workspace and send old links to the workspace-specific import flow.

## Workbook Import

`convex/salesData.ts` owns the imported row tables, import records, upload URL,
overview query, list queries, filter options, row insertion internals, purge
internals, and import completion/failure state.

`convex/salesDataImportActions.ts` owns workbook inspection and the import
action. `convex/salesDataImportService.ts` parses the four expected worksheets:

- sales rows
- category links
- areas of interest
- frequency data

The UI deliberately asks the user to map worksheets rather than assuming names.
The sales worksheet often carries a period-specific name, so matching by exact
sheet name would import the wrong data silently.

Imports are tenant-scoped. Superseded rows are purged after a new current import
completes.

## Imported Tables

`/app/[workspace]/import-data` shows the current import in four tabs. Queries are
server-filtered and cursor-paginated. The sales tab preserves source row order
and includes the source row number so a screen row can be matched back to the
workbook.

Do not move filtering into the browser; the page intentionally queries only the
visible dataset.

## Customers And Details

`convex/salesDataCustomers.ts` owns customer list/count/filter queries, customer
detail reads, chain-member reads, typed-in detail saves, and sales-by-month
queries.

Imported fields and typed-in fields are separate by design. Re-importing a
workbook can replace imported sales facts without losing manually entered
contact details, notes, web details, bedrooms, or pupils.

`convex/salesDataCustomerFields.ts` owns the customer-type-specific extra field
selection. Keep the UI and server validation aligned when adding customer types.

## Research, Prospecting, And Market Discovery

`convex/salesDataResearch.ts` owns customer research findings, prospect records,
research start mutations, prospecting sweeps, group prospect reads, and review
decisions. `convex/salesDataResearchService.ts` owns research-field routing,
confidence checks, source URL normalization, count parsing, and idempotency keys.

`convex/salesDataResearchJobs.ts` and `convex/salesDataResearchJobService.ts`
own queue-backed research jobs, phases, item retries, progress descriptions,
budget limits, and agent-facing job context.

`convex/salesDataMarketDiscovery.ts` owns market-discovery jobs that find parent
companies and locations outside imported groups. `convex/salesDataProspectMatching.ts`
handles postcode and name matching so discovered sites can be classified against
known sites.

`convex/salesDataComaxProvisioning.ts` provisions Comax-specific research
workers/data needed by the sales workflow.

## Reset And Clear

`convex/salesDataReset.ts` owns workspace reset actions. It checks for running
sales work before destructive clears and deletes sales imports, row tables,
customer/prospect records, research data, market-discovery data, and opportunity
reports in batches.

There are two implemented reset scopes:

- `resetSalesData` clears the derived Sales Data state for the current
  workspace while preserving the imported workbook. It is used from the customer
  side of the workflow, where re-finding and re-mapping the spreadsheet would be
  the expensive part.
- `clearAllSalesData` clears the entire Sales Data module for the current
  workspace, imported workbook included. It is exposed from
  `/app/[workspace]/spreadsheet-import` through an inline arm-and-confirm button
  shown only when a current import exists.

`clearAllSalesData` first calls `getRunningSalesWorkInternal` and refuses while
research jobs, market-discovery jobs, or opportunity reports are still
`RUNNING`. The clear then re-enters `clearAllWorkspaceSalesDataBatchInternal`
until every company-scoped Sales Data table has been swept or the batch cap is
reached. Research job items are deleted through their parent research jobs
before job rows are removed, because job items do not carry a company-led index.

Treat reset actions as destructive tenant operations. UI copy and docs should
not describe them as cosmetic cleanup, and new Sales Data tables must be added
to the full-clear sweep and its coverage test when they are introduced.

## Opportunity Reports

`convex/salesOpportunityReports.ts` owns the latest opportunity report query,
report start mutation, report watchdog, deterministic matching pass, deterministic
gap pass, and summary save. `convex/salesOpportunityService.ts` owns the pricing
and report-shaping helpers used by those passes.

The opportunity report screen reads stored report rows. It may group, collapse,
or export them, but it should not compute independent browser-side totals.

The report uses `salesDataProspects`, `salesDataCustomers`, `salesDataAccounts`,
`salesDataRows`, `salesOpportunityReports`, `salesOpportunityReportGapProducts`,
and `salesOpportunityReportTypeBaskets`.

## Schema Tables

Sales Data tables:

- `salesDataImports`
- `salesDataRows`
- `salesDataCategoryLinks`
- `salesDataAreasOfInterest`
- `salesDataFrequencies`
- `salesDataAccounts`
- `salesDataCustomers`
- `salesDataCustomerResearch`
- `salesDataProspects`
- `salesDataMarketDiscoveryJobs`
- `salesDataMarketDiscoveryGroups`
- `salesDataResearchJobs`
- `salesDataResearchJobItems`
- `salesOpportunityReports`
- `salesOpportunityReportGapProducts`
- `salesOpportunityReportTypeBaskets`

All of these are company-scoped. Queries and mutations must preserve tenant
isolation and use indexes rather than broad filters where the table can grow.

## Tests And Verification

Focused tests include:

- `convex/salesData.search.test.ts`
- `convex/salesDataImportService.test.ts`
- `convex/salesDataCustomers.test.ts`
- `convex/salesDataResearch.test.ts`
- `convex/salesDataResearchJobs.test.ts`
- `convex/salesDataMarketDiscovery.test.ts`
- `convex/salesDataProspectMatching.test.ts`
- `convex/salesDataReset.test.ts`
- `convex/salesOpportunityReports.test.ts`
- `convex/salesOpportunityService.test.ts`

For documentation-only edits, run `git diff --check` and the documentation
coverage scans. For implementation changes, run the focused tests for the
touched modules and the repo gates from `AGENTS.md`.
