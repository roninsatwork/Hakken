# Sales Data Workspace

Sales Data is an optional workspace area for importing a workbook, reviewing the
rows it contains, enriching customer records, finding prospects, and producing an
opportunity report.

The current workspace routes use the workspace name in the URL:

- `/app/<workspace>/spreadsheet-import`
- `/app/<workspace>/import-data`
- `/app/<workspace>/customers`
- `/app/<workspace>/customers/<account>`
- `/app/<workspace>/opportunity-report`

Older `/app/sales-data` links redirect into the current workspace import flow.

## Importing A Workbook

The import screen uploads a spreadsheet and then asks which worksheet maps to
each dataset. It does this because the sales worksheet name can change between
files, so guessing from the worksheet name would be unreliable.

The import expects four datasets:

- sales rows
- category links
- areas of interest
- frequency data

Upload and import are separate steps. Uploading inspects the workbook. Importing
replaces the workspace's current sales-data import and records the row counts,
skipped rows, file name, and period labels.

## Reviewing Imported Tables

The imported-table screen shows one tab per dataset. The sales table keeps the
source row order and displays the source row number so a row on screen can be
matched back to the spreadsheet.

Search and filters run on the server. Switching tabs clears filters because each
dataset has different columns. Tables are paginated, and only the visible tab's
query runs.

## Customers

The customer list shows one row per account, grouped by chain and account name.
It can filter by customer type, group, and record status:

- customers from the workbook
- prospects discovered later
- suspects
- all records

The action row intentionally keeps only the main demo actions: clear data and
import spreadsheet. Customer research actions appear in their own research row.

## Customer Profiles

Customer profiles separate imported workbook facts from typed-in details.
Imported facts such as account code, group, customer type, spend, product lines,
and sales history come from the workbook and cannot be edited on the profile
screen. Contact fields, notes, website, address details, and customer-type
specific fields are editable and survive re-imports.

Research findings are shown separately. A finding can be applied or rejected so
the profile keeps provenance for AI-discovered details.

## Research And Prospecting

Sales Data can start customer research sweeps, prospecting sweeps, and market
discovery jobs. These jobs use the workspace's sales data and discovered web
evidence to fill missing customer details, find related group sites, and create
prospects for sites the workspace does not currently supply.

Research results should be reviewed before treating them as final. Confidence,
source names, source URLs, and reasoning are part of the evidence.

## Opportunity Report

The opportunity report estimates the value of converting prospects and closing
chain/product gaps. It shows:

- headline totals
- sections for new business and upsell opportunities
- ranked chains and sites
- product gaps and named sister-account comparisons
- exceptions or caveats
- an AI-written summary when the report has completed

The report can be exported as an image. During export, collapsed sections are
opened so the downloaded file contains the full report, not just the visible tab.

Every number displayed by the report is stored on the report row. The screen
groups and presents those rows, but it does not invent totals in the browser.

## Clearing Data

Sales Data includes clear/reset actions for the workspace. These are destructive:
they remove imported workbook rows, customer/prospect records, research jobs,
research findings, market-discovery data, and opportunity report data depending
on the selected clear action.

Only use clear actions when the workspace is deliberately being reset for a new
import or demo.
