# Design drift — one record for the look, and nothing built or drawn off it — 2026-10-04

D1, D2 and D5 built on dev 2026-10-04 ("build the kit first", then "lets do it and build it and also make it inter"); D3 done the same day; D4's tables done, its parts lists and look tests to come.

## Why

On 2026-10-04 the Keyword research drawings came out in the wrong look:
orange where the app is ivory, the Inter font where the app shows the system
font, blue keywords where the app's are white, faint borders where the app's
are solid grey, and tables that scrolled sideways. Anthony: "please look at
the design style we worked on so hard, I don't feel like you're following it
at all" and "Why do we have this drift … We cannot go through this with every
agent."

Asked what this plan should stop drifting, he answered: **"the entire
build"**.

## What went wrong, plainly

1. **The look lives in three places that disagree.** The colours and font
   chosen on 2026-10-03 are saved in System Settings, in the database
   (`systemSettings`, applied by `src/context/SystemSettingsContext.tsx`).
   The repo still holds two other answers: `hakken.product.json` says the
   brand is orange `#E26D28`, and `src/app/globals.css` falls back to orange
   `#ff5a1f` with see-through borders. Anyone reading the code, as an agent
   does, gets the wrong look.
2. **Drawings copy drawings.** There is no drawing kit in the repo. Each
   canvas carries its own copy of the styles, taken from an earlier canvas.
   The Search Console canvas's copy was saved at 07:47 on 2026-10-03, two
   hours before the colours changed; the Keyword research canvas copied it
   on 2026-10-04 and inherited the old look.
3. **Gaps were filled by eye.** Where the copy said nothing (keyword colour,
   title icons, table widths), the drawing guessed.
4. **Nothing checks a drawing**, and only some approved looks have a test
   that holds the built screen to them.
5. **Built screens drift too.** The rule agreed for Search Console — "tables
   fit the page", no sideways scrolling on a 1440px screen
   (search-console-plan §13.1) — lives in one plan. 128 built tables still
   set a minimum width (`minWidthClassName`, 480px to 1,180px), so they
   scroll sideways in a narrower window.

## What already guards against drift (kept)

- `npm run check:guards` — `check:screen-kit` fails eight kinds of screen
  drift (a hand-written `<h1>`, a table with no header above it, a component
  named like a kit part, pills, copied recipes, …).
- Drift tests in `src/`: `theme-drift` (no hardcoded colours, a ratchet),
  `status-colour-drift`, `chart-drift`, `chart-palette-drift`,
  `google-update-markers-drift`, `pagination-drift` (Sites pages and
  sorting), `translation-parity-drift`, and the rest of `src/*-drift.test.ts`.
- Approved looks recorded as binding in their plans with a saved picture
  (knowledge-news-and-digest-plan, "The approved look").

They guard the code against itself. None of them knows the saved colours,
looks at a drawing, or compares a built screen with the drawing that was
approved.

## His decisions

1. **The repo is the one record of the look, copied from the settings.**
   When colours or fonts change in Admin → Global Aesthetics they are copied
   into the repo; the app's defaults, the drawings and the checks all read
   that one file, and a check fails when any of them differ.
2. **The plan covers the entire build**: drawings, built screens against the
   drawings he approved, and the instructions every agent works from.
3. **Every existing canvas is redrawn on the kit**, not kept in the old
   look.
4. **The repo's look file sets production too** (2026-10-04, "yes"): when
   there is a production site it starts in, and stays in, the look recorded
   in the repo.
5. **The two explorations are redrawn whole** ("redraw before we start").
6. **All 128 wide tables are fixed in this plan** ("yes"), not left to fall
   as screens are next touched.

## The plan

### D1. One record for the look

- A new file, `hakken.theme.json`, holds every saved look setting for dark
  and light: brand, background, card, sidebar, border, hover, the three text
  greys, success, warning, danger, info, focus ring, body font and heading
  size — the fields `SystemSettingsContext` applies today.
- `npm run theme:pull` copies the saved Global Aesthetics settings from the
  dev deployment into that file. Run after any change to the look.
- The app's own defaults read the file: `hakken.product.json`'s brand,
  `convex/settingsService.ts`'s defaults, and `globals.css`'s fallbacks,
  which a test holds equal to it (`theme-record-drift.test.ts`). A new
  deployment therefore starts in the agreed look.
- `npm run check` fails when the dev deployment's saved settings and the
  file differ, naming the setting and saying "run theme:pull". Local only,
  like the two timing tests: GitHub cannot read the database. The file
  itself is checked on GitHub too.

### D2. The drawing kit, in the repo

- `docs/design/drawing-kit/`, built by `npm run drawing-kit` from the app
  itself:
  - `kit.css`: the app's compiled stylesheet (from `next build`, its font
    files removed) with the theme variables from `hakken.theme.json`.
  - `parts.html`: every kit part — sidebar, top bar, record header, section
    menu, page header, figures, chart card, notice, search box and filters,
    table (bar, headings, rows, footer, numbered pager), buttons, select,
    tick box, status label, tag label, meter, view switch — rendered from
    the real components (`renderToStaticMarkup`), so a drawing copies the
    part, never a description of it.
  - `README.md`: how to draw a screen, start to finish.
- `npm run check:drawing <file>` fails a drawing that uses a class the
  app's stylesheet does not have, a colour outside the theme and the chart
  palette, a font the theme does not name, or a table with a minimum width.
  On 2026-10-04 this check, run by hand, found the Keyword research
  drawings clean once redrawn: 282 classes, none made up.
- Each canvas loads the kit's stylesheet as an asset and records which kit
  build it used, so a stale canvas is visible.

### D3. Redraw every canvas on the kit

The canvases on 2026-10-04, newest work first:

| Canvas | State of its screens | Redrawn |
|---|---|---|
| Keyword research | Not built | On the kit 2026-10-04, drawn from `parts.html` |
| Search Console — keywords and pages | Built; 24 boards | 2026-10-04, copied from the app |
| Learn: News, Knowledge, Who to follow | Four News ideas; the News page was built to a later design | Ideas redrawn whole, in the built Learn frame |
| Platform limits | Built | 2026-10-04, copied from the app |
| Hakken Websites — Screens to build | Built | 2026-10-04, copied from the app (14 boards; "day one" dropped — no website on dev is in its first day) |
| Hakken multi-website switcher | Built | 2026-10-04, copied from the app, phone included |
| Hakken Sites Overview Drawing | Built | 2026-10-04, copied from the app |
| Content gap, Ahrefs layout | Built | 2026-10-04, copied from the app |
| Hakken Collection Runs Drawing | Built | 2026-10-04, copied from the app |
| Fan-out queries — Track | Options A, B, C (C built) and the page a row opens | Options redrawn whole on the built page's parts |
| A search's page header | Today and three alternatives | Redrawn whole on the built header's parts |
| Your prompts — the limit on screen | Built | 2026-10-04, copied from the app |
| Search Console — beyond Google | An earlier proposal, since built | 2026-10-04, copied from the app as built |
| Replacing the pills | A comparison of four options, C chosen | Redrawn whole; C in the real StatusLabel |

The canvas list is the whole claude.ai account's, not this repo's: it also
shows "Route Planner Screens" (2026-09-19), a Conterra Ops drawing of
routes from Baghdad to Erbil, and "Features screen" (switching Route Planner
on and off). Neither is Hakken's; both are left alone, and nothing
from them is in this repository. (The only mentions of Conterra in the repo
are deliberate: the August 2026 email work, where Anthony asked for
Hakken's emails to read like Conterra's.)

Each is redrawn from `parts.html` on the kit, its boards kept, its
`docs/plans/assets/<plan>/` copy refreshed. A canvas whose screen is built
is drawn as the screen now is, so the drawing and the app agree again:
copied from the running app (`scripts/drawing-kit/copy-page.js`) and turned
into boards on the kit (`scripts/drawing-kit/from-app.mjs`) — the drawing
guide's "Redrawing a built screen".

### D4. Built screens hold to what was approved

- **Every approved drawing is saved with its plan** under
  `docs/plans/assets/<plan>/`, with a parts list: the kit parts on the
  screen, top to bottom, and each table's columns and headings.
- **A look test per approved screen** renders the built screen with
  fixture rows and fails when a part is added, removed or moved, or a
  table's columns or headings change. New screens get one when built;
  existing approved screens get one as D3 redraws them.
- **Tables fit** becomes a kit rule, not a Search Console one: a guard
  fails a table given a minimum width; number columns are sized to their
  headings and text columns share the rest. The 128 wide tables today are a
  ratchet that may only fall, fixed screen by screen.
- **A change to an approved look is drawn first** and approved again,
  then its saved drawing, parts list and look test change in the same
  commit.

### D5. One guide every agent reads

- `docs/developer/drawing-guide.md`: before drawing or building a screen —
  pull the theme, use the kit, copy parts whole, run `check:drawing`,
  tables fit, tell Anthony by name about any part not in the kit.
- `AGENTS.md`: a short "Drawing and building screens" section pointing to
  it, beside the existing screen-kit rules.
- The rule as it stands today is already saved in the agents' memory
  ("Draw from the live app").

## Built — 2026-10-04

**D1, one record for the look.**

- `hakken.theme.json`: the 31 look settings saved on dev, under the settings'
  own names (dark and light colours, the brand for each, fonts, heading
  size). Ivory brand `#E8E4DC` dark, `#2C2C2E` light; borders and hover
  `#3A3A3C`.
- `npm run theme:pull` copies them from the dev deployment
  (`settings:get`); `npm run check:theme` fails when they differ, and is now
  part of `npm run check` (skipped on GitHub, which cannot read the database).
- The code follows the record: `globals.css`'s `:root` (light) and `.dark`
  blocks and its fallbacks, and `DEFAULT_SETTINGS`, so a deployment that
  never saved a look starts in it. `src/theme-record-drift.test.ts` holds
  all of them, and that `SystemSettingsContext` applies every variable the
  record maps. Shared helpers: `scripts/theme-record.mjs`.
- **The widget is not the dashboard.** `hakken.product.json`'s orange
  `#E26D28` stays: it is the product's shipped colour, which a chat widget on
  a client's own website wears (decided 2026-10-03 — the pale dashboard
  accent would vanish there). It is now named `SHIPPED` in
  `convex/settingsService.ts` and read by `widgets.ts` by that name, and a
  test holds the two apart. (Caught while building: the first cut of D1
  turned the product file ivory, which would have turned the widgets pale.)

**D2, the drawing kit.**

- `npm run drawing-kit` builds `docs/design/drawing-kit/build/` in half a
  second: `kit.css` (the app's stylesheet compiled as the app compiles it,
  with the dark look on the page root), `parts.html` (17 parts rendered from
  the real components — the client's menu, top bar, headers, section menu,
  figures, chart card, notices, fields, buttons, filters, labels, and a
  Websites table with its cells and numbered pages) and `kit.json`. Not
  committed; `.gitignore` keeps it out.
- The parts render outside the app on small stand-ins
  (`scripts/drawing-kit/stubs/`): English words from `messages/en.json`, a
  link as `<a>`, no database, the record as the settings.
- `npm run check:drawing -- <board>` fails a class the app's stylesheet does
  not have, a colour outside the record and the chart palette, a font other
  than the app's, or a table that would scroll sideways. On the day it
  passed all seven Keyword research boards and failed the old Search
  Console board for exactly its drift (orange, Inter, hand-written colours,
  an 860px table).
- Tests: `scripts/drawing-kit.test.mjs` rebuilds the kit (a component the
  stand-ins cannot render fails there) and `scripts/check-drawing.test.mjs`.
- How to draw with it: `docs/design/drawing-kit/README.md`.

**Inter, as meant (his call, "make it inter").** The app's words had been
rendering in the system font: `globals.css` names Inter (`--font-sans:
var(--font-inter), …`) and `themeFonts.ts` says the default "is already
Inter", but next/font set `--font-inter` on `<body>` while `--font-sans` is
worked out on `<html>`, so it never resolved. Inter's variable now sits on
`<html>` (`src/app/layout.tsx`); JetBrains Mono stays on `<body>`, where it
already worked. Checked in the running app: titles, tables and words are
Inter. `src/theme-record-drift.test.ts` holds the wiring; the kit and
`check:drawing` take Inter and JetBrains Mono and no other font.

**D5, one guide every agent reads.** `docs/developer/drawing-guide.md` —
the rule, before you start, drawing, building, when the look changes —
linked from a new AGENTS.md section, "Drawing And Building Screens", and
from `screen-kit.md`.

**The Keyword research canvas moved onto the kit** (its stylesheet uploaded,
Inter linked, the kit's fingerprint noted on the canvas); all seven boards
pass `check:drawing`.

**D3, the canvases redrawn — 2026-10-04 ("go").**

- The nine canvases of built screens — Search Console (24 boards), Platform
  limits, Websites (14), the website switcher (with the phone), the Websites
  overview, Content gap, Collection runs, Your prompts and Search Console
  beyond Google — are now the built screens themselves: each page copied
  from the running app at 1440px (390px for the phone), its scripts taken
  out, on the kit's stylesheet, linked board to board as the app links. All
  pass `check:drawing`; Content gap carries the approval marker for its
  sideways scroll. The Search Console copy in
  `docs/plans/assets/search-console-redesign/` is refreshed to match.
- The converter is in the repo (`scripts/drawing-kit/from-app.mjs`, with a
  test; `copy-page.js` copies a page), so the next canvas of a built screen
  is redrawn the same way.
- The option canvases are redrawn whole on the kit, each option keeping its
  idea, words and rows, drawn from the built screen's own parts and inside
  the app's real frame: Fan-out queries (the wide table before, A, B, C as
  built, and the three search pages), A search's page header (today and A,
  B, C, with B the one built), Replacing the pills (C drawn in the real
  StatusLabel) and the four News ideas (in the built Learn frame; the News
  page itself was later built to a different design). All 15 boards pass
  `check:drawing`.
- Drawing them found one canvas trap, now in `check:drawing` with a test: a
  repeat (`<sc-for>`) inside a table is lifted out by the browser, so the
  rows draw above the table or not at all. A table's rows are written out,
  with holes for what changes (the drawing guide).
- Seen in passing, not changed: on the Learn pages the app's top bar reads
  "Dashboard" rather than "Learn".

**D4, tables fit — begun 2026-10-04 ("continue with the drift work").**

- All 146 kit tables carried a minimum width (128 their own, 480 to
  1,180px; the rest the kit's 1,000px default), so each scrolled sideways in
  any narrower window. 126 were taken off in 118 files. The kit's default
  is now `min-w-[720px] lg:min-w-0`: from a laptop up there is no minimum,
  while on a phone a table keeps 720px and scrolls rather than crushing its
  columns (the kit's existing phone rule, `smallScreens.test.tsx`).
- The one table that scrolls on every screen is Content gap's, the keyword
  held in place while a column pair per competitor scrolls — approved
  2026-09-30. `src/table-fit-drift.test.ts` fails any other.
- **Measured, 2026-10-04:** every dashboard screen that opens with a real
  company and website (212 of 285; News timed out) was loaded in the running
  app at 1440px and each table measured — wider than its column, or a word
  column squeezed under 64px. Fixed on the spot, no design change: Collection
  runs and Competitors → Map (a status that would not wrap; `StatusLabel
  wrap`), and the Websites overview's AI answers panel (`CompactList
  density="tight"`) and Competitors panel (the overlap bar shrinks below the
  kit's 160px).
- **Too many columns, folded on his "go" (2026-10-04):** Search Console's
  Tracked keywords and Tracked pages (eight figure columns had squeezed the
  keyword or page to 32–43px) now carry Change under Clicks and Moved under
  Position; Websites → Fan-out queries (nine columns, the query 32px) carries
  its change under Position and leaves Best to the download. One new shared
  part does it, `app/_components/FigureWithMove.tsx` — the figure, its move
  on a short line under it, nothing when there was no move ("a before and
  after in one column", search-console-plan §13.1). Measured after: all
  three fit at 1440px, the word columns 125–202px.

## Order and size

| Step | What | Size |
|---|---|---|
| 1 | D1 — one record for the look, the pull, the checks | 1 day |
| 2 | D2 — the drawing kit, parts from the real components, check:drawing | 1.5 days |
| 3 | D5 — the guide and AGENTS.md | 0.5 day |
| 4 | D4 — tables-fit guard and ratchet; parts lists and look tests for screens being built | 1 day, then with each screen |
| 5 | D3 — redraw the canvases, newest first | 0.5 day each for the large ones, less for the small; about 4 days in all |
| 6 | D4 — the 128 wide tables, every one made to fit | about 2 days |

Steps 1 to 3 stop new drift; 4 to 6 remove what has already drifted.

## Questions for Anthony

All four answered 2026-10-04 (decisions 4 to 6, and Route Planner left out
as Conterra's).

## Change log

- 2026-10-04 — planned after the Keyword research drawings drifted; his
  decisions 1–3 taken the same day.
- 2026-10-04 — decisions 4–6: the look file sets production, the
  explorations redrawn whole, all 128 wide tables fixed in this plan; Route
  Planner Screens left out as Conterra Ops'. About 10 days in all.
