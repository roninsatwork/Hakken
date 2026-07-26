# Admin UI/UX — Model Catalogue, Skill Center, skill detail

**Started 2026-07-25.** Anthony flagged four screens as hard to understand. This
is the review, the decisions taken, and what is being changed.

The secondary tabbed navigation stays. It was never the problem.

---

## What is actually wrong

Four faults, in the order they hurt.

### 1. The screens speak engineer

"Bindings", "smoke validation", "eval fixtures", "rollout", "SKILL.md",
"Unclassified", "Inherited". A capable person who does not build software stalls
on every one. The clearest example is a green banner reading *"No enabled skill
bindings need upgrade or smoke validation"* — a double negative made of jargon,
reassuring the reader about something they have not done yet.

### 2. The skill page asks people to write JSON

Five textareas on the skill detail page hold raw JSON, one of them containing
escaped quotes:

```
"expectedBlockedActionsJson": "{\"policies\":[\"tenant_boundary\"]}"
```

Nobody outside a developer can fill that in, and a misplaced comma fails
quietly. Three of the five are empty, so the page mostly shows blank boxes the
reader cannot judge.

### 3. Dashboards of zeros

Both Skill Center screens lead with five large counters. On an empty account
they all read 0; after seeding six starters, five of the six still read 0. The
most prominent element on the page measures nothing, which reads as broken
rather than as new.

### 4. Nothing says what to do next

Every screen offers four equally-weighted buttons. On Skill Center the orange
one — the visual primary — is *Import SKILL.md*, the most technical of the four
and the least likely first action for someone who has just arrived.

Per screen, on top of the above:

**Model Catalogue.** "NO PRICING" is an amber warning on four of seven models
that does not say what is wrong, what it costs, or how to fix it — and it has
real consequences, because unpriced models are held to tighter budgets.
Capability and use-case chips truncate to "+6" with no way to see what is
hidden. The `ONLINE` badge sits directly beside a `DEACTIVATE` button, mixing
"is it reachable" with "are we using it". Model ID takes a prime column while
cost, which is what an admin actually wants, is absent.

**Skill detail.** The genuinely valuable content — the skill instruction, in
plain English — gets the same grey box as the JSON. The right-hand column is
four panels all saying "No … yet".

**Model Defaults.** Ten rows, ten dropdowns, and every one reads *Google Vertex
AI / 3.1 Flash*. Ten identical answers is a wall rather than a decision, and
there is no way to set them together or return to a recommended set. Every row
also carries a `CONFIGURED` pill that never says anything else, so it costs
attention and carries no information. Each label is printed twice — *Chat* and
then `CHAT` beneath it — the second being the internal key. Nothing explains
what the runtime jobs are: a reader has no way to know what *Router*, *Title* or
*Transcription* mean, and choosing a model for them is fundamentally a
cost-versus-quality decision made here with no cost shown.

**System Settings → System Options.** The heading reads *SYSTEM DIAGNOSTIC
PROTOCOLS*, then *Diagnostic Routing Matrix* appears twice — once as the section
title and again as the card inside it, with the same sentence repeated word for
word. That sentence is *"Enable developer backdoor debugging paths and cache
systems"*: "backdoor" is an alarming word to attach to a switch nobody has
explained, and the switch itself is a small icon that does not read as on or
off. Three levels of nesting wrap a single toggle.

**Settings → API Keys.** A create form fills the top of the screen whether or
not the reader wants to create anything, and beside it sits a large empty panel
headed *One-time secret* explaining a state that does not exist yet. Below, the
empty table says `NO API KEYS CREATED` and then, three lines lower, *No API keys
created* again.

The words are the deeper problem. The page exists "for future public API and
webhook surfaces" — two of the four permissions are for features not yet built
("Use future callback delivery surfaces") — and nothing states that plainly
once; instead it is threaded through every description. *Governed* appears
twice, meaning nothing to a reader. `RATE/MIN` is a heading in mono capitals with
no unit and no explanation of what happens when the rate is exceeded. And the
reassurance under the title — "Raw secrets are returned once, then only a digest
and prefix are stored" — is the single most important sentence on the page,
written in a way that requires knowing what a digest is.

Below it, *White-Label Readiness* scores 29% with counts of Ready 2, Pending 3
and Manual 2 — without saying what Manual means, how the score is reached, or
why 29% matters. Each row prints a raw identifier under the description —
`missing-logo-variant`, `#E26D28`, `disabled` — mixing machine values into a
list meant for a person. Worst of all, the pending items name exactly where the
fix lives ("Set a customer-facing product name in Core Identity") and do not
link to it, even though Core Identity is a tab on the same screen.

---

## Decisions

### The SKILL.md file is the source of truth; the screen is a window onto it

Anthony confirmed he will only ever load skills by uploading a `SKILL.md` file.
That single fact removes the whole editing surface: if the file is authoritative,
a form that edits the database copy can only create drift between the two, and
every JSON box is a way to introduce a difference nobody asked for.

So the skill detail page becomes **a page you read, not a form you fill in**.
Changing a skill means changing the file and uploading it again, which also earns
real version history — each upload is a new version, and versions can be
compared.

The round trip already exists on the page: **Export** and **Import** were the
answer, and the form built on top of them was the mistake.

### These screens are designed as client-facing

Sonae is the base for future client products, so someone other than Anthony will
be looking at them. That sets the bar above "the person who built it can live
with it".

### Hand-creating a skill is demoted, not deleted

*New skill* stops competing for attention but stays. The seeded starter skills
and the *Clone* button both depend on that path existing, and quietly removing a
working feature is how a product loses something it turns out to need. See the
`useAdminAction` migration in `platform-hardening-plan.md` (P4.2) for the last
time a removed banner nearly took a working link with it.

---

## The Skill Center must work at hundreds of skills

Anthony's requirement, and it outranks the cosmetic work: a screen that reads
well with six skills and hides half of them at three hundred is not finished.

**Measured, not assumed.** The skills module is already bounded — there is not a
single unbounded `.collect()` in it, so nothing here degrades without limit.
The problem is the opposite one: it is bounded *silently*, at
`SKILL_CATALOG_LIMIT = 250`.

Three consequences at scale, none of which announce themselves:

1. **`getActiveSkills` takes the first 250 active skills.** That query populates
   the picker used to attach a skill to an agent. At 300 skills, 50 of them
   simply cannot be attached, and nothing on screen says so.
2. **`getSkillCatalogAnalytics` takes 250 skills and then reads up to 100
   bindings for each** — a fan-out of up to 25,000 documents in one query to
   produce five numbers. It gets slower in proportion to the catalogue, and past
   250 skills its numbers are quietly wrong rather than merely late.
3. **`seedStarterSkills` reads 250** to decide what already exists, so seeding
   into a large catalogue could re-create a starter that is already there.

The list itself is fine: `getPaginatedSkills` pages properly and searches
server-side. It is the fetch-everything queries around it that break.

**The fix, in the order that matters:**

- Replace the analytics fan-out with a **rollup**, the pattern this repo already
  uses in `convex/inventoryRollups.ts`: maintain the counts as bindings change
  rather than recomputing them from scratch on every page load.
- Turn the attach-a-skill picker into a **searched, paginated** control, the way
  the catalogue list already is. This is a UX change and a correctness change at
  once — a searchable picker is better at six skills too.
- Make every remaining ceiling **say so**. Where a bound has to stay, the screen
  reports "showing 250 of 340" rather than presenting a truncation as the truth.
- The Skill Center becomes **search-first** rather than a wall of cards: search,
  then filter by category, risk and status, then page. A card grid is the right
  answer for six skills and the wrong one for three hundred.

**Done so far.** `searchActiveSkills` replaces the capped picker query: searched
and paged in the database, with already-attached skills excluded. Proven against
a catalogue of 261 — every active skill reachable, the archived one never
offered — and confirmed to fail when reverted to the capped implementation.

**Found while testing, and it shapes the UI:** search ranking alone does not
rescue a large catalogue. In a library where most names share a word, searching
that word returns the first page by relevance and the skill wanted may be
nowhere near it. Search is necessary and not sufficient — the category, risk and
status filters are what make a large catalogue navigable, so they are not
decoration.

---

## The plan

Four phases, about five and a half days. Ordered on one principle: **a screen that shows
the wrong thing is worse than a screen that shows the right thing badly.** The
silent 250 cap is the product telling the reader something untrue, so it is
fixed before anything is made prettier.

Each item is verified in the running app, not only in tests. Every behavioural
claim gets a test, and every new test is confirmed to fail against deliberately
broken code before it is trusted.

### Phase A — Stop the screens lying (2 days)

| # | Item | Size | State |
|---|---|---|---|
| A1 | Uncapped, searched, paged skill picker — server | 0.5 | **done** |
| A2 | Wire the picker screen to it, with filters | 0.5 | **done** |
| A3 | Health counts as a maintained rollup | 0.75 | **done** |
| A4 | Fix search + status paging, and say "showing X of Y" | 0.25 | **done** |

**A1 (done).** `searchActiveSkills` searches and pages in the database and
excludes already-attached skills. Proven at 261 skills.

**A2 (done).** The attach-a-skill picker searches and pages in the database and
gained category and risk filters, both applied server-side. Filters are
load-bearing at this scale, not decoration — see the search-ranking finding
above. The page also stopped waiting on the whole catalogue before it could
render the agent's own skills.

One tile was removed rather than left lying: *Available* counted the catalogue
from that capped fetch, so past 250 it was simply wrong. An honest total needs
the maintained count from A3; until then the picker answers "what else is there"
by searching rather than by counting.

**A3 (done).** `getSkillCatalogAnalytics` no longer reads up to 25,000 documents
to produce five numbers. It reads one rollup document. **Indexing cannot fix
this** — an index finds rows, it does not total them.

*Rebuilt on a schedule rather than incrementally, and that was a deliberate
choice.* The tempting design keeps counters up to date on every write. But these
counts depend on facts that change in at least eight places — a binding created,
removed or disabled; a skill gaining a version, which makes every binding of it
outdated at once; an eval run passing; a skill archived. Eight write paths each
of which must stay correct for ever is how counters silently drift, and a number
that is quietly wrong is worse than one that is honestly late. So a single
rebuild walks the catalogue every ten minutes and on demand, and the screen is
given `computedAt` so it can say how old the answer is.

Two properties the tests pin down, both confirmed to fail when removed:

- **"Not measured yet" is distinguishable from "measured, and it is zero".**
  `computedAt` is null before the first rebuild. Five confident zeros on a new
  account is how the old panel managed to read as broken.
- **A truncated walk is never presented as a total.** Past the walk limit the
  rollup reports `isPartial` and `skillsCounted`, so the screen can say what it
  actually counted.

**A4 (done).** The search-plus-status bug was worse than described. The status
filter was applied to a page *after* it had been paginated, so a search whose
first page happened to be all archived returned **nothing at all** — a catalogue
with ten matching active skills answered "no results". The status now narrows
inside the search index, which the `filterFields` added in A2 made possible.
Proven with 30 archived and 10 active skills sharing a search word: the fix
returns a full page of ten, the old code returned zero.

The Skill Center list also now says what it is showing — "Showing 15 of 42
skills" — and the health panel says when it last counted, or "Not counted yet"
before the first rebuild. A page count with no total cannot distinguish a whole
catalogue from a filtered one from a truncated one.

### Phase B — The skill lifecycle (1.5 days)

| # | Item | Size | State |
|---|---|---|---|
| B1 | Re-upload updates instead of duplicating | 0.5 | **done** |
| B2 | Skill detail becomes a page you read | 0.5 | **done** |
| B3 | Skill Center becomes search-first | 0.5 | **done** |

**B1 (done).** Uploading an edited `SKILL.md` updates the skill it created, as a
new version, rather than adding a second one. The file is stored with the skill,
so the page can show what was uploaded. Identity is the frontmatter name, not
the filename, because these files are all called `SKILL.md`. An archived skill is
never revived by an upload.

**B2 (done).** The five JSON boxes are gone, along with the form around them.
The instruction is now the content of the page in readable type; tools read as a
list with "available" or "not available" beside each; examples read as a
sentence rather than a JSON array; and the page says which file it came from and
when, with *Upload new version* as the primary action, landing straight on the
upload rather than on a list to navigate out of again.

**One thing stayed editable, deliberately: publishing.** Draft, published and
archived are operational decisions the file cannot carry — a `SKILL.md` says
what a skill does, not whether this deployment has turned it on. Everything the
file *does* say is shown rather than offered as a form, because editing the
database copy could only make it drift from the file that produced it.

The `Clone` / `Export` / `Archive` actions stayed. So did the *Open clone* link,
which is the one a previous refactor nearly dropped because no test covered it —
it is covered now.

**B3 (done).** The four competing buttons now say what they do rather than what
they are: *Upload a skill file*, *Restore from backup*, *Add example skills*,
*Write one here*. The orange primary is still the upload, which is now also the
likeliest first action rather than the most technical one.

Search and a status filter lead the page, both narrowing in the database. The
health panel appears only once there is something to measure — five counters
reading zero was the most prominent element on an empty account, and a panel
measuring nothing reads as broken rather than as new.

The counters themselves speak English: *In use by agents*, *Out of date*,
*Tested*, *Untested*, under the heading "How your skills are being used". The
green banner that read "No enabled skill bindings need upgrade or smoke
validation" is on the list for the vocabulary pass with the rest of the
double negatives.

### Phase C — Models (1 day)

| # | Item | Size | State |
|---|---|---|---|
| C1 | Model Catalogue | 0.5 | **done** |
| C2 | Model Defaults | 0.5 | **done** |

**C1 (done).** The `ONLINE` badge turned out not to mean "reachable" at all — it
was `isEnabled`, the very same fact as the *Deactivate* button beside it, printed
twice in adjacent columns. One of them went.

Cost took the column the provider's internal model id had, shown per million
tokens because that is the unit providers publish and the only one at human
scale; the model id now sits under the name where a developer can still find it.
The "no pricing" warning explained its consequence in a `title` attribute nobody
hovers — it now says on the page that agents using an unpriced model are kept to
a smaller budget, and the badge reads *Add its price* rather than naming a
problem. Truncated chips say "+6 more" and name the hidden ones on hover.

**C2 (done).** Every runtime job now carries a sentence saying what it is —
"Router: deciding which model or skill should handle a request. Runs on every
message, so a cheap model here saves the most." The internal key that printed
the same word a second time under every label is gone.

The `CONFIGURED` pill that appeared on all ten rows and never said anything else
is replaced by the price of the chosen model, so the cost-versus-quality
decision is visible at the point it is made; only *Not set* is still called out,
because only the exception carries information.

**Not done: the recommended set.** Offering "apply these ten" means asserting
which model is right for each job, and that answer depends on the models a
deployment actually has enabled and what they cost. Guessing it in code would be
a confident recommendation with nothing behind it. The descriptions and the
prices give a reader what they need to choose; a preset should wait until there
is a real basis for one.

### Phase E — Models, second pass: make the screens true (1 day)

**Opened 2026-07-26.** Anthony came back to the Model Catalogue and the model
detail page. Phase C made the catalogue say more; reading it again showed that
some of what it says is false, and that the detail page collects thirty fields to
edit two numbers.

Three faults found, and they outrank the layout work. This is the same principle
Phase A ran on: a screen that shows the wrong thing is worse than a screen that
shows the right thing badly.

| # | Item | Size | State |
|---|---|---|---|
| E1 | Prices are wrong by a factor of a million | 0.25 | **done** |
| E2 | One currency, stated once | 0.25 | **done** |
| E3 | "Default" means what actually runs | 0.25 | **done** |
| E4 | *Make Default* stops rewriting all ten jobs | 0.25 | **done** |

**E1 — the price is a million times too big.** `formatTokenCost` multiplies the
stored rate by 1,000,000 to reach a per-million figure. But the stored rate is
*already* per million: `aiCostService.ts` divides token counts by 1,000,000
before applying it, the detail page's own fields are labelled "per 1M tokens",
and every synced record carries `inputTokenUnit: "Per 1M tokens"`. So a model
priced at £0.075 per million displays as **£75,000.00**. The same helper feeds
the Defaults screen, so the cost shown at the point of choosing is wrong there
too — which undoes the one thing C2 added.

The fix is one helper and its tests. The test that matters asserts the screen
agrees with `calculateModelCostGBP`: given rates and a token count, what the
catalogue prints per million must be what the runtime actually charges.

**E2 — three currencies for one number.** The detail page prefixes every price
field with `$` and the record says `currency: "USD"`, because that is how
providers publish. The catalogue prints `£`. The runtime function is called
`calculateModelCostGBP` and converts nothing. A `convertUsdToGbp` helper already
exists in `analyticsService.ts` at a fixed 0.78 and is not applied to model
rates.

Decision **as planned**: keep storing the provider's published dollar price,
convert once for display, and say so. Typing in the provider's own number is what
makes the figure checkable against their pricing page; converting on the way in
would bake today's rate into stored data and quietly rot.

**Decision as built: dollars, not converted pounds.** Anthony had agreed to the
conversion, and implementing it turned up the fact that changed the answer —
`convertUsdToGbp` **has no production callers at all**. Nothing in the product
converts. Every cost figure on every screen, including Running Costs and the
agent spend budgets, is a dollar number with a `£` in front of it.

Converting on the catalogue alone would therefore have made it disagree with
every other cost surface: a wrong number swapped for an inconsistent one. So
model rates now read `$0.075 in · $0.30 out`, which is what the provider
publishes, what the detail page's own `$` fields collect, and what the record's
`currency: "USD"` says.

**Raised, and deliberately left:** whether platform spend is tracked in dollars
or pounds is a costing decision, not a screen decision. Fixing it properly means
applying the conversion once at the point of calculation and dealing with the
historical `costGBP` records already stored under the wrong label. That is its
own piece of work.

**E3 — the star marks a setting that usually decides nothing.** The catalogue
stars `isDefault`. The detail page labels the same flag "Legacy Default", which
is the honest name. What actually decides which model runs is `aiModelDefaults`,
one row per job. Traced end to end, the chain is:

```
the agent's own choice        (if enabled)
  → the company's choice for that job
  → the platform's choice for that job     ← the Defaults screen
  → the starred model                      ← the star
  → any enabled model at all
  → a hardcoded failsafe model id (SYSTEM_FAILSAFE_MODEL_ID)
```

The star is the fourth thing tried. It is not dead — it is a fallback tier, and
provider sync seeds the platform defaults from it — but presenting it as *the*
default is wrong, and the agent and chat pickers compound it by labelling that
model "system default" to users when the runtime may be routing elsewhere.

So the catalogue stops showing the flag and starts showing the fact: **is this
model currently handling any job?** Yes, with the jobs named — *Chat, Title* —
or no. That is the question the star was failing to answer.

**E4 — one hover button reassigns the whole platform.** *Make Default* reads like
marking a favourite. It rewrites **all ten** platform defaults — Chat, Fast Chat,
Reasoning, Agent, Workflow, Report, Router, Title, Transcription, Embedding — to
that one model, with no confirmation, from a control revealed on hover next to
*Deactivate*. Sending embedding traffic to a chat model is one mis-click away.

The mutation stays: a fresh deployment needs a way to point everything somewhere,
and provider sync depends on the flag. It moves to the Defaults screen, where the
ten jobs it overwrites are visible on the same page, named for what it does —
*Use this model for every job* — and asking first. The catalogue row loses it
entirely; choosing what handles what belongs on the screen built for it, one job
at a time.

### Phase F — Models, second pass: make the screens simple (1 day)

| # | Item | Size | State |
|---|---|---|---|
| F1 | The catalogue table is four columns | 0.5 | **done** |
| F2 | The detail page is two panels | 0.5 | **done** |

**F1 — four columns, Anthony's call.** Model name · Provider · Default · Active.

**Capabilities and Use Cases go completely** — the columns, the two filter
dropdowns, and the chip lists on the detail page. Anthony's call, and the code
agrees with it: they are provider-synced metadata nobody can change from these
screens, they cost five to eight chips per row plus a "+6 more", and they are the
single largest source of noise on the page. Nobody browses a model catalogue by
"json-mode".

One of the two is genuinely dead and one is load-bearing, so they are removed
differently:

- **`capabilities` is display-only.** It is written by provider sync and read by
  nothing but the two screens and its own filter. Removing those removes its last
  reader. The synced field stays in the database rather than earning a migration
  for data that costs nothing at rest, recorded here as dead so the next person
  into provider sync can stop writing it.
- **`supportedUseCases` decides things, invisibly.** It is what stops an
  embedding model being offered for chat: it filters every model picker, it
  filters the candidate list on the Defaults screen, and setting a default is
  rejected if the model does not support the job. So it disappears from every
  screen — which is what was asked — and stays as plumbing behind the Defaults
  dropdowns. Deleting the data would silently offer every model for every job.

The `capabilityFilter` and `useCaseFilter` arguments come off
`getOffsetPaginatedModels` with the dropdowns, along with the two post-fetch
filter passes they drive.

Cost loses its column too. C1 gave it one on the reasoning that price is the
decision being made here; with the catalogue reduced to *what exists, and is it
on*, the decision has moved to the detail page and to Defaults. What must not go
is the consequence: an unpriced model runs its agents on a reduced budget. That
survives as a short amber tag beside the name and **one** line above the table —
not, as now, the same forty-word paragraph repeated inside every affected row.

**Active is the control, not a second copy of it.** C1 removed the `ONLINE` badge
because it printed the same fact as the *Deactivate* button beside it. Adding an
Active column reintroduces exactly that duplication unless the column *is* the
switch. So it is: a real toggle in the cell, no separate action column, and the
word *Initialize* — which is not a word for turning something on — goes with it.

Search leads on its own full-width row, as the Skill Center now does. It has been
there all along, crushed between three dropdowns and a toggle until its
placeholder truncated to "Sea", which is why the screen reads as having none.
With the capability and use-case dropdowns gone, provider and active are the only
two left and there is room for the search box to look like one.

**F2 — thirty fields to edit two numbers.** The detail page exists so prices can
be entered. Almost none of it is that.

*Provider Metadata* is nine read-only fields plus the two chip lists removed in
F1. Of the nine, Context Window, Max Output and Pricing Effective all read "Not
recorded", and Input Unit, Output Unit and Currency are constants that never
vary. Three are worth keeping — provider, model id, last synced — as one grey
line, not a bordered card with an icon.

*Selection Summary* goes entirely. All three of its fields restate something
already on the page: "Availability: Selectable" is the ACTIVE badge in the title,
"Display Name" is the box directly above it, and "Legacy Default" exposes the
debt named in E3 to whoever opens the page.

Of the seven price fields, five are genuinely read by the cost engine. **Cost per
1M Reasoning Tokens is written and never read anywhere** — it is removed rather
than left to look meaningful. Price in and price out lead, because they are the
two anyone will actually type; the 200k-tier and cached-token prices are real but
rarely touched, and fold behind *More prices*.

In their place, the sentence the page should always have carried: which jobs this
model currently handles, linking to Defaults.

**Done.** The catalogue is Model · Provider · Default · Active, every row the
same height. `ModelTagList`, `MODEL_CAPABILITY_OPTIONS` and
`MODEL_USE_CASE_OPTIONS` had no readers left once the columns and dropdowns went,
and the `capabilityFilter` / `useCaseFilter` arguments came off
`getOffsetPaginatedModels` with the two post-fetch passes they drove.

The detail page went from six panels and about thirty fields to two panels and
seven, of which two are visible by default. Saving now returns to the catalogue
rather than stepping back through history to wherever the reader happened to
arrive from. `outputReasoningCost` was removed from the form **and** from
`updatePricingConfig` — a field that only ever travelled one way looks like it
means something.

*Not done, and worth knowing:* the sort inside `getOffsetPaginatedModels` still
floats the legacy `isDefault` row to the top of the list. It is one row and it is
harmless, but it now sorts on something the screen no longer shows. Sorting on
the real defaults would mean reading `aiModelDefaults` inside the paginated
query.

### Phase G — asked for while Phase F was on screen (done)

Anthony reviewed the rebuilt catalogue and asked for four changes. All are done
and checked in the running app.

| # | Item | State |
|---|---|---|
| G1 | Yes/no only in the Default cell | **done** |
| G2 | A Pricing column reading *Added* or *Missing* | **done** |
| G3 | *Make this the default model* on the model page | **done** |
| G4 | Search and both filters on one line | **done** |

**G1.** F1 shipped the Default cell naming all ten jobs it handled. That made one
row three times taller than its neighbours and put back the wall of text this
pass exists to remove. It reads *Yes* or *No*; the jobs are hover text.

**G2.** Price came off the table in F1, and the consequence of an unpriced model
went with it — first as a badge on the name and a banner above the table, both of
which were additions nobody asked for and both of which made the table feel full
again. A column of its own says it in one word. Columns are now **Model name ·
Provider · Pricing · Default · Active**.

**G3.** *Make this the default model* sits on the model page beside the sentence
saying what it currently handles, and hides itself when it already handles
everything. It uses the same confirmation as the Defaults screen: it names all
ten jobs, warns that embedding needs an embedding model, and says when it will
also switch the model on.

**G4.** Search, provider and the active/inactive toggle share one row. Four
controls was what crushed the search box down to "Sea"; three fit.

### Phase H — the catalogue is whatever the provider says it is (done)

**Found while Anthony asked "why are we missing models from Vertex — is it
actually working".** It was not.

`syncGoogleVertexModelCatalogue` never contacted Google. It held **six model ids
typed into the source**, above a comment explaining that the SDK could not list
Vertex models "in some beta SDK versions" — true when written, long out of date,
and never revisited. Pressing Sync could not discover a model Google had
released, and nothing on screen admitted it.

**Proven, not assumed.** A throwaway probe deployed to the dev deployment called
Vertex with the real service-account credentials and returned **15 usable
models**, including four the hardcoded six never had. The probe was deleted.

The fix calls `models.list({ queryBase: true })` on the client that already
exists, which the SDK routes to the v1beta1 `publishers/google/models` endpoint.

**No fallback list, anywhere.** Anthony's instruction, and it applies to more
than Vertex: the twelve curated OpenAI ids went too. They were the same fault —
a list silently deciding what exists, going stale without saying so, and turning
a failed sync into one that looks successful. A sync that cannot reach its
provider now throws and marks the provider unhealthy.

What replaces the lists is **rules applied to whatever comes back**: keep the
text-generation and embedding models and drop the image, video and speech ones no
code path can call; derive capabilities from the model id; titleize the name
Vertex returns, which is the raw id. A model Google ships tomorrow appears with no code change,
and a test asserts that.

Two tests had to be rewritten because they **pinned the bug in place**, asserting
that a sync returns exactly six models. They now assert that a sync which cannot
reach Vertex fails and writes nothing.

*Two limits worth knowing, both checked against Google's own documentation:*

- **Context window and max output stay empty.** Vertex does not return them on
  the listing. They are only sent to the database when actually reported, since
  passing undefined through would clear whatever a model already had.
- **Pricing cannot be automated.** Google publishes no per-model pricing API. The
  nearest thing, the Cloud Billing catalogue, identifies models only by marketing
  prose in a SKU description, with no structured model id to join on. Too brittle
  to depend on, which is what the Pricing column is for.

### Moved out: the AI Providers screen

Anthony asked for the Providers screen next, plus OpenRouter across the whole
app. Reviewing it showed the screen's faults are mostly backend — a test that
never calls the network, a disable that does not disable, and a catalogue query
that is not actually paginated in the database. That work, and everything about
provider resolution at run time, now lives in
[openrouter-and-model-scale-plan.md](./openrouter-and-model-scale-plan.md).

Two items raised below moved with it: **disabling a provider does not stop its
models running** (Phase J), and **a stale default can outlive its own
eligibility** (Phase P).

### Raised, not fixed

Found while tracing E3, all outside these two phases and none of them
UI problems:

- **`reasoning` is a job nobody runs.** It is settable on the Defaults screen and
  offered by provider sync, but no runtime call ever asks for it. Choosing a
  model for it does nothing.
- **`fallbackModelId` is read on four branches of the resolution chain and
  written by nothing** outside the local demo seed.
- **Disabling a provider does not stop its models running.** It hides them from
  every picker and blocks new defaults, but an already-set default on that
  provider still executes.
- **A stale default can outlive its own eligibility.** Use-case support is
  checked when a default is set, not when it is used, so a model whose supported
  jobs are later narrowed by provider sync keeps handling the job it lost.

### Phase D — Settings (1 day)

| # | Item | Size | State |
|---|---|---|---|
| D1 | One toggle, stated once, in plain words | 0.25 | — |
| D2 | Readiness rows that link to their own fix | 0.25 | — |
| D3 | API Keys | 0.5 | — |

**D1.** *Diagnostic Routing Matrix* currently appears twice on one screen with
the same sentence under both, wrapped in three levels of box around a control
that does not read as a switch. It becomes one row, one real switch, and a
sentence that does not use the word "backdoor" about a feature nobody has
explained.

**D2.** Every pending row names where its fix lives; each becomes a link to that
tab. The score says how it is calculated and what "Manual" means. Machine
identifiers — `missing-logo-variant`, `#E26D28` — stop sharing space with prose.

**D3.** The list of keys leads; creating one is an action that opens a form
rather than a form that is always open. The empty "one-time secret" panel
appears when there is a secret to show, not before. The empty state is said
once. Each permission is described by what it lets someone do, and the two that
belong to unbuilt features say so plainly in one place instead of hedging every
line with "future". "Raw secrets are returned once, then only a digest and prefix
are stored" becomes the plain warning it needs to be: **copy this key now — it
cannot be shown again.**

### Throughout — the vocabulary pass

Not a phase, because it is done in each screen as that screen is touched.
"Bindings" become *agents using this skill*. "Smoke validation" becomes *tested*.
"Eval fixtures" become *examples*. "Rollout" becomes *which agents have it*.
The test for each word: could someone who does not build software read this
sentence and act on it?

---

## Not in scope

- The tabbed secondary navigation, which stays as it is.
- The underlying data model, with one exception already taken and recorded: the
  three `source*` fields on `agentSkills` that make the uploaded file the source
  of truth. Anything further is a finding to raise, not a schema change to
  smuggle in.
- Rewriting the largest admin pages into data-driven components. That is the
  leftover from P4.2, it is four to five days on its own, and it is better done
  just before the next client product rather than in the middle of this.

## Verification

Each screen is checked in the running app, not only in tests: the dev server,
the real page, the real data. Anything asserted about behaviour gets a test, and
each new test is confirmed to fail against deliberately broken code before it is
trusted — the standard used throughout this repo.
