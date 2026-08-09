# Knowledge markdown and bulk upload — accept `.md` and OKF bundles, many files at a time

**Started 2026-08-09.** The three knowledge screens — global, company and agent —
accept PDF, DOCX, TXT, CSV and Excel, one file per upload. Markdown is refused
at the door, and Google Cloud's Open Knowledge Format (OKF), which is a
directory of markdown files, cannot be loaded at all.

This plan opens both gates to markdown, adds multi-file and folder upload, and
puts bulk ingestion behind a queue so a large drop does not melt the embedding
API. It owns `src/lib/constants/uploads.ts`,
`convex/utils/uploadPolicy.ts`, the upload half of
`src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`, and the
file-ingestion queue in `convex/knowledge.ts` / `convex/knowledgeActions.ts`.

Chat attachments (`ChatInput.tsx`, `AssistantComposer.tsx`,
`saveChatDocument`) are deliberately **out of scope**. Markdown is being opened
up for the knowledge base only.

---

## What OKF actually is

Confirmed against the published spec (v0.2,
`GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md`):

- A bundle is a **directory tree of `.md` files**. Nesting is allowed at any
  depth.
- Every file carries **YAML frontmatter**. Exactly one field is required:
  `type`. Recommended: `title`, `description`, `resource`, `tags`.
- Trust and lifecycle fields exist: `generated`, `verified`, `status`
  (`draft | stable | deprecated`), `stale_after`, `sources`.
- `index.md` and `log.md` are **reserved filenames** — a directory listing and
  an update history respectively. They may appear at any level.
- The root `index.md` may declare `okf_version: "0.2"`.
- Files cross-link with ordinary markdown links, bundle-absolute
  (`/path/to/concept.md`) or relative (`./other.md`).

The practical consequence: **supporting OKF is supporting markdown, plus
folders, plus reading the frontmatter.** There is no new parser, no binary
format, no SDK.

---

## What is actually wrong

### 1. Two separate gates both refuse markdown

`src/lib/constants/uploads.ts` gates the browser. `KNOWLEDGE_DOCUMENT_CONTENT_TYPES`
has no markdown entry, and `isAllowedByExtension` lists `.csv .txt .docx .pdf
.xls .xlsx` only. The file input at `KnowledgeManager.tsx:947` carries
`accept=".pdf,.docx,.txt,.csv,.xls,.xlsx"`, so the OS picker greys `.md` files
out before the validator is ever reached.

`convex/utils/uploadPolicy.ts` gates the server. `validateKnowledgeDocumentMetadata`
delegates to `validateUploadMetadata`, which tests the stored file's recorded
content type against `isChatDocumentContentType` — reading
`CHAT_DOCUMENT_CONTENT_TYPES`. Knowledge uploads are therefore validated
against the **chat** list. To widen knowledge without widening chat, that
shared constant must be split.

Note the duplication: `CHAT_DOCUMENT_CONTENT_TYPES` is declared identically in
both files, because Convex functions cannot import from `src/`. The two lists
must be changed together and a test must assert they agree.

### 2. Browsers do not reliably label `.md` files

`processFile` uploads with `headers: { "Content-Type": file.type }`. For `.md`,
`file.type` is frequently the empty string depending on browser and OS
registry. Convex storage then records an empty content type, and
`validateKnowledgeDocumentMetadata` throws "Invalid file type" on a perfectly
valid file, with nothing on screen explaining why.

Allowing `text/markdown` server-side is not enough on its own. The client must
resolve the content type from the extension before it uploads.

### 3. The uploader is hard-wired to one file

`processFile(file: File)` takes a single `File`. `handleChange` reads
`event.target.files[0]`; `handleDrop` reads `event.dataTransfer.files[0]`. The
input has no `multiple`, no `webkitdirectory`, and the drop handler never looks
at `DataTransferItem.webkitGetAsEntry`, so a dropped folder is silently ignored.
A single `isUploading` boolean drives the whole modal, so there is nowhere to
show per-file state.

### 4. Every upload starts its own ingestion job immediately

`saveDocument` (`convex/knowledge.ts:852`) inserts with status `"processing"`
and calls `ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, …)`
unconditionally. Two hundred files means two hundred concurrent actions, each
looping `embedVertexContentWithRetry` over its chunks.

The failure mode is not graceful. `embedAndStoreDoc` throws when
`failedChunkCount > 0` — **any** chunk that exhausts its five retries fails the
whole document. Under rate limiting a bulk drop produces a screen of failures
with no indication that the cause was congestion rather than bad files.

The app already has the right pattern for this and does not use it here:
`processWebsiteQueue` drains pending URL documents one at a time, backs off on
HTTP 429, and reschedules itself.

### 5. The website queue will start eating file documents

`getNextPendingUrlInternal` queries the `by_status` index for the first
`"pending"` document **with no format filter**:

```ts
return await ctx.db
  .query("knowledgeDocuments")
  .withIndex("by_status", (q) => q.eq("status", "pending"))
  .order("asc")
  .first();
```

Today no file document is ever `"pending"` — `saveDocument` writes
`"processing"`, and `requeueKnowledgeDocument` only writes `"pending"` for
`format === "url"`. So the missing filter is harmless.

The moment this plan introduces pending **file** documents, the website queue
will claim them, mark them processing, and POST `sourceUrl: undefined` to
Firecrawl. This is a latent bug that Phase 2 activates, and it must be fixed in
the same phase, with a regression test.

### 6. Frontmatter would be embedded as noise

`ingestDocument` falls through to `buffer.toString('utf8')` for anything that
is not PDF or DOCX, so markdown ingests as-is today — including its YAML block.
`chunkKnowledgeText` then flattens it (`text.replace(/\s+/g, " ")`), so the
first chunk of every OKF concept begins with a run of collapsed YAML keys
competing with the actual prose for embedding weight.

The document title is also wrong for bundles. `saveDocument` is called with
`title: file.name`, so a list of OKF concepts reads `index.md`, `index.md`,
`revenue.md` rather than the `title` each file declares.

---

## What changes, in what order

### Phase 1 — accept markdown

1. `convex/utils/uploadPolicy.ts`: add
   `KNOWLEDGE_DOCUMENT_CONTENT_TYPES = [...CHAT_DOCUMENT_CONTENT_TYPES,
   "text/markdown", "text/x-markdown"]` and an `isKnowledgeDocumentContentType`
   predicate. Give `validateUploadMetadata` an explicit `documentContentTypes`
   option so `validateKnowledgeDocumentMetadata` passes the wider list and
   `validateChatAttachmentMetadata` keeps the narrow one.
2. `src/lib/constants/uploads.ts`: mirror the same two entries into
   `KNOWLEDGE_DOCUMENT_CONTENT_TYPES`, and add `.md` / `.markdown` to
   `isAllowedByExtension` for the `knowledgeDocument` policy key only.
3. Add `resolveUploadContentType(file: File): string` to
   `src/lib/constants/uploads.ts`: return `file.type` when non-empty, otherwise
   map the extension (`.md`/`.markdown` → `text/markdown`, `.txt` →
   `text/plain`, `.csv` → `text/csv`). `processFile` uses it for both the
   `Content-Type` header and the `format` argument to `saveDocument`.
4. Update the `accept` attribute at `KnowledgeManager.tsx:947` to include
   `.md,.markdown`, and the helper line beneath it that currently reads
   "Supports .PDF, .DOCX, .TXT, and .CSV format."
5. Update the two `rejectedTypeMessage` strings for the knowledge policy so a
   refusal names markdown.

**Acceptance:** a single `.md` file uploads on the global, company and agent
screens and reaches status `ready`, in a browser that reports an empty
`file.type`. Chat attachment upload still refuses `.md`.

### Phase 2 — bulk and folder upload

6. Fix the pre-existing defect first: add `.filter((doc) => doc.format === "url")`
   — or a dedicated `by_status_format` index — to `getNextPendingUrlInternal`,
   with a test that a pending non-URL document is not returned.
7. `convex/knowledge.ts`: give `saveDocument` an optional
   `deferIngestion: v.optional(v.boolean())`. When true, insert with status
   `"pending"` and **do not** schedule `ingestDocument`. Audit logging is
   unchanged.
8. Add `internal.knowledge.getNextPendingFileInternal` (pending, `format !== "url"`,
   oldest first) and `internal.knowledgeActions.processKnowledgeFileQueue`,
   modelled on `processWebsiteQueue`: claim one document, mark it processing,
   ingest it, reschedule itself. Drain width **3**, achieved by three
   independent self-rescheduling chains started when a batch is saved —
   enough to keep throughput reasonable, low enough to stay inside the Vertex
   embedding quota that `embedVertexContentWithRetry` already backs off
   against.
9. `KnowledgeManager.tsx`: replace `processFile` with `processFiles(files: File[])`.
   Validate each file, upload at most four concurrently, call `saveDocument`
   with `deferIngestion: true` for every file in a multi-file batch, then kick
   the queue once. Cap a single batch at **500 files** with a plain message
   when exceeded.
10. Three ways in: `multiple` on the existing input; a second "Choose folder"
    button using `webkitdirectory`; and a drop handler that walks
    `DataTransferItem.webkitGetAsEntry()` recursively so a dragged folder is
    accepted at any depth.
11. Replace the single `isUploading` boolean with a per-file list — name,
    waiting / uploading / queued / failed, and the reason on failure. Add a
    "Retry failed" action reusing the existing `handleRetryDocument` path.
12. When files arrive from a folder, set `title` to the **path relative to the
    dropped folder** (`finance/revenue.md`), not the bare filename, so nested
    bundles stay readable and two `index.md` files do not collide in the list.

**Acceptance:** a 200-file folder drops in one gesture, every file reaches
`ready` without a rate-limit failure, the list shows live per-file progress,
and the website queue is untouched throughout.

### Phase 3 — read OKF frontmatter

13. Add `parseOkfMarkdown(rawText)` to `convex/utils/knowledgeActionsService.ts`,
    returning `{ frontmatter, body }`. Parse only a leading `---` fenced YAML
    block; tolerate unknown keys per the spec; on malformed YAML return the
    original text untouched rather than failing the document.
14. In `ingestDocument`, when `doc.format` is a markdown type, strip the
    frontmatter and prepend a single readable lead line built from `title`,
    `type` and `description` before chunking, so that meaning survives into the
    embeddings while the YAML syntax does not.
15. Add an internal mutation to patch `knowledgeDocuments.title` during
    ingestion when frontmatter carries a `title`, keeping the uploaded path as
    a fallback.
16. Skip reserved files — `index.md` and `log.md` at any level — when a folder
    is uploaded. They are listings and changelogs; embedding them adds link
    noise and no retrievable fact. Report the count in the upload summary
    ("12 bundle index files skipped") so the behaviour is visible rather than
    silent.

**Acceptance:** an OKF bundle lists by declared title rather than filename, no
chunk contains raw YAML keys, a malformed frontmatter block still ingests, and
the skipped-file count is shown.

---

## Deliberately not in this plan

**A markdown-aware chunker.** `chunkKnowledgeText` collapses all whitespace and
splits on character count, which discards the heading structure that is the
main reason markdown suits retrieval. Splitting OKF concepts on their headings
would measurably improve retrieval quality — but it changes chunking for every
existing document in every workspace and would require re-embedding to apply
evenly. It is recorded here as a known limitation and a recommended follow-up,
not as work this plan authorises.

**Chat attachment markdown.** Out of scope, as stated above.

**Zip upload.** Folder upload covers the OKF case natively; a server-side
unzip is more moving parts for the same outcome.

---

## Cost note

Every ingested file is chunked at roughly 1,000 characters with 200 characters
of overlap, and each chunk is a paid Vertex embedding call. A bulk load of
several hundred markdown files is not expensive, but it is not free, and it is
metered per chunk rather than per file.

**Load one small batch first and read the actual cost before pushing a full
library through.** No bulk run should be started on Anthony's behalf without
asking first.

---

## Open questions

Recorded as assumptions so work can start; correct them and the plan adjusts.

1. **Volume and shape.** Assumed up to 500 files per batch and arbitrary
   folder depth. If the real library is thousands of files, the batch cap and
   the drain width both need revisiting.
2. **Which scope first.** Assumed build and test against **global** knowledge
   first, then company, then agent — all three share `KnowledgeManager`, so
   the capability lands everywhere at once regardless, but the test order
   follows that sequence.

---

## Status — all three phases built 2026-08-09

Delivered as written, with two additions found while checking the real screens:

- The empty-state copy on all three knowledge pages still advertised "PDF or
  DOCX" and now names Markdown and OKF folders.
- `KNOWLEDGE_FILE_QUEUE_WIDTH` chains are started by a new admin mutation,
  `startKnowledgeFileQueue`, called once per batch rather than per file.

Verified against the real app (super-admin, local test auth, real Convex dev
deployment): a three-file batch uploaded with **no content type at all** on the
files — the browser's usual behaviour for `.md` — was accepted, parked as
pending, drained by the file queue, listed as format `MARKDOWN`, retitled from
frontmatter ("Quarterly Revenue", "Gross Margin" rather than the filenames),
and the bundle's `index.md` was skipped with the count shown. Folder-relative
titles rendered as `finance/quarterly-revenue.md`. The upload dialog, folder
picker and both buttons render on global, company and agent screens.

**Ingestion could not be verified to `ready` on this deployment, for an
unrelated reason.** Every document fails at the embedding step with
`Configured embedding model does not support the embedding use case`
(`convex/aiModels.ts:972`). A plain-text document created through the Text tab
— which touches none of this plan's code — fails identically, so this is a
model-defaults gap in the dev deployment, not a regression here. The embedding
default needs pointing at a model that supports the embedding use case before
any real bulk load is attempted.

## Tests

- `src/lib/constants/uploads.test.ts` — `.md` accepted for `knowledgeDocument`
  and refused for `chatDocument`; empty `file.type` resolved by extension;
  `resolveUploadContentType` mapping.
- New assertion that `CHAT_DOCUMENT_CONTENT_TYPES` in
  `src/lib/constants/uploads.ts` and `convex/utils/uploadPolicy.ts` are
  identical, so the duplicated lists cannot drift.
- `convex/knowledge.test.ts` — `deferIngestion` writes `"pending"` and
  schedules nothing; `getNextPendingUrlInternal` never returns a file
  document; `getNextPendingFileInternal` never returns a URL document.
- `convex/knowledgeActionsService.test.ts` — `parseOkfMarkdown` on a valid
  block, a malformed block, no block, and a `---` inside the body.
- `KnowledgeManager.test.tsx` — multi-file selection, per-file failure display,
  folder path titling, reserved-file skipping, batch cap message.
