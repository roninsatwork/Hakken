# Sites: moving between a company's own websites

**Started 2026-10-01. Status: built on dev 2026-10-01 ("ok let build it
please"), awaiting review — drawn on a canvas and chosen by Anthony the same
day.** Change a decision here, with a date, before building anything that
disagrees with it.

Anthony, 2026-10-01: "Korda run 5 websites and each of these has competitors
they want to track. Our current UI is great for 1 site and its competitors —
can you draw me a new user frontend UX that allows users to switch between
their own websites." Four screens were drawn on the canvas *Hakken
multi-website switcher*. Anthony: "1 is great, 2 is great — 3 i really dont
like, 4 is great", then, pointing at the switcher's open list, "can we just use
this i love this". Screen 3 (a row of competitor chips under the header) was
taken out, from screen 2 as well.

## Why

Measured on the screens as they are on 2026-10-01:

- The Sites list (`src/app/(dashboard)/app/sites/page.tsx`) is one flat table
  of every site the company holds, owned first. With five owned sites and their
  competitors that is one long mixed list; "of kordatackle.com" in the Type
  column is the only thing that says which site a competitor belongs to.
- The site header's switcher (`[siteId]/layout.tsx`, the `Select` in
  `action`) lists every hold in one flat list, competitors marked
  "(competitor)", nothing grouped.
- Switching website always opens the new site's Overview: the page you were on
  is lost (`switchTo` pushes `/app/sites/{id}` with the dates only).
- Seeing Korda's sites means opening each in turn
  (`fan-out-angles-plan.md`, line 71).

The data already has the shape the screens need: each competitor belongs to one
owned website (`companyWebsites.againstWebsiteId`,
`websites-and-competitors-plan.md` — "A competitor belongs to a website, not to
a company"). The admin side chose the same grouping on 2026-09-28
(`websites-section-menu-plan.md`, Option A: "each followed by its competitors",
"choosing another website keeps the page").

## Decisions

| # | Decision |
|---|---|
| W1 | **Sites opens on "Your sites".** Each owned website is one row with its headline figures, where it is watched from, how often it is checked and when it was last checked. Its competitors fold out beneath it — **all of them** (Anthony, while it was built: "when the accordian opens we need to show all the competitors"), from an arrow **at the end of the row** ("the downarrow shoud be at the end of the row"). A company with one website sees its competitors without asking. Competitors watched against no website sit last, under "On their own" (as the admin chooser does). **No To do column** ("we dotn need todo in teh table"); the download keeps it. |
| W2 | **The website's name is the switcher.** On every site page the title opens one list: a search box, "Your sites", then each owned website with its competitors folded beneath it — the current website's open, five shown, then "Show N more". A tick marks the current site. Pickers stay grey, never orange (`screen-kit.md`, "Orange means this page's action"). |
| W3 | **Switching keeps the page.** Paid keywords on one site opens Paid keywords on the next, with the dates; a page's own filters do not travel (as today). A record's screen (one keyword, one question) goes to the menu page it belongs to. The list says so in its foot: "Switching keeps you on {page}". |
| W4 | **One way to move between a site and its competitors: the switcher.** No chip row, no second picker (screen 3, rejected). On a competitor the header says "Competitor of {host}", and its back link goes to that website, not to the list. |
| W5 | **Sites has one item beneath it in the left menu: "Your sites".** The websites themselves are not listed there; a website is switched from its header. Anthony, 2026-10-01: "in the left hand nav bar can you replace all websites with your sites and thats the only sub menu we have", then, asked whether the websites stay listed beneath it, chose "Just 'Your sites'". One name for the list everywhere: the menu, the page's title, the switcher and the back link all say "Your sites". |
| W6 | **On a phone the switcher opens as a sheet from the bottom**, with the same list, every row at least 44px. |
| W7 | **The "{n} websites beside it" label goes.** The switcher shows each website's competitor count instead. |
| W8 | **Admin → company → Websites → All websites is laid out the same way** (Anthony, 2026-10-01, of "Your sites": "a much better design and layout"): each of the company's own sites with its place, its competitors folded beneath it from the arrow at the end of its row, those watched against none of them under "On their own". It keeps its admin columns — next check, limits, remove — and loses Type and Moves, which the grouping and the To do page carry. **Adding a website stays on the list** rather than opening the new site's To do page ("why is it when i add a website it takes me to a todo when it should take me back the websites screen"); a new competitor's site is unfolded so it can be seen. |
| W9 | **The admin Websites section's chooser is the same picker** (`WebsitePicker`, shared with the client header): searched, "All websites", each of the company's own sites with its competitors folded beneath it — five shown, then "Show N more" — and those watched against none of them. The native drop-down it replaces listed every competitor of every site in one column (Anthony, 2026-10-01, with Korda at five sites: "not sure this works anymore in the admin when i add lots of competitors"). Choosing keeps the page open where the site has it, as before. |

## What changes

### Backend

- `holdSummaryValidator` (`convex/sites.ts`) gains `ofSiteId` — the owned
  site's hold a competitor belongs to, or null — so the list and the switcher
  group by id, not by host.
- `listMySites` gains the site's check cadence (the hold's schedule; a paired
  competitor reads its owned site's, `websiteSiteRows.ts`) — `cadenceOf` in
  `convex/utils/trackingVerdicts.ts`, which `pullsPerMonth` now reads too — and
  where it is watched from (`placeLabel`).
- No query for the left menu: W5 lists no websites there.

### Screens

- `src/app/(dashboard)/app/sites/page.tsx` — the grouped list (W1), still the
  kit's `DataTable`: one line per website, a line per competitor folded out
  beneath it. The search keeps working: a search opens every group with a
  match. The Type filter goes — the grouping says what each site is. The CSV
  download stays flat, one row per site, with a "Competitor of" column.
  Sorting sorts the owned websites, and the competitors the same way inside
  each group (`src/pagination-drift.test.ts` requires a sort on every Sites
  table). The grouping is `siteGroups.ts`, shared with the switcher; the
  letter marks are `SiteMark.tsx`.
- A new `SiteSwitcher` in `src/app/(dashboard)/app/sites/_components/` (W2, W3,
  W6), built on the open-list pattern `NotificationBell` already uses (a card
  under its button, closed by Escape or a click outside), a sheet on a phone.
  It replaces the `Select` in `[siteId]/layout.tsx`; `DetailHeader` takes it in
  place of a plain title. The page kept comes from `sitePageForPath`.
- `[siteId]/layout.tsx` — the back link (W4) and the label taken out (W7).
- `src/ui/components/layout/SidebarNavTrees.tsx` — Sites gets "Your sites"
  beneath it (W5), with the `SubNavItem` the admin tree already uses, open
  whenever a Sites page is.
- Words in `messages/en.json` and `messages/it.json`.

### States to cover

One owned website (its competitors shown without asking; the title switcher
still lists them); a website with no competitors; a competitor watched
against nothing; a site not checked yet; loading; a search that matches
nothing; a company holding nothing.

## Steps

| Step | What | Estimate |
|---|---|---|
| 1 | Backend: `ofSiteId`, cadence, the menu query, their tests | 0.5 day |
| 2 | Sites home grouped (W1) | 1 day |
| 3 | The switcher, keeping the page, the phone sheet (W2, W3, W4, W6, W7) | 1.5 days |
| 4 | Left menu (W5) | 0.5 day |
| 5 | Words, accessibility, the local gate (`verify:env`, `lint:all`, `check`, `build`, `git diff --check`) | 0.5 day |

About 4 days planned. **Overall: built on dev 2026-10-01; browser check in
Anthony's Chrome and review outstanding.**

## Open questions

1. **A competitor of several websites.** A company can hold each host once
   (`websiteAttachments.ts`), so a competitor belongs to one of its websites
   only. If Nash Tackle competes with three of Korda's sites it can sit under
   one of them. `websites-and-competitors-plan.md` says the same rival "may be
   tracked against several of a company's websites". Not in this plan: the
   backend would change first.
2. ~~The left menu with many websites~~ — settled by W5: the menu lists none.
3. **Korda's other four websites** are placeholders on the canvas; the build
   reads the real holds, so nothing waits on them.
