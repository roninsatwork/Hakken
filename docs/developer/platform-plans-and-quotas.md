---
product: Hakken
documentation_type: developer guide
feature_area: plans quotas and company billing
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/platform-plans-and-quotas.md
last_reviewed: '2026-10-26T08:45:40+00:00'
reviewed_against: current implementation
status: Current
---
# Platform Plans And Quotas Developer Guide

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Plans, quotas and company billing
> **Reviewed:** 26 October 2026, 08:45:40 GMT (Europe/London)
> **Source path:** `docs/developer/platform-plans-and-quotas.md` · **Status:** Current


Optional Stripe billing now uses these plans. Read [Stripe Billing](../operator/stripe-billing.md) for company enrollment, paid access before quota overrides, calendar-month allowances and recovery. Manual companies retain the behaviour described below; billing-managed companies additionally require a confirmed paid period. Plan deletion also checks user overrides and billing references.

Platform plans define subscription tiers, monthly message limits, pricing display values, company plan assignment, user overrides, and billing-period message counter resets. Read this before changing `convex/plans.ts`, `convex/planService.ts`, plan schema fields, company plan assignment, profile usage displays, or the plan catalog UI.

For user and company management boundaries, see [Company And User Management](./company-user-management.md). For settings and white-label packaging, see [System Settings And Branding](./system-settings-and-branding.md).

## Product Surface

Plan-related routes:

- `src/app/(dashboard)/admin/settings/plans/page.tsx` manages the global plan catalog.
- `src/app/(dashboard)/admin/companies/page.tsx` lists companies; creation opens `/admin/companies/new`, and existing manual assignment is on the company overview.
- `src/app/(dashboard)/admin/companies/[id]/overview/page.tsx` assigns a plan to a company.
- `src/app/(dashboard)/app/profile/page.tsx` shows the signed-in user's plan status and message usage.
- `src/app/(dashboard)/app/settings/page.tsx` shows company usage and cost context.

Backend modules:

- `convex/plans.ts` exposes plan reads, catalog mutations, company/user status queries, and billing reset internals.
- `convex/planService.ts` contains plan-status resolution and plan record helpers.
- `convex/chatService.ts` resolves chat quota targets, detects exhausted finite quotas, and increments the relevant usage counter after a send passes validation.
- `convex/chat.ts` applies the quota check in the assistant chat send mutation.
- `convex/companies.ts` owns company plan assignment through `assignPlanToCompany`.
- `convex/utils/inventoryRollupService.ts` keeps global inventory plan and MRR totals aligned.

## Data Model

`plans` rows store:

- `name`
- optional `description`
- `messageLimit`
- `priceGBP`
- `isActive`
- `createdAt`

The table is indexed by active state, creation time, and name search. A `messageLimit` of `-1` represents unlimited usage.

Company rows can hold `planId` and `messagesUsedThisPeriod`. User rows can hold `planOverrideId` and `messagesUsedThisPeriod`.

## Plan Reads

`getPlans` requires any authenticated user and returns up to the bounded catalog limit.

`getActivePlans` requires any authenticated user and returns active plans only.

`getPaginatedPlans` requires a super admin. It supports name search through `search_name` and otherwise pages by `by_createdAt` descending. The admin UI uses `ADMIN_PAGE_SIZE`.

`getMyCompanyPlanStatus` resolves the signed-in user's status. The query first checks `billingBlocksPaidAccess`; a blocked managed company returns `Payment required`. Otherwise user plan overrides win before company plan status. If no override or company plan applies, the result is `System Default` with unlimited messages.

`getCompanyPlanStatus` checks `canAccessCompany` before returning a company plan status. Foreign company admins receive `null`.

## Plan Mutations

`createPlan`, `updatePlan`, and `deletePlan` use `superAdminMutation`. The paginated catalog uses `superAdminQuery`; ordinary catalog reads use tenant-aware builders.

`createPlan` builds the plan record through `buildPlanRecord`, inserts it, then upserts global inventory plan totals.

`updatePlan` patches supplied fields and upserts the plan in global inventory totals.

`deletePlan` refuses deletion when any company is assigned to the plan. It reads up to 101 assigned companies and formats the error count with a cap of 100. It also refuses user override, configured offer, checkout and billing-account references. Only an unreferenced plan is deleted and removed from global inventory totals.

User override references are not checked in the current delete guard. If override deletion semantics become important, add implementation and test coverage before documenting stricter behavior.

## Company Assignment

`companies.assignPlanToCompany` validates the target company and plan, patches the company `planId`, and updates global inventory rollups for old and new plan assignments. The company overview calls this mutation for manual assignment; the company list now opens a dedicated creation page rather than the former company create/edit modal.

Plan assignment is a super-admin company management action. Do not expose company plan assignment to tenant admins without a product decision and explicit authorization tests.

## Status Resolution

The public status query checks paid access first. After that, the pure helper `getPlanStatusFromUser` resolves in this order:

1. If `user.planOverrideId` exists, return `Custom {plan.name}` when the override row exists, otherwise `System Default`; use the user's own `messagesUsedThisPeriod`.
2. If the user has `companyId`, return company status from `getPlanStatusFromCompany`.
3. Otherwise return `DEFAULT_PLAN_STATUS`.

`getPlanStatusFromCompany` returns the company plan name and limit when a plan exists, otherwise `System Default`; usage comes from `company.messagesUsedThisPeriod`.

This means a missing override does not fall back to the company plan. Preserve that behavior unless a product decision changes support expectations.

Chat quota resolution is intentionally implemented in `convex/chatService.ts`, not in the profile status helper. `resolveChatQuota` checks a valid user override first, then falls through to the stored company plan when the override row is missing, and finally returns unlimited usage when neither target has a valid plan. Keep this distinction in mind when changing deleted-plan or cleanup semantics: profile display can show `System Default` for a dangling override while the chat send path may still meter against the company plan.

## Chat And Reception Voice Enforcement

The monthly plan counter is enforced in `chat.sendMessage` and in completed
Receptionist kiosk voice turns.

Before quota enforcement, the mutation verifies thread access, attachment policy and the per-thread user-message rate limit. `resolveChatQuota` checks paid access for the effective company before resolving any user override. It then resolves the quota target:

- valid user override: use the user's override plan and increment `users.messagesUsedThisPeriod`
- valid stored company plan: use the company plan and increment `companies.messagesUsedThisPeriod`
- no valid plan target: allow unlimited usage without incrementing a usage row

When a finite quota is exhausted, the mutation still records the attempted user message, inserts an assistant soft-block message, updates the thread timestamp, and returns without running model generation. Signed-in app threads are told that the company AI allocation is exhausted and directed to an administrator. Anonymous widget threads receive only a generic temporary-unavailability notice so the customer's billing state is not disclosed publicly. The widget notice carries `systemKey: "quotaRefusal"` for browser-language presentation. PII redaction runs before this quota branch, and a successful send increments the selected usage counter before normal message insertion.

Receptionist voice is metered by the relay rather than by the kiosk browser.
The relay reserves one company-plan unit only when non-silent PCM begins a
turn, finalizes it once on Vertex `turnComplete`, and refunds it if the session
closes first. The next turn is refused before audio reaches Vertex when the
finite allowance is exhausted. Phone calls remain separately charged once per
admitted call.

Do not describe plan quotas as a global AI feature gate unless more call sites are wired to `resolveChatQuota`, `isChatQuotaExceeded`, and `incrementChatQuota`. Provider rate limits, public API limits, workflow payload limits, upload limits, and widget upload quotas are separate controls.

## Billing Reset

`resetBillingCycle` is an internal mutation. It resets company usage counters and user override counters in batches.

Batch behavior:

- company batch size is `500`
- user batch size is `500`
- companies with non-zero `messagesUsedThisPeriod` are patched to zero
- users with `planOverrideId` and non-zero `messagesUsedThisPeriod` are patched to zero
- continuation cursors schedule follow-up internal mutations immediately

The reset is not exposed as an arbitrary admin button in the current plan catalog page. If a manual reset UI is added, it should be explicit, audited, and tested.

## Inventory Rollups

Plan create/update/delete and company assignment update global inventory rollup records. This powers admin overview inventory and MRR signals.

When adding a new plan lifecycle path, keep inventory rollups aligned. If rollups drift, the current maintenance script `inventory-rollup-rebuild` can recalculate inventory from current companies, users, and plans.

## UI Notes

The plan catalog page uses shared admin table primitives and `AdminConfirmationModal`. It avoids native browser dialogs and surfaces errors through the shared feedback components. Its current plan-edit path still mounts lazy-loaded dialogs; that implementation differs from the repository rule that editors with fields should be pages. Record that discrepancy for product/UI review; documentation work must not silently convert the screen.

Most visible strings are localized under the admin plans namespace. The current plan row status labels still render as literal English `Active` and `Inactive` strings in `src/app/(dashboard)/admin/settings/plans/page.tsx`; treat that as implementation debt and localize those labels if the page is touched. Keep `messages/en.json` and `messages/it.json` in parity when changing localized copy.

## Verification

Focused tests:

- `convex/plans.test.ts`
- `convex/planService.test.ts`
- `convex/companies.test.ts` for company plan assignment behavior
- `convex/maintenanceScripts.test.ts` for inventory rebuild behavior
- settings/admin UI tests when changing `src/app/(dashboard)/admin/settings/plans/page.tsx`

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run test:coverage
npm run coverage:check
npm run test:e2e:smoke
npm run build
git diff --check
```


## Company billing entry points and authority

`convex/billing.ts:getStatus` is a soft query: signed-out or ineligible callers
receive no financial status. The handler requires an ADMIN or SUPER_ADMIN with
an actual company and refuses impersonation. It returns the current offer
choices, access result, customer presence, paid-through date and whether a new
checkout is permitted. The frontend at
`src/app/(dashboard)/app/settings/billing/page.tsx` invokes
`billingActions.createCheckout`, `createPortal` and `refresh` without accepting
client-supplied customer IDs, amounts or company ownership as authority.

`billingCompany` in `billingPolicy.ts` owns that actual-account restriction.
Platform operator APIs separately call `requireBillingOperator` and use
super-admin builders. Setup and oversight are under `/admin/settings/billing`,
not an Admin grant to company administrators. Preserve the distinction even
when a super administrator can read many companies elsewhere in the app.

`billingConfig` reads the saved `billingSettings` row at key `stripe`, falling
back to `hakken.billing.json` only when no saved settings exist. Both paths use
`parseBillingConfig`. A JSON edit cannot be assumed to override saved runtime
settings. `requireBillingConfig` additionally rejects a disabled self-service
module. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are backend environment
credentials, not part of the saved non-secret configuration or an editable
customer field.

## Paid access, reconciliation and retry safety

`hasPaidAccess` and `paidAccessDeadline` evaluate confirmed paid periods and the
configured past-due grace policy. A stored `accessExpiresAt` on a past-due
account is authoritative until reconciliation updates it, with a scheduled
invalidation at its deadline. An active status still requires an unexpired
`paidThrough`. `billingBlocksPaidAccess` applies to enrolled accounts even if
new checkout is later disabled. Check this before a message override; an
unlimited user plan must not grant unpaid company access.

`billingCheckout.ts` uses durable checkout attempts, leases/revisions and
provider idempotency keys. Existing customer/session bindings are recovered
before starting replacements. A current unfinished checkout cannot simply be
switched to another offer, and ambiguous bounded provider history requires
operator reconciliation. `safeStripeUrl` permits the expected HTTPS checkout
or billing host; an arbitrary provider-returned redirect is not trusted.

`billingReconciliation.ts` reads current Stripe state under the company's
lease. It does not interpret webhook arrival order as payment authority.
`billingPayments.ts` establishes confirmed paid-period evidence and recovery
rules. `billingState.ts` applies the projection, related plan change and
scheduled expiry. A hosted return URL, a received event or a subscription
label alone is not proof that an upgrade was paid. Preserve this distinction
in fixture tests and support tooling.

`billingHttp.ts` bounds the webhook body and passes verified events to the
component adapter. The runtime SDK currently sends
`2026-05-27.dahlia` from `billingStripe.ts`; package SDK types and a Stripe
endpoint's API version are separate concerns. The repository pins Stripe
22.6.2 and `@convex-dev/stripe` 0.1.7. An installed package version does not
establish live endpoint registration or a successfully verified event.

`billingSchema.ts` defines accounts indexed by company, customer, plan,
sync time, mode/status and price/plan, plus checkout/configuration/history
records. Company deletion and manual plan reassignment check for managed
billing history, and plan deletion also checks active/historical references.
Do not remove those rows to force an operation past its refusal. Recovery
and financial archival require a separately authorized operator workflow.

## Reporting and verification boundaries

`billingMetrics.ts` counts paying companies using confirmed paid state and
counts covered registered company users separately. Neither is a per-seat
charge. Monthly subscription value is separated by currency and is a run rate,
not collected revenue or a replacement for Stripe's ledger. Legacy inventory
rollups based on `plans.priceGBP` have a different meaning and must not be
merged into financial claims.

The [approved handoff](../plans/active/optional-billing-starter-proposal.md#approved-billing-experience--2026-09-14)
is dated decision/verification context, and the
[operator guide](../operator/stripe-billing.md) remains the detailed setup and
recovery reference. Relevant implementation tests include `billing.test.ts`,
`billingAdmin.test.ts`, `billingHttp.test.ts`, `plans.test.ts` and the company
Billing screen tests. None were run during this documentation pass. No
checkout, customer creation, portal configuration, webhook test, charge,
refund, deployment or backend synchronization was performed. Live acceptance
must have its own evidence rather than inheriting a historical local-green
claim.
