# The Personal Layer and Goals — The Brain Learns Who Is Asking and What We're Aiming At

Status: **Built 2026-08-21**, both parts, the same day the plan was
written and both Part 2 rulings decided (see Rulings). Audited against
this plan the same evening by a fresh reviewer; every gap it found is
fixed and recorded in "What the audit changed" below. Full suite green;
both screens looked at in the browser via the e2e-auth fixture mode
(fixture data — layout and interactions, not live queries). The Convex
functions were pushed to the dev deployment the same evening with
Anthony's explicit go-ahead (`npx convex dev --once`) — an earlier
version of this paragraph recorded the hour when the frontend was on
dev but the functions were not, which is why the new screens errored
when Anthony first opened them. Live remains untouched behind the
usual gate. Written 2026-08-21 after Anthony reviewed a
"second brain" reference architecture against what Sonae has built.
The comparison found the core loop complete (raw in → wiki grows →
answers use it → learnings flow back) and two real gaps: the system
learns about the company but not about each person, and it learns
facts but not aims. This plan closes both.
Owner: Anthony

Two rulings from the same discussion are recorded here so they are not
re-litigated:

- **No output library.** The reference architecture keeps a versioned
  shelf of every generated deliverable. Ours already keeps sales and
  opportunity reports in their own tables with history; a unified
  "everything ever produced" shelf is filing-cabinet tidiness that
  makes no future answer better. Skip stands.
- **No per-person wiki copies.** One company wiki, shared by everyone,
  one version of the truth. The personal layer is a private note about
  a person, never a fork of the knowledge.

## Part 1 — Goals: a GOAL page kind in the wiki (build first, ≈1–2 days)

Goals are what the workspace is trying to achieve: targets, current
pushes, things the AI should point answers and reports at. Today the
wiki holds what is *true* (customers, products, policies, issues) but
not what is *wanted*. Goals live inside the wiki, not beside it —
they get links, hubs, the map, retrieval and tending for free, and
there is still only one brain.

### The design

- **A new `kind: "GOAL"`** in the `wikiPages` union
  (`convex/schema.ts:3403`), alongside CUSTOMER, PRODUCT, POLICY,
  ISSUE, SOURCE. Subject key is a slug of the goal's name, like the
  other topic kinds.
- **Human-authored only.** Goals are intent, not distilled fact. The
  Distiller never creates or rewrites GOAL pages; the manual page
  door (`editPageContent*`) is how they are written. Pinned
  corrections work on them as on any page.
- **Hands off by the Tidier.** GOAL pages join hubs, SOURCE notes and
  pinned corrections on the never-shrink list. The Linker may still
  cross-link them, and other pages may `[[link]]` to them.
- **A goals hub.** `refreshHubPagesInternal` (`convex/wikiPages.ts:775`)
  grows a `goals-index` hub exactly like products/policies/issues, so
  every goal is one click from the index and back-linked.
- **Retrieval sees them.** GOAL pages appear in the wiki index the
  chooser reads (`getWikiIndexInternal`), so a question about targets
  pulls the right goal page like any other page. Nothing special
  needed — being a page is enough.
- **Reports aim at them.** `salesReportContextService.ts` adds the
  company's GOAL pages to the report context, so board and sales
  reports measure the numbers against what the workspace said it
  wants, not just against last month.
- **Goals go stale loudly.** The Freshness Checker's rounds include
  GOAL pages: a goal untouched beyond the aging threshold raises a
  `wikiOpenQuestions` row — "is this still the aim?" — for a person
  to answer. It never rewrites, same as everywhere else.

### The chores that come with a new kind

- `kinds.GOAL` label in the i18n strings; kind filter on
  `WikiPagesListScreen`, quick switcher, map colours, export folder
  name.
- Global wiki: GOAL pages are allowed there too (platform-level aims),
  under the same two-brains rule — a company goal beats a global one
  on the same subject.
- Tests: hub growth, tending exclusion, freshness question on a stale
  goal, report context includes goals, distiller never emits GOAL.

## Part 2 — The personal layer: the brain learns each person (≈3–5 days)

Today identity is per workspace: system prompt, rules, voice. The
`users` table (`convex/schema.ts:392`) holds role and login stats and
nothing else — the system cannot know that one person wants two lines
and another wants the working shown. Threads already carry `userId`
(`convex/schema.ts:2120`), so chat always knows who is asking; nothing
uses it.

### Why this is not "another shelf" (the one-brain question)

The one-brain ruling (2026-08-17) folded company memories into the
wiki and rules: knowledge goes to the wiki, behaviour goes to the
rules. A personal note is the one thing neither home can hold,
because both are shared surfaces and this must be private to one
person. The sorting rule extends, it does not break:

- **Company knowledge stays company knowledge.** A fact about the
  business learned from Anthony's chat goes through the Filing Clerk
  to the wiki, as today. It never lands in his personal note.
- **Workspace behaviour stays in rules.** An instruction that should
  colour everyone's answers is an AI Rule, as today.
- **The personal note holds only the person**: who they are, what
  they do, how they like their answers, what they keep coming back
  to. "Prefers short answers, no jargon." "Finance lead — cares
  about margin, not volume." "Always asking about the Comax account."

### The design

- **New table `userMemories`**, a slimmer sibling of
  `companyMemories` (`convex/schema.ts:1658`): `userId`, `content`,
  `status` (APPROVED/ARCHIVED), `sourceType` (CHAT/MANUAL),
  `autoApplied`, `usageCount`/`lastUsedAt`, audit stamps. No
  `applyMode` and no search index: the whole active set is small and
  injected whole. A hard cap (20 active rows, each ≤ 300 chars)
  keeps it a sticky note, not a dossier — the suggestion sweep must
  consolidate or replace, never sprawl.
- **Injection.** `buildAssistantSystemInstruction`
  (`convex/aiPromptAssembly.ts`) gains a "WHO IS ASKING" section,
  built only when the thread has a `userId` and the viewer is that
  user's own signed-in session. Same section for voice
  (`aiVoiceSession.ts`) when the user is known. Widget visitors and
  anonymous threads never get one.
- **Learning.** A per-user suggestion sweep, sibling to
  `companyMemorySuggestionActions.ts`, reads a person's own recent
  threads and proposes note rows. It runs under the existing
  `autonomousMemory` switch (`convex/selfImprovementConfig.ts`,
  default on, per the 2026-08-10 autonomy decision): saves are
  automatic, marked `autoApplied`, audited, and removable. The sweep
  is told the sorting rule explicitly — company facts are not its
  business.
- **The person sees their note.** A "What the assistant knows about
  me" screen in the user's own profile/settings area (not the admin
  section): every entry listed, delete beside each, and a box to add
  one manually. Deleting is immediate and audited.
- **Privacy walls, tested as hard bounds:**
  - Another user's thread never receives my note, whatever the
    workspace or role.
  - The Filing Clerk's prompt is told personal-note context is never
    filed to the wiki.
  - The suggestion sweep writes only to the subject's own rows.
  - Erasing a user purges their `userMemories` through the existing
    retention/purge road (`convex/purges.ts`).
- **Observability.** The weekly digest counts personal notes learned
  (counts only, never content); usage stamps land like everywhere
  else.

### Rulings (Anthony, 2026-08-21)

1. **Who else may see a person's note? No one.** Not company admins,
   not super admins; admins see only counts ("5 notes"), never the
   words. If people know the boss can read the system's file on them,
   they trust it less.
2. **The note travels with the person.** Keyed by `userId` alone —
   it is about them, not about the company. Theoretical until
   multi-workspace membership exists, recorded so we don't trip over
   it later.

## Order and size

1. **Goals first** (≈1–2 days): small, entirely inside existing wiki
   machinery, makes board reports sharper immediately, and proves the
   pattern.
2. **Personal layer second** (≈3–5 days): most of the effort is the
   profile screen and the leak-proofing tests, and it deserves them.

Per standing rules nothing is pushed or deployed without Anthony's
say-so — the dev push happened 2026-08-21 evening with his explicit
yes, and `_generated/api.d.ts` was regenerated by that push (the
hand-added entries it replaced matched).

## What the audit changed (2026-08-21, same evening)

An independent review against this plan found gaps; all are fixed:

- **The subject-access export leaked note words to admins**, breaking
  Ruling 1: `produceSubjectAccess` returned whole rows. The manifest
  now carries `redactFields` and the export blanks a note's content —
  the row's existence shows, the words never do. Erasure unchanged.
- **Eval runs carried the pressing admin's note** (eval threads hold
  the runner's userId as plumbing), so the same check scored
  differently per runner. Injection now skips `purpose: "EVAL"`
  threads.
- **Only the first 25 users were ever swept.** The dispatcher now
  rosters up to 500 people and takes the 25 longest-unswept,
  never-swept first.
- **Voice sessions never stamped note usage** — they do now.
- **The kind filter on the pages list** (named in Part 1's chores) was
  missing — added, with GOAL among the kinds.
- **A distiller-never-emits-GOAL regression test** was missing — added.
- Dead code removed: the sweep's landing is the only write door for
  learned notes; the unused ARCHIVED state came off the schema (a note
  exists or is deleted outright — an archive would be a copy the
  person believed gone).

Two plan statements are corrected rather than the code:

- **At the cap the note stops learning; it does not consolidate or
  replace.** Silently replacing a note the person may rely on is the
  worse behaviour; the person prunes their own note. The "consolidate,
  never sprawl" line above is superseded by this.
- **Platform-level GOAL pages serve chat retrieval only.** Board
  reports are a company surface and read company goals alone —
  platform aims measuring a company's numbers would cross the
  two-brains wall. Goals are written through their own audited door
  (`createGoalPageForCompany`/`ForGlobal`), not the edit door named
  above; editing an existing goal still uses `editPageContent*`.

## What this plan refuses to build

- A per-person copy of the wiki, or personal pages inside the shared
  wiki.
- A hidden profile: nothing is learned about a person that the person
  cannot read and delete.
- An output library (ruled out 2026-08-21, recorded above).
- Per-person *retrieval* complexity: the note is injected whole or
  not at all; no embeddings, no chooser, no second brain.
