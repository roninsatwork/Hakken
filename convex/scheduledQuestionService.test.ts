import { describe, expect, test } from "vitest";
import {
  ANSWER_CHANGE_THRESHOLD,
  hasAnswerChanged,
  isScheduledQuestionInterval,
  measureAnswerChange,
  normaliseAnswer,
} from "./scheduledQuestionService";

/**
 * A watcher is only useful if it stays quiet. The same question asked twice
 * never comes back byte-identical, so the thing worth pinning is that
 * rewording is silence and new substance is not.
 */
describe("has the answer moved", () => {
  test("the same answer reworded and repunctuated is not a change", () => {
    const before = "The depot closes at 4pm on Fridays.";
    const after = "the depot closes at 4pm on fridays";
    expect(hasAnswerChanged(before, after)).toBe(false);
  });

  test("the same sentences in a different order are not a change", () => {
    // A model reordering paragraphs has not changed its answer; edit
    // distance would say it had, which is why this compares word sets.
    const before = "We sell to Tesco. We do not sell to Aldi.";
    const after = "We do not sell to Aldi. We sell to Tesco.";
    expect(hasAnswerChanged(before, after)).toBe(false);
  });

  test("a different answer is a change", () => {
    const before = "The depot closes at 4pm on Fridays.";
    const after = "The depot now stays open until 8pm every weekday and all weekend.";
    expect(hasAnswerChanged(before, after)).toBe(true);
  });

  test("the first answer is never a change", () => {
    // Otherwise every question would alert once, for free, on setup.
    expect(hasAnswerChanged(undefined, "Anything at all")).toBe(false);
  });

  test("an answer becoming empty counts as a change", () => {
    expect(hasAnswerChanged("We sell to twelve groups.", "")).toBe(true);
  });
});

describe("measuring the difference", () => {
  test("identical substance measures zero", () => {
    expect(measureAnswerChange("Same words here", "same words here!")).toBe(0);
  });

  test("nothing in common measures one", () => {
    expect(measureAnswerChange("alpha beta", "gamma delta")).toBe(1);
  });

  test("a small addition stays under the threshold", () => {
    const before = "We sell to Tesco Watford Sainsburys Bath Morrisons Leeds and Asda York";
    const after = "We sell to Tesco Watford Sainsburys Bath Morrisons Leeds and Asda York today";
    expect(measureAnswerChange(before, after)).toBeLessThan(ANSWER_CHANGE_THRESHOLD);
  });
});

describe("normalising", () => {
  test("strips punctuation and collapses whitespace", () => {
    expect(normaliseAnswer("  Hello,   THERE!!  ")).toBe("hello there");
  });

  test("keeps letters and numbers from any language", () => {
    expect(normaliseAnswer("Prezzo: 4pm — cinquanta")).toBe("prezzo 4pm cinquanta");
  });
});

describe("intervals", () => {
  test("only the three offered intervals are accepted", () => {
    expect(isScheduledQuestionInterval("weekly")).toBe(true);
    expect(isScheduledQuestionInterval("hourly")).toBe(false);
    expect(isScheduledQuestionInterval(undefined)).toBe(false);
  });
});
