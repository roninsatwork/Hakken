# Every Screen Is Built From The Same Parts

> **COMPLETE — 2026-08-18.** Every phase is done except 3.6 (page headers),
> which Anthony closed out of this plan on 2026-08-18 to be revisited in a
> separate plan. One deploy-day step remains and is not build work: the
> one-shot migration `2026-08-18-core-company-modules-backfill` must run in
> the deploy that takes the capability switch live.

**Agreed 2026-08-16.** Hakken is the base layer that gets cloned to build the next
product on top. This plan is about what a clone would otherwise have to build
again: a screen kit both halves of the app can reach, accessibility and small
screens built into that kit once, and a way to sell a capability rather than
only build it.

It changes no screen's design and adds no product feature.

---

## What is actually wrong

### 1. The kit exists, and it is locked in the admin folder

This is the finding that reframed the plan, and it is better news than it
sounds. `src/app/(dashboard)/admin/_components` holds a real, working kit:

| Piece | Screens using it |
|---|---|
| `AdminTable` | 49 |
| `AdminPageHeader` | 36 |
| `AdminDetailLayout`, `AdminDetailTabs`, `AdminModalForm`, `AdminSelect`, `AdminSettingsCard`, `AdminSaveControls`, `AdminConfirmationModal` | across the 220 admin screens |
| `_lib/useServerPagedTable.ts`, `_lib/pagination.ts` | server paging, search and filtering |

Nobody is avoiding shared parts. Where one exists, it gets used.

The problem is that it sits inside a product folder, so the screens a client
actually uses cannot reach it. Of the 48 screens under `/app`, **4** touch
anything from that kit. The rest hand-write what already exists twelve inches
away: 12 write their own `<table>`, 10 their own `<input>`. The Sales Data
workspace went as far as building its own `TableControls` (293 lines) and
`CursorPagination` (119 lines) rather than reuse admin's.

Measured 2026-08-16:

| Area | Screens | Lines |
|---|---|---|
| `admin/**` | 220 | 42,953 |
| `app/**` | 48 | 13,508 |
| `src/ui/**` (the actual shared layer) | 34 | — |

`src/ui` holds the app chrome — header, sidebar, chat, charts — plus
`SonaeModal`, `SonaeEmptyState`, `StatusPill`, `input`, `typography`,
`TimeframeDropdown`, `JsonSchemaBuilder`. `SonaeModal` is used by 38 screens,
which is the same lesson again: put a part in reach and it gets used.

**So the work is promotion, not invention.** That is a materially smaller and
safer job than building a kit from nothing.

### 2. Nothing checks a screen is usable by everyone

There is no accessibility testing of any kind. No `axe` dependency, no
accessibility assertion in 425 test files.

Screens carrying any accessibility markup at all:

| Area | With `aria-` | Of |
|---|---|---|
| `admin/**` | 52 | 220 |
| `app/**` | 13 | 48 |
| `src/ui/**` | 11 | 34 |

Every product cloned from Hakken inherits this. It is the class of problem that
loses an enterprise or public-sector deal at procurement rather than at pitch,
and it is far cheaper to fix in a kit of ten parts than in 316 screens.

### 3. Six screens in ten do not work on a small screen

Screens using any responsive layout: 82 of 220 admin, 25 of 48 app, 9 of 34
shared. The rest are desktop-only by accident rather than by decision. Some
should be desktop-only — that is a legitimate choice, but it has never been
made.

### 4. A capability can be built but not sold

`companies.enabledModules` exists, `utils/companyModules.ts` enforces it
**server-side**, not just in the menu. The mechanism is right.

It is wired to exactly one capability: Sales Data. Reception, Calls, Properties,
Reports, Wiki, Governance and Tasks cannot be withheld from a client who has not
bought them, and cannot be given to one client ahead of the rest.

### 5. A plan sets a message count and nothing else

The `plans` record is `name`, `description`, `messageLimit`, `priceGBP`,
`isActive`. A plan cannot grant a capability. Any product built on Hakken that
wants Starter / Pro / Enterprise tiers has to invent tiering for itself.

---

## Decisions

### The remaining work is admin-only

**Anthony, 2026-08-18: *"please do not touch the posture studio or the user front
end in this plan — it's an admin only plan."*** Everything still to be converted
lives under `src/app/(dashboard)/admin/`. Nothing under `app/` or `demos/` is to
be worked in this plan, and the six screens still on the frozen list from those
areas stay frozen rather than becoming a queue:

- `app/[workspace]/customers`, `import-data`, `spreadsheet-import`
- `app/[workspace]/opportunity-report` — already a settled decision
- `app/profile/ProfileTabs`
- `app/tasks`

Frozen is the right resting place for them. The build check refuses any *new*
hand-assembled table anywhere, so these cannot get worse; they simply will not
get better under this plan. Whoever next works on one of those screens for its
own reasons can move it across then.

**What was already touched before this was said**, and is left as it stands
rather than reverted — say if you would rather it came back out:

- `app/governance/policies` and `app/governance/register` — converted, and given
  the search box, filters and page numbers their platform twins already had.
- `app/settings/team` — converted; also where two sentences of hardcoded Italian
  were found and removed.
- `app/properties/scraped-data` and `app/arcade/ronins-run` — converted.
- `demos/movements/_components/MovementLibraryTable` — converted, and its
  "Loading posture studio..." text row replaced with the kit's spinner.
- `app/profile/ProfileTabs` — not converted, but its device column was fixed
  (every iPhone sign-in had been reported as a Mac) and it gained a search box.

### Promote what works; do not design a new kit

The admin kit has been used across 220 screens and has tests. It moves to the
shared layer under neutral names and keeps its behaviour. Anything genuinely
missing gets added there, not invented in parallel.

### Two kits become one, including the workspace's

`TableControls` and `CursorPagination` fold into the shared table. Keeping a
second implementation because it is already written is how there came to be two.

### The rule is enforced by a check with a shrinking allowlist

This repo already has the pattern twice — `scripts/check-layering.mjs` with
`layering-allowlist.json`, and `convex/authz-migration-allowlist.json` at
`maxEntries: 0`. A new screen that hand-writes a table or a bare input fails the
build. Screens that already do are frozen in a list that may only shrink.

A rule nobody enforces is a preference, and preferences lose to deadlines.

### Accessibility and small screens are properties of the kit

Not a pass over 316 screens. Fix the ten parts, and every screen built on them
inherits it — including the screens of every product cloned from here. Screens
that stay desktop-only are named as a decision.

### No screen changes how it looks

If a screen looks different after this work, that is a defect in the work, not a
feature of it. Design changes belong to `admin-ux-plan.md`, which owns them.

---

## Current state (verified 2026-08-16)

Confirmed present and working — not to be rebuilt:

- Tenant isolation enforced structurally: `convex/authzEnforcement.test.ts`
  fails CI for a function using raw `query`/`mutation`; the allowlist is at
  `maxEntries: 0` with nothing pending.
- Migration and backfill tooling: `convex/dataMigrations.ts`, batched with
  status reporting. (`PRODUCT.md` §10 is stale on this and is corrected in
  Phase 6.)
- Entity scaffolding: `scripts/generate-entity.mjs` generates a new entity with
  its tenant guard, both locales and a real test.
- Five roles, not three: `USER`, `ADMIN`, `SUPER_ADMIN`, `READ_ONLY`, `AUDITOR`.
- Rate limiting, audit logging, governance surfaces, plan quotas, locale parity.

Confirmed absent (searched, zero matches):

- Any `axe` / accessibility dependency or test.
- Any feature-flag mechanism beyond `enabledModules`.
- Any capability grant on a plan.

---

## Phase 1 — The kit moves into reach — DONE 2026-08-16

Move `admin/_components` into `src/ui/components/screens` under neutral names:
`Table`, `PageHeader`, `DetailLayout`, `DetailTabs`, `ModalForm`, `Select`,
`SettingsCard`, `SaveControls`, `ConfirmationModal`, `AccessLevel`. `_lib/`
paging helpers move with them.

- Admin screens keep working throughout; the move is import paths, not markup.
- `AdminDetailLayout`, `AdminDetailTabs` and `AdminRouteSubmenu` come off
  `layering-allowlist.json` while they are open — that list may only shrink, and
  this is the moment.
- Existing component tests move with their components and must pass unchanged.
- Nothing renders differently. Snapshot the sidebar characterisation test before
  and after.

**Done when:** the whole gate is green and no screen has changed on screen.

### What was built

Eleven components and their ten tests moved to `src/ui/components/screens/`:
`Table`, `PageHeader`, `DetailLayout`, `DetailTabs`, `ModalForm`, `Select`,
`SettingsCard`, `SaveControls`, `ConfirmationModal`, `AccessLevel`,
`RouteSubmenu`. `pagination.ts` moved with them; `useServerPagedTable.ts` went
to `src/hooks/` where the house keeps hooks. 43 exported names lost their
`Admin` prefix; 163 files were rewritten. Feature-specific parts — the rules
table, safety warnings, memory fields, evidence and governance panels — stayed
in `admin/_components`, which is what they are.

`ADMIN_PAGE_SIZE` became `TABLE_PAGE_SIZE` rather than `PAGE_SIZE`: three
screens already define a local `PAGE_SIZE`, and a shared name that collides
with a local one on import is a trap.

The three frozen z-index entries came off `layering-allowlist.json`, which
shrank from 70 to 67. Each hardcoded number mapped to an existing role —
`PAGE_CHROME` for the detail header, `CONTENT` for its body, `PAGE_MENU` for
both dropdowns. The tab dropdown's `z-[100]` looked like it meant "above
everything"; it sits inside `DetailLayout`'s own stacking context and never
escaped it, so only the local order was ever real and `PAGE_MENU` is exactly
right. Worth knowing: the layering guard reads comments too, so explaining the
old value in prose re-trips it — describe it in words, not the class name.

### How it was verified

Typecheck silent, lint clean, 4,898 tests passing across 541 files, build
compiles, `npm audit --omit=dev` 0 vulnerabilities, layering guard passes.

Driven in the browser rather than assumed: the agents list (table, search,
header), an agent detail page, a company detail page and System Settings all
render as before with no console errors. The two stacking behaviours were
exercised directly — a tab dropdown opens and covers the page beneath it, and
the account menu still draws over the detail header, which is the regression
the layer scale exists to prevent.

The scaffolder was proved rather than eyeballed: `generate-entity.mjs` was run
for real, and the generated screen's kit imports resolved with zero errors —
the only failures were the Convex schema steps the generator itself tells you
to do next. The generated files were then removed.

## Phase 2 — The client-facing screens get on it — DONE 2026-08-16

The 48 screens under `/app`, in this order: Tasks, Calls, Reception, Reports,
Properties, then the workspace screens.

- 12 hand-written tables become the shared table.
- 10 hand-written inputs become the shared input.
- `TableControls` and `CursorPagination` fold into the shared table; the
  workspace screens move onto it and the two files go.
- Server paging, search and filtering come with the shared table — several of
  these screens do not have them today and will gain them for free.

**Done when:** no screen under `/app` hand-writes a table or a bare input, and
each one looks the same or better.

### In progress — started 2026-08-16

**The scope was over-counted at plan time.** Twelve `/app` screens contain
`<table>`, but two of them — governance policies and register — were already on
the kit, and a `<table>` inside `TableShell` is how the kit is meant to be
read, not a hand-written table. **Ten screens genuinely hand-write one.**

**A defect found on the way.** Those two governance screens passed a `<table>`
*into* `TableShell`, which draws its own — so the page carried a table nested
inside a table, the outer one empty. Confirmed in the live DOM (two tables, the
outer with zero rows) before changing anything, and confirmed as one table with
two rows afterwards. Nothing else in the app does this: all 49 admin screens
use the kit correctly, so this came from `/app` copying the pattern by eye
rather than importing it — which is the argument for Phase 3 in one example.

**Done so far**

- **The kit gained a field.** `Field` and `TextAreaField`, built from the
  existing `FieldLabel` and `fieldClassName` so nothing shifts visually, with
  the label-to-input association made non-optional. That association is the
  part 88 screens were skipping: a label that does not address its input is
  unlabelled to a screen reader and does not focus on click, and neither is
  visible to whoever wrote the screen. Eleven tests, each proved by breaking
  the component and watching them fail.
- **`labelHidden`** for a field whose purpose is already obvious on screen — a
  quick-add row, a search box under its own heading. The label still exists and
  still addresses the input; only the visible text goes.
- **Tasks** is on `PageHeader`, `PagePrimaryAction`, `Select` and `Field`.
- **Governance policies and register**: nested tables fixed.

**One deliberate visual change.** Tasks' "New task" button was brand orange
where every other screen's primary action is the house white pill; on
`PagePrimaryAction` it now matches. It also disappears for a read-only account
instead of sitting there doing nothing, which is a correctness gain, not a
style one. Recorded here rather than done quietly.

**Two parts deliberately not forced on.** Tasks keeps its own show-more control
rather than the kit's `LoadMoreFooter`: that footer is a table footer, with the
rule and fill to match, and Tasks is a grouped list. Its due-date input keeps
its wrapping `<label>`, which is a real association already — `Field` stacks,
and stacking would break the row. A kit is worth having because parts fit, not
because everything is made to.

### The ten screens, one by one

**Fully on the kit (5).** Manage Team, Scraped Data, Customers, Spreadsheet
Import, Import Data — shell, header row, header cells, search, paging footer
and row actions, as each screen had them.

**Partly on the kit (2).** Profile's login history and the arcade leaderboard
took the paging footer and the page handler, and kept their own shell and
header row: both draw a filled header strip the kit's row does not have, and
converging that would have changed how they look for no gain. Their footers
were the fourth and fifth copy of the same markup, which is the part worth
sharing.

**Deliberately left (3).**

- **The dashboard ledger.** A designed panel with its own card fill and title
  strip, not a data table screen. `TableShell` would restyle it.
- **The opportunity report's table.** Its header cell is a different thing —
  `py-2 pr-4`, uppercase, muted, inside a report — not the house table's cell.
  Its local `Th` stays for that reason; the other two copies did not.
- **The account page's line items.** A small table inside an existing panel.
  Wrapping it in the shell would put a card inside a card.

These three, plus the two partials, are the input to Phase 3's allowlist:
frozen with the reason written down, and that list may only shrink.

### What the kit gained on the way

- **`Field` and `TextAreaField`**, with the label-to-input association made
  non-optional, and `labelHidden` for a field whose purpose is already on
  screen. Eleven tests, each proved by breaking the component.
- **A `header` slot on `TableShell`**, mirroring `footer`. The import history
  carries a title inside its card; without a slot the only options were to lift
  the heading out of the border or keep hand-writing the shell.
- **`TableControls` and `CursorPagination` promoted out of the workspace
  folder.** The debounced server-side search box, the filter dropdown, and
  cursor paging were better than what the kit had — the kit's own `SearchBar`
  still fires on every keystroke — and they were trapped in a product folder
  exactly as the kit had been trapped in admin.

### The duplication that was actually there

Counted while converting, not estimated: **three** copies of the header cell
(two now delegate to the kit), **five** copies of the paging footer, and
**four** copies of the same next-page/previous-page handler pair. The handler
is now one function shape that the shared footer asks for.

### How it was verified

Typecheck silent, lint clean, 4,904 tests passing, build compiles, audit clean,
layering guard passes, `git diff --check` clean.

Every converted screen was driven in the browser and checked in the live DOM
for table count, table nesting and footer text — Tasks, Manage Team, Scraped
Data, Governance policies, Customers, Spreadsheet Import and the profile login
history. Checking the Comax workspace screens meant switching the impersonated
workspace; it was switched back to Ronins Website — Knowledge afterwards.

**One fix that came out of looking rather than reading:** Manage Team's edit and
delete buttons carried no label at all — "button, button" to a screen reader,
and no tooltip. `RowIconButton` makes the label a required argument, so they
have one now.

## Phase 3 — The wrong thing fails the build — DONE 2026-08-16

`scripts/check-screen-kit.mjs`, in the shape of `check-layering.mjs`:

- A file under `src/app/(dashboard)` containing `<table` or a bare `<input`
  fails, naming the shared part it should use.
- `scripts/screen-kit-allowlist.json` freezes what remains, with the same
  standing note: this list may only shrink.
- Wired into `npm run lint` so CI enforces it, with its own test as the other
  check scripts have.

**Done when:** adding a hand-written table to a new screen fails CI, proven by
doing it.

### What was built

`scripts/check-screen-kit.mjs`, run by `npm run check:screen-kit` and by
`check:guards`, which is CI's first step — the same place the layering and
pagination guards run. `scripts/screen-kit-allowlist.json` freezes what was
already there: **17 hand-written tables and 73 hand-written fields.**

**The frozen list is per rule, not per file.** `layering-allowlist.json` is one
flat array because it has one rule; this has two, and a single list would mean a
screen frozen for its old table could quietly gain a hand-written field and pass.
The five `/app` entries are exactly the ones Phase 2 named and reasoned: the
dashboard ledger, the opportunity report's own header cell, the account page's
line items, and the two filled header strips on Profile and the arcade.

**Tick boxes, radios, file pickers, colour swatches, sliders and hidden inputs
are deliberately outside the rule.** 85 screens under `(dashboard)` contain an
`<input>`; 12 of them contain nothing but these. The kit has no part for any of
them, so flagging one would be a build failure with no correct fix — and the
only route out would be adding to a list that may only shrink. A check that
leaves someone stuck is a check people learn to route around. Everything else,
including a type computed at runtime, counts as a field: failing closed costs one
line in the frozen list when it is wrong, and the other way round costs a screen
that ships an unlabelled input.

**The scan reads JSX, not lines.** An input's `type` usually sits after its
event handler, and `onChange={(event) => …}` contains a `>`. Stopping at the
first one loses every attribute after it, which would misread all 27 tick boxes
in the codebase as text fields. The tag scan tracks braces and quotes instead.

### How it was proven

Not described — done. A new screen was added at `app/reports/weekly/page.tsx`
hand-writing both a table and a search box, and `npm run check:guards` — the
exact command CI runs — exited 1, naming both lines and the part to use instead.
The unit suite went red at the same time. The screen was then deleted and both
went green.

The check's own test was proved the same way, by breaking the check five ways
and confirming the tests caught each: the tag parser stopping at the first `>`,
the tick-box exemption removed, the table rule stopped from matching, a freeze
honoured across both rules instead of its own, and the missing-file staleness
branch deleted. Each break failed between one and four tests; none passed
silently.

13 tests: the two probes that must fail, the four shapes that must not, the
per-rule freeze, the parser reading past a handler, and staleness in both forms —
a frozen screen that has moved onto the kit, and a frozen screen that has gone.
The list can therefore only shrink in practice, not just by instruction: when a
frozen screen stops hand-writing its part, the check fails until the entry is
removed.

### Deliberately not done

The kit's own `SearchBar` still fires a query on every keystroke while the
promoted `TableSearchInput` debounces. The check names `TableSearchInput` for
new search boxes, so new screens get the better one, but converging the two would
change behaviour on 49 admin screens and belongs in its own piece of work.

## Phase 3.5 — One table, everywhere (17.5 days) — ADDED 2026-08-16

**Why this was added.** Phase 3 froze 90 screens on an allowlist rather than
converting them. Anthony's judgement, and it is the right one: a base layer that
gets cloned would hand every future product both the 90 old screens *and* a list
saying they are allowed to stay that way. The freeze was the cheaper job, not
the right one.

Then, converting the first four screens, a second and larger problem surfaced.
Moving a screen onto the kit's *parts* does not make it match the other screens,
because the parts are assembled by hand each time and every screen assembles them
slightly differently. The workspace directory ended up with the shared table and
the shared search box and still did not look like the evals screen: its footer
only appeared when there was more to load, and its search box sat inside a second
bordered box. Both were faithful ports of what was there before. Faithful porting
is not standardising.

**So the goal changes from "use the shared parts" to "there is one table".**

### Measured 2026-08-16, not estimated

| | |
|---|---|
| Screens under `(dashboard)` | 303, 67,950 lines |
| Screens with a table | 64, 24,829 lines |
| Average table screen | 388 lines |
| `<thead>` blocks written out by hand | 66 |
| Table footers | 86 |
| Search boxes | 61 |
| Screens hand-writing their page title instead of `PageHeader` | 84 |

Sixty-six hand-written header blocks for sixty-four tables is the whole argument.

### What gets built

`DataTable`, composed from the parts that already exist — `SearchBar`,
`TableShell`, `TableHeaderRow`, `TableHeaderCell`, `TableLoadingRow`,
`TableEmptyRow`, `LoadMoreFooter`, `PaginationFooter`. Those parts stay; this
assembles them the same way every time.

A screen supplies **what is different**: its columns, its rows, how a row draws,
what its empty state says, and which of the two data modes it is in. It supplies
nothing about shell, header, loading, empty or footer markup, because there is
nothing left to decide.

**There is one footer, and it is the paginated one.** "Showing 1-15 of N",
Previous, Page X of Y, Next — as on `/admin/ai/evals`. A lone "Load more" button
is not a variant of the standard; it is the drift. Anthony had to say this three
times on 2026-08-17 before it was done, and the reason it took three is worth
recording: "preserve all functionality" was read as "keep each screen's paging
control", which is wrong. The control is format. What the screen *fetches* is
functionality, and that is untouched — the server still pages by cursor, and
walking past what is loaded still fetches the next batch, exactly as the Load-more
button did.

`src/hooks/useServerPagedTable.ts` already bridged Convex's cursor paging to a
numbered footer for one query. `src/hooks/usePagedRows.ts` was added for screens
whose table is two lists stitched together — a directory showing invitations
above people — so those get the same footer without inventing a second one.

**Everything else about functionality is preserved exactly.** Every row action,
modal and query behaves as it did. The search box becomes one control in one
position.

### The tests move too

Measured 2026-08-16:

| | |
|---|---|
| Table screens | 64 |
| …with a test beside them | 29, 4,755 lines |
| …whose test asserts the table furniture being changed | **15** |
| …with no test at all | **35** |

The fifteen are not optional and they are not incidental. Three of them broke
within an hour of the first four screens being converted, because they assert
the old bespoke button wording — "Load More Identities", "Load More
Administrators", "Load More Users" — which the standard footer replaces. A test
asserting a label that has deliberately changed is a test that has to be updated,
and updating it is part of the conversion, not a tidy-up afterwards.

They get **simpler**, which is the point: a screen on `DataTable` has no shell,
header or footer markup of its own, so its test stops asserting chrome and
asserts what the screen is actually for — the right rows, the right actions, the
right query arguments.

**Each updated test is then proved by breaking the code it covers and watching it
fail.** That is the repo's standing standard, and it matters more than usual here:
a test rewritten during a refactor is exactly the kind that quietly stops
asserting anything.

**The 35 with no test at all get one.** Anthony's call on 2026-08-16, and the
right one: half the table screens in the product have nothing standing behind
them, so a refactor of this size is being done blind on those, and a clone of
this repo inherits the same hole.

They are cheap *because* of `DataTable`, and only because of it. Every table
screen ends up with the same furniture, so the same assertions apply to all of
them: rows render from the query, the loading state shows while it is undefined,
the empty state shows when it is empty, the search box passes its term to the
query, the footer reports the right count, and the row actions fire without
triggering the row itself. That is a shared test helper called 35 times, not 35
bespoke test files.

On top of the shared baseline, each screen gets whatever is genuinely its own —
the modal it opens, the mutation it calls, the rule it enforces.

**Written before the screen is converted, not after.** A test written against the
converted screen only proves the new code agrees with itself. Written first, it
is a regression test: it pins what the screen does today, and it must still pass
once the screen is on `DataTable`. Where one cannot be written first because the
markup is about to change, it is written after and then proved by breaking the
code it covers.

### Order

1. Build `DataTable` and its tests, proved by breaking each. (2 days)
2. Build the shared table-screen test helper the baseline assertions come from,
   and prove it against a screen that already has a good test. (0.5 days)
3. Write regression tests for the 35 screens that have none, **before** their
   screen is converted, so they pin today's behaviour rather than tomorrow's.
   (4 days)
4. Convert the 64 table screens in batches by area, each checked in the browser
   against the reference before it is called done. (6 days)
5. Update the 15 tests that assert the old furniture, as part of the batch that
   changes their screen — never left to the end. Each proved by breaking the code
   it covers. (1 day)
6. Point `scripts/generate-entity.mjs` at `DataTable`, so a newly generated
   screen is standard on the day it is made. (0.5 days)
7. Tighten `check-screen-kit.mjs`: a hand-written `<thead>` fails, and so does a
   screen importing the table's pieces directly instead of `DataTable`. Both
   lists go to zero and get `maxEntries: 0`. Proved by breaking it, as Phase 3
   was. (1 day)
8. The 73 hand-written fields, which are the safe half — the shared field is
   built from identical styling, so those screens do not change on screen.
   (2.5 days)

### And then it cannot drift back

Finishing this and leaving it unguarded would put the app back where it started
in a year. The Phase 3 check is not enough on its own: it catches a hand-written
`<table>`, and **not one of the faults found on 2026-08-16 was a hand-written
`<table>`.** The workspace directory used the shared table, the shared search box
and the shared footer, passed the check, and still did not match. What drifted was
the *assembly*, and a scan for raw markup cannot see assembly.

Four guards, each closing a different door:

**1. A new screen starts standard.** `scripts/generate-entity.mjs` currently
emits a screen that assembles `PageHeader`, `SearchBar`, `TableShell` and a
header row by hand — so every screen generated from today's tooling begins life
as another hand-assembly. It emits a `DataTable` screen instead. This is the
cheapest guard by a distance: the default path stops producing the problem.

**2. The parts become internal.** After conversion, a file under
`src/app/(dashboard)` importing `TableShell`, `TableHeaderRow`,
`TableHeaderCell`, `SearchBar`, `LoadMoreFooter` or `PaginationFooter` directly
fails the check. Screens import `DataTable`; only `DataTable` imports the pieces.
**This is the rule that would have caught the workspace directory**, and it is
the whole anti-drift mechanism in one line — you cannot assemble it differently
if you cannot reach the pieces.

**3. The lists lock at zero.** Both allowlists get `maxEntries: 0` and a test
that fails when the list grows past it or holds a stale entry — copying
`convex/authz-migration-allowlist.json`, which has sat at zero since 2026-07-25
and is enforced by `convex/authzEnforcement.test.ts`. The pattern is proven in
this repo; it is not being invented here.

**4. The shape is asserted at runtime, not just scanned.** The shared
table-screen test helper from step 2 asserts the *standard shape* — one search
box, one table, one footer bar, always present — and every table screen's test
calls it. A static scan can tell you a screen imports the right things; only a
render can tell you it produced the right thing.

Guards 1 and 2 are what actually hold. Guards 3 and 4 catch the ways round them.

### How each batch is reported

**Every batch ends with clickable URLs**, one per screen changed, pointing at the
running dev server — `http://localhost:3000/…`. Real record ids are taken from
the live app for parameterised routes rather than linking a parent page.

This is not a courtesy. Anthony asked for it on 2026-08-16 — *"it would be useful
to get clickable URLs of what you have done so I can see, you're keeping me quite
blind"* — and within minutes of getting the first set he found two real faults, a
missing table footer and a double-bordered search box, that a written summary had
reported as finished. Prose about a screen is not evidence about a screen.

**Done when:** both allowlists are empty and locked at zero, a screen that
assembles its own table fails the build, a newly generated screen is standard
without anyone remembering to make it so, and any two list screens put side by
side are indistinguishable apart from their data.

### Two decisions taken 2026-08-17

**The opportunity report stays hand-written.** Anthony: *"opp report - leave as
is."* Asked twice now and answered the same way, so this is settled rather than
deferred. **The table list therefore locks at 1, not 0** — step 7 of the order
above should say so, and the entry needs the reason written beside it rather
than reading as an unfinished job.

**Plain English is part of converting a screen, not a separate pass.** The
original instruction was to leave the wording, and it was reversed within the
hour once the rule screen was actually looked at: *"this is supposed to be
client friendly wording, this is not friendly or easy to understand… any screen
you see needs friendly wording that's easy to understand."*

That is a standing rule for the rest of this phase: **a screen being converted
gets its words fixed at the same time.** Do not convert a screen and leave
"Compile New Logic Branch" on it, and do not ask again — it has been answered.

The rule forms were the worst of it and now read: "Add a rule", "When to use
it", "Words or phrases that set it off", "How important it is", "What the
assistant should do", "Save changes". Where a screen keeps its words in the
language files, English and Italian change together.

**The vocabulary is much wider than the six phrases named in the handover.**
Those six were what a quick scan found; the rule screens alone carried eight
more. Assume any screen not yet visited has some.

### What the kit gained on 2026-08-17, and why each was unavoidable

Four things were added to the kit rather than worked around on the screens.
Every one of them was found the same way — the same fault turning up on a second
screen — and every one fixed more screens than it touched. **That pattern is the
finding, not the four parts.** When a fault appears twice, stop converting and
look at what those screens share.

| Added | Because |
|---|---|
| `aria-label` on `SearchBar` | The icon is a picture and the placeholder goes the moment anyone types, so the search box on **28 screens** announced itself as nothing. Its sister in `TableControls` had carried a label all along, which is what made it a miss rather than a decision. |
| `labelHidden` on `TextAreaField` | The plain field already had it. Four wiki boxes sat under a heading that named them, so the choice was a visible label parroting the heading or a nameless box. |
| `ModalTextAreaField` | `ModalField` tied a single-line box to its label; the text areas beside it were still the wrapper around a raw `<textarea>`, and the tie was dropped every time. |
| `InlineSearchInput` | `SearchBar` draws its own card. Four screens needed the box without the card — a command palette, two picker dropdowns, a bordered panel — and hand-wrote one rather than put a box inside a box. **They were the only screens that could never come off the frozen list**, so it could not have reached its floor without this. |

The last was raised with Anthony twice as a decision and answered "go" both
times, so it was taken as a technical one and made. If a future part looks like
this — no new look, just the one arrangement the kit cannot say — make it.

### One footer, applied everywhere — 2026-08-17

Ten list screens still ended in a lone "Load more" button. They all carry the
numbered footer now, through `useServerPagedTable` or `usePagedRows`, and what
each screen fetches is unchanged. Anthony found the first of them himself and
the plan had already settled the rule twice, so this was applying a decision
rather than making one.

Three screens keep the load-more footer and should: a skill picker inside a
dialog is a picker rather than a list screen; Tasks is a grouped list; the
movement library is inside the fenced demo.

**The frozen table count was misleading.** It counts screens hand-writing a raw
`<table>` and stood at 1, which read as "the tables are done". Only four screens
actually use `DataTable` — the rest import its parts and assemble them by hand,
which is how a list screen ended up with no paging controls while passing every
check. Step 4's real measure is `DataTable` adoption.

### Step 4 finished — 2026-08-18

**Every admin screen with a table now hands `DataTable` its columns.** The frozen
list of hand-assembled tables is down to six, and not one of them is an admin
screen:

| Still frozen | Why it stays |
|---|---|
| `admin/settings` retention rules | A fixed list of settings, not a data table. Nothing pages it and nothing searches it. Settled, not deferred. |
| The five under `app/` | The client-facing half, which Anthony held back from this plan on 2026-08-17. They come off when that half comes into scope. |

The last three were the wiki page list, an agent's memories and an agent's job
history. The job history needed a footer the kit did not have: it steps by
cursor, because counting every job to say "page 3 of 40" means reading the whole
table before drawing a row of it. So `CursorFooter` joined the other two, and all
three now sit on one bar with one count rule — the rule that had been wrong in
both footers and had to be fixed twice in the same afternoon.

**Two cursor footers now exist, on purpose and temporarily.**
`CursorPaginationFooter` is the older answer to the same question and does not
sit on the shared bar — different padding, no background, icon-only buttons,
nothing to say about an empty list. Its only two callers are the customer list
and the spreadsheet import, both out of scope. Folding them onto `CursorFooter`
and deleting the old one is the first job when the client-facing half is picked
up. Both files point at each other so the next person finds one and not a third.

**One real gap is parked, not closed.** The sales data import has no footer at
all — its table ends where its last row does, so a short list never says how many
there are. It is a client-facing screen, so it keeps its shape for now, and its
test says why rather than sitting on an unexplained exemption.

### The reference

`/admin/ai/evals` is the screen this converges on: search box on its own row,
table, footer bar always present. `/admin/agents` is the same pattern in
load-more form.

## Phase 3.6 — One page header, everywhere (2.5 days) — OUT OF THIS PLAN

> **Closed out of this plan by Anthony on 2026-08-18:** "ignore page titles for
> now, we will revisit those in another plan." Earlier, 2026-08-17: "leave the
> header this time and lets proceed with the plan." So this phase is not
> pending and nobody should pick it up from here — a future plan of its own
> starts from the measurements below, which stand and do not need redoing.
> Phase 3.5 runs first.

**Raised by Anthony:** *"we seem to have issues with page headers too — being
non-standard — some have lines some don't, the headers all look different… I
don't know what that layout should be yet though but it's another big case of
drift."*

He is right that it is drift. He is wrong that it is undecided — **the standard
already exists, and most screens already agree with it.** That is the finding,
and it makes this much smaller than it looks.

### Measured 2026-08-16

| | |
|---|---|
| Page files | 181 |
| …using the shared `PageHeader` | 34 |
| …hand-writing an `<h1>` | 71 |
| …with no page title at all | 76 |
| Distinct hand-written title styles | 19 |
| With a rule under the header | 23 |
| Without one | 82 |

Nineteen styles sounds like chaos. It is not. **Forty-four of the 71 hand-written
titles use one style**, and that style is
`text-2xl font-bold tracking-tight text-foreground flex items-center gap-3` —
which is, byte for byte, exactly what `PageHeader` renders.

So: 34 screens on the shared header, 44 hand-writing something character-identical
to it, and **27 genuine outliers.** Seventy-eight of 105 already agree.

The rule-or-no-rule question is also already answered: `PageHeader` has a
`divider` prop, added when the AI pages turned out to have kept a near-identical
private copy of the whole component purely to draw that line. Twenty-three screens
want the rule and opt in; eighty-two do not.

### So the decision Anthony has to make is small

Not "what should the page header layout be" — that is settled by 78 screens and a
component that already exists. Only: **what happens to the 27 outliers.** They
divide into three kinds:

- **Near-misses (about 12).** `gap-2` instead of `gap-3`, `text-[24px]` instead
  of `text-2xl`, `font-semibold` instead of `font-bold`, the icon before the
  class list instead of after. Nobody chose these; they are typos with a
  stylesheet. They should just become the standard.
- **Deliberately different (about 5).** `/app/reports` renders BOARD REPORTS in
  light, wide-spaced capitals with no icon. `/app` has a hero title.
  `/app/properties/scraped-data/[id]` overlays its title on a photograph. These
  look like design decisions, and this plan does not overrule design decisions —
  they need Anthony's eye, and if they stay they are named here as decisions
  rather than left as accidents.
- **The movement demo (about 10).** Fenced by standing instruction. Converted for
  consistency or left alone, at Anthony's word — no product consequence either
  way.

### Order

1. Move the 44 character-identical screens onto `PageHeader`. Zero visual change
   by construction; verified in the browser regardless. (1 day)
2. Fix the 12 near-misses onto the standard. Visibly different by a hair, each
   one recorded. (0.5 days)
3. Anthony looks at the 5 deliberate ones and the demo screens, and says. Written
   down as decisions either way. (his call, then 0.5 days)
4. Extend `check-screen-kit.mjs`: a page file hand-writing an `<h1>` fails.
   Frozen list starts at whatever survives step 3 and locks at zero. (0.5 days)

**Done when:** no page file hand-writes its title except the ones named here as
decisions, and the build stops the next one.

**Pending Anthony's decision before step 3 can run.** Steps 1, 2 and 4 do not
depend on it.

## Phase 4 — Accessibility, in the kit (1 day, was 2.5)

- Add `axe-core` / `jest-axe` and assert every shared part against it.
- Fix what it finds in the kit: labels tied to inputs, focus order, keyboard
  operation of the table and modal, roles on the detail tabs, contrast.
- Colour is never the only signal — a status must also carry text. (Anthony is
  red/green colour blind; this is a house rule, not a preference.)
- A shared-kit accessibility test joins the standard suite so it cannot regress.

**Done when:** every shared part passes axe with no violations, and a
deliberately broken part fails the test.

> **Done 2026-08-18.** `accessibility.test.tsx` runs axe over every part in
> every state, and ends by handing axe a deliberately nameless input and
> insisting it objects. It found one fault, present on every list screen: the
> actions column's header was written as nothing, which names a column of
> buttons nothing. Fixed in the kit once — a column with no visible heading now
> carries a hidden name for screen readers. Contrast is the one thing axe
> cannot judge in jsdom (no layout engine); the house rule that colour is never
> the only signal stands in for it, and the test says so where the rule is
> turned off.

*Shrunk from 2.5 days by Phase 3.5: with one table instead of sixty-four
assemblies, there is one place to fix rather than a sweep.*

## Phase 5 — Small screens, in the kit (1 day, was 1.5)

- The shared table, form, page header and detail layout work at phone width.
- Screens that stay desktop-only are named in this plan as a decision, with the
  reason. Reception is already settled: web-app only, browser kiosk is the
  finished form.

**Done when:** the shared parts are usable at 390px, and the desktop-only list
is written down rather than implied.

> **Done 2026-08-18.** Most of it was already true: the table scrolls sideways
> in its shell, the search row wraps, all three footers stack their count above
> their buttons, and both page headers stack their actions under the title —
> `smallScreens.test.tsx` now pins each of those arrangements so they cannot
> quietly unstack. Two things were not true and were fixed in the kit:
>
> - **A tab row with a menu in it could not scroll.** The row switched to
>   `overflow-visible` so the open menu would not be clipped, and a row that
>   cannot scroll runs off the right edge of a narrow window with the far tabs
>   unreachable. The menu is now fixed to the viewport and measured from its
>   tab — the same placement `TableFilterSelect` already used — so the row
>   scrolls at every width and the menu clips against nothing.
> - **The modal's side padding was 40px at every width**, which is a fifth of a
>   phone screen spent on margins. It is 24px below the small breakpoint now
>   and unchanged above it.
>
> **The desktop-only list, written down:**
>
> - **The admin side is designed at a 13-inch MacBook (~1280px) and stays
>   that way.** That is the machine it is used on. This phase makes the parts
>   *survive* a narrow window — nothing crushed, nothing unreachable — and
>   deliberately redesigns no admin screen for a phone.
> - **Reception is a browser kiosk page on the reception machine** — settled
>   2026-08-15, web-app only, no tablet build.
> - **The client-facing half under `app/` and the posture studio** are outside
>   this plan by Anthony's instruction of 2026-08-17, so no judgement about
>   their phone behaviour is made here.
> - **The movement demo** is fenced by standing instruction.

## Phase 6 — A capability can be withheld (2 days)

Extend the switch Sales Data already uses to every capability: Reception, Calls,
Properties, Reports, Wiki, Governance, Tasks.

- Enforced server-side through `isModuleEnabled`, the existing helper — a menu
  that hides a screen is not a capability gate.
- The sidebar reads the same source, so what a client sees and what they can
  reach cannot disagree.
- Turning a capability on for one client before the rest falls out of this: it
  is the same switch.
- Correct `PRODUCT.md` §10, which is stale on migrations.

**Done when:** a capability switched off is unreachable by URL, not merely
hidden, proven per module by test.

> **Done 2026-08-18.** The switch is structural, not sprinkled: `moduleQuery`
> and `moduleMutation` in `tenantFunctions.ts` are the tenant builders with one
> more declared fact — which capability the function belongs to — checked
> before the handler runs, the way `publicQuery` declares its reason. Every
> capability's client-callable functions now declare their module: tasks,
> calls (telephony), reception (kiosk), properties, reports, and the wiki's
> tenant surfaces. The properties dashboard read answers empty instead of
> erroring, keeping its stated contract; the anonymous kiosk answers the same
> quiet null as a widget not on kiosk duty.
>
> **Governance is not among them, by Anthony's ruling of 2026-08-18:**
> *"governance is not something to turn on or off per company, it's a platform
> feature for super admins."* It was briefly built as a company capability and
> was taken back out the same day — the platform console is the super admin's
> own, and a workspace's governance pages stay gated on the role that opens
> them, which is what an oversight surface should hang on rather than a
> purchasable switch.
>
> Super admins pass without any flag — the console is where withholding is
> administered — and so do platform-scoped oversight roles, which have no
> company for a switch to apply to.
>
> Six section layouts share one `CapabilityGate`, and the sidebar's seven
> entries read the same query the gates and the server read, so the menu, the
> URL and the data cannot disagree. `companyModules.gating.test.ts` proves
> refusal per module, the bypasses, and the migration; `CapabilityGate.test.tsx`
> proves each layout bounces.
>
> **The deploy that lands this must run the one-shot migration**
> `2026-08-18-core-company-modules-backfill`, which seeds every existing
> company with the full capability set — absence used to mean "the flag
> predates the switch" and now means "withheld". New companies start whole:
> the provisioning form pre-ticks every capability, and unticking is the
> withholding decision, made on purpose.
>
> Left alone, recorded: `apify.syncRunStatus` reports on already-started runs
> and stays ungated — starting a new collection is gated, and a status read on
> an old run leaks no withheld capability. The assistant's internal wiki reads
> are internal functions, not client-callable, so a withheld wiki removes the
> browsing surfaces without silencing Ask Hakken — making the assistant forget
> the wiki is a different decision nobody has made.

## Phase 7 — A plan grants capabilities (1.5 days)

- Add capability grants to the plan record; a tier turns modules on.
- A per-company override stays and wins, so a client can be given something
  their tier does not include without inventing a tier for them.
- Starter / Pro / Enterprise then becomes configuration rather than code.

**Done when:** moving a company between plans changes what it can reach, with
the override still honoured.

> **Done 2026-08-18, in the same sitting as Phase 6.** Plans carry
> `grantedModules`; a company's reach is its own list united with its plan's
> grants, resolved in one exported function (`effectiveModulesFor` in
> `tenantFunctions.ts`) that every reader goes through — the module builders,
> the workspace query the sidebar and gates share, the soft public surfaces,
> the kiosk, and the Sales Data checks, which moved onto the same resolution so
> a plan can grant the bespoke module too.
>
> The override only ever adds. A company can be given what its tier lacks, but
> unticking a box the plan covers withholds nothing — the modules card on the
> company screen says so beside the boxes, naming the plan and what it already
> switches on. To withhold a plan-granted capability, move the company to a
> plan without it. Selling below the tier is not a thing this platform says.
>
> The plans screen edits grants with the same checkbox list and the same
> wording keys the company screens use. Proven in
> `companyModules.gating.test.ts`: moving a company Starter → Pro → Starter
> changes what its members can call, the direct grant survives the downgrade,
> and the workspace query reports the plan's grants to the navigation.
>
> No migration needed: plans without the field grant nothing, which is what
> every existing plan meant before the field existed.

---

## What this plan deliberately does not do

- **It does not redesign anything.** `admin-ux-plan.md` owns how screens read
  and look.
- **It does not collapse the 1,400-line admin pages into data-driven
  configuration.** That is the larger ambition in `OUTSTANDING-TASKS.md` §5.
  Phase 3.5 takes one bite of it — the table, which is the repeated part — and
  stops there. A page's queries, mutations, modals and business rules stay
  written out in the page.
- **It does not bring back template generation.** Removed by decision on
  2026-08-09; the model is cloning the repo whole.
- **It does not strip the product-specific code out of the base.** Sales Data,
  Properties, the arcade and Posture Studio stay. That follows the same
  decision, and the movement demo is fenced by standing instruction.
- **It does not add payment.** A plan will grant capabilities; charging for one
  is a separate question.
- **It touches nothing on the AI side.**

## Noticed in passing, not changed

- **`RouteSubmenu` was dead code and is gone.** Fully written and tested, and
  no screen imported it. Found while moving it in Phase 1, raised rather than
  deleted in passing; **Anthony asked for it removed on 2026-08-16** and it was,
  along with its test and its documentation.
- **Manage Team shows Italian to English readers.** Its empty state hardcodes
  `"Nessun Risultato"` and `"La query di ricerca non ha prodotto corrispondenze
  nel team."` in the page source rather than reading either locale file, so an
  English reader sees Italian when a search finds nothing. Found while reading
  the screen for Phase 2. Not fixed in passing — it is a translation bug, not a
  kit one, and belongs with the vocabulary pass.
- The developer guide for this area was `shared-admin-ui.md` and is now
  `screen-kit.md`, because a doc named for the admin folder describing an
  app-wide kit would mislead exactly the developer this base layer is for.

- The Manage Team button reads **"Invite Intelligence"** where it should say
  something a receptionist understands first read. Belongs to the vocabulary
  pass in `admin-ux-plan.md`.
- The Tasks screen has no due dates, no filtering and visible duplicates. Real,
  and a product concern rather than a base-layer one.
- `PRODUCT.md` §10 lists migration tooling as absent; it exists. Corrected in
  Phase 6.

## Sequencing

1 → 2 → 3 → 3.5 → 3.6 must run in order: the kit has to be reachable before screens can
move onto it, the check cannot be enforced until they have, and there is no point
building one table before the parts are shared. 4 and 5 need 3.5 done — that is
what makes them cheap — but are independent of each other. 6 → 7 in order, and
both are independent of 1–5 — they can run first if selling packages becomes the
priority.

**Total: 32.5 days** — 14.5 as first agreed, plus 17.5 for Phase 3.5 and 2.5 for
Phase 3.6, less 2 saved in Phases 4 and 5 because there is one table to fix
instead of sixty-four assemblies. **7 done.**

## Verification

Every phase ends on the full gate, with Node 24:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm audit --omit=dev && npm run typecheck && npm run lint && npm run test:run && npm run build
```

Plus, for this plan specifically:

- `scripts/check-screen-kit.mjs` passes, and fails when deliberately broken.
- `screen-kit-allowlist.json`'s two lists and `layering-allowlist.json` are all
  shorter than when the phase started, never longer.
- The shared-kit axe suite passes with no violations.
- After a test is written, break the code it covers and confirm the test fails.
  This is the repo's standing testing standard and it has caught several tests
  that passed for the wrong reason.

## Reading list before touching this area

- `scripts/check-layering.mjs` — the enforcement pattern Phase 3 copies.
- `src/ui/lib/layers.ts` — where stacking order comes from.
- `src/ui/components/screens/Table.tsx` and `src/hooks/useServerPagedTable.ts` —
  the promoted parts (they were `AdminTable` and `admin/_lib` before Phase 1).
- `src/app/(dashboard)/app/[workspace]/_components/TableControls.tsx` — the
  second implementation being folded in.
- `convex/utils/companyModules.ts` — the capability switch Phases 6 and 7 extend.
- `src/test/renderWithProviders.tsx` — UI tests must render through this.
- `docs/plans/active/admin-ux-plan.md` — owns design and vocabulary; this plan
  does not.
