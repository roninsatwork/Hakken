# Brand names, business profile and known competitors — set by each company

**Started 2026-09-28. Status: built on dev 2026-09-28, not yet reviewed —
decided that these move to the company level; §3 taken as recommended at
Anthony's word ("keep going i will review at the end"), for him to review.
§7 says how it was built and where that differs from §3.** Reverses V3 of
[private searches and questions](private-tracking-lists-plan.md) ("What stays
shared — facts about the website itself", agreed 2026-09-26) and the decisions
behind it: brand names on the shared website record
([brands, places and AI citations](brands-places-and-ai-citations-plan.md),
2026-09-21, "These are brand names for the website"), and the record holding
brand names, sector and the competition graph
([websites screens rebuild](websites-screens-rebuild-plan.md), 2026-09-22 and
2026-09-23). Those plans are records of what was decided then; this one
supersedes them on these three points. Change a decision here, with a date,
before building anything that disagrees with it. Follow `AGENTS.md`: draw the
screens first, no code until Anthony agrees.

Anthony, 2026-09-28, showing the shared website record's Profile and Known
competitors tabs (Admin → Websites → ronins.co.uk): "i think i have made some
bad product decisions too … i think these need to be set at the company level
… can you adjust your plan to move these from here into the company level
please".

## 1. What moves

The shared record — the `websites` row every company watching a host reads —
holds three things today that one company sets for all of them:

| | What it is | Where it lives | What it drives |
|---|---|---|---|
| **Brand names** | "The names people use for this business. We look for them in AI answers." Up to five, one primary, some marked as misspellings. | `websites.brandNames` | **Which AI answers count as naming the site.** Every mention, stance (recommended, warned against), share of voice, the Mentions page, the Overview's AI figures, rivals suggested from answers, the *Competitor* and *Name* moves on the to-do list. |
| **What this business is** | Sector, where it sells, what the business does. | `websites.sector`, `marketLabel`, `businessDescription` | **Only the AI judgments**: whether a discovered site is a real competitor, what a search is for, what kind of page a page is, and which page answers a fan-out search. No screen but the Profile tab shows it; nothing suggests starting searches from it yet, though the tab says it does. |
| **Known competitors** | "Competitors seen for this website across the platform. For reference only." | `websiteRivals` | **Nothing.** Only the tab itself and one preview in Admin → Websites → Add read it. Each company already chooses its own competitors on its Competitors tab, and every competitor figure is worked out from those. |

## 2. What it means, plainly

- **Brand names are the hard one.** An AI answer is bought once and shared by
  every company asking that question, and it is read once, against everyone's
  brand names. If two companies can name the same website differently, the
  same answer has to be read once per company, with that company's names, and
  everything counted from it — mentions, stances, share of voice, the moves —
  counted per company. That is local work: **nothing extra is bought from
  DataForSEO.** The stance judgment (recommended, warned against) runs per
  company per mention, so its AI cost grows with the number of companies
  asking the same question — today one, so pence.
- **The business profile only feeds AI judgments.** Per company, each
  judgment reads the profile of the company it is judging for. Two judgments
  are stored once for everyone today — what a search is for, and what kind of
  page a page is — and cannot take one company's profile without handing its
  view to the rest; §3 (CL4) proposes judging those two without a profile.
- **Known competitors is already company level** everywhere it matters: each
  company's Competitors tab. The shared graph is reference only, so the plan
  retires it rather than copying it.

## 3. Decisions for Anthony

| # | Question | Recommendation | Days: recommended | Days: the other choice | Status |
|---|---|---|---|---|---|
| CL0 | Company level | **Decided, 2026-09-28**: brand names, the business profile and known competitors stop being shared; each company sets its own. | — | — | Decided (Anthony, 2026-09-28) |
| CL1 | Once per company, or per website within it | **Per website, on the company's own screen for it** — its own websites and the competitors it watches alike, as the searches and questions moved on 2026-09-26: Korda sets kordatackle.com's names and profile, and the names it knows each rival by. The other choice: one set per company for all its websites — simpler, but a company with two brands, or any competitor, has nowhere to put different names. | — | about ½ less | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL2 | How answers are read | **Once per company that asks the question, with that company's names** — the answer still bought once. Mentions, stances and every count built from them gain the company, as the lists did; another company's names are never read. | 3 | none | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL3 | What each company starts with | **A copy of today's shared names and profile**, for every company holding the website, so nothing changes on the day it lands; they part only when one company edits. Answers already held are read again per company from the stored answer text — no purchase; the stance judgment runs again only if switched on. | ½ | none | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL4 | The two judgments stored for everyone | **Judged without any company's profile**: what a search is for (shared by every company, one judgment per search) and what kind of page a page is (one per website page), from the search or address alone. The judgments made per company — a real competitor, which page answers a fan-out search — read that company's own profile. The other choice: judge both per company, paying for each once per company. | ½ | 2 | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL5 | Known competitors | **Retire the shared graph**: its tab and the Add website preview go, nothing new is written to it, and it is deleted once empty of readers. A company's competitors stay on its own Competitors tab, as today. | ½ | none | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL6 | What the shared website record keeps | **Its address, who watches it, and delete** — the *Profile* and *Known competitors* tabs go. Its note says names and profile are set by each company on its screen for the website. | ½ | none | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |
| CL7 | Where a company sets them | **A new *Profile* tab on the company's screen for each website** — beside Overview, Competitors and Results for its own site, and beside Overview and Rankings for a competitor — with the brand names (misspellings marked, as the list already stores them) and, for its own sites, the business profile. Drawn first, with Korda's and Ronins' real names. | 1 | none | Taken as recommended, 2026-09-28 ("keep going i will review at the end") |

**As recommended: about six days** — seven with the drawings — after the
decisions and the drawing are agreed.

## 4. Found while mapping it (2026-09-28)

Facts worth knowing whichever way the decisions go:

- **Saving the Profile tab turns every misspelling into a plain name.** The
  editor sends a name and whether it is primary, never its kind, so a
  misspelling added by a *Name* move comes back as a name on the next save.
  The company-level editor (CL7) keeps the kind.
- **The *Name* move reads mentions from every company's questions.** It
  counts a site's mentions by website, not by the company's own questions.
  Company level (CL2) fixes this by construction.
- **The business profile falls back across companies.** A site with no
  profile of its own borrows the profile of the site any company compares it
  with (`describeBusinessForJudging`). Per company, it borrows only from the
  company's own pairing.
- **"Seen in results" competitors are written only when a person accepts a
  suggestion or takes a move**, not by discovery itself, as the websites
  rebuild plan said.
- **Nothing suggests starting searches or questions from the profile** yet,
  though the Profile tab says it does.

## 5. Phases

| Phase | What | Size |
|---|---|---|
| — | Draw the company's Profile tab and the slimmed shared record (CL7, CL6) | Half a day |
| 1 | Names and profile on each hold, copied from the shared record (CL1, CL3); the company Profile tab (CL7) | One and a half days |
| 2 | Answers read per company with its own names; mentions, stances and every count per company (CL2); stored answers read again | Three days |
| 3 | Judgments read the company's profile, or none for the two shared ones (CL4) | Half a day |
| 4 | Known competitors retired, the shared record slimmed (CL5, CL6); the old fields and table removed once nothing reads them | Half a day |

Each phase ends with its tests and the full gate. The tenancy guard gains
the new per-company fields, as it gained the lists: a company's names for a
website are read only through its own hold.

## 6. Risks

- **Counts change when names part.** Once two companies name one website
  differently, the same answer can count as a mention for one and not the
  other. That is the point, but figures compared across companies stop
  agreeing; none of Hakken's screens compares them.
- **A competitor's names become each company's job.** Today one company
  naming a rival serves everyone watching it; after, each company names its
  own rivals, or their mentions go uncounted — as share of voice already says
  of a rival with no names.
- **Re-reading stored answers.** Answer texts are kept, so every answer can be
  read again per company; a raw answer older than 30 days is not needed for
  it.

## 7. How it was built (2026-09-28)

- **Where they live.** Each company's names and business profile for a
  website are a `holdProfiles` row on its hold (`convex/holdProfileSchema.ts`,
  `convex/holdProfiles.ts`), set on a new *Profile* tab on the company's
  screen for the website (CL7) — names with misspellings marked, and for its
  own websites sector, market and what the business does. Built without a
  drawing first.
- **CL2, read once rather than once per company — same result, one read.**
  An answer is read once against every name any company holds for any
  website; each mention records every name found in it (`aiAnswers.mentions`,
  `aiCitations.mentionedTexts`), and each company then counts a mention only
  under one of its own names (`answersSeenBy`, `holdNamedIn`). No company's
  names reach another's screens. The stance (recommended, warned against) is
  judged once per answer and website, as before, and each company counts it
  under the same rule; it is not judged again per company.
- **CL3, differs: answers already held are not read again.** Every company
  started with the same copy, so every count is right on the day. Answers
  filed before 2026-09-28 carry no record of every name found, and keep
  counting as they did — under the shared names as they stood — even after a
  company edits its own. Only answers filed from now follow the edit. Reading
  the stored answers again is possible (their text is kept) and is a
  follow-up if wanted.
- **Name moves are not drawn any more.** The *Name* move suggested adding a
  near-miss spelling found in answers. With each company's names its own, a
  spelling that is not this company's can only be another company's name for
  the site, so suggesting it would show one company another's names. A *Name*
  move raised before, if taken, adds the spelling to the company's own names.
- **CL4 as recommended.** What a search is for is judged from the search
  alone; what kind of page a page is, from its address alone. Whether a found
  site is a real competitor, and which page answers a fan-out search, read the
  judging company's own profile — for a competitor with none, the profile of
  the company's own site it is watched against, never another company's.
  Competitor discovery, bought once, is judged once per way companies
  describe the site (`describeWebsiteHoldsForJudging`).
- **CL5 and CL6, done on dev.** The copy ran first (17 company websites, 16
  with names); then the shared record's names and profile were cleared (16
  websites) and the shared competitor graph emptied (15 links); then the
  fields, the index and the `websiteRivals` table left the schema. The shared
  record's screen keeps *Watched by*, with a note saying names and profile
  are set by each company. The migrations are retired, with how to recover in
  `convex/dataMigrations.ts`.
- **Tenancy guard.** `websiteTenancyGuard.test.ts` gains a fourth rule: a
  profile names its hold and is read only through it, but for the answer
  reader's one read of every name; and the shared record carries none of them.
- **Limits.** Five names per website per company (unchanged); a sector or
  market up to 120 characters; what the business does up to 600; each answer
  is read against the names of up to 2,000 company websites (it was 2,000
  websites while names were shared); up to 200 companies holding one website
  are described for one discovery judgment.

## Change log

- **2026-09-28** — Plan written after Anthony's "i think these need to be set
  at the company level", from a mapping of every place the three are written
  and read. CL0 recorded as decided; CL1–CL7 await Anthony. The fan-out page
  judge (fan-out-angles-plan.md, FA4) reads the website's shared profile until
  this lands, then the company's own.
- **2026-09-28** — CL1–CL7 taken as recommended, to be built now and reviewed
  at the end (Anthony: "keep going i will review at the end"); the Profile
  tab is built without a drawing first, for the same reason.
- **2026-09-28** — Built on dev: §7. Two differences from §3 — answers
  already held are not read again (CL3), and *Name* moves are no longer drawn
  — for Anthony's review.
