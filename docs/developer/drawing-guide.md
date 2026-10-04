# Drawing and building screens — read before either

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
- **`npm run check:drawing -- <board>` on every board before publishing.**
  It fails a class the app does not have, a colour outside the record, a
  font other than the app's, or a table that would scroll. Fix what it
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

## When the look changes

Admin → System Settings → Global Aesthetics, then `npm run theme:pull`,
`npm run test:run -- src/theme-record-drift.test.ts` (it names the copies in
the code to update), `npm run drawing-kit`, and re-upload `kit.css` to the
canvases in use. `npm run check` fails while the saved look and the record
differ.
