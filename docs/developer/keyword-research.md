---
product: Hakken
documentation_type: developer guide
feature_area: keyword research
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/keyword-research.md
last_reviewed: '2026-10-26T09:05:30+00:00'
reviewed_against: current implementation
status: Current
---
# Keyword Research

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Keyword research
> **Reviewed:** 26 October 2026, 09:05:30 GMT (Europe/London)
> **Source path:** `docs/developer/keyword-research.md` · **Status:** Current

## Entry points and company boundaries

Keyword Research is routed under
`src/app/(dashboard)/app/keyword-research/` with lookup overview, results,
ideas, answers, country and research-list surfaces. The main backend is
`convex/keywordResearch.ts`, supported by `keywordResearchRun.ts`,
`keywordResearchCalls.ts`, `keywordResearchData.ts`,
`keywordResearchIdeas.ts`, `keywordResearchAnswers.ts`,
`keywordResearchQuestion.ts`, shapes, prices and schema modules.

The company-owned entities are lookups, jobs and lists; purchased observations
are shared by normalized keyword and location. `requireLooker` refuses
oversight roles and calls `requireTenant`. `requireLookup` and `requireList`
compare stored company ownership with the caller's company. Associated
websites are resolved through `ownWebsites` and `requireOwnWebsite`, never
accepted as an unchecked global website identifier.

Reads use tenant queries; admitted buying/list changes use tenant mutations
with these additional permission checks. Some opening mutations deliberately
return without purchasing for oversight roles. Reuse the actual permission
pattern rather than assuming every authenticated viewer can trigger a paid
part. The [user guide](../end-user/keyword-research.md) explicitly explains
which opens can purchase data.

## Normalize and decide whether to buy

`lookUp` validates the country against `RESEARCH_COUNTRY_CODES` and an optional
owned hold before creating work. It reads effective fan-out limits, normalizes
keywords with `websiteCanonical.readSearchPhrase`, ignores blanks and
deduplicates equivalent terms. A non-empty normalized list must fit
`researchKeywordsPerLookup`. These limits are not hardcoded user promises.

For each keyword/country, the mutation tests `overviewIsFresh` and
`serpIsFresh`. It reuses a company lookup indexed by
`by_company_keyword_place`, updates its opened context and avoids starting a
second overview purchase while `partIsBuying` still considers its work alive.
A fresh shared observation can set the lookup READY without another run.
An explicit `lookUpAgain` bypasses the freshness intention and requests a new
purchase.

`keywordResearchData.freshnessOf` combines the configured reuse days with
platform sandbox state. A sandbox observation must not satisfy a real-data
request. Location matching also matters: results requested for a city cannot
be replaced by a loosely matching whole-country result. Preserve both
location and source provenance when extending cache keys or making reuse
more aggressive.

## Agent jobs, configuration and continuation

`startResearchRun` requires an installed active KEYWORD_RESEARCH role agent.
It writes a company/user-associated `agentRuns` row and one `researchJobs`
row per requested part. It then applies the credit-start hook and schedules
the research worker. Missing or disabled agents produce explicit application
errors rather than silently creating work nobody will consume.

`keywordResearchRun.ts` executes only its requested jobs. Supported parts
include overview, result enrichment, ideas, answers and another-country
overview. A longer lookup carries on in a fresh action segment, preserving
the same run and missing work. Its own run spend limit can stop further
buying and leave a recorded explanation. Do not describe it as the general
continuous DataForSEO Collector: it is a separate interactive job path with
its own limits and continuation.

The worker always buys real figures unless `platformSandbox` reads the
platform supplier-sandbox setting. An old saved agent Test mode does not
make this worker use sample data. `keywordResearchQuestion.writeQuestion`
resolves its configured agent model through
`aiModels.resolveModelConfigForExecution`, records model cost and returns a
bounded question. A keyword's AI question must not be conflated with the
original exact Google query or a scientifically sampled prompt panel.

Supplier credentials come from the shared `dataForSeoRest` boundary,
including `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` and the explicit platform
`DATAFORSEO_SANDBOX` switch. Values stay backend-only. Runtime model selection
comes from stored configuration and the agent/template settings, not a new
hardcoded model string in the route.

## Provider calls and ready-state evidence

`keywordResearchCalls.RESEARCH_CALLS` names this feature's live operations.
The overview combines keyword overview/history, a Google top-hundred SERP
observation and leading-page traffic. Result enrichment adds leading-page
strength, linking domains and associated keyword data. Ideas requests terms
and questions; answers obtains supported assistant answers and AI Overview
search information. These calls are deliberately distinct from ordinary
collection-registry planning.

Pure parsers preserve missing numeric/text fields as null rather than
inventing substitutes. `SERP_DEPTH` is 100 and `MONTHS_KEPT` is 24 for stored
keyword history. The latter is the source history inside a purchased record,
not a general automatic-deletion duration for company research lists.
`OVERVIEW_KEYWORDS_PER_CALL` bounds batch shape; changing it needs the
provider contract and run-size consequences reviewed.

`recordResearchCall` writes supplier-operation evidence and costs to the run
and shared spend records. Filing mutations such as `fileOverviews`,
`fileSerp`, `fileDetails` and `fileIdeas` preserve the association with the
requested purchase. Ready state must reflect what was successfully obtained
for that job; an older overview must not stand in for a newly failed fresh
purchase. Separate parts can succeed or fail independently.

`keywordResearchPrices.researchCosts` calculates screen estimates in whole
US cents using configured quantities and implementation pricing constants.
Those are dated estimates, not a newly verified current supplier price list.
Do not repeat literal per-lookup prices in guide prose or claim the estimate
is a final charge. Actual costs, reused value and user-facing credits have
separate accounting roles.

## Additional parts and credit hooks

`openResults` first validates lookup ownership and overview readiness. It
avoids buying while the same part is active and reuses matching fresh detail
where present; otherwise it starts a RESULTS job. `openIdeas` can start an
IDEAS job and needed result-detail work without incorrectly treating another
part's active worker as ownership of its own job. `openAnswers` accepts an
explicit `again` and checks answer freshness when that is absent.

This means a page open can be a mutation that buys additional data. Preserve
that distinction in UI and operator tooling; a read-only-looking route is
not authority to run an automated browser through every detail. The weekly
documentation pass executes none of those opens or worker actions.

`creditHooks.creditResearchRun` creates the keyword-associated credit record
when a run starts. `creditResearchSettled` records settlement; the source and
tests distinguish a lookup that brought nothing back from successfully
provided results. Do not infer a universal refund policy for partial work
without reading the full credit ledger and pricing rules. The broader
credits feature is covered separately in [Credit ledger and usage](./credit-ledger-and-usage.md).

## Tables, lists and tracking

`keywordResearchSchema.ts` composes four shared purchase tables:
`researchKeywords`, `researchSerps`, `researchIdeas` and `researchAnswers`.
Their indexes include keyword/location/purchase time, with an extra kind for
ideas. Private `keywordLookups` uses `by_company_opened` and
`by_company_keyword_place`. `researchJobs` uses `by_run` and
`by_lookup_part`, while `researchLists` uses `by_company_updated` and
`researchListKeywords` uses `by_list_added` and `by_list_keyword`.

Shared purchase lookup is safe only after the caller's private lookup/list
access is established. A new report must not return all companies that
looked up the same phrase. The schema's sample/provenance fields also matter
when choosing the newest valid shared record; newest alone is insufficient
if it is a sandbox sample for a real request.

`addToResearchList` validates an existing list or a new name/owned website,
then normalizes and deduplicates membership within its bounded capacity.
`removeFromResearchList`, `renameResearchList` and `deleteResearchList`
operate on that company's list. Deleting a shortlist does not delete shared
purchased observations or automatically untrack a website's existing term.

`trackFromResearchList` requires an associated owned hold, reads its private
tracked searches through `holdLists`, skips existing terms and adds through
`websiteCanonical.addWebsiteKeywordCore`, carrying the current list size so
the canonical tracking limit applies. It does not create retrospective
position history. A list in another country can be useful research while
its site's measured-position fields remain intentionally unavailable.

## Tests and remaining boundaries

Relevant tests include `keywordResearch.test.ts`,
`keywordResearchCalls.test.ts` and `keywordResearchPrices.test.ts`.
The main suite names important cases for reused data, real-versus-sandbox
observations, missing/disabled agents, continuation, failed fresh purchases,
country validation and company-owned lists. Inspect provider-call counts and
purchase provenance in future regression tests, not only a READY flag.

This review read selected implementation paths and test declarations without
executing research jobs, charging credits, fetching results, making model
calls or running application tests. No universal research-list expiry or
complete permanent-data deletion policy was established here. Reuse the
retention/credit services for those questions rather than deriving a policy
from a schema field or cache freshness interval. Live supplier coverage and
deployed-account readiness require their own authorized evidence.
