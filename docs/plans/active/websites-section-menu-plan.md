# Admin → company → Websites: one menu for the whole section

**Started 2026-09-28. Status: built on dev 2026-09-28, awaiting review —
Option A chosen by Anthony ("a i think lets build it"), from three options
drawn on a canvas the same day.** Change a decision here, with a date, before building anything that
disagrees with it.

Anthony, 2026-09-28, showing the company's AI questions under a website's
Results tab: "i think we need to rethink the UX on these screens under
websites — they are getting quite complex and hard to navigate". Three options
were drawn with Korda's real rows (the canvas *Websites section — layout
options*): A, one menu for the whole section; B, each website a workspace;
C, Admin for set-up only with results in Sites. A was chosen.

## Why

Measured on the screens as they were on 2026-09-28:

- The Websites tab was a menu of four pages, so nothing was closer than two
  clicks; a website added four tabs and Results five more views — up to five
  clicks deep, with three rows of navigation on one screen.
- Three lists existed twice, per website and for the company, with different
  columns and actions: AI questions, Google searches, the searches the AI ran.
- One website's settings sat in four places: a dialog in its header, two cards
  at the foot of its overview, a competitor's overview, and the company's
  Collection schedule.
- Inputs sat inside Results: two of its five views changed lists.
- One idea had several names ("What the AI searched", "What the engines
  searched", "Searches the AI ran").

## The section, as built

The company's **Websites** tab opens the section directly — no drop-down. The
section is a menu down the left and the page on the right:

| Group | Page | With **All websites** chosen | With **one website** chosen |
|---|---|---|---|
| — | *Website* chooser | Every website the company holds: its own, each followed by its competitors | |
| Websites | All websites | The list: its own sites first, each followed by its competitors; search; add and remove | — (choosing a site leaves the list) |
| What we track | Tracked keywords | Every website's, with where each came from | That website's, with positions |
| | Your prompts | Every website's, with the searches the AI ran for each | The same list, narrowed to it |
| | Competitors | Choose a website | Its competitors and suggestions |
| | Names and profiles | Choose a website | Its names, and for its own site the business |
| What came back | To do | Choose a website | How it is doing, and what to do next |
| | Rankings | Choose a website | Everything it ranks for |
| | AI answers | Choose a website | Where it is named in AI answers |
| | AI searches | Every website's, with filters and ticking to track | The same list, narrowed to it |
| Collection | Schedule and limits | The company's schedule, limits, Collect now, cost to serve | Its own schedule and place, its limits, its pairing (a competitor), its shared record |
| | Runs and cost | Every run | Every run (runs are the company's) |

- **A competitor chosen** shows only what a competitor has: Names and
  profiles, Rankings, and Schedule and limits (where its pairing is), besides
  All websites and Runs and cost.
- **The chosen website is the address**: a website's pages keep their
  addresses (`…/websites/site/<id>/…`), and the company's keep theirs, so
  every link and bookmark still opens where it did. The menu links each page
  at the scope chosen; choosing another website keeps the page, where that
  website has it.
- **One name per idea**, the menu's: Tracked keywords, Your prompts,
  Competitors, Names and profiles, To do, Rankings, AI answers, AI searches,
  Schedule and limits, Runs and cost. Page titles use them.
- **A website's settings in one place**: its Schedule and limits page holds
  what the header dialog and the overview's two cards held, inline.
- **No labels on the menu** — names only, as every menu.

## Decided while building (2026-09-28), for review

- Pages that only make sense for one website (Competitors, Names and
  profiles, To do, Rankings, AI answers) ask to choose one when All websites
  is chosen, listing the websites they apply to.
- Your prompts and AI searches are each one list at both scopes. The
  company's AI searches gained *Untrack* (asked first), which only a
  website's own page had, so the website's second page could go with nothing
  lost; its "buying searches you don't track" button is the list's own
  filters (*What they want*: ready to buy, *Not tracked yet*).
- Tracked keywords keeps its two views for now — a website's has each
  search's position and pausing, the company's has where a search came from —
  and the company's says to choose a website to see positions. Making it one
  list is a follow-up.
- The All websites list drops its *Added* column to fit beside the menu.
- A website's page with a competitor chosen opens on Rankings; with its own
  site chosen, on To do. A competitor's old overview (how it is watched) is
  on its Schedule and limits, with where to compare it.
- The menu marks the page open the way every menu does (`navStyles.ts`),
  never in orange, and its icons are the page headers' icons.

## Phases

| Phase | What |
|---|---|
| 1 | The section frame: the menu and chooser, the Websites tab as a link |
| 2 | A website's pages inside it: header and tabs gone, Schedule and limits inline, titles renamed |
| 3 | The company's pages: the list grouped, the three lists as pages of their own, the choose-a-website pages |
| 4 | Tests, guards and the full gate |

## Change log

- **2026-09-28** — Written after Anthony chose Option A ("a i think lets
  build it") from the canvas of three options drawn with Korda's real rows.
- **2026-09-28** — Built on dev as the table says. The All websites list reads
  the company's websites whole (up to 200) so it can group them; the chooser
  reads the same, light. AI searches became one list, with *Untrack* added.
- **2026-09-28** — *AI questions* renamed *Your prompts* (Anthony: "can we
  change Ai Questions to Your Prompts"), in the menu, the page title and the
  To do card; the client's Sites screens keep their own wording.
- **2026-09-28** — *Google searches* renamed *Tracked keywords* (Anthony: "we
  need to rename this to be Tracked Keywords"), in the menu, the page titles
  and the To do card.
