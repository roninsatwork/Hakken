---
product: Hakken
documentation_type: end-user guide
feature_area: plans quotas and company billing
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/platform-plans-and-quotas.md
last_reviewed: '2026-10-26T08:45:40+00:00'
reviewed_against: current implementation
status: Current
---
# Platform Plans And Quotas

> **Product:** Hakken · **Document type:** end-user guide · **Feature area:** Plans, quotas and company billing
> **Reviewed:** 26 October 2026, 08:45:40 GMT (Europe/London)
> **Source path:** `docs/end-user/platform-plans-and-quotas.md` · **Status:** Current

Platform plans define commercial tiers and monthly AI message allocations for Hakken tenants. Use this guide when creating or editing a subscription plan, assigning a plan to a company, explaining plan usage on a profile page, or investigating quota-related AI pauses.

For broader platform settings, see [Platform Operations Settings](./platform-operations-settings.md). For company setup and team handoff, see [Company Workspace Administration](./company-workspace-administration.md).

## Where To Find It

- `/admin/settings/plans`: plan catalog management for super admins.
- `/admin/companies`: company list; creating a company opens its own page at `/admin/companies/new`.
- `/admin/companies/[id]/overview`: company profile and plan assignment.
- `/app/profile`: signed-in user's plan and AI messaging usage.
- `/app/settings`: company-level usage and cost signals.

Plan catalog changes are platform administration actions. Company admins can see their usage context, but they do not manage the global plan catalog.

## What A Plan Contains

Each plan has:

- name
- optional description
- monthly message limit
- monthly price in GBP
- active or inactive status

A message limit of `-1` means unlimited. Active plans are available in plan pickers and status reads. Inactive plans remain stored but should not be treated as current options for new assignments.

## Manage The Plan Catalog

The plan catalog page supports search, paginated browsing, creation, editing, and deletion. The table shows plan name, message limit, price, status, and row actions.

When creating or editing a plan:

1. Choose a clear name that support and operators can recognize.
2. Add a description when the plan needs context.
3. Set the monthly message limit.
4. Set the GBP monthly price.
5. Mark the plan active only when it should be usable.

Deletion is blocked when a plan is assigned to a company or referenced by user overrides, configured billing offers, checkout records or billing history. A refusal protects existing access and financial references. Ask the platform operator to review the reference; do not delete billing history to make a plan removable.

## Assign Plans To Companies

Manual company plan assignment is a super-administrator action on the company overview. Company creation uses a dedicated new-company page. Stripe-managed companies follow billing reconciliation rather than unrestricted manual reassignment. A company plan affects the company-level message pool and the plan status shown to users in that company.

Before changing a company plan:

- confirm the company name and id
- confirm the intended commercial package
- check current usage and message limit
- consider whether the change affects active users immediately
- record the reason in operational notes when it is part of a customer handoff

Plan assignment is not the same as user role assignment. A company can have admins and users regardless of the plan tier.

## User Plan Overrides

The backend supports user-level plan overrides. For a company with valid paid access, or a manually managed company, profile status uses a user override before the company plan. A billing-managed company without paid access is blocked before the override is considered. An unlimited override cannot bypass an expired paid subscription.

This is useful for special cases, but it can confuse support if it is not documented. When a user's usage does not match the company plan, check whether a custom user override is present.

If a user record still points at a plan override that no longer exists, the profile plan status falls back to `System Default` instead of showing the company plan. Treat that as a data-cleanup signal rather than a commercial plan change.

## Profile Usage

The profile page shows the signed-in user's current plan name, monthly reset note, and AI message usage progress when a finite message limit exists.

If a finite plan reaches its message limit, the assistant chat send path records the user's attempted message and returns a soft quota-block assistant reply until the next billing cycle or a plan change. This is a product quota signal, not an authentication problem.

The profile page may describe the exhausted state as AI interactions being paused. In the current implementation, the enforced monthly counter is the assistant chat send path. Other AI-backed features can still have their own provider, validation, payload, public API, workflow, widget, or action rate limits, so treat the profile warning as a plan-usage signal rather than proof that every AI subsystem is blocked by the plan counter.

When a user reports that AI interactions are unavailable, check:

- current company plan
- user override plan
- messages used this period
- reset timing
- whether the user is in the expected company

Plan quotas meter assistant chat messages, with separate voice admission accounting in the receptionist path. They are not a universal counter for every AI feature. Other AI-backed workflows can have separate validation, provider, payload, public API, widget, or rate-limit failures, so do not assume every AI error is caused by the monthly plan counter.

## Billing Cycle Reset

Hakken has a backend monthly reset path for message usage counters. It resets company `messagesUsedThisPeriod` values and user override usage counters in batches.

Operators should treat reset behavior as a platform process. Do not manually edit plan usage unless there is a clear support or engineering reason and the effect is understood.

## Practical Guidance

Use plans for product packaging and quota control, not for role permissions. Roles decide what a user can access. Plans decide message allocation and commercial tier.

When preparing a launch or customer handoff, make sure:

- the correct plan exists
- the plan is active if it should be assignable
- the company has the intended plan
- first admins understand the message pool
- support knows whether any user overrides exist

When investigating quota issues, start from the user's company and profile usage before changing AI models, prompts, or provider settings.


## Company billing belongs in the normal application

Company administrators manage their own subscription at `/app/settings/billing`,
through Billing in the normal user frontend or Company Settings. They have zero
access to platform Admin. The subscription screen is not a reason to grant
somebody platform administration or let them impersonate a different company.
Members and read-only accounts cannot purchase a plan or open a company's
financial portal. An impersonating platform operator must leave impersonation
before using the financial management path available to their actual account.

Billing is optional. When it has not been enabled, the customer page explains
that it is unavailable. That does not prove the platform is broken or require
a company to attach a Stripe account. Each product deployment uses its
operator's one merchant account; customer companies subscribe to that product.
A manually assigned plan can continue using the manual arrangement instead of
being silently enrolled by a visit to the page.

Where checkout is available, choose one of the offered plans and continue to
Stripe's hosted checkout. The price shown for that offer comes from its
configured billing mapping. The plan catalog's GBP display price is not the
amount charged by every offer. Check the actual currency and monthly price in
the offer and hosted payment screen. The supported arrangement is a fixed
monthly company subscription, not per-seat, metered or annual charging.

## What happens after checkout

Returning from a hosted payment screen does not by itself confirm paid access.
Hakken reconciles provider state and confirmed paid-period evidence. The
Billing screen shows the recorded subscription state, whether access is active,
a paid-through date where known, and scheduled cancellation where applicable.
Use its refresh control when an authorized administrator needs an updated
status; avoid starting a second purchase merely because a return page has not
yet reflected the first.

An existing Stripe customer can open the hosted portal for the financial tasks
it supports, including payment methods, invoices, cancellation and permitted
plan changes. Stripe owns those financial records and calculates payment
adjustments. Hakken follows the confirmed mapped plan for product access. A
requested upgrade whose payment has not succeeded is different from an active
paid upgrade. A scheduled downgrade is also different from an already applied
plan change. Read the status rather than assuming that clicking a portal
option instantly changes the application's allowance.

A payment issue may permit a configured grace period, but this is not an
indefinite entitlement. Paid access is evaluated against its deadline. An
active label alone cannot grant access forever after the paid-through date
has passed. Disabling new checkout likewise does not turn an enrolled company
back into unlimited free access. If access is paused, the company administrator
should inspect Billing and the recovery portal or ask the operator about the
specific recorded problem.

## Counts, limits and safe support

A company subscription covers the company arrangement. The operator's count of
users covered by paid company subscriptions does not imply a separate charge
for every user. Paying-company counts, covered-user counts, message quotas,
credit balances and monthly subscription value are different quantities.
Monthly subscription value is a run-rate measure, separated by currency, not
collected revenue, profit or an invoice ledger. Do not add currencies together
or infer financial results from a displayed plan count.

The monthly message allowance is reset by the platform's calendar-month
process. A Stripe renewal or plan change does not automatically erase usage
already consumed in that month. When investigating a refusal, distinguish an
exhausted message allowance, missing paid access and a provider or tool error.
Increasing a message limit does not repair an unpaid subscription, and opening
a portal does not repair a third-party model outage.

The implementation preserves billing references when a company or plan is
being removed. A Stripe-managed company's deletion or manual reassignment can
be refused until an operator has deliberately reconciled and archived its
billing. This is a meaningful protection, not a reason to delete provider IDs,
financial history or local records by hand. Customer cancellation, company
removal and permanent financial-data cleanup are separate actions.

For support, provide the company, displayed subscription state, relevant date
and the action that failed. Do not share card details, hosted payment URLs,
provider keys or another company's records. Platform operators should follow
[Stripe Billing](../operator/stripe-billing.md), which separates local fixture
verification from real provider acceptance. The [developer guide](../developer/platform-plans-and-quotas.md)
explains status resolution and enforcement. No live Stripe acceptance or
production deployment was checked during this documentation review.
