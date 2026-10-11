# Google Analytics — for your own websites

**Started 2026-10-09. Status: Phases 0 to 4 built and running on dev since
2026-10-10 (Anthony, 2026-10-10: "ok lets build this please") — Ronins'
website connected and collecting, its Collector Agent and daily schedule
created. Phase 5 (§13–§16) built the same evening (Anthony: "1 yes"), in
local commits on dev, not pushed (§17), with Analytics' visits beside Search
Console's clicks (§12); Q12 built and held for Anthony (§17). Every decision agreed (§1), every question
answered (§10) and the screens agreed and locked (§11), all on 2026-10-09.
A second round (§18) drawn and agreed 2026-10-11 (Anthony: "ok tis is
good"), not built: people, visit length, bounce rate, pages a visit, page
views first, page titles, campaigns, the page before, every event, home
countries only, products, visitors, live, and charts on every screen, with
Ask Hakken reading all of it — eleven phases, about twenty-six and a half
days, being built in one go from 2026-10-11 (§18.5).**
Change a decision here, with a date, before building anything that
disagrees with it. Progress: §8.

Anthony, 2026-10-09: "i want to integrate google analytics data inot the
platofmr … I ffeel like we have impression adn clicks and AI searches that
come to the site but we dotn have the en of the story with pgage views and
conversions adn what keywords relate to what money in connversions … I think
but have a total end to end helicopter view woul be super important to the
product." Then, on where it lives: "i want the analyticst o be ts on nav item
… We will createa a ntoehr nav item later for reprots where we will mix the
data soucrces … at the mement we are just concentrating on google analyucs in
tis section."

Google Analytics is phase-one scope in the product: "Search Console, GA4 and
order data" in the weekly record (`PRODUCT.md` §4), and "GA4 and Bing
Webmaster not built: no session/conversion ingestion … the results column of
the P&L" (`PRODUCT.md`, Part Two). The data-sources research lists it as day
one: "GA4 Data API. Free. Sessions and conversions by landing page and
source"
([data-sources-and-integrations-sept-2026.md](../../product/data-sources-and-integrations-sept-2026.md)).

**What this plan is not.** The end-to-end view — seen, clicked, visited,
enquired, paid — and the money a keyword brings are Reports, a later menu
item that mixes Search Console, Analytics and the rest. This section shows
Google Analytics alone. What it collects is kept so Reports can join it to
Search Console later (§4.3), but no Search Console figure appears here.

## 1. Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| GA1 | Where it lives | Its own item in the main left-hand menu, "Google Analytics" (named by §10, Q7), beside Search Console, listing the company's own websites; each opens its own Analytics pages. Mostly Google Analytics data — but since 2026-10-10 its strategy page joins Search Console to Analytics page by page (§13), the one place in the section that mixes them. Other mixing still waits for Reports. | Agreed, 2026-10-09: "it its own analytcs seciton"; changed 2026-10-10 (Anthony: "this platform is supposed to do the job of an SEO agency and SEO specialist — so the screen needs to be so powerful that strategies can be derived from them … i want it for the GA1 we need it") |
| GA2 | One connection per what | Per owned website, one "Connect with Google" serving both Search Console and Analytics. A company with several owned websites connects each. | Agreed, 2026-10-09: "one - per owned website - remeber that a lcient can have more than 1 owned site" |
| GA3 | An enquiry with no £ value in Analytics | The client chooses: set the value in Google Analytics (Hakken shows how, step by step — Hakken itself stays read-only and never changes their Analytics), or set it in Hakken. | Agreed, 2026-10-09: "agree if its not set in analytics we give them the coice set it it analytics or attribute teh balue in our platomt". Which wins when both exist: §10, Q1 |
| GA4 | The pages | Overview, Channels, Landing pages, All pages, Conversions (§5; named by GA19), plus the connection and tracking health pages. | Agreed, 2026-10-09 (all four offered, and All pages added) |
| GA5 | What counts as an enquiry or a sale | The client ticks them: Hakken lists the website's key events, pre-ticks the likely ones (a form sent, a call clicked, a purchase), and the client confirms. A scroll or a video play is never counted by accident. | Agreed, 2026-10-09 (the recommendation) |
| GA6 | A value set in Hakken | Per ticked event (a form sent £250, a call £150), applied to all history: past months show £ at once, and changing it re-prices the past too. | Agreed, 2026-10-09 (the recommendation) |
| GA7 | Shops | Enquiries and shop revenue: purchases and revenue per page and channel from Analytics' purchase events. No per-product detail. | Agreed, 2026-10-09 (the recommendation); changed 2026-10-11 by GA32: products added |
| GA8 | Who sees £ | Everyone in the company who can see the website, as Search Console. | Agreed, 2026-10-09 (the recommendation) |
| GA9 | History | As Search Console (GA16): the last 90 days on the first collection, days kept 60, longer periods asked of Google each week (§4). Anthony first chose "16 months"; that option said it matched Search Console, which was out of date — Search Console has kept days 60 and fetched 90 since 2026-10-07 ([keep-less-history-plan.md](keep-less-history-plan.md), part 3). | Settled by GA16, 2026-10-09. Year-on-year: §10, Q2 |
| GA10 | Visitors from AI assistants | Their own channel, "AI assistants", with each assistant listed under it (ChatGPT, Perplexity, Gemini, Copilot, Claude and others). | Agreed, 2026-10-09 (the recommendation). How: §4.4 |
| GA11 | A tracking health check | When a website connects, and every week (§6). | Agreed, 2026-10-09 (the recommendation) |
| GA12 | How a tracking problem is told | On the Analytics pages, and in the bell — to the platform's super admins only, never a company's own admins: they are system alerts. The connected notice too. | Agreed, 2026-10-09 (the recommendation, then to the company's admins); changed 2026-10-10 (Anthony: "These are system alerts not company alerts they need to only go to sys admins") |
| GA13 | Filters | Dates and device (mobile, desktop, tablet) on every page. No country filter. | Agreed, 2026-10-09 (the recommendation); changed 2026-10-11 by GA31: the website's home countries only, with a country choice |
| GA14 | Credits | Free in every plan, as Search Console: Google charges nothing for the data. | Agreed, 2026-10-09 (the recommendation) |
| GA15 | Landing pages by page group | A switch between each page and the website's own page groups ([page-groups-plan.md](page-groups-plan.md)). A website with no groups shows pages only. | Agreed, 2026-10-09 (the recommendation) |
| GA16 | Everything not asked | Search Console's conventions: who connects, the collector agent, settling, storage, disconnecting, the tables, owned websites only (§3–§5). | Agreed, 2026-10-09: "yes peaes follow the convestios of search console" |
| GA17 | Draw first | Yes — every screen drawn from the drawing kit and agreed before any code. | Agreed, 2026-10-09: "later when im home we can design up the screens and g through more quetsios" |
| GA18 | What Analytics shares with Search Console | As much as possible. Both are private to the company, so both are kept under the company's own website (its hold), and everything they have in common is stored once and named by the same number: the Google connection, page addresses, keywords, countries and devices, days and periods, and the code that collects, packs, settles and keeps them. Only the figures each one measures are kept apart (§4.6). | Agreed, 2026-10-09: "i would like as mich data normalisation between analytics and search console as possible please in our plan … as these are noth private to the compnay"; "there are core tings like keywrods, page uRL etc that are common". §4.6's details to agree with the drawings |
| GA19 | What they are called | "Conversions" everywhere on screen — the menu, the page, the columns, the rates — and a conversion's own name wherever one is meant ("Contact form sent", "Purchase"). Never "Enquiries" or "Sales" as the general word: a client may sell products or services, and not every conversion is an enquiry. | Agreed, 2026-10-09: "We need ot rname enquiries otr conversions across the wole p;arorm or use the conversion name where appropriate … Clietns could nbe proiducts or sevives and not every conversion will be an equiiry". Drawn the same day |
| GA20 | Devices and storage | Kept by device: only the small lists — the totals, the channels, and conversions by channel. The page lists (landing pages, all pages, conversions by landing page) are kept once, for every device; a device chosen on one is asked of Google there and then. Every page keeps its device filter (GA13). Estimated on 2026-10-09: keeping every list by device would take a shop the size of morehandles.co.uk from about 8 MB to about 25 MB, the size of its whole Search Console store; this keeps it near 8 MB. Measured in Phase 2. | Agreed, 2026-10-09: "ok agree" (on the canvas, asked "is this a big data store burden") |
| GA21 | The agent that collects | A new agent in Admin → Agents, "Google Analytics: Collector Agent", given a new role, "Google Analytics Collector", and a schedule of its own, "Google Analytics: Data Collection Scheduler", daily at 04:00 local (03:00 UTC) — the same time as Search Console's. Built as the Search Console: Collector Agent is (§4.1). | Agreed, 2026-10-09: "can we get them the same time as search console — i think we need to create a new agent for this in the agents section and give it a role of google analytics … I think we should call it "Google Analytics: Collector Agent" … and we need to create a schedule for it too" |
| GA22 | The screens, after review | Six changes: Overview leads with what changed most, and every table opens sorted by value; every landing page opens its own screen and every channel its sources; one matching property is shown for a yes, and the address step only when a property has several; the states people meet first are drawn; Tracking health shows its failing checks first; a conversion rate from fewer than 100 visits is greyed. | Agreed, 2026-10-09: "yes i agree with this" … "all of it", on the canvas review. The 100 visits, the five rows of what changed most and Tracking health's 5% unknown were confirmed the same day (§10, Q13). "Every table opens sorted by value" changed 2026-10-11 by GA26: Landing pages opens by visits, All pages by views |
| GA23 | Storage, speed and spend | Six changes under the surface, none to the screens: (1) the page lists are kept only as ready-made periods asked of Google, with days kept only for the small lists that draw the charts; (2) conversions are stored as columns of the list they belong to, never as a second list of the same pages; (3) the last two days are collected again, not four; (4) only what changed is written; (5) a list asked live is held until the next collection; (6) every screen has a reading-budget test at five times morehandles.co.uk, and storage is measured on Ronins and morehandles.co.uk before any client connects. (§4.1–§4.3) | Agreed, 2026-10-09: "Yes please", asked "Is this plan fully optimise for storage speed and spend" |
| GA24 | People | How many people, beside the visits they made, and how many were new or returning (§18). | Agreed, 2026-10-11: "Peopel and visits", then the screens: "ok tis is good" |
| GA25 | How visits went | Visit length, bounce rate and pages a visit, beside time engaged (§18). | Agreed, 2026-10-11: "we need visiti legnth bounce rate and paged per visit" |
| GA26 | Page views first, money second | Overview leads with visits, page views, people and engaged visits; value becomes a line under Conversions. Landing pages opens sorted by visits, All pages by views; Landing pages swaps Engaged for Bounce and leaves Value to Conversions and each page's own screen (§18). Changes GA22's "every table opens sorted by value". | Agreed, 2026-10-11: "i think we have too mch focus on money on the screens … googel analytuics gives us page views as people move arpidn the site … Wre cant forgetthis" |
| GA27 | Page titles | Each page's title over its address in the page tables (§18). | Agreed, 2026-10-11: "we need campaing and page titels" |
| GA28 | Campaigns | Its own page: visits from tagged links by campaign, and the ad keywords behind them (§18). | Agreed, 2026-10-11 (as GA27) |
| GA29 | The page before | Every page in All pages opens its own screen, showing the page or website each view came from (§18). | Agreed, 2026-10-11: "we ned the page before" |
| GA30 | Every event | An Events page with every event Google Analytics records, not only conversions, and each event's own screen (§18). | Agreed, 2026-10-11: "we need all events" |
| GA31 | Home countries only | Every figure is the website's home countries', as Search Console's; a country choice on every page lists them (§18). Changes GA13. | Agreed, 2026-10-11: "we shoud onyl be selctign oujr home countries". The other home countries asked when chosen, not kept: §18, Q17, agreed the same day |
| GA32 | Products | A Products page for a website with a shop: each product, and how far shoppers got (§18). Changes GA7. | Agreed, 2026-10-11: "we ned proiduct dara" |
| GA33 | Visitors | A Visitors page: new or returning, browsers, operating systems, and age, gender and interests where Google signals is on (§18). | Agreed, 2026-10-11: "we need demographisc data", after "why do i see nothignb abotu browsers" |
| GA34 | Live | A Live page: who is on the website now and the last 30 minutes, asked of Google once a minute only while the page is open and in front, never stored (§18). | Agreed, 2026-10-11: "WE EED RALTIME DATA"; asked "when the pge is not open it does not poll at all right" — right, it does not |
| GA35 | Charts | Every screen with figures has charts: over time where Hakken keeps days or asks Google when a screen opens, and bars for comparing pages, channels, browsers and events. The charts agreed on 9 Oct for a landing page's screen and Conversions, left off on 10 Oct without Anthony asking (§15), come back (§18). | Agreed, 2026-10-11: "thre is distinct lack of graphs and charts across the page" … "how many tijme do you want me to ask for more charrts and grahsp" |

## 2. How Google Analytics integration works

Read from Google's documentation and the trade press on 2026-10-09; nothing
called. Every name below is confirmed against a real property in Phase 0 (§7)
with the Data API's own `getMetadata` and `checkCompatibility`.

### 2.1 The APIs, not an MCP server

As for Search Console ([search-console-plan §2.1](search-console-plan.md)):
any Google Analytics MCP server is for one person's assistant on their own
computer. Hakken collects for many companies on a server, so it calls
Google's APIs directly:

- **The Admin API** (`analyticsadmin.googleapis.com`): the properties an
  account can see (`accountSummaries`), each property's web streams and
  their addresses, its key events, its time zone and currency.
- **The Data API** (`analyticsdata.googleapis.com`, `runReport`): the
  figures.

### 2.2 Getting in

- **Scope** `https://www.googleapis.com/auth/analytics.readonly`, read-only.
- **Whether Google calls it sensitive is not confirmed.** It is believed to
  be; if so, Google reviews the app before strangers can connect without a
  warning — a written reason, a short video of the app using it, the privacy
  policy. Google's own page puts the review at 3 to 5 working days. Phase 0
  (§7) checks the label on the consent screen. Search Console's scope needed
  no review.
- **The same Google app as Search Console's** (GA2): the scope is added to
  its consent screen. A website already connected for Search Console asks
  once more and Google adds Analytics to what it may read
  (`include_granted_scopes`), without asking for Search Console again.

### 2.3 What there is to read

In the screens' words, with Google's names:

| On screen | Google's name |
|---|---|
| Visits | `sessions` |
| Engaged visits, engagement rate | `engagedSessions`, `engagementRate` (a visit over 10 seconds, or with 2+ views, or a key event) |
| Time engaged | `userEngagementDuration` |
| Views | `screenPageViews` |
| Conversions (each ticked event, by its own name) | `keyEvents` with `eventName` |
| An event's value | `eventValue` — how a value set in Analytics reaches the API is confirmed in Phase 0 |
| Purchases, revenue | `ecommercePurchases`, `purchaseRevenue` |
| Landing page | `landingPage` (the path, without `?…`) |
| Page | `pagePath` |
| Channel, source | `sessionDefaultChannelGroup`, `sessionSource` |
| Device | `deviceCategory` |
| The website's own address | `hostName` |

### 2.4 What Google does not give

- **Keywords.** Google stopped passing search words to Analytics years ago.
  The money a keyword brings is worked out through the landing page, from
  Search Console's clicks — Reports' work, not this section's.
- **Which AI question sent a visitor.** Only that the visit came from an
  assistant.
- **Google's own AI Overviews and AI Mode.** Their clicks count as ordinary
  Google visits ("Organic Search").
- **AI robots reading the site.** They run no JavaScript; only server or CDN
  logs see them — a separate source.
- **Visitors who refuse cookies**, unless the website uses Google's Consent
  Mode with modelling. On UK websites with a cookie banner this can be a
  large share (§9).

### 2.5 Limits

- **Quotas**, for a standard (free) property: 200,000 tokens a day, 40,000
  an hour, 14,000 an hour for one app on one property, 10 requests at once.
  A request's cost grows with its rows, columns and dates; a request past a
  limit fails at once and is tried on the next step.
- **"(other)"**: when a day's list is too long, Google folds the rarest rows
  into one row called "(other)".
- **Thresholds**: with Google signals on, Google withholds rows with few
  visitors. The API says when it has done either, and the screen says so.
- **Settling**: a day's figures change for 24 to 48 hours.
- **Time zone and currency** are the property's own.
- **History**: the API's totals are believed not to be cut by the property's
  data-retention setting, which limits only Google's own explorations.
  Confirmed in Phase 0; GA9 asks for no more than a year in any case.

### 2.6 What Hakken already has

- **The Google connection for Search Console**
  ([search-console-plan §3](search-console-plan.md)): the
  `google-search-console` provider in `convex/connectorOAuthProviders.ts`,
  the `SEARCH_CONSOLE_GOOGLE_CLIENT_ID` / `_SECRET` pair, encrypted tokens,
  renewal, revocation, and the start and return at
  `/api/search-console/oauth/…`.
- **The Search Console Collector** (`convex/searchConsoleAgentRun.ts`): a
  built-in role with its own schedule, a run per website, judged alive by its
  last step (`convex/roleRuns.ts`).
- **The storage pattern**: day records holding a day's whole list, the
  ready-made periods (`convex/searchConsolePeriodBooks.ts`), and pages
  numbered once per hold (`convex/searchConsolePageRefs.ts`, into
  `searchConsolePageAddresses`). `websitePages`, planned in
  [core-data-normalisation-plan §6.2](core-data-normalisation-plan.md), was
  never built — that step was built another way — so the page numbering
  Analytics shares is the hold's (§4.6).
- **Page groups** ([page-groups-plan](page-groups-plan.md)), **the bell**
  ([tasks-and-notifications plan](tasks-and-notifications-plan.md)), and the
  Search Console section's layout and tables.

## 3. Connecting (Phase 1)

One sign-in per owned website (GA2): one set of encrypted tokens for the
website, read by both sections; each section keeps its own choice — Search
Console's property, Analytics' property and address. How the shared record is
named and how today's Search Console connections move into it is settled in
the build, with a test that both sections read the same tokens.

**Built 2026-10-10** (`convex/googleConnection.ts`, `googleSchema.ts`): the
shared record is `googleConnections` (the website, the Google account, the
access granted) with its tokens in `googleTokens`; each section's connection
names it by `googleConnectionId`. It is one per website **and Google
account**: nearly always one account serves both, so there is one set of
tokens. An agency whose Search Console is on its own account and whose
client's Analytics is on the client's keeps two, and neither section's
sign-in breaks the other's. A section waiting for a sign-in — never
connected, choosing, or needing reconnecting — takes up one started from the
other section; a working section keeps its own. The return address stays
`/api/search-console/oauth/callback`, as registered with Google (§7, step 3).
Today's Search Console sign-ins move across with the migration
`2026-10-10-shared-google-connection`.

The screens (pages, never pop-ups):

1. **Not connected**: the Analytics page says what it will show, with
   Connect Google Analytics for an admin, or "Ask a company admin to connect
   it" for anyone else. A website already connected for Search Console shows
   Add Google Analytics, and Google asks only for the extra access.
2. **Google's own sign-in and consent.**
3. **Choose the property**: when exactly one of the account's properties
   has a web stream for the website's address, it is shown for a yes, with
   "Not this one? See all" (GA22). Otherwise the properties, the matching
   ones first. None matching says so, with the account's email and a way to
   try another account.
4. **One property, several websites**: no step to take (§10, Q16). When a
   property's visits come from more than one address, Hakken reads the
   website's own and leaves the rest out, and one line on the next screen
   says which address it reads. Every figure is read for that address only
   (`hostName`).
5. **Choose what counts** (GA5, GA3, GA6): the property's key events, the
   likely ones pre-ticked. Each ticked event shows its value from Analytics,
   or none, with two choices — set it in Hakken (a £ field) or set it in
   Google Analytics (the steps, in plain words). When Analytics has a value,
   it is used, and Hakken's fills only the events Analytics has none for, so
   a figure never has two answers (§10, Q1). Values are in the property's own
   currency (§10, Q8).
6. **Connected**: "Connected to property as name@… · Last updated …", with
   Disconnect, and Change for the events and values.

- **Who** (GA16): the company's admins and super admins connect, disconnect,
  tick events and set values. Everyone else in the company sees the figures;
  a read-only user never sees the buttons.
- **When access goes**: marked "needs reconnecting", the page says why, the
  figures already held stay.
- **Disconnecting** keeps what was collected, marked "Disconnected on …",
  and stops collecting. Disconnecting Analytics alone leaves Search Console
  connected, and the other way round.
- **Tenant isolation**: a connection, its tokens and every figure it brings
  are the company's alone, read only through the owned website's hold, with
  a guard test that fails a read that goes round it (as `holdLists.ts`).
- Ronins' own website connects once more to add Analytics.

## 4. Collecting (Phase 2)

### 4.1 When

- **The Google Analytics: Collector Agent** (GA21), set up exactly as the
  Search Console: Collector Agent is:
  - **The agent**: created in Admin → Agents → Manage Agents, named
    "Google Analytics: Collector Agent", and given a new role, "Google
    Analytics Collector", in a Google Analytics group of its own in the Role
    dropdown — `GOOGLE_ANALYTICS_COLLECTOR` beside `SEARCH_CONSOLE_COLLECTOR`
    in `convex/utils/agentRoles.ts` (the roles, their groups and the
    validator), a branch of its own in `convex/agentRunStartService.ts` that
    starts its job, and the role's name in English and Italian. No model is
    called, so a run costs nothing.
  - **The schedule**: created in Admin → Agents → Schedules, "Google
    Analytics: Data Collection Scheduler", running the agent daily at 04:00
    local (03:00 UTC) — the same time as Search Console's — and active.
  - **Its runs**: as Search Console's (`convex/searchConsoleAgentRun.ts`).
    The schedule's run starts a run of its own for each website connected to
    Google Analytics, a few seconds apart; each works in steps of a week at
    most, then settles; one schedule's runs at a time; every line in the
    agent's Observability. Free, so every connected website daily, whatever
    its company's collection schedule.
- **Each run**: the newest day, and the last two again while Google's
  figures settle — they settle in 24 to 48 hours (§2.5); Search Console's
  four days are for its own slower settling (GA23).
- **A newly connected website** starts collecting at once (§10, Q15):
  saving what counts starts a run of the Google Analytics: Collector Agent
  for that website alone — as Search Console's main-country change already
  does (`startRoleRun`) — with its last 90 days, newest week first, a week a
  step. After that, the daily schedule. Search Console waits for its next
  scheduled run; this does not, so a client never meets an empty page for a
  night.
- **Each week**: the 90 days, the 90 days before and the 12 months, asked of
  Google as ready-made totals (as Search Console since 2026-10-07), and the
  same periods a year before, so year-on-year shows from day one at no
  storage cost (§10, Q2). How the screens offer it — a "Compare with" choice
  beside the dates — is drawn and agreed before Phase 3 is built.
- **No queue waits on a person**: a step that stops at a limit books the
  next (`AGENTS.md`).

### 4.2 What, per website

Four lists, each for the website's own address (GA20, GA23). Each carries
its conversions as columns of its own rows — every ticked event's count and
value, and purchases and revenue (GA7) — never as a second list of the same
pages or channels. How one ask brings the conversions with the visits is
confirmed in Phase 0 (the Data API's `keyEvents:<event>` metrics).

| List | Kept | Read by |
|---|---|---|
| The website's totals, with its conversions | Day by day, 60 days, by device | Overview's figures and chart; Conversions' figures and chart |
| Channels with each source, with their conversions | Day by day, 60 days, by device | Channels, a channel's sources, AI assistants (§4.4); Conversions' channels |
| Landing pages, with their conversions | Ready-made periods only, every device | Landing pages, page groups (GA15); Conversions' landing pages |
| All pages, with the conversions made on each | Ready-made periods only, every device | All pages |

The two small lists are kept by day because the charts draw them. The two
page lists are the big ones, so they are never kept by day: Google sends
their periods ready-made (§4.3).

Asked live and held: a device chosen on a page list (GA13, GA20), and a
landing page's own chart and channels when its screen opens (GA22). Each is
asked of Google there and then and held until the next collection, so
paging, sorting and searching never ask again (GA23). Nothing is crossed
that no screen reads: no country, and no landing page by channel kept.

### 4.3 Storage — Search Console's, from the start

- A day is one record per website and kind, holding that day's whole list,
  split into records of 2,000 rows (Convex: 1MB a record) — for the two small
  lists only (§4.2, GA23).
- Pages by number, through the hold's one page numbering, shared with
  Search Console (§4.6). Search Console and Analytics then name the same page
  by the same number — what Reports will join on.
- Days kept 60. Ready-made periods for the last 7, 30 and 90 days and 12
  months, each with the period before it and the same period a year before
  (§10, Q2). The small lists' periods are added up from their days; the page
  lists' periods are asked of Google ready-made — 7 and 30 days each day, 90
  days and 12 months each week — and never added up from days, so neither a
  screen nor a collection adds up a page list (GA23). Any other dates are
  asked of Google when chosen.
- Only what changed is written (GA23): a period, or a page's record in
  `holdPages`, whose figures did not move is left as it is.
- Every screen reads its ready-made period by index, searched, sorted and
  paged on the server; nothing is added up while a screen loads.
- A keep rule for every table ([keep-less-history-plan](keep-less-history-plan.md)),
  each in the storage measure.
- A Hakken value (GA6) is applied when read, not written into the days:
  changing it re-prices all history at once, with nothing rewritten.
- Proved, as the core data plan proves its screens (its rule 4): every
  screen has a reading-budget test at five times morehandles.co.uk's size,
  inside half of Convex's limits, or three quarters with a search; and
  storage is measured on Ronins and morehandles.co.uk before any client
  connects — a gate the build passes, not a note (GA23).

### 4.4 AI assistants

Google added its own "AI Assistant" channel on 13 May 2026. It needs no
setup, but it does not cover visits before then, and Perplexity and Claude
are reported still to land in "Referral" (seosherpa.com, techwyse.com). So a
visit counts as AI assistants when Google says so or its source is on
Hakken's list of assistants (chatgpt.com, perplexity.ai, gemini.google.com,
copilot.microsoft.com, claude.ai and others) — one list, in one place in the
code, with a test.

### 4.5 Logged

Every run in the agents' runs and logs; each page says when its figures last
came in.

### 4.6 Shared with Search Console — stored once (GA18)

What Search Console keeps today, read in the code on 2026-10-09: every one of
its tables (`convex/searchConsoleSchema.ts`) belongs to one hold — the
`companyWebsites` row that is one company's own website — read only through
indexes that start `by_hold`, and `convex/websiteTenancyGuard.test.ts` holds
it to that. Analytics is private to the company in the same way, so it lives
under the same hold. The core data plan's first rule (§3 there: each keyword
and page stored once per owner, and for private data the owner is the hold)
then makes the hold the one owner of both.

| What | Today, Search Console's alone | Shared with Analytics |
|---|---|---|
| The Google connection | `searchConsoleConnections` and `searchConsoleTokens`, one per hold | One Google connection per hold — the account, the encrypted tokens, the access Google granted, whether it works — read by both sections (GA2). Each section keeps only its own choice (Search Console's property; Analytics' property, web stream and address) and its own collecting state. |
| Page addresses | `searchConsolePageAddresses`: the hold's pages, numbered in the order first seen, 250 a record (`searchConsolePageRefs.ts`) | One numbering for the hold, used by both. Analytics' paths are joined to the website's own address (`hostName`) and cleaned by the one page rule (`normalisePage`) before they are numbered, so `/ai-agency/` in Analytics and `https://www.ronins.co.uk/ai-agency/` in Search Console are one page with one number. |
| The hold's page list | `holdPages`: every page of the website once, with Search Console's "shown" and clicks | Analytics adds its own beside them (visited, and visits in the last 90 days), so one row says what every source knows of a page. |
| Keywords | Search Console's keyword books, per hold, country and month | Analytics brings no search words (§2.4), so what a keyword earns is joined through the shared page number (Reports). If a later ask reads words — a campaign's `utm_term`, a Google Ads keyword — they go into the hold's same keyword store, never a second one. |
| Countries and devices | Google's own strings as Search Console sends them (`gbr`, `MOBILE`) | One list of codes each, in one place in the code. Analytics' `deviceCategory` (`mobile`) and any country it sends are mapped onto the same codes. |
| Page groups | Read by page address | Read through the same page numbers by both sections (GA15). |
| Days and periods | Day records packed 2,000 rows a part (`utils/searchConsolePacks.ts`), days kept 60, periods of 7, 30, 90 days and 12 months with the period before each, a build swapped in whole when it is ready | The same packing, the same periods and the code that builds them, the same settle-and-swap, one days-kept setting — moved into shared code and used by both. Analytics keeps days only for its two small lists, and asks Google for its page lists' periods ready-made (GA23). |
| Collecting | The Search Console Collector's own dispatch and steps on the generic `roleRuns.ts` | One runner for both sections' steps. The Google Analytics: Collector Agent holds a second role on it, with a schedule of its own at the same time (§4.1, GA21), not a second runner. |
| Keep rules and the storage measure | `keepRules.ts`, `storageMeasure.ts` | Analytics' tables join the same rules and the same measure. |
| Tenancy | The guard lists Search Console's tables | Analytics' tables join the same list under the same rule. |

**Kept apart: only the figures.** Search Console's clicks, impressions and
positions and Analytics' visits, conversions and value measure different
things, so each keeps its own day and period records — each naming pages by
the shared number and devices by the shared codes.

**The cost.** About two and a half days more than §8 said before GA18:
moving Search Console's connection into the shared one, with today's
connections moved across once (Phase 1, a day); sharing the page numbering,
the codes, and the packing and period code (Phase 2, a day and a half). Two
choices are open: §10, Q11 and Q12.

## 5. The screens (Phase 3)

Drawn first (GA17), from the drawing kit, with Ronins' real figures.

- **The section**: "Google Analytics" in the main menu after Search Console,
  `/app/analytics`, listing the company's own websites; each opens
  `/app/analytics/<site>/…` with its own side menu, laid out as Search
  Console's. Dates and device at the top of every page (GA13).
- **Overview**: visits, engaged visits, conversions, value (conversions' and shop
  revenue), each with the change on the period before; what changed most —
  the five pages and channels whose conversions and value moved most against
  the period before (GA22); a chart over time; the channels and landing
  pages that made the most, by value; a line from the tracking health check
  (§6); and, when the website has no Consent Mode, one line saying Google
  Analytics counts only visitors who accept cookies (§10, Q6).
- **Channels**: each channel — visits, engagement rate, conversions,
  conversion rate, value, change. Every channel opens into its sources (the
  websites behind Referral, the search engines behind Organic Search), and
  AI assistants into each assistant (GA22).
- **Landing pages**: each page, or each page group (GA15) — visits,
  engagement rate, time engaged, conversions, conversion rate, value, change.
  Every page opens its own screen (GA22): its figures, a chart over time,
  where its visits came from, and what they converted into.
- **All pages**: every page viewed — views, time engaged, and the conversions
  made on that page (see §10, Q4); each opens the same page screen.
- **Conversions**: each ticked event over time with its value, then
  the landing pages and channels that brought it; for a shop, purchases,
  revenue and the average order.
- **Connection** and **Tracking health**: §3 and §6.

Tables as Search Console's: numbered pages of 25, 50, 75 or 100 rows, sorted
by their headings over the whole list, an exact total, fitting the page.
Every long table is this standard one — search box, filters where there are
any, table bar, sorting headings, numbered pages — never a bare table
(Anthony, 2026-10-09: "Any long table like this needs to be this
standard"); only a short top-five list inside a panel, with "See all" to
its full table, is the small list part.
They open sorted by value — money first — and All pages by its conversions
(GA22). A conversion rate from fewer than 100 visits is greyed, with "Under
100 visits: too few to trust" on hover (GA22).

The states people meet first are drawn too (GA22): the hours between
connecting and the first run, the first 90 days coming in a week at a time
(newest first, so the last 30 days are there early), a website with nothing
ticked as a conversion, a device being asked of Google (GA20), and a
connection that needs fixing, seen from the figure pages.

Words: "Visits", not sessions; "Conversions", not key events, enquiries or
sales — and a conversion's own name wherever one is meant ("Contact form
sent", "Purchase") (GA19).
English and Italian together (`messages/en.json`, `messages/it.json`).

## 6. Tracking health (Phase 4)

Run when a website connects and every week (GA11). Each check says what is
wrong, why it matters and how to fix it, in plain words:

1. **Nothing counted**: no key events in the property, or none ticked.
2. **No value**: a ticked event with no value in Analytics or Hakken (GA3).
3. **Tracking stopped**: no visits for a day after weeks of steady ones.
4. **A sudden fall** in visits or conversions: a week 40% under the four
   weeks before, on a website with at least 100 visits a week (§10, Q5).
5. **Its own address as a referral**: a redirect or a second domain breaking
   visits in two.
6. **Payment pages as referrals** (PayPal, Stripe, Worldpay…), taking the
   credit for sales.
7. **Too much unknown**: more than 5% of visits "Unassigned" or of landing
   pages "(not set)" (§10, Q13).
8. **Strangers in the property**: visits recorded on other addresses — a
   staging site, spam.

Shown on Overview and on its own Tracking health page, the failing checks
first and the passing ones folded into one line (GA22). When a check starts
failing, the platform's super admins get one alert in the bell (GA12, changed
2026-10-10) — once, not every week it stays failing. A company's own admins
are never told in the bell: these are system alerts.

## 7. What Anthony does (Phase 0)

**Done 2026-10-10:** Ronins' website connected with Analytics and its first
60 days collected (change log).

No one else can: it is his Google account.

1. In the Google Cloud project that holds Search Console's app, enable the
   Google Analytics Data API and the Google Analytics Admin API.
2. On the OAuth consent screen, add `…/auth/analytics.readonly` and read the
   label Google gives it. Non-sensitive: nothing more. Sensitive: submit the
   app for review (the reason, a short video, the privacy policy) — built and
   tested meanwhile, with Ronins' own website as a test user.
3. No new client or secrets: Search Console's are reused, and the return
   address is unchanged.
4. When built: reconnect Ronins' website from its Analytics page, adding
   Analytics — the sign-in is his.

## 8. Phases and size

| Phase | What | Size |
|---|---|---|
| 0 | Anthony's Google setup (§7) | Half an hour of his time, plus Google's review if the scope is sensitive |
| — | The drawings (GA17), agreed before any code | One day |
| 1 | Connecting: the shared Google connection, with Search Console's moved into it (§4.6), Analytics added, the property and address, events and values (§3) | Three days |
| 2 | Collecting: the Google Analytics Collector role built, then the Google Analytics: Collector Agent and its schedule created in Admin on dev (GA21), the four lists and their ready-made periods (GA23), the first 90 days, the daily and weekly asks, day records, the shared page numbering, codes and packing (§4.6), ready-made periods, keep rules, measured on Ronins (§4) | Four and a half days |
| 3 | The section and its pages (§5), with the page screen, a channel's sources and the first states (GA22) | Five and a half days |
| 4 | Tracking health and the bell (§6) | One and a half days |
| 5 | Added 2026-10-10, once the review canvas is agreed (§13–§16): | Eight and a half days |
| | Heroes and attention: Search Console joined to Analytics page by page, the six rules and what each fix is worth, the page's own view, making a Hakken task (§13) | Four days |
| | What Hakken sees on sixteen screens, from the shared part (§14) | Two and a half days |
| | The locked screens changed as the canvas draws them (§15), each only once agreed | One and a half days |
| | The three things found while drawing (§16) | Half a day |
| — | The second round's drawings (§18.2) and how it is built (§18.6, §18.7), 2026-10-11 | One day — done |
| 6–16 | Added 2026-10-11, the second round, phase by phase in §18.5 | Twenty-six and a half days |

About fourteen and a half days of building after Phase 0 and the drawings;
about fifteen and a half with them (two and a half more since GA18, §4.6,
and a day and a half since GA22). With Phase 5, about twenty-four. With the
second round (§18), about fifty-two.

Every phase ends with its tests, Google faked as for Search Console (the
sign-in, a missing scope, renewal, revocation, paging, quotas, "(other)" and
thresholds, the four days again, two websites in one property, tenant
isolation, the screens), and the full gate. Phase 3 ends in the browser on
Ronins' own connected website.

**Progress (corrected 2026-10-10, against the dev database and the app):
Phases 0 to 4 built and running — about fifteen and a half of the
twenty-four days, about 65%. Phase 0: done, Ronins connected. Phase 1: 100%.
Phase 2: 100% built — the Collector Agent and its daily 04:00 schedule were
created in Admin on dev on 2026-10-10 and are switched on; two decisions wait
on Anthony (§12), and storage on morehandles.co.uk is measured once it
connects. Phase 3: 100% — the section reads Ronins' real figures. Phase 4:
100%. Phase 5: 100% built 2026-10-10 (§17), and Analytics' visits beside
Search Console's clicks; Q12, about three days, built and held for
Anthony's word. Everything but Q12 is built: about 24½ of 24½ days; with
Q12, about 89% is on dev.** What was built, and
where the build differs from the words above, is §12.

**Progress, 2026-10-11: the second round (§18) drawn, agreed and planned,
with how it is built (§18.6) and its What Hakken sees (§18.7). Phases 6 to 13
built on dev, each committed and none pushed, and "people who converted
after it" (half a day more) — twenty-one and a half of twenty-seven days,
about 80%; five and a half left. Both rounds: about forty-seven of fifty-two
and a half days, about 90%.**

## 9. Risks

- **Google's review** (§2.2): a sensitive scope means a few days' wait before
  clients other than test users can connect without a warning.
- **Visitors who refuse cookies** (§2.4): Analytics' visits and enquiries can
  be well under the real ones. Said on screen? §10, Q6.
- **"(other)" and thresholds** (§2.5): a big or quiet website loses rows; the
  screens say so whenever Google says so.
- **Quotas** (§2.5): about twenty small asks a day for a website — the two
  small lists, and the page lists' 7- and 30-day periods with the period
  before and the year before (GA23) — are far inside them, and so are the
  lists asked live (GA20, GA22), each asked once and held. The weekly
  12-month asks are the heaviest, measured on Ronins in Phase 2.
- **An event's value** (§2.3): how a value set in Analytics reaches the API
  is confirmed in Phase 0, before Phase 1's value choice is built.
- **Google's AI channel is incomplete and new** (§4.4): Hakken's own list
  fills the gap and is kept up.
- **The name**: the client's item is "Google Analytics" (§10, Q7), so it
  never reads as Admin → System Settings → Analytics
  (`/admin/settings/analytics`, the platform's own usage). The sidebar's
  active-item key `'Analytics'` (`SidebarNavigation.tsx`) stays Admin's; the
  new item takes its own key.
- **Size**: estimated on 2026-10-09 at about a third of keeping every page
  list day by day (GA23) — for a shop the size of morehandles.co.uk roughly
  3 MB rather than 8 — and measured on Ronins and morehandles.co.uk before
  any client connects, as a gate (§4.3).

## 10. Questions — every one answered, 2026-10-09

1. **Both values set** (GA3): use Analytics' value and let Hakken's fill only
   the gaps, so a figure never has two answers? Recommended: yes.
   **Answered 2026-10-09: yes.**
2. **Year-on-year** (GA9): also ask Google each week for the same period a
   year before, so year-on-year shows from day one at no storage cost?
   Recommended: yes. **Answered: yes.**
3. **Connecting from Analytics first** (GA2): does the one sign-in also ask
   for Search Console, so both are ready? Recommended: yes, both at once,
   each section then choosing its own property. **Answered: yes.**
4. **All pages** (GA4): Analytics gives the enquiries made on a page (the
   form sent on /contact) simply; "visitors who saw this page and enquired
   later" is not a simple Analytics figure. Show the first? Recommended: yes. **Answered: yes.**
5. **A sudden fall** (§6): how big a fall, against what? Recommended: a
   week's visits or enquiries 40% under the four weeks before, on a website
   with at least 100 visits a week. **Answered: yes.**
6. **Cookie refusers** (§9): say on Overview that Analytics counts only
   visitors who accept cookies? Recommended: yes, one line, when the website
   has no Consent Mode. **Answered: yes.**
7. **The menu name** (§9): "Analytics" while Admin has a page of that name?
   Recommended: keep "Analytics" for clients; the admin page can become
   "Platform usage" later. **Answered: "Google Analytics" — so the
   two never share a name, and the admin page keeps its own.**
8. **Currency**: a property in dollars or euros shows its own currency, and
   values set in Hakken are in that currency? Recommended: yes. **Answered:
   yes.**
9. **Ask Hakken**: give the assistant Analytics' figures now, or with
   Reports? Recommended: with Reports. **Answered: with Reports.**
10. **The weekly email**: the reserved "Weekly website performance" email
    ([outbox-and-preferences-plan](outbox-and-preferences-plan.md)) reads
    Analytics now, or with Reports? Recommended: with Reports. **Answered:
    with Reports.**
11. **The shared tables' names** (GA18, §4.6): give the shared connection and
    page numbering names of their own (a Google connection, the hold's page
    numbers) and move Search Console's rows into them once — or leave them
    named for Search Console and let Analytics read them? Recommended: names
    of their own, moved once in Phases 1 and 2: a table named for one section
    and read by two is where the next drift starts. **Answered: yes.**
12. **One record of each page's address** (GA18, §4.6): `holdPages` names a
    page by its address while the numbering holds it again. Should
    `holdPages` hold the shared number instead, so the hold keeps each
    address exactly once? Recommended: yes, in Phase 2, measured on Ronins
    and morehandles.co.uk first, as the core data plan measured its steps.
    **Answered: yes.**
13. **Claude's numbers** (GA22, §6): conversion rates greyed under 100
    visits, five rows in "What changed most", and "Too much unknown" warned
    above 5% of visits. **Answered: keep all three.**
14. **The top-five lists** (§5): keep the short lists inside panels — on
    Overview, a landing page's screen and Conversions — as short lists with
    "See all" to their full standard table. **Answered: yes.**
15. **The first figures** (§4.1): wait for the 04:00 run, as Search Console
    does, or start collecting as soon as a website connects? **Answered:
    start at once.**
16. **The address step** (§3, step 4): confirm the address Hakken chose, or
    choose it automatically with one line saying which? **Answered:
    automatic, with the line.**

## 11. The agreed screens — locked 2026-10-09

Anthony, 2026-10-09: "ok this is good i liek the designs", then yes to
locking them (§10). The twenty screens on the canvas "Analytics — Google
Analytics screens" (https://claude.ai/artifact/9ET3p2eSq8kNdsni5QPHRR) are
the look the build follows: their parts, their order and their words. A
picture of each is kept in `docs/plans/assets/google-analytics/`, numbered as
on the canvas:

| # | Screen | Picture |
|---|---|---|
| 1 | Google Analytics — your websites | `01-your-websites.png` |
| 2 | Overview | `02-overview.png` |
| 3 | Channels | `03-channels.png` |
| 4 | Channels → AI assistants | `04-ai-assistants.png` |
| 5 | Landing pages (pages or page groups) | `05-landing-pages.png` |
| 6 | All pages | `06-all-pages.png` |
| 7 | Conversions | `07-conversions.png` |
| 8 | Conversions — a shop | `08-conversions-a-shop.png` |
| 9 | Tracking health | `09-tracking-health.png` |
| 10 | A tracking problem in the bell | `10-a-tracking-problem-in-the-bell.png` |
| 11 | Not connected yet | `11-not-connected-yet.png` |
| 12 | Choose the property | `12-choose-the-property.png` |
| 13 | Choose what counts (the address chosen for you) | `13-choose-what-counts.png` |
| 14 | Connection | `14-connection.png` |
| 15 | A landing page's own screen | `15-a-landing-page.png` |
| 16 | A channel's sources (Referral shown) | `16-a-channels-sources.png` |
| 17 | The first 90 days coming in | `17-the-first-90-days.png` |
| 18 | Nothing counted yet | `18-nothing-counted-yet.png` |
| 19 | A device asked of Google | `19-a-device-asked-of-google.png` |
| 20 | Needs reconnecting | `20-needs-reconnecting.png` |

What holds on every screen, from the review on the canvas the same day:

- Every part from the drawing kit — no new parts were needed.
- "Conversions", never "Enquiries" or "Sales" as the general word (GA19).
- Every long table is the standard one (§5): search, filters where there
  are any (Page group on the page tables), table bar, sorting headings,
  numbered pages; it fits the page at 1440 and 1366 pixels without
  scrolling sideways. Page addresses wrap; number columns are as wide as
  their short headings ("Engaged", "Time"); the conversion rate sits under
  the conversion count as "1.0% of visits".
- No half-width panels holding page addresses or other long text: they
  stack full width.
- Tables open sorted by value, All pages by its conversions (GA22).

Changing any of this means drawing it and agreeing it again first. When a
screen is built it gets a look test against its picture
(`docs/developer/drawing-guide.md`, "Building").


## 12. Built — 2026-10-10

What exists, by phase, and every place the build had to say something the
sections above did not. Everything was built and tested with Google faked,
then Ronins' real property was connected and collected the same day (§7).

**Checked on dev, 10 Oct 04:00:** Search Console's scheduled collection ran on
the shared sign-in after the move — ronins.co.uk 1,258 rows, morehandles.co.uk
2,990, conterraops.com collected — and its Connection page reads the account
from the shared record. The Google Analytics section shows in the menu after
Search Console, and ronins.co.uk offers "Add Google Analytics". The whole test
suite passes (857 files).

**Phase 1 — connecting** (`googleConnection.ts`, `googleAnalyticsConnect.ts`,
`googleAnalyticsApi.ts`): the shared sign-in (§3, "Built"); Search Console
moved onto it, its tokens and page numbers moved on dev by two one-time
migrations, then the old tables removed. Analytics' connection: the
properties with the website's first; one matching property shown for a yes;
the website's own addresses read (`hostName`) and the rest left out; the key
events, the likely ones ticked and a scroll never; Analytics' value or Hakken's
(Analytics' wins, §10 Q1); disconnecting; a website no longer held taking
everything with it.

- An event's value "in Analytics" is the key event's default value, or else
  the average value sent with it over 30 days. Phase 0 confirms this (§9).
- The property's role ("Viewer" on board 14) is left off the Connection
  page: Google gives no one's role to a read-only sign-in.

**Phase 2 — collecting** (`googleAnalyticsAgentRun.ts`,
`googleAnalyticsCollect.ts`, `googleAnalyticsLists.ts`): the role "Google
Analytics Collector" in a Google Analytics group of its own; a run per
website; saving what counts starts the first collection at once; the days of
the totals and channels by device; every list's ready-made periods asked of
Google; only what changed written; each build written into the slot screens
are not reading and flipped whole; live lists held until the next
collection; the hold's page numbers shared with Search Console
(`holdPageAddresses`, §10 Q11); keep rules; the tenancy guard; a reading
budget at five times morehandles.co.uk (`googleAnalyticsLoad.test.ts`).

- **The first collection fetches the 60 days kept, not 90**, a week a step
  newest first: days past 60 would be dropped at once (§4.3). The 90 days and
  12 months come as ready-made lists in the same run, so board 17's words
  stand.
- **The days asked each run** are every day after the newest held and the two
  before it again: a morning missed is caught by the next.
- **Every list's ready-made periods are asked of Google**, the small lists'
  too (§4.3 had the small lists' added up from their days): one way for all
  four, and the days kept 60 could not add up a 90 days or 12 months anyway.
  Each ask costs little; a run asks about 32 lists a day and 52 more weekly.
- **The year before** is asked weekly for the 90 days and 12 months, as §4.1
  says. For the 7 and 30 days it waits for the "Compare with" choice to be
  drawn (§4.1), as nothing shows it yet. "A year before" is 52 weeks before,
  so each day falls on the same weekday.
- **Every key event of the property is kept as a column**, not only those
  counted: ticking one later counts its past at once (GA6's rule, applied to
  what counts too).
- **The agent and its schedule exist:** the Google Analytics: Collector
  Agent and "Google Analytics: Data Collection Scheduler" (daily 04:00) were
  created in Admin on dev on 2026-10-10 and are switched on.
- **Decided 2026-10-10 (Anthony: "yes to all"):** Analytics' visits go
  beside Search Console's clicks in `holdPages` (§4.6), and `holdPages` holds
  the shared page number instead of the address (Q12, below) — built with
  Phase 5. Storage is measured on Ronins (60 days, about 0.4 MB); connecting
  morehandles.co.uk to measure it there waits (Anthony, 2026-10-10: "no I
  don't want to cement yet"). It stays the gate before any client connects
  (§4.3).

**Q12, measured on dev 2026-10-10.** `holdPages` holds 11,462 pages in
2.87 MB, of which the addresses are 0.73 MB (plus their index, about as
much again). Holding the page number instead saves about 1.3 MB on dev, but
every reader of `holdPages` — Discovery's Your pages, page groups, the
sitemap checks, under work in another session — then needs the address from
the numbering, which only an action can read whole. The measurement says
small saving, wide change: Anthony to decide. **Decided 2026-10-10: yes**
(Anthony: "yes to all").

**Phase 3 — the screens** (`src/app/(dashboard)/app/analytics/`): the section
in the main menu after Search Console; every locked screen but the bell's
(board 10, the bell's own part) built from the kit, in English and Italian,
with a look test against its outline (`googleAnalyticsLook.test.tsx`). The
device, dates and chart step sit at the top of every page.

- **Dates:** the four ready-made periods. Other dates asked live are not
  offered yet; none of the locked boards draws them.
- **The cookie line** (§10, Q6) always shows, worded "Unless {host} uses
  Google's Consent Mode…": the API does not say whether a website uses it.
- **Conversions' chart** puts every kind of conversion on one scale and
  value on its own: the Sites line chart learned to share a scale among some
  lines (`scaleOf`).
- **Channel names** are Google's own, in English in both languages, as in
  Google Analytics.

**Phase 4 — tracking health** (`googleAnalyticsHealth.ts`): the eight checks,
run when the first collection is in, every week, and when what counts is
saved; the failing ones first on their page; a check that starts failing
tells the platform's super admins in the bell once (GA12, as changed on
2026-10-10). Payment pages are a list in the
code (PayPal, Stripe, Worldpay, Opayo, Klarna, Clearpay and others).
Connecting tells the super admins too, as board 10 shows.

## 13. UX amends — the strategy page (drawn and signed off 2026-10-10)

Anthony, 2026-10-10, on the built screens: "its not easy to see which pages
need our attention and which are our heroes … this platform is supposed to do
the job of an SEO agency and SEO specialist — so the screen needs to be so
powerful that strategies can be derived from them." GA1 changed to allow it.

**Its job, in one sentence:** follow each landing page from Google's results
to the money it makes, say which stage is broken and what to do about it, and
what fixing it is worth — so the strategy is written, not left to be read
out of charts.

Read on Ronins' real figures the same day (30 days, Search Console joined to
Analytics by the shared page number — 70 pages in both): `/ai-agency/` is
shown 13,818 times at position 14 for 71 clicks, and converts 3.6% of its
visits — a page two that would pay most for moving up; `/wordpress-agency/`
is shown 17,854 times at position 15 for 10 clicks; a guide,
`/hub/kapferer-brand-identity-prism/`, brings 188 visits at position 4 and no
conversion; `/chatbot-agency/` fell from 16 visits to 7.

The parts, and the rules each diagnosis follows, are agreed with the drawing
before any code. Nothing here is built.

**Drawn 2026-10-10** on the review canvas (§15, screen 3), after three
rounds with Anthony the same day: "this is just information overload — its
TLDR"; "these table rows are too deep … need to show more info on a click
through"; "i dont like two set of hero boxes"; "will you stop making the
[expletive] long pages"; "these tabs should be above the search bar". What
follows is the drawing, to agree page by page with the rest of §15.

**Where:** its own page in the side menu, "Heroes and attention", after
Overview.

**What it joins:** Search Console's figures for each page (shown, position,
clicks, 30 days to Search Console's newest day) with Analytics' for the same
page as a landing page (visits, engaged visits, conversions, value, and the
30 days before), matched by the hold's shared page number (§4.6). On Ronins,
70 pages are in both.

**The parts, in order:**

1. What Hakken sees (§14).
2. One row of four figures, one per stage from Google to money: Shown in
   Google (264,403, at position 18 on average), Clicked (367, 0.14% of the
   showings), Visits from Google (466; 53% engaged, 6 converted), Value from
   Google (£120, half the website's £240). Under each, what there is to gain
   at that stage, or the heroes' share ("4 hero pages make £200"), linking to
   its tab below. The stage that loses most is marked as Overview's Value
   figure is. Never a second row of boxes.
3. "Pages to fix", then its tabs, then the search box, then the standard
   table (§5). The tabs: All, Heroes, Push to page one, Losing the click, Not
   converting, People leave, Falling, each with its count (on Ronins 38, 4,
   33, 1, 1, 0, 1). The table: Page, What to do (the page's biggest problem
   as a status label, and "Hero" beside it when it is one), Worth a month,
   and an icon to make it a Hakken task. One line a row; 25 rows to start,
   with the 25 / 50 / 75 / 100 choice; sorted by worth, the most first.
4. A row opens the page's own view: the way back, the same four stages for
   that page with the one where it loses most marked, then What to do — each
   problem the page has, why in one sentence with its own figures, what
   fixing it is worth a month, and the rule that flagged it — and "Make it a
   Hakken task". Links go to the page's screen (§5) and its searches in
   Search Console.

**The rules.** A page can have several; the row shows the one worth most.

| Label | When | What to do |
|---|---|---|
| Hero | One of the pages that, biggest first, make 80% of the website's value | Leave it alone; change it only with a test |
| Push to page one | At position 8 to 20, and shown 500 times or more | Work on the searches it is shown for on page two |
| Losing the click | In the top five, and clicked less than the website's own click rate at that position | Rewrite its title and description |
| Not converting | 50 visits or more, converting under half the website's own rate (Ronins: 1.45%) | Give it a next step to the service it supports |
| People leave | 30 visits or more, under 40% of them engaged | Make the page answer what was searched |
| Falling | Visits down 30% or more on the 30 days before, from at least 20 | Check its place in Google and what changed on it |

**What a fix is worth a month** uses the website's own figures, never an
industry average. These are: its click rate at each position, read from
Search Console over the same 30 days (Ronins' top three: 0.70%); the page's
own conversion rate when it has 100 visits or more, otherwise the website's
(1.45%); and the website's value per conversion (£20).

- Push to page one: the extra clicks in the top three (shown × the top
  three's click rate, less the click rate where it is now) × the conversion
  rate × the value per conversion.
- Losing the click: the clicks it should get at its position, less those it
  gets, × the conversion rate × the value per conversion.
- Not converting: visits × (the website's rate − the page's) × the value per
  conversion.
- People leave: visits × (the website's engaged share − the page's) × the
  website's conversions per engaged visit × the value per conversion.
- Falling: the visits lost × the conversion rate × the value per conversion.

On Ronins, about £435 a month in all; £373 of it in Google's results rather
than on the pages.

## 14. What Hakken sees — on every screen (drawn and signed off 2026-10-10)

Anthony, 2026-10-10, on the panel another session built for Discovery: "Its
the system acting as an SEO agent and SEO expert giving advice on the screen
… could add them across each of the analytics screens."

The same box as Discovery's
([discovery-detail-and-hakken-sees-plan.md](discovery-detail-and-hakken-sees-plan.md)),
built from its shared part, `HakkenSees`
(`src/ui/components/screens/HakkenSees.tsx`). So the built box follows that
part's look, not the drawing's slightly larger text. It sits under the page's
title. It says, in two or three sentences, what an SEO specialist would say
about that screen's figures. Then "Do first" lists up to three steps, each
with a quiet link to where it is done. As Discovery's DS5, it is written by
fixed rules over the figures the page already reads, with its words in
`messages/<language>.json`. There is no AI model, no purchase and no extra
read.

Sixteen screens carry it. The other three have nothing to read yet: Choose
the property, The first 90 days coming in, and the bell. What each said on
Ronins' figures:

| Screen | What it says first | Do first |
|---|---|---|
| Your websites | £240 from 12 conversions, down from £340 though visits rose 11%; one visit in ten lands on a page Analytics can't name | Open the website; fix tracking |
| Overview | Conversions fell from 17 to 12; most of the fall is direct visits (6 fewer) and the home page (3 fewer); 0.14% of Google's showings are clicked | Why direct stopped converting; the home page; move pages up Google |
| Heroes and attention | £373 of the £435 to gain is in Google's results; four pages make £200 | Push `/ai-consultancy/` and `/wordpress-agency/`; give the Kapferer guide a next step; leave the heroes alone |
| Channels | Google sends 466 of 826 visits and £120; direct converted 5 times, down from 11; AI assistants sent 61 visits | Direct visitors; AI assistants' landing pages |
| A channel's own screen (AI assistants) | ChatGPT sent 57, up from 7; only 28% stayed, against half of all visits; none converted | The pages ChatGPT sends people to |
| Landing pages | The Kapferer guide brings most visits (188) and no conversion; the home page and `/ai-agency/` make £140; 86 visits have no landing page | A next step on the guide; the 86 visits; unsorted pages into page groups |
| A landing page's own screen (the home page) | £80 a month, all 4 conversions from visits that didn't come from a search; its 37 Google visits converted none; position 30 | — |
| All pages | 12 conversions on 7 pages; `/ai-agency/` made 4 from 318 views; the Kapferer guide 417 views and none | Copy `/ai-agency/`'s next step; link service pages to the case studies that converted |
| Conversions | All 12 were form submissions; chat, phone and email are counted but never happened | Check those three fire |
| Tracking health | Three of 8 checks fail; one visit in ten can't be credited (about £25 a month) | Send the form and check it counts; load the tag before redirects |
| Connection | Four conversions at £20 each, only forms happened; every £ figure rests on that £20 | Check the £20 |
| Not connected yet | Search Console's 367 clicks can't say which became an enquiry | Add Google Analytics |
| Choose what counts | Only Form submission fired (12); Purchase is ticked though nothing is sold | Tick Form submission, untick Purchase; check chat, phone and email |
| Nothing counted yet | 826 visits but no way to say which pages make money; Form submission fired 12 times | Tick it |
| A device asked of Google | Phones brought 118 visits and 2 conversions, both from the home page; the Kapferer guide's phone visitors engage less (32% against 43%) | Read the guide on a phone |
| Needs reconnecting | As Overview, over the figures kept | As Overview |

## 15. The review canvas — every screen, 2026-10-10

Anthony, 2026-10-10: "can i see the entire analytics section screens on the
canvas please so i can sign off in one go … draw them all again on the screen
so i can review them and we can take it page by page".

The canvas "Google Analytics — every screen, for review"
(https://claude.ai/artifact/9HVzSBYntWP63s7in2UkJB) redraws the section on
Ronins' real figures: Analytics to 9 Oct, Search Console to 8 Oct. The top
row is the screens with figures and the bottom row the states people meet on
the way. Long lists keep the built standard: 25 rows to start, with the 25 /
50 / 75 / 100 choice (Anthony: "Don't change the list lengths keep them as
they are"). The locked canvas (§11) stays the record of what was agreed on
2026-10-09. **All 19 screens signed off 2026-10-10** (Anthony: "I'm good with
the 19 screens"), and the build started the same evening (Anthony: "1 yes").

| # | Screen | Against the locked screen (§11) |
|---|---|---|
| 1 | Google Analytics — your websites | What Hakken sees added |
| 2 | Overview | What Hakken sees added. The chart is visits a day with engaged visits, a dot on each day with a conversion. Kept: the four figures and What changed most. Left off to keep the page short: Channels and Landing pages that made the most, the cookie line and the tracking health line |
| 3 | Heroes and attention | New (§13) |
| 4 | Channels | What Hakken sees added |
| 5 | A channel's own screen (AI assistants) | What Hakken sees added, and four figures above its list: visits, engagement rate against the whole website's, conversions, value |
| 6 | Landing pages | What Hakken sees added; one line a row, the conversion rate beside the count ("4 · 2.8%") rather than under it |
| 7 | A landing page's own screen | What Hakken sees added. Its figures become the four stages from Google to money (Shown in Google, Clicked, Visits, Conversions), joining Search Console as §13 does. Left off: its chart and What its visits converted into. (Corrected 2026-10-11: the drawing agent left the chart off; Anthony never asked for it — "i nver asekd for any charts to be removed". Back by GA35, §18) |
| 8 | All pages | What Hakken sees added; conversions made here with their value beside them |
| 9 | Conversions | What Hakken sees added. Four figures: conversions, value, conversion rate, kinds that happened ("1 of 4"). Then What counts, each kind with how many, value and change. Then Where they came from, one table switching between landing pages and channels. Left off: the chart. (Corrected 2026-10-11: the drawing agent's choice, not Anthony's; back by GA35, §18) |
| 10 | Tracking health | What Hakken sees added; otherwise as built |
| 11 | Connection | What Hakken sees added; otherwise as built |
| 12 | Not connected yet | What Hakken sees added (when Search Console is connected) |
| 13 | Choose the property | As built |
| 14 | Choose what counts | What Hakken sees added; the ticks as Hakken sets them today (§16) |
| 15 | The first 90 days coming in | As built |
| 16 | Nothing counted yet | What Hakken sees added |
| 17 | A device asked of Google | What Hakken sees added once the answer is in; Ronins' real mobile figures |
| 18 | Needs reconnecting | As built, over Overview as drawn at 2 |
| 19 | Tracking alerts in the bell | As built: Hakken's super admins only (GA12) |

Conversions — a shop (§11, board 8) is not redrawn: Ronins sells nothing.
It stays as locked.

Two things on the canvas are stand-ins, said on it. Hakken forgets both once
a property is chosen: how many properties the Google account can see (drawn
as 3), and the list behind "See all".

## 16. Found while drawing — 2026-10-10

- **Each tracking alert reached the bell twice.** The same super admin got
  each of Ronins' three alerts at 07:43 and again at 07:58. GA12 says once.
- **The first ticks miss Ronins' conversions.** Ronins' key events are
  `purchase`, `form_submission`, `live_chat_event`, `phone_number_click` and
  `email_link_click`. Of these, only `purchase` is on Hakken's list of likely
  conversions (`convex/utils/analyticsEvents.ts`). So a first connect ticks
  Purchase, which never fired, and leaves Form submission (12 in 30 days)
  unticked. The common variants want adding, with names in both languages.
- **Gemini is listed twice** on the built AI assistants screen, as "Gemini"
  (3) and "gemini" (1). Assistants should be folded regardless of case; the
  drawing shows 4.

## 17. Built — Phase 5, 2026-10-10

Building since the evening of 2026-10-10 (Anthony: "1 yes"). What exists so
far, and where the build had to say something the sections above did not.

**§16, the three things found while drawing** (`b965bbc0`):

- A tracking alert reaches the bell once: a person whose bell already holds
  the same alert unread is not told again (`tellSuperAdmins`, `once`), on
  top of the checks' own "was failing" rule. The 07:43 and 07:58 alerts
  could not be traced to one code path; the bell itself now holds "once".
- The common event-name variants are likely conversions — Ronins'
  `form_submission`, `live_chat_event`, `phone_number_click` and
  `email_link_click` among them — each named in English and Italian, a test
  holding every likely conversion to a name in both. Purchase stays on the
  list: whether to tick an event that never fired is left as it was.
- An assistant named as a bare word (`gemini`, `ChatGPT`, `openai`) is that
  assistant in any case. Checked on Ronins: Gemini shows once, 4 visits.

**§13, Heroes and attention, and §15 screen 7** (`c2ad9ac8`): the rules
(`convex/utils/heroes.ts`), the reads (`convex/googleAnalyticsHeroes.ts`),
the page, a page's own view, and a landing page's own screen redrawn as the
four stages. Changes made while building, each smaller than a decision:

- **The click rate at each position is read from the website's searches**,
  as Search Console's Click rate by position reads it — not from its pages.
  A page's average position mixes every search it is shown for, so hardly a
  page averages a top-three place: read from pages, every push was worth
  nothing. Bands: the top three, 4–5, 6–10, 11–20, 21 and over.
- **The website's four figures read Search Console's own totals**: Google
  leaves some clicks off its page-by-page figures (Ronins, 30 days to 8
  October: 367 clicks in all, 189 across its pages). Each page reads its own.
- **Losing the click needs 100 showings**, as a conversion rate needs 100
  visits (GA22): without it Ronins listed eleven pages, ten shown under 30
  times, each worth under £1; the drawing showed one. It now lists two.
- **A page is one page however a source writes it**: Search Console's
  `/hub/what-makes-a-good-app/` and Analytics' `/hub/what-makes-a-good-app`
  were two rows; they join without the last slash, shown as Search Console
  writes it.
- **The stages' gains**: Clicked carries Push to page one and Losing the
  click; Visits from Google carries Not converting, People leave and
  Falling. The stage with more to gain is marked.
- **Read within half of Convex's limits at five times morehandles.co.uk**
  (`googleAnalyticsHeroesLoad.test.ts`): naming every page from both sources
  read 18.5 MiB; a page is now named only when a rule could flag it, and a
  page's own view reads that page alone. Search Console's period read gained
  `readPeriodUnnamed` for it.
- **"Make it a Hakken task"** opens Ask Hakken with the request written for
  the page and its problem, for Hakken to set up for a yes, as the Knowledge
  screens do; a row whose page a task already watches shows a tick.
- **A landing page's own screen** reads its four stages over the last 30
  days, whatever dates are chosen; where its visits came from keeps the
  dates chosen.

Checked on Ronins in Chrome: 38 pages to fix (the drawing's 38); 4 heroes
making £200 of £240; about £388 a month to gain, £327 of it in Google's
results; the Kapferer guide Not converting at about £55 a month, as drawn.

**§14 and §15, What Hakken sees on the other screens and the screens as
signed off** (`e6fb70cb`, `720d1da5`, `66de4ac9`, `657dfce6`, joined up in
`693fc24f`): the rules in `convex/utils/sees/analytics.ts`, one a screen,
each tested with its words in English and Italian; the box on Your
websites, Overview (and Needs reconnecting), Channels, a channel's own
screen, Landing pages (and a device asked of Google), All pages,
Conversions (and Nothing counted yet), Tracking health, Connection (and
Choose what counts) and Not connected yet; a guard that every one carries
it (`src/analytics-sees-drift.test.ts`). The screens as §15 lists:
Overview's chart is visits a day with engaged visits and a dot on each day
with a conversion, its panels, cookie line and tracking health line gone;
a channel's own screen has its four figures; a landing page's conversion
rate sits beside its count ("4 · 2.8%"); All pages shows the conversions
made there with their value; Conversions has its four figures, What
counts, and Where they came from switching between pages and channels,
its chart gone. Changes made while building, each smaller than a decision:

- A conversion-day mark on Overview's chart is a solid dot, so it cannot be
  taken for the ring a part week already wears.
- A step whose worth is Heroes' sum (Overview's "move your pages up") names
  no £ figure and links to Heroes and attention's Push tab.
- Left out for want of a figure the screen reads: Tracking health's "about
  £25 a month", Conversions' step on why direct visits stopped converting,
  and All pages' step on case studies.
- Landing pages counts its unsorted pages only in the page groups view:
  counting them among pages reads every page's address.
- Checked on Ronins in Chrome: each box says what §14's table drew, with
  the newer figures.

**Analytics' visits beside Search Console's clicks** (`b9be7b2c`, `7af7f6c1`):
each `holdPages` row carries the page's visits as a landing page over the
last 90 days, read from the hold's ready-made list and joined to the page
as Search Console's clicks are; both fields optional, so no row needed
moving — each fills at its hold's next rebuild, which every finished
collection now asks for. Disconnecting, choosing another property, or
Google taking access back notes the hold's pages changed. No screen shows
them yet (§4.6: what Reports will join on).

**Q12, built and held.** `holdPages` holding the page number was built and
tested on its own branch (`worktree-agent-a9b1ac417609e64a9`, `3af9c77f`,
`456feabb`), then held for Anthony: measured, it saves about 0.3 to 0.5 MB on
dev, not 1.3 — the numbering gains each cleaned path, which it did not hold —
and a page's own screen on a website with a "listed in sitemap file" line
reads up to 4.9 MiB at five times morehandles.co.uk, where it read one row.
Nothing on dev changed. Analytics' visits beside Search Console's clicks
(§4.6) is built without it.

## 18. The second round — drawn and agreed 2026-10-11

Anthony, 2026-10-11: "inteh google analytics section why do i see nothignb
abotu browsers adn dwell time on the page … is this because teh data source
does not supply it … if it does supply what else are we missing ?" Read in
the code the same day: time engaged (`userEngagementDuration`) was collected
and shown, but only as the Time column of Landing pages, page groups and All
pages; browsers were never asked of Google. What Google offers and Hakken did
not take was listed for him, and he chose it all (GA24–GA34). Two more came
from the canvas: page views before money (GA26) and charts on every screen
(GA35). Agreed: "ok tis is good can you weite them up onot a plan adn let me
know the pases".

### 18.1 What Google gives, by name

Confirmed against Google's Data API and Realtime API schema pages on
2026-10-11; each is checked on Ronins' property with `getMetadata` at the
start of its phase, as Phase 0 did (§7).

| On screen | Google's name | Asked |
|---|---|---|
| People; new and returning | `totalUsers`, `newUsers`; `newVsReturning` | With every list's figures. People cannot be added up across days or devices (one person on Monday and Tuesday is one person in the week), so the small lists' periods ask for people ready-made too, not added from days (§4.3) |
| Visit length | `averageSessionDuration` | Kept as the seconds of all visits (the average × visits), so it adds up |
| Bounce rate; pages a visit | — | Worked out: 1 − engaged visits ÷ visits (Google's `bounceRate` is the same); views ÷ visits |
| Page title | `pageTitle` by `pagePath` | Weekly; the most-viewed title of each page kept once with the hold's page numbers (§4.6) |
| Campaign, source / medium, ad keyword | `sessionCampaignName`, `sessionSource`, `sessionMedium`, `sessionManualTerm` | Ready-made periods. Ad keywords go into the hold's one keyword store (GA18) |
| The page before | `pageReferrer` by `pagePath` | When a page's own screen opens |
| Every event | `eventName` with `eventCount`, `totalUsers` | Ready-made periods, and by day for the chart |
| An event's detail | `linkUrl`, `outbound`, `fileName`, `searchTerm`, `percentScrolled`, `videoTitle` | When an event's own screen opens |
| Home countries | `countryId` (two letters), mapped onto Search Console's codes (`GB` = `gbr`) in the one list of codes (§4.6) | A filter on every ask |
| Products; the shop's steps | `itemName`, `itemCategory`; `itemsViewed`, `itemsAddedToCart`, `itemsPurchased`, `itemRevenue`; `eventCount` of `view_item`, `add_to_cart`, `begin_checkout`, `purchase` | Ready-made periods; the steps by day. Google never mixes product figures with visit figures in one ask |
| Browsers, systems | `browser`, `operatingSystem` | Ready-made periods |
| Age, gender, interests | `userAgeBracket`, `userGender`, `brandingInterest` | Only where the property has Google signals on; asked on their own, so Google's hiding of small groups never touches the other figures |
| Live | Realtime API: `activeUsers`, `screenPageViews`, `eventCount`, `keyEvents` by `minutesAgo`, `unifiedScreenName`, `city`, `deviceCategory`, `eventName`, filtered by `countryId` | Once a minute while the Live page is open and in front; never stored |

Still not given (§2.4 stands): search words, which AI question, Google's own
AI answers apart, robots, and people who refuse cookies. And: the page a
visitor went to next (only the page before), and, in live figures, a page's
address (only its title) and where a visitor came from.

### 18.2 The screens

The canvas "Google Analytics — now and proposed"
(https://claude.ai/artifact/K5H7fnyQrT38XhzE9aQMpn): the top row is the
twelve screens as built, copied from the running app with Ronins' figures;
the bottom row is this round, thirteen screens. A picture of each, and its
board, in `docs/plans/assets/google-analytics/round-2/`, numbered as on the
canvas.

| # | Screen | This round | Picture |
|---|---|---|---|
| 13 | Overview | Visits, page views, people and engaged visits first; then visit length, pages a visit, bounce rate, and conversions with their value under them. Chart: page views, visits and engaged visits a day, a dot on each day with a conversion and Google's updates marked. Visits by channel as bars | `13-overview.png` |
| 14 | Live | New. On the website now, people, views and conversions in the last 30 minutes; people each minute; pages (by title), places, devices and events; where they are as bars. No dates or chart step | `14-live.png` |
| 15 | Visitors | New. People, new, returning, visits a person; new and returning a day; one table switching between new or returning, browsers, operating systems, age, gender and interests, with its bars; a note when Google signals is off | `15-visitors.png` |
| 16 | Channels | Each channel's visits a day; visits by channel as bars | `16-channels.png` |
| 17 | Campaigns | New. Visits from tagged links a day; by campaign as bars; the table switching between campaigns and ad keywords | `17-campaigns.png` |
| 18 | Landing pages | Each page's title over its address; Visits, Bounce, Pages, Time, Conversions, Change; opens by visits; the top ten as bars | `18-landing-pages.png` |
| 19 | A landing page's own screen | Its visits a day, the chart agreed on 9 Oct | `19-a-landing-page.png` |
| 20 | All pages | Titles; People beside Views; opens by views; every row opens the page's own screen; the top ten as bars | `20-all-pages.png` |
| 21 | A page's own screen | New. Views, people, time, conversions made there; views a day; where visitors were just before, as bars and a table: the website's pages by title and address, other websites by name, "No page before" | `21-a-page.png` |
| 22 | Events | New. Every event by its own name and Google's ("Page viewed · page_view"), times, people, whether it counts as a conversion, change; a Kind filter; scrolls and link clicks a day; times each event happened as bars | `22-events.png` |
| 23 | An event's own screen | New. Its figures and times a day; what it was about — the links clicked, the files, the words searched, how far people scrolled, the videos — switching to the pages it happened on | `23-an-event.png` |
| 24 | Conversions | Conversions a day, the chart agreed on 9 Oct; conversions by landing page as bars | `24-conversions.png` |
| 25 | Products | New, only for a website with shop events. The shop's four steps as figures and bars, products bought a day, and each product's looks, basket, bought, revenue and change, with a Category filter. Drawn on a sample shop | `25-products-a-shop.png` |

On every page: a Country choice beside device and dates — Search Console's
dropdown, listing the website's home countries (Ronins': the United
Kingdom). What Hakken sees on every new screen, from the shared rules (one
voice). Every table is the standard one, search row first. No new parts, two
extended: Sites' page cell gains a title line over the address (one line
each, cut with "…", whole on hover — Sites' rule for long words), and Sites'
bar chart (`SiteBarChart`) moves to the shared charts folder so Analytics
draws the same bars, not a copy.

The canvas's figures are Ronins' real ones wherever Hakken held them (visits
and engaged visits a day, the channels, visits, views, engagement, time and
conversions by page, page titles read from ronins.co.uk); the rest — people,
visit length, browsers, events, campaigns, the page before, live visitors —
are made up to show the layout.

### 18.3 Collecting and storage

| What | Kept | Google asks |
|---|---|---|
| Home countries | A filter on every ask. Each home country kept (Q17): the main one as now, days and periods; each other one as ready-made periods only, its charts among them. The figures held so far are cleared and collected again, as Search Console's were on 2026-10-06 | The main country's as now; each other home country about as many again |
| People, visit length | Two more figures on every list. The small lists' periods asked of Google ready-made, as the page lists' are, rather than added up from days — people cannot be added up | About eight more a day |
| Bounce rate, pages a visit | Worked out | None |
| Page titles | Once a page, on the website's one page list (`holdPages`), read by every screen that lists the website's pages | One a week |
| Campaigns, ad keywords | Ready-made periods, every device | About four a day, and the weekly periods |
| Every event | Ready-made periods; by day for its chart; every device | About five a day |
| Visitors' lists | Ready-made periods, every device; age, gender and interests asked apart; new and returning by day | About eight a day, and the weekly periods |
| Products, the shop's steps | Ready-made periods, every device; the steps by day | About five a day, shops only |
| The page before; an event's detail; a page's or an event's days | Asked when the screen opens, held until the next collection (GA23) | Only when opened |
| Live | Never stored | Once a minute, only while the page is open and in front; nothing when it is closed or behind another tab |

About twenty small asks a day now and about sixty-five with this round, far
inside Google's free limits (§2.5). Ronins holds about 0.4 MB of Analytics;
the new lists are short, so a website like Ronins gains little, and a big
shop most, its products kept as the page lists are. Measured on Ronins in
Phase 15 before any client connects (GA23). Only what changed is written;
live figures cost a function call a minute while someone watches, and no
storage.

### 18.4 Questions

- **Q17 — The other home countries. Answered 2026-10-11, then changed the
  same day.** First: the main home country kept, any other asked when chosen
  (Anthony: "yes"). Reading the code showed only the page lists are asked
  live for a device; the totals, channels and charts are kept, so a country
  asked live would need every list on every screen asked and read live.
  Changed (Anthony: "store each coutnry thats selected as a hoem country"):
  every home country is kept, as Search Console keeps them — compared home
  country to home country, like with like. Storage grows only for a website
  with more than one; Ronins has one. How: §18.6.
- **Q18 — Google signals on ronins.co.uk. Answered 2026-10-11 (Anthony: "i
  dotn know lets build it and see").** Phase 12 builds age, gender and
  interests as drawn and asks Ronins' property for them; what comes back is
  written into §18 when the phase ends — figures, groups Google hid, or
  nothing because Google signals is off. Off, the Visitors page says those
  three are empty; switching it on is a setting in Google Analytics (Admin →
  Data collection) with cookie-consent questions of its own, and Anthony's
  call.
- **Q19 — A real shop. Answered 2026-10-11 (Anthony: "agree").** None is
  connected (Anthony, 2026-10-10, on morehandles.co.uk: "no I don't want to
  cement yet"). Phase 13 is built and tested with Google faked, and checked
  on a real shop when one connects.

### 18.5 Phases and days

Re-estimated 2026-10-11 with Anthony's answers (§18.4, §18.6): every home
country kept, page titles on every screen that lists the website's pages,
and Ask Hakken reading all of it. Built in one go (Anthony: "can you build
this in one go"), phase by phase, each committed on dev and not pushed.

| Phase | What | Days |
|---|---|---|
| 6 | Home countries: every ask filtered; each home country kept (§18.6.1); the Country choice on every page; the figures held so far cleared and collected again | Two and a half |
| 7 | The new figures and changed lists: people, new and returning, visit length, bounce rate, pages a visit; the small lists' periods asked ready-made; page titles on `holdPages`, shown on every screen listing the website's pages (Google Analytics, Search Console, Heroes); Overview reordered, page views first; Landing pages and All pages as drawn; the CSV downloads | Four |
| 8 | Charts on the screens that exist: the bar chart shared; Overview's, Channels', Conversions' and a landing page's charts; the top-ten bars | Two |
| 9 | A page's own screen and the page before | Two and a half |
| 10 | Events and an event's own screen, every detail (Anthony: "all"), every Google event named in English and Italian | Three |
| 11 | Campaigns and ad keywords | One and a half |
| 12 | Visitors: new or returning, browsers, systems, age, gender, interests | Two and a half |
| 13 | Products, found by themselves (§18.6.6) | Three |
| 14 | Live | Two |
| 15 | Ask Hakken reads every Google Analytics screen and figure, both rounds (§18.6.8) | Two |
| 16 | Measured and checked: storage on Ronins, a reading-budget test for every new screen at five times morehandles.co.uk, look tests against the pictures, Ronins checked in Chrome, the full gate | One and a half |

**About twenty-six and a half days of building**, and half a day writing
this section and §18.7. Every phase brings its What Hakken sees (§18.7),
its words in English and Italian, and tests with Google faked, and ends with
the gate. Up from twenty-two and a half: every home country kept (one day
more than first thought), titles on every screen listing pages (one), and
Ask Hakken (two).

### 18.6 How it is built

Everything follows Hakken's standard (Anthony, on storage: "you recommend
based on the hakken standard"): stored once and named by number (the core
data normalisation plan), packed and kept as Search Console's are (§4.3,
§4.6), only what changed written, live answers held until the next
collection (GA23), cleared with the website, and every screen held to a
reading budget at five times morehandles.co.uk.

**1. Home countries.** A website's home countries are its Market list, the
same as Search Console's (`searchConsoleCountries`, `mainConsoleCountry`,
`countriesKeptReady`), each turned into Google's two-letter `countryId` by
the one list of codes (`utils/countryCodes.ts`). Every ask carries a
`countryId` filter. The connection notes the main country its figures are
for (`mainCountry`); when it differs — every website on the day this ships,
and later when the Market list changes — everything held is cleared and
the next collection fetches it again, as Search Console's
`prepareMainCountryOf` does. The main country is kept as now, without a
country in its records' names; each other home country is kept as
ready-made periods only, named with its code (`gbr` style, as Search
Console names them) — every list a screen reads, its charts' series for
every period among them, so no screen of another country reads days. A
country taken off the list is cleared at the next run. The Country choice is
Search Console's own dropdown (`Select`), beside device and dates, opening
on the main country and kept in the address. Visits from outside the home
countries are not counted anywhere; a visit Google cannot place
(`(not set)`) is not in a home country either.

*Built 2026-10-11 (Phase 6).* `googleAnalyticsCountries.ts` holds the rules
(`keptCountry`, `prepareAnalyticsCountry`, `dropCountriesNotKept`); every
ask carries `countryId`, each list's name ends with the country's code when
it is not the main one (`slotKey`), and every read and live ask takes an
optional `country`, as Search Console's do. One difference from the words
above: **Heroes and attention stays on the main home country** and offers no
Country choice. Its Search Console side reads through Search Console's
main-country path (`readPeriodUnnamed`), so a second country there would
mean reworking Search Console's own reads; for the main country both sides
are like with like. Ronins has one home country, so nothing it shows
changes. Ronins switched on dev the same day: its figures cleared and its 60
days collected again for the United Kingdom only.

**2. People and how visits went.** Every list asks two more figures,
`totalUsers` and `newUsers`, and `averageSessionDuration`, kept as the
seconds of all visits (the average × visits) so it adds up across rows.
Bounce rate and pages a visit are worked out when read. People cannot be
added up across days or devices, so the small lists' periods — the totals
and the channels, by device — are asked of Google ready-made, as the page
lists' are, instead of added up from days; their days are kept only for the
charts. New and returning is its own small list (`newVsReturning`), kept by
day for its chart and as ready-made periods. Each collection asks for the
last 90 days and 12 months as now, so the backlog fills at once.

**3. Page titles.** `pageTitle` by `pagePath`, asked weekly; each page's
most-viewed title is kept once on the website's one page list
(`holdPages.title`), joined by the page's number as Analytics' visits are
(§17). Every screen that lists the website's pages reads it from there and
shows it over the address (one line each, cut with "…", whole on hover):
Google Analytics' Landing pages, All pages, a page's and a landing page's
own screens, Heroes and attention, and Search Console's pages lists and a
page's own screen. Search Console sends no titles; until Analytics is
connected, those screens show the address alone.

*Built 2026-10-11 (Phase 7), with §2 above.* Every list asks
`totalUsers`, `newUsers` and `averageSessionDuration` (kept as the seconds
visits lasted, so it adds up); the website's totals for every device are
asked whole beside the by-device ask, since people cannot be added up
(`collectPeriod`). The small lists' periods were already asked ready-made,
not added from days, so only the every-device people needed that. Bounce
rate, pages a visit and visit length are worked out when read. Titles are
asked into `googleAnalyticsTitles` by page number (`googleAnalyticsTitles.ts`)
and copied by the page list's rebuild onto the pages it already has — a
title adds no page — and read for the rows on screen by `pageTitles.ts`
(`titlesOf`, `withTitles`, and `pageTitle` for Search Console's page screen).
A website with no title yet asks the weekly lists at its next run, whatever
the week, so the first run after this shipped filled the 90 days and 12
months with people, and the titles. Overview's figures, Landing pages'
columns and All pages' are as drawn (boards 13, 18, 20) and their look tests
updated; Search Console's Pages and Tracked pages share one title cell
(`PageNameCell`).

*Charts, built 2026-10-11 (Phase 8, GA35).* Overview: page views, visits and
engaged visits a day, a dot on each day with a conversion, and the channels'
visits as bars. Channels: the four busiest channels a line each, the rest
one line — from the days kept for the main country's 7 and 30 days, else
asked of Google when the screen opens and held (`analyticsChannelChart`,
`askGoogleAnalyticsLive` with `chart: "channel"`) — and visits by channel as
bars. Landing pages and All pages: the top ten by visits and by views as
bars (`analyticsTopList` with `count`). The two charts agreed on 9 Oct and
left off on 10 Oct are back as they were built: Conversions' "Conversions
over time" (each kind a line, Value ticked on its own scale), restored from
git, with conversions by landing page as bars; and a landing page's own
chart, from the asks its screen already made. One difference from §18.2:
**Sites' bar chart is used from Sites' folder**, as Analytics' line chart
already was, rather than moved — one chart, no copy, a 600-line move saved.
The chart reads moved to `googleAnalyticsChartReads.ts` to keep the reads
module inside its size.

**4. The page before.** When a page's own screen opens, Google is asked for
`pageReferrer` by `pagePath` for that page, and for its views a day; both
held until the next collection. A referrer on the website becomes the
page's number (its title and address shown); another website becomes its
host, named where Hakken knows it (Google, Bing, ChatGPT, Perplexity, as
§4.4's list); none becomes "No page before".

*Built 2026-10-11 (Phase 9, GA29).* Every page of All pages opens its own
screen (`all-pages/page`), as board 21 draws it: What Hakken sees, views,
people, time and the conversions made on the page, its views a day, and where
visitors were just before as bars and a table. The asks are
`askGoogleAnalyticsLive` with `viewed` (`pageAsk("viewed" | "before", …)`),
the read `analyticsPage` (`googleAnalyticsPageReads.ts`); the website's own
pages are numbered as every list numbers them, so a page before opens its own
screen in turn. Three things learned on Ronins' figures: **a page counts
itself** as the page before when it is reloaded — the table keeps that row,
but What Hakken sees never names a page as its own source or the link to
keep; Microsoft Teams arrives as `teams.public.onecdn.static.microsoft` and
is named "Microsoft Teams"; and the views-a-day chart draws views alone,
since a visit belongs to the whole website, not one page. All pages' own
"copy the next step" now opens the page's screen there, not Landing pages'.

**5. Every event.** A new list, `event`: `eventName` with `eventCount` and
`totalUsers`, as ready-made periods and by day for the charts, every device.
Every one of Google's own events gets a name in English and Italian beside
the list of likely conversions (`utils/analyticsEvents.ts`); an event Hakken
does not know shows Google's name. An event's own screen asks Google, when
it opens, for what that event was about, by its kind: `click` → `linkUrl`
(and `outbound`), `file_download` → `fileName`, `view_search_results` →
`searchTerm`, `scroll` → `percentScrolled`, `video_start`,
`video_progress`, `video_complete` → `videoTitle`; any event → the pages it
happened on (`pagePath`). Held until the next collection.

*Built 2026-10-11 (Phase 10, GA30).* Events and an event's own screen, as
boards 22 and 23 draw them. Two new ready-made lists in the same packed
tables, every device: `event` (each event's times, people and visits with
one — `eventCount`, `totalUsers`, `sessions`, kept as a `times` column beside
`people` and `visits`) for each period, the span before and the year before,
and `eventSeries` (each event a day) for every period's chart. One device is
asked of Google when the screen opens, as the page lists are. An event's own
screen asks, when it opens, what it was about and the pages it happened on,
each for the dates and the span before (`askGoogleAnalyticsLive`, `event`).
Reads in `googleAnalyticsEventReads.ts`, rules in `utils/sees/analyticsEvents.ts`.
Google's own events are named in English and Italian and sorted into kinds
for the Kind filter (`utils/analyticsEvents.ts`): conversions, visits and
pages, clicks-scrolls-downloads-videos, shop, and the website's own. A
website with no event list yet asks the weekly lists at its next run, as
titles do, so the longer periods never wait a week. Three names changed to
the drawing's — "Scrolled to the bottom", "Engaged with a page", "Clicked a
link to another website" — on Choose what counts too (its look test
updated). Links show as people read them (`linkedin.com/company/…`), the
whole address kept for the link. **The fourth figure on an event's
screen, "Conversions after it", changed** — Google cannot join an event to
conversions in the same visit, so it counts the people who did the event and
converted after it, from Google's funnel report (Anthony, 2026-10-11: "Yes
agree use the people"). Built after Phase 11 (`runFunnelReport`, still
Google's `v1alpha`; a refusal is held and the figure left unsaid, never the
rest of the screen), with its sentence in What Hakken sees. Checked against
Google four ways on Ronins: 255 of the 271 people who clicked a link to
another website in 12 months sent a form after it, and only 133 viewed a page
after it — Ronins' form likely counts as a click away, or bots fill it in; a
tracking question, not the figure's.
Measured on Ronins: twelve events in 30 days; the 12 months' each-event-a-day
list is two stored parts.

**6. Campaigns, Visitors, Products.** New ready-made lists, every device:
`campaign` (campaign, source, medium), `adKeyword` (`sessionManualTerm`,
numbered in the hold's keyword store as Search Console's keywords are,
GA18), `browser`, `system`, and — asked on their own — `age`, `gender`,
`interest`. Google signals is taken as off when every row of age and gender
comes back "unknown"; the Visitors page then says so instead of drawing
empty bars, and Google's hiding of small groups (`subjectToThresholding`) is
said as on every list. Products: `product` (`itemName`, `itemCategory`,
with `itemsViewed`, `itemsAddedToCart`, `itemsPurchased`, `itemRevenue`),
asked on its own, since Google never mixes product and visit figures. The
shop's four steps are read from the `event` list (`view_item`,
`add_to_cart`, `begin_checkout`, `purchase`), so they cost no ask. A
website is a shop when any of those four happened in the last 90 days: the
collector notes it (`shop`) each day, the Products page appears by itself,
and nothing is set in admin (Anthony: "you recommend").

*Built 2026-10-11 (Phase 11, GA28).* Campaigns, as board 17 draws it: What
Hakken sees, the visits from tagged links a day, visits by campaign as bars,
and one table switching between the campaigns — each with the source and
medium its link carried — and the ad keywords; the visits from no tagged link
said beside the table, never listed. Three ready-made lists, every device:
`campaign`, `adKeyword` and `campaignSeries` (each campaign a day); Google's
"(not set)", "(direct)", "(organic)" and the like kept as one untagged row, so
a website that tags nothing keeps one row a day. One device asked of Google
when the screen opens. The lists use the standard list screen and reads, and
a list's rows as kept and shown moved to `googleAnalyticsRows.ts` to keep the
reads module inside its size. **One difference from §4.6: ad keywords are
kept as their list's own row names, not in Search Console's keyword books.**
The books hold a month of Search Console's daily lines and go with them, so a
12-month list pointing into them would lose its words within a month; no
second keyword table is made. Ronins: 34 of 4,517 visits in 12 months came
from tagged links, 32 of them ReviveOldPost's LinkedIn shares, none
converting.

*Built 2026-10-11 (Phase 12, GA24).* Visitors, as board 15 draws it: What
Hakken sees, people, new and returning visitors and visits a person against
the span before, new and returning people a day, the list chosen as bars, a
note when Google signals is off, and one table switching between new or
returning, browsers, operating systems, age, gender and interests. Seven
ready-made lists in the same packed tables, every device (`visitorType`,
`browser`, `system`, `age`, `gender`, `interest`, and `visitorSeries` a day);
one device asked of Google when the screen opens. The figures, chart and box
come from their own read (`googleAnalyticsVisitorReads.ts`); the table from
the standard list read. Google signals is read as off only when every age and
every gender Google gives is unknown: on Ronins, age shows only "Unknown" —
Google hides small age groups — but gender shows men and women, so signals is
on and the box says Google held small groups back instead. Ronins, 30 days:
167 people made 230 visits, 93% new; Chrome, Safari, Edge, Firefox, Opera.

*Built 2026-10-11 (Phase 13, GA34).* Products, as board 25 draws it: What
Hakken sees, the shop's four steps as figures and bars, the products bought
a day, and each product's looks, basket, bought, revenue and change — paged,
searched and sorted on the server, with a Category filter. A website is a
shop when any of the four steps happened in its last 90 days: the collector
notes it (`connection.shop`) each time it reads those events, and only then
asks `product` (each product with its category) and `productSeries` (bought a
day) — every device, asked on their own, never joined to key events — and
shows Products in the menu; nothing is set in admin. A new shop's products
are asked at its next run, the long periods at once. The four steps come from
the events list at no extra ask. "Look at that product's page" opens All pages
searched for the product's name. Every Analytics read's shared rows module
now imports no other Analytics module, which ended an import loop the new
reads exposed. Ronins sells nothing: no products asked, no Products in its
menu, and the page says why when opened.

**7. Live.** The Realtime API (`runRealtimeReport`), asked by the Live page
itself through one action that returns the answer and stores nothing. The
page asks once a minute while it is in front (`document.visibilityState`),
stops when hidden or closed, and pauses after 30 minutes untouched with a
line to carry on. One ask a minute brings the figures, the minute chart and
the chosen list together where Google allows, else three or four small
asks. Filtered to the home country chosen.

**8. Ask Hakken.** Ask Hakken reads every Google Analytics screen and figure
the website holds — both rounds — through the same reads the screens use,
for the company's own websites only (Anthony: "ask hakken will be able to
pull from every screen and every peice of data we hold"). Today it reads
none of Analytics' figures, only What Hakken sees' saved advice
(`hakkenAdvice`). Built as its other reads are (`assistantReads`,
`assistantToolHandlers`, `toolConnectorDefinitions`).

**9. Storage.** New lists use the packed rows (`analyticsPackedRows`) with
new columns where a list needs them — people, new people, visit seconds,
times (an event's count), basket, checkouts — each empty and costing
nothing on lists that have none. Every new list joins the keep rules: days
60, ready-made periods replaced, live answers cleared at the next
collection, all of it cleared when the website disconnects, changes
property or changes main country.

### 18.7 What Hakken sees on the new screens

Written by fixed rules over the figures each screen already reads, in the
shared box and its saved advice (§14; the Volatility plan's `hakkenAdvice`),
words in `messages/<language>.json`; no AI model, no extra read. The canvas
shows each on its figures. The changed screens keep their rules, with the
new figures where they matter (bounce beside engagement).

| Screen | What it says (when) | Do first |
|---|---|---|
| Live | How many are on the website now, and the page most of them are on; a conversion in the last 30 minutes, and how long ago; "Nobody is on the website right now" when none | See today's conversions (when one happened) |
| Visitors | People and visits, and the share new. Returning visitors converting at least twice the new ones' rate (30 returning visits or more); a browser with a fifth of visits or more engaging 5 points or more below the website; age, gender and interests empty because Google signals is off; groups hidden by Google | Give returning visitors a reason to get in touch; check the website on that browser |
| Campaigns | The share of visits from tagged links, said when under 10%; the campaign that converted most; a campaign with 30 visits or more and no conversion; "No visits came from a tagged link" when none | Tag the links in emails, ads and posts; see where that campaign's visitors landed |
| Events | Events counted as conversions that never happened; the share of page views reaching the bottom of the page; clicks taking people off the website when 5% of visits or more; site searches when any | Try the conversions that never fire, and check Google records them; see which links take people away; see what people searched for |
| An event's own screen | By its kind: the links clicked most and their share; the words searched most; the share of views reaching 90%; the file downloaded most; otherwise how many times, by how many people, and the change | Open links to other websites in a new tab (clicks); make sure a page answers the top search (site search) |
| A page's own screen | The two biggest sources of its views and their shares; views with no page before, when a fifth or more; an AI assistant among its sources | Keep the link on the page that sends most; check what that assistant says about the page |
| Products | Looks, baskets and the share in between; the share of checkouts finished; the best seller; a product looked at 100 times or more and bought 1% of the time or less | Look at that product's page; find out why checkouts aren't finished (under half) |

## Change log

- 2026-10-09 — Plan written from the brainstorm the same day: seventeen
  decisions agreed (§1), ten questions for later (§10). GA9's "16 months"
  answered on an out-of-date description of Search Console, and settled by
  GA16. Google's AI Assistant channel (May 2026) found while writing, and
  §4.4 written around it. A PDF copy given to Anthony.
- 2026-10-09 — Brought into the repo from that PDF, word for word.
- 2026-10-09 — GA18 agreed: as much shared with Search Console as possible,
  everything common stored once (§4.6), with Q11 and Q12 added. Search
  Console's storage was read in the code the same day: everything it keeps
  is the hold's, and `websitePages`, which §2.6 and §4.3 built on, was never
  built — both now name the hold's page numbering. Two and a half days added
  to Phases 1 and 2. The screens drawn on the canvas "Analytics — Google
  Analytics screens" (https://claude.ai/artifact/9ET3p2eSq8kNdsni5QPHRR).
- 2026-10-09 — GA19 agreed on the canvas: "Conversions", not "Enquiries" or
  "Sales", across every screen, with a conversion's own name where one is
  meant; §2.3, §4.2, §5 and §6 reworded. The canvas redrawn to match, and
  its half-width panels of page addresses stacked full width (Anthony: "not
  a fan of 50% panels when we are displaying long form text like URLs").
- 2026-10-09 — GA20 agreed: only the small lists kept by device, the page
  lists once for every device and a device on them asked of Google live
  (§4.2).
- 2026-10-09 — GA21 agreed: the Google Analytics: Collector Agent, with a
  role and a schedule of its own at Search Console's time (§4.1). The
  agent's setup was read from Search Console's the same day.
- 2026-10-09 — GA22 agreed after a review of the canvas: six changes to the
  screens (§3, §5, §6), six screens added to the canvas (16 to 21), and a day
  and a half added to Phase 3.
- 2026-10-09 — Every question answered: §10's twelve and four more from the
  canvas (Q13–Q16). The menu item is "Google Analytics" (Q7); the first
  collection starts on connecting (Q15); the address is chosen for the
  client (Q16, its step taken off the canvas); Analytics' own value wins
  over Hakken's (Q1); year-on-year asked weekly (Q2). The screens agreed and
  locked (§11), with a picture of each in
  `docs/plans/assets/google-analytics/`. Building on hold until the SEO API
  coverage work under way is complete.
- 2026-10-09 — GA23 agreed, asked whether the plan was fully optimised for
  storage, speed and spend: the page lists kept only as ready-made periods
  from Google, conversions as columns of their own lists, two days settled
  again not four, only what changed written, live lists held, and every
  screen proved by a reading-budget test with storage measured before any
  client (§4.1–§4.3, §9). No screen changes.
- 2026-10-10 — Building started (Anthony: "ok lets build this please"). The
  shared Google sign-in is one per website and Google account (§3, "Built"),
  so an agency's Search Console and its client's Analytics on two accounts
  both stand; nearly always it is one.
- 2026-10-10 — Built through Phases 1 to 4 with Google faked (§12): the
  shared sign-in and page numbers, the collector, the section's screens and
  tracking health. Waiting: Phase 0, the agent and schedule in Admin, Q12.
- 2026-10-10 — Ronins connected and collected (60 days, 6,518 rows, about
  0.4 MB). GA12 changed: tracking health's bell alerts, and the connected
  notice, go to the platform's super admins only, never a company's admins
  (Anthony: "These are system alerts not company alerts").
- 2026-10-10 — GA1 changed: the section gets a strategy page joining Search
  Console to Analytics page by page (§13), to be drawn and agreed first.
- 2026-10-10 — The new screens written in (Anthony: "Can you add the new
  screens into the plan please"). Heroes and attention as drawn (§13);
  What Hakken sees on sixteen screens (§14); every screen redrawn for review
  on Ronins' figures, and what each changes against the locked screens
  (§15); three things found while drawing (§16). Phase 5 added, eight and a
  half days, about twenty-four in all (§8). None of it agreed or built yet.
- 2026-10-10 — Status corrected against the dev database and the app
  (Anthony: "Most of this is done it's already collecting data"). The
  Collector Agent and its daily 04:00 schedule were created at 07:38 and are
  switched on, next run 11 October 04:00; the section shows ronins.co.uk
  connected, 826 visits, 12 conversions and £240 over 30 days. Phases 0 to 4
  marked done; the old "about 45%" read the 70% written before Phase 0 as a
  share of all twenty-four days. Left: Phase 5, the two decisions in §12, and
  storage on morehandles.co.uk.
- 2026-10-10 — All 19 screens on the review canvas signed off (Anthony: "I'm
  good with the 19 screens"). Phase 5 waits for "build".
- 2026-10-10 — Phase 5's build started (Anthony: "1 yes"), with both
  page-list changes (Anthony: "yes to all": Analytics' visits beside Search
  Console's clicks in `holdPages`, and Q12, `holdPages` holding the page
  number). morehandles.co.uk is not connected for now (Anthony: "no I don't
  want to cement yet"). About twelve days with the two changes.
- 2026-10-10 — Phase 5 built (§17): §16's three fixes, Heroes and attention
  and a page's own view, What Hakken sees on sixteen screens, the screens as
  §15 drew them, and Analytics' visits beside Search Console's clicks, each
  checked on Ronins in Chrome. All 7,199 tests, coverage, the 19 smoke tests
  and the build pass; `npm run check`'s speed step fails on Discovery's
  `aiAppsLoad.test.ts` (8.5s alone), slow before this build too.
  Q12 built on its own branch and held: it saves about 0.3 to 0.5 MB, not
  1.3, and a page's own screen on a website with a sitemap-file line would
  read up to 4.9 MiB.
- 2026-10-11 — The second round (§18). Asked why browsers and dwell time
  were missing: time engaged was collected and shown as Time, browsers never
  asked. Anthony chose everything else Google offers (GA24–GA34), then page
  views before money (GA26) and charts on every screen (GA35). Drawn on the
  canvas "Google Analytics — now and proposed" beside the screens as built,
  and agreed ("ok tis is good"); pictures in
  `docs/plans/assets/google-analytics/round-2/`. GA7, GA13 and GA22 changed.
  §15's two charts "left off" corrected: the drawing agent's choice, never
  Anthony's ("i nver asekd for any charts to be removed"). Ten phases, about
  twenty-two and a half days (§18.5); Q17 to Q19 open. Not built.
- 2026-10-11 — Q17 answered (the other home countries asked when chosen,
  not kept) and Q19 agreed (Products built with Google faked until a shop
  connects). Q18 answered: build age, gender and interests and see what
  Ronins' property returns (Anthony: "lets build it and see").
- 2026-10-11 — Q17 changed: every home country kept, as Search Console's
  (Anthony: "store each coutnry thats selected as a hoem country"). How it
  is built written in (§18.6) with Anthony's answers: the backlog asked at
  once, titles once a page on `holdPages` and shown wherever the website's
  pages are listed ("normalise this and other screens"), every event detail
  ("all"), shops found by themselves, Live paused when hidden or untouched,
  storage to Hakken's standard, and Ask Hakken reading every Google
  Analytics screen and figure. What Hakken sees on the seven new screens
  (§18.7, Anthony: "yes add the rulles to teh plan"). Eleven phases, about
  twenty-six and a half days; building in one go.
