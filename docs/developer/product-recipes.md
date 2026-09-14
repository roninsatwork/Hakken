# Product recipes

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
