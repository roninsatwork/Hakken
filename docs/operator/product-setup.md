# Initialise a product after cloning

Phase 1 adds product defaults and setup tooling. Arcade remains framework code.
The initialiser is a local file editor: it does not install packages, change Git
remotes, create tenants, set secrets, contact providers, or deploy anything.

## Preview, then apply to the clone

Start with the copy described in [Cloning Hakken](./cloning-hakken.md). Run the
following commands **inside that new application's directory**, using Node
`24.18.0`. These are operator instructions, not steps run against Hakken itself.

1. Copy `sonae.product.json` to a separate input file, for example
   `my-product.json`, and edit the values below. Keep credentials out of both.
2. Preview the exact target file list and intended product settings:

   ```bash
   npm run product:init -- --config ./my-product.json
   ```

3. Review the configuration and files listed, then explicitly apply:

   ```bash
   npm run product:init -- --config ./my-product.json --apply
   ```

`--root <clone-directory>` targets another clone. `--json` produces machine-readable
preview/apply output. Without `--apply`, no file is written. Unknown options,
unknown configuration fields, invalid values, symlinked targets and changed
runtime templates are rejected. Applying to the Hakken origin is refused; the
fresh exporter repository has no remote. Configure its own remote separately.

The initialiser validates every target before writing, refuses a stale plan and
restores earlier writes if a later replacement fails. Repeating the same input
makes no further changes. Review and commit the resulting diff using your usual
workflow. Keep existing work committed or backed up before any bulk file change.

## Configuration

`sonae.product.json` is the applied configuration. It contains **no credentials**.
`schemaVersion` versions this configuration format; it is not a framework release
version or an upgrade history.

| Section | What to set |
| --- | --- |
| `identity` | Product name, lowercase package slug, browser title, description, public footer tagline, brand colour and optional HTTPS logo URLs. |
| `deployment` | New repository URL, public HTTPS app origin (blank during local development), Cloud Run region, service and Artifact Registry repository names. This describes the existing Cloud Run workflow; it does not provision hosting. |
| `bootstrap` | Optional first super-admin email. The existing `INITIAL_SUPER_ADMIN_EMAIL` sign-in flow performs bootstrap after the environment is configured. |
| `email` | Optional sender display name and bare sender address for the generated environment example. Verify the sender domain with your mail provider separately. |
| `providers.auth` | One or both of `google`, `resend`. Every listed provider is required in production. |
| `providers.ai` | Any combination of `vertex`, `openai`, `anthropic`, `openrouter`. Every listed provider is required in production; an empty list is allowed for a product without AI requirements. |
| `features` | Boolean credential requirements for `email`, `knowledge`, `webIngestion`, `apify`, `gmail`, `voice`, `telephony` and `widget`. |

These selections describe **configuration requirements**. They do not remove
code, hide routes, authorise users, activate agents or select models in the
runtime. Choose module access through company Features and model defaults through
AI administration. Stored branding settings continue to override backend defaults.

The initializer preserves sender quotation marks and literal backslashes in the
environment example. If a combination of quote styles cannot be represented
safely in dotenv, preview fails before any files are written; simplify the sender
name and preview again. It never prints credentials in that error.

The shipped configuration describes Hakken's Google sign-in, email and Vertex/
knowledge requirements. For email sign-in plus another text-model provider,
select `resend` and that provider. Knowledge embeddings still require Vertex;
voice and telephony also require Vertex in the current implementation. Turning
those requirements off is appropriate only when the product will not use them.

## Files the initialiser owns or updates

- Applies `sonae.product.json` and generates `product.identity.ts`, containing
  **public identity only**. Private setup metadata is not included in that browser
  module. Edit the configuration and rerun the preview to update it.
- Wires root page metadata, public navigation/footer and backend branding
  defaults to that identity module. Existing stored settings take precedence.
- Updates the package name in `package.json` and the two root-name fields in
  `package-lock.json`; dependency versions are unchanged.
- Lowers the branding ratchet for the removed hardcoded backend default.
- Updates the README title and AGENTS title/remote guidance, preserving their
  remaining content and project rules.
- Updates the existing deployment workflow's region, service and artifact
  repository. Branch triggers, gates and deployment permissions are unchanged.
- Generates `product.env.example` with non-secret identity values and **blank
  credential placeholders** for the selected providers and capabilities.

Framework attribution remains. The public logo icon and public-site palette are
still controlled by the site's own components/CSS; `identity.logoUrlLight`,
`identity.logoUrlDark` and the brand colour feed the existing settings defaults.
Public pages, translations, icons, screenshots and product-specific marketing
copy still need editorial review. This is not a global search-and-replace of
Hakken's history, documentation, tests or examples.

## Configure environments deliberately

For normal local development, `.env.example` retains the local Convex defaults.
For a new hosted product, `product.env.example` lists the selected requirements.
Fill in a **new** deployment's URLs and keys in the appropriate environment; the
initialiser never reads or overwrites `.env` or `.env.local`.

- Next.js needs `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_APP_URL`,
  `CONVEX_SITE_URL` and deployment selection as appropriate.
- Convex needs `SITE_URL`, `CONVEX_SITE_URL`, `INITIAL_SUPER_ADMIN_EMAIL`,
  its own Auth signing keys (`JWT_PRIVATE_KEY`, `JWKS`) and selected provider keys.
  Generate signing keys per deployment using Convex Auth's setup tooling.
- The widget signing secret, when required, belongs in both environments.
- Keep `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` explicit for Vertex.
  The hosting region and model region are separate choices. Knowledge uses the
  existing embedding-specific region/model configuration.

Both checks share `scripts/provider-requirements.mjs` and the product file:

```bash
npm run setup:validate
npm run setup:validate -- --profile=production
npm run verify:deployment -- --prod
```

`setup:validate` reads `.env`, then `.env.local`, then process environment
(overrides win). Production checks expect a combined inventory of frontend and
backend settings; putting a key in a local file does not configure Convex.
The checker validates presence, URL shape/origin and email format without printing
values. A credential-free local setup produces warnings; `--strict` makes those
warnings fail the check. Completely unconfigured, unselected features are skipped;
a partly configured provider/integration fails rather than looking ready.

`verify:deployment` is a **read-only live Convex environment listing**, invoked
only when the operator runs it. It checks non-empty key names against the same
provider requirements and fails for unclassified direct backend environment
reads. It neither validates secret contents nor checks the frontend environment.
Both commands accept `--config <file>` for a different product configuration.
Neither authenticates provider credentials or proves application readiness.

## Finish the handoff

Use [Vertical App Packaging](./vertical-app-packaging-checklist.md) and
[New Agentic App Setup](../developer/new-agentic-app-setup-checklist.md) for tenant,
model, knowledge, connector and agent setup. The legacy
`bespoke-installation/master-setup.zsh` is a separate live GCP/Google/Resend
provisioning workflow; it is not a provider-neutral local initialiser and does
not automatically consume this configuration.

The existing deployment workflow still needs its own GitHub secrets and hosting
resources before a push to `main`. Monitoring needs deliberate environment/build
configuration too; see [Deployment](../developer/deployment.md).
[Product Recipes](../developer/product-recipes.md) now provide optional generated
records and setup guides; they do not seed live data.
[Framework Updates](./framework-updates.md) provides the reviewed update process.
Optional Stripe billing is disabled by default. Configure a clone using
[Stripe Billing](./stripe-billing.md).
