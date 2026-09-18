import { describe, expect, test, vi } from "vitest";
import { askTextModel, buildDecisionJsonSchema, parseTextModelAnswer } from "./decisionTextProviderService";
import type { TypesafeQuestion } from "./typesafeProviderService";

const kind: TypesafeQuestion = {
  type: "choice",
  instructions: "What kind of email is this?",
  criteria: { customer: "A customer", spam: "Spam", other: null },
};
const urgent: TypesafeQuestion = { type: "noul", instructions: "Is it urgent?" };
const mood: TypesafeQuestion = { type: "score", instructions: "How cross?", criteria: ["Calm", "Cross", "Furious"] };

describe("a Decision answered by a text model", () => {
  test("the schema names every question and every option, so the provider can enforce it", () => {
    const schema = buildDecisionJsonSchema({ kind, urgent, mood }) as {
      properties: { answers: { properties: Record<string, { properties: Record<string, unknown>; required: string[] }>; required: string[] } };
    };
    expect(schema.properties.answers.required).toEqual(["kind", "urgent", "mood"]);
    expect(schema.properties.answers.properties.kind.required).toEqual(["choice", "probabilities"]);
    expect((schema.properties.answers.properties.kind.properties.choice as { enum: string[] }).enum).toEqual(["customer", "spam", "other"]);
    expect(Object.keys((schema.properties.answers.properties.mood.properties.probabilities as { properties: object }).properties)).toEqual(["0", "1", "2"]);
  });

  test("answers come back in TypeSafe's shape, probabilities normalised, confidence from the spread", () => {
    expect(parseTextModelAnswer("urgent", urgent, { noul: 0.9 })).toEqual({ type: "noul", noul: 0.9 });
    const chosen = parseTextModelAnswer("kind", kind, { choice: "spam", probabilities: { customer: 0.1, spam: 0.8, other: 0.1 } });
    expect(chosen).toMatchObject({ type: "choice", choice: "spam" });
    expect((chosen as { confidence: number }).confidence).toBeCloseTo(0.7);
    // Probabilities that do not sum to 1 are normalised; a choice that is not
    // an option gives way to the most probable one.
    const fixed = parseTextModelAnswer("kind", kind, { choice: "junk", probabilities: { customer: 0.2, spam: 0.6, other: 0 } });
    expect(fixed).toMatchObject({ type: "choice", choice: "spam" });
    expect((fixed as { probabilities: Record<string, number> }).probabilities.spam).toBeCloseTo(0.75);
    const scored = parseTextModelAnswer("mood", mood, { probabilities: { "0": 0.2, "1": 0.6, "2": 0.2 } });
    expect(scored).toMatchObject({ type: "score", score: 1, legend: { "0": "Calm", "1": "Cross", "2": "Furious" } });
  });

  test("a half-formed answer is refused, so the engine runs the rule instead", () => {
    expect(() => parseTextModelAnswer("urgent", urgent, {})).toThrow(/yes\/no probability/);
    expect(() => parseTextModelAnswer("kind", kind, { choice: "spam" })).toThrow(/probability per option/);
  });

  test("asks the chosen model once with the schema, and returns usage for the ledger", async () => {
    const generate = vi.fn(async () => ({
      text: JSON.stringify({ answers: { urgent: { noul: 0.92 }, kind: { choice: "customer", probabilities: { customer: 0.9, spam: 0.05, other: 0.05 } } } }),
      inputTokens: 210,
      outputTokens: 30,
    }));
    const model = { modelId: "google:test-text-model", providerKey: "google", providerModelId: "test-text-model" };

    const result = await askTextModel({ model, state: { email: { body: "Hi" } }, questions: { urgent, kind }, generate: generate as never });

    expect(generate).toHaveBeenCalledTimes(1);
    const request = (generate.mock.calls[0] as unknown as [{ model: unknown; jsonSchema: unknown; contents: Array<{ text: string }> }])[0];
    expect(request.model).toBe(model);
    expect(request.jsonSchema).toEqual(buildDecisionJsonSchema({ urgent, kind }));
    expect(request.contents[0].text).toContain('"body": "Hi"');
    expect(result.model).toBe("test-text-model");
    expect(result.usage).toEqual({ inputTokens: 210, outputTokens: 30 });
    expect(result.answers.urgent).toEqual({ type: "noul", noul: 0.92 });
    expect(result.answers.kind).toMatchObject({ type: "choice", choice: "customer" });
  });

  test("no JSON, or a missing answer, is an upstream failure", async () => {
    const model = { modelId: "google:test-text-model", providerKey: "google", providerModelId: "test-text-model" };
    await expect(askTextModel({ model, state: {}, questions: { urgent }, generate: (async () => ({ text: "Sorry, I cannot." })) as never }))
      .rejects.toThrow(/no JSON/);
    await expect(askTextModel({ model, state: {}, questions: { urgent }, generate: (async () => ({ text: '{"answers": {}}' })) as never }))
      .rejects.toThrow(/no answer for 'urgent'/);
  });
});
