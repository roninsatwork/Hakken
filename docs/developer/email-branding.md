# Email Branding Developer Guide

Email branding controls the sender name and address used by Hakken outbound email helpers. Runtime email sender resolution is centralized in `convex/emailBrandingService.ts` and reads stored `systemSettings` unless the deployment provides `RESEND_FROM_EMAIL`.

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
3. If the stored address is missing or invalid, return `{fallbackName or platform default} <noreply@ronins.co.uk>`.
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

Workflow runtime loads email branding before building email tool defaults so workflow email nodes have a safe sender even when node data omits one. Workflow email dispatch also uses `sendResendEmail` when `RESEND_API_KEY` is configured, and records simulated output when the key is absent.

Platform alerts load email branding before Resend dispatch and use a dedicated fallback name of `Hakken Operations`. Alert dispatch uses an idempotency key for the alert type and report window.

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
