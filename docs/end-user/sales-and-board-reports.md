# Sales And Board Reports

This guide explains Sonae's implemented sales report and board-reporting
feature. It is for company admins, sales leaders, operators, and support teams
who need to know what the product does from the user-facing screens.

Sales and board reports are separate from property research. Property research
collects and reviews Rightmove listings. Sales reports turn a sales pipeline CSV
and supporting knowledge into the latest board-ready pipeline report.

Workspace opportunity reports are part of the sales-data workspace area. They
use the imported customer spend, researched customer or prospect sizes, and
found prospects to estimate where more revenue may exist inside known groups.

## Where To Find It

Open the authenticated Sonae app and use the Reports section.

There are three report pages:

- **How Board Reports Work** at `/app/reports/information`, which explains what
  the report reads, remembers, and produces.
- **Sales Report** at `/app/reports`, which shows the latest generated report
  available to the current workspace.
- **Opportunity Report** at `/app/<workspace>/opportunity-report`, which sits
  beside the workspace customer area for workspaces with the sales-data section
  enabled.

The report viewer is not a data-upload screen and it is not the place where
agent schedules are configured. It displays the latest report that already
exists. If no report has been generated yet, the page shows `No Reports
Available` and tells the user to upload a pipeline CSV and schedule the Sales
Report Agent.

The Opportunity Report page is different: it has its own run button because it
builds a report from the workspace sales-data import and the current prospect
list, rather than from the Sales Report Agent's pipeline CSV.

## What The Report Uses

A generated report is produced by a configured Sales Report Agent. The agent
uses the newest knowledge document attached to that agent as the main pipeline
source. In normal use, that document is a CSV export of the team's sales
pipeline.

The report can also draw on:

- agent instructions and the agent's system prompt;
- active AI rules that apply to the company or agent;
- agent memories from previous work;
- company memories;
- relevant passages from uploaded knowledge documents.

Every figure in the report should come from the uploaded pipeline data. The
agent may use company knowledge and memory to sharpen recommendations, but it
should not invent pipeline numbers.

## Information Page

The information page explains the feature before a user opens the generated
report. It describes the report as one agent reading the team's pipeline,
company knowledge, and memory, then producing a board-ready output.

The page covers:

- what the user needs to provide;
- why figures should be traceable to the pipeline;
- how the report stays comparable from week to week;
- how the agent uses knowledge and memory;
- what the main report sections mean;
- how often reports can be generated;
- why a user might see the empty state.

It also links directly to the latest report page.

## Latest Report Page

The latest report page has three practical states.

The loading state appears while Sonae is checking for the latest report. The
empty state appears when no report is available to the current user's workspace.
The dashboard state appears when a report exists.

The dashboard starts with an executive headline and summary. Below that it shows
the report's structured sections:

- pipeline at a glance, including total pipeline, weighted pipeline, open deals,
  average deal size, sales cycle days, and win rate when available;
- closing windows, showing deal timing and weighted value;
- top deals to watch;
- pipeline health by stage;
- pipeline health by sales rep;
- risk radar, grouped into critical, at-risk, and quiet deals;
- team spotlight, including momentum and support-needed groups;
- patterns and signals;
- this week's priorities.

Older reports may not contain every structured section. When Sonae finds a
legacy report with only the older report shape, it still shows a safe reduced
view instead of hiding the report completely.

## Opportunity Report Page

The Opportunity Report answers two practical questions for a sales-data
workspace:

- which known prospects might be worth most if they became customers;
- which products are being bought by sister accounts in the same group but not
  by a specific customer.

The page starts with headline totals and progress or status for the current
opportunity-report run. It then shows ranked sections for prospect opportunities
and group gaps. Prospect rows explain how each estimate was priced: ideally from
similar-sized customers in the same group, otherwise from customers of the same
type, and with weaker confidence when the prospect has no bedrooms or pupils on
file.

Group gap rows show which product categories a customer is missing, how many
sister accounts buy them, and which sister accounts were used as the comparison.
That named comparison matters: it lets a sales user check the recommendation
against real accounts instead of seeing only a count.

The report is most useful after the customer research job has filled or checked
bedrooms for hotels and care homes, and pupils for schools. If those numbers are
missing, Sonae still shows the opportunity, but the estimate falls back to a
less precise average and should be treated as weaker.

## Export To Board

The `Export to Board` button downloads a PNG image of the visible report
dashboard. The file name includes the current date in the form
`sonae-board-report-YYYY-MM-DD.png`.

This export is a visual capture. It is not an editable spreadsheet, PowerPoint
deck, or PDF. Let the charts finish rendering before exporting, especially after
opening the page or refreshing the browser.

Some chart panels may also have their own chart export controls. The main
`Export to Board` action captures the whole report container.

## Permissions And Company Boundaries

Sales reports require admin-level access. Company admins see the latest report
for their active company. A super admin without an active company context can
see the globally latest report, regardless of company. Standard users should not
expect access unless their role and workspace configuration grant it.

If two users see different reports, first check their company workspace and
role. A generated report is stored against the company context used when the
agent ran. Changing a CSV, rule, model, or memory later does not rewrite old
reports; a new agent run is needed to generate a new result.

The Opportunity Report is scoped to the active workspace and current sales-data
import. It should not be used across companies, and a re-import changes the
customer spend snapshot the next report will use.

## Common Operating Guidance

Keep the source pipeline CSV current before a scheduled board cadence. If the
pipeline export is stale, incomplete, or inconsistent, the report can surface
weak or misleading conclusions.

Use the same pipeline fields and naming conventions from run to run where
possible. Stable CSV structure makes week-on-week comparison easier and helps
the agent keep the report format consistent.

Add supporting knowledge gradually. Pricing notes, sales playbooks, account
context, and board priorities can help the report explain why numbers matter.
They should support the pipeline; they should not replace clean pipeline data.

When the page says there are no reports, check that the Sales Report Agent has a
pipeline CSV in its knowledge area and that the relevant schedule or manual run
has completed.

When an opportunity report looks thin, check whether prospects have been found
and whether the customer research job has filled bedrooms or pupils. Those fields
drive the stronger per-unit pricing.

## Caveats

The report is AI-generated. It is designed to compress pipeline signals into an
executive view, but sales leaders should still review the source pipeline before
making material commercial decisions.

The current product shows only the latest available report for the user's scope.
It does not provide a report archive, compare previous reports, or manually
trigger report generation from the report viewer.

The current export is a PNG. If a board pack needs editable tables, slide
masters, speaker notes, or a formal PDF, use the PNG as a presentation artifact
and keep the Sonae report available for review.
