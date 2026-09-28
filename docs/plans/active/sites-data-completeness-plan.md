# Sites — every number whole, or saying which part it is

**Started 2026-09-27. Status: approved 2026-09-27, all of §6 as recommended; built 2026-09-27 (not committed) — §8 says what, and the three decisions it leaves (§8.5).**
Change a decision here, with a date, before building anything that disagrees
with it. Follow `AGENTS.md`: no code until Anthony agrees.

Anthony, looking at the Overview's Competitors chart: "I believe some of the
sites get way more searches and traffic than we are showing … it would be a
nasty and shit UX if you tell me things are missing after so many rounds of
asking is everything ok now". Then: "We need to use total where we don't
collect all the data … list me the other places we don't use them", "perform
a full audit again", and "the audit includes the usage of totals to make the
data more accurate and readable".

This is that audit: everything found, at once, with the fix for each.

On the audit and its plan: "Yes please build it all as we are in a doom loop
going around circles finding stuff like this" — every phase of §6, and every
decision in §7 as recommended (G2: positions counted as normal results; the
backlink lists paged to "Backlinks kept", linking websites counted in
websites).

## 1. How the audit was done

Read-only throughout: no supplier calls, no changes.

1. **What we buy** — every request made to DataForSEO, read in code: what it
   asks for, how many rows, what decides it, and every way the stored result
   can be smaller than what the supplier holds.
2. **What every screen shows** — every figure, chart and table on the Sites
   list and all 35 screens of a site, read in code: where each number comes
   from, whether it can be less than the whole, whether the screen says so,
   and which supplier total exists for the same thing.
3. **The real data** — for all 17 websites on dev (Ronins Agency's 5, Korda's
   12), what we hold against the supplier's own totals for searches, visits
   and linking websites.
4. **The screens in Chrome** — a cut-short competitor's screens
   (chilliapple.co.uk) opened on dev: 12 of its 35, the rest covered by the
   code review (§5 says which and why).

Every finding marked **verified** was checked against the code and the data
by hand, not only read in a review.

## 2. The rules the fixes follow

1. **A limit means what it says.** "1,000 keywords kept" keeps 1,000
   searches; "1,000 backlinks" keeps 1,000 links or linking websites, as its
   label says.
2. **One meaning per figure.** The same name never shows two numbers: a
   position is counted one way everywhere, and a figure and the list it opens
   count the same thing.
3. **Whole, or saying which part.** Where we hold everything, show it. Where
   we hold part, lead with the supplier's total and say which part the list
   is — "629 of chilliapple's 1,857 searches, the most visited first".
4. **Never state what the data cannot know.** A search outside the part we
   hold is not "lost", not "new", and does not "not rank".

## 3. What we hold, against the supplier's totals (verified, 2026-09-27)

**Searches.** The supplier's count of what each site ranks for, against the
searches we hold:

| Website | Company | Supplier's total | We hold | Share |
|---|---|---|---|---|
| ronins.co.uk (own) | Ronins | 793 | 809 | all |
| lightflows.co.uk | Ronins | 762 | 756 | 99% |
| plugandplaydesign.co.uk | Ronins | 1,084 | 933 | 86% |
| pixelfield.co.uk | Ronins | 1,388 | 805 | 58% |
| chilliapple.co.uk | Ronins | 1,857 | 629 | 34% |
| kordatackle.com (own) | Korda | 2,545 | 2,545 | all |
| nashtackle.co.uk | Korda | 894 | 894 | all |
| thatscarpyrigs.co.uk | Korda | 403 | 403 | all |
| foxint.com | Korda | 1,199 | 947 | 79% |
| omctackle.com | Korda | 1,029 | 867 | 84% |
| gardnertackle.co.uk | Korda | 1,358 | 928 | 68% |
| carpology.net | Korda | 4,931 | 845 | 17% |
| gocatch.fish | Korda | 6,904 | 890 | 13% |
| johnsonrosstackle.co.uk | Korda | 8,573 | 976 | 11% |
| anglingtimes.co.uk | Korda | 11,644 | 820 | 7% |
| total-fishing-tackle.com | Korda | 15,350 | 1,000 | 7% |
| anglingdirect.co.uk | Korda | 28,575 | 982 | 3% |

The two owned sites are set to keep 10,000; every competitor keeps the
company default of 1,000 — counted in rows, not searches (4.B1).

**Visits.** Because lists are bought most-visited first, what we hold carries
most of each site's visits: all of them for Ronins' four competitors, 91% for
gocatch.fish, 81% carpology.net, 77% total-fishing-tackle.com, 76%
johnsonrosstackle.co.uk, 72% anglingdirect.co.uk, 67% anglingtimes.co.uk.

**Linking websites.** The supplier gives two totals: linking *domains*, each
subdomain counted apart, and linking *main websites*. Our list holds main
websites — exactly the second total, up to 1,000:

| Website | Linking domains | Main websites | We hold |
|---|---|---|---|
| thatscarpyrigs.co.uk | 740 | 93 | 93 |
| pixelfield.co.uk | 1,477 | 1,034 | 928 |
| foxint.com | 1,447 | 1,110 | 962 |
| anglingdirect.co.uk | 2,645 | 2,129 | 974 |
| ronins.co.uk | 506 | 491 | 491 |

The screens headline the first (740) and open a list of the second (93)
(4.D2).

## 4. Findings

### A. Bugs in the everyday check built earlier today (not committed)

**A1. The daily top-up wipes search features for the rest of the list —
verified.** Each filed list page deletes up to 500 of the site's older-day
feature rows (AI Overview mentions, featured snippets, map results) before
adding its own (`OLD_FEATURES_CLEARED`, `convex/siteKeywordList.ts`). The
everyday pages carry a newer day than the weekly list, so on a site whose list
is longer than the daily check they delete the weekly list's features beyond
it, 500 a day, not replaced until the next weekly list. No harm yet:
Ronins' lists fit inside the daily check and Korda's collection is off.
*Fix*: a page clears only the features of the searches it brought.

**A2. With some settings, part of a list is never bought — verified.** When a
site's searches fit inside "checked every run" but its rows do not, the weekly
pages are all counted as covered, the list is stamped as reaching only the
daily check, and the rows past it are never bought, on any run
(`weeklyDue`/`listReach`, `convex/seoCollection.ts`). *Fix*: plan and top up
from the list's row total, not the search count.

### B. We buy less than the settings say

**B1. Keyword limits count rows, not searches — verified.** The list asks for
four kinds of row — the normal result, featured snippets, map results and AI
Overview mentions — and "Keywords kept" and "Keywords checked every run" count
all four. chilliapple.co.uk's 1,000 rows held 629 searches; kordatackle.com's
first 1,000 held 827; the top choice, 10,000 rows, is about 6,300 searches.
The admin text says "About $0.13 per 1,000 keywords". *Fix*: count searches —
keep buying the next page until the searches held reach the limit or the list
ends. About $0.13 per extra page: roughly $0.26 a week for Ronins'
competitors, under $1 for Korda's, and up to $0.13 a run for a site whose
everyday check needs a second page.

**B2. Linking websites, anchors, IPs, broken links and one-link-per-website
are each one request of at most 1,000 rows, whatever "Backlinks kept" says —
verified.** Only "every link" reads the limit, and it counts links — lost
ones included, strongest website first — so one website with sitewide links
can fill it. anglingdirect.co.uk: 974 of 2,129 main websites held; foxint.com
962 of 1,110; pixelfield.co.uk 928 of 1,034. *Fix*: page each list up to its
limit, the linking-websites list counted in websites; up to about $0.06 per
extra 1,000 rows.

**B3. Competitor discovery returns at most 49 competitors** (50 rows, the
site itself among them), and the supplier's total is not kept; Organic
competitors says "Every website that does". *Fix*: keep the total, say "49 of
N".

**B4. Two companies share a list's first page, and the one with the larger
limit never gets the rest** — the paging stops at the first company's limit
(`convex/sitePagedLists.ts`). *Fix*: each company's pages planned to its own
limit; pages shared, the stopping point not.

**B5. The every-link list is whichever company's list filed last**, and a
first page clears the old list before the rest arrive
(`convex/siteLinkFiling.ts`). *Fix*: keep the standing list until a new one
is complete; the longer list wins.

**B6. Caps nobody sees**: a site's 101st competitor onwards is never
collected (`SEO_COMPETITORS_PER_WEBSITE = 100`); a run stops planning at
25,000 requests and starts again from the same website next time, so the same
websites miss out every run. Neither is near today's companies. *Fix*: both
on the run report; the next run starts where the last stopped.

**B7. The everyday call is 100 rows in the supplier's default order**,
adverts among them; Paid keywords come only from it (known: the 2026-09-26
audit's F3, and the screen says so). *Fix*: ask for the most visited first.

**B8. The site audit crawls at most 1,000 pages and does not keep how many it
left**, and its detail stops after ten requests without saying so. *Fix*:
keep the supplier's "pages left" and say "1,000 of N pages crawled".

**B9. A list bought in pages on different days can skip or repeat a search**
where many searches tie at the end of the order (no visits), and a skipped one
can be marked lost. *Fix*: judge "lost" only from one day's complete list, and
match searches by name across pages.

**B10. To check**: a site placed in a city sends the city to the Labs
requests, which may accept only countries — no site is placed in a city today.

### C. Moves on a site we hold only in part — verified

Nothing is ever marked lost on a site whose list is shorter than its total: a
search can only be called lost from a list that covered the whole site, and a
capped list never does. And a search that moves into the kept part is marked
new, though it ranked before. On a cut-short site the net only ever rises.
This reaches New and lost keywords, Wins and losses, the Calendar, the menu's
arrows and the Sites list's "What moved". The supplier's own new, up, down and
lost counts across every search are stored and shown nowhere.

*Fix*: on a site we hold in part, moves are counted among the searches we
hold and say so; a search that left the kept part is "left the kept list",
never "lost"; the supplier's counts across every search stand beside them.

### D. The same thing, two different numbers

**D1. Top 3 — G2** (sites-audit-fixes-plan.md §10). The menu, Sites list and
Overview show the supplier's count (ronins.co.uk 61, kordatackle.com 985);
Position bands shows ours (27, 592), because we count every item on Google's
page and the supplier counts normal results only. "ai agency": 3rd normal
result, 5th on the page. *Fix*: store the normal-results position and count by
it everywhere — what Ahrefs and Semrush show. No extra cost.

**D2. Linking websites** — headline linking domains (740), list of main
websites (93) (§3). *Fix*: "Linking websites" means main websites everywhere;
the domains figure, if kept, says it counts subdomains.

**D3. Searches shared with a competitor** — the Overview and Market map use
the supplier's count; a competitor's own page lists only the searches in both
kept lists. *Fix*: "X of the N shared".

**D4. Visits** — the supplier's total on the Overview and Sites list; sums of
what we hold on Branded and other searches, Pages by kind and by visits, and
Site structure. *Fix*: shares of the supplier's total, with the rest named
"outside the searches we hold".

**D5. Search counts** — the supplier's total on the Sites list, menu and
Overview; what we hold on Position bands, New and lost, Site structure and the
Calendar. *Fix*: "X of Y" wherever they differ.

**D6. AI Overviews, broken links** — a supplier count opening a list of what
we hold; "Broken pages" (a count of pages) opens a list of links. *Fix*:
"X of Y", and the right list.

### E. Screens that show part without saying so

Each with the supplier total that fixes it.

| Screen | What is partial | Total to use |
|---|---|---|
| Position bands | Every figure and share (the redesign dropped the old page's "N of M" — my miss) | Supplier's bands as the headline once G2 is settled; "X of Y" until then |
| New and lost keywords | "Whole list · N searches" for a kept list; moves (§C) | Search total; supplier's moves |
| Site structure | Summary line and shares ("of the site's") are sums of what we hold | Search and visit totals |
| Top pages | Menu count, chart and per-page figures | None stored: say "pages of the N searches we hold" |
| Overview | Pages by kind and by visits ("All N ranking pages"), Branded split | Visit total |
| Keywords | The count under a band, intent or movement filter | Supplier's bands for a band |
| Backlinks lists | Linking websites, one per site, broken, anchors, IPs, networks chart: "of 1,000" looks whole | Each list's total, once kept (§G) |
| Organic competitors, "N competitors found" | At most 49 | Discovery total, once kept |
| A competitor's page | "Searches you both rank for" | Supplier's shared count |
| A search feature's page | Searches in the kept list | Supplier's feature count |
| Everywhere a total is used | If the supplier's figure is missing from the last 21 days, our held count is shown as the total ("1,000 of 1,000") | Say "total not known yet" |

### F. Things the screens say that are wrong

- Content gap: "Read from each competitor's 5,000 most-searched keywords" —
  about 1,000 are held, chosen by visits; and it shows false gaps where this
  site ranks beyond its own kept list. **Verified.**
- New and lost and the Calendar call a kept list "Whole list". **Verified.**
- Keywords' compare column says "Not in the top 100" for a search that was not
  checked that day.
- A keyword's page: "does not rank" and a competitor's "Not found in their
  rankings"; a page's page: "does not rank for any search" — each can be false
  for a search outside the kept list. **Verified wording.**
- Organic competitors: "Every website that does" — at most 49. **Verified.**
- Data limits: "About $0.13 per 1,000 keywords" and "refreshed weekly" — rows,
  not keywords; and a company collecting fortnightly or monthly refreshes that
  often, not weekly. **Verified wording.**
- Minor: Paid's "Estimated spend a month" has no currency sign.

### G. Totals the supplier gives us that we throw away

- The total of every backlink list: linking websites, one link per website,
  broken links, anchors, IPs and every link.
- Competitor discovery's total.
- The backlinks summary's linking IPs, subnets and pages.
- The crawl's pages left uncrawled.

*Fix*: keep each, and show it wherever its list is shown.

### H. Supplier settings left at their defaults — to check against the documentation

The everyday call's row kinds and order; the SERP check's device and
"People also ask" depth; the backlinks summary's status, subdomains and list
sizes (its breakdowns may be cut at 10 by the supplier before our 15); the
anchors, IPs and broken lists' status; the crawl's JavaScript rendering; and
the AI answers' output length.

## 5. The screens in Chrome

Opened on dev, 2026-09-27, in the Ronins Agency workspace: chilliapple.co.uk's
Overview, Calendar, Site audit, the five AI answers screens, Your searches,
Wins and losses, Who ranks above you and Position bands; and ronins.co.uk's
Content gap. No screen showed an error. The dev server took one to two
minutes to build each screen on first opening, so chilliapple's other 23
screens were not opened; the code review (§1, part 2) covered them.

What the screens showed, as found in §4:

- chilliapple.co.uk's menu: "Keywords 1,857", "Position bands 457". Its
  Position bands page: "629 searches held", "249 in the top 3", "82% of 629
  searches" — as if the site ranked for 629 (§4.E, §4.D1).
- Its Overview: "All 73 ranking pages" — the pages of the 629 searches held
  (§4.E).
- Its Calendar: "Whole list, first time · 623 searches" for a list cut at
  1,000 rows (§4.F).
- ronins.co.uk's Content gap: "Read from each competitor's 5,000
  most-searched keywords" (§4.F).

## 6. The fix plan

One build, in this order. Nothing here calls DataForSEO while being built;
the collection changes take effect on the next runs.

| Phase | What | Size | Extra cost |
|---|---|---|---|
| 0 | A1–A2: the two everyday-check bugs | Half a day | None |
| 1 | Totals everywhere: C, D2–D6, E, F, G (keep the totals the supplier sends) | 3 days | None |
| 2 | Limits that mean what they say: B1–B5, B7–B9 | 3 days | Keywords: ~$0.13 per extra page (~$1.30 a week for both companies' competitors today). Links: up to ~$0.06 per extra 1,000 rows |
| 3 | G2: one way of counting positions | 1 day | None |
| 4 | Caps on the run report, B6; the defaults in H checked; B10 | 1 day | None |

## 7. Decisions for Anthony

1. **Build all of §6 as recommended?**
2. G2 — count positions as normal results everywhere (recommended), or keep
   counting every item on Google's page and change the menu to match.
3. The backlink lists paged to "Backlinks kept", the linking-websites list
   counted in websites (recommended), at up to ~$0.06 per extra 1,000 rows.

## 8. What was built (2026-09-27)

Nothing here called DataForSEO. The collection changes take effect from each
site's next run; until then the screens read what was bought before.

### 8.1 Collection (Phase 0 and Phase 2)

- **A1, A2** — a list page clears only the search features of the searches it
  brought; lists are planned and topped up from the supplier's count.
- **B1** — "Keywords kept" and "checked every run" count searches: the next
  page is bought until the searches held reach the limit or the list ends.
  The admin text says $0.15 to $0.22 per 1,000.
- **B2, B5** — every backlink list is paged to "Backlinks kept" (never under
  1,000), the linking-websites list counted in websites; a new list replaces
  the standing one only when whole and at least as long, or when the standing
  one is over four weeks old.
- **B3** — discovery's total is kept (`siteDiscovery.ts`).
- **B4** — each company's pages are planned to its own limit.
- **B6** — a run that stops at its ceiling is named on the run report, the
  next run starts with the websites it did not reach and goes round to the
  rest, and a site with more competitors than a run collects is named too.
- **B7** — the everyday call asks for the most visited first. Its default was
  the best-ranked first (docs, 2026-09-27).
- **B8** — the crawl's pages left are kept: "1,000 of 3,412 found"; a crawl
  detail stopped at its request cap says its lists are the first part.
- **B9** — a list is whole only when it holds every search the supplier counts.
- **G** — every backlink list's total, the summary's servers, networks and
  linking pages, discovery's total and the crawl's pages left are kept.

### 8.2 One way of counting positions (Phase 3, G2)

Positions are Google's normal results everywhere (`rank_group`), the place on
the whole page kept beside them (`pagePosition`). A ranking counted one way is
never compared with one counted the other, so the day the counting changes is
no move. Until a site's next run its lists are still counted on the page.

### 8.3 Totals everywhere (Phase 1)

- One figure for every screen, `coverage` on the site's header
  (`coverageOf`, `siteFigures.ts`): searches and visits held against the
  supplier's totals, whether the list is whole, and the supplier's bands,
  moves and feature counts. One sentence for it (`HeldLine`), and "not known
  yet" when the total is missing.
- **Position bands** — the figures and chart are the bands across every
  search, as the menu counts them; the grid and lists say they are among the
  searches held.
- **New and lost, Wins and losses, Calendar, Sites list** — on a list held in
  part the fourth move is "Left the list", never lost (`rankedLeft`, and
  `LEFT` in `listMoves`); the moves say they are among the searches held,
  beside the supplier's moves across every search. "Whole list" only for a
  list that held everything; otherwise "The list kept".
- **Keywords** — the part-held sentence; a band or move chosen alone says
  "X of the Y"; the compare column says "Not in that day's list" for a search
  not checked that day, and never compares places counted two ways.
- **Site structure, Overview** — shares of the whole site's searches and
  visits, the rest named "outside the searches held"; competitors found "among
  the N websites read of the M".
- **Top pages, feature pages, a competitor's page, Organic competitors** —
  each says which part it holds, of which total.
- **Backlink lists** — "X of the Y in this list are kept"; the networks chart
  says which servers it counts, and the networks in all.
- **Linking websites** — main websites everywhere (menu, charts, Calendar,
  side by side); the count with each subdomain apart is shown beside it.
- **Wrong statements** — Content gap, "does not rank", "Not found in their
  rankings", Organic competitors' "Every website", Paid's missing dollar sign,
  Link quality's "Broken pages" opening a list of links, and the Data limits
  wording ("refreshed weekly", what "Backlinks kept" covers).

### 8.4 Supplier defaults checked (Phase 4, §4.H)

Read from DataForSEO's documentation on 2026-09-27; no request made.

| Setting | Default | What it means | Done |
|---|---|---|---|
| Everyday call's order | Best position first | The hundred were the best-ranked, not the most visited | Most visited first (B7) |
| Everyday call's row kinds | Normal results and adverts | Paid keywords reads the adverts from it | Kept |
| Backlinks summary's breakdowns | The largest 10 of each | "Where links come from" gave shares of those 10, not every link | Asked for all (up to 1,000), free: charged per request |
| Broken links, anchors, servers lists | Live links only | Lost ones are not in them | Kept, said here |
| Page check's device | Desktop | Positions are a desktop searcher's | Kept, said here |
| Page check's AI Overview | Not waited for | An AI Overview Google loads late is missed | Decision 1 |
| Crawl's JavaScript and resources | Off | A site built in JavaScript can show false "no title" problems; broken images and scripts are not checked | Decision 2 |
| AI answers' length | 2,048 tokens | Long answers may be cut | Kept |
| Labs requests' place | Countries only | A site placed in a city would be refused (B10) | Decision 3 |

### 8.5 Decisions for Anthony — all taken, 2026-09-27 ("do them all")

1. **AI Overviews that load late.** The page check waits for them
   (`load_async_ai_overview`): $0.0006 more per search checked.
2. **The crawl's JavaScript.** Pages run their JavaScript before they are
   read (`enable_javascript`): $0.0015 a page against $0.00015 — nine times
   the plain crawl, $1.50 a crawl of 1,000 pages instead of $0.15 (pricing
   page, 2026-09-27). About $18 a month for Korda's twelve sites at their
   monthly crawl, against $1.80.
3. **B10, a site placed in a city.** A Labs request is sent the city's
   country (`argsToSend`, the one place requests are sent); what was asked —
   the purchase, and the place its answer is filed under — stays the city.

### 8.6 The first runs (2026-09-27, at Anthony's word)

"ok both companies are allowed to collect - you can use the collect now
buttons when you are ready."

**Ronins Agency** — $1.20 in all ($1.17 DataForSEO, $0.04 AI), 23 requests,
all filed. Its keyword lists took 8 requests ($0.84): one a site, and a second
page for the three competitors whose lists run past 1,000 rows. What the lists
now hold:

| Website | Held before | Held now | Supplier's total |
|---|---|---|---|
| chilliapple.co.uk | 629 | 1,295 | 1,857 |
| pixelfield.co.uk | 805 | 1,163 | 1,388 |
| plugandplaydesign.co.uk | 933 | all | 1,084 |
| lightflows.co.uk | 756 | all | 762 |

A list can end a little past its limit: a page is bought in rows, and the
last one is sized from the list before it.

Counted among the normal results, chilliapple's top 3 held is 444 of the
supplier's 457 — it was 249 counted on the page.

**Korda** — $8.98 so far ($8.89 DataForSEO, $0.10 AI), 197 requests, the
site crawls still being answered (paid, $1.80). Its keyword lists took 25
requests ($2.24): kordatackle.com all 2,888 of its searches, each competitor
a second page to about 1,000–1,100 searches, thatscarpyrigs.co.uk its 386 in
one. The link lists needed no second page: its competitors keep 100 links, and
every list is at least a thousand. On the screens:
kordatackle.com's top-3 filter lists 1,038 searches, the menu's 1,038 (it was
592 against 985); anglingdirect.co.uk holds 1,083 of 28,937 searches, keeps
1,000 of its 2,256 linking websites and 1,000 of its 1,544 servers (1,013
networks in all), and its Organic competitors are "49 of the 79,503".

Several of Korda's totals rose sharply between its runs of 25 and 27
September — gardnertackle.co.uk 1,358 to 2,367 searches, carpology.net 4,931
to 8,175. They are the supplier's own counts: its everyday answer is their
only source, and Ronins' totals, filed by the same code that morning and that
afternoon, did not move.

**Found and fixed on the way.** That morning's scheduled run had filed the
day counted the old way; filed again the new way, each search moved from its
old-way place — every site showed 76 to 85 searches up. `fileKeywordRank` now
never moves a place from one counted the other way on the same day either,
and the migration `2026-09-27-counting-switch-moves` cleared the day's moves
and summarised each site again. Position bands' grid calls a search newly in
a list held in part "New to the list", not "Not ranking", and its sentence
says how many of the searches held changed band and how many were new to the
list, never "moved into the top 3".

### 8.7 Sites compared with each other (2026-09-27)

Anthony, on the Overview's Competitors chart, Traffic view: "there is no way
we get more traffic than chilliapple … what is the point in doing a full audit
only for me to check one screen as you missed it and it's wrong".

The audit asked of each figure whether it was the whole site or the part
held. It never asked whether every site on a comparison is measured the same
way. What was wrong, and is fixed:

- **The Traffic view.** Across, each competitor sat at *the site's own*
  visits from the searches both rank for — the supplier's figures on shared
  searches are the asking site's: youtube.com's sit just under each Korda
  site's total (22,095 of anglingtimes.co.uk's 22,510) — and the site itself
  at all of its own visits, far to the right of chilliapple.co.uk, which gets
  more (2,790 to 1,896). No competitor's total was on it. Anthony: "it should
  be total traffic vs total keywords". Both views now draw every site at its
  totals — every search it ranks for across, its visits a month up, the site
  among them — as estimated for the place it is watched from; Traffic lists
  them the most visits first. The shared-search columns say "your visits",
  the hover shows whole numbers ("126.513" read as thousands in Italian) with
  short labels, and Organic competitors' column says "Your traffic on shared
  keywords". Against Ahrefs (chilliapple.co.uk 20,691 visits a month) the
  supplier's UK estimate is far lower (2,790): Ahrefs shows every country by
  default, and each tool estimates traffic its own way.
- **A total standing in for another.** Where the supplier's search total was
  missing, the searches held stood in for it — on the Sites list, Side by
  side, the Market map, the Overview's competitors and the menu — setting part
  of one site beside the whole of another. Now it shows as not known
  (`searchTotalOf`). A list's own position bands stand in for the site's only
  when the list is the whole site (`latestBands`), on the Sites list, Side by
  side, the menu and the Overview's and Keywords' band charts.
- **The Overview's chart laid over competitors.** "Keywords" is the
  supplier's count only; "Ranking pages" — the pages of the searches a list
  holds — is not offered for competitors.

## Change log

- **2026-09-27** — Audit run and written: what we buy, every screen, the real
  data for all 17 websites, and the screens in Chrome. Two bugs found in the
  uncommitted everyday check (A1, A2).
- **2026-09-27** — Approved: build all of §6, every decision as recommended.
- **2026-09-27** — Built: every phase of §6 (§8). Defaults checked against the
  documentation; the backlinks summary's breakdowns asked for whole; three
  decisions left for Anthony (§8.5). Not committed.
- **2026-09-27** — First runs at Anthony's word: Ronins Agency $1.20, Korda
  $8.98 (§8.6). A counting-change bug found in the first and fixed and
  repaired before the second.
- **2026-09-27** — Anthony's three decisions built (§8.5). Comparisons across
  sites fixed after he found the Competitors chart wrong (§8.7).
