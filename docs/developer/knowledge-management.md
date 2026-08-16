# Knowledge Management

Knowledge management is implemented by `convex/knowledge.ts`, `convex/knowledgeActions.ts`, `convex/knowledgeService.ts`, `convex/knowledgeRetrieval.ts`, shared upload policy helpers, the reusable `KnowledgeManager` admin feature, and assistant thread upload flows. It supports global, company, agent, and thread-scoped documents.

Company knowledge now has a separate page-based layer documented in [Company Wiki](./company-wiki.md). Treat this guide as the source archive, ingestion, chunking, repair, and retrieval guide; treat the Wiki guide as the current company-facing pages, map, receipts, review, staff-agent, and whole-page answer-context guide.

## Route Map

- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx` renders global knowledge for super admins.
- `src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx` renders company knowledge source documents.
- `src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx` re-exports the company knowledge page for archived source access behind Wiki receipts.
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx` renders agent knowledge.
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` is the shared admin knowledge UI.
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

Bulk uploads accept at most 500 files per gesture. `knowledgeUploadUtils.ts` walks nested folder entries, retains relative paths after dropping the common top-level folder, skips `index.md` and `log.md` only when they are part of a folder bundle, and uploads at concurrency four. `saveDocument` can defer ingestion so the browser can finish creating pending records first. `startPendingFileIngestion` then starts the fixed-width backend queue; `processKnowledgeFileQueue` claims one pending non-URL document transactionally, ingests it, records failure on that document without blocking later files, and reschedules until the queue is empty. Keep the file queue distinct from `processWebsiteQueue`; URL documents must never be claimed as uploaded files or vice versa.

The Company Wiki distiller can consume ready company knowledge documents after ingestion. Documents marked with `wikiReviewRequested` wait for the Wiki review flow before they can be distilled, and `wikiDistilledAt` records that the wiki has already claimed a source. Keep these fields coordinated with [Company Wiki](./company-wiki.md) when changing ingestion completion hooks.

Website ingestion uses Firecrawl and the shared URL safety helper in `convex/utils/security.ts`:

- `mapWebsite` requires an action-admin identity, validates the URL with `validateSafeUrl`, and calls Firecrawl map with a cap of 500 links.
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

`testRetrieval` remains an admin inspection helper rather than a full simulation of every runtime prompt path. Keep its user-facing explanation honest when production ranking changes.

## Repair And Cleanup

`retryDocumentIngestion` requeues failed or stale documents and clears old chunks when appropriate. `repairFlaggedDocuments` processes a bounded batch of flagged scoped documents. `deleteWebsiteBulk` deletes URL documents under a root website only within the authorized scope. `deleteDocument` removes a document and its chunks.

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
