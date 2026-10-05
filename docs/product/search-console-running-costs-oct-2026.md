# What Search Console costs to run, as left — 5 October 2026, night

A dated record for pricing, written after
[What a website costs to run](./infrastructure-costs-oct-2026.md) the same
evening, which it updates for the rebuild rules agreed that night. Like the
rest of this folder it is not kept up to date: supersede it.

## The rules, as Anthony confirmed them

"We collect as per the website schedule, that's not changing. We rebuild
weekly and after each website collection for that website … and we rebuild
when someone opens if it's stale."

| When | What happens |
|---|---|
| Every night | Search Console's new day fetched from Google; a day already held fetched again only if Google's totals for it changed. Nothing added up, but a website's very first collection |
| After the website's own collection (its company's Daily, Weekly or Monthly schedule) | Its lists added up: the 7 and 30 days, and the 90 days and twelve months when a week old |
| Weekly | Every website not added up in a week, added up whole (job `search-console-weekly-rebuild`, each day those a week old) |
| When someone opens a screen whose figures are behind | The figures held shown at once, with a line and a bar; the lists behind added up — the 7 and 30 days with the charts, or the 90 days and twelve months — and swapped in whole |

Measured on dev: a website's rebuild, every kind of result and country side
by side, about 3 minutes for morehandles.co.uk (was about 9); a catch-up
when opened, 95 seconds for morehandles.co.uk and 33 seconds for
ronins.co.uk.

## What it comes to a month (estimated)

For one website the size of morehandles.co.uk (205 MB kept). Reading and
writing at Convex's $0.20 a GB past the 50 GB included; to be confirmed on
the Convex dashboard's Usage page.

| | Start of 5 October | After the storage work | As left |
|---|---|---|---|
| Weekly schedule, nobody opens it mid-week | about $5.50 | about $1.35 | **about $0.25** |
| Weekly schedule, opened two days a week | about $5.50 | about $1.35 | **about $0.50** |
| Daily schedule, opened every day | about $5.50 | about $1.35 | **about $0.95** |
| 1,000 websites that size | about $5,500 | about $1,350 | **about $250–$950** |

A website on a Daily schedule is added up after each daily collection, and
each day someone opens a website behind adds a catch-up: those keep it above
a seventh of the old cost. A hard cap of a seventh — no rebuild after a Daily
company's collection, one catch-up a day at most — was offered and not taken
that night.

## Not in these figures

The DataForSEO side: what its stored data and its rebuilds after each
collection cost in Convex — picked up next (Anthony, 2026-10-05).
