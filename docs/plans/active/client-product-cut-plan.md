# The Clean Cut — turning a clone into a client's own product

**Agreed 2026-08-23; scope updated 2026-09-13.** A new application receives
Sonae's framework **including Arcade**, plus the optional product areas explicitly
selected for that application. The source Sonae repository keeps everything.

This serves the client-owned lane in [PRODUCT.md](../../../PRODUCT.md).
The operator instructions are [Build a new application from Sonae](../../operator/cloning-sonae.md).

## Agreed scope

Arcade is a permanent part of the framework. The four removable areas are:

| Name | Application area |
| --- | --- |
| `movement` | Posture Studio and its capture, replay, models and tooling |
| `properties` | Property search and Rightmove-specific processing |
| `salesReports` | Sales and board reports |
| `salesData` | Sales imports, customer CRM, research and opportunity reports |

Authentication, tenants, administration, agents, workflows, tasks, calls,
reception, wiki and generic connectors remain in the framework. Calls and email
continue to work without the optional CRM; customer matching then returns no match.

## Implementation

`npm run template:build -- --out ../new-app` writes a new framework + Arcade
application outside the source checkout. `--keep` adds optional areas and
`--dry-run` previews the cut without writing anything.

`template.verticals.json` declares ownership of whole files, routes, tests,
assets, exclusive packages and scripts. The existing line fences remove each
area's contributions to shared files. Multiple owners retain shared code until
all its owners are removed. Registry entries, locales, generated API references,
snapshots, allowlists and code-quality limits are adjusted to the retained code.

The exporter excludes credentials, local recordings, caches and build output;
respects Git ignores; rejects symlinks and existing output directories; and
stages the result before publishing it locally. It rebuilds the dependency lock
from the existing lock without lifecycle scripts or network requests and starts
a fresh Git repository with no history, remote, hooks or commits.

The source guard validates ownership and checks imports, backend function calls
and table references for all 16 combinations of the four optional areas. A new
optional module with no owned paths fails the guard. Arcade paths cannot be
assigned to a removable area.

## Verification and acceptance

**Completed locally 2026-09-13. Overall: 100%. Verification: 100%.**

- [x] Declare ownership for the four optional areas and protect Arcade.
- [x] Remove owned paths and shared contributions from copies only.
- [x] Prune exclusive packages and keep a reproducible lockfile.
- [x] Add ownership/reference checks to the existing source guard.
- [x] Document preview, export, configuration and verification.
- [x] Verify the framework + Arcade copy installs, checks, builds and starts
  (4,130 tests, 19 browser smoke checks and two Arcade browser checks passed).
- [x] Verify each optional area builds independently with the framework.
- [x] Complete source regression checks and production build (6,428 tests passed).

The five generated configurations passed locked installation, source guards, lint,
type checks, tests and production builds:

| Generated application (all include Arcade) | Passing tests | Build |
| --- | ---: | --- |
| Framework | 4,130 | Passed |
| Framework + Sales Reports | 4,142 | Passed |
| Framework + Properties | 4,158 | Passed |
| Framework + Posture Studio | 6,025 | Passed |
| Framework + Sales Data | 4,493 | Passed |

Sonae itself passed environment verification, full lint, `npm run check` (6,428
tests) and its production build. After the final removal-boundary adjustments,
55 focused regression tests, targeted lint and all 16 boundary combinations
passed. The base copy additionally passed 19 browser smoke checks and two Arcade
checks covering touch controls and rendering all four districts. The local
frontend was restored on port 3000 after the source build.

`npm run template:verify -- --matrix --browser` creates temporary copies,
installs locked dependencies, runs guards/lint/types/tests, builds the base and
each optional area, and runs the base browser smoke suite. These checks use
placeholder backend URLs and browser fixtures. They do not deploy a backend or
prove a customer's live provider settings.

The source must remain byte-identical before and after an export. Regression
tests verify this on probe repositories, alongside destination safety and secret
exclusion. Sonae's own runtime behaviour and optional applications remain intact.

## Out of scope

Rebranding, creating a customer's hosted backend, provider configuration,
publishing, and splitting Sonae into separate repositories remain separate work.
The frozen movement implementation is unchanged.
