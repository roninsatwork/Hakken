# Usage for clients: build plan

**Status:** Plan, waiting for Anthony's go. The screens aren't built. The capture work (step 0) is built and running on the dev deployment, but it isn't committed.
**Date:** 23 November 2026
**Drawn on:** the canvas "Usage for your clients" (https://claude.ai/artifact/RzbWT2SpnyfAGXroKRRTrm), version 14. The boards are saved in `docs/plans/assets/usage-for-clients/`, with `board.tsx.txt`, the React source that drew the Overview, By work and the two detail pages from the app's real parts. The Statement, By website and Coming up boards are copies of today's pages, made lean.

## What was asked

Anthony, 23 November 2026, looking at `/app/usage`:

- "at the moment it feels like an admin area thing and not a user facing thing"
- "remember this is customer facing and not an admin tool", then "customers are not that sophisticated so it has to be super simple to use and understand"
- "I never said remove it, I said remove the stuff that belongs in the admin section". The Statement, every charge and each press of the eye stay, because "this is a credits based system".
- "remove way 1 and 3 but leave 2", then "i want this screen as the first screen they see in usage with the secondary nav"
- "I am happy with the statement layout", then "it needs to be inside the new secondary nav"
- "remove the second lines - its one line per row with a detail page if we need to display it"
- "assume this displays only the turned on items for the client", and "can we use the names like insights - visibility, search console and google analytics"
- "by work no, by website yes", because By website "shows all the credits consumed in the month by the website itself, so it's a good split to see where the costs are". Then "Yes, today's screen" for Coming up.
- "lets add all the detail to the capture ... its important we track more than we are"
- "there should be no wide tables at all - we keep it clear and simple and move to a detail page", and "one line per table and move stuff to a detail page"

## Step 0: the capture (built, on dev, not committed)

Every charge now saves its section, and the eye, Ask Hakken and MCP charges also save their website, page and what was asked (`convex/creditDetail.ts`, the hooks in `convex/creditHooks.ts`, set in `openCreditRun`). `creditDetail:fillChargeDetail` filled in the 724 older charges on dev and moved the eye's credits from "Not tied to a website" to their website. Period House Group's November now shows morehandles.co.uk at 695 credits, up from 85. The tests are in `convex/creditDetail.test.ts`, and the 151 tests around charges pass. **It should be committed before anything else**, so no other session's push to dev takes it back off.

## What the section looks like

The sidebar has one **Usage** item, as Google Analytics has. Beside every Usage page sits a secondary menu (`SectionMenu`, as Google Analytics lays it out):

- **Usage:** Overview, Coming up, Statement
- **By work:** one item for each section the client has switched on (Search Console, Google Analytics, Visibility, Insights, Ask Hakken, MCP, Hakken tasks, Keyword research), each with the month's credits, biggest first
- **By website:** each website the client owns or tracks, with the month's credits, and "Not tied to a website" only when it isn't empty

| # | Page | What's on it | Drawn as |
|---|---|---|---|
| 1 | **Overview** (the first screen) | Three boxes: used in the month, with the month before under it; left now, with when unused credits end; next month's credits. Credits each day as bars, which grow in as the page loads, with a hover naming the day ("Thursday 5 November"). Credits by website: Website, Credits, the month before. Links to the Statement and Coming up. | Way 2 |
| 2 | **Statement** | Today's Statement, its boxes, filters and download, with a lean table: one line a row, and each row opens the charge's own page. | Today's, lean |
| 3 | **A charge's own page** | What the second lines said: what it was for, the website, the page, the person and how it was charged, the credits, which month's plan paid, and the balance after. Never a real cost. | New |
| 4 | **By work** | One section's month: its credits out of the month's, what it did, and every charge for it, one line each. | As drawn |
| 5 | **By website** | Today's By website, with a lean table: one line a row, each opening the charge's own page. The menu picks the website. | Today's, lean |
| 6 | **Coming up** | Today's Coming up, with a lean table: one line a row, each opening the check's own page. | Today's, lean |
| 7 | **A scheduled check's own page** | What Coming up's table no longer shows: who set it up, the credits each run uses, the next run's time, how often it runs, and what it'll use to the month's end and next month. | New |

## Every table is lean

No wide tables anywhere (Anthony, 23 November). Each table has its name and at most five more columns, one line a row, and the rest on the row's own page.

| Table | Columns | Moved to the row's own page |
|---|---|---|
| Overview, Credits by website | Website, Credits, the month before | |
| Statement | What for, When (date and time on one line), Who, Out, In, Balance | how it was charged, the page, the website, which plan paid |
| By work | Page, When, Website, Who, Credits | |
| By website | What for, When, Who, Out | how it was charged, the page |
| Coming up | Check, Website, Next run, How often, To month end, Next month | who set it up, the credits a run uses, the next run's time |

The Statement's and Coming up's entries come off the frozen list in `scripts/table-columns-allowlist.json` when they're built.

Old addresses (`/app/usage/work`, `/app/usage/websites`, `/app/usage/coming-up`, `/app/usage/statement`) keep working and land on the same pages.

## The reads

- **Credits by section.** Today the month's sums are kept by kind of work and website. An eye press's section depends on its page, so By work needs a sum by section too. That means a small month-by-section rollup, written where the others are written (`bumpCreditRollup`, `moveChargeRollups`), filled once for past months, and read by the summary.
- **A section's charges.** The Statement's read takes a `section`, on a new `creditCharges` index by company, section and time.
- **One charge.** A new tenant read, `usageCharge({ chargeId })`, returns one of the company's own charges with its detail and nothing about real cost.
- **Switched on.** The menu reads the company's switched-on sections (`effectiveModulesFor`), so a section that's off isn't listed. Its old charges stay on the Statement.
- **Empty rows.** The summary leaves out a website row with nothing in the month, like October's "Not tied to a website" at 0.

## States

- **Nothing used this month:** the Overview's boxes still show what's left, and the chart and table say nothing has used credits yet.
- **A past month:** the month menu, as today. "Left now" becomes what ended unused.
- **Credits run out:** today's warning stays at the top of the Overview.
- **A read-only person:** sees everything. There's nothing to press except downloads.
- **A company with several websites, like Korda's five:** a row each in the Overview's table and in the menu.

## The eye and Ask Hakken

Usage shows the company's credits, not one website's figures, so it gets no eye (Anthony's rule of 3 November: no eye on pages that aren't one website's data).

Ask Hakken answers questions about credits (Anthony, 23 November: "Yes, include it"). One new read tool, `read_usage`, gives it the month's credits by section, by website and by day, what's left, what's booked, and the charges behind a section or a website, from the same reads the pages use. It never sees a real cost. It's tested on "what used most of my credits this month?", "how much has morehandles.co.uk used?" and "will I run out?".

## Words

All new words go in `messages/en.json` and `messages/it.json`, copy the redone screens, pass `check:words` and `check:reading`, and get a fresh reader before Anthony sees them. Today's words on the Statement, By website and Coming up stay as they are.

## Checks before it's handed back

Focused tests while building: the reads (tenancy, sections, switched off, one charge), each page's screen tests, and the table rule. Then the full local gate once: `verify:env`, `lint:all`, `check`, `test:coverage`, `coverage:check`, `test:e2e:smoke` and `build`. Then each page in Anthony's Chrome at 1,330 and 3,200 wide. The approved looks get look tests (`usageLook.test.tsx`). Nothing is committed or pushed without his say-so.

## Settled on 23 November

1. No wide tables: every table is lean, with the rest on the row's own page.
2. Ask Hakken answers questions about credits.
3. The charge page shows the detail in row 3. Coming up's rows get a page of their own (row 7).

## Not in this build

- Buying credits, top-ups and the Purchases page, which are still parked (usage-credits-plan.md, step 4).
- Switching charging on (step 5).
- An agency view across several companies (PRODUCT.md, Part Three).

## Size

About 12.5 developer days, or 4 agent days:

- step 0, commit the capture: done, it only needs committing
- the secondary menu, its layout and the single sidebar item: 1
- the Overview: 1.5
- credits by section (the rollup, its fill, the index and the reads): 1.5
- By work by section: 1
- the Statement's lean table, and the charge page with its read: 1.5
- By website on one line: 0.5
- Coming up's lean table in the menu, and a check's own page: 1.5
- empty rows and small fixes: 0.25
- words: 0.5
- Ask Hakken's `read_usage` tool and its tests: 1.5
- tests, look tests, the gate and the Chrome check: 2
