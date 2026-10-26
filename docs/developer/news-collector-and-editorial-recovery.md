---
product: Hakken
documentation_type: Developer guide
feature_area: News collection and editorial recovery
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/news-collector-and-editorial-recovery.md
last_reviewed: '2026-10-26T14:15:04+00:00'
reviewed_against: current implementation
status: Current
---
# News Collector And Editorial Recovery

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** News collection and editorial recovery
> **Reviewed:** 26 October 2026, 14:15:04 GMT (Europe/London)
> **Source path:** `docs/developer/news-collector-and-editorial-recovery.md` · **Status:** Current

The News Collector imports new material from enabled channels in Who to follow, writes English summaries with the configured agent model, publishes collected items to News, and requests translations. Its durable records and operational limits are separate from the customer reading experience documented in [Reading room](./reading-room.md). The main source is `convex/newsCollectorRun.ts`, with database operations in `newsCollector.ts` and agent dispatch in `newsAgentRunActions.ts`.

A collected news summary, a retained full knowledge article, and a digest delivery are different artifacts. `newsKnowledge.ts` handles optional retention of a story's whole article. Weekly digest production has its own role and the Outbox later handles sending; see the existing [email system](./email-system.md). No collection, model request, paid scrape, X call, or recovery mutation was executed during this documentation review.

## Dispatch and role ownership

`agentRunStartService.ts` recognizes the stable `NEWS_COLLECTOR` system role and schedules `runNewsRoleNow`. The same dispatcher supports `WEEKLY_DIGEST` through a separate job map. It does not search for an agent by its display name. The internal action marks the run started, takes the role's turn, invokes the mapped job, then finishes with success or failure and a summary. A refused turn can finish successfully with its explanatory message; a successful run status alone is not proof that new stories were collected.

`readCollectorAgent` resolves the agent from the run. Its system prompt becomes the summary instruction. When model selection is inherited, no explicit model ID is passed; otherwise the configured agent model ID is supplied. `resolveModelConfigForExecution` resolves the `agent` use case. Provider credentials and model routing are inherited from platform configuration, not embedded literals in this collector.

The job stops starting new items after seven minutes, inside the action's execution limit. Model and X costs are recorded against the run, and a reached spend limit stops further work. Importantly, the collector path reviewed here finishes this action with a summary: it does not schedule a same-run continuation when that time budget expires. Remaining work depends on a later scheduled or separately authorized run. That is a gap against the repository's general automatic-handoff rule, and requires a separate application change rather than a stronger documentation promise.

## Channel selection and fetch limits

`listChannelsToRead` queries `followChannels.by_collect_checked` for collect-enabled rows, taking 100 before skipping LinkedIn or missing follow records. The ordering prioritizes never-checked and longest-unread channels through the index. Because filtering follows the cap, unsupported or orphaned rows can reduce the usable selection. LinkedIn is never collected even if a saved tick says otherwise.

Website collection first tries the address as a feed, then advertised and guessed feed addresses. It parses RSS/Atom into entries ordered newest first. If no usable feed is found, it invokes the web scraper for links on the source page, then fetches candidate articles for their words. This fallback has paid scraping implications. `PAGES_PER_SOURCE` is ten, ordinary feed summarization is capped at 50 items, and a first read is limited to the newest five to avoid importing a back catalog.

YouTube uses a channel feed resolved from the channel address or its page. It collects the feed's information, not a verified complete video transcript. Plain feed requests use the safe workflow HTTP helper with a 20-second timeout, two-megabyte response limit, and at most three redirects. Errors discovering guessed website feeds can be swallowed before the scraper fallback; a final channel problem explains failure of the usable path rather than listing every failed guess.

`withWords` retains feed-provided text where available. For entries lacking text it asks the scraper for main content and truncates to `ENTRY_TEXT_LIMIT`. A scraper failure returns null for that entry, allowing the loop to skip it. Source text is passed as input data to the summary prompt; it is not a new instruction authority or an operator-approved publication statement.

## Summary generation, deduplication, and publication

`freshOf` checks candidate external keys through `knownKeys`, excluding both existing `newsItems` and `newsTakenDown` tombstones, then applies the source limit. `summariseAndSave` requests JSON title, summary, and meaning strings through `generateTextWithResolvedModel`. `parseTranslation` validates the shape used by this path. A missing/invalid summary can be charged as a failed model call without creating a news item.

Every model call records model/provider identifiers, token counts, prompt/response content, and failure state through `roleRuns.recordRunModelCall`. This is operationally sensitive logging: do not copy prompts, personal bookmarks, or credentials into general incident reports. The spend check happens as usage is recorded, so it is not a guarantee that no final call can bring the total past the configured threshold.

`saveCollectedItem` rechecks the external key and taken-down table inside the mutation before inserting. This protects ordinary repeated/concurrent attempts from creating the same held key again. New items are live in English immediately; `requestTranslation` asks the translation system for other languages. Translation completion is not a prerequisite for the initial English insert. A failed translation does not imply the source was never collected.

The mutation increments a channel's found count and a follow's collected count when those parent records still exist, and keeps the newest publication time. `markChannelRead` records the latest checked time, optional last-new-item time, and a problem that clears on a later successful check. These are collection metadata, not evidence that every item in an external history has been imported.

## X accounts and bookmarks

X account reads require the backend variable `X_BEARER_TOKEN`. Missing configuration produces a skipped-channel log rather than a provider request. `xRead.ts` caps account reads at 20 posts and bookmark reads at 100 per request. Read cost uses the deployment's `X_READ_COST_USD` configuration through `xReadCostPerPost`; do not infer a current provider price from a local default or disclose a credential value.

Account reads save the returned user ID and newest cursor before summarization. Consequently, a later spend limit, time cutoff, or summary failure can leave posts behind a cursor already advanced. The reviewed code does not prove lossless replay of every fetched post. Do not promise that clicking Run again necessarily retries every skipped account post.

Bookmarks use a separately connected account and renewable access. Failed renewal logs a reconnect instruction. The initial bookmark pass deliberately keeps only the newest few. Later passes reverse fresh entries so processing proceeds oldest first, retaining progress to the last processed entry when a cutoff occurs. The callback runs even when model output was not saved; cursor progress and successful publication remain different facts. Initial-read cursor handling can advance to the newest available bookmark even when not all summaries were saved.

Provider refusal or quota errors are recorded as problems rather than permission to retry indefinitely. The collector's per-channel loop can continue to other sources after a read failure. Existing quota policy still applies to any future live diagnostic: documentation investigation authorizes no paid or provider-side run.

## Keeping a story as knowledge

`setNewsItemInKnowledge` is a super-admin mutation and audits keep/release intent. `keep` returns if a story is already linked or currently reading. A video has no full article to retain; an X story needs an external article link. A matching retained article at the target address is linked without paying to read it again. Otherwise the story enters `READING` and schedules `keepWholeInternal` once.

The action rechecks the pending state, validates the address, fetches the page with main content and structured data, and checks `LIBRARY_MIN_WORDS`. Expected failures set `FAILED` with a readable problem. Successful extraction stores a library article/body with source metadata, topic, the story's existing summary and meaning, and an origin relationship. `saveKeptInternal` rechecks pending state and duplicate address before linking, avoiding a late write after someone unticks the story.

The state machine has no general watchdog or automatic retry identified in this reviewed path. An unexpected thrown action error can therefore require investigation of a story left reading. Do not manually reset it or call the internal action as part of documentation maintenance. An approved recovery needs to establish current state, the target address, possible paid costs, and whether an article was already retained.

## Release, deletion, and verification boundaries

Unticking retention removes the article only when this story created and still owns that copy. Independently added articles remain. Taking a story down from News deliberately leaves its retained article in Knowledge, detaches the origin relationship, and updates follow counts. These are different destructive actions; never describe taking down News as deleting every retained copy. News items are retained indefinitely by the keep rules; takedown tombstones and retained library articles have their own record lifetimes.

Relevant local evidence is `newsCollector.test.ts`, `newsKnowledge.test.ts`, `xNews.test.ts`, and `utils/newsFeeds.test.ts`. These cover sample feed ingestion, duplicate/takedown exclusion, first-read limits, scraper fallback, channel failure, spending stops, and retention ownership. They do not establish exhaustive feed coverage, lossless cursor recovery, a completed same-run continuation design, live provider acceptance, or deployed translation/delivery status. Known external rename cutover issues remain in [PRODUCT.md](../../PRODUCT.md); this guide leaves source, configuration, plans, and product decisions unchanged.
