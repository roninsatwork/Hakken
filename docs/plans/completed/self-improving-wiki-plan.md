# The Self-Improving Wiki — Hakken Tends Its Own Memory

Status: **Delivered 2026-08-14** — Anthony said go the same evening and all
six phases were built, tested and proven in his browser that night. Honest
deviations from the letter of the plan, none from its spirit:
- Phase 2's "signed-in user" door was narrowed to the doors that genuinely
  know a customer: matched caller, mailbox sender, gateway'd widget
  visitor. A staff member's chat has no customer identity to read.
- Phase 4's "merge duplicate pages" is prevented rather than repaired: one
  slug-normalisation rule at naming time means "Delivery Times" and
  "delivery-times" are one page from birth. The gardener repairs links and
  tidies overgrown pages, and skips gardens with no weeds.
- Pin attribution lives in the audit trail, not on the pin: the
  personal-data manifest proved mid-build that a user id inside the pinned
  array would make erasure unprovable. The trail (retained as oversight
  evidence) records who pinned; the pin itself is company knowledge.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Build Karpathy's LLM Wiki pattern into Hakken, faithfully. The reference is the
pattern he published in April 2026: the AI keeps a wiki of small, whole,
human-readable pages — one per person, topic, or thing — and **maintains it
itself**. After an interaction it re-reads the relevant page and rewrites it:
folds new facts in, removes what is stale, resolves contradictions. The page
gets better, not longer. Periodic tending passes weed the whole garden. Memory
compounds instead of being re-discovered per question.

Anthony's calls, recorded 2026-08-14 — and the second and third exist because
he twice caught this plan's author drifting toward the conventional
watered-down version:

1. **The rewrite loop is the product.** Pages, screens and links are furniture
   around it. Acceptance is judged improvement (see the acceptance section),
   not the existence of a pages table.
2. **Whole pages, no chunking.** Pages are stored whole, read whole, and found
   by identity or by navigation (title list, links) — never chopped into
   embedded fragments. The vector store keeps its current job: the document
   library (PDFs, long reference files) genuinely needs chunk search and keeps
   it (`convex/schema.ts` `knowledgeChunks`, the hybrid vector+keyword pair at
   the `by_embedding` / `search_text` indexes). The wiki sits above the
   library, it does not replace it — and no wiki page ever becomes a chunk.
3. **Normal Convex tables.** No graph database, no file store, no new storage
   system. A page is a row; a link is data on the row; the map screen is drawn
   from those rows.
4. **Screens live in the company AI section.** Users only get Ask Hakken and
   the doors; everything that makes the wiki work is a company-scoped admin
   screen in the AI menu, in the house pattern.
5. **Seatbelts are non-negotiable.** Every rewrite is audited. Every fact
   traces to the conversation that taught it. A human correction survives all
   future rewrites — the machine may never overwrite a person. A memory the
   AI writes itself is only sellable because it can be inspected, corrected,
   and overruled.
6. **First slice: customer pages.** One page per known customer, rewritten
   after every phone call and email, read by every door that knows who it is
   talking to. This is also the "one customer, one history" feature — the
   caller who emailed yesterday is greeted by a Hakken that knows.

## What is actually true today (verified 2026-08-14)

**The phone already knows who called.** `matchCallerToCustomer`
(`convex/telephony.ts`) matches a caller's number against the workspace's own
customers (`salesDataCustomers`) and stamps `matchedCustomerKey` on the call;
`attachCallSummary` already writes a model-made summary of every call. The
rewrite loop's phone trigger is therefore an extension of an existing seam,
not a new discovery.

**The email door knows who wrote.** The Gmail connector reads and replies on a
connected mailbox (`convex/gmailConnector.ts`, `convex/gmailWatcher.ts`); the
sender is known on every thread.

**Memory machinery in the self-improvement family already runs.** Company
memories are rows with content, status, confidence and source
(`convex/schema.ts` `companyMemories`); suggestion sweeps already run on a
schedule (`convex/crons.ts`, `company-memory-suggestion-sweep` dispatching
`companyMemorySuggestionActions.sweepDispatcher`); agents already reflect on
their own runs (`convex/agentRunReflectionService.ts`). The wiki's rewrite
loop is a stronger version of muscles the platform already exercises.

**Provenance is already recorded per answer.** Every assistant message stores
which skills and knowledge sources reached the model
(`messages.companyRuntimeEvidenceJson`, `convex/schema.ts`). Pages join this
trail as one more named source, so "why did it say that" keeps one answer.

**The audit trail and tenant walls are routine.** `auditLogs` records
scoped, actor-attributed events platform-wide; every table carries
`companyId` scoping. Pages inherit both patterns unchanged.

**What does not exist:** any page store, any rewrite step, any door that reads
a customer's history before answering, any admin screen for tended memory,
any map. That is this plan.

## The shape of the build

### Phase 1 — The page store and the rewrite loop (4 days)

The heart, built first and judged hardest.

- `wikiPages` table: companyId, subject kind + key (first kind:
  `CUSTOMER`/`accountNameKey`), title, the page text (whole, bounded length),
  links (array of page keys), per-fact provenance (which conversation taught
  it), pinned human corrections, timestamps.
- The rewrite step: when a call ends (the seam where `attachCallSummary`
  already runs) and when a Gmail conversation gets a reply, Hakken opens the
  customer's page, rewrites it in the light of what just happened, and saves —
  one audit row per rewrite, old text retained for the trail.
- The seatbelts, in the same phase because they are the loop's spec, not
  decoration: pinned corrections survive verbatim through every rewrite;
  facts carry their source conversation; a rewrite that loses a pinned
  correction is a bug that fails a test, not a style issue.
- Acceptance: the judged-improvement tests described below, passing on
  recorded fixtures.

### Phase 2 — Every knowing door reads the page (2.5 days)

Where Hakken knows who it is talking to — a matched caller, a mailbox sender,
a signed-in user, a widget visitor who gave their email at the gateway — the
subject's page is read whole into the model's context before it answers, and
is recorded in `companyRuntimeEvidenceJson` like any other source. Doors with
no identity (an anonymous kiosk tap) read nothing and lose nothing.

### Phase 3 — The Pages screen (2 days)

In the company AI section, house pattern (standard table, search, 15-row
pagination): every page, when it last changed and why; open a page to read
what Hakken believes, see where each belief came from, edit the text, or pin a
correction. Editing writes the same audit row the machine's rewrites do.

### Phase 4 — The tending sweep (2 days)

The garden pass, on the existing sweep idiom (`convex/crons.ts`): per company
on a schedule, bounded in model spend the way the memory-suggestion sweep
already is — merge duplicate pages, prune what no longer matters, repair
links, and record everything it did. Pinned corrections are untouchable here
too.

### Phase 5 — Pages beyond customers, and navigation (3 days)

Page kinds for products, policies, and recurring issues; the title index —
small enough for the model to read whole — as the way Hakken finds non-customer
pages; links between pages followed wiki-fashion. No embeddings, no chunking,
per decision 2.

### Phase 6 — The map (2.5 days)

The graph view in the company AI section: pages as dots, links as lines,
growth visible after every conversation. Drawn from the rows (decision 3).
Theme tokens only, per the repo's colour rules; node styling must respect
`AGENTS.md` on hardcoded colours.

**Total: 16 build-days. The first visible slice — Phases 1–3, a customer's
page improving itself after real calls and emails, readable and correctable
on its screen — is 8.5 build-days.**

## Acceptance — what "self-improving" must mean here

Fidelity to the pattern is the acceptance bar, tested, not asserted:

1. **Improvement is judged.** After a recorded conversation fixture, the
   rewritten page must be graded better than the prior page by a model judge
   with a written rubric (accurate, current, shorter-or-equal, no lost pinned
   facts) — the same model-graded idiom the AI Checks engine already uses.
2. **Change replaces, never accumulates.** A fact that changed (a new phone
   number, a resolved complaint) must appear once, updated — a page that
   appends contradictions fails.
3. **People outrank the machine.** A pinned human correction survives any
   number of subsequent rewrites and sweeps, verbatim.
4. **Nothing is unexplained.** Every fact on a page traces to a conversation
   or a human edit; every rewrite has an audit row; a page's history can be
   walked end to end.
5. **The walls hold.** Pages are tenant-scoped everywhere they are read or
   written, proven by the same cross-tenant tests every other table gets.

## What this is not

- Not a replacement for the knowledge library: documents stay chunked and
  searched as today; pages are never chunked. **Superseded 2026-08-15** —
  Anthony's decision is that the wiki replaces knowledge import and storage
  outright; see
  [wiki-replaces-knowledge-plan.md](wiki-replaces-knowledge-plan.md). The
  "pages are never chunked" half of this rule still holds.
- Not a new storage system: rows in the existing Convex database, full stop.
- Not autonomous belief: the machine tends, people rule.
- Not started until Anthony says go, phase by phase.
