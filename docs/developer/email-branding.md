---
product: Hakken
documentation_type: Developer guide
feature_area: Email branding and sender resolution
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/email-branding.md
last_reviewed: '2026-10-26T14:38:35+00:00'
reviewed_against: current implementation
status: Current
---
# Email Branding Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Email branding and sender resolution
> **Reviewed:** 26 October 2026, 14:38:35 GMT (Europe/London)
> **Source path:** `docs/developer/email-branding.md` · **Status:** Current

Email branding controls the sender name and address used by Hakken outbound email helpers. Runtime email sender resolution is centralized in `convex/emailBrandingService.ts` and reads stored `systemSettings` with call-site-specific environment precedence described below.

Read this before changing invite emails, magic-link sender configuration, workflow email nodes, platform alert emails, white-label handoff output, or sender validation.

## Product Surface

- `convex/emailBrandingService.ts` normalizes sender values, validates sender addresses, builds Resend `from` values, and exposes compact branding data.
- `convex/resendEmailService.ts` sends Resend email requests through the shared provider HTTP retry layer.
- `convex/settings.ts` stores `emailSenderName` and `emailSenderAddress` through system settings and exposes `internal.settings.getEmailBranding`.
- `convex/settingsService.ts` uses email sender evidence in white-label readiness, custom-domain checks, and handoff summaries.
- `convex/auth.ts` uses `buildEmailFromAddress` for auth email delivery.
- `convex/invites.ts` uses stored email branding for invite email copy and sender address assembly.
- `convex/workflowRuntime.ts` uses email branding for workflow email node defaults.
- `convex/platformAlerts.ts` uses email branding for platform system health alert emails.

The System Settings UI stores sender fields as part of global system preferences. Updating them is super-admin-only and writes `UPDATE_SYSTEM_PREFERENCES`.

## Sender Resolution

`buildEmailFromAddress` resolves in this order:

1. If `envFromAddress` is present after CR/LF removal, return it directly.
2. Normalize the stored `emailSenderAddress`.
3. If the stored address is missing or invalid, return `{fallbackName or platform default} <noreply@unconfigured.invalid>`.
4. Normalize sender name from stored `emailSenderName`, stored `platformName`, fallback name, or default platform name.
5. Return `{senderName} <{senderAddress}>`.

`RESEND_FROM_EMAIL` therefore overrides stored settings at runtime. White-label docs and handoff summaries should keep warning operators to confirm the deployment sender, because a stored sender address does not guarantee the deployment is using it.

## Normalization And Validation

The helper strips angle brackets and CR/LF from stored name/address parts. Environment `from` values only strip CR/LF so a fully formatted sender such as `Acme Ops <ops@example.com>` can be supplied by deployment configuration.

`isLikelyEmailAddress` uses a simple address shape check. It is not a DNS, domain verification, or Resend verification check. Treat it as UI/runtime safety validation, not proof that the sender domain is deliverable.

Avoid accepting raw user-provided sender values outside system settings. New sender paths should call the helper rather than building `Name <address>` strings manually.

## Branding Object

`buildEmailBranding` returns:

- `platformName`: normalized stored platform name or default platform name
- `fromAddress`: the resolved sender address from `buildEmailFromAddress`

Invite emails use this to keep footer/product text aligned with the runtime sender. White-label handoff uses it to present the effective sender that runtime helpers will use unless the environment override is set.

## Runtime Call Sites

Auth email configuration passes `RESEND_FROM_EMAIL` and a fallback name into `buildEmailFromAddress`.

Invites load `internal.settings.getEmailBranding`, build branded copy, then resolve the sender with the environment override and stored settings. Invite delivery uses `sendResendEmail` so Resend requests share provider error handling and retry behavior instead of calling `fetch` directly.

Workflow runtime loads email branding before building email tool defaults so workflow email nodes have a safe sender even when node data omits one. Workflow email dispatch queues written email in the Outbox. It does not send directly or simulate node delivery when a Resend key is absent.

Platform alerts load branding for content and queue in the Outbox using an alert-type/report-window identity. Sender resolution happens in the delivery path; queue success is not provider acceptance.

`sendResendEmail` posts to `https://api.resend.com/emails` with JSON content, an optional idempotency key, and a three-attempt retry policy capped at 15 seconds by default. Keep this helper as the single Resend transport path for runtime email so provider retries, error normalization, and tests stay consistent.

When adding another email sender, preserve this pattern:

- load stored email branding through the internal settings query when running in Convex actions
- pass `process.env.RESEND_FROM_EMAIL`
- pass a sensible fallback name for the email type
- use the returned string only as the email `from` field

## White-Label Readiness

White-label readiness treats stored `emailSenderAddress` as ready only when it looks like an email address. If it is missing, the email readiness item is `manual` with command `RESEND_FROM_EMAIL`.

Custom-domain readiness extracts the sender domain from the stored address when valid. It still marks DNS/TLS, redirects, and tenant isolation as manual checks. Do not collapse these checks into automatic readiness without implementing real verification.

Handoff summaries include the effective runtime sender so operators can copy it into launch notes or customer handoff material.

## Security Rules

Do not store API keys, SMTP credentials, Resend tokens, or provider secrets in system settings. Sender branding is presentation and deliverability metadata only.

Do not include CR/LF in sender strings. Keep the current normalization to prevent header injection style mistakes.

Do not use stored sender values as evidence that Resend domain verification is complete. Use deployment/provider checks for that.

## Verification

Focused tests include:

- `convex/resendEmailService.test.ts` for Resend transport success, error, retry, and idempotency behavior.
- `convex/settingsService.test.ts` for `buildEmailFromAddress`, environment override behavior, invalid address fallback, `buildEmailBranding`, white-label readiness, custom-domain checklist, and handoff summaries.
- `convex/settings.test.ts` for super-admin settings updates, sender persistence, audit logs, and white-label queries.
- Invite, workflow runtime, and platform alert tests where sender behavior is exercised by those features.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Environment Precedence And Different Sending Paths

`resolveEnvFromAddress` considers `RESEND_FROM_EMAIL` then `AUTH_EMAIL`. It removes CR/LF, accepts either a bare address or formatted name/address, and ignores an entry that fails its simple address-shape check. This resolver is the preferred way to choose a general sender where the caller supports both variables. `buildEmailFromAddress` itself simply normalizes and returns a nonempty supplied environment value before stored settings; callers bypassing the resolver do not receive the same shape-validation guarantee.

`outboxFromAddress` adds `OUTBOX_FROM_EMAIL` first. A valid formatted Outbox value is retained; a valid bare value is combined with configured sender/platform name. Otherwise the helper falls back through the general environment resolver and stored sender. If the result still contains the reserved unconfigured address, it returns null rather than authorizing a send. Stored sender names and address fields are not provider credentials.

Auth constructs its sender using `resolveEnvFromAddress` and `buildEmailFromAddress` at module initialization. Stored branding is not read synchronously from the database at that point. Invite dispatch reads stored branding but currently passes `process.env.RESEND_FROM_EMAIL` directly, rather than the complete resolver; `AUTH_EMAIL` alone is therefore not a universal override for every email-producing function. These are real call-site differences to preserve in troubleshooting, not a reason to invent one precedence rule for all messages.

Invites also have a retained no-API-key simulation path that creates the invite record and returns simulated success. This differs from ordinary Outbox delivery and must be labeled when discussing acceptance. Workflow messages and platform alerts queue through the Outbox; they do not inherit that invite simulation behavior simply because they ultimately share email formatting helpers.

## Unconfigured And Verified Are Different States

`UNCONFIGURED_EMAIL_ADDRESS` uses `noreply@unconfigured.invalid`, deliberately under a reserved non-resolving domain. It avoids sending as an inherited real domain when a clone has not configured its own identity. The helper stays total because auth initialization must be able to load even before configuration exists. It is a sentinel, not a deliverable default to copy into deployment settings.

`isEmailSenderConfigured` checks supplied environment presence or stored address shape. It does not prove DNS ownership, SPF, DKIM, provider verification, mailbox existence, or that a particular transport accepted a message. A branded sender preview and a real delivered invitation are different pieces of evidence. External rename cutover and provider setup remain separately recorded in PRODUCT.md and operator handoff documents.

`buildEmailFromAddress` strips angle brackets and CR/LF from stored parts; formatted environment strings retain brackets while CR/LF is removed. `outboxFromAddress` has its own formatting/validation steps. Keep all externally supplied content in the renderer's escaped content API rather than concatenating raw HTML. These helpers reduce malformed-header/content problems but are not a substitute for keeping secret values outside settings and logs.

## Rendering, Transport, And Lifecycle

`sendResendEmail` accepts HTML and optional plain text, optional headers, and attachments with optional content IDs. Digest unsubscribe headers and inline task images use that shared transport shape. New content should produce HTML/text together through the shared renderer so a plain-text recipient does not receive unrelated wording. A logo in UI settings does not automatically become an attached image in every message; inspect the actual template and asset path.

The transport posts JSON to Resend using the supplied API key and optional Idempotency-Key. Its default retry policy is three attempts with a 15-second maximum delay between attempts, subject to shared provider HTTP policy. It is not a guaranteed 15-second total delivery deadline. A caller must supply a stable idempotency identity where repeat sends could duplicate effects. The transport's successful response is provider acceptance evidence, not proof that a mailbox displayed the message or a recipient acted.

Branding updates affect future reads and rendering. They do not rewrite already queued content, sent messages, historic sender evidence, or an external provider account. Queue templates and transactional paths have their own point of rendering. A change to stored identity can therefore appear at different times across auth, newly queued notifications, and existing Outbox rows.

`emailBrandingService.test.ts`, `resendEmailService.test.ts`, settings tests, and the owning invite/Outbox/workflow tests provide local evidence. This refresh performed no email send, domain verification, queued-message mutation, provider credential test, or live acceptance operation. Use [Email system](./email-system.md), [System health](./system-health-and-platform-alerts.md), and the [Stripe operator guide](../operator/stripe-billing.md) for the distinct communication and billing handoffs rather than treating branding as an all-purpose integration proof.
