# Brands, Places and AI Citations

Status: **Built 2026-09-21 and 2026-09-22,** including all four judgments.
One caveat in "What DataForSEO actually sells here": Claude and Gemini are
unproven against the sandbox.
Owner: Anthony

The collection pipeline works. It asks DataForSEO two questions about a host —
what links to it, what it ranks for — and files the answers. This plan is about
the questions it cannot ask yet, and the three gaps in the model that stop it.

Read [One Website, Many Watchers](./websites-and-competitors-plan.md) first.
Everything here builds on its rules and breaks none of them.


> **2026-09-26.** The AI questions (the prompts this plan put on the website)
> are each company's own now; brand names stay on the shared website record,
> as decided here. See [private searches and questions](private-tracking-lists-plan.md).

## The three gaps

**A site has no name.** We know `ronins.co.uk` as a host. We do not know it is
called Ronins, or Ronins Group, or Ronins Agency. Without that, nothing can be
asked about a brand, and AI citation tracking is entirely about brands.

**A site has no place.** Local rank, AI citations and business listings are all
about a host *at a location*. Nothing in the schema holds one. The original plan
says "no countries yet. Everything is UK", which was right when nothing asked.

**The manifest has one cost shape.** Every operation is one call about one host.
DataForSEO also offers one call about a *thousand* hosts, one call about one
page-crawl charged by the page, and one call about one prompt at one place.
Those price differently by orders of magnitude, and the pipeline treats them
identically.

## What does not change

Stated first because the temptation to change it will be strong.

**`websites` stays one row per host.** The dedupe rule is the most valuable
thing in that schema. Nothing here adds an owning company, a per-client note or
an owned-or-tracked flag to it.

**No new tracked kind.** An earlier draft of this plan proposed a `brands` table
alongside `websites`, so that a company could track a brand with no domain.
Anthony, 2026-09-21: *"I think the citations belong to a website."* He is right,
and the simpler model is also the correct one: a website has brand names, and
citations are read against them. There is no second thing to track, no kind
column, and no abstraction over the two. That road is how divisions started.

**Everything stays super admin.** Anthony, 2026-09-21: *"let's make it super
admin for now as I don't fully understand it yet."* Brand editing in particular
is super-admin only, for the reason in Security below.

## Decided in discussion, 2026-09-21

**1. Brand names live on `websites`, not on the join row.**

The test the original plan sets is whether two companies would need different
values. For an owning company, yes. For brand names, no — anyone tracking
`ronins.co.uk` would write down the same three names, because they are facts
about the site rather than about who is watching it. So they sit beside the
host.

This was got wrong once during the discussion and corrected by Anthony: *"These
are brand names for the website."* The wrong version had them on
`companyWebsites`, which would have been per-customer duplication of an
identical list, and would have broken the economics in decision 3.

**2. Up to five names, one of them primary.**

Anthony, 2026-09-21: *"we may need to store up to 5 brand names as ronins is
ronins, ronins group, ronins agency."* Five is the cap, enforced server-side at
save rather than only in the form. One is the primary, because a screen needs a
name to print and a comma-separated list is not a heading.

**3. The prompt is what we buy; the brand is what we read out of it.**

This is the decision that makes AI citation tracking affordable, and it is the
same trick as one row per host.

A citation pull could ask "is Ronins mentioned", which is one purchase per
customer per brand. Instead it asks "who is mentioned for this prompt, in this
place", and the answer names everyone. Every tracked site whose brand appears in
that answer gets a citation from one purchase. Two agencies watching the same
rival pay once between them, exactly as they do for a host today.

It only works because of decision 1. With brands on the join row the same
response would have to be matched per customer for no benefit at all.

**4. Location lives on `companyWebsites`.**

Unlike a brand, two companies genuinely do differ here: a London agency and a
Manchester one watching the same host care about different places. The original
plan already names "a country or language" as belonging on the join row, and
this is that.

One default location per company-website covers AI citations and local rank for
everyone who is not buying a grid.

**5. A rank grid is a child of the join row, not a column on it.**

Sampling one keyword across a lattice of points around a shop is many locations
for one company-website. DataForSEO accepts `latitude,longitude,radius` to seven
decimal places, so this is buildable — and it is one charge per point per
keyword, which makes it the most expensive thing in this document by a wide
margin. It is designed here and deliberately not built; see Not in this plan.

## What DataForSEO actually sells here

Verified against their docs and pricing pages on 2026-09-21, after a first pass
that guessed and got the recommendation backwards. Re-verify before building.

**We never call an AI engine ourselves.** DataForSEO asks them and sells us the
answer. No per-engine keys, no per-engine rate limits, one bill. That removes
most of what would otherwise make this feature hard.

They sell it two ways, and the difference decides the product.

**LLM Responses.** We supply a question, they put it to the engine, we get the
answer back. Four platforms: ChatGPT, Claude, Gemini and Perplexity. Location
targeting on ChatGPT and Claude only. Queued costs about a penny a question per
engine and takes up to 72 hours; live costs less to DataForSEO but passes
through the engine's own token price and answers within 120 seconds. Ten
questions across four engines is roughly 40p per website per collection.

**Only ChatGPT and Claude can be queued.** Every Gemini model and every
Perplexity model is published with `task_post_supported: false`, so those two
are asked live. Found the hard way on 2026-09-22: the sandbox refused queued
requests to both with "this model does not support task_post mode", and the
models pages confirmed it.

**What the sandbox can and cannot prove, 2026-09-22.** ChatGPT queued and
Perplexity live both answered and parsed end to end: the Perplexity answer
produced thirty-two cited sources, filed as citations and shown on the screen.
The sandbox refuses Claude queued under every model name tried, and refuses
Gemini under both the queued and the live path, each with the same
"task_post" message. Their docs say Claude queues and Gemini answers live, so
these two can only be proven with live credentials. Until then the code for
both is covered by tests and unexercised against the service.

**Every engine is asked live. Decided 2026-09-22 by Anthony: "cost is a driver
here for us."** Queued is a flat penny a question. Live is six hundredths of a
cent plus the engine's own token price, and for the cheap models in the engine
table that is about a quarter of a penny — four times cheaper. The plan's
"queued by default" was written before those prices were read. Live also
removes the pingback from this path, at the cost of a worker waiting up to two
minutes per answer, which at these volumes is nothing.

**LLM Mentions.** No question needed. Give it a domain or a brand name, up to
ten per call, and it returns how often that name comes up in AI answers, the AI
search volume behind it, which domains were cited as sources, which other brands
appeared alongside, and — usefully — the actual questions and answers it saw.
About ten pence a request plus a tenth of a penny a row.

**The fact that decides it: ChatGPT data in Mentions is United States and
English only.** The other platform Mentions covers is Google's AI Overviews.

So for a UK business, Mentions is effectively Google AI Overviews, and Responses
is the only way to see ChatGPT, Claude, Gemini or Perplexity for a UK audience.

**Which reverses the obvious answer.** Mentions looks like it should be the
default because it needs no setup and costs a fraction as much. For a US
product it would be. Here it is a cheap discovery layer — Google AI Overview
visibility, plus a source of real questions people are actually asking, which is
exactly what a client who cannot think of a question needs — and Responses is
the product.

That is why the prompts feature built on 2026-09-21 stands, and why the plan
allowance sits on it: Responses is the metered thing.

## The manifest's cost shapes

The registry gains a shape, and the pipeline gains a way to batch.

Today every operation is `one call → one host`. `seoSiteOperations()` derives
that set by looking for operations whose only required parameter is a host, and
expansion makes one pull per host per operation.

Four shapes exist once this plan lands:

| Shape | What it costs | Examples |
| --- | --- | --- |
| **per site** | one charge per host per cycle | ranked keywords, domain rank overview |
| **bulk** | one charge per *thousand* hosts | backlink counts, referring domains, spam score, traffic estimate |
| **per keyword** | one charge per keyword per cycle | SERP position tracking, search volume |
| **per prompt** | one charge per prompt per place | AI citations |

**Bulk is the one that changes the bill.** `bulk_backlinks`,
`bulk_referring_domains`, `bulk_ranks`, `bulk_spam_score`,
`bulk_new_lost_backlinks` and `bulk_traffic_estimation` each accept up to 1,000
targets in a single call. A thousand tracked sites currently costs a thousand
backlink charges a cycle; the same coverage is four calls. Verified against
their docs 2026-09-21.

This needs a real change to expansion. A bulk operation is not one pull per
website — it is one pull per *batch* of websites, and its cycle lines all point
at that one pull. The `reused` flag already expresses "this line did not pay for
its own pull", so the shape exists; what is new is one pull answering many
websites within a single cycle rather than across cycles.

**Rate limits are not the constraint.** DataForSEO allows 2,000 task posts a
minute, 100 tasks per post and 30 simultaneous requests. That confirms
`SEO_BATCH_SIZE = 100` and means throughput will never bound this pipeline.
Money will.

## Records

**`websites`** — gains the only company-neutral thing it has ever gained.

```
brandNames?: [{ name, isPrimary }]      at most 5, enforced at save
```

Nothing else. The row is still a host and the names that host goes by.

**`companyWebsites`** — gains a place.

```
locationCode?: number                   DataForSEO's own location id
locationLabel?: string                  what a person reads: "Leeds, England"
```

Absent means the platform default, which is the United Kingdom, matching the
registry's existing defaults. Absence as inheritance is the same rule the
cadence fields already follow.

**`trackedPrompts`** — what we ask the AI engines, per company-website.

```
companyWebsiteId, companyId, websiteId
prompt: string                          "who is the best plumber in Leeds"
engines: ["chatgpt" | "perplexity" | "gemini" | "claude"]
locationCode?: number                   absent follows the website's
isActive: boolean
createdAt, createdBy
index by_company_website, by_company, by_active
```

**`aiCitations`** — who was named, for one prompt, on one engine, on one day.

```
prompt, engine, locationCode, day
pullId                                  the purchase this was read from
mentionedHost?: id("websites")          when a named site is one we hold
mentionedText: string                   the name as the engine wrote it
position?: number                       where in the answer it appeared
index by_prompt_day, by_website_day, by_pull
```

The row is written per *mention*, not per tracked site, which is what makes one
purchase serve every watcher. A company's screen reads the mentions whose
`mentionedHost` is a site it holds.

## Screens

Four, all super admin, all following the standard: title, description, search,
table, footer.

**Brand names** sit on the global website detail (`/admin/websites/[websiteId]`),
not on a company's view of it, because the list is shared and the screen should
say so. Up to five rows, one marked primary, with help text that says a
two-word name is far safer than a one-word one.

**Location** sits on the company's website detail, beside its cadence override,
because it is that company's choice.

**Prompts** sit on the company's website detail too, beside its competitors. A
prompt belongs to a site — "best plumber in Leeds" is about one shop, not about
a company that owns four.

**Citations** are a new tab under the company's Websites section: which prompts
named us, on which engine, from where, and **who else was named**. That last
column is competitor discovery for free, and it is the reason this feature sells
itself.

## Matching, which is the hard part

Storing five strings is trivial. Reading them out of an engine's prose is not.

**Variants overlap.** A response saying "Ronins Agency" matches both "Ronins"
and "Ronins Agency". The citation counts **once per website**, never once per
variant that hit, or every number on every screen is inflated.

**Short names collide.** "Ronins" is safe. A customer called "Apex" or "Nova"
will match text about something else entirely. Matching is whole-word and
case-insensitive at minimum. The field's help text warns about one-word names
rather than leaving it to a support ticket.

**Matching is pure and tested like the parsers are.** A new file beside
`dataForSeoParsers.ts`, tested against saved engine responses, so a matching bug
is fixed by re-running over stored payloads instead of re-buying data.

**Engine text is data, never instruction.** An AI engine's answer is prose from
a model that read the open web. It reaches the matcher and the citations table
and stops there. No agent is given it, and no field on `aiCitations` carries
free text beyond the matched name itself.

## Security

Everything in the websites plan's Part 3 still holds. Three additions.

**Brand editing is super admin.** The list is shared by everyone tracking a
site, so a careless edit changes what other customers see. Anthony chose
super-admin-only for now rather than an approval flow. Every edit is audited.

**A shared brand list is a small side channel.** Seeing that a host has brand
names tells a reader somebody is tracking it. No list of watchers leaks, and
every screen here is super admin, so this is noted rather than fixed.

**Location is tenant data.** Where a company watches from is a fact about that
company, which is why it sits on the join row and why no query may read it
starting from `websites`. `websiteTenancyGuard.test.ts` already enforces the
direction; this stays inside it.

**Prompts are customer text.** They are sent to an AI engine verbatim, so they
are bounded in length at save and never interpolated into anything but the
request body.

## Build order

1. **Brand names on `websites`,** with the cap, the primary flag and the global
   screen. Audited. No collection yet — this is just capture.
2. **Location on `companyWebsites`,** with the field on the company's website
   detail. Feeds the registry's existing `location_code` parameter, so live rank
   becomes location-aware with no new operation.
3. **The bulk shape in the manifest.** `seoBulkOperations()` beside
   `seoSiteOperations()`, expansion batching websites into one pull, and cycle
   lines pointing many websites at it. This is the one that pays for itself
   immediately.
4. **Prompts,** captured and stored, not yet asked.
5. **The AI citation operations** in the registry, the matcher, the parse into
   `aiCitations`, and the citations screen. **Built and verified against the
   sandbox 2026-09-22**, with two caveats recorded below. **LLM Responses, not Mentions** —
   see the pricing and coverage section: Mentions cannot see ChatGPT outside the
   United States, and Responses is the only route to four engines for a UK
   audience. **Live rather than queued, reversing the call made when this was
   written.** Queued looked cheaper because it passes no engine token cost
   through; the price list, read 2026-09-22, says a live ask on these engines
   costs about a quarter of a queued one. The price is a worker waiting up to
   two minutes, which at these volumes is nothing.
6. **Docs and plan close-out.** **Done 2026-09-22.** The runtime section is in
   `docs/developer/workflow-runtime-internals.md`, the screens and allowance in
   `docs/developer/workflow-automation.md`.

Steps 1 and 2 are independent of everything else and could ship on their own.

## Fan-out searches (built 2026-09-22)

An AI engine does not answer the question it is given. It expands it into
related searches, reads what those return, and writes from that. DataForSEO
returns that expansion as `fan_out_queries` on the same response the citations
are read from, and the parser was discarding it with the rest of the payload.

It is the most valuable field on that response and it costs nothing, because
the answer carrying it has already been bought. A tracked prompt tells a client
whether they were named once; the fan-out tells them the questions the engine
actually went looking for answers to, which is the surface they have to be
visible on.

Rows live in `promptFanOutQueries`, keyed on the question, the engine, the
place and the search, exactly as `aiCitations` is keyed on the question rather
than on a website, and for the same reason: the purchase is shared. The place
is held as the country and city actually sent, because that is what these
endpoints take. One row per search rather than one per collection, counting
appearances, because what matters is which searches keep coming back;
`lastPullId` is what stops a re-parse counting the same answer twice.

A fan-out search is a search, so it goes through `seo.keyword-intent` — the
same judgment and the same shared store the rankings screen reads, so a phrase
met on both is judged once and paid for once. The screen is
`.../site/[companyWebsiteId]/fan-out`, most persistent first.

**Not covered.** Google AI Mode returns references and citations but no
sub-queries, so this is a signal from the engines asked through LLM Responses
only, and which of the four populate the field is unproven against the live
service. Raw payloads are swept after thirty days, so fan-outs from collections
older than that are gone; anything newer could be back-filled by re-parsing.

## Judgments, through the Decisions framework

Status: **all four built 2026-09-22**, each switched off, each with the code
fallback named below. Nothing is owed on them.

Read [Decisions](./decisions-typesafe-plan.md) first. Jev is already a provider
here, behind a framework that declares each judgment in code
(`convex/decisionRegistry.ts`), asks it with a state object and a fixed answer
set (`runDecisions`), lets an admin switch it on or off, traces it on the
observability screens, and answers it with any model rather than only TypeSafe.
Twelve Decisions exist and ship switched off. So none of this is an
integration: it is entries in a registry that already handles budgets,
fallbacks, audit and screens.

One rule from that plan binds everything below. **A Decision ships switched off
and must work with a code fallback**, so every entry here names the default
that keeps its screen honest with no model at all.

Volume is not a reason to hesitate. A Decision costs a fraction of a penny, no
company is on a Decision budget, and spend lands on the ledger and the cost
screens like every other model call. Anthony, 2026-09-22: "Decisions are super
cheap and no company has a budget, it's virtually free to use." So the
judgments below are asked about every row that needs one, and the batch sizes
in the code are request shapes, not spending limits.

Where Jev does not belong, so nobody reaches for it there: matching brand
names in text is exact string work and stays in `utils/websiteBrands.ts`; costs,
schedules, queues and dedupe are rules; and nothing here writes a word a
customer reads.

Discussed 2026-09-22. In the order worth building.

**1. Was the brand recommended, or merely mentioned?** Built: `seo.citation-stance`,
judged in `convex/seoJudgments.ts`, stored as `stance` on `aiCitations`. The highest-value
change on this list, because it changes what the citations screen *means*.
Today "named second" means the brand string appeared; an answer saying "avoid
Ronins Agency" counts as a citation. One Choice over the answer text and the
matched name — recommended, mentioned neutrally, warned against — asked once
per brand found, several brands riding one request over the same answer. This
is TypeSafe's own citation-check pattern almost line for line. Fallback:
"mentioned", which is what the screen says today. Below "sure", the pill reads
"mentioned" and the answer's stance is left unclaimed rather than guessed. The
answer text reaches the model as state and is still never stored.

**2. Is this unknown name the rival we already track?** Built: `seo.same-business`,
with the code-side pairing in `convex/utils/websiteBrands.ts`. The citations page
shows "Acme Plumbing" and `acme-plumbing.co.uk` as two strangers. Code pairs
each unmatched name with the tracked hosts it could plausibly be — shared
words, shared domain stem — and one Score per pair with three levels, same,
possibly the same, different, decides. Nearest level names the outcome; only
"possibly" goes to a person. TypeSafe's entity-alignment cookbook, level for
level. Fallback: different, which is what the screen shows today. A confirmed
match is recorded as a brand name on the rival's shared record, so it serves
everyone.

**3. Which discovered competitors are real rivals?** Built: `seo.real-competitor`,
over `discoveredCompetitors`, with accept and dismiss on the screen.
DataForSEO's competitor
discovery returns dozens of domains that share keywords, many of them
directories, marketplaces and publishers. One Choice per candidate — direct
competitor, marketplace or directory, publisher, unrelated — before a client
sees the list. Fallback: shown unfiltered, labelled as unjudged.

**4. Which ranked keywords are worth tracking?** Built: `seo.keyword-intent`,
stored in `seoKeywordIntents` and shown on the site's keywords screen.
Thousands come back per site
and each tracked one is a paid task per collection. One Choice per keyword —
buying intent, researching, branded, irrelevant — picks the few hundred worth
position-tracking, which also protects the plan meters. Fallback: none tracked
until a person chooses.

Each is a Decision entry with `usedIn: "seo"`, a new value on that union, and
copy under `decisions.catalogue`. Cost is per token at roughly 150 milliseconds
a call; judging one answer for four brands is one request.

**The principle, from Anthony, 2026-09-22: use Jev wherever it makes sense
and as much as possible, because it is far cheaper than a text model.** So all
four were built, not just the first, in that order: the first changed what a
screen means and taught the framework's behaviour on our data, and the two with
volume came last. Where a judgment would otherwise reach for a text model, a
Decision is the default answer and a text model needs a reason.

**What the two high-volume ones actually cost.** Keyword intent is judged once
per distinct phrase and kept forever, so two clients in the same trade share
every answer and a site's second collection asks nothing new. A first
collection judges everything it found, in calls of fifty, and stops early if a
whole call comes back from the rules. Competitor judging is bounded by how many
domains discovery returns. Neither is capped for money.

## Open questions

Recorded as open rather than quietly decided. Each changes code. Two of the four
were settled on 2026-09-21 and are struck through with what was decided.

1. ~~**Who writes the prompts?**~~ **Decided 2026-09-21 by Anthony: admins and
   clients write them.** Not generated, so the collecting agent gains no new
   job. LLM Mentions returns the questions it actually saw being asked, which is
   the obvious place to draw suggestions from later without generating anything.
2. ~~**Is a brand variant tagged as correct-or-misspelling?**~~ **Decided
   2026-09-21 by Anthony: yes.** A variant carries what it is, so a citation
   under a wrong spelling is a different fact from one under the right name.
   "Mentioned 40 times" becomes "40 times, 6 of them under the wrong name",
   which is something a client can act on rather than just read.

   What it costs to build: a `kind` beside `name` on each brand entry, a second
   column on the brand names panel, and a field on the citation recording which
   variant matched. The matcher already reports the matched name, so it is the
   recording that changes rather than the matching. Absent reads as a correct
   name, so the entries saved on 2026-09-21 need no migration.
3. **The five meters.** Sites tracked is effectively free. Keywords tracked,
   locations tracked, prompts tracked and pages crawled each cost real money and
   scale differently. A plan needs a number for each; one number cannot cover
   them. This blocks sizing, the spend cap and pricing.
4. ~~**Do competitors get citations too?**~~ **Decided 2026-09-21 by Anthony:
   yes.** Reading a rival's mentions out of a response already bought costs
   nothing at all — the answer names whoever it names, and skipping the names we
   recognise would be throwing away the most useful column on the screen.

   What it means in practice: a competitor is a `websites` row like any other,
   so it can carry brand names, and the matcher runs over every tracked host in
   the answer rather than only the one the question belonged to. A client sees
   "you were named second, these three rivals were named above you", which is
   the sentence the product exists to write.

   It also means brand names on a competitor's record matter, and nobody has a
   reason to fill them in except the client watching that competitor. The brand
   names panel is already on the global website screen for exactly this, and it
   is already shared, so one client filling them in serves everyone.

## Not in this plan

**Rank grids.** Designed in decision 5, not built. One charge per point per
keyword makes it the most expensive thing available, and it needs the meters
question answered first.

**OnPage crawls.** Task-based, charged per page, and a different cadence from
everything else. It fits the existing pipeline unchanged — it is queued with a
pingback — but it needs a per-plan page budget, which is question 3 again.

**LLM Mentions as a discovery layer.** Cheap, needs no setup, and returns the
questions people really ask plus who is cited alongside a brand. Worth having
after Responses, not before, and it is a third bulk shape at ten targets a call.

**Retail and local listings.** Merchant for Google Shopping and Amazon, Business
Data for Google Business Profile, Trustpilot and TripAdvisor, App Data for the
app stores. All wanted, none modelled. Each needs a target that is not a
website, which is the one thing this plan deliberately does not introduce.

**Non-UK locations at scale,** beyond the single location field above.

**Customer-facing screens** for any of it.
