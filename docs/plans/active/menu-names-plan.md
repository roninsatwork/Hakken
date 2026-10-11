# The client's menu: Visibility, Reading room, and a new Insights

**Started 2026-10-11. Status: drawing approved 2026-10-11 (Anthony: "yes");
phases 1–6 built on dev the same day ("can we build this … then just commit,
don't push"), committed, not pushed. Phase 7, the new Insights item, waits for
its first page.** The approved drawing is
`docs/plans/assets/menu-names/menu-today-and-planned.png`. Change a decision
here, with a date, before building anything that disagrees with it.

Anthony, 2026-10-11, on the section of DataForSEO screens: "Its the discovery
name … that i dont like. We cant name data for seo and i want to use Discovery
for something else". Then, after a brainstorm the same day: "lets plan for
discovery to change to visability and insights to reading room … I want to add
a new menu items called Insights which will appear under Ask Hakken and hakken
tasks moves to below insights", corrected minutes later: "move hakkens task to
below reading room".

## Why

- **Discovery** names the supplier's idea rather than the page's. What the
  section shows is how visible a website is from the outside: in Google's
  results, AI answers, Maps, reviews, other websites' links and mentions, and
  paid search, for the company's own sites and every rival it watches. All of
  it is estimated. That is what sets it apart from Search Console and Google
  Analytics, which are the company's own real counts. The supplier cannot be
  named.
- **Discovery** is also the English for Hakken (発見), so Anthony is keeping
  the word free for something else.
- **Insights** promises analysis of the company's own data, but the section is
  reading: News, Who to follow, Knowledge and Helpful content. The code already
  calls it Learn (`isLearnPath`, `learn.menu`).
- That frees **Insights** for the new section that does analyse the data.

## The menu

| Today | Planned | What changes |
|---|---|---|
| Dashboard | Dashboard | — |
| Ask Hakken | Ask Hakken | — |
| Hakken tasks | **Insights** | New item, straight under Ask Hakken |
| Discovery ▾ | **Visibility** ▾ | Discovery renamed; Websites and Keyword research stay under it |
| Search Console | Search Console | — |
| Google Analytics | Google Analytics | — |
| Insights | **Reading room** | Insights renamed; News, Who to follow, Knowledge, Helpful content unchanged |
| | **Hakken tasks** | Moves down, below Reading room |
| Usage ▾ | Usage ▾ | — |

Tasks and Calls keep their place before Visibility, and Reception and
Governance theirs after Usage; they show only for the companies that have
them.

## Decisions

1. **Discovery becomes Visibility.** In the menu, in every sentence that names
   the section ("Open it in Visibility", "Visibility's estimate", "Add one in
   Visibility → Websites"), in Admin's wording, and in the Keyword research
   agent's description. Its two sub-items, Websites and Keyword research, keep
   their names. Its icon stays the globe.
2. **Insights becomes Reading room.** In the menu, in its own side menu's
   heading, and in every sentence that names it (Admin → Content's notes on
   where readers see an article, a person or a topic). What is inside does not
   change. Its icon stays the graduation cap.
3. **A new Insights item sits under Ask Hakken**, with a lightbulb icon. It is
   assumed to be the AI analyst section worked on as "Observations" on
   2026-10-11: a few evidenced findings a week, each a story across three or
   more sources ending in a strategy. What its pages show is that section's
   own plan; this plan only places it in the menu.
4. **Hakken tasks moves below Reading room**, just above Usage.
5. **Addresses stay as they are.** `/app/sites`, `/app/keyword-research` and
   `/app/news` keep working, so no bookmark or link breaks. Only the names
   people read change. The new Insights gets its own address when it is built.
6. **The code keeps its own names.** The code calls Visibility `sites` and
   Reading room `learn`, and those stay. Stored tables named `insights…`
   (`insightsCounts`) belong to Reading room. Renaming a stored table means
   moving its data, so they stay too, each with a one-line comment saying they
   are Reading room's. Comments that say "Insights" for Reading room are
   reworded in the same change, so "Insights" in the code means only the new
   section.
7. **"Discovery" is not reused for Visibility.** The Dashboard's
   "発見 · Discovery" line (`dashboard.hero.eyebrow`, "発見 · Scoperta" in
   Italian) and the public site's hero translate the product's name, not the
   section, and stay.
8. **Italian.** Visibility is "Visibilità" (Italian today mixes "Scoperta" and
   "Discovery"; both go). Reading room is "Sala di lettura". The new Insights
   keeps "Insights", as the Italian menu says today.

## What the change touches

Measured on 2026-10-11:

- **The menu**: `src/ui/components/layout/SidebarNavTrees.tsx` (the order,
  and its comments). The words are `sidebar.sites` and `sidebar.learn`, and
  Reading room's side menu heading is `learn.menu.label`. The top bar's page
  title reads the same words (`src/ui/components/layout/Header.tsx`), so it
  follows by itself.
- **Visibility's words**: 28 entries in `messages/en.json` say "Discovery",
  besides the Dashboard line. In `messages/it.json` the same entries say
  "Scoperta" (22) or "Discovery" (6). They cover Search Console ("Discovery's
  figures", "Open it in Discovery", "Discovery's estimate"), Google
  Analytics' empty states and links, the Help list's description, Admin's
  collection, limits and Google updates screens, and the Decisions list's
  "Used in".
- **Reading room's words**: 20 entries in each language besides the menu,
  nearly all in Admin → Content (Helpful content, Who to follow, Topics,
  reading analytics), plus the record-keeping setting for reading events.
- **Outside the dictionaries**: the Keyword research agent's description
  (`convex/agentTemplates.ts`), the LinkedIn message in
  `convex/followChannels.ts`, and the drawing kit's sidebar parts
  (`scripts/drawing-kit/parts.tsx`).
- **Tests**: the sidebar's test and its saved snapshot, News' side menu
  test, and about 35 test files that use one of the names in their titles or
  comments.
- **Saved approved looks**: 52 of the files under `docs/plans/assets/*/look/`
  name a section in their title line. In 8 of them the screen itself shows the
  word: 7 show Reading room's side menu heading, and 1 shows Search Console's
  "Discovery's estimate". This drawing approves those 8 changes.
- **Records**: `docs/developer/screen-kit.md`, three developer reference
  pages, and PRODUCT.md's Knowledge, Helpful content and News rows, plus a
  change-log line. `docs/product/` and the older plans named "Discovery" are
  dated records and are not edited.
- **Stored articles**: Knowledge and Helpful content articles live in the
  database, not the code. Any that name Discovery or Insights are found in
  Admin → Content and reworded in English; the Translator rewrites the rest.

## Build plan

Phases 1 to 6 are one change, about one day of work, then pushed together
when Anthony asks. Phase 7 waits for the analyst section.

| Phase | What | About |
|---|---|---|
| 1 | **The menu.** New order; Discovery → Visibility, Insights → Reading room, in the menu, its side menu heading and the top bar; English and Italian | 1½ hours |
| 2 | **Visibility's words.** The 28 entries in each language; the Keyword research agent's description | 1½ hours |
| 3 | **Reading room's words.** The 20 entries in each language; the LinkedIn message | 1 hour |
| 4 | **Code, tests and looks.** Comments and test titles; the 8 saved looks re-saved and 52 title lines reworded | 1½ hours |
| 5 | **Records and stored articles.** Docs, PRODUCT.md, the drawing kit; stored articles checked and reworded | 1 hour |
| 6 | **A guard and the checks.** A test that fails the old names; the full local and GitHub checks; the menu checked in the running app | 1 hour, plus machine time |
| 7 | **The new Insights item.** Added under Ask Hakken, linked to its first page | with the analyst section's first page |

### Phase 1 — the menu

- `SidebarNavTrees.tsx`: the order becomes Dashboard, Ask Hakken, Visibility,
  Search Console, Google Analytics, Reading room, Hakken tasks, Usage.
  Insights' place, straight under Ask Hakken, is held by a comment until
  phase 7. The comments above Visibility and Reading room give the new names
  and point to this plan.
- `sidebar.sites`: "Visibility" / "Visibilità". `sidebar.learn` and
  `learn.menu.label`: "Reading room" / "Sala di lettura".
- Tests: `SidebarNavigation.test.tsx` ("Discovery's menu" becomes "Visibility's
  menu", and checks the new order), the characterisation snapshot,
  `news/page.test.tsx`.
- Done when the running app's menu matches the approved drawing, without the
  Insights item.

### Phase 2 — Visibility's words

- Every entry listed above, in both languages: "Discovery" and "Scoperta"
  become "Visibility" and "Visibilità", with each sentence reread so it still
  reads well ("Discovery's estimate" becomes "Visibility's estimate"; "Add one
  in Discovery → Websites" becomes "Add one in Visibility → Websites").
- The Keyword research agent's description. A company's installed agent may
  keep its own copy of the description. If it does, one small data update
  rewords the copies, and Anthony is asked before it runs.

### Phase 3 — Reading room's words

- Every entry listed above, in both languages: "Insights" becomes "Reading
  room" / "Sala di lettura", each sentence reread.
- `convex/followChannels.ts`: "LinkedIn can't be read, so it is shown in
  Reading room only."

### Phase 4 — code, tests and looks

- Comments that say "Discovery" for the section say "Visibility"; comments
  that say "Insights" for the reading section say "Reading room". After this
  phase, "Insights" in the code means only the new section.
- Stored tables keep their names (`insightsCounts` and the rest, decision 6),
  each with a one-line comment that they are Reading room's.
- `_learn/insightsLook.test.tsx` becomes `readingRoomLook.test.tsx`; test
  titles that name either section are reworded.
- The 8 saved looks whose screens show the word are saved again, and the 52
  title lines reworded. Nothing else in a look may change. If a look test
  shows any other difference, stop and ask.

### Phase 5 — records and stored articles

- `docs/developer/screen-kit.md` and the developer reference pages: the new
  names.
- PRODUCT.md: the Knowledge, Helpful content and News rows say Reading room,
  and a change-log line records this plan.
- The drawing kit's sidebar parts use the new names and order;
  `npm run drawing-kit` rebuilds it.
- Admin → Content: search Knowledge and Helpful content for "Discovery" and
  "Insights", and reword any article that names them, in English. Anthony is
  asked before any stored article is changed.

### Phase 6 — a guard and the checks

- A drift test fails "Discovery" or "Scoperta" anywhere in the dictionaries
  except the Dashboard's 発見 line, and "Insights" anywhere until phase 7 adds
  the new item. This stops the old names coming back one sentence at a time.
- `npm run check`, then GitHub's own steps (`test:coverage`,
  `coverage:check`, `test:e2e:smoke`), the smoke tests in a copy so the
  running app on :3000 keeps going.
- The menu checked in Anthony's Chrome on localhost:3000 against the approved
  drawing, with one Visibility screen, one Search Console screen naming it,
  and Reading room's side menu.

### Phase 7 — the new Insights item

- A `NavItem` with the lightbulb icon, straight under Ask Hakken, its words in
  `sidebar.insights` ("Insights" in both languages), linked to the analyst
  section's first page. The guard in phase 6 then allows "Insights" only as
  that item and its pages.

## Progress

Phases 1–6: 100% built on dev 2026-10-11. Overall, with phase 7: about 85%.

What the build found, beyond the plan:

- **Nothing stored needed changing.** The Keyword research agent's stored copy,
  the Knowledge article and the three Helpful content articles on the local
  deployment name neither section, so no data update ran.
- **The menu's order had no test.** The sidebar's snapshot lists its links
  A to Z, so the order could drift unseen; `SidebarNavigation.test.tsx` now
  holds it ("keeps the approved order").
- **Left as they are, on purpose**: "Discovery" where it means finding
  competitors or a tool server's tools, the wiki tests' "Discovery is paid."
  (an agency's discovery phase), the dated canvas "Discovery — local, reviews,
  AI apps and mentions", and "Insights" as a client website's section name in
  the page classification tests.
- **Another session's unfinished files** (Search Console volatility,
  uncommitted on 2026-10-11) were not edited where they were new
  (`SearchConsoleSees.tsx`, `convex/utils/sees/searchConsoleScreens.ts`); one
  comment in each still says "Discovery".

## Still to decide

- **When the new Insights appears**: with its first page (recommended), or
  now with a "Coming soon" note.
- **Icons**: the approved drawing keeps the globe for Visibility and the
  graduation cap for Reading room, and gives Insights a lightbulb. An eye for
  Visibility or an open book for Reading room would match the new names
  better. Phase 1 builds what was drawn unless Anthony says otherwise.
