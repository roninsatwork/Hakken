# Workspace Customer Research Agent Plan

Last reviewed: 2026-08-01
Status: Planned. Nothing built.
Owner: Anthony

## Scope And Rules

**In scope:** an agent that searches the internet for the customer details the
sales import cannot supply — address, telephone numbers, email addresses, who
to ask for, and the bedrooms or pupils figure the customer type calls for — and
writes what it is sure of straight into the customer record built by the
[Workspace Customer CRM Plan](./workspace-customer-crm-plan.md).

**Out of scope:** researching anything the import already holds (products,
revenue, groups), creating customers that are not in the import, contacting
anybody, and any change to how sales are shown. Also out of scope: a settings
screen for choosing which fields get researched.

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

The CRM shipped with every contact field blank, and it will stay blank unless
somebody types 39 customers' worth of addresses, numbers and contacts in by
hand. The spreadsheet knows who buys what and for how much; it holds nothing
you could ring a customer with. That information is public — these are hotels,
care homes and schools with published contact pages, and two of the three sit
on official registers that publish their size.

The point of the agent is to fill those blanks from the open web, and to be
honest enough about where each value came from that somebody can check it.

## What Already Exists

Measured against the codebase, 2026-08-01, so the plan builds on what is there
rather than restating it:

| Piece | Where it is | State |
| --- | --- | --- |
| The customer record and its blank fields | `salesDataCustomers` | Built |
| The customer list, profile and sales history | `convex/salesDataCustomers.ts`, `/app/<workspace>/customers` | Built |
| Saving typed-in details | `saveCustomerDetails` | Built |
| Which extra field a type calls for | `extraFieldForType` | Built |
| Web search inside an agent run | `allowInternetAccess` on the agent, honoured by all three providers | Built |
| Reading a web page as a tool | `web.scrape`, with the existing address guard | Built |
| Running without stopping for approval | `autonomousToolExecution` on the agent | Built |
| Per-agent spend and step ceilings | `maxSteps`, `maxToolCalls`, `maxRuntimeMs`, `maxCostGBP` | Built |
| Starting a run from a user-facing screen | `convex/propertyAgents.ts`, the Rightmove precedent | Built |
| Run history, waterfall, logs | The Observability screens | Built |

**What does not exist:** any tool that can read or write a customer record, and
anywhere to record where a value came from. Those are the two real pieces of
work, and everything else in this plan is wiring.

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
   research tool installed? That leaves the name entirely to the client —
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

6. **One run per customer, not one run for all of them.** A run is bounded,
   retryable and readable in the waterfall, and one impossible customer does
   not take the other thirty-eight down with it.

7. **It runs on demand, not on a schedule, to begin with.** Anthony sees a full
   sweep and agrees with it before anything runs unattended. Putting it on a
   schedule afterwards is a small change — `triggerType` and the `schedules`
   table already support it.

8. **Only published business contact details.** Named contacts are taken from a
   business's own "contact us" or "our team" page, which is information the
   business publishes about a role. Nothing is assembled from social profiles
   or people-search sites.

## The Trap This Plan Is Mostly About

Ten of the 39 customers belong to a chain. `DAISH'S HOTELS` is nine separate
hotels; `EXCLUSIVE HOTELS` is seven; `COLTEN CARE` is six. An agent that
searches the group name finds head office and writes the same address and the
same switchboard number onto nine different customers, and every one of them
looks filled in and correct.

So the first job of every run is identification, not collection:

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

## Design

### Where a finding is stored

A new table, one row per customer per field per finding:

`salesDataCustomerResearch`

| Field | Notes |
| --- | --- |
| `companyId` | Leads every index, as everywhere in this vertical |
| `accountNameKey` | The customer, keyed as the CRM keys them |
| `field` | Which detail this is: `phone`, `postcode`, `bedrooms`, … |
| `value` | What was found, as text; parsed on apply for the two numbers |
| `confidence` | `HIGH`, `MEDIUM` or `LOW`, as reported by the agent |
| `status` | `APPLIED`, `NEEDS_CHECK`, `REJECTED`, `SUPERSEDED`, `NOT_FOUND` |
| `sourceUrl`, `sourceName` | The page it came from, and what to call it |
| `reasoning` | One line: why the agent believes this is the right business |
| `runId`, `agentId` | Which run wrote it, so the waterfall is one click away |
| `foundAt`, `decidedBy`, `decidedAt` | When, and who accepted or rejected it |

Indexed by `companyId + accountNameKey` for the profile, and
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

### The two new tools

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

Takes the account name key, the field, the value, the confidence, the source
URL, the source name and the one-line reason. It does not take a decision about
where the value should go — code makes that:

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

**Retries do not double-write.** The tool invocation is keyed on account, field
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
| Tools | The two above, plus `web.scrape` | Search comes from the provider, not the library |
| Standing objective | "Research the next customer with missing details" | Makes the Run button work with no instruction |
| Budget | Capped steps, tool calls, runtime and spend | 39 customers must not become an open tab |

**On autonomy.** Switching this on means the agent's writes do not stop for
approval. The brake it replaces is worth naming, and so is what is left: the
agent can only write into empty fields, on one workspace's customer records,
through a tool that refuses anything without a source — and every write is
attributed, reversible from the profile, and visible in the run history. That
is a deliberately narrow licence, and it is why the write tool is specific to
this job rather than a general "update the database" tool.

### The instructions it runs on

Written into the agent's system prompt, not into code, so they can be tuned
without a deploy. The substance:

1. You are given one customer at a time: a business name, the chain it belongs
   to, its type, and which details are missing.
2. Identify **the individual business**, never the chain. Most of these belong
   to groups. If you cannot tell which site of a chain you are looking at, find
   nothing and say so.
3. Prefer the business's own website for address, phone and email. Directory
   listings carry numbers that stopped working years ago.
4. For a care home's bed count, use the Care Quality Commission register. For a
   school's roll, use the government's schools register. Both publish these
   figures. For a hotel's room count, the hotel's own site is usually the only
   source.
5. Record each detail separately, with the page you took it from and one line
   saying why you believe it is the right business.
6. Report your confidence honestly. High means the page names the business and
   the detail unambiguously. Anything less is not a failure — it is routed to a
   person instead.
7. If a detail is not published, record that it was not found. Do not infer a
   postcode from a town, an email from a domain, or a room count from a photo.

### The screens

**Customer profile.**
- A **Find details** button, which starts a run for that customer and shows its
  progress, following the Rightmove screen's pattern of queueing a run and
  reporting it started.
- A researched value shows a small source marker beneath it: the site name,
  linked, and the date. Typed-in values show nothing, as now.
- **Not right** on a researched value clears the field and marks the row
  `REJECTED`, which also keeps it from being found again by the same source.
- A **Needs checking** panel above the details, listing parked findings with the
  value, the source, the reason and two actions: use it, or discard it.

**Customer list.**
- A **Fill in what's missing** button, which queues one run per customer with
  gaps, staggered rather than fired at once, and reports how many were queued.
- A filter for customers with missing details, alongside the type and group
  filters already there. The list already knows `hasDetails`; this makes it
  actionable.

**Admin.** Nothing new. The runs, the waterfall, the tool calls and the costs
all appear in the Observability screens as any other agent's do.

## Phases

Each phase ships with its own tests and is verified against the real 39-customer
import before it is called done.

1. **The record and the tools.** The `salesDataCustomerResearch` table, the two
   tools, the confidence routing, the supersede rule and the idempotency key.
   No UI. Verified by running the agent from the admin chat against a handful
   of customers and reading the table.
2. **The profile.** The Find details button, the source markers, Not right, and
   the Needs checking panel.
3. **The sweep.** The list button, staggered queueing, and the missing-details
   filter. Then a full run across all 39 with Anthony reading the results.

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
- Both tools refuse a customer outside the caller's workspace, alongside the
  existing tenant tests in `bola.verticals.test.ts`.

In the browser, against the real import:

- A chain member — one of the nine Daish's hotels — gets its own address and
  its own number, not head office's. This is the check that matters most.
- A care home's bed count matches the Care Quality Commission register.
- A rejected value clears, and stops coming back.
- A full sweep completes inside its budget, and the cost is recorded.

## Known Limits

1. **Web data goes stale and the agent cannot tell.** A phone number found
   today may be dead next year. Nothing here re-checks a filled field, and
   nothing dials a number to see whether it rings.
2. **Hotels rarely publish room counts.** Care homes and schools sit on
   official registers; hotels do not. Expect the bedrooms figure to be the
   thinnest of the fields, and expect it to arrive as a review item more often
   than as a write.
3. **Most emails found will be generic.** `info@` and `enquiries@` are real
   addresses but not people. They fill the email field; the named contact stays
   empty unless an actual person is published.
4. **Research is keyed on the account name, as the CRM is.** If the workbook
   renames an account, its research does not follow — the same limit, and the
   same fix, as the typed-in details.
5. **Confidence is the model's own judgement.** Code decides what to do with it,
   but not how honest it is. The review queue and the source link are what stand
   behind it, which is why neither is optional.
6. **A sweep costs money each time it runs.** Thirty-nine customers with search
   and page reads is small, but it is not free, and it is why the sweep is a
   button somebody presses rather than a nightly job.
