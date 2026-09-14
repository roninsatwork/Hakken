# Stripe billing after cloning

Sonae includes optional company subscription billing. It ships disabled in
[`sonae.billing.json`](../../sonae.billing.json). Cloning, exporting and product
initialisation create no Stripe customers, checkout sessions or charges.
Arcade remains part of the framework.

> Implementation and local verification complete 2026-09-14. The localhost app's
> development backend was subsequently synced and the operator screens checked
> in the actual dev session. Production release and real Stripe acceptance have
> not been performed. See the
> [current handoff](../plans/active/optional-billing-starter-proposal.md#approved-billing-experience--2026-09-14)
> and [dated verification evidence](../plans/active/product-building-foundations-plan.md#billing-experience-verification--2026-09-14).

## What the starter supports

- One monthly, fixed-price subscription per company, with Stripe-hosted card
  checkout and a customer portal for plan changes, invoices, payment recovery
  and cancellation. Stripe creates invoices, collects payment and calculates
  adjustments; Sonae maps the confirmed paid plan to product access.
  Hosted links use `checkout.stripe.com` and `billing.stripe.com`; custom
  Stripe-hosted domains need an explicit redirect-policy extension.
- GBP, EUR and USD prices, configured in integer minor units (2900 means 29.00).
  The server verifies the actual Stripe price, product, mode and monthly interval
  before starting checkout. `plans.priceGBP` remains an operational display and
  inventory estimate; it is not the amount charged or an accounting ledger.
- Company administrators manage their own billing at `/app/settings/billing`,
  opened from **Billing in the normal user sidebar**, as well as Company Settings.
  Company admins have **zero access to platform Admin**. Members, read-only users and impersonating
  platform administrators cannot purchase or open another company's portal.
- Webhook signatures and provider mirrors use `@convex-dev/stripe` 0.1.6.
  Stripe SDK 22.2.1 is pinned; configure the endpoint API version as
  **2026-05-27.dahlia**. Sonae additionally caps webhook bodies at 256 KiB and
  reconciles current provider state before changing access. See the
  [Convex component reference](https://www.convex.dev/components/stripe) and
  [Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview).

## Where the screens live

| Person | Navigation | Route | Purpose |
| --- | --- | --- | --- |
| Company admin | User frontend → Billing | `/app/settings/billing` | Their own plan, checkout and hosted portal |
| Super admin | Admin → Settings → Billing → Overview | `/admin/settings/billing` | Platform counts and company subscriptions |
| Super admin | Admin → Settings → Billing → Stripe setup | `/admin/settings/billing/setup` | Connection, webhook status and billing configuration |
| Super admin | Admin → Settings → Plans → Stripe price | `/admin/settings/plans/[id]/billing` | Link an existing plan to a verified Stripe price |
| Super admin | Admin → Companies → company → Overview | `/admin/companies/[id]/overview` | Subscription status and Stripe customer record |

The user Billing entry and private setup remain discoverable when billing is
unconfigured. Disabled customer billing explains that setup is unavailable;
it does not expose platform configuration. Platform billing checks SUPER_ADMIN
on every backend entry, and refuses impersonation, company roles, readers and
auditors. The frontend gate prevents restricted queries from mounting.

### When Billing is missing in dev

1. Check the bottom of the sidebar for **IMPERSONATING WORKSPACE**. Click
   **Exit Workspace** to return to your super-admin context. Platform Billing is
   deliberately hidden during impersonation, even if other Admin menus remain
   visible. It then appears under **Settings, between Plans and API Keys**.
2. The company Billing link appears **below Organization** in the normal user
   frontend for an actual company ADMIN login. A super-admin account or an
   impersonated workspace does not display that link. Its route is
   `/app/settings/billing`.
3. If the menu appears but the page errors with `Could not find public function`
   for `billingAdmin` or `billingMetrics`, the frontend and backend are out of
   sync. Confirm `.env.local` points to the intended **dev** deployment. With
   Node 24.18.0, run `npm ci`, then keep `npm run dev` and `npm run convex:dev`
   running in separate terminals. Wait for **Convex functions ready** and reload.
   `npm run verify:env` must recognize the locked Stripe SDK and component.
4. This repository checks backend TypeScript through the root
   `npm run typecheck`. Its normal Convex dev command uses the default `try`
   mode; forcing `--typecheck enable` requires a separate `convex/tsconfig.json`,
   which the repository does not currently have. Do not confuse a watcher waiting
   after that error with a successful sync.

Missing Stripe credentials should show the setup state; they should not hide the
super-admin menu or crash the overview. Keep Stripe disabled until real setup is
explicitly requested. Dev server readiness is separate from live payment readiness.

## Configure a clone

Each product uses **one merchant Stripe account** belonging to its operator.
Customer companies pay subscriptions into that account; they do not connect
Stripe accounts of their own. This integration does not use Stripe Connect.

These are operator actions after deploying the code and optional Convex tables
to the clone. Building the framework or running tests performs none of them.
Use a separate test deployment before configuring a production deployment.

1. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the clone's **Convex
   backend environment**, using the Convex dashboard. Never use `NEXT_PUBLIC_`
   for either value. Credentials are never entered, returned or displayed in
   Sonae's billing screens. The Stripe key must match the chosen test/live mode.
2. Open **Admin → Settings → Billing → Stripe setup**. Select test/live mode,
   the product app origin (no path or trailing slash), and 0–30 recovery grace
   days. Save with company billing disabled while preparing the catalogue.
   Test mode alone permits localhost HTTP. The app URL should match the product
   deployment's actual origin. Once billing accounts exist, mode changes are
   refused; use a separate deployment for test and live billing.
3. Add the displayed **Webhook endpoint** in Stripe. It is the Convex HTTP
   origin plus `/stripe/webhook`, not the Next.js app or `.convex.cloud` URL.
   Use API version **2026-05-27.dahlia** and events `customer.created`,
   `customer.updated`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `checkout.session.completed`, `checkout.session.expired`, `invoice.created`,
   `invoice.finalized`, `invoice.updated`, `invoice.paid`,
   `invoice.payment_succeeded` and `invoice.payment_failed`. If creating the
   endpoint supplied a new signing secret, update `STRIPE_WEBHOOK_SECRET`.
4. Press **Check saved connection**. It verifies access to Stripe and reports
   portal readiness. Credential presence alone is not successful delivery:
   **Last verified webhook received** stays empty until a signed, mode-matching
   event actually reaches this deployment. Portal readiness also checks that
   mapped Sonae plans are still active. The webhook route returns 404 while
   company billing is disabled; verify event receipt after enabling in step 7.
   Before that, a successful connection check proves the key can reach Stripe,
   not that an event has arrived or portal setup is complete.
5. Create product plans in **Admin → Settings → Plans**, including message
   allowances and module grants. Create matching **active fixed monthly prices
   in Stripe**, quantity one and licensed billing, in GBP, EUR or USD. Annual,
   tiered, metered, per-seat and transformed-quantity prices are unsupported.
6. On a plan's row, open **Stripe price**, press **Load Stripe prices**, select
   the price and save. The picker pages through the provider catalogue. Amounts,
   currency and eligibility come from server-side Stripe reads; there are no
   manual plan/price IDs to copy. Each plan has one current price through this UI.
   A catalogue supports up to 25 offers across at most ten Stripe products.
7. Return to **Stripe setup**, enable company billing and save. Saving enabled
   settings validates the catalogue and creates two matching portal profiles:
   subscription changes with immediate proration invoices and unchanged billing
   dates, and payment recovery with plan changes disabled. Both include payment
   methods, invoice history and cancellation at period end. Subsequent catalogue
   edits create replacement profiles without mutating profiles already used by
   customer sessions. Unused old profiles are retained. See Stripe's
   [portal configuration API](https://docs.stripe.com/api/customer_portal/configurations/create)
   and [price-list API](https://docs.stripe.com/api/prices/list).
8. Company admins now use **Billing in their normal user frontend**. A company
   with no existing manual plan can choose a plan, complete Stripe Checkout and
   use the Stripe portal for future financial management.
9. Before launch, run an explicitly authorized sandbox exercise: checkout,
   abandoned checkout, paid/failed upgrades, recovery, downgrade, renewal failure,
   cancellation, delayed/duplicate webhooks and a retired-plan recovery case.
   Check signed-out, member, company-admin, foreign-company and impersonation
   boundaries. Local fixture tests do not prove live provider readiness.

### Configuration ownership

`sonae.billing.json` is the non-secret **clone/deployment default**. Once a super
admin saves settings or a price mapping, the `billingSettings` record becomes
the runtime authority. Checkout, portal creation, reconciliation, webhook gating,
plan deletion and paid access all read that same configuration. Later JSON edits
do not override a saved record. Routine UI changes need no frontend rebuild.
Optimistic revisions refuse concurrent stale writes.

The JSON workflow remains available before any settings have been saved. Its
shape is validated by [`billing.config.ts`](../../billing.config.ts). Do not
manually edit database rows or delete saved configuration to bypass mode locks,
price ownership, subscription history or paid-access rules. Backend credentials
remain separate from this non-secret record.

`npm run setup:validate` and `npm run verify:deployment` validate local deployment
**defaults** and key requirements inferred from those defaults. They do not read
saved Convex billing settings or prove connectivity. Use the setup screen and a
sandbox payment exercise to verify runtime billing configured through the UI.

## Super-admin oversight definitions

The Overview report reads every page of company, account and user data. It does
not report a capped sample as a platform total. Its completion time is shown;
separate page reads are not a transactionally consistent snapshot. **Refresh
totals** produces a new report. The company table is reactive and pages by 15,
with company-name search or a subscription-status filter.

- **Paying companies:** an existing company in the configured Stripe mode with
  a subscription, saved offer, active/past-due status and `paidThrough` after
  report start. Grace-only, incomplete, ended, unsupported and other-mode
  accounts do not count. Scheduled cancellations count until the paid period ends.
- **Users on paid subscriptions:** registered USER/ADMIN members of those
  companies; absent role means USER. Anonymous users and platform/oversight roles
  are excluded. These are covered members, not individually billed seats or
  users currently online. **Company users** counts registered company USER/ADMIN
  records across the platform, regardless of subscription.
- **Monthly subscription value:** the sum of the saved monthly offer amounts
  for paying companies, grouped by currency. It is a run-rate measure before
  taxes, refunds and fees, not collected cash, recognized revenue, profit or a
  substitute for Stripe's financial reports. Currencies are never added together.
- **Payment issues:** past-due, unpaid, unsupported or paused accounts, plus an
  active account whose confirmed paid period expired. **Pending** includes
  pending, incomplete and trialing. **Ended** includes canceled/incomplete-expired.
  **Scheduled cancellations** are non-ended accounts marked cancel-at-period-end.
- **Last provider sync:** `reconciledAt`, written only on successful projection.
  Releasing a failed job cannot make sync health look current. Accounts with no
  successful sync or one older than 30 minutes are flagged. Existing rows without
  this optional field remain unknown until reconciliation; they are not assumed
  healthy. A recent sync still does not promise instant webhook delivery.

Company details show the current subscription, paid-through date, cancellation
and an operator-only Stripe customer link in the correct test/live dashboard.
Manual plan reassignment is unavailable for Stripe-managed companies. Company
profile edits do not attempt to reassign an unchanged or Stripe-managed plan.

Invoice details, tax, refunds, disputes, payment terms and cancellation
communications are configured and managed in Stripe by the product operator.
There is no automatic tax setup, trial, discount-code field or free-plan enrollment.
Do not enable those through the Stripe dashboard without extending and testing
the policy. Plan changes remain within the same currency. Test-to-live is a separate deployment/account migration, never a
toggle over existing test billing records.

## Access and lifecycle

Existing companies without a billing account keep their existing manual plan
behaviour. A company with an assigned manual plan cannot start self-service
checkout; migration requires an explicit operator plan. For an unassigned
company, pressing **Continue to Stripe** enrolls it in billing. The screen
explains that paid features then require confirmed payment, including when the
person abandons checkout.

An active subscription grants access only through its last confirmed paid
invoice period. A past-due subscription may extend that period by the configured
grace duration. Saved grace changes apply at the next reconciliation, which
schedules the matching expiry job; reading settings cannot silently extend an
existing deadline without that job. Incomplete, expired, trial, unpaid, canceled, paused or unsupported
subscriptions grant no paid access. A scheduled cancellation preserves access
through the paid period; immediate cancellation stops it. A return from checkout
or a subscription's `active` label alone is not payment evidence.

**Manage billing in Stripe** opens Stripe's portal. A new plan is selected there;
Sonae follows the subscription's current price only when it maps to an active
configured plan and Stripe confirms the corresponding invoice is paid. A paid
mid-period adjustment changes access only within an already confirmed paid period;
it cannot extend that period. Stripe owns all charge and credit calculations.
Failed or pending changes retain the last confirmed plan through its paid/grace
deadline. A scheduled downgrade leaves current access in place until Stripe
applies the new price and payment is confirmed. Unknown prices, inactive target
plans and unsupported subscription shapes pause paid access for operator review.
Existing subscribers keep their saved price mapping; do not repoint a price ID
to a different product plan. Retired plans and an invalid sale catalog fall back
to the recovery-only portal; buying or changing plans remains unavailable until
the sale catalog is valid again. The recovery configuration must stay active and
in the correct Stripe mode, with plan changes disabled. Provider outages or a
misconfigured recovery portal still need operator attention.

If a checkout or renewal notification is missed before a paid plan change,
reconciliation can rebuild the current paid period from up to ten recent paid
invoices: first a verified full-period payment, then its paid adjustments in time
order. An adjustment alone cannot establish that period. Unknown intervening
adjustments, ambiguous same-second ordering, or history missing the full payment
do not grant access; recover the provider history with the operator before launch
if the supported window is insufficient. Older invoices cannot undo a recorded
credited downgrade. Stripe remains the source for invoices and charge amounts.

Enforcement happens before user quota overrides and the old no-plan/unlimited
fallback. Company plan module grants stop when paid access stops; deliberate
company-level grants remain. New Sonae companies normally receive core module
grants, so a product selling those modules must deliberately configure its
provisioning grants. There is no universal application paywall: additional paid
features should use the shared `billingBlocksPaidAccess` policy server-side.
Chat allowances are not a global AI-spending limit.

Quota counters still reset on the first day of each calendar month at 00:00 UTC.
Subscription renewals, plan changes and duplicate webhooks never reset usage. Subscription
anniversary quotas and converting existing manual companies are
separate product changes, not implicit migrations.

The UI refuses to disable billing once billing accounts exist, preserving
customer recovery and reconciliation. Retire plans to stop new sales. Existing
subscribers retain the recovery portal when the sale catalogue is unavailable.
A legacy disabled configuration does not erase billing accounts or restore
unlimited access. Billing failure does not delete sign-in accounts or stored customer
data. Check paid-module choices against the product's data export/read-access
requirements before launch.

## Reconciliation and recovery

Each company has an indexed customer binding and a short lease. Checkout attempts
store immutable request parameters and a Stripe idempotency key. Retries reuse
that attempt. A new attempt is allowed only after Stripe confirms the previous
session expired or its bound subscription ended. Unsupported/multiple provider
subscriptions require operator review instead of another purchase.

Signed events trigger a current Stripe lookup; event timestamps and browser
metadata are not authoritative. An oldest-first sweep schedules up to 25 stale
accounts every five minutes, refreshing accounts no more often than every
15 minutes through that sweep. This is bounded repair capacity, not a webhook
latency guarantee. Review capacity when the product grows. Paid access expires
by time even if a renewal notification is missing; a scheduled expiry write also
invalidates cached permission/status queries at the access deadline.

If a newer pending invoice hides a paid plan change, reconciliation checks at
most ten recent paid Stripe invoices. Only evidence newer than the last accepted
invoice can approve a historical plan change: an earlier payment credited by a
downgrade cannot buy a second upgrade. Ambiguous same-second history, missing
prior evidence or changes older than that window retain the last confirmed plan
and need operator review. The current Stripe invoice can resolve same-second
changes directly. Invoice IDs/timestamps are access evidence, not a Sonae invoice
ledger. See Stripe's [pending update lifecycle](https://docs.stripe.com/billing/subscriptions/pending-updates).

If a provider response was lost and an idempotency window has expired, the
starter first checks provider checkout history. It replaces an absent/expired
checkout only after that bounded history and the subscription check are complete;
ambiguous or oversized histories require operator reconciliation. Find the existing object in the Stripe dashboard
using its `sonaeBillingAccount` / `sonaeCheckoutAttempt` metadata. An authenticated
deployment operator can call the internal
`billingRecovery:attachProviderObject` action with the stored `accountId`,
verified `customerId` and optional `sessionId`. It checks provider metadata,
mode and company ownership before binding; it does not create a new charge.
Never replace a customer's ID or delete billing records to make checkout work.
A lost customer-creation response retried after Stripe expires its idempotency
key can leave an unused empty customer: checkout is unreachable until the binding
is saved, so this cannot create a duplicate subscription.

Billing-managed company deletion and manual plan reassignment are blocked.
Plans referenced by offers, billing history or user overrides cannot be deleted.
Cancellation, financial retention and account archival need a deliberate
operator workflow; this starter does not automate irreversible financial cleanup.

## Implementation and verification

- [`convex/billingConfiguration.ts`](../../convex/billingConfiguration.ts): runtime configuration, revisions and immutable historical price bindings.
- [`convex/billingAdmin.ts`](../../convex/billingAdmin.ts): protected setup, company detail and paginated oversight queries.
- [`convex/billingAdminActions.ts`](../../convex/billingAdminActions.ts): provider verification, price picker and portal setup.
- [`convex/billingMetrics.ts`](../../convex/billingMetrics.ts): complete paginated reporting and metric definitions.
- [`billing.config.ts`](../../billing.config.ts): strict non-secret configuration.
- [`convex/billingActions.ts`](../../convex/billingActions.ts): company-scoped checkout,
  portal and explicit refresh.
- [`convex/billingState.ts`](../../convex/billingState.ts): leases, bindings and inventory updates.
- [`convex/billingReconciliation.ts`](../../convex/billingReconciliation.ts): current subscription/paid-period evidence.
- [`convex/billingHttp.ts`](../../convex/billingHttp.ts): bounded component webhook adapter.
- [`convex/billingPolicy.ts`](../../convex/billingPolicy.ts): shared access policy.
- [`billing page`](../../src/app/(dashboard)/app/settings/billing/page.tsx): English/Italian status and recovery UI.

The webhook adapter uses the pinned Convex registered handler's `_handler`
bridge because the component currently reads an unbounded body itself. Its
installed-package signature/mirror tests must pass when upgrading Convex or
the component. The package's advertised `/test` export is absent in 0.1.6, so
the tests register its published component sources directly.

Local verification evidence is recorded in the
[foundations plan](../plans/active/product-building-foundations-plan.md).
No live Stripe account, deployment, charge or refund is part of that evidence.
