# Product-building foundations after cloning

Agreed direction: 2026-09-13. All four phases approved; Stripe selected for phase 4.
This follows the completed [Clean Cut](./client-product-cut-plan.md): Arcade stays
in the framework, and the exporter remains a separate operator action.

## Current follow-up — 2026-09-14

The billing integration now includes customer navigation and a private
super-admin setup/oversight experience. This approved local slice is **100%
implemented and locally verified**. Its scope, definitions and handoff are in
[the billing plan](./optional-billing-starter-proposal.md#approved-billing-experience--2026-09-14).
The latest evidence is immediately below. Overall approved local roadmap: **100%**;
real Stripe acceptance, production deployment and production readiness remain
unverified. The later dev visibility recovery is recorded below.
Historical counts later in this document do not supersede the current record.

## Billing experience verification — 2026-09-14

Implemented the normal frontend Billing entry for company admins, private
super-admin overview/setup, plan price selection and company subscription detail.
Company admins have no platform Admin access. Saved Convex configuration is the
runtime authority over JSON defaults; credentials remain environment-only.
The operator guide defines the report counts, hosted Stripe responsibilities,
configuration ownership and rollout steps.

Verification used fresh isolated installs under Node 24.18.0, with no real Stripe
credentials or deployment. Evidence directory:
`/var/folders/hl/3xx1pfvs1mndcjbzbnp0qs1m0000gn/T/hakken-billing-ui-g00pc2th/`.
These temporary logs are local evidence and may later be removed; the tests and
commands below are the reproducible checks retained in the repository.

| Check | Result | Evidence |
| --- | --- | --- |
| Full framework `npm run check` | Pass: environment, guards including 16 module combinations, lint, cold TypeScript; **751 files / 6,666 tests** | `check-complete.log` |
| Fresh Base + Arcade export `npm run check` | Pass: **519 files / 4,368 tests**, with 49 locked direct dependencies | `base-check.log` |
| Focused billing/UI/security regressions | Pass: **9 files / 139 tests** | `regressions.log` |
| `npx playwright test e2e/billing.spec.ts --project=super-admin` | Pass: **2 browser journeys plus auth setup**, no browser page errors | `e2e-final.log` |
| Production builds | Full framework and Base + Arcade both pass | `build.log`, `base-build.log` |
| Final documentation/export regressions | Pass: **2 files / 31 tests** after handoff edits | `handoff-tests.log` |

The focused suite covers the new operator role boundaries, saved settings through
checkout/reconciliation/portal, rejected price shapes, historical price ownership,
revision conflicts, account mode/disable locks, grace deadlines, and reporting
beyond one account/user page. UI tests cover role gates, unavailable billing,
customer actions, report failures, setup and price mapping. The browser journeys
prove company frontend navigation plus rejection from Admin, and super-admin
overview/setup/price-picker navigation using deterministic fixtures. They do not
contact Stripe or prove the live backend. The new browser spec is in the full
super-admin suite; the existing four-spec CI smoke split remains unchanged.

The test totals overlap; do not add them together. The full framework validated
59 locked direct dependencies. Lint has no errors and retains the existing shared
Header hook-dependency warning. Local guide links, `git diff --check` and source
runtime parity with the tested framework copy also passed. All four new billing
routes appear in both production build manifests. This fresh Base + Arcade check is a plain export;
the branded recipe/generated-feature composition and five-export production-build
matrix below remain earlier, separately dated evidence.

During this initial isolated verification, source billing stayed disabled and
Arcade stayed included. No source cleanup,
initialization, live customer/provider change, deployment, commit or push occurred.
The screens exist in the local code and isolated browser/build fixtures; no claim
is made that they have appeared in production. The next release needs its normal
gates and deployment, then the authorized Stripe sandbox lifecycle exercise in
the [operator guide](../../operator/stripe-billing.md#configure-a-clone).

### Dev visibility recovery — 2026-09-14

The user's localhost screenshot still had no Billing menu. Inspection of their
actual browser session found active workspace impersonation, which deliberately
hides platform billing. Exiting the workspace restored **Settings → Billing**.
Opening the page then exposed missing `billingMetrics:overview` and
`billingAdmin:listCompanies` functions on the configured development backend.

The source checkout also lacked the locked `stripe` and `@convex-dev/stripe`
packages. A fresh offline `npm ci` restored them; environment verification passed
for Node 24.18.0 and all 59 direct dependencies. Root `npm run typecheck` passed.
The local frontend was restarted and `npm run convex:dev` synced
**dev:silent-axolotl-121**, installing the Stripe component and reporting
**Convex functions ready at 10:43:37 Europe/Madrid**. Generated component API
types now come from the installed component. Both dev watchers were left running.

The authenticated localhost overview now reads the actual dev database, the
Stripe setup tab renders its missing-credentials state, the Plans row opens its
Stripe price screen, and company Overview renders the Stripe subscription card.
The Billing overview was opened in the user's dev tab. Recovery: **100%**.
After installing and regenerating component types, **4 files / 51 tests passed**
for operator billing, the webhook adapter, documentation and exporter regressions
(`/private/tmp/hakken-billing-dev-recovery-tests.log`).
`git diff --check` also passed. This is additional
dev integration evidence beyond the earlier browser fixtures. It is not a
completed real Stripe lifecycle exercise: billing remains disabled, no provider
credentials or billing settings were changed, and no financial action occurred.
There was no production deployment, Git commit or Git push. The
[operator troubleshooting guide](../../operator/stripe-billing.md#when-billing-is-missing-in-dev)
records the context switch and both dev services so the next agent can distinguish
a hidden menu, a missing package and an unsynced backend.

## Delivery phases

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Product defaults, preview/apply initialisation, shared provider checks and setup docs | Audit repairs verified in the full framework and branded clone |
| 2 | Complete feature generation: forms, detail pages, relationships, pagination and access/navigation wiring | Complete locally; generated features verified in a temporary fixture |
| 3 | Reusable product recipes and a reviewed framework update process | Complete locally; all five temporary export configurations verified |
| 4 | Optional self-service payments/subscriptions | Audit repairs verified in the full framework and billing-enabled branded Base + Arcade clone |

All four phases are implemented. The independent completion audit found four
defects, so the earlier overall 100% claim was withdrawn. All four reported
defects are now repaired and verified locally (repair batch: 4/4, 100%). The
September 14 verification above covers the current code; earlier runs below remain dated evidence.
Live product/provider setup and release remain separate operator actions.

## Completion audit repairs — 2026-09-13

The independent audit reproduced four gaps: delayed payment notifications could
leave paid customers without access; retiring a plan blocked the financial
portal; quoted sender names were corrupted in generated dotenv values; and a
branded export failed an initializer safety test that assumed the source layout.

The approved repairs now:

- Reconstruct paid periods and subsequent price changes from bounded, ordered
  invoice evidence. Missing or ambiguous payment evidence grants no new access;
  an intervening credited downgrade cannot be skipped to select an old upgrade.
- Validate a separate recovery-only Stripe portal configuration before enrollment.
  Existing customers fall back to it when the sale catalog is invalid, retaining
  payment methods, invoice history and cancellation without unsafe plan sales.
  Clones need the new `recoveryPortalConfigurationId` setup value; no Stripe
  configuration or provider object is created by this code change.
- Generate dotenv-compatible values and verify they round-trip through the setup
  parser. Unrepresentable quote combinations fail before writing any files.
- Exercise explicit initialized and uninitialized layout fixtures, asserting that
  ambiguous bindings fail without writes in both source and branded products.

Verification in `/private/tmp/hakken-completion-repairs-z9oz91nf/`:

- Fresh offline lockfile installs under Node 24.18.0, with 59 direct dependencies
  verified in the full framework and 49 in the Base + Arcade export.
- **156 focused tests passed**, covering billing, installed webhook/component
  behaviour, setup configuration and initialization (`focused-final.log`).
- Full framework `npm run check`: guards, all 16 module combinations, lint, cold
  TypeScript and **749 files / 6,629 tests passed** (`full-check-final.log`).
- Fresh Base + Arcade export: renamed/rebranded, with a quoted email sender,
  all three recipes and two additional linked generated features using all five
  field types. Billing was enabled with dummy IDs and no keys. Its full
  `npm run check` passed: **531 files / 4,391 tests** (`combined-check.log`).
  The previously failing branded-template test now passes in this composition.
- Production builds passed for the full framework and the combined clone
  (`full-build.log`, `combined-build.log`). They used loopback backend URLs,
  no provider credentials and disabled Next telemetry. No live backend was used.
- `git diff --check` and local guide links passed. Both tested fixtures contain
  the same repaired runtime/script code as the source. Lint retains the existing
  shared Header hook-dependency warning and has no errors.
- An early full check correctly caught a generic string being used where a typed
  plan ID was required. The repaired path now retains Convex's typed IDs; the
  subsequent complete checks and both builds passed.

The suites overlap and their totals must not be added together. This repair
batch rechecked the full framework and the composed Base + Arcade clone; the
older five-export matrix is historical evidence, not a claim that all five
production builds were repeated for this revision.

The source checkout was not initialized or stripped. All generated product
features, dummy enabled billing configuration, installs, synthetic test Git
checkpoints and build outputs remain in temporary copies. Source billing is
still disabled; Arcade stays. No live Stripe exercise, Convex deployment,
source commit or push was performed. Provider/browser acceptance remains pending
the explicit post-clone setup and release checks.

## Phase 1 implementation

- `hakken.product.json` describes identity, deployment names and credential
  requirements without storing secrets.
- `scripts/init-product.mjs` previews by default. Explicit application updates a
  clone's package/lock names, public identity bindings, backend branding defaults,
  branding ratchet, repository guidance, deployment resource names and a
  credential-free environment example. Runtime edits happen in the target only.
- The original Hakken runtime defaults are preserved. Stored settings continue to
  override backend defaults. Initialisation never changes Git remotes, tenants,
  agents, provider credentials, company capabilities or model defaults.
- Both setup checkers use `scripts/provider-requirements.mjs`. Selected providers
  and feature dependencies are required; complete alternatives and existing aliases
  are recognised; partial integrations and unknown backend env reads fail.
- Convex Auth's SDK-owned signing keys are included explicitly. Local setup can
  remain credential-free; production requires the selected providers. Neither
  checker proves provider connectivity.
- Operator/developer instructions and the product capability map are corrected.
  Start at [Product Setup](../../operator/product-setup.md).
- Brand-dependent test expectations use framework defaults, so a renamed product
  can retain meaningful tests rather than failing simply because its name changed.

## Verification boundary

The approved verification runs in temporary fixtures only. No initialiser or
exporter is applied to Hakken, no real tenant is created, no live environment is
listed or changed, and nothing is deployed, committed or pushed.

A fresh offline lockfile install under Node 24.18.0 provides the test toolchain.
The fixture is deliberately renamed and given a different colour and logo.
Focused tests cover previews, repeat application, rollback, changed templates,
concurrent writes, symlinks, source-origin protection, provider alternatives,
feature dependencies, private configuration separation and error redaction.
TypeScript, lint and the broader unit suite check the resulting application.
A production build and live provider/hosting checks remain separate verification.

## Completed verification — 2026-09-13

- Fresh offline `npm ci --ignore-scripts` in an isolated fixture; Node 24.18.0
  and all 57 locked direct dependencies verified.
- Renamed application with a different colour/logo: **743 test files / 6,475
  tests passed**. Earlier failures exposed brand-specific expected values and
  missing fixture assets; those were corrected before this successful run.
- After the final ambiguous-template guard and its regression test: **53
  focused tests passed**, with targeted lint passing again.
- Full fixture TypeScript (`--noEmit --incremental false`) and targeted lint for
  changed/generated code passed. Seven changed guides had no broken local links;
  `git diff --check` passed.
- Hakken's root layout, public navigation/footer, backend branding-default module
  and live deployment workflow have no changes from this phase. Only the
  temporary fixture received their generated product bindings.
- No production build, live provider check, deployment, commit or push was run.

Fixture evidence: `/private/tmp/hakken-product-phase1-2pwphlxa/`, including
`phase1-all-tests-final.log`, `phase1-final-safety.log`,
`phase1-typecheck-final.log` and `phase1-lint-final.log`.

## Phase 2 implementation

- `npm run feature:generate -- <name>` previews a complete tenant feature;
  `--apply` writes local files. The implementation is split into input validation,
  file planning, backend templates, frontend templates and access wiring.
- Generated code includes indexed 15-row cursor pages/full-text search,
  create/edit forms, record details, relationship pickers, backend role/tenant
  validation, optimistic edit revisions, restricted parent deletion, both locales
  and complete schema/API/sidebar wiring.
- Company-admin access is extended only to generated route prefixes; existing
  platform administration permissions remain unchanged.
- Generation refuses collisions, ambiguous wiring, modified shared generated
  contracts and symlinks, and restores earlier files when an apply write fails.
- See [Feature Generator](../../developer/feature-generator.md) for field types,
  permission rules, supported relationship targets and product-specific follow-up.

## Phase 2 verification — 2026-09-13

Fixture: `/private/tmp/hakken-product-phase2-p9kwn79i/`.

- Fresh offline lockfile install; Node 24.18.0 and all 57 direct dependencies
  verified before checks. Verification uses no live environment files or source
  Git history.
- Generated a supplier feature and a purchase-order feature linked to it, using
  all five field types. Both exist only in the temporary fixture.
- **749 test files / 6,518 tests passed** (`phase2-tests-final.log`), including
  the generated backend, form, route and actual admin-layout permission tests.
- All source guards passed, including screen kit, cursor pagination, message
  keys, dependency usage and 16 template combinations with Base/Arcade retained.
- Cold TypeScript passed (`phase2-types-final.log`). Full lint had no errors
  and one existing Header hook-dependency warning; final changed-file lint
  passed without warnings (`phase2-lint-final.log`).
- Earlier failures caught missing action-hook adoption, copied domain labels,
  the root schema size band, framework-menu snapshots, an outdated phase-one
  error assertion and incomplete inferred generator types. These were fixed
  before the successful tests/types above. Table definitions now live in separate
  modules; root schema growth is a one-time three-line registry binding, with
  an explicitly previewed size-band adjustment only when needed.
- No feature artifacts were generated into Hakken. No tenant, provider, live
  environment, deployment, commit or push was changed.
- Production build passed (`phase2-build-clean.log`), including supplier and
  purchase-order list/detail routes. The first sandboxed attempt could not open
  a compiler port or download fonts; a clean temporary build with the necessary
  execution permissions passed. The failed compiler state had to be removed
  from the fixture's build cache before retrying.
- Build validation used loopback Convex URLs and disabled Sentry upload/runtime
  reporting; it did not contact a live application backend. Browser behaviour
  against a deployed backend remains a separate product-release check.
- Updated guide/index links and `git diff --check` passed.

## Phase 3 implementation

- `npm run product:recipe -- --list` lists service desk, project tracker and
  internal knowledge assistant recipes. Each previews by default; explicit
  `--apply` creates the local record features and/or a product setup/launch guide.
- Recipes reuse the phase-two generator with one virtual file tree, so all
  features are checked before any write. Application is atomic with rollback;
  recipe/feature collisions, stale plans and symlinks stop the operation.
- Record recipes cover staff workflows and linked company records. The knowledge
  recipe reuses existing knowledge/agent/assistant surfaces. Provider credentials,
  live agents, external sends, tenant setup and activation remain explicit.
- Exports now record `.hakken/framework.json`: source version/dirty state, module
  cut and fingerprints of the final exported bytes and executable bits. Product
  re-exports are identified and cannot masquerade as upstream framework baselines.
- `npm run framework:update -- --upstream <export>` compares a matching pristine
  export. `--write-plan` creates a separate review file with additions, deletions,
  overlaps and already-aligned files. No incoming code is copied or merged.
- After manual integration and checks, every incoming file needs an explicit take
  or a reasoned product override. `--record-review` requires a clean local Git
  checkpoint and verifies exact takes before atomically recording the new baseline
  and its review history. It never commits, pushes, deploys or runs incoming code.
- [Product Recipes](../../developer/product-recipes.md) and
  [Framework Updates](../../operator/framework-updates.md) describe the workflow
  and its boundaries. The extension guide points to the complete generator in
  place of incomplete manual CRUD examples; documentation indexes remain aligned.

## Phase 3 verification — 2026-09-13

- Fresh offline `npm ci --ignore-scripts` in
  `/private/tmp/hakken-product-phase3-egxp1oqn/`; Node 24.18.0 and 57 locked
  direct dependencies verified before checks.
- **81 focused tests passed**, including recipe CLI previews, composition,
  collisions, stale plans, rollback, provenance, update classification, binary
  files, executable bits, changed exports, symlinks, unresolved decisions,
  checkpoint requirements and retained product overrides.
- Full source `npm run check` passed: all 16 module boundary combinations,
  guards, lint, cold TypeScript and **745 test files / 6,516 tests**.
  Lint reports one existing Header hook-dependency warning and no errors.
- After tightening the final incoming-snapshot read during review recording,
  **16 update tests** and targeted lint passed again.
- The base + Arcade export with all three recipes passed guards, lint, cold
  TypeScript, **523 test files / 4,261 tests**, `lint:all` and a production build.
  All four generated list/detail route pairs are included in the build.
- All 12 changed guides/indexes and all three generated recipe guides have valid
  local links. No recipe records, runtime pages or provenance were generated
  into Hakken itself.
- Verification uses temporary copies and loopback backend URLs with Sentry
  uploads/runtime reporting disabled. Synthetic Git checkpoints exist only in
  temporary test repositories to exercise review recording. No Hakken commit,
  push, tenant/provider change or deployment was made. Live provider/browser
  acceptance remains part of each product's release checks.

Evidence: `phase3-source-check.log`, `phase3-focused.log`,
`phase3-review-final.log` in the source fixture, and per-case logs under
`/private/tmp/hakken-phase3-export-matrix/`. The full five-case export matrix
completed successfully, including fresh offline installs, `check`, `lint:all`
and production builds in every case. Arcade remains in all five.

| Export | Test files | Tests | Production build |
| --- | ---: | ---: | --- |
| Base + Arcade + all three recipes | 523 | 4,261 | Passed |
| Posture Studio + framework/Arcade | 718 | 6,113 | Passed |
| Properties + framework/Arcade | 518 | 4,246 | Passed |
| Sales Reports + framework/Arcade | 516 | 4,230 | Passed |
| Sales Data + framework/Arcade | 533 | 4,581 | Passed |

These suites overlap; the rows are separate configurations, not a unique test total.
At the end of phase 3, billing had not been implemented. The user subsequently
selected Stripe and approved continuation into phase 4.

## Phase 4 implementation — 2026-09-13

Stripe company billing is now written, disabled by default. The
[operator guide](../../operator/stripe-billing.md) documents the exact supported
policies and configuration. Core additions include company-scoped hosted
checkout/portal/status, durable retry attempts, verified component webhooks,
current-provider reconciliation, explicit paid-period/grace access, cached-query
expiry, protected plan/company changes and bounded scheduled repair through the
existing job ledger. Manual grants remain separate; no payment event resets
calendar-month usage. The root schema grew three integration/index lines; the
existing 50-line size-band rule is unchanged, with its metadata updated to 4500.

The company screen uses the screen kit and English/Italian dictionaries. Setup
validation understands optional Stripe secrets. The exporter protects billing
as framework code while keeping Arcade. An operator recovery action verifies
existing Stripe objects before repairing an uncertain binding.

## Stripe portal plan changes — approved follow-up, 2026-09-13

Historical follow-up report, superseded by the completion-audit findings and
repair verification above.

Stripe now owns plan selection after purchase, proration invoices, payment
collection, invoice history and cancellation through its hosted portal. The
company button reads **Manage billing in Stripe** in English and Italian.
Hakken validates the portal catalog and maps a confirmed paid price change to
the company's plan, without resetting usage. Pending/failed changes keep the
last paid plan; scheduled downgrades apply when Stripe changes and bills the
subscription. A paid adjustment cannot extend an already paid period.

The optional `billingAccounts.paidInvoice` marker prevents an older payment
from being reused after a credited downgrade. Recovery looks at at most ten
recent paid invoices and retains the confirmed plan when history is ambiguous.
All charge/credit calculations and invoices remain in Stripe. See the
[current setup and lifecycle guide](../../operator/stripe-billing.md).

Verification in `/private/tmp/hakken-stripe-portal-7_nu19ts`:

- Fresh offline lockfile install and Node 24.18.0 / 59 direct dependencies verified.
- `npm run check` passed: guards (including all 16 template combinations), lint,
  cold TypeScript and **749 files / 6,598 tests**.
- `npm run lint:all` passed with the existing shared-header hook warning.
- Exported Base + Arcade to `/private/tmp/hakken-stripe-portal-base`, enabled
  billing with dummy identifiers and no keys, installed its 49 direct dependencies,
  and passed **82 focused tests**, cold TypeScript and targeted lint.
- Production builds passed for both the full framework and the billing-enabled
  Base + Arcade export, using dummy backend URLs and no provider credentials.
  The restricted build stalled during compilation; the same build passed with
  normal build permissions. `git diff --check` and changed-guide links passed.

Hakken's billing configuration remains disabled. No live Stripe setup, payment,
Convex deployment, source cleanup, commit or push is part of this follow-up.

## Phase 4 verification — 2026-09-13

- Fresh locked installs under Node 24.18.0. The full source fixture verifies
  59 direct dependencies; the base clone verifies 49 after optional demo removal.
- Source `npm run check` passed. After the final recovery/portal/setup changes,
  the complete source suite passed again: **749 files / 6,569 tests**. Cold
  TypeScript and production build passed; `lint:all` has no errors and retains
  the existing `Header.tsx` hook-dependency warning.
- All 16 module combinations pass source boundary checks. All five exported
  configurations pass fresh installation, `check`, `lint:all` and production
  build, retaining Arcade and billing. The base also includes all three recipes.
- A separate base clone with billing enabled and dummy test configuration passed
  **527 files / 4,314 tests** and a production build. This caught and resolved
  ambient billing-config assumptions in setup validation and tests.
- Installed-component tests verify valid/tampered webhook signatures and real
  local invoice mirroring. Other billing tests mock Stripe network calls and
  exercise company/role isolation, retry keys, missed responses, operator
  recovery, price drift, payment evidence, cancellation, explicit grace,
  expiry invalidation, manual grants and reference protection.
- Final billing changes in the earlier exports received an additional
  **108 focused tests**, TypeScript and targeted lint in each updated copy.
  Sales Data's full export run already contains the final billing files.
- Documentation links and `git diff --check` pass. No initialiser/exporter was
  applied to Hakken, no live Stripe operation or deployment command was run, and
  nothing was committed or pushed. No Convex development watcher was running
  when checked. The source billing config remains disabled with zero offers.

| Export | Full-suite files | Full-suite tests | Production build |
| --- | ---: | ---: | --- |
| Base + Arcade + all three recipes | 527 | 4,312 | Passed |
| Posture Studio + framework/Arcade | 722 | 6,166 | Passed |
| Properties + framework/Arcade | 522 | 4,299 | Passed |
| Sales Reports + framework/Arcade | 520 | 4,283 | Passed |
| Sales Data + framework/Arcade | 537 | 4,634 | Passed |

The base export's original full run predates two extra recovery tests; both pass
in its final focused review and in the enabled clone's full 4,314-test run.
These configurations share tests; their totals must not be added together.

Evidence is in `/private/tmp/hakken-product-phase4-98qombyp/`
(`phase4-check-final.log`, `phase4-tests-complete.log`, `phase4-build.log`,
`phase4-review-types.log`, `phase4-lint-final.log`, `phase4-setup-final.log`),
`/private/tmp/hakken-phase4-export-matrix/` (per-case check/build and final-review
logs), and `/private/tmp/hakken-phase4-enabled/` (`enabled-tests-final.log`,
`enabled-build.log`). Temporary evidence is not committed as source.

Live Stripe sandbox checkout/webhook/portal acceptance, actual Convex component
deployment, tax/refund policy, existing-company migration and product release
remain explicit post-clone work. Local test success does not claim those steps
have happened.
