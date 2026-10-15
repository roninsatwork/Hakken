# Google Analytics — the website's header

Anthony, 2026-10-15, on the header every Google Analytics page wears above
its menu: "this ux is terrible for button position in the header". Its
website switch sat on a line of its own in the middle of the page, the four
filters wrapped onto a second line under it, and the switch said the
website's name a second time, beside the title.

Three headers were drawn on the canvas "Google Analytics header — three
options" (https://claude.ai/artifact/XisQ1Uo9EiPX5zYrYoWtEJ), each the
approved Overview page with only the header changed:

1. Every control in one row under the title.
2. The website switch by its name, the filters over the page.
3. One compact header: the name is the switch.

He chose 3 the same day: "Go with 3, the compact header where the name is
the switch."

## The approved look — binding

The picture is `docs/plans/assets/ga-header/Compact.png`, the board
`docs/plans/assets/ga-header/Compact.dc.html`. Top to bottom:

1. **The back row**, as every record's: "← Back to Google Analytics".
2. **The title row.** On the left, the website's mark and its name at the
   title's size; when the company has more than one website, the name is the
   switch: a quiet arrow after it, and pressing the name opens the list of
   the company's websites. On the right of the same row, the page's filters
   — Country, Device, Dates, Chart step, as the page offers them — centred
   on the title. On a narrow screen the filters wrap; on a phone they go
   under the title.
3. **One line under it.** On the left, what the website is ("Your website ·
   Google Analytics property …") and its status label; on the right, how
   fresh the figures are ("Analytics' figures to 14 Oct 2026; the last two
   days can still change."). When the line is too narrow, the note drops
   whole to a line of its own rather than breaking in two.
4. **The rule**, then the menu and the page. The note no longer sits at the
   top of the page column.

Nothing else changes: the words, the filters and what each does, the menu
and every page are as they were.

## The parts

- **`TitleSwitch`** (`src/ui/components/screens/TitleSwitch.tsx`), new to the
  screen kit, named to Anthony on 2026-10-15: a page title that opens the
  list of records of its kind. The native select lies invisibly over the
  name, as the filter chip's does, so the keyboard, a screen reader and a
  phone's own picker work as on any dropdown.
- **`DetailHeader`'s `compact` layout** (`src/ui/components/screens/PageHeader.tsx`),
  with a `note` for the right end of the line under the title.
- Both are in the drawing kit (`scripts/drawing-kit/parts.tsx`,
  "record-header-compact") and in `docs/developer/screen-kit.md`.

## Held by

- The look test "Google Analytics → a website's header"
  (`src/app/(dashboard)/app/analytics/googleAnalyticsHeaderLook.test.tsx`)
  against `docs/plans/assets/ga-header/look/Compact.txt`.
- `src/look-tests-drift.test.ts`: `TitleSwitch` keeps its marker.

## Search Console — the same header, approved 2026-10-15

Search Console wore the same header as Google Analytics did. It was drawn
with the compact header on its own canvas, "Search Console header — compact"
(https://claude.ai/artifact/1NfmJAcL8QaLywiHqnjNv2), and Anthony approved it
the same day: "Yes, build the compact header for Search Console as drawn."

The picture is `docs/plans/assets/ga-header/SearchConsole.png`, the board
`docs/plans/assets/ga-header/SearchConsole.dc.html`. The order is as above,
with Search Console's own controls on the title row — Country, the date
range (its From and To boxes when a custom range is chosen) and the step —
and its own note, "Google's figures to …; the last three days can still
change." It is held by `searchConsoleHeaderLook.test.tsx` against
`docs/plans/assets/ga-header/look/SearchConsole.txt`.
