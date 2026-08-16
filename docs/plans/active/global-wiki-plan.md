# The Global Brain — the Platform's Own Wiki

Status: **Partially built 2026-08-16.** The platform Wiki shelf, global Wiki
routes, review-first import default, and global page/review/question/progress
doors exist in the current worktree. Answer integration and global staff rounds
remain follow-up work unless their implementation is added later.
Owner: Anthony

Anthony's words, looking at the Global Knowledge Base screen: *"so really
we need to upgrade the global AI to use the same wiki system as the
company ai — note this is a global brain that could be used for everyone
or it could be empty and we only use the company brain."*

So: the platform gets one more brain, at the top. Same wiki, same staff,
same receipts — holding only what is true for **every** company. It may
stay empty forever and nothing changes; the moment it holds a page, that
page can help any company's answers. The model becomes: one platform,
many company brains, one optional shared brain above them.

## Current implementation state (verified 2026-08-16)

- Platform Wiki rows use the same wiki tables as company rows, with absent
  `companyId` meaning the platform scope rather than "all companies."
- `/admin/ai/knowledge`, `/admin/ai/knowledge/[pageId]`, and
  `/admin/ai/knowledge/map` mount the shared Wiki list, detail, and map screens
  in platform mode. `/admin/ai/global-knowledge` redirects to the platform Wiki.
- The AI workspace navigation labels `/admin/ai/knowledge` as Wiki and removes
  the old `/admin/ai/pages` workspace Wiki tab.
- The shared Wiki UI now shows explicit company/platform scope text so users do
  not have to infer whose brain they are editing.
- Platform imports default to review-first. Company imports keep their existing
  default.
- Global read/write doors exist for page list/detail/edit/pin/unpin, distill
  progress, open questions, and pending review decisions in `convex/wiki*.ts`.
  Reads allow `SUPER_ADMIN` and `READ_ONLY`; writes and decisions require
  `SUPER_ADMIN`.
- Company Wikis still live only under `/admin/companies/[id]/ai/pages`.
  Company admins must not see platform rows, and platform functions must not be
  a path into company rows.

## Pre-build baseline (verified 2026-08-16)

This was the state before the first platform Wiki implementation landed. Keep
it as history when checking later work.

- Global knowledge documents already existed as their own shelf:
  `knowledgeDocuments` rows with no company, agent, or thread on them, reachable
  only by super admins (`convex/knowledge.ts`, the `by_global` index and its
  role checks).
- Answering reached that shelf through the old chunk engine: the typed path
  searched company, global, and thread chunks together, with the company arm
  already gated off by the wiki cutover (`convex/ai.ts`). Global and
  thread-scoped chunks were the last users of the chunk engine.
- The Wiki had been company-only by construction: every wiki table carried a
  required `companyId`, every door checked the company wall, and the Distiller
  refused documents without a company.
- The Global Knowledge Base screen
  (`src/app/(dashboard)/admin/ai/global-knowledge/`) still showed chunk counts
  and a retrieval test.

## The rules this brain lives by

1. **Nothing company-specific, ever.** Everything on the global shelf
   reaches every company's answers. Customer pages do not exist at this
   level — the global brain has no CUSTOMER kind.
2. **Review first, by default.** A wrong fact in one company's brain is
   a mistake; in the global brain it is everyone's mistake. Global
   imports go through the Reviewer's checkpoint unless a super admin
   unticks it — the reverse of the company default.
3. **The company's truth wins.** When a company page and a global page
   cover the same subject, the company page is the one the answer
   stands on. The global brain fills gaps; it never overrules.
4. **Empty costs nothing.** No global pages → answering, staff rounds,
   and screens behave exactly as they do today.

## The phases

### Phase 1 — the global shelf (mostly built 2026-08-16)

The wiki tables learn to hold pages with no company on them, the same
way `knowledgeDocuments` already does: `companyId` becomes optional
across the wiki tables, absent meaning "the global brain", with the
existing indexes serving both scopes. Every internal door that takes a
company learns to take "global" instead, and the admin doors for the
global scope are super-admin-gated exactly as the global knowledge doors
are today. The Distiller accepts global documents; the Reviewer's
checkpoint defaults ON for them (rule 2). The CUSTOMER kind is refused
at this level (rule 1).

Acceptance still needed before closing: importing a document as super admin
with no company yields its review, then (approved) its source note, topic pages,
and links, all scoped global; a company import behaves exactly as before; the
personal-data manifest test stays green with no new user-linked fields.

### Phase 2 — answers: company first, global fills gaps (≈0.5 day)

The chooser's index grows a second, marked section: the global pages.
The model reads one index and picks from both shelves; where both cover
a subject, the wall rule in code keeps the company page and drops the
global one before the answer is written (rule 3). Anonymous surfaces
keep their existing restriction (no customer pages — which the global
shelf cannot hold anyway). With global pages in the wiki path, the
global chunk arm retires from typed answering the way the company arm
already did; thread-scoped chunks stay untouched.

Acceptance: a question only the global brain can answer gets answered
with the global page in its evidence; a question both brains cover cites
the company page; with an empty global shelf, answers are byte-for-byte
what they are today; the standing AI Checks pass unchanged.

### Phase 3 — the screen fold (built 2026-08-16; browser proof still needed)

The Global Knowledge Base tab becomes **Wiki**, with the same anatomy
the company side already has: one import box (Review first ticked),
progress, the pages list with kind chips and sources, reviews and open
questions panels, the map, and page detail with receipts and history —
the existing wiki screens taught a "global" mode rather than new
screens. Chunk counters and the retrieval test go the way they went on
the company side. English and Italian together, parity-enforced.

Acceptance still needed before closing: browser proof that the old screen's
route shows the wiki, nothing on it speaks of chunks, every action a super admin
takes lands in the audit trail, and the company screens are pixel-identical to
before.

### Phase 4 — the staff's global round (≈0.5 day)

The seven agents add one round for the global shelf on their existing
rotas — distil, tidy, link, find contradictions, check freshness,
review, file — recorded to their run history like any company round. A
quiet shelf is skipped for free, exactly as quiet companies are (rule
4). The agents' switches govern the global round the same way.

Acceptance: with global pages present, each sweep's global round shows
in the run history; with the shelf empty, no runs are recorded and
nothing is spent.

## Honest bounds

- **No global exam yet.** The company exam guards the cutover that
  already happened; the global shelf starts empty, so there is nothing
  to examine. When the global brain holds material worth guarding, it
  should get its own twenty questions — that is a later, deliberate
  step, not part of this plan.
- The global map draws the same first-400-pages the company map does;
  the shelf is unlikely to reach that soon, but the bound is real.

## Order and size

Phases land in order, each separately, each stoppable. **≈3 build-days.**
Nothing in phase 1–4 changes a company's answers while the global shelf
is empty, so the build carries no risk to the live demo workspace.
