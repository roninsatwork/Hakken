# Google Analytics — Tracking health: the checklist

**Planned and built on dev 2026-10-15** (Anthony: "Build the Tracking
health checklist plan"; see "Built"). Anthony asked for "a new
and better UX" for Tracking health and "3 examples". Three were drawn on the
canvas
[GA Tracking health — three ways](https://claude.ai/artifact/WGx1UxHc3gamQuHUKsQyLC),
with a check's own screen that all three open. He chose option 1: "Go with
option 1, The checklist". A copy of the two boards, their pictures and
their outlines are in
[docs/plans/assets/ga-tracking-health/](../assets/ga-tracking-health/).
Change a decision here, with a date, before building anything that disagrees
with it.

**It follows the section's data standard**,
[ga-stored-figures-plan.md](./ga-stored-figures-plan.md). The screen asks
Google nothing: everything it shows comes from the checks the weekly run
already keeps on the connection (`connection.health`, and `hostVisits` for
the other addresses). No new collection, no new ask.

## Why

Today the page is a warning box, then one card for each failing check, each
three paragraphs long (what's wrong, why it matters, how to fix it), then the
passing checks folded away. On ronins.co.uk, with 4 checks failing, that is
about two screens of text before the passing checks. The checklist puts the
verdict in one row of figures and every check on one line, failing first. A
check's long words move to its own screen.

## The page (TH1)

Top to bottom:
1. **Page header**, as built.
2. **What Hakken sees**, as built (`trackingHealthSees`).
3. **Four figures**, from the checks held:
   - **Checks passing**, "8 of 12", with "4 need a look" (or "all pass");
   - **Visits Hakken can't credit**, the share with no channel or no landing
     page (`TOO_MUCH_UNKNOWN`'s share);
   - **Conversions that never happen**, how many (`NEVER_HAPPENS`' names);
   - **Visits on other addresses**, how many Hakken leaves out (`STRANGERS`'
     count). A check that passes reads 0 in its figure.
4. **One table of all 12 checks** (`DataTable`), the failing ones first,
   each part in the plan's check order (`inCheckOrder`). Columns:
   - Check, a link to the check's own screen;
   - Status, `StatusLabel` "Needs a look" or "Passing";
   - What Hakken found, the check's short words when failing, its passing
     words otherwise;
   - It affects, a `TagLabel`: which figures the check is about (TH3).

   The table bar reads "12 checks" and "Needs a look first · click a check for
   what to do". Under the table, in quiet words: "Hakken's team was told in
   the bell when each started failing, once."

The warning box and the folded passing list go: the figures and the table
hold both.

## A check's own screen (TH2)

At `tracking-health/check?key=NEVER_HAPPENS`, opened from the table:
1. **`DetailHeader`**, back to Tracking health: the check's title; what it
   checks and when it was last checked; its `StatusLabel` underneath.
2. **What Hakken sees**: what was found and why it matters. Its Do first is
   the fix as numbered steps, each with its link (Connection, Google
   Analytics, the website).
3. **What it found**, for a check that names things: the conversions it
   names (with their Google names and times), the other addresses (with
   their visits, from `hostVisits`), or the pages counted twice. Checks that
   name nothing have no list.
4. Today's buttons, **Set a value** and **Choose what counts**, move here,
   for a person who can manage the connection.

## New words (TH3)

Each check gains three things in English and Italian:
- **affects**: the table's tag ("Conversions", "Channels, landing pages",
  "Pages a visit, bounce rate", "Every figure", …);
- **about**: one sentence for the screen's description ("Whether each
  conversion counted has happened in the last 90 days");
- **steps**: the fix as two to four numbered steps.

## Tests and drift (TH4)

- Look tests: the page (board "Checklist") and a check's screen (board
  "Check"). `google-analytics/look/TrackingHealth.txt` is retired.
- The new screen joins `ANALYTICS_SCREENS` and the What Hakken sees drift
  test. Ask Hakken's tracking health answer reads the same checks and is
  unchanged.
- Every check's steps, about and affects words exist in both languages.

## Estimate

About a day: the page, the check's screen, 36 sets of words in two
languages, and the tests.

## Decided while building

- **The check's list says what is wrong with each name**, in one column
  ("What Hakken found": Never happened, Not counted, No value, Matches …),
  in place of the drawing's "Times, last 90 days" and "Counted": the same
  list then serves every check that names conversions.
- **The steps live with What Hakken sees' words**, as
  `googleAnalytics.seen.trackingHealth.step.<check>.s1…`, with `why.<check>`
  and `passing.<check>`, so the check's box is the section's own box
  (`trackingCheckSees`). It is not saved as advice: the page's box already is.
- **A long list of addresses is said short** in the table and on Overview:
  "34 visits were recorded on 15 other addresses, such as …". The check's
  own screen lists them all, with each one's visits.
- Two step links are new: **Google Analytics** and **Your website**, which
  open them in a new tab.

## Built

Built on dev 2026-10-15:
- `src/app/(dashboard)/app/analytics/[siteId]/tracking-health/page.tsx`:
  the figures and the table, sorting by Check, Status (the opening order)
  and It affects, with its download.
- `src/app/(dashboard)/app/analytics/[siteId]/tracking-health/check/page.tsx`:
  a check's own screen.
- `convex/utils/sees/analytics.ts`: `trackingCheckSees` and each check's
  steps (`CHECK_STEPS`).
- `convex/googleAnalyticsConnect.ts`: the status carries `hostVisits`.
- Words in English and Italian: `health.figures`, `health.table`,
  `health.screen`, each check's `about` and `affects`, and What Hakken sees'
  `why`, `passing` and `step`.
- Tests: the two looks in `docs/plans/assets/ga-tracking-health/look/`;
  ronins.co.uk's checks in order and its uncounted enquiry's screen; every
  check's box worded in both languages. `google-analytics/look/TrackingHealth.txt`
  is retired.
