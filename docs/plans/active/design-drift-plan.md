# Design drift — one record for the look, and nothing built or drawn off it — 2026-10-04

Planning. Nothing built yet.

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

| Canvas | State of its screens |
|---|---|
| Keyword research | Redrawn on the app's stylesheet 2026-10-04 — moves onto the kit file |
| Search Console — keywords and pages | Built; 24 boards |
| Learn: News, Knowledge, Who to follow | Built in part |
| Platform limits | Built |
| Hakken Websites — Screens to build | Built |
| Hakken multi-website switcher | Built |
| Hakken Sites Overview Drawing | Built |
| Content gap, Ahrefs layout | Built |
| Hakken Collection Runs Drawing | Built |
| Fan-out queries — Track | Built |
| Features screen | Built |
| A search's page header | Built |
| Your prompts — the limit on screen | Built |
| Search Console — beyond Google | An earlier proposal |
| Replacing the pills | A comparison of four options; C chosen |
| Route Planner Screens | Not Hakken's (see the questions below) |

Each is redrawn from `parts.html` on the kit, its boards kept, its
`docs/plans/assets/<plan>/` copy refreshed. A canvas whose screen is built
is drawn as the screen now is, so the drawing and the app agree again.

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

## Order and size

| Step | What | Size |
|---|---|---|
| 1 | D1 — one record for the look, the pull, the checks | 1 day |
| 2 | D2 — the drawing kit, parts from the real components, check:drawing | 1.5 days |
| 3 | D5 — the guide and AGENTS.md | 0.5 day |
| 4 | D4 — tables-fit guard and ratchet; parts lists and look tests for screens being built | 1 day, then with each screen |
| 5 | D3 — redraw the canvases, newest first | 0.5 day each for the large ones, less for the small; about 4 days in all |
| 6 | D4 — the 128 wide tables, falling screen by screen | with each screen touched |

Steps 1 to 3 stop new drift; 4 to 6 remove what has already drifted.

## Questions for Anthony

1. **Production.** There is no production yet. When there is, should
   `hakken.theme.json` set production's look (recommended: the repo is the
   record, so production matches dev), or may production keep its own?
2. **Route Planner Screens.** It looks like Conterra Ops' work, not
   Hakken's. Leave it out?
3. **The two explorations.** "Replacing the pills" (four options, C chosen)
   and "Search Console — beyond Google" (an earlier proposal): redraw only
   the chosen option and mark the rest as history, or redraw them whole?
4. **The 128 wide tables.** Fix them all as part of this plan, or let the
   ratchet bring them down as each screen is next touched?

## Change log

- 2026-10-04 — planned after the Keyword research drawings drifted; his
  decisions 1–3 taken the same day.
