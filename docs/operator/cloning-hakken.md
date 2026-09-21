# Build a new application from Hakken

The default copy contains the framework **and Arcade**. Posture Studio, Properties,
Sales Reports and Sales Data are optional. Hakken itself keeps every feature.

## Prepare and preview

Use Node 24.18.0 and install the source repository's locked dependencies first:

```bash
npm ci
npm run template:build -- --dry-run
```

The preview lists the files, packages and commands affected. It creates nothing.
Exports use the current working files, including uncommitted edits and new files
that Git does not ignore.
The normal source guard, `npm run check:fences`, checks ownership and references
for every combination of optional modules, including references through Convex's
generated API and schema.

## Create the application

Choose a **new directory outside this repository**:

```bash
npm run template:build -- --out ../my-new-app
```

To include an optional area:

```bash
npm run template:build -- --keep base,properties --out ../property-app
npm run template:build -- --keep base,salesData,salesReports --out ../sales-app
```

| Name | What it includes |
| --- | --- |
| `base` | Administration, authentication, tenants, agents, workflows, tasks, calls, reception, wiki and shared connectors |
| `arcade` | Arcade routes, games, assets, score storage and game tooling; always retained |
| `movement` | Posture Studio, capture/replay tooling, avatars and motion-tracking dependencies |
| `properties` | Property search, listing storage and Rightmove-specific integration |
| `salesReports` | Sales and board report application |
| `salesData` | Sales imports, customer CRM, research and opportunity reports |

Both `base` and `arcade` are always included, even if omitted from `--keep`.
Unknown names are rejected. A stripped copy can be cut again, but cannot restore
code that was removed; return to the full Hakken source to add a missing module.

The output is staged and published locally only after packaging succeeds. An
existing output directory is refused. The result starts a new Git repository on
`dev`, with no commits, remotes or inherited Git template hooks.

## What the copy contains

The ownership declarations in `template.verticals.json` remove each unselected
area's files, routes, tests, assets and exclusive packages. Marked sections remove
its contributions to shared files. Shared packages stay when the framework needs
them: for example, Three.js serves Arcade, ZIP handling serves the wiki, and
chart export is shared.

Generic Apify jobs remain available without Properties. Calls, email and the wiki
remain available without Sales Data; customer matching then returns no match.
When Sales Data is included, the existing company-scoped CRM lookup is retained.

Translations, navigation snapshots and quality ratchets are adjusted for the code
removed. The source limits are never increased by packaging. The copied lockfile
is pruned offline, without running package lifecycle scripts or upgrading packages.

The copy excludes Git history, ignored files, credentials, environment files other
than `.env.example`, saved browser authentication, database exports, caches and
build output. Symlinks are not copied. Review any new data or secret file format
before adding it to source control; packaging is not a secret-content scanner.

Each export also records its source version, working-tree state, retained modules
and final file fingerprints in `.sonae/framework.json`. Commit that file with the
new product. A re-export gets new provenance and is marked as a product re-export;
it is not an upstream framework release.

## Configure and verify

First use [Product Setup](./product-setup.md) to preview the new application's
identity, provider requirements and deployment names. The initialiser applies only
when explicitly run with `--apply` inside the clone.

```bash
cd ../my-new-app
npm ci
npm run check
```

Use `.env.example` to configure a **new Convex deployment** and the app's own
provider credentials. Then run `npm run build`, start the application and verify
login, company access, the assistant and Arcade. The copy has no connection to
Hakken's backend until you explicitly supply connection settings.

For repeatable local packaging checks from the full source:

```bash
npm run template:verify
npm run template:verify -- --matrix --browser
npm run template:verify -- --case salesReports
```

The first command installs, runs the source guards/lint/types/tests and builds a
framework + Arcade copy. `--matrix` additionally checks each optional area on its
own with the framework. `--browser` runs the deterministic auth/admin/chat/security
smoke suite and Arcade's four-district rendering and touch-control checks on the
base copy, using fixtures and port 3100. These checks use
placeholder backend URLs, do not deploy, and do not prove a customer's live
provider configuration. Logs and copies are retained in the printed temporary
directory; successful copies' installed dependencies are removed to save space.
Use `--case` to recheck one named area independently after a packaging change.

Finish naming, branding, domains, providers, deployment configuration and live
readiness using the [Vertical App Packaging Checklist](./vertical-app-packaging-checklist.md).
Update the copied `AGENTS.md` repository/remote guidance for the new application.
The hosting workflow also needs its service/repository names and secrets. Do not
enable its deployment workflow until those are configured.

## Build and maintain the product

Use [Product Recipes](../developer/product-recipes.md) to preview a service desk,
project tracker or internal knowledge assistant. Use the
[Feature Generator](../developer/feature-generator.md) for individual records.
Neither runs automatically during export.

For later core changes, follow [Framework Updates](./framework-updates.md). A fresh
export with the same optional modules is compared against the recorded baseline;
product overlaps and retained overrides receive explicit review.

## Maintain the boundary

Register optional company modules in `convex/utils/companyModules.ts` and declare
their owned paths, exclusive dependencies, commands and translation namespaces in
`template.verticals.json`. Patterns support `*` and `**`; route brackets are literal.
Owned paths must exist and may not belong to two independent areas. Shared files
can declare multiple owners and survive while any owner remains.

Wrap contributions to shared code with standalone removal comments. A comma-separated
owner list retains the block while any named owner remains. Nested blocks still
belong to their enclosing block. Markdown uses HTML comments and JSX uses JSX
comments. Keep actual removal instructions out of string literals.

Run `npm run check:fences` after changing the map or any shared boundary. Run the
full template matrix before handing over a change to the packaging mechanism.
The lightweight reference guard catches structural mistakes; the generated-app
checks catch type, runtime, layout and test-fixture dependencies it cannot infer.
