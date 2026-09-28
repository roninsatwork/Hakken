# Sites — Missing angles: the fan-out searches you have no page for

**Started 2026-09-28. Status: built on dev, not yet reviewed. Every decision
agreed 2026-09-28 (Anthony: "yes do it all"); FA3 dropped. The Admin input
screen is drawn and agreed (FA9); the Sites page and the to-do move were drawn
the same day and are built as drawn, for Anthony to review at the end ("keep
going i will review at the end"). FA8 is built switched off — nothing is bought
until a company chooses a number — and has never been run; §6 says how it was
built and where it differs.** Change a decision here, with a date, before building anything
that disagrees with it. Follow `AGENTS.md`: no code until Anthony agrees, and
draw the screens first (FA7).

Anthony, 2026-09-28, of the idea below: "Yes please that's a good idea."

## Why

An AI assistant does not answer the question it is asked. It breaks it into
several searches — its **fan-out** — reads what those return, and writes from
that. On 15 September 2026 Google wrote about a new way of choosing those
searches (R4T-Diffusion, reported by Roger Montti on 24 September):
each one meant to find real pages, to cover a different angle of the question,
and to stay on it. Whether it is live in AI Mode is not confirmed. Either way
the direction is plain: a question is answered from its angles, and a site
with a clear page for each angle is the site that gets read.

So for each question a company asks, the idea is to show **which of its
angles the site already ranks for, and which it has no page for at all** — a
to-do list of missing angles.

## What Hakken already holds

- **The fan-out searches — DataForSEO's.** Each question is asked of
  ChatGPT, Claude, Gemini and Perplexity through DataForSEO's LLM Responses
  (`/v3/ai_optimization/{platform}/llm_responses`, with web search on), and
  each answer comes back with `fan_out_queries`: the searches that model ran
  to answer it. They are kept per question and engine (`promptFanOutQueries`),
  by day (`promptFanOutDays`), and shown on Sites → AI answers → **Fan-out
  queries**, with their intent and whether the company tracks them. They are
  what the models do when asked through their APIs — not Google Search's own.
- **Not bought yet: Google's AI Overview fan-outs.** DataForSEO also returns
  fan-out searches in its **LLM Mentions** API — for Google AI Overviews and
  ChatGPT — and lets mentions be searched by them (search scope
  `fan_out_queries`, added 15 December 2025; how it obtains Google's is not
  documented). About ten pence a request plus a tenth of a penny a row
  (brands-places-and-ai-citations-plan.md). Its ChatGPT data is United States
  and English only, so for a UK site it means Google AI Overviews. Google's AI
  Mode fan-out is not sold by DataForSEO. See FA8.
- **What the site ranks for**: the ranked-search list from each collection
  (`siteKeywordRanks`), with position and page.
- **The searches it tracks**, checked on Google every collection, within the
  website's everyday check limit (100–10,000 a run, default 1,000).
- **Its pages**, from the site audit's crawl — titles, headings, addresses.
- **Search Console**, once a site is connected: real impressions, clicks and
  position for the searches people typed.
- **A to-do list.** The site's moves (`websiteMoves.ts`) — the Sites list's
  "To do" column — already include **Untracked search**: a buying search the
  engines ran that nobody tracks, three a collection.

## Inside the company, in Admin

Anthony, 2026-09-28: "I also need to be able to see the AI searches and fan-out
queries inside the company … I asked for it inside the company in the admin."
Decided: they are shown there.

**What is there today, one website at a time:** Admin → Companies → the
company → Websites → a website → **Results**, whose switcher holds *Your
searches*, *AI questions*, *AI answers*, *Everything it ranks for* and **What
the AI searched** — Korda's kordatackle.com shows its fan-out searches there
("best carp fishing rods", "budget carp fishing terminal tackle", …) with
intent, engines, times seen and a *Track it* button. Nothing shows them for the
company as a whole: seeing Korda's means opening each of its websites in turn.

**What this plan adds (FA9): an input screen, not results.** Anthony,
2026-09-28, of a first drawing that showed positions and pages in Admin: "this
look more like a results screen than an input screen." Admin is where a
company's inputs are set; what comes back is read on its Sites screens (FA1).
So the company's Websites tab gains **AI questions and searches**, across all
its own websites at once:

- **AI questions** — every question it asks, with its website, the assistants
  it is asked of, how many searches they ran for it, when it was added and
  whether it is asking or paused; add one (for which website, which
  assistants), pause, resume or remove — as each website's *AI questions* does
  today, for the whole company.
- **Google searches** — every search it checks on Google, with its website and
  where it came from (added by hand, or tracked from what the AI searched);
  add one, or stop checking it.
- **Searches the AI ran** — every fan-out search, with the question it came
  from, its website, what the searcher wants, the engines and times seen; track
  one, or tick several and track them together, which adds them to its Google
  searches. Filters: website, question, what they want, tracked or not.

No position, page or missing angle here: those stay on the Sites screens.

**Drawn 2026-09-28 with Korda's real questions and searches, and agreed**
(Anthony: "this is good add this to the plan please"). As drawn:

- **Where**: the fourth entry of the company's Websites tab menu — *Websites*,
  *AI questions and searches*, *Collection schedule*, *Collection runs* — a
  page inside the company section, so its own header with no rule under it.
- **Three views**, each with its count beside its name: *AI questions* (10),
  *Google searches* (0 for Korda today) and *Searches the AI ran* (80).
- **AI questions**: a box to add one — the question, *For which website*, the
  assistants ticked, and how many answers each collection then buys — above a
  table of Question, Website, Asked of, Searches the AI ran (opening that
  question's searches), Added, State (*Asking* or *Paused*) and Pause/Resume
  and Remove.
- **Google searches**: a box to add a search for a website, saying each is
  checked on Google every collection within the everyday check limit, above a
  table of Search, Website, *Where it came from* (*Added here* or *The AI
  searched it*), State and Remove. Empty, it says how to fill it.
- **Searches the AI ran**: a note of how many buying searches the company does
  not track; filters for website, question, what they want and *Not tracked
  yet* (on by default); tick boxes and *Track N selected* — the page's one
  orange action, shown once something is ticked — beside each row's *Track it*.
  A tracked search moves to *Google searches*.
- Admin's fifteen rows a page, with Previous and Next.
- Each website's own *AI questions* and *What the AI searched*, under its
  Results tab, stay as they are.

## What the real data says

Read from dev on 2026-09-28 (both companies' own websites, every search each
ranks for, read in full):

| Site | Questions | Fan-out searches | In the ranked list | Of those: top 3 · 4–10 · 11–100 | Tracked |
|---|---|---|---|---|---|
| kordatackle.com | 10 | 80 | 8 | 3 · 4 · 1 | 0 |
| ronins.co.uk | 1 | 7 | 0 | – | 0 |

Of Korda's 80, 72 came from Gemini, 9 from Claude, 2 from ChatGPT and none
from Perplexity, all through DataForSEO's LLM Responses; the records start on
23 September.

**The finding that shapes this plan:** nine in ten fan-out searches are not in
the site's ranked list — "helicopter rig lead system carp fishing", "affordable
carp fishing rig components", "top rated web design agencies Surrey England".
They are long wordings our supplier has no search volume for, so it never
lists them, whether the site ranks for them or not. **Not in the list is not
the same as no page.** Knowing needs one of three things: a Google check of
the search itself — which tracking it gives (FA2) — Search Console, or a
judgment of which of the site's pages answers it.

Many are also the same angle in other words — "best carp fishing bait" and
"best bait for carp fishing" — which should count once.

## 1. Decisions for Anthony

| # | Question | Recommendation | Days to build: recommended | Days: the other choice | Status |
|---|---|---|---|---|---|
| FA1 | Where it lives | **On the Fan-out queries page that already lists them**: two new columns — *Your position* and *Your page* — a *Missing angles* filter that turns the table into the to-do list, and a filter by question. Nothing else in Sites moves. The other choice: a new page, *Missing angles*, in the AI answers group. | 1 | 1½ — its own page, route and menu entry | Agreed, 2026-09-28 ("yes do it all") |
| FA2 | How a position is known | **Agreed, 2026-09-28: tracking is how a fan-out search is checked on Google.** A position comes from what we hold — the ranked list, Search Console once connected, and the checks of the searches the company tracks; a fan-out search none of them knows reads *Not tracked*. It is tracked from Admin (FA9) or from an *Untracked search* move, and from then on checked every collection like any tracked search: the top 100 results, about half a cent a check as charged so far ($0.0048), within the everyday check limit and the agent's own per-run limit. | ½ | — | Agreed, 2026-09-28 ("this is good add this to the plan please") |
| FA3 | How many are checked | **Dropped, 2026-09-28**: with tracking as the way in (FA2), no separate list of fan-out checks and no new Data limits line — the everyday check limit (100–10,000 a run per company and website, default 1,000) already decides how many tracked searches are checked. | none | — | Dropped |
| FA4 | "Your page" | **Judged by AI from the site's own pages**: each page's address and the searches it ranks for — the pages the site audit read and the pages Google ranks the site with (2026-09-28: not their titles and headings, which the rule "No page text, still" keeps out of storage and out of every model; see the change log); it names the page that answers the angle, *None*, or that the search is not about the business. Judged once per angle and site, and again when the site's pages change. Pence per site. The other choice: only the page a check found ranking — a page that exists but ranks outside the top 100 would then read as *None*. | 1 | ½ | Agreed, 2026-09-28 ("yes do it all") |
| FA5 | One angle, several wordings | **Counted once**: wordings that are the same words in another order, or differ only by small words ("for", "the", "of"), are one angle, shown with its wordings beneath. The other choice: every wording its own row, as the page shows them today. | ½ | none | Agreed, 2026-09-28 ("yes do it all") |
| FA6 | The to-do list | **A missing angle becomes a move** on the site's to-do list — "No page for *helicopter rig lead system*" — a few a collection, the most-seen angles first, never suggested again once dismissed; an angle already suggested as *Untracked search* is one move, not two. The other choice: the filtered table only, with no moves. | 1 | none | Agreed, 2026-09-28 ("yes do it all") |
| FA7 | Draw first | **Yes** — the Admin input screen is drawn and agreed (FA9); still to draw: the Sites Fan-out queries page with its new columns and filter, and a missing angle on the to-do list, as the app draws itself with Korda's real rows, before any code. | ½ | none | Agreed, 2026-09-28 ("yes do it all"); the rest drawn 2026-09-28 and built without waiting, at Anthony's word ("keep going i will review at the end") |
| FA8 | Google's own fan-outs | **Add them, last**: DataForSEO's LLM Mentions for Google AI Overviews, searched by the site's domain and by its questions' topics, the fan-out searches it returns filed beside the others as their own source, *Google AI Overviews*. The nearest thing on sale to what Google itself searches — the subject of the R4T news. About ten pence a request plus a tenth of a penny a row; its row limit per request is read from DataForSEO's documentation and stated here before building. The other choice: the assistants' fan-outs only, as now. | 1½ | none | Agreed, 2026-09-28 ("yes do it all") |
| FA9 | Inside the company, in Admin | **An input screen**: *AI questions and searches* in the company's Websites tab, across all its own websites — its AI questions, its Google searches and the searches the AI ran, to add, pause, remove and track, as drawn (see "Inside the company, in Admin"). Results stay on the Sites screens. | 1½ | none | Agreed, 2026-09-28 ("this is good add this to the plan please") |

**As agreed and recommended: about six days**, and seven and a half with FA8,
after the remaining drawings are agreed. It builds on Search Console for the free positions it
gives, but does not wait for it.

## 2. What each row says

For each fan-out search (or angle, FA5), beside the question it came from:

- **Your position** — where the site stands for it, and from where: *3 (your
  ranked list)*, *7 (tracked: checked on Google, 27 Sept)*, *12.4 (Search
  Console, Google's average)*, *Not in the top 100* for a tracked one Google
  did not show it for, or *Not tracked*. Our checks
  and Google's own average are never set side by side as if the same (the
  lesson of the Competitors chart, data-completeness plan §8.7).
- **Your page** — the page that answers the angle, linked to its Pages
  record; or *None*, which is the missing angle.
- The engines that ran it, how many times, and when last — as today.

The *Missing angles* filter shows the rows with no page, the most-seen first.

## 3. Limits, stated

Nothing here is held back without the page saying so.

- **The Fan-out queries page already reads at most 4,000 fan-out searches per
  site**, shared evenly across its questions and engines, and says "the full
  list is longer" when it stops. At Korda's rate (about 8 per question) that is
  about 500 questions; the plan keeps it and the same wording.
- **Untracked search moves**: three a collection, from up to 2,000 fan-out
  searches, as today.
- **Google checks**: of tracked searches only (FA2), the top 100 results each,
  as many a run as the everyday check limit allows — 100 to 10,000 per company
  and website, default 1,000.

## 4. Phases

| Phase | What | Size |
|---|---|---|
| — | The remaining drawings (FA7): the Sites page and a missing angle on the to-do list | Half a day |
| 1 | Angles (FA5) and positions from the ranked list, tracked searches' checks and Search Console (FA2) | One and a half days |
| 2 | "Your page" (FA4) and the Sites page's columns and filters (FA1) | One and a half days |
| 3 | Missing angles on the to-do list (FA6) | One day |
| 4 | Admin: *AI questions and searches* for the whole company, as drawn (FA9) | One and a half days |
| 5 | Google AI Overview fan-outs from LLM Mentions (FA8) | One and a half days |

Each phase ends with its tests and the full gate. Tracking a search starts
paid checks at the next collection, so on Korda only with Anthony's go, as
every paid run is.

## 5. Risks

- **Fan-out searches change from one answer to the next.** An angle seen once
  may never come back; the most-seen first keeps the list to what recurs.
- **Whose fan-out it is.** The searches held today are the models' own,
  asked through their APIs (Gemini's the most numerous), not Google Search's.
  Google's AI Overviews' come with FA8, by a route DataForSEO does not
  describe; Google's AI Mode fan-out is not sold, and Search Console is the
  only view of it, in its totals.
- **"None" must mean none.** A page that exists but is not in the crawl reads
  as missing; the site audit's own coverage (its "X of Y pages") is shown
  beside the filter.

## 6. FA8 as built (2026-09-28)

Read from DataForSEO's documentation the same day; no call was made to
DataForSEO, not even the free list of places.

- **What is bought.** DataForSEO's LLM Mentions
  (`/v3/ai_optimization/llm_mentions/search/live`, live only) for Google: the
  AI Overviews Google showed for Google searches containing a question's
  topic, each with the searches Google ran for it (`fan_out_queries`).
  Several targets in one request narrow one another, so each topic is its own
  request.
- **A question's topic** is its words without the ones that make it a
  question, in its own order, at most six: "What is the best carp fishing rod
  for beginners?" is *best carp fishing rod beginners*. DataForSEO matches it
  as whole words with other words allowed before, between and after.
- **Price and rows.** $0.10 a request and $0.001 a row (the documented
  example of three rows cost $0.103). Up to 1,000 rows a request; DataForSEO's
  default is 100. The choices offered: 25, 50, 100 or 250 AI Overviews per
  question — about $0.13, $0.15, $0.20 or $0.35 a question.
- **Off by default.** A new line on the Fan-out limits card, *Google AI
  Overviews bought per question*: Off (the platform default), 25, 50, 100 or
  250, set for the company and overridable per website, like the other
  limits. Off buys nothing and shows nothing of Google's.
- **Bought at most once every 30 days, shared.** One purchase per topic,
  country and size in each 30-day period, whichever company's run asks first;
  every other run in the period reuses it. A topic first bought late in a
  period is bought again when the next period begins, and then once a period.
  Bought by country: a Leeds website's topics are bought for the United
  Kingdom.
- **What is kept.** Only the searches — up to 2,000 a purchase, the most-run
  first — each with how many of the AI Overviews ran it, under the topic and
  country (`aiOverviewFanOuts`). The overviews' text is page text and is never
  kept. The searches are judged for what the searcher wants, like every
  fan-out search.
- **Where they show.** In the angles of every question with that topic, on
  websites that buy them, as their own source, *Google AI Overviews*, beside
  the assistants: on the Sites Fan-out queries page and the company's *AI
  questions and searches*. Read up to the same *Searches read per question and
  assistant* limit as each assistant's.
- **Spend** is counted with the AI answers on the run reports, and priced into
  the month's estimate as a monthly purchase once one has been bought.
- **Not built: the search by the site's domain.** Its AI Overviews are those
  citing the site, for Google searches that belong to none of the company's
  questions, and every screen here groups searches by question. Where they
  would show is Anthony's call at review.
- **Not yet known:** whether LLM Mentions holds the United Kingdom for Google
  (it lists 92 places; the list is free but was not called), and how many AI
  Overviews a topic of five or six words finds. The first run, with Anthony's
  go, answers both.

## Change log

- **2026-09-28** — Plan written after Anthony's "Yes please that's a good
  idea", with the counts from dev for kordatackle.com and ronins.co.uk.
- **2026-09-28** — Where the fan-out searches come from, made exact (Anthony:
  "These are fan out queries for data for seo"): DataForSEO's LLM Responses.
  The claim that Google's fan-outs are sold by nobody was wrong — DataForSEO's
  LLM Mentions returns Google AI Overview fan-outs — so FA8 added.
- **2026-09-28** — Inside the company, in Admin (Anthony: "I asked for it
  inside the company in the admin"): what shows there today, one website at a
  time, and FA9 — the company-wide *AI searches* page and the new columns on
  the per-website view.
- **2026-09-28** — FA9 redrawn as an input screen (Anthony: "this look more
  like a results screen than an input screen"): the company's AI questions,
  Google searches and the searches the AI ran, to set and track — results stay
  on the Sites screens.
- **2026-09-28** — FA9 agreed as drawn (Anthony: "this is good add this to the
  plan please"), with its details; tracking agreed as the way a fan-out search
  is checked on Google (FA2), so FA3's separate list and Data limits line
  dropped. About six days, seven and a half with FA8.
- **2026-09-28** — FA1, FA4, FA5, FA6 and FA8 agreed as recommended, after
  each was explained plainly (Anthony: "yes do it all"). Building: the Sites
  page and the to-do move drawn first (FA7); nothing paid runs without
  Anthony's go.
- **2026-09-28** — The business profile the page judge reads (FA4) becomes
  each company's own when [the company-level plan](company-level-website-facts-plan.md)
  lands; until then it reads the website's shared one. Found while building:
  the site audit's crawl keeps no page titles — no page text is kept or sent
  to a model (user-sites-plan.md, "No page text, still") — so the judge reads
  each page's address and the searches it ranks for, as the page-type
  judgment does, rather than titles and headings.
- **2026-09-28** — The Sites page and the to-do move drawn with Korda's real
  rows, then built as drawn at Anthony's word ("keep going i will review at
  the end"). What the drawing added to the decisions: a plural counts as the
  same word as its singular (FA5); the judge may also say a search is *off
  topic* — Korda's fan-out held four searches about camera rod supports — and
  an off-topic search is never a missing angle (FA4); a missing angle that is
  also an untracked buying search shows as the *Missed search* move until it
  is tracked, then may come back as a missing angle (FA6); *Page written*
  marks the move done, *Dismiss* means it never returns.
- **2026-09-28** — FA8 built switched off (§6): Google's AI Overviews bought
  per question topic, at most once every 30 days and shared; a new Fan-out
  limit, *Google AI Overviews bought per question*, Off by default. The search
  by the site's domain is not built, for Anthony's call at review. Nothing
  bought.
