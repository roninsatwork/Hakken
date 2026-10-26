---
product: Hakken
documentation_type: user guide
feature_area: knowledge sources and retrieval
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/knowledge-management.md
last_reviewed: '2026-10-26T09:54:27+00:00'
reviewed_against: current implementation
status: Current
---
# Knowledge Management

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Knowledge sources and retrieval
> **Reviewed:** 26 October 2026, 09:54:27 GMT (Europe/London)
> **Source path:** `docs/end-user/knowledge-management.md` · **Status:** Current

Knowledge management is where Hakken operators add, inspect, test, and repair the source material that assistants, agents, widgets, and workflows can use. The current app supports global knowledge, company knowledge, agent knowledge, and chat-thread documents.

For company-level maintained pages, maps, review checkpoints, source receipts, and open questions, use [Company Wiki](./company-wiki.md). The knowledge screens remain the source archive and repair layer; the Wiki is the current reading and company-memory layer.

## Where To Manage Knowledge

Implemented knowledge surfaces include:

- `/admin/ai/knowledge` for the platform Wiki and its import/source controls. The old `/admin/ai/global-knowledge` address redirects here.
- `/admin/companies/[id]/ai/knowledge` for company knowledge.
- `/admin/agents/[id]/knowledge` for agent-scoped knowledge.
- assistant thread uploads, which are tied to a specific chat thread.

Global knowledge is only available to super admins. Company admins can manage knowledge for their active company. Agent knowledge remains tenant-scoped when a company admin manages it.

## Source Types

Operators can add knowledge in three main ways:

- File or folder upload for PDF, CSV, Word, Markdown, and text documents. Excel files currently pass the shared upload validation policy, but persisted knowledge ingestion does not yet have dedicated spreadsheet extraction, so use CSV for reliable tabular knowledge until the knowledge ingestion parser is extended.
- Manual text for short policy, operating, or reference material.
- Website ingestion by mapping and queueing URLs.

Uploaded knowledge documents are processed into searchable chunks and embeddings. Website documents are queued for scraping and can be retried if ingestion fails.

File uploads use the same document size policy as assistant attachments and are accepted up to the configured 50 MB document limit. The browser checks type and size before upload, and the backend validates the stored file again before it becomes a knowledge document. For reliable persisted knowledge extraction, prefer PDF, CSV, Word `.docx`, and plain text.

The knowledge manager also accepts multiple files or a whole folder in one drop, including Open Knowledge Format (OKF) Markdown bundles. A batch is capped at 500 files and shows per-file upload progress plus retry controls for failures. Folder paths are retained in document titles so similarly named files remain distinguishable. Within a folder upload, reserved OKF `index.md` and `log.md` files are skipped because they contain navigation and update history rather than source facts; a file with either name can still be uploaded deliberately on its own.

Markdown ingestion removes YAML frontmatter from searchable content and uses a frontmatter `title` when present. Other frontmatter fields are not imported as independent metadata. Review the resulting document title and chunks after uploading an unfamiliar bundle.

Website ingestion is a two-step flow. First map a root URL to discover candidate pages, then queue the selected URLs for ingestion. The mapper applies URL safety checks and caps a map request at 100 links. Queued website pages behave like other documents: they can become `ready`, fail, be retried, or be deleted in bulk under the same website root.

## Document Status

Knowledge documents move through these practical states:

- `pending`: queued for processing.
- `processing`: ingestion has started.
- `ready`: chunks and embeddings are available.
- `failed`: ingestion could not complete.

The knowledge manager shows document inventory and quality signals so operators can tell whether a knowledge base is ready for release or needs repair.

## Quality And Inspection

The knowledge manager includes quality checks and inspection tools. Operators can inspect document chunks, review ingestion errors, identify stale processing, find ready documents without chunks, and detect embedding model drift. Agent-scoped knowledge also includes coverage guidance based on the agent profile, helping operators identify whether important agent-purpose terms are missing from ready knowledge.

Embedding drift means a ready document was embedded with different model metadata than the active embedding default for that scope. Treat drift as a release-review warning: repair the document before relying on consistent retrieval quality.

Inspection previews are untrusted reference text. They are useful for confirming chunk quality, ingestion history, and source coverage, but they should not be copied into system prompts without review.

The retrieval test lets admins run a sample query against the scoped knowledge base. Runtime knowledge retrieval combines semantic vector matches with exact keyword matches, then fuses the two rankings within the requested company, agent, thread, or global scope. Rated answers can add a small, bounded ranking preference when the platform self-improvement switch is enabled, but relevance remains the dominant signal. Use retrieval testing before release review to confirm that expected material can be found and irrelevant material is not being returned. A passing retrieval test is evidence that the source can be found; it is not a full agent answer-quality test.

## Repair And Deletion

Failed, stale, drifted, or empty ready documents can be repaired individually or in bulk. Website documents can also be deleted as a group under a root website. Normal document deletion removes the source record and stored file and schedules chunk cleanup in batches. For non-thread sources, it also removes the source-note page and up to 500 associated receipts. Topic pages that learned from the source remain with their provenance trail; deletion is not a promise that every derived fact disappears immediately.

Use repair before re-uploading the same source. Use deletion when the source is obsolete, belongs to the wrong company, or should no longer influence assistant responses.

## Tenant Boundaries

Knowledge is scoped. A company admin should not be able to see or repair another company's knowledge or global knowledge. Super admins can inspect global and company scopes. Chat-thread documents are readable by the thread owner, super admins, and admins for the thread company.

Thread-scoped documents are temporary assistant context. They belong to a chat thread rather than the admin knowledge archive. The reviewed garbage collector selects ready thread documents older than twenty-four hours, up to one hundred per pass, deletes their file/document and schedules chunk cleanup. This is not a universal expiry guarantee for failed or processing uploads.

Treat knowledge uploads as customer data. Confirm the target scope before adding documents, especially when moving between global, company, and agent pages.

## Operating Guidance

Before enabling an agent, widget, or workflow for customer use:

- upload only approved source material
- prefer company or agent scope over global scope for customer-specific content
- wait for documents to reach `ready`
- inspect flagged documents
- run retrieval tests with realistic customer questions
- repair failed or stale ingestion before release
- repair embedding-drifted documents after changing embedding defaults
- delete outdated material instead of leaving conflicting instructions in place

Knowledge quality affects answer quality directly. A clean prompt cannot compensate for missing, stale, or incorrectly scoped knowledge.

## Upload Passes And Processing Limits

Uploads now use an authenticated reservation and a counted gateway. The browser receives a short-lived permission URL rather than a reusable unrestricted storage upload address. A pass normally expires after ten minutes and can begin only once. The gateway checks the current owner, workspace, purpose, declared type and size, and enforces a two-minute streaming timeout. A transfer may therefore need to be uploaded again if the connection is interrupted or the active workspace changes. A storage identifier copied from another user or workspace cannot be attached as your knowledge document.

Uploading bytes and creating a usable knowledge source are separate stages. A ready, unattached upload is normally eligible for attachment for twenty-four hours; abandoned reservations and files have bounded cleanup. Once attached, document-specific retention and deletion apply. Do not treat the abandoned-upload cleanup as a twenty-four-hour retention policy for all knowledge documents.

The fifty-megabyte file limit is a transport allowance, not a guarantee that all of a large document can be embedded. Current ingestion applies a one-hundred-thousand-character source limit and at most one hundred twenty-eight chunks. Large extracted text can fail even when its original file was accepted. Split a genuinely large source into coherent documents, preserving meaningful titles and source context. Avoid repeatedly uploading the same oversized file while assuming the error is a temporary provider outage.

Website imports have separate cost limits. Mapping returns at most one hundred links, and the current policy limits mapping to twenty requests per hour and queued URLs to one hundred per hour for its applicable reservation scope. The mapper and scraper also bound provider response size and request duration. A website import does not promise a full crawl of every page. Choose the relevant pages deliberately and inspect the resulting sources rather than treating a mapped root as complete coverage.

Files in a bulk drop upload with limited browser concurrency, then a smaller backend queue drains pending files. Failed extraction is recorded on that document so the rest of the queue can continue. URL documents use a separate queue; a provider rate refusal puts the URL back into pending and schedules a later attempt. A queue that is pending is not necessarily broken, but no source should be relied on until inspection confirms the expected content and status.

## Source Archive Versus Learned Pages

Ready company sources can teach the Wiki automatically. Sources requiring review first prepare claims for a person; global sources request review by default in the reviewed save path. A successful embedding does not prove the Wiki review was approved or that every resulting topic is current. Thread attachments remain conversation material rather than a request to teach the company brain. Agent-scoped configuration has its own context and should be checked before assuming it contributes to a global or company Wiki.

Before deleting a source, inspect what depends on it. The source note is removed, while learned topic pages retain their own content and receipt history. Use the Wiki's maintenance and review process to correct those pages if the underlying facts changed. Re-uploading or repairing can refresh source notes, but neither operation is a blanket rollback of every answer previously generated from the material.

This refresh was checked against knowledge save/repair/delete handlers, upload reservations and HTTP streaming, the file and URL queues, import cost policy and hybrid retrieval. No file was uploaded, website scraped, embedding requested or source deleted. A source-level review cannot establish that a deployed provider configuration, queue or retention sweep has run successfully.
