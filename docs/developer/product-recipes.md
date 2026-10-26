---
product: Hakken
documentation_type: Developer guide
feature_area: Product recipes
audience: developers and product operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/product-recipes.md
last_reviewed: '2026-10-26T15:05:19+00:00'
reviewed_against: current implementation
status: Current
---
# Product recipes

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Product recipes
> **Reviewed:** 26 October 2026, 15:05:19 GMT (Europe/London)
> **Source path:** `docs/developer/product-recipes.md` · **Status:** Current

Recipes combine existing framework capabilities with a small set of generated
records and a product-specific setup/launch guide. Start after
[Product Setup](../operator/product-setup.md), inside your new clone.

```bash
npm run product:recipe -- --list
npm run product:recipe -- service-desk
npm run product:recipe -- service-desk --apply
```

The default command previews every file. Only `--apply` writes files; it never
creates tenants, seeds records, configures providers, activates agents, installs
dependencies or deploys. Arcade remains part of the framework.

| Recipe | Generated records | Existing capabilities used |
| --- | --- | --- |
| `service-desk` | Service customers and linked service cases | Company/staff administration; optional knowledge and assistant drafting |
| `project-tracker` | Delivery projects and linked deliverables | Company roles, navigation and shared record screens |
| `knowledge-assistant` | None; installs the setup/launch guide | Company knowledge, agent configuration, evaluations and `/app/assistant` |

Record recipes use the [Feature Generator](./feature-generator.md): create/edit
forms, record pages, indexed label search, 15-row cursor pages, relationship
validation, optimistic edit revisions, English/Italian labels and generated tests.
ADMIN and SUPER_ADMIN can write within the active company; READ_ONLY can read.
Ordinary USER and AUDITOR accounts cannot use the generated staff screens.

The service desk is an internal staff starter. Public customer access, inbound
email and outbound responses need additional product rules. The project tracker
uses a simple Done flag; assignments, reminders and reporting are follow-up work.
The knowledge recipe uses existing surfaces instead of generating duplicate
knowledge storage. None is a finished product or a live agent deployment.

## After applying

Read `docs/product/<recipe-id>.md` in the clone. It records the setup steps, a
first workflow, role boundaries, launch checks and decisions that remain. Review
the generated fields before entering real data: all are required, strings are
plain text, dates are calendar dates, and numeric fields accept finite numbers.
Product-specific email, range and status rules need explicit implementation.

Run `npm ci`, `npm run verify:env`, `npm run check`, `npm run lint:all` and
`npm run build`. Then complete the guide's launch checks in your own test
deployment. Mocked tests do not prove provider connectivity or a live release.

You can apply different recipes to the same product. Each recipe is planned in
memory against the prior recipe's generated schema, navigation and locales. Every
collision is checked before applying any feature, and a failed write rolls back
the files already written. Concurrent edits are preserved rather than overwritten
during rollback. A repeated recipe ID, existing guide, modified shared generated
contract or symlink stops the operation. Resolve the cause and preview again.

`product.recipes.json` records IDs, versions and definition fingerprints.
`product.entities.json` owns the generated record definitions. Keep both with
the product. Recipe versions identify what was installed; they are not automatic
migrations. Review future recipe changes against your customised product.

## Add a reusable recipe

Definitions live in `scripts/product-recipes/catalog.mjs`. Add a unique kebab-case
ID, integer version, purpose, entity argument lists, setup steps, first workflow,
launch checks and explicit remaining product decisions. Entity arguments are
parsed as data by the existing generator; the runner does not execute commands
from a recipe. Define parent records before child records and supply Italian
labels for each unfamiliar entity/field.

Use existing framework knowledge, users, agents and workflows when they already
provide the required capability. Do not generate a parallel copy of those tables.
Exercise the recipe in a temporary clone with both locales, multiple tenants and
read/write roles before adding it to the catalog. For later framework changes,
follow [Framework Updates](../operator/framework-updates.md).

## What The Recipe Runner Actually Does

`scripts/product-recipe.mjs` accepts a catalog ID and optional root/apply/dry-run flags. `--list` prints available definitions. Unknown, duplicate/incomplete options or conflicting apply/dry-run choices refuse. The command calls `planRecipe` and prints each edit before either returning the preview or passing that plan to the shared entity apply implementation. It does not execute commands stored in a recipe definition.

The catalog is ordinary local data in `scripts/product-recipes/catalog.mjs`: ID/version/title/purpose, parsed entity argument arrays, setup instructions, a first workflow, launch expectations and remaining decisions. Parent-before-child ordering matters for linked generated records. Recipes reuse identity, users, knowledge and agents rather than creating a parallel copy of those framework tables. The knowledge recipe can add setup guidance without inventing new knowledge storage.

`service-desk` creates internal staff customer/case records with a plain contact-email field and a simple closed flag. It does not implement public customer admission, incoming mail, outbound customer responses, assignments or service-level policy. `project-tracker` uses linked projects/deliverables with a simple completion field, not a full project-management service. `knowledge-assistant` configures existing surfaces and leaves provider setup, approved sources and representative behavior checks to the actual product task.

## Planning, Atomicity, And Existing Work

The recipe plan combines generated entities, shared contracts, registry records and its guide before applying. It uses the same source-before-state checks as individual feature generation. Existing output/recipe identifiers, a modified generated shared contract or symlink are reasons to stop and inspect the diff, not instructions to delete user files. A failed apply attempts to roll back its own earlier writes. It must not stash unrelated work or overwrite files merely to make a new recipe fit.

Two different recipes can coexist when their planned paths and definitions are compatible. Registry versions/fingerprints record installed local definitions. They are not an automatic schema/data migration system and do not silently upgrade customized records to a newer catalog design. A future recipe change must be reviewed against real product data and expected lifecycle, including deletion/reference rules and tenant access.

The generated source belongs to the new product. Its business rules still need review: plain strings do not become validated email addresses, numbers do not gain business ranges, and a boolean does not define an agreed multi-stage workflow. Relationships enforce implemented ownership/deletion constraints; they do not decide customer-facing permissions that have not been designed. The generated administration route can receive explicit generated staff access wiring in that clone, which does not broaden every platform route in Hakken.

## Product Identity And Provider Setup

Initialize only a fresh clone with its own Git identity and deployment. `product:init` validates the declared configuration, previews target edits, and refuses the active Hakken origin for an apply. It changes local identity/default/template files only when explicitly applied. It does not create external resources, issue credentials, bootstrap an account without the real auth path, or configure a live payment/provider service.

The generated setup document under the clone's `docs/product/<recipe-id>.md` is guidance for that new product. In this Hakken repository, existing `docs/product/` is dated research and remains unchanged. Running a generator here would be application work outside a documentation-only maintenance task. Reading a command in this guide is not blanket authorization to execute it.

Provider requirements express expected configuration, not module activation or successful calls. Stored backend settings can override clone defaults. Company-admin frontend billing, platform Stripe setup, supplier model spend and credit usage have separate ownership. Select the appropriate runtime model use case rather than embedding an example model literal into the generated domain code.

## Verification And Handoff

Check the exact generated diff, including schema, indexes, generated route access, shared navigation, locale parity and tests. Then use the current complete AGENTS verification requirements in the new repository. Verify tenant/read-only boundaries and stale edits with meaningful fixtures. Provider acceptance, real authentication, customer delivery and production deployment remain separate checks; generated test source does not establish that they happened.

No recipe, clone export, dependency install, schema generation, seed, provider request or deployment was performed during this documentation review. [Feature generator](./feature-generator.md), [Product extension](./product-extension-guide.md), and [Framework updates](../operator/framework-updates.md) explain the related source boundaries. Keep the actual product decisions, approval scope and unrun checks explicit in a handoff rather than describing the starter as a finished application.
