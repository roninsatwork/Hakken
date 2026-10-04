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

DataForSEO's published prices, checked on 2026-10-04 and matching dev's real
charges: DataForSEO Labs 1.2 cents a call and 0.012 cents a row; a live
Google results page 0.2 cents, each further page of ten 0.15 cents (so the
top 100 is 1.55 cents); Backlinks 2.4 cents a call and 0.0036 cents a row;
LLM Mentions 10 cents a call and a tenth of a cent a row; the four
assistants' answers as dev's collections have been charged on average,
between 0.6 and 3.8 cents each, 7.4 cents together.

| When | Bought (each a live call) | About |
|---|---|---|
| Look up | Labs keyword overview (searches, CPC, difficulty, intent, the top ten's average linking websites); Labs historical searches (24 months); Google's top 100 (live SERP, depth 100); the top ten's visits and keywords (Labs bulk traffic estimation, one call for all ten) | 5 cents (1.2 + 1.2 + 1.55 + 1.3) |
| Google's results opened | Each top-ten page's strength (`bulk_ranks`) and linking websites (`bulk_referring_domains`), 2.4 cents each for all ten; what each page ranks for (Labs ranked keywords, one call a page, 10 rows each) — its top keyword, and the "also rank for" ideas | 18 cents (2.4 + 2.4 + 10 × 1.3) |
| Ideas opened | Terms match and questions (Labs keyword suggestions, the second with a question filter), the limit's number of each; "also rank for" comes with Google's results | 5 cents at 100 of each (2 × (1.2 + 100 × 0.012)) |
| What the AI says opened | Our AI writes the question (a fraction of a cent); four assistants answer (7.4 cents together, as charged on dev); Google's AI Overview searches (10 cents a call and a tenth of a cent a search: 12.5 cents at 25) | 20 cents |
| Another country picked | Labs keyword overview for that country | 1 cent |
| Start from a competitor | Nothing: Content gap's copy, from what Websites holds | free |

So a keyword looked up and opened on every screen costs about 48 cents at
100 ideas of each kind and 25 AI Overview searches; one only looked up, about
5. Corrected 2026-10-04 against DataForSEO's published prices: Ideas had
been put at 2 cents and Google's results at 15.

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
- **Always real figures.** The agent has no Test mode (removed 2026-10-04,
  below). Only the platform's own switch, `DATAFORSEO_SANDBOX=1`, points
  every DataForSEO call at the free sandbox.

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
  website it is measured against (or none), who and when, each part's state
  (waiting, ready, failed), and what the company has spent on it (its share
  of each call bought for it — the header's cost).
- `researchJobs` — each part of a lookup a run was started to buy (the
  overview, another country, Google's results, ideas, what the AI says). A
  run buys for its own jobs and settles only them, so two parts opened close
  together are each bought by their own run, and a part asked for again
  belongs to the newer run.
- `researchLists` and `researchListKeywords` — a list's name, the website it
  is measured against, and its keywords.

**The agent** — role `KEYWORD_RESEARCH` (Admin → Agents, from its template,
like the other DataForSEO agents). Look up writes the lookups and starts a run
at once; the run buys what is missing, files it, and writes each call's cost
and a line on its own run, in Observability, and on the company's DataForSEO
spend (`seoDataPulls`, the day roll-ups), so Cost to serve counts it. It
always buys real figures. Its per-run spend limit is the agent's own
(agent-cost-control-is-enough).

**Spend.** Each call checks the run's spend before it is sent. Calls go a
few at a time (five keywords at once, the ten pages of Google's results at
once, the four assistants at once), so a run can pass its limit by the calls
already on their way: at most four keywords' worth of one kind of call, or
about 7 to 15 cents on What the AI says.

**Time.** Convex stops any one step after ten minutes. A run buys for about
six, then carries on in a fresh part of the same run, which reads again what
is still missing — nothing is bought twice. A run that has done nothing for
ten minutes counts as stopped, and Look up again can start another.

**Ready means bought.** A part is ready only when what it waited for is held
and fresh (bought within the company's days, or — for Look up again and Ask
again — since that run started). An older copy never stands in for a
purchase that failed.

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
- **Worth a new page**: no page ranks, and the website is at least as strong
  as the top ten's websites on average — its domain's strength against
  theirs, both 0 to 100 (DataForSEO's domain rank ÷ 10: the website's from
  Websites, the top ten's from the overview's `avg_backlinks_info.main_domain_rank`).
- **Too hard for now**: no page ranks, and it is not.

Until 2026-10-04's review it compared the website's linking websites with
half the top ten's — but the overview's figure is the top ten *pages'*
linking websites, and the website's is the whole *domain's*, so a website
with many links read as "worth a new page" for almost anything. Strength
against strength is like for like.

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
  and Cost to serve. 19 tests (`convex/keywordResearch.test.ts`), the
  readers' (`keywordResearchCalls.test.ts`) and the costs'
  (`keywordResearchPrices.test.ts`).
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
  of each kind; a run buys five keywords at once and carries on after about
  six minutes, at most six times.
- **Costs on screen** come from one price list (`convex/keywordResearchPrices.ts`,
  DataForSEO's published prices and the company's limits), never a figure in
  the words: Look up, Look up again, opening a keyword, Google's results
  ("See all ten", on hover), Keyword ideas (with the top ten in full when not
  yet held), What the AI says and another country.
- **Where the screens differ from the drawings, and why:** headings sort and
  footers are numbered (Discovery's table rules); figures and labels use the
  kit's parts (no white dropdown, no coloured "You"); costs read as the real
  calls cost; "Businesses named" are websites a company has named on Hakken;
  Start from a competitor's "Yours" is always "–" (a gap is a search the
  website doesn't rank for at all) and its "Where it is above you" is
  Websites' own comparison on the tracked searches; Google's results keep
  the newest check only and the ordinary results only.
- **The agent** was created on dev by him, 2026-10-04 ("Keyword Research
  Agent", role Keyword research).
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
- 2026-10-04 — checked again, on his "Can you double check your work": the
  costs against DataForSEO's published prices (ideas 5 cents, not 2 or 4;
  Google's results 18, not 15), and twelve faults found by a second reading
  of the code, all fixed — ticking a row no longer looks it up; sample
  details never land on real results; the sandbox's calls cost $0; each part
  is a job of its own run (`researchJobs`), so parts opened together are all
  bought; long runs carry on rather than stop at ten minutes; a part is
  ready only on what was bought for it; Track reads the tracked list once;
  "Worth a new page" compares strength with strength (above); the header's
  cost is the lookup's own; another country buys its overview alone (no 24
  months); a raised ideas limit buys "also rank for" again; and the
  website's positions show only for the country it is watched from.
- 2026-10-04 — **Test mode removed.** I had given the agent a Test mode,
  DataForSEO's free sandbox, as its default; he never asked for it ("who
  asked for test mode"). The sandbox answers every keyword with the same
  example, so his first lookup, "web designers surrey", showed pizza
  restaurants. The agent now always buys real figures. Sample figures never
  count as held, so Look up again replaces them with real ones.
