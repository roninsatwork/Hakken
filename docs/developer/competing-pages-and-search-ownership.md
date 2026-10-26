---
product: Hakken
documentation_type: Developer guide
feature_area: competing pages and search ownership
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/competing-pages-and-search-ownership.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Competing Pages And Search Ownership

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** competing pages and search ownership
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/competing-pages-and-search-ownership.md` · **Status:** Current


The competing-page workflow groups retained query/page evidence, assigns search owners, derives page recommendations and stores current groups beside relevant Insights findings. Primary modules are `insightCompeting.ts`, `insightCompetingJudge.ts`, `utils/insightCompeting.ts` and `utils/insightCompetingAgent.ts`. Whole-site page decisions in `insightDecisions.ts` are separately inventoried; this guide does not claim that broader system is complete.

## Customer Entry And Company Scope

Routes are `src/app/(dashboard)/app/insights/cannibalisation/page.tsx` and `cannibalisation/group/page.tsx`. They call tenant queries `insightsCannibalisation` and `insightsCompetingGroup`. `siteFor` resolves company-owned holdings, verifies a selected holding and otherwise prefers the first owned site with saved groups.

Readers take at most forty `insightCompetingGroups.by_hold_rank` rows. Detail selects a matching group key from that authorized set and only projects a linked finding when its holding matches. The key is the group owner's path, not a permanent immutable group ID across every possible recalculation.

The UI provides evidence tables, local search/order/paging and CSVs/charts. It does not invoke a public redirect, canonical edit, CMS merge or deletion. Keep recommendation verbs separate from executed effects when describing these pages.

## Retained Inputs And Group Construction

The shared competing calculation reads Search Console web/competing lastQuarter NOW and optional query/page lists. Query tokens share figures only when book builtAt agrees; `BookNames` decodes supplied query/page identities. It joins current classifications, history and saved page impressions, not an unrestricted live Google request.

`pageFiguresFrom` uses up to twelve recent whole months and the recent three versus corresponding year-earlier months when complete. It derives own Google enquiries separately from all retained page enquiries. Annual rates and the overlap's last-quarter figures therefore have different source windows.

`competingGroups` excludes home paths and known brand searches. A search is splitting when two or more pages each have at least ten percent of its impressions. Pair edges count shared splits, and connected components require three such searches. `partsOf` raises the edge threshold for groups above six pages and attaches qualifying singleton pages where a retained group has room; not every arbitrary oversized weak component is guaranteed a displayed page.

Qualifying groups need five split searches and 250 grouped impressions. Calculation retains twenty groups, up to two hundred search examples each. Stored/read limits are separately forty groups. These caps constrain evidence and should not be presented as a complete census of all indexing or intent overlap.

## Owner Rules And Page Actions

`ownerOfSearch` narrows observed contenders by informational/question intent, selling type, named place/office coverage, path-subject fit, clicks/impressions and Google enquiries, with deterministic path tie-breaking. It selects among pages observed for that search. Volume affects group prioritization and estimates rather than replacing the per-search intent rule.

`settleGroup` calculates each page's owned searches and demand, chooses the organizing owner using volume/impression/ownership/enquiry tie-breaks and derives the non-owner target from ownership overlap. Any page owning searches remains OWNER. An informational non-owner can LINK to a selling target; a page with at least one-third of its full impressions in the group can MERGE, otherwise DIFFERENTIATE.

These are advisory enum values. The source assumes redirects can carry useful signals and enquiries but never proves a particular external implementation will do so. A page having conversions does not automatically block the MERGE rule, and a display label is not permission to execute one.

Potential gain uses stored top-three click-rate evidence and monthly volume where known, otherwise an impression/month curve difference. It deduplicates selected close variants using a volume/variant key. Enquiry gain uses an owner rate at one hundred visits or the website fallback and weights available rates across relevant searches. Unknown evidence remains nullable, and the estimate is not revenue or controlled causal lift.

Group sure is LIKELY at twenty split searches and one thousand impressions, otherwise ROUGH. This is a fixed support threshold, not a probabilistic confidence interval. Some totals originate before search-example truncation, so displayed examples need not reproduce every aggregate exactly.

## Decision-Model Owner Picks

`insightCompetingJudge` uses decision key `seo.angle-page`. The PICK stage asks only in ACT mode, prepares offered candidate slots, joins business and stored page-search context and processes sixteen questions at once with a seven-minute work budget. `pickWebsite` schedules another PICK when work remains, up to six rounds, then hands on to DECIDE.

Provider/rules fallback results are not saved as fresh model picks. Held picks are keyed by holding/search with offered-candidate context, optional certainty and time. The later `ownerJudge` applies suitable retained picks; uncertain or missing choices retain the rule owner. It is not an unbounded retry loop and does not invent a destination outside the offered observation.

Decision configuration, catalogs and model execution have their own detailed queue area. This documentation review read source only and did not enable a mode, invoke a model or run any continuation.

## Group Specialist And Carry-Forward

`competingForRun` prepares current groups and prior saved groups, applies eligible owner picks and changes the signature mode when the decision model owns selection. `carryOver` retains AGENT choices only with the matching signature and a complete retained story where present. It restores valid prior owners and page recommendations, settles the group again and preserves the earlier decision week.

Changed groups are given to the cannibalisation specialist in groups of eight with a four-minute budget. An invalid/failed answer can be retried once when at least a minute remains; spend-limit failures do not receive that retry. Unreached groups keep rule evidence. Run logs distinguish assigned, carried, changed and failed work within bounded detail text.

`applyAnswer` validates search identity and that an owner was observed for it. With owner-model mode enabled the specialist explains an accepted model choice rather than selecting a different one. `applyPages` accepts known page/action values, protects pages with owned searches and restricts LINK to informational pages; a supplied target must be an available owning page before it replaces a target.

`usableWords` requires no unsupported typed numbers and no unresolved fact references in headline/story. `summaryOf` fills facts for the current group when attribution/content checks permit, otherwise returns null for rule wording. Passing these checks is shape/evidence grounding, not verification of an economic hypothesis.

## Persistence, Collection Side Effects And Findings

At most five LIKELY groups become proposed finding drafts in `competingForRun`. They follow the normal editorial/publishing path rather than every saved group automatically becoming a published finding. `keepCompeting` associates matching published IDs using their group facts and saves the full current group set.

`saveGroups` deletes up to forty prior rows and inserts at most forty replacements for the holding with week, rank, dates and optional finding ID. This is bounded latest-set replacement. It does not keep a full group history or guarantee cleanup of arbitrary corruption beyond its read bound.

After saving it queues missing search volume through `askVolumesFor` and missing difficulty for selected most-searched queries through `askDifficultyFor`, both in `searchVolumes.ts`. Those functions reuse appropriate stored facts/purchases, reject tracked holdings and can start collector work outside the normal collection schedule. Thus saving groups can cause supplier work even though reading the report is passive.

The group reader uses held figures and never directly purchases to fill an empty cell. `keepRules.ts` marks groups newest-week and picks latest. Recalculating an owner can change its key and invalidate an old detail link without proving the capability was removed.

## Verification And Boundaries

`insightCompeting.test.ts` covers bounded replacement, volume/difficulty reuse and cross-company refusal. `utils/insightCompeting.test.ts` covers grouping, place/type ownership, retained owners, estimates and merge/differentiate behavior. `utils/insightCompetingAgent.test.ts` covers specialist constraints and carry-forward; judge helper tests cover candidate picking. These declarations were read rather than executed.

No app, browser, Google call, paid supplier/model action, migration, website write or live acceptance test ran. See [Insights Findings](./insights-findings.md), [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Search Console](./search-console.md) and the [user guide](../end-user/competing-pages-and-search-ownership.md). PRODUCT.md intent and section 33 cutover are unchanged; local recommendations are not evidence of deployed changes or improved leads and sales.

## Large-site worker and publication guard

`insightCompeting.groupsForRun` is now an internal action delegating to `insightCompetingSteps.groupsForRun`. It loads saved Search Console parts, decodes whole name books, reads history in four-record pages, and resolves page classifications/titles plus search volume/difficulty in twenty-five-item batches. It rechecks list build identities before returning. The pure `competingFromSources` calculation is shared with bounded database readers. These changes avoid one large database query; retained group/example caps remain as described above. Guarded saves receive the run and chain booking through `assertInsightsPublisher`, preventing a stopped or superseded worker from replacing a newer chain's groups. This describes concurrent local implementation, not a deployed performance measurement.
