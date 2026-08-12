# Outstanding tasks — Sonae

**Last updated: 2026-07-25.**

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
- **The deploy workflows install a Rollup Linux package by hand after
  `npm ci`**, a workaround for an old npm bug (`docs/developer/deployment.md`).
  Now that the project is on npm 11 that workaround may no longer be needed, and
  removing it would make the deploy simpler.

---

## Not tasks — decisions already made, recorded so they are not reopened

- **The Posture Studio movement demo stays in the product repo.** It is fenced,
  not deleted: the platform cannot import it, and the template drops it.
- **npm's block on package install scripts stays on.** See the note in
  `HANDOVER.md`.
- **The navigation profiles still name the product verticals** in their hide
  lists. Hiding something that does not exist is harmless, and it means a future
  product inherits the same decision.
