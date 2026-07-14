# Future Agent Maintenance Plan

This plan is for future agents taking over Sonae development without relying on Gemini-specific instructions. The goal is to keep improving code quality outside the temporary movement demo.

## Operating Position

- Use `dev` for all normal development.
- Keep `main` production-only. Push or merge to `main` only when the user explicitly asks.
- Batch cleanup work and push at the end of a verified slice.
- Keep the app runnable locally on port 3000 with Convex running alongside it when the user is testing.
- Do not touch the movement demo unless the user asks or it breaks a required gate.
- Keep platform language and generic runtime code provider-neutral. Gemini-era wording belongs only in real model IDs, provider adapters, provider sync code, and explicitly allowlisted provider documentation.

## Frozen Demo Scope

The movement demo is temporary client-facing work. Do not spend refactor budget here:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `convex/movements.ts`

Allowed exceptions:

- Fix a build, typecheck, lint, or test failure.
- Fix a security issue that can affect the rest of the app.
- Make a minimal change explicitly requested by the user.
- If the explicit task touches movement capture, display preparation, scoring, retargeting, VRM bone application, or movement proof, read `docs/developer/movement-mirror-and-side-ownership-contract.md` before editing.
- If the explicit task touches Replay Studio diagnosis, proof artifacts, avatar-follow gates, or the agent debugging workflow, read `docs/plans/active/replay-studio-agent-repair-harness-plan.md` before editing.

Replay Studio is the recorded-motion source of truth for movement debugging. Use the existing repair-packet, targeted-proof, fast-subset-proof, and all-nine rendered proof flow before claiming shared-avatar acceptance. Game Studio live-camera checks are final confirmation after Replay proof, not a replacement for the Replay harness.

## Phase 1: Make Drift Checks First-Class

Add lightweight checks so project rules stay enforced automatically.

Targets:

- No native browser dialogs in `src/app` or shared UI.
- English and Italian message key parity.
- Admin tables use 15 rows per page.
- No accidental movement-demo edits in broad cleanup branches unless explicitly allowed.

Acceptance:

- Checks run through `npm run check` or a clearly named companion script.
- Failures print actionable file paths.
- Existing tests still pass.

Status:

- English and Italian message parity is covered by `src/i18n.test.ts`.
- Native browser dialog usage and admin 15-row pagination are covered by `src/quality-drift.test.ts`.

## Phase 2: Tighten Lint Baselines

`npm run lint:all` is currently clean, so the next useful step is to make clean categories hard errors.

Targets:

- Remove warning-only status for rules that now have a clean baseline.
- Prefer category-by-category changes over one large eslint rewrite.
- Avoid broad disable comments unless there is a documented framework limitation.

Acceptance:

- `npm run lint:all` stays at 0 warnings and 0 errors.
- `npm run lint` remains a hard-error gate.
- Rule changes are documented in the PR or commit message.

Status:

- The cleaned lint categories have been promoted back to hard errors in `eslint.config.mjs`.

## Phase 3: Shared Admin Surface Cleanup

Several admin pages repeat the same table, filter, pagination, empty-state, and error-state patterns.

Targets:

- Create shared helpers/components for admin table shells outside movement demo code.
- Standardize loading, empty, error, and success feedback.
- Keep row count, search behavior, and permissions predictable.
- Preserve existing visual direction unless a bug requires a visible change.

Acceptance:

- At least two duplicated admin surfaces move to shared primitives.
- User-visible behavior is covered by focused tests or smoke coverage.
- Locale strings remain in parity.

Status:

- Rule-list pages now share `AdminSearchBar`, `AdminTableShell`, loading/empty rows, and `AdminPaginationFooter`.
- First adopters: global AI rules, company AI rules, and agent AI rules.

## Phase 4: Convex Auth And Tenant Helpers

Authorization checks are critical enough to deserve small, boring helpers.

Targets:

- Add common `requireUser`, `requireAdmin`, and `requireSuperAdmin` helpers if the existing patterns support it.
- Add helper coverage for company scoping.
- Use generated Convex types such as `Doc<"users">` and `Id<"...">`.
- Keep privilege escalation checks explicit in user-management mutations.

Acceptance:

- Tests cover admin versus super-admin access.
- Non-super-admin queries cannot cross company boundaries.
- Error paths are consistent and easy to reason about.

Status:

- Added shared Convex auth helpers in `convex/authz.ts`.
- Migrated `convex/aiRules.ts` to the shared helper pattern.
- Added AI rule permission tests for own-company, foreign-company, and global-rule admin boundaries.
- Migrated `convex/companies.ts` super-admin gates to the shared helper pattern.
- Added positive company creation coverage for super-admins.
- Migrated read-only user queries in `convex/users.ts` to shared current-user/company-scope helpers.
- Added user read-boundary coverage for admin tenant scoping and super-admin cross-company access.

## Phase 5: Workflow And AI Contract Hardening

The workflow and AI surfaces are high-value maintainability areas, separate from the movement demo.

Targets:

- Continue moving workflow node, edge, schedule, and execution payload shapes into shared typed helpers.
- Replace dynamic casts with narrow parser or guard functions.
- Keep model selection configuration-driven.
- Normalize upload/file policy usage across frontend and Convex paths.

Acceptance:

- Workflow tests remain green.
- Invalid payloads fail clearly.
- Frontend/backend file policy drift is covered by tests.

## Phase 5A: Provider-Neutral Platform Cleanup

Sonae should be a platform with provider adapters, not a Gemini-shaped app with provider support bolted on. Keep true provider details isolated while removing stale provider-specific language from generic product, admin, workflow, and runtime surfaces.

Targets:

- Keep provider-specific SDK setup inside adapter modules such as `convex/vertexProviderService.ts`.
- Resolve execution models through stored configuration and `convex/aiModelService.ts`, not hardcoded runtime literals.
- Rename stale Gemini-era product/platform copy to provider-neutral language unless the reference is a real model ID, provider catalogue entry, or provider adapter note.
- Keep provider-specific tool-call and response shapes behind normalization helpers.
- Update `docs/developer/ai-provider-tool-extension.md` when a provider boundary or adapter rule changes.
- Avoid leaking provider names into React pages, generic Convex services, workflow nodes, audit labels, or admin UX unless the user is managing that provider directly.

Acceptance:

- `src/quality-drift.test.ts` continues to classify Gemini-era references before they spread.
- Any newly allowed provider-specific reference is added to the drift test allowlist with a clear reason.
- Generic tests use neutral model IDs such as `model-fast`, `safe-model`, or `sonae-test-model` unless testing a provider adapter.
- Runtime model selection remains configuration-driven.
- `npm run check` passes.

Status:

- `GEMINI.md` is now a compatibility pointer to `AGENTS.md`, not an active source of development instructions.
- `docs/developer/ai-provider-tool-extension.md` documents provider adapter boundaries.
- `src/quality-drift.test.ts` blocks unclassified Gemini-era references.
- Use `docs/plans/active/model-provider-agnostic-plan.md` as the locked source of truth for sitewide Gemini/OpenAI/Anthropic model selection, provider adapters, defaults, telemetry, and analytics dashboard work.

## Phase 5B: Analytics Scale Optimization

Analytics, admin dashboards, AI running costs, and company dashboards should move toward snapshot-first reads and indexed live-day overlays. Use `docs/plans/active/analytics-scale-optimization-plan.md` as the locked source of truth for this work.

Targets:

- Keep company and global analytics reads bounded by indexed date ranges.
- Store analytics dimensions on message rows so live company/user/agent/widget metrics do not depend on broad thread joins.
- Prefer daily snapshots for historical totals, leaderboards, model distribution, and user activity.
- Keep legacy fallbacks only until backfills are complete, then remove or sharply limit them.

Acceptance:

- Tenant isolation tests stay green for company/admin analytics.
- Dashboard totals remain stable across snapshot + live overlays.
- Query changes preserve model-cost configuration and avoid hardcoded model literals.
- `npm run check` and analytics-focused tests cover each completed phase.

Status:

- Added `docs/plans/active/analytics-scale-optimization-plan.md` as the phased source of truth.

## Phase 5C: Platform Scale Hardening

After the analytics hot path is scale-hardened, the next belt-and-braces work is to make admin inventory, knowledge, chat logs, workflow runtime, global inventory, and legacy/debug paths bounded before data volume makes those patterns expensive.

Targets:

- Replace product/admin UI `take(10000)` style reads with paginated, indexed, server-filtered contracts.
- Keep knowledge documents, chunks, and ingestion queues document-scoped or status/date bounded.
- Keep chat/admin log browsing bounded by tenant, date, and pagination.
- Replace workflow runtime broad execution/step/database lookups with narrow indexes.
- Move exact global inventory/MRR reads toward rollups when scale requires it.
- Quarantine or delete legacy/debug broad-scan modules that should not power product UI.

Acceptance:

- Use `docs/plans/active/platform-scale-hardening-plan.md` as the locked source of truth.
- New broad reads are classified by drift tests or removed.
- Tenant isolation, admin pagination, provider-neutral language, and analytics scale checks remain green.
- Movement demo files stay untouched unless the user explicitly changes scope.

Status:

- Added `docs/plans/active/platform-scale-hardening-plan.md` as the phased source of truth.
- Completed the main platform scale-hardening phases and promoted them through `main`.
- Use `docs/plans/active/post-scale-hardening-plan.md` for the remaining operational follow-up work: production smoke checks, inventory rollup backfill, workflow database-node query contracts, scheduler `nextRunAt`, and dependency cleanup.

## Phase 6: Release Readiness Checklist

Before any push intended for `main`, run:

```bash
npm audit --audit-level=high
npm run lint:all
npm run check
npm run build
git diff --check
```

If the app server was stopped for the build, restart:

```bash
npm run dev
npm run convex:dev
```

Then confirm:

- Working tree only contains intended changes.
- No movement-demo files changed unless explicitly allowed.
- `dev` has the finished work.
- `main` is only updated when the user asks for deployment.
