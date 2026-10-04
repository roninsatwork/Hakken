# Content gap, laid out like Ahrefs, organic search only

**Started and built on dev 2026-09-30. Status: built and reviewed —
Anthony, the same day: "this is a great screen now".** The look below is
approved and binding:
change it here, with a date, before building anything that disagrees with it.

Drawing: the canvas "Content gap, Ahrefs layout" (claude.ai artifact
`SoK2VZMG2GZYkPk3TfhiMS`), one board. Its source is kept beside this plan
(`../assets/content-gap-ahrefs-layout/approved-drawing-2026-09-30.dc.html`),
with the built page as it stands (`built-2026-09-30.jpg`). On 2026-10-04 the
canvas was redrawn on the drawing kit as the page is built
(design-drift-plan D3), and that board is kept beside it too
(`as-built-2026-10-04.dc.html`); the approved drawing stays the record of
what was agreed.

## What was asked

Anthony, 2026-09-30, showing our Content gap beside Ahrefs' content gap:
"I prefer the layout of ahrefs. We should not include paid search only
organic search. Can you draw a new screen for this please". The drawing was
made with ronins.co.uk's real rows; his answer was "yes please build it".
Once it was built he asked what "On its page" meant, and had it taken off
("remove it please"), and CPC with it ("and remove CPC too").

## The approved look (binding)

Page: `/app/sites/[siteId]/competitors/gap`. Everything above the table is
unchanged: the title, the question it answers, the reading note, the search
box, the **Intent** and **Competitors ranking** filters, the count, and
**Download all (CSV)**.

The table, left to right:

1. **Keyword** — set 220px wide, cut short with "…", the whole of it on
   hover; kept in place while the table scrolls sideways (the kit's
   `stickyFirstColumn`), on the table's own solid ground, with a hairline
   down its right edge. Opens the search's own screen, as before.
2. **What they want** — `IntentLabel`: icon and words, never a pill.
3. **Volume** — searches a month.
4. **KD** — difficulty, 0 to 100.
5. Then **a pair of columns per competitor**, **Position** and **Traffic**,
   under the competitor's name in a heading row above them (the kit's
   `headerGroups`), each pair with a rule down its left edge. The name opens
   that competitor's own Sites pages.
   - Position: the competitor's place on Google, in the monospaced figure,
     the cell **tinted `bg-info/10`** where it ranks, as Ahrefs tints it.
   - Traffic: the visits a month the search brings the competitor, "<1"
     under one (`formatVisits`).
   - A competitor that does not rank for the search: "–" in both, no tint.
   - Competitors in the order the site switcher lists them, A to Z.

Not shown, deliberately:

- **No paid search**: no advert position, advert traffic or Ad column
  (Anthony's instruction), and no CPC (taken off after the build).
- No "On its page" (Ahrefs' SF, how many other things Google shows on the
  search's page): drawn and built, then taken off.
- No Entities (not collected), no SERP button (the keyword already opens its
  screen with Google's page), no tick boxes or "add to list" (no such feature).
- No column for the site itself: a gap is a search it does not rank for, so
  it would always be blank.
- "Who ranks" and "Best position" are gone: the competitor pairs show both.

Every heading sorts the whole list the Sites way (`sites-table-sorting-plan.md`):
the search A to Z, the most searched first, the easiest first; a
competitor's Position the top first
and Traffic the most first, a search it does not rank for last either way.
The order is kept in the address — `sort=position:<competitor's Sites id>` for
a competitor's column — and the download comes in the same order.

## Where the numbers come from

All of it was already collected: each competitor's ranked-keywords list holds
the search's difficulty and the competitor's estimated traffic
(`siteKeywordRanks`). The gap only carried position.

- `siteContentGaps` gained `difficulty` and a `traffic` per rival (both
  optional: a gap worked out before shows dashes until it is worked out
  again). `siteContentGap.rebuildGap` takes the difficulty from the first
  rival's ranking that knows it.
- The gap's compact copy has a new layout (`GAP_COPY_FIELDS`): a copy in the
  old one reads as none and is built again when the page next opens.
- `siteCompetitors.listContentGap` returns the new fields, the competitors
  whose columns to draw (`competitors`), and sorts by `kd`, and `position` /
  `traffic` with `rivalId`.
- The CSV: `keyword, intent, volume, difficulty`, then
  `<host>_position, <host>_traffic` per competitor, then `last_checked`.
  Traffic is rounded to whole visits, as every Sites download rounds it, so
  "<1" on screen is 0 in the file.
- On dev, every site's gap was worked out again on 2026-09-30 from the
  rankings already held (no DataForSEO calls, no cost), so the columns are
  full now rather than at the next collection run.

Limits, none new: a competitor is read to its 5,000 most-searched keywords
(`GAP_KEYWORDS_PER_RIVAL`, stated on the page), a gap copy holds 50,000 rows
(`GAP_COPY_MAX`), and a group compares at most 25 competitors (`MAX_RIVALS`).
With four competitors the table is about 1,400px wide and scrolls sideways
on a laptop; Korda, with eleven, scrolls much further.

## Guards against drift

- `src/app/(dashboard)/app/sites/[siteId]/competitors/gap/page.test.tsx` —
  the headings in order (names above, then the columns), no paid, CPC or
  features column, the
  tint where a competitor ranks and none where it does not, "–" and "<1", the
  kept keyword column, and a competitor's column sorting through the server.
- `src/ui/components/screens/DataTable.test.tsx` — "a table laid out like a
  comparison": `headerGroups`, `stickyFirstColumn`, `cellClassName`.
- `convex/siteSorting.test.ts` — every new order, blanks last.
- `convex/sites.test.ts` — the new fields and `competitors`.
- `convex/siteExports.test.ts` — the file's per-competitor columns and order.

## Change log

- **2026-09-30** — Drawn with ronins.co.uk's real rows; "yes please build
  it". Built on dev the same day: the shared table gained three options
  (`headerGroups`, `stickyFirstColumn`, `cellClassName`), `FeaturesCell`
  gained `bare`, and the gap carries difficulty, cost, features and traffic.
  One fix while checking it in the browser: the keyword column is a set
  220px, because a share of the width (`CUT_COLUMN`) is nothing in a table
  wider than the screen.
- **2026-09-30** — "On its page" and CPC taken off (Anthony, asked what the
  first meant: "remove it please", then "and remove CPC too"): from the page,
  its sorting, the download and the gap itself, which no longer keeps either.
  `FeaturesCell` is back as it was. The drawing still shows both columns;
  the screenshot is of the page without them, and this plan is the look now.
- **2026-09-30** — Reviewed: "this is a great screen now". Committed and
  pushed to dev.
