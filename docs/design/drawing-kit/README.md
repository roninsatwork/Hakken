# The drawing kit

Every drawing of a Hakken screen — a canvas board, a mock-up, a page shown to
Anthony before it is built — is made from this kit, and from nothing else.
The kit is built from the app itself, so a drawing looks exactly like the app
does today. Why it exists: [the design drift plan](../../plans/active/design-drift-plan.md).

## What it is

`npm run drawing-kit` builds three files into `docs/design/drawing-kit/build/`
(not committed; it takes half a second):

- **`kit.css`** — the app's own stylesheet, compiled from
  `src/app/globals.css` the way the app compiles it, with the look from
  `hakken.theme.json` on the page root.
- **`parts.html`** — every kit part, rendered from the real components:
  the sidebar, the top bar, page and record headers, the section menu,
  figures, the chart card, notices, the settings card and its fields,
  buttons, filters, status and tag labels, and a Websites table with its
  bar, sorting headings, cells and numbered pages. Each part sits between
  `<!-- part:id -->` and `<!-- /part:id -->`.
- **`kit.json`** — what it was built from: the look's and the stylesheet's
  fingerprints.

`tests` keep it honest: `scripts/drawing-kit.test.mjs` rebuilds it, so a
component that stops rendering for the kit fails the check rather than the
next drawing.

## Drawing a screen

1. **Check the look is current.** `npm run check:theme`. If it fails, run
   `npm run theme:pull` (it copies the look saved in Admin → System Settings
   → Global Aesthetics into `hakken.theme.json`), then the tests it names.
2. **Build the kit.** `npm run drawing-kit`.
3. **Put the stylesheet on the canvas.** Upload `build/kit.css` as an asset
   and link it in each board's `<head>`, after `support.js`. Note
   `kit.json`'s `css` fingerprint in the canvas's notes, so a stale canvas
   shows.
4. **Wrap the page as the app does.** In `<helmet>`, load the app's two
   fonts and nothing else —
   `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500`
   (the link in `parts.html`'s head); then
   `<div class="dark"><div class="flex min-h-screen bg-background text-foreground font-sans tracking-tight antialiased">`
   — the sidebar, then the page column (`flex flex-col flex-1 w-full p-8`),
   with the top bar first.
5. **Copy parts whole from `parts.html`.** Change the words and the rows;
   keep the class names, icons and order. Never draw a part by eye, never
   copy another canvas, and never write a colour: the theme's classes
   (`text-foreground`, `text-secondary`, `text-muted`, `bg-card/40`,
   `border-border-dim`, `text-brand`, `text-info`, `text-success`,
   `text-warning`) carry it. Chart series take `chartPalette.ts`'s colours,
   orange (`#f97316`) first.
6. **Tables fit the page.** No minimum width and no sideways scrolling: number
   columns as wide as their headings, text columns sharing the rest, long
   keywords and addresses wrapping. Websites' short headings: Volume,
   Position, CPC, Traffic, Keywords.
7. **Check every board.** `npm run check:drawing -- <board.dc.html> …` fails
   a class the app does not have, a colour outside the look, a font other
   than Inter and JetBrains Mono, or a table that would scroll. Fix what it
   names before publishing.
8. **A part the kit does not have** is new to the screen kit. Tell Anthony by
   name before drawing it (`core-component-set-no-drift`); when it is built,
   add it to `scripts/drawing-kit/parts.tsx`.

## When the look changes

Change it in Admin → System Settings → Global Aesthetics, then
`npm run theme:pull`, `npm run test:run -- src/theme-record-drift.test.ts`
(it names the copies in the code to update), `npm run drawing-kit`, and
re-upload `kit.css` to the canvases in use. `npm run check` fails while the
saved look and `hakken.theme.json` differ.

## Words and numbers

Words are Inter and numbers in tables JetBrains Mono (`font-mono`), as
`src/app/layout.tsx` loads them. Both come with the kit's classes once the
fonts are linked; a drawing never names a font in a style itself.
