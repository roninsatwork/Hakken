import { describe, expect, it } from "vitest";
import { answerAlertWords, answerMet, answerTitle, engineOf, rankingAlertWords, rankingMet, rankingTitle } from "./hakkenWatches";

/** Alerts on AI answers and Google rankings (hakken-tasks-plan.md, item 4.3). */
describe("an alert on an AI answer or a ranking", () => {
  it("counts an answer by its newest stance", () => {
    expect(["RECOMMENDED", "NAMED", "WARNED_AGAINST", "NOT_NAMED"].map((stance) => answerMet(stance as never, "notRecommended"))).toEqual([false, true, true, true]);
    expect(answerMet("NOT_NAMED", "notNamed")).toBe(true);
    expect(answerMet("NAMED", "notNamed")).toBe(false);
    expect(answerMet("WARNED_AGAINST", "warnedAgainst")).toBe(true);
  });

  it("counts a ranking by its newest position; no position is out of every top", () => {
    expect([rankingMet(2, { op: "outOfTop", position: 3 }), rankingMet(4, { op: "outOfTop", position: 3 }), rankingMet(null, { op: "outOfTop", position: 3 })]).toEqual([false, true, true]);
    expect([rankingMet(3, { op: "intoTop", position: 3 }), rankingMet(null, { op: "intoTop", position: 3 })]).toEqual([true, false]);
  });

  it("says itself and its alerts in plain words", () => {
    expect(answerTitle({ prompt: "best web design agency uk", engine: "chatgpt", watch: "notRecommended" })).toBe("Tell me if ChatGPT stops recommending us for “best web design agency uk”");
    expect(rankingTitle({ keyword: "web design surrey", op: "outOfTop", position: 3 }, "example.co.uk")).toBe("Tell me if example.co.uk drops out of Google’s top 3 for “web design surrey”");
    expect(answerAlertWords({ prompt: "best agency", engine: "perplexity", watch: "notRecommended" }, "NAMED", "2026-10-05", "example.co.uk"))
      .toEqual({ headline: "Perplexity stopped recommending you for “best agency”", body: "Its newest answer, on Monday 5 October, named example.co.uk without recommending it." });
    expect(rankingAlertWords({ keyword: "web design surrey", op: "outOfTop", position: 3 }, 7, "2026-10-05", "example.co.uk").body).toBe("When it was checked on Monday 5 October, it was at position 7.");
  });

  it("reads an engine as people write it", () => {
    expect([engineOf("ChatGPT"), engineOf("chat gpt"), engineOf("Perplexity"), engineOf("perplexity.ai"), engineOf(undefined)]).toEqual(["chatgpt", "chatgpt", "perplexity", "perplexity", "chatgpt"]);
  });
});
