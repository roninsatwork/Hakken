# Insights — Helpful content for readers, Knowledge and Who to follow redrawn, one lead story — plan, 2026-10-06

Learn becomes **Insights** and the Library becomes **Helpful content**.
Readers see Helpful content's articles in Insights as Hakken's own summary
with a link to the original; Ask Hakken answers from them for every signed-in
user, by meaning as well as by words; Knowledge and Who to follow are redrawn
in the News front page's style; one lead story can be pinned from News,
Knowledge or Helpful content; and every panel is one link that lights on
hover.

**Asked (Anthony, 2026-10-06), in order** — his words, with the names he used
at the time:

- "we have a new library section where i can add articles too but they dont
  show up on the user front end · can you audit the entire section" — the
  audit, below.
- "i also want all the content in this section to be searchable by ask hakken
  so that any users can either read the article or be told the answer by
  hakken"; then "1 a yes i agree lets avoid copyright and open the article for
  them to read · 2) Fix the weak spots - and any signed in user can use ask
  hakken · 3) i want to keep in the same style as whats there for the
  overview".
- "i want to be able to pin an article as the lead story - like the google
  core update too - but only allow one pin and if i pin another article it
  removes the older one"; "also how i pin an article etc across the platform
  … so user frontend and admin too".
- The screens parked in R11 of the Knowledge and News plan: "yes please" to
  redrawing them. Who to follow: "we could have a couple of hundred in here
  and the cards are huge · I think we need to look at variants of the UX";
  three variants drawn; "i love c"; "we need someone on 8c to be clickable and
  open in a new window too"; "i dont remember seeing a UI for the hero boxes
  on 8c and how i maintain them" — drawn (boards 14 and 15).
- "i want the whole background colour when i hover over the panel to
  highlight and i can make it clickable · at the moment the ux feels a bit
  flat" — IH17.
- "can [you change] the learn section to Insights please · and Library to …
  Helpful Content" — IH18.
- Answered the same afternoon: a pin lasts **7 days**, as now; picks are
  **ticked, up to four, and stay until changed**; build **all the Insights
  screens together** first.
- Answered later the same day: the name is **"Helpful content"**, in sentence
  case, the clash with Google's term accepted; new articles go in the **weekly
  digest** (IH19); the **voice assistant** reads them in this build (IH9); the
  plan stays **uncommitted until signed off**.
- Then: "1) yes [Published / Draft] · 2) yes [a person's topic optional] - i
  need to be able to manage the topic list in Add/Edit/Delete · 3) yes [the
  News summaries' model] · All agreed update the doc" — the sign-off, and
  IH20.
- After phase 1: "We need to make sure the plan is server side optimised,
  with indexes and filters, we can't use a lot of client side stuff" — IH21,
  and about 2 days more.

**Status, 2026-10-06:** **signed off** ("All agreed update the doc"), with the
canvas's boards 1–15; boards 16 and 17 (Admin → Topics, IH20) were drawn after
the sign-off, from the standard Content list and editor, for Anthony to look
at before phase 1 builds them ("go", 2026-10-06). **Every phase built on
dev, 2026-10-06, not committed** — below; the full local gate passes,
GitHub's own steps included. Overall: 100% (15.5 of 15.5 days, with IH21's
server-side reading added). Committing and pushing wait for Anthony.

### Built

- **Phase 1, what the screens read (2026-10-06).**
  - The shared topic list (IH20): `convex/topicsSchema.ts`, `convex/topics.ts`
    (readers' list in their language, Admin's list with what uses each topic,
    add, change, delete — clearing the topic off everything that used it — and
    the order); kept by key, so the four first topics kept TRAFFIC and the rest
    and no article was rewritten; `2026-10-06-first-topics` ran on dev with
    their Italian. Knowledge, Helpful content and Who to follow check a topic
    against the list (`checkedTopicKey`); `KNOWLEDGE_TOPICS` is gone. Admin →
    Content → Topics (`admin/content/topics/`) and one chooser for every
    editor and filter (`_components/TopicSelect.tsx`); Insights' side menu
    reads the list (`learnMenu.getLearnMenuCounts`, `LearnShell`).
  - Who to follow (IH14): a topic, and "Our picks" — four at most, refused on
    the server (`newsFollows.applyPick`), ticked on the list or the entry's
    page, greyed with who to untick once four are picked; the list's Where,
    Topic and Show filters and its line naming the picks.
  - Helpful content (IH1–IH3, IH15): `summaryEn` and `meaningEn`, written by
    `libraryArticleWriter.writeForReaders` with the News Collector's model,
    its cost on that agent, straight after a new page is read and on Write
    again; translated (`contentTranslation`, one more owner, only while
    published with a summary); the readers' queries
    (`libraryArticles.listForReaders`, `getForReader`) never read the words.
    The article on dev got its summary from `writeMissingInternal`; its
    Italian is done. Published / Draft in Admin.
  - Dates from structured data (IH10): `fetchPage({ withStructuredData })`,
    `datesFromStructuredData`. The article on dev was read before, so its date
    arrives with its next Read again.
  - Found while building: Admin's content forms dropped a change when another
    landed after a wait (`useContentForm.update` built on a stale form); fixed
    for every editor.
  - Checks: `convex/topics.test.ts`, `convex/newsFollows.test.ts`, new cases in
    `libraryArticles.test.ts` and `utils/libraryPage.test.ts`, the Topics and
    Who to follow Admin screen tests; the Library's look outlines gained "What
    readers see". `npm run check` passes (773 files, 6,519 tests).
- **Phase 2a, reading on the server (IH21, 2026-10-06).**
  - One summary row of counts (`convex/insightsCounts.ts`): Knowledge and
    Helpful content by topic, Helpful content's publications, Who to follow by
    Where, Topic and both, and what uses each topic — rewritten by every write
    that can change one, so a page view reads one row and never counts.
  - Indexes for every list a reader or Admin pages: Helpful content's `shown`
    (published with a summary, kept on the row) by when added, topic and
    publication, and a title search filtered by status, topic and publication;
    Knowledge by status, topic and date; Who to follow A to Z (`nameKey`) by
    Where, Topic and both, its picks, and a name search filtered by both.
  - Readers' lists come a page at a time (`listForReaders`,
    `listPublishedPage`); News's week reads only the week
    (`listPublishedSince`, `listForReadersSince`); Who to follow answers one
    numbered page with its exact total (`listFollowsByPage`, the Sites tables'
    page shape); "More on" and "Keep reading" read a handful
    (`listMoreForReaders`). Admin → Helpful content and Admin → Who to follow
    search, filter and page on the server; the CSV reads its 500 on the server.
  - `2026-10-06-insights-reading` (fills `shown`, `nameKey` and the counts)
    ran on dev.
- **Phase 2, the Insights screens (2026-10-06).**
  - Helpful content (`app/helpful-content/`): the front page set out as
    News's — dateline, the newest leading with "Where they come from" beside
    it, three in columns, Earlier and Show more; a topic or a publication
    alone; an article's page with its facts, the original in a new tab, Ask
    Hakken and "More on <topic>", its topic lit in the side menu.
  - Knowledge (`app/knowledge/`) redrawn the same way, "What it covers"
    beside the lead; an article's page with its facts (reading time from its
    words), Ask Hakken and "Keep reading" mixing Knowledge and Helpful
    content.
  - Who to follow (option C): our picks, the search with Where and Topic, A to
    Z in two columns, numbered pages of 25, 50, 75 or 100 remembered as the
    Sites tables' are; every person opens their own page in a new tab.
  - News's front page and every Insights screen on one set of parts
    (`app/_learn/StoryParts.tsx`); every panel and row one link that lights on
    hover (IH17; `CompactList`'s `rowLink`).
  - Wording in English and Italian; the News and Helpful content Admin look
    outlines renamed (IH18); a look test for each new screen
    (`app/_learn/insightsLook.test.tsx`, outlines in
    `docs/plans/assets/insights-helpful-content/look/`), each matching its
    board's parts. Checked in the running app on dev: Helpful content, an
    article, Knowledge, Who to follow, News, and both Admin lists.
- **Phase 3, one lead story pinned from anywhere (IH11, 2026-10-06).**
  - `convex/leadStory.ts`: one pin across News, Knowledge and Helpful content
    (`leadUntil` and a pin index on each), pinning one clears any other,
    seven days, only what readers can see — a draft is refused, and one that
    goes back to a draft loses its pin. `news.chooseLead` reads the live pin
    first, then the rule; the front page's lead is a News story or a pinned
    article (`getFrontPage`'s `source`), drawn as it leads its own page.
  - A pinned Knowledge or Helpful content article leads its own page
    (`getPinnedForReaders`) and is listed once.
  - Admin (`admin/content/_components/LeadStory.tsx`): the pin on News,
    Knowledge and Helpful content rows and on both article pages, "Lead story
    until …" where it is, and "what leads" (`news.getLeadForAdmin`) above every
    other list and on an article page that is not the pin. Admin → Knowledge
    also searched and paged on the server now (IH21).
  - Tried on dev in the running app: pinned the Helpful content article from
    its row — News led with it, Admin → News named it and linked Helpful
    content — then unpinned it from its page; dev is back to nothing pinned.
- **Phase 4, Ask Hakken and the weekly digest (IH9, IH19, 2026-10-06).**
  - Reference lists and sections made mostly of links are left out when an
    article is cut (`isReferenceSection`, `utils/libraryPage.ts`).
  - Each section is embedded after a save with the embedding model set in
    Admin → AI (`libraryArticleEmbeddings.ts`; a vector index on
    `libraryArticleSections`), fail-open: one left without its meaning is
    still found by its words. `searchHelpfulContent`
    (`libraryArticleSearch.ts`) searches by meaning — the question's
    embedding, made once for the turn — then by words; a section embedded by
    another model is never compared.
  - Typed Ask Hakken (`aiChat.ts`) and the voice assistant
    (`aiVoiceSession.ts`) both read it — the voice only to a signed-in user in
    their own conversation, never on a phone call or to a widget visitor.
  - The weekly digest carries the week's Helpful content readers can see,
    under its own heading, each with Hakken's summary in the reader's language
    and the original (`weeklyDigest.ts`, `outboxTemplates.ts`; the email shell
    gained headed `sections`).
  - `2026-10-06-helpful-content-meaning` ran on dev: the article was cut
    again and its 20 sections embedded. Not tried live in Ask Hakken (it
    would add a conversation to the account); the tests ask by meaning with
    no shared words, by voice, and from a phone call.
- **Phase 5, checks and records (2026-10-06).**
  - The full local gate on Node 24.18.0: `verify:env`, `lint:all` and
    `npm run check` (775 test files, 6,547 tests, none over five seconds,
    the Sites speed test included); GitHub's own steps — `test:coverage`
    (6,546 passed, the speed test skipped under coverage as designed) and
    `coverage:check`, then `test:e2e:smoke` (19 passed) and `npm run build`
    (compiled) — the last two in a copy of the working tree, so Anthony's dev
    server on :3000 kept running; `git diff --check` clean.
  - Found by the gate and fixed: the shared parts file renamed
    `StoryParts.tsx` (component files are PascalCase); Insights' migrations
    moved to `insightsMigrations.ts` (`dataMigrations.ts` had passed its
    1,000-line ceiling); an Italian string that matched the English; the
    sidebar outline's new address.
  - Records: PRODUCT.md §31 (Knowledge, Helpful content, News) and its
    change log; `screen-kit.md` (the list part's row link); dated pointers
    at the top of the Library plan (L7, its name) and the Knowledge and News
    plan (R4, R7, R11).

**Supersedes:** in the [Library plan](content-library-plan.md), L7 ("Readers
never see the copy" — kept for the article's words, replaced for the article
itself), "Not in scope: readers seeing the copy anywhere in Learn", and the
name "Library" (its open question 2). In the
[Knowledge and News plan](knowledge-news-and-digest-plan.md), R4's name
"Learn", R11's parked screens (drawn here; closed when built) and R7's pin
(extended to Knowledge and Helpful content). Each plan gets a dated line
pointing here when this is built.

## The drawings — signed off 2026-10-06

The canvas, "Helpful content in Insights":
https://claude.ai/artifact/S6m6MvAVE86hNeBeTWSoBi — 15 boards in four rows,
drawn from the drawing kit (stylesheet `9f895f5d001e`, look `149d9f4fb243`),
every board passing `npm run check:drawing`; renamed "Helpful content in
Insights" with IH18. Copies:
[`boards/`](../assets/insights-helpful-content/boards/) (the canvas's own
files) and [`pictures/`](../assets/insights-helpful-content/pictures/). They
bind (drawing-guide.md): a change to the look is drawn and approved again
first.

Only the Nacho Mascort article, the traffic article and Edward Sturm are real
on dev; every other article, person and summary is illustrative, and Who to
follow is drawn as if it held 214 people.

| # | Board | Picture |
|---|---|---|
| 1 | Insights → Helpful content | [01](../assets/insights-helpful-content/pictures/01-insights-helpful-content.jpg) |
| 2 | Insights → Helpful content, one article | [02](../assets/insights-helpful-content/pictures/02-insights-helpful-content-article.jpg) |
| 3 | Insights → Helpful content, one topic | [03](../assets/insights-helpful-content/pictures/03-insights-helpful-content-topic.jpg) |
| 4 | Insights → News, a Helpful content article among the stories | [04](../assets/insights-helpful-content/pictures/04-insights-news-helpful-content-story.jpg) |
| 5 | Insights → News, a pinned Helpful content article leading | [05](../assets/insights-helpful-content/pictures/05-insights-news-pinned-lead.jpg) |
| 6 | Insights → Knowledge, redrawn | [06](../assets/insights-helpful-content/pictures/06-insights-knowledge.jpg) |
| 7 | Insights → Knowledge, one article, redrawn | [07](../assets/insights-helpful-content/pictures/07-insights-knowledge-article.jpg) |
| 8 | Insights → Who to follow, redrawn (option C) | [08](../assets/insights-helpful-content/pictures/08-insights-who-to-follow.jpg) |
| 9 | Admin → Helpful content, an article (pinned here) | [09](../assets/insights-helpful-content/pictures/09-admin-helpful-content-article.jpg) |
| 10 | Admin → Helpful content (pinned here) | [10](../assets/insights-helpful-content/pictures/10-admin-helpful-content.jpg) |
| 11 | Admin → Knowledge (pinned elsewhere) | [11](../assets/insights-helpful-content/pictures/11-admin-knowledge.jpg) |
| 12 | Admin → Knowledge, an article (pinned elsewhere) | [12](../assets/insights-helpful-content/pictures/12-admin-knowledge-article.jpg) |
| 13 | Admin → News (pinned elsewhere) | [13](../assets/insights-helpful-content/pictures/13-admin-news.jpg) |
| 14 | Admin → Who to follow: topic and our picks | [14](../assets/insights-helpful-content/pictures/14-admin-who-to-follow.jpg) |
| 15 | Admin → Who to follow, one person (four already picked) | [15](../assets/insights-helpful-content/pictures/15-admin-who-to-follow-person.jpg) |
| 16 | Admin → Topics: the shared list (drawn after the sign-off) | [16](../assets/insights-helpful-content/pictures/16-admin-topics.jpg) |
| 17 | Admin → Topics, one topic (drawn after the sign-off) | [17](../assets/insights-helpful-content/pictures/17-admin-topic.jpg) |

Who to follow's variants A (one table) and B (grouped by where they post) were
drawn and dropped for C.

## The audit — 2026-10-06

What was found before anything was planned, checked in the code and on dev
(the section was still called the Library then):

- **Why readers saw nothing:** by design. L7 and "Not in scope" kept the
  Library for Ask Hakken alone; no reader screen reads `libraryArticles`.
- **Working:** add, Read the page (Firecrawl), edit, delete and the one-copy
  rule; its 26 tests; Ask Hakken's search found the article's "How long does a
  change take…" sections for a core-update question, run on dev; widget
  visitors never get it (L13); committed and on `dev` (2c3b6f4f).
- **Weak:** the published date was missed — the page gives it only in its
  structured data (`datePublished` 2026-10-03), and the reader reads meta tags
  alone; Ask Hakken matches words only ("why did my traffic fall" finds
  nothing); reference lists are cut into sections and take Ask Hakken's room
  ("what is quality at google" returned two of them in three); typed chat
  only, not the voice assistant; the Library plan's status line still said
  "not committed".
- **Seen in passing and fixed the same day:** News's rollout line ran "Today ·
  day 13" 20px into "Done by 8 Oct at the latest" in a 1440px window — below,
  "Done alongside".

## Decided

| # | Decision |
|---|---|
| IH1 | **Readers see a Helpful content article, never its words.** Hakken's summary, what it means for them, its facts, "Read it on <site>" (the original, in a new tab) and "Ask Hakken about this". The article's words stay in Admin and Ask Hakken (L7's reason: other publishers' words). |
| IH2 | **Hakken writes the summary and "What it means for you"** when a page is read (Read the page, Read again) or on **Write again**, in its own words — told never to copy the article's sentences — with the model chosen in Admin → AI for content (the News summaries' — agreed), never a model named in code. The admin may change both; they are translated by the Translator (`contentTranslation.ts`). An article without a summary is not shown to readers. |
| IH3 | **Two states, new words: Published** (readers in Insights, and Ask Hakken) and **Draft** (kept in Admin only) — agreed. The stored value stays `IN_KNOWLEDGE`; only the words change. |
| IH4 | **Insights' side menu gains a Helpful content group** under Knowledge: All articles and each topic with articles, with counts. |
| IH5 | **The Helpful content page is drawn as the News front page** (board 1): a dateline (articles and publications; added in the last 7 days), the lead — the pinned article, else the newest added — with "Where they come from" beside it (publications and their counts, then Who to follow), three in columns, then the rest one to a line and Show more. Listed by when added. |
| IH6 | **A topic lists alone**, one line each with its summary, as News's kinds do (board 3). |
| IH7 | **An article's page** (board 2): the kicker, summary, what it means, its facts (published, words and reading time at 230 words a minute, the original's language, topic), the two links, and "More on <topic>". |
| IH8 | **On the News front page**, a Helpful content article added in the last 7 days takes its place among the stories, as a Knowledge article does, and counts in the week (board 4). |
| IH9 | **Ask Hakken reads Helpful content for every signed-in user**, typed and spoken; never a widget visitor (L13 stands). It searches by meaning as well as by words: each section is embedded with the embedding model set in Admin → AI, through `knowledgeRetrieval.ts` (`embedRetrievalQuery`), into a vector index on `libraryArticleSections`; the closest three sections reach the answer as now (L11, L12). Reference lists and sections made mostly of links are not cut into sections; drafts never are. |
| IH10 | **Dates from the page's structured data** — the `datePublished` and `dateModified` of its Article, BlogPosting, NewsArticle or WebPage — when its meta tags give none. Firecrawl is asked for the page's raw HTML in the same read. |
| IH11 | **One lead story for the News front page**, pinned from Admin → News (stories and Google updates), Knowledge or Helpful content. Pinning one unpins any other, whichever list it is in. A pin lasts **7 days** (R7). A pinned Knowledge or Helpful content article also leads its own page. Where the pin is: "Lead story until …" on its row and page, and "Stop leading with this"; every other list says what leads and where it was pinned (boards 9–13). |
| IH12 | **Knowledge redrawn as the front page** (boards 6, 7): the lead (pinned, else newest), "What it covers" (its topics, then Helpful content), three in columns, Earlier; an article's page keeps its whole text (Hakken's own), its facts, Ask Hakken, and "Keep reading" — the same topic first, Knowledge and Helpful content together. Its admin form does not change. |
| IH13 | **Who to follow is option C** (board 8): the dateline; **Our picks** — up to four, in the order picked, hidden when none; the search box with Where and Topic; everyone A to Z in two close columns, name and reason on one line each; 25 a page with numbered pages (25, 50, 75 or 100). **Clicking anyone opens their page in a new tab.** |
| IH14 | **Admin → Who to follow** (boards 14, 15): each person gains an optional **Topic** (agreed; from the shared list, IH20) and an **Our pick** tick. At most four are picked: the fifth tick is greyed with what to do ("untick one first"), and the server refuses a fifth whatever sends it. The list gains Topic and Our pick columns, Where, Topic and Show (Everyone, Our picks) filters, and a line naming the picks. |
| IH15 | **Admin → Helpful content** (boards 9, 10): "What readers see" (Summary, What it means for you, Write again, the translation state), Published / Draft, a new explanation, and the pin. |
| IH16 | **Words in English and Italian** (`messages/en.json`, `it.json`); the table bar's count gains "people". |
| IH17 | **Every Insights panel is one link that lights when the mouse is over it** — a lead story, a story in columns, a row in a one-line list, a row in a side list (the last three Google updates, publications, topics), a pick and a person — in the theme's hover colour (`hover:bg-hover`), square, between the rules already there: no box, border or rounded ends ("no cards"). The links inside a panel ("Read the original", "Ask Hakken about this", "Follow on X") still work on their own. The one-line list part (`CompactList`) gains a row link to do it, shared rather than copied. Boards 1, 4, 5, 6 and 8 draw one panel lit. |
| IH18 | **Learn is renamed Insights, and the Library Helpful content** — written "Helpful content", in the app's sentence case like "Who to follow" and "Google updates". Everywhere a reader or an admin sees them: the sidebar, the top bar, Insights' side menu, page titles and back rows, the label over each story ("HELPFUL CONTENT"), Admin → Content, notices and explanations. The addresses follow: `/app/helpful-content` (was to be `/app/library`) and `/admin/content/helpful-content` (was `/admin/content/library`, built on dev — no production exists, so nothing outside needs redirecting). The code's names stay — `libraryArticles`, the `learn` wording group, `LearnShell` — as "knowledge articles" kept its code name. The longer label shortens the publication beside it in a narrow column ("Go…"), as drawn. Google's own "helpful content" (its system and its guide) shares the words: accepted. |
| IH21 | **Server-side, through indexes, never a whole list in the browser** (Anthony, after phase 1). Every list that can grow is filtered, searched, sorted and paged on the server, and a screen asks only for the rows it shows: Helpful content and Knowledge for readers (by topic and by publication, newest first, a page at a time with Show more, as News is); Who to follow for readers (A to Z through an index on the name, Where and Topic through indexes, a search index on the name, the picks through their own index of four, numbered pages); Admin → Who to follow and Admin → Helpful content (search, filters and pages on the server; the download a bounded server read). **Counts are kept as they change**, in one summary row rewritten on each write (`insightsCounts`): the side menu's numbers, each topic's uses, Who to follow's totals and the publications — a page view reads one row, never counts. Whether a Helpful content article is shown to readers is stored on it (`shown`) so readers' lists read an index rather than filter. Lists of a handful (topics, Knowledge in Admin) are read whole. |
| IH19 | **The weekly digest includes Helpful content**: the articles added that week, each with Hakken's summary and the link to the original, translated with the rest of the issue, beside the week's News and Knowledge (`convex/weeklyDigestRun.ts`). Never the article's words. |
| IH20 | **Topics are one list Anthony manages** — added, changed and deleted in **Admin → Content → Topics** (boards 16, 17), after Who to follow in the menu. Knowledge, Helpful content and Who to follow share it, and Insights' side menu and filters list it in its order. A topic is written once, in English, and translated for readers. The list shows how many Knowledge articles, Helpful content articles and people use each; a topic opens on its own page (name, order) with Delete in its header. **Delete asks yes or no**, naming how many use it, and what used it is left without a topic until another is chosen (a Knowledge article then lists under All articles only). The four topics today — Traffic, Rankings, AI answers, Backlinks — become its first rows; the fixed list in code (`KNOWLEDGE_TOPICS`, `learnLists.ts`) goes. |

## The parts

### Data

- `libraryArticles`: `summaryEn`, `meaningEn` (optional), `leadUntil`
  (optional) with an index by it, and published-and-added order for readers.
  Translated through `contentTranslation.ts` (one more `TranslatedOwner`).
- `libraryArticleSections`: an embedding per section and the model it was made
  with, and a vector index; the existing text index stays for word search.
- `knowledgeArticles`: `leadUntil` (optional) with an index by it.
- `newsFollows`: `topic` (optional) and `pickedAt` (optional; the order of the
  picks) with an index by it.
- `topics` (new): the English name, its order, created and updated; translated
  through `contentTranslation.ts`. `knowledgeArticles`, `libraryArticles` and
  `newsFollows` keep a topic by its id; a migration turns today's four fixed
  topics into rows and points every article at its row.
- The existing article's summary written once by a migration, and its
  sections embedded; nothing else on dev needs moving.

### Server

- **Reading Helpful content** (`tenantQuery`, any signed-in user): the list, a
  topic's list and one article — rows and summaries only, never the words; the
  side menu's counts (`learnMenu.getLearnMenuCounts`).
- **Writing the summary**: an action after Read the page, Read again and Write
  again; costs in the ledger like the News summaries'.
- **The pin**: `pinLeadStory` and `unpinLeadStory` take what is pinned (a News
  item, a Knowledge article or a Helpful content article) and clear the other
  tables' pins in the same write; `chooseLead` (`convex/news.ts`) reads all
  three; the front page draws a Knowledge or Helpful content lead.
- **Who to follow**: the picks' limit of four on the server; the list for
  readers with picks first.
- **Topics**: add, change, delete (the super admin's, each audited), the counts
  of what uses each, and the readers' list in order; deleting clears the topic
  from what used it in the same write.
- **Ask Hakken**: section embeddings on save and for the existing article;
  the search by meaning and by words together in
  `libraryArticles.searchLibraryInternal`; the voice assistant's knowledge tool
  (`aiVoiceSession.ts`, `search_company_knowledge`) reads Helpful content too.

### Screens

- Insights: `/app/helpful-content`, `/app/helpful-content?topic=…`,
  `/app/helpful-content/[articleId]`; `/app/news` (Helpful content stories and
  leads); `/app/knowledge` and its article page; `/app/who-to-follow`. The
  side menu (`LearnShell`) gains the Helpful content group; the sidebar and top
  bar say Insights (`learnPaths.ts`, `sidebar.learn`).
- Admin: Helpful content (list, article; moved to
  `/admin/content/helpful-content`), Knowledge (list, article), News (list),
  Who to follow (list, person), Topics (list, topic; new at
  `/admin/content/topics`).
- Every screen built from the kit parts its board uses, with a look test whose
  outline is saved under `docs/plans/assets/insights-helpful-content/look/`.

## Limits — every one, named

| Limit | Value | Why |
|---|---|---|
| A summary | 600 characters | Two or three sentences, as News's |
| What it means for you | 400 characters | |
| The Helpful content page | 20 at a time, then Show more | As News's front page |
| Helpful content read for readers | a page at a time, through an index | IH21: never read whole for a reader; the counts kept in one row read the totals |
| Our picks | 4 | As drawn; refused on the server past it |
| Who to follow | 500 people | 214 drawn. Set at 500 when built (was 1,000): the repo's read guard holds new reads under 1,000 rows. Readers get one numbered page, its exact total from the counts; only the rows up to that page are read |
| Who to follow a page | 25, or 50, 75, 100 | As drawn |
| A pin | 7 days | R7, answered 2026-10-06 |
| Embedded sections | 60 an article | The section limit already set |
| Sections reaching an answer | 3, 9,000 characters | L11, unchanged; by meaning first, then by words |
| Found by meaning | the 8 closest, kept at 0.65 or closer | On the embedding's own scale (1 is the same meaning); a section only near the topic is left to the search by words |
| Helpful content read aloud | 3,000 characters | A spoken answer is two sentences |
| More on a topic, Keep reading | 4 | As drawn |
| Helpful content in the weekly digest | 8 a week | As many as the email shows |
| Reading time | 230 words a minute, rounded up | |
| Topics | 30 | Each is a line in Insights' side menu; read whole |
| A topic's name | 40 characters | It sits in a side menu and a filter chip |

## Phases — with days

Built in the order answered: every Insights screen together first.

| # | Phase | Days |
|---|---|---|
| 1 | **What the screens read.** Helpful content's summary and meaning: the writer, Write again, the translation, the existing article's summary; the reader queries and menu counts; the shared topic list — its table, the migration from the four fixed topics, Admin → Topics, and every editor and menu reading it (IH20); Who to follow's topic and picks (data, the server's limit, both admin screens); dates from structured data; Admin → Helpful content's new words and "What readers see" | 4.5 |
| 2a | **Server-side reading (IH21).** The summary row of counts and its upkeep on every write; `shown` and the readers' indexes on Helpful content, Knowledge's topic index, Who to follow's name, kind and topic indexes and search index; the readers' paged queries; Admin → Who to follow and Admin → Helpful content searched, filtered and paged on the server | 2 |
| 2 | **The Insights screens, together.** Helpful content (page, topic, article, the menu group); the News front page with Helpful content stories; Knowledge (page, article); Who to follow (C); every panel a link that lights on hover, and the list part's row link (IH17); the renames and new addresses (IH18) in both languages, with the tests and outlines that name them; a look test each | 4.5 |
| 3 | **One lead story, pinned from anywhere.** The shared pin, Knowledge and Helpful content leads on the front page and their own pages, the pin and "what leads" on News, Knowledge and Helpful content in Admin | 1.5 |
| 4 | **Ask Hakken and the weekly digest.** Section embeddings and the vector index, search by meaning and words, reference lists left out, the voice assistant reading Helpful content; the week's Helpful content in the digest (IH19) | 2 |
| 5 | **Checks and records.** The full local gate with GitHub's own steps (coverage, smoke), both languages, PRODUCT.md, screen-kit.md, the earlier plans' dated lines (L7, R4, R7, R11) | 1 |
| | **Total** | **15.5 days** |

## Done alongside — 2026-10-06

- **The rollout line's words never collide** (`NewsStory.tsx`,
  `useRolloutLabelPlace`): "Today · day N" sits under the dot when there is
  room, moves in from an end it would run into, keeping 12px, and is left out
  when the line is too narrow for all three (the words beneath say the same
  day). Measured in the running app before (20px overlap at 1440px) and in a
  real browser after, from a 300px to a 1,000px line; tests in
  `NewsStory.test.tsx`. Not committed.

## Open questions

1. **Boards 16 and 17** (Admin → Topics), drawn after the sign-off — a look
   before phase 1 builds them.

Answered: the sign-off; the name and its clash with Google's term (IH18); the
weekly digest (IH19); the voice assistant (IH9); Published / Draft (IH3); a
person's topic optional, from a list Anthony manages (IH14, IH20); the
summary's model (IH2); committing once signed off.

## Not in scope

- Readers seeing a Helpful content article's words, anywhere.
- Translating the originals.
- Companies adding their own articles or recommendations.
- Helpful content for visitors on a customer's website widget.
- Reading many addresses at once, or reading articles again on a schedule.
