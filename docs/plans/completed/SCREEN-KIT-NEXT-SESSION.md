# Handover prompt — paste this into a fresh session

> **Historical — the work this hands over finished on 2026-08-18.** The plan
> lives at `docs/plans/completed/shared-screen-kit-plan.md`, complete except
> page headers, which Anthony closed out for a future plan of their own. Do
> not pick work up from this file.

Copy everything below the line.

---

Pick up the Hakken shared screen kit work. Phase 3.5 is a little over half done.

**Read these first, in order:**

1. `docs/plans/active/SCREEN-KIT-HANDOVER.md` — state, what is next, and two
   "Hard-won" sections. Read both before touching a screen. The second one is
   from 2026-08-17's afternoon and its first entry is the most useful sentence
   in this whole handover.
2. `docs/plans/completed/shared-screen-kit-plan.md` — the full plan. Phases 1–3 are
   done and written up; 3.5 is in progress; 3.6 is deferred by Anthony. The goal
   of 3.5 changed twice and the reasons matter more than the diff.
3. `docs/developer/screen-kit.md` — the kit itself.

**State:** 33 commits on `dev`, tree clean, nothing pushed. Full gate green:
lint clean, typecheck silent, 5,018 tests across 552 files, all four source
guards pass. Use Node 24:
`export PATH="/Users/ants/.local/nodejs/node-v24.18.0-darwin-arm64/bin:$PATH"`.

**Never push.** Every push runs a metered check. Commit locally and wait to be
asked.

## The job

Every table screen should use `DataTable`; every box a person types into should
use `Field`, `TextAreaField`, `ModalField`, `ModalTextAreaField`, or
`InlineSearchInput` for a search box that sits inside something else.

**Done:** 16 of 17 hand-written tables, 60 of 73 hand-written fields, every
search box in the app, and every list screen now carries the numbered footer —
"Showing 1-15 of N", Previous, Page X of Y, Next.

**Next, in order:**

1. **The 8 fields left.** `scripts/screen-kit-allowlist.json` lists 13 under
   `inputs`; five of those are settled decisions with their reasons written into
   the files themselves, so leave them. The eight real ones: the wiki document
   manager, three agent screens (settings, new, skills), one eval form under a
   company's chat logs, and three inside the fenced movement demo.
2. **Regression tests for the table screens that have no test**, using
   `src/test/standardTableScreen.tsx` and `src/test/standardFormScreen.tsx`.
   Write them *before* converting a screen so they pin today's behaviour.
3. **Tighten `scripts/check-screen-kit.mjs`**: a hand-written `<thead>` should
   fail, and so should a screen importing `TableShell` / `TableHeaderRow` /
   `SearchBar` / `LoadMoreFooter` / `PaginationFooter` directly instead of
   `DataTable`. Then lock the field list at `maxEntries: 0` and **the table list
   at 1** — the opportunity report stays, by Anthony's decision.

**The one thing the numbers hide.** The frozen *table* list stands at 1, which
reads as "the tables are done". It only ever counted screens hand-writing a raw
`<table>`. **Only four screens actually use `DataTable`** — the rest import its
parts and assemble them by hand, which is exactly how a list screen ended up
with no paging controls while passing every check. That is step 4 of the phase
and it is much larger than the frozen list suggests. Measure it by `DataTable`
adoption, not by the allowlist.

**Nothing is open with Anthony.** Both questions from the morning were answered
on 2026-08-17: the opportunity report stays hand-written, and plain English is
part of converting a screen rather than a separate pass. The two things left
with him were both cleared the same day:

- **The duplicated widget folder is gone.** It was worse than the four panels
  reported: ten dead files under the company route, byte-identical to the shared
  ones, holding the only tests the live components had. Both routes already
  imported the shared copies. The tests moved to
  `_features/widget-config/`; the dead folder and its two allowlist entries
  went. Both widget screens verified rendering in the real app afterwards.
- **The invitation email no longer sends people looking for Google
  credentials.** The default body told a customer's new starter to "synchronize
  your verified Google credentials", when the login page offers a one-time code,
  an emailed link, *and* Google. It now names none of the three.

## How Anthony wants to be worked with

- **Open every update with, unprompted:** `Done:` / `Progress: Phase N: X% ·
  Overall: Y% (a of 32.5 days)` / `Next:` — a percentage every time.
- **End every update with clickable URLs** to the screens you touched, using real
  record ids taken from the running app. He asked for this explicitly; prose
  about a screen is not evidence about a screen, and he found two real faults
  within minutes of getting his first set of links.
- **Go faster than feels comfortable, in bigger batches.** He said so three times
  on 2026-08-17. Ten to fifteen screens a pass, one gate, one commit — not three
  screens at a time. He also said **keep the tests**; the way to have both is a
  shared test helper, not fewer tests. `src/test/standardFormScreen.tsx` is that
  helper for form screens and makes a screen's test about four lines.
- **Decide technical questions yourself.** He is not technical. If you find
  yourself asking the same question twice and getting "go" back, that is the
  answer — decide, do it, and say plainly what you decided and why.
- **You cannot see his screen.** He works in Safari at about 1300px; the Chrome
  extension connects to a different window. Check `window.innerWidth` before
  believing any layout check, and say plainly when something is unverified.
  Admin screens are designed for a MacBook Pro 13" — roughly 1280px.
- **Never revert his instructions to escape a bug.** Fix the one thing wrong.
- **Show full command output, not filtered summaries.** Grepping test output for
  the pass line hides failures you did not think to look for.
- **Report faults you find even when they are not yours**, say which are yours,
  and say when something is unverified.
- **Correct your own numbers out loud.** The percentage dropped once on
  2026-08-17 because the measure had been wrong, and saying so plainly was the
  right move.

## Traps

**The big one, learned four times in one afternoon: fix it in the kit, not on
the screen.** Four faults turned out to be one missing thing in a shared part —
the search box with no name (28 screens), the text area that could not hide a
label, the modal text area that never tied its label, and the missing search box
for inside a dropdown. **When the same fault appears on a second screen, stop
converting and go and look at what those screens share.**

- **A test can be named for a behaviour and assert a spelling.** Six guards say
  a screen must page from the server and checked for the literal word
  `usePaginatedQuery`. The rule is written once now as `PAGES_ON_THE_SERVER` in
  `src/quality-drift.test.ts`. Read what a test is named for before assuming it
  caught something real — and when you widen one, break the code for real to
  confirm it still bites.
- **A screen can shadow a kit part with a local component of the same name.**
  The customer account page had its own `Field`. Grep for `function Field` and
  friends before believing a name.
- **A JSX comment cannot go where a single expression is expected.** `{/* … */}`
  after `? (` or inside `footer={` breaks the parse, and the error points at a
  closing tag thirty lines away. Use a plain `/* … */`, or put it inside the
  element.
- **`TableShell` draws its own `<table>`.** Pass `<thead>`/`<tbody>`.
- **A footer that only appears when there is more to load is the bug**, not a
  variant. All ten offenders are fixed; three keep the load-more footer on
  purpose and are named in the plan.
- **Never tidy an unused import with a loose pattern.** Replace the exact line.
- **Read what you delete.** Removing a "now unused" filtered list on Manage Team
  silently dropped a company scope and would have shown one customer another's
  invitations.
- **The allowlist helper must ask the guard, not the filename.**
- **A page that unwraps its route params suspends on first render.** Use
  `src/test/routeParams.ts` rather than a suspense boundary.
- **Some routes are one-line aliases to another route's page**, so the URL will
  not match the file you edited.
- **UI tests render through `src/test/renderWithProviders.tsx`.** There is no
  `@testing-library/user-event`; use `fireEvent`.
- **After writing a test, break the code it covers and confirm it fails.** House
  standard, and it caught several tests today that would otherwise have passed
  for the wrong reason.
