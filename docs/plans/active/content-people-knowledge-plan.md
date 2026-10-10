# Content — people and their channels, News into Knowledge, and reading analytics — plan, 2026-10-10

Admin → Content is reshaped so Hakken does the work an SEO agency would:
you add a person and their channels once and Hakken collects what they
publish; you tick the good articles and Hakken keeps them whole, so Ask
Hakken can advise clients from them; and a new Analytics page shows, like
Google Analytics, how clients read it all — over time, by article, person,
company and user.

**Asked (Anthony, 2026-10-10), in order**, in his words:

- "i think we need a ux review of this section · What i add who to follow i
  want the system to automatically pull in the news and i dont want to setup
  news sources separately · i think we have duplication in this section that
  we dont need · on the who to follow section i want to be able on the click
  through to automatically get their content · some of the content is really
  good SEO knowledge that the clients would like and would also be useful for
  ask hakken. At the moment we only store a snippet but sometimes we want the
  entire article to be stored so we can give advice to our clients ·
  Remember the vision for the platform is to be software that acts like a
  service firm".
- "yes i think we need to change the UX so we show the person and then their
  channels maybe on a new sub page · i would like a tick box or something to
  mark the articles that i want to go into the knowledge · can we draw the
  new UX on a new canvas please".
- "i need to stress that the vision for the app is to do what a service firm
  does and cut out the agencies · i want the app to behave like an seo agency
  and seo expert" — and "love the new screen directions".
- "how do i manually add an article into the system if its from a source that
  we dont want to follow · but the article is still very good".
- "i think i also need analytics on the articles and people · Think like
  google analytics for how many times viewed and read etc or clicked · i want
  graphs over time and views, would be good to see which users and most
  active companies on this section too in the admin" — "again the UX for
  these screens would be great".
- On the canvas: no three boxes in a row and no 50% boxes ("too cramped");
  "having two tables on this screen is not good — can we not make the second
  table a click through"; "we need an overall trends graph on this screen
  too" (Companies, then Articles); "can the most section be tabs on the page
  to not make it as long".
- "i think this is good now, lets make this into a repo plan" — this plan.
- "i think i can add them manually we not need to automate looking for other
  channels" — C3, revised the same day; the boards were redrawn to match.
- "can you commit the plan when you finish please · then can you build this
  out please".

**Status, 2026-10-10:** drawn, approved and planned; built the same day,
phases 1–6, on `dev` in local commits (see "Build record" below). Overall:
built; not pushed, and nothing collected or paid for yet.

## The approved drawings

The canvas: <https://claude.ai/artifact/LRv9sVaUoxDfMB2i5SMw4T>, "Content —
people, news and knowledge". Its twelve boards are kept with this plan in
[`../assets/content-people-knowledge/boards/`](../assets/content-people-knowledge/boards/),
drawn from the drawing kit (`kit.css` d9c1f591dab2, look 149d9f4fb243) and
passed by `npm run check:drawing`. They are binding: a change to a drawn
screen is drawn and agreed again first.

| # | Board | Screen |
|---|---|---|
| 1 | `Main.dc.html` | Who to follow — one row per person, their channels, articles collected, in knowledge, newest, Our pick |
| 2 | `Person.dc.html` | A person — figures, their channels (Collect tick, status, found by Hakken or you), what they published with an **In knowledge** tick |
| 3 | `AddPerson.dc.html` | Add a person — name, their channels (one address a line), why, topic, Our pick |
| 4 | `News.dc.html` | News — every story with an **In knowledge** tick and Words kept |
| 5 | `Knowledge.dc.html` | Knowledge — ours and the web's in one list; New article, Add from a link |
| 6 | `Article.dc.html` | Add one article from a link — read once, summary for clients, the whole article kept for Ask Hakken |
| 7 | `AnalyticsOverview.dc.html` | Analytics — figures, views/reads/clicks by day, **The top five** with tabs: Articles, People, Companies, Users |
| 8 | `AnalyticsArticles.dc.html` | Analytics → Articles — overall graph, then every article with views, reads, read rate, clicks, in answers, trend |
| 9 | `AnalyticsArticle.dc.html` | One article over time — figures, its graph, the companies that read it |
| 10 | `AnalyticsPeople.dc.html` | Analytics → People — the people you follow, by how much clients read them |
| 11 | `AnalyticsReaders.dc.html` | Analytics → Companies — readers and companies by day, then the companies table |
| 12 | `AnalyticsCompany.dc.html` | One company — figures, its graph, its people and what each reads most |

## What is there today — 2026-10-10

Read from the code and the dev deployment the same day.

- **Eight items under Content**: Knowledge, Helpful content, News, News
  sources, Google updates, Who to follow, Topics, Outbox.
- **Who to follow and News sources are the same thing kept twice.**
  `newsFollows` (`convex/newsSchema.ts`) are links shown to clients —
  "Nobody watches these" — and `newsSources` are what the News Collector
  reads. Dev holds 7 follows (6 X accounts and 1 YouTube channel; Edward
  Sturm is two rows) and **0 sources**.
- **News has never collected.** No News Collector agent exists on dev and
  `X_BEARER_TOKEN` / `X_CLIENT_ID` are not set. News holds only the 3 Google
  updates typed by hand.
- **News keeps a snippet.** The collector reads at most 6,000 characters of an
  item (`ENTRY_TEXT_LIMIT`, `convex/utils/newsFeeds.ts`), writes a summary and
  "what it means", and keeps only those (`newsItems`).
- **Three kinds of article in three places.** `knowledgeArticles` (ours,
  copied to the shared wiki for Ask Hakken by `knowledgeArticleWiki.ts`),
  `libraryArticles` + `libraryArticleTexts` + `libraryArticleSections`
  (Helpful content: whole articles from the web, read through Firecrawl,
  searched by Ask Hakken in `assistantKnowledge.ts`), and `newsItems`
  (summaries only). Dev: 1 Knowledge article, 3 Helpful content articles.
- **Nothing records reading.** No table holds who opened, read or clicked
  anything in Insights; analytics start counting the day they are built.
- `FIRECRAWL_API_KEY` is set on dev.

## Decided — Anthony, 2026-10-10

| # | Decision |
|---|---|
| C1 | **Hakken acts as an SEO agency and an SEO expert.** Every part of this plan is Hakken doing the work — finding, reading, keeping, advising — with a person only choosing. |
| C2 | **Who to follow is the only source list.** News sources goes. A row is a person; their channels are on the person's own page. |
| C3 | **Add a person and their channels by hand** — website, YouTube, X, LinkedIn, one address a line, and more later on their page. Hakken does not look for channels ("i think i can add them manually we not need to automate looking for other channels"). Every channel added is collected; any can be unticked. |
| C4 | **A tick box puts an article into Knowledge** — on News and on a person's page. Ticked: Hakken keeps the whole article and Ask Hakken advises from it. Hakken does not decide on its own (answered: tick, not automatic). |
| C5 | **Knowledge is one list**: articles we write and whole articles from the web. Helpful content stops being a menu item of its own. |
| C6 | **One good article can be added from a link** without following its site (Knowledge → Add from a link). |
| C7 | **Analytics, like Google Analytics**, in Admin: views, reads and clicks, graphs over time, by article, person, company and user. |
| C8 | **Layout rules from the canvas**: no side-by-side panels (no halves, no thirds); one table per screen, a second list becomes a click-through; list screens carry an overall graph above their table; the overview's top-five lists are tabs in one box. |
| C9 | **Clients see our summary and what it means, never the copied words** (content-library-plan L7, kept). The whole text is for Ask Hakken. |

## The parts

### Who to follow — people and their channels (boards 1–3)

- `newsFollows` stays the person. A new **`followChannels`** table holds each
  channel: the person, kind (Website, YouTube, X, LinkedIn — read from the
  address), address, Collect on or off, last read, last new item, its feed
  or X id, and how many items it has given. It replaces `newsSources`, which
  holds no rows on dev and is removed.
- The 7 rows on dev become 6 people: Edward Sturm's X and YouTube rows merge
  into one person with two channels.
- Channels are added by hand, on Add a person and with Add a channel on a
  person's page (C3).
- **The News Collector** reads channels with Collect on, in place of
  sources; its run, its hand-on between steps and its limits are unchanged.
- **LinkedIn** cannot be read: its channel shows in Insights and is never
  collected ("Shown in Insights only: LinkedIn can't be read").
- **X** collects only once X is connected and paid for (Configuration).

### News into Knowledge (boards 2, 4)

- Each `newsItems` row gains its person and channel, and a link to the
  Knowledge copy when ticked.
- **Ticking** keeps the whole article in Knowledge: a `libraryArticles` row
  with its text and sections, as Helpful content keeps today, marked as
  coming from News and from that person. Its summary and meaning start from
  the News item's. A website item is read whole through Firecrawl (one paid
  page); an X post keeps the article it links to; see Q5 for YouTube and
  posts that link nowhere.
- **Unticking** takes it out of Knowledge and Ask Hakken; the News story
  stays (Q11).
- Words kept shows the kept article's length, "Reading the page…" while it is
  read, or "Summary only".

### Knowledge — one list (boards 5, 6)

- Admin → Knowledge lists ours (`knowledgeArticles`) and the web's
  (`libraryArticles`) together, newest added first, searched and paged on the
  server. To page and sort across both, each article keeps one small row in a
  **`knowledgeList`** table (kind, title, from, topic, words, status,
  translations, added), written on every save — the way `insightsCounts`
  keeps Insights' totals.
- **Add from a link** is Helpful content's existing reader and editor, moved:
  the address, Read the page, the details read from the page, What clients
  read, and the whole article kept for Ask Hakken.
- Helpful content's admin address redirects to Knowledge. What clients see in
  Insights is unchanged until Q10 is answered.

### Reading analytics (boards 7–12)

- **What is counted** (proposed, Q1): a **view** is a signed-in client
  opening an article or story in Insights; a **read** is staying on it 30
  seconds or reaching its end; a **click** is opening the original or one of
  a person's channels.
- A **`readingEvents`** table records each one: when, who, their company,
  what (article, story, person) and which. **Daily totals** are kept as they
  happen — per article, per person, per company, per user and overall — so
  every graph and table reads totals, never the raw events.
- **In answers** counts the times Ask Hakken drew on an article for an
  answer, from the sections it used (Q2).
- Only super admins see Analytics, in Admin. Events carry the company, and no
  company's screen ever reads another's.
- The screens, as drawn: Overview (figures, chart, The top five in tabs),
  Articles (overall graph, table, a trend line a row), one article (figures,
  graph, the companies that read it), People, Companies (readers and
  companies by day, then one table), one company (figures, graph, its people
  and what each reads most). Every list screen shares the period choice:
  last 7, 30 or 90 days, or 12 months.

### The Content menu

Analytics, Knowledge, News, Google updates, Who to follow, Topics, Outbox —
seven in place of eight (Helpful content and News sources go; Analytics is
new). Outbox's place is Q7.

## Limits — every one, named

| Limit | Value | Why |
|---|---|---|
| A new channel's first read | 5 items | `FIRST_READ_ITEMS`, unchanged |
| Items a channel gives in one run | 50 | `ITEMS_PER_SOURCE`, unchanged |
| Channels read in one run | 100 | `SOURCES_PER_RUN`, unchanged; the rest wait for the next run |
| Pages read through Firecrawl per channel per run (sites with no feed) | 10 | `PAGES_PER_SOURCE`, unchanged; each is a paid page |
| A run's working time before it hands on | 7 minutes | `RUN_WORK_MS`, unchanged |
| Text read for a News summary | 6,000 characters | `ENTRY_TEXT_LIMIT`, unchanged |
| A kept article | 100,000 characters | Helpful content's ceiling, unchanged |
| A kept article's sections | 3,000 characters, 60 an article | Unchanged |
| Ask Hakken's share of kept articles | 3 sections, 9,000 characters | Unchanged |
| Channels a person | 6 | Proposed: website, YouTube, X, LinkedIn and room for two more |
| People in Who to follow | 500 | Unchanged |
| Our picks | 4 | Unchanged |
| Admin tables | 15 rows a page | Admin standard |
| A read | 30 seconds, or the end reached | Answered, Q1 |
| The top five | 5 a tab | As drawn |
| Analytics periods | 7, 30, 90 days, 12 months | As drawn |
| Raw reading events kept | 90 days; daily totals kept for good | Answered, Q4 (`purges/readingEvents`) |
| Knowledge's one list | 900 articles read; past it the list says it was cut | Added in the build (`KNOWLEDGE_LIST_MAX`): each list row is small, and the read limit band starts at 1,000 |
| "In knowledge" count above News | 5,000; past it "5,000+" | Added in the build (`IN_KNOWLEDGE_COUNT_LIMIT`) |
| Things Analytics reads for one period | 900 each of items, people, companies, users | Added in the build (`ANALYTICS_ACTIVE_MAX`) |
| Day rows the Articles chart adds up when narrowed | 6,000; past it the chart is drawn from the most-viewed, and says so | Added in the build (`NARROWED_SERIES_BUDGET`) |
| A kept article's least words | 120; fewer is "too few to be the article" | Helpful content's, unchanged (`LIBRARY_MIN_WORDS`) |

## Build record — 2026-10-10

Built on `dev` the day the plan was approved, phase by phase, each a local
commit: `42cfb317` (1, people and channels), `2fedd608` (2, News into
Knowledge), `a7d221ef` (3, one Knowledge list), `824d7f79` (4, counting
reading), `7de1f9e2` (5, the Analytics screens), then phase 6's look tests and
these records. The first fills ran on dev: `2026-10-10-follow-channels`
(7 rows → 6 people) and `2026-10-10-knowledge-list` (4 articles).

Where the build differs from the boards, each said to Anthony:

- **Who to follow**: the X connection panel sits below the list; the person's
  stories table sorts by Published only.
- **News**: sorts by Published only, both ways — News keeps every story for
  good, so it pages by cursor rather than reading the whole list, and its
  count reads "45+ stories" until the last page is in.
- **Knowledge**: each row keeps the pin (lead the front page), which the board
  left out. Add from a link keeps Helpful content's Updated, Description,
  Status and Language fields.
- **Analytics**: one article's and one company's tables are short and do not
  sort; a person's row opens their page in Who to follow.
- **New part**: `TrendLine` (`admin/content/analytics/_components/`), a row's
  views by day as one small line — the Trend column on boards 8 and 10.

Other changes the build needed: Ask Hakken's Helpful content search now
returns each section's article, so In answers can count it; an edit of a web
article no longer drops the News story and person it was ticked from; and a
story taken down from News leaves its kept article in Knowledge.

## Phases — with days

| # | Phase | Days |
|---|---|---|
| 1 | **People and channels.** `followChannels`, the merge of the 7 dev rows, `newsSources` removed; Who to follow, a person's page, Add a person; the News Collector reading channels | 3.5 |
| 2 | **News into Knowledge.** The In knowledge tick on News and a person's page; keeping the whole article (Firecrawl, X's linked article); unticking; Words kept | 3 |
| 3 | **One Knowledge list.** `knowledgeList` and its upkeep; the merged admin list; Add from a link moved from Helpful content; the menu, redirects and both languages | 3 |
| 4 | **Counting reading.** `readingEvents` from Insights (views, the read timer and end, clicks), daily totals, In answers from Ask Hakken | 3 |
| 5 | **The Analytics screens.** Overview, Articles, one article, People, Companies, one company | 4 |
| 6 | **Checks and records.** A look test for each built board, the full local gate with GitHub's own steps, both languages, screen-kit.md, PRODUCT.md (only with Anthony's say, Q9), the earlier plans' dated lines | 1.5 |
| | **Total** | **18 days** |

## Configuration (Anthony, when ready)

From the [Knowledge, News and digest plan](knowledge-news-and-digest-plan.md),
still to do before anything is collected: the News Collector agent created
from its template and given its schedule; for X, `X_BEARER_TOKEN`,
`X_CLIENT_ID`, `X_CLIENT_SECRET` and `X_READ_COST_USD` — X charges for every
post read, and 6 of the 7 people today are X only; `FIRECRAWL_API_KEY` on
production before this reaches `main`.

## Open questions

| # | Question | Needed by |
|---|---|---|
| Q1 | ~~Is 30 seconds, or reaching the end, the right line for a **read**?~~ **Answered 2026-10-10: yes — 30 seconds or the end, whichever comes first.** | — |
| Q2 | ~~Keep **In answers** (times Ask Hakken drew on an article)?~~ **Answered 2026-10-10: keep it.** | — |
| Q3 | ~~Count our own team's reading, or leave super admins out?~~ **Answered 2026-10-10: leave super admins out.** | — |
| Q4 | ~~How long to keep each raw view: 90 days, with daily totals kept for good?~~ **Answered 2026-10-10: 90 days; daily totals kept for good.** | — |
| Q5 | A YouTube video or an X post that links to no article: summary only, or pay for a transcript? | Phase 2 |
| Q6 | ~~The channel finder: links on the person's own pages only, or a paid web search?~~ **Answered 2026-10-10: no channel finder — channels are added by hand (C3).** | — |
| Q7 | Outbox is the email queue, not content: keep it under Content or move it? | Phase 3 |
| Q8 | Collect Google updates from Google's Search Status Dashboard instead of typing them? | Later |
| Q9 | PRODUCT.md lists agencies as customers who run Hakken on their clients; "cut out the agencies" may change that — update it? | Phase 6 |
| Q10 | Insights shows Knowledge and Helpful content as two menus for clients: merge them there too? Only the admin side is drawn. | Phase 3 |
| Q11 | Unticking: remove the kept copy, or keep it out of sight in case it is ticked again? | Phase 2 |

## Not in scope

- Hakken choosing articles for Knowledge by itself (C4: a person ticks).
- Clients' Insights screens, beyond Q10.
- The weekly digest, X bookmarks and the outbox's sending.
- Analytics for anything outside Insights (Search Console, Sites, Ask Hakken
  conversations).
