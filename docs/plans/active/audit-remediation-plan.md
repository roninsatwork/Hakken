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
immediately in isolation (a third strike on 2026-08-26, `wikiTendingActions.test.ts`
again, during E3 — and it did not recur on the next full run, which is the
signature of load sensitivity rather than a broken test): `wikiDistillActions.test.ts` (during WP04) and
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
| E3 (browser check) | The platform overview excluded Ronins staff from the seat *total* and left them in the *active* count, so their own messages and agent runs landed in the numerator of a fraction they had been removed from the denominator of. The sign-in loop already refused a non-client; the message and run loops did not. | "4 of 3 seats in use, 133% used" on a local database — and on every deployment where anyone from Ronins had signed in, client engagement overstated by exactly the amount the code's own comment says must never be counted. | One membership test in `noteActivity`, so all three paths agree. Now reads "2 of 3, 67%". Probed by reverting it and watching `platformOverview.test.ts` fail 2-to-1. Found by looking at the screen, not by a test — no test asserted the two figures against each other |
| E4 | The module-size ratchet added an hour earlier failed the moment a two-line security fix touched a frozen file, which is a real property of an exact-line baseline rather than a bug in it. | Nothing a user sees — but a guard that can only be satisfied by deleting blank lines is a guard people learn to game. | Made room instead of raising the number, which rule 5 forbids: 114 lines of auth-identity purge helpers left `users.ts` for their own module, 1,324 to 1,210. The whole 23-entry baseline was then re-measured downward, after checking that nothing had grown |
| E5 | The raw-row rule in `return-shape-drift.test.ts` only matched `ctx.db.get` / `ctx.db.query` written on one line. Almost every read in `convex/` wraps the chain across lines, so the rule read past nearly all of them and reported **zero** offenders. Four people surfaces were still handing back whole `users` rows with `tokenIdentifier` attached — `getPaginatedUsers`, `getUsersByCompany`, `getSuperAdmins`, `getUnassignedSuperAdmins`. E4 narrowed two of the six and its "zero" rested on the blind regex. | Every administrator who opened the team page, a company's user list, System Administrators, or the unassigned-super-admin picker received a server-side sign-in identity for each person listed. Not a password and holding it is not a login, but no screen has any use for it. | All four narrowed through `toClientUser` and declared. Six probes: each narrowing removed in turn, watched to fail, restored. |
| E5 | Nothing in `users.test.ts` created a user carrying `tokenIdentifier`, so the two narrowings E4 did add were provable only in theory: removing `toClientUser` from a people surface left all 42 tests green. | Nothing directly — but it is why the leak above survived a package that went looking for it. | `users.test.ts` now seeds people who carry the field and reads seven surfaces with it, asserting each returned rows rather than passing on an empty answer. |

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
completion at the moment of the review was about **70%**, not the 100%
reported.

**Anthony read that and said finish it.** The remaining thirty per cent was
worked the same day (2026-08-26), in the order the review put it: the guards
first, because they are what let the rest drift; then the two sites saving
wrong numbers, the spreadsheet import, the login-page leak, and the hundred and
five hand-rolled error paths; then the oversized files, the chart palette, the
naming rule and the documentation. Every row in the table below carries the
commits. Anthony then read the five items those rows recorded as knowingly open and
said they sounded like fixes to make, so four of them were: the builders now
carry Convex's own return constraint (which found a real bug in the widget
configuration query), the 54 raw ConvexError throws all carry codes, the
coverage prompt is provable and fired for the first time, and
`action-hook-adoption.test.ts` binds a *new* page to the runner the way the
copy and naming rules bind theirs. The fifth — five sibling GBP formatters,
differing in their options rather than duplicated — is the one left, and it is
cosmetic beside the others.

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

## The list of 2026-08-26 evening, and what became of it

Six independent readers went over the day's work and named roughly two days of
remaining work. That list is now **closed**, in the commits from `c03f53892`
through `2e2c41548`. Recorded here in the form it was closed, because each item
came with a rule as well as a fix, and the rules are the durable part.

**Copy still English on a customer screen — closed.** The guard matched
`>text<` and an attribute list, which is why it scored the two worst files, at
42 and 20 English sentences, as zero. It now parses each file with the
TypeScript compiler and reads eleven syntactic shapes, each proved by putting a
real sentence back into a file it holds at zero. Reading properly also cleared
68 false positives out of the old 119. 87 sentences translated across ten
screens; ceilings now 23 files and 102 sentences, matching measurement.

**Counts stored short — closed, and it was eight sites, not three.** Where the
caller loops over everything and can carry a caveat, the number is marked
partial. Where the caller promises to act on *all* of them, marking is not
available and the cap was doing real harm: deleting a skill deleted a hundred
of its bindings and left the rest pointing at a skill that no longer existed,
and upgrading left the surplus agents on old instruction text while reporting
success. Both are probed by seeding 101 agents onto one skill.

**Status readable only by hue — closed.** Blue against amber, a diagonal hatch
on the failed series carried into the legend swatch, a separator between
segments, failure counts printed on the bars, and a shape rather than a colour
for the "worked" verdict. `status-colour-drift.test.ts` fails a bare swatch
that flips between the success and destructive tones, or a pair of them sitting
together with no word between.

**Twenty surfaces with no declared return shape — closed.** Four were returning
whole table rows: a call's page was receiving the company's own line and the
telephony provider's key for the call, neither of which it renders.

**Seven `CONFLICT` codes contradicting their own definition — closed.**

**The smaller ones — closed.** Backfill continues past a refusal and reports
which dates went unwritten; a deduplicated repeat click no longer shows an
empty error box; `PhotoActionChip` shows its own translated label again; the
five sibling sterling formatters are one module.

**Documentation paths — closed.** `doc-path-drift.test.ts`, probed by putting
back the exact reference that regressed within an hour of the WP14 sweep.

---

## Known open, after the 2026-08-26 close

The fourteen packages are closed. What follows was found while closing them and
was never part of the plan.

**Groups A and B were done on 2026-08-26** (`4e5cdd3bc`, `32149f729`,
`f038b7aa7`, `1752ddbdf`). Group C was settled by decision rather than by work.
What is left is one newly measured population, at the bottom.

Kept in the form they were closed, because each carried a rule as well as a
fix, and the rules are the durable part.

### Group A — done 2026-08-26 (4e5cdd3bc, 32149f729)

**A1. Three status signals readable only by hue (~2h).** Failure groups rank
worst-first by a red rail against amber ones; the job waterfall separates four
states by warm hue alone; the saved-record dots carry no label. None is
green-versus-red, so none breaches the standing rule, and all three are outside
what `status-colour-drift.test.ts` can see — it reads bare swatches, and these
have children. Each wants a word or a shape, not a new rule.

**A2. Four screens skip the search assertions of the shared table floor (~2h).**
`app/settings/team`, `admin/_features/wiki/WikiDiaryScreen`,
`admin/agents/[id]`, and `admin/connections` all have a search box and all pass
no `searchPlaceholder` to `itBehavesLikeAStandardTableScreen`, so three
assertions — including the nested-border one — silently do not run for them.
The arcade screen had exactly this gap and turned out to have a real fault
behind it (`630f0a7e7`), so budget for finding more than nothing.

*The shape worth remembering beyond these four: a shared floor holds a screen
only to the parts that screen opts into, and an omitted config line is
indistinguishable from a passing rule.*

### Group B — done 2026-08-26 (f038b7aa7, 1752ddbdf)

**B1 then B2, in that order — widen the catcher first, then translate**, because
translating first means going back over the same screens.

**B1. Widen what the copy guard can read.** Known blind spots, disclosed rather
than discovered: single words below the eight-character threshold; strings
passed as function arguments (`setUploadStatus("Parsing Intelligence Data…")`
in the assistant page is real and invisible today); copy assembled across
statements; and — found by probe on 2026-08-26 — **any property whose name is
not in `COPY_NAMES` or matching `COPY_NAME_SUFFIX`.** A sentence held under
`note`, `blurb`, `intro` or `sub` passes untouched; `sub={"PROPRIETARY RAG
VECTORS"}` on the admin usage page is a live example. **The frozen 102 is
therefore a floor, not a total** — expect 150–200 once the guard reads more.

**B2. About 120 catalogue values are byte-identical across both languages**, 56
of them full English sentences, all under `admin.*` and `ai.*`. Admin only —
nothing a customer sees. Unguarded, so the population can grow; the fix is a
translation pass plus a guard that freezes the count.

### Group C — settled by Anthony 2026-08-26, no work outstanding

**C1. AI running costs report in US dollars, and that is the intended
behaviour.** The providers bill in dollars, nothing in the codebase converts,
and the eighteen screens printing `$` are showing the truth. Anthony confirmed
on 2026-08-26 that he is happy for the platform to report AI costs in dollars
throughout. **No display changes anywhere.**

What is left is only a naming inaccuracy: the columns holding those dollars are
called `costGBP`, `totalCostGBP`, `maxCostGBP` and `totalGBP`. Renaming them
would touch records that already exist, for no visible benefit now the currency
question is settled, so it is **not scheduled**. `src/lib/currency.ts` carries
the warning instead, and that is the permanent answer unless Anthony says
otherwise.

**The trap this leaves, stated so it is not walked into twice.** The obvious
reading of a dollar sign beside a field named `costGBP` is that the display is
wrong. It is not. I made exactly that change on 2026-08-26 and had to revert
it. Never change a currency symbol on the strength of a field name; check where
the number is billed.

**And the one exception to "dollars all over".** Sales and opportunity figures
(`totalOpportunityGBP`, `prospectTotalGBP`, `spendGBP`) really are sterling —
they come from the customer's own spreadsheet import, not from a model
provider, and Comax is a UK business selling in pounds. Those stay in pounds.
"Dollars all over" governs what the platform *spends* on AI, not what a
customer *earns*.

### Group D — found while closing B, measured not guessed

**D1. 110 single-word values are identical across both catalogues.** Both new
guards have the same blind spot by design: the copy guard needs eight
characters and a space, and the parity guard the same, because a single word
matching across languages is usually correct and reading those would bury the
signal. Most of these 110 are correct — `Email`, `Widget`, `Wiki`, `Dashboard`,
`Sonae`, `iPhone` are the same word in Italian. Perhaps twenty or thirty are
not, and telling them apart needs a judgement per word rather than a rule.

Two were fixed on sight because they were visible on the Italian rules screen
while it was open: `Priority` and `Status` were hardcoded English in the table
header, and the four row tooltips were untranslated. That is the shape of the
whole population — small, visible, and invisible to both guards.

**D2. A governance screen showed fabricated audit records — fixed 2026-08-26
(`bc75892ca`).** The audit log detail screen fell back to four hand-written
rows whenever the real query returned nothing, including a super-admin
enforcing a security policy, with a plausible actor, timestamp and reference.
An empty trail now reads as "Log Not Found", which is both true and what an
auditor needs to hear when a record has been purged.

Two things worth keeping from it. A test named "keeps the existing
empty-database fallback record" was holding the invention in place, so it was
pinned rather than overlooked — the replacement asserts the opposite and was
watched failing. And it was the copy guard that surfaced it: it counted the
invented rows as untranslated English, because nothing can tell a fabricated
record from real copy by looking at it. A scan found no other screen doing
this outside the frozen demos.

### Not work — two properties recorded so they are not mistaken for gaps

**A measured limit of the return-shape constraint.** It catches a handler
returning the wrong type or missing a field, but not one returning an *extra*
field, because the generic infers the handler's own type first. Extra fields
are caught at runtime by `convex-test`, so that cover is real only where a test
exercises the happy path — true for seven of the fourteen surfaces added on
2026-08-26.

**No per-package percentages were ever recorded**, so the "about 70%" figure in
the review section above cannot be reproduced by anyone; treat it as a band,
not a number.

---

## The external auditor's rescore (2026-08-26 evening) and the drift it exposes

An external code auditor rescored the tree at `9bca72d0` and returned 8.5/10,
up from the 8/10 of the original review. **Its numbers were checked against the
code before anything was done with them, and they held.** Ten figures verified
independently: 863 `appError` sites; four plain-`Error` survivors, all inside
frozen `convex/movements.ts`; `agentSkills.ts` at 2,458 lines; `agentRuntime.ts`
at 1,212; `KnowledgeManager.tsx` at 663; `ConfigDrawer.tsx` at 521;
`SidebarNavigation.tsx` at 604; 101 `movement:` scripts; 234 PascalCase
component files; the theme baseline at 1,052; `src/ui/atoms/` absent; six files
carrying `console.error` under `src/app`. Nothing in it was invented.

**This is a different failure mode from the three reviews above, and worth
naming as its own.** Those found claims the code did not support. This one is
accurate about the code and wrong about the intent: of the five things holding
the score at 8.5, four are positions taken deliberately, and an auditor has no
way to see a decision. It will find them again on every run, and the score
cannot move without either reversing a decision or handing the decisions over.

### The four standing decisions an auditor cannot see

Hand this list to any future audit run as part of its brief. Each is a
deliberate position, not unfinished work.

1. **The real-login end-to-end job runs on a button, not on every pipeline.**
   Anthony declined the dedicated test deployment on 2026-08-26, on cost. The
   specs exist, are tagged, and passed 5/5 against a real deployment on
   2026-08-25. An auditor reading only the workflow file sees a mocked pipeline
   and scores an honesty gap.
2. **The broad analytics reads are registered, not hidden.** Writing an honest
   reason for each read *was* the deliverable of WP05. An auditor counting
   register entries reads the completed work as outstanding debt.
3. **Return validators were scoped to the client-facing surface.** All 41
   public and soft surfaces declare one, plus 20 more added on 2026-08-26.
   Dividing instead by all ~900 declarations — 325 of them `internalQuery` and
   `internalMutation` that no client can reach — produces a coverage figure
   against a denominator no package ever adopted.
4. **The movement scripts CLI was dropped on value, not on boundary.** It
   touches no screen. It was dropped because every movement runbook is written
   against the current command names.

### What Anthony asked for on 2026-08-26, having read that

He asked for all of it closed **except the CI item**, which stays as it is.
Sizes measured rather than estimated, because two of the four are far larger
than the auditor's one-line description suggests:

| Item | What closing it actually means | Measured size |
|---|---|---|
| E1 `agentSkills.ts` at 2,458 lines | ~770 lines of unexported helpers and starter data lift out with no API path moving; the fattest endpoint bodies then follow into a service file | contained — the one genuine fault on the list |
| E2 Movement scripts | a dispatcher, **with every existing `movement:` command name still resolving**, or the runbooks go stale — which is the reason it was dropped | contained |
| E3 Broad analytics reads | 38 registered reads paged or rolled up for real; the two 20,000-row platform-overview scans need a rollup table, not a smaller cap | days, and it moves numbers on screen |
| E4 Return validators | a declared shape on ~800 further declarations, or the builders made to require one | the largest item on the plan by a wide margin |

**Progress against E1–E4 is recorded in the status table below**, in rows of
their own. The rule from the three earlier reviews stands and applies to these
four exactly as it applied to the fourteen: a row may say done when a probe
sits behind the claim.

---

## E5 — the remaining return shapes, scheduled rather than drained

**Anthony, 2026-08-26: "I don't want to take technical debt across to a new app
when we close the code."** That settles a question this plan had answered the
other way, and he is right to overrule it.

The advice given earlier was to leave the remaining declarations to drain — to
let anyone touching one of those functions add its shape then, with the
shrink-only ceiling making sure the number never rose. That is sound advice for
*an application*. It is the wrong advice for *this* repository, because Sonae is
the baseline every future product is forked from. Debt left here is not left
here: it is copied into every client fork and every micro-SaaS built on it, and
a fork cannot easily take a later fix back. The cost of leaving it is not one
untidy codebase; it is one untidy codebase per product, forever.

### What is actually left

| Population | Count | Why it is or is not in scope |
|---|---|---|
| Client-callable, no declared shape | 362 | **In scope.** These are the surfaces a browser can call, and the ones where an undeclared shape can put something on the wire that was never meant to travel |
| Handlers returning an undeclared database row | 0 | Closed 2026-08-26. This was the part that could leak, and it did twice |
| Short-form handlers the classifier cannot read | 5 | In scope, and named rather than skipped — they return without the word `return`, so they need reading by hand |
| Internal-only (`internalQuery`, `internalMutation`, `internalAction`) | 393 | **Out of scope, deliberately.** No client can reach them; their callers are inside the same deployment and already type-checked. Recorded so the figure is not rediscovered as a gap |

### How it gets done

One file at a time, **largest first** — the shapes within a file repeat, so the
second surface in a file is far cheaper than the first, and the ten heaviest
files hold 130 of the 362. `convex/movements.ts` holds 11 of them and is
excluded: it is frozen Posture Studio code and stays untouched. After each file:
typecheck, its own suite, and the ceiling in `return-shape-drift.test.ts`
ratcheted down to the new measured figure. The ceiling never rises, so a batch
that is abandoned halfway still leaves the population smaller than it found it.

Two things make this slower than counting the declarations suggests, and both
are the reason it is worth doing rather than an argument against it:

- **The declaration is enforced at run time, not just compile time.** Getting a
  shape slightly wrong breaks a screen for a real person. Every batch needs the
  suite behind it, and the surfaces with real stored data need looking at.
- **Writing the shape down finds bugs.** It has, three times now: four handlers
  that promised `null` and returned nothing, a conversation list carrying a
  thread's access-token hash, a call page receiving the telephony provider's
  key. Budget for fixing what the declaring turns up.

### The estimate, honestly

**Ten to fifteen working days of focused sessions.** The comparable figure from
this plan's own table is WP07 at two days for 41 surfaces, which would put 362
at around seventeen; this is a little quicker because many sit in the same file
and share a shape, and the trivial ones are already done.

That is the honest number. It is not a reason to skip it — a fortnight spent
once, on the framework, is cheaper than the same debt shipped into every product
built on it.

---

## Per-package status

Update this table (and nothing else in this section) as work proceeds. States:
`todo`, `in progress`, `blocked on Anthony`, `done (commit <sha>)`,
`partial — see review`.

**Baseline recorded 2026-08-25:** `npm run check` green on `b6755c3c0` —
687 test files, 6,068 tests, exit 0.

| Package | State | Notes |
|---|---|---|
| WP01 real-auth CI | **done, automation declined** | the five specs exist, are tagged, and passed against a real deployment in 15.7s on 2026-08-25. The chat spec asserts the send, not the reply — corrected in d8468bb5a and now named for what it does; strengthening it needs a live run of the lane. Anthony declined the dedicated deployment 2026-08-26; the job is on the Actions button, so no PR fails for want of secrets. Open on his side only: whether "Real Auth Smoke" is a required status check in GitHub branch protection |
| WP11 split quality-drift | **done** (commit eba6cb1c4) | verified independently: 38 tests before and after with identical titles, 80 assertions both sides, nothing skipped, allowlist byte-identical. The one inaccuracy is the Found-in-passing row below — six references across four docs, not five |
| WP02 backend appError | **done** (2026-08-26: cd2f51d20, d8468bb5a) | zero plain throws outside the frozen demo, allowlist 92→2 and now enforced shrink-only, CONFLICT in the union. The sales spreadsheet import's eleven sentences reached production as "Server Error" through an Error subclass the guard could not see — it extends ConvexError now, and no class in convex/ may extend Error without a listed reason. The 54 raw ConvexError throws the spec named were held to a shrinking count and then converted the same day (361361f74); the count is zero and the rule is absolute. The SSRF regression this package caused is fixed |
| WP05 take(10000) | **done** (2026-08-26: 234a679ac) | the register keys on the row cap, not the spelling, so twenty-three reads at ten and twenty thousand rows it had never seen came into it. The seven "fixes" that renamed 10000 to a constant did NOT come back: that constant is 2,000, so resolving it puts them below the threshold, and they sit anonymously in the mid-sized count still truncating. Sixteen entries added with honest reasons; a second count holds the one-to-ten-thousand band, shrink-only, now at 126. Both stored-truth sites refuse now (the nightly login recount checks before it writes; the snapshot refuses a truncated catalogue). Seven false justifications rewritten. The vacuous getGlobalAnalytics split reads the function again. A later pass (2ce4fa9ab) found eight more short reads this package had not read: five marked partial, and three that had to walk the whole population instead, because deleting a skill was leaving its surplus bindings pointing at a skill that no longer existed and upgrading was leaving agents on old instruction text while reporting success |
| WP07 return validators | **done** (2026-08-26: 1bfbdfef3) | 41 of 41 public and soft surfaces declare a validator and the soft migration lost none. The conversation list stopped returning whole thread rows including widgetAccessTokenHash, and six more client-facing chat functions gained the validator the package claimed they had. `settings.get` stopped spreading the whole systemSettings row to unauthenticated visitors (739984f2f). Fixed the same day (67e889108): the builders carry Convex's own constraint, so a handler disagreeing with its declaration is a compile error. The 20 surfaces that declared nothing for it to check now all declare a shape (c03f53892, 6a1e5284a); four were returning whole table rows, and a call's page stopped receiving the company's own line and the provider's key for the call. Declaring it caught four handlers returning nothing where they promised null. Measured limit: an *extra* field still compiles, because the generic infers the handler's own type first — runtime cover exists only where a test runs the happy path, which is 7 of the last 14. 12 httpActions have no returns slot at all |
| WP13 atoms consolidation | **done** (commit 19574af4f) | verified independently: folder gone, zero references in src/ or scripts/, placement rule is a real developer doc (`docs/developer/screen-kit.md`), no shadowed kit names. Four references remain in completed-plan files, deliberately, as record |
| WP04 god-components | **done** (2026-08-26: ce5c12529, 7f67fa813, 93f12f41e) | all four targets and both files the first pass created are now within reach of the target: agentRuntime 1,212, agentObjectiveLoop 1,101 (of which 910 is one function, stated rather than implied), KnowledgeManager 1,156→662, ConfigDrawerPanels 818→322/342/204, SidebarNavigation 604, ConfigDrawer 518. Every frozen count split with its file and every platform total is unchanged (raw buttons 295; hardcoded copy 183 at the time of the splits, 119 after the translation pass). The allowlist this package grew is back to the length it was before the split — ten entries, not the eleven the split left; not shorter, as an earlier version of this row claimed. Four guards follow the code rather than the old paths, and the knowledge-delete gate reads both halves |
| WP03 useAdminAction | **done** (2026-08-26: 5ec50023e, 7f67fa813) | the real figure was 105 sites across 62 files, not the 0 claimed. All 105 migrated: 29 that told the user nothing, 69 that told them something but reported nothing, 7 partial. Five more found in passing (three silent activation toggles, two purge writes). 23 catalogue keys added in each language. A drift guard binds a new page to the hook as of the same day (0893fecaf, hardened in aefaba0df). A second review found the guard could not see a `try`/`finally` with no catch, nor a floating promise — and sixteen writes were failing silently through those shapes, including the governance evidence export. Both shapes are covered and all sixteen fixed (c36a888a9), with six probes written, failed and deleted. Five forms that keyed their seed on an object rather than a stable id, so a server change overwrote whatever was being typed, went in the same commit |
| WP06 app→admin imports | **done** (2026-08-26: f0366eb21) | the move was always clean; the enforcement was not. The ESLint rule missed the dynamic `import()` the violation was actually written in, missed relative paths, and had no transitive cover. admin-boundary-drift.test.ts walks the import graph and catches all three, probed with each form |
| WP08 app i18n | **done** (2026-08-26: c09f3bcc7, d1d0805c7, ca81e5298, 67e889108) | parity is exact and the Italian is genuinely translated. The copy guard that was supposed to bind new pages matched `>text<` on a single line, which Prettier never produces — it read almost nothing, and a probe page written entirely in English passed it. Fixed and re-probed; the honest baseline is 183 sentences across 80 files, now 119 across 68. **A third review found even the fixed guard structurally blind**: matching `>text<` cannot see a sentence in a config array, a chart axis label, canvas text, or a string returned from a function, and it scored the two worst files — 42 and 20 English sentences — at zero. It parses with the TypeScript compiler now and reads eleven shapes, each probed (2e2c41548). That also removed 68 false positives from the old 119. 87 sentences translated across ten screens; ceilings 23 files / 102 sentences. Roughly 120 prose values identical across both catalogues repo-wide remain untranslated and unguarded — 56 of them full English sentences, all in admin namespaces — pre-existing, recorded, not in this package |
| WP10 palette + formatters | **done** (2026-08-26: 2e39036ee) | five files stopped keeping private copies of palette constants, including one re-declaring the whole engagement ramp. The canonical series order put emerald directly before rose — the first two slices of every pie in the one pair Anthony cannot read; separated. **A second review found that fix inert**: nothing imported the reordered array, and the one pie on the platform drew from its own hand-written list still in the old order. Both sequences derive from the canonical order now, and `chart-palette-drift.test.ts` fails a screen that names a palette colour in a chart prop without importing it — the rule the first pass never wrote (9da153995, aefaba0df). The theme-drift baseline dropped from 1,231 to the actual 1,052, closing 179 units of slack (f883b61a8). The five sibling GBP formatters are now one module (be747ac67) — as three named variants, because they genuinely differ, and not a single displayed figure changed. That module's own docblock had to be corrected afterwards (5a4c2bc4e): it claimed one of the five had printed a dollar sign over a sterling figure, and checking the diff showed no dollar sign was ever removed. Chasing that turned up the real thing, which is now recorded in the open list — model spend is USD stored in columns named GBP |
| WP09 naming ratchet | **done** (2026-08-26: f883b61a8) | freeze verified entry for entry. The structural exemption matched on basename anywhere under src/, so `error.tsx` or `template.tsx` passed as an ordinary component name — scoped to the router tree and probed. The headline figure compared two populations (302 counted test files, 7 excludes them); the honest figure for what the rule governs is 234 vs 7 today. The doc insertion that swallowed the Shared Components section is repaired |
| WP12 movement CLI | dropped (Anthony, 2026-08-26) | dropped on value, not boundary: it touches no screen, only re-packages the ~120 movement dev commands — but every movement runbook is written against the current names, and renaming the tooling around an area he said to leave alone buys a tidier list at the risk of stale runbooks mid-showcase |
| WP14 small sweep | **done** (2026-08-26: d8468bb5a, f0366eb21) | `<html lang>` and the CI dedupe were real. The softQuery enforcement was a dead test — it and the public-register test it was copied from matched 0 of 41 declarations; both fixed and proven to read all 41. knip never ran dependency analysis (`--include files` excluded the very checks the config enabled); it runs them now, clean. The coverage nudge moved to its own module with five tests and now writes to the run summary (0893fecaf), and it fired for the first time once real coverage was measured — two floors rose behind it. It remains unreachable from `npm run check`, which only `npm run gate` and CI call. Docs: 7 dead paths at 9 sites fixed, plus 15 guides repointed after the splits |
| E1 agentSkills.ts size | **done** (2026-08-26: 1826eb081, a43649f1c) | 2,458 to 1,173, under agentRuntime.ts and out of the bracket the auditor read it in. ~770 lines of unexported helpers, parsers and starter data into five modules, then ten ctx-taking database helpers into `agentSkillsService.ts`; no Convex API path moved, and the one file importing an exported helper was repointed. The split is not the durable part: `module-size-drift.test.ts` freezes the 23 backend modules over 1,000 lines at today's measurement, shrink-only, with a stale-entry rule, and all three of its rules were broken on purpose and watched to fail. The other 22 modules are recorded, not endorsed, and none was touched |
| E2 movement scripts dispatcher | **done, rename refused** (2026-08-26: 58b651fa9) | `npm run movement` indexes all 101 in 19 families and 21 one-offs, dispatches by short name, and refuses an unknown one with its own family's suggestions. `npm run help` points at it. The rename half is refused on evidence rather than deferred: the names are referenced 1,258 times across 96 files, and four sit inside the frozen Posture Studio source — `MovementCaptureClient` prints one on screen for a user to copy and type, so renaming publishes a broken instruction. Every existing name still resolves. Three probes broken on purpose and watched to fail |
| E3 broad analytics reads | **done — every capped figure discloses** (2026-08-26: bc143b7c4, 650c19c91) | All six remaining analytics surfaces read one row past their cap and report whether they ran out of room; five screens show it through one shared notice, in both languages. Sixteen reads left the broad-read register and its stale-entry rule took thirteen entries with them — 58 down to 45. `platformOverview` moved onto the same shared module, so its end-to-end test covers the shared code. **What is deliberately NOT done: the caps are still caps.** A month past ten thousand rows is now honest rather than silent, but it is still not read in full; removing the cap needs rollup tables, which is a design job and remains unscheduled |
| E4 return validators beyond the client surface | **done** (2026-08-26: 25561ddb1, e10c4e0ea, 6dfd7083f) | The population that could leak is zero: fourteen handlers returned undeclared database rows, two were real leaks (`users.tokenIdentifier`, `workflows.webhookSecret`), and all fourteen are shaped. Shapes derive from the schema through `rowShape`, so a new column is declared the day it is added rather than travelling undeclared. The trivial fifth followed — 83 surfaces that return nothing or a bare boolean — taking the undeclared count 455 to 362. What remains is **E5**, which Anthony scheduled rather than left to drain |
| E5 remaining return shapes | **in progress** | 362 client-callable declarations with no shape, plus 5 short-form handlers the classifier cannot read. Scheduled on 2026-08-26 because Sonae is the baseline every product is forked from: debt left here is inherited by every fork and cannot easily be taken back. 10–15 days, one file at a time, ceiling ratcheted down after each. The 393 internal-only declarations are deliberately out of scope. **Progress: 362 → 328.** `agentSkills.ts` (23) and `users.ts` (11) are done; the second of those was taken out of size order because declaring its shapes found four live surfaces still handing back whole `users` rows, and the guard that reports zero of those cannot see the shape they are written in — both rows in "Found in passing" |

---

## Counts to re-verify before starting

The review's numbers were true on 2026-08-24 but the repo moves fast. At the
start of each package, re-run the package's enumeration greps (each prompt
file gives the exact commands) rather than trusting the review's counts. Two
were already re-verified on 2026-08-25 and held (mocked-backend e2e gap;
appError ratio within ~7% of stated).

## When it is all done

- Every row in the status table reads `done`, `dropped` or `blocked on Anthony`.
  The rows that read `partial` after the first 2026-08-26 review were worked the
  same day; what each one knowingly still leaves open is written into its own
  row rather than hidden behind the word.
- **What "done" is allowed to mean here, from now on.** A row may say done when
  the claim it makes has a probe behind it: something broken on purpose, watched
  to fail, restored. Every gap all three reviews found was a check that read
  nothing and passed, and "the suite is green" was read as proof three times
  before that stopped being an accident. A passing test proves it ran.
- **A second review, the same evening, found the same failure mode one level
  down** — four rows still describing fixes that had since been made, a
  headline figure corrected in the document and not in the guard that publishes
  it, a colour fix that reached no chart because nothing imported the array it
  changed, and several of the day's new guards holding a hole the same shape as
  the fault they were written for. All of that is corrected above. The lesson
  is not "check twice"; it is that a claim about a guard is worth exactly as
  much as the probe that made it fail.
- **Anthony's side is now nothing.** The open question was whether "Real Auth
  Smoke" is a required status check, because if it were, PRs into `main` would
  wait forever on a job nothing triggers. Checked in his browser on 2026-08-26:
  the repository has no classic branch protection and no rulesets at all, so no
  check is required of any branch and nothing waits on that job.
- `npm run check` is green on the final tree.
- Move this file to `docs/plans/` archive per house convention **only when
  Anthony says the effort is closed**. WP01 no longer holds it open: he
  declined the test deployment on 2026-08-26 and the job now waits on a button
  instead of on him.
- Give Anthony a plain-English closing summary: what changed, what he must
  still do (nothing, as of 2026-08-26 — both open decisions came back: softQuery
  approved and built, the WP01 test deployment declined), and what was
  deliberately left alone.
