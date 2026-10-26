---
product: Hakken
documentation_type: developer guide
feature_area: knowledge sources and retrieval
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/knowledge-management.md
last_reviewed: '2026-10-26T09:54:27+00:00'
reviewed_against: current implementation
status: Current
---
# Knowledge Management

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Knowledge sources and retrieval
> **Reviewed:** 26 October 2026, 09:54:27 GMT (Europe/London)
> **Source path:** `docs/developer/knowledge-management.md` · **Status:** Current

Knowledge management is implemented by `convex/knowledge.ts`, `convex/knowledgeActions.ts`, `convex/knowledgeService.ts`, `convex/knowledgeRetrieval.ts`, shared upload policy helpers, the reusable `KnowledgeManager` admin feature, and assistant thread upload flows. It supports global, company, agent, and thread-scoped documents.

Company knowledge now has a separate page-based layer documented in [Company Wiki](./company-wiki.md). Treat this guide as the source archive, ingestion, chunking, repair, and retrieval guide; treat the Wiki guide as the current company-facing pages, map, receipts, review, staff-agent, and whole-page answer-context guide.

## Route Map

- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx` redirects to the platform Wiki at `/admin/ai/knowledge`; it no longer renders a separate archive screen.
- `src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx` renders company knowledge source documents behind the Company AI area.
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx` renders agent knowledge.
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` is the shared admin knowledge UI, holding the document list, search, pagination, and upload queue.
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeModals.tsx` holds its four dialogs: upload, document delete, document inspect, and website delete.
- `src/app/(dashboard)/admin/_features/knowledge/knowledgeUploadUtils.ts` walks dropped folders, preserves relative paths, caps batches, skips reserved OKF bundle files, and limits browser upload concurrency.
- `src/app/(dashboard)/app/assistant/page.tsx` and thread routes use chat-thread document APIs for assistant attachments.

## Data Model

`knowledgeDocuments` stores title, source fields, scope fields, status, format, creator, timestamps, ingestion markers, error previews, and embedding model metadata. `knowledgeChunks` stores searchable chunk text, vector embeddings, scope fields, and embedding metadata.

Scope is sparse:

- no company, agent, or thread means global knowledge
- `companyId` means company knowledge
- `agentId` plus company context means agent-scoped knowledge
- `threadId` means temporary chat-thread knowledge

Thread vectors expire through `garbageCollectThreadVectors`; the helper threshold is currently 24 hours.

## Convex API

`convex/knowledge.ts` provides document inventory, pagination, upload setup, manual text, website queueing, deletion, quality inspection, retrieval testing, retry, repair, and internal chunk persistence.

Important public functions include:

- `generateUploadUrl`
- `saveDocument`
- `saveManualText`
- `queueWebsiteUrls`
- `getDocuments`
- `getPaginatedDocuments`
- `getQualitySummary`
- `inspectDocument`
- `testRetrieval`
- `retryDocumentIngestion`
- `repairFlaggedDocuments`
- `deleteDocument`
- `deleteWebsiteBulk`
- `saveChatDocument`
- `getThreadDocuments`

Internal functions support ingestion actions, queue processing, chunk replacement, document status transitions, and thread-vector cleanup.

## Authorization And Scope

`knowledgeService.assertCanAccessKnowledgeScope` enforces global and company access. Global knowledge requires `SUPER_ADMIN`. Company knowledge requires super-admin access or an admin whose active company matches the scope. Agent-scoped admin writes inherit the admin's active company where needed.

Standard users cannot upload admin knowledge documents. Thread knowledge is narrower: owners can read their own thread documents, super admins can read them, and company admins can read thread documents for their company.

## Ingestion Pipeline

File and manual text ingestion schedules `internal.knowledgeActions.ingestDocument`. The action reads stored file content or manual text, extracts PDFs with `pdf-extraction`, extracts Word `.docx` files with `mammoth`, and otherwise falls back to UTF-8 text decoding before chunking. CSV, Markdown, and plain text work through that text fallback. Markdown is then prepared by `prepareKnowledgeMarkdown`: YAML frontmatter is removed from searchable text and its `title` can replace the uploaded filename. Although the shared upload policy currently accepts Excel MIME types, admin and thread knowledge ingestion does not yet use the richer Excel parser from `convex/utils/fileParser.ts`; do not promise reliable spreadsheet extraction for persisted knowledge until that implementation is added. After text extraction, `convex/utils/knowledgeActionsService.ts` normalizes whitespace and chunks content with the current 1,000-character target and 200-character overlap, adjusting overlap safely when a caller supplies smaller chunk sizes. Ingestion then resolves the active embedding model through stored AI model defaults, embeds chunks with Vertex, and saves chunk batches through `internal.knowledge.saveChunksInternal`.

Bulk uploads accept at most 500 files per gesture. `knowledgeUploadUtils.ts` walks nested folder entries, retains relative paths after dropping the common top-level folder, skips `index.md` and `log.md` only when they are part of a folder bundle, and uploads at concurrency four. `saveDocument` can defer ingestion so the browser can finish creating pending records first. `startKnowledgeFileQueue` then starts the fixed-width backend queue; `processKnowledgeFileQueue` claims one pending non-URL document transactionally, ingests it, records failure on that document without blocking later files, and reschedules until the queue is empty. Keep the file queue distinct from `processWebsiteQueue`; URL documents must never be claimed as uploaded files or vice versa.

The Company Wiki distiller can consume ready company knowledge documents after ingestion. Documents marked with `wikiReviewRequested` wait for the Wiki review flow before they can be distilled, and `wikiDistilledAt` records that the wiki has already claimed a source. Keep these fields coordinated with [Company Wiki](./company-wiki.md) when changing ingestion completion hooks.

Website ingestion uses Firecrawl and the shared URL safety helper in `convex/utils/security.ts`:

- `mapWebsite` requires an action-admin identity, validates the URL with `validateSafeUrl`, and calls Firecrawl map with a cap of 100 links.
- `queueWebsiteUrls` validates URLs, creates pending URL documents, and schedules `processWebsiteQueue`.
- `processWebsiteQueue` scrapes one pending URL at a time, handles Firecrawl 429 responses by requeueing, embeds scraped markdown, and schedules the next queue check.

`validateSafeUrl` is also reused by external URL actions outside knowledge ingestion. It allows only HTTP and HTTPS URLs, rejects malformed URLs, blocks localhost and known cloud metadata hosts, blocks private IPv4 ranges including loopback, link-local, carrier-grade NAT, and RFC1918 ranges, blocks private or loopback IPv6 forms, and rejects IPv4-mapped IPv6 plus non-standard numeric, hexadecimal, and octal IP representations. Preserve that shared helper rather than recreating narrower URL filters in feature code.

The embedding path records provider key, logical model id, provider model id, and dimensions so quality checks can detect model drift later.

## Quality, Inspection, And Retrieval

Quality flags include:

- failed ingestion
- ready documents without chunks
- embedding model drift
- stale pending or processing ingestion

`getQualitySummary` samples scoped documents, counts flags, reports active embedding model information, and returns recommendations. Agent summaries can compare ready chunks with agent profile terms and warn when important terms appear uncovered.

`inspectDocument` returns document metadata and a bounded chunk preview. Previews sanitize potentially dangerous chunk text before display.

Production retrieval is centralized in `convex/knowledgeRetrieval.ts`. It embeds the query, runs vector and scoped text search in parallel for each explicit company, agent, thread, or global scope, and fuses the rankings with reciprocal rank fusion from `convex/knowledgeRetrievalService.ts`. Keyword failure is best-effort: vector results can still proceed. When `retrievalPriors` is enabled, recent positive and negative message evidence adds a decaying, bounded per-chunk prior that may move a result a few places but cannot replace relevance or remove the only matching source. The closed scope union deliberately makes an unscoped cross-tenant search impossible to express.

**The Library** (Admin → Content → Library, `docs/plans/active/content-library-plan.md`) is a shelf apart from both the wiki and these documents: other websites' articles, read through Firecrawl (`libraryArticleActions.readPage`, sharing `webScrapeActions.fetchPage`) and kept whole (`libraryArticles`, `libraryArticleTexts`). An article in Ask Hakken's knowledge is cut at its headings into `libraryArticleSections`, with a full-text index; `aiChat.generateHakkenResponse` searches them by the question's distinctive words (`libraryArticles.searchLibraryInternal`: at most three sections sharing two of its words) and adds them inside `buildUntrustedKnowledgeContext`, never for a widget thread. Nothing is embedded and nothing reaches the wiki or the Distiller.

`testRetrieval` remains an admin inspection helper rather than a full simulation of every runtime prompt path. Keep its user-facing explanation honest when production ranking changes.

## Repair And Cleanup

`retryDocumentIngestion` requeues failed or stale documents and clears old chunks when appropriate. `repairFlaggedDocuments` processes a bounded batch of flagged scoped documents. `deleteWebsiteBulk` deletes URL documents under a root website only within the authorized scope. `deleteDocument` deletes the file and source record, schedules `purgeDocumentChunksInternal` in batches of one hundred, and removes its SOURCE Wiki page with a bounded receipt read of five hundred. Learned TOPIC pages remain. Website bulk deletion is bounded and must not be described as universal erasure of derived Wiki content.

Thread-vector cleanup should remain internal. Do not expose it as a user action without a clear retention policy.

## Tests

Current coverage includes:

- `convex/knowledge.test.ts` for auth, scope isolation, manual text, website URL safety, pagination, quality, inspection, retrieval, retry, repair, website bulk deletion, thread documents, and garbage collection
- `convex/knowledgeActions.test.ts` for action auth, Firecrawl mapping, queue processing, and ingestion failure handling
- `convex/knowledgeService.test.ts` for scope helpers and document/chunk record builders
- `convex/knowledgeActionsService.test.ts` for chunking helpers
- `convex/knowledgeRetrievalService.test.ts` for reciprocal-rank fusion and bounded evidence priors
- `src/app/(dashboard)/admin/_features/knowledge/knowledgeUploadUtils.test.ts` for folder traversal, limits, path naming, reserved OKF files, and upload concurrency
- `src/app/(dashboard)/admin/_features/knowledge/*.test.*` for the shared admin UI and website grouping utilities

When changing knowledge ingestion, run the Convex knowledge tests and any UI tests for `KnowledgeManager`. When changing supported file types or size limits, update upload policy tests and user docs together.

## Maintenance Notes

Keep embedding model resolution configuration-driven. Do not hardcode runtime model literals in knowledge ingestion paths. Preserve SSRF checks for website ingestion and the explicit tenant scope contract in the shared hybrid retrieval spine. Knowledge is customer data, so upload, retrieval, deletion, repair, and inspection must stay scope-aware.

## Reserved Upload Gateway

`knowledge.generateUploadUrl` is an admin mutation that delegates to `uploadReservations.issueUpload` with purpose `knowledge`. It requires `CONVEX_SITE_URL` and returns a permission URL under `/api/uploads`. The raw pass is a sixty-four-character random token; only its SHA-256 digest is stored. `uploadReservations`, `uploadQuotas` and `uploadControl` track ownership, lifecycle and cleanup. Public POST/OPTIONS HTTP handlers are wired in `convex/http.ts`; the upload POST is authorized by the pass, not by trusting a supplied storage ID.

Reservations start `ISSUED` for ten minutes. `begin` verifies token state/expiry, the current user or widget-thread owner, unchanged company and compatible MIME type, then moves to `UPLOADING`. The handler rejects encoded bodies, forwards a byte-counted stream with a two-minute timeout, and keeps the underlying Convex storage URL server-side. `finish` compares actual stored metadata and streamed bytes with maximum and optional exact sizes, then marks the reservation `READY`. `saveDocument` calls `requireOwnedUpload` for the same user/company and knowledge purpose before metadata validation, marking the pass `ATTACHED`. Chat documents require purpose `chat` plus thread ownership and current-workspace checks.

Ingress allowances are reserved before granting the pass, including the maximum bytes even if the browser abandons it. Hourly actor limits are one GiB and one thousand reservations; company/platform scope ten GiB and twenty-five hundred; deployment twenty GiB and five thousand. Day buckets multiply each by four. These are fixed UTC-style timestamp buckets calculated from epoch divisions, not rolling-hour usage. Default metadata omissions reserve the applicable maximum, so small actual uploads can consume a larger allowance. Do not describe quota consumption as only bytes successfully stored.

Cleanup drains expired issued/uploading/ready reservations in bounded reads, deletes attached files only through their owner lifecycle rather than this expiry path, and scans post-enforcement storage for abandoned objects without reservations, preserving recognized provider answer files. The scan persists cursor and a fixed upper bound. These mechanics are specific cleanup contracts, not proof that all legacy or failed-source records expire automatically.

## Current Import Bounds And Failure Behavior

`knowledgeImportPolicy.ts` caps map/queue input at one hundred URLs per request, one hundred queued URLs per hour, and twenty map calls per hour. Provider JSON responses are bounded at five hundred twelve KiB, with a forty-five-second request timeout. The same one-hundred-thousand-character and one-hundred-twenty-eight-chunk limits apply before embedding uploaded, pasted and scraped text. Accepted fifty-MiB transport does not bypass paid-work limits.

The file queue has width three, with transactional pending-file claims and one source per action pass. Browser upload concurrency is four and batch selection remains five hundred. The URL queue uses a different claim. Firecrawl 429 handling requeues and schedules a ten-second wait; despite the source log wording, this branch is a fixed delay, not demonstrated exponential backoff or an unlimited-retry acceptance guarantee. Other failures record a failed document, and ordinary queue progression is scheduled after two seconds.

Embedding resolves stored model configuration and uses the Vertex path. Chunk attempts request the provider retry helper with a maximum of five. Successful vectors are currently accepted only when length is 768. Thrown chunk failures cause ingestion failure; a missing or wrong-length vector does not itself increment the thrown-failure count, so some usable vectors can result in partial stored coverage. Do not infer completeness from ready status alone. Chunks are stored in batches of fifty, replacing existing chunks on the first batch and marking ready at completion. Model and usage metadata are recorded separately from proof of full source extraction.

The reviewed retention helper selects only ready thread documents older than twenty-four hours, capped at one hundred per pass. Failed/processing documents do not satisfy that query. File deletion errors in this helper are caught, while document/chunk cleanup proceeds. A strict erasure promise needs broader implementation review. Individual document deletion also leaves derived Wiki topic knowledge, as described above.

## Review Scope And Related Systems

The explicit retrieval scope union prevents an unfiltered vector-search variant, but callers must still authorize the IDs used to construct company, agent and thread scopes. `searchKnowledgeScope` runs vector and keyword ranks together; keyword/prior lookup failures are best-effort. Query embedding returns no usable vector when dimensions do not match configured dimensions, and provider exceptions need handling at the caller. A ranking helper is not independently an authorization boundary.

This pass inspected ingress, source storage/queues, import bounds, deletion, retention and retrieval helpers, with existing test sources as references. It did not execute ingestion, provider retries or two-company tests. Wiki distillation, review and refresh are linked implementation paths pending the separate Company Wiki review; source readiness alone is not successful Wiki publication. The content Library is a distinct article shelf and is not converted into these document embeddings by this ingestion path.
