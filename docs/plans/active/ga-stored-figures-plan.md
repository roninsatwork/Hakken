# Google Analytics — store the figures, stop asking Google from the screens

**Planned 2026-10-14. Status: phases 1 to 3 built 2026-10-14, local on
`dev`, not committed; ronins.co.uk filled on Anthony's go (see "Built").
Phase 4 — every run inside Google's limits, collected overnight (§2c) —
added on Anthony's word the same day, his go given (§7), built 2026-10-14
with nothing asked of Google; tested together on real websites only on his
go.**
Anthony, 2026-10-14, after the Channels rebuild: "the pages were so slow,
when the date range changes" — "why do we not store it, as calling Google
won't scale because of rate limits". Then: "go" to writing this plan. The
build waits for his "start".

## Why

**What a screen does today when it lacks a figure.** Hakken keeps most of a
website's Google Analytics, but not all of it. What it does not keep, a
screen asks Google for the moment someone opens it, waits for the answer,
then keeps that answer until the next collection run (the next morning).
So every day, the first person to open each of those screens waits on
Google again.

**Measured on ronins.co.uk, 2026-10-14** (dev, pages already compiled):

| Changing the dates | Google's answer not kept yet | Kept |
|---|---|---|
| A channel's own page, to 90 days | 2.9 s | 0.5 s |
| A channel's own page, to 12 months | 4.7–4.9 s | 0.6 s |
| Channels, All pages, Landing pages | 0.9–1.0 s | 0.2–0.6 s |

**Why it won't scale.** Google gives Hakken, as one app, **14,000 "tokens"
an hour for each website's Analytics**, shared by every person and every
screen using that website (Google's published limits for standard
properties: 14,000 per project per property per hour, 40,000 per property
per hour, 200,000 a day, 10 asks at once, and 120 asks an hour that may be
thresholded, such as age and gender). A collection run spends a small share
of that once a day. Screens that ask Google spend it again for every
website, every day, every time someone looks — more people and more
websites means more waiting, then refusals.

**The rule this plan sets: a screen never asks Google.** Everything a screen
shows is stored by the collection run, which spends Google's allowance once
a day per website, on a schedule. The same rule Search Console already
follows ("ready-made periods never go to Google", search-console-plan.md
§17). Two things stay with Google, because they cannot be stored ahead
(SF8): **Live** (the last 30 minutes, as they happen) and an event's
**"people who converted after it"**.

## 1. What is asked of Google today, and what replaces it

| Screen and when | Asked of Google today | Stored instead | Phase |
|---|---|---|---|
| Channels' chart, every channel's page, AI assistants — 90 days or 12 months | Each channel a day, now and the span before | Each channel and source a day for two years, every device and each | 1 |
| Landing pages, All pages, Events, Campaigns, Visitors, Products — one device chosen | The whole list for that device | Each list for Desktop, Mobile and Tablet too | 2a |
| The same pages' charts — one device | Events, campaigns, visitors and products a day | Those charts for each device too | 2b |
| A landing page's own screen; a page's own screen from All pages; a page ticked on All pages' chart | The page's visits or views a day, its channels, where its visits came from | Each page a day (SF5, size decided first) | 2c |
| An event's own screen | Its details (files, videos, links) and the pages it happened on, now and before | Each event's details and pages for each period | 2d |
| Any of the above for another home country | As above, for that country | The same stores for each extra country | 2e |
| Live | The last 30 minutes | Stays with Google (SF8) | — |
| An event's "people who converted after it" | A funnel between that event and the conversions | Stays with Google, kept a week (SF8) | — |

## 2. Decisions

- **SF1 — A screen never asks Google.** Every figure a screen draws is read
  from what the collection stored. The live-ask code is removed screen by
  screen as each store lands; a guard test fails a screen that asks Google
  for anything but Live and the event funnel (phase 3).
- **SF2 — Channels over time, as the other sections keep it** (Anthony,
  2026-10-14: "90 days same as other sections, then weekly then monthly"):
  each channel and source **a day for 90 days, a week to 12 months, a month
  to two years, nothing older than two years** — keep-less-history-plan.md's
  Decision 1, which keyword positions follow. A week or a month holds the
  sum of its days. Every device and each device, in the day records that hold
  60 days today (`googleAnalyticsDays`), with weeks and months beside them.
  Every date range, step and device on Channels, a channel's page and AI
  assistants reads them. Filled once from Google's history (SF9); each run
  adds the new days and fetches the last three again while Google settles
  them, as today, and rolls a day past 90 into its week and a week past 12
  months into its month.
- **SF2b — How a chart reads the coarser past.** Each point is drawn at the
  finest grain kept for its date, as Search Console's charts draw weeks into
  months (`WEEKS_KEPT_DAYS`): Daily over 12 months draws the last 90 days by
  day and the rest by week. The grey "span before" line on 90 days Daily falls
  on days 91 to 180, kept by week: it steps by week, each week's daily
  average, and its hover says so.
- **SF3 — Lists for each device.** Landing pages, All pages, Events,
  Campaigns, Ad keywords, Visitors' six lists and Products are stored for
  Desktop, Mobile and Tablet as well as every device, for each period, as the
  channels already are. Asked in the same requests as today, split by device,
  so the run makes no more requests — it stores more rows.
- **SF4 — Charts for each device.** Events, campaigns, new and returning
  people, and products a day, stored for each device as for every device.
- **SF5 — A page's own figures, the same shape** (Anthony: "same as 1"):
  each page's visits and views a day for 90 days, a week to 12 months, a
  month to two years, nothing older; every device and each device; only a
  page with visits or views that day, week or month is a row. Its channels
  and where its visits came from are stored for each period.
- **SF5b — A page's story, for the 500 busiest pages** (Anthony, 2026-10-14,
  Q5: "busiest 500 pages"). A page's own screen also asks Google for its
  story: about 13 lists (where its visits came from and the pages they saw,
  returning visitors, reading, the next page, devices, weekdays, countries,
  age, gender, conversions by age and gender, links clicked). Stored for every
  page that would be millions of lists a run on a big website, so the
  collection stores the story of the website's **500 busiest pages** by views,
  each date range and device, asking each list once for all 500 pages
  together. Any other page's story is asked of Google once when its screen
  opens and **kept a week**, not a day.
- **SF6 — An event's own figures.** Each event's details and the pages it
  happened on, for each period, now and the span before.
- **SF7 — Other home countries.** Each extra home country a website keeps
  (search-console-plan.md §16) gets the same stores as the main one.
- **SF8 — What stays with Google.** Live, asked once a minute while its page
  is open and in front, as built. And an event's "people who converted after
  it", a funnel Google works out per pair of events: **kept a week**, not a
  day (Anthony: "week").
- **SF9 — The first fill waits for Anthony's go.** Building and testing use
  the fake Google; the one-off fill of two years of history on a real website
  runs only when Anthony says, website by website (as Search Console's
  backfill waited for him). It costs nothing but Google's allowance.
- **SF10 — Every new store on the keep list.** Each store goes on the list of
  tables that grow, with its keep rule and the job that keeps to it
  (keep-less-history-plan.md part 4), so the test that fails an unlisted
  growing table holds these too.
- **SF11 — Google Analytics now keeps its own history.** This reverses, for
  Google Analytics only, keep-less-history-plan.md's rule 2 ("do not keep a
  copy of what the source keeps for us … old detail is asked for when someone
  opens it"), for Anthony's reason: asking Google per look does not scale.
  Search Console still asks Google for its 90 days and 12 months; whether it
  should follow is a question of its own, not part of this plan.

## 2b. Normalised across the section (Anthony, 2026-10-14)

Anthony, on the 500 busiest pages' stories: "surely we can data normalise a
lot of this stuff — and we don't need to store this so precisely that it's
not reusable"; then "yes please and normalise across all of the google
analytics section to make it more efficient". SF5b is replaced by SF12–SF16.

**Measured on ronins.co.uk, 2026-10-14.** Of the ready-made lists, 48% is
day-by-day figures stored four times over — once for each of the 7 days, 30
days, 90 days and 12 months, each again for the span before and a year
before (`series`, `eventSeries`, `visitorSeries`, `campaignSeries`) — and
12% is landing pages by channel, which a shared list below makes unneeded.

- **SF12 — Each fact stored once, at the grain it happens.** What happens a
  day is stored a day, then a week, then a month (SF2's rule), and any date
  range, its span before and its year before are added up from it when read.
  The website's totals, the channels (built), each page (built), each event,
  each campaign, new and returning people, and each product, by device. The
  four-times-over day lists go.
- **SF13 — What a day cannot give is stored once per date range**: the lists
  whose figure is counted people (who can't be added up across days), and
  every page against another thing (too many rows a day). Each such list is
  one plain fact keyed by page or by event, sorted by it, so a screen reads
  only its own rows:
  - **Landing page × source × new or returning**, with each key event and
    reading: a landing page's channels, sources and returning visitors; the
    landing pages by channel and by AI assistant (which go); Channels' map.
  - **Page × the page before**: where a page's views came from, and — read the
    other way — the page viewed after it.
  - **Page × event**: reading (scrolls), links and downloads clicked, every
    page group's reading; and, by event, the pages it happened on.
  - **Page × country**, **page × age**, **page × gender**: who reads it.
  - **Landing page × page seen**: the different pages a visit saw.
- **SF14 — Not stored so precisely that it can't be reused** (Anthony): each
  shared list keeps a page's (or an event's) **top 20 rows**, the rest added
  into one "other" row; and a week's or month's people are its days' people
  added up — a person on two days counted twice — said in the chart's hover.
- **SF15 — A page's screen never asks Google**, for any page (replaces the
  500 busiest of SF5b). An event's screen the same, but its funnel (SF8).
- **SF16 — Every screen and Ask Hakken read the same rows.** The page story,
  a landing page's channels, a channel's landing pages, Channels' map and the
  event screen are worked out from SF12–SF13 when read, so each figure has
  one source.

## 2c. Inside Google's limits, collected overnight (Anthony, 2026-10-14)

**What happened.** On 2026-10-14 I started three collections of
ronins.co.uk by hand (10:33, 10:38, 10:52), on top of that morning's
fills, to build the new 90-day and 12-month lists sooner. I didn't have
Anthony's go and didn't count the asks. The second run was refused by
Google: "Exhausted potentially thresholded requests quota. This quota will
refresh in under an hour." Nothing was lost or charged, and the third run
was stopped. Anthony: "we know the quotas and we need to respect them",
then "so we can collect the data over a number of hours over night", and
"I want it added to the current plan".

**Google's limits, per website** (each Google Analytics property, as Google
lists them; checked again against Google's quota page before building):

| Limit | Allowance | Shared with |
|---|---|---|
| Asks that include age, gender or interests | 120 an hour | every tool reading the property |
| Tokens (Google's cost of each ask) | 14,000 an hour | ours alone (per project and property) |
| Tokens | 40,000 an hour, 200,000 a day | every tool reading the property, Looker Studio among them |
| Asks at the same moment | 10 | every tool |

Each website has its own allowance, so more websites don't use up each
other's: the collector already starts every website's run together, 5
seconds apart. The one thing all websites share is Hakken's Google Cloud
project, which may also cap requests a minute (checked once, reading only,
before many clients are connected).

**Measured.** A daily run makes about 72 asks that include age, gender or
interests; a weekly run about 168 — Visitors' age, gender and interests for
every device and each (120) and each page's readers by age and gender (48,
added by N2). So every weekly run goes over the 120 an hour as built.
ronins.co.uk costs about one token an ask; a big website costs more, not
yet measured.

- **SF17 — A run stays inside Google's limits, and never meets them.** Each
  website's run keeps to a budget each hour, below Google's allowance, so
  room is left for the event funnel and for any other tool reading the same
  property: a fifth of each kept in hand (AGENTS.md, "Respect Google's
  quotas") — at most 96 of the 120 age, gender and interest asks, and a
  fifth of the tokens this hour and today left (Q1).
- **SF18 — Google's own count, read on every answer.** Each ask asks Google
  to say what is left of the website's allowances (the Data API's
  `returnPropertyQuota`), so the run knows exactly where it stands — what
  other tools used included — and pauses until the hour turns before its
  budget runs out, rather than guessing.
- **SF19 — Collected overnight.** The daily lists first, in the first hour;
  the weekly lists spread over the hours after. Websites start at staggered
  times through a night window (Q2), so Hakken's Google Cloud project never
  sends everything at once. Figures are ready by morning; each run already
  fetches the last three days again, so nothing is lost by waiting.
- **SF20 — A refusal waits for the hour, never retried every ten minutes.**
  If Google still refuses (another tool used the property's allowance), the
  run pauses until the hour has turned, says so in its log, and carries on;
  it stops after the night window, and the next night asks again.
- **SF21 — No run asked of Google by hand without Anthony's go**, with what
  it will ask counted against these limits and said when the go is asked.
  Filling a new website's two years (phase 3) follows the same budget.

**This morning's changes, made without asking** (Anthony: "please stop
doing this alone and hiding things"):

1. A run that meets an hourly limit waits ten minutes and tries again, up
   to 70 minutes (`HOURLY_ALLOWANCE`, `googleAnalyticsAgentRun.ts`) — to be
   replaced by SF18 and SF20 (Q3).
2. A run cancelled in Admin stops at its next step (`runGoing`) — kept.
3. A change that made a run weekly-size when the shared lists' 90 days and
   12 months were missing — taken out again, so tonight's run is the daily
   one, about 72 such asks. Those lists come with the next weekly run
   (2026-10-20) unless Anthony says otherwise (Q4); until then a page's and
   an event's screens say "Still being collected…" for 90 days and 12
   months.

## 3. Sizes

Every limit here is a number in the code, said in the plan as it is built.

| Store | ronins.co.uk (measured) | A big website (estimate) |
|---|---|---|
| Channels over time (SF2): 90 days + about 39 weeks + 12 months = 141 records each for every device and three devices | 564 records, about 0.7 KB each: **under 0.5 MB** | 100 channel and source rows a record: about 10 KB each, **about 6 MB** |
| Lists for each device (SF3, SF4) | about 3 × today's 0.6 MB: **2 MB** | 10,000 pages × 3 devices × 4 periods × 3 spans: **about 60 MB** |
| A page's own figures (SF5), only pages with visits | 200 pages: **under 2 MB** | 2,000 pages a day, 5,000 a week, 8,000 a month: **about 40 MB** |
| An event's own figures (SF6) | under 1 MB | under 10 MB |

**Measured, 2026-10-14** (Google's own `propertyQuota`, ronins.co.uk): one
story list asked for every page at once costs about 1 token; a year of every
page a day, 8. A run storing the 500 busiest pages' stories asks about 128
lists a day and 128 more each week: a few hundred tokens on a small website,
far inside 14,000 an hour on a large one.

**Google's allowance.** A collection run asks for the same lists as today,
split by device in the same requests (SF3), plus the new days of the channel
and page stores. The one-off fill (SF9) asks two years in monthly pieces, a
few dozen requests per website. Both stay far inside 14,000 tokens an hour;
the plan's proof (phase 3) counts each run's requests on the fake Google and
fails the test if a run asks more than set.

## 4. Phases and size

Man-days, as a developer would take them. Each phase stops for Anthony's go.

| Phase | What it does | Man-days |
|---|---|---|
| 1 | **Channels over time (SF2, SF2b).** Days kept 90, weeks to 12 months, months to two years, rolled up each run; the fill in monthly pieces; Channels, a channel's page and AI assistants read them for any dates; the channel live asks removed; on the keep list (SF10). | 3 |
| 2a | **Lists for each device (SF3).** | 2 |
| 2b | **Charts for each device (SF4).** | 1.5 |
| 2c | **Each page over time (SF5)** and a landing page's channels by device — built. | 2 |
| N1 | **Each fact a day (SF12)**: the website's totals, events, campaigns, new and returning people, products — a day, week, month; every date range read from them; the four-times-over day lists gone. | 3 |
| N2 | **The shared lists (SF13, SF14)**: landing page × source, page × page before, page × event, page × country, age and gender, landing page × page seen; the page story, landing pages by channel and Channels' map worked out from them (SF16); a page's screen never asks Google (SF15). | 3 |
| N3 | **An event's own screen (SF6)** from page × event and each event's details; the funnel kept a week (SF8). | 1.5 |
| 2e | **Other home countries (SF7).** | 1 |
| 3 | **Proof and clearing out**: the old lists and live asks removed; the guard that no screen asks Google; requests counted per run; Ask Hakken reading the stores; timings again on ronins.co.uk; the full gate with GitHub's steps. | 2 |
| 4 | **Inside Google's limits, overnight (§2c)**: each run's hourly budget read from Google's own count (SF17, SF18); the daily lists first and the weekly spread over the night, websites staggered (SF19); a refusal waits for the hour (SF20), replacing this morning's ten-minute retry; the fills on the same budget; tests with a fake Google that counts its allowances; Hakken's Google Cloud project's own limits checked, reading only. | 2 |

**Total: about 21 man-days** with phase 4 (2), not started. Before it: phase 1 (3), 2a–2b (3.5) and 2c (2) built;
about 10.5 left. Normalising the section (§2b) took the place of the 500
busiest pages' stories and the separate event store, and adds the day facts
and the shared lists. Phase 1 alone fixes the
slowness measured above; 2a–2e remove the rest of the screens' asks.

## 5. Risks

- **Storage grows with the website.** The page store (SF5) is the biggest;
  storing only pages with visits, and weeks and months past 90 days, keeps a
  large website near 40 MB. Phase 2c measures it on the fake Google first.
- **The fill is a big first pull.** Two years in monthly pieces, run once per
  website, only on Anthony's go (SF9).
- **Google's figures settle for two days.** As today, each run fetches the
  last three days again, so stored figures match Google's.
- **Thresholded lists.** Age, gender and interests can be held back by
  Google for privacy; stored or asked, the screens say so, as now.
- **Google's hourly allowance for those asks** (found 2026-10-14, on
  ronins.co.uk's second run in an hour): 120 asks an hour per property may
  include age, gender or interests, and a weekly run makes about 168. Phase
  4 keeps every run inside the limits (§2c).
- **A very large website's tokens** are not measured yet: a weekly run on a
  big website could come near the 14,000 tokens an hour. SF18 reads Google's
  own count, so the run paces itself whatever the size; measured on a
  larger real client only on Anthony's go.

## 6. Questions — answered by Anthony, 2026-10-14

1. **How long to keep channels a day?** "90 days same as other sections,
   then weekly then monthly" — a day for 90 days, a week to 12 months, a month
   to two years, nothing older (SF2), as keep-less-history-plan.md's
   Decision 1.
2. **A page's own figures?** "Same as 1" (SF5).
3. **Lists for each device?** "Yea" — Desktop, Mobile and Tablet always (SF3).
4. **The event funnel?** "Week" — kept a week (SF8).
5. **A page's story (asked while building 2c, 2026-10-14)?** "Busiest 500
   pages" — the 500 busiest pages' stories stored; any other page's asked
   once and kept a week (SF5b).

## 7. Questions for phase 4 — for Anthony

**Answered 2026-10-14**: "ok do it but don't pull until the end of the build
again so we get to test everything at the end" — the plan as written (1
and 3 as proposed), and nothing asked of Google while it is built: no run
or fill by hand until the build ends, then everything tested together
(4: ronins.co.uk's longer lists come with that test).

1. **The hourly budget**: at most 100 of the 120 age, gender and interest
   asks, and 12,000 of the 14,000 tokens — or another margin?
2. **The night window**: 00:30 to 05:00 in each website's own time zone, its
   websites' start times spread across it?
3. **This morning's ten-minute retry** (§2c, change 1): taken out now, or
   left until phase 4 replaces it?
4. **ronins.co.uk's 90-day and 12-month shared lists**: wait for the weekly
   run on 2026-10-20, or one run inside the limits on his go?

## Built

**Phase 1 — 2026-10-14** (Anthony: "go"):

- **The rule in one place**: `convex/utils/analyticsHistory.ts` — 90 days,
  weeks to a year, months to two years; where a day lives; the points a chart
  over any dates draws.
- **The store**: `googleAnalyticsHistory` (weeks and months, every device and
  each), beside `googleAnalyticsDays` (now 90 days). On the keep list:
  `googleAnalyticsHistory/rollHistory` rolls a channel day past 90 into its
  week, a week past a year into the month it starts in, and clears a month
  past two years and a total day past 90, after each collection.
- **The fill**: `googleAnalyticsHistory:fillChannelHistory`, whole months then
  four weeks at a time, so no week or month is split between asks; it first
  tops the days up to 90 for a website collected when 60 were kept, and sets
  `historyFrom` on the connection. A website's weeks and months are read only
  once the days reach the 90, so no stretch between them is missing.
- **ronins.co.uk filled, 2026-10-14** (Anthony: "yes and continue"): 33
  seconds, 62 requests to Google, 5,084 rows. Changing the dates on a
  channel's page then took 0.5–1.4 s in dev with nothing asked of Google,
  against 2.9–4.9 s before (§ Why).
- **The screens**: a channel's page, AI assistants and Channels' chart read the
  store for any dates it covers; what it does not cover yet (before the fill,
  or another home country) is still asked of Google once, as before.

Decided while building, in the plan's spirit:

- **A week counts in the month it starts in** when it rolls on; no week is
  split.
- **A week or month only partly inside the dates** is drawn when most of it
  is: a 12-month chart may start up to three days early, never a week late.
- **A coarse point is drawn as its average for the step** — a week held whole
  on a daily chart as its daily average, a month on a weekly chart as its
  weekly average — so it sits on the same scale as the days beside it, and the
  chart's hint says so (`stepScale.ts`). The span before is laid over the
  dates by date, not by position, so a weekly "before" line joins its points.
- **Total days are kept 90 too**, then cleared: Overview's long charts read the
  ready-made series, as before.
- **Until the next collection run**, a website holds 60 days: that run fetches
  the 30 older days once, as an ordinary run.

**Phases 2a and 2b — 2026-10-14**: every list and day chart a screen shows
for one device — landing pages, All pages, events, campaigns, ad keywords,
Visitors' lists, products, and their charts a day — is kept for Desktop,
Mobile and Tablet too (`KEPT_BY_DEVICE`). Every device is still asked whole,
its people as Google counts them, so each such list costs one more request a
run than the plan first said; a run stays far inside Google's allowance. A
device's list a run has not built yet is asked of Google once, as before,
until the next run builds it.

**Phase 2c and N1 — 2026-10-14**: each page over time
(`googleAnalyticsPageSeries`: a landing page's visits and a page's views a
day for 90 days, a week to a year, a month to two years, every device and
each), filled once by `googleAnalyticsPageSeries:fillPageHistory` and topped
up by every run; a landing page's and a page's charts and All pages' ticked
pages read it for any dates. The website's totals, events, campaigns, new
and returning people and products are each kept a day
(`DAY_FACT_LISTS`), rolled into weeks and months like the channels, and
every screen's chart reads them first.

**N2 and N3 — 2026-10-14**: the shared lists (`googleAnalyticsPageLists.ts`),
asked once for every page and event, each date range and device, by each
run — the 7 and 30 days every run, the 90 days and 12 months weekly:

| List | Keyed by | Read by |
|---|---|---|
| `landingSource` | landing page × channel × source × new or returning, with key events and reading | a page's sources, first visit or back again |
| `pageReferrer` | page × the page or website before | a page's "came from" |
| `pageNext` | page × the page viewed after (the same answer read the other way) | where its views went next |
| `pageClicks` | page × link or download | links clicked |
| `pageWho`, `landingWho` | page × age × gender; landing page × age × gender with key events | who reads it; conversions by age and gender |
| `pageCountry` | page × country, every country (PS8) | its countries |
| `landingPagesSeen` | landing page × page seen | different pages a visit |
| `pageWeekday`, `pageDevice` | page × weekday; page × device (every device only) | its days and devices |
| `eventPage`, `eventDetail` | event × page; event × what it was about — now and the span before | an event's own screen |

All pages' own list now counts each page's reading (`page_view`, `scroll`)
too, for a page's and its group's "read to the end". Each list keeps a
page's or event's **20 biggest rows and the rest as one** (SF14; the "Other
pages", "Other sources" and "The rest" lines on the screens), sorted by page
or event in the database's own order so a screen reads only its own rows.
A page's screen and an event's screen read them and ask Google for nothing
but an event's funnel, now named without its dates and **kept a week**
(SF8); until a run has built them, and for another home country, they still
ask Google once, as before.

Decided while building, in the plan's spirit:

- **A source's columns on a page's screen** come from visits that started
  there, which are not kept by each page they saw: "Pages" is pages a visit
  as Google counts them (as every other table in the section shows), and
  "Read to end" counts a visit's reading of any page, at most all of its
  visits. The page's own figures — different pages a visit, read to the end
  — are worked out exactly as before.
- **Landing pages by channel stay** (`landingChannel`, `landingAssistant`):
  Channels compares each channel's landing pages with the span before and a
  year before, which the shared lists, kept for now only, do not hold.
  Storing `landingSource` three times over instead would cost more than it
  saves.
- **What each event was about** is one ask for every kind of event (link,
  file, words searched, depth scrolled, video), not five.

**2e — 2026-10-14**: each other home country a website keeps gets the main
one's stores (SF7). Its days, weeks and months, and each of its pages over
time, sit beside the main country's records, their device named
`mobile|fra` (`dayDevice`); where each country stands — days held, two years
filled, pages held — is on the connection (`countryHistory`,
`googleAnalyticsCoverage.ts`). Each run fetches every country's new days
(a new country's 90 at once), and asks the shared lists for each country; a
page's readers by country are every country's, so asked once, with the main
country's. The fills take a country:
`fillHistory '{"connectionId": "…", "country": "fra"}'`, and the same for
`fillPageHistory`. A country taken off the list loses its records and its
place after the next collection.

**Phase 3 — 2026-10-14** (Anthony, asked whether to fill ronins.co.uk and
let new websites fill themselves: "Both"):

- **ronins.co.uk filled**: every day list, 2 min 24 s, 272 asks to Google,
  24,753 rows; each page, 49 s, 64 asks, 11,509 rows.
- **A new website fills itself**: once a collection is in, any day list not
  yet filled and each page's two years are asked once
  (`fillAfterCollection`), for the main home country and each other; a
  fill that stopped short tries again after the next collection. Each list's
  days are topped up from its oldest day held, so a shop found mid-run gets
  its products' 90 days too.
- **The screens' asks removed**: a device's list, a landing page's chart and
  channels, a page's views a day, where its views came from and its story,
  an event's pages and what it was about, Channels' and a channel's charts,
  All pages' ticked pages and Campaigns' chart are read from what is held.
  The live module answers for the event funnel alone (`askEventFunnel`);
  Live keeps its own realtime asks. Where something is not held yet — the
  minutes before a new website's fill ends, or a device's list before the
  next run — the screen says "Still being collected…", never "Asking
  Google…". `src/analytics-asks-drift.test.ts` fails a screen that calls
  any other action, a second public action beside the funnel, or a read
  that falls back to a list asked live.
- **The four day lists gone**: each event, campaign, new and returning
  people and products a day for every period (`eventSeries`,
  `campaignSeries`, `visitorSeries`, `productSeries`), and the days a period
  for the 7, 30 and 90 days and another home country's. The sweep after each
  collection clears them where they are still held. Tracking health's checks
  read the events kept a day.

- **Made without Anthony's agreement after Google refused a run** (§2c):
  the ten-minute retry (to be replaced by phase 4), a cancelled run
  stopping at its next step (kept), and a change asking the weekly lists at
  once (taken out again).

**Phase 4 — 2026-10-14** (Anthony: "ok do it but don't pull until the end of
the build"; nothing was asked of Google while it was built):

- **Google's own count on every answer** (SF18): every report asks
  `returnPropertyQuota`, and what Google says is left — the website's tokens
  today and this hour, Hakken's tokens this hour, and the hour's asks of
  age, gender and interests — rides with the run (`QuotaLeft`,
  `googleAnalyticsApi.ts`). The field names and limits were checked against
  Google's own pages.
- **The budget** (SF17, `KEPT_BACK`, `overBudget`, `googleAnalyticsBudget.ts`):
  a collection's or a fill's next ask is not made once Google says what is
  left is down to a fifth (AGENTS.md, "Respect Google's quotas") — 24 of
  the 120 age, gender and interest asks (for an ask that uses them), 2,800
  of Hakken's 14,000 tokens this hour, 8,000 of the property's 40,000, or
  40,000 of its 200,000 today. An event's funnel, asked from its screen, keeps
  to no budget: what is kept back is for it.
- **Waiting for the hour** (SF20): a spent budget, or Google refusing for an
  allowance that refreshes within the hour, pauses the run for an hour and
  two minutes — Google's hourly allowances refresh "within an hour but not
  necessarily on the whole hour boundaries" — saying so once in its log and
  asking nothing meanwhile; it looks in every ten minutes so it reads as
  going, then carries on from the list it was on. A refusal is no longer
  asked again a few seconds later. This replaces the ten-minute retry made
  that morning.
- **The night** (SF19) — *changed 2026-10-31 (Anthony: "it's best to finish the pull in the day"): a run now goes on for up to 22 hours, hour by hour inside the same allowances, so a big website finishes the same day (`RUN_DAY_MS`); the 4½ hours below is the original rule*: a website's run may go on for 4½ hours from its
  start; a wait that would take it past stops it, saying the rest waits for
  the next night (finished, not failed: nothing is lost). Websites' runs
  start spread out — two minutes apart, closer for many, all within 12
  minutes (a run waiting longer to start would read as stalled).
- **Measured on the fake Google** counting its allowances as Google does: a
  first, full run (about 168 such asks) is never refused — 96 in its first
  hour, the rest after the wait.
- **A run cancelled in Admin** stops at its next step, asking nothing more.

Left for the test together on Anthony's go: ronins.co.uk's runs on real
Google, and Hakken's Google Cloud project's own limits, read in its console.

- **Everything every night** (Anthony, 2026-10-14: "I want everything once
  a day"): each night's run asks every list — the 90 days and 12 months, the
  page titles and tracking health's weekly checks too — no longer some of
  them once a week. A night's run takes about 1 hour 20 minutes: about ten
  minutes of asks, 96 of them of age, gender and interests, an hour's wait,
  then the rest.
- **The collector's schedule moved to 01:00 UK** (Anthony: "set this for 1
  am uk"; Admin → Schedules, stored as 00:00 UTC — at midnight UK once the
  clocks go back on 25 October unless moved again). With the 4½ hours a run
  may take, every website is collected between 01:00 and 05:30.

Not built as §7 proposed, said here once:

- **The night window follows the collector's schedule**, not each
  website's own time zone: the schedule starts every website, and each may
  take the 4½ hours after.
- **A fill stopped by the budget starts again from the beginning** after the
  next collection, not from the piece it reached — fine at ronins.co.uk's
  size (a few hundred asks); worth changing before very large websites.

Decided while building, in the plan's spirit:

- **Insights keeps its 12 months a day**: its months, and the days around a
  Google profile change, need each day of the year, and the store keeps 90
  days a day (Anthony's rule). So the main home country's 12 months a day
  stay one list of their own, every device (about 365 rows), asked weekly.

## Change log

- 2026-10-15 — On a big website (ga-big-site-reliability-plan.md): the two
  years fill after the night's run, not on connecting, and carry on where
  they stop; the run's step and the fills run in the Node runtime, now
  `googleAnalyticsSteps:collectSiteStep`, `fillHistory` and `fillPageHistory`.
- 2026-10-14 — Asked whether to drop the device split for age, gender and
  interests to avoid the night's hour-long wait: "stick to the original
  plan" — every list by device, about 1 hour 20 minutes a night.
- 2026-10-14 — Everything collected every night, from 01:00 UK (Anthony).
- 2026-10-14 — Phase 4 built, nothing asked of Google (see "Built").
- 2026-10-14 — Phase 4 added on Anthony's word (§2c, SF17–SF21, §7): every
  run inside Google's limits, collected overnight; what went wrong that
  morning recorded. Total about 21 man-days.
- 2026-10-14 — Phase 3 built: ronins.co.uk filled, new websites fill
  themselves, the screens' asks and the four day lists removed (see "Built").
- 2026-10-14 — 2c, N1, N2, N3 and 2e built (see "Built").
- 2026-10-14 — Normalised across the section (§2b, SF12–SF16), on Anthony's
  word; SF5b (the 500 busiest pages) replaced. Phases N1–N3 in place of 2c's
  rest and 2d; about 19 man-days in all.
- 2026-10-14 — Phases 2a and 2b built. Q5 answered: the 500 busiest pages'
  stories stored (SF5b); 2c sized at 5 days, the total at about 16.
- 2026-10-14 — Phase 1 built (see "Built"); ronins.co.uk filled on Anthony's go.
- 2026-10-14 — Anthony's four answers (§6): channels and pages a day for 90
  days, a week to 12 months, a month to two years; every device; the funnel
  kept a week. SF2b, SF10 and SF11 added; sizes and phase 1 updated (14
  man-days).
- 2026-10-14 — Planned after Anthony's "why do we not store it" and "go".
