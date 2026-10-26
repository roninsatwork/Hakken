---
product: Hakken
documentation_type: End-user guide
feature_area: Company Wiki
audience: end-user
source_repository: roninsatwork/Hakken
source_path: docs/end-user/company-wiki.md
last_reviewed: '2026-10-26T14:25:23+00:00'
reviewed_against: current implementation
status: Current
---
# Company Wiki

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Company Wiki
> **Reviewed:** 26 October 2026, 14:25:23 GMT (Europe/London)
> **Source path:** `docs/end-user/company-wiki.md` · **Status:** Current


Core page, import/review, answer selection and bounded staff maintenance, feedback, exam and reporting paths are reviewed below.

The Company Wiki is the company-specific knowledge space that Hakken writes and keeps current from approved company material and customer interactions. It is separate from ordinary document storage: stored sources remain available as receipts, while the wiki presents maintained pages that people can read, correct, and use for answers.

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
- Source notes for the material made available from imported documents.
- Goal pages for what the company is aiming to achieve.

Each page shows its title, latest update source, rewrite count, content, pinned corrections, source receipts, and history. Page links create the map view and make the wiki navigable like a connected knowledge base rather than a flat file list.

## Importing Knowledge

The Wiki import box accepts:

- a website URL, which is mapped and queued for reading
- one or more files, including folders
- manual text with a title

Imports use the same underlying knowledge upload and website ingestion machinery as the knowledge archive. When imported material becomes ready, Hakken can distil it into wiki pages. The Wiki screen shows reading progress while there are documents left to process.

For sensitive material, tick **Review before it writes**. Hakken then extracts the claims it would teach the wiki, and, while the Reviewer is active, a pending checkpoint waits for an admin decision. **If the Reviewer staff agent is switched off, the implementation clears the review flag and sends the document directly to distillation.** The checkbox alone is therefore not an unconditional approval guarantee. Rejecting a review keeps the source in the library but prevents that material from being taught to the wiki.

## Reviewing And Correcting

People remain in charge of truth. The wiki has three user-facing correction paths:

- Edit the page body when the maintained text needs a direct correction.
- Pin a correction when a fact must survive future machine rewrites.
- Review pending claims before the wiki learns sensitive imported material.

Pinned corrections are displayed separately from the machine-written body and are preserved when Hakken rewrites or tidies a page. Use pinned corrections for facts that must not be smoothed away by later summarisation.

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

Pages can keep receipts identifying documents, calls, older email events, chats or human edits. A receipt type does not establish that every ingestion channel is currently active; Gmail watching is retired. Source notes point back to original knowledge documents, and customer-source receipts can link to call records where available.

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

## Access And Scope

The routes listed here are platform Admin screens. Super admins can manage platform and company Wikis; read-only accounts can inspect platform pages and permitted company-scoped reads, with write controls withheld. Company-admin backend operations are constrained to the active company, but that does not grant company admins access to the entire `/admin` console. The public Knowledge reading room at `/app/knowledge` is a separate article surface, not this operator Wiki editor.

The platform shelf uses an absent company scope; it is not a wildcard over every customer. In answers, company pages take precedence over a platform page with the same key. Platform pages fill gaps, while customer-specific pages require the answering surface to request them explicitly. Anonymous and broad topic answers must not be described as having access to customer pages.

## Reading Progress And Failure Recovery

A file can be successfully stored and embedded without every fact reaching the Wiki. Distillation first claims the source and writes a source note before asking the configured model for topic synthesis. It reads bounded text, currently up to eight thousand characters from the source or a small number of stored chunks. A source note is therefore not a guarantee of a byte-for-byte archive of a large original file. Open the original source when exact wording or later sections matter.

Failures after claim release the claim for catch-up until the document reaches three failed attempts. At that point the source stays claimed instead of spending indefinitely. Consult the Distiller's run history and source status when a filed document produces no useful topic pages. Repeatedly asking the assistant does not repair a permanently exhausted distillation attempt. The Distiller's active switch matters too: standing it down prevents its normal on-ready processing.

Review previews are also bounded. The Reviewer reads at most eight thousand characters, and the UI shows up to six extracted claims. If its model call fails, it can still file a pending review with an empty claim list. Do not approve an unfamiliar or sensitive source solely because a short preview looks harmless. Inspect the original material and the selected scope. A list of pending reviews is bounded at twenty-five; it is not a count of every possible outstanding item.

## Editing, Pins And Removal

Direct edits are trimmed and capped at four thousand characters. Emptying a page body is refused; use an appropriate correction or the explicit deletion action instead. A pinned correction is trimmed to five hundred characters and stored separately from the body. Pins survive machine body rewrites, but they still need accurate wording and scope. The history records earlier content for inspection; it is not a claim that every previous external answer can be retracted.

Some Wiki pages mirror published Knowledge articles and are protected from ordinary page editing, pinning and deletion. Change the owning article through its content workflow instead of trying to repair its Wiki representation directly. Those protected pages can also affect broad clearing operations, so do not promise that one clear command can remove every kind of page.

Page deletion removes the page and a bounded receipt set. Other pages' links are left for tending to repair; revisions and open questions are not universally purged by that operation. Company clearing proceeds in batches of fifty through repeated screen calls, and its remaining value indicates whether another row exists rather than an exact total. It does not delete the imported knowledge archive. Confirm which layer should be removed before using either page deletion or source deletion.

## Using Answers And The Map

Answer selection normally asks a model to choose up to four page keys, then opens the selected pages within a character budget. It tries maintained topic pages first and can make a second pass including source notes when no topic is chosen. Provider failure falls back to word matching. Large Wikis use a shortlist of recent, search-matched and hub pages; the assistant is not reading the entire archive for every question.

The map reads a bounded set and displays at most four hundred layout nodes, so absence from the picture is not proof that a page was deleted. Follow the page list or search when investigating a missing topic. Open-question auto-resolution uses whether the quoted claim still appears in the page; it is not independent proof that a replacement claim is factually correct.

Core page operations, source distillation, review decisions, bounded map/index behavior and answer selection were reviewed first; the detailed sections below extend coverage to staff maintenance, feedback, exams, diary and reports. No import, rewrite, clearing operation, provider request or live acceptance test was performed.

## Staff Maintenance And Its Limits

Wiki staff have specific jobs rather than simply answering a generic prompt. The Distiller starts a reading round, the Linker connects sparsely linked pages, the Tidier repairs links and shortens eligible overgrown pages, the Freshness Checker compares aging pages with retained sources, and the Contradiction Finder raises disagreements for review. The Examiner's scheduled round drafts new checks. Reviewer and Filing Clerk are event-driven: pressing Run explains that there is no on-demand sweep for those roles.

A staff Run can dispatch work across company and platform Wiki scopes rather than only the company currently visible in an administration page. Its immediate completion summary can mean the round was started, while per-scope work is still scheduled. Check the later staff activity and Wiki records before telling a customer that all pages have been processed. A stood-down staff role can prevent its work; an Active label alone does not prove a recent successful visit.

Tending repairs dead links mechanically and considers only a few eligible long pages for model shortening. Source notes, goals, knowledge articles, and mechanical index pages are excluded from shortening. Pinned corrections are supplied as protected context. A failed or unhelpful shortening attempt leaves the page text in place and still records that the page was visited, so another attempt can wait a week. This is not an immediate full-corpus refresh.

The Linker can schedule another pass while it makes useful new connections. It stops when a pass links nothing, allowing genuinely unrelated pages to remain separate rather than inventing relationships. Freshness uses a different rule: document-backed pages become eligible after about three weeks, with only three candidates checked in a scope pass. A checked timestamp can mean the check raised a missing-source question; it does not always mean the page was confirmed correct.

Goals untouched for 45 days can receive a question asking whether the aim still stands. Editing a goal can settle that cycle; dismissing a question is also a recorded decision. Contradiction detection inspects selected product, policy, and issue excerpts and raises bounded candidate pairs. It does not read every page against every other page, and it does not silently decide which disputed claim should replace the other. Use the Open questions screen and original sources to settle disagreements.

## Questions, Exams, And The Diary

When an answer cannot be supported, the Wiki can record the question, normalize repeats, and count demand. A company with its own pages keeps its gap in company scope. A company without its own pages can contribute to the platform knowledge gap instead; platform rows count contributing companies without displaying their names in that list. This is a routed knowledge-improvement mechanism, not a promise that every unsuccessful answer becomes a private company-only record.

A simple greeting filter runs first, and an enabled Decision can later correct whether the text represents a substantive question. Repeated wording can increase demand instead of creating another row. Dismissing or resolving an unanswered question is different from answering a customer directly. Review the saved question for sensitive content before using it in a broader report.

The Examiner can draft up to three new checks from questions already resolved. Those drafts wait for review; they run nothing and activate nothing automatically. Existing fingerprints, including rejected questions, limit repeat proposals. A draft generated from a real question still needs a useful expected answer and an appropriate audience before adoption.

There is also an internal comparison exam that answers a fixed set of questions through both chunk retrieval and Wiki retrieval, then model-grades each answer. This spends model resources and records comparison evidence. It is separate from monthly growth drafting and from a guaranteed production-wide switch. A score matching the older path does not prove every possible customer question is correct.

The Diary is a filtered view of audit activity. It can show page changes, review decisions, and related knowledge work with a short detail and a person/automatic distinction. Because filtering happens after each audit page is read, a sparse or empty displayed page is not proof that the whole remaining audit history contains no Wiki activity. Continue through available pages when investigating a particular event.

## Weekly Reports And Privacy

The weekly Wiki report summarizes new and improved pages, answered/unanswered demand, staff rounds, and items waiting for review. Quiet scopes can produce no report. Company reports go to company administrators through the notification system; platform summaries go to super-admins. A queued or recorded notification is not independently verified email delivery.

Counts use bounded audit, activity, and pending-record reads. The weekly time-saved line assumes seven minutes per answered question and rounds to hours; it is an estimate, not measured staff time or revenue. Personal notes learned are reported as a count while their content remains in the owner's personal layer. Do not turn that count into permission to inspect personal memory contents.

Use a weekly report to choose the next review action, then open actual pages, questions, and receipts. The report is not a complete archive or certification that every page is current. This detailed review used implementation and local test source only. No staff round, paid model exam, import, rewrite, report dispatch, or deletion was run. Live acceptance and external rename cutover remain separate from the code described here.
