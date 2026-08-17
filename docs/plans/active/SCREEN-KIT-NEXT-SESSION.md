# Handover prompt — paste this into a fresh session

Copy everything below the line.

---

Pick up the Sonae shared screen kit work. Phase 3.5 is about two-thirds done.

**Read these first, in order:**

1. `docs/plans/active/SCREEN-KIT-HANDOVER.md` — state, what is next, the traps,
   and the seven mistakes that cost real time on 2026-08-17. Read the "Hard-won"
   section before touching any screen.
2. `docs/plans/active/shared-screen-kit-plan.md` — the full plan. Phases 1, 2 and
   3 are done and written up. Phase 3.5 is in progress; 3.6 is deferred by
   Anthony. The goal of 3.5 changed twice during that day and the reasons matter
   more than the diff.
3. `docs/developer/screen-kit.md` — the kit itself.

**State:** nine commits on `dev`, tree clean, nothing pushed. Full gate green:
lint clean, typecheck silent, 4,958 tests across 544 files, all four source
guards pass. Use Node 24:
`export PATH="/Users/ants/.local/nodejs/node-v24.18.0-darwin-arm64/bin:$PATH"`.

**Never push.** Every push runs a metered check. Commit locally and wait to be
asked.

## The job

Two shared components now exist and every table screen should use one of them:
`DataTable` for a screen's records, `CompactList` for a short list inside
somebody else's panel. `ModalField` is the modal form field; `TableSearchInput`
and `SearchBar` are the only search boxes.

**Done:** 16 of 17 hand-written tables, 21 of 73 hand-written fields, every
search box in the app (there were sixteen variations), and the entity generator
now emits a standard screen.

**Next, in order:**

1. The **52 remaining hand-written fields**, listed in
   `scripts/screen-kit-allowlist.json` under `inputs`. These are 50-odd separate
   small jobs across 62 distinct stylings — most will look slightly different
   afterwards, so work in batches of a few screens and send Anthony links each
   time. Do **not** trust any claim that they convert invisibly; that was
   measured and it is false.
2. Regression tests for the **35 table screens that have no test at all**, using
   `src/test/standardTableScreen.tsx`. Write them *before* converting a screen so
   they pin today's behaviour.
3. Tighten `scripts/check-screen-kit.mjs`: a hand-written `<thead>` should fail,
   and so should a screen importing `TableShell` / `TableHeaderRow` /
   `SearchBar` / `LoadMoreFooter` / `PaginationFooter` directly instead of
   `DataTable`. Then lock both lists at `maxEntries: 0`, copying
   `convex/authz-migration-allowlist.json`.

**Two decisions still open with Anthony:** the opportunity report table (he said
"leave the opportunity report for now"), and whether to sweep the heavy
vocabulary into plain English — "Protocol Identity", "Neural Frame (Avatar URL)",
"Invite Intelligence", "Protocol User", "Purge Identity", "Clearance Level". He
has twice asked for wording like that to be plainer when it is customer-facing,
so it is likely a yes, but ask.

## How Anthony wants to be worked with

- **Open every update with, unprompted:** `Done:` / `Progress: Phase N: X% ·
  Overall: Y% (a of 32.5 days)` / `Next:` — and a percentage every time.
- **End every update with clickable URLs** to the screens you touched, using real
  record ids taken from the running app. He asked for this explicitly; describing
  a change instead of linking it leaves him blind, and he found two real faults
  within minutes of getting his first set of links.
- **You cannot see his screen.** He works in Safari at about 1300px. The Chrome
  extension connects to a different window pinned at 877px. Check
  `window.innerWidth` before believing any layout check, and say plainly when you
  cannot verify something visually. Admin screens are designed for a MacBook Pro
  13" — roughly 1280px. Do not lower a breakpoint to suit a narrow pane.
- **Never revert his instructions to escape a bug.** Fix the one thing that is
  wrong. Reverting his requested change and calling it "putting it back safely"
  happened twice and both times it was wrong.
- **He is not technical.** Decide technical questions yourself and explain
  plainly. No file paths, no jargon. If he says he does not understand, use
  plainer words or draw it — do not repeat the same explanation, and do not act
  on the confusion.
- **Show full command output, not filtered summaries.** Grepping test output for
  the pass line hides failures you did not think to look for. He objected to this
  specifically.
- **Report faults you find even when they are not yours**, and say clearly which
  are yours. Say when something is unverified.

## Traps

- **`TableShell` draws its own `<table>`.** Pass `<thead>`/`<tbody>`.
- **A footer that only appears when there is more to load is the bug**, not a
  variant. Two screens shipped it. The house footer is always on screen.
- **Never tidy an unused import with a loose pattern.** `s/Search, //` turned
  `debouncedSearch, statusFilter` into `debouncedstatusFilter`. Replace the exact
  line.
- **Read what you delete.** Removing a "now unused" filtered list on Manage Team
  silently dropped a company scope and would have shown one customer another's
  invitations.
- **The allowlist helper must ask the guard, not the filename**, or converting a
  screen's table quietly un-freezes its hand-written field.
- **Prefer fixed grid tracks to negotiated flex** for a layout that must not
  collapse.
- **A test may guard something other than what its name says.** Read it before
  overriding.
- **UI tests render through `src/test/renderWithProviders.tsx`.** There is no
  `@testing-library/user-event`; use `fireEvent`.
- **After writing a test, break the code it covers and confirm it fails.** House
  standard, and it has caught tests that passed for the wrong reason.
