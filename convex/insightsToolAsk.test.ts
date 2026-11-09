import { describe, expect, test } from "vitest";
import { sentBackTurns } from "./insightsToolAsk";

describe("sending an answer back", () => {
  test("what the agent wrote goes first, then why it goes back", () => {
    const turns = sentBackTurns("{\"says\":[]}", "It said nothing.");

    expect(turns.map((turn) => turn.role)).toEqual(["model", "user"]);
    expect(turns[0].parts).toEqual([{ text: "{\"says\":[]}" }]);
    expect(turns[1].parts?.[0].text).toContain("The Editor sent it back: It said nothing.");
  });

  test("an empty reply is left out, as the newer models refuse a turn with no words", () => {
    for (const reply of ["", "  \n "]) {
      const turns = sentBackTurns(reply, "It did not reply with the JSON asked for.");
      expect(turns.map((turn) => turn.role)).toEqual(["user"]);
    }
  });
});
