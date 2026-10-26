---
product: Hakken
documentation_type: Developer guide
feature_area: drawing kit and approved-look workflow
audience: frontend developers and design maintainers
source_repository: roninsatwork/Hakken
source_path: docs/developer/drawing-guide.md
last_reviewed: '2026-10-26T10:48:18+00:00'
reviewed_against: current implementation
status: Current
---
# Drawing and building screens — read before either

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** drawing kit and approved-look workflow
> **Reviewed:** 26 October 2026, 10:48:18 GMT (Europe/London)
> **Source path:** `docs/developer/drawing-guide.md` · **Status:** Current

Every screen Anthony sees is drawn first and built second, and both must look
exactly like the app. On 2026-10-04 a set of drawings copied an older
canvas's styles and came out orange, in the wrong font, with blue keywords and
tables that scrolled sideways — two hours after the look had changed. His
words: "We cannot go through this with every agent." This guide is how no
agent does it again. The why and the record of what was built:
[the design drift plan](../plans/active/design-drift-plan.md).

## The rule

**The look has one record, and everything is made from the app.**

- The look — colours for dark and light, the brand, fonts, heading size — is
  `hakken.theme.json`, copied from Admin → System Settings → Global
  Aesthetics by `npm run theme:pull`. The code's defaults and fallbacks
  follow it (`src/theme-record-drift.test.ts`). Never read a colour from a
  drawing, an old plan or a memory: read the record.
- A drawing is made from the **drawing kit**, built from the app's own
  stylesheet and components (`npm run drawing-kit`;
  [how to use it](../design/drawing-kit/README.md)).
- A screen is built from the **screen kit** (`src/ui/components/screens/`,
  [screen-kit.md](./screen-kit.md)) — the same parts the drawing used.

## Before you draw or build anything

1. `npm run check:theme` — the record matches the saved look. If not,
   `npm run theme:pull` and the tests it names.
2. `npm run drawing-kit` — the kit is current.
3. Open the screen beside yours in the running app (localhost:3000) and look
   at it. The drawing has to sit beside it without a seam.

## Drawing

- **Copy parts whole from `parts.html`**: its class names, icons and order.
  Change words and rows only. Never draw a part by eye, never copy another
  canvas's styles, never upload anything but the kit's `kit.css`.
- **Words are Inter, numbers JetBrains Mono**, from the one Google Fonts
  link in `parts.html`. No other font.
- **No colours of your own.** The theme's classes carry every colour;
  charts take `chartPalette.ts` (orange `#f97316` first). Keywords are
  white (`RecordLinkCell`), page addresses blue (`PageLinkCell`), title
  icons the brand colour (`text-brand`).
- **Tables fit the page.** No minimum width, no sideways scrolling: number
  columns as wide as their headings, text columns share the rest, long text
  wraps. Websites' short headings: Volume, Position, CPC, Traffic, Keywords.
- **The whole screen**, in the app's frame — the menu, the top bar, the
  page — with real-looking rows and working clicks (sorting, filters,
  ticks, links between screens).
- **A table's rows are written out**, with holes (`{{rows.r3.tracked}}`)
  for what changes — never an `<sc-for>` or `<sc-if>` inside a table: a
  browser lifts it out, and the rows draw above the table or not at all.
- **`npm run check:drawing -- <board>` on every board before publishing.**
  It fails a class the app does not have, a colour outside the record, a
  font other than the app's, a table that would scroll, or a repeat inside
  a table. Fix what it
  names; never publish a board it fails.
- **A part the kit does not have** is a new part for the screen kit. Tell
  Anthony its name and why before drawing it; when it is built, add it to
  `scripts/drawing-kit/parts.tsx`.

## Redrawing a built screen

A canvas of a screen that is already built is drawn **as the screen now is**,
copied from the running app rather than drawn again by hand, so the drawing
and the app cannot disagree. This is how the nine canvases of built screens
were redrawn on 2026-10-04.

1. `npm run drawing-kit`, and upload `build/kit.css` to the canvas.
2. Copy each screen from the running app: in a tab on localhost:3000, signed
   in, run `scripts/drawing-kit/copy-page.js`, then
   `await window.hakkenCopyPage("<route>", "<name>")` per screen (a third
   argument, `390`, for a phone). Each saves `hk-snap-<name>.html` to the
   browser's downloads — ask Anthony first — and answers with the board's
   height. Move the copies out of Downloads when done.
3. `node scripts/drawing-kit/from-app.mjs images <copies>…` writes the
   pictures the copies carry; upload them to the canvas, and map each key to
   its url in an `images.json`.
4. Per board: `node scripts/drawing-kit/from-app.mjs board <copy> --name
   <Board> --title "…" --height <height + 40> --kit /_blob/<kit.css> --links
   links.json --images images.json --out <Board>.dc.html` — `links.json` maps
   an app path to the board that draws it, so the board's links go between
   boards. A canvas board is at most 8,000px tall; a taller screen scrolls
   inside it.
5. `npm run check:drawing` on every board, as for any drawing. A table that
   scrolls sideways by approval carries the approval marker
   (`<!-- tables-fit: approved sideways scroll (…) -->`), as Content gap's does.

## Building

- Build the screen from the parts the approved drawing used, from the
  screen kit — never a look-alike. `npm run check:guards` fails the common
  drifts (`check:screen-kit`).
- Colours come only from the theme tokens (`theme-drift`,
  `status-colour-drift`); a status is a `StatusLabel`, a kind a `TagLabel`.
- Tables fit the page: no `minWidthClassName` wide enough to scroll.
- When Anthony approves a drawing, save it with its plan under
  `docs/plans/assets/<plan>/` and treat it as binding: a change to that look
  is drawn and approved again first.
- **When the approved screen is built, give it a look test** (screen-kit.md,
  "Approved Looks And Their Look Tests"): it saves the screen's outline beside
  the drawing, and fails when a part is added, removed or moved, a title
  reworded or a column changed.

## When the look changes

Admin → System Settings → Global Aesthetics, then `npm run theme:pull`,
`npm run test:run -- src/theme-record-drift.test.ts` (it names the copies in
the code to update), `npm run drawing-kit`, and re-upload `kit.css` to the
canvases in use. When the saved theme can be read and differs, `check:theme` fails. A skipped or unavailable comparison can exit successfully; read its message rather than treating exit status alone as a live equality proof.

## What The Tooling Actually Verifies

The current drawing generator reads `hakken.theme.json`, compiles the application stylesheet and renders the real component examples in `scripts/drawing-kit/parts.tsx`. Its build aliases replace application navigation, provider hooks, localization and motion with controlled substitutes. This makes a useful parts catalog without running a customer workflow. It does not establish that a real company can read a query, save a record, upload a file or complete a provider operation. Keep such functional acceptance separate from the drawing review.

The generated `kit.css`, `parts.html` and build metadata belong in `docs/design/drawing-kit/build`. They are generated working output, not manually maintained design specifications. A change to a component can require rebuilding the kit even when a drawing's words have not changed. The metadata records build inputs, but a file existing on disk alone is not proof that it was rebuilt against the code currently under review.

Theme comparison has a live boundary. `readSavedTheme` invokes the Convex CLI against development settings. `check:theme` skips on GitHub and warns then exits successfully if it cannot read that saved setting. `theme:pull` writes the local theme record after reading the saved configuration. Therefore these commands are not passive Markdown checks, and a successful skipped comparison is not proof of deployed design acceptance. This documentation-only review read their source without invoking them or changing the record.

The current table shell retains a 720-pixel minimum on narrow screens and clears it at the large breakpoint. The drawing checker explicitly recognizes that phone-only fallback. It also has an approved-sideways marker for the existing exceptional wide table. This differs from the broad instruction that tables never scroll sideways. Preserve the owner-approved design intent, report the difference when it matters and obtain a separate decision before changing the responsive implementation or its acceptance rule. Do not silently remove the fallback while updating this guide.

A look test compares an outline of marked component parts, their ordering, titles and table headings with a saved file. It skips body rows and masks some data, so it is not a screenshot comparison or proof of every color, spacing, overflow or hover state. The drift guard checks an explicit marker list and registered saved-look/test references, plus the approved Search Console boards. It does not independently discover all external drawings. A newly approved screen still needs its own deliberate test and saved asset; passing unrelated outline tests does not complete that obligation.

For a separately authorized design task, follow the earlier steps and the [Screen Kit](./screen-kit.md) together. For repository documentation maintenance, use source inspection, local links and Markdown validation instead. No browser capture, download, kit generation, board publication or application test was performed in this pass. Historical plans and their approved drawing assets were left unchanged.
