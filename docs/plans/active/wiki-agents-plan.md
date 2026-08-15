# The Wiki's Staff — Agents That Tend, Check, and File

Status: **Delivered 2026-08-15**, all six phases, on Anthony's "continue
until the plan is complete." The staff of seven are live agents on the
Agents screen — Distiller, Tidier, Linker, Contradiction Finder, Freshness
Checker, Reviewer, Filing Clerk — each switchable, run-recorded, and
undeletable. Full-import-first landed with the exam re-sat (16 v 15, gate
passed; the sitting that put source notes on the chooser's menu scored 14
and was reverted — recorded in the commit trail). The Contradiction
Finder's first live run raised zero questions on the two-day-old wiki,
which its own prompt calls the right answer. Honest bounds: the Reviewer's
claims preview is a bullet list rather than full proposed-page previews,
and the Filing Clerk considers only staff answers that drew on 2+ pages.
Owner: Anthony

The specification behind this plan is not mine: it is the prompt library
Anthony runs his Obsidian/Karpathy wiki with, shared 2026-08-15 from
`~/Projects/Second-Brain/Knowledge/04-prompts/` and its `AGENTS.md`. Where
this plan and that playbook disagree, the playbook wins. Every claim about
Sonae carries the file it rests on; verify anchors before editing.

## The decision

Anthony's words: *"we need to make some of these agents that auto run to
tidy up etc and some can be called at ingest time."*

So: the wiki gets a staff, and — corrected 2026-08-15 after Anthony pulled
up the first draft — **the staff are real Sonae agents, on the Agents
screen**, not hidden background jobs. "Agent" in this product means a thing
with a face: a run history in the existing observability, an on/off switch,
and instructions you can open and read the way Anthony reads his Obsidian
prompt files. Some run on a rota through the platform's existing agent
scheduler; some are invoked when material arrives. A quiet company still
costs nothing. All of them follow the playbook's two iron rules: **never
invent facts**, and **never silently resolve a factual contradiction** —
machines tidy structure, people settle truth. Everything an agent does
lands in the audit trail and shows on the Wiki screen.

### Phase 0 — the staff get their faces (≈1 day, first)

Before any new hire: the three workers that already exist — the Distiller,
the Tidier, the Linker — become visible agents on the Agents screen, their
nightly and ingest-time runs recorded through the existing agent run and
observability machinery, each switchable off per company, each showing the
instructions it works to. Every agent built after this arrives through the
same door on day one. The five hires below then join the same screen as
they land.

## What is actually true today (verified 2026-08-15)

Three of the staff already exist, built this week:

- **The Distiller** (ingest-time): every company document that becomes
  `ready` teaches the wiki by itself, and a catch-up sweep reads the
  backlog — claim-first, so nothing is read twice
  (`convex/wikiDistillActions.ts`, hook in `convex/knowledge.ts`). His
  `ingest-web-source.md` is the equivalent.
- **The Tidier** (nightly): overgrown pages are re-tidied, accepted only
  when the result is shorter; hub index pages are never sent to a model
  (`convex/wikiTendingActions.ts`). Part of his `lint-wiki.md`.
- **The Linker** (nightly + catch-up): sparse pages get read against the
  index and connected both ways; dead links come off; hub pages per topic
  kind are maintained mechanically (`crossLinkSweep`,
  `refreshHubPagesInternal`). His `find-orphans-and-missing-pages.md`.

Also standing: writers weave `[[references]]` from the index into prose and
links are parsed from what the pages say (`convex/wikiRewriteService.ts`,
`syncLinksFromContent` in `convex/wikiPages.ts`); pages carry receipts and
walkable revisions; the exam re-runs as AI Checks; the map draws the graph.

What does not exist: contradiction finding, staleness checking, a
per-document source-note layer, a pre-ingest review checkpoint, and
write-back of durable synthesis from questions. That is this plan.

## The roster to build

### 1. The Contradiction Finder — auto-runs (≈1 day)

His `find-contradictions.md`, made a rota duty. Related pages (linked
neighbourhoods, bounded) are read together; claims that disagree are
flagged, each with the two pages and the two sentences side by side.
**Nothing is resolved by the machine** — per the playbook's maintenance
rule, each finding becomes an open question on the Wiki screen, and a
person picks the truth (which becomes a pinned correction or an edit,
through the existing audited doors). Findings are deduplicated so the same
disagreement is not raised nightly.

Acceptance: a seeded pair of contradictory pages is flagged once, shown on
the screen, resolvable by pin or edit, and not re-raised after resolution.

### 2. The Freshness Checker — auto-runs (≈1 day)

His `refresh-stale-knowledge.md` and `audit-page-provenance.md`. Pages
whose content carries time-sensitive claims and whose last teaching is old
get re-checked against their kept source documents (the receipts point
straight at them). Verified pages get their check recorded; unverifiable
claims are flagged as open questions, never silently rewritten. Bounded
per night like every sweep.

Acceptance: a page whose source still supports it passes quietly; a page
whose source no longer exists or no longer says it is flagged with the
claim named.

### 3. Full-import-first — the structural one (≈1.5 days)

The playbook's mandatory ingest order: **full import first, internal
linking second, synthesis third** (`AGENTS.md`, Ingest Behaviour). Sonae
currently distils straight to topic pages — synthesis without the full
layer. This phase adds the source-note layer: each ingested document gets
its own full wiki note (a new page kind), substantially intact, linked
upward to the topic pages it taught and downward to the preserved
original. Topic pages become what the playbook calls synthesis pages, and
their receipts deepen: synthesis → source-note → original document.

The answering doors keep reading synthesis pages first (the playbook's own
query order: index, then the smallest relevant page set); source-notes are
opened only when a question needs the fine print — which replaces the
current "open the original" fallback with a proper wiki citizen.

Acceptance: importing one document yields its source-note and updated
topic pages in that order, all linked; the map shows the layer; answering
still passes the standing AI Checks.

### 4. The Reviewer — called at ingest (≈1 day)

His `review-source-before-ingest.md`: for material a person marks as
sensitive or high-impact, Sonae reads the source and **presents its main
claims and the pages it proposes to write before writing anything** — a
checkpoint, using the approvals machinery the platform already trusts.
Routine material keeps flowing straight through, exactly as the playbook
says it should.

Acceptance: a review-marked import writes nothing until approved; an
approved review lands identically to a direct import; a rejected one
leaves the wiki untouched and the decision audited.

### 5. Write-back from questions — always on (≈1 day)

The playbook's query rules 8–9: when an answer produces durable new value
— a cross-page synthesis, a resolved comparison, a durable relationship
not yet represented — it is filed back into the wiki rather than left in
chat, through the same audited rewrite door, marked with the question as
its source. Routine answers are never filed; the playbook's own list of
what not to save (transient status, speculation, duplicates) becomes the
filter's instruction.

Acceptance: a question whose answer synthesises across pages leaves a new
or improved page with the question as provenance; ten routine questions
leave the wiki untouched.

## Order and size

Reordered 2026-08-15 at Anthony's direction, for tomorrow's gain first:
**full-import-first, then Phase 0 (the faces — so every agent hire lands
on the Agents screen as instructed), then the Contradiction Finder**, then
freshness, reviewer, write-back. The exam is re-sat the day
full-import-first lands, so the expected score lift is shown, not claimed.
**≈6.5 build-days**, each landing separately, each stoppable.
The order puts pure tidy-up value first (his ask), the structural change
in the middle where the layers it needs already exist, and the two
judgement-heavy agents last.

## What this is not

- Not autonomous truth: no agent resolves a factual disagreement, changes
  a classification, or deletes a historical position — flagging is the
  ceiling, people settle the rest (playbook, Maintenance Behaviour).
- Not noise: every agent deduplicates its findings, is bounded per night,
  and skips companies with nothing to do.
- Not a new framework: every agent lands through the existing audited
  doors — rewrites, pins, approvals, open questions — and reports through
  the existing trail.
