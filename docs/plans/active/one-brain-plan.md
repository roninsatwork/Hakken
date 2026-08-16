# One Brain — Saved Answers and Memory Fold Into the Wiki

Status: **Planned 2026-08-17**, designs shared for approval before any build.
Owner: Anthony

Anthony's question, looking at the company AI menu: *"is saved answers
and memory still relevant with Karpathy's approach?"* The honest answer
was mostly no — both predate the wiki and keep separate shelves of
truth alive. His ruling: fold them. One brain, one place to correct it.

## What is actually true today (verified 2026-08-17)

- **Saved Answers** (`saveAnswerToKnowledge` in `convex/knowledge.ts`)
  stores a chat answer as a company knowledge document. Since the
  cutover, importing IS teaching — so a saved answer already becomes a
  wiki source note and teaches topic pages through the Distiller. The
  screen (`companies/[id]/ai/saved-answers`) is a lens on the old
  world, and the Filing Clerk automates the same judgement with the
  playbook's never-file list.
- **Memory** (`convex/companyMemories.ts`) holds human-approved facts
  in two modes: searched memories matched to the question, and ALWAYS
  memories injected into the system prompt of every answer
  (`resolveCompanyApplyMode`). Four runtime arms read them
  (`getRuntimeMemoriesInternal` call sites in `convex/ai.ts`). A
  candidates queue (`companyMemoryCandidates`) holds AI-suggested
  memories for human review.
- The wiki's native homes already exist: **pinned corrections** for
  durable human truth the machine must respect on a page, and **AI
  Rules** for standing instructions that colour every answer.

## The sorting rule

Knowledge goes to the wiki; behaviour goes to the rules.

- A **searched memory** is a fact — it becomes a **pinned correction**
  on the page it belongs to. No page fits → it pins to a mechanical
  `about-this-company` POLICY page, created once per company that
  needs it.
- An **ALWAYS memory** colours every answer regardless of pages — that
  is an instruction, and its honest home is **AI Rules**, which are
  always applied. Pins only surface when their page is opened; moving
  an ALWAYS memory to a pin would silently weaken it. It moves to a
  rule instead, marked with where it came from.
- A **saved answer** is already wiki food; the button stays but files
  through the wiki's audited door with the conversation as its receipt
  — a human clicking "save" is a stronger signal than the Filing
  Clerk's model judgement, so it files directly, no model call.

## The phases

### Phase 1 — the migration road (≈1 day)

A per-company, one-time sweep behind the same claim-first discipline as
every wiki job: each approved searched memory is read against the
wiki's index and pinned to its best page (the mechanical
`about-this-company` page catches the rest); each ALWAYS memory becomes
an AI Rule naming its origin. Migrated memories are archived, never
deleted — their history and usage stats stay walkable. Pending memory
candidates are surfaced for a person to decide before the queue closes;
nothing is silently discarded. Every move lands in the audit trail.

Acceptance: a company with three searched memories and one ALWAYS
memory ends with three pins on the right pages, one new rule, four
archived memories, and audit rows for each; running the sweep twice
changes nothing.

### Phase 2 — answers read one brain (≈0.5 day)

Once a company's migration is stamped, the four runtime arms stop
reading companyMemories for it — the facts now arrive through the pages
they're pinned to, and the instructions through the rules engine that
already always applies. The standing AI Checks are re-run before and
after on the demo workspace, and the gate is the same as every cutover:
no BLOCKER regression, wiki score holds.

Acceptance: an answer that used to lean on a memory cites the page the
pin lives on instead; an unmigrated company behaves exactly as today;
the AI Checks pass unchanged.

### Phase 3 — the screen fold (≈1 day)

Saved Answers and Memory leave the company AI menu; their addresses
redirect to the Wiki. The save button in chat becomes "Save to wiki"
and files through the wiki's door with a CHAT receipt naming the
conversation. The pins gained in phase 1 are already visible on their
pages' detail screens — nothing new to learn. English and Italian
together, parity-enforced.

Acceptance: the menu shows one knowledge entry (Wiki); saving an answer
from chat produces a wiki page edit with a receipt that opens the
conversation; the old addresses redirect; nothing anywhere still writes
to companyMemories at runtime.

## Honest bounds

- Pins surface when their page is opened — that is correct for facts,
  and exactly why ALWAYS memories become rules instead of pins.
- The migration's page-matching is model-judged and will occasionally
  file a pin on a defensible-but-different page than a person would
  choose; pins are human-movable on the page screens, and the audit row
  names the memory each pin came from.
- `companyMemories` tables and doors stay in the codebase until every
  company is migrated and a later cleanup removes them; this plan
  retires their runtime, not their history.

## Order and size

Phases land in order, each separately, each stoppable. **≈2.5
build-days.** Nothing changes for a company until its migration runs,
so the demo workspace can go first and prove the road.
