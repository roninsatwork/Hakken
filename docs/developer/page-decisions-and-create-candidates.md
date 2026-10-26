---
product: Hakken
documentation_type: Developer guide
feature_area: page decisions and create candidates
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/page-decisions-and-create-candidates.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Page Decisions And Create Candidates

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** page decisions and create candidates
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/page-decisions-and-create-candidates.md` · **Status:** Current


`insightDecisions.ts` builds and reads a current website decision set from known holding pages and retained source evidence. `utils/insightDecisions.ts` supplies rule priority and create candidates; `utils/insightPageAgent.ts` constrains specialist output and carry-forward. This is recommendation storage, not public CMS execution. Competing-page groups and the smaller priority plan remain distinct upstream systems.

## Routes, Tenant Scope And Identity

The main customer surface is `src/app/(dashboard)/app/insights/page-plan/page.tsx`, which reads `insightsPageDecisions` alongside `insightsReads.insightsPlan`. The decision query is tenant-authenticated, verifies a selected holding and restricts to OWNED through its site selector. Without selection it prefers an owned site already holding decision parts.

`buildDecisions` and rebuild/save helpers are internal. They use holding identity and shared website/place evidence as appropriate. `keyOf` normalizes page addresses without host/query/fragment and strips a trailing slash for non-root paths to join source lists. Display paths still come from the actual holding-page list.

The frontend tables provide filters, CSVs, classification counts and recommendation navigation. They do not invoke redirects, content deletion, merge operations or publishing. Exporting a Remove row is not a destructive action performed by Hakken.

## Paginated Page And Crawl Inputs

`pagesPart` paginates `holdPages.by_hold_page` in groups of five hundred, joining current company classifications and optional title. `crawlPart` paginates retained detail for a selected crawl pull. `buildDecisions` walks these cursors until done before applying decision rules, rather than using a single small first-page sample as the full known page list.

The input universe is still known holding pages, not every live URL. A missing public page is not automatically crawled or discovered in this build. Crawl status, inbound links and flags depend on the latest retained technical audit and inherit its collection limits.

`decisionSources` reads at most the shared history reader's bounded records, aggregates up to the newest twelve whole months of GA_PAGES and separately reads annual page views. View evidence is nullable when the slot is absent, preventing the unused rule from interpreting complete absence of Analytics as a verified zero-view site.

Search Console page evidence is lastQuarter NOW. Backlink domains are distinct non-lost referring domains from a compact link copy. Missing copies remain null, while a known copy without a page gives zero held domains. Neither condition certifies every live external link.

The query also joins the latest saved priority plan, up to forty competing groups, latest conversion reviews, content-gap rows, current keyword copy and buyer-question panel. These inputs can differ in saved dates. There is no requirement that every source is from the same analysis transaction.

## Rule Priority And Unknowns

`decide` checks broken status/flags first. It returns REDIRECT when known external links or internal inbound links exist, otherwise REMOVE. This branch precedes the later unused-page needed-type protection. Do not describe the whole rule system as universally forbidding every removal recommendation for a legal or service page.

Next come competing MERGE, non-KEEP/non-CREATE priority actions, then competing DIFFERENTIATE or LINK as IMPROVE. The unused predicate requires known views equal zero plus zero landing visits, shown and clicks. It excludes home/list paths and needed SERVICE/COMPANY/LEGAL/PRODUCT types; linked unused pages redirect, others can remove.

Duplicate, thin-with-activity, non-indexable-with-activity, orphan and non-KEEP conversion-review conditions then produce IMPROVE. Remaining rows KEEP with working/quiet reason. This ordered rule contract is more precise than presenting every recommendation as an independent AI judgment.

`pageDecisionsFrom` attaches relevant competing attribution and orders by verdict priority, enquiries, visits, impressions and path. Missing source metrics often project to zero within a known input branch, while views/domains preserve broader unknown states. That mixture must be documented when evaluating a destructive recommendation.

## Specialist Work And Carry-Forward

`pageReading` fingerprints verdict, reason, target, positive enquiry/link indicators, type and flags. It is not a signature of every exact numeric input. `carryPages` reuses suitable prior AGENT decisions when that reading remains valid, excluding competing-reason rows, and preserves prior decidedWeek.

`pagesToHand` selects at most forty non-KEEP, non-competing, not-already-agent rows, ordered by use. The specialist receives titles, type, initial rule, annual usage, ninety-day Google evidence, links and audit flags. It does not receive unlimited live page content or independently fetch every offered destination in this function.

`applyPageAnswer` requires an offered page, recognized verdict and valid reason. REMOVE is refused for a known externally linked page or needed type. MERGE/REDIRECT require an existing different known target, except retaining the same untargeted rule verdict is allowed. These checks are scoped to specialist output; they do not rewrite all earlier rule semantics.

Failed/refused output leaves rule decisions. `handToSpecialist` logs the handoff and counts within bounded log text. A completed build does not establish every row was freshly read by a model, and an AGENT attribution can be carried rather than newly generated.

## Create Candidates

`pagesToCreate` first examines gap rows with at least two rivals and volume at least fifty. It reduces selected close variants by volume/variant key and records best held rival position. These are current retained rank examples, not proof the business should sell the service named by every query.

Saved panel questions contribute only SEARCH-built examples with nonempty builtFrom text, absent from the owned website's current retained ranked-search set and existing candidates. Their inclusion does not require the same gap threshold. The helper orders candidates by volume/rival support and caps at twenty.

If the own keyword copy or panel is incomplete, candidate coverage is correspondingly limited. No article, page record, public URL or content draft is created by this helper. It stores proposed search topics and evidence labels only.

## Persistence And Reader Bounds

The normal build retains two thousand decisions after computing/order, while saving the total computed page count separately. `saveDecisions` deletes up to twenty existing parts, writes chunks of 250 with a maximum of sixteen parts and stores creates/count on part zero. The nominal storage-part capacity is not a promise the ordinary build retains more than its two-thousand cap.

`savedDecisionsOf` reads sixteen parts, sorts by part and concatenates decisions, taking creates/pages/time from part zero. The page count can exceed the number of detailed retained decisions. Graphs and counts derived from returned rows need that qualification rather than being claimed as a complete universe breakdown.

`keepRules.ts` declares decisions newest-run. Replacement does not create an append-only version archive or prove public changes were applied. A rebuild can change guidance when upstream data or classification changes; nothing in the reader marks a website fix deployed.

The internal `decideNow` action rebuilds from retained evidence without supplying a new specialist handoff. Existing eligible carried decisions can still survive that build. It is a mutating maintenance entry point, not an authorized step in a documentation review; report readers do not invoke it.

## Validation And Adjacent Contracts

`insightDecisions.test.ts` covers known-page decisions, missing Analytics avoiding false unvisited judgments, part replacement and cross-company access. `utils/insightDecisions.test.ts` covers rule priority, linked/broken/unused handling and create thresholds. `utils/insightPageAgent.test.ts` covers provenance, guarded specialist answers and carry-forward. Their source was inspected, not executed.

No model, provider, app, browser, CMS operation or live repair was run. See [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Competing Pages And Search Ownership](./competing-pages-and-search-ownership.md), [Technical Site Audit](./technical-site-audit.md) and the [user guide](../end-user/page-decisions-and-create-candidates.md). PRODUCT.md intent, roadmap and section 33 cutover remain unchanged; a local suggested decision does not establish business outcome or deployment acceptance.

## Publication after a resumed refresh

Current decision and box writes carry optional run/chain identity into `assertInsightsPublisher`. Guarded publishing rejects a stopped run or superseded chain booking rather than letting an old worker replace a newer decision set. See [Insights Findings](./insights-findings.md#durable-refresh-recovery-and-source-generations) for the shared stage and recovery contract. This guard does not remove the existing detailed-decision limit or turn a suggested public-page action into an executed website change.
