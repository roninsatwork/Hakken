# Keyword research — planned 2026-10-04

A new place under Discovery, beside Websites, where a company looks up any
search people make on Google: how many make it, how hard it is to reach the
top ten, who Google and the AI assistants show, the ideas around it, and
what it means for one of the company's websites. Modelled on Ahrefs'
Keywords Explorer.

## Why

Anthony, 2026-10-04, showing Ahrefs' and Semrush's keyword research:
"ahrf and semrush both have the ability for users to perform keywrod
resrach … this will be a new section for us". The menu: "another sub menu
under webite called keyword reseach". To build: "then build the keyword
research section".

## The drawings

The canvas "Keyword research" (claude.ai artifact `6ydgzRuLxAQEv33W4qMm2o`),
seven boards, redrawn on the drawing kit 2026-10-04:

| # | Board | The screen |
|---|---|---|
| 1 | Main | Keyword research: look up one keyword or several, a country, the website it is measured against; start from a competitor; past lookups; research lists |
| 2 | Overview | A keyword's overview: searches a month, difficulty, the visits the top result gets, intent; "For ronins.co.uk" (one of four answers: Already winning, Improve your page, Worth a new page, Too hard for now); your page, what Search Console counted, your competitors on it; 24 months of searches; searches by country; the first ideas; the top five; what the AI says |
| 3 | Results | Google's results: the top ten, each page's strength, linking websites, visits, keywords and top keyword |
| 4 | Ai | What the AI says: the question behind the search asked of four assistants, who they name, whether the website is one, Google's AI Overview searches |
| 5 | Ideas | Keyword ideas: terms match, questions, and what the top pages also rank for; tick to add to a list |
| 6 | StartFrom | Start from a competitor: what it ranks for that the website doesn't, from what Websites already holds |
| 7 | List | A research list: decide, then track the ones worth it |

His decisions so far:
- **Searches by country cover the home country only**; another country is
  looked up only when picked.
- **Research lists stay separate from tracked searches**
  (tracked-lists-stay-separate): "Track" copies a keyword into the website's
  tracked Google searches, checked every run at the usual cost, and taking it
  off the list leaves it tracked.

## What each lookup buys, and what it costs

DataForSEO's real average charges on dev, from `seoOperationCosts` on
2026-10-04, against what each screen needs. The new endpoints are DataForSEO
Labs calls, about 1 cent a call plus 0.01 cent a row returned.

| When | Bought (each a live call) | About |
|---|---|---|
| Look up | Labs keyword overview (searches, CPC, difficulty, intent, the top ten's average linking websites); Labs historical searches (24 months); Google's top 100 (live SERP, depth 100); the top ten's visits and keywords (Labs bulk traffic estimation, one call for all ten) | 5 cents |
| Google's results opened | Each top-ten page's strength (`bulk_ranks`) and linking websites (`bulk_referring_domains`), 2.4 cents each for all ten; what each page ranks for (Labs ranked keywords, one call a page) — its top keyword, and the "also rank for" ideas | 15 cents |
| Ideas opened | Terms match and questions (Labs keyword suggestions, the second with a question filter), the limit's number of each; "also rank for" comes with Google's results | 2 cents at 100 of each |
| What the AI says opened | Our AI writes the question (a fraction of a cent); four assistants answer (between 0.6 and 3.8 cents each); Google's AI Overview searches (10 cents a call and a tenth of a cent a search: 12.5 cents at 25) | 20 cents |
| Another country picked | Labs keyword overview for that country | 1 cent |
| Start from a competitor | Nothing: Content gap's copy, from what Websites holds | free |

So a keyword looked up and opened on every screen costs about 32 cents at
100 ideas of each kind, his choice (decision 3); one only looked up, about 5. The drawings' "1,000" and
"about $0.34" were mine; the screens follow his decisions.

## What is reused

- A keyword the website already ranks for, tracks, or a competitor ranks for
  shows what Websites holds (`siteKeywordRanks`, `siteSerpPages`,
  `searchVolumes`) and buys only what is missing.
- A lookup is kept and reused, for the company, for a number of days (30 days,
  decision 4); within them, opening it again costs nothing. Past lookups lists them.
- Bought once per keyword and country, shared between companies like
  Websites' own buying; what a company looked up and its lists are its own
  (tenant-scoped, like `holdLists.ts`).

## How it is built

- **Menu.** Discovery → Websites, Keyword research (`/app/keyword-research`).
- **Buying.** DataForSEO is bought only by an agent, with its logs, costs and
  per-run limit in Observability (all-agents-run-off-scheduler) — decision 1.
  The screen waits for the answers, then shows them; Labs calls answer in
  seconds, Google's top 100 in under a minute.
- **Countries.** `convex/utils/seoLocations.ts` holds only the UK and its
  cities; Ireland, the United States, Australia and Canada join as countries
  (the drawing's list). A lookup opens on the website's own country.
- **Lists.** A research list belongs to the company and is measured against
  one of its websites; "Track" adds through the same path as tracking a
  fan-out query (`addWebsiteKeywordCore`), within the website's tracked limit.
- **Limits.** Each number below that is a limit goes on the Limits pages,
  platform, company and website, like every other.
- **Testing costs nothing.** Built and tested against DataForSEO's free
  sandbox (`DATAFORSEO_SANDBOX=1`); the first real lookup waits for his go.

## How it is built — the parts

**Bought data, shared** (each keyword and country bought once, reused by any
company for 30 days, like Websites' own buying):

- `researchKeywords` — a keyword in a country: searches a month, CPC,
  competition, difficulty, intent, the last 24 months, the kinds of result
  Google shows, how many results, and the linking websites the top ten have
  on average. From Labs keyword overview and historical searches.
- `researchSerps` — Google's top 100 for it (live, so the screen waits
  seconds, not minutes; about 2 cents), and once Google's results are opened,
  each top-ten page's strength, linking websites, visits, keywords and top
  keyword.
- `researchIdeas` — one row per keyword, country and kind (terms match,
  questions, also rank for), up to the limit's number of ideas, each with its
  searches, difficulty, intent and CPC.
- `researchAnswers` — the question behind the keyword, the four assistants'
  answers (who each names, what each cites) and Google's AI Overview searches.

**The company's own** (read and written only by the company, like its
tracked lists):

- `keywordLookups` — a keyword the company looked up: the country, the
  website it is measured against (or none), who and when, and each part's
  state (waiting, ready, failed) with the agent run that bought it.
- `researchLists` and `researchListKeywords` — a list's name, the website it
  is measured against, and its keywords.

**The agent** — role `KEYWORD_RESEARCH` (Admin → Agents, from its template,
like the other DataForSEO agents). Look up writes the lookups and starts a run
at once; the run buys what is missing, files it, and writes each call's cost
and a line on its own run, in Observability, and on the company's DataForSEO
spend (`seoDataPulls`, the day roll-ups), so Cost to serve counts it. Its Mode,
on its Settings, is **Test** (DataForSEO's free sandbox: real shapes, sample
figures, no cost) until he switches it to **Live**. Its per-run spend limit is
the agent's own (agent-cost-control-is-enough).

**Who** — any company member but the platform's oversight roles (read-only,
auditor) may look up, make lists and track (decision 2); everyone in the
company sees its lookups and lists.

**The limits** (Admin → System Settings → Limits, a company's Limits — he:
"Remember the limits in the system ui"), each a choice like every other:

| Limit | Choices | Starts at |
|---|---|---|
| Keywords one Look up may hold | 1, 10, 25, 50, 100 | 10 |
| Ideas of each kind a lookup buys | 100, 300, 1,000 | 100 (decision 3) |
| Days a lookup is kept and reused | 7, 30, 90 | 30 (decision 4) |

The agent's spend in one run is the agent's own limit, on its Settings.

**"For ronins.co.uk"** — one of four answers, worked out from the figures on
the page, each saying why:
- **Already winning**: the website is in the top three.
- **Improve your page**: a page of the website ranks, below the top three.
- **Worth a new page**: no page ranks, and the website's linking websites are
  at least half the top ten's average (`avg_backlinks_info`).
- **Too hard for now**: no page ranks, and they are not.

## Order

1. Look up, the overview, past lookups, research lists and Track.
2. Google's results.
3. Keyword ideas.
4. Start from a competitor.
5. What the AI says.

Each a working part of the app, drawn first (done), built on the screen kit,
held by a look test once built (design-drift-plan D4).

## His decisions, 2026-10-04

1. **A new agent buys lookups**: Keyword research, started by Look up, buying
   only lookups, with its own per-run limit, logs and costs in
   Observability. It never waits behind a collection.
2. **Anyone in the company who can edit may press Look up**; a read-only
   viewer sees past lookups and lists but cannot buy.
3. **100 ideas of each kind** a lookup (about 4 cents), a limit on the Limits
   pages (100, 300 or 1,000) at platform, company and website.
4. **A lookup is kept and reused for 30 days**; opening it again within them
   costs nothing.

## Built — 2026-10-04 (local, on dev; not pushed)

All five steps, on his "build the keyword research section".

- **Backend** (`convex/keywordResearch*.ts`): Look up, Past lookups and a
  lookup's overview; Google's results; Keyword ideas; What the AI says;
  Start from a competitor; research lists and Track. The Keyword research
  agent (role `KEYWORD_RESEARCH`, template "Keyword research") buys, with its
  Test / Live mode; every call is on its run, the company's DataForSEO spend
  and Cost to serve. 15 tests (`convex/keywordResearch.test.ts`, the readers'
  `keywordResearchCalls.test.ts`).
- **Screens** (`src/app/(dashboard)/app/keyword-research/`): Look up (board
  1), a lookup's Overview (2), Google's results (3), What the AI says (4),
  Keyword ideas (5), Start from a competitor (6), a research list (7), with
  New list and a list's own Rename page (not drawn: a field opens a page,
  never a pop-up). Discovery → Keyword research in the menu. Look tests for
  every board (`docs/plans/assets/keyword-research/look/`), the drawings
  saved beside them.
- **Limits** (System Settings → Limits, a company's Limits): keywords in one
  Look up (10), ideas of each kind (100), days a lookup is kept (30), and
  Google's AI Overview searches per lookup (25; 0 buys none).
- **Said, not settings:** Past lookups shows the newest 500; a research list
  holds at most 500 keywords; the overview's ideas card shows the first eight
  of each kind.
- **Where the screens differ from the drawings, and why:** headings sort and
  footers are numbered (Discovery's table rules); figures and labels use the
  kit's parts (no white dropdown, no coloured "You"); costs read as the real
  calls cost; "Businesses named" are websites a company has named on Hakken;
  Start from a competitor's "Yours" is always "–" (a gap is a search the
  website doesn't rank for at all) and its "Where it is above you" is
  Websites' own comparison on the tracked searches; Google's results keep
  the newest check only and the ordinary results only.
- **Not yet done:** the first lookup on dev waits for his go — the agent has
  to be created from its template, in Test mode (DataForSEO's free sandbox),
  then Live when he says.
- **Also changed on the way:** the DataForSEO call ledger moved out of
  `schema.ts` into `seoPullSchema.ts` (unchanged), bringing that file back
  inside its size band; the personal-data manifest reads both new schema
  files and keeps a company's lookups and lists on a person's erasure,
  without their name.

## Change log

- 2026-10-04 — planned from the canvas, with the real costs; his decisions
  1–4 the same day ("A new Keyword research agent", "Anyone who can edit",
  "100 each", "30 days").
- 2026-10-04 — all five steps built, on dev; the first lookup waits for his go.
