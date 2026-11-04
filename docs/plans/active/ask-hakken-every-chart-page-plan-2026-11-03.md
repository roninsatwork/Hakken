# Plan: every chart page makes the best of Ask Hakken

**Written 2026-11-03 at Anthony's word: "we need to discuss a plan again. How we make every graph page make the best of
ask hakken. this is the 3rd or 4th time of asking and each time we fail." The checklist is agreed ("Yes, that's it").
Go given 2026-11-03: "just do it". Building, shared work first.**

Every page below was read in the code on 3 November 2026, section by section, to see what it shows, what it hands the
eye, what Ask Hakken can do with it, and what its own findings should be. No finding has been checked on real figures
yet. That is step 6 of the checklist, for each page.

## Contents

1. What Anthony has asked, and why it keeps failing
2. The checklist (agreed)
3. How long: developer days
4. Shared work, done once
5. Google Analytics
6. Search Console
7. Bing Webmaster
8. Microsoft Clarity
9. Insights
10. Visibility
11. Decisions Anthony needs to make
12. How we stop marking it done when it isn't
13. Order, and running sections side by side
14. Progress

## 1. What Anthony has asked, and why it keeps failing

| Date | What he said | What we built | What fell short |
|---|---|---|---|
| 30 Oct | The Conversions eye, eight rounds: "it could find other things that I have not spotted, that's the whole point of this" | Conversions' own findings in code | Only Conversions got it |
| 31 Oct | "extend the eye and side bar to every page … so we can test and refine" | The eye on 154 pages, with one set of general rules for all of them | The plan said "then a few per section, where the section has its own story". **They were never built**, yet the plan was marked built. Tested on a random handful of pages. |
| 3 Nov | "this is the format i want on each ask screen we open" | A page's own screen and Products wired in; the general rules tuned | Pages still came up empty or found trivia |
| 3 Nov | "every page we touch needs its own finding i have asked this more than once" | Visits and Products' own rules | Two pages, after he caught the Chrome finding |

Why:

1. **We built wide and shallow.** General rules speak only when a total moves by a sixth or one row holds 40% of a
   list. On a quiet month they find nothing, or trivia ("Chrome: 40.6% of all the visits").
2. **"Done" meant the eye opened.** Nobody checked that a page found something useful, had "Do first" steps, or that the
   chat could answer about its charts.
3. **We tested a handful of eyes.** Pressing costs credits, so most pages were never looked at with real figures.
4. **The eye sees less than the page.** It gets the oldest 25 days of a 90-day chart, never the newest. It gets one
   view of a chart with a menu, and one page of a long table.
5. **The rules can't read most figures.** Position, rank, rating, volatility, a visit change kept as a fraction, a
   "before" kept as a plain number: none of these are figures the general rules know.
6. **The writer has nowhere to point.** 3 of 85 chart pages give it links for "Do first".
7. **Ask Hakken's chat can't read most pages.** Its tools read 14 Google Analytics screens, Search Console's totals,
   5 Bing screens, AI answers and Insights' boxes. It can't read any Visibility list or any Clarity figures. From
   the eye it gets the page's first 60 figures. It can redraw only a few of the page's charts.

## 2. The checklist (agreed 3 November 2026)

A chart page is done only when all six are true:

1. **Its own findings, for whatever dates are chosen.** Rules written for that page's figures, each one compared with
   something (last month, the rest of the website, rivals), ranked so they always pick the biggest things: a bar only
   keeps out what is too small to trust. Tested on More Handles' real figures for **every period the date menu offers**
   (`pageFindingsPeriods.test.ts`), each finding the page's headline and at least four things. No trivia. (Anthony,
   2026-11-03: "we have a date selection picker FFS … please add this to your tests and your rules".)
2a. **Every read the page makes loads on every period.** Checked on the dev deployment before hand-back: Visits' failed
   on Last 6 months and Last 12 months, out of memory, until 2026-11-03.
2. **Every chart hands over everything.** Each chart and table gives the eye all it can show, not just the view on
   screen, and the newest days rather than the oldest.
3. **"Do first" steps that link** to the pages where each thing gets looked into.
4. **A true description.** The eye's screen list says what the page is, its parts top to bottom, and what it never
   talks about.
5. **The chat can answer about every chart.** Asked from the page, Ask Hakken reads all the page's figures and can
   redraw any of its charts another way (bars, pie, top ten, against last month).
6. **Checked on real figures.** Each page's rules are run on More Handles' saved figures (Ronins' for Clarity, the
   only website with it) before the page counts as done, and what they found is written in Progress. No findings sheet
   for Anthony (2026-11-03: "no leave it").

## 3. How long: developer days

| Part | Pages | Developer days |
|---|---|---|
| Shared work, done once (section 4) | all | 16 |
| Google Analytics (with money taken off, and Live writing, decisions 1 and 3) | 9 | 26 |
| Search Console | 10 | 21 |
| Bing Webmaster | 7 | 12 |
| Microsoft Clarity | 4 | 8 |
| Insights (with the eye replaced on pages that show advice, decision 2) | 20 | 25 |
| Visibility (with every guessed money figure taken off, decision 4) | 31 | 58 |
| **Total** | **81** | **about 166** |

**About 166 developer days**, roughly eight months for one developer.

As agent work it's about a third of that, around 55 days. Most sections touch different files, so five can run side
by side in separate sessions. That brings it to roughly 3 weeks from start to finish.

A page sized S is about 1 day, M 2 days, L 3 days or more. Each size covers all six checklist points for that page,
including what Ask Hakken needs to read it and redraw its charts.

## 4. Shared work, done once (16 days)

These fix every page at once. They come first, because every section needs them.

| # | What | Why | Days |
|---|---|---|---|
| 1 | **The eye gets the newest days, not the oldest.** A dated list or chart is handed by date, newest kept, with its start and the span before. | Today a 90-day chart loses its newest 65 days (`pageDataFor` keeps the first 25 rows). About 30 pages. | 1½ |
| 2 | **Small moves stay moves.** A change kept in places (position) is never turned into a percentage. | A 0.4-place move reads as 40% today. | ½ |
| 3 | **The rules read every way a page keeps "before".** A change kept as a fraction, a plain-number `before`, a series line. | Visit changes on Channels, Campaigns, Funnel and Overview are invisible to the rules. | 1 |
| 4 | **A page of a long table is marked as picked.** | So no "one row holds most of the list" on 25 rows of 9,000. | ½ |
| 5 | **The missing figures get names and words.** Position, rank, rating, volatility, times shown, brand share, spam score, domain rank and more, each with whether less is better, in English and Italian. | The rules can only speak of what has a name. | 1½ |
| 6 | **Links for "Do first" on every eye piece**: Search Console's, Bing's, Visibility's and Insights' as well as Analytics'. Outside links (Clarity's heatmaps and recordings) allowed where they're the page's own. | 3 of 85 pages have them today. | 1 |
| 7 | **New kinds of finding, with their words**: a position that moved, a rival compared on the same figure, new against lost, a share of a whole set against its share before. | The kinds today are about counts and rates. | 1½ |
| 8 | **The chat reads the whole page.** From the eye's panel, Ask Hakken can read every figure the page handed over, not the first 60. | Today it's told the first 60 lines. | 1½ |
| 9 | **The chat can redraw any chart on the page.** Each chart registers what it draws: its title, kind and rows. Ask Hakken can redraw it as bars, a pie, the top ten or against the span before, from those same figures. | Today it can redraw only the charts its own tools cover. This one piece covers every page's charts. | 4 |
| 10 | **The guard test** (section 12). | So "done" can't be claimed falsely again. | 1 |
| 11 | **The writer's piece is never thrown away for one fault.** Every fault is named at once for its one rewrite; after it a sentence or step with a fault is left off, never the whole piece; Jev reads the words that will be shown and leaves off a guess stated as fact; the writer is told never to guess at days, causes or "likely" reasons; pages not sorted yet are never a finding. | Anthony, 2026-11-03, on the Visits eye: "this is really poor from the ai … we have to be better than this on every page". One 21-word sentence threw away a whole piece and he saw the rule's words. | 1 |
| | **Total** | | **16** |

The findings sheet (once item 11, 3 days) is dropped: Anthony, 2026-11-03, "no leave it".

## 5. Google Analytics (9 pages, 26 days)

Already done: Conversions, an event's page, Visits, Products.

Shared to this section: conversions in the lists are counts of times, not visits, so a rate can pass 100%. Findings
say "conversions per 100 visits", or read Conversions' map, which counts visits that converted.

**Money comes off every Google Analytics screen** (decision 1, Anthony, 2026-11-03: "Take money off"). About 4 days,
done first in this section, so no page's findings are written around a figure about to go. Found in the code on
2026-11-03:

- The list of websites: the value column.
- Overview: the value figure, the value columns, the shop note's revenue and the best sellers' revenue column.
- Conversions and a conversion's own screen: the worth column, the "of value" line under the figures, the value box.
- Channels: what a visit is worth by channel (the card and its CSV). Conversions per 100 visits stays.
- A channel's sources and Campaigns (the shared panels): the value, revenue and average order columns.
- Conversions' routes: the revenue in a band's hover.
- The eye: the worth figures handed to it, and its money words. Each Google Analytics screen entry lists money under
  what it never talks about.
- Ask Hakken: revenue, best sellers' revenue and value per visit come out of its Google Analytics reads.
- The reads behind them drop money no other place reads. Insights is checked before anything is dropped, since it may
  read Analytics values.

Left as it is: the Connection page, where each conversion is given its worth. That is a setting, not a figure.

| Page | Its own findings (examples) | Missing today | Size |
|---|---|---|---|
| Overview | Conversions down 22% while visits rose 5% (2.1 per 100 visits, from 2.9). An event not counted happened more often than all counted ones. Engaged visits 58%, from 64%. | Panels hand their top 3 only. Days cut. It hands Search Console figures the page doesn't show. Money question (section 11). | L (3) |
| Live | 14 people now, against about 5 in a usual half hour this month. One page holds 60% of people now; last month it had 3% of views. | A "usual" baseline from saved figures. All four lists. Pressing writes nothing today: it will write a piece about right now, with the time it was written shown above it (decision 3). | L (3) |
| Channels | Paid Search 3.1 per 100 visits, from 4.6, while the website held at 2.4. Organic 48% of visits, 71% of conversions. Referral visits up 64% while the website rose 4%. | Ask Hakken can't draw channels by day or the map. | M (2) |
| A channel | Paid Social 0.6 per 100 visits against the website's 2.4. Blog visits up 40% but conversions 9→2. Two pages lost 310 of its 400 lost visits. | Four table views and key events not handed. The website's "before" not held. Ask Hakken has no chart for one channel. | L (3) |
| Campaigns | A campaign's visits down 80%. A newsletter brought 640 visits and no conversions. One source and medium converts five times another. | The other table view. Ask Hakken has no chart by campaign. | M (2) |
| Funnel | /pricing: 71% left without another page, against 48% for all landing pages. Blog: 38% of landing visits, 2% of conversions. | The flow and the groups view not handed. "Left" and "went on" before not held. | L (3) |
| All pages | Three pages explain 70% of the website's lost views. A page's conversions nearly halved while its views held. | Movers over the whole list, worked out on the server. Ask Hakken has no views-a-day chart. | M (2) |
| A page's own screen | Organic visits starting here down 35% while the website's fell 5%. 1 in 40 who started here bought, against 1 in 90 site-wide. | The website's channel figures. A mismatch: it says it no longer shows "the page before", but its bars still offer it. | M (2) |
| Pages behind a square | /quote converted 8.2% of its landings, against 2.1% for the square. Two pages made 80% of the square's conversions. | The span before. Ask Hakken can't read this screen. | M (2) |

## 6. Search Console (10 pages, 21 days)

Shared to this section: Ask Hakken reads only the website's totals and can't read a keyword at all. The general rules
can't see position, times shown, brand split or volatility today (shared work 5).

| Page | Its own findings (examples) | Missing today | Size |
|---|---|---|---|
| Overview | Shown 18% more but clicked 6% fewer, while position held. Position up three places but clicks up only 2%. Non-brand clicks down 18% inside a total down 3%. | The brand split and the span before's days. A click-rate and position chart for Ask Hakken. | M (2) |
| Brand and non-brand | Non-brand clicks down 18% while brand rose 4%. Brand clicked 38% of the time, non-brand 2.1%. The biggest non-brand loser. | Non-brand movers over the whole list. Ask Hakken can't read the split. | M (2) |
| Click rate by position | Position 1 clicked 18%, position 2 only 4%. Position 4 clicked more than 3. | The span before's curve, and a brand split. | M (2) |
| Demand by service | A service shown 22% more but clicked 15% less, while the others' clicks rose 8%. Not sorted pages hold 34% of times shown. | Names handed raw ("Title | Brand"). Ask Hakken can't read by service. | M (2) |
| Google updates | One core update cut clicks 23%; no other moved them over 5%. Position worse after an update and still worse today. | Days cut. Which searches lost in each update isn't held. | M (2) |
| A search's and a page's own screens | Clicked 0.6% at position 3.4, against the website's 9.2% at position 3. Two of your pages split one search. One search lost 90 of a page's 120 lost clicks. | The website's click curve and its countries and devices. Separate screen keys. Ask Hakken can't read or draw a search. | L (3) |
| New and lost | 28 lost searches were on page one. 45 new searches are already in the top 10. | The span before's counts. Band counts on the server. | L (3) |
| Position bands | Top 3 down 14 while 4–10 rose 20: searches slipping off the top three. 85 searches one step from page one. | Clicks per band, and counts over the whole list. | M (2½) |
| Volatility | 4.2 out of 10, 2.6 times usual, with no update running: likely your own changes. Clicks down 12% with normal volatility and times shown down 11%: demand, not rankings. | Ask Hakken can't read or draw it. | M (2) |

## 7. Bing Webmaster (7 pages, 12 days)

Shared to this section: Bing keeps each row's span before and its days, but no screen reads them. One read of the
span before serves every Bing list page.

| Page | Its own findings (examples) | Missing today | Size |
|---|---|---|---|
| Overview | Bing's click rate 4.8% against Google's 2.1%. Bing's share fell three weeks running while Google's clicks held. | The span before (held, not read). Ask Hakken can't draw its charts. | M (2) |
| Against Google | Google ranks you higher on 62% of 400 shared searches. 2nd on Bing, 14th on Google, for a search Google shows 900 times. | The clicks on Bing-only searches, added up. | M (2) |
| Crawling | 3 money pages in Google's index but not Bing's. Bing last read a page 120 days ago, Google 4. | Ask Hakken's read drops Google's index figures. | M (2) |
| Keywords | 60 Bing clicks at position 2, 18th on Google. Top-3 click rate 9% on Bing against 22% on Google. | Clicks lost per search (held, not handed). | M (2) |
| Pages | A page with 45 Bing clicks and 3 from Google. Service pages 22% of Bing clicks against 41% of Google's. | Sums by page group. | M (2) |
| A search's and a page's own screens | Bing 3.1 against Google 12.4. Bing position from 2.0 to 5.8 over six weeks. | Ask Hakken can't read these screens. | M (2) |

## 8. Microsoft Clarity (4 pages, 8 days)

Clarity measures behaviour only. Its screen entries must never talk about conversions, enquiries, money or Google
rankings. Ask Hakken has no tool that reads Clarity's figures; it only draws its groups.

| Page | Its own findings (examples) | Missing today | Size |
|---|---|---|---|
| Overview | The page group whose scroll fell most, against the website's own move. Phones go straight back far more than computers. A source whose visits go straight back far more than the website's. | Browsers, the full page list, sources' span before. Days cut. A scroll-by-day chart for Ask Hakken. | M (2) |
| Errors | One browser's error share far above the website's. Errors bunched on three days, pointing to a release. | Each page's errors before (for "new errors on a page"). | M (1½) |
| Pages | The busy page whose scroll fell most. The share of all visits on pages scrolled under a quarter. | The eye gets only the filtered page of rows. Group averages. | M (2) |
| A page | Scroll against its page group and against before. A browser and device where far more visits hit an error. | Devices' and sources' span before. The website's device split. Nothing Ask Hakken can draw for one page. | M (2) |

## 9. Insights (20 pages, 25 days)

Insights joins sources and reads only what the sections downloaded; it never fetches.

**The eye is replaced on the pages that already show Hakken's advice** (decision 2, Anthony, 2026-11-03: "we make ask
hakken look at every page and make it targeted towards the page it is on", then "replace whatever has gone before as
it's clearly broken"). These are a finding, a report, Your month, This week and Findings. Whatever the eye does there
today goes. Each gets the same as every other page: its own findings about that page, a true screen-list entry, and a
piece written about that page only. The advice already on the page is handed to the eye with the figures, so its
piece builds on that advice and never says something different. About 2 more days.

| Page | Its own findings (examples) | Size |
|---|---|---|
| AI search | The assistant growing fastest against a year ago. The engine where the best rival is named far more often than you. | M (2) |
| Cannibalisation | A group whose recent enquiries fell. A group clicked far less than the others for the times shown. | S (1) |
| A cannibalisation group | Google sends most clicks to a page that isn't the owner. A non-owner page brings more enquiries than the owner. | S (1) |
| Enquiries | A kind of page whose share of enquiries is far above or below its share of visits. A search with many clicks and no enquiries. | M (2) |
| Enquiries by source | The source's enquiry rate against the website's (needs the website's rate handed). The last 3 months against the 3 before. | S (1) |
| Findings | A section with more findings this week than its 12-week average. The share of checked findings that worked. | S (1) |
| A finding | Its own figures against before and against the website's, worked out in code, with the finding's advice handed to the eye. | S (1) |
| Funnel | The step whose rate fell most against a year ago. The channel whose enquiry rate fell most, set against Organic Search. | S (1) |
| Leaderboards | A league where you grew less than the leader over the year. A rival that climbed past you. | S (1) |
| A league | Your growth against the leader's. The rival gaining fastest. | S (1) |
| Measurement | Visits per click, the last 28 days against the 28 before: shows a tracking break. Days where visits fell to near nothing while clicks held. | S (1) |
| Opportunities | The share of all the worth sitting on pages that enquire below the website's rate. One page carrying many opportunities. | S (1) |
| Page plan | The kind of page with the most pages to merge or remove. Enquiries at stake on pages to rebuild. | M (2) |
| Page reviews | The page whose visitors per enquiry rose most. The page that lost most enquiries. | S (1) |
| A page review | The last 90 days against the last 12 months. Searches where a rival ranks above, weighted by searches a month. | S (1) |
| A report, and Your month | This month's enquiries against the same month last year. The worst scorecard measure. | S (1) |
| Strategy | A service Google shows more often while its enquiries fell. The biggest shift in a service's share of enquiries. | S (1) |
| Summary | The worst scorecard measure against a year ago. Your market share's change against your biggest rival's. | M (2) |
| This week | Visitors per enquiry against a year ago. How much of what's at stake sits in one finding. | S (1) |

## 10. Visibility (31 pages, 58 days)

Shared to this section (3 of the 58 days): Ask Hakken gets a tool that reads any Visibility screen, and line charts
over time with rivals. Today it can't read any Visibility list and draws only websites and positions at the newest
check. One fault to fix: Wins and losses is described wrongly, and Keywords' new and lost shares its key with Google's
moves.

| Family | Pages | Its own findings (examples) | Days |
|---|---|---|---|
| Backlinks | Summary, Anchors, Compared, IPs, New and lost, Quality, Where | Linking websites up 12 while the leading rival rose 40. 38% of links use one search phrase as their words. One network holds 14% of linking websites. Spam score up from 4 to 12 while rivals sit at 3–5. 18% of links from your own country against 55% for rivals. Three pages read rivals' link summaries for the first time. | 11 |
| Keywords | Keywords, Bands, A search, New and lost, Pages, Structure | Searches that fell carried 1,240 estimated visitors; those that rose 310. Moves out of page one beat moves in 3 to 1. Position 9 from 4 while a rival went 7 to 3. /blog has 40% of the searches and 8% of the visits. Most need sums over the whole list on the server. | 11 |
| Google | Above you, Features, Wins and losses, Searches | A rival above you on 9 of 20 searches, 3 more than a week ago. An AI Overview shows on 14 of 20 searches; you're quoted in 2, a rival in 6. Losses carried 2,100 searches a month, wins 600. | 7 |
| Competitors | Side by side, Market map, A rival | A rival's visits up 35% while yours fell 5%. A website you don't watch shares 420 searches with you, more than any rival you watch. | 5 |
| AI | AI demand, AI mentions, Share of voice, Brand radar | AI asks for a search up 60% in three months while Google searches held. ChatGPT names you on 2 of 12 questions, Perplexity on 9. Mentions fell from 40 to 28 while a rival rose from 30 to 45. | 7 |
| Mentions and reviews | Web mentions, Against rivals, Your reviews, Reviews against rivals | 14 of 20 pages naming you have no link, against 6 of 18 before. Stars this period average 3.9 against 4.6 before. Replies take 9 days; the fastest rival takes 2. | 6 |
| The rest | Overview, Paid, Site audit | Estimated visitors down 12% while the rivals' average rose 8%. A rival advertises on 140 searches, up from 90. Pages with broken links up from 4 to 31 since the last crawl. | 6½ |
| Ask Hakken's Visibility read and line charts | | | 3 |
| Every other guessed money figure off (decision 4) | Keywords, A search, A page's searches, Overview, Paid's list, Keyword research | | 1½ |
| **Total** | **31** | | **55** |

**The guessed ad spend comes off** (decision 4, Anthony, 2026-11-03: "Take it off"). It is our data supplier's guess at
what the ads cost, not money anyone measured. About 1½ days, inside "The rest". Found in the code on 2026-11-03:

- Paid: the "Estimated ad spend" figure and its line in the chart.
- Paid → its list of searches: the cost column and the sort by cost.
- Visibility's Overview: the cost under the paid panel, and its link sorted by cost.
- The eye on Paid and its list: the cost figures and the "dearest search" rule. They count searches and visits
  instead.
- The exports of those screens.

The figure stays in what is stored; it is only no longer shown.

**Every other guessed money figure comes off too** (Anthony, 2026-11-03: "Yes, all of it"), so no Hakken screen shows
money nobody measured. About 1½ days, its own row above. Found in the code on 2026-11-03:

- What a click costs advertisers on a search: Keywords (the column, its sort and its hint, in both views), a search's
  own page, the list of searches you advertise on, and Keyword research (a lookup's figures, and the ideas list's
  column, sort and export).
- What your Google visits would be worth as ads: Visibility's Overview (the line in its chart, and the line under
  estimated visitors), a search's own page (its ranking page's worth) and a page's searches (the worth under its
  figures).
- The exports of those screens.

These stay in what is stored too; they are only no longer shown. Insights' Opportunities ranks searches by how often
they are made, the website's place and the page's enquiry rate. It shows no money and uses neither guess, so it is
untouched here.

## 11. Decisions Anthony needs to make

1. **Money on Google Analytics screens.** Decided 2026-11-03: "Take money off". It comes off every Google Analytics
   screen, the eye and Ask Hakken's reads (section 5 lists where). About 4 more days.
2. **Pages that already show Hakken's advice.** Decided 2026-11-03: "replace whatever has gone before as it's clearly
   broken". The eye on a finding, a report, Your month, This week and Findings is replaced: targeted to that page, and
   given the advice already there so the two agree (section 9). About 2 more days.
3. **Live.** Decided 2026-11-03: "Yes, write one". Live gets its own findings against a usual half hour, and pressing
   writes a piece about right now, with the time it was written shown above it. Today its screen entry says it writes
   nothing (`writes: false`). About 1 more day.
4. **Paid (Visibility).** Decided 2026-11-03: "Take it off". The guessed ad spend comes off the screens and the eye.
   Then "Yes, all of it": what a click costs and what your Google visits would be worth come off every screen too
   (section 10 lists where). About 3 more days.
5. **Run side by side?** Decided 2026-11-03: "Yes, side by side". After the shared work and Google Analytics are built
   here, Search Console, Bing, Clarity, Insights and Visibility each run in their own session at the same time
   (section 13).
6. **The second website.** Settled 2026-11-03: no findings sheets ("no leave it"). Rules are checked on More Handles'
   saved figures, and Clarity's on Ronins', the only website with Clarity (checked on the dev data on 2026-11-03).
   No website has Bing connected, so Bing's rules are checked on test figures until one is.
7. **Figures not kept.** Settled 2026-11-03 ("just do it"), as proposed: some findings need figures Hakken doesn't
   keep yet (Search Console's hidden searches the period before, a page's errors before in Clarity). They are worked
   out from what's stored where they can be, and Google is never asked for more without Anthony's OK.

## 12. How we stop marking it done when it isn't

- **A guard test** fails any chart page that has no rules of its own, no links, or a screen-list entry without its
  parts and what it never talks about. Its list of pages still to do can only shrink.
- **Each page's rules are run on saved figures** (More Handles', Ronins' for Clarity) before it counts as done. That
  costs nothing.
- **Pressing the eye** only with Anthony's OK, with the cost said first.
- **Each section's progress** is written below with what was checked and what wasn't.

## 13. Order, and running sections side by side

1. Shared work (16 days). It touches files every section uses, so it runs alone first.
2. Google Analytics (26 days), in this session. It proves the checklist before the rest begin.
3. Then side by side, each in its own session, against the same checklist and guard: Search Console, Bing, Clarity,
   Insights, and Visibility (the biggest, split into its families).

## 14. Progress

- 2026-11-03: drafted from an audit of all 85 chart pages. The checklist agreed ("Yes, that's it"). Not yet a go to
  build.
- 2026-11-03: every page read in the code, section by section, and sized. About 164 developer days. Nothing built.
- 2026-11-03: decision 1 answered: "Take money off". Google Analytics goes from 21 to 25 days; about 168 in all.
  Nothing built.
- 2026-11-03: decision 2 answered: the eye on the pages that show Hakken's advice is replaced, targeted to the page.
  Insights goes from 23 to 25 days; about 170 in all. Nothing built.
- 2026-11-03: decision 3 answered: "Yes, write one" for Live. Google Analytics goes from 25 to 26 days; about 171 in
  all. Nothing built.
- 2026-11-03: decision 4 answered: "Take it off" for Paid's guessed ad spend. Visibility goes from 55 to 56½ days;
  about 172½ in all. Nothing built.
- 2026-11-03: "Yes, all of it": every other guessed money figure comes off as well. Visibility goes from 56½ to 58
  days; about 174 in all. Nothing built.
- 2026-11-03: decision 5 answered: "Yes, side by side". No change to the days. Nothing built.
- 2026-11-03: no findings sheets ("no leave it"); rules are checked on saved figures instead. Shared work goes from 18
  to 15 days and the 6 days of sheet reading go; about 165 in all. Then "just do it": the go to build. Shared work
  started.
- 2026-11-03: shared work 1–4 built: dated lists hand their newest 400 rows (a 90-day chart all 90), a `change` outside
  Google Analytics is never a percentage, the rules read a plain `before` and Google Analytics' change as a fraction,
  and a page of a longer list is never read as a whole. Tests in `pageData.test.ts` and `pageFindings.test.ts`.
- 2026-11-03: shared work 5 and 7 in part: places and scores named in English and Italian (position, rating, spam score,
  domain rank, difficulty, volatility, brand clicks); new kinds placeUp/placeDown, rivalUp/rivalDown, newLost,
  shareMoved, with their words and icons. The general rule for a place that moved is next.
- 2026-11-03: shared work 11 added and built after Anthony's Visits screenshot ("this is really poor from the ai"):
  the Visits press of 17:29 was thrown away for one 21-word sentence. Every fault now goes back at once, a faulty
  sentence is left off after the rewrite, Jev reads the shown words, no guessing, no "Not sorted yet" finding.
  Not yet seen on a real press.
- 2026-11-03: one press on Visits at 17:45, with Anthony's OK ("Yes, press it"): written, not thrown away; Jev left off a
  guess. Still short of good: "fell -7.5%" (a signed change handed as a figure), "In the table, …" (a part of the page
  named), and the weekend dip found by the writer, not by code. All three fixed in shared code the same hour: a change is
  handed as its size, a leading "In the table," is cut and any other part named goes back, and Visits finds weekends
  against weekdays itself (returning 200 a day at weekends against 351; new 18% lower). The general rule for a place
  that moved is built too. Not yet seen on a second press.
- 2026-11-03: Anthony on Last 3 months ("this has gone backwards again", "we have a date selection picker FFS"):
  Visits found two things there, and its figures and table failed to load on Last 6 and 12 months (out of memory in
  the landing-page read). Fixed: Visits' rules rank and always pick the biggest things (headline, new against returning,
  the two groups that moved most and the two furthest from the website in leaving at once, weekends against weekdays
  where every point is a day); the landing-page read goes a part at a time with only keys, visits and counted events
  (`eachSlotRow`), and all seven periods load. New test of every period on More Handles' saved figures
  (`src/test/fixtures/moreHandlesVisits.json`, `pageFindingsPeriods.test.ts`): 5 or 6 findings on each. The rule is in
  AGENTS.md and the checklist. To check: "left at once" over 12 months reads 6.4% for new visits, which looks like older
  months saved without engaged visits.
- 2026-11-03, end of day. Next, agreed for 2026-11-04 ("Ok let's do this tomorrow"): a side-by-side test of the
  writer's model. The same page, figures and findings written by today's writer model and by a
  Claude model, on Visits, Conversions and one Search Console page: six presses, each cost said first; Anthony reads
  the pairs and picks. Switching is a setting in Admin. Also open: the 12-month "left at once" figure (6.4% for new
  visits, likely older months saved without engaged visits); shared work 9 (the chat redraws any chart: each
  `ChartCard` registers its figures, a tool redraws them) and 10 (the guard test); then the sections. Nothing
  committed.
- 2026-11-03, evening, at Anthony's word ("build and finish this without me overnight please so we have a lot to test
  tomorrow"; "do random checks using the eye, don't eye test everything as that costs"). Each section's own rules now
  live in a file of their own (`convex/utils/sees/own/<section>.ts`, joined in `pageOwnFindings.ts`), and seven builders
  work side by side (decision 5): Google Analytics (with money off and Live writing), Search Console, Bing, Clarity,
  Insights (with decision 2), and Visibility in two halves (with the guessed money off and Ask Hakken's Visibility
  read). No commits, no pushes, no Google asks; eye presses only as a few random checks.
- Shared work 9 built: every chart on every page registers its title and its download's figures (`ChartCard` →
  `useSeesChart`); a conversation started from the eye's panel carries them (`startedOn.charts`), and Ask Hakken
  redraws any of them as bars, a pie, a line, stacked or the top so many, against another column, from those figures
  only (`redraw_page_chart`, connector `assistant-page-charts`; `assistantPageCharts.ts`, `assistantPageChartHandlers.ts`;
  drawn by `AnswerChart`). Found and fixed on the way: Ask Hakken's Bing, Clarity and Visibility charts were drawn by
  their tools and then dropped before the answer (`isChart` knew only Analytics' and Search Console's).
- Decision 3's panel part built: Live's written words say when they were written ("Written by the Hakken team at 18:42").
- 2026-11-03, night. Finished and joined: **Bing** (7 pages, own rules on hand-written figures for every period: no
  website has Bing connected; its Last 12 months' span before was 5 weeks of 52 and is now never compared),
  **Clarity** (4 pages on Ronins' figures, every period; held to saying nothing on a period only a day or two old),
  **Visibility's first half** (Backlinks and Keywords, 13 pages; every website on dev holds one check, 5 October, so
  its rules set you against rivals; Keywords' New and lost has its own key; the guessed money is off Keywords, a
  search's page, a page's searches and Keyword research), and **Insights** (20 pages; decision 2 built: the five
  pages showing Hakken's advice hand it to the writer and write about the page). Shared changes asked for and made:
  Insights' percentages are never turned round (`PERCENTS_ALWAYS`); a rate's move is said in points; a compared place
  is worded as a place, with its arrow by the better place; a single record's place move has no "biggest".
- Found and fixed: More Handles' Keywords list was empty. Its 15 October keyword list kept only its last, empty page,
  and that short page read as the whole list (`listDayReach`), so every search counted as older. A list now reaches
  only as far as its pages run unbroken, and a copy's latest check is never past its newest search
  (`readKeywordCopy`): checked on the dev data, the list reads all 6,355 searches again.
- Data faults the builders found, for Anthony: Insights counts every conversion as an enquiry (basket additions too,
  rates past 100%; `contact_us_submit` and `contact-us-submit` both counted); Leagues hold no year-before figures;
  `atStake` is empty on every finding; the market-share chart holds one month; Clarity's page-and-source figures
  disagree with its page figures; More Handles' links are skewed by one anchor ("delivery page", 82% of links from two
  websites); every website on dev has one Visibility check.
- 2026-11-03, night. **Search Console** finished and joined: 10 pages with their own rules, every period on More
  Handles (Ronins' overview too); Ask Hakken reads each Search Console screen (`assistantSearchConsoleReads.ts`); New
  and lost reads half the records it did. Data faults for Anthony: the ready-made Search Console lists are a month
  behind (Last month shows September) until a screen asks for a rebuild; More Handles' saved Search Console days start
  on 23 April 2026 though the connection says June 2025, so Last 6 and 12 months set 184 days against 9 and the boxes
  show rises of about 1,800% (the rules ignore a span before under a third of the span; the boxes need the history
  fetched again, which asks Google and needs Anthony's OK).
- 2026-11-03, night. **Visibility's second half** finished and joined: 18 pages (Google, Competitors, AI, Mentions and
  reviews, Overview, Paid, Site audit) with their own rules, tested on More Handles' saved figures for every period and
  on hand-written monthly checks (one real check on dev, 5 October, so most say nothing to compare yet); Wins and
  losses' description fixed; the guessed money off Paid, its list and Overview; Ask Hakken reads any of these 18
  screens (`assistantVisibilityReads.ts`) and draws a line against a rival. The eye is off the websites list and
  Drafts. Local pages have no chart and were left.
- **No eye on pages without one website's figures** (Anthony, 2026-11-03: "We dont need the eye on non website data
  related pages", "Agree"): off the Search Console, Bing, Clarity and Visibility websites lists, Data sources, the
  Reports list, Clarity's recordings and Drafts; Google Analytics' websites list and Tracking health go with its build.
  `src/ask-hakken-chart-pages-drift.test.ts` keeps them off (`NO_EYE`).
- **Shared work 10 built**: `src/ask-hakken-chart-pages-drift.test.ts` fails a page with its own rules but no full
  screen entry or no every-period test on saved figures, and a screen-list page with neither its own rules nor a place
  on the shrink-only STILL_TO_DO list.
- 2026-11-03, late. **Google Analytics** finished and joined: its eight pages with their own rules (Overview, Live,
  Channels, a channel, Campaigns, Funnel, All pages, a page's own screen, the pages behind a square), Products added to
  the every-period test; money off every Google Analytics screen, the eye and Ask Hakken (decision 1); Live writes and
  says when (decision 3); the eye off the websites list and Tracking health. 36 period reads that ran out of memory on
  six reads (Channels, a channel, landing pages, All pages, a page's own screen, Conversions' pages) load now, read a
  part at a time with only the figures needed (`eachSlotPart`, `unpackPartOnly`). **All seven sections built.**
- Joined after: the screen list, Visibility's and Insights' own rules and Search Console's lists split by file to stay
  under the backend's 1,000-line ceiling; the writer's instructions no longer name the platform (it is a setting); the
  page-chart query moved out of the tool registry's reach of the browser.
- Regression found by a random press and fixed: Insights pages opened without a website in the address pressed
  nothing, as their built figures name no website. They now press for the website Insights shows
  (`useInsightsShownSite`).
- Random eye presses, at Anthony's word ("do random checks using the eye, don't eye test everything as that costs"):
  Google Analytics' Overview, Search Console's Overview, Visibility's Side by side and Insights' This week, all
  written; about $0.23 in all. Clarity could not be pressed: the signed-in company is More Handles', and only Ronins has
  Clarity.
- Data faults for Anthony, from Google Analytics: More Handles' new visits read about 98% engaged until 3 September
  2026 and about 70% after (Google's own figures; most likely a tag sending extra page views until then), so every 3-,
  6- and 12-month comparison crosses that break; landing pages' "went on" figures look wrong on some spans.
- For Anthony to decide: Tracking health's check pages showed their numbered fix steps only inside the eye, so with the
  eye gone they show none (bring the steps back as page content?); whether to fetch More Handles' Search Console
  history again (it asks Google) so Last 6 and 12 months stop showing false rises; whether to mark comparisons that
  cross Google Analytics' 3 September break.
- 2026-11-03, end of night. The gate, every step, on the whole change (303 files, nothing committed): `verify:env`,
  `lint:all`, `npm run check` (8,791 tests, the speed check, every guard), `test:coverage` and `coverage:check` (8,790
  tests; lines 83.6%, statements 80.5%, past their next ratchet targets), `test:e2e:smoke` (19) and `npm run build`
  in a copy, `git diff --check`: all pass. On the way: the coverage run failed three press tests under load, as each
  press read the words with Jev twice; it now reads them once where Jev passed them inside the conversation.

### 4 November: the panel while it writes, and a refresh (Anthony, testing)

- **What the AI is doing.** Each press saves its stages as they start (`convex/utils/sees/stages.ts`, `seesAsk.noteSeesStage`): reading the page's figures, looking for what stands out, deciding what matters, reading other screens, writing, checking every figure, looking for guesses, writing again. The panel lists them, done ticked and the current one turning. No timer guesses at them: a stage a press doesn't go through is never shown.
- **The words.** A sentence to a line, the first brighter, figures in the numbers' font (`SeesWriting.tsx`).
- **Teleprompter.** The checked words come in a word at a time, about 16 words a second, the line being read lit, the panel following until the reader scrolls. They arrive once the Editor has passed them, so a draft that may be sent back is never shown. Once per answer; at once on a computer set to reduce motion, and for a rule's words.
- **Refresh.** `seesAsk.refreshSees`, super admins only: writes again now on the figures as they stand, inside the three hours, spending none of the company's credits (`notCharged`); the cost stays on the run. It starts a new chat in the panel too, with the question box emptied; the last conversation stays in Ask Hakken's list (Anthony: "the refresh should start a new chat").

