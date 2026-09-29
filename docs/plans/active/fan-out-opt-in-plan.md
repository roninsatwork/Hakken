# Fan-out queries: checked once, then only the ticked ones

**Started 2026-09-28. Status: built on dev 2026-09-28 (Anthony: "you can
build it out"), awaiting review. Not committed.** Anthony's four answers of
2026-09-28 are below. Change a decision here, with a date, before building
anything that disagrees with it.

It changes two pieces of work that are built on dev and **not committed**:

- [Prompt fan-out queries](./prompt-fan-out-queries-plan.md) — a prompt's
  Fan-out queries screen. Today every fan-out query is checked on Google every
  collection.
- [Limits on three levels](./platform-limits-plan.md) — another agent's:
  platform → company → website, one Limits screen for all three, every
  limit's name and sentences in one list (`limitTopics.ts`,
  `admin.limits.fields.*`).

## What was asked

Anthony, 2026-09-28:

- "is there value in keeping all of the returned results and then the user can
  choose which ones are important to them to search again or not"
- "i wonder if phrases need to be opt in we can then have a limit on how many
  you are watching at any one time, and that could be 100 or something"
- "and i like the opt in" — of the drawing "1 · You choose" (canvas,
  2026-09-28), beside "2 · Automatic" and "3 · The mix".
- "lets make a repo plan for this, another agent is working on an upgraded
  limits section at the moment so check their work and recent history"

## Decided — Anthony's answers, 2026-09-28

| Asked | Answer |
|---|---|
| 1. Is everything opt-in: every fan-out query listed unticked, nothing checked on Google until it is ticked? | "yes anything beyond the first check" — each new fan-out query is checked on Google **once** by itself; after that, only if ticked. |
| 2. Does the limit count only the fan-out queries ticked, or everything checked on Google for the website, keywords typed in on Tracked keywords included? | "yes only for fan outs and we could set this limit to 200" — **only ticked fan-out queries**; **200** to start. |
| 3. Per website, per prompt or per company? | "per owned website" — each of a company's own websites has its own 200. A competitor has no prompts, so none. |
| 4. The 87 fan-out queries switched on by themselves on 2026-09-28: untick them all? | "yes please". |

## How it will work — with Ronins

1. The AIs answer Ronins' prompt "who are the best web designers in Surrey,
   England", and bring the searches they ran first: 7 fan-out queries so far.
   Every one is listed, unticked.
2. **The first check.** At the next collection, each fan-out query never
   checked on Google for ronins.co.uk is checked once: $0.003 each, about $0.02
   for Ronins' 7, once. Where ronins.co.uk came shows on AI searches.
3. **Then only the ticked ones.** A ticked one is checked every collection: it
   is on the website's Tracked keywords. Unticking takes it off. Nothing already
   collected is deleted.
4. **The limit.** ronins.co.uk can have at most 200 ticked, across all its
   prompts; one query under two prompts counts once. At 200 the unticked boxes
   are greyed, with the tooltip "200 of 200 checked every run for
   ronins.co.uk. Untick one, or raise the limit in Limits."
5. **Delete** (the trash can) as built: off the list and never checked again,
   not even its first check if it has not had it, and never back however often
   an AI searches it. Undo straight after.
6. **Your own** query, added on the screen, arrives ticked (you added it to
   check it) unless the website is full; then it arrives unticked and the screen
   says why.
7. **Generate** brings its new queries unticked; each has its first check at
   the next collection.
8. **Tracked keywords.** Pausing or removing a fan-out query there unticks it
   on its prompt, where it stays listed. (Today removing it there deletes it
   from the prompt's list.)
9. **A lowered limit** unticks nothing by itself. The screen says "250 ticked;
   the limit is 200. Untick 50, or raise the limit." Until then the 200 ticked
   first are checked.

## Screens

**Fan-out queries** (a prompt's screen), as drawn on the board "1 · You
choose":

- The line at the top: "Every search the AIs ran before answering it. Each is
  checked on Google once; tick the ones to check every run."
- Columns: **Check on Google** (a tick box, the kit's `Checkbox`, with "Every
  run" or "Once only" beside it); **Fan-out query**; **The AIs searched it**
  ("once", "8 times", "–" for your own); then the pencil and trash icons with
  their tooltips.
- The footer: "Showing 1–7 of 7 · 3 of 200 checked every run · about $0.009 a
  run".
- One change from the drawing: beside the tick it says "Every run" or "Once
  only", not "Checked" or "Not checked", since every one is now checked once.
- No Google positions here: it stays the data-entry list (Anthony, 2026-09-28:
  "its a admin data entry page not a results page").

**AI searches** (What came back, read only): the "On Google" column becomes
where the website came, from its newest check: "4th", "Not in the top 100",
"Not checked yet". A second column says "Every run" or "Once".

**Your prompts**: the Fan-out queries column reads "7 · 3 every run".

**Limits** (the other agent's screen), in the AI prompts card: a new row,
below. The sentence under "Tracked keywords per website" changes, since
fan-out queries no longer join by themselves: "Keywords checked on Google
every run to see where the website ranks: the fan-out queries ticked on its
prompts, plus any typed in on Tracked keywords. When it's full, nothing more
can be added."

## The new limit

| On screen | Key | Choices | Starts at |
|---|---|---|---|
| Fan-out queries checked every run | `fanOutTrackedPerSite` | 50, 100, 200, 500, 1,000 fan-out queries | 200 fan-out queries |

- Sentences: "How many of a website's fan-out queries can be ticked, across
  all its prompts, to be checked on Google every run. Each new one is still
  checked once without a tick. When it's full, no more can be ticked."
- Cost line: "About $0.003 a query, every run: $0.60 a run at 200."
- Platform → company → website, like every other; an owned website only.
- It sits inside two fixed ceilings: Tracked keywords per website (at most
  1,000: ticked fan-out queries plus typed-in keywords) and 1,000 Google checks
  per website per run (`SEO_KEYWORD_CHECKS_PER_WEBSITE`).

## What is on dev today, and what happens to it

- **The 87** (Ronins 7, Korda 80) were put on Tracked keywords on 2026-09-28
  by the migration `2026-09-28-track-fan-out-queries`. None has been checked
  yet.
- **Until this is built, the automatic code stays on.** Ronins' next
  collection, 29/09 at 01:00, checks its 7 (about $0.02) and adds any new
  fan-out queries it brings; Korda's, 01/10 at 02:10, checks its 80 (about
  $0.24). Those checks count as the first check, so nothing is bought twice.
  The only extra before the build is the repeats: about $0.02 a day for
  Ronins.
- **The build's migration** takes off every fan-out query no person put on
  Tracked keywords: the 87 and any the automatic code adds before then (their
  audit entry names no one). Anything a person added stays.
- **Then** each one not yet checked has its first check at its company's next
  collection: at most about $0.26 (Ronins $0.02, Korda $0.24), once.

## Costs

| | Cost |
|---|---|
| First check of a new fan-out query | $0.003, once |
| Each ticked fan-out query | $0.003 every run |
| A website at 200 ticked | $0.60 a run, about $18 a month collecting daily |
| Ronins after its 7 first checks, nothing ticked | $0 a run |

## How it is built

### Backend

- **The tick has one truth: Tracked keywords.** A fan-out query is ticked when
  it is on the website's Tracked keywords and running
  (`websiteKeywords.isActive`). Ticking adds it (`addedFrom: "AI_SEARCH"`, now
  also for the admin's own) or resumes it; unticking removes it. The two
  screens can never disagree, so `keepRemovedSearchOff` and the "Paused in
  Tracked keywords" pill go.
- **The count** is the website's running tracked keywords added from fan-out
  lists (`AI_SEARCH`); typed-in ones (`HAND`) don't count. Ticking, adding
  your own ticked, and resuming one on Tracked keywords are refused at the
  limit, in the limit's own words.
- `promptFanOut.ts`: a mutation to tick and untick; add, edit, delete and undo
  as above; `getPromptFanOut` returns each row's tick, how often the AIs
  searched it, and "n of limit".
- **No automatic tracking:** `trackListedQueries` leaves the rebuild
  (`fanOutAngles.ts`); `trackEveryListedQuery` is retired.
- **The first check:**
  - Recorded per website in a new table (e.g. `fanOutFirstChecks`: website,
    query, place, purchase, state), so it is bought once. A failed purchase is
    asked again at the next collection; a finished one never. A query with a
    check already on file for the website (Ronins' 7 after 29/09) counts as
    checked.
  - Planned in `searchSteps` (`seoCollection.ts`) after the ticked and
    typed-in keywords, within the website's 1,000 Google checks a run and the
    company's purchases per run; what doesn't fit waits for the next
    collection.
  - **Filed for the website even when it isn't on the page.** Today a check
    writes "checked, not found" only for websites that track the query
    (`writeKeywordCheck`, `seoKeywordChecks.ts`); a website whose first check
    it is gets that row too. Otherwise "Not in the top 100" would never be
    recorded, and the check would be bought again every run.
  - **Read privately.** A company reads Google results only for searches on
    its own lists (`holdLists.ts`; `wordingPosition` in `fanOutPositions.ts`
    looks a check up only for a tracked search). The first-check record joins
    those lists: `holdLists.ts` gains its read, `wordingPosition` uses it, and
    `websiteTenancyGuard.test.ts` covers it. Topics pick the position up the
    same way.
- **The limit:** `fanOutTrackedPerSite` in `FAN_OUT_LIMITS` and its validator
  (`fanOutLimits.ts`), and a field on both stored tables: `fanOutLimits`
  (`fanOutSchema.ts`) and the other agent's `platformLimits`
  (`siteSchema.ts`). Their list (`platformLimits.ts`) is built from
  `FAN_OUT_LIMITS`, so the limit appears on the platform's, each company's and
  each website's Limits, and not on a competitor's.
- **The planner** checks a website's ticked fan-out queries up to its limit,
  oldest ticked first.
- **Migration:** take off the automatic ones (above).

### Screens

- `PromptFanOut.tsx`: the Check on Google column, The AIs searched it, the
  counter and cost in the footer, greyed boxes at the limit with the tooltip,
  the new line at the top.
- `CompanyFanOut.tsx`: where the website came, and "Every run" / "Once".
- `CompanyQuestions.tsx`: "7 · 3 every run".
- The other agent's `limitTopics.ts` (the AI prompts card, with the unit
  "fan-out queries") and `admin.limits.fields.fanOutTrackedPerSite`; the new
  sentence for `admin.limits.fields.trackedPerSite`. English and Italian
  together.

### Tests

- Ticking and unticking put a query on and off Tracked keywords; the 201st
  tick on a website is refused; one query under two prompts counts once; a
  typed-in keyword doesn't count.
- Add, edit, delete and undo keep the tick as described; Generate's new ones
  arrive unticked.
- The first check is planned once for a new query, again only after a failed
  purchase, never for a deleted one; it waits when the run is full.
- A first check files "Not in the top 100" for its website, and only that
  company reads it.
- Pausing or removing on Tracked keywords unticks without deleting.
- The migration takes off only what no person added.
- Screens: the tick column, the counter, the greyed boxes at the limit, AI
  searches' new column.

## Order of work, and the limits work

1. Both pieces of work this builds on are uncommitted in the same working tree
   and share files (`fanOutLimits.ts`, `fanOutSchema.ts`, `siteSchema.ts`,
   `platformLimits.ts`, `limitTopics.ts`, `messages/en.json`,
   `messages/it.json`). The limits plan waits for the fan-out work to be
   committed (its "Order of work", step 0). So the fan-out work is committed
   first, then the limits work, then this is built on top. Commits wait for
   Anthony's word.
2. Backend: the tick, the limit, the first check, the migration.
3. Screens and words.
4. Local checks (`npm run verify:env`, `npm run lint:all`, `npm run check`,
   `npm run build`, `git diff --check`), then a look at Ronins' screens.

No step buys anything or runs a collection.

The limits plan's table says Prompts per website starts at 1,000; the code
says 10 (Anthony, 2026-09-28: "this should be a limit of 10 by default"), and
the Limits screens read the code.

## Settled

- **"Anything beyond the first check"** means what this plan says: every new
  fan-out query is checked on Google once by itself, where the website came
  shows on AI searches, and after that only the ticked ones are checked.
  Anthony, 2026-09-28, said to build it as written, and of it: "the system
  will keep filling up the automated fan out queries and the user can choose
  which ones to monitor" — yes.

## Built — 2026-09-28

On dev, not committed (commits wait for Anthony's word).

- **Backend**: the tick is Tracked keywords' own "running" (`promptFanOut.ts`:
  `setPromptFanOutQueryTicked`; add, edit, delete and undo keep it as above);
  the limit `fanOutTrackedPerSite` (`fanOutLimits.ts`, both stored tables),
  enforced on every way a fan-out query can start running
  (`requireFanOutRoom` in `websiteCanonical.ts`) and by the planner
  (`searchSteps`); the first check (`fanOutFirstChecks`, planned in
  `searchSteps`, filed by `writeKeywordCheck` even when the website is not on
  the page, or at once when it reused a check already filed —
  `fileFirstCheckLate`); read privately through `holdFirstCheck`
  (`holdLists.ts`), which `ownCheck` in `fanOutPositions.ts` uses for AI
  searches and topics. The rebuild records first checks instead of tracking
  (`queueFirstChecks`).
- **Screens**: Fan-out queries (Check on Google with "Every run" / "Once
  only", The AIs searched it, the counter, greyed boxes with the reason, a
  notice when over the limit or when an added one could not be ticked); AI
  searches ("On Google": "4th · 27 Sep", "Not in the top 100", "Not checked
  yet"; "Checked": "Every run" / "Once"); Your prompts ("7 · 3 every run");
  Limits (the new row in AI prompts). The kit's `Checkbox` gained a tooltip
  for a box that cannot be ticked. English and Italian.
- **Migration** `2026-09-28-untick-fan-out-queries`, run on dev: 17 websites
  read, 87 fan-out queries taken off Tracked keywords (Ronins 7, Korda 80),
  each with a first check waiting. Ronins' 7 went again later the same day
  with the Surrey prompt they came from, which Anthony removed (see below);
  Korda's 80 are bought at its next collection (01/10, 02:10, about $0.24).
  Ronins' 4 typed-in keywords are untouched. `2026-09-28-track-fan-out-queries`
  left the registry.
- **Tests**: `promptFanOut.test.ts` (ticking and the limit, typed-in keywords
  not counted, Tracked keywords' pause, resume and remove, delete and undo,
  edit, the first check through a real planning run — planned once, filed as
  not found, bought again only after a failure — the migration, Generate);
  `companyAiLists.test.ts` (positions from the newest check, the ticked
  count); `websiteTenancyGuard.test.ts` (the first check's record is read only
  through its hold); the screens' tests.

Decided while building, within the plan:

- A keyword typed in on Tracked keywords that is also a fan-out query shows
  ticked; unticking it on the fan-out page **pauses** it there rather than
  removing the company's own typing.
- One query under two prompts of a website is one tick: deleting it from one
  prompt leaves it ticked while another prompt still lists it.
- The footer says both numbers, since a website's limit covers all its
  prompts: "3 ticked here, about $0.009 a run · 5 of 200 ticked for
  ronins.co.uk".
- The company's own queries read "Your own" under The AIs searched it, where
  the plan had "–".
- A prompt removed takes its queries' first checks not yet bought with it,
  unless another prompt of the website lists them (`forgetQuestion`), and the
  planner never buys one no longer on any list (`fanOutListed.ts`). Found when
  Ronins' Surrey prompt was removed with its 7 still waiting; they were
  cleared on dev before its next collection.

## Built — 2026-09-29: tracking from Sites

Anthony, 2026-09-29: "This is not an admin thing this is user front end
thing", "The users need to be able to select which searches that they want
to track", "it should be on existing screens … and it should say track". The
client's Sites **Fan-out queries** page now has a **Track** tick on each row
of the company's own website, in place of the Tracked column, and "{count} of
{limit} tracked" above the table. The same rule as admin's tick
(`siteFanOutTracking.ts`): ticked, the search is on Tracked keywords and
checked every run, up to the website's limit (200 unless changed in Limits);
unticked, it comes off and waits for its one first check. A row is a topic:
ticking tracks the wording shown first, unticking stops every tracked
wording. Full, an untracked row's tick is greyed and says why. Anyone in the
company who can open the site may tick; a competitor's page keeps the plain
Tracked column. Admin's screens are unchanged.

The "What they want" labels were renamed everywhere the same day, at his word:
Commercial, Informational, Brand, Irrelevant, Unknown, Not judged yet.

**Later the same day: a narrower table.** Anthony: "its getting very wide … we
can do this on the page it clicks to"; of three drawn alternatives he chose C
"with the times seen column". The Sites Fan-out queries table is four columns:
Track; the search, with what the searcher wants and the assistants that
searched it on a small second line; Times seen; Your position. The question
it answered, its other wordings, the day it was checked and the site's page
for it moved to the page each row opens, in a new "From the AI's answers" box
(`siteAngles.keywordAngle`). The download keeps every column. The table's
"Your page" filter (and with it the Missing topics view) and the note on what
"None" was judged against went with the column, as drawn.

**Then: the AI's answers on the search's own page.** Anthony: "add the full
response on this screen too", placed "where they are … accordions, one on each
row", with whether Ronins is mentioned made plain. Under "From the AI's
answers", one closed row per assistant that ran the search — the answer it was
writing when it did (the search's own record, `promptFanOutQueries`) — saying
on the row whether it named the site and which competitors it named; opened,
the answer word for word, the site's names and its competitors' picked out in
two colours (`HakkenMarkdown`'s `highlightOthers`). The box above gains
"{site} mentioned: No, in neither answer" or "Yes, in n of m".

**And: searches a month for fan-out queries.** Anthony: "won't Data for
SEO give us this", then "build it". A fan-out query no website's keyword list
holds showed "Searches a month: Not known". Now the Planner buys Google Ads'
figures for them from DataForSEO (`keyword_search_volume`, queued) —
volume, cost per click, competition and the last twelve months — for every
wording of every topic on the website's list, less those its keyword list
measures and those with figures younger than 30 days; up to 1,000 searches
a request (DataForSEO's ceiling, charged per request); from the website's
place; never for a competitor. Kept once per search and place for everyone
(`searchVolumes`). The search's page shows them at the top and in "About
this search", with "Figures from Google Ads, {day}"; a search Google reports
too few for says so. First bought on the next nightly run; the price shows
on Runs and cost.

## Not in this plan

- Dropping queries the AIs stopped searching: nothing is checked unless
  ticked, so an old one costs nothing.
- A limit on first checks per run: they are new queries only (Ronins 7 and
  Korda 80 so far), and any beyond a website's 1,000 Google checks a run wait
  for the next. Name one and it joins Limits.
- Spending budgets: each agent's own cost limit per run is the control.

**2026-09-29 — a search's page gets a designed header.** Anthony, on the
header: "it looks grown over time and not designed". Three alternatives were
drawn on the canvas "A search's page header"; he chose B. The way back is a
quiet path above the title ("Fan-out queries /"), the labels share the
title's row on the right ("Checked once on Google", then what the searcher
wants — the keyword list's judgement, or the AI answers' for a search only
they ran), and one sentence about this search sits under it where the stock
sentence was. The box that repeated "checked once" is gone; its sentence is
now that line. No icon. Built as `DetailHeader`'s `path` layout, on this page
only — "I only asked about one page" — so every other record page keeps its
header.
