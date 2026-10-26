---
product: Hakken
documentation_type: Developer guide
feature_area: website asset summaries and off-site drafts
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/website-assets-and-drafts.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Website Assets And Suggested Drafts

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** website asset summaries and off-site drafts
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/website-assets-and-drafts.md` · **Status:** Current


This guide covers saved asset summaries and the off-site draft read/decision workflow. `siteAssets.ts` reads summaries calculated by `assetSummaries.ts`. `insightsDrafts.ts`, `utils/insightDrafts.ts` and the draft portion of `insightsRunAfter.ts` gather evidence, generate bounded suggested content, store it and record a person's decision. Advanced Insights reports and team execution are documented separately in [Insights Findings](./insights-findings.md) and [Reports](./insights-reports-and-exports.md).

## Entry Points And Access

Your assets is `src/app/(dashboard)/app/sites/[siteId]/assets/page.tsx`. It calls `siteAssets.yourAssets`, which requires company holding access, resolves `groupOwner` and reads `assetSummaries.by_hold`. It returns saved rows and updatedAt; it does not synchronously recompute or request provider data.

The draft detail route is `drafts/[draftId]/page.tsx`. `siteDraft` resolves the draft and calls `requireMySite` for its stored holding, returning the real site ID for navigation. The route's site parameter is not the authorization source. `siteDrafts` requires an owned holding and reads up to sixty area records created within sixty days.

`decideDraft` is a tenant mutation with `requireMySite`, accepting APPROVED, DISMISSED or DRAFTED. It does not explicitly reject oversight roles or enforce a separate approval role. Generic authenticated tenant wrapping is not equivalent to the stricter `requireOwnSite` guard in listing mutations. This contract is documented as implemented; any role-policy repair is outside this Markdown task.

## Asset Calculation And Scheduling

`workOutAssets` reads existing figures, Local setup, map checks, app answers, overview checks, Radar sources and shown mentions. It does not call external services. The website row always begins from ranking bands and optional estimated visits; missing ranking bands fall back to zero page-one keywords in this calculation.

Website stages use fewer than ten page-one searches for NOT_SEEN, then known estimated visits below page-one count for SEEN_NOT_CHOSEN, otherwise WORKING. These are fixed stored-evidence rules, not a measured lead/sale funnel. Working can coexist with missing commercial-outcome data and should never be described as proof of conversion success.

GOOGLE profiles use observed top-three map appearances out of selected checks; no checks or less than half in-box gives NOT_SEEN. Chosen is notRead. Answered retained reviews below eighty percent can supply the first fix independently of the stage. Non-Google own review pages use twenty stored reviews as a threshold, defaulting missing review counts to zero for this rule.

ChatGPT app rows use at most one latest available answer per question, own-host/brand-name matching, read pages and business cards. Google overview rows compare own citations against half the overview-present tracked checks. Those are distinct inputs with different selection and identity rules, not a single complete AI visibility count.

Own cited pages are limited to three and directories/review hosts to six. `pressAsset` uses shown mentions: zero NOT_THERE, fewer than twelve NOT_SEEN, then less than half linked SEEN_NOT_CHOSEN. It inherits host-level backlink markers, existing URL staleness and filing-triggered mention retention rather than independently fetching publishers.

`writeAssets` deletes a summary for a missing or tracked site, otherwise writes only when stable semantic rows change. Identical recalculation leaves updatedAt alone. `bookAssetsAfter` schedules company rebuilding fifteen minutes after the collection event; company rebuilding reads up to two hundred holdings. Delay is not a dependency-completion proof for every asynchronous source.

## Draft Evidence And Generation

`draftInputs` loads the holding/site and picks an origin from an HTTP-style saved Search Console property or host fallback. It reads up to two hundred holding pages and selects fifteen eligible home/service/case-study/about paths. It reads forty listing links, using GOOGLE own profiles and rival category/post context.

For each own listing it checks only the first packed review part, up to two hundred entries, counts unanswered candidates and supplies at most six text examples, each shortened to five hundred characters. Profile descriptions are shortened to six hundred. These limits are not equivalent to the full Review Intelligence reader or a complete live website crawl.

Outreach candidates come from applicable `linkGapOf` domains with at least two rivals and strength at least twenty, ordered by rival count and strength and capped at twelve. The input also includes recent kind/target pairs to discourage repetition. Collection/model settings and company instructions are resolved through the existing team action path; these inputs do not themselves authorize sending anything.

`insightsRunAfter.writeDrafts` asks the Local specialist when own profiles exist and the Links specialist when suitable outreach exists. `DRAFT_RULES` requests plain British English, no fabricated facts and bracketed business input where evidence is missing. It asks for particular post/description/email lengths. Those prompts guide generation but are not all mechanically enforced acceptance checks.

`draftsFrom` accepts JSON draft entries only for the requested area's known kinds. It requires title/body, truncates body to three thousand characters, title to one hundred sixty, target to one hundred twenty and reason to three hundred, and accepts a page only if it appears in supplied paths. It keeps at most four LOCAL, two REVIEWS or eight LINKS entries. These are per parsed/saved batch bounds, not a separately enforced global weekly quota.

## Saving, Reuse And Retention

`saveDrafts` checks the newest same holding/kind/target record through `by_hold_kind_target`. A draft within sixty days suppresses another unless that prior status is DISMISSED. It appends a tagged link when applicable and not already present, stores company/holding/week/area/kind, reason/title/body and DRAFTED status, and counts per-area saved entries for that call.

The body can be longer after link append than the parser's original three-thousand-character limit. The same week can have several valid batches under this code path; do not infer a durable weekly counter from MOST_DRAFTS alone. The prompt's notAgain context and same-target guard reduce repetition but do not constitute an unlimited exact-content deduplication engine.

Cleanup in `saveDrafts` deletes up to fifty records older than two times 365 days using `by_created`. `keepRules.ts` calls this a two-year lifecycle, but deletion depends on later saving and the bounded sweep. The sixty-day area list filters creation time even for waiting DRAFTED items; it does not return all old undecided drafts as some comment wording suggests.

`siteDraft` can return an older retained record directly. Missing returns null; `decideDraft` instead raises NOT_FOUND for a missing target. Resetting to DRAFTED clears decidedAt/decidedBy; other decisions save time and caller ID. There is no explicit state-transition lock or external publication record in that handler.

## Clipboard, Tags And Evidence Limits

The detail page attempts optional clipboard writing before sending APPROVED, catches clipboard failure and sets a copied notice anyway. It can therefore record approval without successful clipboard output. Copy again repeats that path; undo changes stored decision, not a public action. No email sender or Google profile-posting endpoint is called by approval.

`campaignOf` constructs hakken-prefixed kind/week names. `taggedLink` adds utm_source, utm_medium and utm_campaign to a supplied page, preserving an existing query separator. Sources vary by kind, with outreach derived from the target host. These tags support compatible downstream campaign analysis only when actually used and observed.

Draft approval is not evidence of delivery, publication, traffic or enquiry attribution. Generated links are not fetched for reachability here. The accepted path list narrows link choices, while the origin still depends on saved property/host context. Do not turn those implementation facts into a claim of universal safe/current destination verification.

## Frontend And Verification

The asset page offers kind/stage/text filters, heading sorting, shared Sites paging and a local CSV over supplied sorted filtered rows. Headline counts use the full summary. Row navigation opens supporting reports and never directly applies a fix. Draft pages show body and reason with approve/copy, dismiss and reset actions rather than a full content editor.

`assetSummaries.test.ts` covers initial website staging, stable no-change writes and press thresholds. `utils/insightDrafts.test.ts` covers tagged campaign links and parsed kinds, paths and area bounds. These tests were inspected, not run. No model generation, live supplier purchase, browser, clipboard operation, public posting or message sending occurred in this documentation pass.

See [Brand Radar](./brand-radar.md), [Review Intelligence](./review-intelligence.md), [Web Mention Monitoring](./web-mention-monitoring.md) and the [user guide](../end-user/website-assets-and-drafts.md). Wider Insights runtime and outcome reports retain their own queue item. PRODUCT.md intent and section 33 cutover remain unchanged; implementation foundations do not establish complete product delivery or live external integration acceptance.
