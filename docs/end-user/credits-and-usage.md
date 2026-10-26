---
product: Hakken
documentation_type: User guide
feature_area: company credits and Usage
audience: workspace users, company admins and support
source_repository: roninsatwork/Hakken
source_path: docs/end-user/credits-and-usage.md
last_reviewed: '2026-10-26T10:55:35+00:00'
reviewed_against: current implementation
status: Current
---
# Credits And Usage

> **Product:** Hakken · **Document type:** User guide · **Feature area:** company credits and Usage
> **Reviewed:** 26 October 2026, 10:55:35 GMT (Europe/London)
> **Source path:** `docs/end-user/credits-and-usage.md` · **Status:** Current

Usage explains how the active company's work is recorded in credits: what the month has used, what is still being counted, which websites and work types account for it, and what future recurring checks are estimated to use. Open `/app/usage` from the customer sidebar. This is a company view, so it can include activity started by different people in that company. It is not a personal-only task list or a payment receipt.

Credits currently record usage without refusing work solely because the credit balance is exhausted. An uncovered amount is recorded as owed. Other limits still apply: a company message allocation, collection limits, feature access, provider quotas or an unavailable integration can independently stop work. Do not interpret continued work past a credit balance as proof that those controls have been disabled or that an automatic payment was taken.

## Overview And Navigation

The Usage overview provides a month selector, figures for allocation and use, a day-by-day chart, work-type breakdowns, websites and the checks behind their totals. Related routes are By work at `/app/usage/work`, By website at `/app/usage/websites`, Statement at `/app/usage/statement` and Coming up at `/app/usage/coming-up`. The detailed views let you move from a broad company total to a particular type of work, website or statement line.

The current overview includes work still being counted in its displayed use, website/check totals and remaining plan figure. That work has not necessarily been settled as a final statement charge. Look for the accompanying counting wording before comparing a running collection with its finished result. A collection can accumulate answers over several steps, and some of its supplier costs can arrive after its initial record was created.

Months and days follow Europe/London time. Monthly plan credits begin at UK midnight on the first and end at the next UK month boundary, including the seasonal clock change. This differs from a UTC supplier report and from the renewal period of a Stripe subscription. Select the same month and distinguish final from counting work before investigating a difference between screens.

## What Is Counted

The implemented kinds are rankings, AI answers, keyword research, site audit, backlinks, assistant answers, task alerts, task reports and task research. A credit is a usage unit determined by the saved price for that kind. It is not automatically one model token, one supplier request, one pound, one dollar or one company subscription seat.

For collection work, a statement charge groups a collection's website and kind of work. Several supplier requests can contribute to that one charge. List and crawl work normally counts returned rows/pages, capped by the requested amount when a cap is present, rather than always charging the largest requested size. An ordinary single AI answer counts as one unit. Older records whose returned-row count was never saved can fall back to the original requested units, so historical comparisons need care.

Shared supplier data can still count as a full customer usage unit even when another collection bought the underlying data. The platform separately records supplier cost and the value of reused data for its own review. Company Usage does not disclose those internal dollar fields. A low or zero incremental supplier expense is therefore not a promise that the customer usage charge is zero.

Ask Hakken's eligible company replies contribute an assistant charge keyed to the saved message. Public widget replies and evaluation-purpose threads are excluded from that particular hook. Keyword research can be counted again after results settle: keywords with no successful result can reduce the recorded charge, with a separate adjustment line explaining the difference. Do not assume every possible AI/tool/provider operation is covered simply because these named hooks exist.

## Allocation, Expiry And Owed Credits

A monthly plan batch is created when credit charging first needs it. The allowance comes from the company's assigned plan when that plan specifies monthly credits; otherwise it uses the platform default. The code's current fallback is ten thousand credits a month, but an actual saved plan or platform setting can differ. Before a batch exists, a display can show the expected allowance; seeing that figure is not evidence that a payment or grant mutation just ran.

Unused plan credits expire at the end of their month. The ledger keeps an ending line for the amount written off. It consumes open batches in soonest-expiring order and records any amount they cannot cover as owed. The owed figure is accounting state inside Hakken, not a Stripe invoice or automatic authorization to bill a card. The inspected implementation does not implement a credit-balance refusal gate or decide how that debt will be paid.

The data model and screens can represent bought top-up batches and their expiry. However, no current customer top-up purchase flow or production batch-creation path was found in the reviewed routes and backend. Do not tell a customer to use a Buy credits button or assume a displayed bought-credit field proves a completed payment. A separate commercial and implementation decision is needed before promising that workflow.

## Reading A Statement

The statement is a record of credits in and out. It distinguishes a charge for work, a plan grant, an expiry of unused credits, a refund and a recount adjustment. A line can show its time, description, person, source batch, credits in/out and balance after settlement. A line still being counted has an estimate of credits out without a settled balance. Keep the original and its adjustment together when explaining a corrected charge.

Use the month, work, website and person controls to narrow the view. Free-text search is also available. Statement data is read in pages from the backend, so a short current page is not a full archive. The shared table keeps reading when a filtered page needs filling. Downloads read further pages rather than exporting only the visible screen, but stop at a large configured row ceiling; they are not an unlimited accounting export.

Refunds return the recorded credits through the ledger, reducing owed amounts when applicable. If a source batch has already ended, the implementation can return credits into the current plan batch. A refund line does not undo the original external operation, restore deleted source data or establish that a supplier refunded money. It describes Hakken credit accounting. The current hooks can catch and log a recording failure without stopping the underlying workflow, so absence of a line is not conclusive proof that no work ran.

## Coming Up And Forecast Limits

Coming up shows recurring work and an estimate of credits through the rest of this month and the next. Alert and report tasks are read from their saved enabled state and next-check time. Other recurring checks are inferred from recent charged scheduled runs, using observed intervals or a company schedule fallback. This is a forecast, not a reservation of every future run or a promise that an integration will execute successfully.

The estimate reads bounded history and task lists. It can omit checks without a recent charged example, work outside the inspected window or rows beyond its limits. Current competitor purchasing rules can also reduce a future estimate compared with an older full collection. Manual work is estimated from recent pace rather than predicted from a user's intentions. Use it to understand likely demand; use the owning schedule/task screen to verify what is actually enabled.

## Permissions, Pricing And Support

Company Usage is scoped to the caller's active company. It does not accept an arbitrary company selector in the public customer queries. Platform Credit prices lives separately at `/admin/settings/credit-prices`. That page contains cross-company supplier-cost evidence and settings; company admins do not gain access to platform Admin because a Usage screen exists. Price-setting writes remain super-admin operations, while platform oversight read permissions follow the backend's actual read wrapper.

The supplied defaults are explicitly provisional implementation prices. They are not an approved public tariff or evidence of a live cash charge. Saving a new price applies to subsequently opened credit work; an existing charge retains its captured price. The price editor accepts zero, but the current positive-unit calculation still has a minimum charge of one credit. An operator must resolve that discrepancy before describing a zero price as free work. No pricing policy was changed by this documentation task.

For a discrepancy, record the selected month, company, relevant website/work kind, settled versus counting state and visible adjustment lines. Use the [billing guide](./platform-plans-and-quotas.md) for subscriptions and message allocation, and [Hakken Tasks](./hakken-tasks.md) for recurring personal workflows. This guide was verified from current routes, credit queries, ledger, price handling and tests as source; no purchase, charge, refund, live supplier operation or automated application test was performed.

## Retained Accounting History

Credit batches, statement lines and derived credit totals are declared retained accounting history in the current retention manifest. Ordinary operational-log expiry is not a promise that these records disappear on the same schedule. Pausing a check, removing a tracked search or resetting a browser conversation does not itself erase the related statement line. A separate personal-data request follows its own manifest and retained exceptions rather than the Usage screen acting as a delete-history tool.
