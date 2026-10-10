# Discovery — detail screens, rows that open, and What Hakken sees

**Started 2026-10-10. Status: drawn and approved 2026-10-10 (Anthony: "im
happy with these screens"); building since 2026-10-10 ("Ok can start this
please").** Follow
`AGENTS.md`, the [drawing guide](../../developer/drawing-guide.md) and the
[core data normalisation plan](core-data-normalisation-plan.md)'s rules (§3
there): nothing here is bought, nothing is stored twice, and every screen is
held to a reading budget.

The drawings are on the canvas "Discovery — local, reviews, AI apps and
mentions" (https://claude.ai/code/artifact/6d77e749-bd6f-46fb-b0ee-97d63a5ea155),
on its pages **Detail screens** and **What Hakken sees, every page**, and
saved in [`docs/plans/assets/discovery-detail-screens/`](../assets/discovery-detail-screens/)
(28 boards). The drawings are the look; this plan is what stands behind them.

What Anthony said, 2026-10-10, looking at the built Websites AI cites page:

- "why do none of the tables click through — I am on the new screen and this
  screen shows the high level numbers but never the detail" and "this is
  just one example".
- On the first drawings, six tables to a screen: "these are not good ux — its
  table after table after table making it TLDR".
- On the redraw: "yes very much so" and "I love the what hakken sees
  addition".
- "do we need to add the what hakken sees across the entire discovery
  section — i think its a good idea — so its not just these screens" and
  "im happy with these screens and happy for you to make the documented plan
  in the repo if you can add this to all the other screens please".

**In plain words.** Every row in Discovery opens something — a new detail
screen, a screen that already exists, or the page itself — and every
Discovery screen opens with a short box, **What Hakken sees**, that says what
the page means for the business and what to do first, the way an SEO expert
would. Hakken acts as the agency ("software that acts like a service firm");
the box is where it says so on every page.

## 1. Decisions (agreed 2026-10-10)

| # | Decision |
|---|---|
| DS1 | **Every row opens something.** A row in a Discovery table opens a detail screen, an existing screen, or (for an address on another website) that page in a new tab. Never a pop-up (`sites-no-modals`): each opens as its own page with a back link to where it came from. |
| DS2 | **Four new detail screens**: one business, one website, one question in Google's AI answers, one page. Drawn as `DetailBusiness`, `DetailWebsite`, `DetailQuestion` and `DetailPage`. |
| DS3 | **A detail screen leads with the verdict, never a stack of tables**: the header, What Hakken sees, one row of four figures with the business's own number beside each, then **one** table with a switch above it choosing what it lists. |
| DS4 | **What Hakken sees on every Discovery screen**: every page in a website's menu, every record and detail screen, the Websites list, and Keyword research (§6). The 19 drawn list pages and five older pages show where it sits; the rest follow the same place and shape. |
| DS5 | **The box is written by fixed rules over what the page already reads** — no AI model, no purchase, no extra reads beyond the page's budget. Its words live in `messages/<language>.json` as codes with numbers filled in, as Your assets' "Fix first" does today. |
| DS6 | **Older tables**: New and lost links and Where links come from open All backlinks filtered to the week or the group; Suggested competitors opens One website. All backlinks gains those filters (§5). |
| DS7 | **Referring IPs stays as it is.** Which links come from which server is not kept — the server list holds counts only (`siteReferringIpParts`) — so its rows cannot open their links without buying more. Corrected on the canvas the same day. |
| DS8 | **One business links to Competitors' existing rival screen** (`competitors/rival`) for Google rankings rather than repeating it. |
| DS9 | **Only stored data**: every figure on these screens is already held; nothing new is bought, and no new table is added (§7). |

## 2. The approved look — binding

A change to any of this is drawn and approved again first (`lock-approved-looks`).

### What Hakken sees (a new screen-kit part: `HakkenSees`)

New to the screen kit, named to Anthony 2026-10-10: every Discovery page
carries it, so it is one shared part, never drawn page by page. It is the
kit's `SettingsCard` with fixed contents:

- Title **What Hakken sees** — the card's own title style (13px, semibold,
  uppercase, 0.12em tracking, `text-muted`).
- **Two or three sentences**, 60 words at most: 13px, line height 1.6,
  `text-secondary`, prose width (`max-w-[75ch]`).
- **Do first**: a 12px `text-muted` label, then one to three steps, numbered,
  each one sentence in 13px `text-foreground` followed by the kit's quiet
  link onward (`link-arrow`: 12px, `text-secondary`, arrow up-right) to where
  the step is done.
- It sits **directly under the page's title** — under `PageHeader`, or
  `DetailHeader` on a record — above everything else, on every Discovery
  screen. One per page. No colour of its own, no icon, no pill.

When a page has nothing to fix, the box says so in one sentence and shows no
steps. When a page has no data yet, it says what is missing and what fills it
(for example, "Web mentions is off for this company").

### A detail screen

1. `DetailHeader`: back link to the screen it was opened from; the brand-colour
   icon; the name; one line saying what it is; status labels below
   (`StatusLabel`, `TagLabel` — never pills). A quiet "Visit" button to the
   real website. At most one primary action (One question's "Track this
   question", super admins only — D19 of the Discovery plan).
2. `HakkenSees`.
3. `FigureRow` of four `Figure`s, the first emphasised; each figure's line
   gives the business's own number ("121 a month · you 64").
4. One row holding a `SegmentedChoice` (compact) and the search box; under it
   **one** `DataTable` at a time — the standard Sites table: table bar with
   count and download, headings that sort over the whole list, numbered pages
   with 25/50/75/100 rows (`sites-table-pages-plan.md`). Each choice's label
   carries its count ("Google's AI · 38").

### Rows

A row's first cell is a link (`RecordLinkCell` for a name or question,
`PageLinkCell` for an address) and the whole row opens the same place
(`onRowClick`). Page addresses on other websites open in a new tab
(`ExternalUrlCell`).

## 3. The four detail screens

Each reads only stored records, within its own reading budget (§7). A part
with no data for this business is left out of the switch rather than shown
empty.

### One business — `/app/sites/[siteId]/business/[key]`

`key` is the business's website host when it has one, else its Google place
number (cid). Two records are the same business only when their hosts match,
or their place numbers match — never by name alone; a ChatGPT card without a
host joins a Google profile only on an exact, case-blind name match in the
same town.

Opened from: Brand radar's You against rivals; Web mentions' Against rivals;
Reviews' Against rivals and How the stars split; Businesses recommended and an
answer's Businesses it showed; Local market; Business profile's People also
look at; One search on the map's Everyone on the map; Your listings' Rivals
you watch; Rival activity's rival names.

| Part | From |
|---|---|
| Header: name, kind, town and distance, website, "Rival you watch" | `listings`, `holdListings`, the company's rivals |
| Figures: Named by Google's AI (a month, you), Recommended by ChatGPT (of your answers, you), Google rating (reviews, you), Pages naming it (30 days, you) | `brandRadarMonths`, `aiAnswerExtras`, `listings`/`listingWeeks`, `webMentionParts` |
| Switch — Google's AI: Question, Asked a month, It came, You came, Its page quoted | `brandRadarQuestionParts` (watched rivals' websites only) |
| Switch — ChatGPT: Question, It came, You came, Asked — opens the answer | `aiAnswerExtras` (each question's newest four, as Businesses recommended reads) |
| Switch — Google Maps: Search, Volume, It came, You came — opens One search on the map | `mapPositionWeeks`, `mapChecks` |
| Switch — Pages naming it: Date, Page, Kind, Tone, Link | `webMentionParts` (watched rivals only) |
| Switch — Posts: Date, What, Detail | `listingActivityParts` |
| Link: its Google rankings beside yours | `competitors/rival` (DS8) |

Its reviews are counted, never quoted: Hakken keeps no rival's review words
(D4 of the Discovery plan).

### One website — `/app/sites/[siteId]/website/[host]`

Opened from: Websites AI cites; Where to get listed; Your assets' directory
rows; an answer's Sources cited; Suggested competitors.

| Part | From |
|---|---|
| Header: host, kind (directory, news, forum…), whether rivals and you are on it | `siteKindOf`, `linkGapPairs`, `webMentionParts` |
| Figures: Quoted beside your rivals (you), Rivals linked from it, Questions it answers (asks a month), Its strength | `brandRadarQuestionParts` (yours and your rivals'), `linkGapPairs` |
| Switch — Questions: Question, Asked a month, Named beside it, Its page quoted — opens One question | `brandRadarQuestionParts` |
| Switch — Its pages: Page, Times quoted, Beside you, Beside rivals | `brandRadarQuestionParts` |
| Switch — Who is on it: Business, On it, Quoted beside them — opens One business | `linkGapPairs`, `brandRadarQuestionParts`, `webMentionParts` |

**Words, against the drawing.** Hakken knows whether a website links to a
business and whether it is quoted beside it, not whether the business holds a
listing there. Where the drawing says "Listed", the build says what is known:
"Links to them", "Names you", "Not linked to you". The layout is unchanged.

### One question — `/app/sites/[siteId]/radar/question/[key]`

A question from Brand radar — Google's AI answers. Opened from: Brand radar's
questions; the question rows on One business, One website and One page.

| Part | From |
|---|---|
| Header: the question, asks a month, the day read, "Names you" or "Does not name you"; "Track this question" for super admins | `brandRadarQuestionParts` |
| Figures: Asked a month, Businesses it names (first), Pages it quotes (yours among them), Rivals' pages quoted | the same, across your reading and your rivals' |
| Switch — Businesses named: Place, Business, Their page quoted — opens One business | the same |
| Switch — Pages quoted: Page, Website, Kind — the website opens One website | the same |

Brand radar reads by website, so the businesses named are you and the rivals
you watch; any other business shows only through its quoted pages.

### One page — `/app/sites/[siteId]/ai/page?url=…`

Opened from: Read but not cited; Websites AI cites' Pages AI cites most; an
answer's Pages it read; AI Overview gaps' quoted page.

| Part | From |
|---|---|
| Header: the address, whose it is, "Read N times, cited M" | `aiAnswerExtras` |
| Figures: Read by ChatGPT (cited), How often it wins (the page cited most in its place), Cited instead, Quoted by Google's AI | `aiAnswerExtras`, the answers' sources, `brandRadarQuestionParts` |
| Switch — Answers that read it: Question, Asked, In the answer — opens the answer | `aiAnswerExtras` |
| Switch — Cited instead: Page, Whose, Times cited instead — the website opens One website | the same answers' cited sources |
| Switch — Google's AI: Question, Asked a month, You came — opens One question | `brandRadarQuestionParts` |

## 4. What each row opens — every Discovery table

New screens are in bold. "Its record" is the record screen the row already
opens today.

| Screen | Table | A row opens |
|---|---|---|
| Brand radar | You against rivals | **One business** |
| Brand radar | Questions where AI names you or a rival | **One question** |
| Websites AI cites | Websites | **One website** |
| Websites AI cites | Pages AI cites most | **One page** |
| AI Overview gaps | Searches | the search's record (today); "It quotes" → **One website**; "Your page" → the page's record (today) |
| Full answers → one answer | Businesses it showed / Pages it read / Sources cited / Searches it ran | **One business** / **One page** / **One website** / the search's record |
| Businesses recommended | Businesses | **One business** |
| Read but not cited | Pages | **One page** |
| AI demand | Searches | the search's record (today) |
| Business profile | What your profile shows | stays: each row is the whole check |
| Business profile | People also look at | **One business** |
| Business profile | What reviewers talk about | Your reviews, on that topic |
| Every office | Offices / searches | the office's profile / One search on the map (today) |
| Map rankings | Searches | One search on the map (today) |
| One search on the map | Everyone on the map | **One business** |
| Your listings | Yours | Business profile (a Google profile) or Your reviews (a review site) |
| Your listings | Is one of these yours? | stays: its row actions are the job |
| Your listings | Rivals you watch | **One business** |
| Local market | Businesses | **One business** |
| Rival activity | Activity / questions | **One business** |
| Your reviews | Reviews | stays: each row is the whole review |
| What customers say | Topics | Your reviews, on that topic (today) |
| What customers say | How the stars split | **One business** |
| Reviews against rivals | Businesses | **One business** |
| Web mentions | Mentions | the page itself, in a new tab |
| Web mentions against rivals | Businesses | **One business** |
| Where to get listed | Websites | **One website** |
| Your assets | Assets | the screen holding each asset's detail: website → Overview; a page → its record; a Google profile → Business profile; a review site → Your reviews; ChatGPT answers → Full answers; AI Overviews → AI Overview gaps; a directory → **One website**; the press line → Web mentions |
| New and lost links | Weeks | All backlinks, that week's new or lost links (§5) |
| Where links come from | Groups | All backlinks, that group (§5) |
| Referring IPs | Servers | stays as it is (DS7) |
| Link quality | Checks | stays: each row is one check's whole reading |
| New and lost keywords | Checks | stays: each row is one check's whole reading (its moves table opens each search, as today) |
| Suggested competitors | Websites | **One website** |

Every other Discovery table already opens its record (keywords, pages,
searches, linking websites, anchors, audit problems, search features,
competitors) and is unchanged. A guard (§8) fails any Discovery table whose
rows open nothing.

## 5. All backlinks gains two filters

- **A week**, from New and lost links: links first seen in that week (new) or
  lost in it (`status` LOST, `lastSeen` in the week). The links list holds as
  many links as its limit keeps, so the screen says "N of M kept" when the
  week's count is higher than the list holds.
- **A group**, from Where links come from: by country (`country`), domain
  ending (from `domainFrom`), kind of site (`platformTypes`), kind of link
  (`itemType`) or link attribute (`attributes`) — each already on every
  stored link (`siteBacklinks`).
- Each shows as a chosen filter chip with a remove button, beside the
  existing Which links, Status and Link type.
- **Speed.** All backlinks pages through `siteBacklinks`' search index, which
  filters by website, list, status and follow only. Before building, measure
  both ways on Korda's largest list: a filter field added to the index
  (`seoStorageMeasure` for its cost) against a bounded read of the list. The
  cheaper wins, and the choice is written here. No new table.

## 6. What Hakken sees — every Discovery screen

Each screen's own query returns its box: `{ says: Phrase[], steps: Step[] }`,
codes with numbers, worked out from the rows the page already reads, so the
box costs no extra reads. The words are the screen's, in each language. The
rules below are what each box looks at, the most important first; the
numbers in the drawings are examples.

**Rules for every box.**

- Every number comes from the page's own data, for the dates chosen.
- Lead with the biggest loss, gap or chance; then the reason; then what to do.
- Name the business, its rivals and its pages; never the supplier
  ("Google's AI answers", "across the web").
- Two or three sentences, sixty words at most; one to three steps.
- Nothing wrong: one sentence ("Nothing here needs you this week"), no steps.
- No data yet: what is missing and what fills it.
- A step links to where it is done — a detail screen, another page, or the
  page's own filtered list.

### Site

| Screen | What Hakken sees looks at | Do first points to |
|---|---|---|
| Overview | The headline move for the dates chosen (visits, searches on page one), its biggest cause (a search or page that moved most) | that search or page's record |
| Your assets | Working and losing counts; the biggest leak by stage | the leaking asset's screen |
| Your pages | Pages not in the sitemap, not reached, or not shown by Google | the filtered list |
| Site audit | Worst problem by pages affected; change since the last crawl | the problem's record |
| Site audit → one problem | Pages affected, the most-visited of them | that page's record |

### Brand radar

| Screen | Looks at | Do first |
|---|---|---|
| Overview | Your share of voice and place; the biggest question you are missing | One question; One website |
| Websites AI cites | Websites quoted; how many rivals are on that you are not; the biggest | One website; Where to get listed |
| AI Overview gaps | Searches with an overview; quoted on; top-ten gaps and their volume | the biggest gap's search |
| One question | Who it names first; whether your page is quoted; your nearest page's Google place | your page; Track (super admins) |

### AI answers

| Screen | Looks at | Do first |
|---|---|---|
| Mentions | Questions where no assistant names you; the assistant naming you least | the question's answers |
| Share of voice | Your share against the leader; the change | One business (the leader) |
| Full answers | Answers naming you, of all; the newest that dropped you | that answer |
| One answer | Where you came, who came first and why (rating, reviews, pages cited) | One business; One page |
| Sources cited | Your pages cited most and least; a page cited less than before | the page's record |
| Fan-out queries | The most repeated searches you do not track; ones you rank for | tick to track |
| Businesses recommended | Answers showing businesses; showing you; who is shown most | One business; Your reviews |
| Read but not cited | Your pages' win rate against rivals'; the page read most and cited least | One page; One website |
| One page | Read, cited, and what was cited in its place | its first lines; One website |
| AI demand | Asked of AI against Google, the year's change; the most asked; the rising ones | the question; Your pages |

### Google results

| Screen | Looks at | Do first |
|---|---|---|
| Your searches | Searches up and down since the last check; the biggest fall | the search's record |
| Tracked fan-out queries | Where you rank for them; ones on page two | the search's record |
| Wins and losses | Biggest win and loss; what moved (page, rival) | the search's record |
| Who ranks above you | The website above you most often | One website |
| Search features | Features on your searches you are not in (map, answer box, overview) | the feature's record |
| Questions people ask | Questions on your searches without a page of yours | Your pages |
| One search | Its move, who is above you, the page Google shows | One website; the page |

### Local

| Screen | Looks at | Do first |
|---|---|---|
| Business profile | Rating against rivals; map box share; the profile checks failing | the check; Map rankings |
| Every office | Map box per office; the office furthest behind | that office |
| Map rankings | Searches in the map box; below it; who tops the map most | One search on the map; One business |
| One search on the map | Your place; who is first and what they have that you lack (reviews, photos, category) | One business |
| Local market | Businesses of your kind; how many out-review you; ones in your map box you do not watch | watch them |
| Rival activity | Rivals' posts against yours; offers running; questions waiting on your profile | the question; Business profile |
| Your listings | Listings linked; look-alikes to mark; reviews not counted until linked | the look-alikes |

### Reviews

| Screen | Looks at | Do first |
|---|---|---|
| Your reviews | Unanswered and the oldest wait; drafts ready; days to answer against rivals | waiting reviews |
| What customers say | Most praised, most complained about; what rivals are praised for | the topic's reviews |
| Against rivals | Your place; the gap to the leader; their answering speed | One business; Your reviews |

### Organic search

| Screen | Looks at | Do first |
|---|---|---|
| Keywords | Searches bringing most visits; ones just off page one | the search's record |
| Top pages | Pages bringing most visits; one that fell | the page's record |
| Position bands | Page-one searches over time; the band that moved | the moved searches |
| New and lost keywords | Gained against lost; the biggest loss | the search's record |
| Site structure | The folder bringing most and the one falling | the folder's pages |
| One search (record) | Its position history, the page, the rival above | the page; One website |
| One page (record) | Its searches, links and problems; the biggest fix | the problem; its searches |

### Paid search

| Screen | Looks at | Do first |
|---|---|---|
| Summary | Whether it advertises, on how many searches, the cost of those visits | Paid keywords |
| Paid keywords | The searches costing most; ones it also ranks for without paying | the search's record |

### Competitors

| Screen | Looks at | Do first |
|---|---|---|
| Side by side | Where you lead and trail each rival; the rival gaining fastest | that rival's screen |
| One rival | Searches it beats you on, by volume | Content gap |
| Organic competitors | Websites sharing most searches that you do not watch | watch them |
| Content gap | The biggest searches rivals rank for and you do not | the search's record |
| Market map | Your place by searches and visits; who is just above | One website |
| Suggested competitors | Why each is suggested; the strongest | One website |

### Backlinks

| Screen | Looks at | Do first |
|---|---|---|
| Summary | Linking websites over time; the change | New and lost links |
| Compared with rivals | Linking websites against rivals; the gap to the leader | Where to get listed |
| Link quality | Spam score; links to broken pages | Broken backlinks |
| Where links come from | The largest groups; a group that looks like spam | All backlinks, that group |
| All backlinks | What the filtered links have in common (spam, strength) | the weakest linking websites |
| Referring domains | The strongest, the newest, the lost | the domain's record |
| Anchors | Words used most; brand against exact-match words | the anchor's record |
| Referring IPs | Networks hosting many linking websites | Referring domains |
| Broken backlinks | Links landing on broken pages, the strongest first | the page to put back |
| New and lost links | Gained against lost; the week that moved | All backlinks, that week |
| One linking website / One anchor (records) | Its links here and their strength | its links |

### Web mentions

| Screen | Looks at | Do first |
|---|---|---|
| All mentions | New pages naming you; tone; pages without a link | ask for a link; reply |
| Against rivals | Your share and place; who leads and where | Where to get listed |
| Where to get listed | Places rivals are and you are not; the strongest | One website |

### Detail screens, the Websites list and Keyword research

| Screen | Looks at | Do first |
|---|---|---|
| One business | Where it beats you (AI, ChatGPT, map, reviews, mentions) and why | the question, the website, Your reviews |
| One website | Quoted beside rivals against you; rivals it links to | visit it |
| Websites (the list) | The website that moved most since the last check, of those held | that website |
| Keyword research → Overview | Volume, difficulty, and what it means for the website | its ideas; its results |
| Keyword research → Ideas, Results, What the AI says | The best idea by volume and difficulty; who Google and the AI name | the idea; One website |
| Keyword research → a list | The list's best searches not yet ranked for | the search |
| Keyword research → Start from a competitor | The biggest searches it has and you do not | the search |

Forms (a new list, renaming a list) carry no box.

## 7. Storage, spend and speed

- **Nothing is bought.** Every screen reads what collections already keep.
- **No new table.** The detail screens read `listings`, `listingWeeks`,
  `mapPositionWeeks`, `mapChecks`, `listingActivityParts`, `aiAnswerExtras`,
  `brandRadarQuestionParts`, `brandRadarMonths`, `webMentionParts`,
  `linkGapPairs` and `siteBacklinks` — each one record per website or
  listing, read by its index.
- **The box adds no reads**: it is worked out in each page's own query from
  rows it already has. A page whose box needs one figure it does not read
  takes the smallest record that holds it, and its budget says so.
- **Budgets.** Each detail screen gets a reading budget in
  `code-ratchets.json` (`detailReadKiB`), measured at five times a large
  client in a load test (`detailLoad.test.ts`), as the Discovery plan did.
- **All backlinks' filters**: measured first (§5).

## 8. Tests and guards

- **Look tests**: each detail screen matches its drawing
  (`detailLook.test.tsx`); the approved outlines of the Discovery screens gain
  their "What Hakken sees" line in the same change.
- **Rule tests**: each screen's box worked out from fixed rows gives the
  expected codes and numbers (`hakkenSees.test.ts`).
- **A guard that every Discovery screen carries the box**
  (`src/hakken-sees-drift.test.ts`), with forms listed by name.
- **A guard that every Discovery table's rows open something**: a
  `DataTable` under `app/sites` without `onRowClick` or a linked first cell
  fails, with the stay-as-it-is tables (§4) listed by name.
- **Translation parity**: every code in English and Italian.

## 9. The work, in order

| Step | What | Days |
|---|---|---|
| 1 | `HakkenSees` part in the screen kit and the drawing kit (`parts.tsx`); its two guards | ½ |
| 2 | One website and One question (the two Brand radar reads), with rows from Websites AI cites, Where to get listed, Brand radar, Suggested competitors | 2 |
| 3 | One page, with rows from Read but not cited, Pages AI cites most and the answer screen | 1 |
| 4 | One business, with every row that opens it (§4) | 2½ |
| 5 | The remaining row links (§4) and All backlinks' two filters (§5) | 1½ |
| 6 | What Hakken sees on every Discovery screen, section by section in §6's order | 5 |
| 7 | Checked in Chrome on Ronins and Korda; budgets and look tests green; the plan's record written | ½ |

About thirteen days. Progress is reported per step as a percentage.

## 10. Risks

- **Joining a business across sources.** Google, ChatGPT's cards and Brand
  radar name businesses differently. Joining by host or place number only
  (§3) leaves some unjoined rather than joins them wrongly.
- **A box that reads wrong.** Rules can say something odd on unusual data
  (a first check, a tiny site). Each rule has a "not enough yet" sentence,
  and each is tested on Ronins' and Korda's real data before it ships.
- **Sixty boxes of words.** Every code is written once in English and
  translated; the parity guard holds Italian to it.
- **The box against a filtered table.** The box speaks of the whole page for
  the dates chosen, never the filtered rows; its words say so where it
  matters.

## 11. What changes on screen

- Four new screens: One business, One website, One question, One page —
  opened from rows, never from the menu. **No new menu items.**
- A What Hakken sees box under the title of every Discovery screen.
- Rows that opened nothing now open something (§4).
- All backlinks gains a week filter and a group filter.
- Nothing is removed.

## Progress

| Step | State |
|---|---|
| Drawings | **Approved 2026-10-10**: four detail screens, What Hakken sees on 19 list pages, the five older-table boards (`docs/plans/assets/discovery-detail-screens/`) |
| 1. `HakkenSees` and its guards | **Done 2026-10-10**: the kit part (`HakkenSees`, in the drawing kit too), the codes it is sent in (`convex/utils/hakkenSees.ts`), Sites' `SiteSees`, and two guards — every Discovery screen carries the box (`src/hakken-sees-drift.test.ts`) and every Discovery table's rows open something (`src/discovery-rows-drift.test.ts`), each with a list of screens still to do that may only shrink |
| 2. One website and One question | **Done 2026-10-10**: `convex/siteRadarDetails.ts` (`websiteDetail`, `questionDetail`), the two screens (`radar/sources/website`, `radar/question`) matching their drawings (`detailLook.test.tsx`, five outlines in `look/`), read within the Brand radar budgets at their largest (`radarLoad.test.ts`: `one website`, `one question`, 1,136 KiB), rows opening them from Websites AI cites, Brand radar, Where to get listed, Suggested competitors and AI Overview gaps. Checked in Chrome on Ronins: youtube.com, clutch.co and "software development co". |
| 3. One page | **Done 2026-10-10**: `convex/siteAiPageDetail.ts` (`aiPageDetail`), the screen (`ai/read/page`) matching its drawing (three outlines), read within the AI apps budget (`aiAppsLoad.test.ts`: `one page`, 1,488 KiB — it also reads Brand radar, measured in `radarLoad.test.ts`), rows opening it from Read but not cited, Websites AI cites' pages, One website's pages and the answer screen's pages read; the answer screen's businesses, sources and searches open One business, One website and their searches. Checked in Chrome on Ronins (goodfirms.co's Surrey list). |
| 4–7 | Started 2026-10-10 (Anthony: "Ok can start this please") |

## Change log

- 2026-10-10 — Step 3 built. Changes made while building, each smaller than a decision: a page is one page whatever its tracking code (its address without the query), and Read but not cited now counts it once an answer, as One page does — one answer reading two addresses of one page had counted twice; "How often it wins" beside the page cited most in its place, from the same answers; a card with no website on the answer screen opens nothing, as nothing is known of it; the answer screen's tick boxes stay ticks inside clickable rows.
- 2026-10-10 — Step 2 built. Changes made while building, each smaller than a decision: One website counts every page quoted, by its exact address, as Websites AI cites does, so the two screens give the same numbers (youtube.com 526); its first step depends on the kind of website — be listed on a directory or review site, put a video on a video site, answer on a forum, be written about on news or other websites; its figure titles are "Rivals it links to" and "Questions it answers"; a rival's row on Websites AI cites opens One business rather than One website; Brand radar's You against rivals opens One business, and your own row Business profile; addresses are cut to one line, whole on hover; a page elsewhere opened from a clickable row no longer also opens the row. The shared parts gained: `DataTable`'s `views` slot (the switch, first on the search row), `VisitLink` (Business profile's "Open on Google" is it too), `convex/utils/urlParts.ts` (three copies of the address helpers became one) and `linkGapOf` (Where to get listed and One website share it).
- 2026-10-10 — Written. The detail screens were drawn twice: six tables to a
  screen first ("table after table … TLDR"), then verdict first with one
  table behind a switch, approved. What Hakken sees approved and extended to
  every Discovery screen. Referring IPs' rows stay as they are: which links
  come from which server is not stored (DS7). The cost question's advice
  reads "put plain prices at the top of /pricing/", as the approved boards
  show a /pricing/ page 7th on Google.
