# White-Label Packaging Operator Guide

Use this guide when preparing a Sonae-based vertical starter for a customer, internal team, or product-specific deployment.

The System Options white-label panels are operator/developer planning tools. They do not replace server-side authorization, DNS setup, hosting configuration, release gates, or product-specific code review.

## Where To Start

Open `Admin -> Settings -> System Options`.

Review the panels in this order:

1. White-Label Readiness
2. Brand Handoff Summary
3. Module Presets
4. Navigation Profiles
5. Custom Domain Readiness
6. Packaging Checklist

This sequence moves from current configuration evidence to a copy-ready developer handoff artifact.

## White-Label Readiness

Use this panel to confirm the starter has enough brand and operational evidence for handoff.

The readiness score checks:

- Product identity is no longer the starter default.
- Light and dark logos are configured.
- The brand accent is a valid HEX color.
- Diagnostic routing is disabled for product handoff.
- An active widget has branded greeting, placeholder, logo, color, and restricted allowed domains.
- A stored sender address is configured, or the deployment sender still needs manual confirmation.
- Production setup validation remains a manual release note requirement.

Treat pending or manual items as developer follow-up, not as automatic blockers for every internal preview. For a customer-facing deployment, resolve or explicitly document each one.

## Brand Handoff Summary

Use this panel to confirm what identity will travel with the package.

Check:

- Product name
- Brand color
- Logo mode
- Runtime email sender
- Widget posture
- Diagnostics posture
- Production validation posture
- Recommended module presets that are ready enough for packaging

If the runtime sender is not the intended customer-facing domain, set the stored email sender or configure `RESEND_FROM_EMAIL` in the deployment environment.

## Module Presets

Use module presets to decide the product shape before editing routes or adding custom screens.

The current presets are:

- Knowledge Assistant
- Support Widget
- Operator Workspace

Each preset lists:

- Visible modules
- Owner/operator surfaces
- Handoff checks

These presets are planning data. They do not automatically hide routes or activate modules.

## Navigation Profiles

Use navigation profiles to preview which route groups belong in a vertical starter.

The current profiles are:

- Customer Workspace
- Support Widget
- Operator Console

Each profile lists:

- Route groups to show
- Owner-only route groups
- Hide candidates
- Implementation notes

Important: navigation hiding is presentation only. Keep server-side authorization, tenant isolation, and audit behavior as the real access boundary. Do not rely on hidden links for security.

## Custom Domain Readiness

Use this panel before assigning a branded domain or exposing a public widget.

Review:

- Primary app host
- Widget domain allowlist
- Email sender domain
- DNS and TLS
- Redirect policy
- Tenant routing isolation

The app can show evidence from widget allowlists and stored email sender configuration. DNS, TLS, redirects, and domain-to-tenant routing still require hosting-provider setup and developer review.

## Packaging Checklist

Use this panel at the end of the review.

Click `Copy checklist` and paste the markdown into the build plan, release notes, PR description, or handoff page.

The generated artifact includes:

- Brand handoff
- Readiness evidence
- Ready module presets
- Navigation profile previews
- Custom domain readiness
- Developer follow-up

Before calling a vertical starter ready, attach the output of:

```bash
npm run setup:validate -- --profile=production
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Handoff Rules

- Keep risky agents, workflows, widgets, and external actions draft or disabled until developer/operator review.
- Keep platform-owner routes super-admin-only.
- Keep tenant-facing routes separate from platform maintenance surfaces.
- Preserve English and Italian locale parity.
- Do not treat route hiding as authorization.
- Record unresolved manual checks in the packaging checklist before handoff.

