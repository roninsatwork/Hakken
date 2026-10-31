# What Hakken sees on every page: the eye and its panel, rolled out — planned 2026-10-31

**Status: planned 2026-10-31 at Anthony's word; nothing built; waits for his "start".** Anthony: "our next plan is
extend the eye and side bar to every page in Microsoft Clarity, Google Analytics, Bing Webmaster, Search Console and
Visibility and Insights, we need to roll them out to everything so we can test and refine."

Read first: `docs/developer/what-hakken-sees-guide.md` (the eight rounds on Conversions; partly out of date, see
phase 6), `sees-findings-in-code-plan-2026-10-31.md` (code finds, Jev judges, a model writes) and
`sees-side-panel-plan-2026-10-31.md` (the panel and its chat).

## Intent

On every page of the six sections, pressing the eye opens the panel with three things about that page: what the
figures show (found by code), what it means and what to do first (written by the right specialist), and a chat
about the page — so Anthony can press it everywhere, test it and refine it.

## Where it stands today (audit, 2026-10-31)

162 pages. On Google Analytics' Conversions page, and a conversion's own screen, the panel is complete: code's
findings, the team's written words, and the chat. Everywhere else it is a first draft:

| Section | Pages | Eye today | Full panel | No eye at all |
|---|---|---|---|---|
| Google Analytics | 20 | 15, rule words | 2 | 3 (all are redirects) |
| Search Console | 28 | 25, rule words | 0 | 3 (connection; a keyword's and a page's countries) |
| Bing Webmaster | 9 | 8, words written in the page | 0 | 1 (connection) |
| Clarity | 7 | 5, words written in the page | 0 | 2 (websites list, connection) |
| Visibility | 71 | 71, rule words | 0 | 0 |
| Insights | 27 | 23, its own words; 9 with the weekly team box | 0 | 4 (a redirect, a source's page, the reports list, Summary) |

What "rule words" means: two or three sentences made by a fixed rule from the page's figures
(`convex/utils/sees/*`), the same every time. On those pages the panel opens with the rule's words and the chat, but:

- **No findings.** Code's findings exist only for Conversions (`convex/utils/sees/findings.ts`); the event screen
  reuses them.
- **Nothing written.** Only Conversions hands the team its figures (`ask`); every other screen key is unknown to
  the writer's code (`firstReadsFor`, `pageParts`, the Editor's checks, all Google Analytics-only).
- **A thin chat.** The chat knows only the page's address: no website, no dates, no figures
  (`HakkenSeesEye.tsx:71-81`), so Ask Hakken starts half blind.
- **No reads behind most pages.** The agents can read Google Analytics' screens, Search Console's totals and Bing's
  five screens. They cannot read Search Console's 20 analysis screens, Clarity's figures (charts only), most of
  Visibility (keywords, backlinks, competitors, local, reviews, radar, Google, paid, audit, assets) or Insights' screens.
- **Eyes that vanish.** Many Search Console pages say nothing on custom dates, so the eye disappears with the chat.
  Bing's, Clarity's and Insights' words are never saved, so Ask Hakken's `adviceInternal` cannot read them.

## The plan

One machine, then every page through it. Each page is described once in a **screen list** (which section, which
specialist writes, which reads are its own, which figures are its boxes, what it must never talk about). The writer,
the Editor, the findings and the chat read that list, so adding a page is a few lines, not new code.

### 0. Agree the ground rules (half a day; needs Anthony)

- Each section's intent in one sentence, and anything it must never talk about (money on Conversions is the model).
- Which pages get no eye: the four connection pages and the four redirects (proposed; 154 pages keep one).
- Who writes each section. Proposed, from the team that already exists: Google Analytics → Conversion specialist
  (tracking health → Measurement); Clarity → Conversion; Search Console and Bing → Search; Visibility → Search
  (keywords, Google), Links (backlinks), Market (competitors), Local (local, reviews), AI visibility (AI answers,
  radar, mentions), Technical (audit, assets); Insights → the specialist whose box it is.
- Insights already has the team's weekly words on nine pages. Proposed: there the panel shows those words and
  writes nothing new, so a press costs nothing; the other Insights pages are written like any page.
- A second real website besides morehandles.co.uk, for testing every section.

### 1. The machine (two days)

- **The screen list** (`convex/utils/sees/screens.ts`): every page's key, section, specialist, own reads, boxes and
  forbidden subjects. The writer, `firstReadsFor`, `pageParts`, the Editor's word checks and the tracking check read
  it instead of testing for `googleAnalytics.`.
- **The specialist is set by the list, not chosen by a model.** It drops the call that picks the writer, which is
  part of today's 5p a press.
- **The chat knows the page.** The website, the dates, the page's name and its figures go with every question, as
  on Conversions.
- **No vanishing eyes.** A page with nothing to say on custom dates still shows the eye, with the chat.
- **Words saved everywhere.** Bing's, Clarity's and Insights' words are saved like the rest, so Ask Hakken can read
  them.
- Tests for each piece; Conversions stays exactly as it is (its eval page must score as it does now, 2 of 2).

### 2. Reads behind every page (three days)

Every page's own figures, readable by the writer and by Ask Hakken, through the same function the page reads, every
number keyed (`keyedRead`), saved data only:

- **Google Analytics**: tracking health, and the Conversions map's pages.
- **Search Console**: every analysis screen (almost there, missed demand, shown but not clicked, volatility, Google
  updates, indexing, rich results, brand and non-brand, tracked, position bands, pages competing, types, click rate
  by position, demand by service, real against estimated, wins and losses, new and lost) and a keyword's and a page's
  own screens.
- **Bing**: its records, and the Insights agents get its reads (today only Ask Hakken has them).
- **Clarity**: the Overview, Pages, a page's own screen, Errors and Recordings.
- **Visibility**: keywords, backlinks, competitors, local, reviews, radar, Google, paid, audit and assets, and their
  record pages.
- **Insights**: each screen's read.

### 3. Findings in code for every section (four days)

General rules that work on any page's table, the same for every website (never one of Anthony's notes):

- **What changed most** against the period before, and whether it could be chance.
- **A group far from the average**: a channel, device, page kind, country, search or page.
- **One thing holds most of it**: a page bringing most clicks, a domain giving most links.
- **What is new and what was lost.**

Then a few per section, where the section has its own story: Search Console's searches shown often but rarely
clicked and those just off page one; Bing against Google; Clarity's pages where people give up (quick backs, angry
clicks, errors); Visibility's competitor ahead on a search or a link; Insights' own findings, reused. Jev answers the
judgment calls already in the Decisions engine (does it matter to an owner; behaviour or broken tracking).

### 4. Every page through the machine (four days)

Section by section, each one finished before the next, so Anthony can test as each lands:

1. Google Analytics (15 more pages)
2. Search Console (25, and the 2 countries pages that have no eye)
3. Bing Webmaster (8)
4. Clarity (5, and the websites list)
5. Insights (23, and the 3 pages without an eye)
6. Visibility (71, the biggest)

For each page: its entry in the screen list, its boxes handed to the eye, findings shown, written words on press,
the chat with the page's context. Each section is checked in Chrome before the next starts, and committed on its own.

**Testing presses a random handful, never every eye** (Anthony, 2026-10-31: "dont press all of the eyes just do a
random selection to see if it works"). Each section: a few pages picked at random, pressed on morehandles.co.uk and
the second website; every other page is held by its tests (its screen-list entry, its reads, its findings).

### 5. Test and refine (with Anthony, two to three days spread out)

- Anthony presses the eye across each section and notes what a good panel would have found.
- Each note goes on an eval page for that section (`keepSeesEvalPage`), never into the brief; every change is graded
  against the whole set (`gradeSeesEvalNow`).
- Refinements land as rules in the screen list, the findings or the Editor, so they hold for every website.

### 6. Write it down (half a day)

- Rewrite `what-hakken-sees-guide.md` for how it works now: code finds, the list picks the writer, the second look
  is gone, a press costs about 5p.
- The screen kit's notes; the full local check; commits local, nothing pushed.

## Cost and time

- **Build: about 16 days for a developer**: phase 1 two, phase 2 three, phase 3 four, phase 4 four, phase 5 two to
  three, phase 6 half. As agent work, about five to six days in all, phase 5 at Anthony's pace.
- **A press: about 5p, 2 credits**, as on Conversions today. A page whose words were written in the last three hours,
  with the same figures, costs nothing. Insights' nine weekly-box pages cost nothing.
- Nothing asks Google, Bing, Clarity or the supplier: every figure is saved data.

## How we will know

- On each of the 154 pages, pressing the eye shows findings, written words with steps that link to the right
  places, and a chat that knows the page, website and dates.
- Each section has an eval page with Anthony's notes, and its score is recorded.
- Conversions scores no worse than today's 2 of 2.
- A question asked in the panel about the page is answered with that page's figures, not the website's in general.

## Open questions for Anthony (phase 0)

1. The pages with no eye: the four connection pages and the four redirects. Agreed?
2. The writer for each section, as proposed above?
3. Insights' nine weekly-box pages: show the weekly words, write nothing new?
4. The second website for testing.
5. Still open from before: at zero credits, does the eye stop or carry on?

## Appendix: every page, and its eye today

Paths under `/app/`. R = rule words today; W = written in the page today; T = full panel today; — = no eye.

- **Google Analytics**: analytics (R), [site] (R), all-pages (R), all-pages/page (R), campaigns (R), channels (R),
  channels/channel (R), connection (R, settings), conversions (T), conversions/pages (R), events (—, redirect),
  events/event (T when a conversion, else R), funnel (R), landing-pages (—, redirect), landing-pages/page (—,
  redirect), live (R), products (R), tracking-health (R), tracking-health/check (R), visitors (R).
- **Search Console**: search-console (R), [site] (R), almost-there, brand-and-non-brand, click-rate-by-position,
  countries-and-devices, demand-by-service, google-updates, indexing, keywords, keywords/keyword, missed-demand,
  new-and-lost, pages, pages/page, pages-competing, position-bands, real-against-estimated, rich-results,
  shown-but-not-clicked, tracked/keywords, tracked/pages, types, volatility, wins-and-losses (all R); connection,
  keywords/keyword/countries, pages/page/countries (—).
- **Bing Webmaster**: bing-webmaster, [site], against-google, crawling, keywords, keywords/keyword, pages, pages/page
  (all W); connection (—).
- **Clarity**: [site], errors, pages, pages/page, recordings (all W); clarity list, connection (—).
- **Visibility** (all R): sites, [site]; ai/answers, ai/answers/answer, ai/businesses, ai/demand, ai/mentions, ai/read,
  ai/read/page, ai/searched, ai/share-of-voice, ai/sources; assets; audit, audit/problem; backlinks, backlinks/all,
  /anchors, /anchors/anchor, /broken, /compared, /domains, /domains/domain, /ips, /new-lost, /quality, /where;
  competitors, competitors/gap, /map, /organic, /rival, /suggested; drafts/[draft]; google/above, /fan-out,
  /features, /features/feature, /moves, /questions, /searches; keywords, keywords/bands, /bands/moved, /keyword,
  /new-lost, /pages, /pages/page, /structure; local, local/activity, /listings, /maps, /maps/search, /market,
  /market/business, /offices; mentions, mentions/listed, /rivals; paid, paid/keywords; radar, radar/gaps,
  /question, /sources, /sources/website; reviews, reviews/rivals, /say; your-pages.
- **Insights** (W, * = with the weekly team box): ai-search*, cannibalisation, cannibalisation/group, enquiries*,
  experiments, findings, findings/[finding], findings/sections/[section], funnel*, leaderboards*,
  leaderboards/[league], measurement*, opportunities*, page-plan*, page-reviews, page-reviews/page, reports/[report],
  sources, strategy*, strategy/service, this-week, track-record*, your-month; insights (—, redirect),
  enquiries/source, reports, summary (—).

## Progress

- 2026-10-31: planned from an audit of all 162 pages. Nothing built.
- 2026-10-31: Anthony, on testing: press a random selection of eyes, not all of them (phase 4).
- 2026-10-31, Anthony's answers to the open questions:
  1. No eye on the four connection pages and the four redirects: "yes thats correct". 154 pages keep one.
  2. The writers as proposed; where no specialist exists or matches a section, create one ("if we need to create a
     new please do if one does not exist or match"). Clarity is the likely case: how people behave on a page is not
     the Conversion specialist's discipline; decided in phase 1, and named to Anthony when made.
  3. Insights' nine weekly-box pages show the weekly words and write nothing new: "ok".
  4. The second website: Anthony names it later. Until then, morehandles.co.uk alone, with ronins.co.uk for Clarity
     (the only website on the dev deployment with Clarity's figures).
  5. At zero credits the eye **stops** and says so: "stop". Every other kind still records and carries on.
- 2026-10-31, building (Anthony: "Start"). **Phase 1 built** (eaaefa9a, local): the screen list
  (`convex/utils/sees/screens.ts`), every page's writer, a page's own figures handed to the eye
  (`convex/utils/sees/pageData.ts`), the chat told the page's figures, the Head of Strategy's choice of writer
  dropped (one model call a press saved), the Visitor behaviour specialist (`INSIGHTS_BEHAVIOUR`, for Clarity; it
  takes the Conversion specialist's model when made), and the stop at zero credits ("NO_CREDITS", with the way to
  Billing). Decisions taken while building, under the "build the whole plan" rule:
  - **A page's own figures come from the page itself**, not from new server reads: every page already holds the
    answer of the query that draws it, so the eye takes that answer, cut to its first rows. The writer, the panel's
    findings and the chat then name exactly the figures the reader sees, and phase 2's hundred-odd server reads are
    not needed. What this leaves out: Ask Hakken on its own page (not opened from the eye) still reads only the
    screens it read before; from the eye's panel it is told the page's figures.
  - **A websites list page** (one per section, no website chosen) shows findings and the chat but writes nothing
    when pressed: a press is always for one website.
  - Phase 2 therefore folds into phase 4: each page hands over its figures as it joins the eye.
- 2026-10-31, **phase 3 built** (fb702bdc): findings in code from any page's own figures (`pageFindings.ts`,
  `measures.ts`) — a total that moved, a list's biggest rise and fall, one row holding most, a percentage far from
  the list's average weighed by its own base; a rise in errors or angry clicks reads as bad news.
- 2026-10-31, **phase 4 built** (7660491c): every page of the six sections hands the eye its figures (six helpers, a
  section each, reviewed and committed together). Eyes added where there were none: Clarity's websites list, Search
  Console's two countries pages, Insights' source page, reports list and Summary. The Analytics connection page's eye
  removed, as agreed. Gaps: a few panels load their own figures inside the page (the Channels table, Campaigns' chart,
  the Conversions events table), so those figures don't reach the eye; a page in its empty state ("no groups yet")
  shows no eye.
- 2026-10-31, **tested in Chrome on a random handful** (Anthony: "dont press all of the eyes"), morehandles.co.uk:
  Google Analytics → Products, Search Console → Almost there, Visibility → Backlinks → Domains, Insights → This
  week, and a question in the chat (Backlinks → Domains: "imagetou.com, 488 links", as the table). Each wrote a short
  story from the page's figures with specific steps, in 40 to 70 seconds. Found and fixed on the way:
  - a website's name with a digit in it ("handles4doors.co.uk") was sent back as a typed number;
  - a page's words had no second try when the Editor sent them back (now one, as Conversions had);
  - a row named by a code ("UNJUDGED") became a finding's name;
  - the panel closed whenever a page's figures changed;
  - Insights over its default website wrote nothing (the eye now finds the one website its figures name);
  - "Written by the Hakken team" showed over a rule's words;
  - the Products screen's product views were called visits;
  - the writer said "enquiries" (every writer is now told: conversions).
  - Decided: Live's figures are asked of Google each minute, so its eye writes nothing.
  - **Not tested in Chrome**: Bing (no website on the dev deployment has Bing connected) and Clarity (its only
    figures are ronins.co.uk's, another company; the browser was not switched to it). Both are held by tests.
- 2026-10-31, **phase 6**: `docs/developer/what-hakken-sees-guide.md` rewritten for how the eye works now.
- **Still open**: phase 5 is Anthony's — pressing across the sections and noting what a good panel should find, each
  note an eval page; the second website for testing; Bing and Clarity pressed for real.

