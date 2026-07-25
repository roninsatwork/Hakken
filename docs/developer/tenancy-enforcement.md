# Tenancy Enforcement

Every client-callable Convex function must be declared with a builder from
`convex/tenantFunctions.ts`. This is checked by
`convex/authzEnforcement.test.ts`, so it fails CI rather than review.

## Why

Tenancy used to be enforced by convention: each of ~360 public functions had to
remember to resolve the caller and scope its own reads. The discipline was
genuinely high — 339 of 360 had a guard — but nothing made an omission
impossible, and the gap is where incidents come from. One anonymous read of
another tenant's agent traces reached production this way and was fixed in
`convex/swarmRuntime.ts`.

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
| `adminQuery` / `adminMutation` | `ADMIN` or `SUPER_ADMIN` | same |
| `superAdminQuery` / `superAdminMutation` | `SUPER_ADMIN` | same |
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

## The migration backlog

`convex/authz-migration-allowlist.json` lists the functions that predate this
rule. It may only shrink:

- **Never add to it.** New functions must use a builder.
- Migrating a function means deleting its entry and lowering `maxEntries`.
- The test fails on stale entries, so the list cannot drift.

Migrating is usually mechanical: swap `query` for the matching builder and
delete the now-redundant guard call. Do it a module at a time, and keep the
module's existing auth tests — they should pass unchanged, which is the proof
the swap preserved behaviour.

Internal functions (`internalQuery`, `internalMutation`, `internalAction`) are
not covered: they cannot be called by a client, only by other Convex functions.
