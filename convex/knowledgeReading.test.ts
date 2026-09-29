import { describe, expect, test, vi } from "vitest";
import type { ActionCtx } from "./_generated/server";
import type { DecisionMode } from "./decisionService";
import { PASSAGE_DECISION_KEY, knowledgeCutOff } from "./knowledgeReading";
import type { TypesafeAskResult } from "./typesafeProviderService";

/**
 * The knowledge cut-off (docs/plans/active/knowledge-relevance-cutoff-plan.md)
 * in each mode, over a stand-in action context: the mode from a value, the
 * Decisions job answered by TypeSafe, and every recorded run kept for the
 * test to read. No database, no network.
 */
function stubCtx(mode: DecisionMode | Error) {
  const recorded: Array<{ subjectKind: string; runs: Array<Record<string, unknown>> }> = [];
  const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
    if ((queryArgs as { decisionKeys?: string[] })?.decisionKeys) {
      if (mode instanceof Error) throw mode;
      return { [PASSAGE_DECISION_KEY]: mode };
    }
    return { modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", source: "default" };
  });
  const runMutation = vi.fn(async (_ref: unknown, mutationArgs: unknown) => {
    recorded.push(mutationArgs as (typeof recorded)[number]);
    return { runIds: [], costUsd: 0 };
  });
  return { ctx: { runQuery, runMutation } as unknown as ActionCtx, recorded, runQuery };
}

const passages = [
  { id: "chunk-hours", text: "The office opens at 9am on weekdays.", document: "Handbook" },
  { id: "chunk-parking", text: "Staff parking is behind the building.", document: "Handbook" },
  { id: "chunk-maybe", text: "Opening times vary on bank holidays.", document: "Notices" },
];

/** TypeSafe's answers: a sure yes, a sure no, and a no it is not sure of. */
const answers = vi.fn(async (): Promise<TypesafeAskResult> => ({
  model: "jev-latest",
  answers: {
    "chunk-hours": { type: "noul", noul: 0.97 },
    "chunk-parking": { type: "noul", noul: 0.02 },
    "chunk-maybe": { type: "noul", noul: 0.45 },
  },
  usage: { inputTokens: 900, outputTokens: 12 },
}));

describe("the knowledge cut-off", () => {
  test("Off asks nothing, records nothing and leaves nothing out", async () => {
    const { ctx, recorded, runQuery } = stubCtx("OFF");
    const ask = vi.fn();

    const judge = await knowledgeCutOff(ctx, { question: "When does the office open?" }, { ask });

    expect(judge).toBeUndefined();
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  test("a mode that cannot be read means no cut-off, never less reading", async () => {
    const { ctx } = stubCtx(new Error("database unavailable"));
    expect(await knowledgeCutOff(ctx, { question: "When does the office open?" })).toBeUndefined();
  });

  test("Acts on its own: one request, and only a sure enough no is left out", async () => {
    const { ctx, recorded } = stubCtx("ACT");
    const ask = answers;
    ask.mockClear();

    const judge = await knowledgeCutOff(ctx, { question: "When does the office open?" }, { ask });
    const leftOut = await judge!(passages);

    expect([...leftOut]).toEqual(["chunk-parking"]);
    expect(ask).toHaveBeenCalledTimes(1);
    const [request] = ask.mock.calls[0] as unknown as [{ state: { question: string; passages: Record<string, unknown> }; questions: Record<string, unknown> }];
    expect(Object.keys(request.questions)).toEqual(["chunk-hours", "chunk-parking", "chunk-maybe"]);
    expect(request.state.question).toBe("When does the office open?");
    expect(request.state.passages["chunk-hours"]).toEqual({ document: "Handbook", text: "The office opens at 9am on weekdays." });

    // One record per passage, each naming its own passage.
    expect(recorded).toHaveLength(1);
    expect(recorded[0].subjectKind).toBe("knowledgeChunk");
    expect(recorded[0].runs.map((run) => [run.subjectId, run.answer, run.outcome])).toEqual([
      ["chunk-hours", "yes", "RECORDED"],
      ["chunk-parking", "no", "ACTED"],
      ["chunk-maybe", "no", "HANDED_TO_PERSON"],
    ]);
  });

  test("Ask a person, the trial: every answer recorded, nothing left out", async () => {
    const { ctx, recorded } = stubCtx("ASK_A_PERSON");

    const judge = await knowledgeCutOff(ctx, { question: "When does the office open?" }, { ask: answers });
    const leftOut = await judge!(passages);

    expect(leftOut.size).toBe(0);
    expect(recorded[0].runs.map((run) => [run.subjectId, run.answer])).toEqual([
      ["chunk-hours", "yes"],
      ["chunk-parking", "no"],
      ["chunk-maybe", "no"],
    ]);
  });

  test("TypeSafe failing keeps every passage", async () => {
    const { ctx, recorded } = stubCtx("ACT");
    const ask = vi.fn(async () => {
      throw new Error("529 overloaded");
    });

    const judge = await knowledgeCutOff(ctx, { question: "When does the office open?" }, { ask });
    const leftOut = await judge!(passages);

    expect(leftOut.size).toBe(0);
    expect(recorded[0].runs.every((run) => run.source === "RULES" && run.fallbackReason === "PROVIDER_FAILED")).toBe(true);
  });
});
