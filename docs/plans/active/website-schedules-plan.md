# A website's Schedules — everything Hakken collects, each with its own switch

**Planned 2026-10-15. Status: built and committed on dev 2026-10-15 (see "Built").** Anthony asked
"how do i know if Korda is set to collect anything outside of data for SEO —
Bing, Search Console, Google Analytics, Clarity — do we need on and off
toggles for those too", then "redo the UX of the entire page to make it
easier to understand, i don't want toggles just plonked without a rethink".
The page is drawn on the canvas
[Website schedules — what is collected](https://claude.ai/artifact/TCvasgt72zHLppjzRGK5S1)
(three boards; a copy, their pictures and their outlines in
[docs/plans/assets/website-schedules/](../assets/website-schedules/)).
Anthony approved it: "ok lets build this please". Change a decision here, with
a date, before building anything that disagrees with it.

## Why

Admin → a company → Websites → a website → Schedules showed only DataForSEO's
schedule, behind two switches that hid each other: "Collect data for this
website" only appeared once "Use its own schedule" was on. Nothing on it said
whether Search Console, Google Analytics, Bing Webmaster or Clarity were
collected, and nothing on the page could stop them: those four collect every
connected website every day, and disconnecting was the only off.

What was found on 2026-10-15, building it:

- **Korda collects nothing at all.** Its company switch ("Collect data for
  this company") is off. The DataForSEO Planner only plans companies whose
  switch is on (`seoAgentRuns.listCollectingCompanies`), and the queue drops
  anything else as "switched off" (`seoCollectionQueue.stillWanted`). The old
  page still said "kordatacle.com and its competitors are pulled Monthly",
  because `resolveWebsiteSchedule` lets a website's own switch outrank its
  company's. The new page says what the Planner does.
- No Korda website has Search Console, Google Analytics, Bing or Clarity
  connected. Bing's collector has no schedule at all yet.

## What the page is (WS1–WS8)

- **WS1. One table, "What Hakken collects".** One row per source, in this
  order: Rankings and AI answers (paid), Search Console, Google Analytics,
  Bing Webmaster, Clarity (free). Columns: Source (its name and what it gives),
  Status, How often, Next, Last collected, Cost, On. A competitor's page has the
  rankings row only, and says the other four are for the company's own
  websites.
- **WS2. Status is a `StatusLabel`, its icon carrying the meaning**: Collecting
  (tick), Switched off (dash), Not connected (info), Connect again (warning),
  Not scheduled (warning: the source's collector has no running schedule), Off
  for all of <company> (warning).
- **WS3. The switch sits on its row and acts at once** (as on AI → Models →
  Providers). A source that is not connected has a Connect link instead, which
  switches into the company's workspace and opens that source's Connection
  page there.
- **WS4. Off keeps everything.** A free source switched off stays connected
  with everything collected; its collector skips it until it is switched on.
  Rankings switched off is the website's own "collect" switch, as before.
- **WS5. The company's switch is the master.** When it is off, the rankings
  row says "Off for all of <company>" whatever the website's own switch or
  schedule says, and the card warns, with a link to the company's Schedules.
  (Board 1 drew "Collecting" for kordatacle.com with its own schedule; that was
  the old page's claim, corrected on 2026-10-15 before building.)
- **WS6. One card, "When rankings and AI answers are collected".** A choice of
  "Same as <company>" or "Its own"; Its own opens the four cadence cards and
  the day and time (`SeoScheduleFields`, unchanged). Then the next run, that
  competitors are collected the same day, and where it is watched from (its
  Market page). One Save. Switched off, the card says so and nothing else.
- **WS7. A competitor's card starts with "Watched against"**: the company's
  own websites and "Not paired". Paired, it is collected with that website and
  links to that website's schedule; unpaired, it has the same choice as WS6.
  The old separate "Watched against" card goes.
- **WS8. Gone from the page:** "Use its own schedule", "Collect data for this
  website" (now the rankings row's switch), the paragraph under "How often",
  and "Every engine is asked live…".

## Data

- `switchedOff` (optional) on `searchConsoleConnections`,
  `googleAnalyticsConnections`, `bingConnections` and `clarityConnections`.
  The four collectors skip a connection that has it, both when listing
  websites and when a website's own run starts.
- A website's rankings switch is `companyWebsites.collectionEnabled`, as
  before: off is `false`; on is absent, so the website follows its company's
  switch, which is what the Planner obeys. Saving the schedule no longer
  touches the switch.
- `websiteSources.getWebsiteSources` (super admin) reads the page in one go;
  `websiteSources.setSourceOn` and `websiteSources.setRankingsOn` write the
  switches, each with an audit line.

Nothing asks Google, Bing or Clarity while this is built or tested.

## Build

1. Plan, approved drawing saved with its pictures and outline.
2. `switchedOff` on the four connections; the collectors skip it.
3. `getWebsiteSources`, `setSourceOn`, `setRankingsOn`; the schedule save
   leaves the switch alone.
4. The page (`SiteSchedule.tsx`, the Schedules route), from kit parts only.
5. English and Italian.
6. Tests: the collectors skip a switched-off website, the queries and
   switches, the page's states, and its look test against the saved outline.

## Follow-up, not in this build

- `resolveWebsiteSchedule` still lets a website's own "on" outrank its
  company's "off", which the Planner does not. Only screens read that today
  (the company Websites list's next run, a shared website's pace). Aligning it
  is its own small change.
  **Done 2026-10-15 (on dev, uncommitted).** The company's switch is now the
  master in the resolver itself: a website collects only while its company's
  switch is on and its own is not off (`seoScheduleService.ts`).
  `getWebsiteSources` reads the resolver instead of applying the rule itself.
  What changes, by caller:
  - **Admin → a company → Websites** (`getCompanyWebsites`,
    `listCompanyWebsiteRows`): a website under a company switched off reads
    "Not collecting" with no next run. Korda's kordatacle.com did not.
  - **Admin → Websites, and a website's watchers** (`getPaginatedWebsites`,
    `getWebsiteById` through `soonestPull`): a company switched off no longer
    sets a shared host's pace, and its watcher row reads "Paused".
  - **The client's Discovery → Websites list and site header**
    (`sites.ts`, through `loadSite`): no cadence or first check for a company
    switched off.
  - **Read, but on no screen today:** `getCompanyWebsiteById`'s `effective`,
    `getSiteHeader`'s `schedule`, and the monthly costs built on `loadSite`
    (`getSiteHeader`, the search, question and rival rows). For a company
    switched off they now say no next run and $0 a month, because nothing is
    bought.
  - **The Planner** (`collectedOnItsOwn`, `dueByCadence`, `findFreshPull`
    through `isWebsiteDue`): no change to what is bought. Scheduled runs only
    reach companies switched on, where the old and new rules agree. A
    collection opened while the company is off — an agent's
    `dataforseo.collection.start`, or one still being written when the switch
    goes off — no longer plans its websites switched on; before, it planned
    them and the queue dropped them unsent (`stillWanted`).
  Tests: `seoScheduleService.test.ts` ("what one website runs at"),
  `websites.test.ts` and `seoCollection.test.ts` (Korda's case), each failing
  under the old rule.

## Built (2026-10-15, on dev)

- **Data:** `switchedOff` on the four connections; Search Console's, Google
  Analytics' and Bing's runs skip it when listing websites and when a
  website's run starts, Search Console's mid-run check stops on it, and
  Clarity's morning neither lists it nor hands over its token.
  `convex/websiteSources.ts` reads the page and writes both switches;
  `websites.setCompanyWebsiteSchedule` no longer clears the switch when it
  is not sent. Clarity's 04:50 UTC is one constant (`CLARITY_MORNING_UTC`),
  shared by the cron and the page.
- **Screen:** `schedules/page.tsx` draws the header and the table;
  `WebsiteSources.tsx` gives its rows; `SiteSchedule.tsx` is the card. The
  old `TrackedPairing.tsx` card is gone, and with it the "See how it
  compares with …" link (the Competitors page is a click away in the menu).
- **New kit part, named to Anthony:** `Switch` (in `SettingsCard.tsx`), the
  switch `SettingSwitch` already drew, shared so a table row can carry it;
  `docs/developer/screen-kit.md` says when to use it.
- **Beyond the drawing:** the table's footer ("5 sources", one page), which
  `check:screen-kit` requires of every table; and three states the drawing
  had no case for: Being set up (a connection begun, not finished: Finish),
  Connect again (Google, Bing or Clarity took the access back) and Not
  scheduled (the source's collector has no schedule running — Bing's, today).
- **Tests:** `convex/websiteSources.test.ts` (the company switch as master,
  the switches, every collector passing a switched-off website by), the
  page's own test, and its look test against
  `docs/plans/assets/website-schedules/look/` (Main, Connected, Competitor).
