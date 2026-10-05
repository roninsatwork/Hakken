# Usage and credits — planned 2026-10-05

Hakken is priced at a flat monthly fee per company that includes a monthly
batch of credits, and every piece of paid work — a scheduled check, a keyword
looked up, a question asked — uses credits. A company sees where every credit
went under a new **Usage** item on the main menu: a summary like Google
Analytics, then pages that carry the detail, down to a bank-style statement.
Super admins set what each kind of work costs in credits, and see whether each
price covers what the work really costs us.

**Status: planned 2026-10-05; steps 1 (the record) and 3 (the Usage screens) built the same day, local on dev. Every price and number in it is a
placeholder until the cost audit.** Change a decision here, with a date, before
building anything that disagrees with it.

## What was asked

Anthony, 2026-10-05, in a pricing brainstorm:

- "Im thinking about a base subsriotionb fee + whatever you consume with a 50%
  markup"
- On why: "the worry is gettign complex you get 10 keywrods to takc here, 10
  fan out querie - the numnebr of permutations are addign upo and its all veyr
  complex" — "I would rather charge a £200 a month flat fee + usage credits whic
  can be topped uP"
- "I think we need a new menu item in the main left hand nav - called usage …
  These are reporting screens … google analytics sttyle - the uesers can see
  where their credirts are bring spent adn the draw down with grabphs"
- "we need a mechanism to attache credits to work"
- "we need to performa full costs ayfdit of what data for seo costs , ai
  tokens, jev costs bnefore we can make that decision … so for now lets set teh
  credits at 1,000 and you work out a way for each credit costs - this wauy we
  can adjust when we get a clearer picture"
- On data one fetch serves to several companies: "yes cheraage twice the
  clietns dont know its already there"
- On the first drawing: "THE DIESN IS GOOD FOR A SUMAMRY DASHBAORD BUT WE NEED
  TO SEE USER, DATE AND TIME AND TAKS AND VALUE ETC … THIS CAN BE ON SUB PAGES
  THAT CARRY THE DETAIL"
- "on the usage screne thte table is not our stadnrd search and fil;ter table =
  why did you nreak that rile" — every table in this plan is the standard
  search-and-filter table.
- "creits have to be consumed in the month ona. use it or lose it basis", then
  "are purcahsed credits easy to expire in 12 months when credits as part of the
  plan expire in that month … if so we need to make the dtails scnren look more
  like bank statement and have a purhase hostiry screen too" — and, shown how,
  "ok lets update teh designes for this".
- "the over view screen needs a total cost per weboite, owned and tracked …
  then we need to see the break sdown fow that websit elike itt is now"
- "the screens look good", "yes draw the amin price list too", then "jsut write
  thm up inot a plan please".

## His decisions, 2026-10-05

1. **£200 a month per company, flat, including a monthly batch of credits** —
   1,000 for now, a placeholder until the cost audit (DataForSEO, AI tokens,
   development). No tiers built from permutations of keywords, fan-outs,
   engines and schedules.
2. **Every piece of paid work uses credits**: weekly runs, monthly runs,
   one-off lookups, questions. Customers pay for what they use.
3. **Credits belong to the company.** An agency tops up each client's company
   separately.
4. **Plan credits are use it or lose it**: whatever is left at midnight on the
   month's last day ends. **Bought credits last 12 months** from the day they
   are bought.
5. **Use is shown up front**: Coming up shows the credits scheduled checks have
   already booked, this month and next.
6. **At zero, new one-off work stops; scheduled checks keep running.** A warning
   at 80% of the month's plan credits. **Automatic top-up is optional**, with a
   monthly limit the company sets.
7. **Credits attach to work through a price list in Admin**: one line per kind
   of work, a price in credits per unit. A change applies from each company's
   next run; charges already made keep the price they were made at.
8. **Data shared between companies is charged in full to each company.** One
   fetch can serve several companies; each pays the standalone price, and no
   customer screen shows that the data was shared.
9. **Every charge records what the work really cost us** beside the credits it
   charged — the audit trail the cost audit will be run from.
10. **The screens are the eight drawn** (below), approved 2026-10-05.

Proposed with the batches and accepted with the redrawn screens ("ok lets update
teh designes for this"):

- **Credits are held in batches** — a plan batch each month, a batch per
  top-up — and work draws from **the batch that ends soonest**: plan credits
  first, then the oldest top-up. Bought credits are never used while plan
  credits are left.
- **A charge that spans two batches** is one line on the statement; the record
  keeps both parts.
- **A check that fails gives its credits back** to the batch they came from, or,
  if that batch has ended, to the current month's plan batch. Nobody loses
  credits to our failure.
- **What a top-up's credits end on is stated at the point of sale**: on the Top
  up page and on the receipt.

## Not charging yet — 2026-10-05

Anthony, while step 3 was built: "we dont switch on charging we are just
montiorign costs at this stage to set pricign etc". **Nothing charges anyone
at this stage**: the record (step 1) and the screens (step 3) show what each
piece of work would use in credits beside what it really cost us, and that is
what the prices are set from. **Steps 4 (Purchases, Top up, Stripe) and 5
(switching it on) are parked** until he says the prices are set.

## Outstanding questions

Left open on purpose, 2026-10-05 ("leave the questiosn as outstadigni n the
plan"). Each is answered before the step that needs it (Order of work, below);
none holds up step 1.

1. **How a credit's worth is set.** Recommended, and drawn on Credit prices: one
   setting, "a credit covers $0.05 of real cost"; a fixed pounds-to-dollars rate
   set by hand; each line's suggested price is its 30-day average real cost per
   unit divided by what a credit covers, rounded up, never below 1; suggestions
   never change a price by themselves. Confirm before building step 2.
2. **What a scheduled check uses when the balance is zero.** Decision 6 says it
   keeps running. Recommended: the balance goes below zero and the next batch to
   arrive pays that first (the next month's plan credits, or a top-up), shown on
   the statement as its own line. The other choices are running it free, or
   stopping it.
3. **The prices**: the plan fee, credits a month, top-up packs (drawn as 250 /
   500 / 1,000 / 2,500 credits at £25 / £50 / £90 / £200) and every line of the
   price list — after the cost audit.
4. **How expired credits count in the accounts**, and VAT on top-ups — for his
   accountant.
5. **PRODUCT.md §15's £149–£499 tiers** are superseded by decision 1 once he
   says so; PRODUCT.md is not changed by this plan ("not yet", 2026-10-05).
6. **The plan's message limit.** Plans count Ask Hakken messages against
   `messageLimit` today. Recommended: retire it when questions cost credits
   (step 5), so a company is never stopped by two different meters.
7. **Who sees Usage and who buys.** Recommended: everyone in the company sees
   Usage; only the people who can manage the company's Billing today buy
   top-ups and set automatic top-up.
8. **When a month ends.** The existing monthly reset runs at 00:00 UTC (01:00 in
   a British summer). Recommended: plan credits follow it, so there is one
   month boundary in the app.

## What is there today

Read from the code, 2026-10-05:

- **No credits, balance or ledger exist anywhere.**
- **Plans hold one quota**: `messageLimit` (-1 unlimited), with `priceGBP` and
  `grantedModules` (`convex/schema.ts:1188`). Companies and users count
  `messagesUsedThisPeriod`, reset at 00:00 UTC on the 1st by
  `resetBillingCycle` (`convex/plans.ts:234`), run by the `reset-billing-cycles`
  job (`convex/crons.ts:245`).
- **Stripe is subscription-only**: Checkout runs in `mode: "subscription"`
  (`convex/billingCheckout.ts:32`) and a price must be recurring, monthly and
  licensed (`convex/billingStripe.ts`). There is no one-off payment.
- **Supplier spend is already recorded per company.** Every DataForSEO request
  is a `seoDataPulls` row (`convex/seoPullSchema.ts:32`) with `costUsd` and
  `companyId`, written when the request settles (`settleSend`,
  `convex/seoCollectionQueue.ts`). Settled requests also roll up per company
  and day into `seoDayRollups` — `costUsd` paid and `reusedValueUsd` saved by
  sharing — into the running mean per operation `seoOperationCosts` (no
  company), and into `agentTransactions` rows that do carry the company.
- **Where each kind of work starts:**

  | Work | Starts in | Real cost today |
  |---|---|---|
  | Rankings, AI answers, site audit, backlinks | The collection cycle: `seoAgentRuns.runSeoRoleNow` → `openCompanyCycle` → `openSeoCycle` (`convex/seoTools.ts`), planned by `expandSeoCycle` (`convex/seoCollection.ts`) — AI answers by `questionSteps`, crawls and links as site operations, paged lists by `planPagedList` | `seoDataPulls`, per company |
  | Keyword research | `keywordResearch.lookUp` / `lookUpAgain` / `lookUpInCountry` / `openResults` → `startResearchRun` | `recordResearchCall` (`convex/keywordResearchRun.ts`) and `keywordLookups.spentUsd` |
  | Prompt fan-out (super admin's Generate) | `generatePromptFanOut` (`convex/promptFanOut.ts`) | `seoDataPulls`, per company |
  | An agent's own pull | `seoTools.requestSeoPull`, `seoTools.startSeoCollection` | `seoDataPulls`, per company |
  | Ask Hakken | `chat.sendMessage` (`convex/chat.ts`) → `aiChat.generateHakkenResponse` | **Tokens and model only** on `messages`; dollars are worked out later from model prices |

  An agent run's `costUsd` adds model and supplier spend together.
- **Caps.** A cycle stops at `CAPPED_PLAN` when it plans more requests than the
  company's `purchasesPerCollection` limit — a Limits setting, not a billing
  plan. `CAPPED_SPEND` is declared but never set. The real spend cap is each
  agent run's `maxCostUsd`.
- **Screens.** Settings → Organization's usage chart reads
  `analytics.getCompanyMetrics` (`convex/analytics.ts`): AI tokens only, so
  supplier spend never shows, beside a list of model providers. Admin →
  Websites → SEO costs (`seoCollectionReports.listCompanyCosts`) lists
  companies by 30 days of standalone cost: paid, saved by sharing, requests.
- **The menu** (`UserNavTree`, `src/ui/components/layout/SidebarNavTrees.tsx`):
  Dashboard, Ask, Tasks, Calls, Sites, Search Console, Learn, Reception,
  Governance, Organization, Billing (admins), Arcade. Admin's Settings group:
  System Settings, Plans, Billing, API Keys, Analytics.

## The drawings

The canvas "Hakken Usage" (claude.ai artifact `78rFUtyVdxwTvgp98dsuGX`), eight
boards on the drawing kit (kit.css `865a89b9ab67`, look `149d9f4fb243`), copied
to [`docs/plans/assets/usage-credits/`](../assets/usage-credits/). Every board
works: sorting, search, filters, pages, the side menus and the chart.

| # | Board | The screen |
|---|---|---|
| 1 | Main | **Usage → Overview**, the summary dashboard: plan credits left (and when they end), bought credits left (opens Purchases), used this month of 1,000, left on the month's last day at this pace; the month's credits day by day, with what is booked and September for comparison; where they went, by kind of work; **credits by website, owned and tracked** — picking one narrows the table below to it; what ran this month, each check with what one run costs |
| 2 | ByWork | **Usage → By work**: a side menu of the kinds of work; the chosen one's credits, runs, price and September; every charge it made — date, time, description, user, out |
| 3 | ByWebsite | **Usage → By website**: the same, per website — owned (a square mark), tracked (a round one), and work tied to no website |
| 4 | ComingUp | **Usage → Coming up**: booked to the month's end, booked for next month out of its 1,000, free for one-off work; every scheduled check, when it next runs, who set it up, what one run costs, and what it will use this month and next |
| 5 | Statement | **Usage → Statement**, like a bank statement: opening balance, in, out, balance now; every line in date order between an "Opening balance" and a "Balance now" row — date, time, description (which batch paid), user, out, in, balance; month picker, PDF and CSV |
| 6 | Purchases | **Usage → Purchases**: bought credits left, the next to end, bought in the last 12 months, ended unused; every top-up — when, who, credits, paid, used, left, ends, status (Not used yet, In use, Used up, Ended), receipt |
| 7 | TopUp | **Top up**, its own page under Purchases: pick a pack; what you get, pay, when they end, the order they are used in; automatic top-up with a monthly limit; "Pay £50.00 with Stripe" |
| 8 | AdminCreditPrices | **Admin → Settings → Credit prices**, after Plans: what a credit covers and the exchange rate; credits charged this month, real cost, what a credit cost us, prices not covering their cost; one line per kind of work — real cost a unit, suggested, in use, charged, real cost, what a credit cost us (covered or not) — with "Use 2" to take a suggestion; Save prices or Discard |

## The rules

- **Batches.** A plan batch of the plan's credits is granted at 00:00 on the
  1st and ends at midnight on the month's last day. A top-up batch ends 12
  months after it is bought, to the minute. Whatever a batch holds when it ends
  is written off as its own statement line ("September's plan credits ended").
- **Drawing credits.** Each charge takes from the batch ending soonest, moving to
  the next when one runs out.
- **Price.** Credits for a run = units × the line's price, rounded up to a whole
  credit. The price is fixed when the run is booked, so Coming up's numbers are
  what will be charged.
- **Shared data.** Charged at the standalone price whatever was reused; the
  record keeps both what we paid (`costUsd`) and what the sharing saved
  (`reusedValueUsd`), as `seoDayRollups` already does.
- **Zero.** One-off work (a lookup, a question, an audit started by hand) is
  refused with a plain message and a link to Top up. Scheduled checks run
  (Outstanding question, 2).
- **Who.** Every charge names a person: whoever started it, or, for a scheduled
  check, whoever set the schedule up ("Scheduled"). Plan grants and endings are
  "Hakken, automatic".
- **Tenancy.** Balances, charges, purchases and settings are read and written
  only by company; the price list and the real costs are super admin only. No
  company screen shows a real cost, a supplier, or that data was shared.

## How it is built

### The record (Convex)

New tables, every one keyed by company except the platform's own settings:

| Table | Holds |
|---|---|
| `creditBatches` | A plan month's or a top-up's credits: source, granted, left, starts, ends, and what was written off when it ended |
| `creditCharges` | The statement: one row per charge, refund, grant, ending or top-up — when, who (a person, or "scheduled" with whoever set the schedule up), kind of work, website, units, the price line it was charged at, credits out or in, the batches that paid, the balance after, the real cost (`realCostUsd`, `reusedValueUsd`) and what it was for (the cycle, lookup, message or purchase); booked, charged or refunded |
| `creditPurchases` | Every top-up: who bought it, the pack, credits, amount and currency, the Stripe session and payment, the receipt, its batch |
| `creditPrices` | The price list: one line per kind of work — unit, unit size, credits — and each change with who made it and when |
| `creditSettings` | The platform's: what a credit covers in dollars, pounds to a dollar, the warning point (80%), the top-up packs |
| `creditAutoTopUps` | Per company: on or off, the pack, the monthly limit, how many bought this month |
| `creditDayRollups` | Credits and runs per company, day, kind and website — what the Usage screens read, so no screen sums raw rows (the rule `seoDayRollups` already follows) |

`plans` gains `monthlyCredits`.

**One service, `convex/creditLedger.ts`**, the only code that writes these:
`quote(kind, units)`, `book(...)` (draws from the soonest-ending batches and
writes a booked charge), `settle(ref, realCostUsd, reusedValueUsd)`,
`refund(ref)`, `grantPlanCredits(company, month)` and `endBatches(now)`. Each
write updates the rollups in the same transaction. The jobs run through
`runJob` (`convex/jobLedger.ts`) like every other scheduled job: plan grants
beside `reset-billing-cycles`, and an hourly job ending top-up batches.

**The charge points**, each booking before it buys and settling when the
supplier's cost is known:

- **The collection cycle** books per company, website and kind as
  `expandSeoCycle` plans the work, and settles from `settleSend` /
  `countSettled`, which already carry the company and the cost. Lines that fail
  are refunded. A shared request settles at the standalone price for every
  company it serves.
- **Keyword research** books one lookup in `startResearchRun` — refused at zero —
  and settles in `recordResearchCall`.
- **Prompt fan-out and an agent's own pulls** book under the kind they buy.
- **Ask Hakken** books one question in `chat.sendMessage` — refused at zero — and
  settles with the reply's cost from `calculateModelCostUsd`
  (`convex/aiCostService.ts`), stored on the charge, since `messages` keeps only
  tokens.

**Stripe**: a second Checkout, in payment mode, for top-up packs, beside the
subscription one (`convex/billingCheckout.ts`); the webhook (`billingHttp.ts`)
turns a paid session into a purchase and its batch, once only by session id, as
billing's other writes already are. Automatic top-up charges the company's saved
card off-session. Stripe issues the receipt.

**Tenancy**: every read and write is scoped to the company
(`convex/tenantFunctions.ts`); the price list, real costs and settings are
super admin only, written through `useAdminAction` on the screen. No company
query returns a real cost, a supplier, or a reused flag.

### Screens

- **Usage**, a new group on the main menu after Learn (as drawn): Overview
  `/app/usage`, By work `/app/usage/work`, By website `/app/usage/websites`,
  Coming up `/app/usage/coming-up`, Statement `/app/usage/statement`, Purchases
  `/app/usage/purchases`, and Top up `/app/usage/purchases/top-up`. Each top-level
  page wears `PageHeader` with its divider; Top up wears `DetailHeader`, back to
  Purchases.
- **Admin → Settings → Credit prices** `/admin/settings/credit-prices`, after
  Plans in `AdminNavTree`.
- **Built from the screen kit, as drawn**: `DataTable` for every table, with its
  search row and filter chips; figures; the Sites charts (`SiteCharts.tsx`) for
  the day-by-day credits — the dashed "booked and usual pace" line and the grey
  comparison month may need an option on the line chart, added there with a
  comment; `StatusLabel` and `TagLabel`; `SiteMark` / `MarkedHost` for websites
  (square owned, round tracked); the section menu Keyword research uses; the
  notice; the settings card, `Field`, `Checkbox`, `Select`; `SaveAction` on
  Credit prices.
- Every word in `messages/en.json` and `messages/it.json`.
- Each screen gets its look test once built (design-drift-plan D4).
- Settings → Organization loses its usage chart (`OrganizationUsagePlot`) and
  model-provider list when Usage is live: they count AI tokens only and name
  suppliers.

### Tests

- The ledger: a plan grant; drawing from the soonest-ending batch; a charge
  across two batches; a refund to its batch, and to the current plan when its
  batch has ended; a batch's ending writing off what was left; a top-up lasting
  12 months to the minute; rounding up; the price fixed at booking; a shared
  request charged in full to every company; the rollups always equal to the
  rows.
- Tenancy: one company can never read another's charges, batches or purchases,
  in the manner of `convex/websiteTenancyGuard.test.ts`; only a super admin
  changes a price or a setting, and each change is audited.
- Zero: one-off work refused with the plain message; scheduled checks per
  Outstanding question 2.
- Stripe: a paid session makes one purchase and one batch however often the
  webhook comes.
- Screens: every table a `DataTable` with its search row (`npm run
  check:guards`); the Statement's opening and closing rows; the menu; locale
  parity.

## Order of work

Each step is a working part of the app, drawn first (done), built on the screen
kit, checked locally (`npm run verify:env`, `npm run lint:all`, `npm run check`,
`npm run build`, `git diff --check`), then committed locally.

1. **The record, quietly.** The tables, the ledger, the price list at
   placeholder prices, plan grants and endings, and every charge point booking
   and settling with its real cost — but nothing refused and no customer
   screen. Real sites start filling the audit trail the cost audit needs
   ("we are buidlign screens and gettign the audit trail done o that perform an
   aujdit later").
2. **Admin → Credit prices**, the audit report. Outstanding question 1 first.
3. **Usage**: Overview, By work, By website, Coming up, Statement, reading the
   record.
4. **Purchases, Top up and Stripe's one-off payment**: 12-month batches and
   automatic top-up.
5. **Switching it on**: one-off work refused at zero, the 80% warning, scheduled
   checks at zero (Outstanding question 2), the £200 plan with its credits in Stripe,
   and the message limit retired (Outstanding question 6). His go first.
6. **Settings → Organization's old usage chart taken out.**

Nothing in any step buys more than collections already buy.

### How long, estimated 2026-10-05

| Step | Days | Waits on |
|---|---|---|
| 1. The record, quietly | 3 | Nothing |
| 2. Admin → Credit prices | 1 | Outstanding question 1 |
| 3. Usage, five screens | 3 | Step 1 |
| 4. Purchases, Top up, Stripe | 3 | **Parked**: no charging yet (2026-10-05) |
| 5. Switching it on | 1.5 | **Parked**: no charging yet (2026-10-05) |
| 6. The old chart out | 0.5 | Step 3 |
| **In all** | **about 12** | |

Building days, with each step checked locally. Not in them: the cost audit
itself, his review of each step, and proving top-ups against live Stripe
(billing's rule: local work is never proof of the live account). Step 1 is the
largest risk: the collection cycle books and settles per company, website and
kind, and one request can serve several companies.

## Built — step 1, the record, 2026-10-05 (local, on dev; not pushed)

His go: "ok lets bjuild thi splease". Every charge is now recorded with its
real cost; nothing is refused and no screen shows it.

- **Tables** (`convex/creditSchema.ts`): `creditBatches`, `creditCharges` (the
  statement), `creditAccounts` (owed), `creditPrices`, `creditSettings`,
  `creditMonthRollups` (per month, kind and website) and `creditDayTotals`
  (per day, and how much of it by hand); `plans.monthlyCredits`. (A daily
  rollup per kind and website was built first and replaced the same day, in
  step 3, before it held a row: a month of it grew with every website.)
- **Kinds and units** (`convex/creditKinds.ts`): a request's kind is its
  registry family — SERP, DataForSEO Labs and Keywords Data are Rankings; AI
  Optimization is AI answers; On-Page is Site audit; Backlinks is Backlinks. Its
  units: an AI answer is one whatever it returns; a crawl counts the pages it
  may read (`max_crawl_pages`); a list the rows it asks for (`limit`); a batch
  its keywords or websites; anything else one. Credits are rounded up once per
  run, never per request. Placeholder prices as drawn.
- **The ledger** (`convex/creditLedger.ts`): a month's plan batch is granted the
  first time anything is charged in it, dated the 1st (UTC, the month the quota
  reset already uses), after ending what has run out; charges draw from the
  batch ending soonest; what none can cover is owed (`creditAccounts`) and the
  balance goes below zero — outstanding question 2 decides what pays it;
  refunds go back to their batch, or the current plan's if it has ended. An
  hourly job, `credit-ledger-sweep`, ends batches whose time is up and closes
  runs whose collection finished without its last answer.
- **The charge points** (`convex/creditHooks.ts`, one line in each place):
  - A collection: **one charge per collection, website and kind**, opened when
    its first line is planned (`seoCollection.ts`), at the price as it stands
    then. Every line adds its units — bought or served by a request another
    company paid for, at the full price either way. The collection that sends
    a request gets its real cost; every other collection it served gets what it
    saved, when it is answered. A failed request takes its units back off; a
    line dropped when a run is closed by hand (`seoCollectionClose.ts`) too.
    The charge takes its credits when the collection finishes
    (`finishSeoCycle`), or from the hourly sweep once nothing is in flight.
  - Keyword research: charged by the keyword when a lookup starts
    (`startResearchRun`); its calls add what they cost as they settle.
  - Ask Hakken: one question per reply saved in a company's conversation
    (`chat.saveAssistantMessage`, `finishStreamingAssistantMessage`), with its
    real cost from the model's rates; a public widget's and an evaluation's
    are not charged.
  - A request outside any collection — an agent's own, a super admin's
    fan-out — is one charge, refunded if it fails after it was charged.
- **A credit failure never fails the work**: each charge point catches and
  logs, so a collection, lookup or reply goes ahead whatever happened to its
  charge.
- **Tests**: `convex/creditLedger.test.ts` — kinds and units, rounding, a
  shared collection charged in full to both companies with a failure taken
  off, a dropped line, batches drawn in order and owed, a month ending and the
  next granted, a refund, a lookup, an Ask Hakken reply and an evaluation's.

Left for later steps, knowingly:
- Other agents' model costs are not a kind on the price list, so not charged.
- A lookup whose run buys nothing is still charged; refunds for it come with
  step 5, when refusing at zero makes them matter.
- A request revived after it was counted failed is not charged again.
- A month with nothing charged has no grant or ending line.

## Built — step 3, the Usage screens, 2026-10-05 (local, on dev; not pushed)

Usage is on the main menu after Learn, with Overview, By work, By website,
Coming up and Statement, built on the screen kit to the approved boards; each
screen's outline is held by a look test
(`src/app/(dashboard)/app/usage/usageLook.test.tsx`,
`docs/plans/assets/usage-credits/look/`).

- **Reads** (`convex/creditUsage.ts`), each the signed-in company's own and
  none carrying a real cost: `usageSummary` (a month from its rollups and
  daily totals: plan and bought credits left, used, the month by day beside
  the month before, by kind, by website owned and tracked, every kind of check
  on every website, and this month what is booked and left at the end),
  `usageStatement` (the month line by line with the balance after each and
  the month's opening; one kind or one website on By work and By website), and
  `usageComingUp`.
- **What is booked** is worked out from how each scheduled check has run: as
  often as its recent runs were apart (or the company's collection cadence
  after one run), charging what its last run charged; a check that has missed
  two of its turns is taken as stopped. The screen says so.
- **The screens**: the month is a view picker kept in the address, so it
  follows between screens; every table is the standard search-and-filter
  table with its bar, download and pages; a website is drawn with its mark,
  square owned and round tracked; picking a website on the Overview narrows
  "What ran this month" to it; the Statement opens and closes on the month's
  balances and says which batch paid each line.
- **Bounded reads**: a month's rollups, the newest 900 charges for what is
  booked, and 900 statement lines — a month with more says so.
- **Words**: English and Italian; the assistant's kind reads "Ask" and the
  platform's own name.

Not yet, knowingly:
- Purchases, Top up and "Bought credits left →" (step 4).
- Sorting the Overview's two tables by their headings; the statement sorts.
- Seen in the browser pane: the session's own dev server cannot start while
  another session's runs in this folder, and the pane is not signed in there.
  Then seen in his own Chrome, signed in, on localhost:3000: Overview,
  Statement and Coming up draw as approved, empty until dev's first charges,
  with no console errors; the top bar now names Usage.

## Not in this plan

- A money value for a credit on customer screens: customers see credits.
- Credits pooled across an agency's clients.
- Pricing the Ronins done-for-you service, which stays a retainer.
- Changing PRODUCT.md (Outstanding question, 5).

## Change log

- 2026-10-05 — Planned from the pricing brainstorm; eight boards drawn and
  approved; written up at his request.
- 2026-10-05 — Step 1 built: every charge recorded with its real cost, nothing
  refused, no screen.
- 2026-10-05 — Step 3 built: the five Usage screens; the daily rollup per kind
  and website replaced by a monthly one and daily totals.
- 2026-10-05 — No charging at this stage, only monitoring costs to set prices:
  steps 4 and 5 parked.
