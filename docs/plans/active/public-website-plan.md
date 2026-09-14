# Public Website Plan

Last reviewed: 2026-07-30
Status: active — Phase 0 in progress
Audience: agents building the public (pre-login) marketing site. Read this whole document before touching `src/app/(public)` or any public-facing copy. Decisions below are Anthony's and are not to be re-litigated without asking him.

## Purpose

The public site today is one screen of template boilerplate that says nothing about Sonae. The product is finished and no longer hidden, so the site must become a suite of publicly visible pages that explain Sonae to a cold visitor, showcase the product and our UX/UI craft, and get people to make contact. Anthony wants to be able to send anyone the URL and have them understand what Sonae is.

Two hard requirements from Anthony:

1. The public site must look **very visually different** from the logged-in app.
2. It must be **elegant with ambitious animation** — the reference is https://www.clay.com. He wants to push the animations hard.

## Decision log (agreed with Anthony, 2026-07-30)

| Decision | Answer |
| --- | --- |
| Audience | Buyers/decision-makers. Benefit-led copy like Clay's; tech detail secondary. |
| Story shape | Sell the benefit first, products as proof high on the page. Not a platform-architecture pitch. |
| Hero line | **"Build agent-powered products with governance built in"** (Anthony, 2026-07-30, replacing "Launch AI products, not AI experiments."). Set as three markup-controlled lines. Supporting line: "Start with the foundations already in place: knowledge, permissions, approvals, cost control, and a record of every agent run. Then build the product your customers came for." Eyebrow is now the plain label **備え · Be Prepared** — not a link, so it carries no arrow. One hero action only: "Talk to us" (the second "See what's inside" button was removed on Anthony's instruction). |
| Trust page headline | "Ship AI you can stand behind." |
| Palette | Warm light/cream showroom (Clay-style) for the public site. The logged-in app stays dark. This contrast is deliberate and is the main "visually different" move. |
| Hero panel (2026-07-30, second pass) | One deep **forest** panel (`--ps-forest #103e33`) carrying the hero, cream everywhere else — the structural equivalent of Clay's single deep-green hero on a white body. Forest rather than a neutral dark on purpose: the app is dark, so the hero has to read as a *colour*, not as dark mode. Type on it is `#fefdfb`, eyebrow in sand, one orange accent on the approve button. |
| Header (2026-07-30, second pass) | Copied from Clay's structure: a cream pill inset `clamp(10px,3.8vw,56px)` from the viewport edges, rounded on its bottom corners only, floating over the hero panel. Nav links sit beside the wordmark at 15px/450 (not centred) so the right edge belongs to Sign in plus one primary action. |
| Arcade on public site | No. Only the three serious products (Properties, Reports, Posture Studio). |
| Pricing | None anywhere. Everything routes to "talk to us". |
| Screenshots | Yes — real product screenshots and screen recordings are allowed and wanted. Captured from the running app so they are genuine and re-capturable. |
| Contact | Contact form (stored in Convex + forwarded via Resend). No pricing calculator, no chat widget. |
| Company credit | Sonae is owned by Anthony personally, NOT by Ronins. The only acceptable credit is **"Powered by Ronins"** (footer). Never "a Ronins product". |
| "To be prepared" / naming story | Sonae (備え) means "to be prepared / preparedness" in Japanese — that is why the name was chosen. Tell this story properly: full version on the Built on Sonae page, echoed as the closing beat of the home page. |
| Italian locale | English-first. Stub Italian with English values so the parity test passes; proper translation is a later pass. |
| Motion library | **GSAP + ScrollTrigger** (decided via Phase 0: Anthony approved the scroll-scrubbed direction and asked for parallax information layers on top). framer-motion stays for simple mount transitions where convenient. |
| Typeface | **Bricolage Grotesque** for display, working default pending Anthony's veto (he did not pick between A/B; Bricolage is the more characterful option matching his "more designed" push). Body: General Sans-class quiet sans — in-repo use Inter (already loaded) unless he objects. |
| Design bar | The Phase 0 mock is the FLOOR, not the target. Anthony's exact feedback: "good start but I really want it more designed than this and with parallax information." Every section needs layered depth — foreground/midground/background moving at different scroll speeds, information (stats, labels, chips) floating with parallax, decorative geometry, bespoke section layouts. No section may read as "text box after text box". |
| Imagery discipline (agreed 2026-07-30 after the first in-repo hero failed) | **No hand-drawn/programmatic illustration** — canvas cartoons read as clip-art next to Clay's commissioned 3D. The imagery is the REAL PRODUCT: dark app screenshots (captured from the `next-dev-e2e-auth` fixture mode) in browser frames inside the cream showroom, with UI-shaped micro-animation overlays (Approve? chips, counters, assembling report) and parallax depth. The hero is product-as-hero (Stripe/Linear pattern). UI-shaped animated objects (layer-stack slabs, agent-run timeline) stay; the funnel "machine" canvas and stick figure are dead. Clay-grade 3D art, if ever wanted, gets commissioned or bought and dropped into video-loop slots — never drawn in code. |
| Working rhythm | Section by section: build one section → screenshot to Anthony → react → next. No big-bang page deliveries. |

## What Clay actually does (research findings, so nobody re-derives them)

Clay.com is a Webflow site. The "3D animations" are **pre-rendered claymation video loops** (small 240-frame mp4/webm assets, one ~560px loop per feature block) — no WebGL, no three.js, zero canvases. Choreography is GSAP + ScrollTrigger: scroll-triggered reveals, marquee rails, count-up stat chips, one interactive tab section. The elegance comes from: (1) one bespoke visual world reused everywhere; (2) a warm cream canvas (~#FFFDF9) with one deep green hero panel; (3) enormous confident type (custom grotesk, 88px, -4% tracking, weight ~575, sentence case); (4) motion as punctuation — things settle in on arrival, loops are small and local.

Sonae's translation of that, agreed with Anthony:

- Light cream canvas, ink text, brand orange accent, and the three vertical pastels already used in-app (sage `#b9dcc4`, sand `#f0d8a8`, blush `#f6ccbe`).
- No claymation budget — our craft is **SVG + motion choreography in code**, plus real product screenshots/recordings in browser frames.
- Two bespoke animated metaphors: the **layer stack** (your product on top, Sonae's layers assembling beneath — the pitch, drawn) for the home hero, and the **agent run timeline** (task → tool call → pause at human approval, a click of "yes" → result files into the ledger) for the Platform page. Per-showcase micro-animations: Rightmove link cascading into property cards; numbers assembling into a board report; a dot-skeleton mirroring a figure.

## Information architecture

- `/` **Home** — hero ("Launch AI products, not AI experiments." + layer-stack animation) → benefit sections → three product cards as proof (screenshots) → how much is already built → trust strip → 備え closing beat → contact CTA.
- `/platform` — the capability story in plain English: assistant on your own knowledge, agents with approvals (agent-run animation), scheduled flows, model-agnostic, what you control. Screenshots in browser frames.
- `/showcase` **Built on Sonae** (index) — opens with the full 備え naming story, then the three products.
  - `/showcase/properties` — adapted from the in-app info page, for a reader who has never logged in. Accent sage.
  - `/showcase/reports` — accent sand. Keep the memory/RAG claims consistent with the in-app info page (see memory: the info page claims memory+RAG deliberately).
  - `/showcase/studio` — accent blush. Privacy story (no video stored) is the lead.
- `/trust` **Trust & Security** — "Ship AI you can stand behind." Approvals, audit ledger, spend ceilings, tenant separation, 3,200+ tests, no-video-stored.
- `/contact` — form: name, email, company (optional), message; honeypot field; per-email rate limit. Stored in a `contactMessages` Convex table first, then forwarded by email — a lead is never lost to a mail failure.

CTAs on public pages route to `/contact` (never into the app). Nav: Platform, Built on Sonae, Trust & Security, Contact, plus Sign in (→ `/login`) and a "Talk to us" primary button.

## Copy rules (from the anthonys-voice skill — load it when writing any public copy)

Plain English, benefit first, British spelling. No balanced triples, no staccato fragments, no punchline endings, vary sentence and card-copy lengths, lead positive, outcomes before architecture. No CSV/RAG jargon on public pages (naming Apify on the properties page is the established exception). Sales surfaces, not documentation.

## Technical constraints (all discovered in this repo — violating any breaks the build)

1. **`ronins.co.uk` is banned from shipped code** (`src/no-client-specific-fallbacks.test.ts` scans src/convex/scripts/messages/public). The footer's Ronins link href comes from `NEXT_PUBLIC_COMPANY_URL`; the contact recipient from Convex env `CONTACT_RECIPIENT_EMAIL`. Unconfigured = name renders unlinked / email dispatch logs a warning and marks the row SIMULATED. Never hardcode either value.
2. **Template boundary (updated 2026-09-13).** The earlier template machinery was removed on 2026-08-09. The supported exporter is now `scripts/strip-verticals.mjs` (`npm run template:build`): `template.verticals.json` declares optional paths and shared-file fences remove their remaining contributions. Arcade always remains in the framework. Keep ownership and fences aligned when editing optional areas; see the [Clean Cut plan](client-product-cut-plan.md) and [cloning guide](../../operator/cloning-sonae.md).
3. **i18n parity test** (`src/i18n.test.ts`): every key in `messages/en.json` must exist in `messages/it.json`. The newer in-app info pages hardcode English copy in TSX instead — follow that pattern for public pages to avoid bloating the message files; anything that does go through messages needs an Italian stub.
4. **Theme scoping**: the app's theme tokens serve the dark dashboard. The public route group must force its light palette locally (scoped CSS variables on the `(public)` layout) without touching the dashboard theme.
5. **Email pattern**: follow `convex/invites.ts` — graceful mock with `console.warn` when `RESEND_API_KEY` is missing, `buildEmailFromAddress` + `sendResendEmail` with an idempotency key when configured.
6. **Convex function wrappers**: unauthenticated surfaces use `publicMutation`/`publicAction` from `convex/tenantFunctions.ts`, which require a written `reason`.
7. `prefers-reduced-motion` must be respected by every animation.
8. Root layout metadata is leftover junk ("Sonae - Protocol" / "Sonae Living Dossier") — replace during Phase 8, plus per-page metadata and OG tags.


## Current state of the home page (2026-07-30, end of the design session)

Order: hero → What Sonae is → demos lead-in → three demo panels → Who it's for → 備え → CTA → footer.

- **Hero.** One forest panel: a wide platform-dashboard screen drawn in code (stat tiles, a self-drawing activity area chart, a stacked runs bar, the approval strip, a run ledger), then the headline band beneath it, then the cream shelf. It was five floating fragments and read as decoration beside the demo panels; the fix was to use the panels' own device — one dense product surface at the same width. Nothing is captured, so there is no fixture branding to re-shoot.
- **Removed:** the capability marquee, the centred "Real products, running today." title card, the pinned `LayerStackScrub` and the `AgentRunTimeline` — the first three duplicated the capability list, and Anthony cut the last two.
- **Demo panels.** All three share one shell (`.ps-demo-full`, `--ps-demo-pad`) so top and bottom padding measure identically down the stack. Each carries a real drawn product screen and a `Built in …` badge (Properties "Built and live inside 1 month", Reports "Built in 1 week", Studio "Built in 1 month"). The Studio figure uses the in-app MediaPipe geometry — pose, face mesh and 21-point hands.
- **Contact.** Every CTA routes through `_components/ContactLink.tsx`, which reads `NEXT_PUBLIC_CONTACT_URL` and opens externally in a new tab, falling back to `/contact` when unset. **The deployment needs that variable set** or the CTAs fall back to a route that does not exist yet. Note `#` starts a comment in `.env` files — the value must be quoted.
- **Sign in.** `/login` now shares the public tokens and Bricolage via `src/app/login/layout.tsx`; auth behaviour untouched and its six tests still pass.
- **Nav/footer links** are trimmed to routes that exist. Platform, Built on Sonae and Trust & Security return as those pages ship.

### Gotchas that cost real time — do not rediscover

1. **`position: sticky` is broken app-wide by default.** `src/app/layout.tsx` wraps everything in `overflow-x-hidden`; `overflow-x: hidden` computes `overflow-y` to `auto`, making that div a scroll container, so sticky resolves against a box that never scrolls. Fixed narrowly in `public.css` with `div:has(> .public-site) { overflow-x: clip }`. Removing that rule silently stops the demo panels stacking *and* any sticky column. Do not "fix" the root layout instead without checking `Header.tsx`, `AdminRouteSubmenu` and `WidgetConfigTabs`.
2. **Source order beats intent at equal specificity.** `.ps-demo-full` was written above `.ps-panel` and lost; it needs `.ps-panel.ps-demo-full`.
3. **`globals.css` forces `h1` size with `!important`** — set `--h1-size-override` as well as `font-size`, or headings silently render at 24px.
4. **A percentage height on an SVG inside an auto-height parent collapses**, and the SVG falls back to its intrinsic box — that is what dragged the capture stage to 856px.
5. **Do not force `min-height: 100svh` on a hero below desktop.** With the band's `margin-top: auto` overridden the leftover lands *below* the shelf as a slab of dead panel.
6. **WCAG:** white on `--ps-orange` is 2.65:1 and small orange on cream is 2.92:1 — both fail. Use `--ps-orange-ink` for orange type and ink on orange fills.

## Phases

Checkpoints are hard gates: stop and get Anthony's approval before continuing past one.

- [x] **Phase 0 — Design direction (no repo changes).** DONE 2026-07-30. Standing visual reference (keep updating this same artifact URL, never mint a new one): https://claude.ai/code/artifact/30e32660-32bc-46e1-91dc-84a808d33b3d — a full animated home mock: canvas "machine" hero (orbs → funnel → human approval gate → recorded bars), capability marquee, Clay-style slide-over stacked product panels (tinted per product, pill tags with echo rings, two-tone headlines, animated visual cards), dark scroll-scrubbed layer stack under a browser-framed "your product", self-drawing agent-run timeline with approval pause, animated 備え block, film grain, mouse parallax, floating typeface toggle. **Checkpoint outcome:** Anthony — "good start", build it, but MORE designed, with parallax information layers (see Design bar row). GSAP approved; Bricolage default.
- [x] **Phase 1 — Foundation.** DONE 2026-07-30. `src/app/(public)/`: `public.css` (scoped `.public-site` cream theme overriding the dashboard tokens; grain; component classes prefixed `ps-`), layout with Bricolage via next/font, `PublicNav`/`PublicFooter` (env-var Ronins link), `_motion/` (gsap registration + `PublicMotion` handling `[data-reveal]` and `[data-speed]` parallax), gsap dependency installed. Gotchas learned the hard way, do not rediscover: (1) Tailwind v4 arbitrary CSS-var classes need `var()` — `bg-[var(--ps-x)]`, never `bg-[--ps-x]`; (2) globals.css forces `h1` font-size with `!important` — set `--h1-size-override` for big public headlines; (3) the preview/browser pane tooling was broken this session — verification runs headless via a temp Playwright script against the dev server (delete the script after); (4) Next 16 allows one dev server per directory — if port 3000 is taken by another session, verify against it (same working tree) or `next build && next start` on another port.
- [~] **Phase 2b — "What Sonae is" replaces the band below the hero (2026-07-30).** Anthony: the band between hero and product panels was weak, and the section after the hero should elaborate the story rather than index the products. Removed: the capability marquee (its six phrases were the hero subline's list *and* the layer stack's five slabs — the same content three times, delivered as decoration) and the centred "Real products, running today." title card (315px announcing the next section, and it flipped the page's axis to centred right after the hero established a left one). Added `WhatSonaeIs`: a sticky thesis on the left ("The half of your AI product that nobody sees.", lede, a link to `/platform`, and a read-through counter) with five parts passing it on the right, set on hairlines with no cards — the only section on the page deliberately built without boxes. Net effect on the page: −370px of announcing, one section instead of three strips. **NEXT DECISION for Anthony:** this section now does the "what Sonae is" job properly, so the pinned dark `LayerStackScrub` further down is redundant — it spends 3,060px of scroll restating the same five things as flat bars. Recommend retiring it.
  - Gotcha worth keeping: **`position: sticky` does not work anywhere in this app by default.** `src/app/layout.tsx:58` wraps everything in `overflow-x-hidden`; `overflow-x: hidden` computes `overflow-y` to `auto`, making that div a scroll container, so sticky resolves against a box that never scrolls (the window does) and silently never sticks. Fixed narrowly in `public.css` with `div:has(> .public-site) { overflow-x: clip }` — `clip` clips identically without creating a scroll container, and the `:has` scope leaves the dashboard's own sticky headers untouched. Do not "fix" the root layout instead without checking `Header.tsx`, `AdminRouteSubmenu` and `WidgetConfigTabs`.
  - Second gotcha: a sticky column needs its grid item left **stretched** (`align-items: start` collapses it to content height and kills the travel), and the sticky block must be an inner child. It also needs trailing space on the sibling column, or it releases while the last rows are still being read and slides up under the fixed nav.
- [~] **Phase 2a — Header + hero rebuilt against the reference (2026-07-30).** Anthony's reaction to the first home page was that it did not look designed. Clay's own header and hero were measured directly (h1 88px/1.0/−4% weight 575 near-white, left-aligned on a ~720px measure sitting *low* in the panel; subline and buttons in a second column to its right; nav a 59px-content white pill inset from the edges; hero panel `#035d44` with the cream body rising over it under a large top radius). Sonae's versions now follow that composition in `PublicNav` and `ProductHero`: cream nav pill, forest hero panel, a scene in the upper 54%, eyebrow + h1 low-left, subline + two actions right, cream "shelf" with the stat row rising over the panel's floor. Gotchas learned: (1) GSAP overwrites Tailwind's CSS-variable translate utilities, so any element it animates must carry its transform inline (`style={{ transform: "translateX(-50%)" }}`), and the mobile override needs `transform: none !important` to beat GSAP's inline value; (2) the h1 clamp had to come down to `clamp(36px,5.2vw,76px)` for the markup-set two-line break to fit the column at 1440 — 88px wrapped to four lines and collided with the scene; (3) on narrow screens the absolutely-positioned scene must become a single in-flow card with `padding-top` clearing the fixed nav pill, or it lands on top of the type. **Still open:** hero art is composed from the product's own UI (approval card, knowledge, spend ceiling, cropped library, provider tokens) rather than a committed screenshot. Earlier fixture captures were branded "Sonae E2E" / "E2E Company Admin", nearly empty, and are not present in the current repo; the anchor slot is where a real capture drops in at Phase 7. Sections below the hero are untouched and still carry the problems listed in the review: three identical product panels differing only by tint, wireframe visuals under a "real products, running today" heading, and one repeated heading gesture down the page.
- [x] **Phase 2 bug — pinned layer stack buried the page's bottom third.** FIXED 2026-07-30. `LayerStackScrub` pins for `+=240%` but the pin-spacer reserved 0px, because ScrollTrigger switches pin spacing from padding to margin when the pinned element's parent is a flex container and `page.tsx`'s root was `flex flex-col`. The agent-run timeline, the 備え story and the only CTA on the page were laid out inside the stolen scroll and painted under the opaque `z-index: 4` panel. Root is now a plain block; the spacer measures 3060px (900 + 2160) and the CTA and footer are reachable. Do not reintroduce a flex parent above a pinned section.
- [~] **Phase 2 — Home.** Built 2026-07-30, all sections live: product-as-hero, floating governance chips at parallax depths, entrance timeline, scroll-settle, capability marquee, three slide-over product panels (properties: animated link→grid; reports: self-assembling chart with count-up and risk chips; studio), GSAP-pinned layer-stack scrub, agent-run timeline with approval pause, 備え story, closing CTA. Earlier screenshots came from the `next-dev-e2e-auth` fixture build and were not retained in the current repository. KNOWN ITEMS: re-capture with a presentable workspace name before using real screenshots; mobile pass not yet done; `.next` may hold an E2E-mode build — run a plain `npm run build` before any real deployment. **CHECKPOINT: awaiting Anthony's reaction to the built home page.**
- [ ] **Phase 3 — Platform page** with agent-run animation and screenshots.
- [ ] **Phase 4 — Showcase index + three product pages** (備え story opens the index; register paths in template manifest same commit).
- [ ] **Phase 5 — Trust & Security page.**
- [ ] **Phase 6 — Contact.** `contactMessages` table + `convex/contact.ts` (publicMutation, honeypot, 5/hour/email rate limit, scheduler → internalAction email dispatch) + tests + form page. Anthony/agent sets `CONTACT_RECIPIENT_EMAIL` and `NEXT_PUBLIC_COMPANY_URL` on the deployment when ready.
- [ ] **Phase 7 — Screenshots & recordings** captured from the running app via the browser. Needs presentable demo data — ask Anthony which environment to capture from if dev looks empty.
- [ ] **Phase 8 — Hardening.** Root + per-page metadata/OG, template manifest verification, i18n stubs if any keys were added, full test suite, lint, desktop + mobile click-through with screenshots delivered to Anthony.

## History / state

- 2026-07-30: Discussion completed; all decision-log entries agreed. An earlier premature build (route group, all pages in the old dark style, contact backend) was **reverted at Anthony's request** — the repo is clean of it. The Convex contact backend design described in Phase 6 was written and its tests passed before the revert, so treat it as a known-good design to re-implement, not an open question. A parked copy sits in the session scratchpad (`public-site-draft/`) but scratchpads are session-scoped — do not rely on it existing; the copy decisions that matter are recorded here.
- Note: other sessions work in this repo concurrently (recently: sales-report Convex files). Keep the public-site surface isolated and re-check `git status` before committing.
