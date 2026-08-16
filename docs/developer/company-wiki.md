# Company Wiki

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

Page kinds are `CUSTOMER`, `PRODUCT`, `POLICY`, `ISSUE`, and `SOURCE`. Customer pages are keyed from sales/customer account identity and must not be exposed to anonymous or broad topic retrieval. Source pages preserve a substantially intact document note and are not model-shortened by the tending pass.

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

The scheduled wiring lives in `convex/crons.ts`. Integration hooks also appear in knowledge ingestion, phone-call handling, Gmail watching, chat/question answering, and message evidence.

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

Ready company knowledge documents are distillable when they are not thread-scoped, have a company id, have not been stamped with `wikiDistilledAt`, and are not waiting on `wikiReviewRequested`.

The distiller claims documents before model work. This prevents concurrent on-ready hooks and catch-up sweeps from teaching the same document twice. A failed model call after claim is logged and left rather than retried indefinitely.

The import UI can mark website/file/manual imports for review. The Reviewer reads the ready document and files a pending `wikiReviews` row. Approval clears the document review flag and schedules normal distillation. Rejection stamps the document as distilled without teaching the wiki.

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
