# Before Sign-in Plan

Last reviewed: 2026-10-29
Status: built on `dev` 2026-10-29, local; not pushed
Audience: agents touching sign-in (`src/app/login`), the sign-in email's page
(`src/app/verify`), the unsubscribe page (`src/app/unsubscribe`) or the shared
frame they stand on (`src/ui/components/public/`).

## What this is

Every screen a person sees before they are signed in, made the home page's
siblings ([home-page-plan.md](home-page-plan.md)): the same dark look, the
words and one action on the left, the rain on the right, no logo, the
copyright line bottom left. Anthony asked for it on 2026-10-29 after the home
page was built and the login page was still in the old cream style ("the
login screen does not match this style now"), then had every state drawn ("draw
all the screens before the login on canvas as i dont believe you right").

Eleven screens, all on the "Hakken home page" canvas:

| Route | States |
| --- | --- |
| `/login` | the email form · the six-digit code · the code refused · the link sent |
| `/verify` (from the sign-in email) | nearly there · link already used · link incomplete |
| `/unsubscribe` (from an email's unsubscribe link) | stop these emails? · done · link no longer works · link incomplete |

Not pre-sign-in screens of ours, left alone: the developer-only local test
sign-in, and the widget, kiosk and sandbox pages (the chat widget a client
embeds on their own site).

## Decisions (Anthony, 2026-10-29)

- **The code is six boxes**, one digit each in JetBrains Mono, a dot between
  the halves, the next box outlined in the brand colour, all six outlined red
  when the code is refused ("can we make this code box better"). A new screen
  kit part, `CodeBoxes` (`src/ui/components/public/CodeBoxes.tsx`): typing moves
  on by itself, backspace steps back, a pasted or auto-filled code fills every
  box.
- **Plain words everywhere** ("the wording is not very user friendly … needs
  to be easy to understand and read"). No "magic link" (now "sign-in link"),
  no "in transit" ("on the way"), each line says what to do next. The words
  are in the drawings and in `messages/en.json` and `it.json` (`login`,
  `unsubscribe`); the sign-in email's page and the refused-code message
  (`convex/oneTimeCodeService.ts`) are literal English. This rule now covers
  every client-facing screen.
- The ways in are unchanged: a sign-in link, a typed code, or Google, with
  nothing said that would confirm which addresses exist.

## The approved drawings

`docs/plans/assets/before-sign-in/`: the eleven `.dc.html` boards and the
canvas index, copied on 2026-10-29. Binding: a change to a look is drawn and
approved again first (design-drift-plan D4). Look tests:
`src/app/login/loginLook.test.tsx`, `src/app/verify/verifyLook.test.tsx`,
`src/app/unsubscribe/unsubscribeLook.test.tsx`, reading
`docs/plans/assets/before-sign-in/look/`.

## What was built

- `src/ui/components/public/` — `RainSplit` (the frame, with `Eyebrow`,
  `ScreenTitle`, `ScreenCopy`, `IconDisc` and the primary and quiet link
  looks), `RainField` and `rainDrops` (moved from the home page), `CodeBoxes`,
  and `rain.css` (the titles' sizes and the rain's motion, still under reduced
  motion). The home page now stands on the same frame.
- `src/app/login/`, `src/app/verify/`, `src/app/unsubscribe/` — each layout
  wears the dark tokens and loads `rain.css`; each page is rebuilt on the frame
  with its logic unchanged.
- Removed: `src/app/(public)/public.css` (the old cream stylesheet, 1,900
  lines, whose last user was the login page) and the Bricolage font with it.
