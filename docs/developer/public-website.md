---
product: Hakken
documentation_type: Developer guide
feature_area: public home page
audience: frontend developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/public-website.md
last_reviewed: '2026-11-05T08:51:08+00:00'
reviewed_against: current implementation
status: Current
---
# Public Website Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** public home page
> **Reviewed:** 5 November 2026, 08:51:08 GMT (Europe/London)
> **Source path:** `docs/developer/public-website.md` · **Status:** Current

## What exists

The public site is one page, the home page at `/`, under `src/app/(public)`.
It was rebuilt on 2026-10-29 to the drawing Anthony approved that day
([home-page-plan.md](../plans/active/home-page-plan.md)); the earlier cream
showroom with its nav, footer, sections and GSAP motion is gone.

Files:

- `src/app/(public)/layout.tsx` — wraps the page in the app's `dark` tokens
  and sets the metadata (title "Hakken — Discovery", the identity's tagline).
- `src/app/(public)/page.tsx` — a server component; reads the copyright line
  from `landing.copyright` and renders `HomeScreen`.
- `src/app/(public)/_components/home/HomeScreen.tsx` — the screen: the words
  and the primary Sign in on the left, the rain and a quiet Sign in on the
  right. Every word is literal English, as the public site's always were.
- `src/ui/components/public/` — the frame every pre-sign-in screen stands
  on (`RainSplit`), the rain (`RainField`, `rainDrops`), the six-digit
  `CodeBoxes`, and `rain.css`. Sign-in, the sign-in email's page and the
  unsubscribe page stand on the same frame
  ([before-sign-in-plan.md](../plans/active/before-sign-in-plan.md)); the old
  cream `public.css` is gone.

## Theme boundary

The home page wears the dashboard's dark tokens on purpose (Anthony,
2026-10-29: the same dark look as the app, the Conterra shape). It takes no
colour of its own: `bg-background`, `bg-sidebar`, `text-secondary`,
`text-muted`, `border-border-dim` and `var(--brand)` carry it, so it follows
`hakken.theme.json` like every screen behind sign-in. `src/theme-drift.test.ts`
still leaves `src/app/(public)` out of its scan; keep it hex-free anyway.

## Links and configuration

Both Sign in links go to `/login`. Nothing on the page reads an environment
variable: `NEXT_PUBLIC_CONTACT_URL` and `NEXT_PUBLIC_COMPANY_URL` are no longer
read by the public site (the contact link and the "Powered by Ronins" credit
went with the footer). `/contact` does not exist and nothing links to it.

## Motion

CSS only. Each drop's splash and three rings animate on their own delay;
`@media (prefers-reduced-motion: reduce)` stops every animation and leaves a
faint still ring where each drop would land. There is no script on the page.

## The look is held

`src/app/(public)/_components/home/homeLook.test.tsx` compares the screen's
outline with `docs/plans/assets/home-page/look/Rain.txt`, saved beside the
approved drawing `Rain.dc.html`. A change to the page's parts, their order or
the title is a change to an approved look: draw it, get Anthony's yes, then
change the drawing, the screen and the look file together
(`npx vitest run src/app/\(public\)/_components/home/homeLook.test.tsx -u`).

## Verification

For a change here:

- `npx vitest run src/app/\(public\)` and `src/look-tests-drift.test.ts`;
- `npm run check:guards` (knip fails on a public part nothing renders);
- open `http://hakken.localhost:3000/` at desktop and phone widths: one screen
  on a desktop, the halves stacked on a phone, the rain moving, both Sign in
  links reaching `/login`;
- with reduced motion on, nothing moves and the rings stand still.

## Not public pages

Login and verification, unsubscribe, the widget sandbox, kiosk and the guarded
diagnostic routes also render before a session exists. They are their own
systems with their own guards; do not fold them into the public site.

## Public route boundary and review scope

The 5 November static pass rechecked the home composition, layout metadata, rain frame and the associated login/verification/unsubscribe entry points. `HomeScreen` owns the literal positioning paragraph and both `/login` links; `page.tsx` supplies only the translated copyright. The login route is outside the public route group and uses its own layout. An unauthenticated route should not be assumed to share the marketing page's authorization policy merely because it reuses its presentation primitives. This review did not alter copy, route guards or account state.

The old user guide described removed PublicNav, PublicFooter, ProductHero, WhatHakkenIs, WhoItsFor and contact entry points. These are no longer the active composition, so the user guide now documents the single screen. Historical home-page and before-sign-in plans remain dated design records, explicitly not a current delivery acceptance log. Neither their approval nor the component's presence proves live authentication or provider setup works on a deployment.

## Shared presentation and input state

`RainSplit` exposes `name`, `width`, `copyright`, `aside` and children. It renders a responsive two-column grid with the copy section and a rain section, stacking when needed. Its inner copy widths are content constraints; the outer layout remains fluid. `ScreenTitle`, `ScreenCopy`, `Eyebrow` and `IconDisc` share the pre-sign-in typography and state presentation. `rain.css` provides the visual motion; reduced-motion rules stop it without substituting another application flow. These components should be reused rather than reconstructing a near-identical sign-in shell on another route.

`CodeBoxes` is a controlled six-digit input with numeric filtering, paste/autofill support, focus advance and backspace navigation. It accepts `disabled` and `invalid` for request/submission/error states. It is presentation, not verification: acceptance belongs to the backend authentication provider. Do not turn client-side digit normalization into the security boundary. The backend service's code length, expiry, attempts and request limits are separately enforced and documented with authentication.

`login/page.tsx` keeps email request, code request and code submission states separately. It calls `sanitizeAuthRedirect` before using a return target. Google delegates to the Google provider; email links use `resend`; the typed code uses `one-time-code`. Request failures are intentionally quiet to reduce account enumeration, while a refused submitted code gets the generic verdict. The input can therefore remain on a sent-code state without proof that a provider actually sent another email. Diagnose through authorized auth logs and provider configuration rather than exposing existence through a more specific public message.

## Authentication and email boundaries

`convex/oneTimeCodeService.ts` defines six digits, ten-minute expiry, five attempts, five address requests per fifteen-minute window and a sixty-per-minute global request threshold. It normalizes address/code input and checks expiry/attempts. `convex/auth.ts` integrates the one-time-code provider and sign-in email rendering. These are authentication semantics, not marketing-site business logic. No authentication source was changed or provider request executed by this pass. A proposed copy or state change that affects enumeration or expiry messaging needs a separate code review.

`verify/page.tsx` owns sign-in email landing/confirmation behaviour. `unsubscribe/page.tsx` reads a communication kind and token, defaults old links to the digest kind and invokes `readerPreferences.unsubscribeWithToken` only after the user action. Its question, working, done and failed/incomplete states use the shared rain frame. It is distinct from the email client's direct one-click endpoint in `emailHttp.ts`. Do not change preferences as a render side effect or use a visit as evidence of user approval; mail scanners may follow links independently.

The public home reads no provider tokens, company tables or private reports. Its metadata comes from `productIdentity` and its static copy is not a capability inventory. Keep PRODUCT.md's intended product and the actual reporting implementation separate, and leave product-positioning decisions to the owner. The source's literal English home copy is also distinct from translated application state labels; the review does not claim every public word is translated simply because the copyright uses `getTranslations`.

## Source verification and deployment limits

The home look test holds named parts/order to its saved outline. Login and verify have state tests and look tests; unsubscribe has a separate look test. These complement, rather than replace, the authentication tests for return sanitization, throttling and token validation. A source-level outline match is not pixel comparison, screen-reader acceptance or a working Google account. The current documentation check ran none of these application tests and opened no browser.

Use `http://hakken.localhost:3000` for separately authorized normal development sessions. The isolated smoke harness has its own port and build directory. Do not copy a test-only authentication setup into production or assume a development callback is valid for another hostname. For service configuration, deployment acceptance and secrets use the existing deployment/auth/operator guides; this home-page guide introduces no new environment names, tables, jobs, retries or storage lifecycle. The page itself has no form submission, persistent write or background collector to document as a customer action.
