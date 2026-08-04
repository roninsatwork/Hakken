# Workspace Customer Research Agent Plan

Last reviewed: 2026-08-01
Status: Phase 1 built — the research record and the two backfill tools, with tests.
Phases 2 to 5 planned.
Owner: Anthony

## Scope And Rules

**In scope:** an agent that searches the internet and does two jobs.

1. **Backfill.** For a site the workspace already sells to, find the details the
   sales import cannot supply — address, telephone numbers, email addresses, who
   to ask for, and the bedrooms or pupils figure the customer type calls for —
   and write what it is sure of into the customer record built by the
   [Workspace Customer CRM Plan](./workspace-customer-crm-plan.md).
2. **Prospecting.** For a group the workspace already sells to, find the *other*
   sites in that group that are not in the import, and file each one as a
   prospect on the same list as the customers, labelled as a prospect.

**Out of scope:** researching anything the import already holds (products,
revenue, groups), groups the workspace has never sold to, contacting anybody,
any change to how sales are shown, and a settings screen for choosing which
fields get researched.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Server-side pagination only, and one `.paginate()` per Convex function —
  `npm run check:pagination` enforces the second.
- No client name in shipped code. The agent is a database record created
  through the existing admin screens, so its name lives in data. Nothing in
  this plan matches on the word "Comax" — see *Decision 2*.
- The vertical stays behind the existing `salesData` module flag and inside the
  `template:remove` fences, as the rest of it does.
- Anyone in the workspace may start a research run and may reject what it
  found, the same permission the CRM already grants for editing.

## Why This Plan Exists

Anthony, 2026-08-01: *"i woudl the agent to auto-update the CRM fields from
what it finds on internet search, we will call the new agent 'Comax - Internet
Customer Research Agent'."*

And, on what the group column is actually for:

Anthony, 2026-08-01: *"we are finding the unique of the care home or the school
… the parent company just links them together. We have the parent company as we
want to research other companies in the group that we don't have in our
database … it will find and backfill data and find us other prospects that we
don't yet have as customers even though we do work other companies in the
parent group."*

The CRM shipped with every contact field blank, and it will stay blank unless
somebody types 39 customers' worth of addresses, numbers and contacts in by
hand. The spreadsheet knows who buys what and for how much; it holds nothing
you could ring a customer with. That information is public — these are hotels,
care homes and schools with published contact pages, and two of the three sit
on official registers.

The second job is where the money is. Those same registers list every site a
provider operates. The workbook has six Colten Care homes in it; Colten Care
runs more than six. The rest are prospects the workspace is already a known
supplier to the parent of, and nothing in the platform surfaces them today.

## What The Group Column Is, And Is Not

Both jobs turn on reading `groupName` correctly, and they read it in opposite
directions:

- **For backfill it is a disambiguator, never a source.** The details written
  onto `THE DEVONSHIRE HOTEL LTD` must come from that hotel's own page. The
  group tells the agent which family the site belongs to so it can tell two
  similarly named businesses apart. It never supplies the address.
- **For prospecting it is the search key.** The group is what you search to
  enumerate the estate, and the sites it returns that are not already in the
  import are the output.

Stated plainly because the same word doing two jobs is how this gets built
wrong: a run that mixes them up writes head office's switchboard onto nine
hotels and calls it success.

## What Already Exists

Measured against the codebase, 2026-08-01, so the plan builds on what is there
rather than restating it:

| Piece | Where it is | State |
| --- | --- | --- |
| The customer record and its blank fields | `salesDataCustomers` | Built |
| The derived account directory | `salesDataAccounts` | Built |
| The customer list, profile and sales history | `convex/salesDataCustomers.ts`, `/app/<workspace>/customers` | Built |
| Saving typed-in details | `saveCustomerDetails` | Built |
| Which extra field a type calls for | `extraFieldForType` | Built |
| The chain view — an account's siblings | `listChainMembers` | Built |
| Web search inside an agent run | `allowInternetAccess` on the agent, honoured by all three providers | Built |
| Reading a web page as a tool | `web.scrape`, with the existing address guard | Built |
| Running without stopping for approval | `autonomousToolExecution` on the agent | Built |
| Per-agent spend and step ceilings | `maxSteps`, `maxToolCalls`, `maxRuntimeMs`, `maxCostGBP` | Built |
| Starting a run from a user-facing screen | `convex/propertyAgents.ts`, the Rightmove precedent | Built |
| Run history, waterfall, logs | The Observability screens | Built |

**What does not exist:** any tool that can read or write a customer record,
anywhere to record where a value came from, and any notion of a business the
workspace does not already sell to. Those are the three real pieces of work.
Everything else in this plan is wiring.

## Decisions

Taken 2026-08-01 with Anthony, recorded so they are not relitigated.

1. **It fills blanks and never overwrites a person.** A field somebody typed is
   worth more than anything found online, and this is also what makes a repeat
   run safe and cheap: run it again next month and it only touches what is
   still empty. When the agent finds something that contradicts a typed-in
   value, it records the finding for review rather than replacing the value.

2. **The agent is found by the tool it holds, not by its name.** The Rightmove
   precedent matches an agent on a hardcoded name string. Repeating that would
   put "Comax" in shipped code, which this vertical's rules forbid, and would
   stop the next client naming their agent anything else. Instead the screen
   asks: which active agent belonging to this workspace has the customer
   research tools installed? That leaves the name entirely to the client —
   "Comax - Internet Customer Research Agent" is what this one is called, and
   the platform never learns the word.

3. **Confidence decides where a finding lands, and the platform decides
   confidence's meaning — not the prompt.** The agent reports what it found,
   how sure it is, and where it came from. Code turns that into either a write
   or a review item. A rule that lives only in a system prompt is a rule the
   model may talk itself out of on a bad day.

4. **Blank beats wrong.** A model asked for a phone number will produce one.
   The instructions make leaving a field empty an acceptable, expected answer,
   and the tool accepts "nothing found" as a result worth recording — so a
   customer whose details genuinely are not online stops being researched
   repeatedly.

5. **Every written value carries its source.** Beside a researched phone number
   the profile shows the site it came from and the date. Without that the CRM
   fills up with values nobody trusts and nobody can check, which is worse than
   empty fields.

6. **One run per customer for backfill, one run per group for prospecting.** A
   run is bounded, retryable and readable in the waterfall, and one impossible
   customer does not take the other thirty-eight down with it. Prospecting is
   per group because the estate is discovered once, not thirty-nine times —
   ten groups is ten runs, not ten runs repeated per member.

7. **It runs on demand, not on a schedule, to begin with.** Anthony sees a full
   sweep and agrees with it before anything runs unattended. Putting it on a
   schedule afterwards is a small change — `triggerType` and the `schedules`
   table already support it.

8. **Only published business contact details.** Named contacts are taken from a
   business's own "contact us" or "our team" page, which is information the
   business publishes about a role. Nothing is assembled from social profiles
   or people-search sites.

9. **A prospect is a row on the same list as a customer, labelled.** Anthony,
   2026-08-01: *"the new record will say 'Customer' to the existing customers
   database and anything it finds can be added as prospects."* One list, one
   profile screen, one search box. A `Customer` / `Prospect` label on every row
   and a filter above the list, because the point of the feature is to see the
   whole estate and the gap in it — not to make somebody remember a second
   screen exists.

10. **The list still defaults to Customers.** The list is used every day to look
    up an account somebody is dealing with. Thirty-nine rows becoming three
    hundred overnight would break that job to serve a different one. Prospects
    are one click away and their count is on the filter, so nothing is hidden.

11. **Only groups already in the import are enumerated.** A site whose parent
    already buys from the workspace is a warm lead with a real argument behind
    it. Searching for care groups the workspace has never dealt with is a
    different product with a different cost, and is not this one.

12. **Prospects are named and located first, not fully researched.** A group of
    twenty-one yields fifteen prospects; researching contact details for all
    fifteen before anybody has decided which are worth chasing spends money on
    sites that will never be approached. A discovered prospect gets its name,
    town, postcode and size. Contact details are researched when somebody asks
    for them, using the same backfill run a customer gets.

13. **The job owns the chain being prospected.** "Find new prospects" is too
    important to rely on the model choosing the right group from memory. When
    the job hands out a chain, every prospecting tool call in that run is bound
    to that chain. Calling "Read a group" with no group name returns the chain
    the job has already claimed; calling it with another group is refused and
    names the current task. Recording a site is checked the same way, so a run
    cannot file prospects against a different chain while the progress bar says
    it is working on this one.

14. **Bedrooms and pupils are report-critical details.** The opportunity report
    can price a prospect per bed or per pupil only when this size number is on
    file; without it, the report drops to a weaker average. Detail jobs therefore
    put customers and prospects missing their size field ahead of lower-value
    contact gaps, the read tool names the size field as the priority, and an
    agent run may only record that bedrooms or pupils are not found when it cites
    a page it actually opened in that run.

## The Trap This Plan Is Mostly About

Ten of the 39 customers belong to a chain. `DAISH'S HOTELS` is nine separate
hotels; `EXCLUSIVE HOTELS` is seven; `COLTEN CARE` is six. An agent that
searches the group name during a backfill finds head office and writes the same
address and the same switchboard number onto nine different customers, and every
one of them looks filled in and correct.

So the first job of every backfill run is identification, not collection:

- Search on the **account name**, which is the individual business
  (`THE DEVONSHIRE HOTEL LTD`), never on the group alone.
- Where the account name and the group name resolve to the same page, that is a
  signal the specific site was not found — not a licence to use the group's
  details.
- A finding may only be recorded once the agent can name the source page and
  that page is about the individual site.

This is stated in the agent's instructions and it is also the thing the first
browser verification is designed to catch, because it is the failure that would
otherwise look like success.

**Prospecting has the mirror of this trap:** filing a site as a prospect when it
is already a customer under a different spelling. `COLTEN CARE - AVON REACH` in
the workbook against "Avon Reach House" on the register is one business, and
getting it wrong puts a rep on the phone to an account the workspace has
supplied for a decade. See *Matching a discovered site*.

## What The Registers Actually Publish

Measured 2026-08-01 by pointing the built page reader at the real pages, not
assumed. This corrects two things an earlier draft of this plan asserted.

**A care home's own page carries its address and its telephone number.** Avon
Reach, one of the Colten Care homes, returns *Farm Lane, Mudeford, Christchurch,
Dorset, BH23 4AH* and *(01425) 272666* against the individual home. That is the
backfill's best source for a care home, and it is exactly what the workbook
cannot supply.

**It does not carry a bed count.** Neither the location page nor its
registration page mentions beds, capacity, places or residents anywhere. The
earlier draft said the register publishes this figure and it does not, so a care
home's bedrooms figure is in the same position as a hotel's: the home's own site,
or nothing. *Decision 12* and the known limits are corrected accordingly.

**A provider page lists that provider's homes, and a group holds several
providers.** `Colten Care Limited` returns eleven homes. But Colten Care is also
registered as `Colten Care (1993) Limited`, `Colten Care (1693) Limited` and
`Colten Care (2009) Limited` — Avon Reach belongs to the 1993 entity, not to the
one that lists eleven. Reading one provider page and calling it the estate would
undercount the group and quietly hide prospects.

So a prospecting run has to find **every** provider registration matching the
group before it enumerates anything, and the coverage line has to be built from
the union. This is the prospecting equivalent of the chain trap: a partial answer
that reads as a complete one.

**Register pages need the whole page, not the article.** The list of a
provider's homes sits outside the main article, so the default page read returns
the navigation and nothing else — while still reporting success. The page reader
now takes a proper yes/no for that setting; it had been declared as text, so a
model sending the boolean silently got the default back and saw an empty list.

## Design

### Where a finding is stored

A new table, one row per subject per field per finding:

`salesDataCustomerResearch`

| Field | Notes |
| --- | --- |
| `companyId` | Leads every index, as everywhere in this vertical |
| `subjectKey` | The customer's `accountNameKey`, or the prospect's own key |
| `subjectType` | `CUSTOMER` or `PROSPECT` |
| `field` | Which detail this is: `phone`, `postcode`, `bedrooms`, … |
| `value` | What was found, as text; parsed on apply for the two numbers |
| `confidence` | `HIGH`, `MEDIUM` or `LOW`, as reported by the agent |
| `status` | `APPLIED`, `NEEDS_CHECK`, `REJECTED`, `SUPERSEDED`, `NOT_FOUND` |
| `sourceUrl`, `sourceName` | The page it came from, and what to call it |
| `reasoning` | One line: why the agent believes this is the right business |
| `runId`, `agentId` | Which run wrote it, so the waterfall is one click away |
| `foundAt`, `decidedBy`, `decidedAt` | When, and who accepted or rejected it |

Indexed by `companyId + subjectKey` for the profile, and
`companyId + status + foundAt` for the review queue.

This one table does two jobs deliberately. An `APPLIED` row is the provenance
behind a filled field; a `NEEDS_CHECK` row is an item awaiting a person. They
are the same record at different stages, and splitting them would mean keeping
two tables honest with each other.

It carries no `importId`. Like the typed-in details it survives a re-import,
because nothing in it came from the workbook.

**Nothing is added to `salesDataCustomers`.** Whether a value was researched or
typed is answered by whether an `APPLIED` research row exists for that field,
which means the CRM's own table is unchanged and a workspace that never runs
the agent carries no trace of it.

### Where a prospect is stored

`salesDataProspects`, one row per discovered site:

| Field | Notes |
| --- | --- |
| `companyId` | Leads every index |
| `prospectKey` | The normalised site name, keyed as accounts are |
| `siteName` | As published by the source |
| `groupNameKey`, `groupName` | The group it was discovered under |
| `customerTypeKey` | Inherited from the group's members, so the extra field works |
| `town`, `postcode` | Enough to place it and to match it |
| `bedrooms`, `pupils` | From the register, where the register publishes it |
| `status` | `NEW`, `DISMISSED`, `CONVERTED` |
| `sourceUrl`, `sourceName`, `foundAt` | Where it came from, as with any finding |
| `runId`, `agentId` | Which run found it |

Indexed by `companyId + prospectKey` for the lookup and dedupe, and
`companyId + groupNameKey + prospectKey` for the group view and the list.

It carries no `importId`, for the same reason the typed-in details do not: an
import must not delete work the import did not create. This is the point that
would be lost by adding prospects to `salesDataAccounts`, which is derived and
is replaced wholesale on every upload.

The contact fields a prospect eventually gets live in `salesDataCustomers`,
keyed on the prospect key exactly as a customer's are. One record shape, one
save path, one set of provenance rules — and conversion becomes a status change
rather than a data move.

### Matching a discovered site

Before a prospect row is written, the site is checked against the current
import's accounts and against the existing prospects. In order:

1. Exact match on the normalised name. Already a customer, or already found.
2. Match on postcode, where both have one. The strongest signal available —
   two care homes do not share a postcode.
3. Name match after stripping the group prefix and the common suffixes the
   workbook uses (`LTD`, `LIMITED`, `HOUSE`, `THE`). `COLTEN CARE - AVON REACH`
   against `Avon Reach House` resolves here.

A match to an account means the site is already a customer, and nothing is
written. A match to an existing prospect updates that row rather than adding a
second. **Anything that matches on name but disagrees on postcode is filed as a
prospect with the conflict recorded**, because the alternative — silently
assuming it is the same business — is the failure that puts a rep on the phone
to an existing account.

The normalisation is the one already used across this vertical, not a second
one written for this feature.

### When a prospect starts buying

The next import that contains a matching account promotes the prospect: its
status becomes `CONVERTED`, and because the details table is keyed the same way,
whatever was researched about it carries straight onto the customer record. No
duplicate row appears on the list, and nobody re-types an address.

This runs in the importer, on the same pass that writes the account directory,
and it is idempotent like the rest of it.

### The three new tools

Registered in the tool library the same way `web.scrape` and
`salesReports.generate` are, and inside the same `template:remove` fence as the
rest of the vertical.

**`salesCustomers.research.read`** — side effect `READ`.

Given an account name key, or nothing at all, it returns one customer: account
name, code, group, customer type, whichever details are already known, which
fields are still empty, and which fields have already been researched and found
to be unavailable. Called with nothing, it returns the next customer with gaps,
which is what makes a sweep possible without the objective carrying a list.

It returns the *empty* fields explicitly rather than making the agent infer them
from absent keys, because a model reading a record with eleven missing keys
will fill in the two it recognises and forget the rest.

**`salesCustomers.research.record`** — side effect `WRITE`.

Takes the subject key, the field, the value, the confidence, the source URL, the
source name and the one-line reason. It does not take a decision about where the
value should go — code makes that:

| Situation | What happens |
| --- | --- |
| Field is empty, confidence `HIGH` | Written to the customer record, row saved `APPLIED` |
| Field is empty, confidence `MEDIUM` or `LOW` | Row saved `NEEDS_CHECK`, field left empty |
| Field already has a value | Row saved `NEEDS_CHECK`, existing value untouched |
| Agent reports nothing found | Row saved `NOT_FOUND`, so it is not re-researched |
| Field is `bedrooms` on a school, or `pupils` on a hotel | Rejected outright — `extraFieldForType` already owns that rule |
| No source URL, or an unreachable one | Rejected outright |

The write goes through the same normalisation `saveCustomerDetails` uses, so a
researched postcode is trimmed and stored exactly as a typed one is.

**`salesCustomers.prospects.record`** — side effect `WRITE`.

Takes the group key, the site name, its town, postcode and size where published,
the source URL and name, and the one-line reason. Code runs the matching rules
above and either writes a new prospect, updates an existing one, or reports back
that the site is already a customer — which the agent needs to hear, because it
is what stops it re-reporting the same six Colten Care homes on every run.

It refuses a group that is not in the current import, which is *Decision 11*
enforced in code rather than in the prompt.

It also refuses a group that is not the chain currently claimed by the running
research job item. The no-name read path resolves from the job item for the run,
not from "the next unsearched group", so the queue, the progress line and the
agent's tools all agree about which chain is being worked.

**Retries do not double-write.** Every tool invocation is keyed on subject, field
and value in the existing `agentToolInvocations` idempotency table, so a step
replayed after a crash records once.

**A person always wins.** When somebody edits a field through
`saveCustomerDetails`, any `APPLIED` research row for that field is marked
`SUPERSEDED` in the same mutation. The provenance marker disappears from the
screen at the moment the value stops being the agent's.

### How the agent is set up

Created by hand through the existing new-agent screen, as a record belonging to
the Comax workspace. No seeding code, because the platform already has a screen
for this and a seeded agent would be one more thing to keep in step with it.

| Setting | Value | Why |
| --- | --- | --- |
| Name | `Comax - Internet Customer Research Agent` | Anthony's wording, and data not code |
| Workspace | Comax | Scopes every tool call to that tenant |
| Internet access | On | It cannot do the job without search |
| Autonomous tool execution | On | Anthony asked for auto-update; see the note below |
| Tools | The three above, plus `web.scrape` | Search comes from the provider, not the library |
| Standing objective | "Research the next customer with missing details" | Makes the Run button work with no instruction |
| Budget | Capped steps, tool calls, runtime and spend | 39 customers and 10 groups must not become an open tab |

**On autonomy.** Switching this on means the agent's writes do not stop for
approval. The brake it replaces is worth naming, and so is what is left: the
agent can only write into empty fields, on one workspace's records, through
tools that refuse anything without a source and refuse any group the workspace
does not already sell to — and every write is attributed, reversible from the
profile, and visible in the run history. That is a deliberately narrow licence,
and it is why the write tools are specific to this job rather than a general
"update the database" tool.

### The instructions it runs on

Written into the agent's system prompt, not into code, so they can be tuned
without a deploy. The substance, for a **backfill** run:

1. You are given one customer at a time: a business name, the chain it belongs
   to, its type, and which details are missing.
2. Identify **the individual business**, never the chain. Most of these belong
   to groups. If you cannot tell which site of a chain you are looking at, find
   nothing and say so.
3. Prefer the business's own website for address, phone and email. Directory
   listings carry numbers that stopped working years ago.
4. The Care Quality Commission register is the best source for a care home's
   address and telephone number — it carries both, against the individual home.
   It does **not** publish a bed count; see *What The Registers Actually
   Publish*. For a school's roll, use the government's schools register. For a
   hotel's room count, the hotel's own site is usually the only source.
5. Register pages hide their real content outside the main article. Ask the
   page reader for the whole page when reading one, or you will get the
   navigation and nothing else.
5. Record each detail separately, with the page you took it from and one line
   saying why you believe it is the right business.
6. Report your confidence honestly. High means the page names the business and
   the detail unambiguously. Anything less is not a failure — it is routed to a
   person instead.
7. If a detail is not published, record that it was not found. Do not infer a
   postcode from a town, an email from a domain, or a room count from a photo.

And for a **prospecting** run:

1. You are given one group, and the sites in it the workspace already supplies.
2. Find **every** registration the group holds before listing anything. A care
   group is commonly registered several times over — Colten Care has at least
   four — and each registration lists only its own homes. One provider page is
   part of the estate, never the estate.
3. Then enumerate. The Care Quality Commission register lists every location a
   provider operates; the schools register lists every school in a trust; a
   hotel group publishes its own list of hotels. Prefer these to a search
   results page.
4. Ask for the whole page when reading a register listing. Its list of sites is
   not part of the main article, and the reader will otherwise hand you the
   navigation while reporting success.
5. Record every site you find, including ones you believe are already supplied.
   You will be told which those are — that is not wasted work, it is how the
   count is kept honest.
6. Record the site's name as the register publishes it, with its town and its
   postcode. Do not go looking for contact details; that is a separate job.
7. If the register and the group's own site disagree on the estate, record both
   and say so in the reason.

### The screens

**Customer list.**
- A **Record** dropdown in the filter row, beside the Customer type and Chain
  dropdowns already there and built the same way: `Customers`, `Prospects`,
  `All`. Anthony, 2026-08-01: *"we need a filter for customer or prospect on the
  customer table too."* It defaults to Customers, per *Decision 10*, and it
  combines with the other two as those already combine with each other.
- A `Customer` / `Prospect` label on every row, so a row read out of the `All`
  view or out of a search result is never ambiguous about what it is.
- The count line above the search box reports both, so the gap is visible
  without changing the filter: *39 customers · 2 with details filled in · 84
  prospects found*.
- A **Fill in what's missing** button, which queues one backfill run per
  customer with gaps, staggered rather than fired at once, and reports how many
  were queued.
- A **Find more sites** button, which queues one prospecting run per group in
  the current import.
- A filter for records with missing details, alongside the type and group
  filters already there. The list already knows `hasDetails`; this makes it
  actionable.

Paginating one list over two tables is the one piece of real work here. The
cursor carries which source it is in and moves from accounts to prospects when
the first is exhausted, so the single `.paginate()` rule still holds and the
guard still passes. The default filter means the common case reads exactly as
it does today.

**Customer profile.**
- A **Find details** button, which starts a backfill run for that record and
  shows its progress, following the Rightmove screen's pattern of queueing a run
  and reporting it started. It works the same on a prospect.
- A researched value shows a small source marker beneath it: the site name,
  linked, and the date. Typed-in values show nothing, as now.
- **Not right** on a researched value clears the field and marks the row
  `REJECTED`, which also keeps it from being found again by the same source.
- A **Needs checking** panel above the details, listing parked findings with the
  value, the source, the reason and two actions: use it, or discard it.
- The chain panel, already built, gains the group's prospects beneath its
  customers, and a line reading *supplying 6 of 21 sites*. That number is the
  argument for the whole second half of this plan, and it belongs where somebody
  is already looking at the account.

**Prospect profile.** The same screen. A prospect has no sales history, so that
section is replaced by where it was found and when, and by a **Not interested**
action that marks it `DISMISSED` and stops it being re-reported.

**Admin.** Nothing new. The runs, the waterfall, the tool calls and the costs
all appear in the Observability screens as any other agent's do.

## Phases

Each phase ships with its own tests and is verified against the real 39-customer
import before it is called done.

1. **The record and the backfill tools.** The `salesDataCustomerResearch` table,
   the read and record tools, the confidence routing, the supersede rule and the
   idempotency key. No UI. Verified by running the agent from the admin chat
   against a handful of customers and reading the table.
2. **The profile.** The Find details button, the source markers, Not right, and
   the Needs checking panel.
3. **The backfill sweep.** The list button, staggered queueing, and the
   missing-details filter. Then a full run across all 39 with Anthony reading
   the results.
4. **Prospects.** The `salesDataProspects` table, the matching rules, the
   prospect tool, and promotion on import. No UI beyond the list label.
5. **The estate.** The Customer/Prospect filter, the merged list cursor, the
   prospect profile, the coverage line on the chain panel, and Not interested.
   Then a full prospecting sweep across the ten groups.

Phases 1 to 3 are useful on their own: they fill in the CRM. Phases 4 and 5 are
where the second job lands, and nothing in them is reachable until the first
three are verified — a prospect is only worth finding once a customer record is
trustworthy.

## Verification

Unit tests, at minimum:

- A `MEDIUM` finding on an empty field parks and does not write.
- A `HIGH` finding on a field that already has a value parks and does not write.
- A bedroom count offered for a school is rejected.
- A finding with no source URL is rejected.
- A replayed tool call writes once.
- A person's edit supersedes the `APPLIED` row for that field only.
- The read tool returns the empty fields, and skips fields already marked
  `NOT_FOUND`.
- The read tool identifies bedrooms or pupils as the priority missing field
  when that number is absent.
- The details job hands out bedroom and pupil gaps before lower-value contact
  gaps.
- An agent run cannot mark bedrooms or pupils as not found unless it cites a page
  it opened in that run.
- A discovered site matching an existing account by name is not written.
- A discovered site matching an existing account by postcode is not written,
  even when the names differ.
- A discovered site matching a name but disagreeing on postcode is written, with
  the conflict recorded.
- A second prospecting run over the same group adds nothing.
- A group not in the current import is refused.
- During a "Find new prospects" job, a no-name group read returns the chain
  currently claimed by that run.
- During that job, asking to read a different group is refused and names the
  current chain.
- During that job, recording a site against a different group is refused, so the
  prospect list cannot drift from the job queue.
- An import containing a prospect's name promotes it and carries its researched
  details onto the customer record.
- A re-import leaves prospects and their details standing.
- The merged list returns customers then prospects across a page boundary
  without repeating or dropping a row.
- The Record filter narrows to each of its three values, and combines with the
  Customer type and Chain filters and with the search box.
- All three tools refuse a record outside the caller's workspace, alongside the
  existing tenant tests in `bola.verticals.test.ts`.

In the browser, against the real import:

- A chain member — one of the nine Daish's hotels — gets its own address and
  its own number, not head office's. This is the check that matters most.
- A care home's address and telephone number match its Care Quality Commission
  page — the fields that register does carry.
- A rejected value clears, and stops coming back.
- A prospecting run on a care group returns its full estate **across every
  registration the group holds**, and the sites already supplied are recognised
  rather than duplicated. Colten Care is the case to run it on: its homes are
  split over four registrations, so a run that finds only eleven has failed.
- The coverage line on a group reads correctly against the register.
- A full sweep completes inside its budget, and the cost is recorded.

## Known Limits

1. **Web data goes stale and the agent cannot tell.** A phone number found
   today may be dead next year. Nothing here re-checks a filled field, and
   nothing dials a number to see whether it rings.
2. **The bedrooms figure is the weakest field in this, for every customer
   type.** The registers do not publish it — see *What The Registers Actually
   Publish* — so a bed count has to come from the business's own website, which
   care homes and hotels alike often do not state. Expect bedrooms to arrive as
   a review item far more often than as a write, and expect many customers to
   end with it marked not found. Pupils is the healthier of the two: the schools
   register does publish a roll.
3. **Hotel groups are the hardest to enumerate.** Care homes and schools sit on
   official registers that list a whole estate; hotels rely on the group's own
   site being complete and current. Expect hotel prospect lists to be the
   thinnest.
4. **Most emails found will be generic.** `info@` and `enquiries@` are real
   addresses but not people. They fill the email field; the named contact stays
   empty unless an actual person is published.
5. **Records are keyed on the name, as the CRM is.** If the workbook renames an
   account, its research does not follow — the same limit, and the same fix, as
   the typed-in details.
6. **Confidence is the model's own judgement.** Code decides what to do with it,
   but not how honest it is. The review queue and the source link are what stand
   behind it, which is why neither is optional.
7. **A sweep costs money each time it runs.** Thirty-nine customers and ten
   groups with search and page reads is small, but it is not free, and it is why
   both sweeps are buttons somebody presses rather than a nightly job.
8. **The estate is only as current as the register.** A home that changed hands
   last month may still be listed under the old provider, so a group's site
   count is a good number rather than a certain one. The source link beside each
   prospect is what makes that checkable.
9. **Nothing scores a prospect.** The list says a site exists, what type it is
   and how big it is. Whether it is worth approaching is a judgement this does
   not attempt.
