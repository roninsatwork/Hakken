# Page groups and Your pages — agreed 2026-10-03

A website's own sections in its own words, and every page it has against
every page we found.

## Why

Anthony, 2026-10-03: "as a one off task the user could classify each page or
section — for instance I could tag our service lines, our products or our
content hub — so when we report on the content type it means more to the
user"; "we can classify URLs like a thing that start with /hub/ on ronins is
informational content … so it's pages and pattern related"; and "maybe we
should also [read] the sitemap.xml too, as this gives us intel on what the
website has vs what we found". "The more we can make it tailored to the user
the more sticky this app will be."

## His decisions

1. **Admin only for now**, "as we build the product out"; screens for clients
   to manage their own come later — so the rules are built to move there
   unchanged.
2. **A website's own groups replace Hakken's page kinds** on its charts and
   screens once they are filled in (B, not "on top of the kinds"). Until then
   the automatic kinds show, as today.
3. **A page no rule catches shows as "Not sorted"** — never falls back to an
   automatic kind — until a rule or a placement catches it.
4. **The sitemap's findings go to the client**: a **Your pages** page in
   Sites, under Site — each page once, with whether it is in the sitemap,
   crawled, shown by Google and ranking, and filters for the gaps. The
   sitemap is read at each collection.
5. **The admin page is "Page groups"**, in the company's Websites section
   under What we track, after Market. Each company sets its own, as with
   Market.

6. **Classify at page level** (on the first drawing: "is this really tables
   under tables making a poor ux … how do I set a classification too"; then
   "we need to be able to set a classification, edit a classification and
   remove one at the page level"). Redrawn: one admin page with two views —
   **Pages** (every page with its classification, set or changed in its row,
   removed with a bin, several set at once by ticking them; how each was set,
   by rule or by hand) and **Classifications** (each with a type —
   Informational content, Service, Product, Case study, Company, Legal, Other
   — its page count and its address lines; each opens its own page). Removing
   a hand-set classification returns the page to its rule; removing a
   rule-set one takes the page out of the rule (Not sorted). No rule order to
   manage: the more exact line wins. The screens say "classification", so the
   page reads **Page classification** — his word; to confirm against "Page
   groups".

## What ronins.co.uk shows (2026-10-03)

- **Its sitemap** (robots.txt → `sitemap_index.xml`): 139 pages in four files
  — page (62), content hub (49), case studies (11), posts (17).
- **What we found**: 157 crawled pages, 298 addresses Google showed in 90 days
  (158 pages once Google's jump links, `#…`, count with their page), 66
  ranking pages — 175 pages in all.
- **The gaps**: 6 pages in the sitemap Google never showed in 90 days; 25
  pages Google showed that the sitemap leaves out — author and category
  archives, older addresses (`/author/anthony/` brought 15 clicks); 19 crawled
  pages not in the sitemap; 1 sitemap page the crawl didn't reach.
- **Groups from its own folders and files** (the suggested start): Content
  hub (`/hub/`), Insights (`/web-design-insights/`, `/mobile-app-insights/`),
  Case studies (`/case-study/`), Journal (the posts sitemap), and the service
  lines by their addresses — AI services, Apps, eCommerce, Brand and design,
  UX and product, Growth marketing, Web3, Web design and development, Venture
  studio — then Company and Legal. 18 pages left Not sorted.

## The design (to be confirmed against the drawings)

- **Rules, first match wins**, in an order an admin can change: *starts
  with*, *contains*, *is exactly*, and *listed in sitemap file*. A page can
  also be placed in a group on its own, which beats every rule.
- **Suggested to start**: groups and rules read from the site's own folders
  and sitemap files, to keep, rename or remove — most of the one-off job done
  in a minute.
- **New pages** that a rule catches are grouped as they appear; the rest land
  in Not sorted, counted on the page.
- **Where groups show**: Search Console's Types, the Sites Overview's pages by
  kind, the Pages lists' filters, Your pages, and reports.

## Size and stages (2026-10-03)

About 20–24 days for one developer, 4–5 weeks: reading sitemaps (2), one list
of every page across the sitemap, crawl, Search Console and rankings (2), the
classifications' data and rules with set, change and remove per page (3), the
admin Page classification page and a classification's own page (4), the
charts and screens using them — Types, the Overview, the Pages filters,
reports, Not sorted (3–4), Your pages in Sites (2–3), the suggested start from
the site's folders and sitemap files (1–2), and tests in both languages, docs
and checking on ronins.co.uk and Korda (3). Anthony: "wow this is a big task".

It splits into three stages, each useful alone:

1. **Page classification** (about 10 days) — the admin page and the charts
   that use it.
2. **Sitemap and Your pages** (about 6 days) — independent of stage 1.
3. **The extras** (about 4 days) — the suggested start, classifications in
   reports and downloads.

Which comes first is his choice.

## The drawings

On the Search Console canvas (https://claude.ai/artifact/YSWaPwCuywp292S4rfeUQf):
board 22 Page classification, 22b a classification's own page, 23 Your pages.
On 2026-10-03 every table on the canvas was made to fit its board: tables had
been given fixed minimum widths (980px on these boards, 860px on the earlier
Search Console ones) wider than the ~900px beside the two menus.

## Open — with the drawings

- Limits to say: groups and rules per website, sitemap pages read per website
  (to sit on the Limits page, "nothing should be hidden").
- Whether keyword intent gets the same treatment later (not asked).

## Change log

- **2026-10-03** — Brainstormed and agreed: the five decisions above.
- **2026-10-03** — Drawn on the Search Console canvas, boards 22 (Page groups)
  and 23 (Your pages), from ronins.co.uk's real pages.
- **2026-10-03** — Redrawn at page level (board 22 Page classification, 22b a
  classification's own page): no tables under tables.
- **2026-10-03** — Pages only (his call): a PDF, an image or another file
  Google showed in search, or a sitemap listed, is left out of every page once
  and so of Your pages and classification (`isWebPage`,
  `convex/utils/holdPagesJoin.ts`). ronins.co.uk had three: two images and the
  brand audit checklist PDF.
- **2026-10-03** — Built (local, deployed to dev; not pushed):
  - **Stage 2, sitemap and Your pages.** The sitemap is read at the end of
    each collection (`sitemapRead.ts`, at most once in 6 hours, from
    robots.txt or the usual addresses), every page once is rebuilt per
    company hold (`holdPages.ts`), and Sites → Your pages shows it with the
    four figures and the gaps. ronins.co.uk: 139 sitemap pages in 4 files,
    172 pages in all.
  - **Stage 1, page classification.** Admin → Websites → Page
    classification: the pages, each set, changed or taken out in its row,
    and the classifications with their address lines (`pageClassifications.ts`,
    one rule in `utils/pageClassification.ts`). Once a website has any, Search
    Console's Types, Pages, Shown but not clicked and Real against estimated,
    and Sites' Overview, Top pages and a page's own screen use them, read at
    the time (`pageKinds.ts`); Not sorted otherwise. The Types hero figures
    add up by classification type.
  - **Stage 3, in part.** The suggested start: one action on an empty
    Classifications view, from the site's folders (3 pages or more) and
    sitemap files. Classifications in reports are still to do.
  - **Limits** (Limits page, "Pages" topic): classifications per website
    (default 25), address lines (100), pages set by hand (1,000), sitemap
    pages read (5,000). In code: 10,000 pages read by the admin page, 8,000
    pages of "listed in sitemap file" lines per read, 3 pages for a folder to
    be suggested.
  - Kit: `TableBar` gained the noun "classifications".
