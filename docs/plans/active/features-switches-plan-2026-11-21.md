# Features, switched for everyone and for each company

**Planned 2026-11-21. Status: drawn and approved the same day ("im happy with the screens for now - im happy for you to build it when your ready"); FS1–FS10 built on dev the same day, checked in his Chrome without saving a switch. Phase 2 built the same day on his "Yes, build it". Not committed.**

## Where this came from

Anthony, 2026-11-21: "i need these options configurable in the admin to
globally turn them on and off as well as by company". Dashboard, Ask Hakken,
Reading room and Usage stay on. The other seven menu sections are switched for
everyone and for each company. Asked whether a switched-off section should
still collect its data, he answered "Stop collecting too".

Drawn on [the Features canvas](https://claude.ai/artifact/GMZXABZU8WyWimh9JCfyT4)
in four boards: today's company Features tab, System Settings → Features, the
company Features tab with the menu, and the menu a company then sees. A copy
of the boards is in [docs/plans/assets/features-switches/](../assets/features-switches/).
Change a decision here, with a date, before building anything that disagrees
with it.

## What it is

- **FS1. Seven switches.** Insights, Visibility, Search Console, Bing
  Webmaster, Google Analytics, Microsoft Clarity and Hakken tasks
  (`MENU_FEATURES`, `convex/utils/coreModules.ts`). Dashboard, Ask Hakken,
  Reading room and Usage have no switch and show "Always on".
- **FS2. Saved as what is off.** In `featureSwitches`
  (`featureSwitchesSchema.ts`): one row for the platform, off for everyone,
  and one for each company with something off. No row means on, so every
  company that predates this, and every company a test makes, keeps every
  section. No data change and no migration. (Built first on the company and
  the platform's settings, and moved the same day for phase 2, P5.) Tasks, Calls, Reception and Wiki stay on their old "on"
  list (`enabledModules`), switched on the company page only.
- **FS3. One answer.** A company has a feature when it is not off for
  everyone and not off for the company. `effectiveModulesFor` adds the on ones
  to the module list, so the menu, the page gates and `moduleQuery` read them
  as they read Tasks. A company's own tick is kept while a feature is off for
  everyone, so ticking it again gives each company back what it had.
- **FS4. System Settings → Features.** A tab after Classification
  (`/admin/settings/features`): the levels strip, then the 11 menu items in
  menu order. Each shows how many companies have it ticked, then a tick box
  or Always on, then Save Features.
- **FS5. The company's Features tab.** The same 11 rows, then Tasks, Calls,
  Reception and Wiki as today. A row shows a tick box, Always on, or "Off for
  everyone" when System Settings has it off. One Save Features saves both
  lists.
- **FS6. The strip is shared.** `LevelsStrip` moves from Limits to
  `src/app/(dashboard)/admin/_components/LevelsStrip.tsx` and takes two or
  three steps. Limits draws it through `LimitLevelsStrip`. `StatusLabel`
  gains a `locked` icon for Always on.
- **FS7. The menu and the pages.** A switched-off item leaves the menu, and
  its pages send people to the Dashboard (`CapabilityGate`, a layout per
  section), as Tasks and Calls do. Visibility covers Websites and Keyword
  research.
- **FS8. Collection stops.** When a feature is off for a company, nothing new
  is fetched for it:
  - Search Console: `collectionOf` (`searchConsoleSync.ts`), which the daily
    run and a first collection both go through.
  - Google Analytics, Bing Webmaster and Microsoft Clarity: each collector's
    `beginSiteRun`, which the daily run and a first collection go through.
  - Visibility: `openSeoCycle` (`seoTools.ts`) opens nothing, and
    `stillWanted` drops pulls already queued.
  - Insights: `teamSetup` (`insightsTeam.ts`) leaves the company out of the
    team's run and its daily quick check.
  - Hakken tasks: the watcher, the reports and the caretaker pass over the
    company's tasks.
  - The figures so far are kept. A run already under way finishes.
- **FS9. Ask Hakken leaves them out.** A company's assistant isn't offered
  the tools of a switched-off section (`agentObjectiveLoopService.ts`, beside
  `isToolVisibleToCompany`).
- **FS10. Switched on again.** Each collector picks the company up on its
  next run. Search Console fills the missed days from Google, which keeps 16
  months. Google Analytics and Bing fill what they still keep. Clarity keeps
  about 3 days, so a longer gap in Clarity stays empty.

## Limits, said plainly

- **Super admins still read a switched-off section.** A platform administrator
  working in a company passes every switch on the server, as with Tasks and
  Calls (`moduleQuery`). The menu and the pages still close for them.
- **Insights still shows what other sections saved.** Insights is refused only
  when Insights is off. With Google Analytics off and Insights on, Insights
  still reads the Google Analytics figures already kept.
- **A few calls stay open.** A call that a page staying open also shows, such
  as the Dashboard, Usage or Ask Hakken's chat, isn't refused, or that page
  would break. Ask Hakken's tools are held back by FS9 instead.
- **No pop-up when unticking.** Unticking stops collection, and a Clarity gap
  of more than 3 days can't be filled later. The page says that nothing new
  comes in. A yes/no pop-up isn't on the approved boards, so it isn't built.
- **Plans don't grant these.** A plan's `grantedModules` can't switch a menu
  feature on or off. Only the two pages can.

## Phase 2, built 2026-11-21

Anthony asked for it the same day ("Yes, build it").

- **P1. Refused at the door.** Every call a section's pages make to the server
  is declared with `moduleQuery`, `moduleMutation` or `moduleAction` and names
  its section (`module: MENU_FEATURES.searchConsole`). A company with the
  section off is refused before anything is read, written or asked of Google:
  "This section is switched off for your workspace". That's 278 calls,
  reads, writes and live asks alike. It is the check Tasks and Calls already
  had, so super admins pass as they do there.
- **P2. Shared calls stay open while either section is on.** 17 calls show on
  two or three sections' pages and name them all. Search Console's connection
  line shows on Visibility's keyword research. Google Analytics' charts show
  on Search Console's pages.
- **P3. The pages decide, not the folders.** A call belongs to every section
  whose pages import it, however many files away. Sorting by folder got 21
  calls wrong. A call that a page staying open also shows is left open.
- **P4. The eye.** It's shared by every section, so a press and a read check
  the section of the screen they belong to (`requireSectionOn`,
  `SEES_SECTION_FEATURE`).
- **P5. Cheap.** For a menu feature the check reads the two small switch rows
  by their index, and nothing about the company, its plan or its billing. A
  company with every section on has no row, so the check reads nothing. Read
  from the company and the platform's settings, it took the Local map screen
  past its read budget (`localReadKiB`, which may never grow), so the
  switches moved into their own rows.
- **P6. Held by a test.** `src/section-gate-drift.test.ts` works out which
  pages show each call and fails a call that names the wrong sections, a
  section's call that names none, and a call an open page shows that names
  one. A call in a section's own files that no page shows yet is that
  section's. Tests in `convex/featureSwitches.test.ts` show the refusals.

## Words

Copied from the redone screens before writing:
- "Nothing new comes in" comes from Search Console's Connection.
- "Every company starts with…" and "Uses…, unless you…" come from Limits'
  strip.
- The feature names are the menu's own (`sidebar.*`).

## Estimate

About 3 developer days, or about a day for an agent, plus the full gate.
Phase 2 was about 2 to 3 developer days, or a few hours for an agent.

## Change log

- 2026-11-21: planned, drawn, approved, build started.
- 2026-11-21: FS1–FS10 built. Tests in `convex/featureSwitches.test.ts`, the two page tests, and look tests saved in
  `docs/plans/assets/features-switches/look/`. The old four features' descriptions were rewritten without dashes or
  colons, in English and Italian. Anthony found an em dash on board 3, and the drawing check skips table rows.
- 2026-11-21: phase 2 built on his "Yes, build it". 278 calls refused at the door when their section is off, 17 of
  them shared by two or three sections. A test works out which pages show each call. The switches moved
  into their own rows (`featureSwitches`) so the check reads almost nothing.
