# Audit Remediation — the plan for Alessandro's 2026-08-24 review

**Started 2026-08-25.** Alessandro reviewed the whole codebase on 2026-08-24
(commit `8b8954eed`) and scored it 8/10. His report is
[`review/codebase-review-2026-08-24.md`](../../../review/codebase-review-2026-08-24.md)
and it ships with thirteen ready-to-run instruction files in
[`review/prompts/`](../../../review/prompts/). This plan is how all of it gets
done. It is written so that a fresh model with no memory of this conversation
can pick it up and execute it end to end.

**Read this file first, then `AGENTS.md`, then the prompt file for the work
package you are on. The prompt files are the detailed spec for each package;
this plan is the orchestration layer: order, dependencies, house rules,
verification, and progress reporting. Where this plan and a prompt file
disagree on *ordering or scope boundaries*, this plan wins. On *technical
detail within a package*, the prompt file wins.**

---

## Non-negotiable working rules

0. **Posture Studio is untouchable** (Anthony, 2026-08-26: "don't touch the
   posture studio"). That is the movement area under its customer-facing name:
   `src/app/(dashboard)/demos/**`, `convex/movements.ts`, the movement libs and
   the sidebar block gated on `POSTURE_STUDIO_MODULE_KEY`. Every remaining
   package excludes those paths — the demo freeze in `AGENTS.md` now carries his
   direct instruction on top. Mechanical import-path fixes that keep the build
   green remain allowed, nothing else.

These come from standing agreements with Anthony (the owner). Violating them is
worse than not doing the work.

1. **Never push.** Every push to `dev` runs a metered CI bill. Commit locally,
   one commit per work package (or per batch inside a large package), and stop.
   Anthony decides when anything is pushed. Never push, never open PRs, never
   merge.
2. **Respect his uncommitted work.** If the working tree contains changes you
   did not make, do not commit them, do not stash them destructively, do not
   "clean up". Work around them; if they genuinely block a package, stop and
   ask.
3. **Commit style:** match the existing log — `type(scope): plain-english
   sentence`, lower case, e.g. `fix(convex): errors users can actually read`.
   End commit messages with the Claude co-author line if you are a Claude
   model.
4. **Build only what the package says — but do not walk past a fault.**
   No opportunistic extras: a package's scope is not an invitation to redesign
   the area around it. But Anthony's standing instruction (2026-08-25) is that
   an *obvious, contained fault* found while working gets **fixed in the same
   effort**, not parked in a summary — "no point leaving obvious issues on the
   table". The test is whether a competent colleague would call it a bug:
   - **Fix it now, and log it** in "Found in passing" below: a wrong result, a
     user-visible regression, a helper that fails its own stated contract, a
     stale doc pointing at a file you just moved. Small, provable, testable.
   - **Raise it first**: anything that changes product behaviour, touches the
     authz builder layer, needs a baseline or allowlist to move, or is big
     enough to be its own package. Describe it and wait.
   When in doubt, fix the small thing and say so plainly in the next update.
5. **Allowlists and ratchets only shrink.** Every guard baseline in this repo
   (`scripts/*-allowlist.json`, drift-test baselines, coverage floors) is
   shrink-only by design. Never add an entry to make your change pass. If a
   package legitimately needs a baseline change, the prompt file says so
   explicitly.
6. **No code comments** explaining what you changed or why it is correct.
   Comments only for constraints the code cannot express (the prompts flag the
   one exception: the oklab/html2canvas footgun in the chart palette).
7. **Verify before claiming.** "Done" means the package's acceptance checks
   ran and passed, and your summary names exactly what was tested and what was
   not. Anthony checks, and catches overstatement.
8. **Report progress in percent.** Every progress update to Anthony includes an
   overall percentage, computed from the weights table below. Update the
   status table in this file as you go — it is the single source of truth for
   where the effort stands.
9. **Write to Anthony in plain English.** He is not technical. Verdict first,
   then the reason, no file paths or jargon in his summaries. (Full technical
   detail belongs in this file and in commit messages, not in chat.)
10. **Anthony is red/green colour blind.** If any of this work touches status
    colours or charts, never signal with green-vs-red alone; use blue/yellow,
    brightness contrast, or text labels.

---

## The gate that proves each package

After every package (and every batch inside the big ones):

```
npm run check
```

must pass — it runs guards, lint, typecheck, and the unit suites. Individual
packages add their own checks (named per package below and in the prompt
files). Run the baseline **once before starting anything** and record the
result; if the tree is already red, stop and report rather than building on a
broken base.

For UI-affecting packages, also verify in the running app (dev server on
localhost) before calling the package done — screenshots or a driven browser
check, never "it should work".

---

## The five phases

The 14 packages group into five phases. Each phase ends at a natural
checkpoint: the tree is green, the phase's packages are committed, and a
plain-English progress report (with the overall percentage) goes to Anthony
before the next phase starts. A phase boundary is also a safe place to stop
entirely if credits or time run out.

| Phase | Name | Packages | Days | What Anthony gets at the end |
|---|---|---|---|---|
| 1 | Trust the pipeline | WP01, WP11 | 2 | A green build finally means what it says (pending his two secrets); the tangled mega-test is split so later phases edit it safely |
| 2 | Backend correctness | WP02, WP05, WP07 | 6.5 | Users see real error messages instead of "Server Error"; analytics numbers can no longer silently truncate at scale; the busiest data surfaces stop leaking future fields |
| 3 | Frontend structure | WP13, WP04, WP03, WP06 | 5.5 | The four oversized files are broken into maintainable pieces; every screen handles failures the same house way; customer pages no longer reach into admin internals |
| 4 | Consistency & polish | WP08, WP10, WP09 | 3 | The last English-only pages speak Italian too; one shared chart palette and one set of formatters; a naming rule that stops the three-way drift |
| 5 | Housekeeping | WP12, WP14 | 2 | A readable scripts list; the small leftover findings swept; the one open design question written up for his decision |

Phases 1–2 (8.5 days) cover everything Alessandro rated High or Medium
severity on the backend and pipeline — the "must do" core. Phases 3–5 are
worth doing but can pause indefinitely without risk.

---

## Execution order

Alessandro's priority order is right about *importance* but wrong about
*sequence* in four places where packages touch the same files. The order below
avoids doing work twice. Do the packages strictly in this order unless a
dependency note says two are independent.

| Step | Package | Prompt file | Weight | Est. days | Depends on |
|---|---|---|---|---|---|
| 1 | WP01 — Real-auth e2e in CI | `review/prompts/01-real-auth-e2e-in-ci.md` | 8% | 1.5 | Anthony (secrets) |
| 2 | WP11 — Split quality-drift test | `review/prompts/11-split-quality-drift-test.md` | 4% | 0.5 | — |
| 3 | WP02 — Backend appError migration | `review/prompts/02-convex-app-error-migration.md` | 13% | 2.5 | — |
| 4 | WP05 — Kill `.take(10000)` analytics | `review/prompts/05-fix-take-10000-analytics.md` | 11% | 2 | WP11 |
| 5 | WP07 — Return validators | `review/prompts/07-convex-return-validators.md` | 10% | 2 | WP02 (soft) |
| 6 | WP13 — Consolidate atoms folder | `review/prompts/13-consolidate-atoms-folder.md` | 2% | 0.5 | — |
| 7 | WP04 — Decompose god-components | `review/prompts/04-decompose-god-components.md` | 15% | 3 | WP13 |
| 8 | WP03 — useAdminAction adoption | `review/prompts/03-use-admin-action-adoption.md` | 9% | 1.5 | WP04 (KnowledgeManager only) |
| 9 | WP06 — Fix app→admin imports | `review/prompts/06-fix-app-admin-cross-imports.md` | 4% | 0.5 | WP13 |
| 10 | WP08 — i18n for pre-kit /app pages | `review/prompts/08-app-area-i18n.md` | 8% | 1.5 | WP03 |
| 11 | WP10 — Shared palette + formatters | `review/prompts/10-shared-palette-and-formatters.md` | 5% | 1 | WP08 |
| 12 | WP09 — File-naming convention ratchet | `review/prompts/09-file-naming-convention.md` | 3% | 0.5 | WP13, WP04, WP06 |
| 13 | WP12 — Movement scripts CLI | `review/prompts/12-movement-scripts-cli.md` | 4% | 1 | — |
| 14 | WP14 — Small-findings sweep | (this file, below) | 4% | 1 | everything else |

Weights sum to 100 and are effort estimates; report
`sum(completed weights) + partial credit on the in-flight package` as the
overall percentage.

### How long this is: about 19 working days

The day estimates above total **19 working days** of focused model sessions,
including each package's verification runs — call it **about four calendar
weeks**, since real weeks also contain Anthony's review time between packages,
the wait on the WP01 secrets, and the usual interruptions. The packages are
sequential (see the parallelism warning below), so more sessions per day
shortens the calendar but the day count is a floor, not padding: the two
biggest packages (WP04 decomposition, WP02 error migration) are big because
they touch hundreds of sites behind a full test suite that must stay green
after every batch.

If time is short, the order above is also the value order for stopping early:
completing just steps 1–5 (~8.5 days) captures everything Alessandro rated
High or Medium severity on the backend and the pipeline; everything after
step 7 is polish and consistency work that can pause indefinitely without
risk.

### Why this order differs from Alessandro's numbering

- **WP11 before WP05.** WP05 shrinks the broad-read allowlist that currently
  lives inside `src/quality-drift.test.ts`; WP11 moves that allowlist to its
  new owning test file. Splitting first means WP05 edits the allowlist once,
  in its final home, instead of editing it and then moving the edits.
- **WP13 before WP04, WP06, and WP09.** WP13 moves `src/ui/components/screens/` into
  `src/ui/components/screens/` and writes down the placement rule. WP04
  extracts new UI files and WP06 promotes shared components — both need that
  rule settled first so nothing lands in a folder that is about to disappear.
  WP09 freezes a file-naming baseline, which should happen after the moves,
  not before, or the baseline is stale on arrival.
- **WP04 (KnowledgeManager) before WP03.** `KnowledgeManager.tsx` (1,453
  lines) appears in both packages: WP04 splits it, WP03 migrates its error
  handling. Splitting first means the error migration happens in small
  extracted files, not in the monolith that is about to be dismantled. Within
  WP03, therefore: **skip KnowledgeManager until its WP04 decomposition has
  landed**, then migrate the extracted pieces like any other page.
- **WP08 before WP10.** Both rewrite the pre-kit `/app` pages
  (`app/reports`, `app/sales-data`). i18n first (it rewrites the JSX
  strings), palette/formatter dedupe second (it touches the same files more
  lightly). Doing them in this order avoids merge churn in the same lines.
- **WP02 before WP07 (soft).** Return validators sit next to error paths in
  the same Convex functions; converting errors first means WP07 reads settled
  code. They can run in either order if needed, but not in parallel.
- **WP01 first despite needing Anthony** — start it immediately because it has
  a human dependency (see below); do the model-only steps, then park it and
  continue down the list while waiting.
- **WP12 is independent** and can slot anywhere; it is late only because it is
  low value relative to the rest.

### Parallelism warning

Packages in this repo overlap on files more than the names suggest. Do **not**
run two packages concurrently unless the table shows no shared dependency and
you have verified they touch disjoint files. Sequential is the safe default.

---

## The one thing that needs Anthony: WP01 prerequisites

WP01 (real-auth e2e in CI) is the most important package and the only one a
model cannot finish alone. It needs:

1. **A dedicated Convex test deployment** — never production, never his live
   staging. Creating one may require his Convex account access.
2. **Two GitHub repository secrets** (deployment URL + deploy key) that only
   he can add in GitHub settings.

Do everything model-side first: the workflow job, the `@real-auth-smoke` spec
tagging, the seeding/cleanup wiring, local verification against a local or
dev deployment, and the documentation in `docs/developer/deployment.md`
naming the secrets. Then give Anthony a short plain-English checklist of the
two things only he can do, and move on to step 2. Mark WP01 "blocked on
Anthony" in the status table, not "done".

Remember: the new CI job must run **only on PRs into `main`** — every CI
minute is metered, and Anthony pushes to `dev` constantly.

---

## WP14 — Small-findings sweep (no prompt file; spec is here)

Alessandro's report contains low-severity findings that got no prompt file.
Do these last, as one package, smallest-first:

1. **Doc drift:** `docs/developer/frontend.md` still documents
   `src/ui/components/header.tsx` / `footer.tsx`, which no longer exist.
   Remove or correct those sections. Grep the docs for other references to
   files that no longer exist while there.
2. **Redundant coverage runs:** in the `main`-PR path, both the `checks` and
   `full-gate` CI jobs run the coverage suite on the same commit. Deduplicate
   so it runs once, without weakening what blocks the merge.
3. **Coverage ratchet-up is manual:** `coverage-thresholds.json` carries
   `nextRatchet` values nothing reads. Extend the coverage gate script so
   that when actual coverage exceeds `nextRatchet`, the gate *tells you* the
   floor can be raised (a loud printed nudge is enough — do not auto-edit the
   thresholds file).
4. **knip is half-blind:** `knip.json` has `ignoreDependencies: [".*"]`, so
   unused/undeclared dependency detection is fully off. Try narrowing it to
   the actual offenders; if the noise is unmanageable, leave it and record
   why in a line in `docs/developer/index.md`'s tooling notes.
5. **`softQuery` builder (judgement call — propose, don't build):** ~41
   `public*` Convex declarations are really "authenticated-or-null" soft
   queries with copy-pasted `reason:` strings. Alessandro suggests a
   dedicated `softQuery` builder to restore the semantic distinction. This
   changes the authz builder layer, which is the crown jewel of the codebase
   — so write up the proposal (builder signature, migration list, what the
   enforcement test change looks like) as a short section appended to this
   file, and leave the decision to Anthony. Do not implement unasked.
6. **`<html lang="en">` never binds the resolved locale** (self-documented
   debt in the layout). Fix if it is a genuinely small change in the root
   layout; skip with a note if it fights Next.js static rendering.

Explicitly **out of scope** (seen in the review, deliberately not work):
client-component density / RSC adoption (structural given Convex, not debt),
anything inside the frozen movement demos (`src/app/(dashboard)/demos/**`),
and the `console.log` in `WidgetIframeClient.tsx` if it turns out to be the
widget bridge's intentional logging — check before deleting.

---

## Waiting on Anthony

**Decided 2026-08-25: a file's frozen raw-button count splits when the file
splits.** Anthony said yes. The rule protects against new hand-drawn buttons
appearing, and a split creates none — the same buttons move, and the
platform-wide total must come out identical either side of the change. So when
WP04 extracts a block, that block's buttons move to the new file's entry and come
off the original's, and the sum is checked before and after.

This is not a licence to grow the list. Adding an entry for a button that did not
already exist stays forbidden, and the totals line printed by
`npm run check:screen-kit` is the evidence: it read 295 across 120 files before
this work and must still read 295 after, only spread differently.


**The stalled reply is half fixed (commit ea75812fd), and the half that remains
is worth stating plainly.** The reader is no longer left hanging: staleness now
measures silence rather than age, so an abandoned reply says so after ninety
seconds instead of ten minutes, and a long healthy run can no longer be wrongly
cut off either.

What has *not* been established is why the run died in the first place. The
message ended mid-clause with no failure notice, and `generateSonaeResponse`
appends one from its catch — so the action did not throw, it stopped. That points
at the action being killed rather than failing, which would be a Convex action
limit or a broken provider stream, but one observation is not a diagnosis and
reproducing it would mean provoking the failure deliberately. The fix above means
a reader is told either way, which is what made it urgent; finding the cause is
no longer urgent and wants a real reproduction rather than a guess.

**Two "Real auth smoke" conversations are left on the dev deployment.** The
cleanup mutation added by WP01 only exists in local code — the dev deployment
runs whatever was last pushed, so `auth:local:cleanup` had nothing to call. CI is
unaffected: that job deploys the functions before it seeds. They are under
`local-user@sonae.test` and clear the moment the functions next deploy and the
command is run.

---

## Found in passing

**The wiki sweeps' tests flake under full-suite load — now a pattern, not a
one-off.** Two different files failed one full-suite run each on 2026-08-26
with convex-test's "did not complete after 10000 timer pumps", and each passed
immediately in isolation: `wikiDistillActions.test.ts` (during WP04) and
`wikiTendingActions.test.ts` (during WP09). Both are wiki sweep dispatchers
driving scheduled-function chains through `finishAllScheduledFunctions`. Nothing
either package touched references them. Two strikes says the sweeps'
scheduled-function chains are load-sensitive in convex-test — worth one focused
look at how their dispatchers reschedule, rather than a bigger timeout, and
worth knowing about before anyone trusts a red CI run at face value.

Faults noticed while doing something else, fixed under rule 4 rather than left.
Each row says what was wrong, what it would have cost a user, and where it was
fixed. Add to this as you go.

| Found during | The fault | What a user would have seen | Fixed |
|---|---|---|---|
| WP02 | `getErrorMessage` in `convex/utils/lang.ts` returned `error.message` raw. A `ConvexError`'s `.message` is the serialised `{code, message}` payload, so the helper whose entire job is "the human-readable message" was handing back machine text to all 28 of its callers — every one of which stores or displays the result. | A workflow log, tool result, webhook record or job ledger entry reading `{"code":"UPSTREAM_FAILURE","message":"..."}` — and, where the payload nested, that JSON quoted inside more JSON — instead of a sentence. | One line in the helper, so all 28 call sites are correct at once. `getRuntimeErrorMessage` in `convex/workflowRuntimeService.ts` had the same bug and the same fix. Caught by `convex/workflowRuntime.test.ts`. |
| WP02 | `normalizeOptionalJsonObject` in `convex/agentEvalFixtures.ts` compared `error.message` to a literal sentence to decide whether to re-throw. | Every malformed-object error reported itself as "JSON is invalid", which is a different and wrong diagnosis. | Reads the payload through `appErrorMessage`. |
| WP11 | Five live developer docs named `src/quality-drift.test.ts` for guards that had moved out of it. | A developer sent to a file that no longer exists. | Repointed at the file each guard actually lives in now. Historical plan files left alone deliberately — they are a record, not a pointer. |

---

## The softQuery builder (WP14 item 5 — approved by Anthony 2026-08-26, built, commit 88ce9f083)

**What Alessandro saw.** Twelve of the forty-one `public*` declarations carry
the identical copy-pasted reason: *"Returns an empty result rather than
throwing when the caller lacks a session or the required role… Role filtering
happens inside the handler."* These are not really public endpoints — they are
authenticated queries that deliberately soft-fail so screens can render an
empty state instead of an error. Calling them `public` blurs the register:
a reviewer scanning for genuinely unauthenticated surface has to read twelve
reasons to find the ones that matter (the widget, kiosk and sign-in paths).

**What was built (as proposed, with `allowRoles` instead of `minimumRole` —
the two role-gated doors each accept a *set* of roles, not a floor).**
`softQuery` and `softMutation` live in `convex/tenantFunctions.ts` between the
guarded and public builders. Each takes `reason`, `args`, optional `returns`,
`empty`, optional `allowRoles`, and a handler that receives the same resolved
identity ctx every guarded builder provides. No session, or a role outside
`allowRoles`, returns `empty` without the handler running.

**Thirteen doors migrated, not twelve.** In flight we found `getLatestRuns`
saying the pasted sentence in different words, and — better — that
`getQualitySummary`'s pasted reason was *false*: it promised empty-not-error,
but its scope helper threw for a caller with no session. Both migrated with
the rest. Every hand-rolled prelude is gone, every reason is now bespoke, and
the two role-gated doors (`getMyLoginsCount` on SUPER_ADMIN, `getRecentLogs`
on the governance read roles) declare it instead of hand-checking it. The
public register is down to 28 genuinely public declarations (from 41).

**Enforcement and proof.** Both builders joined the recognised list in
`authzEnforcement.test.ts` and soft surfaces must state a reason exactly as
public ones must. `convex/tenantFunctions.soft.test.ts` pins the behaviour
through real endpoints: no session is empty *and writes nothing*, the wrong
role is empty, a qualifying caller reaches the handler, a signed-in write
lands. Browser-checked signed in on governance (audit widget, plan badge) and
the agent knowledge screen (quality summary) — real data, no console errors.

## The review of the remediation (2026-08-26)

Anthony asked whether the packages marked done were actually done. Eight
independent readers were pointed at the fourteen packages and the prompt files
that specify them, each told to assume the claim was overstated and to prove it
against the code. Read-only: no builds, no suite, greps and reads and
`git show`.

**Two packages survived intact — WP11 and WP13. Every other package was
overstated, three seriously.** Weighted against the effort table, honest
completion is about **70%**, not the 100% reported.

The pattern is consistent and worth naming, because it will recur: *the work
was done and the proof was not*. Counts were taken with a grep narrower than
the claim it supported ("0 hand-rolled remain" measured two setter names, and
88 sites survive). Guards were written, reported as enforcement, and never
shown to fire — one matched nothing at all. Sites were "fixed" by lowering a
literal to a named constant, which the register scored as a fix because the
register matches the literal. And an allowlist grew, against a rule this file
calls non-negotiable.

What that means for the guards in this repo generally: **a guard that reads
files and finds no work must fail, or it is indistinguishable from one that
works.** Two of the reason tests, the analytics `getGlobalAnalytics` split, the
knowledge-delete confirmation check and the copy-catalogue matcher were all
silently reading nothing. Every guard added from here counts what it saw and
asserts that number.

Fixed during the review (commit d8468bb5a): the dead reason guards, the SSRF
diagnoses this effort swallowed, a red-and-green risk signal in a customer
report, the wrong message on a failed note delete, one hardcoded English
fallback, and four claims in prose that the code contradicted. Everything else
is recorded in the table below and left for Anthony to schedule — the larger
items are new work, not touch-ups.

Not re-verified by the review: anything needing a build or a live run. The full
gate was green after the fixes (697 files, 6,089 tests, exit 0).

---

## Per-package status

Update this table (and nothing else in this section) as work proceeds. States:
`todo`, `in progress`, `blocked on Anthony`, `done (commit <sha>)`,
`partial — see review`.

**Baseline recorded 2026-08-25:** `npm run check` green on `b6755c3c0` —
687 test files, 6,068 tests, exit 0.

| Package | State | Notes |
|---|---|---|
| WP01 real-auth CI | partial — see review | the five specs exist, are tagged, and passed against a real deployment in 15.7s on 2026-08-25. **The chat spec asserts the send, not the reply** — the indicator it waited for renders whenever the last message is the user's own (corrected in d8468bb5a; strengthening it needs a live run). Automation declined by Anthony 2026-08-26; job moved to manual (f8c852771). Untested: whether "Real Auth Smoke" is a required status check in GitHub branch protection — if it is, remove it there |
| WP11 split quality-drift | **done** (commit eba6cb1c4) | verified independently: 38 tests before and after with identical titles, 80 assertions both sides, nothing skipped, allowlist byte-identical. The one inaccuracy is the Found-in-passing row below — six references across four docs, not five |
| WP02 backend appError | partial — see review | true: zero plain `throw new Error(` outside the frozen demo, allowlist 92→2, CONFLICT added, every code a union member. Not true: **54 raw `ConvexError` throws named in the spec are untouched**; `SalesDataImportError` and two sibling Error subclasses still reach production as "Server Error" (sales spreadsheet import); 21 sites read `error.message` directly and bypass the helper, five of them storing or displaying the JSON; the NOT_YET_CONVERTED list is a plain Set with nothing enforcing shrink-only, and the guard is blind to every throw shape except the literal `throw new Error(`. One regression it caused is fixed in d8468bb5a |
| WP05 take(10000) | partial — see review | the nightly paging rebuild is real and proven (1,100 messages across pages, ceiling refuses rather than storing a short day). But **7 of the 13 removed sites were cosmetic** — `.take(10000)` became `.take(MODEL_CATALOG_LIMIT)` (2,000), still truncating, just invisible to a register that matches the literal. Register absolutes were wrong: 88→47, not 124→83 (the 41 delta is right). **Truncation still becomes stored truth in two places**: the snapshot's model catalogue prices missing models at the default and writes the cost permanently, and `recomputeLoginCounts` writes short counts after only a `console.warn`. Seven register entries carry a justification that is now false (they cite a 10,000 ceiling that is 250,000, and call three range-scoped reads today-scoped), so a busy period can still first appear as a short number on the platform overview, global AI costs and MAU. `getGlobalAnalytics` moved to `superAdminQuery` and the guard splitting on `query({` now reads an empty body. `moneyView.ts` task dropped |
| WP07 return validators | mostly done — see review | 41 of 41 public and soft surfaces declare a validator, the soft migration lost none of them, the claimed leak closures are real and field-shaped, and there is no `v.any()` in a returns position. Gaps: **`settings.ts` spreads the whole systemSettings row to unauthenticated visitors on the login screen** (pricing, sales contact, sender address, and every future column); 7 of 10 client-called `chat.ts` functions have no validator, `getThreads` among them, shipping whole thread rows including `widgetAccessTokenHash`; four more validators are whole-table spreads that widen with the schema. And **the builders pass `returns?: GenericValidator`, which collapses Convex's own type constraint** — so typecheck cannot catch consumer drift on any guarded surface, contrary to the claim. 12 httpActions have no returns slot at all |
| WP13 atoms consolidation | **done** (commit 19574af4f) | verified independently: folder gone, zero references in src/ or scripts/, placement rule is a real developer doc (`docs/developer/screen-kit.md`), no shadowed kit names. Four references remain in completed-plan files, deliberately, as record |
| WP04 god-components | partial — see review | four targets shrank (agentRuntime −57%, ConfigDrawer −54%, Sidebar −36%) and nothing was lost — every extracted component is imported and rendered, exports byte-identical. But **KnowledgeManager fell only 21%, to 1,156 lines**, and the splits created two new files over the target: `ConfigDrawerPanels.tsx` at 818 (ten independent panels, trivially separable, never mentioned) and `agentObjectiveLoop.ts` at 1,482, described as "over ~500" when it is three times that. **Rule 5 was broken**: `allowedProviderSdkImportFiles` gained an entry so the split would pass — an allowlist grew. A fourth guard (knowledge deletes stay confirmation-gated) now reads a file the dialog left, and passes only because unrelated state stayed behind. Four live developer docs still point at the pre-split files. 1,719 lines of extracted UI have no direct test |
| WP03 useAdminAction | **overstated** — see review | the 15 migrations are correct and the three faults fixed in passing are real. But **"0 hand-rolled remain" is false**: it measured two literal setter names. 88 hand-rolled try/catch-around-a-mutation sites survive across 55 files, none calling `reportError`; **24 tell the user nothing at all**, including failed task create, failed profile save, failed rule delete, failed PII config write and failed system settings save. 15 more sit in `src/ui/`, including the personal-data erase panel WP06 had moved out of the swept area the day before. No guard exists to bind a new page. Two faults the commit itself introduced are fixed in d8468bb5a |
| WP06 app→admin imports | partial — see review | the move is clean and verified: no import from app to admin remains, directly or transitively, and the ESLint rule is real, `error`-level, and runs in CI. But **it misses the exact form the violation was written in** — a dynamic `import()`, which `no-restricted-imports` does not inspect; the fixed page still uses that shape, so reverting the fix would pass. Relative paths escape it too, and there is no import-graph test as the sibling Convex rule has |
| WP08 app i18n | partial — see review | parity is exact (5,051 keys each, zero orphans), the Italian is genuinely translated (1 of 178 added keys identical, a proper noun), and the placeholder-parity guard is correct. But **the copy guard does not bind new pages**: it matches `>text<` within a single line and Prettier puts JSX copy on its own line, so a brand-new all-English page scores zero. 42 multi-word English strings survive across 17 `/app` files, including thirteen section headings on the reports board — the spec's headline page. 117 prose values are byte-identical across both catalogues repo-wide (pre-existing, unguarded) |
| WP10 palette + formatters | partial (commit 10ee18be0) | the sha was missing from this table, not the work. But `chartPalette.ts` **pre-dated this package** (Anthony's own commit, 2026-08-10); WP10 added 29 lines and migrated three files. Five chart files still hardcode palette constants, one re-declaring the whole engagement ramp verbatim with no export wrapper to excuse it. The theme-drift baseline still reads 1,231 against an actual 1,055 — 176 units of slack, against rule 5. `formatCurrencyGBP` has one consumer and five sibling GBP formatters remain: moved, not deduped |
| WP09 naming ratchet | mostly done (commit bf1019e2e) | the freeze is honest — exactly 7 non-conforming files, entry for entry, and the guard genuinely fails on a new one. But **"302 Pascal vs 7" compares two different populations**: 302 counts test files, the 7 excludes them; the honest figure for what the rule governs is 230 vs 7. The doc insertion left `## Shared Components` with no body and filed its list under `## File Naming`. `STRUCTURAL` matches on basename with no route-position check, so `error.tsx` or `template.tsx` passes anywhere |
| WP12 movement CLI | dropped (Anthony, 2026-08-26) | dropped on value, not boundary: it touches no screen, only re-packages the ~120 movement dev commands — but every movement runbook is written against the current names, and renaming the tooling around an area he said to leave alone buys a tidier list at the risk of stale runbooks mid-showcase |
| WP14 small sweep | partial — see review | `<html lang>` binds the resolved locale (confirmed) and the CI dedupe is real. But **the softQuery enforcement was a dead test** — it and the public-register test it was copied from matched 0 of 41 declarations and asserted `[] === []`; fixed and proven in d8468bb5a, and the migration itself has no authorisation regression (all 13 checked against their pre-migration versions). **knip never runs dependency analysis**: `check:orphans` passes `--include files`, which excludes exactly the checks the narrowed config enables, so the two dead deps were a one-off manual find and nothing stops a third. The coverage nudge is real code but dormant, unreachable from `npm run check`, and prints where nobody looks. Docs are not clean: 7 dead source paths at 9 sites survive, including a copy-paste page sample importing three components that do not exist |

---

## Counts to re-verify before starting

The review's numbers were true on 2026-08-24 but the repo moves fast. At the
start of each package, re-run the package's enumeration greps (each prompt
file gives the exact commands) rather than trusting the review's counts. Two
were already re-verified on 2026-08-25 and held (mocked-backend e2e gap;
appError ratio within ~7% of stated).

## When it is all done

- Every row in the status table reads `done` or `blocked on Anthony`. As of the
  2026-08-26 review, ten read `partial` — see the review section for what each
  one is missing. The effort is not closed.
- `npm run check` is green on the final tree.
- Move this file to `docs/plans/` archive per house convention **only when
  Anthony says the effort is closed**. WP01 no longer holds it open: he
  declined the test deployment on 2026-08-26 and the job now waits on a button
  instead of on him.
- Give Anthony a plain-English closing summary: what changed, what he must
  still do (nothing, as of 2026-08-26 — both open decisions came back: softQuery
  approved and built, the WP01 test deployment declined), and what was
  deliberately left alone.
