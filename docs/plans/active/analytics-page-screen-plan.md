# Google Analytics — a page's own screen that tells its story

**Started 2026-10-13. Status: built on dev the same day, every phase, and
checked on ronins.co.uk's Kapferer article (§10); committed to dev, not
pushed (§8, Q5).** The screen
is drawn on the canvas [Hakken — A page's own screen](https://claude.ai/artifact/YQEdmk42tniMbfquwBoWRg)
(one board, a copy in [docs/plans/assets/analytics-page-screen/](../assets/analytics-page-screen/)).
Anthony, on seeing it: "ok i love the page lets make a plan pelae and let me
mknow how many man days this is". Change a decision here, with a date, before
building anything that disagrees with it.

## Why

Anthony, 2026-10-13, on the Insights finding "The Kapferer prism article drew
593 visits but yielded only 1 conversion":

- "do we know if any visitors who started on this page went onto convert …
  And also how many pages they saw and what were they"
- On the page's own screen in Google Analytics: "we need to add the number of
  pages the users see. What else can we add to this page to make the story
  more compelling as it's missing interesting data. Do people come back, do
  we know their devices … what else can we get"
- "maybe the split by referrer — Google, Bing, assistants etc", then "I don't
  think we should group these, these should have individual lines on a table"
- "how can the same page in the google analytics section show no conversion
  … we have a huge problem is data inconsistency"

**What the screen hides today, in figures.** ronins.co.uk's
/hub/kapferer-brand-identity-prism/, last 12 months, United Kingdom:

- The All pages screen says 0 conversions. The Landing pages screen and the
  finding say 1. Both are right. All pages counts conversions **made on**
  the page. Landing pages counts conversions **in visits that started on**
  it, wherever they happened. Both are called "conversions".
- 593 visits started on the article, 13% of the website's 4,494. Google
  search brought 500 of them, and none converted. The one conversion (£20)
  came from a visit typed in. Neither screen shows that.
- People viewed the article 4.4 times each: 2,021 views by 457 people.
  Search engines sent about 1,650 of the views but only about 500 visits, so
  each visit counted the article about three times. The likely cause is the
  article's contents links: Google Analytics counts each jump as a new page
  view. That makes "3.5 pages a visit" and the 14.3% bounce rate read better
  than they are.
- Brand Bible, the nearest article on brand, made 3 conversions from 35
  visits. Google Ad Grants made 6 from 24. Nothing on the screen compares the
  page with its neighbours.

**What this plan is not.** It does not change the Insights agents. Handing
them these figures, and letting them ask follow-up questions, is §9. It does
not redo the Landing pages screen, and it does not fix the wider
inconsistencies found the same day (§9).

## 1. Decisions

- **PS1 — Every figure says what it counts.** Two scopes, named apart on
  every line: "views of this page" and "visits that started on this page".
  Never a bare "conversions" on a page. It is "Conversions made here" and
  "Conversions from visits that started here", side by side. This reaches
  Insights too (Anthony, 2026-10-13): the agents and the Editor follow the
  same rule, so a finding never says a page "yielded" a conversion made on
  another page.
- **PS2 — One line per source, never grouped** (Anthony, 2026-10-13). Google,
  Bing, ChatGPT, Grok, Perplexity, typed in, and every other website
  each have their own line. A kind sits beside the name as a `TagLabel`, but
  there are no group rows. One engine's several addresses (google.com,
  google.es, google.co.uk, google.com.hk) add up to one line, as the agents
  already add them (`siteNameOf`).
- **PS3 — Asked when the screen opens, held until the next collection.** The
  new figures come from questions to Google made when the screen first
  opens, the way its views a day and "Where visitors were just before" are
  asked today (GA23, `askGoogleAnalyticsLive`'s `viewed`). Paging, sorting
  and searching never ask again. Google charges nothing.
- **PS4 — Repeats are counted, not hidden.** "Different pages a visit" counts
  each page once. The page's own repeat count ("counted as 3.5 with
  repeats") sits beneath it, so the reader sees both and Tracking health can
  name the cause (Phase 6).
- **PS5 — Every figure is compared.** Against the whole website, the page's
  own past, or its page group (Content hub), as the drawing shows.
- **PS6 — Charts first, then tables**, each full width, figures written on
  the bars, as every figures screen.
- **PS7 — Age and gender, saying how many Google knows** (Anthony,
  2026-10-13). Google knows the age and gender of about 1 visitor in 10, and
  holds back small groups. Each chart's line says how many of the page's
  readers Google could place ("Google knows the age of 48 of 457 readers"),
  beside the website's own split, so a thin figure is never read as
  everyone.
- **PS8 — Countries: every country** (Anthony, 2026-10-13). "Where its
  readers are" shows every country, whatever the screen is set to. The rest
  of the screen keeps to the country chosen at the top.

## 2. What the screen shows

In the drawing's order. "Held" means Hakken already keeps it. "New ask"
means a new question to Google when the screen opens (§4).

| # | Section | What it counts | Compared with | Where it comes from |
|---|---|---|---|---|
| 1 | What Hakken sees | The page's story in up to four lines, and up to two first steps | — | Hakken's own words (§5) |
| 2 | Figures, first row (kept) | Views; people and views each; time; conversions made here | The 12 months before | Held, today's screen |
| 3 | Figures, second row (new) | Visits that started here; conversions from those visits, with visits for one conversion; different pages a visit; read to the end | The website; the Content hub | Visits and conversions: held (landing list). Pages and read to the end: new ask |
| 4 | Views a day (kept) | Views of this page a day, a dot on a day with a conversion | — | Held, today's screen |
| 5 | Where visitors were just before (kept, chart) | Views, by the page or website before | — | Today's ask, with Google's addresses on one line |
| 6 | Visits that started here, by where they came from | Visits and conversions, one bar per source | — | New ask: the landing page's source split, as the Landing pages screen already asks it |
| 7 | Where visitors went next | Views of the next page, from this page; this page again; left | Share of the page's views | New ask |
| 8 | First visit or back again | People reading the page, new or returning | The website's share returning | New ask |
| 9 | Phone or computer | Share of the page's views on each | The website | New ask |
| 10 | Where its readers are | People reading the page, by country, worldwide (PS8) | — | New ask |
| 10a | Their age | Share of the readers Google could place, by age, with how many that is | The website's known-age split | New ask; the website's is held (`age` list) |
| 10b | Their gender | Share of the readers Google could place, by gender, with how many that is | The website's | New ask; the website's is held (`gender` list) |
| 11 | When they read | Views by day of the week | — | New ask |
| 12 | Against the Content hub's other articles | Visits that started on each of the busiest articles in the page's group, and their conversions; this page in orange | The page group | Held: the landing list and the page classifications |
| 13 | Each source's visits (table) | One row per source: visits, pages, time, read to the end, back again, conversions | — | New ask, beside section 6's |
| 14 | Where visitors were just before (table, kept) | Every page and website before, views and share | — | Today's ask |
| 15 | What its readers clicked (table) | Links out to other websites, and downloads, with clicks | — | New ask: the `click` and `file_download` events on this page |

Each new section carries its search row, download and empty and "asking
Google" states as the kept ones do. Each says when Google held back small
groups (`thresholded`), in the words the Visitors screen uses.

## 3. What Google can and cannot tell

Checked against ronins.co.uk's own figures on 2026-10-13.

- **Clicks between your own pages are not counted.** Google Analytics' `click`
  event is a click that leaves the website (210 in 12 months). Moves between
  your own pages show in "Where visitors went next" instead. Downloads are
  `file_download`.
- **A repeat view keeps the first page before.** The 1,461 views "from
  Google" against about 450 visits from Google say so. So "this page again"
  is worked out from the page's views per visit that saw it, not from the
  page before.
- **"Left the website" is worked out.** It is the page's views less those
  followed by another of the website's pages and its repeats. The chart
  labels it so.
- **Read to the end** is Google Analytics' `scroll` event, sent once a page
  view when a reader passes 90% down (1,271 on the website in 12 months). It
  needs Analytics' enhanced measurement, which ronins.co.uk has on. A
  website without it gets the line "Google Analytics isn't counting scrolls
  on this website", never a 0%.
- **Small groups are held back.** First visit or back again and the countries
  can come back with groups missing on a quiet page. The screen says so.
- **Age and gender:** about 1 visitor in 10, and groups held back (PS7).

## 4. Asking Google (Phase 2)

Added to the `viewed` ask in `convex/googleAnalyticsLive.ts`, which today asks
the page's views a day and the page before. All for the screen's dates,
device and home country, except where it says:

1. **Visits that started here, by page seen**: `landingPage` this page ×
   `pagePath`, sessions and views. This gives different pages a visit, and the
   page's own views per visit (its repeats).
2. **Where visitors went next**: views by `pagePath`, where `pageReferrer` is
   this page.
3. **By source**: the landing page's channel and source split (the `channel`
   list with the landing page as its filter, as the Landing pages screen
   asks it), with `newVsReturning`, and `scroll` events by source.
4. **First visit or back again**: `newVsReturning` × this page.
5. **Phone or computer**: `deviceCategory` × this page, and the website's own
   split from the kept device lists.
6. **Where its readers are**: `country` × this page, every country (PS8).
6a. **Age and gender**: `userAgeBracket` and `userGender` × this page, with
   the people Google could place counted apart from "unknown".
7. **When they read**: `dayOfWeek` × this page.
8. **Read to the end**: `scroll` events on this page against its views. The
   Content hub's figure is from the event's pages list.
9. **What they clicked**: `click` by `linkUrl`, and `file_download` by
   `fileName`, on this page.

About ten questions to Google the first time a page's screen opens after
each collection, then none. Each answer is packed and held as today's are
(`putLive`). The asks go one after another, and a refusal leaves only its own
section saying Google couldn't answer.

## 5. What Hakken sees on the screen (Phase 5)

The page screen's box (`AnalyticsSees` screen `page`, `convex/utils/sees/`)
gains four lines, each with its figures named, in the one voice the
Insights boxes use:

- Visits that started here, their share of the website's, and the
  conversions they went on to, saying where they were made.
- The source that brought the conversions, and the biggest source that
  brought none.
- When the page is counted more than once a visit: "Google Analytics counts
  each person viewing this page 4.4 times", and why.
- The nearest page in its group that converts better.

Two first steps at most, each linked: a next step to the service the page
supports, and the Tracking health fix when repeats are counted.

## 6. Phases and size

Estimates are man-days, as a developer would take.

| Phase | What it does | Man-days |
|---|---|---|
| 0 | **Name the two conversions apart.** "Conversions made here" and "Conversions from visits that started here" on the All pages and Landing pages screens, in English and Italian, and the same rule for the Insights agents and the Editor (PS1). Google's addresses as one line in "Where visitors were just before". | 1.5 |
| 1 | **Visits that started here, from what is held.** The page's landing row on its All pages screen: visits that started here, conversions from them, visits for one conversion against the website's. | 1 |
| 2 | **The new asks (§4)**, each packed, held and read back, with tests of each answer's reading. | 3.75 |
| 3 | **The screen**, built from the kit as drawn: the second figures row, nine chart cards, two new tables, their states, downloads and words in both languages. | 3.25 |
| 4 | **Against the page's group**: the busiest pages in its classification from the landing list, this page in orange. | 0.5 |
| 5 | **What Hakken sees (§5)**: the four lines and two steps, with the one-voice checks. | 1.5 |
| 6 | **Tracking health: pages counted more than once a visit.** It names each page Google Analytics counts several times a visit (more than 1.5 views a visit that saw it), says why, and how to stop it. | 1 |
| 7 | **Proof.** The screen's look test against the drawing, tests, ronins.co.uk's article checked in Chrome, and the full gate, GitHub's steps included. | 1.5 |

**Total: about 14 man-days.** Phases 0, 1 and 4 use only what Hakken already
keeps and go first. Built in one sitting once Anthony says go; when built and
the full gate passes, committed to dev and not pushed (§8, Q5).

## 7. Risks

- **A busy first open.** About ten asks the first time a page opens after a
  collection. Each is quick, but together they take a few seconds. The kept
  sections show at once and the new ones fill in as they come.
- **Thin pages.** A page with a handful of visits gives near-empty charts.
  Below 100 visits the figures are greyed, as the lists already grey
  conversion rates, and the box says the page is too quiet to read.
- **The repeat count is a reading of Google's figures**, not something Google
  states. Phase 6 explains how it is worked out, and the fix is the
  website's.

## 8. Questions — answered by Anthony, 2026-10-13

Asked "any question before we build so we can make it in one sitting":

1. **The order of the sections:** as drawn.
2. **Countries:** every country (PS8).
3. **Age and gender:** added, each saying how many readers Google could
   place (PS7). Drawn on the board the same day.
4. **The two conversions named apart:** on the Analytics screens and in
   Insights (PS1).
5. **When built:** committed to dev once the full gate passes, not pushed.

## 9. Later, not in this plan

- **The Insights agents get these figures and can dig.** Each page's pack
  gains pages a visit, time, bounce, every source and its group's average.
  After an agent drafts a finding, a dig step lets it pick follow-up
  questions (by source, where visits went next, where the conversion
  happened, how its neighbours did) before the Editor checks it. This is why
  a hand reading found what the agents missed. About 4 to 5 man-days, as its
  own plan.
- **The wider consistency list from 2026-10-13.** Search Console's page
  clicks (41) against Analytics' visits from Google (about 500). The Landing
  page screen showing 30 days when set to 12 months. Conversions by age
  adding up to 10 of 169, with "Unknown" at 0. "97.9% new" beside "19.8%
  returning". Each its own fix.
- **The same story on the Landing pages screen's own page.**

## 10. Built — 2026-10-13

Anthony said "go" after answering §8. All eight phases were built in one
sitting, then checked in his Chrome on
/hub/kapferer-brand-identity-prism/ over 12 months, with Google asked live.

### 10.1 Where it is

- **Asking Google:** `convex/googleAnalyticsPageStoryAsk.ts`, the `story` ask
  of `askGoogleAnalyticsLive`. Seventeen lists, held as the page's other live
  asks are. The arithmetic is in `convex/utils/analyticsPageStory.ts`. A
  report may now hold to several filters at once (`ReportAsk.only`).
- **Reading:** `convex/googleAnalyticsPageStory.ts` (`readPageStory`), read
  by `readPage`. The screen and Ask Hakken therefore get the same story
  (`assistantAnalyticsReads.ts`).
- **The box:** `pageSees` in `convex/utils/sees/analytics.ts` takes the story
  first (§5). "Keep the link" now needs a twentieth of the page's views: it
  had told ronins.co.uk to keep a link that sent 1 view of 2,021.
- **The screen:** `analytics/_components/PageStory.tsx`, placed on
  `all-pages/page/page.tsx`. Its look test is the "21 · a page's own screen, with its story" case of
  `googleAnalyticsSecondRoundLook.test.tsx`, with the outline in
  `docs/plans/assets/analytics-page-screen/look/Page.txt`; the 11 October
  outline (`google-analytics/look/APage.txt`) is retired.
- **Phase 0:** the Landing pages column reads "Conversions from visits", and
  the stage strip on Heroes and on a landing page's own screen reads "Visits
  that started here" and "Conversions from these visits". Their look files
  were updated for those words only.
  - The Insights agents read landing facts as "conversions from visits that
    started on X, made anywhere on the website" (`insightsReading.ts`).
  - Their ground rules carry the same rule (`insightTeam.ts`).
  - The Editor sends back a finding that says a page "made", "produced",
    "generated" or "yielded" such conversions (`madeOnPageClaim`).
  - Google's addresses are one line wherever a page's sources are listed.
    `siteNameOf` names a bare `google` or `bing` as Google or Bing.
- **Phase 6:** Tracking health's ninth check, `COUNTED_AGAIN`
  (`googleAnalyticsHealth.ts`), reads the last 90 days' pages. It flags any
  page with 100 views or more that is counted 1.5 times or more per visit
  that saw it, names the three most counted, and tells the super admins once.

### 10.2 Built differently from the words above

- **Read to the end is per visit, not per view.** It is the readers past 90%
  down over the visits that saw the page. Views were the wrong denominator:
  Google swells them with repeats. That put the Kapferer article at 2.3%
  when 6.1% of its visits read to the end. The Content hub's figure (8.7%)
  is worked out the same way.
- **Conversions by age and gender** (Anthony, mid-build: "i want to see what
  gender and what age converts if we have it"). Each chart writes on its
  bars the conversions from visits that started here, in every group Google
  can place. Its line says how many of those conversions it placed. Google
  holds a small group back whole, so the total is the page's own count. The
  Kapferer article reads "of 0 of the 1 conversion".
- **The kinds in Each source's visits** are the channels as the Channels
  screen names them (Organic Search, Direct, AI assistants, Referral,
  Unassigned), not the drawing's own words. One name for one thing (PS1).
- **Devices** use the names in the device picker at the top of the screen:
  Desktop, Mobile, Tablet.

### 10.3 Audited the same day

Anthony: "we say at the top we have no conversions and say in the graphs we
have 1 … can you audit the page please to ensure whatever we say is
correct". Every figure was checked against its source and against the
others on the Kapferer article.

**What adds up.**
- Views a day, where visitors were just before, where they went next, and
  the days of the week each add up to the page's 2,021 views.
- The sources chart, first visit or back again, and the table add up to the
  593 visits that started here.
- The UK's readers are the page's 457 people.

**What was changed.**
- **The 0 and the 1 are joined.** "Conversions made here: 0" now says "1
  conversion from visits that started here, made on other pages". The
  second figure is named in full: "Conversions from visits that started
  here".
- **"Nothing to compare with yet" was wrong.** The year before had 0 too, so
  it now says "None in the 12 months before either".
- **First visit or back again counts visits, not people.** As people it came
  to 584, more than the page's 457, because one person can be both. It now
  counts the visits that started here, with Google's unplaced visits shown as
  "Not known", so it adds to 593.
- **The box speaks in the page's own figures.** It said "counts this page 2.7
  times a visit" beside a figure reading "counted as 3.5". It now says
  "Visits that started here saw 1 different page each, yet Google Analytics
  counts 3.5".
- **Views a day says its dots** are conversions made on this page.

### 10.4 Also fixed: a bar's figure beside its own bar

Drawing the board showed a fault in every bars chart that writes its figures
(`SiteBarChart`): the chart library draws no bar for a nought and numbers its
labels by the bars it drew, so each figure after a nought was written one row
low. Each series now keeps the rows it draws (`drawnRows`); a test with a
nought in the middle fails without it. Anthony asked for it in the same commit.

### 10.5 What it showed on ronins.co.uk (Kapferer article, 12 months)

593 visits started on it, 13.2% of the website's. One went on to a
conversion, made on another page and none on the article, from a visit
typed in. Google's 446 visits made none.

- **Pages:** 1.0 different pages a visit, against 3.5 as Google counts
  them. The article is counted 2.7 times a visit.
- **Next:** 62.5% of its views are the article again and 35.9% leave the
  website. Two views went on to /brand-identity-agency/.
- **Reading:** 6.1% of visits read to the end, against the Content hub's
  8.7%.
- **Readers:** UK 457, India 205, South Africa 133, Brazil 99. 76.7% were on
  their first visit, and 94% of views were on desktops.
- **Clicks:** 16 downloads of the brand identity prism template PDF.

## Change log

- 2026-10-13 — Plan written after the canvas was approved. One correction to
  the drawing the same day: "What its readers clicked" showed links to the
  website's own pages, which Google Analytics does not count (§3). Its
  example rows are now links out and a download.
- 2026-10-13 — Anthony's answers (§8): every country, age and gender added
  (drawn the same day as two charts after the countries), the wording rule
  reaching Insights, and a commit to dev when built. About 14 man-days.
- 2026-10-13 — Built (§10); the board redrawn with what was built
  (conversions by age and gender, read to the end per visit).
- 2026-10-13 — Audited at Anthony's ask (§10.3): five figures made to agree.
