# The DataForSEO side of the Convex bill — plan, 2026-10-05

What DataForSEO's data costs Convex to keep and to work over, and how to cut
it — the second half of the cost review begun the same day for Search Console
([finish-off plan](./finish-off-plan.md), "The DataForSEO side — audit";
Search Console as left:
[docs/product/search-console-running-costs-oct-2026.md](../../product/search-console-running-costs-oct-2026.md)).
Anthony, 2026-10-05: "tomorrow we pick up 2", "let's brainstorm and audit it
now", "make a plan for A and B".

**Status, morning of 2026-10-06:** built overnight on `dev`, committed and
**not pushed** (Anthony: "build this overnight and double check
everything"): **A1, A2, A3, A5, A6**, and a fault A1's check found (below).
Built and **held on their own branches** for Anthony's word, because a
customer would notice them: **B2 and B3**
(`worktree-agent-a270321a61606fe0d`), **B4**
(`worktree-agent-ada3a01b855414cb0`). **Not built: A4 and B1** — see "What
the night found".

## What the night found, 2026-10-06

**Measured before, on dev** (4 companies: 8 own websites, 28 competitors;
`seoStorageMeasure:measureSeoStorage`): DataForSEO's data took **349 MB**.

| Table | MB | What it is |
|---|---|---|
| `seoPullAnswers` | 147.4 | Raw DataForSEO answers; 101 MB of them older than 7 days, which A6 removes |
| `siteContentGaps` | 81.0 | Content gap rows; about 77 MB of it for competitors' holds |
| `siteKeywordRanks` | 32.7 | Every keyword a website ranks for; morehandles.co.uk 6.4 MB |
| `siteListCopyParts` | 31.4 | The tables' ready-made copies |
| `seoKeywordPositions` | 26.4 | Daily keyword positions, kept for ever; morehandles.co.uk 2.5 MB, growing about that much each collection |
| `aiAnswerTexts` | 0.8 | AI answers' full wording (B2) |
| `siteSerpPages` | 0.5 | Google's full results pages (B3) |

- **A1 checked live on dev.** The first nightly refresh asked for 104
  rebuilds (every copy); the second, nothing having changed, asked for 1.
  That one was morehandles.co.uk's Your pages, whose rebuild had **always
  failed**: Search Console's 90 days showed 13,813 pages and a function's
  answer holds at most 8,192 to a list. Fixed (`holdPages.consolePages` reads
  4,000 at a time); its rebuild now finishes and records its build.
- **A4 not built**: reading only the companies asking a question also stops
  finding a brand named in an answer to someone else's question, which is
  where competitor suggestions come from — that changes what customers see,
  so it is a group B question, not A.
- **B1 not built**: it saves nothing until a website has held positions for
  90 days, and every chart reading positions would have to read days and
  weeks; positions are 26 MB on dev. Worth it later, when they are larger.
- **B2 and B3 built, held**: measured, what they remove is small (0.8 MB and
  0.5 MB on dev) and a customer would see it. Two wordings to settle first —
  the "kept from 23 September" note and "word for word" on the answer screen.
- **B4 built, held**: during a collection the Discovery screens would keep
  the last collection's figures until its end. A2 already takes the repeat
  rebuilds AI answers and site-wide figures set off; whether the rest is
  worth B4 is for the reads-and-writes measurement.
- **Content gaps for competitors** (about 77 MB of 81 MB) is a new question:
  the competitor gap tab is a deliberate feature, so nothing was changed.

**Not yet measured**: the size after (A6's purge removes the raw answers
over 7 days old in its hourly steps) and the reads and writes before and
after — the Convex dashboard's Usage page, or the deployment's function
logs, which record each function's bytes read and written.

## How this plan is run

- **Measure before building**, on dev — the Search Console size was first
  guessed at 330 MB and measured at 830 MB. Every item says what decides it.
- **Say the exact rule back before building it**, and build only what was
  agreed (2026-10-05: a misread rule cost an evening's trust).
- **Group A changes nothing a customer sees**; any item that turns out to,
  moves to group B and is asked about.
- One commit per item, the full local gate before any push, nothing to
  production without Anthony's word.

## Step 0 — measure (0.5 day, first)

1. **What each website keeps** — a measure like `searchConsoleTidy:keptSize`
   over the DataForSEO tables, by website: an own website (morehandles.co.uk,
   ronins.co.uk) and a competitor (foxint.com). Rows and megabytes for
   `seoKeywordPositions`, `siteKeywordRanks`, `siteKeywordFeatures`, the link
   lists, the crawl tables, `seoWebsiteMetrics`, `siteDaySummaries`,
   `sitePageRanks`, `siteSections`, the list copies; and, through the
   website's questions and keywords, `aiAnswerTexts`, `aiAnswers`,
   `aiCitations`, `siteSerpPages`, `promptFanOutDays`; and its raw answers.
2. **What a collection works over** — on one collection of a company with an
   own website and competitors: how many full website rebuilds, gap rebuilds,
   copy rebuilds and run reports it sets off, and the rows each reads and
   writes. Counted from the run's steps and logs, not estimated.
3. **The real bill** — the Convex dashboard's Usage page, reads and writes by
   function, for a normal week (needs Anthony's sign-in; 15 minutes).

Out: one table, before figures for every item below, sent as a picture.

## Group A — nothing a customer sees changes (about 3.5 days)

| # | Change | How | What the screens do | Check | Days |
|---|---|---|---|---|---|
| **A1 (agreed)** | The 03:30 refresh rebuilds only copies out of date with their data — not every copy every second night | Each copy notes when its data last changed (set where a rebuild is asked for: `requestSiteRebuild`, `requestGapRebuild`, `requestHoldPagesRebuild`); the nightly job rebuilds a copy only when that is after its build. **First** check no table shows anything that changes with the calendar alone (a "new this week", a "lost after 14 days"); such a copy keeps its nightly rebuild. **Built 2026-10-05.** Calendar check: no copy holds a "new this week" or an age from today — keyword statuses, gap rows, links, pages and Your pages change only when their rows are written. The one exception is a site's latest keyword check (`latestKeywordCheck`): a list page still out after 14 days stops holding its list back, so the keyword copy moves with the calendar alone — and likewise when a page fails, which no filing asks about. The nightly job looks for exactly that (`listPagesSettledSince`) and rebuilds such a site the night it happens. Sources that changed without asking for a rebuild (a page's kind judged, a crawl kept, Search Console disconnected or cleared, the sitemap limit, a website's place, a competitor moved between groups) now note the change (`noteDataChanged`) for that night | Nothing changes. A copy still rebuilds as soon as its data changes; a failed rebuild is still caught the next night; an "updated" date, where shown, says when the data last changed | Test: an untouched copy is not rebuilt; a changed one is; a failed one is caught | 0.75 |
| A2 | An AI answer updates only the AI lines of the websites asking it (`syncListAiLines`); a site-wide figure only the day figures (`syncDays`) — not a full website rebuild at every place | Split `requestRebuildEverywhere` into the parts each caller needs (`websiteTrackingStats.ts:170`, `seoCollectionParse.ts:483`). **Built 2026-10-05:** `requestAiLinesEverywhere` → `syncSiteAiLines`, `requestDayFiguresEverywhere` → `syncSiteDays`, each asked once a burst, 20 seconds on, from every place watched; the bulk counts (`writeBulkMetrics`) are site-wide figures too. A ranked-keywords or keyword-list total with no rankings still asks for the whole rebuild: it moves the latest check | Nothing changes — the same figures, sooner | Tests on each: the right part rebuilt, the rest untouched | 0.75 |
| A3 | Write only what changed: content gap rows, list copies, sitemap pages, fan-out angles, day figures | Compare before writing: a gap row kept when its figures are the same (`siteContentGap.ts:271`); a copy kept when its rows hash the same (`siteListCopies.ts:119`, `holdPages.ts:433`); sitemap pages diffed (`sitemapRead.ts:42`); angles not patched to bump `rebuiltAt` (`fanOutAngles.ts:262`); day figures patched only when different (`siteSummaries.ts:829`). **Built 2026-10-05:** a gap row the same keeps its stamp and time, and the rows a rebuild no longer found are removed by what it found, not by stamp — the Content gap export's "last_checked" is the later of the row's time and its hold's last gap rebuild, so it reads as before; a copy carries a SHA-256 of what it holds and is not written again when the same; a sitemap reading listing the same pages points at the ones held (`pagesReadAt`); a question's angles are put right as it is read, and a removed question's cleared at the end | Nothing changes. An open screen no longer re-reads a copy that did not change | Tests: a second build with the same data writes nothing | 1.25 |
| A4 | The brand-name check on each AI answer reads only the companies asking that question — not up to 2,000 companies' names | `holdProfiles.ts:49`: names of the holds asking the question (`websiteQuestions`), not every hold | Nothing changes | Test: a company not asking is not read; mentions still found for those asking | 0.25 |
| A5 | The admin run report rebuilt at most every 5 minutes during a collection, and at its end — not about once a minute; its platform-wide decision-runs read narrowed to the run's own | `seoRunReports.ts:44, 87-97, 355` | Admin only: the report on Collection pipeline updates every few minutes while a collection runs, whole at its end | Test: settles within 5 minutes ask one rebuild | 0.25 |
| A6 | Raw DataForSEO answers kept 7 days, not 30 | `SEO_RAW_RETENTION_DAYS`; check what reads raw later — the hourly re-file, the credit recount — works within 7 days | Nothing changes for customers; a re-file or recount older than 7 days is not possible (say so in the operator guide) | Test: purge at 7 days | 0.25 |

## Group B — customers would notice (about 4 days, each only if step 0 shows it is worth it)

Only B2 and B3 delete anything, and only the bulky detail past 90 days: an
AI answer's full wording, Google's full results page. Who an answer named and
cited, and the website's position on each results page, are kept for ever.
B1 keeps every keyword's history, by week instead of by day; B4 deletes
nothing and changes only when the screens update.

| # | Change | How | What the screens do | Worth it when | Days |
|---|---|---|---|---|---|
| B1 | Daily keyword positions kept 90 days, then weekly | Roll older days into a week's best and average position per keyword, as Search Console's days roll into weeks; the history charts read days for 90 days and weeks before; a one-off conversion of the rows kept | A keyword's position chart shows day by day for 90 days and week by week before, with a note when it switches | `seoKeywordPositions` is a large share of a website's storage, or grows by more than a few MB a month | 1.5 |
| B2 | Full AI answer wording kept 90 days; who was named and cited kept for ever | A purge of `aiAnswerTexts` (and `aiAnswerIndex`) older than 90 days; the answer screen says the wording is kept 90 days | An answer older than 90 days shows who it named and cited, and "The full wording is kept for 90 days" instead of its text; search finds answers of the last 90 days | `aiAnswerTexts` is large, which its 60,000-character answers suggest | 0.75 |
| B3 | Google's full results pages kept 90 days; positions kept for ever | A purge of `siteSerpPages` older than 90 days; the results-page screen says so | A results page older than 90 days shows the website's position, not the page in full | `siteSerpPages` is large | 0.5 |
| B4 | One rebuild at the end of each collection, not during it | Rebuilds asked for while a collection runs wait for its end (`finishSeoCycle`), with one every few hours for a collection that runs long. **Built 2026-10-05:** a website's rebuild, or its AI-lines or day-figures part (A2), asked for while a collection collecting it runs (found from its newest requests) is held for that collection (`heldFor`), released when it finishes (`releaseHeldRebuilds`) or three hours after the collection began or the website was last rebuilt (`releaseHeldRequest`); "Figures update when it finishes" under a running collection's Doing now | During a collection the Discovery screens keep the last collection's figures, then update at its end; Collection pipeline says "Figures update when it finishes" | Step 0's count shows many full rebuilds per collection | 1 |

## Order

Step 0 → A1 → A2 → A4 → A5 → A6 → A3 → (Anthony's choices) B4 → B2 → B3 →
B1 → measure again → release. A before B: A changes nothing on screen and
removes the work B4 would otherwise only postpone.

## Total

| | Days |
|---|---|
| Step 0, measure | 0.5 |
| Group A | 3.5 |
| Group B, if all are taken | 3.75 |
| Measure again, release on Anthony's word | 0.5 |
| **Total** | **about 8.25** (4.5 without group B) |

## Measured success

The step 0 table again after each group: megabytes per website, rebuilds per
collection, and the Usage page's reads and writes for a normal week — with
the cost per website a month beside Search Console's, in the pricing record.
