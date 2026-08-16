# Company Wiki

The Company Wiki is the company-specific knowledge space that Sonae writes and keeps current from approved company material and customer interactions. It is separate from ordinary document storage: stored sources remain available as receipts, while the wiki presents maintained pages that people can read, correct, and use for answers.

## Where It Lives

Use the Wiki screen from either company AI context:

- `/admin/ai/knowledge` for the platform Wiki that every company can draw on.
- `/admin/ai/knowledge/map` for the platform Wiki map.
- `/admin/companies/[id]/ai/pages` for a selected company's wiki.
- `/admin/companies/[id]/ai/pages/map` for that company's map.

The platform Wiki and company Wikis are deliberately separate. The platform
Wiki is shared product knowledge controlled from the global AI area. A company
Wiki belongs to one company and is managed inside that company's AI section.
Older Knowledge routes remain available as the source archive behind wiki
receipts, but they are not the primary destination for teaching the company
brain.

## What A Page Represents

Wiki pages are written as whole pages, not search fragments. Current page kinds are:

- Customer pages for known customer accounts.
- Product pages for what the company sells or offers.
- Policy pages for how the company works.
- Issue pages for recurring problems, objections, or risks.
- Source notes for imported documents kept substantially intact.

Each page shows its title, latest update source, rewrite count, content, pinned corrections, source receipts, and history. Page links create the map view and make the wiki navigable like a connected knowledge base rather than a flat file list.

## Importing Knowledge

The Wiki import box accepts:

- a website URL, which is mapped and queued for reading
- one or more files, including folders
- manual text with a title

Imports use the same underlying knowledge upload and website ingestion machinery as the knowledge archive. When imported material becomes ready, Sonae can distil it into wiki pages. The Wiki screen shows reading progress while there are documents left to process.

For sensitive material, tick **Review before it writes**. Sonae then extracts the claims it would teach the wiki, but the wiki learns nothing until an admin approves the review. Rejecting a review keeps the source in the library but prevents that material from being taught to the wiki.

## Reviewing And Correcting

People remain in charge of truth. The wiki has three user-facing correction paths:

- Edit the page body when the maintained text needs a direct correction.
- Pin a correction when a fact must survive future machine rewrites.
- Review pending claims before the wiki learns sensitive imported material.

Pinned corrections are displayed separately from the machine-written body and are preserved when Sonae rewrites or tidies a page. Use pinned corrections for facts that must not be smoothed away by later summarisation.

## Open Questions

The wiki can raise open questions when staff agents find:

- two pages making conflicting claims
- a page claim that no longer appears supported by its source material

The question panel shows the conflicting or unsupported claims and links back to the affected pages where possible. Resolve the underlying issue by editing or pinning the right page, or dismiss the question when it is not important. The system can also auto-resolve a question when later page edits remove the flagged claim.

## The Map

The map draws wiki pages and their links. It is designed for inspection:

- Drag to pan.
- Use the mouse wheel or buttons to zoom.
- Hover a page to highlight its neighbourhood.
- Click a page to open it.

Zooming reveals detail rather than making labels and dots grow without limit. The map caps the rendered set to keep the screen usable on larger wikis.

## Source Receipts And History

Each page keeps receipts for the documents, calls, emails, chats, or human edits that taught it. Source notes point back to original knowledge documents, and customer-source receipts can link to call records where available.

The page history records previous content before rewrites. Use history and source receipts together when answering why a page changed, which conversation or document taught it, or whether the current wording is supported.

## Practical Use

Before relying on the wiki for customer-facing answers:

- confirm the wiki belongs to the right company
- use the platform Wiki only for shared platform knowledge
- wait for import progress to finish
- approve or reject pending reviews
- inspect open questions
- pin corrections for sensitive or high-value facts
- open receipts when a claim needs evidence

The wiki should be treated as a maintained company memory. It is useful because it compounds what the company learns, but it still needs human review when facts are disputed, sensitive, or commercially important.
