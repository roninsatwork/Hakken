# Optional billing starter — approved direction and handoff

Status: Stripe approved and implemented on 2026-09-13; completion-audit repairs
passed local verification in the [foundations record](./product-building-foundations-plan.md#completion-audit-repairs--2026-09-13).
This records the reviewed phase 4 direction. The current implementation and
explicit first-version restrictions are in [Stripe Billing](../../operator/stripe-billing.md).
The earlier blanket 100% claim was withdrawn after the audit reproduced lifecycle
gaps. Those reported gaps are repaired; live provider acceptance remains separate.

## Approved billing experience — 2026-09-14

Status: **approved local implementation and verification complete (100%)**.
Full framework and Base + Arcade checks/builds pass, plus the two fixture browser
journeys. See the [dated evidence](./product-building-foundations-plan.md#billing-experience-verification--2026-09-14).
The actual development backend was subsequently synced on September 14 and the
operator pages opened in the user's localhost session. Production deployment and
live Stripe acceptance are **not completed**. The earlier local
integration repairs are historical evidence, not completion of this new scope.
The sections below this handoff preserve the original phase 4 proposal; this
approved experience and the operator guide describe current scope.

The user approved building the following, and requested a durable handoff:

- Each cloned product uses one merchant Stripe account owned by its operator.
- Company admins have **zero access to platform Admin**. Their Billing entry is
  in the normal user frontend, at `/app/settings/billing`, visible in its sidebar.
- Super admins have private setup and oversight under `/admin/settings/billing`.
  Setup must remain visible when billing is disabled. Ordinary users, company
  admins, read-only roles and impersonating operators cannot read platform billing.
- Extend Subscription Plans with a Stripe price picker. Amounts and currency are
  read and validated on the server. Save non-secret configuration in Convex, with
  the checked-in JSON as a clone default. Credentials remain backend environment
  variables. Configure hosted portal profiles through the operator setup flow.
- Show each company’s subscription and Stripe dashboard link in company details.
- Oversight includes paying companies, users covered by paid company subscriptions,
  total companies/users, pending subscriptions, payment issues, cancellations,
  stale provider sync and monthly subscription value separated by currency.
  Paid users are registered USER/ADMIN members of confirmed, currently paid
  company subscriptions, excluding anonymous/platform roles and grace-only access.
  This is company billing, not per-seat charging. Monthly value is a run-rate
  measure, not collected revenue, profit or a ledger. Stripe owns invoices/payments.
- Preserve tenant isolation, paid entitlement checks, recovery portals, disabled
  defaults, English/Italian parity, screen-kit standards and Arcade.
- Verification is local; no commit, push, deployment or real Stripe change is
  authorized by the initial build. Use mock-provider tests and isolated test
  fixtures. The later request to see the screens on dev included repairing the
  local install and syncing the configured development backend; this did not
  authorize a production release or real Stripe changes.

### Implementation map

| Surface | Current implementation |
| --- | --- |
| Company Billing | Direct sidebar link, `/app/settings/billing`, own-company status, checkout, refresh and hosted portal; discoverable when disabled |
| Platform overview | `/admin/settings/billing`, dated totals over every data page, currency-separated subscription value, searchable/status-filtered company table with 15 rows |
| Stripe setup | `/admin/settings/billing/setup`, credential presence, saved connection check, webhook receipt status, mode/origin/grace and enabled configuration |
| Plan price selection | `/admin/settings/plans/[id]/billing`, paginated Stripe price picker and server-validated mapping |
| Company details | Private subscription card and correct test/live Stripe customer link; Stripe-managed plans cannot be reassigned manually |
| Runtime configuration | `convex/billingConfiguration.ts`; revisions, mode/disable locks and protection against reusing a historical price for a different plan |
| Operator APIs | `convex/billingAdmin.ts`, `billingAdminActions.ts`, `billingMetrics.ts`; SUPER_ADMIN checks plus impersonation refusal on every public entry |
| Regression coverage | `convex/billingAdmin.test.ts`, `convex/billing.test.ts`, `src/ui/components/billing/BillingScreens.test.tsx`, sidebar/company tests and `e2e/billing.spec.ts` |

### Next-model checklist

1. Read this section, the [operator guide](../../operator/stripe-billing.md) and
   the [current verification record](./product-building-foundations-plan.md#billing-experience-verification--2026-09-14).
   Inspect branch/status and recent commits before editing. This slice was built
   on `dev` alongside the earlier framework work; preserve any outstanding changes.
   The dev backend has been synced. Use Git history and CI to establish publication
   status rather than carrying forward a dated "not committed" statement. A push
   to `dev` is not a production release.
2. Keep company billing in the user frontend. Do not move it into Admin, expose
   platform reports to company admins, or make setup disappear when disabled.
3. Keep one configuration authority: saved Convex settings override JSON defaults.
   Never return provider secrets or accept client-supplied amounts/customer IDs.
   Keep historical price bindings, access deadlines and recovery paths intact.
4. Keep the documented metric definitions. Do not count grace-only accounts as
   paying, count platform roles as paid users, merge currencies, or label monthly
   subscription value as collected revenue. Reporting is dated, not a single
   transactional snapshot; provider sync health uses successful reconciliation.
5. Remaining rollout work is **production deployment plus an explicitly authorized real
   Stripe sandbox exercise**, followed by product-specific live setup. Local
   fixtures do not prove provider delivery, real Checkout/portal behavior or the
   deployed screens. Do not mark these steps complete without their own evidence.
   If dev menus/pages disappear, use the operator guide's
   [dev visibility checks](../../operator/stripe-billing.md#when-billing-is-missing-in-dev)
   before changing the agreed navigation or permission rules.
6. Update this handoff, the operator guide and the dated foundations record when
   behavior or verification changes. Update navigation indexes if status changes;
   do not leave an old completion percentage as the current source of truth.

## Proposed outcome

A cloned product can opt into self-service subscription payments using its own
provider account. Company administrators can select an offered plan, complete
hosted checkout, inspect billing status and open a hosted customer portal.
Confirmed server-side subscription state determines paid access. Billing starts
disabled, with no credentials, customers, subscriptions or charges created by
cloning or initialisation. Arcade remains framework code.

The proposed first adapter is Stripe with one monthly subscription per company.
Stripe was selected by the user. The implemented first slice uses monthly
company subscriptions and calendar-month quotas. It does not include live
setup, migration, publishing or a real payment test.

## Original design inventory and consequences (2026-09-13)

This table describes the pre-billing baseline that motivated the implementation,
not outstanding defects in the current code.

| Existing surface | Current behaviour | Billing integration requirement |
| --- | --- | --- |
| `convex/plans.ts`, `convex/planService.ts` | Plan catalog, message allowances and display prices; no payment collection | Reuse plan definitions; bind only explicitly offered plans to provider prices |
| `convex/companies.ts`, `assignPlanToCompany` | Super-admin-only plan assignment with inventory updates | Keep manual assignment separate from payment-confirmed subscription changes; update rollups consistently |
| `convex/chatService.ts`, `resolveChatQuota` | No valid plan means unlimited chat; a user override takes precedence | A canceled/unpaid subscription must not become unlimited by clearing `planId`; enforce paid status before an override can bypass it |
| `convex/tenantFunctions.ts`, `effectiveModulesFor` | Company overrides and plan grants are combined | Distinguish deliberately granted manual capabilities from subscription-paid capabilities |
| `convex/crons.ts`, `reset-billing-cycles` | Calendar-month usage reset on day 1 at 00:00 UTC | Make quota windows explicit; do not silently switch existing tenants to payment-anniversary resets |
| `convex/plans.ts`, `deletePlan` | Refuses plans assigned to companies; does not check user override references | Billing-managed plans also need subscription/price-reference protection before deletion |
| `convex/toolConnectorDefinitions.ts` | Stripe appears as connector metadata | This is not a working billing integration and must not be used as one |

Current code references:
[plans](../../../convex/plans.ts), [plan status](../../../convex/planService.ts),
[company assignment](../../../convex/companies.ts),
[chat quota](../../../convex/chatService.ts),
[module access](../../../convex/tenantFunctions.ts),
[scheduled resets](../../../convex/crons.ts).
See [Platform Plans and Quotas](../../developer/platform-plans-and-quotas.md)
for existing scope: chat allowance is not a global AI-spending limit.

## Proposed implementation surfaces

- Optional billing configuration, provider requirements and setup documentation.
  Provider keys belong only in a clone's backend environment. Plan/price mappings
  are server-owned; a browser cannot provide an arbitrary charge amount,
  provider customer ID, company ID or redirect destination.
- A company billing screen under `/app/settings/billing`, linked from existing
  settings, with English/Italian copy and screen-kit components. Company admins
  manage billing; ordinary members and read-only users do not initiate purchases
  or open a financial portal. Platform impersonation should not initiate charges.
- Separate backend modules for authenticated checkout/portal actions, billing
  queries, local subscription/entitlement policy and indexed company bindings.
  New schema fields must be optional for existing data; no existing company is
  silently converted from manual billing to provider-managed billing.
- For Stripe, use the maintained Convex component for customer/subscription
  synchronisation and verified webhooks. Adapt its examples to Sonae's company
  tenancy, server-controlled prices and existing authentication. It is not a
  replacement for those checks. The component supports checkout, a customer
  portal and organization-linked subscriptions.
  ([Convex Stripe component](https://www.convex.dev/components/stripe))
- Reconciliation for duplicate, delayed and out-of-order notifications. Associate
  provider objects with a server-created company/customer binding. Confirm the
  current provider state before changing entitlements; do not grant access from
  a browser success URL, arbitrary metadata or an unverified callback.
- Guards against duplicate checkout/subscriptions, mismatched price/company
  bindings, disabled offers, subscription-linked plan deletion and concurrent
  manual plan changes. Scheduled work and reconciliation must be bounded.

Installing or registering a component does not activate billing. Real provider
configuration and a sandbox payment test remain explicit post-clone setup steps.

## Lifecycle policy must be explicit

Stripe exposes incomplete, trial, active, past-due, unpaid, canceled and paused
states. Cancellation can happen at period end, and failed-payment behaviour
depends on configured retry rules. These states require deliberate access rules.
([Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview))

The starter should require an enabled clone to declare its policy rather than
silently imposing a commercial policy on every Sonae product:

| Decision | Proposed support |
| --- | --- |
| Cancellation | Keep paid access through the confirmed paid period when cancellation is scheduled for period end |
| Failed renewals | Explicit grace duration, including zero; recovery and billing access remain available after paid features pause |
| Free access or trials | Explicit free plan/trial configuration; absence of a billing plan is not an unlimited paid entitlement |
| Quota windows | Explicit calendar-month or subscription-period policy, with idempotent resets and no double reset during migration |
| Plan changes | Approved follow-up: Stripe portal owns changes and immediate proration invoices; Sonae follows paid mapped prices, including scheduled downgrades when applied by Stripe, without resetting usage |
| Manual grants | Preserve deliberate operator-managed arrangements separately from payment-managed entitlements |

Account sign-in, billing recovery and data access/retention must be considered
separately from permission to use a paid feature. Do not delete customer data
because a payment failed. Per-seat pricing, usage-based charges, public company
signup, tax/refund policy and automatic data migration are additional product
decisions, not implied by the monthly company-subscription starter.

## Verification proposal

Implementation verification stays in temporary copies, with no source checkout
initialisation, live tenant/provider change, deployment, commit or push.

- Disabled configuration preserves current manual-plan behaviour and needs no
  provider credentials. Incomplete enabled configuration fails clearly.
- Backend tests cover company/role isolation, forged price/customer bindings,
  duplicate checkout, verified-event processing, replay/out-of-order delivery,
  payment recovery, cancellation and quota reset idempotence.
- Access tests cover canceled/no-plan unlimited fallthrough, user overrides,
  manual capability grants, read-only members and super-admin impersonation.
- Form/route tests cover loading, unavailable provider configuration, failed
  checkout, pending payment, active subscription and recovery without exposing
  payment credentials or another company's financial information.
- Fresh locked installation, environment validation, guards, lint, cold
  TypeScript, relevant/full tests and production build in temporary clones.
  Recheck exporter combinations if packaging or required dependencies change.
- A real Stripe sandbox checkout/webhook/portal exercise is a separate authorised
  integration check. Local mocks cannot establish live provider readiness.

Runtime code and optional schema tables implement the approved direction.
Billing remains disabled in the source configuration. See the
[foundations verification record](./product-building-foundations-plan.md#phase-4-verification--2026-09-13)
for the completed local checks and the separate live-provider boundary.
