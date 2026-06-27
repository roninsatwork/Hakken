# Knowledge Management

Knowledge management is where Sonae operators add, inspect, test, and repair the source material that assistants, agents, widgets, and workflows can use. The current app supports global knowledge, company knowledge, agent knowledge, and chat-thread documents.

## Where To Manage Knowledge

Implemented knowledge surfaces include:

- `/admin/ai/global-knowledge` for super-admin-managed global knowledge.
- `/admin/companies/[id]/knowledge` and `/admin/companies/[id]/ai/knowledge` for company knowledge.
- `/admin/agents/[id]/knowledge` for agent-scoped knowledge.
- assistant thread uploads, which are tied to a specific chat thread.

Global knowledge is only available to super admins. Company admins can manage knowledge for their active company. Agent knowledge remains tenant-scoped when a company admin manages it.

## Source Types

Operators can add knowledge in three main ways:

- File upload for PDF, CSV, Excel, Word, and text documents.
- Manual text for short policy, operating, or reference material.
- Website ingestion by mapping and queueing URLs.

Uploaded knowledge documents are processed into searchable chunks and embeddings. Website documents are queued for scraping and can be retried if ingestion fails.

## Document Status

Knowledge documents move through these practical states:

- `pending`: queued for processing.
- `processing`: ingestion has started.
- `ready`: chunks and embeddings are available.
- `failed`: ingestion could not complete.

The knowledge manager shows document inventory and quality signals so operators can tell whether a knowledge base is ready for release or needs repair.

## Quality And Inspection

The knowledge manager includes quality checks and inspection tools. Operators can inspect document chunks, review ingestion errors, identify stale processing, find ready documents without chunks, and detect embedding model drift. Agent-scoped knowledge also includes coverage guidance based on the agent profile, helping operators identify whether important agent-purpose terms are missing from ready knowledge.

The retrieval test lets admins run a sample query against the scoped knowledge base. Use this before release review to confirm that the expected material can be found and that irrelevant material is not being returned.

## Repair And Deletion

Failed, stale, drifted, or empty ready documents can be repaired individually or in bulk. Website documents can also be deleted as a group under a root website. Normal document deletion removes the document and its chunks from the selected scope.

Use repair before re-uploading the same source. Use deletion when the source is obsolete, belongs to the wrong company, or should no longer influence assistant responses.

## Tenant Boundaries

Knowledge is scoped. A company admin should not be able to see or repair another company's knowledge or global knowledge. Super admins can inspect global and company scopes. Chat-thread documents are readable by the thread owner, super admins, and admins for the thread company.

Treat knowledge uploads as customer data. Confirm the target scope before adding documents, especially when moving between global, company, and agent pages.

## Operating Guidance

Before enabling an agent, widget, or workflow for customer use:

- upload only approved source material
- prefer company or agent scope over global scope for customer-specific content
- wait for documents to reach `ready`
- inspect flagged documents
- run retrieval tests with realistic customer questions
- repair failed or stale ingestion before release
- delete outdated material instead of leaving conflicting instructions in place

Knowledge quality affects answer quality directly. A clean prompt cannot compensate for missing, stale, or incorrectly scoped knowledge.
