# Outstanding tasks — Sonae

**Last updated: 2026-08-19.**

The platform hardening plan is finished (49 of 49 days, all written up in
`platform-hardening-plan.md`). This is what is left over — things that were never
in that plan, or that it deliberately stopped short of.

Nothing here is on fire. The platform is green: 3,072 tests passing, no lint
errors, no dependency vulnerabilities, and the production build compiles on
Node 24.

Each item says what it is in plain English, why it is worth doing, and what it
needs before it can start.

---

## Waiting on Anthony

These cannot start until someone outside the codebase does something.

### 1. Error tracking — connect Sentry

**What it is.** When something fails for a user, we currently find out only if
they tell us. Sentry is the standard tool that catches those failures and shows
them in a dashboard.

**State.** The code side is already built and waiting. `src/lib/reportError.ts`
has the connection point (`setErrorReporter`), and as of the admin-actions work
every failed admin action already reports through it. Right now those reports go
nowhere.

**Needed from Anthony.** A Sentry account, and the project key it gives you.
Free tier is enough to start.

**Size once unblocked.** Half a day.

---

### 2. Real logins for connectors (OAuth)

**What it is.** Connectors let an agent act in another product — send a Slack
message, create a Google Doc. Today there is no way for a customer to grant that
permission properly.

**State.** Blocked on two things: Anthony registering Sonae as an application
with each provider (Google, Slack, and so on), and a decision on where the
resulting access tokens are stored. The second is a security decision, not a
typing one, and it should be made deliberately rather than in passing.

**Needed from Anthony.** Registering the app with each provider you actually
want to support. Worth naming the two or three that matter rather than all of
them.

**Size once unblocked.** Three to four days, plus provider-by-provider work.

---

## Ready to start

Nothing blocks these.

### 3. Three gaps in the agent runtime

Left over from the runtime work (P3.7). All three are real, none is urgent.

- **No live Anthropic call has ever been made.** The Anthropic adapter is tested
  only against simulated responses. It is very likely correct, but "very likely"
  is not the same as having watched it work once. Needs an API key and about an
  hour.
- **Three code paths still call Google Vertex directly** rather than going
  through the provider registry everything else uses: knowledge-base embedding,
  triggered agent objectives, and workflow agent nodes. So those three cannot be
  switched to another AI provider the way the rest can. One to two days.
- **A provider failure before a run starts leaves no record.** If the AI
  provider rejects the request at the very first step, there is no failed run to
  look at afterwards — it simply never appears. Half a day.

### 4. Upgrade the React lint rules

**What it is.** 103 lint warnings currently sit behind a newer version of the
React rules (`eslint-plugin-react-hooks` 7.1), which reports 58 genuine issues
the current version misses. These are the class of bug that causes a screen to
update at the wrong moment.

**Why it matters.** Warnings that nobody clears stop being read. Either fix them
or decide they do not apply.

**Size.** One to two days.

### 5. Collapse the largest admin pages

**What it is.** The original ambition of P4.2. The admin area has 113 pages, the
largest around 1,500 lines each, all hand-written against the same handful of
patterns. Every new feature means writing another one by hand.

**What was already done.** The defect all 49 of those pages shared — leaking
internal errors, reporting nothing, allowing double submits — is fixed. What is
left is their size, which costs time on every new product rather than harming
users.

**Size.** Four to five days, and worth doing just before starting the next
client product rather than now.

### 6. A task connector for workflows — DONE 2026-08-12

Built under `docs/plans/active/tasks-and-notifications-plan.md`, which put the
groundwork in first: a `tasks` table, `/app/tasks`, and an in-app notification
so an assignee is told. A workflow raises one through the `taskNode` node
type; an agent raises one through the `task.create` tool, which is a WRITE and
so needs approval unless that agent has autonomy. Both name a person by email
and resolve it against their own workspace only, so a templated value cannot
address work into another tenant.

### 7. Restore the missing Italian page title

**What it is.** A small one. The Italian translation file had the same section
listed twice; merging them was harmless, but one page title went missing in the
process — the Properties page in Italian.

**Size.** Under an hour.

### 8. Twenty-seven browser tests that have never run

**What it is.** There are 46 browser tests across 13 files. Only the 19 tagged
`@smoke` ever execute. The other 27 sit in the `full-gate` job, which fires
only on a pull request into `main` — and work reaches `main` by direct push,
not by pull request. So that job has effectively never run.

**Why it matters.** This is how two tests in `user-chat-flow.spec.ts` came to
be checking for a screen that had changed months earlier: they were written,
tagged, and never executed until the maintenance plan pulled them into the
smoke set, at which point they failed immediately. The 27 that are still
outside are the ones most likely to have rotted the same way.

**The decision first.** Running all 46 on every push to dev costs roughly four
more minutes a push, which is most of what the pipeline work just saved.
Running them on a schedule — nightly, say — costs almost nothing and finds
rot within a day. Anthony's call, because it is cost against speed of
discovery, not a technical question.

**Size.** An hour to find out whether they still pass. Whatever they turn up
is the real work.

### 9. The weekly security scan has no time limit

**What it is.** `security-audit.yml` sets no `timeout-minutes`, so a wedged run
bills to GitHub's six-hour default — more minutes than a month of normal
pushes. `ci.yml` and `deploy.yml` both cap themselves; this one was missed.

**Size.** One line.

---

## Worth checking when convenient

- **The CI result for today's three pushes has not been read.** All three ran
  the full gate locally first, so a failure would most likely be an environment
  difference rather than the code. Check
  https://github.com/roninsatwork/Sonae/actions — the top three rows.

  **Why it needed a human.** The repo is private, so it cannot be read without
  logging in. The `gh` command line tool is now installed but not logged in, and
  logging it in means handling Anthony's GitHub credentials, which is his to do,
  not mine. Anthony does not use the terminal, so the practical fix is to
  **install the Claude extension in Chrome** — a browser install, no terminal —
  after which CI results can be read in his existing logged-in session and he
  never has to check by hand.
- **Four stray files are left in `adk-python/`.** The maintenance commit
  removed 1,543 tracked files of a vendored ADK copy, but four were never
  tracked, so the delete did not sweep them up: 32KB of Google's a2a logging
  code, untracked and referenced by nothing. Harmless, and litter.
- **The deploy workflows install a Rollup Linux package by hand after
  `npm ci`**, a workaround for an old npm bug (`docs/developer/deployment.md`).
  Now that the project is on npm 11 that workaround may no longer be needed, and
  removing it would make the deploy simpler.

---

## Not tasks — decisions already made, recorded so they are not reopened

- **The Posture Studio movement demo stays in the product repo.** It is fenced,
  not deleted: the platform cannot import it, and the template drops it.
- **npm's block on package install scripts stays on.** See the note in
  `../completed/HANDOVER-platform-hardening.md`.
- **The navigation profiles still name the product verticals** in their hide
  lists. Hiding something that does not exist is harmless, and it means a future
  product inherits the same decision.
- **CI runs the checks and the browser subset on one runner, not two.** Split
  across two jobs they finish sooner in wall-clock but each pays its own
  checkout, Node setup and package restore — about three minutes of getting
  ready, billed twice for one push. The bill was the problem, not the wait.
  Splitting them again would read as an obvious speed-up and would undo that.
- **A release does not repeat the checks that passed on dev.** `main` only
  carries commit SHAs that were already checked on `dev` against the same
  files. The deploy asks whether a passing `CI` run exists for the SHA and runs
  the full set itself when it cannot find one, so the bar never drops. The
  production audit is deliberately outside that rule and runs every time: an
  advisory published since the dev run applies to code that has not changed.
