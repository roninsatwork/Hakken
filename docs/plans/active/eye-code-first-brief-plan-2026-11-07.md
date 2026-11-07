# Plan: the eye's code-first brief, tried on Services, then every page

**Written 2026-11-07.** Anthony asked why a press of the eye costs what it does, then: "Surely we find the key stats in code first then pass the results into the llm to write it up". On the old rule (the eye guide's round 6, give the writer the whole page and never a checklist): "Ignore the rule as the ask conterra was awful then, we are looking at best practice here against cost efficiency". On trying it: "Yes please let's try it on this page". On what comes after: "if we maintain good quality we need make a plan to roll this out to every page with the eye".

**Status:** the trial is built on Services, on dev, not committed. The rollout and the next cost cut wait for Anthony's go.

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

## Next, waiting for Anthony's go

1. **Stop most rewrites, and halve the cost again.** On the first answer, leave off a step over 20 words when two good steps stand, and a sentence with a fault when three good ones stand, as the checker already does after a rewrite. Rewrite only when a first finding is missing or too little stands. Expected: about 2.5 cents a press. It changes what a press may keep without a second try, so it needs his yes.
2. **Code digs, for quality.** For the biggest change, code adds where it came from to the brief: the channel, device and service that moved it. That's the step the writer kept skipping in October, and it's cheap.
3. **The two slips.** Say every rate as "for every 100 visits" in the brief's own words, and name the subject of each change ("AI Agency's visits", never "service visits"), so the writer can't mix them up.

## Rollout to every page with the eye

103 pages have an eye that writes: Google Analytics 18, Search Console 25, Visibility 35, Insights 14, Bing 7 and Clarity 4. The brief only changes a page whose code finds things first. A page with no findings of its own still hands the writer the whole page, and gets its own rules first.

- **One section at a time,** in this order: Google Analytics, Search Console, Visibility, Insights, Bing, Clarity. Each joins `CODE_FIRST_BRIEF` in one change.
- **Measured the same way as Services:** for two or three of its pages, three dates each on one website, the new words beside the answer saved before, with tokens, cost and rewrites. A page whose words get worse stays out, and the reason is written down.
- **Tests:** the brief keeps every row a finding names on each page's saved figures, where a fixture exists.
- **Cost of checking:** about 50 presses at about 5 cents, near $2.50, spread over the sections.
- **Time:** about a day of agent work, most of it reading the words side by side.
- **Done when** every section is on the brief or has a written reason not to be, and `CODE_FIRST_BRIEF` can be removed, as every page uses it.
