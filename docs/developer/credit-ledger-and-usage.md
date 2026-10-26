---
product: Hakken
documentation_type: Developer guide
feature_area: credit ledger, pricing and Usage projections
audience: backend developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/credit-ledger-and-usage.md
last_reviewed: '2026-10-26T10:55:35+00:00'
reviewed_against: current implementation
status: Current
---
# Credit Ledger And Usage

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** credit ledger, pricing and Usage projections
> **Reviewed:** 26 October 2026, 10:55:35 GMT (Europe/London)
> **Source path:** `docs/developer/credit-ledger-and-usage.md` · **Status:** Current

The credit system records company usage, batch balances, adjustment lines and supplier-cost evidence. Its current phase monitors and accounts for work rather than refusing a request when credits run out. `creditLedger.ts` is the shared write service; customer projections are in `creditUsage.ts`, pricing oversight in `creditPricesAdmin.ts`, request hooks in `creditHooks.ts` and personal recurring-task charging in `hakkenTaskCredits.ts`. Read the [customer Usage guide](../end-user/credits-and-usage.md) for the screen-level workflow.

## Routes And Authorization

Customer routes are `/app/usage`, `/app/usage/work`, `/app/usage/websites`, `/app/usage/statement` and `/app/usage/coming-up`. They compose shared screen/table parts, month selection, localized usage words and CSV downloads. Customer APIs use `tenantQuery` and derive `ctx.companyId`; a missing active company yields null or an empty page as appropriate. Query arguments do not grant selection of another company.

The platform price screen is `/admin/settings/credit-prices`. `creditPriceReport` uses `superAdminQuery`, admitting SUPER_ADMIN and READ_ONLY under the current shared role wrapper. `saveCreditPrices` uses `superAdminMutation`, which permits SUPER_ADMIN writes. Source comments saying real-cost data is super-admin-only are narrower than that wrapper's actual oversight-read policy. Customer projection validators omit supplier cost and reused-value dollar fields; do not pass raw credit rows to a company screen.

## Tables And Indexes

`creditSchema.ts` declares `creditBatches`, `creditCharges`, `creditAccounts`, `creditPrices`, `creditSettings`, `creditMonthRollups`, `creditPlatformMonths` and `creditDayTotals`. Batches hold company, plan/topup source, grant/remaining values, dates and open/ended state. `by_company_state_ends` gives consumption order, `by_company_month` finds a plan grant and `by_state_ends` supports expiry sweeps.

Charges are the statement, with charge/grant/ended/refund/recount entry type, open/charged/void state, optional kind and website/user references, captured price, units, pending lines, credits in/out, paid-from batches, owed amount, balance and source identifiers. `by_run_key` supports logical-run reuse; `by_cycle_state` closes collection work. Customer statement reads use `by_company_at`, `by_company_kind_at` or `by_company_website_at`; open-work queries use company/state/time. The account table holds debt under `by_company`, rather than blocking work.

Monthly customer rollups are keyed by company/month/kind/website, platform months by month/kind and daily totals by company/day. They maintain read-efficient sums alongside the ledger. They are derived accounting records, not Stripe revenue tables. Plans can supply `monthlyCredits`, otherwise the platform `creditSettings` record and ten-thousand fallback apply. The schema's old UTC month comment is superseded by the actual Europe/London helpers in `creditKinds.ts`.

## Price And Unit Rules

`creditKinds.ts` defines nine kinds and provisional defaults: rankings four credits per thousand units; AI answers one per answer; keyword research five per unit; audit one per fifty pages; backlinks ten per thousand; assistant one per reply; alert/report checks one each; task research five each. These are code fallbacks, not a current commercial tariff. `readCreditPrice` prefers the saved per-kind row. `openCreditRun` snapshots that price, so later price edits do not rewrite old open or settled runs automatically.

`creditsForUnits` returns zero for nonpositive units, otherwise rounds up the proportional price with a small floating-point tolerance and a minimum of one. Thus a saved zero-credit price still produces one for positive units. The editor permits zero through one hundred thousand integer credits; documentation must not call zero free until a separate source/policy decision addresses this behavior. `creditCoversUsd` is a recommendation setting, not a cash conversion contract.

Unit selection distinguishes one-answer work from lists/crawls. `creditUnitsUpFront` initially counts zero for returned-row work and one for a single answer. `creditUnitsOfAnswer` uses returned rows when available, caps to requested size when defined and falls back to requested units for older missing counts. AI answers remain one regardless of text length. A crawl without a page limit can count the actual returned pages. No supplier request should be equated blindly with one customer unit.

## Batch And Charge Lifecycle

`ensurePlanBatch` ends inspected expired batches, resolves the UK month and inserts a missing monthly grant and its statement line. The grant is lazy, not a monthly cron that provisions every company at midnight. `creditMonthOf` and `creditDayOf` use Europe/London, with explicit UK-midnight conversion across DST. Open-batch reads are capped at fifty. `drawCredits` consumes soonest-ending live balances and writes the uncovered amount to `creditAccounts.owed`; it does not throw for insufficient credits.

`openCreditRun` finds an existing logical `runKey` before inserting work. `addToCreditRun` accumulates units, pending lines and cost evidence, and `closeCreditRun` computes the captured-price charge, draws batches, saves balance and moves rollups. Zero-unit work becomes void. `chargeCreditsNow` wraps this for immediately known units. These keys provide application idempotency for named logical work; they do not deduplicate all external business actions or replace upstream request identity.

A collection's key includes cycle, website and kind, grouping many request lines. Hooks count reused supplier data as customer work while separately recording reused-value evidence. Collection close waits when an answer is still pending; delayed settlement can change units/cost afterward. Keyword research uses a run key and recounts successful settled keywords; assistant hooks use a saved-message key, skip missing-company, widget and EVAL-purpose threads, and estimate real cost from model rates and saved tokens. The hook helper catches and logs credit-recording errors, leaving the originating work able to continue. Ledger completeness is therefore not guaranteed solely because the main operation succeeded.

`refundCreditCharge` refuses irrelevant/noncharged/zero-standing rows and checks whether a refund already exists. It restores paid parts to open source batches or the current plan batch when the source ended, reduces debt as applicable and appends a refund line rather than deleting history. `recountCreditRun` maintains later standing units/credits with adjustment entries. A supplier money refund and a Hakken credit adjustment are distinct operations; no automatic financial settlement is established here.

## Sweeps, Corrections And Limits

`credit-ledger-sweep` runs hourly through the job ledger. It ends at most two hundred due batches and inspects at most two hundred old open charges per tick. It leaves active collection work alone and normally waits for pending lines, giving up that pending wait after two days; the open grace is an hour. A single sweep is not a complete drain of every backlog, and a late answer can still need correction. `creditCorrections.ts` contains internal paged raise/recount operations with scheduler handoffs; these are operational mutations, not read-only diagnostics, and were not executed.

The schema can represent topups and the read path displays them, but a non-test source search found no normal topup insertion/purchase workflow. The found batch insertion is the plan grant. Do not infer a twelve-month purchase contract, payment collection or checkout from a schema comment alone. Stripe subscription handling, message quotas and the assignment-based inventory estimate remain separate systems.

The price report reads nine platform-kind rollups, bounded saved prices and one settings row. Its suggested price derives from supplier real cost plus reused value per unit, scaled by units per price and divided by the configured cover amount. A suggestion is applied to local form state and saved deliberately; it does not silently reprice from each report read. Updates audit individual changes as `CREDIT_PRICES_CHANGED`, with the next grant using changed monthly defaults; ordinary saved-price update does not lower or rewrite an already granted batch.

## Customer Projections And Forecasts

`usageSummary` reads at most nine hundred monthly rollups, fifty open batches and three hundred open/counting charges. The UI's `withCounting` adds estimated unsettled work to visible use, website/work totals and today's chart, subtracting it from plan left. These are presentation estimates beside settled accounting. Selecting an older month still returns some current bought/debt state, so not every field is a historical snapshot for that selected month.

`scheduledChecks` reads the newest nine hundred charges over forty-five days, groups settled scheduled work, infers recurrence from median gaps or a company schedule fallback, and omits work that appears stopped. Task forecast scans the newest three hundred company tasks and selects enabled alerts/reports. Competitor estimates inspect at most three hundred relevant lines from the old run and apply today's purchasing rules; audit can forecast zero. This is bounded inference, not a complete enumeration of live scheduled work or a supplier booking.

`usageStatement` chooses a company-leading time index and can narrow kind/site in that index. Person/search/additional conditions filter a paginated candidate page, reading at least two hundred candidates when narrowed. `useServerPagedTable` fill behavior handles short result pages without pretending to know a whole-table count. Statement line conversion names users/websites/batches and returns only the customer-safe shape. The UI download follows pages of five hundred until done or its fifty-thousand-result ceiling, without a separate truncation flag in that loop. It is not an unlimited archival export.

## Evidence And Maintenance

Relevant tests include `creditLedger.test.ts`, `creditUsage.test.ts`, `creditPricesAdmin.test.ts`, `creditCorrections.test.ts`, `hakkenTaskCredits.test.ts` and the Usage/credit-price look tests. This review inspected their contracts and source declarations without running them. It read current query/ledger/hook/forecast/configuration paths and registered cron behavior; it did not charge, recount, refund, contact Stripe or a supplier, or perform a live acceptance check.

When extending a work kind, preserve company scope, captured price semantics, logical run identity, adjustment history and the projection boundary for supplier-cost fields. Review the owning lifecycle and retention rather than deleting ledger rows to fix a discrepancy. This documentation-only pass introduces no behavior, price or roadmap change. Product decisions still required include owed-credit commercial treatment, a real topup workflow and the saved-zero-price behavior.

## Retention Manifest

`keepRules.ts` classifies accounts, prices and settings as owner records, and batches, charges, monthly/platform totals and daily totals as retained FOREVER ledger/history. The generic time-based purge register does not give these credit tables a routine expiry pipeline. This is the declared data-retention design, not evidence that every company-deletion or personal-data path has been independently audited here. Do not promise that ordinary log expiry or removing a tracked search erases its accounting history.
