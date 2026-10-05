# Finishing off — everything outstanding, 2026-10-05

One list of everything left from the usage credits and collection work of
2026-10-05, in the order to do it, with the days each takes. Anthony: "I think
we need one single plan to finish it all off … with everything outstanding and
man days so we can work through."

Built and saved locally on `dev` today, not pushed: usage credits steps 1, 2,
3 and 6 with UK time (`usage-credits-plan.md`), and collection progress — the
continuous sender, five AI questions at once, $3 a website and $100 a day, and
Collecting now (`collection-progress-plan.md`, commit `87373c41`).

**Status, 2026-10-05 evening — built and saved locally on `dev`, not pushed:**
items 1, 2 and 13. Item 2's change to the figures already kept is one script,
run on each deployment — counted first (`go: false`), then done (`go: true`):
`npx convex run searchConsoleTidy:tidyKeptFigures '{"go": false}'`. It removes
the copies of a country nearly all of a website's searches, turns every page
address kept into a reference, rolls image search's past days into their
weeks, and builds each website's periods again; it is also item 12's Search
Console part.

## The list

| # | What | Why | Days |
|---|---|---|---|
| **Search Console** | | | |
| 1 | **Big websites' figures** — read stored days a page at a time (built, not saved), then find why morehandles.co.uk's rebuild still failed after five minutes, and if it is memory or time, build each period one at a time | morehandles.co.uk's Search Console screens are blank: its 2.88 million rows were stored, but adding them up broke | 0.5–2 |
| 2 | **Store less, lose nothing** — A: each page address once, lines point to it; B: no country copy when that country is nearly all the traffic (the screen says "all countries"); C: image search kept weekly, not daily. D, days into weeks: **kept at 90 days, unchanged**. Today's stored data converted, not downloaded again | about 330 MB for morehandles.co.uk's 90 days, two thirds of it repeats; also what makes item 1 fragile | 2.5 |
| **Credits and real cost** | | | |
| 2E | **Twelve months kept once while it is the 90 days** (agreed 2026-10-05: "yes please") — a website holding no more than 90 days has the same days in both, so twelve months' lists were the 90 days' again: 138 MB of morehandles.co.uk's 453 MB of ready-made periods. Its slot now keeps one empty part saying its days, and the screens read the 90 days | measured on dev after item 2: 608 MB, the periods untouched | 0.5 |
| 3 | **Credits count what came back**, not what was asked for — rows returned, pages crawled — and today's charges counted again | Conterra Ops showed 602 credits for $13 of work; conterraops.com alone 86 for $1.73, because each list was counted as 1,000 rows and each crawl as 1,000 pages | 1 |
| 3a | **10,000 credits a month, for now** (Anthony, 2026-10-05: "make the credits default 10,000 credits per month for the moment") — the platform default raised from 1,000; a "Credits a month" box on Admin → Settings → Credit prices so it can be changed there; and October's plan credits raised to 10,000 for the companies already given 1,000 | a company's monthly credits are its plan's own figure, else the platform default — no plan has one and neither has a box today; October's 1,000 is already granted to Conterra Ops and Period House Group, so the default alone would only show from November | 0.25 |
| 4 | **Usage shows credits while a collection runs**, as "being counted", not nothing until it closes | Period House Group's Usage is empty: its collection waits on one site crawl (corston.com, out since 15:44) | 1 |
| 5 | **A crawl's refund recorded** — DataForSEO takes $1.50 for 1,000 pages and refunds the pages not crawled; record pages crawled × $0.0015 once it finishes | our records say $21 for today's 14 crawls; they really cost about $5.21 | 0.5 |
| **Site crawls** | | | |
| 6 | **Competitors are not crawled** (decided 2026-10-05), and a company's own sites **once every 30 days whatever starts it**, Collect now included. A competitor's Site audit says it is not crawled | Anthony: "we don't need these for competitors — we are benchmarking traffic, keywords, AI search, pages etc for competitors". Those come from other requests; the crawl feeds only a company's own sites' Site audit, page list and AI search checks, each already off for competitors. Today about $5.19 of the $5.21 the crawls really cost was competitors | 0.75 |
| 6a | **Nothing bought again while it is fresh** — Collect now, and a monthly run soon after one, reuse what was bought in the last days rather than buying it all again (agreed 2026-10-05) | a monthly company's run buys everything; Collect now pressed twice in a day buys it twice (about $31 for today's two), and 15 October would buy again what 5 October bought | 0.5 |
| 6b | **Competitors: only what benchmarking needs** (agreed 2026-10-05) — links: the summary and the linking websites only (Anthony: "we don't need every backlink for a competitor, just the linking domains"); keywords: the top 1,000 ("happy with 1,000"); no "who competes with it" | each competitor had all 8 link requests a month, its keyword list bought page after page, and its own competitors asked for | 0.5 |
| 6c | **Less often where the data barely changes** (agreed 2026-10-05) — link lists (linking websites, every link, one per site, broken links, gained and lost) once a month, not weekly, for every website; competitors' keyword lists once a month, not every run; "its competitors" for a company's own site once a month. Unchanged: link totals and keyword totals every run (the trend charts' points), tracked keyword rankings and AI questions every run (they change constantly, and are the product) | measured on ronins.co.uk and four competitors since 1 September: linking websites move about 1–2% a week, links 1–3%, website strength about 0%, keyword counts 2–3%; estimated traffic jumps because it is an estimate. About $4 a month saved for a Weekly company with 7 competitors, a third of its bill, more for a Daily one | 0.5 |
| 7 | **Say when a crawl was turned away** — "crawled 1 page: the website probably blocked the crawler" — rather than an empty site audit | 7 of today's 14 crawls stopped at one page, morehandles.co.uk among them | 0.5 |
| **Loose ends from today** | | | |
| 8 | Usage Overview's two tables sort by their headings | the one Usage gap against the table rules | 0.5 |
| 9 | A keyword lookup that buys nothing is not charged | it is charged today | 0.25 |
| 10 | The Statement reads past 900 lines in a month | it stops at 900 today | 0.5 |
| 11 | The browser smoke tests, before any push | not run: they need port 3000, where the dev server runs | 0.1 |
| 12 | **Clear out what is no longer collected, across every website on the platform** (Anthony, 2026-10-05: every website, not only those added today) — a script, run once on dev and once on production: a count of what it would remove first, then the removal in small pages. Competitors' crawls and their pages; competitors' link lists other than linking websites; competitors' keyword pages past 1,000; competitors' "who competes with it"; Search Console's country copies no longer kept; image search's days once kept weekly. Never a website a company owns, even where another company tracks it | Anthony: "we need to clean out the database too for all the things we are stopping collecting, and that will need a script" | 1 |
| **Found missing, 2026-10-05** | | | |
| 13 | **Tell someone when it stops for a person** — a notification to super admins (the bell, and email) when the Collector stops at the day's ceiling or DataForSEO refuses the account, saying what to do | "Needs you" shows only on Collection pipeline; reached at night, nobody sees it until morning | 0.5 |
| 14 | **Competitors' screens say what is not collected** — the link tabs no longer bought for a competitor (every link, broken links, gained and lost, link words, linking servers) say so, and its keyword list says "top 1,000" | after 6b and 6c those tabs would sit empty, or show months-old figures, with no reason given | 0.5 |
| 15 | **Cost forecasts follow the new rules** — a company's Runs and cost estimate (`seoRunEstimate.ts`) and Usage's Coming up | both forecast from today's rules: weekly link lists, competitors' full link lists and crawls; they would overstate every company's cost | 0.5 |
| 16 | **Release** — push to `dev` (GitHub's check), then a pull request to `main` and the deploy, each on your word; then on production: the Collector's $3 and $100, 10,000 credits a month, the clear-out script (item 12), and every website's Search Console figures rebuilt | production has none of today's work, and its Collector reads its old $15 as a limit per website | 0.5 |
| | **Total** | | **12.85–14.35** |

## Your decisions — no building days

- **Conterra Ops' setup** — it has no AI questions and no tracked keywords, so
  its AI mentions are blank; and the countries its Search Console keeps ready
  are Iraq and Yemen, which looks like a market set by mistake.
- **When to push** — item 16, on your word each time.
- **Credit prices, after item 3** — once credits count what came back, look
  over Admin → Settings → Credit prices: each line's suggested price is worked
  out from its real cost, and some will want to change.
- **Keep only a website's top searches from Search Console?** (asked
  2026-10-05; Anthony: "not sure on this" — nothing built.) Measured on dev
  (`searchConsoleTidy:keptSize`, `searchCapEstimate`): morehandles.co.uk's
  Search Console takes **830 MB** — the ready-made period lists 453 MB, the
  kept search-and-page lines 143 MB for all countries and 126 MB for the UK,
  image search 47 MB, the first- and last-seen register 60 MB. Its last 90
  days hold 64,360 searches and 926,800 lines; only 3,224 searches (5%) were
  ever clicked. Top 1,000: 71% of clicks, 31% of showings, 10% of lines
  (~130 MB). Top 2,000: 84%, 40%, 18% (~190 MB). Every clicked search: 100%
  of clicks, ~20% of lines (~200 MB). Top 5,000: 100%, 64%, 40% (~360 MB).
  The website's and each page's totals stay exact whatever is chosen. About
  1.5 days, plus converting what is kept. The UK is 78% of morehandles.co.uk's
  showings and 73% of ronins.co.uk's — under item 2B's 90% — so no country
  copy is removed on dev today.
- **Parked until the cost audit** — usage credits steps 4 (Purchases, Top up,
  Stripe; about 3 days) and 5 (switching charging on; about 1.5 days), and
  counting other agents' model costs (about 1 day).

## Order

Items 1 and 2 first, together — the screens are blank until they are done,
and item 2 changes what item 1 reads. Then 3 to 5, so the cost audit reads true
figures; then 6 to 7; then the clear-out (12), once nothing collects what it
removes; then the loose ends. One commit per item, the full check
before each, nothing pushed without your word.

## What we buy from DataForSEO, and how often — 2026-10-05

Read from `convex/dataForSeoRegistry.ts` and the collection's planning
(`seoCollection.ts`, `heldByOwnCadence`). A company's cadence is set on its
Schedules page. Each request has its own pace too: one with none comes every
run; a weekly or monthly one comes at the run nearest its own pace, never
faster. "Competitors after" is what was agreed today (items 6 and 6b).

| What | Request | Daily company | Weekly | Fortnightly | Monthly | Competitors after |
|---|---|---|---|---|---|---|
| **For each website — its own, and each competitor** | | | | | | |
| What it ranks for (totals) | `domain_ranked_keywords` | daily | weekly | fortnightly | monthly | same |
| Every keyword it ranks for — the list, up to the company's limit | `domain_ranked_keywords_list` | weekly (its first page daily, for the everyday keywords) | weekly | fortnightly | monthly | top 1,000 only |
| Who competes with it | `domain_competitors` | daily | weekly | fortnightly | monthly | not asked |
| Who links to it — the link totals | `backlinks_summary` | daily | weekly | fortnightly | monthly | same |
| Every linking website — the referring domains | `referring_domains_list` | weekly | weekly | fortnightly | monthly | same |
| Every link to it | `backlinks_all` | weekly | weekly | fortnightly | monthly | not bought |
| Every site linking to it (one link each) | `backlinks_list` | weekly | weekly | fortnightly | monthly | not bought |
| Links to its broken pages | `backlinks_broken` | weekly | weekly | fortnightly | monthly | not bought |
| Links gained and lost | `backlinks_new_lost` | weekly | weekly | fortnightly | monthly | not bought |
| The words links use | `anchors_list` | monthly | monthly | monthly | monthly | not bought |
| The servers links come from | `referring_ips_list` | monthly | monthly | monthly | monthly | not bought |
| A crawl of its pages (Site audit) | `site_crawl` | monthly | monthly | monthly | monthly | not crawled |
| **For the company's own lists — its own website only** | | | | | | |
| Google's results for each tracked keyword | `serp_google_organic` | daily | weekly | fortnightly | monthly | — (a competitor's position comes from the same page) |
| Each AI question, asked of ChatGPT, Claude, Gemini and Perplexity | `ai_citation_*` | daily | weekly | fortnightly | monthly | — (a competitor is found named in the answers) |
| What Google's AI Overviews searched for each question | `ai_overview_fan_out` | monthly | monthly | monthly | monthly | — |
| How often those searches are made | `keyword_search_volume` | when new ones appear | | | | — |
| **By hand only, never on a schedule** | | | | | | |
| A keyword looked up in Keyword research | Keyword research agent | each lookup | | | | — |
| Link counts for many websites at once | `bulk_*` | when an agent asks | | | | — |

Collect now buys everything a run would, whatever its cadence says is due —
until item 6a, which keeps what is fresh. Item 6c makes the link lists, the
competitors' keyword lists and "its competitors" monthly whatever the schedule;
the table above is how it stands before it.
