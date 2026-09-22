import { describe, expect, test, vi } from "vitest";
import type { ActionCtx } from "./_generated/server";
import { runDecisions, type RunDecisionsDeps } from "./decisionActions";
import type { DecisionMode } from "./decisionService";
import type { TypesafeAskResult } from "./typesafeProviderService";

/**
 * A stand-in for the Convex action context: modes come from a map, the
 * model resolution from a fixed answer, and every recorded run lands in an
 * array the test reads. No database, no network.
 */
function stubCtx(args: {
  modes: Record<string, DecisionMode>;
  providerKey?: string;
}) {
  const recorded: unknown[] = [];
  // Function references are opaque proxies, so the two queries are told
  // apart by their arguments: only the mode lookup carries `decisionKeys`.
  const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
    if ((queryArgs as { decisionKeys?: string[] })?.decisionKeys) {
      const keys = (queryArgs as { decisionKeys: string[] }).decisionKeys;
      return Object.fromEntries(keys.map((key) => [key, args.modes[key] ?? "OFF"]));
    }
    // No provider named: nothing configured, so resolution reached the failsafe.
    if (!args.providerKey) {
      return { modelId: "test-failsafe-model", providerKey: "google", providerModelId: "test-failsafe-model", source: "failsafe" };
    }
    return {
      modelId: args.providerKey === "typesafe" ? "typesafe:jev-latest" : "google:test-text-model",
      providerKey: args.providerKey,
      providerModelId: args.providerKey === "typesafe" ? "jev-latest" : "test-text-model",
      source: "default",
    };
  });
  const runMutation = vi.fn(async (_ref: unknown, mutationArgs: unknown) => {
    recorded.push(mutationArgs);
    return { runIds: [], costUsd: 0 };
  });
  return { ctx: { runQuery, runMutation } as unknown as ActionCtx, recorded, runQuery, runMutation };
}

const state = { company: { name: "Comax" }, email: { from: "a@b.c", subject: "Hi", body: "Hello" } };
const subject = { kind: "email", id: "gmail-1" };

const typesafeAnswers: TypesafeAskResult = {
  model: "jev-latest",
  answers: {
    "mailbox.message-kind": { type: "choice", choice: "spam", probabilities: { spam: 0.9, customer: 0.08, other: 0.02 }, confidence: 0.8 },
    "mailbox.urgent": { type: "noul", noul: 0.55 },
  },
  usage: { inputTokens: 300, outputTokens: 40 },
};

describe("runDecisions", () => {
  test("a switched-off Decision runs its rule and never asks", async () => {
    const { ctx, recorded } = stubCtx({ modes: { "mailbox.message-kind": "OFF" }, providerKey: "typesafe" });
    const ask = vi.fn<NonNullable<RunDecisionsDeps["ask"]>>();

    const results = await runDecisions(ctx, {
      subject,
      state,
      requests: [{ key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) }],
    }, { ask });

    expect(ask).not.toHaveBeenCalled();
    expect(results["mailbox.message-kind"]).toMatchObject({
      verdict: "RULES",
      source: "RULES",
      fallbackReason: "MODE_OFF",
      outcome: "RECORDED",
      certainty: null,
      answer: { kind: "pick-one", choice: "customer" },
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      subjectKind: "email",
      subjectId: "gmail-1",
      runs: [{ decisionKey: "mailbox.message-kind", answer: "customer", source: "RULES", fallbackReason: "MODE_OFF" }],
    });
    expect(recorded[0]).not.toHaveProperty("usage");
  });

  test("switched-on Decisions are asked together in one request, and each gets its own verdict", async () => {
    const { ctx, recorded } = stubCtx({
      modes: { "mailbox.message-kind": "ACT", "mailbox.urgent": "ACT" },
      providerKey: "typesafe",
    });
    const ask = vi.fn(async () => typesafeAnswers);

    const results = await runDecisions(ctx, {
      subject,
      state,
      requests: [
        { key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) },
        { key: "mailbox.urgent", fallback: () => ({ kind: "yes-no", yes: false }) },
      ],
    }, { ask });

    expect(ask).toHaveBeenCalledTimes(1);
    const [askArgs] = ask.mock.calls[0] as unknown as [{ model: string; questions: Record<string, unknown> }];
    expect(askArgs.model).toBe("jev-latest");
    expect(Object.keys(askArgs.questions)).toEqual(["mailbox.message-kind", "mailbox.urgent"]);

    // Spam at 0.9 with a 0.82 gap: sure, low stakes → acts, and the skip is the action.
    expect(results["mailbox.message-kind"]).toMatchObject({
      verdict: "ACT",
      outcome: "ACTED",
      certainty: "SURE",
      source: "TYPESAFE",
      action: "skipped the email as spam",
    });
    // Urgent at 0.55: not sure → the verdict is a person's, but nothing
    // hangs on this answer, so there is nothing to hand over: recorded.
    expect(results["mailbox.urgent"]).toMatchObject({
      verdict: "ASK_A_PERSON",
      outcome: "RECORDED",
      certainty: "NOT_SURE",
      answer: { kind: "yes-no", yes: true, probability: 0.55 },
    });

    expect(recorded[0]).toMatchObject({
      usage: { modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", inputTokens: 300, outputTokens: 40 },
      runs: [
        { decisionKey: "mailbox.message-kind", answer: "spam", certainty: "SURE", outcome: "ACTED", action: "skipped the email as spam" },
        { decisionKey: "mailbox.urgent", answer: "yes", certainty: "NOT_SURE", outcome: "RECORDED" },
      ],
    });
    const urgentRun = (recorded[0] as { runs: Array<{ probabilities?: string; action?: string }> }).runs[1];
    expect(JSON.parse(urgentRun.probabilities ?? "{}")).toEqual({ yes: 0.55, no: 0.45 });
    expect(urgentRun.action).toBeUndefined();
  });

  test("ASK_A_PERSON hands over even a sure answer", async () => {
    const { ctx } = stubCtx({ modes: { "mailbox.message-kind": "ASK_A_PERSON" }, providerKey: "typesafe" });
    const results = await runDecisions(ctx, {
      subject,
      state,
      requests: [{ key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) }],
    }, { ask: async () => typesafeAnswers });
    expect(results["mailbox.message-kind"]).toMatchObject({ verdict: "ASK_A_PERSON", outcome: "HANDED_TO_PERSON", certainty: "SURE" });
  });

  test("a text model chosen for the job answers the same questions, on its own certainty scale", async () => {
    const { ctx, recorded } = stubCtx({ modes: { "mailbox.message-kind": "ACT", "mailbox.urgent": "ACT" }, providerKey: "google" });
    const ask = vi.fn<NonNullable<RunDecisionsDeps["ask"]>>();
    const askText = vi.fn(async () => typesafeAnswers);

    const results = await runDecisions(ctx, {
      subject,
      state,
      requests: [
        { key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) },
        { key: "mailbox.urgent", fallback: () => ({ kind: "yes-no", yes: false }) },
      ],
    }, { ask, askText });

    expect(ask).not.toHaveBeenCalled();
    expect(askText).toHaveBeenCalledTimes(1);
    expect((askText.mock.calls[0] as unknown as [{ model: { providerKey: string } }])[0].model.providerKey).toBe("google");
    // The same spam spread (0.82 gap) is only "fairly sure" on a text model's
    // scale; low stakes still act, and the row says which path answered.
    expect(results["mailbox.message-kind"]).toMatchObject({ source: "TEXT_MODEL", certainty: "FAIRLY_SURE", verdict: "ACT", outcome: "ACTED" });
    expect(recorded[0]).toMatchObject({
      usage: { modelId: "google:test-text-model", providerKey: "google" },
      runs: [{ source: "TEXT_MODEL", certainty: "FAIRLY_SURE" }, { source: "TEXT_MODEL" }],
    });
  });

  test("nothing configured at all: the rule answers and the row says NO_MODEL", async () => {
    const { ctx, recorded } = stubCtx({ modes: { "mailbox.message-kind": "ACT" } });
    const ask = vi.fn<NonNullable<RunDecisionsDeps["ask"]>>();
    const results = await runDecisions(ctx, {
      subject,
      state,
      requests: [{ key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) }],
    }, { ask });
    expect(ask).not.toHaveBeenCalled();
    expect(results["mailbox.message-kind"]).toMatchObject({ verdict: "RULES", source: "RULES", fallbackReason: "NO_MODEL", mode: "ACT" });
    expect(recorded[0]).toMatchObject({ runs: [{ fallbackReason: "NO_MODEL" }] });
  });

  test("TypeSafe failing: the rule answers, nothing throws, the row says PROVIDER_FAILED", async () => {
    const { ctx, recorded } = stubCtx({ modes: { "mailbox.message-kind": "ACT" }, providerKey: "typesafe" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const results = await runDecisions(ctx, {
        subject,
        state,
        requests: [{ key: "mailbox.message-kind", fallback: () => ({ kind: "pick-one", choice: "customer" }) }],
      }, { ask: async () => { throw new Error("overloaded"); } });
      expect(results["mailbox.message-kind"]).toMatchObject({ verdict: "RULES", fallbackReason: "PROVIDER_FAILED" });
      expect(recorded[0]).not.toHaveProperty("usage");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("an unregistered key is a caller error", async () => {
    const { ctx } = stubCtx({ modes: {} });
    await expect(runDecisions(ctx, {
      subject,
      state,
      requests: [{ key: "nowhere.nothing", fallback: () => ({ kind: "yes-no", yes: false }) }],
    })).rejects.toThrow(/Unknown decision/);
  });

  test("one Decision asked about several things in one call: each request has its own id and result", async () => {
    const { ctx, recorded } = stubCtx({ modes: { "wiki.page-answers-question": "ACT" }, providerKey: "typesafe" });
    const ask = vi.fn(async (request: { questions: Record<string, unknown> }) => ({
      model: "jev-latest",
      answers: Object.fromEntries(Object.keys(request.questions).map((id, index) => [id, { type: "noul", noul: index === 0 ? 0.95 : 0.05 }])),
      usage: { inputTokens: 100, outputTokens: 10 },
    }));

    const results = await runDecisions(ctx, {
      subject: { kind: "wikiPages", id: "a|b" },
      state: { question: "Opening hours?", pages: {} },
      requests: [
        { key: "wiki.page-answers-question", id: "POLICY:hours", fallback: () => ({ kind: "yes-no", yes: true }) },
        { key: "wiki.page-answers-question", id: "PRODUCT:widgets", fallback: () => ({ kind: "yes-no", yes: true }) },
      ],
    }, { ask: ask as never });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(Object.keys((ask.mock.calls[0] as unknown as [{ questions: Record<string, unknown> }])[0].questions)).toEqual(["POLICY:hours", "PRODUCT:widgets"]);
    expect(results["POLICY:hours"]).toMatchObject({ answer: { yes: true }, verdict: "ACT" });
    expect(results["PRODUCT:widgets"]).toMatchObject({ answer: { yes: false }, verdict: "ACT", outcome: "ACTED" });
    expect((recorded[0] as { runs: unknown[] }).runs).toHaveLength(2);
  });

  test("asking one Decision twice without ids is a caller error", async () => {
    const { ctx } = stubCtx({ modes: {} });
    await expect(runDecisions(ctx, {
      subject, state,
      requests: [
        { key: "mailbox.urgent", fallback: () => ({ kind: "yes-no", yes: false }) },
        { key: "mailbox.urgent", fallback: () => ({ kind: "yes-no", yes: false }) },
      ],
    })).rejects.toThrow(/its own id/);
  });
});
