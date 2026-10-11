# Search Console — Volatility, and What Hakken sees on every screen

**Started 2026-10-10. Status: drawn and approved 2026-10-10 (Anthony: "Yes
I love them"), with What Hakken sees folding away ("Ye this is good"); this
plan written the same day, and the five reliability fixes added ("add this
to the plan"). Nothing built. Built only by the session that drew it, when
Anthony says go — not by any other agent (Anthony, 2026-10-10: "I don't want
the other agent to build it"). It starts after another agent finishes its
own, separate work.** Follow
`AGENTS.md`, the [drawing guide](../../developer/drawing-guide.md), the
[core data normalisation plan](core-data-normalisation-plan.md)'s rules
(nothing stored twice, every screen held to a reading budget) and the
[What Hakken sees plan](discovery-detail-and-hakken-sees-plan.md) §2. Change
a decision here, with a date, before building anything that disagrees with it.
Progress: §10.

The drawings are on the canvas "Hakken Volatility"
(https://claude.ai/artifact/6DvTyapj8mzncwUYPAQf3u, version 9) and saved in
[`docs/plans/assets/search-console-volatility/`](../assets/search-console-volatility/):
`Main.dc.html` (Volatility), `Updates.dc.html` (Google updates), and each with
What Hakken sees folded (`VolatilityFolded.dc.html`, `UpdatesFolded.dc.html`),
with a picture of each (`01-volatility.png` to `04-google-updates-folded.png`). Both were
redrawn from the running app's own Search Console screens (Google updates,
Wins and losses) and the kit's What Hakken sees. The drawings are the look;
this plan is what stands behind them.

What Anthony said, 2026-10-08 to 2026-10-10:

- The brief: Hakken "needs to behave like it's an SEO agency and an SEO
  specialist. It needs to replace the agency with its access to the data."
- On the first drawings (four pages and a new menu item): "the tables are too
  full of data", "charts are not wide enough", "it feels too crammed in and
  messy".
- On where the numbers come from: "why can't we use Search Console data, we
  get that every day, we get positions and we get classification".
- On the redraw, one page inside Search Console: "Yes I love them".
- On Ask Hakken: "I want the app to be consistent with its advice."
- On how reliable it is: "Is that the best way of doing it, is this the most
  reliable for all scenarios" — then, on the five fixes, "add this to the plan
  but I want to make the what hakken sees to be site wide not just this
  screen", and the box folding away on every screen. The site-wide part is
  §8 of this plan.
- "I also want to make the box an accordion on each screen so once you read it
  you can minimise it and get more screen real estate back."
- "If a screen in Discovery, Search Console or Analytics is missing a What
  Hakken sees, we need to add it where it makes sense."
- On the two plans being apart: "Why is this not in the volatile plan" — so
  they are one plan.

**In plain words.** When a client's numbers drop, the first question is "was
it Google, or was it us?" Volatility answers it the way a specialist would:
how much the website's positions on Google moved each day, out of 10, beside
Google's own updates — and What Hakken sees says what that means and what to
do first. It is one page in Search Console, read from the Search Console data
Hakken already collects every day. Nothing is bought.

**What this replaced.** The first direction (2026-10-08, the "SERP volatility
index" session) was a new menu item with a list of websites and four pages:
Overview, Search features, Google updates and a website list. Most of it
repeated pages Hakken already has (Search Console's Google updates and Wins
and losses, Discovery's Search features), and Anthony found it crowded. It
was redrawn as this plan's two screens on 2026-10-10.

## 1. Decisions

| # | Decision | Status |
|---|---|---|
| V1 | **Where.** One page, "Volatility", in Search Console's menu under Changes, between Wins and losses and Google updates (`/app/search-console/[siteId]/volatility`). No new item in the main menu and no list of websites: Search Console's own list opens each website. | Approved with the drawing, 2026-10-10 |
| V2 | **The source.** Search Console's daily positions for the website's keywords, already collected every day. Nothing is bought from DataForSEO. Search Console reports the website's own positions, not the rest of Google's page, so the score is "how much your positions moved", not "how much Google's page moved". | Agreed 2026-10-08 ("why can't we use search console data") |
| V3 | **The score** (§3): each day, every keyword with 10 or more impressions that day and the day before; how far its average position moved, counted up to 10 places; the day's score is the average, 0 to 10. Levels: Normal under 4, High 4 to 7, Very high 7 and over. | As drawn. The threshold and the levels are checked on real data in Phase 1; if they need to change, Anthony sees the numbers first |
| V4 | **Worked out once, stored small.** After each collection, beside the chart rows Search Console already builds (`chartFigures` → `searchConsoleWeeks`): four numbers per day, week and month row — the score, the keywords counted, those that moved 5 places or more up, and down. No new table. Days are kept 60 days, as every Search Console day row; weeks and months beyond, each the average of its days, as Position bands is. | Proposed with this plan |
| V5 | **Countries.** As every Search Console page: each country kept ready (the website's home countries). A country asked of Google live has no stored days, so the page says Volatility is worked out for the home countries. | Proposed with this plan |
| V6 | **The Volatility page** (§2.1): title, What Hakken sees, four figures, one chart across the full width, the search row with two filters, one table of four columns. | Approved with the drawing |
| V7 | **The keyword table is read when the page opens** from the two newest days' kept lines; nothing is stored for it. Held to a reading budget, tested at five times morehandles.co.uk. | Proposed with this plan |
| V8 | **Google updates** (§2.2): gains What Hakken sees, and a Volatility column (the 14 days before an update began → while it rolled out) in place of Moved, so the table stays six columns. Position already shows the move. The page's approved look (`search-console-redesign/look/Updates.txt`) is replaced by this one. | Approved with the drawing, 2026-10-10 |
| V9 | **What Hakken sees** (§4): fixed rules over the page's own numbers, as on every Discovery and Analytics screen; no AI model, nothing bought, no extra reads. The words live in `messages/en.json` and `messages/it.json` under `searchConsole.seen`. | Approved with the drawing |
| V10 | **Consistent advice.** Advice is decided in one place: the page's rules. Saved, stamped with its day of figures, given to Ask Hakken and read by every surface that advises — on every screen, by §8 (HS4–HS7). Volatility's boxes follow it. | Anthony, 2026-10-10: "I want the app to be consistent with its advice" |
| V11 | **Ask Hakken reads Volatility** (§5): its figures and its box, through the saved advice (§8, HS5, HS7), plus a read of the score and figures themselves. | Proposed with this plan, under V10 |
| V12 | **Search features over time** stays (Anthony, 2026-10-08: "we need both"), but on Discovery → Google results → Search features, where the weekly DataForSEO results pages already are: a "last 12 weeks" chart. Drawn and planned separately; not in this plan. | Agreed 2026-10-10 |
| V14 | **Google's update list fills itself** (was Q1). Google's own Search Status page is read every day and each new ranking update added to Admin → Content → Google updates, in Google's words, translated as every update is; it stays editable there. The August 2026 spam update, missing today, comes in with it. Without it, "Google announced nothing" can be wrong. | Anthony, 2026-10-10: "add this to the plan" |
| V15 | **Demand is told from ranking.** When clicks and impressions fall together while positions hold, the box says fewer people searched — demand, not Google and not the site — instead of blaming an update (§4.1). | Anthony, 2026-10-10: "add this to the plan" |
| V16 | **The newest days can still change.** Search Console's last three days settle over time: a verdict judged on them is marked as such and worked out again when they settle (§8, HS6). | Anthony, 2026-10-10: "add this to the plan" |
| V17 | **The box folds away**, as on every screen (§8, HS1–HS3): folded, one line with its first sentence; opened again by itself when its advice changes. Boards 2 and 4. | Approved with the drawing, 2026-10-10 |
| V13 | **Only what is stored.** The example numbers in the drawings are made up; the keywords, the update and its dates are ronins.co.uk's real ones. Every figure on the built screens comes from stored Search Console data. | — |

**Why V14.** The verdict "it looks like Google" depends on the list of
Google's updates, typed in by hand until now (Admin → Content → Google
updates). Corrected 2026-10-11: the list held June's, August's and
September's spam updates — the page showed only September's because its
dates were the last 30 days. The feed's first run added the five older ones
(May and March core, March spam, February Discover, December core).

## 2. The approved look — binding

A change to any of this is drawn and approved again first (`lock-approved-looks`).

### 2.1 Volatility

Inside Search Console's section, as its other pages: the section's header,
dates and side menu are unchanged; the side menu gains **Volatility** under
Changes. Top to bottom:

1. "Google's figures to {day}; the last three days can still change." (as
   every Search Console page).
2. `PageHeader` without a divider: the brand-colour `activity` icon,
   **Volatility**, and one line: "How much your positions on Google moved each
   day, out of 10: 0 when nothing moved, 10 when every keyword moved ten places
   or more. Read from Search Console, for the keywords with 10 or more
   impressions that day."
3. `HakkenSees` (§4).
4. `FigureRow` of four figures, the first emphasised:
   - **Latest day, {day}**: the score, with its level as a `StatusLabel`
     (Normal: success, High: warning, Very high: danger).
   - **During Google's update**: the score while the newest update in the
     dates rolled out, and "{n} in the 14 days before". With no update in the
     dates: **Last 7 days**, and "{n} the week before".
   - **Moved 5 places or more**: keywords on the latest day, and "{a} down,
     {b} up, on {day}".
   - **Clicks, last 7 days**: clicks, with the change on the week before.
5. One `ChartCard` across the content column: **Volatility, day by day**,
   "Out of 10: normal under 4, high from 4 to 7, very high from 7. Hover a G
   for the update." One line, the score, in the dates and step chosen, the y
   axis at 0, 4, 7 and 10; Google's updates marked as on every dated chart.
6. The search row: "Search keywords…", and two filters — **Brand or
   non-brand** (the website's brand words, as Brand and non-brand) and **Up or
   down**.
7. One `DataTable`, the standard Search Console table (count and Download all
   (CSV), headings that sort over the whole list, numbered pages of 25, 50, 75
   or 100): **Keyword** · **Position** (the day before → the latest day) ·
   **Moved** (▲/▼ places, `Change`) · **Clicks** (last 7 days). It opens on
   the most moved first. A keyword opens its Search Console record.

### 2.2 Google updates

As built, with three changes:

1. The description gains: "…and volatility the 14 days before it began → while
   it rolled out."
2. `HakkenSees` under the header (§4).
3. The table's **Moved** column becomes **Volatility**: "{before} → {during}"
   in the before → after style of Clicks and Position. An update older than
   the stored scores shows a dash.

The side menu gains Volatility, as on every Search Console page.

## 3. The score

- **Per keyword, per day.** A keyword counts on a day when it had 10 or more
  impressions that day and the day before. Its move is the change in its
  average position between the two days, counted up to 10 places (a keyword
  falling 40 places counts as 10, so one outlier cannot carry the day).
- **The day's score** is the average of the counted keywords' moves, to one
  decimal: 0 when nothing moved, 10 when every counted keyword moved ten places
  or more. Fewer than 10 keywords counted: no score that day ("too few
  keywords"), drawn as a gap.
- **A week's or a month's score** is the average of its days' scores,
  worked out while its days were kept.
- **Moved 5 places or more**: the counted keywords whose move was 5 or more,
  up and down kept apart.
- **Where it is worked out.** In `chartFigures`
  (`convex/searchConsolePeriods.ts`), which already adds up each day's kept
  lines into the Position bands and Brand and non-brand rows after every
  collection; it reads the day before from the same lines. Four numbers join
  each `searchConsoleWeeks` row: `volatility`, `volatilityKeywords`,
  `movedUp5`, `movedDown5`.
- **Calibration (Phase 1).** Worked out over the 60 days held for
  ronins.co.uk and morehandles.co.uk before any screen is built: how many
  keywords pass 10 impressions on a day, the score on quiet days, and the
  score during the September 2026 spam update. The levels are right when a
  quiet fortnight reads Normal. If the threshold or the levels must change,
  Anthony sees the numbers and agrees first.

## 4. What Hakken sees

Fixed rules over the page's own numbers, most important first; three
sentences and three steps at most; the words under `searchConsole.seen`,
English and Italian. The wording below is the drawing's.

### 4.1 Volatility

| When | It says | Do first |
|---|---|---|
| The latest day is High or Very high, and a Google update was rolling out or finished in the last 14 days | "Google's {update} ran from {start} to {end}, and your positions moved {ratio} as much as usual while it did." · "Your clicks fell {n}% in the last week, in step with it." (when they fell 5% or more) · "That points to Google reshuffling its results, not to a change on your site." | 1. "Hold big changes to your pages until {end + 14 days}, while Google settles." → Google updates · 2. "Check the {n} keywords that dropped 5 places or more." → this page, Down · 3. "If they haven't come back by {end + 14 days}, look at the pages they land on." → Pages |
| High or Very high, and no Google update | "Your positions moved a lot on {day}, and Google has announced no update." · "When only your keywords move, start with your own pages." | 1. "Check the {n} keywords that dropped 5 places or more." → this page, Down · 2. "Look at the pages they land on." → Pages |
| Clicks fell 10% or more, impressions fell with them, and positions held (Normal) | "Fewer people searched this week: your impressions fell {n}% while your positions held." · "That is demand, not Google and not your site." | 1. "See which keywords lost the searches." → Keywords, by impressions lost |
| Normal | "Google is calm for your keywords: {score} out of 10 on {day}." · with clicks changed 10% or more: "Your clicks {rose/fell} {n}% this week; that is down to your pages or to demand, not Google." | 1. "See which keywords gained and lost clicks." → Wins and losses (with the clicks sentence only) |
| Too few keywords counted | "Fewer than 10 of your keywords had 10 impressions on {day}, too few to judge." | — |
| No days stored yet | "Volatility starts once Search Console has two days of figures for this website." | — |

"Usual" is the 14 days before the update began; {ratio} is "twice",
"three times" and so on, rounded down. During an update, when impressions
fell as much as clicks while positions held, the first row's third sentence
becomes the demand sentence (V15). A verdict judged on one of the last three
days ends "Google's figures for {day} can still change." (V16).

### 4.2 Google updates

| When | It says | Do first |
|---|---|---|
| An update is still rolling out | "Google's {update} has been rolling out since {start}." · "Your positions are moving {ratio} as much as usual." | 1. "Hold big changes to your pages until it finishes." → Volatility |
| The newest update finished less than 14 days ago | "Google's {update} finished on {end}." · "Your positions moved {ratio} as much as usual while it ran: {during} out of 10, against {before} before it." · "What it did to your clicks shows on {end + 14 days}, once 14 days have passed." | 1. "Hold big changes to your pages until {end + 14 days}." → Volatility |
| It finished 14 days ago or more | "Google's {update} {raised/cut} your clicks by {n}% and moved your average position from {a} to {b}." | 1. With clicks down 10% or more: "See the keywords that lost clicks." → Wins and losses |
| No update in the dates | "Google announced no update in these dates." | — |

## 5. Ask Hakken

Ask Hakken is given the website's saved advice at the start of a
conversation, Volatility's included (§8, HS5, HS7). This
plan adds the read of the score itself:

- **One read, the page's own.** A new Assistant read,
  `searchConsoleVolatilityInternal` in `convex/assistantReads.ts`, calls the
  same function the page calls, for the latest day of the website asked about
  (found among the company's own holds, as the other reads do). It returns the
  score and its level, the four figures, the box's sentences and steps in the
  conversation's language, and the page's address.
- **The same words.** The sentences come from the same rules and the same
  messages file as the page, never written by the model. The Assistant's
  instructions say: when a question is answered by a page's What Hakken sees,
  give its verdict and steps as written and link the page; add detail when
  asked, never different advice (V10).
- **Tested** by asking the read and opening the page for the same website and
  day, and comparing the words.

## 6. Reading and storage

- **Stored:** four numbers on each existing `searchConsoleWeeks` row. For
  morehandles.co.uk, about 60 day rows, 26 weeks and 16 months per country:
  a few kilobytes. No new table and no new index.
- **Read when the Volatility page opens:** the chart rows for the dates (as
  Position bands reads), the two newest days' kept lines for the table, the
  update list (as Google updates reads) and the clicks for 14 days. A
  reading-budget test at five times morehandles.co.uk, as every Search Console
  page has.
- **Google updates** reads the score rows covering each update in its dates,
  alongside what it reads today.
- **Nothing is bought.** No DataForSEO call, no AI model.

## 7. Phases

Built in this order, by the session that drew it, when Anthony says go. Part
A is What Hakken sees on every screen (§8); part B is Volatility.

| Phase | What | Days |
|---|---|---|
| A1 | **Folding.** `HakkenSees` folds (HS1–HS3); its kit part, `screen-kit.md`, tests for folding, remembering and opening again on new advice; looked at on three screens in Anthony's Chrome. | 0.5 |
| B1 | **The score.** Worked out in `chartFigures`, stored on `searchConsoleWeeks`; tests for the rules in §3. Calibrated on ronins.co.uk and morehandles.co.uk (§3); numbers shown to Anthony if the threshold or the levels must change. | 0.75 |
| B2 | **The Volatility page.** Menu entry (`SEARCH_CONSOLE_PAGES`, en/it), route, its query (figures, chart, table), the chart on `SearchConsoleChart`, the table on the standard parts, What Hakken sees (`convex/utils/sees/searchConsole.ts` and a box like `AnalyticsSees`) with the demand rule (V15), reading-budget test, look test against `Main.dc.html`. | 1.25 |
| B3 | **Google updates.** The Volatility column in place of Moved, its sort, What Hakken sees, the description; the look file replaced and its look test updated against `Updates.dc.html`. | 0.5 |
| B4 | **Google's update list fills itself** (V14): Google's Search Status page read daily, new ranking updates added and translated, the August 2026 spam update brought in; tests. | 0.75 |
| A2 | **Saved advice.** Size measured and the 90 days agreed (HS5); the record, written on first working-out per day of figures; the "may change" mark and the re-judging when figures settle (HS6, V16). | 1.5 |
| A3 | **Ask Hakken.** The advice given at the start of a conversation, the read of a whole box, the instructions, the same-words test (HS7); the Volatility read in §5. | 1.5 |
| A4 | **The missing boxes.** Done once the screens another agent is still building for its own work have landed, so the check sees every screen as built. Every screen in Discovery, Search Console and Google Analytics checked; a box added where one is missing and makes sense, its rules and words shown to Anthony first; the guard extended to all three sections (HS8). | 3 |
| — | **Checked.** The full local gate and GitHub's own steps (`AGENTS.md`), then the screens on ronins.co.uk's real data in Anthony's Chrome beside the drawings. | 0.25 |
| | **Total** | **10** |

## 8. What Hakken sees on every screen

What Hakken sees is the box under the title of a screen that says what the
page means for the business and what to do first, written by fixed rules over
the page's own numbers ([its plan](discovery-detail-and-hakken-sees-plan.md),
§2). It is on 79 screens today: 70 in Discovery, the 7 of Keyword research and
2 of Google Analytics, all drawing the one shared part
(`src/ui/components/screens/HakkenSees.tsx`). The folding box is drawn on
boards 2 and 4 (`VolatilityFolded.dc.html`, `UpdatesFolded.dc.html`).

### 8.1 Decisions

| # | Decision | Status |
|---|---|---|
| HS1 | **The box folds away.** Its title row is a button with the chevron Search Console's side menu draws (down when folded, turned up when open). Folded, it is one line: the title, its first sentence cut to the line, the chevron. Open, it is as today. | Approved with the drawing, 2026-10-10 |
| HS2 | **One change, every screen.** The fold is built into the shared `HakkenSees` part, so all 79 screens take it at once, and every screen given a box later. Its kit part (`scripts/drawing-kit/parts.tsx`) and `docs/developer/screen-kit.md` change with it. | Follows from HS1 |
| HS3 | **Remembered, and opened again when the advice changes.** Folded or open is remembered per person and screen, in the browser, as a Sites table remembers its rows per page (`siteTableRows.ts`). A folded box opens again by itself when what it says has changed since it was folded, so new advice is never missed. A box opens the first time. | Proposed with this plan |
| HS4 | **One voice.** A screen's rules are the only place its advice is decided. Every surface that advises reads them: the screen, Ask Hakken, and later the weekly note, Hakken tasks, the Outbox and Telegram. None writes advice of its own. **Reworded 2026-10-11:** what Anthony asked for is consistency, not fixed rules only. Insights' AI-formed findings are allowed ([insights-analyst-plan.md](insights-analyst-plan.md), I14): each is saved once and repeated everywhere, and a screen's box links to a finding rather than contradict it. | Anthony, 2026-10-10: "I want the app to be consistent with its advice"; 2026-10-11: AI findings "yes" |
| HS5 | **Advice is saved.** Each screen's advice for a website is saved as its codes and numbers (never its words, which stay in the language files), stamped with the day of figures it judged. It is written the first time it is worked out on new figures — a page opening, or Ask Hakken reading it — never by a sweep through every screen. It is kept 90 days, so Hakken can say what it advised and when. The size is measured on ronins.co.uk and morehandles.co.uk first, and the 90 days agreed with Anthony before it is built. | Proposed with this plan |
| HS6 | **Figures that can still change.** Advice judged on figures the source may still change (Search Console's last three days, Google Analytics' last two) says so, and is worked out again when they settle. | Proposed with this plan |
| HS7 | **Ask Hakken hears it first.** At the start of a conversation about a website, Ask Hakken is given that website's saved advice: each screen's first sentence and its page. It can read any screen's whole box. Its instructions: give the advice as written, link the page, add detail when asked, never contradict it. Tested by asking and opening the page for the same website and day and comparing the words. | Proposed with this plan |
| HS8 | **A screen without a box gets one.** If a screen in Discovery, Search Console or Google Analytics is missing a What Hakken sees, one is added where it makes sense. Its rules and wording are shown to Anthony before they are built. The guard (`src/hakken-sees-drift.test.ts`) extends to all three sections, so a new screen without a box fails the build. | Anthony, 2026-10-10: "if a screen in Discovery, Search Console or Analytics is missing a What Hakken sees we need to add it where it makes sense" |

### 8.2 The folding box — binding

- **Open:** as today's box, with its title in a button: `What Hakken sees`
  (13px, semibold, uppercase, 0.12em tracking, `text-muted`) on the left, the
  chevron (`h-3.5 w-3.5`, `rotate-180`) on the right, `aria-expanded="true"`,
  the button controlling the sentences and steps below it.
- **Folded:** the card's padding `px-6 py-4`; one row — the title, then the
  first sentence in 13px `text-secondary`, cut with an ellipsis, then the
  chevron; `aria-expanded="false"`. The whole row is the button.
- Hover lights the title, as the side menu's group headings do. No colour of
  its own, no icon, no pill.

### 8.3 What it costs

- **Folding:** nothing on the server: remembered in the browser.
- **Saved advice:** one small record per screen a website's people open, per
  day of figures, kept 90 days. Written only when a screen is opened or read,
  so screens nobody opens cost nothing. Measured before it is built (HS5).
- **Ask Hakken:** one read of the saved advice at the start of a conversation.

## 9. Changes while building — 2026-10-11

Anthony, 2026-10-11, on real data ("yes do all this", and to build straight
through without stopping):

- **Levels against the website's own usual** (§3): ronins.co.uk's days
  score 1.2 to 2.4 and morehandles.co.uk's 0.9 to 2.5, so fixed levels of 4
  and 7 never fired. Normal is up to 30% above the usual, High from 30%,
  Very high from 60%. The usual is the average over the complete days of the
  four weeks before, leaving out days Google's updates rolled out, so an
  update cannot raise the line it is read against.
- **Only complete days are judged**: a day counting fewer than half the
  keywords of the middle of the fortnight before is one Google has only half
  filled in (8 October: 20 against about 120) and is passed over — by the
  figures, the table's day and the chart.
- **The chart fits the scores** (0 to 4 on real data), not 0 to 10.
- **The update is judged on its own days**: if its days ran 30% or more
  above the fortnight before, the box says Google, even when the newest day
  has calmed (ronins.co.uk: 2.1 against 1.5, 40% more, through September's
  spam update).
- The box's words say "{n}% more than usual" rather than "three times", the
  real ratios being 1.2 to 1.5.
- **Saved advice** (HS5) is written when a box shows, as its codes and
  numbers, each checked on the server against the screen's real sentences
  (`convex/utils/seenWords.json`, cut from `messages/` by
  `scripts/seen-words.mjs` and held by `src/seen-words-drift.test.ts`), so no
  one's own words reach Ask Hakken. One record a screen a day, kept 90 days.
- **Ask Hakken** (HS7) is told the conversation's website's saved advice at
  the start, as quoted data with the way to each screen, and has
  `read_advice` (its own connector, "assistant-advice") for any website.
  `convex/hakkenAdvice.test.ts` checks the server writes the screen's very
  words, English and Italian.
- **"Can still change"** (HS6) is met for Search Console by judging only
  complete days. Google Analytics' last two days are not yet marked.

## 10. Progress

- 2026-10-10: drawn and approved, the folding box approved, the five fixes
  added; plan written, with What Hakken sees on every screen merged into it.
  Overall: 0% built.
- 2026-10-11: built on local dev, not committed — A1 folding (all 79 boxes),
  B1 the score (calibrated, §9), B2 Volatility, B3 Google updates, B4 the
  update feed (daily job `google-updates-feed`), A2 saved advice, A3 Ask
  Hakken. Checked in Anthony's Chrome on ronins.co.uk's real data. Overall:
  about 70%. Left: A4, the missing boxes, and the full checks.
- 2026-10-11, later: A4 built — What Hakken sees on Search Console's 20
  screens without one (the website list, Performance, Keywords, Pages,
  Countries and devices, Position bands, New and lost, Wins and losses,
  Almost there, Shown but not clicked, Missed demand, Pages competing, By
  page classification, Brand and non-brand, Click rate by position, Rich
  results, Real against estimated, Tracked keywords and pages, and a
  keyword's and a page's own screens), run on screen over the figures each
  already reads (`convex/utils/sees/searchConsoleScreens.ts`). Google
  Analytics already had its boxes; one Heroes page gives its own advice and
  takes none. The guard (`src/hakken-sees-drift.test.ts`) now covers
  Search Console and Google Analytics, each exception named with its reason.
  Built straight through on Anthony's word (2026-10-11), so the new boxes'
  wording is shown to him after, not before (HS8). The approved looks of
  Search Console's screens gained the box (`look/*.txt`). Full local check:
  7,248 tests passing. Overall: about 95%.
