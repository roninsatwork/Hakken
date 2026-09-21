# Property Research And Board Reports

This guide explains the property research and board-reporting features in Hakken. It is for client admins, operators, sales leaders, support teams, and anyone who needs to understand what users can do from the product screens. It describes the implemented product behavior only.

The feature area has two connected parts. The first part helps teams collect property listings from Rightmove through the Rightmove Agent, review saved listings, inspect individual property details, and monitor extraction jobs. The second part shows the latest generated sales board report, built from uploaded sales pipeline data and rendered as a visual executive dashboard. Full report-specific behavior is documented in [Sales And Board Reports](./sales-and-board-reports.md). Both parts are company-aware: users normally see the data for their own company workspace, while super admins can have broader visibility depending on their active context.

## Where To Find It

Open the main Hakken app and use the left navigation.

The Properties section contains three pages:

- Search, which queues a Rightmove Agent collection job.
- Scraped Data, which shows saved property listings.
- Logs, which shows recent extraction jobs and their status.

The Reports section contains Sales Report. This page shows the latest generated board report if one exists. If no report has been generated yet, the page explains that a pipeline CSV should be uploaded and the Sales Report Agent should be scheduled.

These pages are part of the authenticated app experience. Access still depends on the user's role and company setup. Users who are not signed in cannot use them, and users without the correct company or admin permissions may see no data or receive an access error.

## Property Search

The property search page is used to start collection from Rightmove. The workflow begins outside Hakken: go to Rightmove, run the search you care about, apply filters such as location, price, property type, tenure, parking, or other Rightmove options, then copy the search URL from the browser. In Hakken, paste that Rightmove URL into the Search page.

The form has two steps. Step 1 asks for the Rightmove URL. Hakken accepts HTTPS `rightmove.co.uk` property-for-sale search result links, not single property pages or unrelated Rightmove pages. Step 2 asks how many properties to gather. The screen supports 10 to 1000 properties. Choose a smaller number when testing a new search and a larger number when you are ready to collect a broader market sample.

When you press the gather button, Hakken queues a manual run for the active Rightmove Agent in the current company workspace. The request is asynchronous. That means the button starts the job; it does not wait on the page until every listing has been collected. The agent receives the Rightmove search URL and the property limit as its objective, starts collection, and stops rather than waiting for every listing. After a successful start, the page shows a success message and clears the URL. If the URL is invalid, the user has no active workspace, the Rightmove Agent is not configured or active, or another error occurs, the page shows an inline error message.

The search uses the filters contained in the Rightmove URL. Hakken does not provide a separate filter builder on this screen. If the resulting data looks broader or narrower than expected, check the original Rightmove URL and rerun the search with the right filters on Rightmove first.

## Extraction Logs

The Logs page is the place to check whether extraction jobs have completed. It shows recent jobs with their run id, status, dispatch time, finish time when available, and the number of properties scraped when known.

There are three status groups:

- In Progress means the job is still running or the latest known local status is pending.
- Completed means the extraction finished successfully and the results have been saved.
- Failed means the external run failed, was aborted, or timed out.

Pending jobs have a Sync Status control. The page also checks pending runs automatically about every 30 seconds while it is open. Syncing asks the extraction service for the latest run status. If the run has succeeded, Hakken imports the extracted dataset into the property database. If it has not succeeded yet, Hakken keeps the job pending or marks it failed when the external service reports a terminal failure.

Manual sync is still company-scoped. A normal company user can sync only a run that belongs to their active company workspace. If a run is no longer visible to the current workspace, or a user is in the wrong company context, the sync action can fail instead of importing data. Super admins can have broader sync access when they are working globally.

If the Logs page is empty, no extraction jobs visible to your current workspace have been dispatched yet. Start from the Search page, submit a Rightmove URL, then return to Logs to follow the run.

## Scraped Data

The Scraped Data page is the main property inventory. It lists saved Rightmove properties in a table and is designed for quick scanning. Each row can show a thumbnail, property address, property type, listing agent, price, bedroom count, bathroom count, and row actions. The table uses 15 rows per page. Use the next and previous controls at the bottom of the table to move through the inventory.

The search box filters by address. This is useful after a large extraction when you want to find a street, town, postcode fragment, or recognizable address term. Search resets the table back to the first page so users do not remain on an empty later page after narrowing the results.

When there are no saved properties, the table shows an empty state telling you to run a new search. When a search term does not match any property address, the empty state explains that the current query returned no results.

Each row has a View Details action. This opens the property detail screen for that saved listing. Each row also has a Delete action. Delete opens a confirmation modal that names the property address. Confirming removes the saved property row from Hakken. It does not delete anything on Rightmove, stop an extraction run, or remove historical run logs. Deletion cannot be undone from the product screen, so use it only for records that should no longer be available in the workspace.

## Property Detail Screen

The property detail page gives a richer view of a single saved listing. It starts with the main listing image when available, the address, the price, and badges such as a product label or price reduction. If no image was collected, the page shows a no-image state instead of leaving the area blank.

The Market Intelligence section appears when the underlying data is available. It can show listed date, status text from the listing, estimated size, and calculated price per square foot. Price per square foot is calculated only when both price and usable size data exist. Because this information comes from the extracted listing data, some cards may be missing on listings where Rightmove or the extraction response did not provide those fields.

The specs area summarizes property type, bedrooms, bathrooms, EPC rating when available, and a map link when coordinates were collected. The map link opens Google Maps using the saved latitude and longitude. The description area formats the listing description for reading. Below that, users may see key features, floorplans, and an image gallery. Floorplans and gallery images open their source image links in a new tab.

The right-side listing-agent panel shows the agent name, phone number when available, a link to the original Rightmove listing, and an agent profile link when one was collected. This makes the detail page useful as a lightweight research record rather than only a data row.

If a property cannot be found or the current user does not have permission to view it, the page shows a property-not-found style state. A user should not expect to inspect another company's listings from a normal company workspace.

## Board Reports

This section is a summary. For the complete report guide, use
[Sales And Board Reports](./sales-and-board-reports.md).

The Sales Report page shows the latest generated report for the user's accessible scope. It is intended for executive pipeline review rather than raw data entry. A generated report is created by a configured Sales Report Agent using pipeline CSV data that has been uploaded to that agent's knowledge area. The page does not upload the CSV itself and does not manually run the agent from this screen.

If no report exists, the page shows No Reports Available and explains that a pipeline CSV should be uploaded and the Sales Report Agent should be scheduled. Once a report exists, the page switches to the board report dashboard.

The report begins with an executive headline and summary. Below that are KPI cards such as total pipeline, weighted pipeline, open deals, average deal size, cycle days, and win rate. Older reports may only contain a reduced set of KPI fields; Hakken still displays those reports with a safe fallback rather than hiding them.

The Closing Windows section visualizes upcoming pipeline value over time and highlights top deals to watch. The Pipeline Health section breaks down value by stage and by sales rep, with observations for each group. The Risk Radar section groups deals into categories such as critical, at risk, and quiet, with reasons and recommended actions. The Team Spotlight section calls out momentum and coaching needs. Patterns and Signals captures non-obvious observations from the pipeline data. This Week's Priorities turns the analysis into a short action list.

The Export to Board button downloads a PNG image of the report dashboard. The file name includes the current date. This is a visual capture of the page, not an editable spreadsheet or slide deck. For best results, let charts finish loading before exporting.

## Permissions And Company Boundaries

Properties are company-scoped. A company admin or user sees property records and extraction runs for their active company. A super admin with no active company context can see records across companies in some property views. If a super admin is operating inside a company context, behavior can be scoped to that active company. Starting a new Rightmove collection requires an active workspace because the Search page queues a company-scoped Rightmove Agent run. Operators should confirm the intended company before dispatching a collection from an admin account.

Board reports require admin-level access. Company admins see the latest report for their company. Super admins see the latest report available globally. Standard users should not rely on access to executive reports unless their role and workspace configuration explicitly allow it.

The tenant boundary matters in practical use. If a colleague says they can see a listing or report that you cannot, first confirm that you are in the same company workspace and that you have the right role. If data was recently imported, refresh the page or check Logs to make sure the extraction completed.

## Data Created And Changed

Starting a property extraction from the Search page creates an agent run first. When that agent starts the underlying extraction service, Hakken records the extraction run. When the run succeeds, Hakken saves property records for the listings returned by the extraction service. If the same Rightmove listing is collected again for the same company, Hakken updates the existing saved row with fresh data instead of creating a duplicate. The same listing can still exist separately for different companies.

Saved property records can include address, price, property type, bedroom and bathroom counts, original URL, images, floorplans, description, features, EPC rating, coordinates, agent details, listing dates, update reason, product label, size fields, and scrape time. Not every listing contains every field.

Deleting a property removes the saved record from Hakken. It does not remove the extraction log. It also does not affect Rightmove or the external extraction service.

Generated board reports create report records in Hakken. The report stores the generated headline, summary, metrics, charts, risk items, team notes, patterns, priorities, and creation time. The report is based on the pipeline data and AI rules available when the agent ran. If the pipeline CSV or model configuration changes later, the existing report does not automatically rewrite itself; a new agent run is needed to produce a new report.

## Common Operating Guidance

Start small when testing Rightmove extraction. Use a narrow Rightmove search and a lower max-property limit first, confirm that the data lands in Scraped Data, then increase the size of the next run if needed.

Use Logs before assuming a search failed. A successful start message means the job was dispatched, not that all rows are already visible. If the job remains in progress, use Sync Status or leave the page open long enough for automatic checks. If the job fails, rerun with a smaller search or ask an operator to check extraction configuration.

Use address search to clean up or inspect imported batches. If a listing is clearly irrelevant, delete it from Scraped Data after confirming the address in the modal. If many listings are incorrect, it is usually better to review the Rightmove source search than to delete rows one by one.

For reports, keep the source pipeline CSV current and make sure the Sales Report Agent has been scheduled or run by the admin team. The Reports page is a viewing and export surface. It is not the place where report inputs, AI model choice, or schedules are configured.

## Caveats

Rightmove listings and external extraction services can change independently of Hakken. A property detail page reflects the data captured at extraction time or during the latest update for that listing. Use the original listing link when you need to verify the live Rightmove state.

The report is AI-generated from structured input and rules. It is designed to summarize pipeline signals quickly, but leaders should still review source pipeline data before making material commercial decisions. Missing, stale, or inconsistent pipeline CSV data can lead to weak or misleading report sections.

The current export creates an image. If a board pack needs editable slides, tables, or a formally generated PDF, use the PNG as a visual artifact and keep the original Hakken report available for review.
