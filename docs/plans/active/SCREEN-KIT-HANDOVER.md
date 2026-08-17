# Handover — the shared screen kit

**Written 2026-08-16, at the end of Phase 3 and the start of Phase 3.5.**

> **Picking up on 2026-08-17.** Anthony stopped here for the day. The next job is
> the first item of Phase 3.5: build `DataTable`. Read the Phase 3.5 section of
> the plan first — the goal changed during this session and the reason matters.

**State: green.** Typecheck silent, lint 0 errors, 4,917 tests passing across
542 files, build compiles, `npm audit --omit=dev` 0 vulnerabilities, layering
and screen-kit guards pass, `git diff --check` clean.

**Nothing is committed.** The working tree holds all of Phases 1, 2 and 3.
Anthony has not asked for a commit, and a dirty tree here means unfinished on
purpose — ask before committing, and never push unless told.

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
| 3.5 — one table, everywhere | **In progress**, 17.5 days, ~1 done |
| 3.6 — one page header, everywhere | **Deferred** 2026-08-17, 2.5 days, measured |
| 4 — accessibility, in the kit | 1 day |
| 5 — small screens, in the kit | 1 day |
| 6 — a capability can be withheld | 2 days |
| 7 — a plan grants capabilities | 1.5 days |

**Overall: 7 of 32.5 days.**

Phases 4 and 5 need 3.5 done — that is what makes them cheap — but not each
other. Phases 6 and 7 are independent of 1–5 and can be brought forward if
selling in packages becomes the priority.

## Phase 3.5, where it stands — start here tomorrow

**The goal changed mid-session, on Anthony's instruction, and the reason is the
important part.** Moving a screen onto the kit's *parts* does not make it match
the other screens: the parts are assembled by hand each time, and every screen
assembles them differently. The workspace directory used the shared table, the
shared search box and the shared footer and still did not look like the evals
screen — its footer only appeared when there was more to load, and its search box
sat inside a second bordered box. Both were faithful ports of what was there
before, which is exactly the problem. Anthony spotted it from a screenshot.

**His words, which are the brief:** align the styles, shrink the volume of code,
make it more maintainable, preserve all functionality — this is a UI change only.

**Four screens are converted and checked in the browser.** `admin/users`,
`admin/super-admins`, `admin/companies/[id]/users`, `admin/users/[id]` (three
tables on that one). Frozen lists are down from 17+73 to 13+69.

**The kit gained, each proved by breaking its test:**

- `TableShell` `variant` — `default`, `panel` (detail pages), `bare` (no card,
  for a table already inside somebody's panel). `bare` is the option whose absence
  stranded five screens in Phase 2.
- `TableHeaderRow` `variant` — `default` and `strip` (filled band). The cells take
  the variant from their row through context, so a header cannot half-change.
- `ModalField` — one input in a modal with its label tied to it, styled from
  `modalInputClassName` so nothing shifts. `ModalFormField` gained an optional
  `htmlFor` for the select/group cases.
- `common.clearSearch` in both locales; `admin.users.table` and
  `companyUsers.table` gained `showingLoaded` / `loadingMore` / `empty`.

**Next, in order:** build `DataTable` (2 days) → build the shared table-screen
test helper (0.5) → write regression tests for the 35 table screens that have
none, *before* converting them (4) → convert the 64 table screens in batches (6)
→ update the 15 tests that assert the old furniture, inside the batch that
changes their screen (1) → point the entity generator at `DataTable` (0.5) →
tighten the check and lock both lists at zero (1) → the 73 fields (2.5).

**The anti-drift guards are the last thing and the point of the whole phase.**
Anthony asked for them explicitly. The Phase 3 check would not have caught a
single fault found on 2026-08-16 — the workspace directory used every shared part
and still looked wrong, because what drifted was the *assembly*. So: the entity
generator emits a `DataTable` screen (new screens start standard); a screen
importing `TableShell` / `TableHeaderRow` / `SearchBar` / `LoadMoreFooter` /
`PaginationFooter` directly fails the check (you cannot assemble it differently
if you cannot reach the pieces); both allowlists lock at `maxEntries: 0` copying
`convex/authz-migration-allowlist.json`; and the shared test helper asserts the
standard shape at render time, which a source scan can never do.

**Testing is in the plan now, at Anthony's instruction, and it is half the work.**
Of the 64 table screens, 29 have a test and 15 of those assert the exact table
furniture being changed — three broke within the hour on the first four screens.
The other 35 have no test at all, and those get regression tests written
**before** their screen is converted, so they pin what the screen does today
rather than agreeing with tomorrow's code. Every one is then proved by breaking
the code it covers.

**The reference screens to match:** `/admin/ai/evals` (paged) and `/admin/agents`
(load-more). Any converted screen should be indistinguishable from these apart
from its data.

**Give Anthony clickable URLs** for every screen touched, every batch. He asked
for this explicitly — describing a change instead of linking it leaves him blind.

---

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

---

## Raised, not fixed — Anthony's call

- **Manage Team shows Italian to English readers.** Its empty state hardcodes
  `"Nessun Risultato"` and a matching sentence rather than reading either locale
  file. A translation bug, not a kit one.
- **Manage Team's title and description are hardcoded**, so they are untranslated
  too. They were left exactly as they read, because the `admin.users` strings
  say "Access & Identity Control", which is the platform screen's wording and
  not this one's.
- **The vocabulary is heavy in places** — "Protocol Identity", "Clearance
  Level", "Invite Intelligence", "Purge Identity". `admin-ux-plan.md` owns the
  wording pass; this plan does not.
- **The kit's own `SearchBar` fires a query on every keystroke**, while the
  promoted `TableSearchInput` debounces. Worth converging, and not done here
  because it changes behaviour on 49 admin screens.

---

## One visible change already made and recorded

Tasks' "New task" button was brand orange where every other screen's primary
action is the house white pill. It matches now, and it disappears for a
read-only account instead of sitting there doing nothing. Anthony has been told.
