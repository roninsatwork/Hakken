---
product: Hakken
documentation_type: Developer guide
feature_area: public home page
audience: frontend developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/public-website.md
last_reviewed: '2026-10-29T10:00:00+00:00'
reviewed_against: current implementation
status: Current
---
# Public Website Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** public home page
> **Reviewed:** 29 October 2026 (Europe/London)
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
