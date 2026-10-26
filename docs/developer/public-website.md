---
product: Hakken
documentation_type: Developer guide
feature_area: public home page, navigation and motion
audience: frontend developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/public-website.md
last_reviewed: '2026-10-26T10:52:01+00:00'
reviewed_against: current implementation
status: Current
---
# Public Website Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** public home page, navigation and motion
> **Reviewed:** 26 October 2026, 10:52:01 GMT (Europe/London)
> **Source path:** `docs/developer/public-website.md` · **Status:** Current


## Implementation Scope

The public website lives under `src/app/(public)`. It is a separate Next.js
route group from the authenticated dashboard and currently implements the home
page at `/`.

Current implementation files include:

- `src/app/(public)/layout.tsx`
- `src/app/(public)/page.tsx`
- `src/app/(public)/public.css`
- `src/app/(public)/_components/PublicNav.tsx`
- `src/app/(public)/_components/PublicFooter.tsx`
- `src/app/(public)/_components/ContactLink.tsx`
- `src/app/(public)/_motion/motion.ts`
- `src/app/(public)/_motion/PublicMotion.tsx`
- `src/app/(public)/_components/home/ProductHero.tsx`
- `src/app/(public)/_components/home/WhatHakkenIs.tsx`
- `src/app/(public)/_components/home/WhoItsFor.tsx`

The historical public website plan records inherited framework design intent. PRODUCT.md remains the product-intent authority; its discovery positioning differs from current public copy. Changes to public information architecture or wording require separate product alignment, and were not made by this documentation review.

## Current Routes

The only implemented public marketing route is `/`. The public route group also
wraps that route with public navigation, motion setup, and footer.

The broader plan names `/platform`, `/showcase`, `/showcase/properties`,
`/showcase/reports`, `/showcase/studio`, `/trust`, and `/contact`, but those
routes are not implemented in the current route inventory. Do not document or
present those pages as live behavior until the files exist.

There is current drift to resolve under the Public Website Plan:

- `src/app/(public)/_components/ContactLink.tsx` falls back to `/contact` when
  `NEXT_PUBLIC_CONTACT_URL` is unset.

That drift should be fixed as product work with explicit approval, not hidden
by documentation-only edits.

## Layout And Theme Boundary

`src/app/(public)/layout.tsx` loads Bricolage Grotesque through `next/font`,
adds the `public-site` wrapper class, mounts `PublicMotion`, renders
`PublicNav`, renders the route content, and finishes with `PublicFooter`.

The public theme is scoped through `public.css` and the `public-site` wrapper.
The logged-in dashboard keeps its own dark app styling. Do not move public
palette changes into global dashboard tokens unless the whole product design
system is intentionally changing.

The public layout metadata currently sets the default public title and
description. The home page also exports a more specific metadata title. The
Public Website Plan tracks later metadata and Open Graph hardening.

## Navigation

`PublicNav` is a client component. It renders:

- Hakken wordmark linking to `/`
- Sign in linking to `/login`
- Talk to us through `ContactLink`
- a mobile menu button that toggles the mobile action row

It tracks scroll position and applies the `scrolled` class after the window has
scrolled more than 24 pixels. Planned public nav links are deliberately absent
until their routes ship. Keep this discipline: adding a navigation link before
the route exists creates a public 404.

## Contact And Credit Configuration

`ContactLink` reads `NEXT_PUBLIC_CONTACT_URL`.

- If set, it renders an external `<a>` that opens in a new tab.
- If unset, it renders a Next `Link` to `/contact`.

Because `/contact` is planned but not implemented, production deployments should
configure `NEXT_PUBLIC_CONTACT_URL` until the contact page exists.

`PublicFooter` reads `NEXT_PUBLIC_COMPANY_URL` for the "Powered by Ronins"
credit. If the variable exists, the credit links externally. If it is absent,
the credit remains plain text.

Do not hardcode builder-owned domains into the public code. The repository has
tests that block client-specific fallbacks, and the public site must remain
portable across Hakken deployments.

## Motion System

Public motion is split into a small helper and a mounted client component:

- `ensureGsap` registers GSAP and ScrollTrigger on demand.
- `prefersReducedMotion` checks whether motion should be skipped.
- `PublicMotion` applies generic reveal and parallax behavior to elements with
  `data-reveal` and `data-speed`.

Home sections can also mount their own GSAP timelines. `ProductHero` animates
hero lines, the drawn dashboard surface, stat tiles, bars, and the activity
chart line. `WhatHakkenIs` uses ScrollTrigger to track the active reading row.
The old `ProductPanels` module is not present in this checkout and is not rendered by the home page.

Every animation path should respect reduced-motion preferences. Avoid adding a
new animation style that bypasses `prefersReducedMotion`.

## Home Page Sections

`page.tsx` renders sections in this order:

1. `ProductHero`
2. `WhatHakkenIs`
3. `WhoItsFor`
4. the inherited Hakken name-story block
5. the closing contact call to action

The hero uses a drawn interface, not a captured or live customer dashboard. Its numbers and activity labels are illustrative presentation data. `DemosIntro` and `ProductPanels` are absent and no longer rendered; old Properties, Reports and Posture Studio panel descriptions do not establish a current routed feature. Do not recreate those modules to satisfy stale prose.

## Copy Rules

Public copy should stay buyer-facing and benefit-led. It should not read like
developer documentation, and it should not describe planned pages as if they
exist. The inherited public website plan records earlier positioning. Current source still says preparedness in its name story, while PRODUCT.md defines discovery and a business-asset product. Record this as a source/product discrepancy; do not amend PRODUCT.md or rewrite approved intent to fit a stale page.

Avoid jargon on public pages unless the audience genuinely needs it. The public
site can mention knowledge, models, agents, workflows, approvals, evals,
observability, and cost control, but it should explain those as business
outcomes before implementation detail.

## Verification

For documentation-only changes, run `git diff --check` and Markdown link
validation.

For public-site implementation changes, verify:

- `/` renders desktop and mobile without text overlap
- navigation opens and closes on mobile
- Sign in still reaches `/login`
- Talk to us goes to `NEXT_PUBLIC_CONTACT_URL` when configured
- the fallback `/contact` behavior is intentional for the current deployment
- reduced-motion users do not receive mandatory scroll or reveal animation
- no unimplemented public route is added to navigation
- no client-specific fallback domain is introduced
- `messages/en.json` and `messages/it.json` remain in parity if any localized
  messages are added
- template boundary tests still pass if vertical public routes are added

For separately authorized implementation changes, follow the current full gates in AGENTS.md. This documentation pass used file/link/metadata checks and `git diff --check`, and did not run the application or its browser tests.

## Contact Configuration And Source Boundaries

`ContactLink` reads `NEXT_PUBLIC_CONTACT_URL` at module scope. A truthy value renders an external anchor with `target="_blank"` and `rel="noopener noreferrer"`; no value renders a Next Link to `/contact`. The component does not validate a form, send an email, persist a lead or prove the target URL is reachable. It also does not provide its own destination validation or retry policy. Do not document a native contact form or customer-enquiry queue from this implementation.

The footer's Company column routes its Contact entry through the same helper. Name/tagline come from `product.identity.ts`; Powered by Ronins is a separate credit with optional `NEXT_PUBLIC_COMPANY_URL`. Those public variables are browser-build configuration, and this review did not inspect actual environment values. The deployment workflow passes the contact URL into Docker but does not explicitly pass the company-credit variable. A source-level optional link cannot establish that a particular deployment has the corresponding setting.

The public layout loads Bricolage Grotesque and a scoped public stylesheet. It is intentionally separate from dashboard typography and theme tokens. `PublicNav` records scroll state above twenty-four pixels, uses its open/scrolled class for appearance, and removes its scroll listener on unmount. The mobile toggle has a text accessibility label and conditionally renders the actions. No browser was run to audit keyboard focus, layout behavior or accessibility conformance; a component's JSX is evidence of its intent, not a complete interaction test.

`PublicMotion` checks reduced motion at mount, registers GSAP/ScrollTrigger once client-side, animates reveal elements and applies parent-based parallax to speed-marked elements. Its effect returns `ctx.revert` to undo the created animation context. It does not subscribe to preference changes after mounting. `ProductHero` and `WhatHakkenIs` also own local animation paths, so changing only the generic helper is not automatically a complete motion change.

## Route Discovery And Authentication Separation

The current public marketing route group contains the home page only. Other unauthenticated routes include login/verification, unsubscribe, widget/sandbox and kiosk experiences, plus guarded diagnostic fixture routes. They are separate systems and should not be folded into public-site marketing navigation merely because they can render before a session exists. Their own request guards, capability tokens or secrets define their access contracts.

The home page does not query tenant data, perform agent execution or collect an enquiry in its inspected composition. It does not have data indexes, mutations, background retries or stored user submissions of its own. Its main external behavior is navigation and optional external links. Authentication remains in the login/provider flow; the public site's Sign in button neither provisions an account nor changes company permissions.

Tests and guards relevant to this surface include the no-client-specific-fallback and copy-boundary checks, public component source and any retained rendering tests. Names in a historical plan or old script reference are not evidence that corresponding page files exist. Source review did not confirm deployed routing, DNS, current contact delivery, monitoring or external rename cutover. PRODUCT.md section 33 remains relevant when a public host or distributed link still points at an older deployment name.

## Documentation And Product Decisions

Support documentation should describe what a visitor sees while explicitly separating inaccurate inherited text from product truth. The current name-story explanation and framework headline need a product-copy decision, not a documentation workaround that teaches preparedness as the Hakken definition. Missing showcase/trust/contact routes remain not found in current implementation; the old plan is labeled historical instead of being treated as an active promise.

Reusing the existing home-page components is appropriate for a separately authorized product task, but a documentation refresh must not silently edit layout, CSS, identity, environment wiring or acceptance records. This pass changed only the two guides and the coverage inventory. It did not install dependencies, build the app, open a browser, fetch a customer website or update the historical plan. Keep that evidence boundary when using the guide during a launch discussion.
