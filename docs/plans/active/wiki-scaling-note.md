# Wiki Scaling Note — the Ceilings, and What Was Built Against Them

Status: **Delivered 2026-08-21**, same day as the question. Anthony
asked whether the wiki scales to 1000 pages; the check found the
shelves did but the brain squinted past ~500, and he said fix it all.
The scaling work below shipped the same evening, full suite green.
What remains are honest, documented bounds nobody will feel at 1000
pages.
Owner: Anthony

## What was built (2026-08-21)

1. **Two-stage choosing — the answer ceiling is gone.** Below 200
   pages the chooser reads the whole shelf exactly as before (small
   wikis, and the exam, see identical behaviour). Past 200, the index
   becomes a bounded shortlist: the ~150 newest pages, up to 100 pages
   the question's own words reach through the search index, and the
   hubs — so any page of any age stays findable by an answer that
   names it, and the model's reading (and cost, and latency) stays
   flat however large the wiki grows. Regression-tested with a
   210-page wiki whose oldest page is only reachable by the question's
   words.
2. **Freshest-first everywhere a window exists.** The chooser's recent
   slice, the mechanical answer fallback, the topic-page match, the
   page-detail neighbourhood, the quick switcher and the linker's work
   lists all read newest-updated first — the bug where a cap silently
   kept the *stalest* rows (found during the check) is fixed at every
   site, with an ordering test on the index.
3. **Link repair is safe past the window.** Tending's old rule —
   "target not in my 500-row window = broken" — would have stripped
   valid links to older pages on any wiki past 500. A candidate is now
   only declared dead after a point read fails to find it (bounded at
   200 verifications per night; unverified candidates wait their
   turn). Tested with a 511-page wiki: a link to a living ancient page
   survives, a link to a ghost comes off.
4. **Hubs and the contradiction finder read their own kind index.**
   No more 500-row all-kinds scans that read every source note to find
   a dozen topic pages and lost whole kinds past the window. Hub
   membership is now unbounded to 1000 per kind.
5. **Hubs survive their own success.** A hub body stays inside the
   page cap however many members exist: the most recently touched are
   named, the rest are counted ("— and N more."), and the links array
   stays complete for the map and backlinks. Tested at 300 members.
6. **Board-report goal grounding** reads the kind index (fixed during
   the same evening's audit) — recent goals can never drop out.

## The bounds that remain, on purpose

Nobody hits these at 1000 pages; recorded so nobody rediscovers them:

- **Map and export carry 1000 pages** (`WIKI_MAP_LIMIT`, export
  take). A 2000-page wiki's map draws the newest 1000; the export
  needs paging before it is complete past 1000.
- **Backlinks and the quick switcher consider the newest 500
  neighbours.** A very old page's backlinks list may miss very old
  linkers. A proper fix is a backlinks table; not worth the schema
  until a real wiki complains.
- **The linker's work lists are 500-row windows**, but convergent: a
  page leaves the list once linked, so the sets shrink night by night.
- **Tending's dead-link verification spends 200 point reads a night.**
  A wiki with thousands of cross-window links converges over nights
  rather than in one.

## What to watch

The weekly digest counts pages. If a single workspace passes a few
hundred, nothing needs doing — that is now the designed-for range. If
one heads toward several thousand, the work is: page the export, a
backlinks table, and cursors on the linker lists — in that order.
