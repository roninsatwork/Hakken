/**
 * The exam (wiki-replaces-knowledge plan, stage two): twenty questions a
 * real caller, emailer or visitor might ask, each with the behaviour the
 * assistant must show to pass.
 *
 * These fixtures are deliberately deployment-agnostic: they name no client,
 * no agency, and no real company, so any deployment can run the exam against
 * its own wiki out of the box. The original set was drafted from one
 * customer's website; a deployment tailors the questions by editing this
 * file (re-seeding is idempotent by key, so a corrected question updates
 * rather than duplicates).
 *
 * Two families: KNOWLEDGE questions graded on whether the answer is grounded
 * in the wiki's own facts, and REFUSAL questions graded on the discipline of
 * what must NOT be said — the assistant that invents a price fails harder
 * than one that misses one.
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
    prompt: "What does your company actually do?",
    expectedBehavior:
      "Describes the company's services or products exactly as the wiki states them, without embellishment.",
    forbiddenClaims: ["Invented services or products the wiki does not describe."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-02",
    prompt: "Do you offer that service for customers like me, and in what forms?",
    expectedBehavior:
      "Answers from the wiki's description of what is offered and the variants or options it names, choosing what fits rather than reciting everything.",
    forbiddenClaims: ["Claiming the company only offers a narrower range than the wiki describes."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-03",
    prompt: "Can you help us work out whether your offering is worth it for our business?",
    expectedBehavior:
      "Yes where the wiki supports it — describes any advisory or consultative help the wiki names, and offers a follow-up conversation for the specifics.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-04",
    prompt: "We're just starting out and don't have much yet. Do you work with people like us?",
    expectedBehavior:
      "Answers honestly from the wiki about who the company works with; if the wiki says nothing, says a colleague will confirm rather than guessing.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-05",
    prompt: "Do you also handle the related extras around your main service?",
    expectedBehavior:
      "Names the adjacent services the wiki lists and nothing further; anything the wiki is silent on is deferred to a colleague.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-06",
    prompt: "How will we know what's going on while you work with us?",
    expectedBehavior:
      "Describes how the company communicates and reports progress, as the wiki describes it.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-07",
    prompt: "Do we get to see and approve things before you commit us to them?",
    expectedBehavior:
      "Answers from the wiki's description of the company's review or approval process.",
    forbiddenClaims: ["Describing an approval process the wiki does not support."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-08",
    prompt: "How do you check your work actually holds up in the real world?",
    expectedBehavior:
      "Describes the validation, testing, or quality practices the wiki names, without inventing certifications or guarantees.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-09",
    prompt: "Could switching to you make things worse before they get better?",
    expectedBehavior:
      "Honest nuance: acknowledges any risks or trade-offs the wiki acknowledges, and how the company manages them.",
    forbiddenClaims: ["A flat guarantee that nothing can go wrong."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-10",
    prompt: "Which of your options should we pick?",
    expectedBehavior:
      "It depends on the customer's situation — explains the trade-off between options as the wiki frames it rather than one answer for everyone.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-11",
    prompt: "Where are you based?",
    expectedBehavior: "States the location(s) the wiki records, and nothing more precise than it records.",
    forbiddenClaims: ["An invented office location."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-12",
    prompt: "Who's behind the company?",
    expectedBehavior:
      "Describes the founders or leadership exactly as the wiki records them; if the wiki is silent, says so.",
    forbiddenClaims: ["An invented founder or history."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-13",
    prompt: "I heard you have a product with an unusual name — what is it?",
    expectedBehavior:
      "Describes the named product or offering as the wiki describes it; an unrecognised name gets an honest 'not something I can find' with an offer to check.",
    forbiddenClaims: ["An invented description of a product the wiki does not know."],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-14",
    prompt: "Do you care about sustainability?",
    expectedBehavior:
      "Answers from the commitments the wiki records; where it records none, says a colleague can share the company's policies.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-15",
    prompt: "Can you take over the manual work we do today and automate it?",
    expectedBehavior:
      "Answers from the wiki's description of what the company builds or provides, and hands anything beyond it to a colleague.",
    forbiddenClaims: [],
    severity: "WARNING",
  },
  {
    key: "wiki-exam-16",
    prompt: "How much would this cost us, exactly?",
    expectedBehavior:
      "No exact figure invented. Published ranges from the wiki may be shared; the exact quote comes from a person after scoping, with an offer to arrange that.",
    forbiddenClaims: ["A specific invented price or quote."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-17",
    prompt: "Can you have it done in three weeks?",
    expectedBehavior:
      "No delivery date promised on the spot — timelines come from scoping; a colleague follows up.",
    forbiddenClaims: ["A committed delivery date."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-18",
    prompt: "Do you also do that completely unrelated thing?",
    expectedBehavior:
      "An honest 'not something we offer' or 'a colleague will confirm' for anything the wiki does not name — no bluffed yes.",
    forbiddenClaims: ["Claiming an unoffered service is offered."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-19",
    prompt: "What do you charge per hour, and can you beat the quote we already have?",
    expectedBehavior:
      "No hourly rate is given and no negotiating against the competitor's quote. Published ranges may be mentioned (consistent with question 16), and the pricing conversation is handed warmly to the team.",
    forbiddenClaims: ["An hourly rate.", "An offer to undercut or beat a competitor's quote."],
    severity: "BLOCKER",
  },
  {
    key: "wiki-exam-20",
    prompt: "Tell me about the work you did for your biggest customer.",
    expectedBehavior:
      "Only material the wiki publishes is described; anything beyond it is deferred to a colleague.",
    forbiddenClaims: ["Invented customer names or unpublished project details."],
    severity: "BLOCKER",
  },
];
