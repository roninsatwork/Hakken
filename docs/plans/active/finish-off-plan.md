# Finishing off — everything outstanding, 2026-10-05

One list of everything left from the usage credits and collection work of
2026-10-05, in the order to do it, with the days each takes. Anthony: "I think
we need one single plan to finish it all off … with everything outstanding and
man days so we can work through."

Built and saved locally on `dev` today, not pushed: usage credits steps 1, 2,
3 and 6 with UK time (`usage-credits-plan.md`), and collection progress — the
continuous sender, five AI questions at once, $3 a website and $100 a day, and
Collecting now (`collection-progress-plan.md`, commit `87373c41`).

**Status: written 2026-10-05; nothing in it started except item 1, part one.**

## The list

| # | What | Why | Days |
|---|---|---|---|
| **Search Console** | | | |
| 1 | **Big websites' figures** — read stored days a page at a time (built, not saved), then find why morehandles.co.uk's rebuild still failed after five minutes, and if it is memory or time, build each period one at a time | morehandles.co.uk's Search Console screens are blank: its 2.88 million rows were stored, but adding them up broke | 0.5–2 |
| 2 | **Store less, lose nothing** — A: each page address once, lines point to it; B: no country copy when that country is nearly all the traffic (the screen says "all countries"); C: image search kept weekly, not daily. D, days into weeks: **kept at 90 days, unchanged**. Today's stored data converted, not downloaded again | about 330 MB for morehandles.co.uk's 90 days, two thirds of it repeats; also what makes item 1 fragile | 2.5 |
| **Credits and real cost** | | | |
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

## Built — 2026-10-05 (local, on a branch for the lead to merge; not pushed)

### Item 3a — 10,000 credits a month, for now

- The platform's default is 10,000 credits a month (`DEFAULT_PLAN_CREDITS`,
  `convex/creditKinds.ts`). A company's month is its plan's own number, else
  the platform's.
- **Admin → Settings → Credit prices** has a **Credits a month** box beside
  "A credit covers", saved with the prices (`saveCreditPrices`, a whole number
  from 0 to 1,000,000, audited as `planCredits` like every other change). A
  change counts from the next month's grant; a month already given keeps what
  it was given. The approved outline
  (`docs/plans/assets/usage-credits/look/AdminCreditPrices.txt`) gained exactly
  one line for it, `field: Credits a month`, under the same settings card —
  the plan approved the box; nothing else on the screen moved.
- **October's 1,000 raised, once, by hand**:
  `creditCorrections:raisePlanCredits` (no arguments; pages itself). It first
  raises a platform setting still holding the old 1,000 to 10,000 (dev saved
  one beside "what a credit covers"), then raises every open plan batch of
  this month to what its company's plan gives now. Each raise is **its own
  line on the statement** — "October's plan credits raised · From 1,000 to
  10,000 a month", 9,000 in — so the balances before it stay true and the
  ones after it add up. Never lowers a batch; a second run finds nothing to do.

### Item 3 — credits count what came back

- **What came back is counted where the answer arrives**: the Collector
  counts each answer's rows as it keeps it (`rowsReturnedIn`,
  `convex/dataForSeoSlim.ts` — a list's rows, every one sent, including any
  left off the stored copy; a crawl's `pages_crawled`) and records it on the
  request (`seoDataPulls.rowsReturned`).
- **The rule** (`creditUnitsOfAnswer`, `convex/creditKinds.ts`): a list or
  batch counts the rows that came back, never more than it asked for; a crawl
  the pages it crawled; a single answer 1; an AI answer 1 whatever it says.
  Up front, before the answer, a single answer counts 1 and a list or crawl
  **0** — so a run in progress shows only what has come back.
- **Each plan line keeps what it put in its run** (`seoCycleLines.creditUnits`)
  and whether its run waits for it (`creditPending`); when its request is
  answered or fails, the run moves by the difference. A run whose collection
  finishes while a request another collection sent is still out **stays open
  until that answer comes** (`creditCharges.pendingLines`, `closeRunIfDone`),
  so it is charged once, on what came back; the hourly sweep gives up waiting
  after two days. A list's later pages, which have no plan line, now count for
  the run that bought them, rows and cost (`creditListPage`) — before, they
  counted nothing.
- **Decision — a correction is a line of its own, never a rewrite.** A charge
  counted again after it was charged (`recountCreditRun`) keeps its line as
  it was; the difference is a **"Counted again"** line — "Counted again: Site
  audit · corston.com · 1 page came back, not 1,000 · back to October's plan",
  19 in — with credits given back to the batches that paid (or this month's
  plan, where one has ended), or taken, if it came out higher, from the
  batches that end soonest. The month's rollup, every company's month, and
  the day the work was charged on move with it, so the Usage chart, Overview
  and Credit prices still add up. A refund after a recount gives back what the
  charge stands at.
- **The 5 October charges, counted again once, by hand**:
  `creditCorrections:recountCollectionCredits` (no arguments: from the start
  of this UK month; or `{"since": <ms>}`). Three passes, each paged and
  booking the next: what each kept answer brought back (four answers a
  transaction); every request's lines moved to what it counts now, later pages
  counted, requests outside a collection counted again; then each charged run
  that owes a difference counted again once, as above. Running it again
  changes nothing.
- Not counted again: a request still out when it runs (its answer counts it,
  as above), and keyword lookups (item 9 deals with those). A request shared
  with another company counts for that company only on its first page: a
  list's later pages count for the collection that bought them.

### Item 5 — a crawl's refund recorded

- When a finished crawl's summary is recorded (`settleSeoResult`), its cost
  comes down to the pages crawled at the price a page was charged — what was
  charged over `max_crawl_pages`, so $0.0015 a page for today's $1.50 crawls,
  and right whatever the price becomes (`crawlRefundUsd`,
  `convex/seoCrawlRefund.ts`). The reduction is carried through everything
  that holds the cost: the request's `costUsd` (and `refundedUsd`, so it is
  done once), the collection's `totalCostUsd`, the day's `seoDayRollups`
  (platform and company, on the day it was refunded), the website's spend in
  that collection (`seoCycleSpend`, which the $3 limit reads), the running
  price of a crawl (`seoOperationCosts`), the Collector run that sent it (its
  `costUsd`, which the $100 a day reads, and a cost record of the refund
  beside the call's), and the credit charge's `realCostUsd` with its month's
  and every company's month's real cost. A request now records the Collector
  run that sent it (`sentByRunId`).
- **Crawls already filed** are corrected by the item 3 recount
  (`creditCorrections:recountCollectionCredits`, pass 2) — everywhere above
  except the Collector run's cost, because a crawl sent before this change
  never recorded which run sent it. Today's day ceiling therefore still counts
  the full $1.50 for crawls sent before the deploy; that resets at midnight.

### Item 9 — a keyword lookup that buys nothing is not charged

- A lookup is still charged by the keyword when it starts (so, once charging
  is switched on, one is refused at zero before anything is bought). When its
  jobs settle (`settleLookups`, `convex/keywordResearchRun.ts`), it is
  counted again (`creditResearchSettled`): a keyword for which nothing came
  back — every part failed or brought nothing — is not charged, and a lookup
  for which nothing came back at all is given back whole. The statement shows
  it as a line of its own: "Counted again: Keyword research · “web design
  leeds” · Nothing came back, so nothing is charged · back to October's plan".
  A lookup whose parts were already held and fresh is still charged in full:
  its figures came back, from what another lookup bought (decision 8).
- Decided: per keyword, not only all-or-nothing, since a three-keyword lookup
  where one keyword fails has bought nothing for that keyword. Lookups made
  before this change are not counted again.

### Item 10 — the Statement reads past 900 lines in a month

- **A page at a time, never the whole month.** `usageStatement` is a paged
  query (`convex/creditUsage.ts`): the Statement, By work and By website ask
  for 15 lines at a time through the house pager (`useServerPagedTable`,
  extended with `fill` so a page narrowed as it is read keeps reading until it
  is full) and the kit's paged footer. One kind's or one website's lines are
  read by their own index (`by_company_kind_at`, `by_company_website_at`); a
  person or a search narrows each page as it is read, 200 lines a read at most.
- **Figures without reading lines** (`usageStatementTotals`): the opening
  balance and the balance now are the balances on the lines either side of the
  month; In is the month's plan credits and anything bought; Out is what
  opened and came in less what is left, split into ended unused (the batches
  that ended in the month) and used — so "used" is after anything given back,
  and the figure says so. By work's and By website's figures come from the
  month's rollups, which now keep who started work by hand (`byHandUsers`,
  for "Started by 2 people"); the recount's last pass fills it in for charges
  made before (`creditCorrections:recountCollectionCredits`).
- **Changed on the screens** (no kit part or heading added or removed; the
  approved outlines are unchanged): the table sorts by Date only, either way
  — User and Out sorted only the lines on screen, which the table rules do not
  allow, and a month cannot be ordered by them on the server without more
  indexes; the User filter lists the company's people; the count in the bar
  says "so far: more on the pages after" while more pages are to come; the
  opening balance opens the first page and the balance now closes the last;
  the CSV reads every page in turn (up to 50,000 lines). The "more lines than
  one page can hold" warning is gone.

### Item 4 — Usage shows credits while a collection runs

- A run still open — a collection under way — is **being counted**: what has
  come back so far at its price (item 3 counts lists and crawls only as their
  answers arrive, so this is never what was merely asked for). Read by
  company (`creditCharges.by_company_state_at`, `runsBeingCounted`,
  `convex/creditUsage.ts`); not taken from any batch until the run closes.
- **Overview**: "Used this month" counts it in and says "Includes 728 being
  counted" under its meter; "Plan credits left" and "Left on …" take it off;
  today on the chart includes it; "Where they went" says "…, 728 of them still
  being counted"; each website and each check counts it in its Credits, with
  "728 being counted" beneath the figure, and both tables' bars add "includes
  728 being counted". A kind or website with nothing charged yet but a run
  under way now appears (Period House Group's empty Usage). "Each" stays what
  a finished run took.
- **Statement, By work, By website**: a run being counted is a line in date
  order — "Site audit · corston.com · being counted, 1 page so far", its
  credits so far in Out and no balance, since nothing has been taken; "Balance
  now" says "…; 7 more being counted". By work's and By website's "Credits
  this month" count it in and say so.
- No kit part, heading or title changed: the approved outlines stand
  (`usageLook.test.tsx`).

### Item 8 — Usage Overview's two tables sort by their headings

- "Credits by website" and "What ran this month" sort by every heading
  through the Sites tables' own hook (`useSiteSortedList`, the rule in
  `convex/utils/sortOrder.ts`): the first press best first — a figure the
  most first, a name A to Z, How often the most often first — again for the
  other way, over the whole list before it is paged, blanks last either way.
  Work tied to no website stays after every website whichever way. Each opens
  on Credits, the most first, as before; the order is kept in the address
  (`websites.sort`, `checks.sort`), so the two tables keep theirs apart.
