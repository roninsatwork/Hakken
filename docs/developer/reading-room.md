---
product: Hakken
documentation_type: developer guide
feature_area: Reading room
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/reading-room.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Reading Room

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Reading room
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/reading-room.md` · **Status:** Current


## Route and data boundaries

Reading room groups `src/app/(dashboard)/app/news/`, `knowledge/`,
`helpful-content/` and `who-to-follow/`. It is distinct from
`/app/insights`, the company's analysis section, and company Wiki/knowledge
uploads. The reader shell remains under `_learn`; internal names and route
segments do not all follow the latest navigation wording.

Core modules include `convex/news.ts`, `knowledgeArticles.ts`,
`libraryArticles.ts`, `newsFollows.ts`, `knowledgeList.ts`,
`leadStory.ts`, `contentTranslation.ts` and the `contentSchema.ts`
composition. This guide covers core publication and reading. Detailed
collector operation, translation failure handling, reading analytics and
weekly digest generation remain separate inventory work rather than being
claimed fully current here.

The [user guide](../end-user/reading-room.md) explains shared-versus-private
material. Do not infer full product delivery from these routes; intent and
known dated delivery discrepancies remain in [PRODUCT.md](../../PRODUCT.md)
and the coverage inventory.

## Shared reader access and protected writes

Knowledge articles and editorial reader material are platform-wide,
not company-owned uploads. `knowledgeArticles.ts` uses `tenantQuery` to
require a signed-in reader, while writes use `superAdminMutation` and admin
reads use `superAdminQuery`. A query being tenant-aware does not imply every
article carries a company filter when the actual product is shared general
knowledge.

`news.ts`, `libraryArticles.ts` and `newsFollows.ts` likewise separate
published reader projections from platform administration. Preserve that
boundary rather than returning a full admin record from a convenience
reader query. Imported source words, unpublished drafts, operational
translation details and reader-facing summaries have different audiences.

Private company facts belong in the company knowledge/Wiki path. A new
editorial feature must not accept company-private text into shared knowledge
because its caller happens to have an active company. Use the existing
content audit and publication helpers for platform writes; UI visibility
alone is not authorization.

## News and lead selection

`news.getFrontPage`, `getNewsItem` and `listNewsItems` are reader entry points.
News rows carry kind, source, summary, meaning, URL and publication timing,
with Google-update metadata where relevant. The source comment describes
collector items going live immediately and platform removal as the editorial
control. Do not promise a universal draft-approval stage that this path does
not implement.

`leadStory.ts` and `chooseLead` select one lead across eligible News,
Knowledge and Helpful content. An active pin has precedence, then a relevant
Google update, then recency. Pins expire; Google-update lead relevance has
its own timing. Maintaining one cross-type lead avoids three independently
pinned front-page winners. A new content type must integrate with those
helpers rather than introduce a local pinned boolean in a screen.

Google updates can also provide dated chart context. Their editorial timing
and displayed explanation do not establish that an update caused a
particular company's traffic change. Keep observation, date correlation and
causal claims separate in generated content.

## Knowledge articles, imported references and list maintenance

`knowledgeArticles.ts` stores Hakken-authored English articles, topic and
publication state. Published material supplies reader words and can be
synchronized to the shared knowledge representation through
`knowledgeArticleWiki`. `syncArticleToWiki` and `removeArticleFromWiki`
separate active reference availability from a deleted/unpublished record.

`libraryArticles.ts` stores third-party article details and full source text
for internal reference. Reader queries such as `listForReaders` and
`getForReader` require published material with the reader summary available.
The projection shows details and Hakken's summary, not the full source words.
`libraryArticleSearch.ts` supplies relevant sections to supported Assistant
surfaces, with headings/reference-list treatment and bounded reading.

Admin Knowledge combines authored and web items through `knowledgeList`.
`syncOursInList` and `syncWebInList` maintain small list rows when the source
records change. `KNOWLEDGE_LIST_MAX` is 900 and a cut list is identified as
such. Do not call it an unlimited complete inventory when that bound is
reached. The combined admin list does not erase the source types or grant
reader access to unpublished imported words.

Deleting or unpublishing an article needs its translation, lead, indexed
reference and list state kept in agreement. Reuse the owning mutation's
cleanup path rather than deleting only the visible row. These behaviors are
separate from preserving dated research and completed verification documents
in the repository, which this maintenance task never rewrites.

## Sources, models and translation

`newsCollectorRun.ts` reads the enabled collected channels of Who to follow.
It tries website feeds, can fall back to Firecrawl extraction, reads YouTube
feeds and uses the configured X integration for supported account/bookmark
sources. `followChannels.ts` and `newsFollows.ts` hold channel choices and
editorial picks. `MAX_PICKS` is four. A stored recommendation is not itself
proof its collection channel is active or authenticated.

The collector writes English summaries and meaning using its configured
agent/model instructions and records model/provider costs. X reads can cost;
website extraction also depends on service configuration. Do not treat an
admin open/import/collect action as a harmless local read or run it while
checking Markdown. Source fetching belongs behind existing safe HTTP and
provider service boundaries.

`contentTranslation.ts` computes source fields/fingerprints and requests
translation for eligible published content. `readerFields` supplies the
reader language with source-language fallback. `utils/contentLanguages.ts`
owns supported content languages. A changed English source needs its
translations/indexed reader words kept in agreement; duplicating per-language
human authoring fields would conflict with the product's authored-once rule.

This guide does not establish a complete retry/idempotency contract for every
translation and collection failure. Those specialist services remain queued
for full review. Preserve their job ownership and source fingerprints when
extending the reader code.

## Reading events and digest integration

Reader routes use the reading instrumentation, while `reading.ts` records
bounded, authenticated events. Views, reads and Assistant reference use are
operational activity measures, not proof of understanding or business
outcome. `readingAnalytics.ts` exposes platform analytics using super-admin
query boundaries. A new public reader query should not expose per-person
reading history alongside shared article content.

`contentSchema.ts` composes article, news, translation, Outbox, topic,
knowledge-list, maintained-count and reading table fragments into the root
schema. Source tables remain the content authority; maintained counts/list
rows support efficient pagination and filtering. Keep write-time maintenance
aligned if introducing another publication transition.

Weekly digest issues are separate stored artifacts using selected items and
an opening. Their generation and selection are in `weeklyDigestRun.ts` and
related role modules; delivery goes through the Outbox. Do not call the
reading view's existence proof that a live weekly issue was composed,
translated, queued and delivered. See [Email System](./email-system.md) for
preferences, suppression, provider submission and retry boundaries.

## Tests and verification limits

Useful test sources include `newsFrontPage.test.ts`,
`newsCollector.test.ts`, `libraryArticles.test.ts`,
`contentTranslation.test.ts`, `readingAnalytics.test.ts` and
`followChannels.test.ts`. Future checks should exercise published/draft
projection, source-language fallback, one active lead, source removal,
list/count maintenance and role boundaries rather than only a populated card.

This review inspected selected source and route paths, made no external
fetches and ran no import, collector, translation, digest, model, browser or
application test. No universal immutable archive or retention duration for
all editorial content was established. Record that limitation instead of
inventing an expiry promise from a publication timestamp. Operator commands
and full service recovery procedures require their own authorized scope.

The story-to-Assistant handoff is also a boundary worth preserving. Reader
pages can open a prepared question through the assistant's `ask` URL input;
the welcome page loads that starting text without sending it automatically.
A content link therefore must not be documented as an automatic model run,
background task or approval. Review the destination's company and website
context separately from the shared article's publication scope.

## Related operational evidence

Use [Readership analytics](./reading-room-readership-analytics.md) when a question concerns counted views, people or company projections; a published article alone does not answer those questions. Use [Collector recovery](./news-collector-and-editorial-recovery.md) when source items were fetched but not summarized or retained. These guides separate shared publication, internal identifying projections and provider recovery. A reader opening an article does not authorize an editorial retry or a new paid scrape.
