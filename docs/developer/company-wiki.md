---
product: Hakken
documentation_type: Developer guide
feature_area: Company Wiki
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/company-wiki.md
last_reviewed: '2026-10-26T14:25:23+00:00'
reviewed_against: current implementation
status: Current
---
# Company Wiki

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Company Wiki
> **Reviewed:** 26 October 2026, 14:25:23 GMT (Europe/London)
> **Source path:** `docs/developer/company-wiki.md` · **Status:** Current


Core page, import/review, answer selection and bounded staff maintenance, feedback, exam and reporting paths are reviewed below.

The Company Wiki is implemented as a page-based knowledge layer on top of the existing knowledge store. The source archive still uses `knowledgeDocuments` and `knowledgeChunks`, but company answering and admin review now operate through whole wiki pages, source receipts, open questions, reviews, staff agents, and a deterministic map. The same shared UI now also mounts a platform-scope Wiki at `/admin/ai/knowledge`, backed by global functions where `companyId` is absent; those are restricted to super admins for writes and super-admin/read-only console roles for reads.

Read this before changing the Wiki routes, `convex/wiki*.ts`, wiki schema tables, knowledge distillation hooks, phone/email/customer rewrite hooks, or company AI navigation that points people from Knowledge to Wiki.

## Routes And UI

The routed surfaces are:

- `src/app/(dashboard)/admin/ai/knowledge/page.tsx` for the platform Wiki.
- `src/app/(dashboard)/admin/ai/knowledge/[pageId]/page.tsx` for platform page detail.
- `src/app/(dashboard)/admin/ai/knowledge/map/page.tsx` for the platform graph.
- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx` as the old Global Knowledge redirect to `/admin/ai/knowledge`.
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/page.tsx` for a selected company's wiki.
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/[pageId]/page.tsx` for selected company page detail.
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/map/page.tsx` for the selected company graph.

The shared UI lives in `src/app/(dashboard)/admin/_features/wiki/`:

- `WikiPagesListScreen.tsx` lists pages, renders import controls, shows distillation progress, pending reviews, open questions, and 15-row pagination.
- `WikiPageDetailScreen.tsx` edits the body, pins/unpins human corrections, shows receipts, and shows revision history.
- `WikiMapScreen.tsx` renders the deterministic graph from page links with pan, zoom, hover-neighbour highlighting, and page navigation.
- `WikiImportBox.tsx` wraps website, file/folder, and manual-text imports and can mark an import for review before distillation.

The global AI navigation labels `/admin/ai/knowledge` as Wiki and mounts the
platform Wiki there. The company detail navigation routes company knowledge work
to `/admin/companies/[id]/ai/pages`. The older company Knowledge routes stay
reachable as the archive of source documents behind receipts.

## Data Model

Wiki tables in `convex/schema.ts` are:

- `wikiPages`: one page per scope, `kind`, and `subjectKey`, with content, links, pinned corrections, rewrite counters, document-source counts, last rewrite source, tending/verification timestamps, and update timestamps. Company pages carry `companyId`; platform pages deliberately leave it absent.
- `wikiPageSources`: receipts linking a page to a document, phone call, email, human edit, or chat synthesis.
- `wikiDistillState`: per-scope progress counters for the distiller.
- `wikiOpenQuestions`: contradiction and freshness findings awaiting human settlement, scoped by company id when present.
- `wikiReviews`: pre-distillation review checkpoints for sensitive imports, scoped by company id when present.
- `wikiPageRevisions`: previous page content written before each rewrite.

Page kinds are `CUSTOMER`, `PRODUCT`, `POLICY`, `ISSUE`, `SOURCE`, and `GOAL`. Customer pages are keyed from sales/customer account identity and must not be exposed to anonymous or broad topic retrieval. Source pages preserve the bounded document text supplied to them and are not model-shortened by the tending pass.

Knowledge documents also carry wiki fields:

- `wikiDistilledAt` marks material already claimed by the distiller.
- `wikiReviewRequested` blocks distillation until the Reviewer path approves it.

Agents can carry a `systemKey` for built-in wiki staff rows.

## Backend Modules

Core modules:

- `convex/wikiPages.ts` owns tenant/admin page reads, edits, pinning, link updates, page context rendering, source receipts, revisions, and whole-page answer context.
- `convex/wikiActions.ts` owns model-assisted page selection for answers and rewrites from events.
- `convex/wikiRewriteService.ts` owns rewrite prompt assembly, validation, link parsing, source-key parsing, and page rendering helpers.
- `convex/wikiDistill.ts` and `convex/wikiDistillActions.ts` claim ready company knowledge documents, create source notes, propose topic pages, write pages, record progress, and run catch-up sweeps.
- `convex/wikiStaff.ts` seeds built-in staff agents, checks whether each staff agent is active, and records staff runs into the normal agent run table.
- `convex/wikiTending.ts` and `convex/wikiTendingActions.ts` repair broken links and tidy overgrown synthesis pages on a bounded cadence.
- `convex/wikiQuestions.ts`, `convex/wikiContradictionActions.ts`, and `convex/wikiFreshnessActions.ts` raise contradiction/freshness questions and auto-resolve stale findings.
- `convex/wikiReviews.ts` and `convex/wikiReviewActions.ts` hold sensitive imports until a person approves or rejects them.
- `convex/wikiFilingActions.ts` decides whether an answered question created durable new synthesis worth filing back to the wiki.
- `convex/wikiExam.ts`, `convex/wikiExamActions.ts`, and `convex/wikiExamService.ts` provide the wiki exam/evaluation path.

The scheduled wiring lives in `convex/crons.ts`. Integration hooks also appear in knowledge ingestion, phone-call handling, chat/question answering and message evidence. Gmail watching is retired; old email receipt types are not evidence of an active mailbox integration.

Global/platform Wiki doors exist in the same backend modules:

- `listPagesForGlobal`, `getPageDetailForGlobal`, `editPageContentForGlobal`,
  `pinCorrectionForGlobal`, and `unpinCorrectionForGlobal` in
  `convex/wikiPages.ts`.
- `getDistillProgressForGlobal` in `convex/wikiDistill.ts`.
- `listOpenQuestionsForGlobal` and `dismissOpenQuestionForGlobal` in
  `convex/wikiQuestions.ts`.
- `listPendingReviewsForGlobal` and `decideReviewForGlobal` in
  `convex/wikiReviews.ts`.

These use `companyId: undefined` as the platform scope. Reads are limited to
`SUPER_ADMIN` and `READ_ONLY`; writes and review/question decisions are limited
to `SUPER_ADMIN`.

## Distillation And Review Flow

Ready sources are eligible through the exact company/global scope condition described below, with no thread, no distilled stamp and no pending review flag.

The distiller claims documents before model work. This prevents concurrent on-ready hooks and catch-up sweeps from teaching the same document twice. `releaseDistillClaimInternal` releases a failed claim for catch-up until `WIKI_DISTILL_MAX_ATTEMPTS` reaches three; the exhausted document remains claimed. This replaces the older leave-on-first-failure behavior. The Distiller must be active for on-ready work.

The import UI can mark website/file/manual imports for review. The active Reviewer reads bounded ready-source text and files a pending `wikiReviews` row. If `WIKI_REVIEWER` is inactive, `prepareReview` clears the flag and schedules distillation directly; the checkbox is not an unconditional human-approval boundary. A model error still files an empty-claims pending review. Approval clears the document review flag and schedules normal distillation. Rejection stamps the document as distilled without teaching the wiki.

## Rewrites, Pins, Sources, And History

Page rewrites must preserve the separation between machine text and human corrections:

- Machine rewrites update `content`.
- Human pins live in `pinnedCorrections`.
- Read paths append or present pinned corrections separately.
- Rewrite prompts receive pinned corrections, but validation and storage must not rely on prompt obedience alone.

Every meaningful page rewrite should keep receipts and history:

- `wikiPageSources` records what taught the page.
- `wikiPageRevisions` stores the content before the rewrite.
- Audit rows record human edits, pins, review decisions, question dismissal, and mechanical link repair where implemented.

Do not collapse these into a single blob field. The product depends on being able to inspect why a page changed.

## Answer Context

Wiki answer context reads whole pages. The preferred path in `selectWikiContextForQuery` asks the model to choose from the company wiki index, then opens selected pages whole with one hop along the best page's links. The mechanical word-match path in `getWikiAnswerContextInternal` is the provider-failure fallback.

Customer pages are included only when the caller explicitly requests customer-page context for signed-in company surfaces. Anonymous widget or broad topic answers must not use customer pages. Keep this boundary explicit when adding new answer surfaces.

## Map And Links

Links are stored as page keys, such as `PRODUCT:some-slug`. `WikiMapScreen` builds a stable client-side layout from those links. The map is deliberately deterministic: node positions are seeded from page ids, capped at 400 nodes, and scaled so zoom reveals detail without inflating labels and dots.

Link maintenance has two paths:

- mechanical repairs remove dead links during tending
- model-assisted linking proposes genuinely related pages and hub/index structure

Do not use map rendering as the source of truth for links. The `wikiPages.links` field owns the graph.

## Authorization And Tenancy

The Wiki uses tenant/admin builders rather than public functions:

- platform pages use global functions from `/admin/ai/knowledge`
- company detail routes use admin functions plus `assertAdminCanAccessCompany`
- internal actions and mutations require their public or scheduled caller to establish context first

Company Wiki data must stay tenant-isolated. Cross-company page reads, source
receipts, review decisions, question dismissal, and map rows must stay
impossible through public/admin query arguments.

Platform-scope Wiki rows are a separate scope represented by absent `companyId`,
not a wildcard. Company admins must never reach platform Wiki rows, and platform
Wiki functions must never be usable as a path into company Wiki rows. Keep the
global read/write split explicit: `READ_ONLY` can inspect platform pages,
questions, reviews, and progress, while only `SUPER_ADMIN` can edit, pin, unpin,
dismiss, or decide.

## Tests And Validation

Focused coverage currently includes:

- `convex/wikiPages.test.ts`
- `convex/wikiDistill.test.ts`
- `convex/wikiFreshness.test.ts`
- `convex/wikiQuestions.test.ts`
- `convex/wikiReviews.test.ts`
- `convex/wikiStaff.test.ts`
- `convex/wikiTending.test.ts`
- `src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav.test.tsx`
- company-layout navigation characterization tests where Wiki replaces Knowledge in the menu

When changing the wiki, run the focused wiki tests first, then the affected knowledge/chat/phone/email tests if the hook changes. For documentation-only updates, run `git diff --check` and the local docs link/index checks used by the documentation upkeep loop.

## Maintenance Rules

Preserve these invariants:

- The current implementation is page-based; do not describe it as vector retrieval or chunk-only RAG.
- Source documents remain as receipts even when Wiki is the primary user-facing knowledge surface.
- Customer pages are not available to anonymous callers.
- Platform-scope Wiki rows are separate from company Wiki rows; absent
  `companyId` must never mean "all companies."
- Pinned corrections are human-owned and survive machine rewrites.
- Sensitive imports marked for review do not teach the wiki before approval.
- Staff agents are ordinary seeded agents that can be stood down, not hidden hardcoded jobs.
- The map reflects stored links; it must not invent relationships only in the UI.

## Current Page And Review Contracts

`applyHumanEdit` resolves the page in the requested scope, refuses protected Knowledge article mirrors, trims content to four thousand characters, rejects empty content, records the prior body in `wikiPageRevisions`, and updates search text and rewrite attribution. Identical content is a no-op. `applyPin` stores a separate correction capped at five hundred characters; body rewrites do not erase that array. `applyUnpin` selects by pin timestamp and records an audit event. These are explicit document operations, not general writes to another tenant's page ID.

`applyDelete` checks scope and protected article status, deletes up to five hundred `wikiPageSources` receipts and the page, and writes `WIKI_PAGE_DELETE`. It does not enumerate all inbound links, revisions or questions. Tending is expected to repair dangling links later. `clearWikiForCompany` takes fifty pages and calls the same deletion helper, then reads one remaining row. Its remaining field is a presence indicator, not a full count. Protected article mirrors can make a batch fail. The operation does not erase knowledge source documents or establish that scheduled staff cannot later teach new pages.

`getReviewableDocumentInternal` requires ready status and `wikiReviewRequested`. It takes source text or at most ten chunks and slices to eight thousand characters. `prepareReview` resolves the configured fast-chat model, requests up to six claims, records the staff model call, and catches parsing/provider failure before filing a review. `fileReviewInternal` checks `by_document` to avoid a second review row. Pending lists use `by_company_status`, newest first, capped at twenty-five. Parsed claims are returned instead of raw model JSON.

`decideCore` checks the review belongs to the exact company/global scope and ignores already decided records. Approval clears the document flag and schedules `distilNewDocument`; rejection sets `wikiDistilledAt` to park the source without teaching it. Both decisions are audited. This is separate from workflow approvals and agent tool approvals and does not share their expiry behavior merely because all are called approvals.

## Source Claims And Selection Bounds

`isDistillable` accepts ready, unclaimed, non-thread documents that belong to a company or are global without an agent, and excludes pending review flags. Its literal condition allows a document carrying company scope even if it also carries an agent ID; do not infer a universal agent-document exclusion from comments alone. Source text is limited to eight thousand characters, with at most twelve chunks read as fallback. Claiming stamps before text extraction; an empty-text return after stamping does not take the action's normal caught-error release path. A claimed stamp therefore needs context before it is counted as successful teaching.

`distilOne` writes the source note first, then asks the configured fast-chat model for topics, rewrites relevant pages and links them to source evidence. Model calls are recorded against the staff role. Failed calls in the normal on-ready action release the claim with an incremented attempt count until the third failure, after which it remains claimed and a failed staff run explains the outcome. This is finite recovery, not indefinite guaranteed eventual completion.

`selectWikiContextForQuery` builds company and global indexes separately, prefixes global keys, and suppresses global keys already represented in the company shortlist. It gives company content first claim on the default fourteen-thousand-character budget; global content is opened only with more than four hundred characters left. Customer pages are controlled by an explicit flag and always excluded from the global shelf. Model picks are validated against offered keys and capped at four. A configured yes/no Decision can discard a selected page; its fallback keeps the candidate.

Selection first offers tended pages, then includes source notes if no tended page survives. A provider/parsing exception uses the mechanical answer-context path. This fallback does not mean the entire corpus was read. `getWikiIndexInternal` uses a full recent index up to two hundred rows, then a bounded recent slice of one hundred fifty plus search matches and hubs. The map query reads at most one thousand rows and its layout caps at four hundred. Keep those retrieval/display bounds distinct from deletion or retention guarantees.


## Staff Dispatch, Tending, And Link Continuations

`wikiStaffRunActions.ts` maps stable staff system keys to their actual sweep actions. It records a run summary after dispatch; downstream company actions can still be pending. The Reviewer and Filing Clerk return event-driven explanations rather than running a generic model objective. Sweeps ensure staff records exist and consult role activation. `wikiTending.listCompaniesWithPagesInternal` discovers scopes from at most 1,000 recent page rows; this is a bounded scope discovery mechanism, not proof that every company on a very large platform is visited.

`getTendingCandidatesInternal` reads up to 500 scope pages, verifies suspected link targets using kind/subject identity, and chooses at most three overgrown pages. The threshold is 75% of the rewrite character limit and the interval is seven days. Source, goal, article-backed, and index pages are excluded from model shortening. `tendCompany` repairs links, resolves the fast-chat model, validates proposed text, and accepts it only when shorter than the original. It uses `applyRewriteInternal` so revisions and pinned-layer behavior follow the common write path. A failed/unsuitable attempt still marks the page tended, affecting its next eligible day.

`crossLinkSweep` starts from up to 20 sparse topics and ten orphan source notes by default, uses an index without customer pages, and records a visit even when nothing connects. A positive linked count schedules another pass; zero ends the chain and refreshes hubs. This is progress-based continuation, not a promise that all nodes will eventually acquire arbitrary links. Provider/parsing errors are caught per page so remaining candidates can proceed.

## Freshness And Contradiction Evidence

`wikiFreshness.ts` reads up to 500 pages, skips source/customer/index entries, and selects at most three document-backed candidates older than 21 days and not recently checked. Receipt reads take 20; document text or up to eight chunks provide bounded source excerpts. `checkFreshnessForCompany` raises a missing-source question when nothing remains to check, then marks the page verified. Here verified means visited by this workflow, not necessarily supported. Model results and the `wiki.claim-supported` Decision contribute to whether a freshness question is raised.

Goals use a separate 45-day inactivity rule, with up to ten stale goals. Their question dedupe key includes page identity and update time. `wikiQuestions` stores dedupe identities, truncates claims/details, and can auto-resolve bounded open questions whose referenced claim no longer remains. This is a mechanical stale-question check, not a new editorial verdict on the replacement text.

`wikiContradictionActions` first auto-resolves stale questions, then reads product, policy, and issue clusters. A cluster is selected from up to 20 rows, retaining up to 12 excerpts of 700 characters. It validates model-named page identities and caps findings at five per cluster. `wiki.claims-disagree` can confirm or reject the proposed pair; the fallback treats the reading model's candidate as a disagreement. Pair/normalized-claim dedupe limits repeats. No exhaustive all-pairs contradiction check or automatic disputed-content replacement is implemented by this action.

The cron registrations route through the job ledger: tending and freshness/contradiction sweeps run on daily intervals, weekly reports are Monday 07:00 UTC, and exam growth is the first of the month at 08:00 UTC. These are repository registrations, not evidence a production scheduler is healthy. Shared model configuration resolves fast-chat and records staff usage; no credential values belong in the diary or this guide.

## Answer Feedback And Gap Routing

`wikiFeedback.recordAnswerOutcomeInternal` updates company daily answer tallies and bounded page usage. Missing-answer questions first pass the substantive-question rule and are scheduled for `wikiFeedbackActions.judgeUnansweredQuestion`. That Decision changes the list only when it returns an actionable yes/no result disagreeing with the rule; off, uncertain, or agreeing results preserve rule behavior.

`logGap` normalizes the question and checks whether a company has any own Wiki page. If it does not, the gap is routed to platform scope. Platform gap rows retain a capped set of contributing company IDs internally, while the screen exposes counts rather than names. They can retain the question text; company isolation of ordinary page data must not be restated as a blanket promise that no company-originated question ever enters a platform improvement queue. `by_company_key` merges repeated normalized questions and increments demand. Replays are not request-ID deduplicated customer events.

## Comparison Exam And Growth Drafts

`wikiExamActions.runWikiExam` is an internal company action using the fixed `WIKI_EXAM_QUESTIONS` from `wikiExamService.ts`. For each prompt it retrieves once through forced chunk mode and once through forced Wiki mode, generates both answers, and grades each against expected behavior and forbidden claims. It uses the configured fast-chat model for these calls, so unlike agent smoke grading this comparison does not promise a different independent grader. Missing/unparseable verdicts fail closed. Overall Wiki passage requires at least the chunk score and no blocker that passed chunks but failed Wiki. Results are audited; this action is not an unrestricted production correctness proof.

`wikiExam.seedWikiExamCasesInternal` seeds the fixed cases idempotently by name into company eval cases. Growth is separate: `wikiExamGrowth.listGrowthCandidatesInternal` takes 50 resolved gaps, reads up to 300 company-chat cases/fingerprints, selects eight uncovered candidates, and supplies up to 100 existing prompts. The growth action asks for up to three drafts, validates fields, and calls the internal proposal mutation. These are draft cases with source fingerprints; accepting/rejecting belongs to the review path. Rejected fingerprints prevent the same normalized source question from being proposed again while that evidence remains. Growth runs no exam automatically and changes no release or activation gate.

## Diary, Reports, And Verification

`wikiDiary` cursor-paginates company audit rows first, then keeps the allowed Wiki actions and optional selected action. It can return a thin page with more history available. Detail text is selected from known metadata fields and capped at 140 characters; missing/deleted pages can lose a live title link without erasing the audit row. Ordinary admins require company access; the global diary is super-admin-only.

`wikiReport.buildReport` uses a seven-day window with up to 2,000 audit rows, 14 answer-tally day rows, 500 runs, and 100 rows for individual waiting/open populations. Platform unanswered count has a distinct open-row rule rather than company answer tallies. `sendWeeklyReports` skips quiet scopes, notifies up to the fetched 200 company members filtered to ADMIN, and separately handles super-admin platform summaries. It reports a count of personal notes learned without disclosing their content. Its time-saved estimate assumes seven minutes per answer; it is not measured labor savings, revenue, or verified delivery.

Relevant source tests include `wikiTendingActions.test.ts`, `wikiFreshnessActions.test.ts`, `wikiContradictionActions.test.ts`, `wikiExamActions.test.ts`, `wikiExamGrowthActions.test.ts`, `wikiFeedback.test.ts`, `wikiDiary.test.ts`, and `wikiReport.test.ts`. These local examples were read without executing models or staff operations. Preserve dated plan/verification records and the existing core CRUD/source/retrieval limits above. No source repair, schedule change, product-direction change, or live acceptance claim is part of this maintenance pass.
