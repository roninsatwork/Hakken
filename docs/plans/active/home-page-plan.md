# Home Page Plan

Last reviewed: 2026-10-29
Status: built on `dev` 2026-10-29, local commit; not pushed
Audience: agents touching `src/app/(public)` or the words a visitor first reads.

## What the page is

One screen, no scroll on a desktop, that says what Hakken does and gets a
client to sign in. Anthony asked for it on 2026-10-29 after seeing Conterra
Intelligence's home page: the same shape, the words on the left and a symbol
that moves on the right, but Hakken's own, not a copy.

It supersedes the home page described in
[public-website-plan.md](public-website-plan.md) (cream palette, forest hero,
pill header, nav, footer, four sections, the 2026-07-30 hero line). That plan's
other pages are unbuilt and unchanged.

## Decisions (Anthony, 2026-10-29, on the "Hakken home page" canvas)

| Decision | Answer |
| --- | --- |
| Look | The app's own dark look, from `hakken.theme.json`, not a public palette. The page wears the `dark` tokens whatever the device prefers. |
| Layout | Two halves. Left: 発見 · Discovery, the title, Found → Visited → Converted → Won, four lines of copy, one Sign in. Right: the symbol, with a quiet Sign in top right. The halves stack on a phone, words first. |
| The symbol | **Rain on the ground, seen from above**: drops land and send rings out that fade; one in seven lands harder, ringing in the brand ivory. Chosen over a sonar and a searchlight. Three literal panels (the chain, an assets table, a proof chart) were rejected as "too literal": the radar on Conterra's page is a symbol, not a dashboard. |
| Logo | None. No mark, no small wordmark: "we have Hakken in large letters already". |
| The words | "Hakken is a team of agents that do the work of an SEO firm, so you do not need one. The SEO, being found on Google, and the GEO, being the name ChatGPT and Gemini give when someone asks. They work out which of your pages, listings and feeds make money and where the rest lose it, then tell you what to change and why, with the research to back it up, so the work you do next is the work that grows the business." Hakken advises and shows the research; it does not write or push the fix. |
| Actions | Sign in, twice (the primary one under the words, a quiet one on the right), both to `/login`. No "Talk to us". |
| Footer | The copyright line only, bottom left, from `landing.copyright`. |

## The approved drawing

`docs/plans/assets/home-page/Rain.dc.html`, with `Rain.png` and the canvas
index, copied from the canvas on 2026-10-29. Binding: a change to this look is
drawn and approved again first (design-drift-plan D4).

## What was built

- `src/app/(public)/layout.tsx` — the dark wrapper and metadata.
- `src/app/(public)/page.tsx` → `_components/home/HomeScreen.tsx` — the screen.
- `_components/home/RainField.tsx` + `rainDrops.ts` — the rain, placed from
  each drop's number so server and browser agree; `home.css` moves it in CSS
  alone, with still rings for reduced motion.
- `homeLook.test.tsx` holds the look (`docs/plans/assets/home-page/look/Rain.txt`).
- Removed: the hero, the two sections, the nav, footer, contact link and GSAP
  motion of the old home page, and the `gsap` dependency with them. The
  product initialiser no longer rewrites a nav and footer.

## Not done

- ~~The login page still wears `public.css`.~~ Done the same day: sign-in, the
  sign-in email's page and the unsubscribe page were drawn and built as the
  home page's siblings ([before-sign-in-plan.md](before-sign-in-plan.md)), and
  `public.css` is gone.
- The `landing.*` catalogue keys other than `copyright` are unused.
- No other public page exists.
