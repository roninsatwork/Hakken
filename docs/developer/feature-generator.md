---
product: Hakken
documentation_type: Developer guide
feature_area: Tenant feature generator
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/feature-generator.md
last_reviewed: '2026-10-26T15:05:19+00:00'
reviewed_against: current implementation
status: Current
---
# Build a feature after cloning

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Tenant feature generator
> **Reviewed:** 26 October 2026, 15:05:19 GMT (Europe/London)
> **Source path:** `docs/developer/feature-generator.md` · **Status:** Current


The feature generator creates a working, company-scoped administration feature
in a cloned product. It previews by default and writes local files only with
`--apply`. It does not deploy Convex, change credentials or create database rows.
Arcade remains part of the framework.

## Preview and apply

From the product checkout, after `npm ci` with the repository's Node version:

```bash
npm run feature:generate -- supplier --field name:string --field active:boolean
```

Review the chosen table name, route, label/search field and file list. Then repeat
with `--apply` when those choices are correct:

```bash
npm run feature:generate -- supplier --field name:string --field active:boolean --apply
```

Generate related entities in dependency order. For example, once `suppliers`
exists, preview a purchase order with a required supplier link:

```bash
npm run feature:generate -- purchase-order \
  --field title:string --field amount:number --field due:date \
  --field supplierId:ref:suppliers
```

Again, adding `--apply` writes the proposed files. `--root /path/to/product` selects
another checkout; `--dry-run` is an explicit alias for the default preview.

Entity names use singular lowercase words separated by hyphens. Field names use
camelCase. No fields means `name:string`. The first string field is the record
label and full-text search field. Pluralisation is intentionally simple: inspect
the reported table and route before applying.

## What it creates

- A separate table-definition module, wired through a shared schema registry,
  and complete create/read/update/delete functions with
  argument and return validators, company ownership and server-side validation.
- A list at `/admin/<plural-route>` with full-text label search and cursor-based
  Previous/Next pages of 15 records. Search is over the company index, not just
  the currently loaded page; it uses Convex full-text matching, not substring matching.
- A create form, record detail route, edit form, delete confirmation, loading,
  empty, unavailable and error states, using Hakken's screen kit.
- Required relationship selectors with indexed search, 15-result pages and
  readable labels. The detail page links to the related record.
- English and Italian interface copy, sidebar links, frontend route permission
  wiring, and local Convex API type declarations. English field labels are derived from the supplied names. Common Italian
  labels are built in; other names require explicit Italian copy.
- Backend tests for CRUD, stale edits, pagination/search, role restrictions and
  tenant isolation; relationship boundary/deletion tests; form submission and
  failure/retry tests; route and layout access tests.

The root schema receives one shared registry binding. If its three wiring lines
cross the existing 50-line size band, the preview includes the corresponding
`code-ratchets.json` adjustment. An already-stale baseline is refused; later
features add separate table files without growing the root schema.

The generated API declaration is updated locally so TypeScript can check the
feature without contacting Convex. The next normal Convex codegen owns that
file again. The new backend functions still need a separate, deliberate deployment
before the feature can run against a server.

## Field and relationship rules

| Declaration | Stored value and validation |
| --- | --- |
| `name:string` | Required trimmed text; label field at most 200 characters, other text at most 2,000 |
| `amount:number` | Required finite number; zero and negative values allowed |
| `active:boolean` | Required boolean; unchecked means false |
| `due:date` | Required valid calendar date stored as `YYYY-MM-DD` |
| `supplierId:ref:suppliers` | Required Convex ID of a record in the same active company |

For names outside the small built-in Italian vocabulary, supply
`--label-it "Italian feature name"` and
`--field-label-it 'fieldName=Italian field label'`. The generator refuses missing
translations instead of copying English sentences. These flags can also override
the defaults. For example:

```bash
npm run feature:generate -- asset --label-it "Beni" \
  --field name:string --field serial:string --field-label-it 'serial=Numero di serie'
```

Up to 20 fields are supported. Optional fields, enums, uploads, computed values,
many-to-many links and links into framework-owned tables require product-specific
code. Relationships currently target earlier generated entities whose schema
contract is unchanged. This avoids guessing another feature's permissions,
indexes or business rules.

`product.entities.json` records generation order and field contracts. Its generated
relationship guard checks for dependent records before deleting a parent. Remove
or change the dependent links first; the generator does not choose cascading
business-data deletion. Both creating and updating a link verify the target's
company. Deleting a parent and creating a child are transactionally checked.

An editor captures the record revision when opened. Saving an outdated form is
refused with an inline error; close and reopen it to review current values.

## Access and navigation

| Role | Generated feature |
| --- | --- |
| `ADMIN` | Read/create/edit/delete within their active company |
| `SUPER_ADMIN` | Same operations within the selected/impersonated active company |
| `READ_ONLY` | Read, search and follow related records; write controls hidden |
| `USER`, `AUDITOR`, signed out | Refused by the backend |

Generation adds company-admin access only for the generated route prefixes.
Existing platform administration routes retain their previous restrictions.
Company admins see feature links in their company menu; platform admins and
read-only users also see them in the administration menu. No per-company feature
flag is created automatically. A super admin needs an active company to use
these features; these are workspace records, not a cross-company directory.

## Review and verification

Review the diff, then run the normal repository checks and production build:

```bash
npm run check
npm run build
```

The tests generated alongside the feature run with the normal suite. The schema
and functions are local until you deliberately run your normal Convex development
or release process. Use a separate local/preview deployment for browser checks
before releasing a product.

The generator refuses existing files, routes, table names, locale namespaces,
unknown relationships and changed wiring anchors before writing. It rechecks the
plan before application, refuses symlink targets, replaces files without modifying
hard-linked originals, and rolls back successful earlier edits after a write error.
A process crash is not a database transaction: use Git to review or recover the
working tree before retrying an interrupted run.

Generated feature source belongs to the product and can be edited normally.
Generation is creation-only, not a migration or overwrite command. Shared generated
route/reference files and their generated access tests must remain in sync with
the registry; the generator refuses to replace custom edits to those files.
Review product-specific rules, retention/export/deletion responsibilities, audit
requirements and domain translations before storing real customer data. The
scaffold does not invent those policies from field names.

## Current Implementation And Review Boundaries

These procedures describe local creation tools for an explicitly requested new product or feature. They are not authorization to generate application files during Hakken documentation maintenance. This run inspected scripts only: it did not create a clone, apply a recipe, generate a schema, install dependencies, write product defaults, create tenants or deploy anything. The current Hakken repository and its separate upstream remain distinct identities.

`template.verticals.json` currently has no optional vertical definitions; base and Arcade are retained. Older instructions describing four opt-in application areas or restored Sales/Properties/movement routes do not match this checkout. Residual schema/callback compatibility must be inspected independently, and absence of a screen does not authorize deletion of historical records.

Agent setup uses the current scratch Add page sharing Settings sections. The retained template API and local demo seed are different entry points, not proof the old guided builder is available. Passed evals and release policy are readiness advice in the current activation path. A recommended review checklist should never be presented as backend refusal unless the source actually enforces it.

Stored configuration and catalog capability do not prove live integration acceptance. General text adapters include Google Vertex, OpenAI, Anthropic and OpenRouter; TypeSafe is Decision-only, and specific media/grounding/embedding jobs have narrower requirements. Live voice and phone paths must follow [Spoken channels](./spoken-channels.md), while Gmail mailbox polling is retired. Do not revive old features because a retained generic connector/configuration key still exists.

For a real implementation task, use current [AGENTS.md](../../AGENTS.md) gates including coverage and browser smoke where required, rather than an abbreviated gate list copied into an old checklist. Product intent/acceptance changes need their own agreement. Local source/tests, generated test files and a passing configuration validator are separate from a deployed provider/account accepting the actual customer workflow.

## Preview Integrity And Generated Contracts

`scripts/generate-entity.mjs` parses arguments, builds a plan and prints the source edit list. Default invocation is preview; `--apply` calls `applyEntity`. The model accepts string, finite number, boolean, calendar-date and reference fields, with at most twenty fields and a required string label/search field. Unknown, reserved or duplicate field/entity names refuse planning rather than produce ambiguous schema. A reference targets a known generated table; it is not permission to join arbitrary private tables.

The planner records each file's before state, rejects path/symlink collisions and stale shared generator contracts, then validates all before values again before and during application. New files use exclusive publication and existing edits use temporary replacement. A caught application failure restores earlier writes and removes directories created by that apply where possible. This protects ordinary local failures; it is not a guarantee against power loss or unrelated concurrent changes outside planned targets.

Generated records carry company ownership, timestamps and edit revisions. Relationship guards reject foreign-company links and block deleting a referenced parent. Updates/deletes require the expected revision, so a stale form should receive a conflict instead of overwriting another editor's work. Generated tests demonstrate these intended contracts but must actually run in the new product before release. Generation installs no runtime database rows, provider connection or public customer portal.
