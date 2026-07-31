# Public Website Developer Guide

Last reviewed: 2026-07-30 17:39 BST +0100
Status: current for the implemented public home page; broader public site still in active development
Audience: engineers and agents changing `src/app/(public)`, public copy, public motion, or pre-login routing.

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
- `src/app/(public)/_components/home/WhatSonaeIs.tsx`
- `src/app/(public)/_components/home/DemosIntro.tsx`
- `src/app/(public)/_components/home/ProductPanels.tsx`
- `src/app/(public)/_components/home/WhoItsFor.tsx`

The public website is governed by
`docs/plans/active/public-website-plan.md`. Read that plan before changing
public routes, public copy, motion direction, contact behavior, or planned
public information architecture.

## Current Routes

The only implemented public marketing route is `/`. The public route group also
wraps that route with public navigation, motion setup, and footer.

The broader plan names `/platform`, `/showcase`, `/showcase/properties`,
`/showcase/reports`, `/showcase/studio`, `/trust`, and `/contact`, but those
routes are not implemented in the current route inventory. Do not document or
present those pages as live behavior until the files exist.

There is current drift to resolve under the Public Website Plan:

- `src/app/(public)/_components/home/WhatSonaeIs.tsx` links to `/platform`.
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

- Sonae wordmark linking to `/`
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
portable across Sonae deployments.

## Motion System

Public motion is split into a small helper and a mounted client component:

- `ensureGsap` registers GSAP and ScrollTrigger on demand.
- `prefersReducedMotion` checks whether motion should be skipped.
- `PublicMotion` applies generic reveal and parallax behavior to elements with
  `data-reveal` and `data-speed`.

Home sections can also mount their own GSAP timelines. `ProductHero` animates
hero lines, the drawn dashboard surface, stat tiles, bars, and the activity
chart line. `WhatSonaeIs` uses ScrollTrigger to track the active reading row.
`ProductPanels` uses ScrollTrigger for the stacked product-panel behavior.

Every animation path should respect reduced-motion preferences. Avoid adding a
new animation style that bypasses `prefersReducedMotion`.

## Home Page Sections

`page.tsx` renders sections in this order:

1. `ProductHero`
2. `WhatSonaeIs`
3. `DemosIntro`
4. `ProductPanels`
5. `WhoItsFor`
6. the Sonae name story block
7. the closing contact CTA

The hero uses a drawn interface rather than a captured screenshot. Its numbers
and run labels are illustrative public-site presentation data, not operational
analytics. This is deliberate: it avoids exposing customer data and avoids
fixture-branded screenshots.

`ProductPanels` contains proof panels for Properties, Reports, and Posture
Studio. Those vertical references are wrapped by template removal comments in
the route where required by the template boundary. When adding public showcase
routes for verticals, update `template.manifest.json` in the same product
change as the route implementation.

## Copy Rules

Public copy should stay buyer-facing and benefit-led. It should not read like
developer documentation, and it should not describe planned pages as if they
exist. The active Public Website Plan records the agreed public positioning,
including the Sonae name story, the "Powered by Ronins" credit rule, no pricing,
and contact-first calls to action.

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

The local repo gate from `AGENTS.md` remains required before pushing or merging
implementation changes:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
