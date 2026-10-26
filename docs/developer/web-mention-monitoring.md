---
product: Hakken
documentation_type: Developer guide
feature_area: web mention monitoring and listing opportunities
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/web-mention-monitoring.md
last_reviewed: '2026-10-26T11:45:32+00:00'
reviewed_against: current implementation
status: Current
---
# Web Mention Monitoring

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** web mention monitoring and listing opportunities
> **Reviewed:** 26 October 2026, 11:45:32 GMT (Europe/London)
> **Source path:** `docs/developer/web-mention-monitoring.md` · **Status:** Current

Web mentions is a shared retained page list with tenant-scoped report context and a paired-rival backlink-gap dataset. `webMentions.ts` owns planning, parsing, relevance decisions and filing; `siteWebMentions.ts` owns the customer read projections. The UI routes under `src/app/(dashboard)/app/sites/[siteId]/mentions/` provide All mentions, Against rivals and Where to get listed. None sends outreach or writes a public listing.

## Planning And Provider Operations

`mentionSteps` skips tracked holdings and companies with `webMentions` off. It resolves the owned website, bounded rival holds and each site's address plus a useful distinct primary brand name through `holdBrandNames`. Rival scope uses `radarRivals` limits; it is not an automatic crawl of all discovered competitors.

`dataForSeoMentionOperations.ts` declares `web_mentions` on Content Analysis search and `link_gap` on Backlinks domain intersection. Mention period keys use seven days; pair gaps use thirty. For every sorted rival pair, planning excludes the owned host and asks for up to one hundred intersection rows. The number of pairs grows with the selected rival set, so per-request pricing comments should never be read as a total run budget.

`mentionsParams` quotes the phrase and removes embedded quote characters. `mentionPhraseAskedFor` reconstructs a lowercased phrase from sent parameters. The ordinary collection system owns purchase reuse, sending, retries and failure states. No provider operation, price validation or live callback was exercised in this documentation pass.

## Parsing And Dates

`parseMentions` deduplicates URLs within a result. It accepts explicit English language, rejects other or missing languages, and restricts a stated country to GB or WW while allowing no country. It projects URL, normalized host, title, day, kind, tone and domain strength. The transient snippet is capped at six hundred characters for relevance assessment.

Day prefers content publication date, then fetch time, then the current UTC day if no accepted day is available. Older comments saying first found are not the complete implementation contract. Date-menu totals can place a newly discovered historic article in a historic interval, which should be explained before treating the chart as an ingestion-events log.

Kind comes from supplier page types. Negative tone requires negative connotation at least 0.3 and greater than positive; favorable tone requires positive at least 0.4 and greater than negative; otherwise tone is neutral. Those measures are independent of the separate business-identity decision. Missing strength defaults to zero in this packed evidence path rather than remaining a nullable supplier fact.

## Relevance And Sharing

`fileMentionPull` resolves a searched host first, otherwise named websites from a bounded two-thousand-entry listing. It ignores already-held URLs and the website's own host/subdomains. For fresh pages it resolves available company business context, then calls `judgeMentions` and `writeMentions`. Parse failures are recorded on the pull through the existing parse-failure path.

The decision key is `discovery.mention-about`. `judgeMentions` processes eight pages concurrently, supplies business name/host and optional sector/description with the title/snippet, and uses `namesIt` as its fallback. That fallback checks the host or an escaped whole-name expression. A decision being off does not mean every page is accepted, and it does not mean every relevance label was produced by a model.

The result stores about as one, zero or unknown. The snippet is removed from the object passed to the packed mention writer. This is a statement about the mention table, not a universal assertion about decision traces or all model-call retention elsewhere. The shared website record can be informed by the filing company's configured context; it is not a private per-company relevance copy.

`shownMention` hides about-zero rows unless linked equals one. Unknown relevance remains shown. Therefore visible rows are not guaranteed to be model-confirmed matches, and a linked host can preserve a page considered another business by the name check.

## Storage, Link Evidence And Retention

`mentionSchema.ts` defines one `webMentionParts` record per website through `by_website`. It contains parallel URL/title arrays and packed days, kinds, tones, strength, linked and about columns. `rowsOf` reconstructs hosts from URLs and supplies numeric defaults. It does not recreate article text or a preserved page snapshot.

`writeMentions` adds URLs not already known. With no fresh URL it returns immediately. With fresh rows it checks `linksTo`, merges, keeps dates within 365 days, sorts newest first and caps the list at one thousand. Existing URL fields are not refreshed by a repeat observation. The one-year retention declaration is filing-triggered thinning, not a timed guarantee of deletion on an exact date.

`linksTo` checks any held backlink from the normalized host or its www form in ALL and ONE_PER_DOMAIN passes. It does not inspect the specific mention URL. The linked flag is host-level saved evidence and can remain stale because a known URL is skipped on later filing. This distinction is essential for interpreting missing-link suggestions.

`keepRules.ts` declares mention parts as thinned data and link-gap pairs as latest. Do not promise an exhaustive media archive, immediate refresh of changed pages or a separate daily cleanup that this writer does not perform.

## Backlink Gaps

`fileLinkGap` reconstructs two rivals and the excluded owned host, resolves the website and reads intersection results. It normalizes linking domains, excludes an observed spam score greater than thirty and uses the maximum available strength. No public webpage is fetched by the report to validate the intersection after storage.

`writeLinkGap` reads up to fifty pairs for the owned website, identifies the ordered rival pair and inserts or replaces its packed domains/strength and month. This bounded lookup is not proof of deduplication across an arbitrary oversized historical pair set. `linkGapOf` also reads fifty and ignores pairs containing a rival outside the current supplied group.

The query unions applicable pair domains, rival sets and maximum strength. It is paired supplier evidence rather than a general guarantee that every listed domain currently links to every watched rival. A watched-group change can alter the report while leaving prior shared pair rows intact.

## Customer Query Behavior

`webMentions`, `mentionsAgainstRivals` and `whereToGetListed` use `tenantQuery` and `requireMySite`. They resolve `groupOwner` for the owned website and associated private setup. The current mention list returns all shown held rows; the period is used for summary interpretation, not to reduce the returned list automatically.

The main page applies title/host text and tone/kind/link filters locally. Date menu totals and chart steps operate on stored row days. `webMentionsSees` combines period-based new-page wording with all-held no-link candidates. Its threshold for a possible link request is strength at least one hundred and nonnegative tone; that heuristic never sends a message.

`mentionsAgainstRivals` counts rows within selected UK calendar periods, previous periods and chart steps. Missing stored mention data becomes an empty list in several projections. A zero can therefore reflect absent evidence as well as a completed empty result; avoid claiming a richer collection-status guarantee than returned fields support.

`whereToGetListed` joins source URLs from `siteBrandRadar.readings/questionsOf`, applicable link-gap pairs and owned shown mentions. It excludes own/rival hosts, groups by normalized source host and counts distinct source URLs within each question reading, not unique publishers globally. It marks there from an own Radar source association or matching held mention host.

Rows survive when they link to at least two rivals, classify as directory/reviews/news or are already associated with the own site. Other quoted host types can be omitted. This is a selected opportunities projection, not a complete dump of every source Radar encountered. Strength can be null when the opportunity has no gap-strength evidence.

## UI Actions And Verification

The pages provide filters, heading sorting, shared Sites pagination, external source navigation and chart CSVs. Chart downloads use displayed date steps and aggregate series, not full saved article text. Where-to-get-listed filters do not mutate brand configuration or rival membership. There is no outreach, directory purchase or posting action in these reports.

`webMentions.test.ts` covers language/country filtering, source parameter reconstruction, fallback naming, unique fresh filing and shown-row exceptions for linking hosts. `mentionsLoad.test.ts` covers bounded report reads, while `utils/sees/mentions.test.ts` covers derived guidance. These were inspected, not executed. No live provider, browser, sender or deployed integration acceptance was tested.

See [Backlink Reports](./backlink-reports.md), [AI Visibility Reports](./ai-visibility-reports.md), [Collection Operations](./collection-operations.md) and the [user guide](../end-user/web-mention-monitoring.md). Brand Radar's detailed ingestion and review remain a separate inventory area. PRODUCT.md section 33 retains external rename-cutover requirements; current local parsing does not establish successful live reconfiguration.
