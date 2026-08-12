# Platform Plans And Quotas Developer Guide

Platform plans define subscription tiers, monthly message limits, pricing display values, company plan assignment, user overrides, and billing-period message counter resets. Read this before changing `convex/plans.ts`, `convex/planService.ts`, plan schema fields, company plan assignment, profile usage displays, or the plan catalog UI.

For user and company management boundaries, see [Company And User Management](./company-user-management.md). For settings and white-label packaging, see [System Settings And Branding](./system-settings-and-branding.md).

## Product Surface

Plan-related routes:

- `src/app/(dashboard)/admin/settings/plans/page.tsx` manages the global plan catalog.
- `src/app/(dashboard)/admin/companies/page.tsx` can assign or clear a plan while creating or editing a company from the company list.
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

`getMyCompanyPlanStatus` resolves the signed-in user's status. User plan overrides win before company plan status. If no override or company plan applies, the result is `System Default` with unlimited messages.

`getCompanyPlanStatus` checks `canAccessCompany` before returning a company plan status. Foreign company admins receive `null`.

## Plan Mutations

`createPlan`, `updatePlan`, and `deletePlan` require `requireSuperAdmin`.

`createPlan` builds the plan record through `buildPlanRecord`, inserts it, then upserts global inventory plan totals.

`updatePlan` patches supplied fields and upserts the plan in global inventory totals.

`deletePlan` refuses deletion when any company is assigned to the plan. It reads up to 101 assigned companies and formats the error count with a cap of 100. If no company uses the plan, it deletes the row and removes the plan from global inventory totals.

User override references are not checked in the current delete guard. If override deletion semantics become important, add implementation and test coverage before documenting stricter behavior.

## Company Assignment

`companies.assignPlanToCompany` validates the target company and plan, patches the company `planId`, and updates global inventory rollups for old and new plan assignments. The mutation is called from both the company list create/edit modal and the company overview assignment form.

Plan assignment is a super-admin company management action. Do not expose company plan assignment to tenant admins without a product decision and explicit authorization tests.

## Status Resolution

`getPlanStatusFromUser` resolves in this order:

1. If `user.planOverrideId` exists, return `Custom {plan.name}` when the override row exists, otherwise `System Default`; use the user's own `messagesUsedThisPeriod`.
2. If the user has `companyId`, return company status from `getPlanStatusFromCompany`.
3. Otherwise return `DEFAULT_PLAN_STATUS`.

`getPlanStatusFromCompany` returns the company plan name and limit when a plan exists, otherwise `System Default`; usage comes from `company.messagesUsedThisPeriod`.

This means a missing override does not fall back to the company plan. Preserve that behavior unless a product decision changes support expectations.

Chat quota resolution is intentionally implemented in `convex/chatService.ts`, not in the profile status helper. `resolveChatQuota` checks a valid user override first, then falls through to the active company plan when the override row is missing, and finally returns unlimited usage when neither target has a valid plan. Keep this distinction in mind when changing deleted-plan or cleanup semantics: profile display can show `System Default` for a dangling override while the chat send path may still meter against the company plan.

## Chat Enforcement

The monthly plan counter is currently enforced in `chat.sendMessage`.

Before the quota check, the mutation verifies thread access, attachment policy, and the per-thread user-message rate limit. It then resolves the quota target:

- valid user override: use the user's override plan and increment `users.messagesUsedThisPeriod`
- active company plan: use the active company plan and increment `companies.messagesUsedThisPeriod`
- no valid plan target: allow unlimited usage without incrementing a usage row

When a finite quota is exhausted, the mutation still records the attempted user message, inserts an assistant soft-block message, updates the thread timestamp, and returns without running model generation. Signed-in app threads are told that the company AI allocation is exhausted and directed to an administrator. Anonymous widget threads receive only a generic temporary-unavailability notice so the customer's billing state is not disclosed publicly. The widget notice carries `systemKey: "quotaRefusal"` for browser-language presentation. PII redaction runs before this quota branch, and a successful send increments the selected usage counter before normal message insertion.

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

The plan catalog page uses shared admin table primitives and `AdminConfirmationModal`. It avoids native browser dialogs and surfaces save/delete errors in the modal state.

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
npm run build
git diff --check
```
