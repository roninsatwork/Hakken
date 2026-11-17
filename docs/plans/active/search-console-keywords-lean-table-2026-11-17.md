# Search Console Keywords — the lean table (17 November 2026)

Anthony sent a picture of the Keywords table built that afternoon (Way 2,
`search-console-keywords-way-2-plan-2026-11-17.md`), in a window about 1,330
wide: "this table layout is terrible - is too cluttered, why do we keep having
the same conversation", then "we need to make a table rule, no cluttered tables
ever and if we need more detail make a click through". The rule is AGENTS.md's
"Tables are lean".

The board "The lean table, in the same window", on the Keywords canvas
(https://claude.ai/artifact/D1vSPHFgnV1js7aKfyqAZY), was redrawn on his
comments until he said "thats better, how we make this a rule so all tables we
draw are like this". It is saved here as the picture every table copies:
`docs/plans/assets/search-console-keywords-lean-table/TableLean.dc.html`.

## What the board settles

| | Today (built) | The lean table |
|---|---|---|
| Columns | Tick, Keyword, Clicks with its move under it, Impressions, CTR, Position with its move under it, Pages, Top page, Track | Tick, Keyword, Clicks, Up or down, Shown, CTR, Position |
| Rows | Two or three lines | One line ("its the two lines thats not good") |
| Up or down | — | The move alone, no percent ("remove the %") |
| Impressions | "Impressions" | "Shown", Impressions on hover ("impressions is to long a heading") |
| CTR | Kept | Kept ("add CTR to the table please") |
| Keyword | Wraps a word to a line in a narrow window (68 pixels) | At least 160 pixels, cut to one line with "…", whole on hover |
| Track, Pages, Top page, the move in position | In the table | On the keyword's own screen, which already shows Track, its rate and position, and the pages it brought people to |

The search box and its four menus stay as they are.

## Built — 17 November 2026

Built on `dev` the same afternoon, after Anthony's "Yes, build it". Not committed.

Every list on `SearchConsoleListScreen`, and New and lost, follows the table rule. The tables, top to bottom:

| Page | Columns |
|---|---|
| Keywords | Tick, Keyword, Clicks, Up or down, Shown, CTR, Position |
| Pages | Page, Clicks, Up or down, Shown, CTR, Position |
| Tracked keywords, Tracked pages | Track, the name, Clicks, Up or down, Shown, Position. Track stays, as unticking is what they're for, so CTR moves off |
| Brand and non-brand | Keyword, Brand, Clicks, Shown, CTR, Position. CTR stays, as brand searches are clicked far more often |
| Almost there | Keyword, Position, Shown, Clicks, Volume, Page |
| Missed demand | Keyword, Volume, Shown, Position, Clicks, Page |
| Shown but not clicked | Page, Shown, CTR, Usual CTR, Clicks, Expected. Position, behind Usual CTR, moves off |
| Real against estimated | Page, Classification, Clicks, Estimate, Difference |
| Pages competing | Keyword, Clicks, Top page, Share, Next page, Share. The count of pages moves off |
| Position bands | Keyword, Band, Position, Up or down, Clicks, Shown |
| Wins and losses, Volatility, New and lost | As before, with Up or down and Shown |

- Shared, not copied: `keywordColumn` and the new `pageColumn` (the name at `min-w-[160px]`, cut to one line, whole on
  hover); `PageNameCell` on one line (the title once Google Analytics knows it, else the address, both on hover through
  `RecordLinkCell`'s new `hover`); `figureColumns` without `clicksAndChange` and `positionAndMove`; `ShownHeading`.
- Words: `table.change` is "Up or down" everywhere in Search Console; `table.shown` and `table.shownTitle` are new. The
  lines that said to tick a row to track it now say to click it (Pages, Missed demand, both tracked lists). CSV downloads
  keep Google's words and every field.
- Tests: the approved-look outlines are rewritten for the tables only (`-u`, on Anthony's go); the Keywords and tracked
  list tests assert the lean columns. The frozen list went from 58 tables to 52.
- Checked in Anthony's Chrome on More Handles, Last month, on all 14 pages, at its width and in a 745-pixel table: every
  row one line (49 pixels), no heading over its column, nothing sideways, the name never under 178 pixels.

Still over the rule, waiting on Anthony: the table on a keyword's or a page's own screen (Track and six more), the list
of connected websites, and Real against estimated's heading "Classification", fourteen letters, which is the app's own
name for it.
