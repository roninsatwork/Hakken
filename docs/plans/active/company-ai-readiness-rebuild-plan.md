# Company AI — rebuild the readiness screen

**Started 2026-07-26.** The screen at `/admin/companies/[id]/ai` is being
replaced, not polished. Anthony's instruction: none of the current screen
remains.

The idea is worth keeping — one place that says whether a company's AI is set up
properly and what to fix first. Nothing else in the product answers that without
opening nine screens. The execution has to go.

---

## What is actually wrong

### The headline number does not measure what the screen shows

The page shows nine tiles. The percentage is computed from **five** areas —
evals, drift, skills, memory, widget gate — in `scoreAreas`
(`convex/companyReadiness.ts:65-73`), dividing by `areas.length`, which is 5
(`:134-176`).

Knowledge, Instructions, Model Routing, Widget and Activity are rendered but
contribute nothing. A company with no knowledge documents, no system prompt, no
widget and completely broken model routing scores **100%** so long as it has one
approved memory and clean evals, skills, drift and widget gate.

Worse, the reasons printed under the number come from a *different* computation:
`readinessScore` reads the server's five areas (`ai/page.tsx:592`) while
`priorityReasons` is derived from the nine client tiles (`:608-619`). That is
why the panel says "Model routing is incomplete — fix this first" about
something with zero weight in the number beside it.

`localBlockers` and `localWarnings` (`:587-588`) are computed from the tiles and
discarded on the next line. `fallbackReadinessScore` (`:589-591`) is dead —
`readinessSummary` is inside the loading gate, so the server score always wins.

### The top item is a false alarm that cannot be cleared

`REQUIRED_MODEL_USE_CASES` (`ai/page.tsx:75`) is a hand-copied literal of seven
jobs. The canonical list, `DEFAULT_MODEL_USE_CASES`
(`convex/aiModelService.ts:62-73`), has nine. The copy silently drops
`fast-chat` and `transcription` — both live in production code — so if either
broke, this screen would report all clear.

The seventh entry is `embedding`, and it can never pass:

- `setDefaultModel` skips any use case the chosen model cannot serve
  (`aiModels.ts:986-994`), and `canProviderServeUseCase` restricts embedding to
  Google Vertex (`aiModelService.ts:150-156`).
- Embedding models carry `supportedUseCases: ["embedding"]`, so an embedding
  model can never be the platform chat default. The two conditions are mutually
  exclusive — the bulk path cannot write a global embedding default.
- Provider sync seeds seven use cases and omits embedding
  (`aiModelsActions.ts:39`, `openrouterProviderService.ts:127`).
- The runtime does not need one: `resolveEmbeddingModelConfigForExecution`
  (`aiModels.ts:888-928`) falls back to a built-in model with
  `source: "failsafe"`. Document search works.

So the tile is red for a use case that functions, the check is binary
(`:391` — 6/7 is as red as 0/7), and it links to a screen that offers no way to
fix it.

The same expression is wrong in both directions elsewhere: it tests
`model.isEnabled` only, while the runtime tests `isModelServable` against
disabled providers (`aiModels.ts:626-660`) — so a default on an enabled model
behind a switched-off provider reads as configured. And it never consults
`fallbackModelId`, which `getUseCaseDefaultModel` does (`:640-643`), so a use
case that resolves via its fallback reads as broken.

### Numbers that are not what they say

| Shown | Actually |
|---|---|
| Activity count | Saturates at 500 (`chatAdmin.ts:14`, `:76`) and is labelled a total |
| Drift count | Saturates at 100 (`companyReadiness.ts:85`) |
| Eval pass rate | Excludes never-run cases (`companyEvals.ts:403`) — 1 of 50 run and passing shows 100% |
| Eval totals | Server returns `isPartial` at 2000 cases (`:407`); the page never reads it |
| Knowledge "chunks available for retrieval" | Capped at 12 per document (`knowledge.ts:24`, `:607`) |
| Instructions badge | Reads "Set" from prompt length ≥ 80 chars while the status word reads "Needs review" from a different predicate (`ai/page.tsx:382-383`) |
| Skills "0/0" | Denominator is a count of bound skills; with none bound it reads 0/0 and "Needs review" |

`ai-checks-plan.md` already calls this area "actively harmful rather than merely
unfinished" and names the widget gate specifically: `PASS` when no widget
blocker evals exist meant the gate guarding the public widget reported passing
precisely when nothing had been checked. That one has since been fixed to WARN
— but WARN still scores half a mark, so an unproven area contributes the same
as a half-good one.

### The shape and the cost

- 926 lines in one file. It imports **no** shared admin component — not
  `AdminPageHeader`, `AdminTableShell`, `AdminSaveError`. Three components and
  ten tone/label helpers are declared inline.
- The NEEDS WORK / HEALTHY / QUIET grouping is not honest: `getHealthGroup`
  (`:169-174`) files a `review`-state **Skills** or **Activity** tile under
  QUIET by name, while still letting Skills appear in the top-three "fix these
  first" list. Low-attention column, high-attention ranking, same state.
- **13 queries fire on mount**, all inside one all-or-nothing loading gate
  (`:306-319`). Worst case ≈ 27,000 document reads. Active eval cases are read
  three times, skill bindings four times across five surface types (20 indexed
  `.take()` calls), approved memories three times, unresolved drift twice.
- One query (`chatAdmin.getOffsetPaginatedCompanyThreads`) does a `db.get` per
  thread to build 15 rows the page never renders — it reads `.totalCount` only.
- **No test file.** None of the arithmetic above is covered.

### It is a façade over screens that already own the data

All nine tiles link out. Two link to the same place (Evals and Drift both go to
`/ai/evals`). Five destinations under `/ai/*` are one-line re-exports of pages
that already exist. The Knowledge tile and the knowledge manager issue the same
`getQualitySummary`; the Evals tile and the evals page issue the same
`companyEvals.getSummary`.

The only thing this page adds that cannot be got elsewhere is the roll-up and
the ranking — and both are wrong.

---

## Decisions taken

**Inheriting the platform setup is not a fault.** *(Anthony, mid-build — this
reframes the screen.)* A company does not need its own AI configuration. It
inherits the platform's, and for most companies that is the right answer
forever. The old screen treated every empty area as a gap: no company
instructions, no company memories, no company skills all read amber and dragged
the score down. That is the same fault as the embedding false alarm — reporting
a problem where there is none — and it is the reason a well-configured workspace
reads 60%.

So an area is in one of three states, and only one of them is a problem:

| State | Meaning | Blocks launch? |
|---|---|---|
| **Not configured** | Nothing set here; the platform's setup is used. Normal. | Never |
| **Set for this company** | Deliberately overridden here, and working. | Never |
| **Needs attention** | Something set here is broken, unsafe, or unproven. | Yes |

Not configured is **informational, not a warning**. It is not a step anyone has
skipped and it is not a blocker to launch — a company can go live having
configured none of this. The screen must never colour it, count it, rank it in
"fix these first", or imply it should be filled in. The only thing that can hold
a launch is something set here that does not work.

"Needs attention" is reserved for things a reader must act on: a skill switched
on but missing the tools it requires, a high-risk skill with no approval policy,
a must-pass check failing, a company override pointing at a model that cannot
run, unresolved drift since the last check. Absence is never one of them.

A company with nothing configured therefore reads **Ready**, which is the truth.

**No percentage.** A percentage needs a denominator, and every denominator here
has been quietly wrong. It is replaced by a state — *Ready* / *Needs attention* /
*Not ready* — and a count taken from the list on screen: "3 of 8 areas need
attention". A reader can verify that by counting. Nobody can verify 60%.

**One source, one list.** A single server query returns the areas. The page
renders them and computes nothing. Every area shown is counted; every area
counted is shown. The current split — server score, client tiles — is the root
of the contradiction and cannot survive.

**Nothing unfixable is reported as a failure.** An area is only red if a reader
can do something about it on a screen this page links to. Model routing is
judged by what the runtime would actually resolve, not by whether a config row
exists — so a job served by a documented failsafe passes, and says so.

**"Not checked" is its own state, never a pass and never a failure.** The eval
pass rate stops hiding never-run cases; an area with nothing proven says
"nothing checked yet" rather than scoring half a mark.

**Capped counts are labelled.** Anything that saturates prints `500+`, or is not
shown.

**Activity is dropped from readiness.** How many conversations a company has had
is not a measure of whether it is set up. It belongs on the dashboard, which
already has it.

**Widget and widget gate merge.** Two overlapping areas asking about one thing.

**Eight areas:** Instructions, Knowledge, Model routing, Widget, Memory, Skills,
Evals, Drift.

**The three-column grouping goes.** Ranked list of what needs attention, then
one table of everything. Order carries the priority; a column heading that lies
about attention does not.

---

## Phases

### Phase 1 — One honest server answer

New `getCompanyAiReadiness` in `convex/companyReadiness.ts`, returning:

```
{
  state: "READY" | "NEEDS_ATTENTION" | "NOT_READY",
  areas: Array<{
    key, label,
    status: "PASS" | "WARN" | "BLOCK" | "NOT_CHECKED",
    summary: string,      // one plain sentence, already written for a reader
    evidence?: string,    // the detail, only where there is one
    href: string,         // where it is fixed
  }>
}
```

All eight areas computed here, from the rollups the existing summaries already
maintain. `buildReadinessSummary` is extended rather than duplicated — the three
separate reads of eval cases and four of skill bindings collapse into one pass.
Target: **one query for the page**, replacing thirteen.

`scoreAreas` is deleted. State derives from the areas: any `BLOCK` ⇒
`NOT_READY`; any `WARN` ⇒ `NEEDS_ATTENTION`; else `READY`. `NOT_CHECKED` never
counts toward `READY`.

### Phase 2 — Model routing judged by what actually runs

A shared helper answering, for one company and one use case: *would this
resolve at runtime, and to what?* It uses `isModelServable` and the
`fallbackModelId` chain — the same rules as `getUseCaseDefaultModel` — over the
canonical `DEFAULT_MODEL_USE_CASES`, not a hand-copied subset.

A job served by a documented failsafe (embedding) reports `PASS` with the
failsafe named in its evidence line. `REQUIRED_MODEL_USE_CASES` is deleted; the
literal is what let the list drift in the first place.

### Phase 3 — The screen

`ai/page.tsx` replaced. Shared components throughout, as the two screens rebuilt
earlier this session now use: `AdminPageHeader`, `AdminTableShell`,
`AdminTableLoadingRow`, `AdminTableEmptyRow`.

1. **Header** — company name, one sentence.
2. **State line** — "Needs attention · 3 of 8 areas", the count taken from the
   table below it.
3. **Fix these first** — only the areas needing attention, worst first, each one
   sentence plus a link to where it is fixed. Nothing when everything passes.
4. **All areas** — one table: Area / What it means / State / Where to fix. Every
   area, including the passing ones. Evidence sits under the areas that have
   something to show, not behind four collapsed panels.

The 926-line file, its three inline components and ten tone helpers all go.
Loading happens inside the table; the header and state line draw immediately.

### Phase 4 — Tests

New `ai/page.test.tsx` — the screen has never had one:

- the state count equals the number of areas the table shows as not passing
- **a company failing an area that is not in the score cannot read as ready** —
  the regression guard for the split-brain fault
- a `NOT_CHECKED` area does not count as a pass
- each area links to the screen that fixes it

Extend `convex/companyReadiness.test.ts` (two cases today):

- **embedding, served only by its failsafe, reports PASS** — the guard for the
  permanent false alarm
- a use case whose primary model is disabled but whose fallback resolves reports
  PASS
- a use case on an enabled model behind a **disabled provider** reports BLOCK
- `fast-chat` and `transcription` are included in the check

Both regression guards to be verified by reverting the fix and confirming the
test fails, as with the three screens rebuilt earlier this session.

---

## Risk

Companies that read 60–100% today will read differently, and some will look
worse. That is the point: the current number ignores knowledge, instructions,
model routing and widget entirely. Before this ships, the new state should be
computed for every existing company and the before/after listed, so nobody is
surprised by a workspace that "regressed" overnight when in fact it was never
measured.

The reverse also applies: model routing will stop showing 6/7 red, because the
job it is failing on works. That is a false alarm being withdrawn, not a check
being weakened — the same phase adds two use cases the check never covered.

---

## What was delivered

All four phases. The 926-line page is gone, replaced by ~180 lines using the
shared admin components. Thirteen queries became one.

The reframing arrived mid-build and changed the outcome more than any other
decision: on the live Ronins workspace the screen went from **60% / NEEDS
REVIEW** to **Ready · nothing needs attention**, with knowledge, widget and
instructions reading "Set for this company" and the rest "Not configured". The
old number was never measuring what it displayed.

Model routing now reads "All 9 jobs use the platform's model" where it used to
read a red 6/7. Two of those nine were never checked before.

Both regression guards were verified by reverting the fix and confirming the
test failed: the fallback-served job, and the inheriting company reading Ready.

**Deleted, on Anthony's instruction:** `getReadinessSummary`,
`getReadinessHistory`, `recordReadinessSnapshot`, `buildReadinessSummary`,
`scoreAreas`, the `ReadinessState`/`ReadinessArea` types and the
`companyReadinessSnapshots` table — 213 lines of server code plus the schema
table. The old page was their only caller.

Convex accepted the schema change and dropped the table's index without
complaint, which it would not have done had any snapshots been stored, so no
data was lost.

The two existing tests were rewritten against the new query rather than deleted,
so the behaviour they covered is still guarded: drift appearing after company AI
changes and clearing once the checks pass, and a failing must-pass widget check
being surfaced. In the new vocabulary the second reports under `checks` — the
separate "widget gate" area is gone, because one thing was being asked about in
two places.

`recordCompanyAiDriftEvent`, `resolveCompanyAiDriftEvents` and
`resolveDriftEvents` are untouched: drift recording is used across the product,
not just by this screen.

## Verification

Per `AGENTS.md`: `npm run verify:env`, `npm run lint:all`, `npm run check`,
`npm run build`, `git diff --check`. Plus the new page test, the extended
readiness tests, and the screen driven in the browser against real company data
— one company with everything passing, one with a genuine failure, one with
nothing checked.
