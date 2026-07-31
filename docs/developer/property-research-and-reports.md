# Property Research And Board Reports

This document covers Sonae's implemented property research and board-reporting surfaces. It is written for engineers and agents who need to maintain the Rightmove extraction flow, company-scoped property inventory, extraction status screens, and the AI-generated sales report dashboard. The related user-facing documentation is `docs/end-user/property-research-and-reports.md`. Full report-specific behavior is documented in `docs/end-user/sales-and-board-reports.md` and `docs/developer/sales-and-board-reports.md`.

The implementation is split across customer routes under `src/app/(dashboard)/app/`, Convex queries and actions under `convex/`, shared navigation in `src/ui/components/layout/SidebarNavigation.tsx`, and tests that enforce tenant isolation, webhook persistence, and report access. The feature is not a generic CRM report builder. It has two concrete products today: a Rightmove property collection workflow and a latest-board-report viewer fed by a scheduled sales-report agent.

## Product Surface

The property workflow appears in the main authenticated application navigation under Properties. `src/ui/components/layout/SidebarNavigation.tsx` opens a Properties section for paths beginning with `/app/properties` and links to `/app/properties/search`, `/app/properties/scraped-data`, and `/app/properties/logs`. The Reports navigation section links to `/app/reports` as Sales Report. The app dashboard also routes users toward reports from `src/app/(dashboard)/app/page.tsx`; super admins are sent to AI cost administration from that card, while non-super-admin users are sent to the report screen.

`src/app/(dashboard)/app/properties/search/page.tsx` is the entry point for Rightmove collection. It renders a two-step form: a Rightmove search URL and a numeric max-property limit. Client-side validation requires an HTTPS `rightmove.co.uk` host and a `/property-for-sale/` path; security validation is performed again on the backend. The numeric control allows values from 10 through 1000 in the browser. Submission calls the Convex mutation `api.propertyAgents.startRightmoveCollection` with the entered URL and `maxProperties`. Success clears the URL and shows a translated success message. Failures are surfaced inline through `getErrorMessage`, not through native browser dialogs.

`src/app/(dashboard)/app/properties/scraped-data/page.tsx` lists stored property records. It uses `usePaginatedQuery(api.properties.listProperties, { searchTerm }, { initialNumItems: 15 })`, `api.properties.getPropertiesCount`, and local 15-row pagination. Search resets the local page to 1 and uses the Convex search index on address. Rows show thumbnail, address, property type, agent, price, bedrooms, bathrooms, a View Details button, and a Delete button. Deletion opens `SonaeModal` and calls `api.properties.deleteProperty` only after confirmation.

The detail screen is `src/app/(dashboard)/app/properties/scraped-data/[id]/page.tsx`. It reads `api.properties.getProperty` and renders loading, not-found/no-access, and detail states. The detail layout shows the primary image, address, price, badges such as product label and price reduction, market intelligence, specs, EPC, Google Maps link when coordinates exist, description, features, floorplans, gallery images, listing-agent contact information, original listing link, and optional agent profile link. `src/app/(dashboard)/app/properties/scraped-data/[id]/PropertyDescription.tsx` formats the extracted description text, repairs common missing-space punctuation from scraped copy, groups room-like lines into a list, and shows a collapsed 280px preview with an expand control. The page trusts the Convex query for authorization; a property outside the user's company throws in Convex and should not reveal cross-tenant data.

`src/app/(dashboard)/app/properties/logs/page.tsx` displays recent Apify extraction runs. It reads `api.properties.getLatestRuns`, renders the last five visible runs, maps statuses to In Progress, Completed, and Failed, shows dispatch and finish times, and shows `propertiesScraped` when known. Pending runs are automatically synchronized every 30 seconds by calling `api.apify.syncRunStatus`; the user can also press Sync Status on a pending run. The public sync action first verifies that the signed-in user can access the local run record. Super admins may sync any visible run, while non-super-admin users must have an active company matching the run's `companyId`. After access is verified, the sync action updates the run and, when successful, stores dataset items as property records.

The report viewer is `src/app/(dashboard)/app/reports/page.tsx`. It calls `api.salesReports.getLatestReport` and has three states: loading spinner while the query is undefined, an empty state when no report exists, and the report dashboard when a report exists. The empty state tells the user to upload a pipeline CSV and schedule the Sales Report Agent. The dashboard renders an executive headline, markdown executive summary fallback, KPI cards, closing-window area chart, top deals, pipeline by stage, pipeline by rep, risk radar, synthetic risk-vector radar, team spotlight, patterns, and weekly priorities. The Export to Board action uses `html2canvas` against a local ref and downloads a PNG named `sonae-board-report-YYYY-MM-DD.png`. There is no server-side PDF generation in this screen.

## Convex Data Model

`convex/schema.ts` defines three core tables for this area.

`apifyRuns` stores extraction jobs. Its fields are `runId`, `actorId`, `status`, `startedBy`, optional `companyId`, `startedAt`, optional `completedAt`, and optional `propertiesScraped`. Status is normalized to `PENDING`, `COMPLETED`, or `FAILED`. It has indexes `by_runId` and `by_company` on `companyId, startedAt`.

`properties` stores the normalized Rightmove listing snapshot. Important fields include optional `runId`, `rightmoveId`, `address`, `price`, optional `currency`, bedroom and bathroom counts, `propertyType`, original `url`, image fields, description, features, floorplans, EPC rating, coordinates, agent fields, listing dates and update reason, product label, size bounds, optional `companyId`, and `scrapedAt`. It has indexes `by_rightmoveId`, `by_company` on `companyId, scrapedAt`, `by_runId`, and the `search_address` search index with address as the search field and companyId as a filter field.

`salesReports` stores generated board reports. It supports the current structured report shape and legacy markdown fallback fields. Current fields include optional `companyId`, optional `agentId`, `headline`, optional `executiveSummary`, legacy optional `markdownReport`, structured `kpis`, optional `closingWindows`, optional `topDeals`, optional `chartData`, legacy optional `riskTables`, optional `pipelineHealth`, optional `riskRadar`, optional `teamSpotlight`, optional `patterns`, optional `priorities`, and `createdAt`. The table has `by_company` on `companyId, createdAt` and `by_agent` on `agentId, createdAt`.

## Backend Flow

`convex/propertyAgents.ts` owns the customer-facing Rightmove collection start. `startRightmoveCollection` is a tenant mutation, so callers must have an active company workspace. It normalizes the Rightmove URL, enforces HTTPS `rightmove.co.uk` property-for-sale search URLs, clamps the property limit to 10 through 1000, resolves the active `Rightmove Agent` for the current company or the global fallback, creates an `agentRuns` row, snapshots the agent version, and schedules `internal.agentRuntime.runTriggeredAgentObjective` immediately. The generated objective tells the agent to collect the supplied Rightmove search, gather up to the requested limit, start collection, report that it has started, and stop rather than waiting for every listing.

`convex/apify.ts` owns the external extraction actions used once a tool-backed path starts Apify. `startRightmoveScrape` still exists as a tenant action for direct Rightmove actor execution, but the implemented Properties Search screen now goes through `propertyAgents.startRightmoveCollection`. The Apify helper path validates submitted URLs with `validateSafeUrl(url, "Rightmove Scraper")`, requires `APIFY_API_TOKEN`, `CONVEX_SITE_URL`, and `APIFY_WEBHOOK_SECRET`, starts Apify actor `jKpgGfgRfzrGgEMa8` with full property details, price history, Apify proxy, the requested list URL, and the requested property limit, and registers a webhook to `${CONVEX_SITE_URL}/apify-webhook` with the shared secret header and a small JSON payload containing run, status, actor, and dataset identifiers.

After the actor starts, the Apify helper records the run through `internal.webhooks.recordRunStart`. The run is associated with the user and company supplied by the caller or tool path. It then schedules `internal.apify.pollRunStatus` after 60 seconds. The poller reads Apify status. Terminal statuses trigger `internal.apify.syncRunStatusInternal`; non-terminal statuses reschedule another poll after 60 seconds. This watchdog prevents the UI from relying solely on inbound webhooks without exposing scheduled polling to public action authorization.

`syncRunStatus` is the public action used by the logs screen. It calls `requireApifyRunAccess`, which reads the local run by Apify run id through `internal.webhooks.getRunByRunIdInternal` before contacting Apify. Missing runs return `Run not found`; non-super-admin users without the same active company as the run receive `Unauthorized`. The internal poller uses `syncRunStatusInternal` after it already knows the run id from the scheduled watchdog path. Both sync paths require `APIFY_API_TOKEN`, load the Apify run, update the local run to pending for non-success states, and fetch the dataset only when Apify reports `SUCCEEDED`. Successful datasets are passed to `internal.webhooks.storeRightmoveData`.

`debugDatasetItem` is intentionally narrower than ordinary sync. It uses the same run-access check and then requires the caller to be a super admin before reading Apify dataset detail. Keep this restriction if expanding debugging output, because raw extraction rows can include cross-tenant or source-system details that normal company admins should not inspect globally.

`convex/http.ts` mounts `/apify-webhook` to `internal.webhooks.processApifyWebhook`. `convex/webhooks.ts` validates the `X-Apify-Secret` header with constant-time comparison against `APIFY_WEBHOOK_SECRET`. Missing or wrong secrets return 401. Invalid JSON returns 400, and payloads without `runId` or `status` return 400. Successful webhook payloads either call `internal.apify.fetchDatasetAndStore` for succeeded runs with a dataset id, or update run status directly for other statuses.

`storeRightmoveData` is the normalization point. It looks up the `apifyRuns` row by `runId` and throws `Run not found` when the run is unknown. Each item is parsed from JSON, mapped into a property row, and scoped to `run.companyId`. The dedupe key is `rightmoveId` plus the same company id: it queries by `rightmoveId` and filters on `companyId`. Existing rows are patched with fresh fields; new rows are inserted. The run is then patched to `COMPLETED`, assigned `completedAt`, and receives `propertiesScraped` equal to the item count. Failed, aborted, and timed-out statuses are normalized by `updateRunStatus` to `FAILED`.

## Authorization And Tenancy

Property reads and deletes are guarded in `convex/properties.ts`. `getPropertyScope` derives `activeCompanyId` through `getActiveCompanyId(user)` and treats a `SUPER_ADMIN` with no active company as able to read all companies. Non-super-admin users, and super admins acting inside an active company, are scoped to one company. `listProperties`, `getPropertiesCount`, `getProperty`, `deleteProperty`, and `getLatestRuns` all enforce that boundary. A user with no active company receives an empty count or run list for tolerant reads, and `Unauthorized` for list access or cross-company property detail/delete attempts. The Search page start path now uses `requireTenant`, so it queues a Rightmove Agent run only for the active workspace. `getAllRunsAdmin` requires `requireSuperAdmin`.

Report access is guarded separately in `convex/salesReports.ts`. `getLatestReport` requires `requireAdmin`, so standard users without admin privileges are not expected to view executive reports. Company admins only read the latest report for their active company. Super admins read the globally latest report by creation order, regardless of company. This means a super admin without an active company can see whichever tenant report is newest; treat that as intentional current behavior unless product requirements change.

`convex/bola.test.ts`, `convex/properties.test.ts`, `convex/apify.test.ts`, and `convex/salesReports.test.ts` are the most important regression tests for tenant isolation. They verify cross-company properties cannot be read or deleted by the wrong admin, search and counts are company-scoped, run logs are company-scoped, manual Apify sync is company-scoped, admin-only run queries are protected, unsafe scrape URLs are rejected, and company admins only read their own latest report.

## Report Generation

This section is a summary. For the complete report-generation guide, use
`docs/developer/sales-and-board-reports.md`.

`convex/salesReportActions.ts` owns generation. The internal action `generateReport` receives an agent id and optional company id. It loads the agent, uses its `systemPrompt`, fetches the newest knowledge document attached to that agent, extracts CSV text from `textContent` or from Convex storage, and skips generation when no document exists. Empty extracted CSV text is an error.

The action resolves model configuration through `internal.aiModels.resolveModelConfigForExecution` with use case `report`. If the agent inherits model choice, no requested model id is passed; otherwise it uses the agent's model id. The current report generation path is Google Vertex specific: `getGoogleVertexProviderModelId`, `createVertexGenAIClient`, and `generateVertexContentWithRetry` are used to produce structured JSON through `@google/genai` response schema support. Active AI rules are fetched with `internal.aiRules.getActiveRulesInternal` and appended to the prompt as strict operating rules.

Generation logs a `BATCH_GENERATION_START` agent log before the provider call, a `BATCH_GENERATION_SUCCESS` log after a successful response, and an `ERROR` log on failure. It records usage and cost in `agentTransactions` using rates from `aiModels`. Successful JSON is saved through `internal.salesReports.saveGeneratedReport`. Because this is an internal action, scheduled workflows or agent orchestration are responsible for invoking it; the report viewer only reads already-generated data.

## Edge Cases And Caveats

The properties table stores snapshots from Rightmove via Apify; there is no retention policy, bulk delete, or CSV export implemented for property data. Deleting a property removes only the selected stored row, not the Apify run and not the external Rightmove listing. Duplicate handling is scoped by `rightmoveId` and company, so the same Rightmove listing can exist once per tenant.

`getPropertiesCount` uses `.take(10000)` for counts. `src/quality-drift.test.ts` flags this and `listProperties` as future scaling concerns if the inventory grows. Do not document the count as an unbounded accurate total beyond that practical limit. The UI uses a 15-row local page size and requests more Convex pages as the user advances.

The property list has a View Details route for `/app/properties/scraped-data/${property._id}`, and the detail page exists. If `getProperty` throws for unauthorized access, the page's explicit `null` empty state may not be the only failure mode; Convex errors can surface through the framework. Keep that distinction in mind when changing error handling.

The report export is a PNG capture, not a generated board deck. `ChartExportWrapper` gives chart export affordances around some chart panels, while the page-level Export to Board captures the whole report container. Legacy reports without structured sections are displayed with a reduced KPI fallback.

## Configuration

Rightmove extraction requires `APIFY_API_TOKEN`, `CONVEX_SITE_URL`, and `APIFY_WEBHOOK_SECRET`. The webhook secret must match the `X-Apify-Secret` header supplied by Apify. Sales report generation requires the AI model configuration and provider environment needed by the Vertex provider path, described in the AI model and provider documentation. The report generator also depends on agent knowledge documents containing pipeline CSV content.

## Verification

For focused local verification after changing this area, run the relevant tests:

```bash
npm run test:run -- convex/properties.test.ts convex/apify.test.ts convex/webhooks.test.ts convex/salesReports.test.ts convex/bola.test.ts
```

For a broader pre-merge gate, follow `AGENTS.md` and run:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

When changing only documentation, this automation only runs documentation validation and `git diff --check`. If implementation changes are made later, include the Convex tests above because tenancy and external-ingestion behavior are the main risk areas.
