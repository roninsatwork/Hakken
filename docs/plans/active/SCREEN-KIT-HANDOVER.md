# Handover — the shared screen kit

**Written 2026-08-16, at the end of Phase 3 and the start of Phase 3.5.**

> **Picking up after 2026-08-17.** Phase 3.5 is over half done. Read the Phase
> 3.5 and 3.6 sections of the plan first — the goal changed twice during that
> day, on Anthony's instruction, and the reasons matter more than the diff.

**State: green.** Typecheck silent, lint 0 errors, 5,018 tests passing across
552 files, all four source guards pass, `git diff --check` clean.

**Committed locally, never pushed.** 33 commits on `dev`, 23 of them from
2026-08-17's second session. Nothing has been pushed — every push runs a metered
check and he has not asked for one.

---

## Read first

`docs/plans/active/shared-screen-kit-plan.md` — the whole plan, with Phases 1
and 2 written up: what was built, why each decision, and what was deliberately
not done. Phases 3 to 7 are still to do.

`docs/developer/screen-kit.md` — the developer guide for the kit itself. It was
`shared-admin-ui.md` until Phase 1.

---

## How to work (standing instructions from Anthony, who is not technical)

- **Open every update with, unprompted, every time:**
  ```
  **Done:** …
  **Progress:** Phase N: X% · Overall: Y% (a of 14.5 days)
  **Next:** …
  ```
- **Never present technical choices.** Decide, then explain in plain language.
- **Keep updates short.** Lead with the result, then one or two plain sentences
  of why. No file paths, no jargon, no line numbers in what he reads.
- **Talk while working.** Don't disappear into long silent verification runs.
- **Always take the best-practice option.** If the proper fix is blocked by a
  missing check, fix the check first rather than take the shortcut.
- **Build only what was asked for.** No extras with good justifications.
- **Removed stays removed.** Don't restore or widen scope without asking.
- **Look at the real app in his Chrome** before calling any UI work done. Never
  ask him to check it himself.
- He is **red/green colour blind** — never make colour the only signal.

---

## Where the work stands

| Phase | State |
|---|---|
| 1 — the kit moves into reach | **Done** |
| 2 — the client-facing screens get on it | **Done** |
| 3 — the wrong thing fails the build | **Done** |
| 3.5 — one table, everywhere | **In progress**, 17.5 days, ~10.5 done |
| 3.6 — one page header, everywhere | **Deferred** 2026-08-17, 2.5 days, measured |
| 4 — accessibility, in the kit | 1 day |
| 5 — small screens, in the kit | 1 day |
| 6 — a capability can be withheld | 2 days |
| 7 — a plan grants capabilities | 1.5 days |

**Overall: 17 of 32.5 days (52%).**

Phases 4 and 5 need 3.5 done — that is what makes them cheap — but not each
other. Phases 6 and 7 are independent of 1–5 and can be brought forward if
selling in packages becomes the priority.

## Phase 3.5, where it stands

**The goal changed twice on 2026-08-17, both times because Anthony pushed, both
times correctly.** First from "use the shared parts" to "there is one table" —
because moving a screen onto the *parts* does not make it match, since the parts
get assembled by hand and everyone assembles them differently. Then again on the
footer: a lone "Load more" button is not a variant of the house footer, it is the
drift. He had to say that three times before it was done, because "preserve all
functionality" had been read as "keep each screen's paging control". The control
is format. What a screen *fetches* is functionality, and that is untouched.

**Built, each proved by breaking its tests:**

- `DataTable` — the whole arrangement: search box, card, header, loading row,
  empty row, footer. A screen supplies columns, rows and its empty message.
- `CompactList` — a short list inside somebody else's panel. No card, no search,
  no footer, no minimum width, and no heading row unless a column asks for one.
  Those five absences are exactly why four screens could not use `DataTable`.
- `ModalField` — one input in a modal with its label tied to it.
- `usePagedRows` — page numbers over a list a screen has already assembled, for
  tables that stitch two queries together. Matches `useServerPagedTable`.
- `src/test/standardTableScreen.tsx` — the floor every table screen must clear,
  callable from any screen's test.

**Done: 16 of 17 hand-written tables, and 60 of 73 hand-written fields.**
Every search box in the app is now the shared one — there were sixteen
variations. The entity generator emits a `DataTable` screen.

**The one table left is settled, not parked.** The opportunity report stays
hand-written — Anthony, asked twice, on 2026-08-17: *"opp report - leave as
is."* So the table list locks at **1**, not 0, and that entry wants its reason
written beside it rather than reading as an unfinished job.

**The 13 fields left are 8 real jobs and 5 settled decisions.**

The eight: the wiki document manager, three agent screens (settings, new,
skills), one eval form under a company's chat logs, and three inside the fenced
movement demo.

The five are decisions, not unfinished work, and **each one now carries its
reason as a comment in the file itself** as well as in the frozen list — so
nobody "finishes" them by mistake:

| Screen | Why it stays |
|---|---|
| `WidgetPreviewPanel` | Its boxes are a mock-up of the customer's own chat widget, styled to look like the customer's site. The house field would restyle a preview of somebody else's website. There were two of this file until 2026-08-17; only the shared one is left. |
| `MoneyViewScreen` | Two boxes inside a sentence, already named by their wrapping label. Stacking a label above a full-width box turns one line into three. |
| `SettingBlock`'s opacity box | Same shape: a number, then a per-cent sign, mid-sentence. |
| `app/tasks` | A grouped list with its own due-date row, recorded as a decision when Tasks first moved onto the kit. |

**An earlier claim in this document that the fields would convert invisibly was
wrong** — it came from checking one screen and generalising. Most look at least
slightly different, so they need Anthony's eye in batches.

**Converting a screen now includes fixing its words.** Standing instruction from
2026-08-17, given after he looked at a converted rule screen: *"any screen you
see needs friendly wording that's easy to understand."* Do not convert a screen
and leave jargon on it, and do not ask again — it has been answered. The
vocabulary problem is much wider than the six phrases named further down this
document; the six rule screens alone carried eight more.

**Next, in order:** the 8 remaining fields in small batches with links each time →
regression tests for the 35 table screens with none → tighten the check so a
hand-written `<thead>` and a direct import of the table's parts both fail, and
lock the field list at `maxEntries: 0` and the table list at 1.

---

## Hard-won, on 2026-08-17

- **I could not see Anthony's screen and did not realise for hours.** He works in
  Safari at about 1300px; the Chrome extension connects to a different window
  pinned at 877px. Three "verified" layout claims were made against a width where
  the fault could not appear, and he found each one. **Check
  `window.innerWidth` before believing any layout check**, and say so when it is
  not the design width. See [[admin-screens-target-macbook-pro-13]].
- **Do not revert his changes to escape a bug.** He asked for a side-by-side
  preview; one width value was mismatched; I reverted the whole thing and called
  it "putting it back safely". It was undoing his instruction. Fix the one value.
- **A screenshot taken seconds after an edit may predate the rebuild.** That is
  what made the revert look justified.
- **Fragile layouts: prefer fixed grid tracks to negotiated flex.** The widget
  preview could overrun the form and squash it to one word per line. Two grid
  tracks cannot do that.
- **Never tidy an unused import with a loose pattern.** `s/Search, //` turned
  `debouncedSearch, statusFilter` into `debouncedstatusFilter`, which would have
  sent the wrong filter to the database. Replace the exact line.
- **A test may be guarding something other than what its name suggests.** The
  widget page's "keeps content full-width" test was really protecting a removed
  navigation rail; the column layout was incidental. Read before overriding.
- **The allowlist helper must ask the guard, not the filename.** Removing a
  screen from both lists because its table was converted silently un-froze its
  hand-written field. The guard caught it in a minute.

## Hard-won again, on 2026-08-17's second session

- **Fix it in the kit, not on the screen.** Four faults this session turned out
  to be one missing thing in a shared part, each affecting many screens at once:
  the kit's `SearchBar` had no name (28 screens), its text area could not hide a
  label (four wiki boxes), the modal text area never tied its label (every modal
  with a paragraph box), and no search box existed for inside a dropdown (four
  screens, and the lock itself). **When the same fault appears on a second
  screen, stop converting and go and look at what they share.**
- **Six guard tests were named for a behaviour and asserted a spelling.** They
  say the screen must page from the server and checked for the literal word
  `usePaginatedQuery`; `useServerPagedTable` calls exactly that. Every screen
  moved onto the house footer read as a regression. The rule is now written once
  as `PAGES_ON_THE_SERVER` in `src/quality-drift.test.ts`. **Read what a test is
  named for before assuming it caught something real** — and equally, do not
  widen one without checking it still fails for the right reason.
- **A screen can shadow a kit part with a local component of the same name.**
  The customer account page had its own `Field`, so the screen that most looked
  like it was using the shared field was the one screen that could not. Grep for
  `function Field`, `function SearchBar` and friends before believing a name.
- **A JSX comment cannot go where a single expression is expected.** `{/* … */}`
  immediately after `? (` or inside `footer={` breaks the parse, and the error
  points at a closing tag thirty lines away. Use a plain `/* … */` inside an
  expression, or put it inside the element.
- **The frozen table count was misleading and nobody noticed for a day.** It
  counts screens hand-writing a raw `<table>`, and stood at 1 — which reads as
  "tables are done". Only four screens actually use `DataTable`; the rest import
  its parts and assemble them by hand, which is exactly how a list screen ended
  up with no paging controls while passing every check. **The number to watch for
  step 4 is `DataTable` adoption, not the frozen list.**



## Agenda for the morning of 2026-08-17 — "we need more rules than this"

Anthony's words, at the end of 2026-08-16. He is right, and the numbers below say
by how much. **These are measurements, not proposals** — the discussion is his,
and the standing rule is that a brainstorm starts with a code check rather than
with opinions. Scanned across 303 screens under `(dashboard)`.

| Drift class | What is there now |
|---|---|
| **Buttons** | **411 raw `<button>`.** The shared `PagePrimaryAction` is used **5 times.** The white primary pill alone is written **24 different ways** across 48 uses. |
| **Cards and panels** | **429 distinct spellings** across 676 uses. Almost every card in the app is spelled uniquely. |
| **Corner radius** | **20 different values** across 1,175 uses. Four account for most of it — 8px (351), 10px (293), 12px (169), 16px (122). |
| **Loading spinners** | **39 spellings** across 204 uses, and half of those differ only by writing `w-4 h-4` versus `h-4 w-4`. |
| **Selects** | 50 raw `<select>` against 10 uses of the shared `Select`. |
| **Textareas** | 48 raw `<textarea>`. |
| **Status pills** | 13 spellings across 18 hand-written, plus `StatusPill` used 11 times. |
| **Empty states** | `SonaeEmptyState` 12, `TableEmptyRow` 41 — and hand-written ones besides. |
| **Detail pages** | `DetailLayout` used **3 times**, despite being built for exactly this. |

**Buttons and cards are the two big ones**, and buttons is the biggest single
drift class in the codebase — bigger than tables and headers combined.

**Corner radius has a precedent already sitting in this repo.** It is the same
shape of problem as z-index was: a magic number picked by hand in a thousand
places. That was solved by `src/ui/lib/layers.ts` — a named scale — plus
`scripts/check-layering.mjs` to stop new ones. Whatever is decided for radius,
the mechanism does not need inventing.

**Do not walk into this discussion with a plan already written.** Anthony asked
to discuss it, not to be handed conclusions. The numbers are the contribution.

---

## The kit, as it stands

`src/ui/components/screens/` — `Table` (shell, header row and cell, loading and
empty rows, row actions, both footers), `PageHeader`, `DetailLayout`,
`DetailTabs`, `ModalForm`, `Select`, `SettingsCard`, `SaveControls`,
`ConfirmationModal`, `AccessLevel`, `Field`, `TableControls`,
`CursorPagination`, `pagination`. The paging hook is
`src/hooks/useServerPagedTable.ts`.

`AdminRulesTable` and the memory, evidence and governance panels stayed under
`src/app/(dashboard)/admin/_components/` because they are genuinely
admin-specific.

---

## Phase 3, as built

`scripts/check-screen-kit.mjs`, run by `npm run check:screen-kit` and by
`check:guards` — CI's first step, alongside the layering and pagination guards.
`scripts/screen-kit-allowlist.json` freezes 17 hand-written tables and 73
hand-written fields, **as two lists, one per rule**, so a screen frozen for its
old table still fails on a new hand-written field. Both lists may only shrink,
and the check fails on a frozen entry that no longer needs to be there.

The five `/app` entries are exactly the ones Phase 2 reasoned. Tick boxes,
radios, file pickers, colour swatches, sliders and hidden inputs are outside the
rule: the kit has no part for them, so flagging one would be a build failure
with no correct fix.

Proven by doing it, not describing it: a new screen at `app/reports/weekly/`
hand-writing both a table and a search box made `npm run check:guards` exit 1,
naming both lines, and turned the unit suite red at the same time. Deleted
afterwards. The check's own 13 tests were each proved by breaking the check —
five ways, all caught.

## Phase 4, in detail — the next job

Add `axe-core` / `jest-axe` and assert every part under
`src/ui/components/screens/` against it, then fix what it finds *in the kit*
rather than across 316 screens: labels tied to inputs, focus order, keyboard
operation of the table and modal, roles on the detail tabs, contrast. Colour is
never the only signal — a status must carry text too. The suite joins the
standard run so it cannot regress.

**Done when:** every shared part passes axe with no violations, and a
deliberately broken part fails the test.

Worth knowing before starting: `Field` already makes the label-to-input
association non-optional, and `RowIconButton` already requires a label, so those
two classes of violation are fixed at the source. The screens still hand-writing
a field are the 73 in the frozen list — the kit is the place to fix this, and
that list is how you find them.

---

## Traps, learned the hard way in this work

- **Use Node 24.** `export PATH="/Users/ants/.local/nodejs/node-v24.18.0-darwin-arm64/bin:$PATH"`.
  The repo's `verify:env` refuses otherwise.
- **`TableShell` draws its own `<table>`.** Pass `<thead>`/`<tbody>`, never a
  `<table>`. Two governance screens did the latter and rendered a table nested
  inside an empty table. Check the live DOM, not just the screenshot:
  `[...document.querySelectorAll('table')]` and look for a nested one.
- **The layering guard reads comments too.** Explaining an old `z-[100]` in
  prose re-trips it. Describe the value in words, not the class name.
- **A scripted rename hits Markdown as well as code.** A rename script run over
  `docs/` retro-edited historical and completed plans, which are a record of
  what was true then. Restrict such scripts to `src/`, `scripts/` and the
  specific docs you intend to update.
- **UI tests must render through `src/test/renderWithProviders.tsx`**, not
  `@testing-library/react` directly.
- **`@testing-library/user-event` is not a dependency.** Use `fireEvent`; 73
  test files already do.
- **Don't invent a `PAGE_SIZE`.** Three screens define their own local one,
  which is why the shared constant is `TABLE_PAGE_SIZE`.
- **After writing a test, break the code it covers and confirm it fails.** This
  is the repo's standing standard and it has caught tests that passed for the
  wrong reason.
- **A test that writes a probe file into `src/app/(dashboard)` must delete it in
  `afterEach`.** A stray `.tsx` left there is picked up by the typecheck and by
  the screen-kit guard itself, and the failure will look like it came from
  whatever you were actually working on.
- **Checking the Comax workspace screens** means impersonating that workspace
  from `/admin/companies`. Put it back to **Ronins Website — Knowledge**
  afterwards; that is how it was found.
- **A page that unwraps its route params suspends on first render**, so a test
  rendering it directly hangs on an empty page and the error names the query,
  not the cause. `src/test/routeParams.ts` hands it params it can read straight
  away. Reach for that before reaching for a suspense boundary.
- **Some routes are one-line aliases to another route's page.** The customer
  rule screens live at `companies/[id]/rules/*` and are also served from
  `companies/[id]/ai/rules/*` by a one-line re-export — so the URL in the
  browser will not match the file you edited, and a screen can look
  unconverted when it is the same file. Check for a re-export before concluding
  there are two copies.
- **A screen can carry stray tab characters mid-attribute.** Four of the rule
  screens did, between `<input` and its `value=`. An edit matched on the
  untabbed text silently fails to find its target; match the exact bytes.

---

## Raised, not fixed — Anthony's call

- **Manage Team shows Italian to English readers.** Its empty state hardcodes
  `"Nessun Risultato"` and a matching sentence rather than reading either locale
  file. A translation bug, not a kit one.
- **Manage Team's title and description are hardcoded**, so they are untranslated
  too. They were left exactly as they read, because the `admin.users` strings
  say "Access & Identity Control", which is the platform screen's wording and
  not this one's.
- ~~**The vocabulary is heavy in places.**~~ **No longer raised — being fixed.**
  Anthony's instruction on 2026-08-17 is that a screen being converted gets its
  words fixed at the same time, so this plan now owns the wording on every
  screen it touches. `admin-ux-plan.md` still owns a wider design pass. The six
  rule screens are done; "Protocol Identity", "Clearance Level", "Invite
  Intelligence", "Purge Identity" and "Neural Frame" are still out there.
- **The kit's own `SearchBar` fires a query on every keystroke**, while the
  promoted `TableSearchInput` debounces. Worth converging, and not done here
  because it changes behaviour on 49 admin screens.

---

## One visible change already made and recorded

Tasks' "New task" button was brand orange where every other screen's primary
action is the house white pill. It matches now, and it disappears for a
read-only account instead of sitting there doing nothing. Anthony has been told.
