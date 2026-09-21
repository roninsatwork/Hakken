# The Two Brains — How the Global AI and the Company AIs Relate

Status: **Standing architecture document**, written 2026-08-17 at
Anthony's instruction after the routing-rule discussion, delivered the
same day. This is the reference for how the levels relate; the plans
that built the pieces are named where they apply.
Owner: Anthony

## The model

Hakken has one platform brain and many company brains, and they are
genuinely independent — the global AI is not merely a shelf that feeds
companies, it is a complete AI in its own right.

**The global AI** (Manage Global AI) is the platform's own apparatus,
owned by no company: its own rules and system prompt (rows with no
company), its own knowledge (the Platform Wiki), the models everything
runs on, chat logs across the platform, and its own front door — the
global widget, whose conversations create threads with **no company**.
Those are the global AI's own conversations, answered from the global
brain alone.

**A company AI** wraps the global one: a company thread answers from
the global system prompt + global rules + the company's rules + the
company wiki first, with the Platform Wiki filling gaps. The company's
truth always beats the platform's on the same subject. Global feeds
every company; no company feeds global.

**SaaS mode** is not a switch but a posture: a product built on Hakken
where company wikis stay empty and every answer comes from the global
brain. The platform already answers correctly in this posture; this
document exists because the FEEDBACK side had to learn it too.

## The routing rule (Anthony's ruling, 2026-08-17)

When a question ends with no pages under the answer, whose gap is it?

1. **Company wiki has pages** → the company's gap, on the company's
   couldn't-answer list, with their import button. Their knowledge,
   their miss.
2. **Company wiki is empty** → the company was answering purely from
   the global brain, so the miss strengthens the global knowledge: one
   platform row, counting the distinct companies that hit it ("asked
   14× across 6 companies" — counted, never named on screen). Feed the
   global wiki once and the row closes for everyone.
3. **No company at all** (the global widget, a platform check) → the
   platform's gap, directly.

A row on the platform list resolves itself when a later identical
asking is answered from a platform page. The platform list is visible
to super admins alone — who can already read every company's chat logs,
so it exposes nothing new.

## What follows from the model

- **Companyless threads read the Platform Wiki.** The global chunk
  search retires for them on the same content-carried cutover companies
  had. (This was a bug until 2026-08-17: the global AI's own front door
  was bypassing the global brain.)
- **The loop runs at both levels.** Usage marks land on platform pages;
  the platform has its own couldn't-answer list under the routing rule;
  the platform brain's week goes to the super admins as one bell; and
  the Examiner works a platform round, drafting platform checks from
  the platform's resolved gaps.
- **Gaps live on a dedicated Unanswered screen, at two heights**
  (Anthony's rulings, 2026-08-17): each company's AI menu carries its
  own, and the platform console reaches the cross-everything view
  through the Instructions menu — every gap in one table, each row
  naming whose it is. No panels.
- **Platform checks are first-class.** `companyEvalCases` rows with no
  company are the platform's exam: super-admin only, run through a
  companyless thread against the global brain alone, PROPOSED drafts
  inert until approved, shown on the Platform Wiki screen. This
  retires the "no global exam" bound from global-wiki-plan.md — the
  exam now grows exactly when the global brain starts doing real work.
- **The wall stands.** A company's wiki, questions and answers appear
  only inside that company's section. The platform list counts
  companies; it never names them on screen. Nothing here weakened the
  2026-08-16 visibility ruling — the routing rule moves *whose job the
  fix is*, not who may see whose data.

## The lesson this document encodes

The feedback loop was first built company-only, on the assumption that
the global level was a passive shelf. Anthony's questions ("what if the
whole platform works off the global wiki, like a SaaS?") exposed the
assumption and a real bug behind it. When a question arrives about how
the levels relate, the answer is here — and scope decisions between the
levels are Anthony's to make, discussed before they are coded.
