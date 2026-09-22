# The Websites Screens, Rebuilt

Status: **Approved 2026-09-22. All four stages built.** Build order was
1 → 4 → 2 → 3; the reason is below. What remains is the performance pass over
every new screen that Anthony asked for, and seeing stage 3's moves against a
real collection. Roughly 90% of the plan.
Owner: Anthony

## Built so far — 2026-09-22

**Stage 1, complete.** The website schedule sheet is rebuilt on
`SeoScheduleFields`, so both levels of the product now offer the same four
cadences and the same sentence; the summary names the website instead of calling
it an agent. `assertSeoInterval` refuses hourly and targeted-time intervals in
`setCompanyWebsiteSchedule`, which previously wrote whatever it was handed.
Queued-or-live is gone from the company screen — live is four times cheaper, and
`seoPreferLive` turned out to be **written by the screen and read by nothing**,
which is the same fault `SeoScheduleFields` was built to correct. The two
"Data Collection" screens are now *Collection pipeline* and *Collection
schedule*. The competitors table has the heading its string was already written
for, three dead keys are gone and the page description names all five things the
page holds.

Two findings in the audit above were **wrong** and the code was right. The
company websites list correctly has no `divider` — AGENTS.md gives a tabbed
section's inner page a `PageHeader` without one, because `DetailLayout` already
drew the rule. And its quiet primary action is correct for the same reason:
orange means "this page's action", and a sub-page under a header that has one
does not get a second. A divider was added and then reverted.

One bug was found while building that is not in the list above.
`useScheduleSummary` had the same fortnightly fall-through as the builder — no
branch, so it returned the daily string. That is a *shared* helper, so every
screen reading it announced an every-other-week schedule as a daily one.

**Stage 4, backend.** Three host-owned tables: `websiteQuestions`,
`websiteKeywords` and `websiteRivals`, none of them carrying a company, plus
`sector` and `marketLabel` on `websites`. `websiteCanonical.ts` holds the
functions; `websiteCanonicalMigration.ts` moves the per-client lists onto their
host, additively — nothing is deleted and no source row is touched, so a bad
result is discarded by dropping the new rows.

The tenancy rule is rewritten rather than removed, as the plan said it would be.
The old direction rule stands; beside it now sits **nothing stored on a host may
name who is watching it**, read off the schema in `websiteTenancyGuard.test.ts`
and proved to bite by adding a `companyId` and watching it fail.

**Subscription is total and implicit**, which is a decision this plan did not
originally make: attach to a host and you read its whole list. A per-item
subscription needs three join tables and an allowance model to go with them, and
the canonical list is Hakken's judgment of what is worth asking about a business,
which does not differ by who is asking. If a client ever needs less, that is a
feature on top rather than a shape underneath.

**Stage 4, the host record.** `/admin/websites/[websiteId]` was one scroll
holding brand names and a watcher list; with the host's own lists beside them it
would be the same fault the client screen has. It is a `DetailLayout` with five
tabs — **Profile · Searches · Questions · Competition · Watched by** — and
delete sits on the frame rather than a tab, because it acts on the record and is
the one thing there that reaches every company watching the host.

Searches is the screen that never existed: position tracking has written
`seoKeywordPositions` since it shipped and nothing could say which searches to
check. Questions makes the engine choice real for the first time —
`addTrackedPrompt` took an `engines` argument no screen ever passed, so every
question went to all four forever. Competition is the graph, with a rival's own
record one click away, because a rival is a website like any other.

The Watched by tab carries the note that says why it is separate: everything
else on the record is shared with every client attached, and who is watching is
not.

The old single-page test was split to match — watcher assertions to the tab,
the delete flow to the layout — rather than deleted.

**The pipeline reads the host's lists.** `planCitationPulls` reads
`websiteQuestions` and the cycle expands over `websiteRivals`. Two tests carry
the behaviour that is genuinely new: a question added once to a host is asked
for *every* company holding it, where before each client needed their own copy;
and two companies on one host buy one answer between them.

One consequence is named in the code rather than left to be discovered. A rival
another client records on a shared host is now pulled for this company too, and
paid for the way any shared pull is. That is the model working rather than
leaking — the rival is a fact about the host's market, one pull serves every
watcher, and the cost rollups already attribute a shared pull across them. For
everything migrated from `trackedCompetitors` the expansion is identical,
because the edges were seeded from exactly those rows.

**Adding a known host now says what comes with it.** The add form's
already-known line was a footnote about not fetching twice; it now reads
*"This client starts with what is already here: 1 search, 1 question, no rivals
and no history yet — already paid for."* That sentence is the whole argument for
putting the lists on the host, and it was the one place the argument could be
made at the moment somebody acts on it.

**The source tables are gone.** Anthony, 2026-09-22: *"Why not now the platform
is young and no front end... I don't see any reason why to wait."* There was
none — the caution the additive plan carried is the caution you owe a system
with customers, and there is no customer and no feature set yet.

So the cutover was done in one pass. All four migrations ran on dev; the two
clearing ones emptied `trackedPrompts` and `trackedCompetitors`, and the tables
then left `schema.ts`. **The four migrations went with them**, because a
migration cannot compile against a schema without the tables it read — the same
one-way door the 2026-07-26 retirements record, and it is written down in the
registry the same way.

### Owned and tracked — a wrong turn, corrected the same day

The cutover moved competitors onto the host as a graph *and made the collection
cycle read that graph*. That was wrong, and Anthony caught it: *"we have owned
websites and tracked websites — in a company you set which you own and which you
track... If someone else adds ronins as competitor I don't care about that,
that's up to them in their own company."*

It conflated two different things. **Who competes with whom** is a fact about a
market — shareable, free to know, and right on the host. **What I have chosen to
watch** is my own list, private, and the only thing that may spend my money. The
first had swallowed the second, so one company's assertion decided another
company's bill.

Worse, the thing he described had stopped existing: `companyWebsites` had no
owned-or-tracked flag, because "tracked" *was* the deleted table. Tracking was
being inferred from edges rather than stored.

The correction:

- `companyWebsites` gains `relationship: OWNED | TRACKED` and `againstWebsiteId`
  — which of the company's own sites a tracked one is watched against, which is
  what makes the two collect on the same day.
- **A cycle expands over the company's own attachments and nothing else.** A
  tracked site is reached as a target of the site it is paired with, never as a
  cycle of its own, so it is planned once.
- `loadWatchers` reads one table again instead of inferring half its answer from
  the graph.
- `websiteRivals` stays as market knowledge — discovery still writes
  `DISCOVERED` edges, the host record still shows them, and adding a rival still
  records one. **Nothing reads it to decide a purchase.**
- A company holds a website once. Tracking one against a second of their sites
  is refused rather than filed twice: the pairing sets which day they collect
  on, and a second pairing would be a second answer to that.
- Deleting a host clears `againstWebsiteId` on anything paired with it rather
  than deleting the attachment — the pairing is meaningless, but the attachment
  is still something that company chose and pays for.

Two migrations reconstruct it: `attach-tracked-from-rivals` applies the same
rule the broken expansion did — an edge A → B means every company owning A was
watching B — so what is collected afterwards is exactly what was collected
before; and `mark-existing-holds-owned` writes down what absence already meant.

What moved with them:

- `seoTools.requireCompanyWebsite` resolves a rival through **company → its
  holds → the competition graph**, which is the direction that file exists to
  keep. The tenancy guard's assertion about it was updated to match.
- `websitePurge` clears the host's three lists when a host goes, in both
  directions of the graph. Removing a *hold* no longer touches the graph at all:
  a rivalry outlives whoever was watching, ready for the next company that
  attaches.
- `seoFanOutReports` reads the host's questions, still scoped through the hold.
- `seoPrompts.ts` is deleted. What survived it — four length and count limits —
  is `convex/utils/promptLimits.ts`, in `utils/` because a client screen reads
  them and importing a Convex module that defines functions ships the backend to
  the browser.
- `trackedPrompts` came off the personal-data register. Nothing on a host names
  who added it, so there is no `createdBy` left to dissociate.

**The client site page went from 608 lines to 129.** It kept the two settings
that genuinely differ between clients — how often, and from where — and points
at the website record for the shared lists and at its own routes for results.
That is the density complaint answered: *"too dense with information and as a
user i have no idea what to do."*

One thing left behind deliberately: `plans.seoPromptsPerWebsite` now bounds
nothing, because questions are the host's. Removing a plan field touches the
plans screen, `planService` and a schema field, so it is its own change and is
written down in `promptLimits.ts` rather than left to be discovered.

Two guards were extended rather than worked around. `convex/schema.ts` crossed
its 4,250-line band and the ratchet was raised to 4,350 deliberately. The
provider-classification guard caught the questions screen naming the engines;
it is allowlisted with the reason, alongside the citations screen — that screen
is the only place a question's engines are chosen, and choosing fewer is the
cheapest lever in the feature.

`websites.ts` crossed the thousand-line ceiling when the profile mutation landed
on it. The guard was right and the fix is the seam rather than the allowlist:
`setWebsiteProfile` moved to `websiteCanonical.ts`, where the host's other
content already lives.

Checks after the cutover and the correction: `tsc --noEmit` clean, **4,611 tests
across 545 files pass**, `check:guards` green, and lint is **down to 15 problems
from the 18 it started at** — deleting `seoPrompts.ts` and the unused imports took three
pre-existing ones with it. The schema shrank out of its band and the ratchet came
down with it, 4,350 → 4,300, which is the direction that guard is meant to move
in.

### Verified in the browser — 2026-09-22

The owned-and-tracked screens were seen in Anthony's Chrome on the evening of
2026-09-22, once a fresh dev server was on 3000: the list's *Held as* column,
the add dialog's *They own it / They track it* choice with its pairing select,
and a paired tracked site's page reading *"Collected with ronins.co.uk"* with
its schedule and place controls gone.

Driven through Anthony's own Chrome against his dev deployment, not an e2e
fixture. **This caught a failure every other check missed:** every tab of the
new host record errored with *"Could not find public function for
`websiteCanonical:listWebsiteKeywords`"*, because `convex codegen` writes
bindings without deploying. `convex dev --once` fixed it. Tests, typecheck and
guards were all green while the app was broken — the exact failure mode worth
remembering.

What was exercised, not just looked at: a search typed as
`"  Branding   Agency   Leeds "` stored as `branding agency leeds` with its
intent honestly reading *Not judged*; a question saved as **ChatGPT, Claude**
after two engine chips were switched off, proving the engine choice is real for
the first time; the counter moving to *2 paid answers bought every cycle*;
fortnightly selected in the rebuilt schedule sheet reading *"ronins.co.uk and
its competitors are pulled Every other Monday at 09:00 Local"* with its anchor
date, where it used to say "Daily" while saving fortnightly.

Two things the browser caught that nothing else would have: a focused-but-
deselected engine chip renders almost identically to a selected one, and the
inherits sentence read *"1 searches, 1 questions, 0 rivals and 0 weeks"* before
it was given ICU plurals. The first is still open.

Two rows were created on the dev deployment while testing — the search and the
question above, both on `ronins.co.uk`. They are plausible data and were left in
place so the screens have something to show.

Read [One Website, Many Watchers](./websites-and-competitors-plan.md) and
[Brands, Places and AI Citations](./brands-places-and-ai-citations-plan.md)
first. The pipeline both describe now works. This plan is about the screens
over it, which have not kept up with what it collects.

Screens drawn: <https://claude.ai/artifact/H8xuxfS1HCW5UyjEKtpzNv> — fifteen
artboards, numbered in build order. The numbering below matches them.

### The gaps, closed — 2026-09-22, evening

The owned-and-tracked correction left six gaps and a handful of loose ends.
All of them are closed; two bugs worse than any of the gaps turned up on the
way.

- **Which is which is on screen.** The company list has a *Held as* column —
  owned with its rival count, or tracked and what against — and its collection
  column says whose day a row runs on. The add dialog asks how the company
  holds the site, and for a tracked one, which of its own sites it is watched
  against, defaulting to the company's first.
- **A paired site has no settings of its own.** Its page shows the pairing and
  the next run instead of schedule and place controls nothing read, the server
  refuses both, and pairing clears whatever it overrides — a stored value
  nothing reads is a setting that lies the day it is unpaired.
- **An unpaired tracked site is collected.** The cycle skipped every tracked
  hold and reached them only as a pair's target, so one with no pair was chosen,
  listed and never pulled.
- **The searches on a host's record are checked.** One Google results page per
  search per place, keyed on neither host nor company, so two clients — or two
  hosts — tracking a phrase in one town buy it once. The parse files a position
  for **every known site on the page**, which is how a rival's ranking arrives
  without a pull of its own, and a row saying *checked, not found* for every
  host tracking it that was not there. Those two facts are different and both
  are needed: *never ranked* cannot be told from *never asked* otherwise.
- **Rankings are asked from the watcher's place.** `locationCode` was stored on
  the hold and passed to nothing but the AI engines. Site operations now carry
  it, a fresh answer is only reused if it was asked from the same place, and
  positions store where they were measured — read through an index on the place,
  and backfilled on dev (15 rows) by `2026-09-22-position-places`.
- **The agent can no longer spend on another company's say-so.**
  `requireCompanyWebsite` walked the shared competition graph, so a rival any
  company had asserted against a shared host was readable *and buyable* by the
  agent of every company holding it. Entitlement is now what a company holds,
  owned or tracked; the tenancy guard asserts the graph is not read there.

The two bugs. **A large company was never fully collected**: each expansion page
read the company's first rows and sliced after the cursor in memory, so past the
first page the cursor fell outside what was read and every site after roughly
the hundred and second was skipped. Pages now start from the cursor in the index
itself, and also stop between websites once they have written two thousand
lines, because the page size bounds websites and not what each fans out to. And
**the rival count took a company's first hundred holds and filtered them
afterwards**, so a company with many sites read as having no rivals on the rest;
both it and the cycle's rival lookup read a pairing index now.

Loose ends: the engine chips carry a tick, because a chip just switched off kept
a brand-coloured focus ring and read exactly like "on". `plans.seoPromptsPerWebsite`
is off the schema, the plans screen and the plan mutations — no migration,
because no plan row ever held it: the field never reached `main` and dev has no
plans. The two dev rows on `ronins.co.uk` are still there, deliberately, so the
stage 2 screens have something real to show.

And the house cleaned, because Anthony asked for it — *"nothing is sacred"*:
lint is at **zero** across the repo, down from eleven. Two of those were client
screens importing `convex/seoLocations.ts` and `convex/websiteBrands.ts`, which
ship to the browser from anywhere but `convex/utils/`, so both modules moved
there. And the suite's recurring *"did not complete after 10000 timer pumps"*
failures are fixed rather than retried: `convex-test` waits on a scheduled
function for a fixed number of event-loop turns, and the first run of a function
in a worker loads its module from disk, which under a full parallel suite can
take longer. `src/test/finishScheduled.ts` bounds the same wait by real time
instead, and all fifty-two callers use it.

### Stage 2, built — 2026-09-22, evening

The site route is a record with tabs: **Brief · Tracking · Results**, under a
`DetailHeader` that says what is happening — how often it is collected, from
where, what it tracks and what that costs a month. A tracked site gets an
overview of its pairing and its rankings instead, because it has no lists of
its own. The schedule and the place moved into one settings sheet opened from
the header, loaded only when opened.

- **Brief** — a card per list with its count, monthly cost and a line of what
  is true ("1 slipping · 3 on page one"), never a line of zeros. Each card
  opens its list.
- **Tracking** — searches, questions and competitors behind one switch with
  their counts and costs side by side. Every row carries a verdict and a price,
  and the thresholds behind the verdicts are printed under each table, from
  `convex/utils/trackingVerdicts.ts`, where each is one named constant.
- **Results** — AI answers, what the engines searched, rankings, behind a
  switch on the page rather than a dropdown tab, which took two clicks to reach
  anything. Fan-out rows can be tracked in one click, and a filter shows the
  buying searches nobody tracks.

**Judged on the server, from summaries kept as results land.** A verdict needs
weeks of history, and reading that per row per view grows with every search
and every week. So `websiteSearchStats` (host × search × place) and
`websiteQuestionStats` (host × question × engine × place) are rebuilt as each
result is filed, and a Tracking row is one point lookup. `aiAnswers` keeps one
row per answer, because `aiCitations` keeps one per *mention* and an answer
that named nobody left no trace — so "named 3 of 14" had no 14. All three are
recomputed from their rows rather than incremented, so re-parsing converges.

**Prices are what was charged.** The registry knows only a cost band, and a
price in code goes stale, so `seoOperationCosts` keeps a running mean of what
DataForSEO charged per operation. An operation nobody has paid for says "not
priced yet" rather than a guess — which is everything on dev today, because all
24 pulls there ran in the sandbox.

Found on the way: discovery's suggestions had no screen since the site page was
slimmed, and are on the Competitors list again; the engine chips and names
moved to one shared component, so the provider allowlist shrank by one
instead of growing; the fan-out read was capped at 4,000 rows, from a possible
100,000.

### Stage 3, built — 2026-09-22, evening

`websiteMoves` holds each site's worklist: **rival** (named twice or more in
the answers, not held), **name** (a near-miss spelling an engine used),
**slipping search**, **dead question** (never landed), **untracked search** (a
buying fan-out search nobody tracks). Derived five minutes after a cycle closes,
wherever it closes, so the last answers are parsed first; one transaction per
site. Taking a move does the thing it offered on the server — tracks the rival,
adds the spelling, pauses the question, adds the search. **Dismissed is kept
per kind and subject and never raised again**, the plan's named risk; done is
done, except a slip after it was handled, which is a new event. A move the
results stop supporting is removed on its own. The Brief shows them first; the
company list has a *Moves waiting* column. `websiteMoves.decidedBy` is on the
personal-data register as dissociate, like `discoveredCompetitors.decidedBy`.

The schema's size ratchet went 4,350 → 4,500 for the seven tables stages 2 and
3 added, raised deliberately.

### Performance pass — 2026-09-22, night

Anthony: *"are they all server side optimised, optimised for scale, optimised
for page speed and generally optimised for performance."* Every query behind
the new screens was read for where the work happens, what bounds it, whether an
index carries it and what it re-runs on. What was found and changed:

| Screen or path | Found | Now |
|---|---|---|
| Results · AI answers | Read the company's last 500 cycle lines, every AI pull they named and up to 250 mentions each — up to ~125,000 documents per view, re-run on any change | Pages from `aiAnswers` newest-first per question at the watcher's place, merging only enough to cut the page; mention detail read for the fifteen rows shown |
| Results · what the engines searched | Read every place's rows for a shared host, so another town's searches appeared | Read by question, engine and the watcher's own place through the existing index; ceiling on the whole read (was 100,000 possible) |
| Question summaries, moves | An engine that takes no location files its answers under the default place; a Leeds watcher looked under Leeds and found nothing | `answerPlace` and `fanOutPlace` in `seoAiEngines.ts`, one rule every reader uses |
| Collection · reuse ladder | Scanned a site's newest pulls through a filter on operation and arguments | `by_website_operation_submitted`, so the scan starts at the right operation |
| AI answer parsing | Read the first 2,000 websites per answer looking for brand names — past 2,000 sites, later brands were never matched | `hasBrandNames` with an index; only branded sites are read. Backfilled by `2026-09-22-branded-websites` |
| All Websites list | Every watcher of every host on the page, with its company, schedule and pair | At most 100 watchers per host ("100+"), one schedule read per company per page; the host record still reads all |
| Add dialogs | A server query on every keystroke of the address — about twenty to type one URL, each reading up to 600 rows | Asked once typing pauses (300ms) |
| Tracking · questions | Read the question list twice, once only to learn its engines | Prices for every engine are four point lookups |
| Website record · competition | Named every rival before cutting the page | Cuts the page first; names all only when searching |

What already held and was checked rather than changed: every list pages on
the server and ships one page; verdicts are computed from write-time summaries
(one point lookup per row), never from history on read; searches in tables are
debounced; dialogs and the settings sheet are lazy-loaded; the site's header
query is shared by the layout and every tab through one subscription; only the
visible Tracking list and Results view subscribe; every read touched by this
rebuild is by index and bounded, with the ceilings named beside them.

Worth knowing rather than fixing yet: the site header reads the host's search
and question lists for their counts — bounded at a thousand each, and cheap at
realistic sizes, but a host with hundreds of searches would want stored
counts. The Brief's portfolio is the heaviest read (bounded at roughly 7,500
point lookups for a host at every ceiling at once) and re-runs as a collection
files results, which is the point of it.

## What is wrong

Anthony, 2026-09-22, on the website detail screen: *"the new website page is
too dense with information and as a user i have no idea what to do as its just
so much."*

The diagnosis is one line. **It is a form with no state.** It lists what can be
set and never says what is happening, whether anything is working, or what it
costs. Twenty-six discrepancies were found reading both websites sections and
the functions behind them. They come from four causes.

**One screen is doing five jobs.** Schedule, place, competitors, questions and
three links to results, stacked down one scroll with two search boxes, two
paginated footers and three different save models. The competitors table is the
only block with no heading of its own; `competitorsTitle` sits unused in
`en.json`. The page description still reads "The competitors tracked against
this website", which is a fifth of the page. `DetailLayout` and `DetailTabs`
exist and companies and agents use them; this screen does not.

**The schedule modal is the wrong control.** The website override builds on the
generic workflow `ScheduleBuilder` while the company one level up uses
`SeoScheduleFields` — the narrow control written *because* the builder was wrong
for SEO. Consequences, all live today:

- It passes `targetKind="agent"`, so the summary reads "This **agent** will
  execute Weekly on Monday" on a website. `ScheduleTargetKind` offers only
  `"agent" | "workflow"`; a website is neither.
- Hourly is offered here and deliberately removed one level up, and
  `setCompanyWebsiteSchedule` validates nothing — any interval string is written
  as given.
- **Fortnightly is a company cadence and is missing from the builder's four
  buttons.** Open the override on a fortnightly company and no cadence looks
  selected, the day picker hides, and `buildSummary` falls through to the daily
  string — while the draft still serialises as fortnightly. The screen states one
  schedule and saves another. This is a bug, not a style problem.
- "Targeted Times" offers a list of exact times for a per-call paid pull, with
  no cost framing at all.

**Two sections collide.** "Data Collection" is the live pull queue in the
sidebar and a settings form inside a company. Same two words, one a log and one
a form. Spend is reported twice with different framing and neither links to the
other. The sidebar word "Websites" covers a record list, an operations queue and
a margin report.

**Cost is invisible where it is created.** Adding a question is a paid call per
engine per cycle, forever. The screen that creates that cost says "10 more
questions can be added" — a plan limit, and since 2026-09-22 a limit raised out
of the way, so it now measures nothing. Nothing anywhere says whether a tracked
thing is producing: a question can run eight weeks, cost thirty-two calls and
never be named once, and no screen will mention it.

## The shape that fixes it

Anthony, 2026-09-22: *"settign up keywrods, prompts and comptetoters is not a
oen time job."*

That is the governing idea and it rules out the obvious answer. An early draft
of these screens had a numbered setup wizard with a progress bar reading
"2 of 4 · Ready". It was wrong: it frames the most valuable ongoing work as a
chore to clear, it goes quiet at exactly the moment there is finally evidence to
act on, and it builds a second UI that lives ten minutes. A client on week forty
and a client on day one need the same screen.

So: **keywords, questions and competitors are a portfolio somebody works every
week, not a form somebody completes.** Every screen follows from that.

- **No progress bars and no "Ready."** The day-one screen is the week-forty
  screen with nothing in it (artboards 7 and 8 are the same layout).
- **Every row carries what it has produced and what it costs.** A verdict, not a
  tick: earning its keep, slipping, never landed, too broad, too new to say.
- **Every cycle writes the next set of moves.** The Brief is a worklist drawn
  from what came back — a rival named four times that nobody tracks, a
  misspelling worth adding as a name, a question that has never landed. Handled
  or dismissed they clear, and the next pull refills them.
- **Four tabs, not one scroll:** Brief · Tracking · Results, with a link up to
  the website record. Tracking holds keywords, questions and competitors behind
  one segmented switch, because they share a shape and an economics; showing
  their three costs side by side is what makes the trade-off legible.

## What the last fortnight changed

Checked against `ecdee67c..HEAD` on 2026-09-22. Three of these contradict
screens drawn before them, and the drawings have been corrected.

- **Live is cheaper than queued**, four times over, and two engines could never
  queue. There is no method choice left to offer; the queued-or-live control
  should come off `SeoScheduleFields` rather than be copied down to the website.
- **The prompt allowance stopped biting** — raised to 1,000 deliberately. A quota
  meter now measures something that was moved out of the way; cost replaces it.
- **Collect now exists**, on the platform collection screen, super admin only,
  because pressing it spends Hakken's money and the company workspace becomes
  customer-facing. It belongs on artboard 14, not in a client's Brief.
- **Keywords and fan-out have screens**, so the "no screen at all" finding is
  closed. Both carry `seo.keyword-intent`. Note the keywords screen reads *what a
  site ranks for* — discovered, not curated; there is still no tracked-keyword
  list to add to or retire from.
- **Citations carry a stance** — recommended, mentioned, warned against. "Named
  2nd" was hiding the most important distinction in the product.
- **Competitor discovery is judged**, and a rival cited under a second address is
  matched to the row already tracked.

Every Decision ships switched off with a code fallback, so each screen must read
an absent judgment as the plain fact it was before the judgment existed — never
as a guess dressed as a verdict.

## Stages

All four are in. **They are built 1 → 4 → 2 → 3, not in number order**, because
stage 2 renders the lists stage 4 moves. Building Tracking against today's
per-client `trackedPrompts` and `trackedCompetitors` and then re-pointing it at
canonical sets is the same screen written twice, and the second writing is the
one that would be rushed.

Stage 1 goes first regardless: it is small, it corrects things that are untrue
today, and nothing else depends on it.

An earlier draft held stage 4 back because the allowance question was deferred
until real invoices arrive. That objection does not survive contact: stage 4
changes *what is counted* — a subscription rather than a question per website —
not the number, which stays out of the way until the meters are decided.

### Stage 1 — Stop the screens saying untrue things

No schema change. Small, and it clears every correctness finding.

1. Rebuild the website schedule sheet on `SeoScheduleFields`: four cadences with
   cost hints, the one-line "on Monday at 09:00" row, fortnightly included, no
   hourly, no targeted times. Summary names the website. Artboard 6.
2. Add a `"website"` target kind, or take the target word out of the summary
   string. Either closes "this agent"; the first is tidier.
3. Validate `refreshIntervalStr` server-side in `setCompanyWebsiteSchedule`
   against what the SEO control can produce, so the narrow choice is real rather
   than drawn.
4. Take the queued-or-live control off `SeoScheduleFields` and stop writing
   `seoPreferLive`; everything is live. Leave the stored field until a migration
   pass.
5. Rename one of the two "Data Collection" screens. Sidebar becomes **Collection
   pipeline**; the company tab becomes **Collection schedule**.
6. Housekeeping: heading above the competitors table, delete
   `competitorsTitle` / `dataCollection` / `prompts.addedColumn` or render them,
   a search box and `divider` on the company websites list, and one orange
   action per page.

### Stage 2 — The client screen becomes tabs

No schema change. This is the density fix.

7. `DetailLayout` + `DetailTabs` on the site route: **Brief · Tracking ·
   Results**. The three links at the bottom of today's page become the Results
   switcher: AI answers · What the engines searched · Rankings. Artboards 9–10.
8. Tracking is one route with a segmented switch over keywords, questions and
   competitors, each showing count and monthly cost. Artboards 11–13.
9. Every row gains a verdict and a cost. Questions: named X of Y, weeks running,
   engines, cost, verdict. Keywords: position, trend, intent, verdict.
   Competitors: beats you on, in AI answers, trend, verdict.
10. Results carries stance. Recommended / mentioned / warned against / not named
    / could not be asked, with the misspelling note kept.
11. Fan-out gains a "track it" action per row and a filter for buying-intent
    searches nobody tracks — the cheapest new keyword ideas in the product, and
    already paid for.

### Stage 3 — The moves

12. A `websiteMoves` store: kind, subject, evidence, state (open, done,
    dismissed), and the cycle that raised it. Derived on parse, never on read.
13. Five kinds to start, all already computable from what is collected:
    untracked rival named N times and judged real; a spelling that matched
    nothing; a question that has never landed; a buying-intent fan-out search not
    tracked; a keyword that slipped more than three places.
14. The Brief renders them, with the portfolio summary beneath. Artboards 7–8.
15. The company portfolio list gains "moves waiting" per row, replacing the
    setup-completeness column that this plan argues against. Artboard 5.

### Stage 4 — Website-first — **built second**

Anthony, 2026-09-22: *"so we are goign into the gloval website section first and
attach to copanies then"*, and on sharing: *"another agency may also want to see
my keywrods and what i do to mak etheir website better. Thats a valid use case."*

The proposal: the website record holds brand names, sector, the canonical
keyword and question sets, and the competition graph. A company attaches to it —
owned or tracked — and the attachment holds only what genuinely differs per
watcher: which of the canonical set it subscribes to, where it watches from,
how often, and on or off. Artboards 1–4.

**What it buys.** Three clients each adding ten keywords to one host is thirty
paid tasks today; one canonical list of fifteen, pulled once per *place* and read
by all three, is fifteen — cheaper, and the saving grows with each client. A new
client attaching to a known host inherits months of history on day one instead of
waiting a month for anything worth showing. And the corpus becomes the asset:
every host configured makes every client's view of their market better.

**What it costs.** New tables for the canonical sets; competitors move from a
per-client join to a graph on the host; the allowance model changes from
"questions per website" to "what you subscribe to"; a migration for existing
rows. The tenancy rule is rewritten rather than removed — from "nothing may read
a website and walk out to its watchers" to **"nothing stored on a host may name
who is watching it"**, which `websiteTenancyGuard.test.ts` can enforce the same
way. Worth doing before there are many clients. Painful after.

**What it needs decided.** That the sharing is deliberate and stated in the
terms, as a benefit rather than a disclosure: you can see your competitors
because they can see you, and that is why the data is any good. Ahrefs never has
to explain itself because it only observes; Hakken is partly told things.

## Risks

- **Stage 2 touches a screen another agent is actively building on.** The site
  route grew 172 lines on 2026-09-22. Rebase on it, do not rebuild around it.
- **The moves store can nag.** Dismissals must persist per company website and
  per kind, or the same suggestion returns every cycle and the Brief becomes
  noise. Dismissed is not the same as done.
- **Verdicts are opinions with money attached.** "Never landed" after eight
  weeks is a judgment about a threshold nobody has set yet. State the threshold
  on screen rather than hiding it in a helper.
- **Stage 4 is the migration.** Existing `trackedPrompts` and
  `trackedCompetitors` rows become canonical entries plus subscriptions. It must
  be reversible and it must not lose a client's list. Write the down path before
  the up path.

## Verification

`npm run check` in full for each stage, plus `npm run check:guards`, which fails
on eight kinds of screen-kit drift including a table with no header above it.
`scripts/screen-kit-allowlist.json` may shrink, never grow. Locale parity between
`messages/en.json` and `messages/it.json`. New Convex functions need
`convex dev --once` or the app 404s them while the tests stay green.

## Not in this plan

No customer-facing screens, no crawler, no on-page audits, no analysis agent
reading results, no new engines, no billing changes, and no answer to the
keyword allowance question — that stays deferred until real invoices arrive.

## Open questions

Neither blocks a stage. Both are thresholds, and both ship as a stated guess
rather than a hidden one — printed on the screen that uses them, so they are
arguable the first time anyone sees them against real data.

1. **What makes a question "never landed"?** Eight weeks with zero citations.
   **Slipping** is down more than three places; **too new to say** is under four
   weeks. Guesses, held in one module so changing them is one edit.
2. **Does a curated keyword list exist, or stay discovered?** Today's keywords
   screen reads what a site ranks for. Stage 4 gives the host a canonical set, so
   the answer becomes both: discovered rankings, curated subscriptions.
