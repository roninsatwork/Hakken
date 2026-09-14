# Bring framework updates into a product

An exported product keeps its own code and Git history. Framework updates are an
explicit review and integration, using a fresh export with the same optional
modules. The tooling compares files and records decisions. It never fetches,
merges, copies incoming code, installs packages, changes remotes or deploys.

## The export baseline

Every new export includes `.sonae/framework.json`. Commit it with the initial
product. It records the source commit when available, whether the source had
uncommitted work, the retained modules, and SHA-256/executable-bit fingerprints of
the actual exported files after fences and the lockfile were adjusted. Base and
Arcade are always present.

The fingerprints describe an export; they are not a signature or proof of a
trusted release. Use a reviewed Sonae source version. An export of uncommitted
work is labelled as a working-tree snapshot. A product re-export is identified
separately and cannot become an upstream framework baseline: its product changes
would otherwise be mistaken for framework changes.

Clones created before provenance was added have no reliable baseline for this
tool. Continue with an explicit manual comparison against the known original
Sonae version, or start from a fresh export and port the product changes. Do not
copy today's provenance into an older product or guess its starting commit.

## Prepare the comparison

1. Review the incoming Sonae version, its release/security notes and migration
   requirements in a separate checkout. Preserve any existing local work when
   obtaining that version.
2. From that source, export into a new sibling directory using the same module
   list as the product's `.sonae/framework.json`:

   ```bash
   npm run template:build -- --keep base --out ../incoming-framework
   ```

   Include the product's optional modules where applicable. Do not initialise or
   edit this incoming export; the comparison checks its complete file inventory,
   hashes and executable bits. A changed module list requires a separate migration.

3. From the product, preview or write a review plan outside both directories:

   ```bash
   npm run framework:update -- --upstream ../incoming-framework
   npm run framework:update -- --upstream ../incoming-framework --write-plan ../framework-review.json
   ```

   The first command is read-only. The second creates a new JSON file and refuses
   an existing destination. Neither changes the product. `--root <product>` is
   available when running from a separate tooling checkout.

The review distinguishes incoming additions, edits and deletions, files already
aligned, and overlaps where both product and framework changed. Other product
changes are listed separately and preserved. This is a file-level comparison:
an overlap may be easy to merge, but the tool never assumes that automatically.
Binary files and executable-bit changes are included. Symlink/file-directory
collisions stop comparison for explicit review.

## Review and integrate

Work on `dev` or a review branch with a local Git checkpoint. Inspect the actual
incoming files alongside the product and use the known source version for base
context. The fingerprint baseline does not store old file contents.

Review related changes together: package and lockfile, schema and data migration,
permissions and tests, identity defaults and deployment configuration, both
locales, shared generated contracts and product-specific routes. Never replace
product identity, provider selections or deployment names simply because they
appear in the incoming list.

For **every** incoming entry in the JSON, replace `decision: "review"` with:

| Decision | Meaning |
| --- | --- |
| `take-upstream` | You integrated that exact file, including executable mode; for an upstream deletion, you removed it. Recording verifies the resulting fingerprint. |
| `keep-product` | You deliberately retain a product version, including a manually merged result. Supply a non-empty `reason` describing the decision. |

Already-aligned files also need a decision. Make source edits through your normal
review process. Only edit `decision`, `reason` and the top-level `verification`
text in the JSON; paths and baseline/incoming fingerprints are checked again.
If the incoming export or baseline changes, generate a fresh plan. The product
can change during deliberate integration; recording captures its final checkpoint.

Run the product's checks after integration: `npm ci`, `npm run verify:env`,
`npm run lint:all`, `npm run check`, `npm run build` and `git diff --check`.
Run relevant browser/provider checks and migration rehearsals when affected.
Describe the checks actually completed and any remaining release restrictions in
`verification`. The tool records your statement; it does not run or certify them.

## Record the reviewed baseline

Commit the reviewed product integration **locally**, including any new files.
Then, with a clean product checkout on `dev` or a review branch:

```bash
npm run framework:update -- --upstream ../incoming-framework --record-review ../framework-review.json
```

This verifies all decisions, the pristine incoming export and a clean committed
product checkpoint. It writes only the new `.sonae/framework.json` and a review
record under `.sonae/reviews/`, containing the checkpoint, decisions, resulting
product fingerprints and verification statement. Failed writes restore the prior
baseline. Review and commit these metadata files locally with the update.

The next comparison uses the newly reviewed upstream baseline while still
identifying retained product differences. Skipped framework fixes remain product
overrides: review their reasons before release, especially security fixes. Old
review records remain in Git. Recording does not erase the need to deploy data
migrations or complete a product release.

If integration fails verification, do not record the baseline. Use the local Git
checkpoint and normal review process to revise or revert the integration. The
tool performs no reset, stash or automatic conflict resolution.

See [Cloning Sonae](./cloning-sonae.md), [Product Setup](./product-setup.md) and
[Product Recipes](../developer/product-recipes.md).
