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
| A3 | Health counts as a maintained rollup | 0.75 | — |
| A4 | Fix search + status paging, and say "showing X of Y" | 0.25 | — |

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

**A3.** `getSkillCatalogAnalytics` stops reading up to 25,000 documents to
produce five numbers. Counts are maintained as bindings change, following
`convex/inventoryRollups.ts`. Reading them then costs the same at ten skills or
ten thousand. **Indexing cannot fix this** — an index finds rows, it does not
count them.

**A4.** Two smaller truths: the existing list filters a search page by status
*after* paginating, so asking for 15 can return 3 with odd "load more"
behaviour; and anywhere a bound genuinely remains, the screen reports the bound
rather than presenting a truncation as the whole answer.

### Phase B — The skill lifecycle (1.5 days)

| # | Item | Size | State |
|---|---|---|---|
| B1 | Re-upload updates instead of duplicating | 0.5 | **done** |
| B2 | Skill detail becomes a page you read | 0.5 | — |
| B3 | Skill Center becomes search-first | 0.5 | — |

**B1 (done).** Uploading an edited `SKILL.md` updates the skill it created, as a
new version, rather than adding a second one. The file is stored with the skill,
so the page can show what was uploaded. Identity is the frontmatter name, not
the filename, because these files are all called `SKILL.md`. An archived skill is
never revived by an upload.

**B2.** Five JSON boxes go. The instruction becomes the main content in readable
type; tools, knowledge, rules and evals render as sentences and lists; the
source file is shown with its name and upload date; one clear action, *Upload
new version*. The right-hand column stops repeating "No … yet" four times.

**B3.** Uploading becomes the front door and is named in plain English. Search
and filters lead; the health panel appears only once it has something to
measure; cards say the next step, which is attaching the skill to an agent.

### Phase C — Models (1 day)

| # | Item | Size | State |
|---|---|---|---|
| C1 | Model Catalogue | 0.5 | — |
| C2 | Model Defaults | 0.5 | — |

**C1.** "No pricing" explains itself and its consequence — unpriced models are
held to tighter budgets, which is why the warning exists. Chips stop hiding
behind "+6". `ONLINE` and *Deactivate* stop sitting together pretending to be the
same idea. Cost earns a column; the model ID gives one up.

**C2.** Each runtime job gets a sentence saying what it is, because *Router*,
*Title* and *Transcription* mean nothing to a reader. The `CONFIGURED` pill that
never changes goes, as does the repeated internal key under every label. A
recommended set replaces ten identical dropdowns, with the cost consequence of a
change visible where the change is made.

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
