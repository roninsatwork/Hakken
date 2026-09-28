# Limits on three levels: platform, company, website

**Started 2026-09-28. Status: built on dev 2026-09-28 (Anthony: "we are good to
build this please"), awaiting review. Not committed.** Change a decision here,
with a date, before building anything that disagrees with it.

Drawing: the canvas "Platform limits" (claude.ai artifact
`5nBzuJXhN6M24QibVvcddM`) — board 1 is the new System Settings → Limits screen,
board 2 is a company's new Limits screen (Ronins Agency).

## What was asked

Anthony, 2026-09-28, while the fan-out work (docs/plans/active/
prompt-fan-out-queries-plan.md) was turning its fixed caps into settings:

- "i think we need a rethink of limits"
- "We need another level / it shold be Platform - company - website"
- "i tnk the platfortm defaults should ne anotehr option on the system settigns
  menu"
- "then the compnay can inherit the platfotm default but we can overtide"
- Earlier the same day, of the caps the fan-out work listed: "We need this
  limits on the company and on the website" and "We need this in the ux we
  can't keep hiding things".

- On the first drawing: "this is good but i dotn udnersatnd the text / can we
  make it easier to understand for an admin team to look after the platform".
  The words were rewritten for an admin team, and the limits grouped by topic
  (second drawing, same day).
- On the second drawing: "whats an angle", then, offered "topic" instead:
  "yes topic is good". **"Angle" is called "topic" on every screen** (see
  "The word topic", below).
- Showing a website's Schedule and limits (ronins.co.uk): "This shoudl be two
  screens / Schedules / Limits" and "can you ensire the compnay section ahs the
  same wordign and options as teh system settings please". **Schedule and
  limits becomes two screens, Schedules and Limits**, for a company and for a
  website; **a company's Limits reads exactly like System Settings → Limits**.
- Seeing the built page's read-only card of limits fixed in code: "why are
  tehse not drop downs and configurable", then "ok do it please". **All seven
  are settings**: competitors collected per website on all three levels, and
  the other six — each about something every company shares — set by the
  platform alone, in a card called **Same for every company**.

Decided by those words, so not open here: three levels; the platform's numbers
live in System Settings, as a new item on its menu; a company follows the
platform unless it sets its own; a website follows its company unless it sets
its own; the screens are written for an admin team looking after the
platform, not for developers.

## What is there today

Two sets of limits, both on a company's **Schedule and limits** and on each
website's **Schedule and limits**:

| Set | Code | How many | What a company does | Where "the default" is |
|---|---|---|---|---|
| Data limits | `convex/companyDataLimits.ts` | 3 | Always holds its own numbers; no "follow" choice | Constants in code: 1,000 each |
| Prompt, fan-out and tracking limits | `convex/fanOutLimits.ts` (built 2026-09-28, not yet committed) | 15 | Can leave a limit on "1,000 — the platform default" | A `fallback` number per limit, in code |

A website has "Follow the company (n)" on both. So the platform level already
exists, but only as numbers in code: nobody can see or change it on a screen.

## The rule

Every limit is read the same way, nearest first:

1. **Website** — its own number, if it set one; else
2. **Company** — its own number, if it set one; else
3. **Platform** — always has a number. It starts at today's numbers in code,
   so nothing changes on the day this is built.

Two limits are about a whole company, so they stop at the company: purchases
per collection, and rows read across the company's websites. The fan-out
limits still apply only to a company's own websites, never to a competitor, as
today.

## Screens

### Words for an admin team (all three levels)

The limits are the same on the platform page, a company's page and a
website's page — same groups, names, sentences and dropdowns — so an admin
learns them once.

- **Grouped by topic**, one card each, instead of the two cards named after
  where the numbers are stored: **Google data for each website** (6),
  **AI prompts** (5), **Matching AI searches to pages** (6), **Whole
  company** (2) and **Same for every company** (6, the platform's alone). Each card opens with one or two sentences saying what it is
  about; the AI prompts card says what a prompt, a fan-out query and a topic
  are, and the "Wordings kept per topic" row shows one with a real example:
  "best lead system for carp fishing" and "best lead systems for carp
  fishing" are two wordings of one topic.
- **Plain names** (the table below has each one beside its key in code).
- **Every limit says what it is in one or two short sentences** (what it
  controls, and what happens when it is full or lowered), **then a cost
  line**, with a coin icon: the cost in dollars, "Uses AI", or "No cost".
- **Units in every dropdown**: "1,000 keywords", "28 days", "3 suggestions",
  "Off" — never a bare number.
- **"Use platform default (1,000 keywords)"** is a company's first choice;
  **"Use company setting (1,000 keywords)"** a website's.
- A card's footer says when a change takes effect ("Changes apply from the
  next run").

### New: System Settings → Limits (board 1)

- A fourth tab, **Limits**, beside Identity, Security and System Options. One
  page, so the tab has no dropdown. Address `/admin/settings/limits`. Super
  admin only, like the rest of System Settings.
- Title **Default limits**: "How much is bought, kept and shown for every
  company, unless a company or a website is given its own number."
- A strip showing the three levels, numbered, with this page lit:
  1 · Platform (this page) → 2 · Company (its Limits page) → 3 · Website (its
  Limits page), and one line under it: "Change a number here and it changes for
  every company and website that doesn't have its own." The same strip is on
  every Limits page, with that page's level lit.
- The four topic cards. Each dropdown offers the choices; there is no "use
  default" choice here, because the platform is the top.
- Under a limit, one line names any company that has its own number, linked
  to that company's Limits — for example "Ronins Agency has its own number:
  500 backlinks". A limit every company follows has no line.
- A save button in each card, like the company screen. Every change is
  audited (`PLATFORM_LIMITS_CHANGED`).
- A last card, **Same for every company**: six limits only the platform sets,
  because each is about something every company shares — one AI answer serves
  every company asking the same prompt, one purchase every company watching
  the same site. Until the second build these were a read-only card, "Built
  into the platform" (drawn as "Built into Hakken"; the platform's name is a
  setting, and screen words never hard-code it —
  `src/no-client-specific-fallbacks.test.ts`). On a company's Limits the card
  shows the platform's numbers, each with "Set in System Settings", and a
  website's Limits does not show it.

### Changed: Schedule and limits becomes two screens, Schedules and Limits

In a company's Websites menu, under Collection, **Schedule and limits** is
replaced by two entries, in his words: **Schedules** and **Limits**, then Runs
and cost as today. Both work for All websites (the company) and for one chosen
website, like every other entry in that menu.

| Screen | Company (All websites) | One website |
|---|---|---|
| **Schedules** | What the Schedule card holds today — collect data on or off, how often, what time — with Collect now, and the cost card (Cost to serve · last 30 days) below it. | What its "How often, and from where" card holds today — its own schedule or the company's, collect on or off, how often, what time, where you watch from. A competitor also keeps which of the company's sites it is watched against, and the link to its shared website record. |
| **Limits** | Board 2, below. | The same, one level down (below). |

The old addresses keep working: they open Schedules.

### A company's Limits (board 2)

**The same page as System Settings → Limits** — the same four topic cards,
names, sentences, cost lines, choices and footers, and the same Built into
the platform card. The differences are only what being one level down needs:

- Title **Limits**: "How much is bought, kept and shown for Ronins Agency's
  websites. Each limit uses the platform default unless you pick a number
  here."
- The levels strip with **2 · Company** lit, and 1 · Platform linking to
  System Settings → Limits. Its line: "Change a number here and it changes for
  every website of this company that doesn't have its own."
- Every dropdown starts with **Use platform default (n)**, n being whatever
  the platform page says. The line "Using the defaults: 1,000 keywords kept…"
  goes, since the dropdowns now say it.
- Under a limit, one line names any of the company's websites that has its own
  number, linked to that website's Limits — as the platform page does for
  companies. Ronins today: "ronins.co.uk has its own number: 10,000 keywords"
  (keywords kept), "…: 1,000 keywords" (re-checked every run), "…: 1,000
  backlinks".

### A website's Limits

The same page again, one level further down: the strip with **3 · Website**
lit; **Use company setting (n)** as every dropdown's first choice, n being
what the company uses — its own number or the platform's; no lines under the
limits, as nothing sits below a website. A competitor's page shows only the
limits that apply to a competitor — keywords kept, keywords re-checked and
backlinks kept — since it asks no prompts of its own, as today.

### The word "topic"

"Angle" becomes **topic** on every screen, not only the new ones. What is
stored and named in code stays as it is (`fanOutAngles`, `anglesShown`,
`MISSING_ANGLE`); only the words people read change:

- `messages/en.json` and `messages/it.json`, the same 17 keys in each:
  `admin.siteView.moves.kinds.MISSING_ANGLE` ("Missing angle" → "Missing
  topic"), `sites.tableCounts.angles`, `sites.aiSearched.description`,
  `descriptionCompetitor`, `pageFilters.missing` ("Missing angles" → "Missing
  topics"), `notBuilt`, `decisions.catalogue.seoAnglePage.description` and
  `rule`, and the fan-out limits' labels and descriptions (which the shared
  topic cards replace anyway).
- Italian: "angolo/angoli" → "argomento/argomenti" ("Argomenti mancanti").
- The AI searches page's download name, `missing-angles` →
  `missing-topics`.

## What happens to limits already saved (real data, dev, 2026-09-28)

A company's saved Data limit that equals today's default (1,000) becomes
**Use platform default**; anything else stays the company's own. Nothing
collected changes on the day — the numbers are the same — but a later change on
the platform page then reaches them.

| Company | Keywords kept | Checked every run | Backlinks kept |
|---|---|---|---|
| Korda | 1,000 saved → follows the platform | never set → follows the platform | 1,000 saved → follows the platform |
| Ronins Agency | 1,000 saved → follows the platform | never set → follows the platform | **500 — stays its own** |

- Korda's company row is then empty and is removed; Ronins' keeps backlinks
  500.
- Websites keep everything they set: kordatackle.com 10,000 keywords;
  ronins.co.uk 10,000 keywords, 1,000 backlinks, 1,000 checked every run;
  Korda's 11 competitors 100 backlinks each, four of them also 1,000 keywords.
- Fan-out limits: no company has saved any, so both follow the platform on all
  15.

## Every limit, and where it starts

The platform page opens on these — today's numbers in code. Names are the
screen's; the key is where the number lives (`companyDataLimits.ts` for the
three marked *data*, `FAN_OUT_LIMITS` in `fanOutLimits.ts` for the rest — if
that list changes before this is built, the screens follow it).

**Google data for each website** — platform → company → website.

| On screen | Key | Choices | Starts at |
|---|---|---|---|
| Keywords kept per website | `keywordsPerSite` *data* | 100, 250, 500, 750, 1,000, 2,500, 5,000, 7,500, 10,000 | 1,000 keywords |
| Keywords re-checked every run | `everydayKeywords` *data* | the same | 1,000 keywords |
| Tracked keywords per website | `trackedPerSite` | 100, 250, 500, 750, 1,000 | 1,000 keywords |
| Backlinks kept per website | `backlinksPerSite` *data* | 100 to 10,000, as keywords | 1,000 backlinks |
| Competitors collected per website | `competitorsPerSite` | 10, 25, 50, 100 | 100 competitors |
| Days in a Search Console position | `consoleDays` | 7, 14, 28 | 28 days |

**AI prompts** — platform → company → website.

| On screen | Key | Choices | Starts at |
|---|---|---|---|
| Prompts per website | `promptsPerSite` | 10, 25, 50, 100, 250, 500, 1,000 | 10 prompts (the code's number since 2026-09-28; this table said 1,000) |
| Fan-out queries checked every run | `fanOutTrackedPerSite` | 50, 100, 200, 500, 1,000 | 200 fan-out queries (added 2026-09-28, [fan-out-opt-in-plan.md](./fan-out-opt-in-plan.md)) |
| Fan-out queries read per prompt and AI | `searchesPerEngine` | 25, 50, 100, 150, 200 | 100 searches |
| Wordings kept per topic | `wordingsPerAngle` | 5, 10, 25, 50 | 25 wordings |
| Topics on the AI searches page | `anglesShown` | 250, 500, 1,000, 2,000, 3,000 | 1,000 topics |
| Google AI Overviews bought per prompt | `googleSearchesRead` | Off, 25, 50, 100, 250 | Off |

**Matching AI searches to pages** — platform → company → website.

| On screen | Key | Choices | Starts at |
|---|---|---|---|
| Topics checked in one batch | `anglesJudgedPerRun` | 10, 20, 40, 80 | 40 topics |
| Topics checked per run | `anglesJudgedPerCollection` | 100, 250, 500, 1,000, 2,000 | 1,000 topics |
| Pages offered per topic | `pagesOffered` | 4, 8, 12 | 12 pages |
| Site audit pages looked through | `auditPagesRead` | 1,000, 2,500, 5,000, 10,000 | 5,000 pages |
| Ranking pages looked through | `rankedPagesRead` | 1,000, 2,500, 5,000, 10,000 | 5,000 pages |
| Missing topics suggested per run | `missingAnglesSuggested` | 1, 3, 5, 10 | 3 suggestions |

**Whole company** — platform → company only.

| On screen | Key | Choices | Starts at |
|---|---|---|---|
| Purchases per run | `purchasesPerCollection` | 1,000, 5,000, 10,000, 25,000 | 25,000 purchases |
| Rows shown across all websites | `companyRowsRead` | 1,000, 2,500, 5,000, 10,000 | 5,000 rows |

**Same for every company** — the platform alone (`convex/sharedLimits.ts`).
Each was a constant in code until 2026-09-28 and starts at that number; its
largest choice is the most the code safely takes.

| On screen | Key | Choices | Starts at | Was |
|---|---|---|---|---|
| Fan-out queries kept from one AI answer | `fanOutPerAnswer` | 25, 50, 100 | 50 searches | `MAX_FAN_OUT_QUERIES` |
| Sources kept from one AI answer | `sourcesPerAnswer` | 20, 40, 80 | 40 sources | `MAX_SOURCES` |
| Businesses kept from one AI answer | `businessesPerAnswer` | 100, 200, 400 | 200 businesses | `MAX_CITATION_ROWS` |
| New websites noticed per purchase | `newWebsitesPerPurchase` | 25, 50, 100 | 50 websites | `MAX_DISCOVERED` |
| Google AI Overview searches kept per purchase | `overviewSearchesPerPurchase` | 500, 1,000, 2,000 | 2,000 searches | `MAX_SEARCHES_FILED` |
| Rows in one download | `rowsPerDownload` | 10,000, 25,000, 50,000 | 50,000 rows | `MAX_EXPORT_ROWS` |

Competitors collected per website was `SEO_COMPETITORS_PER_WEBSITE`, which
stays as its ceiling (100): the run never collects more for one website, and
the screens listing a website's competitors read up to it.

Two dropdowns stop where they do because of a fixed ceiling behind them:
tracked keywords per website at 1,000 (`MAX_CANONICAL_ROWS`,
`SEO_KEYWORD_CHECKS_PER_WEBSITE`) and purchases per collection at 25,000
(`SEO_MAX_SENDS_PER_CYCLE`).

## How it is built

### Backend

- **`platformLimits` table**: one row, one optional number per limit (the 3
  Data limits and the 15 fan-out limits). Absent means the starting number in
  code. Super admin only.
- **`convex/platformLimits.ts`**: `readPlatformLimits(ctx)`;
  `getPlatformLimits` (every limit's number, its choices, and which companies
  set their own, for the lines under each limit); `setPlatformLimits`
  (refuses a number that is not one of the choices; audited). It composes the
  two existing lists — `DATA_LIMIT_CHOICES` and `FAN_OUT_LIMITS` — rather
  than declaring them again.
- **The readers gain the platform step inside**, so the collection code that
  calls them does not change: `readCompanyDataLimits`,
  `resolveSiteDataLimits` and `readSiteDataLimits` in `companyDataLimits.ts`;
  `resolve` and `readFanOutLimits` in `fanOutLimits.ts`. Order: website →
  company → platform → code.
- **`companyDataLimits`**: `keywordsPerSite` and `backlinksPerSite` become
  optional, so a company can follow the platform one limit at a time; a
  company following on all three keeps no row, as a website already does.
  `getCompanyDataLimits` returns the company's own numbers (null = follows)
  and the platform's; `setCompanyDataLimits` takes null for "follow".
- **Migration** (`convex/dataMigrations.ts`): a company's Data limits equal to
  1,000 become "follow"; rows left empty are removed. Korda's row goes;
  Ronins' keeps backlinks 500.
- **`FIXED_LIMITS`**: the read-only card's list, read from the constants
  themselves (exported where they live), so the screen cannot drift from the
  code.

### Screens

- **One set of limit rows for all six cards** (platform, company and website,
  times the two sets). `FanOutLimitRows` moves to
  `src/app/(dashboard)/admin/_components/LimitRows.tsx`, where both the
  settings and the companies screens can reach it; its "follow" choice
  becomes optional (none on the platform). The Data limits cards use it too —
  today they each carry their own copy of the same rows.
- **Cards are topics, not tables**: a card can hold limits from both stored
  sets (Google data mixes three Data limits with two fan-out ones), and its
  save writes each limit to the set it belongs to. The topic list, names,
  sentences, cost lines and units are one list shared by the three levels.
- **One Limits page component for all three levels**, given its level: the
  strip lit at that level, the first dropdown choice (none, "Use platform
  default", "Use company setting") and the lines naming the level below. That
  is how a company's Limits stays word for word the platform's.
- **New route** `src/app/(dashboard)/admin/settings/(system)/limits/page.tsx`
  and the tab in `(system)/layout.tsx` (lucide `Gauge`). The page wears its
  own `PageHeader` without a divider, like the other System Settings tabs.
- **Schedules and Limits in the Websites menu**: `websitesSection.ts` swaps
  its `schedule` entry for `schedules` (lucide `CalendarClock`) and `limits`
  (`Gauge`). Company: `…/websites/schedules` and `…/websites/limits`; website:
  `…/site/[companyWebsiteId]/schedules` and `…/limits`. The old `…/websites/data`
  and `…/site/[companyWebsiteId]/settings` redirect to Schedules. The existing
  cards move whole: `SiteSchedule`, `TrackedPairing` and the company's schedule
  card and `CollectionCost` to Schedules; nothing about scheduling changes.
- English and Italian wording together (`messages/en.json`, `messages/it.json`).

### Tests

- The rule, per limit: website → company → platform → code; a whole-company
  limit ignores a website row.
- `setPlatformLimits`: refuses a number off the list, refuses anyone but a
  super admin, writes an audit record.
- The migration, on the two real shapes above.
- Screens: the platform page shows every limit, grouped by topic, with its
  cost line and the "has its own number" line; a company's Limits shows the
  same cards and words as the platform's, with "Use platform default (n)", and
  a website's with "Use company setting (n)"; the Limits tab is on the System
  Settings menu; the Websites menu shows Schedules and Limits, and the old
  addresses open Schedules; no screen says "angle".
- `npm run check:guards` (screen kit), locale parity.

## Order of work

0. Wait for the fan-out work to be committed: it is editing the same limits
   files today (`fanOutLimits.ts`, `FanOutLimitRows.tsx`, the Schedule and
   limits cards).
1. Backend: the platform level, the readers, the migration.
2. System Settings → Limits, built as the one Limits page for all three
   levels.
3. Schedule and limits split into Schedules and Limits, for a company and a
   website, with the old addresses redirecting.
4. "Angle" → "topic" on every screen, English and Italian.
5. The seven limits that were fixed in code, as settings (second build).
6. Local checks (`npm run verify:env`, `npm run lint:all`, `npm run check`,
   `npm run build`, `git diff --check`), then a local commit.

Nothing is bought and no collection is run by any step.

## Not in this plan

- Turning any fixed cap into a setting — name one and it joins the platform
  page.
- Plan (billing) allowances per company.
- Spending budgets: each agent's own cost limit per run is the control.

## Built — 2026-09-28

On dev, not committed (commits wait for Anthony's word).

- **Backend**: `convex/platformLimits.ts` (the eighteen limits as one list,
  each level's page query and save, the built-in list read from the constants
  themselves); `convex/platformLimitRow.ts` (the platform's row, read by both
  sets' readers); the `platformLimits` table; `companyDataLimits` fields
  optional per limit; the platform step inside `readCompanyDataLimits` and
  `readFanOutLimits`, so collection reads it with no change of its own. The
  screens' old per-set queries went with the cards that used them.
- **Screens**: one `LimitsScreen` (`src/app/(dashboard)/admin/_components/limits/`)
  for System Settings → Limits, a company's Limits and a website's; the
  Schedules pages keep what was there; `…/websites/data` and a website's
  `…/settings` redirect to Schedules; the sidebar lights System Settings on the
  Limits tab.
- **Migration** `2026-09-28-company-limits-follow-platform`, run on dev:
  2 companies read, 2 changed. Korda's row went (both its 1,000s now the
  platform's); Ronins keeps its own 500 backlinks. Nothing was bought.
- **Words**: English and Italian; "angle" is "topic" in every screen string
  (`convex/platformLimits.test.ts` fails one that comes back).
- **Tests**: `convex/platformLimits.test.ts` (the rule on three levels, the
  whole-company limits, the platform's save — choices, super admin only,
  audited — the "has its own number" lists, a competitor's limits, the
  migration, and the screens' list and words); `LimitsScreen.test.tsx` (each
  level on screen, in the real English words); the moved Schedules tests; the
  menu tests.

## Built — second round, 2026-09-28

The seven fixed limits became settings (Anthony: "ok do it please"):

- `convex/sharedLimits.ts`: the six the platform alone sets, their reader, and
  `getSharedLimits` for the parse and export actions, which cannot read the
  database themselves. Each place that used a constant reads the setting: an
  AI answer's sources, businesses and fan-out queries and a competitor
  purchase's new websites (`seoCollectionParse.ts` — the fan-out queries are
  cut once, so the list kept and the list judged are the same), an AI Overview
  purchase's searches (`aiOverviewFanOuts.ts`) and a download
  (`siteExports.ts`). Re-filing an answer clears up to the largest choice.
- `competitorsPerSite` in `FAN_OUT_LIMITS`: website, else company, else
  platform, read by collection planning (`seoCollection.ts`) and the run
  report (`seoRunReports.ts`); never on a competitor.
- The "Built into the platform" card and `FIXED_LIMITS` went; "Same for every
  company" took its place — dropdowns on the platform, read-only on a company.
- Nothing was bought, and every setting starts at the number the code used.
