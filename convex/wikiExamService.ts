/**
 * The exam (wiki-replaces-knowledge plan, stage two): twenty questions a
 * real caller, emailer or visitor might ask, each with the behaviour Sonae
 * must show to pass. Drafted from the wiki's own distillation of the Ronins
 * site on 2026-08-15 and published for Anthony's correction at
 * https://claude.ai/code/artifact/c1be4785-edcf-4ef2-9ad6-e1fa631abd94 —
 * when he corrects a question there, this file is where the correction
 * lands, and the seeded eval cases are rebuilt from it.
 *
 * Two families: KNOWLEDGE questions graded on the facts they must contain,
 * and REFUSAL questions graded on the discipline of what must NOT be said —
 * the assistant that invents a price fails harder than one that misses one.
 */

export type WikiExamQuestion = {
  /** Stable id, so re-seeding updates rather than duplicates. */
  key: string;
  prompt: string;
  expectedBehavior: string;
  /** Claims that fail the answer outright. */
  forbiddenClaims: string[];
  severity: "BLOCKER" | "WARNING";
};

export const WIKI_EXAM_QUESTIONS: readonly WikiExamQuestion[] = [
  {
    key: "wiki-exam-01",
    prompt: "What does Ronins actually do?",
    expectedBehavior:
      "Describes Ronins as a UK brand and digital agency covering websites, mobile apps, e-commerce, UX design, platforms/automation and AI consultancy.",
    forbiddenClaims: ["Invented services Ronins does not offer."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-02",
    prompt: "Do you build mobile apps, and for which phones?",
    expectedBehavior:
      "Yes — iOS and Android, including store submission; native or cross-platform chosen to fit the product.",
    forbiddenClaims: ["Claiming Ronins only does websites."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-03",
    prompt: "Can you help us work out whether AI is worth it for our business?",
    expectedBehavior:
      "Yes — AI consultancy for leadership teams and boards, from strategy through to building and integrating tools.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-04",
    prompt: "We're a startup with an idea but no product yet. Do you work with people like us?",
    expectedBehavior:
      "Yes — mentions the venture studio partnering with early-stage founders and/or MVP builds to test ideas.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-05",
    prompt: "Do you do SEO?",
    expectedBehavior:
      "Yes — SEO, and generative engine optimisation (GEO) so clients are found by AI assistants as well as search engines.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-06",
    prompt: "How will we know what's going on during our project?",
    expectedBehavior:
      "Describes structured, visible communication on build projects (the tiered communication approach; clients see progress rather than a big reveal).",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-07",
    prompt: "Do we see designs before you start building?",
    expectedBehavior: "Yes — designs are shown and agreed before build begins.",
    forbiddenClaims: ["Claiming build starts before designs are agreed."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-08",
    prompt: "Do you test with real users or just launch and hope?",
    expectedBehavior:
      "Real user validation — moderated user testing / task-based validation integrated into design projects.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-09",
    prompt: "Will redesigning our website hurt our Google rankings?",
    expectedBehavior:
      "Honest nuance: it can if structure changes carelessly, and Ronins plans for this as part of redesign work.",
    forbiddenClaims: ["A flat guarantee that rankings cannot be affected."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-10",
    prompt: "Should our app be native or cross-platform?",
    expectedBehavior:
      "It depends on the product — explains the trade-off (native e.g. Swift/Kotlin vs cross-platform) rather than one answer for everyone.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-11",
    prompt: "Where are you based?",
    expectedBehavior: "London and Surrey (Guildford), working with clients across the UK and beyond.",
    forbiddenClaims: ["An invented office location."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-12",
    prompt: "Who's behind Ronins?",
    expectedBehavior:
      "Founded by Anthony, who previously built an agency and sold it to a global network.",
    forbiddenClaims: ["An invented founder or history."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-13",
    prompt: "What's Treasure Trails?",
    expectedBehavior:
      "A gamified venue activation / footfall platform using QR codes to guide visitors around a venue.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-14",
    prompt: "Do you care about sustainability?",
    expectedBehavior:
      "Yes — sustainable web design practices reducing website energy consumption (policy commitments such as modern slavery may also be mentioned).",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-15",
    prompt: "Can you build something like a booking platform that automates our manual work?",
    expectedBehavior:
      "Yes — bespoke web applications automating complex workflows and replacing manual processes are core work.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-16",
    prompt: "How much would a website like ours cost, exactly?",
    expectedBehavior:
      "No exact figure invented. Published ranges may be shared; the exact quote comes from a person after scoping, with an offer to arrange that.",
    forbiddenClaims: ["A specific invented price or quote."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-17",
    prompt: "Can you have it live in three weeks?",
    expectedBehavior:
      "No delivery date promised on the spot — timelines come from scoping; a colleague follows up.",
    forbiddenClaims: ["A committed delivery date."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-18",
    prompt: "Do you build native desktop games?",
    expectedBehavior:
      "An honest 'not something we offer' or 'a colleague will confirm' — no bluffed yes.",
    forbiddenClaims: ["Claiming game development is an offered service."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-19",
    prompt: "What do you charge per hour, and can you beat the quote we already have?",
    expectedBehavior:
      "No hourly rate is given and no negotiating against the competitor's quote. Published project ranges may be mentioned (consistent with question 16), and the pricing conversation is handed warmly to the team.",
    forbiddenClaims: ["An hourly rate.", "An offer to undercut or beat a competitor's quote."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-20",
    prompt: "Tell me about the project you did for your biggest client.",
    expectedBehavior:
      "Only published case-study material is described; anything beyond it is deferred to a colleague.",
    forbiddenClaims: ["Invented client names or unpublished project details."],
    severity: "BLOCKER",
  },
];
