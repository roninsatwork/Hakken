# Convex Environment Variables Reference

Last reviewed: 2026-08-30
Status: matches the variables set on the deployment and the code that reads them
Audience: engineers and operators configuring or auditing a Convex deployment.

## Purpose

This reference explains every environment variable set on the Convex deployment
(Convex dashboard → Settings → Environment Variables): what each one is for,
what reads it, and what stops working without it.

These values live **per deployment**. Dev and production each hold their own
copies; deploying code never carries them across. Set a value with the
dashboard or with:

```bash
npx convex env set NAME value
```

`npm run setup:validate -- --profile=production` checks presence and shape of
the required values before a handoff — see
[Deployment](./deployment.md#pre-deployment-setup-validation). Variables for
the Next.js runtime and CI (`NEXT_PUBLIC_*`, Sentry, GitHub secrets) are
documented in [Deployment](./deployment.md), not here.

## Sign-In And Identity

| Variable | What it is for |
| --- | --- |
| `AUTH_GOOGLE_ID` | Client ID of the Google OAuth app users sign in with. Read by `convex/auth.ts`. |
| `AUTH_GOOGLE_SECRET` | Client secret of that same sign-in OAuth app. |
| `JWT_PRIVATE_KEY` | Private key Convex Auth uses to sign session tokens. |
| `JWKS` | The matching public key set, served so signed tokens can be verified. |
| `INITIAL_SUPER_ADMIN_EMAIL` | The one email address that becomes a super admin on first sign-in (`convex/authUserProvisioning.ts`). Also the last-resort recipient for platform alerts. |
| `SITE_URL` | The app's public URL. Used to build the links the backend hands out: magic-link consent pages, invite links, links inside platform alert emails, and the admin return URL after a connector OAuth flow. |

Notes:

- `JWT_PRIVATE_KEY` and `JWKS` are created as a pair by the Convex Auth setup
  command and read by the library itself — no application code touches them.
  Never edit them by hand; replacing the pair signs every existing user out.
- `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are for **users signing in**. They are
  deliberately separate from the `CONNECTOR_GOOGLE_*` pair below, which is the
  app acting as a client of Google on a tenant's behalf.
- Sign-in works with either Google OAuth or email magic links (via Resend
  below); the setup validator requires every sign-in provider selected in
  `sonae.product.json` to be complete in production.
  Partial Google configuration is treated as a failure, not a fallback.
- If `SITE_URL` is missing, the connector OAuth return URL falls back to
  `http://localhost:3000` — correct locally, wrong everywhere else.

See [Route Protection And Authentication](./route-protection-and-authentication.md).

## Outbound Email

| Variable | What it is for |
| --- | --- |
| `RESEND_API_KEY` | The Resend key every outbound email goes through: magic-link sign-in, invites, platform alerts, workflow email steps, and the AI send-email tool. |
| `RESEND_FROM_EMAIL` | Preferred sender address for those emails. A bare address or a `Name <address>` pair. |
| `AUTH_EMAIL` | Fallback sender address, checked after `RESEND_FROM_EMAIL`. Kept because deployments already set it; requiring a second variable for the same fact would be pointless configuration. |
| `PLATFORM_ALERT_EMAILS` | Comma-separated recipients for platform health alerts. |

Notes:

- Without `RESEND_API_KEY`, sends are **simulated**: the code logs a warning
  and returns, so magic-link sign-in and platform alerts silently go nowhere.
  Google OAuth sign-in still works.
- The sender can also be set in Settings → email sender address. An
  unconfigured sender resolves to a deliberately unroutable `.invalid` address
  so a half-configured deployment fails visibly instead of sending as somebody
  else's domain — see `convex/emailBrandingService.ts` and
  [Email Branding](./email-branding.md).
- Alert recipients fall back through `PLATFORM_ALERT_EMAILS` →
  `PLATFORM_ALERT_EMAIL` → `ANALYTICS_ALERT_EMAILS` → `ANALYTICS_ALERT_EMAIL` →
  `INITIAL_SUPER_ADMIN_EMAIL`, and finally to the super admins on record — the
  people who can act on the alert — rather than giving up. See
  [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Optional Stripe Billing

Billing ships disabled in `sonae.billing.json`; existing Sonae deployments do not
need Stripe credentials. Enabled clones require both keys below in the backend.
No key belongs in a `NEXT_PUBLIC_` variable.

| Variable | What it is for |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe API credential matching the configured test/live mode; read by `convex/billingStripe.ts` and the Stripe component. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the clone's `/stripe/webhook` endpoint; verified by the Stripe component after the bounded body check. |

The component does not discover products, prices or portal policy automatically.
Follow [Stripe Billing](../operator/stripe-billing.md) for explicit setup and
sandbox verification. The variable inventory above is historical deployment
evidence; this optional integration has not been enabled or verified live.

## AI Providers

| Variable | What it is for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) models for chat and the agent runtime. |
| `OPENAI_API_KEY` | OpenAI models, including real-time voice sessions (`convex/aiVoiceSession.ts`). |
| `OPENROUTER_API_KEY` | Models routed through OpenRouter. |
| `GOOGLE_CLIENT_EMAIL` | Service-account identity for Google Vertex AI (Google models and embeddings). |
| `GOOGLE_PRIVATE_KEY` | That service account's private key. |
| `GEMINI_API_KEY` | **Read by nothing in the codebase.** Google models authenticate with the Vertex service account above. Safe to remove once confirmed nothing outside this repository uses it. |

Notes:

- A missing provider key is a configuration state, not a crash: the runtime
  refuses that provider's models with a clear "not configured" error, and with
  no provider at all the assistant writes a "Core Offline" notice instead of
  replying. The setup and deployment validators require the provider groups selected in
  `sonae.product.json`, plus feature dependencies such as Vertex for knowledge
  embeddings. Both use `scripts/provider-requirements.mjs`; see
  [Product Setup](../operator/product-setup.md).
- Vertex targets project `sonae-dev-491717` in location `global` by default;
  `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` override that when set.
- Which provider actually serves each use case is decided by the model
  defaults in admin, not by which keys exist — see
  [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md).

## Knowledge Ingestion And Scraping

| Variable | What it is for |
| --- | --- |
| `FIRECRAWL_API_KEY` | Firecrawl, used to scrape web pages into knowledge (`convex/webScrapeActions.ts`, `convex/knowledgeActions.ts`). |
| `APIFY_API_TOKEN` | Runs Apify actors for larger data-collection jobs (`convex/apify.ts`). |
| `APIFY_WEBHOOK_SECRET` | Shared secret Apify must echo back (in the `X-Apify-Secret` header) when it calls the `/apify-webhook` endpoint to report a finished run. Without the matching header the callback is refused, so results cannot be spoofed. |

Notes:

- Both scraping providers are optional, but they fail politely: an agent asked
  to scrape without a key is told the deployment has no key, so it stops
  retrying rather than blaming its own reasoning.
- `APIFY_WEBHOOK_SECRET` is required whenever `APIFY_API_TOKEN` is set — an
  Apify run cannot start without it, and the validator enforces the pairing.

See [Knowledge Management](./knowledge-management.md).

## Connector OAuth (Gmail)

| Variable | What it is for |
| --- | --- |
| `CONNECTOR_GOOGLE_CLIENT_ID` | The app's own Google OAuth client, used when a tenant connects a Gmail mailbox. |
| `CONNECTOR_GOOGLE_CLIENT_SECRET` | That client's secret. |
| `CONNECTOR_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key that encrypts tenant OAuth tokens before they are stored (`convex/connectorTokenCrypto.ts`). |

Notes:

- All three must be present together or absent together; partial configuration
  is treated as a setup problem and the Connect mailbox flow refuses to start.
- Losing or rotating `CONNECTOR_TOKEN_ENCRYPTION_KEY` makes every stored
  connector token unreadable — tenants must reconnect their mailboxes.
- Per-connector secrets follow the `CONNECTOR_SECRET_*` naming scheme resolved
  by `convex/connectorSecretResolver.ts` (for example
  `CONNECTOR_SECRET_TWILIO_AUTH_TOKEN`).

See [Gmail Mailbox](./gmail-mailbox.md).

## Spoken Channels And Phone Calls

| Variable | What it is for |
| --- | --- |
| `VOICE_RELAY_URL` | Endpoint of the live voice relay that carries Google speech-to-speech sessions (assistant voice, voice preview, kiosk receptionist). Use the relay root or `/live`. |
| `VOICE_RELAY_SECRET` | Derives the encryption key for confidential one-time voice tickets and authenticates relay-only redemption/knowledge requests. |
| `TELEPHONY_STREAM_URL` | The relay's `/twilio` media-stream URL for phone-call audio. |
| `TELEPHONY_PUBLIC_URL` | Public webhook URL given to Twilio for inbound voice calls. |
| `TELEPHONY_STATUS_PUBLIC_URL` | Public callback URL Twilio reports call status changes to. |
| `TELEPHONY_NUMBER_OWNERS` | JSON object mapping inbound phone numbers to the company that owns them, e.g. `{"+441234567890": "<companyId>"}`. An unmapped number is refused. |
| `TWILIO_AUTH_TOKEN` | Validates Twilio's request signatures on those webhooks, so an unsigned caller is refused before a single model call. Also used by the phone-line connection probe. |

Notes:

- Spoken surfaces fail closed without these: sessions are refused with a
  "not configured" error, and the kiosk shows visitor-safe unavailable copy
  rather than an error dump.
- When a voice line is managed through a connector,
  `CONNECTOR_SECRET_TWILIO_AUTH_TOKEN` takes precedence over
  `TWILIO_AUTH_TOKEN` for that line.
- Optional admission controls `TELEPHONY_MAX_CONCURRENT_CALLS` (default 4) and
  `TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR` (default 6) are not currently set,
  so the defaults apply.

See [Spoken Channels](./spoken-channels.md) and
[Receptionist Screen](./receptionist-screen.md).

## Embedded Widgets

| Variable | What it is for |
| --- | --- |
| `WIDGET_EMBED_SIGNING_SECRET` | Shared secret between the Next.js runtime and Convex. Next.js mints a signed embed pass when it serves `/w/[widgetId]`; Convex verifies that pass before opening an anonymous widget conversation. |

Notes:

- The same value must be present in **both** runtimes. Missing on either side,
  the widget page may still render but conversation creation fails closed.

See [Embedded Widgets](./embedded-widgets.md).

## Controlled file uploads

The upload issuers require Convex's built-in `CONVEX_SITE_URL`. They return
`/api/uploads?token=...`, never a native storage upload URL. A permission lasts
ten minutes, is usable once, and belongs to the issuing user and active company
(or anonymous widget conversation). Do not log these bearer URLs.

The gateway streams each body to a private native storage URL, counts actual
bytes, cancels excess bytes/disconnections, and stops after 120 seconds. Declared
length is checked but is not trusted instead of counting. Documents, workbooks
and recording bodies allow 50 MiB (the existing UI calls this 50 MB); chat images
allow 5 MiB, admin/profile images 2 MiB, and widget images 1 MiB. Existing MIME
allowlists still apply. Recording compression and packet semantics are unchanged.

Issuance reserves the declared byte size (or the maximum when omitted). Fixed
hourly limits are 1 GiB/1,000 permissions per user or widget thread, 10 GiB/2,500
per company (global uploads share the platform bucket), and 20 GiB/5,000 across
the deployment. Fixed daily limits are four times those values. Failed, unused
and abandoned permissions still consume their reservation; no refund can be
used to bypass ingress quotas. Anonymous widgets additionally retain their
existing ten-per-conversation lifetime limit.

File attachment checks the receipt's user/conversation, company and purpose
before obtaining a URL or deleting any rejected file. Existing saved files stay
readable; newly attaching an old unregistered upload requires uploading it again.
Permissions and unclaimed files are swept by the monitored
`upload-garbage-collection` job every five minutes in bounded batches. Ready
files have a 24-hour claim window. Workbook inspection/import uses a temporary
source file, which remains eligible for cleanup; imported database rows remain.
Attached files are preserved. Expired backlog schedules further bounded batches.

A paginated storage sweep also removes files created after gateway enforcement
that have no receipt, covering a process dying between storage acceptance and
receipt registration. It never sweeps pre-enforcement files. All production
storage writes must therefore use this gateway; `uploadIngressGuard.test.ts`
guards this assumption. Any future trusted server-side storage writer must
register its file before enabling it.

Local stream and integration tests are not live deployment acceptance. When
releasing, verify a 50 MiB upload and an over-limit rejection through the deployed
HTTP endpoint, attachment ownership, and the cleanup job. Any in-flight legacy
direct-upload URL must be replaced by requesting a new permission.
