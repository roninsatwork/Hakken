# Sites — the AI figures from one summary per list

**Started 2026-09-26. Status: built 2026-09-26, on dev, not pushed (§7).** Change a
decision here, with a date, before building anything that disagrees with it.
Follow `AGENTS.md`: no code until Anthony agrees.

Found while making each company's searches and questions its own
([private-tracking-lists-plan.md](private-tracking-lists-plan.md)): the Sites
speed test had to drop from 25 AI questions to 8 to stay inside its budget,
because several screens read one or two rows for every question and engine
each time they open.

Anthony, after a plainer explanation: "Yes I will go with what you recommend"
— build it now, every decision as recommended.

Progress: **built and checked, on dev; not pushed (§7).** Two follow-ups
found by the screen audit are open: §7 found 3 and found 5.

## 1. What reads what today

A company's list can hold up to 1,000 questions (`MAX_LIST`,
`convex/websiteSiteRows.ts`), each asked of up to four engines. One Convex
request may make at most 4,096 separate lookups and read at most 32,000 rows.

| Screen | Query | Read per question and engine | At 1,000 questions on four engines |
|---|---|---|---|
| Mentions, your own website | `listMentions` (`convex/siteAi.ts`) | the question's stats row and its newest answer: 2 lookups | about 8,000 lookups: **the screen fails** |
| Mentions, a competitor | `listMentions` | up to 30 recent answers (`ANSWERS_READ`) | up to 120,000 answers: **fails** |
| Share of voice | `shareOfVoice` (`convex/siteAi.ts`) | the question's stats row | about 4,000 lookups: at the limit |
| The header of every Sites page (the menu's counts) | `getMySite` → `citedPagesOf` (`convex/siteFigures.ts`) | the site's cited pages, up to 201 rows | capped at 100 questions: 400 lookups, up to about 80,000 rows |
| The Sites list and the header (competitors' AI figures) | `newestAnswers` (`convex/siteFigures.ts`) | the newest answer | capped at 25 questions: 100 lookups |
| Overview, Sources cited and its download | `citedPagesOf` | as the header | as the header |

In the speed test (`convex/sitesLoad.test.ts`, a 50,000-keyword site), 25
questions on four engines made Mentions take 107% of a full keyword scan,
Share of voice 55%, the header 58% and the Sites list 68%. With the 8 it seeds
now: Mentions 39%, Share of voice 21%, the header 27%.

## 2. The idea

**Work out each list's AI standing once, when its answers are filed, and read
it in one lookup.** The answers are already bought and stored; nothing new is
asked of DataForSEO.

1. **One row per question in each list** (`siteListQuestions`, keyed by the
   list's hold and the question). For each engine: how often it was asked, and
   for each website it named — named, recommended, warned against — with the
   newest answer's day and stance. Only websites an answer named are kept, so a
   row stays small. Mentions reads one list's rows: one lookup, however long the
   list, for your own website or a competitor alike.
2. **One row per list** (`siteListAiSummary`). For each engine: answers
   counted, the newest day, and how often each website in the group was named
   (Share of voice). The header's counts (questions naming the site, the site's
   pages cited) and each competitor's engines naming it in the newest answers
   (the Sites list and the header).
3. **Written in the site rebuild**, beside the per-list AI day lines
   (`syncListAiDays`, `convex/siteSummaries.ts`), which already read each
   question's answers once for every list that asks it. In batches of 100
   questions, so a 1,000-question list fits a request's limits. Also rebuilt
   when a list changes: a question added, paused or removed, a competitor added
   or removed.
4. **The readers move over.** Mentions reads the question rows; Share of
   voice, the header's counts and the Sites list's AI figures read the list's
   row. Sources cited keeps reading its pages, but only on its own screen and
   its download (capped at 100 questions, and it says so), no longer on every
   page's header.
5. **Built once for every list** from the answers already held, by a migration
   (`convex/dataMigrations.ts`).
6. **The numbers do not change.** The same answers are counted — the latest
   200 per question and engine, as today's stats row (`ANSWER_WINDOW`,
   `convex/websiteTrackingStats.ts`).

Every row is keyed by the list's hold, so it is read only through the company's
own list, as `convex/holdLists.ts` requires; `websiteTenancyGuard.test.ts`
gains the new tables.

## 3. Found while planning

1. **Mentions on a competitor's page is the heaviest read of all**: up to 30
   answers per question and engine, to count what one stats row holds for your
   own website.
2. **The per-list AI day lines read at most 200 questions per website**
   (`QUESTIONS_READ`, `convex/siteSummaries.ts`). A longer list's charts leave
   the rest out without saying so. The batched writer in §2.3 covers the whole
   list.
3. **The header counts cited pages on every Sites page** by reading them, up to
   400 lookups, to show one number in the menu.

## 4. Decisions for Anthony

| # | Question | Decision |
|---|---|---|
| L1 | When the figures update | **When the site rebuild runs after answers are filed** — seconds to minutes later — not the instant a page opens. Every other Sites figure already works this way. |
| L2 | What they count | **The same as today**: the latest 200 answers per question and engine. Counting over the dates chosen instead would be a separate decision. |
| L3 | Sources cited's list of pages | **Stays read on its own screen**, capped at 100 questions, for now. Only its count moves into the summary. |

## 5. The work

| Step | What | Days |
|---|---|---|
| 1 | The two tables, the batched writer in the site rebuild, and the rebuild when a list changes | 1 |
| 2 | Mentions, Share of voice, the header and the Sites list read the summaries | ½ |
| 3 | The migration that builds them for every list | ¼ |
| 4 | Tests and the proof (§6) | ¾ |

About **two and a half working days**. No DataForSEO runs; the migration reads
answers already held.

## 6. How it is proven

- **Same numbers:** for the same answers, each screen's figures from the
  summaries equal today's, per question and engine.
- **Speed:** the speed test goes back to 25 questions, and adds one list of
  1,000. Mentions, Share of voice, the header and the Sites list stay under its
  budget.
- **Privacy:** another company's list is never read (the tenancy guard).
- **Freshness:** a new answer, a question added or removed, and a competitor
  added each update the summaries.
- **In Chrome:** the AI screens on ronins.co.uk and kordatackle.com.

## 7. Built — 2026-09-26

**What was built.** Two tables keyed by the list's hold (`convex/siteSchema.ts`),
and `convex/siteListAi.ts`, which keeps them:

- **A row per question** (`siteListQuestions`) is worked out **as each answer is
  filed**, inside `recordAnswer` (`convex/websiteTrackingStats.ts`), from the
  answers the question stats were just counted from — nothing is read twice.
  This replaces §2.3's "in the site rebuild": the answers are already in hand
  when they are filed, so a thousand-question list is never recounted whole
  unless the list itself changes. Only the group's websites are kept (the owned
  site and the competitors watched against it), which keeps a row small.
- **A row per list** (`siteListAiSummary`) is added up from the question rows
  and the group's cited pages about twenty seconds after answers land, one run
  at a time per list (L1).
- **When a list changes** its rows are worked out again: a question added
  (counting the answers already held for it) or removed; a competitor added,
  moved to another owned site or removed; the owned site's place changed. A
  whole list is recounted ten questions per write, so every write stays inside
  a request's limits. A hold that goes takes its rows with it.
- **The readers moved over**: Mentions and Side by side read the list's
  question rows; Share of voice, the header, the Sites list and the Overview's
  pages per assistant read the list's row. Sources cited and its download still
  read the pages themselves (L3).
- **The backfill** `2026-09-26-list-ai-summaries` (`convex/dataMigrations.ts`)
  was run on dev: 17 holds read, 2 lists counted (ronins.co.uk and
  kordatackle.com). No DataForSEO calls.

**Found while building.**

1. **Side by side read a stats row per question and engine too**
   (`listRivals`, `convex/siteCompetitors.ts`), for the Competitors table and
   every competitor's page. Moved onto the same rows; same numbers.
2. **Four figures change, only at edges no client has reached.** Each now
   counts what the screen always meant to:
   - A competitor's Mentions counted its last 30 answers per question and
     engine; it now counts the same latest 200 as the company's own website.
     No difference until a question has been asked more than 30 times.
   - Share of voice and Side by side counted a competitor only while it was
     among the 20 websites a question's answers named most; it is now always
     counted.
   - A competitor's AI figure on the Sites list and in its header read only the
     list's first 25 questions; it now reads the whole list.
   - A question added after another company's answers to it were filed showed
     "asked 1" until its next answer; it now counts every answer already held.
3. **Still read per question, outside this plan**: `loadQuestionRows`
   (`convex/websiteSiteRows.ts`), behind the admin company screens **and the
   client's Suggested competitors page** (`listSuggested`), and the admin
   citation report (`convex/seoCitationReports.ts`). The same limit at a
   thousand questions. (Corrected 2026-09-26: first recorded as admin only.)
5. **§3.2 is not fixed.** The per-list AI day lines still read at most 200
   questions per website, across every company (`QUESTIONS_READ`,
   `convex/siteSummaries.ts`). §3.2 expected the batched writer to cover them,
   but the question rows were built as answers are filed instead (above), so
   the day lines were left as they were. Past 200 questions about one website,
   a list outside the first 200 goes uncounted in its charts, calendar and the
   owned site's menu figure — and its day rows in each rebuilt window are
   removed as unclaimed. No list is near it; found by the screen audit of
   2026-09-26.
4. **The Overview shows a competitor as "1 of 0" per assistant**: engines
   naming it, of engines asked, and a competitor is asked nothing — the
   questions are the owned site's. Existing; not changed.

**How it was proven** (§6):

- **Same numbers**: `convex/siteListAi.test.ts` files three rounds of answers the
  way a collection does — naming, recommending and warning against the owned
  site, two competitors and firms nobody tracks, citing their pages — and checks
  Mentions, Share of voice, the header, the Sites list, the Overview and Side by
  side against the old readings, kept in the test as the yardstick, for the
  owned site and each competitor.
- **Speed** (`convex/sitesLoad.test.ts`, back to 25 questions, then 1,000), as a
  share of one full keyword scan: Mentions 2% (was 107%), Share of voice 2%
  (was 55%), the header 7% (was 58%), the Sites list 20% (was 68%). At a
  thousand questions: Mentions 7%, Share of voice 2%, Side by side 5%, the
  Overview 13%, the header 7%, the Sites list 20%.
- **Privacy**: the tenancy guard covers both tables. Another company asking the
  same question counts only its own group, and an answer asked from another
  place is not counted.
- **Freshness**: a new answer, a question added or removed, a competitor added
  or removed, and a place changed each update the figures (tested).
- **The gate**: the full local check (614 test files, 5,320 tests, guards, lint
  and types) and the build pass.
- **In Chrome, on dev**: every AI figure on ronins.co.uk and lightflows.co.uk —
  the Sites list, Mentions, Share of voice, the menu's counts, the Overview and
  Side by side — read the same before and after. kordatackle.com was checked
  in Korda's workspace, on Anthony's word ("you are welcome to open Korda and
  impersonate them to check it"): the Sites list's AI column for all eleven
  competitors, Mentions for all twelve websites (40 rows each), Share of voice,
  the menu's counts and the Overview's pages per assistant each equal the old
  counting, worked out from the stored answers. The workspace was switched back
  to Ronins Agency afterwards.

## Change log

- **2026-09-26** — Plan written after reading `listMentions`, `shareOfVoice`,
  `citedPagesOf`, `newestAnswers`, `websiteQuestionStats`, `siteCitedPages`
  and `syncListAiDays`.
- **2026-09-26** — Agreed as recommended (L1–L3); building.
- **2026-09-26** — Built (§7): question rows written as answers are filed rather
  than in the site rebuild; whole-list recounts ten questions per write rather
  than a hundred; Side by side moved over too. Four edge figures now count what
  the screen always meant (§7, found 2).
- **2026-09-26** — kordatackle.com checked in Chrome: the same numbers (§7).
- **2026-09-26** — Screen audit: §7 found 3 corrected (the Suggested
  competitors page reads per question too), and §3.2 recorded as not fixed
  (§7 found 5).
