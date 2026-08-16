# The Wiki Replaces Knowledge

Status: **Delivered 2026-08-15**, same day, on Anthony's "continue all
phases" while away. Stage one proven on the Ronins store (149 documents →
29 new pages + 101 improvements). Stage two's exam sat three times, every
sitting in the audit trail (`WIKI_EXAM_RUN`): 14–16 against the old path's
16, then 16–14 blocked by a contradiction between exam questions 16 and 19
(fixed in the exam, not the student), then **16–15 with no discipline
regression — gate passed**. Stage three: every door answers from the wiki
(the `answersFromWiki` switch, default on, per-company escape hatch), the
company menu offers Wiki where Knowledge stood, and the twenty questions
live on as permanent AI Checks. Honest bounds: the chunk engine still
serves global and thread scopes (never promised away), the old Knowledge
routes stay reachable as the archive behind page receipts, and judge-graded
scores wobble ±1–2 between sittings — the standing checks are the guard
against rot, not any single sitting.
Decisions 1 and 2 were taken on the recommendations he did not object to;
decision 3's questions await his correction and re-seed via
`wikiExamService.ts`.
Owner: Anthony

Screens: **https://claude.ai/code/artifact/db29f745-6d4a-4ff8-b87b-e17333d2bb72**
— eight screens, drawn in Sonae's own visual language. The designs are the
specification; this document is the engineering behind them. Where the two
disagree, the designs win and this document is wrong.

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Anthony's words, 2026-08-15: *"I am asking for the LLM wiki that Andrej
Karpathy pioneered and am looking to implement this in Sonae — it will replace
the existing knowledge import and storage."*

So: **importing knowledge and writing the wiki become one act.** You add a
website, a file or some text on the Wiki screen, and what comes back is
pages — whole, plain, linked, correctable — not a document count and a
fragment count. Asking Sonae something means it opens the pages it needs and
reads them whole. Conversations keep sharpening those pages (built
2026-08-14), the nightly gardener keeps them short (built 2026-08-14), and a
staff correction outranks the machine forever (built 2026-08-14).

This supersedes one boundary in
[self-improving-wiki-plan.md](self-improving-wiki-plan.md), which said the
document library keeps its chunked search and the wiki sits above it. That
was the right call for a first slice and is the wrong call for the product:
it produced exactly the split Anthony rejected on the evening of 2026-08-14 —
knowledge in one place, the wiki in another, and no way to get the one into
the other without a second import. The rest of that plan stands and is
delivered.

## Why the previous attempt was stopped

On the night of 2026-08-14 a "train the wiki from knowledge" button was
half-built and deleted at Anthony's instruction: *"i do not want to import
one set of docs then only to run another import."* He was right, and the
fault was in the design, not the code. A product whose memory is a wiki has
one import, and importing *is* how the wiki learns. A separate training run
is a bolt-on that admits the two systems never became one.

Nothing from that attempt survives in the tree; `git status` was clean at
commit `edd2ef3f7` before this plan was written.

## What is actually true today (verified 2026-08-15)

**Knowledge is documents plus fragments, searched fresh per question.**
Documents live in `knowledgeDocuments` and their fragments in
`knowledgeChunks` (`convex/schema.ts`), each fragment carrying a 768-number
embedding and a keyword index — the hybrid pair at the `by_embedding` and
`search_text` indexes. On the Ronins workspace that is 149 documents and
1,610 fragments.

**Ingestion has three doors, all in `convex/knowledgeActions.ts`:**
`ingestDocument` (a file or pasted text), `mapWebsite` + `processWebsiteQueue`
(a whole site, page by page), and the file queue. All three end at the same
landing, `knowledge.ts`'s chunk writer, which marks a document `ready`.

**Retrieval has one shape and six callers.** `searchKnowledgeScope` and
`rankAssistantKnowledgeMatches` (`convex/knowledgeRetrievalService.ts`) are
used by `convex/ai.ts` (typed chat and the spoken/voice door),
`convex/agentRuntime.ts`, `convex/aiPromptAssembly.ts`,
`convex/knowledgeRetrieval.ts`, `convex/salesReportActions.ts` and
`convex/swarmActions.ts`. The phone and the mailbox reach it through
`ai.searchKnowledgeForVoiceInternal` (`convex/voiceRelay.ts`,
`convex/gmailWatcher.ts`). Every one of those is a door this plan must serve
before the old path can retire.

**The wiki exists and works.** `wikiPages` and `wikiPageRevisions`
(`convex/schema.ts`), the rewrite loop (`convex/wikiActions.ts`), the tending
sweep (`convex/wikiTendingActions.ts`), the reading doors
(`convex/wikiPages.ts`) and the screens at `/admin/ai/knowledge` for the
platform Wiki and `/admin/companies/[id]/ai/pages` for company Wikis. What it
has never done is learn from a document.

**The exam machinery exists.** `companyEvalCases` and `companyEvalRuns`
(`convex/schema.ts`) already run real questions against a company's AI and
grade the answers — the AI Checks work of 2026-07-26. This plan uses it as
the switch-over gate rather than inventing a second one.

**Two screens will fold away:** `/admin/ai/knowledge` and
`/admin/companies/[id]/ai/knowledge` (with its `[documentId]` detail).

## The screens

Numbered as in the designs.

1. **The Wiki screen** — the import box (Website / File / Text) sits at the
   top of the Wiki screen; the pages sit below it. One place, one flow. A new
   column counts how many original documents taught each page.
2. **While it reads** — honest progress for a long import: pages read, wiki
   pages *written*, wiki pages *improved*, time left, and the page being
   written right now. Two numbers, not one, because the tenth page about the
   same subject must sharpen a page rather than make a tenth copy.
3. **A page** — pinned corrections, the tended body, **where this came from**
   (the documents and conversations that taught it, each openable), and the
   walkable history.
4. **The Map** — about thirty linked pages instead of 148 documents. Dot size
   follows how many pages connect to it.
5. **Asking it something** — the answer, then the pages it came from, named.
6. **What goes and what stays** — the retirement list.
7. **Three decisions** — below.
8. **How it lands** — the three stages below.

## Decisions still open

These are Anthony's, and the build does not start without them.

1. **When a tended page and an original document disagree, which wins?**
   Recommended: **the page**. A phone call teaches this week's opening hours
   while the website still shows last year's; the living page is the truth
   and staff can pin over it. The alternative means Sonae can never know
   anything newer than the website.
2. **How do we switch over?** Recommended: **prove it on Ask Sonae first,
   then switch phone, email, widget and reception together** on a chosen day,
   so the product is never long half-and-half.
3. **What proves it is good enough?** Recommended: **a written exam** — about
   twenty real questions with the answers Anthony would accept, run against
   both the old path and the wiki, with the wiki required to match or beat
   the old score before anything moves. **This needs Anthony's questions**;
   nobody else can write them.

## The phases

### Stage one — importing writes the wiki (≈4 days)

Screens 1 and 2. Nothing about answering changes; today's retrieval keeps
serving every door exactly as it does now, so this stage cannot break the
live product.

- A distiller: one document in, topic pages out — the same
  `applyRewriteInternal` landing every other rewrite uses, so revisions, the
  audit trail and the untouchable pinned layer hold here for free.
- Sources recorded per page: which documents and conversations taught it,
  kept as the receipts behind screen 3.
- Every ingestion door schedules distillation when a document becomes
  `ready`, so a *new* document teaches the wiki with no button involved. This
  is the whole point: there is no separate training run, ever.
- The 148 already-imported documents are brought in line once, by the same
  path, on a bounded backfill that reports progress on screen 2 — not by
  asking Anthony to import anything twice.
- Cost discipline: one cheap model call per document to name topics, one per
  page actually written. A document that establishes nothing durable costs
  one call and writes nothing.

Acceptance: the Ronins workspace's 149 documents become a wiki whose map is
worth showing; re-running an import writes no duplicate pages; a document
added afterwards updates the right pages by itself.

### Stage two — answers come from pages (≈4 days)

Screens 3 and 5, and the gate.

- Retrieval reads the wiki: the page index by name, whole pages opened, one
  hop along links when the question needs it. The reading half already exists
  for customers (`wikiPages.findTopicPagesForQueryInternal` and the
  neighbourhood renderer) and is extended to serve as the primary source.
- Answers name their pages, on every door that can show them.
- Originals stay reachable: when an answer needs fine print, the cited source
  document can be opened and read. Nothing searches it; it is a receipt, not
  a second brain.
- The exam is written from Anthony's questions, run against both paths, and
  the two scores are put side by side.

Acceptance: the wiki matches or beats today's score on Anthony's questions.
If it does not, the failures name themselves and stage three waits.

### Stage three — the old way retires (≈3 days)

Screen 6, and only after stage two passes.

- Every door switched together (subject to decision 2).
- `/admin/ai/knowledge` and `/admin/companies/[id]/ai/knowledge` fold into
  the Wiki screen; the word "Knowledge" leaves the menus.
- The fragment machinery — `knowledgeChunks`, the embedding pipeline, the
  re-embed tooling, the retrieval service and its six callers — comes out of
  the product, with the document rows kept as sources.
- Documentation, the readiness checks and the go-live checklist follow the
  new shape.

**Total ≈11 build-days**, in three stages that each land separately and can
each be stopped at.

## Acceptance for the whole thing

1. **One import.** There is no second button, no training run, and no way for
   a person to import the same thing twice. Adding a source is the only verb.
2. **Judged, not asserted.** The exam decides the switch-over, on Anthony's
   own questions, with both scores visible.
3. **Every page shows its working.** Sources on every page, history on every
   change, and the original openable when the fine print matters.
4. **People still outrank the machine.** Pinned corrections survive every
   rewrite, every tidy-up and every re-import.
5. **The walls hold.** Pages, sources and the map stay company-scoped
   everywhere, proven by the same cross-tenant tests every other table gets.
6. **Nothing silently disappears.** No document row is deleted by this work.

## What this is not

- Not a second system beside Knowledge — it is the replacement for it.
- Not a deletion of your documents: they stay stored as the source behind
  each page, openable, and out of the way.
- Not a switch on faith: stage three is gated on stage two's exam.
- Not started until the three decisions are answered and Anthony says go.
