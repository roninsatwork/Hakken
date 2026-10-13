# Keyword cannibalisation — which page owns each search, decided by its own specialist

**Started 2026-10-12.** Anthony disagreed with what Keyword cannibalisation
told Ronins to do. It kept /web-design-surrey/ and folded the London and
national web design searches into it ("we're talking about folding a global
phrase into a phrase that is in a minor county"). It kept /app-developers-london/
and merged /mobile-app-developers/ into it ("mobile app developers … could be
anywhere in the UK"). The cause: the owner was simply the page with the most
enquiries over 12 months, from every source (5 against 1, and 4 against 0).
Search volume and keyword difficulty played no part.

Agreed the same day, step by step, in his words where he gave them.

## What is agreed

1. **No single number decides the owner** ("location, keyword volume and other
   factors all make this up"). Each search gets its own owner, not one page for
   the whole group. The steps are weighed in this order, each keeping only the
   pages it favours:
   - **Kind:** a question goes to an article, any other search to a page that
     sells.
   - **Place:** a search that names a place goes to that place's page, or to its
     county's page when the town has none ("web design guildford" goes to
     Surrey's). "Near me" goes to the page for a place where the business has an
     office, read from its own Google listings (Ronins: London and Guildford). A
     search that names no place, only the country ("app developers uk"), or a
     place none of the pages is for goes to a page for no one place.
   - **Words:** the page whose own words cover most of the search's.
   - **Google:** the page Google already sends most clicks to, then shows most.
   - **Enquiries:** the page more people from Google's results enquired from.

   How often a search is searched never decides its owner, because a search is
   just as big whichever page owns it. It decides which page owns the most,
   and that page keeps the group.
2. **What to do with each page follows from what it owns.** A page that owns
   searches is kept and made clearly about them. A page that owns none is
   merged into the page owning most of what it is shown for when a third or
   more of its showings are the group's searches, and its redirect carries its
   enquiries over ("I'm happy to merge pages that generate enquiries, that's
   valid in fixing cannibalisation"). An article beside a selling page is kept
   and links to it. Any other page is made clearly different.
3. **A Keyword cannibalisation specialist decides and writes the page** ("I
   think we need build one and that agent needs to create this page"). It is
   routed through the Head of Strategy ("it should be routed to the head of
   strategy then assigned to the cannibalisation agent when appropriate … this
   way we get consistency"):
   - The Head of Strategy's run gathers the groups, and the steps above make a
     first pick for every search.
   - Groups that are new, or whose pages or first picks have changed since last
     week, go to the specialist. An unchanged group keeps last week's decision
     and isn't asked again. The run log says which went.
   - The specialist reads each page's title and the first picks. It keeps or
     changes each pick with a one-sentence reason, says what to do with every
     page, and writes the headline and story.
   - Its write-ups join the other specialists'. The Head of Strategy ranks them
     and the Editor checks every figure, each named by its fact and never typed.
   - What it decided is saved once. The screens, the findings, Page decisions
     and Ask Hakken all read that one copy ("its important the info is
     consistent here and in ask hakken").
   - A group it wasn't reached for keeps the first picks, and the screen says
     so in plain words.
4. **The other agents are told the same rule.** The Search and content
   specialist and the Head of Strategy carry it as a fixed part of their
   instructions, and never decide owners or merges themselves.
5. **The specialist's Instructions page is filled like the others'** ("remember
   to populate the instructions page like the other agents"): its job and brief
   to refine, and fixed read-only parts — the ground rules, how a search's page
   is chosen, and how its answer is shaped.
6. **"Your place" is "Position"** on the cannibalisation group screen ("or
   position"), as the rest of the app says.
7. **The list screen's chart, three bars per group** ("I want the chart to
   look like this", from a picture another agent made): times Google showed
   its pages in grey, on a scale of its own; Google clicks in blue; and the
   clicks with the right page in the top three in orange. The two clicks bars
   share one scale so they compare. All are totals over the 90 days, each
   figure written on its bar, with a line between groups. It replaces the
   one chart of clicks a month chosen earlier that day (option 3). The shared
   bar chart gained two things for it: a series on a scale of its own
   (`scale`) and lines between rows (`divided`).

## Built (2026-10-12, on local dev, not committed)

About 90% overall.

- The rule, with a hand-kept list of places (`convex/utils/placeNames.ts`: the
  UK's counties with their cities and towns, then countries, bigger world
  cities, the American states, and Italy's places in both languages).
  Everyday words such as "reading" are left out. Built in
  `ownerOfSearch`, `settleGroup` and `decisionFor` (`convex/utils/insightCompeting.ts`),
  with each page's enquiries from Google and the business's office towns
  (`convex/insightCompeting.ts`). Page decisions merges each page into, or sets
  it apart from, the page owning most of what it is shown for.
- The specialist (`INSIGHTS_CANNIBALISATION`): its role, brief and fixed parts
  (`convex/utils/insightBriefs.ts`). What it reads, and how its answer is held
  to the guards (`convex/utils/insightCompetingAgent.ts`): a search's page must
  be one Google shows for it, and a page that owns searches of its own is
  never merged. The Head of Strategy's hand-off is in `competingForRun`.
  The way the team asks a model moved to `convex/insightsAsk.ts` so the run
  and the specialist share it.
- The group screen: each search's owner and why, each page's "Should own"
  count and what to do with it (naming the page it merges into or is set
  apart from), the specialist's reasons, who decided and when.
- The list screen's chart as in item 7, checked in Chrome on Ronins' six
  groups against the picture: app developers shown 115,254 times for 12
  clicks, about 343 in the top three.
- Ronins' six groups re-saved with the rule's picks (no AI) so the screens
  could be seen. The specialist's first run replaces them.
- Ask Hakken reads every saved group, not only the five written up, and is
  told to give it as written (`competingForAssistant`, `assistantReads.ts`).
- Tests: the rule on Ronins' own London, Surrey and app searches; the places;
  the specialist's guards and the week-to-week carry-over.

## Proved on ronins.co.uk, 2026-10-12 evening

- The team's setup step made the specialist: "Insights: Keyword
  cannibalisation specialist", its Instructions page filled.
- The first run of the Head of Strategy was cut off at Convex's 10-minute
  limit. The specialist had decided all six groups in a minute, but the Head
  of Strategy's AI call then stalled for five minutes, so nothing was saved.
  The specialist now runs beside the other specialists, not after them.
- The second run finished: 460 seconds, $0.33, 19 findings published, 6
  groups kept, 5 written up. The specialist kept the rule's picks with a
  reason for every page. It changed two owners: "web development agency" to
  /web-development-company/ ("specifically for web development rather than
  design") and "conversational ai agency" to /chatbot-agency/. It merged
  nothing. The group screen says who decided and when.
- Ask Hakken, asked "Which page should own 'mobile app developers', and should
  I merge /mobile-app-developers/ into /app-developers-london/?", answered as
  the screen does: /mobile-app-developers/ owns it, don't merge, keep both for
  their 52 and 103 searches.
- Anthony approved both screens' looks and the three-bar chart; their saved
  outlines are updated.

## Still to do

- The full gate before any commit; committed only when Anthony asks.
- The weekly run's 10-minute ceiling is fixed properly by phase 0 of
  [insights-one-voice-plan.md](insights-one-voice-plan.md).

## Open questions, waiting on Anthony

Questions 1 and 2 were answered "Go" on 2026-10-13 and built that day
(insights-one-voice-plan.md, "Follow-up, built 2026-10-13"): the specialist
decides every search and writes each group's page, the rule's sentences
labelled where it hasn't; Jev picks each search's page through
`seo.angle-page`, switched off until Anthony turns it on. Question 3's
column is drawn and waits on his look.

1. **The specialist alone writes the page** — "we can revisit this later".
   That would mean: it decides every search in a group (up to 200), not only
   the 60 most searched; its words go at the top of every group page; and a
   group it hasn't decided shows only its figures until the next morning's
   run, never the first picks.
2. **Jev picks each search's page.** Hakken's decision model already answers
   "Which of the site's pages answers this search?" (`seo.angle-page`) for the
   Fan-out screen. Using it here would give one answer in both places, with
   the specialist explaining and writing it up. Asked; no answer yet.
3. **Keyword difficulty, and what else the monthly ranking collection holds.**
   It is already paid for ("we pay for it as part of the monthly crawl this is
   free"). Each search's difficulty, DataForSEO's reading of what the searcher
   wants, and the links to the ranking page could be given to the specialist
   and shown as a column. It is held only for searches DataForSEO saw the site
   ranking for: at least 22 of the 200 web design searches and 35 of the 200
   app searches, from a partial read; "web designers" (8,100 a month) isn't
   held. Not built.
4. **"Your place" on the other three Insights tables** (Service,
   Opportunities, Page reviews) means the same Google position. Change those
   to "Position" too, or leave them?
