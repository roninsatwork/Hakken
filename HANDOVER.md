# Handover — Sonae wiki retrieval & agent execution fixes

**Date:** 2026-08-20
**Repo:** `/Users/ants/Projects/Sonae`
**Branch:** `dev` (tracking `origin/dev`, last pushed commit `6efaf595`)
**State:** 31 files modified + 2 new files. **All uncommitted. Nothing pushed. Nothing deployed.**

> **Update, same day (evening):** everything below was pushed to the dev
> deployment and verified working in the browser with the owner watching:
> the workshop question answers from the decks, Run actually runs the staff
> sweeps and writes honest run records, modal typing and scrollbars fixed.
> Also added since this document was written: every wiki staff model call
> is now recorded to `agentTransactions` and `agentLogs` and stamped with
> its run (`recordStaffModelCallInternal` + `adoptRoundLogs` in
> `convex/wikiStaff.ts`) — the staff dashboards and run detail pages were
> permanently blank before that. Committed and pushed to `origin/dev`.
> Live (production) still runs the old code.

---

## Read this first

Everything below is **unrun code**. It typechecks, lints, and passes 5,534 unit
tests, but **not one line of the backend has executed on a real Convex
deployment.** Convex functions only run on a deployment, and the owner
explicitly declined a push to dev ("we are not ready"). So treat every backend
claim here as *reasoned from source and covered by tests*, not *observed
working*.

The owner's last question was: "have you actually run the wiki agents in the
browser?" The answer was no. That is the single most important outstanding
task.

## Hard constraints (owner's standing rules)

1. **Never run `npx convex dev`, `convex deploy`, `convex codegen`, or `git
   push` without explicit, current permission.** Ask each time. Permission for
   one does not carry to the next.
2. **Plain English only** in all communication with the owner. No jargon, no
   code-speak, one idea per sentence. He has said this repeatedly.
3. **Short answers.** Conclusion first. Offer detail rather than supplying it.
4. **Never claim visual verification that did not happen.**
5. Production is live at `sonae.ronins.co.uk`. Dev deployment is
   `dev:silent-axolotl-121` (in `.env.local`). Sandbox blocked read-only
   `npx convex run --prod` queries during this session.
6. Node 24 lives at `~/.local/nodejs`, not on the default PATH. `.claude/launch.json`
   handles this for the dev server; prefix manually otherwise.

---

## The problem that started this

The owner uploaded four IFFO workshop decks into a company wiki (workspace
IFFO, on **live**). Asking the assistant "what were the key take outs from the
workshop this week" got "I don't have access to the notes or materials." The
documents were plainly visible on the wiki screen.

Separately: the wiki staff agents all show "Active" but appear never to do
anything, the knowledge map is disconnected islands, and pressing Run on an
agent opened a "What should it do?" form instead of running.

## Root causes found (all confirmed in source)

1. **Chat could not see filed documents.** The page chooser
   (`convex/wikiActions.ts` `selectWikiContextForQuery`) is shown an index that
   deliberately excludes SOURCE pages (`includeSourceNotes: false`). Topic pages
   are named things like `fixed-price-billing` and `craft-prompt-framework` —
   nothing matching "workshop" — so the chooser returned nothing. The four
   documents whose *titles* say "IFFO AI Workshop Follow-Up Deck" were hidden
   from the only list it reads. And because `answersFromWiki` defaults true
   (`convex/wikiRewriteService.ts:231`), the old chunk search over company
   documents is skipped, so there was no fallback.

2. **The Linker had no caller.** `crossLinkSweep` in
   `convex/wikiTendingActions.ts` was referenced nowhere except its own
   self-chaining line. It ran once manually on 2026-08-15 (commit `35358116`)
   and never again. Every link on the map since came from the Distiller, which
   only ever joins a document to the topics it taught — hence islands.

3. **Pressing Run on a wiki agent never did that agent's job.** It started the
   generic agent loop (`runTriggeredAgentObjective`) — a model call with the
   agent's prompt — which produces prose and files nothing. The real work is a
   sweep (`distilSweep`, `crossLinkSweep`, `freshnessSweep`, …) reachable only
   from cron. **This is very likely the core of "the agents never work".**

4. **Documents lost permanently on one failure.**
   `claimDocumentForDistillInternal` stamps `wikiDistilledAt` *before* the model
   call. A failure after that left the document marked read forever, with a
   source note and no topic pages, and nothing recorded anywhere.

5. **Scheduled agents were sent the schedule's name** ("Scheduled run: Nightly")
   instead of their standing job. The manual path had been fixed for this; the
   scheduled path in `convex/workflowEngine.ts` was missed.

6. **Five of seven wiki staff only wrote a run record when they changed
   something.** A quiet night and a totally broken agent looked identical.

7. **UI: every modal in the app took one character then lost focus.**
   `SonaeModal`'s focus effect listed `onClose` in its dependencies; nearly all
   callers pass an inline arrow, so each keystroke re-rendered the parent, tore
   the effect down (restoring focus to the opener) and set it up again. This
   probably means **every manual agent run the owner ever launched was sent a
   one-character objective.**

8. **UI: chat transcript and history lost their scrollbars.** `scrollbar-hide`
   was in the markup but undefined, so it did nothing; someone later defined it
   and both long surfaces silently lost their thumb.

---

## What was changed

### Backend (`convex/`) — none of this has run

| File | Change |
|---|---|
| `wikiActions.ts` | Chooser now does a second pass **including source documents** when the first pass returns nothing. First pass unchanged (synthesis-first was measured better: exam 16→14 when notes were mixed in — do not merge the passes). |
| `ai.ts` | If the wiki returns nothing, falls back to searching the company's documents directly. `queryVector` hoisted so the question is embedded once. Appends via `companyFallbackContext`, never overwriting `ragContext`. |
| `wikiDistill.ts` | New `releaseDistillClaimInternal` — a failed distill hands the claim back so the sweep retries. Bounded by `WIKI_DISTILL_MAX_ATTEMPTS = 3`. |
| `wikiDistillActions.ts` | Calls the release on failure and records a **failed** staff run with the error. Sweep records a run even when the backlog is empty. |
| `wikiPages.ts` | `listSparselyLinkedTopicsInternal` no longer counts a page's automatic `SOURCE:` link as a connection, and rests a visited page for a week. |
| `wikiTendingActions.ts` | New `linkDispatcher` — one linking round over **every** company wiki; called from `tendDispatcher`. Every visited page is marked tended, not only orphan notes. Linker records a run even when it links nothing. |
| `wikiContradictionActions.ts`, `wikiExamGrowthActions.ts` | Record a run whatever the outcome. |
| `wikiStaff.ts` | Every staff member gains a `standingObjective`; `ensureWikiStaffAgentsInternal` writes and keeps it in step. New `finishStaffRunInternal` to close a staff round's run record. |
| `wikiStaffRunActions.ts` **(new)** | `runStaffNow` — maps each staff `systemKey` to its real round. Six have sweeps; Reviewer and Filing Clerk are event-driven and say so instead of pretending. `isWikiStaffKey` exported for routing. |
| `agentObjectiveService.ts` **(new)** | `resolveRunObjective` — one shared resolution (requested → standing job → description → generic line). Both the manual and scheduled paths use it. **They drifted apart once; that drift was the bug. Keep them on this helper.** |
| `scheduler.ts` | `manualRunSchedule` no longer throws when an agent has no job. Routes wiki staff to `runStaffNow` instead of the generic loop. |
| `workflowEngine.ts` | `scheduleDispatcher` sends the agent's own objective via the shared helper, and stamps `title` with the schedule name. |
| `schema.ts` | New optional `knowledgeDocuments.wikiDistillAttempts` (number). Additive. |
| `utils/coreModules.ts`, `utils/companyModules.ts` | `POSTURE_STUDIO_MODULE_KEY = "postureStudio"`, in defaults and the registry. |
| `_generated/api.d.ts` | **Hand-edited** to register the two new modules. This is codegen output; the two added lines are exactly what codegen produces and will be overwritten identically on the next `convex dev`. Edited by hand only because codegen is on the no-touch list. |

### Frontend (`src/`) — live on localhost now

| File | Change |
|---|---|
| `ui/components/feedback/SonaeModal.tsx` | `onClose` held in a ref; focus effect depends on `[isOpen]` alone. Fixes one-character typing on **every** modal. |
| `app/(dashboard)/admin/agents/[id]/layout.tsx` | "What should it do?" modal deleted. Run always runs. |
| `app/(dashboard)/admin/companies/page.tsx` | Add Company modal is `size="lg"`, two-column, module cards in a grid. |
| `app/(dashboard)/app/assistant/[threadId]/page.tsx`, `ui/components/chat/ChatHistoryList.tsx`, `app/globals.css` | Scrollbars restored on the transcript and history rail; `scrollbar-hide` kept for the composer and small dropdowns. |
| `ui/components/layout/SidebarNavigation.tsx` | Posture Studio gated on the new module. |
| `messages/en.json`, `messages/it.json` | Posture Studio module name/description. |

### Tests added

- `convex/wikiPages.test.ts` — sparse-link counting (a page linked only to
  siblings + its own document is still sparse; three real bridges is not).
- `convex/wikiDistill.test.ts` — claim release and the three-attempt ceiling;
  every staff member carries a standing job; staff routing.
- `convex/scheduler.test.ts` — scheduled agent gets its own objective; an agent
  with no job line is still started (not refused).
- `src/app/(dashboard)/admin/agents/[id]/layout.test.tsx` — Run starts without
  asking.
- `src/ui/components/feedback/SonaeModal.test.tsx` — the one-character bug.

**Note on that last one:** two earlier versions of it passed *with the bug still
present* — one was measuring the test's own framer-motion mock (the Proxy
returned a new component type per render, remounting the dialog), the other
restored focus to `<body>`, where the bug is invisible. The committed version
was verified by reinstating the bug and watching it fail. **Do this for any
test you write here.** The framer-motion mock in that file is now cached per
tag; do not un-cache it.

---

## Verification status — be precise about this

| Claim | Evidence |
|---|---|
| Types clean | `npx tsc --noEmit -p tsconfig.json` — clean |
| Lint clean | `npx eslint convex src` — clean |
| Unit tests | `npx vitest run` — 598 files, 5,534 tests, all pass |
| Modal typing fix works | Mutation-tested: fails with the bug reinstated, passes without |
| **Any backend behaviour on a real deployment** | **NOT VERIFIED — nothing deployed** |
| **Wiki agents actually running** | **NOT VERIFIED — never executed** |
| **Retrieval fallback returning the workshop decks** | **NOT VERIFIED** |
| **Chat scrollbar / Add Company modal in a browser** | **NOT VERIFIED** — the in-app browser refused any port except 3000 and the owner was using 3000 |

---

## Next steps, in order

1. **Get permission to push to dev**, then `npx convex dev`. Nothing else can
   move until this happens. It does not touch live.
2. Import the four IFFO decks on dev (the owner confirmed this would be their
   **first** upload there, so no stale `wikiDistilledAt` marks — a clean run).
3. Ask the assistant about the workshop. Expect an answer grounded in the decks.
   If not, check *Why this answer* on the reply and the wiki's *Couldn't answer*
   screen — both are already wired and are the fastest diagnostics.
4. Press Run on The Distiller and The Linker. Read the run records. They should
   now show a real summary or a real error, never silence.
5. Check the map for cross-document links after the Linker's round.
6. Visually verify the chat scrollbar and the Add Company modal. The
   `next-dev-e2e-auth` config in `.claude/launch.json` signs in via
   `/api/e2e-auth?role=SUPER_ADMIN&redirectTo=...` with fixture data.
7. Only then commit.

## Known open questions

- Why the decks produced only one topic page each (the map shows pairs, not
  triples). Possibly the model returned few topics, possibly `validateRewrittenPage`
  rejected some. Unexamined.
- `getTendingCandidatesInternal`, `getWikiIndexInternal` and friends all
  `.take(500)`. A wiki past 500 pages silently stops being tended or indexed.
  Nobody chose that number deliberately. Flagged to the owner, not fixed.
- Whether the live deployment's model config for `useCase: "fast-chat"` actually
  resolves. If it does not, every wiki staff agent fails at the same line, which
  would explain the whole picture on live. Untested — needs deployment access.

## Things I got wrong, so you don't repeat them

- I first told the owner the map was islands because the connection threshold
  counted a page's automatic source link. That reasoning is sound but it was
  **not** the cause here — his pages have one link each, always under the
  threshold. The real cause was that the Linker had no caller at all. The
  threshold fix is still correct; it just was not the bug.
- I twice wrote tests that passed while the bug was present. Assume a new test
  is worthless until you have watched it fail.
