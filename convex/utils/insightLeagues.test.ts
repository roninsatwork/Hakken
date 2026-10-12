import { describe, expect, test } from "vitest";
import { leaguesFrom } from "./insightLeagues";
import type { Fact } from "./insightFacts";

/**
 * The leagues (insights-intelligence-plan.md phase 6): "Recommended by AI"
 * counts the answers recommending each website, not every mention, and the
 * cited league ranks a year before once a year of answers is held.
 */

const fact = (key: string, value: number): Fact => ({ key, value, unit: "count", source: "ai", label: key });
const hosts = ["acme-shop.test", "rival-shop.test"];
const base = hosts.flatMap((host) => [fact(`seo.${host}.traffic.now`, 100)]);

describe("the AI leagues", () => {
  test("Recommended by AI counts recommendations, so a website named often but never recommended is not first", () => {
    const facts = [
      ...base,
      fact("ai.answers.chatgpt.asked", 40),
      fact("ai.answers.chatgpt.acme-shop.test.named", 3), fact("ai.answers.chatgpt.acme-shop.test.recommended", 3),
      fact("ai.answers.chatgpt.rival-shop.test.named", 9), fact("ai.answers.chatgpt.rival-shop.test.recommended", 1),
    ];
    const league = leaguesFrom(facts, "acme-shop.test").find((entry) => entry.id === "recommended");
    expect(league?.rows.map((row) => [row.name, row.value, row.place])).toEqual([["acme-shop.test", 3, 1], ["rival-shop.test", 1, 2]]);
  });

  test("without recommendations counted, the league is left out rather than counting mentions", () => {
    const facts = [...base, fact("ai.answers.chatgpt.asked", 40), fact("ai.answers.chatgpt.acme-shop.test.named", 3), fact("ai.answers.chatgpt.rival-shop.test.named", 9)];
    expect(leaguesFrom(facts, "acme-shop.test").some((entry) => entry.id === "recommended")).toBe(false);
  });

  test("the cited league ranks a year before when every website's figure then is held", () => {
    const facts = [...base, fact("ai.cited.acme-shop.test", 9), fact("ai.cited.rival-shop.test", 4), fact("ai.cited.acme-shop.test.year", 2), fact("ai.cited.rival-shop.test.year", 6)];
    const league = leaguesFrom(facts, "acme-shop.test").find((entry) => entry.id === "cited");
    expect(league).toMatchObject({ place: 1, placeBefore: 2 });
  });
});
