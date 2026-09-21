# Foundation Quality Plan

Last reviewed: 2026-08-21
Status: COMPLETE — all four phases executed 2026-08-21, uncommitted on `dev`.
Full gate: check:guards, lint, typecheck, 5,654 tests green; coverage floor
ratcheted 66/63/54/62 → 69/67/58/66 (lines/statements/branches/functions).
The Phase 2 long tail (internal-tier throws) continues opportunistically
under the `src/app-error-conversion.test.ts` guard.
Approved by Anthony on 2026-08-21 from the pre-clone maintainability review of the same date.
Owner: Anthony

## Why

Hakken is about to be cloned as the foundation for a number of micro-SaaS
products. Every weakness in the base is inherited by every clone, so a flaw
that is tolerable in one repo becomes N copies of the same flaw, each drifting
apart. The 2026-08-21 review found the platform structurally sound (enforced
authz builders, screen kit, guard scripts, low duplication) but named four
debts worth paying down **before** the first clone. This plan is those four,
in the order they should be done.

## Scope And Rules

**In scope:** the four items Anthony approved on 2026-08-21:

1. Test coverage for the wiki and the AI runtime — the platform's most
   important feature area and its least tested.
2. Error handling — convert plain `throw new Error(...)` to the `appError`
   helper so production users see real messages instead of "Server Error".
3. Split the two grab-bag backend files (`convex/ai.ts`,
   `convex/analyticsCron.ts`) into single-concern modules.
4. Docs tidy-up — remove contradictions and stale state so a fresh reader
   (human or agent) gets a true picture.

**Out of scope (explicitly, by owner decision on 2026-08-21):**

- **Vertical/demo removal.** The movement and arcade demos and the vertical
  modules stay; they will be deleted by hand after each clone. Do not build
  file-level template stripping under this plan.
- **`convex/movements.ts` tenant scoping.** The unscoped reads are accepted
  as demo behaviour by design. Do not "fix" them here.
- **Deployment bootstrap automation.** New instances will keep being
  configured by hand; the structure may change from companies to users in
  future apps, so automating today's shape is premature.
- **Branding literals in `src/` screens.** Adjacent work, scoped separately —
  see "Adjacent work" at the end. Do not fold it into these phases.

**Standing rules for all phases:** no convex deploy/codegen/dev and no git
push without Anthony's explicit permission (subagents must be told the same).
Every phase ends with `npm run check` green. Commit only when asked.

---

## Phase 1 — Tests around the wiki and the AI runtime

The wiki is a core module (`CORE_MODULES.wiki`) that drives 6 of the 25 cron
jobs, yet 18 of its backend files (~3,200 lines) have no dedicated test
sibling. Some are partially exercised by neighbouring test files
(`wikiTending.test.ts`, `wikiDistill.test.ts`, `wikiFreshness.test.ts`,
`wikiFeedback.test.ts`, `wikiStaff.test.ts` exist without a same-named source
file), so the first task is a coverage map, not blind test-writing.

### 1.1 Map real coverage first

Run `npm run test:coverage` and record per-file line coverage for every
`convex/wiki*.ts` and the AI-runtime files listed in 1.3. Write the numbers
into this plan under "Phase 1 record" before writing any test. Tests should
target what is actually uncovered, not what merely lacks a sibling file.

### 1.2 Wiki modules without a dedicated test sibling

| File | Lines | Concern |
| --- | ---: | --- |
| `convex/wikiDistillActions.ts` | 385 | distilling chat into wiki pages |
| `convex/wikiActions.ts` | 329 | page write/update actions |
| `convex/wikiTendingActions.ts` | 320 | the tending sweep's actions |
| `convex/wikiReport.ts` | 256 | weekly wiki report |
| `convex/wikiRewriteService.ts` | 250 | rewrite logic (pure service) |
| `convex/wikiExamService.ts` | 189 | exam grading logic (pure service) |
| `convex/wikiExamGrowth.ts` | 168 | exam growth tracking |
| `convex/wikiFilingActions.ts` | 160 | filing documents into the wiki |
| `convex/wikiExamActions.ts` | 160 | exam actions |
| `convex/wikiContradictionActions.ts` | 143 | contradiction detection |
| `convex/wikiStaffRunActions.ts` | 129 | staff run actions |
| `convex/wikiFreshnessActions.ts` | 129 | freshness sweep actions |
| `convex/wikiRewriteEval.ts` | 127 | rewrite evaluation |
| `convex/wikiExamGrowthActions.ts` | 123 | exam growth actions |
| `convex/wikiAsk.ts` | 108 | ask-the-wiki entry point |
| `convex/wikiExam.ts` | 85 | exam queries |
| `convex/wikiReviewActions.ts` | 84 | review actions |
| `convex/wikiFeedbackService.ts` | 61 | feedback logic (pure service) |

Priorities, in order:

1. **The pure services first** (`wikiRewriteService`, `wikiExamService`,
   `wikiFeedbackService`) — no mocking needed, highest value per test line.
2. **The cron-driven actions** (`wikiTendingActions`, `wikiDistillActions`,
   `wikiFreshnessActions`, `wikiContradictionActions`) — these run unattended
   on every deployment; a silent regression here is invisible until a user
   notices the wiki has stopped tending itself. Test the self-gating
   behaviour explicitly (a company with no pages is never visited; a visit
   claims before it spends), because that gating is what keeps 25 crons cheap.
3. **The user-facing paths** (`wikiAsk`, `wikiFilingActions`, `wikiActions`,
   `wikiReport`).

Follow the existing house style: `convex-test` harness, one `.test.ts`
sibling per module, tests named for the behaviour and the bug they prevent.

### 1.3 AI runtime gaps

`convex/ai.ts` and `convex/agentRuntime.ts` already carry substantial tests
(1,166 and 3,024 test lines). The gaps are around them:

- `convex/agentRunCheckpoints.ts` (298 lines) — no test file.
- `convex/connectionProbes.ts` (280 lines) — no test file.
- `convex/auth.ts` (209 lines) — no test file.
- `convex/actionAuth.ts` (55 lines) — no test file, and largely superseded by
  the `tenantAction`/`adminAction`/`superAdminAction` builders. Prefer
  **deleting it** (migrating its remaining callers to the builders) over
  testing it; if any caller cannot migrate, test what stays.
- `convex/crons.ts` + `convex/jobLedger.ts` wiring — add a test asserting
  every cron entry names a job that exists in the `JOBS` registry and that
  every registry entry has an `EXPECTED_EVERY_MINUTES` value, so a renamed
  job cannot silently orphan its schedule.

### 1.4 Ratchet the floor

When the phase lands, re-measure and raise `coverage-thresholds.json` floors
toward the pre-set `nextRatchet` (70/68/58/67). Do not raise past what is
actually measured; the floor must stay honest.

---

## Phase 2 — Real error messages (`appError` conversion)

`convex/utils/appError.ts` exists precisely for this, and its docstring
already admits the state of play: the backend has **779 plain
`throw new Error(...)` calls and 9 `appError(...)` calls** (measured
2026-08-21, non-test files). Convex redacts plain errors to "Server Error" in
production, so nearly every failure a real user hits today is a blank wall.

### 2.1 Convert by blast radius, not alphabetically

Order of conversion:

1. **Request-path modules users actually hit:** `chat.ts`, `ai.ts` (or its
   Phase 3 successors), `knowledge.ts`, `wikiPages.ts`, `wikiAsk.ts`,
   `users.ts`, `companies.ts`, `auth.ts`, widget/kiosk paths.
2. **Admin-facing modules:** agents, aiModels, aiTools, workflows,
   governance.
3. **Internal actions and crons last** — their errors land in `jobRuns` and
   agent logs, not in front of users, so plain errors cost least there.

Rules for each conversion: pick a stable code from the existing union in
`appError.ts` (extend the union deliberately, not ad hoc); the message must
say what the user can do about it, not restate the stack trace; guard-style
internal invariant checks ("this should never happen") may stay plain —
they are for operators, and converting them adds noise without value. This
means the end state is **not zero plain throws**; it is zero plain throws on
paths where a user or admin sees the result.

### 2.2 Add the ratchet so it never grows back

Following the house pattern (`check:screen-kit`, `coverage-thresholds.json`,
`no-client-specific-fallbacks.test.ts`): a small test or guard script that
counts plain `throw new Error(` per converted module and freezes the count,
shrink-only. Start by freezing only the modules Phase 2.1 has converted, so
the ledger stays short and does not become the drift liability the review
warned about; widen it as batches land.

---

## Phase 3 — Split the two grab-bag files

Only two backend files mix unrelated concerns; everything else big is big but
cohesive (`agentRuntime.ts`, `agentSkills.ts`, `knowledge.ts` stay as they
are — see the maintenance plan's M6.3 note before touching the runtime loop).

### 3.1 `convex/ai.ts` (1,596 lines → three files plus one relocation)

- `convex/aiChat.ts` — `generateHakkenResponse` and its helpers (lines
  ~201–730 today).
- `convex/aiSpeech.ts` — `transcribeAudio`, `synthesizeSpeech`, and the
  payload/model assertion helpers.
- `convex/aiVoiceSession.ts` — realtime voice sessions, ticket signing,
  `REALTIME_VOICE_STYLE`, the voice knowledge tool constants.
- `generateNodeConfig` (line ~867) authors workflow node configuration and
  belongs with the workflow modules, not in ai.

**Caution:** moving a Convex function changes its `internal.*` path. Known
callers of `internal.ai.generateHakkenResponse` include `chat.ts`,
`wikiAsk.ts`, and `companyEvalRunActions.ts` — grep for `internal.ai.` across
`convex/` and update every reference in the same commit. Typecheck catches
stragglers; do not rely on tests alone.

### 3.2 `convex/analyticsCron.ts` (1,542 lines → three files)

- `convex/analyticsSnapshots.ts` — daily snapshot generation, backfill,
  wipe, and seed migrations.
- `convex/systemHealth.ts` — `getSystemHealthForAdmin`,
  `getAnalyticsDataHealthForAdmin`, `getOperationalHealthReport` (these are
  client-callable admin queries currently hiding in a file named "Cron";
  the frontend imports move with them).
- `convex/platformAlerts.ts` — alert evaluation and dispatch.

Update `jobLedger.ts`'s `JOBS` registry references and any `crons.ts`
dispatch names in the same commit. The Phase 1.3 crons-wiring test exists to
catch exactly this class of miss — land it before this phase if possible.

### 3.3 What "done" looks like

Each new file keeps its functions verbatim (moves, not rewrites), keeps or
splits the existing tests alongside, and the tests pass unchanged apart from
import paths. No behaviour change is in scope for this phase.

---

## Phase 4 — Docs tidy-up

A fresh reader today gets a false picture in four ways. Every clone would
inherit the same false picture.

### 4.1 Handover files

- Root `HANDOVER.md` is a single-session note dated 2026-08-20 whose claims
  ("uncommitted, nothing pushed") are already false. Delete it — its content
  is git history.
- `docs/plans/active/HANDOVER.md` is a different, also-stale handover, and it
  still instructs contributors to update `template.manifest.json` and warns
  "the boundary test fails otherwise" — machinery deleted on 2026-08-09.
  Move it to `docs/plans/completed/` with a one-line completion note, and
  delete the stale manifest instructions.

### 4.2 One architecture document

Root `architecture.md` and `docs/developer/architecture.md` overlap and
disagree in emphasis; only the latter is linked from `docs/index.md`. Merge
what is still true from the root file into `docs/developer/architecture.md`
and replace the root file with a short pointer (the same pattern `GEMINI.md`
uses for `AGENTS.md`), so grep-first readers land on the maintained one.

### 4.3 `AGENTS.md` CI section

Three claims are stale: CI also runs `check:guards` and the e2e smoke subset
on every push (not just lint/typecheck/coverage); `main` no longer runs
`npm run build` (removed deliberately — `deploy.yml` explains why); and the
"browser suite runs only on PRs into main, leave it there" instruction is
contradicted by the smoke subset. Rewrite the section to describe
`ci.yml`/`deploy.yml` as they are.

### 4.4 Move finished plans out of `active/`

`docs/index.md` states the rule ("move completed execution checklists from
`active/` to `completed/`") and 14 of 54 active plans self-describe as
complete in their opening lines: `closing-the-loop`,
`company-skills-surfaces`, `global-wiki`, `living-wiki`, `maintenance`,
`one-brain`, `platform-improvement`, `self-improving-wiki`,
`telephone-agent`, `watch-it-think`, `widget-plan-quota`, `wiki-agents`,
`wiki-replaces-knowledge`, plus the handover above. Verify each one's status
line, move it, and update `docs/index.md` and `docs/plans/index.md` links in
the same commit. Do not summarise or rewrite the plans themselves.

### 4.5 Small stragglers

- The 8 movement plan documents living in `docs/developer/` belong under
  `docs/plans/` per the index's own placement rule; move them.
- `docs/plans/active/public-website-plan.md` and
  `docs/plans/active/maintenance-plan.md` each contain an unbalanced
  `template:remove:start` with no end marker. The fence checker skips
  markdown, so they validate nothing — remove the stray markers.

---

## Order and estimate

Phases are independent except where noted (1.3's crons test helps 3.2; Phase
2.1 should convert `ai.ts`'s successors, so do Phase 3.1 before or with that
batch). Sensible order: **4 (half a day) → 3 (one day) → 1 (two to three
days) → 2 (batched, one to two days for the request-path tier)**. Phase 2's
long tail can proceed in small batches indefinitely; the ratchet makes each
batch stick.

## Adjacent work (recorded here, not part of this plan)

- **Branding literals in screens.** The 2026-08-19 guard
  (`src/no-client-specific-fallbacks.test.ts`) cleaned `convex/` and named
  `src/` "a follow-up phase". ~68 hardcoded "Hakken" strings remain across
  ~50 screens plus 32/34 entries in `messages/en.json`/`it.json`. The fix is
  routing them through `systemSettings.platformName` (via
  `useSystemSettings`) and widening the guard's scope to `src/` and
  `messages/`. Scoped separately by Anthony on 2026-08-21.
- **Pre-clone deletions.** Demos and unwanted verticals are removed by hand
  after each clone (owner decision 2026-08-21). The fence stripper
  (`scripts/strip-verticals.mjs`) handles shared-file blocks only; whole
  vertical files are the manual part.

## Phase 4 record

Executed 2026-08-21. Root `HANDOVER.md` deleted; the plans handover is now
`completed/HANDOVER-platform-hardening.md` with its manifest instructions
corrected. Root `architecture.md` is a pointer at
`docs/developer/architecture.md`, which absorbed the deployment shape and
model-failsafe facts. `AGENTS.md`'s CI section now matches
`ci.yml`/`deploy.yml`. The 13 finished plans and 4 finished movement plans
moved to `completed/`; `movement-studio-reward-presentation-fix-plan.md`
moved to `active/` (it says no implementation work was done). The four
non-plan movement documents (retargeting approach, mirror contract, VrmAvatar
inventory, movement tracking) are reference material and stayed in
`docs/developer/`. The two unbalanced `template:remove:start` mentions were
reworded. One stale path remains in a `convex/chat.test.ts` comment
(convex/ was out of this phase's edit scope).

## Phase 1 record

Measured 2026-08-21 (full `test:coverage` run; overall lines 69.69%,
branches 59.54%). The map moved the priorities: the pure services are
already covered by neighbouring test files (`wikiRewriteService` 96%,
`wikiExamService` 100%, `wikiFeedbackService` 100% lines) and
`agentRunCheckpoints` is at 90%, so neither needs work. The real gaps:

| File | Lines | Branches |
| --- | ---: | ---: |
| `convex/wikiAsk.ts` | 0% | 0% |
| `convex/wikiContradictionActions.ts` | 0% | 0% |
| `convex/wikiDistillActions.ts` | 0% | 0% |
| `convex/wikiExamActions.ts` | 0% | 0% |
| `convex/wikiExamGrowthActions.ts` | 0% | 0% |
| `convex/wikiFilingActions.ts` | 0% | 0% |
| `convex/wikiFreshnessActions.ts` | 0% | 0% |
| `convex/wikiReviewActions.ts` | 0% | 0% |
| `convex/wikiRewriteEval.ts` | 0% | 0% |
| `convex/wikiTendingActions.ts` | 0% | 0% |
| `convex/auth.ts` | 10.71% | 14.28% |
| `convex/wikiStaffRunActions.ts` | 17.24% | 9.09% |
| `convex/connectionProbes.ts` | 31.39% | 16.04% |
| `convex/jobLedger.ts` | 48.27% | 92.68% |
| `convex/wikiActions.ts` | 50% | 29.31% |
| `convex/wikiReport.ts` | 52.63% | 14.7% |
| `convex/wikiExamGrowth.ts` | 55% | 25% |

`actionAuth.ts` measures 81.81% but the 1.3 decision (migrate callers to
the action builders and delete it) stands regardless.

### Phase 1 execution record (2026-08-21)

116 tests across 17 new test files, plus 2 added to the existing
`jobLedger.test.ts` (the review round corrected an earlier "120 across 18"
here — the 18th file was the Phase 2 guard). Every gap above filled except
`wikiExam.ts`, which the record originally omitted without saying why: it is
exercised through `wikiPages.test.ts` and the new exam-action suites, and got
no dedicated sibling. The groups:

- The four cron sweeps (tending, distill, freshness, contradiction): 30
  tests proving the self-gating (a quiet company costs nothing, a claim
  before a spend) and that a throwing model call never wedges a sweep.
- The user-facing wiki paths: 35 tests; `wikiAsk` 0→100% lines,
  `wikiActions` 50→97%, `wikiReport` branches 15→85%, filing covered.
  This work surfaced and fixed a real wiring bug: `wikiPageKeys` was
  dropped by `getEvalThreadOutcomeInternal`, so the Ask box's sources list
  was always empty — fixed in `companyEvals.ts` with an end-to-end
  regression test.
- The exam/growth/staff/eval group: 28 tests.
- Auth, probes, and cron wiring: 27 tests, including `cronsWiring.test.ts`
  asserting every cron dispatch names a real `JOBS` entry with an honest
  cadence. Genuinely untestable auth pieces (framework token flows, Google's
  side of OAuth, actual Resend delivery) are named, not faked.

**1.3 correction:** the "delete actionAuth.ts" idea was wrong — the action
builders in `tenantFunctions.ts` are BUILT on its two primitives, and
`invites.ts` uses one directly. Kept, documented as the primitive layer, its
two genuinely-unused convenience wrappers (`requireActionAdmin`,
`requireActionSuperAdmin`) deleted, and its throws converted to `appError`.
Its behaviour is exercised through every action-builder test.

1.4 executed: platform coverage re-measured at 69.96 / 67.76 / 58.05 /
66.07; floors raised to 69/67/58/66 and `nextRatchet` re-set to
72/70/61/69. `coverage:check` passes at the new floor.

## Phase 3 record

Executed 2026-08-21. Moves, not rewrites; `_generated/api.d.ts` maintained
by hand in the identical generated style (no convex CLI run, per the
standing rule — the next `convex dev` regenerates it byte-compatibly).

- `ai.ts` (1,596 lines) → `aiChat.ts` (reply pipeline + thread titler),
  `aiSpeech.ts` (transcribe/synthesize + payload guards, the one successor
  still importing a provider SDK), `aiVoiceSession.ts` (tickets, realtime
  session, voice knowledge tool), `workflowNodeConfig.ts`
  (`generateNodeConfig`, now living with the workflow feature). 16
  referencing files rewired, including the `modelTurnService` source guard
  and the `quality-drift` classification tables.
- `analyticsCron.ts` (1,542 lines) → `analyticsSnapshots.ts` (nightly
  rollup + backfill/validate/seed/wipe), `systemHealth.ts` (the health
  reports and the admin queries that were hiding in a file named "Cron"),
  `platformAlerts.ts` (report → email dispatch). The shared
  message-analytics patch helpers live in `analyticsSnapshots.ts` and are
  imported by `systemHealth.ts`. The four health handlers carry explicit
  return-type annotations (`Promise<SystemHealthReport>` etc.) — without
  them the module cycle through the generated API collapses their types.
- `ai.test.ts` and `analyticsCron.test.ts` still cover the successors and
  carry header notes to split them along the same lines when next touched.

## Phase 2 record

Executed 2026-08-21 for the request-path and admin tiers: **~290 throws
converted** across users, chat, companies, knowledge, wikiPages, wikiAsk,
the four ai.ts successors, kioskActions, systemHealth, actionAuth, authz,
and the 15-file admin batch (agentSkills, aiTools, agents, widgets,
agentRuns, agentMemories, companyMemories, tasks, companySkills, aiModels,
companyEvals, apiKeys, agentMemoryCandidates, workflows). Message text kept
byte-identical throughout, so existing `toThrow("<text>")` assertions stayed
green. Correction from the review round: `webhookDeliveries.ts` was
originally recorded here as converted — it was not touched (it is
internal-only, deferred to tier 3, and sits on the guard's
NOT_YET_CONVERTED list). The review round then converted the remaining
deliberate throws in the mixed files, plus the helper modules that produce
user-facing text one import away (`uploadPolicy`, `chatService`,
`voiceSettings`), `kiosk.ts` (a tier-1 public path the first pass missed),
`companyEvalRuns.ts`, `companyEvals.ts`'s last throw, and `jobLedger.ts`'s
admin query.

Codes added to the union, each with a docstring: `INVALID_INPUT`,
`NOT_CONFIGURED` (deployment missing an env var/credential — distinct from
the per-workspace `MODULE_DISABLED`), `UPSTREAM_FAILURE` (the model or
provider failed; the input was fine).

The 2.2 guard is `src/app-error-conversion.test.ts`. First shipped as an
allowlist of finished files; the review round inverted it into a
shrink-only NOT_YET_CONVERTED list (~90 files), so clean-by-default is the
rule: new files and every converted file are guarded automatically, and
each tail file's entry is deleted as it converts. Still binary per file —
never a count ledger.

Remaining tail (internal actions/crons, vertical modules): convert
opportunistically per 2.1's tier 3, removing each file from the guard's
list as it reaches zero.

## Review round record (2026-08-21)

An adversarial review (eight finder angles, one plan-vs-tree audit, every
candidate verified) confirmed the splits lossless and the rewiring complete,
and surfaced ten findings — all fixed the same day:

1. The run-detail observability page rendered `error.message` raw; it now
   goes through `toUserFacingMessage` like every other admin screen.
2. `kiosk.ts` (public, unauthenticated) had been missed by the conversion.
3. Helper modules producing user-facing text (`uploadPolicy`, `chatService`,
   `voiceSettings`) converted; the per-file guard had certified their
   callers while the message was made one import away.
4. `gmailWatcher` stored the ConvexError JSON envelope into `lastPollError`
   (now unwrapped via `appErrorMessage`), and its task title was unbounded —
   a long sender address could fail the filing the code promised never to
   fail (now sliced whole to the 200-char ceiling).
5. The Phase 3 split ran after the Phase 4 docs tidy: 34 stale module
   references across 13 developer guides, the coverage matrix, and 11
   active plans — all swept; the html2canvas/oklab chart-export constraint
   lost in the architecture merge was re-homed in
   `docs/developer/frontend.md`.
6. The conversion guard inverted from allowlist to shrink-only
   NOT_YET_CONVERTED denylist (see Phase 2 record).
7. This record's own inaccuracies corrected (test counts, the
   `webhookDeliveries` claim, `wikiExam.ts` omission, `appError.ts`'s stale
   docstring).
8. A 19-line voice-architecture comment stranded in `workflowNodeConfig.ts`
   by the split — and stale (it predated the google-relay transport) —
   rewritten and moved above `createRealtimeVoiceSession` where it belongs.
9. The eval evidence rebuild in `companyEvals.ts` now spreads the recorded
   runtime evidence instead of enumerating fields, so the next field the
   chat path records cannot be dropped the way `wikiPageKeys` was.
10. Error-code semantics: thread-without-workspace sites recoded
    INVALID_INPUT (NO_ACTIVE_COMPANY means the *caller* lacks one);
    `widgets.ts`'s fail-closed comment updated to match what actually
    reaches the caller.

Also from the round: `cronsWiring.test.ts` shares one registry read across
its tests, and fixture mode gained a real report for
`systemHealth:getAnalyticsDataHealthForAdmin` (the analytics settings screen
crashed on the mock's generic fallback — a pre-existing gap surfaced while
verifying in the browser).
