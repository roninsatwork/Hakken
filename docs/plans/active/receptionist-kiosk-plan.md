# The Receptionist Screen

Status: **Built and tested 2026-08-14; browser-proven on dev, tablet proof
outstanding.** `/kiosk/[widgetId]` serves any widget that opts in via the
new Receptionist screen toggle (Integration tab): full screen, tap to
wake, the live Vertex voice loop on an anonymous ticket gated by the
conversation's own widget token, permanent AI disclosure and recording
notice, silence nudge then reset, in-memory tokens so no visitor can see
another's conversation, hourly per-widget session ceiling, overnight
self-reload, and a heartbeat surfaced on the admin screen ("last seen",
session count). Verified live on dev: idle screen, wake tap, thread and
ticket minted, and — with the microphone refused — the calm "Back
shortly." reset rather than an error (commitment 3). What remains of
Phase D is the real tablet at the front desk for a day, which is
Anthony's half.
Phase 6 of the showcase channels roadmap (`showcase-channels-plan.md`).
Depends on: `voice-session-plan.md` complete (and reads better with
`voice-languages-plan.md` live).
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## Current implementation state (verified 2026-08-16)

The receptionist screen implementation now exists in the app. `/app/reception`
lists active kiosk-enabled widgets for the current workspace, and
`/kiosk/[widgetId]` serves a full-screen visitor surface only when the backing
widget is active and has opted in through the widget Integration section.

The kiosk page mints a fresh anonymous widget-style thread and in-memory access
token per wake tap, creates a Google Vertex relay voice session through
`convex/kioskActions.ts`, records completed spoken turns back to the kiosk
thread, sends idle heartbeats, shows a permanent AI/recording disclosure, nudges
after silence, resets for the next visitor, and reloads while idle overnight.
Convex now holds per-widget kiosk session, thread-minting, heartbeat, and
message caps. What remains is operational Phase D proof on a real tablet at the
front desk for a sustained run.

## The decision

A tablet or monitor at a reception desk or trade-show stand, showing the
moving sound-shape full screen. Visitors walk up and just talk. It is
deliberately the last phase: it adds presentation, not capability, and it
benefits from every earlier phase being solid. It is also the piece that
travels — the same screen works at a client's front desk the day their
clone ships.

Recorded decisions:

1. **The kiosk is a widget, presented differently.** It borrows the whole
   anonymous-visitor machinery the embedded widget already has — widget
   identity, per-conversation access tokens, company plan quota — rather
   than inventing a second anonymous surface. One anonymous door, two
   frames.
2. **Tap to wake, then hands-free turns.** Browsers refuse microphone and
   audio until a person gestures, so the idle screen invites a tap; from
   that tap the session runs the voice loop hands-free, listening after
   each spoken reply. A wake word ("Hey Hakken") is out of scope — it
   fights browser audio policy and adds nothing the tap doesn't.
3. **It forgets between visitors.** A quiet timeout ends the session:
   captions clear, a fresh conversation starts for the next visitor, and
   nothing one visitor said is visible to the next. The transcript is
   still kept server-side like any widget conversation, under the same
   retention rules.

## Pre-build baseline (verified 2026-08-13)

The following notes record the state before the receptionist screen was built.
Keep them as historical context for the implementation choices; do not treat
them as the current product state.

**The anonymous full-screen precedent exists and is exactly the right
shape.** `/w/[widgetId]` (`src/app/w/[widgetId]/page.tsx`, 492 lines) is
the repo's one shell-free, auth-free, `h-screen` page: no sidebar, no
dashboard chrome, root layout only. The Next middleware protects only
`/admin`, `/app`, `/demos` (`src/proxy.ts:11`) — new top-level routes are
anonymous by default, deliberately.

**Anonymous conversations are a solved problem.** `createWidgetThread`
(`convex/widgets.ts:336`) mints a thread plus an access token whose hash
alone is stored; the client holds the raw token in `localStorage`;
`sendMessage` and `getMessages` accept it. Quota lands on the owning
company's plan through `thread.companyId`
(`resolveChatQuota`, `convex/chatService.ts:121-154`), refusals are
polite and reason-free for anonymous visitors, and per-thread rate
limiting exists (10 messages/minute, `convex/chatService.ts:105-113`).

**The widget's iframe already anticipates voice.** `public/embed.js` sets
`iframe.allow = "microphone"` — unused today, waiting.

**Voice comes from Phase 1.** The session loop, `synthesizeSpeech`, the
sound-shape component, and the captions are `voice-session-plan.md`
deliverables; this plan requires them built as shareable components, not
welded into the dashboard assistant screen.

**One embarrassment to fix in passing.** The widget references a
notification chime whose file does not exist
(`src/app/w/[widgetId]/page.tsx:76` → `public/sounds/pop.mp3`; there is
no `public/sounds/` directory). The kiosk needs real audio assets anyway;
the ghost chime gets fixed or removed.

## Design commitments (binding on every phase)

1. **No navigation exists on the kiosk.** No links, no menu, no way to
   leave the surface from the screen itself. Configuration happens in the
   admin widget screens, never on the kiosk.
2. **The disclosure is permanent.** "You're talking to {company}'s AI
   assistant" stays on screen throughout — umbrella commitment 7 — plus a
   one-line "conversations are recorded" notice, since passers-by have not
   read a privacy policy.
3. **A kiosk failure is quiet and self-healing.** Lost network, quota
   exhaustion, or a synthesis failure shows a calm "back shortly" idle
   state and keeps retrying; it never shows an error stack to a visitor
   or requires a person with a keyboard.
4. **The kiosk spends like the widget it is.** Company plan quota,
   per-thread rate limits, and the anonymous refusal copy all apply
   unchanged; a kiosk cannot be a quota side-channel.
5. **Idle means idle.** Between visitors the microphone is closed — the
   idle screen listens for nothing; only the wake tap opens it.

## Phase A — The kiosk surface

**Goal:** a full-screen, anonymous, widget-identified page that holds a
typed conversation — the bones before the voice.

- New route `/kiosk/[widgetId]` beside `/w/[widgetId]`, reusing the same
  widget checks (active widget, `createWidgetThread`, token handling) with
  a kiosk enable flag on the widget config so a widget must opt in to
  being a kiosk.
- Full-screen layout: the shape placeholder, captions area, disclosure
  line, idle screen with the tap-to-wake invitation. No navigation
  (commitment 1).
- The admin widget screen gains the kiosk toggle and a "open kiosk" link
  for setting up the device.
- Tests: kiosk flag off → refusal page, anonymous thread creation, quota
  refusal copy renders in the calm idle style.

## Phase B — Voice on the kiosk

**Goal:** the walk-up-and-talk loop.

- The Phase-1 session loop mounts on the kiosk surface: wake tap unlocks
  audio and microphone once (decision 2), then hands-free turns — listen,
  think, speak, listen — with the sound-shape live and captions rolling.
- The languages behaviour arrives free when `voice-languages-plan.md` is
  live, and a reception desk is where it shines; the demo script includes
  a non-English exchange when that phase has shipped.
- Silence handling: no speech for a short window → a gentle "still
  there?" prompt; continued silence → session ends (Phase C reset).
- Tests: the turn loop against the widget token path, microphone-refused
  fallback to a typed input, mid-session quota exhaustion → calm wind-down.

## Phase C — It resets itself

**Goal:** an unattended device that is always ready for the next visitor.

- Inactivity reset (decision 3): configurable quiet timeout → captions
  clear, thread ends, fresh thread on next wake; the localStorage token
  rotates so a later visitor can never scroll an earlier conversation.
- Daily housekeeping: the page reloads itself in idle hours so a kiosk
  left running for a week stays fresh (memory, updated deploys).
- Kiosk health surfaced for staff, not visitors: the admin widget screen
  shows last-seen and session counts, so a dead tablet in reception is
  noticed from a desk.
- Tests: reset clears visitor state completely, token rotation, reload
  scheduling logic.

## Phase D — Proof

- Live on dev on a real tablet: walk-up conversation, walk away, watch it
  reset, second visitor gets a clean session; pull the network cable and
  watch the calm idle state; restore and watch it recover unaided.
- Done when a tablet can sit at the studio's front desk for a full day —
  visitors talking to it, nobody baby-sitting it — and Anthony can pack
  the same tablet for a trade show that evening.

## Out of scope, recorded

- Wake words and always-on listening (decision 2 records why).
- Camera, face detection, or presence sensing of any kind.
- Payments, printing, badge scanning, or any hardware integration.
- A native app or kiosk-mode OS management (the browser page is the
  product; locking the device down is the venue's device policy).
- Multiple simultaneous kiosks per widget — nothing prevents it, nothing
  is built for it; revisit if a client asks.
