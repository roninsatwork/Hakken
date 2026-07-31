# Workspace Sales Data Plan

Last reviewed: 2026-07-31
Status: Active. Phase 1 (module gate, import, table views) delivered and tested.
Phase 2 (search and filters) delivered, and verified in the browser against the
4,568-row Comax import.
Owner: Anthony

## Scope And Rules

**In scope:** an optional per-workspace section holding a spreadsheet import and
four browsable tables — one per source worksheet; the company-module flag that switches it on; the
workbook parser; and the server-paginated screens behind it.

**Out of scope:** analysis on top of the data. The category worksheet is a
cross-sell map and the frequency worksheet separates repeat purchases from
one-offs, so gap analysis is the obvious next thing — it is not this plan.
Also out of scope: editing imported rows. The spreadsheet is the source of
truth; the way to change the data is to import again.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Node 24.18.0; `verify:env` enforces the baseline.
- Server-side pagination only. Anthony, 2026-07-31: *"These tables need to be
  server side optpimsied and quick adn not do any cliennt side processing."*
- No client name in shipped code. `src/no-client-specific-fallbacks.test.ts`
  and `src/template-boundary.test.ts` both bear on this section.

## Why This Plan Exists

Anthony, 2026-07-31: *"we have created a compnay called comax in teh admin
seciton and we need a new section on teh user frontend to only be avilanbel to
users of that workspsace … This new seciton will be called "Comax" and it will
not render or anyone that is not a comex user … then we will have a submeny
called Import Data whichc wioll take our spreadsheet and upload it into a 3
datanbases - one for each tab."*

The tension the plan resolves: the requirement names one client, and the
codebase has two guardrails specifically against naming clients in platform
code. The resolution is a generic module flag with the workspace's own name as
the label — Comax sees "Comax" without the platform ever knowing the word.

## The Source Workbook

`Sample Data - Ronins.xlsx`, four worksheets. What it actually contains, since
several details drove the design:

| Worksheet | Shape | Notes |
| --- | --- | --- |
| `Jan-Jun 2026 Sales` | 4,568 rows × 16 cols | One row per account × product. Six revenue columns headed with **dates**, not labels. £1,227,825.30 total. 64% of month cells blank. Negative values are credits. |
| `Categories relating to customer` | 70 rows × 2 cols | `CUSTOMER TYPE \| CATEGORY`. Restructured 2026-07-31 from a grid of two stacked blocks. |
| `Customer Areas of Interest` | 11 rows × 2 cols | Added 2026-07-31 — the second block, split into its own worksheet. Titles itself and has **no header row**. |
| `Sales frequency` | 262 rows × 3 cols | Category + type → `Regular` or `Sporadic`. |

Revised 2026-07-31: the sales worksheet is unchanged at 16 columns but now holds
4,568 rows totalling £1,227,825.30 (was 4,572 / £1,231,227.05).

Three quirks that break naive handling:

1. **The sales worksheet's name changes every period.** Nothing can match on it.
2. **Category names disagree across worksheets.** `DISPENSERS & BRACKETS` on the
   category sheet, `DISPENSERS AND BRACKETS` on the sales sheet; trailing spaces
   on `LIGHT EQUIPMENT `, `JANITORIAL `, `EDUCATION - NON RESIDENTIAL `. A join
   on raw text silently drops rows.
3. **Column headings are not what a preview suggests.** The first column is
   `Customer - Parent  Account  Number` with doubled internal spaces. An early
   read truncated it and the importer was built against the truncated name — it
   failed loudly on the real file, which is the behaviour that was wanted.

## Decisions

Taken 2026-07-31 with Anthony, recorded so they are not relitigated.

1. **A generic per-company module flag, not a hardcoded company.**
   `companies.enabledModules: string[]`, registry in
   `convex/utils/companyModules.ts`. The second client to buy this gets a
   checkbox, not a code change.
1b. **The flag is configured from the company overview screen**, in its own
   card after Subscription & Billing, super-admin only — alongside the plan
   override rather than buried in the provisioning modal. Anthony, 2026-07-31:
   *"these needs to be configurable from the compn ay over scren after th
   eplanbs."* It has its own `setCompanyModules` mutation and its own save
   button; reusing `updateCompany` would make ticking a checkbox resend the
   name, tagline and prompt, so a module change could clobber a profile edit
   made in another tab. The provisioning modal keeps its copy of the toggle so
   a new tenant can be created with modules already on — the same duplication
   the plan selector already has.
2. **The nav label is the workspace's own name.** So Comax reads "Comax", and
   the platform never stores the string.
3. **Re-import replaces everything.** Not upsert, not versioned batches.
4. **Six fixed period fields to start.** Anthony: *"i dotn know 1 field for each
   column to start with."* The period-driven alternative was explained and
   declined for now — see *Known Limits*.
5. **Any user in the workspace may import.** Not admin-only.
6. **The user maps worksheets at upload.** Not by position, not by keyword.
   Follows directly from the worksheet name changing every period.
7. ~~**The category grid is flattened to rows**, tagged with which block it came
   from.~~ **Superseded 2026-07-31.** Anthony restructured the source: the
   categories worksheet is now a plain `CUSTOMER TYPE | CATEGORY` table and the
   interest block has its own worksheet. Four tabs now map to four tables, and
   the grid reader is deleted rather than kept as a fallback — when the source
   changed it did not fail, it read the header row as two customer types and
   produced 25 rows of confident nonsense under a green "import complete".
   Refusing what it does not recognise is the point of the replacement.
7b. **One source column, one database field.** Anthony, 2026-07-31: *"i want 1
   column to 1 field form spreadhsset to database."* The sales table already
   stored all 16 columns; the screen was merging four of them into two cells
   and hiding two more. All 17 columns now render individually and the table
   scrolls sideways.
8. **Store the source text and a normalised key.** Both. The key collapses case,
   whitespace and `&`/`AND` so cross-worksheet joins work; the source text is
   what appears on screen.
9. **Search and filters come after.** Anthony: *"lets just tet the import
   workign fist and the table view we can work on filter and search post that."*

## Design

### The gate

`getSectionOverview` answers "may I be here, and what is the workspace called"
in one query, so the layout can decide before rendering. Hiding the nav link is
presentation; every query in `convex/salesData.ts` re-checks the flag, so a
typed URL or a direct call is refused.

`SALES_DATA_MODULE_KEY` lives in `convex/utils/salesDataModule.ts` rather than
alongside the queries — the sidebar needs it in the browser, and importing a
module that defines Convex functions would ship the backend with it. The lint
rule `@typescript-eslint/no-restricted-imports` enforces this.

### The replace

Delete-then-insert was rejected. It empties the workspace's tables for the
duration of the import, and leaves them empty permanently if the file turns out
to be malformed halfway through.

Instead: every row carries its `importId`; new rows are written alongside the
old; only once all four datasets are in does the previous import's data get
dropped, in batches sized to Convex's per-transaction write limit. **A failed
import changes nothing.** The import record is kept either way, so a failure
has a visible reason rather than an unexplained empty table.

At most one import is ever `COMPLETED` and not `supersededAt` — that one is
"current", and it is what the table queries read.

### Tables

`salesDataImports`, `salesDataRows`, `salesDataCategoryLinks`,
`salesDataFrequencies`. Every index leads with `companyId` so a query can never
be scoped by import alone.

### Screens

`/app/sales-data/import` — upload, then map, then replace. Two steps
deliberately: reading a workbook is harmless, replacing the data is not.

`/app/sales-data` — one screen, three secondary tabs, active tab in the URL.
Only the visible tab's query runs. Pagination is cursor-based, one page in
memory at a time; the accumulate-and-slice pattern used elsewhere in this
codebase would hold all 4,500 rows in the browser by the last page.

## Delivered (Phase 1)

| | Where |
| --- | --- |
| Module flag + registry | `convex/utils/companyModules.ts`, `convex/companies.ts` (`setCompanyModules`, audited as `UPDATE_COMPANY_MODULES`) |
| Module toggle | `src/app/(dashboard)/admin/companies/[id]/overview/page.tsx` (primary), `src/app/(dashboard)/admin/companies/page.tsx` (provisioning modal) |
| Schema | `convex/schema.ts` — four tables, `companies.enabledModules` |
| Parser | `convex/salesDataImportService.ts` |
| Import pipeline | `convex/salesDataImportActions.ts`, `convex/salesData.ts` |
| Screens | `src/app/(dashboard)/app/sales-data/` |
| Nav | `src/ui/components/layout/SidebarNavigation.tsx` (fenced) |
| Template vertical | `template.manifest.json` — `salesData` |

**Acceptance met:**
- Parser run against the real workbook produces 4,572 rows totalling
  £1,231,227.05, matching an independent read of the file. 81 category
  pairings, 259 frequency rows (3 fewer than the 262 source rows — the
  trailing-space duplicates, both copies carrying the same value).
- 23 parser tests, built from the real column layout including its quirks.
- 4 tenant-isolation tests in `convex/bola.verticals.test.ts`, including: a
  workspace that *has* rows but *lacks* the module is refused, not shown an
  empty table.
- 0 lint errors project-wide; typecheck clean on all touched files.
- `node scripts/build-template.mjs` strips the vertical with no leftovers.

**Since verified in the browser**, during the Phase 2 work: the functions were
pushed to the dev deployment and the four tables were driven signed in as
Anthony, impersonating Comax, against the real 4,568-row
`Sample Data - Ronins.xlsx` import.

One thing that showed up only there and is still open: the `ROW` column reads
`—` for every row, because this import predates `sourceRow` and nothing has
backfilled it. The column works; the data behind it is from before the field
existed. Re-importing the file populates it.

## Phase 2 — Search And Filters (done)

Every table has a search box. The sales table also has three dropdowns —
customer type, account, group — which combine, so Trade *and* North narrows to
rows matching both. Search applies on top of whatever is filtered. The other
three tables take search only: two or three columns each, with nothing worth
narrowing.

Search matches any text column of the table, by substring, ignoring case, with
every whitespace-separated term required — `care bleach` finds the row whose
customer type is one and whose description is the other. Substring rather than
whole-word because these columns hold product codes people search by fragment:
`BRK-2` has to find `BRK-200`.

**The constraint the plan flagged, and how it was resolved.** Convex cannot
combine a free-text search with an ordered range scan, so using the
`search_product` index would mean surrendering file order the moment someone
typed — and file order is what lets this table be read against the spreadsheet.
Search is therefore a predicate applied to the ordered scan, not an index
lookup. The trade is bandwidth: rows failing the predicate are read and
discarded, so a search matching nothing walks the import. At a few thousand
rows that is the cheaper side; at ten times the size the answer is a stored
search field, not a search index.

**Two things that bit, worth not rediscovering.** Convex permits *one*
paginated query per function and rejects the second `.paginate()` at runtime —
which `convex-test` does not enforce, so a page-filling loop passed every test
and failed on the deployment. And `filter` from convex-helpers paginates before
filtering, so `numItems` counts rows scanned rather than rows kept, giving
pages of nought and one. A narrowed page is consequently positioned by counting
matches: the cursor is how many matching rows precede the page, and the scan
walks from the start each time. Unnarrowed, it is still the plain paginated
query with real cursors, so the ordinary case pays nothing for the search box.

Both traps are now checked rather than remembered. `npm run check:guards` runs
two scripts, wired into `check`, `gate` and CI:

- `check-convex-pagination.mjs` counts the worst single execution path through
  every Convex function, following helper calls, and fails on a second
  `.paginate()`. It found one live fault on its first run — the monthly billing
  reset paginated companies and then users in one mutation, so the reset threw
  and rolled back every time it fired. Branching queries that return from each
  arm are not reported; a loop or a recursive helper counts as two turns.
- `check-text-source-encoding.mjs` fails on a NUL byte in a tracked text file,
  reading the same first 8000 bytes git reads before it decides a file is
  binary and starts printing `Bin` instead of a diff.

Filters compare on `normalizeKey`, not raw text, so a filter finds rows whose
source spells the value differently — `DISPENSERS & BRACKETS` and
`dispensers and brackets ` are one option in the dropdown and one filter.

Not built, and still candidates: category and product type filters, and
Regular vs Sporadic via the frequency table.

## Known Limits

1. **Six revenue columns is a ceiling, not a default.** A twelve-month file is
   refused with a message saying so, rather than silently importing six months.
   Lifting it means the period-driven model that was declined at decision 4 —
   store each figure against its real month. Revisit when a different date range
   first arrives.
2. **Currency is assumed sterling.** The figures are sterling and the platform's
   own money fields (`plans.priceGBP`) make the same assumption, but the
   `systemSettings.currencySymbol` field exists and is not wired to the client.
3. **A superseded purge that fails leaves orphan rows.** They cost storage and
   nothing else — queries read the current import — but nothing currently
   cleans them up on a later run.
