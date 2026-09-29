# Knowledge search: a relevance cut-off, and five gaps closed

**Started 2026-09-28. Status: built 2026-09-28, shipped Off; the trial
waits for knowledge on Ronins.** Change a decision here, with a date, before
building anything that disagrees with it.

## Built, 2026-09-28

Anthony: "Ok build it". Everything below is built and tested locally; the
Decision is Off everywhere, so nothing reads differently until it is switched
on, apart from the gaps, which apply at once.

- **The cut-off**: `knowledge.passage-answers-question` in the registry, its
  words in English and Italian, and `knowledgeCutOff` (`convex/knowledgeReading.ts`).
  Off, the mode is read and nothing else happens — no request, no records.
  On, one request per search; each judged passage gets its own record, naming
  that passage (a Decision run may now carry its own subject:
  `DecisionRequest.subjectId`), and the cost row names the Decision once.
- **The shared step** (`selectKnowledgeChunksWithinBudget`, `aiPromptAssembly.ts`)
  takes the cut-off, the question's embedding model and the agent whose own
  pieces a run reads, and says what the cut-off left out. Chat, agent runs,
  voice, email replies, the wiki's test questions, the swarm Architect and
  Test retrieval all read through it. Agent runs lost their own copy of it.
- **A lighter loader**: pieces are read without their 768-number embedding,
  with their document's name (`getChunkForReadingInternal`); the whole-row
  loader it replaces had no other user and is gone.
- **Gap 1**: a piece embedded by a model other than the question's is never
  read — compared with the model the question was embedded with, not a fixed
  name, so a company on its own embedding model keeps its knowledge.
- **Gap 2**: Test retrieval is an action (`knowledgeActions.testRetrieval`):
  the real search (50 pieces, or 100 on an agent's shelf, as chat and agent
  runs search), the same reading within 32,000 characters, the cut-off when
  on. The panel now says how many pieces were found, how many would be read
  and how many were left out, and lists them in reading order, the left-out
  ones dimmed after them. The word chips and the "score" line went: the real
  search has neither.
- **Gap 3**: PRODUCT.md §24 corrected, and the change logged.
- **Gap 4**: the swarm Architect reads through the shared step and wrapper,
  within **4,000 characters** (a new fixed number, said here): every swarm
  agent is sent at most the first 10,000 characters of the growing notes, and
  the Architect's unlimited reading pushed the later agents' findings past it.
- **Gap 5**: the `knowledgeRetrieval.ts` header names its real readers.

**Added while building, 2026-09-28: an agent's pieces from another company.**
An agent every company can use is searched by agent alone, and a company's
admin can add knowledge to it — so one company's document reached other
companies' runs of that agent. The shared step now reads an agent's piece
only when it belongs to no company or to the company the run is for; Test
retrieval follows the same rule and refuses an admin another company's
agent. Not in the plan above; closed because the step being rewritten was
the one that let it through (AGENTS.md: preserve tenant isolation).

**Not yet measured**: whether TypeSafe counts the passages once per request
or once per question. The costs above assume once. The first searches of the
trial show the real figure on the Decision's page and Running Costs.

## What was asked

Anthony, 2026-09-28, after GPT Researcher replaced embeddings with Jev in its
RAG pipeline: "Should we replace the rag pipelines with jev?" Then, of the
knowledge base ("we have knowledge on global, companies and agents") and of
Jev already being here — "Jev is already in the platform … it's been there a
week already" (docs/plans/active/decisions-typesafe-plan.md) — "2 yes please"
to writing up a relevance cut-off that uses Jev through a Decision, and
"3 yes" to closing the smaller gaps found while checking.

## The knowledge search today (checked in the code, 2026-09-28)

- **Four levels of knowledge**: global, company, agent and chat thread
  (thread uploads are deleted after 24 hours). Every search is filtered to one
  level; none reads across them (`knowledgeRetrieval.ts`).
- **What goes in**: PDF, Word, text and imported web pages, cut into
  1,000-character pieces with 200 overlapping, each given an embedding by
  Google's `text-embedding-005`.
- **How it is searched**: by meaning and by keywords at once, the two
  rankings merged (`knowledgeRetrievalService.ts`), with a small nudge from
  how pieces fared in rated answers (`knowledgeEvidence.ts`). Then ranked
  across levels (thread ×1.1, company ×1.05, global ×1) and poured into a
  character budget, 30% of it kept for this chat's uploads
  (`selectKnowledgeChunksWithinBudget`, `aiPromptAssembly.ts`).
- **Nothing checks relevance.** The best-ranked pieces are used however weakly
  they match, until the budget is full: up to 50 pieces and 32,000 characters
  for chat, 100 and 32,000 for agent runs, 30 and 6,000 for voice and email.
- **Who reads it**: the assistant chat (company pieces only when the company
  wiki has nothing; global pieces only while there are no global wiki pages;
  thread uploads always), agent runs, voice calls, email replies, the wiki's
  test questions and the swarm "Architect" agent.

## What GPT Researcher found, and what applies here

Their gain came from dropping weak pieces: by their own write-up, keyword
ranking with a cut-off also beat embeddings, 14 to 6, and Jev scores each
piece 0 to 3 and keeps those at 1.5 or more. They search web pages fetched a
moment before; we search a stored library, thousands of times. Jev has no
index, so it cannot replace our search — every search would have to send the
whole library. What it can do is judge the shortlist our search finds. That
is this plan.

## The cut-off: one more Decision

**"Does this passage help answer the question?"** —
`knowledge.passage-answers-question`, built exactly like
`wiki.page-answers-question`, which already checks the wiki's picked pages:

- A yes-or-no, **low stakes**, shipped **Off**.
- Asked **once per search, in one request**, over the top-ranked pieces — at
  most **40** (a new fixed number, said here: about 16,000 tokens, inside
  TypeSafe's 64,000 a request). Each piece is its own question, its id the
  piece's id; the state is the question asked and the pieces, each with the
  name of its document.
- **Off, or Jev failing**: every piece is kept — today's behaviour, exactly.
- **Ask a person** (the trial): nothing is dropped; every verdict is recorded
  on the Decision's page, so it shows what it would have dropped.
- **Act**: a piece it is fairly sure or sure does not help is left out, and
  the budget fills from the next pieces down — so a relevant piece ranked
  45th gets the room a stray one ranked 3rd had.
- **Where**: in the shared selection, between ranking and filling the budget,
  so chat, agent runs, voice and email all get it at once; the swarm
  Architect joins that path (gap 4).
- **Who answers**: the Decisions job's model — Jev on dev. Any model can
  (Anthony's ruling, 2026-09-17); a text model's certainty is cut higher.
- **Per company**: switched on or off per company on the Decisions screens,
  like every Decision.

**Costs.** Jev charges $0.042 per million input tokens: 40 pieces is about
$0.0007 a search, about $0.70 for a thousand chat messages. A text model
answering instead costs more, and shows on Running Costs like every Decision.

**Time.** One request per search. TypeSafe answers in about 150ms; GPT
Researcher measured 1.7 seconds typical (3.6 at worst in ten) for its
filtering, so up to about two seconds may be added before an answer starts.

**What it sends to TypeSafe.** New: the text of knowledge pieces — company
documents and uploads — with the question. Decisions already send chat
messages, emails, wiki summaries and AI answers. TypeSafe's terms: no
training on customer data without consent; "telemetry", which includes its
classifications, may be processed without restriction; zero retention only
on enterprise plans. Anthony's call; the per-company switch keeps any company
off.

**Records.** One Decision record per judged piece — up to 40 a search, so
the page can show what was dropped — cleared after 90 days like every
Decision record (`purgeScheduleService.ts`).

### How we know it helps

1. Built and shipped **Off**; nothing changes.
2. **Ask a person** on Ronins (dev) for a few days: every verdict recorded,
   nothing dropped. It needs knowledge to judge first: dev's knowledge base
   is empty — no documents and no pieces at any level (checked 2026-09-28) —
   so Ronins' own documents or a website import go in before the trial.
3. Read the Decision's page: how many pieces it would drop per question, and
   20 of its drops checked by hand — were they really off the point?
4. Only then **Act**, company by company.

## The five gaps (checked in the code, 2026-09-28)

1. **Pieces from an old embedding model are still searched.**
   `knowledgeReembed.ts` says "the reader checks it"; no reader does. After a
   model change, old and new pieces would be mixed in one search, which that
   file itself calls worse than finding none. Fix: the shared selection skips
   a piece whose model is not the current one.
2. **"Test retrieval" does not run the real search.** It is a query
   (`testRetrieval`, `knowledge.ts`) matching words, and a meaning search can
   only run in an action. Fix: an action running the same shared search and
   selection — the cut-off too, when on — so it shows exactly what chat reads.
3. **PRODUCT.md is wrong.** It says retrieval is "vector similarity only —
   there is no keyword/vector hybrid"; it is hybrid. Fix: correct it, and add
   the cut-off once built.
4. **The swarm Architect builds its own reading** (`swarmActions.ts`): it
   joins pieces with the two characters `\n` rather than line breaks, and has
   neither the untrusted-content wrapper nor the size budget chat and agents
   use. Fix: it uses the shared selection and wrapper.
5. **A stale comment**: `knowledgeRetrieval.ts` names a "sales reports" caller
   that no longer exists. Fix: correct it.

None of them buys anything or changes the screens beyond "Test retrieval",
and none affects anything today: dev's knowledge base is empty and there is
no production yet (checked 2026-09-28). Gap 1 is a trap for the first change
of embedding model; gap 4 is the only one about safety.

## Tests

- Off: the same pieces, in the same order, as today.
- Act: a sure "no" leaves a piece out and the next fills its room; "not sure"
  keeps it; the thread-upload share still holds; one request per search, at
  most 40 pieces; Jev failing keeps everything.
- Ask a person: nothing dropped; every verdict recorded.
- Gap 1: an old-model piece is never read. Gap 2: "Test retrieval" returns
  what the real search does. Gap 4: the Architect's reading is wrapped and
  budgeted.

## Order of work

1. The five gaps: small, and independent of the Decision.
2. The Decision: registry entry, its words in English and Italian, the shared
   selection, the tests.
3. Local checks (`npm run verify:env`, `npm run lint:all`, `npm run check`,
   `npm run build`, `git diff --check`).
4. The trial on Ronins in "Ask a person", then Anthony's call on Act.

## Not in this plan

- Replacing the meaning search with Jev: it has no index.
- A ranking model of our own.
- Changing how the wiki picks pages — already a Decision.
