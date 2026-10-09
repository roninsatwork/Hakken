# Discovery — local, reviews, AI apps, Brand radar and web mentions

**Started 2026-10-09. Status: every decision in §1 agreed 2026-10-09; step 1
(Local) being built.** Built the way the
[core data normalisation plan](core-data-normalisation-plan.md) built the
core: its rules (§3 there) hold here, every new screen is held to a reading
budget before it is merged, and every new table is packed from its first day.
Follow `AGENTS.md`.

The screens are drawn on the canvas "Discovery — local, reviews, AI apps and
mentions" (https://claude.ai/code/artifact/6d77e749-bd6f-46fb-b0ee-97d63a5ea155),
20 boards in five rows. The canvas is the look; this plan is what stands
behind it.

What Anthony said, 2026-10-08 and 09:

- "we def need to talk about 1, 2, 7, 8" — of DataForSEO's unused APIs:
  Google Business Profile and reviews (1), Google Maps (2), what people see
  in the AI apps (7), brand mentions across the web (8).
- "assume this will all sit in the discovery section".
- "is this all the data we get — or can we show more screens — I'm relying
  on you here to help and guide me into creating the best possible app" —
  which added the fifth row: Your assets, What customers say, Where to get
  listed, Local market, Rival activity, AI Overview gaps.
- "don't do US, it's not in scope for our client base".
- "we are not allowed to mention DataForSEO" — no screen names the supplier.
- "let's lose the town by town screen, we don't need it".
- "are you able to build this following the other agent's style in data
  normalisation and optimised code for speed and also storage".

**In plain words.** Hakken today knows a business only through its website.
This adds the rest of what brings it customers: its Google profiles (one per
office), where it sits on Google Maps, its reviews and what they say, how
the AI apps answer people's questions about it, and where the web talks about
it — each beside the rivals it watches, and all of it in Discovery under the
website it belongs to. Every business, review, mention and answer is stored
once, packed, and read by each screen within half of Convex's limits.

## 1. Decisions

| # | Question | Recommendation | Status |
|---|---|---|---|
| D1 | Which screens, and in what order? | **All 20 drawn, in six parts** (§9): Local, then Reviews, then the AI apps, then Brand radar, then Web mentions, then Your assets last, because it reads all the rest. Each part goes live on its own. | **Agreed** — Anthony, 2026-10-09: Local first. Order since D13: Local, Reviews, AI apps, Brand radar, Your assets, then Web mentions last. |
| D2 | What is a Google profile in Hakken, when everything today hangs off a website? | **A listing**: one record per business on the whole platform (shared, like a website), found by Google's place number; a company's link to it is private and sits on its website hold, as an office ("Guildford office") or a rival. So every listing screen lives under its website in Discovery. Trustpilot and Tripadvisor pages are listings too. | **Agreed** — Anthony, 2026-10-09: every office tracked. |
| D3 | Who links a business's profiles? | **The client, in Discovery → Your listings** (find, "This is us", "Watch as a rival"), as the client now manages its AI questions there; the super admin can do the same from the company's admin pages. | **Agreed** — Anthony, 2026-10-09: client and admin. |
| D4 | Review text — the clean-up's rule is that no page text is kept. | **Keep the text of your own reviews for good** (a business has hundreds, not thousands; What customers say and the drafted replies need it). **Rivals' reviews: stars, dates, replied or not and Google's topics only — no text.** | **Agreed** — Anthony, 2026-10-09: own text only. |
| D5 | ChatGPT and Gemini: read the app, ask the model, or both? | **Read the app instead** for those two (what a person really sees, with businesses, sources and the searches it ran); **Claude and Perplexity keep being asked through the model**, as neither has an app view; **Google AI Mode is added**. One answer per assistant per question per run, as today. | **Agreed** — Anthony, 2026-10-09: the app instead, for ChatGPT and Gemini. |
| D6 | Where are map positions checked from? | **From each office's own address** (its profile's map point), not the website's city list. | **Agreed** — Anthony, 2026-10-09: every office tracked. |
| D7 | Rivals' profiles | **Matched automatically to the tracked competitor websites** where the profile names that website, **plus any business added by hand** — including ones with no website (Local market's "Watch as a rival"). | **Agreed** — Anthony, 2026-10-09: every office tracked, rivals matched and added by hand. |
| D8 | How often each thing is bought (§6) | Profiles weekly; your reviews every run, new ones only; rivals' reviews monthly; map positions every run; Local market monthly; rival activity weekly; web mentions weekly; Brand radar monthly; AI apps every run; AI demand monthly. | **Agreed** — Anthony, 2026-10-09: as drawn. |
| D9 | Limits (each a Data limits choice, per website) | Offices **5**; rival profiles per office **5**; map results read **20** a search; your reviews caught up **all** the first time (the supplier stops at 4,490), then new only; rivals' reviews **50 newest**; mentions **100** a check; Brand radar questions **200**; Local market **100 businesses within 10 km**. AI app questions use the existing questions limit (10 a website). | **Agreed** — Anthony, 2026-10-09: as drawn. |
| D10 | Brand radar covers Google's AI answers in the UK — not proved yet. | **Prove it with one call first** (§9, step 0). If the UK is not covered, Brand radar waits and the rest goes ahead. | **Agreed** — Anthony, 2026-10-09. **Proved 2026-10-09** (§6A): 24 million UK answers held. |
| D11 | Prices | **One test call per new kind of data before its part is built** — a few pence in all, needs Anthony's go — and each price written into §6. | **Agreed** — Anthony, 2026-10-09: "yes, go" to one test call per new kind of data. |
| D12 | Calls and direction requests from a Google profile | **Not in this plan.** They come from Google's own profile figures, not from the supplier, and need Google's approval of a verified profile 60 days old (PRODUCT.md §31). Your assets says "not read yet" until then. | **Agreed** — Anthony, 2026-10-09, with D1: calls and directions stay out. |
| D13 | Web mentions are noisy for short brand names (§6A). | **Search with the website's host and each brand name in quotes, UK and English pages only, then let the Decision Maker judge each new page "about this business or not"** (a small AI cost a page, shown on Admin's costs), and show only those it keeps. | **Agreed** — Anthony, 2026-10-09: **build last, and test on Korda first** — one paid test on Korda (his go) before step 6 is built; the page-by-page AI check is decided then. |

## 2. What Hakken knows today

Read from the code on 2026-10-08 (three read-only searches; the findings
below are theirs).

- **Google's map box** is kept only as a list of website domains on each
  results page (`siteSerpPages.localPackDomains`); the business is "in" it
  only when its own domain is listed. Its name, rating, reviews and Google
  number are thrown away when the page is slimmed (`dataForSeoSlim.ts`).
- **No business identity** is stored: no address, phone, Google number or
  profile link (`companies`, `websites`, `companyWebsites`, `holdProfiles`).
  `holdProfiles.brandNames` (up to 5) is the only name record.
- **Place** is one per website hold, from 14 UK places (`seoLocations.ts`),
  set by a super admin. No map points.
- **AI answers**: four assistants asked through their models
  (`seoAiEngines.ts`), answers and citations filed by `writeAiCitations`
  (`seoCollectionParse.ts`), wording kept 90 days (`aiAnswerTexts`), counts
  for good. LLM Mentions is used only for Google AI Overview fan-out searches,
  off by default. AI Mode, the app readers and AI search volumes are not used.
- **AI Overviews**: only the domains quoted are kept (`aiOverviewDomains`),
  not the pages.
- **Reviews, web mentions, Trustpilot, Tripadvisor, Business Data, Maps,
  Content Analysis**: nothing in the code.
- PRODUCT.md names Google profiles, review sites, directories and press as
  assets (§2, §3, §9); all marked not built (§31).

## 3. The rules

The normalisation plan's five rules, and the storage rules it built
(`docs/operator/dataforseo-data-kept.md`), apply unchanged:

1. **Each business, review, mention, page and question stored once per
   owner** — the platform for what is public (a listing, its reviews, a web
   page), the company's hold for what is private (which listings are its
   offices and rivals, its questions). Everything else holds its number.
2. **Lists of small rows are packed records of up to 1,000**
   (`LINK_PART_ROWS`, `utils/linkListParts.ts`): whole numbers by
   `packColumn`, days by `packDays`, fixed word sets by `packCodes`, text that
   repeats kept once a record and pointed to by number (`sitemapParts.ts`).
3. **A series over time is one packed record per owner** (`siteLinkWeeks.ts`),
   rewritten once per answer.
4. **Anything that can be worked out is worked out when read** — changes
   between two checks, shares, gaps, "Rivals there, you are not" — never
   stored twice.
5. **Raw answers are files, kept 7 days** (`SEO_RAW_RETENTION_DAYS`), and
   **slimmed to the fields a parser reads** before they are kept
   (`slimSeoResult`).
6. **Every screen within half of Convex's limits** at this plan's size (§8),
   proved by a load test with its reading budget in `code-ratchets.json`
   (`sitesReadKiB`, `bytesReadBy`), which may shrink, never grow.
7. **Every new table** has a `KEEP_RULES` entry, is in `websitePurge.ts`,
   `seoTestDataReset.ts` (`COLLECTED_TABLES`) and `seoStorageMeasure.ts`; every
   index is read by something (`convex/indexUse.test.ts`); private text never
   lands in a shared table (`websiteTenancyGuard.test.ts`).
8. **Bought once, shared**: a listing, a search at a map point or a question
   is bought once a day for every company that needs it (`planSharedPull`),
   reused while fresh (`heldForDays`), and only when due by its own cadence.
9. **No queue waits on a person**: every purchase is the Collector's, on the
   schedule, as today.
10. **No screen names the supplier.**

## 4. What exists to build on

- **The registry and pipeline** (`dataForSeoRegistry.ts`): an operation per
  endpoint with its mode, cadence (`refresh.everyDays`) and cost band; the
  Planner's steps (`seoCollection.ts`), the Collector (`seoCollectorRun.ts`),
  filing by pull (`fileSeoResult`), and the cost ledger (`seoDataPulls`).
- **Packed records**: `utils/packedColumns.ts`, `utils/linkListParts.ts`,
  `siteLinkGroupParts.ts`, `sitemapParts.ts`, `siteLinkWeeks.ts`.
- **The load test and its meter**: `convex/sitesLoad.test.ts`,
  `src/test/readMeter.ts`.
- **AI answers**: `seoAiEngines.ts`, `writeAiCitations`, `aiAnswers`,
  `aiCitations`, `aiAnswerTexts` — the app readers file into the same tables
  as new assistants.
- **Brand names** (`holdProfiles.brandNames`) — the words Web mentions and
  Brand radar look for.
- **Discovery's menu** (`sitePages.ts`, `SITE_PAGE_GROUPS`): a page marked
  not built shows as "Coming soon", so each part can land on its own.
- **Data limits** (`companyDataLimits.ts`, `fanOutLimits.ts`): the place D9's
  limits join.

## 5. What is stored — the records

Names are working names. "Shared" means one per thing on the platform;
"private" means one per company hold. Every record below is new except where
it says "existing".

| Record | Holds | Owner | Kept |
|---|---|---|---|
| `listings` | One business on Google, Trustpilot or Tripadvisor: its number there, name, address, map point, category, claimed, rating, review count, photo count, website host, and a packed record of the rest of the profile (hours, services, attributes, booking link, Google's review topics, "People also search for"). | Shared | Latest only |
| `listingWeeks` | One packed record per listing: rating, reviews, photos and claimed, each week. "Profile changes" on Rival activity are worked out from it. | Shared | For good |
| `holdListings` | Which listings a company calls its own (and which office) or a rival, on which website hold. | Private | While linked |
| `listingReviewParts` | A listing's reviews, 1,000 a record: review number, stars, date, replied or not, reply date, Local Guide, Google's topics for the review. **Text only for the company's own listings (D4)**, kept once a record. | Shared numbers; text only for own listings | For good while the review stands |
| `mapChecks` | One search at one office's map point on one day: the businesses in order (listing numbers), Google's reason for each ("Their website mentions…") kept once a record. | Shared | 90 days, like `siteSerpPages` |
| `mapPositionWeeks` | One packed record per office and search: the office's place each check. Map rankings' change and trend read it. | Private | For good |
| `localMarketParts` | Every business of the kind within the radius of an office, as listing numbers with their distance. | Shared | Latest only |
| `listingActivityParts` | A listing's newest posts, offers and questions, with dates. | Shared | Latest only |
| `aiAnswers`, `aiCitations`, `aiAnswerTexts` | **Existing.** The ChatGPT app, Gemini app and Google AI Mode join as three more assistants (D5). | Existing | Existing (wording 90 days, counts for good) |
| `aiAnswerExtras` | Per app answer, packed: businesses shown (listing numbers where matched, else name once), pages read but not cited, the searches it ran, ads. | Shared | 90 days, with the wording |
| `aiSearchVolumes` | AI asks a month for one search and place, with its 12 months packed — once per search, like `searchVolumes`. | Shared | Latest only |
| `siteSerpPages` | **Existing**, plus the pages (not only the websites) an AI Overview quotes, as paths. | Existing | 90 days |
| `brandRadarMonths` | One packed record per website a month: AI answers naming it, asks behind them, share against each rival, pages cited. | Shared | For good |
| `brandRadarQuestionParts` | The questions where AI names the website or a rival, 1,000 a record. | Shared | Latest only |
| `aiCitedSiteParts` | The websites and pages AI answers quote on the topic. | Shared | Latest only |
| `webMentionParts` | A website's mentions, 1,000 a record: the page (address and title once), date, kind of site, tone, links to it or not, site strength. | Shared | 12 months, the newest 1,000 shown |
| `webMentionMonths` | One packed record per website: mentions a month by tone. | Shared | For good |
| `linkGapParts` | Websites linking to two or more rivals and not to the website. | Shared | Latest only |
| `assetSummaries` | One record per website hold, rebuilt after each collection: what Your assets shows. | Private | Latest only |

**Not stored**: shares, gaps, "not answered for N days", "Rivals there, you
are not", profile changes — all worked out when read (rule 4). The raw
answers live their 7 days as files (rule 5).

## 6. What is bought, and how often

Prices are DataForSEO's charge on each test call (D11), read from the answer's own `cost`. Every row is a registry operation with its own cadence; nothing runs outside the schedule.

| What | Supplier endpoint | How often (D8) | Price, from the test calls of 2026-10-09 |
|---|---|---|---|
| Find a profile | Business listings search; Trustpilot and Tripadvisor search | When the client presses Find | $0.0127 for 2 results, $0.0192 for 20 (about $0.012 a call and $0.0004 a result); Trustpilot search $0.00075 |
| A profile | Google My Business Info (live) | Weekly | $0.0054 |
| Your reviews | Google Reviews, newest first (queued) | Every run, new ones only; all the first time | $0.00075 per 10 reviews |
| Rivals' reviews | The same, 50 newest | Monthly | $0.00375 a rival |
| Map positions | Google Maps results at the office's map point, 20 deep (live) | Every run | $0.002 a search and office |
| Local market | Business listings search by category and radius | Monthly | about $0.05 for 100 businesses |
| Rival activity | Google My Business Updates (queued); Questions and Answers (queued) | Weekly | $0.00225 per 10 posts; $0.00075 |
| ChatGPT as people see it | ChatGPT LLM Scraper (live) | Every run | $0.004 a question |
| Gemini as people see it | Gemini LLM Scraper (live) | Every run | $0.004 a question |
| Google AI Mode | Google AI Mode results (live) | Every run | $0.004 a question |
| AI demand | AI Keyword Data, up to 1,000 searches a call | Monthly | $0.0105 for 5 searches |
| Brand radar | LLM Mentions: search, aggregated metrics, top domains and pages — Google, UK | Monthly | search $0.11 for 10 rows; aggregated $0.101 |
| Web mentions | Content Analysis: search and summary | Weekly | $0.0244 for 10 results; summary $0.024 |
| Where to get listed | Backlinks domain intersection | Monthly | not tested — the Backlinks family already in use |
| AI Overview gaps, What customers say, Businesses recommended, Read but not cited, Your assets | Nothing new: read from the above and from the Google checks already bought | — | — |

17 test calls, $0.35 in all.

**What costs most**, now with prices: the AI apps at $0.004 a question each
— 10 questions × 3 (ChatGPT app, Gemini app, AI Mode) is $0.12 a run, beside
Claude and Perplexity as today; Brand radar at about $0.10 a call, monthly;
web mentions at $0.024 a call, weekly. Profiles, map positions ($0.002),
reviews ($0.00075 per 10), Local market and AI demand are small. Town by town,
the most costly, was dropped (2026-10-09).

## 6A. What the test calls found (2026-10-09)

Coverage, from the suppliers' own location lists (free): the ChatGPT and
Gemini app readers, LLM Mentions (Google only, 24 million UK answers held) and
AI Keyword Data all cover the United Kingdom; AI Mode answered for the UK.
**D10 is proved.** On real data:

- **Ronins has two Google profiles** ("Ronins" 4.9 from 15, "Ronins Group"
  4.8 from 16), both naming ronins.co.uk — the many-offices case is real
  (D2).
- **Map positions** came back 20 deep with Google's reasons ("… were both
  incredibly helpful in designing a new website for me").
- **Local market**: 165 website designers within 10 km of Guildford.
- **Reviews**: dates, stars, reply or not; some reviews are stars with no
  text; Google's review topics were empty on these ten.
- **Posts**: one Google post (February 2025). **Questions and Answers
  returned nothing** for Ronins — to be proved on a business that has them
  before Rival activity's question table is built.
- **ChatGPT app**: the answer, 8 sources, 25 pages read, 5 searches it ran, 4
  brands and the local businesses it showed. **Gemini app**: the answer and
  19 sources only — no pages read, searches or businesses. So Businesses
  recommended and Read but not cited read ChatGPT only.
- **Brand radar**: ronins.co.uk named in 222 of Google's UK AI answers,
  behind 144,720 asks a month.
- **AI demand is 0 for local searches** ("web design guildford") and real for
  questions ("how much does a website cost uk", 904): it is built from
  People also ask. AI demand shows question-style searches; a local search
  says "too few to count".
- **Web mentions are noisy for a short brand name**: "ronins" found 28,273
  pages, nearly all about other things; "ronins.co.uk" found 12, several
  unrelated. See D13.
- **Trustpilot**: Ronins has no page; the search returns look-alikes
  (Rowgins, Ronain), so a listing is linked only when the client says "This
  is us" (D3).

## 7. The screens

All under a website in Discovery. New menu groups and items — nothing else on
the menu changes, and no labels are added to it:

| Group | Pages |
|---|---|
| Site | **Your assets** (new, after Overview) |
| Brand radar (new group, after Site) | Overview, Websites AI cites, AI Overview gaps |
| AI answers | existing five, plus **Businesses recommended**, **Read but not cited**, **AI demand**; Full answers' own answer screen gains the five-way switch (ChatGPT app, Gemini app, Google AI Mode, Claude, Perplexity) |
| Local (new group, after Google results) | Business profile (with Every office side by side), Map rankings (with one search on the map), Local market, Rival activity, Your listings |
| Reviews (new group, after Local) | Your reviews, What customers say, Against rivals |
| Web mentions (new group, last) | All mentions, Against rivals, Where to get listed |

Parts each screen uses are the screen kit's (`screen-kit.md`): page and
record headers, figures, chart cards, notices, settings cards, filters,
status and tag labels, tables with sorting and numbered pages, row icons with
tooltips. **No new part** — Town by town's map grid went with it. Each
approved board is saved under `docs/plans/assets/discovery-local-reputation-ai/`
and given a look test when built (`lock-approved-looks`).

## 8. How big — the load test

As the normalisation plan's N1, at five times a large real client:

- 10 offices, each with 5 rivals; 100 tracked searches checked from each
  office, 90 days of map checks.
- 5,000 reviews on a profile; 50 rivals' profiles of 50 reviews.
- 100 questions × 5 assistants × 90 days of answers.
- 12 months of web mentions, 2,000 a month.
- 1,000 Brand radar questions, 500 cited websites.

Every new screen is run in the load test with and without a search, its
reading recorded and held to a budget in `code-ratchets.json`. A screen that
cannot meet half of Convex's limits at this size is changed before it is
merged, not after.

## 9. The work, in order

| Step | What | Days (estimate) |
|---|---|---|
| 0 | **Prove before building** (D10, D11): one call each, with Anthony's go — prices, UK coverage for the app readers, Brand radar and Business Data — written into §6. The load test's fixtures at §8's size, failing until each part is in. | 1½ |
| 1 | **Local**: `listings`, `holdListings`, `listingWeeks`; Your listings (find and link); Business profile and Every office; `mapChecks`, `mapPositionWeeks`; Map rankings and one search on the map; Local market; Rival activity. | 4 |
| 2 | **Reviews**: `listingReviewParts`; Your reviews, Against rivals, What customers say with drafted replies (the company's own AI model from its settings). | 3 |
| 3 | **AI apps**: the three new assistants into the existing answers; `aiAnswerExtras`; the answer screen's switch; Businesses recommended; Read but not cited; `aiSearchVolumes` and AI demand; AI Overview gaps (keep the quoted pages). | 4 |
| 4 | **Brand radar**: `brandRadarMonths`, `brandRadarQuestionParts`, `aiCitedSiteParts`; Overview and Websites AI cites. | 2 |
| 5 | **Your assets**: `assetSummaries`, built after each collection. | 1½ |
| 6 | **Web mentions** (last, D13): one paid test on Korda first, with Anthony's go; then `webMentionParts`, `webMentionMonths`, `linkGapParts`; All mentions, Against rivals, Where to get listed. Your assets gains its mentions line. | 2½ |

About 18½ days in all. Each step: the full local check, GitHub's own steps
at the end of each part, committed locally on `dev`, not pushed.

## 10. Risks

- **Coverage**: the app readers and Brand radar may not cover the UK as
  needed — step 0 finds out before anything is built on them.
- **Cost**: the app readers run for every question every run; held by the
  questions limit and the Collector's own per-website limit, as AI answers
  are today.
- **Matching a business**: a review site or an AI answer names a business,
  not a website. Matched by Google number first, then by website host, then
  by the hold's brand names; an unmatched name is kept as a name, never
  guessed.
- **Ambiguous brand names**: "Ronins" is also a martial arts school and a
  coffee shop. Web mentions and Brand radar search with every brand name and
  the website's host, and drop pages about another business of the same name
  (the reason shown on screen).
- **Google numbers change** when a business moves or merges; a listing keeps
  its old number as well and is matched on either.
- **Review text** grows with a business's reviews (D4); own reviews only keeps
  it to hundreds a business.

## 11. What changes on screen

Only the new pages and menu items in §7, and the answer screen's switch.
Nothing on an existing page changes its look; the AI answer pages list the
three new assistants in their assistant filters.

## Progress

| Step | State |
|---|---|
| 0. Prove before building | **Prices and coverage done 2026-10-09** (§6, §6A): 17 calls, $0.35. The load test's fixtures are built with step 1. |
| 1. Local | Not started |
| 2. Reviews | Not started |
| 3. AI apps | Not started |
| 4. Brand radar | Not started |
| 5. Your assets | Not started |
| 6. Web mentions | Not started — waits for the Korda test (D13) |

## Change log

- 2026-10-09 — Written, from the canvas and the read of the code on
  2026-10-08. Town by town dropped (Anthony, 2026-10-09).
- 2026-10-09 — D3, D4, D5, D10 and D11 agreed by Anthony.
- 2026-10-09 — Test calls made (17, $0.35): prices into §6, findings §6A, D13 added.
- 2026-10-09 — D1, D2, D6–D9, D12 and D13 agreed: Local first, every office tracked, cadence and limits as drawn, Web mentions last after a test on Korda (steps 5 and 6 swapped).
