# Workspace Customer CRM Plan

Last reviewed: 2026-08-01
Status: Built. All three phases delivered and verified in the browser against
the 4,568-row Comax import.
Owner: Anthony

## Scope And Rules

**In scope:** a customer record inside the workspace section, made of three
screens — a searchable customer list, a customer profile holding the details
staff type in, and that customer's buying history drawn from the current
import.

**Out of scope:** orders. The import has no orders in it (see *What The Data
Actually Holds*). Also out of scope: editing imported sales rows, and any
settings screen for configuring which fields appear.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Server-side pagination only, and one `.paginate()` per Convex function —
  `npm run check:pagination` enforces the second.
- No client name in shipped code. This lives in the `salesData` vertical behind
  the existing module flag, reached at `/app/<workspace>/…`.
- Anyone in the workspace may read and edit customer details.

## Why This Plan Exists

Anthony, 2026-08-01: *"next tasks is to make a CRM out of the data insude the
comax section … a new screen for customper profile which will hold who they
are, tjheir address, telephine numbers, email adresss, then if its a care hoem
or hotel there will be a fiild for number of bedrrooms if its education thre
will nbe a field for nuenbr of pupuls … we need a customer search and also we
need to ssee what there orders are."*

The spreadsheet already knows who the customers are and what they buy. What it
does not hold is anything you would ring a customer with — an address, a phone
number, a contact. This plan adds that, keeps it beside the buying history the
import already provides, and makes the whole thing findable.

## What The Data Actually Holds

Measured against the current import, 2026-08-01, not assumed:

| | |
| --- | --- |
| Sales rows | 4,568 |
| Distinct account names | 39 |
| Distinct account codes | 40 (39 real, 1 spurious — below) |
| Distinct groups | 10 |
| Largest groups | Daish's Hotels (9), Exclusive Hotels (7), Luxury Care (6) |

Three things this changed:

1. **`groupName` is the owning chain, not a region.** `DAISH'S HOTELS`,
   `EXCLUSIVE HOTELS`, `COLTEN CARE`. So the data already has two levels —
   group, then account — and the CRM should show both.
2. **A customer is an account.** `accountName` is the individual business
   (`THE DEVONSHIRE HOTEL LTD`), `parentAccount` is its short code (`DEVONS`).
   Thirty-nine of them, which is a list a person can scroll — the screens
   should not be designed as though there were thousands.
3. **There is no order data.** Each row is one account against one product,
   carrying six monthly revenue figures and a quantity. No order number, no
   order date, no line items. "What they order" can therefore mean what they
   buy and what they spend, and nothing more, until a real orders feed exists.

### The spurious account code

Eighteen rows — source rows 54 to 71, one contiguous block — carry the literal
text `Product - C O L0` in the account code column instead of a code. Their
account names are correct, and all eight businesses involved have proper codes
on their other rows. It reads like a merged or dragged cell in the source.

This is why **the customer is keyed on the account name, not the account
code**: the name is clean and complete across all 4,568 rows, the code is not.
The code is still stored and shown, because it is what staff will quote. If the
source file is corrected, switching the key to the code is a migration, not a
redesign.

Worth fixing in the workbook regardless — those 18 rows would otherwise show as
a customer called `Product - C O L0` on any screen that groups by code.

## Decisions

Taken 2026-08-01 with Anthony, recorded so they are not relitigated.

1. **A customer is an account**, shown by account name, with its code and its
   group beside it. Group gets a heading on the list so a chain reads as a
   chain, and the profile links to its siblings.
2. **Profile details are typed into the app**, not imported. They live in their
   own table keyed to the account name, carrying no `importId`, so re-importing
   the sales file leaves them untouched. This is the point that would be lost
   by attaching them to the imported rows.
3. **Sales, split by month, with lines inside each month.** Anthony,
   2026-08-01: *"one customer may have many orders amd inside those orders are
   the order lines."* The shape is right — a customer has many periods, and a
   period has many lines — and it is the shape the screen is built to.

   What the file cannot supply is the order itself: it holds one aggregated row
   per customer per product, with six monthly totals and no order number or
   date. But it does hold the month, the customer, the product and the value,
   and
   Anthony, 2026-08-01: *"we can shpw the orders by month though as we hae the
   month and the product and the value and the customer."* So **the period is
   the month**: each month a customer bought anything is one expandable entry,
   and its lines are the products bought that month with their values. Every
   figure on it is read from the file; nothing is derived or apportioned.

   It is called **Sales**, not orders. Anthony, 2026-08-01: *"we dont call it
   ordes we call it sales and then split by month."* One month may have been
   one delivery or nine and the file does not say which, so "sales, by month"
   is exactly what the data supports and claims nothing more. When a real
   orders feed arrives, Orders becomes its own section beside Sales rather than
   replacing it — see *Known Limits*.
4. **The extra field is fixed by customer type.** Bedrooms for `CARE HOMES` and
   `HOTELS`, pupils for `EDUCATION - RESIDENTIAL` and `EDUCATION - NON
   RESIDENTIAL`. Anthony, asked whether a new type should need a developer:
   *"Needs me."* So it is a small table in code rather than a settings screen.
   A type matching neither rule simply shows no extra field.
5. **Anyone in the workspace may edit.** Same as importing today.
6. **Matching is on the normalised key**, as everywhere else in this vertical —
   the source spells the same value more than one way, and a lookup on raw text
   silently misses rows.

## Design

### Two changes made while building

**A derived account directory, `salesDataAccounts`.** The plan had the customer
list read the distinct accounts out of the sales rows. That is 4,568 rows read
to produce 39 names, on every page. The importer now writes one row per account
as the sales rows go in — folding each batch down first, so an account on two
hundred rows costs one write rather than two hundred — and the list is an
ordinary paginated table. It carries `importId` and is replaced with the rest of
the import, because nothing in it was typed by a person.

It also solved the account code honestly. Each directory row keeps a tally of
how many rows carried each spelling of the code, and shows the one most rows
agree on. On the current file that is `KINMAN` 142 against `Product - C O L0` 4,
and the same for the other seven affected accounts — the right code for all
eight, and it self-corrects if the workbook is fixed.

**`accountNameKey` on `salesDataRows`.** A customer's own sales could otherwise
only be found by scanning the import for a name match. The field is stamped on
import and backfilled onto existing rows, and an index on it is what makes a
profile read one account's hundred rows instead of the file's 4,568.

Both existing-data gaps were closed with migrations rather than by asking for a
re-import: `2026-08-01-sales-data-row-account-key` and
`2026-08-01-sales-data-account-directory`. Both are idempotent.

### The customer record

A new table, one row per account per workspace:

| Field | Notes |
| --- | --- |
| `companyId` | Leads every index, as everywhere in this vertical |
| `accountNameKey` | The normalised account name. The identity |
| `accountName` | As last seen in an import, for display |
| `accountCode` | `parentAccount`, for staff to quote |
| `groupName` | The owning chain |
| `customerTypeKey` | Which extra field applies |
| `addressLine1/2`, `town`, `postcode`, `country` | All optional |
| `phone`, `mobile` | Two numbers, both optional |
| `email`, `accountsEmail` | Two addresses, both optional |
| `contactName`, `contactRole` | Who to ask for |
| `bedrooms`, `pupils` | Whichever the type calls for |
| `notes` | Free text |
| `updatedAt`, `updatedBy` | Who last touched it |

Indexed by `companyId + accountNameKey` for the lookup, and
`companyId + groupName` for the chain view.

**Rows are created on demand, not seeded.** A customer with nothing typed in
yet has no row; the profile screen renders from the import and saves a row the
first time someone enters a detail. That keeps the table honest — a row means
somebody filled something in — and means a new customer appearing in a later
import needs no backfill.

### Sales, by month

No new table. The months come from the import's `periodLabels`, and the values
from the six period fields already on every sales row, so this is a way of
reading data that is already there rather than a second copy of it.

For one customer: read their rows from the current import, and for each of the
six periods sum the rows where that period has a value. That gives a month, a
total, and the products behind it. Months where nothing was bought are left
out — a blank cell in this source means no sale, not zero, and the two must
stay distinguishable.

Newest month first, each showing the month and its total, expanding to its
lines: product, category and value. One query for the months, a second for one
month's lines, because Convex allows one `.paginate()` per function and the
guard now enforces it.

**Quantity is not shown per month.** The file carries one quantity per customer
per product across the whole six months, not per month, so a monthly quantity
would have to be apportioned — and an invented number beside real ones is worse
than a missing one. Quantity stays on the six-month view, where it is true.

### The customer list and search

One screen, server-paginated, ordered by account name inside group. Search
matches, as a predicate on the ordered scan exactly as the sales table does:
account name, account code, group, town, postcode, phone, email and contact
name. Filters for customer type and group, combining, built the same way as the
filters delivered on the four data tables.

Thirty-nine customers fit one page today. It is still paginated, because the
next import is not promised to be this size and the sales table already proved
what happens when a screen assumes it is small.

### The profile

Three parts on one screen:

1. **Who they are** — name, code, group, type; the address and contact fields,
   editable in place. The extra field appears from the type.
2. **Sales** — newest month first, each month showing its total and expanding
   to the products bought that month with their values. Their six-month total
   sits above it.
3. **Their chain** — the other accounts in the same group, as links.

### Pagination and reads

Every list is a paginated Convex query. The buying history is paginated in the
same function as everything else on that screen only if nothing else on it
paginates — Convex allows one per call, `convex-test` does not enforce it, and
`npm run check:pagination` is what catches it. Any `.collect()` added for the
filter dropdowns is classified in the scale plan the way the existing ones are,
and never capped: a truncated dropdown silently drops values and reads as the
full list.

## Phases

1. **The record and the list.** Table, module-scoped queries, the paginated
   customer list with search and the two filters. No editing yet.
2. **The profile and editing.** The profile screen, the fields, the type-driven
   extra field, save. Rows created on demand.
3. **Sales and the chain.** Sales by month with their lines, the six-month
   total, and the sibling accounts.

Each phase ships with its own tests, and is verified in the browser against the
real import before it is called done.

## Known Limits

1. **Sales by month is not an order history.** It is what the workbook
   supports: a month, its total, and the products behind it. It cannot say how
   many orders made up a month, when in the month they were placed, or what was
   ordered but not delivered. If a real orders feed arrives — a file or a link
   to Comax's own system — Orders becomes its own section beside Sales, with
   its own tables, and nothing built here is wasted.
2. **No quantity per month.** The file carries one quantity per customer per
   product across the whole six months. A monthly quantity would have to be
   apportioned, so the monthly lines show value only and quantity stays on the
   six-month view.
3. **Customers are keyed on the account name.** If the workbook renames an
   account, its typed-in details do not follow. The account code would be the
   stabler key and is not usable until the 18 spurious rows are corrected.
4. **The extra field is fixed in code.** A new customer type, or a new question
   for an existing one, is a development job — decided deliberately.
5. **A customer that stops appearing in imports keeps its record.** Nothing
   deletes profiles, so an account dropped from the file is still findable.
   Whether that should show as dormant is not decided.
