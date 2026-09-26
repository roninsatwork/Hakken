# Private searches and questions — each company's own lists

**Started 2026-09-25. Status: built 2026-09-26, all six phases, committed and
pushed to dev — see §9 for what was built and how it was checked.** Reverses the shared-list decision of 2026-09-22 (the note above
`websiteQuestions` in `convex/schema.ts`; Stage 4 of
[the websites screens rebuild](websites-screens-rebuild-plan.md)). Change a
decision here, with a date, before building anything that disagrees with it.
Follow `AGENTS.md`.

Anthony, 2026-09-25, on hearing that every company watching a website sees
the searches tracked for it: "If I track a keyword that's related to the
company, other people should not see what I am tracking." Then: "Ok can you
change this please."

Progress: **built** (2026-09-26), committed and pushed to dev. Estimate was about
five working days (§6).

## 1. Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| V1 | What becomes private | **The Google searches and the AI questions tracked for a company, and everything worked out from them**: positions on those searches, the results pages behind them, AI answers, mentions, share of voice, sources cited, fan-out queries, and the suggestions (moves) drawn from them. A company sees only its own; no other company can see them, count them or infer them. | Agreed, 2026-09-25 |
| V2 | Buying | **Still bought once.** The same search or question, from the same place, on the same day, is one DataForSEO purchase however many companies track it. Nobody can see who else asked. This is how purchases are keyed already (§3.2). | Agreed, 2026-09-25 ("still bought once", in the change he approved) |
| V3 | What stays shared | **Facts about the website itself**: its brand names and misspellings, business description, sector and market; what DataForSEO sells about any website (the keywords it ranks for from its keyword list, backlinks, the site audit, competitor lists); and the Known competitors graph, which only super admins see. | Agreed, 2026-09-26 |
| V4 | Where a super admin sets them | **On the company's own screen for the website** — Manage Companies → company → Websites → the site → Results: *Your searches* gains the add box, pause and remove; a new *AI questions* item holds the question list with its engines. The shared website record (Admin → Websites → the site) loses its *Google searches* and *AI questions* tabs, which only made sense while the lists were shared. | Agreed, 2026-09-26 |
| V5 | A tracked search's results page | **Stops adding to any website's "All keywords".** Today checking a tracked search adds it to the keyword list of every website found on the Google page, so another company can meet it there. After: All keywords is what DataForSEO says each website ranks for, nothing else; a tracked search shows only on the tracking company's own screens. Rows only a tracked search put there are removed once (§4.7). | Agreed, 2026-09-26 |
| V6 | History | **A company that starts tracking something already collected sees the results already bought** — nobody can tell where they came from, and they were paid for. | Agreed, 2026-09-26 |
| V7 | The lists there today | **Move to the company that owns the website.** On dev today: 4 Google searches and 11 AI questions, all on the two owned websites, each owned by one company, so every item has one clear owner. | Agreed, 2026-09-26 |
| V8 | A competitor not tied to one of the company's own sites | **Has no searches or questions of its own.** Today such a competitor buys whatever list its website carries, which after this change would be another company's. On dev every competitor is tied to an owned site (15 of 15). | Agreed, 2026-09-26 |
| V9 | When a company stops watching a website | **Its searches and questions for it go too**; the website and what was collected about it stay, as now. | Agreed, 2026-09-26 |

## 2. The rule, in one sentence

**What Hakken tracks for a company is read only through that company's own
hold of the website**, and nothing built from it — a count, a chart line, a
suggestion, a keyword row — reaches another company's screen.

Two companies own kordatackle.com. Korda tracks "carp rigs" and asks "best
carp fishing tackle brands"; the other company tracks "bivvies". Korda sees
its one search and one question, with their results and figures; the other
company sees "bivvies" only. If both track "carp rigs" from the same place,
it is checked once and each sees it on its own list. A third company that
watches kordatackle.com as a competitor of its own site measures it on its
own site's searches and questions, and sees neither list.

## 3. Today (2026-09-25)

### 3.1 Where the lists are

- `websiteKeywords` (tracked Google searches) and `websiteQuestions` (AI
  questions) hang off the website (`convex/schema.ts`, from the note at the
  shared-list decision). Neither carries a company, and
  `convex/websiteTenancyGuard.test.ts` fails if either gains one.
- Only super admins edit them, on the shared website record
  (`convex/websiteCanonical.ts`; `admin/websites/[websiteId]/keywords` and
  `/questions`). The company's own site screen links there to edit.
- Every client Sites query reads them by website (`listWebsiteId` in
  `convex/siteAccess.ts`): the owned site's own, or, for a competitor, the
  owned site it is watched against.

### 3.2 Buying is already shared

`planSharedPull` (`convex/seoCollection.ts`) keys a search or question
purchase on the operation, the text, the place and the day, with no website
and no company (`convex/seoIdempotency.ts`). Only which list the planner reads
changes (`questionSteps`, `searchSteps`).

### 3.3 Where a list reaches further than its own screens

Found while planning; each is closed by §4:

- **AI figures are added up over the website's whole list.** `syncDays`
  (`convex/siteSummaries.ts`) counts answers to every question on the website
  into `siteDaySummaries.ai`, and names every other site into
  `siteRivalAiDays`, keyed by the asking website. Two companies' questions
  would be counted together, and a company watching that website as a
  competitor sees the owner's figures through the calendar and the chart
  "before" point.
- **A tracked search's results page feeds All keywords** of every known
  website on it (`fileKeywordRank` in `writeKeywordCheck`,
  `convex/seoKeywordChecks.ts`), and from there Wins and losses, the keyword
  screen, the keywords download, the content gap and shared searches.
- **A few Sites queries accept any keyword** (`searchPositions` in
  `siteGoogle.ts`, `keywordsOnDay` in `siteKeywords.ts`, the results-page card
  in `keywordRecord`, `siteRecords.ts`): a "checked, not found" row or a
  stored Google page exists only because somebody tracks that search, so an
  answer can give it away.
- **Suggestions** (`websiteMoves.ts`) are drawn from the whole list, and
  taking "Stop asking" pauses the question for every company; "Track it" adds
  to the shared list.
- **The AI judgements** that describe a business (`describeBusinessForJudging`,
  `websiteCanonical.ts`) read the website's tracked searches, and their result
  is filed for every company holding it.
- **Two "whose list" rules**: client screens use `listWebsiteId`; the admin
  citations and fan-out reports use the hold's own website.

## 4. The design

### 4.1 A list row belongs to a hold

`websiteKeywords` and `websiteQuestions` each gain `companyWebsiteId` (the
hold whose list it is) and `companyId`, and keep `websiteId`:

- New indexes `by_hold`, `by_hold_active`, and `by_hold_keyword` /
  `by_hold_prompt`. Every client Sites read and the planner go through these.
- `by_keyword` and `by_prompt` stay, for the writers that must find every
  tracker of a search or asker of a question across companies (§4.3); they
  never feed a screen.
- A duplicate is refused per hold, not per website, and the 1,000-item
  ceiling is per hold.
- The fields start optional so the migration can fill them, and become
  required once it has run (§4.7).

`siteAccess.ts` gains the one place that decides whose list a site's pages
read: the owned hold for an owned site; the owned hold it is watched against
for a competitor; none for a competitor tied to nothing (V8). `listWebsiteId`
stays for the per-website stats keys (`websiteQuestionStats`,
`websiteSearchStats`), which are facts about a website and stay shared.

### 4.2 Buying

`questionSteps` and `searchSteps` read the hold's own active list. The key is
unchanged, so two companies with the same item still buy it once (V2). An
unpaired competitor hold reads its own list, which is empty (V8).

### 4.3 Filing

Results stay stored once, keyed by website, search or question, and place:
positions, results pages, answers, answer stats, cited pages. The writers that
work out "who asked" read every company's items combined, counting a website
once:

- `recordAnswer` (`websiteTrackingStats.ts`): askers by prompt, one per
  website.
- `writeKeywordCheck` (`seoKeywordChecks.ts`): trackers by keyword, one per
  website; **no longer calls `fileKeywordRank`** (V5).
- `fileRankedPositions` (`siteKeywordList.ts`): the tracked set of every
  company for the website.
- `describeBusinessForJudging`: describes the business from what it ranks for
  (its own keyword list, which every watcher can see), not from any company's
  tracked searches.

### 4.4 Figures per company

- A new table, **`siteListAiDays`** — hold, place, day, and the answers per
  engine (asked, named, recommended) — replaces `siteDaySummaries.ai`.
  `syncDays` writes one set per hold whose list asks about the website, reading
  each answer once and crediting every hold whose list has that question.
- **`siteRivalAiDays`** is keyed by the hold instead of the asking website.
- Readers move to them: the Sites list AI column, the Mentions menu count, the
  Overview AI panel and "AI named" measure, the Mentions chart, the calendar
  (a competitor's calendar reads its line from the owner's questions, as its
  chart does), and the chart "before" point.
- The AI fields `siteAndRivals` returns and nothing draws are dropped.
- Computing these when the page opens instead was measured and ruled out: a
  two-year chart of 25 questions on four engines is about 73,000 answer rows,
  past the database's 32,000-row limit for one request.

### 4.5 Client Sites screens

Every read of a list goes through the hold (§4.1): `sites.ts`, `siteGoogle.ts`,
`siteGoogleSerp.ts`, `siteAi.ts`, `siteAnswers.ts`, `siteFigures.ts`,
`siteCharts.ts`, `siteCompetitors.ts`, `siteExports.ts`, `siteRecords.ts`,
`siteKeywords.ts`, `siteOverview.ts`, and `websiteSiteRows.ts` where
`listSuggested` borrows it. The queries that accept any keyword answer only
for searches on the caller's own list. Nothing a client sees changes for a
website only one company watches, except V5.

### 4.6 Admin

**Where a super admin sets them (V4):** the company's own site screen, under
Results.

- *Your searches* gains Add, Pause and Remove.
- A new *AI questions* item gains Add (with engines), Pause and Remove.

These are the controls the two shared tabs have today, moved rather than
redesigned.

**The shared website record (Admin → Websites → the site):**

- It keeps Profile, Known competitors and Watched by.
- Its note says that searches and questions are set on each company's own
  screen.
- The delete warning names what goes.

**What else acts on the company's own list:**

- The Overview cards and their wording.
- The header link that used to go to the shared record.
- *What the AI searched*: its Track it and Untrack, and its "tracked" flag.
- *AI answers*.
- The competitor comparisons.
- The remove-search wording.
- The suggestions: "Stop asking" pauses the company's own question, "Track it"
  adds to its own list, and "Reword it" opens its own AI questions.

**Add and remove forms:**

- The add-website forms stop promising that a new company "inherits" the
  website's searches and questions. It inherits the collected data only.
- Removing a website from a company says its searches and questions go too
  (V9).

**Rules for the wording:** every change is made in English and Italian. Admin
tables keep fifteen rows.

### 4.7 Moving what is there, and cleaning up

A migration registered in `convex/dataMigrations.ts`, run once on each
deployment. It does four things.

1. **Hands each existing list row to the website's owning hold** (V7). It
   patches the row in place, so its id — and every dismissed suggestion that
   names it — is unchanged. A website owned by more than one company gets a
   copy per extra owner, with its suggestions remapped. None exists on dev
   today. A row no company owns is removed; what was collected for it stays.
2. **Rebuilds the AI figures per hold** (§4.4), then clears
   `siteDaySummaries.ai` and the old `siteRivalAiDays` rows.
3. **Removes the All keywords rows only a tracked-search check put there**
   (V5). These are recognised by the list facts they lack: a row from a
   DataForSEO keyword list carries its search volume, difficulty and trend,
   and a check never adds them. The rule is confirmed against the real rows
   before it deletes anything.
4. **Makes the new fields required**, in a second schema change once 1–3 have
   run.

**What deleting removes:**

- Removing a hold, or deleting a company, deletes that hold's list rows and
  its figure rows (V9).
- Deleting a website does as today, plus the new table.
- The "is anyone else still asking this?" checks count websites, not rows.

### 4.8 The rule, enforced

`websiteTenancyGuard.test.ts` rule 2 is rewritten, with the date and the
reason:

- **From:** "nothing stored on a host names who is watching it".
- **To:** "a company's own lists carry the hold they belong to, and are read
  only through it".

It checks:

- **The schema:** both list tables, `siteListAiDays` and `siteRivalAiDays`
  carry the hold, and `websiteRivals` still carries no company.
- **The source:** every client-facing Sites read of those tables uses a
  `by_hold…` index, never one by website, keyword or prompt.

A behaviour test pins §2's example: two companies own one website with
different lists, and a third watches it as a competitor. Each sees exactly its
own searches, questions, counts and chart lines, and nothing of the others'.

## 5. Found while planning, fixed on the way

- **A missing audit entry.** Taking an "untracked search" suggestion
  re-activates a paused search without the audit entry the manual path writes
  (`websiteMoves.ts`).
- **A wrong link.** A slipping search's "See the searches" opens Rankings,
  not Your searches (`SiteMoves.tsx`).
- **Stray comments.** Doc comments with nothing under them in `websites.ts`
  and `websitePurge.ts`, and the rebuild plan's mention of a file that no
  longer exists.

## 6. The work, in order

| Phase | What | Days |
|---|---|---|
| 1 | Lists belong to a hold: schema, the owner rule in `siteAccess.ts`, the migration's first step, the guard rewritten | 0.5 |
| 2 | Buying and filing: the planner, the three writers, no more keyword rows from checks, judging from public keywords, deleting with the hold | 1 |
| 3 | Figures per company: `siteListAiDays`, `siteRivalAiDays` by hold, `syncDays`, and every reader of them | 1 |
| 4 | Client Sites screens read through the hold; the any-keyword queries gated | 0.5 |
| 5 | Admin: editing on the company's screen, the shared record's tabs, suggestions, fan-out, dialogs, English and Italian | 1.5 |
| 6 | Proof: tests, the migration run on dev, the full local gate, a check in the browser | 0.5 |
|  | **Total** | **about 5 working days** |

## 7. How it is proven

- **The behaviour test in §4.8**, plus the existing tests that encode the
  shared model, each rewritten to the new rule:
  - `websiteTenancyGuard`, `websiteCanonical`, `seoCollection` ("one question
    on a host is asked for every company holding it" flips; "two companies on
    one host buy one answer" stays)
  - `sites`, `siteRecords`, `siteExports`, `siteListCopies`
  - `websiteTrackingStats`, `seoKeywordChecks`, `websiteMoves`,
    `websiteClientView`, `websitePurge`
  - the menu and admin screen tests
- **The local gate** in `AGENTS.md`, including the Sites speed test, which
  gains questions so the new figure rows are timed.
- **On dev, in the browser:** Korda's and Ronins' screens show the same
  searches, questions and AI figures as before the move. A test company given
  one of those websites sees none of them until one is added for it.

## 8. What changes in the other plans

Each gets a dated note rather than a rewrite:

- The schema note at the shared-list decision.
- [The websites screens rebuild](websites-screens-rebuild-plan.md), Stage 4.
- [The Sites plan](user-sites-plan.md): D1 (editing stays in admin — still
  true), D13 (the admin screens named in V4 change) and D17 ("this company's
  questions only" becomes true by construction).
- [Brands, places and AI citations](brands-places-and-ai-citations-plan.md):
  brand names stay shared (V3).

## 9. What was built (2026-09-26)

**The lists.** `websiteKeywords` and `websiteQuestions` carry
`companyWebsiteId`, required, with `by_hold`, `by_hold_active` and
`by_hold_keyword` / `by_hold_prompt`. Every screen and the planner read them
through `convex/holdLists.ts`. Whose list a site's pages read is decided in
one place, `listOwnerHold` in `convex/utils/websitePairing.ts`, which
`listHold` in `siteAccess.ts` and the admin row loaders both ask.

**Buying and filing.** The planner buys a company's own list for its own
websites only, and a competitor buys none (V8). The writers that find
everyone who asked count each website once:

- `recordAnswer`
- `writeKeywordCheck`
- `fileRankedPositions`

A check no longer adds to any website's All keywords (V5). The AI judgements
describe a business by the searches it earns most visits from, not by a
company's list.

**Figures.** One new table, `siteListAiDays`, holds each list's own AI line
and a line per competitor its answers named. `syncDays` writes it, and every
reader moved to it:

- the Sites list, the menu, the Overview, the charts and the calendar
- the competitor lines on the charts

**Client screens.** Every Sites read of a list goes through the hold. The
queries that took any search or question now answer only for the caller's
own:

- `searchPositions`
- `keywordsOnDay`
- the keyword screen's tracked facts and Google page
- Full answers
- the answers download

**Admin (V4).** On the company's site, under Results:

- *Your searches* gained Add, Pause and Resume.
- *AI questions* is new: the shared record's tab, moved with its controls.

The shared website record lost both tabs; its note and delete warning say
where the lists are now. Also changed:

- Suggestions: "Stop asking" pauses the company's own question, and "Track
  it" adds to its own list.
- Fan-out's Track it adds to the company's own list.
- The Overview and remove-search wording say whose list it is.
- The add-website forms no longer promise another company's lists.
- Removing a website from a company says its lists go too (V9).

All wording is in English and Italian.

**Lifecycle.** `purgeHoldListsInternal` removes a hold's lists and lines,
both when a company stops watching a website and when a company is deleted.
The "does anyone else ask this?" checks in the website purge count websites,
not rows.

**The rule, enforced.** Rule 2 of `websiteTenancyGuard.test.ts` is
rewritten. The list tables and the AI lines must name their hold, and a list
read that is not through a hold may happen only in seven writer, purge and
migration files. It was checked by planting a breach, which it caught.
`convex/privateLists.test.ts` pins §2's example:

- two companies own one website, and a third watches it as a competitor;
- each sees only its own searches, questions, counts and chart line;
- asking for another company's search or question by name returns nothing.

**Departures from the design above.**

- **No `companyId` column on a list row.** The hold names the company, and
  one owner field cannot disagree with itself.
- **Competitor lines folded in.** `siteRivalAiDays` was not re-keyed:
  `siteListAiDays` holds the competitor lines beside the site's own, and the
  old table and `siteDaySummaries.ai` were removed.
- **Four migrations retired after they ran on dev.** Once the schema they
  read had gone they could not compile, so they were removed, as this repo
  has done before. `2026-09-26-check-only-keyword-rows` stays.
  `privateListsMigration.ts` lists the four, and `dataMigrations.ts` says how
  to recover a deployment that missed them.

**Run on dev.**

| Migration | Result |
|---|---|
| Questions to their owners | 11 of 11 handed to their company |
| Searches to their owners | 4 of 4 handed to their company |
| AI lines rebuilt | 3 days' website-wide counts cleared; each website rebuilt, 10 new lines written |
| Old competitor lines removed | 7 |
| Check-only keyword rows | 16,012 read, none found |

Korda's own line for 25 Sept: 20 answers from each of the four engines,
naming it in 2, 3, 7 and 3 of them — every engine named it at least once.

**Checked.** The full local gate and the build (§7). The speed test now
seeds eight questions, five competitors and two years of AI lines. Measured
against a full scan of the keywords, fastest of three runs:

| Query | Time | Share of a scan |
|---|---|---|
| Two-year chart | 101 ms | 7% |
| Two-year chart, five competitors | 277 ms | 20% |
| Calendar | 39 ms | 3% |
| Site header | 356 ms | 26% |
| Sites list | 526 ms | 39% |
| AI mentions | 528 ms | 39% |
| Share of voice | 279 ms | 21% |

**Found while building, not changed.** The AI screens read one row per
question and engine: *AI mentions* reads two, and *Sources cited* and the
site header's count read one. For a long list that is hundreds of reads.
With 25 questions on four engines they measured above half a table scan in
the test backend. A list of a thousand would pass Convex's limit of 4,096
index reads in one request on *AI mentions*. The fix is a stored summary per
list, like the AI lines. Proposed separately.

**Also fixed on the way (§5).**

- Taking an "untracked search" suggestion now writes the Resume audit entry.
- A slipping search's "See the searches" opens Your searches.
- `setWebsiteBrandNames` has its own doc again: it had drifted to the end of
  `websitePurge.ts`, and a stale comment sat in its place.

## Change log

- **2026-09-25** — Planned. V1 and V2 agreed by Anthony ("Ok can you change
  this please", after the change was described as private lists, still bought
  once). V3–V9 are Claude's recommendations, waiting for his go.
- **2026-09-26** — Agreed as planned, V3–V9 included: "lets build this
  please".
- **2026-09-26** — Built, all six phases (§9), on "lets build this please".
  Three departures, each in §9: no `companyId` on a list row, the competitor
  lines folded into `siteListAiDays`, and four migrations retired after they
  ran on dev.
