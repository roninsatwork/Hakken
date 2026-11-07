# Plan: the eye's code-first brief, tried on Services, then every page

**Written 2026-11-07.** Anthony asked why a press of the eye costs what it does, then: "Surely we find the key stats in code first then pass the results into the llm to write it up". On the old rule (the eye guide's round 6, give the writer the whole page and never a checklist): "Ignore the rule as the ask conterra was awful then, we are looking at best practice here against cost efficiency". On trying it: "Yes please let's try it on this page". On what comes after: "if we maintain good quality we need make a plan to roll this out to every page with the eye".

**Status:** the trial is committed to dev (071edaa7). On "Do it", the next cost cut (keep a good first answer) is built on Services too, on dev, not committed. The rollout, with the cache change below, waits for Anthony's go.

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

Switched on by `CODE_FIRST_BRIEF` in `pageData.ts`, which holds Services alone.

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

## Next, waiting for Anthony's go

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

- **One section at a time,** in this order: Google Analytics, Search Console, Visibility, Insights, Bing, Clarity. Each joins `CODE_FIRST_BRIEF` in one change.
- **Measured the same way as Services:** for two or three of its pages, three dates each on one website, the new words beside the answer saved before, with tokens, cost, rewrites and time. A page whose words get worse stays out, and the reason is written down.
- **Cost of checking:** about 50 presses at about 3 to 5 cents, near $2.50, spread over the sections.
- **Time:** about a day of agent work, most of it reading the words side by side, plus the tests below.
- **Done when** every section is on the brief or has a written reason not to be, every guard below passes, and `CODE_FIRST_BRIEF` can be removed, as every page uses it.

## Tests that stop the eye drifting

Anthony, 7 November: "We need plenty of tests around the eye to stop drift". Each is a test with no AI cost that runs on every check, so a change that weakens the eye fails before anyone presses it.

- **Every page on the brief is tested on saved figures.** A guard fails a page in `CODE_FIRST_BRIEF` with no fixture test, as `src/ask-hakken-chart-pages-drift.test.ts` already does for a page's own rules.
- **The brief keeps what the findings need.** On each page's saved figures, every row a finding names is in the brief, and every figure key a finding gives the writer is one the checker knows.
- **The brief stays short.** Each page's brief stays under a set size on its saved figures, so a new list on a page can't quietly make every press dearer. The sizes may shrink, never grow.
- **The checker's rules hold.** "For every 100" is never a typed number; a "%" after a key is tidied; a first answer stands only with the first findings said, three sentences and two steps; anything less goes back once.
- **The cache holds.** An end user's answer stands while the figures are the same, up to 24 hours; new figures write again; a super admin's Refresh always writes again and charges nothing.
- **Every date the menu offers.** Each page's rules find its headline and enough to say on all seven dates, as Services' already do.
- **What each page never says.** Each page's findings never use the words its `never` list forbids: money on Google Analytics, conversions on a service business, busy or quiet on Services.
- **The words a press writes.** A small set of saved answers per section, written by a real press, is held to the checker's rules whenever the rules change. Running a fresh press stays a hand check, as it costs money.
