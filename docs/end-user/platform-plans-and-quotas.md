# Platform Plans And Quotas

Platform plans define commercial tiers and monthly AI message allocations for Sonae tenants. Use this guide when creating or editing a subscription plan, assigning a plan to a company, explaining plan usage on a profile page, or investigating quota-related AI pauses.

For broader platform settings, see [Platform Operations Settings](./platform-operations-settings.md). For company setup and team handoff, see [Company Workspace Administration](./company-workspace-administration.md).

## Where To Find It

- `/admin/settings/plans`: plan catalog management for super admins.
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

Deletion is blocked when the plan is assigned to companies. Remove or change company assignments before deleting a plan.

## Assign Plans To Companies

Company plan assignment is managed from the company overview route. A company plan affects the company-level message pool and the plan status shown to users in that company.

Before changing a company plan:

- confirm the company name and id
- confirm the intended commercial package
- check current usage and message limit
- consider whether the change affects active users immediately
- record the reason in operational notes when it is part of a customer handoff

Plan assignment is not the same as user role assignment. A company can have admins and users regardless of the plan tier.

## User Plan Overrides

The backend supports user-level plan overrides. When a user has an override, their profile status uses the override before the company plan.

This is useful for special cases, but it can confuse support if it is not documented. When a user's usage does not match the company plan, check whether a custom user override is present.

## Profile Usage

The profile page shows the signed-in user's current plan name, monthly reset note, and AI message usage progress when a finite message limit exists.

If a finite plan reaches its message limit, non-critical AI interactions can pause until the next billing cycle. This is a product quota signal, not an authentication problem.

When a user reports that AI interactions are unavailable, check:

- current company plan
- user override plan
- messages used this period
- reset timing
- whether the user is in the expected company

## Billing Cycle Reset

Sonae has a backend monthly reset path for message usage counters. It resets company `messagesUsedThisPeriod` values and user override usage counters in batches.

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
