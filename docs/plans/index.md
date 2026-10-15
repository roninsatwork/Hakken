# Plans

On 2026-07-20 the earlier movement and platform plans were retired to start
fresh. The current active folder now contains the live movement plan, current
platform/admin planning notes, and handover material for unfinished or recently
completed work.

## Active Plans

- [Google Analytics — store the figures, stop asking Google from the screens](./active/ga-stored-figures-plan.md)
  — every figure a screen shows stored by the collection run, so changing the
  dates never waits on Google and Google's limit of 14,000 tokens an hour per
  website is spent once a day, not per look: channels over time,
  every list and chart for each device, a page's and an event's own figures,
  other home countries — a day for 90 days, a week to 12 months, a month to
  two years, as the other sections keep it, and shared lists for a page's and
  an event's own screens. Live and an event's funnel stay with Google. Every
  run keeps a fifth of Google's allowances in hand and is collected nightly
  from 01:00 UK, everything every night. **Planned and built 2026-10-14,
  phases 1–4, about 21 man-days; tested on ronins.co.uk.**
- [Google Analytics — Channels and a channel's own page, rethought](./active/ga-channel-pages-plan.md)
  — one page for every channel (What Hakken sees with nine rules that work for
  any website, four figures including conversions it started and dwell time,
  the channel over time, where it lands by page classification, the pages
  behind the change, four table views), AI assistants' own parts, and a
  stronger Channels overview with a channel-by-classification map. Google
  Analytics data only. Two new kit parts (ChangeBars, ChannelMap; FiledBars
  is the stacked bar), and a new kept list of AI assistants' landing pages.
  **Planned and built 2026-10-13, all 10 phases, local on `dev`.**
- [Google Analytics — conversions counted back in time](./active/conversions-back-in-time-plan.md)
  — conversions counted with Google's own count of each event instead of its
  key-event count, so any enquiry can count and choosing what counts corrects
  the whole year on every screen (ronins.co.uk's enquiry of 12 Oct included).
  One fresh collection per website (about 0.8 MB for Ronins). **Built on dev
  2026-10-13 (Anthony chose option A, approved the drawing) and checked on
  ronins.co.uk: Contact's 68 enquiries in 12 months held on every row; not
  committed.**
- [Google Analytics — Tracking health checks what each conversion really is](./active/conversion-checks-plan.md)
  — three new checks: a conversion that is really something else (ronins.co.uk's
  "Form sent" was link clicks), an enquiry happening but not counted (its real
  forms, `contact`), and a conversion that never happens (its chat, phone and
  email). Read from what Hakken already keeps; nothing new asked of Google.
  Insights' Measurement check reads the two it already had, so the two never
  disagree. **Built on dev 2026-10-13 and checked on ronins.co.uk (6 of 12
  checks failing, as found by hand); not committed. Backfilling past
  enquiries is a separate plan, to discuss.**
- [Insights — Hakken as the SEO and CRO agency](./active/insights-analyst-plan.md)
  — the new Insights item under Ask Hakken: where the data sources combine.
  A team of specialist agents under a Head of Strategy reads every source for
  each owned website, with its rivals, and an Editor checks every figure and
  tells real change from noise before anything is published. Around the
  findings: an executive summary, a monthly report, a quarterly strategy and a
  five-page board report PDF, all written by Hakken with no person editing;
  leaderboards led by domain authority, organic traffic, AI mindshare and
  share of voice; a change log and learnings from every change. Each source's
  own screens stay in its section (Visibility, Search Console, Google
  Analytics, and Microsoft Clarity as a new section), which the plan extends.
  **Drawings (44 boards) and the whole plan approved 2026-10-11, then
  checked against the Google Analytics work the same day (home country with
  home country; people, first channel, journeys, "did this, then enquired",
  events, tagged links, shops, titles): about 86 days, plus 5 once Google
  approves Business Profile access. The Google Analytics work it waited
  for landed and was checked on 2026-10-11, adding the enquiry check, last
  year's figures, a year of daily history and one read per screen. Built
  overnight 11–12 October on dev, committed and not pushed: every phase done
  and checked on ronins.co.uk, about 95%; waiting on Anthony for the PDF's
  making, the shop screens' drawings, the Buyer questions switch, Live mode,
  a PageSpeed key and Clarity tokens (the plan's §13).**
- [The client's menu: Visibility, Reading room, and a new Insights](./active/menu-names-plan.md)
  — Discovery renamed Visibility (the supplier cannot be named, and Discovery
  is kept for something else); Insights renamed Reading room; a new Insights
  item under Ask Hakken for the AI analyst section; Hakken tasks moved
  below Reading room. Addresses and the code's own names stay. **Drawing approved
  2026-10-11 (`docs/plans/assets/menu-names/`); phases 1–6 built on dev
  2026-10-11; phase 7, the new Insights item, waits for its first page.**
- [Search Console — Volatility, and What Hakken sees on every screen](./active/search-console-volatility-plan.md)
  — one new page in Search Console's Changes group: how much the website's
  positions moved each day, out of 10, read from Search Console's daily
  figures (nothing bought), beside Google's updates, with What Hakken sees
  saying whether it looks like Google, demand or the site, and what to do
  first; Google updates gains a Volatility column; Google's update list fills
  itself. And What Hakken sees on every screen: it folds away to one line and
  opens again when its advice changes; each screen's advice saved, so the
  screens, Ask Hakken and later the weekly note, tasks and messages say the
  same thing; any screen in Discovery, Search Console or Google Analytics
  missing a box gets one where it makes sense. Nine phases, about ten days,
  built by the session that drew it. **Drawn and approved 2026-10-10 (four
  boards in `docs/plans/assets/search-console-volatility/`); built on local
  dev 2026-10-11, every phase, and checked on ronins.co.uk's real data;
  committed on dev the same day, not pushed.**
- [Discovery — detail screens, rows that open, and What Hakken sees](./active/discovery-detail-and-hakken-sees-plan.md)
  — every row in Discovery opens something: four new detail screens (one
  business, one website, one question in Google's AI answers, one page), each
  verdict first with one table behind a switch; a What Hakken sees box under
  the title of every Discovery screen, written by fixed rules over what the
  page already reads; All backlinks gains week and group filters. Nothing
  bought, no new table. **Drawn and approved 2026-10-10 (28 boards in
  `docs/plans/assets/discovery-detail-screens/`); built the same day, all
  seven steps: What Hakken sees on all 73 Discovery screens, the four detail
  screens, and every row opening something.**
- [Discovery — local, reviews, AI apps, Brand radar and web mentions](./active/discovery-local-reputation-ai-plan.md)
  — Google profiles, Maps, reviews, the AI apps, Brand radar, Your assets and
  web mentions in Discovery. **Built 2026-10-09 and run on Ronins and Korda.**

- [Content — people and their channels, News into Knowledge, and reading analytics](./active/content-people-knowledge-plan.md)
  — Admin → Content reshaped so Hakken works as an SEO agency would: Who to
  follow becomes the only source list (a person, then their channels on
  their own page, added by hand), News sources goes; an In knowledge tick on News keeps the whole article for Ask Hakken;
  Knowledge and Helpful content become one list, with Add from a link for a
  single article; and a new Analytics page — views, reads and clicks over
  time by article, person, company and user. Six phases, about eighteen
  days. **Drawn and approved 2026-10-10 (twelve boards in
  `docs/plans/assets/content-people-knowledge/boards/`); built the same day,
  all six phases, and pushed to dev. Nothing collected yet: the News
  Collector agent and the X and Firecrawl keys are still to set up. Q5 and
  Q7–Q11 open.**
- [Google Analytics — for your own websites](./active/google-analytics-plan.md)
  — a new "Google Analytics" item in the main menu, beside Search Console,
  showing each owned website's Google Analytics alone: visits, channels (AI
  assistants their own, every channel opening into its sources), landing
  pages and each page's own screen, all pages, and conversions with their £
  value, plus a weekly tracking health check. One Google sign-in per owned
  website serves both Search Console and Analytics, and everything the two
  have in common is stored once (GA18). Its own Google Analytics: Collector
  Agent and schedule, collecting at once on connecting. Six phases, about
  twenty-four days. **Phases 0 to 4 built 2026-10-10 and running on dev:
  Ronins connected and collecting, the Collector Agent and its daily 04:00
  schedule switched on. Phase 5 — Heroes and attention, What Hakken sees on
  sixteen screens, the review canvas's changes (§13–§16), about eight and a
  half days — built 2026-10-10 in local commits on dev, not pushed, with
  Analytics' visits beside Search Console's clicks in the hold's page list;
  the page-number change (Q12) built and held for Anthony's word (§17).
  Second round (§18) drawn and agreed 2026-10-11: people, page views first,
  page titles, campaigns, the page before, every event, home countries only,
  products, visitors, live, and charts on every screen, with Ask Hakken
  reading all of it — eleven phases, about twenty-seven days with "people who
  converted after it". All eleven built 2026-10-11 in local commits on dev,
  not pushed, each checked on Ronins in Chrome; the full gate passed.**
  Heroes and attention removed 2026-10-13 at Anthony's ask; a landing
  page's own screen keeps its four stages, and the removed screen's old
  addresses open Landing pages.
- [Insights to one standard — every judgement decided once, by its agent](./active/insights-one-voice-plan.md)
  — started 2026-10-12: every Insights screen to the standard Keyword
  cannibalisation reached that day. Code gathers the evidence; a rule makes the
  first pick; the Head of Strategy hands each judgement to its agent when
  something changed; it is saved once and read by the screens, findings,
  reports and Ask Hakken. First the weekly run is made to hand itself on in
  steps, after a run was cut off at Convex's 10-minute limit. Eight phases
  plus keyword difficulty, about 14 man-days; built overnight 12 October on
  local dev, each phase committed and not pushed, proved on ronins.co.uk;
  about 95%, with seven items waiting on Anthony.
- [Keyword cannibalisation — which page owns each search](./active/keyword-cannibalisation-owners-plan.md)
  — started 2026-10-12, after Anthony disagreed with Ronins' advice (Surrey's
  page kept over London's; the national mobile app page merged into London's).
  Each search gets its own owner, weighed by kind, place, words, Google's choice
  and enquiries from Google, never one figure alone. A Keyword cannibalisation
  specialist, handed the groups by the Head of Strategy, decides and writes the
  page; the result is saved once and read by the screens, findings, Page
  decisions and Ask Hakken. Built on local dev, not committed: about 80%. Four
  questions are open (the specialist alone writing the page; Jev picking each
  search's page; keyword difficulty from the monthly collection; "Your place"
  elsewhere).
- [Google Analytics — All pages, rethought](./active/all-pages-rethink-plan.md)
  — no money on the screen; a short "Views a day" chart (the website plus up
  to five ticked pages) over the table; Visits, Views, Views change, Dwell
  time, Conv., Conv. rate and Conv. change; filters Gains, Dropped, Static and
  No visits beside the search box. Drawn, agreed and built on dev
  2026-10-13 (about 9 man-days); two questions after building.
- [Google Analytics — Landing pages, as a flow](./active/landing-pages-flow-plan.md)
  — the "Visits by landing page" bars give way to "How visits moved through
  your website": landing pages, the next page and the page after, red tails
  for the visits that left, orange dots for conversions on each route, and a
  click on a page to follow its routes. The table becomes each landing page's
  own funnel (Visits, Left here, Went on, Most went to, Converted), with no
  advice. Every page in the section opens the page's own screen, and back
  returns to where you came from. Follows the section's data standard.
  Every ask reads Google's allowance left and stops above a fifth.
  Drawn, agreed and built on dev 2026-10-14 (about 12.5 man-days; local
  commits); ronins.co.uk's new lists fill at its next collection.
- [Google Analytics — Conversions with Events merged in, and Visitors](./active/ga-conversions-visitors-plan.md)
  — Events joins Conversions as one page: "How visits reached a conversion,
  by page classification" (channel → classification → how the visit ended,
  key events not counted and kinds that never happened shown), "What people
  did before converting" (12 months, orange above the website's rate), and
  one table of every event, conversions first. Visitors gains "Where each
  kind of visitor lands, by page classification" and "Lands most on". Three
  new shared lists and about 8 nightly funnel asks; no fill. Drawn and
  approved 2026-10-14 (about 9.5 man-days) and built on dev the same day,
  not committed; conversions by page classification added on Anthony's word.
- [Google Analytics — Overview: every figure](./active/ga-overview-plan.md)
  — Overview keeps What Hakken sees, its figures and its chart, then one
  panel for each kind of data, each its top 3 rows and a link to its own
  page: channels, page classifications, landing pages, conversions, who
  visited, the shop (only when the website sells) and tracking health. Reads
  only what the night's run keeps. Drawn as option 4 of 4 and built on dev
  2026-10-15.
- [Google Analytics — Tracking health: the checklist](./active/ga-tracking-health-plan.md)
  — four figures for what is wrong, then all 12 checks in one table, one
  line each and the failing ones first; each check opens its own screen
  with what it found, why it matters and the fix as numbered steps. Reads
  only the checks the weekly run keeps. Option 1 of 3, chosen and built on
  dev 2026-10-15.
- [Google Analytics — a page's own screen that tells its story](./active/analytics-page-screen-plan.md)
  — the All pages screen of one page gains the visits that started on it and
  their conversions, named apart from those made on it; different pages a
  visit, with its repeats; where visitors went next; one line per source
  (never grouped); first visit or back again, phone or computer, countries,
  weekdays, age and gender (saying how many Google knows), read to the end
  and links out; and its page group's busiest pages beside it. Asked of
  Google when the screen opens. Eight phases, about fourteen days. **Drawn
  and approved 2026-10-13 (one board in
  `docs/plans/assets/analytics-page-screen/`), planned the same day, and
  Anthony's questions answered. Built on dev the same day, every phase,
  checked on ronins.co.uk's Kapferer article; committed, not pushed.**
- [Bing Webmaster — for your own websites](./active/bing-webmaster-plan.md)
  — a new "Bing Webmaster" item in the main menu, after Search Console:
  each owned website's real clicks, impressions, keywords, pages and
  crawling from Bing, every figure beside Google's from Hakken's own Search
  Console, a Bing against Google screen and each page's own screen; Ask
  Hakken reads it and the Executive summary counts it. Free, collected by
  its own Bing Webmaster: Collector Agent, and stored once with Search
  Console's pages and keywords. Seven phases, about seventeen and a half
  days. **Drawn 2026-10-12 (nine boards in
  `docs/plans/assets/bing-webmaster/`) and planned the same day; Anthony
  answered the six questions the same day. Nothing built ("Update the plan
  only don't start"). Open: whether asking Bing to read a page again is
  built in this plan (§10).**
- [Core data — each keyword and page once](./active/core-data-normalisation-plan.md)
  — normalising the core before roadmap features (Anthony, 2026-10-08): each
  keyword stored once for the platform, each page once per website, a
  company's private ones once per company, lists holding numbers; every screen
  proved inside Convex's limits at five times morehandles.co.uk's size. Four
  parts — Search Console, Sites and DataForSEO, agents and the rest, every
  other line of Convex's bill — about 26 days. **Done 2026-10-08: every
  step built, or measured and judged with its reasons; a clean week of
  Convex usage is still to be read on 2026-10-15.**
- [Keeping less history](./active/keep-less-history-plan.md) — keep only
  what a screen reads: keyword positions as graph lines (one record per
  keyword a month, not a row per check), the day tables nobody reads stopped
  or capped, Search Console's search and page lines kept 60 days with the
  long lists asked of Google, a keep rule for every table that grows, and
  what is stored but never read cut (part 5, agreed the same day); and Ask
  Hakken listing only the viewed company's websites, under 発見, with
  questions about Hakken (part 6, drawing signed off the same day).
  **Planned 2026-10-07; phases 1 (quick wins) and 2 (Ask Hakken) built the
  same day, on dev; phase 3 measured, waiting on Decision 10; ten decisions
  open; about 20 to 25 days in seven phases.**
- [Hakken tasks — the assistant that does the work](./active/hakken-tasks-plan.md) —
  on top of the assistant's foundation: a person asks Ask Hakken to keep an
  eye on something, Hakken writes the task back for a yes, checks each
  morning and lets them know in the bell, by email and in Telegram; six
  built-in agents (the Hakken Assistant, Watcher, Stat Report, Research,
  Weekly Digest Email and Caretaker Agents); charts in Ask Hakken; every email
  Hakken sends moved onto one new style. **Planned 2026-10-07, drawings
  signed off the same day; all six phases built the same day. The live
  Telegram bot is still to be created with Anthony when it is tried.**
- [The assistant's foundation — one brain, many doors](./active/assistant-foundation-plan.md) —
  before Hakken becomes a personal assistant that takes on jobs, one brain:
  what Hakken knows put together in one place for every door (typed and
  spoken Ask Hakken, the phone line, email replies, the website chat), Ask
  Hakken on the agent runtime as a built-in Hakken assistant, the first four
  read tools giving the company's real figures through the screens' own code,
  a client picker for super admins, and a guard so a second brain cannot come
  back. Anthony: "we cannot have two AI giving two different answers". The
  wider assistant's decisions (jobs, watches, Telegram first) recorded at its
  end. **Planned 2026-10-06, decisions taken the same day (everyone at
  once; Swarm removed); items 1 to 5 built the same day — one record of
  what Hakken knows, email replies under the same instructions, the guard,
  the built-in Assistant agent, and Ask Hakken answering through it with the
  Swarm removed — item 6, old and new compared (the same brain, the same
  cost, about 4 seconds slower), item 7, the company's own figures and its
  competitors' with a "Looked up" line, item 8, the client picker, and
  item 9, the old answer path removed, and item 10, every check passed —
  committed and pushed to dev.
  Speed: S1 measured where an answer's time goes, and S3 built — the wiki's
  page-picker started first, about 0.9 s off every answer that reads it,
  the same pages read.**
- [Finishing off](./active/finish-off-plan.md) — everything left from the
  usage credits and collection work, in order with days: big websites' Search
  Console figures, storing less, credits counting what came back, Usage while
  a collection runs, crawl refunds, crawls once in 30 days, crawls turned away,
  competitors only what benchmarking needs, nothing bought again while fresh,
  less often where the data barely changes, a clear-out of what is no longer
  collected, 10,000 credits a month for now, a notice when it needs a person,
  competitors' screens and cost forecasts brought into line, the release, and
  the loose ends. **Written 2026-10-05; about 13 to 14.5 days.**
- [Collection progress](./active/collection-progress-plan.md) — a
  collection sends itself to the end (one continuous send, AI questions five
  at a time, a $3 limit per website instead of $15 a run, $100 a day for all
  of it) and Admin → Websites → Collection pipeline says what it is doing:
  progress, what it is on, time left, cost and credits. **Planned, drawn,
  approved and built 2026-10-05, pushed to dev and on the dev deployment; the
  Collector's two limits to be set on production when it is deployed.**
- [Usage and credits](./active/usage-credits-plan.md) — £200 a month per
  company including 1,000 credits (placeholders until the cost audit); every
  piece of paid work uses credits at a price set in Admin → Settings → Credit
  prices, beside what it really cost us; plan credits end each month, bought
  ones last 12 months; a new Usage menu — Overview with credits by website,
  owned and tracked, then By work, By website, Coming up, a bank-style
  Statement, Purchases and Top up. **Planned and drawn 2026-10-05 (eight
  boards approved); about 12 building days; questions left outstanding;
  steps 1 (every charge recorded), 2 (Admin → Credit prices), 3 (the five
  Usage screens) and 6 built on dev the same day; no charging yet, so steps 4
  and 5 are parked.**
- [Keyword research](./active/keyword-research-plan.md) — Discovery →
  Keyword research, like Ahrefs' Keywords Explorer: look up any search, its
  overview, Google's results, ideas, what the AI says, and starting from a
  competitor, with research lists and Track. **Decided 2026-10-04 (a new
  Keyword research agent buys; anyone who can edit looks up; 100 ideas of
  each kind; kept 30 days); built on dev the same day; the first lookup waits
  for his go.**
- [Design drift: one record for the look](./active/design-drift-plan.md) —
  the look (colours, font) kept in one repo file copied from System Settings;
  a drawing kit built from the app's own stylesheet and components; every
  canvas redrawn on it; approved screens held to their drawings by look
  tests; tables that fit as a kit rule; one guide every agent reads. After
  the Keyword research drawings drifted, 2026-10-04 ("We cannot go through
  this with every agent"). **All five parts built on dev 2026-10-04: the record, the kit, every canvas redrawn, tables that fit and 26 approved screens held by look tests, the guide; the app now in Inter.**
- [Sites: moving between a company's own websites](./active/sites-website-switcher-plan.md) —
  Sites opens on "Your websites", each owned site with its competitors folded
  beneath it; the site's name in the header is the switcher, grouped the same
  way, and switching keeps the page you are on; the left menu has one item
  under Sites, "Your sites"; a sheet on a phone. Drawn for Korda's five
  websites and chosen 2026-10-01 ("can we just use this i love this"); the
  competitor chip row was rejected. **Built on dev 2026-10-01, awaiting
  review.**
- [Content gap, laid out like Ahrefs](./active/content-gap-ahrefs-layout-plan.md) —
  the keyword and what it is like (what they want, volume, KD), then a
  Position and Traffic pair per competitor under its
  name, tinted where it ranks, the keyword kept in place as the table scrolls
  sideways; organic search only. Drawn and approved 2026-09-30 ("yes please
  build it"); built the same day — "this is a great screen now".
- [Knowledge, News and the weekly digest](./active/knowledge-news-and-digest-plan.md) —
  a Knowledge item and a News item on the main menu, after Search Console;
  articles read by Ask Hakken, never shown in Sites; News collected by a News Collector
  agent (blogs, YouTube, X accounts and Anthony's X bookmarks) plus Google
  updates entered by hand; a weekly "Weekly News Digest" email queued by a
  Weekly Digest agent into an outbox that an Email Sender agent (no AI) sends
  through Resend. Three agents with roles, schedules, logs and costs. Ten
  phases, 17.5 days, with Google updates marked on every dated Sites chart.
  **Every phase built on dev 2026-10-01. Nothing has run for real: it waits
  on configuration — a fast model, Resend's domain and webhook, X's keys, the
  agents and their schedules. News sources replaced 2026-10-10 by the
  [Content plan](./active/content-people-knowledge-plan.md)'s Who to follow.**
- [Status labels: icon and words, no pills](./active/status-labels-plan.md) —
  every rounded, tinted status pill on the dashboard (104 kit uses, about
  nine parts built on it, about 70 drawn by hand) becomes a small line icon
  in the status's colour and plain words, drawn by one kit part,
  `StatusLabel`; guards stop a pill being drawn again. Chosen 2026-09-29
  (option C); all six steps built on dev the same day.
- [Knowledge search: a relevance cut-off, and five gaps closed](./active/knowledge-relevance-cutoff-plan.md) —
  one more Decision, "does this passage help answer the question?", asked of
  Jev once per search over the top 40 pieces, shipped off and trialled in
  "Ask a person" first; plus five gaps in the knowledge search, and an
  agent's runs no longer reading another company's pieces. Built 2026-09-28,
  shipped Off; the trial waits for knowledge on Ronins.
- [Fan-out queries: checked once, then only the ticked ones](./active/fan-out-opt-in-plan.md) —
  every fan-out query is checked on Google once, then only if ticked; at most
  200 ticked per owned website (a platform → company → website limit); the 87
  switched on automatically are unticked. Built on dev 2026-09-28, awaiting
  review.
- [Your prompts → each prompt's fan-out queries](./active/prompt-fan-out-queries-plan.md) —
  click a prompt to open its fan-out queries: an admin list, checked on Google
  by itself — add your own, edit, delete (never back on its own), or generate
  them now from the assistants. Every cap on prompts, tracked keywords and
  purchases is a company and website setting. Built on dev 2026-09-28,
  awaiting review.
- [Admin → company → Websites: one menu for the whole section](./active/websites-section-menu-plan.md) —
  the company's Websites screens rebuilt around one menu down the left, with
  a website chooser that narrows every page to one site: the websites, what
  the company tracks, what came back, and collection — every page one click
  away, one name per idea, and a website's settings in one place. Chosen by
  Anthony from three options drawn on a canvas with Korda's real rows ("a i
  think lets build it"). **Built on dev 2026-09-28, awaiting review.**
- [Brand names, business profile and known competitors — set by each company](./active/company-level-website-facts-plan.md) —
  the three things the shared website record still holds for every company
  watching a host, moved to the company level at Anthony's word (2026-09-28).
  Brand names decide which AI answers count as naming a site: an answer is
  read once against every company's names and each company counts only its
  own — still bought once; the business profile feeds only the AI judgments;
  known competitors are retired, each company's Competitors tab being the
  company-level version already. **Plan written 2026-09-28; CL0 decided,
  CL1–CL7 taken as recommended ("keep going i will review at the end"). Built
  on dev 2026-09-28, awaiting review — answers already held are not read
  again, and Name moves are no longer drawn (§7).**
- [Sites — Missing angles: the fan-out searches you have no page for](./active/fan-out-angles-plan.md) —
  for each question a company asks, which of the searches the AI assistants
  ran to answer it the site already ranks for, and which angles it has no page
  for: a to-do list of missing angles, on the Fan-out queries page and the
  site's moves. Real counts from dev: nine in ten fan-out searches are not in
  a site's ranked list, so positions come from a Google check or Search
  Console and pages from a judgment; Google AI Overview fan-outs from
  DataForSEO's LLM Mentions as a last step; and an input screen inside the
  company in Admin — its AI questions, Google searches and the searches the AI
  ran, to add, pause and track — drawn and agreed (FA9), tracking being how a
  fan-out search is checked on Google (FA2). **Every decision agreed
  2026-09-28 ("yes do it all"), FA3 dropped. Built on dev 2026-09-28, awaiting
  review; FA8 built switched off and never run, its search by the site's
  domain left for review (§6).**

- [Page groups and Your pages](./active/page-groups-plan.md) — a website's
  own sections in its own words (admin, by address rules and sitemap files),
  replacing Hakken's page kinds on its screens once set, and a Your pages page
  in Sites setting its sitemap against what was crawled, shown by Google and
  ranking. **Agreed and drawn 2026-10-03; stages 1 and 2 built the same day,
  and stage 3 but for classifications in reports — there is no reports
  feature yet for them to go in; classifications in downloads are done.**

- [Tracked pages — what a company tracks, from the menu](./active/tracked-pages-plan.md) —
  a page per tracked list inside its own section: Search Console's Tracked
  keywords and Tracked pages in a new Tracked group, and Sites' Tracked fan-out
  queries beside Your searches; each section's lists stay its own.
  **Agreed, drawn and built 2026-10-03.**

- [Sites — Search Console for your own websites](./active/search-console-plan.md) —
  connecting an owned website's Google Search Console and showing its real
  clicks, impressions, click-through rate and position in a new Search Console
  menu group: how the API works (no official MCP server; the read-only scope,
  the Google app that must be published or connections die in seven days),
  what Hakken already has from the Gmail connector, collecting daily with
  sixteen months on connecting, four screens, and what Anthony sets up in
  Google. **All nine decisions agreed 2026-09-27. Built 2026-09-27 but for
  Phase 4: connecting, collecting, and the Search Console section in the main
  navigation, tested with Google faked. Google setup done and ronins.co.uk
  connected on dev 2026-10-02; the screens still to check against Google's
  own. Screens beyond Google's own: three drawn 2026-10-02, to be adjusted
  (§11).**

- [Sites — every number whole, or saying which part it is](./active/sites-data-completeness-plan.md) —
  a full audit of what we buy from DataForSEO and what every Sites screen shows
  against the supplier's own totals, on all 17 websites on dev: limits that
  count rows instead of searches, lists cut at 1,000 whatever the setting,
  moves that can never show a loss on a cut-short site, two meanings for "top
  3" and for "linking websites", and screens that show part of a list as the
  whole. Two bugs in the everyday check, built earlier that day. **Audit done
  2026-09-27; approved the same day, all of it; built the same day, committed
  2026-09-28 and pushed to dev — three decisions left (§8.5).**

- [Sites — fixing what the screen audit found](./active/sites-audit-fixes-plan.md) —
  every Sites screen opened in Chrome on Korda and Ronins, and the code behind
  them reviewed: a crash, contradictory movement figures, charts that never
  fill in, figures that mislead, and limits no client has reached yet, in four
  phases with four decisions for Anthony. **Agreed 2026-09-26; built and
  checked in Chrome 2026-09-26, each fix with a test. Position bands, New and
  lost keywords and Site structure redesigned 2026-09-27 (§10), which settles
  G1; committed 2026-09-28 and pushed to dev; G2 still open.**

- [Sites — the AI figures from one summary per list](./active/sites-ai-list-summaries-plan.md) —
  Mentions, Share of voice, the header's counts and the Sites list read one
  summary per list, written when answers are filed, instead of a row or two
  per question and engine each time a page opens. **Built 2026-09-26;
  committed 2026-09-28 and pushed to dev.**

- [Sites — every table sorts the same way, by its headings](./active/sites-table-sorting-plan.md) —
  all 36 Sites tables sort like Keywords: press a heading for its best first,
  again for the other way, over the whole list; the six sort dropdowns go.
  **Built 2026-09-26, all five phases; committed and pushed to dev.** Its §9 records what
  was built and how it was checked.

- [Private searches and questions — each company's own lists](./active/private-tracking-lists-plan.md) —
  the Google searches and AI questions tracked for a company, and everything
  worked out from them, seen by that company only; still bought once when two
  companies track the same thing. Reverses the 2026-09-22 shared-list
  decision. **Built 2026-09-26, all six phases; committed and pushed to dev.** Its §9
  records what was built and how it was checked.

- [Sites — numbered table pages with exact totals](./active/sites-table-pages-plan.md) —
  an Ahrefs-style footer on every Sites table (numbered pages, the last page,
  25/50/75/100 rows, opening at 25, remembered per page), and exact totals with
  any page opened at once on the big lists, through a compact copy of each.
  Sites only; admin keeps its footer. **Built 2026-09-25, all five phases;
  committed and pushed to dev.** Its §9 records what was built and how it was checked.

- [Sites — what a client sees for each website they track](./active/user-sites-plan.md) —
  the user front end for the SEO data, Semrush-style: a Sites list, then one
  site with a side menu of one sub menu per kind of data we collect (AI
  answers, Google results, organic keywords, competitors, backlinks) and a
  date range on every page. Base layer first: only data we already collect,
  read-only, editing stays in admin. **Planned 2026-09-23; all five phases
  built the same night, storing everything 2026-09-24.**

- [One Website, Many Watchers — Websites, Competitors and the Collection Pipeline](./active/websites-and-competitors-plan.md) —
  the admin structure Hakken's SEO data hangs off, and the DataForSEO pipeline
  that fills it. A website exists once; a company holds its own websites and
  the competitors each is measured against sit inside them. Nothing
  company-specific ever lands on the website record. The SEO schedule is an
  ordinary `schedules` row; a cycle per company writes its work list in pages,
  reuses any answer younger than that company's own interval, and a small pool
  of claim-then-send workers drains `seoDataPulls` — because DataForSEO charges
  when a task is posted, not when its result is read. Pingback carries a task
  id and nothing else. The queue and its costs live on one global screen, never
  inside a company. **Built 2026-09-21.** It has never spoken to DataForSEO:
  credentials, the connector and every company's collection switch are all off
  until somebody decides otherwise, which is the same rule three times.

- [Brands, Places and AI Citations](./active/brands-places-and-ai-citations-plan.md) —
  the three gaps that stop the collection pipeline asking anything but "what
  links to this host" and "what does it rank for". A site has no name, so
  nothing can be asked about a brand; a site has no place, so local rank and AI
  citations have nothing to target; and the manifest has one cost shape where
  DataForSEO offers four. Brand names sit on the shared website record because
  two companies would not disagree about them, location sits on the join row
  because they would, and the thing we buy is the prompt rather than the brand —
  so one purchase answers every watcher, exactly as one row per host already
  does. **Built 2026-09-21 and 2026-09-22, with all four judgments for Jev
  through the Decisions framework (`convex/seoJudgments.ts`), each shipped
  switched off. Brand names moved to the company level 2026-09-28
  ([company-level website facts](./active/company-level-website-facts-plan.md)).**

- [Product-building foundations after cloning](./active/product-building-foundations-plan.md) — all four phases implemented; dated checks distinguish the original work, audit repairs and the September 14 billing experience. Live Stripe acceptance and release remain separate.
- [Optional Billing Starter and Current Handoff](./active/optional-billing-starter-proposal.md) — approved company frontend, private super-admin setup/oversight, access rules, metric definitions and verification status.

- [Ronin's Run 3D](./active/ronins-run-3d-plan.md) — separate first-person game
  using all four original map layouts. **Gameplay 100% (2026-09-13); the
  former overall figure withdrawn, as it did not measure the visual gap.
  Final visual acceptance and real-device tests remain.**

- [Ronin's Run — Night Heist Plan](./active/ronins-run-night-heist-plan.md) —
  four playable maps with saved unlocks, per-map bests, the preserved visual
  reference and improved running animation. Final balance and release checks remain.
  Updated 2026-09-12; overall approximately 93%; four-map progression and Spirit Power complete locally; gentler opening and louder sound verified in Chrome.

- [Hakken Speaks The Standard Tool Plug](./active/tool-server-plan.md) — connect
  to a service's own published tool server and get its tools without writing an
  integration. Read-only first; the real work is that tools become tenant-shaped
  for the first time. Agreed 2026-08-23, **delivered 2026-08-24**; all eight phases built, verified and documented.

- [Knowing When It Breaks — PARKED](./active/monitoring-plan.md) — nothing tells
  anyone when Hakken breaks. Better Stack across both halves, with the engine
  reported by our own code so the vendor stays swappable. **Decided then parked
  2026-08-23, not started.** The problem it solves is still open. ~5.5 days.

- [The Clean Cut — Turning A Clone Into A Client's Own Product](./active/client-product-cut-plan.md) —
  **delivered locally 2026-09-13; 100% complete.** Framework + Arcade always
  remain; four optional areas can be removed with their files, packages and
  shared references. Source checks, five generated builds and base/Arcade browser
  checks passed. See the [cloning guide](../operator/cloning-hakken.md).

- [The Governance Screens Read A Summary, Not The Estate](./active/governance-screens-read-a-summary-plan.md) —
  why the governance overview is the one admin screen that is not instant, and
  the fix: count as things happen into day buckets and an estate snapshot, the
  way the skills panel and the company inventory already do, so the screen
  reads a handful of rows instead of sweeping up to ~34,500 — and the
  compliance figures stop being silently capped. Agreed 2026-08-18; ~2.5 days.

- Movement Definitive Plan (not included in this copy) — the vision,
  acceptance rules, capture-screen rules, and work queue for all movement work.
- Movement Studio Reward Presentation Fix Plan (not included in this copy) —
  the active presentation plan for improving movement scoring and reward
  feedback while respecting the movement demo freeze. Read it before changing
  movement reward copy, scoring display, or customer-facing movement feedback.
- [Platform Hardening Plan](./active/platform-hardening-plan.md) — the platform
  hardening record for correctness, security, operational envelope, agent
  runtime, and reusability work. Its current handover states that all planned
  days are complete, but the document remains in `active/` as the detailed
  write-up until it is deliberately archived.
- [Admin UI/UX Plan](./active/admin-ux-plan.md) — the current admin usability
  plan for model catalogue, Skill Center, skill detail, model defaults, system
  options, API keys, and related admin surfaces. **Every phase done but D,
  corrected against the code 2026-10-10: D1 done 2026-07-25; D2 done, then
  made moot when the White Label section was deleted 2026-08-10; D3 in part —
  the create form still sits open above "Keys you have", so the list does not
  lead.**
- [OpenRouter And Model Scale Plan](./active/openrouter-and-model-scale-plan.md) —
  adding OpenRouter as a provider across the whole app, and the database-side
  paging, search indexes and rollups the model catalogue needs to hold hundreds
  of models. Owns the AI Providers screen and everything about provider
  resolution at run time.
- [AI Checks Plan](./active/ai-checks-plan.md) — the plan to make AI testing real
  and understandable across both surfaces. Owns company evals and agent evals,
  the shared "Check" vocabulary, and the readiness gates that depend on eval
  evidence. Read it before touching `convex/companyEvals.ts`,
  `convex/agentEvalFixtures.ts`, or either evals screen.
- [Agent Observability Plan](./active/agent-observability-plan.md) — the plan to
  replace the basic agent Logs tab with an Observability menu that answers
  whether an agent is working properly. Owns the agent Overview screen, the job
  detail and waterfall, the rebuilt raw logs, and the `agentLogs` fields that
  link a log entry back to its run. Read it before touching
  `convex/agentLogs.ts` or either of the agent logs and runs screens.
- [Public Website Plan](./active/public-website-plan.md) — the active plan for
  the public pre-login website, including the home page, future platform,
  showcase, trust, and contact pages, animation direction, public copy rules,
  route state, and the contact backend design.
- [User Directory Plan](./active/user-directory-plan.md) — the plan for the
  read-only, platform-wide user directory at `/admin/directory`, and for the
  login recording and 30-day aggregation behind its two activity columns. Owns
  `users.lastLoginAt`, `users.loginCount30d`, and `recordLogin`. Read it before
  touching the `logins` table or adding anything to `/admin/users`.
- [Email Design System Plan](./active/email-design-system-plan.md) — the plan to
  put every outbound email through one shared shell: platform alerts, invites,
  agent notifications, and workflow email nodes. Owns the neutral charcoal
  shell, the blue/gold/red accessible signal ramp, the sender identity, the
  plain-text alternative, and the legacy-Outlook client support matrix. Read it
  before touching `convex/emailLayoutService.ts`,
  `convex/platformAlertService.ts`,
  `convex/invites.ts`, `convex/aiToolNotificationService.ts`, or the email node
  in `convex/workflowRuntime.ts`.
- [Agent Autonomy And Approvals Plan](./active/agent-autonomy-and-approvals-plan.md) —
  the approvals and autonomous-tool-execution plan for agent runs and workflow
  approvals. Read it before changing approval queues, tool confirmation policy,
  parked run behaviour, or approval expiry.
- [Company AI Readiness Rebuild Plan](./active/company-ai-readiness-rebuild-plan.md) —
  the replacement plan for the company AI readiness screen and its score,
  model-routing, eval, memory, widget, skill, and activity signals.
- [Company And Agent Model Defaults Plan](./active/company-and-agent-model-defaults-plan.md) —
  the plan for bringing company model overrides and agent engine settings up to
  the platform Model Defaults standard.
- Workspace Sales Data Plan (not included in this copy) — the plan
  for the optional per-workspace spreadsheet import and its three browsable
  tables, and for the `companies.enabledModules` flag that switches any optional
  section on for one workspace without naming a client in platform code. Owns
  optional module (not included in this copy), the workbook parser, and `/app/<workspace>/spreadsheet-import`. Read it
  before adding another client-specific section, or before touching the module
  registry in `convex/utils/companyModules.ts`.
- Workspace Customer CRM Plan (not included in this copy) — the
  plan for customer records inside the workspace section: a searchable customer
  list, a profile holding the details staff type in, and the buying history the
  import already provides. Read it before adding anything customer-shaped to
  the sales data vertical, and for what the import does and does not hold —
  there are no orders in it, and only 39 customers behind the 4,568 rows.
- Workspace Customer Research Agent Plan (not included in this copy) —
  the plan for the agent that searches the internet for what the sales import
  cannot supply: the contact details behind each customer, and the other sites
  in a group the workspace does not yet sell to. Owns the
  `salesDataCustomerResearch` and `salesDataProspects` tables, the three
  customer research tools, the rule that decides whether a finding is written or
  parked for review, and the rules that stop a discovered site being filed as a
  prospect when it is already a customer. Read it before giving any agent write
  access to workspace customer data, before adding anything to the customer
  list that is not an imported account, and it defers autonomy and approval
  behaviour to the Agent Autonomy And Approvals Plan.
- Comax Opportunity Report Plan (not included in this copy) —
  the plan for the Comax - Opportunity Report Agent and its screen: pricing
  every prospect from the spend of similar-sized customers (bedrooms for care
  homes, pupils for schools, same parent group first), pricing the product
  categories a chain member is not buying that its siblings are, and the
  report screen with the run button and progress bar. Owns the
  `salesOpportunityReports` table, the `opportunityReport.*` tools, and
  `/app/<workspace>/opportunity-report`. Read it before adding anything
  opportunity-or-revenue-shaped to the sales data vertical.
- [Governance And Trust Plan](./active/governance-and-trust-plan.md) — delivered
  2026-08-06, and kept in `active/` because its framework test and its recorded
  decisions govern what comes next. The phased plan for the AI register, risk
  classification, evidence export,
  governance navigation, and the access-control and personal-data-rights work a
  serious enterprise buyer checks for. Owns the Governance section, the auditor
  and read-only roles, one-time-code sign-in, and anything claiming compliance
  evidence. Records the decision not to build single sign-on. Read it before
  adding a governance surface, a new role, or a sign-in method.
- [Seven Gaps Plan](./active/seven-gaps-plan.md) — the active product gap map
  for the final customer-visible surface areas that make the platform feel
  complete: seeing calls and email, connections really checked, the visitor
  book, the day view, search from anywhere, a company's own look and its own
  bill. Read it before claiming those gaps are closed or adding a new
  top-level user-facing gap. **Phases 1 and 2 built 2026-08-16 (admin Calls,
  the Connections screen, real probes, the job ledger, Health); Phase 1's
  Mailbox went with Gmail 2026-10-09. Phase 7 overtaken by Billing and Usage,
  except the 90% in-product warning, not built. Phases 3 to 6 — the visitor
  book, the day view, search from anywhere, the look screen for company
  admins — not built, about 5½ days.**
- [Audit Trail Plan](./active/audit-trail-plan.md) — the plan to make the audit
  trail say what happened rather than only what fields changed, written after
  most rows on the finished screen read "nothing recorded" over records that
  held plenty. Owns `convex/auditLogService.ts`, `convex/auditLogs.ts`, both
  audit trail screens, and the rule the rest of the platform follows when
  writing an entry. Records the decision that retention deletion must log
  itself, and the decision not to build tamper-proofing or page-view logging
  yet. Read it before adding an audit entry anywhere.
- [Knowledge Markdown And Bulk Upload Plan](./active/knowledge-markdown-and-bulk-upload-plan.md) —
  the plan to accept `.md` files and Google Cloud's Open Knowledge Format
  bundles across global, company and agent knowledge, and to upload many files
  or a whole folder in one gesture. Owns the two duplicated upload allow-lists
  in `src/lib/constants/uploads.ts` and `convex/utils/uploadPolicy.ts`, the
  upload half of `KnowledgeManager.tsx`, and the new pending-file ingestion
  queue beside `processWebsiteQueue`. Records the latent
  `getNextPendingUrlInternal` defect that bulk file ingestion activates, and
  the decision to leave the whitespace-collapsing chunker alone for now. Read
  it before widening any upload allow-list or scheduling `ingestDocument`.
- [Two Brains Architecture](./active/two-brains-architecture.md) — the active
  architecture note for keeping the platform brain and each company brain
  separate: global wiki content lives only where it is true for every company,
  while company wiki content stays tenant-scoped. Read it before merging global
  and company knowledge paths or reworking wiki ownership.
- [Personal Layer And Goals Plan](./active/personal-layer-and-goals-plan.md) —
  the active plan for the user's personal assistant layer, goals, and memory
  surfaces. Read it before changing profile assistant notes, personal memory,
  or goal-shaped assistant behaviour.
- [Wiki Scaling Note](./active/wiki-scaling-note.md) — the active note for wiki
  scale, route ownership, and known follow-up areas as global and company wiki
  use grows. Read it before adding broad wiki indexes, new wiki routes, or
  maintenance work that changes wiki volume assumptions.
- [Self-Improvement Plan](./active/self-improvement-plan.md) — the plan to
  close the four learning loops that already collect signal and throw it away:
  automatic reflection on failed runs, outcome-weighted memory ranking,
  end-user feedback in chat, and retrieval priors from rated answers. Owns the
  `SELF_IMPROVEMENT_CONFIG` kill switches and the `messageFeedback` and
  `knowledgeChunkStats` tables. Phase 5 was decided 2026-08-10: memory
  learning is **fully autonomous** (`autonomousMemory`, default on) — new
  memories save immediately, labelled and audited, with no per-memory
  approval; the recorded decision in the plan says why and what still
  guards it. Read it before
  touching memory ranking in `convex/agentMemories.ts` or
  `convex/companyMemories.ts`, `convex/agentRunReflections.ts`,
  `convex/agentMemoryCandidates.ts`, `convex/companyMemorySuggestions.ts`, or
  the fusion in `convex/knowledgeRetrievalService.ts`.
- [Retention And Purge Plan](./active/retention-and-purge-plan.md) — the
  plan to make the Log Retention & Purges engine actually work now that the
  platform has real history to delete: a stuck-run reaper, a rebuilt chat
  purge that stops orphaning feedback and leaking storage blobs, dispatcher
  hardening, five cheap new pipelines (public API requests, auth events,
  rate-limit counters, analytics snapshots, webhook deliveries), the big
  agent-run-history pipeline with its cascade rules, and a staged live
  proof on dev data ending in an enablement runbook. Owns `convex/purges.ts`,
  `convex/purgeScheduleService.ts`, the retention screen, and the decision
  record on what retention must never delete (approvals, learning tables,
  cost history). Read it before adding any table that grows with time, or
  before deleting anything in bulk.
- [Theme Compliance Plan](./active/theme-compliance-plan.md) — the plan to
  make the Global Aesthetics screen truthful: fix the live font-cycle and
  save-corruption bugs, add the warning/info/sidebar/muted tokens the app
  actually needs, replace ~2,000 hardcoded colour sites with a StatusPill
  atom and four semantic tones, put usage descriptions on every row, and pin
  the drift with a ratchet test. Owns `src/context/SystemSettingsContext.tsx`,
  the `@theme` block in `src/app/globals.css`, the Aesthetics screen, and
  `useSystemSettingsForm`. Scope is the dashboard app only — the public
  site, login, and emails keep their own fixed designs by owner decision.
  Read it before adding a colour, a status pill, or a settings row anywhere.
  **Phases 0–3 built 2026-08-10, and Phase 4 but for the 4.4 sweep, which
  continues: the hard-coded colour ratchet, recorded at 1,231 then, is 649 on
  2026-10-10 (`code-ratchets.json`, "theme").**
- [Assistant Streaming All Providers Plan](./active/assistant-streaming-all-providers-plan.md) —
  the plan to make plain assistant replies stream word by word on OpenRouter,
  OpenAI, and Anthropic, matching what Google Vertex and the agent loop already
  do. Owns the `onText` behaviour of the three assistant-path provider
  adapters (`convex/openaiProviderService.ts`,
  `convex/anthropicProviderService.ts`, `convex/openrouterProviderService.ts`)
  and the retirement of the private SSE parser in
  `convex/anthropicStreamService.ts`. Provider resolution stays with the
  OpenRouter And Model Scale Plan. Read it before touching how any assistant
  reply reaches the message row.
- [Tasks And Notifications Plan](./active/tasks-and-notifications-plan.md) —
  the plan for the two primitives the platform has never had: a task, meaning
  work held for a named person, and an in-app notification, meaning the
  platform reaching that person somewhere other than their inbox. Owns the
  `tasks` and `notifications` tables, `/app/tasks`, the header bell, the
  `task.create` agent tool and the `taskNode` workflow node, and it closes
  `OUTSTANDING-TASKS.md` item 6. Read it before adding anything that assigns
  work to a person or tells them something happened. A task is not an
  approval — approvals stay with the Agent Autonomy And Approvals Plan.
- [Hakken Can Be Spoken To, Phoned, Emailed, And Shown A Photo](./active/showcase-channels-plan.md) —
  the showcase roadmap giving the one brain more doors: voice-to-voice with a
  talking character, spoken answers in the caller's own language, an inbound
  telephone agent with the hang-up-and-watch finale, acting on photos, a
  dedicated Gmail inbox the agent reads and replies from, and the
  receptionist kiosk screen. Owns the build order and the recorded decisions
  that Hakken answers calls but never makes them, that the email phase builds
  the platform's first working connector (Gmail, one dedicated mailbox,
  consent-screen key, no passwords ever), and that the rest of the connector
  catalogue stays out of scope. Each phase has its own detailed plan, listed
  next, but for the telephone agent (completed) and the Gmail inbox, retired
  2026-10-10 after Gmail was removed from the app on 2026-10-09; both are under
  Completed below.
- [Hakken Speaks — The Voice Session And The Talking Character](./active/voice-session-plan.md) —
  phase 1: the voice session in Ask Hakken — speech in, spoken replies out,
  the moving sound-shape on screen. Owns the `speech` use case, the
  `synthesizeSpeech` action, the session surface and turn loop,
  sentence-buffered speaking, and the `SpeakingCharacter` interface.
  Records the decision that the character is a sound-shape (VRM avatars
  rejected as childlike) and that barge-in and open-mic are out of scope.
- [Ask In Any Language, Hakken Answers In Kind](./active/voice-languages-plan.md) —
  phase 2: the reply follows the language of the caller's latest turn.
  Owns language detection in `transcribeAudio`'s return shape, the
  reply-language rule for voice turns, and the language→voice map.
- [Show Hakken A Photo And It Acts](./active/photo-actions-plan.md) —
  phase 4: photos into chat and widget, vision-aware model routing, and
  the human-confirmed action chip that files a task from what the photo
  says. Owns the `chatImage` upload policy, attachment rendering, the
  vision gate in model resolution, the widget attach flow over the
  dormant upload endpoints, and the fix for the agent path silently
  dropping images. Records the decision that photos are inline evidence,
  never ingested knowledge.
- [The Receptionist Screen](./active/receptionist-kiosk-plan.md) —
  phase 6: the walk-up kiosk. Owns the `/kiosk/[widgetId]` surface on the
  widget's anonymous machinery, the kiosk enable flag, tap-to-wake,
  inactivity reset and token rotation between visitors, and kiosk health
  on the admin widget screen. Records the decisions that the kiosk is a
  widget presented differently, and that wake words are out of scope.
- [Decisions — TypeSafe judgments, visible and switchable](./active/decisions-typesafe-plan.md) —
  TypeSafe comes in as a judgment-only provider and every judgment it makes
  becomes a named Decision with a plain question, three certainty words,
  three modes (Off / Ask a person / Acts on its own), a run row, an audit
  entry when it acts, and one shared pill on every screen that shows a
  result, including Health, agent runs and chat logs. The rules Hakken uses
  today stay as each Decision's fallback. Mailbox first, then chat safety,
  then the wiki checkers. **About 95% built 2026-09-17 and 18 (TypeSafe's
  key set on dev 2026-09-18), the four SEO judgments 2026-09-22. The mailbox
  proof can no longer happen: Gmail was removed 2026-10-09, and its four
  Decisions stay registered, switched off. Only TypeSafe's output price on
  the catalogue is left.**
- [Documentation Coverage Audit](./active/documentation-coverage-audit.md) —
  the current documentation audit map, work queue, and validation notes.
- [Outstanding Tasks](./active/OUTSTANDING-TASKS.md) — the current queue of
  work left outside the platform hardening plan or deliberately stopped short of
  that plan.

The plans do not overlap. If work touches movement, the Movement Definitive Plan
wins. If work touches non-movement platform hardening, check the Platform
Hardening Plan, then Outstanding Tasks for current status. If work
touches AI providers, provider resolution at run time, or the scale of the model
catalogue, use the OpenRouter And Model Scale Plan. If work touches AI testing —
company evals, agent evals, or the readiness gates that read eval evidence — use
the AI Checks Plan. If work touches how an agent's activity is displayed — the
Observability menu, the job detail, or raw logs — use the Agent Observability
Plan, which defers approvals behaviour to the Agent Autonomy And Approvals Plan
and eval content to the AI Checks Plan. If work touches an agent filling in customer
details from the internet, use the Workspace Customer Research Agent Plan.
New parent-company discovery outside imported groups was the Market Discovery
Agent Plan's, retired 2026-10-10 with the Sales Data module it belonged to: it
is history, not guidance. If it touches the customer screens themselves, the
Workspace Customer CRM Plan wins.
If work touches revenue opportunities — prospect valuation, group gap analysis,
or the opportunity report screen — use the Comax Opportunity Report Plan.
If work touches the AI register, risk classification, compliance evidence, the
Governance section, roles, sign-in methods, or personal data rights, use the
Governance And Trust Plan. It owns approvals and audit-trail *placement*; the
Agent Autonomy And Approvals Plan still owns approvals *behaviour*.
If work touches what the audit trail records, how an entry is worded, or the
audit trail screens themselves, use the Audit Trail Plan. It takes the audit
trail's *content* from the Governance And Trust Plan, which keeps its placement
in the Governance section.
If work touches how the AI learns over time — memory ranking, run reflections,
feedback collection, memory suggestion queues, or retrieval priors — use the
Self-Improvement Plan, which takes its eval fixtures from the AI Checks Plan
and its approvals philosophy from the Agent Autonomy And Approvals Plan.
If work touches what happens to a reply after it is given — correcting it,
saving it, showing why it said what it said, or re-asking it on a schedule —
use the Closing The Loop Plan.
If work touches assigning work to a person, or telling someone in the app that
something happened, use the Tasks And Notifications Plan. It takes approval
behaviour from the Agent Autonomy And Approvals Plan and email from the Email
Design System Plan; it owns neither.
If work touches a new way of reaching Hakken, the umbrella Hakken Can Be
Spoken To, Phoned, Emailed, And Shown A Photo plan owns the build order and
the channel decisions, and the phase plans own their features: voice
sessions, speech synthesis, and the sound-shape belong to the Voice Session
plan; reply language and voice-per-language to the Voice Languages plan;
the phone number, call loop, and call records to the Telephone Agent plan;
images in chat or widget and acting on them to the Photo Actions plan;
the walk-up surface to the Receptionist Kiosk plan. The Gmail Inbox plan was
retired 2026-10-10, Gmail having been removed from the app on 2026-10-09; the
OAuth consent flow it built stays in `convex/connectorOAuth.ts`, used by
Search Console and X (`docs/developer/gmail-mailbox.md` says what went and
what stays).
Tasks raised from any channel stay with the Tasks And Notifications Plan,
outbound platform email styling stays with the Email Design System Plan,
and approvals behaviour stays with the Agent Autonomy And Approvals Plan.
If work touches which skills reach a company's chat or widget — the runtime
skill query, skill bindings, or the company skills screen — use the Company
Skills Apply Where They Are Bound plan. The Skill Center and skill authoring
stay with the Admin UI/UX Plan; eval content stays with the AI Checks Plan.
If work touches how an assistant reply streams into the message row — an
adapter's `onText` behaviour, the streaming mutations, or the flush policy —
use the Assistant Streaming All Providers Plan, which takes provider
resolution from the OpenRouter And Model Scale Plan.
If work touches theme tokens, the Aesthetics screen, status colours, or adds
any hardcoded colour to the dashboard app, use the Theme Compliance Plan.
If work touches the public pre-login site, use the Public Website Plan. If work touches documentation coverage, use the
Documentation Coverage Audit. If work touches the other named admin UX screens,
use the Admin UI/UX Plan.

## Retired And Completed Plans

Everything in [completed/](./completed/) is historical reference only unless a
current active document explicitly points to it for background. Retired movement
plans carry a note at the top pointing back to the Movement Definitive Plan.
Completed platform plans such as provider-neutral model work, analytics scale
optimization, platform scale hardening, post-scale hardening, Replay repair, and
Replay/Game alignment should not be treated as current implementation
instructions unless they are deliberately reopened.

## Completed

- [Admin Clone-Readiness Plan](./completed/admin-clone-readiness-plan.md) —
  delivered 2026-08-21, same day as approved: raw buttons 408→305 with two
  new frozen variants (`brand`, `outline`), all mirrored admin screens
  collapsed to shared `_features` bodies (three invitation screens now one,
  the users directory too), the admin section fully de-branded behind a
  zero-allowance guard that also scans both message catalogues, and ~2,170
  catalogue keys per language externalising all admin copy with an
  adoption-floor ratchet. Pushed to `dev` (21a0e7b2), then a sixteen-finding
  completeness audit closed the same day.
- [Foundation Quality Plan](./completed/foundation-quality-plan.md) —
  delivered 2026-08-21, same day as approved: 118 wiki/AI-runtime tests,
  ~340 `appError` conversions behind a clean-by-default guard, the `ai.ts`
  and `analyticsCron.ts` grab-bags split into seven modules, the docs
  contradictions removed, plus a ten-finding adversarial review fixed the
  same day. Coverage floor ratcheted 66→69. Pushed to `dev` (cd71774d).
- [Nothing The Kit Owns Is Drawn Twice](./completed/screen-kit-second-sweep-plan.md) —
  completed 2026-08-23: the follow-on sweep to the plan below. Where that one
  asked whether a screen copied the kit, this asked whether two screens copied
  each other — which passes every rule by construction. The same leaderboard row
  written nine times across three screens, three screens declaring a component
  the kit already exports, and twelve files drawing their own divided list. Two
  new rules came out of it, one starting with an empty frozen list. Read it
  before adding a part that "the kit doesn't have yet".
- [Every Screen Is Built From The Same Parts](./completed/shared-screen-kit-plan.md) —
  the base-layer plan, completed 2026-08-18: every admin screen on the shared
  kit, the kit accessible and phone-safe, capabilities withheld per company and
  granted by plan. Page headers were closed out of it for a future plan of
  their own. Still the document to read before adding a screen.
- [Observability Collection And Killswitch Handover](./completed/observability-collection-and-killswitch-handover.md) —
  archived 2026-09-21 when the demo modules were stripped. Handover context for
  honest Apify collection reporting and a visible agent kill switch; its worked
  example, the Rightmove property agent, is no longer in this repository.
- [Pressing Run Should Actually Run The Agent](./completed/agents-run-properly-plan.md) —
  archived 2026-09-21 when the demo modules were stripped. History of making
  manual and scheduled agent runs use the real tool-capable agent loop; its
  driving case, the Rightmove property agent, is no longer in this repository.
- [The Gmail Inbox That Answers Itself](./completed/gmail-inbox-plan.md) —
  archived 2026-10-10 when Gmail had been removed from the app (2026-10-09,
  `862d367e`; Anthony: "this app will never use it"). History of phase 5 of
  the showcase channels roadmap, built 2026-08-14: the Gmail connector, the
  mailbox watcher and its reply rails. The consent flow it built,
  `convex/connectorOAuth.ts`, stays — Search Console and X use it.
- [Market Discovery Agent Plan](./completed/market-discovery-agent-plan.md) —
  archived 2026-10-10 when the Sales Data module it belonged to had been
  stripped (2026-09-21, `c0c5092f`). History of the agent lane for finding new
  parent companies outside imported customer groups, about 70% built; none of
  it is in this repository any more.
- [Research Agent Autopilot Plan](./completed/research-agent-autopilot-plan.md) —
  archived 2026-10-10 when it had been stripped with the Sales Data module
  (2026-09-21, `c0c5092f`). History of turning the customer research and
  prospecting sweeps into one job run to completion under a single press,
  built 2026-08-03; none of it is in this repository any more.
- [The Self-Improving Wiki](./completed/self-improving-wiki-plan.md) —
  delivered 2026-08-14: Karpathy's LLM Wiki pattern built faithfully into
  Hakken — whole pages the AI rewrites after every conversation, tended on a
  schedule, readable and correctable in the company AI section.
- [Hakken Answers The Phone](./completed/telephone-agent-plan.md) — delivered
  and proven live 2026-08-14: phase 3 of the showcase channels roadmap — the
  inbound number, the turn-based call loop over provider webhooks, the
  hang-up-and-watch finale, the `phoneCalls` table and its purge pipeline,
  the `/api/telephony/voice` route, and the call log and detail screens.
- [The Wiki Replaces Knowledge](./completed/wiki-replaces-knowledge-plan.md) —
  delivered 2026-08-15: importing a website, file or text writes wiki pages
  directly, answers come from whole pages, and the document-and-fragment
  machinery retired behind an exam the new path passed.
- [The Wiki's Staff](./completed/wiki-agents-plan.md) — delivered 2026-08-15:
  the staff of seven live agents that tend, check and file — Distiller,
  Tidier, Linker, Contradiction Finder, Freshness Checker, Reviewer, Filing
  Clerk — drawn from Anthony's own Second-Brain playbook.
- [The Global Brain](./completed/global-wiki-plan.md) — delivered 2026-08-16:
  the platform's own wiki at the top — same wiki, same staff, same receipts,
  holding only what is true for every company; a company's wiki visible only
  inside its own company's section.
- [Watch It Think](./completed/watch-it-think-plan.md) — delivered
  2026-08-16: receipts on every answer, the Ask box, clean captures, and the
  wiki's diary.
- [One Brain](./completed/one-brain-plan.md) — delivered 2026-08-17: Saved
  Answers and Memory folded into the wiki, one place to correct the AI.
- [The Living Wiki](./completed/living-wiki-plan.md) — delivered 2026-08-17:
  the quick switcher, the local graph, wiki health, and the round trip.
- [Closing The Loop](./completed/closing-the-loop-plan.md) — delivered
  2026-08-17: the wiki learns from what people ask — every unanswerable
  question becomes a to-do, every answer marks the pages it stood on, the
  system reports its own week, and the exam grows from real questions.
- [Company Skills Apply Where They Are Bound](./completed/company-skills-surfaces-plan.md) —
  delivered 2026-08-13: the per-surface skill switches wired up — the runtime
  filters company skills through enabled COMPANY_CHAT/WIDGET bindings, import
  creates them on by default, and a migration backfilled existing skills.
  Records the decisions that skills stay always-on within their surface and
  that agent threads keep bypassing company skills.
- [Widget Messages Spend From The Company's Plan](./completed/widget-plan-quota-plan.md) —
  done 2026-08-09: the implemented decision that anonymous widget messages
  share the company's plan allocation, while quota refusals hide billing
  state, preserve PII redaction, and localize the platform-authored notice
  from browser language.
- [Platform Improvement Plan](./completed/platform-improvement-plan.md) —
  delivered across August 2026: shared hybrid retrieval, workflow retry
  safety, assistant streaming, rehearsal evals, and Sentry-backed error
  monitoring. Read it for the cross-feature acceptance record.
- [Maintenance Plan](./completed/maintenance-plan.md) — complete 2026-08-19:
  all 11 phases of the code-maintenance audit executed the same day the plan
  was written, with the coverage gate raised and the guard count at eight.
- [Handover — platform hardening](./completed/HANDOVER-platform-hardening.md) —
  the historical platform-hardening handover, kept for the technical detail
  behind each entry; its claims about uncommitted work are long superseded.
