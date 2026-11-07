# Plan: the eye's code-first brief, tried on Services, then every page

**Written 2026-11-07.** Anthony asked why a press of the eye costs what it does, then: "Surely we find the key stats in code first then pass the results into the llm to write it up". On the old rule (the eye guide's round 6, give the writer the whole page and never a checklist): "Ignore the rule as the ask conterra was awful then, we are looking at best practice here against cost efficiency". On trying it: "Yes please let's try it on this page". On what comes after: "if we maintain good quality we need make a plan to roll this out to every page with the eye".

**Status:** the trial and the kept first answer are committed to dev (071edaa7, e2cbe12d). On "Go for it" the rollout, the cache, the drift tests and the two quality fixes are built on dev, not committed (see Progress).

## What a press costs, and where it goes

Measured on Ronins' Services, 7 November, on Google's flagship model.

- **The eye already works code-first.** Code finds the findings ("What the figures show", no AI, no cost). The writer gets them and writes "What it means" and "Do first". It reads no other screen once code has found something.
- **A writer call was about 7,300 tokens in.** About 4,000 of those were the page's own lists, cut to their first 8 rows each. The findings were about 400. The rest is the fixed instructions: the rules, the format, the writer's brief and what the page never talks about.
- **Every press made two calls.** The checker sent the first answer back once and the writer rewrote it. That doubles the cost. On 6 of 6 presses the reason was one of these:
  - **The checker's own false alarm.** It read "for every 100 visits", the measure's own words, as a number the writer had typed (4 of 6).
  - **A "%" typed after a figure,** which brings its own unit already (2 of 6).
  - **A first finding left out** (several, alongside the others).

## What the trial changed (Services only, apart from one fix)

1. **The code-first brief** (`findingsBriefOf`, `convex/utils/sees/pageData.ts`). The writer gets every row a finding names, the first 3 of each list for the setting, and of a dated list its newest 3 and its busiest step. The rules' list of names is left out. The checker still knows every figure on the page.
2. **The first findings in order** (`SEES_CODE_FIRST_FORMAT`). "Your first sentences say findings 1 to 4, one each, in that order."
3. **A stray unit tidied** (`withoutTypedUnits`). A "%" typed straight after a figure's key is taken off before checking.
4. **The checker's false alarm fixed, for every page** (`typedNumbers`, `convex/utils/insightEditor.ts`). "For every 100", "per 100" and "each 100" are the measure's words, never a typed figure. It's the one shared change: it was sending back words on any page that uses that phrase.
5. **Services' month steps named as dates** (`ServiceParts.tsx`). The eye now keeps the newest months, not the oldest.

Switched on by `usesCodeFirstBrief` in `pageData.ts`: a section listed in `CODE_FIRST_SECTIONS` brings every page of it, and `CODE_FIRST_PAGES` holds a page ahead of its section.

## Results, on Ronins: Last 12 months, Last month and This week

| | Tokens in, each call | Cost a press | Sent back once |
|---|---:|---:|---:|
| Before, this morning (4 presses) | 6,600 to 8,000 | 7.4 to 8.2 cents | 4 of 4 |
| Short brief (3 presses) | 4,800 to 5,200 | 5.0 to 5.7 cents | 3 of 3 |
| Plus findings in order and the unit tidied (3) | 4,800 to 5,300 | 4.8 to 6.2 cents | 3 of 3 |
| Plus the checker's fix (3) | 4,800 to 5,300 | 5.0 to 5.3 cents | 3 of 3 |

- **A third less a press:** about 7.7 cents to about 5.2.
- **The rewrites remain.** Their reasons changed: no false alarms now, only real slips. A step ran past 20 words, or a first finding was left out.
- **Quality held.** Every piece said the same main points as this morning's: services' share of events against their share of visits, AI Agency's growth with few events, ChatBot Agency's events rising as its visits fell, and how many services had no events. One 12-month piece lost "peaking in March". Both old and new still make two slips, on either brief:
  - **A rate said as a percentage:** "0% events against 4.3%".
  - **Visits said to have "dropped" when only AI Agency fell,** in Last month's steps.
- **The trial's presses cost $0.47** (9 presses), on top of the build's $0.50 this morning.

## Keeping a good first answer (built on "Do it", 7 November)

On a page trying the brief, a first answer stands without a rewrite when, with its faulty parts left off, it still says the first findings and keeps at least three sentences and two steps (`firstAnswerStands`, `FIRST_ANSWER_KEEPS`). The Editor leaves the faulty parts off, as it already did after a rewrite. Anything less goes back once, as before.

| | Writer calls | Cost a press | Time |
|---|---:|---:|---:|
| Last 12 months | 1 (one sentence left off) | 2.6 cents | 14 seconds |
| Last month | 1 (passed first time) | 2.4 cents | 11 seconds |
| This week | 2 (rewritten) | 6.3 cents | 25 seconds |

- **About 3.8 cents a press on average,** against 5.2 with the brief alone and 7.7 this morning. A press that stands first time costs about 2.5 cents, and takes half the time.
- **Quality held.** The same main points, four sentences and three or four steps each. This week's piece still says how small the figures are.

## Next (built on "Go for it", 7 November: see Progress)

1. **Code digs, for quality.** For the biggest change, code adds where it came from to the brief: the channel, device and service that moved it. That's the step the writer kept skipping in October, and it's cheap.
2. **The two slips.** Say every rate as "for every 100 visits" in the brief's own words, and name the subject of each change ("AI Agency's visits", never "service visits"), so the writer can't mix them up.

## Rollout to every page with the eye

Anthony, 7 November: "Let's add this into the eye rollout plan to each page with an eye … So the cache and the new way of working on the press". Each page gets both:

- **The new way a press works:** the code-first brief, the first findings in order, the unit tidied, and a good first answer kept.
- **The cache:** an end user's answer is kept until the page's figures change, with 24 hours as a backstop, in place of three hours today.
  - **Why not midnight:** Anthony first said "cache the answer until midnight as the data won't change that often". Keying it to the figures does the same without paying twice around midnight, because the nightly collection runs in the early hours.
  - **His earlier rule stands:** new figures, new words ("dont cache if things change").
  - **Super admins:** Refresh still writes again at once, free of the company's credits ("super admins can refresh as we are playing with the data a lot").
  - **Where:** one rule for every page (`SEES_KEPT_MS`, `stillStands`, `convex/seesAsk.ts`), so it goes in once, at the start.

103 pages have an eye that writes: Google Analytics 18, Search Console 25, Visibility 35, Insights 14, Bing 7 and Clarity 4. The brief only changes a page whose code finds things first. A page with no findings of its own still hands the writer the whole page, and gets its own rules first.

- **One section at a time,** in this order: Google Analytics, Search Console, Visibility, Insights, Bing, Clarity. Each joins `CODE_FIRST_SECTIONS` in one change.
- **Measured the same way as Services:** for two or three of its pages, three dates each on one website, the new words beside the answer saved before, with tokens, cost, rewrites and time. A page whose words get worse stays out, and the reason is written down.
- **Cost of checking:** about 50 presses at about 3 to 5 cents, near $2.50, spread over the sections.
- **Time:** about a day of agent work, most of it reading the words side by side, plus the tests below.
- **Done when** every section is on the brief or has a written reason not to be, every guard below passes, and the switch can be removed, as every page uses it.

## Tests that stop the eye drifting

Anthony, 7 November: "We need plenty of tests around the eye to stop drift". Each is a test with no AI cost that runs on every check, so a change that weakens the eye fails before anyone presses it.

- **Every page on the brief is tested on saved figures.** A guard fails a test of every period that doesn't check the brief, as `src/ask-hakken-chart-pages-drift.test.ts` already does for a page's own rules.
- **The brief keeps what the findings need.** On each page's saved figures, every row a finding names is in the brief, and every figure key a finding gives the writer is one the checker knows.
- **The brief stays short.** Each page's brief stays under a set size on its saved figures, so a new list on a page can't quietly make every press dearer. The sizes may shrink, never grow.
- **The checker's rules hold.** "For every 100" is never a typed number; a "%" after a key is tidied; a first answer stands only with the first findings said, three sentences and two steps; anything less goes back once.
- **The cache holds.** An end user's answer stands while the figures are the same, up to 24 hours; new figures write again; a super admin's Refresh always writes again and charges nothing.
- **Every date the menu offers.** Each page's rules find its headline and enough to say on all seven dates, as Services' already do.
- **What each page never says.** Each page's findings never use the words its `never` list forbids: money on Google Analytics, conversions on a service business, busy or quiet on Services.
- **The words a press writes.** A small set of saved answers per section, written by a real press, is held to the checker's rules whenever the rules change. Running a fresh press stays a hand check, as it costs money.

## Progress

- **7 November, on "Go for it":**
  - **The cache, built for every page.** An end user's answer is kept a day while the page's figures stay the same (`SEES_KEPT_MS`), and new figures still write new words at once. A super admin's Refresh is unchanged. The words on the Usage screen say so, in English and Italian.
  - **The tests that stop drift, built.** `src/test/codeFirstBrief.ts` holds every page with saved figures, on every date its tests cover (84 pages), to two promises: every row its findings name is in the writer's brief, and the brief stays under its page's most (`src/test/codeFirstBriefCeilings.json`, set a tenth above today's, which may shrink, never grow). `src/ask-hakken-chart-pages-drift.test.ts` fails a test of every period that leaves the check out. The cache and the checker's rules have tests of their own. On those 84 pages the briefs are 34% smaller than the short brief they replace.
  - **A tool to measure without a browser.** `seesAskActions.replaySeesAnswers` writes a saved answer again on the very figures its press was handed, the brief on or off, each on a run of its own so its cost is recorded. Nothing is saved over the page's answer.
  - **Google Analytics joined.** Six pages' saved answers written both ways (All pages, Campaigns, Channels, Overview, Products, Visits): 74 cents old, 41 new, about 45% less, with the same main points. Two more (Funnel and a page's own screen) were refused by Google's model for asking too often, as two batches ran at once.
  - **Only pages with rules of their own.** Insights' Experiments, which has none yet, lost its main point (conversions up while visits held) on the brief: where only the general rules run, code finds little, and the writer still needs the page's lists. So the brief applies only to a page in `OWN_FINDINGS`; the rest keep the short brief until their rules are written.
  - **The "%" tidy fixed.** It took a "%" off after any figure, and Clarity's Pages read "People scroll 35 down". It now takes one off only after a figure that brings its own.
  - **Clarity and Visibility joined,** against their saved answers: Clarity's Pages 14.4 cents to 2.9 and Overview 7.6 to 4.6; Visibility's Competitors 3.6 to 2.2 and Linking websites the same. The same main points, though Linking websites' new words repeat themselves once ("5 broken backlinks and 5 broken backlinks").
  - **Search Console and Insights joined.** Performance 6.7 cents to 5.1, Almost on page one 4.2 to 4.7, and Insights' This week 5.8 to 2.2, with the same main points.
  - **The refusals were Google's capacity, not the brief.** At first Google's model refused the Search specialist's words on the new brief ("Resource exhausted", 429, or no answer in 180 seconds), and the old brief worked. It was blamed in turn on the writer's thinking and on the findings-in-order line, and neither was it: later the same refusals hit Clarity, Visibility and the old brief on Google Analytics, on and off, both ways. They come and go with Google's load (and heavy testing adds to it). A press that hits one fails as it always has, and the next press writes. The findings-in-order line (`SEES_CODE_FIRST_FORMAT`) came out while testing that guess and stays out: the presses since kept their main points without it, and it was one more rule a call pays for.
  - **The re-check of real answers, built.** Nine of the writer's real answers from 7 November, with the page figures each was handed (`src/test/fixtures/eyeRealAnswers.json`), are held to the checker's rules by `convex/utils/sees/realAnswers.test.ts`: each still passes, keeping most of its sentences and a step. Their briefs are checked too, and three pages' limits were set from these real figures, as a live page hands over its charts' figures as well.
  - **The replays cost about $1.50** in all, both ways on Google Analytics, the new way only elsewhere.
- **7 November, finishing the plan** (Anthony: "we need to finish the job before we commit"):
  - **The last two drift tests, built.** The check every test of every period calls is now `expectEyeHolds` (`src/test/eyeHolds.ts`, renamed from `codeFirstBrief.ts` as it holds more than the brief):
    - **Every figure key the writer is handed is one the checker knows.** Each finding's figures come under its own number (`f2.` for the second), which is how the writer is handed them beside their finding; no two share a key; and every key in the brief is one of the page's.
    - **No finding says what its page never talks about.** The words come from each topic in the page's `never` list that is a plain list of what it never counts (`neverWordsOf`): money on every page that forbids it, conversions, sales and busy or quiet on Services, visits, conversions and enquiries on Bing and Search Console, clicks, times shown and places on Bing's Crawling. A row's own name is left out first, so a page called "Enquiry form" is still its name, and "money pages" is the app's own name. A topic about how a thing is said ("enquiries as people") is left to the writer's rules. `src/test/eyeHolds.test.ts` holds the words themselves, so a reworded topic can't quietly leave its page unchecked.
    - All 84 pages pass on every date their tests cover: 809 eye tests.
  - **Code digs, built on Services.** The headline says where its move came from: the service and the channel that moved most the same way, where each made a quarter of the move or more (`withWhereFrom`, `googleAnalyticsShared.ts`). On Ronins' last 12 months: "The service that rose most: AI Agency. The channel that rose most: Organic Search." Their names only, in the finding's words for the writer: with their figures too, the first press put a third figure in the headline's sentence, which the Editor refuses, and was written twice. Their rows' figures are in the brief, as rows a finding names. The panel's own words are unchanged. Other pages can take the same part once their lists are passed to it.
  - **The two slips, fixed for every page.**
    - **A rate for every 100 visits leads with its number:** "AI Agency: 0 events for every 100 visits, against 5.5", where code wrote "events for every 100 visits 0, against 5.5" before. A "%" the writer types after such a rate, known by its words or its field's name ("forEvery100"), is taken off where the words go on "for every 100", and said as "in every 100" elsewhere: "turns 1% of its visits into events" reads "turns 1 in every 100 of its visits into events" (`withoutTypedUnits`).
    - **Whose figure moved:** the writer's rules now say "Say whose figure each change is, as its finding names it: \"AI Agency's visits fell\", never \"visits fell\" when one row's did."
  - **A name with numbers in it is no typed figure.** Services names its groups by their numbers ("30 visits or more, and under 1.6 events for every 100"), and two of three presses were sent back for naming one. The checker now takes the page's own names out before it looks for typed numbers, however the writer joins their words (`namesWithNumbers`, `withoutNames`, `utils/seesAsk.ts`); a number typed beside one is still sent back.
  - **Checked on Ronins' Services, three presses each way** (replays of the saved answers, on the same figures):

    | | Before these fixes | After |
    |---|---:|---:|
    | Last 12 months | 8.1 cents, written twice | 3.6 cents, once |
    | Last month | 5.7 cents, twice | 5.4 cents, twice |
    | This week | 9.0 cents, twice | 5.3 cents, twice |

    Before, two were sent back for naming a group and one for the dig's third figure. After, the two rewrites were the writer's own slips: a sentence over 20 words in both (a group's long name in one), and in This week the headline's three figures in one sentence ("fell 51.9% to 13 from 27"), which the finding's own words invite. Every rate is said as "0 events for every 100 visits, against 4.3", and the pieces say where changes came from ("led by Organic Search", "Bespoke Software Development rose most", "AI Agency fell by 42.6% to 35 visits as Organic Search declined"). One sentence still reads as a guess ("Because of this, All your services brought 40% of all events"), which Jev let through. These six presses cost 37 cents.
  - **Found, not fixed: figures the writer can't name.** A page hands its writer at most 400 keyed figures, in the page's order. On Channels, Overview, Clarity's Overview and Pages, Visibility's AI demand and All pages, the lists that come first use them up, so the brief hands over up to 559 bare numbers the writer can't name, many in rows the findings name (Channels' device split and shop steps). Writing one sends the words back. The short brief had the same gap. It waits for Anthony's word.
  - **Bing joined, on its hand-written figures.** No website on dev has Bing connected, so its writer was run on the test figures its rules are tested on (`bingMoreHandlesByHand.json`), on More Handles' record, with its section's links, through a harness taken out again afterwards. Keywords: 9.7 cents the old way, 6.6 the new, with the same main points (clicks down 12.7% to 398, 23 new searches and 25 lost, "alexander and wilks" 3rd on Bing and 24.8th on Google, door handles slipping). Performance: 3.6 cents the new way, true to its figures; the old way got no answer from Google either time. Pages: refused both ways this time. Google refused about half the calls, both ways. Its first real press, once a website connects Bing, is read by hand. These 13 runs cost 49 cents.
  - **Where it ends:** every section with an eye that writes is on the brief (Google Analytics with Services, Search Console, Visibility, Insights, Bing and Clarity), each page with rules of its own; the cache and the drift tests hold every page. The switch (`CODE_FIRST_SECTIONS`) now lists every section, so it can come out whenever wanted; it's kept for now as the way to take one section off quickly.
