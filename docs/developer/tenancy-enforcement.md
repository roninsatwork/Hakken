---
product: Hakken
documentation_type: developer guide
feature_area: tenant boundaries and private tracking
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/tenancy-enforcement.md
last_reviewed: '2026-10-26T09:46:44+00:00'
reviewed_against: current implementation
status: Current
---
# Tenancy Enforcement

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Tenant boundaries and private tracking
> **Reviewed:** 26 October 2026, 09:46:44 GMT (Europe/London)
> **Source path:** `docs/developer/tenancy-enforcement.md` · **Status:** Current

Every client-callable Convex function must be declared with a builder from
`convex/tenantFunctions.ts`. This is checked by
`convex/authzEnforcement.test.ts`, so it fails CI rather than review.

## Why

Tenancy used to be enforced by convention: each of ~360 public functions had to
remember to resolve the caller and scope its own reads. The discipline was
genuinely high — 339 of 360 had a guard — but nothing made an omission
impossible, and the gap is where incidents come from. One anonymous read of
another tenant's agent traces reached production this way and was fixed in
the Swarm's status-log query (since removed with the Swarm, 2026-10-06).

A lint that greps for a guard call does not work. Plenty of functions delegate
their check into a domain helper — `getKnowledgeDocumentsForScope` authenticates
and checks roles properly — and a regex cannot see that. Such a check produces
false positives, and a guardrail that cries wolf gets ignored.

So the rule is structural instead: **which builder declared the function**. That
is a syntactic fact with no false positives, and a function built with
`tenantQuery` cannot run unauthenticated because authentication happens before
the handler is entered.

## Choosing a builder

| Builder | Caller must be | `ctx` gains |
| --- | --- | --- |
| `tenantQuery` / `tenantMutation` | authenticated, any role | `user`, `userId`, `companyId` |
| `adminQuery` | `ADMIN`, `SUPER_ADMIN`, `READ_ONLY` | same |
| `adminMutation` | `ADMIN`, `SUPER_ADMIN` | same |
| `superAdminQuery` | `SUPER_ADMIN`, `READ_ONLY` | same |
| `superAdminMutation` | `SUPER_ADMIN` | same |
| `governanceQuery` | admin readers plus `AUDITOR` | same |
| `publicQuery` / `publicMutation` / `publicAction` | nobody — deliberately open | nothing |

`ctx.companyId` is the caller's **active** company, so super-admin impersonation
is honoured without each function remembering to call `getActiveCompanyId`.

```ts
export const listForCompany = adminQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = requireTenant(ctx);
    return await ctx.db
      .query("agents")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(100);
  },
});
```

`publicQuery` and friends require a `reason` string. It is unused at runtime and
exists so an unauthenticated surface is a decision recorded next to the code,
not something inferred from a missing guard.

```ts
export const getWidgetById = publicQuery({
  reason: "Widget iframes load their own theme before any visitor signs in.",
  args: { widgetId: v.id("widgets") },
  handler: async (ctx, args) => { /* ... */ },
});
```

## What the builders do not do

They do **not** filter database reads automatically. Tables differ too much for
that to be safe generically, so handlers still scope their own queries. Use:

- `requireTenant(ctx)` — the caller's company, throwing if there isn't one.
- `assertTenantAccess(ctx, doc)` — reject a fetched document belonging to
  another tenant. Super admins pass; a document with no `companyId` is treated
  as global and only reachable by a super admin.

Authentication and role are guaranteed. Correct scoping is still the author's
job — the builders shrink the surface for mistakes, they do not remove it.

## Completed Builder Migration

`convex/authz-migration-allowlist.json` currently contains `maxEntries: 0` and an empty pending list. The structural migration is complete; this does not establish that every handler filters every record correctly. Keep the allowlist empty. `convex/authzEnforcement.test.ts` checks declarations and drift; it is a guard against bypassing the shared boundary, not a substitute for behavioral authorization tests.

Internal functions (`internalQuery`, `internalMutation`, `internalAction`) cannot be called directly by a browser. Their public callers still need to establish identity, ownership, and the right operation. Internal visibility alone does not make model-generated IDs or scheduled arguments trustworthy. Carry a server-established company or already-authorized holding into the internal call.

## Actions, Soft Results And Module Gates

`tenantAction`, `adminAction`, and `superAdminAction` resolve the caller through `actionAuth.ts`, because actions cannot use `ctx.db`. Their context includes `user` and `userId`, but not the query/mutation context's injected `companyId`. Use the active company from the authenticated user or an authorized target record, rather than accepting a browser or model claim as the tenant. `governanceAction` admits governance readers for exports; its guard does not mechanically prevent arbitrary side effects, so those handlers need explicit review of what they write.

`softQuery` and `softMutation` return a declared empty value when the session is absent or an optional role list rejects the caller. Authenticated handlers still receive the resolved identity. Their required reason explains why an empty result or no-op fits the surface. They do not convert a missing company into permission to read global data. A telemetry no-op and a successful privileged action must not be described as equivalent outcomes.

`moduleQuery` and `moduleMutation` add an effective workspace-module check after identity resolution. Their guard defaults to authenticated and can specify admin write, admin read, or governance access. Naming a module does not make an authenticated mutation safe for every role; the chosen guard and handler policy still decide writes. `effectiveModulesFor` combines normalized company additions with plan grants. Company additions remain available independently, while plan grants are excluded when billing blocks paid access. Company additions only add; withholding a plan-granted module requires the appropriate plan change rather than deleting an unrelated company override.

The module guard bypasses company flags for super admins, including impersonating ones. With no active company there is also no company module flag to test; the role and record-level checks must still establish permission. Navigation visibility is helpful product feedback, but the server gate protects direct calls. Never infer tenancy from a hidden menu alone.

## Shared Websites And Private Holdings

A `websites` row represents a host shared across customers. The entitlement record is `companyWebsites`: an owned website or competitor held by one company. Start from the caller's company and holding, then resolve the shared website. Starting with the shared host and walking outward to all companies risks exposing who tracks whom. `seoTools.ts:requireCompanyWebsite` is the host-to-entitled-website helper; platform record administration in `websites.ts` is a deliberate separate surface.

`siteAccess.ts:findMySite` checks `ctx.companyId`, loads the requested holding, and returns null if the holding belongs elsewhere. `requireMySite` turns absence into the same not-found error used for a missing site, preventing a guessed holding ID from revealing another company's membership. Neither function grants a special cross-company bypass based on a super-admin role: these client Sites helpers operate through the current company context. Use the admin surface's own verified policy for platform work.

`companyHolds` reads at most 200 company holdings and sorts owned sites before tracked ones, then by host. That bound matters when interpreting a group or count: it is not an unlimited inventory. `myRivals` builds the group from the owned holding and competitors tracked against it. A tracked holding without an owned parent uses the other company holdings as rivals, but has no tracked-search or question list through `listHold`.

## Private Search And Question Lists

`holdLists.ts` is the shared read path for `websiteKeywords`, `websiteQuestions`, per-question answer summaries, list summaries, and first-check requests. The helper itself accepts a holding ID and does not authenticate it. Callers must establish that holding through `requireMySite`, the admin company policy, or an equivalent server-side ownership check before passing it. A helper with a tenant-shaped argument is not automatically an authorization boundary.

`holdSearches` and `holdQuestions` use `by_hold` or `by_hold_active` indexes with caller-supplied caps. Single-entry helpers use holding-plus-keyword or holding-plus-prompt indexes. A null holding returns an empty list or null; it must never fall back to a global list. `holdQuestionAnswers` and `holdAiSummary` additionally use location, because an answer from another place is not the same list result. `askedPlace` intentionally follows the list owner's selected location rather than a display fallback. `listWebsiteId` supplies the shared website identity for facts while the list traversal remains private.

AI facts can be shared without sharing which questions a company chose to track. `siteListAi.ts` files per-list summaries as answers arrive; Sites readers consume the holding's ready rows rather than scanning every question and engine. Writers may find every list interested in a purchased answer to update those summaries, but must not return that cross-company fan-out to a customer screen. List removal and hold cleanup must remove the private materialisations through the appropriate purge helpers, independently of shared paid facts.

## Guard Evidence And Review Limits

`websiteTenancyGuard.test.ts` scans source for website-table access direction and holding-keyed list reads. It restricts cross-company list lookups to explicit writer, migration and purge modules. It also checks holding fields and indexed read direction for Search Console, Google Analytics/shared Google sign-in, and Bing tables; token readers have narrower exceptions. The rules are syntactic, bounded source checks. A passing declaration does not prove a particular handler authorized the holding before querying it, and the test was not run in this documentation pass.

This review inspected the common auth builders and role helpers, action resolution, module and soft wrappers, holding access, private-list helpers, and the structural guard source. It did not review every route and backend handler or perform a full security audit. Integration-specific guides document their own reviewed entry points. Changes to these boundaries should retain targeted two-company and oversight-role tests, checking both successful access and rejection without exposing private fields in error messages. No application code, policy, schema, or live data was changed for this documentation refresh.
