# Bringing Hakken's wiki up to Sonae's, 21 November 2026

Anthony asked to compare the wiki in Sonae with Hakken's ("how it ingests, searches and reads and also the wiki display animation") and make a plan to bring Hakken up to Sonae's spec. He added that Sonae fixes the wiki as documents come in, not on a timer, which ties this to the [regular jobs review](regular-jobs-review-2026-11-21.md).

**Status: a plan only. Nothing here is approved or built.** Each phase waits for his go.

## How this was found

Both repositories were read, never changed. The last commit they share is `21a52a37` (18 September 2026). Since then Sonae made 25 wiki commits, almost all between 9 and 12 November 2026. Hakken changed its wiki only for its own reasons, and those changes stay (see "Hakken's own work to keep").

Checked by hand as well as by the two readers: Hakken still calls Firecrawl's v1 in `convex/webScrapeActions.ts`, `convex/moneyPageChecks.ts` and `convex/knowledgeActions.ts` (twice); Hakken's `WIKI_DISTILL_TEXT_MAX_CHARS` is 8,000; Sonae's `convex/crons.ts` has one `wiki-daily-checkup` where Hakken has four wiki sweeps; Hakken's `WikiMapScreen.tsx` stretches with the window (`aspectRatio`); Sonae's map adds no new package.

## Does Sonae fix the wiki as documents come in?

Partly, and that part is the bigger change.

- **A new document** is read whole, in sections, the moment it's ready: its topic pages are written and linked, and the list pages are rebuilt at once (`wikiDistillActions.distilNewDocument`, `wikiPages.refreshHubPagesInternal`).
- **A changed document** rewrites every page it taught, from the changed sentences only (`wikiCheckupPages.recordSourceChangeInternal` → `wikiCheckupActions.processSourceChanges` → `followSourceChanges`).
- **A deleted document** takes out the facts only it backed and the pages only it backed unless they're pinned (`removeDocumentFromWiki`).
- **Still on a timer, once a night:** contradictions, source and freshness checks, tidying, links, tags, page types and missing pages. Sonae folded its four wiki sweeps into one `wiki-daily-checkup` at 02:00 UTC. Nothing checks contradictions or freshness as a document comes in, even in Sonae. Doing that would be new work beyond Sonae.

What it means for Hakken's timers:

| Hakken timer today | After phase 1 (learning on the way in) | After phase 2 (the nightly check-up) |
|---|---|---|
| `wiki-distill-sweep`, every 15 min | daily, as a safety net only | gone: the check-up's first step is the safety net |
| `wiki-tending-sweep`, nightly | stays | gone, folded into the check-up |
| `wiki-contradiction-sweep`, nightly | stays | gone, folded into the check-up |
| `wiki-freshness-sweep`, nightly | stays | gone, folded into the check-up |
| `wiki-weekly-report`, Mondays | stays | stays |
| `wiki-exam-growth`, monthly | stays | stays |

Every timer change goes in `convex/crons.ts` and `EXPECTED_EVERY_MINUTES` in `convex/jobLedger.ts` in the same commit.

## Phase 0: urgent and stand-alone

Each can be built on its own, in any order. Firecrawl first, because of its deadline.

| Part | What a person gets | Sonae | Size |
|---|---|---|---|
| 0.1 Firecrawl v2 | Website import, the agents' page reader and the money page checks keep working after Firecrawl's v1 stops. Sonae's commit says v1 stops on 10 December 2026 and answers 410 after that. | `9a0b02a1`, `fed5453a`: v2 page lists, `parsers: []`, `maxAge: 0`, titles that may come back as lists. Same `FIRECRAWL_API_KEY`. | S |
| 0.2 Shared agents read only their own company's knowledge | A shared agent reads the platform's knowledge and the asking company's, never another company's. A security fix Hakken's own audit (`f5a51cc2`) missed: `convex/assistantKnowledge.ts` searches an agent's knowledge with no company. | `20f34fa6`, `2a05a33b`: `knowledge.filterAgentChunkIdsInternal`, `knowledgeService.searchAgentChunksByText`, `knowledgeAuthorizationService.ts`, `agentService.assertAgentVisibleToCompany` | S to M |
| 0.3 Unanswered questions stay in their company | A company with an empty wiki no longer puts its questions on the platform's list. Questions already sent there go back home. | `2c6a6186`: `wikiFeedback.logGap`, `recordAnswerOutcomeInternal`, `recordJudgedGapInternal`, the one-off `returnCompanyQuestionsHomeInternal` | S |
| 0.4 Imports go straight in | An imported document goes into the wiki at once, the platform's shelf included. Only a ticked "Review before it writes" waits. | `72e3182f`, `wikiImportStraightIn.test.ts` | S |

## Phase 1: learning on the way in

In this order: 1.1, then 1.2, then 1.3; 1.4 needs 1.1.

| Part | What a person gets | Sonae | Size |
|---|---|---|---|
| 1.1 The whole document is learned | Up to 120,000 characters, in sections, where Hakken reads the first 8,000 today. A re-upload clears every old piece (Hakken has the same stale-pieces fault past 500). | `187a0aac`: `wikiDocumentText.documentFullText`, `splitDocumentIntoSections`, `stitchChunks`, `relevantPassages`, `changedSentences`, `getDocumentSectionInternal`, `forgetIfDeletedInternal`, `relearnCompanyDocumentsInternal`; `saveChunksInternal` returns `{ cleared }` | M |
| 1.2 A page per client and list pages rebuilt as documents come in | Each client gets its own page, with a clients list page. Hakken already has `refreshHubPagesInternal`, but only the nightly tidy calls it. | `187a0aac`: a `CLIENT` page kind, the `clients-index` hub, `WIKI_HUBS` | M |
| 1.3 Answers read enough | An answer opens up to 8 pages within 32,000 characters, where Hakken opens 4 or 5 within 14,000. The earlier question keeps seats on the shortlist, and the list pages always do. | `187a0aac`: `WIKI_PAGES_PER_ANSWER`. The earlier question comes from Hakken's `assistantKnowledge.ts`, not Sonae's `aiChat.ts`. | S to M |
| 1.4 A changed or removed document updates the pages it taught, at once | No page keeps saying what a document no longer says. Today a delete removes only the source note. | `wikiSourceChanges` table, `recordSourceChange`, `removeDocumentFromWiki`, `processSourceChanges`, `followSourceChanges`, `applyCheckupFixInternal`, `removePageInternal`, `dropDocumentReceiptInternal` | M |

Then `wiki-distill-sweep` goes from every 15 minutes to daily.

## Phase 2: the nightly check-up

| Part | What a person gets | Sonae | Size |
|---|---|---|---|
| 2.1 One nightly check-up for every wiki | Every company's wiki is visited each night on rotas, never skipped for being quiet (Hakken's sweeps pick companies by the newest pages on the whole platform). It settles facts by fixed rules, fixes page types, merges duplicates, writes missing topic pages and handles tags. Pages that haven't changed rest 90 days. | `dcebabed`, `b4b13509`, `9b652f18`, `267b0e51`: `wikiCheckup*.ts` (about 3,560 lines), `settleDisagreement`, `isDueForRecheck`; tables `wikiPageTags`, `wikiCheckupRuns`; `wikiPages` fields `lastLinkCheckedAt`, `lastContradictionCheckedAt`, `lastRefileCheckedAt`, `lastTagCheckedAt`, `tags` and their indexes; `WIKI_CHECKUP` staff | L |
| 2.2 Undo, "Fix this wiki now" and Health | Any change the check-up made can be undone (Hakken already keeps `wikiPageRevisions`). A button runs the check-up now with a progress bar. Health shows every wiki's last check-up. | `restoreRevisionFor*`, `startWikiCheckupFor*`, `listCheckupHealth` | M |

| 2.3 Disagreements settled as documents come in (beyond Sonae) | When a new or changed document says something a page already says differently, it's settled then, by the same fixed rules, for the pages that document touched. A newer source that replaces an older fact replaces it then too. Anthony said yes on 21 November 2026. | Sonae does this only nightly. Built on 2.1's settling rules (`wikiCheckupSettle.ts`, `settleDisagreement`) and 1.4's list of pages a document taught. | M |

The four wiki sweeps go in the same commit as 2.1, replaced by `wiki-daily-checkup`, as in Sonae. This is a new automatic run, so it needs Anthony's yes in words (the "no automatic runs unasked" rule).

What 2.3 can't do as a document comes in: a fact that goes stale only because time passes (a price from last year, a source nobody has re-read) has no document arriving to notice it. The nightly check-up keeps looking for those and for pages no recent document touched. Each document's checks are capped, so a large upload can't run up the model bill: whatever's over the cap waits for the night.

## The screens

All admin screens. Each is rebuilt in Hakken's look and rules, never copied in Sonae's ("new AI look").

| Part | What a person gets | Needs first | Size |
|---|---|---|---|
| S0 The AI section's own menu down the left | Artificial Intelligence becomes one item in the main menu, with its own menu down the left, as in Sonae. The wiki's five pages and its map sit in it. Anthony chose this on 21 November 2026. | Sonae `d9179aae` (`aiMenu.ts`, the AI layout and `companyMenu.ts` for a company's AI pages; 41 files, about 1,000 lines). Replaces Hakken's `AiWorkspaceNav.tsx`. Built to Hakken's header rules (`DetailLayout`, one rule, no second divider). | M to L |
| S1 Sources in words | A page's last change always reads as words, never a raw reference (`WikiPageDetailScreen.tsx:94`, `WikiPagesListScreen.tsx:281`). | nothing | S |
| S2 The map is its own menu line and says whose it is | "Wiki map" in the AI menus, with a notice naming the company or the platform. | nothing | S |
| S3 The living map | The wiki as a constellation you can turn, fly into, search, watch grow and fill the window with. Drawn on a 2D `<canvas>` at a fixed height in real pixels, so it no longer stretches at 3,200 wide as Hakken's does today. | `learnedAt` in `wikiPages.listPagesForMap` and `wikiShapes.wikiMapShape` | M |
| S4 The diary as a table with a Show filter | A calm table of what changed, filtered by kind. | nothing (the backend's `action` filter is already there) | S |
| S5 One page in tabs | Page, Sources, History and Links tabs, with its facts beside the words. Tags and undo join after phase 2. | `FactsList` and `SectionLabel` parts | M |
| S6 The wiki in five pages | Pages, Add, Waiting, Ask and Check-up as pages of their own, plus a New goal page. The New goal page also fixes a rule Hakken breaks today: its goal form is a pop-up with fields. | `wikiPages.listPages*` takes a `tag`; `DropArea` and `FormSection` parts | L |
| S7 Unanswered with counts you can press | The unanswered questions, with counts that filter the list. | `wikiFeedback.countAllUnanswered`, a `CountFilters` part | S to M |
| S8 Check-up screens and Health, Wikis | What last night's check-up did, the "Fix this wiki now" button with its progress and every wiki's health. | phase 2; `StepProgress` part | L |
| S9 The Value screen's boxes, hours line and donut | Optional. A donut is a new part, to be named to Anthony before it's drawn. | `DonutChart` | M |

Order: S0, S1, S2, S3, S4, S5 (without tags and undo), S6, S7, then S8 after phase 2, then tags and undo in S5, then S9 if wanted.

### The map's look and what must change from Sonae's

Anthony chose Sonae's look on 21 November 2026. That's the dark starfield ground (`DOTS_GROUND` `#100d18`) with white links, stars and dust. Every page is drawn as a cloud of dots in its kind's colour (`WIKI_KIND_RGB` in Sonae's `chartPalette.ts`). That needs **`dotsPalette.ts` named a sanctioned palette** in `src/theme-drift.test.ts`, beside `chartPalette.ts` and `movementPalette.ts`, with his decision as the reason. Its fixed colours stay in that one file.

**The kinds' colours, fixed for red/green colour blindness** (Anthony, 21 November 2026: "fix the colours for me"). Tested by simulating red-blind and green-blind sight (Machado, Oliveira and Fernandes, 2009, full strength) and measuring how far apart each pair looks (CIEDE2000). Under 10 is hard to tell apart and under 5 looks the same. Sonae's own colours had two pairs he'd see as one:

| Pair | Sonae's, worst sight | Hakken's, worst sight |
|---|---|---|
| Customers and Policies | 1.9, red-blind (the same blue) | 16.7 or more |
| Products and Issues | 5.3, green-blind | 17.3 |

So two kinds change and five stay as Sonae has them:

| Kind | Sonae | Hakken | Why |
|---|---|---|---|
| Customers | `57, 135, 229` blue | same | |
| Clients | `29, 84, 156` dark blue | same | |
| Goals | `158, 197, 244` light blue | same | |
| Sources | `142, 142, 147` grey | same | |
| Issues | `217, 89, 38` orange | same | |
| Products | `201, 133, 0` amber | `255, 170, 0` gold (`#ffaa00`) | Lighter, so it no longer reads as the same brown as Issues. |
| Policies | `144, 133, 233` violet | `226, 54, 112` raspberry (`#e23670`) | Violet turns into the same blue as Customers for him. No purple stays apart from three blues: the best reached about 10. |

With these, every pair is at least 15.1 apart in normal, red-blind and green-blind sight. The two closest pairs are Policies with Sources and Policies with Issues, both in green-blind sight. The closest in normal sight is Customers and Goals at 18.8. Every kind is also named in words (the legend, the labels and the page's card), so colour never carries the meaning alone.

**A test holds it.** Built with S3: `constellationColours.test.ts` simulates both kinds of sight and fails if any two kinds, or any kind and the ground, come closer than 15. A kind added later (Sonae's `CLIENT` came on 12 November) must pass it too.

Hakken's map today pairs orange (Customers, `text-brand`) with green (Goals, `text-success`) and has two greys (Issues and Sources). S3 replaces it.

What still changes from Sonae's, as it's about how the map behaves, not its look:
- **A dot budget for big wikis.** Each page draws 44 to 134 dots and the read allows 1,000 pages, so a full wiki moves about 134,000 dots every frame. Fewer dots per page as the wiki grows.
- **It rests when nobody's looking:** the loop pauses when the map is off screen or still.
- **Reduced motion through Hakken's live `src/hooks/useReducedMotion.ts`**, which also stops the glide and "watch it grow". Sonae reads the setting once and keeps the loop running.
- **Words at 13px**, Hakken's standard (Sonae's are 11 to 12px). Every new line goes through the words checks and a fresh reader. Sonae's hint joins two ideas with a colon and fails `check:words`.
- **No bordered frame or floating card** where Hakken's rules say plain.
- **A real test of the drawing.** Sonae's test switches the canvas off, so the drawing is never tested.

## Hakken's own work to keep

- **Ask Hakken's page chooser** picks from a shortlist on a Fast model within five seconds, counting only the model's time (`e4c1203a`, `b4ad9e70`, `convex/wikiActions.ts`). Keep `modelMsUsed`, the `recordModelSpend` charge arguments and the `returns` validator in `wikiSearch.ts`.
- **Knowledge articles** (`a297c0ab`, `convex/knowledgeArticleWiki.ts`). Every check-up write (fix, merge, move, remove, tag, follow) must skip them (`isKnowledgeArticlePage`). Sonae's `wikiCheckupPages.ts` writes go round Hakken's guards today.
- **Ask Hakken answers through the Assistant** (`21fdcd30`). Sonae's `aiChat` and `aiPromptAssembly` history change doesn't apply.
- **Hakken's test rules.** Sonae's `t.finishAllScheduledFunctions(vi.runAllTimers)` in `wikiCheckup.test.ts` and `wikiDistillActions.test.ts` fails `src/test-time-limits-drift.test.ts`. Rewrite with `finishScheduled(t)`, `useFixedDay` and `aboutMs`.
- **The size limits in `code-ratchets.json`.** `wikiPages.ts` is at 1,829 of 1,850 lines, `knowledge.ts` at 1,685 of 1,700 and `schema.ts` at 4,294 of 4,300. First move the wiki tables into a `wikiSchema.ts`, and put new code in new files.
- **Hakken's screen rules:** status labels not pills (`StatusLabel`, `DecisionLabel`, never `StatusPill`, `DecisionPill` or `StatusDot`), no bordered summary boxes (use `Figure`), no `max-w-[760px]` page wrappers, one line a table row, 15 rows a page on admin tables (not Sonae's 15/25/50/100 choice), no hardcoded colours.

## Not brought over

- **Web gap-filling and its approval gate** (the `GAPS` web step; `748691bd`'s `knowledgeDocuments.origin` and `webReviewStatus`, `wikiPageApprovalService.hasUnreviewedWebSource`, the web review screens). It adds a database read to every index, page and answer read, spends on Firecrawl searches and needs a person to approve, against "Hakken never needs the client". Sonae itself stepped back from writing web findings with no person. With it left out, the map's `hasUnreviewedWebSource` filter and the legacy web-findings queue stay out too.
- **Sonae's staff renames** (`6f8cd249`): Hakken's own writing rules decide its words.
- **The shared-shelf clean-up in `2c6a6186`**: Hakken never filed web findings. Its `returnCompanyQuestionsHomeInternal` does come (part 0.3).
- **Platform Evals drafts** (`wikiExamGrowth.listProposedCasesForGlobal`): optional, later if wanted.

## Decided, 21 November 2026

- **Where the five wiki pages live:** "same as Sonae". In the AI section's own menu down the left (part S0).
- **The map's look:** "same as Sonae". Sonae's starfield, kept in one sanctioned palette file (see "The map's look and what must change from Sonae's").
- **Settling disagreements as documents come in:** "yes". Part 2.3, beyond what Sonae does.
- **The nightly check-up:** he asked whether Sonae runs one. It does: `wiki-daily-checkup`, every night at 02:00 UTC, in place of Sonae's four wiki sweeps and its 15-minute catch-up (Sonae's note: "every 15 mins, that's too often", 9 November 2026). It can be stopped by switching off its "Wiki check-up" agent. With Sonae's `autonomousWiki` switch off, what it finds becomes open questions rather than fixes.

- **The nightly check-up in Hakken:** "Yes for the checks and start the build please" (21 November 2026). `wiki-daily-checkup` runs every night as in Sonae, replacing Hakken's four wiki sweeps.
- **The build:** started on 21 November 2026, phase 0 first.

## Size

Rough, in developer days: phase 0 about 3, phase 1 about 8, phase 2 about 10 (2.3 added), the screens about 19 (S0 added, S9 not counted). About 40 days in all. Every phase also runs Hakken's words checks, a fresh reader for new lines, its drift tests and the full gate before it's handed back.

## Build log

Anthony said "Yes for the checks and start the build please" on 21 November 2026. Built on `dev`, uncommitted, in the order above.

### Phase 0, done 21 November 2026

- **0.1 Firecrawl v2.** `webScrapeActions.ts`, `knowledgeActions.ts` (map and scrape) and `moneyPageChecks.ts` call v2 with `maxAge: 0`; website import reads v2's page objects. `convex/webScrapeActions.test.ts` fails any v1 call left in `convex/` or `src/`. Checked live on dev with Hakken's key.
- **0.2 Knowledge kept to its company.** `knowledgeAuthorizationService.ts` (an admin reaches only an agent their company can see) and `knowledgeAgentScope.ts` (an agent's search reads the platform's pieces and the asking company's only). Ask Hakken's agent search (`assistantKnowledge.ts`) and Test retrieval now pass the company. Sonae's two tests came with it.
- **0.3 Unanswered questions stay in their company** (`wikiFeedback.ts`). On dev all 91 questions on the platform list came from companies; `returnCompanyQuestionsHomeInternal` sent them back to their 5 companies.
- **0.4 Imports go straight in**, the website import included, which Sonae had left waiting. The platform wiki's two lines say so, read by a fresh reader.

### Phases 1 and 2, done 21 November 2026

Ported by a three-way merge per file (the split, Hakken, Sonae as of `187a0aac`), Hakken winning every clash, then:

- **The wiki's tables moved to `convex/wikiSchema.ts`** (checked line for line), with the client page kind, the check-up's rota stamps, tags and indexes, and `wikiPageTags`, `wikiCheckupRuns` and `wikiSourceChanges`. Keep rules for the three. `schema.ts` band 4,300 to 4,100; `wikiPages.ts` 1,850 to 1,800, its list helpers moved to `wikiPageList.ts`.
- **Whole documents, a page per client, answers that read 8 pages within 32,000 characters**, with the earlier question read from the conversation by the chooser itself (`wikiEarlierQuestion.ts`), since Hakken's questions arrive from several places. Ask Hakken's five-second clock and charging kept as they were.
- **The nightly check-up** (`wikiCheckup*.ts`), with undo, "Fix this wiki now", Health and tags, replacing the four wiki timers with `wiki-daily-checkup` at 02:00 UTC. Ran once live on dev: "Everything was already in order."
- **Left out:** the web look-ups for unanswered questions (the second half of the gaps step, its four functions, the `webLookupAt` field and the search call), Sonae's shared-shelf clean-up, and its staff renames (Hakken's names kept; the new helper is "Wiki check-up").
- **Hakken's own guard added:** the check-up never changes a Knowledge article's page (`requireScopedPage`, the link check), with a test.
- **Brought along from Sonae's same files:** a person moved to another company no longer reaches their old company's conversations through knowledge; the actor's email in old audit rows shows only to their own company; re-uploads clear every old piece.
- **Sonae's tests** rewritten to Hakken's test rules (`finishScheduled`), with Hakken's staff names.

### 2.3, done 21 November 2026

`convex/wikiSettleOnArrival.ts`: once a document has been read, or a changed one followed, its 3 newest topic pages are each read beside up to 5 pages they link to. A disagreement is settled by the check-up's own rules (`settleOne`), or raised as an open question with the self-correcting switch off, 2 a page at most. Checked pages are stamped, so the night skips them. The contradiction question is one shared helper (`findContradictions`) for the night and for this. Three tests.

### Screens begun, 21 November 2026 (Anthony: "Yes")

- **S1** `wikiWords.ts` (`useDescribeWikiSource`): a page's last change always reads in words (Document, Nightly check-up, Something else), one helper for the pages list and a page's screen.
- **S4** the diary's filter is the kit's `Select`, named "Show". Its rows were already one line each, which the upstream's stacked cell would have broken.
- **S7** `CountFilters` came into the kit (`src/ui/components/screens/CountFilters.tsx`, listed in screen-kit.md): All, Platform and Companies on the platform's Unanswered list are counts you can press, from `wikiFeedback.countAllUnanswered`. It replaced a hand-drawn segmented filter whose active choice was brand orange.
- **S3** the living map: `WikiConstellation.tsx`, `constellationGeometry.ts`, `dotsPalette.ts` (a sanctioned palette in `src/theme-drift.test.ts`) and `WIKI_KIND_RGB` in `chartPalette.ts` with the two colours fixed for colour blindness, held by `constellationColours.test.ts`. Changed from the upstream: a dot budget (`MAP_DOT_BUDGET`, 30,000 dots for the whole map), the loop rests while the map is off screen or the tab is hidden, Hakken's live `useReducedMotion` (which also hides Watch it grow), words at 13px, and the map's 23 lines written in Hakken's style. `Button` gained `buttonClasses` for a link that looks like a button. Seen working in Anthony's Chrome on the platform wiki.

Built since: see the next entry.


### Screens S0, S2, S5 and S8, done 21 November 2026

- **S0** the AI section's own menu down the left: `src/app/(dashboard)/admin/ai/_components/aiMenu.ts` and `AiFrame.tsx`, with Tool servers moved in from the admin menu. `AiWorkspaceNav.tsx` is gone. One `DetailLayout` rule, no second divider.
- **S2** "Wiki map" is a line of that menu (`aiMenu.ts`, `wikiMap`), and the map names whose wiki it is, the company's or the platform's.
- **S5** one page in tabs (`WikiPageDetailScreen.tsx`): Page, Sources, History and Links, each with its own address (`?tab=history`). Facts sit beside the words in the kit's new `FactsList` and `SectionLabel`. Tags (`WikiPageTags.tsx`) and putting back an earlier version came with it, now phase 2 is in.
- **S8** the check-up's screens: `WikiCheckupScreen.tsx` with `WikiCheckupPanel.tsx` (last night's run, its counts and "Fix this wiki now" with its steps in the kit's new `StepProgress`), and Health, Wikis (`src/app/(dashboard)/admin/health/wikis/`), every wiki's last check-up. The run's written summary uses the counts' own names, "page kinds fixed" and "disagreements settled" (`summariseFound`, `wikiCheckupRules.ts`).

Every new line was read by a fresh reader and signed off, the last two on 21 November 2026 ("Fixing page kinds", "Page kinds fixed"). Kept against a reader, and told to Anthony: "Turn slowly" and "Stop turning" (the button hides under reduced motion instead), "Changed by" (its value now says "Staff") and "conversations" (pages learn from calls, emails and chats).

### S6, done 21 November 2026

The wiki's one long page is now five pages in the AI menu, for the platform's wiki and each company's: Wiki pages, Add to the wiki, Waiting on you, Ask the wiki and Check-up, beside Wiki map and Diary. A company's AI menu has the same lines.

- **Wiki pages** (`WikiPagesScreen.tsx`): a lean table of Page, Kind, Used, Last change and Sources, one line a row, the whole row opening the page. Kind and Tag filter it (Tag only when the wiki has tags; `listPages*` takes `tag`), and Kind includes Client work. Delete stays on the row, only for someone who can write. New goal and Download vault sit beside the title, with Clear wiki on a company's.
- **Add to the wiki** (`WikiAddScreen.tsx`, `WikiImportBox.tsx`): Website, File, Text and Vault tabs with their own address (`?kind=`), the kit's new `DropArea` for files and vaults, one tick box ("Approve before the wiki learns from it") and the reading progress under it.
- **Waiting on you** (`WikiWaitingScreen.tsx`): imports waiting for approval and open questions, under the kit's new `FormSection` headings.
- **Ask the wiki** (`WikiAskScreen.tsx`) and **Check-up** (`WikiCheckupPage.tsx`: the check-up, then This week as figures, its Waiting figure opening Waiting on you).
- **New goal** (`WikiNewGoalScreen.tsx`) is a page with `DetailHeader`, so the goal pop-up with fields is gone.
- `WikiPagesListScreen.tsx` is deleted. Allowlists only shrank: 3 entries off `screen-kit-allowlist.json`, 5 off `word-style-allowlist.json`.

Every new line had a fresh read, and every fault was fixed. Checked on 21 November 2026: typecheck and `check:guards` clean, the affected tests (408 files, 3,249 tests) and lint pass, and every page seen working in Anthony's Chrome, the platform's wiki and Period House Group's. The full `npm run check` hasn't run, and nothing is committed.

The plan is built except S9 (the Value screen's donut), which was optional and waits on Anthony.
