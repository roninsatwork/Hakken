# What Hakken sees: the side panel you can talk to — planned 2026-10-31

**Status: drawn and planned 2026-10-31; nothing built; the drawing awaits
Anthony's yes.** Drawing: board "Panel" on the canvas "Conversions page, four
ways" (https://claude.ai/artifact/DexG7cSzEhELxzFvLahQbs), saved at
`docs/plans/assets/conversions-page/Panel.dc.html`. Goes with
`sees-findings-in-code-plan-2026-10-31.md` (code finds, Jev judges, a model
writes), whose findings fill the panel's first section.

## What Anthony asked

- "we may need to look at the bubble approach or a slide out side panel that we
  can talk to"
- "i really like the side panel thing that slides over the top of the screen and
  gives you the info that you can talk to"
- "The eye slides a panel over any page"
- On the chat in the sidebar (my answer, not yet confirmed by him): one chat, two
  ways in — the panel is Ask Hakken, opened on the page you are on.

## Intent

Pressing the eye slides a panel over the right of any page with What Hakken
sees for that page, and you can ask about it there.

## The panel, top to bottom (as drawn)

1. **Its head**: the eye and "What Hakken sees"; under it the page, the website
   and the dates ("Conversions · morehandles.co.uk · Last month"); a close
   button. Escape, the close button or a click on the page behind closes it.
2. **What the figures show**: the page's findings, worked out by code and shown
   at once, most important first, each a line icon and one plain sentence, its
   figures in JetBrains Mono. Clicking one asks about it in the chat.
3. **What it means**: the team's written words and "Do first" steps with their
   links, as the bubble had them, with who wrote it and when. "Hakken is
   researching…" while they are written.
4. **Ask about this page**: an Ask Hakken conversation that starts from this
   page — its findings, figures and dates — answered by Ask Hakken's agent with
   its reads of every screen. A box to ask; the send button; "Saved in Ask
   Hakken, with your other conversations."

The page behind is dimmed; the panel is 480 pixels wide, the full height of the
screen, the box to ask fixed at its foot.

## Rules

- **It replaces the bubble.** The eye opens the panel on every page that has a
  box today; nothing else changes about the eye.
- **One chat.** A conversation started in the panel is an Ask Hakken
  conversation: it shows in Ask Hakken's list and carries on there.
- **Findings appear at once.** Code's findings need no model; the written words
  arrive after; the chat answers at Ask Hakken's speed.
- **The same checks.** The written words keep every Editor check; the chat keeps
  Ask Hakken's own rules (figures from the screens' reads, with links).
- **A page without findings rules yet** shows its rule's words, as the bubble
  does today, and still offers the chat.
- **A new part for the screen kit: `SeesPanel`.** Named here for Anthony, as the
  drawing guide asks. It replaces `SeesBubble`.
- **Credits**: each written bubble and each question spends credits by the
  credits plan, agreed separately; not in this plan.

## Phases

1. **The panel in place of the bubble** (one day): `SeesPanel` in the screen
   kit, opened by the eye over any page, the head, the written words and steps,
   closing by Escape, the button or the page behind; the bubble removed; look
   test and kit example.
2. **What the figures show** (half a day, after phase 1 of the findings plan):
   the code findings at the top, each clickable.
3. **Ask about this page** (one and a half days): an Ask Hakken thread opened
   from the panel with the page as its starting point (the screen, dates,
   country, device, findings and written words as context), the answer streamed
   into the panel, the thread in Ask Hakken's list.
4. **Write it down and check** (half a day): the guide, the screen kit's notes,
   tests, the local gate; commits local.

About three and a half days of agent work for the panel; with the findings plan
(about seven) about ten in all.

## Progress

- 2026-10-31: drawn (board "Panel") and planned. Nothing built.
