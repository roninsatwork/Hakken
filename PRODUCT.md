# Hakken — Product Vision & Specification

> **This is the single source of truth for what Hakken is.** Every other
> document in this repository defers to it. If another file appears to describe
> the product, it is either a narrower view that links back here, or it is out
> of date and should be corrected rather than allowed to disagree.
>
> **How to read it.** Part One is the vision and commercial strategy. Part Two
> describes only what is implemented and verifiable in the codebase — which
> today is the inherited platform foundation, not Hakken product surface. Part
> Three, "Not Built Yet", holds everything planned, and nothing above it is
> described as though it exists.
>
> **Hakken** (発見, *hakken*: discovery). This repository is a clone of Sonae,
> taken on 2026-09-21. Sonae is Ronins' general-purpose agentic application
> framework and continues to exist and be maintained separately; Hakken is the
> product built on that foundation, developed here and only here. Code
> identifiers, deployment names and user-facing strings are all `Hakken`; the
> integrations outside this repository that still expect the old names are
> listed, with what to reconfigure, in §33.
>
> Platform sections last verified against the code on 2026-09-13. Vision last
> updated 2026-09-21 from `docs/product/app-vision-v2.md` (v2.3).

---

# Part One — The Vision

## 1. What Hakken Is

Hakken is a platform, run first as a Ronins service and sold as software to
businesses and their agencies, that works out which of a business's digital
assets make money and why the rest don't — found, visited, converted, enquired
or ordered, won — then fixes the broken stage, whether that's the AI assistants
not choosing it, Google not ranking it, a feed or listing saying the wrong
thing, no independent corroboration, or the page not converting, and proves the
result in leads and sales rather than positions or mentions.

**Why now.** Customers no longer only search and click. They ask ChatGPT,
Gemini, Perplexity or their phone and get one answer with two or three names in
it; they let a shopping assistant compare products; increasingly they let an
agent complete the task. Ranking first no longer means being cited, being cited
no longer means being chosen, and being chosen still doesn't mean the page
converts. Every tool in the market measures one of those stages. None measures
the chain, and none says what any stage was worth.

Three things make the product possible now. A model can read an asset, spot
what's wrong and write the correction. An agent can push the change through an
API or, where there isn't one, a browser. And DataForSEO sells the answer data —
cited and chosen, per engine — that shows whether it worked. The loop that
needed a person at every step now needs a person at one click.

## 2. Who It's For

Three customers, one product.

* **E-commerce retailers** who want more sales. The assets are product pages,
  feeds, Merchant Center listings, marketplace listings, review profiles,
  shopping-assistant presence and ad campaigns. The chain ends in orders and
  revenue.
* **Businesses that need leads** — professional services, B2B, home-services
  companies, clinics, agencies' own clients. The assets are service pages,
  Google Business Profile, directory and review profiles, third-party mentions
  and ad campaigns. The chain ends in enquiries and won work.
* **Agencies**, running it on their clients. The workspace belongs to the
  business; the agency has manager access, like Google Ads. An agency signs up
  and adds clients, or a client signs up and invites their agency. Same product,
  priced per business, agency margin on top. Because the asset P&L stays with
  the business when the agency changes, it becomes the honest record of whether
  the agency is earning its fee — a reason for good agencies to adopt it and for
  clients to insist on it.

**Not for:** enterprise brands (Profound's and Peec's market), micro-businesses
and sole traders on free website builders (Wix and Squarespace give them a score
for nothing), and anyone wanting a rank tracker.

## 3. What It Does

**The unit is the asset, and the question for every asset is whether it makes
money.** An asset is anything the business owns or rents that could produce a
lead or a sale: a page, a product listing, a feed, a Google Business Profile, a
paid directory or marketplace listing, a review profile, an ad campaign, a press
mention, a citation in an AI answer. Each costs something in money or effort and
each either returns or doesn't. If it doesn't, it's one of three things: nobody
finds it, people find it and don't act, or they act and it's the wrong enquiry
or the basket is abandoned. The platform diagnoses which, fixes it and measures
the result.

This answers questions no visibility tool can. "Is the marketplace listing worth
the commission?" "Is the directory worth £1,200 a year?" "Should we keep paying
for the ads?" Unanswerable from a rank tracker; trivial from an asset P&L.
Nobody selling visibility can tell a business where to stop spending; a firm
can, and so can we.

* **Every asset carries a P&L.** Found (ranked, cited, chosen, impressions) →
  visited → converted → enquired or ordered → won. Each stage is a number from a
  connection, and the alert fires wherever the chain breaks, with the diagnosis
  and the fix for that stage.
* **Cited and chosen are different states.** Monitoring records both, per
  engine. The same brand is routinely cited by Gemini and ignored, chosen by
  ChatGPT and uncited. Only chosen pays. "Share of AI decisions" — how often the
  business is the chosen option across its prompt set — sits on the front page
  next to leads and sales.
* **CRO, done honestly.** Most clients won't have the traffic for split tests
  that reach significance, and the platform doesn't promise them. Conversion
  work means the page or product listing reviewed against what converts in that
  category, changed, and measured before-and-after on a rolling window — and,
  before any of that, getting measurement right. Many clients arrive with GA4
  counting nothing useful; the measurement plan and conversion tracking are a
  day-one onboarding skill.

Positions and mentions are leading indicators for an asset's return, not the
score.

## 4. The Loop

One loop, run every week, for every business.

* **Collate.** Everything about the business's assets in one record, pulled
  weekly: what the assistants say and cite, what Google and Bing say, Search
  Console, GA4 and order data, the Google profile, feeds and listings, reviews,
  mentions, crawler logs, ad accounts, the CRM. A marketing lead today has this
  across a dozen logins and reads none of it.
* **Advise.** The platform reads the record and says what it sees, in plain
  English, every week — the consultant's monthly call, done weekly, from the
  data.
* **Alert.** KPIs set at onboarding (leads or orders, share of AI decisions,
  Google visibility, conversion rate, review score, feed and listing accuracy)
  each with a band. When one leaves its band the client hears the same day.
  Every alert carries four things or it doesn't send: what changed, why we think
  it changed, what to do, and what to expect.

  > "Your best-selling product page dropped from 4 to 12 on 28 August. Two
  > competitors moved above you; both added a comparison table and same-day
  > delivery, and your page has neither. Three fixes, drafted, in order. Approve
  > and they go live today. Expect movement in two to three weeks; we'll tell
  > you either way."

* **Do.** Every piece of advice ends in a button. Fix this, draft that, approve
  this. On the Ronins service, Ronins presses it; on self-serve, the client or
  their agency does. Fixes fall into five categories: the business's own pages
  and listings; the record pushed to feeds, profiles and directories;
  independent corroboration (§6); conversion changes; and, later, ad spend.
* **Prove.** Rerun the prompts. Show the change per engine and per asset. Tie it
  to impressions, sessions, enquiries, orders and revenue. Report in money.
* **Learn.** Log every change against every result, across every business, so
  the system knows which fixes move which engines in which categories — the map
  nobody else has.

## 5. The Business Record, Decision-Ready From Day One

The record holds what an assistant needs before it can recommend, not just what
a website needs to say: suitability (who it's for), price, availability,
features and attributes stated the way alternatives state theirs, location and
coverage or delivery, policies (guarantees, returns, cancellation, response
times), reputation (independent evidence), and comparability.

If the record holds those cleanly, being chosen is a consequence of the record
rather than a later project, and the agent-facing endpoint in phase 5 is just
the record made callable.

## 6. Corroboration And Digital PR As A Fix Category

What the wider web says about a business weighs more with the assistants than
what it says about itself. For lead-driven businesses and retailers alike,
independent evidence — press, reviews, trade and specialist publications,
communities, partner pages — is a primary lever for being chosen.

The platform runs this as an agent lane, lifting the open-source Newsjack skills
where they fit: detect stories the business has genuine standing on (local,
trade and category press, not the morning's national headlines), check
newsworthiness, generate the angle, find and fit-check the one journalist per
outlet who'd care, fact-check before sending, track coverage when it lands.

Press coverage is an asset like any other: it earns its place in the P&L when
the placement gets cited or produces a lead, not when the clipping arrives.

## 7. Prompt Panels, Built Properly

Every tool's monitoring is only as good as its prompt set, and most are written
by whoever set the account up. The platform builds panels the way the Newsjack
AI-visibility skills specify: buyer-intent analysis from real customer, review,
forum and search evidence; prompt variants written target-blind so the panel
doesn't flatter the client; QA for contamination and answer leakage; a versioned
panel with aided and unaided denominators kept separate; no invented "visibility
score". The panel is an asset in the record and is re-derived as the business
changes.

## 8. It Behaves Like A Firm, Not A Tool

What a client pays an agency for is not labour but accountability, and the
platform has to do what a good firm does: onboard with an interview rather than
a form; set a ninety-day plan in plain English; log every change like a
timesheet with before and after; ask permission for what matters and not for
what doesn't; send a weekly note and a monthly report by email; chase the client
when it needs something; answer questions from the ledger with an action
attached; roll back and say so when a change didn't help; put a human behind a
button; review itself every quarter against what was promised.

The end state is being able to sell an outcome — "chosen by two of five
assistants for your core prompts within ninety days, or you don't pay" — which
no agency can afford to promise and no dashboard can promise at all. The first
ten clients are the experiment that sets the number.

## 9. Integrations Are The Strategy, Not The Plumbing

Every account a business connects makes the platform stronger three ways: the
collate layer sees more, so the advice gets sharper; the switching cost rises;
and the panel learns faster. Integrations are added in rings, each justified by
an alert it enables or a fix it lets us make.

* **Ring one — the two launch loops.** *Shared:* DataForSEO AI Optimization and
  SERP; Search Console; GA4; Bing Webmaster; Google Business Profile; Companies
  House; the client's own site (crawl and CMS write); the CRM or order system.
  *Lead-gen:* the directories and review profiles that matter for the category,
  read by scraper and written by API or browser agent. *E-commerce:* Google and
  Bing Merchant Center and product feeds; Shopify, WooCommerce or the platform's
  admin API; product schema; marketplace listings (Amazon, eBay); review
  platforms; ChatGPT Shopping and the Agentic Commerce Protocol feed.
* **Ring two — commercial.** Google Ads, Meta Ads, OpenAI Ads and Google AI Mode
  ads, because "you've lost the organic slot to a competitor's ad" needs the ad
  data and leads into the ads line; the email platform, for review requests and
  win-backs; Medialyst or equivalent for the PR lane's news index and journalist
  data.
* **Ring three — operations.** Call tracking, booking and diary systems, job
  management, fulfilment and returns data — whatever closes the chain from
  "enquired or ordered" to "won" in that category.

The full source-by-source map, with read/write access, cost and priority per
source, is in
[docs/product/data-sources-and-integrations-sept-2026.md](./docs/product/data-sources-and-integrations-sept-2026.md).

## 10. How The Engine Is Built

**Four roles, never mixed:**

1. **Code counts** — word counts, dates, schema detection, URL parsing,
   arithmetic.
2. **A decision model decides** — named, implied or absent; cited or chosen;
   source type; page fit; listing consistency; review triage. Typed answers with
   a confidence, at a fraction of a cent, so every asset and every citation is
   judged every week rather than sampled.
3. **An LLM writes** — buyer questions, rewrites, the one-line reasons.
4. **A human approves.**

The decision layer is abstracted so the model behind it (TypeSafe's Jev at
launch, via OpenRouter) is swappable. Every decision carries its confidence:
under 0.6 goes to a human, 0.6 and up is used for sorting, above 0.85 is
required before anything touches a live asset; a hand-labelled set of a few
hundred items is built before any of it is trusted. Page text and AI answers are
untrusted input and are kept in their own fields, separate from the record and
the instructions.

Around those roles: **connections** (each source an MCP server or equivalent,
OAuth once, tokens vaulted), **skills** (each analysis and each fix a written
playbook — Cogny's fifty for SEO, GA4, ads and email and Newsjack's thirty for
PR and panel design lifted and adapted; the ones that don't exist, written), a
**scheduler** (weekly collate and advise, daily alert checks, monthly review,
event triggers), and an **approval queue** (every fix a y/n with before, after
and expected effect, logged to the ledger against what happened next). Anything
a human does twice becomes a ticket.

**How it learns.** A decision model is literal, so the rubric is the asset.
Every rubric — is this listing consistent with the record, does this page answer
the buyer's question in its first lines, is this the right internal link, is
this review worth a reply — is tuned mechanically: the cheap model runs wide, a
stronger model referees a sample of the cases where they disagree and rewrites
the rubric, and the run repeats. Two such passes have been shown to lift
agreement from 45% to 65% for a one-off cost in the low tens of dollars. Every
client's run sharpens the rubric for the next client, which is what turns the
panel from a pile of data into a compounding asset.

**Fixes are proposed within bounds.** The same experiment saw a human editor
keep 287 of 679 machine-proposed links on the builders' own site with a tuned
rubric — a 58% rejection rate. So the approval queue is load-bearing, not
decorative, and fixes are proposed only inside limits a human has already
accepted (links only on words the page already has, price changes only from the
record, descriptions only in the client's stored voice). Bounded proposals raise
the approval rate and lower the risk; approval and rejection both feed the
rubric.

**This maps onto the existing platform.** The inherited foundation already
provides the tenancy model, the agent runtime with its audited step/tool/cost
ledger, the tool governance and approval gate, the workflow scheduler, and the
model-agnostic provider layer described in Part Two. The Hakken engine is those
primitives pointed at a new domain, not a new runtime.

## 11. Multi-Tenant From Day One

Workspace per business; roles for the business's own people, its agency and
Ronins; an agency view across all its client workspaces; white-label on the
reports and the client-facing surfaces; the ledger and the record owned by the
business and portable if the agency changes.

This is phase-one scope because agencies are a launch customer, not a later
channel. The platform's existing three-role tenancy (§14) is the starting point;
the agency role and the cross-workspace agency view are new.

## 12. The Moat

**Why nobody's here.** The asset P&L is unclaimed for three reasons. It's hard
in an unglamorous way: the bottom of the chain needs event setup, call tracking,
order and CRM links done properly per client, and the middle needs feeds,
listings and browser agents kept working. It threatens the people best placed to
build it: visibility tools sell mentions and would be admitting mentions aren't
the point; agencies sell activity and would be handing clients the evidence to
cancel. And the data to close the loop only just became cheap.

The first two won't change soon. The third lets someone else in, and the two who
could are HubSpot (owns the CRM, now sells AEO monitoring) and Google (owns the
profile, the ads and the analytics). Neither will do the integration grind or
put a human behind a button. The practical moat is a year of asset P&Ls across a
few hundred businesses before anyone big turns this way — a panel nobody can
buy, and the thing that makes the product worth acquiring.

**What accumulates.** The record of what works, across every client. The
switching cost of the record, the integrations and the attribution running
through us. The integrations nobody wants to maintain. And, for agencies, the
fact that their clients' P&Ls live here.

## 13. What We Don't Build

A crawler of the open web, a backlink index, a keyword database, a SERP index or
an AI-answer index — DataForSEO supplies all of those, pay-as-you-go, and it's
their business to keep them current; we crawl only the sites we own or monitor.
Ahrefs' or Semrush's full surface. A monitoring-only product. Anything for
enterprise brands. A $9 bring-your-own-model tier. Anything a human has to do
twice without it becoming a ticket.

## 14. The Competitive Picture In One Paragraph

Profound, Peec and the venture-backed tools own enterprise and mid-market
monitoring and are adding "actions". Cogny sells a growth-automation engine to
marketing teams with GEO as a Bing proxy and nothing on assets or outcomes.
BrightLocal has announced monitoring, listings and content for local agencies
and hasn't shipped it. Cheers runs done-for-you local visibility for large US
service brands. James Dooley's stack — SEO, SMO, AEO, GEO, DEO, SXO — is the
best public map of the layers, and it ends at "be chosen". Nobody joins the
chain from chosen to converted to paid, per asset, for businesses and their
agencies, and nobody tells them what each asset returned. That's the gap.

The full landscape, with funding, pricing and a feature matrix across forty
products, is in
[docs/product/ai-visibility-landscape-sept-2026.md](./docs/product/ai-visibility-landscape-sept-2026.md).

## 15. Two Doors, One Engine — Service First

* **Ronins done-for-you.** £1,000 to £3,000 a month for a lead-driven business
  or a retailer, more for multi-site or multi-brand; a Ronins person approves
  changes, does the monthly call and stands behind the number. Launches first,
  on five to ten clients from Ronins' own network, and pays for the build. Cost
  to serve including the human is £100 to £300 a month.
* **Software.** £149 to £499 a month per business, tiered by assets and
  connections, priced below the point where anyone would build it themselves;
  agencies get a margin per client workspace. The client or agency presses the
  buttons. Opens once the two loops have run for a month without a human
  touching them. Sold as Hakken, separate from Ronins; that separation is a
  condition of selling to agencies.

## 16. Business Model And The Numbers That Matter

The first target is **£30k a month**: ten to twenty service clients, or roughly
a hundred software workspaces, or a mix. On the economics model's cost lines
(data and compute £20 to £80 a month per workspace; the human is the only
material cost), the service runs at 75 to 90% gross margin and the software at
70 to 90%. Fixed costs are modelled at £33.5k a month. Year two adds managing
the client's ChatGPT and Google AI Mode ad spend from the same record, now that
both are live in the UK.

## 17. Phases

| Phase | Scope |
|---|---|
| **0 — two tests, two weeks** | Twenty UK prompts per launch category through DataForSEO's sandbox (billable rows, coverage, cited-versus-chosen). Twenty interviews with retailers, lead-driven businesses and agencies, plus a free-scan page leading to a booked call. Protocols in the research-gaps report, re-cut for these customers. |
| **1 — the engine, both loops, multi-tenant** | Record, collate-advise-alert, ledger, weekly note, approval queue; the lead-gen fixing loop and the e-commerce fixing loop; workspace-per-business with agency and Ronins roles. Ronins runs it on five to ten paying clients across both customer types. |
| **2 — proof and the promise** | Measure per-engine lag and money movement on the phase-one clients. Set the guarantee from the data. Case studies. Hakken brand, domain and trademark. |
| **3 — agencies and software** | Open the software door under the separate brand; agency onboarding with client import; white-label reports; partner terms. |
| **4 — corroboration, PR and ads** | The Newsjack-derived PR lane as a standard fix category; ad-account connections and the ads line. |
| **5 — the agent-facing endpoint** | Expose the record to assistants directly — quote, availability, order, callback — so the agent's task completes with us. |

## 18. Principles

* The unit is the asset; the question is whether it makes money. Positions and
  mentions are leading indicators, not the score.
* Cited and chosen are different states; only chosen pays.
* Collate, advise, alert, then do. The view on the data is the product; the fix
  is the follow-through.
* Every alert says what changed, why, what to do and what to expect, or it
  doesn't send.
* The record belongs to the business, not the agency and not us.
* The client's own assets are the one source no engine can drop; the work there
  is never optional.
* Prose over dashboards. A human does nothing twice. Every change is logged,
  reversible and attributable.
* Learned, not assumed: source weights, prompt panels, fix priorities and the
  rubrics themselves come from the data, updated weekly; the rubric is the
  asset.

**How to apply this when building.** Judge a change by "does this move an asset
further along its P&L, and can we prove it did", not "does this add a number to
a dashboard". Base-layer capability that every client workspace would otherwise
need built for itself beats a feature that serves one screen.

## 19. Open Questions

* The billable-rows number and UK cited-versus-chosen coverage from DataForSEO
  (phase 0).
* The guarantee window per engine and per category (phase 2).
* Whether to hold directory and marketplace logins or use a session model
  (solicitor, phase 1).
* Medialyst's terms before the PR lane depends on it.
* Trademark and domain clearance for Hakken.
* Whether OpenAI's ad terms allow third-party management as the UK self-serve
  beta matures.

## 20. The Research Set

Part One is a summary. The reasoning, the evidence and the numbers behind it
live in [docs/product/](./docs/product/index.md):

| Document | What it settles |
|---|---|
| [app-vision-v2.md](./docs/product/app-vision-v2.md) | The vision in full (v2.3, 20 Sept 2026). This section of PRODUCT.md is its summary; where they differ, the vision document is the later word on strategy and this file is the later word on what is built. |
| [ai-visibility-landscape-sept-2026.md](./docs/product/ai-visibility-landscape-sept-2026.md) | Forty competitors by tier, funding, pricing, feature matrix, unit economics, and where the gap is. |
| [data-sources-and-integrations-sept-2026.md](./docs/product/data-sources-and-integrations-sept-2026.md) | Every data source by layer, read/write access, cost, priority, legal exposure, and the recommended build order. |
| [research-gaps-closed-sept-2026.md](./docs/product/research-gaps-closed-sept-2026.md) | Market size by vertical, platform risk, incumbents' roadmaps, the legal position, and the two live test protocols (appendices A and B). |
| [research-note-dooley-search-stack-sept-2026.md](./docs/product/research-note-dooley-search-stack-sept-2026.md) | The six-layer SEO/SMO/AEO/GEO/DEO/SXO frame, and where "decision-ready" and "share of AI decisions" come from. |

---

# Part Two — What Is Built Today

> **Read this section as inherited capability, not as Hakken.** This repository
> began as Sonae, Ronins' agentic application framework. Everything below is
> implemented and verifiable in the code, and all of it is foundation that
> Hakken builds on. **None of it is Hakken product surface.** There is no asset
> record, no DataForSEO connection, no prompt panel, no cited/chosen monitoring
> and no asset P&L in this codebase today — see Part Three.

## 21. Multi-Tenant Architecture & Governance

Three roles, enforced server-side in Convex rather than in the UI:

* **Super Administrators.** Global oversight: onboard workspaces, set the global
  system prompt, view platform-wide analytics, and impersonate a tenant to
  troubleshoot. Impersonation is stored server-side on the user record, never
  claimed by the client, and is written to the audit log.
* **Workspace Tenants (Companies).** Administrators are scoped to their own
  `companyId` for logs, agent configuration, and knowledge.
* **End Users.** Can use deployed agents and manage their own profile. No access
  to admin surfaces, billing telemetry, or agent configuration.

**How isolation is enforced, precisely.** Every client-callable Convex function
must be declared with a builder from `convex/tenantFunctions.ts` — `tenantQuery`,
`adminMutation`, `superAdminQuery`, and so on — which authenticates the caller
and resolves `companyId` *before* the handler is entered. A function declared
this way cannot run unauthenticated.

This is **structural, not conventional**, and it fails CI rather than review:
`convex/authzEnforcement.test.ts` asserts which builder declared each function,
a syntactic fact with no false positives. Functions that predate the rule sit in
a migration allowlist that may only shrink; every new function must use a
builder. Deliberately open surfaces are declared as such with `publicQuery` /
`publicMutation`, so an open endpoint is a recorded decision rather than an
oversight.

*For Hakken:* this is the workspace-per-business model in §11. The agency role
and the cross-workspace agency view do not exist yet.

## 22. The Intelligence Orchestrator

* **Model-agnostic by design.** Four providers are wired in — **Google Vertex,
  Anthropic, OpenAI, and OpenRouter** — and a model is chosen from a database
  catalogue rather than hardcoded at runtime. The OpenRouter catalogue is
  synced into the platform by a super-admin action, which is what turns "a few
  configured models" into a large library; OpenRouter alone publishes several
  hundred. The catalogue is built to scale, holding up to 2,000 rows with
  database-side paging and filtered search indexes.
* **Agent execution runs on all four providers.** Each has an adapter that
  handles tool calling, so an agent is not confined to one vendor. An
  unsupported provider fails at the registry with a message naming the model,
  rather than deep inside a provider call.
* **Dynamic Model Resolution.** Administrators choose which configured model
  serves each use case without a code deployment.
* **The Behavioural Rule Engine.** Workspaces configure rules (for example,
  "if the user asks about pricing, do not quote figures") that are aggregated by
  priority and injected into the system instruction. **Rules apply to the
  assistant chat path.** The agent runtime does not currently read them; agent
  behaviour is governed by its system prompt, its bound skills, and its tool
  policy.
* **Agent Runtime.** A durable, audited loop: each run records its steps, model
  calls, tool calls, approvals, final output, failures, tokens, and cost. A
  model turn may request several tool calls at once; all of them are executed
  and answered.
* **Tool Governance.** Tools are database records bound to an agent. Execution
  is deny-by-default: a tool runs only if its handler is in the runtime's
  allowlist, the caller clears the required role, the tenant matches, and the
  arguments satisfy the declared schema. Any non-read tool requires explicit
  human approval. Crucially, the tenant a tool acts on is taken from the
  conversation, never from arguments the model produced.
* **Per-agent runtime limits.** Each agent sets its own budget for five things:
  how many steps it may take, how many tools it may call, how much it may read,
  how long it may run, and how much it may spend. They are held on the agent
  record, edited on the agent create and settings screens, clamped to a platform
  ceiling when saved so the record says what will actually run, and applied to
  every run — including one that pauses and resumes. Two limits stay
  platform-wide: how much an agent may write, which has no per-agent setting;
  and, on a model with no pricing configured, the step, tool and time budgets,
  which fall back to conservative platform values because spend cannot be
  measured there — an agent's own settings can then only lower those three,
  never raise them.
* **Generative Flow Configuration.** An AI copilot turns plain-English intent
  into node configuration and variable bindings for the workflow graph, so
  linking nodes does not require hand-writing JSON.

*For Hakken:* the model-agnostic provider layer is what makes the swappable
decision model in §10 possible — TypeSafe's Jev via OpenRouter needs no new
runtime. The deny-by-default tool policy and the mandatory human approval on
non-read tools are the approval queue in §10, already enforced. The per-agent
cost budget is what keeps a weekly per-asset judgement affordable. The
confidence thresholds (0.6 / 0.85) and the typed decision contract do not exist
yet.

## 23. Workflow Orchestration

A visual directed-acyclic-graph editor with an engine that executes each node as
its own scheduled step. State is persisted per step, so a workflow is not bound
by any single function's execution time limit and survives process restarts.

* **Node types that execute today:** agent, API/action, code transform, logic,
  database, wait, approval, iterator, merge, email, and a pass-through for
  unrecognised types.
* **Human-in-the-loop.** Approval nodes genuinely halt a run and resume it once
  an administrator decides.
* **Tenant-safe database access.** The database node works against an explicit
  table allowlist, forces `companyId` on insert, and verifies ownership before
  update, delete, or select.
* **Iterator fan-out.** An iterator schedules one worker per item, bounded to
  100 items per node, and fails loudly rather than silently processing a subset.
* **The code node performs variable substitution, not code execution.** It
  resolves `{{node.output.field}}` placeholders into a string or JSON structure.
  There is no script interpreter or sandbox.

The graph is acyclic by design; cycles are rejected in the editor. Workflows
express sequences, branches, and bounded fan-out — not unbounded loops.

*For Hakken:* this is the scheduler in §10 — the weekly collate/advise run, the
daily alert check and the monthly review are workflows, and the approval node is
the "every fix is a y/n" gate. The iterator's 100-item bound is a real
constraint on per-asset fan-out for a large catalogue and needs checking against
an e-commerce workspace before phase 1.

## 24. Knowledge & Retrieval (RAG)

* **Vector retrieval.** Documents are chunked and embedded as 768-dimension
  vectors in a Convex vector index, filtered by tenant, agent, document, thread,
  and global scope.
* **Three-tier scoping.** Global knowledge is available to every tenant;
  tenant knowledge is restricted to its workspace; thread knowledge belongs to a
  single conversation. Matches from all three are ranked together by relevance,
  with a reserved share of the prompt budget for files uploaded into the current
  conversation so they cannot be crowded out.
* **Ephemeral thread knowledge.** Files uploaded to a conversation (up to 50MB)
  are vectorised for that conversation only and garbage-collected on a schedule.
* **Supported formats.** PDF, DOCX, XLSX, and plain text, plus URL ingestion
  with server-side protection against internal-network fetches.
* **Untrusted by construction.** Retrieved content is wrapped in explicit
  untrusted-context markers with delimiter neutralisation, and the system
  instruction states that retrieved documents cannot override safety or tenant
  policy.

Retrieval is vector similarity only — there is no keyword/vector hybrid and no
reranking model. Large documents are embedded chunk-by-chunk, so very large
files can exceed a single ingestion run.

*For Hakken:* the untrusted-context construction is exactly the rule in §10 that
page text and AI answers are kept separate from the record and the instructions.
It already exists and must not be weakened when the crawler and the answer data
arrive.

## 25. Quantitative Reporting

Agents can return structured JSON rather than prose — pipeline health, risk
indicators, closing windows, and performance measures. The dashboard renders
that JSON as interactive charts instead of a wall of text, and charts can be
exported as PNG matching the active light/dark theme.

*For Hakken:* the rendering path for an asset P&L exists. The P&L itself does
not.

## 26. Usage Telemetry & Plans

* **Subscription plans.** Workspaces are assigned tiers that set message quotas.
* **Token and operation telemetry.** Input and output tokens are aggregated per
  run and per tenant, with cost attribution held internally.
* **Dashboard analytics.** Administrators see interaction volumes (internal
  versus public widget) and knowledge-asset utilisation.

Optional Stripe billing ships disabled by default; see
[docs/operator/stripe-billing.md](./docs/operator/stripe-billing.md).

*For Hakken:* per-workspace cost attribution is what proves the £20–£80 data and
compute line in §16 on real clients rather than on a spreadsheet.

## 27. Edge Interfaces (Public Widgets)

Workspaces can embed a chat widget on external sites via a script tag that
injects an iframe.

* **Embedding is enforced by the browser.** Each widget serves a
  `Content-Security-Policy: frame-ancestors` header built from its own allowed
  domains, so it cannot be framed by a site its owner has not approved. A widget
  with no domains configured is embeddable nowhere. Document requests carrying a
  disallowed referrer are refused, and blocked attempts are audit-logged.
* **Anonymous sessions are token-bound.** Each widget conversation issues a
  256-bit session token, stored only as a hash; reading messages or agent
  reasoning requires presenting it.
* **Abuse limits.** Message payloads are capped at 10,000 characters and each
  conversation is rate-limited.
* **Theming.** Colours, logo, greeting, and starter prompts are configurable per
  widget.

Rate limiting is currently per conversation rather than per widget, tenant, or
IP address, so it does not by itself bound total spend from anonymous traffic.

## 28. Governance, Privacy, And Supply Chain

This is the proof base behind the commercial positioning. Each item below is
implemented; the wording is deliberately precise, because these claims are
headed for external sales material.

* **Governance evidence.** An AI register with risk classification, maintained
  governance rollups, and exportable evidence packs. Designed to be
  **compatible with EU AI Act expectations** around controlled AI use, evidence,
  review, and operational traceability. It is a supporting posture, not a
  certification.
* **Personal-data rights.** Subject-rights handling, retention policies, and a
  purge cascade with scheduled enforcement — the machinery **GDPR obligations
  require**. Compliance itself is an organisational determination, not something
  a codebase can assert on its own.
* **Tenancy and access controls.** Tenant-aware access boundaries, route
  protection and authentication, audit logs, and connector execution policy,
  each with test coverage.
* **Supply-chain scanning.** Socket runs alongside `npm audit` for
  package-policy and supply-chain analysis. It runs **on direct pushes to `dev`**
  — pull requests from forks do not receive repository secrets — and an
  unhealthy report blocks the push check before the more expensive stages run.
* **Deployment gates.** Production deployment is refused when any required check
  fails: runtime dependency audit, a passing CI run covering the same code,
  source guards, lint, typecheck, unit and integration tests with coverage, and
  coverage thresholds.
* **Scheduled security auditing.** A weekly audit workflow re-checks runtime
  dependencies as a blocking signal and the full tree, including dev tooling, as
  a reporting-only signal.
* **Recurring review workflows.** A read-only security review that maps findings
  to OWASP web/API/LLM risks and STRIDE, separating confirmed findings from
  unverified areas; and a documentation maintenance pass that checks for stale,
  missing, thin, inaccurate, or unindexed documentation.

**For sales material,** package these into current proof artifacts rather than
quoting this document: a model catalogue export, a GDPR control mapping, Socket
and npm scanning evidence, an EU AI Act mapping, and a security-test summary.
Numbers such as the size of the model library are a per-deployment fact — read
them from the catalogue at the time of the claim.

*For Hakken:* the audit log and the evidence pack are the ledger in §8 — "log
every change like a timesheet with before and after" — and the credential and
liability questions in the research-gaps report (§5.2 there) land directly on
this machinery when browser agents start writing to directories.

## 29. Internationalisation

The platform ships with English and Italian throughout. An automated test
enforces translation parity between locales, so a missing translation fails the
build rather than reaching a user.

## 30. Connector Authorisation And Tool Servers

Gmail connector OAuth includes code exchange, encrypted token storage, refresh
and revocation in `convex/connectorOAuth.ts`. MCP server configuration, discovery,
tool import and governed execution are implemented in `convex/mcpServers.ts`,
`convex/mcpDiscovery.ts` and `convex/mcpToolCall.ts`. These are capabilities in the
code; each deployment still needs its own credentials and connection checks.

*For Hakken:* "each source an MCP server or equivalent, OAuth once, tokens
vaulted" (§10) is this layer. The pattern exists and is governed; every Hakken
connection in §9 still has to be built on it.

---

# Part Three — Not Built Yet

## 31. Hakken Product Surface

**Almost none of the product described in Part One exists in this codebase.**
Listed so that nothing above has to be hedged, and ordered roughly by the phases
in §17. The first exception is dated in its row: the website record, the first
piece of the asset record, landed on 2026-09-21. Every other row is still unbuilt, and a
row that says so must not be described as though it exists.

| Area | Current state |
|---|---|
| The asset record | **Started 2026-09-21.** The website entity exists and is shared: a website is stored once, identified by normalised host, and every company holding or tracking it reads that one record, so DataForSEO is paid once. A company holds its own websites and the competitors each is measured against sit inside them, with refresh cadence set on the company and inherited by each website. Super admin only, under the company's Websites tab and a top-level Websites section. Nothing else of §5 does — no data is fetched, no per-asset P&L, no stage model (found → visited → converted → enquired/ordered → won). Company records still hold workspace configuration, not decision-ready facts. |
| DataForSEO connection | Not built. No AI Optimization, SERP, Keywords or Labs integration. Phase 0's sandbox test (billable rows, UK coverage, cited-versus-chosen) has not been run. |
| Cited vs chosen monitoring | Not built. No per-engine monitoring record, no "share of AI decisions" metric. |
| Prompt panels | Not built. No buyer-intent derivation, no target-blind variant generation, no contamination QA, no panel versioning with separate aided/unaided denominators. |
| Search Console / GA4 / Bing Webmaster | Not built. No OAuth connection, no query/click/impression or session/conversion ingestion. These are the results column of the P&L and are ring-one, phase-one scope. |
| Google Business Profile | Not built. The API access application (60-day verified profile, approval lead time) has not been started and is a day-one action per the data-sources report. |
| Own-site crawler | Not built. Knowledge ingestion can fetch a URL; there is no owned-site crawl, no change detection, no schema or llms.txt audit. |
| Directory and listing read/write | Not built. No scrapers, no browser agents, no credential vault beyond the existing connector token storage, and no session-model alternative. The solicitor questions in the research-gaps report are unanswered. |
| E-commerce sources | Not built. No Merchant Center, product feed, Shopify/WooCommerce, marketplace or review-platform integration. |
| The typed decision layer | Not built. No confidence contract (<0.6 human, ≥0.6 sorting, >0.85 required before touching a live asset), no hand-labelled evaluation set, no rubric-tuning loop. The provider abstraction it would sit on does exist (§22). |
| Skills library | Not built for this domain. The agent skill system exists; the Cogny-derived SEO/GA4/ads/email playbooks and Newsjack-derived PR and panel skills have not been adapted or imported. |
| Alerts with the four-part contract | Not built. Platform alerts exist for system health; there is no KPI band model and no "what changed, why, what to do, what to expect" alert contract. |
| Weekly note and monthly report | Not built. The email system and layout service exist; the content does not. |
| Agency role and cross-workspace view | Not built. Tenancy has three roles (§21); the agency manager role, client invitation, agency-wide view and white-label report surfaces are phase-one scope. |
| Corroboration / PR lane | Not built. Phase 4. |
| Ads connections | Not built. Phase 4. |
| Agent-facing endpoint | Not built. Phase 5. |

## 32. Platform Gaps

Inherited foundation gaps, tracked in
`docs/plans/active/platform-hardening-plan.md`.

| Area | Current state |
|---|---|
| Connector marketplace | 29 connector tools are defined with schemas and scopes; **2 are executable end-to-end** (knowledge search, company overview update). Five return an explicit "not implemented" result and the remainder are not registered. |
| Response streaming | Built for chat: assistant and widget replies stream word by word on all providers, and agent-backed threads already did. Structured-output surfaces (reports, node-config generation, grading) still deliver whole. See `docs/plans/active/assistant-streaming-all-providers-plan.md`. |
| Prompt caching | Not implemented. |
| Run cancellation and resumption | Cancellation marks the record but does not interrupt an in-flight run; failed runs cannot be resumed from a checkpoint. |
| Agent evaluations | The default readiness check validates configuration rather than model behaviour. Model-graded evaluation exists but does not exercise the full agent runtime. |
| Behavioural rules in agents | The rule engine applies to the assistant chat path only. Agent behaviour is governed by system prompt, skills, and tool policy. |
| Workflow resilience | Automatic retries exist, deliberately narrow: a step retries only if the error classifies as transient **and** the node type cannot repeat an externally visible effect. Today that is `agentNode` alone, up to 3 attempts, and even then not when the agent executes tools autonomously or when the failure came after the real work finished. Email, action, and database nodes never retry. No dead-letter queue and no compensating actions; anything unretryable fails to the review list. |
| Observability | Sentry hooks and configurable tracing are implemented but require deployment configuration. `/api/health` provides liveness and `?deps=1` checks Convex HTTP reachability; neither proves database/function health. Live monitoring, alert delivery and release tags must be verified for each deployment. See `docs/developer/deployment.md`. |
| Schema migrations | Schema changes are pushed ahead of the application image, but data migrations have tooling: named, resumable, idempotent backfills in `convex/dataMigrations.ts`, run one page at a time with progress recorded so a completed migration never re-runs. |

## 33. Legacy Framework Surface

This repository still carries demo and vertical modules from its Sonae history —
Arcade, Posture Studio / Movement, Properties, Sales Reports and Sales Data.
They are not Hakken product surface. The clone tooling
([docs/operator/cloning-hakken.md](./docs/operator/cloning-hakken.md)) treats
most of them as optional modules. Decide per module whether to keep, park or
strip it before phase 1; nothing in Part One depends on any of them.

### The rename is complete — and what it breaks outside this repo

The 2026-09-21 rebrand renamed documentation prose. A follow-up pass the same
day renamed everything else: components, Convex functions and tables, config
files, webhook headers, Stripe metadata keys, the embedded widget surface,
deployment names, test fixtures, CSS classes, debug globals, historical plan
records and every user-facing string. Nothing here is named `sonae` any more
except the URL of the upstream repository this was cloned from.

This was done deliberately, accepting breakage, to stop the two names coexisting.
**Systems outside this repository still expect the old names.** Each row below is
broken until it is reconfigured:

| Area | Old | New | What to do |
|---|---|---|---|
| Webhook secret header | `x-sonae-secret` | `x-hakken-secret` | Update every registered receiver |
| Webhook signature | `X-Sonae-Signature`, `X-Sonae-Timestamp` | `X-Hakken-*` | Update receiver signature verification |
| Dispatcher User-Agent | `Sonae-Webhook-Dispatcher` | `Hakken-Webhook-Dispatcher` | Update receiver allowlists |
| Stripe metadata | `sonaeBillingAccount`, `sonaeCheckoutAttempt` | `hakken*` | Live customers and subscriptions carry the old keys; backfill or re-link before billing recovery/reconciliation runs |
| Widget global and event | `SONAE_WIDGET_CONFIG`, `SonaeWidgetInitialized` | `HAKKEN_WIDGET_CONFIG`, `HakkenWidgetInitialized` | Reissue every embedding site's snippet |
| Widget CSS | `sonae-widget-*`, `sonae-open`, `sonae-display`, `sonae-icon-*` | `hakken-*` | Any site styling the widget |
| Widget storage | `sonae_widget_*` | `hakken_widget_*` | Live widget sessions reset once |
| Convex table | `sonaeGlobal` | `hakkenGlobal` | Data migration on any deployment holding rows |
| Cloud Run / Artifact Registry | `sonae-app`, `sonae-repo` | `hakken-app`, `hakken-repo` | Next deploy creates new resources; the old ones keep running and costing until removed |
| GCP project and DNS | `sonae-dev-491717`, `sonae.ronins.co.uk`, `sonae-auth.ronins.co.uk`, `sonae-db.ronins.co.uk` | `hakken-*` | These must be created before they resolve |
| Persisted format ids | `sonae.agentSkillBundle.v1`, `sonae-swarm-cluster-v1`, `sonae-voice-ticket-v2` | `hakken.*` | Records written under the old id need migrating |

The Hakken Convex deployment (`quaint-zebra-2`) was created empty on
2026-09-21, so the table and format-id rows carry no data debt there. The
Stripe, webhook, widget, DNS and Cloud Run rows do apply to anything already
running against the Sonae deployment.

---

## Change Log

* **2026-09-21 (later)** — The first piece of Hakken's own product surface: the
  **website record**. A website is stored once, keyed on its normalised host, so
  a competitor two clients both watch is one record with one DataForSEO pull —
  the constraint the whole model is built to keep. A company holds its own
  websites; the competitors each site is measured against sit inside that site,
  because a rival is only meaningful relative to what it is compared with.
  Refresh cadence (daily, weekly, fortnightly, monthly, plus an on/off switch)
  is set on the company and inherited by each website, with inheritance
  expressed as absence so changing the company moves every website that has not
  been set differently. Because there is one record per host, the fastest
  watcher sets its rate for everyone and cost never multiplies. Divisions were
  built and removed the same day: they added a level that earned nothing once
  competitors moved inside a website rather than sitting beside it. Nothing is
  fetched yet — these are structures and settings, and the agent that reads them
  and calls DataForSEO is the next slice.
* **2026-09-13** — Corrected OAuth, MCP and health-endpoint implementation
  claims against the code. Live deployment readiness remains a separate check.
* **2026-08-23 (later)** — Three claims corrected against the code. Tenant
  isolation is now structurally enforced by function builders plus a CI test,
  not by convention. Sentry is installed and wired but has no DSN connected, so
  the code exists and the signal does not. Workflow steps do retry, under a
  deliberately narrow safety policy.
* **2026-08-23** — Consolidated into the single source of truth. Part One
  replaced with the current commercial vision and the three strategic lanes.
  Corrected the claim that the agent runtime executes on Google Vertex only: it
  runs on Google Vertex, Anthropic, OpenAI, and OpenRouter, all with tool
  calling. Added the governance, privacy, and supply-chain proof base. Legacy
  product descriptions elsewhere in the repository now defer here.
* **2026-08-18** — Corrected the per-agent runtime limits and schema migration
  rows, both of which had stopped being true.
